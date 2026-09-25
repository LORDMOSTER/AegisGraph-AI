import logging
import os
import tempfile
import time
import uuid
import json
import re
import asyncio

from fastapi import APIRouter, File, HTTPException, UploadFile, status, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.api.deps import get_db_session, get_current_active_user
from app.models.user import User
from app.models.hierarchy import Manual, Section, SubCategory, Rule, FilteredBlock
from app.services.ingestion.pdf_parser import NoDigitalTextError, extract_blocks_stream
from app.services.llm.rule_extractor import extract_structured_rule
from app.services.llm.grounding_check import verify_grounding, extract_numbers_and_units

logger = logging.getLogger(__name__)
router = APIRouter()

def normalize_text(text: str) -> str:
    """Lowercase and strip punctuation for deduplication."""
    return re.sub(r'[^\w\s]', '', text.lower()).strip()

async def get_next_sequence_for_section(db: AsyncSession, prefix: str) -> int:
    stmt = select(Rule).filter(Rule.rule_code.like(f"{prefix}-%")).order_by(desc(Rule.rule_code)).limit(1)
    result = await db.execute(stmt)
    latest_rule = result.scalar_one_or_none()
    
    if latest_rule:
        try:
            seq = int(latest_rule.rule_code.split('-')[1])
            return seq + 1
        except Exception:
            pass
    return 1

@router.post(
    "/pdf",
    summary="Upload and parse a digital PDF manual with pipelined LLM structuring",
)
async def ingest_pdf(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    """POST /api/ingest/pdf — Upload, parse, structure, and stream progress."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only PDF files are accepted."
        )

    # Duplicate check
    stmt = select(Manual).where(Manual.company_id == current_user.company_id, Manual.title == file.filename)
    result = await db.execute(stmt)
    if result.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A manual with this filename has already been uploaded."
        )

    content = await file.read()
    suffix = f"_{uuid.uuid4().hex[:8]}.pdf"
    
    UPLOAD_DIR = os.path.join(os.getcwd(), "uploads")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    saved_file_path = os.path.join(UPLOAD_DIR, f"{current_user.company_id}_{file.filename}")
    with open(saved_file_path, "wb") as f:
        f.write(content)
        
    IMAGE_DIR = os.path.join(UPLOAD_DIR, "images")
    os.makedirs(IMAGE_DIR, exist_ok=True)

    async def event_generator():
        tmp_path = None
        producer_task = None
        try:
            yield f"data: {json.dumps({'message': 'Initializing upload...'})}\n\n"
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp_path = tmp.name
                tmp.write(content)

            yield f"data: {json.dumps({'message': 'Parsing PDF structure...'})}\n\n"
            
            queue = asyncio.Queue()
            producer_task = asyncio.create_task(extract_blocks_stream(tmp_path, queue, IMAGE_DIR))

            manual = Manual(
                company_id=current_user.company_id,
                title=file.filename,
                version="1.0",
                file_path=saved_file_path
            )
            db.add(manual)
            await db.flush()

            existing_rules_normalized = set()
            sections_cache = {}
            subcats_cache = {}

            structured_count = 0

            while True:
                item = await queue.get()
                
                if item["type"] == "progress":
                    yield f"data: {json.dumps({'message': f'Parsed page {item['page']}/{item['total']}...'})}\n\n"
                
                elif item["type"] == "error":
                    yield f"data: {json.dumps({'error': item['error']})}\n\n"
                    break
                    
                elif item["type"] == "done":
                    skipped_pages = item.get("pages_needing_ocr", [])
                    msg = "Processing complete!"
                    if skipped_pages:
                        msg = f"Processing complete! {len(skipped_pages)} pages had no selectable text and were skipped."
                    
                    await db.commit()
                    yield f"data: {json.dumps({'message': msg, 'done': True})}\n\n"
                    break
                    
                elif item["type"] == "block":
                    source_text = item["text"]
                    page_num = item["page_number"]
                    is_noise = item["is_noise"]
                    images = item.get("images", [])
                    
                    if is_noise:
                        fb = FilteredBlock(
                            manual_id=manual.id,
                            source_text=source_text,
                            page_number=page_num,
                            reason=item["reason"]
                        )
                        db.add(fb)
                        continue
                        
                    structured_count += 1
                    yield f"data: {json.dumps({'message': f'Structuring rule {structured_count}...'})}\n\n"
                    
                    norm_src = normalize_text(source_text)
                    if norm_src in existing_rules_normalized:
                        continue

                    structured = await extract_structured_rule(source_text)
                    
                    if not structured or not structured.is_valid_rule or not structured.rules:
                        fb = FilteredBlock(
                            manual_id=manual.id,
                            source_text=source_text,
                            page_number=page_num,
                            reason="Rejected by LLM Structuring"
                        )
                        db.add(fb)
                        continue

                    for extracted_rule in structured.rules:
                        rule_text = extracted_rule.rule_text
                        
                        source_entities = extract_numbers_and_units(source_text)
                        rule_entities = extract_numbers_and_units(rule_text)
                        hallucinated = rule_entities - source_entities
                        
                        confidence = 1.0
                        review_status = "approved"
                        if hallucinated:
                            confidence = 0.4
                            review_status = "pending"

                        norm_rule = normalize_text(rule_text)
                        if norm_rule in existing_rules_normalized:
                            continue
                        existing_rules_normalized.add(norm_rule)
                        
                        sec_name = extracted_rule.section[:255]
                        if sec_name not in sections_cache:
                            sec = Section(manual_id=manual.id, name=sec_name)
                            db.add(sec)
                            await db.flush()
                            sections_cache[sec_name] = sec
                        section = sections_cache[sec_name]

                        sub_name = extracted_rule.subcategory[:255]
                        if (section.id, sub_name) not in subcats_cache:
                            sc = SubCategory(section_id=section.id, name=sub_name)
                            db.add(sc)
                            await db.flush()
                            subcats_cache[(section.id, sub_name)] = sc
                        subcat = subcats_cache[(section.id, sub_name)]

                        prefix = sec_name[:4].upper()
                        seq = await get_next_sequence_for_section(db, prefix)
                        rule_code = f"{prefix}-{seq:03d}"
                        
                        rule = Rule(
                            subcategory_id=subcat.id,
                            rule_code=rule_code,
                            text=rule_text,
                            source_text=source_text,
                            risk_score=extracted_rule.risk_score,
                            cognitive_level=extracted_rule.cognitive_level,
                            response_time_sec=60,
                            confidence=confidence,
                            review_status=review_status,
                            page_number=page_num,
                            reference_images=images
                        )
                        db.add(rule)
                        await db.flush()

        except Exception as e:
            logger.error(f"Ingest failed: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            if producer_task and not producer_task.done():
                producer_task.cancel()
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

    return StreamingResponse(event_generator(), media_type="text/event-stream")


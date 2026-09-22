import logging
import os
import tempfile
import time
import uuid
import json
import re

from fastapi import APIRouter, File, HTTPException, UploadFile, status, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.api.deps import get_db_session, get_current_active_user
from app.models.user import User
from app.models.hierarchy import Manual, Section, SubCategory, Rule, FilteredBlock
from app.services.ingestion.pdf_parser import NoDigitalTextError, extract_text_from_pdf
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
    summary="Upload and parse a digital PDF manual with LLM structuring",
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

    # Need to read to temp file immediately
    content = await file.read()
    suffix = f"_{uuid.uuid4().hex[:8]}.pdf"
    
    UPLOAD_DIR = os.path.join(os.getcwd(), "uploads")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    saved_file_path = os.path.join(UPLOAD_DIR, f"{current_user.company_id}_{file.filename}")
    with open(saved_file_path, "wb") as f:
        f.write(content)

    
    async def event_generator():
        tmp_path = None
        try:
            yield f"data: {json.dumps({'message': 'Initializing upload...'})}\n\n"
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp_path = tmp.name
                tmp.write(content)

            yield f"data: {json.dumps({'message': 'Parsing PDF structure...'})}\n\n"
            
            try:
                extraction_result = await extract_text_from_pdf(tmp_path)
            except NoDigitalTextError as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                return

            chunks = extraction_result.chunks
            filtered_blocks = extraction_result.filtered_blocks
            
            yield f"data: {json.dumps({'message': f'Extracted {len(chunks)} blocks, filtered {len(filtered_blocks)} noise blocks.'})}\n\n"

            # 1. Save Manual
            manual = Manual(
                company_id=current_user.company_id,
                title=file.filename,
                version="1.0",
                file_path=saved_file_path
            )
            db.add(manual)
            await db.flush()

            # 2. Save Filtered Blocks
            for block in filtered_blocks:
                fb = FilteredBlock(
                    manual_id=manual.id,
                    source_text=block["text"],
                    page_number=block["page_number"],
                    reason=block["reason"]
                )
                db.add(fb)
            
            # Cache for dedup and sections
            existing_rules_normalized = set()
            sections_cache = {}
            subcats_cache = {}

            # Process valid blocks
            total = len(chunks)
            processed_count = 0
            
            for i, chunk in enumerate(chunks):
                processed_count += 1
                source_text = chunk["text"]
                page_num = chunk["page_number"]
                
                yield f"data: {json.dumps({'message': f'Structuring rule {processed_count} of {total}...'})}\n\n"
                
                # Deduplication check before LLM (fast path)
                norm_src = normalize_text(source_text)
                if norm_src in existing_rules_normalized:
                    continue

                structured = await extract_structured_rule(source_text)
                
                if not structured or not structured.is_valid_rule or not structured.rules:
                    # Save to filtered blocks if LLM rejects it
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
                    
                    # Grounding check
                    source_entities = extract_numbers_and_units(source_text)
                    rule_entities = extract_numbers_and_units(rule_text)
                    hallucinated = rule_entities - source_entities
                    
                    confidence = 1.0
                    review_status = "approved"
                    if hallucinated:
                        confidence = 0.4
                        review_status = "pending"

                    # Deduplication on final rule text
                    norm_rule = normalize_text(rule_text)
                    if norm_rule in existing_rules_normalized:
                        continue
                    existing_rules_normalized.add(norm_rule)
                    
                    # Resolve Section
                    sec_name = extracted_rule.section
                    if sec_name not in sections_cache:
                        sec = Section(manual_id=manual.id, name=sec_name)
                        db.add(sec)
                        await db.flush()
                        sections_cache[sec_name] = sec
                    section = sections_cache[sec_name]

                    # Resolve Subcategory
                    sub_name = extracted_rule.subcategory
                    if (section.id, sub_name) not in subcats_cache:
                        sc = SubCategory(section_id=section.id, name=sub_name)
                        db.add(sc)
                        await db.flush()
                        subcats_cache[(section.id, sub_name)] = sc
                    subcat = subcats_cache[(section.id, sub_name)]

                    # Generate Rule Code
                    prefix = sec_name[:4].upper()
                    seq = await get_next_sequence_for_section(db, prefix)
                    rule_code = f"{prefix}-{seq:03d}"
                    
                    # Add Rule
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
                        page_number=page_num
                    )
                    db.add(rule)
                    
                    # Flush periodically or after each to ensure sequential codes are safe
                    await db.flush()

            await db.commit()
            yield f"data: {json.dumps({'message': 'Processing complete!', 'done': True})}\n\n"

        except Exception as e:
            logger.error(f"Ingest failed: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except OSError:
                    pass

    return StreamingResponse(event_generator(), media_type="text/event-stream")


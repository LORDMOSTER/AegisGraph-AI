import logging
from typing import List
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
import json
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import get_db_session
from app.models.question_bank import QuestionVariant
from app.models.hierarchy import Rule, SubCategory, Section, Manual
from app.models.schemas import QuestionVariantResponse, QuestionVariantUpdate, FlatQuestionVariantResponse
from app.services.llm.generator import generate_question_variants

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/", response_model=List[FlatQuestionVariantResponse])
async def get_all_questions(db: AsyncSession = Depends(get_db_session)):
    stmt = (
        select(QuestionVariant)
        .options(
            selectinload(QuestionVariant.rule)
            .selectinload(Rule.subcategory)
            .selectinload(SubCategory.section)
            .selectinload(Section.manual)
        )
    )
    result = await db.execute(stmt)
    variants = result.scalars().all()
    
    response = []
    for v in variants:
        response.append({
            "id": v.id,
            "rule_id": v.rule_id,
            "question_text": v.question_text,
            "options": v.options,
            "correct_option_index": v.correct_option_index,
            "bloom_level": v.bloom_level,
            "confidence": v.confidence,
            "review_status": v.review_status,
            "manualTitle": v.rule.subcategory.section.manual.title,
            "sectionName": v.rule.subcategory.section.name,
            "subcategoryName": v.rule.subcategory.name,
            "rule_text": v.rule.text,
            "rule_code": v.rule.rule_code
        })
    return response

@router.put("/{variant_id}", response_model=QuestionVariantResponse)
async def update_question(
    variant_id: uuid.UUID,
    update_data: QuestionVariantUpdate,
    db: AsyncSession = Depends(get_db_session)
):
    stmt = select(QuestionVariant).where(QuestionVariant.id == variant_id)
    result = await db.execute(stmt)
    variant = result.scalar_one_or_none()
    
    if not variant:
        raise HTTPException(status_code=404, detail="Question variant not found")
        
    update_dict = update_data.model_dump(exclude_unset=True)
    for k, v in update_dict.items():
        setattr(variant, k, v)
        
    await db.commit()
    await db.refresh(variant)
    return variant

@router.post("/generate/{rule_id}")
async def generate_variants_for_rule_endpoint(
    rule_id: uuid.UUID,
    count: int = 3,
    question_type: str = "multiple_choice",
    db: AsyncSession = Depends(get_db_session)
):
    stmt = select(Rule).where(Rule.id == rule_id)
    result = await db.execute(stmt)
    rule = result.scalar_one_or_none()
    
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
        
    if rule.review_status != "approved":
        raise HTTPException(status_code=400, detail="Only approved rules can have questions generated.")
        
    variants_data = await generate_question_variants(rule.text, rule.risk_score, rule.cognitive_level, count=count, question_type=question_type)
    
    if not variants_data:
        raise HTTPException(status_code=500, detail="Failed to generate questions via LLM")
        
    new_variants = []
    for vd in variants_data:
        qv = QuestionVariant(
            rule_id=rule.id,
            question_text=vd["question_text"],
            options=vd["options"],
            correct_option_index=vd["correct_option_index"],
            bloom_level=rule.cognitive_level,
            confidence=vd["confidence"],
            review_status="pending"
        )
        db.add(qv)
        new_variants.append(qv)
        
    await db.commit()
    
    return {"message": f"Successfully generated {len(new_variants)} questions"}

@router.post("/bulk-generate")
async def bulk_generate_questions(
    manual_id: str = None,
    section_name: str = None,
    question_type: str = "multiple_choice",
    db: AsyncSession = Depends(get_db_session)
):
    stmt = (
        select(Rule)
        .options(
            selectinload(Rule.questions),
            selectinload(Rule.subcategory).selectinload(SubCategory.section)
        )
        .where(Rule.review_status == "approved")
    )
    
    result = await db.execute(stmt)
    rules = result.scalars().all()
    
    # Filter in python (easier than complex joins if we already fetched them, but joining is better, let's filter in python for now)
    filtered_rules = []
    for r in rules:
        if r.questions:
            # Skip if has any variants
            continue
            
        if manual_id:
            try:
                if str(r.subcategory.section.manual_id) != manual_id:
                    continue
            except:
                pass
                
        if section_name:
            if r.subcategory.section.name != section_name:
                continue
                
        filtered_rules.append(r)
        
    async def event_generator():
        try:
            total = len(filtered_rules)
            yield f"data: {json.dumps({'message': f'Found {total} approved rules without questions.'})}\n\n"
            
            generated_count = 0
            for i, rule in enumerate(filtered_rules):
                yield f"data: {json.dumps({'message': f'Generating question {i+1} of {total}...', 'progress': (i/total)*100})}\n\n"
                
                variants_data = await generate_question_variants(rule.text, rule.risk_score, rule.cognitive_level, count=3, question_type=question_type)
                if variants_data:
                    for vd in variants_data:
                        qv = QuestionVariant(
                            rule_id=rule.id,
                            question_text=vd["question_text"],
                            options=vd["options"],
                            correct_option_index=vd["correct_option_index"],
                            bloom_level=vd["bloom_level"],
                            confidence=0.8,
                            review_status="pending"
                        )
                        db.add(qv)
                    generated_count += len(variants_data)
                    await db.commit()
                    
            yield f"data: {json.dumps({'message': f'Complete! {generated_count} questions generated.', 'done': True, 'count': generated_count})}\n\n"
        except Exception as e:
            logger.error(f"Bulk generate failed: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

"""
question_bank.py  (API endpoint)
Updated to:
  - Use run_all_checks (Req #2, #3, #4) instead of individual checks
  - Pass previously_generated_stems for within-batch dedup (Req #9)
  - Set difficulty on each saved variant (Req #6)
  - Count guarantee: regenerate on rejection rather than saving fewer (Req #1)
  - Bulk-generate uses the same updated pipeline
"""
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
from app.services.llm.grounding_check import run_all_checks
from app.schemas.llm_schemas import derive_difficulty

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_REGEN_ATTEMPTS = 5  # per-question retry budget before giving up


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
            "rule_code": v.rule.rule_code,
        })
    return response


@router.put("/{variant_id}", response_model=QuestionVariantResponse)
async def update_question(
    variant_id: uuid.UUID,
    update_data: QuestionVariantUpdate,
    db: AsyncSession = Depends(get_db_session),
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
    db: AsyncSession = Depends(get_db_session),
):
    """
    Generate `count` quality-verified question variants for one approved rule.
    Implements Req #1 (count guarantee) via a fill-until-N retry loop.
    """
    stmt = select(Rule).where(Rule.id == rule_id)
    result = await db.execute(stmt)
    rule = result.scalar_one_or_none()

    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    if rule.review_status != "approved":
        raise HTTPException(status_code=400, detail="Only approved rules can have questions generated.")

    difficulty = derive_difficulty(rule.cognitive_level, rule.risk_score).value
    new_variants: list[QuestionVariant] = []
    stems_seen: list[str] = []
    attempts = 0

    # Fill-until-N loop (Req #1)
    while len(new_variants) < count and attempts < count * MAX_REGEN_ATTEMPTS:
        attempts += 1
        remaining = count - len(new_variants)
        variants_data = await generate_question_variants(
            rule.text,
            risk_score=rule.risk_score,
            cognitive_level=rule.cognitive_level,
            count=remaining,
            question_type=question_type,
            previously_generated_stems=stems_seen,
        )

        for vd in variants_data:
            passed, confidence, notes = run_all_checks(rule.text, vd)

            if not passed:
                logger.info("Rejected question (hard fail): %s", notes)
                continue  # regenerate

            qv = QuestionVariant(
                rule_id=rule.id,
                question_text=vd["question_text"],
                question_type=vd.get("question_type", "MCQ"),
                options=vd.get("options"),
                correct_option_index=vd.get("correct_option_index"),
                correct_answer=vd.get("correct_answer"),
                blank_answer_variants=vd.get("blank_answer_variants"),
                bloom_level=vd.get("bloom_level", rule.cognitive_level),
                difficulty=difficulty,
                confidence=confidence,
                review_status="pending",
                grounding_verified=passed,
                reviewer_notes="; ".join(notes) if notes else None,
            )
            db.add(qv)
            new_variants.append(qv)
            stems_seen.append(vd["question_text"][:200])

            if len(new_variants) >= count:
                break

    await db.commit()

    actual = len(new_variants)
    if actual < count:
        return {
            "message": (
                f"Insufficient content: only {actual}/{count} questions passed quality "
                "checks after maximum retry attempts. Admin action required: review rule "
                "text for more concrete details."
            ),
            "generated": actual,
            "requested": count,
        }

    return {"message": f"Successfully generated {actual} questions", "generated": actual}


@router.post("/bulk-generate")
async def bulk_generate_questions(
    manual_id: str = None,
    section_name: str = None,
    question_type: str = "multiple_choice",
    db: AsyncSession = Depends(get_db_session),
):
    stmt = (
        select(Rule)
        .options(
            selectinload(Rule.questions),
            selectinload(Rule.subcategory).selectinload(SubCategory.section),
        )
        .where(Rule.review_status == "approved")
    )

    result = await db.execute(stmt)
    rules = result.scalars().all()

    filtered_rules = []
    for r in rules:
        if r.questions:
            continue
        if manual_id:
            try:
                if str(r.subcategory.section.manual_id) != manual_id:
                    continue
            except Exception:
                pass
        if section_name and r.subcategory.section.name != section_name:
            continue
        filtered_rules.append(r)

    async def event_generator():
        try:
            total = len(filtered_rules)
            yield f"data: {json.dumps({'message': f'Found {total} approved rules without questions.'})}\\n\\n"

            generated_count = 0
            for i, rule in enumerate(filtered_rules):
                yield f"data: {json.dumps({'message': f'Generating for rule {i+1}/{total}...', 'progress': (i/total)*100})}\\n\\n"

                difficulty = derive_difficulty(rule.cognitive_level, rule.risk_score).value
                stems_seen: list[str] = []
                accepted = 0
                target = 3

                for _attempt in range(target * MAX_REGEN_ATTEMPTS):
                    if accepted >= target:
                        break
                    variants_data = await generate_question_variants(
                        rule.text,
                        risk_score=rule.risk_score,
                        cognitive_level=rule.cognitive_level,
                        count=1,
                        question_type=question_type,
                        previously_generated_stems=stems_seen,
                    )
                    for vd in variants_data:
                        passed, confidence, notes = run_all_checks(rule.text, vd)
                        if not passed:
                            continue
                        qv = QuestionVariant(
                            rule_id=rule.id,
                            question_text=vd["question_text"],
                            question_type=vd.get("question_type", "MCQ"),
                            options=vd.get("options"),
                            correct_option_index=vd.get("correct_option_index"),
                            correct_answer=vd.get("correct_answer"),
                            blank_answer_variants=vd.get("blank_answer_variants"),
                            bloom_level=vd.get("bloom_level", rule.cognitive_level),
                            difficulty=difficulty,
                            confidence=confidence,
                            review_status="pending",
                            grounding_verified=passed,
                            reviewer_notes="; ".join(notes) if notes else None,
                        )
                        db.add(qv)
                        stems_seen.append(vd["question_text"][:200])
                        accepted += 1
                        generated_count += 1

                await db.commit()

            yield f"data: {json.dumps({'message': f'Complete! {generated_count} questions generated.', 'done': True, 'count': generated_count})}\\n\\n"

        except Exception as e:
            logger.error("Bulk generate failed: %s", e)
            yield f"data: {json.dumps({'error': str(e)})}\\n\\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

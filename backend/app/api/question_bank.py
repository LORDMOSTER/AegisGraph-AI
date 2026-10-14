"""
question_bank.py  (API endpoint)
Updated to support all 4 question types end-to-end:
  - Type-aware fill-until-N with per-type shortfall reporting
  - Default generation matrix (MCQx2, TFx1, FIBx1, MSx1 where allowed)
  - Bulk generate uses default matrix per rule
  - correct_option_indices persisted for MULTI_SELECT
  - TF metadata (statement_true/false/edit_kind/changed_fragment) persisted
  - UI: type filter query param, question_type column in list response
"""
import logging
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
import json
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import get_db_session
from app.models.question_bank import QuestionVariant, QuestionType
from app.models.hierarchy import Rule, SubCategory, Section, Manual
from app.models.schemas import QuestionVariantResponse, QuestionVariantUpdate, FlatQuestionVariantResponse
from app.services.llm.generator import generate_question_variants, generate_default_matrix
from app.services.llm.grounding_check import run_all_checks
from app.services.llm.rule_profiler import profile_rule
from app.schemas.llm_schemas import derive_difficulty

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_REGEN_ATTEMPTS = 5  # per-slot retry budget before giving up


def _save_variant(rule_id, rule, vd: dict, difficulty: str) -> QuestionVariant:
    """Build a QuestionVariant ORM instance from a generated variant dict."""
    return QuestionVariant(
        rule_id=rule_id,
        question_text=vd["question_text"],
        question_type=vd.get("question_type", "MCQ"),
        options=vd.get("options"),
        correct_option_index=vd.get("correct_option_index"),
        correct_option_indices=vd.get("correct_option_indices"),
        correct_answer=vd.get("correct_answer"),
        blank_answer_variants=vd.get("blank_answer_variants"),
        statement_true=vd.get("statement_true"),
        statement_false=vd.get("statement_false"),
        edit_kind=vd.get("edit_kind"),
        changed_fragment=vd.get("changed_fragment"),
        bloom_level=vd.get("bloom_level", rule.cognitive_level),
        difficulty=difficulty,
        confidence=vd.get("confidence", 1.0),
        review_status="pending",
        grounding_verified=True,
        reviewer_notes=None,
    )


@router.get("/", response_model=List[dict])
async def get_all_questions(
    question_type: Optional[str] = Query(None, description="Filter by type: MCQ|TRUE_FALSE|FILL_IN_BLANK|MULTI_SELECT"),
    db: AsyncSession = Depends(get_db_session),
):
    stmt = (
        select(QuestionVariant)
        .options(
            selectinload(QuestionVariant.rule)
            .selectinload(Rule.subcategory)
            .selectinload(SubCategory.section)
            .selectinload(Section.manual)
        )
    )
    if question_type:
        stmt = stmt.where(QuestionVariant.question_type == question_type.upper())

    result = await db.execute(stmt)
    variants = result.scalars().all()

    response = []
    for v in variants:
        response.append({
            "id": v.id,
            "rule_id": v.rule_id,
            "question_text": v.question_text,
            "question_type": v.question_type,
            "options": v.options,
            "correct_option_index": v.correct_option_index,
            "correct_option_indices": v.correct_option_indices,
            "blank_answer_variants": v.blank_answer_variants,
            "bloom_level": v.bloom_level,
            "difficulty": v.difficulty,
            "confidence": v.confidence,
            "review_status": v.review_status,
            "manualTitle": v.rule.subcategory.section.manual.title,
            "sectionName": v.rule.subcategory.section.name,
            "subcategoryName": v.rule.subcategory.name,
            "rule_text": v.rule.text,
            "rule_code": v.rule.rule_code,
        })
    return response


@router.get("/type-counts", response_model=dict)
async def get_type_counts(db: AsyncSession = Depends(get_db_session)):
    """Return counts of questions by type and status for UI filter chips."""
    from sqlalchemy import func
    stmt = select(
        QuestionVariant.question_type,
        QuestionVariant.review_status,
        func.count(QuestionVariant.id).label("count"),
    ).group_by(QuestionVariant.question_type, QuestionVariant.review_status)
    result = await db.execute(stmt)
    counts: dict = {}
    for row in result.all():
        qt = str(row.question_type)
        if qt not in counts:
            counts[qt] = {}
        counts[qt][row.review_status] = row.count
    return counts


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
    question_type: str = "all",
    db: AsyncSession = Depends(get_db_session),
):
    """
    Generate question variants for one approved rule.
    question_type: MCQ|TRUE_FALSE|FILL_IN_BLANK|MULTI_SELECT|all
    Uses type-aware fill-until-N with per-type shortfall reporting.
    """
    stmt = select(Rule).where(Rule.id == rule_id)
    result = await db.execute(stmt)
    rule = result.scalar_one_or_none()

    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    if rule.review_status != "approved":
        raise HTTPException(status_code=400, detail="Only approved rules can have questions generated.")

    # Profile the rule to know which types are allowed
    profile = profile_rule(rule.text)
    allowed_types = profile.allowed_types

    difficulty = derive_difficulty(rule.cognitive_level, rule.risk_score).value

    qt_norm = question_type.lower()
    if qt_norm == "all":
        # Use default matrix
        matrix_result = await generate_default_matrix(
            rule.text,
            risk_score=rule.risk_score,
            cognitive_level=rule.cognitive_level,
        )
        new_variants = []
        for vd in matrix_result["results"]:
            passed, confidence, notes = run_all_checks(rule.text, vd)
            if not passed:
                logger.info("Rejected question (hard fail): %s", notes)
                continue
            vd["confidence"] = confidence
            qv = _save_variant(rule.id, rule, vd, difficulty)
            qv.reviewer_notes = "; ".join(notes) if notes else None
            qv.grounding_verified = passed
            db.add(qv)
            new_variants.append(qv)
        await db.commit()
        shortfall = matrix_result["shortfall"]
        return {
            "message": f"Generated {len(new_variants)} questions using default matrix.",
            "generated": len(new_variants),
            "shortfall": shortfall,
            "allowed_types": allowed_types,
        }

    # Single type — map user-facing name to internal token
    qt_map = {
        "multiple_choice": "MCQ", "mcq": "MCQ",
        "fill_in_blank": "FILL_IN_BLANK", "fitb": "FILL_IN_BLANK",
        "multi_select": "MULTI_SELECT",
        "true_false": "TRUE_FALSE",
    }
    resolved_qt = qt_map.get(qt_norm, qt_norm.upper())

    if resolved_qt not in allowed_types:
        return {
            "message": f"Type {resolved_qt} not allowed for this rule. Allowed: {allowed_types}",
            "generated": 0,
            "shortfall": {resolved_qt: {"requested": count, "produced": 0, "reason": "not_allowed_for_rule"}},
        }

    new_variants: list[QuestionVariant] = []
    stems_seen: list[str] = []
    rejections_by_gate: dict[str, int] = {}
    attempts = 0

    while len(new_variants) < count and attempts < count * MAX_REGEN_ATTEMPTS:
        attempts += 1
        remaining = count - len(new_variants)
        variants_data = await generate_question_variants(
            rule.text,
            risk_score=rule.risk_score,
            cognitive_level=rule.cognitive_level,
            count=remaining,
            question_type=resolved_qt,
            previously_generated_stems=stems_seen,
            maskable_terms=profile.maskable_terms,
        )

        for vd in variants_data:
            passed, confidence, notes = run_all_checks(rule.text, vd)
            if not passed:
                for note in notes:
                    gate = note.split(":")[0]
                    rejections_by_gate[gate] = rejections_by_gate.get(gate, 0) + 1
                logger.info("Rejected question (hard fail): %s", notes)
                continue

            vd["confidence"] = confidence
            qv = _save_variant(rule.id, rule, vd, difficulty)
            qv.reviewer_notes = "; ".join(notes) if notes else None
            qv.grounding_verified = passed
            db.add(qv)
            new_variants.append(qv)
            stems_seen.append(vd["question_text"][:200])

            if len(new_variants) >= count:
                break

    await db.commit()

    actual = len(new_variants)
    if actual < count:
        return {
            "message": f"Shortfall: only {actual}/{count} passed quality checks after {attempts} attempts.",
            "generated": actual,
            "requested": count,
            "shortfall": {resolved_qt: {
                "requested": count,
                "produced": actual,
                "rejections_by_gate": rejections_by_gate,
            }},
        }

    return {"message": f"Successfully generated {actual} questions", "generated": actual}


@router.post("/bulk-generate")
async def bulk_generate_questions(
    manual_id: str = None,
    section_name: str = None,
    question_type: str = "all",
    db: AsyncSession = Depends(get_db_session),
):
    """
    Bulk generate for all approved rules without questions.
    question_type: MCQ|TRUE_FALSE|FILL_IN_BLANK|MULTI_SELECT|all
    Default is "all" which uses the per-rule default matrix.
    """
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
            shortfall_total: dict[str, int] = {}

            for i, rule in enumerate(filtered_rules):
                yield f"data: {json.dumps({'message': f'Generating for rule {i+1}/{total}...', 'progress': (i/total)*100})}\\n\\n"

                difficulty = derive_difficulty(rule.cognitive_level, rule.risk_score).value
                profile = profile_rule(rule.text)

                qt_norm = question_type.lower()

                if qt_norm == "all":
                    matrix_result = await generate_default_matrix(
                        rule.text,
                        risk_score=rule.risk_score,
                        cognitive_level=rule.cognitive_level,
                    )
                    for vd in matrix_result["results"]:
                        passed, confidence, notes = run_all_checks(rule.text, vd)
                        if not passed:
                            continue
                        vd["confidence"] = confidence
                        qv = _save_variant(rule.id, rule, vd, difficulty)
                        qv.reviewer_notes = "; ".join(notes) if notes else None
                        db.add(qv)
                        generated_count += 1

                    for qt, sf in matrix_result["shortfall"].items():
                        shortfall_total[qt] = shortfall_total.get(qt, 0) + (sf["requested"] - sf["produced"])

                else:
                    qt_map = {
                        "multiple_choice": "MCQ", "mcq": "MCQ",
                        "fill_in_blank": "FILL_IN_BLANK", "fitb": "FILL_IN_BLANK",
                        "multi_select": "MULTI_SELECT",
                        "true_false": "TRUE_FALSE",
                    }
                    resolved_qt = qt_map.get(qt_norm, qt_norm.upper())

                    if resolved_qt not in profile.allowed_types:
                        shortfall_total[resolved_qt] = shortfall_total.get(resolved_qt, 0) + 3
                        continue

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
                            question_type=resolved_qt,
                            previously_generated_stems=stems_seen,
                            maskable_terms=profile.maskable_terms,
                        )
                        for vd in variants_data:
                            passed, confidence, notes = run_all_checks(rule.text, vd)
                            if not passed:
                                continue
                            vd["confidence"] = confidence
                            qv = _save_variant(rule.id, rule, vd, difficulty)
                            qv.reviewer_notes = "; ".join(notes) if notes else None
                            db.add(qv)
                            stems_seen.append(vd["question_text"][:200])
                            accepted += 1
                            generated_count += 1

                await db.commit()

            yield f"data: {json.dumps({'message': f'Complete! {generated_count} questions generated.', 'done': True, 'count': generated_count, 'shortfall': shortfall_total})}\\n\\n"

        except Exception as e:
            logger.error("Bulk generate failed: %s", e)
            yield f"data: {json.dumps({'error': str(e)})}\\n\\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")

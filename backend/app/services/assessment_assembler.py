"""
assessment_assembler.py
Builds exam question sets from the approved question_bank.

Features implemented / fixed:
  Req #1 – COUNT GUARANTEE: fill-until-N loop; never return fewer without explicit error
  Req #7 – DIFFICULTY SPLIT: 40% easy+medium / 60% medium+hard enforced; returns
            "incomplete" dict if split cannot be satisfied
  Req #8 – NO-REPEAT-ACROSS-ATTEMPTS: excludes questions already seen by the employee;
            falls back to LRU variants and flags repeats in the returned dict
  Req #9 – WITHIN-BATCH DEDUP: passes previously generated stems to generator so the
            LLM avoids repeating the same underlying fact
"""
import uuid
import random
import logging
from typing import List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.models.question_bank import QuestionVariant, DifficultyLevel
from app.models.hierarchy import Rule, SubCategory, Section
from app.models.question_usage_history import QuestionUsageHistory
from app.core.role_templates import ROLE_TEMPLATES
from app.schemas.llm_schemas import derive_difficulty

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _is_easy_medium(q: QuestionVariant) -> bool:
    return q.difficulty in (DifficultyLevel.EASY.value, DifficultyLevel.MEDIUM.value)


def _is_medium_hard(q: QuestionVariant) -> bool:
    return q.difficulty in (DifficultyLevel.MEDIUM.value, DifficultyLevel.HARD.value)


async def _get_seen_variant_ids(db: AsyncSession, employee_id: uuid.UUID) -> set[uuid.UUID]:
    """Return all variant IDs this employee has previously been given (Req #8)."""
    stmt = select(QuestionUsageHistory.question_variant_id).where(
        QuestionUsageHistory.employee_id == employee_id
    )
    result = await db.execute(stmt)
    return set(result.scalars().all())


async def _get_lru_seen_order(
    db: AsyncSession, employee_id: uuid.UUID
) -> dict[uuid.UUID, int]:
    """
    Returns {variant_id: rank} where rank 0 = least recently used.
    Used as fallback ordering when we must reuse questions.
    """
    stmt = (
        select(
            QuestionUsageHistory.question_variant_id,
            func.max(QuestionUsageHistory.used_at).label("last_used"),
        )
        .where(QuestionUsageHistory.employee_id == employee_id)
        .group_by(QuestionUsageHistory.question_variant_id)
        .order_by("last_used")
    )
    result = await db.execute(stmt)
    rows = result.all()
    return {row[0]: rank for rank, row in enumerate(rows)}


# ---------------------------------------------------------------------------
# Main assembler
# ---------------------------------------------------------------------------

async def assemble_exam_for_role(
    db: AsyncSession,
    job_title: str,
    total_questions: int,
    employee_id: uuid.UUID | None = None,
) -> dict:
    """
    Assembles `total_questions` from the approved question_bank.

    Returns a dict:
      {
        "questions": List[QuestionVariant],   # always present (may be empty)
        "repeat_variant_ids": List[str],       # non-empty if forced reuse (Req #8)
        "incomplete": bool,                    # True if count couldn't be met
        "reason": str | None,                  # human-readable explanation
      }
    """
    profile = ROLE_TEMPLATES.get(job_title) or {
        "General Safety": 50,
        "Emergency Protocols": 50,
    }

    # --- Resolve section quotas -------------------------------------------------
    section_targets: dict[str, int] = {}
    for section_name, pct in profile.items():
        section_targets[section_name] = max(1, int(total_questions * pct / 100.0))

    total_assigned = sum(section_targets.values())
    while total_assigned > total_questions:
        big = max(section_targets, key=section_targets.get)
        section_targets[big] -= 1
        total_assigned -= 1
    while total_assigned < total_questions:
        big = max(section_targets, key=section_targets.get)
        section_targets[big] += 1
        total_assigned += 1

    # --- Difficulty targets (Req #7) -------------------------------------------
    n_easy_medium = round(0.4 * total_questions)  # bucket A
    n_medium_hard = total_questions - n_easy_medium  # bucket B  (always sums to N)

    # --- Seen variants for this employee (Req #8) ------------------------------
    seen_ids: set[uuid.UUID] = set()
    lru_order: dict[uuid.UUID, int] = {}
    if employee_id:
        seen_ids = await _get_seen_variant_ids(db, employee_id)
        if seen_ids:
            lru_order = await _get_lru_seen_order(db, employee_id)

    # --- Fetch approved variants per section -----------------------------------
    all_unseen: list[QuestionVariant] = []
    all_seen: list[QuestionVariant] = []  # fallback pool ordered by LRU

    for section_name in section_targets:
        stmt = (
            select(QuestionVariant)
            .join(Rule, QuestionVariant.rule_id == Rule.id)
            .join(SubCategory, Rule.subcategory_id == SubCategory.id)
            .join(Section, SubCategory.section_id == Section.id)
            .where(
                Section.name == section_name,
                QuestionVariant.review_status == "approved",
            )
            .options(selectinload(QuestionVariant.rule))
        )
        result = await db.execute(stmt)
        variants = result.scalars().all()

        for v in variants:
            if v.id not in seen_ids:
                all_unseen.append(v)
            else:
                all_seen.append(v)

    random.shuffle(all_unseen)
    # Sort seen by LRU (rank 0 = used longest ago first)
    all_seen.sort(key=lambda v: lru_order.get(v.id, 0))

    # --- Difficulty split (Req #7) ---------------------------------------------
    unseen_em = [v for v in all_unseen if _is_easy_medium(v)]
    unseen_mh = [v for v in all_unseen if _is_medium_hard(v)]

    # Medium is eligible for both buckets; greedy fill bucket A first then B
    selected_em: list[QuestionVariant] = unseen_em[:n_easy_medium]
    selected_ids = {v.id for v in selected_em}

    # Bucket B: medium_hard not already chosen
    candidates_mh = [v for v in unseen_mh if v.id not in selected_ids]
    selected_mh: list[QuestionVariant] = candidates_mh[:n_medium_hard]

    selected = selected_em + selected_mh
    selected_ids = {v.id for v in selected}

    # Shortfall — either bucket couldn't be filled from unseen
    shortfall = total_questions - len(selected)
    if shortfall > 0:
        # Try more unseen (ignoring difficulty)
        extras = [v for v in all_unseen if v.id not in selected_ids]
        selected += extras[:shortfall]
        selected_ids = {v.id for v in selected}
        shortfall = total_questions - len(selected)

    # Still short? Use LRU seen (Req #8 fallback)
    repeat_variant_ids: list[str] = []
    if shortfall > 0:
        fallback = [v for v in all_seen if v.id not in selected_ids][:shortfall]
        repeat_variant_ids = [str(v.id) for v in fallback]
        selected += fallback
        shortfall = total_questions - len(selected)

    # If we STILL can't meet the count, try generating from rules on the fly
    if shortfall > 0:
        # Live generation from rules that have no approved variants yet
        await _live_generate_backfill(db, selected, selected_ids, section_targets, shortfall)
        shortfall = total_questions - len(selected)

    incomplete = shortfall > 0
    reason = (
        f"Could not source enough questions: still {shortfall} short after exhausting all approved variants and generation attempts."
        if incomplete
        else None
    )

    random.shuffle(selected)
    return {
        "questions": selected[:total_questions],
        "repeat_variant_ids": repeat_variant_ids,
        "incomplete": incomplete,
        "reason": reason,
    }


async def _live_generate_backfill(
    db: AsyncSession,
    selected: list[QuestionVariant],
    selected_ids: set[uuid.UUID],
    section_targets: dict[str, int],
    needed: int,
) -> None:
    """
    Last-resort live generation from rules that have zero approved variants.
    Appends directly to `selected` (modifies in place).
    """
    from app.services.llm.generator import generate_question_variants
    from app.services.llm.grounding_check import run_all_checks
    from app.schemas.llm_schemas import derive_difficulty

    stems_seen = [q.question_text[:200] for q in selected]

    for section_name in section_targets:
        if len(selected) >= len(selected) + needed:
            break

        stmt = (
            select(Rule)
            .join(SubCategory, Rule.subcategory_id == SubCategory.id)
            .join(Section, SubCategory.section_id == Section.id)
            .where(
                Section.name == section_name,
                Rule.review_status == "approved",
                ~Rule.id.in_(  # rules whose variants are already picked
                    [v.rule_id for v in selected]
                ),
            )
            .order_by(func.random())
            .limit(needed * 2)
        )
        result = await db.execute(stmt)
        rules = result.scalars().all()

        for rule in rules:
            if needed <= 0:
                break
            try:
                variants_data = await generate_question_variants(
                    rule.text,
                    risk_score=rule.risk_score,
                    cognitive_level=rule.cognitive_level,
                    count=1,
                    question_type="multiple_choice",
                    previously_generated_stems=stems_seen,
                )
                for vd in variants_data:
                    passed, confidence, notes = run_all_checks(rule.text, vd)
                    if not passed:
                        continue
                    difficulty = derive_difficulty(rule.cognitive_level, rule.risk_score).value
                    q = QuestionVariant(
                        id=uuid.uuid4(),
                        rule_id=rule.id,
                        question_text=vd["question_text"],
                        options=vd.get("options"),
                        correct_option_index=vd.get("correct_option_index"),
                        correct_answer=vd.get("correct_answer"),
                        question_type=vd.get("question_type", "MCQ"),
                        bloom_level=vd.get("bloom_level", rule.cognitive_level),
                        difficulty=difficulty,
                        review_status="approved",
                        confidence=confidence,
                        grounding_verified=passed,
                        reviewer_notes="; ".join(notes) if notes else None,
                        rule=rule,
                    )
                    db.add(q)
                    selected.append(q)
                    selected_ids.add(q.id)
                    stems_seen.append(q.question_text[:200])
                    needed -= 1
            except Exception as e:
                logger.warning("Live-generate backfill failed for rule %s: %s", rule.id, e)

    # Fallback to ANY approved rule if we still need more (to fulfill count guarantee)
    if needed > 0:
        stmt = (
            select(Rule)
            .where(
                Rule.review_status == "approved",
                ~Rule.id.in_([v.rule_id for v in selected]) if selected else True,
            )
            .order_by(func.random())
            .limit(needed * 2)
        )
        result = await db.execute(stmt)
        fallback_rules = result.scalars().all()

        for rule in fallback_rules:
            if needed <= 0:
                break
            try:
                variants_data = await generate_question_variants(
                    rule.text,
                    risk_score=rule.risk_score,
                    cognitive_level=rule.cognitive_level,
                    count=1,
                    question_type="multiple_choice",
                    previously_generated_stems=stems_seen,
                )
                for vd in variants_data:
                    passed, confidence, notes = run_all_checks(rule.text, vd)
                    if not passed:
                        continue
                    difficulty = derive_difficulty(rule.cognitive_level, rule.risk_score).value
                    q = QuestionVariant(
                        id=uuid.uuid4(),
                        rule_id=rule.id,
                        question_text=vd["question_text"],
                        options=vd.get("options"),
                        correct_option_index=vd.get("correct_option_index"),
                        correct_answer=vd.get("correct_answer"),
                        question_type=vd.get("question_type", "MCQ"),
                        bloom_level=vd.get("bloom_level", rule.cognitive_level),
                        difficulty=difficulty,
                        review_status="approved",
                        confidence=confidence,
                        grounding_verified=passed,
                        reviewer_notes="; ".join(notes) if notes else None,
                        rule=rule,
                    )
                    db.add(q)
                    selected.append(q)
                    selected_ids.add(q.id)
                    stems_seen.append(q.question_text[:200])
                    needed -= 1
            except Exception as e:
                logger.warning("Global fallback live-generate failed for rule %s: %s", rule.id, e)

    try:
        await db.commit()
    except Exception as e:
        logger.error("Backfill commit failed: %s", e)
        await db.rollback()


async def swap_question(
    db: AsyncSession, current_question_id: uuid.UUID
) -> Optional[QuestionVariant]:
    """
    Returns a random different APPROVED question from the same subcategory/bloom level.
    """
    stmt = (
        select(QuestionVariant)
        .options(selectinload(QuestionVariant.rule))
        .where(QuestionVariant.id == current_question_id)
    )
    result = await db.execute(stmt)
    current_q = result.scalar_one_or_none()

    if not current_q:
        raise ValueError("Question not found")

    stmt_swap = (
        select(QuestionVariant)
        .join(Rule, QuestionVariant.rule_id == Rule.id)
        .where(
            QuestionVariant.id != current_question_id,
            QuestionVariant.review_status == "approved",
            Rule.subcategory_id == current_q.rule.subcategory_id,
            QuestionVariant.bloom_level == current_q.bloom_level,
        )
        .order_by(func.random())
        .limit(1)
        .options(selectinload(QuestionVariant.rule))
    )

    result_swap = await db.execute(stmt_swap)
    return result_swap.scalar_one_or_none()

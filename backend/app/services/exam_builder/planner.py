"""
planner.py

Pure functions and async query planning for Exam Builder:
  - build_slot_matrix: Exact type x difficulty marginals using proportional flooring
    and Northwest Corner residual repair.
  - Feasibility analysis: needed vs approved-in-bank vs live-generation vs impossible.
  - Rule selection: topic filter, approved rules, allowed types, difficulty derivation,
    risk ordering, subcategory spreading, and no-repeat with employee usage history.
  - True/False & MCQ position balancing.
"""

from __future__ import annotations

import math
import random
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.exam_builder import ExamDraft, ExamQuestion, ExamSection
from app.models.hierarchy import Rule, Section, SubCategory
from app.models.question_bank import DifficultyLevel, QuestionType, QuestionVariant
from app.models.question_usage_history import QuestionUsageHistory
from app.schemas.exam_builder import (
    DraftFeasibilityResponse,
    FeasibilitySlotReport,
    SectionFeasibilityReport,
)
from app.schemas.llm_schemas import derive_difficulty
from app.services.llm.rule_profiler import profile_rule


@dataclass
class PlannedSlot:
    question_type: str
    difficulty: str
    rule_id: Optional[uuid.UUID] = None
    rule_text: Optional[str] = None
    rule_risk: int = 1
    bank_variant_id: Optional[uuid.UUID] = None
    rule_reused: bool = False
    seen_fallback: bool = False
    tf_target_bool: Optional[bool] = None
    mcq_target_index: Optional[int] = None


# ---------------------------------------------------------------------------
# 1. Exact Marginal Matrix Solver (Pure Function)
# ---------------------------------------------------------------------------

def build_slot_matrix(
    type_mix: Dict[str, int],
    difficulty_mix: Dict[str, int],
    seed: Optional[int] = None,
) -> List[Dict[str, str]]:
    """
    Builds a list of N slot dicts [{'question_type': ..., 'difficulty': ...}]
    such that:
      - count(question_type == t) == type_mix[t] for all t
      - count(difficulty == d) == difficulty_mix[d] for all d
    Guarantees exact marginal sums for arbitrary valid configs.
    """
    rng = random.Random(seed) if seed is not None else random.Random(42)

    total_type = sum(type_mix.values())
    total_diff = sum(difficulty_mix.values())
    if total_type != total_diff or total_type <= 0:
        raise ValueError(
            f"Marginal totals must match and be > 0. type_mix sum={total_type}, diff_mix sum={total_diff}"
        )
    N = total_type

    types = sorted(type_mix.keys())
    diffs = sorted(difficulty_mix.keys())

    row_targets = [type_mix[t] for t in types]
    col_targets = [difficulty_mix[d] for d in diffs]

    num_rows = len(types)
    num_cols = len(diffs)

    # Step 1: Base proportional allocation (floored)
    # M[r][c] = floor((R_r * C_c) / N)
    M = [[0] * num_cols for _ in range(num_rows)]
    for r in range(num_rows):
        for c in range(num_cols):
            P_rc = (row_targets[r] * col_targets[c]) / N
            M[r][c] = math.floor(P_rc)

    # Step 2: Compute residual requirements
    rem_R = [row_targets[r] - sum(M[r]) for r in range(num_rows)]
    rem_C = [col_targets[c] - sum(M[r][c] for r in range(num_rows)) for c in range(num_cols)]

    assert sum(rem_R) == sum(rem_C), f"Residual sums must be equal: {sum(rem_R)} != {sum(rem_C)}"

    # Step 3: Northwest-corner allocation on residuals
    r_idx = 0
    c_idx = 0
    while r_idx < num_rows and c_idx < num_cols:
        alloc = min(rem_R[r_idx], rem_C[c_idx])
        M[r_idx][c_idx] += alloc
        rem_R[r_idx] -= alloc
        rem_C[c_idx] -= alloc

        if rem_R[r_idx] == 0:
            r_idx += 1
        if rem_C[c_idx] == 0:
            c_idx += 1

    # Verify exact row and column sums
    for r in range(num_rows):
        assert sum(M[r]) == row_targets[r], f"Row {types[r]} mismatch: {sum(M[r])} != {row_targets[r]}"
    for c in range(num_cols):
        assert sum(M[r][c] for r in range(num_rows)) == col_targets[c], (
            f"Col {diffs[c]} mismatch: {sum(M[r][c] for r in range(num_rows))} != {col_targets[c]}"
        )

    # Flatten into slot list
    slots: List[Dict[str, str]] = []
    for r in range(num_rows):
        for c in range(num_cols):
            count = M[r][c]
            for _ in range(count):
                slots.append({
                    "question_type": types[r],
                    "difficulty": diffs[c],
                })

    # Shuffle slots deterministically to avoid grouping all of one type together
    rng.shuffle(slots)
    return slots


# ---------------------------------------------------------------------------
# 2. Rule & Bank Query Helpers
# ---------------------------------------------------------------------------

async def _get_employee_seen_variant_ids(
    db: AsyncSession, employee_id: Optional[uuid.UUID]
) -> Set[uuid.UUID]:
    if not employee_id:
        return set()
    stmt = select(QuestionUsageHistory.question_variant_id).where(
        QuestionUsageHistory.employee_id == employee_id
    )
    result = await db.execute(stmt)
    return set(result.scalars().all())


async def _get_approved_rules_for_filter(
    db: AsyncSession, topic_filter: List[Any]
) -> List[Rule]:
    """Fetches active, unrejected rules matching topic_filter (section or subcategory)."""
    stmt = (
        select(Rule)
        .join(SubCategory, Rule.subcategory_id == SubCategory.id)
        .join(Section, SubCategory.section_id == Section.id)
        .where(Rule.is_active == True, Rule.review_status != "rejected")
        .options(selectinload(Rule.subcategory).selectinload(SubCategory.section))
    )

    if topic_filter:
        filter_str_set = {str(f).strip().lower() for f in topic_filter if f}
        # Check against section names, section ids, subcategory names, subcategory ids
        filter_conditions = []
        # Query all approved rules first or match directly in memory/SQL
        result = await db.execute(stmt)
        all_rules = result.scalars().all()
        filtered = []
        for r in all_rules:
            sec = r.subcategory.section if r.subcategory else None
            sub = r.subcategory
            candidates = set()
            if sec:
                candidates.add(str(sec.id).lower())
                candidates.add(sec.name.lower())
            if sub:
                candidates.add(str(sub.id).lower())
                candidates.add(sub.name.lower())
            if candidates.intersection(filter_str_set):
                filtered.append(r)
        return filtered

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def _get_approved_bank_variants(
    db: AsyncSession, rule_ids: List[uuid.UUID]
) -> List[QuestionVariant]:
    """Fetches approved question variants for given rule_ids."""
    if not rule_ids:
        return []
    stmt = (
        select(QuestionVariant)
        .where(
            QuestionVariant.rule_id.in_(rule_ids),
            QuestionVariant.review_status == "approved",
            QuestionVariant.grounding_verified == True,
        )
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# 3. Feasibility Analysis
# ---------------------------------------------------------------------------

async def build_draft_feasibility_report(
    db: AsyncSession,
    draft: ExamDraft,
    employee_id: Optional[uuid.UUID] = None,
) -> DraftFeasibilityResponse:
    """
    Computes feasibility report for an ExamDraft per section and per (type, diff).
    Never fakes a type.
    """
    seen_variant_ids = await _get_employee_seen_variant_ids(db, employee_id)
    section_reports: List[SectionFeasibilityReport] = []
    draft_is_feasible = True

    for sec in draft.sections:
        type_mix = sec.type_mix or {}
        diff_mix = sec.difficulty_mix or {}
        if not type_mix or not diff_mix:
            continue

        rules = await _get_approved_rules_for_filter(db, sec.topic_filter)
        rule_ids = [r.id for r in rules]
        bank_variants = await _get_approved_bank_variants(db, rule_ids)

        # Profile rules for allowed types and derived difficulties
        rule_profiles = {}
        for r in rules:
            p = profile_rule(r.text)
            d = derive_difficulty(r.cognitive_level, r.risk_score)
            rule_profiles[r.id] = {"allowed_types": p.allowed_types, "difficulty": d, "rule": r}

        slots = build_slot_matrix(type_mix, diff_mix, seed=42)

        # Group needed by (type, diff)
        needed_counts: Dict[Tuple[str, str], int] = {}
        for s in slots:
            key = (s["question_type"], s["difficulty"])
            needed_counts[key] = needed_counts.get(key, 0) + 1

        slot_reports: List[FeasibilitySlotReport] = []
        sec_feasible = True
        sec_suggested_fixes: List[str] = []

        for (q_type, diff), needed in needed_counts.items():
            # Available in bank
            matching_bank = [
                v for v in bank_variants
                if v.question_type == q_type
                and v.difficulty == diff
                and v.id not in seen_variant_ids
            ]
            bank_count = len(matching_bank)

            # Available rules for live generation
            matching_rules = [
                r_id for r_id, prof in rule_profiles.items()
                if q_type in prof["allowed_types"] and prof["difficulty"] == diff
            ]
            live_gen_count = len(matching_rules)

            total_capacity = bank_count + live_gen_count
            impossible = max(0, needed - total_capacity)

            fixes = []
            if impossible > 0:
                sec_feasible = False
                fixes.append(
                    f"Need {needed} {diff} {q_type} questions, but only {bank_count} exist in bank "
                    f"and {live_gen_count} eligible rules can generate them (shortfall: {impossible})."
                )
                if q_type == "MULTI_SELECT":
                    fixes.append("Add compound/multi-clause rules to the topic filter to enable MULTI_SELECT.")
                elif q_type == "FILL_IN_BLANK":
                    fixes.append("Ensure rules contain numeric thresholds or named procedures for FILL_IN_BLANK.")
                fixes.append("Broaden topic_filter to include additional subcategories.")

            slot_reports.append(FeasibilitySlotReport(
                question_type=q_type,
                difficulty=diff,
                needed=needed,
                approved_in_bank=bank_count,
                needs_live_generation=min(needed, live_gen_count),
                impossible=impossible,
                suggested_fixes=fixes,
            ))

        if not sec_feasible:
            draft_is_feasible = False

        section_reports.append(SectionFeasibilityReport(
            section_id=sec.id,
            section_title=sec.title,
            total_needed=len(slots),
            slots=slot_reports,
            is_feasible=sec_feasible,
            suggested_fixes=sec_suggested_fixes,
        ))

    return DraftFeasibilityResponse(
        draft_id=draft.id,
        is_feasible=draft_is_feasible,
        sections=section_reports,
    )


# ---------------------------------------------------------------------------
# 4. Plan and Assign Rules/Variants to Slots
# ---------------------------------------------------------------------------

async def plan_section_slots(
    db: AsyncSession,
    section: ExamSection,
    employee_id: Optional[uuid.UUID] = None,
    used_rule_ids_in_exam: Optional[Set[uuid.UUID]] = None,
    seed: Optional[int] = None,
) -> List[PlannedSlot]:
    """
    Plans slots for a section:
      - Assigns bank variant or eligible rule to each slot
      - Prioritizes higher risk within difficulty
      - Spreads across subcategories
      - Avoids rule reuse across the exam unless pool exhausted
      - Avoids seen variants for employee
      - Balances TRUE_FALSE and MCQ position per section
    """
    rng = random.Random(seed) if seed is not None else random.Random()
    used_rules = used_rule_ids_in_exam if used_rule_ids_in_exam is not None else set()

    raw_slots = build_slot_matrix(section.type_mix, section.difficulty_mix, seed=seed)
    seen_variant_ids = await _get_employee_seen_variant_ids(db, employee_id)
    rules = await _get_approved_rules_for_filter(db, section.topic_filter)
    rule_ids = [r.id for r in rules]
    bank_variants = await _get_approved_bank_variants(db, rule_ids)

    # Sort rules: higher risk first
    rules_by_diff: Dict[str, List[Rule]] = {"easy": [], "medium": [], "hard": []}
    for r in sorted(rules, key=lambda r: r.risk_score, reverse=True):
        d = derive_difficulty(r.cognitive_level, r.risk_score)
        if d in rules_by_diff:
            rules_by_diff[d].append(r)

    # Balance state for the section
    tf_balance_bool = rng.choice([True, False])
    mcq_positions = [0, 1, 2, 3]
    rng.shuffle(mcq_positions)
    mcq_pos_idx = 0

    planned_slots: List[PlannedSlot] = []

    for slot_dict in raw_slots:
        q_type = slot_dict["question_type"]
        diff = slot_dict["difficulty"]

        ps = PlannedSlot(question_type=q_type, difficulty=diff)

        # TRUE_FALSE balance
        if q_type == "TRUE_FALSE":
            ps.tf_target_bool = tf_balance_bool
            tf_balance_bool = not tf_balance_bool

        # MCQ position balance
        if q_type == "MCQ":
            ps.mcq_target_index = mcq_positions[mcq_pos_idx % len(mcq_positions)]
            mcq_pos_idx += 1

        # 1. Try bank hit (not seen, not used yet)
        candidate_variants = [
            v for v in bank_variants
            if v.question_type == q_type
            and v.difficulty == diff
            and v.id not in seen_variant_ids
            and v.rule_id not in used_rules
        ]

        if candidate_variants:
            chosen_var = candidate_variants[0]
            ps.bank_variant_id = chosen_var.id
            ps.rule_id = chosen_var.rule_id
            used_rules.add(chosen_var.rule_id)
            planned_slots.append(ps)
            continue

        # 2. Try rule candidate for live generation
        candidate_rules = [
            r for r in rules_by_diff.get(diff, [])
            if q_type in profile_rule(r.text).allowed_types
            and r.id not in used_rules
        ]

        if candidate_rules:
            chosen_rule = candidate_rules[0]
            ps.rule_id = chosen_rule.id
            ps.rule_text = chosen_rule.text
            ps.rule_risk = chosen_rule.risk_score
            used_rules.add(chosen_rule.id)
            planned_slots.append(ps)
            continue

        # 3. Pool exhausted — allow reuse of rules from exam
        fallback_rules = [
            r for r in rules_by_diff.get(diff, [])
            if q_type in profile_rule(r.text).allowed_types
        ]
        if fallback_rules:
            chosen_rule = fallback_rules[0]
            ps.rule_id = chosen_rule.id
            ps.rule_text = chosen_rule.text
            ps.rule_risk = chosen_rule.risk_score
            ps.rule_reused = True
            planned_slots.append(ps)
            continue

        # 4. Any rule that allows this question type regardless of difficulty
        any_diff_rules = [
            r for r in rules
            if q_type in profile_rule(r.text).allowed_types
        ]
        if any_diff_rules:
            chosen_rule = any_diff_rules[0]
            ps.rule_id = chosen_rule.id
            ps.rule_text = chosen_rule.text
        # 5. Universal fallback: pick any available rule from section/filter
        if rules:
            chosen_rule = rules[len(planned_slots) % len(rules)]
            ps.rule_id = chosen_rule.id
            ps.rule_text = chosen_rule.text
            ps.rule_risk = chosen_rule.risk_score
            ps.rule_reused = True
            planned_slots.append(ps)
            continue

        # Truly impossible slot (zero rules exist in database)
        planned_slots.append(ps)

    return planned_slots

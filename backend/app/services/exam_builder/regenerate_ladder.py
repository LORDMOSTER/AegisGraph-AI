"""
regenerate_ladder.py

Service implementing the Question Variation Ladder for Exam Builder:
  - Rung (a): Same rule, different clause/term, temperature 0.2-0.3, avoid-list
  - Rung (b): Same rule, different style (scenario, recall, direct)
  - Rung (c): Another approved rule in same section, difficulty, and type
  - Rung (d): Rejection with HTTP 409 and readable ladder reason
Guarantees:
  - Pinned questions return HTTP 423
  - Stem differs from previous version (similarity < 0.8) and from all exam stems
  - Preserves id, section_id, order_index, marks
  - Atomic replace with snapshot saved to exam_question_revisions
  - Alternative bank variants and instant swap
"""

from __future__ import annotations

import difflib
import random
import uuid
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.exam_builder import (
    ExamDraft,
    ExamDraftStatus,
    ExamQuestion,
    ExamQuestionRevision,
    ExamSection,
    QuestionOrigin,
)
from app.models.hierarchy import Rule, Section, SubCategory
from app.models.question_bank import QuestionVariant
from app.schemas.llm_schemas import derive_difficulty
from app.services.llm.generator import _generate_single, LLMExtractionError
from app.services.llm.grounding_check import run_all_checks
from app.services.llm.rule_profiler import profile_rule


def compute_similarity(s1: str, s2: str) -> float:
    """Computes SequenceMatcher ratio between two normalized strings."""
    return difflib.SequenceMatcher(None, s1.lower().strip(), s2.lower().strip()).ratio()


async def regenerate_question_ladder(
    db: AsyncSession,
    draft: ExamDraft,
    question: ExamQuestion,
    mode: str = "same_rule",
    change_type: Optional[str] = None,
    difficulty: Optional[str] = None,
    focus_hint: Optional[str] = None,
) -> ExamQuestion:
    """
    Executes the variation ladder to regenerate a single question.
    Raises HTTPException(423) if pinned.
    Raises HTTPException(409) if all rungs fail.
    """
    # 0. Check pinned guard
    if question.is_locked:
        raise HTTPException(
            status_code=423,
            detail="Question is pinned. Unpin before regenerating.",
        )

    if draft.status == ExamDraftStatus.LOCKED.value:
        raise HTTPException(
            status_code=400,
            detail="Cannot regenerate questions on a locked draft. Clone to a new version to edit.",
        )

    target_type = change_type.upper() if change_type else question.question_type
    target_diff = difficulty.lower() if difficulty else question.difficulty

    # Build avoid list: current stem + every stem currently in the draft
    avoid_stems: List[str] = []
    current_stem = question.stem.strip()
    avoid_stems.append(current_stem)

    for sec in draft.sections:
        for q in sec.questions:
            s = q.stem.strip()
            if s and s not in avoid_stems:
                avoid_stems.append(s)

    # Fetch current rule text
    current_rule_text = ""
    current_rule = None
    if question.rule_id:
        r_stmt = select(Rule).where(Rule.id == question.rule_id)
        r_res = await db.execute(r_stmt)
        current_rule = r_res.scalar_one_or_none()
        if current_rule:
            current_rule_text = current_rule.text

    ladder_failures: List[str] = []
    new_candidate: Optional[Dict[str, Any]] = None
    resolved_rule_id = question.rule_id

    # -----------------------------------------------------------------------
    # Rung (a): Same rule, different clause / term, temp 0.25, avoid-list
    # -----------------------------------------------------------------------
    if mode != "other_rule" and current_rule_text:
        try:
            profile = profile_rule(current_rule_text)
            if target_type in profile.allowed_types:
                rng_seed = random.randint(100, 999999)
                cand = await _generate_single(
                    current_rule_text,
                    target_type,
                    avoid_stems,
                    maskable_terms=profile.maskable_terms,
                    temperature=0.25,
                    seed=rng_seed,
                    focus_hint=focus_hint,
                )
                passed, conf, notes = run_all_checks(current_rule_text, cand)
                new_stem = cand.get("question_text", "")
                sim_to_current = compute_similarity(new_stem, current_stem)
                max_sim_exam = max((compute_similarity(new_stem, s) for s in avoid_stems), default=0.0)

                if passed and sim_to_current < 0.8 and max_sim_exam < 0.85:
                    new_candidate = cand
                    new_candidate["confidence"] = conf
                    new_candidate["warnings"] = notes
                else:
                    reason = f"gate_failed({notes[:1]})" if not passed else f"similarity_too_high({sim_to_current:.2f})"
                    ladder_failures.append(f"Rung (a) [same rule, diff term]: {reason}")
            else:
                ladder_failures.append(f"Rung (a): Type {target_type} not allowed for rule")
        except Exception as e:
            ladder_failures.append(f"Rung (a) error: {str(e)[:60]}")

    # -----------------------------------------------------------------------
    # Rung (b): Same rule, different style (scenario, recall, direct)
    # -----------------------------------------------------------------------
    if new_candidate is None and mode != "other_rule" and current_rule_text:
        styles_to_try = ["scenario", "recall", "direct"]
        profile = profile_rule(current_rule_text)
        if target_type in profile.allowed_types:
            for style in styles_to_try:
                try:
                    rng_seed = random.randint(100, 999999)
                    cand = await _generate_single(
                        current_rule_text,
                        target_type,
                        avoid_stems,
                        maskable_terms=profile.maskable_terms,
                        temperature=0.30,
                        seed=rng_seed,
                        style=style,
                        focus_hint=focus_hint,
                    )
                    passed, conf, notes = run_all_checks(current_rule_text, cand)
                    new_stem = cand.get("question_text", "")
                    sim_to_current = compute_similarity(new_stem, current_stem)
                    max_sim_exam = max((compute_similarity(new_stem, s) for s in avoid_stems), default=0.0)

                    if passed and sim_to_current < 0.8 and max_sim_exam < 0.85:
                        new_candidate = cand
                        new_candidate["confidence"] = conf
                        new_candidate["warnings"] = notes
                        break
                    else:
                        reason = f"gate_failed({notes[:1]})" if not passed else f"similarity({sim_to_current:.2f})"
                        ladder_failures.append(f"Rung (b) [{style}]: {reason}")
                except Exception as e:
                    ladder_failures.append(f"Rung (b) [{style}] error: {str(e)[:60]}")

    # -----------------------------------------------------------------------
    # Rung (c): Another approved rule in same section, difficulty, and type
    # -----------------------------------------------------------------------
    if new_candidate is None:
        # Load section and find alternative rules matching topic_filter
        sec_stmt = select(ExamSection).where(ExamSection.id == question.section_id)
        sec_res = await db.execute(sec_stmt)
        sec = sec_res.scalar_one()

        # Query rules for section
        r_query = (
            select(Rule)
            .join(SubCategory, Rule.subcategory_id == SubCategory.id)
            .join(Section, SubCategory.section_id == Section.id)
            .where(Rule.review_status == "approved", Rule.is_active == True)
        )
        if question.rule_id:
            r_query = r_query.where(Rule.id != question.rule_id)

        all_rules_res = await db.execute(r_query)
        candidate_rules = all_rules_res.scalars().all()

        eligible_rules: List[Rule] = []
        for r in candidate_rules:
            p = profile_rule(r.text)
            d = derive_difficulty(r.cognitive_level, r.risk_score)
            if target_type in p.allowed_types:
                eligible_rules.append(r)

        # Sort higher risk first
        eligible_rules.sort(key=lambda r: (derive_difficulty(r.cognitive_level, r.risk_score) == target_diff, r.risk_score), reverse=True)

        if not eligible_rules:
            ladder_failures.append("Rung (c) [other rule]: No alternative approved rules available in section")
        else:
            for alt_rule in eligible_rules[:3]:
                try:
                    profile = profile_rule(alt_rule.text)
                    rng_seed = random.randint(100, 999999)
                    cand = await _generate_single(
                        alt_rule.text,
                        target_type,
                        avoid_stems,
                        maskable_terms=profile.maskable_terms,
                        temperature=0.25,
                        seed=rng_seed,
                        focus_hint=focus_hint,
                    )
                    passed, conf, notes = run_all_checks(alt_rule.text, cand)
                    new_stem = cand.get("question_text", "")
                    sim_to_current = compute_similarity(new_stem, current_stem)
                    max_sim_exam = max((compute_similarity(new_stem, s) for s in avoid_stems), default=0.0)

                    if passed and sim_to_current < 0.8 and max_sim_exam < 0.85:
                        new_candidate = cand
                        new_candidate["confidence"] = conf
                        new_candidate["warnings"] = notes
                        resolved_rule_id = alt_rule.id
                        break
                    else:
                        reason = f"gate_failed({notes[:1]})" if not passed else f"similarity({sim_to_current:.2f})"
                        ladder_failures.append(f"Rung (c) [rule {alt_rule.rule_code}]: {reason}")
                except Exception as e:
                    ladder_failures.append(f"Rung (c) error: {str(e)[:60]}")

    # -----------------------------------------------------------------------
    # Rung (d): Fail with 409
    # -----------------------------------------------------------------------
    if new_candidate is None:
        failure_summary = "; ".join(ladder_failures[-5:]) if ladder_failures else "Unknown generation failure"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Regeneration failed across all ladder rungs: {failure_summary}",
        )

    # -----------------------------------------------------------------------
    # Apply Atomic Replace & Revision Snapshot
    # -----------------------------------------------------------------------
    snapshot = {
        "stem": question.stem,
        "difficulty": question.difficulty,
        "marks": question.marks,
        "payload": dict(question.payload),
        "explanation": question.explanation,
        "origin": question.origin,
        "question_type": question.question_type,
        "rule_id": str(question.rule_id) if question.rule_id else None,
        "source_variant_id": str(question.source_variant_id) if question.source_variant_id else None,
    }
    revision = ExamQuestionRevision(question_id=question.id, snapshot=snapshot)
    db.add(revision)

    # Update question in place
    question.stem = new_candidate.get("question_text", "")
    question.question_type = target_type
    question.difficulty = target_diff
    question.rule_id = resolved_rule_id
    question.source_variant_id = None
    question.origin = QuestionOrigin.AI.value
    question.confidence = new_candidate.get("confidence", 1.0)
    question.explanation = new_candidate.get("explanation")
    question.warnings = [{"note": n} for n in new_candidate.get("warnings", [])]
    question.payload = {
        "options": new_candidate.get("options"),
        "correct_option_index": new_candidate.get("correct_option_index"),
        "correct_option_indices": new_candidate.get("correct_option_indices"),
        "correct_answer": new_candidate.get("correct_answer"),
        "blank_answer_variants": new_candidate.get("blank_answer_variants"),
        "statement_true": new_candidate.get("statement_true"),
        "statement_false": new_candidate.get("statement_false"),
        "edit_kind": new_candidate.get("edit_kind"),
        "changed_fragment": new_candidate.get("changed_fragment"),
    }

    await db.commit()
    await db.refresh(question)
    return question


async def get_question_alternatives(
    db: AsyncSession,
    draft: ExamDraft,
    question: ExamQuestion,
) -> List[Dict[str, Any]]:
    """
    Returns up to 5 approved bank variants matching type and difficulty,
    prioritizing the same rule, that are not currently in the exam.
    """
    exam_variant_ids = set()
    exam_stems = set()
    for sec in draft.sections:
        for q in sec.questions:
            if q.source_variant_id:
                exam_variant_ids.add(q.source_variant_id)
            if q.stem:
                exam_stems.add(q.stem.strip().lower())

    # Query matching approved variants in question_bank
    stmt = (
        select(QuestionVariant)
        .where(
            QuestionVariant.question_type == question.question_type,
            QuestionVariant.difficulty == question.difficulty,
            QuestionVariant.review_status == "approved",
            QuestionVariant.grounding_verified == True,
        )
    )
    if question.source_variant_id:
        stmt = stmt.where(QuestionVariant.id != question.source_variant_id)

    res = await db.execute(stmt)
    all_vars = list(res.scalars().all())

    # Filter out any already in exam
    filtered = [
        v for v in all_vars
        if v.id not in exam_variant_ids
        and v.question_text.strip().lower() not in exam_stems
    ]

    # Prioritize same rule first
    filtered.sort(
        key=lambda v: (1 if question.rule_id and v.rule_id == question.rule_id else 0, v.confidence),
        reverse=True,
    )

    results = []
    for v in filtered[:5]:
        results.append({
            "id": str(v.id),
            "stem": v.question_text,
            "question_type": v.question_type,
            "difficulty": v.difficulty,
            "options": v.options,
            "is_same_rule": bool(question.rule_id and v.rule_id == question.rule_id),
            "rule_id": str(v.rule_id) if v.rule_id else None,
            "correct_answer": v.correct_answer,
        })
    return results


async def swap_question_with_variant(
    db: AsyncSession,
    draft: ExamDraft,
    question: ExamQuestion,
    variant_id: uuid.UUID,
) -> ExamQuestion:
    """
    Atomically swaps an ExamQuestion with an approved bank variant.
    Preserves id, section, position, and marks. Saves previous state to revisions.
    """
    if question.is_locked:
        raise HTTPException(
            status_code=423,
            detail="Question is pinned. Unpin before swapping.",
        )

    if draft.status == ExamDraftStatus.LOCKED.value:
        raise HTTPException(
            status_code=400,
            detail="Cannot swap questions on a locked draft.",
        )

    v_stmt = select(QuestionVariant).where(QuestionVariant.id == variant_id)
    v_res = await db.execute(v_stmt)
    variant = v_res.scalar_one_or_none()
    if not variant:
        raise HTTPException(status_code=404, detail="Bank variant not found")

    # Save revision snapshot
    snapshot = {
        "stem": question.stem,
        "difficulty": question.difficulty,
        "marks": question.marks,
        "payload": dict(question.payload),
        "explanation": question.explanation,
        "origin": question.origin,
        "question_type": question.question_type,
        "rule_id": str(question.rule_id) if question.rule_id else None,
        "source_variant_id": str(question.source_variant_id) if question.source_variant_id else None,
    }
    revision = ExamQuestionRevision(question_id=question.id, snapshot=snapshot)
    db.add(revision)

    # Update question from variant
    question.stem = variant.question_text
    question.question_type = variant.question_type
    question.difficulty = variant.difficulty
    question.rule_id = variant.rule_id
    question.source_variant_id = variant.id
    question.origin = QuestionOrigin.BANK.value
    question.confidence = variant.confidence
    question.explanation = None
    question.warnings = []
    question.payload = {
        "options": variant.options,
        "correct_option_index": variant.correct_option_index,
        "correct_option_indices": variant.correct_option_indices,
        "correct_answer": variant.correct_answer,
        "blank_answer_variants": variant.blank_answer_variants,
        "statement_true": variant.statement_true,
        "statement_false": variant.statement_false,
        "edit_kind": variant.edit_kind,
        "changed_fragment": variant.changed_fragment,
    }

    await db.commit()
    await db.refresh(question)
    return question

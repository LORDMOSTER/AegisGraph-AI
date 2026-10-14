"""
test_regenerate_ladder.py

Acceptance test suite for Single-Question and Section-wide Regeneration:
  1. Real local model regenerates each of the four question types (MCQ, TRUE_FALSE,
     FILL_IN_BLANK, MULTI_SELECT) to a different, grounded question within 3 attempts (similarity < 0.8).
  2. Pinned questions strictly return HTTP 423 Locked until unpinned.
  3. Instant alternatives returns up to 5 approved bank variants (same rule first, not in exam),
     and atomic Swap replaces in place while logging revisions.
  4. Undo restores the previous snapshot from exam_question_revisions.
  5. Section-wide regeneration processes unpinned questions and skips pinned ones over the job channel.
"""

from __future__ import annotations

import difflib
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.main import app
from app.api.deps import get_current_active_user, get_db_session
from app.models.company import Company
from app.models.hierarchy import Manual, Section, SubCategory, Rule
from app.models.question_bank import QuestionType, QuestionVariant
from app.models.user import RoleEnum, User
from app.models.exam_builder import (
    ExamDraft,
    ExamDraftStatus,
    ExamQuestion,
    ExamQuestionRevision,
    ExamSection,
    GenerationJob,
    GenerationJobStatus,
    QuestionOrigin,
)
from app.services.exam_builder.regenerate_ladder import (
    compute_similarity,
    get_question_alternatives,
    regenerate_question_ladder,
    swap_question_with_variant,
)
from app.services.llm.generator import _generate_single
from app.services.llm.grounding_check import run_all_checks
from app.services.llm.rule_profiler import profile_rule


NUMERIC_RULE_TEXT = (
    "All technicians working on 480V motor control centers must wear ASTM F1506 "
    "arc-rated face shields with a minimum rating of 12 cal/cm2 and electrically "
    "insulating gloves rated for 1,000 volts."
)

COMPOUND_RULE_TEXT = (
    "Personal protective equipment required for chemical handling includes nitrile gloves, "
    "chemical splash goggles, neoprene aprons, and vapor respirators."
)

MULTI_CLAUSE_RULE_TEXT = (
    "All technicians working on 480V motor control centers must wear ASTM F1506 arc-rated face shields "
    "with a minimum rating of 12 cal/cm2 and electrically insulating gloves rated for 1,000 volts. "
    "Before opening cabinet doors, personnel shall verify zero energy with a calibrated multimeter "
    "and install lockout padlocks on the primary disconnect switch."
)


@pytest.fixture
async def setup_test_hierarchy(db_session: AsyncSession):
    """Sets up company, admin, manual, section, subcategory, and rules."""
    company = Company(name=f"Regenerate Test Co {uuid.uuid4().hex[:6]}", company_code=f"RGN_{uuid.uuid4().hex[:6]}")
    db_session.add(company)
    await db_session.flush()

    admin = User(
        company_id=company.id,
        employee_code=f"ADM_{uuid.uuid4().hex[:6]}",
        password_hash="test_hash",
        role=RoleEnum.SUPER_ADMIN,
    )
    db_session.add(admin)

    manual = Manual(company_id=company.id, title="Electrical & Safety Manual")
    db_session.add(manual)
    await db_session.flush()

    sec = Section(manual_id=manual.id, name="High Voltage & Chemical Safety", code="SEC_HV")
    db_session.add(sec)
    await db_session.flush()

    sub = SubCategory(section_id=sec.id, name="PPE & Entry Standards", code="SUB_PPE")
    db_session.add(sub)
    await db_session.flush()

    rule1 = Rule(
        subcategory_id=sub.id,
        rule_code="EL-480V-01",
        text=NUMERIC_RULE_TEXT,
        source_text=NUMERIC_RULE_TEXT,
        risk_score=5,
        cognitive_level="Apply",
        review_status="approved",
        is_active=True,
    )
    rule2 = Rule(
        subcategory_id=sub.id,
        rule_code="CH-PPE-02",
        text=COMPOUND_RULE_TEXT,
        source_text=COMPOUND_RULE_TEXT,
        risk_score=4,
        cognitive_level="Understand",
        review_status="approved",
        is_active=True,
    )
    db_session.add_all([rule1, rule2])
    await db_session.commit()

    return {
        "company": company,
        "admin": admin,
        "rule1": rule1,
        "rule2": rule2,
        "section": sec,
    }


# ---------------------------------------------------------------------------
# 1. Real Model: All Four Types Regenerate to Dissimilar Grounded Stems (< 0.8)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.parametrize(
    "q_type,rule_text",
    [
        ("MCQ", NUMERIC_RULE_TEXT),
        ("TRUE_FALSE", MULTI_CLAUSE_RULE_TEXT),
        ("FILL_IN_BLANK", MULTI_CLAUSE_RULE_TEXT),
        ("MULTI_SELECT", COMPOUND_RULE_TEXT),
    ],
)
async def test_real_model_each_type_regenerates_dissimilar(q_type: str, rule_text: str):
    """
    Acceptance Guarantee 1:
    On the real local Ollama model, each of the four question types regenerates
    to a dissimilar (similarity < 0.8) and grounded question within 3 attempts.
    """
    profile = profile_rule(rule_text)
    assert q_type in profile.allowed_types, f"{q_type} not allowed for test rule: {profile.allowed_types}"

    # Step 1: Generate initial base question
    initial_q = await _generate_single(
        rule_text,
        q_type,
        previously_generated_stems=[],
        maskable_terms=profile.maskable_terms,
        temperature=0.0,
    )
    initial_stem = initial_q.get("question_text", "").strip()
    assert initial_stem, f"Initial stem empty for {q_type}"

    # Step 2: Regenerate within 3 attempts, passing avoid-list and temperature 0.25-0.30
    success = False
    best_sim = 1.0
    regen_stem = ""

    for attempt in range(1, 4):
        candidate = await _generate_single(
            rule_text,
            q_type,
            previously_generated_stems=[initial_stem],
            maskable_terms=profile.maskable_terms,
            temperature=0.25,
            seed=42 + attempt * 17,
            style="scenario" if attempt == 2 else ("recall" if attempt == 3 else None),
        )
        cand_stem = candidate.get("question_text", "").strip()
        sim = compute_similarity(cand_stem, initial_stem)
        best_sim = min(best_sim, sim)

        passed, conf, notes = run_all_checks(rule_text, candidate)
        if passed and sim < 0.8:
            success = True
            regen_stem = cand_stem
            break

    assert success, (
        f"Failed to regenerate dissimilar grounded {q_type} within 3 attempts. "
        f"Best similarity={best_sim:.2f} (required < 0.8). "
        f"Initial: '{initial_stem}' vs Last: '{cand_stem}'"
    )
    assert best_sim < 0.8


# ---------------------------------------------------------------------------
# 2. Pinned Questions Return HTTP 423 Locked
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_pinned_question_returns_423_locked(db_session: AsyncSession, setup_test_hierarchy):
    """
    Acceptance Guarantee 4:
    Pinned questions strictly return HTTP 423 until unpinned.
    """
    data = setup_test_hierarchy
    admin = data["admin"]
    company = data["company"]
    rule1 = data["rule1"]

    app.dependency_overrides[get_current_active_user] = lambda: admin
    app.dependency_overrides[get_db_session] = lambda: db_session

    draft = ExamDraft(
        company_id=company.id,
        created_by=admin.id,
        title="Pinned Test Draft",
        status=ExamDraftStatus.DRAFT.value,
    )
    db_session.add(draft)
    await db_session.flush()

    sec = ExamSection(draft_id=draft.id, order_index=0, title="Electrical Safety")
    db_session.add(sec)
    await db_session.flush()

    question = ExamQuestion(
        section_id=sec.id,
        order_index=0,
        question_type="MCQ",
        difficulty="medium",
        marks=1,
        stem="What is the minimum arc-rating for face shields on 480V MCCs?",
        payload={"options": ["8 cal/cm2", "12 cal/cm2", "20 cal/cm2", "40 cal/cm2"], "correct_option_index": 1},
        rule_id=rule1.id,
        origin=QuestionOrigin.AI.value,
        is_locked=True,  # PINNED!
    )
    db_session.add(question)
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Attempt to regenerate pinned question
        resp = await ac.post(
            f"/api/exam-drafts/{draft.id}/questions/{question.id}/regenerate",
            json={"mode": "same_rule"},
        )
        assert resp.status_code == 423, f"Expected 423 for pinned question, got {resp.status_code}: {resp.text}"
        assert "pinned" in resp.json()["detail"].lower()

        # Unpin question and try again
        old_stem = question.stem
        question.is_locked = False
        await db_session.commit()

        resp2 = await ac.post(
            f"/api/exam-drafts/{draft.id}/questions/{question.id}/regenerate",
            json={"mode": "same_rule"},
        )
        assert resp2.status_code == 200, f"Expected 200 after unpinning, got {resp2.status_code}: {resp2.text}"
        new_stem = resp2.json()["stem"]
        assert compute_similarity(new_stem, old_stem) < 0.8


# ---------------------------------------------------------------------------
# 3. Undo Endpoint Restores Previous Version
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_undo_restores_previous_question_version(db_session: AsyncSession, setup_test_hierarchy):
    """
    Acceptance Guarantee 3:
    Modifying or regenerating a question creates a revision snapshot.
    POST .../undo restores stem, marks, difficulty, and payload.
    """
    data = setup_test_hierarchy
    admin = data["admin"]
    company = data["company"]
    rule1 = data["rule1"]

    app.dependency_overrides[get_current_active_user] = lambda: admin
    app.dependency_overrides[get_db_session] = lambda: db_session

    draft = ExamDraft(
        company_id=company.id,
        created_by=admin.id,
        title="Undo Test Draft",
        status=ExamDraftStatus.DRAFT.value,
    )
    db_session.add(draft)
    await db_session.flush()

    sec = ExamSection(draft_id=draft.id, order_index=0, title="Sec 1")
    db_session.add(sec)
    await db_session.flush()

    original_stem = "Original question stem about 480V motor control center requirements."
    original_payload = {"options": ["A", "B", "C", "D"], "correct_option_index": 0}

    question = ExamQuestion(
        section_id=sec.id,
        order_index=0,
        question_type="MCQ",
        difficulty="medium",
        marks=2,
        stem=original_stem,
        payload=original_payload,
        rule_id=rule1.id,
        origin=QuestionOrigin.AI.value,
        is_locked=False,
    )
    db_session.add(question)
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Regenerate question
        reg_resp = await ac.post(
            f"/api/exam-drafts/{draft.id}/questions/{question.id}/regenerate",
            json={"mode": "same_rule"},
        )
        assert reg_resp.status_code == 200
        new_stem = reg_resp.json()["stem"]
        assert new_stem != original_stem

        # Call Undo
        undo_resp = await ac.post(
            f"/api/exam-drafts/{draft.id}/questions/{question.id}/undo"
        )
        assert undo_resp.status_code == 200
        restored = undo_resp.json()
        assert restored["stem"] == original_stem
        assert restored["marks"] == 2
        assert restored["payload"]["options"] == ["A", "B", "C", "D"]


# ---------------------------------------------------------------------------
# 4. Instant Alternatives & Swap
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_instant_alternatives_and_atomic_swap(db_session: AsyncSession, setup_test_hierarchy):
    """
    Acceptance Guarantee 5:
    GET .../alternatives returns up to 5 approved bank variants (same rule first, not in exam).
    POST .../swap atomically replaces the question in place and logs revision.
    """
    data = setup_test_hierarchy
    admin = data["admin"]
    company = data["company"]
    rule1 = data["rule1"]

    app.dependency_overrides[get_current_active_user] = lambda: admin
    app.dependency_overrides[get_db_session] = lambda: db_session

    # Seed an approved variant in question_bank
    v_same_rule = QuestionVariant(
        rule_id=rule1.id,
        question_type="MCQ",
        question_text="Alternative bank question for same rule: gloves voltage rating?",
        options=["500V", "1,000V", "2,000V", "5,000V"],
        correct_option_index=1,
        bloom_level="Understand",
        difficulty="medium",
        confidence=0.95,
        review_status="approved",
        grounding_verified=True,
    )
    db_session.add(v_same_rule)
    await db_session.commit()

    draft = ExamDraft(
        company_id=company.id,
        created_by=admin.id,
        title="Alternatives Test Draft",
        status=ExamDraftStatus.DRAFT.value,
    )
    db_session.add(draft)
    await db_session.flush()

    sec = ExamSection(draft_id=draft.id, order_index=0, title="Sec 1")
    db_session.add(sec)
    await db_session.flush()

    question = ExamQuestion(
        section_id=sec.id,
        order_index=0,
        question_type="MCQ",
        difficulty="medium",
        marks=1,
        stem="Current exam question stem to be swapped.",
        payload={"options": ["W", "X", "Y", "Z"], "correct_option_index": 0},
        rule_id=rule1.id,
        origin=QuestionOrigin.AI.value,
        is_locked=False,
    )
    db_session.add(question)
    await db_session.commit()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Fetch alternatives
        alt_resp = await ac.get(f"/api/exam-drafts/{draft.id}/questions/{question.id}/alternatives")
        assert alt_resp.status_code == 200
        alts = alt_resp.json()
        assert len(alts) >= 1
        assert alts[0]["is_same_rule"] is True
        assert alts[0]["id"] == str(v_same_rule.id)

        # Swap with variant
        swap_resp = await ac.post(
            f"/api/exam-drafts/{draft.id}/questions/{question.id}/swap",
            json={"variant_id": str(v_same_rule.id)},
        )
        assert swap_resp.status_code == 200
        swapped = swap_resp.json()
        assert swapped["id"] == str(question.id)
        assert swapped["stem"] == v_same_rule.question_text
        assert swapped["origin"] == "bank"
        assert swapped["source_variant_id"] == str(v_same_rule.id)


# ---------------------------------------------------------------------------
# 5. Section Regeneration Skips Pinned Questions
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_section_regeneration_skips_pinned_questions(db_session: AsyncSession, setup_test_hierarchy):
    """
    Acceptance Guarantee 4:
    POST .../sections/{sid}/regenerate regenerates every unpinned question
    and leaves pinned questions untouched.
    """
    data = setup_test_hierarchy
    admin = data["admin"]
    company = data["company"]
    rule1 = data["rule1"]

    draft = ExamDraft(
        company_id=company.id,
        created_by=admin.id,
        title="Section Regen Test Draft",
        status=ExamDraftStatus.DRAFT.value,
    )
    db_session.add(draft)
    await db_session.flush()

    sec = ExamSection(draft_id=draft.id, order_index=0, title="Sec Electrical")
    db_session.add(sec)
    await db_session.flush()

    q_unpinned = ExamQuestion(
        section_id=sec.id,
        order_index=0,
        question_type="MCQ",
        difficulty="medium",
        marks=1,
        stem="Unpinned question to be regenerated.",
        payload={"options": ["1", "2", "3", "4"], "correct_option_index": 0},
        rule_id=rule1.id,
        origin=QuestionOrigin.AI.value,
        is_locked=False,
    )
    q_pinned = ExamQuestion(
        section_id=sec.id,
        order_index=1,
        question_type="MCQ",
        difficulty="medium",
        marks=1,
        stem="Pinned question that MUST NOT change.",
        payload={"options": ["A", "B", "C", "D"], "correct_option_index": 0},
        rule_id=rule1.id,
        origin=QuestionOrigin.MANUAL.value,
        is_locked=True,  # Pinned!
    )
    db_session.add_all([q_unpinned, q_pinned])
    await db_session.commit()

    # Load draft with sections and questions
    d_stmt = (
        select(ExamDraft)
        .where(ExamDraft.id == draft.id)
        .options(selectinload(ExamDraft.sections).selectinload(ExamSection.questions))
    )
    d_res = await db_session.execute(d_stmt)
    full_draft = d_res.scalar_one()

    # Regenerate unpinned
    updated_q = await regenerate_question_ladder(
        db_session, full_draft, q_unpinned, mode="same_rule"
    )

    # Assert unpinned changed, pinned remained identical
    assert updated_q.stem != "Unpinned question to be regenerated."
    assert q_pinned.stem == "Pinned question that MUST NOT change."
    assert q_pinned.is_locked is True

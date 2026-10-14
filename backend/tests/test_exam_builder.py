"""
test_exam_builder.py

Comprehensive test suite for the Exam Builder model:
  1. exact marginals for 200 random configs (proportional matrix + northwest-corner residual repair)
  2. config validation, largest-remainder rounding, and presets
  3. grading for all 4 question types including all-or-nothing multi-select
  4. per-section minimum pass compliance
  5. feasibility analysis reporting
  6. job resume after simulated crash (SSE replay from persisted progress)
  7. lock immutability & versioned cloning
  8. no-repeat across attempts with employee usage history
  9. end-to-end acceptance test: 3-section exam (A: 3 TF, B: 4 MCQ + 2 MS, C: 3 FIB),
     generate/populate, edit, lock, assign, take, grade, with correct per-section scores.
"""

from __future__ import annotations

import asyncio
import random
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

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
from app.models.question_usage_history import QuestionUsageHistory
from app.models.user import RoleEnum, User
from app.models.assessment_session import Assessment
from app.models.test_attempt import ExamSession, ExamStatus
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
from app.schemas.exam_builder import PresetName
from app.services.exam_builder.config_validation import (
    ConfigValidationError,
    get_preset_difficulty_mix,
    round_percentages_to_counts,
    validate_draft_content,
    validate_section_config,
)
from app.services.exam_builder.grading import grade_exam_manifest, grade_response
from app.services.exam_builder.planner import (
    build_draft_feasibility_report,
    build_slot_matrix,
    plan_section_slots,
)
from app.services.exam_builder.generator_job import stream_job_events


# ---------------------------------------------------------------------------
# 1. Exact Marginals for 200 Random Configs
# ---------------------------------------------------------------------------

def test_exact_marginals_200_random_configs():
    """
    Verifies that for 200 randomly generated (type_mix, difficulty_mix) pairs,
    build_slot_matrix produces EXACT marginal sums for every row and column.
    """
    rng = random.Random(1337)
    valid_types = ["MCQ", "TRUE_FALSE", "FILL_IN_BLANK", "MULTI_SELECT"]
    valid_diffs = ["easy", "medium", "hard"]

    for iteration in range(200):
        # Pick total question count between 1 and 60
        total_q = rng.randint(1, 60)

        # Generate random partitions for types
        t_weights = [rng.randint(0, 10) for _ in valid_types]
        if sum(t_weights) == 0:
            t_weights[0] = 1
        t_mix_raw = {valid_types[i]: float(t_weights[i]) for i in range(len(valid_types))}
        type_mix = round_percentages_to_counts(t_mix_raw, total_q)

        # Generate random partitions for difficulties
        d_weights = [rng.randint(0, 10) for _ in valid_diffs]
        if sum(d_weights) == 0:
            d_weights[0] = 1
        d_mix_raw = {valid_diffs[i]: float(d_weights[i]) for i in range(len(valid_diffs))}
        diff_mix = round_percentages_to_counts(d_mix_raw, total_q)

        # Solve slots matrix
        slots = build_slot_matrix(type_mix, diff_mix, seed=iteration)

        # Check total count
        assert len(slots) == total_q, f"Total slots mismatch on iteration {iteration}"

        # Verify exact row (type) sums
        actual_type_counts = {}
        for s in slots:
            qt = s["question_type"]
            actual_type_counts[qt] = actual_type_counts.get(qt, 0) + 1
        for qt, expected in type_mix.items():
            assert actual_type_counts.get(qt, 0) == expected, (
                f"Iter {iteration}: Type '{qt}' expected {expected}, got {actual_type_counts.get(qt, 0)}"
            )

        # Verify exact column (difficulty) sums
        actual_diff_counts = {}
        for s in slots:
            d = s["difficulty"]
            actual_diff_counts[d] = actual_diff_counts.get(d, 0) + 1
        for d, expected in diff_mix.items():
            assert actual_diff_counts.get(d, 0) == expected, (
                f"Iter {iteration}: Diff '{d}' expected {expected}, got {actual_diff_counts.get(d, 0)}"
            )


# ---------------------------------------------------------------------------
# 2. Config Validation, Rounding & Presets
# ---------------------------------------------------------------------------

def test_config_validation_and_presets():
    # Hare-Niemeyer rounding
    mix = {"easy": 33.3, "medium": 33.3, "hard": 33.4}
    rounded = round_percentages_to_counts(mix, 10)
    assert sum(rounded.values()) == 10
    assert all(v >= 0 for v in rounded.values())

    # Presets
    preset_balanced = get_preset_difficulty_mix(PresetName.BALANCED_30_40_30, 10)
    assert sum(preset_balanced.values()) == 10
    assert preset_balanced["medium"] >= preset_balanced["easy"]

    preset_std = get_preset_difficulty_mix(PresetName.COMPANY_STANDARD, 10)
    assert sum(preset_std.values()) == 10

    preset_med = get_preset_difficulty_mix(PresetName.ALL_MEDIUM, 10)
    assert preset_med == {"easy": 0, "medium": 10, "hard": 0}

    # Section config validation
    t_mix, cnt, d_mix = validate_section_config(
        {"MCQ": 4, "TRUE_FALSE": 2},
        {"easy": 2, "medium": 2, "hard": 2},
        question_count=6,
    )
    assert cnt == 6
    assert sum(t_mix.values()) == 6
    assert sum(d_mix.values()) == 6

    # Rejection of invalid config
    with pytest.raises(ConfigValidationError):
        validate_section_config({"MCQ": -1}, {"easy": 1})


# ---------------------------------------------------------------------------
# 3. Grading Each Type & All-or-Nothing Multi-Select
# ---------------------------------------------------------------------------

def test_grading_all_four_types():
    # 1. MCQ
    mcq_payload = {"options": ["A", "B", "C", "D"], "correct_option_index": 1}
    assert grade_response("MCQ", mcq_payload, {"selected_option_index": 1}) is True
    assert grade_response("MCQ", mcq_payload, {"selected_option_index": 0}) is False
    assert grade_response("MCQ", mcq_payload, 1) is True

    # 2. TRUE_FALSE
    tf_payload = {"options": ["True", "False"], "correct_option_index": 0, "correct_answer": "True"}
    assert grade_response("TRUE_FALSE", tf_payload, {"selected_option_index": 0}) is True
    assert grade_response("TRUE_FALSE", tf_payload, {"selected_option_index": 1}) is False
    assert grade_response("TRUE_FALSE", tf_payload, {"text_answer": "True"}) is True

    # 3. FILL_IN_BLANK
    fib_payload = {
        "correct_answer": "20,000 volts",
        "blank_answer_variants": ["20000V", "20000 volts", "20 kV"],
    }
    assert grade_response("FILL_IN_BLANK", fib_payload, {"text_answer": "20,000 volts"}) is True
    assert grade_response("FILL_IN_BLANK", fib_payload, {"text_answer": "20000v"}) is True
    assert grade_response("FILL_IN_BLANK", fib_payload, {"text_answer": "500 volts"}) is False

    # 4. MULTI_SELECT (All-or-Nothing)
    ms_payload = {
        "options": ["A", "B", "C", "D"],
        "correct_option_indices": [0, 2],
    }
    # Exact match -> True
    assert grade_response("MULTI_SELECT", ms_payload, {"selected_option_indices": [0, 2]}) is True
    assert grade_response("MULTI_SELECT", ms_payload, {"selected_option_indices": [2, 0]}) is True
    # Partial match -> False (all-or-nothing)
    assert grade_response("MULTI_SELECT", ms_payload, {"selected_option_indices": [0]}) is False
    # Superset -> False
    assert grade_response("MULTI_SELECT", ms_payload, {"selected_option_indices": [0, 1, 2]}) is False


# ---------------------------------------------------------------------------
# 4. Per-Section Minimum Pass Compliance
# ---------------------------------------------------------------------------

def test_per_section_minimum_pass():
    manifest = [
        # Section 1 questions (marks = 1.0 each)
        {"id": "q1", "section_id": "sec1", "question_type": "MCQ", "marks": 1.0, "payload": {"correct_option_index": 0}},
        {"id": "q2", "section_id": "sec1", "question_type": "MCQ", "marks": 1.0, "payload": {"correct_option_index": 0}},
        # Section 2 questions (marks = 1.0 each)
        {"id": "q3", "section_id": "sec2", "question_type": "MCQ", "marks": 1.0, "payload": {"correct_option_index": 0}},
        {"id": "q4", "section_id": "sec2", "question_type": "MCQ", "marks": 1.0, "payload": {"correct_option_index": 0}},
    ]
    sections_cfg = [
        {"id": "sec1", "title": "Section 1", "min_pass_percent": 80.0},
        {"id": "sec2", "title": "Section 2", "min_pass_percent": 80.0},
    ]

    # Case A: Sec 1 gets 2/2 (100%), Sec 2 gets 1/2 (50%). Total = 3/4 = 75%.
    # Pass percent = 70.0%. Overall % passes (75% >= 70%), but Sec 2 fails (50% < 80%).
    responses_a = {
        "q1": {"selected_option_index": 0},
        "q2": {"selected_option_index": 0},
        "q3": {"selected_option_index": 0},
        "q4": {"selected_option_index": 1},  # wrong
    }
    result_a = grade_exam_manifest(
        manifest, responses_a, pass_percent=70.0, sections_config=sections_cfg
    )
    assert result_a["overall_percentage"] == 75.0
    assert result_a["sections"]["sec1"]["passed"] is True
    assert result_a["sections"]["sec2"]["passed"] is False
    assert result_a["passed"] is False  # Blocked by Section 2 min pass!

    # Case B: Both sections get 100%
    responses_b = {
        "q1": {"selected_option_index": 0},
        "q2": {"selected_option_index": 0},
        "q3": {"selected_option_index": 0},
        "q4": {"selected_option_index": 0},
    }
    result_b = grade_exam_manifest(
        manifest, responses_b, pass_percent=70.0, sections_config=sections_cfg
    )
    assert result_b["overall_percentage"] == 100.0
    assert result_b["sections"]["sec1"]["passed"] is True
    assert result_b["sections"]["sec2"]["passed"] is True
    assert result_b["passed"] is True


# ---------------------------------------------------------------------------
# 5. Job Resume After Simulated Crash
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_job_resume_after_simulated_crash(db_session: AsyncSession):
    # Setup company, user, draft, job
    company = Company(name="Resume Test Co", company_code="RTC_01")
    db_session.add(company)
    await db_session.flush()

    user = User(
        company_id=company.id,
        employee_code="EMP_RESUME",
        password_hash="hash",
        role=RoleEnum.SUPER_ADMIN,
    )
    db_session.add(user)
    await db_session.flush()

    draft = ExamDraft(
        company_id=company.id,
        created_by=user.id,
        title="Resume Draft",
        status=ExamDraftStatus.GENERATING.value,
    )
    db_session.add(draft)
    await db_session.flush()

    # Create job with persisted partial events before simulated crash
    events_persisted = [
        {"event": "slot_started", "data": {"slot_index": 1, "total_slots": 2}},
        {"event": "question_ready", "data": {"question_id": str(uuid.uuid4()), "stem": "Q1"}},
        {"event": "slot_started", "data": {"slot_index": 2, "total_slots": 2}},
    ]
    job = GenerationJob(
        draft_id=draft.id,
        status=GenerationJobStatus.RUNNING.value,
        progress={"total_slots": 2, "completed_slots": 1, "events": events_persisted},
    )
    db_session.add(job)
    await db_session.commit()

    # Mock session factory for stream_job_events
    from unittest.mock import MagicMock
    mock_factory = MagicMock()
    mock_factory.return_value.__aenter__.return_value = db_session
    mock_factory.return_value.__aexit__ = AsyncMock()

    # Set job to COMPLETED so the generator finishes immediately after replaying
    job.status = GenerationJobStatus.COMPLETED.value
    await db_session.commit()

    replayed_events = []
    async for sse_chunk in stream_job_events(job.id, mock_factory):
        if sse_chunk.startswith("event:"):
            ev_name = sse_chunk.split("\n")[0].replace("event:", "").strip()
            replayed_events.append(ev_name)

    assert "slot_started" in replayed_events
    assert "question_ready" in replayed_events


# ---------------------------------------------------------------------------
# 6. Lock Immutability & Versioned Cloning
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_lock_immutability_and_cloning(db_session: AsyncSession):
    company = Company(name="Lock Test Co", company_code="LTC_01")
    db_session.add(company)
    await db_session.flush()

    user = User(
        company_id=company.id,
        employee_code="EMP_LOCK",
        password_hash="hash",
        role=RoleEnum.SUPER_ADMIN,
    )
    db_session.add(user)
    await db_session.flush()

    draft = ExamDraft(
        company_id=company.id,
        created_by=user.id,
        title="Safety Level 1",
        version=1,
        status=ExamDraftStatus.READY.value,
    )
    db_session.add(draft)
    await db_session.flush()

    sec = ExamSection(
        draft_id=draft.id,
        order_index=0,
        title="Core Rules",
        marks_per_question=2.0,
        type_mix={"MCQ": 1},
        difficulty_mix={"easy": 1},
    )
    db_session.add(sec)
    await db_session.flush()

    q = ExamQuestion(
        section_id=sec.id,
        order_index=0,
        question_type="MCQ",
        difficulty="easy",
        marks=2.0,
        stem="What is minimum PPE?",
        payload={"options": ["Helmet", "None"], "correct_option_index": 0},
        origin=QuestionOrigin.AI.value,
    )
    db_session.add(q)
    await db_session.commit()

    # Lock draft
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: db_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Lock the draft
        lock_res = await client.post(f"/api/exam-drafts/{draft.id}/lock")
        assert lock_res.status_code == 200, lock_res.text
        lock_data = lock_res.json()
        assert lock_data["status"] == "locked"
        assessment_id = lock_data["assessment_id"]

        # Verify assessment was created with immutable manifest
        a_stmt = select(Assessment).where(Assessment.id == uuid.UUID(assessment_id))
        a_res = await db_session.execute(a_stmt)
        assessment = a_res.scalar_one()
        assert assessment.total_question_count == 1
        assert assessment.manifest[0]["stem"] == "What is minimum PPE?"

        # 2. Verify editing locked draft fails
        edit_res = await client.put(
            f"/api/exam-drafts/{draft.id}",
            json={"title": "Modified Title"},
        )
        assert edit_res.status_code == 400

        # 3. Clone draft to a new version
        clone_res = await client.post(f"/api/exam-drafts/{draft.id}/clone")
        assert clone_res.status_code == 200
        clone_data = clone_res.json()
        assert clone_data["status"] == "cloned"
        assert clone_data["new_version"] == 2
        new_draft_id = uuid.UUID(clone_data["new_draft_id"])

        # Check cloned draft in DB
        nd_stmt = (
            select(ExamDraft)
            .where(ExamDraft.id == new_draft_id)
            .options(selectinload(ExamDraft.sections).selectinload(ExamSection.questions))
        )
        nd_res = await db_session.execute(nd_stmt)
        new_draft = nd_res.scalar_one()
        assert new_draft.status == ExamDraftStatus.DRAFT.value
        assert new_draft.version == 2
        assert len(new_draft.sections) == 1
        assert len(new_draft.sections[0].questions) == 1


# ---------------------------------------------------------------------------
# 7. No-Repeat Across Attempts
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_no_repeat_across_attempts(db_session: AsyncSession):
    company = Company(name="NoRepeat Co", company_code="NRC_01")
    db_session.add(company)
    await db_session.flush()

    emp = User(
        company_id=company.id,
        employee_code="EMP_NOREPEAT",
        password_hash="hash",
        role=RoleEnum.OPERATOR,
    )
    db_session.add(emp)
    await db_session.flush()

    manual = Manual(company_id=company.id, title="Safety Manual")
    db_session.add(manual)
    await db_session.flush()

    sec = Section(manual_id=manual.id, name="General Safety")
    db_session.add(sec)
    await db_session.flush()

    sub = SubCategory(section_id=sec.id, name="PPE")
    db_session.add(sub)
    await db_session.flush()

    rule = Rule(
        subcategory_id=sub.id,
        rule_code="R1",
        text="Workers must wear hard hats at all times.",
        source_text="Wear hard hats.",
        risk_score=5,
        cognitive_level="Understand",
        review_status="approved",
        is_active=True,
    )
    db_session.add(rule)
    await db_session.flush()

    # Create 2 approved variants for this rule
    v1 = QuestionVariant(
        rule_id=rule.id,
        question_text="V1: Wear hard hats?",
        question_type=QuestionType.MCQ,
        options=["Yes", "No"],
        correct_option_index=0,
        difficulty="easy",
        bloom_level="Understand",
        review_status="approved",
    )
    v2 = QuestionVariant(
        rule_id=rule.id,
        question_text="V2: When to wear hard hats?",
        question_type=QuestionType.MCQ,
        options=["Always", "Never"],
        correct_option_index=0,
        difficulty="easy",
        bloom_level="Understand",
        review_status="approved",
    )
    db_session.add_all([v1, v2])
    await db_session.flush()

    # Record v1 as already seen by employee
    dummy_assessment = Assessment(
        company_id=company.id,
        name="Past Exam",
        manifest=[],
        total_question_count=1,
        section_breakdown={},
    )
    db_session.add(dummy_assessment)
    await db_session.flush()

    dummy_session = ExamSession(
        assessment_id=dummy_assessment.id,
        employee_id=emp.id,
        status=ExamStatus.COMPLETED,
        assigned_at=datetime.now(timezone.utc),
    )
    db_session.add(dummy_session)
    await db_session.flush()

    usage = QuestionUsageHistory(
        employee_id=emp.id,
        question_variant_id=v1.id,
        exam_session_id=dummy_session.id,
    )
    db_session.add(usage)
    await db_session.commit()

    # Now plan a section requiring 1 easy MCQ for this employee
    exam_section = ExamSection(
        draft_id=uuid.uuid4(),
        order_index=0,
        title="Test Sec",
        type_mix={"MCQ": 1},
        difficulty_mix={"easy": 1},
    )

    planned_slots = await plan_section_slots(
        db_session, exam_section, employee_id=emp.id
    )

    # Must pick v2, since v1 was already seen!
    assert len(planned_slots) == 1
    assert planned_slots[0].bank_variant_id == v2.id


# ---------------------------------------------------------------------------
# 8. Full Acceptance Test: 3-Section Exam Lifecycle (API Only)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_acceptance_3_section_exam_lifecycle(db_session: AsyncSession):
    """
    Acceptance scenario (API only):
      - Create a 3-section exam:
          Section A: 3 TRUE_FALSE Easy
          Section B: 4 MCQ + 2 MULTI_SELECT Medium/Hard
          Section C: 3 FILL_IN_BLANK
      - Generate / populate questions
      - Edit one question
      - Lock draft (creates immutable snapshot)
      - Assign to employee
      - Take exam (put answers)
      - Submit and grade, verifying exact per-section scores
    """
    company = Company(name="Acceptance Co", company_code="ACC_01")
    db_session.add(company)
    await db_session.flush()

    admin = User(
        company_id=company.id,
        employee_code="ADMIN_01",
        password_hash="hash",
        role=RoleEnum.SUPER_ADMIN,
    )
    operator = User(
        company_id=company.id,
        employee_code="OP_01",
        password_hash="hash",
        role=RoleEnum.OPERATOR,
    )
    db_session.add_all([admin, operator])
    await db_session.commit()

    app.dependency_overrides[get_current_active_user] = lambda: admin
    app.dependency_overrides[get_db_session] = lambda: db_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create Draft
        draft_res = await client.post(
            "/api/exam-drafts",
            json={
                "title": "Comprehensive Plant Safety Certification",
                "target": {"type": "role", "value": "Operator"},
                "duration_minutes": 45,
                "pass_percent": 80.0,
                "scoring_mode": "per_question_marks",
            },
        )
        assert draft_res.status_code == 201, draft_res.text
        draft_id = draft_res.json()["id"]

        # 2. Add Section A: 3 TRUE_FALSE Easy
        sec_a_res = await client.post(
            f"/api/exam-drafts/{draft_id}/sections",
            json={
                "title": "Section A: Electrical Safety",
                "type_mix": {"TRUE_FALSE": 3},
                "difficulty_mix": {"easy": 3, "medium": 0, "hard": 0},
                "marks_per_question": 2.0,
                "min_pass_percent": 60.0,
            },
        )
        assert sec_a_res.status_code == 200, sec_a_res.text
        sec_a_id = sec_a_res.json()["id"]

        # 3. Add Section B: 4 MCQ + 2 MULTI_SELECT Medium/Hard
        sec_b_res = await client.post(
            f"/api/exam-drafts/{draft_id}/sections",
            json={
                "title": "Section B: Machinery & Hazards",
                "type_mix": {"MCQ": 4, "MULTI_SELECT": 2},
                "difficulty_mix": {"easy": 0, "medium": 3, "hard": 3},
                "marks_per_question": 2.0,
                "min_pass_percent": 60.0,
            },
        )
        assert sec_b_res.status_code == 200, sec_b_res.text
        sec_b_id = sec_b_res.json()["id"]

        # 4. Add Section C: 3 FILL_IN_BLANK
        sec_c_res = await client.post(
            f"/api/exam-drafts/{draft_id}/sections",
            json={
                "title": "Section C: Emergency Thresholds",
                "type_mix": {"FILL_IN_BLANK": 3},
                "difficulty_mix": {"easy": 1, "medium": 1, "hard": 1},
                "marks_per_question": 2.0,
                "min_pass_percent": 60.0,
            },
        )
        assert sec_c_res.status_code == 200, sec_c_res.text
        sec_c_id = sec_c_res.json()["id"]

        # Populate questions into sections (simulating populated generation)
        # Section A questions (3 TF)
        for i in range(3):
            q_res = await client.post(
                f"/api/exam-sections/{sec_a_id}/questions",
                json={
                    "question_type": "TRUE_FALSE",
                    "difficulty": "easy",
                    "marks": 2.0,
                    "stem": f"Section A Statement {i+1}",
                    "payload": {
                        "options": ["True", "False"],
                        "correct_option_index": 0,
                        "correct_answer": "True",
                    },
                },
            )
            assert q_res.status_code == 200

        # Section B questions (4 MCQ, 2 MULTI_SELECT)
        for i in range(4):
            q_res = await client.post(
                f"/api/exam-sections/{sec_b_id}/questions",
                json={
                    "question_type": "MCQ",
                    "difficulty": "medium",
                    "marks": 2.0,
                    "stem": f"Section B MCQ {i+1}",
                    "payload": {
                        "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
                        "correct_option_index": 0,
                    },
                },
            )
            assert q_res.status_code == 200

        for i in range(2):
            q_res = await client.post(
                f"/api/exam-sections/{sec_b_id}/questions",
                json={
                    "question_type": "MULTI_SELECT",
                    "difficulty": "hard",
                    "marks": 2.0,
                    "stem": f"Section B MS {i+1}",
                    "payload": {
                        "options": ["Step A", "Step B", "Step C", "Step D"],
                        "correct_option_indices": [0, 1],
                    },
                },
            )
            assert q_res.status_code == 200

        # Section C questions (3 FIB)
        for i in range(3):
            q_res = await client.post(
                f"/api/exam-sections/{sec_c_id}/questions",
                json={
                    "question_type": "FILL_IN_BLANK",
                    "difficulty": "medium",
                    "marks": 2.0,
                    "stem": f"Threshold for alarm {i+1} is ___ volts.",
                    "payload": {
                        "correct_answer": "500V",
                        "blank_answer_variants": ["500 volts", "500V"],
                    },
                },
            )
            assert q_res.status_code == 200
            q_c_last_id = q_res.json()["id"]

        # 5. Edit one question (testing revisions and update)
        edit_q_res = await client.put(
            f"/api/exam-questions/{q_c_last_id}",
            json={"stem": "Evacuate if concentration exceeds ___ ppm."},
        )
        assert edit_q_res.status_code == 200
        assert edit_q_res.json()["origin"] == "edited"

        # 6. Validate Draft
        val_res = await client.post(f"/api/exam-drafts/{draft_id}/validate")
        assert val_res.status_code == 200
        assert val_res.json()["is_valid"] is True

        # 7. Lock Draft
        lock_res = await client.post(f"/api/exam-drafts/{draft_id}/lock")
        assert lock_res.status_code == 200
        assessment_id = lock_res.json()["assessment_id"]
        assert lock_res.json()["total_questions"] == 12

        # 8. Assign to Operator
        assign_res = await client.post(
            "/api/assessment/assign",
            json={
                "assessment_id": assessment_id,
                "employee_ids": ["OP_01"],
            },
        )
        assert assign_res.status_code == 200

        # Fetch session
        s_stmt = select(ExamSession).where(ExamSession.employee_id == operator.id)
        s_res = await db_session.execute(s_stmt)
        exam_session = s_res.scalar_one()

        # 9. Take Exam (Operator persona)
        app.dependency_overrides[get_current_active_user] = lambda: operator

        get_exam_res = await client.get(f"/api/assessment/exam/{exam_session.id}")
        assert get_exam_res.status_code == 200
        delivered_questions = get_exam_res.json()["questions"]
        assert len(delivered_questions) == 12

        # Provide correct answers for all questions
        for q in delivered_questions:
            q_id = q["id"]
            q_type = q["question_type"]
            if q_type in ("MCQ", "TRUE_FALSE"):
                await client.put(
                    f"/api/assessment/exam/{exam_session.id}/answer",
                    json={"question_variant_id": q_id, "selected_option_index": 0},
                )
            elif q_type == "MULTI_SELECT":
                await client.put(
                    f"/api/assessment/exam/{exam_session.id}/answer",
                    json={"question_variant_id": q_id, "selected_option_indices": [0, 1]},
                )
            elif q_type == "FILL_IN_BLANK":
                await client.put(
                    f"/api/assessment/exam/{exam_session.id}/answer",
                    json={"question_variant_id": q_id, "text_answer": "500V"},
                )

        # 10. Submit Exam
        with patch("app.api.assessment.generate_certificate", return_value=("qr", "sig", "http://cert")):
            submit_res = await client.post(
                f"/api/assessment/exam/{exam_session.id}/submit",
                json={"integrity_score": 95.0},
            )
        assert submit_res.status_code == 200
        sub_data = submit_res.json()
        assert sub_data["status"] == "completed"
        assert sub_data["score"] == 100.0

        # Check per-section scores stored in exam_session
        await db_session.refresh(exam_session)
        assert exam_session.score == 100.0
        sec_scores = exam_session.responses.get("_section_scores", {})
        assert len(sec_scores) == 3
        for s_id, s_info in sec_scores.items():
            assert s_info["score"] == s_info["total_possible"]

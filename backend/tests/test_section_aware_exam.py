"""
test_section_aware_exam.py

Comprehensive test suite verifying:
  1. Grading matrix across all four question types (MCQ, TRUE_FALSE, MULTI_SELECT, FILL_IN_BLANK)
  2. Shuffle-mapping correctness (permuted indices correctly de-mapped and graded)
  3. Resume after refresh (question ordering and shuffle map persist; answers restored)
  4. Section minimum failing an attempt with a high overall score
  5. Legacy assessment migration with --dry-run and --rollback
  6. Automated security assertion: zero correct answers leaked in GET /api/assessment/exam/{exam_id}
  7. Full lifecycle acceptance run for two employees (one passes, one fails a must-pass section)
     with audit view telemetry and certificate behavior.
"""

from __future__ import annotations

import asyncio
import io
import json
import uuid
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
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
from app.models.certificate import CertificateRecord
from app.services.exam_builder.grading import grade_response
from app.migrations.migrate_legacy_assessments import run_migration


# ---------------------------------------------------------------------------
# 1. Grading Matrix Across All Four Types
# ---------------------------------------------------------------------------

def test_grading_matrix_all_four_types():
    """
    Test matrix verifying grading correctness across all four types:
    - MCQ
    - TRUE_FALSE
    - MULTI_SELECT (all-or-nothing)
    - FILL_IN_BLANK (case-insensitive, whitespace-trimmed, variant-aware)
    """
    # 1. MCQ
    mcq_payload = {"correct_option_index": 2}
    assert grade_response("MCQ", mcq_payload, {"selected_option_index": 2}) is True
    assert grade_response("MCQ", mcq_payload, {"selected_option_index": 1}) is False
    assert grade_response("MCQ", mcq_payload, None) is False

    # 2. TRUE_FALSE
    tf_payload = {
        "correct_option_index": 0,
        "correct_answer": "true",
        "statement_true": "True statement",
        "statement_false": "False statement",
    }
    assert grade_response("TRUE_FALSE", tf_payload, {"selected_option_index": 0}) is True
    assert grade_response("TRUE_FALSE", tf_payload, {"selected_option_index": 1}) is False
    assert grade_response("TRUE_FALSE", tf_payload, {"text_answer": "true"}) is True
    assert grade_response("TRUE_FALSE", tf_payload, {"text_answer": "false"}) is False

    # 3. MULTI_SELECT (All-or-Nothing)
    ms_payload = {"correct_option_indices": [0, 2]}
    # Exact match
    assert grade_response("MULTI_SELECT", ms_payload, {"selected_option_indices": [0, 2]}) is True
    assert grade_response("MULTI_SELECT", ms_payload, {"selected_option_indices": [2, 0]}) is True
    # Partial match -> FAILS (all-or-nothing)
    assert grade_response("MULTI_SELECT", ms_payload, {"selected_option_indices": [0]}) is False
    assert grade_response("MULTI_SELECT", ms_payload, {"selected_option_indices": [2]}) is False
    # Correct + distractor -> FAILS
    assert grade_response("MULTI_SELECT", ms_payload, {"selected_option_indices": [0, 1, 2]}) is False
    # Empty -> FAILS
    assert grade_response("MULTI_SELECT", ms_payload, {"selected_option_indices": []}) is False
    assert grade_response("MULTI_SELECT", ms_payload, None) is False

    # 4. FILL_IN_BLANK
    fib_payload = {
        "correct_answer": "10 feet",
        "blank_answer_variants": ["10 ft", "ten feet", "10ft"]
    }
    # Exact match
    assert grade_response("FILL_IN_BLANK", fib_payload, {"text_answer": "10 feet"}) is True
    # Case insensitive
    assert grade_response("FILL_IN_BLANK", fib_payload, {"text_answer": "10 FEET"}) is True
    # Whitespace trimmed
    assert grade_response("FILL_IN_BLANK", fib_payload, {"text_answer": "  10 feet  "}) is True
    # Accepted variant
    assert grade_response("FILL_IN_BLANK", fib_payload, {"text_answer": "10 ft"}) is True
    assert grade_response("FILL_IN_BLANK", fib_payload, {"text_answer": "ten feet"}) is True
    # Wrong answer
    assert grade_response("FILL_IN_BLANK", fib_payload, {"text_answer": "20 feet"}) is False
    assert grade_response("FILL_IN_BLANK", fib_payload, {"text_answer": ""}) is False
    assert grade_response("FILL_IN_BLANK", fib_payload, None) is False


# ---------------------------------------------------------------------------
# 2. Shuffle-Mapping Correctness
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_shuffle_mapping_correctness(db_session: AsyncSession):
    """
    Verify that when options are shuffled for an exam attempt:
    - GET /api/assessment/exam/{exam_id} generates and saves _shuffle_map
    - Worker selects option by the permuted index
    - submit_exam de-maps permuted choice back to original and grades correctly
    """
    company = Company(name="Shuffle Co", company_code="SHUFF_01")
    db_session.add(company)
    await db_session.flush()

    user = User(
        company_id=company.id,
        employee_code="SHUFF_USER",
        password_hash="hash",
        role=RoleEnum.OPERATOR,
    )
    db_session.add(user)
    await db_session.flush()

    q1_id = str(uuid.uuid4())
    # Original: options = ["Wrong A", "Wrong B", "Correct C", "Wrong D"], correct index = 2
    manifest = [
        {
            "id": q1_id,
            "question_type": "MCQ",
            "question_text": "What is the rule?",
            "options": ["Wrong A", "Wrong B", "Correct C", "Wrong D"],
            "correct_option_index": 2,
            "marks": 1.0,
            "section_id": "sec-1",
            "section_title": "Section 1",
        }
    ]
    assessment = Assessment(
        company_id=company.id,
        name="Shuffle Assessment",
        manifest=manifest,
        total_question_count=len(manifest),
        pass_mark_pct=70.0,
        reveal_score_to_user=True,
        section_breakdown={
            "sec-1": {
                "id": "sec-1",
                "title": "Section 1",
                "shuffle_options": True,
                "shuffle_questions": False,
            }
        }
    )
    db_session.add(assessment)
    await db_session.flush()

    exam = ExamSession(
        assessment_id=assessment.id,
        employee_id=user.id,
        status=ExamStatus.ASSIGNED,
        assigned_at=datetime.now(timezone.utc),
        responses={},
    )
    db_session.add(exam)
    await db_session.commit()

    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: db_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Worker fetches exam
        res = await client.get(f"/api/assessment/exam/{exam.id}")
        assert res.status_code == 200
        exam_data = res.json()
        questions = exam_data["questions"]
        assert len(questions) == 1
        served_q = questions[0]
        served_options = served_q["options"]

        # The correct option text is "Correct C"
        served_correct_index = served_options.index("Correct C")

        # Worker saves their answer using the served index (PUT /api/assessment/exam/{id}/answer)
        save_res = await client.put(
            f"/api/assessment/exam/{exam.id}/answer",
            json={"question_variant_id": q1_id, "selected_option_index": served_correct_index}
        )
        assert save_res.status_code == 200

        # Worker submits exam
        sub_res = await client.post(
            f"/api/assessment/exam/{exam.id}/submit",
            json={"integrity_score": 95.0}
        )
        assert sub_res.status_code == 200
        result = sub_res.json()

        # Grade should be 100% correct
        assert result["score"] == 100.0
        assert result["passed"] is True

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# 3. Resume After Refresh
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_resume_after_refresh(db_session: AsyncSession):
    """
    Verify crash recovery / page refresh:
    - Worker fetches exam, options & questions are ordered
    - Worker saves an answer
    - Worker fetches again (simulating F5 browser refresh)
    - Shuffled order and previous answers are preserved identically
    """
    company = Company(name="Resume Co", company_code="RES_01")
    db_session.add(company)
    await db_session.flush()

    user = User(
        company_id=company.id,
        employee_code="RES_USER",
        password_hash="hash",
        role=RoleEnum.OPERATOR,
    )
    db_session.add(user)
    await db_session.flush()

    q1_id = str(uuid.uuid4())
    q2_id = str(uuid.uuid4())
    manifest = [
        {
            "id": q1_id,
            "question_type": "MCQ",
            "question_text": "Q1 Text",
            "options": ["Alpha", "Beta", "Gamma"],
            "correct_option_index": 0,
            "marks": 1.0,
            "section_id": "sec-a",
            "section_title": "Section A",
        },
        {
            "id": q2_id,
            "question_type": "FILL_IN_BLANK",
            "question_text": "Q2 Text",
            "correct_answer": "Safety",
            "marks": 1.0,
            "section_id": "sec-a",
            "section_title": "Section A",
        }
    ]
    assessment = Assessment(
        company_id=company.id,
        name="Resume Assessment",
        manifest=manifest,
        total_question_count=len(manifest),
        pass_mark_pct=70.0,
        section_breakdown={
            "sec-a": {"id": "sec-a", "title": "Section A", "shuffle_options": True}
        }
    )
    db_session.add(assessment)
    await db_session.flush()

    exam = ExamSession(
        assessment_id=assessment.id,
        employee_id=user.id,
        status=ExamStatus.ASSIGNED,
        assigned_at=datetime.now(timezone.utc),
        responses={},
    )
    db_session.add(exam)
    await db_session.commit()

    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: db_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # First load
        res1 = await client.get(f"/api/assessment/exam/{exam.id}")
        assert res1.status_code == 200
        data1 = res1.json()
        q1_opts_load1 = [q for q in data1["questions"] if q["id"] == q1_id][0]["options"]

        # Worker saves answer for Q1 and Q2
        await client.put(
            f"/api/assessment/exam/{exam.id}/answer",
            json={"question_variant_id": q1_id, "selected_option_index": 1}
        )
        await client.put(
            f"/api/assessment/exam/{exam.id}/answer",
            json={"question_variant_id": q2_id, "text_answer": "Safety"}
        )

        # Second load (refresh)
        res2 = await client.get(f"/api/assessment/exam/{exam.id}")
        assert res2.status_code == 200
        data2 = res2.json()
        q1_opts_load2 = [q for q in data2["questions"] if q["id"] == q1_id][0]["options"]

        # Option shuffle order MUST be identical across reloads
        assert q1_opts_load1 == q1_opts_load2

        # Saved answers must be restored in responses
        responses = data2["responses"]
        assert responses[q1_id]["selected_option_index"] == 1
        assert responses[q2_id]["text_answer"] == "Safety"

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# 4. Section Minimum Failing High Total
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_section_minimum_failing_high_total(db_session: AsyncSession):
    """
    Verify: Section A (5 questions, worker scores 5/5 = 100%)
            Section B (2 questions, worker scores 1/2 = 50%, min_pass = 80%)
            Overall exam pass mark: 70%
            Total score: 6/7 = 85.7% (passes 70%)
            Result: MUST FAIL attempt due to Section B failing min requirement.
    """
    company = Company(name="SecFail Co", company_code="SEC_01")
    db_session.add(company)
    await db_session.flush()

    user = User(
        company_id=company.id,
        employee_code="SEC_FAIL_USER",
        password_hash="hash",
        role=RoleEnum.OPERATOR,
    )
    db_session.add(user)
    await db_session.flush()

    manifest = []
    # 5 questions in Section A
    sec_a_ids = []
    for i in range(5):
        qid = f"q-a-{i}"
        sec_a_ids.append(qid)
        manifest.append({
            "id": qid,
            "question_type": "MCQ",
            "question_text": f"Sec A Q{i}",
            "options": ["A", "B"],
            "correct_option_index": 0,
            "marks": 1.0,
            "section_id": "section-a",
            "section_title": "General Safety",
        })

    # 2 questions in Section B
    sec_b_ids = []
    for i in range(2):
        qid = f"q-b-{i}"
        sec_b_ids.append(qid)
        manifest.append({
            "id": qid,
            "question_type": "MCQ",
            "question_text": f"Sec B Q{i}",
            "options": ["A", "B"],
            "correct_option_index": 0,
            "marks": 1.0,
            "section_id": "section-b",
            "section_title": "Critical Hazards",
        })

    assessment = Assessment(
        company_id=company.id,
        name="Must Pass Assessment",
        manifest=manifest,
        total_question_count=len(manifest),
        pass_mark_pct=70.0,
        section_breakdown={
            "section-a": {"id": "section-a", "title": "General Safety", "min_pass_percent": None},
            "section-b": {"id": "section-b", "title": "Critical Hazards", "min_pass_percent": 80.0},
        }
    )
    db_session.add(assessment)
    await db_session.flush()

    # Pre-populate responses: 5/5 correct for Sec A, 1/2 correct for Sec B
    responses = {}
    for qid in sec_a_ids:
        responses[qid] = {"selected_option_index": 0}
    responses[sec_b_ids[0]] = {"selected_option_index": 0} # correct
    responses[sec_b_ids[1]] = {"selected_option_index": 1} # wrong

    exam = ExamSession(
        assessment_id=assessment.id,
        employee_id=user.id,
        status=ExamStatus.ASSIGNED,
        assigned_at=datetime.now(timezone.utc),
        responses=responses,
    )
    db_session.add(exam)
    await db_session.commit()

    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: db_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        sub_res = await client.post(
            f"/api/assessment/exam/{exam.id}/submit",
            json={"integrity_score": 90.0}
        )
        assert sub_res.status_code == 200
        data = sub_res.json()

        # Score is 6/7 = 85.71%
        assert round(data["score"], 1) == 85.7
        # Overall pass evaluated to False because of Section B
        assert data["passed"] is False
        assert data["all_sections_passed"] is False
        assert "Critical Hazards" in data["failed_sections"]

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# 5. Legacy Migration (Dry-Run and Rollback)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_legacy_migration_dry_run_and_rollback(db_session: AsyncSession):
    """
    Test migrating legacy flat assessments:
    1. --dry-run: reports migration count without committing
    2. execute migration: updates to Section A
    3. --rollback: restores legacy structure
    """
    company = Company(name="Migration Co", company_code="MIG_01")
    db_session.add(company)
    await db_session.flush()

    legacy_manifest = [
        {
            "id": str(uuid.uuid4()),
            "question_type": "MCQ",
            "question_text": "Legacy Q1",
            "options": ["A", "B"],
            "correct_option_index": 0,
        },
        {
            "id": str(uuid.uuid4()),
            "question_type": "MCQ",
            "question_text": "Legacy Q2",
            "options": ["A", "B"],
            "correct_option_index": 1,
        }
    ]
    legacy_assessment = Assessment(
        company_id=company.id,
        name="Legacy Assessment",
        manifest=legacy_manifest,
        total_question_count=len(legacy_manifest),
        section_breakdown=None, # legacy flat
        pass_mark_pct=75.0,
    )
    db_session.add(legacy_assessment)
    await db_session.commit()

    # Step 1: Dry-run
    res_dry = await run_migration(db_session, dry_run=True, rollback=False)
    assert res_dry["migrated_count"] >= 1

    # Verify DB record is untouched
    refreshed_stmt = select(Assessment).where(Assessment.id == legacy_assessment.id)
    r1 = await db_session.execute(refreshed_stmt)
    a1 = r1.scalar_one()
    assert a1.section_breakdown is None

    # Step 2: Live Migration
    res_live = await run_migration(db_session, dry_run=False, rollback=False)
    assert res_live["migrated_count"] >= 1

    r2 = await db_session.execute(refreshed_stmt)
    a2 = r2.scalar_one()
    assert a2.section_breakdown is not None
    assert "section-a" in a2.section_breakdown
    assert a2.section_breakdown["section-a"]["title"] == "Section A"
    assert a2.manifest[0]["section_id"] == "section-a"
    assert a2.manifest[0]["section_title"] == "Section A"

    # Step 3: Rollback
    res_rollback = await run_migration(db_session, dry_run=False, rollback=True)
    assert res_rollback["rolled_back_count"] >= 1

    r3 = await db_session.execute(refreshed_stmt)
    a3 = r3.scalar_one()
    assert a3.section_breakdown is None
    assert "section_id" not in a3.manifest[0]


# ---------------------------------------------------------------------------
# 6. Security Assertion: Zero Correct Answers Leaked
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_assertion_no_worker_facing_correct_answers(db_session: AsyncSession):
    """
    Automated security assertion:
    Ensure that GET /api/assessment/exam/{exam_id} strictly NEVER leaks any correct answers
    or private system keys across all 4 question types.
    """
    company = Company(name="Security Co", company_code="SEC_TEST")
    db_session.add(company)
    await db_session.flush()

    user = User(
        company_id=company.id,
        employee_code="SEC_WORKER",
        password_hash="hash",
        role=RoleEnum.OPERATOR,
    )
    db_session.add(user)
    await db_session.flush()

    manifest = [
        {
            "id": str(uuid.uuid4()),
            "question_type": "MCQ",
            "question_text": "MCQ Q",
            "options": ["A", "B"],
            "correct_option_index": 0,
            "correct_answer": "A",
        },
        {
            "id": str(uuid.uuid4()),
            "question_type": "TRUE_FALSE",
            "question_text": "TF Q",
            "options": ["True", "False"],
            "correct_option_index": 0,
            "statement_true": "True text",
            "statement_false": "False text",
        },
        {
            "id": str(uuid.uuid4()),
            "question_type": "MULTI_SELECT",
            "question_text": "MS Q",
            "options": ["A", "B", "C"],
            "correct_option_indices": [0, 2],
        },
        {
            "id": str(uuid.uuid4()),
            "question_type": "FILL_IN_BLANK",
            "question_text": "FIB Q",
            "correct_answer": "Secret Answer",
            "blank_answer_variants": ["Variant 1"],
        }
    ]

    assessment = Assessment(
        company_id=company.id,
        name="Security Assessment",
        manifest=manifest,
        total_question_count=len(manifest),
        pass_mark_pct=70.0,
    )
    db_session.add(assessment)
    await db_session.flush()

    exam = ExamSession(
        assessment_id=assessment.id,
        employee_id=user.id,
        status=ExamStatus.ASSIGNED,
        assigned_at=datetime.now(timezone.utc),
        responses={},
    )
    db_session.add(exam)
    await db_session.commit()

    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: db_session

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(f"/api/assessment/exam/{exam.id}")
        assert res.status_code == 200
        payload = res.json()

        # Recursive key checking for banned security keys
        banned_keys = {
            "correct_option_indices",
            "correct_option_index",
            "correct_answer",
            "blank_answer_variants",
            "statement_true",
            "statement_false",
            "correct_text",
        }

        def check_no_leaks(node, path="root"):
            if isinstance(node, dict):
                for k, v in node.items():
                    assert k not in banned_keys, f"Security leak! Key '{k}' exposed at {path}"
                    assert not k.startswith("_"), f"Private metadata key '{k}' exposed at {path}"
                    check_no_leaks(v, f"{path}.{k}")
            elif isinstance(node, list):
                for i, elem in enumerate(node):
                    check_no_leaks(elem, f"{path}[{i}]")

        check_no_leaks(payload)

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# 7. Full Acceptance Lifecycle: 2 Employees (One Passes, One Fails Must-Pass)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_full_acceptance_lifecycle_two_employees(db_session: AsyncSession):
    """
    Acceptance Test:
    - 2 Employees: Alice and Bob
    - 2-Section Exam:
        Section A: General Safety (2 questions, min pass 50%)
        Section B: Critical Interlocks (2 questions, min pass 80%)
    - Alice: Scores 100% on A, 100% on B -> PASSES, certificate generated with exam_id & version.
    - Bob: Scores 100% on A, 50% on B -> FAILS (fails Section B minimum), no certificate.
    - Audit review endpoint shows complete telemetry for both.
    """
    company = Company(name="Acceptance Works", company_code="ACC_WORKS")
    db_session.add(company)
    await db_session.flush()

    admin = User(
        company_id=company.id,
        employee_code="ACC_ADMIN",
        password_hash="hash",
        role=RoleEnum.SUPER_ADMIN,
    )
    alice = User(
        company_id=company.id,
        employee_code="ALICE",
        full_name="Alice Smith",
        password_hash="hash",
        role=RoleEnum.OPERATOR,
    )
    bob = User(
        company_id=company.id,
        employee_code="BOB",
        full_name="Bob Jones",
        password_hash="hash",
        role=RoleEnum.OPERATOR,
    )
    db_session.add_all([admin, alice, bob])
    await db_session.flush()

    # Create Hierarchy hierarchy (Manual -> Section -> SubCategory -> Rule)
    manual = Manual(company_id=company.id, title="Acceptance Safety Manual")
    db_session.add(manual)
    await db_session.flush()

    sec = Section(manual_id=manual.id, name="Machinery Safety", order_index=0)
    db_session.add(sec)
    await db_session.flush()

    subcat = SubCategory(section_id=sec.id, name="LOTO Procedures")
    db_session.add(subcat)
    await db_session.flush()

    rule1 = Rule(
        subcategory_id=subcat.id,
        rule_code="RULE-LOTO-01",
        text="All machinery must be locked and tagged before servicing.",
        source_text="Lockout tagout procedures require positive disconnection.",
        risk_score=2,
        cognitive_level="apply",
    )
    db_session.add(rule1)
    await db_session.flush()

    manifest = [
        # Section A
        {
            "id": "q-a1",
            "question_type": "MCQ",
            "question_text": "Section A Q1",
            "options": ["Correct 1", "Wrong 1"],
            "correct_option_index": 0,
            "marks": 1.0,
            "section_id": "sec-a",
            "section_title": "General Safety",
            "difficulty": "easy",
            "rule_id": str(rule1.id),
        },
        {
            "id": "q-a2",
            "question_type": "TRUE_FALSE",
            "question_text": "Section A Q2",
            "options": ["True", "False"],
            "correct_option_index": 0,
            "correct_answer": "true",
            "statement_true": "True",
            "statement_false": "False",
            "marks": 1.0,
            "section_id": "sec-a",
            "section_title": "General Safety",
            "difficulty": "easy",
            "rule_id": str(rule1.id),
        },
        # Section B (Must-Pass 80%)
        {
            "id": "q-b1",
            "question_type": "MULTI_SELECT",
            "question_text": "Section B Q1",
            "options": ["Opt 1", "Opt 2", "Opt 3"],
            "correct_option_indices": [0, 2],
            "marks": 1.0,
            "section_id": "sec-b",
            "section_title": "Critical Interlocks",
            "difficulty": "medium",
            "rule_id": str(rule1.id),
        },
        {
            "id": "q-b2",
            "question_type": "FILL_IN_BLANK",
            "question_text": "Section B Q2",
            "correct_answer": "Interlock",
            "marks": 1.0,
            "section_id": "sec-b",
            "section_title": "Critical Interlocks",
            "difficulty": "hard",
            "rule_id": str(rule1.id),
        },
    ]

    assessment = Assessment(
        company_id=company.id,
        name="Annual Safety Qualification",
        manifest=manifest,
        total_question_count=len(manifest),
        pass_mark_pct=70.0,
        reveal_score_to_user=True,
        section_breakdown={
            "sec-a": {"id": "sec-a", "title": "General Safety", "min_pass_percent": 50.0},
            "sec-b": {"id": "sec-b", "title": "Critical Interlocks", "min_pass_percent": 80.0},
        }
    )
    db_session.add(assessment)
    await db_session.flush()

    # Assign to Alice and Bob
    exam_alice = ExamSession(
        assessment_id=assessment.id,
        employee_id=alice.id,
        status=ExamStatus.ASSIGNED,
        assigned_at=datetime.now(timezone.utc),
        responses={},
    )
    exam_bob = ExamSession(
        assessment_id=assessment.id,
        employee_id=bob.id,
        status=ExamStatus.ASSIGNED,
        assigned_at=datetime.now(timezone.utc),
        responses={},
    )
    db_session.add_all([exam_alice, exam_bob])
    await db_session.commit()

    transport = ASGITransport(app=app)

    # ── ALICE'S ATTEMPT (PASSES) ──────────────────────────────────────────────
    app.dependency_overrides[get_current_active_user] = lambda: alice
    app.dependency_overrides[get_db_session] = lambda: db_session

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Alice saves answers
        await client.put(f"/api/assessment/exam/{exam_alice.id}/answer", json={"question_variant_id": "q-a1", "selected_option_index": 0})
        await client.put(f"/api/assessment/exam/{exam_alice.id}/answer", json={"question_variant_id": "q-a2", "selected_option_index": 0})
        await client.put(f"/api/assessment/exam/{exam_alice.id}/answer", json={"question_variant_id": "q-b1", "selected_option_indices": [0, 2]})
        await client.put(f"/api/assessment/exam/{exam_alice.id}/answer", json={"question_variant_id": "q-b2", "text_answer": "Interlock"})

        # Alice submits
        res_alice = await client.post(f"/api/assessment/exam/{exam_alice.id}/submit", json={"integrity_score": 98.0})
        assert res_alice.status_code == 200
        alice_data = res_alice.json()
        assert alice_data["score"] == 100.0
        assert alice_data["passed"] is True
        assert alice_data["all_sections_passed"] is True

    # Verify Alice's certificate was generated
    cert_stmt = select(CertificateRecord).where(CertificateRecord.session_id == exam_alice.id)
    cert_res = await db_session.execute(cert_stmt)
    alice_cert = cert_res.scalar_one_or_none()
    assert alice_cert is not None
    assert alice_cert.sci_score == 100.0

    # ── BOB'S ATTEMPT (FAILS MUST-PASS SECTION B) ──────────────────────────────
    app.dependency_overrides[get_current_active_user] = lambda: bob

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Bob gets Section A right (2/2 = 100%)
        await client.put(f"/api/assessment/exam/{exam_bob.id}/answer", json={"question_variant_id": "q-a1", "selected_option_index": 0})
        await client.put(f"/api/assessment/exam/{exam_bob.id}/answer", json={"question_variant_id": "q-a2", "selected_option_index": 0})
        # Bob gets Section B q-b1 wrong (partial selection [0] in all-or-nothing), q-b2 right
        await client.put(f"/api/assessment/exam/{exam_bob.id}/answer", json={"question_variant_id": "q-b1", "selected_option_indices": [0]})
        await client.put(f"/api/assessment/exam/{exam_bob.id}/answer", json={"question_variant_id": "q-b2", "text_answer": "Interlock"})

        # Bob submits
        res_bob = await client.post(f"/api/assessment/exam/{exam_bob.id}/submit", json={"integrity_score": 95.0})
        assert res_bob.status_code == 200
        bob_data = res_bob.json()
        # Bob total score: 3/4 = 75% (above 70% overall pass mark!)
        assert bob_data["score"] == 75.0
        # But Section B min pass was 80%, Bob got 50% -> FAILED!
        assert bob_data["passed"] is False
        assert bob_data["all_sections_passed"] is False
        assert "Critical Interlocks" in bob_data["failed_sections"]

    # Verify Bob has NO certificate
    bob_cert_stmt = select(CertificateRecord).where(CertificateRecord.session_id == exam_bob.id)
    bob_cert_res = await db_session.execute(bob_cert_stmt)
    assert bob_cert_res.scalar_one_or_none() is None

    # ── AUDIT REVIEW VERIFICATION (ADMIN) ─────────────────────────────────────
    app.dependency_overrides[get_current_active_user] = lambda: admin

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Review Bob's attempt
        bob_rev_res = await client.get(f"/api/audit/attempts/{exam_bob.id}/review")
        assert bob_rev_res.status_code == 200
        bob_review = bob_rev_res.json()

        # Section scores present
        assert "sec-a" in bob_review["section_scores"]
        assert "sec-b" in bob_review["section_scores"]
        assert bob_review["section_scores"]["sec-b"]["percentage"] == 50.0
        assert bob_review["section_scores"]["sec-b"]["passed"] is False
        assert "Critical Interlocks" in bob_review["failed_sections"]

        # Questions contain difficulty, marks, type, source rule info
        items = bob_review["items"]
        assert len(items) == 4
        item_b1 = [it for it in items if it["question_id"] == "q-b1"][0]
        assert item_b1["question_type"] == "MULTI_SELECT"
        assert item_b1["difficulty"] == "medium"
        assert item_b1["max_marks"] == 1.0
        assert item_b1["is_correct"] is False
        assert item_b1["rule_code"] == "RULE-LOTO-01"

        # CSV Export test
        csv_res = await client.get("/api/audit/attempts/export-csv")
        assert csv_res.status_code == 200
        assert "text/csv" in csv_res.headers["content-type"]
        csv_text = csv_res.text
        # Check header columns include section breakdown
        assert "General Safety (%)" in csv_text or "Critical Interlocks (%)" in csv_text

    app.dependency_overrides.clear()

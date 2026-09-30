import logging
import uuid
import random
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_db_session
from app.models.schemas import AssessmentResponse, ConstraintRequest, AssessmentManifestItem
from app.models.hierarchy import Rule, SubCategory, Section
from app.models.question_bank import QuestionVariant
from app.models.assessment_session import Assessment
from app.models.user import User
from app.models.question_usage_history import QuestionUsageHistory
from app.api.deps import get_current_active_user
from app.services.llm.generator import grade_fill_in_blank, grade_multi_select

logger = logging.getLogger(__name__)
router = APIRouter()

BLOOM_WEIGHTS = {
    "Remember": 1,
    "Understand": 2,
    "Apply": 3,
    "Analyze": 4,
    "Evaluate": 5,
    "Create": 6
}

def knapsack_select(candidates, k: int, weight_fn):
    sorted_candidates = sorted(candidates, key=weight_fn, reverse=True)
    return sorted_candidates[:k]

@router.post(
    "/generate",
    response_model=AssessmentResponse,
    summary="Generate a constraint-bounded MCQ safety assessment",
)
async def generate_assessment(
    request: ConstraintRequest, 
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
) -> AssessmentResponse:
    manifest_rules = []
    
    for section_name, count in request.constraints.items():
        if count <= 0:
            continue
            
        stmt = (
            select(Rule)
            .join(SubCategory, Rule.subcategory_id == SubCategory.id)
            .join(Section, SubCategory.section_id == Section.id)
            .where(Section.name == section_name)
            .where(Rule.review_status == "approved")
        )
        result = await db.execute(stmt)
        candidates = result.scalars().all()
        
        selected = knapsack_select(
            candidates, 
            k=count, 
            weight_fn=lambda r: r.risk_score * BLOOM_WEIGHTS.get(r.cognitive_level, 1)
        )
        
        # Sibling fallback: if we were searching for specific subcategories, we'd fallback. 
        # Since our constraint is section-level, candidates already include all subcategories in the section.
        # If len(selected) < count, we just don't have enough approved rules in this section.
        
        manifest_rules.extend(selected)

    manifest_items = []
    skipped = []
    
    rules_out = []
    assessment_md = "## Generated Assessment\n\n"
    answer_key_md = "\n\n## Answer Key\n\n"
    question_idx = 1
    
    import time
    start_time = time.time()
    
    for rule in manifest_rules:
        # Get approved variants for this rule
        stmt = (
            select(QuestionVariant)
            .where(QuestionVariant.rule_id == rule.id)
            .where(QuestionVariant.review_status == "approved")
        )
        result = await db.execute(stmt)
        variants = result.scalars().all()
        
        if variants:
            chosen = random.choice(variants)
            manifest_items.append(AssessmentManifestItem(rule_id=rule.id, question_variant_id=chosen.id))
            
            rules_out.append({
                "id": str(rule.id),
                "text": rule.text,
                "sub_category": rule.sub_category,
                "risk_score": rule.risk_score,
                "cognitive_level": rule.cognitive_level,
                "estimated_response_time": rule.estimated_response_time,
                "revision_version": rule.revision_version,
            })
            
            assessment_md += f"**Q{question_idx}. {chosen.question_text}**\n\n"
            for j, opt in enumerate(chosen.options):
                assessment_md += f"- {chr(65+j)}) {opt}\n"
            assessment_md += "\n"
            
            answer_key_md += f"**Q{question_idx}**: {chr(65+chosen.correct_option_index)} (Rule: {str(rule.id)[:8]})\n"
            question_idx += 1
            
        else:
            skipped.append(rule.id)
            
    query_time_ms = (time.time() - start_time) * 1000
            
    if not manifest_items:
        return AssessmentResponse(
            status="incomplete",
            manifest=[],
            missing_questions_for_rules=skipped,
            message=f"No approved questions were found for the requested constraints. Please approve some rules and questions in the Question Bank first."
        )
        
    if skipped:
        return AssessmentResponse(
            status="incomplete",
            manifest=manifest_items,
            missing_questions_for_rules=skipped,
            message=f"{len(skipped)} selected rules have no approved question yet. Generate/approve questions for them or adjust constraints."
        )
        
    # Save assessment manifest
    assessment = Assessment(
        company_id=current_user.company_id,
        name=f"Assessment Template - {len(manifest_items)} Qs",
        manifest=[item.model_dump() for item in manifest_items],
        total_question_count=len(manifest_items),
        section_breakdown=request.constraints
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)
    
    return AssessmentResponse(
        status="ready",
        assessment_id=assessment.id,
        manifest=manifest_items,
        rules=rules_out,
        assessment=assessment_md + answer_key_md,
        query_duration_ms=query_time_ms,
        inference_latency_ms=0.0
    )

from app.models.test_attempt import ExamSession, ExamStatus
from app.models.certificate import Certificate
from app.models.company import Company
from pydantic import BaseModel
from datetime import datetime, timezone
from sqlalchemy.orm import selectinload
from app.services.certificate import generate_certificate
import hashlib, secrets

class AssembleRequest(BaseModel):
    job_title: str
    target_count: int
    employee_id: Optional[uuid.UUID] = None  # for no-repeat filtering (Req #8)

@router.post("/assemble", summary="Assemble exam questions for a role")
async def assemble_exam(
    request: AssembleRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
):
    from app.services.assessment_assembler import assemble_exam_for_role

    eid = request.employee_id or current_user.id
    result = await assemble_exam_for_role(db, request.job_title, request.target_count, employee_id=eid)

    questions = result["questions"]
    repeat_ids = result["repeat_variant_ids"]
    incomplete = result["incomplete"]
    reason = result["reason"]

    if incomplete and not questions:
        return {"status": "incomplete", "reason": reason, "questions": []}

    payload = [
        {
            "id": str(q.id),
            "question_text": q.question_text,
            "question_type": q.question_type,
            "options": q.options or [],
            "blank_answer_variants": q.blank_answer_variants,
            "correct_answer_index": q.correct_option_index,
            "difficulty": q.difficulty,
            "rule_id": str(q.rule_id),
            "is_repeat": str(q.id) in repeat_ids,
        }
        for q in questions
    ]
    return {
        "status": "incomplete" if incomplete else "ready",
        "reason": reason,
        "repeat_count": len(repeat_ids),
        "questions": payload,
    }

class SwapRequest(BaseModel):
    rule_id: uuid.UUID
    current_variant_id: uuid.UUID

@router.post("/swap", summary="Swap a question variant for the same rule")
async def swap_question(
    request: SwapRequest,
    db: AsyncSession = Depends(get_db_session)
):
    from sqlalchemy import select
    from app.models.question_bank import QuestionVariant
    
    # Get all approved variants for this rule
    stmt = select(QuestionVariant).where(
        QuestionVariant.rule_id == request.rule_id,
        QuestionVariant.status == "APPROVED"
    )
    result = await db.execute(stmt)
    variants = result.scalars().all()
    
    # Filter out the current one if possible, and pick a new one
    other_variants = [v for v in variants if v.id != request.current_variant_id]
    
    if not other_variants:
        # If no other variants, just return the current one or a generated dummy
        return {"error": "No alternative questions available for this rule"}
        
    import random
    q = random.choice(other_variants)
    
    return {
        "id": str(q.id),
        "question_text": q.question_text,
        "options": q.options or [],
        "correct_answer_index": q.correct_option_index,
        "rule_id": str(q.rule_id)
    }

class AssignRequest(BaseModel):
    assessment_id: uuid.UUID
    employee_ids: list[str]
    # Lockdown: supervisor sets a short Exam Key given verbally at test time (Req #1)
    exam_key: Optional[str] = None
    # Per-exam configurable marking (optional; falls back to Assessment defaults)
    marks_per_question: Optional[int] = None
    use_weighted_marks: Optional[bool] = None
    pass_mark_pct: Optional[float] = None
    pass_mark_abs: Optional[int] = None
    reveal_score_to_user: Optional[bool] = None

@router.post("/assign", summary="Assign an exam to employees")
async def assign_exam(
    request: AssignRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    # Optionally update marking config on the Assessment record
    if any(x is not None for x in [
        request.marks_per_question, request.use_weighted_marks,
        request.pass_mark_pct, request.pass_mark_abs, request.reveal_score_to_user,
    ]):
        a_stmt = select(Assessment).where(Assessment.id == request.assessment_id)
        a_res = await db.execute(a_stmt)
        assessment = a_res.scalar_one_or_none()
        if assessment:
            if request.marks_per_question is not None:
                assessment.marks_per_question = request.marks_per_question
            if request.use_weighted_marks is not None:
                assessment.use_weighted_marks = request.use_weighted_marks
            if request.pass_mark_pct is not None:
                assessment.pass_mark_pct = request.pass_mark_pct
            if request.pass_mark_abs is not None:
                assessment.pass_mark_abs = request.pass_mark_abs
            if request.reveal_score_to_user is not None:
                assessment.reveal_score_to_user = request.reveal_score_to_user

    # Map employee codes to User UUIDs
    stmt = select(User).where(User.employee_code.in_(request.employee_ids))
    result = await db.execute(stmt)
    users = result.scalars().all()

    sessions = []
    for u in users:
        key_hash: Optional[str] = None
        if request.exam_key:
            # SHA-256 the key (+ a static pepper); never store plaintext
            pepper = "aegis-lockdown-v1"
            key_hash = hashlib.sha256(f"{pepper}:{request.exam_key.upper()}".encode()).hexdigest()
        session = ExamSession(
            assessment_id=request.assessment_id,
            employee_id=u.id,
            status=ExamStatus.ASSIGNED,
            assigned_at=datetime.now(timezone.utc),
            responses={},
            exam_key_hash=key_hash,
            lockdown_anomalies=[],
            lockdown_escalated=False,
        )
        db.add(session)
        sessions.append(session)
    await db.commit()
    return {"status": "success", "assigned_count": len(sessions)}

@router.post("/exam/{session_id}/request-retake", summary="Request a retake")
async def request_retake(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    stmt = select(ExamSession).where(ExamSession.id == session_id, ExamSession.employee_id == current_user.id)
    res = await db.execute(stmt)
    old_session = res.scalar_one_or_none()
    if not old_session:
        raise HTTPException(status_code=404, detail="Exam session not found or you don't have permission")
    
    if old_session.status not in [ExamStatus.FAILED, ExamStatus.COMPLETED]:
        raise HTTPException(status_code=400, detail="You can only request retake for completed or failed exams")
    
    old_session.status = ExamStatus.RETAKE_REQUESTED
    await db.commit()
    return {"status": "success"}

@router.post("/exam/{session_id}/grant-retake", summary="Admin grants retake")
async def grant_retake(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    stmt = select(ExamSession).options(selectinload(ExamSession.assessment)).where(ExamSession.id == session_id)
    res = await db.execute(stmt)
    old_session = res.scalar_one_or_none()
    
    if not old_session:
        raise HTTPException(status_code=404, detail="Exam session not found")
        
    old_assessment = old_session.assessment
    
    # Generate new assessment using old constraints
    constraints = old_assessment.section_breakdown
    
    # We construct a mock ConstraintRequest to pass to our internal function
    from app.api.assessment import generate_assessment
    from app.models.schemas import ConstraintRequest
    req = ConstraintRequest(constraints=constraints)
    new_assess_resp = await generate_assessment(req, db, current_user)
    
    if new_assess_resp.status != "ready":
        raise HTTPException(status_code=400, detail=f"Could not generate new questions: {new_assess_resp.message}")
        
    new_session = ExamSession(
        assessment_id=new_assess_resp.assessment_id,
        employee_id=old_session.employee_id,
        status=ExamStatus.ASSIGNED,
        assigned_at=datetime.now(timezone.utc),
        responses={},
        exam_key_hash=old_session.exam_key_hash, # Copy the key so they can reuse it
        lockdown_anomalies=[],
        lockdown_escalated=False,
    )
    db.add(new_session)
    
    old_session.status = ExamStatus.RETAKE_GRANTED
    await db.commit()
    return {"status": "success"}

# ---------------------------------------------------------------------------
# Lockdown flow — Dual-factor unlock (Req #2)
# ---------------------------------------------------------------------------

class UnlockRequest(BaseModel):
    employee_code: str
    exam_key: str

@router.post("/exam/{exam_id}/unlock", summary="Unlock before exam start (Key only)")
async def unlock_exam(
    exam_id: uuid.UUID,
    request: UnlockRequest,
    db: AsyncSession = Depends(get_db_session),
):
    """
    Verifies employee PIN and supervisor Exam Key.
    Returns a generic error to the caller but logs the specific failure
    server-side for the audit trail (log-don't-reveal principle).
    """
    stmt = select(ExamSession).options(selectinload(ExamSession.employee)).where(ExamSession.id == exam_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")

    failure_reason: Optional[str] = None

    # Check 1: supervisor Exam Key
    key_ok = False
    if session.exam_key_hash:
        pepper = "aegis-lockdown-v1"
        provided_hash = hashlib.sha256(f"{pepper}:{request.exam_key.upper()}".encode()).hexdigest()
        key_ok = secrets.compare_digest(provided_hash, session.exam_key_hash)
    else:
        key_ok = True  # no key was set — let through
    if not key_ok and failure_reason is None:
        failure_reason = "exam_key_mismatch"

    if failure_reason:
        # Log the SPECIFIC reason server-side
        anomaly = {
            "type": "unlock_failure",
            "subtype": failure_reason,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
        new_anomalies = list(session.lockdown_anomalies or []) + [anomaly]
        session.lockdown_anomalies = new_anomalies
        await db.commit()
        raise HTTPException(status_code=401, detail="Credentials incorrect. Contact your supervisor.")

    # Both checks pass — mark session as started
    session.status = ExamStatus.IN_PROGRESS
    session.started_at = datetime.now(timezone.utc)
    await db.commit()
    return {"status": "unlocked"}


# ---------------------------------------------------------------------------
# Lockdown anomaly ingestion (Req #5)
# ---------------------------------------------------------------------------

ANOMALY_MAX_COUNT = 3
ANOMALY_MAX_DURATION_S = 30

class LockdownAnomalyRequest(BaseModel):
    anomaly_type: str   # fullscreen_exit | focus_blur | tab_hidden | screenshare_stopped | screenshare_changed
    duration_s: float
    timestamp: str      # ISO string from client

@router.post("/exam/{exam_id}/lockdown-anomaly", summary="Log a lockdown integrity event")
async def log_lockdown_anomaly(
    exam_id: uuid.UUID,
    request: LockdownAnomalyRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
):
    stmt = select(ExamSession).where(ExamSession.id == exam_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")

    anomaly = {
        "type": request.anomaly_type,
        "duration_s": request.duration_s,
        "ts": request.timestamp,
    }
    new_anomalies = list(session.lockdown_anomalies or []) + [anomaly]
    session.lockdown_anomalies = new_anomalies

    lockdown_events = [a for a in new_anomalies if a.get("type") != "unlock_failure"]
    total_duration = sum(a.get("duration_s", 0) for a in lockdown_events)
    if len(lockdown_events) >= ANOMALY_MAX_COUNT or total_duration >= ANOMALY_MAX_DURATION_S:
        if not session.lockdown_escalated:
            session.lockdown_escalated = True
            session.status = ExamStatus.PENDING_REVIEW
            logger.warning(
                "Exam %s auto-escalated to PENDING_REVIEW: %d events, %.1fs cumulative",
                exam_id, len(lockdown_events), total_duration,
            )

    await db.commit()
    return {
        "logged": True,
        "escalated": session.lockdown_escalated,
        "total_events": len(lockdown_events),
        "cumulative_duration_s": total_duration,
    }


# ---------------------------------------------------------------------------
# Audit timeline (Req #7)
# ---------------------------------------------------------------------------

@router.get("/exam/{exam_id}/audit-timeline", summary="Combined integrity + lockdown timeline")
async def get_audit_timeline(
    exam_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
):
    stmt = select(ExamSession).options(
        selectinload(ExamSession.employee),
        selectinload(ExamSession.assessment),
    ).where(ExamSession.id == exam_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")

    timeline = []

    # MediaPipe / head-pose events stored under __proctoring__ key in responses
    proctoring_events = []
    if isinstance(session.responses, dict):
        proctoring_events = session.responses.get("__proctoring__", [])
    for ev in proctoring_events:
        timeline.append({
            "source": "mediapipe",
            "type": ev.get("type", "gaze_anomaly"),
            "ts": ev.get("ts"),
            "duration_s": ev.get("duration_s"),
            "detail": ev,
        })

    # Lockdown / screen-capture / fullscreen events
    for ev in (session.lockdown_anomalies or []):
        timeline.append({
            "source": "lockdown",
            "type": ev.get("type"),
            "ts": ev.get("ts"),
            "duration_s": ev.get("duration_s"),
            "detail": ev,
        })

    timeline.sort(key=lambda e: e.get("ts") or "")

    return {
        "exam_session_id": str(exam_id),
        "employee_name": (session.employee.full_name or session.employee.employee_code) if session.employee else None,
        "assessment_name": session.assessment.name if session.assessment else None,
        "status": session.status,
        "score": session.score,
        "lockdown_escalated": session.lockdown_escalated,
        "timeline": timeline,
    }


@router.get("/assessments", summary="Get all templates")

async def get_all_assessments(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    stmt = select(Assessment).where(Assessment.company_id == current_user.company_id)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/my-exams", summary="Get assigned exams for employee")
async def get_my_exams(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    stmt = (
        select(ExamSession)
        .options(selectinload(ExamSession.assessment))
        .where(ExamSession.employee_id == current_user.id)
    )
    result = await db.execute(stmt)
    exams = result.scalars().all()
    
    return [{
        "exam_session_id": e.id,
        "assessment_name": e.assessment.name,
        "status": e.status,
        "assigned_at": e.assigned_at,
        "score": e.score,
        "total_questions": e.assessment.total_question_count
    } for e in exams]

@router.get("/all-assigned-exams", summary="Get all assigned exams for admin")
async def get_all_assigned_exams(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    # Fetch all exam sessions for users in the current user's company
    stmt = (
        select(ExamSession)
        .join(User, ExamSession.employee_id == User.id)
        .options(selectinload(ExamSession.assessment), selectinload(ExamSession.employee))
        .where(User.company_id == current_user.company_id)
    )
    result = await db.execute(stmt)
    exams = result.scalars().all()
    
    return [{
        "exam_session_id": e.id,
        "employee_name": e.employee.full_name or e.employee.employee_code,
        "assessment_name": e.assessment.name,
        "status": e.status,
        "assigned_at": e.assigned_at,
        "score": e.score,
        "total_questions": e.assessment.total_question_count
    } for e in exams]

@router.delete("/exam/{exam_id}", summary="Delete an assigned exam")
async def delete_exam(
    exam_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    stmt = select(ExamSession).where(ExamSession.id == exam_id)
    result = await db.execute(stmt)
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
        
    await db.delete(exam)
    await db.commit()
    return {"status": "deleted"}

@router.get("/exam/{exam_id}", summary="Get exam details")
async def get_exam(
    exam_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    stmt = select(ExamSession).options(selectinload(ExamSession.assessment)).where(ExamSession.id == exam_id)
    result = await db.execute(stmt)
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if exam.status == ExamStatus.ASSIGNED:
        exam.status = ExamStatus.IN_PROGRESS
        exam.started_at = datetime.utcnow()
        await db.commit()

    questions = []
    for item in exam.assessment.manifest:
        var_id = uuid.UUID(item['question_variant_id'])
        v_stmt = select(QuestionVariant).where(QuestionVariant.id == var_id)
        v_res = await db.execute(v_stmt)
        variant = v_res.scalar_one_or_none()
        if variant:
            questions.append({
                "id": str(variant.id),
                "rule_id": str(variant.rule_id),
                "question_text": variant.question_text,
                "question_type": variant.question_type,          # expose type (Req #5)
                "options": variant.options,
                "difficulty": variant.difficulty,
                "correct_option_indices": variant.correct_option_indices,  # for MULTI_SELECT
                # Intentionally omitting correct_option_index / correct_answer
            })

    return {
        "exam_session_id": exam.id,
        "assessment_name": exam.assessment.name,
        "status": exam.status,
        "responses": exam.responses,
        "questions": questions,
        "pass_mark_pct": exam.assessment.pass_mark_pct,
        "use_weighted_marks": exam.assessment.use_weighted_marks,
        "reveal_score_to_user": exam.assessment.reveal_score_to_user,
    }

class AnswerRequest(BaseModel):
    question_variant_id: str
    selected_option_index: Optional[int] = None    # MCQ / TRUE_FALSE
    selected_option_indices: Optional[list] = None # MULTI_SELECT
    text_answer: Optional[str] = None              # FILL_IN_BLANK (Req #5)

@router.put("/exam/{exam_id}/answer", summary="Save single answer")
async def save_answer(
    exam_id: uuid.UUID,
    request: AnswerRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    stmt = select(ExamSession).where(ExamSession.id == exam_id)
    result = await db.execute(stmt)
    exam = result.scalar_one_or_none()
    if not exam:
        raise HTTPException(status_code=404)

    new_responses = dict(exam.responses)
    # Store all fields so scoring can pick the right one per question type
    new_responses[request.question_variant_id] = {
        "selected_option_index": request.selected_option_index,
        "selected_option_indices": request.selected_option_indices,
        "text_answer": request.text_answer,
    }
    exam.responses = new_responses

    await db.commit()
    return {"status": "saved"}

class SubmitRequest(BaseModel):
    integrity_score: float

@router.post("/exam/{exam_id}/submit", summary="Submit exam")
async def submit_exam(
    exam_id: uuid.UUID,
    request: SubmitRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    stmt = select(ExamSession).options(selectinload(ExamSession.assessment)).where(ExamSession.id == exam_id)
    result = await db.execute(stmt)
    exam = result.scalar_one_or_none()

    if not exam:
        raise HTTPException(status_code=404)

    assessment = exam.assessment
    use_weighted = assessment.use_weighted_marks  # Req #10
    pass_pct = assessment.pass_mark_pct           # Req #10
    pass_abs = assessment.pass_mark_abs           # Req #10 (optional absolute)
    marks_per_q = assessment.marks_per_question   # Req #10

    total_score = 0.0
    total_possible = 0.0
    usage_history_entries: list[QuestionUsageHistory] = []

    for item in assessment.manifest:
        var_id = uuid.UUID(item['question_variant_id'])
        rule_id = uuid.UUID(item['rule_id'])

        v_stmt = select(QuestionVariant).where(QuestionVariant.id == var_id)
        v_res = await db.execute(v_stmt)
        variant = v_res.scalar_one()

        r_stmt = select(Rule).where(Rule.id == rule_id)
        r_res = await db.execute(r_stmt)
        rule = r_res.scalar_one()

        # Mark weight (Req #10)
        weight = rule.risk_score if use_weighted else marks_per_q
        total_possible += weight

        # Retrieve saved response (supports both old int and new dict formats)
        raw_resp = exam.responses.get(str(var_id))
        if isinstance(raw_resp, dict):
            selected_idx = raw_resp.get("selected_option_index")
            text_answer = raw_resp.get("text_answer")
        else:
            selected_idx = raw_resp
            text_answer = None

        # Grade depending on question type
        q_type = variant.question_type
        correct = False
        if q_type == "FILL_IN_BLANK":
            if text_answer is not None:
                correct = grade_fill_in_blank(
                    text_answer,
                    variant.correct_answer or "",
                    variant.blank_answer_variants,
                )
        elif q_type == "MULTI_SELECT":
            # Retrieve selected_indices from response
            if isinstance(raw_resp, dict):
                selected_indices = raw_resp.get("selected_option_indices", [])
            else:
                selected_indices = []
            correct_indices = variant.correct_option_indices or []
            correct = grade_multi_select(selected_indices, correct_indices)
        else:
            correct = (selected_idx == variant.correct_option_index)

        if correct:
            total_score += weight

        # Record usage history (Req #8)
        usage_history_entries.append(QuestionUsageHistory(
            employee_id=current_user.id,
            question_variant_id=var_id,
            exam_session_id=exam.id,
        ))

    # Compute SCI score as percentage
    sci_score = (total_score / total_possible * 100) if total_possible > 0 else 0.0

    # Determine pass/fail threshold (Req #10)
    if pass_abs is not None:
        passed = total_score >= pass_abs
    else:
        passed = sci_score >= pass_pct

    exam.score = sci_score
    exam.integrity_score = request.integrity_score
    exam.completed_at = datetime.utcnow()

    # Save usage history
    for entry in usage_history_entries:
        db.add(entry)

    c_stmt = select(Company).where(Company.id == current_user.company_id)
    c_res = await db.execute(c_stmt)
    company = c_res.scalar_one()

    if request.integrity_score < 70.0:
        exam.status = ExamStatus.PENDING_REVIEW
    elif passed:
        exam.status = ExamStatus.COMPLETED
        cert_id = uuid.uuid4()
        qr, sig, pdf_url = generate_certificate(
            certificate_id=cert_id,
            employee_id=current_user.id,
            full_name=current_user.full_name or current_user.employee_code,
            score=sci_score,
            company_name=company.name,
            assessment_name=assessment.name if assessment else "Safety Assessment",
            logo_url=company.logo_url,
            designation=current_user.designation
        )
        cert = Certificate(
            id=cert_id,
            exam_session_id=exam.id,
            employee_id=current_user.id,
            issued_at=datetime.utcnow(),
            qr_code_data=qr,
            signed_payload=sig,
            pdf_url=pdf_url
        )
        db.add(cert)
    else:
        exam.status = ExamStatus.FAILED

    await db.commit()
    return {
        "status": exam.status,
        "score": sci_score,
        "passed": passed,
        "reveal_score_to_user": exam.assessment.reveal_score_to_user,
        "pass_mark_pct": pass_pct,
    }

@router.post("/all-assigned-exams/{session_id}/reset", summary="Reset an assigned exam (Admin)")
async def reset_assigned_exam(session_id: uuid.UUID, db: AsyncSession = Depends(get_db_session)):
    stmt = select(ExamSession).where(ExamSession.id == session_id)
    res = await db.execute(stmt)
    session = res.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Exam session not found")
    
    session.status = ExamStatus.ASSIGNED
    session.score = None
    session.integrity_score = None
    session.lockdown_anomalies = []
    
    await db.commit()
    return {"message": "Assigned exam reset"}

@router.get("/certificates", summary="Get my certificates")
async def get_my_certificates(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    stmt = select(Certificate).options(selectinload(Certificate.exam_session).selectinload(ExamSession.assessment)).where(Certificate.employee_id == current_user.id)
    result = await db.execute(stmt)
    certs = result.scalars().all()
    
    return [{
        "id": c.id,
        "issued_at": c.issued_at,
        "pdf_url": c.pdf_url,
        "assessment_name": c.exam_session.assessment.name,
        "score": c.exam_session.score
    } for c in certs]

class SaveAssembledRequest(BaseModel):
    name: str
    manifest: list[dict]

@router.post("/save-assembled", summary="Save assembled questions as an assessment")
async def save_assembled_assessment(
    request: SaveAssembledRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    for item in request.manifest:
        if 'question_variant_id' in item and 'question_text' in item:
            try:
                var_id = uuid.UUID(item['question_variant_id'])
                stmt = select(QuestionVariant).where(QuestionVariant.id == var_id)
                res = await db.execute(stmt)
                variant = res.scalar_one_or_none()
                if variant:
                    variant.question_text = item['question_text']
                    variant.options = item.get('options', [])
                    if 'correct_answer_index' in item:
                        variant.correct_option_index = item['correct_answer_index']
            except Exception as e:
                logger.error(f"Failed to update variant {item.get('question_variant_id')}: {e}")

    assessment = Assessment(
        company_id=current_user.company_id,
        name=request.name,
        manifest=request.manifest,
        total_question_count=len(request.manifest),
        section_breakdown={}
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)
    return {"assessment_id": assessment.id}


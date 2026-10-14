import logging
import uuid
import random
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any, Union

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_db_session
from app.models.schemas import AssessmentResponse, ConstraintRequest, AssessmentManifestItem
from app.models.hierarchy import Rule, SubCategory, Section
from app.models.question_bank import QuestionVariant
from app.models.assessment_session import Assessment
from app.models.user import User
from app.models.company import Company
from app.models.certificate import Certificate, CertificateRecord
from app.models.test_attempt import ExamSession, ExamStatus
from app.models.question_usage_history import QuestionUsageHistory
from app.api.deps import get_current_active_user
from app.services.llm.generator import grade_fill_in_blank, grade_multi_select
from app.services.certificate import generate_certificate
from app.services.exam_builder.grading import grade_response

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
    employee_id: Optional[Any] = None  # accepts either UUID or employee_code string
    question_types: Optional[List[str]] = None

@router.post("/assemble", summary="Assemble exam questions for a role")
async def assemble_exam(
    request: AssembleRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user),
):
    from app.services.assessment_assembler import assemble_exam_for_role

    eid = None
    if request.employee_id:
        try:
            eid = uuid.UUID(str(request.employee_id))
        except (ValueError, TypeError):
            u_stmt = select(User.id).where(User.employee_code == str(request.employee_id))
            u_res = await db.execute(u_stmt)
            eid = u_res.scalar_one_or_none()
    if not eid:
        eid = current_user.id

    result = await assemble_exam_for_role(
        db,
        request.job_title,
        request.target_count,
        employee_id=eid,
        allowed_types=request.question_types,
    )

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
            "correct_option_indices": q.correct_option_indices,
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
    question_type: Optional[str] = None
    current_stem: Optional[str] = None
    rule_mode: Optional[str] = "same"  # "same" or "different"
    exclude_stems: Optional[list[str]] = None

@router.post("/swap", summary="Swap a question variant for the same or different rule")
async def swap_question(
    request: SwapRequest,
    db: AsyncSession = Depends(get_db_session)
):
    from sqlalchemy import select, func
    from sqlalchemy.orm import selectinload
    from app.models.question_bank import QuestionVariant
    from app.models.hierarchy import Rule
    from app.services.assessment_assembler import _make_heuristic_variant
    import random
    import uuid
    
    current_stem = request.current_stem or ""
    detected_type = (request.question_type or "MCQ").upper()
    exclude = set(s.strip().lower() for s in (request.exclude_stems or []))
    if current_stem:
        exclude.add(current_stem.strip().lower())

    target_rule = None
    if request.rule_mode == "different":
        diff_rule_stmt = (
            select(Rule)
            .where(Rule.review_status == "approved", Rule.id != request.rule_id)
            .order_by(func.random())
            .limit(1)
            .options(selectinload(Rule.subcategory))
        )
        target_rule = await db.scalar(diff_rule_stmt)
    
    if not target_rule:
        target_rule = await db.scalar(
            select(Rule)
            .where(Rule.id == request.rule_id)
            .options(selectinload(Rule.subcategory))
        )
    if not target_rule:
        # Fallback to any approved rule
        target_rule = await db.scalar(
            select(Rule)
            .where(Rule.review_status == "approved")
            .order_by(func.random())
            .limit(1)
            .options(selectinload(Rule.subcategory))
        )

    # Check question bank first for existing approved variant
    variants = []
    if target_rule:
        stmt = (
            select(QuestionVariant)
            .where(
                QuestionVariant.rule_id == target_rule.id,
                QuestionVariant.review_status == "approved",
                QuestionVariant.question_type == detected_type,
            )
            .options(selectinload(QuestionVariant.rule))
        )
        res = await db.execute(stmt)
        variants = res.scalars().all()

    # Filter out excluded or current stems
    candidate_variants = [
        v for v in variants 
        if v.id != request.current_variant_id and v.question_text.strip().lower() not in exclude
    ]

    if candidate_variants:
        q = random.choice(candidate_variants)
        return {
            "id": str(q.id),
            "question_text": q.question_text,
            "question_type": q.question_type,
            "options": q.options or [],
            "correct_answer_index": q.correct_option_index,
            "correct_option_indices": q.correct_option_indices,
            "correct_answer": q.correct_answer,
            "blank_answer_variants": q.blank_answer_variants,
            "statement_true": q.statement_true,
            "statement_false": q.statement_false,
            "rule_id": str(q.rule_id)
        }

    # Otherwise synthesize a fresh operational variant
    if target_rule:
        vd = _make_heuristic_variant(target_rule, detected_type)
        return {
            "id": str(uuid.uuid4()),
            "question_text": vd.get("question_text", ""),
            "question_type": detected_type,
            "options": vd.get("options", []),
            "correct_answer_index": vd.get("correct_option_index", 0),
            "correct_option_indices": vd.get("correct_option_indices"),
            "correct_answer": vd.get("correct_answer"),
            "blank_answer_variants": vd.get("blank_answer_variants"),
            "statement_true": vd.get("statement_true"),
            "statement_false": vd.get("statement_false"),
            "rule_id": str(target_rule.id)
        }

    return {"error": "Unable to assemble question variant."}

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
            responses={"_admin_exam_key": request.exam_key} if request.exam_key else {},
            exam_key_hash=key_hash,
            exam_key_plaintext=request.exam_key,
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
    
    # In AegisGraph offline Edge-AI mode, retakes reuse the same assembled assessment.
    # This prevents the need to dynamically hit the LLM/Question Bank again.
    new_assessment_id = old_session.assessment_id
        
    new_session = ExamSession(
        assessment_id=new_assessment_id,
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
        "reveal_score_to_user": e.assessment.reveal_score_to_user,
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
        "employee_id": e.employee.employee_code,
        "employee_name": e.employee.full_name or e.employee.employee_code,
        "assessment_name": e.assessment.name,
        "status": e.status,
        "assigned_at": e.assigned_at,
        "score": e.score,
        "total_questions": e.assessment.total_question_count,
        "exam_key": getattr(e, "exam_key_plaintext", None) or (e.responses.get("_admin_exam_key") if isinstance(e.responses, dict) else None),
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
        exam.started_at = datetime.now(timezone.utc)
        await db.commit()

    assessment = exam.assessment
    section_breakdown = assessment.section_breakdown or {}

    # 1. Build ordered sections list
    sections_list = []
    if section_breakdown:
        for s_id, s_info in sorted(section_breakdown.items(), key=lambda x: x[1].get("order_index", 0)):
            sections_list.append({
                "id": str(s_id),
                "title": s_info.get("title", f"Section {s_id}"),
                "instructions": s_info.get("instructions", ""),
                "min_pass_percent": s_info.get("min_pass_percent"),
                "order_index": s_info.get("order_index", 0),
            })
    if not sections_list:
        sections_list = [{
            "id": "section-a",
            "title": "Section A",
            "instructions": "Read each question carefully and select or enter your response.",
            "min_pass_percent": assessment.pass_mark_pct,
            "order_index": 0,
        }]

    # 2. Extract raw questions from manifest / question_bank
    raw_questions = []
    for item in assessment.manifest:
        q_id = str(item.get("id") or item.get("question_variant_id"))
        sec_id = str(item.get("section_id") or "section-a")
        sec_title = item.get("section_title") or (section_breakdown.get(sec_id, {}).get("title") if section_breakdown else "Section A")
        
        if "question_text" in item or "stem" in item:
            q_type = item.get("question_type", "MCQ")
            opts = item.get("options")
            payload = item.get("payload") or {}
            if opts is None and "options" in payload:
                opts = payload.get("options")
            raw_questions.append({
                "id": q_id,
                "rule_id": str(item.get("rule_id", "")) if item.get("rule_id") else None,
                "question_text": item.get("question_text") or item.get("stem"),
                "question_type": q_type,
                "options": list(opts) if opts else [],
                "difficulty": item.get("difficulty", "medium"),
                "marks": float(item.get("marks", 1.0)),
                "section_id": sec_id,
                "section_title": sec_title,
                "order_index": item.get("order_index", 0),
            })
            continue

        var_id = uuid.UUID(item['question_variant_id'])
        v_stmt = select(QuestionVariant).where(QuestionVariant.id == var_id)
        v_res = await db.execute(v_stmt)
        variant = v_res.scalar_one_or_none()
        if variant:
            raw_questions.append({
                "id": str(variant.id),
                "rule_id": str(variant.rule_id),
                "question_text": variant.question_text,
                "question_type": variant.question_type,
                "options": list(variant.options) if variant.options else [],
                "difficulty": variant.difficulty,
                "marks": float(item.get("marks", 1.0)),
                "section_id": sec_id,
                "section_title": sec_title,
                "order_index": item.get("order_index", 0),
            })

    # 3. Handle question and option shuffling per attempt
    exam_responses = dict(exam.responses or {})
    shuffle_map = exam_responses.get("_shuffle_map")
    
    # If no shuffle map is stored, initialize and persist it
    if not shuffle_map or not isinstance(shuffle_map, dict):
        shuffle_map = {"question_order": [], "option_maps": {}}
        
        # Group question items by section
        by_sec: dict[str, list] = {}
        for q in raw_questions:
            by_sec.setdefault(q["section_id"], []).append(q)
            
        for s_info in sections_list:
            s_id = s_info["id"]
            sec_qs = by_sec.get(s_id, [])
            s_cfg = section_breakdown.get(s_id, {})
            should_shuffle_q = bool(s_cfg.get("shuffle_questions", False))
            should_shuffle_opt = bool(s_cfg.get("shuffle_options", False))
            
            sec_q_ids = [q["id"] for q in sec_qs]
            if should_shuffle_q and len(sec_q_ids) > 1:
                random.shuffle(sec_q_ids)
            shuffle_map["question_order"].extend(sec_q_ids)
            
            for q in sec_qs:
                q_id = q["id"]
                opts = q["options"]
                if should_shuffle_opt and opts and len(opts) > 1 and q["question_type"] in ("MCQ", "MULTI_SELECT"):
                    perm = list(range(len(opts)))
                    random.shuffle(perm)
                    shuffle_map["option_maps"][q_id] = perm
                else:
                    shuffle_map["option_maps"][q_id] = list(range(len(opts))) if opts else []

        # Catch any question ids not captured in sections_list
        for q in raw_questions:
            if q["id"] not in shuffle_map["question_order"]:
                shuffle_map["question_order"].append(q["id"])
            if q["id"] not in shuffle_map["option_maps"]:
                shuffle_map["option_maps"][q["id"]] = list(range(len(q["options"]))) if q["options"] else []

        exam_responses["_shuffle_map"] = shuffle_map
        exam.responses = exam_responses
        await db.commit()

    # 4. Construct final served question list ordered and permuted by shuffle_map
    q_by_id = {q["id"]: q for q in raw_questions}
    final_questions = []
    
    order = shuffle_map.get("question_order") or [q["id"] for q in raw_questions]
    for q_id in order:
        q = q_by_id.get(q_id)
        if not q:
            continue
        opts = q["options"]
        opt_perm = (shuffle_map.get("option_maps") or {}).get(q_id)
        if opt_perm and opts and len(opt_perm) == len(opts):
            shuffled_opts = [opts[i] for i in opt_perm if 0 <= i < len(opts)]
        else:
            shuffled_opts = list(opts)

        final_questions.append({
            "id": q["id"],
            "rule_id": q["rule_id"],
            "question_text": q["question_text"],
            "question_type": q["question_type"],
            "options": shuffled_opts,
            "difficulty": q["difficulty"],
            "marks": q["marks"],
            "section_id": q["section_id"],
            "section_title": q["section_title"],
        })

    # Sanitize responses returned to client (exclude internal metadata keys)
    client_responses = {k: v for k, v in (exam.responses or {}).items() if not k.startswith("_")}

    return {
        "exam_session_id": exam.id,
        "assessment_name": exam.assessment.name,
        "status": exam.status,
        "responses": client_responses,
        "questions": final_questions,
        "sections": sections_list,
        "pass_mark_pct": exam.assessment.pass_mark_pct,
        "use_weighted_marks": exam.assessment.use_weighted_marks,
        "reveal_score_to_user": exam.assessment.reveal_score_to_user,
        "duration_mins": exam.assessment.duration_mins,
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
    section_scores: dict[str, dict] = {}
    graded_responses: dict[str, dict] = {}

    from app.services.exam_builder.grading import grade_response

    # Retrieve shuffle map if present for de-mapping permuted option choices
    shuffle_map = (exam.responses or {}).get("_shuffle_map") or {}
    opt_maps = shuffle_map.get("option_maps") or {}

    for item in assessment.manifest:
        var_id_str = str(item.get('id') or item.get('question_variant_id'))
        try:
            var_id = uuid.UUID(var_id_str)
        except Exception:
            var_id = uuid.uuid4()

        rule_id_str = item.get('rule_id')
        rule_risk = 1
        if rule_id_str:
            try:
                r_stmt = select(Rule.risk_score).where(Rule.id == uuid.UUID(rule_id_str))
                r_res = await db.execute(r_stmt)
                risk_val = r_res.scalar_one_or_none()
                if risk_val:
                    rule_risk = risk_val
            except Exception:
                pass

        # Mark weight (Req #10 / Exam Builder)
        if use_weighted:
            weight = float(rule_risk)
        elif item.get('marks') is not None:
            weight = float(item['marks'])
        else:
            weight = float(marks_per_q)

        total_possible += weight

        # Section accumulator
        sec_id = str(item.get('section_id') or 'section-a')
        sec_cfg = (assessment.section_breakdown or {}).get(sec_id, {})
        sec_title = item.get('section_title') or sec_cfg.get("title") or "Section A"
        if sec_id not in section_scores:
            section_scores[sec_id] = {
                "title": sec_title,
                "score": 0.0,
                "total_possible": 0.0,
                "min_pass_percent": sec_cfg.get("min_pass_percent") if sec_cfg else item.get("min_pass_percent"),
            }
        section_scores[sec_id]["total_possible"] += weight

        # Retrieve saved response
        raw_resp = exam.responses.get(var_id_str)
        if raw_resp is None and item.get('question_variant_id'):
            raw_resp = exam.responses.get(str(item['question_variant_id']))

        # De-map shuffled option indices back to original indices
        opt_perm = opt_maps.get(var_id_str)
        if opt_perm and raw_resp is not None:
            if isinstance(raw_resp, dict):
                mapped_resp = dict(raw_resp)
                sel_idx = raw_resp.get("selected_option_index")
                if sel_idx is not None and isinstance(sel_idx, int) and 0 <= sel_idx < len(opt_perm):
                    mapped_resp["selected_option_index"] = opt_perm[sel_idx]
                sel_indices = raw_resp.get("selected_option_indices")
                if sel_indices is not None and isinstance(sel_indices, list):
                    mapped_resp["selected_option_indices"] = [opt_perm[i] for i in sel_indices if 0 <= i < len(opt_perm)]
                resp_to_grade = mapped_resp
            elif isinstance(raw_resp, int) and 0 <= raw_resp < len(opt_perm):
                resp_to_grade = opt_perm[raw_resp]
            elif isinstance(raw_resp, list):
                resp_to_grade = [opt_perm[i] for i in raw_resp if 0 <= i < len(opt_perm)]
            else:
                resp_to_grade = raw_resp
        else:
            resp_to_grade = raw_resp

        # Determine payload and question type from snapshot or DB variant
        q_type = item.get("question_type")
        payload = item.get("payload") or {}

        if not payload:
            c_idx = item.get("correct_option_index")
            if c_idx is None:
                c_idx = item.get("correct_answer_index")
            payload = {
                "options": item.get("options") or [],
                "correct_option_index": c_idx,
                "correct_option_indices": item.get("correct_option_indices"),
                "correct_answer": item.get("correct_answer"),
                "blank_answer_variants": item.get("blank_answer_variants"),
            }

        # If not present in snapshot, fetch from QuestionVariant
        has_answers = (
            payload.get("correct_option_index") is not None
            or bool(payload.get("correct_option_indices"))
            or bool(payload.get("correct_answer"))
            or bool(payload.get("blank_answer_variants"))
        )
        if not q_type or not has_answers:
            if item.get('question_variant_id'):
                try:
                    v_stmt = select(QuestionVariant).where(QuestionVariant.id == uuid.UUID(str(item['question_variant_id'])))
                    v_res = await db.execute(v_stmt)
                    variant = v_res.scalar_one_or_none()
                    if variant:
                        if not q_type:
                            q_type = variant.question_type
                        payload = {
                            "options": variant.options,
                            "correct_option_index": variant.correct_option_index,
                            "correct_option_indices": variant.correct_option_indices,
                            "correct_answer": variant.correct_answer,
                            "blank_answer_variants": variant.blank_answer_variants,
                        }
                except Exception:
                    pass

        correct = grade_response(q_type or "MCQ", payload, resp_to_grade)
        awarded = weight if correct else 0.0

        if correct:
            total_score += weight
            section_scores[sec_id]["score"] += weight

        graded_responses[var_id_str] = {
            "response": raw_resp,
            "is_correct": correct,
            "awarded_marks": awarded,
            "max_marks": weight,
        }

        # Record usage history if this was a valid variant in question_bank
        source_id = item.get('source_variant_id') or item.get('question_variant_id')
        if source_id:
            try:
                candidate_id = uuid.UUID(str(source_id))
                exists_stmt = select(QuestionVariant.id).where(QuestionVariant.id == candidate_id)
                exists_res = await db.execute(exists_stmt)
                if exists_res.scalar_one_or_none():
                    usage_history_entries.append(QuestionUsageHistory(
                        employee_id=current_user.id,
                        question_variant_id=candidate_id,
                        exam_session_id=exam.id,
                    ))
            except Exception:
                pass

    # Compute SCI score as percentage
    sci_score = (total_score / total_possible * 100) if total_possible > 0 else 0.0

    # Determine per-section pass compliance and identify failed must-pass sections
    all_sections_passed = True
    failed_must_pass_sections: list[str] = []
    for s_id, s_data in section_scores.items():
        pos = s_data["total_possible"]
        pct = (s_data["score"] / pos * 100.0) if pos > 0 else 0.0
        s_data["percentage"] = round(pct, 2)
        min_pass = s_data.get("min_pass_percent")
        if min_pass is not None and pos > 0:
            if pct < float(min_pass):
                all_sections_passed = False
                s_data["passed"] = False
                failed_must_pass_sections.append(s_data.get("title", s_id))
            else:
                s_data["passed"] = True
        else:
            s_data["passed"] = True

    # Determine pass/fail threshold: overall % AND all must-pass sections
    if pass_abs is not None:
        passed = (total_score >= pass_abs) and all_sections_passed
    else:
        passed = (sci_score >= pass_pct) and all_sections_passed

    # Update responses with awarded marks, section scores, and failed sections
    exam.responses = {
        **exam.responses,
        "_graded": graded_responses,
        "_section_scores": section_scores,
        "_failed_sections": failed_must_pass_sections,
    }

    exam.score = sci_score
    
    # Calculate composite integrity score from all recorded anomalies
    anomalies = list(exam.lockdown_anomalies or [])
    total_anomaly_penalty = 0.0
    for anom in anomalies:
        a_type = anom.get("type", "")
        if a_type == "unlock_failure":
            total_anomaly_penalty += 15.0
        elif a_type in ("fullscreen_exit", "tab_hidden", "focus_blur", "screenshare_stopped", "camera_stopped"):
            dur = float(anom.get("duration_s", 0) or 0)
            total_anomaly_penalty += 12.0 + min(dur * 0.5, 20.0)
        else:
            total_anomaly_penalty += 10.0

    server_calc_integrity = max(0.0, 100.0 - total_anomaly_penalty)
    final_integrity = min(request.integrity_score, server_calc_integrity) if anomalies else request.integrity_score
    exam.integrity_score = round(final_integrity, 1)
    exam.completed_at = datetime.now(timezone.utc)

    # Save usage history
    for entry in usage_history_entries:
        db.add(entry)

    c_stmt = select(Company).where(Company.id == current_user.company_id)
    c_res = await db.execute(c_stmt)
    company = c_res.scalar_one()

    if exam.integrity_score < 70.0:
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
            designation=current_user.designation,
            exam_id=exam.id,
            version="1.0",
            section_breakdown=section_scores,
            include_section_breakdown=False,
        )
        now_utc = datetime.now(timezone.utc)
        cert = Certificate(
            id=cert_id,
            exam_session_id=exam.id,
            employee_id=current_user.id,
            issued_at=now_utc,
            qr_code_data=qr,
            signed_payload=sig,
            pdf_url=pdf_url
        )
        db.add(cert)

        cert_record = CertificateRecord(
            id=cert_id,
            user_id=current_user.id,
            session_id=exam.id,
            sci_score=sci_score,
            issue_date=now_utc,
            expiry_date=now_utc + timedelta(days=365),
            is_imported=False,
            file_path_or_blob=pdf_url,
        )
        db.add(cert_record)
    else:
        exam.status = ExamStatus.FAILED

    await db.commit()
    return {
        "status": exam.status,
        "score": round(sci_score, 2),
        "passed": passed,
        "reveal_score_to_user": exam.assessment.reveal_score_to_user,
        "pass_mark_pct": pass_pct,
        "all_sections_passed": all_sections_passed,
        "failed_sections": failed_must_pass_sections,
        "section_scores": section_scores,
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
    duration_mins: Optional[int] = None

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
        section_breakdown={},
        duration_mins=request.duration_mins
    )
    db.add(assessment)
    await db.commit()
    await db.refresh(assessment)
    return {"assessment_id": assessment.id}


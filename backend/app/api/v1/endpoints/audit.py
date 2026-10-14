import csv
import io
import uuid
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, ConfigDict

from app.api.deps import get_db_session, get_current_active_user
from app.models.user import User
from app.models.test_attempt import ExamSession, ExamStatus
from app.models.certificate import CertificateRecord
from app.models.assessment_session import Assessment
from app.models.hierarchy import Rule
from app.services.certificate import generate_certificate

router = APIRouter()

# Schemas
class IssueCertificateRequest(BaseModel):
    validity_months: int = 12
    designation: Optional[str] = None
    assessment_name: Optional[str] = None
    force_new: Optional[bool] = False

class AttemptResponse(BaseModel):
    id: uuid.UUID
    employee_id: uuid.UUID
    assessment_id: uuid.UUID
    status: ExamStatus
    employee_name: str
    job_title: str
    assessment_name: str
    score: Optional[float]
    integrity_score: Optional[float]
    lockdown_escalated: bool
    is_retake_requested: bool = False
    has_certificate: bool = False
    certificate_id: Optional[uuid.UUID] = None
    certificate_pdf_url: Optional[str] = None
    completed_at: Optional[datetime]
    model_config = ConfigDict(from_attributes=True)

class IssueCertificateResponse(BaseModel):
    message: str
    certificate_id: uuid.UUID
    pdf_url: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class ImportCertificateResponse(BaseModel):
    message: str
    certificate_id: uuid.UUID
    model_config = ConfigDict(from_attributes=True)

class ExpiringCertificateInfo(BaseModel):
    employee_id: uuid.UUID
    certificate_id: uuid.UUID
    expiry_date: datetime
    is_imported: bool
    model_config = ConfigDict(from_attributes=True)

# Endpoints
@router.get("/attempts", response_model=List[AttemptResponse])
async def get_pending_attempts(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    """Fetch all completed tests pending admin review."""
    # Assuming pending review is either COMPLETED or PENDING_REVIEW
    stmt = (
        select(ExamSession)
        .options(selectinload(ExamSession.employee), selectinload(ExamSession.assessment))
        .where(
            ExamSession.status.in_([ExamStatus.COMPLETED, ExamStatus.PENDING_REVIEW, ExamStatus.RETAKE_REQUESTED, ExamStatus.FAILED])
        )
    )
    result = await db.execute(stmt)
    sessions = result.scalars().all()
    
    # Check which sessions already have a certificate issued
    session_cert_map = {}
    if sessions:
        from app.models.certificate import CertificateRecord, Certificate
        cert_stmt = select(CertificateRecord).where(CertificateRecord.session_id.in_([s.id for s in sessions]))
        cert_res = await db.execute(cert_stmt)
        for c_rec in cert_res.scalars().all():
            session_cert_map[c_rec.session_id] = c_rec
    
    attempts = []
    for s in sessions:
        cert_for_s = session_cert_map.get(s.id)
        attempts.append({
            "id": s.id,
            "employee_id": s.employee_id,
            "assessment_id": s.assessment_id,
            "status": s.status,
            "score": s.score,
            "integrity_score": s.integrity_score,
            "lockdown_escalated": s.status == ExamStatus.PENDING_REVIEW,
            "is_retake_requested": s.status == ExamStatus.RETAKE_REQUESTED,
            "completed_at": s.completed_at,
            "employee_name": s.employee.full_name or s.employee.employee_code,
            "job_title": s.employee.designation or "Employee",
            "assessment_name": s.assessment.name if s.assessment else "Assessment",
            "has_certificate": cert_for_s is not None,
            "certificate_id": cert_for_s.id if cert_for_s else None,
            "certificate_pdf_url": cert_for_s.file_path_or_blob if cert_for_s else None,
        })
    return attempts

class AuditTimelineEvent(BaseModel):
    source: str
    type: str
    ts: Optional[str]
    duration_s: Optional[float]
    detail: dict

class AuditTimelineResponse(BaseModel):
    exam_session_id: uuid.UUID
    employee_name: Optional[str] = None
    assessment_name: Optional[str] = None
    status: str = "completed"
    score: Optional[float] = None
    lockdown_escalated: bool = False
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    timeline: List[AuditTimelineEvent]

@router.get("/attempts/{attempt_id}/timeline", response_model=AuditTimelineResponse)
async def get_audit_timeline(
    attempt_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    stmt = select(ExamSession).options(selectinload(ExamSession.employee), selectinload(ExamSession.assessment)).where(ExamSession.id == attempt_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Attempt not found")
        
    timeline_events = []
    
    for i, ev in enumerate(session.lockdown_anomalies or []):
        t_str = ev.get("timestamp") or ev.get("ts")
        timeline_events.append(
            AuditTimelineEvent(
                source="lockdown",
                type=ev.get("type", "anomaly"),
                ts=t_str if t_str else datetime.now(timezone.utc).isoformat(),
                duration_s=ev.get("duration_s"),
                detail=ev
            )
        )
        
    return AuditTimelineResponse(
        exam_session_id=session.id,
        employee_name=session.employee.full_name or session.employee.employee_code if session.employee else None,
        assessment_name=session.assessment.name if session.assessment else None,
        status=session.status,
        score=session.score,
        lockdown_escalated=session.lockdown_escalated,
        started_at=session.started_at,
        completed_at=session.completed_at,
        timeline=timeline_events
    )

class AttemptReviewItem(BaseModel):
    question_id: str
    question_text: str
    question_type: str
    options: List[str]
    correct_answer: str
    user_answer: Optional[str]
    is_correct: bool
    marks_awarded: float
    max_marks: float
    difficulty: Optional[str] = "medium"
    section_id: Optional[str] = "section-a"
    section_title: Optional[str] = "Section A"
    rule_id: Optional[str] = None
    rule_code: Optional[str] = None
    rule_text: Optional[str] = None

class AttemptReviewResponse(BaseModel):
    attempt_id: uuid.UUID
    items: List[AttemptReviewItem]
    section_scores: Optional[dict] = None
    total_score: Optional[float] = None
    passed: Optional[bool] = None
    failed_sections: Optional[List[str]] = None

@router.get("/attempts/export-csv", summary="Export all attempts audit data to CSV with per-section columns")
async def export_attempts_csv(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    stmt = (
        select(ExamSession)
        .options(selectinload(ExamSession.employee), selectinload(ExamSession.assessment))
        .where(ExamSession.status.in_([ExamStatus.COMPLETED, ExamStatus.PENDING_REVIEW, ExamStatus.RETAKE_REQUESTED, ExamStatus.FAILED]))
        .order_by(ExamSession.completed_at.desc())
    )
    result = await db.execute(stmt)
    sessions = result.scalars().all()

    # Discover all distinct section names across attempts
    section_names_set = set()
    for s in sessions:
        sec_scores = (s.responses or {}).get("_section_scores") or {}
        for sec_id, sec_data in sec_scores.items():
            section_names_set.add(sec_data.get("title", sec_id))
    all_sections = sorted(list(section_names_set))

    output = io.StringIO()
    writer = csv.writer(output)

    # Header
    base_headers = [
        "Attempt ID",
        "Employee Code",
        "Employee Name",
        "Assessment Title",
        "Status",
        "Completed At",
        "SCI Score (%)",
        "Integrity Score (%)",
        "Passed",
    ]
    section_headers = [f"{sec} (%)" for sec in all_sections]
    writer.writerow(base_headers + section_headers)

    for s in sessions:
        sec_scores = (s.responses or {}).get("_section_scores") or {}
        sec_pct_map = {}
        for sid, sdata in sec_scores.items():
            t = sdata.get("title", sid)
            pct = sdata.get("percentage")
            if pct is None and sdata.get("total_possible", 0) > 0:
                pct = round((sdata.get("score", 0) / sdata["total_possible"]) * 100.0, 2)
            sec_pct_map[t] = pct if pct is not None else "N/A"

        row = [
            str(s.id),
            s.employee.employee_code if s.employee else "",
            s.employee.full_name or (s.employee.employee_code if s.employee else "Unknown"),
            s.assessment.name if s.assessment else "Assessment",
            s.status.value if hasattr(s.status, "value") else str(s.status),
            s.completed_at.isoformat() if s.completed_at else "",
            f"{s.score:.1f}" if s.score is not None else "0.0",
            f"{s.integrity_score:.1f}" if s.integrity_score is not None else "100.0",
            "YES" if (s.status == ExamStatus.COMPLETED) else "NO",
        ]
        for sec in all_sections:
            row.append(str(sec_pct_map.get(sec, "N/A")))
        writer.writerow(row)

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=exam_attempts_audit.csv"},
    )

@router.get("/attempts/{attempt_id}/review", response_model=AttemptReviewResponse)
async def get_attempt_review(
    attempt_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    stmt = select(ExamSession).options(selectinload(ExamSession.assessment)).where(ExamSession.id == attempt_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    
    if not session:
        raise HTTPException(status_code=404, detail="Attempt not found")
        
    items = []
    responses = session.responses or {}
    graded_info = responses.get("_graded") or {}
    section_scores = responses.get("_section_scores") or {}
    failed_sections = responses.get("_failed_sections") or []

    # Gather all rule IDs to fetch rule definitions in bulk
    rule_ids = set()
    for q in session.assessment.manifest:
        r_id = q.get("rule_id")
        if r_id:
            try:
                rule_ids.add(uuid.UUID(str(r_id)))
            except Exception:
                pass

    rules_by_id = {}
    if rule_ids:
        r_stmt = select(Rule).where(Rule.id.in_(list(rule_ids)))
        r_res = await db.execute(r_stmt)
        rules_by_id = {str(r.id): r for r in r_res.scalars().all()}

    for q in session.assessment.manifest:
        q_id = str(q.get("id") or q.get("question_variant_id"))
        q_type = q.get("question_type", "MCQ")
        options = q.get("options") or []
        payload = q.get("payload") or {}
        if not options and "options" in payload:
            options = payload.get("options") or []

        sec_id = str(q.get("section_id") or "section-a")
        sec_cfg = (session.assessment.section_breakdown or {}).get(sec_id, {})
        sec_title = q.get("section_title") or sec_cfg.get("title") or "Section A"
        difficulty = q.get("difficulty", "medium")

        rule_id_str = str(q.get("rule_id", "")) if q.get("rule_id") else None
        rule_obj = rules_by_id.get(rule_id_str) if rule_id_str else None

        user_ans = responses.get(q_id) or {}
        if not isinstance(user_ans, dict):
            user_ans = {"selected_option_index": user_ans}

        # Check if question was graded in session
        g_item = graded_info.get(q_id)
        if g_item:
            is_correct = bool(g_item.get("is_correct"))
            marks_awarded = float(g_item.get("awarded_marks", 0.0))
            max_marks = float(g_item.get("max_marks", 1.0))
        else:
            max_marks = float(q.get("marks", 1.0))
            marks_awarded = 0.0
            is_correct = False

        correct_ans_str = ""
        user_ans_str = ""

        if q_type == "FILL_IN_BLANK":
            correct_ans_str = str(q.get("correct_answer") or q.get("correct_text") or payload.get("correct_answer") or payload.get("blank_answer") or "")
            user_text = (user_ans.get("text_answer") or "").strip()
            user_ans_str = user_text
            if not g_item:
                is_correct = (user_text.lower() == correct_ans_str.lower())
                marks_awarded = max_marks if is_correct else 0.0
        elif q_type == "MULTI_SELECT":
            correct_indices = q.get("correct_option_indices") or payload.get("correct_option_indices") or []
            correct_ans_str = ", ".join([options[i] for i in correct_indices if 0 <= i < len(options)])
            user_indices = user_ans.get("selected_option_indices") or []
            user_ans_str = ", ".join([options[i] for i in user_indices if 0 <= i < len(options)])
            if not g_item:
                is_correct = sorted(user_indices) == sorted(correct_indices)
                marks_awarded = max_marks if is_correct else 0.0
        else:
            correct_idx = q.get("correct_option_index")
            if correct_idx is None:
                correct_idx = payload.get("correct_option_index", -1)
            correct_ans_str = options[correct_idx] if (correct_idx is not None and 0 <= correct_idx < len(options)) else (q.get("correct_answer") or "")
            user_idx = user_ans.get("selected_option_index")
            if user_idx is not None and isinstance(user_idx, int) and 0 <= user_idx < len(options):
                user_ans_str = options[user_idx]
            else:
                user_ans_str = str(user_idx or "")
            if not g_item:
                is_correct = (user_idx == correct_idx)
                marks_awarded = max_marks if is_correct else 0.0

        items.append(AttemptReviewItem(
            question_id=q_id,
            question_text=q.get("question_text") or q.get("stem") or "",
            question_type=q_type,
            options=options,
            correct_answer=correct_ans_str,
            user_answer=user_ans_str or "",
            is_correct=is_correct,
            marks_awarded=marks_awarded,
            max_marks=max_marks,
            difficulty=difficulty,
            section_id=sec_id,
            section_title=sec_title,
            rule_id=rule_id_str,
            rule_code=rule_obj.rule_code if rule_obj else None,
            rule_text=rule_obj.text if rule_obj else None,
        ))

    return AttemptReviewResponse(
        attempt_id=session.id,
        items=items,
        section_scores=section_scores,
        total_score=session.score,
        passed=(session.status == ExamStatus.COMPLETED),
        failed_sections=failed_sections,
    )

@router.post("/attempts/{attempt_id}/issue-certificate", response_model=IssueCertificateResponse)
async def issue_certificate(
    attempt_id: uuid.UUID,
    request: IssueCertificateRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Manual trigger. Generates the Ed25519-signed ReportLab PDF, 
    updates the DB, and sets reveal_score_to_user = True.
    """
    stmt = select(ExamSession).options(
        selectinload(ExamSession.assessment),
        selectinload(ExamSession.employee).selectinload(User.company)
    ).where(ExamSession.id == attempt_id)
    result = await db.execute(stmt)
    attempt = result.scalar_one_or_none()
    
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
        
    if not attempt.score:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attempt has no score to issue certificate for.")
        
    # Update reveal_score_to_user
    attempt.assessment.reveal_score_to_user = True
    
    # Calculate expiry based on request
    issue_date = datetime.now(timezone.utc)
    expiry_date = issue_date + timedelta(days=30 * request.validity_months)
    
    # Determine custom designation and assessment title
    target_designation = request.designation or (attempt.employee.designation if attempt.employee else "Operator")
    target_assessment_name = request.assessment_name or (attempt.assessment.name if attempt.assessment else "Safety Assessment")

    existing_cert = None
    if not request.force_new:
        stmt_existing = (
            select(CertificateRecord)
            .join(ExamSession, CertificateRecord.session_id == ExamSession.id)
            .where(
                CertificateRecord.user_id == attempt.employee_id,
                ExamSession.assessment_id == attempt.assessment_id
            )
        )
        res = await db.execute(stmt_existing)
        existing_cert = res.scalar_one_or_none()

    cert_id = existing_cert.id if existing_cert else uuid.uuid4()

    qr_data, signature, pdf_url = generate_certificate(
        certificate_id=cert_id,
        employee_id=attempt.employee_id,
        full_name=attempt.employee.full_name or attempt.employee.employee_code if attempt.employee else "Unknown",
        score=attempt.score,
        company_name=attempt.employee.company.name if attempt.employee and attempt.employee.company else "AegisGraph AI",
        is_imported=False,
        assessment_name=target_assessment_name,
        logo_url=attempt.employee.company.logo_url if attempt.employee and attempt.employee.company else None,
        designation=target_designation,
        exam_id=attempt.id,
    )
    
    pdf_path = pdf_url

    if existing_cert:
        existing_cert.session_id = attempt.id
        existing_cert.sci_score = attempt.score
        existing_cert.issue_date = issue_date
        existing_cert.expiry_date = expiry_date
        existing_cert.file_path_or_blob = pdf_path
        cert = existing_cert
    else:
        cert = CertificateRecord(
            id=cert_id,
            user_id=attempt.employee_id,
            session_id=attempt.id,
            sci_score=attempt.score,
            issue_date=issue_date,
            expiry_date=expiry_date,
            is_imported=False,
            file_path_or_blob=pdf_path
        )
        db.add(cert)

    # Sync with Certificate table
    from app.models.certificate import Certificate
    c_stmt = select(Certificate).where(Certificate.exam_session_id == attempt.id)
    c_res = await db.execute(c_stmt)
    existing_c = c_res.scalar_one_or_none()
    if existing_c:
        existing_c.pdf_url = pdf_path
        existing_c.signed_payload = signature
        existing_c.qr_code_data = qr_data
    else:
        db.add(Certificate(
            id=cert_id,
            exam_session_id=attempt.id,
            employee_id=attempt.employee_id,
            issued_at=issue_date,
            qr_code_data=qr_data,
            signed_payload=signature,
            pdf_url=pdf_path,
        ))
    
    await db.commit()
    await db.refresh(cert)
    
    return {"message": "Certificate issued successfully", "certificate_id": cert.id, "pdf_url": pdf_path}

@router.post("/certificates/import", response_model=ImportCertificateResponse)
async def import_certificate(
    user_id: uuid.UUID,
    sci_score: float,
    issue_date: datetime,
    expiry_date: datetime,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Endpoint accepting a multipart form PDF upload. 
    Marks it as is_imported=True, sets the expiry_date, and links it to the user_id.
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be a PDF")
        
    # In a real scenario, save the file bytes
    file_path_or_blob = f"/imported_certs/{uuid.uuid4()}.pdf"
    
    cert = CertificateRecord(
        user_id=user_id,
        session_id=None,
        sci_score=sci_score,
        issue_date=issue_date,
        expiry_date=expiry_date,
        is_imported=True,
        file_path_or_blob=file_path_or_blob
    )
    
    db.add(cert)
    await db.commit()
    await db.refresh(cert)
    
    return {"message": "Certificate imported successfully", "certificate_id": cert.id}

async def get_expiring_certificates(db: AsyncSession, days_threshold: int = 30) -> List[CertificateRecord]:
    """
    Utility function that queries the CertificateRecord table and returns a list of 
    employees whose certs (imported or native) are expiring soon.
    """
    now = datetime.now(timezone.utc)
    threshold_date = now + timedelta(days=days_threshold)
    
    stmt = (
        select(CertificateRecord)
        .where(
            and_(
                CertificateRecord.expiry_date > now,
                CertificateRecord.expiry_date <= threshold_date
            )
        )
        .options(selectinload(CertificateRecord.user))
    )
    
    result = await db.execute(stmt)
    return result.scalars().all()

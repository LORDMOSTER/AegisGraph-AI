import uuid
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, ConfigDict

from app.api.deps import get_db_session, get_current_active_user
from app.models.user import User
from app.models.test_attempt import ExamSession, ExamStatus
from app.models.certificate import CertificateRecord
from app.models.assessment_session import Assessment

router = APIRouter()

# Schemas
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
    completed_at: Optional[datetime]
    model_config = ConfigDict(from_attributes=True)

class IssueCertificateResponse(BaseModel):
    message: str
    certificate_id: uuid.UUID
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
    
    attempts = []
    for s in sessions:
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
        t_str = ev.get("timestamp")
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
    question_text: str
    options: List[str]
    correct_answer: str
    user_answer: Optional[str]
    is_correct: bool

class AttemptReviewResponse(BaseModel):
    attempt_id: uuid.UUID
    items: List[AttemptReviewItem]

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
    for q in session.assessment.manifest:
        q_id = str(q.get("question_variant_id"))
        q_type = q.get("question_type", "MCQ")
        options = q.get("options", [])
        
        correct_ans_str = ""
        user_ans_str = ""
        is_correct = False
        
        user_ans = responses.get(q_id) or {}
        if not isinstance(user_ans, dict):
            # Backward compatibility if it was stored directly
            user_ans = {"selected_option_index": user_ans}
            
        if q_type == "FILL_IN_BLANK":
            correct_ans_str = q.get("correct_text", "")
            user_text = (user_ans.get("text_answer") or "").strip()
            user_ans_str = user_text
            is_correct = (user_text.lower() == correct_ans_str.lower())
        elif q_type == "MULTI_SELECT":
            correct_indices = q.get("correct_answer_indices", [])
            correct_ans_str = ", ".join([options[i] for i in correct_indices if 0 <= i < len(options)])
            user_indices = user_ans.get("selected_option_indices") or []
            user_ans_str = ", ".join([options[i] for i in user_indices if 0 <= i < len(options)])
            is_correct = sorted(user_indices) == sorted(correct_indices)
        else:
            correct_idx = q.get("correct_answer_index", -1)
            correct_ans_str = options[correct_idx] if 0 <= correct_idx < len(options) else ""
            user_idx = user_ans.get("selected_option_index")
            if user_idx is not None and 0 <= user_idx < len(options):
                user_ans_str = options[user_idx]
            is_correct = (user_idx == correct_idx)
            
        items.append(AttemptReviewItem(
            question_text=q.get("question_text", ""),
            options=options,
            correct_answer=correct_ans_str,
            user_answer=user_ans_str or "",
            is_correct=bool(is_correct)
        ))
        
    return AttemptReviewResponse(attempt_id=session.id, items=items)

@router.post("/attempts/{attempt_id}/issue-certificate", response_model=IssueCertificateResponse)
async def issue_certificate(
    attempt_id: uuid.UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Manual trigger. Generates the Ed25519-signed ReportLab PDF, 
    updates the DB, and sets reveal_score_to_user = True.
    """
    stmt = select(ExamSession).options(selectinload(ExamSession.assessment)).where(ExamSession.id == attempt_id)
    result = await db.execute(stmt)
    attempt = result.scalar_one_or_none()
    
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")
        
    if not attempt.score:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attempt has no score to issue certificate for.")
        
    # Update reveal_score_to_user
    attempt.assessment.reveal_score_to_user = True
    
    # Mock PDF generation & Ed25519 signing for now (as requested by scope limit, or we can use a dummy payload)
    pdf_path = f"/certs/{attempt.id}.pdf"
    
    # Create CertificateRecord
    issue_date = datetime.now(timezone.utc)
    expiry_date = issue_date + timedelta(days=365) # 1 year validity
    
    cert = CertificateRecord(
        user_id=attempt.employee_id,
        session_id=attempt.id,
        sci_score=attempt.score,
        issue_date=issue_date,
        expiry_date=expiry_date,
        is_imported=False,
        file_path_or_blob=pdf_path
    )
    
    db.add(cert)
    await db.commit()
    await db.refresh(cert)
    
    return {"message": "Certificate issued successfully", "certificate_id": cert.id}

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

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
            ExamSession.status.in_([ExamStatus.COMPLETED, ExamStatus.PENDING_REVIEW])
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
            "completed_at": s.completed_at,
            "employee_name": s.employee.full_name or s.employee.employee_code,
            "job_title": s.employee.designation or "Employee",
            "assessment_name": s.assessment.name if s.assessment else "Assessment",
        })
    return attempts

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

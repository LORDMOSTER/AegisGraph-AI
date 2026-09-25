from typing import List
from datetime import timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.models.certificate import Certificate, CertificateRecord
from app.models.test_attempt import ExamSession
from app.models.user import User
from app.models.company import Company

router = APIRouter()

@router.get("/", response_model=List[dict])
async def get_certificates(db: AsyncSession = Depends(get_db_session)):
    stmt = (
        select(CertificateRecord)
        .options(
            selectinload(CertificateRecord.user).selectinload(User.company)
        )
        .order_by(CertificateRecord.created_at.desc())
    )
    result = await db.execute(stmt)
    records = result.scalars().all()
    
    response = []
    for rec in records:
        response.append({
            "id": str(rec.id),
            "employeeName": rec.user.full_name or "Unknown",
            "employeeId": rec.user.employee_code or "Unknown",
            "company": rec.user.company.name if getattr(rec.user, 'company', None) else "Unknown",
            "score": rec.sci_score,
            "issueDate": rec.issue_date.isoformat(),
            "expiryDate": rec.expiry_date.isoformat(),
            "status": "Valid",
            "isImported": rec.is_imported
        })
        
    return response

import uuid

@router.delete("/{cert_id}")
async def revoke_certificate(cert_id: uuid.UUID, db: AsyncSession = Depends(get_db_session)):
    # Assuming "revoking" means deleting it from the database for now.
    stmt = select(Certificate).where(Certificate.id == cert_id)
    result = await db.execute(stmt)
    cert = result.scalar_one_or_none()
    
    if cert:
        await db.delete(cert)
        await db.commit()
    
    return {"message": "Certificate revoked"}

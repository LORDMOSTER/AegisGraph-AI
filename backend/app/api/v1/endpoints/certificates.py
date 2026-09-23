from typing import List
from datetime import timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session
from app.models.certificate import Certificate
from app.models.test_attempt import ExamSession
from app.models.user import User
from app.models.company import Company

router = APIRouter()

@router.get("/", response_model=List[dict])
async def get_certificates(db: AsyncSession = Depends(get_db_session)):
    stmt = (
        select(Certificate)
        .options(
            selectinload(Certificate.employee).selectinload(User.company),
            selectinload(Certificate.exam_session)
        )
        .order_by(Certificate.issued_at.desc())
    )
    result = await db.execute(stmt)
    certificates = result.scalars().all()
    
    response = []
    for cert in certificates:
        # Define expiry as 1 year from issued_at
        expiry = cert.issued_at + timedelta(days=365)
        
        status = "Valid"
        
        response.append({
            "id": str(cert.id),
            "employeeName": cert.employee.full_name or "Unknown",
            "employeeId": cert.employee.employee_code or "Unknown",
            "company": cert.employee.company.name if cert.employee.company else "Unknown",
            "score": cert.exam_session.score if cert.exam_session.score is not None else 0,
            "issueDate": cert.issued_at.isoformat(),
            "expiryDate": expiry.isoformat(),
            "status": status
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

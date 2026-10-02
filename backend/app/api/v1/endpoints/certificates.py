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
import json
import os
import tempfile
import httpx
import pdfplumber
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db_session, get_current_active_user
from app.models.certificate import Certificate, CertificateRecord
from app.models.user import User
from app.services.certificate import generate_certificate

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
        now = datetime.now(timezone.utc)
        if rec.expiry_date < now:
            status = "Expired"
        elif rec.expiry_date <= now + timedelta(days=30):
            status = "Expiring Soon"
        else:
            status = "Valid"

        response.append({
            "id": str(rec.id),
            "employeeName": rec.user.full_name or "Unknown",
            "employeeId": rec.user.employee_code or "Unknown",
            "company": rec.user.company.name if getattr(rec.user, 'company', None) else "Unknown",
            "score": rec.sci_score,
            "issueDate": rec.issue_date.isoformat(),
            "expiryDate": rec.expiry_date.isoformat(),
            "status": status,
            "isImported": rec.is_imported,
            "pdfUrl": getattr(rec, "file_path_or_blob", None)
        })
        
    return response

from pydantic import BaseModel

class CertificateUpdate(BaseModel):
    score: Optional[float] = None
    expiry_date: Optional[str] = None

@router.delete("/{cert_id}")
async def revoke_certificate(cert_id: uuid.UUID, db: AsyncSession = Depends(get_db_session)):
    stmt = select(CertificateRecord).where(CertificateRecord.id == cert_id)
    result = await db.execute(stmt)
    cert = result.scalar_one_or_none()
    
    if cert:
        await db.delete(cert)
        await db.commit()
        return {"message": "Certificate revoked"}
    
    raise HTTPException(status_code=404, detail="Certificate not found")

@router.put("/{cert_id}")
async def update_certificate(cert_id: uuid.UUID, update_data: CertificateUpdate, db: AsyncSession = Depends(get_db_session)):
    stmt = select(CertificateRecord).where(CertificateRecord.id == cert_id)
    result = await db.execute(stmt)
    cert = result.scalar_one_or_none()
    
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")
        
    if update_data.score is not None:
        cert.sci_score = update_data.score
    if update_data.expiry_date:
        cert.expiry_date = datetime.fromisoformat(update_data.expiry_date)
        
    await db.commit()
    return {"message": "Certificate updated successfully"}

@router.post("/analyze")
async def analyze_certificate(file: UploadFile = File(...)):
    # 1. Extract text using pdfplumber
    text = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
            temp_pdf.write(await file.read())
            temp_pdf_path = temp_pdf.name
        
        with pdfplumber.open(temp_pdf_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        
        os.unlink(temp_pdf_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read PDF: {str(e)}")

    if not text.strip():
        raise HTTPException(status_code=400, detail="This looks like a scanned image. Upload a text-based PDF or enter the details manually.")

    # Cap text
    text = text[:6000]

    # 2. Call local Ollama to extract details
    prompt = f"""
    Extract the following information from the certificate text below.
    Return ONLY a JSON object with these exact keys, using null if unsure:
    "holder_name" (string)
    "certificate_title" (string)
    "issuer" (string)
    "certificate_number" (string)
    "issue_date" (string)
    "expiry_date" (string)
    "score" (number)
    "score_scale" (string, e.g. "100" or "50")
    "result" (string: pass/fail/competent/unknown)
    "validity_statement" (string, e.g. "valid for two years from date of issue")
    
    Do not guess. Ignore unrelated dates (DOB, event dates) and unrelated numbers (tonnage, hours).
    
    Certificate Text:
    {text}
    """
    
    import httpx
    from dateutil import parser as date_parser
    import re
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post("http://localhost:11434/api/generate", json={
                "model": "phi3:mini",
                "prompt": prompt,
                "stream": False,
                "format": "json",
                "options": {"temperature": 0.0}
            }, timeout=60.0)
            
            data = response.json()
            extracted = json.loads(data["response"])
            
            # Helper to parse dates
            def parse_date(d_str):
                if not d_str:
                    return None
                try:
                    return date_parser.parse(d_str, dayfirst=True).strftime("%Y-%m-%d")
                except:
                    return None
                    
            issue_date = parse_date(extracted.get("issue_date"))
            expiry_date = parse_date(extracted.get("expiry_date"))
            
            derived = False
            validity_stmt = extracted.get("validity_statement", "")
            if not expiry_date and issue_date and validity_stmt:
                # Naive duration parser
                if "two (2) years" in validity_stmt.lower() or "two years" in validity_stmt.lower():
                    issue_dt = datetime.fromisoformat(issue_date)
                    expiry_date = (issue_dt + timedelta(days=365*2)).strftime("%Y-%m-%d")
                    derived = True
            
            # Grounding checks
            normalized_text = text.lower()
            grounding = {}
            for key in ["holder_name", "certificate_number"]:
                val = extracted.get(key)
                grounding[key] = (val.lower() in normalized_text) if val else False
            
            # For score grounding, look for str(score)
            score_val = extracted.get("score")
            grounding["score"] = (str(score_val) in normalized_text) if score_val else False
            
            # Return full payload
            extracted["issue_date"] = issue_date
            extracted["expiry_date"] = expiry_date
            extracted["derived_expiry"] = derived
            extracted["grounding"] = grounding
            
            # Translate back to frontend expectations for demo
            # Ideally frontend should handle new schema
            extracted["employee_name"] = extracted.get("holder_name")
            return extracted
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI parsing failed: {str(e)}")

@router.post("/import")
async def save_imported_certificate(
    employee_id: str = Form(...),
    score: Optional[float] = Form(None),
    expiry_date: str = Form(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    # Find exact user by employee code
    stmt = select(User).options(selectinload(User.company)).where(User.employee_code == employee_id, User.company_id == current_user.company_id)
    result = await db.execute(stmt)
    user = result.scalars().first()
    
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")
        
    issue_date = datetime.now(timezone.utc)
    exp_dt = datetime.fromisoformat(expiry_date) if expiry_date else issue_date + timedelta(days=365)
    
    # Create the CertificateRecord
    new_record = CertificateRecord(
        user_id=user.id,
        sci_score=score if score is not None else 100.0,
        issue_date=issue_date,
        expiry_date=exp_dt,
        is_imported=True
    )
    db.add(new_record)
    await db.commit()
    await db.refresh(new_record)
    
    # Generate QR Code and PDF Native Template using the existing service
    # (Using a mock exam_session_id since it's imported)
    mock_session_id = uuid.uuid4()
    qr_data, signature, pdf_url = generate_certificate(
        certificate_id=new_record.id,
        employee_id=user.id,
        full_name=user.full_name or "Unknown Employee",
        score=score,
        company_name=getattr(user.company, 'name', 'AegisGraph') if getattr(user, 'company', None) else 'AegisGraph',
        logo_url=getattr(user.company, 'logo_url', None) if getattr(user, 'company', None) else None,
        designation=user.designation
    )
    
    # Update record with PDF URL
    new_record.file_path_or_blob = pdf_url
    await db.commit()
    
    return {"message": "Import successful", "pdf_url": pdf_url}

@router.post("/employee-upload")
async def employee_upload_certificate(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_active_user)
):
    import shutil
    import os
    
    os.makedirs("uploads/certs", exist_ok=True)
    file_path = f"uploads/certs/{uuid.uuid4()}_{file.filename}"
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    issue_date = datetime.now(timezone.utc)
    exp_dt = issue_date + timedelta(days=365)
    
    new_record = CertificateRecord(
        user_id=current_user.id,
        sci_score=-1.0,  # -1.0 means pending approval
        issue_date=issue_date,
        expiry_date=exp_dt,
        is_imported=True,
        file_path_or_blob=f"http://localhost:8000/{file_path}"
    )
    db.add(new_record)
    await db.commit()
    await db.refresh(new_record)
    
    return {"message": "Certificate uploaded successfully, pending admin approval"}

@router.get("/verify/{cert_id}")
async def verify_certificate(cert_id: uuid.UUID, db: AsyncSession = Depends(get_db_session)):
    # Check regular certificates
    stmt = select(Certificate).options(
        selectinload(Certificate.employee).selectinload(User.company),
        selectinload(Certificate.exam_session).selectinload(ExamSession.assessment)
    ).where(Certificate.id == cert_id)
    result = await db.execute(stmt)
    cert = result.scalar_one_or_none()
    
    from datetime import timedelta
    
    if cert:
        return {
            "status": "Verified",
            "is_imported": False,
            "employee_name": cert.employee.full_name or "Unknown",
            "employee_id": str(cert.employee.id),
            "company": cert.employee.company.name if cert.employee.company else "Unknown",
            "assessment_name": cert.exam_session.assessment.name if cert.exam_session.assessment else "Safety Assessment",
            "score": cert.exam_session.score,
            "issue_date": cert.issued_at.isoformat(),
            "expiry_date": (cert.issued_at + timedelta(days=365)).isoformat(),
            "signature": cert.signed_payload
        }
        
    # Check imported certificates
    stmt2 = select(CertificateRecord).options(
        selectinload(CertificateRecord.user).selectinload(User.company)
    ).where(CertificateRecord.id == cert_id)
    result2 = await db.execute(stmt2)
    record = result2.scalar_one_or_none()
    
    if record:
        return {
            "status": "Verified",
            "is_imported": True,
            "employee_name": record.user.full_name or "Unknown",
            "employee_id": str(record.user.id),
            "company": record.user.company.name if record.user.company else "Unknown",
            "assessment_name": "Imported Certificate",
            "score": record.sci_score,
            "issue_date": record.issue_date.isoformat(),
            "expiry_date": record.expiry_date.isoformat()
        }
        
    raise HTTPException(status_code=404, detail="Certificate not found or invalid")

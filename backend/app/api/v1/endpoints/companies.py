import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy.future import select

from app.db.session import get_db
from app.models.company import Company
from app.models.user import User, RoleEnum
from app.core.security import hash_password
from app.schemas.company import CompanyRegister, CompanyResponse

router = APIRouter()

def generate_company_code(name: str) -> str:
    # Basic acronym generator, fallback to UUID
    words = name.upper().split()
    if len(words) > 1:
        code = "".join(w[0] for w in words)[:4]
    else:
        code = name.upper()[:4]
    
    # In a real app we'd verify code uniqueness, but UUID ensures collision resistance
    return f"{code}-{str(uuid.uuid4())[:4]}"

@router.post("/register", response_model=CompanyResponse)
async def register_company(data: CompanyRegister, db: AsyncSession = Depends(get_db)):
    code = generate_company_code(data.companyName)
    
    new_company = Company(
        company_code=code,
        name=data.companyName,
    )
    db.add(new_company)
    
    try:
        await db.flush()  # to get new_company.id
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="A company with this name already exists.")
        
    admin_user = User(
        company_id=new_company.id,
        employee_code=data.adminEmail,
        password_hash=hash_password(data.adminPassword),
        role=RoleEnum.SUPER_ADMIN
    )
    db.add(admin_user)
    
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Error creating admin user.")

    return CompanyResponse(companyCode=code)

from fastapi import UploadFile, File
import os
import shutil

LOGO_DIR = os.path.join(os.getcwd(), "static", "logos")
os.makedirs(LOGO_DIR, exist_ok=True)

@router.post("/{company_id}/logo")
async def upload_company_logo(company_id: str, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Company).filter(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    file_extension = file.filename.split(".")[-1]
    logo_filename = f"logo_{company_id}.{file_extension}"
    logo_path = os.path.join(LOGO_DIR, logo_filename)
    
    with open(logo_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    company.logo_url = f"/static/logos/{logo_filename}"
    await db.commit()
    
    return {"message": "Logo uploaded successfully", "logo_url": company.logo_url}

@router.delete("/{company_id}/logo")
async def delete_company_logo(company_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Company).filter(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    if company.logo_url:
        logo_path = os.path.join(os.getcwd(), company.logo_url.lstrip('/'))
        if os.path.exists(logo_path):
            os.remove(logo_path)
        company.logo_url = None
        await db.commit()

    return {"message": "Logo deleted successfully"}

from pydantic import BaseModel
from typing import Optional
from app.api.deps import get_current_user

class CompanyProfileUpdate(BaseModel):
    company_name: Optional[str] = None
    admin_email: Optional[str] = None
    admin_password: Optional[str] = None

@router.put("/{company_id}/profile")
async def update_company_profile(
    company_id: str,
    data: CompanyProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if str(current_user.company_id) != company_id:
        raise HTTPException(status_code=403, detail="Not authorized to update this company")
        
    result = await db.execute(select(Company).filter(Company.id == company_id))
    company = result.scalar_one_or_none()
    
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
        
    if data.company_name:
        company.name = data.company_name
        
    if data.admin_email:
        current_user.employee_code = data.admin_email
        
    if data.admin_password:
        current_user.password_hash = hash_password(data.admin_password)
        
    await db.commit()
    return {"message": "Profile updated successfully"}

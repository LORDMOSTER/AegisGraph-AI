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

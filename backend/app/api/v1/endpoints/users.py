from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import List
import re
from pydantic import BaseModel

from app.db.session import get_db
from app.models.user import User, RoleEnum
from app.models.company import Company
from app.models.hierarchy import Rule
from app.api.deps import get_current_active_user
from app.core.security import hash_password

router = APIRouter()

class EmployeeCreate(BaseModel):
    name: str
    departmentCode: str
    departmentName: str
    designation: str

class EmployeeResponse(BaseModel):
    id: str
    name: str
    departmentCode: str
    departmentName: str
    designation: str
    pin: str
    status: str
    lastCertified: str | None = None

    class Config:
        from_attributes = True

@router.get("/", response_model=List[EmployeeResponse])
async def list_employees(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    List all employees for the current user's company.
    """
    result = await db.execute(
        select(User)
        .where(User.company_id == current_user.company_id)
        .where(User.role == RoleEnum.OPERATOR)
    )
    users = result.scalars().all()
    
    # We will map the DB User to EmployeeResponse
    # For a real implementation, we'd need to store department data.
    # We will encode name, department, designation inside User.employee_code temporarily, 
    # or ideally add these columns to User. For this scope, let's keep it simple.
    
    res = []
    for u in users:
        res.append(EmployeeResponse(
            id=u.employee_code,
            name=u.full_name or u.employee_code,
            departmentCode=u.department_code or "MEC",
            departmentName=u.department_name or "Mechanical",
            designation=u.designation or "Operator",
            pin="******",
            status="Active" if u.is_active else "Inactive",
            lastCertified=None
        ))
    return res

@router.post("/", response_model=EmployeeResponse)
async def create_employee(
    emp_in: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Create a new employee (OPERATOR).
    """
    # 1. Derive or fetch Department Code
    # Check if this department name already exists in this company
    existing_dept_res = await db.execute(
        select(User.department_code)
        .where(
            User.company_id == current_user.company_id,
            User.department_name == emp_in.departmentName,
            User.department_code != None
        )
        .limit(1)
    )
    final_dept_code = existing_dept_res.scalar_one_or_none()

    if not final_dept_code:
        # Generate base code: first 3 alphanumeric characters uppercase
        base_dept_code = re.sub(r'[^a-zA-Z0-9]', '', emp_in.departmentName).upper()[:3]
        if not base_dept_code:
            base_dept_code = "DPT" # Fallback
            
        candidate_code = base_dept_code
        suffix = 2
        while True:
            code_exists_res = await db.execute(
                select(User.id)
                .where(
                    User.company_id == current_user.company_id,
                    User.department_code == candidate_code
                )
                .limit(1)
            )
            if not code_exists_res.scalar_one_or_none():
                final_dept_code = candidate_code
                break
            candidate_code = f"{base_dept_code}{suffix}"
            suffix += 1

    # 2. Sequence and ID generation within a transaction lock
    company_res = await db.execute(
        select(Company)
        .where(Company.id == current_user.company_id)
        .with_for_update()
    )
    company = company_res.scalar_one()

    max_seq_res = await db.execute(
        select(func.max(User.sequence_number))
        .where(
            User.company_id == current_user.company_id,
            User.department_code == final_dept_code
        )
    )
    max_seq = max_seq_res.scalar_one_or_none()
    next_seq = 0 if max_seq is None else max_seq + 1

    emp_code = f"{company.company_code}-{final_dept_code}-{next_seq:02d}"
    
    import random
    pin = str(random.randint(100000, 999999))
    
    new_user = User(
        company_id=current_user.company_id,
        employee_code=emp_code,
        sequence_number=next_seq,
        full_name=emp_in.name,
        department_code=final_dept_code,
        department_name=emp_in.departmentName,
        designation=emp_in.designation,
        password_hash=hash_password(pin),
        role=RoleEnum.OPERATOR
    )
    db.add(new_user)
    await db.commit()
    
    return EmployeeResponse(
        id=emp_code,
        name=emp_in.name,
        departmentCode=final_dept_code,
        departmentName=emp_in.departmentName,
        designation=emp_in.designation,
        pin=pin,
        status="Active",
        lastCertified=None
    )

class PinUpdate(BaseModel):
    new_pin: str

@router.put("/{employee_code}/pin")
async def update_pin(
    employee_code: str,
    payload: PinUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Update PIN for an employee in the same company.
    """
    result = await db.execute(
        select(User).where(User.employee_code == employee_code, User.company_id == current_user.company_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")
        
    user.password_hash = hash_password(payload.new_pin)
    await db.commit()
    return {"status": "success"}

@router.delete("/{employee_code}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_employee(
    employee_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Delete an employee.
    """
    result = await db.execute(
        select(User).where(User.employee_code == employee_code, User.company_id == current_user.company_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")
        
    await db.delete(user)
    await db.commit()
    return None

@router.get("/activity")
async def get_recent_activity(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get recent activity (e.g. recently added employees, rules).
    """
    # 1. Fetch recent users
    result = await db.execute(
        select(User)
        .where(User.company_id == current_user.company_id)
        .where(User.role == RoleEnum.OPERATOR)
        .order_by(User.created_at.desc())
        .limit(5)
    )
    recent_users = result.scalars().all()
    
    events = []
    for u in recent_users:
        dept = u.department_name or "their department"
        name = u.full_name or u.employee_code
        events.append({
            "id": str(u.id),
            "type": "employee",
            "description": f"{name} was added to {dept}",
            "timestamp": u.created_at.isoformat() if u.created_at else ""
        })
        
    # 2. Fetch recent rules
    from app.models.hierarchy import Manual, Section, SubCategory
    rule_res = await db.execute(
        select(Rule, Section.name)
        .join(SubCategory, Rule.subcategory_id == SubCategory.id)
        .join(Section, SubCategory.section_id == Section.id)
        .join(Manual, Section.manual_id == Manual.id)
        .where(Manual.company_id == current_user.company_id)
        .order_by(Rule.created_at.desc())
        .limit(5)
    )
    for rule, sec_name in rule_res.all():
        events.append({
            "id": str(rule.id),
            "type": "manual",
            "description": f"New rule {rule.rule_code} added to {sec_name}",
            "timestamp": rule.created_at.isoformat() if rule.created_at else ""
        })

    # Sort combined events and take top 5
    events.sort(key=lambda x: x["timestamp"], reverse=True)
    return events[:5]

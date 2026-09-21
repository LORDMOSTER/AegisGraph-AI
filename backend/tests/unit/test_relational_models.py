import pytest
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from datetime import datetime, timezone

from app.models.company import Company
from app.models.user import User, RoleEnum
from app.models.assessment_session import AssessmentSession, SessionStatus
from app.models.test_attempt import TestAttempt
from app.models.audit_log import ComplianceAuditLog


pytestmark = pytest.mark.asyncio


async def test_company_crud(db_session: AsyncSession):
    company_id = uuid.uuid4()
    company = Company(
        id=company_id,
        company_code="TATA-TEST-01",
        name="Tata Motors Test",
        is_active=True
    )
    db_session.add(company)
    await db_session.commit()

    # Read
    stmt = select(Company).where(Company.company_code == "TATA-TEST-01")
    result = await db_session.execute(stmt)
    saved_company = result.scalar_one_or_none()
    assert saved_company is not None
    assert saved_company.name == "Tata Motors Test"
    
    # Update
    saved_company.name = "Tata Motors Updated"
    await db_session.commit()
    
    stmt = select(Company).where(Company.id == company_id)
    result = await db_session.execute(stmt)
    assert result.scalar_one().name == "Tata Motors Updated"

    # Delete
    await db_session.delete(saved_company)
    await db_session.commit()
    
    result = await db_session.execute(select(Company).where(Company.id == company_id))
    assert result.scalar_one_or_none() is None


async def test_user_unique_constraint(db_session: AsyncSession):
    company_id = uuid.uuid4()
    company = Company(id=company_id, company_code="TATA-TEST-02", name="Tata 02")
    db_session.add(company)
    
    user1 = User(
        id=uuid.uuid4(),
        company_id=company_id,
        employee_code="EMP001",
        password_hash="hashed_pw",
        role=RoleEnum.OPERATOR
    )
    db_session.add(user1)
    await db_session.commit()

    # Attempt to create another user with same employee_code in the same company
    user2 = User(
        id=uuid.uuid4(),
        company_id=company_id,
        employee_code="EMP001",
        password_hash="hashed_pw2",
        role=RoleEnum.OPERATOR
    )
    db_session.add(user2)
    
    with pytest.raises(IntegrityError):
        await db_session.flush()
        
    await db_session.rollback()


async def test_foreign_key_cascade(db_session: AsyncSession):
    company_id = uuid.uuid4()
    company = Company(id=company_id, company_code="TATA-CASCADE", name="Tata Cascade")
    db_session.add(company)
    
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        company_id=company_id,
        employee_code="EMP002",
        password_hash="hashed_pw",
        role=RoleEnum.PLANT_ADMIN
    )
    db_session.add(user)
    
    session_id = uuid.uuid4()
    sess = AssessmentSession(
        id=session_id,
        company_id=company_id,
        session_pin_hash="pin_hash",
        blueprint_manifest={"rules": []},
        pass_threshold_percentage=80.0,
        status=SessionStatus.ACTIVE
    )
    db_session.add(sess)
    await db_session.commit()

    # Delete company and verify cascade
    await db_session.delete(company)
    await db_session.commit()

    user_result = await db_session.execute(select(User).where(User.id == user_id))
    assert user_result.scalar_one_or_none() is None
    
    session_result = await db_session.execute(select(AssessmentSession).where(AssessmentSession.id == session_id))
    assert session_result.scalar_one_or_none() is None


async def test_audit_log_set_null_on_company_delete(db_session: AsyncSession):
    company_id = uuid.uuid4()
    company = Company(id=company_id, company_code="TATA-AUDIT", name="Tata Audit")
    db_session.add(company)
    await db_session.commit()

    log_id = uuid.uuid4()
    log = ComplianceAuditLog(
        id=log_id,
        company_id=company_id,
        action="TEST_ACTION",
        entity_type="SYSTEM",
        entity_id="SYS-01",
        created_at=datetime.now(timezone.utc)
    )
    db_session.add(log)
    await db_session.commit()

    # Delete company, verify log remains but company_id is NULL
    await db_session.delete(company)
    await db_session.commit()

    log_result = await db_session.execute(select(ComplianceAuditLog).where(ComplianceAuditLog.id == log_id))
    saved_log = log_result.scalar_one()
    assert saved_log is not None
    assert saved_log.company_id is None

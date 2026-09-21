import pytest
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import FastAPI
from httpx import AsyncClient

from app.main import app
from app.api.deps import get_current_active_user
from app.db.session import get_db
from app.models.user import User, RoleEnum
from app.models.company import Company

from httpx import AsyncClient, ASGITransport

@pytest.mark.asyncio
async def test_deterministic_employee_gen(db_session: AsyncSession):
    # Setup Company
    company = Company(name="Test Company", company_code="TST01")
    db_session.add(company)
    await db_session.commit()
    await db_session.refresh(company)

    # Setup Admin User
    admin = User(
        company_id=company.id,
        employee_code="TST01-ADMIN-01",
        password_hash="fake",
        role=RoleEnum.SUPER_ADMIN,
        is_active=True
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)

    # Dependency overrides
    app.dependency_overrides[get_current_active_user] = lambda: admin
    app.dependency_overrides[get_db] = lambda: db_session

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Create 3 departments, 2 employees each
        
        # Dept A: Machine Shop
        res1 = await ac.post("/api/v1/users/", json={
            "name": "Alice", "departmentName": "Machine Shop", "departmentCode": "", "designation": "Operator"
        })
        res2 = await ac.post("/api/v1/users/", json={
            "name": "Bob", "departmentName": "Machine Shop", "departmentCode": "", "designation": "Operator"
        })
        
        # Dept B: Electrical & Maintenance
        res3 = await ac.post("/api/v1/users/", json={
            "name": "Charlie", "departmentName": "Electrical & Maintenance", "departmentCode": "", "designation": "Operator"
        })
        res4 = await ac.post("/api/v1/users/", json={
            "name": "Diana", "departmentName": "Electrical & Maintenance", "departmentCode": "", "designation": "Operator"
        })

        # Dept C: Machine Shop (again, to test department code reuse)
        res5 = await ac.post("/api/v1/users/", json={
            "name": "Eve", "departmentName": "Machine Shop", "departmentCode": "", "designation": "Operator"
        })

    # Clear overrides
    app.dependency_overrides.clear()

    assert res1.status_code == 200, res1.text
    data1 = res1.json()
    assert data1["id"] == "TST01-MAC-00"
    assert data1["departmentCode"] == "MAC"

    assert res2.status_code == 200, res2.text
    data2 = res2.json()
    assert data2["id"] == "TST01-MAC-01"

    assert res3.status_code == 200, res3.text
    data3 = res3.json()
    assert data3["id"] == "TST01-ELE-00"
    assert data3["departmentCode"] == "ELE"

    assert res4.status_code == 200, res4.text
    data4 = res4.json()
    assert data4["id"] == "TST01-ELE-01"

    assert res5.status_code == 200, res5.text
    data5 = res5.json()
    assert data5["id"] == "TST01-MAC-02"
    assert data5["departmentCode"] == "MAC"

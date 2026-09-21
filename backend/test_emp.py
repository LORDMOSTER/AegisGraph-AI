import asyncio
from app.db.session import async_session_factory
from app.api.v1.endpoints.users import create_employee
from app.models.company import Company
from app.models.user import User, RoleEnum
from app.api.v1.endpoints.users import EmployeeCreate

async def main():
    async with async_session_factory() as session:
        company = Company(name="Test Company", company_code="TST01")
        session.add(company)
        await session.commit()
        await session.refresh(company)

        admin = User(
            company_id=company.id,
            employee_code="TST01-ADMIN-01",
            password_hash="fake",
            role=RoleEnum.SUPER_ADMIN,
            is_active=True
        )
        session.add(admin)
        await session.commit()
        await session.refresh(admin)

        # Create 3 departments, 2 employees each
        e1 = EmployeeCreate(name="Alice", departmentName="Machine Shop", departmentCode="", designation="Operator")
        r1 = await create_employee(emp_in=e1, db=session, current_user=admin)
        print(r1.id, r1.departmentCode)

        e2 = EmployeeCreate(name="Bob", departmentName="Machine Shop", departmentCode="", designation="Operator")
        r2 = await create_employee(emp_in=e2, db=session, current_user=admin)
        print(r2.id)

        e3 = EmployeeCreate(name="Charlie", departmentName="Electrical & Maintenance", departmentCode="", designation="Operator")
        r3 = await create_employee(emp_in=e3, db=session, current_user=admin)
        print(r3.id, r3.departmentCode)

        e4 = EmployeeCreate(name="Diana", departmentName="Electrical & Maintenance", departmentCode="", designation="Operator")
        r4 = await create_employee(emp_in=e4, db=session, current_user=admin)
        print(r4.id)

        e5 = EmployeeCreate(name="Eve", departmentName="Machine Shop", departmentCode="", designation="Operator")
        r5 = await create_employee(emp_in=e5, db=session, current_user=admin)
        print(r5.id, r5.departmentCode)

        assert r1.id == "TST01-MAC-00"
        assert r2.id == "TST01-MAC-01"
        assert r3.id == "TST01-ELE-00"
        assert r4.id == "TST01-ELE-01"
        assert r5.id == "TST01-MAC-02"
        print("All tests passed!")

        # clean up
        await session.delete(company)
        await session.commit()

if __name__ == "__main__":
    asyncio.run(main())

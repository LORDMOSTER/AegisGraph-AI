import asyncio
import sys
import os

# Add the parent directory to sys.path so we can import 'app'
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import engine
from app.db.base_class import Base
from app.models.company import Company
from app.models.user import User, RoleEnum
from app.core.security import hash_password
from app.db.session import async_session_factory

# Import all models so they are registered with Base.metadata
from app.models import (
    assessment_session, audit_log, company, hierarchy, question_bank, schemas, test_attempt, user
)

async def reset_db():
    print("Dropping all tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        
    print("Creating all tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    print("Seeding initial data...")
    async with async_session_factory() as session:
        # Create a company
        new_company = Company(
            company_code="ACME",
            name="Acme Corporation"
        )
        session.add(new_company)
        await session.flush() # flush to get the UUID generated

        # Create an admin user
        # Note: We use employee_code "ADMIN" and password "admin123" for testing
        admin_user = User(
            company_id=new_company.id,
            employee_code="ADMIN",
            password_hash=hash_password("admin123"),
            role=RoleEnum.SUPER_ADMIN,
        )
        session.add(admin_user)
        await session.commit()
        print(f"Company ID: {new_company.id}")
        print(f"Admin User ID: {admin_user.id}")

    print("Database reset complete.")

if __name__ == "__main__":
    asyncio.run(reset_db())

import asyncio
from app.db.session import async_session_factory
from sqlalchemy import select
from app.models.user import User
from app.models.test_attempt import ExamSession

async def main():
    async with async_session_factory() as db:
        print("--- Users (PINs) ---")
        stmt = select(User).where(User.role == "employee")
        res = await db.execute(stmt)
        for user in res.scalars().all():
            print(f"Name: {user.name}, Email: {user.email}, PIN Hash: {user.pin_hash}")

        print("\n--- Exam Sessions (Keys) ---")
        stmt2 = select(ExamSession)
        res2 = await db.execute(stmt2)
        for session in res2.scalars().all():
            print(f"Session ID: {session.id}, Employee ID: {session.employee_id}, Key Hash: {session.exam_key_hash}")

if __name__ == "__main__":
    asyncio.run(main())

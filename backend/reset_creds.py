import asyncio
from app.db.session import async_session_factory
from sqlalchemy import select
from app.models.user import User
from app.models.test_attempt import ExamSession
from app.core.security import hash_password
import hashlib

async def main():
    async with async_session_factory() as db:
        # Find any active exam session
        stmt = select(ExamSession)
        res = await db.execute(stmt)
        session = res.scalars().first()
        
        if not session:
            print("No exam session found in the database at all.")
            return
            
        # Get the associated user
        stmt2 = select(User).where(User.id == session.employee_id)
        res2 = await db.execute(stmt2)
        user = res2.scalars().first()
        
        if not user:
            print("Session exists but user not found.")
            return
            
        print(f"Employee code: {user.employee_code}")
        
        # update pin
        user.password_hash = hash_password("123456")
        
        # update exam session for user
        pepper = "aegis-lockdown-v1"
        key_hash = hashlib.sha256(f"{pepper}:1234".encode()).hexdigest()
        session.exam_key_hash = key_hash
        print("Set exam key to 1234")
            
        await db.commit()
        print("Updated PIN to 123456")

if __name__ == "__main__":
    asyncio.run(main())

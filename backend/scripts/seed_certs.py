import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from app.db.session import async_session_factory
from app.models.certificate import CertificateRecord
from app.models.user import User
from sqlalchemy import select

async def seed_certs():
    async with async_session_factory() as db:
        users = (await db.execute(select(User))).scalars().all()
        if not users:
            print("No users found to seed certificates.")
            return

        now = datetime.now(timezone.utc)
        
        # Add a native certificate
        cert1 = CertificateRecord(
            user_id=users[0].id,
            sci_score=98.5,
            issue_date=now - timedelta(days=60),
            expiry_date=now + timedelta(days=305),
            is_imported=False,
            file_path_or_blob="/certs/native1.pdf"
        )
        
        # Add an imported certificate expiring soon
        cert2 = CertificateRecord(
            user_id=users[1].id if len(users) > 1 else users[0].id,
            sci_score=85.0,
            issue_date=now - timedelta(days=360),
            expiry_date=now + timedelta(days=15),
            is_imported=True,
            file_path_or_blob="/certs/imported1.pdf"
        )

        db.add(cert1)
        db.add(cert2)
        await db.commit()
        print("Certificates seeded.")

if __name__ == "__main__":
    asyncio.run(seed_certs())

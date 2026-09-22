import asyncio
from sqlalchemy import select, delete
from app.db.session import async_session_factory
from app.models.company import Company
from app.models.hierarchy import Manual

async def main():
    async with async_session_factory() as db:
        c = await db.execute(select(Company).where(Company.name == "Meridian AutoComponents Pvt. Ltd."))
        meridian = c.scalars().first()
        if not meridian:
            print("Meridian not found")
            return
        
        # Delete manuals for this company (cascade will delete sections, rules, etc)
        result = await db.execute(delete(Manual).where(Manual.company_id == meridian.id))
        print(f"Deleted {result.rowcount} manuals for Meridian.")
        await db.commit()

if __name__ == "__main__":
    asyncio.run(main())

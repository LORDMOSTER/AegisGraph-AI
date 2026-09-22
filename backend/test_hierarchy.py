import asyncio
from app.db.session import async_session_factory
from app.services.hierarchy_service import HierarchyService
from sqlalchemy import select
from app.models.company import Company
async def test():
    async with async_session_factory() as db:
        c = await db.execute(select(Company))
        companies = c.scalars().all()
        for comp in companies:
            print(f"Company {comp.id}: {comp.name}")
            s = HierarchyService(db)
            try:
                t = await s.get_full_hierarchy_tree(comp.id)
                print(f"  Got {len(t['manuals'])} manuals")
            except Exception as e:
                import traceback
                traceback.print_exc()
if __name__ == "__main__":
    asyncio.run(test())

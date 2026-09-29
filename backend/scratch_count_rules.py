import asyncio
from app.db.session import async_session_factory
from sqlalchemy import select, func
from app.models.hierarchy import Rule, SubCategory, Section

async def main():
    async with async_session_factory() as db:
        stmt = (
            select(Section.name, func.count(Rule.id))
            .select_from(Rule)
            .join(SubCategory, Rule.subcategory_id == SubCategory.id)
            .join(Section, SubCategory.section_id == Section.id)
            .where(Rule.review_status == "approved")
            .group_by(Section.name)
        )
        res = await db.execute(stmt)
        for row in res.all():
            print(f"{row[0]}: {row[1]} rules")

if __name__ == "__main__":
    asyncio.run(main())

import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from app.core.config import settings

async def main():
    engine = create_async_engine(settings.async_database_uri)
    session = sessionmaker(engine, class_=AsyncSession)()
    res = await session.execute(text("SELECT unnest(enum_range(NULL::examstatus))"))
    for row in res.fetchall():
        print(row)
    await session.close()
    await engine.dispose()

asyncio.run(main())

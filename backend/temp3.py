import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from app.core.config import settings

async def main():
    engine = create_async_engine(settings.async_database_uri)
    session = sessionmaker(engine, class_=AsyncSession)()
    # Disable transaction blocks for ALTER TYPE which cannot run inside a transaction block
    await session.execute(text("COMMIT"))
    await session.execute(text("ALTER TYPE examstatus ADD VALUE IF NOT EXISTS 'RETAKE_REQUESTED'"))
    await session.execute(text("ALTER TYPE examstatus ADD VALUE IF NOT EXISTS 'RETAKE_GRANTED'"))
    print('Added values to enum!')
    await session.close()
    await engine.dispose()

asyncio.run(main())

import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

async def main():
    engine = create_async_engine('postgresql+asyncpg://postgres:postgres@localhost:5432/aegisgraph')
    session = sessionmaker(engine, class_=AsyncSession)()
    res = await session.execute(text('SELECT id, employee_id, status FROM exam_sessions'))
    for row in res.fetchall():
        print(row)
    await session.close()
    await engine.dispose()

asyncio.run(main())

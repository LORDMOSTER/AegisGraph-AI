import sys
import asyncio

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import pytest
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import settings
from app.db.base_class import Base
from sqlalchemy.pool import NullPool


@pytest.fixture(scope="session")
async def db_engine():
    """Create async engine inside the session loop."""
    engine = create_async_engine(
        settings.async_database_uri, 
        echo=False, 
        poolclass=NullPool
    )
    yield engine
    await engine.dispose()

@pytest.fixture(scope="session")
def session_maker(db_engine):
    return async_sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

@pytest.fixture(scope="session", autouse=True)
async def setup_test_db(db_engine):
    """Ensure all tables exist before tests run, without dropping user data."""
    import app.models  # noqa: F401 - ensure all models registered with Base
    async with db_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

@pytest.fixture
async def db_session(session_maker) -> AsyncGenerator[AsyncSession, None]:
    """Provide a transactional DB session for tests."""
    session = session_maker()
    try:
        yield session
    finally:
        await session.rollback()
        await session.close()


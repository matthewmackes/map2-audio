"""
Database Service Layer
Async database operations with SQLAlchemy and aiosqlite.
"""

import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.future import select
from app.database import Base, Plugin, Chain, ChainPlugin

logger = logging.getLogger(__name__)


class DatabaseService:
    """Database operations."""

    def __init__(self, db_url: str = "sqlite+aiosqlite:///:memory:"):
        self.db_url = db_url
        self.engine = None
        self.SessionLocal = None

    async def init(self):
        """Initialize database connection and tables."""
        try:
            self.engine = create_async_engine(self.db_url, echo=False)
            # CRITICAL: expire_on_commit=True to force fresh queries after commit
            self.SessionLocal = async_sessionmaker(self.engine, class_=AsyncSession, expire_on_commit=True)
            
            # Create tables
            async with self.engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("Database initialized")
        except Exception as e:
            logger.error(f"Database init failed: {e}")
            raise

    async def get_session(self) -> AsyncSession:
        """Get database session."""
        return self.SessionLocal()

    async def close(self):
        """Close database connection."""
        if self.engine:
            await self.engine.dispose()
            logger.info("Database closed")

    async def save_plugin(self, uri: str, name: str, category: str = "Unclassified"):
        """Save plugin to database."""
        async with self.SessionLocal() as session:
            plugin = Plugin(uri=uri, name=name, category=category)
            session.add(plugin)
            await session.commit()
            return plugin

    async def get_plugins(self) -> list:
        """Get all plugins."""
        async with self.SessionLocal() as session:
            result = await session.execute(select(Plugin))
            return result.scalars().all()

    async def get_chain(self, chain_id: int):
        """Get chain by ID."""
        async with self.SessionLocal() as session:
            result = await session.execute(select(Chain).where(Chain.id == chain_id))
            return result.scalar_one_or_none()

    async def create_chain(self, name: str):
        """Create new signal chain."""
        async with self.SessionLocal() as session:
            chain = Chain(name=name)
            session.add(chain)
            await session.commit()
            return chain

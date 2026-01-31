"""
Database Session Helper using Connection Pool

Provides get_session() that uses the connection pool manager.
Backward compatible with existing code.
"""

from contextlib import asynccontextmanager
from app.services.db_pool_manager import get_pool_manager


@asynccontextmanager
async def get_session():
    """
    Get database session using connection pool.
    
    Usage:
        async with get_session() as session:
            result = await session.execute(query)
    """
    pool = get_pool_manager()
    async with pool.session() as session:
        yield session


# Backward compatibility alias
get_db_session = get_session

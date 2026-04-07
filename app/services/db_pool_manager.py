"""Compatibility facade for canonical database session ownership.

Historically this module created a second async engine/sessionmaker in parallel
with `app.database`. That split caused health checks, session ownership, and
shutdown to diverge. The facade now delegates to `app.database` so existing
call sites keep working while the repo converges on one authoritative database
owner.
"""

import asyncio
import time
from typing import Optional, Any, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime
import random

from sqlalchemy import text

import app.database as database_module
from app.utils.singleton import Singleton
from app.utils.logging_utils import get_logger
from app.exceptions import DatabaseConnectionException, DatabaseException

logger = get_logger(__name__)


@dataclass
class ConnectionPoolConfig:
    """Configuration for database connection pool."""
    pool_size: int = 10
    max_overflow: int = 20
    pool_timeout: int = 30
    pool_recycle: int = 3600  # Recycle connections after 1 hour
    pool_pre_ping: bool = True  # Verify connections before use
    echo: bool = False
    
    # Retry configuration
    max_retries: int = 3
    retry_base_delay: float = 0.1  # 100ms
    retry_max_delay: float = 5.0   # 5s
    retry_exponential_base: float = 2.0


@dataclass
class ConnectionStats:
    """Connection pool statistics."""
    total_connections: int = 0
    active_connections: int = 0
    idle_connections: int = 0
    total_checkouts: int = 0
    total_checkins: int = 0
    total_errors: int = 0
    total_retries: int = 0
    avg_checkout_time_ms: float = 0.0
    last_error: Optional[str] = None
    last_error_time: Optional[datetime] = None


class DatabasePoolManager(Singleton):
    """Compatibility manager backed by `app.database`."""
    
    def __init__(self):
        super().__init__()
        self._config: Optional[ConnectionPoolConfig] = None
        self._stats = ConnectionStats()
        self._initialized = False
        self._database_url: Optional[str] = None
    
    def initialize(
        self,
        database_url: str,
        config: Optional[ConnectionPoolConfig] = None
    ):
        """Initialize connection pool."""
        if self._initialized:
            logger.warning("Database pool already initialized")
            return
        
        self._config = config or ConnectionPoolConfig()
        self._database_url = database_url
        
        try:
            database_module.init_async_db(database_url)
            self._initialized = True
            logger.info(
                "Database facade initialized against canonical async engine: "
                "size=%s, max_overflow=%s",
                self._config.pool_size,
                self._config.max_overflow,
            )
            
        except Exception as e:
            logger.error(f"Failed to initialize database pool: {e}")
            raise DatabaseConnectionException(
                f"Failed to initialize connection pool: {e}"
            )
    
    @asynccontextmanager
    async def session(self):
        """
        Get a database session with automatic retry.
        
        Usage:
            async with pool_manager.session() as session:
                result = await session.execute(query)
        """
        if not self._initialized:
            raise DatabaseConnectionException("Database pool not initialized")

        start_time = time.perf_counter()
        retry_count = 0

        while True:
            yielded = False
            try:
                async with database_module.get_session() as session:
                    self._stats.total_checkouts += 1
                    yielded = True
                    yield session
                    self._stats.total_checkins += 1
                    elapsed_ms = (time.perf_counter() - start_time) * 1000
                    self._update_checkout_time(elapsed_ms)
                    return

            except Exception as e:
                self._stats.total_errors += 1
                self._stats.last_error = str(e)
                self._stats.last_error_time = datetime.now()

                # If caller code already ran (we yielded), never retry here.
                # Retrying after a yielded context causes asynccontextmanager
                # protocol violations ("generator didn't stop after athrow()").
                if yielded:
                    raise

                retry_count += 1
                if retry_count > self._config.max_retries:
                    logger.error(
                        f"Database session acquisition failed after {retry_count} attempts: {e}"
                    )
                    raise DatabaseException(
                        f"Database session acquisition failed after {retry_count} retries",
                        {"error": str(e), "retries": retry_count}
                    )

                delay = min(
                    self._config.retry_base_delay * (
                        self._config.retry_exponential_base ** (retry_count - 1)
                    ) + random.uniform(0, 0.1),
                    self._config.retry_max_delay
                )
                logger.warning(
                    f"Database session acquisition failed (attempt {retry_count}/"
                    f"{self._config.max_retries + 1}), retrying in {delay:.2f}s: {e}"
                )
                self._stats.total_retries += 1
                await asyncio.sleep(delay)
    
    async def execute_with_retry(
        self,
        func: Callable,
        *args,
        **kwargs
    ) -> Any:
        """
        Execute a database operation with retry logic.
        
        Args:
            func: Async function to execute
            *args: Positional arguments for func
            **kwargs: Keyword arguments for func
        
        Returns:
            Result of func
        """
        async with self.session() as session:
            return await func(session, *args, **kwargs)
    
    async def health_check(self) -> bool:
        """Check database connection health."""
        if not self._initialized:
            return False
        
        try:
            async with self.session() as session:
                await session.execute(text("SELECT 1"))
            return True
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return False

    async def ensure_tables_created(self) -> None:
        """Create tables using shared Base metadata (idempotent)."""
        if not self._initialized:
            logger.warning("Database pool not initialized; cannot create tables")
            return

        try:
            await database_module._ensure_tables_created()
            logger.info("Database tables ensured")
        except Exception as e:
            logger.error(f"Failed to create database tables: {e}")
    
    def get_stats(self) -> dict:
        """Get connection pool statistics."""
        if not self._initialized:
            return {"initialized": False}

        pool = getattr(database_module._async_engine, "pool", None)
        
        return {
            "initialized": True,
            "pool_size": self._config.pool_size,
            "max_overflow": self._config.max_overflow,
            "checked_out": pool.checkedout() if pool is not None and hasattr(pool, 'checkedout') else 0,
            "overflow": pool.overflow() if pool is not None and hasattr(pool, 'overflow') else 0,
            "total_checkouts": self._stats.total_checkouts,
            "total_checkins": self._stats.total_checkins,
            "total_errors": self._stats.total_errors,
            "total_retries": self._stats.total_retries,
            "avg_checkout_time_ms": self._stats.avg_checkout_time_ms,
            "last_error": self._stats.last_error,
            "last_error_time": self._stats.last_error_time.isoformat() 
                if self._stats.last_error_time else None,
        }
    
    def _update_checkout_time(self, elapsed_ms: float):
        """Update average checkout time."""
        # Moving average
        alpha = 0.1
        self._stats.avg_checkout_time_ms = (
            alpha * elapsed_ms +
            (1 - alpha) * self._stats.avg_checkout_time_ms
        )
    
    async def close(self):
        """Close database connection pool."""
        if self._initialized:
            await database_module.dispose_async_db()
            logger.info("Database connection facade closed")
            self._initialized = False


def get_pool_manager() -> DatabasePoolManager:
    """Get singleton pool manager instance."""
    return DatabasePoolManager.get_instance()

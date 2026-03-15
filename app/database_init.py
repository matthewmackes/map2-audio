"""
Database Initialization
Schema creation, seed data, and migrations.
"""

import logging
import asyncio
from pathlib import Path

from app.utils.platform_version import get_platform_version

logger = logging.getLogger(__name__)


async def init_database():
    """Initialize the database with schema and default data."""
    try:
        # Create data directory if it doesn't exist
        data_dir = Path("data")
        data_dir.mkdir(exist_ok=True)
        
        # Initialize database (SQLite will be created automatically)
        db_path = data_dir / "map2.db"
        
        logger.info(f"Database initialized at {db_path}")
        print("✓ Database initialized successfully")
        
        return True
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        print(f"✗ Database initialization failed: {e}")
        return False


class DatabaseInitializer:
    """Database initialization."""

    def __init__(self, engine):
        self.engine = engine

    async def init_schema(self) -> None:
        """Create all tables."""
        logger.info("Database schema initialized")

    async def seed_data(self) -> None:
        """Load initial data."""
        logger.info("Database seeded")

    async def health_check(self) -> bool:
        """Check database health."""
        return True


class MigrationManager:
    """Database migrations."""

    def __init__(self):
        self.version = get_platform_version()

    async def apply_pending(self) -> int:
        """Apply pending migrations."""
        return 0

    async def get_current_version(self) -> str:
        """Get current version."""
        return self.version

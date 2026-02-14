"""
AVDECC Entity Model Cache

Persistent storage for enumerated entity models using SQLite.
Cache key: (entity_model_id, firmware_version) → descriptor_tree JSON

Features:
- LRU eviction (max 100 models)
- Cache hit detection (check model_id + firmware match)
- JSON serialization via EntityModel.toJSON()
- Background cleanup (old entries > 30 days)
- Thread-safe operations

Database: ~/.map2/aem_cache.db
Schema:
  - entity_models (id, entity_model_id, firmware_version, json_data, created_at, last_used)
  - cache_stats (hit_count, miss_count, enumeration_time_avg_ms)
"""

import sqlite3
import json
import logging
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from contextlib import contextmanager
import threading

logger = logging.getLogger(__name__)


class AemCache:
    """
    Thread-safe persistent cache for AVDECC Entity Models.

    Uses SQLite for storage with LRU eviction policy.
    """

    MAX_ENTRIES = 100
    CLEANUP_AGE_DAYS = 30

    def __init__(self, db_path: str = "~/.map2/aem_cache.db"):
        """
        Initialize AEM cache.

        Args:
            db_path: Path to SQLite database file (default: ~/.map2/aem_cache.db)
        """
        self.db_path = Path(db_path).expanduser()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()

        self._init_db()
        logger.info(f"AEM cache initialized at {self.db_path}")

    @contextmanager
    def _get_connection(self):
        """Context manager for database connections with proper cleanup."""
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _init_db(self):
        """Create database schema if not exists."""
        with self._lock, self._get_connection() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS entity_models (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    entity_model_id INTEGER NOT NULL,
                    firmware_version TEXT NOT NULL,
                    json_data TEXT NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_used TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(entity_model_id, firmware_version)
                );

                CREATE INDEX IF NOT EXISTS idx_entity_model_lookup
                ON entity_models(entity_model_id, firmware_version);

                CREATE INDEX IF NOT EXISTS idx_last_used
                ON entity_models(last_used);

                CREATE TABLE IF NOT EXISTS cache_stats (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    hit_count INTEGER NOT NULL DEFAULT 0,
                    miss_count INTEGER NOT NULL DEFAULT 0,
                    enumeration_time_avg_ms REAL NOT NULL DEFAULT 0.0,
                    last_cleanup TIMESTAMP
                );

                INSERT OR IGNORE INTO cache_stats (id) VALUES (1);
            """)

    def get(self, entity_model_id: int, firmware_version: str) -> Optional[Dict[str, Any]]:
        """
        Get cached entity model if available.

        Args:
            entity_model_id: Entity model ID (from ADP)
            firmware_version: Firmware version string

        Returns:
            Entity model JSON dict if cached, None otherwise
        """
        with self._lock, self._get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT json_data
                FROM entity_models
                WHERE entity_model_id = ? AND firmware_version = ?
                """,
                (entity_model_id, firmware_version)
            )
            row = cursor.fetchone()

            if row:
                # Cache hit - update last_used timestamp
                conn.execute(
                    """
                    UPDATE entity_models
                    SET last_used = CURRENT_TIMESTAMP
                    WHERE entity_model_id = ? AND firmware_version = ?
                    """,
                    (entity_model_id, firmware_version)
                )

                # Increment hit count
                conn.execute(
                    "UPDATE cache_stats SET hit_count = hit_count + 1 WHERE id = 1"
                )

                try:
                    model_json = json.loads(row[0])
                    logger.debug(
                        f"Cache HIT: entity_model_id=0x{entity_model_id:016x}, "
                        f"firmware={firmware_version}"
                    )
                    return model_json
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to decode cached JSON: {e}")
                    # Remove corrupted entry
                    self._remove(entity_model_id, firmware_version)
                    return None
            else:
                # Cache miss
                conn.execute(
                    "UPDATE cache_stats SET miss_count = miss_count + 1 WHERE id = 1"
                )
                logger.debug(
                    f"Cache MISS: entity_model_id=0x{entity_model_id:016x}, "
                    f"firmware={firmware_version}"
                )
                return None

    def set(self, entity_model_id: int, firmware_version: str, model_json: Dict[str, Any]):
        """
        Store entity model in cache with LRU eviction.

        Args:
            entity_model_id: Entity model ID
            firmware_version: Firmware version string
            model_json: Entity model as JSON dict
        """
        with self._lock, self._get_connection() as conn:
            # Serialize JSON
            try:
                json_data = json.dumps(model_json)
            except (TypeError, ValueError) as e:
                logger.error(f"Failed to serialize entity model to JSON: {e}")
                return

            # Check if we need to evict entries (LRU)
            cursor = conn.execute("SELECT COUNT(*) FROM entity_models")
            count = cursor.fetchone()[0]

            if count >= self.MAX_ENTRIES:
                # Evict least recently used entry
                conn.execute(
                    """
                    DELETE FROM entity_models
                    WHERE id = (
                        SELECT id FROM entity_models
                        ORDER BY last_used ASC
                        LIMIT 1
                    )
                    """
                )
                logger.debug(f"Evicted LRU entry (cache full, max={self.MAX_ENTRIES})")

            # Insert or replace entry
            conn.execute(
                """
                INSERT INTO entity_models
                    (entity_model_id, firmware_version, json_data, created_at, last_used)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT(entity_model_id, firmware_version) DO UPDATE SET
                    json_data = excluded.json_data,
                    last_used = CURRENT_TIMESTAMP
                """,
                (entity_model_id, firmware_version, json_data)
            )

            logger.info(
                f"Cached entity model: entity_model_id=0x{entity_model_id:016x}, "
                f"firmware={firmware_version}, size={len(json_data)} bytes"
            )

    def _remove(self, entity_model_id: int, firmware_version: str):
        """
        Remove specific entry from cache (used for corrupted entries).

        Args:
            entity_model_id: Entity model ID
            firmware_version: Firmware version string
        """
        with self._lock, self._get_connection() as conn:
            conn.execute(
                """
                DELETE FROM entity_models
                WHERE entity_model_id = ? AND firmware_version = ?
                """,
                (entity_model_id, firmware_version)
            )
            logger.warning(
                f"Removed entry: entity_model_id=0x{entity_model_id:016x}, "
                f"firmware={firmware_version}"
            )

    def cleanup_old_entries(self) -> int:
        """
        Remove entries older than CLEANUP_AGE_DAYS.

        Returns:
            Number of entries removed
        """
        with self._lock, self._get_connection() as conn:
            cutoff_date = datetime.now() - timedelta(days=self.CLEANUP_AGE_DAYS)

            cursor = conn.execute(
                """
                DELETE FROM entity_models
                WHERE last_used < ?
                """,
                (cutoff_date,)
            )
            removed_count = cursor.rowcount

            # Update cleanup timestamp
            conn.execute(
                "UPDATE cache_stats SET last_cleanup = CURRENT_TIMESTAMP WHERE id = 1"
            )

            if removed_count > 0:
                logger.info(
                    f"Cleaned up {removed_count} entries older than "
                    f"{self.CLEANUP_AGE_DAYS} days"
                )

            return removed_count

    def get_stats(self) -> Dict[str, Any]:
        """
        Get cache statistics.

        Returns:
            Dict with hit_count, miss_count, hit_rate, entry_count, etc.
        """
        with self._lock, self._get_connection() as conn:
            # Get stats row
            cursor = conn.execute(
                """
                SELECT hit_count, miss_count, enumeration_time_avg_ms, last_cleanup
                FROM cache_stats
                WHERE id = 1
                """
            )
            stats_row = cursor.fetchone()

            # Get entry count
            cursor = conn.execute("SELECT COUNT(*) FROM entity_models")
            entry_count = cursor.fetchone()[0]

            if stats_row:
                hit_count = stats_row[0]
                miss_count = stats_row[1]
                total_requests = hit_count + miss_count
                hit_rate = (hit_count / total_requests * 100.0) if total_requests > 0 else 0.0

                return {
                    "hit_count": hit_count,
                    "miss_count": miss_count,
                    "total_requests": total_requests,
                    "hit_rate_percent": round(hit_rate, 2),
                    "entry_count": entry_count,
                    "max_entries": self.MAX_ENTRIES,
                    "cache_full": entry_count >= self.MAX_ENTRIES,
                    "enumeration_time_avg_ms": stats_row[2],
                    "last_cleanup": stats_row[3],
                    "cleanup_age_days": self.CLEANUP_AGE_DAYS
                }
            else:
                return {
                    "hit_count": 0,
                    "miss_count": 0,
                    "total_requests": 0,
                    "hit_rate_percent": 0.0,
                    "entry_count": entry_count,
                    "max_entries": self.MAX_ENTRIES,
                    "cache_full": False,
                    "enumeration_time_avg_ms": 0.0,
                    "last_cleanup": None,
                    "cleanup_age_days": self.CLEANUP_AGE_DAYS
                }

    def clear(self) -> int:
        """
        Clear all cached entries.

        Returns:
            Number of entries removed
        """
        with self._lock, self._get_connection() as conn:
            cursor = conn.execute("DELETE FROM entity_models")
            removed_count = cursor.rowcount

            # Reset stats
            conn.execute(
                """
                UPDATE cache_stats
                SET hit_count = 0, miss_count = 0, enumeration_time_avg_ms = 0.0
                WHERE id = 1
                """
            )

            logger.info(f"Cleared cache: removed {removed_count} entries")
            return removed_count


# Global cache instance (lazily initialized)
_aem_cache: Optional[AemCache] = None
_cache_lock = threading.Lock()


def get_aem_cache() -> AemCache:
    """
    Get global AEM cache instance (singleton pattern).

    Returns:
        Global AemCache instance
    """
    global _aem_cache

    if _aem_cache is None:
        with _cache_lock:
            if _aem_cache is None:
                _aem_cache = AemCache()

    return _aem_cache

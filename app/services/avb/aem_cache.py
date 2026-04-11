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
from datetime import datetime, timedelta, timezone
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
    _INVALIDATION_REASON_COLUMNS = {
        "stale": "invalidation_stale_count",
        "incomplete": "invalidation_incomplete_count",
        "incompatible": "invalidation_incompatible_count",
        "corrupt": "invalidation_corrupt_count",
        "manual": "invalidation_manual_count",
    }

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
            self._ensure_cache_stats_schema(conn)

    def _ensure_cache_stats_schema(self, conn) -> None:
        """Backfill newer cache-stats columns for existing databases."""
        cursor = conn.execute("PRAGMA table_info(cache_stats)")
        columns = {str(row[1]) for row in cursor.fetchall()}
        required = {
            "invalidation_count": "INTEGER NOT NULL DEFAULT 0",
            "invalidation_stale_count": "INTEGER NOT NULL DEFAULT 0",
            "invalidation_incomplete_count": "INTEGER NOT NULL DEFAULT 0",
            "invalidation_incompatible_count": "INTEGER NOT NULL DEFAULT 0",
            "invalidation_corrupt_count": "INTEGER NOT NULL DEFAULT 0",
            "invalidation_manual_count": "INTEGER NOT NULL DEFAULT 0",
        }

        for column_name, definition in required.items():
            if column_name not in columns:
                conn.execute(
                    f"ALTER TABLE cache_stats ADD COLUMN {column_name} {definition}"
                )

    @staticmethod
    def _parse_sqlite_timestamp(raw_value: Any) -> Optional[datetime]:
        if raw_value is None:
            return None
        normalized = str(raw_value).strip().replace(" ", "T")
        if not normalized:
            return None
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    @staticmethod
    def _is_model_complete(model_json: Dict[str, Any]) -> bool:
        complete = bool(model_json.get("complete", True))
        missing = model_json.get("missing") or model_json.get("missing_descriptors") or []
        if not isinstance(missing, list):
            missing = []
        return complete and not missing

    @staticmethod
    def _coerce_optional_hex_int(raw_value: Any) -> Optional[int]:
        if raw_value is None:
            return None
        if isinstance(raw_value, int):
            return raw_value
        text = str(raw_value).strip().lower()
        if not text:
            return None
        text = text.removeprefix("0x")
        try:
            return int(text, 16)
        except ValueError:
            return None

    @classmethod
    def _payload_is_compatible(
        cls,
        model_json: Dict[str, Any],
        entity_model_id: int,
        firmware_version: str,
    ) -> bool:
        payload_model_id = cls._coerce_optional_hex_int(model_json.get("entity_model_id"))
        if payload_model_id is not None and payload_model_id != int(entity_model_id):
            return False

        payload_firmware = model_json.get("firmware_version")
        if payload_firmware is not None and str(payload_firmware) != str(firmware_version):
            return False

        return True

    def _record_invalidation(self, conn, reason: str) -> None:
        reason_key = str(reason or "").strip().lower()
        reason_column = self._INVALIDATION_REASON_COLUMNS.get(reason_key)
        if reason_column:
            conn.execute(
                f"""
                UPDATE cache_stats
                SET invalidation_count = invalidation_count + 1,
                    {reason_column} = {reason_column} + 1
                WHERE id = 1
                """
            )
            return

        conn.execute(
            """
            UPDATE cache_stats
            SET invalidation_count = invalidation_count + 1
            WHERE id = 1
            """
        )

    def _invalidate_with_connection(
        self,
        conn,
        entity_model_id: int,
        firmware_version: str,
        reason: str,
    ) -> bool:
        cursor = conn.execute(
            """
            DELETE FROM entity_models
            WHERE entity_model_id = ? AND firmware_version = ?
            """,
            (entity_model_id, firmware_version),
        )
        removed = int(cursor.rowcount or 0)
        if removed > 0:
            self._record_invalidation(conn, reason)
            logger.warning(
                "Invalidated cache entry: entity_model_id=0x%016x, firmware=%s, reason=%s",
                entity_model_id,
                firmware_version,
                reason,
            )
            return True
        return False

    def get(
        self,
        entity_model_id: int,
        firmware_version: str,
        *,
        max_age_seconds: Optional[int] = None,
        require_complete: bool = False,
        require_compatible: bool = False,
    ) -> Optional[Dict[str, Any]]:
        """
        Get cached entity model if available.

        Args:
            entity_model_id: Entity model ID (from ADP)
            firmware_version: Firmware version string
            max_age_seconds: Optional max cache age; stale entries are invalidated.
            require_complete: If true, invalidates incomplete descriptor trees.
            require_compatible: If true, invalidates payloads with incompatible metadata.

        Returns:
            Entity model JSON dict if cached, None otherwise
        """
        with self._lock, self._get_connection() as conn:
            cursor = conn.execute(
                """
                SELECT json_data, created_at
                FROM entity_models
                WHERE entity_model_id = ? AND firmware_version = ?
                """,
                (entity_model_id, firmware_version)
            )
            row = cursor.fetchone()

            if row:
                try:
                    model_json = json.loads(row[0])
                except json.JSONDecodeError as e:
                    logger.error(f"Failed to decode cached JSON: {e}")
                    self._invalidate_with_connection(
                        conn,
                        entity_model_id,
                        firmware_version,
                        reason="corrupt",
                    )
                    conn.execute(
                        "UPDATE cache_stats SET miss_count = miss_count + 1 WHERE id = 1"
                    )
                    return None

                if max_age_seconds is not None and int(max_age_seconds) >= 0:
                    created_at = self._parse_sqlite_timestamp(row[1])
                    if created_at is not None:
                        age_seconds = (datetime.now(timezone.utc) - created_at).total_seconds()
                        if age_seconds > int(max_age_seconds):
                            self._invalidate_with_connection(
                                conn,
                                entity_model_id,
                                firmware_version,
                                reason="stale",
                            )
                            conn.execute(
                                "UPDATE cache_stats SET miss_count = miss_count + 1 WHERE id = 1"
                            )
                            return None

                if require_complete and not self._is_model_complete(model_json):
                    self._invalidate_with_connection(
                        conn,
                        entity_model_id,
                        firmware_version,
                        reason="incomplete",
                    )
                    conn.execute(
                        "UPDATE cache_stats SET miss_count = miss_count + 1 WHERE id = 1"
                    )
                    return None

                if require_compatible and not self._payload_is_compatible(
                    model_json,
                    entity_model_id,
                    firmware_version,
                ):
                    self._invalidate_with_connection(
                        conn,
                        entity_model_id,
                        firmware_version,
                        reason="incompatible",
                    )
                    conn.execute(
                        "UPDATE cache_stats SET miss_count = miss_count + 1 WHERE id = 1"
                    )
                    return None

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

                logger.debug(
                    f"Cache HIT: entity_model_id=0x{entity_model_id:016x}, "
                    f"firmware={firmware_version}"
                )
                return model_json
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
        self.invalidate(entity_model_id, firmware_version, reason="manual")

    def invalidate(self, entity_model_id: int, firmware_version: str, reason: str = "manual") -> bool:
        """
        Invalidate one cache entry and record reason in stats.

        Returns:
            True when an entry was removed, False when no matching row existed.
        """
        with self._lock, self._get_connection() as conn:
            return self._invalidate_with_connection(
                conn,
                entity_model_id,
                firmware_version,
                reason=reason,
            )

    def cleanup_old_entries(self) -> int:
        """
        Remove entries older than CLEANUP_AGE_DAYS.

        Returns:
            Number of entries removed
        """
        with self._lock, self._get_connection() as conn:
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=self.CLEANUP_AGE_DAYS)

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
                SELECT
                    hit_count,
                    miss_count,
                    enumeration_time_avg_ms,
                    last_cleanup,
                    invalidation_count,
                    invalidation_stale_count,
                    invalidation_incomplete_count,
                    invalidation_incompatible_count,
                    invalidation_corrupt_count,
                    invalidation_manual_count
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
                    "cleanup_age_days": self.CLEANUP_AGE_DAYS,
                    "invalidation_count": stats_row[4],
                    "invalidation_stale_count": stats_row[5],
                    "invalidation_incomplete_count": stats_row[6],
                    "invalidation_incompatible_count": stats_row[7],
                    "invalidation_corrupt_count": stats_row[8],
                    "invalidation_manual_count": stats_row[9],
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
                    "cleanup_age_days": self.CLEANUP_AGE_DAYS,
                    "invalidation_count": 0,
                    "invalidation_stale_count": 0,
                    "invalidation_incomplete_count": 0,
                    "invalidation_incompatible_count": 0,
                    "invalidation_corrupt_count": 0,
                    "invalidation_manual_count": 0,
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
                SET
                    hit_count = 0,
                    miss_count = 0,
                    enumeration_time_avg_ms = 0.0,
                    invalidation_count = 0,
                    invalidation_stale_count = 0,
                    invalidation_incomplete_count = 0,
                    invalidation_incompatible_count = 0,
                    invalidation_corrupt_count = 0,
                    invalidation_manual_count = 0
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

"""
SQLAlchemy Database Models
Core ORM definitions for plugins, chains, MIDI mappings, and system configuration.

Power-Failure Resilience:
- WAL (Write-Ahead Logging) mode for atomic commits
- SYNCHRONOUS=NORMAL for balance of safety and performance
- Raised WAL auto-checkpoint threshold plus explicit shutdown checkpoint
- Connection pragma enforcement on each connection
"""

import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Awaitable, Callable, Sequence

from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, ForeignKey, Text, JSON, Index, UniqueConstraint, create_engine, event, text, inspect as sqlalchemy_inspect
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session, declarative_base, relationship, sessionmaker

from app.utils.time import utc_now

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return utc_now()

Base = declarative_base()

# Database session management
_engine = None
_SessionLocal = None

# SQLite PRAGMA settings for power-failure resilience
SQLITE_PRAGMAS = {
    "journal_mode": "WAL",           # Write-Ahead Logging for atomic commits
    "synchronous": "NORMAL",         # Balance of safety and performance (FULL for max safety)
    # Keep auto-checkpoints well above the hot path; graceful shutdown already
    # forces an explicit TRUNCATE checkpoint via checkpoint_database().
    "wal_autocheckpoint": "12000",
    "busy_timeout": "100",           # Fail fast on lock contention; bounded replay retries handle recovery
    "cache_size": "-64000",          # 64MB cache (negative = KB)
    "foreign_keys": "ON",            # Enforce foreign key constraints
    "temp_store": "MEMORY",          # Store temp tables in memory
}

SQLITE_LOCK_RETRY_MAX_ATTEMPTS = 4
SQLITE_LOCK_RETRY_DELAY_S = 0.05


def _is_sqlite_lock_error(exc: BaseException) -> bool:
    message = str(getattr(exc, "orig", exc)).lower()
    return "database is locked" in message or "database table is locked" in message


def _capture_sqlalchemy_write_plan(session: Session) -> tuple[list[object], list[tuple[object, dict[str, object]]], list[object]]:
    inserts = list(session.new)
    deletes = list(session.deleted)
    ignored = {id(obj) for obj in inserts}
    ignored.update(id(obj) for obj in deletes)
    updates: list[tuple[object, dict[str, object]]] = []

    for obj in list(session.identity_map.values()):
        if id(obj) in ignored or not session.is_modified(obj, include_collections=False):
            continue
        state = sqlalchemy_inspect(obj)
        changed: dict[str, object] = {}
        for attr in state.mapper.column_attrs:
            history = state.attrs[attr.key].history
            if history.has_changes():
                changed[attr.key] = getattr(obj, attr.key)
        if changed:
            updates.append((obj, changed))

    return inserts, updates, deletes


def _restore_sqlalchemy_write_plan(
    session: Session,
    plan: tuple[list[object], list[tuple[object, dict[str, object]]], list[object]],
) -> None:
    inserts, updates, deletes = plan

    for obj in inserts:
        state = sqlalchemy_inspect(obj)
        if state.transient or state.detached:
            session.add(obj)

    for obj, changed in updates:
        state = sqlalchemy_inspect(obj)
        if state.detached or state.transient:
            session.add(obj)
        for key, value in changed.items():
            setattr(obj, key, value)

    for obj in deletes:
        state = sqlalchemy_inspect(obj)
        if state.detached or state.transient:
            session.add(obj)
        session.delete(obj)


def _run_sync_sqlite_lock_retry(session: Session, operation_name: str, operation):
    for attempt in range(1, SQLITE_LOCK_RETRY_MAX_ATTEMPTS + 1):
        plan = _capture_sqlalchemy_write_plan(session)
        try:
            return operation()
        except OperationalError as exc:
            if not _is_sqlite_lock_error(exc):
                raise
            session.rollback()
            if attempt >= SQLITE_LOCK_RETRY_MAX_ATTEMPTS:
                raise
            _restore_sqlalchemy_write_plan(session, plan)
            logger.warning(
                "SQLite lock during %s; retrying attempt %s/%s in %.3fs",
                operation_name,
                attempt + 1,
                SQLITE_LOCK_RETRY_MAX_ATTEMPTS,
                SQLITE_LOCK_RETRY_DELAY_S,
            )
            time.sleep(SQLITE_LOCK_RETRY_DELAY_S)


async def _run_async_sqlite_lock_retry(session: AsyncSession, operation_name: str, operation):
    sync_session = session.sync_session
    for attempt in range(1, SQLITE_LOCK_RETRY_MAX_ATTEMPTS + 1):
        plan = _capture_sqlalchemy_write_plan(sync_session)
        try:
            return await operation()
        except OperationalError as exc:
            if not _is_sqlite_lock_error(exc):
                raise
            await session.rollback()
            if attempt >= SQLITE_LOCK_RETRY_MAX_ATTEMPTS:
                raise
            _restore_sqlalchemy_write_plan(sync_session, plan)
            logger.warning(
                "SQLite lock during %s; retrying attempt %s/%s in %.3fs",
                operation_name,
                attempt + 1,
                SQLITE_LOCK_RETRY_MAX_ATTEMPTS,
                SQLITE_LOCK_RETRY_DELAY_S,
            )
            await asyncio.sleep(SQLITE_LOCK_RETRY_DELAY_S)


class RetryingSession(Session):
    """SQLite session that retries transient writer-lock failures with UoW replay."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._sqlite_lock_retry_active = False

    def flush(self, objects=None):
        if self._sqlite_lock_retry_active:
            return super().flush(objects=objects)
        self._sqlite_lock_retry_active = True
        try:
            return _run_sync_sqlite_lock_retry(
                self,
                "flush",
                lambda: super(RetryingSession, self).flush(objects=objects),
            )
        finally:
            self._sqlite_lock_retry_active = False

    def commit(self):
        if self._sqlite_lock_retry_active:
            return super().commit()
        self._sqlite_lock_retry_active = True
        try:
            return _run_sync_sqlite_lock_retry(
                self,
                "commit",
                lambda: super(RetryingSession, self).commit(),
            )
        finally:
            self._sqlite_lock_retry_active = False


class RetryingAsyncSession(AsyncSession):
    """Async SQLite session that retries transient writer-lock failures with UoW replay."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._sqlite_lock_retry_active = False

    async def flush(self, objects=None):
        if self._sqlite_lock_retry_active:
            return await super().flush(objects=objects)
        self._sqlite_lock_retry_active = True
        try:
            return await _run_async_sqlite_lock_retry(
                self,
                "flush",
                lambda: super(RetryingAsyncSession, self).flush(objects=objects),
            )
        finally:
            self._sqlite_lock_retry_active = False

    async def commit(self):
        if self._sqlite_lock_retry_active:
            return await super().commit()
        self._sqlite_lock_retry_active = True
        try:
            return await _run_async_sqlite_lock_retry(
                self,
                "commit",
                lambda: super(RetryingAsyncSession, self).commit(),
            )
        finally:
            self._sqlite_lock_retry_active = False


def _resolve_database_path() -> Path:
    """Resolve configured database file path with sensible fallback."""
    raw_path = "data/map2.db"
    try:
        from app.config import get_config
        raw_path = str(get_config().get("database.path", raw_path))
    except Exception:
        pass

    path = Path(raw_path).expanduser()
    if not path.is_absolute():
        project_root = Path(__file__).resolve().parent.parent
        path = (project_root / path).resolve()
    return path


def get_default_database_url(async_mode: bool = False) -> str:
    """Build sqlite URL from configured path and ensure parent directory exists."""
    db_path = _resolve_database_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    prefix = "sqlite+aiosqlite:///" if async_mode else "sqlite:///"
    return f"{prefix}{db_path}"


@event.listens_for(Engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, connection_record):
    """Apply SQLite PRAGMAs on every new connection for power-failure resilience."""
    cursor = dbapi_connection.cursor()
    for pragma, value in SQLITE_PRAGMAS.items():
        try:
            cursor.execute(f"PRAGMA {pragma}={value}")
        except Exception as e:
            logger.warning(f"Failed to set PRAGMA {pragma}={value}: {e}")
    cursor.close()


def init_db(database_url: str = None) -> None:
    """Initialize database engine and session factory with power-failure resilience."""
    global _engine, _SessionLocal, _sync_migrations_applied
    database_url = database_url or get_default_database_url(async_mode=False)
    _engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False},
        pool_pre_ping=True,  # Verify connections are alive
    )
    _SessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=_engine,
        class_=RetryingSession,
    )
    Base.metadata.create_all(bind=_engine)
    _sync_migrations_applied = False
    apply_pending_schema_migrations_sync()
    logger.info("Database initialized with WAL mode and power-failure resilience")


def get_db():
    """Get database session as a generator (FastAPI Depends compatible).

    Usage with FastAPI:
        @router.get("/items")
        def read_items(db: Session = Depends(get_db)):
            ...

    Usage without FastAPI:
        db = next(get_db())   # or use get_db_session() below
    """
    if _SessionLocal is None:
        init_db()
    db = _SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db_session() -> Session:
    """Get a database session for direct (non-FastAPI) use.

    Caller is responsible for closing the session when done.

    Usage:
        session = get_db_session()
        try:
            ...
        finally:
            session.close()
    """
    if _SessionLocal is None:
        init_db()
    return _SessionLocal()

_async_engine = None
_async_session_maker = None
_tables_created = False  # Track if tables have been created
_pragmas_set = False  # Track if PRAGMAs have been applied
_sync_migrations_applied = False


MigrationSync = Callable[[], None]
MigrationAsync = Callable[[object], Awaitable[None]]


def _ensure_schema_migrations_table_sync() -> None:
    if _engine is None:
        return
    with _engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                "version INTEGER PRIMARY KEY, "
                "name VARCHAR(255) NOT NULL, "
                "applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"
                ")"
            )
        )


async def _ensure_schema_migrations_table_async(conn) -> None:
    await conn.execute(
        text(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            "version INTEGER PRIMARY KEY, "
            "name VARCHAR(255) NOT NULL, "
            "applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"
            ")"
        )
    )


def _applied_migration_versions_sync() -> set[int]:
    if _engine is None:
        return set()
    _ensure_schema_migrations_table_sync()
    with _engine.begin() as conn:
        result = conn.execute(text("SELECT version FROM schema_migrations"))
        return {int(row[0]) for row in result.fetchall()}


async def _applied_migration_versions_async(conn) -> set[int]:
    await _ensure_schema_migrations_table_async(conn)
    result = await conn.execute(text("SELECT version FROM schema_migrations"))
    return {int(row[0]) for row in result.fetchall()}


def _record_migration_sync(version: int, name: str) -> None:
    if _engine is None:
        return
    with _engine.begin() as conn:
        conn.execute(
            text(
                "INSERT OR IGNORE INTO schema_migrations (version, name) "
                "VALUES (:version, :name)"
            ),
            {"version": int(version), "name": str(name)},
        )


async def _record_migration_async(conn, version: int, name: str) -> None:
    await conn.execute(
        text(
            "INSERT OR IGNORE INTO schema_migrations (version, name) "
            "VALUES (:version, :name)"
        ),
        {"version": int(version), "name": str(name)},
    )


def init_async_db(database_url: str = None) -> None:
    """Initialize async database engine and session factory with power-failure resilience."""
    global _async_engine, _async_session_maker
    database_url = database_url or get_default_database_url(async_mode=True)
    if _async_engine is not None:
        # Tests and controlled restarts can re-point the global async DB; dispose
        # the previous pool first so aiosqlite worker threads do not survive.
        _async_engine.sync_engine.dispose()
    _async_engine = create_async_engine(
        database_url,
        echo=False,
        pool_pre_ping=True,
    )
    # CRITICAL: expire_on_commit=True ensures deleted objects are expired after commit
    # This forces fresh database queries instead of returning stale cached objects
    # With expire_on_commit=False, deleted plugins would remain visible in the session
    _async_session_maker = async_sessionmaker(
        _async_engine,
        class_=RetryingAsyncSession,
        expire_on_commit=True,
    )


async def _set_async_pragmas(conn) -> None:
    """Apply SQLite PRAGMAs for async connection."""
    for pragma, value in SQLITE_PRAGMAS.items():
        try:
            await conn.execute(text(f"PRAGMA {pragma}={value}"))
        except Exception as e:
            logger.warning(f"Failed to set async PRAGMA {pragma}={value}: {e}")


def _special_settings_default_pinned_routes_json() -> str:
    return "[]"


def _special_settings_default_landing_tiles_json() -> str:
    return "[]"


def _special_settings_default_snapshot_setlist_order_json() -> str:
    return "[]"


def _ensure_special_settings_schema_sync() -> None:
    """Apply additive schema upgrades for special_settings in existing SQLite DBs."""
    if _engine is None or _engine.dialect.name != "sqlite":
        return

    with _engine.begin() as conn:
        result = conn.execute(text("PRAGMA table_info(special_settings)"))
        columns = {str(row[1]) for row in result.fetchall()}

        if columns and "pinned_routes" not in columns:
            conn.execute(text("ALTER TABLE special_settings ADD COLUMN pinned_routes JSON"))
            if "promoted_advanced_routes" in columns:
                conn.execute(
                    text(
                        "UPDATE special_settings "
                        "SET pinned_routes = COALESCE(promoted_advanced_routes, :routes) "
                        "WHERE pinned_routes IS NULL"
                    ),
                    {"routes": _special_settings_default_pinned_routes_json()},
                )
            else:
                conn.execute(
                    text(
                        "UPDATE special_settings "
                        "SET pinned_routes = :routes "
                        "WHERE pinned_routes IS NULL"
                    ),
                    {"routes": _special_settings_default_pinned_routes_json()},
                )
            logger.info("Added special_settings.pinned_routes schema upgrade")

        if columns and "last_active_node" not in columns:
            conn.execute(text("ALTER TABLE special_settings ADD COLUMN last_active_node VARCHAR(128)"))
            logger.info("Added special_settings.last_active_node schema upgrade")

        if columns and "landing_tiles" not in columns:
            conn.execute(text("ALTER TABLE special_settings ADD COLUMN landing_tiles JSON"))
            conn.execute(
                text(
                    "UPDATE special_settings "
                    "SET landing_tiles = :tiles "
                    "WHERE landing_tiles IS NULL"
                ),
                {"tiles": _special_settings_default_landing_tiles_json()},
            )
            logger.info("Added special_settings.landing_tiles schema upgrade")

        if columns and "snapshot_setlist_mode" not in columns:
            conn.execute(text("ALTER TABLE special_settings ADD COLUMN snapshot_setlist_mode BOOLEAN"))
            conn.execute(
                text(
                    "UPDATE special_settings "
                    "SET snapshot_setlist_mode = 0 "
                    "WHERE snapshot_setlist_mode IS NULL"
                )
            )
            logger.info("Added special_settings.snapshot_setlist_mode schema upgrade")

        if columns and "snapshot_setlist_order" not in columns:
            conn.execute(text("ALTER TABLE special_settings ADD COLUMN snapshot_setlist_order JSON"))
            conn.execute(
                text(
                    "UPDATE special_settings "
                    "SET snapshot_setlist_order = :setlist_order "
                    "WHERE snapshot_setlist_order IS NULL"
                ),
                {"setlist_order": _special_settings_default_snapshot_setlist_order_json()},
            )
            logger.info("Added special_settings.snapshot_setlist_order schema upgrade")


def _sqlite_columns(conn, table_name: str) -> set[str]:
    result = conn.execute(text(f"PRAGMA table_info({table_name})"))
    return {str(row[1]) for row in result.fetchall()}


def _add_sqlite_column_if_missing(conn, table_name: str, column_name: str, column_sql: str) -> bool:
    columns = _sqlite_columns(conn, table_name)
    if columns and column_name not in columns:
        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}"))
        logger.info("Added %s.%s schema upgrade", table_name, column_name)
        return True
    return False


def _ensure_midi_automation_identity_schema_sync() -> None:
    """Apply additive schema upgrades for duplicate-safe MIDI and automation identity."""
    if _engine is None or _engine.dialect.name != "sqlite":
        return

    with _engine.begin() as conn:
        _add_sqlite_column_if_missing(conn, "midi_mappings", "target_plugin_position", "INTEGER")
        _add_sqlite_column_if_missing(conn, "midi_commands", "target_plugin_position", "INTEGER")
        _add_sqlite_column_if_missing(conn, "midi_learn_state", "target_plugin_position", "INTEGER")
        _add_sqlite_column_if_missing(conn, "automation_lanes", "plugin_position", "INTEGER")


def _ensure_chain_plugin_loader_state_schema_sync() -> None:
    """Apply additive schema upgrades for persisted NAM/IR loader state."""
    if _engine is None or _engine.dialect.name != "sqlite":
        return

    with _engine.begin() as conn:
        _add_sqlite_column_if_missing(conn, "chain_plugins", "selected_asset_name", "VARCHAR(512)")
        _add_sqlite_column_if_missing(conn, "chain_plugins", "selected_asset_path", "VARCHAR(1024)")
        _add_sqlite_column_if_missing(conn, "chain_plugins", "nam_input_gain", "FLOAT DEFAULT 0.0")
        _add_sqlite_column_if_missing(conn, "chain_plugins", "nam_output_gain", "FLOAT DEFAULT 0.0")
        _add_sqlite_column_if_missing(conn, "chain_plugins", "nam_normalize", "BOOLEAN DEFAULT 1")
        _add_sqlite_column_if_missing(conn, "chain_plugins", "ir_mix", "FLOAT")

        conn.execute(
            text(
                "UPDATE chain_plugins "
                "SET nam_input_gain = COALESCE(nam_input_gain, 0.0), "
                "    nam_output_gain = COALESCE(nam_output_gain, 0.0), "
                "    nam_normalize = COALESCE(nam_normalize, 1) "
                "WHERE plugin_uri IN ('map2://juce/nam', 'urn:map2:nam-player')"
            )
        )
        conn.execute(
            text(
                "UPDATE chain_plugins "
                "SET ir_mix = COALESCE(ir_mix, 100.0) "
                "WHERE plugin_uri IN ('map2://juce/convolution/cabinet', 'urn:map2:ir-cabinet')"
            )
        )
        conn.execute(
            text(
                "UPDATE chain_plugins "
                "SET ir_mix = COALESCE(ir_mix, 30.0) "
                "WHERE plugin_uri IN ('map2://juce/convolution/reverb', 'urn:map2:ir-reverb')"
            )
        )


def _ensure_plugin_metadata_schema_sync() -> None:
    """Apply additive schema upgrades for plugin user metadata on existing SQLite DBs."""
    if _engine is None or _engine.dialect.name != "sqlite":
        return

    with _engine.begin() as conn:
        if _add_sqlite_column_if_missing(conn, "plugins", "tags", "JSON"):
            conn.execute(
                text(
                    "UPDATE plugins "
                    "SET tags = '[]' "
                    "WHERE tags IS NULL"
                )
            )
        if _add_sqlite_column_if_missing(conn, "plugins", "user_description", "TEXT DEFAULT ''"):
            conn.execute(
                text(
                    "UPDATE plugins "
                    "SET user_description = '' "
                    "WHERE user_description IS NULL"
                )
            )
        if _add_sqlite_column_if_missing(conn, "plugins", "is_favorite", "BOOLEAN DEFAULT 0"):
            conn.execute(
                text(
                    "UPDATE plugins "
                    "SET is_favorite = 0 "
                    "WHERE is_favorite IS NULL"
                )
            )
        if _add_sqlite_column_if_missing(conn, "plugins", "is_hidden", "BOOLEAN DEFAULT 0"):
            conn.execute(
                text(
                    "UPDATE plugins "
                    "SET is_hidden = 0 "
                    "WHERE is_hidden IS NULL"
                )
            )


def _ensure_snapshot_device_schema_sync() -> None:
    """Apply additive schema upgrades for snapshot-scoped metadata and runtime state."""
    if _engine is None or _engine.dialect.name != "sqlite":
        return

    with _engine.begin() as conn:
        _add_sqlite_column_if_missing(conn, "snapshots", "input_device", "VARCHAR(255)")
        _add_sqlite_column_if_missing(conn, "snapshots", "output_device", "VARCHAR(255)")
        _add_sqlite_column_if_missing(conn, "snapshots", "derived_from_snapshot_id", "INTEGER")
        _add_sqlite_column_if_missing(conn, "snapshots", "is_locked", "BOOLEAN DEFAULT 0")
        _add_sqlite_column_if_missing(conn, "snapshots", "controls_payload", "JSON")
        _add_sqlite_column_if_missing(conn, "snapshots", "extensions_payload", "JSON")
        _add_sqlite_column_if_missing(conn, "snapshots", "live_state_payload", "JSON")
        _add_sqlite_column_if_missing(conn, "snapshots", "activated_at", "DATETIME")
        _add_sqlite_column_if_missing(conn, "snapshots", "output_level_reference_dbfs", "FLOAT")
        _add_sqlite_column_if_missing(conn, "snapshots", "output_level_warning_threshold_db", "FLOAT DEFAULT 3.0")
        if _add_sqlite_column_if_missing(conn, "snapshots", "tempo_bpm", "FLOAT DEFAULT 120.0"):
            conn.execute(
                text(
                    "UPDATE snapshots "
                    "SET tempo_bpm = 120.0 "
                    "WHERE tempo_bpm IS NULL"
                )
            )
        conn.execute(text("DROP TABLE IF EXISTS snapshot_session_notes"))
        conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS snapshot_revisions ("
                "id INTEGER PRIMARY KEY, "
                "snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE, "
                "revision_number INTEGER NOT NULL, "
                "snapshot_revision VARCHAR(64), "
                "summary TEXT NOT NULL, "
                "summary_metadata JSON NOT NULL DEFAULT '{}', "
                "payload JSON NOT NULL, "
                "saved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"
                ")"
            )
        )


def _ensure_snapshot_graph_document_schema_sync() -> None:
    """Apply additive schema upgrades for State Authority graph-document persistence."""
    if _engine is None or _engine.dialect.name != "sqlite":
        return

    with _engine.begin() as conn:
        _add_sqlite_column_if_missing(conn, "snapshots", "document", "JSON")
        _add_sqlite_column_if_missing(conn, "snapshot_revisions", "document", "JSON")
        _add_sqlite_column_if_missing(conn, "snapshot_revisions", "summary_metadata", "JSON DEFAULT '{}'")
        conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS state_authority_assets ("
                "id INTEGER PRIMARY KEY, "
                "asset_hash VARCHAR(71) NOT NULL UNIQUE, "
                "source_path VARCHAR(2048) NOT NULL, "
                "file_name VARCHAR(512) NOT NULL, "
                "size_bytes INTEGER NOT NULL DEFAULT 0, "
                "asset_type VARCHAR(128) NOT NULL, "
                "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"
                ")"
            )
        )
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshot_revisions_snapshot_revision_number "
                "ON snapshot_revisions (snapshot_id, revision_number)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_snapshot_revisions_snapshot_saved_at "
                "ON snapshot_revisions (snapshot_id, saved_at)"
            )
        )
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_state_authority_assets_asset_hash "
                "ON state_authority_assets (asset_hash)"
            )
        )


async def _ensure_special_settings_schema_async(conn) -> None:
    """Apply additive schema upgrades for special_settings in async SQLite sessions."""
    if conn.dialect.name != "sqlite":
        return

    result = await conn.execute(text("PRAGMA table_info(special_settings)"))
    columns = {str(row[1]) for row in result.fetchall()}

    if columns and "pinned_routes" not in columns:
        await conn.execute(text("ALTER TABLE special_settings ADD COLUMN pinned_routes JSON"))
        if "promoted_advanced_routes" in columns:
            await conn.execute(
                text(
                    "UPDATE special_settings "
                    "SET pinned_routes = COALESCE(promoted_advanced_routes, :routes) "
                    "WHERE pinned_routes IS NULL"
                ),
                {"routes": _special_settings_default_pinned_routes_json()},
            )
        else:
            await conn.execute(
                text(
                    "UPDATE special_settings "
                    "SET pinned_routes = :routes "
                    "WHERE pinned_routes IS NULL"
                ),
                {"routes": _special_settings_default_pinned_routes_json()},
            )
        logger.info("Added async special_settings.pinned_routes schema upgrade")

    if columns and "last_active_node" not in columns:
        await conn.execute(text("ALTER TABLE special_settings ADD COLUMN last_active_node VARCHAR(128)"))
        logger.info("Added async special_settings.last_active_node schema upgrade")

    if columns and "landing_tiles" not in columns:
        await conn.execute(text("ALTER TABLE special_settings ADD COLUMN landing_tiles JSON"))
        await conn.execute(
            text(
                "UPDATE special_settings "
                "SET landing_tiles = :tiles "
                "WHERE landing_tiles IS NULL"
            ),
            {"tiles": _special_settings_default_landing_tiles_json()},
        )
        logger.info("Added async special_settings.landing_tiles schema upgrade")

    if columns and "snapshot_setlist_mode" not in columns:
        await conn.execute(text("ALTER TABLE special_settings ADD COLUMN snapshot_setlist_mode BOOLEAN"))
        await conn.execute(
            text(
                "UPDATE special_settings "
                "SET snapshot_setlist_mode = 0 "
                "WHERE snapshot_setlist_mode IS NULL"
            )
        )
        logger.info("Added async special_settings.snapshot_setlist_mode schema upgrade")

    if columns and "snapshot_setlist_order" not in columns:
        await conn.execute(text("ALTER TABLE special_settings ADD COLUMN snapshot_setlist_order JSON"))
        await conn.execute(
            text(
                "UPDATE special_settings "
                "SET snapshot_setlist_order = :setlist_order "
                "WHERE snapshot_setlist_order IS NULL"
            ),
            {"setlist_order": _special_settings_default_snapshot_setlist_order_json()},
        )
        logger.info("Added async special_settings.snapshot_setlist_order schema upgrade")


async def _sqlite_columns_async(conn, table_name: str) -> set[str]:
    result = await conn.execute(text(f"PRAGMA table_info({table_name})"))
    return {str(row[1]) for row in result.fetchall()}


async def _add_sqlite_column_if_missing_async(conn, table_name: str, column_name: str, column_sql: str) -> bool:
    columns = await _sqlite_columns_async(conn, table_name)
    if columns and column_name not in columns:
        await conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}"))
        logger.info("Added async %s.%s schema upgrade", table_name, column_name)
        return True
    return False


async def _ensure_midi_automation_identity_schema_async(conn) -> None:
    """Apply additive async schema upgrades for duplicate-safe MIDI and automation identity."""
    if conn.dialect.name != "sqlite":
        return

    await _add_sqlite_column_if_missing_async(conn, "midi_mappings", "target_plugin_position", "INTEGER")
    await _add_sqlite_column_if_missing_async(conn, "midi_commands", "target_plugin_position", "INTEGER")
    await _add_sqlite_column_if_missing_async(conn, "midi_learn_state", "target_plugin_position", "INTEGER")
    await _add_sqlite_column_if_missing_async(conn, "automation_lanes", "plugin_position", "INTEGER")


async def _ensure_chain_plugin_loader_state_schema_async(conn) -> None:
    """Apply additive async schema upgrades for persisted NAM/IR loader state."""
    if conn.dialect.name != "sqlite":
        return

    await _add_sqlite_column_if_missing_async(conn, "chain_plugins", "selected_asset_name", "VARCHAR(512)")
    await _add_sqlite_column_if_missing_async(conn, "chain_plugins", "selected_asset_path", "VARCHAR(1024)")
    await _add_sqlite_column_if_missing_async(conn, "chain_plugins", "nam_input_gain", "FLOAT DEFAULT 0.0")
    await _add_sqlite_column_if_missing_async(conn, "chain_plugins", "nam_output_gain", "FLOAT DEFAULT 0.0")
    await _add_sqlite_column_if_missing_async(conn, "chain_plugins", "nam_normalize", "BOOLEAN DEFAULT 1")
    await _add_sqlite_column_if_missing_async(conn, "chain_plugins", "ir_mix", "FLOAT")

    await conn.execute(
        text(
            "UPDATE chain_plugins "
            "SET nam_input_gain = COALESCE(nam_input_gain, 0.0), "
            "    nam_output_gain = COALESCE(nam_output_gain, 0.0), "
            "    nam_normalize = COALESCE(nam_normalize, 1) "
            "WHERE plugin_uri IN ('map2://juce/nam', 'urn:map2:nam-player')"
        )
    )
    await conn.execute(
        text(
            "UPDATE chain_plugins "
            "SET ir_mix = COALESCE(ir_mix, 100.0) "
            "WHERE plugin_uri IN ('map2://juce/convolution/cabinet', 'urn:map2:ir-cabinet')"
        )
    )
    await conn.execute(
        text(
            "UPDATE chain_plugins "
            "SET ir_mix = COALESCE(ir_mix, 30.0) "
            "WHERE plugin_uri IN ('map2://juce/convolution/reverb', 'urn:map2:ir-reverb')"
        )
    )


async def _ensure_plugin_metadata_schema_async(conn) -> None:
    """Apply additive async schema upgrades for plugin user metadata."""
    if conn.dialect.name != "sqlite":
        return

    if await _add_sqlite_column_if_missing_async(conn, "plugins", "tags", "JSON"):
        await conn.execute(
            text(
                "UPDATE plugins "
                "SET tags = '[]' "
                "WHERE tags IS NULL"
            )
        )
    if await _add_sqlite_column_if_missing_async(conn, "plugins", "user_description", "TEXT DEFAULT ''"):
        await conn.execute(
            text(
                "UPDATE plugins "
                "SET user_description = '' "
                "WHERE user_description IS NULL"
            )
        )
    if await _add_sqlite_column_if_missing_async(conn, "plugins", "is_favorite", "BOOLEAN DEFAULT 0"):
        await conn.execute(
            text(
                "UPDATE plugins "
                "SET is_favorite = 0 "
                "WHERE is_favorite IS NULL"
            )
        )
    if await _add_sqlite_column_if_missing_async(conn, "plugins", "is_hidden", "BOOLEAN DEFAULT 0"):
        await conn.execute(
            text(
                "UPDATE plugins "
                "SET is_hidden = 0 "
                "WHERE is_hidden IS NULL"
            )
        )


async def _ensure_snapshot_device_schema_async(conn) -> None:
    """Apply additive async schema upgrades for snapshot-scoped metadata and runtime state."""
    if conn.dialect.name != "sqlite":
        return

    await _add_sqlite_column_if_missing_async(conn, "snapshots", "input_device", "VARCHAR(255)")
    await _add_sqlite_column_if_missing_async(conn, "snapshots", "output_device", "VARCHAR(255)")
    await _add_sqlite_column_if_missing_async(conn, "snapshots", "derived_from_snapshot_id", "INTEGER")
    await _add_sqlite_column_if_missing_async(conn, "snapshots", "is_locked", "BOOLEAN DEFAULT 0")
    await _add_sqlite_column_if_missing_async(conn, "snapshots", "controls_payload", "JSON")
    await _add_sqlite_column_if_missing_async(conn, "snapshots", "extensions_payload", "JSON")
    await _add_sqlite_column_if_missing_async(conn, "snapshots", "live_state_payload", "JSON")
    await _add_sqlite_column_if_missing_async(conn, "snapshots", "activated_at", "DATETIME")
    await _add_sqlite_column_if_missing_async(conn, "snapshots", "output_level_reference_dbfs", "FLOAT")
    await _add_sqlite_column_if_missing_async(conn, "snapshots", "output_level_warning_threshold_db", "FLOAT DEFAULT 3.0")
    if await _add_sqlite_column_if_missing_async(conn, "snapshots", "tempo_bpm", "FLOAT DEFAULT 120.0"):
        await conn.execute(
            text(
                "UPDATE snapshots "
                "SET tempo_bpm = 120.0 "
                "WHERE tempo_bpm IS NULL"
            )
        )
    await conn.execute(text("DROP TABLE IF EXISTS snapshot_session_notes"))
    await conn.execute(
        text(
            "CREATE TABLE IF NOT EXISTS snapshot_revisions ("
            "id INTEGER PRIMARY KEY, "
            "snapshot_id INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE, "
            "revision_number INTEGER NOT NULL, "
            "snapshot_revision VARCHAR(64), "
            "summary TEXT NOT NULL, "
            "summary_metadata JSON NOT NULL DEFAULT '{}', "
            "payload JSON NOT NULL, "
            "saved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"
            ")"
        )
    )


async def _ensure_snapshot_graph_document_schema_async(conn) -> None:
    """Apply additive async schema upgrades for State Authority graph-document persistence."""
    if conn.dialect.name != "sqlite":
        return

    await _add_sqlite_column_if_missing_async(conn, "snapshots", "document", "JSON")
    await _add_sqlite_column_if_missing_async(conn, "snapshot_revisions", "document", "JSON")
    await _add_sqlite_column_if_missing_async(conn, "snapshot_revisions", "summary_metadata", "JSON DEFAULT '{}'")
    await conn.execute(
        text(
            "CREATE TABLE IF NOT EXISTS state_authority_assets ("
            "id INTEGER PRIMARY KEY, "
            "asset_hash VARCHAR(71) NOT NULL UNIQUE, "
            "source_path VARCHAR(2048) NOT NULL, "
            "file_name VARCHAR(512) NOT NULL, "
            "size_bytes INTEGER NOT NULL DEFAULT 0, "
            "asset_type VARCHAR(128) NOT NULL, "
            "created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "
            "updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"
            ")"
        )
    )
    await conn.execute(
        text(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshot_revisions_snapshot_revision_number "
            "ON snapshot_revisions (snapshot_id, revision_number)"
        )
    )
    await conn.execute(
        text(
            "CREATE INDEX IF NOT EXISTS idx_snapshot_revisions_snapshot_saved_at "
            "ON snapshot_revisions (snapshot_id, saved_at)"
        )
    )
    await conn.execute(
        text(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_state_authority_assets_asset_hash "
            "ON state_authority_assets (asset_hash)"
        )
    )


def _ensure_preset_uniqueness_schema_sync() -> None:
    """Deduplicate preset tables and enforce missing unique indexes."""
    if _engine is None or _engine.dialect.name != "sqlite":
        return

    with _engine.begin() as conn:
        conn.execute(
            text(
                "DELETE FROM plugin_presets "
                "WHERE id IN ("
                "  SELECT newer.id "
                "  FROM plugin_presets AS newer "
                "  JOIN plugin_presets AS keeper "
                "    ON newer.plugin_uri = keeper.plugin_uri "
                "   AND newer.name = keeper.name "
                "   AND newer.id > keeper.id"
                ")"
            )
        )
        conn.execute(
            text(
                "DELETE FROM preset_ratings "
                "WHERE id IN ("
                "  SELECT newer.id "
                "  FROM preset_ratings AS newer "
                "  JOIN preset_ratings AS keeper "
                "    ON newer.preset_id = keeper.preset_id "
                "   AND newer.user_fingerprint = keeper.user_fingerprint "
                "   AND newer.id > keeper.id"
                ")"
            )
        )
        conn.execute(
            text(
                "UPDATE community_presets "
                "SET rating_sum = COALESCE(("
                "      SELECT SUM(rating) FROM preset_ratings "
                "      WHERE preset_ratings.preset_id = community_presets.id"
                "    ), 0.0), "
                "    rating_count = COALESCE(("
                "      SELECT COUNT(*) FROM preset_ratings "
                "      WHERE preset_ratings.preset_id = community_presets.id"
                "    ), 0)"
            )
        )
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_plugin_presets_plugin_uri_name_unique "
                "ON plugin_presets (plugin_uri, name)"
            )
        )
        conn.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_preset_ratings_preset_fingerprint_unique "
                "ON preset_ratings (preset_id, user_fingerprint)"
            )
        )


async def _ensure_preset_uniqueness_schema_async(conn) -> None:
    """Async variant of preset dedupe and uniqueness enforcement."""
    if conn.dialect.name != "sqlite":
        return

    await conn.execute(
        text(
            "DELETE FROM plugin_presets "
            "WHERE id IN ("
            "  SELECT newer.id "
            "  FROM plugin_presets AS newer "
            "  JOIN plugin_presets AS keeper "
            "    ON newer.plugin_uri = keeper.plugin_uri "
            "   AND newer.name = keeper.name "
            "   AND newer.id > keeper.id"
            ")"
        )
    )
    await conn.execute(
        text(
            "DELETE FROM preset_ratings "
            "WHERE id IN ("
            "  SELECT newer.id "
            "  FROM preset_ratings AS newer "
            "  JOIN preset_ratings AS keeper "
            "    ON newer.preset_id = keeper.preset_id "
            "   AND newer.user_fingerprint = keeper.user_fingerprint "
            "   AND newer.id > keeper.id"
            ")"
        )
    )
    await conn.execute(
        text(
            "UPDATE community_presets "
            "SET rating_sum = COALESCE(("
            "      SELECT SUM(rating) FROM preset_ratings "
            "      WHERE preset_ratings.preset_id = community_presets.id"
            "    ), 0.0), "
            "    rating_count = COALESCE(("
            "      SELECT COUNT(*) FROM preset_ratings "
            "      WHERE preset_ratings.preset_id = community_presets.id"
            "    ), 0)"
        )
    )
    await conn.execute(
        text(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_plugin_presets_plugin_uri_name_unique "
            "ON plugin_presets (plugin_uri, name)"
        )
    )
    await conn.execute(
        text(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_preset_ratings_preset_fingerprint_unique "
            "ON preset_ratings (preset_id, user_fingerprint)"
        )
    )


SCHEMA_MIGRATIONS: Sequence[tuple[int, str, MigrationSync, MigrationAsync]] = (
    (1, "special_settings_additive_sync", _ensure_special_settings_schema_sync, _ensure_special_settings_schema_async),
    (2, "midi_automation_identity_additive_sync", _ensure_midi_automation_identity_schema_sync, _ensure_midi_automation_identity_schema_async),
    (3, "chain_plugin_loader_state_additive_sync", _ensure_chain_plugin_loader_state_schema_sync, _ensure_chain_plugin_loader_state_schema_async),
    (4, "snapshot_device_additive_sync", _ensure_snapshot_device_schema_sync, _ensure_snapshot_device_schema_async),
    (5, "snapshot_graph_document_additive_sync", _ensure_snapshot_graph_document_schema_sync, _ensure_snapshot_graph_document_schema_async),
    (6, "preset_uniqueness_enforcement_sync", _ensure_preset_uniqueness_schema_sync, _ensure_preset_uniqueness_schema_async),
    (8, "plugin_metadata_additive_sync", _ensure_plugin_metadata_schema_sync, _ensure_plugin_metadata_schema_async),
)


def apply_pending_schema_migrations_sync() -> None:
    global _sync_migrations_applied
    if _sync_migrations_applied or _engine is None:
        return

    applied = _applied_migration_versions_sync()
    for version, name, sync_migration, _async_migration in SCHEMA_MIGRATIONS:
        if version in applied:
            continue
        sync_migration()
        _record_migration_sync(version, name)
        logger.info("Applied schema migration %s (%s)", version, name)
    _sync_migrations_applied = True


async def apply_pending_schema_migrations_async(conn) -> None:
    applied = await _applied_migration_versions_async(conn)
    for version, name, _sync_migration, async_migration in SCHEMA_MIGRATIONS:
        if version in applied:
            continue
        await async_migration(conn)
        await _record_migration_async(conn, version, name)
        logger.info("Applied async schema migration %s (%s)", version, name)


async def _ensure_tables_created() -> None:
    """Create tables once if they don't exist (called only once per startup)."""
    global _tables_created, _pragmas_set
    if _tables_created:
        return
    if _async_engine:
        async with _async_engine.begin() as conn:
            # Apply PRAGMAs first
            if not _pragmas_set:
                for pragma, value in SQLITE_PRAGMAS.items():
                    try:
                        await conn.execute(text(f"PRAGMA {pragma}={value}"))
                    except Exception as e:
                        logger.warning(f"Failed to set async PRAGMA {pragma}={value}: {e}")
                _pragmas_set = True
                logger.info("Async database PRAGMAs applied (WAL mode enabled)")
            await conn.run_sync(Base.metadata.create_all)
            await apply_pending_schema_migrations_async(conn)
        _tables_created = True


@asynccontextmanager
async def get_session(read_only: bool = False) -> "AsyncSession":
    """Get async database session context manager with automatic transaction handling."""
    if _async_session_maker is None:
        init_async_db()

    # Create tables only once (not on every request!)
    await _ensure_tables_created()

    async with _async_session_maker() as session:
        try:
            yield session
            if read_only:
                # End read-only transactions without forcing commit/write locks.
                await session.rollback()
            else:
                await session.commit()
        except BaseException:
            await session.rollback()
            raise


async def checkpoint_database() -> None:
    """Force a WAL checkpoint to ensure all changes are written to main database file.

    Call this periodically or before graceful shutdown to ensure data durability.
    """
    if _async_engine:
        from sqlalchemy import text
        async with _async_engine.connect() as conn:
            async with conn.begin():
                await conn.execute(text("PRAGMA wal_checkpoint(TRUNCATE)"))
                logger.info("Database checkpoint completed")


async def dispose_async_db(reset_state: bool = True) -> None:
    """Dispose the async engine and optionally clear cached schema/session state."""
    global _async_engine, _async_session_maker, _tables_created, _pragmas_set, _sync_migrations_applied

    if _async_engine is not None:
        await _async_engine.dispose()

    _async_engine = None
    _async_session_maker = None
    if reset_state:
        _tables_created = False
        _pragmas_set = False
        _sync_migrations_applied = False


class Plugin(Base):
    """LV2 Plugin metadata and state."""
    __tablename__ = "plugins"

    id = Column(Integer, primary_key=True)
    uri = Column(String(255), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    category = Column(String(100), default="Unclassified")
    author = Column(String(255))
    version = Column(String(20))
    parameters = Column(Text, default="{}")  # JSON-serialized params
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
    
    # Latency information
    reported_latency_samples = Column(Integer, default=0)
    measured_latency_samples = Column(Integer, default=0)
    has_latency_port = Column(Boolean, default=False)
    latency_port_index = Column(Integer, nullable=True)
    
    # DSP management
    priority = Column(Integer, default=5)  # 1-10, 10=highest
    auto_bypass_on_overload = Column(Boolean, default=True)
    estimated_cpu_us = Column(Float, default=100.0)
    
    # LV2 compliance
    is_hard_rt_capable = Column(Boolean, default=False)
    has_options_interface = Column(Boolean, default=False)
    has_state_interface = Column(Boolean, default=False)
    has_worker_interface = Column(Boolean, default=False)
    bundle_path = Column(String(512), nullable=True)

    # User metadata
    tags = Column(JSON, default=list)  # User-assigned tags
    user_description = Column(Text, default="")  # User notes
    is_favorite = Column(Boolean, default=False)  # Mark as favorite
    is_hidden = Column(Boolean, default=False)  # Hide from browser


class Chain(Base):
    """Signal chain combining multiple plugins."""
    __tablename__ = "chains"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=False)
    config = Column(Text, default="{}")  # JSON chain config
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Relationships
    chain_plugins = relationship("ChainPlugin", back_populates="chain", cascade="all, delete-orphan")
    loop_insertions = relationship("EffectsLoopInsertion", back_populates="chain", cascade="all, delete-orphan")
    presets = relationship("Preset", back_populates="chain", cascade="all, delete-orphan")


class Preset(Base):
    """Plugin chain preset configuration."""
    __tablename__ = "presets"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    chain_id = Column(Integer, ForeignKey("chains.id"))
    plugin_states = Column(Text, nullable=False)  # JSON
    tags = Column(JSON, default=list)  # Enhanced: Tag support
    category = Column(String(100), default="User")  # Enhanced: Category
    description = Column(Text, default="")  # Enhanced: Description
    is_favorite = Column(Boolean, default=False)  # Enhanced: Favorites
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    chain = relationship("Chain", back_populates="presets")


class PluginPreset(Base):
    """Individual plugin parameter preset configuration.

    Separate from chain presets - stores parameter settings for a single plugin
    to enable easy reuse and favorite management.
    """
    __tablename__ = "plugin_presets"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    plugin_uri = Column(String(255), nullable=False, index=True)
    plugin_name = Column(String(255), nullable=False)
    parameters = Column(Text, nullable=False)  # JSON: {param_symbol: value, ...}
    tags = Column(JSON, default=list)  # Tag support
    category = Column(String(100), default="User")  # Category
    description = Column(Text, default="")  # Description
    is_favorite = Column(Boolean, default=False)  # Mark as favorite
    is_default = Column(Boolean, default=False)  # Set as default for this plugin
    usage_count = Column(Integer, default=0)  # Track usage frequency
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Composite unique constraint (plugin_uri + name)
    __table_args__ = (
        UniqueConstraint("plugin_uri", "name", name="uq_plugin_presets_plugin_uri_name"),
        {"sqlite_autoincrement": True},
    )


# =============================================================================
# COMMUNITY PRESET SYSTEM - Open/Permissionless Sharing
# =============================================================================

class CommunityPreset(Base):
    """Community-shared preset with ratings, downloads, and cross-platform format support.

    Supports the MAP2 Universal Preset Format (MAP2UPF) for interoperability.
    Open/permissionless - no authentication required for uploads.
    """
    __tablename__ = "community_presets"

    id = Column(Integer, primary_key=True)
    uuid = Column(String(36), unique=True, nullable=False, index=True)  # Globally unique ID for sharing

    # Content
    name = Column(String(255), nullable=False)
    plugin_uri = Column(String(255), nullable=False, index=True)
    plugin_name = Column(String(255), nullable=False)
    plugin_format = Column(String(50), default="lv2")  # lv2, vst3, au, juce
    parameters = Column(Text, nullable=False)  # JSON: {param_symbol: value, ...}
    state_chunk = Column(Text, nullable=True)  # Base64-encoded native plugin state (optional)

    # Metadata
    author_name = Column(String(255), default="Anonymous")
    author_id = Column(String(100), nullable=True)  # Optional anonymous fingerprint ID
    description = Column(Text, default="")
    category = Column(String(100), default="User", index=True)
    tags = Column(JSON, default=list)
    license = Column(String(50), default="CC-BY-4.0")  # Creative Commons by default

    # Community metrics
    download_count = Column(Integer, default=0)
    rating_sum = Column(Float, default=0.0)  # Sum of all ratings (for average calculation)
    rating_count = Column(Integer, default=0)  # Number of ratings
    report_count = Column(Integer, default=0)  # Number of spam/abuse reports

    # Import tracking
    original_format = Column(String(50), nullable=True)  # Source format if imported (fxp, vstpreset, etc.)
    source_file_hash = Column(String(64), nullable=True, index=True)  # SHA-256 for deduplication

    # Moderation (light-touch for permissionless model)
    is_approved = Column(Boolean, default=True)  # Auto-approve by default
    is_flagged = Column(Boolean, default=False)  # Flagged for review
    is_hidden = Column(Boolean, default=False)  # Hidden from public but not deleted

    # Timestamps
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Relationships
    ratings = relationship("PresetRating", back_populates="preset", cascade="all, delete-orphan")


class PresetRating(Base):
    """Individual user ratings for community presets.

    Uses anonymous device fingerprinting to prevent duplicate ratings
    while preserving user privacy (no accounts required).
    """
    __tablename__ = "preset_ratings"

    id = Column(Integer, primary_key=True)
    preset_id = Column(Integer, ForeignKey("community_presets.id", ondelete="CASCADE"), nullable=False)
    user_fingerprint = Column(String(64), nullable=False)  # Anonymous device fingerprint (SHA-256)
    rating = Column(Integer, nullable=False)  # 1-5 stars
    review_text = Column(Text, nullable=True)  # Optional review comment
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Relationship
    preset = relationship("CommunityPreset", back_populates="ratings")

    # Ensure one rating per user per preset
    __table_args__ = (
        UniqueConstraint("preset_id", "user_fingerprint", name="uq_preset_ratings_preset_fingerprint"),
        {"sqlite_autoincrement": True},
    )


class PresetImportHistory(Base):
    """Track imported preset files for deduplication and provenance.

    Prevents re-importing the same preset file multiple times and
    maintains a record of where presets originated.
    """
    __tablename__ = "preset_import_history"

    id = Column(Integer, primary_key=True)
    source_file_hash = Column(String(64), unique=True, nullable=False)  # SHA-256 of original file
    original_filename = Column(String(255), nullable=False)
    original_format = Column(String(50), nullable=False)  # fxp, fxb, vstpreset, aupreset, etc.
    file_size_bytes = Column(Integer, default=0)

    # Result tracking
    converted_preset_id = Column(Integer, ForeignKey("plugin_presets.id", ondelete="SET NULL"), nullable=True)
    community_preset_id = Column(Integer, ForeignKey("community_presets.id", ondelete="SET NULL"), nullable=True)
    conversion_success = Column(Boolean, default=True)
    conversion_errors = Column(Text, nullable=True)  # JSON array of error messages

    # Import metadata
    target_plugin_uri = Column(String(255), nullable=True)  # Plugin the preset was mapped to
    parameters_imported = Column(Integer, default=0)  # Number of parameters successfully imported

    # Timestamps
    import_timestamp = Column(DateTime, default=_utcnow)


class ChainPlugin(Base):
    """Junction table: plugins in chains with ordering."""
    __tablename__ = "chain_plugins"

    id = Column(Integer, primary_key=True)
    chain_id = Column(Integer, ForeignKey("chains.id"), nullable=False)
    plugin_uri = Column(String(255), nullable=False)  # No FK - plugins are discovered at runtime from LV2
    position = Column(Integer, nullable=False)  # Order in chain
    bypass = Column(Boolean, default=False)
    selected_asset_name = Column(String(512), nullable=True)
    selected_asset_path = Column(String(1024), nullable=True)
    nam_input_gain = Column(Float, default=0.0)
    nam_output_gain = Column(Float, default=0.0)
    nam_normalize = Column(Boolean, default=True)
    ir_mix = Column(Float, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    # Relationships
    chain = relationship("Chain", back_populates="chain_plugins")


# =============================================================================
# EXTERNAL EFFECTS LOOPS (TESIRA AVB SEND/RETURN)
# =============================================================================

class EffectsLoop(Base):
    """External effects loop definition mapped to AVB/Tesira topology."""
    __tablename__ = "effects_loops"

    id = Column(Integer, primary_key=True)
    loop_id = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    channels = Column(Integer, nullable=False, default=2)  # 1..8 validated in service layer
    topology = Column(String(64), default="serial_insert")

    tesira_device_id = Column(String(128), nullable=True)
    template_id = Column(String(128), nullable=True)
    send_endpoint_id = Column(String(255), nullable=True)
    return_endpoint_id = Column(String(255), nullable=True)

    state_desired = Column(String(32), default="inactive")
    state_actual = Column(String(32), default="inactive")
    health_status = Column(String(32), default="unknown")
    health_reason = Column(Text, nullable=True)

    target_added_latency_ms = Column(Float, default=0.5)
    measured_added_latency_ms = Column(Float, nullable=True)
    compensation_samples = Column(Integer, default=0)
    calibration_status = Column(String(32), default="uncalibrated")

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    insertions = relationship("EffectsLoopInsertion", back_populates="loop", cascade="all, delete-orphan")
    calibrations = relationship("EffectsLoopCalibration", back_populates="loop", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_effects_loops_device_template", "tesira_device_id", "template_id"),
        Index("idx_effects_loops_state", "state_actual", "health_status"),
    )


class EffectsLoopInsertion(Base):
    """Insertion record linking a loop into a chain slot."""
    __tablename__ = "effects_loop_insertions"

    id = Column(Integer, primary_key=True)
    insertion_id = Column(String(64), unique=True, nullable=False, index=True)
    chain_id = Column(Integer, ForeignKey("chains.id", ondelete="CASCADE"), nullable=False, index=True)
    loop_id = Column(String(64), ForeignKey("effects_loops.loop_id", ondelete="CASCADE"), nullable=False, index=True)
    slot_index = Column(Integer, nullable=False, default=0)
    enabled = Column(Boolean, default=True)

    mode = Column(String(32), default="serial_insert")
    blend_pct = Column(Float, default=100.0)
    send_gain_db = Column(Float, default=0.0)
    return_gain_db = Column(Float, default=0.0)
    crossfade_ms = Column(Integer, default=12)
    band_split_hz = Column(JSON, default=list)

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    chain = relationship("Chain", back_populates="loop_insertions")
    loop = relationship("EffectsLoop", back_populates="insertions")

    __table_args__ = (
        Index("idx_effects_loop_insertions_chain_slot", "chain_id", "slot_index"),
        Index("idx_effects_loop_insertions_chain_loop", "chain_id", "loop_id"),
    )


class EffectsLoopCalibration(Base):
    """Calibration history and compensation records per loop."""
    __tablename__ = "effects_loop_calibrations"

    id = Column(Integer, primary_key=True)
    calibration_id = Column(String(64), unique=True, nullable=False, index=True)
    loop_id = Column(String(64), ForeignKey("effects_loops.loop_id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(32), default="pending")
    measured_added_latency_ms = Column(Float, nullable=True)
    compensation_samples = Column(Integer, default=0)
    notes = Column(JSON, default=dict)
    measured_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    loop = relationship("EffectsLoop", back_populates="calibrations")

    __table_args__ = (
        Index("idx_effects_loop_calibrations_loop_created", "loop_id", "created_at"),
    )


# =============================================================================
# UNIFIED SNAPSHOTS - Snapshot Owns Channels, Chains, Routing, MIDI, Deployment
# =============================================================================

class Snapshot(Base):
    """Unified snapshot root record."""
    __tablename__ = "snapshots"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    tags = Column(JSON, default=list)
    program_number = Column(Integer, nullable=True, unique=True)
    is_active = Column(Boolean, default=False)
    display_order = Column(Integer, default=0)
    is_favorite = Column(Boolean, default=False)
    derived_from_snapshot_id = Column(Integer, ForeignKey("snapshots.id", ondelete="SET NULL"), nullable=True)
    is_locked = Column(Boolean, default=False)
    input_device = Column(String(255), nullable=True)
    output_device = Column(String(255), nullable=True)
    document = Column(JSON, default=dict)
    controls_payload = Column(JSON, default=dict)
    extensions_payload = Column(JSON, default=dict)
    live_state_payload = Column(JSON, default=dict)
    activated_at = Column(DateTime, nullable=True)
    output_level_reference_dbfs = Column(Float, nullable=True)
    output_level_warning_threshold_db = Column(Float, default=3.0)
    tempo_bpm = Column(Float, default=120.0)

    community_uuid = Column(String(64), nullable=True, unique=True, index=True)
    community_shared = Column(Boolean, default=False)
    community_author = Column(String(255), default="Anonymous")
    community_download_count = Column(Integer, default=0)
    community_rating_sum = Column(Float, default=0.0)
    community_rating_count = Column(Integer, default=0)

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    channels = relationship(
        "SnapshotChannel",
        back_populates="snapshot",
        cascade="all, delete-orphan",
        order_by="SnapshotChannel.order_index",
    )
    chains = relationship(
        "SnapshotChain",
        back_populates="snapshot",
        cascade="all, delete-orphan",
        order_by="SnapshotChain.order_index",
    )
    routing = relationship(
        "SnapshotRouting",
        back_populates="snapshot",
        cascade="all, delete-orphan",
        uselist=False,
    )
    midi_map = relationship(
        "SnapshotMidiMap",
        back_populates="snapshot",
        cascade="all, delete-orphan",
        uselist=False,
    )
    deployments = relationship(
        "SnapshotDeployment",
        back_populates="snapshot",
        cascade="all, delete-orphan",
    )
    revisions = relationship(
        "SnapshotRevision",
        back_populates="snapshot",
        cascade="all, delete-orphan",
        order_by="SnapshotRevision.revision_number.desc(), SnapshotRevision.id.desc()",
    )
    derived_from_snapshot = relationship("Snapshot", remote_side=[id], uselist=False)

    __table_args__ = (
        Index("idx_snapshots_active_order", "is_active", "display_order"),
        Index("idx_snapshots_shared_created", "community_shared", "created_at"),
    )


class SnapshotChain(Base):
    """Chain state namespaced inside a snapshot."""
    __tablename__ = "snapshot_chains"

    id = Column(Integer, primary_key=True)
    snapshot_id = Column(Integer, ForeignKey("snapshots.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    snapshot = relationship("Snapshot", back_populates="chains")
    plugins = relationship(
        "SnapshotChainPlugin",
        back_populates="chain",
        cascade="all, delete-orphan",
        order_by="SnapshotChainPlugin.position",
    )
    loop_insertions = relationship(
        "SnapshotLoopInsertion",
        back_populates="chain",
        cascade="all, delete-orphan",
        order_by="SnapshotLoopInsertion.slot_index",
    )

    __table_args__ = (
        Index("idx_snapshot_chains_snapshot_name", "snapshot_id", "name"),
        Index("idx_snapshot_chains_snapshot_order", "snapshot_id", "order_index"),
    )


class SnapshotChannel(Base):
    """Snapshot channel assignment and mix state."""
    __tablename__ = "snapshot_channels"

    id = Column(Integer, primary_key=True)
    snapshot_id = Column(Integer, ForeignKey("snapshots.id", ondelete="CASCADE"), nullable=False, index=True)
    chain_id = Column(Integer, ForeignKey("snapshot_chains.id", ondelete="SET NULL"), nullable=True, index=True)
    channel_key = Column(String(64), nullable=False)
    label = Column(String(64), nullable=False)
    color = Column(String(32), default="#2563eb")
    muted = Column(Boolean, default=False)
    solo = Column(Boolean, default=False)
    dry_wet_mix = Column(Float, default=100.0)
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    snapshot = relationship("Snapshot", back_populates="channels")
    chain = relationship("SnapshotChain", foreign_keys=[chain_id])

    __table_args__ = (
        Index("idx_snapshot_channels_snapshot_key", "snapshot_id", "channel_key", unique=True),
        Index("idx_snapshot_channels_snapshot_order", "snapshot_id", "order_index"),
    )


class SnapshotChainPlugin(Base):
    """Plugin rows embedded inside a snapshot chain."""
    __tablename__ = "snapshot_chain_plugins"

    id = Column(Integer, primary_key=True)
    snapshot_chain_id = Column(Integer, ForeignKey("snapshot_chains.id", ondelete="CASCADE"), nullable=False, index=True)
    plugin_uri = Column(String(255), nullable=False)
    plugin_name = Column(String(255), nullable=True)
    position = Column(Integer, nullable=False, default=0)
    bypass = Column(Boolean, default=False)
    parameters = Column(JSON, default=dict)
    loader_state = Column(JSON, default=dict)
    is_placeholder = Column(Boolean, default=False)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    chain = relationship("SnapshotChain", back_populates="plugins")

    __table_args__ = (
        Index("idx_snapshot_chain_plugins_chain_position", "snapshot_chain_id", "position"),
        Index("idx_snapshot_chain_plugins_chain_uri", "snapshot_chain_id", "plugin_uri"),
    )


class SnapshotLoopInsertion(Base):
    """Loop insertion state embedded inside a snapshot chain."""
    __tablename__ = "snapshot_loop_insertions"

    id = Column(Integer, primary_key=True)
    snapshot_chain_id = Column(Integer, ForeignKey("snapshot_chains.id", ondelete="CASCADE"), nullable=False, index=True)
    insertion_id = Column(String(64), nullable=True)
    loop_id = Column(String(64), nullable=True)
    slot_index = Column(Integer, nullable=False, default=0)
    enabled = Column(Boolean, default=True)
    mode = Column(String(32), default="serial_insert")
    blend_pct = Column(Float, default=100.0)
    send_gain_db = Column(Float, default=0.0)
    return_gain_db = Column(Float, default=0.0)
    crossfade_ms = Column(Integer, default=12)
    band_split_hz = Column(JSON, default=list)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    chain = relationship("SnapshotChain", back_populates="loop_insertions")

    __table_args__ = (
        Index("idx_snapshot_loop_insertions_chain_slot", "snapshot_chain_id", "slot_index"),
        Index("idx_snapshot_loop_insertions_chain_loop", "snapshot_chain_id", "loop_id"),
    )


class SnapshotRouting(Base):
    """Per-snapshot routing state."""
    __tablename__ = "snapshot_routing"

    id = Column(Integer, primary_key=True)
    snapshot_id = Column(Integer, ForeignKey("snapshots.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    mode = Column(String(32), default="parallel_blend")
    active_channel_key = Column(String(64), nullable=True)
    blend_positions = Column(JSON, default=dict)
    morph_position = Column(Float, default=0.5)
    morph_source_channel_key = Column(String(64), nullable=True)
    morph_target_channel_key = Column(String(64), nullable=True)
    series_order = Column(JSON, default=list)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    snapshot = relationship("Snapshot", back_populates="routing")


class SnapshotMidiMap(Base):
    """Flexible per-snapshot MIDI map stored as JSON entries."""
    __tablename__ = "snapshot_midi_maps"

    id = Column(Integer, primary_key=True)
    snapshot_id = Column(Integer, ForeignKey("snapshots.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    entries = Column(JSON, default=list)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    snapshot = relationship("Snapshot", back_populates="midi_map")


class SnapshotDeployment(Base):
    """Cluster deployment state for a whole snapshot."""
    __tablename__ = "snapshot_deployments"

    id = Column(Integer, primary_key=True)
    snapshot_id = Column(Integer, ForeignKey("snapshots.id", ondelete="CASCADE"), nullable=False, index=True)
    primary_node_id = Column(String(128), nullable=False)
    standby_node_ids = Column(JSON, default=list)
    deployment_status = Column(String(20), default="deploying")
    assignment_strategy = Column(String(20), default="manual")
    redundancy_enabled = Column(Boolean, default=False)
    deployed_at = Column(DateTime, default=_utcnow)
    last_failover_time = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    snapshot = relationship("Snapshot", back_populates="deployments")
    history = relationship(
        "SnapshotDeploymentHistory",
        back_populates="deployment",
        cascade="all, delete-orphan",
        order_by="SnapshotDeploymentHistory.created_at",
    )

    __table_args__ = (
        Index("idx_snapshot_deployments_snapshot", "snapshot_id"),
        Index("idx_snapshot_deployments_primary_node", "primary_node_id"),
    )


class SnapshotDeploymentHistory(Base):
    """Audit history for snapshot deployment and failover actions."""
    __tablename__ = "snapshot_deployment_history"

    id = Column(Integer, primary_key=True)
    snapshot_deployment_id = Column(Integer, ForeignKey("snapshot_deployments.id", ondelete="CASCADE"), nullable=False, index=True)
    snapshot_id = Column(Integer, ForeignKey("snapshots.id", ondelete="CASCADE"), nullable=False, index=True)
    from_node_id = Column(String(128), nullable=True)
    to_node_id = Column(String(128), nullable=False)
    action = Column(String(32), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=_utcnow)

    deployment = relationship("SnapshotDeployment", back_populates="history")
    snapshot = relationship("Snapshot")

    __table_args__ = (
        Index("idx_snapshot_deployment_history_snapshot", "snapshot_id"),
        Index("idx_snapshot_deployment_history_to_node", "to_node_id"),
    )


class SnapshotRevision(Base):
    """Explicit-save version history entries for a snapshot."""
    __tablename__ = "snapshot_revisions"

    id = Column(Integer, primary_key=True)
    snapshot_id = Column(Integer, ForeignKey("snapshots.id", ondelete="CASCADE"), nullable=False, index=True)
    revision_number = Column(Integer, nullable=False)
    snapshot_revision = Column(String(64), nullable=True, index=True)
    summary = Column(Text, nullable=False)
    summary_metadata = Column(JSON, default=dict, nullable=False)
    payload = Column(JSON, default=dict, nullable=False)
    document = Column(JSON, default=dict, nullable=False)
    saved_at = Column(DateTime, default=_utcnow, nullable=False)

    snapshot = relationship("Snapshot", back_populates="revisions")

    __table_args__ = (
        Index("idx_snapshot_revisions_snapshot_revision_number", "snapshot_id", "revision_number", unique=True),
        Index("idx_snapshot_revisions_snapshot_saved_at", "snapshot_id", "saved_at"),
    )


class StateAuthorityAsset(Base):
    """Durable registry for content-addressed State Authority graph assets."""
    __tablename__ = "state_authority_assets"

    id = Column(Integer, primary_key=True)
    asset_hash = Column(String(71), nullable=False, unique=True, index=True)
    source_path = Column(String(2048), nullable=False)
    file_name = Column(String(512), nullable=False)
    size_bytes = Column(Integer, nullable=False, default=0)
    asset_type = Column(String(128), nullable=False)
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    __table_args__ = (
        Index("idx_state_authority_assets_asset_hash", "asset_hash", unique=True),
    )


class SnapshotNodeLiveState(Base):
    """Authoritative per-node runtime live-state projection."""
    __tablename__ = "snapshot_node_live_state"

    id = Column(Integer, primary_key=True)
    node_id = Column(String(128), nullable=False, unique=True, index=True)
    seq = Column(Integer, nullable=False, default=0)
    state = Column(String(32), nullable=False, default="stopped")
    snapshot_id = Column(Integer, ForeignKey("snapshots.id", ondelete="SET NULL"), nullable=True, index=True)
    snapshot_revision = Column(String(64), nullable=True, index=True)
    triggered_by = Column(String(32), nullable=True)
    last_successful_request_id = Column(String(64), nullable=True, index=True)
    failure_reason = Column(Text, nullable=True)
    live_snapshot_payload = Column(JSON, default=dict)
    runtime_metrics = Column(JSON, default=dict)
    last_requested_at = Column(DateTime, nullable=True)
    last_runtime_event_at = Column(DateTime, nullable=True)
    last_transition_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    snapshot = relationship("Snapshot")

    __table_args__ = (
        Index("idx_snapshot_node_live_state_snapshot_state", "snapshot_id", "state"),
    )


class SnapshotActivationEvent(Base):
    """Durable audit log for snapshot activation requests and outcomes."""
    __tablename__ = "snapshot_activation_events"

    id = Column(Integer, primary_key=True)
    node_id = Column(String(128), nullable=False, index=True)
    request_id = Column(String(64), nullable=False, unique=True, index=True)
    snapshot_id = Column(Integer, ForeignKey("snapshots.id", ondelete="SET NULL"), nullable=True, index=True)
    snapshot_name = Column(String(255), nullable=True)
    snapshot_revision = Column(String(64), nullable=True, index=True)
    triggered_by = Column(String(32), nullable=True)
    requested_at = Column(DateTime, nullable=False, default=_utcnow)
    confirmed_live_at = Column(DateTime, nullable=True)
    outcome = Column(String(32), nullable=False, default="requested")
    failure_reason = Column(Text, nullable=True)
    activation_latency_ms = Column(Float, nullable=True)
    runtime_metrics = Column(JSON, default=dict)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    snapshot = relationship("Snapshot")

    __table_args__ = (
        Index("idx_snapshot_activation_events_node_requested", "node_id", "requested_at"),
        Index("idx_snapshot_activation_events_snapshot_outcome", "snapshot_id", "outcome"),
    )


class TesiraLoopTemplate(Base):
    """Tag-mapped Tesira template metadata for loop orchestration."""
    __tablename__ = "tesira_loop_templates"

    id = Column(Integer, primary_key=True)
    template_id = Column(String(128), unique=True, nullable=False, index=True)
    tesira_device_id = Column(String(128), nullable=False, index=True)

    stream_in_tags = Column(JSON, default=list)
    stream_out_tags = Column(JSON, default=list)
    crosspoint_tags = Column(JSON, default=list)
    input_router_tag = Column(String(255), nullable=True)
    output_router_tag = Column(String(255), nullable=True)
    meter_tags = Column(JSON, default=list)
    bypass_tags = Column(JSON, default=list)
    channel_map_policy = Column(String(64), default="direct")

    validation_status = Column(String(32), default="unknown")
    validation_error = Column(Text, nullable=True)

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    __table_args__ = (
        Index("idx_tesira_loop_templates_device", "tesira_device_id"),
    )


class MIDIMappingGroup(Base):
    """Logical grouping for MIDI mappings (e.g., 'Expression Pedal', 'Faders')."""
    __tablename__ = "midi_mapping_groups"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    color = Column(String(7))  # Hex color for UI (e.g., '#ff5733')
    display_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=_utcnow)

    # Relationships
    mappings = relationship("MIDIMapping", back_populates="group")


class MIDIMapping(Base):
    """Enhanced MIDI CC to plugin parameter mapping with per-chain scope."""
    __tablename__ = "midi_mappings"

    id = Column(Integer, primary_key=True)

    # Source MIDI
    channel = Column(Integer, nullable=False)  # 0=omni, 1-16=specific channel
    cc = Column(Integer, nullable=False)       # 0-127

    # Target (Per-Chain Scope)
    chain_id = Column(Integer, ForeignKey("chains.id", ondelete="CASCADE"), nullable=True)
    target_plugin_uri = Column(String(255))  # No FK - plugins discovered at runtime
    target_plugin_position = Column(Integer, nullable=True)
    target_param_index = Column(Integer)
    target_param_symbol = Column(String(100))  # Parameter symbol for name-based access

    # Value Mapping
    min_val = Column(Float, default=0.0)
    max_val = Column(Float, default=1.0)
    curve_type = Column(String(20), default="linear")  # linear, logarithmic, exponential, s_curve
    invert = Column(Boolean, default=False)

    # MIDI Feedback (for controller sync)
    feedback_enabled = Column(Boolean, default=True)
    feedback_cc = Column(Integer)  # CC to send back (defaults to same CC if None)

    # Metadata
    name = Column(String(255))  # User-friendly display name
    group_id = Column(Integer, ForeignKey("midi_mapping_groups.id", ondelete="SET NULL"), nullable=True)
    is_learned = Column(Boolean, default=False)
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Relationships
    chain = relationship("Chain", foreign_keys=[chain_id])
    group = relationship("MIDIMappingGroup", back_populates="mappings")


class MIDICommand(Base):
    """MIDI commands for chain switching and plugin control."""
    __tablename__ = "midi_commands"

    id = Column(Integer, primary_key=True)

    # Command Trigger
    command_type = Column(String(20), nullable=False)  # program_change, note_on, cc_toggle
    channel = Column(Integer, default=0)  # 0=omni, 1-16=specific
    data1 = Column(Integer, nullable=False)  # PC number, Note number, or CC number
    data2 = Column(Integer)  # Velocity threshold, CC value threshold (optional)

    # Action
    action_type = Column(String(30), nullable=False)  # activate_chain, toggle_chain, toggle_plugin, set_routing
    target_chain_id = Column(Integer, ForeignKey("chains.id", ondelete="CASCADE"), nullable=True)
    target_plugin_uri = Column(String(255))
    target_plugin_position = Column(Integer, nullable=True)
    action_data = Column(JSON, default=dict)  # Extra action parameters

    # Metadata
    name = Column(String(255))
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_utcnow)

    # Relationships
    target_chain = relationship("Chain", foreign_keys=[target_chain_id])


class MIDIRoutingRule(Base):
    """MIDI-controlled signal routing within chains."""
    __tablename__ = "midi_routing_rules"

    id = Column(Integer, primary_key=True)

    # Trigger
    channel = Column(Integer, default=0)  # 0=omni
    cc = Column(Integer, nullable=False)

    # Routing Change
    chain_id = Column(Integer, ForeignKey("chains.id", ondelete="CASCADE"))
    routing_type = Column(String(30))  # parallel_mix, serial_order, bypass_group
    routing_data = Column(JSON, default=dict)

    # Metadata
    name = Column(String(255))
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_utcnow)

    # Relationships
    chain = relationship("Chain", foreign_keys=[chain_id])


class MIDIDeviceConfig(Base):
    """Persistent MIDI device configuration."""
    __tablename__ = "midi_device_configs"

    id = Column(Integer, primary_key=True)
    device_name = Column(String(255), nullable=False, unique=True)
    device_type = Column(String(20))  # input, output
    is_enabled = Column(Boolean, default=True)
    auto_connect = Column(Boolean, default=True)
    channel_filter = Column(Integer)  # None = all channels
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class MIDIPreset(Base):
    """Complete MIDI configuration preset."""
    __tablename__ = "midi_presets"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)

    # Snapshot of all mappings, commands, routing rules
    mappings_snapshot = Column(JSON, default=list)
    commands_snapshot = Column(JSON, default=list)
    routing_rules_snapshot = Column(JSON, default=list)
    device_configs_snapshot = Column(JSON, default=list)

    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class ChainMIDIConfig(Base):
    """Maps Program Change numbers to chains for MIDI chain switching."""
    __tablename__ = "chain_midi_configs"

    id = Column(Integer, primary_key=True)
    chain_id = Column(Integer, ForeignKey("chains.id", ondelete="CASCADE"), unique=True)
    program_number = Column(Integer, nullable=False)  # 0-127
    bank_msb = Column(Integer, default=0)  # Bank Select MSB (CC#0) for >128 chains
    bank_lsb = Column(Integer, default=0)  # Bank Select LSB (CC#32)
    send_pc_on_activate = Column(Boolean, default=True)  # Send PC back to sync controller
    created_at = Column(DateTime, default=_utcnow)

    # Relationships
    chain = relationship("Chain", foreign_keys=[chain_id])


class ExpressionAssignment(Base):
    """Expression pedal and performance-mode mapping assignments."""
    __tablename__ = "expression_assignments"

    id = Column(String(64), primary_key=True)
    cc = Column(Integer, nullable=False)
    channel = Column(Integer, nullable=False, default=0)  # 0 = omni, 1..16 = specific
    cc_min = Column(Integer, nullable=False, default=0)
    cc_max = Column(Integer, nullable=False, default=127)
    param_id = Column(String(255), nullable=False)
    param_label = Column(String(255), nullable=False, default="")
    out_min = Column(Float, nullable=False, default=0.0)
    out_max = Column(Float, nullable=False, default=1.0)
    curve = Column(String(32), nullable=False, default="linear")
    custom_curve = Column(JSON, default=list)
    active = Column(Boolean, nullable=False, default=True)
    source = Column(String(64), nullable=False, default="user")  # user | performance_mode
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    __table_args__ = (
        Index("idx_expression_assignments_source_active", "source", "active"),
        Index("idx_expression_assignments_cc_channel", "cc", "channel"),
    )


class SystemConfig(Base):
    """Key-value system configuration store."""
    __tablename__ = "system_config"

    id = Column(Integer, primary_key=True)
    key = Column(String(255), unique=True, nullable=False)
    value = Column(Text, nullable=False)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class PluginPerformanceLog(Base):
    """Historical plugin CPU performance data."""
    __tablename__ = "plugin_performance_log"

    id = Column(Integer, primary_key=True)
    plugin_uri = Column(String(255), nullable=False)  # No FK - plugins are discovered at runtime from LV2
    plugin_name = Column(String(255), nullable=False)
    chain_id = Column(Integer, ForeignKey("chains.id", ondelete="CASCADE"))

    # Performance metrics
    avg_time_us = Column(Float, nullable=False)  # Average processing time (microseconds)
    max_time_us = Column(Float, nullable=False)  # Peak processing time (microseconds)
    cpu_percent = Column(Float, nullable=False)  # CPU percentage vs deadline
    call_count = Column(Integer, default=0)       # Number of process() calls

    # Buffer configuration
    sample_rate = Column(Integer, nullable=False)
    buffer_size = Column(Integer, nullable=False)
    deadline_us = Column(Float, nullable=False)

    # Timestamp
    timestamp = Column(DateTime, default=_utcnow, nullable=False)

    # Relationships
    chain = relationship("Chain", foreign_keys=[chain_id])


# --- IMPULSE RESPONSE AND NAM MODELS ---

class ImpulseResponse(Base):
    """Impulse Response file metadata and analysis."""
    __tablename__ = "impulse_responses"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    file_path = Column(String(512), unique=True, nullable=False)
    file_hash = Column(String(64), unique=True, nullable=False)

    # Audio properties
    sample_rate = Column(Integer, default=48000)
    channels = Column(Integer, default=1)
    duration_seconds = Column(Float, default=0.0)
    length_samples = Column(Integer, default=0)

    # Analysis results
    peak_amplitude = Column(Float, default=0.0)
    rms_level = Column(Float, default=0.0)
    rt60 = Column(Float, nullable=True)  # Reverb time
    early_decay_time = Column(Float, nullable=True)
    peak_location_ms = Column(Float, nullable=True)
    estimated_characteristics = Column(Boolean, default=True)

    # Categorization
    category = Column(String(100), default="Uncategorized")
    category_id = Column(Integer, ForeignKey("ir_categories.id"), nullable=True)
    subcategory = Column(String(100), nullable=True)
    library = Column(String(100), default="user")
    license = Column(String(100), default="Unknown")

    # Metadata
    source_url = Column(String(512), nullable=True)
    author = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    tags = Column(JSON, default=list)

    # User management
    is_favorite = Column(Boolean, default=False)
    rating = Column(Integer, nullable=True)  # 1-5 stars

    # Timestamps
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Relationship
    category_obj = relationship("IRCategory", back_populates="impulse_responses")


class NAMModel(Base):
    """Neural Amp Modeler (NAM) model metadata."""
    __tablename__ = "nam_models"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    file_path = Column(String(512), unique=True, nullable=False)
    file_hash = Column(String(64), unique=True, nullable=False)
    file_size = Column(Integer, default=0)

    # Model properties
    model_type = Column(String(100), default="unknown")  # WaveNet, LSTM, etc.
    sample_rate = Column(Integer, default=48000)
    input_gain = Column(Float, default=0.0)
    output_gain = Column(Float, default=0.0)

    # Categorization
    category = Column(String(100), default="Amp Model")
    amp_type = Column(String(100), nullable=True)  # Clean, Crunch, High Gain, etc.
    amp_name = Column(String(255), nullable=True)  # Original amp being modeled

    # Metadata
    author = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    tags = Column(JSON, default=list)
    license = Column(String(100), default="Unknown")
    source_url = Column(String(512), nullable=True)

    # User management
    is_favorite = Column(Boolean, default=False)
    rating = Column(Integer, nullable=True)  # 1-5 stars

    # Featured amp tracking
    is_featured = Column(Boolean, default=False)  # Featured in NAM chooser
    featured_position = Column(Integer, nullable=True)  # Sort order (0-20 for top 21)
    source_tone3000_id = Column(String(255), nullable=True)  # TONE3000 model ID
    source_tone3000_name = Column(String(255), nullable=True)  # TONE3000 model name

    # Timestamps
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


# =============================================================================
# TESIRA FORTE AVB — PRESET INTERLOCK RULES
# =============================================================================

class TesiraBlockDeclaration(Base):
    """Persisted DSP block declarations discovered/provisioned for a Tesira device."""
    __tablename__ = "tesira_block_declarations"

    id = Column(Integer, primary_key=True)
    device_id = Column(String(128), nullable=False, index=True)
    instance_tag = Column(String(255), nullable=False, index=True)
    block_type = Column(String(64), nullable=False, default="UNKNOWN")
    channel_count = Column(Integer, nullable=False, default=1)
    parameter_map = Column(JSON, default=dict)
    is_probed = Column(Boolean, default=True)
    last_probed_at = Column(DateTime, default=_utcnow)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    __table_args__ = (
        Index("idx_tesira_block_decl_device_tag_unique", "device_id", "instance_tag", unique=True),
        Index("idx_tesira_block_decl_type", "block_type"),
    )


class TesiraSceneSnapshot(Base):
    """Stored DSP scene snapshots for capture/recall workflows."""
    __tablename__ = "tesira_scene_snapshots"

    id = Column(Integer, primary_key=True)
    scene_id = Column(String(128), nullable=False, unique=True, index=True)
    device_id = Column(String(128), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    block_states = Column(JSON, default=dict)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    __table_args__ = (
        Index("idx_tesira_scene_device_created", "device_id", "created_at"),
    )


class TesiraLayoutArtifact(Base):
    """Catalog entry for a precompiled Tesira layout artifact."""
    __tablename__ = "tesira_layout_artifacts"

    id = Column(Integer, primary_key=True)
    layout_id = Column(String(128), nullable=False, index=True)
    version = Column(String(64), nullable=False, default="1.0.0")
    name = Column(String(255), nullable=False, default="Unnamed Layout")
    device_family = Column(String(128), nullable=False, default="UNKNOWN")
    channel_profile = Column(String(128), nullable=True)
    required_firmware = Column(String(64), nullable=True)
    checksum = Column(String(128), nullable=False)
    artifact_uri = Column(String(1024), nullable=True)
    instance_tag_map = Column(JSON, default=dict)
    feature_flags = Column(JSON, default=list)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    __table_args__ = (
        Index("idx_tesira_layout_artifact_unique", "layout_id", "version", unique=True),
        Index("idx_tesira_layout_family", "device_family"),
        Index("idx_tesira_layout_active", "is_active"),
    )


class TesiraDesignWorkspace(Base):
    """Persisted MAP2-native Tesira design graph workspace."""
    __tablename__ = "tesira_design_workspaces"

    id = Column(Integer, primary_key=True)
    design_id = Column(String(128), nullable=False, unique=True, index=True)
    device_id = Column(String(128), nullable=False, index=True)
    name = Column(String(255), nullable=False, default="Untitled Design")
    description = Column(Text, nullable=True)
    graph = Column(JSON, default=dict)
    is_template = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    compile_status = Column(String(32), nullable=False, default="UNCOMPILED")
    compile_revision = Column(Integer, nullable=False, default=0)
    compiled_graph_hash = Column(String(128), nullable=True)
    compile_diagnostics = Column(JSON, default=dict)
    last_compiled_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    __table_args__ = (
        Index("idx_tesira_design_device_created", "device_id", "created_at"),
        Index("idx_tesira_design_device_active", "device_id", "is_active"),
    )


class TesiraDeploymentJob(Base):
    """Deployment transaction state for Tesira layout orchestration."""
    __tablename__ = "tesira_deployment_jobs"

    id = Column(Integer, primary_key=True)
    job_id = Column(String(64), nullable=False, unique=True, index=True)
    device_id = Column(String(128), nullable=False, index=True)
    layout_id = Column(String(128), nullable=False)
    layout_version = Column(String(64), nullable=False, default="1.0.0")
    rollback_layout_id = Column(String(128), nullable=True)
    rollback_layout_version = Column(String(64), nullable=True)
    requested_by = Column(String(128), nullable=True)
    dry_run = Column(Boolean, default=False)
    status = Column(String(32), nullable=False, default="queued")
    stage = Column(String(32), nullable=False, default="queued")
    sagevue_job_id = Column(String(128), nullable=True)
    error_detail = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    __table_args__ = (
        Index("idx_tesira_deploy_device_created", "device_id", "created_at"),
        Index("idx_tesira_deploy_status", "status"),
    )


class TesiraDeploymentEvent(Base):
    """Timeline event emitted during Tesira deployment orchestration."""
    __tablename__ = "tesira_deployment_events"

    id = Column(Integer, primary_key=True)
    job_id = Column(String(64), nullable=False, index=True)
    sequence = Column(Integer, nullable=False)
    stage = Column(String(32), nullable=False)
    status = Column(String(32), nullable=False)
    message = Column(Text, nullable=False)
    payload = Column(JSON, default=dict)
    created_at = Column(DateTime, default=_utcnow)

    __table_args__ = (
        Index("idx_tesira_deploy_event_job_seq_unique", "job_id", "sequence", unique=True),
    )


class TesiraInterlockRule(Base):
    """
    Maps a MAP2 preset ID to a Tesira device preset index.
    When the MAP2 preset is recalled, the Tesira preset is automatically recalled.
    """
    __tablename__ = "tesira_interlock_rules"

    id = Column(Integer, primary_key=True)
    map2_preset_id = Column(Integer, nullable=False, index=True)
    tesira_device_id = Column(String(64), nullable=False)
    tesira_preset_index = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=_utcnow)


class IRCategory(Base):
    """IR category taxonomy (hierarchical)."""
    __tablename__ = "ir_categories"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)
    parent_id = Column(Integer, ForeignKey("ir_categories.id"))
    description = Column(Text)
    icon = Column(String(50))
    display_order = Column(Integer, default=0)

    # Hierarchical relationship
    parent = relationship("IRCategory", remote_side=[id], backref="children")
    impulse_responses = relationship("ImpulseResponse", back_populates="category_obj")


# =============================================================================
# COMMAND HISTORY - Persistent Undo/Redo System
# =============================================================================

class CommandHistory(Base):
    """Persistent command history for undo/redo operations.

    Stores state snapshots before each mutating operation, allowing
    recovery even after application restart or power failure.
    """
    __tablename__ = "command_history"

    id = Column(Integer, primary_key=True)
    session_id = Column(String(36), nullable=False, index=True)  # UUID for session grouping
    sequence = Column(Integer, nullable=False)  # Order within session

    # Command metadata
    command_type = Column(String(100), nullable=False)  # e.g., "chain_create", "plugin_add"
    description = Column(String(500), nullable=False)  # Human-readable description

    # State snapshots (JSON)
    state_before = Column(Text, nullable=False)  # State before command executed
    state_after = Column(Text, nullable=False)   # State after command executed

    # Affected entities for partial restore
    affected_chain_ids = Column(JSON, default=list)  # List of chain IDs modified
    affected_plugin_uris = Column(JSON, default=list)  # List of plugin URIs modified

    # Status tracking
    is_undone = Column(Boolean, default=False)  # True if command has been undone
    executed_at = Column(DateTime, default=_utcnow, nullable=False)
    undone_at = Column(DateTime, nullable=True)

    # Index for efficient queries
    __table_args__ = (
        # Composite index for session-based queries
        {"sqlite_autoincrement": True},
    )


class SessionBackup(Base):
    """Automatic session backups with versioning.

    Stores periodic snapshots of the entire session state for recovery.
    """
    __tablename__ = "session_backups"

    id = Column(Integer, primary_key=True)
    session_name = Column(String(255), nullable=False)
    version = Column(Integer, nullable=False, default=1)  # Incrementing version number

    # Full session state (JSON)
    chains_snapshot = Column(Text, nullable=False)  # All chains and their plugins
    presets_snapshot = Column(Text, nullable=False)  # All presets
    midi_mappings_snapshot = Column(Text, nullable=False)  # All MIDI mappings
    automation_snapshot = Column(Text, default="{}")  # Automation lanes

    # Backup metadata
    backup_type = Column(String(50), default="auto")  # "auto", "manual", "pre_change"
    trigger_reason = Column(String(255))  # What triggered this backup
    file_size_bytes = Column(Integer)  # Estimated size for cleanup

    # Timestamps
    created_at = Column(DateTime, default=_utcnow, nullable=False)

    # Composite unique constraint
    __table_args__ = (
        # Index for finding latest backup
        {"sqlite_autoincrement": True},
    )


# =============================================================================
# FLOW SNAPSHOTS - Complete GridFlow State Capture
# =============================================================================

class FlowSnapshot(Base):
    """Flow Snapshot - complete GridFlowPage state capture.

    Stores the entire flow configuration including slots, routing,
    and per-slot chain state for instant recall via MIDI Program Change.
    """
    __tablename__ = "flow_snapshots"

    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    tags = Column(JSON, default=list)

    # MIDI Program Change mapping (0-127, unique)
    program_number = Column(Integer, nullable=True, unique=True)
    bank_msb = Column(Integer, default=0)  # For >128 snapshots
    bank_lsb = Column(Integer, default=0)

    # Complete snapshot data (JSON blob)
    # Contains: flowSlots, routing, activeFlowIndex, chains
    snapshot_data = Column(Text, nullable=False)

    # State
    is_active = Column(Boolean, default=False)  # Currently loaded snapshot
    display_order = Column(Integer, default=0)  # UI ordering

    # User metadata
    is_favorite = Column(Boolean, default=False)

    # Timestamps
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


# =============================================================================
# AUTOMATION SYSTEM - Persistent Automation Data
# =============================================================================

class AutomationLane(Base):
    """Automation lane for a single parameter.

    Stores automation data persistently for power-failure resilience.
    """
    __tablename__ = "automation_lanes"

    id = Column(Integer, primary_key=True)

    # Target identification
    parameter_id = Column(String(255), unique=True, nullable=False)  # plugin_uri:param_index
    plugin_uri = Column(String(255), nullable=False)
    plugin_position = Column(Integer, nullable=True)
    param_index = Column(Integer, nullable=False)
    param_name = Column(String(255))  # Cached parameter name

    # Automation points (JSON array of {time, value, curve})
    points = Column(Text, default="[]")  # JSON array

    # Lane settings
    enabled = Column(Boolean, default=True)
    modulation_source = Column(String(50), default="timeline")  # timeline, lfo, envelope, midi, audio

    # LFO settings (when modulation_source="lfo")
    lfo_rate_hz = Column(Float, default=1.0)
    lfo_depth = Column(Float, default=0.5)  # 0.0 to 1.0
    lfo_waveform = Column(String(20), default="sine")  # sine, triangle, square, saw, random
    lfo_phase = Column(Float, default=0.0)  # 0.0 to 1.0
    lfo_sync_to_tempo = Column(Boolean, default=False)
    lfo_tempo_division = Column(String(20), default="1/4")  # 1/1, 1/2, 1/4, 1/8, etc.

    # Envelope follower settings (when modulation_source="envelope")
    env_input_source = Column(String(50), default="main_input")  # main_input, sidechain, plugin_output
    env_attack_ms = Column(Float, default=10.0)
    env_release_ms = Column(Float, default=100.0)
    env_threshold_db = Column(Float, default=-20.0)
    env_sensitivity = Column(Float, default=1.0)

    # Loop settings
    loop_enabled = Column(Boolean, default=False)
    loop_start = Column(Float, default=0.0)
    loop_end = Column(Float, default=4.0)

    # Timestamps
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class MIDILearnState(Base):
    """Persistent MIDI learn state for resuming learn mode after restart."""
    __tablename__ = "midi_learn_state"

    id = Column(Integer, primary_key=True)

    # Target being learned
    target_plugin_uri = Column(String(255), nullable=False)
    target_plugin_position = Column(Integer, nullable=True)
    target_param_index = Column(Integer, nullable=False)
    target_param_name = Column(String(255))

    # Learn settings
    started_at = Column(DateTime, default=_utcnow)
    timeout_seconds = Column(Float, default=30.0)

    # Completion state
    completed = Column(Boolean, default=False)
    learned_channel = Column(Integer, nullable=True)
    learned_cc = Column(Integer, nullable=True)
    completed_at = Column(DateTime, nullable=True)


# =============================================================================
# CLUSTER FLOW ASSIGNMENTS - Multi-Node Management
# =============================================================================

class FlowAssignment(Base):
    """Maps a flow to a specific node (primary or standby)."""
    __tablename__ = "flow_assignments"

    id = Column(Integer, primary_key=True)
    flow_id = Column(String(64), unique=True, nullable=False)
    chain_id = Column(Integer, nullable=False)
    assigned_node_id = Column(String(128), nullable=False)
    assignment_type = Column(String(20), default="primary")  # primary | standby
    assignment_strategy = Column(String(20), default="manual")  # manual | pinned

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    __table_args__ = (
        Index("idx_flow_assignments_node_id", "assigned_node_id"),
        Index("idx_flow_assignments_flow_id", "flow_id"),
    )


class FlowDeployment(Base):
    """Tracks deployment status for a flow across the cluster."""
    __tablename__ = "flow_deployments"

    id = Column(Integer, primary_key=True)
    flow_id = Column(String(64), nullable=False)
    primary_node_id = Column(String(128), nullable=False)
    standby_node_ids = Column(JSON, default=list)
    deployment_status = Column(String(20), default="deploying")  # deploying | active | failed
    deployment_timestamp = Column(DateTime, default=_utcnow)
    last_failover_time = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)

    __table_args__ = (
        Index("idx_flow_deployments_flow_id", "flow_id"),
        Index("idx_flow_deployments_primary_node", "primary_node_id"),
    )


class NodeCapability(Base):
    """Cached node hardware capabilities for placement decisions."""
    __tablename__ = "node_capabilities"

    id = Column(Integer, primary_key=True)
    node_id = Column(String(128), unique=True, nullable=False)
    cpu_cores = Column(Integer, default=0)
    memory_gb = Column(Integer, default=0)
    has_gpu = Column(Boolean, default=False)
    gpu_name = Column(String(255), nullable=True)
    last_updated = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class SpecialSettings(Base):
    """
    Special mode settings for advanced features and plugin visibility.
    
    Singleton table (id always 1) that stores:
    - Special mode enabled/disabled state
    - List of hidden native plugins (JSON array of URIs)
    - Advanced menu location preference
    - Top navigation pinned routes
    - Ordered landing-page launcher tile placements
    - Cluster replication metadata (version, timestamp, node_id)
    
    In cluster mode, changes replicate via Raft consensus.
    """
    __tablename__ = "special_settings"

    id = Column(Integer, primary_key=True, default=1)  # Singleton
    enabled = Column(Boolean, nullable=False, default=False)
    hidden_plugins = Column(JSON, default=list)  # List of plugin URIs to hide
    menu_location = Column(String(20), default="hidden")  # "hidden" | "mobile-only"
    pinned_routes = Column(JSON, default=list)
    landing_tiles = Column(JSON, default=list)
    snapshot_setlist_mode = Column(Boolean, nullable=False, default=False)
    snapshot_setlist_order = Column(JSON, default=list)
    last_active_node = Column(String(128), nullable=True)
    
    # Cluster replication metadata
    version = Column(Integer, default=1)  # Incremented on each update
    last_updated = Column(DateTime, default=_utcnow, onupdate=_utcnow)
    updated_by_node = Column(String(128), nullable=True)  # Node ID that made the change
    raft_log_index = Column(Integer, nullable=True)  # Audit trail: Raft log entry index
    
    __table_args__ = (
        # Ensure singleton: only one row with id=1
        Index("idx_special_settings_singleton", "id", unique=True),
    )


class FlowDeploymentHistory(Base):
    """Audit log of flow deployment events."""
    __tablename__ = "flow_deployment_history"

    id = Column(Integer, primary_key=True)
    flow_id = Column(String(64), nullable=False)
    from_node_id = Column(String(128), nullable=True)
    to_node_id = Column(String(128), nullable=False)
    action = Column(String(20), nullable=False)  # deployed | moved | failed_over
    timestamp = Column(DateTime, default=_utcnow)
    notes = Column(Text, nullable=True)

    __table_args__ = (
        Index("idx_flow_deployment_history_flow_id", "flow_id"),
        Index("idx_flow_deployment_history_to_node", "to_node_id"),
    )


# =============================================================================
# AVB SRP/MSRP ADMISSION AUDIT LOG
# =============================================================================

class SrpAdmissionLog(Base):
    """Persistent SRP/MSRP admission attempt log."""
    __tablename__ = "srp_admission_logs"

    id = Column(Integer, primary_key=True)
    admission_id = Column(String(64), nullable=False, unique=True)

    # Admission decision
    decision = Column(String(16), nullable=False)  # allowed | denied | bypass | error
    reason_code = Column(String(64), nullable=False)
    reason = Column(Text, nullable=False)
    remediation = Column(JSON, default=list)

    # Daemon/transport context
    daemon_type = Column(String(16), nullable=True)  # mrpd | msrpd | none
    daemon_socket = Column(String(255), nullable=True)
    raw_response = Column(Text, nullable=True)

    # Request context
    endpoint = Column(String(128), nullable=False)
    stream_id = Column(String(255), nullable=True)
    talker_id = Column(String(128), nullable=True)
    listener_id = Column(String(128), nullable=True)
    reservation_id = Column(String(128), nullable=True)
    request_metadata = Column(JSON, default=dict)

    # Timing
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    completed_at = Column(DateTime, default=_utcnow, nullable=False)

    # Release tracking for reservation lifecycle
    released = Column(Boolean, default=False, nullable=False)
    release_status = Column(String(16), nullable=True)  # released | failed
    release_reason = Column(Text, nullable=True)
    release_response = Column(Text, nullable=True)
    release_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("idx_srp_admission_logs_created_at", "created_at"),
        Index("idx_srp_admission_logs_decision_created", "decision", "created_at"),
        Index("idx_srp_admission_logs_endpoint_created", "endpoint", "created_at"),
        Index("idx_srp_admission_logs_reservation", "reservation_id"),
    )


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

async def get_or_create_system_config(session: AsyncSession, key: str, default_value: str = "") -> str:
    """Get a system config value, creating it with default if not exists."""
    from sqlalchemy import select
    result = await session.execute(
        select(SystemConfig).where(SystemConfig.key == key)
    )
    config = result.scalar_one_or_none()
    if config:
        return config.value

    # Create with default
    new_config = SystemConfig(key=key, value=default_value)
    session.add(new_config)
    await session.flush()
    return default_value


async def set_system_config(session: AsyncSession, key: str, value: str) -> None:
    """Set a system config value, creating or updating as needed."""
    from sqlalchemy import select
    result = await session.execute(
        select(SystemConfig).where(SystemConfig.key == key)
    )
    config = result.scalar_one_or_none()
    if config:
        config.value = value
        config.updated_at = _utcnow()
    else:
        session.add(SystemConfig(key=key, value=value))
    await session.flush()

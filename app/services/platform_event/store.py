"""SQLite-backed persistence for canonical PlatformEvents."""

from __future__ import annotations

import json
import logging
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import RLock

from app.config import config_get
from app.utils.singleton import Singleton

from .envelope import PlatformEvent

logger = logging.getLogger(__name__)

DEFAULT_PLATFORM_EVENT_DB_PATH = "/var/lib/map2/platform-events.db"
DEFAULT_LEGACY_CLUSTER_EVENT_DB_PATH = "/var/lib/map2/cluster-events.db"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _coerce_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _resolve_path(
    *,
    configured: str | Path | None,
    config_key: str,
    env_var: str,
    default: str,
) -> Path:
    if configured is not None:
        return Path(configured)
    env_value = os.getenv(env_var)
    if env_value:
        return Path(env_value)
    return Path(str(config_get(config_key, default) or default))


class PlatformEventStore(Singleton):
    """Owns canonical PlatformEvent persistence, replay, ack state, and retention."""

    def __init__(
        self,
        *,
        db_path: str | Path | None = None,
        legacy_db_path: str | Path | None = None,
        retention_days: int | None = None,
    ) -> None:
        super().__init__()
        self.db_path = _resolve_path(
            configured=db_path,
            config_key="platform_event.db_path",
            env_var="PLATFORM_EVENT_DB_PATH",
            default=DEFAULT_PLATFORM_EVENT_DB_PATH,
        )
        self.legacy_db_path = _resolve_path(
            configured=legacy_db_path,
            config_key="platform_event.legacy_db_path",
            env_var="PLATFORM_EVENT_LEGACY_DB_PATH",
            default=DEFAULT_LEGACY_CLUSTER_EVENT_DB_PATH,
        )
        configured_retention = config_get("platform_event.retention_days", 7)
        self.retention_days = max(1, int(retention_days if retention_days is not None else configured_retention or 7))
        self._lock = RLock()
        self._initialize()

    def _initialize(self) -> None:
        with self._lock:
            self.db_path.parent.mkdir(parents=True, exist_ok=True)
            should_migrate = self._should_migrate_legacy_db()
            self._init_db()
            if should_migrate:
                migrated = self._migrate_legacy_events()
                logger.info(
                    "Migrated %d PlatformEvent rows from %s to %s",
                    migrated,
                    self.legacy_db_path,
                    self.db_path,
                )
            self._cleanup_old_events_locked(self.retention_days)

    def _should_migrate_legacy_db(self) -> bool:
        return (
            self.db_path != self.legacy_db_path
            and not self.db_path.exists()
            and self.legacy_db_path.exists()
        )

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    def _init_db(self) -> None:
        conn = self._connect()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS platform_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    source_node TEXT NOT NULL,
                    source_service TEXT NOT NULL,
                    occurred_at DATETIME NOT NULL,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    dedupe_key TEXT,
                    priority REAL NOT NULL DEFAULT 0.0,
                    ttl_seconds INTEGER NOT NULL DEFAULT 300,
                    expires_at DATETIME,
                    supersedes TEXT,
                    target_surfaces TEXT NOT NULL DEFAULT '[]',
                    payload TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS platform_event_acks (
                    session_id TEXT NOT NULL,
                    event_id TEXT NOT NULL,
                    acked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (session_id, event_id)
                )
                """
            )
            cursor.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_events_event_id ON platform_events(event_id)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_platform_events_occurred_at ON platform_events(occurred_at DESC)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_platform_events_kind ON platform_events(kind)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_platform_events_severity ON platform_events(severity)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_platform_events_source_node ON platform_events(source_node)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_platform_events_dedupe_key ON platform_events(dedupe_key)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_platform_event_acks_event_id ON platform_event_acks(event_id)"
            )
            conn.commit()
        finally:
            conn.close()

    def persist_event(self, event: PlatformEvent) -> None:
        with self._lock:
            conn = self._connect()
            try:
                cursor = conn.cursor()
                self._insert_event(cursor, event)
                conn.commit()
            finally:
                conn.close()

    def _insert_event(self, cursor: sqlite3.Cursor, event: PlatformEvent) -> None:
        cursor.execute(
            """
            INSERT OR IGNORE INTO platform_events (
                event_id,
                kind,
                severity,
                source_node,
                source_service,
                occurred_at,
                title,
                message,
                dedupe_key,
                priority,
                ttl_seconds,
                expires_at,
                supersedes,
                target_surfaces,
                payload
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event.event_id,
                event.kind,
                event.severity.value,
                event.source_node,
                event.source_service,
                _coerce_utc(event.occurred_at).isoformat(),
                event.title,
                event.message,
                event.dedupe_key,
                event.priority,
                event.ttl_seconds,
                _coerce_utc(event.expires_at).isoformat() if event.expires_at else None,
                event.supersedes,
                json.dumps(event.target_surfaces),
                json.dumps(event.model_dump(mode="json"), sort_keys=True),
            ),
        )

    def load_replay_events(
        self,
        *,
        cursor: str | None = None,
        limit: int = 100,
    ) -> list[PlatformEvent]:
        normalized_limit = max(1, int(limit))
        query = """
            SELECT payload
            FROM platform_events
            WHERE 1 = 1
        """
        params: list[object] = []
        if cursor:
            query += """
                AND id > COALESCE(
                    (SELECT id FROM platform_events WHERE event_id = ? LIMIT 1),
                    0
                )
            """
            params.append(cursor)
        query += " ORDER BY id ASC LIMIT ?"
        params.append(normalized_limit)

        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(query, params).fetchall()
            finally:
                conn.close()

        replay: list[PlatformEvent] = []
        for row in rows:
            event = PlatformEvent.model_validate_json(row[0])
            if event.expires_at is not None and _coerce_utc(event.expires_at) <= _utc_now():
                continue
            replay.append(event)
        return replay

    def ack(self, session_id: str, event_id: str) -> None:
        normalized_session = str(session_id or "").strip()
        normalized_event_id = str(event_id or "").strip()
        if not normalized_session or not normalized_event_id:
            return

        with self._lock:
            conn = self._connect()
            try:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO platform_event_acks (session_id, event_id, acked_at)
                    VALUES (?, ?, ?)
                    """,
                    (normalized_session, normalized_event_id, _utc_now().isoformat()),
                )
                conn.commit()
            finally:
                conn.close()

    def is_acknowledged(self, session_id: str, event_id: str) -> bool:
        normalized_session = str(session_id or "").strip()
        normalized_event_id = str(event_id or "").strip()
        if not normalized_session or not normalized_event_id:
            return False

        with self._lock:
            conn = self._connect()
            try:
                row = conn.execute(
                    """
                    SELECT 1
                    FROM platform_event_acks
                    WHERE session_id = ? AND event_id = ?
                    LIMIT 1
                    """,
                    (normalized_session, normalized_event_id),
                ).fetchone()
            finally:
                conn.close()
        return row is not None

    def get_acknowledged_event_ids(self, session_id: str) -> set[str]:
        normalized_session = str(session_id or "").strip()
        if not normalized_session:
            return set()

        with self._lock:
            conn = self._connect()
            try:
                rows = conn.execute(
                    """
                    SELECT event_id
                    FROM platform_event_acks
                    WHERE session_id = ?
                    ORDER BY acked_at ASC
                    """,
                    (normalized_session,),
                ).fetchall()
            finally:
                conn.close()
        return {str(row[0]) for row in rows}

    def cleanup_old_events(self, days: int | None = None) -> int:
        normalized_days = max(1, int(days if days is not None else self.retention_days))
        with self._lock:
            return self._cleanup_old_events_locked(normalized_days)

    def _cleanup_old_events_locked(self, days: int) -> int:
        cutoff = (_utc_now() - timedelta(days=days)).isoformat()
        conn = self._connect()
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM platform_events WHERE occurred_at < ?", (cutoff,))
            deleted = int(cursor.rowcount or 0)
            cursor.execute(
                """
                DELETE FROM platform_event_acks
                WHERE event_id NOT IN (SELECT event_id FROM platform_events)
                """
            )
            conn.commit()
            return deleted
        finally:
            conn.close()

    def _migrate_legacy_events(self) -> int:
        legacy_conn = sqlite3.connect(self.legacy_db_path)
        try:
            if not self._legacy_table_exists(legacy_conn, "cluster_events"):
                return 0
            columns = {
                str(row[1])
                for row in legacy_conn.execute("PRAGMA table_info(cluster_events)").fetchall()
            }
            required = {
                "event_id",
                "kind",
                "severity",
                "source_node_id",
                "message",
                "details",
                "correlation_id",
                "dedupe_key",
                "priority",
                "title",
                "ttl_seconds",
                "expires_at",
                "supersedes",
                "target_surfaces",
                "timestamp",
            }
            if not required.issubset(columns):
                return 0

            rows = legacy_conn.execute(
                """
                SELECT
                    event_id,
                    kind,
                    severity,
                    source_node_id,
                    message,
                    details,
                    correlation_id,
                    dedupe_key,
                    priority,
                    title,
                    ttl_seconds,
                    expires_at,
                    supersedes,
                    target_surfaces,
                    timestamp
                FROM cluster_events
                WHERE event_id IS NOT NULL AND kind IS NOT NULL
                ORDER BY id ASC
                """
            ).fetchall()
        finally:
            legacy_conn.close()

        if not rows:
            return 0

        conn = self._connect()
        migrated = 0
        try:
            cursor = conn.cursor()
            for row in rows:
                event = self._legacy_row_to_event(row)
                if event is None:
                    continue
                self._insert_event(cursor, event)
                migrated += 1
            conn.commit()
        finally:
            conn.close()
        return migrated

    def _legacy_row_to_event(self, row: tuple[object, ...]) -> PlatformEvent | None:
        try:
            details = json.loads(str(row[5] or "{}"))
            return PlatformEvent(
                event_id=str(row[0]),
                kind=str(row[1]),
                severity=str(row[2]),
                source_node=str(row[3]),
                source_service=str(details.get("source_service") or "platform_event_bus"),
                occurred_at=datetime.fromisoformat(str(row[14])),
                title=str(row[9] or row[1]),
                message=str(row[4] or ""),
                context=dict(details.get("context") or {}),
                correlation_id=str(row[6]) if row[6] else None,
                dedupe_key=str(row[7]) if row[7] else None,
                priority=float(row[8] or 0.0),
                ttl_seconds=int(row[10] or 0),
                expires_at=datetime.fromisoformat(str(row[11])) if row[11] else None,
                supersedes=str(row[12]) if row[12] else None,
                target_surfaces=json.loads(str(row[13])) if row[13] else [],
                workflow=details.get("workflow"),
                icon=details.get("icon"),
                color=details.get("color"),
                sound=details.get("sound"),
                sticky=bool(details.get("sticky", False)),
                broadcast=bool(details.get("broadcast", True)),
                target_nodes=list(details.get("target_nodes") or []),
                monotonic_ns=details.get("monotonic_ns"),
                ack_required=bool(details.get("ack_required", False)),
                resource=details.get("resource"),
            )
        except Exception:
            logger.exception("Failed to migrate legacy PlatformEvent row from %s", self.legacy_db_path)
            return None

    def _legacy_table_exists(self, conn: sqlite3.Connection, table_name: str) -> bool:
        row = conn.execute(
            """
            SELECT 1
            FROM sqlite_master
            WHERE type = 'table' AND name = ?
            LIMIT 1
            """,
            (table_name,),
        ).fetchone()
        return row is not None


def get_platform_event_store() -> PlatformEventStore:
    return PlatformEventStore.get_instance()


__all__ = [
    "DEFAULT_LEGACY_CLUSTER_EVENT_DB_PATH",
    "DEFAULT_PLATFORM_EVENT_DB_PATH",
    "PlatformEventStore",
    "get_platform_event_store",
]

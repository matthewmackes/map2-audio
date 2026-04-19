from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from app.services.platform_event.envelope import PlatformEvent
from app.services.platform_event.severity import Severity
from app.services.platform_event.store import PlatformEventStore


def _make_event(
    *,
    kind: str = "system.cpu.critical",
    severity: Severity = Severity.CRITICAL,
    occurred_at: datetime | None = None,
    ttl_seconds: int = 300,
) -> PlatformEvent:
    return PlatformEvent(
        kind=kind,
        severity=severity,
        source_node="AUDIO-NODE-0001",
        source_service="health_monitor",
        occurred_at=occurred_at or datetime.now(timezone.utc),
        title="CPU critical" if severity == Severity.CRITICAL else "Platform event",
        message="CPU sustained at 95%",
        dedupe_key="system:cpu:AUDIO-NODE-0001",
        ttl_seconds=ttl_seconds,
    )


def test_store_persists_and_replays_events(tmp_path: Path) -> None:
    PlatformEventStore.reset_instance()
    store = PlatformEventStore(
        db_path=tmp_path / "platform-events.db",
        legacy_db_path=tmp_path / "cluster-events.db",
    )
    event = _make_event(ttl_seconds=0)

    store.persist_event(event)

    replayed = store.load_replay_events(limit=10)

    assert [item.event_id for item in replayed] == [event.event_id]


def test_store_acknowledgements_are_persisted(tmp_path: Path) -> None:
    PlatformEventStore.reset_instance()
    db_path = tmp_path / "platform-events.db"
    legacy_db_path = tmp_path / "cluster-events.db"
    store = PlatformEventStore(db_path=db_path, legacy_db_path=legacy_db_path)
    event = _make_event(ttl_seconds=0)
    store.persist_event(event)

    store.ack("session-a", event.event_id)

    reopened = PlatformEventStore(db_path=db_path, legacy_db_path=legacy_db_path)
    assert reopened.is_acknowledged("session-a", event.event_id)
    assert reopened.get_acknowledged_event_ids("session-a") == {event.event_id}


def test_store_cleanup_old_events_prunes_history(tmp_path: Path) -> None:
    PlatformEventStore.reset_instance()
    store = PlatformEventStore(
        db_path=tmp_path / "platform-events.db",
        legacy_db_path=tmp_path / "cluster-events.db",
        retention_days=7,
    )
    stale = _make_event(
        occurred_at=datetime.now(timezone.utc) - timedelta(days=10),
        ttl_seconds=0,
    )
    current = _make_event(kind="workflow.progress", severity=Severity.INFO, ttl_seconds=0)
    store.persist_event(stale)
    store.persist_event(current)

    deleted = store.cleanup_old_events()

    conn = sqlite3.connect(store.db_path)
    try:
        rows = conn.execute("SELECT event_id FROM platform_events ORDER BY id ASC").fetchall()
    finally:
        conn.close()

    assert deleted == 1
    assert rows == [(current.event_id,)]


def test_store_migrates_legacy_platform_events_once(tmp_path: Path) -> None:
    PlatformEventStore.reset_instance()
    legacy_db_path = tmp_path / "cluster-events.db"
    db_path = tmp_path / "platform-events.db"
    legacy_conn = sqlite3.connect(legacy_db_path)
    try:
        legacy_conn.execute(
            """
            CREATE TABLE cluster_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                timestamp DATETIME NOT NULL,
                severity TEXT NOT NULL,
                source_node_id TEXT NOT NULL,
                affected_nodes TEXT,
                message TEXT,
                details TEXT,
                correlation_id TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                event_id TEXT,
                kind TEXT,
                dedupe_key TEXT,
                priority REAL DEFAULT 0.0,
                title TEXT,
                ttl_seconds INTEGER,
                expires_at DATETIME,
                supersedes TEXT,
                target_surfaces TEXT
            )
            """
        )
        legacy_conn.execute(
            """
            INSERT INTO cluster_events (
                event_type,
                timestamp,
                severity,
                source_node_id,
                affected_nodes,
                message,
                details,
                correlation_id,
                event_id,
                kind,
                dedupe_key,
                priority,
                title,
                ttl_seconds,
                expires_at,
                supersedes,
                target_surfaces
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "system.cpu.critical",
                datetime.now(timezone.utc).isoformat(),
                "critical",
                "AUDIO-NODE-0001",
                "[]",
                "CPU sustained at 95%",
                json.dumps(
                    {
                        "context": {"cpu": 95},
                        "source_service": "health_monitor",
                        "broadcast": True,
                    }
                ),
                "corr-1",
                "evt-platform-1",
                "system.cpu.critical",
                "system:cpu:AUDIO-NODE-0001",
                0.91,
                "CPU critical",
                0,
                None,
                None,
                json.dumps(["web"]),
            ),
        )
        legacy_conn.execute(
            """
            INSERT INTO cluster_events (
                event_type,
                timestamp,
                severity,
                source_node_id,
                affected_nodes,
                message,
                details,
                correlation_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                "node.joined",
                datetime.now(timezone.utc).isoformat(),
                "info",
                "NODE-0002",
                "[]",
                "Legacy-only cluster event",
                "{}",
                "corr-legacy",
            ),
        )
        legacy_conn.commit()
    finally:
        legacy_conn.close()

    store = PlatformEventStore(db_path=db_path, legacy_db_path=legacy_db_path)
    replayed = store.load_replay_events(limit=10)

    reopened = PlatformEventStore(db_path=db_path, legacy_db_path=legacy_db_path)
    replayed_again = reopened.load_replay_events(limit=10)

    assert db_path.exists()
    assert [item.event_id for item in replayed] == ["evt-platform-1"]
    assert [item.event_id for item in replayed_again] == ["evt-platform-1"]

from __future__ import annotations

import sqlite3
from pathlib import Path

from app.services.platform_event.store import PlatformEventStore


def test_platform_event_store_creates_canonical_event_columns(tmp_path: Path) -> None:
    PlatformEventStore.reset_instance()
    store = PlatformEventStore(
        db_path=tmp_path / "platform-events.db",
        legacy_db_path=tmp_path / "cluster-events.db",
    )

    conn = sqlite3.connect(Path(store.db_path))
    try:
        columns = {
            row[1]: row[2]
            for row in conn.execute("PRAGMA table_info(platform_events)").fetchall()
        }
    finally:
        conn.close()

    assert "event_id" in columns
    assert "kind" in columns
    assert "dedupe_key" in columns
    assert "priority" in columns
    assert "title" in columns
    assert "ttl_seconds" in columns
    assert "expires_at" in columns
    assert "supersedes" in columns
    assert "target_surfaces" in columns

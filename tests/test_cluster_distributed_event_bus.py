from __future__ import annotations

import sqlite3
from pathlib import Path

from app.services.cluster.distributed_event_bus import DistributedEventBus


def test_cluster_event_bus_adds_platform_event_columns(tmp_path: Path) -> None:
    DistributedEventBus.reset_instance()
    bus = DistributedEventBus(db_path=str(tmp_path / "cluster-events.db"))

    conn = sqlite3.connect(Path(bus.db_path))
    try:
        columns = {
            row[1]: row[2]
            for row in conn.execute("PRAGMA table_info(cluster_events)").fetchall()
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

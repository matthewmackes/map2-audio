from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import platform_events as platform_event_routes
from app.services.platform_event.bus import PlatformEventBus
from app.services.platform_event.envelope import PlatformEvent
from app.services.platform_event.severity import Severity
from app.services.platform_event.store import PlatformEventStore


def _build_client(tmp_path: Path, monkeypatch):
    store = PlatformEventStore(
        db_path=tmp_path / "platform-events.db",
        legacy_db_path=tmp_path / "cluster-events.db",
    )
    bus = PlatformEventBus(store=store, enabled=True)
    monkeypatch.setattr(platform_event_routes, "get_platform_event_store", lambda: store)
    monkeypatch.setattr(platform_event_routes, "get_platform_event_bus", lambda: bus)

    app = FastAPI()
    app.include_router(platform_event_routes.router)
    return TestClient(app), store, bus


def test_platform_event_routes_filter_surface_and_acknowledged_session(tmp_path: Path, monkeypatch) -> None:
    client, store, _bus = _build_client(tmp_path, monkeypatch)
    base = datetime.now(timezone.utc)

    first = PlatformEvent(
        kind="lcd.alert",
        severity=Severity.WARNING,
        source_node="node-a",
        source_service="test",
        occurred_at=base,
        title="First",
        message="First LCD event",
        target_surfaces=["lcd"],
    )
    second = PlatformEvent(
        kind="lcd.user",
        severity=Severity.WARNING,
        source_node="node-b",
        source_service="test",
        occurred_at=base + timedelta(seconds=1),
        title="Second",
        message="Second LCD event",
        target_surfaces=["lcd"],
    )
    ignored = PlatformEvent(
        kind="workflow.completed",
        severity=Severity.INFO,
        source_node="node-c",
        source_service="test",
        occurred_at=base + timedelta(seconds=2),
        title="Ignored",
        message="Not an LCD event",
        target_surfaces=["web"],
    )

    store.persist_event(first)
    store.persist_event(second)
    store.persist_event(ignored)
    store.ack("session-1", second.event_id)

    response = client.get(
        "/api/platform-events",
        params=[("surface", "lcd"), ("severity", "warning"), ("session_id", "session-1")],
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["events"][0]["event_id"] == first.event_id
    assert payload["events"][0]["kind"] == "lcd.alert"
    assert "event_type" not in payload["events"][0]


def test_platform_event_routes_support_cursor_and_min_priority(tmp_path: Path, monkeypatch) -> None:
    client, store, _bus = _build_client(tmp_path, monkeypatch)
    base = datetime.now(timezone.utc)

    older = PlatformEvent(
        kind="node.online",
        severity=Severity.INFO,
        source_node="node-a",
        source_service="test",
        occurred_at=base,
        title="Older",
        message="Older event",
        priority=0.25,
    )
    newer = PlatformEvent(
        kind="node.degraded",
        severity=Severity.WARNING,
        source_node="node-a",
        source_service="test",
        occurred_at=base + timedelta(seconds=1),
        title="Newer",
        message="Newer event",
        priority=0.75,
    )

    store.persist_event(older)
    store.persist_event(newer)

    cursor_response = client.get(
        "/api/platform-events",
        params={"cursor": newer.event_id, "limit": 10},
    )
    priority_response = client.get(
        "/api/platform-events",
        params={"min_priority": 0.5, "limit": 10},
    )

    assert cursor_response.status_code == 200
    assert cursor_response.json()["count"] == 1
    assert cursor_response.json()["events"][0]["event_id"] == older.event_id

    assert priority_response.status_code == 200
    assert priority_response.json()["count"] == 1
    assert priority_response.json()["events"][0]["event_id"] == newer.event_id


def test_platform_event_ack_route_returns_no_content(tmp_path: Path, monkeypatch) -> None:
    client, store, bus = _build_client(tmp_path, monkeypatch)
    event = PlatformEvent(
        kind="workflow.started",
        severity=Severity.INFO,
        source_node="node-a",
        source_service="test",
        title="Ack me",
        message="Ack me",
    )

    asyncio.run(bus.emit(event))
    response = client.post(
        "/api/platform-events/ack",
        json={"session_id": "session-ack", "event_id": event.event_id},
    )

    assert response.status_code == 204
    assert response.content == b""
    assert store.is_acknowledged("session-ack", event.event_id) is True

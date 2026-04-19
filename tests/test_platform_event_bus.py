from __future__ import annotations

import asyncio
import sqlite3
from pathlib import Path

import pytest

from app.services.platform_event.bus import PlatformEventBus, PlatformEventFilter
from app.services.platform_event.envelope import PlatformEvent
from app.services.platform_event.replay import PlatformEventReplayBuffer
from app.services.platform_event.severity import Severity
from app.services.platform_event.store import PlatformEventStore
from app.services.websocket_manager import WebSocketManager


def _make_event(*, kind: str = "system.cpu.critical", severity: Severity = Severity.CRITICAL, dedupe_key: str | None = None) -> PlatformEvent:
    return PlatformEvent(
        kind=kind,
        severity=severity,
        source_node="AUDIO-NODE-0001",
        source_service="health_monitor",
        title="CPU critical" if severity == Severity.CRITICAL else "CPU warning",
        message="CPU sustained at 95%",
        dedupe_key=dedupe_key,
    )


def _make_bus(tmp_path: Path) -> tuple[PlatformEventBus, WebSocketManager, PlatformEventStore]:
    PlatformEventStore.reset_instance()
    store = PlatformEventStore(
        db_path=tmp_path / "platform-events.db",
        legacy_db_path=tmp_path / "cluster-events.db",
    )
    websocket = WebSocketManager(enable_compression=False)
    replay = PlatformEventReplayBuffer(session_limit=5)
    return PlatformEventBus(
        store=store,
        websocket_manager=websocket,
        replay_buffer=replay,
        enabled=True,
    ), websocket, store


@pytest.mark.asyncio
async def test_emit_persists_and_broadcasts(tmp_path: Path) -> None:
    bus, websocket, store = _make_bus(tmp_path)
    event = _make_event(dedupe_key="system:cpu:AUDIO-NODE-0001")

    event_id = await bus.emit(event)

    assert event_id == event.event_id
    history = websocket.get_event_history("platform:events")
    assert history["events"][0]["data"]["event_id"] == event.event_id

    conn = sqlite3.connect(store.db_path)
    try:
        row = conn.execute(
            "SELECT event_id, kind, dedupe_key, title FROM platform_events WHERE event_id = ?",
            (event.event_id,),
        ).fetchone()
    finally:
        conn.close()
    assert row == (event.event_id, event.kind, event.dedupe_key, event.title)


@pytest.mark.asyncio
async def test_subscribe_filters_by_kind_and_priority(tmp_path: Path) -> None:
    bus, _, _ = _make_bus(tmp_path)
    matching = _make_event(dedupe_key="system:cpu:AUDIO-NODE-0001")
    ignored = _make_event(kind="workflow.progress", severity=Severity.INFO)
    collected: list[PlatformEvent] = []

    async def _consumer() -> None:
        async for item in bus.subscribe(kinds=["system.cpu.critical"], min_priority=0.5):
            collected.append(item)
            break

    task = asyncio.create_task(_consumer())
    await asyncio.sleep(0)
    await bus.emit(ignored)
    await bus.emit(matching)
    await asyncio.wait_for(task, timeout=1.0)

    assert [item.event_id for item in collected] == [matching.event_id]


@pytest.mark.asyncio
async def test_supersedes_previous_dedupe_key(tmp_path: Path) -> None:
    bus, _, _ = _make_bus(tmp_path)
    first = _make_event(severity=Severity.WARNING, kind="system.cpu.high", dedupe_key="system:cpu:AUDIO-NODE-0001")
    second = _make_event(severity=Severity.CRITICAL, dedupe_key="system:cpu:AUDIO-NODE-0001")

    await bus.emit(first)
    await bus.emit(second)

    replayed = await bus.replay(limit=10)
    assert len(replayed) == 1
    assert replayed[0].event_id == second.event_id
    assert replayed[0].supersedes == first.event_id


@pytest.mark.asyncio
async def test_replay_filters_and_ack(tmp_path: Path) -> None:
    bus, _, store = _make_bus(tmp_path)
    event = _make_event(dedupe_key="system:cpu:AUDIO-NODE-0001")
    await bus.emit(event)

    replayed = await bus.replay(
        limit=10,
        event_filter=PlatformEventFilter(kinds=frozenset({"system.cpu.critical"})),
        session_id="session-a",
    )
    assert [item.event_id for item in replayed] == [event.event_id]

    await bus.ack("session-a", event.event_id)
    assert store.is_acknowledged("session-a", event.event_id)


def test_emit_threadsafe_without_running_loop(tmp_path: Path) -> None:
    bus, _, _ = _make_bus(tmp_path)
    event = _make_event(dedupe_key="system:cpu:AUDIO-NODE-0001")

    bus.emit_threadsafe(event)

    replayed = asyncio.run(bus.replay(limit=10))
    assert replayed[0].event_id == event.event_id

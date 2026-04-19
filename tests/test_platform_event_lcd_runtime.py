from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app.services.lcd_manager import LCDManager
from app.services.platform_event.bus import PlatformEventBus
from app.services.platform_event.factories import make_lcd_surface_event
from app.services.platform_event.replay import PlatformEventReplayBuffer
from app.services.platform_event.severity import Severity
from app.services.platform_event.store import PlatformEventStore
from app.services.websocket_manager import WebSocketManager


def _make_runtime(tmp_path: Path) -> tuple[LCDManager, PlatformEventBus]:
    PlatformEventStore.reset_instance()
    PlatformEventBus.reset_instance()
    store = PlatformEventStore(db_path=tmp_path / "platform-events.db")
    bus = PlatformEventBus(
        store=store,
        websocket_manager=WebSocketManager(),
        replay_buffer=PlatformEventReplayBuffer(session_limit=5),
        enabled=True,
    )
    manager = LCDManager(
        "NODE-1",
        "NODE-1",
        use_mock_lcd=True,
        platform_event_bus=bus,
        platform_event_store=store,
    )
    return manager, bus


@pytest.mark.asyncio
async def test_lcd_manager_displays_and_queries_platform_events(tmp_path: Path):
    manager, bus = _make_runtime(tmp_path)
    await manager.start()
    try:
        await bus.emit(
            make_lcd_surface_event(
                event_type="system",
                severity=Severity.WARNING,
                source_node="NODE-1",
                source_service="test",
                title="High CPU",
                message="CPU at 92 percent",
                color="yellow",
            )
        )
        await bus.emit(
            make_lcd_surface_event(
                event_type="network",
                severity=Severity.INFO,
                source_node="NODE-2",
                source_service="test",
                title="Peer Connected",
                message="NODE-2 online",
                icon="🔗",
                color="green",
            )
        )
        await asyncio.sleep(0.05)

        current = manager.lcd.get_current_display()
        assert any("High CPU" in line or "Peer Connect" in line for line in current)

        local_events = manager.get_recent_local_events(limit=10)
        remote_events = manager.get_recent_remote_events(limit=10)
        assert [event.title for event in local_events] == ["High CPU"]
        assert [event.title for event in remote_events] == ["Peer Connected"]
    finally:
        await manager.stop()


@pytest.mark.asyncio
async def test_lcd_manager_live_subscription_projects_platform_events(tmp_path: Path):
    manager, bus = _make_runtime(tmp_path)
    await manager.start()
    received = []
    subscription = await manager.subscribe_live(received.append)
    try:
        await bus.emit(
            make_lcd_surface_event(
                event_type="audio",
                severity=Severity.INFO,
                source_node="NODE-1",
                source_service="test",
                title="Audio Engine Started",
                message="JUCE Engine @ 48000Hz",
            )
        )
        await asyncio.sleep(0.05)
        assert [event.title for event in received] == ["Audio Engine Started"]
        assert received[0].timestamp.tzinfo is not None
    finally:
        subscription.close()
        await manager.stop()

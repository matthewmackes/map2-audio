"""
Tests for the LCD view model and mock LCD display.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone

import pytest

from app.drivers.lcd_display import MockLCDDisplay
from app.lcd_models.lcd_event import EventSeverity, EventType, LCDEvent
from app.utils.time import utc_now


class TestLCDEventModel:
    def test_event_creation(self):
        event = LCDEvent(
            event_id="test-id-1",
            timestamp=utc_now(),
            source_node="TEST-NODE-1234",
            event_type=EventType.AUDIO,
            severity=EventSeverity.INFO,
            title="Test Event",
            message="This is a test",
            icon="✓",
        )

        assert event.event_id == "test-id-1"
        assert event.title == "Test Event"
        assert event.event_type == EventType.AUDIO

    def test_event_serialization(self):
        event = LCDEvent(
            event_id="test-id",
            timestamp=datetime(2026, 2, 4, 14, 30, 0, tzinfo=timezone.utc),
            source_node="NODE-1",
            event_type=EventType.SYSTEM,
            severity=EventSeverity.WARNING,
            title="Test",
            message="Message",
            broadcast=True,
            color="yellow",
        )

        data = event.to_dict()

        assert data["event_id"] == "test-id"
        assert data["title"] == "Test"
        assert data["event_type"] == "system"
        assert data["severity"] == "warning"
        assert data["broadcast"] is True

    def test_event_deserialization(self):
        data = {
            "event_id": "test-id",
            "timestamp": "2026-02-04T14:30:00",
            "source_node": "NODE-1",
            "event_type": "audio",
            "severity": "info",
            "title": "Test",
            "message": "Message",
            "icon": "🎵",
            "broadcast": True,
            "target_nodes": [],
            "ttl": 300,
            "color": "green",
            "sound": False,
            "dismiss_auto": True,
            "context": {},
        }

        event = LCDEvent.from_dict(data)

        assert event.event_id == "test-id"
        assert event.event_type == EventType.AUDIO
        assert event.severity == EventSeverity.INFO
        assert event.timestamp.tzinfo == timezone.utc

    def test_event_expiration(self):
        event = LCDEvent(
            event_id="test",
            timestamp=utc_now(),
            source_node="NODE-1",
            event_type=EventType.SYSTEM,
            severity=EventSeverity.INFO,
            title="Test",
            message="Test",
            ttl=1,
        )

        assert not event.is_expired()
        time.sleep(1.1)
        assert event.is_expired()

    def test_event_display_filtering(self):
        event = LCDEvent(
            event_id="test",
            timestamp=utc_now(),
            source_node="NODE-1",
            event_type=EventType.SYSTEM,
            severity=EventSeverity.INFO,
            title="Test",
            message="Test",
            broadcast=True,
        )

        assert event.should_display_on_node("NODE-1")
        assert event.should_display_on_node("NODE-2")

        event.broadcast = False
        event.target_nodes = ["NODE-2"]

        assert not event.should_display_on_node("NODE-1")
        assert event.should_display_on_node("NODE-2")


@pytest.fixture
async def lcd_display():
    display = MockLCDDisplay()
    await display.connect()
    yield display
    await display.disconnect()


class TestLCDDisplay:
    @pytest.mark.asyncio
    async def test_write_line(self, lcd_display):
        await lcd_display.write_line(0, "Test Line")
        current = lcd_display.get_current_display()
        assert current[0] == "Test Line".ljust(20)

    @pytest.mark.asyncio
    async def test_clear_display(self, lcd_display):
        await lcd_display.write_line(0, "Test")
        await lcd_display.clear()
        current = lcd_display.get_current_display()
        assert all(line == "" for line in current)

    @pytest.mark.asyncio
    async def test_backlight_control(self, lcd_display):
        await lcd_display.set_backlight(50)
        assert lcd_display.backlight_level == 50

        await lcd_display.set_backlight(100)
        assert lcd_display.backlight_level == 100

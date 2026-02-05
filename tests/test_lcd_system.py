"""
Tests for LCD Event System

Tests cover:
- Event creation and serialization
- Event bus publish/subscribe
- Event routing between nodes
- Remote event aggregation
- LCD display output
"""

import pytest
import asyncio
from datetime import datetime
import json

from app.models.lcd_event import LCDEvent, EventType, EventSeverity
from app.services.lcd_event_bus import LCDEventBus, create_audio_event
from app.services.lcd_event_router import LCDEventRouter
from app.services.remote_event_aggregator import RemoteEventAggregator
from app.drivers.lcd_display import MockLCDDisplay


@pytest.fixture
async def event_bus():
    """Create event bus for testing"""
    bus = LCDEventBus("test-node", "TEST-NODE-1234")
    await bus.start()
    yield bus
    await bus.stop()


@pytest.fixture
async def lcd_display():
    """Create mock LCD display"""
    display = MockLCDDisplay()
    await display.connect()
    yield display
    await display.disconnect()


class TestLCDEventModel:
    """Test LCDEvent data model"""
    
    def test_event_creation(self):
        """Test creating an LCD event"""
        event = LCDEvent(
            event_id="test-id-1",
            timestamp=datetime.now(),
            source_node="TEST-NODE-1234",
            event_type=EventType.AUDIO,
            severity=EventSeverity.INFO,
            title="Test Event",
            message="This is a test",
            icon="✓"
        )
        
        assert event.event_id == "test-id-1"
        assert event.title == "Test Event"
        assert event.event_type == EventType.AUDIO
    
    def test_event_serialization(self):
        """Test serializing event to dict"""
        event = LCDEvent(
            event_id="test-id",
            timestamp=datetime(2026, 2, 4, 14, 30, 0),
            source_node="NODE-1",
            event_type=EventType.SYSTEM,
            severity=EventSeverity.WARNING,
            title="Test",
            message="Message",
            broadcast=True,
            color="yellow"
        )
        
        data = event.to_dict()
        
        assert data["event_id"] == "test-id"
        assert data["title"] == "Test"
        assert data["event_type"] == "system"
        assert data["severity"] == "warning"
        assert data["broadcast"] is True
    
    def test_event_deserialization(self):
        """Test deserializing event from dict"""
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
            "context": {}
        }
        
        event = LCDEvent.from_dict(data)
        
        assert event.event_id == "test-id"
        assert event.event_type == EventType.AUDIO
        assert event.severity == EventSeverity.INFO
    
    def test_event_expiration(self):
        """Test TTL and expiration logic"""
        import time
        
        # Event with 1 second TTL
        event = LCDEvent(
            event_id="test",
            timestamp=datetime.now(),
            source_node="NODE-1",
            event_type=EventType.INFO,
            severity=EventSeverity.INFO,
            title="Test",
            message="Test",
            ttl=1
        )
        
        assert not event.is_expired()
        
        # Simulate time passing
        time.sleep(1.1)
        assert event.is_expired()
    
    def test_event_display_filtering(self):
        """Test should_display_on_node logic"""
        event = LCDEvent(
            event_id="test",
            timestamp=datetime.now(),
            source_node="NODE-1",
            event_type=EventType.INFO,
            severity=EventSeverity.INFO,
            title="Test",
            message="Test",
            broadcast=True
        )
        
        # Broadcast event should display on any node
        assert event.should_display_on_node("NODE-1")
        assert event.should_display_on_node("NODE-2")
        assert event.should_display_on_node("NODE-3")
        
        # Non-broadcast event
        event.broadcast = False
        event.target_nodes = ["NODE-2"]
        
        assert not event.should_display_on_node("NODE-1")
        assert event.should_display_on_node("NODE-2")
        assert not event.should_display_on_node("NODE-3")


class TestLCDEventBus:
    """Test local event bus"""
    
    @pytest.mark.asyncio
    async def test_publish_and_subscribe(self, event_bus):
        """Test publishing and subscribing to events"""
        received_events = []
        
        async def subscriber(event):
            received_events.append(event)
        
        event_bus.subscribe(subscriber)
        
        # Publish event
        event = LCDEvent(
            event_id="test",
            timestamp=datetime.now(),
            source_node="TEST-NODE-1234",
            event_type=EventType.AUDIO,
            severity=EventSeverity.INFO,
            title="Test",
            message="Test"
        )
        
        await event_bus.publish(event)
        
        # Give time for async processing
        await asyncio.sleep(0.1)
        
        assert len(received_events) > 0
        assert received_events[0].title == "Test"
    
    @pytest.mark.asyncio
    async def test_event_history(self, event_bus):
        """Test event history management"""
        # Publish multiple events
        for i in range(5):
            event = LCDEvent(
                event_id=f"test-{i}",
                timestamp=datetime.now(),
                source_node="TEST-NODE-1234",
                event_type=EventType.SYSTEM,
                severity=EventSeverity.INFO,
                title=f"Event {i}",
                message="Test"
            )
            await event_bus.publish(event)
            await asyncio.sleep(0.01)
        
        # Get history
        history = event_bus.get_recent_events(limit=10)
        
        assert len(history) == 5
        assert history[0].title == "Event 0"
    
    @pytest.mark.asyncio
    async def test_helper_functions(self, event_bus):
        """Test event creation helper functions"""
        # Create audio event
        await create_audio_event(
            event_bus,
            title="Test Audio",
            message="Audio started",
            severity=EventSeverity.INFO
        )
        
        await asyncio.sleep(0.1)
        
        history = event_bus.get_recent_events()
        assert any(e.title == "Test Audio" for e in history)


class TestRemoteEventAggregator:
    """Test remote event aggregation"""
    
    @pytest.mark.asyncio
    async def test_receive_remote_event(self):
        """Test receiving events from remote nodes"""
        aggregator = RemoteEventAggregator()
        
        event = LCDEvent(
            event_id="remote-1",
            timestamp=datetime.now(),
            source_node="REMOTE-NODE-5678",
            event_type=EventType.SYSTEM,
            severity=EventSeverity.WARNING,
            title="Remote Event",
            message="From another node"
        )
        
        await aggregator.receive_remote_event(event)
        
        # Check per-node history
        node_events = aggregator.get_events_by_node("REMOTE-NODE-5678")
        assert len(node_events) == 1
        assert node_events[0].title == "Remote Event"
    
    @pytest.mark.asyncio
    async def test_event_filtering(self):
        """Test filtering by type and severity"""
        aggregator = RemoteEventAggregator()
        
        # Add events of different types
        for i in range(3):
            event = LCDEvent(
                event_id=f"event-{i}",
                timestamp=datetime.now(),
                source_node="REMOTE-NODE",
                event_type=EventType.AUDIO if i < 2 else EventType.SYSTEM,
                severity=EventSeverity.INFO if i == 0 else EventSeverity.WARNING,
                title=f"Event {i}",
                message="Test"
            )
            await aggregator.receive_remote_event(event)
        
        # Filter by type
        audio_events = aggregator.get_events_by_type(EventType.AUDIO)
        assert len(audio_events) == 2
        
        # Filter by severity
        warning_events = aggregator.get_events_by_severity(EventSeverity.WARNING)
        assert len(warning_events) == 2


class TestLCDDisplay:
    """Test LCD hardware driver"""
    
    @pytest.mark.asyncio
    async def test_write_line(self, lcd_display):
        """Test writing to LCD"""
        await lcd_display.write_line(0, "Test Line")
        
        current = lcd_display.get_current_display()
        assert current[0] == "Test Line         "  # Padded to 20 chars
    
    @pytest.mark.asyncio
    async def test_clear_display(self, lcd_display):
        """Test clearing LCD"""
        await lcd_display.write_line(0, "Test")
        await lcd_display.clear()
        
        current = lcd_display.get_current_display()
        assert all(line == "" for line in current)
    
    @pytest.mark.asyncio
    async def test_backlight_control(self, lcd_display):
        """Test backlight adjustment"""
        await lcd_display.set_backlight(50)
        assert lcd_display.backlight_level == 50
        
        await lcd_display.set_backlight(100)
        assert lcd_display.backlight_level == 100


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

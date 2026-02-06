"""
Test WebSocket Reconnection Logic

Validates:
- Exponential backoff
- Event queuing for offline peers
- Event flushing on reconnection
- Maximum retry limit
"""

import asyncio
import pytest
from unittest.mock import Mock, AsyncMock, patch
import aiohttp

from app.services.lcd_event_router import LCDEventRouter
from app.lcd_models.lcd_event import LCDEvent, EventType, EventSeverity
from datetime import datetime


@pytest.mark.asyncio
async def test_exponential_backoff():
    """Test that reconnection uses exponential backoff"""
    router = LCDEventRouter("TEST-NODE", "test")
    
    delays = []
    
    async def mock_connect(*args, **kwargs):
        raise aiohttp.ClientError("Connection failed")
    
    async def mock_sleep(delay):
        delays.append(delay)
        if len(delays) >= 5:  # Stop after 5 retries
            raise asyncio.CancelledError()
    
    with patch('aiohttp.ClientSession.ws_connect', side_effect=mock_connect):
        with patch('asyncio.sleep', side_effect=mock_sleep):
            try:
                await router._maintain_peer_connection("PEER-1", "ws://peer:8000/ws")
            except asyncio.CancelledError:
                pass
    
    # Verify exponential backoff: 1s, 2s, 4s, 8s, 16s
    assert len(delays) >= 3
    assert delays[0] == 1.0
    assert delays[1] == 2.0
    assert delays[2] == 4.0
    print(f"✓ Exponential backoff verified: {delays}")


@pytest.mark.asyncio
async def test_event_queuing_for_offline_peer():
    """Test that events are queued when peer is offline"""
    router = LCDEventRouter("TEST-NODE", "test")
    await router.start()
    
    # Add a peer (not connected)
    router._connection_tasks["OFFLINE-PEER"] = Mock()
    
    # Create test event
    event = LCDEvent(
        event_id="test-001",
        timestamp=datetime.now(),
        source_node="TEST-NODE",
        event_type=EventType.SYSTEM,
        severity=EventSeverity.INFO,
        title="Test Event",
        message="Should be queued"
    )
    
    # Broadcast event (peer is offline)
    await router.broadcast_event(event)
    
    # Verify event was queued
    assert "OFFLINE-PEER" in router.pending_events
    assert router.pending_events["OFFLINE-PEER"].qsize() == 1
    
    print("✓ Event queued for offline peer")
    
    await router.stop()


@pytest.mark.asyncio
async def test_event_flushing_on_reconnection():
    """Test that queued events are sent when peer reconnects"""
    router = LCDEventRouter("TEST-NODE", "test")
    await router.start()
    
    # Queue some events
    router.pending_events["PEER-1"] = asyncio.Queue()
    await router.pending_events["PEER-1"].put('{"event": "test1"}')
    await router.pending_events["PEER-1"].put('{"event": "test2"}')
    await router.pending_events["PEER-1"].put('{"event": "test3"}')
    
    # Mock WebSocket
    mock_ws = AsyncMock()
    sent_events = []
    
    async def capture_send(data):
        sent_events.append(data)
    
    mock_ws.send_str = capture_send
    
    # Flush pending events
    await router._flush_pending_events("PEER-1", mock_ws)
    
    # Verify all events were sent
    assert len(sent_events) == 3
    assert sent_events[0] == '{"event": "test1"}'
    assert sent_events[1] == '{"event": "test2"}'
    assert sent_events[2] == '{"event": "test3"}'
    assert router.pending_events["PEER-1"].qsize() == 0
    
    print("✓ Pending events flushed on reconnection")
    
    await router.stop()


@pytest.mark.asyncio
async def test_max_retry_limit():
    """Test that connection gives up after max retries"""
    router = LCDEventRouter("TEST-NODE", "test")
    router.reconnect_max_retries = 3  # Reduce for faster test
    router.reconnect_base_delay = 0.1  # Speed up test
    
    retry_count = 0
    
    async def mock_connect(*args, **kwargs):
        nonlocal retry_count
        retry_count += 1
        raise aiohttp.ClientError("Connection failed")
    
    async def mock_sleep(delay):
        pass  # Don't actually sleep in test
    
    with patch('aiohttp.ClientSession.ws_connect', side_effect=mock_connect):
        with patch('asyncio.sleep', side_effect=mock_sleep):
            await router._maintain_peer_connection("PEER-1", "ws://peer:8000/ws")
    
    # Verify it stopped after max retries
    assert retry_count == router.reconnect_max_retries
    
    print(f"✓ Connection gave up after {retry_count} retries")


@pytest.mark.asyncio
async def test_connection_stats():
    """Test connection statistics reporting"""
    router = LCDEventRouter("TEST-NODE", "test")
    await router.start()
    
    # Add some peers
    router._connection_tasks["PEER-1"] = Mock()
    router._connection_tasks["PEER-2"] = Mock()
    router._connection_tasks["PEER-3"] = Mock()
    
    # Simulate PEER-1 connected
    router.peer_connections["PEER-1"] = Mock()
    
    # Queue events for PEER-2
    router.pending_events["PEER-2"] = asyncio.Queue()
    await router.pending_events["PEER-2"].put("event1")
    await router.pending_events["PEER-2"].put("event2")
    
    # Get stats
    stats = router.get_connection_stats()
    
    assert stats['total_peers'] == 3
    assert stats['connected_peers'] == 1
    assert stats['offline_peers'] == 2
    assert stats['peer_status']['PEER-1']['connected'] is True
    assert stats['peer_status']['PEER-2']['connected'] is False
    assert stats['peer_status']['PEER-2']['pending_events'] == 2
    assert stats['total_pending_events'] == 2
    
    print("✓ Connection statistics correct")
    print(f"  Stats: {stats}")
    
    await router.stop()


if __name__ == "__main__":
    asyncio.run(test_exponential_backoff())
    asyncio.run(test_event_queuing_for_offline_peer())
    asyncio.run(test_event_flushing_on_reconnection())
    asyncio.run(test_max_retry_limit())
    asyncio.run(test_connection_stats())
    print("\n✅ All WebSocket reconnection tests passed!")

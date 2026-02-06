"""
LCD Event System - Developer Guide & Testing

This guide covers:
1. Testing the event system locally
2. Recording and replaying events
3. Debugging event flow
4. Performance profiling
5. Integration testing
"""

# DEVELOPER GUIDE: TESTING AND DEBUGGING LCD EVENTS

## Quick Start

### 1. Run Locally with Mock LCD

```python
# Start the application
from app.main import create_app
import asyncio

app = create_app()

# The LCD system will:
# - Initialize with mock LCD (no hardware needed)
# - Start event producers (audio, system, network)
# - Listen on /api/lcd/events
# - Stream via /ws/events WebSocket
```

### 2. Test Event Creation

```bash
# Create a test event via API
curl -X POST http://localhost:8080/api/lcd/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "TEST EVENT",
    "message": "This is a test",
    "event_type": "user",
    "severity": "info",
    "broadcast": true
  }'
```

### 3. Watch Real-Time Events

```bash
# Connect to WebSocket and watch events
wscat -c ws://localhost:8080/api/lcd/ws/events

# Should see events flowing in real-time as JSON objects
```

## Recording and Replaying Events

### Record Events During Test

```python
from app.services.event_replay import EventRecorder
from app.services.lcd_manager import LCDManager

# Create recorder
recorder = EventRecorder(record_dir="/tmp/map2-events")
recorder.start()

# Wire into LCD manager
lcd_manager.event_bus.subscribe(recorder.record)

# Run your test...

# Events saved to: /tmp/map2-events/session_YYYYMMDD_HHMMSS.jsonl
```

### Analyze Recorded Session

```python
from app.services.event_replay import EventDebugger
from pathlib import Path

# Analyze
session_file = Path("/tmp/map2-events/session_20260204_143000.jsonl")
analysis = EventDebugger.analyze_file(session_file)

print(f"Total events: {analysis['total_events']}")
print(f"By type: {analysis['by_type']}")
print(f"By severity: {analysis['by_severity']}")
print(f"Event rate: {analysis['event_rate']:.1f} events/sec")
```

### Replay Events for Debugging

```python
from app.services.event_replay import EventReplayer
import asyncio

async def test_replay():
    replayer = EventReplayer()
    
    # Replay from file
    await replayer.replay_file(
        file_path=Path("/tmp/map2-events/session_20260204_143000.jsonl"),
        event_handler=lcd_manager.publish_event,
        speed=2.0,  # 2x faster than real-time
        limit=50  # Only first 50 events
    )

asyncio.run(test_replay())
```

### Filter Events from Recording

```python
from app.services.event_replay import EventDebugger

# Get only critical events
critical_events = EventDebugger.filter_events(
    session_file,
    severity='critical'
)

# Get only audio events
audio_events = EventDebugger.filter_events(
    session_file,
    event_type='audio'
)

# Get events from specific node
node_events = EventDebugger.filter_events(
    session_file,
    node='AUDIO-NODE-A1B2'
)
```

### Export to CSV for Analysis

```python
from app.services.event_replay import EventDebugger

EventDebugger.export_csv(
    session_file,
    Path("/tmp/events.csv")
)

# Open in Excel/Numbers for analysis
```

## Testing Event Producers

### Test Audio Producer

```python
from app.services.event_producers.audio_producer import AudioEventProducer
from app.services.lcd_event_bus import LCDEventBus
import asyncio

async def test_audio():
    bus = LCDEventBus("test", "TEST-NODE")
    await bus.start()
    
    producer = AudioEventProducer(bus)
    
    # Simulate events
    await producer.on_audio_started(
        "ALSA default",
        48000,
        256,
        5.3
    )
    
    await producer.on_xrun_detected(3)
    await producer.on_cpu_spike(85.5)
    
    # Check events were published
    events = bus.get_recent_events()
    assert len(events) >= 3
    assert any("Audio Engine" in e.title for e in events)

asyncio.run(test_audio())
```

### Test System Producer

```python
from app.services.event_producers.system_producer import SystemHealthProducer
import asyncio

async def test_system():
    bus = LCDEventBus("test", "TEST-NODE")
    await bus.start()
    
    producer = SystemHealthProducer(bus)
    
    # Simulate high CPU
    await producer._check_cpu(92.5)  # Should trigger critical alert
    
    # Simulate memory warning
    await producer._check_memory(85.0, 2048)
    
    events = bus.get_recent_events()
    assert any("High CPU" in e.title for e in events)

asyncio.run(test_system())
```

### Test Plugin Producer

```python
from app.services.event_producers.plugin_producer import PluginEventProducer
import asyncio

async def test_plugins():
    bus = LCDEventBus("test", "TEST-NODE")
    await bus.start()
    
    producer = PluginEventProducer(bus)
    
    # Simulate plugin load
    await producer.on_plugin_loaded(
        "Reverb Pro",
        "VST3",
        "plugin-001",
        latency_change_ms=2.5
    )
    
    # Simulate CPU spike
    await producer.on_plugin_cpu_spike(
        "plugin-001",
        "Reverb Pro",
        85.0
    )
    
    events = bus.get_recent_events()
    assert len(events) >= 2

asyncio.run(test_plugins())
```

## Testing Event Router (Clustering)

### Test WebSocket Broadcast

```python
import asyncio
import json
import websockets
from pathlib import Path

async def test_websocket():
    # Connect to WebSocket
    uri = "ws://localhost:8080/api/lcd/ws/events"
    
    async with websockets.connect(uri) as websocket:
        # Listen for events
        for i in range(10):
            event_data = await websocket.recv()
            event = json.loads(event_data)
            print(f"Received: {event['title']} from {event['source_node']}")

asyncio.run(test_websocket())
```

### Test Multi-Node Setup

```bash
# Terminal 1: Start Node 1
NODE_ID="AUDIO-NODE-A1B2" python -m app.main --port 8001

# Terminal 2: Start Node 2
NODE_ID="AUDIO-NODE-C3D4" python -m app.main --port 8002

# Terminal 3: Connect both nodes
curl -X POST http://localhost:8001/api/lcd/connect \
  -d '{"node_id": "AUDIO-NODE-C3D4", "url": "ws://localhost:8002/ws/events"}'

# Terminal 4: Publish event to Node 1
curl -X POST http://localhost:8001/api/lcd/events \
  -d '{"title": "Test", "message": "Should broadcast", "broadcast": true}'

# Watch both nodes' WebSockets - event should appear on both
```

## Performance Testing

### Measure Event Latency

```python
from app.services.lcd_manager import LCDManager
from app.models.lcd_event import LCDEvent
import time
import asyncio

async def test_latency():
    manager = LCDManager("test", "TEST-NODE", use_mock_lcd=True)
    await manager.start()
    
    latencies = []
    
    # Create 100 events
    for i in range(100):
        event = LCDEvent(
            event_id=f"test-{i}",
            timestamp=__import__('datetime').datetime.now(),
            source_node="TEST-NODE",
            event_type="user",
            severity="info",
            title=f"Test {i}",
            message="Performance test"
        )
        
        start = time.time()
        await manager.publish_event(event)
        latency = (time.time() - start) * 1000  # ms
        latencies.append(latency)
    
    print(f"Latency stats:")
    print(f"  Min: {min(latencies):.2f}ms")
    print(f"  Max: {max(latencies):.2f}ms")
    print(f"  Avg: {sum(latencies)/len(latencies):.2f}ms")

asyncio.run(test_latency())
```

### Stress Test Event Bus

```python
import asyncio
from app.services.lcd_event_bus import LCDEventBus

async def test_stress():
    bus = LCDEventBus("test", "TEST-NODE")
    await bus.start()
    
    received_count = 0
    
    def subscriber(event):
        nonlocal received_count
        received_count += 1
    
    bus.subscribe(subscriber)
    
    # Publish 1000 events rapidly
    for i in range(1000):
        event_dict = {
            "event_id": f"stress-{i}",
            "timestamp": __import__('datetime').datetime.now(),
            "source_node": "TEST",
            "event_type": "user",
            "severity": "info",
            "title": f"Stress {i}",
            "message": "x" * 100
        }
        
        from app.models.lcd_event import LCDEvent
        await bus.publish(LCDEvent.from_dict(event_dict))
    
    await asyncio.sleep(1)
    
    print(f"Stress test: Published 1000, Received {received_count}")
    assert received_count == 1000

asyncio.run(test_stress())
```

## Integration Testing

### End-to-End Test

```python
import asyncio
from pathlib import Path

async def test_e2e():
    """Full integration test"""
    from app.main import create_app
    from app.services.event_replay import EventRecorder
    
    # Create app
    app = create_app()
    
    # Record session
    recorder = EventRecorder("/tmp/test-session")
    recorder.start()
    
    # Simulate events
    async with app.app_context():
        # Get LCD manager
        lcd_mgr = app.state.lcd_manager
        
        # Subscribe to record
        lcd_mgr.event_bus.subscribe(recorder.record)
        
        # Generate test events
        await lcd_mgr.event_bus._event_bus_test()
        
        await asyncio.sleep(2)
    
    # Verify session was recorded
    session_file = recorder.session_file
    assert session_file.exists()
    
    # Analyze
    from app.services.event_replay import EventDebugger
    analysis = EventDebugger.analyze_file(session_file)
    
    print(f"E2E Test Result:")
    print(f"  Events recorded: {analysis['total_events']}")
    print(f"  Success: {analysis['total_events'] > 0}")

asyncio.run(test_e2e())
```

## Debugging Checklist

- [ ] Events are created with all fields populated
- [ ] Events serialize/deserialize correctly
- [ ] Local event bus delivers to subscribers
- [ ] WebSocket connections establish
- [ ] Events broadcast to remote nodes
- [ ] Database persistence working
- [ ] LCD display updates in real-time
- [ ] TUI screens show correct data
- [ ] Web UI receives WebSocket events
- [ ] Node discovery working (if mDNS enabled)
- [ ] Event replay works correctly
- [ ] Performance within targets

## Common Issues

### WebSocket Not Connecting

```python
# Check if endpoint is accessible
import asyncio
import websockets

async def check_ws():
    try:
        async with websockets.connect("ws://localhost:8080/api/lcd/ws/events") as ws:
            print("WebSocket connected!")
    except Exception as e:
        print(f"Connection failed: {e}")

asyncio.run(check_ws())
```

### Events Not Displaying

```python
# Check if events are being published
events = lcd_manager.get_all_recent_events()
print(f"Events in history: {len(events)}")

# Check if LCD driver is working
current = lcd_manager.lcd.get_current_display()
print(f"LCD display: {current}")
```

### High Latency

```python
# Check event queue depth
queue_size = lcd_manager.display_queue.qsize()
print(f"Events waiting: {queue_size}")

# Check producer health
audio_prod_running = audio_producer._monitor_task and not audio_producer._monitor_task.done()
print(f"Audio producer running: {audio_prod_running}")
```

## Next Steps

1. Run the test suite: `pytest tests/test_lcd_system.py -v`
2. Record a session and analyze it
3. Test with real cluster nodes
4. Profile performance
5. Deploy to hardware

For questions or issues, check:
- Event logs: `/var/log/map2/events/`
- LCD logs: Check application logs
- Database: Query `sqlite3 data/map2.db`

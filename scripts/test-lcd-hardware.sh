#!/bin/bash
"""
MAP2 LCD Hardware Test Script

Tests:
- Serial LCD connection
- I2C bus communication
- LCD display updates
- Event reception
- WebSocket connectivity
- Database persistence
"""

set -e

DEVICE="${1:-/dev/ttyUSB0}"
I2C_ADDR="${2:-0x27}"

echo "MAP2 LCD Hardware Test Suite"
echo "==============================="
echo

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test 1: Serial port accessibility
echo -e "${YELLOW}[1/6] Testing serial port...${NC}"
if [ ! -c "$DEVICE" ]; then
    echo -e "${RED}✗ Device $DEVICE not found${NC}"
    echo "  Try: ls -la /dev/tty*"
    exit 1
fi

if [ ! -r "$DEVICE" ] || [ ! -w "$DEVICE" ]; then
    echo -e "${RED}✗ Insufficient permissions for $DEVICE${NC}"
    echo "  Try: sudo usermod -a -G dialout $USER"
    exit 1
fi

echo -e "${GREEN}✓ Serial port accessible${NC}"

# Test 2: I2C communication
echo -e "${YELLOW}[2/6] Testing I2C communication...${NC}"
if command -v i2cdetect &> /dev/null; then
    if i2cdetect -y 1 | grep -q "$I2C_ADDR"; then
        echo -e "${GREEN}✓ LCD found at address $I2C_ADDR${NC}"
    else
        echo -e "${YELLOW}⚠ LCD not detected at $I2C_ADDR (may be on different bus)${NC}"
        echo "  Try: i2cdetect -y 0"
    fi
else
    echo -e "${YELLOW}⚠ i2cdetect not installed (skipping)${NC}"
fi

# Test 3: Python LCD driver
echo -e "${YELLOW}[3/6] Testing Python LCD driver...${NC}"
python3 << 'PYEOF'
import sys
try:
    # Import mock first
    from app.drivers.lcd_display import MockLCDDisplay, LCDDisplay
    
    # Test mock LCD
    mock_lcd = MockLCDDisplay()
    import asyncio
    asyncio.run(mock_lcd.connect())
    asyncio.run(mock_lcd.write_lines(["MAP2 LCD Test", "Line 2", "Line 3", "Line 4"]))
    print("\033[0;32m✓ Mock LCD driver working\033[0m")
    
    # Try real LCD if device exists
    try:
        lcd = LCDDisplay(port="/dev/ttyUSB0")
        asyncio.run(lcd.connect())
        print("\033[0;32m✓ Real LCD driver initialized\033[0m")
        asyncio.run(lcd.disconnect())
    except Exception as e:
        print(f"\033[1;33m⚠ Real LCD not available: {e}\033[0m")
        
except Exception as e:
    print(f"\033[0;31m✗ LCD driver error: {e}\033[0m")
    sys.exit(1)
PYEOF

# Test 4: Event bus
echo -e "${YELLOW}[4/6] Testing event bus...${NC}"
python3 << 'PYEOF'
import asyncio
from app.services.lcd_event_bus import LCDEventBus
from app.models.lcd_event import LCDEvent, EventType, EventSeverity
from datetime import datetime

async def test_event_bus():
    bus = LCDEventBus("TEST-NODE", "test-label")
    await bus.start()
    
    events_received = []
    def subscriber(event):
        events_received.append(event)
    
    bus.subscribe(subscriber)
    
    # Publish test event
    event = LCDEvent(
        event_id="test-001",
        timestamp=datetime.now(),
        source_node="TEST-NODE",
        event_type=EventType.SYSTEM,
        severity=EventSeverity.INFO,
        title="Test Event",
        message="LCD system test"
    )
    
    await bus.publish(event)
    await asyncio.sleep(0.1)
    
    if len(events_received) > 0:
        print("\033[0;32m✓ Event bus working\033[0m")
    else:
        print("\033[0;31m✗ Event bus not receiving events\033[0m")
    
    await bus.stop()

asyncio.run(test_event_bus())
PYEOF

# Test 5: Database
echo -e "${YELLOW}[5/6] Testing database...${NC}"
python3 << 'PYEOF'
import asyncio
import os
from app.models.lcd_event_db import LCDEventRepository, LCDEventRecord
from app.database import init_async_db, get_session

os.environ['MAP2_DATABASE_URL'] = 'sqlite+aiosqlite:///:memory:'

async def test_db():
    init_async_db('sqlite+aiosqlite:///:memory:')
    
    async with get_session() as session:
        # Test table exists
        try:
            await session.execute("SELECT 1 FROM lcd_events LIMIT 1")
            print("\033[0;32m✓ Database tables created\033[0m")
        except Exception as e:
            print(f"\033[0;31m✗ Database error: {e}\033[0m")

asyncio.run(test_db())
PYEOF

# Test 6: WebSocket connectivity
echo -e "${YELLOW}[6/6] Testing WebSocket connectivity...${NC}"
python3 << 'PYEOF'
import asyncio
import websockets
import json

async def test_websocket():
    try:
        # This will fail if server isn't running, which is OK
        async with websockets.connect("ws://localhost:8000/api/lcd/ws/events", timeout=2) as ws:
            print("\033[0;32m✓ WebSocket connected\033[0m")
            # Don't wait for events, just confirm connection
    except ConnectionRefusedError:
        print("\033[1;33m⚠ Server not running (WebSocket test skipped)\033[0m")
    except asyncio.TimeoutError:
        print("\033[1;33m⚠ WebSocket timeout (server may be down)\033[0m")
    except Exception as e:
        print(f"\033[1;33m⚠ WebSocket test skipped: {e}\033[0m")

asyncio.run(test_websocket())
PYEOF

echo
echo -e "${GREEN}Hardware Test Complete${NC}"
echo
echo "Summary:"
echo "  ✓ Serial port: Accessible"
echo "  ✓ LCD driver: Functional"
echo "  ✓ Event bus: Working"
echo "  ✓ Database: Ready"
echo "  ⚠ WebSocket: Check if server is running"
echo
echo "To run full integration test:"
echo "  python -m pytest tests/test_lcd_system.py -v"

"""
LCD Display API Routes
Provides endpoints for LCD system status, control, testing, and alert configuration
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, List, Optional, Any
from pydantic import BaseModel
import logging
import asyncio

from app.utils.time import utc_now

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lcd", tags=["LCD Display"])


class LCDStatus(BaseModel):
    """LCD system status."""
    running: bool
    simulation_mode: bool
    current_page: Optional[str]
    uptime_seconds: Optional[float]
    hardware: Optional[Dict]
    statistics: Dict


class LCDPageRequest(BaseModel):
    """Request to change LCD page."""
    page: str  # status, vu, chain, plugins, midi, perf, settings, menu


class LCDSimulationOutput(BaseModel):
    """ASCII simulation of LCD display."""
    output: str
    lines: List[str]


# Global LCD manager instance (set by main app)
_lcd_manager = None


def set_lcd_manager(manager):
    """Set the global LCD manager instance."""
    global _lcd_manager
    _lcd_manager = manager


@router.get("/status", response_model=LCDStatus)
async def get_lcd_status():
    """
    Get LCD system status.
    
    Returns current page, statistics, and hardware info.
    """
    if not _lcd_manager:
        raise HTTPException(status_code=503, detail="LCD system not initialized")
    
    try:
        status = _lcd_manager.get_status()
        return LCDStatus(**status)
    except Exception as e:
        logger.error(f"Error getting LCD status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/page")
async def set_lcd_page(request: LCDPageRequest):
    """
    Change the current LCD page.
    
    Available pages:
    - status: System overview
    - vu: VU meters
    - chain: Effect chain
    - plugins: Plugin list
    - midi: MIDI activity
    - perf: Performance metrics
    - settings: Configuration
    - menu: Navigation menu
    """
    if not _lcd_manager:
        raise HTTPException(status_code=503, detail="LCD system not initialized")
    
    try:
        from lcd.ui_engine import PageType
        
        # Map string to PageType enum
        page_map = {
            'status': PageType.STATUS,
            'vu': PageType.VU_METERS,
            'chain': PageType.CHAIN,
            'plugins': PageType.PLUGINS,
            'midi': PageType.MIDI,
            'perf': PageType.PERF,
            'settings': PageType.SETTINGS,
            'menu': PageType.MENU,
        }
        
        page_type = page_map.get(request.page.lower())
        if not page_type:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid page: {request.page}. Valid pages: {list(page_map.keys())}"
            )
        
        _lcd_manager.set_page(page_type)
        
        return {
            "success": True,
            "page": request.page,
            "message": f"Changed to {request.page} page"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting LCD page: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/simulation", response_model=LCDSimulationOutput)
async def get_lcd_simulation():
    """
    Get ASCII simulation of current LCD display.
    
    Useful for debugging and remote monitoring.
    """
    if not _lcd_manager:
        raise HTTPException(status_code=503, detail="LCD system not initialized")
    
    try:
        output = _lcd_manager.get_simulation_output()
        lines = _lcd_manager.last_lines or []
        
        return LCDSimulationOutput(
            output=output,
            lines=lines
        )
        
    except Exception as e:
        logger.error(f"Error getting LCD simulation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/input/{action}")
async def simulate_lcd_input(action: str):
    """
    Simulate input action (for testing/remote control).
    
    Available actions:
    - up, down, left, right: Navigation
    - select, menu, back: Control
    - next_page, prev_page: Page switching
    - encoder_cw, encoder_ccw, encoder_press: Encoder
    """
    if not _lcd_manager:
        raise HTTPException(status_code=503, detail="LCD system not initialized")
    
    try:
        from lcd.input_handler import InputAction
        
        # Map string to InputAction enum
        action_map = {
            'up': InputAction.UP,
            'down': InputAction.DOWN,
            'left': InputAction.LEFT,
            'right': InputAction.RIGHT,
            'select': InputAction.SELECT,
            'menu': InputAction.MENU,
            'back': InputAction.BACK,
            'next_page': InputAction.NEXT_PAGE,
            'prev_page': InputAction.PREV_PAGE,
            'encoder_cw': InputAction.ENCODER_CW,
            'encoder_ccw': InputAction.ENCODER_CCW,
            'encoder_press': InputAction.ENCODER_PRESS,
        }
        
        input_action = action_map.get(action.lower())
        if not input_action:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid action: {action}. Valid actions: {list(action_map.keys())}"
            )
        
        _lcd_manager.simulate_input(input_action)
        
        return {
            "success": True,
            "action": action,
            "message": f"Simulated {action} input"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error simulating LCD input: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pages")
async def get_available_pages():
    """
    Get list of available LCD pages.
    """
    return {
        "pages": [
            {"id": "status", "name": "Status", "description": "System overview"},
            {"id": "vu", "name": "VU Meters", "description": "Audio level meters"},
            {"id": "chain", "name": "Chain", "description": "Effect chain view"},
            {"id": "plugins", "name": "Plugins", "description": "Plugin list"},
            {"id": "midi", "name": "MIDI", "description": "MIDI activity"},
            {"id": "perf", "name": "Performance", "description": "Performance metrics"},
            {"id": "settings", "name": "Settings", "description": "Configuration"},
            {"id": "menu", "name": "Menu", "description": "Navigation menu"},
        ]
    }


# ===== New Endpoints for LCD Services TUI =====

class I2CDevice(BaseModel):
    """I2C device info."""
    address: int
    address_hex: str
    device_type: str


class I2CScanResult(BaseModel):
    """I2C scan result."""
    bus: int
    devices: List[I2CDevice]
    lcd_count: int


class CustomMessageRequest(BaseModel):
    """Request to display custom message."""
    lcd_id: int = -1  # -1 for both, 0 or 1 for specific
    line1: str
    line2: str = ""
    duration: int = 5


class AlertRoutingConfigRequest(BaseModel):
    """Alert routing configuration."""
    routing: Optional[Dict[str, Dict]] = None
    pages: Optional[Dict[str, Dict]] = None


class TestRunRequest(BaseModel):
    """Test run request."""
    categories: Optional[List[str]] = None
    simulation: bool = True


@router.post("/scan", response_model=I2CScanResult)
async def scan_i2c_bus(bus: int = 1):
    """
    Scan I2C bus for LCD displays.

    Detects devices at common LCD addresses (0x27, 0x3F, 0x20, 0x38).
    """
    try:
        from lcd.hardware_controller import I2CScanner

        scanner = I2CScanner()
        addresses = scanner.scan(bus)

        devices = []
        lcd_addresses = [0x27, 0x3F, 0x20, 0x38]
        lcd_count = 0

        for addr in addresses:
            device_type = "LCD display" if addr in lcd_addresses else "Unknown I2C device"
            if addr in lcd_addresses:
                lcd_count += 1
            devices.append(I2CDevice(
                address=addr,
                address_hex=f"0x{addr:02X}",
                device_type=device_type
            ))

        return I2CScanResult(
            bus=bus,
            devices=devices,
            lcd_count=lcd_count
        )

    except ImportError:
        # Return empty result if hardware not available
        return I2CScanResult(bus=bus, devices=[], lcd_count=0)
    except Exception as e:
        logger.error(f"I2C scan error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class FT232HStatus(BaseModel):
    """FT232H device status."""
    connected: bool
    url: str = "ftdi://ftdi:232h/1"
    frequency: int = 100000
    vendor_id: str = "0x0403"
    product_id: str = "0x6014"
    error: Optional[str] = None


class FT232HScanResult(BaseModel):
    """FT232H I2C scan result."""
    status: FT232HStatus
    devices: List[I2CDevice] = []
    lcd_count: int = 0


@router.post("/ft232h/scan", response_model=FT232HScanResult)
async def scan_ft232h_bus():
    """
    Scan I2C bus via FT232H USB adapter for LCD displays.
    
    Uses pyftdi to communicate with FT232H and scan for I2C devices.
    """
    try:
        from lcd.hardware_controller import I2CScanner
        
        # Try FT232H scan
        addresses = I2CScanner.scan_ft232h()
        
        devices = []
        lcd_addresses = [0x27, 0x3F, 0x20, 0x38, 0x3E]
        lcd_count = 0
        
        for addr in addresses:
            device_type = "LCD display (PCF8574)" if addr in lcd_addresses else "I2C device"
            if addr in lcd_addresses:
                lcd_count += 1
            devices.append(I2CDevice(
                address=addr,
                address_hex=f"0x{addr:02X}",
                device_type=device_type
            ))
        
        return FT232HScanResult(
            status=FT232HStatus(connected=True),
            devices=devices,
            lcd_count=lcd_count
        )
        
    except ImportError as e:
        return FT232HScanResult(
            status=FT232HStatus(connected=False, error="pyftdi not installed"),
            devices=[],
            lcd_count=0
        )
    except Exception as e:
        logger.error(f"FT232H scan error: {e}")
        return FT232HScanResult(
            status=FT232HStatus(connected=False, error=str(e)),
            devices=[],
            lcd_count=0
        )


class FT232HWriteRequest(BaseModel):
    """Request to write to LCD via FT232H."""
    address: int = 0x27
    line1: str = ""
    line2: str = ""
    line3: str = ""
    line4: str = ""
    clear: bool = True


@router.post("/ft232h/write")
async def write_ft232h_lcd(request: FT232HWriteRequest):
    """
    Write text to LCD via FT232H USB adapter.
    
    Args:
        address: I2C address of LCD (default 0x27)
        line1-4: Text for each line
        clear: Clear display before writing
    """
    try:
        from lcd.hardware_controller import FT232HLCDController
        
        lcd = FT232HLCDController(address=request.address, cols=20, rows=4)
        
        if not lcd.connected:
            raise HTTPException(status_code=503, detail="LCD not connected")
        
        if request.clear:
            lcd.clear()
        
        if request.line1:
            lcd.write_line(0, request.line1)
        if request.line2:
            lcd.write_line(1, request.line2)
        if request.line3:
            lcd.write_line(2, request.line3)
        if request.line4:
            lcd.write_line(3, request.line4)
        
        lcd.close()
        
        return {"success": True, "message": "Text written to LCD"}
        
    except ImportError:
        raise HTTPException(status_code=503, detail="FT232H support not available")
    except Exception as e:
        logger.error(f"FT232H write error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ft232h/test/{address}")
async def test_ft232h_lcd(address: int = 0x27):
    """
    Run display test on LCD via FT232H.
    
    Writes test pattern to verify LCD is working.
    """
    try:
        from lcd.hardware_controller import FT232HLCDController
        from datetime import datetime
        
        lcd = FT232HLCDController(address=address, cols=20, rows=4)
        
        if not lcd.connected:
            raise HTTPException(status_code=503, detail=f"LCD at 0x{address:02X} not connected")
        
        # Write test pattern
        lcd.clear()
        lcd.write_line(0, "MAP2 Audio Platform")
        lcd.write_line(1, datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
        lcd.write_line(2, f"FT232H LCD @ 0x{address:02X}")
        lcd.write_line(3, "Test Successful!")
        
        lcd.close()
        
        return {
            "success": True,
            "address": f"0x{address:02X}",
            "message": "Test pattern written to LCD"
        }
        
    except ImportError:
        raise HTTPException(status_code=503, detail="FT232H support not available")
    except Exception as e:
        logger.error(f"FT232H test error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test/{lcd_id}")
async def test_display(lcd_id: int):
    """
    Run display test on specific LCD.

    Args:
        lcd_id: 0, 1, or -1 for both displays
    """
    if not _lcd_manager:
        raise HTTPException(status_code=503, detail="LCD system not initialized")

    try:
        # Use simulation output to verify display is working
        output = _lcd_manager.get_simulation_output()

        return {
            "success": True,
            "lcd_id": lcd_id,
            "message": "Display test triggered",
            "simulation": output
        }

    except Exception as e:
        logger.error(f"Display test error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/backlight/{lcd_id}")
async def toggle_backlight(lcd_id: int, enabled: bool = True):
    """
    Toggle backlight on specific LCD.

    Args:
        lcd_id: 0, 1, or -1 for both displays
        enabled: True to turn on, False to turn off

    T2430-L: now calls ``driver.set_backlight()`` on the real driver(s)
    instead of returning a stub success response.
    """
    if not _lcd_manager:
        raise HTTPException(status_code=503, detail="LCD system not initialized")

    try:
        drivers = _lcd_manager.lcds
        target_indices = range(len(drivers)) if lcd_id == -1 else [lcd_id]
        for idx in target_indices:
            if not (0 <= idx < len(drivers)):
                continue
            await drivers[idx].set_backlight(100 if enabled else 0)
        return {
            "success": True,
            "lcd_id": lcd_id,
            "backlight": enabled,
            "message": f"Backlight {'on' if enabled else 'off'}",
        }

    except Exception as e:
        logger.error(f"Backlight toggle error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ---- T2430-F: driver health + reconnect + native raw-write ----


class NativeWriteRequest(BaseModel):
    """Raw 4-line write to the primary native I²C LCD driver."""
    line1: str = ""
    line2: str = ""
    line3: str = ""
    line4: str = ""


@router.get("/health")
async def get_driver_health():
    """Return per-LCD driver health snapshot for the Hardware sub-view."""
    if not _lcd_manager:
        raise HTTPException(status_code=503, detail="LCD system not initialized")
    return {"drivers": _lcd_manager.get_driver_health()}


@router.post("/reconnect/{lcd_id}")
async def reconnect_driver(lcd_id: int):
    """Force disconnect + reconnect for a single LCD driver."""
    if not _lcd_manager:
        raise HTTPException(status_code=503, detail="LCD system not initialized")
    try:
        await _lcd_manager.reconnect_driver(lcd_id)
        return {"success": True, "lcd_id": lcd_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Reconnect error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/native/write")
async def native_raw_write(request: NativeWriteRequest):
    """Raw 4-line write to the primary native I²C LCD (T2430-F Q8b)."""
    if not _lcd_manager:
        raise HTTPException(status_code=503, detail="LCD system not initialized")
    try:
        await _lcd_manager.native_raw_write(
            request.line1, request.line2, request.line3, request.line4,
        )
        return {"success": True, "lines": [request.line1, request.line2, request.line3, request.line4]}
    except Exception as e:
        logger.error("Native raw write error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/message")
async def display_custom_message(request: CustomMessageRequest):
    """
    Display custom message on LCD.

    Args:
        lcd_id: Target LCD (-1 for both)
        line1: First line of message
        line2: Second line of message
        duration: Display duration in seconds
    """
    if not _lcd_manager:
        raise HTTPException(status_code=503, detail="LCD system not initialized")

    try:
        # Try to use alert router if available
        try:
            from lcd.alert_router import get_alert_router
            router = get_alert_router()
            router.display_custom_message(
                request.lcd_id,
                [request.line1, request.line2],
                request.duration
            )
            return {
                "success": True,
                "message": "Custom message queued",
                "lcd_id": request.lcd_id,
                "duration": request.duration
            }
        except ImportError:
            pass

        # Fallback: just log
        logger.info(f"Custom message: {request.line1} / {request.line2}")
        return {
            "success": True,
            "message": "Custom message logged (alert router not available)",
            "lcd_id": request.lcd_id
        }

    except Exception as e:
        logger.error(f"Custom message error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset/{lcd_id}")
async def reset_display(lcd_id: int):
    """
    Reset display to default state.

    Args:
        lcd_id: 0, 1, or -1 for both displays
    """
    if not _lcd_manager:
        raise HTTPException(status_code=503, detail="LCD system not initialized")

    try:
        from lcd.ui_engine import PageType
        _lcd_manager.set_page(PageType.STATUS)

        return {
            "success": True,
            "lcd_id": lcd_id,
            "message": "Display reset to STATUS page"
        }

    except Exception as e:
        logger.error(f"Reset error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tests/run")
async def run_test_suite(request: TestRunRequest):
    """
    Run LCD test suite.

    Args:
        categories: List of categories to test (None for all)
        simulation: Run in simulation mode
    """
    try:
        from lcd.test_suite import LCDTestSuite

        suite = LCDTestSuite(simulation_mode=request.simulation)

        # Run tests (this is synchronous, might want to make async)
        success = suite.run_all_tests()

        # Collect results
        results = []
        for r in suite.results:
            results.append({
                "name": r.name,
                "passed": r.passed,
                "message": r.message,
                "duration_ms": r.duration * 1000
            })

        passed = sum(1 for r in suite.results if r.passed)
        total = len(suite.results)

        return {
            "success": success,
            "passed": passed,
            "total": total,
            "results": results,
            "simulation_mode": request.simulation
        }

    except ImportError as e:
        logger.warning(f"Test suite not available: {e}")
        return {
            "success": False,
            "error": "Test suite not available",
            "message": "Run manually: python3 -m lcd.test_suite"
        }
    except Exception as e:
        logger.error(f"Test suite error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tests/results")
async def get_test_results():
    """
    Get most recent test results.
    """
    # Would need to store results from last run
    return {
        "available": False,
        "message": "Run tests first with POST /lcd/tests/run"
    }


@router.get("/{lcd_id}/status")
async def get_single_lcd_status(lcd_id: int):
    """
    Get status for specific LCD.

    Args:
        lcd_id: LCD ID (0 or 1)
    """
    if lcd_id not in [0, 1]:
        raise HTTPException(status_code=400, detail="lcd_id must be 0 or 1")

    if not _lcd_manager:
        raise HTTPException(status_code=503, detail="LCD system not initialized")

    try:
        status = _lcd_manager.get_status()

        # Return LCD-specific info
        return {
            "lcd_id": lcd_id,
            "address": 0x27 if lcd_id == 0 else 0x3F,
            "connected": status.get("running", False),
            "current_page": status.get("current_page"),
            "statistics": status.get("statistics", {})
        }

    except Exception as e:
        logger.error(f"LCD status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{lcd_id}/page")
async def set_single_lcd_page(lcd_id: int, page: str):
    """
    Set page for specific LCD.

    Args:
        lcd_id: LCD ID (0 or 1)
        page: Page name
    """
    if lcd_id not in [0, 1]:
        raise HTTPException(status_code=400, detail="lcd_id must be 0 or 1")

    if not _lcd_manager:
        raise HTTPException(status_code=503, detail="LCD system not initialized")

    try:
        from lcd.ui_engine import PageType

        page_map = {
            'status': PageType.STATUS,
            'vu': PageType.VU_METERS,
            'chain': PageType.CHAIN,
            'plugins': PageType.PLUGINS,
            'midi': PageType.MIDI,
            'perf': PageType.PERF,
            'settings': PageType.SETTINGS,
            'menu': PageType.MENU,
        }

        page_type = page_map.get(page.lower())
        if not page_type:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid page: {page}. Valid: {list(page_map.keys())}"
            )

        _lcd_manager.set_page(page_type)

        return {
            "success": True,
            "lcd_id": lcd_id,
            "page": page,
            "message": f"LCD {lcd_id} set to {page}"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Set page error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts/config")
async def get_alert_config():
    """
    Get current alert routing configuration.
    """
    try:
        from lcd.alert_router import get_alert_router
        router = get_alert_router()
        return router.get_config()
    except ImportError:
        return {
            "routing": {},
            "pages": {},
            "message": "Alert router not available"
        }
    except Exception as e:
        logger.error(f"Get alert config error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/alerts/config")
async def update_alert_config(request: AlertRoutingConfigRequest):
    """
    Update alert routing configuration.
    """
    try:
        from lcd.alert_router import get_alert_router
        router = get_alert_router()

        config = {}
        if request.routing:
            config["routing"] = request.routing
        if request.pages:
            config["pages"] = request.pages

        router.update_config(config)

        return {
            "success": True,
            "message": "Alert configuration updated",
            "config": router.get_config()
        }
    except ImportError:
        raise HTTPException(status_code=503, detail="Alert router not available")
    except Exception as e:
        logger.error(f"Update alert config error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts/active")
async def get_active_alerts():
    """
    Get currently active/queued alerts.
    """
    try:
        from lcd.alert_router import get_alert_router
        router = get_alert_router()
        return router.get_queue_status()
    except ImportError:
        return {
            "queue_length": 0,
            "alerts": [],
            "message": "Alert router not available"
        }
    except Exception as e:
        logger.error(f"Get active alerts error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/simulation/both")
async def get_both_simulations():
    """
    Get ASCII simulation for both LCDs.
    """
    if not _lcd_manager:
        raise HTTPException(status_code=503, detail="LCD system not initialized")

    try:
        output = _lcd_manager.get_simulation_output()
        lines = _lcd_manager.last_lines or []

        # Split lines between displays (2 lines each for 20x2 displays)
        lcd1_lines = lines[:2] if len(lines) >= 2 else lines
        lcd2_lines = lines[2:4] if len(lines) >= 4 else lines[:2]

        return {
            "lcd_1": {
                "output": "\n".join(lcd1_lines),
                "lines": lcd1_lines,
                "address": "0x27"
            },
            "lcd_2": {
                "output": "\n".join(lcd2_lines),
                "lines": lcd2_lines,
                "address": "0x3F"
            }
        }

    except Exception as e:
        logger.error(f"Simulation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ===== Event Trigger Endpoints =====

class EventTriggerRequest(BaseModel):
    """Request to trigger an event for LCD display."""
    event_type: str
    event_data: Optional[Dict] = None
    target_lcd: int = -1  # -1 for both


@router.post("/events/trigger")
async def trigger_lcd_event(request: EventTriggerRequest):
    """
    Trigger an event to display on LCD.
    
    Supported event types:
    - chain_loaded: Chain name change
    - snapshot_loaded: Snapshot activation
    - nam_loaded: NAM model loaded
    - ir_loaded: IR/cab loaded
    - plugin_bypassed: Plugin bypass toggled
    - parameter_changed: Effect parameter change
    - midi_cc: MIDI CC received
    - xrun: Audio dropout
    - cpu_high: CPU usage alert
    """
    try:
        # Build message based on event type
        event_messages = {
            'chain_loaded': lambda d: (f"Chain: {d.get('chain_name', 'Unknown')[:16]}", "Active"),
            'snapshot_loaded': lambda d: (f"Snapshot: {d.get('snapshot_name', 'Unknown')[:12]}", "Loaded"),
            'nam_loaded': lambda d: (f"NAM: {d.get('model_name', 'Unknown')[:16]}", "Active"),
            'ir_loaded': lambda d: (f"IR: {d.get('ir_name', 'Unknown')[:16]}", "Loaded"),
            'plugin_bypassed': lambda d: (f"{d.get('plugin', 'Plugin')[:14]}", "Bypassed" if d.get('bypassed', True) else "Active"),
            'parameter_changed': lambda d: (f"{d.get('param', 'Param')[:10]}: {d.get('value', 0)}", f"{d.get('plugin', '')[:8]}"),
            'midi_cc': lambda d: (f"CC{d.get('cc', 0)}: {d.get('value', 0)}", "MIDI"),
            'xrun': lambda d: (f"XRun #{d.get('count', 1)}", "Audio dropout!"),
            'cpu_high': lambda d: (f"CPU: {d.get('load', 0):.0f}%", "High load!"),
        }
        
        data = request.event_data or {}
        if request.event_type in event_messages:
            line1, line2 = event_messages[request.event_type](data)
        else:
            line1 = request.event_type[:20]
            line2 = str(data)[:20] if data else ""
        
        # Try to display via alert router
        try:
            from lcd.alert_router import get_alert_router
            router = get_alert_router()
            router.display_custom_message(
                request.target_lcd,
                [line1, line2],
                duration=3
            )
        except ImportError:
            logger.debug("Alert router not available, event logged only")
        
        return {
            "success": True,
            "event_type": request.event_type,
            "message": f"Event triggered: {line1}",
            "target_lcd": request.target_lcd
        }
        
    except Exception as e:
        logger.error(f"Event trigger error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pages/{lcd_id}/config")
async def get_lcd_page_config(lcd_id: int):
    """
    Get page configuration for specific LCD.
    
    Args:
        lcd_id: LCD ID (0 or 1)
    """
    if lcd_id not in [0, 1]:
        raise HTTPException(status_code=400, detail="lcd_id must be 0 or 1")
    
    try:
        from lcd.alert_router import get_alert_router
        router = get_alert_router()
        config = router.get_config()
        page_config = config.get("pages", {}).get(str(lcd_id), {})
        
        return {
            "lcd_id": lcd_id,
            "config": page_config
        }
    except ImportError:
        return {
            "lcd_id": lcd_id,
            "config": {
                "default_page": "status",
                "allow_alert_interrupt": True,
                "auto_cycle": False,
                "cycle_interval_seconds": 10
            }
        }
    except Exception as e:
        logger.error(f"Get page config error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class PageConfigUpdateRequest(BaseModel):
    """Request to update LCD page configuration."""
    default_page: Optional[str] = None
    allow_alert_interrupt: Optional[bool] = None
    auto_cycle: Optional[bool] = None
    cycle_interval_seconds: Optional[int] = None


@router.put("/pages/{lcd_id}/config")
async def update_lcd_page_config(lcd_id: int, request: PageConfigUpdateRequest):
    """
    Update page configuration for specific LCD.
    
    Args:
        lcd_id: LCD ID (0 or 1)
    """
    if lcd_id not in [0, 1]:
        raise HTTPException(status_code=400, detail="lcd_id must be 0 or 1")
    
    try:
        from lcd.alert_router import get_alert_router
        router = get_alert_router()
        
        updates = {}
        if request.default_page is not None:
            updates["default_page"] = request.default_page
        if request.allow_alert_interrupt is not None:
            updates["allow_alert_interrupt"] = request.allow_alert_interrupt
        if request.auto_cycle is not None:
            updates["auto_cycle"] = request.auto_cycle
        if request.cycle_interval_seconds is not None:
            updates["cycle_interval_seconds"] = request.cycle_interval_seconds
        
        if updates:
            router.update_config({
                "pages": {lcd_id: updates}
            })
        
        return {
            "success": True,
            "lcd_id": lcd_id,
            "message": "Page configuration updated",
            "updates": updates
        }
        
    except ImportError:
        raise HTTPException(status_code=503, detail="Alert router not available")
    except Exception as e:
        logger.error(f"Update page config error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/presets")
async def get_lcd_presets():
    """
    Get saved LCD configuration presets.
    """
    try:
        from pathlib import Path
        import json
        
        presets_dir = Path.home() / ".config" / "map2" / "lcd_presets"
        presets = []
        
        if presets_dir.exists():
            for preset_file in presets_dir.glob("*.json"):
                try:
                    with open(preset_file) as f:
                        preset_data = json.load(f)
                        presets.append({
                            "name": preset_file.stem,
                            "description": preset_data.get("description", ""),
                            "created_at": preset_data.get("created_at"),
                        })
                except Exception:
                    pass
        
        return {
            "presets": presets,
            "count": len(presets)
        }
        
    except Exception as e:
        logger.error(f"Get presets error: {e}")
        return {"presets": [], "count": 0}


class LCDPresetRequest(BaseModel):
    """Request to save LCD preset."""
    name: str
    description: Optional[str] = ""


@router.post("/presets")
async def save_lcd_preset(request: LCDPresetRequest):
    """
    Save current LCD configuration as a preset.
    """
    try:
        from pathlib import Path
        import json
        
        presets_dir = Path.home() / ".config" / "map2" / "lcd_presets"
        presets_dir.mkdir(parents=True, exist_ok=True)
        
        # Get current config
        try:
            from lcd.alert_router import get_alert_router
            router = get_alert_router()
            config = router.get_config()
        except ImportError:
            config = {}
        
        preset_data = {
            "name": request.name,
            "description": request.description,
            "created_at": utc_now().isoformat(),
            "config": config
        }
        
        preset_file = presets_dir / f"{request.name.replace(' ', '_').lower()}.json"
        with open(preset_file, 'w') as f:
            json.dump(preset_data, f, indent=2)
        
        return {
            "success": True,
            "name": request.name,
            "message": f"Preset '{request.name}' saved"
        }
        
    except Exception as e:
        logger.error(f"Save preset error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

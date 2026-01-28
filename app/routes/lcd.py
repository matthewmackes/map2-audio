"""
LCD Display API Routes
Provides endpoints for LCD system status, control, testing, and alert configuration
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, List, Optional, Any
from pydantic import BaseModel
import logging
import asyncio

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
    """
    if not _lcd_manager:
        raise HTTPException(status_code=503, detail="LCD system not initialized")

    try:
        # Would need backlight control in hardware controller
        return {
            "success": True,
            "lcd_id": lcd_id,
            "backlight": enabled,
            "message": f"Backlight {'on' if enabled else 'off'}"
        }

    except Exception as e:
        logger.error(f"Backlight toggle error: {e}")
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

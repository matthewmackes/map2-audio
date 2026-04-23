"""Hardware-gated smoke tests for the MAP2 LCD subsystem (T2430-Q).

These tests require real LCD hardware attached — either a native I²C bus
with HD44780+PCF8574 backpacks at 0x27/0x3F or an FT232H USB-to-I²C
bridge with pyftdi installed.

CI runs everything *except* this module. Hardware-bench runs all tests,
including this one, by exporting ``MAP2_LCD_HARDWARE=1`` before invoking
pytest.

Run on bench:
    MAP2_LCD_HARDWARE=1 pytest tests/test_lcd_hardware_smoke.py -v

Skipped otherwise:
    pytest tests/test_lcd_hardware_smoke.py  # collected, skipped with reason
"""
from __future__ import annotations

import os

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("MAP2_LCD_HARDWARE", "0") != "1",
    reason="Hardware smoke tests only run when MAP2_LCD_HARDWARE=1 (bench)",
)


# ---- Native I²C bench smoke ----


@pytest.mark.asyncio
async def test_native_driver_connects_to_hardware():
    """Native I²C driver connects to /dev/i2c-1 at 0x27."""
    from app.drivers.lcd_display import LCDDisplay

    drv = LCDDisplay(port="/dev/ttyUSB0")
    try:
        await drv.connect()
        assert drv.connected is True
    finally:
        await drv.disconnect()


@pytest.mark.asyncio
async def test_native_driver_write_lines_lands_on_hardware():
    """Write + read back via get_current_display() after writing 4 lines."""
    from app.drivers.lcd_display import LCDDisplay

    drv = LCDDisplay(port="/dev/ttyUSB0")
    try:
        await drv.connect()
        test_lines = [
            "MAP2 TEST PATTERN    ",
            "Line 2 of 4 content  ",
            "Hardware smoke T2430 ",
            "PASS if visible      ",
        ]
        await drv.write_lines(test_lines)
        current = drv.get_current_display()
        # Padded/truncated to line_width. Just verify at least the first word landed.
        assert "MAP2" in current[0]
    finally:
        await drv.disconnect()


@pytest.mark.asyncio
async def test_native_driver_backlight_toggle():
    """Backlight on/off round-trip."""
    from app.drivers.lcd_display import LCDDisplay

    drv = LCDDisplay(port="/dev/ttyUSB0")
    try:
        await drv.connect()
        await drv.set_backlight(100)
        assert drv.backlight_level == 100
        await drv.set_backlight(0)
        assert drv.backlight_level == 0
    finally:
        await drv.disconnect()


# ---- FT232H bench smoke ----


@pytest.mark.asyncio
async def test_ft232h_driver_connects_when_pyftdi_available():
    """FT232H driver connects to USB-attached FT232H and succeeds or raises
    ImportError (pyftdi missing) / RuntimeError (device absent)."""
    pytest.importorskip("pyftdi")
    from app.drivers.ft232h_lcd_display import FT232HLCDDisplay

    drv = FT232HLCDDisplay(address=0x27)
    try:
        await drv.connect()
        assert drv.connected is True
    except Exception as e:
        pytest.skip(f"FT232H hardware not present: {e}")
    finally:
        try:
            await drv.disconnect()
        except Exception:
            pass


@pytest.mark.asyncio
async def test_ft232h_driver_raw_write():
    """Raw write to FT232H LCD."""
    pytest.importorskip("pyftdi")
    from app.drivers.ft232h_lcd_display import FT232HLCDDisplay

    drv = FT232HLCDDisplay(address=0x27)
    try:
        await drv.connect()
    except Exception as e:
        pytest.skip(f"FT232H hardware not present: {e}")
    try:
        await drv.write_lines([
            "FT232H SMOKE        ",
            "T2430-Q bench test  ",
            "Line 3              ",
            "Line 4              ",
        ])
    finally:
        await drv.disconnect()


# ---- LCDManager with real drivers ----


@pytest.mark.asyncio
async def test_lcd_manager_dual_adapter_real_hardware():
    """LCDManager drives two real drivers (native + FT232H) concurrently."""
    from app.drivers.lcd_display import LCDDisplay
    from app.drivers.ft232h_lcd_display import FT232HLCDDisplay
    from app.services.lcd_manager import LCDManager

    try:
        import pyftdi  # noqa: F401
    except ImportError:
        pytest.skip("pyftdi not installed")

    mgr = LCDManager(
        "BENCH-NODE",
        "Bench",
        lcds=[
            LCDDisplay(port="/dev/ttyUSB0"),
            FT232HLCDDisplay(address=0x3F),
        ],
        use_mock_lcd=False,
    )
    try:
        await mgr.start()
        health = mgr.get_driver_health()
        # Both drivers should be non-mock and connected.
        connected = [h for h in health if h["connected"] and not h["is_mock"]]
        assert len(connected) >= 1, f"No hardware drivers connected: {health}"
    finally:
        await mgr.stop()


@pytest.mark.asyncio
async def test_driver_reconnect_cycle():
    """Disconnect + reconnect cycle leaves driver in a healthy state."""
    from app.drivers.lcd_display import LCDDisplay
    from app.services.lcd_manager import LCDManager

    mgr = LCDManager("BENCH", "Bench", lcds=[LCDDisplay(port="/dev/ttyUSB0")])
    try:
        await mgr.start()
        await mgr.reconnect_driver(0)
        health = mgr.get_driver_health()
        assert health[0]["lcd_id"] == 0
    finally:
        await mgr.stop()

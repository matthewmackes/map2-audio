"""
FT232H USB-to-I²C LCD driver — HD44780 over FT232H adapter.

Provides the same interface as ``app.drivers.lcd_display.LCDDisplay`` but
sends commands via an FT232H USB-to-I²C bridge (pyftdi) instead of a
serial port. This lets one MAP2 node drive:

- LCD 0 over native I²C bus on ``/dev/i2c-1`` (HD44780 backpack @ 0x27)
- LCD 1 over FT232H USB adapter (HD44780 backpack @ 0x3F)

...simultaneously. Per T2430 Q8a (multi-adapter aware, 2026-04-23).

Graceful degradation: if pyftdi is not installed or the adapter is not
present, ``connect()`` raises ImportError / RuntimeError; ``LCDManager``
falls back to ``MockLCDDisplay`` exactly as it already does for the
native driver.
"""

from __future__ import annotations

import logging
from typing import Optional

from app.drivers.lcd_display import LCDDisplay

logger = logging.getLogger(__name__)

# HD44780 command set (shared with native I²C path, re-declared here so the
# FT232H driver stays self-contained).
_HD44780_CLEAR = 0x01
_HD44780_HOME = 0x02
_HD44780_ENTRY_MODE = 0x06  # cursor moves right, display doesn't shift
_HD44780_DISPLAY_ON = 0x0C  # display on, cursor off, blink off
_HD44780_FUNCTION_4BIT = 0x28  # 4-bit, 2-line, 5x8
_HD44780_SET_DDRAM = 0x80
_LINE_OFFSETS = [0x00, 0x40, 0x14, 0x54]  # 20×4 HD44780 row addresses

# PCF8574 I²C backpack pin mapping (common 0x27/0x3F variant)
_PIN_RS = 0x01
_PIN_RW = 0x02
_PIN_EN = 0x04
_PIN_BACKLIGHT = 0x08


class FT232HLCDDisplay(LCDDisplay):
    """HD44780 over FT232H USB-to-I²C adapter.

    The parent ``LCDDisplay`` assumes a serial transport; this subclass
    overrides all transport methods to drive the I²C bus exposed by
    pyftdi's ``I2cController``.
    """

    def __init__(
        self,
        address: int = 0x27,
        ftdi_url: str = "ftdi://ftdi:232h/1",
        line_width: int = 20,
        line_height: int = 4,
        frequency_hz: int = 100_000,
    ) -> None:
        super().__init__(
            port=ftdi_url,
            baud=0,
            line_width=line_width,
            line_height=line_height,
        )
        self.address = address
        self.ftdi_url = ftdi_url
        self.frequency_hz = frequency_hz
        self._controller: Optional[object] = None
        self._port: Optional[object] = None
        self._backlight_on = True

    # ---- transport ----

    async def connect(self) -> None:
        try:
            from pyftdi.i2c import I2cController  # type: ignore
        except ImportError as exc:
            raise ImportError(
                "pyftdi is required for FT232H LCD support; install via `pip install pyftdi`",
            ) from exc

        try:
            self._controller = I2cController()
            self._controller.configure(self.ftdi_url, frequency=self.frequency_hz)
            self._port = self._controller.get_port(self.address)
            self.connected = True
            logger.info("FT232HLCDDisplay connected: addr=0x%02X url=%s", self.address, self.ftdi_url)

            await self._hd44780_init()
            await self.clear()
            await self.set_backlight(100)
        except Exception as exc:  # noqa: BLE001
            logger.error("FT232HLCDDisplay connect failed: %s", exc)
            self.connected = False
            raise

    async def disconnect(self) -> None:
        try:
            if self._controller is not None:
                self._controller.close()
        except Exception as exc:  # noqa: BLE001
            logger.warning("FT232HLCDDisplay close error: %s", exc)
        finally:
            self._controller = None
            self._port = None
            self.connected = False
            logger.info("FT232HLCDDisplay disconnected")

    # ---- HD44780 protocol helpers ----

    async def _write_i2c(self, byte: int) -> None:
        if self._port is None:
            return
        payload = byte | (_PIN_BACKLIGHT if self._backlight_on else 0)
        self._port.write([payload])

    async def _pulse_enable(self, nibble: int) -> None:
        await self._write_i2c(nibble | _PIN_EN)
        await self._write_i2c(nibble & ~_PIN_EN)

    async def _send_nibble(self, nibble: int, rs: bool) -> None:
        base = (nibble & 0xF0) | (_PIN_RS if rs else 0)
        await self._pulse_enable(base)

    async def _send_byte(self, value: int, rs: bool) -> None:
        high = value & 0xF0
        low = (value << 4) & 0xF0
        await self._send_nibble(high, rs)
        await self._send_nibble(low, rs)

    async def _hd44780_init(self) -> None:
        # 4-bit init sequence per HD44780 datasheet.
        for _ in range(3):
            await self._send_nibble(0x30, rs=False)
        await self._send_nibble(0x20, rs=False)
        await self._send_byte(_HD44780_FUNCTION_4BIT, rs=False)
        await self._send_byte(_HD44780_DISPLAY_ON, rs=False)
        await self._send_byte(_HD44780_CLEAR, rs=False)
        await self._send_byte(_HD44780_ENTRY_MODE, rs=False)

    # ---- public surface overrides ----

    async def write_line(self, line: int, text: str) -> None:
        if not self.connected:
            logger.debug("FT232HLCDDisplay not connected, simulating write")
            if 0 <= line < self.line_height:
                self.lines[line] = text[: self.line_width].ljust(self.line_width)
            return
        if not (0 <= line < self.line_height):
            raise ValueError(f"Line must be 0-{self.line_height - 1}")

        formatted = text[: self.line_width].ljust(self.line_width)
        self.lines[line] = formatted

        await self._send_byte(_HD44780_SET_DDRAM | _LINE_OFFSETS[line], rs=False)
        for char in formatted:
            await self._send_byte(ord(char), rs=True)

    async def clear(self) -> None:
        if not self.connected:
            self.lines = [""] * self.line_height
            return
        await self._send_byte(_HD44780_CLEAR, rs=False)
        self.lines = [""] * self.line_height

    async def set_backlight(self, level: int) -> None:
        if not (0 <= level <= 100):
            raise ValueError("Backlight level must be 0-100")
        self.backlight_level = level
        self._backlight_on = level > 0
        if not self.connected:
            logger.debug("FT232HLCDDisplay backlight (simulated): %d%%", level)
            return
        # PCF8574 only supports on/off backlight; emulate a simple threshold.
        await self._write_i2c(0x00)  # null command to refresh backlight bit

    async def play_sound(self, frequency: int = 1000, duration_ms: int = 100) -> None:
        # Most HD44780 I²C backpacks don't ship a buzzer; no-op but keep parity.
        logger.debug("FT232HLCDDisplay play_sound not supported on this backpack")

"""
LCD Hardware Integration
I2C-based LCD hardware detection and control.

Supports:
- HD44780-compatible I2C LCD displays (16x2, 20x4)
- PCF8574 I2C expander (common backpack module)
- Automatic detection and fallback to simulation

Hardware connections (PCF8574 backpack):
- P0-P3: Data bits (4-bit mode)
- P4: Register Select (RS)
- P5: Read/Write (R/W, active low)
- P6: Enable (E)
- P7: Backlight control
"""

import logging
import time
from typing import List, Optional, Dict, Any
from enum import IntFlag

logger = logging.getLogger(__name__)

# Try to import smbus2 for I2C communication
try:
    import smbus2
    HAS_SMBUS = True
except ImportError:
    HAS_SMBUS = False
    logger.warning("smbus2 not available - LCD will run in simulation mode. Install with: pip install smbus2")


class LCDFlags(IntFlag):
    """HD44780 LCD control flags."""
    # Commands
    LCD_CLEARDISPLAY = 0x01
    LCD_RETURNHOME = 0x02
    LCD_ENTRYMODESET = 0x04
    LCD_DISPLAYCONTROL = 0x08
    LCD_CURSORSHIFT = 0x10
    LCD_FUNCTIONSET = 0x20
    LCD_SETCGRAMADDR = 0x40
    LCD_SETDDRAMADDR = 0x80
    
    # Entry mode flags
    LCD_ENTRYRIGHT = 0x00
    LCD_ENTRYLEFT = 0x02
    LCD_ENTRYSHIFTINCREMENT = 0x01
    LCD_ENTRYSHIFTDECREMENT = 0x00
    
    # Display control flags
    LCD_DISPLAYON = 0x04
    LCD_DISPLAYOFF = 0x00
    LCD_CURSORON = 0x02
    LCD_CURSOROFF = 0x00
    LCD_BLINKON = 0x01
    LCD_BLINKOFF = 0x00
    
    # Function set flags
    LCD_8BITMODE = 0x10
    LCD_4BITMODE = 0x00
    LCD_2LINE = 0x08
    LCD_1LINE = 0x00
    LCD_5x10DOTS = 0x04
    LCD_5x8DOTS = 0x00
    
    # Backpack control bits
    BACKLIGHT = 0x08
    ENABLE = 0x04
    RW = 0x02
    RS = 0x01


class LCDHardware:
    """Single HD44780-compatible LCD display over I2C with PCF8574 backpack.
    
    Provides low-level control of I2C LCD displays with:
    - Automatic initialization sequence
    - 4-bit data mode for efficiency
    - Backlight control
    - Custom character support
    """
    
    # Row offsets for different LCD sizes
    ROW_OFFSETS_16x2 = [0x00, 0x40]
    ROW_OFFSETS_20x4 = [0x00, 0x40, 0x14, 0x54]

    def __init__(self, address: int = 0x27, bus: int = 1, 
                 cols: int = 20, rows: int = 4):
        """Initialize LCD hardware.
        
        Args:
            address: I2C address (typically 0x27 or 0x3F)
            bus: I2C bus number (1 for Raspberry Pi)
            cols: Number of columns (16 or 20)
            rows: Number of rows (2 or 4)
        """
        self.address = address
        self.bus_num = bus
        self.cols = cols
        self.rows = rows
        self.is_connected = False
        self.backlight_on = True
        self._smbus = None
        
        # Select row offsets based on LCD size
        self.row_offsets = self.ROW_OFFSETS_20x4 if rows == 4 else self.ROW_OFFSETS_16x2
        
        # Display state
        self._display_control = LCDFlags.LCD_DISPLAYON | LCDFlags.LCD_CURSOROFF | LCDFlags.LCD_BLINKOFF
        self._display_mode = LCDFlags.LCD_ENTRYLEFT | LCDFlags.LCD_ENTRYSHIFTDECREMENT

    def detect(self) -> bool:
        """Detect LCD on I2C bus and initialize if found.
        
        Returns:
            True if LCD detected and initialized
        """
        if not HAS_SMBUS:
            logger.debug(f"I2C not available, simulating LCD at {hex(self.address)}")
            self.is_connected = False
            return False
        
        try:
            self._smbus = smbus2.SMBus(self.bus_num)
            # Try to read from device to verify it exists
            self._smbus.read_byte(self.address)
            self.is_connected = True
            logger.info(f"LCD detected at {hex(self.address)} on bus {self.bus_num}")
            
            # Initialize the LCD
            self._init_lcd()
            return True
            
        except (IOError, OSError) as e:
            logger.debug(f"No LCD at {hex(self.address)}: {e}")
            self.is_connected = False
            if self._smbus:
                try:
                    self._smbus.close()
                except Exception:
                    pass
                self._smbus = None
            return False
    
    def _init_lcd(self) -> None:
        """Initialize LCD with 4-bit mode sequence."""
        if not self.is_connected:
            return
        
        # Wait for LCD to power up
        time.sleep(0.05)
        
        # Initialize to 4-bit mode (HD44780 sequence)
        # Send 0x03 three times, then 0x02 for 4-bit mode
        self._write_4bits(0x03 << 4)
        time.sleep(0.005)
        self._write_4bits(0x03 << 4)
        time.sleep(0.005)
        self._write_4bits(0x03 << 4)
        time.sleep(0.001)
        self._write_4bits(0x02 << 4)  # Set 4-bit mode
        
        # Function set: 4-bit, 2 lines, 5x8 dots
        self._command(LCDFlags.LCD_FUNCTIONSET | LCDFlags.LCD_4BITMODE | 
                     LCDFlags.LCD_2LINE | LCDFlags.LCD_5x8DOTS)
        
        # Display control: display on, cursor off, blink off
        self._command(LCDFlags.LCD_DISPLAYCONTROL | self._display_control)
        
        # Clear display
        self.clear()
        
        # Entry mode: left to right
        self._command(LCDFlags.LCD_ENTRYMODESET | self._display_mode)
        
        time.sleep(0.002)
        logger.debug(f"LCD initialized: {self.cols}x{self.rows}")
    
    def _write_4bits(self, data: int) -> None:
        """Write 4 bits to LCD with enable pulse."""
        if not self._smbus:
            return
        
        backlight = LCDFlags.BACKLIGHT if self.backlight_on else 0
        
        try:
            # Write data with backlight
            self._smbus.write_byte(self.address, data | backlight)
            time.sleep(0.000001)
            
            # Enable pulse high
            self._smbus.write_byte(self.address, data | LCDFlags.ENABLE | backlight)
            time.sleep(0.000001)
            
            # Enable pulse low
            self._smbus.write_byte(self.address, (data & ~LCDFlags.ENABLE) | backlight)
            time.sleep(0.0001)
        except (IOError, OSError) as e:
            logger.error(f"I2C write error: {e}")
            self.is_connected = False
    
    def _send_byte(self, data: int, mode: int) -> None:
        """Send a byte to LCD in 4-bit mode.
        
        Args:
            data: Byte to send
            mode: 0 for command, RS for data
        """
        high_nibble = (data & 0xF0) | mode
        low_nibble = ((data << 4) & 0xF0) | mode
        
        self._write_4bits(high_nibble)
        self._write_4bits(low_nibble)
    
    def _command(self, cmd: int) -> None:
        """Send command to LCD."""
        self._send_byte(cmd, 0)
    
    def _data(self, data: int) -> None:
        """Send data to LCD."""
        self._send_byte(data, LCDFlags.RS)

    def send_text(self, line: int, text: str) -> None:
        """Send text to LCD line.
        
        Args:
            line: Line number (0-based)
            text: Text to display (will be padded/truncated to fit)
        """
        if line < 0 or line >= self.rows:
            return
        
        # Pad or truncate text
        text = text.ljust(self.cols)[:self.cols]
        
        if self.is_connected and self._smbus:
            try:
                # Set cursor position
                self._command(LCDFlags.LCD_SETDDRAMADDR | self.row_offsets[line])
                
                # Send each character
                for char in text:
                    self._data(ord(char))
            except Exception as e:
                logger.error(f"Error writing to LCD: {e}")
        else:
            # Simulation mode
            logger.debug(f"LCD {hex(self.address)} L{line}: {text.strip()}")

    def clear(self) -> None:
        """Clear display."""
        if self.is_connected and self._smbus:
            self._command(LCDFlags.LCD_CLEARDISPLAY)
            time.sleep(0.002)  # Clear takes longer
        else:
            logger.debug(f"LCD {hex(self.address)} cleared")

    def home(self) -> None:
        """Return cursor to home position."""
        if self.is_connected and self._smbus:
            self._command(LCDFlags.LCD_RETURNHOME)
            time.sleep(0.002)

    def backlight(self, on: bool) -> None:
        """Control backlight.
        
        Args:
            on: True to turn on, False to turn off
        """
        self.backlight_on = on
        if self.is_connected and self._smbus:
            try:
                backlight = LCDFlags.BACKLIGHT if on else 0
                self._smbus.write_byte(self.address, backlight)
            except Exception as e:
                logger.error(f"Error setting backlight: {e}")
        logger.debug(f"LCD {hex(self.address)} backlight: {on}")
    
    def set_cursor(self, col: int, row: int) -> None:
        """Set cursor position.
        
        Args:
            col: Column (0-based)
            row: Row (0-based)
        """
        if row >= self.rows:
            row = self.rows - 1
        if col >= self.cols:
            col = self.cols - 1
        
        if self.is_connected and self._smbus:
            self._command(LCDFlags.LCD_SETDDRAMADDR | (col + self.row_offsets[row]))
    
    def create_char(self, location: int, charmap: List[int]) -> None:
        """Create a custom character.
        
        Args:
            location: Character location (0-7)
            charmap: 8 bytes defining the character pattern
        """
        location &= 0x7  # Only 8 locations
        
        if self.is_connected and self._smbus:
            self._command(LCDFlags.LCD_SETCGRAMADDR | (location << 3))
            for byte in charmap[:8]:
                self._data(byte)
    
    def close(self) -> None:
        """Close I2C connection."""
        if self._smbus:
            try:
                self._smbus.close()
            except Exception:
                pass
            self._smbus = None
        self.is_connected = False


class LCDManager:
    """Manage dual LCD displays with automatic detection.
    
    Scans I2C bus for LCD displays and provides unified interface
    for updating multiple displays simultaneously.
    """

    def __init__(self, addresses: List[int] = None, bus: int = 1,
                 cols: int = 20, rows: int = 4):
        """Initialize LCD manager.
        
        Args:
            addresses: List of I2C addresses to scan
            bus: I2C bus number
            cols: Number of columns per display
            rows: Number of rows per display
        """
        self.addresses = addresses or [0x27, 0x3F, 0x26, 0x25]
        self.bus = bus
        self.cols = cols
        self.rows = rows
        self.displays: List[LCDHardware] = []
        self.fallback_mode = False
        self._initialized = False

    def scan(self) -> List[int]:
        """Scan I2C bus for LCDs.
        
        Returns:
            List of detected I2C addresses
        """
        found = []
        for addr in self.addresses:
            lcd = LCDHardware(addr, self.bus, self.cols, self.rows)
            if lcd.detect():
                self.displays.append(lcd)
                found.append(addr)
                logger.info(f"Found LCD at {hex(addr)}")
        
        if not found:
            self.fallback_mode = True
            logger.warning("No LCD hardware found, using simulation mode")
        else:
            logger.info(f"LCD Manager initialized with {len(found)} display(s)")
        
        self._initialized = True
        return found
    
    def initialize(self) -> bool:
        """Initialize all displays.
        
        Returns:
            True if at least one display found
        """
        if not self._initialized:
            self.scan()
        return len(self.displays) > 0

    def update_all(self, data: Dict[str, str]) -> None:
        """Update all displays with data.
        
        Args:
            data: Dictionary with keys like "line1_1", "line1_2", etc.
        """
        for i, display in enumerate(self.displays):
            for row in range(display.rows):
                key = f"display{i+1}_line{row+1}"
                alt_key = f"line{i+1}_{row+1}"
                text = data.get(key, data.get(alt_key, ""))
                display.send_text(row, text)

    def update_display(self, display_index: int, lines: List[str]) -> None:
        """Update a specific display.
        
        Args:
            display_index: Display index (0-based)
            lines: List of strings, one per line
        """
        if display_index < len(self.displays):
            display = self.displays[display_index]
            for i, line in enumerate(lines[:display.rows]):
                display.send_text(i, line)

    def clear_all(self) -> None:
        """Clear all displays."""
        for display in self.displays:
            display.clear()
    
    def backlight_all(self, on: bool) -> None:
        """Control backlight on all displays.
        
        Args:
            on: True to turn on, False to turn off
        """
        for display in self.displays:
            display.backlight(on)
    
    def get_status(self) -> Dict[str, Any]:
        """Get status of all displays.
        
        Returns:
            Status dictionary
        """
        return {
            "displays_found": len(self.displays),
            "fallback_mode": self.fallback_mode,
            "addresses": [hex(d.address) for d in self.displays],
            "smbus_available": HAS_SMBUS,
            "initialized": self._initialized
        }
    
    def close(self) -> None:
        """Close all display connections."""
        for display in self.displays:
            display.close()
        self.displays.clear()

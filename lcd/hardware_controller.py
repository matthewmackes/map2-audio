"""
LCD Hardware Integration - Real I2C Support
Supports HD44780-compatible displays with PCF8574 I2C backpack

Hardware supported:
- Standard 20x2 and 16x2 character LCDs
- PCF8574/PCF8574A I2C backpacks (common cheap modules)
- Multiple displays on same I2C bus
- Custom character upload
- Backlight control
"""

import logging
import time
from typing import List, Optional, Tuple
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Try to import I2C libraries
try:
    import smbus2
    HAS_SMBUS = True
except ImportError:
    HAS_SMBUS = False
    logger.warning("smbus2 not available - install with: pip install smbus2")

try:
    from RPLCD.i2c import CharLCD
    HAS_RPLCD = True
except ImportError:
    HAS_RPLCD = False
    logger.warning("RPLCD not available - install with: pip install RPLCD")


@dataclass
class LCDCapabilities:
    """LCD hardware capabilities."""
    width: int = 20
    height: int = 2
    has_backlight: bool = True
    has_custom_chars: bool = True
    max_custom_chars: int = 8
    i2c_address: int = 0x27
    

class I2CScanner:
    """Scan I2C bus for connected devices."""
    
    @staticmethod
    def scan(bus_num: int = 1) -> List[int]:
        """Scan I2C bus for devices.
        
        Args:
            bus_num: I2C bus number (usually 1 for Raspberry Pi)
            
        Returns:
            List of I2C addresses found
        """
        if not HAS_SMBUS:
            logger.error("smbus2 not available")
            return []
        
        found_addresses = []
        
        try:
            bus = smbus2.SMBus(bus_num)
            
            # Common LCD addresses to check
            common_addresses = [0x27, 0x3F, 0x20, 0x38]
            
            for addr in range(0x03, 0x78):  # Valid I2C address range
                try:
                    bus.read_byte(addr)
                    found_addresses.append(addr)
                    
                    if addr in common_addresses:
                        logger.info(f"Found potential LCD at 0x{addr:02X}")
                    else:
                        logger.debug(f"Found I2C device at 0x{addr:02X}")
                except Exception:
                    pass
            
            bus.close()
            
        except Exception as e:
            logger.error(f"I2C scan failed: {e}")
        
        return found_addresses
    
    @staticmethod
    def detect_lcds(bus_num: int = 1) -> List[Tuple[int, LCDCapabilities]]:
        """Detect LCD displays on I2C bus.
        
        Returns:
            List of (address, capabilities) tuples
        """
        addresses = I2CScanner.scan(bus_num)
        common_lcd_addresses = [0x27, 0x3F, 0x20, 0x38]
        
        detected = []
        for addr in addresses:
            if addr in common_lcd_addresses:
                # Assume standard 20x2 LCD capabilities
                caps = LCDCapabilities(i2c_address=addr)
                detected.append((addr, caps))
        
        return detected


class LCDHardwareController:
    """Low-level LCD hardware controller using RPLCD."""
    
    def __init__(self, address: int = 0x27, bus_num: int = 1,
                 cols: int = 20, rows: int = 2,
                 dotsize: int = 8, charmap: str = 'A02'):
        """Initialize LCD controller.
        
        Args:
            address: I2C address (usually 0x27 or 0x3F)
            bus_num: I2C bus number (usually 1)
            cols: Display width in characters
            rows: Display height in characters
            dotsize: Character cell height (8 or 10)
            charmap: Character map ('A00', 'A02', 'ST0B')
        """
        self.address = address
        self.bus_num = bus_num
        self.cols = cols
        self.rows = rows
        self.lcd = None
        self.connected = False
        self.backlight_on = True
        self.custom_chars_loaded = False
        
        self._connect()
    
    def _connect(self):
        """Connect to LCD hardware."""
        if not HAS_RPLCD:
            logger.error("RPLCD library not available")
            return False
        
        try:
            # PCF8574 expander mode (most common)
            self.lcd = CharLCD(
                i2c_expander='PCF8574',
                address=self.address,
                port=self.bus_num,
                cols=self.cols,
                rows=self.rows,
                dotsize=8,
                charmap='A02',
                auto_linebreaks=False
            )
            
            self.connected = True
            logger.info(f"Connected to LCD at 0x{self.address:02X}")
            
            # Initialize display
            self.clear()
            self.backlight(True)
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to connect to LCD at 0x{self.address:02X}: {e}")
            self.connected = False
            return False
    
    def write_line(self, line: int, text: str, center: bool = False):
        """Write text to a specific line (RT-SAFE: no logging in hot path).
        
        Args:
            line: Line number (0-based)
            text: Text to display
            center: Center the text
        """
        if not self.connected or not self.lcd:
            return
        
        try:
            # Ensure text fits
            text = text[:self.cols]
            
            # Pad to full width
            if center:
                padding = (self.cols - len(text)) // 2
                text = ' ' * padding + text
            
            text = text.ljust(self.cols)
            
            # Move cursor and write
            self.lcd.cursor_pos = (line, 0)
            self.lcd.write_string(text)
            
        except Exception:
            # Silent fail - no logging in hot path
            pass
    
    def write_lines(self, lines: List[str]):
        """Write multiple lines at once.
        
        Args:
            lines: List of strings, one per line
        """
        for i, line in enumerate(lines[:self.rows]):
            self.write_line(i, line)
    
    def clear(self):
        """Clear the display (RT-SAFE: no logging)."""
        if not self.connected or not self.lcd:
            return
        
        try:
            self.lcd.clear()
        except Exception:
            pass  # Silent fail
    
    def backlight(self, on: bool):
        """Control backlight (RT-SAFE: no logging).
        
        Args:
            on: True to turn on, False to turn off
        """
        if not self.connected or not self.lcd:
            return
        
        try:
            self.lcd.backlight_enabled = on
            self.backlight_on = on
        except Exception:
            pass  # Silent fail
    
    def create_custom_char(self, location: int, charmap: List[int]):
        """Create a custom character (RT-SAFE: no logging).
        
        Args:
            location: Character location (0-7)
            charmap: List of 8 bytes defining the character
        """
        if not self.connected or not self.lcd:
            return
        
        if location < 0 or location > 7:
            return  # Silent fail - invalid location
        
        if len(charmap) != 8:
            return  # Silent fail - invalid charmap
        
        try:
            self.lcd.create_char(location, tuple(charmap))
        except Exception as e:
            logger.error(f"Failed to create custom char: {e}")
    
    def load_custom_characters(self, char_dict: dict):
        """Load multiple custom characters.
        
        Args:
            char_dict: Dictionary mapping names to character bitmaps
        """
        # Map from ui_engine CUSTOM_CHARS
        char_mapping = {
            'vu_0': 0,
            'vu_1': 1,
            'vu_2': 2,
            'vu_3': 3,
            'vu_4': 4,
            'vu_5': 5,
            'vu_6': 6,
            'vu_7': 7,
        }
        
        for name, location in char_mapping.items():
            if name in char_dict:
                self.create_custom_char(location, char_dict[name])
        
        self.custom_chars_loaded = True
        logger.info("Custom characters loaded")
    
    def write_custom_char(self, char_location: int):
        """Write a custom character at current cursor position.
        
        Args:
            char_location: Custom character location (0-7)
        """
        if not self.connected or not self.lcd:
            return
        
        try:
            # Custom chars are accessed via chr(0-7)
            self.lcd.write_string(chr(char_location))
        except Exception as e:
            logger.error(f"Failed to write custom char: {e}")
    
    def close(self):
        """Close connection to LCD."""
        if self.lcd:
            try:
                self.clear()
                self.lcd.close()
            except Exception as e:
                logger.error(f"Error closing LCD: {e}")
        
        self.connected = False


class DualLCDController:
    """Controller for dual LCD displays."""
    
    def __init__(self, addresses: List[int] = None, bus_num: int = 1):
        """Initialize dual LCD controller.
        
        Args:
            addresses: List of I2C addresses (default: [0x27, 0x3F])
            bus_num: I2C bus number
        """
        self.addresses = addresses or [0x27, 0x3F]
        self.bus_num = bus_num
        self.displays: List[LCDHardwareController] = []
        self.fallback_mode = False
        
        self._initialize_displays()
    
    def _initialize_displays(self):
        """Initialize all displays."""
        for addr in self.addresses:
            try:
                lcd = LCDHardwareController(
                    address=addr,
                    bus_num=self.bus_num,
                    cols=20,
                    rows=2
                )
                
                if lcd.connected:
                    self.displays.append(lcd)
                    logger.info(f"Initialized LCD at 0x{addr:02X}")
                else:
                    logger.warning(f"Failed to initialize LCD at 0x{addr:02X}")
                    
            except Exception as e:
                logger.error(f"Error initializing LCD at 0x{addr:02X}: {e}")
        
        if not self.displays:
            self.fallback_mode = True
            logger.warning("No LCD hardware found - using simulation mode")
    
    def write_all(self, lines: List[str]):
        """Write same content to all displays.
        
        Args:
            lines: List of lines to display
        """
        for display in self.displays:
            display.write_lines(lines)
    
    def write_display(self, display_index: int, lines: List[str]):
        """Write to specific display.
        
        Args:
            display_index: Index of display (0-based)
            lines: List of lines to display
        """
        if 0 <= display_index < len(self.displays):
            self.displays[display_index].write_lines(lines)
    
    def clear_all(self):
        """Clear all displays."""
        for display in self.displays:
            display.clear()
    
    def backlight_all(self, on: bool):
        """Control backlight on all displays.
        
        Args:
            on: True to turn on, False to turn off
        """
        for display in self.displays:
            display.backlight(on)
    
    def load_custom_chars(self, char_dict: dict):
        """Load custom characters to all displays.
        
        Args:
            char_dict: Dictionary of custom characters
        """
        for display in self.displays:
            display.load_custom_characters(char_dict)
    
    def close_all(self):
        """Close all displays."""
        for display in self.displays:
            display.close()
    
    def get_status(self) -> dict:
        """Get status of all displays.
        
        Returns:
            Dictionary with display status
        """
        return {
            'total_displays': len(self.displays),
            'connected_displays': sum(1 for d in self.displays if d.connected),
            'fallback_mode': self.fallback_mode,
            'addresses': [f"0x{d.address:02X}" for d in self.displays if d.connected]
        }

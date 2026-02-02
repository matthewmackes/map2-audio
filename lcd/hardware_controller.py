"""
LCD Hardware Integration - Real I2C Support
Supports HD44780-compatible displays with PCF8574 I2C backpack

Hardware supported:
- Standard 20x2 and 16x2 character LCDs
- PCF8574/PCF8574A I2C backpacks (common cheap modules)
- FT232H USB-to-I2C controllers
- Multiple displays on same I2C bus
- Custom character upload
- Backlight control
"""

import logging
import time
from typing import List, Optional, Tuple, Dict, Any
from dataclasses import dataclass, field

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

# Try to import FT232H libraries
try:
    from pyftdi.ftdi import Ftdi
    from pyftdi.i2c import I2cController
    HAS_PYFTDI = True
except ImportError:
    HAS_PYFTDI = False
    logger.info("pyftdi not available - install with: pip install pyftdi")


@dataclass
class LCDCapabilities:
    """LCD hardware capabilities."""
    width: int = 20
    height: int = 2
    has_backlight: bool = True
    has_custom_chars: bool = True
    max_custom_chars: int = 8
    i2c_address: int = 0x27


@dataclass
class FT232HDevice:
    """FT232H device information."""
    url: str  # e.g., 'ftdi://ftdi:232h/1'
    serial: str
    description: str
    vendor_id: int = 0x0403
    product_id: int = 0x6014
    connected: bool = False


class FT232HScanner:
    """Scan for connected FT232H USB devices."""

    # FTDI FT232H identifiers
    VENDOR_ID = 0x0403
    PRODUCT_ID = 0x6014  # FT232H specific

    @staticmethod
    def _unload_ftdi_sio() -> bool:
        """Unload ftdi_sio kernel module if loaded.

        The ftdi_sio module conflicts with pyftdi and must be unloaded
        for pyftdi to access FT232H devices.

        Returns:
            True if module was unloaded or not loaded, False on error
        """
        import subprocess

        try:
            # Check if module is loaded
            result = subprocess.run(
                ['lsmod'],
                capture_output=True,
                text=True,
                timeout=5
            )

            if 'ftdi_sio' not in result.stdout:
                return True  # Not loaded, nothing to do

            # Try to unload the module
            for attempt in range(3):
                try:
                    result = subprocess.run(
                        ['sudo', 'modprobe', '-r', 'ftdi_sio'],
                        capture_output=True,
                        timeout=5
                    )
                    if result.returncode == 0:
                        logger.info("Unloaded ftdi_sio module")
                        import time
                        time.sleep(0.3)  # Give USB subsystem time to settle
                        return True
                except subprocess.TimeoutExpired:
                    pass
                except Exception:
                    pass

            # Try without sudo (might work if user has permissions)
            try:
                result = subprocess.run(
                    ['modprobe', '-r', 'ftdi_sio'],
                    capture_output=True,
                    timeout=5
                )
                if result.returncode == 0:
                    logger.info("Unloaded ftdi_sio module (no sudo)")
                    import time
                    time.sleep(0.3)
                    return True
            except Exception:
                pass

            logger.warning("Could not unload ftdi_sio module - FT232H may not be detected")
            return False

        except Exception as e:
            logger.debug(f"ftdi_sio check failed: {e}")
            return True  # Assume OK if we can't check

    @staticmethod
    def scan(unload_ftdi_sio: bool = True) -> List[FT232HDevice]:
        """Scan for connected FT232H devices.

        Args:
            unload_ftdi_sio: If True, unload ftdi_sio module first (recommended)

        Returns:
            List of FT232HDevice objects for each found device
        """
        if not HAS_PYFTDI:
            logger.debug("pyftdi not available - cannot scan for FT232H")
            return []

        # Unload ftdi_sio module if requested (it blocks pyftdi)
        if unload_ftdi_sio:
            FT232HScanner._unload_ftdi_sio()

        found_devices = []

        try:
            # Get list of FTDI devices
            devices = Ftdi.list_devices()

            for device_tuple in devices:
                # device_tuple format: (UsbDeviceDescriptor, interface_count)
                # UsbDeviceDescriptor has: vid, pid, bus, address, sn, index, description
                descriptor, interface_count = device_tuple

                vid = descriptor.vid
                pid = descriptor.pid
                serial = descriptor.sn
                description = descriptor.description

                # Check if it's an FT232H (product ID 0x6014)
                if vid == FT232HScanner.VENDOR_ID and pid == FT232HScanner.PRODUCT_ID:
                    # Use simple URL format that works reliably
                    url = "ftdi://ftdi:232h/1"

                    ft_device = FT232HDevice(
                        url=url,
                        serial=serial or f"bus{descriptor.bus}-addr{descriptor.address}",
                        description=description or "FT232H",
                        vendor_id=vid,
                        product_id=pid,
                        connected=True
                    )
                    found_devices.append(ft_device)
                    logger.info(f"Found FT232H: {ft_device.serial} - {description}")

            if not found_devices:
                logger.debug("No FT232H devices found")

        except Exception as e:
            logger.error(f"FT232H scan failed: {e}")

        return found_devices

    @staticmethod
    def get_first_device(unload_ftdi_sio: bool = True) -> Optional[FT232HDevice]:
        """Get the first connected FT232H device.

        Args:
            unload_ftdi_sio: If True, unload ftdi_sio module first

        Returns:
            FT232HDevice or None if not found
        """
        devices = FT232HScanner.scan(unload_ftdi_sio=unload_ftdi_sio)
        return devices[0] if devices else None

    @staticmethod
    def scan_i2c_bus(lcd_addresses: List[int] = None) -> List[Tuple[int, bool]]:
        """Scan I2C bus via FT232H for LCD devices.

        Args:
            lcd_addresses: List of addresses to check (default: common LCD addresses)

        Returns:
            List of (address, found) tuples
        """
        if not HAS_PYFTDI:
            return []

        if lcd_addresses is None:
            lcd_addresses = [0x27, 0x3F, 0x20, 0x38]

        # Ensure ftdi_sio is unloaded
        FT232HScanner._unload_ftdi_sio()

        results = []
        i2c = None

        try:
            i2c = I2cController()
            i2c.configure('ftdi://ftdi:232h/1', frequency=100000)

            for addr in lcd_addresses:
                try:
                    port = i2c.get_port(addr)
                    # Try to read a byte - will raise on NACK
                    port.read(1)
                    results.append((addr, True))
                    logger.info(f"Found I2C device at 0x{addr:02X}")
                except Exception:
                    # Try write instead (some devices don't support read)
                    try:
                        port.write([0x00])
                        results.append((addr, True))
                        logger.info(f"Found I2C device at 0x{addr:02X} (write-only)")
                    except Exception:
                        results.append((addr, False))

        except Exception as e:
            logger.error(f"I2C scan failed: {e}")
        finally:
            if i2c:
                try:
                    i2c.terminate()
                except Exception:
                    pass

        return results


class FT232HController:
    """LCD controller using FT232H USB-to-I2C adapter.

    This controller enables driving HD44780 LCDs via USB using the
    FT232H chip in I2C mode.
    """

    def __init__(self, device: Optional[FT232HDevice] = None,
                 lcd_address: int = 0x27,
                 cols: int = 20, rows: int = 2,
                 auto_connect: bool = True):
        """Initialize FT232H LCD controller.

        Args:
            device: FT232HDevice to use (auto-detects if None)
            lcd_address: I2C address of LCD (usually 0x27 or 0x3F)
            cols: Display width in characters
            rows: Display height in characters
            auto_connect: Connect immediately if True
        """
        self.device = device
        self.lcd_address = lcd_address
        self.cols = cols
        self.rows = rows
        self.i2c_controller: Optional['I2cController'] = None
        self.i2c_port = None
        self.connected = False
        self.backlight_on = True
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 3

        # HD44780 command constants
        self.LCD_CLEARDISPLAY = 0x01
        self.LCD_RETURNHOME = 0x02
        self.LCD_ENTRYMODESET = 0x04
        self.LCD_DISPLAYCONTROL = 0x08
        self.LCD_CURSORSHIFT = 0x10
        self.LCD_FUNCTIONSET = 0x20
        self.LCD_SETCGRAMADDR = 0x40
        self.LCD_SETDDRAMADDR = 0x80

        # Flags for display control
        self.LCD_DISPLAYON = 0x04
        self.LCD_CURSORON = 0x02
        self.LCD_BLINKON = 0x01

        # Flags for function set
        self.LCD_8BITMODE = 0x10
        self.LCD_4BITMODE = 0x00
        self.LCD_2LINE = 0x08
        self.LCD_1LINE = 0x00

        # PCF8574 pin mapping (directly mapped)
        self.PIN_RS = 0x01
        self.PIN_RW = 0x02
        self.PIN_EN = 0x04
        self.PIN_BACKLIGHT = 0x08
        self.PIN_D4 = 0x10
        self.PIN_D5 = 0x20
        self.PIN_D6 = 0x40
        self.PIN_D7 = 0x80

        if auto_connect:
            self._connect()

    def _recover_i2c_bus(self) -> bool:
        """Attempt to recover a stuck I2C bus.

        The I2C bus can get stuck if a transaction is interrupted,
        leaving the SDA line held low. This sends clock pulses to
        try to release it.

        Returns:
            True if recovery was attempted
        """
        if not self.i2c_controller:
            return False

        try:
            logger.info("Attempting I2C bus recovery...")

            # Close and reopen the controller
            try:
                self.i2c_controller.terminate()
            except Exception:
                pass

            time.sleep(0.1)

            # Reinitialize
            self.i2c_controller = I2cController()
            self.i2c_controller.configure('ftdi://ftdi:232h/1', frequency=100000)
            self.i2c_port = self.i2c_controller.get_port(self.lcd_address)

            logger.info("I2C bus recovery complete")
            return True

        except Exception as e:
            logger.error(f"I2C bus recovery failed: {e}")
            return False

    def _connect(self) -> bool:
        """Connect to FT232H and initialize LCD."""
        if not HAS_PYFTDI:
            logger.error("pyftdi library not available")
            return False

        # Ensure ftdi_sio is unloaded
        FT232HScanner._unload_ftdi_sio()

        try:
            # Auto-detect device if not provided
            if not self.device:
                self.device = FT232HScanner.get_first_device(unload_ftdi_sio=False)

            if not self.device:
                logger.warning("No FT232H device found")
                return False

            # Close existing controller if any
            if self.i2c_controller:
                try:
                    self.i2c_controller.terminate()
                except Exception:
                    pass
                time.sleep(0.1)

            # Initialize I2C controller with simple URL
            self.i2c_controller = I2cController()
            self.i2c_controller.configure('ftdi://ftdi:232h/1', frequency=100000)

            # Get I2C port for the LCD address
            self.i2c_port = self.i2c_controller.get_port(self.lcd_address)

            self.connected = True
            self._reconnect_attempts = 0
            logger.info(f"Connected to LCD via FT232H at address 0x{self.lcd_address:02X}")

            # Initialize the LCD
            self._init_lcd()

            return True

        except Exception as e:
            logger.error(f"Failed to connect via FT232H: {e}")
            self.connected = False
            return False

    def reconnect(self) -> bool:
        """Attempt to reconnect to the LCD.

        Returns:
            True if reconnection successful
        """
        if self._reconnect_attempts >= self._max_reconnect_attempts:
            logger.error("Max reconnection attempts reached")
            return False

        self._reconnect_attempts += 1
        logger.info(f"Reconnection attempt {self._reconnect_attempts}/{self._max_reconnect_attempts}")

        # Try I2C bus recovery first
        self._recover_i2c_bus()

        # Attempt full reconnection
        return self._connect()

    def _write_byte(self, data: int):
        """Write a byte to the I2C port."""
        if self.i2c_port:
            try:
                self.i2c_port.write([data])
            except Exception:
                pass

    def _pulse_enable(self, data: int):
        """Pulse the enable pin to latch data."""
        backlight = self.PIN_BACKLIGHT if self.backlight_on else 0
        self._write_byte(data | self.PIN_EN | backlight)
        time.sleep(0.0005)
        self._write_byte((data & ~self.PIN_EN) | backlight)
        time.sleep(0.0001)

    def _write_4bits(self, data: int):
        """Write 4 bits of data."""
        backlight = self.PIN_BACKLIGHT if self.backlight_on else 0
        self._write_byte(data | backlight)
        self._pulse_enable(data)

    def _send(self, data: int, mode: int):
        """Send byte to LCD in 4-bit mode.

        Args:
            data: Byte to send
            mode: 0 for command, PIN_RS for data
        """
        high_nibble = mode | (data & 0xF0)
        low_nibble = mode | ((data << 4) & 0xF0)

        self._write_4bits(high_nibble)
        self._write_4bits(low_nibble)

    def _command(self, cmd: int):
        """Send command to LCD."""
        self._send(cmd, 0)

    def _data(self, data: int):
        """Send data to LCD."""
        self._send(data, self.PIN_RS)

    def _init_lcd(self):
        """Initialize the LCD in 4-bit mode."""
        time.sleep(0.05)  # Wait for LCD to power up

        # Initialize in 4-bit mode
        self._write_4bits(0x30)
        time.sleep(0.005)
        self._write_4bits(0x30)
        time.sleep(0.001)
        self._write_4bits(0x30)
        time.sleep(0.001)
        self._write_4bits(0x20)  # Set to 4-bit mode

        # Function set: 4-bit, 2-line, 5x8 dots
        self._command(self.LCD_FUNCTIONSET | self.LCD_4BITMODE | self.LCD_2LINE)

        # Display control: display on, cursor off, blink off
        self._command(self.LCD_DISPLAYCONTROL | self.LCD_DISPLAYON)

        # Clear display
        self.clear()

        # Entry mode: left to right
        self._command(self.LCD_ENTRYMODESET | 0x02)

    def write_line(self, line: int, text: str, center: bool = False):
        """Write text to a specific line.

        Args:
            line: Line number (0-based)
            text: Text to display
            center: Center the text
        """
        if not self.connected:
            return

        try:
            # Ensure text fits
            text = text[:self.cols]

            # Pad/center text
            if center:
                padding = (self.cols - len(text)) // 2
                text = ' ' * padding + text
            text = text.ljust(self.cols)

            # Set cursor position
            row_offsets = [0x00, 0x40, 0x14, 0x54]
            if line < len(row_offsets):
                self._command(self.LCD_SETDDRAMADDR | row_offsets[line])

                # Write characters
                for char in text:
                    self._data(ord(char))
        except Exception:
            pass

    def write_lines(self, lines: List[str]):
        """Write multiple lines at once."""
        for i, line in enumerate(lines[:self.rows]):
            self.write_line(i, line)

    def clear(self):
        """Clear the display."""
        if not self.connected:
            return
        try:
            self._command(self.LCD_CLEARDISPLAY)
            time.sleep(0.002)
        except Exception:
            pass

    def backlight(self, on: bool):
        """Control backlight.

        Args:
            on: True to turn on, False to turn off
        """
        self.backlight_on = on
        if self.connected:
            backlight = self.PIN_BACKLIGHT if on else 0
            self._write_byte(backlight)

    def create_custom_char(self, location: int, charmap: List[int]):
        """Create a custom character.

        Args:
            location: Character location (0-7)
            charmap: List of 8 bytes defining the character
        """
        if not self.connected or location < 0 or location > 7:
            return
        if len(charmap) != 8:
            return

        try:
            self._command(self.LCD_SETCGRAMADDR | (location << 3))
            for byte in charmap:
                self._data(byte)
        except Exception as e:
            logger.error(f"Failed to create custom char: {e}")

    def close(self):
        """Close the connection."""
        if self.i2c_controller:
            try:
                self.clear()
                self.i2c_controller.terminate()
            except Exception as e:
                logger.error(f"Error closing FT232H: {e}")
        self.connected = False

    def get_status(self) -> Dict[str, Any]:
        """Get controller status.

        Returns:
            Dictionary with controller status
        """
        return {
            'type': 'FT232H',
            'connected': self.connected,
            'device_serial': self.device.serial if self.device else None,
            'device_url': self.device.url if self.device else None,
            'lcd_address': f"0x{self.lcd_address:02X}",
            'backlight': self.backlight_on
        }


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

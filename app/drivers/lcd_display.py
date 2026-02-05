"""
LCD Display Hardware Driver

Interface for controlling 4x20 character LCD displays via serial.
Supports writing text, controlling backlight, and playing sounds.
"""

import asyncio
import logging
import serial
from typing import Optional

logger = logging.getLogger(__name__)


class LCDDisplay:
    """
    Hardware driver for 4x20 character LCD display.
    
    Communicates via serial port (USB/RS232) using simple command protocol:
    - L{line}:{text}  - Write text to line (0-3)
    - CLEAR           - Clear display
    - BL:{level}      - Set backlight (0-100)
    - SND:{freq}:{ms} - Play sound at frequency for duration
    """
    
    def __init__(
        self,
        port: str = "/dev/ttyUSB0",
        baud: int = 9600,
        line_width: int = 20,
        line_height: int = 4,
    ):
        """
        Initialize LCD display.
        
        Args:
            port: Serial port path
            baud: Baud rate
            line_width: Characters per line
            line_height: Number of lines
        """
        self.port = port
        self.baud = baud
        self.line_width = line_width
        self.line_height = line_height
        
        self.serial: Optional[serial.Serial] = None
        self.connected = False
        
        # Current display content
        self.lines = [""] * line_height
        self.backlight_level = 100
        
    async def connect(self):
        """Connect to LCD hardware"""
        try:
            self.serial = serial.Serial(
                self.port,
                self.baud,
                timeout=1
            )
            self.connected = True
            logger.info(f"Connected to LCD on {self.port}")
            
            # Clear display on connect
            await self.clear()
            await self.set_backlight(100)
            
        except Exception as e:
            logger.error(f"Failed to connect to LCD: {e}")
            self.connected = False
            raise
    
    async def disconnect(self):
        """Disconnect from LCD"""
        if self.serial:
            try:
                await self.clear()
                self.serial.close()
                self.connected = False
                logger.info("Disconnected from LCD")
            except Exception as e:
                logger.error(f"Error disconnecting: {e}")
    
    async def write_line(self, line: int, text: str):
        """
        Write text to specific line.
        
        Args:
            line: Line number (0-3)
            text: Text to display (will be truncated/padded to line_width)
        """
        if not self.connected:
            logger.warning("LCD not connected, simulating write")
            self.lines[line] = text[:self.line_width].ljust(self.line_width)
            return
        
        if not (0 <= line < self.line_height):
            raise ValueError(f"Line must be 0-{self.line_height-1}")
        
        # Truncate or pad text
        formatted_text = text[:self.line_width].ljust(self.line_width)
        
        # Store current content
        self.lines[line] = formatted_text
        
        # Send to hardware
        command = f"L{line}:{formatted_text}\n"
        
        try:
            self.serial.write(command.encode())
            logger.debug(f"LCD Line {line}: {formatted_text}")
        except Exception as e:
            logger.error(f"Error writing to LCD: {e}")
    
    async def write_lines(self, lines: list):
        """
        Write multiple lines at once.
        
        Args:
            lines: List of strings (up to line_height items)
        """
        for i, text in enumerate(lines[:self.line_height]):
            await self.write_line(i, text)
    
    async def clear(self):
        """Clear all lines"""
        if not self.connected:
            self.lines = [""] * self.line_height
            return
        
        try:
            self.serial.write(b"CLEAR\n")
            self.lines = [""] * self.line_height
            logger.debug("LCD cleared")
        except Exception as e:
            logger.error(f"Error clearing LCD: {e}")
    
    async def set_backlight(self, level: int):
        """
        Set backlight brightness.
        
        Args:
            level: Brightness 0-100
        """
        if not (0 <= level <= 100):
            raise ValueError("Backlight level must be 0-100")
        
        self.backlight_level = level
        
        if not self.connected:
            logger.debug(f"LCD backlight (simulated): {level}%")
            return
        
        try:
            command = f"BL:{level}\n"
            self.serial.write(command.encode())
            logger.debug(f"LCD backlight set to {level}%")
        except Exception as e:
            logger.error(f"Error setting backlight: {e}")
    
    async def play_sound(self, frequency: int = 1000, duration_ms: int = 100):
        """
        Play alert sound.
        
        Args:
            frequency: Tone frequency in Hz
            duration_ms: Duration in milliseconds
        """
        if not self.connected:
            logger.debug(f"LCD sound (simulated): {frequency}Hz for {duration_ms}ms")
            return
        
        try:
            command = f"SND:{frequency}:{duration_ms}\n"
            self.serial.write(command.encode())
            logger.debug(f"LCD sound: {frequency}Hz for {duration_ms}ms")
        except Exception as e:
            logger.error(f"Error playing sound: {e}")
    
    def get_current_display(self) -> list:
        """Get current display content"""
        return self.lines.copy()
    
    async def scroll_text(self, line: int, text: str, delay: float = 0.3):
        """
        Scroll long text across a line.
        
        Args:
            line: Line number to scroll on
            text: Text to scroll
            delay: Delay between scroll steps
        """
        if len(text) <= self.line_width:
            await self.write_line(line, text)
            return
        
        # Pad text for smooth scrolling
        padded = text + " " * self.line_width
        
        for i in range(len(text)):
            window = padded[i:i + self.line_width]
            await self.write_line(line, window)
            await asyncio.sleep(delay)


class MockLCDDisplay(LCDDisplay):
    """Mock LCD display for testing without hardware"""
    
    async def connect(self):
        """Simulate connection"""
        self.connected = True
        self.lines = [""] * self.line_height
        logger.info("Mock LCD connected")
    
    async def disconnect(self):
        """Simulate disconnection"""
        self.connected = False
        logger.info("Mock LCD disconnected")

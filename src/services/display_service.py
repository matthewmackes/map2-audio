"""
Display Service - Core LCD display management and rendering
"""
import asyncio
import logging
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum
import threading
from datetime import datetime

logger = logging.getLogger(__name__)


class DisplayMode(Enum):
    """Display operation modes"""
    NORMAL = "normal"
    DIMMED = "dimmed"
    STANDBY = "standby"
    DEMO = "demo"


class TextAlignment(Enum):
    """Text alignment options"""
    LEFT = "left"
    CENTER = "center"
    RIGHT = "right"


@dataclass
class DisplayFrame:
    """Represents a single display frame"""
    lines: List[str] = field(default_factory=list)
    duration: float = 0.1  # seconds
    timestamp: datetime = field(default_factory=datetime.now)
    mode: DisplayMode = DisplayMode.NORMAL
    priority: int = 0


class DisplayService:
    """Core service managing LCD display operations"""

    def __init__(self, width: int = 16, height: int = 2):
        self.width = width
        self.height = height
        self.current_frame: Optional[DisplayFrame] = None
        self.frame_queue: List[DisplayFrame] = []
        self.is_running = False
        self.lock = threading.RLock()
        self.mode = DisplayMode.NORMAL
        self.brightness = 100
        self.contrast = 100
        self.backlight_enabled = True
        
    async def initialize(self) -> bool:
        """Initialize the display service"""
        try:
            logger.info(f"Initializing display: {self.width}x{self.height}")
            self.is_running = True
            return True
        except Exception as e:
            logger.error(f"Display initialization failed: {e}")
            return False

    async def shutdown(self):
        """Shutdown the display service"""
        self.is_running = False
        await self.clear()
        logger.info("Display service shut down")

    async def render_frame(self, frame: DisplayFrame) -> bool:
        """Render a frame to the display"""
        try:
            with self.lock:
                if len(frame.lines) > self.height:
                    logger.warning(f"Frame has {len(frame.lines)} lines, max {self.height}")
                    frame.lines = frame.lines[:self.height]
                
                # Pad lines to width
                padded_lines = []
                for line in frame.lines:
                    if len(line) < self.width:
                        padded_lines.append(line.ljust(self.width))
                    else:
                        padded_lines.append(line[:self.width])
                
                frame.lines = padded_lines
                self.current_frame = frame
                logger.debug(f"Rendered frame: {frame.lines}")
                return True
        except Exception as e:
            logger.error(f"Frame render error: {e}")
            return False

    async def display_text(self, text: str, line: int = 0, 
                          alignment: TextAlignment = TextAlignment.LEFT) -> bool:
        """Display text at specific line"""
        try:
            if line >= self.height:
                logger.warning(f"Line {line} exceeds display height {self.height}")
                return False
            
            # Apply alignment
            if alignment == TextAlignment.CENTER:
                text = text.center(self.width)
            elif alignment == TextAlignment.RIGHT:
                text = text.rjust(self.width)
            else:
                text = text.ljust(self.width)
            
            frame = DisplayFrame(lines=[text], mode=self.mode)
            return await self.render_frame(frame)
        except Exception as e:
            logger.error(f"Display text error: {e}")
            return False

    async def display_multiline(self, lines: List[str]) -> bool:
        """Display multiple lines"""
        try:
            frame = DisplayFrame(lines=lines, mode=self.mode)
            return await self.render_frame(frame)
        except Exception as e:
            logger.error(f"Multiline display error: {e}")
            return False

    async def clear(self) -> bool:
        """Clear the display"""
        try:
            empty_lines = ["" for _ in range(self.height)]
            frame = DisplayFrame(lines=empty_lines)
            return await self.render_frame(frame)
        except Exception as e:
            logger.error(f"Clear display error: {e}")
            return False

    async def set_mode(self, mode: DisplayMode) -> bool:
        """Set display mode"""
        try:
            self.mode = mode
            if mode == DisplayMode.STANDBY:
                await self.clear()
            logger.info(f"Display mode set to: {mode.value}")
            return True
        except Exception as e:
            logger.error(f"Set mode error: {e}")
            return False

    async def set_brightness(self, level: int) -> bool:
        """Set display brightness (0-100)"""
        try:
            self.brightness = max(0, min(100, level))
            logger.info(f"Brightness set to: {self.brightness}%")
            return True
        except Exception as e:
            logger.error(f"Set brightness error: {e}")
            return False

    async def set_contrast(self, level: int) -> bool:
        """Set display contrast (0-100)"""
        try:
            self.contrast = max(0, min(100, level))
            logger.info(f"Contrast set to: {self.contrast}%")
            return True
        except Exception as e:
            logger.error(f"Set contrast error: {e}")
            return False

    async def toggle_backlight(self, enabled: bool) -> bool:
        """Toggle backlight"""
        try:
            self.backlight_enabled = enabled
            logger.info(f"Backlight: {'enabled' if enabled else 'disabled'}")
            return True
        except Exception as e:
            logger.error(f"Toggle backlight error: {e}")
            return False

    def get_current_frame(self) -> Optional[DisplayFrame]:
        """Get the current displayed frame"""
        with self.lock:
            return self.current_frame

    def get_status(self) -> Dict:
        """Get display status"""
        return {
            "dimensions": f"{self.width}x{self.height}",
            "running": self.is_running,
            "mode": self.mode.value,
            "brightness": self.brightness,
            "contrast": self.contrast,
            "backlight": self.backlight_enabled,
            "current_frame": self.current_frame.lines if self.current_frame else None
        }

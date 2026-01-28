"""
LCD display module for MAP2 Audio Platform.

Professional multi-page LCD interface system with:
- Multiple display pages (Status, VU Meters, Chain, Plugins, MIDI, Performance, Menu)
- Real I2C hardware support (HD44780 with PCF8574 backpack)
- Rotary encoder and button input handling
- Custom characters for VU meters and icons
- Integration with MAP2 backend for real-time data
"""

__version__ = "1.24.25.1"

# Main components
from lcd.manager import IntegratedLCDManager, LCDSystemConfig, create_lcd_system
from lcd.ui_engine import LCDUIEngine, DisplayConfig, PageType
from lcd.hardware_controller import (
    I2CScanner,
    LCDHardwareController,
    DualLCDController,
    LCDCapabilities
)
from lcd.input_handler import (
    InputManager,
    InputConfig,
    InputAction,
    RotaryEncoder,
    ButtonHandler
)

__all__ = [
    # Main entry point
    'create_lcd_system',
    
    # Manager
    'IntegratedLCDManager',
    'LCDSystemConfig',
    
    # UI Engine
    'LCDUIEngine',
    'DisplayConfig',
    'PageType',
    
    # Hardware
    'I2CScanner',
    'LCDHardwareController',
    'DualLCDController',
    'LCDCapabilities',
    
    # Input
    'InputManager',
    'InputConfig',
    'InputAction',
    'RotaryEncoder',
    'ButtonHandler',
]

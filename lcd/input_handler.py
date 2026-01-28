"""
LCD Input Handler - Rotary Encoder, Button, Touch, and IR Remote Support
Supports various input methods for LCD navigation

Supported inputs:
- Rotary encoder (with detent)
- Push buttons (up/down/left/right/select/menu)
- Capacitive touch panel (MPR121, FT6236)
- IR remote (NEC protocol via LIRC or direct GPIO)
"""

import logging
import time
import threading
from enum import Enum
from typing import Callable, Optional, Dict, List, Tuple
from dataclasses import dataclass, field
from collections import deque

logger = logging.getLogger(__name__)

# Try to import GPIO libraries
try:
    import RPi.GPIO as GPIO
    HAS_GPIO = True
except ImportError:
    HAS_GPIO = False
    logger.warning("RPi.GPIO not available - input handling disabled")

# Try to import I2C library for touch
try:
    import smbus2
    HAS_SMBUS = True
except ImportError:
    HAS_SMBUS = False

# Try to import LIRC for IR remote
try:
    import lirc
    HAS_LIRC = True
except ImportError:
    HAS_LIRC = False
    logger.debug("python-lirc not available - IR remote via LIRC disabled")


class InputAction(Enum):
    """Input actions that can be performed."""
    UP = "up"
    DOWN = "down"
    LEFT = "left"
    RIGHT = "right"
    SELECT = "select"
    MENU = "menu"
    BACK = "back"
    NEXT_PAGE = "next_page"
    PREV_PAGE = "prev_page"
    ENCODER_CW = "encoder_cw"      # Clockwise
    ENCODER_CCW = "encoder_ccw"    # Counter-clockwise
    ENCODER_PRESS = "encoder_press"
    # Touch actions
    TOUCH_TAP = "touch_tap"
    TOUCH_SWIPE_UP = "touch_swipe_up"
    TOUCH_SWIPE_DOWN = "touch_swipe_down"
    TOUCH_SWIPE_LEFT = "touch_swipe_left"
    TOUCH_SWIPE_RIGHT = "touch_swipe_right"
    TOUCH_LONG_PRESS = "touch_long_press"
    # IR remote actions
    IR_PLAY = "ir_play"
    IR_PAUSE = "ir_pause"
    IR_STOP = "ir_stop"
    IR_NEXT = "ir_next"
    IR_PREV = "ir_prev"
    IR_VOL_UP = "ir_vol_up"
    IR_VOL_DOWN = "ir_vol_down"
    IR_MUTE = "ir_mute"
    IR_POWER = "ir_power"
    IR_NUM_0 = "ir_num_0"
    IR_NUM_1 = "ir_num_1"
    IR_NUM_2 = "ir_num_2"
    IR_NUM_3 = "ir_num_3"
    IR_NUM_4 = "ir_num_4"
    IR_NUM_5 = "ir_num_5"
    IR_NUM_6 = "ir_num_6"
    IR_NUM_7 = "ir_num_7"
    IR_NUM_8 = "ir_num_8"
    IR_NUM_9 = "ir_num_9"


@dataclass
class InputConfig:
    """Configuration for input handling."""
    # GPIO pin numbers (BCM mode)
    encoder_clk: Optional[int] = 17
    encoder_dt: Optional[int] = 18
    encoder_sw: Optional[int] = 27
    button_up: Optional[int] = 22
    button_down: Optional[int] = 23
    button_left: Optional[int] = 24
    button_right: Optional[int] = 25
    button_select: Optional[int] = 5
    button_menu: Optional[int] = 6
    button_back: Optional[int] = 13
    
    # Debounce settings (milliseconds)
    debounce_ms: int = 50
    
    # Long press settings
    long_press_ms: int = 1000
    
    # Encoder settings
    encoder_detent: bool = True  # Has detents (clicks)
    encoder_steps_per_detent: int = 4
    
    # Touch panel settings
    touch_i2c_address: int = 0x38  # FT6236 default, MPR121 is 0x5A
    touch_i2c_bus: int = 1
    touch_type: str = "ft6236"  # "ft6236", "mpr121", or "none"
    touch_width: int = 320
    touch_height: int = 240
    swipe_threshold: int = 50  # Minimum pixels for swipe detection
    
    # IR remote settings
    ir_enabled: bool = True
    ir_gpio_pin: Optional[int] = 18  # GPIO for direct IR reading
    ir_use_lirc: bool = True  # Use LIRC daemon instead of direct GPIO
    ir_lirc_device: str = "map2remote"  # LIRC remote name


class CapacitiveTouchHandler:
    """Capacitive touch panel handler supporting FT6236 and MPR121.
    
    FT6236: Common touch controller for small TFT displays
    MPR121: 12-channel capacitive touch sensor
    """
    
    # FT6236 registers
    FT6236_ADDR = 0x38
    FT6236_REG_NUM_TOUCHES = 0x02
    FT6236_REG_P1_XH = 0x03
    
    # MPR121 registers
    MPR121_ADDR = 0x5A
    MPR121_TOUCHSTATUS_L = 0x00
    MPR121_TOUCHSTATUS_H = 0x01
    
    def __init__(self, config: InputConfig, callback: Optional[Callable] = None):
        """Initialize touch handler.
        
        Args:
            config: Input configuration
            callback: Callback function(action: InputAction, x: int, y: int)
        """
        self.config = config
        self.callback = callback
        self._smbus = None
        self.is_connected = False
        self.touch_type = config.touch_type
        
        # Touch state
        self._last_touch: Optional[Tuple[int, int]] = None
        self._touch_start: Optional[Tuple[int, int]] = None
        self._touch_start_time: float = 0
        
        # Try to initialize
        if HAS_SMBUS and config.touch_type != "none":
            self._init_touch()
    
    def _init_touch(self) -> bool:
        """Initialize touch controller."""
        try:
            self._smbus = smbus2.SMBus(self.config.touch_i2c_bus)
            
            if self.touch_type == "ft6236":
                # Try to read from FT6236
                self._smbus.read_byte_data(self.config.touch_i2c_address, 0x00)
                self.is_connected = True
                logger.info(f"FT6236 touch controller detected at {hex(self.config.touch_i2c_address)}")
            
            elif self.touch_type == "mpr121":
                # Initialize MPR121
                self._init_mpr121()
                self.is_connected = True
                logger.info(f"MPR121 touch controller detected at {hex(self.config.touch_i2c_address)}")
            
            return True
            
        except (IOError, OSError) as e:
            logger.debug(f"Touch controller not found: {e}")
            self.is_connected = False
            return False
    
    def _init_mpr121(self) -> None:
        """Initialize MPR121 touch sensor."""
        if not self._smbus:
            return
        
        addr = self.config.touch_i2c_address
        
        # Soft reset
        self._smbus.write_byte_data(addr, 0x80, 0x63)
        time.sleep(0.001)
        
        # Set electrode configuration to stop mode
        self._smbus.write_byte_data(addr, 0x5E, 0x00)
        
        # Set touch/release thresholds for all 12 electrodes
        for i in range(12):
            self._smbus.write_byte_data(addr, 0x41 + i * 2, 12)  # Touch threshold
            self._smbus.write_byte_data(addr, 0x42 + i * 2, 6)   # Release threshold
        
        # Configure baseline filtering
        self._smbus.write_byte_data(addr, 0x2B, 0x01)  # MHD Rising
        self._smbus.write_byte_data(addr, 0x2C, 0x01)  # NHD Rising
        self._smbus.write_byte_data(addr, 0x2D, 0x00)  # NCL Rising
        self._smbus.write_byte_data(addr, 0x2E, 0x00)  # FDL Rising
        self._smbus.write_byte_data(addr, 0x2F, 0x01)  # MHD Falling
        self._smbus.write_byte_data(addr, 0x30, 0x01)  # NHD Falling
        self._smbus.write_byte_data(addr, 0x31, 0xFF)  # NCL Falling
        self._smbus.write_byte_data(addr, 0x32, 0x02)  # FDL Falling
        
        # Set filter configuration
        self._smbus.write_byte_data(addr, 0x5D, 0x04)
        
        # Enable all 12 electrodes
        self._smbus.write_byte_data(addr, 0x5E, 0x0C)
    
    def read_touch(self) -> Optional[Tuple[int, int]]:
        """Read current touch position.
        
        Returns:
            Tuple of (x, y) or None if no touch
        """
        if not self.is_connected or not self._smbus:
            return None
        
        try:
            if self.touch_type == "ft6236":
                return self._read_ft6236()
            elif self.touch_type == "mpr121":
                return self._read_mpr121()
        except Exception as e:
            logger.error(f"Touch read error: {e}")
        
        return None
    
    def _read_ft6236(self) -> Optional[Tuple[int, int]]:
        """Read from FT6236 touch controller."""
        addr = self.config.touch_i2c_address
        
        # Read number of touches
        num_touches = self._smbus.read_byte_data(addr, self.FT6236_REG_NUM_TOUCHES)
        
        if num_touches == 0 or num_touches > 2:
            return None
        
        # Read first touch point
        data = self._smbus.read_i2c_block_data(addr, self.FT6236_REG_P1_XH, 4)
        
        x = ((data[0] & 0x0F) << 8) | data[1]
        y = ((data[2] & 0x0F) << 8) | data[3]
        
        return (x, y)
    
    def _read_mpr121(self) -> Optional[Tuple[int, int]]:
        """Read from MPR121 - returns electrode number as position."""
        addr = self.config.touch_i2c_address
        
        # Read touch status
        status_l = self._smbus.read_byte_data(addr, self.MPR121_TOUCHSTATUS_L)
        status_h = self._smbus.read_byte_data(addr, self.MPR121_TOUCHSTATUS_H)
        status = (status_h << 8) | status_l
        
        if status == 0:
            return None
        
        # Find first touched electrode
        for i in range(12):
            if status & (1 << i):
                # Map electrode to x,y (4x3 grid)
                x = (i % 4) * (self.config.touch_width // 4)
                y = (i // 4) * (self.config.touch_height // 3)
                return (x, y)
        
        return None
    
    def process_touch(self) -> Optional[InputAction]:
        """Process touch and detect gestures.
        
        Returns:
            InputAction for detected gesture or None
        """
        current = self.read_touch()
        now = time.time()
        
        if current is not None:
            if self._touch_start is None:
                # New touch
                self._touch_start = current
                self._touch_start_time = now
                self._last_touch = current
                return None
            else:
                # Ongoing touch
                self._last_touch = current
                return None
        else:
            # Touch released
            if self._touch_start is not None:
                start = self._touch_start
                end = self._last_touch or start
                duration = now - self._touch_start_time
                
                self._touch_start = None
                self._last_touch = None
                
                return self._detect_gesture(start, end, duration)
        
        return None
    
    def _detect_gesture(self, start: Tuple[int, int], end: Tuple[int, int], 
                       duration: float) -> Optional[InputAction]:
        """Detect gesture from touch start/end points.
        
        Args:
            start: Touch start position
            end: Touch end position
            duration: Touch duration in seconds
            
        Returns:
            Detected InputAction or None
        """
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        threshold = self.config.swipe_threshold
        
        # Long press detection
        if duration > 1.0 and abs(dx) < threshold and abs(dy) < threshold:
            return InputAction.TOUCH_LONG_PRESS
        
        # Swipe detection
        if abs(dx) > threshold or abs(dy) > threshold:
            if abs(dx) > abs(dy):
                # Horizontal swipe
                return InputAction.TOUCH_SWIPE_RIGHT if dx > 0 else InputAction.TOUCH_SWIPE_LEFT
            else:
                # Vertical swipe
                return InputAction.TOUCH_SWIPE_DOWN if dy > 0 else InputAction.TOUCH_SWIPE_UP
        
        # Tap
        if duration < 0.3:
            return InputAction.TOUCH_TAP
        
        return None
    
    def cleanup(self) -> None:
        """Clean up touch handler."""
        if self._smbus:
            try:
                self._smbus.close()
            except Exception:
                pass


class IRRemoteHandler:
    """IR remote control handler supporting NEC protocol.
    
    Supports:
    - LIRC daemon integration (recommended)
    - Direct GPIO reading (fallback)
    """
    
    # Common NEC remote button codes (can be customized)
    NEC_CODES = {
        0x00: InputAction.IR_POWER,
        0x01: InputAction.IR_VOL_UP,
        0x02: InputAction.IR_VOL_DOWN,
        0x03: InputAction.IR_MUTE,
        0x04: InputAction.IR_PREV,
        0x05: InputAction.IR_NEXT,
        0x06: InputAction.IR_PLAY,
        0x07: InputAction.IR_PAUSE,
        0x08: InputAction.IR_STOP,
        0x10: InputAction.IR_NUM_0,
        0x11: InputAction.IR_NUM_1,
        0x12: InputAction.IR_NUM_2,
        0x13: InputAction.IR_NUM_3,
        0x14: InputAction.IR_NUM_4,
        0x15: InputAction.IR_NUM_5,
        0x16: InputAction.IR_NUM_6,
        0x17: InputAction.IR_NUM_7,
        0x18: InputAction.IR_NUM_8,
        0x19: InputAction.IR_NUM_9,
    }
    
    # LIRC button name to action mapping
    LIRC_MAPPING = {
        "KEY_POWER": InputAction.IR_POWER,
        "KEY_VOLUMEUP": InputAction.IR_VOL_UP,
        "KEY_VOLUMEDOWN": InputAction.IR_VOL_DOWN,
        "KEY_MUTE": InputAction.IR_MUTE,
        "KEY_PREVIOUS": InputAction.IR_PREV,
        "KEY_NEXT": InputAction.IR_NEXT,
        "KEY_PLAY": InputAction.IR_PLAY,
        "KEY_PAUSE": InputAction.IR_PAUSE,
        "KEY_STOP": InputAction.IR_STOP,
        "KEY_0": InputAction.IR_NUM_0,
        "KEY_1": InputAction.IR_NUM_1,
        "KEY_2": InputAction.IR_NUM_2,
        "KEY_3": InputAction.IR_NUM_3,
        "KEY_4": InputAction.IR_NUM_4,
        "KEY_5": InputAction.IR_NUM_5,
        "KEY_6": InputAction.IR_NUM_6,
        "KEY_7": InputAction.IR_NUM_7,
        "KEY_8": InputAction.IR_NUM_8,
        "KEY_9": InputAction.IR_NUM_9,
        "KEY_UP": InputAction.UP,
        "KEY_DOWN": InputAction.DOWN,
        "KEY_LEFT": InputAction.LEFT,
        "KEY_RIGHT": InputAction.RIGHT,
        "KEY_OK": InputAction.SELECT,
        "KEY_ENTER": InputAction.SELECT,
        "KEY_MENU": InputAction.MENU,
        "KEY_BACK": InputAction.BACK,
        "KEY_EXIT": InputAction.BACK,
    }
    
    def __init__(self, config: InputConfig, callback: Optional[Callable] = None):
        """Initialize IR remote handler.
        
        Args:
            config: Input configuration
            callback: Callback function(action: InputAction)
        """
        self.config = config
        self.callback = callback
        self.is_connected = False
        self._lirc_socket = None
        self._running = False
        self._thread: Optional[threading.Thread] = None
        
        if config.ir_enabled:
            if config.ir_use_lirc and HAS_LIRC:
                self._init_lirc()
            elif HAS_GPIO and config.ir_gpio_pin:
                self._init_gpio()
    
    def _init_lirc(self) -> bool:
        """Initialize LIRC connection."""
        try:
            lirc.init("map2audio", blocking=False)
            self.is_connected = True
            logger.info("LIRC IR remote initialized")
            return True
        except Exception as e:
            logger.warning(f"LIRC initialization failed: {e}")
            return False
    
    def _init_gpio(self) -> bool:
        """Initialize direct GPIO IR reading."""
        if not HAS_GPIO:
            return False
        
        try:
            GPIO.setmode(GPIO.BCM)
            GPIO.setup(self.config.ir_gpio_pin, GPIO.IN)
            self.is_connected = True
            logger.info(f"GPIO IR receiver on pin {self.config.ir_gpio_pin}")
            return True
        except Exception as e:
            logger.warning(f"GPIO IR initialization failed: {e}")
            return False
    
    def start(self) -> None:
        """Start IR remote listening thread."""
        if not self.is_connected:
            return
        
        self._running = True
        self._thread = threading.Thread(target=self._listen_loop, daemon=True)
        self._thread.start()
        logger.info("IR remote listener started")
    
    def stop(self) -> None:
        """Stop IR remote listening."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=1.0)
    
    def _listen_loop(self) -> None:
        """Main listening loop for IR commands."""
        while self._running:
            try:
                if self.config.ir_use_lirc and HAS_LIRC:
                    self._poll_lirc()
                else:
                    self._poll_gpio()
                
                time.sleep(0.05)  # 50ms polling
                
            except Exception as e:
                logger.error(f"IR polling error: {e}")
                time.sleep(0.1)
    
    def _poll_lirc(self) -> None:
        """Poll LIRC for IR commands."""
        try:
            codes = lirc.nextcode()
            if codes:
                for code in codes:
                    action = self.LIRC_MAPPING.get(code)
                    if action and self.callback:
                        self.callback(action)
        except Exception:
            pass  # Non-blocking read, no data available
    
    def _poll_gpio(self) -> None:
        """Poll GPIO for NEC IR signal.
        
        This is a simplified NEC decoder. For production use,
        consider using pigpio or ir-keytable instead.
        """
        # Simplified - would need proper NEC timing for real implementation
        pass
    
    def cleanup(self) -> None:
        """Clean up IR handler."""
        self.stop()
        if HAS_LIRC and self.is_connected:
            try:
                lirc.deinit()
            except Exception:
                pass


class RotaryEncoder:
    """Rotary encoder handler with interrupt-based reading."""
    
    def __init__(self, clk_pin: int, dt_pin: int, sw_pin: Optional[int] = None,
                 callback: Optional[Callable] = None,
                 detent: bool = True, steps_per_detent: int = 4):
        """Initialize rotary encoder.
        
        Args:
            clk_pin: CLK (clock) pin number
            dt_pin: DT (data) pin number
            sw_pin: SW (switch/button) pin number (optional)
            callback: Callback function(direction, pressed)
            detent: Whether encoder has detents
            steps_per_detent: Steps per detent (usually 4)
        """
        if not HAS_GPIO:
            logger.error("GPIO not available")
            return
        
        self.clk_pin = clk_pin
        self.dt_pin = dt_pin
        self.sw_pin = sw_pin
        self.callback = callback
        self.detent = detent
        self.steps_per_detent = steps_per_detent
        
        self.position = 0
        self.last_encoded = 0
        self.step_count = 0
        
        self.button_pressed = False
        self.button_press_time = 0.0
        
        self._setup_gpio()
    
    def _setup_gpio(self):
        """Setup GPIO pins."""
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        
        # Setup rotary encoder pins
        GPIO.setup(self.clk_pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        GPIO.setup(self.dt_pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        
        # Setup button pin if provided
        if self.sw_pin:
            GPIO.setup(self.sw_pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
            GPIO.add_event_detect(self.sw_pin, GPIO.FALLING,
                                callback=self._button_callback,
                                bouncetime=50)
        
        # Add interrupt for encoder
        GPIO.add_event_detect(self.clk_pin, GPIO.BOTH,
                            callback=self._encoder_callback,
                            bouncetime=1)
        GPIO.add_event_detect(self.dt_pin, GPIO.BOTH,
                            callback=self._encoder_callback,
                            bouncetime=1)
        
        # Read initial state
        self.last_encoded = (GPIO.input(self.clk_pin) << 1) | GPIO.input(self.dt_pin)
    
    def _encoder_callback(self, channel):
        """Handle encoder rotation interrupt."""
        clk_state = GPIO.input(self.clk_pin)
        dt_state = GPIO.input(self.dt_pin)
        
        encoded = (clk_state << 1) | dt_state
        sum_val = (self.last_encoded << 2) | encoded
        
        # Determine direction
        if sum_val in [0b0010, 0b0100, 0b1011, 0b1101]:
            # Clockwise
            self.step_count += 1
            direction = 1
        elif sum_val in [0b0001, 0b0111, 0b1000, 0b1110]:
            # Counter-clockwise
            self.step_count -= 1
            direction = -1
        else:
            direction = 0
        
        self.last_encoded = encoded
        
        # If has detents, only trigger callback on full detent
        if self.detent:
            if abs(self.step_count) >= self.steps_per_detent:
                actual_direction = 1 if self.step_count > 0 else -1
                self.step_count = 0
                if self.callback:
                    self.callback(actual_direction, False)
        else:
            # No detents, trigger on every step
            if direction != 0 and self.callback:
                self.callback(direction, False)
    
    def _button_callback(self, channel):
        """Handle encoder button press."""
        if not self.button_pressed:
            self.button_pressed = True
            self.button_press_time = time.time()
            
            if self.callback:
                self.callback(0, True)
        
        self.button_pressed = False
    
    def cleanup(self):
        """Clean up GPIO resources."""
        if HAS_GPIO:
            GPIO.cleanup([self.clk_pin, self.dt_pin])
            if self.sw_pin:
                GPIO.cleanup([self.sw_pin])


class ButtonHandler:
    """Handler for multiple push buttons."""
    
    def __init__(self, config: InputConfig, callback: Optional[Callable] = None):
        """Initialize button handler.
        
        Args:
            config: Input configuration
            callback: Callback function(action)
        """
        if not HAS_GPIO:
            logger.error("GPIO not available")
            return
        
        self.config = config
        self.callback = callback
        self.button_pins = {}
        self.button_actions = {}
        self.press_times = {}
        
        self._setup_buttons()
    
    def _setup_buttons(self):
        """Setup all button pins."""
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        
        # Map pins to actions
        button_map = {
            self.config.button_up: InputAction.UP,
            self.config.button_down: InputAction.DOWN,
            self.config.button_left: InputAction.LEFT,
            self.config.button_right: InputAction.RIGHT,
            self.config.button_select: InputAction.SELECT,
            self.config.button_menu: InputAction.MENU,
            self.config.button_back: InputAction.BACK,
        }
        
        for pin, action in button_map.items():
            if pin is not None:
                GPIO.setup(pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)
                GPIO.add_event_detect(pin, GPIO.FALLING,
                                    callback=self._button_callback,
                                    bouncetime=self.config.debounce_ms)
                self.button_pins[pin] = action
                self.button_actions[action] = pin
                self.press_times[pin] = 0.0
    
    def _button_callback(self, channel):
        """Handle button press."""
        if channel in self.button_pins:
            action = self.button_pins[channel]
            
            # Record press time
            self.press_times[channel] = time.time()
            
            if self.callback:
                self.callback(action)
    
    def check_long_press(self, pin: int) -> bool:
        """Check if button is long-pressed.
        
        Args:
            pin: GPIO pin number
            
        Returns:
            True if long press detected
        """
        if pin in self.press_times:
            press_duration = (time.time() - self.press_times[pin]) * 1000
            return press_duration >= self.config.long_press_ms
        return False
    
    def cleanup(self):
        """Clean up GPIO resources."""
        if HAS_GPIO:
            GPIO.cleanup(list(self.button_pins.keys()))


class InputManager:
    """Main input manager coordinating all input methods.
    
    Supports:
    - Rotary encoder with push button
    - GPIO buttons
    - Capacitive touch panel
    - IR remote control
    """
    
    def __init__(self, config: Optional[InputConfig] = None):
        """Initialize input manager.
        
        Args:
            config: Input configuration
        """
        self.config = config or InputConfig()
        self.encoder: Optional[RotaryEncoder] = None
        self.buttons: Optional[ButtonHandler] = None
        self.touch: Optional[CapacitiveTouchHandler] = None
        self.ir_remote: Optional[IRRemoteHandler] = None
        self.action_handlers: Dict[InputAction, Callable] = {}
        self.event_queue: deque = deque(maxlen=64)
        self.running = False
        self.process_thread: Optional[threading.Thread] = None
        self._touch_thread: Optional[threading.Thread] = None
        
    def register_handler(self, action: InputAction, handler: Callable) -> None:
        """Register handler for specific action.
        
        Args:
            action: Input action
            handler: Callback function
        """
        self.action_handlers[action] = handler
    
    def register_handlers(self, handlers: Dict[InputAction, Callable]) -> None:
        """Register multiple handlers at once.
        
        Args:
            handlers: Dictionary mapping actions to callbacks
        """
        self.action_handlers.update(handlers)
    
    def start(self) -> None:
        """Start input processing."""
        # Initialize encoder (GPIO)
        if HAS_GPIO and self.config.encoder_clk and self.config.encoder_dt:
            try:
                self.encoder = RotaryEncoder(
                    clk_pin=self.config.encoder_clk,
                    dt_pin=self.config.encoder_dt,
                    sw_pin=self.config.encoder_sw,
                    callback=self._encoder_callback,
                    detent=self.config.encoder_detent,
                    steps_per_detent=self.config.encoder_steps_per_detent
                )
                logger.info("Rotary encoder initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize encoder: {e}")
        
        # Initialize buttons (GPIO)
        if HAS_GPIO:
            try:
                self.buttons = ButtonHandler(self.config, self._button_callback)
                logger.info("Button handler initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize buttons: {e}")
        
        # Initialize touch panel (I2C)
        if self.config.touch_type != "none":
            try:
                self.touch = CapacitiveTouchHandler(self.config, self._touch_callback)
                if self.touch.is_connected:
                    logger.info(f"Touch handler initialized ({self.config.touch_type})")
            except Exception as e:
                logger.warning(f"Failed to initialize touch: {e}")
        
        # Initialize IR remote
        if self.config.ir_enabled:
            try:
                self.ir_remote = IRRemoteHandler(self.config, self._ir_callback)
                if self.ir_remote.is_connected:
                    self.ir_remote.start()
                    logger.info("IR remote handler initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize IR remote: {e}")
        
        # Start processing thread
        self.running = True
        self.process_thread = threading.Thread(target=self._process_events, daemon=True)
        self.process_thread.start()
        
        # Start touch polling thread if touch available
        if self.touch and self.touch.is_connected:
            self._touch_thread = threading.Thread(target=self._poll_touch, daemon=True)
            self._touch_thread.start()
        
        logger.info("Input manager started")
    
    def stop(self) -> None:
        """Stop input processing."""
        self.running = False
        
        if self.process_thread:
            self.process_thread.join(timeout=1.0)
        
        if self._touch_thread:
            self._touch_thread.join(timeout=1.0)
        
        if self.encoder:
            self.encoder.cleanup()
        
        if self.buttons:
            self.buttons.cleanup()
        
        if self.touch:
            self.touch.cleanup()
        
        if self.ir_remote:
            self.ir_remote.cleanup()
        
        logger.info("Input manager stopped")
    
    def _encoder_callback(self, direction: int, pressed: bool) -> None:
        """Handle encoder event."""
        if pressed:
            self.event_queue.append(InputAction.ENCODER_PRESS)
        elif direction > 0:
            self.event_queue.append(InputAction.ENCODER_CW)
        elif direction < 0:
            self.event_queue.append(InputAction.ENCODER_CCW)
    
    def _button_callback(self, action: InputAction) -> None:
        """Handle button event."""
        self.event_queue.append(action)
    
    def _touch_callback(self, action: InputAction) -> None:
        """Handle touch event."""
        self.event_queue.append(action)
    
    def _ir_callback(self, action: InputAction) -> None:
        """Handle IR remote event."""
        self.event_queue.append(action)
    
    def _poll_touch(self) -> None:
        """Poll touch panel for gestures."""
        while self.running and self.touch:
            try:
                action = self.touch.process_touch()
                if action:
                    self.event_queue.append(action)
                time.sleep(0.02)  # 50Hz polling
            except Exception as e:
                logger.error(f"Touch polling error: {e}")
                time.sleep(0.1)
    
    def _process_events(self) -> None:
        """Process queued input events."""
        while self.running:
            try:
                if self.event_queue:
                    action = self.event_queue.popleft()
                    
                    if action in self.action_handlers:
                        handler = self.action_handlers[action]
                        try:
                            handler(action)
                        except Exception as e:
                            logger.error(f"Handler error for {action}: {e}")
                    else:
                        logger.debug(f"Unhandled input action: {action}")
                
                time.sleep(0.01)  # 10ms polling
                
            except Exception as e:
                logger.error(f"Error processing input event: {e}")
    
    def simulate_action(self, action: InputAction) -> None:
        """Simulate input action (for testing without hardware).
        
        Args:
            action: Action to simulate
        """
        self.event_queue.append(action)
    
    def get_status(self) -> Dict[str, Any]:
        """Get status of all input handlers.
        
        Returns:
            Status dictionary
        """
        return {
            "running": self.running,
            "encoder_connected": self.encoder is not None,
            "buttons_connected": self.buttons is not None,
            "touch_connected": self.touch.is_connected if self.touch else False,
            "touch_type": self.config.touch_type,
            "ir_connected": self.ir_remote.is_connected if self.ir_remote else False,
            "ir_use_lirc": self.config.ir_use_lirc,
            "queue_size": len(self.event_queue),
            "registered_handlers": len(self.action_handlers),
            "gpio_available": HAS_GPIO,
            "smbus_available": HAS_SMBUS,
            "lirc_available": HAS_LIRC,
        }

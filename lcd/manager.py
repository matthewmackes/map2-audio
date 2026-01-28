"""
Integrated LCD Manager
Combines UI engine, hardware control, and input handling into unified system

This is the main entry point for LCD functionality.
"""

import logging
import time
import threading
from typing import Optional, Dict, Callable
from dataclasses import dataclass

from lcd.ui_engine import LCDUIEngine, DisplayConfig, PageType, CUSTOM_CHARS
from lcd.hardware_controller import DualLCDController, I2CScanner
from lcd.input_handler import InputManager, InputConfig, InputAction

logger = logging.getLogger(__name__)


@dataclass
class LCDSystemConfig:
    """Complete LCD system configuration."""
    # Display settings
    display: DisplayConfig = None
    
    # Input settings
    input: InputConfig = None
    
    # Hardware settings
    i2c_bus: int = 1
    i2c_addresses: list = None
    
    # Behavior settings
    auto_start: bool = True
    simulation_mode: bool = False
    update_interval: float = 0.1  # seconds
    
    def __post_init__(self):
        if self.display is None:
            self.display = DisplayConfig()
        if self.input is None:
            self.input = InputConfig()
        if self.i2c_addresses is None:
            self.i2c_addresses = [0x27, 0x3F]


class IntegratedLCDManager:
    """Main LCD system manager."""
    
    def __init__(self, config: Optional[LCDSystemConfig] = None,
                 data_provider: Optional[Callable[[], Dict]] = None):
        """Initialize integrated LCD manager.
        
        Args:
            config: System configuration
            data_provider: Function that returns dict of data to display
        """
        self.config = config or LCDSystemConfig()
        self.data_provider = data_provider
        
        # Components
        self.ui_engine: Optional[LCDUIEngine] = None
        self.hardware: Optional[DualLCDController] = None
        self.input_manager: Optional[InputManager] = None
        
        # State
        self.running = False
        self.update_thread: Optional[threading.Thread] = None
        self.last_lines: Optional[list] = None
        
        # Statistics
        self.stats = {
            'updates': 0,
            'page_changes': 0,
            'input_events': 0,
            'errors': 0,
            'start_time': None
        }
        
        self._initialize()
    
    def _initialize(self):
        """Initialize all components."""
        # Initialize UI engine
        self.ui_engine = LCDUIEngine(self.config.display)
        logger.info("UI engine initialized")
        
        # Initialize hardware (unless in simulation mode)
        if not self.config.simulation_mode:
            self.hardware = DualLCDController(
                addresses=self.config.i2c_addresses,
                bus_num=self.config.i2c_bus
            )
            
            # Load custom characters if hardware connected
            if self.hardware.displays:
                self.hardware.load_custom_chars(CUSTOM_CHARS)
                logger.info("Custom characters loaded to hardware")
        else:
            logger.info("Running in simulation mode (no hardware)")
        
        # Initialize input manager
        self.input_manager = InputManager(self.config.input)
        self._register_input_handlers()
        logger.info("Input manager initialized")
    
    def _register_input_handlers(self):
        """Register input event handlers."""
        # Map input actions to UI engine methods
        self.input_manager.register_handler(
            InputAction.NEXT_PAGE,
            lambda _: self._handle_page_change(self.ui_engine.next_page)
        )
        self.input_manager.register_handler(
            InputAction.PREV_PAGE,
            lambda _: self._handle_page_change(self.ui_engine.prev_page)
        )
        self.input_manager.register_handler(
            InputAction.ENCODER_CW,
            lambda _: self._handle_page_change(self.ui_engine.next_page)
        )
        self.input_manager.register_handler(
            InputAction.ENCODER_CCW,
            lambda _: self._handle_page_change(self.ui_engine.prev_page)
        )
        self.input_manager.register_handler(
            InputAction.MENU,
            lambda _: self._handle_page_change(
                lambda: self.ui_engine.set_page(PageType.MENU)
            )
        )
        self.input_manager.register_handler(
            InputAction.SELECT,
            lambda _: self._handle_button_press('select')
        )
        self.input_manager.register_handler(
            InputAction.UP,
            lambda _: self._handle_button_press('up')
        )
        self.input_manager.register_handler(
            InputAction.DOWN,
            lambda _: self._handle_button_press('down')
        )
    
    def _handle_page_change(self, change_func: Callable):
        """Handle page change action (RT-SAFE: no I2C writes in callback)."""
        try:
            change_func()
            self.stats['page_changes'] += 1
            self.stats['input_events'] += 1
            # DO NOT force immediate update here!
            # Update will happen in next _update_loop cycle (10 Hz is fast enough)
            # This prevents I2C writes in interrupt context
        except Exception as e:
            # Only count error, don't log (logging blocks)
            self.stats['errors'] += 1
    
    def _handle_button_press(self, button: str):
        """Handle button press (RT-SAFE: no I2C writes in callback)."""
        try:
            self.ui_engine.on_button_press(button)
            self.stats['input_events'] += 1
            # DO NOT force immediate update here!
            # Update will happen in next _update_loop cycle
        except Exception as e:
            # Only count error, don't log
            self.stats['errors'] += 1
    
    def start(self):
        """Start the LCD system."""
        if self.running:
            logger.warning("LCD system already running")
            return
        
        # Start input manager
        self.input_manager.start()
        
        # Start update thread
        self.running = True
        self.stats['start_time'] = time.time()
        self.update_thread = threading.Thread(target=self._update_loop, daemon=True)
        self.update_thread.start()
        
        logger.info("LCD system started")
    
    def stop(self):
        """Stop the LCD system."""
        if not self.running:
            return
        
        self.running = False
        
        # Stop input manager
        if self.input_manager:
            self.input_manager.stop()
        
        # Wait for update thread
        if self.update_thread:
            self.update_thread.join(timeout=1.0)
        
        # Clear displays
        if self.hardware and not self.config.simulation_mode:
            self.hardware.clear_all()
        
        logger.info("LCD system stopped")
    
    def _update_loop(self):
        """Main update loop."""
        while self.running:
            try:
                self._update_display()
                time.sleep(self.config.update_interval)
            except Exception as e:
                logger.error(f"Error in update loop: {e}")
                self.stats['errors'] += 1
                time.sleep(1.0)  # Back off on error
    
    def _update_display(self, force: bool = False):
        """Update display with current data (RT-SAFE with locking).
        
        Args:
            force: Force update even if page doesn't need it
        """
        # Thread-safe update with lock
        if not hasattr(self, '_update_lock'):
            import threading
            self._update_lock = threading.RLock()
        
        with self._update_lock:
            try:
                # Get data from provider (should be RT-safe if using cache)
                if self.data_provider:
                    data = self.data_provider()
                else:
                    data = self._get_default_data()
                
                # Update UI engine
                lines = self.ui_engine.update(data)
                
                # Only update hardware if content changed or forced
                if lines and (lines != self.last_lines or force):
                    if self.hardware and not self.config.simulation_mode:
                        # Update hardware displays
                        self.hardware.write_all(lines)
                    # No logging in hot path - just count updates
                    
                    self.last_lines = lines
                    self.stats['updates'] += 1
                    
            except Exception:
                # Only count errors, no logging (logging blocks)
                self.stats['errors'] += 1
    
    def _get_default_data(self) -> Dict:
        """Get default data when no provider is set."""
        return {
            'sample_rate': 48000,
            'buffer_size': 256,
            'cpu_load': 0.0,
            'active_chain': 'None',
            'plugins': [],
            'input_level_l': 0.0,
            'input_level_r': 0.0,
            'midi_device_in': 'None',
            'midi_device_out': 'None',
            'midi_active': False,
            'xruns': 0,
            'callback_us': 0,
            'deadline_us': 5333
        }
    
    def set_page(self, page_type: PageType):
        """Set current page.
        
        Args:
            page_type: Page to display
        """
        if self.ui_engine:
            self.ui_engine.set_page(page_type)
            self._update_display(force=True)
    
    def get_status(self) -> Dict:
        """Get system status.
        
        Returns:
            Dictionary with system status
        """
        uptime = None
        if self.stats['start_time']:
            uptime = time.time() - self.stats['start_time']
        
        status = {
            'running': self.running,
            'simulation_mode': self.config.simulation_mode,
            'current_page': self.ui_engine.current_page_type.value if self.ui_engine else None,
            'uptime_seconds': uptime,
            'statistics': self.stats.copy()
        }
        
        # Add hardware status if available
        if self.hardware:
            status['hardware'] = self.hardware.get_status()
        
        return status
    
    def simulate_input(self, action: InputAction):
        """Simulate input action (for testing).
        
        Args:
            action: Action to simulate
        """
        if self.input_manager:
            self.input_manager.simulate_action(action)
    
    def get_simulation_output(self) -> str:
        """Get ASCII simulation of current display.
        
        Returns:
            ASCII art representation of display
        """
        if not self.last_lines:
            return "No content"
        
        lines = [
            "┌────────────────────┐",
        ]
        
        for line in self.last_lines:
            lines.append(f"│{line[:20].ljust(20)}│")
        
        lines.append("└────────────────────┘")
        
        return "\n".join(lines)


# Convenience function to create and start system
def create_lcd_system(data_provider: Optional[Callable[[], Dict]] = None,
                     simulation: bool = False) -> IntegratedLCDManager:
    """Create and start LCD system.
    
    Args:
        data_provider: Function returning data dict
        simulation: Run in simulation mode (no hardware)
        
    Returns:
        Initialized and started LCD manager
    """
    config = LCDSystemConfig(simulation_mode=simulation)
    manager = IntegratedLCDManager(config, data_provider)
    
    if config.auto_start:
        manager.start()
    
    return manager

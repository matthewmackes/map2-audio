#!/usr/bin/env python3
"""
LCD Setup and Configuration Tool
Interactive wizard for detecting and configuring LCD displays

Features:
- Auto-detect I2C displays
- Test display output
- Configure GPIO pins
- Validate hardware
- Generate configuration files
"""

import sys
import time
import logging
from typing import List, Tuple, Optional

try:
    from lcd.hardware_controller import I2CScanner, LCDHardwareController, DualLCDController
    from lcd.input_handler import InputConfig, RotaryEncoder, ButtonHandler
    from lcd.manager import LCDSystemConfig, IntegratedLCDManager
    from lcd.ui_engine import CUSTOM_CHARS, PageType
except ImportError as e:
    print(f"Error importing LCD modules: {e}")
    print("Make sure you're running from the project root directory")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)


class Colors:
    """Terminal colors."""
    RESET = '\033[0m'
    BOLD = '\033[1m'
    RED = '\033[31m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    CYAN = '\033[36m'


def print_header(text: str):
    """Print section header."""
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{text.center(60)}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.RESET}\n")


def print_success(text: str):
    """Print success message."""
    print(f"{Colors.GREEN}✓ {text}{Colors.RESET}")


def print_error(text: str):
    """Print error message."""
    print(f"{Colors.RED}✗ {text}{Colors.RESET}")


def print_warning(text: str):
    """Print warning message."""
    print(f"{Colors.YELLOW}⚠ {text}{Colors.RESET}")


def print_info(text: str):
    """Print info message."""
    print(f"{Colors.CYAN}ℹ {text}{Colors.RESET}")


def scan_i2c_bus(bus_num: int = 1) -> List[int]:
    """Scan I2C bus for devices.
    
    Args:
        bus_num: I2C bus number (usually 1)
        
    Returns:
        List of found I2C addresses
    """
    print_header("Scanning I2C Bus")
    print_info(f"Scanning I2C bus {bus_num}...")
    
    try:
        scanner = I2CScanner()
        addresses = scanner.scan(bus_num)
        
        if addresses:
            print_success(f"Found {len(addresses)} I2C device(s):")
            for addr in addresses:
                device_type = "LCD display" if addr in [0x27, 0x3F, 0x20, 0x38] else "Unknown"
                print(f"  • 0x{addr:02X} - {device_type}")
        else:
            print_warning("No I2C devices found")
            print_info("Check wiring and ensure I2C is enabled (raspi-config)")
        
        return addresses
        
    except Exception as e:
        print_error(f"I2C scan failed: {e}")
        print_info("Make sure I2C is enabled and you have permissions")
        print_info("Run: sudo usermod -a -G i2c $USER")
        return []


def test_display(address: int, bus_num: int = 1) -> bool:
    """Test a single LCD display.
    
    Args:
        address: I2C address to test
        bus_num: I2C bus number
        
    Returns:
        True if test successful
    """
    print_header(f"Testing Display at 0x{address:02X}")
    
    try:
        # Initialize controller
        print_info("Initializing display...")
        controller = LCDHardwareController(address, bus_num)
        
        if not controller:
            print_error("Failed to initialize display")
            return False
        
        print_success("Display initialized")
        
        # Test 1: Clear display
        print_info("Test 1: Clearing display...")
        controller.clear()
        time.sleep(0.5)
        print_success("Clear successful")
        
        # Test 2: Write text
        print_info("Test 2: Writing text...")
        controller.write_line(0, "MAP2 Audio")
        controller.write_line(1, "Display Test")
        time.sleep(2)
        print_success("Text write successful")
        
        # Test 3: Custom characters
        print_info("Test 3: Testing custom characters...")
        controller.load_custom_characters(CUSTOM_CHARS)
        controller.clear()
        controller.write_line(0, "VU: \x00\x01\x02\x03\x04\x05\x06\x07")
        controller.write_line(1, "Icons: \x00 \x01 \x02")
        time.sleep(2)
        print_success("Custom characters loaded")
        
        # Test 4: Backlight control
        print_info("Test 4: Testing backlight...")
        for i in range(3):
            controller.set_backlight(False)
            time.sleep(0.3)
            controller.set_backlight(True)
            time.sleep(0.3)
        print_success("Backlight control working")
        
        # Final message
        controller.clear()
        controller.write_line(0, "All Tests Passed!", center=True)
        controller.write_line(1, "Display OK", center=True)
        time.sleep(2)
        
        controller.clear()
        return True
        
    except Exception as e:
        print_error(f"Display test failed: {e}")
        return False


def test_gpio_input(config: InputConfig) -> bool:
    """Test GPIO input devices.
    
    Args:
        config: Input configuration
        
    Returns:
        True if test successful
    """
    print_header("Testing GPIO Input")
    
    try:
        import RPi.GPIO as GPIO
        
        print_info("Testing rotary encoder...")
        print_info(f"CLK: GPIO{config.encoder_clk}, DT: GPIO{config.encoder_dt}, SW: GPIO{config.encoder_sw}")
        
        encoder = RotaryEncoder(config)
        encoder.start()
        
        print_info("Rotate encoder and press button (30 seconds)...")
        print_info("Press Ctrl+C to stop early")
        
        events = []
        def track_event(position, button_pressed):
            events.append((position, button_pressed))
            print(f"  Position: {position}, Button: {'Pressed' if button_pressed else 'Released'}")
        
        # Monitor for 30 seconds
        start_time = time.time()
        try:
            while time.time() - start_time < 30:
                pos = encoder.get_position()
                btn = encoder.button_pressed
                if events and (pos != events[-1][0] or btn != events[-1][1]):
                    track_event(pos, btn)
                elif not events:
                    events.append((pos, btn))
                time.sleep(0.1)
        except KeyboardInterrupt:
            print_info("Stopped by user")
        
        encoder.stop()
        
        if len(events) > 1:
            print_success(f"Encoder test passed ({len(events)} events)")
            return True
        else:
            print_warning("No encoder events detected")
            print_info("Check wiring and GPIO pin numbers")
            return False
            
    except ImportError:
        print_error("RPi.GPIO not available")
        print_info("Install with: pip install RPi.GPIO")
        return False
    except Exception as e:
        print_error(f"GPIO test failed: {e}")
        return False


def test_full_system(addresses: List[int], bus_num: int = 1):
    """Test complete LCD system integration.
    
    Args:
        addresses: List of I2C addresses for displays
        bus_num: I2C bus number
    """
    print_header("Testing Full System Integration")
    
    try:
        # Create system config
        config = LCDSystemConfig(
            i2c_addresses=addresses,
            i2c_bus=bus_num,
            simulation_mode=False
        )
        
        # Create manager
        print_info("Initializing LCD manager...")
        manager = IntegratedLCDManager(config)
        
        # Start system
        print_info("Starting LCD system...")
        manager.start()
        print_success("System started")
        
        # Cycle through pages
        pages = [
            PageType.STATUS,
            PageType.VU_METERS,
            PageType.CHAIN,
            PageType.PLUGINS,
            PageType.MIDI,
            PageType.PERF,
            PageType.MENU
        ]
        
        print_info("Cycling through pages...")
        for page in pages:
            print(f"  • {page.value}")
            manager.set_page(page)
            time.sleep(3)
        
        # Show status
        status = manager.get_status()
        print_success("System integration test complete")
        print_info(f"Statistics:")
        print(f"  • Updates: {status['statistics']['updates']}")
        print(f"  • Page changes: {status['statistics']['page_changes']}")
        print(f"  • Errors: {status['statistics']['errors']}")
        
        # Stop system
        manager.stop()
        print_success("System stopped cleanly")
        
        return True
        
    except Exception as e:
        print_error(f"System integration test failed: {e}")
        return False


def generate_config(addresses: List[int], bus_num: int = 1) -> str:
    """Generate configuration file content.
    
    Args:
        addresses: I2C addresses
        bus_num: I2C bus number
        
    Returns:
        Configuration file content
    """
    config_template = f"""# MAP2 Audio LCD Configuration
# Generated by setup_tool.py

[display]
width = 20
height = 4
backlight = true
update_interval = 0.1

[hardware]
i2c_bus = {bus_num}
i2c_addresses = {','.join([f'0x{a:02X}' for a in addresses])}

[input]
# Rotary encoder pins (BCM numbering)
encoder_clk = 17
encoder_dt = 18
encoder_sw = 27

# Navigation button pins
button_up = 22
button_down = 23
button_select = 24
button_back = 25

# Timing settings
debounce_ms = 50
long_press_ms = 1000

[behavior]
auto_start = true
screensaver_timeout = 300
default_page = STATUS
"""
    
    return config_template


def main():
    """Main setup wizard."""
    import argparse
    
    parser = argparse.ArgumentParser(description='MAP2 Audio LCD Setup Tool')
    parser.add_argument('--auto', action='store_true',
                       help='Auto-detect and configure without prompts (for installation)')
    args = parser.parse_args()
    
    if not args.auto:
        print(f"""
{Colors.BOLD}{Colors.CYAN}
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║                MAP2 Audio LCD Setup Tool                  ║
║                                                           ║
║  Hardware Detection • Configuration • Testing             ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
{Colors.RESET}
""")
    
    # Check if running as root
    import os
    if os.geteuid() != 0 and not args.auto:
        print_warning("Not running as root - some features may not work")
        print_info("Consider running with: sudo python3 -m lcd.setup_tool")
    
    # Step 1: Scan I2C bus
    addresses = scan_i2c_bus()
    
    if not addresses:
        if args.auto:
            # Auto mode: just note and continue
            print_warning("No I2C devices found - LCD will run in simulation mode")
            return 0
        else:
            print_error("No I2C devices found - cannot continue")
            print_info("Enable I2C with: sudo raspi-config")
            print_info("Then select: 3 Interface Options -> I5 I2C -> Yes")
            sys.exit(1)
    
    # Filter to likely LCD addresses
    lcd_addresses = [a for a in addresses if a in [0x27, 0x3F, 0x20, 0x38]]
    
    if not lcd_addresses:
        if args.auto:
            # Try all addresses in auto mode
            lcd_addresses = addresses[:2]  # Test first 2 devices max
        else:
            print_warning("No LCD displays found at common addresses")
            response = input(f"\nTry testing all {len(addresses)} device(s)? (y/n): ")
            if response.lower() == 'y':
                lcd_addresses = addresses
            else:
                sys.exit(1)
    
    # Step 2: Test each display
    working_displays = []
    for addr in lcd_addresses:
        try:
            if test_display(addr):
                working_displays.append(addr)
                if args.auto:
                    break  # One working display is enough for auto mode
        except Exception as e:
            if not args.auto:
                print_error(f"Error testing 0x{addr:02X}: {e}")
    
    if not working_displays:
        if args.auto:
            print_warning("No working displays found - will use simulation mode")
            return 0
        else:
            print_error("No working displays found")
            sys.exit(1)
    
    print_success(f"Found {len(working_displays)} working display(s)")
    
    # Step 3: Generate configuration automatically
    config_content = generate_config(working_displays)
    config_path = "lcd_config.ini"
    
    with open(config_path, 'w') as f:
        f.write(config_content)
    
    print_success(f"Configuration saved to {config_path}")
    
    if args.auto:
        # Auto mode: done
        return 0
    
    # Step 4: Test GPIO (optional, interactive only)
    response = input("\nTest GPIO input devices? (y/n): ")
    if response.lower() == 'y':
        config = InputConfig()
        test_gpio_input(config)
    
    # Step 5: Test full system integration (interactive only)
    response = input("\nTest full system integration? (y/n): ")
    if response.lower() == 'y':
        test_full_system(working_displays)
    
    # Summary
    print_header("Setup Complete")
    print_success("LCD system configured successfully!")
    print_info("Next steps:")
    print("  1. Review lcd_config.ini and adjust as needed")
    print("  2. Start the LCD service with: systemctl start map2-lcd")
    print("  3. Enable auto-start with: systemctl enable map2-lcd")
    print(f"\n{Colors.BOLD}Enjoy your MAP2 Audio LCD interface!{Colors.RESET}\n")
    
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print(f"\n\n{Colors.YELLOW}Setup cancelled by user{Colors.RESET}")
        sys.exit(0)
    except Exception as e:
        print_error(f"Setup failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

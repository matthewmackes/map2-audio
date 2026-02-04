#!/usr/bin/env python3
"""
FT232H LCD Test Script

Tests I2C LCD display connected via FT232H USB adapter.
Run with: python lcd/test_ft232h_lcd.py

Wiring guide for FT232H to I2C LCD:
  - LCD SDA -> FT232H AD1 (pin 2)
  - LCD SCL -> FT232H AD0 (pin 1)
  - LCD VCC -> 5V (external power recommended)
  - LCD GND -> GND (shared with FT232H)
"""

import sys
import time

def check_pyftdi():
    """Check if pyftdi is available."""
    try:
        from pyftdi.i2c import I2cController
        return True
    except ImportError:
        print("ERROR: pyftdi not installed")
        print("Install with: pip install pyftdi")
        return False

def check_usb_permissions():
    """Check USB device permissions."""
    import subprocess
    result = subprocess.run(['lsusb'], capture_output=True, text=True)
    if '0403:6014' not in result.stdout:
        print("ERROR: FT232H not detected")
        print("Check that the USB adapter is connected")
        return False
    print("✓ FT232H USB adapter detected")
    return True

def scan_i2c():
    """Scan I2C bus for devices."""
    from pyftdi.i2c import I2cController
    
    print("\nScanning I2C bus...")
    i2c = I2cController()
    try:
        i2c.configure('ftdi://ftdi:232h/1', frequency=100000)
        print(f"I2C bus configured at {i2c.frequency} Hz")
        
        found = []
        for addr in range(0x08, 0x78):
            try:
                port = i2c.get_port(addr)
                port.write([])
                found.append(addr)
                print(f"  ✓ Device at 0x{addr:02x}")
            except:
                pass
        
        return found
    finally:
        i2c.terminate()

def test_lcd(address=0x27):
    """Test LCD at given address."""
    sys.path.insert(0, '/home/mm/map2-audio')
    from lcd.hardware_controller import FT232HLCDController
    from datetime import datetime
    
    print(f"\nTesting LCD at 0x{address:02x}...")
    
    lcd = FT232HLCDController(address=address, cols=20, rows=4)
    
    if not lcd.connected:
        print("✗ Failed to connect to LCD")
        return False
    
    print("✓ LCD connected")
    print(f"  Status: {lcd.get_status()}")
    
    # Write test pattern
    print("\nWriting test pattern...")
    lcd.clear()
    lcd.write_line(0, "MAP2 Audio Platform")
    lcd.write_line(1, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    lcd.write_line(2, "FT232H USB-to-I2C")
    lcd.write_line(3, "LCD Test OK!")
    
    print("✓ Test pattern written")
    return True

def main():
    print("=" * 50)
    print("FT232H LCD Test")
    print("=" * 50)
    
    if not check_pyftdi():
        return 1
    
    if not check_usb_permissions():
        return 1
    
    devices = scan_i2c()
    
    if not devices:
        print("\n✗ No I2C devices found!")
        print("\nTroubleshooting:")
        print("1. Check wiring:")
        print("   - SDA -> AD1 (pin 2)")
        print("   - SCL -> AD0 (pin 1)")
        print("   - VCC -> 5V")
        print("   - GND -> GND")
        print("2. Check LCD power (backlight should be on)")
        print("3. Try unplugging and replugging the USB adapter")
        return 1
    
    # Find LCD addresses
    lcd_addrs = [0x27, 0x3F, 0x20, 0x38, 0x3E]
    lcds = [a for a in devices if a in lcd_addrs]
    
    if not lcds:
        print(f"\n✗ No LCD found at standard addresses {[hex(a) for a in lcd_addrs]}")
        print(f"Found devices at: {[hex(a) for a in devices]}")
        return 1
    
    print(f"\n✓ LCD detected at: {[hex(a) for a in lcds]}")
    
    # Test first LCD
    if test_lcd(lcds[0]):
        print("\n" + "=" * 50)
        print("✓ LCD TEST PASSED")
        print("=" * 50)
        return 0
    else:
        print("\n✗ LCD test failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())

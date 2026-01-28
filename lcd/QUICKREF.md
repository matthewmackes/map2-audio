# LCD System Quick Reference

## 🚀 Quick Start
```bash
sudo ./lcd/install_lcd.sh      # Install everything
sudo python3 -m lcd.setup_tool # Run setup wizard
sudo systemctl start map2-lcd  # Start service
```

## 📱 Pages
- **STATUS** - System overview
- **VU** - Level meters  
- **CHAIN** - Effect chain
- **PLUGINS** - Plugin browser
- **MIDI** - MIDI activity
- **PERF** - Performance stats
- **SETTINGS** - Configuration
- **MENU** - Navigation

## 🎮 Controls
- **Encoder** - Rotate to switch pages
- **UP/DOWN** - Navigate lists
- **SELECT** - Confirm
- **BACK** - Return

## 🔧 Service Commands
```bash
sudo systemctl start map2-lcd    # Start
sudo systemctl stop map2-lcd     # Stop
sudo systemctl restart map2-lcd  # Restart
sudo systemctl status map2-lcd   # Status
journalctl -u map2-lcd -f        # Logs
```

## 🧪 Testing
```bash
python3 -m lcd.test_suite              # Simulation
python3 -m lcd.test_suite --hardware   # Hardware test
python3 -m lcd.test_suite --hardware --demo  # Demo
```

## 🐛 Troubleshooting
```bash
# Check I2C
i2cdetect -y 1

# Test display
sudo python3 -m lcd.setup_tool

# View logs
journalctl -u map2-lcd -n 50

# Check permissions
groups $USER  # Should include: i2c gpio
```

## 📝 Files
- `lcd/manager.py` - Main system
- `lcd/ui_engine.py` - UI pages
- `lcd/hardware_controller.py` - I2C LCD
- `lcd/input_handler.py` - GPIO input
- `lcd/service.py` - systemd service
- `lcd/setup_tool.py` - Setup wizard
- `lcd/test_suite.py` - Tests
- `lcd_config.ini` - Configuration

## 🔌 Hardware
### LCD (I2C)
- VCC → 5V
- GND → GND
- SDA → GPIO 2
- SCL → GPIO 3

### Encoder
- CLK → GPIO 17
- DT → GPIO 18
- SW → GPIO 27

### Buttons
- UP → GPIO 22
- DOWN → GPIO 23
- SELECT → GPIO 24
- BACK → GPIO 25

## 📊 Common I2C Addresses
- 0x27 - Most common
- 0x3F - Alternative
- 0x20 - PCF8574A
- 0x38 - Variant

## 💡 Tips
- Enable I2C: `sudo raspi-config`
- Reboot after enabling I2C
- Use 400kHz I2C for best performance
- Check wiring if no devices found
- Logout/login after adding to groups
- Run setup wizard to test everything

## 🐍 Python API
```python
from lcd import create_lcd_system, PageType

# Create system
manager = create_lcd_system(simulation=False)

# Control
manager.set_page(PageType.VU_METERS)
status = manager.get_status()
manager.stop()
```

## 📖 Full Documentation
See `lcd/LCD_SYSTEM.md` for complete docs.

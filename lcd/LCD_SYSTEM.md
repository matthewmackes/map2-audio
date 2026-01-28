# MAP2 Audio LCD Interface System

Professional multi-page LCD display system for the MAP2 Audio Platform, inspired by high-end guitar processors like Kemper Profiler, Line 6 Helix, and Fractal Axe-FX.

## Features

### Multi-Page UI System
- **Status Page**: Sample rate, buffer size, CPU load, active chain
- **VU Meters**: Stereo level meters with peak hold and color zones
- **Chain Page**: Effect chain display with scrolling plugin list
- **Plugin List**: Scrollable plugin browser with bypass indicators
- **MIDI Activity**: MIDI device info and activity monitoring
- **Performance**: CPU load, xruns, callback time, utilization
- **Menu System**: Navigation menu for configuration

### Hardware Support
- **I2C LCD Displays**: HD44780 character displays (20x4 recommended)
- **PCF8574 I2C Backpack**: Standard I2C expander support
- **Multiple Displays**: Support for dual display configurations
- **Auto-Detection**: Automatic I2C scanning and device detection
- **Custom Characters**: VU meter bars, icons (note, speaker, CPU, chain)

### Input Handling
- **Rotary Encoder**: Interrupt-based encoder reading with detent support
- **Navigation Buttons**: Up, Down, Select, Menu, Back buttons
- **GPIO Support**: Raspberry Pi GPIO with debouncing
- **Event System**: Asynchronous event processing with callbacks

### Integration
- **Backend Connection**: Real-time data from MAP2 backend API
- **systemd Service**: Auto-start with system boot
- **Simulation Mode**: Development and testing without hardware
- **Graceful Fallback**: Continues operation when backend unavailable

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   IntegratedLCDManager                      │
│  (Main system coordinator - connects all components)        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  UI Engine   │  │   Hardware   │  │  Input Handler  │  │
│  │              │  │  Controller  │  │                 │  │
│  │ • 8 Pages    │  │ • I2C Bus    │  │ • Rotary Enc    │  │
│  │ • Custom     │  │ • LCD Driver │  │ • Buttons       │  │
│  │   Chars      │  │ • Backlight  │  │ • Event Queue   │  │
│  │ • Rendering  │  │ • Multi-LCD  │  │ • Callbacks     │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
│         │                  │                   │           │
│         └──────────────────┴───────────────────┘           │
│                            │                               │
│                   ┌────────▼─────────┐                     │
│                   │  Data Provider   │                     │
│                   │  (MAP2 Backend)  │                     │
│                   └──────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. UI Engine (`ui_engine.py`)
Handles page rendering and display logic.

```python
from lcd.ui_engine import LCDUIEngine, DisplayConfig, PageType

config = DisplayConfig(width=20, height=4)
engine = LCDUIEngine(config)

# Switch pages
engine.set_page(PageType.VU_METERS)

# Update with data
data = {
    'sample_rate': 48000,
    'cpu_load': 45.5,
    'input_level_l': 0.75,
    'input_level_r': 0.80
}
lines = engine.update(data)
```

**Pages:**
- `STATUS` - System overview
- `VU_METERS` - Level meters with peak hold
- `CHAIN` - Effect chain visualization
- `PLUGINS` - Plugin list browser
- `MIDI` - MIDI device activity
- `PERF` - Performance metrics
- `SETTINGS` - Configuration options
- `MENU` - Navigation menu

### 2. Hardware Controller (`hardware_controller.py`)
I2C LCD hardware interface.

```python
from lcd.hardware_controller import I2CScanner, DualLCDController

# Scan for displays
scanner = I2CScanner()
addresses = scanner.scan(bus_num=1)

# Initialize dual displays
controller = DualLCDController(addresses=[0x27, 0x3F])
controller.write_all(["Line 1", "Line 2", "Line 3", "Line 4"])
```

**Features:**
- Auto I2C scanning
- Custom character loading
- Backlight control
- Multi-display coordination

### 3. Input Handler (`input_handler.py`)
GPIO input device management.

```python
from lcd.input_handler import InputManager, InputConfig, InputAction

config = InputConfig(
    encoder_clk=17,
    encoder_dt=18,
    encoder_sw=27
)

manager = InputManager(config)

# Register callbacks
def on_rotate(action):
    print(f"Encoder: {action}")

manager.register_handler(InputAction.ENCODER_CW, on_rotate)
manager.start()
```

**Input Actions:**
- `UP`, `DOWN`, `LEFT`, `RIGHT` - Navigation
- `SELECT`, `MENU`, `BACK` - Control
- `ENCODER_CW`, `ENCODER_CCW`, `ENCODER_PRESS` - Rotary encoder
- `NEXT_PAGE`, `PREV_PAGE` - Page switching

### 4. Integrated Manager (`manager.py`)
Main system orchestrator.

```python
from lcd.manager import create_lcd_system

# Simple creation
manager = create_lcd_system(simulation=False)

# With custom data provider
def get_audio_data():
    return {
        'sample_rate': 48000,
        'cpu_load': get_cpu_load(),
        # ...
    }

manager = create_lcd_system(
    data_provider=get_audio_data,
    simulation=False
)

# Control
manager.set_page(PageType.VU_METERS)
status = manager.get_status()
```

## Installation

### Automatic Installation
```bash
# Install LCD system
sudo ./lcd/install_lcd.sh

# Or run as part of main setup
./setup.sh  # Includes LCD installation
```

### Manual Installation

1. **Enable I2C:**
```bash
sudo raspi-config
# 3 Interface Options -> I5 I2C -> Yes
```

2. **Install dependencies:**
```bash
# System packages
sudo apt-get install i2c-tools python3-smbus python3-rpi.gpio

# Python packages
pip3 install -r requirements-lcd.txt
```

3. **Add user to groups:**
```bash
sudo usermod -a -G i2c,gpio $USER
```

4. **Install service:**
```bash
sudo cp systemd/map2-lcd.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable map2-lcd
```

## Hardware Setup

### Recommended Hardware
- **LCD**: 20x4 character LCD with HD44780 controller
- **I2C Backpack**: PCF8574 or PCF8574A I2C expander
- **Rotary Encoder**: KY-040 or similar (with push button)
- **Buttons**: 4-6 momentary push buttons

### Wiring

#### I2C LCD (20x4)
```
LCD Backpack    Raspberry Pi
────────────    ────────────
VCC       →     5V (Pin 2)
GND       →     GND (Pin 6)
SDA       →     GPIO 2 (SDA, Pin 3)
SCL       →     GPIO 3 (SCL, Pin 5)
```

#### Rotary Encoder
```
Encoder     Raspberry Pi
────────    ────────────
CLK   →     GPIO 17 (Pin 11)
DT    →     GPIO 18 (Pin 12)
SW    →     GPIO 27 (Pin 13)
+     →     3.3V (Pin 1)
GND   →     GND (Pin 9)
```

#### Navigation Buttons
```
Button      Raspberry Pi
────────    ────────────
UP      →   GPIO 22 (Pin 15)
DOWN    →   GPIO 23 (Pin 16)
SELECT  →   GPIO 24 (Pin 18)
BACK    →   GPIO 25 (Pin 22)
(All with pull-up resistors and connected to GND)
```

### I2C Configuration

Check I2C devices:
```bash
i2cdetect -y 1
```

Common LCD addresses:
- `0x27` - Most common for PCF8574
- `0x3F` - Alternative PCF8574 address
- `0x20` - PCF8574A variant
- `0x38` - Alternative variant

## Setup and Testing

### Interactive Setup Wizard
```bash
# Run comprehensive setup wizard
sudo python3 -m lcd.setup_tool
```

The wizard will:
1. Scan I2C bus for displays
2. Test each display with patterns
3. Test GPIO input devices
4. Run full system integration test
5. Generate configuration file

### Test Suite
```bash
# Run in simulation mode (no hardware)
python3 -m lcd.test_suite

# Run with real hardware
python3 -m lcd.test_suite --hardware

# Demo mode only
python3 -m lcd.test_suite --hardware --demo
```

Tests include:
- UI engine rendering
- Hardware controller I2C
- Input handler GPIO
- Manager integration
- Page transitions
- Data updates
- Custom characters
- Performance benchmarks

## Configuration

### Configuration File (`lcd_config.ini`)

```ini
[display]
width = 20
height = 4
backlight = true
update_interval = 0.1

[hardware]
i2c_bus = 1
i2c_addresses = 0x27,0x3F

[input]
# Rotary encoder pins (BCM numbering)
encoder_clk = 17
encoder_dt = 18
encoder_sw = 27

# Navigation buttons
button_up = 22
button_down = 23
button_select = 24
button_back = 25

# Timing
debounce_ms = 50
long_press_ms = 1000

[behavior]
auto_start = true
screensaver_timeout = 300
default_page = STATUS
```

### Environment Variables

- `MAP2_BACKEND_URL` - Backend API URL (default: http://localhost:8080)
- `MAP2_LCD_SIMULATION` - Run in simulation mode (default: false)

## Service Management

### systemd Service

```bash
# Start service
sudo systemctl start map2-lcd

# Stop service
sudo systemctl stop map2-lcd

# Restart service
sudo systemctl restart map2-lcd

# Enable auto-start
sudo systemctl enable map2-lcd

# View status
sudo systemctl status map2-lcd

# View logs
journalctl -u map2-lcd -f
```

### Service Dependencies
The LCD service depends on:
- `map2-backend.service` - For real-time data
- `network.target` - For API access

## Usage Examples

### Basic Usage

```python
from lcd import create_lcd_system, PageType

# Create and start system
manager = create_lcd_system(simulation=False)

# Switch pages
manager.set_page(PageType.VU_METERS)

# Get status
status = manager.get_status()
print(f"Updates: {status['statistics']['updates']}")
print(f"Page: {status['current_page']}")
```

### Custom Data Provider

```python
from lcd import create_lcd_system
import psutil

def get_system_data():
    return {
        'sample_rate': 48000,
        'buffer_size': 256,
        'cpu_load': psutil.cpu_percent(),
        'active_chain': 'My Chain',
        'plugins': ['EQ', 'Comp', 'Amp'],
        'input_level_l': 0.5,
        'input_level_r': 0.5,
        'xruns': 0
    }

manager = create_lcd_system(
    data_provider=get_system_data,
    simulation=False
)
```

### Input Event Handling

```python
from lcd import create_lcd_system, InputAction

manager = create_lcd_system(simulation=False)

# Simulate button press (for testing)
manager.simulate_input(InputAction.UP)
manager.simulate_input(InputAction.SELECT)
```

### Programmatic Page Control

```python
from lcd import IntegratedLCDManager, LCDSystemConfig, PageType

config = LCDSystemConfig(
    i2c_addresses=[0x27],
    simulation_mode=False,
    update_interval=0.1
)

manager = IntegratedLCDManager(config)
manager.start()

# Cycle through pages
import time
for page in PageType:
    manager.set_page(page)
    time.sleep(3)

manager.stop()
```

## Development

### Simulation Mode

Develop without hardware:

```python
from lcd import create_lcd_system

# Simulation mode - no hardware required
manager = create_lcd_system(simulation=True)

# Get ASCII representation
print(manager.get_simulation_output())
```

Output:
```
┌────────────────────┐
│MAP2 Audio Platform │
│SR: 48000 Buf: 256  │
│CPU: 0.0%  XR: 0    │
│Chain: None         │
└────────────────────┘
```

### Adding Custom Pages

```python
from lcd.ui_engine import LCDPage, PageType

class CustomPage(LCDPage):
    def __init__(self, config):
        super().__init__(PageType.SETTINGS, config)
    
    def render(self, data: dict) -> list:
        return [
            "Custom Page Title",
            f"Value: {data.get('value', 0)}",
            "Line 3",
            "Line 4"
        ]
    
    def should_update(self, data: dict) -> bool:
        return True  # Always update

# Register custom page
engine.pages[PageType.SETTINGS] = CustomPage(config)
```

## Troubleshooting

### I2C Not Working

**Check I2C enabled:**
```bash
ls /dev/i2c-*
# Should show: /dev/i2c-1
```

**Check permissions:**
```bash
groups $USER
# Should include: i2c gpio
```

**Scan bus:**
```bash
i2cdetect -y 1
```

### Display Not Responding

**Check wiring:**
- VCC to 5V (not 3.3V!)
- SDA/SCL correct
- GND connected

**Test I2C address:**
```python
from lcd.hardware_controller import I2CScanner
scanner = I2CScanner()
addresses = scanner.scan(1)
print(f"Found: {[hex(a) for a in addresses]}")
```

**Try different address:**
Modify `lcd_config.ini` with detected address.

### GPIO Input Issues

**Check GPIO permissions:**
```bash
sudo usermod -a -G gpio $USER
# Logout and login again
```

**Test GPIO:**
```bash
# Install GPIO test tool
sudo apt-get install python3-gpiozero

# Test encoder
python3 -c "
from gpiozero import RotaryEncoder
encoder = RotaryEncoder(17, 18)
print('Rotate encoder...')
while True:
    print(encoder.steps)
"
```

### Service Won't Start

**Check logs:**
```bash
journalctl -u map2-lcd -n 50
```

**Check dependencies:**
```bash
sudo systemctl status map2-backend
pip3 list | grep -E 'smbus2|RPLCD|RPi.GPIO'
```

**Test manually:**
```bash
cd /home/mm/map2-audio
python3 -m lcd.service
```

## Performance

### Benchmarks
- UI Update: ~0.3ms average
- Hardware Write: ~10ms (I2C)
- Input Processing: <0.1ms
- Page Transition: <1ms
- Overall Throughput: >1000 updates/sec

### Optimization Tips
- Use `update_interval` of 0.1s for smooth updates
- Enable page-specific `should_update()` to skip unnecessary renders
- Use I2C bus speed of 400kHz for faster communication
- Run service with Nice=-10 for priority

## API Reference

See individual module documentation:
- [ui_engine.py](ui_engine.py) - Page rendering system
- [hardware_controller.py](hardware_controller.py) - I2C hardware interface
- [input_handler.py](input_handler.py) - GPIO input handling
- [manager.py](manager.py) - Integrated system manager
- [service.py](service.py) - systemd service implementation

## Contributing

When adding new features:
1. Update relevant docstrings
2. Add tests to `test_suite.py`
3. Update this documentation
4. Test in both simulation and hardware modes

## License

Part of the MAP2 Audio Platform project.

## Credits

Inspired by professional guitar processor interfaces:
- Kemper Profiler - Clean multi-page design
- Line 6 Helix - Intuitive navigation
- Fractal Axe-FX - Comprehensive information display

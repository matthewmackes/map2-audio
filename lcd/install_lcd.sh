#!/bin/bash
# Install LCD Display System
# Installs LCD hardware support, systemd service, and configuration

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Banner
echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║           MAP2 Audio LCD Installation Script             ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}✗ This script must be run as root (use sudo)${NC}"
    exit 1
fi

# Get the actual user (not root)
ACTUAL_USER=${SUDO_USER:-$USER}
ACTUAL_HOME=$(eval echo ~$ACTUAL_USER)

echo -e "${BLUE}Installing for user: $ACTUAL_USER${NC}\n"

# Step 1: Check I2C enabled
echo -e "${YELLOW}[1/8] Checking I2C configuration...${NC}"
if ! grep -q "^dtparam=i2c_arm=on" /boot/config.txt 2>/dev/null && \
   ! grep -q "^dtparam=i2c_arm=on" /boot/firmware/config.txt 2>/dev/null; then
    echo -e "${YELLOW}  I2C not enabled, enabling now...${NC}"
    
    # Find correct config file
    if [ -f /boot/firmware/config.txt ]; then
        CONFIG_FILE="/boot/firmware/config.txt"
    elif [ -f /boot/config.txt ]; then
        CONFIG_FILE="/boot/config.txt"
    else
        echo -e "${RED}  ✗ Could not find config.txt${NC}"
        exit 1
    fi
    
    echo "dtparam=i2c_arm=on" >> "$CONFIG_FILE"
    echo "dtparam=i2c_baudrate=400000" >> "$CONFIG_FILE"
    echo -e "${GREEN}  ✓ I2C enabled in $CONFIG_FILE${NC}"
    echo -e "${YELLOW}  ⚠ Reboot required for I2C changes${NC}"
else
    echo -e "${GREEN}  ✓ I2C already enabled${NC}"
fi

# Step 2: Install system packages
echo -e "${YELLOW}[2/8] Installing system packages...${NC}"
apt-get update -qq
apt-get install -y -qq \
    i2c-tools \
    python3-smbus \
    python3-dev \
    python3-pip \
    python3-rpi.gpio \
    > /dev/null 2>&1
echo -e "${GREEN}  ✓ System packages installed${NC}"

# Step 3: Add user to i2c group
echo -e "${YELLOW}[3/8] Configuring user permissions...${NC}"
if ! groups $ACTUAL_USER | grep -q "\bi2c\b"; then
    usermod -a -G i2c $ACTUAL_USER
    echo -e "${GREEN}  ✓ Added $ACTUAL_USER to i2c group${NC}"
else
    echo -e "${GREEN}  ✓ User already in i2c group${NC}"
fi

if ! groups $ACTUAL_USER | grep -q "\bgpio\b"; then
    usermod -a -G gpio $ACTUAL_USER
    echo -e "${GREEN}  ✓ Added $ACTUAL_USER to gpio group${NC}"
else
    echo -e "${GREEN}  ✓ User already in gpio group${NC}"
fi

# Step 4: Install Python dependencies
echo -e "${YELLOW}[4/8] Installing Python dependencies...${NC}"
cd "$PROJECT_ROOT"

# Create requirements-lcd.txt if it doesn't exist
cat > requirements-lcd.txt << 'EOF'
# LCD Display Dependencies
smbus2>=0.4.2
RPLCD>=1.3.0
RPi.GPIO>=0.7.1
requests>=2.31.0
EOF

sudo -u $ACTUAL_USER pip3 install -q -r requirements-lcd.txt
echo -e "${GREEN}  ✓ Python dependencies installed${NC}"

# Step 5: Run hardware detection
echo -e "${YELLOW}[5/8] Detecting LCD hardware...${NC}"
if command -v i2cdetect &> /dev/null; then
    # Scan I2C bus
    echo "  Scanning I2C bus 1..."
    i2cdetect -y 1 | tail -n +2 | while read line; do
        if echo "$line" | grep -qE '[0-9a-f]{2}'; then
            echo "  Found devices: $line"
        fi
    done
    echo -e "${GREEN}  ✓ Hardware scan complete${NC}"
else
    echo -e "${YELLOW}  ⚠ i2cdetect not available, skipping scan${NC}"
fi

# Step 6: Install systemd service
echo -e "${YELLOW}[6/8] Installing systemd service...${NC}"

# Copy service file with user substitution
sed "s/%u/$ACTUAL_USER/g; s/%g/$ACTUAL_USER/g" \
    "$PROJECT_ROOT/systemd/map2-lcd.service" \
    > /etc/systemd/system/map2-lcd.service

# Reload systemd
systemctl daemon-reload
echo -e "${GREEN}  ✓ Service installed: map2-lcd.service${NC}"

# Step 7: Create default config
echo -e "${YELLOW}[7/8] Creating default configuration...${NC}"

LCD_CONFIG="$ACTUAL_HOME/map2-audio/lcd_config.ini"

if [ ! -f "$LCD_CONFIG" ]; then
    cat > "$LCD_CONFIG" << 'EOF'
# MAP2 Audio LCD Configuration

[display]
width = 20
height = 4
backlight = true
update_interval = 0.1

[hardware]
i2c_bus = 1
# Common LCD addresses: 0x27, 0x3F, 0x20, 0x38
i2c_addresses = 0x27,0x3F

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
EOF

    chown $ACTUAL_USER:$ACTUAL_USER "$LCD_CONFIG"
    echo -e "${GREEN}  ✓ Configuration created: $LCD_CONFIG${NC}"
else
    echo -e "${GREEN}  ✓ Configuration already exists${NC}"
fi

# Step 8: Service management
echo -e "${YELLOW}[8/8] Configuring service...${NC}"

# Enable service
if [ "$MAP2_AUTO_INSTALL" = "1" ]; then
    # Non-interactive mode: enable and start
    systemctl enable map2-lcd.service
    echo -e "${GREEN}  ✓ Service enabled (will start on boot)${NC}"
    
    # Only start if map2-backend is running
    if systemctl is-active --quiet map2-backend.service; then
        systemctl start map2-lcd.service
        echo -e "${GREEN}  ✓ Service started${NC}"
    else
        echo -e "${YELLOW}  ⚠ Backend not running, LCD service not started${NC}"
    fi
else
    # Interactive mode: ask user
    read -p "Enable LCD service to start on boot? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        systemctl enable map2-lcd.service
        echo -e "${GREEN}  ✓ Service enabled${NC}"
        
        read -p "Start LCD service now? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            systemctl start map2-lcd.service
            echo -e "${GREEN}  ✓ Service started${NC}"
        fi
    fi
fi

# Installation complete
echo
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}║            LCD Installation Complete! ✓                   ║${NC}"
echo -e "${GREEN}║                                                           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo

# Show status
echo -e "${BLUE}Service Status:${NC}"
systemctl status map2-lcd.service --no-pager --lines=5 || true

echo
echo -e "${BLUE}Next Steps:${NC}"
echo "  1. Run setup wizard:   sudo python3 -m lcd.setup_tool"
echo "  2. Test display:       python3 -m lcd.test_suite --hardware"
echo "  3. View logs:          journalctl -u map2-lcd -f"
echo "  4. Manage service:     systemctl {start|stop|restart} map2-lcd"
echo

if grep -q "Reboot required" <<< "$CONFIG_FILE" 2>/dev/null; then
    echo -e "${YELLOW}⚠ REBOOT REQUIRED for I2C changes to take effect${NC}"
    echo -e "${YELLOW}  Run: sudo reboot${NC}"
    echo
fi

echo -e "${GREEN}Installation log saved to: /var/log/map2/lcd-install.log${NC}"
echo

# Make script executable
chmod +x "$0"

exit 0

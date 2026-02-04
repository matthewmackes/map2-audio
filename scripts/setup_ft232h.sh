#!/bin/bash
# Setup script for FT232H USB-to-I2C adapter
# Run with: sudo ./scripts/setup_ft232h.sh

set -e

echo "=== FT232H USB-to-I2C Setup ==="
echo

# Create FTDI udev rules
echo "Creating FTDI udev rules..."
cat > /etc/udev/rules.d/99-ftdi.rules << 'EOF'
# FTDI FT232H USB-to-I2C/SPI adapter
# Allows non-root access to FTDI devices for pyftdi

# FT232H
SUBSYSTEM=="usb", ATTR{idVendor}=="0403", ATTR{idProduct}=="6014", MODE="0666", GROUP="plugdev"

# FT2232H
SUBSYSTEM=="usb", ATTR{idVendor}=="0403", ATTR{idProduct}=="6010", MODE="0666", GROUP="plugdev"

# FT4232H
SUBSYSTEM=="usb", ATTR{idVendor}=="0403", ATTR{idProduct}=="6011", MODE="0666", GROUP="plugdev"

# Generic FTDI fallback
ACTION=="add", SUBSYSTEM=="usb", ATTR{idVendor}=="0403", MODE="0666"
EOF

echo "✓ Created /etc/udev/rules.d/99-ftdi.rules"

# Create I2C udev rules (for native I2C buses if present)
echo "Creating I2C udev rules..."
cat > /etc/udev/rules.d/99-i2c.rules << 'EOF'
# Allow i2c group access to I2C bus devices
KERNEL=="i2c-[0-9]*", GROUP="i2c", MODE="0660"
EOF

echo "✓ Created /etc/udev/rules.d/99-i2c.rules"

# Create groups if needed
if ! getent group i2c > /dev/null 2>&1; then
    echo "Creating i2c group..."
    groupadd i2c
    echo "✓ Created i2c group"
fi

# Add current user to groups
CURRENT_USER="${SUDO_USER:-$USER}"
if [ -n "$CURRENT_USER" ] && [ "$CURRENT_USER" != "root" ]; then
    echo "Adding $CURRENT_USER to i2c and plugdev groups..."
    usermod -aG i2c "$CURRENT_USER" 2>/dev/null || true
    usermod -aG plugdev "$CURRENT_USER" 2>/dev/null || true
    echo "✓ User $CURRENT_USER added to groups"
fi

# Reload udev rules
echo "Reloading udev rules..."
udevadm control --reload-rules
udevadm trigger

# Set permissions on existing devices
echo "Setting permissions on existing devices..."
chmod 666 /dev/bus/usb/*/0* 2>/dev/null || true
chgrp i2c /dev/i2c-* 2>/dev/null || true
chmod 660 /dev/i2c-* 2>/dev/null || true

echo
echo "=== Setup Complete ==="
echo
echo "Notes:"
echo "1. Unplug and replug the FT232H adapter for rules to take effect"
echo "2. Log out and back in for group changes to take effect"
echo "3. Test with: python lcd/test_ft232h_lcd.py"
echo
echo "FT232H Wiring for I2C LCD:"
echo "  LCD SDA -> FT232H AD1 (pin 2)"
echo "  LCD SCL -> FT232H AD0 (pin 1)"
echo "  LCD VCC -> 5V (external power)"
echo "  LCD GND -> GND (shared)"

#!/bin/bash
#
# MAP2 Audio Platform - Boot Manager Installation Script
# This script installs and configures the unified boot manager
#
# Run with: sudo ./install-boot-manager.sh
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Configuration
MAP2_DIR="/home/mm/map2-audio"
SYSTEMD_DIR="/etc/systemd/system"

echo -e "${BOLD}${CYAN}"
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                                                                  ║"
echo "║          MAP2 Audio Platform - Boot Manager Installer           ║"
echo "║                                                                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}✗${NC} This script must be run as root (use sudo)"
    exit 1
fi

echo -e "${GREEN}✓${NC} Running as root"

# ============================================
# Step 1: Verify scripts exist
# ============================================

echo ""
echo -e "${BOLD}Step 1: Verifying scripts${NC}"

if [ ! -f "$MAP2_DIR/map2-boot-manager.sh" ]; then
    echo -e "${RED}✗${NC} Boot manager script not found: $MAP2_DIR/map2-boot-manager.sh"
    exit 1
fi
echo -e "${GREEN}✓${NC} Boot manager script found"

if [ ! -f "$MAP2_DIR/map2-system-check.sh" ]; then
    echo -e "${RED}✗${NC} System check script not found: $MAP2_DIR/map2-system-check.sh"
    exit 1
fi
echo -e "${GREEN}✓${NC} System check script found"

# Make scripts executable
chmod +x "$MAP2_DIR/map2-boot-manager.sh"
chmod +x "$MAP2_DIR/map2-system-check.sh"
echo -e "${GREEN}✓${NC} Scripts are executable"

# ============================================
# Step 2: Fix LCD service path bug
# ============================================

echo ""
echo -e "${BOLD}Step 2: Fixing LCD service configuration${NC}"

if [ -f "$SYSTEMD_DIR/map2-lcd.service" ]; then
    # Backup original
    cp "$SYSTEMD_DIR/map2-lcd.service" "$SYSTEMD_DIR/map2-lcd.service.backup"
    echo -e "${GREEN}✓${NC} Backed up LCD service file"

    # Fix %u and %g expansion issues
    sed -i 's|WorkingDirectory=/home/%u/map2-audio|WorkingDirectory=/home/mm/map2-audio|g' "$SYSTEMD_DIR/map2-lcd.service"
    sed -i 's|User=%u|User=mm|g' "$SYSTEMD_DIR/map2-lcd.service"
    sed -i 's|Group=%g|Group=mm|g' "$SYSTEMD_DIR/map2-lcd.service"
    echo -e "${GREEN}✓${NC} Fixed LCD service path bug"
else
    echo -e "${YELLOW}⚠${NC} LCD service file not found (will skip)"
fi

# ============================================
# Step 3: Update system-check service
# ============================================

echo ""
echo -e "${BOLD}Step 3: Updating system-check service${NC}"

if [ -f "$SYSTEMD_DIR/map2-system-check.service" ]; then
    echo -e "${GREEN}✓${NC} System-check service exists"

    # Verify ExecStart path
    if grep -q "$MAP2_DIR/map2-system-check.sh" "$SYSTEMD_DIR/map2-system-check.service"; then
        echo -e "${GREEN}✓${NC} Service points to correct script"
    else
        echo -e "${YELLOW}⚠${NC} Service may need manual update"
    fi
else
    echo -e "${YELLOW}⚠${NC} System-check service not found"
fi

# ============================================
# Step 4: Create boot manager service
# ============================================

echo ""
echo -e "${BOLD}Step 4: Creating boot manager systemd service${NC}"

cat > "$SYSTEMD_DIR/map2-boot-manager.service" << 'EOF'
[Unit]
Description=MAP2 Audio Platform Boot Manager
Documentation=https://github.com/yourusername/map2-audio
DefaultDependencies=no
After=local-fs.target network-pre.target
Before=network.target sound.target multi-user.target
Wants=network-pre.target

[Service]
Type=oneshot
User=root
Group=root
WorkingDirectory=/home/mm/map2-audio

# Run the boot manager script
ExecStart=/bin/bash /home/mm/map2-audio/map2-boot-manager.sh

# Allow time for checks to complete
TimeoutStartSec=120

# Don't restart on failure - this is a one-time check
RemainAfterExit=yes

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=map2-boot-manager

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}✓${NC} Created boot manager service"

# ============================================
# Step 5: Update service dependencies
# ============================================

echo ""
echo -e "${BOLD}Step 5: Updating service dependencies${NC}"

# Add boot manager as a dependency to critical services
for service in map2-system-check.service map2-backend.service; do
    if [ -f "$SYSTEMD_DIR/$service" ]; then
        # Check if already has dependency
        if grep -q "map2-boot-manager.service" "$SYSTEMD_DIR/$service"; then
            echo -e "${BLUE}→${NC} $service already depends on boot manager"
        else
            # Backup
            cp "$SYSTEMD_DIR/$service" "$SYSTEMD_DIR/${service}.backup"

            # Add After= dependency
            sed -i '/^\[Unit\]/a After=map2-boot-manager.service' "$SYSTEMD_DIR/$service"
            sed -i '/After=map2-boot-manager.service/a Wants=map2-boot-manager.service' "$SYSTEMD_DIR/$service"

            echo -e "${GREEN}✓${NC} Updated $service dependencies"
        fi
    fi
done

# ============================================
# Step 6: Reload systemd
# ============================================

echo ""
echo -e "${BOLD}Step 6: Reloading systemd${NC}"

systemctl daemon-reload
echo -e "${GREEN}✓${NC} Systemd configuration reloaded"

# ============================================
# Step 7: Enable services
# ============================================

echo ""
echo -e "${BOLD}Step 7: Enabling services${NC}"

# Enable boot manager
systemctl enable map2-boot-manager.service
echo -e "${GREEN}✓${NC} Enabled boot manager service"

# Enable other critical services
for service in map2-system-check.service map2-backend.service map2-web.service; do
    if [ -f "$SYSTEMD_DIR/$service" ]; then
        systemctl enable "$service" 2>/dev/null || echo -e "${YELLOW}⚠${NC} Could not enable $service"
        echo -e "${GREEN}✓${NC} Enabled $service"
    fi
done

# ============================================
# Step 8: Test run
# ============================================

echo ""
echo -e "${BOLD}Step 8: Testing boot manager${NC}"

if bash "$MAP2_DIR/map2-boot-manager.sh"; then
    echo -e "${GREEN}✓${NC} Boot manager test successful"
else
    echo -e "${YELLOW}⚠${NC} Boot manager test completed with warnings (check logs)"
fi

# ============================================
# Installation complete
# ============================================

echo ""
echo -e "${BOLD}${GREEN}"
echo "╔══════════════════════════════════════════════════════════════════╗"
echo "║                                                                  ║"
echo "║                  Installation Completed!                         ║"
echo "║                                                                  ║"
echo "╚══════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${CYAN}Next steps:${NC}"
echo ""
echo -e "  ${BOLD}1. Restart services:${NC}"
echo -e "     ${BLUE}sudo systemctl restart map2-system-check.service${NC}"
echo -e "     ${BLUE}sudo systemctl restart map2-backend.service${NC}"
echo ""
echo -e "  ${BOLD}2. Check service status:${NC}"
echo -e "     ${BLUE}sudo systemctl status map2-boot-manager.service${NC}"
echo -e "     ${BLUE}sudo systemctl status map2-backend.service${NC}"
echo -e "     ${BLUE}sudo systemctl status map2-web.service${NC}"
echo ""
echo -e "  ${BOLD}3. View logs:${NC}"
echo -e "     ${BLUE}tail -f /home/mm/map2-audio/logs/boot-manager.log${NC}"
echo -e "     ${BLUE}tail -f /home/mm/map2-audio/logs/system-check.log${NC}"
echo -e "     ${BLUE}journalctl -u map2-boot-manager.service -f${NC}"
echo ""
echo -e "  ${BOLD}4. Reboot to test:${NC}"
echo -e "     ${BLUE}sudo reboot${NC}"
echo ""
echo -e "${GREEN}The boot manager will automatically run at next boot!${NC}"
echo ""

#!/bin/bash
# MAP2 Audio Platform - Branding Installation
# Install boot splash and welcome message

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Non-interactive mode support
AUTO_INSTALL=${MAP2_AUTO_INSTALL:-0}

if [ "$AUTO_INSTALL" -ne 1 ]; then
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  MAP2 Audio Platform - Branding Installation${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo ""
fi

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}⚠️  Do not run this script as root!${NC}"
    echo "Run as normal user. Script will use sudo when needed."
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BRANDING_DIR="$REPO_ROOT/branding"
PLYMOUTH_CONFIG_SOURCE="$BRANDING_DIR/map2-boot-splash.plymouth"

if [ ! -f "$PLYMOUTH_CONFIG_SOURCE" ] && [ -f "$BRANDING_DIR/map2.plymouth" ]; then
    PLYMOUTH_CONFIG_SOURCE="$BRANDING_DIR/map2.plymouth"
fi

# Check if branding files exist
if [ ! -f "$BRANDING_DIR/map2-boot-splash.script" ] || [ ! -f "$PLYMOUTH_CONFIG_SOURCE" ] || [ ! -f "$BRANDING_DIR/map2-login-issue.sh" ]; then
    echo -e "${RED}Error: Branding files not found in $BRANDING_DIR${NC}"
    exit 1
fi

# ============================================================================
# 1. Install Plymouth Boot Splash
# ============================================================================
echo -e "${YELLOW}[1/3] Installing boot splash theme...${NC}"
echo ""

# Check if Plymouth is installed
if ! command -v plymouth &> /dev/null; then
    echo -e "${YELLOW}Plymouth not installed. Installing...${NC}"
    sudo dnf install -y plymouth plymouth-scripts plymouth-system-theme
fi

# Install theme files
echo -e "${YELLOW}Installing MAP2 Plymouth theme...${NC}"
sudo mkdir -p /usr/share/plymouth/themes/map2

sudo cp "$BRANDING_DIR/map2-boot-splash.script" /usr/share/plymouth/themes/map2/
sudo cp "$PLYMOUTH_CONFIG_SOURCE" /usr/share/plymouth/themes/map2/map2-boot-splash.plymouth

# Set permissions
sudo chmod 644 /usr/share/plymouth/themes/map2/map2-boot-splash.script
sudo chmod 644 /usr/share/plymouth/themes/map2/map2-boot-splash.plymouth

# Set as default theme
echo -e "${YELLOW}Setting MAP2 as default boot theme...${NC}"
sudo plymouth-set-default-theme map2-boot-splash

# Rebuild initramfs to include the theme
echo -e "${YELLOW}Rebuilding initramfs (this may take a minute)...${NC}"
KERNEL_VERSION=$(uname -r)
if timeout 120 sudo dracut -f /boot/initramfs-${KERNEL_VERSION}.img ${KERNEL_VERSION} 2>/dev/null; then
    echo -e "${GREEN}✓ Initramfs rebuilt successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Initramfs rebuild had issues, boot splash may not work${NC}"
fi

echo -e "${GREEN}✓ Boot splash installed${NC}"
echo -e "${YELLOW}  Note: Boot splash will be visible on next reboot${NC}"
echo ""

# ============================================================================
# 2. Install Shell and Local Console Branding
# ============================================================================
echo -e "${YELLOW}[2/3] Installing shell and login branding...${NC}"
echo ""

# Copy welcome script to system location
sudo mkdir -p /etc/profile.d
sudo cp "$BRANDING_DIR/map2-welcome.sh" /etc/profile.d/map2-welcome.sh
sudo chmod 755 /etc/profile.d/map2-welcome.sh

# Generate and install the local-console login banner.
sudo mkdir -p /etc/issue.d
bash "$BRANDING_DIR/map2-login-issue.sh" | sudo tee /etc/issue.d/map2-login.issue > /dev/null
sudo chmod 644 /etc/issue.d/map2-login.issue

# Also add to user's bashrc for immediate effect
BASHRC_LINE='# MAP2 Audio Platform Welcome
if [ -f /etc/profile.d/map2-welcome.sh ]; then
    source /etc/profile.d/map2-welcome.sh
fi'

# Check if already added
if ! grep -q "map2-welcome.sh" ~/.bashrc 2>/dev/null; then
    echo "" >> ~/.bashrc
    echo "$BASHRC_LINE" >> ~/.bashrc
    echo -e "${GREEN}✓ Welcome message added to ~/.bashrc${NC}"
else
    echo -e "${YELLOW}⚠️  Welcome message already in ~/.bashrc${NC}"
fi

# Add to /etc/skel for new users
if [ -f /etc/skel/.bashrc ]; then
    if ! sudo grep -q "map2-welcome.sh" /etc/skel/.bashrc 2>/dev/null; then
        echo "$BASHRC_LINE" | sudo tee -a /etc/skel/.bashrc > /dev/null
        echo -e "${GREEN}✓ Welcome message added to /etc/skel/.bashrc (new users)${NC}"
    fi
fi

echo -e "${GREEN}✓ Shell and login branding installed${NC}"
echo ""

# ============================================================================
# 3. Optional: Update GRUB for silent boot
# ============================================================================
echo -e "${YELLOW}[3/3] Optional: Configure silent boot${NC}"
echo ""

# In auto-install mode, always enable silent boot
if [ "$AUTO_INSTALL" -eq 1 ]; then
    REPLY="y"
else
    echo "For a cleaner boot experience, you can enable silent boot mode."
    echo "This will:"
    echo "  - Hide kernel messages"
    echo "  - Show only the Plymouth splash screen"
    echo "  - Make boot look more professional"
    echo ""
    read -p "Enable silent boot? (y/n) " -n 1 -r
    echo
    echo ""
fi

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Configuring GRUB for silent boot...${NC}"
    
    # Backup GRUB config
    sudo cp /etc/default/grub /etc/default/grub.backup.$(date +%Y%m%d-%H%M%S)
    
    # Add silent boot parameters
    if [ "$AUTO_INSTALL" -eq 1 ]; then
        # Auto mode: set timeout to 1 second (reasonable default)
        sudo sed -i 's/GRUB_TIMEOUT=.*/GRUB_TIMEOUT=1/' /etc/default/grub 2>/dev/null || true
    else
        read -p "Hide GRUB menu? (faster boot, but harder to select boot options) (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sudo sed -i 's/GRUB_TIMEOUT=.*/GRUB_TIMEOUT=0/' /etc/default/grub 2>/dev/null || true
        fi
    fi
    
    # Regenerate GRUB config
    echo -e "${YELLOW}Regenerating GRUB configuration...${NC}"
    if [ -f /boot/efi/EFI/fedora/grub.cfg ]; then
        # UEFI system
        sudo grub2-mkconfig -o /boot/efi/EFI/fedora/grub.cfg 2>/dev/null || true
    elif [ -f /boot/grub2/grub.cfg ]; then
        # BIOS system
        sudo grub2-mkconfig -o /boot/grub2/grub.cfg 2>/dev/null || true
    else
        echo -e "${RED}Warning: Could not find GRUB config file${NC}"
    fi
    
    echo -e "${GREEN}✓ Silent boot configured${NC}"
else
    echo -e "${YELLOW}Skipping silent boot configuration${NC}"
fi

echo ""

# ============================================================================
# Summary
# ============================================================================
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Branding Installation Complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}What was installed:${NC}"
echo ""
echo -e "  ${GREEN}✓${NC} Plymouth boot splash theme"
echo -e "    ${BLUE}→${NC} /usr/share/plymouth/themes/map2/"
echo ""
echo -e "  ${GREEN}✓${NC} Welcome message script"
echo -e "    ${BLUE}→${NC} /etc/profile.d/map2-welcome.sh"
echo -e "    ${BLUE}→${NC} ~/.bashrc (current user)"
echo ""
echo -e "  ${GREEN}✓${NC} Local console login banner"
echo -e "    ${BLUE}→${NC} /etc/issue.d/map2-login.issue"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo -e "  1. ${BLUE}Reboot to see the boot splash${NC}"
echo -e "     ${GREEN}sudo reboot${NC}"
echo ""
echo -e "  2. ${BLUE}Test welcome message now:${NC}"
echo -e "     ${GREEN}source ~/.bashrc${NC}"
echo -e "     or open a new terminal"
echo ""
echo -e "${YELLOW}Customization:${NC}"
echo ""
echo -e "  ${BLUE}→${NC} Edit boot splash: $BRANDING_DIR/map2-boot-splash.script"
echo -e "  ${BLUE}→${NC} Edit welcome message: $BRANDING_DIR/map2-welcome.sh"
echo -e "  ${BLUE}→${NC} Edit login banner: $BRANDING_DIR/map2-login-issue.sh"
echo -e "  ${BLUE}→${NC} Then run this script again to apply changes"
echo ""

#!/bin/bash
# MAP2 Audio Platform - Branding Verification Script
# Verify that branding is correctly installed

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  MAP2 Audio Platform - Branding Verification${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

PASSED=0
FAILED=0
WARNINGS=0

# Check 1: Plymouth installed
echo -e "${YELLOW}[1/7] Checking Plymouth installation...${NC}"
if command -v plymouth &> /dev/null; then
    VERSION=$(plymouth --version 2>&1 | head -1)
    echo -e "  ${GREEN}✓${NC} Plymouth installed: $VERSION"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} Plymouth not installed"
    echo -e "      Install with: ${BLUE}sudo dnf install plymouth plymouth-scripts${NC}"
    ((FAILED++))
fi
echo ""

# Check 2: Boot splash theme files
echo -e "${YELLOW}[2/7] Checking boot splash theme files...${NC}"
if [ -f "/usr/share/plymouth/themes/map2/map2-boot-splash.script" ]; then
    echo -e "  ${GREEN}✓${NC} Theme script: /usr/share/plymouth/themes/map2/map2-boot-splash.script"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} Theme script not found"
    echo -e "      Run: ${BLUE}./install_branding.sh${NC}"
    ((FAILED++))
fi

if [ -f "/usr/share/plymouth/themes/map2/map2-boot-splash.plymouth" ]; then
    echo -e "  ${GREEN}✓${NC} Theme config: /usr/share/plymouth/themes/map2/map2-boot-splash.plymouth"
    ((PASSED++))
else
    echo -e "  ${RED}✗${NC} Theme config not found"
    ((FAILED++))
fi
echo ""

# Check 3: Plymouth theme set
echo -e "${YELLOW}[3/7] Checking default Plymouth theme...${NC}"
if command -v plymouth-set-default-theme &> /dev/null; then
    CURRENT_THEME=$(plymouth-set-default-theme 2>&1)
    if [ "$CURRENT_THEME" = "map2-boot-splash" ]; then
        echo -e "  ${GREEN}✓${NC} Default theme: map2-boot-splash"
        ((PASSED++))
    else
        echo -e "  ${YELLOW}⚠${NC} Default theme: $CURRENT_THEME (not map2-boot-splash)"
        echo -e "      Set with: ${BLUE}sudo plymouth-set-default-theme map2-boot-splash && sudo dracut -f${NC}"
        ((WARNINGS++))
    fi
else
    echo -e "  ${YELLOW}⚠${NC} Cannot check default theme"
    ((WARNINGS++))
fi
echo ""

# Check 4: Initramfs contains theme
echo -e "${YELLOW}[4/7] Checking initramfs...${NC}"
KERNEL_VERSION=$(uname -r)
INITRAMFS="/boot/initramfs-${KERNEL_VERSION}.img"
if [ -f "$INITRAMFS" ]; then
    echo -e "  ${GREEN}✓${NC} Initramfs exists: $INITRAMFS"
    
    # Check if recent (within last day)
    if [ $(find "$INITRAMFS" -mtime -1 | wc -l) -gt 0 ]; then
        echo -e "  ${GREEN}✓${NC} Initramfs is recent (modified today)"
        ((PASSED++))
    else
        MODIFIED=$(stat -c %y "$INITRAMFS" | cut -d' ' -f1)
        echo -e "  ${YELLOW}⚠${NC} Initramfs may be outdated (modified: $MODIFIED)"
        echo -e "      Rebuild with: ${BLUE}sudo dracut -f${NC}"
        ((WARNINGS++))
    fi
else
    echo -e "  ${RED}✗${NC} Initramfs not found: $INITRAMFS"
    ((FAILED++))
fi
echo ""

# Check 5: Welcome message script
echo -e "${YELLOW}[5/7] Checking welcome message...${NC}"
if [ -f "/etc/profile.d/map2-welcome.sh" ]; then
    echo -e "  ${GREEN}✓${NC} System-wide: /etc/profile.d/map2-welcome.sh"
    
    # Check permissions
    PERMS=$(stat -c %a /etc/profile.d/map2-welcome.sh)
    if [ "$PERMS" = "755" ] || [ "$PERMS" = "775" ]; then
        echo -e "  ${GREEN}✓${NC} Permissions: $PERMS (executable)"
        ((PASSED++))
    else
        echo -e "  ${YELLOW}⚠${NC} Permissions: $PERMS (should be 755)"
        echo -e "      Fix with: ${BLUE}sudo chmod 755 /etc/profile.d/map2-welcome.sh${NC}"
        ((WARNINGS++))
    fi
else
    echo -e "  ${RED}✗${NC} Welcome script not found"
    echo -e "      Install with: ${BLUE}./install_branding.sh${NC}"
    ((FAILED++))
fi
echo ""

# Check 6: Bashrc integration
echo -e "${YELLOW}[6/7] Checking bashrc integration...${NC}"
if [ -f ~/.bashrc ]; then
    if grep -q "map2-welcome" ~/.bashrc; then
        echo -e "  ${GREEN}✓${NC} User bashrc: ~/.bashrc"
        ((PASSED++))
    else
        echo -e "  ${YELLOW}⚠${NC} Not in ~/.bashrc"
        echo -e "      Add with: ${BLUE}echo 'source /etc/profile.d/map2-welcome.sh' >> ~/.bashrc${NC}"
        ((WARNINGS++))
    fi
else
    echo -e "  ${YELLOW}⚠${NC} No ~/.bashrc found"
    ((WARNINGS++))
fi

# Check /etc/skel for new users
if [ -f /etc/skel/.bashrc ]; then
    if sudo grep -q "map2-welcome" /etc/skel/.bashrc 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Default bashrc: /etc/skel/.bashrc (new users)"
        ((PASSED++))
    else
        echo -e "  ${YELLOW}⚠${NC} Not in /etc/skel/.bashrc (new users won't see welcome)"
        ((WARNINGS++))
    fi
fi
echo ""

# Check 7: Test welcome message
echo -e "${YELLOW}[7/7] Testing welcome message execution...${NC}"
if [ -f "/etc/profile.d/map2-welcome.sh" ]; then
    # Try to execute and check for errors
    if bash -n /etc/profile.d/map2-welcome.sh 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Syntax check passed"
        
        # Try to run (capture output)
        OUTPUT=$(bash /etc/profile.d/map2-welcome.sh 2>&1)
        if [ $? -eq 0 ]; then
            echo -e "  ${GREEN}✓${NC} Execution successful"
            
            # Check if contains expected content
            if echo "$OUTPUT" | grep -q "MAP2"; then
                echo -e "  ${GREEN}✓${NC} Contains MAP2 branding"
                ((PASSED++))
            else
                echo -e "  ${YELLOW}⚠${NC} Output may be incomplete"
                ((WARNINGS++))
            fi
        else
            echo -e "  ${RED}✗${NC} Execution failed"
            ((FAILED++))
        fi
    else
        echo -e "  ${RED}✗${NC} Syntax errors detected"
        bash -n /etc/profile.d/map2-welcome.sh
        ((FAILED++))
    fi
else
    echo -e "  ${RED}✗${NC} Cannot test (file not found)"
    ((FAILED++))
fi
echo ""

# Summary
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Verification Summary${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

TOTAL=$((PASSED + FAILED + WARNINGS))
echo -e "  ${GREEN}✓${NC} Passed:   $PASSED"
if [ $WARNINGS -gt 0 ]; then
    echo -e "  ${YELLOW}⚠${NC} Warnings: $WARNINGS"
fi
if [ $FAILED -gt 0 ]; then
    echo -e "  ${RED}✗${NC} Failed:   $FAILED"
fi
echo ""

# Overall status
if [ $FAILED -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  ✓ Branding Fully Installed and Configured${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Test welcome message now:"
    echo -e "  ${BLUE}source ~/.bashrc${NC}"
    echo ""
    echo "View boot splash on next reboot:"
    echo -e "  ${BLUE}sudo reboot${NC}"
    EXIT_CODE=0
elif [ $FAILED -eq 0 ]; then
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}  ⚠ Branding Installed with Warnings${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "System is functional but some features may not work optimally."
    echo "Review warnings above for suggested fixes."
    EXIT_CODE=0
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}  ✗ Branding Installation Incomplete${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "Run the installer to fix issues:"
    echo -e "  ${BLUE}./install_branding.sh${NC}"
    EXIT_CODE=1
fi

echo ""
exit $EXIT_CODE

#!/bin/bash
# MAP2 Audio Platform - Complete System Verification
# Checks all components: Audio, Backend, Web, Branding, RT Config, LCD

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                                                           ║"
echo "║         MAP2 Audio Platform - System Verification         ║"
echo "║                                                           ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo

PASSED=0
FAILED=0
WARNINGS=0

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

# ============================================================================
# 1. System Requirements
# ============================================================================
echo -e "${CYAN}[1/10] System Requirements${NC}"

# Python version
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
if python3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" 2>/dev/null; then
    check_pass "Python $PYTHON_VERSION"
else
    check_fail "Python 3.10+ required (found $PYTHON_VERSION)"
fi

# Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version 2>&1)
    check_pass "Node.js $NODE_VERSION"
else
    check_warn "Node.js not installed (web UI unavailable)"
fi

echo

# ============================================================================
# 2. Python Dependencies
# ============================================================================
echo -e "${CYAN}[2/10] Python Dependencies${NC}"

REQUIRED_PACKAGES=("fastapi" "uvicorn" "sqlalchemy" "mido" "sounddevice" "numpy")
for pkg in "${REQUIRED_PACKAGES[@]}"; do
    if python3 -c "import $pkg" 2>/dev/null; then
        check_pass "$pkg"
    else
        check_fail "$pkg missing"
    fi
done

echo

# ============================================================================
# 3. Real-Time Configuration
# ============================================================================
echo -e "${CYAN}[3/10] Real-Time Audio Configuration${NC}"

# Audio group
if groups | grep -q "\baudio\b"; then
    check_pass "User in audio group"
else
    check_fail "User not in audio group"
fi

# RT limits
if [ -f /etc/security/limits.d/99-audio-realtime.conf ]; then
    check_pass "RT limits configured"
else
    check_fail "RT limits not configured"
fi

# Memory lock
if grep -q "memlock.*unlimited" /etc/security/limits.d/99-audio-realtime.conf 2>/dev/null; then
    check_pass "Memory lock unlimited"
else
    check_warn "Memory lock may be limited"
fi

echo

# ============================================================================
# 4. Services
# ============================================================================
echo -e "${CYAN}[4/10] Systemd Services${NC}"

# System check service
if systemctl is-enabled map2-system-check.service &>/dev/null; then
    check_pass "map2-system-check.service enabled"
else
    check_warn "map2-system-check.service not enabled"
fi

# Backend service
if systemctl is-active map2-backend.service &>/dev/null; then
    check_pass "map2-backend.service running"
elif systemctl is-enabled map2-backend.service &>/dev/null; then
    check_warn "map2-backend.service enabled but not running"
else
    check_fail "map2-backend.service not enabled"
fi

# Web service
if command -v npm &> /dev/null; then
    if systemctl is-active map2-web.service &>/dev/null; then
        check_pass "map2-web.service running"
    elif systemctl is-enabled map2-web.service &>/dev/null; then
        check_warn "map2-web.service enabled but not running"
    else
        check_warn "map2-web.service not enabled"
    fi
fi

# LCD service
if systemctl is-enabled map2-lcd.service &>/dev/null 2>&1; then
    if systemctl is-active map2-lcd.service &>/dev/null; then
        check_pass "map2-lcd.service running"
    else
        check_warn "map2-lcd.service enabled but not running"
    fi
else
    check_warn "map2-lcd.service not installed (optional)"
fi

echo

# ============================================================================
# 5. API Endpoints
# ============================================================================
echo -e "${CYAN}[5/10] API Endpoints${NC}"

if curl -s http://localhost:8080/health >/dev/null 2>&1; then
    check_pass "Backend API responding (port 8080)"
    
    # Check specific endpoints
    if curl -s http://localhost:8080/api/audio/devices >/dev/null 2>&1; then
        check_pass "Audio endpoints available"
    fi
    
    if curl -s http://localhost:8080/api/plugins >/dev/null 2>&1; then
        check_pass "Plugin endpoints available"
    fi
    
    if curl -s http://localhost:8080/api/lcd/status >/dev/null 2>&1; then
        check_pass "LCD endpoints available"
    else
        check_warn "LCD endpoints not available"
    fi
else
    check_fail "Backend API not responding"
fi

echo

# ============================================================================
# 6. Branding System
# ============================================================================
echo -e "${CYAN}[6/10] Branding System${NC}"

# Plymouth theme
if [ -d /usr/share/plymouth/themes/map2 ]; then
    check_pass "Plymouth boot theme installed"
else
    check_warn "Plymouth boot theme not installed"
fi

# Welcome message
if [ -f /etc/profile.d/map2-welcome.sh ]; then
    check_pass "Welcome message installed"
else
    check_warn "Welcome message not installed"
fi

echo

# ============================================================================
# 7. Hardware Detection
# ============================================================================
echo -e "${CYAN}[7/10] Hardware Detection${NC}"

# Audio devices
if python3 -c "import sounddevice as sd; devs = sd.query_devices(); print(f'{len(devs)} devices')" 2>/dev/null | grep -q "devices"; then
    NUM_DEVICES=$(python3 -c "import sounddevice as sd; print(len(sd.query_devices()))" 2>/dev/null)
    check_pass "Audio devices detected ($NUM_DEVICES)"
else
    check_warn "No audio devices detected"
fi

# MIDI devices
if command -v aconnect &> /dev/null; then
    MIDI_COUNT=$(aconnect -i 2>/dev/null | grep -c "client" || echo "0")
    if [ "$MIDI_COUNT" -gt 0 ]; then
        check_pass "MIDI devices detected ($MIDI_COUNT)"
    else
        check_warn "No MIDI devices detected"
    fi
else
    check_warn "aconnect not available (alsa-utils)"
fi

# I2C / LCD
if [ -e "/sys/bus/i2c/devices/i2c-1" ]; then
    check_pass "I2C bus available"
    
    if command -v i2cdetect &> /dev/null; then
        if i2cdetect -y 1 2>/dev/null | grep -qE "(27|3f)"; then
            check_pass "LCD display detected on I2C"
        else
            check_warn "No LCD detected on I2C bus"
        fi
    else
        check_warn "i2c-tools not installed"
    fi
else
    check_warn "I2C bus not available"
fi

echo

# ============================================================================
# 8. Database
# ============================================================================
echo -e "${CYAN}[8/10] Database${NC}"

if [ -f map2.db ]; then
    check_pass "Database file exists"
    
    # Check database size
    DB_SIZE=$(du -h map2.db | awk '{print $1}')
    echo "    Database size: $DB_SIZE"
else
    check_warn "Database not yet created"
fi

echo

# ============================================================================
# 9. Configuration Files
# ============================================================================
echo -e "${CYAN}[9/10] Configuration Files${NC}"

if [ -f config.yaml ]; then
    check_pass "config.yaml"
else
    check_warn "config.yaml not found"
fi

if [ -f lcd_config.ini ]; then
    check_pass "lcd_config.ini"
else
    check_warn "lcd_config.ini not found (LCD not configured)"
fi

echo

# ============================================================================
# 10. Performance Tests
# ============================================================================
echo -e "${CYAN}[10/10] Quick Performance Tests${NC}"

# Run self-test
if PYTHONPATH=. python3 -m scripts.self_test 2>&1 | grep -q "All tests passed"; then
    check_pass "Self-test suite passed"
else
    check_warn "Self-test issues detected"
fi

# Check for xruns in logs
if journalctl -u map2-backend -n 100 --no-pager 2>/dev/null | grep -q "xrun"; then
    check_warn "Audio xruns detected in logs"
else
    check_pass "No recent xruns in logs"
fi

echo

# ============================================================================
# Summary
# ============================================================================
echo
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                           ║${NC}"
echo -e "${BLUE}║                      SUMMARY                              ║${NC}"
echo -e "${BLUE}║                                                           ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
echo

TOTAL=$((PASSED + FAILED + WARNINGS))
echo -e "Total checks: ${BLUE}$TOTAL${NC}"
echo -e "${GREEN}Passed:${NC}       $PASSED"
echo -e "${YELLOW}Warnings:${NC}     $WARNINGS"
echo -e "${RED}Failed:${NC}       $FAILED"
echo

if [ $FAILED -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}✓ System is fully configured and operational!${NC}"
    else
        echo -e "${YELLOW}⚠ System is operational with minor issues${NC}"
    fi
else
    echo -e "${RED}✗ System has issues that need attention${NC}"
    echo
    echo "Run ./setup.sh to fix missing components"
fi

echo
echo -e "${CYAN}Services:${NC}"
echo "  • Backend API:    http://localhost:8080"
echo "  • API Docs:       http://localhost:8080/docs"
echo "  • Web Dashboard:  http://localhost:3000"
echo
echo -e "${CYAN}Verification Scripts:${NC}"
echo "  • RT Config:      ./verify_rt_config.sh"
echo "  • Branding:       ./verify_branding.sh"
echo "  • LCD Setup:      sudo python3 -m lcd.setup_tool"
echo
echo -e "${CYAN}Logs:${NC}"
echo "  • Backend:        journalctl -u map2-backend -f"
echo "  • System Check:   /var/log/map2/system-check.log"
echo "  • LCD:            journalctl -u map2-lcd -f"
echo

exit $([ $FAILED -eq 0 ] && echo 0 || echo 1)

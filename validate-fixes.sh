#!/bin/bash
#
# MAP2 Audio Platform - Post-Fix Validation Script
# Validates all critical fixes applied on 2026-02-08
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "======================================================================"
echo "MAP2 Audio Platform - Validation Suite"
echo "======================================================================"
echo ""

# Test counter
PASS=0
FAIL=0
WARN=0

test_pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    ((PASS++))
}

test_fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    ((FAIL++))
}

test_warn() {
    echo -e "${YELLOW}⚠ WARN${NC}: $1"
    ((WARN++))
}

# 1. PipeWire Quantum
echo "1. Checking PipeWire quantum..."
QUANTUM=$(pw-metadata -n settings 2>/dev/null | grep 'clock.quantum' | grep -oP "value:'\K[0-9]+")
if [ "$QUANTUM" == "256" ]; then
    test_pass "PipeWire quantum is 256 (5.3ms @ 48kHz)"
else
    test_fail "PipeWire quantum is $QUANTUM (expected 256)"
fi

# 2. PipeWire Rate
echo "2. Checking PipeWire sample rate..."
RATE=$(pw-metadata -n settings 2>/dev/null | grep 'clock.rate' | grep -oP "value:'\K[0-9]+")
if [ "$RATE" == "48000" ]; then
    test_pass "PipeWire rate is 48000 Hz"
else
    test_fail "PipeWire rate is $RATE (expected 48000)"
fi

# 3. libjack Provider
echo "3. Checking libjack provider..."
JACK_LIB=$(ldconfig -p | grep 'libjack.so.0' | grep -oP '/usr/lib64/\S+')
if echo "$JACK_LIB" | grep -q "pipewire"; then
    test_pass "libjack is PipeWire JACK ($JACK_LIB)"
else
    test_fail "libjack is not PipeWire JACK ($JACK_LIB)"
fi

# 4. RTKit Daemon
echo "4. Checking RTKit daemon..."
if systemctl is-active rtkit-daemon &>/dev/null; then
    test_pass "RTKit daemon is running"
else
    test_fail "RTKit daemon is not running"
fi

# 5. Backend Environment
echo "5. Checking MAP2 backend environment..."
BACKEND_PID=$(pgrep -f 'uvicorn app.main' | head -1)
if [ -n "$BACKEND_PID" ]; then
    if sudo cat /proc/$BACKEND_PID/environ 2>/dev/null | tr '\0' '\n' | grep -q "XDG_RUNTIME_DIR"; then
        test_pass "Backend has XDG_RUNTIME_DIR set"
    else
        test_fail "Backend missing XDG_RUNTIME_DIR"
    fi
    
    if sudo cat /proc/$BACKEND_PID/environ 2>/dev/null | tr '\0' '\n' | grep -q "PIPEWIRE_REMOTE"; then
        test_pass "Backend has PIPEWIRE_REMOTE set"
    else
        test_fail "Backend missing PIPEWIRE_REMOTE"
    fi
else
    test_warn "MAP2 backend not running (cannot check environment)"
fi

# 6. CPU Affinity
echo "6. Checking CPU affinity..."
if systemctl show map2-backend -p CPUAffinity 2>/dev/null | grep -q "4 5"; then
    test_pass "Backend CPUAffinity set to isolated cores 4,5"
else
    test_warn "Backend CPUAffinity not set to 4,5"
fi

if systemctl --user show pipewire.service -p CPUAffinity 2>/dev/null | grep -q "4 5"; then
    test_pass "PipeWire CPUAffinity set to isolated cores 4,5"
else
    test_warn "PipeWire CPUAffinity not set to 4,5"
fi

# 7. JUCE Module Build
echo "7. Checking JUCE engine module..."
MODULE_PATH="/home/mm/map2-audio/juce-engine/build/map2_audio_engine.cpython-314-x86_64-linux-gnu.so"
if [ -f "$MODULE_PATH" ]; then
    MODULE_SIZE=$(stat -f %z "$MODULE_PATH" 2>/dev/null || stat -c %s "$MODULE_PATH" 2>/dev/null)
    test_pass "JUCE module exists (${MODULE_SIZE} bytes)"
    
    # Check linking
    if ldd "$MODULE_PATH" 2>/dev/null | grep -q "libjack"; then
        test_pass "JUCE module links against libjack"
    else
        test_warn "JUCE module may not link against libjack"
    fi
else
    test_fail "JUCE module not found at $MODULE_PATH"
fi

# 8. Transparent Huge Pages
echo "8. Checking Transparent Huge Pages..."
THP=$(cat /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null)
if echo "$THP" | grep -q "\[never\]"; then
    test_pass "Transparent Huge Pages disabled"
elif echo "$THP" | grep -q "\[madvise\]"; then
    test_warn "Transparent Huge Pages set to madvise (acceptable)"
else
    test_fail "Transparent Huge Pages enabled (should be never)"
fi

# 9. RT Limits
echo "9. Checking realtime limits..."
RT_LIMIT=$(systemctl show map2-backend -p LimitRTPRIO 2>/dev/null | grep -oP '=\K[0-9]+')
if [ "$RT_LIMIT" == "95" ]; then
    test_pass "Backend RT priority limit is 95"
else
    test_warn "Backend RT priority limit is $RT_LIMIT (expected 95)"
fi

MEMLOCK_LIMIT=$(systemctl show map2-backend -p LimitMEMLOCK 2>/dev/null)
if echo "$MEMLOCK_LIMIT" | grep -q "infinity"; then
    test_pass "Backend memlock limit is unlimited"
else
    test_warn "Backend memlock limit is not unlimited"
fi

# 10. PipeWire Services
echo "10. Checking PipeWire services..."
if systemctl --user is-active pipewire.service &>/dev/null; then
    test_pass "PipeWire service is active"
else
    test_fail "PipeWire service is not active"
fi

if systemctl --user is-active wireplumber.service &>/dev/null; then
    test_pass "WirePlumber service is active"
else
    test_fail "WirePlumber service is not active"
fi

# Summary
echo ""
echo "======================================================================"
echo "Validation Summary"
echo "======================================================================"
echo -e "${GREEN}PASS: $PASS${NC}"
echo -e "${YELLOW}WARN: $WARN${NC}"
echo -e "${RED}FAIL: $FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✓ All critical tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ $FAIL critical test(s) failed${NC}"
    exit 1
fi

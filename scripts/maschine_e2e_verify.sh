#!/usr/bin/env bash
# End-to-end verification for the Maschine MK1 integration.
#
# Checks: device presence, kernel driver state, userspace USB access,
# daemon systemd unit, backend connectivity, and basic LED/LCD probe.
#
# Usage:
#   ./scripts/maschine_e2e_verify.sh          # check-only (no hardware writes)
#   ./scripts/maschine_e2e_verify.sh --blink   # also blink pad 1 for 2 seconds

set -euo pipefail

BLINK=false
[[ "${1:-}" == "--blink" ]] && BLINK=true

PASS=0
FAIL=0
WARN=0

pass() { ((PASS++)); printf "  ✓ %s\n" "$1"; }
fail() { ((FAIL++)); printf "  ✗ %s\n" "$1"; }
warn() { ((WARN++)); printf "  ! %s\n" "$1"; }

echo "=== Maschine MK1 E2E Verification ==="
echo ""

# 1. Device presence
echo "[1/7] USB device presence"
if lsusb -d 17cc:0808 >/dev/null 2>&1; then
    pass "Device 17cc:0808 found on USB bus"
else
    fail "Device 17cc:0808 NOT found — is the MK1 plugged in?"
fi

# 2. Kernel driver
echo "[2/7] Kernel driver state"
if lsmod 2>/dev/null | grep -q snd_usb_caiaq; then
    warn "snd_usb_caiaq is loaded — daemon will auto-detach, but blacklisting is recommended"
else
    pass "snd_usb_caiaq is NOT loaded (blacklisted or rmmod'd)"
fi

if [[ -f /etc/modprobe.d/blacklist-maschine-caiaq.conf ]]; then
    pass "Blacklist file exists at /etc/modprobe.d/blacklist-maschine-caiaq.conf"
else
    warn "No blacklist file for snd_usb_caiaq — consider creating /etc/modprobe.d/blacklist-maschine-caiaq.conf"
fi

# 3. Userspace USB access
echo "[3/7] Userspace USB access (pyusb)"
if python3 -c "
import usb.core
dev = usb.core.find(idVendor=0x17cc, idProduct=0x0808)
assert dev is not None, 'device not found'
print(f'  Bus {dev.bus} Device {dev.address}')
" 2>/dev/null; then
    pass "pyusb can enumerate the device"
else
    fail "pyusb cannot find or access 17cc:0808 — check udev rules and group membership"
fi

# 4. Udev rules
echo "[4/7] Udev rules"
if [[ -f /etc/udev/rules.d/90-map2-maschine-mk1.rules ]]; then
    pass "Udev rule file exists"
else
    warn "No udev rule at /etc/udev/rules.d/90-map2-maschine-mk1.rules"
fi

# 5. Systemd unit
echo "[5/7] Systemd daemon unit"
if systemctl is-active --quiet map2-maschine 2>/dev/null; then
    pass "map2-maschine.service is active"
elif systemctl list-unit-files map2-maschine.service >/dev/null 2>&1; then
    warn "map2-maschine.service exists but is not active"
else
    warn "map2-maschine.service not installed — install with: sudo cp systemd/map2-maschine.service /etc/systemd/system/ && sudo systemctl daemon-reload"
fi

# 6. Backend connectivity
echo "[6/7] Backend connectivity"
BACKEND_URL="${MAP2_BACKEND_URL:-http://localhost:8080}"
if curl -sf "${BACKEND_URL}/api/health" >/dev/null 2>&1; then
    pass "Backend at ${BACKEND_URL} is responding"
    # Check Maschine registration
    if curl -sf "${BACKEND_URL}/api/maschine/status" >/dev/null 2>&1; then
        pass "Maschine status endpoint is reachable"
    else
        warn "Maschine status endpoint not responding"
    fi
else
    fail "Backend at ${BACKEND_URL} is NOT responding"
fi

# 7. Hardware blink test (optional)
echo "[7/7] Hardware blink test"
if $BLINK; then
    echo "  Running LED blink test (pad 1 for 2 seconds)..."
    python3 -c "
import time, sys
sys.path.insert(0, '$(dirname "$0")/..')
from app.services.maschine.mk1_protocol import LED_DATA_SIZE, LED_PAD_INDEX, LED_BACKLIGHT_DEFAULT, Led
from app.services.maschine.mk1_usb_transport import MaschineMK1UsbTransport
t = MaschineMK1UsbTransport(allow_kernel_detach=True)
t.open()
t.initialize_device()
led = [0] * LED_DATA_SIZE
led[LED_PAD_INDEX[0]] = 255
led[int(Led.DisplayBacklight)] = LED_BACKLIGHT_DEFAULT
t.write_leds(led)
time.sleep(2.0)
t.write_leds([0] * LED_DATA_SIZE)
t.close()
print('  Blink complete')
" 2>&1 && pass "Hardware blink test passed" || fail "Hardware blink test failed"
else
    echo "  Skipped (run with --blink to test)"
fi

# Summary
echo ""
echo "=== Summary ==="
echo "  Passed: ${PASS}"
echo "  Warnings: ${WARN}"
echo "  Failed: ${FAIL}"
echo ""

if [[ $FAIL -gt 0 ]]; then
    echo "RESULT: FAIL — ${FAIL} check(s) failed"
    exit 1
else
    echo "RESULT: OK (${WARN} warning(s))"
    exit 0
fi

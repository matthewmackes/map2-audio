#!/usr/bin/env bash
# End-to-end verification for the Maschine MK1 integration.
#
# Checks: device presence, kernel driver state, userspace USB access,
# backend/admin endpoints, profile catalog render path, observer-only audit,
# daemon systemd posture, and optional hardware probes.
#
# Usage:
#   ./scripts/maschine_e2e_verify.sh
#   ./scripts/maschine_e2e_verify.sh --catalog
#   ./scripts/maschine_e2e_verify.sh --hardware-catalog --dwell-ms 250
#   ./scripts/maschine_e2e_verify.sh --blink

set -euo pipefail

BLINK=false
CATALOG=false
HARDWARE_CATALOG=false
DWELL_MS=250
SERVICE_ACTIVE=false
DIRECT_HW_READY=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --blink)
            BLINK=true
            ;;
        --catalog)
            CATALOG=true
            ;;
        --hardware-catalog)
            CATALOG=true
            HARDWARE_CATALOG=true
            ;;
        --dwell-ms)
            shift
            DWELL_MS="${1:-250}"
            ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 2
            ;;
    esac
    shift
done

PASS=0
FAIL=0
WARN=0

pass() { PASS=$((PASS + 1)); printf "  ✓ %s\n" "$1"; }
fail() { FAIL=$((FAIL + 1)); printf "  ✗ %s\n" "$1"; }
warn() { WARN=$((WARN + 1)); printf "  ! %s\n" "$1"; }

prepare_direct_hardware() {
    if [[ "$DIRECT_HW_READY" == "true" ]]; then
        return 0
    fi
    if [[ "$SERVICE_ACTIVE" != "true" ]]; then
        DIRECT_HW_READY=true
        return 0
    fi
    if ! sudo -n true >/dev/null 2>&1; then
        warn "Cannot stop map2-maschine.service for direct USB verification without passwordless sudo"
        return 1
    fi
    echo "  Stopping map2-maschine.service for direct USB verification..."
    sudo -n systemctl stop map2-maschine.service
    sleep 2
    DIRECT_HW_READY=true
    return 0
}

restore_direct_hardware() {
    if [[ "$DIRECT_HW_READY" != "true" || "$SERVICE_ACTIVE" != "true" ]]; then
        return 0
    fi
    echo "  Restoring map2-maschine.service..."
    sudo -n systemctl start map2-maschine.service
    if systemctl is-active --quiet map2-maschine.service 2>/dev/null; then
        pass "map2-maschine.service restored after direct USB verification"
    else
        fail "map2-maschine.service did not restore after direct USB verification"
    fi
    DIRECT_HW_READY=false
}

trap restore_direct_hardware EXIT

echo "=== Maschine MK1 E2E Verification ==="
echo ""

# 1. Device presence
echo "[1/10] USB device presence"
if lsusb -d 17cc:0808 >/dev/null 2>&1; then
    pass "Device 17cc:0808 found on USB bus"
else
    fail "Device 17cc:0808 NOT found — is the MK1 plugged in?"
fi

# 2. Kernel driver
echo "[2/10] Kernel driver state"
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
echo "[3/10] Userspace USB access (pyusb)"
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
echo "[4/10] Udev rules"
if [[ -f /etc/udev/rules.d/90-map2-maschine-mk1.rules ]]; then
    pass "Udev rule file exists"
else
    warn "No udev rule at /etc/udev/rules.d/90-map2-maschine-mk1.rules"
fi

# 5. Systemd unit
echo "[5/10] Systemd daemon unit"
if systemctl is-active --quiet map2-maschine 2>/dev/null; then
    SERVICE_ACTIVE=true
    pass "map2-maschine.service is active"
elif systemctl list-unit-files map2-maschine.service >/dev/null 2>&1; then
    warn "map2-maschine.service exists but is not active"
else
    warn "map2-maschine.service not installed — install with: sudo cp systemd/map2-maschine.service /etc/systemd/system/ && sudo systemctl daemon-reload"
fi

# 6. Backend connectivity and Maschine routes
echo "[6/10] Backend connectivity and Maschine routes"
BACKEND_URL="${MAP2_BACKEND_URL:-http://localhost:8080}"
if curl -sf "${BACKEND_URL}/api/health" >/dev/null 2>&1; then
    pass "Backend at ${BACKEND_URL} is responding"
    for path in /api/maschine/status /api/maschine/transport-config /api/maschine/admin-console; do
        if curl -sf "${BACKEND_URL}${path}" >/dev/null 2>&1; then
            pass "Endpoint ${path} is reachable"
        else
            fail "Endpoint ${path} is NOT responding"
        fi
    done
else
    fail "Backend at ${BACKEND_URL} is NOT responding"
fi

# 7. Observer-only audit
echo "[7/10] Observer-only audit"
if python3 - <<'PY'
from pathlib import Path
daemon = Path("app/services/maschine/maschine_mk1_daemon.py").read_text(encoding="utf-8")
for forbidden in (
    "SnapshotService",
    "SnapshotRuntimeStateService",
    "state_authority_activation_service",
    "state_authority_document_service",
):
    if forbidden in daemon:
        raise SystemExit(f"forbidden import/reference found: {forbidden}")
print("observer-audit-ok")
PY
then
    pass "Daemon retains observer-only posture (no snapshot/state-authority write ownership)"
else
    fail "Observer-only audit failed"
fi

# 8. Profile catalog render verification (optional)
echo "[8/10] Profile catalog render verification"
if $CATALOG; then
    if $HARDWARE_CATALOG; then
        prepare_direct_hardware || {
            fail "Unable to prepare direct USB path for hardware catalog verification"
            HARDWARE_CATALOG=false
        }
    fi
    if python3 scripts/maschine_phase1_verify.py --include-hidden ${HARDWARE_CATALOG:+--hardware} --dwell-ms "${DWELL_MS}" >/tmp/map2-maschine-phase5-verify.log 2>&1; then
        pass "Profile catalog verification passed"
    else
        fail "Profile catalog verification failed (see /tmp/map2-maschine-phase5-verify.log)"
    fi
else
    echo "  Skipped (run with --catalog or --hardware-catalog)"
fi

# 9. Hardware blink test (optional)
echo "[9/10] Hardware blink test"
if $BLINK; then
    prepare_direct_hardware || fail "Unable to prepare direct USB path for hardware blink test"
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

# 10. Admin action surface snapshot
echo "[10/10] Admin action surface snapshot"
if python3 - <<'PY'
import httpx
client = httpx.Client(base_url="http://localhost:8080", timeout=10.0)
payload = client.get("/api/maschine/admin-console").json()
client.close()
admin = payload.get("admin_console") or {}
actions = list(admin.get("actions") or [])
assert actions, "no admin actions returned"
assert any((item.get("action_id") or "") == "run_full_update" for item in actions), "missing run_full_update"
assert any((item.get("action_id") or "") == "reboot_system" for item in actions), "missing reboot_system"
print("admin-snapshot-ok")
PY
then
    pass "Admin action catalog is present"
else
    fail "Admin action catalog check failed"
fi

restore_direct_hardware

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

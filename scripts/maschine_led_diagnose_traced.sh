#!/bin/bash
# Run one LED-diagnose variant under usbmon capture.
# Usage: sudo ./maschine_led_diagnose_traced.sh V14
# Output: /tmp/mk1-trace-<variant>.txt + stdout

set -e

VARIANT="${1:-V13}"
BUS="3"
TRACE="/tmp/mk1-trace-${VARIANT}.txt"
PIDFILE="/tmp/mk1-trace.pid"

# Find the MK1 device number so we can filter
DEV_LINE=$(lsusb -d 17cc:0808 || true)
if [[ -z "$DEV_LINE" ]]; then
    echo "ERROR: Maschine MK1 not found on USB bus"
    exit 1
fi
echo "$DEV_LINE"

# Start tcpdump-style plain-text usbmon tail in background.
# Format 'u' is the simplest (text) format. 3u = bus 3.
: > "$TRACE"
cat "/sys/kernel/debug/usb/usbmon/${BUS}u" > "$TRACE" &
MON_PID=$!
echo "$MON_PID" > "$PIDFILE"
echo "usbmon 3u capture started (pid $MON_PID) -> $TRACE"

# Give usbmon a moment to attach
sleep 0.2

# Run the diagnostic as the original user (not root) so pyusb uses
# the uaccess udev rule, not root privileges.
sudo -u mm python3 /home/mm/map2-audio/scripts/maschine_led_diagnose.py "$VARIANT" || RC=$?

# Stop capture
kill "$MON_PID" 2>/dev/null || true
wait "$MON_PID" 2>/dev/null || true
rm -f "$PIDFILE"

echo ""
echo "=== Trace: $TRACE ==="
# Filter for the MK1: lines containing :001:00 etc are hard to match, so
# grep for the device number that lsusb reported.
DEV_NUM=$(echo "$DEV_LINE" | awk '{print $4}' | tr -d ':')
echo "Device number: $DEV_NUM"
echo ""
echo "=== Last 60 lines of trace (all USB traffic) ==="
tail -60 "$TRACE"
echo ""
echo "=== Lines mentioning device $DEV_NUM ==="
grep ":$DEV_NUM:" "$TRACE" | tail -40 || echo "(none — filter mismatch)"

exit ${RC:-0}

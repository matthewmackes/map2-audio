#!/bin/bash
# LCD Notification Helper
# Usage: lcd_notify.sh "Line 1" "Line 2"
#
# This script can be called from systemd services to display
# status messages on the LCD during boot.
#
# Example in a .service file:
#   ExecStartPre=/home/mm/map2-audio/lcd/lcd_notify.sh "Starting MyService" ""
#   ExecStartPost=/home/mm/map2-audio/lcd/lcd_notify.sh "MyService" "Running"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PYTHON="/home/mm/map2-audio/.venv/bin/python"

LINE1="${1:-}"
LINE2="${2:-}"

if [ -x "$VENV_PYTHON" ]; then
    "$VENV_PYTHON" -m lcd.boot_display -m "$LINE1" "$LINE2" 2>/dev/null || true
fi

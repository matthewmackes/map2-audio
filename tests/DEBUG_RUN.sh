#!/bin/bash
set -e  # Exit on error

cd "$(dirname "$0")"

echo "=========================================="
echo "DEBUG TUI LAUNCHER"
echo "=========================================="
echo ""

# Step 1: Kill old processes
echo "[1/6] Killing old TUI processes..."
pkill -9 -f "python.*tui" 2>/dev/null || true
pkill -9 -f "debug_tui.py" 2>/dev/null || true
sleep 1
echo "   ✅ Old processes killed"
echo ""

# Step 2: Clear Python cache
echo "[2/6] Clearing Python bytecode cache..."
find tui -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
find tui -name "*.pyc" -delete 2>/dev/null || true
find . -name "debug_tui.pyc" -delete 2>/dev/null || true
echo "   ✅ Cache cleared"
echo ""

# Step 3: Verify backend is running
echo "[3/6] Checking backend status..."
if curl -s http://localhost:8080/api/health > /dev/null 2>&1; then
    echo "   ✅ Backend is running"
else
    echo "   ⚠️  Backend not running - starting it..."
    python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 > /tmp/backend.log 2>&1 &
    sleep 3
    if curl -s http://localhost:8080/api/health > /dev/null 2>&1; then
        echo "   ✅ Backend started successfully"
    else
        echo "   ❌ Failed to start backend"
        echo "   Check /tmp/backend.log for errors"
        exit 1
    fi
fi
echo ""

# Step 4: Verify TUI files exist
echo "[4/6] Verifying TUI files..."
if [ ! -f "tui/app.py" ]; then
    echo "   ❌ tui/app.py not found!"
    exit 1
fi
if [ ! -f "tui/api_client.py" ]; then
    echo "   ❌ tui/api_client.py not found!"
    exit 1
fi
echo "   ✅ TUI files exist"
echo ""

# Step 5: Show file timestamps to verify we have latest code
echo "[5/6] Checking file timestamps (should be recent)..."
echo "   tui/app.py: $(stat -c '%y' tui/app.py | cut -d. -f1)"
echo "   tui/screens/dashboard.py: $(stat -c '%y' tui/screens/dashboard.py | cut -d. -f1)"
echo "   tui/screens/chains.py: $(stat -c '%y' tui/screens/chains.py | cut -d. -f1)"
echo "   tui/api_client.py: $(stat -c '%y' tui/api_client.py | cut -d. -f1)"
echo ""

# Step 6: Launch debug TUI
echo "[6/6] Launching DEBUG TUI with verbose logging..."
echo ""
echo "=========================================="
echo "TUI OUTPUT BELOW"
echo "=========================================="
echo ""
echo "Full debug log will be saved to: /tmp/tui_debug.log"
echo ""

# Make debug script executable
chmod +x debug_tui.py

# Run with Python
exec python3 debug_tui.py

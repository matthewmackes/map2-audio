#!/bin/bash
# TUI v1 Improvements - Verification Script

echo "═══════════════════════════════════════════════════════════════"
echo "  MAP2 Audio TUI v1 - Improvements Verification"
echo "═══════════════════════════════════════════════════════════════"
echo ""

ERRORS=0

# Check Python version
echo "✓ Checking Python version..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    echo "  Found Python $PYTHON_VERSION"
else
    echo "  ✗ Python3 not found"
    ERRORS=$((ERRORS+1))
fi

# Check required files exist
echo ""
echo "✓ Checking improvement module files..."
FILES=(
    "tui/screen_state.py"
    "tui/status_bar.py"
    "tui/base_screen.py"
    "tui/config.py"
    "tui/error_handler.py"
    "tui/IMPROVEMENTS.md"
    "tui/INTEGRATION_GUIDE.md"
)

for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        lines=$(wc -l < "$file")
        echo "  ✓ $file ($lines lines)"
    else
        echo "  ✗ $file NOT FOUND"
        ERRORS=$((ERRORS+1))
    fi
done

# Check Python imports
echo ""
echo "✓ Checking Python imports..."
cd tui 2>/dev/null || { echo "✗ Cannot cd to tui/"; ERRORS=$((ERRORS+1)); }

python3 -c "from screen_state import screen_state" 2>/dev/null && \
    echo "  ✓ screen_state imports OK" || \
    { echo "  ✗ screen_state import failed"; ERRORS=$((ERRORS+1)); }

python3 -c "from status_bar import StatusBar" 2>/dev/null && \
    echo "  ✓ status_bar imports OK" || \
    { echo "  ✗ status_bar import failed"; ERRORS=$((ERRORS+1)); }

python3 -c "from base_screen import BaseScreen" 2>/dev/null && \
    echo "  ✓ base_screen imports OK" || \
    { echo "  ✗ base_screen import failed"; ERRORS=$((ERRORS+1)); }

python3 -c "from config import config" 2>/dev/null && \
    echo "  ✓ config imports OK" || \
    { echo "  ✗ config import failed"; ERRORS=$((ERRORS+1)); }

python3 -c "from error_handler import setup_error_handler" 2>/dev/null && \
    echo "  ✓ error_handler imports OK" || \
    { echo "  ✗ error_handler import failed"; ERRORS=$((ERRORS+1)); }

# Check app.py has new features
echo ""
echo "✓ Checking app.py modifications..."
if grep -q "status_bar" app.py; then
    echo "  ✓ Status bar integration found"
else
    echo "  ✗ Status bar integration NOT found"
    ERRORS=$((ERRORS+1))
fi

if grep -q "tab_groups" app.py; then
    echo "  ✓ Tab reorganization found"
else
    echo "  ✗ Tab reorganization NOT found"
    ERRORS=$((ERRORS+1))
fi

if grep -q "error_handler" app.py; then
    echo "  ✓ Error handler integration found"
else
    echo "  ✗ Error handler integration NOT found"
    ERRORS=$((ERRORS+1))
fi

# Check config directory
echo ""
echo "✓ Checking configuration directories..."
CONFIG_DIR="$HOME/.config/map2"
if [ -d "$CONFIG_DIR" ]; then
    echo "  ✓ Config directory exists: $CONFIG_DIR"
else
    echo "  ⚠ Config directory does not exist (will be created on first run)"
fi

# Summary
echo ""
echo "═══════════════════════════════════════════════════════════════"
if [ $ERRORS -eq 0 ]; then
    echo "  ✓ ALL CHECKS PASSED - Ready for deployment!"
    echo ""
    echo "  Quick start:"
    echo "    cd /home/mm/map2-audio"
    echo "    python -m tui.app"
else
    echo "  ✗ $ERRORS ERRORS FOUND - Please review"
fi
echo "═══════════════════════════════════════════════════════════════"
echo ""

exit $ERRORS

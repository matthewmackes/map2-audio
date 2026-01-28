#!/bin/bash

echo "=== DEBUGGING SETUP SCRIPT ==="
echo "Testing each step individually..."
echo

# Test Step 1: Python version
echo "[TEST 1/8] Python version check..."
if command -v python3.12 &> /dev/null; then
    python3.12 --version
    echo "✓ Step 1: Python OK"
else
    echo "✗ Step 1: Python 3.12 not found"
fi
echo

# Test Step 2: pip
echo "[TEST 2/8] pip check..."
if python3.12 -m pip --version &> /dev/null; then
    echo "✓ Step 2: pip OK"
else
    echo "✗ Step 2: pip not working"
fi
echo

# Test Step 3: Core packages
echo "[TEST 3/8] Core packages check..."
if python3.12 -c "import fastapi, uvicorn, sqlalchemy" 2>/dev/null; then
    echo "✓ Step 3: Core packages OK"
else
    echo "✗ Step 3: Core packages missing"
fi
echo

# Test Step 4: RT Kernel Section
echo "[TEST 4/8] RT Kernel installation check..."
if timeout 5 dnf search kernel >/dev/null 2>&1; then
    echo "✓ Step 4: Package manager responsive for RT kernel"
else
    echo "⚠ Step 4: Package manager slow - RT kernel install may hang"
fi
echo

# Test Step 5: Database
echo "[TEST 5/8] Database init check..."
if PYTHONPATH=$(pwd) python3.12 -c "from app.database_init import init_database; import asyncio; asyncio.run(init_database())" 2>/dev/null; then
    echo "✓ Step 5: Database init OK"
else
    echo "✗ Step 5: Database init failed"
fi
echo

# Test Step 6: Self-tests
echo "[TEST 6/8] Self-tests check..."
if PYTHONPATH=$(pwd) python3.12 -m scripts.self_test >/dev/null 2>&1; then
    echo "✓ Step 6: Self-tests OK"
else
    echo "✗ Step 6: Self-tests failed"
fi
echo

# Test Step 7: File existence
echo "[TEST 7/8] Required files check..."
missing_files=""
for file in "systemd/map2-backend.service" "install_branding.sh" "map2-system-check.sh"; do
    if [ ! -f "$file" ]; then
        missing_files="$missing_files $file"
    fi
done

if [ -z "$missing_files" ]; then
    echo "✓ Step 7: Required files OK"
else
    echo "✗ Step 7: Missing files:$missing_files"
fi
echo

# Test Step 8: System commands that might hang
echo "[TEST 8/8] System command check..."
echo "Testing commands that might cause hanging..."

# Test dnf/package manager (with timeout)
if command -v dnf &> /dev/null; then
    echo "  Testing dnf access..."
    if timeout 3 dnf --version >/dev/null 2>&1; then
        echo "  ✓ dnf responsive"
    else
        echo "  ⚠ dnf slow/hanging (this might cause setup issues)"
    fi
fi

# Test sudo access
echo "  Testing sudo access..."
if timeout 3 sudo -n true 2>/dev/null; then
    echo "  ✓ sudo passwordless access"
elif sudo -n true 2>/dev/null; then
    echo "  ⚠ sudo requires password (setup will prompt)"
else
    echo "  ✗ sudo access issues"
fi

# Test network connectivity
echo "  Testing network (pip repositories)..."
if timeout 5 python3.12 -m pip search setuptools >/dev/null 2>&1; then
    echo "  ✓ pip repository access"
else
    echo "  ⚠ pip repository slow/blocked (may cause hanging)"
fi

echo
echo "=== DIAGNOSIS COMPLETE ==="
echo "All green checkmarks = setup should work"
echo "Any red X's = potential issue"
echo "Yellow warnings = might cause delays/prompts"
echo
echo "=== SETUP HANGING TROUBLESHOOTING ==="
echo "If setup hangs, try these solutions:"
echo "1. Run: ./setup_user.sh (no sudo required)"
echo "2. Check network: ping 8.8.8.8"
echo "3. Check DNS: nslookup pypi.org"
echo "4. Skip RT kernel: comment out RT kernel section in setup.sh"
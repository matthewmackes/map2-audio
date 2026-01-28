#!/bin/bash
# MAP2 Audio Platform - Installation Scripts Validation
# Checks for errors after script renaming

echo "════════════════════════════════════════════════════════════"
echo "  MAP2 Installation Scripts - Validation Report"
echo "════════════════════════════════════════════════════════════"
echo

ERRORS=0
WARNINGS=0

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "1. Checking file existence..."
echo "────────────────────────────────────────────────────────────"

check_file() {
    local file=$1
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $file"
        return 0
    else
        echo -e "${RED}✗${NC} $file (MISSING)"
        ((ERRORS++))
        return 1
    fi
}

check_file "install-interactive.sh"
check_file "install-automated.sh"
check_file "install-tui.sh"
check_file "install-tui-interface.py"
check_file "system-check.sh"
check_file "run-demo.sh"
check_file "show-commands.sh"
check_file "quick-demo.sh"

echo
echo "2. Checking script permissions..."
echo "────────────────────────────────────────────────────────────"

check_executable() {
    local file=$1
    if [ -x "$file" ]; then
        echo -e "${GREEN}✓${NC} $file (executable)"
        return 0
    else
        echo -e "${YELLOW}⚠${NC} $file (not executable)"
        ((WARNINGS++))
        return 1
    fi
}

check_executable "install-interactive.sh"
check_executable "install-automated.sh"
check_executable "install-tui.sh"
check_executable "system-check.sh"
check_executable "run-demo.sh"
check_executable "show-commands.sh"
check_executable "quick-demo.sh"

echo
echo "3. Checking bash syntax..."
echo "────────────────────────────────────────────────────────────"

check_syntax() {
    local file=$1
    if bash -n "$file" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $file"
        return 0
    else
        echo -e "${RED}✗${NC} $file (SYNTAX ERROR)"
        bash -n "$file"
        ((ERRORS++))
        return 1
    fi
}

check_syntax "install-interactive.sh"
check_syntax "install-automated.sh"
check_syntax "install-tui.sh"
check_syntax "system-check.sh"
check_syntax "run-demo.sh"
check_syntax "show-commands.sh"
check_syntax "quick-demo.sh"

echo
echo "4. Checking Python syntax..."
echo "────────────────────────────────────────────────────────────"

if python3 -m py_compile install-tui-interface.py 2>/dev/null; then
    echo -e "${GREEN}✓${NC} install-tui-interface.py"
else
    echo -e "${RED}✗${NC} install-tui-interface.py (SYNTAX ERROR)"
    python3 -m py_compile install-tui-interface.py
    ((ERRORS++))
fi

echo
echo "5. Checking for old script name references..."
echo "────────────────────────────────────────────────────────────"

OLD_NAMES=(
    "setup\\.sh"
    "setup_auto\\.sh"
    "setup_ui\\.sh"
    "setup_tui\\.py"
    "map2-system-check\\.sh"
    "demo\\.sh"
)

for pattern in "${OLD_NAMES[@]}"; do
    # Search in installation scripts
    matches=$(grep -l "$pattern" install-*.sh system-check.sh 2>/dev/null || true)
    if [ -n "$matches" ]; then
        echo -e "${YELLOW}⚠${NC} Found reference to old name: $pattern"
        echo "   Files: $matches"
        for file in $matches; do
            echo -e "   ${BLUE}→${NC} $(grep -n "$pattern" "$file" | head -2)"
        done
        ((WARNINGS++))
    fi
done

if [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓${NC} No old script name references found"
fi

echo
echo "6. Checking script cross-references..."
echo "────────────────────────────────────────────────────────────"

# Check if install-automated.sh calls install-interactive.sh
if grep -q "install-interactive.sh" install-automated.sh; then
    echo -e "${GREEN}✓${NC} install-automated.sh → install-interactive.sh"
else
    echo -e "${RED}✗${NC} install-automated.sh does not call install-interactive.sh"
    ((ERRORS++))
fi

# Check if install-tui.sh calls install-tui-interface.py
if grep -q "install-tui-interface.py" install-tui.sh; then
    echo -e "${GREEN}✓${NC} install-tui.sh → install-tui-interface.py"
else
    echo -e "${RED}✗${NC} install-tui.sh does not call install-tui-interface.py"
    ((ERRORS++))
fi

# Check if install-tui-interface.py references correct scripts
if grep -q "install-automated.sh" install-tui-interface.py; then
    echo -e "${GREEN}✓${NC} install-tui-interface.py → install-automated.sh"
else
    echo -e "${RED}✗${NC} install-tui-interface.py does not reference install-automated.sh"
    ((ERRORS++))
fi

echo
echo "7. Checking shebang lines..."
echo "────────────────────────────────────────────────────────────"

check_shebang() {
    local file=$1
    local expected=$2
    local first_line=$(head -1 "$file")
    
    if [[ "$first_line" == "$expected"* ]]; then
        echo -e "${GREEN}✓${NC} $file: $first_line"
        return 0
    else
        echo -e "${YELLOW}⚠${NC} $file: $first_line (expected $expected)"
        ((WARNINGS++))
        return 1
    fi
}

check_shebang "install-interactive.sh" "#!/bin/bash"
check_shebang "install-automated.sh" "#!/bin/bash"
check_shebang "install-tui.sh" "#!/bin/bash"
check_shebang "install-tui-interface.py" "#!/usr/bin/env python3"
check_shebang "system-check.sh" "#!/bin/bash"
check_shebang "run-demo.sh" "#!/bin/bash"

echo
echo "════════════════════════════════════════════════════════════"
echo "  Summary"
echo "════════════════════════════════════════════════════════════"
echo

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ ALL CHECKS PASSED!${NC}"
    echo "  Installation scripts are ready to use."
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ WARNINGS: $WARNINGS${NC}"
    echo "  Scripts should work but have minor issues."
    exit 1
else
    echo -e "${RED}✗ ERRORS: $ERRORS, WARNINGS: $WARNINGS${NC}"
    echo "  Please fix errors before using scripts."
    exit 2
fi
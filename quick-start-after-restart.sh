#!/bin/bash
# MAP2 Audio Platform - Quick Start After Restart
# Run this immediately after system restart to verify everything works

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     MAP2 Audio Platform - Quick Start After Restart        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Check Python
echo -e "${YELLOW}→ Checking Python...${NC}"
if ! python3 --version > /dev/null 2>&1; then
    echo -e "${RED}✗ Python3 not found!${NC}"
    exit 1
fi
PYTHON_VERSION=$(python3 --version 2>&1)
echo -e "${GREEN}✓ $PYTHON_VERSION${NC}"
echo ""

# Step 2: Check Virtual Environment
echo -e "${YELLOW}→ Checking virtual environment...${NC}"
if [ ! -d ".venv" ]; then
    echo -e "${RED}✗ Virtual environment not found${NC}"
    echo -e "${YELLOW}Creating virtual environment...${NC}"
    python3 -m venv .venv
fi
source .venv/bin/activate
echo -e "${GREEN}✓ Virtual environment activated${NC}"
echo ""

# Step 3: Check Dependencies
echo -e "${YELLOW}→ Checking dependencies...${NC}"
MISSING=0
for pkg in fastapi uvicorn sqlalchemy aiosqlite; do
    if python3 -c "import $pkg" 2>/dev/null; then
        echo -e "${GREEN}✓ $pkg${NC}"
    else
        echo -e "${RED}✗ $pkg (installing...)${NC}"
        pip install -q $pkg
        MISSING=$((MISSING+1))
    fi
done
if [ $MISSING -gt 0 ]; then
    echo -e "${YELLOW}Installed $MISSING packages${NC}"
fi
echo ""

# Step 4: Create data directory
echo -e "${YELLOW}→ Ensuring data directory...${NC}"
if [ ! -d "data" ]; then
    mkdir -p data
    chmod 755 data
    echo -e "${GREEN}✓ Created data directory${NC}"
else
    echo -e "${GREEN}✓ Data directory exists${NC}"
fi
echo ""

# Step 5: Kill any existing processes on port 8080
echo -e "${YELLOW}→ Checking port 8080...${NC}"
if netstat -tuln 2>/dev/null | grep -q ":8080 "; then
    echo -e "${YELLOW}⚠ Port 8080 in use, attempting cleanup...${NC}"
    PID=$(lsof -ti:8080 2>/dev/null || echo "")
    if [ -n "$PID" ]; then
        kill -9 $PID 2>/dev/null || true
        sleep 1
    fi
    echo -e "${GREEN}✓ Port freed${NC}"
else
    echo -e "${GREEN}✓ Port 8080 is available${NC}"
fi
echo ""

# Step 6: Start API server
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          Starting API Server (Ctrl+C to stop)             ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}API Server: http://localhost:8080${NC}"
echo -e "${GREEN}API Docs:   http://localhost:8080/docs${NC}"
echo -e "${GREEN}Health:     http://localhost:8080/health${NC}"
echo ""
echo -e "${YELLOW}Logs saved to: logs/backend.log${NC}"
echo ""

export PYTHONPATH=$(pwd)
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 --log-level info

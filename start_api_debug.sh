#!/bin/bash
# MAP2 Audio API Server - Debug Startup Script
# Helps diagnose startup issues after system restart

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
LOG_DIR="$PROJECT_ROOT/logs"
VENV_DIR="$PROJECT_ROOT/.venv"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}MAP2 Audio API Server - Debug Startup${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Create log directory
mkdir -p "$LOG_DIR"

# Check if virtual environment exists
if [ ! -d "$VENV_DIR" ]; then
    echo -e "${RED}✗ Virtual environment not found at $VENV_DIR${NC}"
    echo -e "${YELLOW}Please run: python3 -m venv .venv && source .venv/bin/activate${NC}"
    exit 1
fi

# Activate virtual environment
echo -e "${BLUE}Activating virtual environment...${NC}"
source "$VENV_DIR/bin/activate"

# Check Python version
PYTHON_VERSION=$($VENV_DIR/bin/python3 --version)
echo -e "${GREEN}✓ Using Python: $PYTHON_VERSION${NC}"
echo ""

# Check critical dependencies
echo -e "${BLUE}Checking critical dependencies...${NC}"
MISSING_DEPS=0

for dep in fastapi uvicorn sqlalchemy pydantic; do
    if $VENV_DIR/bin/python3 -c "import $dep" 2>/dev/null; then
        echo -e "${GREEN}✓ $dep${NC}"
    else
        echo -e "${RED}✗ $dep (missing)${NC}"
        MISSING_DEPS=$((MISSING_DEPS+1))
    fi
done

if [ $MISSING_DEPS -gt 0 ]; then
    echo -e "${YELLOW}Installing missing dependencies...${NC}"
    $VENV_DIR/bin/pip install -q fastapi uvicorn sqlalchemy pydantic aiosqlite
fi
echo ""

# Check data directory
echo -e "${BLUE}Checking data directory...${NC}"
DATA_DIR="$PROJECT_ROOT/data"
if [ ! -d "$DATA_DIR" ]; then
    echo -e "${YELLOW}Creating data directory...${NC}"
    mkdir -p "$DATA_DIR"
    chmod 755 "$DATA_DIR"
    echo -e "${GREEN}✓ Data directory created${NC}"
else
    echo -e "${GREEN}✓ Data directory exists${NC}"
fi
echo ""

# Check if port 8080 is in use
echo -e "${BLUE}Checking port availability...${NC}"
PORT=8080
if netstat -tuln 2>/dev/null | grep -q ":$PORT "; then
    echo -e "${RED}✗ Port $PORT is already in use${NC}"
    echo -e "${YELLOW}Attempting to identify and kill process...${NC}"
    PID=$(lsof -ti:$PORT 2>/dev/null || echo "")
    if [ -n "$PID" ]; then
        echo -e "${YELLOW}Killing process $PID on port $PORT${NC}"
        kill -9 $PID 2>/dev/null || true
        sleep 1
        echo -e "${GREEN}✓ Port freed${NC}"
    fi
else
    echo -e "${GREEN}✓ Port $PORT is available${NC}"
fi
echo ""

# Check PYTHONPATH
echo -e "${BLUE}Setting up environment...${NC}"
export PYTHONPATH="$PROJECT_ROOT:$PYTHONPATH"
echo -e "${GREEN}✓ PYTHONPATH set to: $PYTHONPATH${NC}"
echo ""

# Run in debug mode
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Starting MAP2 Audio API Server (Debug Mode)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}API will be available at: http://localhost:$PORT${NC}"
echo -e "${YELLOW}API Docs at: http://localhost:$PORT/docs${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

# Log startup
LOG_FILE="$LOG_DIR/api_debug_$(date +%Y%m%d_%H%M%S).log"
echo "Starting at $(date)" > "$LOG_FILE"

# Start the API server with detailed logging
$VENV_DIR/bin/python3 -m uvicorn app.main:app \
    --host 0.0.0.0 \
    --port $PORT \
    --log-level debug \
    --access-log \
    2>&1 | tee -a "$LOG_FILE"

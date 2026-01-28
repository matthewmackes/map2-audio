#!/bin/bash
# MAP2 Audio Platform - User-Space Setup (No Sudo Required)
# This version skips system package installation and focuses on user-space setup

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=================================================="
echo "MAP2 Audio Platform - User Setup (No Sudo)"
echo "=================================================="
echo "This version skips system packages and focuses on user-space setup"
echo

# Skip sudo check if running as regular user
if [[ $EUID -eq 0 ]]; then
    echo -e "${RED}Don't run this as root! Run as regular user.${NC}"
    exit 1
fi

# Check Python version
echo -e "${YELLOW}[1/6] Checking Python version...${NC}"
if command -v python3.12 &> /dev/null; then
    PYTHON_CMD="python3.12"
    echo "Using Python 3.12 for better package compatibility"
elif command -v python3.11 &> /dev/null; then
    PYTHON_CMD="python3.11"
    echo "Using Python 3.11 for compatibility"
elif command -v python3.10 &> /dev/null; then
    PYTHON_CMD="python3.10"
    echo "Using Python 3.10"
else
    PYTHON_CMD="python3"
    echo "Using default Python (may have compatibility issues)"
fi

$PYTHON_CMD --version || { echo -e "${RED}Error: Python not found${NC}"; exit 1; }
echo -e "${GREEN}✓ Python available${NC}"
echo

# Check pip
echo -e "${YELLOW}[2/6] Checking pip...${NC}"
if $PYTHON_CMD -m pip --version &> /dev/null; then
    echo -e "${GREEN}✓ pip module available for $PYTHON_CMD${NC}"
else
    echo -e "${RED}Error: pip not available for $PYTHON_CMD${NC}"
    echo -e "${YELLOW}Please install: python3-pip${NC}"
    exit 1
fi
echo

# Install Python dependencies (user-space only)
echo -e "${YELLOW}[3/6] Installing Python dependencies...${NC}"
echo -e "${BLUE}Installing core packages (user-space)...${NC}"
if $PYTHON_CMD -m pip install -r requirements-minimal.txt --user; then
    echo -e "${GREEN}✓ Core packages installed${NC}"
else
    echo -e "${RED}Error: Failed to install core packages${NC}"
    exit 1
fi

# Optional packages
echo -e "${BLUE}Installing optional packages...${NC}"
if $PYTHON_CMD -m pip install python-rtmidi --user --timeout=60 2>/dev/null; then
    echo -e "${GREEN}✓ python-rtmidi installed${NC}"
else
    echo -e "${YELLOW}⚠️ python-rtmidi failed - MIDI hardware support limited${NC}"
fi

echo -e "${YELLOW}⚠️ Skipping LV2 support (requires sudo for system packages)${NC}"
echo -e "${YELLOW}   To install manually: sudo dnf install lilv python3-lilv${NC}"
echo -e "${GREEN}✓ Python dependencies completed${NC}"
echo

# Skip RT kernel installation
echo -e "${YELLOW}[4/6] Skipping RT kernel installation (requires sudo)${NC}"
echo -e "${BLUE}Using standard kernel with basic RT scheduling${NC}"
echo -e "${YELLOW}⚠️ For full RT performance, run: sudo ./configure_cpu_pinning.sh${NC}"
echo -e "${GREEN}✓ RT configuration skipped${NC}"
echo

# Skip Web UI installation (requires npm which might need sudo)
echo -e "${YELLOW}[5/6] Skipping Web UI installation (optional)${NC}"
echo -e "${BLUE}The API backend will work without the web interface${NC}"
echo -e "${GREEN}✓ Web UI skipped${NC}"
echo

# Initialize database
echo -e "${YELLOW}[6/6] Initializing database...${NC}"
export PYTHONPATH=$(pwd)
$PYTHON_CMD -c "
from app.database_init import init_database
import asyncio
asyncio.run(init_database())
print('✓ Database initialized')
"
echo -e "${GREEN}✓ Database ready${NC}"
echo

# Run tests
echo -e "${YELLOW}Running tests...${NC}"
PYTHONPATH=$(pwd) $PYTHON_CMD -m scripts.self_test
echo -e "${GREEN}✓ All tests passed${NC}"
echo

echo "=================================================="
echo -e "${GREEN}✓ User-Space Setup Complete!${NC}"
echo "=================================================="
echo
echo "MAP2 Audio Platform is now ready for basic operation!"
echo
echo -e "${YELLOW}What's working:${NC}"
echo "  • Backend API (Python)"
echo "  • Database"
echo "  • Audio processing (basic)"
echo "  • Self-tests"
echo
echo -e "${YELLOW}What's skipped (requires sudo):${NC}"
echo "  • RT kernel optimization"
echo "  • LV2 plugin support"
echo "  • System-level performance tuning"
echo "  • Web UI"
echo "  • Auto-start services"
echo
echo -e "${GREEN}To start the API server:${NC}"
echo "  cd /home/mm/map2-audio"
echo "  PYTHONPATH=\$(pwd) $PYTHON_CMD -m app.main"
echo
echo -e "${GREEN}API will be available at:${NC}"
echo "  http://localhost:8080/docs"
echo
echo -e "${YELLOW}For full system setup with all features:${NC}"
echo "  1. Run: sudo ./setup.sh"
echo "  2. Or manually install system packages and re-run setup"
echo
echo "=================================================="
#!/bin/bash
# ============================================================================
# MAP2 Audio Platform - Dependency Installation
# Installs missing dependencies for optimal system operation
# ============================================================================

set -e

print_status() {
    echo -e "\033[0;34m[MAP2]\033[0m $1"
}

print_success() {
    echo -e "\033[0;32m[MAP2]\033[0m $1"
}

print_error() {
    echo -e "\033[0;31m[MAP2]\033[0m $1"
}

echo "============================================================================"
echo "                   MAP2 Audio Platform - Dependency Setup"
echo "============================================================================"
echo

# Check if we're on a supported system
if ! command -v pip3 >/dev/null 2>&1; then
    print_error "Python 3 and pip3 are required but not found!"
    exit 1
fi

print_status "Installing Python dependencies..."

# Core dependencies for monitoring and system management
pip3 install --user aiohttp psutil

print_success "Python dependencies installed"

# Check for audio tools (optional)
if ! command -v aplay >/dev/null 2>&1; then
    print_status "Audio tools not found. Installing alsa-utils..."
    
    if command -v apt >/dev/null 2>&1; then
        sudo apt update && sudo apt install -y alsa-utils
    elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y alsa-utils
    elif command -v pacman >/dev/null 2>&1; then
        sudo pacman -S alsa-utils
    else
        print_error "Could not install alsa-utils automatically. Please install manually."
    fi
else
    print_success "Audio tools already available"
fi

# Check Node.js for frontend (optional)
if [ -d "web" ] && [ ! -d "web/node_modules" ]; then
    if command -v npm >/dev/null 2>&1; then
        print_status "Installing frontend dependencies..."
        cd web
        npm install
        cd ..
        print_success "Frontend dependencies installed"
    else
        print_error "Node.js/npm not found. Frontend will not be available."
        print_status "To install Node.js:"
        echo "  Ubuntu/Debian: sudo apt install nodejs npm"
        echo "  Fedora: sudo dnf install nodejs npm" 
        echo "  Arch: sudo pacman -S nodejs npm"
    fi
fi

echo
print_success "Dependency setup complete!"
echo
print_status "You can now run:"
echo "  ./start_simple.sh      - Start backend and frontend"
echo "  python3 monitor.py     - Check system status"
echo "  python3 tui/app.py     - Launch terminal interface"
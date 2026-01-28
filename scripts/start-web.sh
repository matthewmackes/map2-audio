#!/bin/bash
# ============================================================================
# MAP2 Audio Platform - Web Frontend Start Script
# Builds and/or runs the web frontend
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WEB_DIR="$PROJECT_ROOT/web"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[MAP2]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[MAP2]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[MAP2]${NC} $1"
}

print_error() {
    echo -e "${RED}[MAP2]${NC} $1"
}

show_help() {
    echo "MAP2 Audio Platform - Web Frontend Script"
    echo ""
    echo "Usage: $0 [command] [options]"
    echo ""
    echo "Commands:"
    echo "  dev         Start development server (default)"
    echo "  build       Build for production"
    echo "  preview     Preview production build"
    echo "  install     Install dependencies"
    echo "  clean       Clean build artifacts"
    echo "  help        Show this help message"
    echo ""
    echo "Options:"
    echo "  --host      Host to bind (default: 0.0.0.0)"
    echo "  --port      Port to use (default: 3000)"
    echo ""
    echo "Examples:"
    echo "  $0 dev              # Start dev server"
    echo "  $0 build            # Build for production"
    echo "  $0 dev --port 3001  # Dev server on port 3001"
}

check_node() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed!"
        print_status "Please install Node.js 18+ from https://nodejs.org/"
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_warning "Node.js version $NODE_VERSION detected. Version 18+ recommended."
    fi
}

check_npm() {
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed!"
        exit 1
    fi
}

install_deps() {
    print_status "Installing dependencies..."
    cd "$WEB_DIR"
    npm install
    print_success "Dependencies installed!"
}

run_dev() {
    local HOST="${HOST:-0.0.0.0}"
    local PORT="${PORT:-3000}"

    print_status "Starting development server..."
    print_status "Host: $HOST, Port: $PORT"
    print_status "API proxy: http://localhost:8080"

    cd "$WEB_DIR"

    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        print_warning "node_modules not found, installing dependencies..."
        npm install
    fi

    npm run dev -- --host "$HOST" --port "$PORT"
}

run_build() {
    print_status "Building for production..."
    cd "$WEB_DIR"

    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        print_warning "node_modules not found, installing dependencies..."
        npm install
    fi

    npm run build

    print_success "Build complete!"
    print_status "Output: $WEB_DIR/dist"
    print_status "The backend will automatically serve from this directory."
}

run_preview() {
    print_status "Previewing production build..."
    cd "$WEB_DIR"

    if [ ! -d "dist" ]; then
        print_warning "No build found, building first..."
        npm run build
    fi

    npm run preview
}

run_clean() {
    print_status "Cleaning build artifacts..."
    cd "$WEB_DIR"
    rm -rf dist node_modules/.cache
    print_success "Clean complete!"
}

# Parse arguments
COMMAND="${1:-dev}"
shift || true

HOST="0.0.0.0"
PORT="3000"

while [[ $# -gt 0 ]]; do
    case $1 in
        --host)
            HOST="$2"
            shift 2
            ;;
        --port)
            PORT="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# Check requirements
check_node
check_npm

# Execute command
case $COMMAND in
    dev)
        run_dev
        ;;
    build)
        run_build
        ;;
    preview)
        run_preview
        ;;
    install)
        install_deps
        ;;
    clean)
        run_clean
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $COMMAND"
        show_help
        exit 1
        ;;
esac

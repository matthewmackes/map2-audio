#!/bin/bash
#
# ToobAmp Build-from-Source Script
# Builds ToobAmp LV2 plugins from source for any Linux distribution
#
# Source: https://github.com/rerdavies/ToobAmp
# License: MIT
#
# Usage: bash scripts/build-toobamp.sh [--install]
#

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
TOOBAMP_VERSION="1.1.61"
TOOBAMP_REPO="https://github.com/rerdavies/ToobAmp"
BUILD_DIR="${BUILD_DIR:-/tmp/toobamp-build}"
INSTALL_SYSTEM=false
JOBS=$(nproc)

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --install)
            INSTALL_SYSTEM=true
            shift
            ;;
        --version)
            shift
            TOOBAMP_VERSION="$1"
            shift
            ;;
        --jobs|-j)
            shift
            JOBS="$1"
            shift
            ;;
        --build-dir)
            shift
            BUILD_DIR="$1"
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --install              Install to system after building"
            echo "  --version VERSION      ToobAmp version (default: $TOOBAMP_VERSION)"
            echo "  --jobs N               Number of parallel build jobs (default: $JOBS)"
            echo "  --build-dir DIR        Build directory (default: $BUILD_DIR)"
            echo "  --help                 Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

print_header() {
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}$1${NC}"
    echo -e "${GREEN}========================================${NC}"
}

# Detect distribution
detect_distro() {
    if [ -f /etc/fedora-release ]; then
        echo "fedora"
    elif [ -f /etc/debian_version ]; then
        echo "debian"
    elif [ -f /etc/arch-release ]; then
        echo "arch"
    elif [ -f /etc/gentoo-release ]; then
        echo "gentoo"
    elif [ -f /etc/SuSE-release ] || [ -f /etc/SUSE-brand ]; then
        echo "suse"
    else
        echo "unknown"
    fi
}

# Install dependencies for Fedora
install_deps_fedora() {
    log_info "Installing Fedora build dependencies..."
    sudo dnf install -y \
        cmake \
        ninja-build \
        gcc-c++ \
        git \
        lv2-devel \
        boost-devel \
        flac-devel \
        zlib-devel \
        dbus-devel \
        cairo-devel \
        pango-devel \
        librsvg2-devel \
        lilv-devel \
        libXrandr-devel \
        catch-devel 2>/dev/null || true
}

# Install dependencies for Debian/Ubuntu
install_deps_debian() {
    log_info "Installing Debian/Ubuntu build dependencies..."
    sudo apt-get update
    sudo apt-get install -y \
        build-essential \
        cmake \
        ninja-build \
        git \
        lv2-dev \
        libboost-iostreams-dev \
        libflac++-dev \
        zlib1g-dev \
        libdbus-1-dev \
        libcairo2-dev \
        libpango1.0-dev \
        catch2 \
        librsvg2-dev \
        liblilv-dev \
        libxrandr-dev
}

# Install dependencies for Arch
install_deps_arch() {
    log_info "Installing Arch Linux build dependencies..."
    sudo pacman -S --needed --noconfirm \
        cmake \
        ninja \
        gcc \
        git \
        lv2 \
        boost \
        flac \
        zlib \
        dbus \
        cairo \
        pango \
        librsvg \
        lilv \
        libxrandr \
        catch2
}

# Install dependencies for openSUSE
install_deps_suse() {
    log_info "Installing openSUSE build dependencies..."
    sudo zypper install -y \
        cmake \
        ninja \
        gcc-c++ \
        git \
        lv2-devel \
        boost-devel \
        flac-devel \
        zlib-devel \
        dbus-1-devel \
        cairo-devel \
        pango-devel \
        librsvg-devel \
        lilv-devel \
        libXrandr-devel
}

# Install dependencies based on distribution
install_dependencies() {
    print_header "Installing Build Dependencies"

    DISTRO=$(detect_distro)
    log_info "Detected distribution: $DISTRO"

    case $DISTRO in
        fedora)
            install_deps_fedora
            ;;
        debian)
            install_deps_debian
            ;;
        arch)
            install_deps_arch
            ;;
        suse)
            install_deps_suse
            ;;
        *)
            log_warning "Unknown distribution. Please install dependencies manually:"
            echo "  - cmake, ninja-build, gcc/g++"
            echo "  - lv2-dev, lilv-dev, cairo-dev, pango-dev"
            echo "  - boost-dev, flac-dev, zlib-dev, dbus-dev"
            echo "  - librsvg-dev, libxrandr-dev"
            read -p "Continue anyway? (y/n) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
            ;;
    esac

    log_success "Dependencies installed"
}

# Clone and prepare source
prepare_source() {
    print_header "Preparing Source Code"

    # Create build directory
    mkdir -p "$BUILD_DIR"
    cd "$BUILD_DIR"

    # Clone or update repository
    if [ -d "ToobAmp" ]; then
        log_info "Updating existing source..."
        cd ToobAmp
        git fetch --all
        git checkout "v$TOOBAMP_VERSION" 2>/dev/null || git checkout main
        git pull || true
    else
        log_info "Cloning ToobAmp repository..."
        git clone "$TOOBAMP_REPO.git" ToobAmp
        cd ToobAmp
        git checkout "v$TOOBAMP_VERSION" 2>/dev/null || log_warning "Version tag not found, using main branch"
    fi

    # Initialize submodules
    log_info "Initializing submodules..."
    git submodule update --init --recursive

    log_success "Source code ready"
}

# Configure build
configure_build() {
    print_header "Configuring Build"

    cd "$BUILD_DIR/ToobAmp"
    mkdir -p build
    cd build

    log_info "Running CMake configuration..."
    cmake .. -G Ninja \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/usr

    log_success "Build configured"
}

# Build ToobAmp
build_toobamp() {
    print_header "Building ToobAmp"

    cd "$BUILD_DIR/ToobAmp/build"

    log_info "Building with $JOBS parallel jobs..."
    ninja -j$JOBS

    log_success "Build completed"
}

# Install to system
install_toobamp() {
    print_header "Installing ToobAmp"

    cd "$BUILD_DIR/ToobAmp/build"

    log_info "Installing to system..."
    sudo ninja install

    # Clear MAP2 plugin cache
    if [ -f ~/.config/map2/plugin_cache.json ]; then
        log_info "Clearing MAP2 plugin cache..."
        rm -f ~/.config/map2/plugin_cache.json
    fi

    log_success "ToobAmp installed to system"
}

# Verify build
verify_build() {
    print_header "Verifying Build"

    # Check if plugins were built
    PLUGIN_DIR="$BUILD_DIR/ToobAmp/build"

    if [ -d "$PLUGIN_DIR" ]; then
        PLUGIN_COUNT=$(find "$PLUGIN_DIR" -name "*.so" 2>/dev/null | wc -l)
        log_info "Built $PLUGIN_COUNT shared libraries"
    fi

    # If installed, check system
    if [ "$INSTALL_SYSTEM" = true ]; then
        if command -v lv2ls &>/dev/null; then
            TOOB_PLUGINS=$(lv2ls 2>/dev/null | grep -ic "two-play\|toob" || echo "0")
            log_info "System has $TOOB_PLUGINS ToobAmp plugins registered"
        fi
    fi

    log_success "Verification complete"
}

# Print summary
print_summary() {
    print_header "Build Summary"

    echo ""
    echo "ToobAmp v$TOOBAMP_VERSION has been built successfully!"
    echo ""
    echo "Build directory: $BUILD_DIR/ToobAmp"
    echo ""

    if [ "$INSTALL_SYSTEM" = true ]; then
        echo "Plugins have been installed to the system."
        echo ""
        echo "Next steps:"
        echo "  1. Restart the MAP2 backend: sudo systemctl restart map2-backend"
        echo "  2. Refresh plugins in the web UI"
    else
        echo "To install to system, run:"
        echo "  cd $BUILD_DIR/ToobAmp/build && sudo ninja install"
        echo ""
        echo "Or run this script with --install flag:"
        echo "  $0 --install"
    fi
    echo ""
}

# Main build flow
main() {
    print_header "ToobAmp Build Script"
    echo ""
    echo "Version: $TOOBAMP_VERSION"
    echo "Build directory: $BUILD_DIR"
    echo "Parallel jobs: $JOBS"
    echo "Install to system: $INSTALL_SYSTEM"
    echo ""

    install_dependencies
    prepare_source
    configure_build
    build_toobamp

    if [ "$INSTALL_SYSTEM" = true ]; then
        install_toobamp
    fi

    verify_build
    print_summary

    log_success "Build process complete!"
}

# Run main
main "$@"

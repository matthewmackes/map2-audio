#!/bin/bash
#
# ToobAmp LV2 Plugin Installer for MAP2 Audio Platform
# Installs PiPedal's ToobAmp plugin collection as core plugins
#
# Source: https://github.com/rerdavies/ToobAmp
# License: MIT
#
# Usage: bash scripts/install-toobamp.sh [--build-from-source]
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
INSTALL_DIR="/usr/lib/lv2"
BUILD_FROM_SOURCE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --build-from-source)
            BUILD_FROM_SOURCE=true
            shift
            ;;
        --version)
            shift
            TOOBAMP_VERSION="$1"
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --build-from-source    Build ToobAmp from source (required for Fedora/RHEL)"
            echo "  --version VERSION      Specify ToobAmp version (default: $TOOBAMP_VERSION)"
            echo "  --help                 Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

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
    else
        echo "unknown"
    fi
}

# Detect architecture
detect_arch() {
    ARCH=$(uname -m)
    case $ARCH in
        x86_64)
            echo "amd64"
            ;;
        aarch64)
            echo "arm64"
            ;;
        armv7l)
            echo "armhf"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# Check if ToobAmp is already installed
check_existing() {
    if [ -d "$INSTALL_DIR/ToobAmp.lv2" ] || [ -d "$INSTALL_DIR/toob-amp.lv2" ]; then
        return 0
    fi
    # Check for individual ToobAmp plugins
    if ls "$INSTALL_DIR"/toob*.lv2 1>/dev/null 2>&1; then
        return 0
    fi
    return 1
}

# Install build dependencies for Fedora
install_fedora_deps() {
    log_info "Installing build dependencies for Fedora..."
    sudo dnf install -y \
        cmake ninja-build gcc-c++ git \
        lv2-devel boost-devel flac-devel zlib-devel \
        dbus-devel cairo-devel pango-devel \
        librsvg2-devel lilv-devel libXrandr-devel \
        catch-devel || {
            log_warning "Some packages may not be available, continuing..."
        }
}

# Install build dependencies for Debian/Ubuntu
install_debian_deps() {
    log_info "Installing build dependencies for Debian/Ubuntu..."
    sudo apt-get update
    sudo apt-get install -y \
        build-essential cmake ninja-build git \
        lv2-dev libboost-iostreams-dev libflac++-dev zlib1g-dev \
        libdbus-1-dev libcairo2-dev libpango1.0-dev \
        catch2 librsvg2-dev liblilv-dev libxrandr-dev
}

# Build ToobAmp from source
build_from_source() {
    print_header "Building ToobAmp from Source"

    DISTRO=$(detect_distro)

    # Install dependencies based on distro
    case $DISTRO in
        fedora)
            install_fedora_deps
            ;;
        debian)
            install_debian_deps
            ;;
        *)
            log_warning "Unknown distribution. You may need to install dependencies manually."
            ;;
    esac

    # Create temp build directory
    BUILD_DIR=$(mktemp -d)
    log_info "Building in $BUILD_DIR"

    cd "$BUILD_DIR"

    # Clone repository
    log_info "Cloning ToobAmp repository..."
    git clone --depth 1 --branch "v$TOOBAMP_VERSION" "$TOOBAMP_REPO.git" ToobAmp 2>/dev/null || \
    git clone --depth 1 "$TOOBAMP_REPO.git" ToobAmp

    cd ToobAmp

    # Initialize submodules
    log_info "Initializing submodules..."
    git submodule update --init --recursive

    # Configure with CMake
    log_info "Configuring build..."
    mkdir -p build
    cd build
    cmake .. -G Ninja \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/usr

    # Build
    log_info "Building ToobAmp (this may take a while)..."
    ninja -j$(nproc)

    # Install
    log_info "Installing ToobAmp..."
    sudo ninja install

    # Cleanup
    cd /
    rm -rf "$BUILD_DIR"

    log_success "ToobAmp built and installed from source"
}

# Install from .deb package
install_from_deb() {
    print_header "Installing ToobAmp from Package"

    ARCH=$(detect_arch)

    if [ "$ARCH" = "unknown" ]; then
        log_error "Unsupported architecture: $(uname -m)"
        log_info "Try building from source with: $0 --build-from-source"
        exit 1
    fi

    DEB_URL="https://github.com/rerdavies/ToobAmp/releases/download/v${TOOBAMP_VERSION}/toobamp_${TOOBAMP_VERSION}_${ARCH}.deb"
    DEB_FILE="/tmp/toobamp_${TOOBAMP_VERSION}_${ARCH}.deb"

    log_info "Downloading ToobAmp v$TOOBAMP_VERSION for $ARCH..."
    curl -L -o "$DEB_FILE" "$DEB_URL" || wget -O "$DEB_FILE" "$DEB_URL"

    if [ ! -f "$DEB_FILE" ]; then
        log_error "Failed to download package"
        exit 1
    fi

    log_info "Installing package..."
    # Use apt-get for proper dependency resolution
    sudo apt-get install -y "$DEB_FILE" || {
        log_warning "apt-get failed, trying dpkg..."
        sudo dpkg -i "$DEB_FILE"
        sudo apt-get install -f -y
    }

    # Cleanup
    rm -f "$DEB_FILE"

    log_success "ToobAmp installed from package"
}

# Verify installation
verify_installation() {
    print_header "Verifying Installation"

    PLUGIN_COUNT=0
    EXPECTED_PLUGINS=(
        "toob-nam"
        "toob-ml"
        "toob-cab-ir"
        "toob-freeverb"
        "toob-convolution-reverb"
        "toob-delay"
        "toob-ce2-chorus"
        "toob-bf2-flanger"
        "toob-phaser"
        "toob-tremolo"
        "toob-tone-stack"
        "toob-tuner"
        "toob-noise-gate"
    )

    # Check for ToobAmp bundle
    if [ -d "$INSTALL_DIR/ToobAmp.lv2" ]; then
        log_success "ToobAmp.lv2 bundle found"
        PLUGIN_COUNT=$(ls -1 "$INSTALL_DIR/ToobAmp.lv2"/*.ttl 2>/dev/null | wc -l)
    else
        # Check for individual plugin bundles
        for plugin in "${EXPECTED_PLUGINS[@]}"; do
            if [ -d "$INSTALL_DIR/${plugin}.lv2" ]; then
                ((PLUGIN_COUNT++))
            fi
        done
    fi

    if [ $PLUGIN_COUNT -gt 0 ]; then
        log_success "Found $PLUGIN_COUNT ToobAmp plugin(s)"
    else
        log_warning "No ToobAmp plugins found in $INSTALL_DIR"
    fi

    # List installed plugins using lv2ls if available
    if command -v lv2ls &>/dev/null; then
        log_info "ToobAmp plugins detected by LV2:"
        lv2ls 2>/dev/null | grep -i "two-play\|toob" || log_warning "No ToobAmp plugins detected by lv2ls"
    fi

    # Trigger cache refresh for MAP2
    if [ -f ~/.config/map2/plugin_cache.json ]; then
        log_info "Clearing MAP2 plugin cache..."
        rm -f ~/.config/map2/plugin_cache.json
    fi

    return 0
}

# Print plugin list
print_installed_plugins() {
    print_header "Installed ToobAmp Plugins"

    cat << 'EOF'
Core Plugins (26 total):

AMP MODELING:
  - TooB Neural Amp Modeler (NAM models)
  - TooB ML Amplifier (ML models)

CABINET SIMULATION:
  - TooB Cab IR (convolution-based)
  - TooB CabSim (EQ-based)

REVERB:
  - TooB Convolution Reverb (mono/stereo)
  - TooB Freeverb

EQ & TONE:
  - TooB Parametric EQ (4-band)
  - TooB 3 Band EQ
  - TooB Tone Stack (Fender/Marshall/Baxandall)
  - TooB GE-7 Graphics Equalizer

MODULATION:
  - TooB CE-2 Chorus
  - TooB BF-2 Flanger (mono/stereo)
  - TooB Phaser
  - TooB Tremolo (mono/stereo)

TIME-BASED:
  - TooB Delay

UTILITY:
  - TooB Tuner
  - TooB Noise Gate
  - TooB Input Stage
  - TooB Volume
  - TooB Mix
  - TooB Spectrum Analyzer
  - TooB Input Recorder
  - TooB 4Looper
  - TooB One-Button Looper
  - TooB Player

For NAM models: https://tonehunt.org
For IR files: Various free sources available

EOF
}

# Main installation flow
main() {
    print_header "ToobAmp LV2 Plugin Installer"
    echo ""
    echo "ToobAmp: High-quality LV2 plugins from PiPedal project"
    echo "Version: $TOOBAMP_VERSION"
    echo "Source: $TOOBAMP_REPO"
    echo ""

    # Check if already installed
    if check_existing; then
        log_warning "ToobAmp appears to be already installed"
        read -p "Reinstall? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Installation cancelled"
            verify_installation
            exit 0
        fi
    fi

    DISTRO=$(detect_distro)
    log_info "Detected distribution: $DISTRO"
    log_info "Detected architecture: $(detect_arch)"

    # Choose installation method
    if [ "$BUILD_FROM_SOURCE" = true ]; then
        build_from_source
    elif [ "$DISTRO" = "debian" ]; then
        install_from_deb
    elif [ "$DISTRO" = "fedora" ]; then
        log_warning "Fedora detected - .deb packages not supported"
        log_info "Building from source..."
        build_from_source
    else
        log_warning "Unknown distribution"
        read -p "Build from source? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            build_from_source
        else
            log_error "Cannot install without building from source on this system"
            exit 1
        fi
    fi

    # Verify and show results
    verify_installation
    print_installed_plugins

    echo ""
    log_success "ToobAmp installation complete!"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Restart the MAP2 backend: sudo systemctl restart map2-backend"
    echo "2. Refresh plugins in the web UI"
    echo "3. Download NAM models from https://tonehunt.org"
    echo ""
}

# Run main
main "$@"

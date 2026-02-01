#!/bin/bash
#
# MAP2 Audio Platform - Fedora Server 42 Installer
# Complete automated installation script
#
# Usage: sudo bash install-fedora-42.sh
#

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Installation constants
MIN_PYTHON_VERSION="3.10"
MIN_DISK_SPACE_GB=5
INSTALL_DIR="$HOME/map2-audio"
CONFIG_DIR="$HOME/.map2"
SERVICE_USER="$(whoami)"

# Log functions
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

# Check if running as root
check_root() {
    if [ "$EUID" -eq 0 ]; then
        log_error "Do not run this script as root. Run as normal user with sudo access."
        exit 1
    fi
}

# Check Fedora version
check_fedora_version() {
    if [ ! -f /etc/fedora-release ]; then
        log_error "This installer is designed for Fedora. /etc/fedora-release not found."
        exit 1
    fi

    FEDORA_VERSION=$(rpm -E %fedora)
    log_info "Detected Fedora version: $FEDORA_VERSION"

    if [ "$FEDORA_VERSION" -lt 42 ]; then
        log_warning "This installer is optimized for Fedora 42. You have Fedora $FEDORA_VERSION."
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Check Python version
check_python() {
    log_info "Checking Python version..."

    if ! command -v python3 &> /dev/null; then
        log_error "python3 not found. Installing..."
        sudo dnf install -y python3
    fi

    PYTHON_VERSION=$(python3 --version | awk '{print $2}')
    log_info "Found Python $PYTHON_VERSION"

    # Compare versions
    REQUIRED_VERSION="${MIN_PYTHON_VERSION}"
    if ! python3 -c "import sys; exit(0 if sys.version_info >= tuple(map(int, '${REQUIRED_VERSION}'.split('.'))) else 1)"; then
        log_error "Python $MIN_PYTHON_VERSION or higher required. Found $PYTHON_VERSION"
        exit 1
    fi

    log_success "Python version check passed"
}

# Check disk space
check_disk_space() {
    log_info "Checking available disk space..."

    AVAILABLE_GB=$(df -BG "$HOME" | awk 'NR==2 {print $4}' | sed 's/G//')

    if [ "$AVAILABLE_GB" -lt "$MIN_DISK_SPACE_GB" ]; then
        log_error "Insufficient disk space. Required: ${MIN_DISK_SPACE_GB}GB, Available: ${AVAILABLE_GB}GB"
        exit 1
    fi

    log_success "Disk space check passed (${AVAILABLE_GB}GB available)"
}

# Check network connectivity
check_network() {
    log_info "Checking network connectivity..."

    if ! ping -c 1 google.com &> /dev/null; then
        log_error "No internet connection. Please check your network."
        exit 1
    fi

    log_success "Network connectivity verified"
}

# Install system dependencies
install_system_packages() {
    print_header "PHASE 1: Installing System Packages"

    log_info "Updating package repositories..."
    sudo dnf update -y

    log_info "Installing development tools..."
    sudo dnf groupinstall -y "Development Tools"
    sudo dnf install -y gcc gcc-c++ make cmake git curl

    log_info "Installing Python development packages..."
    sudo dnf install -y python3-devel python3-pip python3-wheel

    log_info "Installing audio system packages..."
    sudo dnf install -y \
        portaudio-devel \
        alsa-lib-devel \
        alsa-utils \
        jack-audio-connection-kit \
        jack-audio-connection-kit-devel \
        pipewire-jack-audio-connection-kit \
        pipewire-alsa

    log_info "Installing LV2 plugin support..."
    sudo dnf install -y \
        lv2-devel \
        lilv-devel \
        suil-devel \
        sratom-devel \
        sord-devel \
        serd-devel

    log_info "Installing additional system utilities..."
    sudo dnf install -y \
        systemd-devel \
        libsndfile-devel \
        fftw-devel \
        sqlite-devel \
        pkg-config

    log_success "System packages installed"
}

# Setup user permissions and groups
setup_user_permissions() {
    print_header "PHASE 2: Configuring User Permissions"

    log_info "Adding user to audio group..."
    sudo usermod -aG audio "$SERVICE_USER"

    log_info "Configuring real-time audio privileges..."
    sudo tee /etc/security/limits.d/99-audio-realtime.conf > /dev/null <<EOF
# Real-time audio privileges for MAP2
@audio   -  rtprio     95
@audio   -  nice       -19
@audio   -  memlock    unlimited
EOF

    log_info "Configuring USB audio optimization..."
    sudo tee /etc/modprobe.d/audio-usb.conf > /dev/null <<EOF
# USB audio optimization for MAP2
options usbcore autosuspend=-1
options snd_usb_audio nrpacks=1
EOF

    log_info "Configuring system tuning parameters..."
    sudo tee /etc/sysctl.d/99-audio.conf > /dev/null <<EOF
# Audio system tuning for MAP2
vm.swappiness = 10
vm.panic_on_oom = 0
kernel.sched_rt_period_us = 1000000
kernel.sched_rt_runtime_us = 900000
EOF

    sudo sysctl --system > /dev/null

    log_success "User permissions configured"
}

# Install Python dependencies
install_python_packages() {
    print_header "PHASE 3: Installing Python Dependencies"

    log_info "Upgrading pip..."
    python3 -m pip install --upgrade pip

    log_info "Installing core Python packages..."
    python3 -m pip install --user \
        fastapi>=0.104.0 \
        uvicorn[standard]>=0.24.0 \
        pydantic>=2.5.0 \
        sqlalchemy>=2.0.0 \
        aiosqlite>=0.19.0

    log_info "Installing audio processing packages..."
    python3 -m pip install --user \
        numpy>=1.24.0 \
        sounddevice>=0.4.6 \
        scipy>=1.11.0 \
        mido>=1.3.0

    log_info "Installing terminal UI framework..."
    python3 -m pip install --user textual>=0.46.0

    log_info "Installing web and utility packages..."
    python3 -m pip install --user \
        python-multipart>=0.0.6 \
        httpx>=0.25.0 \
        psutil>=5.9.0

    log_info "Installing development packages..."
    python3 -m pip install --user \
        pytest>=7.0.0 \
        pytest-asyncio>=0.21.0 \
        black>=23.0.0 \
        isort>=5.12.0 \
        ruff>=0.1.0

    log_success "Python packages installed"
}

# Setup directory structure
setup_directories() {
    print_header "PHASE 4: Creating Directory Structure"

    log_info "Creating user configuration directory..."
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$CONFIG_DIR/data"
    mkdir -p "$CONFIG_DIR/nam_models"
    mkdir -p "$CONFIG_DIR/ir_files/cabinets"
    mkdir -p "$CONFIG_DIR/ir_files/reverbs"

    log_info "Setting directory permissions..."
    chmod 755 "$CONFIG_DIR"
    chmod 755 "$CONFIG_DIR/data"
    chmod 755 "$CONFIG_DIR/nam_models"
    chmod 755 "$CONFIG_DIR/ir_files"

    log_success "Directory structure created"
}

# Initialize configuration files
initialize_config() {
    print_header "PHASE 5: Initializing Configuration"

    CONFIG_FILE="$CONFIG_DIR/config.json"

    if [ ! -f "$CONFIG_FILE" ]; then
        log_info "Creating default configuration file..."
        cat > "$CONFIG_FILE" <<EOF
{
  "app": {
    "name": "Mackes Audio Platform V2",
    "version": "0.1.0"
  },
  "audio": {
    "sample_rate": 48000,
    "buffer_size": 256,
    "channels": 2,
    "device": null
  },
  "midi": {
    "enabled": true,
    "learn_timeout": 10.0
  },
  "lcd": {
    "enabled": false,
    "addresses": [39, 63]
  },
  "backend": {
    "host": "0.0.0.0",
    "port": 8080,
    "workers": 2
  },
  "paths": {
    "nam_models": "$CONFIG_DIR/nam_models",
    "ir_cabinets": "$CONFIG_DIR/ir_files/cabinets",
    "ir_reverbs": "$CONFIG_DIR/ir_files/reverbs",
    "database": "$CONFIG_DIR/data/map2.db"
  }
}
EOF
        chmod 644 "$CONFIG_FILE"
        log_success "Configuration file created at $CONFIG_FILE"
    else
        log_info "Configuration file already exists, skipping..."
    fi
}

# Setup systemd services
setup_systemd_services() {
    print_header "PHASE 6: Configuring systemd Services"

    log_info "Creating map2-backend.service..."
    sudo tee /etc/systemd/system/map2-backend.service > /dev/null <<EOF
[Unit]
Description=MAP2 Audio Platform Backend
After=network.target sound.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
Environment="PYTHONPATH=$INSTALL_DIR"
Environment="MAP2_CONFIG_DIR=$CONFIG_DIR"
Environment="PATH=/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin"
ExecStart=/usr/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080
Restart=always
RestartSec=10

# Real-time priority
Nice=-10
LimitRTPRIO=95
LimitMEMLOCK=infinity
LimitNOFILE=65536

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$CONFIG_DIR

[Install]
WantedBy=multi-user.target
EOF

    log_info "Reloading systemd daemon..."
    sudo systemctl daemon-reload

    log_info "Enabling services..."
    sudo systemctl enable map2-backend.service

    log_success "systemd services configured"
}

# Verify installation
verify_installation() {
    print_header "PHASE 8: Verifying Installation"

    log_info "Checking Python imports..."
    python3 -c "import fastapi, uvicorn, sqlalchemy, numpy, sounddevice, textual" && \
        log_success "Python packages verified" || \
        log_error "Python package import failed"

    log_info "Checking audio system..."
    if command -v aplay &> /dev/null; then
        log_success "ALSA utilities installed"
    else
        log_warning "ALSA utilities not found"
    fi

    log_info "Checking LV2 support..."
    if [ -d "/usr/lib64/lv2" ] || [ -d "/usr/lib/lv2" ]; then
        log_success "LV2 plugin directories found"
    else
        log_warning "LV2 directories not found"
    fi

    log_info "Checking user groups..."
    if groups "$SERVICE_USER" | grep -q audio; then
        log_success "User is in audio group"
    else
        log_warning "User not in audio group (will require logout/login)"
    fi

    log_info "Checking systemd services..."
    if systemctl list-unit-files | grep -q map2-backend; then
        log_success "Backend service registered"
    else
        log_warning "Backend service not found"
    fi

    log_success "Installation verification complete"
}

# Print post-installation instructions
print_post_install() {
    print_header "Installation Complete!"

    echo ""
    echo -e "${GREEN}MAP2 Audio Platform has been installed successfully!${NC}"
    echo ""
    echo -e "${BLUE}Important Next Steps:${NC}"
    echo ""
    echo "1. ${YELLOW}Log out and log back in${NC} for group changes to take effect"
    echo ""
    echo "2. ${YELLOW}Start the service:${NC}"
    echo "   sudo systemctl start map2-backend"
    echo ""
    echo "3. ${YELLOW}Check service status:${NC}"
    echo "   sudo systemctl status map2-backend"
    echo ""
    echo "4. ${YELLOW}Access the interface:${NC}"
    echo "   - API Documentation: http://localhost:8080/docs"
    echo "   - Terminal UI: cd $INSTALL_DIR && python3 -m tui.main"
    echo ""
    echo "5. ${YELLOW}View logs:${NC}"
    echo "   sudo journalctl -u map2-backend -f"
    echo ""
    echo -e "${BLUE}Configuration Files:${NC}"
    echo "   - User Config: $CONFIG_DIR/config.json"
    echo "   - Database: $CONFIG_DIR/data/map2.db"
    echo "   - NAM Models: $CONFIG_DIR/nam_models/"
    echo "   - IR Files: $CONFIG_DIR/ir_files/"
    echo ""
    echo -e "${BLUE}Systemd Services:${NC}"
    echo "   - Backend: /etc/systemd/system/map2-backend.service"
    echo ""
    echo -e "${GREEN}For help and documentation, visit:${NC}"
    echo "   - README: $INSTALL_DIR/README.md"
    echo "   - Docs: $INSTALL_DIR/docs/"
    echo ""
}

# Install ToobAmp core plugins (optional)
install_toobamp_plugins() {
    print_header "PHASE 7: Installing Core LV2 Plugins (ToobAmp)"

    log_info "ToobAmp provides 26 high-quality LV2 plugins for guitar effects"
    log_info "Source: https://github.com/rerdavies/ToobAmp"
    echo ""

    read -p "Install ToobAmp core plugins? (recommended) (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Skipping ToobAmp installation"
        log_info "You can install later with: bash scripts/install-toobamp.sh"
        return
    fi

    TOOBAMP_SCRIPT="$INSTALL_DIR/scripts/install-toobamp.sh"

    if [ -f "$TOOBAMP_SCRIPT" ]; then
        log_info "Running ToobAmp installer..."
        bash "$TOOBAMP_SCRIPT" --build-from-source
    else
        log_warning "ToobAmp installer not found at $TOOBAMP_SCRIPT"
        log_info "You can install manually with:"
        log_info "  bash scripts/install-toobamp.sh --build-from-source"
    fi
}

# Main installation flow
main() {
    print_header "MAP2 Audio Platform - Fedora 42 Installer"

    echo ""
    echo "This script will install MAP2 Audio Platform on Fedora Server 42"
    echo "Installation directory: $INSTALL_DIR"
    echo "Configuration directory: $CONFIG_DIR"
    echo ""
    read -p "Press Enter to continue or Ctrl+C to cancel..."
    echo ""

    # Pre-installation checks
    check_root
    check_fedora_version
    check_python
    check_disk_space
    check_network

    # Installation phases
    install_system_packages
    setup_user_permissions
    install_python_packages
    setup_directories
    initialize_config
    setup_systemd_services
    install_toobamp_plugins
    verify_installation

    # Post-installation
    print_post_install
}

# Run main installation
main

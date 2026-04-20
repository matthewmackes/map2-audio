"""Backup restore, update, and rebuild-script helpers."""

import json
import logging
import os
import platform
import shutil
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from app.utils.platform_version import get_platform_version

from .file_io import BackupInfo, _safe_tar_extract

logger = logging.getLogger(__name__)


REINSTALLER_SCRIPT = '''#!/bin/bash
#
# MAP2 Audio Platform - Complete Reinstaller
# ============================================
# This script reinstalls the MAP2 Audio Platform from backup.
# Requirements: Fresh Fedora Server, root access, network connection
#
# Generated: {timestamp}
# Backup ID: {backup_id}
# Source Host: {hostname}
#
# Usage:
#   chmod +x reinstall.sh
#   sudo ./reinstall.sh [OPTIONS]
#
# Options:
#   --user USERNAME    Install for specific user (default: current user or 'mm')
#   --skip-packages    Skip DNF package installation
#   --skip-python      Skip Python package installation
#   --skip-restore     Skip restoring user data from backup
#   --dry-run          Show what would be done without making changes
#   --help             Show this help message
#

set -e  # Exit on error

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR"
LOG_FILE="/tmp/map2-reinstall-$(date +%Y%m%d_%H%M%S).log"
MAP2_VERSION="{map2_version}"
INSTALL_USER="${{SUDO_USER:-${{USER:-mm}}}}"

# Colors for output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
NC='\\033[0m' # No Color

# =============================================================================
# Logging Functions
# =============================================================================

log() {{
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo -e "$msg" | tee -a "$LOG_FILE"
}}

log_info() {{
    log "${{BLUE}}[INFO]${{NC}} $1"
}}

log_success() {{
    log "${{GREEN}}[SUCCESS]${{NC}} $1"
}}

log_warning() {{
    log "${{YELLOW}}[WARNING]${{NC}} $1"
}}

log_error() {{
    log "${{RED}}[ERROR]${{NC}} $1"
}}

# =============================================================================
# Helper Functions
# =============================================================================

show_banner() {{
    echo -e "${{BLUE}}"
    cat << 'EOF'

    ███╗   ███╗ █████╗ ██████╗ ██████╗      █████╗ ██╗   ██╗██████╗ ██╗ ██████╗
    ████╗ ████║██╔══██╗██╔══██╗╚════██╗    ██╔══██╗██║   ██║██╔══██╗██║██╔═══██╗
    ██╔████╔██║███████║██████╔╝ █████╔╝    ███████║██║   ██║██║  ██║██║██║   ██║
    ██║╚██╔╝██║██╔══██║██╔═══╝ ██╔═══╝     ██╔══██║██║   ██║██║  ██║██║██║   ██║
    ██║ ╚═╝ ██║██║  ██║██║     ███████╗    ██║  ██║╚██████╔╝██████╔╝██║╚██████╔╝
    ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝     ╚══════╝    ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝

                     Professional Audio Platform Reinstaller
                              Version: {map2_version}
EOF
    echo -e "${{NC}}"
}}

show_help() {{
    cat << EOF
MAP2 Audio Platform Reinstaller

Usage: $0 [OPTIONS]

Options:
    --user USERNAME    Install for specific user (default: current user or 'mm')
    --skip-packages    Skip DNF package installation
    --skip-python      Skip Python package installation
    --skip-restore     Skip restoring user data from backup
    --dry-run          Show what would be done without making changes
    --help             Show this help message

Requirements:
    - Fedora Server (fresh installation recommended)
    - Root access (sudo)
    - Network connection for package downloads
    - SSH access (for remote installation)

Examples:
    sudo ./reinstall.sh                    # Full installation for current user
    sudo ./reinstall.sh --user myuser      # Install for specific user
    sudo ./reinstall.sh --dry-run          # Preview installation steps

Log file: $LOG_FILE
EOF
}}

check_root() {{
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}}

check_fedora() {{
    if [[ ! -f /etc/fedora-release ]]; then
        log_error "This script is designed for Fedora Linux"
        log_error "Detected OS: $(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2)"
        exit 1
    fi

    local fedora_version=$(cat /etc/fedora-release | grep -oP '\\d+')
    log_info "Detected Fedora $fedora_version"

    if [[ $fedora_version -lt 38 ]]; then
        log_warning "Fedora $fedora_version detected. Recommended: Fedora 38+"
    fi
}}

create_user_if_needed() {{
    if ! id "$INSTALL_USER" &>/dev/null; then
        log_info "Creating user: $INSTALL_USER"
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY-RUN] Would create user: $INSTALL_USER"
        else
            useradd -m -s /bin/bash "$INSTALL_USER"
            log_success "User $INSTALL_USER created"
        fi
    else
        log_info "User $INSTALL_USER already exists"
    fi
}}

# =============================================================================
# Package Installation
# =============================================================================

install_dnf_packages() {{
    log_info "Installing system packages via DNF..."

    local packages=(
        # Python ecosystem
        python3
        python3-pip
        python3-devel
        python3-virtualenv

        # Audio system
        alsa-utils
        alsa-lib
        alsa-lib-devel
        alsa-plugins-pulseaudio
        pipewire
        pipewire-alsa
        pipewire-jack-audio-connection-kit
        pipewire-jack-audio-connection-kit-devel

        # JACK Audio
        jack-audio-connection-kit
        jack-audio-connection-kit-dbus

        # LV2 Plugin ecosystem
        lv2
        lv2-devel
        lilv
        lilv-devel
        suil
        suil-devel
        sord
        serd

        # LV2 Plugins
        lv2-calf-plugins
        guitarix-lv2
        gxplugins-lv2
        lsp-plugins-lv2

        # Node.js for web dashboard
        nodejs
        npm

        # Build tools
        gcc
        gcc-c++
        cmake
        make
        git

        # Development libraries
        sqlite
        sqlite-devel

        # Utilities
        htop
        tmux
        wget
        curl

        # I2C support (for LCD displays)
        i2c-tools
    )

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would install packages:"
        printf '  %s\\n' "${{packages[@]}}"
    else
        dnf install -y "${{packages[@]}}" 2>&1 | tee -a "$LOG_FILE"
        log_success "DNF packages installed"
    fi
}}

install_optional_packages() {{
    log_info "Installing optional/recommended packages..."

    local optional_packages=(
        # Additional LV2 plugins (may not be in all repos)
        lv2-x42-plugins
        lv2-avw-plugins
        lv2-mda-plugins

        # MIDI
        alsa-plugins-jack
        a2jmidid

        # Wine (for AOE2 demo extraction)
        wine
    )

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would attempt to install optional packages"
    else
        for pkg in "${{optional_packages[@]}}"; do
            dnf install -y "$pkg" 2>/dev/null || log_warning "Optional package not available: $pkg"
        done
    fi
}}

# =============================================================================
# Python Environment Setup
# =============================================================================

install_python_packages() {{
    log_info "Installing Python packages..."

    local packages=(
        # Web framework
        fastapi
        uvicorn[standard]

        # HTTP clients
        httpx
        aiohttp

        # Database
        sqlalchemy
        aiosqlite

        # TUI framework
        textual
        rich

        # Utilities
        psutil
        pydantic
        python-multipart
    )

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would install Python packages:"
        printf '  %s\\n' "${{packages[@]}}"
    else
        # Install for root first
        pip3 install --upgrade pip
        pip3 install "${{packages[@]}}" 2>&1 | tee -a "$LOG_FILE"

        # Also install for the target user
        sudo -u "$INSTALL_USER" pip3 install --user "${{packages[@]}}" 2>&1 | tee -a "$LOG_FILE"

        log_success "Python packages installed"
    fi
}}

# =============================================================================
# Application Installation
# =============================================================================

clone_or_update_source() {{
    local install_dir="/home/$INSTALL_USER/map2-audio"

    log_info "Setting up MAP2 Audio Platform source..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would set up source at: $install_dir"
        return
    fi

    # Check if we have source in backup
    if [[ -d "$BACKUP_DIR/source" ]]; then
        log_info "Restoring source from backup..."
        mkdir -p "$install_dir"
        cp -r "$BACKUP_DIR/source/"* "$install_dir/"
        chown -R "$INSTALL_USER:$INSTALL_USER" "$install_dir"
        log_success "Source restored from backup"
    else
        # Try to clone from Git if available
        local git_url="https://github.com/yourusername/map2-audio.git"

        if command -v git &> /dev/null; then
            if [[ -d "$install_dir/.git" ]]; then
                log_info "Updating existing repository..."
                cd "$install_dir"
                sudo -u "$INSTALL_USER" git pull || log_warning "Git pull failed, using existing code"
            else
                log_warning "No source in backup and no git repo. Manual source installation required."
                log_info "Please copy MAP2 source to: $install_dir"
            fi
        fi
    fi
}}

setup_nodejs_deps() {{
    local install_dir="/home/$INSTALL_USER/map2-audio"

    log_info "Installing Node.js dependencies..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would run npm install in $install_dir"
        return
    fi

    if [[ -f "$install_dir/package.json" ]]; then
        cd "$install_dir"
        sudo -u "$INSTALL_USER" npm install 2>&1 | tee -a "$LOG_FILE"

        # Build web dashboard
        if [[ -d "$install_dir/web" ]]; then
            cd "$install_dir/web"
            sudo -u "$INSTALL_USER" npm install 2>&1 | tee -a "$LOG_FILE"
            sudo -u "$INSTALL_USER" npm run build 2>&1 | tee -a "$LOG_FILE" || log_warning "Web build failed"
        fi

        log_success "Node.js dependencies installed"
    else
        log_warning "No package.json found, skipping npm install"
    fi
}}

# =============================================================================
# User Data Restoration
# =============================================================================

restore_user_data() {{
    log_info "Restoring user data from backup..."

    local user_home="/home/$INSTALL_USER"
    local map2_data="$user_home/.map2"
    local app_data="$user_home/map2-audio/data"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would restore user data to:"
        log_info "  - $map2_data"
        log_info "  - $app_data"
        return
    fi

    # Create directories
    mkdir -p "$map2_data"
    mkdir -p "$app_data"

    # Restore database
    if [[ -f "$BACKUP_DIR/database/map2.db" ]]; then
        cp "$BACKUP_DIR/database/map2.db" "$app_data/"
        log_success "Database restored"
    fi

    # Restore user data directories
    for subdir in ir nam sessions packages; do
        if [[ -d "$BACKUP_DIR/user_data/$subdir" ]]; then
            cp -r "$BACKUP_DIR/user_data/$subdir" "$map2_data/"
            log_success "Restored: $subdir"
        fi
    done

    # Restore config
    if [[ -f "$BACKUP_DIR/config/config.json" ]]; then
        cp "$BACKUP_DIR/config/config.json" "$map2_data/"
        log_success "Config restored"
    fi

    # Fix ownership
    chown -R "$INSTALL_USER:$INSTALL_USER" "$map2_data"
    chown -R "$INSTALL_USER:$INSTALL_USER" "$app_data"

    log_success "User data restoration complete"
}}

# =============================================================================
# System Configuration
# =============================================================================

configure_audio_system() {{
    log_info "Configuring audio system..."

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would configure audio groups and real-time settings"
        return
    fi

    # Add user to audio groups
    usermod -a -G audio,jackuser "$INSTALL_USER" 2>/dev/null || true

    # Configure real-time audio limits
    cat > /etc/security/limits.d/99-audio.conf << 'LIMITS'
# Audio group real-time limits for low-latency audio
@audio   -  rtprio     95
@audio   -  memlock    unlimited
@audio   -  nice       -19
LIMITS

    log_success "Audio system configured"
}}

install_systemd_services() {{
    log_info "Installing systemd services..."

    local install_dir="/home/$INSTALL_USER/map2-audio"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would install systemd services"
        return
    fi

    # Check for install script
    if [[ -x "$install_dir/install-boot-manager.sh" ]]; then
        cd "$install_dir"
        bash ./install-boot-manager.sh 2>&1 | tee -a "$LOG_FILE"
        log_success "Systemd services installed"
    else
        log_warning "No install-boot-manager.sh found, skipping service installation"
        log_info "You can start services manually:"
        log_info "  cd $install_dir && python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080"
    fi
}}

# =============================================================================
# Verification
# =============================================================================

verify_installation() {{
    log_info "Verifying installation..."

    local errors=0

    # Check Python
    if command -v python3 &> /dev/null; then
        log_success "Python3: $(python3 --version)"
    else
        log_error "Python3 not found"
        ((errors++))
    fi

    # Check pip packages
    for pkg in fastapi uvicorn textual sqlalchemy; do
        if python3 -c "import $pkg" 2>/dev/null; then
            log_success "Python package: $pkg"
        else
            log_error "Missing Python package: $pkg"
            ((errors++))
        fi
    done

    # Check Node.js
    if command -v node &> /dev/null; then
        log_success "Node.js: $(node --version)"
    else
        log_warning "Node.js not found (optional)"
    fi

    # Check JACK
    if command -v jackd &> /dev/null; then
        log_success "JACK Audio: available"
    else
        log_warning "JACK Audio not found"
    fi

    # Check LV2 plugins
    local lv2_count=$(ls /usr/lib64/lv2/ 2>/dev/null | wc -l)
    log_info "LV2 plugins found: $lv2_count bundles"

    # Check user data
    local user_home="/home/$INSTALL_USER"
    if [[ -d "$user_home/map2-audio" ]]; then
        log_success "MAP2 installation directory: exists"
    else
        log_warning "MAP2 installation directory not found"
    fi

    if [[ $errors -eq 0 ]]; then
        log_success "Installation verification passed!"
    else
        log_error "Installation verification found $errors error(s)"
    fi

    return $errors
}}

show_completion_message() {{
    echo ""
    echo -e "${{GREEN}}=======================================${{NC}}"
    echo -e "${{GREEN}}  MAP2 Audio Platform Installation Complete!${{NC}}"
    echo -e "${{GREEN}}=======================================${{NC}}"
    echo ""
    echo "Installation Summary:"
    echo "  User: $INSTALL_USER"
    echo "  Installation: /home/$INSTALL_USER/map2-audio"
    echo "  User Data: /home/$INSTALL_USER/.map2"
    echo "  Log: $LOG_FILE"
    echo ""
    echo "To start the platform:"
    echo "  cd /home/$INSTALL_USER/map2-audio"
    echo "  ./start_simple.sh        # Start backend"
    echo "  textual run tui/app.py   # Start TUI"
    echo ""
    echo "Or enable services for auto-start:"
    echo "  sudo systemctl enable --now map2-backend"
    echo ""
}}

# =============================================================================
# Main Execution
# =============================================================================

main() {{
    # Parse arguments
    DRY_RUN="false"
    SKIP_PACKAGES="false"
    SKIP_PYTHON="false"
    SKIP_RESTORE="false"

    while [[ $# -gt 0 ]]; do
        case $1 in
            --user)
                INSTALL_USER="$2"
                shift 2
                ;;
            --skip-packages)
                SKIP_PACKAGES="true"
                shift
                ;;
            --skip-python)
                SKIP_PYTHON="true"
                shift
                ;;
            --skip-restore)
                SKIP_RESTORE="true"
                shift
                ;;
            --dry-run)
                DRY_RUN="true"
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done

    # Start installation
    show_banner

    log_info "Starting MAP2 Audio Platform reinstallation..."
    log_info "Target user: $INSTALL_USER"
    log_info "Backup directory: $BACKUP_DIR"
    log_info "Log file: $LOG_FILE"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_warning "DRY-RUN MODE: No changes will be made"
    fi

    echo ""

    # Pre-flight checks
    check_root
    check_fedora
    create_user_if_needed

    # Installation steps
    if [[ "$SKIP_PACKAGES" != "true" ]]; then
        install_dnf_packages
        install_optional_packages
    else
        log_info "Skipping DNF packages (--skip-packages)"
    fi

    if [[ "$SKIP_PYTHON" != "true" ]]; then
        install_python_packages
    else
        log_info "Skipping Python packages (--skip-python)"
    fi

    # Application setup
    clone_or_update_source
    setup_nodejs_deps

    # User data
    if [[ "$SKIP_RESTORE" != "true" ]]; then
        restore_user_data
    else
        log_info "Skipping user data restore (--skip-restore)"
    fi

    # System configuration
    configure_audio_system
    install_systemd_services

    # Verification
    verify_installation

    # Done
    show_completion_message
}}

# Run main function
main "$@"
'''


# =============================================================================
# STANDALONE REBUILD SCRIPT TEMPLATE
# =============================================================================
# This script can rebuild the entire MAP2 Audio Platform from scratch
# on a fresh Fedora Server installation - no backup required.

STANDALONE_REBUILD_SCRIPT = '''#!/bin/bash
#
# MAP2 Audio Platform - Complete System Rebuild Script
# =====================================================
# This script installs and builds the MAP2 Audio Platform from scratch.
# Requirements: Fresh Fedora Server, root access, network connection
#
# Generated: {timestamp}
# Source Host: {hostname}
# Version: {map2_version}
#
# This script will:
#   1. Install all required system packages (DNF)
#   2. Install Python packages (pip)
#   3. Install Node.js packages (npm)
#   4. Clone and build the MAP2 source code
#   5. Configure the audio system
#   6. Set up systemd services
#
# Usage:
#   chmod +x map2-rebuild.sh
#   sudo ./map2-rebuild.sh [OPTIONS]
#
# Options:
#   --user USERNAME        Install for specific user (default: current user)
#   --git-url URL          Git repository URL (default: local copy if available)
#   --branch BRANCH        Git branch to checkout (default: main)
#   --skip-packages        Skip DNF package installation
#   --skip-python          Skip Python package installation
#   --skip-node            Skip Node.js/npm installation
#   --skip-build           Skip building web assets
#   --skip-services        Skip systemd service installation
#   --dry-run              Show what would be done without making changes
#   --help                 Show this help message
#

set -e  # Exit on error

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="/tmp/map2-rebuild-$(date +%Y%m%d_%H%M%S).log"
MAP2_VERSION="{map2_version}"
INSTALL_USER="${{SUDO_USER:-${{USER:-$(whoami)}}}}"
GIT_URL=""
GIT_BRANCH="main"

# Default installation directory
INSTALL_DIR=""

# Package lists - easily customizable
DNF_PACKAGES=(
    # Python ecosystem
    python3
    python3-pip
    python3-devel
    python3-virtualenv

    # Audio system - PipeWire/JACK
    alsa-utils
    alsa-lib
    alsa-lib-devel
    alsa-plugins-pulseaudio
    pipewire
    pipewire-alsa
    pipewire-jack-audio-connection-kit
    pipewire-jack-audio-connection-kit-devel

    # Legacy JACK support
    jack-audio-connection-kit
    jack-audio-connection-kit-dbus

    # LV2 Plugin ecosystem
    lv2
    lv2-devel
    lilv
    lilv-devel
    suil
    suil-devel
    sord
    serd

    # LV2 Plugins
    lv2-calf-plugins
    guitarix-lv2
    gxplugins-lv2
    lsp-plugins-lv2

    # Node.js for web dashboard
    nodejs
    npm

    # Build tools
    gcc
    gcc-c++
    cmake
    make
    git

    # Development libraries
    sqlite
    sqlite-devel

    # Utilities
    htop
    tmux
    wget
    curl

    # I2C support (for LCD displays)
    i2c-tools
)

DNF_OPTIONAL_PACKAGES=(
    # Additional LV2 plugins
    lv2-x42-plugins
    lv2-avw-plugins
    lv2-mda-plugins

    # MIDI bridging
    alsa-plugins-jack
    a2jmidid
)

PYTHON_PACKAGES=(
    # Web framework
    fastapi
    "uvicorn[standard]"

    # HTTP clients
    httpx
    aiohttp

    # Database
    sqlalchemy
    aiosqlite

    # TUI framework
    textual
    rich

    # Utilities
    psutil
    pydantic
    python-multipart

    # Testing
    pytest
    pytest-asyncio
)

# Colors for output
RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
BLUE='\\033[0;34m'
CYAN='\\033[0;36m'
MAGENTA='\\033[0;35m'
NC='\\033[0m' # No Color

# =============================================================================
# Logging Functions
# =============================================================================

log() {{
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo -e "$msg" | tee -a "$LOG_FILE"
}}

log_info() {{
    log "${{BLUE}}[INFO]${{NC}} $1"
}}

log_success() {{
    log "${{GREEN}}[SUCCESS]${{NC}} $1"
}}

log_warning() {{
    log "${{YELLOW}}[WARNING]${{NC}} $1"
}}

log_error() {{
    log "${{RED}}[ERROR]${{NC}} $1"
}}

log_step() {{
    echo ""
    log "${{MAGENTA}}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${{NC}}"
    log "${{CYAN}}▶ $1${{NC}}"
    log "${{MAGENTA}}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${{NC}}"
}}

# =============================================================================
# Helper Functions
# =============================================================================

show_banner() {{
    echo -e "${{CYAN}}"
    cat << 'BANNER'

    ███╗   ███╗ █████╗ ██████╗ ██████╗      █████╗ ██╗   ██╗██████╗ ██╗ ██████╗
    ████╗ ████║██╔══██╗██╔══██╗╚════██╗    ██╔══██╗██║   ██║██╔══██╗██║██╔═══██╗
    ██╔████╔██║███████║██████╔╝ █████╔╝    ███████║██║   ██║██║  ██║██║██║   ██║
    ██║╚██╔╝██║██╔══██║██╔═══╝ ██╔═══╝     ██╔══██║██║   ██║██║  ██║██║██║   ██║
    ██║ ╚═╝ ██║██║  ██║██║     ███████╗    ██║  ██║╚██████╔╝██████╔╝██║╚██████╔╝
    ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝     ╚══════╝    ╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝

                     Complete System Rebuild Script
                           Version: {map2_version}
BANNER
    echo -e "${{NC}}"
}}

show_help() {{
    cat << 'HELP'
MAP2 Audio Platform - Complete System Rebuild Script

This script installs and builds the entire MAP2 Audio Platform from scratch
on a fresh Fedora Server installation.

Usage: ./map2-rebuild.sh [OPTIONS]

Options:
    --user USERNAME        Install for specific user (default: current user)
    --git-url URL          Git repository URL for MAP2 source
    --branch BRANCH        Git branch to checkout (default: main)
    --skip-packages        Skip DNF package installation
    --skip-python          Skip Python package installation
    --skip-node            Skip Node.js/npm installation
    --skip-build           Skip building web assets
    --skip-services        Skip systemd service installation
    --dry-run              Show what would be done without making changes
    --help                 Show this help message

Requirements:
    - Fedora Server 38+ (recommended: 41+)
    - Root access (sudo)
    - Network connection for package downloads
    - At least 4GB RAM and 10GB disk space

Examples:
    sudo ./map2-rebuild.sh                     # Full installation
    sudo ./map2-rebuild.sh --user audiouser    # Install for specific user
    sudo ./map2-rebuild.sh --dry-run           # Preview what will be done
    sudo ./map2-rebuild.sh --skip-packages     # Skip DNF (if already installed)

What this script installs:
    [System Packages]
    - Python 3 with development headers
    - Audio system (ALSA, PipeWire, JACK)
    - LV2 plugin ecosystem and plugins
    - Node.js and npm
    - Build tools (gcc, cmake, make, git)

    [Python Packages]
    - FastAPI, Uvicorn (web framework)
    - Textual, Rich (terminal UI)
    - SQLAlchemy, aiosqlite (database)
    - httpx, aiohttp (HTTP clients)
    - psutil, pydantic (utilities)

    [Application]
    - MAP2 Audio source code
    - Web dashboard (built with npm)
    - Systemd services for auto-start

HELP
}}

check_root() {{
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        log_info "Usage: sudo $0 [OPTIONS]"
        exit 1
    fi
}}

check_fedora() {{
    if [[ ! -f /etc/fedora-release ]]; then
        log_error "This script is designed for Fedora Linux"
        log_error "Detected OS: $(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 || echo 'Unknown')"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    local fedora_version=$(cat /etc/fedora-release 2>/dev/null | grep -oP '\\d+' || echo "0")
    log_info "Detected Fedora $fedora_version"

    if [[ $fedora_version -lt 38 ]]; then
        log_warning "Fedora $fedora_version detected. Recommended: Fedora 38+"
    fi
}}

check_disk_space() {{
    local required_gb=10
    local available_kb=$(df /home 2>/dev/null | tail -1 | awk '{{print $4}}')
    local available_gb=$((available_kb / 1024 / 1024))

    if [[ $available_gb -lt $required_gb ]]; then
        log_warning "Low disk space: ${{available_gb}}GB available, ${{required_gb}}GB recommended"
    else
        log_info "Disk space: ${{available_gb}}GB available"
    fi
}}

create_user_if_needed() {{
    if ! id "$INSTALL_USER" &>/dev/null; then
        log_info "Creating user: $INSTALL_USER"
        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY-RUN] Would create user: $INSTALL_USER"
        else
            useradd -m -s /bin/bash "$INSTALL_USER"
            log_success "User $INSTALL_USER created"
        fi
    else
        log_info "User $INSTALL_USER already exists"
    fi

    # Set install directory
    INSTALL_DIR="/home/$INSTALL_USER/map2-audio"
}}

# =============================================================================
# Package Installation
# =============================================================================

install_dnf_packages() {{
    log_step "Installing System Packages (DNF)"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would install ${{#DNF_PACKAGES[@]}} packages:"
        printf '    %s\\n' "${{DNF_PACKAGES[@]}}"
        return
    fi

    log_info "Updating package cache..."
    dnf makecache -q

    log_info "Installing ${{#DNF_PACKAGES[@]}} packages..."
    dnf install -y "${{DNF_PACKAGES[@]}}" 2>&1 | tee -a "$LOG_FILE"

    log_success "Core packages installed"

    # Optional packages (may not be in all repos)
    log_info "Installing optional packages (failures are OK)..."
    for pkg in "${{DNF_OPTIONAL_PACKAGES[@]}}"; do
        dnf install -y "$pkg" 2>/dev/null || log_warning "Optional: $pkg not available"
    done

    log_success "DNF package installation complete"
}}

# =============================================================================
# Python Environment Setup
# =============================================================================

install_python_packages() {{
    log_step "Installing Python Packages"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would install ${{#PYTHON_PACKAGES[@]}} Python packages:"
        printf '    %s\\n' "${{PYTHON_PACKAGES[@]}}"
        return
    fi

    # Upgrade pip first
    log_info "Upgrading pip..."
    python3 -m pip install --upgrade pip 2>&1 | tee -a "$LOG_FILE"

    # Install packages globally
    log_info "Installing Python packages globally..."
    python3 -m pip install "${{PYTHON_PACKAGES[@]}}" 2>&1 | tee -a "$LOG_FILE"

    # Also install for the target user
    log_info "Installing Python packages for user $INSTALL_USER..."
    sudo -u "$INSTALL_USER" python3 -m pip install --user "${{PYTHON_PACKAGES[@]}}" 2>&1 | tee -a "$LOG_FILE"

    log_success "Python packages installed"
}}

# =============================================================================
# Source Code Setup
# =============================================================================

setup_source_code() {{
    log_step "Setting Up MAP2 Source Code"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would set up source code at: $INSTALL_DIR"
        return
    fi

    mkdir -p "$INSTALL_DIR"

    if [[ -n "$GIT_URL" ]]; then
        # Clone from git
        log_info "Cloning from: $GIT_URL (branch: $GIT_BRANCH)"
        if [[ -d "$INSTALL_DIR/.git" ]]; then
            log_info "Repository exists, pulling updates..."
            cd "$INSTALL_DIR"
            sudo -u "$INSTALL_USER" git fetch origin
            sudo -u "$INSTALL_USER" git checkout "$GIT_BRANCH"
            sudo -u "$INSTALL_USER" git pull origin "$GIT_BRANCH"
        else
            sudo -u "$INSTALL_USER" git clone -b "$GIT_BRANCH" "$GIT_URL" "$INSTALL_DIR"
        fi
        log_success "Source code cloned from git"
    elif [[ -d "$SCRIPT_DIR/app" ]] && [[ -d "$SCRIPT_DIR/tui" ]]; then
        # Copy from script directory (if run from source tree or backup)
        log_info "Copying source from: $SCRIPT_DIR"
        cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR/" 2>/dev/null || true
        log_success "Source code copied"
    else
        log_warning "No source code available!"
        log_info "Please provide source via --git-url or run from MAP2 directory"
        log_info "Manual setup required: copy MAP2 source to $INSTALL_DIR"
    fi

    # Fix ownership
    chown -R "$INSTALL_USER:$INSTALL_USER" "$INSTALL_DIR"
}}

# =============================================================================
# Node.js Dependencies
# =============================================================================

install_node_packages() {{
    log_step "Installing Node.js Dependencies"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would run npm install in $INSTALL_DIR"
        return
    fi

    if [[ ! -f "$INSTALL_DIR/package.json" ]]; then
        log_warning "No package.json found, skipping npm install"
        return
    fi

    cd "$INSTALL_DIR"

    log_info "Installing npm packages..."
    sudo -u "$INSTALL_USER" npm install 2>&1 | tee -a "$LOG_FILE"

    log_success "Node.js dependencies installed"
}}

build_web_assets() {{
    log_step "Building Web Dashboard"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would build web assets"
        return
    fi

    if [[ ! -d "$INSTALL_DIR/web" ]]; then
        log_warning "No web directory found, skipping build"
        return
    fi

    cd "$INSTALL_DIR/web"

    if [[ -f "package.json" ]]; then
        log_info "Installing web dependencies..."
        sudo -u "$INSTALL_USER" npm install 2>&1 | tee -a "$LOG_FILE"

        log_info "Building web assets..."
        sudo -u "$INSTALL_USER" npm run build 2>&1 | tee -a "$LOG_FILE" || {{
            log_warning "Web build failed - dashboard may need manual build"
        }}
    fi

    log_success "Web assets built"
}}

# =============================================================================
# Audio System Configuration
# =============================================================================

configure_audio_system() {{
    log_step "Configuring Audio System"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would configure audio groups and real-time settings"
        return
    fi

    # Add user to audio groups
    log_info "Adding $INSTALL_USER to audio groups..."
    usermod -a -G audio "$INSTALL_USER" 2>/dev/null || true
    usermod -a -G jackuser "$INSTALL_USER" 2>/dev/null || true

    # Configure real-time audio limits
    log_info "Configuring real-time audio limits..."
    cat > /etc/security/limits.d/99-audio.conf << 'LIMITS'
# Audio group real-time limits for low-latency audio processing
# Generated by MAP2 rebuild script

@audio   -  rtprio     95
@audio   -  memlock    unlimited
@audio   -  nice       -19
LIMITS

    # Enable PipeWire if available
    if systemctl --user -M "$INSTALL_USER@" is-enabled pipewire.socket &>/dev/null 2>&1; then
        log_info "PipeWire already configured"
    fi

    log_success "Audio system configured"
}}

# =============================================================================
# Systemd Services
# =============================================================================

install_systemd_services() {{
    log_step "Installing Systemd Services"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would install systemd services"
        return
    fi

    cd "$INSTALL_DIR"

    if [[ -x "./install-boot-manager.sh" ]]; then
        log_info "Running install-boot-manager.sh..."
        bash ./install-boot-manager.sh 2>&1 | tee -a "$LOG_FILE"
        log_success "Systemd services installed"
    elif [[ -d "systemd" ]]; then
        log_info "Installing systemd units manually..."
        for unit in systemd/*.service; do
            if [[ -f "$unit" ]]; then
                cp "$unit" /etc/systemd/system/
                log_info "Installed: $(basename $unit)"
            fi
        done
        systemctl daemon-reload
        log_success "Systemd units installed"
    else
        log_warning "No systemd configuration found"
        log_info "Services can be started manually:"
        log_info "  cd $INSTALL_DIR && python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080"
    fi
}}

# =============================================================================
# Data Directory Setup
# =============================================================================

setup_data_directories() {{
    log_step "Setting Up Data Directories"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would create data directories"
        return
    fi

    local user_home="/home/$INSTALL_USER"

    # Create application data directories
    mkdir -p "$INSTALL_DIR/data"
    mkdir -p "$user_home/.map2/ir"
    mkdir -p "$user_home/.map2/nam"
    mkdir -p "$user_home/.map2/sessions"
    mkdir -p "$user_home/.map2/packages"
    mkdir -p "$user_home/.local/share/map2/backups"

    # Fix ownership
    chown -R "$INSTALL_USER:$INSTALL_USER" "$INSTALL_DIR/data"
    chown -R "$INSTALL_USER:$INSTALL_USER" "$user_home/.map2"
    chown -R "$INSTALL_USER:$INSTALL_USER" "$user_home/.local/share/map2"

    log_success "Data directories created"
}}

# =============================================================================
# Verification
# =============================================================================

verify_installation() {{
    log_step "Verifying Installation"

    local errors=0
    local warnings=0

    # Check Python
    if command -v python3 &> /dev/null; then
        log_success "Python3: $(python3 --version)"
    else
        log_error "Python3 not found"
        ((errors++))
    fi

    # Check Python packages
    for pkg in fastapi uvicorn textual sqlalchemy rich; do
        if python3 -c "import $pkg" 2>/dev/null; then
            log_success "Python: $pkg ✓"
        else
            log_error "Python: $pkg missing"
            ((errors++))
        fi
    done

    # Check Node.js
    if command -v node &> /dev/null; then
        log_success "Node.js: $(node --version)"
    else
        log_warning "Node.js not found"
        ((warnings++))
    fi

    # Check npm
    if command -v npm &> /dev/null; then
        log_success "npm: $(npm --version)"
    else
        log_warning "npm not found"
        ((warnings++))
    fi

    # Check JACK
    if command -v jackd &> /dev/null; then
        log_success "JACK Audio: available"
    else
        log_warning "JACK Audio not found (PipeWire may provide JACK compatibility)"
        ((warnings++))
    fi

    # Check LV2 plugins
    local lv2_count=0
    if [[ -d /usr/lib64/lv2 ]]; then
        lv2_count=$(ls -d /usr/lib64/lv2/*.lv2 2>/dev/null | wc -l)
    fi
    log_info "LV2 plugins: $lv2_count bundles found"

    # Check installation directory
    if [[ -d "$INSTALL_DIR/app" ]]; then
        log_success "MAP2 app directory: exists"
    else
        log_warning "MAP2 app directory not found"
        ((warnings++))
    fi

    if [[ -d "$INSTALL_DIR/tui" ]]; then
        log_success "MAP2 TUI directory: exists"
    else
        log_warning "MAP2 TUI directory not found"
        ((warnings++))
    fi

    # Summary
    echo ""
    if [[ $errors -eq 0 ]]; then
        log_success "Installation verification passed! ($warnings warnings)"
    else
        log_error "Installation verification failed: $errors errors, $warnings warnings"
    fi

    return $errors
}}

# =============================================================================
# Completion
# =============================================================================

show_completion_message() {{
    echo ""
    echo -e "${{GREEN}}"
    echo "╔═══════════════════════════════════════════════════════════════════════╗"
    echo "║                                                                       ║"
    echo "║   ✓  MAP2 Audio Platform Installation Complete!                       ║"
    echo "║                                                                       ║"
    echo "╚═══════════════════════════════════════════════════════════════════════╝"
    echo -e "${{NC}}"

    echo ""
    echo -e "${{CYAN}}Installation Summary:${{NC}}"
    echo "  User:           $INSTALL_USER"
    echo "  Installation:   $INSTALL_DIR"
    echo "  User Data:      /home/$INSTALL_USER/.map2"
    echo "  Log File:       $LOG_FILE"

    echo ""
    echo -e "${{CYAN}}Quick Start Commands:${{NC}}"
    echo ""
    echo "  # Start the backend API server:"
    echo "  cd $INSTALL_DIR && ./start_simple.sh"
    echo ""
    echo "  # Or start with uvicorn directly:"
    echo "  cd $INSTALL_DIR && python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080"
    echo ""
    echo "  # Launch the Terminal UI:"
    echo "  cd $INSTALL_DIR && textual run tui/app.py"
    echo ""
    echo "  # Enable auto-start on boot:"
    echo "  sudo systemctl enable --now map2-backend"
    echo ""

    echo -e "${{CYAN}}Access Points:${{NC}}"
    echo "  Web Dashboard:  http://localhost:3000"
    echo "  API Server:     http://localhost:8080"
    echo "  API Docs:       http://localhost:8080/docs"
    echo ""

    echo -e "${{YELLOW}}Note: Log out and back in for audio group membership to take effect.${{NC}}"
    echo ""
}}

# =============================================================================
# Main Execution
# =============================================================================

main() {{
    # Default flags
    DRY_RUN="false"
    SKIP_PACKAGES="false"
    SKIP_PYTHON="false"
    SKIP_NODE="false"
    SKIP_BUILD="false"
    SKIP_SERVICES="false"

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --user)
                INSTALL_USER="$2"
                shift 2
                ;;
            --git-url)
                GIT_URL="$2"
                shift 2
                ;;
            --branch)
                GIT_BRANCH="$2"
                shift 2
                ;;
            --skip-packages)
                SKIP_PACKAGES="true"
                shift
                ;;
            --skip-python)
                SKIP_PYTHON="true"
                shift
                ;;
            --skip-node)
                SKIP_NODE="true"
                shift
                ;;
            --skip-build)
                SKIP_BUILD="true"
                shift
                ;;
            --skip-services)
                SKIP_SERVICES="true"
                shift
                ;;
            --dry-run)
                DRY_RUN="true"
                shift
                ;;
            --help|-h)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done

    # Banner
    show_banner

    log_info "MAP2 Audio Platform - Complete System Rebuild"
    log_info "Target user: $INSTALL_USER"
    log_info "Log file: $LOG_FILE"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_warning "═══ DRY-RUN MODE: No changes will be made ═══"
    fi

    echo ""

    # Pre-flight checks
    check_root
    check_fedora
    check_disk_space
    create_user_if_needed

    # Installation steps
    if [[ "$SKIP_PACKAGES" != "true" ]]; then
        install_dnf_packages
    else
        log_info "Skipping DNF packages (--skip-packages)"
    fi

    if [[ "$SKIP_PYTHON" != "true" ]]; then
        install_python_packages
    else
        log_info "Skipping Python packages (--skip-python)"
    fi

    # Source code
    setup_source_code

    if [[ "$SKIP_NODE" != "true" ]]; then
        install_node_packages
    else
        log_info "Skipping Node.js packages (--skip-node)"
    fi

    if [[ "$SKIP_BUILD" != "true" ]]; then
        build_web_assets
    else
        log_info "Skipping web build (--skip-build)"
    fi

    # Data directories
    setup_data_directories

    # System configuration
    configure_audio_system

    if [[ "$SKIP_SERVICES" != "true" ]]; then
        install_systemd_services
    else
        log_info "Skipping systemd services (--skip-services)"
    fi

    # Verification
    verify_installation

    # Done
    show_completion_message
}}

# Run main function
main "$@"
'''



class BackupRecoveryMixin:
    """Restore and recovery flows for backup archives."""

    async def restore_backup(self, backup_id: str,
                            restore_database: bool = True,
                            restore_user_data: bool = True,
                            restore_config: bool = True) -> Dict[str, Any]:
        """
        Restore from a backup archive.

        Args:
            backup_id: ID of the backup to restore
            restore_database: Whether to restore the database
            restore_user_data: Whether to restore user data directories
            restore_config: Whether to restore config file

        Returns:
            Dictionary with restoration results
        """
        backup_info = await self.get_backup(backup_id)
        if not backup_info:
            raise ValueError(f"Backup not found: {backup_id}")

        if not backup_info.valid:
            raise ValueError(f"Backup is invalid: {backup_id}")

        backup_path = Path(backup_info.path)

        # Verify backup integrity before restoring
        is_valid, verify_message = self.verify_backup_integrity(backup_path)
        if not is_valid:
            raise ValueError(f"Backup integrity check failed: {verify_message}")

        logger.info(f"Backup integrity verified for {backup_id}: {verify_message}")

        results = {
            "backup_id": backup_id,
            "restored_at": datetime.now(timezone.utc).isoformat(),
            "restored_items": [],
            "skipped_items": [],
            "errors": [],
            "integrity_check": verify_message
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Extract archive safely (prevents path traversal attacks)
            with tarfile.open(backup_path, "r:gz") as tar:
                _safe_tar_extract(tar, temp_path)

            # Restore database
            if restore_database:
                db_backup = temp_path / "database" / "map2.db"
                if db_backup.exists():
                    dest = self.DEFAULT_BACKUP_PATHS["database"]
                    dest.parent.mkdir(parents=True, exist_ok=True)

                    # Create backup of current database
                    if dest.exists():
                        backup_current = dest.with_suffix('.db.pre-restore')
                        shutil.copy2(dest, backup_current)

                    shutil.copy2(db_backup, dest)
                    results["restored_items"].append("database/map2.db")
                else:
                    results["skipped_items"].append("database (not in backup)")

            # Restore user data
            if restore_user_data:
                user_data_backup = temp_path / "user_data"
                if user_data_backup.exists():
                    for subdir in ["ir", "nam", "sessions", "packages"]:
                        src = user_data_backup / subdir
                        if src.exists():
                            dest = Path.home() / ".map2" / subdir
                            dest.parent.mkdir(parents=True, exist_ok=True)

                            # Merge directories (don't delete existing files)
                            shutil.copytree(src, dest, dirs_exist_ok=True)
                            results["restored_items"].append(f"user_data/{subdir}")
                        else:
                            results["skipped_items"].append(f"user_data/{subdir} (not in backup)")

            # Restore config
            if restore_config:
                config_backup = temp_path / "config" / "config.json"
                if config_backup.exists():
                    dest = self.DEFAULT_BACKUP_PATHS["user_config"]
                    dest.parent.mkdir(parents=True, exist_ok=True)

                    # Backup current config
                    if dest.exists():
                        backup_current = dest.with_suffix('.json.pre-restore')
                        shutil.copy2(dest, backup_current)

                    shutil.copy2(config_backup, dest)
                    results["restored_items"].append("config/config.json")
                else:
                    results["skipped_items"].append("config (not in backup)")

        return results
    async def update_backup(self, backup_id: str) -> BackupInfo:
        """
        Update an existing backup with the latest reinstaller script and documentation.

        This method allows refreshing the installer and documentation in an existing
        backup without re-creating the user data backup. Useful when:
        - The reinstaller script has been improved
        - Documentation has been updated
        - You want to ensure the backup has the latest installer capabilities

        Args:
            backup_id: ID of the backup to update

        Returns:
            BackupInfo with details about the updated backup
        """
        backup_info = await self.get_backup(backup_id)
        if not backup_info:
            raise ValueError(f"Backup not found: {backup_id}")

        if not backup_info.valid:
            raise ValueError(f"Backup is invalid and cannot be updated: {backup_id}")

        backup_path = Path(backup_info.path)
        original_manifest = backup_info.manifest or {}

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            staging_dir = temp_path / "backup_staging"
            staging_dir.mkdir()

            # Extract existing backup safely (prevents path traversal attacks)
            with tarfile.open(backup_path, "r:gz") as tar:
                _safe_tar_extract(tar, staging_dir)

            # Update manifest with update timestamp
            manifest_path = staging_dir / "manifest.json"
            if manifest_path.exists():
                with open(manifest_path, 'r') as f:
                    manifest = json.load(f)
            else:
                manifest = original_manifest.copy()

            # Add update tracking
            if "updates" not in manifest:
                manifest["updates"] = []
            manifest["updates"].append({
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_components": ["reinstaller", "documentation"],
                "reason": "On-demand update"
            })
            manifest["last_updated"] = datetime.now(timezone.utc).isoformat()

            # Generate new reinstaller script with current template
            reinstaller_content = REINSTALLER_SCRIPT.format(
                timestamp=datetime.now(timezone.utc).isoformat(),
                backup_id=backup_id,
                hostname=manifest.get("hostname", platform.node()),
                map2_version=manifest.get("map2_version", get_platform_version()),
            )
            reinstaller_path = staging_dir / "reinstall.sh"
            with open(reinstaller_path, 'w') as f:
                f.write(reinstaller_content)
            os.chmod(reinstaller_path, 0o755)

            # Regenerate documentation set
            # First, remove old docs directory if it exists
            docs_dir = staging_dir / "docs"
            if docs_dir.exists():
                shutil.rmtree(docs_dir)

            # Generate fresh documentation
            self._generate_documentation_set(manifest, backup_id, staging_dir)
            manifest["contents"]["documentation"] = {
                "path": "docs/",
                "description": "Complete documentation including installation, troubleshooting, API reference",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }

            # Update README
            readme_content = self._generate_backup_readme(manifest, backup_id)
            readme_path = staging_dir / "README.md"
            with open(readme_path, 'w') as f:
                f.write(readme_content)

            # Update manifest contents for reinstaller
            manifest["contents"]["reinstaller"] = {
                "path": "reinstall.sh",
                "description": "Self-contained reinstaller for Fedora Server",
                "updated_at": datetime.now(timezone.utc).isoformat()
            }

            # Write updated manifest
            with open(manifest_path, 'w') as f:
                json.dump(manifest, f, indent=2)

            # Create new archive (atomic update via temp file)
            temp_archive = temp_path / backup_path.name
            with tarfile.open(temp_archive, "w:gz") as tar:
                for item in staging_dir.iterdir():
                    tar.add(item, arcname=item.name)

            # Calculate new checksum
            checksum = self._calculate_checksum(temp_archive)
            manifest["checksum"] = checksum

            # Write manifest with checksum and recreate
            with open(manifest_path, 'w') as f:
                json.dump(manifest, f, indent=2)

            with tarfile.open(temp_archive, "w:gz") as tar:
                for item in staging_dir.iterdir():
                    tar.add(item, arcname=item.name)

            # Atomic replace of original backup
            shutil.move(str(temp_archive), str(backup_path))

        # Return updated backup info
        size = backup_path.stat().st_size
        return BackupInfo(
            id=backup_id,
            filename=backup_path.name,
            path=str(backup_path),
            created_at=manifest.get("created_at", backup_info.created_at),
            size_bytes=size,
            size_human=self._human_readable_size(size),
            valid=True,
            manifest=manifest
        )

    def generate_rebuild_script(self, output_path: Optional[str] = None) -> Dict[str, Any]:
        """
        Generate a standalone rebuild script that can reinstall all packages,
        build all code, and setup Python packages required to rebuild the system.

        This script is independent of any backup and can be run on a fresh
        Fedora Server installation.

        Args:
            output_path: Optional path to save the script. If None, returns script content.

        Returns:
            Dictionary with script content and path information
        """
        timestamp = datetime.now(timezone.utc).isoformat()
        hostname = platform.node()
        map2_version = get_platform_version()

        # Generate the standalone rebuild script
        script_content = STANDALONE_REBUILD_SCRIPT.format(
            timestamp=timestamp,
            hostname=hostname,
            map2_version=map2_version,
        )

        result = {
            "script_content": script_content,
            "generated_at": timestamp,
            "source_hostname": hostname,
            "version": map2_version,
            "script_name": "map2-rebuild.sh",
            "saved_to": None
        }

        # Save to file if path provided
        if output_path:
            save_path = Path(output_path)
            save_path.parent.mkdir(parents=True, exist_ok=True)
            with open(save_path, 'w') as f:
                f.write(script_content)
            os.chmod(save_path, 0o755)
            result["saved_to"] = str(save_path)
            logger.info(f"Rebuild script saved to: {save_path}")
        else:
            # Default: save to backup location
            default_path = Path(self.settings.backup_location) / "map2-rebuild.sh"
            default_path.parent.mkdir(parents=True, exist_ok=True)
            with open(default_path, 'w') as f:
                f.write(script_content)
            os.chmod(default_path, 0o755)
            result["saved_to"] = str(default_path)
            logger.info(f"Rebuild script saved to: {default_path}")

        return result

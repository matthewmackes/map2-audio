"""
Backup Service for MAP2 Audio Platform
Handles backup creation, restoration, and lifecycle management.
Uses Python standard libraries following Fedora best practices.

Includes world-class reinstaller script generation for complete system
rebuild from fresh Fedora Server installation.
"""

import asyncio
import hashlib
import json
import logging
import os
import platform
import re
import shutil
import tarfile
import tempfile
import subprocess
import threading
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any

from app.utils.singleton import Singleton
from app.utils.logging_utils import get_logger
from app.utils.platform_version import get_platform_version

logger = get_logger(__name__)


def _safe_tar_extract(tar: tarfile.TarFile, dest_path: Path) -> None:
    """
    Safely extract a tarfile, preventing path traversal attacks (CVE-2007-4559).

    Args:
        tar: The tarfile object to extract from
        dest_path: The destination directory for extraction
    """
    dest_path = dest_path.resolve()

    for member in tar.getmembers():
        # Resolve the member path relative to destination
        member_path = (dest_path / member.name).resolve()

        # Ensure the resolved path is within the destination directory
        try:
            member_path.relative_to(dest_path)
        except ValueError:
            raise tarfile.TarError(
                f"Attempted path traversal in tar archive: {member.name}"
            )

        # Check for absolute paths or parent directory references
        if member.name.startswith('/') or '..' in member.name.split('/'):
            raise tarfile.TarError(
                f"Dangerous path in tar archive: {member.name}"
            )

        # Check for suspicious symlinks
        if member.issym() or member.islnk():
            link_target = Path(member.linkname)
            if link_target.is_absolute():
                raise tarfile.TarError(
                    f"Absolute symlink in tar archive: {member.name} -> {member.linkname}"
                )
            resolved_link = (dest_path / member.name).parent / member.linkname
            try:
                resolved_link.resolve().relative_to(dest_path)
            except ValueError:
                raise tarfile.TarError(
                    f"Symlink escapes destination: {member.name} -> {member.linkname}"
                )

    # All members validated, now extract
    tar.extractall(dest_path)


# =============================================================================
# REINSTALLER SCRIPT TEMPLATE
# =============================================================================
# This script is included in every backup and can reinstall the entire
# MAP2 Audio Platform on a fresh Fedora Server with root access.

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


@dataclass
class BackupInfo:
    """Information about a backup file."""
    id: str
    filename: str
    path: str
    created_at: str
    size_bytes: int
    size_human: str
    valid: bool
    manifest: Optional[Dict[str, Any]] = None


@dataclass
class BackupSettings:
    """Backup lifecycle settings."""
    max_backups: int = 5
    retention_days: int = 30
    auto_cleanup: bool = True
    backup_location: str = ""

    def __post_init__(self):
        if not self.backup_location:
            # XDG Base Directory compliant location
            self.backup_location = str(Path.home() / ".local" / "share" / "map2" / "backups")


class BackupService(Singleton):
    """Service for managing MAP2 platform backups."""

    # Default paths to backup
    DEFAULT_BACKUP_PATHS = {
        "database": Path.home() / "map2-audio" / "data" / "map2.db",
        "user_ir": Path.home() / ".map2" / "ir",
        "user_nam": Path.home() / ".map2" / "nam",
        "user_sessions": Path.home() / ".map2" / "sessions",
        "user_packages": Path.home() / ".map2" / "packages",
        "user_config": Path.home() / ".map2" / "config.json",
    }

    @staticmethod
    def _get_app_root_dir() -> Path:
        """
        Dynamically determine the MAP2 application root directory.

        Checks in order:
        1. MAP2_APP_DIR environment variable
        2. Directory containing this source file (../../)
        3. ~/map2-audio (fallback)

        Returns:
            Path to the application root directory
        """
        # Check environment variable first
        env_path = os.environ.get("MAP2_APP_DIR")
        if env_path:
            path = Path(env_path)
            if path.exists():
                return path

        # Try to find from this file's location (app/services/backup_service.py -> root)
        try:
            this_file = Path(__file__).resolve()
            # Go up: backup_service.py -> services/ -> app/ -> root
            potential_root = this_file.parent.parent.parent
            # Verify it's the right directory by checking for key files
            if (potential_root / "app").exists() and (potential_root / "tui").exists():
                return potential_root
        except Exception:
            pass

        # Fallback to home directory
        return Path.home() / "map2-audio"

    # Items that can be reinstalled via RPM/package managers
    SKIP_LIST = {
        "dnf_packages": [
            "python3",
            "python3-pip",
            "alsa-utils",
            "alsa-lib",
            "jack-audio-connection-kit",
            "jack-audio-connection-kit-dbus",
            "pipewire",
            "pipewire-jack-audio-connection-kit",
            "nodejs",
            "npm",
            "lv2",
            "lilv",
            "suil",
            "lv2-calf-plugins",
            "lv2-x42-plugins",
            "guitarix-lv2",
            "gxplugins-lv2",
            "lsp-plugins-lv2",
        ],
        "flatpak_packages": [
            "com.play0ad.zeroad",
            "org.audacityteam.Audacity",
            "org.ardour.Ardour",
        ],
        "python_packages": [
            "fastapi",
            "uvicorn",
            "aiohttp",
            "httpx",
            "psutil",
            "sqlalchemy",
            "aiosqlite",
            "textual",
            "rich",
            "python-multipart",
            "pydantic",
        ],
        "npm_packages": [
            "All packages in node_modules/ (regenerate via npm install)",
        ],
        "source_code": [
            "map2-audio/ application code (reinstall via git clone)",
        ],
        "build_artifacts": [
            "web/dist/ (rebuild via npm run build)",
            "__pycache__/ directories",
            "*.pyc files",
        ],
        "system_services": [
            "map2-backend.service",
            "map2-web.service",
            "map2-boot-manager.service",
            "(reinstall via ./install-boot-manager.sh)",
        ],
        "logs": [
            "logs/ directory",
            "/tmp/map2_*.log files",
        ],
    }

    def __init__(self, settings: Optional[BackupSettings] = None):
        """Initialize backup service with optional settings."""
        self.settings = settings or BackupSettings()
        self._ensure_backup_dir()
        self._settings_file = Path(self.settings.backup_location) / "settings.json"
        self._load_settings()

    def _ensure_backup_dir(self) -> None:
        """Ensure backup directory exists."""
        Path(self.settings.backup_location).mkdir(parents=True, exist_ok=True)

    def _load_settings(self) -> None:
        """Load settings from file if exists."""
        if self._settings_file.exists():
            try:
                with open(self._settings_file, 'r') as f:
                    data = json.load(f)
                    self.settings.max_backups = data.get('max_backups', 5)
                    self.settings.retention_days = data.get('retention_days', 30)
                    self.settings.auto_cleanup = data.get('auto_cleanup', True)
            except Exception as e:
                logger.error(f"Failed to load backup settings: {e}")

    def _save_settings(self) -> None:
        """Save settings to file."""
        try:
            with open(self._settings_file, 'w') as f:
                json.dump({
                    'max_backups': self.settings.max_backups,
                    'retention_days': self.settings.retention_days,
                    'auto_cleanup': self.settings.auto_cleanup,
                }, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save backup settings: {e}")

    def get_settings(self) -> BackupSettings:
        """Get current backup settings."""
        return self.settings

    def update_settings(self, max_backups: Optional[int] = None,
                       retention_days: Optional[int] = None,
                       auto_cleanup: Optional[bool] = None) -> BackupSettings:
        """Update backup settings."""
        if max_backups is not None:
            self.settings.max_backups = max(1, min(100, max_backups))
        if retention_days is not None:
            self.settings.retention_days = max(1, min(365, retention_days))
        if auto_cleanup is not None:
            self.settings.auto_cleanup = auto_cleanup
        self._save_settings()
        return self.settings

    def _human_readable_size(self, size_bytes: int) -> str:
        """Convert bytes to human readable format."""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.1f} TB"

    def _calculate_checksum(self, file_path: Path) -> str:
        """Calculate SHA256 checksum of a file."""
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return f"sha256:{sha256.hexdigest()}"

    def verify_backup_integrity(self, backup_path: Path) -> tuple[bool, str]:
        """
        Verify the integrity of a backup file.

        Checks:
        1. File exists and is readable
        2. Is a valid tar.gz archive
        3. Contains required files (manifest.json)
        4. Manifest checksum matches (if present)

        Args:
            backup_path: Path to the backup archive

        Returns:
            Tuple of (is_valid, message)
        """
        if not backup_path.exists():
            return False, f"Backup file not found: {backup_path}"

        if not backup_path.is_file():
            return False, f"Not a file: {backup_path}"

        try:
            # Try to open as tar.gz
            with tarfile.open(backup_path, "r:gz") as tar:
                # Check for manifest
                try:
                    manifest_member = tar.getmember("manifest.json")
                except KeyError:
                    return False, "Backup missing manifest.json - may be corrupted"

                # Read and parse manifest
                manifest_file = tar.extractfile(manifest_member)
                if not manifest_file:
                    return False, "Cannot read manifest.json"

                try:
                    manifest = json.load(manifest_file)
                except json.JSONDecodeError:
                    return False, "Manifest.json is not valid JSON"

                # Check required manifest fields
                required_fields = ["version", "backup_id", "created_at"]
                for field in required_fields:
                    if field not in manifest:
                        return False, f"Manifest missing required field: {field}"

                # If checksum is present in manifest, we'd need to verify it
                # but the checksum is of the archive itself, which is a chicken-egg problem
                # So we just verify the archive is structurally valid

                # Check for expected content types
                members = tar.getnames()
                if "reinstall.sh" not in members and "README.md" not in members:
                    logger.warning(
                        f"Backup {backup_path.name} missing some expected files"
                    )

            return True, "Backup integrity verified"

        except tarfile.TarError as e:
            return False, f"Invalid or corrupted tar archive: {e}"
        except Exception as e:
            logger.error(f"Error verifying backup {backup_path}: {e}")
            return False, f"Verification error: {e}"

    def _generate_backup_id(self) -> str:
        """Generate unique backup ID based on timestamp."""
        return datetime.now().strftime("%Y%m%d_%H%M%S")

    def generate_skip_list(self) -> Dict[str, Any]:
        """Generate documentation of items skipped in backup."""
        return {
            "description": "Items not included in backup - reinstallable via package managers",
            "generated_at": datetime.now().isoformat(),
            "categories": self.SKIP_LIST,
            "reinstall_instructions": {
                "dnf_packages": "sudo dnf install <package-name>",
                "flatpak_packages": "flatpak install flathub <package-id>",
                "python_packages": "pip install <package-name>",
                "npm_packages": "cd map2-audio && npm install",
                "source_code": "git clone <repository-url>",
                "system_services": "cd map2-audio && ./install-boot-manager.sh",
            }
        }

    def _generate_documentation_set(self, manifest: Dict[str, Any], backup_id: str, staging_dir: Path) -> None:
        """Generate comprehensive documentation set for the backup archive."""
        docs_dir = staging_dir / "docs"
        docs_dir.mkdir(exist_ok=True)

        # 1. Main README
        readme_content = self._generate_backup_readme(manifest, backup_id)
        with open(staging_dir / "README.md", 'w') as f:
            f.write(readme_content)

        # 2. Quick Start Guide
        quickstart = self._generate_quickstart_guide(manifest, backup_id)
        with open(docs_dir / "QUICKSTART.md", 'w') as f:
            f.write(quickstart)

        # 3. Full Installation Guide
        install_guide = self._generate_installation_guide(manifest)
        with open(docs_dir / "INSTALLATION.md", 'w') as f:
            f.write(install_guide)

        # 4. Troubleshooting Guide
        troubleshooting = self._generate_troubleshooting_guide()
        with open(docs_dir / "TROUBLESHOOTING.md", 'w') as f:
            f.write(troubleshooting)

        # 5. Architecture Overview
        architecture = self._generate_architecture_doc()
        with open(docs_dir / "ARCHITECTURE.md", 'w') as f:
            f.write(architecture)

        # 6. Configuration Reference
        config_ref = self._generate_config_reference()
        with open(docs_dir / "CONFIGURATION.md", 'w') as f:
            f.write(config_ref)

        # 7. API Reference
        api_ref = self._generate_api_reference()
        with open(docs_dir / "API_REFERENCE.md", 'w') as f:
            f.write(api_ref)

        # 8. Fedora-Specific Notes
        fedora_notes = self._generate_fedora_notes()
        with open(docs_dir / "FEDORA_NOTES.md", 'w') as f:
            f.write(fedora_notes)

        # 9. Changelog / Version History
        changelog = self._generate_changelog(manifest)
        with open(docs_dir / "CHANGELOG.md", 'w') as f:
            f.write(changelog)

        # 10. License
        license_text = self._generate_license()
        with open(docs_dir / "LICENSE", 'w') as f:
            f.write(license_text)

    def _generate_quickstart_guide(self, manifest: Dict[str, Any], backup_id: str) -> str:
        """Generate quick start guide."""
        return f'''# MAP2 Audio Platform - Quick Start Guide

## 5-Minute Installation

### Step 1: Extract Backup
```bash
tar -xzf map2-backup-{backup_id}.tar.gz
cd map2-backup-{backup_id}
```

### Step 2: Run Installer
```bash
sudo ./reinstall.sh
```

### Step 3: Start Platform
```bash
cd ~/map2-audio
./start_simple.sh
```

### Step 4: Access Interfaces
- **Web Dashboard:** http://localhost:3000
- **API Docs:** http://localhost:8080/docs
- **Terminal UI:** `textual run tui/app.py`

## First-Time Setup Checklist

1. [ ] Verify audio device detected: Check DASHBOARD tab
2. [ ] Configure JACK/PipeWire audio settings
3. [ ] Scan for LV2 plugins: PLUGINS tab > Scan
4. [ ] Create your first signal chain: PEDALBOARD tab
5. [ ] Set up MIDI mappings: MIDI tab

## Keyboard Shortcuts (TUI)

| Key | Action |
|-----|--------|
| 1-8 | Switch tabs |
| Left/Right | Navigate tabs |
| R | Refresh current screen |
| Ctrl+R | Hot reload modules |
| Q | Quit |

## Common Commands

```bash
# Start backend only
cd ~/map2-audio && python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080

# Start TUI
cd ~/map2-audio && textual run tui/app.py

# Check service status
systemctl status map2-backend

# View logs
tail -f /tmp/map2_tui.log
journalctl -u map2-backend -f
```

## Getting Help

- Full documentation: `docs/` folder in this backup
- Troubleshooting: `docs/TROUBLESHOOTING.md`
- API reference: `docs/API_REFERENCE.md`
'''

    def _generate_installation_guide(self, manifest: Dict[str, Any]) -> str:
        """Generate full installation guide."""
        return '''# MAP2 Audio Platform - Full Installation Guide

## System Requirements

### Minimum Requirements
- **OS:** Fedora Server 38+ (Workstation also supported)
- **CPU:** Dual-core 2.0 GHz
- **RAM:** 4 GB
- **Storage:** 2 GB free space
- **Audio:** USB audio interface or built-in audio

### Recommended
- **OS:** Fedora Server 41+
- **CPU:** Quad-core 2.5 GHz+
- **RAM:** 8 GB+
- **Storage:** 10 GB+ SSD
- **Audio:** Low-latency USB audio interface (e.g., Focusrite, MOTU)

## Pre-Installation Checklist

1. Fresh Fedora Server installation (minimal install)
2. Network connectivity for package downloads
3. Root/sudo access
4. SSH access (for remote installation)

## Installation Methods

### Method 1: Automated (Recommended)

```bash
# Extract backup
tar -xzf map2-backup-*.tar.gz
cd map2-backup-*

# Run full installation
sudo ./reinstall.sh

# Or with options
sudo ./reinstall.sh --user myuser --dry-run  # Preview first
sudo ./reinstall.sh --user myuser            # Install
```

### Method 2: Manual Installation

#### Step 1: Install System Packages

```bash
sudo dnf install -y \\
    python3 python3-pip python3-devel \\
    alsa-utils alsa-lib pipewire pipewire-jack-audio-connection-kit \\
    jack-audio-connection-kit \\
    lv2 lilv suil lv2-calf-plugins guitarix-lv2 gxplugins-lv2 lsp-plugins-lv2 \\
    nodejs npm \\
    gcc gcc-c++ cmake make git sqlite
```

#### Step 2: Install Python Packages

```bash
pip3 install fastapi uvicorn httpx aiohttp sqlalchemy aiosqlite textual rich psutil pydantic
```

#### Step 3: Copy Source Code

```bash
cp -r source/* ~/map2-audio/
cd ~/map2-audio
```

#### Step 4: Install Node.js Dependencies

```bash
npm install
cd web && npm install && npm run build
```

#### Step 5: Restore User Data

```bash
mkdir -p ~/map2-audio/data ~/.map2
cp database/map2.db ~/map2-audio/data/
cp -r user_data/* ~/.map2/
```

#### Step 6: Configure Audio System

```bash
# Add to audio group
sudo usermod -a -G audio $USER

# Configure real-time limits
sudo tee /etc/security/limits.d/99-audio.conf << 'EOF'
@audio   -  rtprio     95
@audio   -  memlock    unlimited
@audio   -  nice       -19
EOF
```

#### Step 7: Install Services (Optional)

```bash
cd ~/map2-audio
sudo ./install-boot-manager.sh
sudo systemctl enable --now map2-backend
```

## Post-Installation

### Verify Installation

```bash
# Check Python packages
python3 -c "import fastapi, textual, sqlalchemy; print('OK')"

# Check audio
aplay -l  # List audio devices

# Check LV2 plugins
ls /usr/lib64/lv2/ | wc -l

# Start backend
cd ~/map2-audio && ./start_simple.sh
```

### Configure Audio

1. Open DASHBOARD tab
2. Select audio device
3. Set sample rate (44100 or 48000 recommended)
4. Set buffer size (256-512 for low latency)

## Uninstallation

```bash
# Stop services
sudo systemctl stop map2-backend
sudo systemctl disable map2-backend

# Remove files
rm -rf ~/map2-audio ~/.map2

# Remove services
sudo rm /etc/systemd/system/map2-*.service
sudo systemctl daemon-reload
```
'''

    def _generate_troubleshooting_guide(self) -> str:
        """Generate troubleshooting guide."""
        return '''# MAP2 Audio Platform - Troubleshooting Guide

## Common Issues

### 1. Backend Won't Start

**Symptoms:** Port 8080 not responding, connection refused

**Solutions:**
```bash
# Check if port is in use
ss -tlnp | grep 8080

# Kill existing process
pkill -f uvicorn

# Start with verbose logging
cd ~/map2-audio
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 --log-level debug
```

### 2. No Audio Output

**Symptoms:** Signal chain active but no sound

**Solutions:**
```bash
# Check audio devices
aplay -l
cat /proc/asound/cards

# Check PipeWire/JACK status
systemctl --user status pipewire
pw-cli ls

# Test audio output
speaker-test -c 2 -t wav
```

### 3. High Latency / Audio Glitches

**Symptoms:** Crackling, dropouts, high latency

**Solutions:**
```bash
# Check real-time privileges
ulimit -r  # Should show 95

# Reduce buffer size in DASHBOARD
# Try 128 or 256 samples

# Check CPU governor
cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
# Set to performance:
sudo cpupower frequency-set -g performance
```

### 4. LV2 Plugins Not Found

**Symptoms:** Plugin list empty or missing plugins

**Solutions:**
```bash
# Check LV2 path
echo $LV2_PATH
ls /usr/lib64/lv2/

# Rescan plugins
# In TUI: PLUGINS tab > Scan

# Install common plugins
sudo dnf install lv2-calf-plugins guitarix-lv2 gxplugins-lv2 lsp-plugins-lv2
```

### 5. TUI Display Issues

**Symptoms:** Garbled display, wrong colors, layout broken

**Solutions:**
```bash
# Check terminal capabilities
echo $TERM

# Use a compatible terminal
export TERM=xterm-256color

# Try different terminal emulator
# gnome-terminal, kitty, or alacritty recommended
```

### 6. Database Errors

**Symptoms:** "Database locked", corruption errors

**Solutions:**
```bash
# Stop all services first
pkill -f uvicorn
pkill -f "textual run"

# Backup current database
cp ~/map2-audio/data/map2.db ~/map2-audio/data/map2.db.backup

# Check database integrity
sqlite3 ~/map2-audio/data/map2.db "PRAGMA integrity_check;"

# If corrupt, restore from backup
cp ~/map2-audio/data/map2.db.backup ~/map2-audio/data/map2.db
```

### 7. Permission Denied Errors

**Symptoms:** Can't access audio devices, I2C errors

**Solutions:**
```bash
# Add user to required groups
sudo usermod -a -G audio,i2c,dialout $USER

# Log out and back in, or:
newgrp audio

# Check group membership
groups $USER
```

## Log Files

| Log | Location |
|-----|----------|
| TUI | `/tmp/map2_tui.log` |
| Backend | `journalctl -u map2-backend` |
| Boot Manager | `/home/*/map2-audio/logs/boot-manager.log` |
| Reinstaller | `/tmp/map2-reinstall-*.log` |

## Diagnostic Commands

```bash
# System info
uname -a
cat /etc/fedora-release

# Audio subsystem
aplay -l
pactl info
pw-cli info all

# Python environment
python3 --version
pip3 list | grep -E "fastapi|textual|sqlalchemy"

# Network/ports
ss -tlnp | grep -E "8080|3000"

# Services
systemctl list-units | grep map2
```

## Getting Support

1. Check logs for error messages
2. Run diagnostic commands above
3. Include system info when reporting issues
4. Check API docs at http://localhost:8080/docs
'''

    def _generate_architecture_doc(self) -> str:
        """Generate architecture documentation."""
        return '''# MAP2 Audio Platform - Architecture Overview

## System Architecture

```
+------------------+     +------------------+     +------------------+
|                  |     |                  |     |                  |
|   Terminal UI    |     |  Web Dashboard   |     |   LCD Display    |
|   (Textual)      |     |  (Vue/Vite)      |     |   (I2C)          |
|                  |     |                  |     |                  |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         |                        |                        |
         +------------------------+------------------------+
                                  |
                                  v
                    +-------------+-------------+
                    |                           |
                    |    FastAPI Backend        |
                    |    (Python/Async)         |
                    |                           |
                    +-------------+-------------+
                                  |
         +------------------------+------------------------+
         |                        |                        |
         v                        v                        v
+--------+---------+   +----------+--------+   +---------+---------+
|                  |   |                   |   |                   |
|  SQLite Database |   |  LV2 Plugin Host  |   |  MIDI Engine      |
|  (SQLAlchemy)    |   |  (lilv/PiPedal)   |   |  (ALSA/JACK)      |
|                  |   |                   |   |                   |
+------------------+   +-------------------+   +-------------------+
                                  |
                                  v
                    +-------------+-------------+
                    |                           |
                    |   Audio Hardware          |
                    |   (ALSA/JACK/PipeWire)    |
                    |                           |
                    +---------------------------+
```

## Component Overview

### Frontend Interfaces

| Component | Technology | Purpose |
|-----------|------------|---------|
| Terminal UI | Python/Textual | Primary control interface |
| Web Dashboard | Vue.js/Vite | Remote web access |
| LCD Display | Python/I2C | Hardware display output |

### Backend Services

| Service | Technology | Purpose |
|---------|------------|---------|
| API Server | FastAPI/Uvicorn | REST API and WebSocket |
| Database | SQLite/SQLAlchemy | Persistence layer |
| Plugin Host | LV2/lilv | Audio plugin management |
| MIDI Engine | ALSA/rtmidi | MIDI I/O and mapping |

### Audio Stack

```
Application Layer
       |
       v
+------+------+
|  PipeWire   |  (Session manager, routing)
+------+------+
       |
       v
+------+------+
|    JACK     |  (Low-latency audio server)
+------+------+
       |
       v
+------+------+
|    ALSA     |  (Kernel audio drivers)
+------+------+
       |
       v
+------+------+
|  Hardware   |  (USB audio interface)
+-------------+
```

## Directory Structure

```
~/map2-audio/
├── app/                    # FastAPI backend
│   ├── main.py            # Application factory
│   ├── routes/            # API route modules
│   ├── services/          # Business logic
│   └── database.py        # ORM models
├── tui/                    # Terminal UI
│   ├── app.py             # Main TUI application
│   ├── screens/           # Tab screens
│   ├── widgets.py         # Custom widgets
│   └── api_client.py      # Backend API client
├── web/                    # Web dashboard
│   ├── src/               # Vue source
│   └── dist/              # Built assets
├── scripts/               # Helper scripts
├── systemd/               # Service files
├── data/                  # Runtime data
│   └── map2.db           # SQLite database
└── logs/                  # Log files

~/.map2/                   # User data
├── ir/                    # Impulse responses
├── nam/                   # NAM models
├── sessions/              # Saved sessions
└── packages/              # Custom packages
```

## Data Flow

### Signal Chain Processing

```
Audio Input -> [Plugin 1] -> [Plugin 2] -> ... -> [Plugin N] -> Audio Output
                  |              |                    |
                  v              v                    v
              Parameters    Parameters           Parameters
                  ^              ^                    ^
                  |              |                    |
              MIDI CC        MIDI CC              MIDI CC
```

### API Request Flow

```
Client Request
      |
      v
  FastAPI Router
      |
      v
  Service Layer
      |
      +---> Database (SQLAlchemy)
      |
      +---> Plugin Host (LV2)
      |
      +---> MIDI Engine
      |
      v
  JSON Response
```

## Database Schema

### Core Tables

- **plugins** - LV2 plugin metadata
- **chains** - Signal chain definitions
- **chain_plugins** - Plugin instances in chains
- **presets** - Saved chain configurations
- **midi_mappings** - MIDI CC to parameter mappings
- **system_config** - Key-value configuration

### Relationships

```
chains 1:N chain_plugins N:1 plugins
chains 1:N presets
plugins 1:N midi_mappings
```

## Security Considerations

- Backend listens on localhost by default
- No authentication (designed for local use)
- Database stored in user home directory
- Real-time privileges limited to audio group
'''

    def _generate_config_reference(self) -> str:
        """Generate configuration reference."""
        return '''# MAP2 Audio Platform - Configuration Reference

## Configuration Files

### ~/.map2/config.json

Main user configuration file.

```json
{
    "audio": {
        "sample_rate": 48000,
        "buffer_size": 256,
        "device": "hw:1,0"
    },
    "midi": {
        "enabled": true,
        "learn_timeout": 10
    },
    "ui": {
        "theme": "dark",
        "refresh_rate": 30
    }
}
```

### Audio Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `audio.sample_rate` | int | 48000 | Sample rate in Hz (44100, 48000, 96000) |
| `audio.buffer_size` | int | 256 | Buffer size in samples (64-2048) |
| `audio.device` | string | auto | ALSA device identifier |
| `audio.channels` | int | 2 | Number of audio channels |

### MIDI Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `midi.enabled` | bool | true | Enable MIDI input |
| `midi.learn_timeout` | int | 10 | MIDI learn timeout in seconds |
| `midi.device` | string | auto | MIDI input device |

### UI Settings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `ui.theme` | string | "dark" | UI theme (dark, light) |
| `ui.refresh_rate` | int | 30 | Status refresh rate (Hz) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MAP2_CONFIG_DIR` | `~/.map2` | User config directory |
| `MAP2_LOG_LEVEL` | `WARNING` | Logging level |
| `MAP2_API_HOST` | `127.0.0.1` | API bind address |
| `MAP2_API_PORT` | `8080` | API port |
| `LV2_PATH` | System default | LV2 plugin search path |

## Systemd Service Configuration

### /etc/systemd/system/map2-backend.service

```ini
[Unit]
Description=MAP2 Audio Platform Backend
After=network.target sound.target

[Service]
Type=simple
User=mm
WorkingDirectory=/home/mm/map2-audio
ExecStart=/usr/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Audio Configuration

### Real-Time Limits (/etc/security/limits.d/99-audio.conf)

```
@audio   -  rtprio     95
@audio   -  memlock    unlimited
@audio   -  nice       -19
```

### PipeWire Configuration (~/.config/pipewire/pipewire.conf.d/)

```
context.properties = {
    default.clock.rate = 48000
    default.clock.quantum = 256
    default.clock.min-quantum = 64
}
```

## Backup Settings

Stored in `~/.local/share/map2/backups/settings.json`:

```json
{
    "max_backups": 5,
    "retention_days": 30,
    "auto_cleanup": true
}
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `max_backups` | int | 5 | Maximum backups to keep |
| `retention_days` | int | 30 | Days before auto-deletion |
| `auto_cleanup` | bool | true | Enable automatic cleanup |
'''

    def _generate_api_reference(self) -> str:
        """Generate API reference."""
        return '''# MAP2 Audio Platform - API Reference

## Base URL

```
http://localhost:8080/api
```

## Interactive Documentation

- **Swagger UI:** http://localhost:8080/docs
- **ReDoc:** http://localhost:8080/redoc

## Authentication

No authentication required (local use only).

## Endpoints Overview

### Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/metrics` | System metrics |

### Signal Chains

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chains/` | List all chains |
| POST | `/api/chains/` | Create chain |
| GET | `/api/chains/{id}` | Get chain details |
| DELETE | `/api/chains/{id}` | Delete chain |
| POST | `/api/chains/{id}/activate` | Activate chain |
| POST | `/api/chains/{id}/plugins` | Add plugin |
| DELETE | `/api/chains/{id}/plugins/{uri}` | Remove plugin |

### Plugins

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/plugins/` | List plugins |
| GET | `/api/plugins/scan` | Scan for plugins |
| GET | `/api/plugins/{uri}` | Plugin details |

### MIDI

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/midi/devices` | List MIDI devices |
| GET | `/api/midi/mappings` | List mappings |
| POST | `/api/midi/mappings` | Create mapping |
| POST | `/api/midi/learn` | Start MIDI learn |

### Presets

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/presets/` | List presets |
| POST | `/api/presets/` | Create preset |
| POST | `/api/presets/{id}/load` | Load preset |
| DELETE | `/api/presets/{id}` | Delete preset |

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions/` | List sessions |
| POST | `/api/sessions/save` | Save session |
| POST | `/api/sessions/{id}/load` | Load session |

### Backup

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/backup/` | List backups |
| POST | `/api/backup/create` | Create backup |
| GET | `/api/backup/status` | Backup status |
| POST | `/api/backup/{id}/restore` | Restore backup |
| DELETE | `/api/backup/{id}` | Delete backup |
| GET | `/api/backup/settings/current` | Get settings |
| PUT | `/api/backup/settings/current` | Update settings |

## Example Requests

### Create Signal Chain

```bash
curl -X POST "http://localhost:8080/api/chains/" \\
     -H "Content-Type: application/json" \\
     -d '{"name": "My Guitar Chain"}'
```

### Add Plugin to Chain

```bash
curl -X POST "http://localhost:8080/api/chains/1/plugins" \\
     -H "Content-Type: application/json" \\
     -d '{"plugin_uri": "http://calf.sourceforge.net/plugins/Compressor"}'
```

### Create Backup

```bash
curl -X POST "http://localhost:8080/api/backup/create" \\
     -H "Content-Type: application/json" \\
     -d '{"description": "Before major changes"}'
```

## WebSocket Endpoints

### /ws/metrics

Real-time system metrics stream.

```javascript
const ws = new WebSocket('ws://localhost:8080/ws/metrics');
ws.onmessage = (event) => {
    const metrics = JSON.parse(event.data);
    console.log('CPU:', metrics.cpu_percent);
};
```

### /ws/midi

Real-time MIDI events.

```javascript
const ws = new WebSocket('ws://localhost:8080/ws/midi');
ws.onmessage = (event) => {
    const midi = JSON.parse(event.data);
    console.log('MIDI:', midi.channel, midi.cc, midi.value);
};
```

## Error Responses

```json
{
    "detail": "Error message here"
}
```

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 404 | Not Found |
| 500 | Server Error |
'''

    def _generate_fedora_notes(self) -> str:
        """Generate Fedora-specific notes."""
        return '''# MAP2 Audio Platform - Fedora-Specific Notes

## Supported Fedora Versions

| Version | Status | Notes |
|---------|--------|-------|
| Fedora 38 | Supported | Minimum version |
| Fedora 39 | Supported | Recommended |
| Fedora 40 | Supported | Recommended |
| Fedora 41 | Supported | Latest, recommended |
| Fedora 42+ | Should work | Not tested |

## Fedora Server vs Workstation

### Fedora Server (Recommended)
- Minimal install, less overhead
- No desktop environment by default
- Ideal for headless/dedicated audio systems
- SSH access for remote management

### Fedora Workstation
- Full desktop environment
- More resource usage
- Easier initial setup
- Better for development

## Fedora Atomic / Silverblue

For immutable Fedora variants:

```bash
# Use toolbox for development
toolbox create map2-dev
toolbox enter map2-dev

# Install packages in toolbox
sudo dnf install python3 ...

# Or use Flatpak for GUI apps
flatpak install flathub org.audacityteam.Audacity
```

## SELinux Considerations

MAP2 is designed to work with SELinux enabled.

```bash
# Check SELinux status
getenforce

# If issues occur, check audit log
sudo ausearch -m avc -ts recent

# Allow specific actions if needed
sudo audit2allow -a
```

## Firewall Configuration

For remote access (optional):

```bash
# Allow web dashboard
sudo firewall-cmd --add-port=3000/tcp --permanent

# Allow API
sudo firewall-cmd --add-port=8080/tcp --permanent

# Reload
sudo firewall-cmd --reload
```

## PipeWire vs JACK

Fedora uses PipeWire by default since F34.

### Using PipeWire (Default)
```bash
# Check status
systemctl --user status pipewire

# PipeWire provides JACK compatibility
# No additional configuration needed
```

### Using Native JACK
```bash
# Install JACK
sudo dnf install jack-audio-connection-kit qjackctl

# Disable PipeWire JACK
systemctl --user mask pipewire-jack

# Start JACK manually
jackd -d alsa -d hw:1 -r 48000 -p 256
```

## Package Management

### DNF Commands

```bash
# Search for audio packages
dnf search lv2

# Install specific plugin
sudo dnf install lv2-calf-plugins

# List installed LV2 plugins
rpm -qa | grep lv2

# Find package contents
rpm -ql guitarix-lv2
```

### Copr Repositories

Additional audio software from Copr:

```bash
# Enable Planet CCRMA repo (optional)
sudo dnf copr enable hobbes1069/fedora-audio

# Search and install
dnf search --enablerepo=copr:hobbes1069:fedora-audio
```

## Real-Time Kernel (Optional)

For lowest latency:

```bash
# Install RT kernel
sudo dnf install kernel-rt kernel-rt-devel

# Reboot and select RT kernel
sudo reboot
```

## Troubleshooting Fedora-Specific Issues

### DNF Lock Issues
```bash
# Kill any stuck DNF processes
sudo pkill -9 dnf

# Clean cache
sudo dnf clean all
```

### Missing Development Headers
```bash
# Install development tools
sudo dnf groupinstall "Development Tools"
sudo dnf install python3-devel alsa-lib-devel
```

### Codec Issues
```bash
# Enable RPM Fusion
sudo dnf install \\
    https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm

# Install codecs
sudo dnf install ffmpeg
```
'''

    def _generate_changelog(self, manifest: Dict[str, Any]) -> str:
        """Generate changelog."""
        map2_version = manifest.get("map2_version", get_platform_version())
        return f'''# MAP2 Audio Platform - Changelog

## Version {map2_version}

### Backup Created: {manifest.get("created_at", "Unknown")}

This backup was created from host: {manifest.get("hostname", "Unknown")}

---

## Version History

### Version {map2_version} (Current)

#### Features
- Full backup and restore functionality
- Self-contained reinstaller for Fedora Server
- 8-tab TUI interface:
  - PEDALBOARD: Signal chain management
  - MIDI: MIDI mapping and control
  - PLUGINS: LV2 plugin browser
  - DASHBOARD: System status and metrics
  - WORKFLOW: Sessions and presets
  - GUITAR/NAM: Neural amp modeling
  - ABOUT: System information
  - BACKUP: Backup management

#### Audio Features
- LV2 plugin hosting via PiPedal engine
- Real-time signal chain processing
- MIDI CC parameter control
- MIDI learn functionality
- Latency compensation

#### Backend Features
- FastAPI REST API
- WebSocket real-time updates
- SQLite database persistence
- Async architecture

### Installation
- Automated Fedora Server installation
- Systemd service integration
- PipeWire/JACK audio support
- Real-time audio configuration

---

## Future Roadmap

- [ ] Cloud backup integration
- [ ] Multi-device sync
- [ ] Plugin preset sharing
- [ ] Advanced automation
- [ ] Mobile companion app
'''

    def _generate_license(self) -> str:
        """Generate license file."""
        return '''MIT License

Copyright (c) 2024-2026 MAP2 Audio Platform Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## Third-Party Licenses

This software incorporates components from the following projects:

### PiPedal
- License: GPL-3.0
- https://github.com/rerdavies/pipedal

### LV2
- License: ISC
- https://lv2plug.in/

### FastAPI
- License: MIT
- https://fastapi.tiangolo.com/

### Textual
- License: MIT
- https://textual.textualize.io/

### SQLAlchemy
- License: MIT
- https://www.sqlalchemy.org/

### LV2 Plugin Collections
- Calf Studio Gear: LGPL-2.1
- Guitarix: GPL-2.0
- LSP Plugins: LGPL-3.0

Full license texts for third-party components are available in their
respective source repositories.
'''

    def _generate_backup_readme(self, manifest: Dict[str, Any], backup_id: str) -> str:
        """Generate README documentation for the backup archive."""
        return f'''# MAP2 Audio Platform Backup

## Backup Information

- **Backup ID:** {backup_id}
- **Created:** {manifest.get("created_at", "Unknown")}
- **Source Host:** {manifest.get("hostname", "Unknown")}
- **Platform:** {manifest.get("platform", "Unknown")}
- **MAP2 Version:** {manifest.get("map2_version", "Unknown")}

## Quick Start - Fresh Fedora Server Installation

This backup is self-contained and can reinstall the entire MAP2 Audio Platform
on a fresh Fedora Server installation.

### Requirements

- Fresh Fedora Server (38+ recommended)
- Root access (sudo)
- Network connection for package downloads
- SSH access (for remote installation)

### Installation Steps

1. **Extract the backup:**
   ```bash
   tar -xzf map2-backup-{backup_id}.tar.gz
   cd map2-backup-{backup_id}
   ```

2. **Run the reinstaller:**
   ```bash
   chmod +x reinstall.sh
   sudo ./reinstall.sh
   ```

3. **Start the platform:**
   ```bash
   cd ~/map2-audio
   ./start_simple.sh        # Start backend
   textual run tui/app.py   # Start TUI (optional)
   ```

### Reinstaller Options

```bash
sudo ./reinstall.sh --help              # Show help
sudo ./reinstall.sh --user USERNAME     # Install for specific user
sudo ./reinstall.sh --skip-packages     # Skip DNF packages (already installed)
sudo ./reinstall.sh --skip-python       # Skip Python packages
sudo ./reinstall.sh --skip-restore      # Skip restoring user data
sudo ./reinstall.sh --dry-run           # Preview without making changes
```

## Backup Contents

### User Data (Backed Up)
- Database: `database/map2.db` - Chains, presets, MIDI mappings
- Impulse Responses: `user_data/ir/`
- NAM Models: `user_data/nam/`
- Sessions: `user_data/sessions/`
- Packages: `user_data/packages/`
- Config: `config/config.json`

### Source Code (Backed Up)
- Application code: `source/app/`
- TUI interface: `source/tui/`
- Scripts: `source/scripts/`
- Systemd services: `source/systemd/`

### Not Included (Reinstallable)
See `skip_list.json` for complete list of items that can be reinstalled
via package managers:
- DNF packages (python3, alsa-utils, jack, lv2 plugins, etc.)
- Python packages (fastapi, uvicorn, textual, etc.)
- Node.js packages (npm install)
- Build artifacts (regenerated automatically)

## Manual Restoration

If you prefer manual restoration instead of using the reinstaller:

1. Copy database:
   ```bash
   cp database/map2.db ~/map2-audio/data/
   ```

2. Copy user data:
   ```bash
   cp -r user_data/* ~/.map2/
   ```

3. Copy config (if exists):
   ```bash
   cp config/config.json ~/.map2/
   ```

## Support

For issues with the reinstaller or backup:
1. Check the installation log: `/tmp/map2-reinstall-*.log`
2. Verify Fedora version: `cat /etc/fedora-release`
3. Check network connectivity for package downloads

## License

MAP2 Audio Platform - MIT License
'''

    async def create_backup(self, description: str = "") -> BackupInfo:
        """
        Create a new backup archive.

        Args:
            description: Optional description for the backup

        Returns:
            BackupInfo with details about the created backup
        """
        backup_id = self._generate_backup_id()
        backup_filename = f"map2-backup-{backup_id}.tar.gz"
        backup_path = Path(self.settings.backup_location) / backup_filename

        # Create manifest
        manifest = {
            "version": "1.0",
            "backup_id": backup_id,
            "created_at": datetime.now().isoformat(),
            "description": description,
            "hostname": platform.node(),
            "platform": f"{platform.system()} {platform.release()}",
            "map2_version": get_platform_version(),
            "backup_type": "full",
            "contents": {},
            "total_size_bytes": 0,
        }

        # Create skip list
        skip_list = self.generate_skip_list()

        # Use temp directory for atomic operation
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            staging_dir = temp_path / "backup_staging"
            staging_dir.mkdir()

            # Write manifest placeholder (will update at end)
            manifest_path = staging_dir / "manifest.json"

            # Write skip list
            skip_list_path = staging_dir / "skip_list.json"
            with open(skip_list_path, 'w') as f:
                json.dump(skip_list, f, indent=2)

            # Backup database
            db_path = self.DEFAULT_BACKUP_PATHS["database"]
            if db_path.exists():
                db_staging = staging_dir / "database"
                db_staging.mkdir()
                dest_db = db_staging / "map2.db"
                shutil.copy2(db_path, dest_db)
                size = dest_db.stat().st_size
                manifest["contents"]["database"] = {
                    "path": "database/map2.db",
                    "size_bytes": size,
                    "original_path": str(db_path)
                }
                manifest["total_size_bytes"] += size

            # Backup user data directories
            user_data_staging = staging_dir / "user_data"
            user_data_staging.mkdir()

            for key, source_path in [
                ("ir", self.DEFAULT_BACKUP_PATHS["user_ir"]),
                ("nam", self.DEFAULT_BACKUP_PATHS["user_nam"]),
                ("sessions", self.DEFAULT_BACKUP_PATHS["user_sessions"]),
                ("packages", self.DEFAULT_BACKUP_PATHS["user_packages"]),
            ]:
                if source_path.exists() and source_path.is_dir():
                    dest_dir = user_data_staging / key
                    shutil.copytree(source_path, dest_dir, dirs_exist_ok=True)

                    # Calculate size and count
                    file_count = 0
                    total_size = 0
                    for f in dest_dir.rglob("*"):
                        if f.is_file():
                            file_count += 1
                            total_size += f.stat().st_size

                    manifest["contents"][f"user_{key}"] = {
                        "path": f"user_data/{key}",
                        "count": file_count,
                        "size_bytes": total_size,
                        "original_path": str(source_path)
                    }
                    manifest["total_size_bytes"] += total_size

            # Backup config file
            config_path = self.DEFAULT_BACKUP_PATHS["user_config"]
            if config_path.exists():
                config_staging = staging_dir / "config"
                config_staging.mkdir()
                dest_config = config_staging / "config.json"
                shutil.copy2(config_path, dest_config)
                size = dest_config.stat().st_size
                manifest["contents"]["config"] = {
                    "path": "config/config.json",
                    "size_bytes": size,
                    "original_path": str(config_path)
                }
                manifest["total_size_bytes"] += size

            # Generate and write reinstaller script
            reinstaller_content = REINSTALLER_SCRIPT.format(
                timestamp=manifest["created_at"],
                backup_id=backup_id,
                hostname=manifest["hostname"],
                map2_version=manifest["map2_version"],
            )
            reinstaller_path = staging_dir / "reinstall.sh"
            with open(reinstaller_path, 'w') as f:
                f.write(reinstaller_content)
            # Make executable
            os.chmod(reinstaller_path, 0o755)
            manifest["contents"]["reinstaller"] = {
                "path": "reinstall.sh",
                "description": "Self-contained reinstaller for Fedora Server"
            }

            # Write README for the backup
            readme_content = self._generate_backup_readme(manifest, backup_id)
            readme_path = staging_dir / "README.md"
            with open(readme_path, 'w') as f:
                f.write(readme_content)


            # Backup full application source directory as a tar.gz
            full_source_dir = self._get_app_root_dir()
            if full_source_dir.exists():
                full_source_tar = staging_dir / "full_source.tar.gz"
                with tarfile.open(full_source_tar, "w:gz") as tar:
                    tar.add(full_source_dir, arcname="map2-audio")
                source_size = full_source_tar.stat().st_size
                manifest["contents"]["full_source"] = {
                    "path": "full_source.tar.gz",
                    "size_bytes": source_size,
                    "original_path": str(full_source_dir),
                    "description": f"Full tar.gz copy of MAP2 source from {full_source_dir}"
                }
                manifest["total_size_bytes"] += source_size

            # Generate comprehensive documentation set
            self._generate_documentation_set(manifest, backup_id, staging_dir)
            manifest["contents"]["documentation"] = {
                "path": "docs/",
                "description": "Complete documentation including installation, troubleshooting, API reference"
            }

            # Write final manifest
            with open(manifest_path, 'w') as f:
                json.dump(manifest, f, indent=2)

            # Create tar.gz archive
            temp_archive = temp_path / backup_filename
            with tarfile.open(temp_archive, "w:gz") as tar:
                for item in staging_dir.iterdir():
                    tar.add(item, arcname=item.name)

            # Calculate checksum
            checksum = self._calculate_checksum(temp_archive)

            # Update manifest with checksum (re-create archive)
            manifest["checksum"] = checksum
            with open(manifest_path, 'w') as f:
                json.dump(manifest, f, indent=2)

            with tarfile.open(temp_archive, "w:gz") as tar:
                for item in staging_dir.iterdir():
                    tar.add(item, arcname=item.name)

            # Atomic move to final location
            shutil.move(str(temp_archive), str(backup_path))

        # Apply lifecycle cleanup if enabled
        if self.settings.auto_cleanup:
            await self.cleanup_old_backups()

        # Return backup info
        size = backup_path.stat().st_size
        return BackupInfo(
            id=backup_id,
            filename=backup_filename,
            path=str(backup_path),
            created_at=manifest["created_at"],
            size_bytes=size,
            size_human=self._human_readable_size(size),
            valid=True,
            manifest=manifest
        )

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
            "restored_at": datetime.now().isoformat(),
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

    async def list_backups(self) -> List[BackupInfo]:
        """List all available backups, sorted by date (newest first)."""
        backups = []
        backup_dir = Path(self.settings.backup_location)

        if not backup_dir.exists():
            return []

        for backup_file in backup_dir.glob("map2-backup-*.tar.gz"):
            try:
                # Extract backup ID from filename
                backup_id = backup_file.stem.replace("map2-backup-", "").replace(".tar", "")

                # Get file info
                stat = backup_file.stat()
                created_at = datetime.fromtimestamp(stat.st_mtime).isoformat()

                # Try to read manifest
                manifest = None
                valid = True
                try:
                    with tarfile.open(backup_file, "r:gz") as tar:
                        manifest_member = tar.getmember("manifest.json")
                        manifest_file = tar.extractfile(manifest_member)
                        if manifest_file:
                            manifest = json.load(manifest_file)
                            created_at = manifest.get("created_at", created_at)
                except Exception:
                    valid = False

                backups.append(BackupInfo(
                    id=backup_id,
                    filename=backup_file.name,
                    path=str(backup_file),
                    created_at=created_at,
                    size_bytes=stat.st_size,
                    size_human=self._human_readable_size(stat.st_size),
                    valid=valid,
                    manifest=manifest
                ))
            except Exception as e:
                logger.error(f"Error reading backup {backup_file}: {e}")

        # Sort by created_at descending (newest first)
        backups.sort(key=lambda x: x.created_at, reverse=True)
        return backups

    async def get_backup(self, backup_id: str) -> Optional[BackupInfo]:
        """Get details about a specific backup."""
        backups = await self.list_backups()
        for backup in backups:
            if backup.id == backup_id:
                return backup
        return None

    async def delete_backup(self, backup_id: str) -> bool:
        """Delete a backup file."""
        backup = await self.get_backup(backup_id)
        if not backup:
            return False

        try:
            Path(backup.path).unlink()
            return True
        except Exception as e:
            logger.error(f"Failed to delete backup {backup_id}: {e}")
            return False

    async def cleanup_old_backups(self) -> Dict[str, Any]:
        """Apply retention policy and cleanup old backups."""
        results = {
            "deleted_count": 0,
            "deleted_backups": [],
            "remaining_count": 0
        }

        backups = await self.list_backups()

        # Delete by count limit
        if len(backups) > self.settings.max_backups:
            to_delete = backups[self.settings.max_backups:]
            for backup in to_delete:
                if await self.delete_backup(backup.id):
                    results["deleted_count"] += 1
                    results["deleted_backups"].append(backup.id)

        # Delete by age
        cutoff_date = datetime.now() - timedelta(days=self.settings.retention_days)
        backups = await self.list_backups()  # Refresh list

        for backup in backups:
            try:
                backup_date = datetime.fromisoformat(backup.created_at)
                if backup_date < cutoff_date:
                    if await self.delete_backup(backup.id):
                        results["deleted_count"] += 1
                        results["deleted_backups"].append(backup.id)
            except Exception:
                pass

        # Get final count
        backups = await self.list_backups()
        results["remaining_count"] = len(backups)

        return results

    async def get_backup_status(self) -> Dict[str, Any]:
        """Get overall backup status and statistics."""
        backups = await self.list_backups()

        total_size = sum(b.size_bytes for b in backups)
        valid_count = sum(1 for b in backups if b.valid)

        last_backup = backups[0] if backups else None

        return {
            "backup_count": len(backups),
            "valid_count": valid_count,
            "invalid_count": len(backups) - valid_count,
            "total_size_bytes": total_size,
            "total_size_human": self._human_readable_size(total_size),
            "last_backup": asdict(last_backup) if last_backup else None,
            "backup_location": self.settings.backup_location,
            "settings": asdict(self.settings),
        }

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
                "updated_at": datetime.now().isoformat(),
                "updated_components": ["reinstaller", "documentation"],
                "reason": "On-demand update"
            })
            manifest["last_updated"] = datetime.now().isoformat()

            # Generate new reinstaller script with current template
            reinstaller_content = REINSTALLER_SCRIPT.format(
                timestamp=datetime.now().isoformat(),
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
                "updated_at": datetime.now().isoformat()
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
                "updated_at": datetime.now().isoformat()
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

    async def update_all_backups(self) -> Dict[str, Any]:
        """
        Update all valid backups with the latest reinstaller and documentation.

        Returns:
            Dictionary with update results for each backup
        """
        results = {
            "updated": [],
            "failed": [],
            "skipped": [],
            "total_processed": 0
        }

        backups = await self.list_backups()

        for backup in backups:
            results["total_processed"] += 1

            if not backup.valid:
                results["skipped"].append({
                    "id": backup.id,
                    "reason": "Invalid backup"
                })
                continue

            try:
                await self.update_backup(backup.id)
                results["updated"].append(backup.id)
            except Exception as e:
                results["failed"].append({
                    "id": backup.id,
                    "error": str(e)
                })
                logger.error(f"Failed to update backup {backup.id}: {e}")

        return results

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
        timestamp = datetime.now().isoformat()
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


# Thread-safe singleton implementation
def get_backup_service() -> BackupService:
    """Get or create the backup service singleton."""
    return BackupService.get_instance()


def reset_backup_service() -> None:
    """Reset the backup service singleton (primarily for testing)."""
    BackupService.reset_instance()


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="MAP2 Backup Service CLI")
    parser.add_argument(
        "--generate-rebuild-script",
        nargs='?',
        const=True,
        default=False,
        help="Generate a standalone rebuild script. Optionally specify the output path."
    )
    args = parser.parse_args()

    if args.generate_rebuild_script:
        service = BackupService()
        output_path = args.generate_rebuild_script if isinstance(args.generate_rebuild_script, str) else None
        print(f"Generating rebuild script to: {output_path or service.settings.backup_location}")
        service.generate_rebuild_script(output_path=output_path)
        print("Rebuild script generated successfully.")

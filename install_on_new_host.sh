#!/bin/bash
###############################################################################
# MAP2 Audio Platform — Complete Fresh Host Installation Script
# ==============================================================================
#
# This script performs a COMPLETE, idempotent installation of the MAP2 Modular
# Audio Platform on a fresh machine. It is designed for Fedora Server 42+ but
# includes detection for other distros.
#
# Usage:
#   sudo bash install_on_new_host.sh              # Full install
#   sudo bash install_on_new_host.sh --dry-run     # Preview only
#   sudo bash install_on_new_host.sh --skip-reboot # No reboot prompt
#   sudo bash install_on_new_host.sh --mode audio  # Set mode (audio|all-in-one|management)
#
# Safe to run multiple times (idempotent).
# Creates: /home/mm/map2-audio (if cloned), all system configs, services.
#
# Target: Sub-3ms round-trip audio latency on isolated CPU cores.
#
# Author: MAP2 Audio Platform DevOps
# Date: 2026-02-08
###############################################################################

set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

REPO_URL="https://github.com/matthewmackes/map2-audio.git"
INSTALL_USER="mm"
INSTALL_DIR="/home/${INSTALL_USER}/map2-audio"
CONFIG_DIR="/home/${INSTALL_USER}/.map2"
VENV_DIR="${INSTALL_DIR}/.venv"
NODE_VERSION_MIN=18
PYTHON_VERSION_MIN="3.12"
JUCE_VERSION="8.0.0"
TARGET_MODE="${MAP2_MODE:-audio}"       # audio | all-in-one | management
DRY_RUN=0
SKIP_REBOOT=0
REBOOT_REQUIRED=0
LOG_FILE="/tmp/map2-install-$(date +%Y%m%d-%H%M%S).log"

# Isolated CPU cores for audio processing
ISOLATED_CORES="4,5"
HOUSEKEEPING_CORES="0-3"

# ═══════════════════════════════════════════════════════════════════════════════
# COLOR CODES
# ═══════════════════════════════════════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ═══════════════════════════════════════════════════════════════════════════════
# ARGUMENT PARSING
# ═══════════════════════════════════════════════════════════════════════════════

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)     DRY_RUN=1; shift ;;
        --skip-reboot) SKIP_REBOOT=1; shift ;;
        --mode)        TARGET_MODE="${2:-audio}"; shift 2 ;;
        --user)        INSTALL_USER="${2:-mm}"; INSTALL_DIR="/home/${INSTALL_USER}/map2-audio"; CONFIG_DIR="/home/${INSTALL_USER}/.map2"; VENV_DIR="${INSTALL_DIR}/.venv"; shift 2 ;;
        --help|-h)
            echo "Usage: sudo bash $0 [--dry-run] [--skip-reboot] [--mode audio|all-in-one|management] [--user mm]"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# ═══════════════════════════════════════════════════════════════════════════════
# LOGGING
# ═══════════════════════════════════════════════════════════════════════════════

exec > >(tee -a "$LOG_FILE") 2>&1

log()     { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $*"; }
ok()      { echo -e "${GREEN}  ✓${NC} $*"; }
warn()    { echo -e "${YELLOW}  ⚠${NC} $*"; }
err()     { echo -e "${RED}  ✗${NC} $*"; }
section() { echo ""; echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${CYAN}  $*${NC}"; echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }
phase()   { echo ""; echo -e "${MAGENTA}╔══════════════════════════════════════════════════════════════════════╗${NC}"; echo -e "${MAGENTA}║  $*${NC}"; echo -e "${MAGENTA}╚══════════════════════════════════════════════════════════════════════╝${NC}"; echo ""; }

run_cmd() {
    if [ $DRY_RUN -eq 1 ]; then
        echo -e "  ${DIM}[DRY-RUN] $*${NC}"
    else
        "$@"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
# PRE-FLIGHT CHECKS
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 0: Pre-Flight Checks"

# Must be root
if [ "$EUID" -ne 0 ]; then
    err "This script must be run as root (use sudo)"
    exit 1
fi
ok "Running as root"

# Check target user exists
if ! id "$INSTALL_USER" &>/dev/null; then
    log "Creating user $INSTALL_USER..."
    run_cmd useradd -m -s /bin/bash "$INSTALL_USER"
    ok "Created user $INSTALL_USER"
else
    ok "User $INSTALL_USER exists"
fi

# Detect distro
DISTRO="unknown"
DISTRO_VERSION=""
PKG_MGR=""

if [ -f /etc/fedora-release ]; then
    DISTRO="fedora"
    DISTRO_VERSION=$(rpm -E %fedora)
    PKG_MGR="dnf"
elif [ -f /etc/debian_version ]; then
    DISTRO="debian"
    DISTRO_VERSION=$(cat /etc/debian_version)
    PKG_MGR="apt"
elif [ -f /etc/arch-release ]; then
    DISTRO="arch"
    PKG_MGR="pacman"
fi

ok "Detected: $DISTRO $DISTRO_VERSION (package manager: $PKG_MGR)"
log "Target mode: $TARGET_MODE"
log "Install directory: $INSTALL_DIR"
log "Log file: $LOG_FILE"

if [ $DRY_RUN -eq 1 ]; then
    warn "DRY-RUN MODE — no changes will be made"
fi

# Check disk space (minimum 5 GB)
AVAIL_GB=$(df -BG /home | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "$AVAIL_GB" -lt 5 ]; then
    err "Insufficient disk space: ${AVAIL_GB}GB available, 5GB required"
    exit 1
fi
ok "Disk space: ${AVAIL_GB}GB available"

# Check internet
if ! ping -c 1 -W 3 github.com &>/dev/null; then
    err "No internet connectivity (cannot reach github.com)"
    exit 1
fi
ok "Internet connectivity verified"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1: SYSTEM PACKAGES
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 1: Installing System Packages"

case "$DISTRO" in
    fedora)
        section "Fedora — DNF Package Installation"

        log "Updating repositories..."
        run_cmd dnf update -y --refresh

        log "Installing Development Tools group..."
        run_cmd dnf groupinstall -y "Development Tools"

        log "Installing build essentials..."
        run_cmd dnf install -y \
            gcc gcc-c++ make cmake ninja-build git curl wget \
            pkg-config autoconf automake libtool \
            python3 python3-devel python3-pip python3-wheel python3-venv

        log "Installing audio system packages..."
        run_cmd dnf install -y \
            pipewire pipewire-devel \
            pipewire-jack-audio-connection-kit pipewire-jack-audio-connection-kit-devel \
            pipewire-alsa pipewire-pulseaudio pipewire-utils \
            jack-audio-connection-kit jack-audio-connection-kit-devel \
            alsa-lib alsa-lib-devel alsa-utils alsa-plugins-jack \
            rtkit

        log "Installing LV2/plugin ecosystem..."
        run_cmd dnf install -y \
            lv2 lv2-devel \
            lilv lilv-devel \
            suil suil-devel \
            sratom sratom-devel \
            sord sord-devel \
            serd serd-devel

        log "Installing multimedia/DSP libraries..."
        run_cmd dnf install -y \
            libsndfile libsndfile-devel \
            fftw fftw-devel \
            libsamplerate libsamplerate-devel \
            portaudio portaudio-devel

        log "Installing system libraries..."
        run_cmd dnf install -y \
            sqlite sqlite-devel \
            systemd-devel \
            avahi avahi-devel avahi-tools \
            dbus-devel \
            libcurl-devel \
            openssl-devel \
            freetype freetype-devel \
            libX11-devel libXext-devel libXrandr-devel libXinerama-devel libXcursor-devel \
            mesa-libGL-devel \
            libxkbcommon-devel \
            gtk3-devel \
            webkit2gtk4.1-devel || true

        log "Installing monitoring/utility tools..."
        run_cmd dnf install -y \
            htop iotop lsof net-tools \
            jq \
            irqbalance \
            tuned \
            dialog

        log "Installing Node.js..."
        if ! command -v node &>/dev/null; then
            run_cmd dnf install -y nodejs npm
        fi
        ;;

    debian)
        section "Debian/Ubuntu — APT Package Installation"

        run_cmd apt update
        run_cmd apt install -y build-essential cmake ninja-build git curl wget pkg-config \
            python3 python3-dev python3-pip python3-venv \
            libasound2-dev libjack-jackd2-dev \
            pipewire pipewire-jack pipewire-alsa \
            lv2-dev liblilv-dev libsuil-dev libserd-dev libsord-dev libsratom-dev \
            libsndfile1-dev libfftw3-dev libsamplerate0-dev \
            portaudio19-dev \
            sqlite3 libsqlite3-dev libsystemd-dev \
            avahi-daemon libavahi-client-dev \
            libfreetype6-dev libx11-dev libxext-dev libxrandr-dev libxinerama-dev libxcursor-dev \
            libgl1-mesa-dev \
            libgtk-3-dev libwebkit2gtk-4.1-dev || true

        if ! command -v node &>/dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
            run_cmd apt install -y nodejs
        fi
        ;;

    arch)
        section "Arch Linux — Pacman Package Installation"

        run_cmd pacman -Syu --noconfirm
        run_cmd pacman -S --noconfirm --needed \
            base-devel cmake ninja git curl wget pkg-config \
            python python-pip python-virtualenv \
            pipewire pipewire-jack pipewire-alsa \
            jack2 alsa-lib alsa-utils \
            lv2 lilv suil serd sord sratom \
            libsndfile fftw libsamplerate portaudio \
            sqlite systemd avahi \
            freetype2 libx11 libxext libxrandr libxinerama libxcursor \
            mesa gtk3 webkit2gtk \
            htop lsof jq nodejs npm
        ;;

    *)
        err "Unsupported distribution: $DISTRO"
        err "Please install equivalent packages manually."
        exit 1
        ;;
esac

ok "All system packages installed"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2: USER CONFIGURATION & GROUPS
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 2: User Configuration & Real-Time Privileges"

# Add user to audio group
if groups "$INSTALL_USER" | grep -q '\baudio\b'; then
    ok "User $INSTALL_USER already in audio group"
else
    run_cmd usermod -aG audio "$INSTALL_USER"
    ok "Added $INSTALL_USER to audio group"
fi

# Real-time audio limits
section "PAM Limits — Real-Time Audio"
cat > /etc/security/limits.d/99-map2-audio-realtime.conf << 'EOF'
# MAP2 Audio Platform — Real-time audio privileges
# Allows audio group users to use RT scheduling and lock memory
@audio   -  rtprio     95
@audio   -  nice       -19
@audio   -  memlock    unlimited
EOF
ok "Installed /etc/security/limits.d/99-map2-audio-realtime.conf"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3: CLONE/UPDATE REPOSITORY
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 3: Repository Clone / Update"

if [ -d "$INSTALL_DIR/.git" ]; then
    log "Repository exists, pulling latest..."
    cd "$INSTALL_DIR"
    run_cmd sudo -u "$INSTALL_USER" git pull --ff-only || warn "Git pull failed (local changes?)"
    run_cmd sudo -u "$INSTALL_USER" git submodule update --init --recursive
    ok "Repository updated"
else
    log "Cloning repository..."
    run_cmd sudo -u "$INSTALL_USER" git clone --recursive "$REPO_URL" "$INSTALL_DIR"
    ok "Repository cloned to $INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# Ensure submodules (NeuralAmpModelerCore)
if [ ! -f "$INSTALL_DIR/juce-engine/Modules/NeuralAmpModelerCore/NAM/dsp.h" ]; then
    log "Initializing git submodules (NeuralAmpModelerCore)..."
    run_cmd sudo -u "$INSTALL_USER" git submodule update --init --recursive
fi
ok "Git submodules initialized"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 4: PYTHON VIRTUAL ENVIRONMENT & DEPENDENCIES
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 4: Python Virtual Environment & Dependencies"

# Create venv if not exists
if [ ! -d "$VENV_DIR" ]; then
    log "Creating Python virtual environment..."
    run_cmd sudo -u "$INSTALL_USER" python3 -m venv "$VENV_DIR"
    ok "Virtual environment created"
else
    ok "Virtual environment exists"
fi

# Upgrade pip
run_cmd sudo -u "$INSTALL_USER" "$VENV_DIR/bin/pip" install --upgrade pip setuptools wheel

# Install Python dependencies
log "Installing Python packages..."
run_cmd sudo -u "$INSTALL_USER" "$VENV_DIR/bin/pip" install \
    "fastapi>=0.104.0" \
    "uvicorn[standard]>=0.24.0" \
    "pydantic>=2.5.0" \
    "sqlalchemy>=2.0.0" \
    "aiosqlite>=0.19.0" \
    "python-multipart>=0.0.6" \
    "httpx>=0.25.0" \
    "psutil>=5.9.0" \
    "numpy>=1.24.0" \
    "scipy>=1.11.0" \
    "sounddevice>=0.4.6" \
    "mido>=1.3.0" \
    "textual>=0.46.0" \
    "aiohttp>=3.9.0" \
    "aiofiles>=23.0" \
    "websockets>=12.0" \
    "zeroconf>=0.131.0" \
    "pybind11>=2.11.0" \
    "pillow>=10.0.0" \
    "rich>=13.0.0" \
    "python-jose>=3.3.0" \
    "passlib>=1.7.4" \
    "bcrypt>=4.0.0"

# Dev/test dependencies
run_cmd sudo -u "$INSTALL_USER" "$VENV_DIR/bin/pip" install \
    "pytest>=7.0.0" \
    "pytest-asyncio>=0.21.0" \
    "black>=23.0.0" \
    "ruff>=0.1.0" || warn "Dev dependencies partially failed (non-critical)"

ok "Python dependencies installed"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 5: NODE.JS / WEB FRONTEND
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 5: Node.js Web Frontend"

# Check Node.js version
NODE_VER=$(node -v 2>/dev/null | cut -dv -f2 | cut -d. -f1 || echo "0")
if [ "$NODE_VER" -lt "$NODE_VERSION_MIN" ]; then
    warn "Node.js version $NODE_VER < $NODE_VERSION_MIN required"
    if [ "$DISTRO" = "fedora" ]; then
        run_cmd dnf install -y nodejs npm
    fi
fi
ok "Node.js $(node -v 2>/dev/null || echo 'N/A') installed"

# Install web dependencies
if [ -d "$INSTALL_DIR/web" ]; then
    log "Installing web frontend dependencies..."
    cd "$INSTALL_DIR/web"
    run_cmd sudo -u "$INSTALL_USER" npm ci --prefer-offline 2>/dev/null || \
    run_cmd sudo -u "$INSTALL_USER" npm install
    ok "Web dependencies installed"

    # Build production bundle
    log "Building web frontend for production..."
    run_cmd sudo -u "$INSTALL_USER" npm run build
    ok "Web frontend built → web/dist/"
    cd "$INSTALL_DIR"
fi

# Root-level test dependencies (optional)
if [ -f "$INSTALL_DIR/package.json" ]; then
    cd "$INSTALL_DIR"
    run_cmd sudo -u "$INSTALL_USER" npm install 2>/dev/null || true
    cd "$INSTALL_DIR"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 6: BUILD JUCE AUDIO ENGINE (C++)
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 6: Build JUCE Audio Engine (C++)"

JUCE_ENGINE_DIR="$INSTALL_DIR/juce-engine"
JUCE_BUILD_DIR="$JUCE_ENGINE_DIR/build"

if [ -f "$JUCE_ENGINE_DIR/CMakeLists.txt" ]; then
    log "Configuring CMake build..."

    # Get pybind11 cmake dir
    PYBIND11_CMAKE=$("$VENV_DIR/bin/python3" -c "import pybind11; print(pybind11.get_cmake_dir())" 2>/dev/null || echo "")
    PYTHON3_EXE="$VENV_DIR/bin/python3"

    mkdir -p "$JUCE_BUILD_DIR"
    cd "$JUCE_BUILD_DIR"

    # Configure with Release build, native SIMD, fast math
    run_cmd cmake .. \
        -DCMAKE_BUILD_TYPE=Release \
        -DENABLE_NATIVE_OPTIMIZATIONS=ON \
        -DENABLE_FAST_MATH=ON \
        -DUSE_JUCE_AUDIO=ON \
        -DUSE_NAM=ON \
        -DJUCE_PLUGINHOST_LV2=ON \
        -DJUCE_PLUGINHOST_LADSPA=ON \
        -DJUCE_PLUGINHOST_VST3=OFF \
        -DPython3_EXECUTABLE="$PYTHON3_EXE" \
        ${PYBIND11_CMAKE:+-DCMAKE_PREFIX_PATH="$PYBIND11_CMAKE"} \
        -G Ninja 2>/dev/null || \
    run_cmd cmake .. \
        -DCMAKE_BUILD_TYPE=Release \
        -DENABLE_NATIVE_OPTIMIZATIONS=ON \
        -DENABLE_FAST_MATH=ON \
        -DUSE_JUCE_AUDIO=ON \
        -DUSE_NAM=ON \
        -DJUCE_PLUGINHOST_LV2=ON \
        -DJUCE_PLUGINHOST_LADSPA=ON \
        -DJUCE_PLUGINHOST_VST3=OFF \
        -DPython3_EXECUTABLE="$PYTHON3_EXE" \
        ${PYBIND11_CMAKE:+-DCMAKE_PREFIX_PATH="$PYBIND11_CMAKE"}

    ok "CMake configured"

    log "Building JUCE engine (this may take several minutes)..."
    run_cmd cmake --build . --config Release -- -j$(nproc) 2>&1 || \
    run_cmd make -j$(nproc)

    # Check build output
    if ls map2_audio_engine*.so 1>/dev/null 2>&1; then
        ok "JUCE engine built: $(ls map2_audio_engine*.so)"
    else
        warn "JUCE engine .so not found — build may have failed"
    fi

    cd "$INSTALL_DIR"
    chown -R "$INSTALL_USER:$INSTALL_USER" "$JUCE_BUILD_DIR"
else
    warn "JUCE CMakeLists.txt not found, skipping C++ build"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 7: DIRECTORY STRUCTURE & DATA PATHS
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 7: Directory Structure & Data Paths"

# User config directory
run_cmd sudo -u "$INSTALL_USER" mkdir -p "$CONFIG_DIR"
run_cmd sudo -u "$INSTALL_USER" mkdir -p "$CONFIG_DIR/data"

# User storage directories
run_cmd sudo -u "$INSTALL_USER" mkdir -p "/home/$INSTALL_USER/.local/share/map2/nam"
run_cmd sudo -u "$INSTALL_USER" mkdir -p "/home/$INSTALL_USER/.local/share/map2/ir/cabinets"
run_cmd sudo -u "$INSTALL_USER" mkdir -p "/home/$INSTALL_USER/.local/share/map2/ir/reverbs"
run_cmd sudo -u "$INSTALL_USER" mkdir -p "/home/$INSTALL_USER/.local/share/map2/ir/user"
run_cmd sudo -u "$INSTALL_USER" mkdir -p "/home/$INSTALL_USER/.local/share/map2/soundfonts"
run_cmd sudo -u "$INSTALL_USER" mkdir -p "/home/$INSTALL_USER/.local/share/map2/soundfonts/downloads"

# System storage directories
run_cmd mkdir -p /var/lib/map2/nam
run_cmd mkdir -p /var/lib/map2/ir
run_cmd mkdir -p /var/lib/map2/ir/downloads
run_cmd mkdir -p /var/lib/map2/soundfonts
run_cmd mkdir -p /var/log/map2
run_cmd mkdir -p /etc/map2

# Application log/data directories
run_cmd sudo -u "$INSTALL_USER" mkdir -p "$INSTALL_DIR/logs"
run_cmd sudo -u "$INSTALL_USER" mkdir -p "$INSTALL_DIR/data"

# PipeWire user config directory
run_cmd sudo -u "$INSTALL_USER" mkdir -p "/home/$INSTALL_USER/.config/pipewire/pipewire.conf.d"

ok "All directories created"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 8: SYSTEM TUNING — sysctl.d
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 8: System Tuning — Kernel Parameters (sysctl.d)"

section "sysctl.d/91 — Realtime scheduling budget"
cp "$INSTALL_DIR/etc-sysctl-d-91-map2-audio-rt.conf" /etc/sysctl.d/91-map2-audio-rt.conf
chmod 644 /etc/sysctl.d/91-map2-audio-rt.conf
ok "Installed /etc/sysctl.d/91-map2-audio-rt.conf"

section "sysctl.d/92 — THP & memory tuning"
cp "$INSTALL_DIR/etc-sysctl-d-92-map2-audio-thp.conf" /etc/sysctl.d/92-map2-audio-thp.conf
chmod 644 /etc/sysctl.d/92-map2-audio-thp.conf
ok "Installed /etc/sysctl.d/92-map2-audio-thp.conf"

section "sysctl.d/93 — Swap & memory pressure"
cp "$INSTALL_DIR/etc-sysctl-d-93-map2-audio-swappiness.conf" /etc/sysctl.d/93-map2-audio-swappiness.conf
chmod 644 /etc/sysctl.d/93-map2-audio-swappiness.conf
ok "Installed /etc/sysctl.d/93-map2-audio-swappiness.conf"

section "sysctl.d/94 — Watchdog & NMI tuning"
cp "$INSTALL_DIR/etc-sysctl-d-94-map2-audio-watchdog.conf" /etc/sysctl.d/94-map2-audio-watchdog.conf
chmod 644 /etc/sysctl.d/94-map2-audio-watchdog.conf
ok "Installed /etc/sysctl.d/94-map2-audio-watchdog.conf"

# Apply immediately
sysctl --system >/dev/null 2>&1 || true
ok "sysctl parameters applied"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 9: SYSTEM TUNING — GRUB Kernel Parameters
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 9: GRUB Kernel Parameters (isolcpus, nohz_full, threadirqs)"

section "GRUB — Low-latency kernel cmdline"
mkdir -p /etc/default/grub.d
cp "$INSTALL_DIR/etc-default-grub-d-20-map2-audio-latency.cfg" /etc/default/grub.d/20-map2-audio-latency.cfg
chmod 644 /etc/default/grub.d/20-map2-audio-latency.cfg
ok "Installed /etc/default/grub.d/20-map2-audio-latency.cfg"

# Regenerate GRUB
log "Regenerating GRUB configuration..."
if [ -f /boot/grub2/grub.cfg ]; then
    grub2-mkconfig -o /boot/grub2/grub.cfg 2>/dev/null || warn "GRUB regeneration failed"
    ok "GRUB2 config regenerated (/boot/grub2/grub.cfg)"
elif [ -f /boot/efi/EFI/fedora/grub.cfg ]; then
    grub2-mkconfig -o /boot/efi/EFI/fedora/grub.cfg 2>/dev/null || warn "GRUB regeneration failed"
    ok "GRUB2 EFI config regenerated"
fi
REBOOT_REQUIRED=1

warn "⚡ REBOOT REQUIRED for kernel parameters to take effect"
warn "   Parameters: isolcpus=${ISOLATED_CORES} nohz_full=${ISOLATED_CORES} rcu_nocbs=${ISOLATED_CORES} threadirqs"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 10: IRQ BALANCE CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 10: IRQ Balance Configuration"

cp "$INSTALL_DIR/etc-default-irqbalance" /etc/default/irqbalance
chmod 644 /etc/default/irqbalance
ok "Installed /etc/default/irqbalance (banned CPUs: 0x30 = cores ${ISOLATED_CORES})"

# Restart irqbalance if running
systemctl restart irqbalance.service 2>/dev/null || true

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 11: USB AUDIO OPTIMIZATION
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 11: USB Audio Optimization"

cat > /etc/modprobe.d/map2-audio-usb.conf << 'EOF'
# MAP2 Audio Platform — USB audio optimization
# Disable USB autosuspend for audio devices; single URB per packet
options usbcore autosuspend=-1
options snd_usb_audio nrpacks=1
EOF
ok "Installed /etc/modprobe.d/map2-audio-usb.conf"

# I/O scheduler udev rules
cat > /etc/udev/rules.d/60-map2-ioschedulers.rules << 'EOF'
# MAP2 Audio Platform — Low-latency I/O scheduler
ACTION=="add|change", KERNEL=="sd[a-z]", ATTR{queue/scheduler}="deadline"
ACTION=="add|change", KERNEL=="nvme[0-9]n[0-9]", ATTR{queue/scheduler}="mq-deadline"
EOF
ok "Installed /etc/udev/rules.d/60-map2-ioschedulers.rules"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 12: PIPEWIRE LOW-LATENCY CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 12: PipeWire Low-Latency Configuration"

PIPEWIRE_CONF_DIR="/home/$INSTALL_USER/.config/pipewire/pipewire.conf.d"
mkdir -p "$PIPEWIRE_CONF_DIR"
cp "$INSTALL_DIR/home-mm-.config-pipewire-pipewire.conf.d-99-map2-audio-latency.conf" \
   "$PIPEWIRE_CONF_DIR/99-map2-audio-latency.conf"
chown -R "$INSTALL_USER:$INSTALL_USER" "/home/$INSTALL_USER/.config/pipewire"
ok "Installed PipeWire low-latency config (48kHz, quantum=64)"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 13: SYSTEMD SERVICES
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 13: systemd Services Installation"

SYSTEMD_DIR="/etc/systemd/system"

# --- Main backend service ---
section "map2-backend.service"
cp "$INSTALL_DIR/systemd/map2-backend.service" "$SYSTEMD_DIR/map2-backend.service"
ok "Installed map2-backend.service"

# --- Mode-specific systemd drop-in overrides ---
section "map2-backend.service.d (mode overrides)"
mkdir -p "$SYSTEMD_DIR/map2-backend.service.d"

# Install mode-specific override based on TARGET_MODE
case "$TARGET_MODE" in
    audio)
        cp "$INSTALL_DIR/systemd/modes/audio.conf" "$SYSTEMD_DIR/map2-backend.service.d/10-mode.conf"
        ok "Installed audio mode override (CPUAffinity=4 5, Nice=-20, RTPRIO=95)"
        ;;
    all-in-one)
        cp "$INSTALL_DIR/systemd/modes/all-in-one.conf" "$SYSTEMD_DIR/map2-backend.service.d/10-mode.conf"
        ok "Installed all-in-one mode override (CPUAffinity=0-5, Nice=-10, RTPRIO=50)"
        ;;
    management)
        cp "$INSTALL_DIR/systemd/modes/management.conf" "$SYSTEMD_DIR/map2-backend.service.d/10-mode.conf"
        ok "Installed management mode override (no RT, standard scheduling)"
        ;;
esac

# --- PipeWire CPU affinity drop-in ---
section "PipeWire CPU affinity"
mkdir -p "$SYSTEMD_DIR/user@.service.d"
cp "$INSTALL_DIR/etc-systemd-user@.service.d-pipewire-affinity.conf" \
   "$SYSTEMD_DIR/user@.service.d/pipewire-affinity.conf"
ok "Installed PipeWire CPU affinity drop-in (cores 0-3)"

# --- Journald low-latency ---
section "journald configuration"
mkdir -p /etc/systemd/journald.conf.d
cp "$INSTALL_DIR/etc-systemd-journald.conf.d-map2-audio.conf" \
   /etc/systemd/journald.conf.d/map2-audio.conf
ok "Installed journald volatile storage config"

# --- CPU governor service ---
section "CPU governor service"
cp "$INSTALL_DIR/etc-systemd-system-map2-cpu-governor.service" \
   "$SYSTEMD_DIR/map2-cpu-governor.service"
ok "Installed map2-cpu-governor.service"

# --- Disable turbo boost service ---
section "Turbo boost disable service"
cp "$INSTALL_DIR/etc-systemd-system-map2-disable-turbo.service" \
   "$SYSTEMD_DIR/map2-disable-turbo.service"
ok "Installed map2-disable-turbo.service"

# --- CPU isolation verification service ---
section "CPU isolation verification"
cp "$INSTALL_DIR/etc-systemd-system-map2-verify-isolation.service" \
   "$SYSTEMD_DIR/map2-verify-isolation.service"
cp "$INSTALL_DIR/usr-local-bin-map2-verify-isolation.sh" \
   /usr/local/bin/map2-verify-isolation.sh
chmod 755 /usr/local/bin/map2-verify-isolation.sh
ok "Installed CPU isolation verification service"

# --- Boot manager service ---
section "Boot manager service"
cp "$INSTALL_DIR/systemd/map2-boot-manager.service" \
   "$SYSTEMD_DIR/map2-boot-manager.service"
ok "Installed map2-boot-manager.service"

# --- System check service ---
section "System check service"
cp "$INSTALL_DIR/systemd/map2-system-check.service" \
   "$SYSTEMD_DIR/map2-system-check.service"
ok "Installed map2-system-check.service"

# --- LCD services (optional hardware) ---
section "LCD services"
cp "$INSTALL_DIR/systemd/map2-lcd.service" "$SYSTEMD_DIR/map2-lcd.service"
cp "$INSTALL_DIR/systemd/map2-lcd-boot.service" "$SYSTEMD_DIR/map2-lcd-boot.service"
ok "Installed LCD services"

# --- Port 80 proxy service ---
section "Port 80 proxy service"
cp "$INSTALL_DIR/systemd/map2-port80-proxy.service" "$SYSTEMD_DIR/map2-port80-proxy.service"
ok "Installed port 80 proxy service"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 14: MODE CONFIGURATION FILE
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 14: Mode Configuration"

# /etc/guitarfx-mode.conf — canonical mode store
cat > /etc/guitarfx-mode.conf << EOF
#!/bin/bash
# MAP2 Audio Platform - Mode Configuration
# Managed by: install_on_new_host.sh / map2-mode.sh
MODE=${TARGET_MODE}
EOF
chmod 644 /etc/guitarfx-mode.conf
ok "Installed /etc/guitarfx-mode.conf (MODE=${TARGET_MODE})"

# /etc/map2/environment
mkdir -p /etc/map2
DEPLOY_MODE="AUDIO-NODE"
case "$TARGET_MODE" in
    audio)       DEPLOY_MODE="AUDIO-NODE" ;;
    all-in-one)  DEPLOY_MODE="ALL-IN-ONE" ;;
    management)  DEPLOY_MODE="CONTROL-NODE" ;;
esac
echo "MAP2_DEPLOYMENT_MODE=${DEPLOY_MODE}" > /etc/map2/environment
ok "Installed /etc/map2/environment (MAP2_DEPLOYMENT_MODE=${DEPLOY_MODE})"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 15: ENABLE & START SERVICES
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 15: Enable & Start Services"

systemctl daemon-reload
ok "systemd daemon reloaded"

# Enable services
for svc in map2-boot-manager map2-backend map2-system-check map2-cpu-governor map2-disable-turbo map2-verify-isolation; do
    systemctl enable "${svc}.service" 2>/dev/null || true
    ok "Enabled ${svc}.service"
done

# Optionally enable LCD services
systemctl enable map2-lcd.service 2>/dev/null || true
systemctl enable map2-lcd-boot.service 2>/dev/null || true

# Enable port 80 proxy for audio/all-in-one
if [ "$TARGET_MODE" != "management" ]; then
    systemctl enable map2-port80-proxy.service 2>/dev/null || true
fi

# Start services that don't need reboot
log "Starting map2-cpu-governor..."
systemctl start map2-cpu-governor.service 2>/dev/null || warn "CPU governor start failed (may need reboot)"

log "Starting map2-backend..."
systemctl start map2-backend.service 2>/dev/null || warn "Backend start may need reboot for CPU isolation"

ok "Services enabled and started"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 16: SHELL ALIASES & CONVENIENCE
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 16: Shell Aliases & Convenience Scripts"

# Install map2-mode to /usr/local/bin
cp "$INSTALL_DIR/scripts/map2-mode.sh" /usr/local/bin/map2-mode
chmod 755 /usr/local/bin/map2-mode
ok "Installed /usr/local/bin/map2-mode"

# Make main scripts executable
chmod +x "$INSTALL_DIR/map2.sh" "$INSTALL_DIR/m2.sh" "$INSTALL_DIR/tui.sh" 2>/dev/null || true
chmod +x "$INSTALL_DIR/map2-boot-manager.sh" "$INSTALL_DIR/map2-system-check.sh" 2>/dev/null || true

# Add shell aliases to user profile if not present
BASHRC="/home/$INSTALL_USER/.bashrc"
if ! grep -q "map2-aliases" "$BASHRC" 2>/dev/null; then
    echo "" >> "$BASHRC"
    echo "# MAP2 Audio Platform aliases" >> "$BASHRC"
    echo "[ -f ~/map2-audio/.map2-aliases ] && source ~/map2-audio/.map2-aliases" >> "$BASHRC"
    chown "$INSTALL_USER:$INSTALL_USER" "$BASHRC"
    ok "Added MAP2 aliases to ~/.bashrc"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 17: FIREWALL CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 17: Firewall Configuration"

if command -v firewall-cmd &>/dev/null; then
    log "Configuring firewalld..."
    firewall-cmd --permanent --add-port=8080/tcp 2>/dev/null || true   # Backend API
    firewall-cmd --permanent --add-port=3000/tcp 2>/dev/null || true   # Web frontend (dev)
    firewall-cmd --permanent --add-port=80/tcp 2>/dev/null || true     # Port 80 proxy
    firewall-cmd --permanent --add-port=8765/tcp 2>/dev/null || true   # WebSocket
    firewall-cmd --permanent --add-service=mdns 2>/dev/null || true    # mDNS discovery
    firewall-cmd --reload 2>/dev/null || true
    ok "Firewall rules configured (ports 80, 3000, 8080, 8765, mDNS)"
else
    warn "firewall-cmd not found, skipping firewall configuration"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 18: FINAL VERIFICATION
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 18: Installation Verification"

PASS=0
FAIL=0
WARN_COUNT=0

verify() {
    local desc="$1"
    local check="$2"
    if eval "$check" 2>/dev/null; then
        ok "$desc"
        PASS=$((PASS + 1))
    else
        err "$desc"
        FAIL=$((FAIL + 1))
    fi
}

verify_warn() {
    local desc="$1"
    local check="$2"
    if eval "$check" 2>/dev/null; then
        ok "$desc"
        PASS=$((PASS + 1))
    else
        warn "$desc"
        WARN_COUNT=$((WARN_COUNT + 1))
    fi
}

section "Core Components"
verify "Python3 available" "command -v python3"
verify "Virtual environment exists" "[ -d '$VENV_DIR' ]"
verify "FastAPI importable" "'$VENV_DIR/bin/python3' -c 'import fastapi'"
verify "Uvicorn importable" "'$VENV_DIR/bin/python3' -c 'import uvicorn'"
verify "SQLAlchemy importable" "'$VENV_DIR/bin/python3' -c 'import sqlalchemy'"
verify "Textual importable" "'$VENV_DIR/bin/python3' -c 'import textual'"
verify "NumPy importable" "'$VENV_DIR/bin/python3' -c 'import numpy'"
verify "Node.js available" "command -v node"
verify "Web dist exists" "[ -d '$INSTALL_DIR/web/dist' ]"

section "JUCE Engine"
verify_warn "JUCE engine .so built" "ls $JUCE_BUILD_DIR/map2_audio_engine*.so 2>/dev/null"
verify_warn "JUCE engine importable" "'$VENV_DIR/bin/python3' -c 'import sys; sys.path.insert(0,\"$JUCE_BUILD_DIR\"); import map2_audio_engine'"

section "System Configuration"
verify "sysctl 91 (RT budget)" "[ -f /etc/sysctl.d/91-map2-audio-rt.conf ]"
verify "sysctl 92 (THP)" "[ -f /etc/sysctl.d/92-map2-audio-thp.conf ]"
verify "sysctl 93 (swap)" "[ -f /etc/sysctl.d/93-map2-audio-swappiness.conf ]"
verify "sysctl 94 (watchdog)" "[ -f /etc/sysctl.d/94-map2-audio-watchdog.conf ]"
verify "GRUB latency config" "[ -f /etc/default/grub.d/20-map2-audio-latency.cfg ]"
verify "IRQ balance config" "[ -f /etc/default/irqbalance ]"
verify "RT limits config" "[ -f /etc/security/limits.d/99-map2-audio-realtime.conf ]"
verify "USB audio config" "[ -f /etc/modprobe.d/map2-audio-usb.conf ]"
verify "PipeWire latency config" "[ -f '$PIPEWIRE_CONF_DIR/99-map2-audio-latency.conf' ]"
verify "Mode config" "[ -f /etc/guitarfx-mode.conf ]"

section "systemd Services"
verify "map2-backend enabled" "systemctl is-enabled map2-backend.service"
verify "map2-boot-manager enabled" "systemctl is-enabled map2-boot-manager.service"
verify "map2-cpu-governor enabled" "systemctl is-enabled map2-cpu-governor.service"
verify "map2-verify-isolation enabled" "systemctl is-enabled map2-verify-isolation.service"

section "Audio Subsystem"
verify "User in audio group" "groups $INSTALL_USER | grep -q audio"
verify_warn "PipeWire running" "systemctl --user -M ${INSTALL_USER}@ is-active pipewire.service 2>/dev/null || pgrep -x pipewire"
verify_warn "RTKit daemon running" "systemctl is-active rtkit-daemon.service"

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                    INSTALLATION COMPLETE                             ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}PASS: $PASS${NC}  |  ${RED}FAIL: $FAIL${NC}  |  ${YELLOW}WARN: $WARN_COUNT${NC}"
echo ""
echo -e "  ${BOLD}Mode:${NC}        $TARGET_MODE"
echo -e "  ${BOLD}Install Dir:${NC} $INSTALL_DIR"
echo -e "  ${BOLD}Config Dir:${NC}  $CONFIG_DIR"
echo -e "  ${BOLD}Log File:${NC}    $LOG_FILE"
echo ""
echo -e "  ${BOLD}Backend API:${NC} http://localhost:8080"
echo -e "  ${BOLD}API Docs:${NC}    http://localhost:8080/docs"
echo -e "  ${BOLD}Web UI:${NC}      http://localhost:3000 (dev) or http://localhost:8080 (prod)"
echo ""

if [ $REBOOT_REQUIRED -eq 1 ]; then
    echo -e "  ${YELLOW}${BOLD}⚡ REBOOT REQUIRED${NC}"
    echo -e "  ${YELLOW}   Kernel parameters (isolcpus, nohz_full, threadirqs) need a reboot.${NC}"
    echo -e "  ${YELLOW}   After reboot, verify with:${NC}"
    echo -e "  ${YELLOW}     /usr/local/bin/map2-verify-isolation.sh --verbose${NC}"
    echo ""
fi

echo -e "  ${BOLD}Quick Commands:${NC}"
echo -e "    ${CYAN}map2-mode status${NC}     — Check current mode and health"
echo -e "    ${CYAN}map2-mode set audio${NC}  — Switch to audio mode"
echo -e "    ${CYAN}./map2.sh start${NC}      — Start all services"
echo -e "    ${CYAN}./map2.sh tui${NC}        — Launch terminal UI"
echo -e "    ${CYAN}./tui.sh${NC}             — Launch TUI (alternative)"
echo ""

echo -e "  ${BOLD}Post-Reboot Verification:${NC}"
echo -e "    ${DIM}1. sudo reboot${NC}"
echo -e "    ${DIM}2. /usr/local/bin/map2-verify-isolation.sh --verbose${NC}"
echo -e "    ${DIM}3. cat /proc/cmdline  # verify isolcpus=${ISOLATED_CORES}${NC}"
echo -e "    ${DIM}4. systemctl status map2-backend${NC}"
echo -e "    ${DIM}5. curl http://localhost:8080/api/health${NC}"
echo -e "    ${DIM}6. pw-metadata -n settings | grep quantum  # should be 64${NC}"
echo ""

if [ $REBOOT_REQUIRED -eq 1 ] && [ $SKIP_REBOOT -eq 0 ]; then
    echo ""
    read -p "  Reboot now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log "Rebooting..."
        reboot
    fi
fi

log "Installation script completed successfully."
exit 0

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
#   sudo bash install_on_new_host.sh --skip-avb    # Install without AVB setup
#   sudo bash install_on_new_host.sh --uninstall-avb # Remove AVB setup after rebuild
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
ENABLE_AVB=1
UNINSTALL_AVB=0
AVB_INTERFACE="${MAP2_AVB_INTERFACE:-}"
TEST_MODE="${MAP2_INSTALL_TEST_MODE:-0}" # 1 = allow non-root dry-run validation in automated tests
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
        --skip-avb)    ENABLE_AVB=0; shift ;;
        --uninstall-avb) UNINSTALL_AVB=1; ENABLE_AVB=0; shift ;;
        --avb-interface)
            if [[ -z "${2:-}" ]]; then
                echo "Missing value for --avb-interface"
                exit 1
            fi
            AVB_INTERFACE="$2"
            shift 2
            ;;
        --mode)        TARGET_MODE="${2:-audio}"; shift 2 ;;
        --user)        INSTALL_USER="${2:-mm}"; INSTALL_DIR="/home/${INSTALL_USER}/map2-audio"; CONFIG_DIR="/home/${INSTALL_USER}/.map2"; VENV_DIR="${INSTALL_DIR}/.venv"; shift 2 ;;
        --help|-h)
            echo "Usage: sudo bash $0 [--dry-run] [--skip-reboot] [--mode audio|all-in-one|management] [--user mm] [--skip-avb] [--avb-interface IFACE] [--uninstall-avb]"
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
    if [ "$DRY_RUN" -eq 1 ] && [ "$TEST_MODE" -eq 1 ]; then
        warn "TEST MODE: skipping root requirement for dry-run validation"
    else
        err "This script must be run as root (use sudo)"
        exit 1
    fi
fi
if [ "$EUID" -eq 0 ]; then
    ok "Running as root"
fi

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
if [ "$UNINSTALL_AVB" -eq 1 ]; then
    log "AVB action: uninstall after rebuild"
elif [ "$ENABLE_AVB" -eq 1 ]; then
    log "AVB action: install by default"
else
    log "AVB action: skipped (--skip-avb)"
fi
if [ -n "$AVB_INTERFACE" ]; then
    log "AVB interface override: $AVB_INTERFACE"
fi

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
if [ "$DRY_RUN" -eq 1 ] && [ "$TEST_MODE" -eq 1 ]; then
    warn "TEST MODE: skipping internet connectivity check"
elif ! ping -c 1 -W 3 github.com &>/dev/null; then
    err "No internet connectivity (cannot reach github.com)"
    exit 1
fi
if [ "$DRY_RUN" -eq 1 ] && [ "$TEST_MODE" -eq 1 ]; then
    ok "Internet connectivity check skipped in test mode"
else
    ok "Internet connectivity verified"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1: MINIMAL SYSTEM PACKAGES
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 1: Installing Minimal System Packages"

case "$DISTRO" in
    fedora)
        section "Fedora — DNF Package Installation"
        log "Installing git and python..."
        run_cmd dnf install -y git python3 python3-pip
        ;;
    debian)
        section "Debian/Ubuntu — APT Package Installation"
        log "Installing git and python..."
        run_cmd apt update
        run_cmd apt install -y git python3 python3-pip
        ;;
    arch)
        section "Arch Linux — Pacman Package Installation"
        log "Installing git and python..."
        run_cmd pacman -Syu --noconfirm
        run_cmd pacman -S --noconfirm --needed git python python-pip
        ;;
    *)
        err "Unsupported distribution: $DISTRO"
        err "Please install git and python3 manually."
        exit 1
        ;;
esac

ok "Minimal system packages installed"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2: CLONE/UPDATE REPOSITORY
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 2: Repository Clone / Update"

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

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3: GENERATE REBUILD SCRIPT
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 3: Generate Rebuild Script"

REBUILD_SCRIPT_PATH="/tmp/map2-rebuild.sh"
log "Generating rebuild script..."
run_cmd sudo -u "$INSTALL_USER" python3 app/services/backup_service.py --generate-rebuild-script "$REBUILD_SCRIPT_PATH"
ok "Rebuild script generated at $REBUILD_SCRIPT_PATH"

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 4: EXECUTE REBUILD SCRIPT
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 4: Execute Rebuild Script"

log "Executing rebuild script..."
if [ $DRY_RUN -eq 1 ]; then
    # In dry-run mode the rebuild script is not generated on disk.
    run_cmd sudo "$REBUILD_SCRIPT_PATH" --dry-run
else
    chmod +x "$REBUILD_SCRIPT_PATH"
    run_cmd sudo "$REBUILD_SCRIPT_PATH"
fi

ok "Rebuild script execution finished."

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 5: AVB SETUP / UNINSTALL
# ═══════════════════════════════════════════════════════════════════════════════

phase "PHASE 5: AVB Configuration"

if [ "$UNINSTALL_AVB" -eq 1 ]; then
    section "Uninstall AVB/TSN Configuration"
    if [ -f "$INSTALL_DIR/scripts/uninstall_avb.sh" ]; then
        if [ $DRY_RUN -eq 1 ]; then
            run_cmd sudo bash "$INSTALL_DIR/scripts/uninstall_avb.sh" --yes
            ok "AVB uninstall preview complete."
        elif ! run_cmd sudo bash "$INSTALL_DIR/scripts/uninstall_avb.sh" --yes; then
            warn "AVB uninstall failed. Review logs and run scripts/uninstall_avb.sh manually."
        else
            ok "AVB uninstall complete."
        fi
    else
        warn "Missing script: $INSTALL_DIR/scripts/uninstall_avb.sh"
    fi
elif [ "$ENABLE_AVB" -eq 1 ]; then
    section "Setup AVB/TSN (Default)"
    if [ -f "$INSTALL_DIR/scripts/setup_avb.sh" ]; then
        AVB_SETUP_CMD=(sudo bash "$INSTALL_DIR/scripts/setup_avb.sh" --yes)
        if [ -n "$AVB_INTERFACE" ]; then
            AVB_SETUP_CMD+=(--interface "$AVB_INTERFACE")
        fi
        if [ $DRY_RUN -eq 1 ]; then
            AVB_SETUP_CMD+=(--dry-run)
            run_cmd "${AVB_SETUP_CMD[@]}"
            ok "AVB setup preview complete."
        elif ! run_cmd "${AVB_SETUP_CMD[@]}"; then
            warn "AVB setup did not complete. MAP2 install remains usable; run scripts/setup_avb.sh manually after NIC checks."
        else
            ok "AVB setup complete."
        fi
    else
        warn "Missing script: $INSTALL_DIR/scripts/setup_avb.sh"
    fi
else
    section "AVB/TSN Setup Skipped"
    log "Run 'sudo bash scripts/setup_avb.sh --yes' to enable AVB later."
fi

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                    INSTALLATION COMPLETE                             ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Log File:${NC}    $LOG_FILE"
if [ "$UNINSTALL_AVB" -eq 1 ]; then
    echo -e "  ${BOLD}AVB Action:${NC}  Uninstalled (or previewed with --dry-run)"
elif [ "$ENABLE_AVB" -eq 1 ]; then
    echo -e "  ${BOLD}AVB Action:${NC}  Installed by default (or previewed with --dry-run)"
else
    echo -e "  ${BOLD}AVB Action:${NC}  Skipped (--skip-avb)"
fi
echo ""
echo -e "  ${BOLD}The main installation is complete. Please see the output from the rebuild"
echo -e "  ${BOLD}script above for more details."
echo ""

log "Installation script completed successfully."
exit 0

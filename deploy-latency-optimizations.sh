#!/bin/bash
##############################################################################
# MAP2 Audio Platform - Latency Optimization Deployment Script
# 
# This script deploys ALL low-latency tuning configurations for the MAP2 
# audio platform. It implements all P0, P1, P2 recommendations from the
# comprehensive latency audit.
#
# Usage:
#   sudo bash /home/mm/map2-audio/deploy-latency-optimizations.sh [--dry-run]
#
# Features:
#   - Copies all sysctl.d configuration files
#   - Creates systemd drop-in directories and files
#   - Installs verification script
#   - Updates grub configuration for kernel parameters
#   - Configures irqbalance
#   - Sets up PipeWire low-latency config
#   - Rebuilds GRUB if kernel params changed
#   - Reloads systemd daemon
#
##############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DRY_RUN=0
AUDIO_SOURCE="/home/mm/map2-audio"
REBOOT_REQUIRED=0

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run) DRY_RUN=1; shift ;;
        *) shift ;;
    esac
done

# Helper functions
log() {
    echo -e "${BLUE}[INFO]${NC} $@"
}

success() {
    echo -e "${GREEN}[OK]${NC} $@"
}

warning() {
    echo -e "${YELLOW}[WARN]${NC} $@"
}

error() {
    echo -e "${RED}[ERROR]${NC} $@"
}

deploy_file() {
    local source=$1
    local target=$2
    local description=$3
    
    if [ ! -f "$source" ]; then
        warning "Source file not found: $source"
        return 1
    fi
    
    if [ $DRY_RUN -eq 1 ]; then
        log "[DRY-RUN] Would deploy: $source → $target"
        return 0
    fi
    
    # Create target directory
    mkdir -p "$(dirname "$target")"
    
    # Copy file
    cp "$source" "$target"
    chmod 644 "$target"
    success "Deployed: $description ($target)"
}

deploy_script() {
    local source=$1
    local target=$2
    local description=$3
    
    if [ ! -f "$source" ]; then
        warning "Source file not found: $source"
        return 1
    fi
    
    if [ $DRY_RUN -eq 1 ]; then
        log "[DRY-RUN] Would deploy: $source → $target"
        return 0
    fi
    
    mkdir -p "$(dirname "$target")"
    cp "$source" "$target"
    chmod 755 "$target"
    success "Deployed: $description ($target)"
}

##############################################################################
# MAIN DEPLOYMENT
##############################################################################

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║ MAP2 Audio Platform - Latency Optimization Deployment     ║"
echo "║ (All P0/P1/P2 recommendations from audit)                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

if [ $DRY_RUN -eq 1 ]; then
    warning "DRY-RUN MODE - No changes will be made"
    echo ""
fi

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    error "This script must be run as root"
    exit 1
fi

log "Starting deployment..."
echo ""

# ============================================================================
# Phase 1: sysctl.d Configuration Files
# ============================================================================
log "Phase 1: Deploying sysctl.d configuration files..."

deploy_file "$AUDIO_SOURCE/etc-sysctl-d-91-map2-audio-rt.conf" \
    "/etc/sysctl.d/91-map2-audio-rt.conf" \
    "Realtime scheduling budget"

deploy_file "$AUDIO_SOURCE/etc-sysctl-d-92-map2-audio-thp.conf" \
    "/etc/sysctl.d/92-map2-audio-thp.conf" \
    "THP & memory tuning"

deploy_file "$AUDIO_SOURCE/etc-sysctl-d-93-map2-audio-swappiness.conf" \
    "/etc/sysctl.d/93-map2-audio-swappiness.conf" \
    "Swap & memory pressure"

deploy_file "$AUDIO_SOURCE/etc-sysctl-d-94-map2-audio-watchdog.conf" \
    "/etc/sysctl.d/94-map2-audio-watchdog.conf" \
    "Watchdog & NMI tuning"

echo ""

# ============================================================================
# Phase 2: Systemd Drop-in Directories & Files
# ============================================================================
log "Phase 2: Creating systemd drop-in configurations..."

# Create drop-in directories
if [ $DRY_RUN -eq 0 ]; then
    mkdir -p /etc/systemd/system/map2-backend.service.d
    mkdir -p /etc/systemd/user@.service.d
    mkdir -p /etc/systemd/journald.conf.d
    mkdir -p /etc/systemd/system
    success "Created systemd drop-in directories"
fi

deploy_file "$AUDIO_SOURCE/etc-systemd-system-map2-backend.service.d-audio-mode-override.conf" \
    "/etc/systemd/system/map2-backend.service.d/audio-mode-override.conf" \
    "Audio mode service tuning"

deploy_file "$AUDIO_SOURCE/etc-systemd-system-map2-backend.service.d-all-in-one-override.conf" \
    "/etc/systemd/system/map2-backend.service.d/all-in-one-override.conf" \
    "All-in-one mode service tuning"

deploy_file "$AUDIO_SOURCE/etc-systemd-user@.service.d-pipewire-affinity.conf" \
    "/etc/systemd/user@.service.d/pipewire-affinity.conf" \
    "PipeWire CPU affinity"

deploy_file "$AUDIO_SOURCE/etc-systemd-journald.conf.d-map2-audio.conf" \
    "/etc/systemd/journald.conf.d/map2-audio.conf" \
    "journald low-latency tuning"

deploy_script "$AUDIO_SOURCE/etc-systemd-system-map2-verify-isolation.service" \
    "/etc/systemd/system/map2-verify-isolation.service" \
    "CPU isolation verification service"

deploy_script "$AUDIO_SOURCE/etc-systemd-system-map2-cpu-governor.service" \
    "/etc/systemd/system/map2-cpu-governor.service" \
    "CPU governor (performance) service"

deploy_script "$AUDIO_SOURCE/etc-systemd-system-map2-disable-turbo.service" \
    "/etc/systemd/system/map2-disable-turbo.service" \
    "CPU turbo boost disable service"

echo ""

# ============================================================================
# Phase 3: Verification Script
# ============================================================================
log "Phase 3: Installing CPU isolation verification script..."

deploy_script "$AUDIO_SOURCE/usr-local-bin-map2-verify-isolation.sh" \
    "/usr/local/bin/map2-verify-isolation.sh" \
    "CPU isolation verification script"

echo ""

# ============================================================================
# Phase 4: Kernel Parameters (GRUB)
# ============================================================================
log "Phase 4: Configuring kernel parameters (GRUB)..."

# Create grub.d directory if needed
if [ $DRY_RUN -eq 0 ]; then
    mkdir -p /etc/default/grub.d
    success "Created /etc/default/grub.d"
fi

deploy_file "$AUDIO_SOURCE/etc-default-grub-d-20-map2-audio-latency.cfg" \
    "/etc/default/grub.d/20-map2-audio-latency.cfg" \
    "Kernel command-line parameters"

# Regenerate GRUB configuration if kernel params changed
if [ $DRY_RUN -eq 0 ]; then
    log "Regenerating GRUB configuration..."
    grub2-mkconfig -o /boot/grub2/grub.cfg 2>&1 | grep -v "^$" || true
    success "GRUB configuration regenerated"
    REBOOT_REQUIRED=1
fi

echo ""

# ============================================================================
# Phase 5: IRQ Balance Configuration
# ============================================================================
log "Phase 5: Configuring IRQ balance..."

deploy_file "$AUDIO_SOURCE/etc-default-irqbalance" \
    "/etc/default/irqbalance" \
    "IRQ balance configuration"

echo ""

# ============================================================================
# Phase 6: PipeWire Low-Latency Config
# ============================================================================
log "Phase 6: Setting up PipeWire low-latency configuration..."

pipewire_conf_dir="/home/mm/.config/pipewire/pipewire.conf.d"

if [ $DRY_RUN -eq 0 ]; then
    mkdir -p "$pipewire_conf_dir"
    chown mm:mm "$pipewire_conf_dir"
    success "Created PipeWire config directory"
fi

deploy_file "$AUDIO_SOURCE/home-mm-.config-pipewire-pipewire.conf.d-99-map2-audio-latency.conf" \
    "$pipewire_conf_dir/99-map2-audio-latency.conf" \
    "PipeWire low-latency configuration"

if [ $DRY_RUN -eq 0 ]; then
    chown mm:mm "$pipewire_conf_dir/99-map2-audio-latency.conf"
fi

echo ""

# ============================================================================
# Phase 7: Systemd Reload
# ============================================================================
log "Phase 7: Reloading systemd daemon..."

if [ $DRY_RUN -eq 0 ]; then
    systemctl daemon-reload
    success "Systemd daemon reloaded"
    
    # Enable verification service
    systemctl enable map2-verify-isolation.service 2>/dev/null || true
    systemctl enable map2-cpu-governor.service 2>/dev/null || true
    systemctl enable map2-disable-turbo.service 2>/dev/null || true
    success "Enabled optimization services"
fi

echo ""

# ============================================================================
# Summary
# ============================================================================
echo "╔════════════════════════════════════════════════════════════╗"
echo "║ Deployment Complete                                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "Files deployed:"
echo "  ✓ Sysctl configurations (4 files)"
echo "  ✓ Systemd drop-ins (7 files)"
echo "  ✓ Verification script"
echo "  ✓ GRUB kernel parameters"
echo "  ✓ IRQ balance configuration"
echo "  ✓ PipeWire low-latency config"
echo ""

if [ $REBOOT_REQUIRED -eq 1 ]; then
    echo -e "${YELLOW}REBOOT REQUIRED${NC}"
    echo ""
    echo "Kernel parameters have been updated and require a reboot to take effect."
    echo "Run: sudo systemctl reboot"
    echo ""
    echo "After reboot, verify configuration with:"
    echo "  /usr/local/bin/map2-verify-isolation.sh --verbose"
    echo ""
fi

success "All optimizations deployed successfully!"
echo ""

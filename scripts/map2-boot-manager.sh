#!/bin/bash
# MAP2 Audio Platform Boot Manager
# 
# This script is run at boot to:
# 1. Read deployment mode from ~/.map2/deployment.json
# 2. Apply CPU/RT performance optimizations based on mode
# 3. Start appropriate services
#
# Run with: systemctl start map2-boot-manager

set -e

# Configuration
CONFIG_FILE="${HOME}/.map2/deployment.json"
LOG_FILE="/var/log/map2/boot-manager.log"
MAP2_DIR="${HOME}/map2-audio"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Ensure log directory exists
mkdir -p /var/log/map2 2>/dev/null || true

log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" | tee -a "$LOG_FILE" 2>/dev/null || echo "[${timestamp}] [${level}] ${message}"
}

log_info() { log "INFO" "$1"; }
log_warn() { log "WARN" "$1"; }
log_error() { log "ERROR" "$1"; }

# Read deployment mode from config
get_deployment_mode() {
    if [[ -f "$CONFIG_FILE" ]]; then
        mode=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('mode', 'ALL-IN-ONE'))" 2>/dev/null)
        echo "${mode:-ALL-IN-ONE}"
    else
        echo "ALL-IN-ONE"
    fi
}

# Apply CPU governor settings based on mode
apply_cpu_governor() {
    local mode="$1"
    
    case "$mode" in
        "AUDIO-NODE"|"ALL-IN-ONE")
            # Performance mode for audio processing
            log_info "Setting CPU governor to performance for audio mode"
            for cpu in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
                if [[ -w "$cpu" ]]; then
                    echo "performance" > "$cpu" 2>/dev/null || true
                fi
            done
            ;;
        "CONTROL-NODE"|"FRONTEND-ONLY")
            # Ondemand mode for UI-only machines
            log_info "Setting CPU governor to ondemand for control mode"
            for cpu in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
                if [[ -w "$cpu" ]]; then
                    echo "ondemand" > "$cpu" 2>/dev/null || true
                fi
            done
            ;;
    esac
}

# Apply RT scheduling priority settings
apply_rt_settings() {
    local mode="$1"
    
    case "$mode" in
        "AUDIO-NODE"|"ALL-IN-ONE")
            log_info "Applying RT scheduling settings for audio processing"
            
            # Set RT limits for audio group
            if [[ -f /etc/security/limits.d/99-map2-audio.conf ]]; then
                log_info "RT limits already configured"
            else
                cat > /etc/security/limits.d/99-map2-audio.conf 2>/dev/null << 'EOF' || true
# MAP2 Audio Platform RT Limits
@audio   -  rtprio     99
@audio   -  memlock    unlimited
@audio   -  nice       -20
*        -  rtprio     95
*        -  memlock    unlimited
EOF
                log_info "Created RT limits configuration"
            fi
            
            # Disable CPU frequency scaling on audio nodes
            if [[ -f /sys/devices/system/cpu/intel_pstate/no_turbo ]]; then
                echo 0 > /sys/devices/system/cpu/intel_pstate/no_turbo 2>/dev/null || true
                log_info "Enabled Intel Turbo Boost"
            fi
            ;;
        *)
            log_info "Skipping RT settings for non-audio mode"
            ;;
    esac
}

# Apply memory settings
apply_memory_settings() {
    local mode="$1"
    
    case "$mode" in
        "AUDIO-NODE"|"ALL-IN-ONE")
            log_info "Applying memory settings for audio processing"
            
            # Reduce swappiness for audio work
            if [[ -w /proc/sys/vm/swappiness ]]; then
                echo 10 > /proc/sys/vm/swappiness
                log_info "Set vm.swappiness to 10"
            fi
            
            # Disable memory compaction for RT
            if [[ -w /proc/sys/vm/compaction_proactiveness ]]; then
                echo 0 > /proc/sys/vm/compaction_proactiveness 2>/dev/null || true
            fi
            ;;
        "FRONTEND-ONLY")
            log_info "Applying minimal memory settings for frontend"
            # Higher swappiness is fine for UI-only
            if [[ -w /proc/sys/vm/swappiness ]]; then
                echo 60 > /proc/sys/vm/swappiness
            fi
            ;;
    esac
}

# Apply IRQ affinity settings
apply_irq_settings() {
    local mode="$1"
    
    case "$mode" in
        "AUDIO-NODE"|"ALL-IN-ONE")
            log_info "Configuring IRQ affinity for audio devices"
            
            # Try to isolate audio IRQs to specific CPUs
            # This is hardware-specific and may need adjustment
            for irq in /proc/irq/*/smp_affinity_list; do
                # Move non-audio IRQs to CPU 0
                # Audio device IRQs should stay on their assigned CPUs
                :  # Placeholder - actual implementation depends on hardware
            done
            ;;
    esac
}

# Start services based on mode
start_services() {
    local mode="$1"
    
    log_info "Boot manager configured for mode: $mode"
    log_info "Services will be started by systemd dependencies"
    
    # Note: We don't start services here to avoid circular dependencies
    # The boot manager runs before services, configuring environment
    # Services are started by systemd dependency ordering
}

# Export deployment mode as environment variable for other services
export_mode() {
    local mode="$1"
    
    # Write to environment file for systemd services
    echo "MAP2_DEPLOYMENT_MODE=$mode" > /etc/map2/environment 2>/dev/null || {
        mkdir -p /etc/map2 2>/dev/null || true
        echo "MAP2_DEPLOYMENT_MODE=$mode" > /etc/map2/environment 2>/dev/null || true
    }
    
    # Also write to user's profile
    if [[ -f "$HOME/.bashrc" ]]; then
        if ! grep -q "MAP2_DEPLOYMENT_MODE" "$HOME/.bashrc"; then
            echo "export MAP2_DEPLOYMENT_MODE=$mode" >> "$HOME/.bashrc"
        else
            sed -i "s/MAP2_DEPLOYMENT_MODE=.*/MAP2_DEPLOYMENT_MODE=$mode/" "$HOME/.bashrc"
        fi
    fi
    
    log_info "Exported MAP2_DEPLOYMENT_MODE=$mode"
}

# Main boot sequence
main() {
    log_info "=========================================="
    log_info "MAP2 Boot Manager Starting"
    log_info "=========================================="
    
    # Get deployment mode
    MODE=$(get_deployment_mode)
    log_info "Deployment mode: $MODE"
    
    # Export mode to environment
    export_mode "$MODE"
    
    # Apply optimizations (only if running as root)
    if [[ $EUID -eq 0 ]]; then
        apply_cpu_governor "$MODE"
        apply_rt_settings "$MODE"
        apply_memory_settings "$MODE"
        apply_irq_settings "$MODE"
    else
        log_warn "Not running as root, skipping system optimizations"
    fi
    
    # Start services
    start_services "$MODE"
    
    log_info "=========================================="
    log_info "MAP2 Boot Manager Complete"
    log_info "Mode: $MODE"
    log_info "=========================================="
}

# Run main
main "$@"

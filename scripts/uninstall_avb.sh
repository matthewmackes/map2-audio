#!/bin/bash
#
# MAP2 Audio Platform - AVB/TSN Uninstall Script
#
# Cleanly removes AVB/TSN configuration:
# - Stops and disables systemd services
# - Removes qdisc configuration
# - Deletes VLAN interfaces
# - Removes configuration files
# - Preserves backups in /var/lib/map2/avb-backup/
#
# Usage:
#   sudo ./uninstall_avb.sh            # Interactive mode
#   sudo ./uninstall_avb.sh --yes      # Non-interactive
#   sudo ./uninstall_avb.sh --preserve-config  # Keep MAP2 config
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Flags
AUTO_YES=false
PRESERVE_CONFIG=false
SRP_MANIFEST="/var/lib/map2/srp-install-manifest.json"

# ============================================================================
# Helper Functions
# ============================================================================

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

prompt_yes_no() {
    local prompt="$1"

    if [[ "$AUTO_YES" == true ]]; then
        return 0
    fi

    local yn
    read -p "$prompt [y/N]: " yn
    yn=${yn:-n}

    case "$yn" in
        [Yy]*) return 0 ;;
        *) return 1 ;;
    esac
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# ============================================================================
# Backup Functions
# ============================================================================

create_backup() {
    local backup_dir="/var/lib/map2/avb-backup"
    local timestamp=$(date +%Y%m%d-%H%M%S)

    log_info "Creating backup in $backup_dir..."

    mkdir -p "$backup_dir"

    # Backup systemd services
    for service in map2-ptp4l.service map2-phc2sys.service map2-srpd.service map2-avb.target; do
        if [[ -f "/etc/systemd/system/$service" ]]; then
            cp "/etc/systemd/system/$service" "$backup_dir/${service}.${timestamp}"
        fi
    done

    if [[ -f "/etc/default/map2-srpd" ]]; then
        cp "/etc/default/map2-srpd" "$backup_dir/map2-srpd.default.${timestamp}"
    fi

    if [[ -f "$SRP_MANIFEST" ]]; then
        cp "$SRP_MANIFEST" "$backup_dir/srp-install-manifest.${timestamp}.json"
    fi

    # Backup PTP config
    if [[ -f "/etc/ptp4l.conf" ]]; then
        cp "/etc/ptp4l.conf" "$backup_dir/ptp4l.conf.${timestamp}"
    fi

    # Backup MAP2 config
    if [[ -f "$HOME/.map2/config.json" ]] && [[ "$PRESERVE_CONFIG" == false ]]; then
        cp "$HOME/.map2/config.json" "$backup_dir/config.json.${timestamp}"
    fi

    log_success "Backup created: $backup_dir"
}

# ============================================================================
# Service Removal
# ============================================================================

stop_services() {
    log_info "Stopping AVB services..."

    # Stop target (stops all dependent services)
    if systemctl is-active --quiet map2-avb.target 2>/dev/null; then
        systemctl stop map2-avb.target
        log_success "Stopped map2-avb.target"
    fi

    # Stop individual services
    for service in map2-ptp4l.service map2-phc2sys.service map2-srpd.service; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            systemctl stop "$service"
            log_success "Stopped $service"
        fi
    done
}

disable_services() {
    log_info "Disabling AVB services..."

    for service in map2-ptp4l.service map2-phc2sys.service map2-srpd.service map2-avb.target; do
        if systemctl is-enabled --quiet "$service" 2>/dev/null; then
            systemctl disable "$service"
            log_success "Disabled $service"
        fi
    done
}

remove_services() {
    log_info "Removing systemd service files..."

    for service in map2-ptp4l.service map2-phc2sys.service map2-srpd.service map2-avb.target; do
        if [[ -f "/etc/systemd/system/$service" ]]; then
            rm "/etc/systemd/system/$service"
            log_success "Removed $service"
        fi
    done

    if [[ -f "/etc/default/map2-srpd" ]]; then
        rm "/etc/default/map2-srpd"
        log_success "Removed /etc/default/map2-srpd"
    fi

    systemctl daemon-reload
}

remove_srp_artifacts_from_manifest() {
    if [[ ! -f "$SRP_MANIFEST" ]]; then
        return 0
    fi

    log_info "Cleaning SRP artifacts from install manifest..."

    python3 <<EOF
import json
import os
import shutil

manifest_path = "${SRP_MANIFEST}"
allow_prefixes_raw = os.environ.get("MAP2_SRPD_UNINSTALL_ALLOW_PREFIXES", "/usr/local/,/etc/")
allow_prefixes = [prefix.strip() for prefix in allow_prefixes_raw.split(",") if prefix.strip()]

def _is_allowed(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in allow_prefixes)

try:
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
except Exception as e:
    print(f"Failed to parse manifest: {e}")
    raise SystemExit(0)

install_mode = manifest.get("install_mode", "")
binary_path = manifest.get("binary_path") or ""
source_root = manifest.get("source_root") or ""
managed_files = manifest.get("managed_files") or []

if install_mode == "source" and binary_path and _is_allowed(binary_path):
    if os.path.exists(binary_path):
        os.remove(binary_path)
        print(f"Removed source-installed daemon binary: {binary_path}")

if install_mode == "source" and source_root and _is_allowed(source_root):
    if os.path.isdir(source_root):
        shutil.rmtree(source_root, ignore_errors=True)
        print(f"Removed source tree: {source_root}")

for path in managed_files:
    if path == manifest_path:
        continue
    if isinstance(path, str) and _is_allowed(path) and os.path.exists(path):
        try:
            os.remove(path)
            print(f"Removed managed file: {path}")
        except IsADirectoryError:
            shutil.rmtree(path, ignore_errors=True)

if os.path.exists(manifest_path):
    os.remove(manifest_path)
    print(f"Removed manifest: {manifest_path}")
EOF
}

# ============================================================================
# Network Configuration Removal
# ============================================================================

remove_qdiscs() {
    log_info "Removing TSN qdiscs..."

    # Find interfaces with AVB qdiscs
    local interfaces=()

    for iface in /sys/class/net/*; do
        iface=$(basename "$iface")
        [[ "$iface" == "lo" ]] && continue

        if tc qdisc show dev "$iface" 2>/dev/null | grep -q "cbs"; then
            interfaces+=("$iface")
        fi
    done

    if [[ ${#interfaces[@]} -eq 0 ]]; then
        log_info "No AVB qdiscs found"
        return 0
    fi

    for iface in "${interfaces[@]}"; do
        log_info "Removing qdiscs from $iface..."

        # Check if backup exists
        local backup_file="/var/lib/map2/qdisc-backup-${iface}.txt"
        if [[ -f "$backup_file" ]]; then
            log_info "Backup found: $backup_file"
            if prompt_yes_no "Restore from backup?"; then
                # Note: Restoring qdiscs from backup is complex and may fail
                # Safer to just remove and let default pfifo_fast take over
                log_warning "Automatic restore not implemented - removing instead"
            fi
        fi

        # Remove all qdiscs (revert to default)
        tc qdisc del dev "$iface" root 2>/dev/null || true
        log_success "Removed qdiscs from $iface"
    done
}

remove_vlan_interfaces() {
    log_info "Removing AVB VLAN interfaces..."

    # Find VLAN interfaces (typically .2)
    local vlan_interfaces=()

    for iface in /sys/class/net/*; do
        iface=$(basename "$iface")

        # Check if it's a VLAN interface with ID 2
        if [[ "$iface" =~ \.2$ ]]; then
            vlan_interfaces+=("$iface")
        fi
    done

    if [[ ${#vlan_interfaces[@]} -eq 0 ]]; then
        log_info "No AVB VLAN interfaces found"
        return 0
    fi

    for vlan_iface in "${vlan_interfaces[@]}"; do
        if ip link show "$vlan_iface" &>/dev/null; then
            ip link delete "$vlan_iface"
            log_success "Removed VLAN interface $vlan_iface"
        fi
    done
}

# ============================================================================
# Configuration File Removal
# ============================================================================

remove_config_files() {
    log_info "Removing configuration files..."

    # Remove PTP config
    if [[ -f "/etc/ptp4l.conf" ]]; then
        rm "/etc/ptp4l.conf"
        log_success "Removed /etc/ptp4l.conf"
    fi

    # Remove AVB enabled marker
    if [[ -f "/etc/map2/avb-enabled" ]]; then
        rm "/etc/map2/avb-enabled"
        log_success "Removed /etc/map2/avb-enabled"
    fi

    # Remove empty directory
    if [[ -d "/etc/map2" ]] && [[ -z "$(ls -A /etc/map2)" ]]; then
        rmdir "/etc/map2"
    fi
}

update_map2_config() {
    if [[ "$PRESERVE_CONFIG" == true ]]; then
        log_info "Preserving MAP2 config (--preserve-config flag)"
        return 0
    fi

    log_info "Updating MAP2 configuration..."

    local config_file="$HOME/.map2/config.json"

    if [[ ! -f "$config_file" ]]; then
        log_info "No MAP2 config found"
        return 0
    fi

    # Disable AVB in config using Python
    python3 <<EOF
import json
import os

config_file = "$config_file"

if not os.path.exists(config_file):
    exit(0)

with open(config_file, 'r') as f:
    config = json.load(f)

if 'avb' in config:
    config['avb']['enabled'] = False
    if 'srp' in config['avb'] and isinstance(config['avb']['srp'], dict):
        config['avb']['srp']['enabled'] = False
        config['avb']['srp']['required'] = False

    with open(config_file, 'w') as f:
        json.dump(config, f, indent=2)

    print("AVB disabled in MAP2 config")
else:
    print("No AVB config found")
EOF

    log_success "MAP2 config updated"
}

# ============================================================================
# Verification
# ============================================================================

verify_removal() {
    log_info "Verifying removal..."

    local issues=()

    # Check services
    for service in map2-ptp4l.service map2-phc2sys.service map2-srpd.service; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            issues+=("Service $service still running")
        fi
    done

    # Check service files
    for service in map2-ptp4l.service map2-phc2sys.service map2-srpd.service map2-avb.target; do
        if [[ -f "/etc/systemd/system/$service" ]]; then
            issues+=("Service file $service still exists")
        fi
    done

    if [[ -f "/etc/default/map2-srpd" ]]; then
        issues+=("SRP environment file /etc/default/map2-srpd still exists")
    fi

    if [[ -f "$SRP_MANIFEST" ]]; then
        issues+=("SRP install manifest $SRP_MANIFEST still exists")
    fi

    # Check marker file
    if [[ -f "/etc/map2/avb-enabled" ]]; then
        issues+=("Marker file /etc/map2/avb-enabled still exists")
    fi

    if [[ ${#issues[@]} -eq 0 ]]; then
        log_success "Verification passed - AVB fully removed"
    else
        log_warning "Some items remain:"
        for issue in "${issues[@]}"; do
            echo "  - $issue"
        done
    fi
}

# ============================================================================
# Main
# ============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --yes|-y)
                AUTO_YES=true
                shift
                ;;
            --preserve-config)
                PRESERVE_CONFIG=true
                shift
                ;;
            --help|-h)
                cat <<EOF
MAP2 Audio AVB/TSN Uninstall Script

Usage: sudo $0 [OPTIONS]

Options:
  --yes, -y             Non-interactive mode (auto-confirm)
  --preserve-config     Keep AVB settings in ~/.map2/config.json
  --help, -h            Show this help message

Examples:
  sudo $0                       # Interactive removal
  sudo $0 --yes                 # Non-interactive removal
  sudo $0 --preserve-config     # Remove but keep config

Backups:
  All files backed up to /var/lib/map2/avb-backup/ before removal

EOF
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done
}

main() {
    parse_args "$@"

    echo -e "${BLUE}"
    cat <<'EOF'
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║        MAP2 Audio Platform - AVB/TSN Uninstall                    ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    check_root

    # Confirmation
    log_warning "This will remove all AVB/TSN configuration:"
    echo "  - Stop and disable systemd services"
    echo "  - Remove SRP daemon service wiring"
    echo "  - Remove qdisc configuration"
    echo "  - Delete VLAN interfaces"
    echo "  - Remove configuration files"
    echo
    log_info "Backups will be preserved in /var/lib/map2/avb-backup/"
    echo

    if ! prompt_yes_no "Proceed with uninstall?"; then
        log_info "Uninstall cancelled"
        exit 0
    fi

    # Create backup first
    create_backup

    # Execute removal
    stop_services
    disable_services
    remove_qdiscs
    remove_vlan_interfaces
    remove_services
    remove_srp_artifacts_from_manifest
    remove_config_files
    update_map2_config

    # Verify
    verify_removal

    # Summary
    cat <<EOF

${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${GREEN}AVB/TSN Uninstall Complete!${NC}
${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

${BLUE}What was removed:${NC}
  ✓ Systemd services (ptp4l, phc2sys, srpd, avb.target)
  ✓ TSN traffic shaping (qdiscs)
  ✓ VLAN interfaces
  ✓ Configuration files
  ✓ SRP install manifest/source artifacts (when tracked)

${BLUE}Backups preserved:${NC}
  /var/lib/map2/avb-backup/

${BLUE}Next steps:${NC}
  1. Restart MAP2 backend:
     sudo systemctl restart map2-backend

  2. Verify AVB disabled in web UI:
     http://localhost:3000/avb (should show "not available")

${BLUE}To re-enable AVB:${NC}
  sudo ./scripts/setup_avb.sh

${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
EOF
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi

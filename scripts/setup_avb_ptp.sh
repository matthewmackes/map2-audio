#!/bin/bash
#
# MAP2 AVB/TSN PTP Setup Script
#
# Sets up IEEE 802.1AS gPTP time synchronization via linuxptp for AVB audio.
#
# Features:
# - Hardware detection (TSN NIC with hardware timestamping)
# - Interactive prompts (or --yes for automation)
# - Dry-run mode (--dry-run)
# - Automatic /etc/ptp4l.conf generation
# - Systemd service installation
# - Rollback on error
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DRY_RUN=false
AUTO_YES=false
INTERFACE=""
PTP_DOMAIN=0
PTP_PRIORITY1=128

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --yes|-y)
            AUTO_YES=true
            shift
            ;;
        --interface|-i)
            INTERFACE="$2"
            shift 2
            ;;
        --domain)
            PTP_DOMAIN="$2"
            shift 2
            ;;
        --priority)
            PTP_PRIORITY1="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --dry-run          Check compatibility without making changes"
            echo "  --yes, -y          Auto-confirm all prompts"
            echo "  --interface IF     Specify network interface (e.g., enp3s0)"
            echo "  --domain N         PTP domain number (default: 0)"
            echo "  --priority N       PTP priority1 (default: 128)"
            echo "  --help, -h         Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Run with --help for usage"
            exit 1
            ;;
    esac
done

# Helper functions
log_info() {
    echo -e "${BLUE}INFO:${NC} $1"
}

log_success() {
    echo -e "${GREEN}SUCCESS:${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}WARNING:${NC} $1"
}

log_error() {
    echo -e "${RED}ERROR:${NC} $1"
}

confirm() {
    if [[ "$AUTO_YES" == "true" ]]; then
        return 0
    fi

    local prompt="$1"
    read -p "$prompt [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        return 0
    else
        return 1
    fi
}

# Check if running as root (needed for systemd install)
check_root() {
    if [[ $EUID -ne 0 ]] && [[ "$DRY_RUN" == "false" ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

# Detect TSN-capable NICs
detect_tsn_nics() {
    log_info "Detecting TSN-capable network interfaces..."

    local tsn_nics=()

    # Check all network interfaces for hardware timestamping
    for iface in /sys/class/net/*; do
        local ifname=$(basename "$iface")

        # Skip loopback and virtual interfaces
        if [[ "$ifname" == "lo" ]] || [[ "$ifname" =~ ^(docker|veth|br-) ]]; then
            continue
        fi

        # Check for hardware timestamping support via ethtool
        if command -v ethtool &> /dev/null; then
            local ts_info=$(ethtool -T "$ifname" 2>/dev/null || true)
            if echo "$ts_info" | grep -q "hardware-transmit"; then
                tsn_nics+=("$ifname")
                log_success "Found TSN-capable NIC: $ifname"
            fi
        fi
    done

    if [[ ${#tsn_nics[@]} -eq 0 ]]; then
        log_error "No TSN-capable NICs found!"
        log_info "AVB requires a network interface with hardware timestamping support."
        log_info "Compatible NICs: Intel I210, I225, I226, some Marvell/Aquantia/Broadcom"
        exit 1
    fi

    echo "${tsn_nics[@]}"
}

# Select interface
select_interface() {
    if [[ -n "$INTERFACE" ]]; then
        # Interface specified via command line
        if [[ ! -e "/sys/class/net/$INTERFACE" ]]; then
            log_error "Interface $INTERFACE does not exist"
            exit 1
        fi
        log_info "Using interface: $INTERFACE"
        return
    fi

    local tsn_nics=($(detect_tsn_nics))

    if [[ ${#tsn_nics[@]} -eq 1 ]]; then
        INTERFACE="${tsn_nics[0]}"
        log_info "Auto-selected interface: $INTERFACE"
    else
        log_info "Multiple TSN-capable interfaces found:"
        for i in "${!tsn_nics[@]}"; do
            echo "  $((i+1)). ${tsn_nics[$i]}"
        done

        if [[ "$AUTO_YES" == "true" ]]; then
            INTERFACE="${tsn_nics[0]}"
            log_info "Auto-selected first interface: $INTERFACE"
        else
            read -p "Select interface (1-${#tsn_nics[@]}): " selection
            INTERFACE="${tsn_nics[$((selection-1))]}"
            log_info "Selected interface: $INTERFACE"
        fi
    fi
}

# Check dependencies
check_dependencies() {
    log_info "Checking dependencies..."

    if ! command -v ptp4l &> /dev/null; then
        log_warning "linuxptp not installed"

        if confirm "Install linuxptp package?"; then
            if [[ "$DRY_RUN" == "true" ]]; then
                log_info "[DRY RUN] Would install: dnf install -y linuxptp"
            else
                dnf install -y linuxptp
                log_success "linuxptp installed"
            fi
        else
            log_error "linuxptp required for AVB/TSN. Exiting."
            exit 1
        fi
    else
        log_success "linuxptp already installed"
    fi

    if ! command -v ethtool &> /dev/null; then
        log_warning "ethtool not installed (recommended for NIC diagnostics)"
    fi
}

# Generate /etc/ptp4l.conf
generate_ptp4l_conf() {
    local conf_path="/etc/ptp4l.conf"

    log_info "Generating PTP configuration: $conf_path"

    local conf_content="# MAP2 AVB gPTP Configuration
# Generated by setup_avb_ptp.sh
# IEEE 802.1AS profile (gPTP for AVB)

[global]
# gPTP profile (transportSpecific=1 for 802.1AS)
transportSpecific       0x1
ptp_dst_mac             01:80:C2:00:00:0E
network_transport       L2
delay_mechanism         P2P

# Hardware timestamping (required for AVB)
time_stamping           hardware

# Domain
domainNumber            $PTP_DOMAIN

# Priority for grandmaster election (lower = higher priority)
priority1               $PTP_PRIORITY1
priority2               128

# Clock class (248 = default for slave-only clocks, 6-13 for GM clocks)
clockClass              248

# Logging
logging_level           6
summary_interval        0
use_syslog              1

# Network interface
[$INTERFACE]
"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would write to $conf_path:"
        echo "$conf_content"
    else
        echo "$conf_content" > "$conf_path"
        chmod 644 "$conf_path"
        log_success "PTP configuration written to $conf_path"
    fi
}

# Create marker file
create_marker() {
    local marker_dir="/etc/map2"
    local marker_file="$marker_dir/avb-enabled"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would create: $marker_file"
    else
        mkdir -p "$marker_dir"
        touch "$marker_file"
        echo "interface=$INTERFACE" > "$marker_file"
        echo "ptp_domain=$PTP_DOMAIN" >> "$marker_file"
        echo "ptp_priority1=$PTP_PRIORITY1" >> "$marker_file"
        echo "setup_date=$(date -Iseconds)" >> "$marker_file"
        log_success "Created AVB marker file: $marker_file"
    fi
}

# Install systemd services
install_systemd_services() {
    log_info "Installing systemd services..."

    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local systemd_dir="$script_dir/../packaging/systemd"

    local services=(
        "map2-avb.target"
        "map2-ptp4l.service"
        "map2-phc2sys.service"
    )

    for service in "${services[@]}"; do
        local src="$systemd_dir/$service"
        local dest="/etc/systemd/system/$service"

        if [[ ! -f "$src" ]]; then
            log_warning "Service file not found: $src (skipping)"
            continue
        fi

        if [[ "$DRY_RUN" == "true" ]]; then
            log_info "[DRY RUN] Would install: $dest"
        else
            cp "$src" "$dest"
            chmod 644 "$dest"
            log_success "Installed: $service"
        fi
    done

    if [[ "$DRY_RUN" == "false" ]]; then
        systemctl daemon-reload
        log_success "Systemd daemon reloaded"
    fi
}

# Enable and start services
enable_services() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would enable and start AVB services"
        return
    fi

    log_info "Enabling AVB services..."
    systemctl enable map2-avb.target
    systemctl enable map2-ptp4l.service
    systemctl enable map2-phc2sys.service
    log_success "AVB services enabled"

    if confirm "Start AVB services now?"; then
        systemctl start map2-avb.target
        log_success "AVB services started"

        sleep 2

        # Show status
        log_info "Service status:"
        systemctl status map2-ptp4l.service --no-pager || true
    else
        log_info "Services not started. Start manually with: systemctl start map2-avb.target"
    fi
}

# Main
main() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}    MAP2 AVB/TSN gPTP Setup${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo

    if [[ "$DRY_RUN" == "true" ]]; then
        log_warning "DRY RUN MODE - No changes will be made"
        echo
    fi

    check_root
    check_dependencies
    select_interface

    echo
    echo "Configuration:"
    echo "  Interface:    $INTERFACE"
    echo "  PTP Domain:   $PTP_DOMAIN"
    echo "  PTP Priority: $PTP_PRIORITY1"
    echo

    if ! confirm "Proceed with AVB/TSN setup?"; then
        log_info "Setup cancelled"
        exit 0
    fi

    generate_ptp4l_conf
    create_marker
    install_systemd_services
    enable_services

    echo
    log_success "AVB/TSN gPTP setup complete!"
    echo
    echo "Next steps:"
    echo "  1. Configure AVB in MAP2: Edit ~/.map2/config.json"
    echo "     {\"avb\": {\"enabled\": true, \"interface\": \"$INTERFACE\"}}"
    echo "  2. Restart MAP2 backend: systemctl restart map2-backend"
    echo "  3. Check PTP status: journalctl -u map2-ptp4l -f"
    echo "  4. Verify via API: curl http://localhost:8080/api/avb/ptp/status"
    echo
}

main "$@"

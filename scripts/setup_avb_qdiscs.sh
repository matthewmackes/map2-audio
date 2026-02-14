#!/bin/bash
#
# MAP2 AVB/TSN Qdisc (Traffic Shaping) Setup Script
#
# Configures TSN traffic classes and Credit-Based Shaper (CBS) for AVB audio.
#
# Features:
# - Backs up existing qdisc configuration
# - Applies mqprio (multi-queue priority), CBS (credit-based shaper), ETF (earliest TxTime first)
# - VLAN 2 creation for AVB Class A traffic
# - Validation and rollback on error
# - Idempotent (safe to re-run)
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
INTERFACE=""
BACKUP_DIR="/var/lib/map2"
DRY_RUN=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --interface|-i)
            INTERFACE="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 --interface <iface> [--dry-run]"
            echo ""
            echo "Options:"
            echo "  --interface IF     Network interface for AVB (required)"
            echo "  --dry-run          Show what would be done without applying"
            echo "  --help, -h         Show this help"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
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

# Validate interface
if [[ -z "$INTERFACE" ]]; then
    # Try to read from AVB marker file
    if [[ -f "/etc/map2/avb-enabled" ]]; then
        INTERFACE=$(grep "^interface=" /etc/map2/avb-enabled | cut -d= -f2)
    fi

    if [[ -z "$INTERFACE" ]]; then
        log_error "No interface specified. Use --interface or run setup_avb_ptp.sh first"
        exit 1
    fi
fi

if [[ ! -e "/sys/class/net/$INTERFACE" ]]; then
    log_error "Interface $INTERFACE does not exist"
    exit 1
fi

log_info "Using interface: $INTERFACE"

# Backup existing qdisc
backup_qdisc() {
    local backup_file="$BACKUP_DIR/qdisc-backup-$INTERFACE.txt"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would backup qdisc to: $backup_file"
        return
    fi

    mkdir -p "$BACKUP_DIR"

    log_info "Backing up existing qdisc configuration..."
    tc qdisc show dev "$INTERFACE" > "$backup_file"
    log_success "Backup saved to: $backup_file"
}

# Calculate CBS parameters for AVB Class A
# AVB Class A: 8kHz observation interval, 75% max bandwidth for Class A traffic
calculate_cbs_params() {
    local link_speed_mbps=1000  # Assume 1Gbps link
    local class_a_bandwidth_mbps=750  # 75% of 1Gbps for Class A

    # For 48kHz stereo 24-bit audio:
    # - Sample rate: 48000 Hz
    # - Channels: 2
    # - Bit depth: 24 bits
    # - Raw bandwidth: 48000 * 2 * 24 / 8 = 288000 bytes/sec = ~2.3 Mbps
    # - AVB overhead (Ethernet + AVTP headers): ~20%
    # - Total per stream: ~2.8 Mbps

    # CBS idleslope: Rate at which credit accumulates when queue is idle
    # For simplicity, allocate 10 Mbps per stream (allows ~3-4 streams on Class A)
    local idleslope=$((10 * 1000000))  # 10 Mbps in bits/sec

    # sendslope: Rate at which credit depletes (negative of remaining bandwidth)
    local sendslope=$((-1 * (link_speed_mbps * 1000000 - idleslope)))

    # hicredit/locredit: Maximum credit accumulation
    # Rule of thumb: (idleslope * MTU) / link_speed
    local mtu=1522  # 1500 + Ethernet overhead
    local hicredit=$(( (idleslope * mtu * 8) / (link_speed_mbps * 1000000) ))
    local locredit=$(( (sendslope * mtu * 8) / (link_speed_mbps * 1000000) ))

    echo "$idleslope $sendslope $hicredit $locredit"
}

# Apply mqprio qdisc
apply_mqprio() {
    log_info "Applying mqprio (multi-queue priority scheduling)..."

    # 3 traffic classes:
    # TC 0: Best effort (default)
    # TC 1: AVB Class B (lower priority)
    # TC 2: AVB Class A (highest priority)
    #
    # Priority map: maps packet priority (0-15) to traffic class
    # Default: all traffic to TC 0 (best effort) except what we explicitly route

    local cmd="tc qdisc replace dev $INTERFACE root handle 100: mqprio \
        num_tc 3 \
        map 0 0 0 1 2 0 0 0 0 0 0 0 0 0 0 0 \
        queues 1@0 1@1 1@2 \
        hw 0"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would run: $cmd"
    else
        eval "$cmd"
        log_success "mqprio applied"
    fi
}

# Apply CBS qdisc to AVB Class A traffic class
apply_cbs() {
    log_info "Applying CBS (Credit-Based Shaper) for AVB Class A..."

    read -r idleslope sendslope hicredit locredit <<< "$(calculate_cbs_params)"

    log_info "CBS parameters:"
    log_info "  idleslope:  $idleslope bps (~10 Mbps)"
    log_info "  sendslope:  $sendslope bps"
    log_info "  hicredit:   $hicredit bytes"
    log_info "  locredit:   $locredit bytes"

    # Apply CBS to TC 2 (AVB Class A)
    # Parent handle 100:3 refers to queue 2 (third queue, TC 2)
    local cmd="tc qdisc replace dev $INTERFACE parent 100:3 cbs \
        idleslope $idleslope \
        sendslope $sendslope \
        hicredit $hicredit \
        locredit $locredit \
        offload 1"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would run: $cmd"
    else
        if eval "$cmd" 2>/dev/null; then
            log_success "CBS applied with hardware offload"
        else
            log_warning "Hardware offload failed, trying software CBS..."
            cmd="${cmd% offload 1}"  # Remove offload flag
            eval "$cmd"
            log_success "CBS applied (software mode)"
        fi
    fi
}

# Apply ETF qdisc (Earliest TxTime First) for precise timing
apply_etf() {
    log_info "Checking ETF (Earliest TxTime First) support..."

    # ETF requires:
    # - Hardware support (some NICs)
    # - CLOCK_TAI (from PTP)
    # Delta: time before scheduled transmission (in nanoseconds)

    local delta=500000  # 500 microseconds

    local cmd="tc qdisc replace dev $INTERFACE parent 100:3 handle 200: etf \
        clockid CLOCK_TAI \
        delta $delta \
        offload 1"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would attempt ETF with delta=$delta ns"
        return
    fi

    # ETF is optional - if it fails, continue without it
    if eval "$cmd" 2>/dev/null; then
        log_success "ETF applied (hardware launch time control enabled)"
    else
        log_warning "ETF not supported on this NIC (continuing without precise launch time)"
    fi
}

# Create VLAN 2 for AVB traffic
create_vlan() {
    local vlan_interface="${INTERFACE}.2"

    log_info "Creating VLAN 2 for AVB traffic..."

    if ip link show "$vlan_interface" &>/dev/null; then
        log_info "VLAN interface $vlan_interface already exists"
        return
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would create VLAN interface: $vlan_interface"
        log_info "[DRY RUN] Would set egress priority map for AVB Class A"
        return
    fi

    # Create VLAN subinterface
    ip link add link "$INTERFACE" name "$vlan_interface" type vlan id 2

    # Set egress QoS mapping: priority 3 for AVB Class A
    ip link set dev "$vlan_interface" type vlan egress 3:3

    # Bring up the VLAN interface
    ip link set dev "$vlan_interface" up

    log_success "VLAN 2 created: $vlan_interface"
}

# Validate qdisc configuration
validate_qdisc() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would validate qdisc configuration"
        return
    fi

    log_info "Validating qdisc configuration..."

    local output
    output=$(tc -s qdisc show dev "$INTERFACE")

    if echo "$output" | grep -q "mqprio"; then
        log_success "mqprio present"
    else
        log_error "mqprio not found!"
        return 1
    fi

    if echo "$output" | grep -q "cbs"; then
        log_success "CBS present"
    else
        log_warning "CBS not found (may be nested under mqprio)"
    fi

    log_success "Qdisc validation passed"
    return 0
}

# Main
main() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}    MAP2 AVB/TSN Qdisc Setup${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo

    if [[ "$DRY_RUN" == "true" ]]; then
        log_warning "DRY RUN MODE - No changes will be made"
        echo
    fi

    echo "Configuration:"
    echo "  Interface: $INTERFACE"
    echo

    backup_qdisc
    apply_mqprio
    apply_cbs
    # apply_etf  # Optional - can be enabled later
    create_vlan

    if validate_qdisc; then
        echo
        log_success "TSN qdisc setup complete!"
        echo
        echo "Verify with:"
        echo "  tc -s qdisc show dev $INTERFACE"
        echo "  ip link show ${INTERFACE}.2"
    else
        log_error "Validation failed - rolling back..."
        if [[ -f "$BACKUP_DIR/qdisc-backup-$INTERFACE.txt" ]]; then
            tc qdisc replace dev "$INTERFACE" root pfifo_fast
            log_info "Rolled back to default qdisc"
        fi
        exit 1
    fi
}

main "$@"

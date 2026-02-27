#!/bin/bash
#
# MAP2 Audio Platform - AVB/TSN Setup Script
#
# Comprehensive setup for AVB (Audio Video Bridging) / TSN (Time-Sensitive Networking)
# Configures:
# - PTP (IEEE 802.1AS gPTP) clock synchronization via linuxptp
# - TSN qdiscs (mqprio, CBS, ETF) for deterministic traffic shaping
# - VLAN 2 for AVB Class A streams
# - Systemd services for ptp4l and phc2sys
#
# Usage:
#   sudo ./setup_avb.sh                    # Interactive mode (prompts for confirmation)
#   sudo ./setup_avb.sh --yes              # Non-interactive (auto-confirm all)
#   sudo ./setup_avb.sh --dry-run          # Check compatibility without changes
#   sudo ./setup_avb.sh --interface enp3s0 # Specify interface
#

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default configuration
AVB_INTERFACE=""
PTP_DOMAIN=0
PTP_PRIORITY1=128
LINK_SPEED_MBPS=1000
VLAN_ID=2
SRP_CLASS="A"
SRP_DAEMON=""
SRP_DAEMON_BIN=""
SRP_DAEMON_ARGS=""
SRP_CONTROL_SOCKET=""
SRP_INSTALL_MODE="existing"
SRP_SOURCE_REPO="https://github.com/Avnu/OpenAvnu.git"
SRP_SOURCE_REF="${MAP2_OPENAVNU_REF:-8c4b4b4}"
SRP_SOURCE_ROOT="/usr/local/src/map2-srpd"
SRP_MANIFEST="/var/lib/map2/srp-install-manifest.json"

# Flags
DRY_RUN=false
AUTO_YES=false
VERBOSE=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
    local default="${2:-n}"

    if [[ "$AUTO_YES" == true ]]; then
        return 0
    fi

    local yn
    if [[ "$default" == "y" ]]; then
        read -p "$prompt [Y/n]: " yn
        yn=${yn:-y}
    else
        read -p "$prompt [y/N]: " yn
        yn=${yn:-n}
    fi

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

check_command() {
    local cmd="$1"
    if ! command -v "$cmd" &> /dev/null; then
        return 1
    fi
    return 0
}

# ============================================================================
# Hardware Detection
# ============================================================================

detect_tsn_interfaces() {
    # Keep logs on stderr so callers can safely parse stdout.
    log_info "Detecting TSN-capable network interfaces..." >&2

    local tsn_interfaces=()

    # List all non-loopback interfaces
    for iface in /sys/class/net/*; do
        iface=$(basename "$iface")
        [[ "$iface" == "lo" ]] && continue

        # Check if interface exists and is up
        if [[ ! -d "/sys/class/net/$iface" ]]; then
            continue
        fi

        # Check for hardware timestamping support via ethtool
        if ethtool -T "$iface" 2>/dev/null | grep -q "hardware-transmit"; then
            tsn_interfaces+=("$iface")
        fi
    done

    printf '%s\n' "${tsn_interfaces[@]}"
}

select_interface() {
    log_info "Selecting AVB network interface..."

    local interfaces=()
    mapfile -t interfaces < <(detect_tsn_interfaces)

    if [[ ${#interfaces[@]} -eq 0 ]]; then
        log_error "No TSN-capable network interfaces found!"
        log_warning "AVB requires hardware timestamping support (e.g., Intel I210/I225)"
        log_warning "Check 'ethtool -T <interface>' for 'hardware-transmit' support"
        exit 1
    fi

    log_success "Found ${#interfaces[@]} TSN-capable interface(s):"
    for i in "${!interfaces[@]}"; do
        local iface="${interfaces[$i]}"
        local mac=$(cat "/sys/class/net/$iface/address" 2>/dev/null || echo "unknown")
        local state=$(cat "/sys/class/net/$iface/operstate" 2>/dev/null || echo "unknown")
        echo "  [$((i+1))] $iface (MAC: $mac, State: $state)"
    done

    if [[ ${#interfaces[@]} -eq 1 ]]; then
        AVB_INTERFACE="${interfaces[0]}"
        log_info "Auto-selecting: $AVB_INTERFACE"
        return 0
    fi

    if [[ "$AUTO_YES" == true ]]; then
        AVB_INTERFACE="${interfaces[0]}"
        log_info "Auto-selecting first interface: $AVB_INTERFACE"
        return 0
    fi

    local selection
    read -p "Select interface [1]: " selection
    selection=${selection:-1}

    if [[ ! "$selection" =~ ^[0-9]+$ ]] || [[ $selection -lt 1 ]] || [[ $selection -gt ${#interfaces[@]} ]]; then
        log_error "Invalid selection"
        exit 1
    fi

    AVB_INTERFACE="${interfaces[$((selection-1))]}"
    log_success "Selected: $AVB_INTERFACE"
}

verify_interface_capabilities() {
    local iface="$1"

    log_info "Verifying $iface capabilities..."

    # Check if interface exists
    if [[ ! -d "/sys/class/net/$iface" ]]; then
        log_error "Interface $iface does not exist"
        return 1
    fi

    # Check hardware timestamping
    if ! ethtool -T "$iface" 2>/dev/null | grep -q "hardware-transmit"; then
        log_error "Interface $iface does not support hardware timestamping"
        log_warning "AVB requires hardware timestamping (e.g., Intel I210/I225 NIC)"
        return 1
    fi

    # Check link speed
    local speed=$(ethtool "$iface" 2>/dev/null | grep "Speed:" | awk '{print $2}' | sed 's/Mb\/s//')
    if [[ -n "$speed" ]] && [[ "$speed" =~ ^[0-9]+$ ]]; then
        LINK_SPEED_MBPS=$speed
        log_success "Link speed: ${LINK_SPEED_MBPS}Mb/s"
    else
        log_warning "Could not detect link speed, using default: ${LINK_SPEED_MBPS}Mb/s"
    fi

    # Check for Intel I210/I225
    local pci_device=$(readlink -f "/sys/class/net/$iface/device" 2>/dev/null || echo "")
    if [[ -n "$pci_device" ]]; then
        local vendor=$(cat "$pci_device/vendor" 2>/dev/null || echo "")
        local device=$(cat "$pci_device/device" 2>/dev/null || echo "")

        if [[ "$vendor" == "0x8086" ]]; then
            log_success "Intel NIC detected (vendor: $vendor, device: $device)"

            # Check for known AVB-capable Intel NICs
            case "$device" in
                0x1533|0x1536|0x1537|0x1538) # I210 variants
                    log_success "Intel I210 detected - excellent AVB support!"
                    ;;
                0x15f2|0x15f3) # I225 variants
                    log_success "Intel I225 detected - excellent AVB support!"
                    ;;
                *)
                    log_warning "Intel NIC but not I210/I225 - AVB support may vary"
                    ;;
            esac
        else
            log_warning "Non-Intel NIC - AVB support depends on chipset capabilities"
        fi
    fi

    return 0
}

# ============================================================================
# Dependency Installation
# ============================================================================

install_dependencies() {
    log_info "Checking dependencies..."

    local missing_deps=()

    # Check for required commands
    local required_cmds=("ethtool" "tc" "ip")
    for cmd in "${required_cmds[@]}"; do
        if ! check_command "$cmd"; then
            missing_deps+=("$cmd")
        fi
    done

    # Check for linuxptp
    if ! check_command "ptp4l"; then
        missing_deps+=("linuxptp")
    fi

    if [[ ${#missing_deps[@]} -eq 0 ]]; then
        log_success "All dependencies installed"
        return 0
    fi

    log_warning "Missing dependencies: ${missing_deps[*]}"

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would install: ${missing_deps[*]}"
        return 0
    fi

    if ! prompt_yes_no "Install missing dependencies?"; then
        log_error "Cannot proceed without dependencies"
        exit 1
    fi

    # Detect package manager
    if check_command "dnf"; then
        log_info "Installing via dnf..."
        if ! dnf install -y linuxptp iproute-tc iproute ethtool libpcap-devel; then
            log_warning "dnf install with iproute-tc failed; retrying without split tc package"
            dnf install -y linuxptp iproute ethtool libpcap-devel
        fi
    elif check_command "apt"; then
        log_info "Installing via apt..."
        apt update
        apt install -y linuxptp iproute2 ethtool libpcap-dev
    elif check_command "pacman"; then
        log_info "Installing via pacman..."
        pacman -S --noconfirm linuxptp iproute2 ethtool libpcap
    else
        log_error "Could not detect package manager (dnf/apt/pacman)"
        exit 1
    fi

    log_success "Dependencies installed"
}


_try_install_packages() {
    local packages=("$@")
    if [[ ${#packages[@]} -eq 0 ]]; then
        return 1
    fi

    if check_command "dnf"; then
        dnf install -y "${packages[@]}" >/dev/null 2>&1
        return $?
    fi
    if check_command "apt"; then
        apt update >/dev/null 2>&1 || true
        apt install -y "${packages[@]}" >/dev/null 2>&1
        return $?
    fi
    if check_command "pacman"; then
        pacman -S --noconfirm "${packages[@]}" >/dev/null 2>&1
        return $?
    fi
    return 1
}


_detect_srp_daemon_binary() {
    if check_command "mrpd"; then
        SRP_DAEMON="mrpd"
        SRP_DAEMON_BIN="$(command -v mrpd)"
        SRP_CONTROL_SOCKET="/var/run/mrp_socket"
        SRP_DAEMON_ARGS="${SRP_DAEMON_ARGS:-}"
        return 0
    fi
    if check_command "msrpd"; then
        SRP_DAEMON="msrpd"
        SRP_DAEMON_BIN="$(command -v msrpd)"
        SRP_CONTROL_SOCKET="/run/msrpd/msrpd.sock"
        SRP_DAEMON_ARGS="${SRP_DAEMON_ARGS:-}"
        return 0
    fi
    return 1
}


_set_default_srp_daemon_args() {
    if [[ -n "${SRP_DAEMON_ARGS:-}" ]]; then
        return 0
    fi

    case "$SRP_DAEMON" in
        mrpd)
            SRP_DAEMON_ARGS="-m -v -s -i ${AVB_INTERFACE}"
            ;;
        msrpd)
            SRP_DAEMON_ARGS="-i ${AVB_INTERFACE}"
            ;;
        *)
            SRP_DAEMON_ARGS=""
            ;;
    esac
}


_build_srp_daemon_from_source() {
    log_warning "SRP daemon package unavailable; attempting source build fallback"

    local source_dir="${SRP_SOURCE_ROOT}/openavnu"
    local build_ok=false

    if ! check_command "git" || ! check_command "make"; then
        _try_install_packages git make gcc gcc-c++
    fi

    mkdir -p "$SRP_SOURCE_ROOT"

    if [[ ! -d "${source_dir}/.git" ]]; then
        git clone "$SRP_SOURCE_REPO" "$source_dir"
    fi

    pushd "$source_dir" >/dev/null
    git fetch --all --tags >/dev/null 2>&1 || true
    if ! git checkout "$SRP_SOURCE_REF" >/dev/null 2>&1; then
        log_warning "Pinned ref ${SRP_SOURCE_REF} unavailable; using current checkout"
    fi

    if [[ -f "daemons/mrpd/Makefile" ]]; then
        make -C daemons/mrpd
        install -m 0755 daemons/mrpd/mrpd /usr/local/sbin/mrpd
        build_ok=true
    elif [[ -f "mrpd/Makefile" ]]; then
        make -C mrpd
        install -m 0755 mrpd/mrpd /usr/local/sbin/mrpd
        build_ok=true
    elif [[ -f "daemons/msrpd/Makefile" ]]; then
        make -C daemons/msrpd
        install -m 0755 daemons/msrpd/msrpd /usr/local/sbin/msrpd
        build_ok=true
    fi
    popd >/dev/null

    if [[ "$build_ok" != true ]]; then
        log_error "Unable to build SRP daemon from source"
        return 1
    fi

    SRP_INSTALL_MODE="source"
    return 0
}


_write_srp_manifest() {
    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would write SRP install manifest: $SRP_MANIFEST"
        return 0
    fi

    mkdir -p "$(dirname "$SRP_MANIFEST")"
    python3 <<EOF
import json
from datetime import datetime, timezone

manifest = {
    "installed_at": datetime.now(timezone.utc).isoformat(),
    "install_mode": "${SRP_INSTALL_MODE}",
    "daemon_type": "${SRP_DAEMON}",
    "binary_path": "${SRP_DAEMON_BIN}",
    "control_socket": "${SRP_CONTROL_SOCKET}",
    "source_repo": "${SRP_SOURCE_REPO}",
    "source_ref": "${SRP_SOURCE_REF}",
    "source_root": "${SRP_SOURCE_ROOT}",
    "managed_files": [
        "/etc/systemd/system/map2-srpd.service",
        "/etc/default/map2-srpd",
        "${SRP_MANIFEST}",
    ],
}

with open("${SRP_MANIFEST}", "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)
EOF
}


provision_srp_daemon() {
    log_info "Provisioning SRP/MSRP daemon (mrpd/msrpd)..."

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would auto-detect/install mrpd/msrpd and write $SRP_MANIFEST"
        return 0
    fi

    if _detect_srp_daemon_binary; then
        SRP_INSTALL_MODE="existing"
        _set_default_srp_daemon_args
        log_success "Using existing SRP daemon: $SRP_DAEMON ($SRP_DAEMON_BIN)"
        _write_srp_manifest
        return 0
    fi

    if _try_install_packages mrpd; then
        :
    elif _try_install_packages msrpd; then
        :
    elif _try_install_packages openavnu; then
        :
    elif _try_install_packages open-avb; then
        :
    fi

    if _detect_srp_daemon_binary; then
        SRP_INSTALL_MODE="package"
        _set_default_srp_daemon_args
        log_success "Installed SRP daemon from package: $SRP_DAEMON ($SRP_DAEMON_BIN)"
        _write_srp_manifest
        return 0
    fi

    # Source fallback
    _build_srp_daemon_from_source
    if ! _detect_srp_daemon_binary; then
        log_error "SRP daemon provisioning failed (mrpd/msrpd unavailable)"
        return 1
    fi

    log_success "Built SRP daemon from source: $SRP_DAEMON ($SRP_DAEMON_BIN)"
    _set_default_srp_daemon_args
    _write_srp_manifest
}

# ============================================================================
# PTP Configuration
# ============================================================================

configure_ptp() {
    log_info "Configuring PTP (IEEE 802.1AS gPTP)..."

    local ptp_conf="/etc/ptp4l.conf"

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would create $ptp_conf"
        log_info "[DRY RUN] Configuration:"
        cat <<EOF
[global]
tx_timestamp_timeout     10
logMinPdelayReqInterval  0
logSyncInterval          -3
twoStepFlag              1
summary_interval         0
time_stamping            hardware
network_transport        L2
delay_mechanism          P2P
ptp_dst_mac              01:80:C2:00:00:0E
transportSpecific        0x1
domainNumber             $PTP_DOMAIN
priority1                $PTP_PRIORITY1
priority2                128
clockClass               248
clockAccuracy            0xFE
offsetScaledLogVariance  0xFFFF
free_running             0
freq_est_interval        1
dscp_event               0
dscp_general             0
dataset_comparison       ieee1588
G.8275.defaultDS.localPriority 128
masterOnly               0
G.8275.portDS.localPriority 128
hybrid_e2e               0
inhibit_multicast_service 0
net_sync_monitor         0
tc_spanning_tree         0
tx_timestamp_offset      0
rx_timestamp_offset      0
step_threshold           0.0
first_step_threshold     0.00002
max_frequency            900000000
clock_servo              pi
sanity_freq_limit        200000000
ntpshm_segment           0
msg_interval_request     0
servo_num_offset_values  10
servo_offset_threshold   0
write_phase_mode         0

[$AVB_INTERFACE]
EOF
        return 0
    fi

    # Backup existing config
    if [[ -f "$ptp_conf" ]]; then
        log_warning "Existing PTP config found, backing up..."
        cp "$ptp_conf" "${ptp_conf}.backup.$(date +%s)"
    fi

    # Write gPTP configuration
    cat > "$ptp_conf" <<EOF
# MAP2 Audio Platform - IEEE 802.1AS gPTP Configuration
# Generated by setup_avb.sh on $(date)

[global]
# Timing parameters
tx_timestamp_timeout     10
logMinPdelayReqInterval  0
logSyncInterval          -3
twoStepFlag              1
summary_interval         0

# Hardware timestamping (required for AVB)
time_stamping            hardware

# Layer 2 transport (AVB uses raw Ethernet)
network_transport        L2
delay_mechanism          P2P
ptp_dst_mac              01:80:C2:00:00:0E

# gPTP (802.1AS) profile
transportSpecific        0x1

# PTP domain and priority
domainNumber             $PTP_DOMAIN
priority1                $PTP_PRIORITY1
priority2                128

# Clock class (default slave)
clockClass               248
clockAccuracy            0xFE
offsetScaledLogVariance  0xFFFF

# Servo tuning for low latency
free_running             0
freq_est_interval        1
step_threshold           0.0
first_step_threshold     0.00002
max_frequency            900000000
clock_servo              pi
sanity_freq_limit        200000000

# Offset filtering
servo_num_offset_values  10
servo_offset_threshold   0

# Interface-specific settings
[$AVB_INTERFACE]
EOF

    log_success "PTP configuration written to $ptp_conf"
}

create_systemd_services() {
    log_info "Creating systemd services..."

    local ptp4l_service="/etc/systemd/system/map2-ptp4l.service"
    local phc2sys_service="/etc/systemd/system/map2-phc2sys.service"
    local srpd_service="/etc/systemd/system/map2-srpd.service"
    local srpd_env="/etc/default/map2-srpd"
    local avb_target="/etc/systemd/system/map2-avb.target"

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would create systemd services:"
        log_info "  - $ptp4l_service"
        log_info "  - $phc2sys_service"
        log_info "  - $srpd_service"
        log_info "  - $srpd_env"
        log_info "  - $avb_target"
        return 0
    fi

    # Create map2-avb.target
    cat > "$avb_target" <<EOF
[Unit]
Description=MAP2 AVB/TSN Services
Documentation=https://github.com/matthewmackes/map2-audio
Wants=network-online.target map2-ptp4l.service map2-phc2sys.service map2-srpd.service
After=network-online.target map2-ptp4l.service map2-srpd.service
StopWhenUnneeded=yes

[Install]
WantedBy=multi-user.target
EOF

    # Create ptp4l service
    cat > "$ptp4l_service" <<EOF
[Unit]
Description=PTP Daemon (IEEE 802.1AS gPTP for AVB)
Documentation=man:ptp4l(8)
After=network-online.target
Wants=network-online.target
ConditionPathExists=/etc/map2/avb-enabled
PartOf=map2-avb.target

[Service]
Type=simple
ExecStart=/usr/sbin/ptp4l -f /etc/ptp4l.conf -i $AVB_INTERFACE -m
Restart=on-failure
RestartSec=5

# Run as non-root if possible
User=root
Group=root

# Security hardening
PrivateTmp=true

[Install]
WantedBy=map2-avb.target
EOF

    # Create phc2sys service
    cat > "$phc2sys_service" <<EOF
[Unit]
Description=Synchronize System Clock to PTP Hardware Clock
Documentation=man:phc2sys(8)
After=map2-ptp4l.service
Requires=map2-ptp4l.service
ConditionPathExists=/etc/map2/avb-enabled
PartOf=map2-avb.target

[Service]
Type=simple
ExecStart=/usr/sbin/phc2sys -s $AVB_INTERFACE -c CLOCK_REALTIME -w -m
Restart=on-failure
RestartSec=5

# Run as non-root if possible
User=root
Group=root

# Security hardening
PrivateTmp=true

[Install]
WantedBy=map2-avb.target
EOF

    # SRP daemon environment
    cat > "$srpd_env" <<EOF
# MAP2 SRP daemon runtime configuration
MAP2_SRPD_DAEMON=${SRP_DAEMON}
MAP2_SRPD_BIN=${SRP_DAEMON_BIN}
MAP2_SRPD_SOCKET=${SRP_CONTROL_SOCKET}
MAP2_SRPD_ARGS=${SRP_DAEMON_ARGS}
EOF

    # Create SRP daemon service
    cat > "$srpd_service" <<'EOF'
[Unit]
Description=MAP2 SRP/MSRP Admission Daemon
Documentation=https://github.com/matthewmackes/map2-audio
After=network-online.target
Wants=network-online.target
Before=map2-backend.service
ConditionPathExists=/etc/map2/avb-enabled
PartOf=map2-avb.target

[Service]
Type=simple
EnvironmentFile=-/etc/default/map2-srpd
ExecStart=/bin/bash -lc '${MAP2_SRPD_BIN:-/usr/sbin/mrpd} ${MAP2_SRPD_ARGS}'
Restart=on-failure
RestartSec=5
User=root
Group=root
PrivateTmp=true

[Install]
WantedBy=map2-avb.target
EOF

    log_success "Systemd services created"
}

# ============================================================================
# TSN Qdisc Configuration
# ============================================================================

backup_qdisc_config() {
    local iface="$1"
    local backup_dir="/var/lib/map2"
    local backup_file="$backup_dir/qdisc-backup-$iface.txt"

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would backup qdisc config to $backup_file"
        return 0
    fi

    mkdir -p "$backup_dir"

    if tc qdisc show dev "$iface" > "$backup_file" 2>/dev/null; then
        log_success "Qdisc config backed up to $backup_file"
    else
        log_warning "Could not backup qdisc config (non-fatal)"
    fi
}

calculate_cbs_parameters() {
    local link_speed=$1  # Mbps
    local sample_rate=48000
    local channels=2
    local bit_depth=24

    # Calculate audio bandwidth (bytes/sec)
    local audio_bw=$((sample_rate * channels * (bit_depth / 8)))

    # Add 20% overhead for AVTP/Ethernet headers
    local total_bw=$((audio_bw * 120 / 100))

    # Convert to bits/sec and add 2x safety margin
    local idleslope=$((total_bw * 8 * 2))

    # sendslope = -(link_rate - idleslope)
    local sendslope=$((-1 * (link_speed * 1000000 - idleslope)))

    # hicredit/locredit based on MTU (1500 bytes)
    local mtu=1500
    local hicredit=$((idleslope * mtu * 8 / (link_speed * 1000000)))
    local locredit=$sendslope

    echo "$idleslope $sendslope $hicredit $locredit"
}

configure_tsn_qdiscs() {
    local iface="$1"

    log_info "Configuring TSN traffic shaping on $iface..."

    # Backup existing config
    backup_qdisc_config "$iface"

    # Calculate CBS parameters
    read -r idleslope sendslope hicredit locredit <<< "$(calculate_cbs_parameters "$LINK_SPEED_MBPS")"

    log_info "CBS parameters (for ${LINK_SPEED_MBPS}Mbps link):"
    log_info "  idleslope:  $idleslope bps"
    log_info "  sendslope:  $sendslope bps"
    log_info "  hicredit:   $hicredit bytes"
    log_info "  locredit:   $locredit bytes"

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would configure qdiscs:"
        log_info "  1. Remove existing qdiscs"
        log_info "  2. Configure mqprio (3 traffic classes)"
        log_info "  3. Configure CBS on TC0 (AVB Class A)"
        log_info "  4. Create VLAN $VLAN_ID interface"
        return 0
    fi

    # Remove existing qdiscs
    tc qdisc del dev "$iface" root 2>/dev/null || true

    # Configure mqprio (3 traffic classes)
    log_info "Configuring mqprio (IEEE 802.1Qbv)..."
    if ! tc qdisc add dev "$iface" root handle 100: mqprio \
        num_tc 3 \
        map 2 2 1 0 2 2 2 2 2 2 2 2 2 2 2 2 \
        queues 1@0 1@1 2@2 \
        hw 0; then
        log_warning "mqprio not supported on $iface; continuing without TSN qdisc shaping"
        create_vlan_interface "$iface" "$VLAN_ID"
        return 0
    fi

    # Configure CBS on TC0 (AVB Class A - priority 3)
    log_info "Configuring CBS (IEEE 802.1Qav) on TC0..."
    if ! tc qdisc replace dev "$iface" parent 100:1 cbs \
        idleslope "$idleslope" \
        sendslope "$sendslope" \
        hicredit "$hicredit" \
        locredit "$locredit" \
        offload 0; then
        log_warning "CBS qdisc not supported on $iface; continuing without Class A shaping"
    else
        log_success "TSN qdiscs configured"
    fi

    # Create VLAN interface for AVB
    create_vlan_interface "$iface" "$VLAN_ID"
}

create_vlan_interface() {
    local iface="$1"
    local vlan_id="$2"
    local vlan_iface="${iface}.${vlan_id}"

    log_info "Creating VLAN $vlan_id interface..."

    if ip link show "$vlan_iface" &>/dev/null; then
        log_warning "VLAN interface $vlan_iface already exists"
        return 0
    fi

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would create VLAN interface $vlan_iface"
        return 0
    fi

    ip link add link "$iface" name "$vlan_iface" type vlan id "$vlan_id"
    ip link set "$vlan_iface" up

    # Set VLAN egress priority map (map priority 3 to VLAN PCP 3)
    ip link set "$vlan_iface" type vlan egress 3:3

    log_success "VLAN interface $vlan_iface created"
}

# ============================================================================
# Finalization
# ============================================================================

enable_avb() {
    log_info "Enabling AVB services..."

    local marker_file="/etc/map2/avb-enabled"

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would create $marker_file"
        log_info "[DRY RUN] Would enable systemd services"
        return 0
    fi

    # Create marker file with explicit runtime metadata used by AVB probes.
    mkdir -p "$(dirname "$marker_file")"
    cat > "$marker_file" <<EOF
# MAP2 AVB runtime marker
# Generated by scripts/setup_avb.sh on $(date -Iseconds)
enabled=true
interface=${AVB_INTERFACE}
ptp_domain=${PTP_DOMAIN}
vlan_id=${VLAN_ID}
srp_class=${SRP_CLASS}
EOF

    # Reload systemd
    systemctl daemon-reload

    # Enable and start services
    systemctl enable map2-ptp4l.service
    systemctl enable map2-phc2sys.service
    systemctl enable map2-srpd.service
    systemctl enable map2-avb.target

    systemctl start map2-avb.target

    log_success "AVB services enabled and started"
}

update_map2_config() {
    log_info "Updating MAP2 configuration..."

    local config_home="$HOME"
    if [[ "$EUID" -eq 0 ]] && [[ -n "${SUDO_USER:-}" ]] && [[ "${SUDO_USER}" != "root" ]]; then
        local sudo_home
        sudo_home="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
        if [[ -n "$sudo_home" ]]; then
            config_home="$sudo_home"
        fi
    fi

    local config_file="${config_home}/.map2/config.json"

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Would update $config_file:"
        log_info "  avb.enabled = true"
        log_info "  avb.interface = $AVB_INTERFACE"
        log_info "  avb.srp.enabled = true"
        log_info "  avb.srp.required = true"
        log_info "  avb.srp.daemon = auto"
        return 0
    fi

    mkdir -p "$(dirname "$config_file")"

    # Create or update config using Python
    python3 <<EOF
import json
import os

config_file = "$config_file"
config = {}

if os.path.exists(config_file):
    with open(config_file, 'r') as f:
        config = json.load(f)

config['avb'] = config.get('avb', {})
config['avb']['enabled'] = True
config['avb']['interface'] = "$AVB_INTERFACE"
config['avb']['ptp_domain'] = $PTP_DOMAIN
config['avb']['ptp_priority1'] = $PTP_PRIORITY1
config['avb']['srp'] = config['avb'].get('srp', {})
config['avb']['srp']['enabled'] = True
config['avb']['srp']['required'] = True
config['avb']['srp']['daemon'] = "auto"
config['avb']['srp']['timeout_ms'] = 2000
config['avb']['srp']['vlan_id'] = $VLAN_ID
config['avb']['srp']['class'] = "$SRP_CLASS"
config['avb']['srp']['control_socket'] = "$SRP_CONTROL_SOCKET"

with open(config_file, 'w') as f:
    json.dump(config, f, indent=2)

print("Config updated successfully")
EOF

    log_success "MAP2 config updated"
}

verify_setup() {
    log_info "Verifying AVB setup..."

    if [[ "$DRY_RUN" == true ]]; then
        log_info "[DRY RUN] Verification would check:"
        log_info "  - ptp4l service status"
        log_info "  - phc2sys service status"
        log_info "  - srpd service status"
        log_info "  - qdisc configuration"
        log_info "  - VLAN interface"
        return 0
    fi

    local all_ok=true

    # Check ptp4l
    if systemctl is-active --quiet map2-ptp4l.service; then
        log_success "ptp4l service running"
    else
        log_error "ptp4l service not running"
        all_ok=false
    fi

    # Check phc2sys
    if systemctl is-active --quiet map2-phc2sys.service; then
        log_success "phc2sys service running"
    else
        log_error "phc2sys service not running"
        all_ok=false
    fi

    # Check SRP daemon
    if systemctl is-active --quiet map2-srpd.service; then
        log_success "map2-srpd service running"
    else
        log_error "map2-srpd service not running"
        all_ok=false
    fi

    # Check qdiscs
    if tc qdisc show dev "$AVB_INTERFACE" | grep -q "cbs"; then
        log_success "CBS qdisc configured"
    else
        log_warning "CBS qdisc not found"
        all_ok=false
    fi

    # Check VLAN
    if ip link show "${AVB_INTERFACE}.${VLAN_ID}" &>/dev/null; then
        log_success "VLAN interface created"
    else
        log_warning "VLAN interface not found"
        all_ok=false
    fi

    if [[ "$all_ok" == true ]]; then
        log_success "AVB setup verification passed!"
    else
        log_warning "Some checks failed - review logs above"
    fi
}

print_next_steps() {
    cat <<EOF

${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${GREEN}AVB/TSN Setup Complete!${NC}
${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

${BLUE}Configuration Summary:${NC}
  Interface:        ${AVB_INTERFACE}
  PTP Domain:       ${PTP_DOMAIN}
  Link Speed:       ${LINK_SPEED_MBPS}Mb/s
  VLAN ID:          ${VLAN_ID}
  SRP Daemon:       ${SRP_DAEMON} (${SRP_DAEMON_BIN})

${BLUE}Next Steps:${NC}

1. ${YELLOW}Check PTP synchronization:${NC}
   sudo journalctl -u map2-ptp4l.service -f

2. ${YELLOW}Verify PTP offset (should be <1μs):${NC}
   sudo pmc -u -b 0 'GET CURRENT_DATA_SET'

3. ${YELLOW}Check SRP daemon health:${NC}
   curl http://localhost:8080/api/avb/srp/status

4. ${YELLOW}Check qdisc stats:${NC}
   tc -s qdisc show dev ${AVB_INTERFACE}

5. ${YELLOW}Restart MAP2 backend to enable AVB:${NC}
   sudo systemctl restart map2-backend

6. ${YELLOW}Access AVB dashboard:${NC}
   Web:  http://localhost:3000/avb
   TUI:  python -m tui.node_console (AVB tab)

${BLUE}Useful Commands:${NC}
  sudo systemctl status map2-avb.target     # Check all AVB services
  sudo systemctl stop map2-avb.target       # Stop all AVB services
  ./scripts/uninstall_avb.sh                # Remove AVB configuration

${BLUE}Documentation:${NC}
  docs/avb-setup.md
  https://github.com/matthewmackes/map2-audio

${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
EOF
}

# ============================================================================
# Main Execution
# ============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run)
                DRY_RUN=true
                log_warning "DRY RUN MODE - No changes will be made"
                shift
                ;;
            --yes|-y)
                AUTO_YES=true
                shift
                ;;
            --interface|-i)
                AVB_INTERFACE="$2"
                shift 2
                ;;
            --verbose|-v)
                VERBOSE=true
                set -x
                shift
                ;;
            --help|-h)
                cat <<EOF
MAP2 Audio AVB/TSN Setup Script

Usage: sudo $0 [OPTIONS]

Options:
  --dry-run           Check compatibility without making changes
  --yes, -y           Non-interactive mode (auto-confirm all prompts)
  --interface, -i IF  Specify AVB network interface
  --verbose, -v       Enable verbose output
  --help, -h          Show this help message

Examples:
  sudo $0 --dry-run                    # Check if AVB can be configured
  sudo $0 --interface enp3s0           # Use specific interface
  sudo $0 --yes                        # Non-interactive setup

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
║        MAP2 Audio Platform - AVB/TSN Setup                        ║
║                                                                   ║
║    IEEE 802.1AS (gPTP) + IEEE 802.1Q (TSN) Configuration         ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    # Pre-flight checks
    check_root
    install_dependencies

    # Interface selection
    if [[ -z "$AVB_INTERFACE" ]]; then
        select_interface
    fi

    verify_interface_capabilities "$AVB_INTERFACE"

    # Confirmation
    if [[ "$DRY_RUN" == false ]]; then
        echo
        log_warning "This will configure AVB/TSN on interface: $AVB_INTERFACE"
        log_warning "Changes: PTP services, TSN qdiscs, VLAN interface, SRP daemon provisioning"
        echo
        if ! prompt_yes_no "Proceed with setup?"; then
            log_info "Setup cancelled"
            exit 0
        fi
    fi

    # Execute setup
    configure_ptp
    provision_srp_daemon
    create_systemd_services
    configure_tsn_qdiscs "$AVB_INTERFACE"
    enable_avb
    update_map2_config

    # Verification
    verify_setup

    # Summary
    if [[ "$DRY_RUN" == false ]]; then
        print_next_steps
    else
        log_success "Dry run complete - no changes made"
        log_info "Run without --dry-run to apply configuration"
    fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi

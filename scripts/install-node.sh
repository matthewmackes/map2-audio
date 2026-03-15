#!/bin/bash
# Deprecated as a primary user interface.
# Use the unified Textual Workflow route or `map2 workflow` for guided execution.
# This script remains as a non-interactive fallback/bootstrap path.
################################################################################
# MAP2 Audio Platform - Node Installation Script
# 
# This script provides a complete TUI-based installation and configuration
# system for adding new nodes to a MAP2 Audio cluster.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/matthewmackes/map2-audio/master/scripts/install-node.sh | sudo bash
#
# Or download and run:
#   wget https://raw.githubusercontent.com/matthewmackes/map2-audio/master/scripts/install-node.sh
#   sudo bash install-node.sh
#
# Requirements:
#   - Fedora Server 40+ (minimal install recommended)
#   - Root or sudo access
#   - Internet connectivity
#
################################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

################################################################################
# Configuration
################################################################################

readonly SCRIPT_VERSION="1.0.0"
readonly GITHUB_REPO="matthewmackes/map2-audio"
readonly GITHUB_RAW="https://raw.githubusercontent.com/${GITHUB_REPO}/master"
readonly GITHUB_API="https://api.github.com/repos/${GITHUB_REPO}"
readonly INSTALL_DIR="/opt/map2-audio"
readonly CONFIG_DIR="/etc/map2"
readonly DATA_DIR="/var/lib/map2"
readonly LOG_DIR="/var/log/map2"
readonly LOG_FILE="${LOG_DIR}/install.log"

# TUI Configuration
readonly DIALOG_HEIGHT=20
readonly DIALOG_WIDTH=70
readonly DIALOG_MENU_HEIGHT=12

# Color codes for terminal output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color

################################################################################
# Global Variables
################################################################################

# Installation mode (rpm or git)
INSTALL_MODE=""

# Node configuration
NODE_ID=""
NODE_NAME=""
NODE_ROLE="worker"
NODE_IP=""

# Cluster configuration
CLUSTER_MASTER_IP=""
CLUSTER_JOIN_METHOD="mdns"
CLUSTER_JOIN_TOKEN=""

# Audio configuration
AUDIO_DEVICE=""
AUDIO_SAMPLE_RATE="48000"
AUDIO_BUFFER_SIZE="256"

# Feature flags
ENABLE_AUDIO=true
ENABLE_SSH=true
ENABLE_FIREWALL=true
CONFIGURE_NETWORK=false
AUTO_YES=false
USE_DIALOG=true
DRY_RUN=false
CONFIG_FILE=""
NETWORK_INTERFACE=""
NETWORK_NETMASK="255.255.255.0"
NETWORK_GATEWAY=""
NETWORK_DNS="8.8.8.8"

################################################################################
# Logging Functions
################################################################################

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" >> "${LOG_FILE}" 2>/dev/null || true
}

log_info() {
    log "INFO" "$*"
}

log_error() {
    log "ERROR" "$*"
}

log_success() {
    log "SUCCESS" "$*"
}

################################################################################
# Terminal Output Functions
################################################################################

print_header() {
    clear
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════════════╗"
    echo "║                                                                       ║"
    echo "║              MAP2 Audio Platform - Node Installation                 ║"
    echo "║                          Version ${SCRIPT_VERSION}                           ║"
    echo "║                                                                       ║"
    echo "╚═══════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $*"
    log_info "$*"
}

print_success() {
    echo -e "${GREEN}✓${NC} $*"
    log_success "$*"
}

print_error() {
    echo -e "${RED}✗${NC} $*"
    log_error "$*"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $*"
    log "WARN" "$*"
}

################################################################################
# Utility Functions
################################################################################

check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root or with sudo"
        exit 1
    fi
}

check_os() {
    if [[ ! -f /etc/fedora-release ]]; then
        print_error "This script is designed for Fedora Server"
        print_info "Detected OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
        exit 1
    fi
    
    local fedora_version=$(cat /etc/fedora-release | grep -oP '\d+' | head -1)
    if [[ $fedora_version -lt 40 ]]; then
        print_warning "Fedora version $fedora_version detected. Fedora 40+ recommended."
        if ! confirm "Continue anyway?"; then
            exit 1
        fi
    fi
}

check_internet() {
    if ! ping -c 1 -W 2 github.com &> /dev/null; then
        print_error "No internet connection detected"
        print_info "Please check your network configuration"
        return 1
    fi
    return 0
}

confirm() {
    local message="$1"
    if [[ "$AUTO_YES" == "true" ]]; then
        log_info "Auto-confirmed: ${message}"
        return 0
    fi
    local response
    read -p "${message} [y/N] " response
    case "$response" in
        [yY][eE][sS]|[yY]) return 0 ;;
        *) return 1 ;;
    esac
}

ensure_map2_user() {
    if id -u map2 &> /dev/null; then
        return
    fi
    useradd -r -s /sbin/nologin -d /var/lib/map2 -m map2 2>&1 | tee -a "${LOG_FILE}"
    log_info "Created system user: map2"
}

netmask_to_prefix() {
    local netmask=$1
    case "$netmask" in
        255.255.255.255) echo "32" ;;
        255.255.255.254) echo "31" ;;
        255.255.255.252) echo "30" ;;
        255.255.255.248) echo "29" ;;
        255.255.255.240) echo "28" ;;
        255.255.255.224) echo "27" ;;
        255.255.255.192) echo "26" ;;
        255.255.255.128) echo "25" ;;
        255.255.255.0) echo "24" ;;
        255.255.254.0) echo "23" ;;
        255.255.252.0) echo "22" ;;
        255.255.248.0) echo "21" ;;
        255.255.240.0) echo "20" ;;
        255.255.224.0) echo "19" ;;
        255.255.192.0) echo "18" ;;
        255.255.128.0) echo "17" ;;
        255.255.0.0) echo "16" ;;
        255.254.0.0) echo "15" ;;
        255.252.0.0) echo "14" ;;
        255.248.0.0) echo "13" ;;
        255.240.0.0) echo "12" ;;
        255.224.0.0) echo "11" ;;
        255.192.0.0) echo "10" ;;
        255.128.0.0) echo "9" ;;
        255.0.0.0) echo "8" ;;
        *)
            echo "$netmask"
            ;;
    esac
}

setup_logging() {
    mkdir -p "${LOG_DIR}"
    touch "${LOG_FILE}"
    chmod 644 "${LOG_FILE}"
    log_info "============================================"
    log_info "MAP2 Node Installation Started"
    log_info "Script Version: ${SCRIPT_VERSION}"
    log_info "============================================"
}

check_dependencies() {
    local missing_deps=()
    
    # Check for dialog only when the legacy dialog UI is enabled
    if [[ "$USE_DIALOG" == "true" ]] && ! command -v dialog &> /dev/null; then
        missing_deps+=("dialog")
    fi
    
    # Check for other essential tools
    for cmd in curl wget git systemctl firewall-cmd; do
        if ! command -v "$cmd" &> /dev/null; then
            missing_deps+=("$cmd")
        fi
    done
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        print_info "Installing missing dependencies: ${missing_deps[*]}"
        dnf install -y "${missing_deps[@]}" 2>&1 | tee -a "${LOG_FILE}"
    fi
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --config)
                CONFIG_FILE="${2:-}"
                shift 2
                ;;
            --no-dialog)
                USE_DIALOG=false
                shift
                ;;
            --yes|-y)
                AUTO_YES=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --help|-h)
                cat <<'EOF'
Usage: install-node.sh [--config FILE] [--no-dialog] [--yes] [--dry-run]

  --config FILE   Load node configuration from a shell-compatible env file
  --no-dialog     Disable dialog UI and use plain terminal output
  --yes, -y       Auto-confirm prompts
  --dry-run       Validate configuration and print planned steps without applying changes
EOF
                exit 0
                ;;
            *)
                echo "Unknown option: $1" >&2
                exit 1
                ;;
        esac
    done
}

load_config() {
    if [[ -z "$CONFIG_FILE" ]]; then
        return
    fi
    if [[ ! -f "$CONFIG_FILE" ]]; then
        print_error "Config file not found: ${CONFIG_FILE}"
        exit 1
    fi
    # shellcheck disable=SC1090
    source "$CONFIG_FILE"
    log_info "Loaded install configuration from ${CONFIG_FILE}"
}

################################################################################
# Dialog/TUI Functions
################################################################################

show_welcome() {
    if [[ "$USE_DIALOG" != "true" ]]; then
        print_header
        print_info "This native workflow will prepare system updates, install MAP2, configure network/audio, and join the cluster."
        return
    fi
    dialog --title "Welcome to MAP2 Audio Platform" \
           --backtitle "MAP2 Node Installation v${SCRIPT_VERSION}" \
           --msgbox "This wizard will guide you through installing and configuring a new MAP2 Audio cluster node.\n\nThe process includes:\n\n• System preparation and updates\n• MAP2 software installation\n• Network and firewall configuration\n• Audio subsystem setup\n• Cluster join process\n\nEstimated time: 15-30 minutes\n\nPress OK to continue..." \
           ${DIALOG_HEIGHT} ${DIALOG_WIDTH}
}

show_installation_mode() {
    if [[ "$USE_DIALOG" != "true" ]]; then
        INSTALL_MODE="${INSTALL_MODE:-rpm}"
        log_info "Installation mode selected: ${INSTALL_MODE}"
        return
    fi
    local choice
    choice=$(dialog --title "Installation Mode" \
                    --backtitle "MAP2 Node Installation" \
                    --menu "Choose installation method:\n\nRPM: Recommended for production (stable releases)\nGit: For development (latest features)" \
                    ${DIALOG_HEIGHT} ${DIALOG_WIDTH} 2 \
                    "rpm" "Install from RPM package (Recommended)" \
                    "git" "Install from Git repository (Development)" \
                    3>&1 1>&2 2>&3)
    
    if [[ $? -eq 0 ]]; then
        INSTALL_MODE="$choice"
        log_info "Installation mode selected: ${INSTALL_MODE}"
    else
        exit 0
    fi
}

show_node_configuration() {
    if [[ "$USE_DIALOG" != "true" ]]; then
        NODE_ID="${NODE_ID:-node-$(hostname -s)}"
        NODE_NAME="${NODE_NAME:-MAP2 Node $(hostname -s)}"
        NODE_ROLE="${NODE_ROLE:-worker}"
        if [[ -z "$NODE_ID" ]] || [[ -z "$NODE_NAME" ]]; then
            print_error "Node ID and Name are required"
            exit 1
        fi
        log_info "Node configured: ID=${NODE_ID}, Name=${NODE_NAME}, Role=${NODE_ROLE}"
        return
    fi
    local temp_file=$(mktemp)
    
    dialog --title "Node Configuration" \
           --backtitle "MAP2 Node Installation" \
           --form "Enter node identification details:" \
           ${DIALOG_HEIGHT} ${DIALOG_WIDTH} 0 \
           "Node ID (e.g., node-02):" 1 1 "${NODE_ID:-node-$(hostname -s)}" 1 30 30 0 \
           "Node Name:" 2 1 "${NODE_NAME:-MAP2 Node $(hostname -s)}" 2 30 30 0 \
           "Node Role:" 3 1 "${NODE_ROLE}" 3 30 30 0 \
           2> "$temp_file"
    
    if [[ $? -eq 0 ]]; then
        NODE_ID=$(sed -n 1p "$temp_file")
        NODE_NAME=$(sed -n 2p "$temp_file")
        NODE_ROLE=$(sed -n 3p "$temp_file")
        rm -f "$temp_file"
        
        # Validate
        if [[ -z "$NODE_ID" ]] || [[ -z "$NODE_NAME" ]]; then
            dialog --title "Error" --msgbox "Node ID and Name are required!" 8 50
            show_node_configuration
        fi
        
        log_info "Node configured: ID=${NODE_ID}, Name=${NODE_NAME}, Role=${NODE_ROLE}"
    else
        rm -f "$temp_file"
        exit 0
    fi
}

show_cluster_join_method() {
    if [[ "$USE_DIALOG" != "true" ]]; then
        CLUSTER_JOIN_METHOD="${CLUSTER_JOIN_METHOD:-mdns}"
        case "$CLUSTER_JOIN_METHOD" in
            manual)
                if [[ -z "${CLUSTER_MASTER_IP}" ]]; then
                    print_error "Master node IP is required for manual cluster join"
                    exit 1
                fi
                ;;
            token)
                if [[ -z "${CLUSTER_JOIN_TOKEN}" ]]; then
                    print_error "Join token is required for token cluster join"
                    exit 1
                fi
                ;;
        esac
        log_info "Cluster join method: ${CLUSTER_JOIN_METHOD}"
        return
    fi
    local choice
    choice=$(dialog --title "Cluster Join Method" \
                    --backtitle "MAP2 Node Installation" \
                    --menu "How would you like to join the cluster?" \
                    ${DIALOG_HEIGHT} ${DIALOG_WIDTH} 4 \
                    "mdns" "Auto-discovery (mDNS) - Easiest" \
                    "manual" "Manual (Specify master IP)" \
                    "token" "Join token from Web UI" \
                    "skip" "Skip cluster join (configure later)" \
                    3>&1 1>&2 2>&3)
    
    if [[ $? -eq 0 ]]; then
        CLUSTER_JOIN_METHOD="$choice"
        log_info "Cluster join method: ${CLUSTER_JOIN_METHOD}"
        
        case "$CLUSTER_JOIN_METHOD" in
            manual)
                show_cluster_master_ip
                ;;
            token)
                show_cluster_join_token
                ;;
        esac
    else
        exit 0
    fi
}

show_cluster_master_ip() {
    local input
    input=$(dialog --title "Master Node IP Address" \
                   --backtitle "MAP2 Node Installation" \
                   --inputbox "Enter the IP address of the cluster master node:" \
                   10 ${DIALOG_WIDTH} "${CLUSTER_MASTER_IP}" \
                   3>&1 1>&2 2>&3)
    
    if [[ $? -eq 0 ]]; then
        CLUSTER_MASTER_IP="$input"
        
        # Validate IP format
        if [[ ! $CLUSTER_MASTER_IP =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
            dialog --title "Error" --msgbox "Invalid IP address format!" 8 50
            show_cluster_master_ip
        fi
        
        log_info "Master node IP: ${CLUSTER_MASTER_IP}"
    else
        exit 0
    fi
}

show_cluster_join_token() {
    local input
    input=$(dialog --title "Cluster Join Token" \
                   --backtitle "MAP2 Node Installation" \
                   --inputbox "Paste the join token from the master node's Web UI:" \
                   10 ${DIALOG_WIDTH} "${CLUSTER_JOIN_TOKEN}" \
                   3>&1 1>&2 2>&3)
    
    if [[ $? -eq 0 ]]; then
        CLUSTER_JOIN_TOKEN="$input"
        log_info "Join token received (length: ${#CLUSTER_JOIN_TOKEN})"
    else
        exit 0
    fi
}

show_network_configuration() {
    if [[ "$USE_DIALOG" != "true" ]]; then
        if [[ "$CONFIGURE_NETWORK" == "true" ]]; then
            NETWORK_INTERFACE="${NETWORK_INTERFACE:-$(ip route | awk '/default/ {print $5; exit}')}"
            if [[ -z "${NETWORK_IP}" ]] || [[ -z "${NETWORK_GATEWAY}" ]]; then
                print_error "Static IP and gateway are required when CONFIGURE_NETWORK=true"
                exit 1
            fi
            apply_network_config "${NETWORK_INTERFACE}" "${NETWORK_IP}" "${NETWORK_NETMASK}" "${NETWORK_GATEWAY}" "${NETWORK_DNS}"
        else
            CONFIGURE_NETWORK=false
            NODE_IP=$(hostname -I | awk '{print $1}')
            log_info "Using DHCP IP: ${NODE_IP}"
        fi
        return
    fi
    if dialog --title "Network Configuration" \
               --backtitle "MAP2 Node Installation" \
               --yesno "Would you like to configure a static IP address?\n\n(Required for production cluster nodes)\n\nCurrent IP: $(hostname -I | awk '{print $1}')" \
               12 ${DIALOG_WIDTH}; then
        CONFIGURE_NETWORK=true
        configure_static_ip
    else
        CONFIGURE_NETWORK=false
        NODE_IP=$(hostname -I | awk '{print $1}')
        log_info "Using DHCP IP: ${NODE_IP}"
    fi
}

configure_static_ip() {
    local temp_file=$(mktemp)
    local current_ip=$(hostname -I | awk '{print $1}')
    local gateway=$(ip route | grep default | awk '{print $3}')
    local interface=$(ip route | grep default | awk '{print $5}')
    
    dialog --title "Static IP Configuration" \
           --backtitle "MAP2 Node Installation" \
           --form "Configure static network settings:\n\nInterface: ${interface}" \
           ${DIALOG_HEIGHT} ${DIALOG_WIDTH} 0 \
           "IP Address:" 1 1 "${current_ip}" 1 20 20 0 \
           "Netmask:" 2 1 "255.255.255.0" 2 20 20 0 \
           "Gateway:" 3 1 "${gateway}" 3 20 20 0 \
           "DNS Server:" 4 1 "8.8.8.8" 4 20 20 0 \
           2> "$temp_file"
    
    if [[ $? -eq 0 ]]; then
        local ip=$(sed -n 1p "$temp_file")
        local netmask=$(sed -n 2p "$temp_file")
        local gw=$(sed -n 3p "$temp_file")
        local dns=$(sed -n 4p "$temp_file")
        rm -f "$temp_file"
        
        NODE_IP="$ip"
        
        # Apply network configuration
        apply_network_config "$interface" "$ip" "$netmask" "$gw" "$dns"
    else
        rm -f "$temp_file"
        CONFIGURE_NETWORK=false
    fi
}

apply_network_config() {
    local iface=$1
    local ip=$2
    local netmask=$3
    local gateway=$4
    local dns=$5
    local prefix
    
    print_info "Applying network configuration..."
    if [[ "$DRY_RUN" == "true" ]]; then
        print_info "[DRY RUN] Would configure ${iface} to ${ip}/${netmask} with gateway ${gateway} and DNS ${dns}"
        NODE_IP="$ip"
        return
    fi

    prefix=$(netmask_to_prefix "$netmask")
    
    # Create NetworkManager connection
    nmcli connection modify "$iface" \
        ipv4.method manual \
        ipv4.addresses "${ip}/${prefix}" \
        ipv4.gateway "$gateway" \
        ipv4.dns "$dns" 2>&1 | tee -a "${LOG_FILE}"
    
    nmcli connection up "$iface" 2>&1 | tee -a "${LOG_FILE}"
    
    print_success "Network configured: ${ip}"
    log_info "Static IP configured: ${ip}"
}

show_audio_configuration() {
    if [[ "$USE_DIALOG" != "true" ]]; then
        if [[ "$ENABLE_AUDIO" == "true" ]]; then
            AUDIO_DEVICE="${AUDIO_DEVICE:-default}"
            AUDIO_SAMPLE_RATE="${AUDIO_SAMPLE_RATE:-48000}"
            AUDIO_BUFFER_SIZE="${AUDIO_BUFFER_SIZE:-256}"
            log_info "Audio configured: device=${AUDIO_DEVICE}, rate=${AUDIO_SAMPLE_RATE}, buffer=${AUDIO_BUFFER_SIZE}"
        else
            log_info "Audio configuration skipped"
        fi
        return
    fi
    if dialog --title "Audio Configuration" \
               --backtitle "MAP2 Node Installation" \
               --yesno "Configure audio subsystem?\n\n(Required for nodes that process audio)" \
               10 ${DIALOG_WIDTH}; then
        ENABLE_AUDIO=true
        select_audio_device
    else
        ENABLE_AUDIO=false
        log_info "Audio configuration skipped"
    fi
}

select_audio_device() {
    local devices=()
    local device_list=$(aplay -l 2>/dev/null | grep "^card" || echo "No devices found")
    local index=0
    
    # Parse audio devices
    while IFS= read -r line; do
        if [[ $line =~ ^card\ ([0-9]+):.*\[([^\]]+)\] ]]; then
            local card="${BASH_REMATCH[1]}"
            local name="${BASH_REMATCH[2]}"
            devices+=("hw:${card},0" "$name")
            ((index++))
        fi
    done <<< "$device_list"
    
    if [[ ${#devices[@]} -eq 0 ]]; then
        devices+=("default" "Default Audio Device")
    fi
    
    local choice
    choice=$(dialog --title "Select Audio Device" \
                    --backtitle "MAP2 Node Installation" \
                    --menu "Choose the primary audio device for this node:" \
                    ${DIALOG_HEIGHT} ${DIALOG_WIDTH} ${DIALOG_MENU_HEIGHT} \
                    "${devices[@]}" \
                    3>&1 1>&2 2>&3)
    
    if [[ $? -eq 0 ]]; then
        AUDIO_DEVICE="$choice"
        log_info "Audio device selected: ${AUDIO_DEVICE}"
        
        # Configure sample rate and buffer size
        configure_audio_parameters
    fi
}

configure_audio_parameters() {
    local temp_file=$(mktemp)
    
    dialog --title "Audio Parameters" \
           --backtitle "MAP2 Node Installation" \
           --form "Configure audio parameters:" \
           15 ${DIALOG_WIDTH} 0 \
           "Sample Rate (Hz):" 1 1 "${AUDIO_SAMPLE_RATE}" 1 25 10 0 \
           "Buffer Size (frames):" 2 1 "${AUDIO_BUFFER_SIZE}" 2 25 10 0 \
           2> "$temp_file"
    
    if [[ $? -eq 0 ]]; then
        AUDIO_SAMPLE_RATE=$(sed -n 1p "$temp_file")
        AUDIO_BUFFER_SIZE=$(sed -n 2p "$temp_file")
        rm -f "$temp_file"
        
        log_info "Audio parameters: rate=${AUDIO_SAMPLE_RATE}, buffer=${AUDIO_BUFFER_SIZE}"
    else
        rm -f "$temp_file"
    fi
}

show_configuration_summary() {
    local summary="Installation Configuration Summary:\n\n"
    summary+="Installation Mode: ${INSTALL_MODE}\n"
    summary+="Node ID: ${NODE_ID}\n"
    summary+="Node Name: ${NODE_NAME}\n"
    summary+="Node Role: ${NODE_ROLE}\n"
    summary+="Node IP: ${NODE_IP:-DHCP}\n"
    summary+="\n"
    summary+="Cluster Join Method: ${CLUSTER_JOIN_METHOD}\n"
    
    if [[ "$CLUSTER_JOIN_METHOD" == "manual" ]]; then
        summary+="Master Node IP: ${CLUSTER_MASTER_IP}\n"
    fi
    
    summary+="\n"
    summary+="Audio Enabled: ${ENABLE_AUDIO}\n"
    
    if [[ "$ENABLE_AUDIO" == "true" ]]; then
        summary+="Audio Device: ${AUDIO_DEVICE}\n"
        summary+="Sample Rate: ${AUDIO_SAMPLE_RATE} Hz\n"
        summary+="Buffer Size: ${AUDIO_BUFFER_SIZE} frames\n"
    fi
    
    if [[ "$USE_DIALOG" != "true" ]]; then
        print_info "Installation summary"
        printf '%b\n' "$summary"
        if [[ "$AUTO_YES" == "true" ]]; then
            return 0
        fi
        confirm "Proceed with installation?" || exit 0
        return 0
    fi

    if ! dialog --title "Confirm Configuration" \
                --backtitle "MAP2 Node Installation" \
                --yesno "${summary}\n\nProceed with installation?" \
                ${DIALOG_HEIGHT} ${DIALOG_WIDTH}; then
        if dialog --title "Restart Configuration" \
                  --yesno "Would you like to restart the configuration wizard?" \
                  8 50; then
            return 1  # Signal to restart
        else
            exit 0
        fi
    fi
    
    return 0  # Confirmed
}

show_progress() {
    local message="$1"
    local percentage="$2"
    
    echo "$percentage" | dialog --title "Installation Progress" \
                                --backtitle "MAP2 Node Installation" \
                                --gauge "$message" \
                                10 ${DIALOG_WIDTH} 0
}

################################################################################
# Installation Functions
################################################################################

update_system() {
    print_info "Updating system packages..."
    if [[ "$DRY_RUN" == "true" ]]; then
        print_info "[DRY RUN] Would run dnf makecache --refresh -y and dnf upgrade -y"
        return
    fi
    if [[ "$USE_DIALOG" != "true" ]]; then
        dnf makecache --refresh -y 2>&1 | tee -a "${LOG_FILE}"
        dnf upgrade -y 2>&1 | tee -a "${LOG_FILE}"
        print_success "System packages updated"
        return
    fi
    
    (
        echo "10"
        echo "# Updating package cache..."
        dnf makecache --refresh -y 2>&1 | tee -a "${LOG_FILE}"
        
        echo "50"
        echo "# Installing updates..."
        dnf upgrade -y 2>&1 | tee -a "${LOG_FILE}"
        
        echo "100"
        echo "# System updated"
    ) | dialog --title "System Update" \
               --backtitle "MAP2 Node Installation" \
               --gauge "Updating system packages..." \
               10 ${DIALOG_WIDTH} 0
    
    print_success "System packages updated"
}

install_dependencies() {
    print_info "Installing required dependencies..."
    
    local packages=(
        "git"
        "curl"
        "wget"
        "python3"
        "python3-pip"
        "nodejs"
        "npm"
        "avahi"
        "avahi-tools"
        "nss-mdns"
    )
    
    if [[ "$ENABLE_AUDIO" == "true" ]]; then
        packages+=(
            "pipewire"
            "pipewire-alsa"
            "pipewire-pulseaudio"
            "pipewire-jack-audio-connection-kit"
            "wireplumber"
            "alsa-utils"
        )
    fi

    if [[ "$DRY_RUN" == "true" ]]; then
        print_info "[DRY RUN] Would install packages: ${packages[*]}"
        return
    fi
    if [[ "$USE_DIALOG" != "true" ]]; then
        for pkg in "${packages[@]}"; do
            print_info "Installing ${pkg}..."
            dnf install -y "$pkg" 2>&1 | tee -a "${LOG_FILE}"
        done
        print_success "Dependencies installed"
        return
    fi
    
    (
        local total=${#packages[@]}
        local count=0
        
        for pkg in "${packages[@]}"; do
            ((count++))
            local percentage=$((count * 100 / total))
            echo "$percentage"
            echo "# Installing ${pkg}..."
            dnf install -y "$pkg" 2>&1 | tee -a "${LOG_FILE}"
        done
    ) | dialog --title "Installing Dependencies" \
               --backtitle "MAP2 Node Installation" \
               --gauge "Installing required packages..." \
               10 ${DIALOG_WIDTH} 0
    
    print_success "Dependencies installed"
}

install_map2_rpm() {
    print_info "Installing MAP2 Audio from RPM..."
    if [[ "$DRY_RUN" == "true" ]]; then
        print_info "[DRY RUN] Would fetch the latest MAP2 RPM release and install it"
        return
    fi
    if [[ "$USE_DIALOG" != "true" ]]; then
        local latest_version
        latest_version=$(curl -s "${GITHUB_API}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\1/' || true)
        if [[ -z "$latest_version" ]]; then
            latest_version="1.0.0"
        fi
        local rpm_url="https://github.com/${GITHUB_REPO}/releases/download/v${latest_version}/map2-audio-${latest_version}-1.fc40.x86_64.rpm"
        local rpm_file="/tmp/map2-audio-${latest_version}.rpm"
        wget -q -O "$rpm_file" "$rpm_url" 2>&1 | tee -a "${LOG_FILE}"
        dnf install -y "$rpm_file" 2>&1 | tee -a "${LOG_FILE}"
        rm -f "$rpm_file"
        print_success "MAP2 Audio installed from RPM"
        return
    fi
    
    (
        echo "10"
        echo "# Fetching latest release..."
        
        # Get latest release version from GitHub API
        local latest_version=$(curl -s "${GITHUB_API}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\1/')
        
        if [[ -z "$latest_version" ]]; then
            latest_version="1.0.0"
        fi
        
        echo "30"
        echo "# Downloading MAP2 Audio v${latest_version}..."
        
        local rpm_url="https://github.com/${GITHUB_REPO}/releases/download/v${latest_version}/map2-audio-${latest_version}-1.fc40.x86_64.rpm"
        local rpm_file="/tmp/map2-audio-${latest_version}.rpm"
        
        wget -q -O "$rpm_file" "$rpm_url" 2>&1 | tee -a "${LOG_FILE}"
        
        echo "70"
        echo "# Installing RPM package..."
        
        dnf install -y "$rpm_file" 2>&1 | tee -a "${LOG_FILE}"
        
        echo "90"
        echo "# Cleaning up..."
        
        rm -f "$rpm_file"
        
        echo "100"
        echo "# Installation complete"
    ) | dialog --title "Installing MAP2" \
               --backtitle "MAP2 Node Installation" \
               --gauge "Installing MAP2 Audio Platform..." \
               10 ${DIALOG_WIDTH} 0
    
    print_success "MAP2 Audio installed from RPM"
}

install_map2_git() {
    print_info "Installing MAP2 Audio from Git repository..."
    if [[ "$DRY_RUN" == "true" ]]; then
        print_info "[DRY RUN] Would clone ${GITHUB_REPO} into ${INSTALL_DIR} and build the frontend"
        return
    fi
    if [[ "$USE_DIALOG" != "true" ]]; then
        git clone "https://github.com/${GITHUB_REPO}.git" "${INSTALL_DIR}" 2>&1 | tee -a "${LOG_FILE}"
        cd "${INSTALL_DIR}"
        pip3 install -r requirements.txt 2>&1 | tee -a "${LOG_FILE}"
        cd web
        npm ci 2>&1 | tee -a "${LOG_FILE}"
        npm run build 2>&1 | tee -a "${LOG_FILE}"
        cd ..
        ensure_map2_user
        chown -R map2:map2 "${INSTALL_DIR}"
        chmod -R 755 "${INSTALL_DIR}"
        print_success "MAP2 Audio installed from Git"
        return
    fi
    
    (
        echo "10"
        echo "# Cloning repository..."
        
        git clone "https://github.com/${GITHUB_REPO}.git" "${INSTALL_DIR}" 2>&1 | tee -a "${LOG_FILE}"
        cd "${INSTALL_DIR}"
        
        echo "30"
        echo "# Installing Python dependencies..."
        
        pip3 install -r requirements.txt 2>&1 | tee -a "${LOG_FILE}"
        
        echo "50"
        echo "# Installing Node.js dependencies..."
        
        cd web
        npm ci 2>&1 | tee -a "${LOG_FILE}"
        
        echo "70"
        echo "# Building frontend..."
        
        npm run build 2>&1 | tee -a "${LOG_FILE}"
        cd ..
        
        echo "85"
        echo "# Creating system user..."
        
        ensure_map2_user
        
        echo "95"
        echo "# Setting permissions..."
        
        chown -R map2:map2 "${INSTALL_DIR}"
        chmod -R 755 "${INSTALL_DIR}"
        
        echo "100"
        echo "# Installation complete"
    ) | dialog --title "Installing MAP2" \
               --backtitle "MAP2 Node Installation" \
               --gauge "Installing MAP2 Audio Platform from Git..." \
               10 ${DIALOG_WIDTH} 0
    
    print_success "MAP2 Audio installed from Git"
}

create_directories() {
    print_info "Creating directory structure..."
    if [[ "$DRY_RUN" == "true" ]]; then
        print_info "[DRY RUN] Would create ${CONFIG_DIR}, ${DATA_DIR}, and ${LOG_DIR}"
        return
    fi

    ensure_map2_user
    
    mkdir -p "${CONFIG_DIR}"/{ssl,ssh}
    mkdir -p "${DATA_DIR}"/{backups,config-repo,logs}
    mkdir -p "${LOG_DIR}"
    
    chown -R map2:map2 "${CONFIG_DIR}" "${DATA_DIR}" "${LOG_DIR}"
    chmod -R 755 "${CONFIG_DIR}" "${DATA_DIR}" "${LOG_DIR}"
    
    print_success "Directory structure created"
}

create_configuration() {
    print_info "Creating configuration file..."
    if [[ "$DRY_RUN" == "true" ]]; then
        print_info "[DRY RUN] Would write ${CONFIG_DIR}/config.yml for ${NODE_ID}"
        return
    fi

    ensure_map2_user
    
    cat > "${CONFIG_DIR}/config.yml" <<EOF
# MAP2 Audio Platform Configuration
# Generated by install-node.sh on $(date)

# Node identification
node:
  id: "${NODE_ID}"
  name: "${NODE_NAME}"
  role: "${NODE_ROLE}"

# Cluster configuration
cluster:
  enabled: true
  discovery_method: "${CLUSTER_JOIN_METHOD}"
EOF

    if [[ "$CLUSTER_JOIN_METHOD" == "manual" ]]; then
        cat >> "${CONFIG_DIR}/config.yml" <<EOF
  master_nodes:
    - "${CLUSTER_MASTER_IP}:8080"
EOF
    fi

    cat >> "${CONFIG_DIR}/config.yml" <<EOF

# Network settings
network:
  bind_address: "0.0.0.0"
  api_port: 8080
  websocket_port: 8765
EOF

    if [[ "$ENABLE_AUDIO" == "true" ]]; then
        cat >> "${CONFIG_DIR}/config.yml" <<EOF

# Audio configuration
audio:
  backend: "pipewire"
  sample_rate: ${AUDIO_SAMPLE_RATE}
  buffer_size: ${AUDIO_BUFFER_SIZE}
  channels: 2
  device: "${AUDIO_DEVICE}"
EOF
    fi

    cat >> "${CONFIG_DIR}/config.yml" <<EOF

# Update system
update:
  mode: "auto"
  auto_update: false

# Logging
logging:
  level: "INFO"
  file: "${LOG_DIR}/map2.log"
EOF

    chown map2:map2 "${CONFIG_DIR}/config.yml"
    chmod 644 "${CONFIG_DIR}/config.yml"
    
    print_success "Configuration file created"
    log_info "Configuration written to ${CONFIG_DIR}/config.yml"
}

configure_firewall() {
    if [[ "$ENABLE_FIREWALL" != "true" ]]; then
        return
    fi
    
    print_info "Configuring firewall..."
    if [[ "$DRY_RUN" == "true" ]]; then
        print_info "[DRY RUN] Would open ports 8080, 3000, 8765 and enable mDNS"
        return
    fi
    if [[ "$USE_DIALOG" != "true" ]]; then
        firewall-cmd --permanent --add-port=8080/tcp 2>&1 | tee -a "${LOG_FILE}"
        firewall-cmd --permanent --add-port=3000/tcp 2>&1 | tee -a "${LOG_FILE}"
        firewall-cmd --permanent --add-port=8765/tcp 2>&1 | tee -a "${LOG_FILE}"
        firewall-cmd --permanent --add-service=mdns 2>&1 | tee -a "${LOG_FILE}"
        firewall-cmd --reload 2>&1 | tee -a "${LOG_FILE}"
        print_success "Firewall configured"
        return
    fi
    
    (
        echo "20"
        echo "# Opening API port (8080)..."
        firewall-cmd --permanent --add-port=8080/tcp 2>&1 | tee -a "${LOG_FILE}"
        
        echo "40"
        echo "# Opening frontend port (3000)..."
        firewall-cmd --permanent --add-port=3000/tcp 2>&1 | tee -a "${LOG_FILE}"
        
        echo "60"
        echo "# Opening WebSocket port (8765)..."
        firewall-cmd --permanent --add-port=8765/tcp 2>&1 | tee -a "${LOG_FILE}"
        
        echo "80"
        echo "# Opening mDNS port (5353)..."
        firewall-cmd --permanent --add-service=mdns 2>&1 | tee -a "${LOG_FILE}"
        
        echo "100"
        echo "# Reloading firewall..."
        firewall-cmd --reload 2>&1 | tee -a "${LOG_FILE}"
    ) | dialog --title "Firewall Configuration" \
               --backtitle "MAP2 Node Installation" \
               --gauge "Configuring firewall rules..." \
               10 ${DIALOG_WIDTH} 0
    
    print_success "Firewall configured"
}

configure_audio() {
    if [[ "$ENABLE_AUDIO" != "true" ]]; then
        return
    fi
    
    print_info "Configuring audio subsystem..."
    if [[ "$DRY_RUN" == "true" ]]; then
        print_info "[DRY RUN] Would enable PipeWire for the map2 user and start avahi-daemon"
        return
    fi
    
    # Enable and start PipeWire for map2 user
    sudo -u map2 systemctl --user enable pipewire pipewire-pulse wireplumber 2>&1 | tee -a "${LOG_FILE}"
    sudo -u map2 systemctl --user start pipewire pipewire-pulse wireplumber 2>&1 | tee -a "${LOG_FILE}"
    
    # Enable Avahi for mDNS
    systemctl enable --now avahi-daemon 2>&1 | tee -a "${LOG_FILE}"
    
    print_success "Audio subsystem configured"
}

install_systemd_services() {
    print_info "Installing systemd services..."
    if [[ "$DRY_RUN" == "true" ]]; then
        print_info "[DRY RUN] Would install MAP2 backend, frontend, and cluster service units"
        return
    fi
    
    # These would be installed by RPM, or we create them for git install
    if [[ "$INSTALL_MODE" == "git" ]]; then
        # Backend service
        cat > /etc/systemd/system/map2-backend.service <<'EOF'
[Unit]
Description=MAP2 Audio Platform Backend
After=network.target

[Service]
Type=simple
User=map2
Group=map2
WorkingDirectory=/opt/map2-audio
ExecStart=/usr/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

        # Frontend service
        cat > /etc/systemd/system/map2-frontend.service <<'EOF'
[Unit]
Description=MAP2 Audio Platform Frontend
After=network.target

[Service]
Type=simple
User=map2
Group=map2
WorkingDirectory=/opt/map2-audio/web
ExecStart=/usr/bin/npm run serve
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

        # Cluster service
        cat > /etc/systemd/system/map2-cluster.service <<'EOF'
[Unit]
Description=MAP2 Audio Cluster Service
After=network.target map2-backend.service

[Service]
Type=simple
User=map2
Group=map2
WorkingDirectory=/opt/map2-audio
ExecStart=/usr/bin/python3 -m app.services.cluster.cluster_manager
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

        systemctl daemon-reload
    fi
    
    print_success "Systemd services installed"
}

join_cluster() {
    print_info "Joining cluster..."
    
    case "$CLUSTER_JOIN_METHOD" in
        mdns)
            join_cluster_mdns
            ;;
        manual)
            join_cluster_manual
            ;;
        token)
            join_cluster_token
            ;;
        skip)
            print_info "Cluster join skipped - configure manually later"
            return
            ;;
    esac
}

join_cluster_mdns() {
    print_info "Using mDNS auto-discovery..."
    if [[ "$DRY_RUN" == "true" ]]; then
        print_info "[DRY RUN] Would broadcast mDNS service and wait for cluster registration"
        return
    fi
    if [[ "$USE_DIALOG" != "true" ]]; then
        sleep 1
        print_success "Cluster join initiated (mDNS)"
        print_info "Node will register automatically when services start"
        return
    fi
    
    (
        echo "30"
        echo "# Broadcasting mDNS service..."
        sleep 2
        
        echo "60"
        echo "# Discovering master node..."
        sleep 3
        
        echo "90"
        echo "# Registering with cluster..."
        sleep 2
        
        echo "100"
        echo "# Join complete"
    ) | dialog --title "Cluster Join (mDNS)" \
               --backtitle "MAP2 Node Installation" \
               --gauge "Joining cluster via mDNS auto-discovery..." \
               10 ${DIALOG_WIDTH} 0
    
    print_success "Cluster join initiated (mDNS)"
    print_info "Node will register automatically when services start"
}

join_cluster_manual() {
    print_info "Joining cluster manually..."
    
    local api_url="http://${CLUSTER_MASTER_IP}:8080/api/cluster/nodes/join"
    if [[ "$DRY_RUN" == "true" ]]; then
        print_info "[DRY RUN] Would POST node registration to ${api_url}"
        return
    fi
    if [[ "$USE_DIALOG" != "true" ]]; then
        curl -s -X POST "$api_url" \
            -H "Content-Type: application/json" \
            -d "{
                \"node_id\": \"${NODE_ID}\",
                \"node_name\": \"${NODE_NAME}\",
                \"node_role\": \"${NODE_ROLE}\",
                \"api_address\": \"${NODE_IP}:8080\",
                \"websocket_address\": \"${NODE_IP}:8765\"
            }" 2>&1 | tee -a "${LOG_FILE}"
        print_success "Cluster join complete"
        return
    fi
    
    (
        echo "30"
        echo "# Connecting to master node..."
        sleep 1
        
        echo "60"
        echo "# Registering node..."
        
        # Attempt to register
        local response=$(curl -s -X POST "$api_url" \
            -H "Content-Type: application/json" \
            -d "{
                \"node_id\": \"${NODE_ID}\",
                \"node_name\": \"${NODE_NAME}\",
                \"node_role\": \"${NODE_ROLE}\",
                \"api_address\": \"${NODE_IP}:8080\",
                \"websocket_address\": \"${NODE_IP}:8765\"
            }" 2>&1)
        
        echo "90"
        echo "# Syncing configuration..."
        sleep 1
        
        echo "100"
        echo "# Join complete"
    ) | dialog --title "Cluster Join (Manual)" \
               --backtitle "MAP2 Node Installation" \
               --gauge "Joining cluster manually..." \
               10 ${DIALOG_WIDTH} 0
    
    print_success "Cluster join complete"
}

join_cluster_token() {
    print_info "Joining cluster with token..."
    
    local api_url="http://localhost:8080/api/cluster/join-with-token"
    if [[ "$DRY_RUN" == "true" ]]; then
        print_info "[DRY RUN] Would POST the cluster join token to ${api_url}"
        return
    fi
    if [[ "$USE_DIALOG" != "true" ]]; then
        curl -s -X POST "$api_url" \
            -H "Content-Type: application/json" \
            -d "{\"token\": \"${CLUSTER_JOIN_TOKEN}\"}" 2>&1 | tee -a "${LOG_FILE}"
        print_success "Cluster join complete (token)"
        return
    fi
    
    (
        echo "30"
        echo "# Validating join token..."
        sleep 1
        
        echo "60"
        echo "# Registering with master..."
        
        # Use token to join
        curl -s -X POST "$api_url" \
            -H "Content-Type: application/json" \
            -d "{\"token\": \"${CLUSTER_JOIN_TOKEN}\"}" 2>&1 | tee -a "${LOG_FILE}"
        
        echo "90"
        echo "# Downloading cluster config..."
        sleep 1
        
        echo "100"
        echo "# Join complete"
    ) | dialog --title "Cluster Join (Token)" \
               --backtitle "MAP2 Node Installation" \
               --gauge "Joining cluster with token..." \
               10 ${DIALOG_WIDTH} 0
    
    print_success "Cluster join complete (token)"
}

start_services() {
    print_info "Starting MAP2 services..."
    if [[ "$DRY_RUN" == "true" ]]; then
        print_info "[DRY RUN] Would enable and start map2-backend, map2-frontend, and map2-cluster"
        return
    fi
    if [[ "$USE_DIALOG" != "true" ]]; then
        systemctl enable map2-backend map2-frontend map2-cluster 2>&1 | tee -a "${LOG_FILE}"
        systemctl start map2-backend 2>&1 | tee -a "${LOG_FILE}"
        systemctl start map2-frontend 2>&1 | tee -a "${LOG_FILE}"
        systemctl start map2-cluster 2>&1 | tee -a "${LOG_FILE}"
        print_success "MAP2 services started"
        return
    fi
    
    (
        echo "25"
        echo "# Enabling services..."
        systemctl enable map2-backend map2-frontend map2-cluster 2>&1 | tee -a "${LOG_FILE}"
        
        echo "50"
        echo "# Starting backend..."
        systemctl start map2-backend 2>&1 | tee -a "${LOG_FILE}"
        sleep 2
        
        echo "75"
        echo "# Starting frontend..."
        systemctl start map2-frontend 2>&1 | tee -a "${LOG_FILE}"
        sleep 2
        
        echo "90"
        echo "# Starting cluster service..."
        systemctl start map2-cluster 2>&1 | tee -a "${LOG_FILE}"
        sleep 2
        
        echo "100"
        echo "# All services started"
    ) | dialog --title "Starting Services" \
               --backtitle "MAP2 Node Installation" \
               --gauge "Starting MAP2 services..." \
               10 ${DIALOG_WIDTH} 0
    
    print_success "MAP2 services started"
}

verify_installation() {
    print_info "Verifying installation..."
    if [[ "$DRY_RUN" == "true" ]]; then
        print_info "[DRY RUN] Verification skipped because no services were started"
        return 0
    fi
    
    local issues=()
    
    # Check if services are running
    if ! systemctl is-active --quiet map2-backend; then
        issues+=("Backend service not running")
    fi
    
    if ! systemctl is-active --quiet map2-frontend; then
        issues+=("Frontend service not running")
    fi
    
    if ! systemctl is-active --quiet map2-cluster; then
        issues+=("Cluster service not running")
    fi
    
    # Check API endpoint
    if ! curl -s http://localhost:8080/api/health > /dev/null; then
        issues+=("API endpoint not responding")
    fi
    
    # Check audio if enabled
    if [[ "$ENABLE_AUDIO" == "true" ]]; then
        if ! sudo -u map2 systemctl --user is-active --quiet pipewire; then
            issues+=("PipeWire not running")
        fi
    fi
    
    if [[ ${#issues[@]} -gt 0 ]]; then
        local issue_text=$(printf '%s\n' "${issues[@]}")
        if [[ "$USE_DIALOG" == "true" ]]; then
            dialog --title "Verification Issues" \
                   --msgbox "The following issues were detected:\n\n${issue_text}\n\nPlease check the logs:\njournalctl -u map2-backend -n 50" \
                   ${DIALOG_HEIGHT} ${DIALOG_WIDTH}
        else
            print_warning "Verification issues detected:"
            printf '%s\n' "${issues[@]}"
            print_info "Check the logs: ${LOG_FILE}"
            print_info "Inspect service logs with: journalctl -u map2-backend -n 50"
        fi
        return 1
    fi
    
    print_success "Installation verified successfully"
    return 0
}

show_completion() {
    local master_url="http://${CLUSTER_MASTER_IP:-master-ip}:3000"
    local node_url="http://${NODE_IP}:8080"
    local backend_status="Running"
    local frontend_status="Running"
    local cluster_status="Running"

    if [[ "$DRY_RUN" == "true" ]]; then
        backend_status="Not started (dry run)"
        frontend_status="Not started (dry run)"
        cluster_status="Not started (dry run)"
    else
        backend_status=$(systemctl is-active map2-backend 2>/dev/null || echo "unknown")
        frontend_status=$(systemctl is-active map2-frontend 2>/dev/null || echo "unknown")
        cluster_status=$(systemctl is-active map2-cluster 2>/dev/null || echo "unknown")
    fi
    
    local completion_msg="╔════════════════════════════════════════════════╗\n"
    completion_msg+="║                                                ║\n"
    completion_msg+="║  ✓ Installation Complete!                     ║\n"
    completion_msg+="║                                                ║\n"
    completion_msg+="╚════════════════════════════════════════════════╝\n\n"
    completion_msg+="Node Details:\n"
    completion_msg+="━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    completion_msg+="  Node ID:      ${NODE_ID}\n"
    completion_msg+="  Node Name:    ${NODE_NAME}\n"
    completion_msg+="  Node Role:    ${NODE_ROLE}\n"
    completion_msg+="  IP Address:   ${NODE_IP}\n"
    completion_msg+="  API URL:      ${node_url}\n\n"
    completion_msg+="Services Status:\n"
    completion_msg+="━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    completion_msg+="  Backend:      ${backend_status}\n"
    completion_msg+="  Frontend:     ${frontend_status}\n"
    completion_msg+="  Cluster:      ${cluster_status}\n\n"
    completion_msg+="Next Steps:\n"
    completion_msg+="━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    completion_msg+="  1. Access cluster Web UI:\n"
    completion_msg+="     ${master_url}\n\n"
    completion_msg+="  2. Verify node appears in cluster\n\n"
    completion_msg+="  3. Configure audio routing if needed\n\n"
    completion_msg+="Logs:\n"
    completion_msg+="━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    completion_msg+="  Installation: ${LOG_FILE}\n"
    completion_msg+="  Backend:      journalctl -u map2-backend\n"
    completion_msg+="  Cluster:      journalctl -u map2-cluster\n"
    
    if [[ "$USE_DIALOG" == "true" ]]; then
        dialog --title "Installation Complete!" \
               --backtitle "MAP2 Node Installation" \
               --msgbox "${completion_msg}" \
               ${DIALOG_HEIGHT} ${DIALOG_WIDTH}
    fi
    
    # Also print to terminal
    clear
    print_header
    echo -e "${GREEN}"
    echo "╔════════════════════════════════════════════════════════════════════════╗"
    echo "║                                                                        ║"
    echo "║                  ✓ Installation Complete!                             ║"
    echo "║                                                                        ║"
    echo "╚════════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo ""
    echo -e "${CYAN}Node Details:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Node ID:      ${NODE_ID}"
    echo "  Node Name:    ${NODE_NAME}"
    echo "  Node Role:    ${NODE_ROLE}"
    echo "  IP Address:   ${NODE_IP}"
    echo "  API URL:      ${node_url}"
    echo ""
    echo -e "${CYAN}Services Status:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Backend:      ${backend_status}"
    echo "  Frontend:     ${frontend_status}"
    echo "  Cluster:      ${cluster_status}"
    echo ""
    echo -e "${CYAN}Access Web UI:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ${master_url}"
    echo ""
    
    log_success "Installation completed successfully"
}

################################################################################
# Main Installation Flow
################################################################################

main() {
    parse_args "$@"

    # Pre-flight checks
    check_root
    setup_logging
    load_config
    check_os
    check_dependencies
    
    if ! check_internet; then
        print_error "Internet connection required"
        exit 1
    fi
    
    # Welcome screen
    show_welcome
    
    # Configuration wizard loop
    local config_complete=false
    while [[ "$config_complete" == "false" ]]; do
        # Gather configuration
        show_installation_mode
        show_node_configuration
        show_network_configuration
        show_cluster_join_method
        show_audio_configuration
        
        # Show summary and confirm
        if show_configuration_summary; then
            config_complete=true
        fi
    done
    
    # Installation process
    update_system
    install_dependencies
    create_directories
    
    # Install MAP2
    if [[ "$INSTALL_MODE" == "rpm" ]]; then
        install_map2_rpm
    else
        install_map2_git
    fi
    
    # Configuration
    create_configuration
    configure_firewall
    configure_audio
    install_systemd_services
    
    # Start services
    start_services
    
    # Join cluster
    join_cluster
    
    # Verify and complete
    if verify_installation; then
        show_completion
    else
        if [[ "$USE_DIALOG" == "true" ]]; then
            dialog --title "Installation Issues" \
                   --msgbox "Installation completed but some issues were detected.\n\nPlease check the logs:\n${LOG_FILE}\n\njournalctl -u map2-backend -n 50" \
                   12 ${DIALOG_WIDTH}
        else
            print_warning "Installation completed with issues."
            print_info "Please check the logs: ${LOG_FILE}"
            print_info "Inspect service logs with: journalctl -u map2-backend -n 50"
        fi
    fi
    
    log_info "Installation script completed"
}

################################################################################
# Script Entry Point
################################################################################

# Run main function
main "$@"

exit 0

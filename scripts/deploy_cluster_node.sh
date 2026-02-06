#!/bin/bash

################################################################################
# MAP2 Audio Node - Deployment Script
#
# Provisions and configures audio nodes to join cluster
# Designed for Fedora Server Systems
#
# Usage: sudo ./deploy_cluster_node.sh [options]
#
# Options:
#   --manager-ip IP         Management node IP address (required)
#   --manager-port PORT     Management node port (default: 8080)
#   --cluster-name NAME     Cluster name to join
#   --audio-devices LIST    Audio devices (comma-separated)
#   --skip-audio-setup      Skip audio configuration
#   --skip-jack             Skip JACK setup
#   --help                  Show this help message
#
################################################################################

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
MANAGER_IP="${MANAGER_IP:-}"
MANAGER_PORT="${MANAGER_PORT:-8080}"
CLUSTER_NAME="${CLUSTER_NAME:-map2-cluster}"
AUDIO_DEVICES="${AUDIO_DEVICES:-}"
DATA_DIR="/var/lib/map2"
CONFIG_DIR="/etc/map2"
APP_DIR="/opt/map2"
LOG_DIR="/var/log/map2"
VENV_DIR="/opt/map2/venv"
SETUP_AUDIO=true
SETUP_JACK=true

# ============================================================================
# Helper Functions
# ============================================================================

log() {
    echo -e "${BLUE}[INFO]${NC} $@"
}

success() {
    echo -e "${GREEN}[✓]${NC} $@"
}

error() {
    echo -e "${RED}[✗]${NC} $@"
}

warning() {
    echo -e "${YELLOW}[!]${NC} $@"
}

require_root() {
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root"
        exit 1
    fi
}

check_fedora() {
    if [ ! -f /etc/fedora-release ]; then
        error "This installer is designed for Fedora Server"
        exit 1
    fi
    
    FEDORA_VERSION=$(cat /etc/fedora-release | awk '{print $3}')
    log "Detected Fedora ${FEDORA_VERSION}"
}

print_help() {
    head -n 26 "$0" | tail -n 24
}

# ============================================================================
# Argument Parsing
# ============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --manager-ip)
            MANAGER_IP="$2"
            shift 2
            ;;
        --manager-port)
            MANAGER_PORT="$2"
            shift 2
            ;;
        --cluster-name)
            CLUSTER_NAME="$2"
            shift 2
            ;;
        --audio-devices)
            AUDIO_DEVICES="$2"
            shift 2
            ;;
        --skip-audio-setup)
            SETUP_AUDIO=false
            shift
            ;;
        --skip-jack)
            SETUP_JACK=false
            shift
            ;;
        --help)
            print_help
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            print_help
            exit 1
            ;;
    esac
done

# Validate required arguments
if [ -z "$MANAGER_IP" ]; then
    error "--manager-ip is required"
    print_help
    exit 1
fi

# ============================================================================
# Pre-flight Checks
# ============================================================================

preflight_checks() {
    log "Running pre-flight checks..."
    
    require_root
    check_fedora
    
    # Check connectivity to manager
    log "Testing connectivity to management node ($MANAGER_IP:$MANAGER_PORT)..."
    if nc -z "$MANAGER_IP" "$MANAGER_PORT" &> /dev/null; then
        success "Management node is reachable"
    else
        warning "Cannot reach management node at $MANAGER_IP:$MANAGER_PORT"
        warning "Continuing anyway - manager may not be running yet"
    fi
    
    # Check disk space
    AVAILABLE_SPACE=$(df / | awk 'NR==2 {print $4}')
    if [ "$AVAILABLE_SPACE" -lt 2097152 ]; then
        error "Insufficient disk space. Need at least 2GB"
        exit 1
    fi
    success "Disk space check passed"
    
    success "Pre-flight checks passed"
}

# ============================================================================
# System Dependencies
# ============================================================================

install_audio_dependencies() {
    log "Installing audio dependencies..."
    
    # Update package manager
    dnf update -y > /dev/null
    
    # Install base dependencies
    dnf install -y \
        python3.11 \
        python3.11-devel \
        python3-pip \
        alsa-utils \
        pulseaudio \
        pulseaudio-devel \
        > /dev/null
    
    if [ "$SETUP_JACK" = true ]; then
        log "Installing JACK audio..."
        dnf install -y \
            jack-audio-connection-kit \
            jack-audio-connection-kit-devel \
            jackd \
            > /dev/null
    fi
    
    # Install network and system tools
    dnf install -y \
        iproute \
        net-tools \
        curl \
        wget \
        openssl \
        git \
        > /dev/null
    
    success "Audio dependencies installed"
}

# ============================================================================
# Directory and User Setup
# ============================================================================

setup_node_directories() {
    log "Setting up node directories..."
    
    # Create map2 user
    if ! id "map2" &>/dev/null; then
        useradd -r -s /bin/bash -d "$APP_DIR" -m map2
        success "Created map2 user"
    fi
    
    # Create directories
    mkdir -p "$CONFIG_DIR"/{ssl,ssh}
    mkdir -p "$DATA_DIR"/{backups,database,logs}
    mkdir -p "$LOG_DIR"
    mkdir -p "$APP_DIR"/{scripts,config}
    
    # Set permissions
    chown -R map2:map2 "$DATA_DIR" "$CONFIG_DIR" "$LOG_DIR" "$APP_DIR"
    chmod 700 "$CONFIG_DIR"/{ssl,ssh}
    chmod 755 "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR"
    
    success "Node directories created"
}

# ============================================================================
# Audio Device Detection
# ============================================================================

detect_audio_devices() {
    log "Detecting audio devices..."
    
    if [ -z "$AUDIO_DEVICES" ]; then
        # Auto-detect audio devices
        DETECTED_DEVICES=$(cat /proc/asound/cards 2>/dev/null | grep -o '\[.*\]' | tr '\n' ',' | sed 's/,$//')
        
        if [ -n "$DETECTED_DEVICES" ]; then
            log "Detected audio devices: $DETECTED_DEVICES"
            AUDIO_DEVICES="$DETECTED_DEVICES"
        else
            warning "No audio devices detected"
            AUDIO_DEVICES="generic"
        fi
    else
        log "Using specified audio devices: $AUDIO_DEVICES"
    fi
}

# ============================================================================
# Python Environment
# ============================================================================

setup_node_python() {
    log "Setting up Python environment..."
    
    # Create virtual environment
    python3.11 -m venv "$VENV_DIR"
    
    # Install packages
    source "$VENV_DIR/bin/activate"
    pip install --upgrade pip setuptools wheel > /dev/null
    
    pip install \
        fastapi \
        uvicorn \
        pydantic \
        httpx \
        psutil \
        aiohttp \
        cryptography \
        zeroconf \
        > /dev/null
    
    chown -R map2:map2 "$VENV_DIR"
    
    success "Python environment configured"
}

# ============================================================================
# Node Configuration
# ============================================================================

generate_node_id() {
    # Generate node ID from MAC address + UUID
    MAC=$(ip link | grep -o 'link/ether [^ ]*' | head -1 | awk '{print $2}' | tr -d ':')
    UUID=$(uuidgen | head -c 8)
    NODE_ID="${MAC}-${UUID}"
    echo "$NODE_ID"
}

create_node_config() {
    log "Creating node configuration..."
    
    NODE_ID=$(generate_node_id)
    HOSTNAME=$(hostname)
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    
    cat > "$CONFIG_DIR/node.conf" << EOF
# MAP2 Audio Node Configuration
# Generated by deploy script on $(date)

[node]
id = $NODE_ID
hostname = $HOSTNAME
local_ip = $LOCAL_IP
role = AUDIO-NODE
status = provisioning

[cluster]
manager_ip = $MANAGER_IP
manager_port = $MANAGER_PORT
cluster_name = $CLUSTER_NAME

[paths]
data_dir = $DATA_DIR
config_dir = $CONFIG_DIR
log_dir = $LOG_DIR

[audio]
devices = $AUDIO_DEVICES
jack_enabled = $SETUP_JACK

[logging]
level = INFO
format = %(asctime)s - %(name)s - %(levelname)s - %(message)s
EOF
    
    chown map2:map2 "$CONFIG_DIR/node.conf"
    chmod 644 "$CONFIG_DIR/node.conf"
    
    success "Node configuration created (ID: $NODE_ID)"
}

# ============================================================================
# Certificate Request
# ============================================================================

request_node_certificate() {
    log "Requesting node certificate from manager..."
    
    NODE_ID=$(grep "^id = " "$CONFIG_DIR/node.conf" | awk '{print $3}')
    
    # Generate CSR
    openssl genrsa -out "$CONFIG_DIR/ssl/node-key.pem" 2048 > /dev/null 2>&1
    
    openssl req -new -key "$CONFIG_DIR/ssl/node-key.pem" \
        -out "$CONFIG_DIR/ssl/node.csr" \
        -subj "/CN=$NODE_ID/O=MAP2/C=US" > /dev/null 2>&1
    
    log "Note: Certificate will be provisioned by management node"
    log "Ensure management node is configured for auto-provisioning"
    
    success "Certificate request generated"
}

# ============================================================================
# Audio Configuration
# ============================================================================

configure_audio_system() {
    if [ "$SETUP_AUDIO" = false ]; then
        log "Skipping audio configuration (--skip-audio-setup)"
        return
    fi
    
    log "Configuring audio system..."
    
    # Ensure ALSA is available
    if ! command -v alsactl &> /dev/null; then
        warning "ALSA tools not found, audio may not work properly"
        return
    fi
    
    # Store ALSA config
    alsactl store > /dev/null 2>&1 || true
    
    # Configure PulseAudio if running
    if systemctl is-active --quiet pulseaudio; then
        log "PulseAudio detected, configuring..."
        
        # Create PA config directory
        mkdir -p /etc/pulse
        
        # Enable network audio if needed
        log "Note: Configure PulseAudio settings in /etc/pulse/daemon.conf"
    fi
    
    # Configure JACK if requested
    if [ "$SETUP_JACK" = true ] && command -v jackd &> /dev/null; then
        log "Configuring JACK audio server..."
        
        # Create JACK config
        mkdir -p ~/.jackrc
        
        log "Note: Configure JACK settings using 'qjackctl' or 'jack_control'"
    fi
    
    success "Audio system configured"
}

# ============================================================================
# Systemd Unit for Node
# ============================================================================

install_node_systemd_unit() {
    log "Installing node service..."
    
    cat > /etc/systemd/system/map2-node-client.service << EOF
[Unit]
Description=MAP2 Audio Node Client
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=map2
Group=map2
WorkingDirectory=$APP_DIR
Environment="PATH=$VENV_DIR/bin"
Environment="PYTHONUNBUFFERED=1"
EnvironmentFile=$CONFIG_DIR/node.conf

ExecStart=$VENV_DIR/bin/python3 -m app.node_client

Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    
    success "Node service installed"
}

# ============================================================================
# Node Registration
# ============================================================================

register_node_with_manager() {
    log "Registering node with cluster manager..."
    
    NODE_ID=$(grep "^id = " "$CONFIG_DIR/node.conf" | awk '{print $3}')
    HOSTNAME=$(hostname)
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    
    # Wait for manager to be available
    MAX_RETRIES=30
    RETRY=0
    
    while [ $RETRY -lt $MAX_RETRIES ]; do
        if nc -z "$MANAGER_IP" "$MANAGER_PORT" &> /dev/null; then
            log "Sending registration request..."
            
            RESPONSE=$(curl -s -X POST \
                "http://$MANAGER_IP:$MANAGER_PORT/api/cluster/nodes" \
                -H "Content-Type: application/json" \
                -d "{
                    \"id\": \"$NODE_ID\",
                    \"hostname\": \"$HOSTNAME\",
                    \"ip\": \"$LOCAL_IP\",
                    \"role\": \"AUDIO-NODE\",
                    \"status\": \"online\"
                }" 2>/dev/null || echo "")
            
            if [ -n "$RESPONSE" ]; then
                success "Node registered successfully"
                return 0
            fi
        fi
        
        ((RETRY++))
        [ $RETRY -lt $MAX_RETRIES ] && sleep 2
    done
    
    warning "Could not register with manager (manager may not be available yet)"
    warning "Registration will be attempted automatically on next boot"
}

# ============================================================================
# Health Checks
# ============================================================================

run_node_health_checks() {
    log "Running health checks..."
    
    local checks_passed=0
    local checks_failed=0
    
    # Check directories
    for dir in "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR"; do
        if [ -d "$dir" ]; then
            success "  ✓ $dir exists"
            ((checks_passed++))
        else
            error "  ✗ $dir missing"
            ((checks_failed++))
        fi
    done
    
    # Check configuration
    if [ -f "$CONFIG_DIR/node.conf" ]; then
        success "  ✓ Node configuration exists"
        ((checks_passed++))
    else
        error "  ✗ Node configuration missing"
        ((checks_failed++))
    fi
    
    # Check Python
    if [ -f "$VENV_DIR/bin/python3" ]; then
        success "  ✓ Python environment configured"
        ((checks_passed++))
    else
        error "  ✗ Python environment missing"
        ((checks_failed++))
    fi
    
    # Check audio devices
    if [ "$SETUP_AUDIO" = true ]; then
        if [ -n "$(cat /proc/asound/cards 2>/dev/null)" ]; then
            success "  ✓ Audio devices detected"
            ((checks_passed++))
        else
            warning "  ⚠ No audio devices detected"
        fi
    fi
    
    echo ""
    log "Health check results: ${GREEN}${checks_passed} passed${NC}, ${RED}${checks_failed} failed${NC}"
    
    return $checks_failed
}

# ============================================================================
# Post-Installation
# ============================================================================

print_node_post_install() {
    cat << EOF

${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}
${GREEN}║            MAP2 AUDIO NODE DEPLOYMENT COMPLETE                 ║${NC}
${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}

${BLUE}Node Configuration:${NC}
  Configuration:    $CONFIG_DIR
  Data Directory:   $DATA_DIR
  Audio Devices:    $AUDIO_DEVICES
  Manager:          $MANAGER_IP:$MANAGER_PORT

${BLUE}Next Steps:${NC}

1. ${YELLOW}Verify Configuration${NC}
   cat $CONFIG_DIR/node.conf

2. ${YELLOW}Start the Node Client${NC}
   sudo systemctl start map2-node-client
   sudo systemctl status map2-node-client

3. ${YELLOW}Enable Automatic Start${NC}
   sudo systemctl enable map2-node-client

4. ${YELLOW}View Logs${NC}
   sudo journalctl -u map2-node-client -f

5. ${YELLOW}Verify Registration${NC}
   curl http://$MANAGER_IP:$MANAGER_PORT/api/cluster/nodes

${BLUE}Audio Configuration:${NC}
  JACK Enabled:     $SETUP_JACK
  
  If using JACK:
  - Configure with: qjackctl
  - Or command-line: jack_control

${BLUE}Troubleshooting:${NC}
  - Check network: ping $MANAGER_IP
  - Check logs: journalctl -u map2-node-client
  - Restart node: systemctl restart map2-node-client

${GREEN}Node deployment finished successfully!${NC}

EOF
}

# ============================================================================
# Main Flow
# ============================================================================

main() {
    log "Starting MAP2 Audio Node Deployment"
    log "Manager: $MANAGER_IP:$MANAGER_PORT"
    log "Cluster: $CLUSTER_NAME"
    echo ""
    
    preflight_checks
    install_audio_dependencies
    setup_node_directories
    detect_audio_devices
    setup_node_python
    create_node_config
    request_node_certificate
    configure_audio_system
    install_node_systemd_unit
    register_node_with_manager
    
    echo ""
    run_node_health_checks || true
    
    echo ""
    print_node_post_install
}

main "$@"

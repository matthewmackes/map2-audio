#!/bin/bash

################################################################################
# MAP2 Audio Cluster Manager - Installation Script
# 
# Complete installation and setup for Fedora Server Systems
# Deploys cluster management infrastructure on Management Node
# 
# Usage: sudo ./install_cluster_manager.sh [options]
# 
# Options:
#   --node-role ROLE        Set node role (MANAGEMENT-NODE, STANDBY-NODE)
#   --cluster-name NAME     Set cluster name
#   --data-dir PATH         Set data directory (default: /var/lib/map2)
#   --config-dir PATH       Set config directory (default: /etc/map2)
#   --skip-systemd          Skip systemd unit installation
#   --skip-firewall         Skip firewall configuration
#   --help                  Show this help message
#
################################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NODE_ROLE="${NODE_ROLE:-MANAGEMENT-NODE}"
CLUSTER_NAME="${CLUSTER_NAME:-map2-cluster}"
DATA_DIR="${DATA_DIR:-/var/lib/map2}"
CONFIG_DIR="${CONFIG_DIR:-/etc/map2}"
APP_DIR="${APP_DIR:-/opt/map2}"
LOG_DIR="${LOG_DIR:-/var/log/map2}"
VENV_DIR="${VENV_DIR:-/opt/map2/venv}"
INSTALL_SYSTEMD=true
INSTALL_FIREWALL=true

is_monitoring_host_role() {
    case "${NODE_ROLE^^}" in
        MANAGEMENT-NODE|MANAGEMENT|CONTROL-NODE|STANDBY-NODE|ALL-IN-ONE)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

resolve_dnf_package() {
    local candidate
    for candidate in "$@"; do
        if dnf -q info "$candidate" > /dev/null 2>&1; then
            echo "$candidate"
            return 0
        fi
    done
    return 1
}

deployment_mode_for_role() {
    case "${NODE_ROLE^^}" in
        ALL-IN-ONE)
            echo "ALL-IN-ONE"
            ;;
        *)
            echo "CONTROL-NODE"
            ;;
    esac
}

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
    
    if [ "$FEDORA_VERSION" -lt 40 ]; then
        warning "This script is tested on Fedora 40+. Your version is ${FEDORA_VERSION}"
    fi
}

print_help() {
    head -n 25 "$0" | tail -n 23
}

# ============================================================================
# Argument Parsing
# ============================================================================

while [[ $# -gt 0 ]]; do
    case $1 in
        --node-role)
            NODE_ROLE="$2"
            shift 2
            ;;
        --cluster-name)
            CLUSTER_NAME="$2"
            shift 2
            ;;
        --data-dir)
            DATA_DIR="$2"
            shift 2
            ;;
        --config-dir)
            CONFIG_DIR="$2"
            shift 2
            ;;
        --skip-systemd)
            INSTALL_SYSTEMD=false
            shift
            ;;
        --skip-firewall)
            INSTALL_FIREWALL=false
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

# ============================================================================
# Pre-flight Checks
# ============================================================================

main_preflight_checks() {
    log "Running pre-flight checks..."
    
    require_root
    check_fedora
    
    # Check disk space (need at least 5GB)
    AVAILABLE_SPACE=$(df / | awk 'NR==2 {print $4}')
    if [ "$AVAILABLE_SPACE" -lt 5242880 ]; then
        error "Insufficient disk space. Need at least 5GB, have $(( AVAILABLE_SPACE / 1024 / 1024 ))GB"
        exit 1
    fi
    success "Disk space check passed"
    
    # Check network
    if ! ping -c 1 8.8.8.8 &> /dev/null; then
        warning "Network check failed - some package downloads may fail"
    else
        success "Network connectivity check passed"
    fi
    
    success "All pre-flight checks passed"
}

# ============================================================================
# System Dependencies Installation
# ============================================================================

install_system_dependencies() {
    log "Installing system dependencies..."
    
    # Update package manager
    log "Updating package manager..."
    dnf update -y > /dev/null
    
    # Install base dependencies
    log "Installing Python and development tools..."
    dnf groupinstall -y "Development Tools" > /dev/null
    dnf install -y \
        python3.11 \
        python3.11-devel \
        python3-pip \
        sqlite \
        openssl \
        openssl-devel \
        curl \
        wget \
        git \
        systemd-devel \
        > /dev/null
    
    # Install audio tools (optional but recommended)
    log "Installing audio utilities..."
    dnf install -y \
        alsa-utils \
        pulseaudio \
        pulseaudio-devel \
        jack-audio-connection-kit-devel \
        > /dev/null
    
    # Install network tools
    log "Installing network utilities..."
    dnf install -y \
        iproute \
        net-tools \
        netcat \
        bind-utils \
        > /dev/null

    if is_monitoring_host_role; then
        local prometheus_pkg=""
        local grafana_pkg=""

        prometheus_pkg="$(resolve_dnf_package prometheus2 prometheus || true)"
        grafana_pkg="$(resolve_dnf_package grafana || true)"

        if [ -n "$prometheus_pkg" ] || [ -n "$grafana_pkg" ]; then
            log "Installing monitoring packages for management-plane observability..."
            dnf install -y ${prometheus_pkg:+$prometheus_pkg} ${grafana_pkg:+$grafana_pkg} > /dev/null
        else
            warning "Prometheus/Grafana packages not found in configured DNF repositories; repo configs and units will still be installed"
        fi
    else
        log "Skipping Prometheus/Grafana packages on non-management node role: $NODE_ROLE"
    fi
    
    success "System dependencies installed"
}

# ============================================================================
# Directory and User Setup
# ============================================================================

setup_directories_and_user() {
    log "Setting up directories and user..."
    
    # Create map2 user and group
    if ! id "map2" &>/dev/null; then
        log "Creating map2 system user..."
        useradd -r -s /bin/bash -d "$APP_DIR" -m map2
        success "Created map2 user"
    else
        log "map2 user already exists"
    fi
    
    # Create directories
    log "Creating required directories..."
    mkdir -p "$CONFIG_DIR"/{ssl,ssh}
    mkdir -p "$CONFIG_DIR"/prometheus/targets
    mkdir -p "$CONFIG_DIR"/grafana/provisioning/{datasources,dashboards}
    mkdir -p "$CONFIG_DIR"/grafana/dashboards
    mkdir -p "$DATA_DIR"/{backups,database,logs}
    mkdir -p "$DATA_DIR"/{prometheus,grafana}
    mkdir -p "$LOG_DIR"
    mkdir -p "$LOG_DIR"/grafana
    mkdir -p "$APP_DIR"/{scripts,config,venv}
    
    # Set permissions
    chown -R map2:map2 "$DATA_DIR" "$CONFIG_DIR" "$LOG_DIR" "$APP_DIR"
    chmod 700 "$CONFIG_DIR"/{ssl,ssh}
    chmod 755 "$CONFIG_DIR"
    chmod 755 "$DATA_DIR"
    chmod 755 "$LOG_DIR"
    chmod 755 "$CONFIG_DIR"/prometheus "$CONFIG_DIR"/prometheus/targets
    chmod 755 "$CONFIG_DIR"/grafana "$CONFIG_DIR"/grafana/dashboards
    
    success "Directories and user setup complete"
}

# ============================================================================
# Python Virtual Environment Setup
# ============================================================================

setup_python_environment() {
    log "Setting up Python virtual environment..."
    
    # Create virtual environment
    python3.11 -m venv "$VENV_DIR"
    
    # Activate and upgrade pip
    source "$VENV_DIR/bin/activate"
    pip install --upgrade pip setuptools wheel > /dev/null
    
    # Install required Python packages
    log "Installing Python dependencies..."
    pip install \
        fastapi \
        uvicorn \
        pydantic \
        sqlalchemy \
        httpx \
        aiohttp \
        cryptography \
        python-dotenv \
        prometheus-client \
        psutil \
        zeroconf \
        textual \
        > /dev/null
    
    # Set venv ownership
    chown -R map2:map2 "$VENV_DIR"
    
    success "Python environment setup complete"
}

# ============================================================================
# Certificate Authority Setup
# ============================================================================

setup_certificate_authority() {
    log "Setting up Certificate Authority..."
    
    SSL_DIR="$CONFIG_DIR/ssl"
    CA_KEY="$SSL_DIR/ca-key.pem"
    CA_CERT="$SSL_DIR/ca-cert.pem"
    
    # Generate CA private key
    if [ ! -f "$CA_KEY" ]; then
        log "Generating CA private key..."
        openssl genrsa -out "$CA_KEY" 4096 > /dev/null 2>&1
        chmod 600 "$CA_KEY"
        
        # Generate CA certificate
        log "Generating CA certificate..."
        openssl req -new -x509 -days 3650 -key "$CA_KEY" -out "$CA_CERT" \
            -subj "/CN=map2-cluster-ca/O=MAP2/C=US" > /dev/null 2>&1
        
        chmod 644 "$CA_CERT"
        
        success "CA certificate generated"
    else
        log "CA certificate already exists, skipping generation"
    fi
    
    # Generate node certificate
    log "Generating node certificate..."
    NODE_KEY="$SSL_DIR/node-key.pem"
    NODE_CSR="$SSL_DIR/node.csr"
    NODE_CERT="$SSL_DIR/node-cert.pem"
    
    if [ ! -f "$NODE_CERT" ]; then
        openssl genrsa -out "$NODE_KEY" 4096 > /dev/null 2>&1
        
        openssl req -new -key "$NODE_KEY" -out "$NODE_CSR" \
            -subj "/CN=$(hostname)/O=MAP2/C=US" > /dev/null 2>&1
        
        openssl x509 -req -days 365 -in "$NODE_CSR" \
            -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
            -out "$NODE_CERT" > /dev/null 2>&1
        
        rm "$NODE_CSR"
        chmod 644 "$NODE_CERT"
        
        success "Node certificate generated"
    else
        log "Node certificate already exists"
    fi
    
    # Set permissions
    chown map2:map2 "$SSL_DIR"/*
    chmod 700 "$SSL_DIR"
}

# ============================================================================
# Database Initialization
# ============================================================================

setup_database() {
    log "Initializing database..."
    
    DB_FILE="$DATA_DIR/database/cluster.db"
    
    if [ -f "$DB_FILE" ]; then
        log "Database already exists, skipping initialization"
        return
    fi
    
    # Create database with schema
    sqlite3 "$DB_FILE" << 'EOF'
CREATE TABLE IF NOT EXISTS cluster_nodes (
    id TEXT PRIMARY KEY,
    hostname TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    mac_address TEXT NOT NULL,
    role TEXT NOT NULL,
    deployment_mode TEXT NOT NULL,
    status TEXT DEFAULT 'offline',
    health_score INTEGER DEFAULT 0,
    cpu_cores INTEGER,
    memory_gb INTEGER,
    audio_devices TEXT,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cluster_registry (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cluster_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    source_node_id TEXT,
    message TEXT,
    metadata TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS backup_manifests (
    backup_id TEXT PRIMARY KEY,
    backup_type TEXT NOT NULL,
    size_mb REAL,
    files_included TEXT,
    restoration_tested BOOLEAN DEFAULT 0,
    nodes_included TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS network_topology (
    source_node TEXT NOT NULL,
    target_node TEXT NOT NULL,
    latency_ms REAL,
    packet_loss_percent REAL,
    status TEXT,
    last_measured TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (source_node, target_node)
);

CREATE TABLE IF NOT EXISTS configuration_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nodes_status ON cluster_nodes(status);
CREATE INDEX IF NOT EXISTS idx_nodes_health ON cluster_nodes(health_score);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON cluster_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_severity ON cluster_events(severity);
CREATE INDEX IF NOT EXISTS idx_backup_expires ON backup_manifests(expires_at);
EOF
    
    # Set permissions
    chown map2:map2 "$DB_FILE"
    chmod 600 "$DB_FILE"
    
    success "Database initialized"
}

# ============================================================================
# Configuration Files
# ============================================================================

create_config_files() {
    log "Creating configuration files..."
    local deployment_mode
    deployment_mode="$(deployment_mode_for_role)"
    
    # Create main configuration
    cat > "$CONFIG_DIR/cluster.conf" << EOF
# MAP2 Audio Cluster Manager Configuration
# Generated by install script on $(date)

[cluster]
name = $CLUSTER_NAME
node_role = $NODE_ROLE
node_id = $(uuidgen)

[paths]
data_dir = $DATA_DIR
config_dir = $CONFIG_DIR
log_dir = $LOG_DIR

[server]
host = 0.0.0.0
port = 8080
workers = 4

[database]
path = $DATA_DIR/database/cluster.db
backup_path = $DATA_DIR/backups

[ssl]
ca_cert = $CONFIG_DIR/ssl/ca-cert.pem
cert = $CONFIG_DIR/ssl/node-cert.pem
key = $CONFIG_DIR/ssl/node-key.pem

[cluster_management]
health_check_interval = 30
metrics_aggregation_interval = 60
failover_timeout = 30
state_replication_interval = 300
backup_retention_days = 30

[logging]
level = INFO
format = %(asctime)s - %(name)s - %(levelname)s - %(message)s
EOF
    
    # Create .env file for application
    cat > "$CONFIG_DIR/.env" << EOF
# Environment variables for MAP2 Cluster Manager
# Generated by install script on $(date)

APP_NAME=map2-cluster-manager
APP_ENV=production
DEBUG=false

CLUSTER_NAME=$CLUSTER_NAME
NODE_ROLE=$NODE_ROLE
MAP2_DEPLOYMENT_MODE=$deployment_mode

DATABASE_URL=sqlite:///$DATA_DIR/database/cluster.db
LOG_DIR=$LOG_DIR

CONFIG_DIR=$CONFIG_DIR
DATA_DIR=$DATA_DIR
PROMETHEUS_CONFIG_DIR=$CONFIG_DIR/prometheus
PROMETHEUS_TARGETS_DIR=$CONFIG_DIR/prometheus/targets
GRAFANA_CONFIG_DIR=$CONFIG_DIR/grafana

# Security
SSL_CERT=$CONFIG_DIR/ssl/node-cert.pem
SSL_KEY=$CONFIG_DIR/ssl/node-key.pem
SSL_CA_CERT=$CONFIG_DIR/ssl/ca-cert.pem

# API
API_HOST=0.0.0.0
API_PORT=8080
API_WORKERS=4
EOF
    
    chmod 600 "$CONFIG_DIR/.env"
    chown map2:map2 "$CONFIG_DIR"/{cluster.conf,.env}
    
    success "Configuration files created"
}

# ============================================================================
# Observability Configuration
# ============================================================================

create_observability_files() {
    if ! is_monitoring_host_role; then
        log "Skipping Prometheus/Grafana config staging for non-management node role: $NODE_ROLE"
        return
    fi

    log "Staging Prometheus and Grafana configuration..."

    install -m 644 "$REPO_ROOT/config/prometheus.yml" "$CONFIG_DIR/prometheus/prometheus.yml"
    install -m 644 "$REPO_ROOT/config/prometheus-targets/audio-nodes.json" "$CONFIG_DIR/prometheus/targets/audio-nodes.json"

    install -m 644 "$REPO_ROOT/config/grafana/grafana.ini" "$CONFIG_DIR/grafana/grafana.ini"
    install -m 644 "$REPO_ROOT/config/grafana/provisioning/datasources/prometheus.yml" \
        "$CONFIG_DIR/grafana/provisioning/datasources/prometheus.yml"
    install -m 644 "$REPO_ROOT/config/grafana/provisioning/dashboards/map2.yml" \
        "$CONFIG_DIR/grafana/provisioning/dashboards/map2.yml"

    local dashboard
    for dashboard in "$REPO_ROOT"/config/grafana-dashboards/*.json; do
        install -m 644 "$dashboard" "$CONFIG_DIR/grafana/dashboards/"
    done

    if [ ! -f "$CONFIG_DIR/grafana/grafana.env" ]; then
        local grafana_password
        grafana_password="$(openssl rand -hex 16)"
        cat > "$CONFIG_DIR/grafana/grafana.env" << EOF
GF_SECURITY_ADMIN_USER=map2-admin
GF_SECURITY_ADMIN_PASSWORD=${grafana_password}
EOF
        chmod 600 "$CONFIG_DIR/grafana/grafana.env"
        chown map2:map2 "$CONFIG_DIR/grafana/grafana.env"
        success "Generated Grafana admin credentials at $CONFIG_DIR/grafana/grafana.env"
    else
        log "Grafana credential file already exists, preserving it"
    fi

    chown -R map2:map2 "$CONFIG_DIR/prometheus" "$CONFIG_DIR/grafana" "$DATA_DIR/prometheus" "$DATA_DIR/grafana" "$LOG_DIR/grafana"

    success "Observability configuration staged"
}

# ============================================================================
# Systemd Unit Installation
# ============================================================================

install_systemd_units() {
    if [ "$INSTALL_SYSTEMD" = false ]; then
        log "Skipping systemd unit installation (--skip-systemd)"
        return
    fi
    
    log "Installing systemd units..."
    
    # Main service unit
    cat > /etc/systemd/system/map2-cluster-manager.service << EOF
[Unit]
Description=MAP2 Audio Cluster Manager
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
User=map2
Group=map2
WorkingDirectory=$APP_DIR
Environment="PATH=$VENV_DIR/bin"
Environment="PYTHONUNBUFFERED=1"
EnvironmentFile=$CONFIG_DIR/.env

ExecStart=$VENV_DIR/bin/python3 -m app.main
ExecReload=/bin/kill -HUP \$MAINPID

Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=map2-cluster

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=$DATA_DIR $LOG_DIR $CONFIG_DIR

[Install]
WantedBy=multi-user.target
EOF
    
    # Health sync timer
    cat > /etc/systemd/system/map2-health-sync.service << EOF
[Unit]
Description=MAP2 Health Metrics Sync
After=map2-cluster-manager.service

[Service]
Type=oneshot
User=map2
Group=map2
Environment="PATH=$VENV_DIR/bin"
EnvironmentFile=$CONFIG_DIR/.env
ExecStart=$VENV_DIR/bin/python3 -m app.services.cluster.health_aggregator
EOF
    
    cat > /etc/systemd/system/map2-health-sync.timer << EOF
[Unit]
Description=MAP2 Health Metrics Sync Timer
Requires=map2-health-sync.service

[Timer]
OnBootSec=30
OnUnitActiveSec=30
Persistent=true

[Install]
WantedBy=timers.target
EOF
    
    # Fleet update timer
    cat > /etc/systemd/system/map2-fleet-update.timer << EOF
[Unit]
Description=MAP2 Fleet Update Timer
Requires=map2-fleet-update.service

[Timer]
OnCalendar=Sun 03:00
Persistent=true

[Install]
WantedBy=timers.target
EOF
    
    cat > /etc/systemd/system/map2-fleet-update.service << EOF
[Unit]
Description=MAP2 Fleet Update Service
After=map2-cluster-manager.service

[Service]
Type=oneshot
User=map2
Group=map2
Environment="PATH=$VENV_DIR/bin"
EnvironmentFile=$CONFIG_DIR/.env
ExecStart=$VENV_DIR/bin/python3 -m app.services.cluster.update_orchestrator
EOF
    
    # Failover monitor
    cat > /etc/systemd/system/map2-failover-monitor.service << EOF
[Unit]
Description=MAP2 Failover Monitor
After=map2-cluster-manager.service

[Service]
Type=simple
User=map2
Group=map2
Environment="PATH=$VENV_DIR/bin"
EnvironmentFile=$CONFIG_DIR/.env
ExecStart=$VENV_DIR/bin/python3 -m app.services.cluster.failover_monitor

Restart=always
RestartSec=5
EOF

    if is_monitoring_host_role; then
        install -m 644 "$REPO_ROOT/packaging/systemd/map2-prometheus.service" /etc/systemd/system/map2-prometheus.service
        install -m 644 "$REPO_ROOT/packaging/systemd/map2-grafana.service" /etc/systemd/system/map2-grafana.service
    fi
    
    # Reload systemd
    systemctl daemon-reload
    
    success "Systemd units installed"
}

# ============================================================================
# Firewall Configuration
# ============================================================================

configure_firewall() {
    if [ "$INSTALL_FIREWALL" = false ]; then
        log "Skipping firewall configuration (--skip-firewall)"
        return
    fi
    
    log "Configuring firewall..."
    
    if systemctl is-active --quiet firewalld; then
        # Allow cluster management ports
        firewall-cmd --permanent --add-port=8080/tcp > /dev/null
        firewall-cmd --permanent --add-port=5353/udp > /dev/null  # mDNS
        firewall-cmd --permanent --add-service=ssh > /dev/null

        if is_monitoring_host_role; then
            firewall-cmd --permanent --add-port=3001/tcp > /dev/null
            firewall-cmd --permanent --add-port=9090/tcp > /dev/null
        fi
        
        # Allow zeroconf/mDNS
        firewall-cmd --permanent --add-service=mdns > /dev/null
        
        # Reload firewall
        firewall-cmd --reload > /dev/null
        
        success "Firewall configured"
    else
        warning "Firewalld not active, skipping firewall configuration"
    fi
}

# ============================================================================
# SELinux Configuration
# ============================================================================

configure_selinux() {
    log "Configuring SELinux..."
    
    if command -v getenforce &> /dev/null; then
        SELINUX_STATUS=$(getenforce)
        
        if [ "$SELINUX_STATUS" != "Disabled" ]; then
            warning "SELinux is in $SELINUX_STATUS mode"
            log "Creating SELinux policy for MAP2..."
            
            # Create custom policy module (simplified)
            cat > /tmp/map2_cluster.te << 'EOF'
policy_module(map2_cluster, 1.0.0)

type map2_t;
type map2_exec_t;
type map2_var_lib_t;
type map2_etc_t;

init_daemon_domain(map2_t, map2_exec_t)

allow map2_t map2_var_lib_t:dir { read write open getattr setattr };
allow map2_t map2_var_lib_t:file { read write open getattr setattr create };
allow map2_t map2_etc_t:dir { read open getattr };
allow map2_t map2_etc_t:file { read open getattr };

corenet_all_recvfrom_netlabel(map2_t)
corenet_tcp_sendrecv_generic_if(map2_t)
corenet_tcp_sendrecv_generic_node(map2_t)
corenet_tcp_bind_generic_node(map2_t)
EOF
            
            log "Note: Manual SELinux policy setup may be required"
        fi
    fi
}

# ============================================================================
# Health Checks
# ============================================================================

run_health_checks() {
    log "Running health checks..."
    
    CHECKS_PASSED=0
    CHECKS_FAILED=0
    
    # Check directories
    log "Checking directories..."
    for dir in "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR"; do
        if [ -d "$dir" ]; then
            success "  ✓ $dir exists"
            ((CHECKS_PASSED++))
        else
            error "  ✗ $dir missing"
            ((CHECKS_FAILED++))
        fi
    done
    
    # Check database
    log "Checking database..."
    if [ -f "$DATA_DIR/database/cluster.db" ]; then
        success "  ✓ Database file exists"
        ((CHECKS_PASSED++))
    else
        error "  ✗ Database file missing"
        ((CHECKS_FAILED++))
    fi
    
    # Check certificates
    log "Checking SSL certificates..."
    if [ -f "$CONFIG_DIR/ssl/ca-cert.pem" ] && [ -f "$CONFIG_DIR/ssl/node-cert.pem" ]; then
        success "  ✓ SSL certificates exist"
        ((CHECKS_PASSED++))
    else
        error "  ✗ SSL certificates missing"
        ((CHECKS_FAILED++))
    fi
    
    # Check Python environment
    log "Checking Python environment..."
    if [ -f "$VENV_DIR/bin/python3" ]; then
        success "  ✓ Python virtual environment configured"
        ((CHECKS_PASSED++))
    else
        error "  ✗ Python virtual environment missing"
        ((CHECKS_FAILED++))
    fi
    
    # Check systemd units
    if [ "$INSTALL_SYSTEMD" = true ]; then
        log "Checking systemd units..."
        if [ -f /etc/systemd/system/map2-cluster-manager.service ]; then
            success "  ✓ Systemd units installed"
            ((CHECKS_PASSED++))
        else
            error "  ✗ Systemd units missing"
            ((CHECKS_FAILED++))
        fi
    fi

    if is_monitoring_host_role; then
        log "Checking observability assets..."
        if [ -f "$CONFIG_DIR/prometheus/prometheus.yml" ] && [ -f "$CONFIG_DIR/grafana/grafana.ini" ]; then
            success "  ✓ Prometheus/Grafana config staged"
            ((CHECKS_PASSED++))
        else
            error "  ✗ Prometheus/Grafana config missing"
            ((CHECKS_FAILED++))
        fi
    fi
    
    echo ""
    log "Health check results: ${GREEN}${CHECKS_PASSED} passed${NC}, ${RED}${CHECKS_FAILED} failed${NC}"
    
    if [ "$CHECKS_FAILED" -gt 0 ]; then
        warning "Some health checks failed. Please review the output above."
        return 1
    fi
    
    return 0
}

# ============================================================================
# Post-Installation Instructions
# ============================================================================

print_post_install_info() {
    cat << EOF

${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}
${GREEN}║         MAP2 CLUSTER MANAGER INSTALLATION COMPLETE             ║${NC}
${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}

${BLUE}Installation Summary:${NC}
  Cluster Name:     $CLUSTER_NAME
  Node Role:        $NODE_ROLE
  Configuration:    $CONFIG_DIR
  Data Directory:   $DATA_DIR
  Log Directory:    $LOG_DIR
  Virtual Env:      $VENV_DIR

${BLUE}Next Steps:${NC}

1. ${YELLOW}Review Configuration${NC}
   sudo nano $CONFIG_DIR/cluster.conf

2. ${YELLOW}Start the Cluster Manager${NC}
   sudo systemctl start map2-cluster-manager
   sudo systemctl status map2-cluster-manager

3. ${YELLOW}Enable Automatic Start${NC}
   sudo systemctl enable map2-cluster-manager
   sudo systemctl enable map2-health-sync.timer
   sudo systemctl enable map2-failover-monitor
   sudo systemctl enable map2-fleet-update.timer

EOF

    if is_monitoring_host_role; then
        cat << EOF
   sudo systemctl enable map2-prometheus
   sudo systemctl enable map2-grafana

4. ${YELLOW}Start the Observability Stack${NC}
   sudo systemctl start map2-prometheus
   sudo systemctl start map2-grafana

5. ${YELLOW}Review Grafana Credentials${NC}
   sudo cat $CONFIG_DIR/grafana/grafana.env

6. ${YELLOW}Manage Remote Scrape Targets${NC}
   sudo nano $CONFIG_DIR/prometheus/targets/audio-nodes.json

EOF
    fi

    cat << EOF

7. ${YELLOW}View Logs${NC}
   sudo journalctl -u map2-cluster-manager -f

8. ${YELLOW}Test the API${NC}
   curl -k https://localhost:8080/api/cluster/status

9. ${YELLOW}Deploy Audio Nodes${NC}
   Run: ./deploy_cluster_node.sh on each audio node

${BLUE}Configuration Files:${NC}
  - $CONFIG_DIR/cluster.conf
  - $CONFIG_DIR/.env
  - $CONFIG_DIR/ssl/

${BLUE}Database:${NC}
  - $DATA_DIR/database/cluster.db

${BLUE}Support:${NC}
  Documentation: /opt/map2/docs/
  Logs: $LOG_DIR/

${GREEN}Installation finished successfully!${NC}

EOF
}

# ============================================================================
# Main Installation Flow
# ============================================================================

main() {
    log "Starting MAP2 Audio Cluster Manager Installation"
    log "Target Node Role: $NODE_ROLE"
    log "Cluster Name: $CLUSTER_NAME"
    echo ""
    
    main_preflight_checks
    install_system_dependencies
    setup_directories_and_user
    setup_python_environment
    setup_certificate_authority
    setup_database
    create_config_files
    create_observability_files
    install_systemd_units
    configure_firewall
    configure_selinux
    
    echo ""
    if run_health_checks; then
        success "All checks passed!"
    else
        warning "Some checks failed, but installation may still be usable"
    fi
    
    echo ""
    print_post_install_info
}

# Run main installation
main "$@"

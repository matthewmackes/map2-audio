#!/bin/bash
#
# MAP2 Audio Platform - Unified Boot Manager
# Comprehensive boot-time initialization and service management
#
# This script ensures all components start correctly at boot time:
# - Validates system configuration
# - Creates required directories and files
# - Checks dependencies and prerequisites
# - Starts services in the correct order
# - Provides detailed logging and error reporting
#

set -e

# Configuration
MAP2_DIR="/home/mm/map2-audio"
DATA_DIR="${MAP2_DIR}/data"
LOGS_DIR="${MAP2_DIR}/logs"
WEB_DIR="${MAP2_DIR}/web"
USER_CONFIG_DIR="/home/mm/.map2"
USER_DATA_DIR="/home/mm/.local/share/map2"
LOG_FILE="${LOGS_DIR}/boot-manager.log"
PID_FILE="${LOGS_DIR}/map2-boot-manager.pid"

# Service ports
BACKEND_PORT=8080
WEB_PORT=3000
WEB_DEV_PORT=3001

# Timeouts (in seconds)
BACKEND_TIMEOUT=30
WEB_TIMEOUT=30
SERVICE_START_DELAY=2

# ANSI Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ============================================
# Logging Functions
# ============================================

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}✗${NC} $1" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}→${NC} $1" | tee -a "$LOG_FILE"
}

log_header() {
    echo "" | tee -a "$LOG_FILE"
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" | tee -a "$LOG_FILE"
    echo -e "${BOLD}${CYAN}  $1${NC}" | tee -a "$LOG_FILE"
    echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}" | tee -a "$LOG_FILE"
}

# ============================================
# Utility Functions
# ============================================

# Check if a port is in use
check_port() {
    local port=$1
    if ss -tuln | grep -q ":${port} "; then
        return 0  # Port in use
    else
        return 1  # Port available
    fi
}

# Wait for a port to become available
wait_for_port() {
    local port=$1
    local timeout=$2
    local elapsed=0

    log_info "Waiting for port ${port} to become available (timeout: ${timeout}s)..."

    while [ $elapsed -lt $timeout ]; do
        if check_port $port; then
            log_success "Port ${port} is now available"
            return 0
        fi
        sleep 1
        elapsed=$((elapsed + 1))
    done

    log_error "Timeout waiting for port ${port}"
    return 1
}

# Check if a service is running
check_service() {
    local service_name=$1
    if systemctl is-active --quiet "$service_name"; then
        return 0  # Service running
    else
        return 1  # Service not running
    fi
}

# ============================================
# Initialization Functions
# ============================================

initialize_logging() {
    mkdir -p "$LOGS_DIR"

    # Rotate old log if it's too large (> 10MB)
    if [ -f "$LOG_FILE" ]; then
        local size=$(stat -c%s "$LOG_FILE" 2>/dev/null || echo "0")
        if [ "$size" -gt 10485760 ]; then
            mv "$LOG_FILE" "${LOG_FILE}.old"
            log_info "Rotated old log file"
        fi
    fi

    log "========================================="
    log "MAP2 Audio Platform - Boot Manager"
    log "Version: 2.0.0"
    log "Date: $(date '+%Y-%m-%d %H:%M:%S')"
    log "========================================="
}

create_directories() {
    log_header "Creating Required Directories"

    local directories=(
        "$DATA_DIR"
        "$LOGS_DIR"
        "$USER_CONFIG_DIR"
        "$USER_DATA_DIR"
        "$USER_DATA_DIR/nam"
        "$USER_DATA_DIR/ir"
        "$USER_DATA_DIR/ir/cabinets"
        "$USER_DATA_DIR/ir/reverbs"
        "$USER_DATA_DIR/ir/user"
        "$USER_CONFIG_DIR/packages"
        "$USER_CONFIG_DIR/sessions"
    )

    for dir in "${directories[@]}"; do
        if [ -d "$dir" ]; then
            log_success "Directory exists: $dir"
        else
            mkdir -p "$dir" || { log_error "Failed to create $dir"; exit 1; }
            log_success "Created directory: $dir"
        fi
    done

    # Set correct ownership
    chown -R mm:mm "$DATA_DIR" "$LOGS_DIR" "$USER_CONFIG_DIR" "$USER_DATA_DIR" 2>/dev/null || \
        log_warning "Could not set ownership (may not have permissions)"
}

check_prerequisites() {
    log_header "Checking Prerequisites"

    # Check Python
    if command -v python3 &> /dev/null; then
        local python_version=$(python3 --version 2>&1)
        log_success "Python: $python_version"
    else
        log_error "Python3 not found"
        exit 1
    fi

    # Check Node.js
    if command -v node &> /dev/null; then
        local node_version=$(node --version 2>&1)
        log_success "Node.js: $node_version"
    else
        log_warning "Node.js not found - web dashboard may not work"
    fi

    # Check npm
    if command -v npm &> /dev/null; then
        local npm_version=$(npm --version 2>&1)
        log_success "npm: v$npm_version"
    else
        log_warning "npm not found - web dashboard may not work"
    fi

    # Check critical Python modules
    log_info "Checking Python modules..."
    local required_modules="fastapi uvicorn sqlalchemy aiosqlite"
    local missing_modules=""

    cd "$MAP2_DIR"
    for module in $required_modules; do
        if python3 -c "import ${module}" 2>/dev/null; then
            log_success "Module: ${module}"
        else
            log_error "Missing: ${module}"
            missing_modules="${missing_modules} ${module}"
        fi
    done

    if [ -n "$missing_modules" ]; then
        log_error "Missing required Python modules:${missing_modules}"
        log_info "Install with: pip3 install${missing_modules}"
        exit 1
    fi
}

check_system_resources() {
    log_header "Checking System Resources"

    # Check CPU governor
    if [ -f /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor ]; then
        local governor=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || echo "unknown")
        if [ "$governor" = "performance" ]; then
            log_success "CPU Governor: performance"
        else
            log_warning "CPU Governor: $governor (recommended: performance)"
        fi
    fi

    # Check audio devices
    if command -v aplay &> /dev/null; then
        local audio_count=$(aplay -l 2>/dev/null | grep -c "^card" || echo "0")
        if [ "$audio_count" -gt 0 ]; then
            log_success "Audio Devices: $audio_count detected"
        else
            log_warning "No audio devices detected"
        fi
    fi

    # Check MIDI devices
    if command -v aconnect &> /dev/null; then
        local midi_count=$(aconnect -l 2>/dev/null | grep -c "client" || echo "0")
        if [ "$midi_count" -gt 0 ]; then
            log_success "MIDI Devices: $midi_count detected"
        else
            log_warning "No MIDI devices detected"
        fi
    fi

    # Check memory
    local mem_total=$(free -h | awk '/^Mem:/ {print $2}')
    local mem_available=$(free -h | awk '/^Mem:/ {print $7}')
    log_info "Memory: $mem_available available of $mem_total total"

    # Check disk space
    local disk_available=$(df -h "$MAP2_DIR" | awk 'NR==2 {print $4}')
    log_info "Disk Space: $disk_available available in $MAP2_DIR"
}

disable_selinux() {
    log_header "Configuring SELinux"

    # Check if SELinux is installed
    if ! command -v getenforce &> /dev/null; then
        log_success "SELinux not installed - no action needed"
        return 0
    fi

    # Get current SELinux status
    local selinux_status=$(getenforce 2>/dev/null || echo "error")

    case "$selinux_status" in
        "Disabled")
            log_success "SELinux already disabled - persistent setting confirmed"
            return 0
            ;;
        "Permissive")
            log_warning "SELinux in permissive mode - converting to disabled"
            ;;
        "Enforcing")
            log_warning "SELinux enforcing - disabling now"
            # Temporarily set to permissive for immediate effect
            if [ -f /etc/selinux/config ]; then
                setenforce 0 2>/dev/null || log_warning "Cannot set permissive mode (may need root)"
            fi
            ;;
        *)
            log_warning "SELinux status unknown: $selinux_status"
            return 1
            ;;
    esac

    # Permanently disable SELinux by updating config file
    if [ -f /etc/selinux/config ]; then
        log_info "Updating /etc/selinux/config for permanent disabling..."
        
        # Backup original config
        if [ ! -f /etc/selinux/config.backup ]; then
            cp /etc/selinux/config /etc/selinux/config.backup 2>/dev/null || \
                log_warning "Could not backup SELinux config (may need root)"
        fi
        
        # Update SELINUX setting to disabled
        if sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config 2>/dev/null; then
            log_success "Updated /etc/selinux/config: SELINUX=disabled"
            
            # Verify the change
            if grep -q "^SELINUX=disabled" /etc/selinux/config; then
                log_success "Verified: SELINUX=disabled in config file"
            else
                log_error "Failed to verify SELINUX=disabled in config"
                return 1
            fi
        else
            log_warning "Could not update /etc/selinux/config (may need root privileges)"
            log_info "Manual fix required: Edit /etc/selinux/config and set SELINUX=disabled"
            return 1
        fi
    else
        log_warning "/etc/selinux/config not found - SELinux may not be installed"
    fi

    # Set immediate mode to permissive if enforcing
    if [ "$selinux_status" = "Enforcing" ]; then
        if setenforce 0 2>/dev/null; then
            log_success "Immediately set SELinux to permissive mode"
        else
            log_warning "Could not set permissive mode (requires root - will take effect on reboot)"
        fi
    fi

    return 0
}

initialize_database() {
    log_header "Initializing Database"

    if [ -f "$DATA_DIR/map2.db" ]; then
        local db_size=$(stat -c%s "$DATA_DIR/map2.db" 2>/dev/null || echo "0")
        log_success "Database exists: map2.db (${db_size} bytes)"
    else
        log_warning "Database not found - will be created by backend"
    fi
}

check_web_dependencies() {
    log_header "Checking Web Dependencies"

    if [ -d "$WEB_DIR/node_modules" ]; then
        log_success "Node modules installed"
    else
        log_warning "Node modules not installed"
        if [ -f "$WEB_DIR/package.json" ]; then
            log_info "Run 'npm install' in $WEB_DIR"
        else
            log_error "package.json not found in $WEB_DIR"
        fi
    fi

    # Check web config
    local web_config="${WEB_DIR}/public/var/config.json"
    if [ -f "$web_config" ]; then
        log_success "Web config found: config.json"
    else
        log_warning "Web config not found: $web_config"
    fi
}

check_port_conflicts() {
    log_header "Checking Port Availability"

    local ports=("$BACKEND_PORT:Backend API" "$WEB_PORT:Web Dashboard" "$WEB_DEV_PORT:Web Dev Server")

    for port_info in "${ports[@]}"; do
        local port="${port_info%%:*}"
        local service="${port_info##*:}"

        if check_port "$port"; then
            log_warning "Port $port already in use ($service)"
        else
            log_success "Port $port available ($service)"
        fi
    done
}

verify_systemd_services() {
    log_header "Verifying Systemd Services"

    local services=(
        "cpu-performance.service"
        "irq-affinity.service"
        "map2-rt-verify.service"
        "map2-system-check.service"
        "map2-backend.service"
        "map2-web.service"
        "map2-lcd.service"
    )

    for service in "${services[@]}"; do
        if systemctl list-unit-files | grep -q "^${service}"; then
            if check_service "$service"; then
                log_success "Service running: $service"
            else
                local enabled=$(systemctl is-enabled "$service" 2>/dev/null || echo "disabled")
                log_info "Service $enabled: $service"
            fi
        else
            log_warning "Service not found: $service"
        fi
    done
}

# ============================================
# Readiness Validation
# ============================================

wait_for_backend_ready() {
    local timeout=${1:-60}
    local elapsed=0
    local interval=2

    log_header "Waiting for System Ready State"
    log_info "Checking backend readiness (timeout: ${timeout}s)..."

    while [ $elapsed -lt $timeout ]; do
        # First check if backend is responding at all
        if ! curl -s --connect-timeout 2 "http://localhost:${BACKEND_PORT}/api/live" > /dev/null 2>&1; then
            log_info "Backend not responding yet... (${elapsed}s)"
            sleep $interval
            elapsed=$((elapsed + interval))
            continue
        fi

        # Check ready endpoint
        local response=$(curl -s --connect-timeout 5 "http://localhost:${BACKEND_PORT}/api/ready" 2>/dev/null)
        local http_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${BACKEND_PORT}/api/ready" 2>/dev/null)

        if [ "$http_code" = "200" ]; then
            log_success "System is READY!"
            log_info "Response: $response"
            return 0
        elif [ "$http_code" = "503" ]; then
            local issues=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(', '.join(d.get('issues', [])))" 2>/dev/null || echo "unknown")
            log_warning "System not ready: $issues (${elapsed}s)"
        else
            log_warning "Unexpected response code: $http_code (${elapsed}s)"
        fi

        sleep $interval
        elapsed=$((elapsed + interval))
    done

    log_error "Timeout waiting for system ready state after ${timeout}s"
    return 1
}

check_startup_status() {
    log_header "Startup Status Check"

    # Check if backend is running
    if curl -s --connect-timeout 2 "http://localhost:${BACKEND_PORT}/api/startup" > /dev/null 2>&1; then
        local startup_response=$(curl -s "http://localhost:${BACKEND_PORT}/api/startup" 2>/dev/null)
        local started=$(echo "$startup_response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('started', False))" 2>/dev/null || echo "false")

        if [ "$started" = "True" ]; then
            log_success "Backend orchestrator has started"
            return 0
        else
            log_warning "Backend orchestrator not yet started"
            return 1
        fi
    else
        log_warning "Backend not responding on port ${BACKEND_PORT}"
        return 1
    fi
}

# ============================================
# Main Boot Sequence
# ============================================

main() {
    # Check if already running
    if [ -f "$PID_FILE" ]; then
        local old_pid=$(cat "$PID_FILE")
        if ps -p "$old_pid" > /dev/null 2>&1; then
            log_warning "Boot manager already running (PID: $old_pid)"
            exit 0
        else
            rm -f "$PID_FILE"
        fi
    fi

    # Write PID file
    echo $$ > "$PID_FILE"

    # Initialize
    initialize_logging

    # Run all checks and configurations
    disable_selinux
    create_directories
    check_prerequisites
    check_system_resources
    initialize_database
    check_web_dependencies
    check_port_conflicts
    verify_systemd_services

    # Final summary
    log_header "Boot Manager Summary"
    log_success "All pre-flight checks completed"
    log_info "Backend API will start on port $BACKEND_PORT"
    log_info "Web Dashboard will start on port $WEB_PORT"

    # If --wait-ready flag is passed, wait for system to be ready
    if [[ "$1" == "--wait-ready" ]]; then
        log_info "Waiting for system to reach ready state..."
        if wait_for_backend_ready 90; then
            log_success "System boot completed successfully - READY"
        else
            log_error "System failed to reach ready state"
            rm -f "$PID_FILE"
            exit 1
        fi
    else
        log_info "System is ready for service startup"
        log_info "Use --wait-ready flag to wait for full system readiness"
    fi

    log "========================================="

    # Cleanup
    rm -f "$PID_FILE"

    exit 0
}

# ============================================
# Error Handling
# ============================================

trap 'log_error "Boot manager interrupted"; rm -f "$PID_FILE"; exit 1' INT TERM

# Run main function
main "$@"

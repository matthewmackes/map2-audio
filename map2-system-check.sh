#!/bin/bash
#
# MAP2 Audio Platform - System Check and Initialization
# This script performs critical system checks before backend startup
#

set -e

# Configuration
MAP2_DIR="/home/mm/map2-audio"
DATA_DIR="${MAP2_DIR}/data"
LOGS_DIR="${MAP2_DIR}/logs"
USER_CONFIG_DIR="/home/mm/.map2"
LOG_FILE="${LOGS_DIR}/system-check.log"

# ANSI Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
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

# Initialize logging
mkdir -p "$LOGS_DIR"
log "========================================="
log "MAP2 Audio Platform - System Check"
log "========================================="

# 1. Check working directory
log_info "Checking working directory..."
if [ -d "$MAP2_DIR" ]; then
    log_success "MAP2 directory exists: $MAP2_DIR"
else
    log_error "MAP2 directory not found: $MAP2_DIR"
    exit 1
fi

# 2. Create required directories
log_info "Creating required directories..."
mkdir -p "$DATA_DIR" || { log_error "Failed to create $DATA_DIR"; exit 1; }
mkdir -p "$LOGS_DIR" || { log_error "Failed to create $LOGS_DIR"; exit 1; }
mkdir -p "$USER_CONFIG_DIR" || { log_error "Failed to create $USER_CONFIG_DIR"; exit 1; }
mkdir -p "$USER_CONFIG_DIR/ir" || { log_error "Failed to create IR directory"; exit 1; }
mkdir -p "$USER_CONFIG_DIR/nam" || { log_error "Failed to create NAM directory"; exit 1; }
mkdir -p "$USER_CONFIG_DIR/packages" || { log_error "Failed to create packages directory"; exit 1; }
mkdir -p "$USER_CONFIG_DIR/sessions" || { log_error "Failed to create sessions directory"; exit 1; }
log_success "All directories created"

# 3. Set correct permissions
log_info "Setting permissions..."
chown -R mm:mm "$DATA_DIR" 2>/dev/null || log_warning "Could not set ownership on $DATA_DIR"
chown -R mm:mm "$LOGS_DIR" 2>/dev/null || log_warning "Could not set ownership on $LOGS_DIR"
chown -R mm:mm "$USER_CONFIG_DIR" 2>/dev/null || log_warning "Could not set ownership on $USER_CONFIG_DIR"
chmod 755 "$DATA_DIR" "$LOGS_DIR" || log_warning "Could not set permissions"
log_success "Permissions set"

# 4. Check Python environment
log_info "Checking Python environment..."
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version 2>&1)
    log_success "Python found: $PYTHON_VERSION"
else
    log_error "Python3 not found in PATH"
    exit 1
fi

# 5. Check required Python modules
log_info "Checking Python modules..."
cd "$MAP2_DIR"
REQUIRED_MODULES="fastapi uvicorn sqlalchemy aiosqlite"
for module in $REQUIRED_MODULES; do
    if python3 -c "import ${module}" 2>/dev/null; then
        log_success "Module available: ${module}"
    else
        log_error "Missing Python module: ${module}"
        log_info "Install with: pip3 install ${module}"
        exit 1
    fi
done

# 6. Check database file
log_info "Checking database..."
if [ -f "$DATA_DIR/map2.db" ]; then
    DB_SIZE=$(stat -c%s "$DATA_DIR/map2.db" 2>/dev/null || echo "0")
    log_success "Database exists: $DATA_DIR/map2.db (${DB_SIZE} bytes)"
else
    log_warning "Database not found - will be created on first run"
fi

# 7. Check network requirements
log_info "Checking network..."
if ss -tuln | grep -q ":8080 "; then
    log_warning "Port 8080 already in use - backend may fail to start"
else
    log_success "Port 8080 available"
fi

# 8. Check audio system
log_info "Checking audio system..."
if command -v aplay &> /dev/null; then
    AUDIO_DEVICES=$(aplay -l 2>/dev/null | grep -c "^card" || echo "0")
    if [ "$AUDIO_DEVICES" -gt 0 ]; then
        log_success "Audio devices detected: $AUDIO_DEVICES"
    else
        log_warning "No audio devices detected"
    fi
else
    log_warning "aplay not found - cannot verify audio devices"
fi

# 9. Check MIDI system
log_info "Checking MIDI system..."
if command -v aconnect &> /dev/null; then
    MIDI_DEVICES=$(aconnect -l 2>/dev/null | grep -c "client" || echo "0")
    if [ "$MIDI_DEVICES" -gt 0 ]; then
        log_success "MIDI devices detected: $MIDI_DEVICES"
    else
        log_warning "No MIDI devices detected"
    fi
else
    log_warning "aconnect not found - cannot verify MIDI devices"
fi

# 10. Check real-time configuration
log_info "Checking RT configuration..."
if [ -f /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor ]; then
    GOVERNOR=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || echo "unknown")
    if [ "$GOVERNOR" = "performance" ]; then
        log_success "CPU governor: performance"
    else
        log_warning "CPU governor: $GOVERNOR (should be 'performance')"
    fi
fi

# 11. Check web dashboard
log_info "Checking web dashboard..."
if [ -f "$MAP2_DIR/web/package.json" ]; then
    log_success "Web dashboard found"
    if [ -d "$MAP2_DIR/web/node_modules" ]; then
        log_success "Node modules installed"
    else
        log_warning "Node modules not installed - run 'npm install' in web/"
    fi
else
    log_warning "Web dashboard package.json not found"
fi

# 11. Check SELinux status
log_info "Checking SELinux status..."
if command -v getenforce &> /dev/null; then
    SELINUX_STATUS=$(getenforce 2>/dev/null || echo "error")
    case "$SELINUX_STATUS" in
        "Disabled")
            log_success "SELinux is disabled (desired state)"
            ;;
        "Permissive")
            log_warning "SELinux is in permissive mode (should be disabled)"
            ;;
        "Enforcing")
            log_error "SELinux is enforcing (MUST BE DISABLED for MAP2 Audio)"
            ;;
        *)
            log_warning "SELinux status unknown: $SELINUX_STATUS"
            ;;
    esac
else
    log_success "SELinux not installed (OK)"
fi

# 12. System check summary
log "========================================="
log_success "System check completed successfully"
log "========================================="
log "Backend ready to start on port 8080"
log "Web dashboard ready on port 3000"
log "Log file: $LOG_FILE"
log "========================================="

exit 0

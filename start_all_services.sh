#!/bin/bash
# ============================================================================
# MAP2 Audio Platform - Comprehensive System Startup
# Starts ALL services with proper dependency management and monitoring
# ============================================================================

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
LOG_DIR="$PROJECT_ROOT/logs"
WEB_DIR="$PROJECT_ROOT/web"
TIMEOUT=30

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Create logs directory
mkdir -p "$LOG_DIR"

# Service configuration
declare -A SERVICES=(
    ["backend"]="MAP2 Backend API"
    ["frontend"]="Web Frontend"
    ["lcd"]="LCD Display Service"
    ["tui"]="Terminal User Interface"
    ["monitor"]="System Monitoring"
    ["audio"]="Audio Engine"
    ["midi"]="MIDI Services"
)

declare -A SERVICE_PIDS=()
declare -A SERVICE_STATUS=()
declare -A SERVICE_LOGS=()

# Utility functions
print_banner() {
    echo -e "${CYAN}============================================================================${NC}"
    echo -e "${CYAN}                   MAP2 Audio Platform - System Startup                    ${NC}"
    echo -e "${CYAN}============================================================================${NC}"
    echo ""
}

print_status() {
    echo -e "${BLUE}[STARTUP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_service() {
    echo -e "${MAGENTA}[SERVICE]${NC} $1"
}

# Service management functions
check_service() {
    local service="$1"
    local check_command="$2"
    
    if eval "$check_command" >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

wait_for_service() {
    local service="$1"
    local check_command="$2"
    local timeout="$3"
    start_backend() {
        print_service "Starting MAP2 Backend API..."
    
    
    print_status "Waiting for $service to start..."
    
    local count=0
    while [ $count -lt $timeout ]; do
        if check_service "$service" "$check_command"; then
            print_success "$service is running"
            return 0
        fi
        
        echo -n "."
        sleep 1
        count=$((count + 1))
    done
    
    print_error "$service failed to start within ${timeout}s"
    return 1
}

start_pipedal() {
    print_service "Starting PipeDAL Audio Service..."
    
    # Check if PipeDAL is installed
    if ! command -v pipedal >/dev/null 2>&1; then
        print_warning "PipeDAL not found, attempting to install..."
        if [ -f "$PROJECT_ROOT/install-pipedal.sh" ]; then
            bash "$PROJECT_ROOT/install-pipedal.sh"
        else
            print_error "PipeDAL installation script not found"
            return 1
        fi
    fi
    
    # Start PipeDAL daemon
    pipedal --daemon --web-port 8081 > "$LOG_DIR/pipedal.log" 2>&1 &
    SERVICE_PIDS["pipedal"]=$!
    SERVICE_LOGS["pipedal"]="$LOG_DIR/pipedal.log"
    
    # Wait for PipeDAL to start
    if wait_for_service "PipeDAL" "curl -s http://localhost:8081/api/system/host_info" 15; then
        SERVICE_STATUS["pipedal"]="running"
        return 0
    else
        SERVICE_STATUS["pipedal"]="failed"
        return 1
    fi
}

start_backend() {
    print_service "Starting MAP2 Backend API..."
    
    # Set Python path
    export PYTHONPATH="$PROJECT_ROOT"
    
    # Start backend server
    cd "$PROJECT_ROOT"
    python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 > "$LOG_DIR/backend.log" 2>&1 &
    SERVICE_PIDS["backend"]=$!
    SERVICE_LOGS["backend"]="$LOG_DIR/backend.log"
    
    # Wait for backend to start
    if wait_for_service "Backend API" "curl -s http://localhost:8080/api/health" 15; then
        SERVICE_STATUS["backend"]="running"
        return 0
    else
        SERVICE_STATUS["backend"]="failed"
        return 1
    fi
}

start_frontend() {
    print_service "Starting Web Frontend..."
    
    cd "$WEB_DIR"
    
    # Check if dependencies are installed
    if [ ! -d "node_modules" ]; then
        print_status "Installing frontend dependencies..."
        npm install
    fi
    
    # Check if we have a build
    if [ ! -d "dist" ]; then
        print_status "Building frontend..."
        npm run build
    fi
    
    # Start development server for dynamic updates
    npm run dev -- --host 0.0.0.0 --port 3001 > "$LOG_DIR/frontend.log" 2>&1 &
    SERVICE_PIDS["frontend"]=$!
    SERVICE_LOGS["frontend"]="$LOG_DIR/frontend.log"
    
    # Wait for frontend to start
    if wait_for_service "Frontend" "curl -s http://localhost:3001" 10; then
        SERVICE_STATUS["frontend"]="running"
        return 0
    else
        SERVICE_STATUS["frontend"]="failed"
        return 1
    fi
}

start_lcd() {
    print_service "Starting LCD Display Service..."
    
    # Check if LCD hardware/simulation is available
                logger.info(f'System monitor: Backend={status["services"]["backend"]}, Frontend={status["services"]["frontend"]}')
    
    cd "$PROJECT_ROOT"
    python3 -m lcd.service > "$LOG_DIR/lcd.log" 2>&1 &
    SERVICE_PIDS["lcd"]=$!
    SERVICE_LOGS["lcd"]="$LOG_DIR/lcd.log"
    
    # LCD service doesn't have an HTTP endpoint, so just wait a moment
    sleep 3
    if kill -0 "${SERVICE_PIDS["lcd"]}" 2>/dev/null; then
        SERVICE_STATUS["lcd"]="running"
        print_success "LCD service is running"
        return 0
    else
        SERVICE_STATUS["lcd"]="failed"
        print_error "LCD service failed to start"
        return 1
    fi
}

start_tui() {
    print_service "Starting Terminal User Interface (backgrounded)..."
    
    cd "$PROJECT_ROOT"
    
    # Start TUI in background mode (for system startup)
    python3 -c "
import sys
 
        print_error "TUI daemon failed to start"
        return 1
    fi
}

start_monitor() {
    print_service "Starting System Monitoring..."
    
    # Create a comprehensive monitoring service
    cd "$PROJECT_ROOT"
    python3 -c "
import asyncio
import logging
import json
import time
from app.services.service_manager import ServiceManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('monitor')

async def monitor_loop():
    sm = ServiceManager.get_instance()
    
    while True:
        try:
            # Collect system status
            status = {
                'timestamp': time.time(),
                'audio': sm.get_audio_status(),
                'services': {},
                'system': {}
            }
            
            # Monitor all services
            import requests
            
            # Check backend
            try:
                resp = requests.get('http://localhost:8080/api/health', timeout=2)
                status['services']['backend'] = resp.status_code == 200
            except:
                status['services']['backend'] = False
                
            # Check frontend
            try:
                resp = requests.get('http://localhost:3001', timeout=2)
                status['services']['frontend'] = resp.status_code == 200
            except:
                status['services']['frontend'] = False
                
            # Check PipeDAL
            try:
                resp = requests.get('http://localhost:8081/api/system/host_info', timeout=2)
                status['services']['pipedal'] = resp.status_code == 200
            except:
                status['services']['pipedal'] = False
            
            # Save status
            with open('$LOG_DIR/system_status.json', 'w') as f:
                json.dump(status, f, indent=2)
            
            logger.info(f'System monitor: Backend={status[\"services\"][\"backend\"]}, Frontend={status[\"services\"][\"frontend\"]}, PipeDAL={status[\"services\"][\"pipedal\"]}')
            
            await asyncio.sleep(10)  # Monitor every 10 seconds
            
        except Exception as e:
            logger.error(f'Monitor error: {e}')
            await asyncio.sleep(5)

if __name__ == '__main__':
    asyncio.run(monitor_loop())
" > "$LOG_DIR/monitor.log" 2>&1 &
    
    SERVICE_PIDS["monitor"]=$!
    SERVICE_LOGS["monitor"]="$LOG_DIR/monitor.log"
    
    sleep 2
    if kill -0 "${SERVICE_PIDS["monitor"]}" 2>/dev/null; then
        SERVICE_STATUS["monitor"]="running"
        print_success "System monitoring is running"
        return 0
    else
        SERVICE_STATUS["monitor"]="failed"
        print_error "System monitoring failed to start"
        return 1
    fi
}

start_audio() {
    print_service "Starting Audio Engine..."
    
    # Audio engine is part of backend, so just initialize it
    cd "$PROJECT_ROOT"
    python3 -c "
from app.services.service_manager import ServiceManager
import asyncio

async def init_audio():
    sm = ServiceManager.get_instance()
    result = await sm.start_audio()
    print(f'Audio engine start result: {result}')
    
asyncio.run(init_audio())
" > "$LOG_DIR/audio_init.log" 2>&1
    
    if [ $? -eq 0 ]; then
        SERVICE_STATUS["audio"]="running"
        print_success "Audio engine initialized"
        return 0
    else
        SERVICE_STATUS["audio"]="failed"
        print_error "Audio engine failed to initialize"
        return 1
    fi
}

start_midi() {
    print_service "Starting MIDI Services..."
    
    # MIDI services are part of backend, just verify they're available
    cd "$PROJECT_ROOT"
    python3 -c "
try:
    from app.services.midi_mapping_service import MidiMappingService
    print('MIDI mapping service available')
except Exception as e:
    print(f'MIDI service error: {e}')
    exit(1)
" > "$LOG_DIR/midi_init.log" 2>&1
    
    if [ $? -eq 0 ]; then
        SERVICE_STATUS["midi"]="running"
        print_success "MIDI services available"
        return 0
    else
        SERVICE_STATUS["midi"]="failed"
        print_error "MIDI services failed to initialize"
        return 1
    fi
}

# Cleanup function
cleanup() {
    print_status "Cleaning up services..."
    
    for service in "${!SERVICE_PIDS[@]}"; do
        local pid="${SERVICE_PIDS[$service]}"
        if kill -0 "$pid" 2>/dev/null; then
            print_status "Stopping $service (PID: $pid)..."
            kill "$pid" 2>/dev/null || true
        fi
    done
    
    # Wait for processes to stop
    sleep 2
    
    # Force kill if needed
    for service in "${!SERVICE_PIDS[@]}"; do
        local pid="${SERVICE_PIDS[$service]}"
        if kill -0 "$pid" 2>/dev/null; then
            print_warning "Force killing $service (PID: $pid)..."
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
}

# Signal handlers
trap cleanup EXIT
trap 'echo ""; print_status "Received interrupt signal..."; cleanup; exit 130' INT TERM

# Main startup sequence
main() {
    print_banner
    
    print_status "Starting MAP2 Audio Platform with all services..."
    echo ""
    
    # Service startup order (dependencies first)
    local startup_order=("backend" "audio" "midi" "frontend" "lcd" "monitor" "tui")
    local failed_services=()
    
    for service in "${startup_order[@]}"; do
        echo ""
        if "start_$service"; then
            print_success "${SERVICES[$service]} started successfully"
        else
            print_error "${SERVICES[$service]} failed to start"
            failed_services+=("$service")
        fi
    done
    
    echo ""
    echo -e "${CYAN}============================================================================${NC}"
    echo -e "${CYAN}                            STARTUP COMPLETE                               ${NC}"
    echo -e "${CYAN}============================================================================${NC}"
    echo ""
    
    # Print service status summary
    print_status "Service Status Summary:"
    echo ""
    
    for service in "${startup_order[@]}"; do
        local status="${SERVICE_STATUS[$service]:-unknown}"
        local pid="${SERVICE_PIDS[$service]:-N/A}"
        local log="${SERVICE_LOGS[$service]:-N/A}"
        
        if [ "$status" = "running" ]; then
            echo -e "  ✅ ${SERVICES[$service]:-$service} - ${GREEN}RUNNING${NC} (PID: $pid)"
        else
            echo -e "  ❌ ${SERVICES[$service]:-$service} - ${RED}FAILED${NC} (Log: $log)"
        fi
    done
    
    echo ""
    
    # Print access information
    print_status "Access Information:"
    echo ""
    echo -e "  🌐 Web Interface:      ${CYAN}http://localhost:3001${NC}"
    echo -e "  🔧 Backend API:        ${CYAN}http://localhost:8080${NC}"
    echo -e "  📚 API Documentation:  ${CYAN}http://localhost:8080/docs${NC}"
    echo -e "  🎵 PipeDAL Interface:  ${CYAN}http://localhost:8081${NC}"
    echo -e "  📋 System Status:      ${CYAN}$LOG_DIR/system_status.json${NC}"
    echo ""
    
    # Print log locations
    print_status "Log Files:"
    echo ""
    for service in "${!SERVICE_LOGS[@]}"; do
        echo -e "  📄 ${SERVICES[$service]:-$service}: ${SERVICE_LOGS[$service]}"
    done
    echo ""
    
    if [ ${#failed_services[@]} -eq 0 ]; then
        print_success "All services started successfully!"
        echo ""
        
        # Run PipeDAL Engine test after successful startup
        run_pipedal_test
        echo ""
        
        print_status "System is ready for use. Press Ctrl+C to stop all services."
        echo ""
        
        # Keep running and monitor
        while true; do
            sleep 10
            
            # Check if core services are still running
            if ! check_service "Backend" "curl -s http://localhost:8080/api/health"; then
                print_error "Backend service has stopped!"
                break
            fi
        done
        
    else
        print_error "Some services failed to start: ${failed_services[*]}"
        echo ""
        print_status "Check log files for details:"
        for service in "${failed_services[@]}"; do
            echo -e "  📄 ${service}: ${SERVICE_LOGS[$service]:-N/A}"
        done
        echo ""
        exit 1
    fi
}

# Run PipeDAL Engine Test after services start
run_pipedal_test() {
    print_service "Running PipeDAL Engine Boot Test..."
    
    cd "$PROJECT_ROOT"
    
    # Ensure test scripts are executable
    chmod +x ./test_pipedal_engine.py ./run_pipedal_boot_test.sh 2>/dev/null || true
    
    # Run the test script in background to not block startup
    if ./run_pipedal_boot_test.sh >> "$LOG_DIR/pipedal_test.log" 2>&1 &; then
        print_success "PipeDAL Engine test started successfully"
        return 0
    else
        print_warning "PipeDAL Engine test had issues starting (check $LOG_DIR/pipedal_test.log)"
        return 1
    fi
}

# Help function
show_help() {
    echo "MAP2 Audio Platform - System Startup"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --help              Show this help message"
    echo "  --log-level=LEVEL   Set log level (debug, info, warning, error)"
    echo "  --timeout=SECONDS   Set service startup timeout (default: 30)"
    echo ""
    echo "Services started:"
    for service in "${!SERVICES[@]}"; do
        echo "  • ${SERVICES[$service]}"
    done
    echo ""
    echo "Log files will be created in: $LOG_DIR"
    echo ""
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --help)
            show_help
            exit 0
            ;;
        --log-level=*)
            LOG_LEVEL="${1#*=}"
            shift
            ;;
        --timeout=*)
            TIMEOUT="${1#*=}"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Run main function
main
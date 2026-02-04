#!/bin/bash
#
# MAP2 Audio Platform - Master Control Script
# =============================================
# Unified interface for all MAP2 system operations
#
# Features:
#   • Service Management (start, stop, restart)
#   • Developer Mode Toggle (dev/stage modes)
#   • System Diagnostics & Status
#   • Quick Actions & Maintenance
#   • Logging & Monitoring
#
# Usage: ./map2.sh <command> [options]
#

set -e

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
LOG_DIR="$PROJECT_ROOT/logs"
WEB_DIR="$PROJECT_ROOT/web"
BUILD_TUNE_SCRIPT="$PROJECT_ROOT/scripts/dev/build-tune.sh"

# Create log directory
mkdir -p "$LOG_DIR"

# Colors and formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Icons for better UX
ICON_SUCCESS="✓"
ICON_ERROR="✗"
ICON_WARNING="⚠"
ICON_INFO="ℹ"
ICON_ROCKET="🚀"
ICON_STOP="🛑"
ICON_RESTART="🔄"
ICON_DEV="🔧"
ICON_STAGE="🎭"
ICON_STATUS="📊"
ICON_LOG="📝"

# Utility functions
print_banner() {
    echo ""
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}          MAP2 Audio Platform - Master Control              ${NC}"
    echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_section() {
    echo -e "${BLUE}─────────────────────────────────────────────────────────────${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}─────────────────────────────────────────────────────────────${NC}"
}

log_info() {
    echo -e "${BLUE}${ICON_INFO}${NC} $1"
}

log_success() {
    echo -e "${GREEN}${ICON_SUCCESS}${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}${ICON_WARNING}${NC} $1"
}

log_error() {
    echo -e "${RED}${ICON_ERROR}${NC} $1"
}

log_action() {
    echo -e "${CYAN}${ICON_ROCKET}${NC} $1"
}

# Service management functions
get_service_pid() {
    local port=$1
    lsof -t -i :$port 2>/dev/null || true
}

is_service_running() {
    local port=$1
    local pid=$(get_service_pid $port)
    [ -n "$pid" ]
}

kill_service() {
    local port=$1
    local name=$2
    
    local pids=$(get_service_pid $port)
    if [ -n "$pids" ]; then
        log_info "Stopping $name (port $port, PIDs: $pids)"
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 1
        log_success "$name stopped"
        return 0
    else
        log_info "$name not running (port $port free)"
        return 1
    fi
}

wait_for_service() {
    local port=$1
    local name=$2
    local timeout=${3:-30}
    
    log_info "Waiting for $name to start (port $port)..."
    
    for i in $(seq 1 $timeout); do
        if curl -s http://localhost:$port > /dev/null 2>&1; then
            log_success "$name ready (${i}s)"
            return 0
        fi
        sleep 1
        echo -n "."
    done
    
    echo ""
    log_error "$name failed to start within ${timeout}s"
    return 1
}

# Developer mode functions
get_current_mode() {
    if [ -f "/tmp/juce-build-tune.state" ] && grep -q "JUCE_BUILD_OPTIMIZED=1" "/tmp/juce-build-tune.state" 2>/dev/null; then
        echo "DEVELOPMENT"
    else
        echo "STAGE"
    fi
}

show_mode_status() {
    local mode=$(get_current_mode)
    echo ""
    if [ "$mode" = "DEVELOPMENT" ]; then
        echo -e "${RED}┌─────────────────────────────────────────────────────────┐${NC}"
        echo -e "${RED}│ ${ICON_DEV} DEVELOPMENT MODE ACTIVE                      │${NC}"
        echo -e "${RED}└─────────────────────────────────────────────────────────┘${NC}"
        echo -e "${YELLOW}  ${ICON_WARNING} Backend and Frontend services are STOPPED${NC}"
        echo -e "${YELLOW}  ${ICON_WARNING} System optimized for build performance${NC}"
        echo -e "${YELLOW}  ${ICON_WARNING} Web interface is UNAVAILABLE${NC}"
    else
        echo -e "${GREEN}┌─────────────────────────────────────────────────────────┐${NC}"
        echo -e "${GREEN}│ ${ICON_STAGE} STAGE MODE ACTIVE                          │${NC}"
        echo -e "${GREEN}└─────────────────────────────────────────────────────────┘${NC}"
        echo -e "${BLUE}  ${ICON_SUCCESS} All services running normally${NC}"
        echo -e "${BLUE}  ${ICON_SUCCESS} Web interface available${NC}"
        echo -e "${BLUE}  ${ICON_SUCCESS} Regular system settings${NC}"
    fi
    echo ""
}

# Command implementations
cmd_start() {
    print_section "Starting MAP2 Services"
    
    # Check if already in dev mode
    if [ "$(get_current_mode)" = "DEVELOPMENT" ]; then
        log_warning "Currently in DEVELOPMENT mode - services are stopped"
        log_info "Run '$0 dev off' to switch to STAGE mode first"
        return 1
    fi
    
    # Start backend
    if ! is_service_running 8080; then
        log_action "Starting Backend API (port 8080)"
        cd "$PROJECT_ROOT"
        .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080 > "$LOG_DIR/backend.log" 2>&1 &
        wait_for_service 8080 "Backend API" 30
    else
        log_info "Backend already running"
    fi
    
    # Start frontend
    if ! is_service_running 3000; then
        log_action "Starting Web Frontend (port 3000)"
        cd "$WEB_DIR"
        npm run dev -- --host 0.0.0.0 --port 3000 > "$LOG_DIR/frontend.log" 2>&1 &
        wait_for_service 3000 "Web Frontend" 30
    else
        log_info "Frontend already running"
    fi
    
    log_success "All services started successfully!"
    echo ""
    echo -e "${BLUE}Access URLs:${NC}"
    echo -e "  ${BOLD}Backend API:${NC}  http://localhost:8080"
    echo -e "  ${BOLD}Web Frontend:${NC} http://localhost:3000"
    echo -e "  ${BOLD}API Docs:${NC}     http://localhost:8080/docs"
}

cmd_stop() {
    print_section "Stopping MAP2 Services"
    
    kill_service 8080 "Backend API"
    kill_service 3000 "Web Frontend"
    
    log_success "All services stopped"
}

cmd_restart() {
    print_section "Restarting MAP2 Services"
    
    cmd_stop
    sleep 2
    cmd_start
    
    log_success "All services restarted"
}

cmd_quick_restart() {
    print_section "Quick Restart (Fast)"
    
    # Kill services quickly
    kill_service 8080 "Backend API" || true
    kill_service 3000 "Web Frontend" || true
    
    sleep 1
    
    # Restart
    cmd_start
}

cmd_hard_restart() {
    print_section "Hard Restart (with Hardware Reset)"
    
    log_action "Performing hard restart with hardware reset..."
    
    # Use existing quick-restart script
    if [ -f "$PROJECT_ROOT/quick-restart.sh" ]; then
        bash "$PROJECT_ROOT/quick-restart.sh"
    else
        log_warning "Hard restart script not found, falling back to normal restart"
        cmd_restart
    fi
}

cmd_status() {
    print_section "System Status"
    
    # Show developer mode status
    show_mode_status
    
    # Service status
    echo -e "${BOLD}Services:${NC}"
    if is_service_running 8080; then
        local backend_pid=$(get_service_pid 8080)
        echo -e "  Backend API:  ${GREEN}${ICON_SUCCESS} RUNNING${NC} (PID: $backend_pid, Port: 8080)"
    else
        echo -e "  Backend API:  ${RED}${ICON_ERROR} STOPPED${NC} (Port: 8080)"
    fi
    
    if is_service_running 3000; then
        local frontend_pid=$(get_service_pid 3000)
        echo -e "  Web Frontend: ${GREEN}${ICON_SUCCESS} RUNNING${NC} (PID: $frontend_pid, Port: 3000)"
    else
        echo -e "  Web Frontend: ${RED}${ICON_ERROR} STOPPED${NC} (Port: 3000)"
    fi
    
    # System info
    echo ""
    echo -e "${BOLD}System Info:${NC}"
    echo -e "  Memory: $(free -h | awk '/^Mem:/ {print $3 "/" $2}')"
    echo -e "  CPU: $(nproc) cores"
    echo -e "  Load: $(uptime | awk -F'load average:' '{print $2}')"
    
    # URLs if services are running
    if is_service_running 8080 || is_service_running 3000; then
        echo ""
        echo -e "${BOLD}Access URLs:${NC}"
        if is_service_running 8080; then
            echo -e "  Backend API:  http://localhost:8080"
            echo -e "  API Docs:     http://localhost:8080/docs"
        fi
        if is_service_running 3000; then
            echo -e "  Web Frontend: http://localhost:3000"
        fi
    fi
}

cmd_logs() {
    local service=${1:-all}
    
    case $service in
        backend|api)
            print_section "Backend Logs"
            tail -f "$LOG_DIR/backend.log" 2>/dev/null || log_error "No backend log found"
            ;;
        frontend|web)
            print_section "Frontend Logs" 
            tail -f "$LOG_DIR/frontend.log" 2>/dev/null || log_error "No frontend log found"
            ;;
        all|*)
            print_section "All Logs"
            log_info "Recent backend logs:"
            tail -10 "$LOG_DIR/backend.log" 2>/dev/null || log_error "No backend log found"
            echo ""
            log_info "Recent frontend logs:"
            tail -10 "$LOG_DIR/frontend.log" 2>/dev/null || log_error "No frontend log found"
            echo ""
            log_info "Use '$0 logs backend' or '$0 logs frontend' to follow specific logs"
            ;;
    esac
}

cmd_dev() {
    local action=${1:-status}
    
    case $action in
        on|enable)
            print_section "Enabling DEVELOPMENT Mode"
            log_action "Switching to development mode..."
            
            if [ -f "$BUILD_TUNE_SCRIPT" ]; then
                sudo "$BUILD_TUNE_SCRIPT" on
                show_mode_status
                echo -e "${BOLD}Recommended build commands:${NC}"
                echo -e "  ${YELLOW}nice -n -10 make -j$(nproc)${NC}"
                echo -e "  ${YELLOW}nice -n -10 ionice -c2 -n0 make -j$(nproc)${NC}"
                echo ""
                log_info "Run '$0 dev off' to return to STAGE mode"
            else
                log_error "Build tune script not found at $BUILD_TUNE_SCRIPT"
                return 1
            fi
            ;;
            
        off|disable)
            print_section "Enabling STAGE Mode"
            log_action "Switching to stage mode..."
            
            if [ -f "$BUILD_TUNE_SCRIPT" ]; then
                sudo "$BUILD_TUNE_SCRIPT" off
                show_mode_status
                echo -e "${BOLD}Services:${NC}"
                echo -e "  Backend:  http://localhost:8080"
                echo -e "  Frontend: http://localhost:3000"
            else
                log_error "Build tune script not found at $BUILD_TUNE_SCRIPT"
                return 1
            fi
            ;;
            
        toggle)
            local current_mode=$(get_current_mode)
            if [ "$current_mode" = "DEVELOPMENT" ]; then
                cmd_dev off
            else
                cmd_dev on
            fi
            ;;
            
        status|*)
            print_section "Developer Mode Status"
            show_mode_status
            
            if [ -f "$BUILD_TUNE_SCRIPT" ]; then
                "$BUILD_TUNE_SCRIPT" status
            else
                log_error "Build tune script not found"
            fi
            ;;
    esac
}

cmd_tui() {
    print_section "Launching TUI"
    log_action "Starting Terminal User Interface..."
    
    cd "$PROJECT_ROOT"
    python3 -m tui.app
}

cmd_logo() {
    local action=${1:-status}
    
    case $action in
        install)
            print_section "Installing Platform Logo"
            log_action "Setting up MAP2 platform logo for boot splash..."
            
            if [ -f "$PROJECT_ROOT/MACKESAUDIOPLATFORM.png" ]; then
                log_success "Platform logo found: MACKESAUDIOPLATFORM.png"
                
                if [ -f "$PROJECT_ROOT/map2-logo-boot-manager.sh" ]; then
                    log_info "Running logo boot manager..."
                    sudo bash "$PROJECT_ROOT/map2-logo-boot-manager.sh" install
                else
                    log_error "Logo boot manager script not found"
                    return 1
                fi
            else
                log_error "Platform logo not found: MACKESAUDIOPLATFORM.png"
                return 1
            fi
            ;;
            
        uninstall)
            print_section "Uninstalling Platform Logo"
            
            if [ -f "$PROJECT_ROOT/map2-logo-boot-manager.sh" ]; then
                sudo bash "$PROJECT_ROOT/map2-logo-boot-manager.sh" uninstall
            else
                log_error "Logo boot manager script not found"
                return 1
            fi
            ;;
            
        repair)
            print_section "Repairing Platform Logo"
            log_action "Fixing missing logo in boot splash..."
            
            if [ -f "$PROJECT_ROOT/map2-logo-boot-manager.sh" ]; then
                sudo bash "$PROJECT_ROOT/map2-logo-boot-manager.sh" repair
            else
                log_error "Logo boot manager script not found"
                return 1
            fi
            ;;
            
        splash)
            local splash_action=${2:-status}
            print_section "Managing Boot Splash Visibility"
            
            if [ -f "$PROJECT_ROOT/map2-logo-boot-manager.sh" ]; then
                sudo bash "$PROJECT_ROOT/map2-logo-boot-manager.sh" splash "$splash_action"
            else
                log_error "Logo boot manager script not found"
                return 1
            fi
            ;;
            
        test)
            print_section "Testing Boot Splash"
            
            if [ -f "$PROJECT_ROOT/map2-logo-boot-manager.sh" ]; then
                sudo bash "$PROJECT_ROOT/map2-logo-boot-manager.sh" test
            else
                log_error "Logo boot manager script not found"
                return 1
            fi
            ;;
            
        status|*)
            print_section "Platform Logo Status"
            
            # Check for logo file
            if [ -f "$PROJECT_ROOT/MACKESAUDIOPLATFORM.png" ]; then
                log_success "Platform logo found: MACKESAUDIOPLATFORM.png"
                
                # Get file info
                local file_size=$(ls -lh "$PROJECT_ROOT/MACKESAUDIOPLATFORM.png" | awk '{print $5}')
                echo -e "${BLUE}  File size: $file_size${NC}"
                
                # Check if identify is available for dimensions
                if command -v identify &> /dev/null; then
                    local dimensions=$(identify "$PROJECT_ROOT/MACKESAUDIOPLATFORM.png" 2>/dev/null | awk '{print $3}')
                    echo -e "${BLUE}  Dimensions: $dimensions${NC}"
                fi
            else
                log_error "Platform logo not found: MACKESAUDIOPLATFORM.png"
            fi
            
            echo ""
            
            # Check boot splash status
            if [ -f "$PROJECT_ROOT/map2-logo-boot-manager.sh" ]; then
                bash "$PROJECT_ROOT/map2-logo-boot-manager.sh" status
            else
                log_warning "Logo boot manager script not available"
            fi
            ;;
    esac
}

cmd_build() {
    local target=${1:-juce}
    
    print_section "Build System"
    
    # Check if in dev mode
    if [ "$(get_current_mode)" != "DEVELOPMENT" ]; then
        log_warning "Not in DEVELOPMENT mode - build performance may be suboptimal"
        log_info "Run '$0 dev on' for optimized build environment"
    fi
    
    case $target in
        juce)
            log_action "Building JUCE Engine..."
            cd "$PROJECT_ROOT/juce-engine/build"
            nice -n -10 make -j$(nproc) VERBOSE=1
            ;;
        web)
            log_action "Building Web Frontend..."
            cd "$WEB_DIR"
            npm run build
            ;;
        all)
            cmd_build juce
            cmd_build web
            ;;
        *)
            log_error "Unknown build target: $target"
            log_info "Available targets: juce, web, all"
            return 1
            ;;
    esac
}

show_help() {
    print_banner
    echo -e "${BOLD}Usage:${NC} $0 <command> [options]"
    echo ""
    echo -e "${BOLD}Service Management:${NC}"
    echo -e "  ${CYAN}start${NC}             Start all MAP2 services"
    echo -e "  ${CYAN}stop${NC}              Stop all MAP2 services"  
    echo -e "  ${CYAN}restart${NC}           Restart all services (normal)"
    echo -e "  ${CYAN}quick-restart${NC}     Fast restart without delays"
    echo -e "  ${CYAN}hard-restart${NC}      Full restart with hardware reset"
    echo ""
    echo -e "${BOLD}Developer Mode:${NC}"
    echo -e "  ${CYAN}dev on${NC}            Enable DEVELOPMENT mode (optimize for builds)"
    echo -e "  ${CYAN}dev off${NC}           Enable STAGE mode (normal operation)"
    echo -e "  ${CYAN}dev toggle${NC}        Toggle between dev/stage modes"
    echo -e "  ${CYAN}dev status${NC}        Show developer mode status"
    echo ""
    echo -e "${BOLD}System Information:${NC}"
    echo -e "  ${CYAN}status${NC}            Show system status and service health"
    echo -e "  ${CYAN}logs [service]${NC}    Show logs (backend|frontend|all)"
    echo -e "  ${CYAN}tui${NC}               Launch Terminal User Interface"
    echo ""
    echo -e "${BOLD}Platform Branding:${NC}"
    echo -e "  ${CYAN}logo install${NC}      Install platform logo for boot splash (requires root)"
    echo -e "  ${CYAN}logo repair${NC}       Fix missing logo in existing installation (requires root)"
    echo -e "  ${CYAN}logo uninstall${NC}    Remove platform logo from boot splash (requires root)"
    echo -e "  ${CYAN}logo test${NC}         Test boot splash display (requires root)"
    echo -e "  ${CYAN}logo status${NC}       Show platform logo and boot splash status"
    echo -e "  ${CYAN}logo splash show${NC}  Make boot splash visible during boot (requires root)"
    echo -e "  ${CYAN}logo splash hide${NC}  Hide boot splash for clean boot (requires root)"
    echo ""
    echo -e "${BOLD}Build System:${NC}"
    echo -e "  ${CYAN}build [target]${NC}    Build project (juce|web|all)"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo -e "  ${DIM}$0 start${NC}           ${DIM}# Start all services${NC}"
    echo -e "  ${DIM}$0 dev on${NC}          ${DIM}# Switch to development mode${NC}" 
    echo -e "  ${DIM}$0 restart${NC}         ${DIM}# Restart everything${NC}"
    echo -e "  ${DIM}$0 status${NC}          ${DIM}# Check system status${NC}"
    echo -e "  ${DIM}$0 logo install${NC}    ${DIM}# Install platform logo${NC}"
    echo -e "  ${DIM}$0 logo splash show${NC} ${DIM}# Show boot splash during startup${NC}"
    echo -e "  ${DIM}$0 logs backend${NC}    ${DIM}# Show backend logs${NC}"
    echo ""
    echo -e "${BOLD}Developer Mode:${NC}"
    echo -e "  ${DIM}DEVELOPMENT:${NC} Services stopped, system optimized for builds"
    echo -e "  ${DIM}STAGE:${NC}       Normal operation, web interface available"
    echo ""
}

# Main command router
main() {
    case "${1:-help}" in
        start|up)
            cmd_start
            ;;
        stop|down)
            cmd_stop
            ;;
        restart|reboot)
            cmd_restart
            ;;
        quick-restart|qr)
            cmd_quick_restart
            ;;
        hard-restart|hr)
            cmd_hard_restart
            ;;
        status|st)
            cmd_status
            ;;
        logs|log)
            cmd_logs "${2:-all}"
            ;;
        dev|developer|mode)
            cmd_dev "${2:-status}"
            ;;
        tui|ui)
            cmd_tui
            ;;
        logo|branding)
            cmd_logo "${2:-status}"
            ;;
        build)
            cmd_build "${2:-juce}"
            ;;
        help|--help|-h|*)
            show_help
            ;;
    esac
}

# Execute main function with all arguments
main "$@"
#!/bin/bash
#
# JUCE Build Performance Tuner
# Toggles system configuration between normal operation and build-optimized state
#
# Usage:
#   ./juce-build-tune.sh on    - Enable build optimization
#   ./juce-build-tune.sh off   - Restore normal operation
#   ./juce-build-tune.sh status - Show current state
#   ./juce-build-tune.sh build  - Enable optimization, run build, restore
#
# Optimizations applied:
#   - CPU governor: performance (max clock speed)
#   - I/O scheduler: mq-deadline (compile throughput)
#   - Nice level: -10 for build processes
#   - vm.dirty_ratio tuning for faster disk I/O
#   - Drop caches before build
#   - Disable unnecessary services temporarily
#   - NUMA-aware make parallelism
#   - ccache optimization
#
# Author: MAP2 Audio Team
# License: MIT

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="/tmp/juce-build-tune.state"
JUCE_BUILD_DIR="${SCRIPT_DIR}/../juce-engine/build"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# System detection
NUM_CORES=$(nproc)
TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
TOTAL_MEM_GB=$((TOTAL_MEM_KB / 1024 / 1024))

# ============================================================
# Helper Functions
# ============================================================

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_warn "Some optimizations require root. Will use sudo when needed."
        SUDO_CMD="sudo"
    else
        SUDO_CMD=""
    fi
}

# ============================================================
# State Management
# ============================================================

save_state() {
    local param=$1
    local value=$2
    echo "${param}=${value}" >> "$STATE_FILE"
}

load_state() {
    local param=$1
    if [ -f "$STATE_FILE" ]; then
        grep "^${param}=" "$STATE_FILE" 2>/dev/null | cut -d'=' -f2 | tail -1
    fi
}

clear_state() {
    rm -f "$STATE_FILE"
}

is_optimized() {
    [ -f "$STATE_FILE" ] && grep -q "JUCE_BUILD_OPTIMIZED=1" "$STATE_FILE"
}

# ============================================================
# CPU Governor Management
# ============================================================

get_current_governor() {
    if [ -f /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor ]; then
        cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor
    else
        echo "unavailable"
    fi
}

set_governor() {
    local governor=$1
    if [ -d /sys/devices/system/cpu/cpu0/cpufreq ]; then
        for cpu in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do
            if [ -f "$cpu" ]; then
                $SUDO_CMD sh -c "echo $governor > $cpu" 2>/dev/null || true
            fi
        done
        log_info "CPU governor set to: $governor"
    else
        log_warn "CPU frequency scaling not available (may be controlled by BIOS)"
    fi
}

# ============================================================
# Intel Turbo Boost Control
# ============================================================

get_turbo_status() {
    if [ -f /sys/devices/system/cpu/intel_pstate/no_turbo ]; then
        local no_turbo=$(cat /sys/devices/system/cpu/intel_pstate/no_turbo)
        [ "$no_turbo" = "0" ] && echo "enabled" || echo "disabled"
    else
        echo "unavailable"
    fi
}

set_turbo() {
    local state=$1  # "on" or "off"
    if [ -f /sys/devices/system/cpu/intel_pstate/no_turbo ]; then
        if [ "$state" = "on" ]; then
            $SUDO_CMD sh -c "echo 0 > /sys/devices/system/cpu/intel_pstate/no_turbo"
            log_info "Intel Turbo Boost: ENABLED"
        else
            $SUDO_CMD sh -c "echo 1 > /sys/devices/system/cpu/intel_pstate/no_turbo"
            log_info "Intel Turbo Boost: DISABLED"
        fi
    fi
}

# ============================================================
# I/O Scheduler Management
# ============================================================

get_io_scheduler() {
    local device=${1:-sda}
    if [ -f /sys/block/$device/queue/scheduler ]; then
        cat /sys/block/$device/queue/scheduler | grep -oP '\[\K[^\]]+'
    else
        echo "unavailable"
    fi
}

set_io_scheduler() {
    local scheduler=$1
    for device in /sys/block/sd*/queue/scheduler /sys/block/nvme*/queue/scheduler; do
        if [ -f "$device" ]; then
            $SUDO_CMD sh -c "echo $scheduler > $device" 2>/dev/null || true
        fi
    done
    log_info "I/O scheduler set to: $scheduler"
}

# ============================================================
# Virtual Memory Tuning
# ============================================================

get_vm_settings() {
    echo "swappiness=$(cat /proc/sys/vm/swappiness)"
    echo "dirty_ratio=$(cat /proc/sys/vm/dirty_ratio)"
    echo "dirty_background_ratio=$(cat /proc/sys/vm/dirty_background_ratio)"
    echo "vfs_cache_pressure=$(cat /proc/sys/vm/vfs_cache_pressure)"
}

tune_vm_for_build() {
    # Save current settings
    save_state "vm_swappiness" "$(cat /proc/sys/vm/swappiness)"
    save_state "vm_dirty_ratio" "$(cat /proc/sys/vm/dirty_ratio)"
    save_state "vm_dirty_background_ratio" "$(cat /proc/sys/vm/dirty_background_ratio)"
    save_state "vm_vfs_cache_pressure" "$(cat /proc/sys/vm/vfs_cache_pressure)"
    
    # Optimize for build throughput
    # Higher dirty ratios = more data buffered before write
    # Lower cache pressure = keep more file metadata cached
    $SUDO_CMD sysctl -q -w vm.swappiness=1
    $SUDO_CMD sysctl -q -w vm.dirty_ratio=40
    $SUDO_CMD sysctl -q -w vm.dirty_background_ratio=10
    $SUDO_CMD sysctl -q -w vm.vfs_cache_pressure=50
    
    log_info "VM tuned for build: swappiness=1, dirty_ratio=40, cache_pressure=50"
}

restore_vm_settings() {
    local swappiness=$(load_state "vm_swappiness")
    local dirty=$(load_state "vm_dirty_ratio")
    local dirty_bg=$(load_state "vm_dirty_background_ratio")
    local cache_pressure=$(load_state "vm_vfs_cache_pressure")
    
    [ -n "$swappiness" ] && $SUDO_CMD sysctl -q -w vm.swappiness=$swappiness
    [ -n "$dirty" ] && $SUDO_CMD sysctl -q -w vm.dirty_ratio=$dirty
    [ -n "$dirty_bg" ] && $SUDO_CMD sysctl -q -w vm.dirty_background_ratio=$dirty_bg
    [ -n "$cache_pressure" ] && $SUDO_CMD sysctl -q -w vm.vfs_cache_pressure=$cache_pressure
    
    log_info "VM settings restored"
}

# ============================================================
# Process Priority Management
# ============================================================

get_nice_level() {
    nice
}

# ============================================================
# Cache Management
# ============================================================

drop_caches() {
    sync
    $SUDO_CMD sh -c "echo 3 > /proc/sys/vm/drop_caches"
    log_info "Disk caches dropped and synced"
}

setup_ccache() {
    if command -v ccache &> /dev/null; then
        # Optimize ccache for large builds
        export CCACHE_MAXSIZE="10G"
        export CCACHE_COMPRESS=1
        export CCACHE_COMPRESSLEVEL=6
        export CCACHE_DIR="${HOME}/.ccache"
        
        # Ensure ccache directory exists with optimal settings
        ccache --max-size=10G 2>/dev/null || true
        ccache --set-config=compression=true 2>/dev/null || true
        
        log_info "ccache configured: max_size=10G, compression=enabled"
        return 0
    else
        log_warn "ccache not installed. Consider: sudo dnf install ccache"
        return 1
    fi
}

# ============================================================
# MAP2 Backend/Frontend Management
# ============================================================

MAP2_PROJECT_DIR="${SCRIPT_DIR}/.."
BACKEND_PORT=8080
FRONTEND_PORT=3000
MAP2_BACKEND_SERVICE="map2-backend.service"
MAP2_FRONTEND_SERVICE="map2-web.service"

# Get the real user (not root if running with sudo)
get_real_user() {
    if [ -n "$SUDO_USER" ]; then
        echo "$SUDO_USER"
    else
        whoami
    fi
}

is_systemd_service_active() {
    local service=$1
    systemctl is-active --quiet "$service" 2>/dev/null
}

stop_map2_backend() {
    log_info "Stopping MAP2 Backend..."
    
    # First check if systemd service is managing it
    if is_systemd_service_active "$MAP2_BACKEND_SERVICE"; then
        save_state "backend_was_systemd" "1"
        save_state "backend_was_running" "1"
        $SUDO_CMD systemctl stop "$MAP2_BACKEND_SERVICE" 2>/dev/null || true
        log_info "Backend systemd service stopped"
    else
        save_state "backend_was_systemd" "0"
        # Fallback to killing by port
        local pids=$(lsof -t -i :$BACKEND_PORT 2>/dev/null || ss -tlnp 2>/dev/null | grep ":$BACKEND_PORT " | grep -oP 'pid=\K\d+' || true)
        if [ -n "$pids" ]; then
            save_state "backend_was_running" "1"
            save_state "backend_pids" "$pids"
            echo "$pids" | tr '\n' ' ' | xargs kill -9 2>/dev/null || true
            sleep 1
            log_info "Backend stopped (PIDs: $pids)"
        else
            save_state "backend_was_running" "0"
            log_info "Backend was not running"
        fi
    fi
}

stop_map2_frontend() {
    log_info "Stopping MAP2 Frontend..."
    
    # First check if systemd service is managing it
    if is_systemd_service_active "$MAP2_FRONTEND_SERVICE"; then
        save_state "frontend_was_systemd" "1"
        save_state "frontend_was_running" "1"
        $SUDO_CMD systemctl stop "$MAP2_FRONTEND_SERVICE" 2>/dev/null || true
        log_info "Frontend systemd service stopped"
    else
        save_state "frontend_was_systemd" "0"
        # Fallback to killing by port
        local pids=$(lsof -t -i :$FRONTEND_PORT 2>/dev/null || ss -tlnp 2>/dev/null | grep ":$FRONTEND_PORT " | grep -oP 'pid=\K\d+' || true)
        if [ -n "$pids" ]; then
            save_state "frontend_was_running" "1"
            save_state "frontend_pids" "$pids"
            echo "$pids" | tr '\n' ' ' | xargs kill -9 2>/dev/null || true
            sleep 1
            log_info "Frontend stopped (PIDs: $pids)"
        else
            save_state "frontend_was_running" "0"
            log_info "Frontend was not running"
        fi
    fi
}

kill_node_processes() {
    log_info "Releasing memory from Node.js processes..."
    
    # Find non-VS Code node processes (map2-audio related)
    local node_pids=$(ps aux | grep -E "node.*map2-audio" | grep -v "grep\|.vscode-server" | awk '{print $2}' || true)
    
    if [ -n "$node_pids" ]; then
        local count=$(echo "$node_pids" | wc -w)
        echo "$node_pids" | xargs kill -9 2>/dev/null || true
        log_info "Killed $count Node.js processes"
    else
        log_info "No MAP2 Node.js processes found"
    fi
    
    # Also kill any orphaned esbuild processes
    local esbuild_pids=$(pgrep -f "esbuild.*map2" 2>/dev/null || true)
    if [ -n "$esbuild_pids" ]; then
        echo "$esbuild_pids" | xargs kill -9 2>/dev/null || true
        log_info "Killed esbuild processes"
    fi
}

start_map2_backend() {
    local was_running=$(load_state "backend_was_running")
    local was_systemd=$(load_state "backend_was_systemd")
    
    if [ "$was_running" = "1" ]; then
        log_info "Starting MAP2 Backend..."
        
        if [ "$was_systemd" = "1" ]; then
            # Restart via systemd
            $SUDO_CMD systemctl start "$MAP2_BACKEND_SERVICE" 2>/dev/null || true
            log_info "Backend systemd service started"
        else
            # Manual start
            local real_user=$(get_real_user)
            local project_dir="$MAP2_PROJECT_DIR"
            
            if [ -f "$project_dir/.venv/bin/uvicorn" ]; then
                # Run as the original user, not as root
                if [ "$EUID" -eq 0 ] && [ -n "$SUDO_USER" ]; then
                    sudo -u "$SUDO_USER" bash -c "cd '$project_dir' && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT > /tmp/map2-backend.log 2>&1 &"
                else
                    cd "$project_dir"
                    .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port $BACKEND_PORT > /tmp/map2-backend.log 2>&1 &
                    cd - > /dev/null
                fi
                log_info "Backend starting..."
            else
                log_warn "Backend venv not found at $project_dir/.venv"
            fi
        fi
        
        # Wait for health check
        for i in {1..15}; do
            if curl -s http://localhost:$BACKEND_PORT/api/health > /dev/null 2>&1; then
                log_info "Backend ready"
                break
            fi
            sleep 1
        done
    else
        log_info "Backend was not running before - skipping restart"
    fi
}

start_map2_frontend() {
    local was_running=$(load_state "frontend_was_running")
    local was_systemd=$(load_state "frontend_was_systemd")
    
    if [ "$was_running" = "1" ]; then
        log_info "Starting MAP2 Frontend..."
        
        if [ "$was_systemd" = "1" ]; then
            # Restart via systemd
            $SUDO_CMD systemctl start "$MAP2_FRONTEND_SERVICE" 2>/dev/null || true
            log_info "Frontend systemd service started"
        else
            # Manual start
            local real_user=$(get_real_user)
            local web_dir="$MAP2_PROJECT_DIR/web"
            
            if [ -f "$web_dir/package.json" ]; then
                # Run as the original user, not as root
                if [ "$EUID" -eq 0 ] && [ -n "$SUDO_USER" ]; then
                    sudo -u "$SUDO_USER" bash -c "cd '$web_dir' && npm run dev -- --host 0.0.0.0 --port $FRONTEND_PORT > /tmp/map2-frontend.log 2>&1 &"
                else
                    cd "$web_dir"
                    npm run dev -- --host 0.0.0.0 --port $FRONTEND_PORT > /tmp/map2-frontend.log 2>&1 &
                    cd - > /dev/null
                fi
                log_info "Frontend starting..."
            else
                log_warn "Frontend package.json not found at $web_dir"
            fi
        fi
        
        # Wait for frontend to be ready
        for i in {1..15}; do
            if curl -s http://localhost:$FRONTEND_PORT > /dev/null 2>&1; then
                log_info "Frontend ready"
                break
            fi
            sleep 1
        done
    else
        log_info "Frontend was not running before - skipping restart"
    fi
}

get_memory_usage() {
    # Returns memory usage in MB
    free -m | awk '/^Mem:/{print $3}'
}

# ============================================================
# Service Management
# ============================================================

# List of services that can be safely stopped during build
PAUSABLE_SERVICES=(
    "packagekit"
    "fwupd"
    "tracker-miner-fs-3"
    "tracker-miner-fs"
    "gnome-software-service"
    "flatpak-system-helper"
    "cups"
    "bluetooth"
)

pause_services() {
    local paused_services=""
    
    for service in "${PAUSABLE_SERVICES[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            if $SUDO_CMD systemctl stop "$service" 2>/dev/null; then
                paused_services="${paused_services}${service},"
                log_info "Paused: $service"
            fi
        fi
    done
    
    # Save which services we paused
    save_state "paused_services" "$paused_services"
}

resume_services() {
    local paused_services=$(load_state "paused_services")
    
    if [ -n "$paused_services" ]; then
        IFS=',' read -ra SERVICES <<< "$paused_services"
        for service in "${SERVICES[@]}"; do
            if [ -n "$service" ]; then
                $SUDO_CMD systemctl start "$service" 2>/dev/null || true
                log_info "Resumed: $service"
            fi
        done
    fi
}

# ============================================================
# Transparent Huge Pages
# ============================================================

get_thp_status() {
    if [ -f /sys/kernel/mm/transparent_hugepage/enabled ]; then
        cat /sys/kernel/mm/transparent_hugepage/enabled | grep -oP '\[\K[^\]]+'
    else
        echo "unavailable"
    fi
}

set_thp() {
    local mode=$1  # "always", "madvise", "never"
    if [ -f /sys/kernel/mm/transparent_hugepage/enabled ]; then
        $SUDO_CMD sh -c "echo $mode > /sys/kernel/mm/transparent_hugepage/enabled"
        log_info "Transparent Huge Pages: $mode"
    fi
}

# ============================================================
# NUMA Awareness
# ============================================================

get_numa_nodes() {
    if command -v numactl &> /dev/null; then
        numactl --hardware 2>/dev/null | grep "available:" | awk '{print $2}'
    else
        echo "1"
    fi
}

get_optimal_jobs() {
    # Calculate optimal -j value based on CPU cores and memory
    # Rule: Leave 1-2 cores for system, ensure at least 2GB per job
    local cores=$NUM_CORES
    local mem_gb=$TOTAL_MEM_GB
    
    # Memory-based limit (2GB per job for JUCE/C++ builds)
    local mem_jobs=$((mem_gb / 2))
    
    # CPU-based limit (leave 1 core free for system)
    local cpu_jobs=$((cores - 1))
    
    # Take the minimum
    local optimal=$((mem_jobs < cpu_jobs ? mem_jobs : cpu_jobs))
    
    # Minimum of 2
    [ $optimal -lt 2 ] && optimal=2
    
    echo $optimal
}

# ============================================================
# Main Actions
# ============================================================

show_status() {
    log_header "JUCE Build Tuner - Current Status"
    
    echo ""
    echo -e "${CYAN}System Info:${NC}"
    echo "  CPU: $(grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2 | xargs)"
    echo "  Cores: $NUM_CORES"
    echo "  Memory: ${TOTAL_MEM_GB}GB ($(get_memory_usage)MB used)"
    echo "  Optimal -j: $(get_optimal_jobs)"
    
    echo ""
    echo -e "${CYAN}Current Settings:${NC}"
    echo "  CPU Governor: $(get_current_governor)"
    echo "  Turbo Boost: $(get_turbo_status)"
    echo "  I/O Scheduler: $(get_io_scheduler)"
    echo "  THP: $(get_thp_status)"
    echo "  Swappiness: $(cat /proc/sys/vm/swappiness)"
    echo "  Dirty Ratio: $(cat /proc/sys/vm/dirty_ratio)"
    
    echo ""
    echo -e "${CYAN}MAP2 Application:${NC}"
    local backend_pids=$(lsof -t -i :$BACKEND_PORT 2>/dev/null || true)
    local frontend_pids=$(lsof -t -i :$FRONTEND_PORT 2>/dev/null || true)
    if [ -n "$backend_pids" ]; then
        echo -e "  Backend:  ${GREEN}RUNNING${NC} (port $BACKEND_PORT, PID: $backend_pids)"
    else
        echo -e "  Backend:  ${YELLOW}STOPPED${NC}"
    fi
    if [ -n "$frontend_pids" ]; then
        echo -e "  Frontend: ${GREEN}RUNNING${NC} (port $FRONTEND_PORT, PID: $frontend_pids)"
    else
        echo -e "  Frontend: ${YELLOW}STOPPED${NC}"
    fi
    
    echo ""
    if is_optimized; then
        echo -e "${GREEN}Build Optimization: ACTIVE${NC}"
        echo "  (Backend/Frontend have been stopped to free memory)"
    else
        echo -e "${YELLOW}Build Optimization: INACTIVE${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}ccache Status:${NC}"
    if command -v ccache &> /dev/null; then
        ccache --show-stats 2>/dev/null | head -10 || echo "  Not configured"
    else
        echo "  Not installed"
    fi
}

enable_optimization() {
    log_header "Enabling JUCE Build Optimization"
    
    check_root
    
    if is_optimized; then
        log_warn "Optimization already enabled. Use 'off' first to reset."
        return 1
    fi
    
    # Clear any stale state
    clear_state
    
    echo ""
    echo -e "${CYAN}Phase 1: CPU Optimization${NC}"
    
    # Save and set CPU governor
    local current_gov=$(get_current_governor)
    if [ "$current_gov" != "unavailable" ]; then
        save_state "cpu_governor" "$current_gov"
        set_governor "performance"
    fi
    
    # Enable turbo boost
    local current_turbo=$(get_turbo_status)
    if [ "$current_turbo" != "unavailable" ]; then
        save_state "turbo_boost" "$current_turbo"
        set_turbo on
    fi
    
    echo ""
    echo -e "${CYAN}Phase 2: MAP2 Application Shutdown${NC}"
    
    # Record memory before shutdown
    local mem_before=$(get_memory_usage)
    
    # Stop backend and frontend FIRST to free memory
    stop_map2_backend
    stop_map2_frontend
    kill_node_processes
    
    # Report memory freed
    sleep 2
    local mem_after=$(get_memory_usage)
    local mem_freed=$((mem_before - mem_after))
    if [ $mem_freed -gt 0 ]; then
        log_info "Memory freed: ${mem_freed}MB"
    fi
    
    echo ""
    echo -e "${CYAN}Phase 3: Memory Optimization${NC}"
    
    # Tune VM settings
    tune_vm_for_build
    
    # Configure THP for build (madvise = app-controlled)
    local current_thp=$(get_thp_status)
    if [ "$current_thp" != "unavailable" ]; then
        save_state "thp_mode" "$current_thp"
        set_thp "madvise"
    fi
    
    # Drop caches to free up memory (after apps are stopped)
    drop_caches
    
    echo ""
    echo -e "${CYAN}Phase 4: I/O Optimization${NC}"
    
    # Set I/O scheduler
    local current_sched=$(get_io_scheduler)
    if [ "$current_sched" != "unavailable" ]; then
        save_state "io_scheduler" "$current_sched"
        set_io_scheduler "mq-deadline"
    fi
    
    echo ""
    echo -e "${CYAN}Phase 5: Service Management${NC}"
    
    # Pause non-essential services
    pause_services
    
    echo ""
    echo -e "${CYAN}Phase 6: Build Environment${NC}"
    
    # Setup ccache
    setup_ccache
    
    # Mark as optimized
    save_state "JUCE_BUILD_OPTIMIZED" "1"
    save_state "OPTIMIZATION_TIME" "$(date +%s)"
    
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  BUILD OPTIMIZATION ENABLED${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Recommended build command:"
    echo ""
    echo -e "  ${BOLD}nice -n -10 make -j$(get_optimal_jobs) VERBOSE=1${NC}"
    echo ""
    echo "Or with ionice for I/O priority:"
    echo ""
    echo -e "  ${BOLD}nice -n -10 ionice -c2 -n0 make -j$(get_optimal_jobs)${NC}"
    echo ""
    echo "Remember to run './juce-build-tune.sh off' when finished!"
}

disable_optimization() {
    log_header "Disabling JUCE Build Optimization"
    
    check_root
    
    if ! is_optimized; then
        log_warn "Optimization not currently enabled."
        return 0
    fi
    
    echo ""
    echo -e "${CYAN}Restoring original settings...${NC}"
    
    # Restore CPU governor
    local saved_gov=$(load_state "cpu_governor")
    if [ -n "$saved_gov" ]; then
        set_governor "$saved_gov"
    fi
    
    # Restore turbo boost
    local saved_turbo=$(load_state "turbo_boost")
    if [ "$saved_turbo" = "disabled" ]; then
        set_turbo off
    fi
    
    # Restore VM settings
    restore_vm_settings
    
    # Restore THP
    local saved_thp=$(load_state "thp_mode")
    if [ -n "$saved_thp" ]; then
        set_thp "$saved_thp"
    fi
    
    # Restore I/O scheduler
    local saved_sched=$(load_state "io_scheduler")
    if [ -n "$saved_sched" ]; then
        set_io_scheduler "$saved_sched"
    fi
    
    # Resume services
    resume_services
    
    echo ""
    echo -e "${CYAN}Restarting MAP2 Application...${NC}"
    
    # Restart backend and frontend if they were running
    start_map2_backend
    start_map2_frontend
    
    # Clear state
    clear_state
    
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  NORMAL OPERATION RESTORED${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "MAP2 Services:"
    echo "  Backend:  http://localhost:$BACKEND_PORT"
    echo "  Frontend: http://localhost:$FRONTEND_PORT"
    echo "  Logs:     tail -f /tmp/map2-backend.log /tmp/map2-frontend.log"
}

run_build() {
    log_header "JUCE Build with Automatic Optimization"
    
    local build_dir="${1:-$JUCE_BUILD_DIR}"
    
    if [ ! -d "$build_dir" ]; then
        log_error "Build directory not found: $build_dir"
        log_info "Run cmake first to configure the build"
        exit 1
    fi
    
    # Enable optimization
    enable_optimization
    
    echo ""
    log_header "Starting Build"
    
    local start_time=$(date +%s)
    local optimal_jobs=$(get_optimal_jobs)
    
    # Change to build directory and run make
    cd "$build_dir"
    
    echo ""
    log_info "Building with -j$optimal_jobs..."
    echo ""
    
    # Run the build with nice and ionice
    local build_result=0
    nice -n -10 ionice -c2 -n0 make -j$optimal_jobs || build_result=$?
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local minutes=$((duration / 60))
    local seconds=$((duration % 60))
    
    # Disable optimization
    disable_optimization
    
    echo ""
    if [ $build_result -eq 0 ]; then
        echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
        echo -e "${GREEN}  BUILD SUCCESSFUL${NC}"
        echo -e "${GREEN}  Duration: ${minutes}m ${seconds}s${NC}"
        echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    else
        echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
        echo -e "${RED}  BUILD FAILED (exit code: $build_result)${NC}"
        echo -e "${RED}  Duration: ${minutes}m ${seconds}s${NC}"
        echo -e "${RED}═══════════════════════════════════════════════════════════${NC}"
        exit $build_result
    fi
}

show_help() {
    echo "JUCE Build Performance Tuner"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  on      Enable build optimization (requires sudo)"
    echo "  off     Restore normal operation and restart MAP2"
    echo "  status  Show current system state and MAP2 status"
    echo "  build   Enable optimization, run build, then restore"
    echo "  help    Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 on                    # Enable optimization"
    echo "  make -j\$(nproc)          # Run your build"
    echo "  $0 off                   # Restore when done"
    echo ""
    echo "  $0 build                 # All-in-one: optimize, build, restore"
    echo "  $0 build /path/to/build  # Specify build directory"
    echo ""
    echo "Optimizations applied (on):"
    echo "  - Stop MAP2 backend (port 8080) and frontend (port 3000)"
    echo "  - Kill Node.js processes to free memory"
    echo "  - CPU governor: performance (max frequency)"
    echo "  - Intel Turbo Boost: enabled"
    echo "  - I/O scheduler: mq-deadline"
    echo "  - VM tuning: low swappiness, high dirty ratio"
    echo "  - Cache drop before build"
    echo "  - ccache configuration"
    echo "  - Background service pause"
    echo ""
    echo "Restored (off):"
    echo "  - Restart MAP2 backend and frontend (if they were running)"
    echo "  - Restore all system settings to original values"
    echo "  - Resume paused services"
    echo ""
    echo "For JUCE builds, recommended command after 'on':"
    echo "  nice -n -10 make -j$(get_optimal_jobs)"
}

# ============================================================
# Main Entry Point
# ============================================================

case "${1:-status}" in
    on|enable)
        enable_optimization
        ;;
    off|disable|restore)
        disable_optimization
        ;;
    status|info)
        show_status
        ;;
    build|run)
        run_build "${2:-}"
        ;;
    help|-h|--help)
        show_help
        ;;
    *)
        echo "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac

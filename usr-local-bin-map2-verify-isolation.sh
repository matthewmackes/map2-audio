#!/bin/bash
# MAP2 Audio Platform - CPU Isolation & System Verification
# Location: /usr/local/bin/map2-verify-isolation.sh
#
# Description:
#   Verify that CPU isolation is properly configured for low-latency audio.
#   Checks kernel cmdline, systemd configuration, and reports actual system state.
#   Runs at boot and can be called manually to verify configuration.
#
# Usage:
#   /usr/local/bin/map2-verify-isolation.sh [--verbose] [--json]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Arguments
VERBOSE=${VERBOSE:-0}
JSON_OUTPUT=${JSON_OUTPUT:-0}
while [[ $# -gt 0 ]]; do
    case "$1" in
        --verbose) VERBOSE=1; shift ;;
        --json) JSON_OUTPUT=1; shift ;;
        *) shift ;;
    esac
done

log() {
    if [ $JSON_OUTPUT -eq 0 ]; then
        echo "[$(date +'%Y-%m-%d %H:%M:%S')] $@"
    fi
}

log_ok() {
    if [ $JSON_OUTPUT -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $@"
    fi
}

log_warn() {
    if [ $JSON_OUTPUT -eq 0 ]; then
        echo -e "${YELLOW}⚠${NC} $@"
    fi
}

log_error() {
    if [ $JSON_OUTPUT -eq 0 ]; then
        echo -e "${RED}✗${NC} $@"
    fi
}

# Get system mode
MODE=$(grep "^MODE=" /etc/guitarfx-mode.conf 2>/dev/null | cut -d'=' -f2 | tr -d ' ' || echo "unknown")
ISOLATED_CORES="4,5"
HOUSEKEEPING_CORES="0-3"

# Initialize results
declare -A results

results[mode]="$MODE"
results[isolation_ok]="false"
results[nmi_watchdog]="unknown"
results[irqbalance]="unknown"
results[realtime_budget]="unknown"
results[swap]="unknown"
results[thp]="unknown"
results[kernel_rt]="unknown"

log "==== MAP2 Audio Platform - System Verification ===="
log "Mode: $MODE"
log ""

# ============================================================================
# 1. Verify CPU Isolation Kernel Parameters
# ============================================================================
log "Checking CPU Isolation..."

if grep -q "isolcpus=" /proc/cmdline; then
    isolcpus=$(grep -o "isolcpus=[^ ]*" /proc/cmdline)
    log_ok "Kernel isolcpus: $isolcpus"
    results[isolcpus]="$isolcpus"
else
    log_warn "NO kernel isolcpus parameter found"
    results[isolcpus]="missing"
    if [ "$MODE" = "audio" ] || [ "$MODE" = "all-in-one" ]; then
        log_error "ERROR: isolcpus REQUIRED for low-latency audio!"
        results[isolation_ok]="false"
    fi
fi

if grep -q "nohz_full=" /proc/cmdline; then
    nohz=$(grep -o "nohz_full=[^ ]*" /proc/cmdline)
    log_ok "Kernel nohz_full: $nohz"
    results[nohz_full]="$nohz"
else
    log_warn "NO kernel nohz_full parameter (acceptable but suboptimal)"
    results[nohz_full]="missing"
fi

if grep -q "rcu_nocbs=" /proc/cmdline; then
    rcu=$(grep -o "rcu_nocbs=[^ ]*" /proc/cmdline)
    log_ok "Kernel rcu_nocbs: $rcu"
    results[rcu_nocbs]="$rcu"
else
    log_warn "NO kernel rcu_nocbs parameter"
    results[rcu_nocbs]="missing"
fi

if grep -q "threadirqs" /proc/cmdline; then
    log_ok "Kernel threadirqs: ENABLED"
    results[threadirqs]="enabled"
else
    log_warn "Kernel threadirqs: NOT FOUND"
    results[threadirqs]="disabled"
fi

log ""

# ============================================================================
# 2. Verify Realtime Scheduling Configuration
# ============================================================================
log "Checking Realtime Scheduling..."

rt_runtime=$(sysctl -n kernel.sched_rt_runtime_us 2>/dev/null || echo "unknown")
rt_period=$(sysctl -n kernel.sched_rt_period_us 2>/dev/null || echo "unknown")

if [ "$rt_runtime" = "2950000" ] && [ "$rt_period" = "3000000" ]; then
    log_ok "RT Budget: $rt_runtime / $rt_period (correct)"
    results[realtime_budget]="tuned"
else
    log_warn "RT Budget: $rt_runtime / $rt_period (should be 2950000 / 3000000)"
    results[realtime_budget]="suboptimal"
fi

log ""

# ============================================================================
# 3. Verify Memory & Swap Configuration
# ============================================================================
log "Checking Memory Configuration..."

swappiness=$(cat /proc/sys/vm/swappiness 2>/dev/null || echo "unknown")
if [ "$swappiness" = "0" ]; then
    log_ok "Swappiness: $swappiness (disabled)"
    results[swap]="disabled"
else
    log_warn "Swappiness: $swappiness (should be 0)"
    results[swap]="enabled"
fi

thp=$(cat /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null || echo "unknown")
if [[ "$thp" == *"never"* ]]; then
    log_ok "THP: disabled"
    results[thp]="disabled"
else
    log_warn "THP: $thp (should be never)"
    results[thp]="enabled"
fi

hugepages=$(grep "^vm.nr_hugepages" /proc/meminfo | awk '{print $2}')
log_ok "Hugepages allocated: $hugepages"
results[hugepages]="$hugepages"

log ""

# ============================================================================
# 4. Verify Watchdog & NMI Configuration
# ============================================================================
log "Checking Watchdog Configuration..."

nmi=$(cat /proc/sys/kernel/nmi_watchdog 2>/dev/null || echo "unknown")
if [ "$nmi" = "0" ]; then
    log_ok "NMI Watchdog: disabled"
    results[nmi_watchdog]="disabled"
else
    log_warn "NMI Watchdog: $nmi (should be 0)"
    results[nmi_watchdog]="enabled"
fi

log ""

# ============================================================================
# 5. Verify IRQ Balance Configuration
# ============================================================================
log "Checking IRQ Balance..."

if systemctl is-active irqbalance.service &>/dev/null; then
    if grep -q "IRQBALANCE_BANNED_CPUS=0x30" /etc/default/irqbalance 2>/dev/null; then
        log_ok "irqbalance: running with isolated cores banned"
        results[irqbalance]="configured"
    else
        log_warn "irqbalance: running but cores 4-5 NOT banned"
        results[irqbalance]="not_configured"
    fi
else
    log_warn "irqbalance: service not running"
    results[irqbalance]="stopped"
fi

log ""

# ============================================================================
# 6. Verify Systemd Service Configuration
# ============================================================================
log "Checking Systemd Service Configuration..."

if [ -f /etc/systemd/system/map2-backend.service.d/audio-mode-override.conf ]; then
    if grep -q "CPUAffinity=4 5" /etc/systemd/system/map2-backend.service.d/audio-mode-override.conf; then
        log_ok "map2-backend: CPU affinity to cores 4-5 configured"
        results[service_affinity]="configured"
    else
        log_warn "map2-backend: CPU affinity NOT properly configured"
        results[service_affinity]="misconfigured"
    fi
else
    log_warn "map2-backend: audio-mode-override.conf not found"
    results[service_affinity]="missing"
fi

log ""

# ============================================================================
# 7. Check Actual Runtime State
# ============================================================================
log "Checking Actual Runtime State..."

# Get backend PID
backend_pid=$(pgrep -f "uvicorn app.main" | head -1)
if [ -n "$backend_pid" ]; then
    backend_cpus=$(taskset -cp $backend_pid 2>/dev/null | grep -o "cpus: .*" || echo "unaffined")
    log_ok "Backend service (PID $backend_pid) CPU mask: $backend_cpus"
    results[backend_pid]="$backend_pid"
    results[backend_cpus]="$backend_cpus"
else
    log_warn "Backend service not running"
    results[backend_running]="false"
fi

# Get PipeWire PID
pipewire_pid=$(pgrep -f "^/usr/bin/pipewire$" | head -1)
if [ -n "$pipewire_pid" ]; then
    pipewire_cpus=$(taskset -cp $pipewire_pid 2>/dev/null | grep -o "cpus: .*" || echo "unaffined")
    log "PipeWire (PID $pipewire_pid) CPU mask: $pipewire_cpus"
    results[pipewire_pid]="$pipewire_pid"
else
    log_warn "PipeWire not running"
    results[pipewire_running]="false"
fi

log ""

# ============================================================================
# 8. Generate Summary
# ============================================================================
log "==== Verification Summary ===="

if [ "$MODE" = "audio" ] || [ "$MODE" = "all-in-one" ]; then
    # For audio modes, verify all critical items
    all_ok=true
    
    if ! grep -q "isolcpus=$ISOLATED_CORES" /proc/cmdline 2>/dev/null; then
        log_error "FAIL: CPU isolation not configured"
        all_ok=false
    fi
    
    if [ "$(cat /proc/sys/vm/swappiness)" != "0" ]; then
        log_error "FAIL: Swap not disabled"
        all_ok=false
    fi
    
    if [ "$all_ok" = true ]; then
        log_ok "All critical checks PASSED for $MODE mode"
        results[overall]="PASS"
    else
        log_error "Some critical checks FAILED"
        results[overall]="FAIL"
    fi
else
    log_ok "Mode: $MODE (no specific verification needed)"
    results[overall]="N/A"
fi

log ""

# ============================================================================
# 9. JSON Output (if requested)
# ============================================================================
if [ $JSON_OUTPUT -eq 1 ]; then
    echo "{"
    for key in "${!results[@]}"; do
        echo "  \"$key\": \"${results[$key]}\","
    done
    echo "  \"timestamp\": \"$(date -Iseconds)\""
    echo "}"
fi

exit 0

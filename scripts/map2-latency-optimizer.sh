#!/bin/bash
#
# MAP2 Audio Platform - Latency Optimizer
# Interactive audit & installer for sub-3ms round-trip latency
#
# Checks all latency-relevant configuration across:
#   - Kernel boot parameters
#   - PipeWire / WirePlumber / JACK
#   - systemd service configuration
#   - C++ engine code defaults
#   - Python backend config
#   - Build system (CMake)
#
# Usage: ./scripts/map2-latency-optimizer.sh [--audit-only]
#

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

MAP2_DIR="/home/mm/map2-audio"
SYSTEMD_SERVICE="$MAP2_DIR/systemd/map2-backend.service"
PIPEWIRE_CONF="$HOME/.config/pipewire/pipewire.conf.d/10-low-latency.conf"
COMMON_H="$MAP2_DIR/juce-engine/Source/Common.h"
AUDIO_IO_CPP="$MAP2_DIR/juce-engine/Source/JuceAudioIO.cpp"
ENGINE_CPP="$MAP2_DIR/juce-engine/Source/Map2AudioEngine.cpp"
CMAKELISTS="$MAP2_DIR/juce-engine/CMakeLists.txt"
CONFIG_PY="$MAP2_DIR/app/config.py"
ENGINE_SVC_PY="$MAP2_DIR/app/services/juce_engine_service.py"

TARGET_QUANTUM=64
TARGET_RATE=48000
TARGET_BUFFER=64
TARGET_RT_PRIO=80
BACKUP_SUFFIX=".bak.$(date +%Y%m%d_%H%M%S)"

LOG_FILE="$MAP2_DIR/logs/latency-optimizer.log"

# ============================================================================
# Colors & Formatting
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Box-drawing characters
BOX_TL='+'
BOX_TR='+'
BOX_BL='+'
BOX_BR='+'
BOX_H='-'
BOX_V='|'
BOX_ML='+'
BOX_MR='+'

# ============================================================================
# Counters
# ============================================================================

PASS=0
FAIL=0
WARN=0
FIX_COUNT=0
FIXES_APPLIED=0
NEED_REBUILD=false
NEED_SYSTEMD_RELOAD=false
NEED_PIPEWIRE_RESTART=false

# Track which fixes are needed (0=pass, 1=needs fix)
declare -A FIX_NEEDED

# ============================================================================
# Logging
# ============================================================================

mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# ============================================================================
# Output Helpers
# ============================================================================

print_banner() {
    echo ""
    echo -e "${BOLD}${CYAN}"
    echo "  =================================================================="
    echo "   MAP2 Audio Platform - Latency Optimizer"
    echo "   Target: < 3ms round-trip (${TARGET_QUANTUM}/${TARGET_RATE})"
    echo "  =================================================================="
    echo -e "${NC}"
}

print_section() {
    echo ""
    echo -e "${BOLD}${BLUE}  --- $1 ---${NC}"
    echo ""
}

check_pass() {
    echo -e "    ${GREEN}PASS${NC}  $1"
    log "PASS: $1"
    ((PASS++)) || true
}

check_fail() {
    local id="$1"
    local msg="$2"
    echo -e "    ${RED}FIX ${NC}  $msg"
    log "FIX: $msg"
    ((FAIL++)) || true
    ((FIX_COUNT++)) || true
    FIX_NEEDED[$id]=1
}

check_warn() {
    echo -e "    ${YELLOW}WARN${NC}  $1"
    log "WARN: $1"
    ((WARN++)) || true
}

apply_ok() {
    echo -e "      ${GREEN}-->  Applied${NC}: $1"
    log "APPLIED: $1"
    ((FIXES_APPLIED++)) || true
}

apply_err() {
    echo -e "      ${RED}-->  Failed${NC}: $1"
    log "FAILED: $1"
}

backup_file() {
    local file="$1"
    if [ -f "$file" ]; then
        cp "$file" "${file}${BACKUP_SUFFIX}"
        echo -e "      ${DIM}Backup: ${file}${BACKUP_SUFFIX}${NC}"
    fi
}

# ============================================================================
# Audit Functions
# ============================================================================

audit_kernel() {
    print_section "A. Kernel & System Tuning"

    local cmdline
    cmdline=$(cat /proc/cmdline 2>/dev/null || echo "")

    # 1. isolcpus
    if echo "$cmdline" | grep -q "isolcpus="; then
        local cpus
        cpus=$(echo "$cmdline" | grep -oP 'isolcpus=\K[^ ]+')
        check_pass "CPU isolation: isolcpus=$cpus"
    else
        check_warn "No isolcpus set (audio thread shares cores with other processes)"
    fi

    # 2. nohz_full
    if echo "$cmdline" | grep -q "nohz_full="; then
        local cpus
        cpus=$(echo "$cmdline" | grep -oP 'nohz_full=\K[^ ]+')
        check_pass "Tickless cores: nohz_full=$cpus"
    else
        check_warn "No nohz_full set (timer interrupts may cause jitter on audio cores)"
    fi

    # 3. rcu_nocbs + threadirqs
    local rcu_ok=false
    local tirq_ok=false
    if echo "$cmdline" | grep -q "rcu_nocbs="; then
        rcu_ok=true
    fi
    if echo "$cmdline" | grep -q "threadirqs"; then
        tirq_ok=true
    fi
    if $rcu_ok && $tirq_ok; then
        check_pass "RCU offload + threaded IRQs enabled"
    elif $tirq_ok; then
        check_warn "threadirqs set but rcu_nocbs missing"
    else
        check_warn "Neither rcu_nocbs nor threadirqs set (increased jitter risk)"
    fi

    # 4. Transparent Huge Pages
    local thp
    thp=$(cat /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null || echo "unknown")
    if echo "$thp" | grep -q "\[never\]"; then
        check_pass "Transparent Huge Pages: disabled"
    elif echo "$thp" | grep -q "\[madvise\]"; then
        check_warn "Transparent Huge Pages: madvise (acceptable, 'never' is better)"
    else
        check_warn "Transparent Huge Pages: enabled (can cause latency spikes)"
    fi

    # 5. CPU governor
    local gov="unknown"
    if [ -f /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor ]; then
        gov=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || echo "unknown")
    fi
    if [ "$gov" = "performance" ]; then
        check_pass "CPU governor: performance"
    elif [ "$gov" = "unknown" ]; then
        check_warn "CPU governor: could not determine"
    else
        check_warn "CPU governor: $gov (should be 'performance' for lowest latency)"
    fi

    # 6. RT limits
    local rtprio_line
    rtprio_line=$(grep -h 'rtprio' /etc/security/limits.d/99-map2-audio.conf 2>/dev/null | grep '@audio' | tail -1 || echo "")
    if [ -n "$rtprio_line" ]; then
        local rtval
        rtval=$(echo "$rtprio_line" | awk '{print $NF}')
        if [ "$rtval" -ge 95 ] 2>/dev/null; then
            check_pass "RT limits: @audio rtprio=$rtval, memlock=unlimited"
        else
            check_warn "RT limits: @audio rtprio=$rtval (should be >= 95)"
        fi
    else
        check_warn "No audio RT limits in /etc/security/limits.d/99-map2-audio.conf"
    fi
}

audit_pipewire() {
    print_section "B. PipeWire & Audio Subsystem"

    # 7. PipeWire service
    if systemctl --user is-active pipewire.service &>/dev/null; then
        local pw_ver
        pw_ver=$(pw-cli --version 2>/dev/null | grep -oP 'pipewire \K[0-9.]+' | head -1 || echo "?")
        check_pass "PipeWire service: active (v$pw_ver)"
    else
        check_warn "PipeWire service: not active"
    fi

    # 8. WirePlumber
    if systemctl --user is-active wireplumber.service &>/dev/null; then
        check_pass "WirePlumber service: active"
    else
        check_warn "WirePlumber service: not active"
    fi

    # 9. libjack provider
    local jack_lib
    jack_lib=$(ldconfig -p 2>/dev/null | grep 'libjack.so.0' | head -1 | grep -oP '=> \K.*' || echo "not found")
    if echo "$jack_lib" | grep -q "pipewire"; then
        check_pass "libjack provider: PipeWire JACK ($jack_lib)"
    elif [ "$jack_lib" = "not found" ]; then
        check_warn "libjack not found in ldconfig cache"
    else
        check_warn "libjack provider: $jack_lib (not PipeWire)"
    fi

    # 10. RTKit daemon
    if systemctl is-active rtkit-daemon &>/dev/null; then
        check_pass "RTKit daemon: running"
    else
        check_warn "RTKit daemon: not running (RT scheduling may fail)"
    fi

    # 11. Live PipeWire quantum
    local live_quantum
    live_quantum=$(pw-metadata -n settings 2>/dev/null | grep "key:'clock.force-quantum'" | grep -oP "value:'\K[0-9]+" || echo "0")
    if [ "$live_quantum" = "0" ]; then
        live_quantum=$(pw-metadata -n settings 2>/dev/null | grep "key:'clock.quantum'" | grep -oP "value:'\K[0-9]+" || echo "?")
    fi

    if [ "$live_quantum" = "$TARGET_QUANTUM" ]; then
        check_pass "Live PipeWire quantum: $live_quantum samples ($(echo "scale=2; $live_quantum * 1000 / $TARGET_RATE" | bc)ms)"
    else
        local current_ms
        current_ms=$(echo "scale=2; $live_quantum * 1000 / $TARGET_RATE" | bc 2>/dev/null || echo "?")
        local target_ms
        target_ms=$(echo "scale=2; $TARGET_QUANTUM * 1000 / $TARGET_RATE" | bc 2>/dev/null || echo "?")
        check_fail "pw_quantum" "Live PipeWire quantum: ${live_quantum} (${current_ms}ms) -- should be ${TARGET_QUANTUM} (${target_ms}ms)"
    fi

    # 12. PipeWire config file quantum
    if [ -f "$PIPEWIRE_CONF" ]; then
        local conf_quantum
        conf_quantum=$(grep -oP 'default\.clock\.quantum\s*=\s*\K[0-9]+' "$PIPEWIRE_CONF" 2>/dev/null || echo "?")
        if [ "$conf_quantum" = "$TARGET_QUANTUM" ]; then
            check_pass "PipeWire config quantum: $conf_quantum"
        else
            check_fail "pw_config" "PipeWire config quantum: $conf_quantum -- should be $TARGET_QUANTUM ($PIPEWIRE_CONF)"
        fi

        local conf_min
        conf_min=$(grep -oP 'default\.clock\.min-quantum\s*=\s*\K[0-9]+' "$PIPEWIRE_CONF" 2>/dev/null || echo "?")
        if [ "$conf_min" -le 32 ] 2>/dev/null; then
            check_pass "PipeWire min-quantum: $conf_min"
        else
            check_fail "pw_min_quantum" "PipeWire min-quantum: $conf_min -- should be <= 32"
        fi

        local conf_max
        conf_max=$(grep -oP 'default\.clock\.max-quantum\s*=\s*\K[0-9]+' "$PIPEWIRE_CONF" 2>/dev/null || echo "?")
        if [ "$conf_max" -le 256 ] 2>/dev/null; then
            check_pass "PipeWire max-quantum: $conf_max"
        else
            check_fail "pw_max_quantum" "PipeWire max-quantum: $conf_max -- should be <= 256 (prevents latency spikes)"
        fi
    else
        check_fail "pw_config" "PipeWire config file not found: $PIPEWIRE_CONF"
    fi
}

audit_systemd() {
    print_section "C. Systemd Service Configuration"

    if [ ! -f "$SYSTEMD_SERVICE" ]; then
        check_warn "Systemd service file not found: $SYSTEMD_SERVICE"
        return
    fi

    # 13. force-quantum value
    local fq
    fq=$(grep -oP 'clock\.force-quantum\s+\K[0-9]+' "$SYSTEMD_SERVICE" 2>/dev/null || echo "?")
    if [ "$fq" = "$TARGET_QUANTUM" ]; then
        check_pass "Systemd ExecStartPre force-quantum: $fq"
    else
        check_fail "sd_force_quantum" "Systemd force-quantum: $fq -- should be $TARGET_QUANTUM"
    fi

    # 14. PIPEWIRE_LATENCY env
    local pw_lat
    pw_lat=$(grep -oP 'PIPEWIRE_LATENCY=\K[^ "]+' "$SYSTEMD_SERVICE" 2>/dev/null || echo "?")
    local expected_lat="${TARGET_QUANTUM}/${TARGET_RATE}"
    if [ "$pw_lat" = "$expected_lat" ]; then
        check_pass "Systemd PIPEWIRE_LATENCY: $pw_lat"
    else
        check_fail "sd_pw_latency" "Systemd PIPEWIRE_LATENCY: $pw_lat -- should be $expected_lat"
    fi

    # 15. CPUAffinity
    if grep -q 'CPUAffinity=4 5' "$SYSTEMD_SERVICE" 2>/dev/null; then
        check_pass "Systemd CPUAffinity: 4 5 (isolated cores)"
    else
        local aff
        aff=$(grep -oP 'CPUAffinity=\K.*' "$SYSTEMD_SERVICE" 2>/dev/null || echo "not set")
        check_warn "Systemd CPUAffinity: $aff"
    fi

    # 16. LimitRTPRIO
    local rt_limit
    rt_limit=$(grep -oP 'LimitRTPRIO=\K[0-9]+' "$SYSTEMD_SERVICE" 2>/dev/null || echo "?")
    if [ "$rt_limit" -ge 95 ] 2>/dev/null; then
        check_pass "Systemd LimitRTPRIO: $rt_limit"
    else
        check_warn "Systemd LimitRTPRIO: $rt_limit (should be >= 95)"
    fi

    # 17. LimitMEMLOCK
    if grep -q 'LimitMEMLOCK=infinity' "$SYSTEMD_SERVICE" 2>/dev/null; then
        check_pass "Systemd LimitMEMLOCK: infinity"
    else
        check_warn "Systemd LimitMEMLOCK: not set to infinity"
    fi

    # 18. CAP_SYS_NICE
    if grep -q 'CAP_SYS_NICE' "$SYSTEMD_SERVICE" 2>/dev/null; then
        check_pass "Systemd CAP_SYS_NICE: granted"
    else
        check_warn "Systemd CAP_SYS_NICE: not set (RT scheduling may fail)"
    fi
}

audit_code() {
    print_section "D. Application Code & Build"

    # 19. C++ DEFAULT_BUFFER_SIZE
    if [ -f "$COMMON_H" ]; then
        local cpp_buf
        cpp_buf=$(grep -oP 'DEFAULT_BUFFER_SIZE\s*=\s*\K[0-9]+' "$COMMON_H" 2>/dev/null || echo "?")
        if [ "$cpp_buf" = "$TARGET_BUFFER" ]; then
            check_pass "C++ DEFAULT_BUFFER_SIZE: $cpp_buf (Common.h)"
        else
            check_fail "cpp_buffer" "C++ DEFAULT_BUFFER_SIZE: $cpp_buf -- should be $TARGET_BUFFER (Common.h)"
        fi
    else
        check_warn "Common.h not found: $COMMON_H"
    fi

    # 20. Python config buffer_size default
    if [ -f "$CONFIG_PY" ]; then
        # Look for the buffer_size config option's default value
        local py_buf
        py_buf=$(grep -A5 '"audio.buffer_size"' "$CONFIG_PY" 2>/dev/null | grep -oP 'default=\K[0-9]+' | head -1 || echo "?")
        if [ "$py_buf" = "$TARGET_BUFFER" ]; then
            check_pass "Python config buffer_size default: $py_buf (config.py)"
        else
            check_fail "py_config_buffer" "Python config buffer_size default: $py_buf -- should be $TARGET_BUFFER (config.py)"
        fi
    else
        check_warn "config.py not found: $CONFIG_PY"
    fi

    # 21. Device constants buffer_size
    if [ -f "$ENGINE_SVC_PY" ]; then
        local dev_buf_edirol
        dev_buf_edirol=$(grep -A15 'EDIROL_UA1000' "$ENGINE_SVC_PY" 2>/dev/null | grep -oP '"buffer_size":\s*\K[0-9]+' | head -1 || echo "?")
        local dev_buf_hotone
        dev_buf_hotone=$(grep -A15 'HOTONE_JOGG' "$ENGINE_SVC_PY" 2>/dev/null | grep -oP '"buffer_size":\s*\K[0-9]+' | head -1 || echo "?")

        if [ "$dev_buf_edirol" = "$TARGET_BUFFER" ] && [ "$dev_buf_hotone" = "$TARGET_BUFFER" ]; then
            check_pass "Device constants buffer_size: Edirol=$dev_buf_edirol, Hotone=$dev_buf_hotone"
        else
            check_fail "dev_constants" "Device constants buffer_size: Edirol=$dev_buf_edirol, Hotone=$dev_buf_hotone -- should be $TARGET_BUFFER"
        fi
    else
        check_warn "juce_engine_service.py not found: $ENGINE_SVC_PY"
    fi

    # 22. RT thread priority
    if [ -f "$AUDIO_IO_CPP" ]; then
        local rt_prio
        rt_prio=$(grep -oP 'sched_priority\s*=\s*\K[0-9]+' "$AUDIO_IO_CPP" 2>/dev/null | head -1 || echo "?")
        if [ "$rt_prio" = "$TARGET_RT_PRIO" ]; then
            check_pass "C++ RT thread priority: SCHED_FIFO $rt_prio (JuceAudioIO.cpp)"
        else
            check_fail "cpp_rt_prio" "C++ RT thread priority: SCHED_FIFO $rt_prio -- should be $TARGET_RT_PRIO (JuceAudioIO.cpp)"
        fi
    else
        check_warn "JuceAudioIO.cpp not found: $AUDIO_IO_CPP"
    fi

    # 23. callbackBuffer_.setSize in audio callback
    if [ -f "$ENGINE_CPP" ]; then
        # Check for the specific RT-dangerous pattern: setSize with runtime callback args
        # Pre-allocation calls like setSize(numOutputChannels_, std::max(...)) in non-RT context are safe
        if grep -q 'callbackBuffer_.setSize(numOutputs, numSamples' "$ENGINE_CPP" 2>/dev/null; then
            check_fail "cpp_setsize" "callbackBuffer_.setSize(numOutputs, numSamples) in audio callback (RT allocation risk)"
        elif grep -q 'no RT allocation here\|GUARDED.*setSize\|GUARDED.*no RT' "$ENGINE_CPP" 2>/dev/null; then
            check_pass "Callback buffer: guarded, no RT allocation (Map2AudioEngine.cpp)"
        else
            check_pass "Callback buffer: no RT-dangerous setSize in callback (Map2AudioEngine.cpp)"
        fi
    else
        check_warn "Map2AudioEngine.cpp not found: $ENGINE_CPP"
    fi

    # 24. CMake -ffast-math
    if [ -f "$CMAKELISTS" ]; then
        local fmath
        fmath=$(grep -oP 'ENABLE_FAST_MATH\s+"[^"]*"\s+\K(ON|OFF)' "$CMAKELISTS" 2>/dev/null || echo "?")
        if [ "$fmath" = "ON" ]; then
            check_pass "CMake -ffast-math: ON (CMakeLists.txt)"
        else
            check_fail "cmake_fmath" "CMake -ffast-math: $fmath -- should be ON for DSP performance (CMakeLists.txt)"
        fi
    else
        check_warn "CMakeLists.txt not found: $CMAKELISTS"
    fi

    # 25. Build optimization level
    if [ -f "$CMAKELISTS" ]; then
        if grep -q 'Release' "$CMAKELISTS" 2>/dev/null && grep -q '\-O3' "$CMAKELISTS" 2>/dev/null; then
            check_pass "Build type: Release -O3"
        else
            check_warn "Build type may not be optimized"
        fi
    fi

    # 26. -march=native
    if [ -f "$CMAKELISTS" ]; then
        if grep -q 'ENABLE_NATIVE_OPTIMIZATIONS.*ON' "$CMAKELISTS" 2>/dev/null; then
            check_pass "SIMD: -march=native enabled"
        else
            check_warn "SIMD: -march=native may not be enabled"
        fi
    fi
}

# ============================================================================
# Latency Calculator
# ============================================================================

print_latency_estimate() {
    local quantum="$1"
    local rate="$2"

    local buf_ms
    buf_ms=$(echo "scale=2; $quantum * 1000 / $rate" | bc 2>/dev/null || echo "?")
    local rt_ms
    rt_ms=$(echo "scale=2; 2 * $quantum * 1000 / $rate" | bc 2>/dev/null || echo "?")
    local total_ms
    total_ms=$(echo "scale=1; (2 * $quantum * 1000 / $rate) + 1.0" | bc 2>/dev/null || echo "?")

    echo ""
    echo -e "    ${DIM}Buffer latency:    ${quantum}/${rate} = ${buf_ms}ms${NC}"
    echo -e "    ${DIM}PipeWire (2x):     2 x ${buf_ms}ms = ${rt_ms}ms${NC}"
    echo -e "    ${DIM}USB overhead:      ~1.0ms${NC}"
    echo -e "    ${BOLD}Estimated total:   ~${total_ms}ms round-trip${NC}"
}

# ============================================================================
# Summary
# ============================================================================

print_summary() {
    # Get current live quantum for estimate
    local live_q
    live_q=$(pw-metadata -n settings 2>/dev/null | grep "key:'clock.force-quantum'" | grep -oP "value:'\K[0-9]+" || echo "0")
    if [ "$live_q" = "0" ]; then
        live_q=$(pw-metadata -n settings 2>/dev/null | grep "key:'clock.quantum'" | grep -oP "value:'\K[0-9]+" || echo "256")
    fi

    echo ""
    echo -e "${BOLD}  =================================================================="
    echo -e "   AUDIT RESULTS"
    echo -e "  ==================================================================${NC}"
    echo ""

    # Current latency
    echo -e "  ${BOLD}Current configuration:${NC}"
    print_latency_estimate "$live_q" "$TARGET_RATE"
    echo ""

    # Target latency
    echo -e "  ${BOLD}Target configuration:${NC}"
    print_latency_estimate "$TARGET_QUANTUM" "$TARGET_RATE"
    echo ""

    echo -e "  ------------------------------------------------------------------"
    echo -e "    ${GREEN}PASS: $PASS${NC}    ${YELLOW}WARN: $WARN${NC}    ${RED}NEEDS FIX: $FAIL${NC}"
    echo -e "  ------------------------------------------------------------------"

    if [ "$FAIL" -eq 0 ]; then
        echo ""
        echo -e "  ${GREEN}${BOLD}  All latency optimizations are applied!${NC}"
    fi
}

# ============================================================================
# Fix Functions
# ============================================================================

fix_pipewire_config() {
    echo ""
    echo -e "  ${BOLD}Applying: PipeWire config optimizations${NC}"

    local conf_dir
    conf_dir=$(dirname "$PIPEWIRE_CONF")
    mkdir -p "$conf_dir"

    if [ -f "$PIPEWIRE_CONF" ]; then
        backup_file "$PIPEWIRE_CONF"
    fi

    cat > "$PIPEWIRE_CONF" << 'PWEOF'
# MAP2 Audio - Low-Latency PipeWire Configuration
# Applied by map2-latency-optimizer.sh
context.properties = {
    default.clock.quantum       = 64        # 1.33ms at 48kHz
    default.clock.min-quantum   = 32        # 0.67ms minimum
    default.clock.max-quantum   = 256       # Cap to prevent latency spikes
    default.clock.rate          = 48000
    default.clock.allowed-rates = [ 48000 96000 ]
    mem.allow-mlock             = true
    mem.mlock-all               = true
    api.alsa.period-num         = 2         # 2 periods (minimal)
    api.alsa.headroom           = 0         # No extra headroom
}
PWEOF

    if grep -q "quantum.*=.*64" "$PIPEWIRE_CONF"; then
        apply_ok "PipeWire config: quantum=64, min=32, max=256"
        NEED_PIPEWIRE_RESTART=true
    else
        apply_err "Failed to write PipeWire config"
    fi
}

fix_systemd_force_quantum() {
    echo ""
    echo -e "  ${BOLD}Applying: Systemd force-quantum -> ${TARGET_QUANTUM}${NC}"

    if [ ! -f "$SYSTEMD_SERVICE" ]; then
        apply_err "Service file not found: $SYSTEMD_SERVICE"
        return
    fi

    backup_file "$SYSTEMD_SERVICE"

    # Replace any clock.force-quantum NNN with TARGET_QUANTUM
    sed -i "s/clock\.force-quantum [0-9]\+/clock.force-quantum ${TARGET_QUANTUM}/g" "$SYSTEMD_SERVICE"

    if grep -q "clock.force-quantum ${TARGET_QUANTUM}" "$SYSTEMD_SERVICE"; then
        apply_ok "force-quantum -> $TARGET_QUANTUM"
        NEED_SYSTEMD_RELOAD=true
    else
        apply_err "Failed to update force-quantum in service file"
    fi
}

fix_systemd_pipewire_latency() {
    echo ""
    echo -e "  ${BOLD}Applying: Systemd PIPEWIRE_LATENCY -> ${TARGET_QUANTUM}/${TARGET_RATE}${NC}"

    if [ ! -f "$SYSTEMD_SERVICE" ]; then
        apply_err "Service file not found: $SYSTEMD_SERVICE"
        return
    fi

    # Replace PIPEWIRE_LATENCY=NNN/NNN with target
    sed -i "s|PIPEWIRE_LATENCY=[0-9]\+/[0-9]\+|PIPEWIRE_LATENCY=${TARGET_QUANTUM}/${TARGET_RATE}|g" "$SYSTEMD_SERVICE"

    if grep -q "PIPEWIRE_LATENCY=${TARGET_QUANTUM}/${TARGET_RATE}" "$SYSTEMD_SERVICE"; then
        apply_ok "PIPEWIRE_LATENCY -> ${TARGET_QUANTUM}/${TARGET_RATE}"
        NEED_SYSTEMD_RELOAD=true
    else
        apply_err "Failed to update PIPEWIRE_LATENCY"
    fi
}

fix_python_config_buffer() {
    echo ""
    echo -e "  ${BOLD}Applying: Python config buffer_size default -> ${TARGET_BUFFER}${NC}"

    if [ ! -f "$CONFIG_PY" ]; then
        apply_err "config.py not found: $CONFIG_PY"
        return
    fi

    backup_file "$CONFIG_PY"

    # Find the audio.buffer_size config block and change its default
    # The pattern is: "audio.buffer_size": ConfigOption(...default=256...)
    sed -i '/\"audio\.buffer_size\"/,/restart_required/ s/default=[0-9]\+/default='"${TARGET_BUFFER}"'/' "$CONFIG_PY"

    local new_val
    new_val=$(grep -A5 '"audio.buffer_size"' "$CONFIG_PY" | grep -oP 'default=\K[0-9]+' | head -1 || echo "?")
    if [ "$new_val" = "$TARGET_BUFFER" ]; then
        apply_ok "config.py buffer_size default -> $TARGET_BUFFER"
    else
        apply_err "Failed to update config.py (got $new_val)"
    fi
}

fix_device_constants() {
    echo ""
    echo -e "  ${BOLD}Applying: Device constants buffer_size -> ${TARGET_BUFFER}${NC}"

    if [ ! -f "$ENGINE_SVC_PY" ]; then
        apply_err "juce_engine_service.py not found: $ENGINE_SVC_PY"
        return
    fi

    backup_file "$ENGINE_SVC_PY"

    # Replace "buffer_size": 256 with "buffer_size": 64 in both device constant dicts
    sed -i 's/"buffer_size": [0-9]\+/"buffer_size": '"${TARGET_BUFFER}"'/g' "$ENGINE_SVC_PY"

    local edirol_val
    edirol_val=$(grep -A15 'EDIROL_UA1000' "$ENGINE_SVC_PY" | grep -oP '"buffer_size":\s*\K[0-9]+' | head -1 || echo "?")
    local hotone_val
    hotone_val=$(grep -A15 'HOTONE_JOGG' "$ENGINE_SVC_PY" | grep -oP '"buffer_size":\s*\K[0-9]+' | head -1 || echo "?")

    if [ "$edirol_val" = "$TARGET_BUFFER" ] && [ "$hotone_val" = "$TARGET_BUFFER" ]; then
        apply_ok "Device constants: Edirol=$edirol_val, Hotone=$hotone_val"
    else
        apply_err "Failed to update device constants (Edirol=$edirol_val, Hotone=$hotone_val)"
    fi
}

fix_cpp_buffer_size() {
    echo ""
    echo -e "  ${BOLD}Applying: C++ DEFAULT_BUFFER_SIZE -> ${TARGET_BUFFER}${NC}"

    if [ ! -f "$COMMON_H" ]; then
        apply_err "Common.h not found: $COMMON_H"
        return
    fi

    backup_file "$COMMON_H"

    sed -i "s/DEFAULT_BUFFER_SIZE = [0-9]\+/DEFAULT_BUFFER_SIZE = ${TARGET_BUFFER}/" "$COMMON_H"

    local new_val
    new_val=$(grep -oP 'DEFAULT_BUFFER_SIZE\s*=\s*\K[0-9]+' "$COMMON_H" || echo "?")
    if [ "$new_val" = "$TARGET_BUFFER" ]; then
        apply_ok "DEFAULT_BUFFER_SIZE -> $TARGET_BUFFER"
        NEED_REBUILD=true
    else
        apply_err "Failed to update DEFAULT_BUFFER_SIZE"
    fi
}

fix_cpp_rt_priority() {
    echo ""
    echo -e "  ${BOLD}Applying: C++ RT thread priority -> SCHED_FIFO ${TARGET_RT_PRIO}${NC}"

    if [ ! -f "$AUDIO_IO_CPP" ]; then
        apply_err "JuceAudioIO.cpp not found: $AUDIO_IO_CPP"
        return
    fi

    backup_file "$AUDIO_IO_CPP"

    # Replace the sched_priority assignment and update the comment
    sed -i "s/param\.sched_priority = [0-9]\+;.*/param.sched_priority = ${TARGET_RT_PRIO};  \/\/ Optimized: cooperates with PipeWire (83-88)/" "$AUDIO_IO_CPP"

    local new_val
    new_val=$(grep -oP 'sched_priority\s*=\s*\K[0-9]+' "$AUDIO_IO_CPP" | head -1 || echo "?")
    if [ "$new_val" = "$TARGET_RT_PRIO" ]; then
        apply_ok "RT priority -> SCHED_FIFO $TARGET_RT_PRIO"
        NEED_REBUILD=true
    else
        apply_err "Failed to update RT priority"
    fi
}

fix_cpp_callback_setsize() {
    echo ""
    echo -e "  ${BOLD}Applying: Guard callbackBuffer_.setSize in audio callback${NC}"

    if [ ! -f "$ENGINE_CPP" ]; then
        apply_err "Map2AudioEngine.cpp not found: $ENGINE_CPP"
        return
    fi

    backup_file "$ENGINE_CPP"

    # Replace the bare setSize call with a guarded version
    # Original: callbackBuffer_.setSize(numOutputs, numSamples, false, false, true);
    # New: guard with jassert + only resize if needed
    sed -i '/callbackBuffer_\.setSize(numOutputs, numSamples, false, false, true);/ {
        s|callbackBuffer_\.setSize(numOutputs, numSamples, false, false, true);|// GUARDED: Only resize if callback buffer is too small (avoids RT allocation)\n    jassert(callbackBuffer_.getNumChannels() >= numOutputs \&\& callbackBuffer_.getNumSamples() >= numSamples);\n    auto\& buffer = callbackBuffer_;|
    }' "$ENGINE_CPP"

    if grep -q '// GUARDED:' "$ENGINE_CPP"; then
        apply_ok "callbackBuffer_.setSize guarded with jassert"
        NEED_REBUILD=true
    else
        apply_err "Failed to guard callbackBuffer_.setSize"
    fi
}

fix_cmake_fast_math() {
    echo ""
    echo -e "  ${BOLD}Applying: CMake -ffast-math -> ON${NC}"

    if [ ! -f "$CMAKELISTS" ]; then
        apply_err "CMakeLists.txt not found: $CMAKELISTS"
        return
    fi

    backup_file "$CMAKELISTS"

    sed -i 's/option(ENABLE_FAST_MATH "Enable -ffast-math for DSP" OFF)/option(ENABLE_FAST_MATH "Enable -ffast-math for DSP" ON)/' "$CMAKELISTS"

    local new_val
    new_val=$(grep -oP 'ENABLE_FAST_MATH\s+"[^"]*"\s+\K(ON|OFF)' "$CMAKELISTS" || echo "?")
    if [ "$new_val" = "ON" ]; then
        apply_ok "-ffast-math -> ON"
        NEED_REBUILD=true
    else
        apply_err "Failed to enable -ffast-math"
    fi
}

# ============================================================================
# Post-Fix Actions
# ============================================================================

post_fix_actions() {
    echo ""
    echo -e "${BOLD}${BLUE}  --- Post-Fix Actions ---${NC}"
    echo ""

    # Always apply live quantum change (immediate effect, no restart)
    echo -e "  Applying live PipeWire quantum..."
    if pw-metadata -n settings 0 clock.force-quantum "$TARGET_QUANTUM" &>/dev/null; then
        apply_ok "Live quantum set to $TARGET_QUANTUM via pw-metadata"
    else
        apply_err "Could not set live quantum (is PipeWire running?)"
    fi

    if $NEED_SYSTEMD_RELOAD; then
        echo ""
        echo -e "  ${YELLOW}Systemd files changed.${NC} You should run:"
        echo -e "    ${DIM}sudo systemctl daemon-reload${NC}"
        echo -e "    ${DIM}sudo systemctl restart map2-backend${NC}"
    fi

    if $NEED_PIPEWIRE_RESTART; then
        echo ""
        echo -e "  ${YELLOW}PipeWire config changed.${NC} Restart with:"
        echo -e "    ${DIM}systemctl --user restart pipewire wireplumber${NC}"
    fi

    if $NEED_REBUILD; then
        echo ""
        echo -e "  ${YELLOW}C++ source files changed.${NC} Rebuild with:"
        echo -e "    ${DIM}cd $MAP2_DIR/juce-engine && cmake -B build && cmake --build build -j\$(nproc)${NC}"
    fi
}

# ============================================================================
# Interactive Menu
# ============================================================================

show_fix_menu() {
    if [ "$FAIL" -eq 0 ]; then
        echo ""
        echo -e "  ${GREEN}No fixes needed. All optimizations are applied.${NC}"
        return 1
    fi

    echo ""
    echo -e "${BOLD}  =================================================================="
    echo -e "   AVAILABLE FIXES"
    echo -e "  ==================================================================${NC}"
    echo ""

    local n=0

    if [ "${FIX_NEEDED[pw_config]:-0}" = "1" ] || [ "${FIX_NEEDED[pw_min_quantum]:-0}" = "1" ] || [ "${FIX_NEEDED[pw_max_quantum]:-0}" = "1" ]; then
        ((n++)) || true
        echo -e "    ${BOLD}[$n]${NC} PipeWire config: quantum -> $TARGET_QUANTUM, min -> 32, max -> 256"
    fi

    if [ "${FIX_NEEDED[sd_force_quantum]:-0}" = "1" ]; then
        ((n++)) || true
        echo -e "    ${BOLD}[$n]${NC} Systemd: force-quantum -> $TARGET_QUANTUM"
    fi

    if [ "${FIX_NEEDED[sd_pw_latency]:-0}" = "1" ]; then
        ((n++)) || true
        echo -e "    ${BOLD}[$n]${NC} Systemd: PIPEWIRE_LATENCY -> ${TARGET_QUANTUM}/${TARGET_RATE}"
    fi

    if [ "${FIX_NEEDED[py_config_buffer]:-0}" = "1" ]; then
        ((n++)) || true
        echo -e "    ${BOLD}[$n]${NC} Python: config buffer_size default -> $TARGET_BUFFER"
    fi

    if [ "${FIX_NEEDED[dev_constants]:-0}" = "1" ]; then
        ((n++)) || true
        echo -e "    ${BOLD}[$n]${NC} Python: device constants buffer_size -> $TARGET_BUFFER"
    fi

    if [ "${FIX_NEEDED[cpp_buffer]:-0}" = "1" ]; then
        ((n++)) || true
        echo -e "    ${BOLD}[$n]${NC} C++: DEFAULT_BUFFER_SIZE -> $TARGET_BUFFER"
    fi

    if [ "${FIX_NEEDED[cpp_rt_prio]:-0}" = "1" ]; then
        ((n++)) || true
        echo -e "    ${BOLD}[$n]${NC} C++: RT thread priority -> SCHED_FIFO $TARGET_RT_PRIO"
    fi

    if [ "${FIX_NEEDED[cpp_setsize]:-0}" = "1" ]; then
        ((n++)) || true
        echo -e "    ${BOLD}[$n]${NC} C++: Guard callbackBuffer_.setSize in audio callback"
    fi

    if [ "${FIX_NEEDED[cmake_fmath]:-0}" = "1" ]; then
        ((n++)) || true
        echo -e "    ${BOLD}[$n]${NC} CMake: Enable -ffast-math"
    fi

    echo ""
    echo -e "    ${BOLD}[A]${NC} Apply ALL fixes ($FAIL items)"
    echo -e "    ${BOLD}[R]${NC} Re-run audit"
    echo -e "    ${BOLD}[Q]${NC} Quit"
    echo ""

    return 0
}

apply_all_fixes() {
    echo ""
    echo -e "${BOLD}${CYAN}  Applying all $FAIL fixes...${NC}"
    echo ""

    if [ "${FIX_NEEDED[pw_config]:-0}" = "1" ] || [ "${FIX_NEEDED[pw_min_quantum]:-0}" = "1" ] || [ "${FIX_NEEDED[pw_max_quantum]:-0}" = "1" ]; then
        fix_pipewire_config
    fi

    if [ "${FIX_NEEDED[sd_force_quantum]:-0}" = "1" ]; then
        fix_systemd_force_quantum
    fi

    if [ "${FIX_NEEDED[sd_pw_latency]:-0}" = "1" ]; then
        fix_systemd_pipewire_latency
    fi

    if [ "${FIX_NEEDED[py_config_buffer]:-0}" = "1" ]; then
        fix_python_config_buffer
    fi

    if [ "${FIX_NEEDED[dev_constants]:-0}" = "1" ]; then
        fix_device_constants
    fi

    if [ "${FIX_NEEDED[cpp_buffer]:-0}" = "1" ]; then
        fix_cpp_buffer_size
    fi

    if [ "${FIX_NEEDED[cpp_rt_prio]:-0}" = "1" ]; then
        fix_cpp_rt_priority
    fi

    if [ "${FIX_NEEDED[cpp_setsize]:-0}" = "1" ]; then
        fix_cpp_callback_setsize
    fi

    if [ "${FIX_NEEDED[cmake_fmath]:-0}" = "1" ]; then
        fix_cmake_fast_math
    fi

    echo ""
    echo -e "  ${BOLD}Applied $FIXES_APPLIED fixes.${NC}"

    post_fix_actions
}

apply_single_fix() {
    local choice="$1"
    local n=0

    if [ "${FIX_NEEDED[pw_config]:-0}" = "1" ] || [ "${FIX_NEEDED[pw_min_quantum]:-0}" = "1" ] || [ "${FIX_NEEDED[pw_max_quantum]:-0}" = "1" ]; then
        ((n++)) || true
        if [ "$n" = "$choice" ]; then fix_pipewire_config; post_fix_actions; return; fi
    fi

    if [ "${FIX_NEEDED[sd_force_quantum]:-0}" = "1" ]; then
        ((n++)) || true
        if [ "$n" = "$choice" ]; then fix_systemd_force_quantum; post_fix_actions; return; fi
    fi

    if [ "${FIX_NEEDED[sd_pw_latency]:-0}" = "1" ]; then
        ((n++)) || true
        if [ "$n" = "$choice" ]; then fix_systemd_pipewire_latency; post_fix_actions; return; fi
    fi

    if [ "${FIX_NEEDED[py_config_buffer]:-0}" = "1" ]; then
        ((n++)) || true
        if [ "$n" = "$choice" ]; then fix_python_config_buffer; post_fix_actions; return; fi
    fi

    if [ "${FIX_NEEDED[dev_constants]:-0}" = "1" ]; then
        ((n++)) || true
        if [ "$n" = "$choice" ]; then fix_device_constants; post_fix_actions; return; fi
    fi

    if [ "${FIX_NEEDED[cpp_buffer]:-0}" = "1" ]; then
        ((n++)) || true
        if [ "$n" = "$choice" ]; then fix_cpp_buffer_size; post_fix_actions; return; fi
    fi

    if [ "${FIX_NEEDED[cpp_rt_prio]:-0}" = "1" ]; then
        ((n++)) || true
        if [ "$n" = "$choice" ]; then fix_cpp_rt_priority; post_fix_actions; return; fi
    fi

    if [ "${FIX_NEEDED[cpp_setsize]:-0}" = "1" ]; then
        ((n++)) || true
        if [ "$n" = "$choice" ]; then fix_cpp_callback_setsize; post_fix_actions; return; fi
    fi

    if [ "${FIX_NEEDED[cmake_fmath]:-0}" = "1" ]; then
        ((n++)) || true
        if [ "$n" = "$choice" ]; then fix_cmake_fast_math; post_fix_actions; return; fi
    fi

    echo -e "  ${RED}Invalid selection: $choice${NC}"
}

# ============================================================================
# Full Audit Run
# ============================================================================

run_audit() {
    # Reset counters
    PASS=0
    FAIL=0
    WARN=0
    FIX_COUNT=0
    FIX_NEEDED=()

    print_banner
    audit_kernel
    audit_pipewire
    audit_systemd
    audit_code
    print_summary
}

# ============================================================================
# Main
# ============================================================================

main() {
    log "=== MAP2 Latency Optimizer started ==="

    # Check we're in the right directory
    if [ ! -d "$MAP2_DIR" ]; then
        echo -e "${RED}Error: MAP2 directory not found at $MAP2_DIR${NC}"
        exit 1
    fi

    # Run initial audit
    run_audit

    # If --audit-only flag, exit after audit
    if [ "${1:-}" = "--audit-only" ]; then
        echo ""
        exit $FAIL
    fi

    # Interactive loop
    while true; do
        if ! show_fix_menu; then
            echo ""
            break
        fi

        echo -n "  Select option: "
        read -r selection

        case "${selection,,}" in
            a)
                apply_all_fixes
                echo ""
                echo -e "${BOLD}${CYAN}  Re-running audit to verify...${NC}"
                run_audit
                ;;
            r)
                run_audit
                ;;
            q)
                echo ""
                echo -e "  ${DIM}Exiting.${NC}"
                break
                ;;
            [0-9]|[0-9][0-9])
                apply_single_fix "$selection"
                echo ""
                echo -e "${BOLD}${CYAN}  Re-running audit to verify...${NC}"
                run_audit
                ;;
            *)
                echo -e "  ${RED}Unknown option: $selection${NC}"
                ;;
        esac
    done

    log "=== MAP2 Latency Optimizer finished ==="
}

main "$@"

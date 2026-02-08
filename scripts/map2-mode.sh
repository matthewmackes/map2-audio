#!/bin/bash
#
# MAP2 Audio Platform — Unified Mode Manager
# ============================================
# Single source of truth for mode switching.
#
# This script is the ONLY correct way to change the platform mode.
# It updates all config stores, swaps systemd overrides, and restarts.
#
# Usage:
#   map2-mode status           Show current mode and config health
#   map2-mode set <mode>       Switch to a new mode
#   map2-mode apply            Re-apply current mode (fix drift)
#   map2-mode verify           Check all config stores agree
#
# Modes:
#   audio         Dedicated low-latency audio processor  (target <3 ms)
#   all-in-one    Audio + web UI on same machine         (target 4-5 ms)
#   management    Web UI & management only               (no audio)
#
set -euo pipefail

# ── Paths ─────────────────────────────────────────────────────────────
MAP2_DIR="/home/mm/map2-audio"
GUITARFX_CONF="/etc/guitarfx-mode.conf"
DEPLOYMENT_JSON="/home/mm/.map2/deployment.json"
ENV_FILE="/etc/map2/environment"
OVERRIDE_DIR="/etc/systemd/system/map2-backend.service.d"
MODE_OVERRIDE="${OVERRIDE_DIR}/10-mode.conf"       # the ONE active drop-in
AVAILABLE_DIR="${MAP2_DIR}/systemd/modes"           # shipped templates

# ── Colours ───────────────────────────────────────────────────────────
R='\033[0;31m'  G='\033[0;32m'  Y='\033[1;33m'  B='\033[0;34m'
C='\033[0;36m'  M='\033[0;35m'  W='\033[1;37m'  D='\033[2m'
NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────
die()  { echo -e "${R}✗ $1${NC}" >&2; exit 1; }
ok()   { echo -e "${G}✓${NC} $1"; }
warn() { echo -e "${Y}⚠${NC} $1"; }
info() { echo -e "${B}→${NC} $1"; }

need_root() {
    if [ "$EUID" -ne 0 ]; then
        die "This operation requires root.  Run:  sudo $0 $*"
    fi
}

# ── Canonical mode name mapping ───────────────────────────────────────
# guitarfx-mode.conf uses lowercase:   audio | all-in-one | management
# deployment.json uses uppercase enum: ALL-IN-ONE | AUDIO-NODE | CONTROL-NODE
# This function normalises both directions.

to_guitarfx_mode() {
    case "${1,,}" in
        audio|audio-node|audio_node)        echo "audio" ;;
        all-in-one|all_in_one|allinone)     echo "all-in-one" ;;
        management|control-node|control_node|frontend-only) echo "management" ;;
        *) die "Unknown mode: $1" ;;
    esac
}

to_deployment_mode() {
    case "${1,,}" in
        audio|audio-node|audio_node)        echo "AUDIO-NODE" ;;
        all-in-one|all_in_one|allinone)     echo "ALL-IN-ONE" ;;
        management|control-node|control_node|frontend-only) echo "CONTROL-NODE" ;;
        *) die "Unknown mode: $1" ;;
    esac
}

# ── Read current mode from the canonical file ─────────────────────────
read_current_mode() {
    if [ -f "$GUITARFX_CONF" ]; then
        grep -oP '^MODE=\K.*' "$GUITARFX_CONF" 2>/dev/null || echo "unknown"
    else
        echo "unknown"
    fi
}

# ── Verify all stores agree ──────────────────────────────────────────
verify_mode() {
    local gfx_mode deploy_mode env_mode override_mode
    local errors=0

    # 1. guitarfx-mode.conf
    gfx_mode=$(read_current_mode)

    # 2. deployment.json
    if [ -f "$DEPLOYMENT_JSON" ]; then
        deploy_mode=$(python3 -c "import json; print(json.load(open('$DEPLOYMENT_JSON'))['mode'])" 2>/dev/null || echo "MISSING")
    else
        deploy_mode="MISSING"
    fi

    # 3. /etc/map2/environment
    if [ -f "$ENV_FILE" ]; then
        env_mode=$(grep -oP '^MAP2_DEPLOYMENT_MODE=\K.*' "$ENV_FILE" 2>/dev/null || echo "MISSING")
    else
        env_mode="MISSING"
    fi

    # 4. Active systemd override
    if [ -f "$MODE_OVERRIDE" ]; then
        override_mode=$(grep -oP '# MAP2_MODE=\K.*' "$MODE_OVERRIDE" 2>/dev/null || echo "UNKNOWN")
    elif [ -f "${OVERRIDE_DIR}/all-in-one-override.conf" ] && [ -f "${OVERRIDE_DIR}/audio-mode-override.conf" ]; then
        override_mode="CONFLICT(both)"
    else
        override_mode="NONE"
    fi

    # Expected deployment enum for the guitarfx mode
    local expected_deploy
    expected_deploy=$(to_deployment_mode "$gfx_mode" 2>/dev/null || echo "?")

    echo ""
    echo -e "${C}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${C}║              MODE CONFIGURATION STATUS                   ║${NC}"
    echo -e "${C}╠══════════════════════════════════════════════════════════╣${NC}"
    printf  "${C}║${NC}  %-28s %s\n" "guitarfx-mode.conf:" "$(mode_badge "$gfx_mode")"
    printf  "${C}║${NC}  %-28s %s\n" "deployment.json:" "$deploy_mode"
    printf  "${C}║${NC}  %-28s %s\n" "/etc/map2/environment:" "$env_mode"
    printf  "${C}║${NC}  %-28s %s\n" "systemd override:" "$override_mode"
    echo -e "${C}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Check agreement
    if [ "$deploy_mode" != "MISSING" ] && [ "$deploy_mode" != "$expected_deploy" ]; then
        warn "deployment.json ($deploy_mode) disagrees with guitarfx-mode.conf ($gfx_mode → $expected_deploy)"
        errors=$((errors + 1))
    fi
    if [ "$env_mode" != "MISSING" ] && [ "$env_mode" != "$expected_deploy" ]; then
        warn "/etc/map2/environment ($env_mode) disagrees with guitarfx-mode.conf ($gfx_mode → $expected_deploy)"
        errors=$((errors + 1))
    fi
    if [ "$override_mode" = "CONFLICT(both)" ]; then
        warn "Both all-in-one and audio overrides are installed simultaneously!"
        warn "Run 'sudo map2-mode apply' to fix."
        errors=$((errors + 1))
    fi

    if [ "$errors" -eq 0 ]; then
        ok "All config stores are consistent"
    else
        warn "$errors inconsistencies detected — run 'sudo $0 apply' to reconcile"
    fi

    return $errors
}

mode_badge() {
    case "${1,,}" in
        audio)        echo -e "${G}█ AUDIO${NC}  (dedicated low-latency)" ;;
        all-in-one)   echo -e "${Y}█ ALL-IN-ONE${NC}  (audio + web)" ;;
        management)   echo -e "${B}█ MANAGEMENT${NC}  (control only)" ;;
        *)            echo -e "${R}█ UNKNOWN${NC}  ($1)" ;;
    esac
}

# ── Write mode to ALL config stores ──────────────────────────────────
write_all_stores() {
    local gfx_mode="$1"
    local deploy_mode
    deploy_mode=$(to_deployment_mode "$gfx_mode")

    info "Updating guitarfx-mode.conf → $gfx_mode"
    cat > "$GUITARFX_CONF" << EOF
#!/bin/bash
# MAP2 Audio Platform - Mode Configuration
# Location: /etc/guitarfx-mode.conf
#
# Managed by: map2-mode.sh — do not edit manually.
# Change mode with:  sudo map2-mode set <audio|all-in-one|management>

MODE=${gfx_mode}
EOF
    chmod 644 "$GUITARFX_CONF"

    info "Updating /etc/map2/environment → $deploy_mode"
    mkdir -p /etc/map2
    # Preserve other vars, update MAP2_DEPLOYMENT_MODE
    if [ -f "$ENV_FILE" ]; then
        sed -i "s/^MAP2_DEPLOYMENT_MODE=.*/MAP2_DEPLOYMENT_MODE=${deploy_mode}/" "$ENV_FILE"
        if ! grep -q "^MAP2_DEPLOYMENT_MODE=" "$ENV_FILE"; then
            echo "MAP2_DEPLOYMENT_MODE=${deploy_mode}" >> "$ENV_FILE"
        fi
    else
        echo "MAP2_DEPLOYMENT_MODE=${deploy_mode}" > "$ENV_FILE"
    fi

    info "Updating deployment.json → $deploy_mode"
    mkdir -p "$(dirname "$DEPLOYMENT_JSON")"
    python3 -c "
import json, os
from datetime import datetime
f = '$DEPLOYMENT_JSON'
data = {}
if os.path.exists(f):
    with open(f) as fh: data = json.load(fh)
data['mode'] = '$deploy_mode'
data['updated_at'] = datetime.utcnow().isoformat()
if 'created_at' not in data:
    data['created_at'] = data['updated_at']
with open(f, 'w') as fh: json.dump(data, fh, indent=2)
" 2>/dev/null || warn "Could not update deployment.json (non-fatal)"
}

# ── Install the correct systemd override ──────────────────────────────
apply_systemd_override() {
    local gfx_mode="$1"
    local src_file="${AVAILABLE_DIR}/${gfx_mode}.conf"

    if [ ! -f "$src_file" ]; then
        die "Override template not found: $src_file\nRun the install script first."
    fi

    # Remove legacy conflicting overrides
    for legacy in all-in-one-override.conf audio-mode-override.conf; do
        if [ -f "${OVERRIDE_DIR}/${legacy}" ]; then
            info "Removing legacy override: ${legacy}"
            rm -f "${OVERRIDE_DIR}/${legacy}"
        fi
    done

    info "Installing mode override: ${gfx_mode}.conf → 10-mode.conf"
    cp "$src_file" "$MODE_OVERRIDE"
    chmod 644 "$MODE_OVERRIDE"

    info "Reloading systemd daemon"
    systemctl daemon-reload
}

# ── Show rich status ─────────────────────────────────────────────────
cmd_status() {
    local mode
    mode=$(read_current_mode)

    echo ""
    echo -e "${M}╔══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${M}║       MAP2 Audio Platform — Current Mode                 ║${NC}"
    echo -e "${M}╚══════════════════════════════════════════════════════════╝${NC}"
    echo ""

    case "${mode,,}" in
        audio)
            echo -e "   ${G}█████████████████████████████████████████████${NC}"
            echo -e "   ${G}█${NC}                                           ${G}█${NC}"
            echo -e "   ${G}█${NC}   ${W}♪  AUDIO MODE${NC}                         ${G}█${NC}"
            echo -e "   ${G}█${NC}   Dedicated low-latency processor         ${G}█${NC}"
            echo -e "   ${G}█${NC}   Target: ${W}<3 ms${NC} round-trip              ${G}█${NC}"
            echo -e "   ${G}█${NC}   CPU pinned to isolated cores 4-5        ${G}█${NC}"
            echo -e "   ${G}█${NC}   RT priority 95, Nice -20                ${G}█${NC}"
            echo -e "   ${G}█${NC}                                           ${G}█${NC}"
            echo -e "   ${G}█████████████████████████████████████████████${NC}"
            ;;
        all-in-one)
            echo -e "   ${Y}█████████████████████████████████████████████${NC}"
            echo -e "   ${Y}█${NC}                                           ${Y}█${NC}"
            echo -e "   ${Y}█${NC}   ${W}♪  ALL-IN-ONE MODE${NC}                    ${Y}█${NC}"
            echo -e "   ${Y}█${NC}   Audio processing + web dashboard        ${Y}█${NC}"
            echo -e "   ${Y}█${NC}   Target: ${W}4-5 ms${NC} round-trip             ${Y}█${NC}"
            echo -e "   ${Y}█${NC}   CPU shared, cores 0-5                   ${Y}█${NC}"
            echo -e "   ${Y}█${NC}   RT priority 50, Nice -10                ${Y}█${NC}"
            echo -e "   ${Y}█${NC}                                           ${Y}█${NC}"
            echo -e "   ${Y}█████████████████████████████████████████████${NC}"
            ;;
        management)
            echo -e "   ${B}█████████████████████████████████████████████${NC}"
            echo -e "   ${B}█${NC}                                           ${B}█${NC}"
            echo -e "   ${B}█${NC}   ${W}⚙  MANAGEMENT MODE${NC}                    ${B}█${NC}"
            echo -e "   ${B}█${NC}   Web UI & cluster control only           ${B}█${NC}"
            echo -e "   ${B}█${NC}   No audio processing on this node        ${B}█${NC}"
            echo -e "   ${B}█${NC}   Standard scheduling, no RT              ${B}█${NC}"
            echo -e "   ${B}█${NC}                                           ${B}█${NC}"
            echo -e "   ${B}█████████████████████████████████████████████${NC}"
            ;;
        *)
            echo -e "   ${R}█████████████████████████████████████████████${NC}"
            echo -e "   ${R}█${NC}   ${W}?  UNKNOWN MODE${NC}: $mode                 ${R}█${NC}"
            echo -e "   ${R}█████████████████████████████████████████████${NC}"
            ;;
    esac
    echo ""

    # Services
    echo -e "${C}─── Service Status ───────────────────────────────────────${NC}"
    for svc in map2-boot-manager map2-backend map2-web map2-port80-proxy; do
        local state
        state=$(systemctl is-active "${svc}.service" 2>/dev/null || echo "inactive")
        case "$state" in
            active)  printf "  ${G}●${NC} %-28s ${G}active${NC}\n" "$svc" ;;
            failed)  printf "  ${R}●${NC} %-28s ${R}failed${NC}\n" "$svc" ;;
            *)       printf "  ${D}○${NC} %-28s ${D}inactive${NC}\n" "$svc" ;;
        esac
    done
    echo ""

    # RT/system checks
    echo -e "${C}─── System Tuning ───────────────────────────────────────${NC}"
    local governor
    governor=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null || echo "unknown")
    if [ "$governor" = "performance" ]; then
        echo -e "  ${G}●${NC} CPU Governor:  ${G}performance${NC}"
    else
        echo -e "  ${Y}●${NC} CPU Governor:  ${Y}${governor}${NC}"
    fi

    local cmdline
    cmdline=$(cat /proc/cmdline 2>/dev/null || echo "")
    if echo "$cmdline" | grep -q "isolcpus="; then
        echo -e "  ${G}●${NC} CPU Isolation: ${G}$(echo "$cmdline" | grep -oP 'isolcpus=[^ ]+')${NC}"
    else
        echo -e "  ${D}○${NC} CPU Isolation: not configured"
    fi

    if curl -sf http://localhost:8080/api/health >/dev/null 2>&1; then
        echo -e "  ${G}●${NC} Backend API:   ${G}http://localhost:8080${NC}"
    else
        echo -e "  ${D}○${NC} Backend API:   not responding"
    fi
    echo ""

    # Config agreement
    verify_mode
}

# ── Mode Comparison Chart ────────────────────────────────────────────
cmd_chart() {
    echo ""
    echo -e "${W}╔═══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${W}║                    MAP2 Audio Platform — Mode Comparison Chart               ║${NC}"
    echo -e "${W}╚═══════════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    local current
    current=$(read_current_mode)

    # ── Header ────────────────────────────────────────────────────────
    echo -e "${C}┌─────────────────────────┬──────────────────┬──────────────────┬──────────────────┐${NC}"
    printf  "${C}│${NC} %-23s ${C}│${NC}" ""
    # Highlight the active mode column
    if [ "$current" = "audio" ]; then
        printf " ${G}▸ %-15s${NC} ${C}│${NC}" "AUDIO"
    else
        printf "   %-15s ${C}│${NC}" "AUDIO"
    fi
    if [ "$current" = "all-in-one" ]; then
        printf " ${Y}▸ %-15s${NC} ${C}│${NC}" "ALL-IN-ONE"
    else
        printf "   %-15s ${C}│${NC}" "ALL-IN-ONE"
    fi
    if [ "$current" = "management" ]; then
        printf " ${B}▸ %-15s${NC} ${C}│${NC}" "MANAGEMENT"
    else
        printf "   %-15s ${C}│${NC}" "MANAGEMENT"
    fi
    echo ""
    echo -e "${C}├─────────────────────────┼──────────────────┼──────────────────┼──────────────────┤${NC}"

    # ── Purpose ───────────────────────────────────────────────────────
    printf  "${C}│${NC} ${W}%-23s${NC} ${C}│${NC}" "Purpose"
    printf  " %-16s ${C}│${NC}" "Low-latency FX"
    printf  " %-16s ${C}│${NC}" "Audio + Web UI"
    printf  " %-16s ${C}│${NC}" "Control only"
    echo ""

    printf  "${C}│${NC} %-23s ${C}│${NC}" "Target Latency"
    printf  " ${G}%-16s${NC} ${C}│${NC}" "<3 ms"
    printf  " ${Y}%-16s${NC} ${C}│${NC}" "4-5 ms"
    printf  " ${D}%-16s${NC} ${C}│${NC}" "N/A"
    echo ""
    echo -e "${C}├─────────────────────────┼──────────────────┼──────────────────┼──────────────────┤${NC}"

    # ── Services Section ──────────────────────────────────────────────
    printf  "${C}│${NC} ${W}%-23s${NC} ${C}│${NC}" "SERVICES"
    printf  " %-16s ${C}│${NC}" ""
    printf  " %-16s ${C}│${NC}" ""
    printf  " %-16s ${C}│${NC}" ""
    echo ""
    echo -e "${C}├─────────────────────────┼──────────────────┼──────────────────┼──────────────────┤${NC}"

    _chart_row "JUCE Audio Engine"    "✓ enabled"  "G" "✓ enabled"  "G" "✗ disabled" "D"
    _chart_row "Audio I/O"            "✓ enabled"  "G" "✓ enabled"  "G" "✗ disabled" "D"
    _chart_row "Plugin Loader"        "✓ enabled"  "G" "✓ enabled"  "G" "✗ disabled" "D"
    _chart_row "API Server"           "✓ enabled"  "G" "✓ enabled"  "G" "✓ enabled"  "G"
    _chart_row "Web Dashboard"        "✗ disabled" "D" "✓ enabled"  "G" "✓ enabled"  "G"
    _chart_row "Terminal UI"          "✓ enabled"  "G" "✓ enabled"  "G" "✓ enabled"  "G"
    _chart_row "Database"             "✓ enabled"  "G" "✓ enabled"  "G" "✓ enabled"  "G"
    _chart_row "mDNS Discovery"       "✓ enabled"  "G" "✓ enabled"  "G" "✓ enabled"  "G"
    _chart_row "LCD Manager"          "✓ enabled"  "G" "✓ enabled"  "G" "✗ disabled" "D"

    echo -e "${C}├─────────────────────────┼──────────────────┼──────────────────┼──────────────────┤${NC}"

    # ── Systemd Tuning Section ────────────────────────────────────────
    printf  "${C}│${NC} ${W}%-23s${NC} ${C}│${NC}" "SYSTEMD TUNING"
    printf  " %-16s ${C}│${NC}" ""
    printf  " %-16s ${C}│${NC}" ""
    printf  " %-16s ${C}│${NC}" ""
    echo ""
    echo -e "${C}├─────────────────────────┼──────────────────┼──────────────────┼──────────────────┤${NC}"

    _chart_row "CPU Affinity"         "cores 4-5"  "G" "cores 0-5"  "Y" "unrestricted" "D"
    _chart_row "Nice Priority"        "-20"        "G" "-10"        "Y" "0 (normal)"   "D"
    _chart_row "RT Priority Limit"    "95"         "G" "50"         "Y" "0 (none)"     "D"
    _chart_row "Memory Lock"          "infinity"   "G" "512 MB"     "Y" "64 MB"        "D"
    _chart_row "I/O Sched Class"      "realtime"   "G" "realtime"   "Y" "best-effort"  "D"
    _chart_row "I/O Sched Priority"   "1 (highest)" "G" "3 (mid)"     "Y" "4 (normal)"   "D"
    _chart_row "Logging"              "file (RT)"  "G" "journal"    "Y" "journal"      "D"

    echo -e "${C}├─────────────────────────┼──────────────────┼──────────────────┼──────────────────┤${NC}"

    # ── Kernel / System Section ───────────────────────────────────────
    printf  "${C}│${NC} ${W}%-23s${NC} ${C}│${NC}" "KERNEL TUNING"
    printf  " %-16s ${C}│${NC}" ""
    printf  " %-16s ${C}│${NC}" ""
    printf  " %-16s ${C}│${NC}" ""
    echo ""
    echo -e "${C}├─────────────────────────┼──────────────────┼──────────────────┼──────────────────┤${NC}"

    _chart_row "CPU Isolation"        "required"   "G" "recommended" "Y" "not needed"  "D"
    _chart_row "nohz_full"            "required"   "G" "optional"    "Y" "not needed"  "D"
    _chart_row "threadirqs"           "required"   "G" "recommended" "Y" "not needed"  "D"
    _chart_row "CPU Governor"         "performance" "G" "performance" "Y" "ondemand ok" "D"
    _chart_row "Turbo Boost"          "disabled"   "G" "optional"    "Y" "enabled ok"  "D"
    _chart_row "vm.swappiness"        "0"          "G" "10"          "Y" "60 (default)" "D"

    echo -e "${C}├─────────────────────────┼──────────────────┼──────────────────┼──────────────────┤${NC}"

    # ── Systemd Services Section ──────────────────────────────────────
    printf  "${C}│${NC} ${W}%-23s${NC} ${C}│${NC}" "SYSTEMD SERVICES"
    printf  " %-16s ${C}│${NC}" ""
    printf  " %-16s ${C}│${NC}" ""
    printf  " %-16s ${C}│${NC}" ""
    echo ""
    echo -e "${C}├─────────────────────────┼──────────────────┼──────────────────┼──────────────────┤${NC}"

    _chart_row "map2-backend"         "✓"          "G" "✓"          "G" "✓"           "G"
    _chart_row "map2-web"             "✗"          "D" "✓"          "G" "✓"           "G"
    _chart_row "map2-port80-proxy"    "✓"          "G" "✓"          "G" "✗"           "D"
    _chart_row "map2-lcd-boot"        "✓"          "G" "✓"          "G" "✗"           "D"
    _chart_row "map2-boot-manager"    "✓"          "G" "✓"          "G" "✓"           "G"
    _chart_row "map2-cpu-governor"    "✓ required" "G" "✓ advised"  "Y" "optional"    "D"
    _chart_row "map2-disable-turbo"   "✓ required" "G" "optional"   "Y" "✗"           "D"

    echo -e "${C}└─────────────────────────┴──────────────────┴──────────────────┴──────────────────┘${NC}"
    echo ""

    # Legend
    echo -e "  ${G}▸${NC} = currently active mode"
    echo -e "  Switch mode: ${W}sudo map2-mode set <audio|all-in-one|management>${NC}"
    echo ""
}

# Helper: print one chart row with per-column colour
_chart_row() {
    local label="$1"
    local v1="$2" c1="$3"
    local v2="$4" c2="$5"
    local v3="$6" c3="$7"

    printf "${C}│${NC} %-23s ${C}│${NC}" "$label"
    _chart_cell "$v1" "$c1"
    printf " ${C}│${NC}"
    _chart_cell "$v2" "$c2"
    printf " ${C}│${NC}"
    _chart_cell "$v3" "$c3"
    printf " ${C}│${NC}"
    echo ""
}

_chart_cell() {
    local val="$1" col="$2"
    case "$col" in
        G) printf " ${G}%-16s${NC}" "$val" ;;
        Y) printf " ${Y}%-16s${NC}" "$val" ;;
        R) printf " ${R}%-16s${NC}" "$val" ;;
        B) printf " ${B}%-16s${NC}" "$val" ;;
        *)  printf " ${D}%-16s${NC}" "$val" ;;
    esac
}

# ── Set mode ─────────────────────────────────────────────────────────
cmd_set() {
    local raw_mode="${1:-}"
    [ -z "$raw_mode" ] && die "Usage: $0 set <audio|all-in-one|management>"
    need_root

    local gfx_mode
    gfx_mode=$(to_guitarfx_mode "$raw_mode")
    local current
    current=$(read_current_mode)

    echo ""
    if [ "$gfx_mode" = "$current" ]; then
        info "Already in ${gfx_mode} mode — re-applying to fix any drift"
    else
        echo -e "${W}Switching mode: ${current} → ${gfx_mode}${NC}"
    fi
    echo ""

    # 1. Write all config stores
    write_all_stores "$gfx_mode"

    # 2. Install correct systemd override
    apply_systemd_override "$gfx_mode"

    # 3. Restart backend to apply
    info "Restarting map2-backend.service"
    systemctl restart map2-backend.service || warn "Backend restart failed"

    echo ""
    ok "Mode set to ${gfx_mode}"
    echo ""
    echo -e "${D}  The backend service has been restarted with the new tuning.${NC}"
    echo -e "${D}  For kernel-level changes (isolcpus, nohz_full), a reboot is required.${NC}"
    echo ""
}

# ── Apply current mode (fix drift without changing mode) ─────────────
cmd_apply() {
    need_root
    local mode
    mode=$(read_current_mode)
    [ "$mode" = "unknown" ] && die "No mode configured. Run: $0 set <mode>"

    echo ""
    info "Re-applying mode: $mode"
    echo ""

    write_all_stores "$mode"
    apply_systemd_override "$mode"

    ok "Mode $mode re-applied to all config stores"
    echo -e "${D}  Run 'sudo systemctl restart map2-backend' to activate.${NC}"
    echo ""
}

# ── Help ──────────────────────────────────────────────────────────────
cmd_help() {
    echo ""
    echo -e "${C}MAP2 Audio Platform — Mode Manager${NC}"
    echo ""
    echo -e "${W}Usage:${NC}  sudo map2-mode <command> [options]"
    echo ""
    echo -e "${W}Commands:${NC}"
    echo -e "  ${C}status${NC}              Show current mode, services, and config health"
    echo -e "  ${C}set <mode>${NC}          Switch to a new mode and restart"
    echo -e "  ${C}apply${NC}              Re-apply current mode to all stores (fix drift)"
    echo -e "  ${C}verify${NC}             Check all config stores agree"
    echo -e "  ${C}chart${NC}              Show what's included in each mode"
    echo ""
    echo -e "${W}Modes:${NC}"
    echo -e "  ${G}audio${NC}               Dedicated low-latency audio   (<3 ms)"
    echo -e "  ${Y}all-in-one${NC}          Audio + web dashboard         (4-5 ms)"
    echo -e "  ${B}management${NC}          Web UI & control only         (no audio)"
    echo ""
    echo -e "${W}Examples:${NC}"
    echo -e "  ${D}sudo map2-mode set audio${NC}"
    echo -e "  ${D}sudo map2-mode set all-in-one${NC}"
    echo -e "  ${D}map2-mode status${NC}"
    echo ""
}

# ── Main ──────────────────────────────────────────────────────────────
case "${1:-help}" in
    status|st)     cmd_status ;;
    set|switch)    cmd_set "${2:-}" ;;
    apply|fix)     cmd_apply ;;
    verify|check)  verify_mode ;;
    chart|compare) cmd_chart ;;
    help|--help|-h) cmd_help ;;
    *)             die "Unknown command: $1 — run '$0 help'" ;;
esac

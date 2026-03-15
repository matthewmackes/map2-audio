#!/bin/bash
# Deprecated as a primary user interface.
# Use the unified Textual Workflow route or `map2 workflow` for guided execution.
# This script remains as a non-interactive fallback/bootstrap path.
# CPU Core Pinning Configuration for MAP2 Audio Platform
# Optimizes CPU affinity for real-time audio processing

set -euo pipefail

AUTO_YES=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --yes|-y)
            AUTO_YES=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--yes] [--dry-run]"
            echo ""
            echo "  --yes       Run without interactive confirmation"
            echo "  --dry-run   Print the commands without applying changes"
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info() { echo -e "${BLUE}$*${NC}"; }
ok() { echo -e "${GREEN}$*${NC}"; }
warn() { echo -e "${YELLOW}$*${NC}"; }

run_sudo() {
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "[DRY-RUN] sudo $*"
    else
        sudo "$@"
    fi
}

write_root_file() {
    local dest="$1"
    local content="$2"
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "[DRY-RUN] write ${dest}"
        printf '%s\n' "$content"
        return
    fi
    printf '%s\n' "$content" | sudo tee "$dest" >/dev/null
}

write_user_file() {
    local dest="$1"
    local content="$2"
    if [[ "$DRY_RUN" == "true" ]]; then
        echo "[DRY-RUN] write ${dest}"
        printf '%s\n' "$content"
        return
    fi
    printf '%s\n' "$content" >"$dest"
}

confirm() {
    if [[ "$AUTO_YES" == "true" ]]; then
        return 0
    fi
    read -p "Configure CPU pinning for optimal audio performance? (y/n): " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

echo "=========================================="
echo "CPU Core Pinning Configuration"
echo "=========================================="
echo

echo -e "${BLUE}Hardware Analysis:${NC}"
echo "  CPU: Intel i7-8700T (6 physical cores)"
echo "  Current USB IRQ: 121 on CPU2"
echo "  Hyperthreading: Disabled"
echo "  NUMA: Single node"
echo

echo -e "${YELLOW}Recommended CPU Allocation:${NC}"
echo "  CPU0: System/kernel (avoid user tasks)"
echo "  CPU1: FastAPI backend, general I/O"
echo "  CPU2: USB audio IRQ handler (pinned)"
echo "  CPU3: Audio DSP processing (isolated)"
echo "  CPU4: Web UI, database"
echo "  CPU5: Monitoring, background tasks"
echo

if ! confirm; then
    echo "Aborted."
    exit 0
fi

echo -e "\n${GREEN}[1/5]${NC} Pinning USB audio IRQ to CPU2..."
USB_IRQ=$(awk '/xhci_hcd/ {gsub(":", "", $1); print $1; exit}' /proc/interrupts || true)
if [[ -n "$USB_IRQ" ]]; then
    echo "  USB IRQ: $USB_IRQ"
    run_sudo bash -lc "echo 2 > /proc/irq/$USB_IRQ/smp_affinity_list"
    ok "  ✓ IRQ $USB_IRQ pinned to CPU2"
else
    warn "  ⚠ USB IRQ not found"
fi

echo -e "\n${GREEN}[2/5]${NC} Creating IRQ affinity service..."
IRQ_SERVICE_CONTENT="[Unit]
Description=Pin USB audio IRQ to CPU2 for real-time performance
After=multi-user.target
Before=map2-audio.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/bash -c 'IRQ=\$(awk \"/xhci_hcd/ {gsub(\\\":\\\", \\\"\\\", \\\$1); print \\\$1; exit}\" /proc/interrupts); [ -n \"\$IRQ\" ] && echo 2 > /proc/irq/\$IRQ/smp_affinity_list || true'

[Install]
WantedBy=multi-user.target"
write_root_file /etc/systemd/system/audio-irq-affinity.service "$IRQ_SERVICE_CONTENT"
run_sudo systemctl daemon-reload
run_sudo systemctl enable audio-irq-affinity.service
ok "  ✓ IRQ affinity service created and enabled"

echo -e "\n${GREEN}[3/5]${NC} Creating CPU affinity helper script..."
HELPER_SCRIPT_CONTENT='#!/bin/bash
if [ $# -ne 2 ]; then
    echo "Usage: $0 <pid> <cpu-list>"
    exit 1
fi

PID=$1
CPUS=$2
taskset -acp "$CPUS" "$PID"
chrt -f -p 80 "$PID" 2>/dev/null || true
echo "Process $PID pinned to CPUs: $CPUS"'
write_root_file /usr/local/bin/audio-cpu-pin "$HELPER_SCRIPT_CONTENT"
run_sudo chmod +x /usr/local/bin/audio-cpu-pin
ok "  ✓ Helper script created: /usr/local/bin/audio-cpu-pin"

echo -e "\n${GREEN}[4/5]${NC} Creating MAP2 audio service with CPU affinity..."
PINNED_SERVICE_CONTENT="[Unit]
Description=MAP2 Audio Platform (CPU Pinned)
After=network.target audio-irq-affinity.service
Wants=audio-irq-affinity.service

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=/home/mm/map2-audio
Environment=\"PYTHONUNBUFFERED=1\"
ExecStartPre=/usr/bin/taskset -c 1 /bin/true
ExecStart=/usr/bin/taskset -c 2,3 /usr/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080
CPUSchedulingPolicy=fifo
CPUSchedulingPriority=80
CPUAffinity=2 3
LimitRTPRIO=95
LimitMEMLOCK=infinity
LimitNICE=-19
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target"
write_root_file /etc/systemd/system/map2-audio-pinned.service "$PINNED_SERVICE_CONTENT"
ok "  ✓ Service created: map2-audio-pinned.service"

echo -e "\n${GREEN}[5/5]${NC} Creating CPU affinity verification script..."
VERIFY_SCRIPT_CONTENT='#!/bin/bash
RED='\''\033[0;31m'\''
GREEN='\''\033[0;32m'\''
YELLOW='\''\033[1;33m'\''
NC='\''\033[0m'\''

echo "=========================================="
echo "CPU Affinity Verification"
echo "=========================================="
echo

echo -e "${YELLOW}USB Controller IRQ:${NC}"
IRQ=$(awk '\''/xhci_hcd/ {gsub(":", "", $1); print $1; exit}'\'' /proc/interrupts)
if [ -n "$IRQ" ]; then
    AFFINITY=$(cat /proc/irq/$IRQ/smp_affinity_list 2>/dev/null)
    echo "  IRQ $IRQ affinity: CPU $AFFINITY"
else
    echo -e "  ${RED}✗ USB IRQ not found${NC}"
fi

echo
echo -e "${YELLOW}CPU Isolation:${NC}"
ISOLATED=$(grep -o '\''isolcpus=[^ ]*'\'' /proc/cmdline | cut -d= -f2)
if [ -n "$ISOLATED" ]; then
    echo -e "  ${GREEN}✓ CPUs isolated: $ISOLATED${NC}"
else
    echo -e "  ${YELLOW}⚠ No CPU isolation configured${NC}"
fi

echo
echo -e "${YELLOW}Audio Processes:${NC}"
AUDIO_PIDS=$(pgrep -f "uvicorn|python.*main" 2>/dev/null || true)
if [ -n "$AUDIO_PIDS" ]; then
    for PID in $AUDIO_PIDS; do
        CMD=$(ps -p $PID -o comm=)
        AFFINITY=$(taskset -cp $PID 2>/dev/null | awk '\''{print $NF}'\'')
        echo "  PID $PID ($CMD): CPU affinity $AFFINITY"
    done
else
    echo "  No audio processes running"
fi

echo
echo "Recommendations:"
echo "1. Start audio service with: sudo systemctl start map2-audio-pinned"
echo "2. Add CPU3 isolation if required"
echo "3. Monitor with: watch -n1 '\''cat /proc/interrupts | grep xhci_hcd'\''"
echo "4. Pin processes manually: audio-cpu-pin <pid> 2,3"'
write_user_file /home/mm/map2-audio/verify_cpu_affinity.sh "$VERIFY_SCRIPT_CONTENT"
if [[ "$DRY_RUN" != "true" ]]; then
    chmod +x /home/mm/map2-audio/verify_cpu_affinity.sh
fi
ok "  ✓ Verification script created: verify_cpu_affinity.sh"

echo
echo "=========================================="
echo -e "${GREEN}Configuration Complete!${NC}"
echo "=========================================="
echo
echo "Next steps:"
echo "1. Test IRQ pinning: ./verify_cpu_affinity.sh"
echo "2. Add CPU isolation if required"
echo "3. Start service: sudo systemctl start map2-audio-pinned"
echo "4. Enable on boot: sudo systemctl enable map2-audio-pinned"
echo
echo "To pin running processes manually:"
echo "  audio-cpu-pin <pid> 2,3"

#!/bin/bash
# CPU Core Pinning Configuration for MAP2 Audio Platform
# Optimizes CPU affinity for real-time audio processing

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo "CPU Core Pinning Configuration"
echo "=========================================="
echo

# Hardware detected:
# - Intel i7-8700T: 6 physical cores (no hyperthreading active)
# - Single NUMA node
# - Shared 12MB L3 cache
# - USB Controller IRQ currently on CPU2

echo -e "${BLUE}Hardware Analysis:${NC}"
echo "  CPU: Intel i7-8700T (6 physical cores)"
echo "  Current USB IRQ: 121 on CPU2"
echo "  Hyperthreading: Disabled"
echo "  NUMA: Single node"
echo

# Recommended CPU allocation strategy:
# CPU0: System OS tasks (leave for kernel)
# CPU1: Network/IO tasks, FastAPI backend
# CPU2-3: ISOLATED - Real-time audio processing (USB IRQ moved here)
# CPU4: Web server, database
# CPU5: Background tasks, monitoring

echo -e "${YELLOW}Recommended CPU Allocation:${NC}"
echo "  CPU0: System/kernel (avoid user tasks)"
echo "  CPU1: FastAPI backend, general I/O"
echo "  CPU2: USB audio IRQ handler (pinned)"
echo "  CPU3: Audio DSP processing (isolated)"
echo "  CPU4: Web UI, database"
echo "  CPU5: Monitoring, background tasks"
echo

read -p "Configure CPU pinning for optimal audio performance? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Step 1: Pin USB Controller IRQ to CPU2
echo -e "\n${GREEN}[1/5]${NC} Pinning USB audio IRQ to CPU2..."
USB_IRQ=$(cat /proc/interrupts | grep xhci_hcd | awk '{print $1}' | tr -d ':')
if [ -n "$USB_IRQ" ]; then
    echo "  USB IRQ: $USB_IRQ"
    # Set affinity to CPU2 (bitmask 0x04 = binary 0100 = CPU2)
    sudo bash -c "echo 2 > /proc/irq/$USB_IRQ/smp_affinity_list"
    echo -e "  ${GREEN}✓${NC} IRQ $USB_IRQ pinned to CPU2"
else
    echo -e "  ${YELLOW}⚠${NC} USB IRQ not found"
fi

# Step 2: Create systemd drop-in for CPU affinity persistence
echo -e "\n${GREEN}[2/5]${NC} Creating IRQ affinity service..."
sudo tee /etc/systemd/system/audio-irq-affinity.service > /dev/null <<EOF
[Unit]
Description=Pin USB audio IRQ to CPU2 for real-time performance
After=multi-user.target
Before=map2-audio.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/bash -c 'IRQ=\$(cat /proc/interrupts | grep xhci_hcd | awk "{print \\\$1}" | tr -d ":"); [ -n "\$IRQ" ] && echo 2 > /proc/irq/\$IRQ/smp_affinity_list || true'

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable audio-irq-affinity.service
echo -e "  ${GREEN}✓${NC} IRQ affinity service created and enabled"

# Step 3: Create CPU affinity helper script for audio processes
echo -e "\n${GREEN}[3/5]${NC} Creating CPU affinity helper script..."
sudo tee /usr/local/bin/audio-cpu-pin > /dev/null <<'EOF'
#!/bin/bash
# Helper script to pin audio processes to specific CPUs
# Usage: audio-cpu-pin <pid> <cpu-list>
#   Example: audio-cpu-pin 1234 2,3

if [ $# -ne 2 ]; then
    echo "Usage: $0 <pid> <cpu-list>"
    echo "  Example: $0 1234 2,3"
    exit 1
fi

PID=$1
CPUS=$2

# Set CPU affinity
taskset -acp $CPUS $PID

# Set real-time priority if we have permissions
if [ -w /proc/$PID/sched_priority ] 2>/dev/null; then
    chrt -f -p 80 $PID 2>/dev/null || true
fi

echo "Process $PID pinned to CPUs: $CPUS"
EOF

sudo chmod +x /usr/local/bin/audio-cpu-pin
echo -e "  ${GREEN}✓${NC} Helper script created: /usr/local/bin/audio-cpu-pin"

# Step 4: Create Python systemd service with CPU affinity
echo -e "\n${GREEN}[4/5]${NC} Creating MAP2 audio service with CPU affinity..."
sudo tee /etc/systemd/system/map2-audio-pinned.service > /dev/null <<EOF
[Unit]
Description=MAP2 Audio Platform (CPU Pinned)
After=network.target audio-irq-affinity.service
Wants=audio-irq-affinity.service

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=/home/mm/map2-audio
Environment="PYTHONUNBUFFERED=1"

# Pin backend to CPU1 (general I/O)
ExecStartPre=/usr/bin/taskset -c 1 /bin/true

# Main audio process on CPU2-3 (audio processing cores)
ExecStart=/usr/bin/taskset -c 2,3 /usr/bin/python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# Real-time scheduling
CPUSchedulingPolicy=fifo
CPUSchedulingPriority=80

# CPU affinity enforcement
CPUAffinity=2 3

# Resource limits
LimitRTPRIO=95
LimitMEMLOCK=infinity
LimitNICE=-19

Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

echo -e "  ${GREEN}✓${NC} Service created: map2-audio-pinned.service"
echo "  Note: Use this instead of manual startup for CPU pinning"

# Step 5: Create verification script
echo -e "\n${GREEN}[5/5]${NC} Creating CPU affinity verification script..."
cat > /home/mm/map2-audio/verify_cpu_affinity.sh <<'EOF'
#!/bin/bash
# Verify CPU affinity configuration

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=========================================="
echo "CPU Affinity Verification"
echo "=========================================="
echo

# Check USB IRQ
echo -e "${YELLOW}USB Controller IRQ:${NC}"
IRQ=$(cat /proc/interrupts | grep xhci_hcd | awk '{print $1}' | tr -d ':')
if [ -n "$IRQ" ]; then
    AFFINITY=$(cat /proc/irq/$IRQ/smp_affinity_list 2>/dev/null)
    echo "  IRQ $IRQ affinity: CPU $AFFINITY"
    if [ "$AFFINITY" = "2" ]; then
        echo -e "  ${GREEN}✓ Correctly pinned to CPU2${NC}"
    else
        echo -e "  ${YELLOW}⚠ Expected CPU2, found CPU $AFFINITY${NC}"
    fi
else
    echo -e "  ${RED}✗ USB IRQ not found${NC}"
fi

echo

# Check if isolation is active
echo -e "${YELLOW}CPU Isolation:${NC}"
ISOLATED=$(cat /proc/cmdline | grep -o 'isolcpus=[^ ]*' | cut -d= -f2)
if [ -n "$ISOLATED" ]; then
    echo -e "  ${GREEN}✓ CPUs isolated: $ISOLATED${NC}"
else
    echo -e "  ${YELLOW}⚠ No CPU isolation configured${NC}"
    echo "    Recommendation: Add 'isolcpus=3' to kernel parameters"
fi

echo

# Check for audio processes
echo -e "${YELLOW}Audio Processes:${NC}"
AUDIO_PIDS=$(pgrep -f "uvicorn|python.*main" 2>/dev/null)
if [ -n "$AUDIO_PIDS" ]; then
    for PID in $AUDIO_PIDS; do
        CMD=$(ps -p $PID -o comm=)
        AFFINITY=$(taskset -cp $PID 2>/dev/null | awk '{print $NF}')
        POLICY=$(chrt -p $PID 2>/dev/null | grep "scheduling policy" | awk '{print $4}')
        PRIO=$(chrt -p $PID 2>/dev/null | grep "scheduling priority" | awk '{print $4}')
        
        echo "  PID $PID ($CMD):"
        echo "    CPU affinity: $AFFINITY"
        echo "    Scheduler: $POLICY (priority: $PRIO)"
    done
else
    echo "  No audio processes running"
fi

echo

# Check interrupt distribution
echo -e "${YELLOW}Interrupt Distribution:${NC}"
echo "  Last 5 seconds of USB IRQ processing:"
if [ -n "$IRQ" ]; then
    IRQ_COUNTS_BEFORE=$(cat /proc/interrupts | grep "^ *$IRQ:" | awk '{for(i=2;i<=NF;i++) if($i ~ /^[0-9]+$/) printf "%s ", $i}')
    sleep 5
    IRQ_COUNTS_AFTER=$(cat /proc/interrupts | grep "^ *$IRQ:" | awk '{for(i=2;i<=NF;i++) if($i ~ /^[0-9]+$/) printf "%s ", $i}')
    
    echo "    CPU0 CPU1 CPU2 CPU3 CPU4 CPU5"
    
    # Calculate deltas
    BEFORE=($IRQ_COUNTS_BEFORE)
    AFTER=($IRQ_COUNTS_AFTER)
    DELTAS=()
    for i in {0..5}; do
        DELTA=$((${AFTER[$i]} - ${BEFORE[$i]}))
        DELTAS+=($DELTA)
    done
    
    echo -n "    "
    for DELTA in "${DELTAS[@]}"; do
        printf "%4d " $DELTA
    done
    echo
    
    # Verify CPU2 is handling most IRQs
    MAX_IDX=0
    MAX_VAL=${DELTAS[0]}
    for i in {1..5}; do
        if [ ${DELTAS[$i]} -gt $MAX_VAL ]; then
            MAX_IDX=$i
            MAX_VAL=${DELTAS[$i]}
        fi
    done
    
    if [ $MAX_IDX -eq 2 ]; then
        echo -e "  ${GREEN}✓ CPU2 handling most USB IRQs${NC}"
    else
        echo -e "  ${YELLOW}⚠ CPU$MAX_IDX handling most IRQs (expected CPU2)${NC}"
    fi
fi

echo
echo "=========================================="
echo "Recommendations:"
echo "=========================================="
echo "1. Start audio service with: sudo systemctl start map2-audio-pinned"
echo "2. Add CPU3 isolation: edit /etc/default/grub, add isolcpus=3"
echo "3. Monitor with: watch -n1 'cat /proc/interrupts | grep xhci_hcd'"
echo "4. Pin processes manually: audio-cpu-pin <pid> 2,3"
EOF

chmod +x /home/mm/map2-audio/verify_cpu_affinity.sh
echo -e "  ${GREEN}✓${NC} Verification script created: verify_cpu_affinity.sh"

echo
echo "=========================================="
echo -e "${GREEN}Configuration Complete!${NC}"
echo "=========================================="
echo
echo "Next steps:"
echo "1. Test IRQ pinning: ./verify_cpu_affinity.sh"
echo "2. Add CPU isolation (recommended):"
echo "   - Edit /etc/default/grub"
echo "   - Add: GRUB_CMDLINE_LINUX=\"isolcpus=3\""
echo "   - Run: sudo grub2-mkconfig -o /boot/grub2/grub.cfg"
echo "   - Reboot"
echo "3. Start service: sudo systemctl start map2-audio-pinned"
echo "4. Enable on boot: sudo systemctl enable map2-audio-pinned"
echo
echo "To pin running processes manually:"
echo "  audio-cpu-pin <pid> 2,3"
echo

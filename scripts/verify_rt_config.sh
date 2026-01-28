#!/bin/bash
# MAP2 Real-Time Configuration Verification Script
# Checks if all RT optimizations are properly configured
# Can be run standalone or called from setup.sh

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
WARNINGS=0

# Argument for quick mode (less verbose)
QUICK_MODE=false
if [ "$1" = "--quick" ]; then
    QUICK_MODE=true
fi

check_pass() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASSED++))
}

check_fail() {
    echo -e "${RED}❌ $1${NC}"
    ((FAILED++))
}

check_warn() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((WARNINGS++))
}

# Header (skip in quick mode)
if [ "$QUICK_MODE" = false ]; then
    echo "================================================"
    echo "MAP2 Real-Time Configuration Verification"
    echo "================================================"
    echo
fi

echo "1. USER CONFIGURATION"
echo "---------------------"

# Check if user is in audio group
if groups | grep -q audio; then
    check_pass "User is in audio group"
else
    check_fail "User is NOT in audio group"
    echo "   Fix: sudo usermod -aG audio \$USER && logout"
fi

# Check RT priority limits
rtprio=$(ulimit -r)
if [ "$rtprio" -ge 95 ] 2>/dev/null; then
    check_pass "RT priority limit: $rtprio (good)"
elif [ "$rtprio" -gt 0 ] 2>/dev/null; then
    check_warn "RT priority limit: $rtprio (works, but < 95)"
else
    check_fail "RT priority limit: $rtprio (insufficient)"
    echo "   Fix: Add audio group to /etc/security/limits.d/99-audio-realtime.conf"
fi

# Check memlock limit
memlock=$(ulimit -l)
if [ "$memlock" = "unlimited" ]; then
    check_pass "Memory lock: unlimited"
elif [ "$memlock" -ge 4194304 ] 2>/dev/null; then
    check_warn "Memory lock: $memlock KB (sufficient but not unlimited)"
else
    check_fail "Memory lock: $memlock KB (too low)"
fi

echo ""
echo "2. KERNEL CONFIGURATION"
echo "------------------------"

# Check kernel preemption
kernel=$(uname -v)
if echo "$kernel" | grep -qi "PREEMPT"; then
    if echo "$kernel" | grep -qi "PREEMPT_RT"; then
        check_pass "Kernel: PREEMPT_RT (excellent)"
    else
        check_pass "Kernel: PREEMPT (good)"
    fi
else
    check_warn "Kernel: Non-preemptible (suboptimal for RT)"
fi

# Check CPU isolation
cmdline=$(cat /proc/cmdline)
if echo "$cmdline" | grep -q "isolcpus"; then
    isolated=$(echo "$cmdline" | grep -o "isolcpus=[0-9,-]*" | cut -d= -f2)
    check_pass "CPU isolation: $isolated"
else
    check_warn "CPU isolation: Not configured"
    echo "   Optional: Add isolcpus=2,3 to GRUB_CMDLINE_LINUX"
fi

# Check threaded IRQs
if echo "$cmdline" | grep -q "threadirqs"; then
    check_pass "Threaded IRQs: enabled"
else
    check_warn "Threaded IRQs: Not enabled"
fi

# Check nohz_full
if echo "$cmdline" | grep -q "nohz_full"; then
    nohz=$(echo "$cmdline" | grep -o "nohz_full=[0-9,-]*" | cut -d= -f2)
    check_pass "Tickless CPUs: $nohz"
else
    check_warn "Tickless CPUs: Not configured"
fi

echo ""
echo "3. CPU CONFIGURATION"
echo "--------------------"

# Check CPU count
cpus=$(nproc)
if [ "$cpus" -ge 4 ]; then
    check_pass "CPU cores: $cpus (sufficient)"
else
    check_warn "CPU cores: $cpus (may limit performance)"
fi

# Check CPU governor
if [ -f /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor ]; then
    governor=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor)
    if [ "$governor" = "performance" ]; then
        check_pass "CPU governor: performance"
    else
        check_warn "CPU governor: $governor (not performance)"
        echo "   Recommend: echo performance | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor"
    fi
else
    check_warn "CPU governor: Not available (may be disabled in BIOS)"
fi

# Check isolated CPUs
if [ -f /sys/devices/system/cpu/isolated ]; then
    isolated=$(cat /sys/devices/system/cpu/isolated)
    if [ -n "$isolated" ]; then
        check_pass "Isolated CPUs: $isolated"
    else
        check_warn "Isolated CPUs: None"
    fi
fi

echo ""
echo "4. MEMORY CONFIGURATION"
echo "------------------------"

# Check swappiness
swappiness=$(cat /proc/sys/vm/swappiness)
if [ "$swappiness" -le 10 ]; then
    check_pass "Swappiness: $swappiness (good)"
elif [ "$swappiness" -le 30 ]; then
    check_warn "Swappiness: $swappiness (acceptable)"
else
    check_warn "Swappiness: $swappiness (high for RT)"
    echo "   Recommend: echo 'vm.swappiness = 10' | sudo tee -a /etc/sysctl.conf"
fi

# Check huge pages
hugepages=$(grep "^HugePages_Total:" /proc/meminfo | awk '{print $2}')
if [ "$hugepages" -gt 0 ] 2>/dev/null; then
    check_pass "Huge pages: $hugepages allocated"
else
    check_warn "Huge pages: Not configured (optional)"
fi

# Check total memory
mem_gb=$(free -g | grep "^Mem:" | awk '{print $2}')
if [ "$mem_gb" -ge 8 ]; then
    check_pass "Total memory: ${mem_gb}GB (sufficient)"
else
    check_warn "Total memory: ${mem_gb}GB (may limit performance)"
fi

echo ""
echo "5. AUDIO CONFIGURATION"
echo "----------------------"

# Check for audio hardware
if [ -f /proc/asound/cards ]; then
    cards=$(grep -c "^[[:space:]]*[0-9]" /proc/asound/cards)
    if [ "$cards" -gt 0 ]; then
        check_pass "Audio cards detected: $cards"
    else
        check_warn "No audio cards detected"
    fi
else
    check_warn "ALSA not available"
fi

# Check USB autosuspend
if [ -f /sys/module/usbcore/parameters/autosuspend ]; then
    autosuspend=$(cat /sys/module/usbcore/parameters/autosuspend)
    if [ "$autosuspend" = "-1" ]; then
        check_pass "USB autosuspend: disabled"
    else
        check_warn "USB autosuspend: $autosuspend seconds"
        echo "   Recommend: echo '-1' | sudo tee /sys/module/usbcore/parameters/autosuspend"
    fi
fi

echo ""
echo "6. I/O SCHEDULER"
echo "----------------"

# Check I/O scheduler for primary disk
if [ -f /sys/block/nvme0n1/queue/scheduler ]; then
    scheduler=$(cat /sys/block/nvme0n1/queue/scheduler | grep -o "\[.*\]" | tr -d '[]')
    disk="nvme0n1"
elif [ -f /sys/block/sda/queue/scheduler ]; then
    scheduler=$(cat /sys/block/sda/queue/scheduler | grep -o "\[.*\]" | tr -d '[]')
    disk="sda"
else
    scheduler="unknown"
    disk="unknown"
fi

if [ "$scheduler" = "deadline" ] || [ "$scheduler" = "mq-deadline" ]; then
    check_pass "I/O scheduler ($disk): $scheduler (optimal)"
elif [ "$scheduler" = "noop" ] || [ "$scheduler" = "none" ]; then
    check_pass "I/O scheduler ($disk): $scheduler (good for SSD)"
else
    check_warn "I/O scheduler ($disk): $scheduler (not optimal for RT)"
fi

echo ""
echo "7. PROCESS PRIORITIES (Runtime Test)"
echo "-------------------------------------"

# Test if we can set RT priority
python3 << 'EOF'
import os
import sys

try:
    # Try to set RT priority
    os.sched_setscheduler(0, os.SCHED_FIFO, os.sched_param(50))
    print("\033[0;32m✅ Can set RT priority (SCHED_FIFO)\033[0m")
    # Reset to normal
    os.sched_setscheduler(0, os.SCHED_OTHER, os.sched_param(0))
    sys.exit(0)
except PermissionError:
    print("\033[0;31m❌ Cannot set RT priority (permission denied)\033[0m")
    print("   Make sure you logged out/in after adding to audio group")
    sys.exit(1)
except Exception as e:
    print(f"\033[1;33m⚠️  RT priority test failed: {e}\033[0m")
    sys.exit(2)
EOF

rt_test=$?
if [ $rt_test -eq 0 ]; then
    ((PASSED++))
elif [ $rt_test -eq 1 ]; then
    ((FAILED++))
else
    ((WARNINGS++))
fi

# Test CPU affinity
python3 << 'EOF'
import os
import sys

try:
    # Get current affinity
    current = os.sched_getaffinity(0)
    # Try to set affinity to CPU 0
    os.sched_setaffinity(0, {0})
    # Restore
    os.sched_setaffinity(0, current)
    print("\033[0;32m✅ Can set CPU affinity\033[0m")
    sys.exit(0)
except Exception as e:
    print(f"\033[1;33m⚠️  Cannot set CPU affinity: {e}\033[0m")
    sys.exit(1)
EOF

aff_test=$?
if [ $aff_test -eq 0 ]; then
    ((PASSED++))
else
    ((WARNINGS++))
fi

echo ""
echo "8. MAP2 SPECIFIC"
echo "----------------"

# Check if MAP2 is installed
if [ -f "app/main.py" ]; then
    check_pass "MAP2 installation found"
else
    check_warn "MAP2 installation not found in current directory"
fi

# Check if systemd service exists
if [ -f /etc/systemd/system/map2-backend.service ]; then
    check_pass "MAP2 systemd service installed"
    
    # Check if service has RT configuration
    if grep -q "LimitRTPRIO" /etc/systemd/system/map2-backend.service; then
        check_pass "Service configured with RT limits"
    else
        check_warn "Service not configured with RT limits"
    fi
else
    check_warn "MAP2 systemd service not installed"
fi

echo ""
echo "================================================"
echo "VERIFICATION RESULTS"
echo "================================================"
echo ""
echo -e "${GREEN}✅ Passed: $PASSED${NC}"
echo -e "${YELLOW}⚠️  Warnings: $WARNINGS${NC}"
echo -e "${RED}❌ Failed: $FAILED${NC}"
echo ""

# Overall assessment
if [ $FAILED -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ EXCELLENT! System is optimally configured for RT audio.${NC}"
    grade="A+"
    exit_code=0
elif [ $FAILED -eq 0 ] && [ $WARNINGS -le 3 ]; then
    echo -e "${GREEN}✅ GOOD! System is well configured for RT audio.${NC}"
    if [ "$QUICK_MODE" = false ]; then
        echo "   Optional improvements available (see warnings above)"
    fi
    grade="A"
    exit_code=0
elif [ $FAILED -eq 0 ]; then
    echo -e "${YELLOW}⚠️  ACCEPTABLE. System will work but some optimizations missing.${NC}"
    if [ "$QUICK_MODE" = false ]; then
        echo "   Review warnings above for improvements"
    fi
    grade="B"
    exit_code=0
elif [ $FAILED -le 2 ]; then
    echo -e "${YELLOW}⚠️  BASIC. System may experience audio dropouts under load.${NC}"
    if [ "$QUICK_MODE" = false ]; then
        echo "   Address failed checks above"
    fi
    grade="C"
    exit_code=1
else
    echo -e "${RED}❌ POOR. System not configured for RT audio.${NC}"
    if [ "$QUICK_MODE" = false ]; then
        echo "   Run ./setup.sh to configure"
    fi
    grade="D"
    exit_code=2
fi

echo ""
echo "RT Configuration Grade: $grade"
echo ""

if [ "$QUICK_MODE" = false ]; then
    if [ $FAILED -gt 0 ] || [ $WARNINGS -gt 5 ]; then
        echo "To improve configuration, run:"
        echo "  ./setup.sh"
        echo ""
        echo "For manual configuration, see:"
        echo "  REALTIME_HARDWARE_OPTIMIZATION.md"
    fi
    echo ""
fi

exit $exit_code

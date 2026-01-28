#!/bin/bash
# MAP2 Real-Time Optimization - Automatic Setup Script
# Configures system for professional low-latency audio processing

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "================================================"
echo "MAP2 Audio Platform - RT Optimization Setup"
echo "================================================"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo -e "${RED}⚠️  Do not run this script as root!${NC}"
    echo "Run as normal user. Script will use sudo when needed."
    exit 1
fi

# Check if sudo is available
if ! command -v sudo &> /dev/null; then
    echo -e "${RED}❌ sudo not found. Please install sudo first.${NC}"
    exit 1
fi

echo "This script will configure your system for real-time audio."
echo "Changes will be made to:"
echo "  - /etc/security/limits.d/"
echo "  - /etc/modprobe.d/"
echo "  - /etc/sysctl.conf"
echo "  - /etc/default/grub (optional)"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "=== PHASE 1: Real-Time Privileges ==="
echo "-------------------------------------"

# Create RT limits configuration
echo -e "${YELLOW}⚙️  Configuring real-time privileges...${NC}"
sudo tee /etc/security/limits.d/99-audio-realtime.conf > /dev/null << 'EOF'
# Real-time privileges for audio group
# Created by MAP2 setup script
@audio   -  rtprio     95
@audio   -  nice       -19
@audio   -  memlock    unlimited
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ RT privileges configured${NC}"
else
    echo -e "${RED}❌ Failed to configure RT privileges${NC}"
    exit 1
fi

# Add user to audio group
echo -e "${YELLOW}⚙️  Adding user to audio group...${NC}"
sudo usermod -aG audio $USER

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ User added to audio group${NC}"
    echo -e "${YELLOW}   ⚠️  You must LOG OUT and LOG IN for this to take effect!${NC}"
else
    echo -e "${RED}❌ Failed to add user to audio group${NC}"
fi

echo ""
echo "=== PHASE 2: USB Audio Optimization ==="
echo "---------------------------------------"

# Disable USB autosuspend
echo -e "${YELLOW}⚙️  Disabling USB autosuspend for audio...${NC}"
sudo tee /etc/modprobe.d/audio-usb.conf > /dev/null << 'EOF'
# Disable USB power management for audio
# Created by MAP2 setup script
options usbcore autosuspend=-1
options snd_usb_audio nrpacks=1
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ USB audio optimized${NC}"
else
    echo -e "${RED}❌ Failed to optimize USB audio${NC}"
fi

echo ""
echo "=== PHASE 3: Memory Configuration ==="
echo "-------------------------------------"

# Configure swappiness and huge pages
echo -e "${YELLOW}⚙️  Configuring memory settings...${NC}"

# Check if already configured
if ! grep -q "vm.swappiness" /etc/sysctl.conf; then
    echo "# MAP2 Audio - Memory optimization" | sudo tee -a /etc/sysctl.conf > /dev/null
    echo "vm.swappiness = 10" | sudo tee -a /etc/sysctl.conf > /dev/null
    echo "vm.nr_hugepages = 256" | sudo tee -a /etc/sysctl.conf > /dev/null
    sudo sysctl -p > /dev/null
    echo -e "${GREEN}✅ Memory configured (swappiness=10, hugepages=256)${NC}"
else
    echo -e "${YELLOW}⚠️  Memory settings already configured${NC}"
fi

echo ""
echo "=== PHASE 4: I/O Scheduler ==="
echo "------------------------------"

# Configure I/O scheduler via udev
echo -e "${YELLOW}⚙️  Configuring I/O scheduler...${NC}"
sudo tee /etc/udev/rules.d/60-ioschedulers.rules > /dev/null << 'EOF'
# Set deadline/mq-deadline scheduler for low latency
# Created by MAP2 setup script
ACTION=="add|change", KERNEL=="sd[a-z]", ATTR{queue/scheduler}="deadline"
ACTION=="add|change", KERNEL=="nvme[0-9]n[0-9]", ATTR{queue/scheduler}="mq-deadline"
EOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ I/O scheduler configured${NC}"
else
    echo -e "${RED}❌ Failed to configure I/O scheduler${NC}"
fi

echo ""
echo "=== PHASE 5: CPU Isolation (OPTIONAL) ==="
echo "-----------------------------------------"
echo ""
echo "CPU isolation provides the best RT performance but requires:"
echo "  - System reboot"
echo "  - GRUB configuration changes"
echo "  - Dedicating 2 CPU cores exclusively to audio"
echo ""
echo "Recommended for: Dedicated audio workstations"
echo "Not recommended for: General-purpose computers, laptops"
echo ""
read -p "Configure CPU isolation? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${YELLOW}⚙️  Configuring CPU isolation...${NC}"
    
    # Backup GRUB config
    sudo cp /etc/default/grub /etc/default/grub.backup.$(date +%Y%m%d_%H%M%S)
    
    # Get current cmdline
    CURRENT_CMDLINE=$(grep "^GRUB_CMDLINE_LINUX=" /etc/default/grub | cut -d'"' -f2)
    
    # Add RT parameters if not already present
    if [[ ! $CURRENT_CMDLINE =~ "isolcpus" ]]; then
        NEW_CMDLINE="$CURRENT_CMDLINE isolcpus=2,3 nohz_full=2,3 rcu_nocbs=2,3 threadirqs"
        sudo sed -i "s|^GRUB_CMDLINE_LINUX=.*|GRUB_CMDLINE_LINUX=\"$NEW_CMDLINE\"|" /etc/default/grub
        
        echo -e "${GREEN}✅ GRUB configured with RT parameters${NC}"
        echo -e "${YELLOW}   Isolated CPUs: 2,3${NC}"
        echo -e "${YELLOW}   Other parameters: nohz_full, rcu_nocbs, threadirqs${NC}"
        
        # Update GRUB
        echo ""
        echo -e "${YELLOW}⚙️  Updating GRUB...${NC}"
        if [ -f /boot/grub2/grub.cfg ]; then
            sudo grub2-mkconfig -o /boot/grub2/grub.cfg > /dev/null
        elif [ -f /boot/efi/EFI/fedora/grub.cfg ]; then
            sudo grub2-mkconfig -o /boot/efi/EFI/fedora/grub.cfg > /dev/null
        else
            echo -e "${RED}❌ GRUB config file not found${NC}"
            echo "   You'll need to manually run: sudo grub2-mkconfig -o /boot/grub2/grub.cfg"
        fi
        
        echo -e "${GREEN}✅ GRUB updated${NC}"
        echo -e "${YELLOW}   ⚠️  REBOOT REQUIRED for CPU isolation to take effect${NC}"
    else
        echo -e "${YELLOW}⚠️  CPU isolation already configured${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Skipping CPU isolation${NC}"
fi

echo ""
echo "=== PHASE 6: CPU Governor (OPTIONAL) ==="
echo "----------------------------------------"
echo ""

# Check if cpufreq is available
if [ -d /sys/devices/system/cpu/cpu0/cpufreq ]; then
    echo "CPU frequency scaling is available."
    read -p "Set CPU governor to 'performance'? (y/n) " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}⚙️  Creating CPU performance service...${NC}"
        
        sudo tee /etc/systemd/system/cpu-performance.service > /dev/null << 'EOF'
[Unit]
Description=Set CPU governor to performance
After=multi-user.target

[Service]
Type=oneshot
ExecStart=/bin/bash -c 'for cpu in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do echo performance > $cpu; done'

[Install]
WantedBy=multi-user.target
EOF
        
        sudo systemctl daemon-reload
        sudo systemctl enable cpu-performance.service
        sudo systemctl start cpu-performance.service
        
        echo -e "${GREEN}✅ CPU governor set to performance${NC}"
    else
        echo -e "${YELLOW}⚠️  Skipping CPU governor configuration${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  CPU frequency scaling not available (may be disabled in BIOS)${NC}"
fi

echo ""
echo "=== PHASE 7: MAP2 Systemd Service ==="
echo "-------------------------------------"
echo ""

if [ -f /etc/systemd/system/map2-backend.service ]; then
    echo "MAP2 backend service already exists."
    read -p "Update with RT configuration? (y/n) " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}⚙️  Updating MAP2 service...${NC}"
        
        sudo tee /etc/systemd/system/map2-backend.service > /dev/null << EOF
[Unit]
Description=MAP2 Audio Backend
After=network.target sound.target

[Service]
Type=simple
User=$USER
Group=audio
WorkingDirectory=$PWD

# Real-time priority
LimitRTPRIO=95
LimitNICE=-19
LimitMEMLOCK=infinity

# CPU affinity (isolated cores 2,3)
CPUAffinity=2 3

# Nice level
Nice=-19

# I/O priority
IOSchedulingClass=realtime
IOSchedulingPriority=0

Environment=PYTHONPATH=$PWD
ExecStart=/usr/bin/python3 -m app.main

Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
        
        sudo systemctl daemon-reload
        echo -e "${GREEN}✅ MAP2 service updated with RT configuration${NC}"
    else
        echo -e "${YELLOW}⚠️  Skipping service update${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  MAP2 service not found at /etc/systemd/system/map2-backend.service${NC}"
    echo "   You can install it later with: sudo ./setup.sh"
fi

echo ""
echo "================================================"
echo "OPTIMIZATION COMPLETE"
echo "================================================"
echo ""
echo -e "${GREEN}✅ Real-time configuration applied successfully!${NC}"
echo ""
echo "Summary of changes:"
echo "  ✅ Real-time privileges configured"
echo "  ✅ USB audio optimized"
echo "  ✅ Memory settings tuned"
echo "  ✅ I/O scheduler configured"

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "  ✅ CPU isolation configured (requires reboot)"
fi

echo ""
echo "IMPORTANT NEXT STEPS:"
echo ""
echo "1. LOG OUT and LOG IN (required for audio group membership)"
echo ""
if grep -q "isolcpus" /etc/default/grub 2>/dev/null; then
    echo "2. REBOOT your system (required for CPU isolation)"
    echo ""
fi
echo "3. After reboot, verify RT configuration:"
echo "   cd $PWD"
echo "   ./scripts/verify_rt_config.sh"
echo ""
echo "4. Start MAP2 backend:"
echo "   python3 -m app.main"
echo ""
echo "5. Monitor RT performance:"
echo "   curl http://localhost:8080/api/metrics/realtime"
echo ""
echo "For troubleshooting, see: REALTIME_HARDWARE_OPTIMIZATION.md"
echo ""

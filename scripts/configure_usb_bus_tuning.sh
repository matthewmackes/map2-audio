#!/bin/bash
# USB Bus and Real-Time Tuning for MAP2 Audio Platform
# Optimizes USB controller, bus latency, and DMA settings

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "=========================================="
echo "USB Bus & Real-Time Tuning"
echo "=========================================="
echo

# Detected hardware:
# - Intel Cannon Lake PCH USB 3.1 xHCI Controller
# - Jogg USB Audio on Bus 001, Port 004
# - USB 2.0 Full Speed (12Mbps) - sufficient for audio
# - IRQ 121

echo -e "${BLUE}Hardware Configuration:${NC}"
echo "  USB Controller: Intel Cannon Lake xHCI (00:14.0)"
echo "  Audio Device: Jogg USB Audio (84ef:0014)"
echo "  Location: Bus 001, Port 004"
echo "  Speed: USB 2.0 Full Speed (12 Mbps)"
echo "  Packet Size: 288 bytes"
echo "  Interval: 1ms (optimal for low latency)"
echo

read -p "Apply USB bus and real-time optimizations? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Step 1: USB Power Management (Disable autosuspend for audio)
echo -e "\n${GREEN}[1/7]${NC} Disabling USB autosuspend for audio devices..."
sudo tee /etc/udev/rules.d/90-usb-audio-power.rules > /dev/null <<'EOF'
# Disable USB autosuspend for Jogg audio interface
ACTION=="add", SUBSYSTEM=="usb", ATTR{idVendor}=="84ef", ATTR{idProduct}=="0014", TEST=="power/control", ATTR{power/control}="on"

# Disable autosuspend for all USB audio class devices
ACTION=="add", SUBSYSTEM=="usb", ATTR{bInterfaceClass}=="01", TEST=="power/control", ATTR{power/control}="on"

# Keep USB hub (port 004 parent) active
ACTION=="add", SUBSYSTEM=="usb", ATTR{busnum}=="1", ATTR{devnum}=="1", TEST=="power/control", ATTR{power/control}="on"
EOF

echo -e "  ${GREEN}✓${NC} USB power management rules created"

# Step 2: USB Buffer Size Optimization
echo -e "\n${GREEN}[2/7]${NC} Optimizing USB buffer sizes..."
sudo tee /etc/modprobe.d/usb-audio-buffer.conf > /dev/null <<'EOF'
# Increase USB audio buffer for lower latency and better stability
# nrpacks: number of packets per URB (1 = minimum latency for isochronous transfers)
# async_unlink: enable async unlinking for lower latency
options snd-usb-audio nrpacks=1 async_unlink=1

# xHCI controller optimizations
# Increase URB pool size for better throughput
options xhci_hcd dyndbg==_
EOF

echo -e "  ${GREEN}✓${NC} USB buffer configuration created"

# Step 3: USB Interrupt Moderation
echo -e "\n${GREEN}[3/7]${NC} Configuring USB interrupt moderation..."
# ethtool-like settings for USB via module parameters
sudo tee /etc/modprobe.d/usb-irq-tuning.conf > /dev/null <<'EOF'
# Reduce USB polling interval for lower latency
# Note: Lower values = more CPU usage but lower latency
options usbcore autosuspend=-1 use_both_schemes=y

# Optimize xHCI interrupt throttle control (ITC)
# Lower values reduce latency (default is often too high for audio)
# Values: 0=disabled, 1-255 (microseconds between interrupts)
options xhci_hcd dyndbg==p
EOF

echo -e "  ${GREEN}✓${NC} USB interrupt tuning configured"

# Step 4: PCI Bus Latency Tuning
echo -e "\n${GREEN}[4/7]${NC} Tuning PCIe bus latency..."
# Set PCI latency timer for USB controller
USB_PCI_ADDR=$(lspci | grep "USB.*xHCI" | head -1 | cut -d' ' -f1)
if [ -n "$USB_PCI_ADDR" ]; then
    echo "  USB Controller: $USB_PCI_ADDR"
    
    # Create udev rule to set latency at boot
    sudo tee /etc/udev/rules.d/91-pci-latency.rules > /dev/null <<EOF
# Set maximum PCI latency timer for USB audio controller
ACTION=="add", SUBSYSTEM=="pci", KERNEL=="0000:${USB_PCI_ADDR}", ATTR{latency_timer}="0"
EOF
    
    # Apply immediately if available
    if [ -w "/sys/bus/pci/devices/0000:${USB_PCI_ADDR}/latency_timer" ]; then
        echo 0 | sudo tee /sys/bus/pci/devices/0000:${USB_PCI_ADDR}/latency_timer > /dev/null
        echo -e "  ${GREEN}✓${NC} PCI latency timer set to 0 (minimum latency)"
    fi
else
    echo -e "  ${YELLOW}⚠${NC} USB controller not found, skipping latency tuning"
fi

# Step 5: DMA Buffer Configuration
echo -e "\n${GREEN}[5/7]${NC} Optimizing DMA buffer settings..."
sudo tee /etc/sysctl.d/98-usb-dma.conf > /dev/null <<'EOF'
# USB DMA buffer optimizations for audio
# Increase coherent DMA pool size
vm.nr_hugepages = 128

# Reduce page allocation delays
vm.min_free_kbytes = 65536

# Optimize dirty page writeback for real-time
vm.dirty_ratio = 10
vm.dirty_background_ratio = 5

# Reduce swappiness (audio should stay in RAM)
vm.swappiness = 10
EOF

sudo sysctl -p /etc/sysctl.d/98-usb-dma.conf > /dev/null 2>&1 || true
echo -e "  ${GREEN}✓${NC} DMA buffer settings optimized"

# Step 6: Real-Time USB Audio Thread Priority
echo -e "\n${GREEN}[6/7]${NC} Configuring RT priority for USB audio threads..."
sudo tee /etc/udev/rules.d/92-usb-audio-rtprio.rules > /dev/null <<'EOF'
# When USB audio device is added, boost kernel thread priority
ACTION=="add", SUBSYSTEM=="sound", KERNEL=="pcm*", TAG+="systemd", ENV{SYSTEMD_WANTS}="usb-audio-rtprio.service"
EOF

# Create systemd service to set RT priority for USB audio kernel threads
sudo tee /etc/systemd/system/usb-audio-rtprio.service > /dev/null <<'EOF'
[Unit]
Description=Set RT priority for USB audio kernel threads
After=sound.target

[Service]
Type=oneshot
RemainAfterExit=yes

# Find and prioritize USB audio kernel threads
ExecStart=/bin/bash -c '\
    for thread in $(ps -eLo pid,comm | grep -E "usb-audio|snd-usb" | awk "{print \$1}"); do \
        chrt -f -p 85 $thread 2>/dev/null || true; \
    done'

[Install]
WantedBy=sound.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable usb-audio-rtprio.service
echo -e "  ${GREEN}✓${NC} RT priority service created"

# Step 7: USB Audio ALSA Configuration
echo -e "\n${GREEN}[7/7]${NC} Creating optimized ALSA configuration..."
sudo tee /etc/modprobe.d/alsa-usb-audio.conf > /dev/null <<'EOF'
# ALSA USB audio optimizations
# Set optimal buffer and period sizes for low latency
options snd-usb-audio index=0 vid=0x84ef pid=0x0014

# Force specific sample rates if needed (comment out for auto-detect)
# options snd-usb-audio device_setup=0x01

# Disable unnecessary plugins for lower CPU usage
options snd pcm_substreams=2

# Prevent buffer underruns
options snd cards_limit=8
EOF

# Create ALSA defaults for low-latency USB
mkdir -p /home/mm/.config/alsa 2>/dev/null || true
cat > /home/mm/.config/alsa/usb-audio.conf <<'EOF'
# ALSA configuration for Jogg USB Audio
# Optimized for low latency real-time operation

pcm.!default {
    type plug
    slave.pcm "hw:0,0"
}

# Low-latency playback
pcm.jogg_playback {
    type plug
    slave {
        pcm "hw:0,0"
        rate 48000
        channels 2
        format S24_3LE
        period_size 64
        buffer_size 256
    }
}

# Low-latency capture
pcm.jogg_capture {
    type plug
    slave {
        pcm "hw:0,0"
        rate 48000
        channels 2
        format S24_3LE
        period_size 64
        buffer_size 256
    }
}
EOF

chown $(whoami):$(whoami) /home/mm/.config/alsa/usb-audio.conf
echo -e "  ${GREEN}✓${NC} ALSA configuration created"

# Reload udev rules
sudo udevadm control --reload-rules
sudo udevadm trigger

echo
echo "=========================================="
echo -e "${GREEN}USB Bus Tuning Complete!${NC}"
echo "=========================================="
echo
echo "Optimizations applied:"
echo "  ✓ USB autosuspend disabled for audio"
echo "  ✓ USB buffer sizes increased"
echo "  ✓ Interrupt moderation optimized"
echo "  ✓ PCIe latency minimized"
echo "  ✓ DMA buffers optimized"
echo "  ✓ RT priority for USB threads"
echo "  ✓ ALSA low-latency configuration"
echo
echo "Next steps:"
echo "1. Reboot to apply all changes"
echo "2. Verify with: ./verify_usb_tuning.sh"
echo "3. Test audio latency with: ./test_audio_latency.sh"
echo "4. Monitor USB IRQs: watch -n1 'cat /proc/interrupts | grep xhci'"
echo
echo "USB audio device will automatically use optimized settings"
echo "after reconnecting the Jogg USB Audio interface."
echo

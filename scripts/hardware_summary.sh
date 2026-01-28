#!/bin/bash
# Hardware Summary - MAP2 Audio Platform
# Real-time configuration capabilities

echo "=============================================="
echo "   MAP2 Audio Platform - Hardware Summary"
echo "=============================================="
echo

echo "DATE: $(date)"
echo "SYSTEM: $(hostname)"
echo

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "CPU CONFIGURATION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
lscpu | grep -E "Model name|CPU\(s\)|Thread|Core\(s\)|Socket|MHz|L3 cache"
echo

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "AUDIO HARDWARE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
lsusb | grep -i audio
echo
echo "USB Topology:"
lsusb -t | grep -A 3 "Audio"
echo

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "USB CONTROLLER"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
lspci | grep USB
USB_IRQ=$(cat /proc/interrupts | grep xhci_hcd | awk '{print $1}' | tr -d ':')
if [ -n "$USB_IRQ" ]; then
    echo "IRQ: $USB_IRQ"
    echo "Affinity: CPU $(cat /proc/irq/$USB_IRQ/smp_affinity_list 2>/dev/null)"
    echo -n "Interrupt Counts: "
    cat /proc/interrupts | grep "^ *$USB_IRQ:" | awk '{for(i=2;i<=NF;i++) if($i ~ /^[0-9]+$/) printf "%s ", $i}'
    echo
fi
echo

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "REAL-TIME STATUS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -n "Kernel: "
uname -r | grep -o "PREEMPT[^ ]*" || echo "NOT PREEMPT"

echo -n "CPU Isolation: "
cat /proc/cmdline | grep -o "isolcpus=[^ ]*" || echo "None"

echo -n "Audio Limits: "
if grep -q "@audio.*rtprio" /etc/security/limits.d/*.conf 2>/dev/null; then
    echo "Configured"
else
    echo "Not configured"
fi

echo -n "USB Power Management: "
USB_AUDIO_POWER=$(cat /sys/bus/usb/devices/1-4/power/control 2>/dev/null)
if [ "$USB_AUDIO_POWER" = "on" ]; then
    echo "Optimized (on)"
else
    echo "Default ($USB_AUDIO_POWER)"
fi
echo

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "OPTIMIZATION RECOMMENDATIONS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "🎯 Optimal CPU Core Assignment:"
echo "   CPU0: System/Kernel (reserved)"
echo "   CPU1: FastAPI Backend"
echo "   CPU2: USB IRQ Handler (pin IRQ $USB_IRQ here)"
echo "   CPU3: Audio DSP (isolate with isolcpus=3)"
echo "   CPU4: Web UI/Database"
echo "   CPU5: Monitoring/Background"
echo
echo "⚡ Key Optimizations:"
echo "   1. Pin USB IRQ to CPU2: ./configure_cpu_pinning.sh"
echo "   2. Isolate CPU3: Edit /etc/default/grub"
echo "   3. USB bus tuning: ./configure_usb_bus_tuning.sh"
echo "   4. Deploy service: systemctl start map2-audio-pinned"
echo
echo "📊 Expected Performance:"
echo "   Current latency: ~15-20ms (estimated)"
echo "   After optimization: 2-5ms (target Grade A+)"
echo
echo "📖 Full details: CPU_PINNING_USB_OPTIMIZATION.md"
echo
echo "=============================================="

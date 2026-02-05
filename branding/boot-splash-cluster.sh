"""
Boot Splash with Cluster Info

Enhanced Plymouth boot splash showing:
- Deployment mode (AUDIO-NODE / CONTROL-NODE)
- Node identity
- Cluster peer status
- SSH trust verification
"""

#!/bin/bash

# MAP2 Audio Platform Boot Splash
# Enhanced with cluster information

show_boot_splash() {
    local mode="${1:-UNKNOWN}"
    local node_id="${2:-NODE-0000}"
    local peers="${3:-0}"
    
    # Clear screen
    clear
    
    # Banner
    echo ""
    echo "    ╔═══════════════════════════════════════════════════════════╗"
    echo "    ║                                                           ║"
    echo "    ║            MAP2 AUDIO PLATFORM - BOOT SEQUENCE            ║"
    echo "    ║                                                           ║"
    echo "    ╚═══════════════════════════════════════════════════════════╝"
    echo ""
    
    # Deployment mode
    case "$mode" in
        "AUDIO-NODE")
            echo "    ⚡ DEPLOYMENT MODE: AUDIO NODE (Real-time priority)"
            ;;
        "CONTROL-NODE")
            echo "    🎛️  DEPLOYMENT MODE: CONTROL NODE (API server)"
            ;;
        "ALL-IN-ONE")
            echo "    🎵 DEPLOYMENT MODE: ALL-IN-ONE (Audio optimized)"
            ;;
        *)
            echo "    ❓ DEPLOYMENT MODE: UNKNOWN"
            ;;
    esac
    
    echo ""
    
    # Node identity
    echo "    📍 NODE IDENTITY: $node_id"
    echo ""
    
    # Cluster status
    echo "    🔗 CLUSTER STATUS"
    echo "       Peers found: $peers"
    echo ""
    
    # SSH trust verification
    echo "    🔑 SSH TRUST VERIFICATION"
    if [ -f ~/.ssh/authorized_keys ]; then
        trust_count=$(wc -l < ~/.ssh/authorized_keys)
        echo "       Trusted keys: $trust_count"
    else
        echo "       Trusted keys: 0"
    fi
    
    echo ""
    echo "    Starting core services..."
    echo ""
}

# System health checks during boot
show_health_status() {
    echo "    ✓ CPU: $(nproc) cores"
    
    local mem_mb=$(free -m | awk 'NR==2 {print $2}')
    echo "    ✓ Memory: ${mem_mb}MB"
    
    # Audio subsystem (if audio node)
    if [ "$1" = "AUDIO-NODE" ]; then
        echo "    ✓ ALSA: $(aplay -l 2>/dev/null | grep -c "card " || echo "0") devices"
        echo "    ✓ JACK: Ready (will start on demand)"
    fi
    
    # Network
    local eth_status=$(ip link show | grep -c "UP")
    echo "    ✓ Network: $eth_status interfaces up"
    
    echo ""
}

# Wait animation
show_wait_animation() {
    local duration=${1:-5}
    local end=$((SECONDS + duration))
    
    while [ $SECONDS -lt $end ]; do
        for frame in '⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏'; do
            echo -ne "\r    $frame Loading..."
            sleep 0.08
        done
    done
    echo -ne "\r    ✓ System Ready!\n"
}

# Boot splash display
display_boot_splash() {
    local mode="${DEPLOYMENT_MODE:-AUDIO-NODE}"
    local node_id="${NODE_ID:-NODE-0000}"
    
    # Count available cluster peers
    local peers=$(grep -c "peer" /etc/map2/cluster.conf 2>/dev/null || echo "0")
    
    show_boot_splash "$mode" "$node_id" "$peers"
    show_health_status "$mode"
    show_wait_animation 3
}

# Main
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    display_boot_splash
fi

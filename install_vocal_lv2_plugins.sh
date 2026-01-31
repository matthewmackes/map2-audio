#!/bin/bash
# ============================================================================
# MAP2 Audio - LV2 Vocal Plugin Installation Script
# Installs comprehensive suite of open-source LV2 plugins for vocal processing
# ============================================================================

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  MAP2 Audio - LV2 Vocal Processing Plugin Installer           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    echo "⚠️  Do not run as root. Run as regular user with sudo access."
    exit 1
fi

# Function to install package if not already installed
install_if_missing() {
    local package=$1
    local description=$2
    
    if rpm -q "$package" &>/dev/null; then
        echo "✅ $description already installed"
    else
        echo "📦 Installing $description..."
        sudo dnf install -y "$package"
        echo "✅ $description installed"
    fi
}

echo "Installing LV2 plugin packages..."
echo ""

# Calf Studio Gear - Professional audio effects
install_if_missing "lv2-calf-plugins" "Calf Studio Gear LV2 plugins"

# x42 Plugins - Includes x42-autotune for pitch correction
install_if_missing "lv2-x42-plugins" "x42 LV2 plugins (includes autotune)"

# Zam Audio - Modern dynamics and EQ
install_if_missing "lv2-zam-plugins" "Zam Audio LV2 plugins"

# Guitarix - Guitar/bass effects (many useful for vocals too)
echo ""
echo "Optional: Guitarix plugins for additional effects?"
read -p "Install Guitarix? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    install_if_missing "guitarix-lv2" "Guitarix LV2 plugins"
fi

# EQ10Q - Advanced 10-band parametric EQ
echo ""
echo "Optional: EQ10Q plugins for advanced EQ?"
read -p "Install EQ10Q? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if rpm -q "eq10q" &>/dev/null; then
        echo "✅ EQ10Q already installed"
    else
        echo "ℹ️  EQ10Q not in default repos. You can install from COPR:"
        echo "   sudo dnf copr enable ycollet/audinux"
        echo "   sudo dnf install eq10q"
    fi
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "✅ Installation complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Verify installations
echo "Verifying LV2 plugin directories..."
echo ""

if [ -d "/usr/lib64/lv2/calf.lv2" ]; then
    CALF_COUNT=$(ls /usr/lib64/lv2/calf.lv2/*.ttl 2>/dev/null | wc -l)
    echo "✅ Calf: $CALF_COUNT plugins"
fi

if [ -d "/usr/lib64/lv2" ]; then
    X42_COUNT=$(ls -d /usr/lib64/lv2/x42-* 2>/dev/null | wc -l)
    echo "✅ x42: $X42_COUNT plugin bundles"
fi

ZAM_COUNT=$(ls -d /usr/lib64/lv2/Zam*.lv2 2>/dev/null | wc -l)
if [ $ZAM_COUNT -gt 0 ]; then
    echo "✅ Zam: $ZAM_COUNT plugins"
fi

echo ""
echo "Key vocal processing plugins installed:"
echo "  • Calf Compressor - Dynamic range control"
echo "  • Calf Gate - Noise gate"
echo "  • Calf Equalizer - 5, 8, 12, 30-band EQs"
echo "  • x42-compressor - Various compressor types"
echo "  • x42-eq - Parametric EQ"
echo "  • x42-autotune - Pitch correction/tuning"
echo "  • ZamGate - Gate"
echo "  • ZamComp - Compressor"
echo "  • ZamEQ2 - 2-band parametric EQ"
echo ""

# Check if MAP2 backend is running
echo "Checking MAP2 Audio backend..."
if curl -s http://localhost:8000/api/health &>/dev/null; then
    echo "✅ Backend is running"
    echo ""
    echo "Refreshing plugin cache..."
    
    # Refresh LV2 plugin cache
    if curl -s -X POST http://localhost:8000/api/plugins/lv2/refresh &>/dev/null; then
        echo "✅ Plugin cache refreshed"
        
        # Count plugins
        echo ""
        echo "Checking plugin discovery..."
        PLUGIN_COUNT=$(curl -s http://localhost:8000/api/plugins/lv2 | jq -r '.plugins | length' 2>/dev/null)
        if [ ! -z "$PLUGIN_COUNT" ]; then
            echo "📊 Total LV2 plugins available: $PLUGIN_COUNT"
        fi
    else
        echo "⚠️  Could not refresh cache. Try manually:"
        echo "   curl -X POST http://localhost:8000/api/plugins/lv2/refresh"
    fi
else
    echo "⚠️  Backend not running. Start it with:"
    echo "   cd /home/mm/map2-audio && ./start_all_services.sh"
    echo ""
    echo "Then refresh plugins:"
    echo "   curl -X POST http://localhost:8000/api/plugins/lv2/refresh"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "🎤 Vocal Processing Chain Suggestion:"
echo "═══════════════════════════════════════════════════════════════"
echo "1. Gate (ZamGate or Calf Gate) - Remove background noise"
echo "2. Compressor (Calf Compressor) - Even out dynamics"
echo "3. EQ (Calf Equalizer or x42-eq) - Shape tone"
echo "4. Pitch Correction (x42-autotune) - Fix pitch issues"
echo "5. Limiter (LSP Limiter) - Prevent clipping"
echo ""
echo "📖 Documentation: docs/INSTALLING_GRAILLON.md"
echo "🎛️  Load plugins via: http://localhost:3000 (MAP2 Web UI)"
echo ""
echo "Done! Happy mixing! 🎵"

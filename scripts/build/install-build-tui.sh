#!/bin/bash
# ============================================================================
# Install MAP2 Build TUI System
# ============================================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MATTS_TUI="$PROJECT_ROOT/MATTS-BUILD-TUI"
HELPERS_DIR="$PROJECT_ROOT/scripts/build"

echo "Installing MAP2 Build TUI System..."

# Create helpers directory
mkdir -p "$HELPERS_DIR"

# Helper scripts array
declare -a HELPERS=(
    "system-check"
    "build-web-prod"
    "build-web-dev"
    "build-juce"
    "clean-build"
)

# Make main script executable
if [ -f "$MATTS_TUI" ]; then
    chmod +x "$MATTS_TUI"
    echo "✓ Main TUI script made executable"
else
    echo "✗ Main TUI script not found at $MATTS_TUI"
    exit 1
fi

# Make helper scripts executable
for helper in "${HELPERS[@]}"; do
    script="$HELPERS_DIR/$helper"
    if [ -f "$script" ]; then
        chmod +x "$script"
        echo "✓ Helper script made executable: $helper"
    else
        echo "✗ Helper script not found: $helper"
    fi
done

# Create symlink in /usr/local/bin
echo ""
echo "Creating symlink in /usr/local/bin..."
if command -v sudo &>/dev/null; then
    sudo ln -sf "$MATTS_TUI" /usr/local/bin/matts-build 2>/dev/null || true
    if [ -L /usr/local/bin/matts-build ]; then
        echo "✓ Symlink created: /usr/local/bin/matts-build"
    fi
else
    ln -sf "$MATTS_TUI" /usr/local/bin/matts-build 2>/dev/null || true
    echo "✓ Symlink created: /usr/local/bin/matts-build"
fi

echo ""
echo "✓ Installation complete!"
echo ""
echo "Usage:"
echo "  $MATTS_TUI              # Interactive menu"
echo "  matts-build             # Shortcut (if symlink created)"
echo "  $MATTS_TUI --help       # Show help"
echo ""

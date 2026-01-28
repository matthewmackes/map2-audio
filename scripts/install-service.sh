#!/bin/bash
# MAP2 Audio Platform - Systemd Service Installer
# Installs and enables the unified service orchestrator

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVICE_FILE="$PROJECT_DIR/systemd/map2-backend.service"
SYSTEMD_DIR="/etc/systemd/system"

echo "=========================================="
echo "MAP2 Audio Platform - Service Installer"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "This script requires root privileges."
    echo "Please run: sudo $0"
    exit 1
fi

# Check if service file exists
if [ ! -f "$SERVICE_FILE" ]; then
    echo "ERROR: Service file not found: $SERVICE_FILE"
    exit 1
fi

echo "Installing MAP2 service..."
echo ""

# Stop existing service if running
if systemctl is-active --quiet map2-backend.service 2>/dev/null; then
    echo "Stopping existing MAP2 service..."
    systemctl stop map2-backend.service
fi

# Copy service file
echo "Copying service file to $SYSTEMD_DIR..."
cp "$SERVICE_FILE" "$SYSTEMD_DIR/map2-backend.service"

# Reload systemd
echo "Reloading systemd daemon..."
systemctl daemon-reload

# Enable service
echo "Enabling MAP2 service for boot..."
systemctl enable map2-backend.service

echo ""
echo "=========================================="
echo "Installation complete!"
echo "=========================================="
echo ""
echo "Commands:"
echo "  Start:   sudo systemctl start map2-backend"
echo "  Stop:    sudo systemctl stop map2-backend"
echo "  Status:  sudo systemctl status map2-backend"
echo "  Logs:    sudo journalctl -u map2-backend -f"
echo ""
echo "The service will start automatically on boot."
echo ""
echo "To start now:"
echo "  sudo systemctl start map2-backend"
echo ""

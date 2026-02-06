#!/bin/bash
# MAP2 Zero-Touch Provisioning initialization script
# Called from package post-install hook
# Idempotent - safe to run multiple times

set -e

ZTP_MARKER="/var/lib/map2/.ztp-complete"
CONFIG_FILE="/etc/map2/node.conf"
LOG_FILE="/var/log/map2-ztp-init.log"

# Ensure logging directory exists
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p /var/lib/map2
mkdir -p /etc/map2

# Function to log messages
log_msg() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log_msg "MAP2 Zero-Touch Provisioning init script started"

# Check if already completed
if [[ -f "$ZTP_MARKER" ]]; then
    log_msg "ZTP: Already completed (marker exists). Skipping."
    exit 0
fi

# Check if config exists
if [[ -f "$CONFIG_FILE" ]]; then
    log_msg "ZTP: Configuration exists. Marking as complete."
    mkdir -p "$(dirname "$ZTP_MARKER")"
    echo "ZTP completed: $(date -Iseconds)" > "$ZTP_MARKER"
    exit 0
fi

log_msg "ZTP: First boot detected. Running provisioning..."

# Create required directories
log_msg "Creating system directories..."
mkdir -p /etc/map2/ssl
mkdir -p /etc/map2/ssh
mkdir -p /var/lib/map2/backups
mkdir -p /var/lib/map2/config-repo
mkdir -p /opt/map2/scripts
mkdir -p /opt/map2/dashboards

# Set proper permissions
chmod 755 /etc/map2
chmod 755 /var/lib/map2
chmod 700 /etc/map2/ssl
chmod 700 /etc/map2/ssh

log_msg "Directories created successfully"

# The main ZTP service will run via systemd unit
# This script just prepares the environment
log_msg "ZTP init script completed successfully"

exit 0

#!/bin/bash

################################################################################
# MAP2 Cluster - Quick Setup Script
#
# One-command cluster initialization for testing and development
# This script automates the setup of a 3-node test cluster
#
# Usage: ./quickstart.sh [--production]
#
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[INFO]${NC} $@"; }
success() { echo -e "${GREEN}[✓]${NC} $@"; }
error() { echo -e "${RED}[✗]${NC} $@"; exit 1; }

MODE="${MODE:-development}"

# Check for --production flag
if [ "$1" = "--production" ]; then
    MODE="production"
fi

log "MAP2 Audio Cluster - Quick Setup"
log "Mode: $MODE"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root (use: sudo ./quickstart.sh)"
fi

# Check for required tools
for tool in git python3 openssl sqlite3; do
    command -v $tool &> /dev/null || error "Required tool not found: $tool"
done
success "Required tools available"

# Step 1: Install management node
log "Installing management node..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f scripts/install_cluster_manager.sh ]; then
    error "Installation script not found at scripts/install_cluster_manager.sh"
fi

sudo bash scripts/install_cluster_manager.sh \
    --cluster-name "map2-test-cluster" \
    --node-role MANAGEMENT-NODE

success "Management node installed"

# Step 2: Get management node IP
MANAGER_IP=$(hostname -I | awk '{print $1}')
if [ -z "$MANAGER_IP" ]; then
    error "Could not determine management node IP"
fi

log "Management node IP: $MANAGER_IP"

# Step 3: Start management node service
log "Starting management node service..."
sudo systemctl start map2-cluster-manager
sleep 5

# Verify manager is running
if sudo systemctl is-active --quiet map2-cluster-manager; then
    success "Management node service started"
else
    error "Management node service failed to start"
fi

# Step 4: Display next steps
cat << EOF

${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}
${GREEN}║         MAP2 CLUSTER QUICK SETUP - INITIALIZATION COMPLETE    ║${NC}
${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}

${BLUE}Management Node:${NC}
  IP Address:      $MANAGER_IP
  Port:            8080
  Configuration:   /etc/map2/cluster.conf

${BLUE}Cluster Access:${NC}
  API Status:      curl -k https://$MANAGER_IP:8080/api/cluster/status
  Node List:       curl -k https://$MANAGER_IP:8080/api/cluster/nodes
  Health Check:    curl -k https://$MANAGER_IP:8080/api/cluster/health

${BLUE}Next Steps:${NC}

1. ${YELLOW}Deploy Audio Nodes${NC}
   On each audio node run:
   sudo bash scripts/deploy_cluster_node.sh --manager-ip $MANAGER_IP

2. ${YELLOW}Verify Cluster${NC}
   curl -k https://$MANAGER_IP:8080/api/cluster/nodes

3. ${YELLOW}Monitor Health${NC}
   curl -k https://$MANAGER_IP:8080/api/cluster/health

4. ${YELLOW}View Logs${NC}
   sudo journalctl -u map2-cluster-manager -f

${BLUE}Configuration Files:${NC}
  Main Config:     /etc/map2/cluster.conf
  Environment:     /etc/map2/.env
  SSL Certs:       /etc/map2/ssl/
  Database:        /var/lib/map2/database/cluster.db

${YELLOW}NOTE:${NC} This is a basic setup for testing. For production:
  - Configure firewall rules
  - Set up RBAC and authentication
  - Configure monitoring and alerting
  - Set up automated backups
  - Review security settings

${GREEN}Setup Complete!${NC}

EOF

success "Quick setup completed successfully"

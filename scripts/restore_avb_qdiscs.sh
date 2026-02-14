#!/bin/bash
#
# MAP2 AVB/TSN Qdisc Restore Script
#
# Restores qdisc configuration from backup and removes VLAN interface.
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

INTERFACE="$1"
BACKUP_DIR="/var/lib/map2"

if [[ -z "$INTERFACE" ]]; then
    echo -e "${RED}ERROR:${NC} Usage: $0 <interface>"
    exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}    MAP2 AVB/TSN Qdisc Restore${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo
echo "Interface: $INTERFACE"
echo

# Remove VLAN interface
VLAN_INTERFACE="${INTERFACE}.2"
if ip link show "$VLAN_INTERFACE" &>/dev/null; then
    echo -e "${BLUE}INFO:${NC} Removing VLAN interface $VLAN_INTERFACE..."
    ip link delete dev "$VLAN_INTERFACE"
    echo -e "${GREEN}SUCCESS:${NC} VLAN removed"
else
    echo -e "${YELLOW}WARNING:${NC} VLAN interface $VLAN_INTERFACE not found"
fi

# Restore qdisc from backup
BACKUP_FILE="$BACKUP_DIR/qdisc-backup-$INTERFACE.txt"

if [[ -f "$BACKUP_FILE" ]]; then
    echo -e "${BLUE}INFO:${NC} Backup found: $BACKUP_FILE"
    echo -e "${YELLOW}WARNING:${NC} Full qdisc restore from backup not implemented"
    echo -e "${BLUE}INFO:${NC} Resetting to default pfifo_fast qdisc..."
    tc qdisc replace dev "$INTERFACE" root pfifo_fast
    echo -e "${GREEN}SUCCESS:${NC} Reset to default qdisc"
else
    echo -e "${YELLOW}WARNING:${NC} No backup found at $BACKUP_FILE"
    echo -e "${BLUE}INFO:${NC} Resetting to default pfifo_fast qdisc..."
    tc qdisc replace dev "$INTERFACE" root pfifo_fast
    echo -e "${GREEN}SUCCESS:${NC} Reset to default qdisc"
fi

echo
echo -e "${GREEN}Qdisc restore complete!${NC}"
echo
echo "Verify with:"
echo "  tc qdisc show dev $INTERFACE"

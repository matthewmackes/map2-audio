#!/bin/bash
"""
MAP2 LCD System - Production Deployment Script

Handles:
- Dependency installation
- Database initialization
- Service registration
- Systemd configuration
- Security hardening
- Boot integration
"""

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DEPLOYMENT_MODE="${1:-AUDIO-NODE}"
MAP2_HOME="${MAP2_HOME:-/opt/map2}"
MAP2_DATA="${MAP2_DATA:-/var/lib/map2}"
MAP2_LOG="${MAP2_LOG:-/var/log/map2}"
MAP2_USER="${MAP2_USER:-map2}"
MAP2_GROUP="${MAP2_GROUP:-map2}"

echo -e "${GREEN}=== MAP2 LCD System Production Deployment ===${NC}"
echo "Deployment Mode: $DEPLOYMENT_MODE"
echo "Installation Directory: $MAP2_HOME"
echo "Data Directory: $MAP2_DATA"

# Check prerequisites
echo -e "${YELLOW}[1/7] Checking prerequisites...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}ERROR: Python 3 is required${NC}"
    exit 1
fi

if ! command -v systemctl &> /dev/null; then
    echo -e "${RED}ERROR: Systemd is required${NC}"
    exit 1
fi

# Create service user if doesn't exist
echo -e "${YELLOW}[2/7] Setting up service user...${NC}"
if ! id "$MAP2_USER" &>/dev/null 2>&1; then
    sudo useradd -r -s /bin/bash -d "$MAP2_HOME" -m "$MAP2_USER"
    echo "Created user: $MAP2_USER"
fi

# Create directories
echo -e "${YELLOW}[3/7] Creating directories...${NC}"
sudo mkdir -p "$MAP2_DATA"/{events,backups}
sudo mkdir -p "$MAP2_LOG"/{events,lcd}
sudo mkdir -p "$MAP2_HOME"/{venv,config}
sudo mkdir -p /etc/map2/{trust,cluster}
sudo chown -R "$MAP2_USER:$MAP2_GROUP" "$MAP2_DATA" "$MAP2_LOG" "$MAP2_HOME"
sudo chown -R "$MAP2_USER:$MAP2_GROUP" /etc/map2

# Install Python dependencies
echo -e "${YELLOW}[4/7] Installing Python dependencies...${NC}"
cd "$MAP2_HOME"
sudo python3 -m venv venv
source venv/bin/activate

# Upgrade pip
sudo pip install --upgrade pip setuptools wheel

# Install requirements
sudo pip install -r requirements.txt
sudo pip install -e .

# Database initialization
echo -e "${YELLOW}[5/7] Initializing database...${NC}"
export MAP2_DATABASE_URL="sqlite+aiosqlite:///$MAP2_DATA/map2.db"
sudo -u "$MAP2_USER" python3 -c "
from app.database import init_async_db
import asyncio
init_async_db('$MAP2_DATABASE_URL')
print('✓ Database initialized')
"

# Configure node identity
echo -e "${YELLOW}[6/7] Configuring node identity...${NC}"
export MAP2_DEPLOYMENT_MODE="$DEPLOYMENT_MODE"
sudo -u "$MAP2_USER" python3 -c "
from app.services.node_identity import NodeIdentity
identity = NodeIdentity(mode='$DEPLOYMENT_MODE')
print(f'✓ Node ID: {identity.node_id}')
print(f'✓ SSH Fingerprint: {identity.ssh_fingerprint}')
"

# Install systemd services
echo -e "${YELLOW}[7/7] Installing systemd services...${NC}"

# Map2 LCD service
sudo tee /etc/systemd/system/map2-lcd.service > /dev/null << EOF
[Unit]
Description=MAP2 Audio Platform - LCD Event System
After=network.target
PartOf=map2.target

[Service]
Type=simple
User=$MAP2_USER
Group=$MAP2_GROUP
WorkingDirectory=$MAP2_HOME
Environment="PATH=$MAP2_HOME/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
Environment="MAP2_DEPLOYMENT_MODE=$DEPLOYMENT_MODE"
Environment="MAP2_DATA=$MAP2_DATA"
Environment="MAP2_LOG=$MAP2_LOG"
Environment="MAP2_DATABASE_URL=sqlite+aiosqlite:///$MAP2_DATA/map2.db"
ExecStart=$MAP2_HOME/venv/bin/python -m app.main
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=map2-lcd

# Resource limits
MemoryLimit=512M
CPUQuota=50%

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=$MAP2_DATA $MAP2_LOG /etc/map2

[Install]
WantedBy=map2.target
EOF

# Map2 target (for coordinating multiple services)
sudo tee /etc/systemd/system/map2.target > /dev/null << EOF
[Unit]
Description=MAP2 Audio Platform
Documentation=man:map2(1)
After=network.target
AllowIsolate=yes

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd daemon
sudo systemctl daemon-reload

# Enable services
sudo systemctl enable map2-lcd.service
sudo systemctl enable map2.target

# Create configuration template
sudo tee /etc/map2/lcd.conf > /dev/null << EOF
# MAP2 LCD Configuration
# Generated during deployment: $(date)

# Deployment mode: AUDIO-NODE, CONTROL-NODE, or ALL-IN-ONE
DEPLOYMENT_MODE=$DEPLOYMENT_MODE

# LCD Hardware
USE_MOCK_LCD=false
LCD_PORT=/dev/ttyUSB0
LCD_ADDRESS=0x27

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000

# WebSocket
WS_PATH=/api/lcd/ws/events
WS_BROADCAST_ENABLED=true

# Event Retention
EVENT_RETENTION_HOURS=24
EVENT_BATCH_SIZE=100
EVENT_BATCH_TIMEOUT_SEC=10

# Cluster
MDNS_ENABLED=true
SSH_TRUST_REQUIRED=true

# Performance
EVENT_QUEUE_SIZE=1000
DB_POOL_SIZE=10
DB_MAX_OVERFLOW=20

# Logging
LOG_LEVEL=INFO
LOG_FILE=$MAP2_LOG/lcd/app.log
LOG_MAX_SIZE=10485760
LOG_BACKUP_COUNT=5
EOF

# Security: Restrict SSH trust
sudo chmod 700 /etc/map2/trust
sudo chmod 700 /etc/map2/cluster

echo -e "${GREEN}=== Deployment Complete ===${NC}"
echo
echo "✓ Service user created: $MAP2_USER"
echo "✓ Directories initialized"
echo "✓ Python dependencies installed"
echo "✓ Database initialized"
echo "✓ Systemd services installed"
echo
echo "Next steps:"
echo "  1. Start the service: sudo systemctl start map2-lcd"
echo "  2. Check status: sudo systemctl status map2-lcd"
echo "  3. View logs: sudo journalctl -u map2-lcd -f"
echo "  4. Configure cluster: ssh-copy-id $MAP2_USER@<peer-node>"
echo
echo "Web UI: http://localhost:8000"
echo "API: http://localhost:8000/api/lcd"
echo "WebSocket: ws://localhost:8000/api/lcd/ws/events"

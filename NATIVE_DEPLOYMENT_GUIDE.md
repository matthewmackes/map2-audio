# Native Deployment Guide - Multi-Node Setup

This guide replaces Docker/container-based deployment with native systemd and direct process management.

## Installation (One-Time Setup)

```bash
# Clone repository
git clone https://github.com/matthewmackes/map2-audio.git
cd map2-audio

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create service user
sudo useradd -r -s /bin/false map2 || true

# Create directories
sudo mkdir -p /opt/map2
sudo mkdir -p /var/lib/map2
sudo mkdir -p /var/log/map2
sudo mkdir -p /etc/map2

# Copy application
sudo cp -r . /opt/map2/
sudo chown -R map2:map2 /opt/map2
sudo chown -R map2:map2 /var/lib/map2
sudo chown -R map2:map2 /var/log/map2
sudo chown -R map2:map2 /etc/map2
```

## Single-Node Deployment

### Setup Service (Audio Node)

```bash
# Create systemd service file
sudo tee /etc/systemd/system/map2-lcd.service > /dev/null << 'EOF'
[Unit]
Description=MAP2 LCD Event System
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=map2
Group=map2
WorkingDirectory=/opt/map2
EnvironmentFile=/etc/map2/lcd.env
ExecStart=/opt/map2/venv/bin/python -m app.main
Restart=on-failure
RestartSec=10s
StandardOutput=journal
StandardError=journal
StandardOutput=journal
SyslogIdentifier=map2-lcd

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable map2-lcd
sudo systemctl start map2-lcd

# Check status
sudo systemctl status map2-lcd
sudo journalctl -u map2-lcd -f
```

### Configuration

Create `/etc/map2/lcd.env`:

```bash
# Core settings
MAP2_DEPLOYMENT_MODE=AUDIO-NODE
MAP2_NODE_ID=AUDIO-NODE-$(hostname -s)
MAP2_API_PORT=8080
MAP2_WS_PORT=9000
MAP2_LOG_LEVEL=INFO

# Database
MAP2_DATABASE_URL=sqlite+aiosqlite:////var/lib/map2/map2.db

# Event system
MAP2_EVENT_RETENTION_HOURS=24
MAP2_EVENT_BATCH_TIMEOUT_SEC=10
MAP2_USE_MOCK_LCD=false

# Clustering (disabled for single node)
MAP2_CLUSTER_ENABLED=false
```

## Multi-Node Clustering

### Node 1: Audio Node (Port 8080)

Create `/etc/map2/audio-1.env`:

```bash
MAP2_DEPLOYMENT_MODE=AUDIO-NODE
MAP2_NODE_ID=AUDIO-NODE-1
MAP2_API_PORT=8080
MAP2_WS_PORT=9000
MAP2_DATABASE_URL=sqlite+aiosqlite:////var/lib/map2/node1.db
MAP2_CLUSTER_ENABLED=true
MAP2_MCAST_GROUP=224.0.0.50
MAP2_MCAST_PORT=5353
```

Create `/etc/systemd/system/map2-lcd-node1.service`:

```ini
[Unit]
Description=MAP2 LCD Audio Node 1
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=map2
WorkingDirectory=/opt/map2
EnvironmentFile=/etc/map2/audio-1.env
ExecStart=/opt/map2/venv/bin/python -m app.main
Restart=on-failure
RestartSec=10s
StandardOutput=journal

[Install]
WantedBy=multi-user.target
```

### Node 2: Control Node (Port 8081)

Create `/etc/map2/control-1.env`:

```bash
MAP2_DEPLOYMENT_MODE=CONTROL-NODE
MAP2_NODE_ID=CONTROL-NODE-1
MAP2_API_PORT=8081
MAP2_WS_PORT=9001
MAP2_DATABASE_URL=sqlite+aiosqlite:////var/lib/map2/control-1.db
MAP2_CLUSTER_ENABLED=true
MAP2_MCAST_GROUP=224.0.0.50
MAP2_MCAST_PORT=5353
```

Create `/etc/systemd/system/map2-lcd-control1.service`:

```ini
[Unit]
Description=MAP2 LCD Control Node 1
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=map2
WorkingDirectory=/opt/map2
EnvironmentFile=/etc/map2/control-1.env
ExecStart=/opt/map2/venv/bin/python -m app.main
Restart=on-failure
RestartSec=10s
StandardOutput=journal

[Install]
WantedBy=multi-user.target
```

### Enable and Run

```bash
# Load service definitions
sudo systemctl daemon-reload

# Enable all services to start on boot
sudo systemctl enable map2-lcd-node1 map2-lcd-control1

# Start all services
sudo systemctl start map2-lcd-node1 map2-lcd-control1

# Check status
sudo systemctl status map2-lcd-node1 map2-lcd-control1

# View combined logs
sudo journalctl -u map2-lcd-node1 -u map2-lcd-control1 -f

# View individual logs
sudo journalctl -u map2-lcd-node1 -f
sudo journalctl -u map2-lcd-control1 -f
```

## Local Testing (Development)

For development testing without systemd:

```bash
# Terminal 1: Audio Node
export MAP2_DEPLOYMENT_MODE=AUDIO-NODE
export MAP2_NODE_ID=AUDIO-NODE-1
export MAP2_API_PORT=8080
export MAP2_WS_PORT=9000
export MAP2_USE_MOCK_LCD=true
python -m app.main

# Terminal 2: Control Node
export MAP2_DEPLOYMENT_MODE=CONTROL-NODE
export MAP2_NODE_ID=CONTROL-NODE-1
export MAP2_API_PORT=8081
export MAP2_WS_PORT=9001
export MAP2_USE_MOCK_LCD=true
python -m app.main

# Terminal 3: Test API
curl http://localhost:8080/api/lcd/events
curl http://localhost:8081/api/lcd/events

# Terminal 4: Monitor logs
tail -f /tmp/node1.log
tail -f /tmp/node2.log
```

## Monitoring & Health Checks

### Health Check Endpoint

```bash
# Check node health
curl http://localhost:8080/api/health

# Check cluster status
curl http://localhost:8080/api/system/status

# View Prometheus metrics (if enabled)
curl http://localhost:8080/metrics
```

### Systemd Integration

```bash
# View service state
sudo systemctl list-units map2-lcd*

# Restart a node
sudo systemctl restart map2-lcd-node1

# Stop all nodes
sudo systemctl stop map2-lcd-*

# View full journal (last 100 lines)
sudo journalctl -u map2-lcd-node1 -n 100

# Stream logs in real-time
sudo journalctl -u map2-lcd-node1 -f --output=short
```

## Remote Deployment

For deploying to multiple machines:

```bash
# On target machine 1 (Audio Node)
ssh user@audio-node.local
cd /opt/map2
sudo systemctl start map2-lcd-node1

# On target machine 2 (Control Node)
ssh user@control-node.local
cd /opt/map2
sudo systemctl start map2-lcd-control1

# Verify cluster formation
curl http://audio-node.local:8080/api/system/status
curl http://control-node.local:8081/api/system/status
```

## Troubleshooting

### Service Won't Start

```bash
# Check for errors
sudo systemctl status map2-lcd-node1
sudo journalctl -u map2-lcd-node1 -n 50

# Test configuration manually
source /etc/map2/audio-1.env
/opt/map2/venv/bin/python -m app.main
```

### Connection Issues

```bash
# Check if ports are listening
sudo netstat -tlnp | grep python

# Test API connectivity
curl -v http://localhost:8080/api/health

# Check firewall rules
sudo ufw allow 8080:8081/tcp
```

### Database Issues

```bash
# Check database file exists
ls -la /var/lib/map2/node1.db

# Initialize database
/opt/map2/venv/bin/python -m app.database_init

# Backup and reset database
sudo cp /var/lib/map2/node1.db /var/lib/map2/backups/node1.db.bak
rm /var/lib/map2/node1.db
/opt/map2/venv/bin/python -m app.database_init
```

## Performance Tuning

### System Limits

Add to `/etc/security/limits.conf`:

```
map2 soft nofile 65536
map2 hard nofile 65536
map2 soft nproc 4096
map2 hard nproc 4096
```

### Network Settings

```bash
# Enable multicast (for cluster discovery)
sudo sysctl -w net.ipv4.ip_forward=1
sudo sysctl -w net.ipv4.igmp_max_memberships=20
```

## Upgrade Procedure

```bash
# Backup current database
sudo cp /var/lib/map2/node1.db /var/lib/map2/backups/node1.db.backup

# Stop services
sudo systemctl stop map2-lcd-*

# Update application
cd /opt/map2
git pull origin main
source venv/bin/activate
pip install -r requirements.txt

# Restart services
sudo systemctl start map2-lcd-*

# Verify
sudo systemctl status map2-lcd-*
```

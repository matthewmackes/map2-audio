# MAP2 LCD System - Production Deployment Guide

## Overview

This guide covers deploying the MAP2 distributed LCD event system to production, including:
- Single-node deployment (AUDIO-NODE or CONTROL-NODE)
- Multi-node clustering
- Hardware LCD configuration
- Performance optimization
- Security hardening

## Prerequisites

### System Requirements

- **OS**: Fedora 42, Ubuntu 22.04+ (Debian-based)
- **Python**: 3.10 or higher
- **Systemd**: For service management
- **Network**: Ethernet for cluster connectivity
- **Optional**: I2C bus for physical LCD displays

### Hardware

#### Audio Node
- Real-time capable CPU (quad-core recommended)
- 2GB+ RAM
- 10GB storage for audio/backups
- Serial/I2C interface for LCD

#### Control Node
- Standard server-grade CPU
- 4GB+ RAM
- 20GB storage for database/logs
- Optional: LCD display via serial or I2C

## Single-Node Deployment

### 1. Basic Setup

```bash
# SSH into target system
ssh user@audio-node.local

# Download and run deployment script
sudo chmod +x scripts/deploy-lcd-production.sh
sudo scripts/deploy-lcd-production.sh AUDIO-NODE
```

This:
- Creates `map2` service user
- Installs Python dependencies
- Initializes SQLite database
- Registers systemd services
- Generates node identity (SSH keys, fingerprint)
- Creates configuration files

### 2. Start the Service

```bash
# Start LCD service
sudo systemctl start map2-lcd

# Verify status
sudo systemctl status map2-lcd

# View logs
sudo journalctl -u map2-lcd -f
```

### 3. Test Deployment

```bash
# Run hardware tests
sudo scripts/test-lcd-hardware.sh /dev/ttyUSB0

# Check API
curl http://localhost:8080/api/lcd/events

# Connect WebSocket
wscat -c ws://localhost:8080/api/lcd/ws/events
```

## Multi-Node Clustering

### 1. Deploy All Nodes

Deploy AUDIO-NODE(s):
```bash
sudo scripts/deploy-lcd-production.sh AUDIO-NODE
```

Deploy CONTROL-NODE:
```bash
sudo scripts/deploy-lcd-production.sh CONTROL-NODE
```

### 2. Establish SSH Trust

On AUDIO-NODE:
```bash
# Copy public key to all peers
ssh-copy-id map2@control-node.local

# Verify trust
ssh map2@control-node.local "echo OK"
```

### 3. Configure Cluster

Edit `/etc/map2/cluster.conf` on each node:

```ini
[cluster]
enabled=true
mdns_discovery=true
ssh_trust_required=true

[peers]
# Peer node configuration (auto-discovered via mDNS)
; peer_1=AUDIO-NODE-A1B2:audio-node-1.local:8080
; peer_2=CONTROL-NODE-C3D4:control-node.local:8080
```

mDNS auto-discovery handles peer detection. No manual configuration needed if zeroconf is installed.

### 4. Verify Clustering

Check event aggregation:
```bash
# On AUDIO-NODE
curl http://localhost:8080/api/lcd/stats

# Should show:
# - local_events: N
# - remote_events: M (from peers)
# - active_nodes: 2+
```

Watch event broadcast:
```bash
wscat -c ws://localhost:8080/api/lcd/ws/events

# Events from all nodes should appear
```

## Hardware LCD Configuration

### Serial LCD (4x20 Character)

1. **Connect Hardware**
   - Plug I2C/Serial adapter into USB port
   - Note the device path (usually `/dev/ttyUSB0`)

2. **Configure Driver**
   
   Edit `/etc/map2/lcd.conf`:
   ```ini
   USE_MOCK_LCD=false
   LCD_PORT=/dev/ttyUSB0
   LCD_ADDRESS=0x27  # I2C address (0x27 is common for 20x4)
   ```

3. **Grant Permissions**
   ```bash
   # Add map2 user to dialout group
   sudo usermod -a -G dialout map2
   sudo systemctl restart map2-lcd
   ```

4. **Test Display**
   ```bash
   sudo scripts/test-lcd-hardware.sh /dev/ttyUSB0 0x27
   ```

### Multiple LCDs

Edit LCD manager configuration:
```python
# app/config/lcd_config.py
LCD_CONFIGS = [
    {
        "id": 0,
        "port": "/dev/ttyUSB0",
        "address": 0x27,
        "rows": 4,
        "cols": 20,
        "mode": "I2C"
    },
    {
        "id": 1,
        "port": "/dev/ttyUSB1",
        "address": 0x3F,
        "rows": 4,
        "cols": 20,
        "mode": "I2C"
    }
]
```

## Database Backup & Recovery

### Automatic Backups

The system auto-backs up the SQLite database:
```bash
# Backups stored here
ls -la /var/lib/map2/backups/

# Restore from backup
sudo cp /var/lib/map2/backups/map2-2025-02-04.db.bak /var/lib/map2/map2.db
sudo chown map2:map2 /var/lib/map2/map2.db
sudo systemctl restart map2-lcd
```

### Manual Export

```bash
# Export events to CSV
curl "http://localhost:8080/api/lcd/events?limit=1000" | jq '.events' > events.json

# Or via API
python3 << 'EOF'
import requests
events = requests.get("http://localhost:8080/api/lcd/history?hours=24").json()
import csv
with open('events.csv', 'w') as f:
    writer = csv.DictWriter(f, fieldnames=events[0].keys())
    writer.writeheader()
    writer.writerows(events)
EOF
```

## Performance Tuning

### For Audio Nodes

Optimize for low-latency monitoring:

```bash
# Edit /etc/map2/lcd.conf
EVENT_QUEUE_SIZE=2000
EVENT_BATCH_SIZE=50
EVENT_BATCH_TIMEOUT_SEC=5
DB_POOL_SIZE=5
```

### For Control Nodes

Optimize for throughput:

```bash
# Edit /etc/map2/lcd.conf
EVENT_QUEUE_SIZE=5000
EVENT_BATCH_SIZE=200
EVENT_BATCH_TIMEOUT_SEC=10
DB_POOL_SIZE=20
```

### Resource Limits

Check current limits:
```bash
sudo systemctl show map2-lcd | grep Memory
```

Adjust in `/etc/systemd/system/map2-lcd.service`:
```ini
MemoryLimit=512M  # or 1G
CPUQuota=50%      # or 75%
```

Reload:
```bash
sudo systemctl daemon-reload
sudo systemctl restart map2-lcd
```

## Monitoring

### Systemd Logs

```bash
# Real-time logs
sudo journalctl -u map2-lcd -f

# Last 50 lines
sudo journalctl -u map2-lcd -n 50

# Since timestamp
sudo journalctl -u map2-lcd --since "2 hours ago"
```

### Health Checks

```bash
# API health
curl http://localhost:8080/health

# Database health
curl http://localhost:8080/api/lcd/stats

# Event production rate
curl http://localhost:8080/api/lcd/stats | jq '.event_rate'
```

### Metrics

Enable Prometheus metrics:
```bash
curl http://localhost:8080/metrics
```

## Security

### SSH Trust Verification

```bash
# View trusted peers
sudo cat /etc/map2/trust/trusted-nodes.json

# Add peer manually
cat >> /etc/map2/trust/trusted-nodes.json << EOF
{
  "AUDIO-NODE-A1B2": {
    "ssh_fingerprint": "SHA256:...",
    "added_at": "2025-02-04T12:00:00"
  }
}
EOF
```

### Firewall

On Control Node:
```bash
# Allow only audio nodes
sudo firewall-cmd --add-rich-rule='rule family="ipv4" source address="192.168.1.100" port protocol="tcp" port="8080" accept'
```

On Audio Nodes:
```bash
# Block external access
sudo firewall-cmd --add-rich-rule='rule family="ipv4" source address="192.168.1.0/24" port protocol="tcp" port="8080" accept' --permanent
```

## Troubleshooting

### Service Won't Start

```bash
# Check logs
sudo journalctl -u map2-lcd -n 100

# Common issues:
# - Permission denied: sudo chown -R map2:map2 /var/lib/map2
# - Port in use: sudo lsof -i :8080
# - DB locked: rm /var/lib/map2/map2.db-wal
```

### Events Not Appearing

```bash
# Check event bus
curl http://localhost:8080/api/lcd/events

# Check producers
sudo journalctl -u map2-lcd | grep "Producer"

# Test event creation
curl -X POST http://localhost:8080/api/lcd/events \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","message":"works"}'
```

### Clustering Issues

```bash
# Check discovered peers
curl http://localhost:8080/api/lcd/stats | jq '.active_nodes'

# Verify mDNS
avahi-browse -r _map2-node._tcp

# Check SSH connectivity
ssh map2@peer-node "systemctl status map2-lcd"
```

### High CPU Usage

```bash
# Check event rate
curl http://localhost:8080/api/lcd/stats | jq '.'

# Reduce batch frequency
# Edit /etc/map2/lcd.conf:
# EVENT_BATCH_TIMEOUT_SEC=20 (increase from 10)

# Reduce event retention
# EVENT_RETENTION_HOURS=12 (from 24)
```

## Docker Deployment

For testing/development:

```bash
# Start multi-node cluster
docker-compose -f docker-compose.lcd.yml up -d

# View logs
docker-compose -f docker-compose.lcd.yml logs -f

# Access nodes:
# - Audio Node 1: http://localhost:8001
# - Control Node: http://localhost:8002

# Stop
docker-compose -f docker-compose.lcd.yml down
```

## Upgrade Procedure

### Safe Upgrade

```bash
# 1. Stop service
sudo systemctl stop map2-lcd

# 2. Backup database
sudo cp /var/lib/map2/map2.db /var/lib/map2/backups/map2-$(date +%s).db.bak

# 3. Install new version
cd /opt/map2
source venv/bin/activate
pip install --upgrade map2-audio

# 4. Run migrations (if any)
python -m app.migrate

# 5. Restart
sudo systemctl start map2-lcd

# 6. Verify
sudo systemctl status map2-lcd
```

## Production Checklist

- [ ] Hardware: Serial/I2C display connected and tested
- [ ] Network: Cluster nodes can reach each other (ping test)
- [ ] SSH: Trust established between all nodes
- [ ] Database: Backups configured and tested
- [ ] Firewall: Ports 8080-8082 restricted appropriately
- [ ] Systemd: Service enabled and starts on reboot
- [ ] Monitoring: Journalctl logs being collected
- [ ] Capacity: Disk space monitored for /var/lib/map2
- [ ] Performance: Event rate within acceptable bounds
- [ ] Security: SSL/TLS configured for inter-node communication

## Next Steps

1. **Web Dashboard**: Access at http://your-node:3000/lcd-dashboard
2. **MIDI Integration**: Configure MIDI events in LV2 plugin chain
3. **Custom Events**: Write event producers for application-specific monitoring
4. **Advanced Clustering**: Set up event replication and consensus
5. **Real Hardware**: Deploy on Raspberry Pi or x86 industrial PC

## Support

For issues:
1. Check logs: `sudo journalctl -u map2-lcd -f`
2. Run hardware test: `sudo scripts/test-lcd-hardware.sh`
3. Verify API: `curl http://localhost:8080/api/lcd/health`
4. Check database: `sqlite3 /var/lib/map2/map2.db ".tables"`

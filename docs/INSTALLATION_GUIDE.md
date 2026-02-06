# MAP2 Audio Cluster Manager - Installation & Deployment Guide

**Version:** 1.0  
**Last Updated:** February 5, 2026  
**Target Platform:** Fedora Server 40+

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Management Node Installation](#management-node-installation)
4. [Audio Node Deployment](#audio-node-deployment)
5. [Cluster Initialization](#cluster-initialization)
6. [Verification & Testing](#verification--testing)
7. [Troubleshooting](#troubleshooting)
8. [Security Hardening](#security-hardening)
9. [Backup & Recovery](#backup--recovery)

---

## Overview

The MAP2 Audio Cluster Manager provides enterprise-grade cluster management for distributed MAP2 Audio installations on Fedora Server systems. This guide covers:

- **Management Node**: Central orchestration and monitoring
- **Audio Nodes**: Individual cluster members running audio workloads
- **Standby Node**: Hot backup for failover scenarios

### Architecture

```
┌─────────────────────────────────────────────────────┐
│         Management Node (Primary)                   │
│  ┌────────────────────────────────────────────┐    │
│  │ Cluster Manager Service (8080)             │    │
│  │ - Node Registry & Discovery                │    │
│  │ - Health Monitoring                        │    │
│  │ - Update Orchestration                     │    │
│  │ - Configuration Management                 │    │
│  │ - Event Logging & Audit Trail              │    │
│  └────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
         │              │              │
         ├──────────────┼──────────────┤
         │              │              │
    ┌────────┐    ┌────────┐    ┌────────┐
    │ Audio  │    │ Audio  │    │ Audio  │
    │ Node 1 │    │ Node 2 │    │ Node 3 │
    └────────┘    └────────┘    └────────┘
```

---

## Prerequisites

### System Requirements

**Management Node:**
- Fedora Server 40+ (minimal installation)
- 4+ CPU cores
- 8GB+ RAM
- 20GB+ disk space
- Static IP address
- Ethernet connectivity

**Audio Nodes:**
- Fedora Server 40+ (minimal installation)
- 2+ CPU cores
- 4GB+ RAM
- 10GB+ disk space
- Static IP address
- Gigabit Ethernet
- Audio interfaces (optional)

### Network Requirements

- All nodes on same subnet or routable network
- Port 8080/TCP: Cluster management API
- Port 5353/UDP: mDNS discovery
- Port 22/TCP: SSH administration
- Firewall rules configured (scripts handle this)

### Pre-Installation Checklist

- [ ] Fedora Server installed on all nodes
- [ ] Network configured with static IPs
- [ ] SSH access available
- [ ] Root or sudo access
- [ ] Internet connectivity for package downloads
- [ ] Time synchronized (NTP) on all nodes

---

## Management Node Installation

### Step 1: Download Installation Script

```bash
# On management node
cd /opt
sudo git clone https://github.com/matthewmackes/map2-audio.git
cd map2-audio/scripts
sudo chmod +x install_cluster_manager.sh
```

### Step 2: Run Installation

Basic installation:

```bash
sudo ./install_cluster_manager.sh
```

With custom configuration:

```bash
sudo ./install_cluster_manager.sh \
    --cluster-name my-cluster \
    --node-role MANAGEMENT-NODE \
    --data-dir /var/lib/map2 \
    --config-dir /etc/map2
```

### Step 3: Verify Installation

The script will perform health checks automatically. Verify manually:

```bash
# Check directories
ls -la /etc/map2/
ls -la /var/lib/map2/
ls -la /opt/map2/

# Check SSL certificates
sudo ls -la /etc/map2/ssl/

# Check database
sudo sqlite3 /var/lib/map2/database/cluster.db ".tables"

# Check Python environment
sudo /opt/map2/venv/bin/python3 --version
```

### Step 4: Start Services

```bash
# Start management node service
sudo systemctl start map2-cluster-manager
sudo systemctl status map2-cluster-manager

# Enable automatic start on boot
sudo systemctl enable map2-cluster-manager
sudo systemctl enable map2-health-sync.timer
sudo systemctl enable map2-failover-monitor
sudo systemctl enable map2-fleet-update.timer
```

### Step 5: Verify API

```bash
# Test API endpoint (may show self-signed cert warning)
curl -k https://localhost:8080/api/cluster/status

# Expected response:
# {"status": "ok", "nodes": 1, "healthy_nodes": 1}
```

---

## Audio Node Deployment

### Step 1: Download Deployment Script

```bash
# On audio node
cd /opt
sudo git clone https://github.com/matthewmackes/map2-audio.git
cd map2-audio/scripts
sudo chmod +x deploy_cluster_node.sh
```

### Step 2: Get Management Node IP

```bash
# On management node
hostname -I

# Example output: 192.168.1.100
```

### Step 3: Deploy Audio Node

Basic deployment:

```bash
MANAGER_IP=192.168.1.100  # Use actual management node IP
sudo ./deploy_cluster_node.sh --manager-ip $MANAGER_IP
```

With audio device specification:

```bash
sudo ./deploy_cluster_node.sh \
    --manager-ip 192.168.1.100 \
    --cluster-name my-cluster \
    --audio-devices "HDA Intel,USB Audio Device"
```

### Step 4: Start Node Client

```bash
# Start node client
sudo systemctl start map2-node-client
sudo systemctl status map2-node-client

# Enable on boot
sudo systemctl enable map2-node-client

# View logs
sudo journalctl -u map2-node-client -f
```

### Step 5: Verify Registration

```bash
# On management node, list cluster nodes
curl -k https://localhost:8080/api/cluster/nodes
```

---

## Cluster Initialization

### Configure Management Node

Edit the cluster configuration:

```bash
sudo nano /etc/map2/cluster.conf
```

Key settings:

```ini
[cluster_management]
health_check_interval = 30        # Seconds
metrics_aggregation_interval = 60 # Seconds
failover_timeout = 30             # Seconds
state_replication_interval = 300  # Seconds
backup_retention_days = 30        # Days

[cluster]
max_nodes = 50                    # Maximum cluster size
update_stagger_rate = 2           # Nodes per hour
```

### Initialize Cluster Registry

```bash
# Create initial cluster entry
curl -k -X POST https://localhost:8080/api/cluster/registry \
  -H "Content-Type: application/json" \
  -d '{
    "cluster_name": "my-cluster",
    "created_at": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "status": "initializing"
  }'
```

### Monitor Cluster Health

```bash
# Check cluster status
curl -k https://localhost:8080/api/cluster/status

# List all nodes
curl -k https://localhost:8080/api/cluster/nodes

# Get detailed health information
curl -k https://localhost:8080/api/cluster/health
```

---

## Verification & Testing

### Test Node Discovery

```bash
# On any node, verify mDNS discovery
avahi-browse -r _map2._tcp

# Should list all cluster nodes
```

### Test Connectivity

```bash
# From management node, ping all audio nodes
for node in $(grep "hostname" /var/lib/map2/database/cluster.db); do
  echo "Testing $node"
  ping -c 1 $node
done
```

### Test API Endpoints

```bash
# Get cluster status
curl -k https://localhost:8080/api/cluster/status

# Get node list
curl -k https://localhost:8080/api/cluster/nodes

# Get health metrics
curl -k https://localhost:8080/api/cluster/health

# Get network topology
curl -k https://localhost:8080/api/cluster/topology
```

### Run Validation Tests

```bash
# Execute system validation
sudo python3 /opt/map2/scripts/validate_cluster.py

# Check all services running
sudo systemctl list-units --state=running | grep map2
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check service logs
sudo journalctl -u map2-cluster-manager -n 50

# Verify configuration
sudo cat /etc/map2/cluster.conf
sudo cat /etc/map2/.env

# Check file permissions
sudo ls -la /etc/map2/
sudo ls -la /var/lib/map2/
```

### Network Issues

```bash
# Check firewall status
sudo firewall-cmd --list-all

# Verify ports are open
sudo ss -tlnp | grep map2

# Test connectivity
curl -v https://192.168.1.100:8080/api/cluster/status
```

### Certificate Issues

```bash
# Verify certificates exist
sudo ls -la /etc/map2/ssl/

# Check certificate validity
sudo openssl x509 -in /etc/map2/ssl/node-cert.pem -text -noout

# Regenerate if needed
sudo /opt/map2/scripts/regenerate_certs.sh
```

### Node Registration Failures

```bash
# Check node logs
sudo journalctl -u map2-node-client -n 50

# Verify manager accessibility
ping -c 1 192.168.1.100
curl -k https://192.168.1.100:8080/api/cluster/status

# Manually register node
sudo /opt/map2/scripts/register_node.py
```

### Database Issues

```bash
# Backup database
sudo cp /var/lib/map2/database/cluster.db \
       /var/lib/map2/database/cluster.db.backup

# Check database integrity
sudo sqlite3 /var/lib/map2/database/cluster.db "PRAGMA integrity_check;"

# Reset if corrupted
sudo rm /var/lib/map2/database/cluster.db
sudo systemctl restart map2-cluster-manager
```

---

## Security Hardening

### Enable SELinux (if applicable)

```bash
# Check SELinux status
getenforce

# Create custom policy
sudo semanage permissive -a map2_t

# Restore to enforcing after testing
sudo semanage permissive -d map2_t
```

### Configure Firewall Zones

```bash
# Create trusted zone for internal nodes
sudo firewall-cmd --permanent --new-zone=cluster
sudo firewall-cmd --permanent --zone=cluster --add-port=8080/tcp
sudo firewall-cmd --permanent --zone=cluster --add-port=5353/udp

# Add internal subnet
sudo firewall-cmd --permanent --zone=cluster \
  --add-source=192.168.1.0/24

# Reload firewall
sudo firewall-cmd --reload
```

### Secure SSH Configuration

```bash
# Generate SSH key for cluster communication
sudo ssh-keygen -t ed25519 -f /etc/map2/ssh/cluster-key -N ""

# Distribute public key to all nodes
sudo cat /etc/map2/ssh/cluster-key.pub | \
  ssh user@audio-node "cat >> ~/.ssh/authorized_keys"
```

### Enable Certificate Pinning

```bash
# Export CA certificate fingerprint
sudo openssl x509 -noout -fingerprint \
  -sha256 -in /etc/map2/ssl/ca-cert.pem > /etc/map2/ssl/ca-fingerprint
```

### Implement RBAC

```bash
# Create admin user
sudo /opt/map2/scripts/create_user.py --username admin --role admin

# Create operator user
sudo /opt/map2/scripts/create_user.py --username operator --role operator
```

---

## Backup & Recovery

### Create Manual Backup

```bash
# Backup all cluster data
sudo /opt/map2/scripts/backup_cluster.sh

# Backup will be stored in:
# /var/lib/map2/backups/cluster-YYYY-MM-DD-HHmmss.tar.gz
```

### Configure Automatic Backups

```bash
# Edit crontab
sudo crontab -e

# Add daily backup (runs daily at 2 AM)
0 2 * * * /opt/map2/scripts/backup_cluster.sh
```

### Restore from Backup

```bash
# List available backups
ls -la /var/lib/map2/backups/

# Restore backup
sudo /opt/map2/scripts/restore_cluster.sh \
  /var/lib/map2/backups/cluster-2026-02-05-020000.tar.gz

# Verify restoration
curl -k https://localhost:8080/api/cluster/status
```

### Disaster Recovery

```bash
# If cluster is unrecoverable:

# 1. Stop all services
sudo systemctl stop map2-cluster-manager
sudo systemctl stop map2-node-client

# 2. Remove cluster data
sudo rm -rf /var/lib/map2/database/*
sudo rm -rf /var/lib/map2/backups/*

# 3. Reinitialize
sudo systemctl start map2-cluster-manager

# 4. Redeploy nodes
./deploy_cluster_node.sh --manager-ip <MANAGER_IP>
```

---

## Advanced Configuration

### Standby Node Setup (HA)

```bash
# On standby node, install with standby role
sudo ./install_cluster_manager.sh \
    --node-role STANDBY-NODE \
    --cluster-name my-cluster

# Configure replication to primary
sudo /opt/map2/scripts/setup_replication.sh 192.168.1.100

# Verify replication status
curl -k https://localhost:8080/api/cluster/replication/status
```

### Multi-Zone Deployment

```bash
# Configure zone affinity
sudo /opt/map2/scripts/configure_zones.py \
    --zone zone1 \
    --nodes node1,node2,node3

# Set update strategies per zone
sudo /opt/map2/scripts/set_zone_policy.py \
    --zone zone1 \
    --stagger-rate 1
```

### Performance Tuning

```bash
# Edit kernel parameters
sudo sysctl -w net.core.rmem_max=134217728
sudo sysctl -w net.core.wmem_max=134217728

# Make persistent
echo "net.core.rmem_max=134217728" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

---

## Support & Documentation

- **Documentation**: `/opt/map2/docs/`
- **Configuration**: `/etc/map2/`
- **Logs**: `/var/log/map2/`
- **Database**: `/var/lib/map2/database/cluster.db`

### Log Locations

```
/var/log/map2/cluster-manager.log     - Main service log
/var/log/map2/health-aggregator.log   - Health monitoring
/var/log/map2/update-orchestrator.log - Update operations
/var/log/map2/failover-monitor.log    - Failover events
```

### View Logs

```bash
# Real-time logs
sudo journalctl -u map2-cluster-manager -f

# Last 100 lines
sudo journalctl -u map2-cluster-manager -n 100

# Specific time range
sudo journalctl -u map2-cluster-manager --since "2 hours ago"
```

---

## Quick Reference

### Common Commands

```bash
# Cluster Status
curl -k https://localhost:8080/api/cluster/status

# List Nodes
curl -k https://localhost:8080/api/cluster/nodes

# Reboot Node
curl -k -X POST \
  https://localhost:8080/api/cluster/nodes/{node_id}/reboot

# Schedule Update
curl -k -X POST \
  https://localhost:8080/api/cluster/update/schedule \
  -H "Content-Type: application/json" \
  -d '{"scheduled_time": "2026-02-07T03:00:00Z"}'

# View Events
curl -k https://localhost:8080/api/cluster/events

# Create Backup
curl -k -X POST \
  https://localhost:8080/api/cluster/backup/create
```

### Service Management

```bash
# Start/stop management node
sudo systemctl {start|stop|restart} map2-cluster-manager

# Start/stop node client
sudo systemctl {start|stop|restart} map2-node-client

# Check service status
sudo systemctl status map2-cluster-manager

# View service logs
sudo journalctl -u map2-cluster-manager -f

# Enable on boot
sudo systemctl enable map2-cluster-manager
```

---

## Next Steps

1. **Create Monitoring Dashboard**: Set up Prometheus + Grafana
2. **Configure Alerting**: Set up notification rules
3. **Implement RBAC**: Create users and define roles
4. **Deploy Audio Applications**: Start deploying MAP2 instances
5. **Configure Backups**: Set up automated backup schedule
6. **Performance Tuning**: Optimize for your workloads

---

**Installation & Deployment Guide Complete** ✅

For additional support, refer to the main project documentation at https://github.com/matthewmackes/map2-audio

# Cluster Management Administrator Guide

**MAP2 Audio Platform - System Administration**

Version 1.0 | February 2026

---

## Overview

This guide covers installation, configuration, and advanced administration of the MAP2 cluster management system for system administrators.

---

## Architecture

### Components

**Management Node (Leader)**
- Cluster orchestrator
- Web UI and API
- Database (SQLite/PostgreSQL)
- Node registry and health monitoring

**Worker Nodes**
- Audio processing engines
- Chain execution
- Metrics reporting
- HTTP API for remote control

### Communication

- **HTTP/REST**: API calls, deployment
- **WebSocket**: Real-time metrics, events
- **Heartbeat**: 5-second intervals for health checks

---

## Installation

### Prerequisites

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y python3.10 python3-pip pipewire-jack

# Fedora/RHEL
sudo dnf install -y python3.10 python3-pip pipewire-jack-audio-connection-kit
```

### Management Node Setup

```bash
# Clone repository
git clone https://github.com/matthewmackes/map2-audio.git
cd map2-audio

# Install dependencies
pip install -r requirements.txt

# Initialize database
python3 -c "from app.database import init_db; init_db()"

# Start management service
python3 app/main.py --host 0.0.0.0 --port 8080
```

### Worker Node Setup

```bash
# Same installation steps as management node
# Configure as worker in config file

# Edit config.yaml
cat > config.yaml <<EOF
node:
  role: worker
  node_id: node-worker-1
  management_url: http://management-node:8080
  
cluster:
  enabled: true
  heartbeat_interval: 5
  health_check_timeout: 10
EOF

# Start worker service
python3 app/main.py --config config.yaml
```

---

## Configuration

### Database Configuration

**SQLite (Development/Small Clusters)**
```python
# app/config.py
DATABASE_URL = "sqlite+aiosqlite:///data/map2.db"
```

**PostgreSQL (Production)**
```python
DATABASE_URL = "postgresql+asyncpg://user:pass@localhost/map2"
```

### Cluster Settings

```yaml
# config.yaml
cluster:
  enabled: true
  node_registry:
    discovery: auto  # auto, static, dns
    announce_interval: 30
  
  health_monitoring:
    heartbeat_interval: 5
    timeout: 10
    retry_count: 3
  
  failover:
    enabled: true
    auto_failover: true
    promotion_delay: 2
  
  load_balancing:
    strategy: least_loaded  # least_loaded, round_robin, manual
    cpu_threshold: 80
    memory_threshold: 90
```

### Audio Engine Configuration

```yaml
audio:
  engine: juce  # CRITICAL: Use JUCE for production
  allow_python_io: false
  
  buffer_size: 256
  sample_rate: 48000
  
  latency_target: 10  # milliseconds
```

**⚠️ WARNING**: Never use `engine: python` in production!

---

## Node Management

### Registering Nodes

**Manual Registration**
```bash
curl -X POST http://management:8080/api/cluster/nodes/register \
  -H "Content-Type: application/json" \
  -d '{
    "node_id": "gpu-node-1",
    "hostname": "gpu-node-1.local",
    "capabilities": {
      "cpu_cores": 16,
      "memory_gb": 64,
      "gpu": true,
      "gpu_vram_gb": 24
    }
  }'
```

**Auto-Discovery**
- Workers announce themselves on startup
- Management node maintains registry
- Capabilities detected automatically

### Node Capabilities

Tracked per node:
- **CPU**: Core count, current load
- **Memory**: Total, available
- **GPU**: Presence, VRAM, utilization
- **Plugins**: Installed LV2/VST3 plugins
- **Network**: Latency to management node

### Health Monitoring

**Heartbeat Protocol:**
1. Worker sends heartbeat every 5 seconds
2. Includes CPU, memory, active flows
3. Management marks offline after 3 missed heartbeats
4. Auto-failover triggered if primary node fails

**Manual Health Check:**
```bash
curl http://management:8080/api/cluster/nodes/node-a/health
```

---

## Flow Orchestration

### Assignment Strategy

**ChainAnalyzer** evaluates:
- Plugin computational requirements
- GPU necessity (ConvReverb, NAM models)
- Memory footprint
- Real-time constraints

**Orchestrator** selects nodes based on:
1. Required capabilities present
2. Available resources (CPU < 80%, Memory < 90%)
3. Network latency
4. Current load

### Deployment Process

1. **Validation**: Verify chain configuration
2. **Node Selection**: Choose target based on requirements
3. **Assignment**: Create database record
4. **Deployment**: POST chain config to worker node
5. **Activation**: Worker starts audio processing
6. **Monitoring**: Track metrics and health

### Redundancy Setup

```python
# Via API
{
  "flow_id": "flow-0",
  "chain_id": 1,
  "node_id": "node-a",
  "redundancy_enabled": true,
  "standby_node_id": "node-b"  # Optional, auto-selected if omitted
}
```

**Standby Selection Criteria:**
- Different physical host than primary
- Same capabilities as primary
- Lowest current load

---

## Database Schema

### Key Tables

**flow_assignments**
```sql
CREATE TABLE flow_assignments (
  id INTEGER PRIMARY KEY,
  flow_id TEXT NOT NULL,
  chain_id INTEGER,
  node_id TEXT NOT NULL,
  role TEXT,  -- 'primary' or 'standby'
  redundancy_enabled BOOLEAN,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

**node_capabilities**
```sql
CREATE TABLE node_capabilities (
  id INTEGER PRIMARY KEY,
  node_id TEXT UNIQUE NOT NULL,
  hostname TEXT,
  cpu_cores INTEGER,
  memory_gb FLOAT,
  gpu BOOLEAN,
  gpu_vram_gb FLOAT,
  status TEXT,  -- 'ONLINE', 'OFFLINE', 'DEGRADED'
  last_heartbeat TIMESTAMP
);
```

### Backup and Recovery

**SQLite Backup:**
```bash
# Hot backup
sqlite3 data/map2.db ".backup data/map2-backup.db"

# Scheduled backup (cron)
0 2 * * * sqlite3 /opt/map2/data/map2.db ".backup /backup/map2-$(date +\%Y\%m\%d).db"
```

**PostgreSQL Backup:**
```bash
pg_dump map2 > map2-backup.sql
```

---

## Monitoring and Metrics

### Performance Metrics

**Cluster-Level:**
- Total nodes online/offline
- Aggregate CPU/memory usage
- Total active flows
- Failover events per hour

**Node-Level:**
- CPU utilization %
- Memory usage (used/total)
- GPU utilization %
- Audio XRuns (underruns)
- Network latency to management

**Flow-Level:**
- Processing latency (ms)
- Buffer fill percentage
- Plugin CPU usage
- Active/standby status

### Logging

**Log Locations:**
- `/var/log/map2/cluster.log` - Cluster events
- `/var/log/map2/orchestrator.log` - Flow assignments
- `/var/log/map2/audio.log` - Audio engine events
- `/var/log/map2/api.log` - HTTP API requests

**Log Levels:**
```python
# config.py
LOG_LEVEL = "INFO"  # DEBUG, INFO, WARNING, ERROR, CRITICAL
```

### Alerting

**Critical Events:**
- Node offline → Trigger failover
- CPU > 95% → Prevent new assignments
- Memory > 95% → Warning
- XRun detected → Log and monitor
- Failover executed → Admin notification

---

## Security

### Network Security

**Firewall Rules:**
```bash
# Management node
sudo ufw allow 8080/tcp    # API/Web UI
sudo ufw allow 9090/tcp    # WebSocket (metrics)

# Worker nodes
sudo ufw allow from <management-ip> to any port 8080
```

### Authentication

**API Key (Production):**
```python
# app/config.py
API_KEY = os.getenv("MAP2_API_KEY")

# Require header:
# Authorization: Bearer <API_KEY>
```

### TLS/SSL

```yaml
# config.yaml
server:
  ssl_enabled: true
  ssl_cert: /etc/map2/ssl/cert.pem
  ssl_key: /etc/map2/ssl/key.pem
```

---

## Performance Tuning

### Audio Engine Optimization

**JACK Configuration:**
```bash
# Low-latency setup
jackd -R -P 85 -d alsa -r 48000 -p 256 -n 2
```

**PipeWire Configuration:**
```conf
# /etc/pipewire/pipewire.conf
context.properties = {
    default.clock.rate = 48000
    default.clock.quantum = 256
    default.clock.min-quantum = 256
    default.clock.max-quantum = 8192
}
```

### Database Optimization

**SQLite:**
```python
# Pragmas for performance
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 10000;
```

**PostgreSQL:**
```sql
-- Connection pooling
max_connections = 100
shared_buffers = 256MB
effective_cache_size = 1GB
```

### Network Tuning

```bash
# Increase TCP buffer sizes
sudo sysctl -w net.core.rmem_max=16777216
sudo sysctl -w net.core.wmem_max=16777216
```

---

## Troubleshooting

### Common Issues

**Issue: High CPU on management node**
- **Cause**: Too many nodes reporting metrics
- **Fix**: Increase heartbeat interval, reduce metric frequency

**Issue: Failover loops**
- **Cause**: Both primary and standby unhealthy
- **Fix**: Check node resources, disable auto-failover temporarily

**Issue: Assignment failures**
- **Cause**: Node capability mismatch
- **Fix**: Verify plugin installation on target node

### Debug Mode

```bash
# Enable verbose logging
MAP2_DEBUG=1 python3 app/main.py

# SQL query logging
SQLALCHEMY_ECHO=1 python3 app/main.py
```

### Health Check Script

```bash
#!/bin/bash
# check_cluster.sh

echo "Cluster Health Check"
echo "===================="

# Check management node
curl -s http://localhost:8080/api/cluster/nodes | jq '.nodes[] | {node_id, status}'

# Check database
sqlite3 data/map2.db "SELECT COUNT(*) FROM flow_assignments;"

# Check logs for errors
grep -i error /var/log/map2/cluster.log | tail -5
```

---

## Upgrading

### Rolling Upgrade Procedure

1. **Backup database**
2. **Update management node** (during maintenance window)
3. **Update worker nodes one by one:**
   - Put node in maintenance mode
   - Stop service
   - Update code
   - Restart service
   - Verify health
   - Exit maintenance mode
4. **Verify all flows running**

### Migration Scripts

```bash
# Run database migrations
python3 scripts/migrate_db.py --from 1.0 --to 1.1
```

---

## API Reference

See [CLUSTER_USER_GUIDE.md](CLUSTER_USER_GUIDE.md) for basic API examples.

### Advanced Endpoints

**Bulk Assignment:**
```bash
POST /api/cluster/flows/bulk-assign
{
  "assignments": [
    {"flow_id": "flow-0", "chain_id": 1, "node_id": "node-a"},
    {"flow_id": "flow-1", "chain_id": 2, "node_id": "node-b"}
  ]
}
```

**Node Metrics:**
```bash
GET /api/cluster/nodes/{node_id}/metrics?duration=1h
```

**Deployment History:**
```bash
GET /api/cluster/flows/history?flow_id=flow-0
```

---

## Support and Resources

- **Documentation**: `/docs`
- **Source Code**: `github.com/matthewmackes/map2-audio`
- **Issues**: GitHub Issues
- **Community**: Discord/Forum

---

*Document Version: 1.0*  
*Last Updated: February 5, 2026*

# MAP2 Cluster Management - Quick Reference Guide

**Last Updated:** February 5, 2026  
**Phase:** 1 of 6 (Foundation Complete)  

---

## 🚀 QUICK START (5 minutes)

### 1. Verify Installation
```bash
# Check cluster module imports
python3 -c "from app.services.cluster import *; print('✓ Cluster module loaded')"

# Check all submodules
python3 << 'EOF'
from app.services.cluster import (
    get_enhanced_node_identity,
    get_ztp_bootstrap,
    get_enhanced_mdns_discovery,
    get_cluster_registry,
    get_cluster_ca,
)
print("✓ All cluster services available")
EOF
```

### 2. Initialize a Node
```python
from app.services.cluster import get_enhanced_node_identity

# Get node identity (auto-creates if first boot)
node = get_enhanced_node_identity()
print(f"Node ID: {node.get_node_id()}")
print(f"Role: {node.get_role()}")
print(f"Capabilities: {node.get_capabilities()}")
```

### 3. Check Cluster Status
```bash
# Query via API (once running)
curl http://localhost:8080/api/cluster/status
curl http://localhost:8080/api/cluster/nodes
curl http://localhost:8080/api/cluster/health
```

---

## 📂 PROJECT STRUCTURE

```
app/services/cluster/          # All cluster services
├── __init__.py                # Main module + imports
├── enhanced_node_identity.py  # Node IDs + hardware detection
├── ztp.py                     # Zero-Touch Provisioning
├── mdns_discovery_enhanced.py # Local network discovery
├── registry.py                # SQLite cluster database
├── certificate_authority.py   # CA + mTLS certs
├── health_aggregator.py       # Metrics & health scores
└── fedora_package_manager.py  # DNF package updates

app/routes/
├── cluster_admin.py           # 12 REST API endpoints

scripts/
├── ztp-init.sh                # Shell bootstrap script

/etc/map2/                      # Fedora standard location
├── node.conf                  # Node configuration
├── cluster.conf               # Cluster settings (Task 28)
├── ssl/                       # Certificates
│   ├── ca-cert.pem
│   ├── {node-id}-cert.pem
│   └── {node-id}-key.pem
└── ssh/                       # SSH keys

/var/lib/map2/                  # Runtime data
├── cluster.db                 # SQLite registry
└── backups/                   # Backup storage (Task 15)
```

---

## 🔑 KEY CLASSES & FUNCTIONS

### Enhanced Node Identity
```python
from app.services.cluster import get_enhanced_node_identity

node = get_enhanced_node_identity()

# Get node information
node_id = node.get_node_id()        # e.g., "AUDIO-NODE-a1b2c3d4"
role = node.get_role()               # AUDIO-NODE or MANAGEMENT-NODE
caps = node.get_capabilities()       # Hardware capabilities
```

### Cluster Registry
```python
from app.services.cluster import get_cluster_registry

registry = get_cluster_registry()

# Get nodes
nodes = registry.get_all_nodes()
online = registry.get_nodes_by_status("online")
mgmt = registry.get_nodes_by_role("MANAGEMENT-NODE")

# Add/update nodes
registry.add_or_update_node(
    node_id="audio-01",
    hostname="audio-01.local",
    ip_address="192.168.1.100",
    role="AUDIO-NODE",
    status="online"
)

# Get cluster summary
summary = registry.get_cluster_summary()
```

### Health Aggregator
```python
from app.services.cluster import get_health_aggregator

agg = get_health_aggregator()

# Get health scores
health = agg.get_cluster_health()       # Overall health
node_health = agg.get_node_health("audio-01")
```

### Certificate Authority
```python
from app.services.cluster import get_cluster_ca

ca = get_cluster_ca()

# Generate root CA (one-time)
ca.generate_root_ca()

# Issue node certificate
ca.issue_node_certificate(
    node_id="audio-01",
    common_name="audio-01.map2.local",
    sans=["192.168.1.100", "audio-01.local"]
)
```

### DNF Package Manager
```python
from app.services.cluster import get_dnf_manager

dnf = get_dnf_manager()

# Check for updates
updates = dnf.check_for_updates()
for update in updates:
    print(f"{update.package_name}: {update.current_version} → {update.available_version}")

# Take snapshot before update
snapshot = dnf.snapshot_packages("node-01")

# Simulate update
result = dnf.simulate_update()
if result["success"]:
    print("✓ Simulation passed, safe to update")
```

### mDNS Discovery
```python
from app.services.cluster import get_enhanced_mdns_discovery

discovery = get_enhanced_mdns_discovery()

# Discover nodes
discovery.add_discovered_node(
    node_id="audio-01",
    hostname="audio-01.local",
    addresses=["192.168.1.100"],
    txt_records={
        "cpu_cores": "8",
        "memory_gb": "16",
        "role": "AUDIO-NODE"
    }
)

# Get summary
summary = discovery.get_cluster_summary()
print(f"Online nodes: {summary['online_nodes']}")
```

---

## 🔌 REST API ENDPOINTS

### Cluster Status
```bash
# Overall cluster state
GET /api/cluster/status
→ { total_nodes, online_nodes, avg_health, ... }

# Quick summary (optimized for dashboards)
GET /api/cluster/summary
→ { online_nodes, management_nodes, audio_nodes, overall_health }

# Cluster health details
GET /api/cluster/health
→ { overall_health, nodes: {...} }

# Discovered nodes from mDNS
GET /api/cluster/discovered
→ { online_nodes, nodes: [...] }

# Certificate status
GET /api/cluster/certificates/status
→ { ca_certificate, certificates: {...} }

# Health check (no auth)
GET /api/cluster/ping
→ { status: "ok" }
```

### Node Management
```bash
# List all nodes (with filtering)
GET /api/cluster/nodes?role=AUDIO-NODE&status=online
→ { count, nodes: [...] }

# Get specific node details
GET /api/cluster/nodes/{node_id}
→ { node, health_score, metrics, ... }

# Get node health
GET /api/cluster/health/{node_id}
→ { health_score, status }

# Trigger node update
POST /api/cluster/nodes/{node_id}/update?dry_run=true
→ { action, status }

# Reboot node
POST /api/cluster/nodes/{node_id}/reboot?force=false
→ { action, status }

# Get metrics
GET /api/cluster/metrics?node_id={node_id}
→ { metrics: [...] }
```

---

## ⚙️ CONFIGURATION

### Node Configuration (`/etc/map2/node.conf`)
```ini
[node]
id = AUDIO-NODE-a1b2c3d4
hostname = audio-01
uuid = 550e8400-e29b-41d4-a716-446655440000
mac_address = 00:1a:2b:3c:4d:5e
role = AUDIO-NODE
deployment_mode = AUDIO-NODE

[hardware]
cpu_model = Intel Core i7-9700
cpu_cores = 8
total_memory_gb = 16
audio_devices = alsa:HDA Intel PCH, usb:RME Fireface
has_gpu = false
storage_gb = 256
kernel_version = 5.15.50-1.fc35.x86_64

[ztp]
completed = true
completed_at = 2026-02-05T10:30:00
```

### Cluster Configuration (`/etc/map2/cluster.conf`)
```ini
[general]
cluster_name = MAP2 Production
primary_node_ip = 192.168.1.100
standby_nodes = 192.168.1.101

[security]
tls_enabled = true
cert_path = /etc/map2/ssl

[update]
schedule_day = sunday
schedule_time = 03:00
stagger_count = 2

[monitoring]
health_check_interval = 30
metrics_interval = 60

[network]
discovery_enabled = true
multicast_iface = eth0
```

---

## 📊 DATABASE SCHEMA

### Cluster Registry (`/var/lib/map2/cluster.db`)

**cluster_nodes table:**
```
id (TEXT, PK)
hostname (TEXT)
ip_address (TEXT)
mac_address (TEXT)
role (TEXT)
deployment_mode (TEXT)
cpu_cores (INTEGER)
total_memory_gb (INTEGER)
audio_devices (JSON)
storage_gb (INTEGER)
status (TEXT) - online/offline/degraded/updating
health_score (REAL) - 0-100
last_seen (TIMESTAMP)
last_updated (TIMESTAMP)
version (TEXT)
metadata (JSON)
```

**node_metrics_history table:**
```
node_id (TEXT, FK)
timestamp (TIMESTAMP, PK)
cpu_percent (REAL)
memory_percent (REAL)
dsp_load_percent (REAL)
xrun_count (INTEGER)
latency_ms (REAL)
```

---

## 🧪 TESTING

### Run Module Tests
```bash
# Test imports
python3 -c "from app.services.cluster import *; print('OK')"

# Test cluster registry
python3 << 'EOF'
from app.services.cluster import get_cluster_registry
registry = get_cluster_registry()
registry.add_or_update_node("test-node", "test.local", "192.168.1.50")
print(registry.get_all_nodes())
EOF

# Test mDNS discovery
python3 << 'EOF'
from app.services.cluster import get_enhanced_mdns_discovery
discovery = get_enhanced_mdns_discovery()
discovery.add_discovered_node("node-1", "node-1.local", ["192.168.1.100"], {"cpu_cores": "8"})
print(discovery.get_cluster_summary())
EOF
```

### Test API Endpoints
```bash
# Start API server
python3 app/main.py --reload &

# Test endpoints
curl http://localhost:8080/api/cluster/ping
curl http://localhost:8080/api/cluster/status
curl http://localhost:8080/api/cluster/nodes
```

---

## 🔍 DEBUGGING

### Enable Verbose Logging
```python
import logging
logging.basicConfig(level=logging.DEBUG)

logger = logging.getLogger("app.services.cluster")
logger.setLevel(logging.DEBUG)
```

### Check Node Health Calculation
```python
from app.services.cluster.health_aggregator import NodeMetrics

metrics = NodeMetrics(
    node_id="test",
    cpu_percent=30.0,
    memory_percent=50.0,
    dsp_load_percent=15.0,
    xrun_count=0,
)

health = metrics.calculate_health_score()
print(f"Health Score: {health:.1f}")  # Should be ~85
```

### Verify Certificate Generation
```bash
# Check if CA exists
ls -la /etc/map2/ssl/ca-cert.pem

# List certificates
openssl x509 -in /etc/map2/ssl/ca-cert.pem -text -noout

# Check certificate expiry
openssl x509 -in /etc/map2/ssl/ca-cert.pem -noout -dates
```

### Monitor Cluster Registry
```bash
# Query SQLite database
sqlite3 /var/lib/map2/cluster.db "SELECT id, role, status, health_score FROM cluster_nodes;"

# View recent metrics
sqlite3 /var/lib/map2/cluster.db \
  "SELECT node_id, timestamp, cpu_percent, dsp_load_percent \
   FROM node_metrics_history \
   ORDER BY timestamp DESC LIMIT 10;"
```

---

## 📝 COMMON TASKS

### Add a New Node to Cluster
```python
from app.services.cluster import get_cluster_registry

registry = get_cluster_registry()

registry.add_or_update_node(
    node_id="audio-02",
    hostname="audio-02.local",
    ip_address="192.168.1.101",
    mac_address="00:1a:2b:3c:4d:5f",
    role="AUDIO-NODE",
    cpu_cores=8,
    total_memory_gb=16,
    audio_devices=["alsa:HDA Intel", "usb:RME Fireface"],
    status="online",
    health_score=85.0
)
```

### Update Node Health
```python
from app.services.cluster import get_cluster_registry

registry = get_cluster_registry()
registry.update_node_health("audio-01", 92.5)
```

### Record Metrics
```python
from app.services.cluster import get_cluster_registry

registry = get_cluster_registry()
registry.add_metrics(
    node_id="audio-01",
    cpu_percent=25.3,
    memory_percent=45.2,
    dsp_load_percent=18.7,
    xrun_count=0,
    latency_ms=2.1
)
```

### Generate Node Certificate
```python
from app.services.cluster import get_cluster_ca

ca = get_cluster_ca()

# Generate root CA (if first time)
ca.generate_root_ca()

# Issue certificate for node
ca.issue_node_certificate(
    node_id="audio-01",
    common_name="audio-01.map2.local",
    sans=["192.168.1.100", "audio-01.local"]
)
```

---

## 🆘 TROUBLESHOOTING

| Issue | Solution |
|-------|----------|
| Module import fails | Check Python 3.8+, run `pip install cryptography` |
| Database locked | SQLite WAL mode handles concurrent access; wait a moment |
| Certificate generation fails | Ensure /etc/map2/ssl is writable with 700 permissions |
| API endpoints 404 | Ensure cluster_admin routes registered in main app |
| Health scores low | Check CPU/memory/DSP metrics; high DSP load = lower score |
| Nodes not discovered | Verify mDNS enabled; check firewall multicast rules |

---

## 📚 FURTHER READING

- [PHASE_1_DELIVERY_SUMMARY.md](./PHASE_1_DELIVERY_SUMMARY.md) - Detailed delivery info
- [IMPLEMENTATION_PROGRESS_REPORT.md](./IMPLEMENTATION_PROGRESS_REPORT.md) - Status & roadmap
- [CLUSTER_MANAGEMENT_IMPLEMENTATION_GUIDE.md](./CLUSTER_MANAGEMENT_IMPLEMENTATION_GUIDE.md) - 50-task spec
- [CLUSTER_DEVELOPER_QUICKSTART.md](./CLUSTER_DEVELOPER_QUICKSTART.md) - Developer guide

---

## 🎯 NEXT STEPS

1. **Task 10:** Update Orchestrator (Fleet-wide updates)
2. **Task 11:** Config Distribution (GitOps)
3. **Task 12:** State Replication (Failover)

**Estimated Time for Task 10:** 6-8 hours  
**Total Remaining (Tasks 10-50):** ~35 hours  

---

*Quick Reference Guide | February 2026 | MAP2 Audio Cluster Management*

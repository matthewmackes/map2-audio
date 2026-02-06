# PHASE 2 QUICK REFERENCE GUIDE
## Update Orchestration, Config Distribution, State Replication

This guide shows how to use the Phase 2 features implemented in February 2026.

---

## 🔄 PACKAGE UPDATE ORCHESTRATION

### Recommended Update Workflow

```bash
# 1. Check what would be updated (dry-run)
curl -X POST https://management-node:8443/api/cluster/update/dry-run \
  -H "Content-Type: application/json"

# Response:
# {
#   "available_updates": 15,
#   "update_details": ["kernel-6.8.x", "systemd-256", ...],
#   "affected_nodes": 5,
#   "dry_run": true,
#   "estimated_duration_hours": 2.5
# }

# 2. Get recommended schedule
curl https://management-node:8443/api/cluster/update/schedule \
  -H "Content-Type: application/json"

# Response:
# {
#   "total_nodes": 5,
#   "audio_nodes": 3,
#   "management_nodes": 2,
#   "nodes_per_hour": 2,
#   "estimated_hours": 2.5,
#   "recommended_schedule": "Sunday 3:00 AM",
#   "recommended_window_hours": 3.5
# }

# 3. Execute updates
curl -X POST https://management-node:8443/api/cluster/update/execute \
  -H "Content-Type: application/json"

# Response:
# {
#   "status": "completed",
#   "report": {
#     "phase": "complete",
#     "total_nodes": 5,
#     "updated_nodes": 5,
#     "failed_nodes": 0,
#     "success_rate": 100.0,
#     "duration_minutes": 147,
#     "job_history": {
#       "node-1": {"status": "success", ...},
#       "node-2": {"status": "success", ...},
#       ...
#     }
#   }
# }
```

### Update Scheduling

Updates are automatically scheduled via systemd timer:

```bash
# View timer status
systemctl status map2-fleet-update.timer

# View service status
systemctl status map2-fleet-update.service

# View update logs
journalctl -u map2-fleet-update.service -f

# Manually trigger update (for testing)
systemctl start map2-fleet-update.service
```

### Cancelling an Update

```bash
# Cancel ongoing update (graceful stop)
curl -X POST https://management-node:8443/api/cluster/update/cancel

# Response:
# {
#   "cancelled": true,
#   "message": "Update cancelled"
# }
```

### Update History

```bash
# Get past update operations
curl https://management-node:8443/api/cluster/update/history?limit=10

# Response:
# {
#   "updates": [
#     {
#       "start_time": "2026-02-08T03:00:00",
#       "duration_minutes": 147,
#       "total_nodes": 5,
#       "updated_nodes": 5,
#       "success_rate": 100.0,
#       "phase": "complete"
#     },
#     ...
#   ],
#   "total": 2,
#   "limit": 10
# }
```

---

## 📝 CONFIGURATION DISTRIBUTION

### Pushing Configuration to All Nodes

```bash
# Push a new preset
curl -X POST https://management-node:8443/api/cluster/config/push \
  -H "Content-Type: application/json" \
  -d '{
    "config_type": "preset",
    "config_data": {
      "name": "Clean Guitar",
      "chain": [...],
      "parameters": {...}
    },
    "message": "Add clean guitar preset"
  }'

# Response:
# {
#   "success": true,
#   "nodes_updated": 5,
#   "config_type": "preset",
#   "message": "Add clean guitar preset"
# }
```

### Configuration Types Supported

1. **preset** - Complete audio processing presets
2. **midi_mapping** - MIDI controller mappings
3. **audio_chain** - Audio signal flow configurations

### Configuration History

```bash
# View all configuration versions
curl https://management-node:8443/api/cluster/config/history?limit=20

# Response:
# {
#   "versions": [
#     {
#       "hash": "abc123def456",
#       "timestamp": "2026-02-08T14:30:00",
#       "author": "admin@example.com",
#       "message": "Add clean guitar preset",
#       "files_changed": 1
#     },
#     {
#       "hash": "def456ghi789",
#       "timestamp": "2026-02-07T10:15:00",
#       "author": "engineer@example.com",
#       "message": "Update MIDI mappings",
#       "files_changed": 2
#     },
#     ...
#   ],
#   "total": 42
# }
```

### Viewing Config Differences

```bash
# Compare two configuration versions
curl "https://management-node:8443/api/cluster/config/diff?version_a=abc123&version_b=def456" \
  -H "Content-Type: application/json"

# Response:
# {
#   "version_a": "abc123",
#   "version_b": "def456",
#   "changes": {
#     "added": [...],
#     "removed": [...],
#     "modified": [...]
#   }
# }
```

### Rollback Configuration

```bash
# Restore previous configuration version
curl -X POST https://management-node:8443/api/cluster/config/rollback \
  -H "Content-Type: application/json" \
  -d '{"version_hash": "abc123def456"}'

# Response:
# {
#   "success": true,
#   "version": "abc123def456",
#   "message": "Configuration rolled back"
# }
```

---

## 🔁 STATE REPLICATION & FAILOVER

### Replication Status

```bash
# Check replication status
curl https://management-node:8443/api/cluster/replication/status

# Response:
# {
#   "is_primary": true,
#   "last_replication": "2026-02-08T14:30:00",
#   "standby_host": "192.168.1.102",
#   "replication_interval_seconds": 300,
#   "last_heartbeat": "2026-02-08T14:30:00"
# }
```

### Force Replication Sync

```bash
# Force immediate sync to standby (primary only)
curl -X POST https://management-node:8443/api/cluster/replication/force-sync

# Response:
# {
#   "success": true,
#   "message": "Replication forced"
# }
```

### Automatic Failover

**How it works:**
1. Standby monitors primary via heartbeat (every 10 seconds)
2. If 3 heartbeats missed (30-second timeout), failover triggered
3. Standby assumes primary role automatically
4. Cluster registry is taken over
5. All audio nodes notified of new primary

**Verification after failover:**
```bash
# Check which node is now primary
curl https://192.168.1.102:8443/api/cluster/replication/status
# Should now show: "is_primary": true

# Check cluster health
curl https://192.168.1.102:8443/api/cluster/status
```

---

## 🛠️ SYSTEMD INTEGRATION

### Service Status

```bash
# Check all cluster services
systemctl status map2-cluster-manager.service
systemctl status map2-health-sync.service
systemctl status map2-failover-monitor.service

# View logs for any service
journalctl -u map2-cluster-manager.service -n 100
journalctl -u map2-health-sync.service -f
journalctl -u map2-failover-monitor.service -f
```

### Timer Configuration

```bash
# View timer schedule
systemctl list-timers map2-fleet-update.timer

# Manually run update now
systemctl start map2-fleet-update.service

# Disable automatic updates
systemctl disable map2-fleet-update.timer
systemctl stop map2-fleet-update.timer

# Re-enable automatic updates
systemctl enable map2-fleet-update.timer
systemctl start map2-fleet-update.timer
```

---

## 📊 MONITORING DURING OPERATIONS

### Watch Update Progress

```bash
# Monitor updates in real-time
watch 'curl -s https://management-node:8443/api/cluster/status | jq .'

# View detailed update logs
journalctl -u map2-fleet-update.service -f | grep -E "(node|progress|failed)"

# Check individual node status
curl https://management-node:8443/api/cluster/nodes | jq '.[] | {id, status, role, last_update}'
```

### Config Sync Status

```bash
# Verify config distribution to nodes
for node in node-1 node-2 node-3; do
  echo "=== $node ==="
  curl -s https://$node:8443/api/node/config-version
done
```

---

## ⚙️ CONFIGURATION FILES

### Update Settings

Edit `/etc/map2/cluster.conf` to customize:

```ini
[update]
schedule_day = sunday
schedule_time = 03:00
stagger_count = 2        # nodes per hour
dry_run = false
test_node = node-1
enable_rollback = true
```

### Replication Settings

```ini
[replication]
enabled = true
standby_host = 192.168.1.102
replication_interval_seconds = 300
heartbeat_interval_seconds = 10
heartbeat_timeout_seconds = 30
```

---

## 🔒 SECURITY NOTES

- All API calls use mTLS (mutual TLS authentication)
- Configuration changes are signed and audited
- State replication uses encrypted channels
- Heartbeat messages are authenticated

---

## 🚨 TROUBLESHOOTING

### Updates Failing

```bash
# Check disk space
ssh management-node "df -h /var/lib/map2"

# Verify DNF state
ssh node-1 "dnf check"

# View update logs
journalctl -u map2-fleet-update.service -n 50 | tail -20
```

### Failover Not Triggered

```bash
# Check heartbeat status
journalctl -u map2-failover-monitor.service | grep "heartbeat"

# Verify network connectivity
ping standby-node
ping primary-node
```

### Config Not Syncing

```bash
# Verify git repository
git -C /var/lib/map2/config-repo log --oneline | head -5

# Check for conflicts
git -C /var/lib/map2/config-repo status
```

---

## 📞 SUPPORT

For detailed API documentation, see: `CLUSTER_API_REFERENCE.md`  
For troubleshooting: `TROUBLESHOOTING_CLUSTER.md`  
For architecture: `CLUSTER_ARCHITECTURE.md`

---

*Updated: February 5, 2026*

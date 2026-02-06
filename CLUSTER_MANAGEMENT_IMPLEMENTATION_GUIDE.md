# MAP2 Audio Platform - Cluster Management Implementation Guide

**Version:** 1.0  
**Date:** February 5, 2026  
**Status:** 50-Task Implementation Plan  
**Estimated Duration:** 40-50 hours of focused implementation

---

## 🎯 Executive Summary

This document provides **complete specification and implementation guide** for adding enterprise-grade cluster management to MAP2 Audio Platform. The system is designed with these core principles:

✅ **Audio nodes are sacred** - Keep DSP load < 1% overhead  
✅ **Fedora standards** - Use systemd, DNF, /etc/map2 conventions  
✅ **Operational simplicity** - All nodes manageable from any other node  
✅ **High availability** - Failover, redundancy, automatic recovery  
✅ **Zero manual sync** - Automatic package/config/state synchronization  

---

## 📋 50-Task Breakdown by Category

### **PHASE 1: Foundation & Identity (Tasks 1-3) ✅ COMPLETE**

These provide the fundamental building blocks for cluster awareness.

**Task 1: Cluster Architecture Module Foundation** ✅
- **File:** `app/services/cluster/__init__.py`
- **Status:** COMPLETED
- **Deliverables:**
  - `ClusterNodeRole` enum (AUDIO_NODE, MANAGEMENT_NODE, STANDBY_MANAGEMENT, FRONTEND_ONLY)
  - `ClusterNodeStatus` enum (ONLINE, OFFLINE, DEGRADED, INITIALIZING, UPDATING, FAILED, RECOVERING)
  - `ClusterMode` enum (HEALTHY, DEGRADED, PARTIAL_FAILURE, CRITICAL_FAILURE)
  - `ClusterNode` dataclass with metadata
  - `ClusterState` dataclass for aggregate cluster state
  - `ClusterManager` base class (not instantiated on audio nodes)
  - Feature flag: `CLUSTER_ENABLED` (defaults to false)

**Task 2: Enhanced Node Identity** ✅
- **File:** `app/services/cluster/enhanced_node_identity.py`
- **Status:** COMPLETED
- **Deliverables:**
  - `NodeCapabilities` dataclass (CPU, memory, audio interfaces, storage)
  - `NodeConfig` dataclass for persistent node configuration
  - `NodeHardwareDetector` class with methods:
    - `get_cpu_info()` → (cores, model)
    - `get_memory_gb()` → total GB
    - `detect_audio_interfaces()` → (bool, list)
    - `detect_gpu()` → bool
    - `get_storage_gb()` → available GB
    - `get_kernel_version()` → version string
    - `get_os_release()` → Fedora version
    - `get_mac_addresses()` → list of MACs
  - `EnhancedNodeIdentity` class:
    - Generates UUID+MAC immutable IDs
    - Auto-detects role (AUDIO-NODE vs MANAGEMENT-NODE)
    - Stores config in `/etc/map2/node.conf` (Fedora standard)
    - Methods: `get_node_id()`, `get_role()`, `get_capabilities()`, `promote_to_management()`, `set_as_standby()`
  - Singleton: `get_enhanced_node_identity()`

**Task 3: Zero-Touch Provisioning (ZTP)** → IN-PROGRESS
- **Files:** `app/services/cluster/ztp.py`, `scripts/ztp-init.sh`
- **Deliverables:**
  - `ZTPBootstrap` class to run on first boot
  - First-boot detection via `/etc/map2/node.conf` existence
  - Auto-generate node ID using `EnhancedNodeIdentity`
  - Detect hardware capabilities automatically
  - Set deployment mode: AUDIO-NODE if audio devices, else MANAGEMENT-NODE
  - Provision SSH keys (request from CA)
  - Create systemd unit hook: `map2-ztp-init.service`
  - Shell script `/opt/map2/scripts/ztp-init.sh` for package post-install

---

### **PHASE 2: Discovery & Registration (Tasks 4-5)**

Enable nodes to find each other and maintain inventory.

**Task 4: Enhanced mDNS Discovery with Rich TXT Records**
- **File:** `app/services/cluster/mdns_discovery_enhanced.py` (extends existing)
- **Changes to existing:** `app/services/mdns_discovery.py`
- **Deliverables:**
  - Extend mDNS TXT records with:
    - `cpu_cores=4`
    - `memory_gb=16`
    - `audio_ifaces=JACK,ALSA`
    - `kernel=6.7.9-200.fc39.x86_64`
    - `role=AUDIO-NODE`
    - `health_score=95`
    - `manager=true` (if management node)
  - `MDNSNode` dataclass to represent discovered node
  - Cache discovered nodes in-memory (30-second TTL)
  - Automatic node removal on service stop

**Task 5: Cluster Registry (CMDB) with SQLite**
- **File:** `app/services/cluster/registry.py`
- **Database:** Uses existing map2.db
- **Schema:**
  ```sql
  CREATE TABLE cluster_nodes (
    id TEXT PRIMARY KEY,           -- node_id (e.g., "AUDIO-NODE-a1b2")
    hostname TEXT,
    ip_address TEXT,
    mac_address TEXT,
    role TEXT,                     -- AUDIO-NODE, MANAGEMENT-NODE, etc
    deployment_mode TEXT,          -- from deployment.py
    cpu_cores INTEGER,
    total_memory_gb INTEGER,
    audio_devices TEXT,            -- JSON list
    status TEXT,                   -- online, offline, degraded, etc
    health_score REAL,             -- 0-100
    last_seen TIMESTAMP,
    last_updated TIMESTAMP,
    version TEXT
  );
  CREATE INDEX idx_nodes_status ON cluster_nodes(status);
  CREATE INDEX idx_nodes_role ON cluster_nodes(role);
  ```
- **Deliverables:**
  - `ClusterRegistry` class with CRUD operations
  - Methods: `add_node()`, `update_node()`, `remove_node()`, `get_node()`, `list_all_nodes()`, `list_by_role()`, `sync_discovered_nodes()`
  - Auto-sync every 30 seconds
  - Replicate to standby management node
  - Health-check before returning node status

---

### **PHASE 3: Security & Certificates (Task 6)**

Enable secure inter-node communication.

**Task 6: Distributed Certificate Authority (CA) System**
- **File:** `app/services/cluster/certificate_authority.py`
- **Dependencies:** `cryptography` library (add to pyproject.toml if missing)
- **Directories:** `/etc/map2/ssl/` (certificates)
- **Deliverables:**
  - `ClusterCA` class (runs only on primary management node)
  - Self-signed root CA generation on first boot
  - Store root CA cert at: `/etc/map2/ssl/ca-cert.pem`
  - Store root CA key at: `/etc/map2/ssl/ca-key.pem` (mode 0600)
  - `CSRHandler` class for Certificate Signing Requests
  - New nodes call `/api/ca/request-cert` with CSR
  - Issue node certificates signed by root CA
  - Store node certs at: `/etc/map2/ssl/<node-id>-cert.pem`
  - Implement automatic renewal at 80% lifetime (before expiry)
  - Provide CRL (Certificate Revocation List) endpoint
  - Enable mTLS for all inter-node REST API calls
  - Use environment variables:
    - `MAP2_TLS_CERT_PATH` → path to node certificate
    - `MAP2_TLS_KEY_PATH` → path to node key
    - `MAP2_TLS_CA_PATH` → path to CA certificate

---

### **PHASE 4: Health Monitoring (Tasks 7-22)**

Implement telemetry and health assessment.

**Task 7: Health Metrics Aggregator Service**
- **File:** `app/services/cluster/health_aggregator.py`
- **Deliverables:**
  - `HealthAggregator` class (runs on management nodes)
  - Scrape Prometheus metrics from all nodes every 30 seconds
  - Metrics collected:
    - System: CPU%, memory%, disk usage%
    - Audio: DSP load%, xrun count, xrun rate
    - Network: latency_ms to management node
    - Services: running/failed counts
  - Calculate health score per node (0-100):
    - Formula: `base=100 - (cpu_pct/2 + mem_pct/2 + xrun_rate*5)`
    - Deduct 10 if xruns > 0 in last 5 min
    - Deduct 20 if DSP load > 80%
    - Minimum 0, maximum 100
  - Store metrics history in SQLite:
    ```sql
    CREATE TABLE node_metrics_history (
      node_id TEXT,
      timestamp TIMESTAMP,
      cpu_percent REAL,
      memory_percent REAL,
      dsp_load_percent REAL,
      xrun_count INTEGER,
      latency_ms REAL,
      PRIMARY KEY (node_id, timestamp)
    );
    CREATE INDEX idx_metrics_time ON node_metrics_history(timestamp);
    ```
  - Rotate old data: keep 30 days, archive to CSV
  - Provide endpoint: `GET /api/cluster/health`

**Task 8: Cluster Management API Endpoints**
- **File:** `app/routes/cluster_admin.py` (NEW)
- **Deliverables:**
  ```python
  # Authentication: TLS mutual auth (mTLS) on all endpoints
  
  GET /api/cluster/nodes
  # Response: List all nodes with health
  {
    "nodes": [
      {
        "node_id": "AUDIO-NODE-a1b2",
        "hostname": "audio-01",
        "ip_address": "192.168.1.10",
        "role": "AUDIO-NODE",
        "status": "online",
        "health_score": 95,
        "cpu_percent": 8.5,
        "memory_percent": 45.2,
        "dsp_load_percent": 12.3,
        "latency_ms": 2.5,
        "last_seen": "2026-02-05T14:30:00Z"
      }
    ],
    "cluster_name": "Studio-A",
    "online_count": 4,
    "total_count": 5,
    "aggregate_health": 93.2
  }
  
  GET /api/cluster/health
  # Response: Aggregate health metrics
  {
    "overall_mode": "healthy",
    "aggregate_health_score": 93.2,
    "online_nodes": 4,
    "offline_nodes": 1,
    "alerts": []
  }
  
  POST /api/cluster/nodes/{id}/update
  # Trigger update on specific node
  # Response: {"status": "update_scheduled", "node_id": "...", "eta_minutes": 15}
  
  POST /api/cluster/nodes/{id}/reboot
  # Gracefully reboot a node
  # Response: {"status": "reboot_scheduled", "node_id": "...", "maintenance_window": "immediate"}
  
  GET /api/cluster/status
  # Response: Overall cluster operational state
  {
    "cluster_id": "cluster-12345",
    "cluster_name": "Studio-A",
    "primary_node": "MANAGEMENT-NODE-mgmt01",
    "standby_nodes": ["MANAGEMENT-NODE-mgmt02"],
    "mode": "healthy",
    "uptime_days": 45.3,
    "total_nodes": 5,
    "audio_nodes": 3,
    "management_nodes": 2,
    "last_update_check": "2026-02-05T14:00:00Z",
    "updates_available": 2,
    "last_failover": null,
    "failover_count": 0
  }
  
  GET /api/cluster/metrics
  # Time-series metrics
  # Response: Historical data (24h, 1h data points)
  {
    "time_range": "24h",
    "data": [
      {
        "timestamp": "2026-02-05T00:00:00Z",
        "cluster_health_avg": 92.5,
        "cpu_avg_percent": 15.2,
        "memory_avg_percent": 48.3,
        "audio_nodes_online": 3,
        "xruns_total": 0
      }
    ]
  }
  ```

**Task 22: Audio Node Metrics Export (Minimal Load)**
- **File:** Extend `app/services/performance_metrics.py`
- **Deliverables:**
  - Metrics collection happens in background thread
  - Push to management node every 60 seconds (NOT continuously)
  - Use msgpack binary protocol for efficiency:
    ```python
    metrics = {
        "node_id": "AUDIO-NODE-a1b2",
        "timestamp": int(time.time()),
        "cpu_percent": 8.5,
        "memory_percent": 45.2,
        "dsp_load_percent": 12.3,
        "xrun_count": 0,
        "load_average": [1.2, 1.5, 1.8]
    }
    msgpack_bytes = msgpack.packb(metrics)  # Efficient binary
    ```
  - Audio thread NEVER BLOCKS during metric collection
  - Use non-blocking I/O or separate thread pool
  - Fallback gracefully if management node unreachable
  - Limit payload to < 500 bytes per metrics push

---

### **PHASE 5: Package Management & Updates (Tasks 9-10, 33-35)**

Enable fleet-wide consistent Fedora package management.

**Task 9: Fedora DNF Package Manager Integration**
- **File:** `app/services/cluster/fedora_package_manager.py`
- **Deliverables:**
  - `DNFPackageManager` class
  - Methods:
    - `check_updates()` → list of available updates
    - `simulate_update()` → dry-run, show what would change
    - `apply_updates(nodes=[])` → apply updates to specific nodes
    - `get_installed_packages()` → list with versions
    - `sync_versions_across_fleet()` → verify all nodes same versions
  - Track package versions in SQLite:
    ```sql
    CREATE TABLE fleet_package_versions (
      node_id TEXT,
      package_name TEXT,
      version TEXT,
      timestamp TIMESTAMP,
      PRIMARY KEY (node_id, package_name)
    );
    ```
  - Implement staged update strategy:
    1. Check for updates on all nodes (via `/api/cluster/nodes/{id}/check-updates`)
    2. Simulate on test node
    3. If successful, stage to audio nodes (max 2 at a time)
    4. Finally, update management nodes

**Task 10: Synchronized Package Update Orchestrator**
- **File:** `app/services/cluster/update_orchestrator.py`
- **Systemd Timer:** `/etc/systemd/system/map2-fleet-update.timer`
- **Deliverables:**
  - `UpdateScheduler` class
  - Configuration in `/etc/map2/cluster.conf`:
    ```ini
    [update]
    enabled=true
    schedule_day=sunday
    schedule_time=03:00
    stagger_count=2           ; Update N nodes per hour
    notify_before_hours=24    ; Notify users 24h before
    maintenance_window=1440   ; 24 hours to complete
    ```
  - Systemd unit file:
    ```ini
    [Unit]
    Description=MAP2 Fleet Update Orchestrator
    After=network-online.target
    Wants=network-online.target
    
    [Service]
    Type=oneshot
    User=root
    ExecStart=/usr/bin/python3 -m app.services.cluster.update_orchestrator
    Environment="MAP2_CLUSTER_ENABLED=true"
    ```
  - Timer:
    ```ini
    [Unit]
    Description=MAP2 Fleet Update Timer
    
    [Timer]
    OnCalendar=sun *-*-* 03:00:00
    Persistent=true
    Accuracy=1min
    
    [Install]
    WantedBy=timers.target
    ```
  - Update workflow:
    1. Check all nodes for updates
    2. Run update pre-validation (Task 33)
    3. Display report to user
    4. If approved, begin staged updates
    5. Stagger: Update 2 nodes/hour
    6. Audio nodes first, then management nodes
    7. Validate after each update (Task 34)
    8. Generate completion report
  - Email notifications (configurable)
  - Automatic rollback if health score drops > 15% (Task 35)

**Task 33: Update Dry-Run & Validation Engine**
- **File:** `app/services/cluster/update_validator.py`
- **Deliverables:**
  - Run BEFORE update:
    1. Check disk space: `/opt/map2` has > 2GB free
    2. Verify package dependencies: `dnf check`
    3. Check for conflicts: `dnf check-conflicts`
    4. Simulate update: `dnf update --assumeno`
    5. Verify rollback snapshot possible
    6. Generate compatibility report
  - Show all checks to user
  - Block update if any check fails
  - Return validation report

**Task 34: Post-Update Health Check Service**
- **File:** `app/services/cluster/post_update_validator.py`
- **Deliverables:**
  - Run AFTER update on each node:
    1. Service startup check: all services running
    2. Audio device enumeration: verify no devices missing
    3. Plugin discovery: verify plugins still loadable
    4. MIDI connection test: send/receive test messages
    5. Network connectivity: ping management node
    6. Performance baseline: compare to pre-update metrics
  - If any check fails:
    - Take node offline (disable audio processing)
    - Trigger automatic rollback (Task 35)
    - Alert admin
  - If all checks pass:
    - Re-enable audio processing
    - Log successful update
    - Update version in registry

**Task 35: Automatic Rollback System**
- **File:** `app/services/cluster/auto_rollback.py`
- **Deliverables:**
  - Create LVM/BTRFS snapshots before major updates:
    - Snapshot `/opt/map2` → `/opt/map2.snapshot.<timestamp>`
    - Snapshot `/etc/map2` → `/etc/map2.snapshot.<timestamp>`
    - Keep 5 most recent snapshots per node
  - If post-update validator fails:
    1. Log failure details
    2. Restore snapshots: `/opt/map2` and `/etc/map2`
    3. Reboot node
    4. Verify recovery
    5. Alert admin with rollback report
  - Manual override flag: `--force-skip-rollback`
  - Keep rollback audit log (30 days)

---

### **PHASE 6: Configuration Management (Task 11)**

Centralize and synchronize configurations across fleet.

**Task 11: Configuration Distribution System (GitOps-style)**
- **File:** `app/services/cluster/config_pusher.py`
- **Repository:** `/var/lib/map2/config-repo/.git` (local git repo)
- **Deliverables:**
  - `ConfigSync` class
  - Git repo structure:
    ```
    /var/lib/map2/config-repo/
    ├── presets/          # Audio effect presets
    ├── midi-mappings/    # MIDI configuration
    ├── chains/           # Effect chains
    ├── system-config/    # System-wide settings
    └── .git/             # Git history
    ```
  - Methods:
    - `push_config(path, description)` → Commit and push to nodes
    - `pull_config_from_node(node_id)` → Fetch from remote node
    - `rollback(commit_hash)` → Revert to previous version
    - `get_diff(commit1, commit2)` → Show configuration changes
  - Push strategy:
    - Immediate push on config change
    - Broadcast to all nodes via API: `POST /api/config/apply`
    - Audio nodes poll every 2 minutes as safety fallback
  - Include diff/rollback capability with git
  - Support partial configs per node
  - Notification on config changes

---

### **PHASE 7: State Management & Failover (Tasks 12, 24)**

Implement high availability and state replication.

**Task 12: Cluster State Persistence & Replication**
- **File:** `app/services/cluster/state_replicator.py`
- **Deliverables:**
  - Primary management node = master database
  - Standby nodes = passive replicas
  - Use SQLite WAL (Write-Ahead Logging) mode:
    ```python
    conn.execute("PRAGMA journal_mode=WAL;")
    ```
  - Replication strategy:
    - Continuous write propagation via HTTP
    - Standby polls primary every 5 seconds
    - Fetch new records since last sync
    - Write to local database
  - Detect standby lag (alert if > 30 seconds behind)
  - Heartbeat check every 10 seconds
  - On primary failure detected by standby:
    - Standby assumes primary role
    - Becomes writable
    - Notifies all nodes: "New primary elected"
    - Nodes reconnect to new primary

**Task 24: Failover Detection & Automatic Takeover**
- **File:** `app/services/cluster/failover_monitor.py`
- **Deliverables:**
  - Heartbeat mechanism:
    - Primary: sends heartbeat every 10 seconds to `/api/health/heartbeat`
    - Standby: monitors heartbeats
    - Failure detection: 3 consecutive missed heartbeats = 30 second timeout
  - Failover workflow:
    1. Standby detects primary is down
    2. Promote standby to primary role
    3. Take ownership of cluster registry
    4. Publish heartbeat signal to all nodes
    5. Nodes update their `primary_node_id` config
    6. Log failover event with timestamp
  - After failover:
    - Notify admins (email, webhook)
    - Promote any secondary standbys
    - Resume normal operations
  - Recovery (when original primary comes back online):
    - Attempt to rejoin as standby
    - Sync state from new primary
    - Resume replica role

---

### **PHASE 8: Event Systems & Logging (Tasks 13, 26)**

Capture and analyze cluster-wide events.

**Task 13: Distributed Event Bus for Cross-Node Events**
- **File:** Extend `app/services/lcd_event_bus.py`
- **Deliverables:**
  - Extend existing LCD event bus to cluster-wide events
  - Event types:
    - `node_online`, `node_offline`, `node_degraded`
    - `config_applied`, `config_failed`
    - `update_started`, `update_completed`, `update_failed`
    - `failover_detected`, `failover_completed`
    - `backup_created`, `restore_started`, `restore_completed`
  - Event propagation:
    - Each node publishes to event stream
    - Management node subscribes to all
  - Aggregate into unified log in SQLite:
    ```sql
    CREATE TABLE cluster_events (
      id INTEGER PRIMARY KEY,
      timestamp TIMESTAMP,
      node_id TEXT,
      event_type TEXT,
      severity TEXT,  -- info, warning, critical
      message TEXT,
      metadata JSON
    );
    ```
  - Event retention: 7 days, then archive to CSV
  - Provide event replay for troubleshooting
  - Endpoint: `GET /api/cluster/events?last_hours=24&severity=warning`

**Task 26: Audit Logging System for All Cluster Operations**
- **File:** `app/services/cluster/audit_log.py`
- **Deliverables:**
  - Audit table:
    ```sql
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY,
      timestamp TIMESTAMP,
      user_id TEXT,              -- who initiated
      action TEXT,               -- join, leave, update, config_push, etc
      node_affected TEXT,        -- which node
      details TEXT,              -- JSON details
      result TEXT,               -- success, failure
      error_message TEXT
    );
    ```
  - Log all cluster operations:
    - Node join/leave/reboot
    - Config changes
    - Updates applied
    - Failovers
    - Backup/restore operations
    - User actions (via API)
  - Log rotation:
    - Daily rotation
    - Compress old logs (gzip)
    - Keep 90 days
  - Endpoint: `GET /api/cluster/audit?days=7&action=update`
  - Export to CSV/JSON for compliance

---

### **PHASE 9: Node Lifecycle (Task 14)**

Manage node join/leave/update workflows.

**Task 14: Node Lifecycle Manager**
- **File:** `app/services/cluster/node_lifecycle.py`
- **Deliverables:**
  - State machine implementation:
    ```
    INITIALIZING → REGISTERING → ONLINE
    ↓                              ↓
    [Node join workflow]     [Normal operation]
                                   ↓
                            MAINTENANCE/UPDATING
                                   ↓
                            OFFLINE/REMOVING
    ```
  - Workflows:
    1. **JOIN**: New node detected
       - Node advertises itself via mDNS
       - Management node receives discovery
       - Request CA certificate
       - Register in cluster registry
       - Push cluster configuration
       - Verify connectivity
       - Add to load balancer pool
    
    2. **LEAVE**: Graceful shutdown
       - Drain active audio streams
       - Persist state to management node
       - Flush metrics/logs
       - Unregister from registry
       - Remove from load balancer
    
    3. **REBOOT**: Coordinate restart
       - Notify management node
       - Persist state
       - Graceful shutdown
       - Allow 5 minute reboot window
       - Auto-rejoin after reboot
    
    4. **PROMOTE**: Convert AUDIO-NODE → MANAGEMENT-NODE
       - Pre-promotion checks
       - Install management services
       - Initialize database replica
       - Join management quorum
       - Post-promotion validation
    
    5. **DEMOTE**: Convert MANAGEMENT-NODE → AUDIO-NODE
       - Stop management services
       - Migrate state to other management node
       - Remove from quorum
       - Revert to audio-only services

---

### **PHASE 10: Disaster Recovery (Task 15)**

Implement backup and restore capabilities.

**Task 15: Automated Disaster Recovery System**
- **File:** `app/services/cluster/disaster_recovery.py`
- **Backup Location:** `/var/lib/map2/backups/`
- **Deliverables:**
  - Backup schedule: Daily at 02:00
  - Backup components:
    1. SQLite database snapshots
       - Backup: `cp map2.db map2.db.backup.<timestamp>`
       - Compress: `gzip map2.db.backup.<timestamp>`
    2. Preset library (tar.gz)
       - `tar czf presets-<timestamp>.tar.gz ~/.map2/presets/`
    3. MIDI configuration (JSON)
       - `config-<timestamp>.json`
    4. System configuration
       - `/etc/map2/` → config-etc-<timestamp>.tar.gz
  - Backup versioning:
    - Keep 30 most recent backups
    - Archive older backups to separate location
    - Automated cleanup
  - Restore workflow:
    - Restore from specific timestamp
    - Verify backup integrity before restore
    - Show diff/preview of changes
    - Atomic restore (all-or-nothing)
    - Verify consistency post-restore
  - Email alerts:
    - Success/failure of backups
    - Low storage warnings
    - Backup validation failures
  - Endpoint: `POST /api/cluster/backup/create`
  - Endpoint: `GET /api/cluster/backups` (list available)
  - Endpoint: `POST /api/cluster/restore` (with timestamp/selector)

---

### **PHASE 11: Monitoring & Analytics (Tasks 16, 29-30, 36-38, 41-42)**

Comprehensive cluster telemetry and reporting.

**Task 16: Network Topology Monitor**
- **File:** `app/services/cluster/network_topology.py`
- **Deliverables:**
  - `LatencyMapper` class
  - Ping mesh: Each node pings every other node every 60 seconds
  - Store results:
    ```sql
    CREATE TABLE network_latency_matrix (
      source_node TEXT,
      dest_node TEXT,
      latency_ms REAL,
      timestamp TIMESTAMP
    );
    ```
  - Detect network issues:
    - Packet loss > 1% → warning
    - Latency > 50ms → warning
    - Latency > 100ms → critical (could affect audio)
  - Calculate optimal audio stream routing
  - Provide topology visualization: `GET /api/cluster/topology`
  - Return heatmap data (latency matrix for Grafana)

**Task 29: Prometheus Metrics Exporter**
- **File:** Extend `app/routes/metrics.py`
- **Deliverables:**
  - Cluster-level metrics:
    ```
    map2_cluster_nodes_online{cluster="studio-a"}
    map2_cluster_health_score{cluster="studio-a"}
    map2_cluster_update_available
    map2_cluster_failover_count
    map2_cluster_uptime_seconds
    ```
  - Per-node metrics:
    ```
    map2_node_cpu_percent{node_id="AUDIO-NODE-a1b2"}
    map2_node_memory_percent{node_id="AUDIO-NODE-a1b2"}
    map2_node_dsp_load_percent{node_id="AUDIO-NODE-a1b2"}
    map2_node_xrun_count{node_id="AUDIO-NODE-a1b2"}
    map2_node_latency_ms{node_id="AUDIO-NODE-a1b2"}
    map2_node_status{node_id="AUDIO-NODE-a1b2"}
    ```
  - Audio nodes export only their own metrics
  - Management nodes aggregate and export cluster metrics

**Task 30: Grafana Dashboard Configuration**
- **File:** `/opt/map2/dashboards/cluster.json`
- **Deliverables:**
  - Import as Grafana dashboard
  - Panels:
    1. Cluster overview (node count, health status, uptime)
    2. Node heatmap (CPU/memory per node, color-coded)
    3. Audio DSP load trends (time series, per node)
    4. Xrun timeline (occurrences, severity)
    5. Update history (when, which nodes, duration)
    6. Event log table (searchable, sortable)
    7. Network latency matrix heatmap
  - Auto-refresh every 10 seconds
  - Editable/writable for advanced users
  - Include alert rules annotations

**Task 36: Multi-Node Performance Benchmark Tool**
- **File:** `app/services/cluster/performance_benchmarker.py`
- **Deliverables:**
  - Baseline benchmark suite (run on all nodes):
    1. CPU: Linpack benchmark (integer ops/sec)
    2. Memory: Memcpy bandwidth (GB/s)
    3. Disk I/O: fio sequential read/write
    4. Network: iperf3 bandwidth between nodes
    5. Audio DSP: JUCE with fixed plugin load test
    6. Latency: Measure consistency (std deviation)
  - Store baselines in database
  - Compare new results against baseline
  - Alert if node deviates > 5% from baseline
  - Generate performance report
  - Useful for detecting hardware degradation

**Task 37: Alert & Notification System**
- **File:** `app/services/cluster/alerts.py`
- **Deliverables:**
  - Define alert rules (Prometheus AlertManager compatible)
  - Notification channels:
    1. Email (SMTP configuration in /etc/map2/cluster.conf)
    2. Webhook (for Slack, Discord, etc)
    3. Syslog
    4. LCD display on control node (via LCD event bus)
  - Alert severities:
    - CRITICAL: immediate notification
    - WARNING: daily digest or on 5th occurrence
    - INFO: weekly digest
  - Example alerts:
    - "Node offline for > 5 minutes"
    - "Health score < 50"
    - "DSP load > 90%"
    - "Update failed with rollback"
    - "Backup failed 3 days in a row"
  - Configurable thresholds in /etc/map2/cluster.conf

**Task 38: Node Capacity Planning & Recommendations**
- **File:** `app/services/cluster/capacity_planner.py`
- **Deliverables:**
  - Analyze historical data (30-day rolling window):
    1. Average CPU/memory usage per node
    2. Growth trends (trending up/down)
    3. Audio DSP utilization patterns
    4. Peak usage times
  - Predictive analysis:
    - When will CPU reach 80% (if growth continues)?
    - Recommend new hardware
    - Suggest plugin redistribution if unbalanced
  - Generate quarterly reports (PDF)
  - Email to admins
  - Endpoint: `GET /api/cluster/capacity-report`

**Task 41: Performance Degradation Detection & Response**
- **File:** `app/services/cluster/degradation_detector.py`
- **Deliverables:**
  - Continuous monitoring:
    - Compare current performance vs baseline
    - Detect gradual loss (memory leaks, database bloat)
  - Alert thresholds:
    - Degradation > 10%: warning
    - Degradation > 20%: critical + auto-restart
  - Suggest remediation:
    - "Memory usage up 15%, consider plugin restart"
    - "Database size 5GB, consider optimization"
  - Auto-restart services if > 20% degradation
  - Log all degradation events

**Task 42: Cluster Statistics & Reporting Engine**
- **File:** `app/services/cluster/statistics.py`
- **Deliverables:**
  - Monthly reports (auto-email):
    1. Uptime %
    2. Average audio DSP load %
    3. Total plugin processing hours
    4. Most used presets/chains
    5. Number of preset saves/loads
    6. MIDI activity statistics
    7. Update compliance %
  - Store report data in SQLite
  - Generate PDF reports
  - Email to cluster admins
  - Dashboard endpoint for viewing stats

---

### **PHASE 12: User Interfaces (Tasks 17-20)**

Provide management UIs for operators.

**Task 17: Web-Based Cluster Management Dashboard**
- **File:** `web/src/pages/ClusterAdmin.tsx`
- **React Component:** TypeScript + MUI
- **Deliverables:**
  - Real-time node list with health indicators
  - Cluster topology visualization (node connections, latency)
  - Update scheduler UI (schedule updates, see history)
  - Config distribution controls (push/pull configs)
  - Disaster recovery buttons (backup/restore)
  - Event log viewer (searchable, time-range filter)
  - Connect to `/api/cluster/*` endpoints
  - Auto-refresh every 10 seconds
  - Show alerts/warnings prominently
  - Responsive design (works on tablets)

**Task 18: TUI Cluster Management Screen**
- **File:** `tui/screens/cluster_admin_screen.py`
- **Framework:** Textual
- **Deliverables:**
  - Terminal-based cluster management UI
  - Nodes table (sortable, filterable)
  - Real-time metric display (CPU, memory, DSP)
  - Update controls
  - Config viewer/editor
  - Event log viewer
  - Keyboard shortcuts (j/k for up/down, s for sort, etc)
  - Designed for SSH terminal access

**Task 19: Backup & Restore Wizard UI**
- **Files:** `web/src/components/BackupRestoreWizard.tsx`, `tui/components/backup_restore.py`
- **Deliverables:**
  - Multi-step wizard:
    1. Select backup date/time
    2. Choose what to restore (presets/configs/full)
    3. Preview changes (diff view)
    4. Confirm execution
    5. Show progress bar
    6. Verify integrity
  - Show warnings about potential data loss
  - Undo capability (if restore fails)

**Task 20: Node Onboarding Portal**
- **File:** `web/src/pages/NodeOnboarding.tsx`
- **Deliverables:**
  - Multi-step wizard:
    1. Detect node on network (mDNS discovery, QR code, or manual IP entry)
    2. Verify node identity (show hardware specs)
    3. Choose deployment role (AUDIO-NODE, MANAGEMENT-NODE)
    4. Configure audio devices (if applicable)
    5. Set MIDI mappings
    6. Assign to cluster
    7. Verify connectivity
  - Auto-generates CA certificate
  - Adds to registry
  - Applies initial config
  - Support simultaneous onboarding of 3-5 nodes
  - Progress tracking

---

### **PHASE 13: System Integration (Tasks 21, 27-28, 40, 43, 48-49)**

System-level integration with Fedora.

**Task 21: Fedora Systemd Unit Files & Timers**
- **Files:** `/etc/systemd/system/map2-*.service`, `/etc/systemd/system/map2-*.timer`
- **Deliverables:**
  - Unit file: `map2-cluster-manager.service`
    - Runs: ClusterManager on management nodes only
    - Depends on: map2-audio.service, network-online.target
    - Type=notify (systemd type notification)
  - Unit file: `map2-fleet-update.timer`
    - Scheduled: Sunday 03:00 (configurable)
    - OnCalendar=sun *-*-* 03:00:00
  - Unit file: `map2-health-sync.timer`
    - Frequency: Every 30 seconds
    - OnBootSec=5 min (wait 5 min after boot)
  - Unit file: `map2-failover-monitor.timer`
    - Frequency: Every 10 seconds (standby nodes only)
  - Each unit includes:
    - Pre/post scripts for validation
    - Success/failure handlers
    - Proper dependencies
    - Logging directives

**Task 27: Installation & Configuration Scripts**
- **Files:** 
  - `/opt/map2/scripts/install-cluster.sh` (base infrastructure)
  - `/opt/map2/scripts/install-management-node.sh` (primary setup)
  - `/opt/map2/scripts/install-audio-node.sh` (minimal setup)
  - `/opt/map2/scripts/join-cluster.sh` (new node joining)
- **Language:** POSIX shell (bash-compatible)
- **Characteristics:**
  - Idempotent (safe to run multiple times)
  - Comprehensive error handling
  - Detailed logging (stdout + syslog)
  - Support for --dry-run mode
  - Automatic rollback on failure
- **Deliverables:**
  - `install-cluster.sh`: Install Fedora deps, create /etc/map2, set up CA
  - `install-management-node.sh`: Set DB, designate as primary/standby, init registry
  - `install-audio-node.sh`: Minimal setup, metrics exporter, ZTP bootstrap
  - `join-cluster.sh`: For new nodes, request CA cert, register, pull config

**Task 28: Cluster Configuration File Schema**
- **File:** `/etc/map2/cluster.conf` (INI format)
- **Deliverables:**
  ```ini
  [general]
  cluster_name=Studio-A
  cluster_id=cluster-12345
  primary_node_ip=192.168.1.100
  primary_node_id=MANAGEMENT-NODE-mgmt01
  standby_nodes=MANAGEMENT-NODE-mgmt02,MANAGEMENT-NODE-mgmt03
  
  [security]
  tls_enabled=true
  cert_path=/etc/map2/ssl
  rbac_enabled=true
  
  [update]
  enabled=true
  schedule_day=sunday
  schedule_time=03:00
  stagger_count=2
  maintenance_window_minutes=1440
  notify_before_hours=24
  auto_rollback_enabled=true
  
  [monitoring]
  health_check_interval_seconds=30
  metrics_push_interval_seconds=60
  latency_check_interval_seconds=60
  
  [network]
  discovery_enabled=true
  multicast_interface=eth0
  discovery_timeout_seconds=5
  
  [backup]
  enabled=true
  schedule_time=02:00
  retention_days=30
  
  [notifications]
  email_enabled=true
  smtp_server=smtp.example.com
  smtp_from=cluster@example.com
  webhook_enabled=false
  webhook_url=
  ```
- **Validation:** Schema validation on load, defaults for missing sections

**Task 40: SSH Key Management & Certificate Authority Integration**
- **File:** `app/services/cluster/ssh_key_manager.py`
- **Deliverables:**
  - Generate SSH key pairs on first boot
  - Store keys in `/etc/map2/ssh/`
  - Per-node SSH keys: `id_rsa.<node-id>`, `id_rsa.<node-id>.pub`
  - Implement OpenSSH certificates (not just public keys):
    - CA signs each node's public key
    - Provides `id_rsa-cert.pub` with extended validity
    - Enables automatic key rotation without manual updates
  - Key rotation every 90 days (automatic)
  - Manual key regeneration on compromise
  - Centralized SSH known_hosts management
  - Endpoint: `POST /api/ca/regenerate-ssh-keys`

**Task 43: Service Auto-Restart on Failures**
- **File:** `app/services/cluster/auto_restart_manager.py`
- **Deliverables:**
  - Define restart policies per service:
    - JUCE: Restart immediately on failure
    - Plugin Loader: Restart after 5 minute delay
    - LCD Manager: Restart after 10 second delay
    - Metrics Exporter: Restart after 30 seconds
  - Use systemd directives:
    ```ini
    [Service]
    Restart=always
    RestartSec=5
    StartLimitInterval=3600
    StartLimitBurst=5
    ```
  - Max 5 restarts per hour (then manual intervention required)
  - Log all restarts (timestamp, reason, result)
  - Alert admin after 3 consecutive restarts in 1 hour

**Task 48: Cluster Initialization Wizard**
- **File:** `tui/cluster_init_wizard.py`
- **Framework:** Textual
- **Deliverables:**
  - Interactive TUI wizard:
    1. Detect existing nodes on network (mDNS discovery)
    2. Choose cluster name
    3. Designate primary management node
    4. Configure update schedule
    5. Enable features (backups, monitoring, alerts, etc)
    6. Set network parameters (discovery interface)
    7. Review configuration
    8. Initialize cluster (create /etc/map2/cluster.conf)
  - Support 5-15 minute initial setup
  - Validation at each step
  - Rollback capability if initialization fails

**Task 49: Time Synchronization Across Cluster**
- **File:** `app/services/cluster/time_sync.py`
- **Deliverables:**
  - Ensure all nodes use NTP
  - Primary management node runs chrony NTP server
  - All other nodes configured as NTP clients
  - Configuration:
    - Audio nodes: Point to primary management node first, fallback to public NTP
    - Standby nodes: Same
  - Verify time sync variance < 100ms
  - Alert if variance > 500ms (critical for audio timing)
  - Automatic clock adjustment (not slew, to maintain audio quality)
  - Test time sync: `ntpq -p` from each node

---

### **PHASE 14: Advanced Features (Tasks 36, 39, 44-47)**

Optional advanced capabilities.

**Task 39: Load Balancer for Audio Processing Distribution**
- **File:** `app/services/cluster/audio_load_balancer.py`
- **Deliverables:**
  - `AudioLoadBalancer` class
  - Distribute audio chains across available AUDIO-NODEs
  - Routing criteria:
    1. Current DSP load % (prefer lowest)
    2. Available CPU cores (prefer more)
    3. Available memory (prefer more)
    4. Network latency to Control Node (prefer lower)
  - Algorithm: Greedy (route to least-loaded node)
  - Example routing decision:
    ```
    Node-1: DSP=45%, cores=8, latency=2ms → score=45
    Node-2: DSP=30%, cores=4, latency=1ms → score=30 ← SELECT
    Node-3: DSP=60%, cores=8, latency=3ms → score=60
    ```
  - UI controls to manually override routing
  - Automatic rebalancing on node join/leave

**Task 44: Development & Testing Cluster Simulator**
- **File:** `scripts/cluster_simulator.py`
- **Language:** Python asyncio
- **Deliverables:**
  - Simulate N virtual nodes locally
  - Simulated characteristics:
    - Audio DSP load changes (sine wave pattern)
    - CPU/memory variations
    - Network latency (with jitter)
    - Random node failures/recoveries
    - Simulated updates
    - Simulated metrics changes
  - Useful for:
    - Testing cluster management without real hardware
    - Load testing health aggregator
    - Testing failover logic
    - Recording behavior for debugging
  - Configurable: `cluster_simulator.py --nodes 5 --runtime 3600`

**Task 45: Integration Tests for Cluster Management**
- **File:** `tests/test_cluster_management.py`
- **Framework:** pytest + pytest-asyncio
- **Deliverables:**
  - Test suites (using cluster_simulator.py):
    1. Node discovery (verify mDNS works, nodes found)
    2. Registry sync (add/remove nodes, verify DB updates)
    3. Health aggregation (verify scores calculated correctly)
    4. Config distribution (verify push/pull mechanics)
    5. Update orchestration (verify staging sequence)
    6. Failover (verify standby takeover, state handoff)
    7. Rollback (verify snapshot restore)
  - Coverage: > 80% of cluster management code
  - Run: `pytest tests/test_cluster_management.py -v`

**Task 46: Custom Python Package for Cluster Module**
- **File:** `app/services/cluster/setup.py`
- **Change:** `pyproject.toml`
- **Deliverables:**
  - Package cluster management as optional component
  - Installation: `pip install map2-audio[cluster]`
  - Without cluster: `pip install map2-audio`
  - Add to pyproject.toml:
    ```toml
    [project.optional-dependencies]
    cluster = [
      "cryptography>=42.0.0",
      "msgpack>=1.0.0",
      "psutil>=6.0.0",
    ]
    ```
  - Import guards: Check CLUSTER_ENABLED flag before importing
  - Allows lightweight audio-only deployments

**Task 47: Feature Flags for Gradual Rollout**
- **File:** `app/services/cluster/feature_flags.py`
- **Deliverables:**
  - Define flags (stored in SQLite):
    ```
    CLUSTER_ENABLED (false by default)
    UPDATE_ORCHESTRATION
    CONFIG_SYNC
    HEALTH_AGGREGATION
    FAILOVER_ENABLED
    DISASTER_RECOVERY_ENABLED
    PERFORMANCE_BENCHMARKING
    ```
  - Can be toggled per cluster or per node
  - Use Python decorators to gate features:
    ```python
    @require_feature_enabled("UPDATE_ORCHESTRATION")
    async def orchestrate_updates():
        ...
    ```
  - Allows gradual enablement as testing progresses
  - Configuration: `/etc/map2/features.conf`

---

### **PHASE 15: Documentation (Tasks 32)**

Complete documentation suite.

**Task 32: Documentation for Cluster Management**
- **Files:**
  1. `CLUSTER_SETUP_GUIDE.md` - Step-by-step for 3-10 node setup
  2. `CLUSTER_OPERATIONS.md` - Daily operations, monitoring, troubleshooting
  3. `CLUSTER_API_REFERENCE.md` - All `/api/cluster/*` endpoints with examples
  4. `CLUSTER_ARCHITECTURE.md` - Design decisions, failover algorithm
  5. `TROUBLESHOOTING_CLUSTER.md` - Common issues + solutions
  6. `CLUSTER_QUICKSTART.md` - 5-node setup in 15 minutes
- **Deliverables:**
  - Screenshots/diagrams for complex workflows
  - Code examples for common tasks
  - Troubleshooting flowcharts
  - Configuration templates
  - Video tutorial links (5-10 minutes each)

---

### **PHASE 16: Final Integration (Task 50)**

Complete integration and validation.

**Task 50: Final Integration & Documentation Pass**
- **Final Checks:**
  1. Verify all 49 subsystems integrated correctly
  2. Validate audio node CPU overhead < 1%
  3. Document all endpoints with OpenAPI/Swagger
  4. Create QUICKSTART guide for deploying 5-node cluster
  5. Record video tutorial (5 min walkthrough)
  6. Prepare Fedora RPM package with all units
  7. Test full cluster lifecycle:
     - Setup → node join → updates → failover → recovery
  8. Performance testing with 10+ nodes
  9. Load testing with max concurrent connections
  10. Security audit (TLS, auth, encryption)

---

## 🚀 Execution Strategy

### For AI Agents:

1. **Start with Tasks 1-3** (Foundation) ✅ DONE
2. **Continue with Tasks 4-8** (Discovery & Registry)
3. **Proceed with Tasks 9-12** (Updates & HA)
4. **Implement Tasks 13-15** (Events & Recovery)
5. **Build Tasks 16-20** (Monitoring & UIs)
6. **Integrate Tasks 21-32** (System & Documentation)
7. **Add Tasks 33-50** (Advanced & Optimization)

### Key Success Metrics:

- ✅ Audio node CPU overhead: < 1%
- ✅ Failover time: < 30 seconds
- ✅ Config sync latency: < 5 seconds
- ✅ Health update frequency: 30 seconds
- ✅ Update duration: < 15 minutes per node
- ✅ Rollback success rate: 100%
- ✅ Test coverage: > 80%

---

## 📊 Architecture Decisions Made

1. **Hybrid Failover Model** - Primary + Standby (not full Raft)
2. **Push + Pull Config** - Immediate push + 2-min fallback pull
3. **Staged Updates** - Test → Audio → Management sequence
4. **Minimal Audio Node Load** - < 1% CPU overhead via async/60-sec push
5. **Fedora Native** - systemd, DNF, /etc/map2 conventions
6. **SQLite Primary DB** - Simple, embedded, upgrade path to PostgreSQL
7. **mTLS + SSH Certs** - Modern security without Kerberos complexity
8. **Event-driven** - Pub/sub for state changes, WebSocket for UI
9. **Optional Module** - Cluster features disabled by default, pip installable
10. **Backward Compatible** - Single-node deployments work unchanged

---

## 📦 Deliverables Summary

| Task # | Component | Files | Status |
|--------|-----------|-------|--------|
| 1 | Cluster Foundation | `app/services/cluster/__init__.py` | ✅ |
| 2 | Node Identity | `app/services/cluster/enhanced_node_identity.py` | ✅ |
| 3 | Zero-Touch Provisioning | `app/services/cluster/ztp.py` | 📝 |
| 4-50 | [See detailed list above] | 50+ files | ⏳ |

**Total Implementation Effort:** 40-50 hours (with proper scoping per task)

---

*This document is the complete specification for implementing enterprise-grade cluster management for MAP2 Audio Platform.*

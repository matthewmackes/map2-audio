# MAP2 Audio Platform - Cluster Update & Version Management System

## Overview

The MAP2 Audio Platform includes a comprehensive cluster-wide update orchestration system designed to maintain zero-downtime during software updates across distributed audio nodes. The system provides automated rolling updates, snapshot-based rollback, version drift detection, and golden manifest enforcement.

---

## Architecture Components

### 1. Update Orchestrator
**Location**: `app/services/cluster/update_orchestrator.py`

The central coordinator for cluster-wide updates.

**Key Features**:
- **Rolling Updates**: Sequential node updates with configurable batch sizes
- **Canary Deployments**: Test updates on a subset of nodes before full rollout
- **Zero-Downtime**: Maintains cluster availability during updates
- **Progress Tracking**: Real-time status per node and stage
- **Failure Handling**: Automatic detection and response to failed updates

**Update Workflow**:
```
1. Pre-validation
   ├─ Check cluster health
   ├─ Verify update prerequisites
   └─ Create LVM snapshots

2. Rolling execution
   ├─ Batch 1: Update first batch of nodes
   │   ├─ Download packages
   │   ├─ Install packages
   │   ├─ Restart services
   │   └─ Post-validation
   ├─ Batch 2: Update next batch
   └─ Continue until all nodes updated

3. Post-validation
   ├─ Verify all nodes healthy
   ├─ Check service functionality
   └─ Commit or rollback decision
```

**API Endpoints**:
- `POST /api/cluster/update/trigger` - Initiate cluster update
- `GET /api/cluster/update/status` - Get current update status
- `POST /api/cluster/update/pause` - Pause ongoing update
- `POST /api/cluster/update/resume` - Resume paused update
- `POST /api/cluster/update/cancel` - Cancel and rollback update

---

### 2. Package Manager Integration
**Location**: `app/services/cluster/fedora_package_manager.py`

Fedora DNF/RPM integration for package operations.

**Capabilities**:
- **Package Queries**: List installed, available, and updatable packages
- **Update Operations**: Download, install, and verify packages
- **Transaction Safety**: Atomic operations with rollback on failure
- **Dependency Resolution**: Automatic handling of package dependencies
- **Repository Management**: Support for multiple package repositories

**Key Methods**:
```python
class FedoraPackageManager:
    def check_updates() -> List[PackageUpdate]
        # Lists available updates with metadata
    
    def apply_updates(packages: List[str]) -> bool
        # Executes package installation
    
    def download_packages(packages: List[str]) -> bool
        # Pre-downloads packages for faster installation
    
    def verify_installation(packages: List[str]) -> bool
        # Confirms successful package installation
```

---

### 3. Update Validator
**Location**: `app/services/cluster/update_validator.py`

Pre and post-update validation system.

**Validation Stages**:

**Pre-Update Checks**:
- ✓ Node connectivity (SSH + API reachability)
- ✓ Cluster health above threshold (>70%)
- ✓ Sufficient disk space for updates
- ✓ No ongoing audio sessions (or force flag)
- ✓ Backup/snapshot existence
- ✓ Network stability (latency < 100ms, loss < 1%)

**Post-Update Checks**:
- ✓ All services running and healthy
- ✓ Audio path functional (JACK, ALSA, PipeWire)
- ✓ API endpoints responding
- ✓ Metrics collection active
- ✓ No system errors in logs
- ✓ Version matches expected

**Integration Points**:
```python
# Used by orchestrator before each batch
pre_ok, pre_msg = validator.validate_pre_update(node_id)

# Used after each node update
post_ok, post_msg = validator.validate_post_update(node_id, expected_version)
```

---

### 4. Rollback System
**Location**: `app/services/cluster/update_rollback.py`

Automatic and manual rollback capabilities.

**Rollback Triggers**:
- **Automatic**:
  - Post-validation failure
  - Service crash during update
  - Health score drops below threshold
  - Timeout during update stage
  
- **Manual**:
  - User-initiated via UI or API
  - Scheduled rollback window

**Rollback Methods**:

1. **LVM Snapshot Rollback** (Preferred):
   ```bash
   lvconvert --merge /dev/vg0/snapshot_pre_update
   reboot
   ```
   - Instant system-level rollback
   - Preserves exact pre-update state
   - Requires reboot

2. **Package Downgrade**:
   ```bash
   dnf downgrade package-1.0-old
   systemctl restart services
   ```
   - No reboot required
   - Faster recovery
   - May miss system-level changes

3. **Restore from Backup**:
   - Full system restore from tar/rsync backup
   - Slowest but most comprehensive
   - Last resort option

**Rollback Decision Tree**:
```
Update Failed?
├─ Yes → Check rollback mode
│   ├─ Automatic + LVM available → Snapshot rollback
│   ├─ Automatic + No LVM → Package downgrade
│   └─ Manual → Wait for user decision
└─ No → Commit and cleanup snapshots
```

---

### 5. Version Manifest Manager
**Location**: `app/services/cluster/version_manifest.py`

Golden package set management and drift detection.

**Purpose**: Ensures all cluster nodes maintain identical software versions.

**Features**:

**Manifest Capture**:
```python
# Capture current state from a "golden" node
manifest = version_manifest.capture_manifest(source_node_id="node-01")

# Manifest structure:
{
  "timestamp": "2026-02-07T10:30:00Z",
  "source_node": "node-01",
  "package_count": 2847,
  "packages": {
    "kernel": "6.6.14-1.fc40",
    "pipewire": "1.0.3-1.fc40",
    "jack2": "1.9.22-2.fc40",
    ...
  }
}
```

**Drift Detection**:
```python
# Compare node against manifest
diff = version_manifest.compare_node("node-02")

# Returns:
{
  "added": ["debug-tools"],           # Packages on node but not in manifest
  "removed": ["required-package"],    # Packages in manifest but missing
  "mismatched": {
    "pipewire": {
      "expected": "1.0.3-1.fc40",
      "actual": "1.0.2-1.fc40"
    }
  }
}
```

**Drift Correction**:
```python
# Enforce manifest on drifted node
result = version_manifest.enforce_manifest(
    node_id="node-02",
    dry_run=False  # Set to True for preview
)

# Installs missing packages and corrects versions
```

**Use Cases**:
- New node onboarding (bring to cluster standard)
- Drift remediation after manual changes
- Compliance verification
- Update validation

---

### 6. Update UI Components

#### TUI (Terminal User Interface)

**System Update Screen**
**Location**: `tui/screens/system_update_screen.py`

Terminal-based update control panel:

```
┌─────────────────────────────────────────────────┐
│ 🔄 System Updates                               │
├─────────────────────────────────────────────────┤
│ [Update This Node] [Update All] [Check Updates]│
│ [Capture Manifest] [Check Drift] [Enforce]     │
│                                                 │
│ Target Node: [node-02____________]              │
├─────────────────────────────────────────────────┤
│ Status: Update triggered                        │
├─────────────────────────────────────────────────┤
│ LOG:                                            │
│ [12:30:45] Update started for node-02          │
│ [12:31:12] Download complete                    │
│ [12:31:45] Installation in progress...         │
└─────────────────────────────────────────────────┘
```

**Update Progress Screen**
**Location**: `tui/screens/update_progress_screen.py`

Real-time update monitoring:

```
┌──────────────────────────────────────────────────────┐
│ 🔄 Cluster Update Progress Monitor                   │
│ Update ID: update-2026-02-07-123045                  │
│ Auto-refresh: ON | Press 'p' to pause                │
├──────────────────────────────────────────────────────┤
│ Total: 5 | Completed: 2 | Failed: 0 | Progress: 40% │
├──────────────────────────────────────────────────────┤
│ ⏳ Node: audio-node-01 - RUNNING                     │
│ Current Stage: Install                               │
│ Overall Progress: 65%                                │
│ ──────────────────────────────────────────────────   │
│   ✅ Validation    [████████████████████] 100%       │
│   ✅ Download      [████████████████████] 100%       │
│   ⏳ Install       [████████████░░░░░░░░]  65%       │
│   ⏸️ Restart       [░░░░░░░░░░░░░░░░░░░░]   0%       │
│   ⏸️ Verify        [░░░░░░░░░░░░░░░░░░░░]   0%       │
├──────────────────────────────────────────────────────┤
│ [🔄 Refresh] [⏸️ Pause] [↩️ Rollback] [❌ Close]    │
└──────────────────────────────────────────────────────┘
```

**Keyboard Shortcuts**:
- `u` - Open Updates screen
- `p` - View update progress
- `r` - Refresh status
- `b` - Trigger rollback

#### Web Interface

**Updates Tab**
**Location**: `web/src/app/components/ClusterDashboard/UpdatesTab.tsx`

Modern web interface for update operations:

**Features**:
- One-click cluster-wide updates
- Per-node update triggers
- Manifest operations (capture, drift check, enforce)
- Real-time status display
- JSON result preview

**Update Progress Viewer**
**Location**: `web/src/app/components/UpdateProgressViewer.tsx`

Rich web-based progress monitoring:

**Features**:
- Dashboard statistics (total, completed, failed, overall %)
- Per-node progress cards with gradient borders
- Horizontal progress bars for each stage
- Live auto-refresh (5-second interval)
- Expandable event log with timestamps
- Rollback controls with confirmation
- Responsive design

**Visual Elements**:
- Color-coded status: 🟢 Success | 🔵 Running | 🔴 Failed | ⏸️ Idle
- Stage icons: ✅ Completed | ⏳ Running | ❌ Failed | ⏸️ Pending
- Gradient borders based on node status
- Smooth progress animations

---

### 7. Onboarding Wizard

Guided cluster setup for new deployments.

#### TUI Wizard
**Location**: `tui/screens/onboarding_wizard_screen.py`

**5-Step Setup Process**:

**Step 1: Deployment Mode**
```
┌────────────────────────────────────────────────┐
│ ## Step 1: Choose Deployment Mode             │
│                                                │
│ Select deployment type:                       │
│                                                │
│ ( ) 🖥️  ALL-IN-ONE                            │
│     Single node with all services             │
│     (Development/Testing)                     │
│                                                │
│ (•) 🌐 DISTRIBUTED                            │
│     Multiple nodes, distributed services      │
│     (Production)                              │
│                                                │
│ ( ) ☁️  CLOUD                                 │
│     Cloud-native with auto-scaling            │
│     (Enterprise)                              │
│                                                │
│ 📖 Mode Details:                              │
│ • ALL-IN-ONE: Fastest setup, limited scale   │
│ • DISTRIBUTED: HA, load balancing, 2+ nodes  │
│ • CLOUD: Auto-scaling, multi-region          │
└────────────────────────────────────────────────┘
```

**Step 2: Node Discovery**
```
┌────────────────────────────────────────────────┐
│ ## Step 2: Node Discovery                     │
│                                                │
│ [🔍 Auto-Discover] [➕ Add Manually] [🔄]     │
│                                                │
│ ✅ Found 3 node(s):                           │
│   • audio-node-01 - 192.168.1.101 [master]   │
│   • audio-node-02 - 192.168.1.102 [worker]   │
│   • audio-node-03 - 192.168.1.103 [worker]   │
│                                                │
│ 📖 Discovery Methods:                         │
│ • Auto-Discovery: mDNS/DNS-SD network scan    │
│ • Manual Add: Specify IP and credentials      │
└────────────────────────────────────────────────┘
```

**Step 3: Network Configuration**
```
┌────────────────────────────────────────────────┐
│ ## Step 3: Network Configuration              │
│                                                │
│ Cluster Name:     [my-audio-cluster_______]   │
│ Management IP:    [192.168.1.100_________]    │
│ Network Interface: [eth0 ▼]                   │
│ API Port:         [8080___________________]   │
│                                                │
│ [✓] Enable mDNS discovery                     │
│ [ ] Enable TLS/SSL                            │
│                                                │
│ 📖 Configuration Tips:                        │
│ • Cluster Name: Unique identifier             │
│ • Management IP: Primary control node IP      │
│ • mDNS: Automatic discovery (multicast)       │
│ • TLS: Encrypted communication (certs req.)   │
└────────────────────────────────────────────────┘
```

**Step 4: Certificate Setup**
```
┌────────────────────────────────────────────────┐
│ ## Step 4: Certificate Setup                  │
│                                                │
│ (•) 🔧 Auto-generate self-signed certs        │
│ ( ) 📜 Use existing certificate authority     │
│ ( ) ⏭️  Skip (insecure - not recommended)     │
│                                                │
│ 📖 Certificate Options:                       │
│ • Self-signed: Quick, browser warnings        │
│ • Existing CA: Production-ready, needs files  │
│ • Skip: No encryption, testing only           │
└────────────────────────────────────────────────┘
```

**Step 5: Review & Confirm**
```
┌────────────────────────────────────────────────┐
│ ## Step 5: Review Configuration               │
│                                                │
│ 📋 Configuration Summary:                     │
│                                                │
│ 🌐 Deployment Mode: distributed               │
│ 🖥️  Cluster Name: my-audio-cluster            │
│ 📍 Management IP: 192.168.1.100               │
│ 🔌 Network Interface: eth0                    │
│ 🔢 API Port: 8080                             │
│ 🔍 mDNS Enabled: Yes                          │
│ 🔒 TLS Enabled: No                            │
│ 📜 Certificate Mode: self-signed              │
│                                                │
│ 🖥️  Discovered Nodes (3):                     │
│   1. audio-node-01 - 192.168.1.101           │
│   2. audio-node-02 - 192.168.1.102           │
│   3. audio-node-03 - 192.168.1.103           │
│                                                │
│ ⚠️  Review carefully before proceeding!       │
│                                                │
│ [⬅️ Back] [✅ Finish Setup] [❌ Cancel]       │
└────────────────────────────────────────────────┘
```

#### Web Wizard
**Location**: `web/src/app/components/OnboardingWizard.tsx`

**Modern Visual Design**:
- Step indicator with icons and checkmarks
- Gradient backgrounds and borders
- Responsive grid layouts
- Real-time validation feedback
- Modal overlay integration
- Color-coded states (blue=current, green=completed, gray=pending)

**Same 5-step flow** with enhanced visual design:
- Larger, more readable inputs
- Help text with icon badges
- Smooth transitions between steps
- Error messages with alert icons
- Confirmation dialogs

---

## API Reference

### Update Endpoints

```http
POST /api/cluster/update/trigger
Content-Type: application/json

{
  "target_version": "latest",
  "dry_run": false,
  "batch_size": 2,
  "canary": true
}

Response:
{
  "status": "ok",
  "update_id": "update-2026-02-07-123045",
  "nodes_affected": 5,
  "estimated_duration": 600
}
```

```http
GET /api/cluster/update/status

Response:
{
  "update_id": "update-2026-02-07-123045",
  "status": "running",
  "progress": 40,
  "nodes": [
    {
      "node_id": "audio-node-01",
      "status": "running",
      "progress_percent": 65,
      "current_stage": "Install",
      "stages": [
        {"name": "Validation", "status": "completed", "progress": 100},
        {"name": "Download", "status": "completed", "progress": 100},
        {"name": "Install", "status": "running", "progress": 65},
        {"name": "Restart", "status": "pending", "progress": 0},
        {"name": "Verify", "status": "pending", "progress": 0}
      ]
    }
  ]
}
```

```http
POST /api/cluster/update/rollback

{
  "reason": "User-triggered rollback",
  "force": false
}

Response:
{
  "status": "ok",
  "message": "Rollback initiated",
  "nodes_affected": 3
}
```

### Manifest Endpoints

```http
GET /api/cluster/update/manifest

Response:
{
  "status": "ok",
  "manifest": {
    "timestamp": "2026-02-07T10:30:00Z",
    "source_node": "node-01",
    "package_count": 2847,
    "packages": {...}
  }
}
```

```http
POST /api/cluster/update/manifest/capture

{
  "source_node_id": "audio-node-01"
}

Response:
{
  "status": "ok",
  "manifest": {...}
}
```

```http
GET /api/cluster/update/manifest/drift

Response:
{
  "status": "ok",
  "drift": {
    "node-01": {"added": [], "removed": [], "mismatched": {}},
    "node-02": {
      "added": ["debug-tools"],
      "removed": [],
      "mismatched": {
        "pipewire": {"expected": "1.0.3", "actual": "1.0.2"}
      }
    }
  }
}
```

```http
POST /api/cluster/update/manifest/enforce

{
  "node_id": "node-02",
  "dry_run": false
}

Response:
{
  "status": "ok",
  "result": {
    "changes": ["pipewire-1.0.3"],
    "stdout": "...",
    "dry_run": false
  }
}
```

### Setup Endpoint

```http
POST /api/cluster/setup

{
  "deployment_mode": "distributed",
  "cluster_name": "my-audio-cluster",
  "management_ip": "192.168.1.100",
  "network_interface": "eth0",
  "api_port": 8080,
  "enable_mdns": true,
  "enable_tls": false,
  "cert_mode": "self-signed",
  "discovered_nodes": [
    {
      "node_id": "audio-node-01",
      "hostname": "audio-node-01",
      "ip_address": "192.168.1.101",
      "role": "master"
    }
  ]
}

Response:
{
  "status": "ok",
  "message": "Cluster setup complete",
  "mode": "distributed",
  "nodes_registered": 3
}
```

---

## Update Workflows

### Rolling Update Workflow

```
Administrator triggers update via UI/API
                ↓
Orchestrator validates cluster health
                ↓
Create LVM snapshots on all nodes
                ↓
┌─────────────────────────────────────┐
│ Batch 1 (nodes 1-2)                 │
│   Download packages → Install →     │
│   Restart services → Validate       │
└─────────────────────────────────────┘
                ↓
          Batch successful?
           ↙         ↘
        Yes          No → Rollback all nodes
           ↓
┌─────────────────────────────────────┐
│ Batch 2 (nodes 3-4)                 │
│   Download packages → Install →     │
│   Restart services → Validate       │
└─────────────────────────────────────┘
           ↓
    Continue for all batches
           ↓
    All nodes updated successfully
           ↓
    Commit changes, cleanup snapshots
```

### Drift Detection & Correction Workflow

```
Periodic drift check (cron/scheduler)
                ↓
Compare each node to manifest
                ↓
      Drift detected?
           ↙         ↘
        Yes          No → Continue monitoring
           ↓
    Generate drift report
    (added, removed, mismatched)
           ↓
    Alert administrators
           ↓
    Manual/Automatic correction
           ↓
    Enforce manifest on drifted nodes
           ↓
    Verify correction
           ↓
    Update compliance logs
```

### New Node Onboarding Workflow

```
New node joins cluster
        ↓
Run onboarding wizard
        ↓
1. Select deployment mode
2. Discover/register node
3. Configure network
4. Setup certificates
5. Review and confirm
        ↓
Node registered in cluster
        ↓
Capture or apply manifest
        ↓
Install golden package set
        ↓
Validate node health
        ↓
Node ready for workload
```

---

## Best Practices

### Update Planning

1. **Pre-Update Checklist**:
   - [ ] Review changelog for breaking changes
   - [ ] Test update in staging environment
   - [ ] Verify backup/snapshot availability
   - [ ] Schedule maintenance window
   - [ ] Notify users of potential disruption
   - [ ] Prepare rollback plan

2. **Update Execution**:
   - Start with canary deployment (1-2 nodes)
   - Monitor health metrics closely
   - Use smaller batch sizes for critical updates
   - Keep rollback window open (don't cleanup snapshots immediately)
   - Document any issues encountered

3. **Post-Update Verification**:
   - Verify all services running
   - Check audio path functionality
   - Review system logs for errors
   - Run automated test suite
   - Monitor performance metrics
   - Commit changes after stability confirmed

### Manifest Management

1. **Golden Node Selection**:
   - Choose stable, well-configured node
   - Verify all required packages installed
   - Ensure no drift or custom packages
   - Document any intentional deviations

2. **Drift Monitoring**:
   - Schedule daily drift checks
   - Alert on critical package mismatches
   - Allow grace period for planned changes
   - Auto-enforce for critical security packages

3. **New Node Onboarding**:
   - Always enforce manifest on new nodes
   - Use dry-run first to preview changes
   - Verify node health after enforcement
   - Document any required exceptions

### Rollback Strategy

1. **When to Rollback**:
   - Any service failures during update
   - Health score drops below 70%
   - Audio path becomes non-functional
   - Critical errors in logs
   - Update timeout exceeded

2. **Rollback Methods by Urgency**:
   - **Critical** (immediate): LVM snapshot rollback
   - **High** (< 5 min): Package downgrade
   - **Medium** (< 30 min): Restore from backup

3. **Post-Rollback**:
   - Document root cause
   - Test update in staging
   - Plan remediation strategy
   - Schedule retry with fixes

---

## Monitoring & Metrics

### Key Metrics

1. **Update Success Rate**: % of updates completed successfully
2. **Average Update Duration**: Time per node update
3. **Rollback Frequency**: Number of rollbacks per update attempt
4. **Drift Detection Rate**: Nodes with version drift
5. **Manifest Compliance**: % of nodes matching manifest

### Alerts

- Update failed on any node
- Rollback triggered
- Health score drops below threshold
- Drift detected on critical packages
- Update timeout exceeded
- Snapshot creation failed

### Logging

All update operations logged with:
- Timestamp
- Node ID
- Operation type (update/rollback/enforce)
- Success/failure status
- Duration
- Error messages (if any)
- User/trigger source

---

## Security Considerations

1. **Access Control**:
   - Update operations require admin role
   - API endpoints protected by authentication
   - Audit log of all update actions
   - User attribution for manual operations

2. **Package Verification**:
   - GPG signature verification for all packages
   - Repository signature validation
   - Checksum verification after download
   - Reject unsigned or tampered packages

3. **Network Security**:
   - Updates fetched over HTTPS
   - Optional TLS for cluster communication
   - Certificate validation
   - Rate limiting on update endpoints

4. **Snapshot Protection**:
   - Snapshots require elevated privileges
   - Automatic snapshot retention policy
   - Encryption at rest for sensitive data
   - Cleanup only after successful validation

---

## Troubleshooting

### Common Issues

**Update Stuck in "Running" State**:
- Check node connectivity (SSH/API)
- Review node system logs
- Verify disk space availability
- Check for hung processes
- Use cancel endpoint to stop update

**Rollback Fails**:
- Verify LVM snapshot exists
- Check available disk space
- Ensure node is reachable
- Try manual package downgrade
- Fall back to restore from backup

**Drift Not Detected**:
- Verify manifest exists
- Check node connectivity
- Ensure package manager accessible
- Review drift detection logs
- Run manual comparison

**Onboarding Wizard Fails**:
- Verify network discovery enabled
- Check firewall rules
- Ensure mDNS service running
- Review wizard logs
- Try manual node registration

---

## Future Enhancements

1. **Intelligent Update Scheduling**:
   - ML-based optimal update timing
   - Workload-aware batch sizing
   - Predictive rollback detection

2. **Advanced Drift Management**:
   - Automatic drift remediation
   - Drift trend analysis
   - Package whitelist/blacklist

3. **Enhanced Testing**:
   - Pre-update integration tests
   - Canary health validation
   - Automated rollback testing

4. **Multi-Cluster Updates**:
   - Cross-cluster orchestration
   - Geo-distributed rollouts
   - Global version management

---

## Summary

The MAP2 Audio Platform update system provides enterprise-grade cluster management with:

✅ **Zero-downtime rolling updates**  
✅ **Automatic rollback on failure**  
✅ **Version drift detection and correction**  
✅ **Golden manifest enforcement**  
✅ **Comprehensive UI (TUI + Web)**  
✅ **Real-time progress monitoring**  
✅ **Guided onboarding wizard**  
✅ **Fedora/RPM package management**  
✅ **Snapshot-based recovery**  
✅ **Production-ready safety mechanisms**

The system is designed for reliability, maintainability, and ease of use, ensuring audio clusters remain synchronized and operational during software updates.

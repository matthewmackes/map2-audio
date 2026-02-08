# MAP2 Audio — Cluster Update System: Detailed Plan

**Date**: February 7, 2026  
**Objective**: Build a unified, ≤3-click update system for Fedora Linux clusters  
**Scope**: System updates, application updates, cluster-wide rolling updates, and new-node onboarding  
**Delivery**: TUI menus + Web interface + backend APIs + automation scripts

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Assessment](#2-current-state-assessment)
3. [Architecture Overview](#3-architecture-overview)
4. [Update Categories & Flows](#4-update-categories--flows)
5. [Backend Implementation](#5-backend-implementation)
6. [TUI Menu System](#6-tui-menu-system)
7. [Web Interface](#7-web-interface)
8. [New Node Onboarding](#8-new-node-onboarding)
9. [Safety & Rollback System](#9-safety--rollback-system)
10. [Implementation Phases](#10-implementation-phases)
11. [File Manifest](#11-file-manifest)
12. [Testing Strategy](#12-testing-strategy)
13. [Risks & Mitigations](#13-risks--mitigations)

---

## 1. Executive Summary

### The Goal

Any operator can perform these operations in **≤ 3 clicks/keystrokes**:

| Operation | Clicks | Flow |
|-----------|--------|------|
| Update THIS node (OS + app) | 2 | Menu → "Update This Node" → Confirm |
| Update ALL nodes (rolling) | 2 | Menu → "Update All Nodes" → Confirm |
| Add a brand-new Fedora server to the cluster | 3 | Menu → "Add Node" → Paste IP → Go |
| Check update status across cluster | 1 | Menu → "Update Status" |
| Rollback a failed update | 2 | Menu → "Rollback" → Select snapshot → Confirm |

### Core Principles

1. **Idempotent** — Running the same update twice is safe and a no-op.
2. **Atomic per-node** — Each node either fully updates or fully rolls back.
3. **Rolling** — Never update all audio nodes at once; stagger to maintain service.
4. **Observable** — Real-time progress in both TUI and Web UI via WebSocket.
5. **Matching versions** — All cluster nodes converge to the same software versions.
6. **One-click onboarding** — A fresh Fedora install becomes a cluster member automatically.

---

## 2. Current State Assessment

### What Exists and Works

| Component | File | Status |
|-----------|------|--------|
| DNF package manager wrapper | `app/services/cluster/fedora_package_manager.py` | ✅ Production-ready — `check_updates()`, `get_package_version()`, `check_update_size()`, `take_package_snapshot()`, `diff_packages()` |
| Update orchestrator (core flow) | `app/services/cluster/update_orchestrator.py` | ✅ ~85% — Real SSH-based `_update_node()` with LVM snapshots, `dnf update -y`, reboot, poll for comeback |
| Post-update health monitor | `app/services/cluster/post_update_health.py` | ✅ ~75% — 4-phase monitoring (immediate/short/medium/long), Prometheus xrun queries |
| Rollback engine | `app/services/cluster/update_rollback.py` | ✅ ~80% — Package downgrade via `dnf history undo`, config/DB backup/restore, service restart |
| Update API routes | `app/routes/cluster_update.py` | ✅ 9 endpoints defined — `/trigger`, `/progress`, `/status`, `/validate`, `/estimate`, `/abort`, `/snapshots`, `/rollback` |
| Pre/post-update validator | `app/services/cluster/update_validator.py` | ⚠️ ~50% — Structure solid, but 90% mock data |
| TUI cluster admin screen | `tui/screens/cluster_admin_screen.py` | ✅ Full UI — 7 tabs, update scheduling, node table, event log |
| Node deployment script | `scripts/deploy_cluster_node.sh` | ✅ 626-line production script — installs deps, configures audio, registers with manager |
| Management node installer | `scripts/install_cluster_manager.sh` | ✅ 878-line installer |
| ZTP bootstrap | `app/services/cluster/ztp.py` | ✅ ~80% — Identity, SSH keys, directories, registration |
| Cluster config template | `config/cluster.conf.template` | ✅ Complete — includes `[cluster_updates]` section with cron, stagger, rollback settings |

### Critical Gaps (What This Plan Addresses)

| Gap | Severity | Fix |
|-----|----------|-----|
| `_rollback_node()` in orchestrator is **stubbed** (just returns True) | 🔴 Critical | Wire to `UpdateRollbackManager.rollback()` |
| `_restore_config_files()` in rollback is **stubbed** | 🔴 Critical | Implement actual config restore from snapshot |
| `UpdateValidator` uses **90% hardcoded mock data** | 🟡 High | Wire to real SSH/API queries per node |
| **Naming inconsistency**: routes import `update_scheduler`/`update_monitor` but module defines `UpdateScheduler`/`PostUpdateMonitor` | 🔴 Critical | Fix imports — this crashes at runtime |
| No **"Update This Node"** single-node operation in TUI/Web | 🟡 High | Add dedicated menu item and API |
| No **"Add New Node"** wizard in TUI/Web | 🟡 High | Build onboarding wizard |
| No **version manifest** to enforce all nodes match | 🟡 High | Create cluster version manifest system |
| No **Web UI update tab** in ClusterDashboard | 🟡 High | Add "System Updates" tab |
| No `map2-fleet-update.timer` systemd unit | 🟡 Medium | Create scheduled update timer |
| `update_history` endpoint returns empty list | 🟡 Medium | Wire to rollback snapshot history |
| Duplicate `return True` bug in `_validate_node_post_update()` | 🟡 Medium | Fix |
| `progress.node_results` reference — `UpdateProgress` has no such field | 🟡 Medium | Fix dataclass |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    OPERATOR INTERFACES                       │
│                                                             │
│   ┌─────────────┐    ┌──────────────┐    ┌──────────────┐  │
│   │   TUI Menu   │    │   Web UI     │    │  CLI (m2.sh) │  │
│   │  (Textual)   │    │  (React)     │    │  (Bash)      │  │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│          │                   │                   │          │
│          └───────────────────┼───────────────────┘          │
│                              │                              │
│                    ┌─────────▼──────────┐                   │
│                    │  FastAPI Backend    │                   │
│                    │  /api/cluster/      │                   │
│                    │  update/*           │                   │
│                    └─────────┬──────────┘                   │
│                              │                              │
│              ┌───────────────┼───────────────┐              │
│              │               │               │              │
│    ┌─────────▼────┐ ┌───────▼──────┐ ┌──────▼────────┐    │
│    │ Update       │ │ Version      │ │ Node          │    │
│    │ Orchestrator │ │ Manifest     │ │ Onboarding    │    │
│    │              │ │ Manager      │ │ Service       │    │
│    └──────┬───────┘ └──────┬───────┘ └───────┬───────┘    │
│           │                │                  │            │
│    ┌──────▼───────┐ ┌──────▼──────┐ ┌────────▼──────┐    │
│    │ Fedora Pkg   │ │ Cluster     │ │ ZTP +         │    │
│    │ Manager      │ │ Registry    │ │ Deploy Script │    │
│    │ (dnf/rpm)    │ │             │ │               │    │
│    └──────┬───────┘ └─────────────┘ └───────────────┘    │
│           │                                               │
│    ┌──────▼───────┐                                       │
│    │ SSH to each  │───▶ [Node 1] dnf update -y            │
│    │ cluster node │───▶ [Node 2] dnf update -y            │
│    │              │───▶ [Node N] dnf update -y            │
│    └──────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

### Communication Matrix

| From → To | Protocol | Purpose |
|-----------|----------|---------|
| TUI/Web → Management API | HTTP REST | Trigger updates, get status |
| Management → Audio Nodes (updates) | SSH (`asyncio.subprocess`) | `dnf update`, `systemctl reboot`, health checks |
| Management → Audio Nodes (registration) | HTTP REST | Node self-registers via `POST /api/cluster/nodes` |
| Management → All Nodes (live progress) | WebSocket | Real-time update progress broadcast |
| Management → Nodes (version check) | SSH | `rpm -qa` snapshot, compare against manifest |
| New Node → Management | HTTP REST | ZTP bootstrap registration |

---

## 4. Update Categories & Flows

### 4.1 — Update THIS Node (Local)

**Use case**: Operator is on a specific node and wants to update just that machine.

```
Operator clicks "Update This Node"
    │
    ├── 1. Pre-flight check (disk space, backup status)
    ├── 2. Take package snapshot (rpm -qa)
    ├── 3. Create LVM snapshot (lvcreate -L5G -s -n pre_update)
    ├── 4. Notify cluster: "Node X going offline for update"
    ├── 5. dnf update -y --refresh
    ├── 6. Restart MAP2 services (systemctl restart map2-*)
    ├── 7. If kernel update: systemctl reboot
    ├── 8. Post-update health check (4 phases)
    ├── 9. If healthy: remove LVM snapshot, update version manifest
    └── 10. If unhealthy: auto-rollback → dnf history undo + restore snapshot
```

**API**: `POST /api/cluster/update/local`  
**Backend**: New method `FedoraPackageManager.apply_updates(dry_run=False)`  
**Clicks**: 2 (Menu → Update This Node → Confirm)

### 4.2 — Update ALL Nodes (Cluster-Wide Rolling)

**Use case**: Push OS + application updates to every node in the cluster.

```
Operator clicks "Update All Nodes"
    │
    ├── 1. Build cluster version manifest (what every node has now)
    ├── 2. Pre-flight ALL nodes (disk, health, connectivity)
    ├── 3. Display summary: "X packages to update across Y nodes"
    ├── 4. Operator confirms
    │
    ├── PHASE 1: Test Node (1 canary)
    │   └── Update → Validate → If fail: ABORT entire operation
    │
    ├── PHASE 2: Audio Nodes (staggered, default 2 at a time)
    │   ├── For each batch:
    │   │   ├── Drain flows from node (reassign to others)
    │   │   ├── Update node via SSH
    │   │   ├── Validate health
    │   │   ├── Restore flows to node
    │   │   └── Wait stagger_interval before next batch
    │   └── If >30% nodes fail: ABORT, rollback completed nodes
    │
    ├── PHASE 3: Management Nodes (one at a time, leader last)
    │   ├── Transfer leadership if updating current leader
    │   ├── Update node
    │   └── Validate and restore leadership
    │
    └── 5. Update version manifest, broadcast completion event
```

**API**: `POST /api/cluster/update/trigger` (already exists)  
**Backend**: `UpdateScheduler.execute_update_cycle()` (already ~85% implemented)  
**Clicks**: 2 (Menu → Update All Nodes → Confirm)

### 4.3 — Add New Node to Cluster

**Use case**: A fresh Fedora Server install needs to join the existing cluster.

```
Operator clicks "Add New Node"
    │
    ├── 1. Enter IP address of new Fedora host
    ├── 2. Enter SSH credentials (or paste SSH key)
    ├── 3. Click "Provision"
    │
    ├── Management node SSHs to new host:
    │   ├── a. Copy deploy_cluster_node.sh to target
    │   ├── b. Execute: deploy_cluster_node.sh --manager-ip <SELF>
    │   │       ├── Installs all audio dependencies (dnf install ...)
    │   │       ├── Creates map2 user, directories, venv
    │   │       ├── Detects audio hardware
    │   │       ├── Generates node config
    │   │       ├── Requests TLS certificate from management node
    │   │       ├── Installs systemd unit
    │   │       └── Registers with management node via HTTP POST
    │   │
    │   ├── c. Sync version manifest — install exact RPM versions matching cluster
    │   │       └── dnf install <package-version> for any mismatched packages
    │   │
    │   ├── d. Push cluster config (cluster.conf + audio settings)
    │   │
    │   └── e. Start map2-audio-node.service
    │
    ├── 4. Management node adds to registry
    ├── 5. Health check passes → node appears in dashboard
    └── 6. Operator assigns flows to new node (optional)
```

**API**: `POST /api/cluster/nodes/onboard` (NEW)  
**Backend**: New `NodeOnboardingService` class  
**Clicks**: 3 (Menu → Add Node → Enter IP → Go)

### 4.4 — Version Manifest (Ensuring All Nodes Match)

**Problem**: After updates, nodes may have different package versions. We need a single source of truth.

```
Version Manifest (JSON stored on management node):
{
    "manifest_version": "2026-02-07T10:30:00Z",
    "map2_version": "0.2.0",
    "fedora_release": "42",
    "critical_packages": {
        "python3.11": "3.11.12-1.fc42",
        "jack-audio-connection-kit": "1.9.22-2.fc42",
        "alsa-lib": "1.2.12-1.fc42",
        "pipewire": "1.0.7-1.fc42",
        "linux-rt": "6.8.9-rt5.fc42",
        ...
    },
    "map2_packages": {
        "map2-audio-engine": "0.2.0-1.fc42",
        "map2-web-ui": "0.2.0-1.fc42",
        "map2-cluster-tools": "0.2.0-1.fc42"
    },
    "config_checksum": "sha256:abc123...",
    "created_by": "management-node-01"
}
```

**How it works**:
1. After a successful cluster-wide update, the management node captures `rpm -qa` from the test node.
2. This becomes the **golden manifest**.
3. When any node joins or is checked, its packages are compared against the manifest.
4. Drift is flagged in the dashboard and can be auto-corrected.

**API**: `GET /api/cluster/version/manifest`, `POST /api/cluster/version/manifest/enforce`  
**File**: `app/services/cluster/version_manifest.py` (NEW)

---

## 5. Backend Implementation

### 5.1 — New Files to Create

#### `app/services/cluster/version_manifest.py`

```python
class VersionManifest:
    """
    Tracks the golden set of package versions that all cluster nodes should match.
    Stored as JSON at /var/lib/map2/version_manifest.json.
    """

    async def capture_manifest(self, source_node_id: str) -> dict:
        """SSH to source node, run rpm -qa --qf '%{NAME} %{VERSION}-%{RELEASE}\n',
        parse into dict, save to management node."""

    async def compare_node(self, node_id: str) -> ManifestDiff:
        """Compare a node's packages against the golden manifest.
        Returns: added, removed, version_mismatches."""

    async def enforce_manifest(self, node_id: str, dry_run: bool = True) -> EnforceResult:
        """SSH to node, dnf install/downgrade packages to match manifest.
        dry_run=True returns what would change without applying."""

    async def compare_all_nodes(self) -> dict[str, ManifestDiff]:
        """Compare all registered nodes against manifest in parallel."""

    def get_current_manifest(self) -> dict:
        """Load current manifest from disk."""

    def get_manifest_history(self) -> list[dict]:
        """List previous manifests for rollback reference."""
```

#### `app/services/cluster/node_onboarding.py`

```python
class NodeOnboardingService:
    """
    Manages the full lifecycle of adding a new Fedora host to the cluster.
    Orchestrates: SSH access → deploy script → version sync → config push → registration.
    """

    async def onboard_node(
        self,
        target_ip: str,
        ssh_user: str = "root",
        ssh_key_path: str = None,
        ssh_password: str = None,
        node_role: str = "AUDIO",
    ) -> OnboardingResult:
        """Full onboarding pipeline:
        1. Test SSH connectivity
        2. SCP deploy_cluster_node.sh to target
        3. Execute deploy script with --manager-ip
        4. Wait for node registration callback
        5. Sync version manifest (enforce matching packages)
        6. Push cluster config
        7. Verify health
        8. Return result with node_id
        """

    async def _test_ssh(self, ip: str, user: str, key: str) -> bool:
        """Verify SSH connectivity to target host."""

    async def _deploy_script(self, ip: str, user: str, key: str) -> str:
        """SCP + execute deploy_cluster_node.sh, stream output."""

    async def _sync_versions(self, node_id: str) -> ManifestDiff:
        """Enforce version manifest on new node."""

    async def _push_config(self, node_id: str) -> bool:
        """Push cluster.conf and audio config to new node."""

    async def get_onboarding_progress(self, job_id: str) -> OnboardingProgress:
        """Get real-time progress of an onboarding job."""
```

#### `app/services/cluster/local_updater.py`

```python
class LocalNodeUpdater:
    """
    Handles updating the local node (the one the operator is on).
    Used for 'Update This Node' operations.
    """

    async def update_local(self, dry_run: bool = False) -> LocalUpdateResult:
        """
        1. Pre-flight (disk, backup)
        2. Take snapshot
        3. Notify cluster
        4. dnf update -y --refresh
        5. Restart MAP2 services
        6. If kernel update: schedule reboot
        7. Post-update health check
        8. Update version manifest
        """

    async def check_local_updates(self) -> list[PackageUpdate]:
        """Check what updates are available for this node."""

    async def get_local_version_drift(self) -> ManifestDiff:
        """Compare this node's packages against the cluster manifest."""
```

#### `app/routes/update_system.py` (consolidated update routes)

```python
router = APIRouter(prefix="/api/system/update", tags=["System Updates"])

# --- Local Node Updates ---
@router.get("/local/check")           # Check available updates for this node
@router.post("/local/apply")          # Apply updates to this node
@router.get("/local/drift")           # Check version drift vs cluster manifest

# --- Cluster-Wide Updates ---
@router.post("/cluster/trigger")      # Trigger rolling update across all nodes
@router.get("/cluster/progress")      # Real-time progress
@router.post("/cluster/abort")        # Abort in-progress update
@router.get("/cluster/estimate")      # Time estimate
@router.get("/cluster/history")       # Past update history

# --- Version Manifest ---
@router.get("/manifest")              # Get current golden manifest
@router.post("/manifest/capture")     # Capture new manifest from a node
@router.get("/manifest/drift")        # All nodes' drift from manifest
@router.post("/manifest/enforce")     # Force a node to match manifest

# --- Node Onboarding ---
@router.post("/onboard")             # Start onboarding a new node
@router.get("/onboard/{job_id}")     # Get onboarding progress
@router.get("/onboard/history")      # Past onboarding jobs

# --- Rollback ---
@router.get("/rollback/snapshots")    # List available snapshots
@router.post("/rollback/execute")     # Execute rollback on a node
@router.get("/rollback/history")      # Past rollback operations

# --- WebSocket ---
@router.websocket("/ws/progress")     # Live progress stream
```

### 5.2 — Existing Files to Fix

| File | Fix Required |
|------|-------------|
| `app/services/cluster/update_orchestrator.py` | Wire `_rollback_node()` to `UpdateRollbackManager.rollback()` instead of returning True. Fix duplicate `return True` bug. Fix `progress.node_results` reference. |
| `app/services/cluster/update_rollback.py` | Implement `_restore_config_files()` — copy from snapshot dir back to `/etc/map2/` |
| `app/services/cluster/update_validator.py` | Replace all hardcoded mock data with real SSH/API queries to nodes |
| `app/routes/cluster_update.py` | Fix import naming: `update_scheduler` → `UpdateScheduler`, `update_monitor` → `PostUpdateMonitor` |
| `app/routes/cluster_admin.py` | Wire `/update/execute` endpoint (currently has TODO for Task 10) |

### 5.3 — WebSocket Progress Broadcasting

All update operations broadcast real-time progress via WebSocket:

```python
# Event types for WebSocket broadcast
class UpdateEvent(str, Enum):
    UPDATE_STARTED = "update.started"
    NODE_UPDATE_STARTED = "update.node.started"
    NODE_UPDATE_PROGRESS = "update.node.progress"      # dnf output streaming
    NODE_UPDATE_COMPLETE = "update.node.complete"
    NODE_UPDATE_FAILED = "update.node.failed"
    NODE_ROLLBACK_STARTED = "update.node.rollback.started"
    NODE_ROLLBACK_COMPLETE = "update.node.rollback.complete"
    PHASE_CHANGED = "update.phase.changed"
    UPDATE_COMPLETE = "update.complete"
    UPDATE_ABORTED = "update.aborted"
    ONBOARD_STARTED = "onboard.started"
    ONBOARD_PROGRESS = "onboard.progress"
    ONBOARD_COMPLETE = "onboard.complete"
    ONBOARD_FAILED = "onboard.failed"
    VERSION_DRIFT_DETECTED = "version.drift.detected"
```

---

## 6. TUI Menu System

### 6.1 — New TUI Screen: `tui/screens/system_update_screen.py`

The update screen is accessible from the main TUI via a new top-level tab or from within the existing Cluster tab.

```
┌─── MAP2 Audio ─── System Updates ───────────────────────────────────┐
│                                                                      │
│  ┌─ Quick Actions ─────────────────────────────────────────────────┐ │
│  │  [U] Update This Node    [A] Update All Nodes    [N] Add Node  │ │
│  │  [S] Check Status        [R] Rollback             [M] Manifest │ │
│  └────────────────────────────────────────────────────────────────-┘ │
│                                                                      │
│  ┌─ This Node ─────────────────────────────────────────────────────┐ │
│  │  Hostname: audio-node-03          Role: AUDIO                   │ │
│  │  Fedora: 42                       Kernel: 6.8.9-rt5             │ │
│  │  MAP2 Version: 0.2.0             Last Updated: 2026-02-01      │ │
│  │  Available Updates: 12 packages (47 MB)                         │ │
│  │  Version Drift: ⚠️  3 packages differ from cluster manifest     │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Cluster Overview ──────────────────────────────────────────────┐ │
│  │  Node            │ Role    │ Version │ Updates │ Drift │ Health │ │
│  │  ────────────────│─────────│─────────│─────────│───────│────────│ │
│  │  mgmt-01         │ MGMT    │ 0.2.0   │ 12      │ ✅    │ 98%   │ │
│  │  audio-01        │ AUDIO   │ 0.2.0   │ 12      │ ✅    │ 95%   │ │
│  │  audio-02        │ AUDIO   │ 0.2.0   │ 8       │ ⚠️ 3  │ 92%   │ │
│  │  audio-03 (this) │ AUDIO   │ 0.1.9   │ 15      │ ⚠️ 5  │ 89%   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─ Recent Activity ──────────────────────────────────────────────-┐ │
│  │  2026-02-07 09:15  Cluster update completed (4/4 nodes)   ✅   │ │
│  │  2026-02-01 03:00  Scheduled update (auto)                ✅   │ │
│  │  2026-01-28 14:22  Node audio-04 onboarded                ✅   │ │
│  │  2026-01-25 03:00  Scheduled update — audio-02 rollback   ⚠️   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [?] Help    [q] Back                                                │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.2 — TUI Subscreen: Update This Node

```
┌─── Update This Node ────────────────────────────────────────────────┐
│                                                                      │
│  Pre-flight Checks:                                                  │
│    ✅ Disk space: 15.2 GB available (need 2 GB)                     │
│    ✅ Last backup: 2 hours ago                                       │
│    ✅ Cluster health: 96%                                            │
│    ✅ No active audio flows on this node                             │
│    ⚠️  Kernel update included — reboot will be required              │
│                                                                      │
│  Updates to install:                                                 │
│    12 packages, 47 MB download, 120 MB installed                     │
│                                                                      │
│    Package                          Current      → New               │
│    ─────────────────────────────────────────────────────              │
│    python3.11                       3.11.11      → 3.11.12           │
│    jack-audio-connection-kit        1.9.21       → 1.9.22            │
│    alsa-lib                         1.2.11       → 1.2.12            │
│    linux-rt                         6.8.8-rt4    → 6.8.9-rt5         │
│    ... (8 more)                                                      │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐│
│  │  ⚠️  This will briefly interrupt audio processing on this node.  ││
│  │  Flows will be reassigned to other nodes during the update.      ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  [Enter] Apply Updates    [d] Dry Run    [Esc] Cancel                │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.3 — TUI Subscreen: Update All Nodes

```
┌─── Update All Nodes (Rolling) ──────────────────────────────────────┐
│                                                                      │
│  Strategy: Staged rolling update                                     │
│  Stagger: 2 nodes at a time, 5 min between batches                  │
│  Estimated time: 35 minutes                                          │
│                                                                      │
│  Update Order:                                                       │
│    Phase 1 — Test Node:     audio-01 (canary)                        │
│    Phase 2 — Audio Nodes:   audio-02, audio-03 (batch 1)            │
│                              audio-04, audio-05 (batch 2)            │
│    Phase 3 — Management:    mgmt-02, then mgmt-01 (leader last)     │
│                                                                      │
│  Safety:                                                             │
│    ✅ LVM snapshots before each node                                │
│    ✅ Auto-rollback if health < 70%                                  │
│    ✅ Abort if canary fails                                          │
│    ✅ Abort if >30% nodes fail                                       │
│                                                                      │
│  [Enter] Start Rolling Update    [d] Dry Run    [Esc] Cancel         │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.4 — TUI Subscreen: Add New Node

```
┌─── Add New Node to Cluster ─────────────────────────────────────────┐
│                                                                      │
│  Target Host IP:  [192.168.1.50          ]                           │
│  SSH User:        [root                  ]                           │
│  SSH Auth:        (•) SSH Key  ( ) Password                          │
│  SSH Key Path:    [~/.ssh/id_ed25519     ]                           │
│  Node Role:       (•) Audio  ( ) Management  ( ) Standby            │
│                                                                      │
│  ┌─ Pre-checks ────────────────────────────────────────────────────┐ │
│  │  ⏳ Testing SSH connectivity...                                  │ │
│  │  ✅ SSH connection successful                                    │ │
│  │  ✅ Fedora 42 detected                                          │ │
│  │  ✅ 32 GB RAM, 8 cores                                          │ │
│  │  ✅ Audio device detected: Focusrite Scarlett 18i20              │ │
│  │  ✅ 120 GB free disk space                                       │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  This will:                                                          │
│    1. Install all MAP2 dependencies                                  │
│    2. Configure audio subsystem                                      │
│    3. Match package versions to cluster manifest                     │
│    4. Issue TLS certificate                                          │
│    5. Register as cluster member                                     │
│                                                                      │
│  Estimated time: 8-12 minutes                                        │
│                                                                      │
│  [Enter] Start Provisioning    [Esc] Cancel                          │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.5 — TUI Subscreen: Live Progress View (shared for all operations)

```
┌─── Cluster Update Progress ─────────────────────────────────────────┐
│                                                                      │
│  Status: PHASE 2 — Audio Nodes (batch 1 of 2)                       │
│  Overall: ████████████░░░░░░░░ 55%   (3/6 nodes complete)           │
│  Elapsed: 12m 34s    Remaining: ~10m                                 │
│                                                                      │
│  Node              Status          Progress    Health                 │
│  ─────────────────────────────────────────────────────                │
│  audio-01 (canary) ✅ Complete     ████████████ 100%   98%           │
│  audio-02          ✅ Complete     ████████████ 100%   95%           │
│  audio-03          🔄 Updating    ████████░░░░  67%   --            │
│  audio-04          ⏳ Queued      ░░░░░░░░░░░░   0%   92%           │
│  mgmt-02           ⏳ Queued      ░░░░░░░░░░░░   0%   97%           │
│  mgmt-01           ⏳ Queued      ░░░░░░░░░░░░   0%   99%           │
│                                                                      │
│  ┌─ Live Output (audio-03) ────────────────────────────────────────┐ │
│  │  Installing: python3.11-3.11.12-1.fc42.x86_64  (4/12)          │ │
│  │  Downloading: jack-audio-connection-kit-1.9.22...               │ │
│  │  Verifying: alsa-lib-1.2.12-1.fc42.x86_64                      │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  [a] Abort Update    [q] Background (continue running)               │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.6 — Integration into Main TUI App

Add a new top-level tab to `tui/app.py`:

| Key | Tab | Screen |
|-----|-----|--------|
| `u` | 🔄 Updates | `SystemUpdateScreen` |

This tab is accessible from any screen by pressing `u`.

---

## 7. Web Interface

### 7.1 — New Tab: "System Updates" in ClusterDashboardPage

Add an 8th tab to the existing `ClusterDashboardPage.tsx`:

**Tab structure:**

```
ClusterDashboardPage
  ├── Overview        (existing)
  ├── Learn           (existing)
  ├── Services        (existing)
  ├── Metrics         (existing)
  ├── Events          (existing)
  ├── Flows           (existing)
  ├── Reports         (existing)
  └── 🔄 Updates      (NEW)
```

### 7.2 — Updates Tab Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔄 System Updates                                                   │
│                                                                      │
│  ┌─ Quick Actions ──────────────────────────────────────────────┐   │
│  │  [Update This Node]  [Update All Nodes]  [Add New Node]      │   │
│  │  [Check for Updates]  [View Manifest]    [Rollback]          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─ Cluster Version Status ─────────────────────────────────────┐   │
│  │                                                               │   │
│  │  Cluster Manifest: v0.2.0 (captured 2026-02-01)              │   │
│  │                                                               │   │
│  │  ┌──────────────────────────────────────────────────────────┐ │   │
│  │  │ Node       │ Role  │ MAP2  │ Pkgs  │ Drift │ Status     │ │   │
│  │  │────────────│───────│───────│───────│───────│────────────│ │   │
│  │  │ mgmt-01    │ MGMT  │ 0.2.0 │ 1,247 │ ✅ 0  │ Up to date│ │   │
│  │  │ audio-01   │ AUDIO │ 0.2.0 │ 1,247 │ ✅ 0  │ Up to date│ │   │
│  │  │ audio-02   │ AUDIO │ 0.2.0 │ 1,244 │ ⚠️ 3  │ Drift     │ │   │
│  │  │ audio-03   │ AUDIO │ 0.1.9 │ 1,240 │ 🔴 7  │ Outdated  │ │   │
│  │  └──────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────-┘   │
│                                                                      │
│  ┌─ Update History ─────────────────────────────────────────────┐   │
│  │  Timeline / table of past updates with status and duration    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─ Available Updates ──────────────────────────────────────────┐   │
│  │  Package list with current → available versions               │   │
│  │  Security / bugfix / enhancement badges                       │   │
│  │  Total download size                                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 7.3 — Web Components to Create

| Component | File | Purpose |
|-----------|------|---------|
| `UpdatesTab` | `web/src/app/components/ClusterDashboard/UpdatesTab.tsx` | Main updates tab container |
| `QuickActions` | `web/src/app/components/Updates/QuickActions.tsx` | Button bar for primary actions |
| `NodeVersionTable` | `web/src/app/components/Updates/NodeVersionTable.tsx` | Node version comparison table |
| `UpdateProgressModal` | `web/src/app/components/Updates/UpdateProgressModal.tsx` | Modal with live progress bars, WebSocket-driven |
| `AddNodeWizard` | `web/src/app/components/Updates/AddNodeWizard.tsx` | Step-by-step onboarding wizard |
| `RollbackDialog` | `web/src/app/components/Updates/RollbackDialog.tsx` | Snapshot selection and rollback confirmation |
| `UpdateHistoryTimeline` | `web/src/app/components/Updates/UpdateHistoryTimeline.tsx` | Timeline of past update operations |
| `ManifestViewer` | `web/src/app/components/Updates/ManifestViewer.tsx` | View/diff the version manifest |
| `AvailableUpdates` | `web/src/app/components/Updates/AvailableUpdates.tsx` | Package list with version diffs |
| `useUpdateWebSocket` | `web/src/app/hooks/useUpdateWebSocket.ts` | Custom hook for update progress WebSocket |

### 7.4 — Confirmation Modals (keeping it ≤3 clicks)

**Update This Node:**
```
Click [Update This Node] →
  Modal: "12 updates available (47 MB). Kernel update requires reboot.
          Audio will be interrupted for ~3 minutes.
          [Cancel]  [Apply Updates]"
→ Done. 2 clicks.
```

**Update All Nodes:**
```
Click [Update All Nodes] →
  Modal: "Rolling update across 6 nodes. Estimated time: 35 min.
          Strategy: Canary → Audio (2 at a time) → Management.
          Auto-rollback enabled.
          [Cancel]  [Start Update]"
→ Done. 2 clicks.
```

**Add New Node:**
```
Click [Add New Node] →
  Wizard Step 1: Enter IP, SSH credentials, role [Next] →
  Wizard Step 2: Review pre-checks results [Provision] →
→ Done. 3 clicks.
```

---

## 8. New Node Onboarding — Detailed Flow

### 8.1 — Provisioning Pipeline

```python
class OnboardingStep(str, Enum):
    SSH_TEST = "ssh_test"                     # ~5 seconds
    SYSTEM_CHECK = "system_check"             # ~10 seconds
    COPY_DEPLOY_SCRIPT = "copy_deploy"        # ~5 seconds
    INSTALL_DEPENDENCIES = "install_deps"     # ~3-5 minutes (dnf install)
    SETUP_DIRECTORIES = "setup_dirs"          # ~5 seconds
    DETECT_AUDIO = "detect_audio"             # ~10 seconds
    SETUP_PYTHON = "setup_python"             # ~1-2 minutes (pip install)
    GENERATE_CONFIG = "generate_config"       # ~5 seconds
    REQUEST_CERTIFICATE = "request_cert"      # ~10 seconds
    INSTALL_SYSTEMD = "install_systemd"       # ~5 seconds
    REGISTER_WITH_CLUSTER = "register"        # ~5 seconds
    SYNC_VERSIONS = "sync_versions"           # ~2-5 minutes (match manifest)
    PUSH_CLUSTER_CONFIG = "push_config"       # ~10 seconds
    START_SERVICES = "start_services"         # ~15 seconds
    HEALTH_CHECK = "health_check"             # ~30 seconds
```

Total: **8-12 minutes** for a full onboarding.

### 8.2 — Version Synchronization

After the base deployment, the new node may have slightly different package versions than the rest of the cluster. The version sync step ensures convergence:

```bash
# On management node: extract manifest
MANIFEST=$(cat /var/lib/map2/version_manifest.json)

# On new node via SSH: for each critical package
for pkg in $(echo "$MANIFEST" | jq -r '.critical_packages | to_entries[] | "\(.key)-\(.value)"'); do
    CURRENT=$(rpm -q --qf '%{NAME}-%{VERSION}-%{RELEASE}' "$pkg_name" 2>/dev/null)
    if [ "$CURRENT" != "$pkg" ]; then
        dnf install -y "$pkg" || dnf downgrade -y "$pkg"
    fi
done
```

### 8.3 — Post-Onboarding

Once onboarded:
- Node appears in TUI cluster tab with ✅ status
- Node appears in Web dashboard
- Node is eligible for flow assignments
- Node participates in heartbeat monitoring
- Node receives future cluster-wide updates
- Prometheus begins scraping the node

---

## 9. Safety & Rollback System

### 9.1 — Pre-Update Safety Checks

Every update operation (local or cluster-wide) runs these checks before proceeding:

| Check | Threshold | Action if Fail |
|-------|-----------|----------------|
| Disk space | ≥ 2 GB free | Block update |
| Last backup age | ≤ 24 hours | Warn (allow override) |
| Cluster health | ≥ 80% average | Block cluster update |
| Node health | ≥ 60% per node | Skip unhealthy nodes |
| Active flows | Drain before update | Auto-drain with 30s timeout |
| Network connectivity | All nodes reachable | Block if >1 node unreachable |
| Concurrent updates | None in progress | Block (one update at a time) |

### 9.2 — Rollback Triggers

| Condition | Automatic? | Action |
|-----------|-----------|--------|
| Node doesn't come back after reboot (5 min) | ✅ Auto | LVM snapshot rollback |
| Post-update health < 50% (immediate check) | ✅ Auto | `dnf history undo` + service restart |
| Post-update health < 70% (1 min check) | ✅ Auto | `dnf history undo` + service restart |
| Xruns > 10 in first minute | ✅ Auto | Rollback |
| >30% of nodes fail during cluster update | ✅ Auto | Abort remaining, rollback failed |
| Canary node fails | ✅ Auto | Abort entire cluster update |
| Operator clicks "Rollback" | Manual | Select snapshot, confirm, rollback |

### 9.3 — Rollback Procedure

```
1. Stop MAP2 services (systemctl stop map2-*)
2. Attempt: dnf history undo <last_transaction_id>
   └── If fails: dnf downgrade <pkg1> <pkg2> ... per saved snapshot
3. Restore config files from /var/lib/map2/rollback_snapshots/<id>/
4. Restore database from snapshot backup
5. Start MAP2 services
6. Validate: systemctl is-active map2-audio-node
7. Report result to management node
```

---

## 10. Implementation Phases

### Phase 1: Foundation Fixes (3-4 days)

**Priority**: Fix broken/stubbed code so the existing update pipeline actually works end-to-end.

| Task | File | Description |
|------|------|-------------|
| 1.1 | `update_orchestrator.py` | Wire `_rollback_node()` → `UpdateRollbackManager.rollback()` |
| 1.2 | `update_orchestrator.py` | Fix duplicate `return True` in `_validate_node_post_update()` |
| 1.3 | `update_orchestrator.py` | Fix `progress.node_results` — add field to `UpdateProgress` dataclass |
| 1.4 | `update_rollback.py` | Implement `_restore_config_files()` — copy from snapshot to `/etc/map2/` |
| 1.5 | `cluster_update.py` (routes) | Fix import naming: reference correct class names from orchestrator |
| 1.6 | `cluster_admin.py` (routes) | Wire `/update/execute` endpoint to orchestrator |
| 1.7 | `update_validator.py` | Replace top 5 most critical mock checks with real SSH/API queries |

### Phase 2: Version Manifest System (2-3 days)

| Task | File | Description |
|------|------|-------------|
| 2.1 | `version_manifest.py` (NEW) | Create `VersionManifest` class with capture/compare/enforce |
| 2.2 | `update_system.py` (NEW routes) | Create manifest API endpoints |
| 2.3 | `update_orchestrator.py` | Post-update: auto-capture manifest from canary node |
| 2.4 | Config | Add manifest path to `cluster.conf.template` |

### Phase 3: Local Node Updater (2 days)

| Task | File | Description |
|------|------|-------------|
| 3.1 | `local_updater.py` (NEW) | Create `LocalNodeUpdater` with `update_local()`, `check_local_updates()`, `get_local_version_drift()` |
| 3.2 | `update_system.py` (routes) | Add local update endpoints |
| 3.3 | `fedora_package_manager.py` | Add `apply_updates(dry_run=False)` method — the missing execution step |

### Phase 4: Node Onboarding Service (3-4 days)

| Task | File | Description |
|------|------|-------------|
| 4.1 | `node_onboarding.py` (NEW) | Create `NodeOnboardingService` with full SSH pipeline |
| 4.2 | `update_system.py` (routes) | Add onboarding endpoints |
| 4.3 | `deploy_cluster_node.sh` | Add `--manifest-url` flag to accept version manifest for sync |
| 4.4 | Integration | Wire onboarding to version manifest enforcement |

### Phase 5: TUI Update Screen (3-4 days)

| Task | File | Description |
|------|------|-------------|
| 5.1 | `system_update_screen.py` (NEW) | Main update screen with quick actions, node table, activity log |
| 5.2 | `update_this_node_modal.py` (NEW) | Update This Node confirmation dialog |
| 5.3 | `update_all_nodes_modal.py` (NEW) | Update All Nodes confirmation with strategy preview |
| 5.4 | `add_node_wizard.py` (NEW) | Add Node step-by-step wizard |
| 5.5 | `update_progress_view.py` (NEW) | Live progress with per-node status bars |
| 5.6 | `tui/app.py` | Add `u` keybinding for Updates tab |

### Phase 6: Web UI Updates Tab (3-4 days)

| Task | File | Description |
|------|------|-------------|
| 6.1 | `UpdatesTab.tsx` (NEW) | Main updates tab container |
| 6.2 | `QuickActions.tsx` (NEW) | Button bar for primary actions |
| 6.3 | `NodeVersionTable.tsx` (NEW) | Node version comparison table |
| 6.4 | `UpdateProgressModal.tsx` (NEW) | Modal with live WebSocket-driven progress |
| 6.5 | `AddNodeWizard.tsx` (NEW) | Step-by-step onboarding wizard modal |
| 6.6 | `RollbackDialog.tsx` (NEW) | Snapshot select + rollback confirmation |
| 6.7 | `useUpdateWebSocket.ts` (NEW) | Custom hook for WebSocket progress events |
| 6.8 | `ClusterDashboardPage.tsx` | Add "Updates" as 8th tab |

### Phase 7: Scheduled Updates + Systemd Timer (1-2 days)

| Task | File | Description |
|------|------|-------------|
| 7.1 | `map2-fleet-update.timer` (NEW) | Systemd timer: Sunday 03:00 |
| 7.2 | `map2-fleet-update.service` (NEW) | Service that triggers cluster update API |
| 7.3 | `cluster.conf.template` | Add schedule enable/disable toggle |
| 7.4 | TUI/Web | Add schedule configuration UI |

### Phase 8: Testing & Hardening (2-3 days)

| Task | Description |
|------|-------------|
| 8.1 | Unit tests for `VersionManifest`, `LocalNodeUpdater`, `NodeOnboardingService` |
| 8.2 | Integration test: Full local update cycle (dry-run mode) |
| 8.3 | Integration test: Full cluster update (2-node mock cluster) |
| 8.4 | Integration test: Node onboarding with mock SSH |
| 8.5 | Rollback test: Simulate failed update, verify auto-rollback |
| 8.6 | TUI screen tests (Textual snapshot testing) |
| 8.7 | Web component tests (React Testing Library) |

**Total estimated effort**: 19-24 development days (4-5 weeks)

---

## 11. File Manifest

### New Files

| File | Type | Purpose |
|------|------|---------|
| `app/services/cluster/version_manifest.py` | Backend | Golden version manifest management |
| `app/services/cluster/node_onboarding.py` | Backend | New node provisioning orchestration |
| `app/services/cluster/local_updater.py` | Backend | Local node update operations |
| `app/routes/update_system.py` | Backend | Consolidated update API routes |
| `tui/screens/system_update_screen.py` | TUI | Main update screen |
| `tui/screens/update_this_node_modal.py` | TUI | Local update confirmation |
| `tui/screens/update_all_nodes_modal.py` | TUI | Cluster update confirmation |
| `tui/screens/add_node_wizard.py` | TUI | Onboarding wizard |
| `tui/screens/update_progress_view.py` | TUI | Live progress display |
| `web/src/app/components/ClusterDashboard/UpdatesTab.tsx` | Web | Updates tab container |
| `web/src/app/components/Updates/QuickActions.tsx` | Web | Action buttons |
| `web/src/app/components/Updates/NodeVersionTable.tsx` | Web | Node version comparison |
| `web/src/app/components/Updates/UpdateProgressModal.tsx` | Web | Live progress modal |
| `web/src/app/components/Updates/AddNodeWizard.tsx` | Web | Onboarding wizard |
| `web/src/app/components/Updates/RollbackDialog.tsx` | Web | Rollback confirmation |
| `web/src/app/components/Updates/UpdateHistoryTimeline.tsx` | Web | History timeline |
| `web/src/app/components/Updates/ManifestViewer.tsx` | Web | Manifest diff viewer |
| `web/src/app/components/Updates/AvailableUpdates.tsx` | Web | Package update list |
| `web/src/app/hooks/useUpdateWebSocket.ts` | Web | WebSocket hook |
| `systemd/map2-fleet-update.timer` | Systemd | Scheduled update timer |
| `systemd/map2-fleet-update.service` | Systemd | Scheduled update service |
| `tests/test_version_manifest.py` | Test | Manifest unit tests |
| `tests/test_node_onboarding.py` | Test | Onboarding unit tests |
| `tests/test_local_updater.py` | Test | Local update unit tests |
| `tests/test_update_integration.py` | Test | End-to-end integration tests |

### Files to Modify

| File | Changes |
|------|---------|
| `app/services/cluster/update_orchestrator.py` | Fix `_rollback_node()`, `_validate_node_post_update()`, `UpdateProgress` dataclass |
| `app/services/cluster/update_rollback.py` | Implement `_restore_config_files()` |
| `app/services/cluster/update_validator.py` | Replace mock data with real queries |
| `app/routes/cluster_update.py` | Fix import names, wire `update_history` |
| `app/routes/cluster_admin.py` | Wire `/update/execute` endpoint |
| `app/services/cluster/fedora_package_manager.py` | Add `apply_updates()` method |
| `tui/app.py` | Add `u` keybinding and Updates tab |
| `web/src/app/pages/ClusterDashboardPage.tsx` | Add 8th "Updates" tab |
| `config/cluster.conf.template` | Add manifest and onboarding settings |
| `scripts/deploy_cluster_node.sh` | Add `--manifest-url` flag |

---

## 12. Testing Strategy

### Unit Tests

```python
# tests/test_version_manifest.py
class TestVersionManifest:
    async def test_capture_manifest()         # Verify rpm -qa parsing
    async def test_compare_node_identical()   # No drift
    async def test_compare_node_drift()       # Detect mismatches
    async def test_enforce_manifest_dry_run() # Verify commands without executing
    async def test_manifest_persistence()     # Save/load JSON

# tests/test_local_updater.py
class TestLocalNodeUpdater:
    async def test_check_updates_available()
    async def test_check_updates_none()
    async def test_update_local_dry_run()
    async def test_update_local_with_kernel()  # Verify reboot scheduling
    async def test_version_drift_detection()

# tests/test_node_onboarding.py
class TestNodeOnboarding:
    async def test_ssh_test_success()
    async def test_ssh_test_failure()
    async def test_full_onboarding_pipeline()  # Mock SSH
    async def test_version_sync_with_drift()
    async def test_onboarding_progress_tracking()
```

### Integration Tests

```python
# tests/test_update_integration.py
class TestUpdateIntegration:
    async def test_local_update_full_cycle()
        # Pre-flight → snapshot → update → health check → manifest update

    async def test_cluster_update_canary_success()
        # Trigger → canary passes → proceed to audio nodes

    async def test_cluster_update_canary_failure()
        # Trigger → canary fails → entire update aborted

    async def test_rollback_on_health_failure()
        # Update → health < threshold → auto-rollback

    async def test_onboarding_new_node()
        # SSH → deploy → version sync → health → registered
```

### TUI Tests (Textual Snapshot)

```python
# tests/test_tui_updates.py
class TestSystemUpdateScreen:
    async def test_initial_render()
    async def test_update_this_node_flow()
    async def test_update_all_nodes_flow()
    async def test_add_node_wizard()
    async def test_progress_view_updates()
    async def test_keyboard_shortcuts()
```

---

## 13. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| SSH key not set up on new node | High | Blocks onboarding | Support both key and password auth; offer to copy key |
| dnf update breaks audio drivers | Medium | Audio outage | LVM snapshot + auto-rollback within 60s; canary node catches this |
| Network partition during cluster update | Low | Partial update state | Abort if node unreachable mid-update; each node is atomic |
| Management node updated while tracking update | Medium | Progress lost | Leader updated last; state persisted to disk between phases |
| Disk full during update | Low | Failed update | Pre-flight checks require 2 GB free; `check_update_size()` already implemented |
| Kernel update requires reboot during production | Medium | Audio interruption | Drain flows before update; schedule during maintenance windows |
| RPM version not available in repos (enforce fails) | Low | Version drift | Fall back to `dnf install` latest; document expected drift; alert operator |
| SSH timeout on slow node | Medium | Onboarding stalls | 10-minute timeout per step; clear error messages; retry option |

---

## Summary

This plan transforms the existing ~85%-complete update infrastructure into a fully operational, operator-friendly system with:

- **2-click local updates** via TUI and Web
- **2-click cluster-wide rolling updates** with canary testing and auto-rollback
- **3-click new node onboarding** from bare Fedora to active cluster member
- **Version manifest enforcement** ensuring all nodes run identical software
- **Real-time progress** via WebSocket in both TUI and Web interfaces
- **Automatic safety** via LVM snapshots, health thresholds, and phased rollout

The existing codebase provides a strong foundation — the `FedoraPackageManager`, `UpdateScheduler`, `UpdateRollbackManager`, and `PostUpdateHealthMonitor` are substantially implemented. The primary work is fixing bugs, wiring stubs to real implementations, building the version manifest system, and creating the user-facing TUI/Web interfaces.

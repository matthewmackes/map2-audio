# 🎨 Boot Splash & Audio Node Management Specification

## Boot Splash Screen Specification

**Goal:** Display deployment mode, node identity, cluster information, and status on startup.

### Display Elements

```
╔═══════════════════════════════════════════════════════════════╗
║              🎵 MAP2 AUDIO PLATFORM v2.0                      ║
║                    Initializing...                            ║
╚═══════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────┐
│ DEPLOYMENT MODE                                             │
├─────────────────────────────────────────────────────────────┤
│ Type:             MODE A (ALL-IN-ONE)                        │
│ This Node:        CONTROL-NODE-A1B2 (CONTROL)              │
│ System ID:        a1b2c3d4e5f6g7h8...                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ CLUSTER INFORMATION                                         │
├─────────────────────────────────────────────────────────────┤
│ Total Nodes:      3                                          │
│ Audio Nodes:      1                                          │
│ Control Nodes:    2                                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ PEER NODES                                                  │
├─────────────────────────────────────────────────────────────┤
│ 🎵 AUDIO-NODE-9F4E               ✓ Online   (192.168.1.50) │
│ ⚙️  CONTROL-NODE-2D7K             ✓ Online   (192.168.1.51) │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ STATUS                                                      │
├─────────────────────────────────────────────────────────────┤
│ ✓ SSH Trust:      Verified                                  │
│ ✓ Network:        Connected (192.168.1.100)                 │
│ ✓ Audio Engine:   Running (if AUDIO-NODE)                   │
│ ⏳ Services:       Initializing (3/5 started)                │
└─────────────────────────────────────────────────────────────┘

[Press any key to continue]
```

### Data Sources

| Field | Source | Refresh |
|-------|--------|---------|
| **Deployment Mode** | `~/.map2/deployment.json` | Load once |
| **This Node** | `config.node_label` | Load once |
| **Cluster Peers** | mDNS discovery + cached | On boot |
| **Peer Status** | SSH health check | On boot |
| **Services Status** | Systemd/process monitor | Continuous |

### Implementation Requirements

1. **Bold Deployment Mode Display** - Make MODE A/B/C very clear
2. **Node Identity Format** - Always show `AUDIO-NODE-<ID4>` or `CONTROL-NODE-<ID4>`
3. **Peer Discovery** - Discover and display all peers on the network
4. **Status Indicators** - Show connectivity status for each peer
5. **Cluster Metadata** - Count nodes by type
6. **Service Initialization Progress** - Show which services are starting

### Files to Create/Modify

- `tui/screens/boot_splash_screen.py` - Main splash implementation
- `tui/widgets/cluster_info_widget.py` - Cluster info panel
- `app/utils/node_identity.py` - Node label generation
- `app/services/cluster_discovery.py` - Peer discovery cache

---

## Audio Node Management (Control Node Feature)

**Goal:** Allow control nodes to manage AUDIO-NODEs with zero load on audio nodes.

### Architecture

```
CONTROL-NODE
├─ Management API (Port 8080)
│  ├─ GET /api/audio-nodes
│  ├─ GET /api/audio-nodes/{node_id}/health
│  ├─ POST /api/audio-nodes/{node_id}/reboot
│  └─ POST /api/audio-nodes/{node_id}/shutdown
│
└─ SSH Trust (mm user)
   └─ Execute remote commands on AUDIO-NODEs
      (no agent/daemon needed)

AUDIO-NODE
├─ Health Status Endpoint (existing)
│  └─ GET /api/health → CPU, XRUNs, audio status
│
└─ Shutdown Script (existing)
   └─ /opt/map2/scripts/shutdown.sh (or systemd)
```

### Management Operations

#### 1. Health Check (On-Demand)

**Lightweight HTTP GET** to existing health endpoint:

```bash
curl -s http://AUDIO-NODE-<ID4>:8080/api/health
```

**Response:**
```json
{
  "status": "healthy",
  "audio_running": true,
  "cpu_percent": 24.5,
  "xrun_count": 0,
  "latency_ms": 5.2,
  "uptime_seconds": 86400,
  "memory_mb": 450
}
```

#### 2. Remote Reboot (Via SSH)

**No agent required** - leverage systemd:

```bash
ssh -i ~/.ssh/map2_key mm@AUDIO-NODE-<ID4> \
  "sudo systemctl reboot"
```

**Safeguards:**
- Confirmation dialog with 10-second countdown
- Check audio is stopped before reboot
- Log action with timestamp and initiator

#### 3. Remote Shutdown (Via SSH)

```bash
ssh -i ~/.ssh/map2_key mm@AUDIO-NODE-<ID4> \
  "sudo /opt/map2/scripts/shutdown.sh"
```

Or invoke existing shutdown script path.

### Control Node UI Elements

#### TUI Panel: Audio Node Management

```
┌─────────────────────────────────────────────────────────────┐
│ AUDIO NODE MANAGEMENT                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 🎵 AUDIO-NODE-9F4E (192.168.1.50)                          │
│    Status: ✓ Online                                         │
│    CPU:    24.5%  [████░░░░░] uptime: 1d 3h               │
│    XRUNs:  0                                                │
│    Audio:  ✓ Running                                        │
│    Latency: 5.2ms                                           │
│                                                             │
│    [View Logs]  [Reboot]  [Shutdown]  [Monitor]            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Web UI: Audio Node Dashboard

- Grid/list view of all AUDIO-NODEs
- Real-time health status (refresh every 5-10s)
- CPU/Memory/XRUN graphs
- Quick action buttons (Reboot, Shutdown)
- Action history/log

### Non-Goals (Keep Zero Load)

- ❌ No agent installed on AUDIO-NODEs
- ❌ No continuous telemetry to CONTROL-NODE
- ❌ No heartbeat daemon on AUDIO-NODEs
- ❌ No streaming of audio/metrics to CONTROL-NODE
- ✅ On-demand queries only via HTTP/SSH
- ✅ Polling disabled by default (manual refresh)

### Metrics Success Criteria

- Health check adds **<0.5% CPU** on AUDIO-NODE
- Remote reboot/shutdown completes in **<30 seconds**
- TUI/Web UI updates health **every 10 seconds** (when open)
- Zero resident processes spawned on AUDIO-NODE
- SSH key-based auth (passwordless, no polling)

### Implementation Files

- `app/services/audio_node_manager.py` - Management service
- `tui/screens/audio_node_management_screen.py` - TUI panel
- `web/src/app/pages/AudioNodeDashboard.tsx` - Web dashboard
- `app/routes/audio_nodes.py` - REST API endpoints
- `app/utils/ssh_executor.py` - SSH command executor

---

## Integration with Deployment Plan

**Phase 2 Additions:**
- Boot splash with cluster info (NEW)
- TUI peer discovery widget (NEW)
- Cluster information display (NEW)

**Phase 4 Additions:**
- Audio node health management (NEW)
- Remote reboot/shutdown via SSH (NEW)
- Control node management UI (TUI + Web) (NEW)

**Success Metrics:**
- Boot splash displays all required info correctly
- Audio node health checks add <0.5% CPU
- Remote management works without agents
- All operations logged and auditable

---

**Status:** ✅ Specification Complete

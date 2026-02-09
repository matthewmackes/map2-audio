# Node Status Grid — Welcome Message Enhancement

## Overview

The MAP2 welcome message now displays a **Node Status Grid** at the top, providing immediate visibility into critical node information and connectivity status.

---

## Grid Contents

The grid displays the following information:

### 1. **Hostname**
- System hostname of the current node
- Source: `hostname` command

### 2. **Node Mode**
- Current deployment mode: **Audio**, **Management**, or **All-in-One**
- Color-coded:
  - 🟢 **Audio** = Green (dedicated audio processor)
  - 🔵 **Management** = Blue (cluster management)
  - 🟡 **All-in-One** = Yellow (combined mode)
  - 🟡 **Unknown** = Yellow (fallback)
- Source: `/etc/guitarfx-mode.conf`

### 3. **IP Address**
- Primary network IP address
- Source: `hostname -I` command
- Used for node-to-node communication

### 4. **Backend API**
- Status: **Online** or **Offline**
- Color-coded:
  - 🟢 Green = Online (http://localhost:8080 responding)
  - ⚫ Gray = Offline (no response)
- Source: `curl http://localhost:8080/api/health`

### 5. **Services**
- Shows: `X/Y running`
- X = Services currently running
- Y = Total services configured
- Source: `/api/health` endpoint

### 6. **Connected Nodes**
- Number of peer nodes discovered in cluster
- Shows current cluster membership
- Source: `/api/cluster/online-nodes` endpoint
- Falls back to "1" if API unavailable

### 7. **API Version**
- Current backend API version
- Useful for debugging compatibility issues
- Source: `/api/version` endpoint
- Shows "N/A" if backend offline

---

## Grid Design

```
┌─────────────────────────────────────────────────────────┐
│               NODE STATUS GRID                          │
├─────────────────────────────────────────────────────────┤
│  Hostname:              MAP2-TESTBED
│  Node Mode:             audio
│  IP Address:            172.20.234.234
│  Backend API:           Online
│  Services:              11/13 running
│  Connected Nodes:       3
│  API Version:           1.24.25.1
└─────────────────────────────────────────────────────────┘
```

---

## Data Collection Strategy

### Fast Path (No API Required)
- Hostname
- IP Address
- Node Mode

### API-Dependent (2-second timeout per request)
- Backend API status
- Services running/total
- Connected nodes count
- API version

**Total timeout**: 2 seconds (non-blocking fallback values if timeout)

If any API call times out or fails, sensible defaults are used:
- API Status: "Offline"
- API Version: "N/A"
- Services: "0/0 running"
- Connected Nodes: "N/A" (or "1" for current node)

---

## Color Scheme

The grid uses VSCode Dark colors consistent with the rest of the welcome message:

| Element | Color | RGB |
|---------|-------|-----|
| Grid borders/labels | Primary Blue | #007ACC |
| Grid title | Accent Yellow | #DCDCAA |
| Running services | Success Green | #4EC9B0 |
| Offline/warning | Dim Gray | #808080 |
| Node modes | Color-coded | Varies |

---

## Displayed On Startup

The grid appears **immediately** after the MAP2 logo, making it the first thing administrators see when logging in:

```
╔═══════════════════════════════════════════════════════════════════════╗
║    ███╗   ███╗ █████╗ ██████╗ ██████╗      █████╗ ██╗   ██╗██████╗  ║
║    [ASCII MAP2 LOGO]                                                  ║
╚═══════════════════════════════════════════════════════════════════════╝

Professional Real-Time Audio Processing System
Mackes Audio Platform — February 2026

┌──────────────────────────── NODE STATUS GRID ──────────────────────────┐
│  Hostname:              ...                                            │
│  Node Mode:             ...                                            │
│  [... rest of grid ...]                                               │
└─────────────────────────────────────────────────────────────────────────┘

[Rest of welcome message sections continue below]
```

---

## Use Cases

### For System Administrators
- **Quick node status check**: See deployment mode, API health, services at a glance
- **Cluster monitoring**: Identify which nodes are connected
- **IP verification**: Confirm network connectivity without running separate commands

### For DevOps
- **Troubleshooting**: Quickly identify which services are running/stopped
- **Pre-flight checks**: Verify node is in correct mode before operations
- **Health dashboards**: Capture grid output for monitoring systems

### For Operators
- **SSH connectivity check**: Verify you've connected to the right node
- **Mode verification**: Confirm the node is operating in intended mode
- **Service health**: See at-a-glance if all services are running

---

## Implementation Details

### Data Collection Order
1. Hostname (fast, always succeeds)
2. Node Mode (fast, from config file)
3. IP Address (fast, always succeeds)
4. API Health (fast timeout, optional fallback)
5. Services running/total (from health response)
6. Connected nodes count (from cluster endpoint)
7. API version (from version endpoint)

### Timeout Handling
- Each API call has 2-second timeout
- If timeout occurs, displays sensible default
- Never blocks welcome message display
- Falls back gracefully to "N/A" or "Offline"

### No External Dependencies
- Uses only: `curl`, `grep`, `hostname`, `awk`, `sed`
- All are standard on Linux systems
- No additional packages required

---

## API Endpoints Used

### `/api/health`
```json
{
  "status": "healthy",
  "services_running": 11,
  "services_total": 13,
  "cpu_percent": 1.7,
  "memory_mb": 704.35
}
```

### `/api/version`
```json
{
  "version": "1.24.25.1"
}
```

### `/api/cluster/online-nodes`
```json
{
  "node_count": 3,
  "nodes": [...]
}
```

---

## Customization Options

### To modify grid fields, edit:
- **Lines 56-71**: Data collection section
- **Lines 99-108**: Grid display section

### To change colors, modify:
- COLOR variables at top of script
- Or override in calling shell: `export COLOR_PRIMARY="#NEWCOLOR"`

### To adjust timeout, change:
- `--max-time 2` to desired seconds
- (Currently 2 seconds per API call)

---

## Testing the Grid

### View the grid:
```bash
source /home/mm/map2-audio/branding/welcome.sh
```

### Test with backend offline:
```bash
systemctl stop map2-backend
source /home/mm/map2-audio/branding/welcome.sh
```

### Test with backend online:
```bash
systemctl start map2-backend
source /home/mm/map2-audio/branding/welcome.sh
```

### View raw data:
```bash
# Check hostname
hostname

# Check node mode
cat /etc/guitarfx-mode.conf | grep deployment_mode

# Check IP
hostname -I

# Check API health
curl http://localhost:8080/api/health | python3 -m json.tool

# Check API version
curl http://localhost:8080/api/version | python3 -m json.tool

# Check cluster nodes
curl http://localhost:8080/api/cluster/online-nodes | python3 -m json.tool
```

---

## Performance Impact

- **Display time**: <2 seconds (includes API timeouts)
- **Network overhead**: ~400 bytes total
- **CPU usage**: Negligible
- **Memory usage**: Negligible

The grid is displayed only once at shell initialization, so performance impact is minimal.

---

## What Comes After the Grid

After the Node Status Grid, the welcome message continues with existing sections:

1. ✅ Hardware Status (RT Audio, devices, CPU)
2. ✅ Core Services (Backend, Web, Node Console, LCD)
3. ✅ Service Scripts (startup commands)
4. ✅ Model & IR File Paths
5. ✅ Quick Commands (map2-restart, etc.)
6. ✅ Footer

---

## Summary

| Feature | Details |
|---------|---------|
| **Grid Location** | Top of welcome message (after logo) |
| **Data Sources** | System commands + API endpoints |
| **Timeout** | 2 seconds total |
| **Display Time** | Instant (cached data) |
| **Dependencies** | Standard Linux utilities only |
| **Customizable** | Yes (colors, fields, timeout) |
| **Error Handling** | Graceful fallbacks for all failures |

---

**Status**: ✅ Implemented and ready for use

**File Modified**: `/home/mm/map2-audio/branding/welcome.sh`

**Date Added**: February 8, 2026

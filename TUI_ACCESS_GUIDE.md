# MAP2 LCD System - TUI (Terminal User Interface) Access Guide

## Overview

The MAP2 LCD Event System includes a comprehensive Terminal User Interface (TUI) for monitoring and controlling LCD displays, viewing real-time events, and managing the distributed audio platform from the command line.

## TUI Components

### 1. **Main LCD Control Screen** (`/api/tui/lcd`)
- Real-time LCD display simulation (4x20 character)
- Page navigation controls
- Display content editor
- Hardware test interface

### 2. **Event Monitor** (`/api/tui/events`)
- Real-time event stream viewer
- Event filtering by type/severity
- Event statistics
- Auto-refresh view

### 3. **Node Status Dashboard** (`/api/tui/nodes`)
- Connected peer status
- Network latency display
- Cluster health overview
- Node identity information

### 4. **System Status Screen** (`/api/tui/status`)
- CPU/Memory usage
- Disk space
- Uptime tracking
- Component health status

## Accessing the TUI

### Option 1: Using the Terminal TUI Launcher (Recommended)

```bash
# Start the main TUI application
cd /home/mm/map2-audio
./tui.sh

# This launches an interactive menu system with:
# ├─ LCD Display Control
# ├─ Event Monitoring
# ├─ Node Management
# ├─ System Status
# └─ Configuration Tools
```

### Option 2: Direct Terminal UI Access

```bash
# Start MAP2 service first
sudo systemctl start map2-lcd

# In another terminal, start the TUI
./scripts/tui-lcd-monitor.sh

# Or use Python directly
python -m app.tui.main
```

### Option 3: Web-Based Terminal UI

Access from any browser:

```
http://localhost:8000/tui
```

This provides a web-based terminal emulator with the same TUI experience.

## TUI Navigation Guide

### Main Menu

```
╔════════════════════════════════════════════════════════════════════════════╗
║                    MAP2 AUDIO PLATFORM - LCD CONTROL                       ║
║                       Terminal User Interface (TUI)                        ║
╚════════════════════════════════════════════════════════════════════════════╝

┌─ Main Menu ─────────────────────────────────────────────────────────────────┐
│                                                                             │
│  1. 📺 LCD Display Control      - Manage LCD screens, pages, display text  │
│  2. 📊 Event Monitor            - Real-time event stream and statistics    │
│  3. 🌐 Node Management          - View cluster nodes, connectivity         │
│  4. 📈 System Status            - CPU, memory, disk, uptime                │
│  5. ⚙️  Configuration            - Settings, thresholds, preferences       │
│  6. 🔧 Hardware Test            - LCD, serial, I2C diagnostics            │
│  7. 📝 Event History            - View historical events (24h)             │
│  8. 🎯 Quick Actions            - Shortcuts to common tasks               │
│  9. ❌ Exit                      - Close TUI                               │
│                                                                             │
│  Navigate: ↑↓ arrows or 1-9 keys                                          │
│  Select: Enter or Space                                                   │
│  Back: B or Esc                                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1. LCD Display Control Screen

```
╔════════════════════════════════════════════════════════════════════════════╗
║                          LCD DISPLAY CONTROL                               ║
╚════════════════════════════════════════════════════════════════════════════╝

LCD 1 (I2C 0x27)                    LCD 2 (Serial /dev/ttyUSB0)
┌────────────────────┐              ┌────────────────────┐
│ Status: Connected  │              │ Status: Offline    │
│                    │              │                    │
│ Map2 Audio Ctrlr   │              │                    │
│ Page: 1 / Status   │              │                    │
│                    │              │                    │
└────────────────────┘              └────────────────────┘

[◀ Prev Page] [Next Page ▶] [Refresh] [Test] [Config]

Current Page: Status
Line 1: Map2 Audio Controller
Line 2: Page 1 / Status
Line 3: CPU: 24% MEM: 42%
Line 4: Peers: 2 Events: 145

Available Pages:
├─ Status      - System status
├─ VU Meter    - Audio level display
├─ Chain Info  - Current chain
├─ Plugins     - Loaded plugins
├─ MIDI        - MIDI activity
├─ Perf        - Performance
├─ Settings    - Configuration
└─ Menu        - Main menu

Quick Actions:
  P - Previous Page      N - Next Page      R - Refresh Display
  E - Edit Text          T - Test LCD       S - Setup I2C       B - Back
```

### 2. Event Monitor Screen

```
╔════════════════════════════════════════════════════════════════════════════╗
║                           EVENT MONITOR (LIVE)                             ║
╚════════════════════════════════════════════════════════════════════════════╝

Filter: [All Types ▼] [All Nodes ▼] [All Severity ▼]  Search: ___________

Timestamp            │ Severity │ Type        │ Source Node      │ Title
─────────────────────┼──────────┼─────────────┼──────────────────┼──────────────
12:45:32.123        │ INFO     │ PLUGIN      │ AUDIO-NODE-A1B2  │ Nolly Loaded
12:45:30.456        │ WARNING  │ NETWORK     │ CONTROL-NODE-1   │ Peer Offline
12:45:28.789        │ INFO     │ SYSTEM      │ AUDIO-NODE-A1B2  │ Chain Selected
12:45:25.012        │ ERROR    │ HARDWARE    │ AUDIO-NODE-X9Y8  │ LCD Timeout
12:45:20.345        │ INFO     │ AUDIO       │ AUDIO-NODE-A1B2  │ CPU > 80%

[Scroll: ↑↓] [Page: < >] [Pause] [Clear] [Export] [Back]

Status Bar:
Events: 1,247 | Queue: 47 | Producers: 5 | Last 1m: 23 events | Refresh: 100ms

Statistics Panel (Right side):
Type Distribution:
  PLUGIN    ████████ 35%
  SYSTEM    ████     17%
  AUDIO     ████     16%
  NETWORK   ██       11%
  OTHER     ██       21%

Severity Distribution:
  INFO      ██████████ 70%
  WARNING   ███        15%
  ERROR     ██         10%
  CRITICAL  █          5%
```

### 3. Node Management Screen

```
╔════════════════════════════════════════════════════════════════════════════╗
║                       NODE MANAGEMENT - CLUSTER VIEW                        ║
╚════════════════════════════════════════════════════════════════════════════╝

Cluster Status: HEALTHY (3 nodes, all connected)

Local Node: AUDIO-NODE-A1B2
├─ Status: RUNNING
├─ Uptime: 2d 14h 23m
├─ Mode: AUDIO-NODE
├─ IP: 192.168.1.100:8000
└─ SSH Fingerprint: SHA256:abc123...

Connected Peers:

[●] CONTROL-NODE-C3D4
    ├─ Status: Connected
    ├─ Latency: 2.3ms
    ├─ Queued Events: 0
    ├─ IP: 192.168.1.101:8000
    ├─ Last Sync: 100ms ago
    └─ SSH: Trusted

[●] AUDIO-NODE-X9Y8
    ├─ Status: Connected
    ├─ Latency: 1.8ms
    ├─ Queued Events: 0
    ├─ IP: 192.168.1.102:8000
    ├─ Last Sync: 50ms ago
    └─ SSH: Trusted

[○] (1 discoverable node not yet connected)

Actions: [Connect] [Disconnect] [Trust] [Untrust] [Ping] [Stats] [Back]
```

### 4. System Status Screen

```
╔════════════════════════════════════════════════════════════════════════════╗
║                           SYSTEM STATUS                                    ║
╚════════════════════════════════════════════════════════════════════════════╝

Performance Metrics:
  CPU Usage:     24% ████░░░░░░░░░░░░░░░ (6/8 cores)
  Memory:        42% ████████░░░░░░░░░░░░ (3.2GB / 8GB)
  Disk (/):      67% █████████████░░░░░░ (134GB / 200GB)
  Disk (/data):  45% █████████░░░░░░░░░░ (450GB / 1TB)

System Information:
  Hostname:      audio-node-1.local
  OS:            Fedora 42
  Kernel:        6.8.0-rt (Real-time)
  Uptime:        2 days, 14 hours, 23 minutes
  Load Average:  2.1, 2.3, 2.0

Process Information:
  MAP2 PID:      12547
  Memory (RSS):  245MB
  Threads:       32
  Open Files:    156

Network:
  Ethernet:      Connected (1Gbps)
  mDNS:          _map2-node._tcp (discoverable)
  WebSocket:     1 active connection
  Peers:         3 connected, 0 disconnected

Database:
  Status:        Connected
  Size:          245MB
  Events:        12,547
  Age:           24h history

Recent Alerts (last 4):
  ✓ 12:45:00 - System boot complete
  ⚠ 12:34:00 - Disk usage > 60%
  ✓ 10:23:00 - LCD display online
  ✓ 08:15:00 - All peers connected

[Refresh] [Thresholds] [Logs] [Back]
```

### 5. Event History Screen

```
╔════════════════════════════════════════════════════════════════════════════╗
║                          EVENT HISTORY (24h)                               ║
╚════════════════════════════════════════════════════════════════════════════╝

Time Range: Last 24 hours | [Yesterday] [Today]

Hourly Event Count:
00:00 ██░░░░░░░░ 15
01:00 ████░░░░░░ 32
02:00 ███░░░░░░░ 28
...
23:00 ██████░░░░ 52

Export Options:
  [CSV] [JSON] [PDF] [Print]

Search / Filter:
  Type: [All ▼]  Severity: [All ▼]  Source: [All ▼]  Search: __________

Events (showing 10 of 247 from 24h):
14 Feb 23:45 │ PLUGIN   │ INFO     │ AUDIO-NODE-A1B2  │ Plugin Unloaded
14 Feb 20:12 │ SYSTEM   │ WARNING  │ CONTROL-NODE-1   │ High Memory Usage
14 Feb 16:34 │ AUDIO    │ INFO     │ AUDIO-NODE-A1B2  │ Latency Check OK
...

[◀ Older] [Newer ▶] [Full Export] [Back]
```

## Keyboard Shortcuts

### Navigation
- `↑` / `↓` - Move up/down
- `←` / `→` - Navigate menus
- `Page Up` / `Page Down` - Scroll faster
- `Home` / `End` - Jump to start/end
- `q` / `Esc` / `B` - Go back / Exit current view

### Actions
- `Enter` / `Space` - Select item
- `R` - Refresh/Reload
- `P` - Pause auto-refresh
- `S` - Search/Filter
- `C` - Copy selection
- `X` - Expand/Collapse
- `?` - Help

### LCD Control
- `1-8` - Jump to LCD page
- `N` - Next page
- `P` - Previous page
- `E` - Edit display text
- `T` - Test display
- `H` - Hardware test

## Launching TUI Programmatically

### Using the TUI Script

```bash
# Launch with specific screen
./tui.sh --screen=lcd-control
./tui.sh --screen=events
./tui.sh --screen=nodes
./tui.sh --screen=status

# With options
./tui.sh --refresh=500ms --theme=dark
./tui.sh --node-id=AUDIO-NODE-A1B2 --auto-fullscreen
```

### Using Python API

```python
from app.tui.lcd_control import LCDControlScreen
from app.tui.event_monitor import EventMonitorScreen
from app.tui.node_manager import NodeManagerScreen

# Launch LCD control screen
screen = LCDControlScreen()
screen.run()

# Or launch event monitor
monitor = EventMonitorScreen()
monitor.run()
```

### Using Docker

```bash
# Run TUI in container
docker-compose -f docker-compose.lcd.yml exec map2-audio-1 python -m app.tui.main

# Or with interactive terminal
docker-compose -f docker-compose.lcd.yml run -it map2-audio-1 bash
# Then: ./tui.sh
```

## Real-World TUI Workflows

### Workflow 1: Monitoring LCD Display in Real-Time

1. Start TUI: `./tui.sh`
2. Select "LCD Display Control"
3. Watch 4x20 character display update in real-time
4. Switch pages using arrow keys or N/P
5. Observe what shows on the physical hardware

### Workflow 2: Troubleshooting Event Issues

1. Start TUI: `./tui.sh`
2. Select "Event Monitor"
3. Filter by type/severity to find issues
4. Click event for details
5. Check source node for problems
6. Go to "Node Management" to verify connectivity

### Workflow 3: Cluster Health Check

1. Start TUI: `./tui.sh`
2. Select "System Status" for local health
3. Select "Node Management" for peer status
4. Verify all nodes are connected
5. Check latencies and event queues
6. Export status report for documentation

### Workflow 4: Performance Analysis

1. Start TUI: `./tui.sh`
2. Go to "System Status" and note baselines
3. Perform actions on the audio platform
4. Watch CPU/memory/latency in real-time
5. View "Event History" for correlation
6. Export metrics for analysis

## Remote TUI Access

### Via SSH

```bash
# Connect to remote audio node
ssh user@audio-node.local

# Start TUI on remote
./tui.sh

# Or via X11 forwarding (if available)
ssh -X user@audio-node.local ./tui.sh
```

### Via Web Browser (Terminal Emulator)

```bash
# Access from any browser
open http://audio-node.local:8000/tui

# Works on mobile and desktop
# Real-time updates via WebSocket
# No special software needed
```

### Via Bastion Host

```bash
# Through jump host
ssh -J user@bastion user@audio-node ./tui.sh

# Or with tunneling
ssh -L 8000:audio-node:8000 user@bastion
open http://localhost:8000/tui
```

## TUI Configuration

Create `~/.map2/tui.conf` to customize:

```ini
[display]
theme=dark
colors=true
unicode=true
refresh_ms=250

[lcd]
mock_device=false
port=/dev/ttyUSB0
i2c_addr=0x27

[events]
auto_scroll=true
max_history=1000
filter_debug=false

[network]
show_latency=true
peer_timeout=10000
discovery_enabled=true

[keyboard]
vim_keys=false
mouse_enabled=true
```

## Troubleshooting

### TUI Won't Start

```bash
# Check if service is running
sudo systemctl status map2-lcd

# Start service
sudo systemctl start map2-lcd

# Check logs
sudo journalctl -u map2-lcd -n 50

# Try with debug output
python -m app.tui.main --debug
```

### No Events Showing

```bash
# Verify event producers are active
curl http://localhost:8000/api/lcd/stats

# Check WebSocket connection
wscat -c ws://localhost:8000/api/lcd/ws/events

# Verify database has events
sqlite3 /var/lib/map2/map2.db "SELECT COUNT(*) FROM lcd_events"
```

### LCD Display Not Updating

```bash
# Test LCD connection
./scripts/test-lcd-hardware.sh /dev/ttyUSB0

# Check I2C bus
i2cdetect -y 1

# View LCD debug logs
sudo journalctl -u map2-lcd | grep "LCD"
```

## Next Steps

- Customize LCD pages in `/etc/map2/lcd.conf`
- Set up persistent event monitoring
- Configure alerting for critical events
- Export metrics for centralized monitoring
- Integrate with your workflow

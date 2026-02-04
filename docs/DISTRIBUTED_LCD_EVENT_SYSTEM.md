# 🖥️ Distributed LCD Management & Event System

## Overview

**Each node has one LCD display.** LCDs can display events from:
1. **Local node** (this machine's audio engine, services, status)
2. **Remote nodes** (other nodes' events broadcasted to all)

**Events travel between nodes** via WebSocket, allowing distributed monitoring and control across the entire cluster.

---

## Architecture

### LCD Event Flow

```
┌──────────────────────────┐     ┌──────────────────────────┐
│  AUDIO-NODE-9F4E         │     │  CONTROL-NODE-2D7K       │
│  ┌────────────────────┐  │     │  ┌────────────────────┐  │
│  │  Local Events      │  │     │  │  Local Events      │  │
│  │  • Audio running   │  │     │  │  • API requests    │  │
│  │  • CPU/XRUNs       │  │     │  │  • DB queries      │  │
│  │  • Plugin status   │  │     │  │  • Service status  │  │
│  └────────────────────┘  │     │  └────────────────────┘  │
│           │              │     │           │              │
│           ▼              │     │           ▼              │
│  ┌────────────────────┐  │     │  ┌────────────────────┐  │
│  │ LCD Event Bus      │  │     │  │ LCD Event Bus      │  │
│  └────────────────────┘  │     │  └────────────────────┘  │
│           │              │     │           │              │
│           │ (WebSocket)  │     │           │ (WebSocket)  │
│           └──────────────┼─────┼───────────┘              │
│                          │     │                          │
│              ┌───────────▼─────▼────────────┐             │
│              │   Cluster Event Router       │             │
│              │   (mDNS broadcast)           │             │
│              └───────────┬─────┬────────────┘             │
│                          │     │                          │
│           ┌──────────────▼─┐ ┌─▼──────────────┐          │
│           │ Remote Events  │ │ Remote Events  │          │
│           │ from other     │ │ from other     │          │
│           │ nodes          │ │ nodes          │          │
│           └────────────────┘ └────────────────┘          │
│           ┌──────────────────────────────────────┐       │
│           │  LCD Display                         │       │
│           │  ┌────────────────────────────────┐  │       │
│           │  │ [LOCAL] Audio: Running         │  │       │
│           │  │ [REMOTE] CONTROL-2D7K: CPU 45% │  │       │
│           │  │ [LOCAL] XRUNs: 0               │  │       │
│           │  │ [REMOTE] AUDIO-9F4E: Healthy   │  │       │
│           │  └────────────────────────────────┘  │       │
│           └──────────────────────────────────────┘       │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## LCD Event System

### Event Types

| Category | Source | Examples |
|----------|--------|----------|
| **Audio Engine** | Local/Remote | Audio running, XRUNs, plugin status, latency, CPU |
| **System Health** | Local/Remote | CPU %, memory %, temperature, uptime |
| **Network** | Local/Remote | Connection status, latency, bandwidth |
| **Services** | Local/Remote | API up/down, database status, discovery status |
| **User Actions** | Local/Remote | Preset loaded, plugin added, mode changed |
| **Alerts** | Local/Remote | Errors, warnings, xrun alerts |

### Event Data Structure

```python
@dataclass
class LCDEvent:
    """Distributed LCD event"""
    
    # Core identifiers
    event_id: str                  # Unique ID (UUID)
    timestamp: datetime            # When event occurred
    source_node: str               # AUDIO-NODE-<ID4> or CONTROL-NODE-<ID4>
    event_type: str                # "audio", "system", "network", etc.
    severity: str                  # "info", "warning", "error", "critical"
    
    # Display content
    title: str                     # Short title for LCD (max 40 chars)
    message: str                   # Full message (max 200 chars)
    icon: str                      # ASCII icon (🎵, ⚙️, ⚠️, ✓, etc.)
    
    # Routing
    broadcast: bool                # Send to all nodes?
    target_nodes: List[str]        # Specific nodes to send to (empty = all)
    ttl: int                       # Time-to-live (seconds)
    
    # UI hints
    color: str                     # "green", "yellow", "red" for LCD highlight
    sound: bool                    # Play alert sound?
    dismiss_auto: bool             # Auto-dismiss after 5 seconds?
    
    # Metadata
    context: Dict[str, Any]        # Extra data (values for substitution, etc.)
```

### Event Examples

```python
# Local audio event
LCDEvent(
    event_id="uuid-123",
    timestamp=datetime.now(),
    source_node="AUDIO-NODE-9F4E",
    event_type="audio",
    severity="info",
    title="Audio Running",
    message="Audio engine started. Latency: 5.2ms",
    icon="🎵",
    broadcast=True,  # Tell other nodes
    ttl=300,  # Keep for 5 minutes
    color="green",
    dismiss_auto=True,
)

# Remote control node event
LCDEvent(
    event_id="uuid-456",
    timestamp=datetime.now(),
    source_node="CONTROL-NODE-2D7K",
    event_type="system",
    severity="warning",
    title="High CPU",
    message="API server CPU: 75%",
    icon="⚠️",
    broadcast=True,
    ttl=60,  # 1 minute
    color="yellow",
    dismiss_auto=False,
)

# Critical error
LCDEvent(
    event_id="uuid-789",
    timestamp=datetime.now(),
    source_node="AUDIO-NODE-9F4E",
    event_type="audio",
    severity="critical",
    title="AUDIO DROPOUT",
    message="XRUNs detected: 3 dropouts",
    icon="❌",
    broadcast=True,
    ttl=600,  # 10 minutes (persist)
    color="red",
    sound=True,
    dismiss_auto=False,
)
```

---

## LCD Display Hardware

### Physical Display

```
┌──────────────────────────────┐
│  MAP2 AUDIO PLATFORM         │  ← Header (node type & ID)
├──────────────────────────────┤
│  [LOCAL]  🎵 Audio Running   │  ← Event source + title
│  CPU: 24%  Latency: 5.2ms    │  ← Contextual data
│                              │
│  [REMOTE] ⚙️  CONTROL-2D7K    │  ← Remote event
│  API: 150 req/s (45% CPU)    │
│                              │
│  [ERROR]  ❌ XRUN ALERT       │  ← Highlighted error
│  3 audio dropouts detected   │
│                              │
│  [PRESS M] Menu [<] [>] Nav  │  ← Footer (controls)
└──────────────────────────────┘
```

**Display Capabilities:**
- 4x20 or 2x16 character LCD (standard)
- Scrolling support for longer messages
- Icon support (custom characters)
- Backlight control (brightness)
- Button input (menu, navigation)

### Driver Integration

```python
class LCDDisplay:
    """LCD hardware interface"""
    
    def __init__(self, port: str = "/dev/ttyUSB0", baud: int = 9600):
        self.serial = serial.Serial(port, baud, timeout=1)
        self.line_width = 20
        self.line_height = 4
        
    async def write_line(self, line: int, text: str):
        """Write text to LCD line"""
        text = text[:self.line_width].ljust(self.line_width)
        self.serial.write(f"L{line}:{text}\n".encode())
        
    async def clear(self):
        """Clear LCD display"""
        self.serial.write(b"CLEAR\n")
        
    async def set_backlight(self, brightness: int):
        """Set backlight 0-100%"""
        self.serial.write(f"BL:{brightness}\n".encode())
        
    async def play_sound(self, frequency: int = 1000, duration_ms: int = 100):
        """Play alert sound"""
        self.serial.write(f"SND:{frequency}:{duration_ms}\n".encode())
```

---

## LCD Event Bus & Routing

### Local Event Bus

Each node has a **local event bus** that collects events and distributes them to:
1. Local LCD display
2. Remote nodes (via WebSocket)
3. Web UI (real-time updates)
4. TUI dashboard

```python
class LCDEventBus:
    """Local event collection and distribution"""
    
    def __init__(self, node_id: str):
        self.node_id = node_id
        self.event_queue: asyncio.Queue = asyncio.Queue()
        self.subscribers: List[Callable] = []
        self.event_history: Deque = Deque(maxlen=100)  # Keep last 100
        
    async def publish(self, event: LCDEvent):
        """Publish event locally and to remote nodes"""
        # Store in history
        self.event_history.append(event)
        
        # Notify local subscribers (LCD, Web UI, TUI)
        for subscriber in self.subscribers:
            await subscriber(event)
            
        # Broadcast to remote nodes
        if event.broadcast:
            await self.broadcast_to_cluster(event)
            
    async def broadcast_to_cluster(self, event: LCDEvent):
        """Send event to all other nodes"""
        # Via mDNS discovery, find all peers
        peers = await self.discover_peers()
        for peer in peers:
            if peer.node_id != self.node_id:
                await self.send_to_peer(peer, event)
                
    async def subscribe(self, handler: Callable):
        """Subscribe to all events"""
        self.subscribers.append(handler)
```

### Remote Event Aggregation

Control nodes aggregate events from multiple audio nodes:

```python
class RemoteEventAggregator:
    """Collects events from remote nodes"""
    
    def __init__(self):
        self.remote_events: Dict[str, Deque] = {}  # Per-node event history
        self.listeners: List[Callable] = []
        
    async def receive_remote_event(self, event: LCDEvent):
        """Receive event from remote node"""
        # Store per-node
        if event.source_node not in self.remote_events:
            self.remote_events[event.source_node] = Deque(maxlen=50)
            
        self.remote_events[event.source_node].append(event)
        
        # Notify listeners
        for listener in self.listeners:
            await listener(event)
            
    async def get_all_remote_events(self) -> List[LCDEvent]:
        """Get all remote events sorted by timestamp"""
        all_events = []
        for node_events in self.remote_events.values():
            all_events.extend(node_events)
        return sorted(all_events, key=lambda e: e.timestamp, reverse=True)
```

---

## LCD Menu System (TUI)

### TUI LCD Management Screen

```
╔═══════════════════════════════════════════════════════════════╗
║ LCD MANAGEMENT - AUDIO-NODE-9F4E                             ║
╚═══════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────┐
│ LIVE LCD DISPLAY                                            │
├─────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────┐                              │
│ │ MAP2 AUDIO PLATFORM        │                              │
│ ├────────────────────────────┤                              │
│ │ [LOCAL]  🎵 Audio Running  │                              │
│ │ CPU: 24%  Latency: 5.2ms   │                              │
│ │                            │                              │
│ │ [REMOTE] ⚙️  CONTROL-2D7K   │                              │
│ │ API: 150 req/s             │                              │
│ └────────────────────────────┘                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ EVENT QUEUE (Next to display)                               │
├─────────────────────────────────────────────────────────────┤
│ ⏳ [LOCAL]  Audio engine initializing...                     │
│ ✓ [LOCAL]  Plugin loaded: Compression                       │
│ ⚠️  [REMOTE] CONTROL-2D7K: CPU 65%                           │
│ 🎵 [LOCAL]  Preset: "Warm Tone" loaded                       │
│ ✓ [REMOTE] AUDIO-9F4E: All systems nominal                   │
│                                                             │
│ [Page 1/3]                                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ EVENT FILTERS                                               │
├─────────────────────────────────────────────────────────────┤
│ [✓] Local Events      [✓] Audio Events                       │
│ [✓] Remote Events     [✓] System Events                      │
│ [✓] Warnings/Errors   [✓] User Actions                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ ACTIONS                                                     │
├─────────────────────────────────────────────────────────────┤
│ [D] Dismiss All Events    [P] Pause Updates                  │
│ [E] Event History         [F] Filters                        │
│ [B] Backlight Control     [S] Settings                       │
└─────────────────────────────────────────────────────────────┘

Navigation: [←→] Scroll | [↑↓] Pages | [ENTER] Details | [Q] Exit
```

### Key Features

1. **Live LCD Preview** - See exactly what's on the physical LCD
2. **Event Queue** - Shows upcoming events
3. **Event Filters** - Toggle local/remote, by type/severity
4. **Event History** - Browse all recent events
5. **Backlight Control** - Adjust brightness
6. **Manual Event Send** - Test events to other nodes

---

## Web UI: LCD Dashboard

### Real-Time Event Feed

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ MAP2 LCD EVENT DASHBOARD                                   ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┌─ CLUSTER EVENT FEED ────────────────────────────────────────┐
│                                                              │
│  🎵 [LOCAL - AUDIO-NODE-9F4E] 14:23:15                       │
│     Audio Engine Started                                    │
│     Latency: 5.2ms | CPU: 24% | Running                     │
│     [View Details]                                          │
│                                                              │
│  ⚙️  [REMOTE - CONTROL-NODE-2D7K] 14:23:12                   │
│     High API Traffic                                        │
│     150 req/s | CPU: 65% | 450 connections                  │
│     [View Details]                                          │
│                                                              │
│  🎵 [LOCAL - AUDIO-NODE-9F4E] 14:23:08                       │
│     Preset Loaded: "Warm Tone"                              │
│     Compressor + EQ + Reverb                                │
│     [View Details]                                          │
│                                                              │
│  ❌ [REMOTE - AUDIO-NODE-9F4E] 14:22:45 [CRITICAL]          │
│     XRUN ALERT: 3 Audio Dropouts                            │
│     Buffer underrun on output channels                      │
│     [View Details] [Acknowledge]                            │
│                                                              │
│  ✓ [REMOTE - CONTROL-NODE-2D7K] 14:22:30                    │
│     Database Backup Complete                                │
│     15.2 GB backed up in 4.2 minutes                         │
│     [View Details]                                          │
│                                                              │
│  [Load More Events...]                                       │
│                                                              │
└─ (Auto-refreshes) ────────────────────────────────────────┘

┌─ EVENT STATISTICS ──────────────────────────────────────────┐
│                                                              │
│  Total Events (24h):        1,247                            │
│  ├─ Audio Events:           384  (30%)                       │
│  ├─ System Events:          512  (41%)                       │
│  ├─ User Actions:           298  (24%)                       │
│  └─ Alerts/Errors:          53   (5%)                        │
│                                                              │
│  Events by Severity:                                        │
│  ├─ Info:       892  (71%)  ▓▓▓▓▓▓▓▓▓░                       │
│  ├─ Warning:    245  (20%)  ▓▓▓▓░░░░░░                       │
│  ├─ Error:      97   (8%)   ▓░░░░░░░░░                       │
│  └─ Critical:   13   (1%)   ░░░░░░░░░░                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─ NODE DASHBOARD ────────────────────────────────────────────┐
│                                                              │
│  🎵 AUDIO-NODE-9F4E         ⚙️  CONTROL-NODE-2D7K             │
│  Status: ✓ Online            Status: ✓ Online               │
│  Last Event: 14:23:15        Last Event: 14:23:12           │
│  Events (1h): 234            Events (1h): 456               │
│                                                              │
│  [View LCD] [Event History]   [View LCD] [Event History]     │
│  [Send Test Event]           [Send Test Event]               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Features

1. **Real-time Event Stream** - WebSocket updates
2. **Event Filtering** - By node, type, severity, time range
3. **Event Details** - Click to expand full context
4. **Statistics** - Graphs and trends
5. **Per-Node Dashboard** - View each node's LCD/events
6. **Manual Event Injection** - Send test events for debugging

---

## Implementation Tasks

### Phase 1: Core LCD System (Week 1-2)

- [ ] Create `app/services/lcd_event_bus.py` - Local event collection
- [ ] Create `app/services/lcd_event_router.py` - Event routing between nodes
- [ ] Create `app/services/remote_event_aggregator.py` - Remote event collection
- [ ] Implement LCD hardware driver (`app/drivers/lcd_display.py`)
- [ ] Create API endpoints: `/api/lcd/events`, `/api/lcd/send`, `/api/lcd/history`
- [ ] Add event persistence (SQLite: event table)

### Phase 2: TUI LCD Dashboard (Week 2)

- [ ] Create `tui/screens/lcd_management_screen.py`
- [ ] Implement live LCD preview widget
- [ ] Implement event queue display
- [ ] Add event filters and history navigation
- [ ] Add backlight control UI
- [ ] Integrate with existing TUI

### Phase 3: Web UI Dashboard (Week 3)

- [ ] Create `web/src/app/pages/LCDDashboard.tsx`
- [ ] Implement real-time event feed (WebSocket)
- [ ] Add event statistics charts
- [ ] Add per-node event history
- [ ] Implement event details modal
- [ ] Add test event injection UI

### Phase 4: Event Producers (Week 3-4)

- [ ] Audio engine events (audio running, XRUNs, latency)
- [ ] System health events (CPU, memory, temperature)
- [ ] Network status events (connectivity, latency)
- [ ] Service status events (API, database)
- [ ] User action events (preset loaded, plugin added)
- [ ] Alert/error events (with sound)

---

## Success Metrics

- [ ] Events broadcast to all nodes in <500ms
- [ ] LCD display updates within 1 second of event
- [ ] Web UI shows events with <2s latency
- [ ] Support 100+ concurrent events without lag
- [ ] Event history persists for 24+ hours
- [ ] Remote events clearly identified (with node label)
- [ ] Critical alerts trigger backlight + sound
- [ ] No event loss or duplication
- [ ] TUI/Web UI show same events in sync

---

**Status:** ✅ Specification Complete - Ready for Implementation

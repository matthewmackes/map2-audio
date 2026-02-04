# 🌐 Web UI - LCD Dashboard Specification

## Overview

The Web UI provides a **real-time, multi-node LCD event dashboard** where users can:
- View live LCD content from all cluster nodes
- Monitor event streams with live updates (WebSocket)
- Filter and search events
- View statistics and trends
- Send test events for debugging

---

## Page 1: LCD Event Dashboard

### Layout

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ MAP2 AUDIO PLATFORM - LCD EVENT DASHBOARD                 ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┌─ LIVE EVENT FEED ──────────────────────────────────────────┐
│  [↻] Live  [⏸] Pause  [🔍] Search: ___________           │
│  Filters: [All] [Local] [Remote] [Audio] [System] [Alerts] │
│                                                            │
│  🎵 [LOCAL] AUDIO-NODE-9F4E                  14:23:15    │
│     Audio Engine Started                                  │
│     ├─ Latency: 5.2ms                                      │
│     ├─ CPU Usage: 24%                                      │
│     ├─ XRUN Count: 0                                       │
│     └─ Status: Running                                     │
│     [Pin] [Details] [View LCD]                            │
│                                                            │
│  ⚙️  [REMOTE] CONTROL-NODE-2D7K             14:23:12    │
│     High API Traffic                                      │
│     ├─ Requests/sec: 150                                   │
│     ├─ CPU Usage: 65%                                      │
│     ├─ Active Connections: 450                            │
│     └─ Memory: 1.2 GB                                      │
│     [Pin] [Details] [View LCD]                            │
│                                                            │
│  🎵 [LOCAL] AUDIO-NODE-9F4E                  14:23:08    │
│     Preset Loaded: "Warm Tone"                            │
│     ├─ Plugins: Compressor, EQ, Reverb                     │
│     ├─ Settings: Custom                                    │
│     └─ Status: Active                                      │
│     [Pin] [Details] [View LCD]                            │
│                                                            │
│  ❌ [REMOTE] AUDIO-NODE-9F4E                14:22:45    │
│     XRUN ALERT [CRITICAL]                                 │
│     ├─ Dropouts Detected: 3                                │
│     ├─ Buffer Underrun: Output channels                     │
│     └─ Severity: Critical                                  │
│     [Pin] [Details] [Acknowledge] [View LCD]              │
│                                                            │
│  ✓ [REMOTE] CONTROL-NODE-2D7K              14:22:30    │
│     Database Backup Complete                              │
│     ├─ Data Size: 15.2 GB                                  │
│     ├─ Duration: 4.2 minutes                               │
│     └─ Status: Success                                     │
│     [Pin] [Details] [View LCD]                            │
│                                                            │
│  [Load More Events...]                                     │
│                                                            │
└────────────────────────────────────────────────────────────┘

┌─ EVENT STATISTICS ─────────────────────────────────────────┐
│                                                            │
│  Total Events (24h): 1,247                                │
│  ├─ Audio Events: 384 (30%)  ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░        │
│  ├─ System Events: 512 (41%) ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░        │
│  ├─ User Actions: 298 (24%)  ▓▓▓▓▓░░░░░░░░░░░░░░░░        │
│  └─ Alerts/Errors: 53 (5%)   ▓░░░░░░░░░░░░░░░░░░░        │
│                                                            │
│  By Severity:                                              │
│  ├─ Info: 892 (71%)                                        │
│  ├─ Warning: 245 (20%)                                     │
│  ├─ Error: 97 (8%)                                         │
│  └─ Critical: 13 (1%)                                      │
│                                                            │
└────────────────────────────────────────────────────────────┘

┌─ PINNED EVENTS ────────────────────────────────────────────┐
│ 📌 XRUN ALERT (AUDIO-NODE-9F4E) - 3 dropouts detected     │
│ 📌 High CPU (CONTROL-NODE-2D7K) - 65% usage               │
└────────────────────────────────────────────────────────────┘
```

### React Component Structure

```typescript
export function LCDDashboard() {
  const [events, setEvents] = useState<LCDEvent[]>([]);
  const [filters, setFilters] = useState({
    local: true,
    remote: true,
    severity: "all",
    type: "all",
  });
  
  // WebSocket subscription for live events
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8080/ws/lcd-events");
    ws.onmessage = (msg) => {
      const event = JSON.parse(msg.data);
      setEvents(prev => [event, ...prev].slice(0, 100)); // Keep last 100
    };
    return () => ws.close();
  }, []);
  
  return (
    <div className="lcd-dashboard">
      <LCDEventFeed 
        events={filterEvents(events, filters)}
        filters={filters}
        onFilterChange={setFilters}
      />
      
      <LCDEventStatistics events={events} />
      
      <LCDPinnedEvents 
        events={events.filter(e => e.pinned)}
      />
    </div>
  );
}
```

---

## Page 2: Per-Node LCD Display

### Node LCD Details

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ AUDIO-NODE-9F4E LCD DISPLAY                               ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┌─ LIVE LCD EMULATOR ────────────────────────────────────────┐
│                                                            │
│  ┌────────────────────────────────────┐                   │
│  │ MAP2 AUDIO PLATFORM                │  ← Header         │
│  ├────────────────────────────────────┤                   │
│  │ [LOCAL]  🎵 Audio Running          │  ← Current event  │
│  │ CPU: 24%  Latency: 5.2ms           │  ← Details        │
│  │                                    │                   │
│  │ [REMOTE] ⚙️  CONTROL-NODE-2D7K      │  ← Remote event  │
│  │ API: 150 req/s (CPU: 65%)          │  ← Details        │
│  │                                    │                   │
│  │ [Press M] Menu [<] [>] Navigation  │  ← Footer         │
│  └────────────────────────────────────┘                   │
│  (Real 4x20 LCD Hardware)                                 │
│                                                            │
│  ┌─ BACKLIGHT CONTROL ────────────────┐                   │
│  │ Brightness: ████████░░ 80%         │                   │
│  │ [Manual] [Auto] [Schedule]         │                   │
│  └────────────────────────────────────┘                   │
│                                                            │
└────────────────────────────────────────────────────────────┘

┌─ NODE INFORMATION ─────────────────────────────────────────┐
│                                                            │
│  Node ID:           AUDIO-NODE-9F4E                        │
│  Node Type:         Audio Node (JUCE Processing)          │
│  IP Address:        192.168.1.50                           │
│  Status:            ✓ Online (Healthy)                     │
│  Last Heartbeat:    14:23:15 (3 seconds ago)              │
│                                                            │
│  System:                                                   │
│  ├─ CPU Usage:      24% [████░░░░░░]                      │
│  ├─ Memory:         450 MB / 2048 MB (22%)                │
│  ├─ Disk:           450 GB / 500 GB (90%)                 │
│  └─ Temperature:    52°C (OK)                              │
│                                                            │
│  Audio:                                                    │
│  ├─ Engine:         ✓ Running                             │
│  ├─ Device:         Edirol UA-1000                         │
│  ├─ Sample Rate:    48000 Hz                               │
│  ├─ Buffer Size:    256 samples                            │
│  ├─ Latency:        5.2 ms                                 │
│  ├─ CPU Usage:      18% [███░░░░░░░]                      │
│  ├─ XRUN Count:     0                                      │
│  └─ Plugins Loaded: 3                                      │
│                                                            │
└────────────────────────────────────────────────────────────┘

┌─ EVENT HISTORY (This Node) ────────────────────────────────┐
│  🎵 Audio Engine Started                    14:23:15      │
│     Latency: 5.2ms | CPU: 24% | Running                   │
│                                                            │
│  🎵 Preset Loaded: "Warm Tone"             14:23:08      │
│     Compressor + EQ + Reverb                              │
│                                                            │
│  ✓ MIDI Interface Detected                  14:22:50      │
│     Keyboard: Akai MPK Mini                               │
│                                                            │
│  [View More]                                               │
│                                                            │
└────────────────────────────────────────────────────────────┘

[Back] [Refresh] [Control LCD] [Send Test Event] [More Actions]
```

### React Component

```typescript
export function NodeLCDPage({ nodeId }: { nodeId: string }) {
  const [node, setNode] = useState<NodeInfo>(null);
  const [events, setEvents] = useState<LCDEvent[]>([]);
  const [lcdPreview, setLcdPreview] = useState<string[]>([]);
  
  // Fetch node details
  useEffect(() => {
    fetch(`/api/audio-nodes/${nodeId}`)
      .then(r => r.json())
      .then(setNode);
  }, [nodeId]);
  
  // Subscribe to this node's LCD events
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8080/ws/lcd/${nodeId}`);
    ws.onmessage = (msg) => {
      const { event, lcd } = JSON.parse(msg.data);
      setEvents(prev => [event, ...prev].slice(0, 50));
      setLcdPreview(lcd); // [line1, line2, line3, line4]
    };
    return () => ws.close();
  }, [nodeId]);
  
  return (
    <div className="node-lcd-page">
      <NodeLCDEmulator preview={lcdPreview} />
      <NodeInformation node={node} />
      <NodeEventHistory events={events} nodeId={nodeId} />
    </div>
  );
}
```

---

## Page 3: LCD Settings & Configuration

### Backlight & Display Settings

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ LCD SETTINGS - AUDIO-NODE-9F4E                            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┌─ DISPLAY SETTINGS ─────────────────────────────────────────┐
│                                                            │
│  Backlight:                                                │
│  ├─ Brightness:     ████████░░ 80%  [−] [+]              │
│  ├─ Mode:           [Manual] [Auto] [Scheduled]           │
│  ├─ Auto Dim:       ✓ Enabled (60s idle)                  │
│  ├─ Schedule:       7:00 AM - 11:00 PM (50%)              │
│  │                  11:00 PM - 7:00 AM (10%)              │
│  └─ Night Mode:     ✓ Enabled (10 PM - 6 AM)              │
│                                                            │
│  Display:                                                  │
│  ├─ Refresh Rate:   [1s] [500ms] [200ms]                  │
│  ├─ Scroll Speed:   [Slow] [Medium] [Fast]                │
│  ├─ Show Icons:     ✓ Enabled                             │
│  └─ Show Timestamps: ✓ Enabled                            │
│                                                            │
│  Sound:                                                    │
│  ├─ Alert Sounds:   ✓ Enabled                             │
│  ├─ Volume:         ███░░░░░░░ 30%  [−] [+]              │
│  ├─ Mute During:    [Never] [Night] [Custom]              │
│  └─ Frequency:      [1000 Hz] [2000 Hz] [3000 Hz]         │
│                                                            │
└────────────────────────────────────────────────────────────┘

┌─ EVENT DISPLAY SETTINGS ───────────────────────────────────┐
│                                                            │
│  Event Queue:                                              │
│  ├─ Queue Size:     [5] [10] [20] [50]                    │
│  ├─ Display Time:   [5s] [10s] [15s] [30s]                │
│  ├─ Priority Order: [Severity] [Time] [Type]              │
│  └─ Auto-Advance:   ✓ Enabled                             │
│                                                            │
│  Filtering:                                                │
│  ├─ Show Local:     ✓ Enabled                             │
│  ├─ Show Remote:    ✓ Enabled                             │
│  ├─ Min Severity:   [Info] [Warning] [Error] [Critical]   │
│  └─ Event Types:                                           │
│     ✓ Audio  ✓ System  ✓ Network  ✓ User  ✓ Alerts       │
│                                                            │
│  Remote Node Events:                                       │
│  ├─ Show From:      [All] [Audio Nodes] [Control Nodes]   │
│  └─ Max Remote:     [5] [10] [20] [50]                    │
│                                                            │
└────────────────────────────────────────────────────────────┘

┌─ TESTING & DEBUG ──────────────────────────────────────────┐
│                                                            │
│  [Send Test Event]  [Cycle Brightness]  [Play Sound]      │
│  [Clear Display]    [Show All Events]    [Reset Settings] │
│                                                            │
│  Test Event:                                               │
│  Title:    ________________                                │
│  Message:  ________________                                │
│  Type:     [Info] [Warning] [Error] [Critical]            │
│  [Send]                                                    │
│                                                            │
└────────────────────────────────────────────────────────────┘

[Save] [Reset] [Export Config] [Import Config] [Help]
```

---

## Real-Time WebSocket Updates

### Event Stream API

**WebSocket Endpoints:**

```
ws://localhost:8080/ws/lcd-events
  → All LCD events from all nodes
  
ws://localhost:8080/ws/lcd/{nodeId}
  → LCD events from specific node
  
ws://localhost:8080/ws/lcd/{nodeId}/preview
  → Live LCD display content (4 lines)
```

### Message Format

```typescript
interface LCDEventMessage {
  type: "event" | "lcd_update" | "node_status";
  
  // For type: "event"
  event?: {
    event_id: string;
    timestamp: string;
    source_node: string;
    severity: "info" | "warning" | "error" | "critical";
    title: string;
    message: string;
    icon: string;
  };
  
  // For type: "lcd_update"
  lcd?: {
    lines: [string, string, string, string]; // 4 lines of LCD
    backlight: number; // 0-100
    updated_at: string;
  };
  
  // For type: "node_status"
  node?: {
    node_id: string;
    status: "online" | "offline";
    last_event: string;
    event_count: number;
  };
}
```

---

## Implementation Files

```
web/src/
├── app/
│   ├── pages/
│   │   ├── LCDDashboard.tsx         # Main event feed
│   │   ├── NodeLCDPage.tsx          # Per-node LCD view
│   │   └── LCDSettings.tsx          # LCD configuration
│   │
│   ├── components/
│   │   ├── LCDEventFeed.tsx         # Real-time event list
│   │   ├── LCDEmulator.tsx          # LCD display mockup
│   │   ├── LCDStatistics.tsx        # Event charts/stats
│   │   ├── NodeLCDCard.tsx          # Node LCD card
│   │   └── LCDControlPanel.tsx      # Controls & filters
│   │
│   └── hooks/
│       ├── useLCDEvents.ts          # WebSocket hook
│       └── useLCDSettings.ts        # Settings API hook
```

---

## Success Metrics

- [ ] Events display in Web UI <500ms after generation
- [ ] LCD displays 4 lines with live preview in Web UI
- [ ] Real-time WebSocket updates <2 second latency
- [ ] 1000+ events displayable without performance degradation
- [ ] Remote events clearly labeled with source node
- [ ] Filters work instantly (no server roundtrip)
- [ ] Mobile-responsive design
- [ ] Backlight/sound controls work reliably
- [ ] Event statistics update in real-time

---

**Status:** ✅ Specification Complete - Ready for Implementation

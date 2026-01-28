# MAP2 Audio Platform: TUI ↔ Web Interface Parity Plan

## Executive Summary

This document provides a comprehensive analysis of the TUI (Text User Interface) and Web interface, identifying feature gaps and outlining a plan to bring the TUI to full parity with the web interface.

**Current Status:**
- TUI: ~90% feature parity with web (up from ~70%)
- ✅ Phase 1 Implemented: Automation, Network, WWW screens + Undo/Redo
- ✅ tui_v2/option1_cockpit fully updated with all new features
- Remaining gaps: Enhanced MIDI sub-tabs, React Flow visualization
- Estimated remaining effort: 5-7 development days

### ✅ Phase 1 Implementation Complete (January 21, 2026)

**Original TUI (`/tui/`):**
| Feature | Status | File(s) Modified |
|---------|--------|------------------|
| Undo/Redo Keyboard Shortcuts | ✅ Complete | `app.py` |
| Help Screen (?) | ✅ Complete | `app.py` |
| Automation Tab (LFO, Timeline) | ✅ Complete | `screens/automation_tab.py` (NEW) |
| Network Tab (WiFi, DNS, Hostname) | ✅ Complete | `screens/network_tab.py` (NEW) |
| WWW Tab (SSL, CORS, API, Logs) | ✅ Complete | `screens/www_tab.py` (NEW) |
| API Methods (50+ new) | ✅ Complete | `api_client.py` |
| Tab Structure (10→13 tabs) | ✅ Complete | `app.py`, `screens/__init__.py` |

**TUI v2 Cockpit (`/tui_v2/option1_cockpit/`):**
| Feature | Status | File(s) Modified |
|---------|--------|------------------|
| Undo/Redo Bindings | ✅ Complete | `app.py` (Ctrl+Z, Ctrl+Y) |
| WWW Screen | ✅ Complete | `screens/www.py` (NEW) |
| Automation LFO | ✅ Complete | `screens/automation.py` (enhanced) |
| Network DNS/Hostname | ✅ Complete | `screens/network.py` (enhanced) |
| API Methods (100+ total) | ✅ Complete | `api/client.py` |
| Navigation (13 sections) | ✅ Complete | `app.py` (+WWW section)

---

## 1. TUI Interface Deep Dive

### 1.1 Current Architecture

The TUI is built using **Textual** (Python-based terminal UI framework) with the following structure:

```
tui/
├── app.py                    # Main application with tabbed navigation
├── api_client.py             # Async HTTP client with connection pooling
├── chain_ab_mode.py          # A/B mode keyboard handler
├── modals.py                 # Dialog components
├── utils.py                  # Utility functions
├── widgets.py                # Reusable UI widgets
└── screens/
    ├── chains_refactored.py  # Signal chain/pedalboard management (6010 lines)
    ├── midi.py               # MIDI control center (556 lines)
    ├── plugin_loader.py      # Plugin management (1089 lines)
    ├── metrics_tab.py        # System status/dashboard (811 lines)
    ├── workflow_tab.py       # Sessions, presets, templates (594 lines)
    ├── guitar.py             # NAM/IR guitar chain (597 lines)
    ├── about_tab.py          # System info/credits (329 lines)
    ├── backup_tab.py         # Backup/restore (717 lines)
    ├── control_panel.py      # Service control (435 lines)
    └── health_tab.py         # System health dashboard (372 lines)
```

### 1.2 Current TUI Features (10 Tabs)

| Tab # | Tab Name | Description | Key Features |
|-------|----------|-------------|--------------|
| 1 | PEDALBOARD | Signal chain management | ✅ Effect blocks, bypass toggle, drag/reorder, plugin parameters, signal flow visualization |
| 2 | MIDI | MIDI control center | ✅ Start/stop engine, device list, learn mode, mapping CRUD |
| 3 | PLUGINS | Plugin browser/loader | ✅ DSP mode selector, RT monitor, plugin cards, CPU budgeting |
| 4 | DASHBOARD | System metrics | ✅ Status panel (backend, audio, MIDI, CPU, memory), xruns |
| 5 | WORKFLOW | Sessions & presets | ✅ Sessions list, presets, templates, NAM models management |
| 6 | GUITAR/NAM | Guitar processing | ✅ NAM models, cabinet IRs, reverb IRs, mix/bypass controls |
| 7 | SERVICES | Service control panel | ✅ Service cards, start/stop/restart, health metrics |
| 8 | HEALTH | Health dashboard | ✅ Circuit breaker, connection pooling, request queuing, graceful degradation |
| 9 | ABOUT | System info | ✅ Version info, platform details, credits, asset counts |
| 10 | BACKUP | Backup management | ✅ Create/restore backups, scheduling, skip lists |

### 1.3 TUI Key Bindings
- `1-0`: Direct tab access
- `←/→`: Tab navigation
- `q`: Quit
- `r`: Refresh current screen
- `Ctrl+R`: Hot reload modules/CSS

### 1.4 TUI Technical Features
- **LRU Screen Cache**: Keeps max 4 screens in memory
- **Connection Pooling**: HTTP/1.1 with keep-alive (10 max connections)
- **Parameter Batching**: 50ms delay, 20 max batch size
- **WebSocket Support**: Real-time event subscription (audio levels, CPU, chain events)
- **Daemon Mode**: Background monitoring with health checks

---

## 2. Web Interface Deep Dive

### 2.1 Current Architecture

The web interface is built using **React + TypeScript + Material-UI (MUI)** with:

```
web/src/
├── map2/
│   ├── api.ts                # REST API client
│   ├── types.ts              # TypeScript type definitions
│   ├── websocket.ts          # WebSocket client
│   ├── realtimeParams.ts     # <10ms parameter updates
│   ├── hooks/
│   │   ├── useWebSocket.ts   # WebSocket React hooks
│   │   └── useRTParameter.ts # Real-time parameter hook
│   └── components/
│       ├── MAP2Dashboard.tsx     # Main dashboard (tabs)
│       ├── AudioEngine.tsx       # Audio control + metrics
│       ├── ChainBuilder.tsx      # React Flow pedalboard (1400 lines)
│       ├── ChainBuilder/         # React Flow components
│       │   └── (flow nodes, edges, drag-drop hooks)
│       ├── ChainABMode.tsx       # A/B comparison UI
│       ├── PluginBrowser.tsx     # Plugin browser + presets
│       ├── MIDIMapper.tsx        # Full MIDI configuration (1124 lines)
│       ├── IRManager.tsx         # Cabinet/reverb IR manager
│       ├── NAMManager.tsx        # Neural amp modeler
│       ├── WorkFlow.tsx          # Automation + History + Sessions
│       ├── AutomationEditor.tsx  # LFO + timeline automation (567 lines)
│       ├── HistoryPanel.tsx      # Undo/redo + snapshots
│       ├── SessionManager.tsx    # Session CRUD + export/import
│       ├── MetricsDashboard.tsx  # System metrics display
│       ├── SettingsPanel.tsx     # Service status + settings (813 lines)
│       ├── NetworkPanel.tsx      # Network configuration (990 lines)
│       ├── WWWPanel.tsx          # Web server config (987 lines)
│       └── PresetManager.tsx     # Preset management
└── pipedal/
    ├── MainPage.tsx          # PiPedal pedalboard view (824 lines)
    ├── PedalboardView.tsx    # Visual pedalboard
    ├── LoadPluginDialog.tsx  # Plugin selection dialog
    ├── SnapshotDialog.tsx    # Snapshot management
    ├── MidiBindingsDialog.tsx # MIDI binding dialog
    └── (100+ other PiPedal components)
```

### 2.2 Web Interface Features (10 Tabs)

| Tab # | Tab Name | Description | Key Features |
|-------|----------|-------------|--------------|
| 1 | Audio | Audio engine control | ✅ Start/stop, levels, performance metrics, plugin levels, JACK status |
| 2 | Chains | Signal chain builder | ✅ React Flow canvas, drag-drop, A/B mode, blend mixing, undo/redo |
| 3 | Plugins | Plugin browser | ✅ Search, categories, favorites, presets, auto-refresh, cached status |
| 4 | MIDI | Full MIDI configuration | ✅ Routing, filters, presets, monitor, clock, device management |
| 5 | Cabinets/IR | IR management | ✅ Upload, load, preview, status, cabinet/reverb tabs |
| 6 | NAM Models | Neural amp modeler | ✅ Model list, load/activate, grouped by type, status |
| 7 | WorkFlow | Automation/History/Sessions | ✅ LFO automation, timeline, undo/redo, snapshots, session export |
| 8 | Settings | System settings | ✅ Service status, theme, API health, WebSocket stats |
| 9 | NETWORK | Network configuration | ✅ WiFi scan/connect, Ethernet, DNS, hostname, firewall |
| 10 | WWW | Web server config | ✅ SSL, CORS, API endpoints, access logs, WebSocket stats |

---

## 3. Feature Gap Analysis

### 3.1 Features Web Has That TUI is Missing

#### 🔴 CRITICAL GAPS (High Priority)

| Feature | Web Location | TUI Impact | Effort |
|---------|--------------|------------|--------|
| **React Flow Chain Visualization** | ChainBuilder.tsx | Missing visual drag-drop canvas | 5 days |
| **A/B Mode Blend Slider** | ChainABMode.tsx | Has keyboard handler but no visual UI | 2 days |
| **Automation Editor (LFO)** | AutomationEditor.tsx | Completely missing | 3 days |
| **Timeline Automation Points** | AutomationEditor.tsx | Completely missing | 2 days |
| **MIDI Routing Configuration** | MIDIMapper.tsx | Only basic mapping | 2 days |
| **MIDI Filter Configuration** | MIDIMapper.tsx | Missing | 1 day |
| **MIDI Monitor (real-time messages)** | MIDIMapper.tsx | Missing | 1 day |
| **MIDI Clock Configuration** | MIDIMapper.tsx | Missing | 0.5 days |
| **Network Panel** | NetworkPanel.tsx | Completely missing | 3 days |
| **WWW Panel** | WWWPanel.tsx | Completely missing | 2 days |

#### 🟡 MODERATE GAPS (Medium Priority)

| Feature | Web Location | TUI Impact | Effort |
|---------|--------------|------------|--------|
| **Undo/Redo with Keyboard Shortcuts** | HistoryPanel.tsx | Missing Ctrl+Z/Ctrl+Y | 0.5 days |
| **Snapshot Quick Access** | HistoryPanel.tsx | Has API but no UI | 1 day |
| **Session Export/Import** | SessionManager.tsx | Missing file dialogs | 1 day |
| **Plugin Favorites** | PluginBrowser.tsx | Missing | 0.5 days |
| **Plugin Category Filtering** | PluginBrowser.tsx | Basic only | 0.5 days |
| **Preset Tags Management** | PluginBrowser.tsx | Missing | 0.5 days |
| **Theme Selection** | SettingsPanel.tsx | Only dark mode | 0.5 days |
| **WebSocket Status Display** | SettingsPanel.tsx | No UI for connection status | 0.5 days |
| **Real-time Audio Levels (WebSocket)** | AudioEngine.tsx | Uses polling, not streaming | 1 day |

#### 🟢 MINOR GAPS (Low Priority)

| Feature | Web Location | TUI Impact | Effort |
|---------|--------------|------------|--------|
| **IR Upload Progress Bar** | IRManager.tsx | Missing visual feedback | 0.5 days |
| **NAM Model Type Grouping** | NAMManager.tsx | Flat list | 0.5 days |
| **Plugin Search Debouncing** | PluginBrowser.tsx | Immediate search | 0.25 days |
| **Auto-refresh Toggle** | PluginBrowser.tsx | Missing | 0.25 days |
| **Copy API Endpoints to Clipboard** | WWWPanel.tsx | Missing | 0.25 days |
| **Access Log Viewer** | WWWPanel.tsx | Missing | 0.5 days |

### 3.2 TUI Exclusive Features (Web Should Adopt)

| Feature | TUI Location | Description |
|---------|--------------|-------------|
| **Hot Module Reload (Ctrl+R)** | app.py | Live reload of screens without restart |
| **LRU Screen Cache** | app.py | Memory-efficient screen management |
| **Daemon Mode** | app.py | Background monitoring capability |
| **Signal Link Visualization** | chains_refactored.py | ASCII signal flow indicators |
| **DSP Mode Selector** | plugin_loader.py | Performance/Balanced/Quality quick toggle |

---

## 4. Detailed Implementation Plan

### Phase 1: Critical Infrastructure (Week 1)

#### 1.1 WebSocket Real-Time Updates
**File: `tui/screens/metrics_tab.py`, `tui/app.py`**

```python
# Add WebSocket-based level meters
async def connect_realtime_meters(self):
    """Stream audio levels via WebSocket instead of polling."""
    await self.api_client.connect_websocket(
        on_message=self._handle_ws_message,
        topics=["audio_levels", "cpu_usage", "xruns"]
    )

def _handle_ws_message(self, data: Dict[str, Any]):
    """Update UI from WebSocket events."""
    if data.get("type") == "audio_levels":
        self.update_level_meters(data["levels"])
```

#### 1.2 A/B Mode Visual Interface
**File: `tui/screens/chains_refactored.py`**

Add new `ABModePanel` widget:
- Chain A/B selection dropdowns
- Visual blend slider (ASCII art)
- DSP load indicators
- Swap/Link buttons

#### 1.3 Undo/Redo with Keyboard Shortcuts
**File: `tui/app.py`**

```python
BINDINGS = [
    # ... existing bindings ...
    Binding("ctrl+z", "undo", "Undo", show=True),
    Binding("ctrl+shift+z", "redo", "Redo", show=True),
    Binding("ctrl+y", "redo", "Redo", show=False),
]

async def action_undo(self) -> None:
    result = await self.api_client.undo()
    if result.success:
        await self.show_tab(self.current_tab, force_refresh=True)
```

### Phase 2: New Screens (Week 2)

#### 2.1 Automation Editor Screen
**New File: `tui/screens/automation_tab.py`**

Features:
- Parameter list with LFO indicators
- LFO configuration form (rate, depth, waveform)
- Timeline point editor (DataTable)
- Transport controls (Play/Pause/Stop/Rewind)
- Loop toggle

```python
class AutomationTab(ScrollableContainer):
    """Automation editor with LFO and timeline support."""

    def compose(self) -> ComposeResult:
        yield Label("🎛️ AUTOMATION EDITOR", classes="section-title")
        
        # Transport controls
        with Container(classes="transport-section"):
            with Horizontal(classes="control-buttons"):
                yield ActionButton("⏮ Rewind", id="btn-rewind")
                yield ActionButton("▶ Play", id="btn-play", variant="success")
                yield ActionButton("⏸ Pause", id="btn-pause")
                yield ActionButton("⏹ Stop", id="btn-stop", variant="error")
                yield ActionButton("🔁 Loop", id="btn-loop")
        
        # Parameter list with LFO
        with Container(classes="params-section"):
            yield DataTable(id="automation-params")
        
        # LFO Configuration
        with Container(classes="lfo-section"):
            yield Label("LFO Configuration", classes="section-title")
            yield Select(id="lfo-waveform", options=[
                ("Sine", "sine"),
                ("Triangle", "triangle"),
                ("Square", "square"),
                ("Sawtooth", "saw"),
            ])
            yield Input(placeholder="Rate (Hz)", id="lfo-rate")
            yield Input(placeholder="Depth (0-100%)", id="lfo-depth")
```

#### 2.2 Network Configuration Screen
**New File: `tui/screens/network_tab.py`**

Features:
- Interface list (Ethernet, WiFi)
- WiFi network scanner
- Connection dialogs
- IP configuration (DHCP/Static)
- DNS settings
- Hostname editor

#### 2.3 WWW Configuration Screen
**New File: `tui/screens/www_tab.py`**

Features:
- Web server status
- SSL/TLS configuration
- CORS settings
- API endpoint list
- Access log viewer
- WebSocket stats

### Phase 3: Enhanced MIDI (Week 3)

#### 3.1 MIDI Routing Tab
**Enhance: `tui/screens/midi.py`**

Add TabbedContent with sub-tabs:
1. **Mappings** (existing)
2. **Routing** (new)
3. **Filters** (new)
4. **Monitor** (new)
5. **Clock** (new)

```python
class MIDIScreen(ScrollableContainer):
    def compose(self) -> ComposeResult:
        with TabbedContent(id="midi-tabs"):
            with TabPane("Mappings", id="tab-mappings"):
                yield MIDIMappingsPanel(self.api_client)
            with TabPane("Routing", id="tab-routing"):
                yield MIDIRoutingPanel(self.api_client)
            with TabPane("Filters", id="tab-filters"):
                yield MIDIFiltersPanel(self.api_client)
            with TabPane("Monitor", id="tab-monitor"):
                yield MIDIMonitorPanel(self.api_client)
            with TabPane("Clock", id="tab-clock"):
                yield MIDIClockPanel(self.api_client)
```

#### 3.2 MIDI Monitor Panel
Real-time MIDI message display with filtering:

```python
class MIDIMonitorPanel(Container):
    """Real-time MIDI message monitor."""
    
    messages: reactive[List[Dict]] = reactive([])
    
    def compose(self) -> ComposeResult:
        with Horizontal(classes="filter-row"):
            yield Select(id="filter-port", options=[("All", "all")])
            yield Select(id="filter-channel", options=[("All", "all")])
            yield Select(id="filter-type", options=[
                ("All", "all"),
                ("Note On", "note_on"),
                ("Note Off", "note_off"),
                ("CC", "cc"),
                ("Program Change", "pc"),
            ])
        yield DataTable(id="midi-messages")
```

### Phase 4: Visual Enhancements (Week 4)

#### 4.1 ASCII Chain Flow Visualization
**Enhance: `tui/screens/chains_refactored.py`**

Create visual representation similar to React Flow:

```
┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────┐
│  INPUT  │───▶│  GxAmplifier│───▶│  Calf Reverb│───▶│ OUTPUT  │
│  USB    │    │  [BYPASS]   │    │  Mix: 30%   │    │  USB    │
└─────────┘    └─────────────┘    └─────────────┘    └─────────┘
```

#### 4.2 Plugin Category Filtering
**Enhance: `tui/screens/plugin_loader.py`**

```python
PLUGIN_CATEGORIES = [
    "All",
    "Amplifier",
    "Distortion",
    "Delay",
    "Reverb",
    "Modulation",
    "EQ",
    "Compressor",
    "Utility",
]

def compose(self) -> ComposeResult:
    with Container(classes="filter-row"):
        yield Select(
            options=[(cat, cat.lower()) for cat in PLUGIN_CATEGORIES],
            id="category-filter"
        )
        yield Input(placeholder="Search plugins...", id="search-input")
        yield ActionButton("⭐ Favorites", id="btn-favorites")
```

#### 4.3 Favorites System
**New File: `tui/favorites.py`**

```python
class FavoritesManager:
    """Manage user favorites for plugins, presets, sessions."""
    
    def __init__(self, storage_path: Path = None):
        self.storage_path = storage_path or Path.home() / ".config" / "map2" / "favorites.json"
        self._load()
    
    def add_favorite(self, category: str, item_id: str) -> None:
        if category not in self.favorites:
            self.favorites[category] = []
        if item_id not in self.favorites[category]:
            self.favorites[category].append(item_id)
            self._save()
```

---

## 5. API Client Additions

### 5.1 Missing API Methods

Add to `tui/api_client.py`:

```python
# ==================== AUTOMATION ====================

async def get_automation_status(self) -> APIResult:
    """Get automation playback status."""
    return await self._request("GET", "/api/automation/status")

async def add_automation_point(self, param_id: str, time: float, 
                                value: float, curve: str) -> APIResult:
    """Add automation point."""
    return await self._request("POST", f"/api/automation/lanes/{param_id}/points", json={
        "time": time, "value": value, "curve_type": curve
    })

async def set_lfo(self, param_id: str, rate: float, depth: float, 
                  waveform: str) -> APIResult:
    """Configure LFO for parameter."""
    return await self._request("POST", f"/api/automation/lfo/{param_id}", json={
        "rate_hz": rate, "depth": depth, "waveform": waveform
    })

# ==================== HISTORY ====================

async def undo(self) -> APIResult:
    """Undo last action."""
    return await self._request("POST", "/api/history/undo")

async def redo(self) -> APIResult:
    """Redo last undone action."""
    return await self._request("POST", "/api/history/redo")

async def get_history_status(self) -> APIResult:
    """Get undo/redo availability."""
    return await self._request("GET", "/api/history/status")

# ==================== NETWORK ====================

async def get_network_status(self) -> APIResult:
    """Get network interface status."""
    return await self._request("GET", "/api/network/status")

async def scan_wifi(self) -> APIResult:
    """Scan for WiFi networks."""
    return await self._request("GET", "/api/network/wifi/scan")

async def connect_wifi(self, ssid: str, password: str) -> APIResult:
    """Connect to WiFi network."""
    return await self._request("POST", "/api/network/wifi/connect", json={
        "ssid": ssid, "password": password
    })

async def set_hostname(self, hostname: str) -> APIResult:
    """Set system hostname."""
    return await self._request("POST", "/api/network/hostname", json={
        "hostname": hostname
    })

# ==================== WWW ====================

async def get_www_status(self) -> APIResult:
    """Get web server status."""
    return await self._request("GET", "/api/www/status")

async def get_api_endpoints(self) -> APIResult:
    """List all API endpoints."""
    return await self._request("GET", "/api/www/endpoints")

async def get_access_logs(self, limit: int = 100) -> APIResult:
    """Get recent access logs."""
    return await self._request("GET", f"/api/www/logs?limit={limit}")
```

---

## 6. Updated Tab Structure

### Current TUI Tabs (10)
1. PEDALBOARD
2. MIDI
3. PLUGINS
4. DASHBOARD
5. WORKFLOW
6. GUITAR/NAM
7. SERVICES
8. HEALTH
9. ABOUT
10. BACKUP

### Proposed TUI Tabs (12 - Web Parity)
1. **PEDALBOARD** (enhanced with A/B mode)
2. **MIDI** (enhanced with routing/filters/monitor/clock)
3. **PLUGINS** (enhanced with favorites/categories)
4. **DASHBOARD** (enhanced with WebSocket meters)
5. **WORKFLOW** (split into sub-tabs)
6. **AUTOMATION** ⬅️ NEW
7. **GUITAR/NAM**
8. **NETWORK** ⬅️ NEW
9. **WWW** ⬅️ NEW
10. **SERVICES**
11. **HEALTH**
12. **SETTINGS** (consolidated ABOUT + BACKUP + theme)

---

## 7. Testing Plan

### 7.1 Unit Tests
- API client new methods
- Favorites persistence
- WebSocket message handling

### 7.2 Integration Tests
- Full workflow: Create chain → Add plugins → Configure automation → Save session
- MIDI flow: Connect device → Create mapping → Learn mode → Verify
- Network: Scan → Connect → Verify IP

### 7.3 Manual Testing Checklist
- [ ] All keyboard shortcuts work
- [ ] Tab navigation smooth
- [ ] No screen flickering
- [ ] WebSocket reconnection works
- [ ] Large plugin lists scroll smoothly
- [ ] Memory usage stays under 200MB

---

## 8. Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Phase 1 | Week 1 | WebSocket, A/B Mode UI, Undo/Redo |
| Phase 2 | Week 2 | Automation, Network, WWW screens |
| Phase 3 | Week 3 | Enhanced MIDI (5 sub-tabs) |
| Phase 4 | Week 4 | Visual enhancements, testing |

**Total Estimated Effort: 15-20 development days**

---

## 9. Dependencies

### Python Packages (already installed)
- `textual>=0.46.0`
- `httpx`
- `websockets`
- `rich`

### No new dependencies required

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Feature Parity | 100% of web features available in TUI |
| Response Time | <100ms for local API calls |
| Memory Usage | <200MB with all screens cached |
| WebSocket Latency | <50ms for level updates |
| User Satisfaction | All workflows achievable via keyboard |

---

## Appendix A: File Changes Summary

### ✅ Completed Changes (Phase 1)

| File | Action | Lines Changed |
|------|--------|---------------|
| `tui/app.py` | Modified | +60 (new bindings, tabs 10→13, undo/redo, help) |
| `tui/api_client.py` | Modified | +400 (automation, history, network, www, midi, favorites, ab-mode) |
| `tui/screens/__init__.py` | Modified | +6 (new exports) |
| `tui/screens/automation_tab.py` | **NEW** | 567 lines |
| `tui/screens/network_tab.py` | **NEW** | 515 lines |
| `tui/screens/www_tab.py` | **NEW** | 520 lines |

### Remaining Changes (Phase 2-4)

| File | Action | Lines Estimated |
|------|--------|-----------------|
| `tui/screens/chains_refactored.py` | Modify | +300 (A/B mode visual panel) |
| `tui/screens/midi.py` | Modify | +500 (5 tabbed sub-sections) |
| `tui/screens/plugin_loader.py` | Modify | +100 (favorites, categories) |
| `tui/favorites.py` | **NEW** | +100 |

**Phase 1 Total: ~2,068 lines of new/modified code**
**Remaining: ~1,000 lines estimated**

---

## Appendix B: Keyboard Shortcut Reference (Updated)

### Global Shortcuts
| Key | Action |
|-----|--------|
| `1-9, 0` | Jump to tabs 1-10 |
| `F1-F3` | Jump to tabs 11-13 (Health, About, Backup) |
| `←/→` | Previous/Next tab |
| `q` | Quit application |
| `r` | Refresh current screen |
| `Ctrl+R` | Hot reload modules |
| `Ctrl+Z` | Undo ✅ |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo ✅ |
| `?` | Show help ✅ |

### Tab Mapping (13 Tabs)
| Key | Tab | Description |
|-----|-----|-------------|
| `1` | PEDALBOARD | Signal chain management |
| `2` | MIDI | MIDI control center |
| `3` | PLUGINS | Plugin browser/loader |
| `4` | DASHBOARD | System metrics |
| `5` | WORKFLOW | Sessions & presets |
| `6` | AUTOMATION | LFO & timeline ✅ NEW |
| `7` | GUITAR/NAM | Neural amp modeler |
| `8` | NETWORK | Network config ✅ NEW |
| `9` | WWW | Web server config ✅ NEW |
| `0` | SERVICES | Service control panel |
| `F1` | HEALTH | Health dashboard |
| `F2` | ABOUT | System info |
| `F3` | BACKUP | Backup management |

### A/B Mode Shortcuts
| Key | Action |
|-----|--------|
| `Space` | Toggle A/B mode |
| `a` | Select chain A |
| `b` | Select chain B |
| `x` | Swap A ↔ B |
| `l` | Link/unlink pair |
| `<` / `>` | Blend toward A/B |
| `[` / `]` | 100% A / 100% B |
| `=` | 50/50 blend |

### MIDI Monitor Shortcuts
| Key | Action |
|-----|--------|
| `c` | Clear messages |
| `f` | Focus filter |
| `p` | Pause/resume |

---

*Document Version: 1.0*
*Created: January 21, 2026*
*Author: MAP2 Audio Platform Development Team*

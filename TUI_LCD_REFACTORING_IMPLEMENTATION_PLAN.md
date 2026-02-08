# TUI LCD System Refactoring - Implementation Plan

**Date:** February 7, 2026  
**Framework:** Textual (textual.textualize.io)  
**Status:** Design & Planning Complete

---

## Overview

This document outlines the refactoring of the LCD Management TUI screen to achieve feature parity with the Web UI using the modern Textual framework. The new dashboard will provide operators with comprehensive LCD management capabilities directly from the terminal.

---

## Current TUI Implementation

**File:** `/home/mm/map2-audio/tui/screens/lcd_management_screen.py`

**Current Features:**
- ✅ Live LCD preview (4x20 mockup)
- ✅ Event queue display (next 5 events)
- ✅ Filter controls (local/remote, type, severity)
- ✅ Event history pagination
- ✅ Basic control hints

**Limitations:**
- ❌ No tabbed interface
- ❌ No settings management
- ❌ No backlight control UI
- ❌ No analytics/trends
- ❌ No test suite integration
- ❌ Single-screen layout (not scalable)
- ❌ Limited interactive controls
- ❌ No node health display
- ❌ No per-node LCD preview selection
- ❌ Manual filter toggling (no visual feedback)

---

## Proposed TUI Architecture (Textual)

### Components Structure

```
LCDDashboardApp (Container)
├─ HeaderBar (Static)
│  └─ "LCD MANAGEMENT DASHBOARD" + Status
│
├─ TabPane (Container)
│  ├─ Tab 1: LCDManagementTab
│  │  ├─ NodeSelector (Vertical)
│  │  │  └─ ScrollableNodeList
│  │  ├─ LCDPreviewWidget
│  │  ├─ HealthStatsWidget
│  │  ├─ EventQueueWidget
│  │  └─ QuickActionsBar
│  │
│  ├─ Tab 2: SettingsTab
│  │  ├─ BacklightSection
│  │  │  ├─ BrightnessSlider
│  │  │  ├─ ModeSelector
│  │  │  └─ ScheduleEditor
│  │  ├─ SoundSection
│  │  │  ├─ VolumeSlider
│  │  │  └─ AlertTypeSelector
│  │  ├─ DisplaySection
│  │  │  ├─ RefreshRateInput
│  │  │  └─ ScrollSpeedInput
│  │  ├─ FilterSection
│  │  │  └─ FilterControls
│  │  └─ NodeRoutingSection
│  │
│  ├─ Tab 3: AnalyticsTab
│  │  ├─ AlertFrequencyGraph
│  │  ├─ AlertTypeChart
│  │  ├─ NodeStabilityScores
│  │  ├─ TrendIndicators
│  │  └─ TopAlertsTable
│  │
│  ├─ Tab 4: EventsTab
│  │  ├─ EventHistoryTable
│  │  │  └─ Sortable columns
│  │  ├─ EventDetailModal
│  │  └─ ExportControls
│  │
│  └─ Tab 5: NodesTab
│     ├─ NodeGridView
│     │  └─ Per-node cards with mini LCD preview
│     ├─ QuickStatsPanel
│     └─ HealthScoresSidebar
│
└─ FooterBar (Static)
   ├─ KeyBindings
   ├─ Status Messages
   └─ Help Hint

```

---

## Tab 1: LCD Management (Enhanced)

### Layout

```
╔═══════════════════════════════════════════════════════════════════╗
║ LCD MANAGEMENT - AUDIO-NODE-9F4E                    [CPU] [Mem]  ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  Node Selector          │ LCD Preview        │ Health Stats      ║
║  ┌───────────────────┐  │ ╔═══════════════╗ │ ┌──────────────┐  ║
║  │ AUDIO-NODE-9F4E   │  │ ║ MAP2 AUD PLT  ║ │ CPU: ████░░ 45% ║
║  │ AUDIO-NODE-7B2C   │  │ ║ 🎵 Audio Run  ║ │ Mem: ███░░░░ 32% ║
║  │ AUDIO-NODE-3D5G   │  │ ║ Latency: 5.2m║ │ Disk: 450/500GB  ║
║  │ CONTROL-NODE-2D7K │  │ ║ [View] [Dism] ║ │ Temp: ████░░ 62% ║
║  └───────────────────┘  │ ╚═══════════════╝ │ Status: ✅ Online║
║                         │                   │ Uptime: 12:34:56 ║
║                         │ Backlight Control │ Peer: Connected  ║
║                         │ Brightness: ██░░░░ 40% │ Link: Good   ║
║                         │ [−] [+] [Auto]    │ Latency: 12ms    ║
║                         │ Mode: [Auto] [Man] │ LCDConnected: ✅  ║
║                         │                   └──────────────────┘ ║
║ Event Queue (Next 5)                                              ║
║ ┌────────────────────────────────────────────────────────────┐   ║
║ │ Time     │ Type    │ Severity │ Message                    │   ║
║ │ 14:23:15 │ audio   │ INFO     │ Audio Running              │   ║
║ │ 14:23:12 │ system  │ INFO     │ CPU Normal                 │   ║
║ │ 14:23:10 │ network │ INFO     │ Peer Connected             │   ║
║ │ 14:23:08 │ system  │ WARNING  │ Disk Usage: 450GB/500GB    │   ║
║ │ 14:23:05 │ audio   │ INFO     │ Latency Stable             │   ║
║ └────────────────────────────────────────────────────────────┘   ║
║                                                                   ║
║ Quick Actions: [T]est LCD [R]eset [I]nject Event [C]lear History ║
║                                                                   ║
║ Filters: [L]ocal [R]emote [T]ype [S]everity  [P]in [D]ismiss    ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝

F1: Help | ←/→: Nodes | Tab: Next | Shift+Tab: Prev | Q: Quit
```

### Features

1. **Node Selector (Left Panel)**
   - Scrollable list of all cluster nodes
   - Visual status indicator (●= online, ○=offline)
   - Current selection highlighted
   - Click/arrow keys to navigate
   - Shows node type (AUDIO-NODE, CONTROL-NODE) in different colors

2. **LCD Preview (Center)**
   - Real-time 4x20 character display mockup
   - Styled with borders and monospace font
   - Shows current event on selected node's LCD
   - Live updates via WebSocket
   - Color-coded by event severity

3. **Health Stats (Right Panel)**
   - Node performance metrics
   - CPU, memory, disk, temperature gauges
   - Connection status and latency
   - Uptime and peer information
   - Color indicates health (green=good, yellow=caution, red=critical)

4. **Backlight Control**
   - Brightness slider with visual bar
   - Mode selector (Manual/Auto/Scheduled)
   - Quick buttons for preset levels

5. **Event Queue**
   - Next 5 events in queue
   - Sortable by time, type, severity
   - Click to expand full details
   - Color-coded severity badges

6. **Quick Actions Bar**
   - Test LCD display
   - Reset to default view
   - Inject test event
   - Clear event history
   - View full event details

---

## Tab 2: Settings

### Layout

```
╔═══════════════════════════════════════════════════════════════════╗
║ LCD SETTINGS                                              [Save]  ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║ Category │ Setting                  │ Value / Control            ║
║──────────┼──────────────────────────┼────────────────────────    ║
║          │                          │                            ║
║ Display │ Brightness               │ ████████░░ 80%  [−] [+]   ║
║         │ Mode                      │ [Manual] [Auto] [Schedule] ║
║         │ Auto-Dim Timeout          │ [______] 60 seconds        ║
║         │ Refresh Rate              │ [______] 100 ms            ║
║         │ Scroll Speed              │ [______] 500 ms/char       ║
║         │ Show Timestamps           │ [☑] Yes  [☐] No           ║
║         │                           │                            ║
║ Sound   │ Volume                    │ ████████░░ 75%  [−] [+]   ║
║         │ Alert Sound               │ [☑] Enabled [☐] Disabled  ║
║         │ Mute Schedule             │ [______] 22:00 to 08:00    ║
║         │ Alert Frequencies         │ [Choose alert type...]     ║
║         │                           │                            ║
║ Events  │ Show Local Events         │ [☑] Yes  [☐] No           ║
║         │ Show Remote Events        │ [☑] Yes  [☐] No           ║
║         │ Min Severity              │ [Info] [Warning] [Error]   ║
║         │ Max Remote Events         │ [______] 20 events         ║
║         │ Event Retention          │ [______] 24 hours          ║
║         │ Auto-Dismiss Timeout      │ [______] 5 minutes         ║
║         │                           │                            ║
║ Routing │ AUDIO-NODE Subscriptions  │ [Choose event types...]    ║
║         │ CONTROL-NODE Subscriptions│ [Choose event types...]    ║
║         │ Default Broadcast         │ [☑] All  [☐] Role-based    ║
║         │                           │                            ║
║ Advanced│ Backlight Schedule        │ [Edit Schedule...]         ║
║         │ Event Rules               │ [Manage Rules...]          ║
║         │ Test LCD                  │ [Run Test Suite]           ║
║         │ Factory Reset             │ [Reset to Defaults]        ║
║         │                           │                            ║
║─────────────────────────────────────────────────────────────────  ║
║ [Apply] [Save] [Discard] [Load Default] [Export Config]           ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝

Tab: Next Setting | Shift+Tab: Previous | Enter: Edit | S: Save
```

### Features

1. **Organized Sections**
   - Display settings (brightness, refresh, scroll)
   - Sound settings (volume, alerts, mute schedule)
   - Event filtering (local/remote, severity, retention)
   - Node routing (per-role subscriptions)
   - Advanced options (scheduling, rules, test)

2. **Interactive Controls**
   - Sliders for numeric values
   - Checkboxes for toggles
   - Dropdown selectors
   - Text input fields
   - Modal dialogs for complex editors

3. **Configuration Management**
   - Apply changes (no save)
   - Save to database
   - Discard unsaved changes
   - Load factory defaults
   - Export configuration as JSON

---

## Tab 3: Analytics

### Layout

```
╔═══════════════════════════════════════════════════════════════════╗
║ ALERT ANALYTICS - LAST 24 HOURS                        [Export]   ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║ Alert Frequency Trend (Last 24 hours)                            ║
║ Count │                                                           ║
║ 40    │  ╭─╮      ╭─╮                                            ║
║ 30    │ ╭─╯ ╰──╭──╯ ╰───                                         ║
║ 20    │╭╯              ╰──                                        ║
║ 10    │╯                   ╰                                      ║
║  0    │────────────────────────────────────────────────────      ║
║       └─00h─02h─04h─06h─08h─10h─12h─14h─16h─18h─20h─22h─24h─   ║
║                                                                   ║
║ Alert Type Distribution         │ Top Alert Sources              ║
║ ┌──────────────────────────────┐ │ ┌──────────────────────────┐ ║
║ │ Audio XRUNs:       ◼◼◼◼ 35% │ │ │ AUDIO-NODE-9F4E: 48 (↓3%)│ ║
║ │ CPU Warnings:      ◼◼◼░ 28% │ │ │ AUDIO-NODE-7B2C: 24 (↑1%)│ ║
║ │ Network Alerts:    ◼◼░░░ 14% │ │ │ CONTROL-2D7K:   12 (→)  │ ║
║ │ System Alerts:     ◼░░░░ 15% │ │ │ AUDIO-NODE-3D5G:  8 (↓2%)│ ║
║ │ User Events:       ◼░░░░  8% │ │ │ (Other nodes:      2)    │ ║
║ └──────────────────────────────┘ │ └──────────────────────────┘ ║
║                                                                   ║
║ Node Stability Scores (Last 24h)                                 ║
║ Node ID           │ Score │ Trend │ Events │ Critical │ Warning  ║
║───────────────────┼───────┼───────┼────────┼──────────┼──────────║
║ AUDIO-NODE-9F4E   │ 85.2% │  ↓ 3% │   48   │    2     │   8      ║
║ AUDIO-NODE-7B2C   │ 92.1% │  ↑ 5% │   24   │    0     │   4      ║
║ AUDIO-NODE-3D5G   │ 88.5% │  → 0% │    8   │    0     │   2      ║
║ CONTROL-NODE-2D7K │ 96.3% │  ↑ 2% │   12   │    0     │   2      ║
║ (Network Avg)     │ 90.5% │  → 0% │   92   │    2     │  16      ║
║                                                                   ║
║ Recent Trends & Insights                                         ║
║ • XRUN rate increasing: 2.5/hour yesterday → 3.2/hour today     ║
║ • CPU warnings stable: 1.8/hour (no significant change)         ║
║ • Network stability improved: +15% vs. last week                 ║
║ • AUDIO-NODE-9F4E needs attention: 2 critical events this week  ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝

A: Adjust time range | E: Export | R: Refresh | ? Help
```

### Features

1. **Alert Frequency Graph**
   - ASCII line graph (last 24 hours)
   - Hourly aggregation
   - Trend line overlay
   - Time range selector

2. **Alert Type Distribution**
   - Pie chart (visual bar representation)
   - Percentages for each type
   - Sortable by count/percentage
   - Click to drill down

3. **Top Alert Sources**
   - Per-node alert counts
   - Trend indicators (↑/↓/→)
   - Severity breakdown
   - Ranked by frequency

4. **Node Stability Scores**
   - Historical scoring (0-100%)
   - Trend comparison
   - Critical and warning counts
   - Network average for comparison

5. **Insights & Recommendations**
   - Auto-generated analysis
   - Trend detection
   - Anomaly highlighting
   - Actionable suggestions

---

## Tab 4: Events

### Layout

```
╔═══════════════════════════════════════════════════════════════════╗
║ EVENT HISTORY - ALL EVENTS                    [Filter] [Export]   ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║ Quick Filter: [Severity ▼] [Type ▼] [Source ▼] [Time ▼] [Clear] ║
║                                                                   ║
║ Time     │ Source        │ Type    │ Severity │ Message          ║
║──────────┼───────────────┼─────────┼──────────┼──────────────────║
║ 14:23:15 │ AUDIO-9F4E    │ audio   │ ℹ INFO   │ Audio Running    ║
║ 14:23:12 │ AUDIO-9F4E    │ system  │ ℹ INFO   │ CPU Normal       ║
║ 14:23:10 │ CONTROL-2D7K  │ network │ ℹ INFO   │ Peer Connected   ║
║ 14:23:08 │ AUDIO-9F4E    │ system  │ ⚠ WARN   │ Disk: 450/500GB  ║
║ 14:23:05 │ AUDIO-7B2C    │ audio   │ ⚠ WARN   │ XRUN detected    ║
║ 14:23:02 │ CONTROL-2D7K  │ service │ ℹ INFO   │ DB connected     ║
║ 14:22:58 │ AUDIO-3D5G    │ audio   │ 🔴 ERROR │ Plugin crashed   ║
║ 14:22:55 │ AUDIO-9F4E    │ system  │ ℹ INFO   │ Temperature: 62C ║
║ 14:22:52 │ AUDIO-7B2C    │ audio   │ ℹ INFO   │ Latency: 5.2ms   ║
║ 14:22:48 │ CONTROL-2D7K  │ network │ 🔴 CRIT  │ Peer offline!    ║
║                                                                   ║
║ ▼ (Page 1/10 - 10 items shown, 97 total)                         ║
║                                                                   ║
║ Event Details (Focused):                                         ║
║ ┌───────────────────────────────────────────────────────────┐   ║
║ │ ID: uuid-456789                                           │   ║
║ │ Time: 2026-02-07 14:22:48                                 │   ║
║ │ Source: CONTROL-NODE-2D7K                                 │   ║
║ │ Type: Network / Severity: Critical                        │   ║
║ │ Title: Peer offline!                                      │   ║
║ │ Message: Peer connection to AUDIO-NODE-3D5G lost.         │   ║
║ │ TTL: 300s | Broadcast: Yes | Sound: Yes | Auto-Dismiss: Yes│   ║
║ │ Tags: network, peer-discovery, critical                   │   ║
║ │ Related Events:                                           │   ║
║ │   • AUDIO-3D5G - Connection lost (2s later)              │   ║
║ │   • AUDIO-3D5G - Attempting reconnect (5s later)         │   ║
║ │                                                           │   ║
║ │ [Dismiss] [Acknowledge] [Send to Node...] [Copy ID]      │   ║
║ └───────────────────────────────────────────────────────────┘   ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝

↑/↓: Scroll | Enter: Expand | C: Copy | D: Dismiss | E: Export | ?
```

### Features

1. **Event History Table**
   - Searchable and filterable
   - Sortable by any column
   - 10 events per page (configurable)
   - Color-coded severity badges
   - Timestamp with timezone

2. **Quick Filters**
   - Dropdown selectors for severity, type, source, time range
   - Real-time filtering
   - Clear all filters button
   - Save filter sets

3. **Event Detail Modal**
   - Full event information
   - Related events (correlation)
   - Action buttons
   - Event metadata and context

4. **Bulk Actions**
   - Select multiple events
   - Bulk dismiss
   - Export to CSV/JSON
   - Copy event IDs

---

## Tab 5: Nodes

### Layout

```
╔═══════════════════════════════════════════════════════════════════╗
║ NODE MANAGEMENT                                  [View: Grid] [List]║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  ┌─ AUDIO-NODE-9F4E ────┐  ┌─ AUDIO-NODE-7B2C ────┐             ║
║  │ ┌──────────────────┐ │  │ ┌──────────────────┐ │             ║
║  │ │ MAP2 AUD PLAT    │ │  │ │ MAP2 AUD PLAT    │ │             ║
║  │ │ Audio: Running   │ │  │ │ Audio: Running   │ │             ║
║  │ │ Latency: 5.2ms   │ │  │ │ Latency: 4.8ms   │ │             ║
║  │ │ [Details]        │ │  │ │ [Details]        │ │             ║
║  │ └──────────────────┘ │  │ └──────────────────┘ │             ║
║  │ CPU: ████░░ 45%      │  │ CPU: ██░░░░░░ 18%    │             ║
║  │ Mem: ███░░░░░ 32%    │  │ Mem: ██░░░░░░ 24%    │             ║
║  │ Disk: █████████░ 90% │  │ Disk: ██░░░░░░ 28%   │             ║
║  │ Temp: ████░░ 62°C    │  │ Temp: ███░░░░ 58°C   │             ║
║  │ Status: ✅ Online     │  │ Status: ✅ Online     │             ║
║  │ Events: 48 (↓3%)      │  │ Events: 24 (↑1%)     │             ║
║  │ Stability: 85% 🟡     │  │ Stability: 92% 🟢    │             ║
║  │ [Focus] [Console]    │  │ [Focus] [Console]    │             ║
║  └──────────────────────┘  │ └──────────────────────┘             ║
║                                                                   ║
║  ┌─ AUDIO-NODE-3D5G ────┐  ┌─ CONTROL-NODE-2D7K ───┐            ║
║  │ ┌──────────────────┐ │  │ ┌──────────────────┐   │            ║
║  │ │ MAP2 AUD PLAT    │ │  │ │ MAP2 CONTROL    │   │            ║
║  │ │ Audio: Running   │ │  │ │ API: Ready      │   │            ║
║  │ │ Latency: 5.5ms   │ │  │ │ DB: Connected   │   │            ║
║  │ │ [Details]        │ │  │ │ [Details]       │   │            ║
║  │ └──────────────────┘ │  │ └──────────────────┘   │            ║
║  │ CPU: ██░░░░░░ 20%    │  │ CPU: █░░░░░░░░░░ 8%   │            ║
║  │ Mem: ██░░░░░░ 25%    │  │ Mem: ██░░░░░░░░ 16%   │            ║
║  │ Disk: ██░░░░░░ 35%   │  │ Disk: █░░░░░░░░░░ 12% │            ║
║  │ Temp: ███░░░░░ 59°C  │  │ Temp: ██░░░░░░░░ 51°C │            ║
║  │ Status: ✅ Online     │  │ Status: ✅ Online      │            ║
║  │ Events: 8  (↓2%)      │  │ Events: 12 (stable)   │            ║
║  │ Stability: 88% 🟢     │  │ Stability: 96% 🟢     │            ║
║  │ [Focus] [Console]    │  │ [Focus] [Console]     │            ║
║  └──────────────────────┘  │ └──────────────────────┘            ║
║                                                                   ║
║ Network Summary                                                   ║
║ ┌─────────────────────────────────────────────────────────────┐ ║
║ │ Total Nodes: 4  │ Online: 4 ✅  │ Offline: 0  │ Health: 90.5%  │ ║
║ │ Total Events (24h): 92 │ Alerts: 2 🔴 │ Warnings: 16 🟡       │ ║
║ │ Avg Stability: 90.5% │ Network Latency: 12ms avg              │ ║
║ └─────────────────────────────────────────────────────────────┘ ║
║                                                                  ║
╚═══════════════════════════════════════════════════════════════════╝

G: Grid | L: List | F: Focus Node | C: Node Console | ? Help
```

### Features

1. **Node Grid View (Default)**
   - Per-node cards showing:
     - Mini LCD preview (4x3 lines)
     - Resource gauges (CPU, mem, disk, temp)
     - Status and event counts
     - Stability score with color
     - Quick action buttons

2. **Node Details Modal**
   - Full node information
   - Detailed metrics (extended stats)
   - Event history for this node
   - Per-node configuration
   - System logs viewer

3. **Network Summary**
   - Cluster-wide statistics
   - Overall health score
   - Connection status matrix
   - Network latency information

4. **Alternative List View**
   - Sortable table of nodes
   - Compact format for many nodes
   - Sortable by status, events, stability

---

## Implementation Steps

### Phase 1: Foundation (Week 1)

**Step 1: Project Setup**
```bash
# Create new Textual-based TUI module
mkdir -p /home/mm/map2-audio/tui/lcd_dashboard
touch /home/mm/map2-audio/tui/lcd_dashboard/__init__.py
touch /home/mm/map2-audio/tui/lcd_dashboard/app.py
touch /home/mm/map2-audio/tui/lcd_dashboard/screens.py
touch /home/mm/map2-audio/tui/lcd_dashboard/widgets.py
```

**Step 2: Install Dependencies**
```bash
pip install textual rich plotext-textual
```

**Step 3: Base App Structure**
- Create `LCDDashboardApp` with Textual Container
- Implement header and footer bars
- Set up tabbed interface with TabPane
- Create navigation and keybindings

### Phase 2: Tab 1 - LCD Management (Week 1-2)

**Components:**
- `NodeSelectorWidget`: Scrollable node list with status
- `LCDPreviewWidget`: Live 4x20 display emulator
- `HealthStatsWidget`: Node metrics display
- `EventQueueWidget`: Next 5 events table
- `BacklightControlWidget`: Brightness and mode controls
- `QuickActionsBar`: Test, reset, inject event buttons

**Integration:**
- WebSocket connection for live LCD updates
- API calls for node health metrics
- Event subscription to local LCD manager

### Phase 3: Tab 2 - Settings (Week 2)

**Components:**
- `BacklightSettingsSection`: Brightness, mode, schedule
- `SoundSettingsSection`: Volume, alerts, mute schedule
- `DisplaySettingsSection`: Refresh rate, scroll speed
- `EventFilterSection`: Type, severity, local/remote toggles
- `NodeRoutingSection`: Per-role event subscriptions
- `AdvancedSettingsSection`: Rules editor, test suite

**Features:**
- Form validation
- Settings persistence
- Apply/Save/Discard workflow
- Configuration export/import

### Phase 4: Tab 3 - Analytics (Week 3)

**Components:**
- `AlertFrequencyGraph`: ASCII line chart
- `AlertTypeChart`: Bar/pie chart visualization
- `NodeStabilityTable`: Node scores with trends
- `TrendInsightsPanel`: Auto-generated analysis

**Libraries:**
- `plotext` for chart rendering
- Data aggregation from event history
- Time-range filtering

### Phase 5: Tab 4 - Events (Week 3)

**Components:**
- `EventHistoryTable`: Sortable, filterable event list
- `EventDetailModal`: Full event information
- `QuickFilterBar`: Dropdown filters
- `BulkActionsBar`: Export, dismiss, copy

**Features:**
- Real-time event updates
- Event correlation display
- Search and filtering
- CSV/JSON export

### Phase 6: Tab 5 - Nodes (Week 4)

**Components:**
- `NodeGridView`: Card-based node layout
- `NodeListView`: Table-based alternative
- `NodeDetailModal`: Extended node information
- `NetworkSummaryPanel`: Cluster-wide stats

**Features:**
- Per-node LCD preview
- Resource visualization
- Health score calculation
- Click to focus node

### Phase 7: Integration & Polish (Week 4)

- WebSocket connection management
- API client integration
- Error handling and recovery
- Performance optimization
- Documentation and help system

---

## Code Structure

### Main Application

```python
# /home/mm/map2-audio/tui/lcd_dashboard/app.py

from textual.app import ComposeResult, SystemCommand
from textual.containers import Container, Horizontal, Vertical, TabbedContent, TabPane
from textual.widgets import Header, Footer, Label, Static
from .screens import (
    LCDManagementScreen,
    SettingsScreen,
    AnalyticsScreen,
    EventsScreen,
    NodesScreen,
)

class LCDDashboardApp(App):
    """Main LCD Dashboard application"""
    
    TITLE = "MAP2 LCD Management Dashboard"
    SUBTITLE = "Cluster-wide LCD monitoring and control"
    
    CSS = """
    Screen {
        layout: vertical;
        height: 100%;
    }
    
    Header {
        dock: top;
        height: 1;
    }
    
    Footer {
        dock: bottom;
        height: 2;
    }
    
    TabbedContent {
        height: 1fr;
    }
    """
    
    BINDINGS = [
        ("tab", "next_tab", "Next Tab"),
        ("shift+tab", "prev_tab", "Previous Tab"),
        ("q", "quit", "Quit"),
        ("?", "show_help", "Help"),
    ]
    
    def compose(self) -> ComposeResult:
        """Create child widgets for the app."""
        yield Header()
        
        with TabbedContent():
            with TabPane("LCD Management", id="lcd"):
                yield LCDManagementScreen()
            
            with TabPane("Settings", id="settings"):
                yield SettingsScreen()
            
            with TabPane("Analytics", id="analytics"):
                yield AnalyticsScreen()
            
            with TabPane("Events", id="events"):
                yield EventsScreen()
            
            with TabPane("Nodes", id="nodes"):
                yield NodesScreen()
        
        yield Footer()
```

### Widget Base Classes

```python
# /home/mm/map2-audio/tui/lcd_dashboard/widgets.py

from textual.widget import Widget
from textual.containers import Container
from typing import Optional
import asyncio

class APIIntegratedWidget(Widget):
    """Base widget with API client integration"""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.api_client = None  # Set by parent
        self._update_task: Optional[asyncio.Task] = None
        self.update_interval = 1.0  # seconds
    
    async def start_updates(self):
        """Start periodic updates from API"""
        self._update_task = asyncio.create_task(self._update_loop())
    
    async def stop_updates(self):
        """Stop periodic updates"""
        if self._update_task:
            self._update_task.cancel()
    
    async def _update_loop(self):
        """Periodic update loop"""
        while True:
            try:
                await self.refresh_data()
                await asyncio.sleep(self.update_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.app.log(f"Update error: {e}")
    
    async def refresh_data(self):
        """Override in subclass to fetch data"""
        pass

class LCDPreviewWidget(APIIntegratedWidget):
    """Display real-time LCD preview"""
    
    DEFAULT_CSS = """
    LCDPreviewWidget {
        width: 40;
        height: 10;
        border: solid $accent;
        content-align: center middle;
    }
    """
    
    def __init__(self, node_id: str = None):
        super().__init__()
        self.node_id = node_id
        self.lines = ["MAP2 AUDIO PLATFORM", "", "", ""]
        self.update_interval = 0.5  # 500ms for LCD
    
    async def refresh_data(self):
        """Fetch current LCD content"""
        if not self.api_client:
            return
        
        try:
            if self.node_id:
                response = await self.api_client.get_node_lcd_preview(self.node_id)
                self.lines = response.get("lines", [])[:4]
            else:
                response = await self.api_client.get_lcd_simulation()
                self.lines = response.get("lines", [])[:4]
            
            self.refresh()
        except Exception as e:
            self.app.log(f"LCD refresh error: {e}")
    
    def render(self) -> str:
        """Render LCD preview"""
        border = "┌" + "─" * 34 + "┐\n"
        footer = "└" + "─" * 34 + "┘"
        
        lcd_lines = []
        for line in self.lines:
            padded = str(line)[:20].ljust(20)
            lcd_lines.append(f"│ {padded} │")
        
        return border + "\n".join(lcd_lines) + "\n" + footer
```

---

## API Integration

### Required Endpoints (Already Exist)

```python
# LCD Management
GET  /api/lcd/status                    # System status
POST /api/lcd/page                      # Change page
GET  /api/lcd/simulation                # ASCII preview

# Node Information  
GET  /api/nodes/{node_id}/status        # Per-node health
GET  /api/nodes                         # List all nodes
GET  /api/nodes/{node_id}/lcd           # Node LCD preview

# Events
GET  /api/lcd/events?limit=100          # Event history
POST /api/lcd/events/{id}/dismiss       # Dismiss event
GET  /api/lcd/events/analytics          # Analytics data

# Settings
GET  /api/lcd/settings                  # Current settings
PUT  /api/lcd/settings                  # Update settings
GET  /api/lcd/settings/rules            # Alert rules

# WebSocket
WS   /ws/lcd-events                     # Live event stream
WS   /ws/lcd/{node_id}                  # Node LCD updates
```

### WebSocket Integration

```python
# /home/mm/map2-audio/tui/lcd_dashboard/api_client.py

import aiohttp
import asyncio
from typing import Callable, Dict, Any

class LCDAPIClient:
    """Client for LCD API with WebSocket support"""
    
    def __init__(self, base_url: str = "http://localhost:8080"):
        self.base_url = base_url
        self.session: Optional[aiohttp.ClientSession] = None
        self.ws: Optional[aiohttp.ClientWebSocketResponse] = None
        self.event_listeners: list[Callable] = []
    
    async def connect(self):
        """Establish session"""
        self.session = aiohttp.ClientSession()
    
    async def disconnect(self):
        """Close session"""
        if self.ws:
            await self.ws.close()
        if self.session:
            await self.session.close()
    
    async def subscribe_to_events(self, node_id: str = None):
        """Subscribe to LCD event stream"""
        ws_url = f"{self.base_url}/ws/lcd-events"
        
        async with self.session.ws_connect(ws_url) as ws:
            self.ws = ws
            
            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    event_data = json.loads(msg.data)
                    
                    # Notify listeners
                    for listener in self.event_listeners:
                        await listener(event_data)
    
    def on_event(self, callback: Callable):
        """Register event listener"""
        self.event_listeners.append(callback)
    
    async def get_lcd_status(self) -> Dict[str, Any]:
        """Get LCD system status"""
        async with self.session.get(f"{self.base_url}/api/lcd/status") as resp:
            return await resp.json()
    
    async def get_node_stats(self, node_id: str) -> Dict[str, Any]:
        """Get node statistics"""
        async with self.session.get(f"{self.base_url}/api/nodes/{node_id}/status") as resp:
            return await resp.json()
    
    # ... more methods ...
```

---

## Testing & Validation

### Unit Tests

```python
# /home/mm/map2-audio/tests/test_tui_lcd_dashboard.py

import pytest
from textual.pilot import Pilot
from tui.lcd_dashboard.app import LCDDashboardApp
from tui.lcd_dashboard.widgets import LCDPreviewWidget

@pytest.mark.asyncio
async def test_app_startup():
    """Test app starts successfully"""
    app = LCDDashboardApp()
    async with app.run_test() as pilot:
        # App should be running
        assert app.title == "MAP2 LCD Management Dashboard"

@pytest.mark.asyncio
async def test_lcd_preview_widget():
    """Test LCD preview renders correctly"""
    widget = LCDPreviewWidget()
    widget.lines = ["Test Line 1", "Test Line 2", "", ""]
    
    rendered = widget.render()
    assert "Test Line 1" in rendered
    assert "Test Line 2" in rendered

@pytest.mark.asyncio
async def test_tab_navigation():
    """Test tab switching"""
    app = LCDDashboardApp()
    async with app.run_test() as pilot:
        # Start on LCD tab
        await pilot.press("tab")
        # Should move to Settings tab
        await pilot.press("shift+tab")
        # Should return to LCD tab

@pytest.mark.asyncio
async def test_api_integration():
    """Test API client integration"""
    client = LCDAPIClient("http://localhost:8080")
    await client.connect()
    
    # Mock API response
    status = await client.get_lcd_status()
    assert status["running"] == True
    
    await client.disconnect()
```

### Integration Tests

```python
# Test WebSocket live updates
# Test API error handling
# Test multi-tab interaction
# Test data refresh rates
# Test keyboard bindings
```

---

## Performance Considerations

1. **WebSocket Updates:** 1Hz for LCD preview, 0.5Hz for analytics
2. **Event Queue:** Keep last 1000 events in memory
3. **Analytics Caching:** Recalculate every 5 minutes
4. **Node Grid:** Lazy render only visible cards
5. **Event Table:** Virtual scrolling for large datasets

---

## Keyboard Bindings

| Binding | Action |
|---------|--------|
| `Tab` | Next Tab |
| `Shift+Tab` | Previous Tab |
| `Q` | Quit |
| `?` | Help |
| `L` (LCD Tab) | Toggle Local Events |
| `R` (LCD Tab) | Toggle Remote Events |
| `T` (LCD Tab) | Test LCD |
| `I` (LCD Tab) | Inject Test Event |
| `D` (LCD Tab) | Dismiss Selected |
| `S` (Settings) | Save Settings |
| `E` (Events) | Export Events |
| `↑/↓` | Navigate Up/Down |
| `←/→` | Navigate Left/Right |
| `Enter` | Select/Expand |

---

## Deployment

### Running the Dashboard

```bash
# From MAP2 repository
cd /home/mm/map2-audio

# Option 1: Direct Python
python3 -m tui.lcd_dashboard.app

# Option 2: Via TUI main menu
./tui.sh
# Select "LCD Management Dashboard" from menu

# Option 3: With API server
# Start API server first
python3 app/main.py
# In another terminal:
python3 -m tui.lcd_dashboard.app --api-url http://localhost:8080
```

### Configuration

```yaml
# ~/.map2/tui_config.yaml
lcd_dashboard:
  api_url: "http://localhost:8080"
  ws_url: "ws://localhost:8080"
  update_interval: 1.0  # seconds
  theme: "dark"  # or "light"
  colors:
    critical: "red"
    warning: "yellow"
    info: "green"
    online: "green"
    offline: "red"
```

---

## Next Steps

1. **Week 1-2:** Implement Tab 1 (LCD Management) with base app structure
2. **Week 2:** Implement Tab 2 (Settings)
3. **Week 3:** Implement Tabs 3-4 (Analytics & Events)
4. **Week 4:** Implement Tab 5 (Nodes) + Integration & Testing
5. **Week 5:** Performance optimization & documentation
6. **Week 6:** User testing & feedback integration
7. **Week 7+:** Advanced features (rules, correlations, multi-channel delivery)

---

## Success Criteria

- ✅ All web UI features available in TUI
- ✅ Real-time updates (WebSocket <500ms latency)
- ✅ Responsive keyboard navigation
- ✅ Support for 100+ nodes without lag
- ✅ Complete event history (1000+ events)
- ✅ Analytics calculations <1 second
- ✅ Help system and documentation
- ✅ Configuration persistence
- ✅ Unit test coverage >80%
- ✅ Integration test suite

---

**Created:** February 7, 2026  
**Author:** MAP2 Audio Platform Development Team  
**Status:** Ready for Implementation

# TUI Cluster Architecture Documentation

**MAP2 Audio Platform - Terminal User Interface**

**Date**: February 5, 2026  
**Version**: 1.0  
**Status**: Architecture Analysis Complete

---

## Executive Summary

The MAP2 Audio Platform TUI is a sophisticated Textual-based terminal interface with:
- **13 tabs** organized into logical functional groups
- **Master screen pattern** with consistent architecture
- **LRU caching system** for memory efficiency
- **Async/await throughout** for non-blocking operations
- **CSS-in-Python** for styled terminal UI
- **API client integration** for real-time backend communication
- **Error handling framework** with graceful degradation
- **Configuration system** for themes, keybindings, and settings

All new cluster features will follow these established patterns.

---

## 1. Directory Structure & Organization

### Root: `/home/mm/map2-audio/tui/`

```
tui/
├── app.py                           # Main application (1406 lines)
│   ├─ MAP2AudioTUI (App class)      # Main TUI application
│   ├─ TabbedNavigation              # Tab navigation widget
│   ├─ LRUScreenCache                # Memory management
│   └─ FallbackScreen                # Error handling
│
├── api_client.py                    # HTTP/REST API interaction
│   └─ MAP2APIClient                 # Async HTTP client
│
├── config.py                        # Configuration management
│   ├─ ConfigManager                 # Load/save config
│   └─ KeyBindings                   # Keyboard bindings
│
├── error_handler.py                 # Error handling utilities
├── screen_state.py                  # State persistence
├── status_bar.py                    # Status bar widget
├── command_palette.py               # Command palette system
├── theme_engine.py                  # Theme system
├── context_help.py                  # Context-sensitive help
├── undo_redo.py                     # Undo/redo system
├── layout_system.py                 # Layout management
│
├── screens/                         # Screen implementations (13 screens)
│   ├── dashboard_screen.py          # Tab 1: Dashboard (750 lines)
│   ├── chains_manager_screen.py     # Tab 2: Chains
│   ├── effects_manager_screen.py    # Tab 3: Effects
│   ├── midi_sessions_screen.py      # Tab 4: MIDI
│   ├── workflow_settings_screen.py  # Tab 5: Workflow
│   ├── settings_screen.py           # Tab 6: Settings
│   ├── diagnostics_screen.py        # Tab 7: Diagnostics
│   ├── lcd_services_screen.py       # Tab 8: LCD Services
│   ├── backup_tab.py                # Tab 9: Backup
│   ├── stage_view_screen.py         # Tab 10: Stage View
│   ├── developer_mode_screen.py     # Tab 11: Developer
│   ├── backend_monitor_screen.py    # Tab 12: Monitor
│   ├── cluster_mode_screen.py       # Tab 13: Cluster (to enhance)
│   ├── test_screen.py               # Test/debug screen
│   └── __init__.py                  # Screen exports
│
├── widgets/                         # Widget library (reusable components)
│   ├── landing_dashboard_widget.py  # Main dashboard (578 lines)
│   │   ├─ AudioMeter
│   │   ├─ ChainPanel
│   │   └─ LandingDashboard
│   ├── stats_panel_widget.py        # Statistics display
│   ├── context_panel_widget.py      # Context information
│   ├── breadcrumb_widget.py         # Navigation breadcrumbs
│   ├── enhanced_status_bar_widget.py # Enhanced status bar
│   ├── system_stats_footer.py       # System statistics footer
│   ├── api_log_widget.py            # API call logging
│   ├── sidebar_widget.py            # Sidebar navigation
│   ├── mode_indicator_widget.py     # Mode indicator
│   └── __init__.py                  # Widget exports
│
├── tests/                           # Test suite (to create)
│   ├── conftest.py                  # Fixtures
│   ├── test_cluster_api_client.py   # API tests
│   ├── test_cluster_widgets.py      # Widget tests
│   ├── test_cluster_screens.py      # Screen tests
│   └── test_cluster_integration.py  # Integration tests
│
└── utils/                           # Utility modules (optional)
    └── helpers.py                   # Helper functions
```

---

## 2. Widget Architecture

### Widget Patterns

All Textual widgets inherit from `Static` and follow this pattern:

```python
class MyWidget(Static):
    # 1. CSS styling (class variable)
    DEFAULT_CSS = """
    MyWidget {
        width: 100%;
        height: auto;
        background: $surface;
    }
    """
    
    # 2. Reactive properties (for state)
    my_prop: reactive[str] = reactive("initial")
    
    # 3. Constructor
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.data = None
    
    # 4. Composition (build UI)
    def compose(self) -> ComposeResult:
        yield Label("Content")
    
    # 5. Lifecycle hooks
    async def on_mount(self) -> None:
        # Called when widget is mounted
        pass
    
    # 6. Reactive watchers
    def watch_my_prop(self, old_value, new_value):
        # Called when my_prop changes
        pass
    
    # 7. Action handlers
    async def action_do_something(self):
        # Handle user action
        pass
```

### Key Widgets in Current TUI

**AudioMeter** (landing_dashboard_widget.py:17-70)
- Displays audio level with progress bar
- Reactive properties: `level`, `peak`
- Simple horizontal layout with label + bar + value

**ChainPanel** (landing_dashboard_widget.py:73-230)
- Shows single signal chain with plugins
- Displays chain status, plugin list, input/output levels
- Uses DataTable for plugin list
- Async data refresh from API

**LandingDashboard** (landing_dashboard_widget.py:233-578)
- Main dashboard widget (578 lines)
- Displays 6 chain panels (A-F) horizontally
- Integrates multiple metrics
- Responsive to terminal size

### Widget Composition Pattern

Widgets are composed (built) using `yield` statements:

```python
def compose(self) -> ComposeResult:
    with Vertical():
        with Horizontal():
            yield Label("Title")
            yield Button("OK")
        with Container():
            yield DataTable()
```

This creates a tree structure that Textual renders.

---

## 3. Screen Architecture

### Screen Pattern

All screens are `Static` widgets displayed as tabs:

```python
class MyScreen(Static):
    # 1. CSS styling
    DEFAULT_CSS = """
    MyScreen {
        width: 100%;
        height: 100%;
        background: $surface;
    }
    """
    
    # 2. Bindings for this screen
    BINDINGS = [
        Binding("r", "refresh", "Refresh"),
        Binding("a", "some_action", "Action"),
    ]
    
    # 3. Constructor with API client
    def __init__(self, api_client=None, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client
    
    # 4. Compose (build UI)
    def compose(self) -> ComposeResult:
        with Vertical():
            yield Label("Screen Content")
    
    # 5. Lifecycle
    async def on_mount(self) -> None:
        # Start refresh intervals
        self.set_interval(5.0, self._refresh_data)
    
    # 6. Data fetching
    async def _refresh_data(self) -> None:
        # Fetch from API and update UI
        pass
    
    # 7. Action handlers
    async def action_refresh(self):
        # Handle user action
        pass
```

### Current Screens (13 Total)

| Tab # | Screen | Lines | Purpose |
|-------|--------|-------|---------|
| 1 | DashboardScreen | 750 | System overview, audio engine, metrics |
| 2 | ChainsManagerScreen | ? | Chain management and editing |
| 3 | EffectsManagerScreen | ? | Audio effects configuration |
| 4 | MIDISessionsScreen | ? | MIDI controller setup |
| 5 | WorkflowSettingsScreen | ? | Workflow configuration |
| 6 | SettingsScreen | ? | Application settings |
| 7 | DiagnosticsScreen | ? | System diagnostics |
| 8 | LCDServicesScreen | ? | LCD display control |
| 9 | BackupTab | ? | Backup management |
| 10 | StageViewScreen | ? | Stage performance mode |
| 11 | DeveloperModeScreen | ? | Developer tools |
| 12 | BackendMonitorScreen | ? | Backend monitoring |
| 13 | ClusterModeScreen | ? | **Cluster management (TO ENHANCE)** |

### Screen Lifecycle

```
Screen Created
    ↓
compose() - Build UI tree
    ↓
on_mount() - Lifecycle hook (start timers, fetch data)
    ↓
Watch reactive properties → Update UI
    ↓
Handle user actions (bindings, messages)
    ↓
_refresh_data() called periodically
    ↓
Screen destroyed (cached or removed)
```

---

## 4. Data Flow Architecture

### API Integration Flow

```
User Action (key press)
    ↓
Action handler in Screen
    ↓
API call via MAP2APIClient
    ↓
Async HTTP request
    ↓
Backend response
    ↓
Update reactive properties
    ↓
Textual detects change
    ↓
UI re-renders automatically
```

### Example: Refreshing Data

```python
class MyScreen(Static):
    async def _refresh_data(self) -> None:
        try:
            result = await self.api_client.get_nodes()
            if result.success:
                self.nodes = result.data  # Reactive property
                # UI automatically updates
        except Exception as e:
            self.notify(f"Error: {e}", severity="error")
```

### Polling Strategies

**Fast polling** (every 1-2 seconds): Metrics, status  
**Normal polling** (every 5 seconds): Data that changes  
**Slow polling** (every 30 seconds): Configuration, static data  
**WebSocket** (real-time): Critical updates (failover, assignments)

---

## 5. Styling System (CSS-in-Python)

### CSS Pattern

Every widget/screen has a `DEFAULT_CSS` class variable:

```python
DEFAULT_CSS = """
MyWidget {
    width: 100%;
    height: 3;
    background: $surface;
    border: solid $accent;
    padding: 1 2;
    margin: 0 1;
}

.my-class {
    color: $text;
    text-style: bold;
}

#my-id {
    width: 20;
    background: $panel;
}
"""
```

### CSS Selectors

- **Type selector**: `Label { ... }`
- **Class selector**: `.my-class { ... }`
- **ID selector**: `#my-id { ... }`
- **Pseudo-classes**: `:hover`, `:focus`

### Available Variables (Textual)

**Colors**:
- `$text` - Default text color
- `$text-muted` - Dimmed text
- `$surface` - Main background
- `$panel` - Panel background
- `$accent` - Highlight color
- `$primary`, `$success`, `$warning`, `$error` - Semantic colors

**Units**:
- Percentages: `100%`
- Absolute: `20` (characters)
- Relative: `1fr` (fill available space)
- Auto: `auto`

### Layout Containers

**Vertical** - Stack children vertically
```python
with Vertical():
    yield Label("Top")
    yield Label("Bottom")
```

**Horizontal** - Arrange children horizontally
```python
with Horizontal():
    yield Label("Left")
    yield Label("Right")
```

**Container** - Generic container
```python
with Container():
    yield widget
```

---

## 6. Async/Await Patterns

The entire TUI is async-first. All I/O is non-blocking:

```python
# DO: Async I/O
async def _refresh_data(self) -> None:
    result = await self.api_client.get_data()
    # Non-blocking - other actions can happen

# DON'T: Blocking I/O
def _refresh_data(self) -> None:
    result = requests.get(url)  # BLOCKS entire TUI!
```

### Common Async Patterns

**Periodic refresh**:
```python
async def on_mount(self) -> None:
    self.set_interval(5.0, self._refresh_data)
```

**Async task**:
```python
asyncio.create_task(self._refresh_data())
```

**Wait for something**:
```python
await asyncio.sleep(2.0)
await self.api_client.get_data()
```

### Error Handling

```python
try:
    result = await self.api_client.get_data()
    if result.success:
        self.data = result.data
    else:
        self.notify(f"Error: {result.error}", severity="error")
except Exception as e:
    logger.error(f"Failed: {e}")
    self.notify("Operation failed", severity="error")
```

---

## 7. State Management

### Reactive Properties

Reactive properties automatically trigger UI updates:

```python
class MyScreen(Static):
    count: reactive[int] = reactive(0)
    
    def watch_count(self, old_value, new_value):
        # Called when count changes
        label = self.query_one(Label)
        label.update(f"Count: {new_value}")
```

### State Persistence

The `screen_state` module saves screen state (scroll position, selections):

```python
from .screen_state import screen_state

async def on_mount(self):
    # Restore previous state
    state = screen_state.get_state("my_screen")
    if state:
        self.table.cursor_location = state.cursor_location
```

### API Result Pattern

```python
class APIResult:
    success: bool
    data: Optional[Any]
    error: Optional[str]
```

Used consistently across all API calls.

---

## 8. Main Application (MAP2AudioTUI)

### Key Components

**LRU Screen Cache**:
```python
class LRUScreenCache:
    def __init__(self, max_size: int = 4):
        # Keeps only 4 most-recently-used screens in memory
        # Automatically evicts least-used screens
```

**Screen Factory Mapping**:
```python
SCREEN_FACTORIES = {
    0: (DashboardScreen, "dashboard"),
    1: (ChainsManagerScreen, "chains-manager"),
    # ... etc
}
```

**Tab Navigation**:
```python
TAB_NAMES = [
    "📊 Dashboard",
    "🎸 Chains",
    # ... 13 tabs total
]
```

### Main Actions

| Key | Action | Purpose |
|-----|--------|---------|
| 1-9, 0, D, M, C | goto_tab_N | Jump to specific tab |
| ← | previous_tab | Move to previous tab |
| → | next_tab | Move to next tab |
| R | refresh | Soft refresh current screen |
| Ctrl+R | reload_modules | Hot reload modules |
| Ctrl+T | cycle_theme | Switch themes |
| F1 | show_help | Show help |
| F2 | show_diagnostics | Show diagnostics |
| Ctrl+L | toggle_api_log | Toggle API log view |
| Ctrl+Z | undo | Undo last action |
| Ctrl+Y | redo | Redo action |
| Ctrl+Shift+P | command_palette | Open command palette |

### Initialization Sequence

```python
1. __init__()
   └─ Initialize API client, cache, error handler

2. compose()
   └─ Build main UI layout:
      - Header (mode indicator)
      - Body (nav + content area)
      - Footer (API log)

3. on_mount()
   └─ Check API availability
   └─ Build nav list
   └─ Show initial tab (Dashboard)

4. show_tab(tab_index)
   └─ Get/create screen (via factory or cache)
   └─ Pass API client to screen
   └─ Display in content area
   └─ Screen's on_mount() runs
   └─ Periodic refresh starts
```

---

## 9. API Client (MAP2APIClient)

### Pattern

```python
class MAP2APIClient:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session: Optional[httpx.AsyncClient] = None
    
    async def get_something(self) -> APIResult:
        """Fetch data from /api/endpoint"""
        try:
            response = await self.session.get(f"{self.base_url}/api/endpoint")
            if response.status_code == 200:
                return APIResult(success=True, data=response.json())
            else:
                return APIResult(success=False, error=f"Status {response.status_code}")
        except Exception as e:
            return APIResult(success=False, error=str(e))
```

### Current Endpoints

**Audio/System**:
- `GET /api/audio/status` - Audio engine status
- `GET /api/audio/levels` - Audio input/output levels
- `GET /api/audio/latency` - Latency metrics
- `GET /api/health` - Backend health check

**Chains**:
- `GET /api/chains` - List all chains
- `GET /api/chains/{id}` - Get specific chain
- `POST /api/chains` - Create chain

**Plugins**:
- `GET /api/pipedal/plugins` - List available plugins
- `GET /api/pipedal/presets` - List presets

### Extension for Cluster Features

New endpoints to add:
```python
# Cluster management
async def get_cluster_nodes(self) -> APIResult:
    """GET /api/cluster/nodes"""
    
async def get_flow_assignments(self) -> APIResult:
    """GET /api/cluster/flows/assignments"""
    
async def failover_flow(self, flow_id: str, target_node: str) -> APIResult:
    """POST /api/cluster/flows/failover"""
    
# WebSocket for real-time updates
async def connect_assignments_ws(self, callback):
    """WS /ws/cluster/assignments"""
```

---

## 10. Configuration System

### ConfigManager

```python
class ConfigManager:
    def __init__(self, config_file: str = "~/.config/map2/tui.json"):
        self.config_file = config_file
    
    def try_load_config(self) -> Tuple[Dict, Optional[str]]:
        # Load from JSON file, return (config, error)
        pass
    
    def save_config(self, config: Dict):
        # Save to JSON file
        pass
```

### Default Configuration

```json
{
  "theme": "textual-dark",
  "keybindings": {
    "next_tab": "right",
    "previous_tab": "left",
    "refresh": "r"
  },
  "settings": {
    "auto_refresh": true,
    "refresh_interval": 5
  }
}
```

---

## 11. Error Handling

### Error Handler

```python
def setup_error_handler(app):
    handler = ErrorHandler(app)
    
    def handle_exception(exc_type, exc_value, traceback):
        handler.handle_ui_error(exc_value)
    
    sys.excepthook = handle_exception
    return handler
```

### User Notifications

```python
# Info notification
self.notify("Operation completed", severity="information", timeout=2)

# Warning
self.notify("Warning message", severity="warning", timeout=3)

# Error
self.notify("Error occurred", severity="error", timeout=5)
```

---

## 12. Keyboard Input & Bindings

### Binding Pattern

```python
BINDINGS = [
    Binding("ctrl+c", "quit", "Quit"),
    Binding("r", "refresh", "Refresh"),
    Binding("1", "goto_tab_0", "Tab 1"),
]

async def action_refresh(self):
    """Called when 'r' is pressed"""
    pass
```

### Available Keys

- Letters: `a` through `z`
- Numbers: `0` through `9`
- Modifiers: `ctrl`, `shift`, `alt`
- Arrows: `up`, `down`, `left`, `right`
- Special: `enter`, `escape`, `tab`, `space`
- Function: `f1` through `f12`

### Action Naming Convention

- Binding references action by name
- Action is async method named `action_<name>`
- Called automatically by Textual framework

---

## 13. Message System

### Message Pattern

```python
class MyMessage(Message):
    """Message sent by widget to app"""
    def __init__(self, data):
        super().__init__()
        self.data = data

class MyWidget(Static):
    def some_handler(self):
        self.post_message(self.MyMessage(data))

class MyApp(App):
    def on_my_widget_my_message(self, message: MyWidget.MyMessage):
        # Handle message
        pass
```

### Common Messages

Widgets send messages for:
- Selection changes
- Data updates
- User actions
- Status changes

App receives via `on_<widget>_<message>` methods.

---

## 14. Patterns to Follow for New Features

### For New Widgets

```python
# 1. Create in tui/widgets/my_widget.py
class MyWidget(Static):
    DEFAULT_CSS = """..."""
    
    def compose(self) -> ComposeResult:
        # Build UI
        pass
    
    async def on_mount(self):
        # Initialize
        pass

# 2. Export in tui/widgets/__init__.py
from .my_widget import MyWidget

# 3. Use in screens
from .widgets import MyWidget

class MyScreen(Static):
    def compose(self) -> ComposeResult:
        yield MyWidget()
```

### For New Screens

```python
# 1. Create in tui/screens/my_screen.py
class MyScreen(Static):
    DEFAULT_CSS = """..."""
    BINDINGS = [...]
    
    def __init__(self, api_client=None, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client
    
    def compose(self) -> ComposeResult:
        # Build UI
        pass
    
    async def on_mount(self):
        # Start refresh
        self.set_interval(5.0, self._refresh_data)
    
    async def _refresh_data(self):
        # Fetch and update
        pass

# 2. Register in tui/app.py
from .screens.my_screen import MyScreen

SCREEN_FACTORIES = {
    ...: (MyScreen, "my-screen"),
}

TAB_NAMES = [
    ...,
    "📁 My Tab",
]
```

### For API Endpoints

```python
# 1. Add to tui/api_client.py
class MAP2APIClient:
    async def get_my_data(self) -> APIResult:
        """GET /api/my/endpoint"""
        try:
            response = await self.session.get(
                f"{self.base_url}/api/my/endpoint"
            )
            return APIResult(
                success=response.status_code == 200,
                data=response.json() if response.status_code == 200 else None,
                error=None if response.status_code == 200 else response.text
            )
        except Exception as e:
            return APIResult(success=False, error=str(e))

# 2. Use in screens
result = await self.api_client.get_my_data()
if result.success:
    self.data = result.data
```

---

## 15. Current 13 Tabs Summary

### Tab Hierarchy

```
Navigation Tabs (TAB_NAMES in app.py):
1. 📊 Dashboard      - System overview, audio engine, metrics
2. 🎸 Chains         - Signal chain management
3. 🎛️ Effects        - Plugin and effect configuration
4. 🎹 MIDI           - MIDI controller and sessions
5. ⚙️ Workflow        - Workflow settings and automation
6. ⚙️ Settings        - Application settings
7. 🔍 Diagnostics    - System diagnostics
8. 📺 LCD            - LCD display services
9. 💾 Backup         - Backup management
10. 🎤 Stage         - Stage performance mode
11. 🔧 Developer     - Developer tools
12. 🖥️ Monitor       - Backend monitoring
13. 🛰️ Cluster       - CLUSTER MANAGEMENT (TARGET FOR ENHANCEMENT)
```

### Cluster Tab (Current State)

Located at index 12 in TAB_NAMES.  
Implemented in `tui/screens/cluster_mode_screen.py`.  
Currently minimal - this will be enhanced with 5 of the 10 new features:
- Cluster Node Dashboard (2.1)
- Flow Assignment Matrix (2.2)
- Node Recommendations (3.1)
- Failover Controller (3.2)
- Diagnostics Panel (3.3)

---

## 16. Technology Stack

**Framework**: Textual (TUI framework)  
**HTTP Client**: httpx (async HTTP)  
**Language**: Python 3.10+  
**Async Runtime**: asyncio  
**Styling**: CSS-in-Python  
**Testing**: pytest (to be set up)

---

## 17. Performance Considerations

### Memory Management
- LRUScreenCache keeps only 4 screens in memory
- Least-used screens are evicted
- Reduces memory footprint significantly

### Rendering Performance
- Textual only re-renders changed widgets
- Reactive properties trigger minimal updates
- Async operations don't block UI

### API Optimization
- Polling intervals: 1s (critical), 5s (normal), 30s (static)
- WebSocket for real-time updates (future)
- Connection pooling via httpx session

### Typical Performance Targets
- Screen render: <200ms
- API response: <500ms
- Widget update: <100ms
- Memory overhead: <100MB

---

## 18. Testing Strategy

### Unit Tests

**For Widgets**:
```python
# tui/tests/test_cluster_widgets.py
def test_data_grid_renders():
    widget = DataGridWidget(columns=["Name"], data=[])
    # Assert rendering works
```

**For API Client**:
```python
# tui/tests/test_cluster_api_client.py
async def test_get_nodes():
    client = ClusterAPIClient(base_url="...")
    result = await client.get_nodes()
    assert result.success
```

### Integration Tests

```python
# tui/tests/test_cluster_integration.py
async def test_cluster_dashboard_full_flow():
    # Initialize all components
    # Simulate data flow
    # Verify UI updates correctly
```

---

## 19. Key Takeaways for Implementation

### Design Principles
1. **Consistency** - Follow existing patterns exactly
2. **Async-first** - Never block the UI
3. **Error-tolerant** - Graceful degradation
4. **Responsive** - Immediate visual feedback
5. **Efficient** - Minimal memory and CPU

### File Organization
- Widgets in `tui/widgets/`
- Screens in `tui/screens/`
- Tests in `tui/tests/`
- API integration in `tui/api_client.py`

### Code Patterns
- All widgets: `compose()` + lifecycle hooks
- All screens: API client + periodic refresh
- All API calls: Try/except + APIResult
- All UI updates: Reactive properties

### Integration Points
- Register screens in `app.py` SCREEN_FACTORIES
- Add tab names in `app.py` TAB_NAMES
- Extend API client in `api_client.py`
- Create test fixtures in `tests/conftest.py`

---

## 20. Additional Resources

### Inside Codebase
- `tui/app.py` - Main app (reference for structure)
- `tui/screens/dashboard_screen.py` - Reference screen (750 lines)
- `tui/widgets/landing_dashboard_widget.py` - Reference widget (578 lines)
- `tui/api_client.py` - API client pattern

### External Documentation
- Textual documentation: https://textual.textualize.io
- Python asyncio: https://docs.python.org/3/library/asyncio.html
- httpx async client: https://www.python-httpx.org/

---

## Conclusion

The MAP2 Audio Platform TUI is a well-architected, maintainable codebase with:
- Clear patterns for widgets, screens, and API integration
- Comprehensive error handling
- Efficient memory and performance management
- Flexible configuration system
- 13 existing tabs to learn from

All new cluster features should follow these established patterns for consistency and quality.

---

**Document Status**: Complete  
**Last Updated**: February 5, 2026  
**Audience**: Developers implementing cluster features  
**Next Step**: Phase 1.2 - API Client Extension

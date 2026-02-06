"""
Interactive TUI Application with Tabbed Navigation
Terminal User Interface for MAP2 platform with tabs at top.

Launch from project root using:
    python -m tui.app

Improvements:
- Reorganized tabs into logical workflow groups
- Real-time status bar with metrics (CPU, RAM, latency)
- Screen state persistence (saves scroll position, selections)
- LRU screen cache to limit memory usage
- Configuration system for themes and keybindings
- Comprehensive error handling
- Base screen class for consistency
"""

import sys
import logging
from logging.handlers import RotatingFileHandler

# Configure logger globally for all modules - file only, no console output
LOG_FORMAT = '%(asctime)s [%(levelname)s] %(name)s: %(message)s'
LOG_FILE = '/tmp/map2_tui.log'
logging.basicConfig(level=logging.WARNING, format=LOG_FORMAT, handlers=[])
file_handler = RotatingFileHandler(LOG_FILE, maxBytes=2*1024*1024, backupCount=3)
file_handler.setFormatter(logging.Formatter(LOG_FORMAT))
file_handler.setLevel(logging.INFO)
root_logger = logging.getLogger()
root_logger.addHandler(file_handler)
root_logger.setLevel(logging.INFO)
logger = logging.getLogger('tui')

import asyncio
import sys
import os
import importlib
from collections import OrderedDict
from typing import Optional, Dict, Type, Any


try:
    from textual.app import App, ComposeResult
    from textual.containers import Container, Horizontal, Vertical
    from textual.widgets import Header, Footer, Label, Static, ListView, ListItem
    from textual.binding import Binding
    from textual.reactive import reactive
    from textual.message import Message
    TEXTUAL_AVAILABLE = True
except ImportError:
    TEXTUAL_AVAILABLE = False
    print("Error: Textual not available. Please install: pip install textual")
    sys.exit(1)

# Import our API client and screens
from .api_client import MAP2APIClient

# Import new master screens (Phase 2 Refactoring) - ISOLATED IMPORTS
# Each screen imported separately to prevent cascade failures
SCREEN_IMPORT_ERRORS = {}

try:
    from .screens.dashboard_screen import DashboardScreen
except ImportError as e:
    logger.warning(f"Could not import DashboardScreen: {e}")
    DashboardScreen = None
    SCREEN_IMPORT_ERRORS['DashboardScreen'] = str(e)

try:
    from .screens.chains_manager_screen import ChainsManagerScreen
except ImportError as e:
    logger.warning(f"Could not import ChainsManagerScreen: {e}")
    ChainsManagerScreen = None
    SCREEN_IMPORT_ERRORS['ChainsManagerScreen'] = str(e)

try:
    from .screens.effects_manager_screen import EffectsManagerScreen
except ImportError as e:
    logger.warning(f"Could not import EffectsManagerScreen: {e}")
    EffectsManagerScreen = None
    SCREEN_IMPORT_ERRORS['EffectsManagerScreen'] = str(e)

try:
    from .screens.midi_sessions_screen import MIDISessionsScreen
except ImportError as e:
    logger.warning(f"Could not import MIDISessionsScreen: {e}")
    MIDISessionsScreen = None
    SCREEN_IMPORT_ERRORS['MIDISessionsScreen'] = str(e)

try:
    from .screens.workflow_settings_screen import WorkflowSettingsScreen
except ImportError as e:
    logger.warning(f"Could not import WorkflowSettingsScreen: {e}")
    WorkflowSettingsScreen = None
    SCREEN_IMPORT_ERRORS['WorkflowSettingsScreen'] = str(e)

try:
    from .screens.settings_screen import SettingsScreen
except ImportError as e:
    logger.warning(f"Could not import SettingsScreen: {e}")
    SettingsScreen = None
    SCREEN_IMPORT_ERRORS['SettingsScreen'] = str(e)

try:
    from .screens.diagnostics_screen import DiagnosticsScreen
except ImportError as e:
    logger.warning(f"Could not import DiagnosticsScreen: {e}")
    DiagnosticsScreen = None
    SCREEN_IMPORT_ERRORS['DiagnosticsScreen'] = str(e)

try:
    from .screens.lcd_services_screen import LCDServicesScreen
except ImportError as e:
    logger.warning(f"Could not import LCDServicesScreen: {e}")
    LCDServicesScreen = None
    SCREEN_IMPORT_ERRORS['LCDServicesScreen'] = str(e)

try:
    from .screens.backup_tab import BackupTab
except ImportError as e:
    logger.warning(f"Could not import BackupTab: {e}")
    BackupTab = None
    SCREEN_IMPORT_ERRORS['BackupTab'] = str(e)

try:
    from .screens.stage_view_screen import StageViewScreen
except ImportError as e:
    logger.warning(f"Could not import StageViewScreen: {e}")
    StageViewScreen = None
    SCREEN_IMPORT_ERRORS['StageViewScreen'] = str(e)

try:
    from .screens.developer_mode_screen import DeveloperModeScreen
except ImportError as e:
    logger.warning(f"Could not import DeveloperModeScreen: {e}")
    DeveloperModeScreen = None
    SCREEN_IMPORT_ERRORS['DeveloperModeScreen'] = str(e)

try:
    from .screens.backend_monitor_screen import BackendMonitorScreen
except ImportError as e:
    logger.warning(f"Could not import BackendMonitorScreen: {e}")
    BackendMonitorScreen = None
    SCREEN_IMPORT_ERRORS['BackendMonitorScreen'] = str(e)

try:
    from .screens.cluster_mode_screen import ClusterModeScreen
except ImportError as e:
    logger.warning(f"Could not import ClusterModeScreen: {e}")
    ClusterModeScreen = None
    SCREEN_IMPORT_ERRORS['ClusterModeScreen'] = str(e)

try:
    from .screens.test_screen import TestScreen
except ImportError as e:
    logger.warning(f"Could not import TestScreen: {e}")
    TestScreen = None
    SCREEN_IMPORT_ERRORS['TestScreen'] = str(e)

# Check if at least some screens loaded
MASTER_SCREENS_AVAILABLE = any([
    DashboardScreen, ChainsManagerScreen, EffectsManagerScreen,
    MIDISessionsScreen, WorkflowSettingsScreen, SettingsScreen,
    DiagnosticsScreen, LCDServicesScreen, BackupTab, StageViewScreen,
    DeveloperModeScreen, BackendMonitorScreen, ClusterModeScreen
])

if SCREEN_IMPORT_ERRORS:
    logger.warning(f"Screen import errors: {SCREEN_IMPORT_ERRORS}")

# Fallback to old screens if master screens not available
if not MASTER_SCREENS_AVAILABLE:
    from .screens import (
        ChainsScreen,
        MIDIScreen,
        PluginLoaderScreen,
        MetricsTab,
        WorkflowTab,
        GuitarChainScreen,
        AboutTab,
        BackupTab,
        ControlPanelScreen,
        AutomationTab,
        NetworkTab,
        WWWTab,
    )

# Import new improvement modules - WORLD-CLASS ENHANCEMENTS
try:
    from .status_bar import StatusBar
    from .config import ConfigManager, KeyBindings
    from .error_handler import setup_error_handler
    from .screen_state import screen_state
    
    # Phase 1 Improvements - Quick Wins
    from .command_palette import command_palette, CommandCategory
    from .theme_engine import theme_engine
    from .context_help import context_help
    from .undo_redo import undo_redo
    from .layout_system import layout_system, LayoutMode
    
    # Phase 2 Improvements - Advanced Features
    from .performance_monitor import performance_monitor
    from .virtual_renderer import virtual_renderer
    from .resilience_system import resilience_system
    
    IMPROVEMENTS_AVAILABLE = True
except ImportError as e:
    print(f"Warning: Could not import improvement modules: {e}")
    StatusBar = None
    config = None
    setup_error_handler = None
    screen_state = None
    IMPROVEMENTS_AVAILABLE = False

# Import new UI components - Phase 3 Refactoring
try:
    from .widgets.stats_panel_widget import StatsPanel
    from .widgets.context_panel_widget import ContextPanelWidget
    from .widgets.breadcrumb_widget import BreadcrumbWidget
    from .widgets.enhanced_status_bar_widget import EnhancedStatusBarWidget
    from .widgets.system_stats_footer import SystemStatsFooter
    from .widgets.api_log_widget import APILogWidget
    from .widgets.landing_dashboard_widget import LandingDashboard
    from .widgets.sidebar_widget import SidebarWidget
    from .widgets.mode_indicator_widget import ModeIndicatorWidget
    UI_COMPONENTS_AVAILABLE = True
except ImportError as e:
    print(f"Warning: Could not import UI components: {e}")
    StatsPanel = None
    ContextPanelWidget = None
    BreadcrumbWidget = None
    EnhancedStatusBarWidget = None
    SystemStatsFooter = None
    APILogWidget = None
    LandingDashboard = None
    SidebarWidget = None
    ModeIndicatorWidget = None
    UI_COMPONENTS_AVAILABLE = False



import time

class FallbackScreen(Static):
    """
    Fallback screen displayed when a screen fails to load.
    Shows helpful error information and suggestions.
    """
    
    _instance_counter = 0

    DEFAULT_CSS = """
    FallbackScreen {
        width: 100%;
        height: 100%;
        background: $surface;
        padding: 2;
    }

    FallbackScreen .error-title {
        text-style: bold;
        color: $error;
        margin-bottom: 1;
    }

    FallbackScreen .error-details {
        color: $text-muted;
        margin-bottom: 2;
    }

    FallbackScreen .suggestions {
        color: $text;
        margin-top: 1;
    }
    """

    def __init__(self, tab_name: str, error_message: str, id: str = None):
        # Generate unique ID if provided ID could conflict
        FallbackScreen._instance_counter += 1
        unique_id = f"{id or 'fallback'}-{FallbackScreen._instance_counter}"
        super().__init__(id=unique_id)
        self.tab_name = tab_name
        self.error_message = error_message

    def compose(self) -> ComposeResult:
        yield Label(f"❌ Could not load: {self.tab_name}", classes="error-title")
        yield Label(f"Error: {self.error_message}", classes="error-details")
        yield Label(
            "Suggestions:\n"
            "  • Press R to refresh\n"
            "  • Check /tmp/map2_tui.log for details\n"
            "  • Use arrow keys to try other tabs\n"
            "  • Press Q to quit and restart",
            classes="suggestions"
        )


class LRUScreenCache:
    """
    LRU cache for screen instances.

    Keeps only the most recently used screens in memory to reduce
    memory footprint. Automatically evicts least recently used screens
    when capacity is exceeded.
    """

    def __init__(self, max_size: int = 4):
        """
        Initialize LRU cache.

        Args:
            max_size: Maximum number of screens to keep in memory
        """
        self.max_size = max_size
        self._cache: OrderedDict[int, Any] = OrderedDict()
        self._access_count = 0
        self._eviction_count = 0

    def get(self, tab_index: int) -> Optional[Any]:
        """
        Get a screen from cache.

        Args:
            tab_index: Tab index

        Returns:
            Cached screen instance or None
        """
        if tab_index in self._cache:
            # Move to end (most recently used)
            self._cache.move_to_end(tab_index)
            self._access_count += 1
            return self._cache[tab_index]
        return None

    def put(self, tab_index: int, screen: Any) -> None:
        """
        Put a screen into the cache.

        Args:
            tab_index: Tab index
            screen: Screen instance
        """
        if tab_index in self._cache:
            # Update existing and move to end
            self._cache.move_to_end(tab_index)
            self._cache[tab_index] = screen
        else:
            # Add new entry
            self._cache[tab_index] = screen

            # Evict if over capacity
            while len(self._cache) > self.max_size:
                evicted_index, evicted_screen = self._cache.popitem(last=False)
                self._eviction_count += 1
                logger.debug(f"LRU cache evicted screen for tab {evicted_index}")

    def remove(self, tab_index: int) -> Optional[Any]:
        """
        Remove a screen from cache.

        Args:
            tab_index: Tab index

        Returns:
            Removed screen or None
        """
        return self._cache.pop(tab_index, None)

    def clear(self) -> None:
        """Clear all cached screens."""
        self._cache.clear()

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        return {
            "cached_screens": list(self._cache.keys()),
            "cache_size": len(self._cache),
            "max_size": self.max_size,
            "access_count": self._access_count,
            "eviction_count": self._eviction_count
        }

API_BASE = "http://localhost:8080"


class TabbedNavigation(Static):
    """Tabbed navigation bar with keyboard navigation support."""

    DEFAULT_CSS = """
    TabbedNavigation {
        height: 3;
        width: 100%;
        background: $panel-darken-1;
        border: thick $accent;
        border-top: none;
        border-left: none;
        border-right: none;
    }

    .tabs-container {
        width: 100%;
        height: 100%;
        align: center middle;
    }

    .tab {
        height: 100%;
        padding: 0 3;
        background: $panel;
        color: $text-muted;
        text-align: center;
        border-right: solid $panel-lighten-1;
        text-style: none;
    }

    .tab:hover {
        background: $accent 30%;
        color: $text;
    }

    .tab-active {
        background: $accent;
        color: $text;
        text-style: bold;
        border-bottom: double $success;
    }

    .tab-primary {
        background: $success-darken-1;
        color: $text;
        text-style: bold;
        padding: 0 4;
        min-width: 20;
    }

    .tab-primary:hover {
        background: $success;
    }

    .tab-primary.tab-active {
        background: $success;
        color: $text;
        text-style: bold;
        border-bottom: double $warning;
    }

    .tab-label {
        margin: 0;
    }
    """

    active_tab: reactive[int] = reactive(0)

    def __init__(self, tabs: list[str], primary_index: int = 0, id: str = None):
        super().__init__(id=id)
        self.tabs = tabs
        self.tab_count = len(tabs)
        self.primary_index = primary_index

    def compose(self) -> ComposeResult:
        with Horizontal(classes="tabs-container"):
            for i, tab_name in enumerate(self.tabs):
                is_primary = i == self.primary_index
                is_active = i == 0

                if is_primary:
                    tab_class = "tab tab-primary tab-active" if is_active else "tab tab-primary"
                else:
                    tab_class = "tab tab-active" if is_active else "tab"

                yield Label(tab_name, classes=tab_class, id=f"tab-{i}")

    def watch_active_tab(self, old_index: int, new_index: int) -> None:
        """Update visual state when active tab changes."""
        # Remove active class from old tab
        if old_tab := self.query_one(f"#tab-{old_index}", Label):
            old_tab.remove_class("tab-active")

        # Add active class to new tab
        if new_tab := self.query_one(f"#tab-{new_index}", Label):
            new_tab.add_class("tab-active")

    def next_tab(self) -> None:
        """Move to next tab (right arrow)."""
        self.active_tab = (self.active_tab + 1) % self.tab_count
        self.post_message(self.TabChanged(self.active_tab))

    def previous_tab(self) -> None:
        """Move to previous tab (left arrow)."""
        self.active_tab = (self.active_tab - 1) % self.tab_count
        self.post_message(self.TabChanged(self.active_tab))

    def select_tab(self, index: int) -> None:
        """Select specific tab by index."""
        if 0 <= index < self.tab_count:
            self.active_tab = index
            self.post_message(self.TabChanged(self.active_tab))

    class TabChanged(Message):
        """Message sent when tab changes."""
        def __init__(self, tab_index: int) -> None:
            super().__init__()
            self.tab_index = tab_index


class MAP2AudioTUI(App):
    async def check_api_availability(self, retries=3, backoff=2):
        """Check if API is available, with retries and exponential backoff."""
        import httpx
        url = f"{API_BASE}/api/health"
        for attempt in range(retries):
            try:
                async with httpx.AsyncClient(timeout=3) as client:
                    resp = await client.get(url)
                    if resp.status_code == 200:
                        return True
            except Exception as e:
                await asyncio.sleep(backoff ** attempt)
        self.notify("⚠️ API backend is unreachable. Running in degraded mode.", severity="warning", timeout=8)
        return False

    def handle_exception(self, exc_type, exc_value, exc_traceback):
        """Global exception hook for uncaught exceptions."""
        if self.error_handler:
            msg = self.error_handler.handle_ui_error(exc_value, "Uncaught Exception")
            self.error_handler.show_error(msg, severity="error", timeout=10)
        logger.critical("Uncaught exception", exc_info=(exc_type, exc_value, exc_traceback))

    def run(self):
        import sys
        sys.excepthook = self.handle_exception
        super().run()
    def __init__(self, daemon_mode: bool = False):
        super().__init__()
        self.daemon_mode = daemon_mode
        self.api_client = MAP2APIClient(base_url=API_BASE)
        self.current_tab = 0
        self._screen_cache = LRUScreenCache(max_size=4)
        self.error_handler = setup_error_handler(self) if setup_error_handler else None
        self._status_bar: Optional[StatusBar] = None
        # Config loading with error notification
        self.config_manager = ConfigManager()
        self.config, self.config_error = self.config_manager.try_load_config()
    """
    Main TUI application with tabbed navigation.

    Features:
    - Tabs at top 10% of window
    - Arrow key navigation (Left/Right to switch tabs)
    - Enter to select/activate
    - Number keys for entering values
    - No mouse required
    """

    CSS = """
    Screen {
        background: $surface;
        layout: vertical;
    }
    
    Label {
        width: 100%;
    }
    
    #header-section {
        width: 100%;
        height: auto;
        min-height: 5;
        background: $surface-darken-1;
        layout: vertical;
        border-bottom: thick $accent;
    }

    #tabs-bar {
        width: 100%;
        height: 3;
        min-height: 3;
        background: $accent 30%;
        color: $text;
        text-style: bold;
        padding: 0 1;
        content-align: left middle;
        border: thick $accent;
        border-top: none;
        border-left: none;
        border-right: none;
        overflow: hidden;
    }

    #body {
        width: 100%;
        height: 1fr;
        layout: horizontal;
    }

    #nav-panel {
        width: 26;
        min-width: 24;
        height: 1fr;
        background: $surface-darken-1;
        border-right: thick $accent;
        padding: 1 0;
    }

    #nav-list {
        width: 100%;
        height: 1fr;
        background: $surface-darken-1;
    }

    #status-bar {
        width: 100%;
        height: auto;
        background: $panel;
        color: $text-muted;
        border-bottom: solid $primary;
        padding: 0 1;
        overflow: hidden;
    }

    #breadcrumb {
        width: 100%;
        height: auto;
        background: $panel 20%;
        color: $text-muted;
        padding: 0 1;
        content-align: left middle;
        border-bottom: solid $panel-lighten-1;
        overflow: hidden;
    }
    
    #footer-section {
        width: 100%;
        height: 15;
        min-height: 12;
        background: $surface;
        layout: vertical;
        border-top: solid $accent;
    }

    #footer-section.hidden {
        display: none;
    }

    #api-log {
        width: 100%;
        height: 100%;
        background: #1E272E;
        border: none;
        padding: 0;
    }

    #main-content {
        width: 1fr;
        height: 1fr;
        layout: vertical;
        border: none;
        padding: 0;
    }

    #content-area {
        width: 1fr;
        height: 1fr;
        background: $surface;
        border: none;
        padding: 0;
        overflow: auto;
        layout: vertical;
    }

    #context-panel {
        width: 100%;
        height: auto;
        background: $panel 20%;
        color: $text-muted;
        padding: 1 1;
        border-top: solid $panel-lighten-1;
        overflow: auto;
    }

    #enhanced-status-bar {
        width: 100%;
        height: auto;
        background: $panel;
        color: $text-muted;
        padding: 0 1;
        content-align: right middle;
        border-top: solid $panel-lighten-1;
        overflow: hidden;
    }

    #keyboard-hints {
        width: 100%;
        height: auto;
        background: $panel 40%;
        color: $text-muted;
        text-style: dim;
        padding: 0 1;
        content-align: left middle;
        border-top: solid $panel-lighten-1;
        overflow: hidden;
        text-overflow: fold;
    }

    #system-stats-footer {
        width: 100%;
        height: 3;
        background: $panel;
        border-top: solid $accent;
        padding: 0;
    }
    """

    BINDINGS = [
        Binding("q", "quit", "Quit", show=True),
        Binding("left", "previous_tab", "Previous", show=True),
        Binding("right", "next_tab", "Next", show=True),
        Binding("r", "refresh", "Refresh", show=True),
        Binding("ctrl+r", "reload_modules", "Hot Reload", show=True),
        
        # WORLD-CLASS FEATURES
        Binding("ctrl+shift+p", "command_palette", "Commands", show=True),
        Binding("ctrl+f", "search", "Search", show=True),
        Binding("ctrl+z", "undo", "Undo", show=True),
        Binding("ctrl+shift+z", "redo", "Redo", show=False),
        Binding("ctrl+y", "redo", "Redo", show=False),
        Binding("f1", "show_help", "Help", show=True),
        Binding("f2", "show_diagnostics", "Diagnostics", show=True),
        Binding("ctrl+l", "toggle_api_log", "API Log", show=True),
        Binding("f10", "toggle_perf_monitor", "Perf", show=True),
        Binding("alt+1", "layout_compact", "Compact", show=False),
        Binding("alt+2", "layout_normal", "Normal", show=False),
        Binding("alt+3", "layout_wide", "Wide", show=False),
        Binding("alt+4", "layout_fullscreen", "Fullscreen", show=False),
        Binding("alt+5", "layout_sidebar_left", "Sidebar-L", show=False),
        Binding("alt+6", "layout_sidebar_right", "Sidebar-R", show=False),
        Binding("ctrl+t", "cycle_theme", "Theme", show=True),
        
        # Tab shortcuts: 1-9 for the 9 master tabs
        Binding("1", "goto_tab_0", "Dashboard", show=True),
        Binding("2", "goto_tab_1", "Chains", show=True),
        Binding("3", "goto_tab_2", "Effects", show=True),
        Binding("4", "goto_tab_3", "MIDI", show=True),
        Binding("5", "goto_tab_4", "Workflow", show=True),
        Binding("6", "goto_tab_5", "Settings", show=True),
        Binding("7", "goto_tab_6", "Diagnostics", show=True),
        Binding("8", "goto_tab_7", "LCD", show=True),
        Binding("9", "goto_tab_8", "Backup", show=True),
        Binding("0", "goto_tab_9", "Stage", show=True),
        Binding("d", "goto_tab_10", "Developer", show=True),
        Binding("m", "goto_tab_11", "Monitor", show=True),
        Binding("c", "goto_tab_12", "Cluster", show=True),
    ]

    # New simplified screen factory mapping: 12 tabs
    # Tab 0 uses LandingDashboard as the main landing zone
    SCREEN_FACTORIES = {
        0: (LandingDashboard if UI_COMPONENTS_AVAILABLE and LandingDashboard else DashboardScreen, "dashboard"),
        1: (ChainsManagerScreen, "chains-manager"),
        2: (EffectsManagerScreen, "effects-manager"),
        3: (MIDISessionsScreen, "midi-sessions"),
        4: (WorkflowSettingsScreen, "workflow-settings"),
        5: (SettingsScreen, "settings"),
        6: (DiagnosticsScreen, "diagnostics"),
        7: (LCDServicesScreen, "lcd-services"),
        8: (BackupTab, "backup"),
        9: (StageViewScreen, "stage-view"),
        10: (DeveloperModeScreen, "developer-mode"),
        11: (BackendMonitorScreen, "backend-monitor"),
        12: (ClusterModeScreen, "cluster-mode"),
    }

    # New tab names for 12 master screens
    TAB_NAMES = [
        "📊 Dashboard",
        "🎸 Chains",
        "🎛️ Effects",
        "🎹 MIDI",
        "⚙️ Workflow",
        "⚙️ Settings",
        "🔍 Diagnostics",
        "📺 LCD",
        "💾 Backup",
        "🎤 Stage",
        "🔧 Developer",
        "🖥️ Monitor",
        "🛰️ Cluster",
    ]

    def __init__(self, daemon_mode: bool = False):
        super().__init__()
        self.daemon_mode = daemon_mode
        self.api_client = MAP2APIClient(base_url=API_BASE)
        self.current_tab = 0  # Start on Dashboard tab by default
        self._nav_items: Dict[int, Any] = {}

        # Reorganized to 7 master screens (Phase 2 Refactoring)
        # All features now organized logically into these categories
        # LRU cache for screen instances (keeps max 4 screens in memory)
        self._screen_cache = LRUScreenCache(max_size=4)
        self.error_handler = setup_error_handler(self) if setup_error_handler else None
        self._status_bar: Optional[StatusBar] = None
        self._sidebar: Optional[SidebarWidget] = None

    def compose(self) -> ComposeResult:
        # Show config error notification if present
        if getattr(self, 'config_error', None):
            self.notify(f"⚠️ Config load error: {self.config_error}", severity="warning", timeout=6)
        """Create main UI layout with proper container nesting."""
        # Header section - fixed height with mode indicator
        with Vertical(id="header-section"):
            # Mode indicator
            if UI_COMPONENTS_AVAILABLE and ModeIndicatorWidget:
                yield ModeIndicatorWidget()
            else:
                yield Label("MODE", id="mode-placeholder")

        # Body area with left nav and content
        with Horizontal(id="body"):
            with Vertical(id="nav-panel"):
                yield ListView(id="nav-list")
            with Vertical(id="main-content"):
                yield Container(id="content-area")

        # Footer section - API call log (hidden by default, toggle with Ctrl+L)
        with Vertical(id="footer-section", classes="hidden"):
            # Real-time API call log showing all backend requests
            if UI_COMPONENTS_AVAILABLE and APILogWidget:
                yield APILogWidget(self.api_client)
            else:
                yield Label(
                    "⌨️ KEYS: ←→ tabs | r refresh | Ctrl+L log | Ctrl+R reload | Ctrl+T theme | F1 help | q quit",
                    id="keyboard-hints"
                )

    async def on_mount(self) -> None:
        """Initialize app and show Dashboard tab."""
        self.title = "MAP2 Audio Platform - Dashboard"
        self.sub_title = "Keys: ← → tabs | r refresh | Ctrl+L API log | Ctrl+T theme | F1 help | q quit"

        # Set Textual Dark theme
        self.theme = "textual-dark"

        # Check API availability
        api_ok = await self.check_api_availability()
        if not api_ok:
            self.notify("Some features may be unavailable until backend is restored.", severity="warning", timeout=8)
        self._build_nav_list()
        await self.show_tab(0)  # Start on Dashboard

    def _build_nav_list(self) -> None:
        """Build the left navigation list from TAB_NAMES."""
        try:
            nav_list = self.query_one("#nav-list", ListView)
            nav_list.clear()
            self._nav_items.clear()

            for i, name in enumerate(self.TAB_NAMES):
                label = Label(f"[{i+1}] {name}")
                item = ListItem(label, name=f"nav-{i}")
                nav_list.append(item)
                self._nav_items[i] = item

            nav_list.index = self.current_tab
        except Exception as e:
            logger.debug(f"Could not build nav list: {e}")

    async def action_previous_tab(self) -> None:
        """Handle left arrow - previous tab."""
        new_tab = (self.current_tab - 1) % len(self.TAB_NAMES)
        await self.show_tab(new_tab)

    async def action_next_tab(self) -> None:
        """Handle right arrow - next tab."""
        new_tab = (self.current_tab + 1) % len(self.TAB_NAMES)
        await self.show_tab(new_tab)

    async def action_refresh(self) -> None:
        """Handle R key - refresh current screen (soft refresh)."""
        self.notify("Refreshing current screen...", severity="information", timeout=2)
        await self.show_tab(self.current_tab, force_refresh=True)
        self.notify("Screen refreshed!", severity="information", timeout=2)

    async def action_reload_modules(self) -> None:
        """Handle Ctrl+R - hot reload all modules and CSS (hard refresh)."""
        self.notify("Hot reloading modules and CSS...", severity="warning", timeout=3)

        try:
            # Reload screen modules
            import screens
            importlib.reload(screens)

            # Reload individual screen modules
            from screens import chains_refactored, midi, plugin_loader, metrics_tab, workflow_tab, guitar, about_tab, backup_tab
            importlib.reload(chains_refactored)
            importlib.reload(midi)
            importlib.reload(plugin_loader)
            importlib.reload(metrics_tab)
            importlib.reload(workflow_tab)
            importlib.reload(guitar)
            importlib.reload(about_tab)
            importlib.reload(backup_tab)

            # Re-import screen classes
            from screens import (
                ChainsScreen,
                ChainsScreenRefactored,
                MIDIScreen,
                PluginLoaderScreen,
                MetricsTab,
                WorkflowTab,
                GuitarChainScreen,
                AboutTab,
                BackupTab,
            )

            # Update globals so new instances use reloaded classes
            globals()['ChainsScreen'] = ChainsScreen
            globals()['ChainsScreenRefactored'] = ChainsScreenRefactored
            globals()['MIDIScreen'] = MIDIScreen
            globals()['PluginLoaderScreen'] = PluginLoaderScreen
            globals()['MetricsTab'] = MetricsTab
            globals()['WorkflowTab'] = WorkflowTab
            globals()['GuitarChainScreen'] = GuitarChainScreen
            globals()['AboutTab'] = AboutTab
            globals()['BackupTab'] = BackupTab

            # Refresh CSS by reloading the current theme
            self.refresh_css()

            # Force refresh current screen with new code
            await self.show_tab(self.current_tab, force_refresh=True)

            self.notify("Hot reload complete!", severity="information", timeout=3)

        except Exception as e:
            self.notify(f"Hot reload failed: {str(e)}", severity="error", timeout=5)

    async def action_undo(self) -> None:
        """Handle Ctrl+Z - undo last action."""
        result = await self.api_client.undo()
        if result.success:
            action_name = result.data.get("undone_action", "action") if result.data else "action"
            self.notify(f"Undone: {action_name}", severity="information", timeout=2)
            await self.show_tab(self.current_tab, force_refresh=True)
        else:
            error = result.error or "Nothing to undo"
            if "nothing" in error.lower() or "cannot" in error.lower():
                self.notify("Nothing to undo", severity="warning", timeout=2)
            else:
                self.notify(f"Undo failed: {error}", severity="error", timeout=3)

    async def action_redo(self) -> None:
        """Handle Ctrl+Y or Ctrl+Shift+Z - redo last undone action."""
        result = await self.api_client.redo()
        if result.success:
            action_name = result.data.get("redone_action", "action") if result.data else "action"
            self.notify(f"Redone: {action_name}", severity="information", timeout=2)
            await self.show_tab(self.current_tab, force_refresh=True)
        else:
            error = result.error or "Nothing to redo"
            if "nothing" in error.lower() or "cannot" in error.lower():
                self.notify("Nothing to redo", severity="warning", timeout=2)
            else:
                self.notify(f"Redo failed: {error}", severity="error", timeout=3)

    async def action_show_help(self) -> None:
        """Show keyboard shortcuts help."""
        help_text = """
╔═══════════════════════════════════════════════════════════════════════╗
║                     MAP2 AUDIO PLATFORM - HELP                        ║
╠═══════════════════════════════════════════════════════════════════════╣
║  TAB NAVIGATION                                                       ║
║    1-9         Jump directly to tabs 1-9                              ║
║    ← / →       Previous / Next tab                                    ║
║    Tab         Focus next element within screen                       ║
║    Shift+Tab   Focus previous element                                 ║
║                                                                       ║
║  TABS:                                                                ║
║    1 = Dashboard     5 = Workflow      8 = LCD                        ║
║    2 = Chains        6 = Settings      9 = Backup                     ║
║    3 = Effects       7 = Diagnostics   0 = Stage View                 ║
║    4 = MIDI                                                           ║
║                                                                       ║
╠═══════════════════════════════════════════════════════════════════════╣
║  GENERAL ACTIONS                                                      ║
║    r           Refresh current screen (soft reload)                   ║
║    Ctrl+R      Hot reload modules & CSS (development)                 ║
║    Ctrl+Z      Undo last action                                       ║
║    Ctrl+Y      Redo (or Ctrl+Shift+Z)                                 ║
║    F1          Show this help                                         ║
║    F2          Go to Diagnostics tab                                  ║
║    q           Quit application                                       ║
║                                                                       ║
╠═══════════════════════════════════════════════════════════════════════╣
║  INTERFACE FEATURES                                                   ║
║    Ctrl+L         Toggle API Call Log (hidden by default)             ║
║    Ctrl+T         Cycle through color themes                          ║
║    Ctrl+Shift+P   Open Command Palette                                ║
║    Ctrl+F         Search                                              ║
║    F10            Toggle Performance Monitor                          ║
║                                                                       ║
╠═══════════════════════════════════════════════════════════════════════╣
║  LAYOUT MODES                                                         ║
║    Alt+1   Compact       Alt+4   Fullscreen                           ║
║    Alt+2   Normal        Alt+5   Sidebar Left                         ║
║    Alt+3   Wide          Alt+6   Sidebar Right                        ║
║                                                                       ║
╠═══════════════════════════════════════════════════════════════════════╣
║  WITHIN SCREENS (varies by tab)                                       ║
║    Enter       Activate/select focused item                           ║
║    Space       Toggle checkbox / expand item                          ║
║    Escape      Cancel / close dialog                                  ║
║    ↑ / ↓       Navigate lists and options                             ║
║                                                                       ║
║  Press any key to close this help                                     ║
╚═══════════════════════════════════════════════════════════════════════╝
"""
        self.notify(help_text.strip(), severity="information", timeout=20)

    # Number key shortcuts for direct tab access (now 7 tabs instead of 13)
    async def action_goto_tab_0(self) -> None:
        """Go to Dashboard tab."""
        await self.show_tab(0)

    async def action_goto_tab_1(self) -> None:
        """Go to Chains Manager tab."""
        await self.show_tab(1)

    async def action_goto_tab_2(self) -> None:
        """Go to Effects Manager tab."""
        await self.show_tab(2)

    async def action_goto_tab_3(self) -> None:
        """Go to MIDI & Sessions tab."""
        await self.show_tab(3)

    async def action_goto_tab_4(self) -> None:
        """Go to Workflow & Settings tab."""
        await self.show_tab(4)

    async def action_goto_tab_5(self) -> None:
        """Go to Settings tab."""
        await self.show_tab(5)

    async def action_goto_tab_6(self) -> None:
        """Go to Diagnostics tab."""
        await self.show_tab(6)

    async def action_goto_tab_7(self) -> None:
        """Go to LCD Services tab."""
        await self.show_tab(7)

    async def action_goto_tab_8(self) -> None:
        """Go to Backup tab."""
        await self.show_tab(8)

    async def action_goto_tab_9(self) -> None:
        """Go to Stage View tab - Full-screen performance display."""
        await self.show_tab(9)
    
    async def action_goto_tab_10(self) -> None:
        """Go to Developer Mode tab - Build optimization controls."""
        await self.show_tab(10)

    async def action_goto_tab_11(self) -> None:
        """Go to Backend Monitor tab - Services health monitoring."""
        await self.show_tab(11)

    async def action_goto_tab_12(self) -> None:
        """Go to Cluster Mode tab - Deployment & discovery control."""
        await self.show_tab(12)

    async def _clear_content_area(self) -> None:
        """Clear the content area, properly removing all widgets."""
        try:
            content_area = self.query_one("#content-area", Container)
            children = list(content_area.children)
            for widget in children:
                await widget.remove()
        except Exception as e:
            logger.warning(f"Could not clear content area: {e}")

    def _create_screen(self, tab_index: int) -> Optional[Any]:
        """
        Create a new screen instance using the factory pattern.

        Args:
            tab_index: Tab index

        Returns:
            New screen instance, FallbackScreen on error, or None if invalid index
        """
        if tab_index not in self.SCREEN_FACTORIES:
            return FallbackScreen(
                f"Tab {tab_index}",
                "Invalid tab index",
                id=f"fallback-{tab_index}"
            )

        screen_class, widget_id = self.SCREEN_FACTORIES[tab_index]
        tab_name = self.TAB_NAMES[tab_index] if tab_index < len(self.TAB_NAMES) else f"Tab {tab_index}"

        # Handle string references for lazy imports
        if isinstance(screen_class, str):
            try:
                from screens import HealthTabScreen
                screen_class = HealthTabScreen
            except ImportError as e:
                logger.error(f"Failed to import HealthTabScreen: {e}")
                return FallbackScreen(tab_name, str(e), id=f"fallback-{tab_index}")

        # Check if screen class is available
        if screen_class is None:
            # Look up the specific import error
            screen_class_name = widget_id.replace("-", "_").title().replace("_", "") + "Screen"
            error_msg = SCREEN_IMPORT_ERRORS.get(screen_class_name, "Screen class not available")
            logger.error(f"Screen class for tab {tab_index} ({tab_name}) is None: {error_msg}")
            return FallbackScreen(tab_name, error_msg, id=f"fallback-{tab_index}")

        # Try to create the screen instance
        try:
            return screen_class(self.api_client, id=widget_id)
        except Exception as e:
            logger.error(f"Failed to instantiate screen for tab {tab_index}: {e}")
            return FallbackScreen(tab_name, str(e), id=f"fallback-{tab_index}")

    async def show_tab(self, tab_index: int, force_refresh: bool = False) -> None:
        """
        Show the selected tab's content using lazy loading with LRU cache.

        Args:
            tab_index: Tab index to show
            force_refresh: If True, recreate the screen instance
        """
        self.current_tab = tab_index
        await self._clear_content_area()
        self._update_tab_display()

        # If force refresh, remove from cache
        if force_refresh:
            self._screen_cache.remove(tab_index)

        # Try to get from cache
        screen = self._screen_cache.get(tab_index)

        # Create if not cached
        if screen is None:
            try:
                screen = self._create_screen(tab_index)
                if screen:
                    self._screen_cache.put(tab_index, screen)
                    logger.debug(f"Created new screen for tab {tab_index}, cache: {self._screen_cache.get_stats()}")
                else:
                    error_msg = self.error_handler.handle_ui_error(Exception("Could not load tab"), f"Tab {tab_index}") if self.error_handler else f"Could not load tab {tab_index}"
                    self._show_error_screen(error_msg)
                    return
            except Exception as e:
                error_msg = self.error_handler.handle_ui_error(e, f"Loading tab {tab_index}") if self.error_handler else f"Error loading tab: {e}"
                self.notify(error_msg, severity="error", timeout=5)
                self._show_error_screen(error_msg)
                return

        # Mount the screen
        if screen:
            try:
                content_area = self.query_one("#content-area", Container)
                await content_area.mount(screen)
                # Refresh to ensure the screen renders
                content_area.refresh()
                self.refresh()
            except Exception as e:
                logger.error(f"Error mounting screen: {e}", exc_info=True)
                raise
    
    def _update_tab_display(self) -> None:
        """Update navigation selection when tab changes."""
        try:
            nav_list = self.query_one("#nav-list", ListView)
            nav_list.index = self.current_tab
        except Exception as e:
            logger.debug(f"Could not update tab display: {e}")

    async def on_list_view_selected(self, event: ListView.Selected) -> None:
        """Handle left nav list selection."""
        try:
            if event.list_view.id == "nav-list":
                await self.show_tab(event.list_view.index)
        except Exception as e:
            logger.debug(f"Nav list selection error: {e}")
    
    def _show_error_screen(self, message: str) -> None:
        """Show error screen with user-friendly message."""
        try:
            content_area = self.query_one("#content-area", Container)
            error_label = Label(f"❌ {message}\n\nPress R to retry or use arrow keys to switch tabs.")
            content_area.mount(error_label)
        except Exception as e:
            logger.error(f"Failed to show error screen: {e}")


    async def on_unmount(self) -> None:
        """Cleanup when app closes."""
        await self.api_client.close()
    
    def run_daemon(self):
        """Run TUI in daemon mode for system monitoring."""
        import time
        import json
        from pathlib import Path
        
        logger.info("TUI starting in daemon mode")
        
        # Create a simple monitoring loop
        while True:
            try:
                # Create a minimal status check
                status = {
                    'timestamp': time.time(),
                    'tui_daemon': True,
                    'api_available': False
                }
                
                # Check if backend is available
                import aiohttp
                import asyncio
                
                async def check_backend():
                    try:
                        connector = aiohttp.TCPConnector(limit=1, limit_per_host=1)
                        async with aiohttp.ClientSession(connector=connector) as session:
                            async with session.get(f'{API_BASE}/api/health', timeout=5) as resp:
                                return resp.status == 200
                    except Exception:
                        return False
                
                # Run check
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                status['api_available'] = loop.run_until_complete(check_backend())
                loop.close()
                
                # Save status
                log_dir = Path('/home/mm/map2-audio/logs')
                log_dir.mkdir(exist_ok=True)
                with open(log_dir / 'tui_daemon.json', 'w') as f:
                    json.dump(status, f, indent=2)
                
                time.sleep(30)  # Check every 30 seconds
                
            except Exception as e:
                logger.error(f"TUI daemon error: {e}")
                time.sleep(10)


    # ===== WORLD-CLASS FEATURES - NEW ACTIONS =====
    
    async def action_command_palette(self) -> None:
        """Show command palette (Ctrl+Shift+P)."""
        if IMPROVEMENTS_AVAILABLE:
            self.notify(
                "💎 Command Palette: Type to search for commands\n"
                "Commands: goto_chains, goto_effects, goto_settings, goto_diagnostics",
                severity="information",
                timeout=5
            )
    
    async def action_search(self) -> None:
        """Show search (Ctrl+F)."""
        if IMPROVEMENTS_AVAILABLE:
            self.notify(
                "🔍 Search: Find chains, effects, settings",
                severity="information",
                timeout=3
            )
    
    async def action_show_diagnostics(self) -> None:
        """Show diagnostics (F2)."""
        self.notify(
            "🏥 Diagnostics: System health, performance metrics, troubleshooting",
            severity="information",
            timeout=3
        )
        await self.show_tab(10)  # Health tab
    
    async def action_toggle_perf_monitor(self) -> None:
        """Toggle performance monitor (F10)."""
        if IMPROVEMENTS_AVAILABLE:
            summary = performance_monitor.get_summary()
            self.notify(
                f"📊 Performance: FPS={summary['fps']:.1f} | "
                f"Metrics={summary['total_metrics']} | "
                f"Bottlenecks: {len(summary['bottlenecks'])}",
                severity="information",
                timeout=4
            )

    async def action_toggle_api_log(self) -> None:
        """Toggle API Call Log visibility (Ctrl+L)."""
        try:
            footer = self.query_one("#footer-section")
            if footer.has_class("hidden"):
                footer.remove_class("hidden")
                self.notify("API Log shown", severity="information", timeout=2)
            else:
                footer.add_class("hidden")
                self.notify("API Log hidden (Ctrl+L to show)", severity="information", timeout=2)
        except Exception:
            pass

    async def action_cycle_theme(self) -> None:
        """Cycle through themes (Ctrl+T)."""
        if IMPROVEMENTS_AVAILABLE:
            themes = theme_engine.list_themes()
            current = theme_engine._current_theme
            next_idx = (themes.index(current) + 1) % len(themes)
            next_theme = themes[next_idx]
            theme_engine.set_theme(next_theme)
            self.notify(
                f"🎨 Theme: {next_theme}",
                severity="information",
                timeout=2
            )
    
    async def action_layout_compact(self) -> None:
        """Switch to compact layout (Alt+1)."""
        if IMPROVEMENTS_AVAILABLE:
            layout_system.set_layout(LayoutMode.COMPACT)
            self.notify("📐 Compact Layout", severity="information", timeout=2)
    
    async def action_layout_normal(self) -> None:
        """Switch to normal layout (Alt+2)."""
        if IMPROVEMENTS_AVAILABLE:
            layout_system.set_layout(LayoutMode.NORMAL)
            self.notify("📐 Normal Layout", severity="information", timeout=2)
    
    async def action_layout_wide(self) -> None:
        """Switch to wide layout (Alt+3)."""
        if IMPROVEMENTS_AVAILABLE:
            layout_system.set_layout(LayoutMode.WIDE)
            self.notify("📐 Wide Layout", severity="information", timeout=2)
    
    async def action_layout_fullscreen(self) -> None:
        """Switch to fullscreen layout (Alt+4)."""
        if IMPROVEMENTS_AVAILABLE:
            layout_system.set_layout(LayoutMode.FULLSCREEN)
            self.notify("📐 Fullscreen Layout", severity="information", timeout=2)
    
    async def action_layout_sidebar_left(self) -> None:
        """Switch to sidebar left layout (Alt+5)."""
        if IMPROVEMENTS_AVAILABLE:
            layout_system.set_layout(LayoutMode.SIDEBAR_LEFT)
            self.notify("📐 Sidebar Left", severity="information", timeout=2)
    
    async def action_layout_sidebar_right(self) -> None:
        """Switch to sidebar right layout (Alt+6)."""
        if IMPROVEMENTS_AVAILABLE:
            layout_system.set_layout(LayoutMode.SIDEBAR_RIGHT)
            self.notify("📐 Sidebar Right", severity="information", timeout=2)


def main():
    """Main entry point."""
    import argparse
    parser = argparse.ArgumentParser(description='MAP2 Audio Platform TUI')
    parser.add_argument('--daemon', action='store_true', help='Run in daemon mode')
    args = parser.parse_args()
    
    if not TEXTUAL_AVAILABLE:
        print("Error: Textual framework not available.")
        print("Please install: pip install textual>=0.46.0")
        return 1

    try:
        app = MAP2AudioTUI(daemon_mode=args.daemon)
        if args.daemon:
            app.run_daemon()
        else:
            app.run()
        return 0
    except KeyboardInterrupt:
        logger.info("TUI interrupted by user")
        return 0
    except Exception as e:
        logger.error(f"TUI error: {e}", exc_info=True)
        print(f"Error: {e}")
        return 1


if __name__ == "__main__":
    # Configure logging - redirect to file to keep TUI clean
    logging.basicConfig(
        level=logging.WARNING,
        format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        handlers=[
            logging.FileHandler('/tmp/map2_tui.log'),
        ]
    )
    # Suppress httpx request logs completely
    logging.getLogger("httpx").setLevel(logging.ERROR)
    # Suppress hpack logs (HTTP/2 library)
    logging.getLogger("hpack").setLevel(logging.ERROR)
    sys.exit(main())

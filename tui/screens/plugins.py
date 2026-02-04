"""
Interactive Plugins Browser Screen
PiPedal LV2 Plugin discovery, search, filtering, and chain integration
"""

from typing import Optional, List, Dict, Any
from textual.app import ComposeResult
from textual.widgets import Static, Button, Label, Input, Select, OptionList, DataTable
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.reactive import reactive

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from ..api_client import MAP2APIClient
from ..widgets import ActionButton, LoadingIndicator


# Category mapping for filtering (from PiPedal design)
CATEGORY_MAPPING = {
    "All": [],
    "Dynamics": ["compressor", "limiter", "gate", "expander", "dynamics"],
    "EQ & Filter": ["equalizer", "filter", "eq", "parametric", "highpass", "lowpass", "bandpass"],
    "Reverb & Delay": ["reverb", "delay", "echo", "room", "hall", "plate"],
    "Modulation": ["chorus", "flanger", "phaser", "tremolo", "vibrato", "rotary"],
    "Distortion": ["distortion", "overdrive", "fuzz", "saturation", "drive"],
    "Amp & Cabinet": ["amplifier", "amp", "preamp", "cabinet", "cab", "simulator"],
    "Utility": ["utility", "meter", "tuner", "analyzer", "gain", "volume"],
}


class PluginsScreen(ScrollableContainer):
    """
    Interactive Plugins browser screen with PiPedal integration.

    Features:
    - Discover 112+ LV2 plugins from PiPedal engine
    - Real-time search/filter by name, author, brand
    - Category filtering (Dynamics, EQ, Reverb, etc.)
    - Detailed plugin info (ports, brand, category)
    - Add plugins to active chain
    - Plugin info panel
    """

    CSS = """
    PluginsScreen {
        background: $background;
        width: 100%;
        height: 100%;
        padding: 1;
    }

    .section-title {
        text-style: bold;
        color: $accent;
        margin-top: 1;
        margin-bottom: 1;
    }

    .header-section {
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
        height: auto;
    }

    .header-row {
        width: 100%;
        height: auto;
    }

    .header-row Button {
        margin-right: 1;
    }

    .main-layout {
        width: 100%;
        height: auto;
    }

    .left-panel {
        width: 65%;
        height: auto;
        padding-right: 1;
    }

    .right-panel {
        width: 35%;
        height: auto;
    }

    .search-section {
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    .filter-row {
        width: 100%;
        height: auto;
        margin-top: 1;
    }

    .filter-row Button {
        margin: 0 1 1 0;
        min-width: 12;
    }

    .filter-active {
        background: $success;
        text-style: bold;
    }

    .plugins-list-container {
        background: $panel;
        border: solid $primary;
        padding: 1;
        height: auto;
        max-height: 50;
    }

    .plugins-option-list {
        height: auto;
        max-height: 45;
    }

    .plugin-info-panel {
        background: $panel;
        border: solid $accent;
        padding: 1;
        height: auto;
    }

    .info-title {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    .info-label {
        color: $text-muted;
        margin-top: 1;
    }

    .info-value {
        color: $text;
        margin-bottom: 1;
    }

    .port-info {
        color: $text-muted;
        font-size: 90%;
    }

    .action-buttons {
        width: 100%;
        height: auto;
        margin-top: 1;
    }

    .action-buttons Button {
        width: 100%;
        margin-bottom: 1;
    }

    .stats-bar {
        color: $text-muted;
        margin-top: 1;
    }
    """

    plugins: reactive[List[Dict[str, Any]]] = reactive([])
    filtered_plugins: reactive[List[Dict[str, Any]]] = reactive([])
    search_query: reactive[str] = reactive("")
    active_category: reactive[str] = reactive("All")
    selected_plugin: reactive[Optional[Dict[str, Any]]] = reactive(None)
    active_chain_id: reactive[int] = reactive(0)

    def __init__(self, api_client: MAP2APIClient, id: Optional[str] = None):
        """
        Initialize Plugins screen.

        Args:
            api_client: API client instance
            id: Optional screen ID
        """
        super().__init__(id=id)
        self.api_client = api_client

    def compose(self) -> ComposeResult:
        """Compose plugins screen widgets."""
        yield Label("🎛️ PiPedal Plugin Browser", classes="section-title")

        # Header Section - Discovery & Stats
        with Container(classes="header-section"):
            with Horizontal(classes="header-row"):
                yield ActionButton(
                    "🔍 Discover Plugins",
                    variant="success",
                    id="btn-discover"
                )
                yield ActionButton(
                    "🔄 Refresh",
                    variant="primary",
                    id="btn-refresh"
                )
                yield Static("", id="plugin-stats", classes="stats-bar")

        # Loading Indicator
        yield LoadingIndicator("Loading plugins...", id="loading-plugins")

        # Main Layout - Two Panels
        with Horizontal(classes="main-layout"):
            # Left Panel - Search, Filter, List
            with Vertical(classes="left-panel"):
                # Search Section
                with Container(classes="search-section"):
                    yield Label("🔎 Search & Filter", classes="section-title")
                    yield Input(
                        placeholder="Search by name, author, brand, or URI...",
                        id="search-input"
                    )
                    # Category Filter Buttons
                    with Horizontal(classes="filter-row", id="filter-buttons"):
                        for category in CATEGORY_MAPPING.keys():
                            btn_id = f"filter-{category.lower().replace(' ', '-').replace('&', 'and')}"
                            variant = "success" if category == "All" else "default"
                            classes = "filter-active" if category == "All" else ""
                            yield Button(category, variant=variant, id=btn_id, classes=classes)

                # Plugins List
                with Container(classes="plugins-list-container"):
                    yield Label("📦 Available Plugins", classes="section-title")
                    yield OptionList(id="plugins-list", classes="plugins-option-list")
                    yield Label("No plugins loaded. Click 'Discover Plugins' to scan.", id="empty-message")

            # Right Panel - Plugin Info & Actions
            with Vertical(classes="right-panel"):
                with Container(classes="plugin-info-panel"):
                    yield Label("ℹ️ Plugin Details", classes="info-title", id="info-title")

                    yield Label("Name:", classes="info-label")
                    yield Static("Select a plugin", id="info-name", classes="info-value")

                    yield Label("Author:", classes="info-label")
                    yield Static("-", id="info-author", classes="info-value")

                    yield Label("Brand:", classes="info-label")
                    yield Static("-", id="info-brand", classes="info-value")

                    yield Label("Category:", classes="info-label")
                    yield Static("-", id="info-category", classes="info-value")

                    yield Label("Audio Ports:", classes="info-label")
                    yield Static("-", id="info-ports", classes="info-value")

                    yield Label("URI:", classes="info-label")
                    yield Static("-", id="info-uri", classes="info-value")

                    # Action Buttons
                    with Vertical(classes="action-buttons"):
                        yield ActionButton(
                            "➕ Add to Active Chain",
                            variant="success",
                            id="btn-add-to-chain"
                        )
                        yield ActionButton(
                            "📋 View Parameters",
                            variant="primary",
                            id="btn-view-params"
                        )

    async def on_mount(self) -> None:
        """Called when screen is mounted."""
        # Hide empty message initially
        self.query_one("#empty-message", Label).display = False

        # Load plugins
        await self.refresh_data()

        # Auto-refresh every 30 seconds (plugins don't change often)
        self.set_interval(30.0, self.refresh_data)

        # Get active chain
        await self._get_active_chain()

    async def _get_active_chain(self) -> None:
        """Get the currently active chain ID."""
        try:
            result = await self.api_client.list_chains()
            if result.success:
                data = result.data
                chains = data.get("chains", []) if isinstance(data, dict) else data
                for chain in chains:
                    if chain.get("is_active"):
                        self.active_chain_id = chain.get("id", 0)
                        break
        except Exception as e:
            self.log.warning(f"Could not fetch active chain: {e}")

    async def refresh_data(self) -> None:
        """Refresh plugins data from PiPedal."""
        loading = self.query_one("#loading-plugins", LoadingIndicator)
        loading.show("Loading plugins from PiPedal...")

        try:
            # Use discover_plugins for full plugin info
            result = await self.api_client.discover_plugins()
            if result.success:
                data = result.data
                if isinstance(data, dict):
                    self.plugins = data.get("plugins", [])
                else:
                    self.plugins = []

                self._apply_filters()
                self._update_stats()

                if self.plugins:
                    self.query_one("#empty-message", Label).display = False
                else:
                    empty_msg = self.query_one("#empty-message", Label)
                    empty_msg.update("No plugins found. Is PiPedal engine running?")
                    empty_msg.display = True
            else:
                self.app.notify(f"Failed to load plugins: {result.error}", severity="error")

        except Exception as e:
            self.app.notify(f"Error loading plugins: {str(e)}", severity="error")
        finally:
            loading.hide()

    def _apply_filters(self) -> None:
        """Apply search and category filters."""
        filtered = self.plugins

        # Apply category filter
        if self.active_category != "All":
            keywords = CATEGORY_MAPPING.get(self.active_category, [])
            if keywords:
                filtered = [
                    p for p in filtered
                    if any(
                        kw in p.get("category", "").lower() or
                        kw in p.get("name", "").lower() or
                        kw in p.get("class_label", "").lower()
                        for kw in keywords
                    )
                ]

        # Apply search filter
        if self.search_query:
            query = self.search_query.lower()
            filtered = [
                p for p in filtered
                if query in p.get("name", "").lower()
                or query in p.get("author", "").lower()
                or query in p.get("brand", "").lower()
                or query in p.get("uri", "").lower()
                or query in p.get("category", "").lower()
            ]

        self.filtered_plugins = filtered
        self._update_plugins_list()

    def _update_plugins_list(self) -> None:
        """Update the plugins OptionList."""
        plugins_list = self.query_one("#plugins-list", OptionList)
        plugins_list.clear_options()

        empty_msg = self.query_one("#empty-message", Label)

        if not self.filtered_plugins:
            if self.plugins:
                empty_msg.update("No plugins match your search/filter.")
            else:
                empty_msg.update("No plugins loaded. Click 'Discover Plugins' to scan.")
            empty_msg.display = True
            return

        empty_msg.display = False

        # Add plugins to list
        for plugin in self.filtered_plugins:
            name = plugin.get("name", "Unknown")
            brand = plugin.get("brand", "")
            category = plugin.get("category", "")
            uri = plugin.get("uri", "")

            # Create display label
            if brand:
                label = f"{brand}: {name}"
            else:
                label = name

            if category:
                label = f"{label} [{category}]"

            plugins_list.add_option((label, uri))

    def _update_stats(self) -> None:
        """Update plugin statistics display."""
        stats = self.query_one("#plugin-stats", Static)
        total = len(self.plugins)
        filtered = len(self.filtered_plugins)

        if self.search_query or self.active_category != "All":
            stats.update(f"📊 Showing {filtered} of {total} plugins")
        else:
            stats.update(f"📊 {total} plugins available")

    def _update_plugin_info(self, plugin: Dict[str, Any]) -> None:
        """Update plugin info panel."""
        self.selected_plugin = plugin

        name = plugin.get("name", "Unknown")
        author = plugin.get("author", "Unknown")
        brand = plugin.get("brand", "-")
        category = plugin.get("category", "-")
        uri = plugin.get("uri", "-")
        in_ports = plugin.get("in_ports", 0)
        out_ports = plugin.get("out_ports", 0)

        self.query_one("#info-name", Static).update(name)
        self.query_one("#info-author", Static).update(author)
        self.query_one("#info-brand", Static).update(brand if brand else "-")
        self.query_one("#info-category", Static).update(category)
        self.query_one("#info-ports", Static).update(f"{in_ports} in / {out_ports} out")

        # Truncate long URIs
        uri_display = uri[:50] + "..." if len(uri) > 50 else uri
        self.query_one("#info-uri", Static).update(uri_display)

    async def on_option_list_option_selected(self, event: OptionList.OptionSelected) -> None:
        """Handle plugin selection from list."""
        if event.option_list.id == "plugins-list":
            uri = event.option_id

            # Find plugin by URI
            plugin = next((p for p in self.plugins if p.get("uri") == uri), None)
            if plugin:
                self._update_plugin_info(plugin)

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button clicks."""
        button_id = event.button.id

        if button_id == "btn-discover":
            await self._discover_plugins()
        elif button_id == "btn-refresh":
            await self.refresh_data()
        elif button_id == "btn-add-to-chain":
            await self._add_to_chain()
        elif button_id == "btn-view-params":
            await self._view_parameters()
        elif button_id and button_id.startswith("filter-"):
            await self._handle_filter(button_id, event.button)

    async def _handle_filter(self, button_id: str, button: Button) -> None:
        """Handle category filter button click."""
        # Map button ID back to category name
        category_map = {
            "filter-all": "All",
            "filter-dynamics": "Dynamics",
            "filter-eq-and-filter": "EQ & Filter",
            "filter-reverb-and-delay": "Reverb & Delay",
            "filter-modulation": "Modulation",
            "filter-distortion": "Distortion",
            "filter-amp-and-cabinet": "Amp & Cabinet",
            "filter-utility": "Utility",
        }

        category = category_map.get(button_id, "All")
        self.active_category = category

        # Update button styles
        filter_container = self.query_one("#filter-buttons", Horizontal)
        for btn in filter_container.query(Button):
            if btn == button:
                btn.add_class("filter-active")
                btn.variant = "success"
            else:
                btn.remove_class("filter-active")
                btn.variant = "default"

        self._apply_filters()
        self._update_stats()

    async def on_input_changed(self, event: Input.Changed) -> None:
        """Handle search input changes."""
        if event.input.id == "search-input":
            self.search_query = event.value
            self._apply_filters()
            self._update_stats()

    async def _discover_plugins(self) -> None:
        """Discover plugins by scanning system (forces cache refresh)."""
        btn = self.query_one("#btn-discover", ActionButton)
        btn.set_loading(True, "Scanning (forcing refresh)...")

        # Force refresh of plugin cache
        result = await self.api_client.discover_plugins(refresh=True)

        btn.set_loading(False)

        if result.success:
            data = result.data
            count = data.get("count", 0) if isinstance(data, dict) else 0
            cached = data.get("cached", False) if isinstance(data, dict) else False
            self.app.notify(f"Discovered {count} plugins {'(cached)' if cached else '(fresh scan)'}", severity="information")
            # Update the local plugins list directly
            if isinstance(data, dict):
                self.plugins = data.get("plugins", [])
                self._apply_filters()
                self._update_stats()
        else:
            self.app.notify(f"Discovery failed: {result.error}", severity="error")

    async def _add_to_chain(self) -> None:
        """Add selected plugin to active chain."""
        if not self.selected_plugin:
            self.app.notify("Select a plugin first", severity="warning")
            return

        # Get active chain if not set
        if self.active_chain_id == 0:
            await self._get_active_chain()

        if self.active_chain_id == 0:
            self.app.notify("No active chain. Create or activate a chain first.", severity="warning")
            return

        plugin_uri = self.selected_plugin.get("uri")
        plugin_name = self.selected_plugin.get("name", "Plugin")

        loading = self.query_one("#loading-plugins", LoadingIndicator)
        loading.show(f"Adding {plugin_name} to chain...")

        result = await self.api_client.add_plugin_to_chain(self.active_chain_id, plugin_uri)

        loading.hide()

        if result.success:
            self.app.notify(f"Added '{plugin_name}' to chain", severity="information")
        else:
            self.app.notify(f"Failed to add plugin: {result.error}", severity="error")

    async def _view_parameters(self) -> None:
        """View parameters for selected plugin."""
        if not self.selected_plugin:
            self.app.notify("Select a plugin first", severity="warning")
            return

        plugin_uri = self.selected_plugin.get("uri")
        plugin_name = self.selected_plugin.get("name", "Plugin")

        loading = self.query_one("#loading-plugins", LoadingIndicator)
        loading.show(f"Loading parameters for {plugin_name}...")

        # Get plugin parameters
        result = await self.api_client.get_plugin_info(plugin_uri)

        loading.hide()

        if result.success:
            data = result.data
            ports = data.get("ports", [])

            # Count control ports (parameters)
            params = [p for p in ports if p.get("is_control_port") and p.get("is_input")]

            if params:
                param_names = [p.get("name", "?") for p in params[:5]]
                preview = ", ".join(param_names)
                if len(params) > 5:
                    preview += f"... (+{len(params) - 5} more)"
                self.app.notify(f"{plugin_name}: {len(params)} parameters\n{preview}", severity="information", timeout=5)
            else:
                self.app.notify(f"{plugin_name} has no editable parameters", severity="information")
        else:
            self.app.notify(f"Failed to get parameters: {result.error}", severity="error")

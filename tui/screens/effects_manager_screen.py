"""
Enhanced Effects Manager Screen - Real plugin management reflecting web API
Features: Plugin browser with LV2 plugins, Guitar amplifier settings, Signal routing, IR management

Wired to real API endpoints:
- Plugins: /api/plugins/*, /api/engine/plugins/*
- Guitar/NAM: /api/guitar/*, /api/nam/*
- Chains: /api/chains/*
- IR: /api/ir/*
"""

import logging
import asyncio
from textual.app import ComposeResult
from textual.containers import Vertical
from textual.widgets import Static, Label, DataTable, Input, Select
from textual.binding import Binding

logger = logging.getLogger(__name__)


class PluginBrowserWidget(Static):
    """Browse and search JUCE Audio Plugins."""

    DEFAULT_CSS = """
    #plugin-browser {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $success;
        padding: 1 2;
        margin: 1 0;
    }

    #plugin-categories-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #plugin-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client
        self.id = "plugin-browser"
        # Data state
        self._plugins = []
        self._categories = {}

    def compose(self) -> ComposeResult:
        """Compose plugin browser with tables and controls."""
        yield Label("🎚️ JUCE PLUGIN BROWSER", id="browser-title")
        # Controls: search, filter, sort
        with Vertical(classes="browser-controls"):
            yield Label("Search:", classes="control-label")
            yield Input(placeholder="Search plugins by name...", id="plugin-search-input")
            yield Label("Filter by category:", classes="control-label")
            yield Select([], id="plugin-filter-select")
            yield Label("Sort:", classes="control-label")
            yield Select([("Name A→Z", "name_asc"), ("Name Z→A", "name_desc"), ("Plugins count", "count_desc")], id="plugin-sort-select", value="name_asc")

        yield DataTable(id="plugin-categories-table")
        yield Label("Actions:", id="plugin-actions-label")
        yield DataTable(id="plugin-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers. Show fallback if fails."""
        try:
            # Categories table
            table = self.query_one("#plugin-categories-table", DataTable)
            if not table.columns:
                table.add_columns("Category", "Count", "Examples")
                table.add_row("...", "Loading...", "...")

            # Actions table
            actions = self.query_one("#plugin-actions-table", DataTable)
            if not actions.columns:
                actions.add_columns("Key", "Action", "Description")
                actions.add_row("s", "Search", "Search plugins by name")
                actions.add_row("f", "Filter", "Filter by category")
                actions.add_row("F", "Favorites", "Show favorite plugins only")
                actions.add_row("i", "Install", "Add plugin to current chain")
            # Populate filter select with categories when available
            try:
                filt = self.query_one("#plugin-filter-select", Select)
                cats = [("All", "all")] + [(c, c) for c in sorted(self._categories.keys())]
                filt.options = cats
                filt.value = "all"
            except Exception:
                pass
        except Exception as e:
            self.app.notify(f"Table initialization failed: {e}", severity="error", timeout=4)
            # Fallback: show error label
            self.mount(Label("❌ Failed to initialize plugin tables. Try reloading the screen."))

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(30.0, self._refresh_data)
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real plugin data from API."""
        if not self.api_client:
            return

        try:
            # Fetch plugins - /api/engine/plugins
            plugins_result = await self.api_client.list_plugins()
            if plugins_result.success and plugins_result.data:
                self._plugins = plugins_result.data if isinstance(plugins_result.data, list) else plugins_result.data.get("plugins", [])
                self._categorize_plugins()
                # update filter options and display
                try:
                    filt = self.query_one("#plugin-filter-select", Select)
                    filt.options = [("All", "all")] + [(c, c) for c in sorted(self._categories.keys())]
                except Exception:
                    pass
                self._update_display()
            else:
                self.app.notify("Failed to load plugins from JUCE engine.", severity="error", timeout=4)
        except Exception as e:
            logger.debug(f"Error fetching plugins: {e}")
            self.app.notify(f"Plugin API error: {e}", severity="error", timeout=4)

    def _categorize_plugins(self) -> None:
        """Categorize plugins by type."""
        self._categories = {}
        for plugin in self._plugins:
            category = plugin.get("category", "Other")
            if not category:
                category = "Other"
            if category not in self._categories:
                self._categories[category] = []
            self._categories[category].append(plugin)

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            total = len(self._plugins)

            # Apply search/filter/sort
            search = ""
            try:
                search = self.query_one("#plugin-search-input", Input).value.strip().lower()
            except Exception:
                search = ""

            try:
                sel = self.query_one("#plugin-filter-select", Select).value
            except Exception:
                sel = "all"

            try:
                sort_mode = self.query_one("#plugin-sort-select", Select).value
            except Exception:
                sort_mode = "name_asc"

            # Filter plugins
            filtered = []
            for p in self._plugins:
                name = p.get("name", "").lower()
                category = p.get("category", "Other") or "Other"
                if search and search not in name:
                    continue
                if sel != "all" and category != sel:
                    continue
                filtered.append(p)

            # Sort
            if sort_mode == "name_asc":
                filtered.sort(key=lambda x: x.get("name", "").lower())
            elif sort_mode == "name_desc":
                filtered.sort(key=lambda x: x.get("name", "").lower(), reverse=True)
            elif sort_mode == "count_desc":
                filtered.sort(key=lambda x: len(self._categories.get(x.get("category", "Other") or "Other", [])), reverse=True)

            # Update title
            title = self.query_one("#browser-title", Label)
            title.update(f"🎚️ JUCE PLUGIN BROWSER ({len(filtered)} / {total} shown)")

            # Update categories table
            table = self.query_one("#plugin-categories-table", DataTable)
            table.clear()

            if self._categories:
                # Show categories summary
                for cat, plugins in sorted(self._categories.items(), key=lambda x: -len(x[1]))[:12]:
                    examples = [p.get("name", "?")[:20] for p in plugins[:3]]
                    examples_text = ", ".join(examples)
                    if len(plugins) > 3:
                        examples_text += "..."
                    table.add_row(cat, str(len(plugins)), examples_text)
            else:
                table.add_row("-", "No plugins", "Install plugins")

            # Also update a simple list of matched plugins below categories (first 20)
            try:
                # ensure an output table exists for detailed list
                det_id = "plugin-details-table"
                det = None
                try:
                    det = self.query_one(f"#{det_id}", DataTable)
                except Exception:
                    # mount one under this widget
                    det = DataTable(id=det_id)
                    self.mount(det)
                det.clear()
                if not det.columns:
                    det.add_columns("Name", "Category", "URI")
                for p in filtered[:200]:
                    det.add_row(p.get("name", "?"), p.get("category", "Other"), p.get("uri", "-"))
            except Exception:
                pass
        except Exception as e:
            logger.debug(f"Error updating plugin browser display: {e}")

    def on_input_changed(self, event: Input.Changed) -> None:
        """Handle search input changes."""
        try:
            if event.input.id == "plugin-search-input":
                # immediate update; could be debounced if needed
                self._update_display()
        except Exception:
            pass

    def on_select_changed(self, event: Select.Changed) -> None:
        """Handle filter/sort select changes."""
        try:
            if event.select.id in ("plugin-filter-select", "plugin-sort-select"):
                self._update_display()
        except Exception:
            pass


class GuitarAmplifierWidget(Static):
    """Guitar amplifier settings - wired to /api/guitar/*, /api/nam/*."""

    DEFAULT_CSS = """
    #guitar-amplifier {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $warning;
        padding: 1 2;
        margin: 1 0;
    }

    #amp-status-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #amp-controls-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #amp-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None, **kwargs):
        super().__init__()
        self.api_client = api_client
        self.id = "guitar-amplifier"
        # Data state
        self._guitar_status = {}
        self._nam_status = {}
        self._nam_models = []

    def compose(self) -> ComposeResult:
        """Compose guitar amplifier settings with tables."""
        yield Label("🎸 GUITAR AMPLIFIER & NAM MODELING", id="amp-title")
        yield DataTable(id="amp-status-table")
        yield Label("Mix Controls:", id="amp-controls-label")
        yield DataTable(id="amp-controls-table")
        yield Label("Actions:", id="amp-actions-label")
        yield DataTable(id="amp-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Status table
        status = self.query_one("#amp-status-table", DataTable)
        if not status.columns:
            status.add_columns("Component", "Value", "Status")
            status.add_row("NAM Model", "Loading...", "...")
            status.add_row("Device", "...", "...")
            status.add_row("Cabinet IR", "...", "...")

        # Controls table
        controls = self.query_one("#amp-controls-table", DataTable)
        if not controls.columns:
            controls.add_columns("Control", "Value", "Range")
            controls.add_row("NAM Mix", "...", "0-100%")
            controls.add_row("Cabinet Mix", "...", "0-100%")
            controls.add_row("Reverb Mix", "...", "0-100%")

        # Actions table
        actions = self.query_one("#amp-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.add_row("m", "Load Model", "Load NAM amplifier model")
            actions.add_row("c", "Change Cab", "Change cabinet IR")
            actions.add_row("b", "Bypass", "Bypass amplifier section")
            actions.add_row("p", "Preset", "Load amp preset")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(5.0, self._refresh_data)
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real guitar chain data from API."""
        if not self.api_client:
            return

        try:
            # Fetch guitar status - /api/guitar/
            guitar_result = await self.api_client.get_guitar_status()
            if guitar_result.success and guitar_result.data:
                self._guitar_status = guitar_result.data

            # Fetch NAM status - /api/nam/
            nam_result = await self.api_client.get_nam_status()
            if nam_result.success and nam_result.data:
                self._nam_status = nam_result.data

            # Fetch NAM models - /api/nam/models
            models_result = await self.api_client.get_nam_models()
            if models_result.success and models_result.data:
                self._nam_models = models_result.data if isinstance(models_result.data, list) else models_result.data.get("models", [])

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching guitar status: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            # NAM model info
            nam_available = self._nam_status.get("available", False)
            current_model = self._nam_status.get("current_model", None)
            device = self._nam_status.get("device", "CPU")

            # Update title
            model_count = len(self._nam_models)
            title = self.query_one("#amp-title", Label)
            title.update(f"🎸 GUITAR AMPLIFIER & NAM | {model_count} models")

            # Update status table
            status = self.query_one("#amp-status-table", DataTable)
            status.clear()

            # NAM Model row
            if nam_available and current_model:
                status.add_row("NAM Model", current_model[:25], "🟢 Loaded")
            else:
                status.add_row("NAM Model", "None loaded", "⚪ Not active")

            # Device row
            device_status = "🟢 GPU" if device.lower() == "gpu" else "🟢 CPU"
            status.add_row("Device", device, device_status)

            # Cabinet IR row
            current_cab = self._guitar_status.get("cabinet_ir", None)
            if current_cab:
                status.add_row("Cabinet IR", current_cab[:25], "🟢 Loaded")
            else:
                status.add_row("Cabinet IR", "None loaded", "⚪ Not active")

            # Update controls table
            controls = self.query_one("#amp-controls-table", DataTable)
            controls.clear()

            # Mix levels
            nam_mix = self._guitar_status.get("nam_mix", 1.0)
            cab_mix = self._guitar_status.get("cabinet_mix", 1.0)
            reverb_mix = self._guitar_status.get("reverb_mix", 0.3)

            if isinstance(nam_mix, (int, float)):
                nam_mix = round(nam_mix * 100)
            if isinstance(cab_mix, (int, float)):
                cab_mix = round(cab_mix * 100)
            if isinstance(reverb_mix, (int, float)):
                reverb_mix = round(reverb_mix * 100)

            controls.add_row("NAM Mix", f"{nam_mix}%", "0-100%")
            controls.add_row("Cabinet Mix", f"{cab_mix}%", "0-100%")
            controls.add_row("Reverb Mix", f"{reverb_mix}%", "0-100%")

        except Exception as e:
            logger.debug(f"Error updating guitar display: {e}")


class SignalRoutingWidget(Static):
    """Visualize signal routing chain - wired to /api/chains/*."""

    DEFAULT_CSS = """
    #signal-routing {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $accent;
        padding: 1 2;
        margin: 1 0;
    }

    #routing-chain-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #routing-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None, **kwargs):
        super().__init__()
        self.api_client = api_client
        self.id = "signal-routing"
        # Data state
        self._chains = []
        self._active_chain = None

    def compose(self) -> ComposeResult:
        """Compose signal routing with tables."""
        yield Label("🔀 SIGNAL ROUTING & PROCESSING CHAIN", id="routing-title")
        yield DataTable(id="routing-chain-table")
        yield Label("Actions:", id="routing-actions-label")
        yield DataTable(id="routing-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Chain table
        table = self.query_one("#routing-chain-table", DataTable)
        if not table.columns:
            table.add_columns("Order", "Plugin", "Status", "CPU")
            table.add_row("...", "Loading...", "...", "...")

        # Actions table
        actions = self.query_one("#routing-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.add_row("b", "Bypass", "Bypass selected plugin")
            actions.add_row("i", "Insert", "Insert plugin at position")
            actions.add_row("d", "Remove", "Remove selected plugin")
            actions.add_row("r", "Reorder", "Move plugin up/down")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(3.0, self._refresh_data)
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real chain data from API."""
        if not self.api_client:
            return

        try:
            # Fetch chains - /api/chains/
            chains_result = await self.api_client.list_chains()
            if chains_result.success and chains_result.data:
                self._chains = chains_result.data if isinstance(chains_result.data, list) else chains_result.data.get("chains", [])

            # Find active chain
            self._active_chain = None
            for chain in self._chains:
                if chain.get("active", False) or chain.get("is_active", False):
                    self._active_chain = chain
                    break

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching chains: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            # Update title
            title = self.query_one("#routing-title", Label)

            # Update chain table
            table = self.query_one("#routing-chain-table", DataTable)
            table.clear()

            if self._active_chain:
                chain_name = self._active_chain.get("name", "Unnamed")
                plugins = self._active_chain.get("plugins", [])

                title.update(f"🔀 SIGNAL CHAIN: {chain_name} | {len(plugins)} plugins")

                if plugins:
                    for i, p in enumerate(plugins[:10], 1):
                        name = p.get("name", "Plugin")
                        if len(name) > 20:
                            name = name[:18] + ".."
                        bypassed = p.get("bypassed", False)
                        status = "⚪ Bypassed" if bypassed else "🟢 Active"
                        cpu = p.get("cpu_percent", 0)
                        if isinstance(cpu, (int, float)):
                            cpu = round(cpu, 1)
                        table.add_row(str(i), name, status, f"{cpu}%")

                    if len(plugins) > 10:
                        table.add_row("...", f"+{len(plugins) - 10} more", "", "")
                else:
                    table.add_row("-", "No plugins in chain", "-", "-")
            else:
                title.update(f"🔀 SIGNAL CHAIN | {len(self._chains)} chains available")
                table.add_row("-", "No active chain", "-", "-")
                table.add_row("-", "Select or create a chain", "-", "-")

        except Exception as e:
            logger.debug(f"Error updating routing display: {e}")


class IRAndCabinetsWidget(Static):
    """IR and cabinet management - wired to /api/ir/*."""

    DEFAULT_CSS = """
    #ir-cabinets {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $primary;
        padding: 1 2;
        margin: 1 0;
    }

    #ir-status-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #ir-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None, **kwargs):
        super().__init__()
        self.api_client = api_client
        self.id = "ir-cabinets"
        # Data state
        self._cabinet_irs = []
        self._reverb_irs = []
        self._ir_status = {}

    def compose(self) -> ComposeResult:
        """Compose IR and cabinet settings with tables."""
        yield Label("📦 IR & CABINET MANAGEMENT", id="ir-title")
        yield DataTable(id="ir-status-table")
        yield Label("Actions:", id="ir-actions-label")
        yield DataTable(id="ir-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Status table
        table = self.query_one("#ir-status-table", DataTable)
        if not table.columns:
            table.add_columns("Type", "Available", "Current", "Status")
            table.add_row("Cabinet IR", "Loading...", "-", "...")
            table.add_row("Reverb IR", "Loading...", "-", "...")

        # Actions table
        actions = self.query_one("#ir-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.add_row("l", "Load IR", "Load impulse response file")
            actions.add_row("u", "Upload", "Upload new IR file")
            actions.add_row("m", "Manage", "Open IR manager")
            actions.add_row("s", "Settings", "Configure IR settings")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(10.0, self._refresh_data)
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real IR data from API."""
        if not self.api_client:
            return

        try:
            # Fetch cabinet IRs - /api/ir/cabinets
            cab_result = await self.api_client.get_cabinet_irs()
            if cab_result.success and cab_result.data:
                self._cabinet_irs = cab_result.data if isinstance(cab_result.data, list) else cab_result.data.get("irs", [])

            # Fetch reverb IRs - /api/ir/reverbs
            reverb_result = await self.api_client.get_reverb_irs()
            if reverb_result.success and reverb_result.data:
                self._reverb_irs = reverb_result.data if isinstance(reverb_result.data, list) else reverb_result.data.get("irs", [])

            # Fetch IR status - /api/ir/
            status_result = await self.api_client.get_ir_status()
            if status_result.success and status_result.data:
                self._ir_status = status_result.data

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching IR data: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            # Update title
            total_irs = len(self._cabinet_irs) + len(self._reverb_irs)
            title = self.query_one("#ir-title", Label)
            title.update(f"📦 IR & CABINET MANAGEMENT ({total_irs} IRs)")

            # Update status table
            table = self.query_one("#ir-status-table", DataTable)
            table.clear()

            # Cabinet IRs
            cab_count = len(self._cabinet_irs)
            current_cab = self._ir_status.get("current_cabinet", None)
            if current_cab:
                cab_current = current_cab[:20] if len(str(current_cab)) > 20 else current_cab
                cab_status = "🟢 Loaded"
            else:
                cab_current = "None"
                cab_status = "⚪ Not active"
            table.add_row("Cabinet IR", str(cab_count), cab_current, cab_status)

            # Reverb IRs
            reverb_count = len(self._reverb_irs)
            current_reverb = self._ir_status.get("current_reverb", None)
            if current_reverb:
                reverb_current = current_reverb[:20] if len(str(current_reverb)) > 20 else current_reverb
                reverb_status = "🟢 Loaded"
            else:
                reverb_current = "None"
                reverb_status = "⚪ Not active"
            table.add_row("Reverb IR", str(reverb_count), reverb_current, reverb_status)

        except Exception as e:
            logger.debug(f"Error updating IR display: {e}")


class EffectsManagerScreen(Static):
    """
    Enhanced Effects Manager Screen - Reflects web API plugin capabilities.

    Shows:
    - LV2 plugin browser with real plugin data from /api/pipedal/plugins
    - Guitar amplifier modeling from /api/guitar/, /api/nam/
    - Full signal chain routing from /api/chains/
    - IR and cabinet management from /api/ir/
    """

    DEFAULT_CSS = """
    EffectsManagerScreen {
        width: 100%;
        height: 100%;
        background: $surface;
        layout: vertical;
        overflow: auto;
    }
    """

    BINDINGS = [
        Binding("s", "search_plugins", "Search", show=True),
        Binding("i", "install_plugin", "Install", show=True),
        Binding("b", "bypass_effect", "Bypass", show=True),
        Binding("c", "cabinet_settings", "Cabinet", show=True),
        Binding("r", "refresh_data", "Refresh", show=True),
    ]

    def __init__(self, api_client=None, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client

    def compose(self) -> ComposeResult:
        """Compose effects manager with real plugin features."""
        with Vertical(id="effects-container"):
            yield PluginBrowserWidget(self.api_client)
            yield GuitarAmplifierWidget(self.api_client)
            yield SignalRoutingWidget(self.api_client)
            yield IRAndCabinetsWidget(self.api_client)

    async def action_search_plugins(self) -> None:
        """Search for plugins."""
        self.app.notify("Plugin search - use the Chains tab for full plugin browser", severity="information", timeout=3)

    async def action_install_plugin(self) -> None:
        """Install plugin to active chain."""
        if not self.api_client:
            self.app.notify("API client not available", severity="warning", timeout=2)
            return

        # Get active chain
        chains_result = await self.api_client.list_chains()
        if not chains_result.success:
            self.app.notify("Failed to get chains", severity="error", timeout=2)
            return

        chains = chains_result.data if isinstance(chains_result.data, list) else chains_result.data.get("chains", [])
        active_chain = None
        for chain in chains:
            if chain.get("active", False) or chain.get("is_active", False):
                active_chain = chain
                break

        if not active_chain:
            self.app.notify("No active chain - select a chain first", severity="warning", timeout=3)
        else:
            self.app.notify(f"Use Chains tab to add plugins to '{active_chain.get('name', 'chain')}'", severity="information", timeout=3)

    async def action_bypass_effect(self) -> None:
        """Toggle bypass on selected effect."""
        self.app.notify("Use Chains tab to bypass individual plugins", severity="information", timeout=3)

    async def action_cabinet_settings(self) -> None:
        """Open cabinet IR settings."""
        if not self.api_client:
            self.app.notify("API client not available", severity="warning", timeout=2)
            return

        # Show current cabinet status
        cab_result = await self.api_client.get_cabinet_irs()
        if cab_result.success:
            cabs = cab_result.data if isinstance(cab_result.data, list) else cab_result.data.get("irs", [])
            self.app.notify(f"Cabinet IRs: {len(cabs)} available - use Guitar tab for full management", severity="information", timeout=3)
        else:
            self.app.notify("Failed to get cabinet IRs", severity="error", timeout=2)

    async def action_refresh_data(self) -> None:
        """Refresh all effects data."""
        self.app.notify("Refreshing effects data...", severity="information", timeout=1)

        try:
            for widget in self.query("PluginBrowserWidget"):
                asyncio.create_task(widget._refresh_data())
            for widget in self.query("GuitarAmplifierWidget"):
                asyncio.create_task(widget._refresh_data())
            for widget in self.query("SignalRoutingWidget"):
                asyncio.create_task(widget._refresh_data())
            for widget in self.query("IRAndCabinetsWidget"):
                asyncio.create_task(widget._refresh_data())

            self.app.notify("Effects data refreshed", severity="information", timeout=2)
        except Exception as e:
            self.app.notify(f"Refresh error: {e}", severity="error", timeout=3)

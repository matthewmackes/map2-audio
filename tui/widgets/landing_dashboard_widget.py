"""
Landing Dashboard Widget for MAP2 TUI
Main landing zone showing chains, audio levels, and system resources.
"""

import asyncio
import logging
from typing import Optional, Dict, Any, List

try:
    from textual.app import ComposeResult
    from textual.containers import Horizontal, Vertical, Container
    from textual.widgets import Static, Label, ProgressBar, DataTable
    from textual.reactive import reactive
    TEXTUAL_AVAILABLE = True
except ImportError:
    TEXTUAL_AVAILABLE = False

logger = logging.getLogger(__name__)


class AudioMeter(Static):
    """Simple audio level meter widget."""

    DEFAULT_CSS = """
    AudioMeter {
        width: 100%;
        height: 3;
        padding: 0 1;
    }

    .meter-label {
        width: 8;
        height: 1;
        color: $text-muted;
    }

    .meter-bar {
        width: 1fr;
        height: 1;
    }

    .meter-value {
        width: 8;
        height: 1;
        text-align: right;
        color: $text;
    }
    """

    level: reactive[float] = reactive(0.0)
    peak: reactive[float] = reactive(0.0)

    def __init__(self, label: str = "Level", id: Optional[str] = None):
        super().__init__(id=id)
        self.label_text = label

    def compose(self) -> ComposeResult:
        with Horizontal():
            yield Label(self.label_text, classes="meter-label")
            yield ProgressBar(total=100, show_eta=False, show_percentage=False, classes="meter-bar")
            yield Label("-inf dB", id=f"{self.id}-value", classes="meter-value")

    def update_level(self, level: float, peak: Optional[float] = None) -> None:
        """Update the meter level (0-100 scale)."""
        self.level = max(0, min(100, level))
        if peak is not None:
            self.peak = max(0, min(100, peak))

        try:
            bar = self.query_one(ProgressBar)
            bar.progress = self.level

            value_label = self.query_one(f"#{self.id}-value", Label)
            if self.level > 0:
                db = 20 * (self.level / 100) - 20  # Simple linear to dB approximation
                value_label.update(f"{db:+.1f} dB")
            else:
                value_label.update("-inf dB")
        except Exception:
            pass


class ChainPanel(Static):
    """Panel showing a single signal chain with its plugins."""

    DEFAULT_CSS = """
    ChainPanel {
        width: 1fr;
        height: 100%;
        background: $panel;
        border: solid $primary;
        padding: 0;
        margin: 0 1;
    }

    .chain-header {
        width: 100%;
        height: 3;
        background: $primary;
        color: $text;
        text-style: bold;
        padding: 0 1;
        content-align: center middle;
    }

    .chain-header-active {
        background: #2E7D32;
    }

    .chain-header-inactive {
        background: #455A64;
    }

    .chain-status {
        width: 100%;
        height: auto;
        padding: 0 1;
        background: $surface;
    }

    .chain-plugins {
        width: 100%;
        height: 1fr;
        background: $surface;
        padding: 0;
    }

    .plugin-table {
        width: 100%;
        height: 100%;
    }

    .chain-footer {
        width: 100%;
        height: 2;
        background: $panel;
        padding: 0 1;
        color: $text-muted;
    }
    """

    def __init__(self, chain_label: str = "Chain A", chain_id: Optional[int] = None, api_client: Optional[Any] = None, id: Optional[str] = None):
        super().__init__(id=id)
        self.chain_label = chain_label
        self.chain_id = chain_id
        self.api_client = api_client
        self._chain_data: Dict[str, Any] = {}
        self._plugins: List[Dict] = []
        self._is_active = False

    def compose(self) -> ComposeResult:
        yield Label(f"{self.chain_label}", id=f"{self.id}-header", classes="chain-header chain-header-inactive")

        with Vertical(classes="chain-status"):
            yield Label("No chain loaded", id=f"{self.id}-name")
            yield Label("Status: Inactive", id=f"{self.id}-status")

        with Vertical(classes="chain-plugins"):
            yield DataTable(id=f"{self.id}-plugins", classes="plugin-table")

        with Horizontal(classes="chain-footer"):
            yield Label("0 plugins | 0% CPU", id=f"{self.id}-footer")

    def on_mount(self) -> None:
        """Initialize the plugin table."""
        try:
            table = self.query_one(f"#{self.id}-plugins", DataTable)
            table.cursor_type = "row"
            table.zebra_stripes = True
            table.add_column("#", key="pos", width=3)
            table.add_column("Plugin", key="name", width=20)
            table.add_column("Status", key="status", width=10)
        except Exception as e:
            logger.debug(f"Error initializing chain panel table: {e}")

    def update_chain(self, chain_data: Optional[Dict[str, Any]], plugins: Optional[List[Dict]] = None) -> None:
        """Update the chain display with new data."""
        self._chain_data = chain_data or {}
        self._plugins = plugins or []
        self._is_active = chain_data.get("is_active", False) if chain_data else False

        try:
            # Update header
            header = self.query_one(f"#{self.id}-header", Label)
            name = chain_data.get("name", "No Chain") if chain_data else "No Chain"
            header.update(f"{self.chain_label}: {name}")

            if self._is_active:
                header.remove_class("chain-header-inactive")
                header.add_class("chain-header-active")
            else:
                header.remove_class("chain-header-active")
                header.add_class("chain-header-inactive")

            # Update name and status
            name_label = self.query_one(f"#{self.id}-name", Label)
            name_label.update(f"Name: {name}")

            status_label = self.query_one(f"#{self.id}-status", Label)
            status_icon = "🟢" if self._is_active else "⚪"
            status_text = "Active" if self._is_active else "Inactive"
            status_label.update(f"Status: {status_icon} {status_text}")

            # Update plugin table
            table = self.query_one(f"#{self.id}-plugins", DataTable)
            table.clear()

            if self._plugins:
                for i, plugin in enumerate(self._plugins):
                    plugin_name = plugin.get("name", plugin.get("uri", "Unknown"))[:20]
                    bypassed = plugin.get("bypassed", False)
                    status_icon = "⏸️" if bypassed else "▶️"
                    table.add_row(str(i + 1), plugin_name, status_icon)
            else:
                table.add_row("-", "No plugins loaded", "-")

            # Update footer
            footer = self.query_one(f"#{self.id}-footer", Label)
            plugin_count = len(self._plugins)
            cpu_usage = chain_data.get("cpu_percent", 0) if chain_data else 0
            footer.update(f"{plugin_count} plugins | {cpu_usage:.1f}% CPU")

        except Exception as e:
            logger.debug(f"Error updating chain panel: {e}")


class LandingDashboard(Static):
    """
    Main landing dashboard showing:
    - Two signal chains (A and B)
    - Audio input/output levels
    - System resources (CPU, Memory, DSP)
    - Currently loaded components
    """

    DEFAULT_CSS = """
    LandingDashboard {
        width: 100%;
        height: 100%;
        background: $surface;
        layout: vertical;
        padding: 0;
    }

    .dashboard-title {
        width: 100%;
        height: 3;
        background: $primary;
        color: $text;
        text-style: bold;
        content-align: center middle;
        border-bottom: solid $accent;
    }

    .dashboard-main {
        width: 100%;
        height: 1fr;
        layout: horizontal;
        padding: 1;
    }

    .chains-section {
        width: 100%;
        height: 100%;
        layout: horizontal;
        padding: 0;
    }

    .info-section {
        display: none;
    }

    .audio-levels-panel {
        display: none;
    }

    .audio-levels-title {
        display: none;
    }

    .system-panel {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $warning;
        padding: 1;
        margin-bottom: 1;
    }

    .system-title {
        width: 100%;
        height: 2;
        background: $warning;
        color: #000;
        text-style: bold;
        padding: 0 1;
        margin-bottom: 1;
    }

    .loaded-panel {
        display: none;
    }

    .loaded-title {
        display: none;
    }

    .stat-row {
        width: 100%;
        height: auto;
        layout: horizontal;
        padding: 0;
        align: left middle;
    }

    .stat-label {
        width: auto;
        min-width: 12;
        color: $text-muted;
    }

    .stat-value {
        width: auto;
        min-width: 10;
        color: $text;
        text-style: bold;
    }

    .stat-good { color: #4CAF50 !important; }
    .stat-warn { color: #FF9800 !important; }
    .stat-bad { color: #F44336 !important; }

    #loaded-table {
        width: 100%;
        height: 1fr;
    }
    """

    # Reactive stats
    cpu_percent: reactive[float] = reactive(0.0)
    mem_percent: reactive[float] = reactive(0.0)
    dsp_load: reactive[float] = reactive(0.0)
    latency_ms: reactive[float] = reactive(0.0)
    input_level: reactive[float] = reactive(0.0)
    output_level: reactive[float] = reactive(0.0)

    def __init__(self, api_client=None, id: str = "landing-dashboard"):
        super().__init__(id=id)
        self.api_client = api_client
        self._refresh_task: Optional[asyncio.Task] = None
        self._chains: List[Dict] = []
        self._loaded_items: List[Dict] = []

    def compose(self) -> ComposeResult:
        yield Label("MAP2 AUDIO PLATFORM - DASHBOARD", classes="dashboard-title")

        with Horizontal(classes="dashboard-main"):
            # Six chain panels (A, B, C, D, E, F)
            with Horizontal(classes="chains-section"):
                yield ChainPanel("Flow A", chain_id=0, api_client=self.api_client, id="chain-a-panel")
                yield ChainPanel("Flow B", chain_id=1, api_client=self.api_client, id="chain-b-panel")
                yield ChainPanel("Flow C", chain_id=2, api_client=self.api_client, id="chain-c-panel")
                yield ChainPanel("Flow D", chain_id=3, api_client=self.api_client, id="chain-d-panel")
                yield ChainPanel("Flow E", chain_id=4, api_client=self.api_client, id="chain-e-panel")
                yield ChainPanel("Flow F", chain_id=5, api_client=self.api_client, id="chain-f-panel")

    async def on_mount(self) -> None:
        """Initialize and start refresh loop."""
        await self._refresh_all()
        self._refresh_task = self.set_interval(2.0, self._refresh_all)  # Adjusted type hint to match Timer

    def _init_loaded_table(self) -> None:
        """Initialize the loaded items table."""
        try:
            table = self.query_one("#loaded-table", DataTable)
            table.cursor_type = "row"
            table.zebra_stripes = True
            table.add_column("Type", key="type", width=12)
            table.add_column("Name", key="name", width=25)
            table.add_column("Status", key="status", width=10)
        except Exception as e:
            logger.debug(f"Error initializing loaded table: {e}")

    async def _refresh_all(self) -> None:
        """Refresh all dashboard data."""
        if not self.api_client:
            return

        try:
            # Fetch chains data only (removed audio levels, system stats, and loaded items)
            await self._fetch_chains()
            self._update_display()
        except Exception as e:
            logger.debug(f"Dashboard refresh error: {e}")

    async def _fetch_chains(self) -> None:
        """Fetch chain data."""
        if not self.api_client:
            logger.debug("API client is not available.")
            return

        try:
            result = await self.api_client.list_chains()
            if result.success and result.data:
                chains = result.data if isinstance(result.data, list) else result.data.get("chains", [])
                self._chains = chains[:6]  # Take first six chains for A/B/C/D/E/F

                # Get plugins for each chain and update panels
                chain_labels = ["chain-a-panel", "chain-b-panel", "chain-c-panel", "chain-d-panel", "chain-e-panel", "chain-f-panel"]
                
                for idx, (chain_label, chain) in enumerate(zip(chain_labels, self._chains)):
                    if chain:
                        chain_id = chain.get("id")
                        plugins = []
                        if chain_id is not None:
                            detail = await self.api_client.get_chain(chain_id)
                            if detail.success and detail.data:
                                plugins = detail.data.get("plugins", [])

                        # Update the corresponding panel
                        try:
                            panel = self.query_one(f"#{chain_label}", ChainPanel)
                            panel.update_chain(chain, plugins)
                        except Exception:
                            pass
                
                # Clear any remaining panels if fewer than 6 chains exist
                for idx in range(len(self._chains), 6):
                    chain_label = chain_labels[idx]
                    try:
                        panel = self.query_one(f"#{chain_label}", ChainPanel)
                        panel.update_chain(None, [])
                    except Exception:
                        pass

        except Exception as e:
            logger.debug(f"Error fetching chains: {e}")

    async def _fetch_audio_levels(self) -> None:
        """Fetch audio input/output levels."""
        if not self.api_client:
            logger.debug("API client is not available.")
            return

        try:
            result = await self.api_client.get_audio_levels()
            if result.success and result.data:
                data = result.data
                # API returns input_left, input_right, output_left, output_right
                # Take the max of left/right channels for the combined level
                input_left = float(data.get("input_left", 0))
                input_right = float(data.get("input_right", 0))
                output_left = float(data.get("output_left", 0))
                output_right = float(data.get("output_right", 0))

                self.input_level = max(input_left, input_right) * 100
                self.output_level = max(output_left, output_right) * 100

                # Update meters
                try:
                    input_meter = self.query_one("#input-meter", AudioMeter)
                    input_meter.update_level(self.input_level)

                    output_meter = self.query_one("#output-meter", AudioMeter)
                    output_meter.update_level(self.output_level)
                except Exception:
                    pass
        except Exception as e:
            logger.debug(f"Error fetching audio levels: {e}")

    async def _fetch_system_stats(self) -> None:
        """Fetch system resource stats."""
        if not self.api_client:
            logger.debug("API client is not available.")
            return

        try:
            # Get system metrics
            metrics_result = await self.api_client.get_current_metrics()
            if metrics_result.success and metrics_result.data:
                data = metrics_result.data
                self.cpu_percent = float(data.get("cpu_percent", 0))
                self.mem_percent = float(data.get("memory_percent", 0))

            # Get DSP status
            dsp_result = await self.api_client.get_dsp_status()
            if dsp_result.success and dsp_result.data:
                data = dsp_result.data
                # API returns utilization_percent for DSP load
                self.dsp_load = float(data.get("utilization_percent", data.get("current_load_percent", data.get("cpu_used", 0))))

            # Get audio latency
            latency_result = await self.api_client.get_audio_latency()
            if latency_result.success and latency_result.data:
                data = latency_result.data
                self.latency_ms = float(data.get("latency_ms", data.get("latency", 0)))

        except Exception as e:
            logger.debug(f"Error fetching system stats: {e}")

    async def _fetch_loaded_items(self) -> None:
        """Fetch currently loaded items (NAM model, IRs, etc.)."""
        if not self.api_client:
            logger.debug("API client is not available.")
            return

        try:
            self._loaded_items = []

            # Get NAM status
            nam_result = await self.api_client.get_nam_status()
            if nam_result.success and nam_result.data:
                data = nam_result.data
                model = data.get("current_model", data.get("model", "None"))
                if model and model != "None":
                    self._loaded_items.append({
                        "type": "NAM Model",
                        "name": str(model)[:25],
                        "status": "Loaded"
                    })

            # Get guitar/IR status
            guitar_result = await self.api_client.get_guitar_status()
            if guitar_result.success and guitar_result.data:
                data = guitar_result.data

                # Cabinet IR
                cab = data.get("cabinet", {})
                cab_ir = cab.get("current_ir", cab.get("ir")) if isinstance(cab, dict) else None
                if cab_ir:
                    self._loaded_items.append({
                        "type": "Cabinet IR",
                        "name": str(cab_ir)[:25],
                        "status": "Loaded"
                    })

                # Reverb IR
                reverb = data.get("reverb", {})
                rev_ir = reverb.get("current_ir", reverb.get("ir")) if isinstance(reverb, dict) else None
                if rev_ir:
                    self._loaded_items.append({
                        "type": "Reverb IR",
                        "name": str(rev_ir)[:25],
                        "status": "Loaded"
                    })

            # Get current pedalboard
            pb_result = await self.api_client.get_current_pedalboard()
            if pb_result.success and pb_result.data:
                data = pb_result.data
                pb_name = data.get("name", data.get("pedalboard"))
                if pb_name:
                    self._loaded_items.append({
                        "type": "Pedalboard",
                        "name": str(pb_name)[:25],
                        "status": "Active"
                    })

            # If nothing loaded, add placeholder
            if not self._loaded_items:
                self._loaded_items.append({
                    "type": "-",
                    "name": "No items currently loaded",
                    "status": "-"
                })

        except Exception as e:
            logger.debug(f"Error fetching loaded items: {e}")

    def _update_display(self) -> None:
        """Update all display elements."""
        try:
            # Chains are updated in _fetch_chains, no additional display updates needed
            pass
        except Exception as e:
            logger.debug(f"Error updating display: {e}")

"""
Enhanced Dashboard Screen - System Overview with Real Features from Web API
Displays: System Status, Active Audio Engine, Plugin Count, A/B Mode Status, Latest Chains

Mirrors the web dashboard (HomePage.tsx, CPUStatusOverview.tsx, SystemArchitectureFlow.tsx)
by fetching real data from the same API endpoints.
"""

import logging
import asyncio
import math
from textual.app import ComposeResult
from textual.containers import Vertical
from textual.widgets import Static, Label, DataTable
from textual.binding import Binding

logger = logging.getLogger(__name__)


class AudioEngineStatusWidget(Static):
    """Display audio engine real-time status - mirrors SystemArchitectureFlow.tsx."""

    DEFAULT_CSS = """
    #audio-engine-status {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $success;
        padding: 1 2;
        margin: 1 0;
    }

    #audio-engine-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None):
        super().__init__()
        self.api_client = api_client
        self.id = "audio-engine-status"
        # Data state
        self._audio_status = {}
        self._pipedal_status = {}
        self._audio_levels = {}
        self._audio_latency = None

    def compose(self) -> ComposeResult:
        """Compose audio engine status with table."""
        yield Label("AUDIO ENGINE STATUS", id="audio-title")
        yield DataTable(id="audio-engine-table")

    def _init_table(self) -> None:
        """Initialize table with headers."""
        table = self.query_one("#audio-engine-table", DataTable)
        if not table.columns:
            table.add_columns("Metric", "Value", "Status")
            table.add_row("Engine", "Loading...", "...")
            table.add_row("Sample Rate", "...", "...")
            table.add_row("Buffer", "...", "...")
            table.add_row("Latency", "...", "...")
            table.add_row("CPU Load", "...", "...")
            table.add_row("Xruns", "...", "...")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_table()
        self.set_interval(2.0, self._refresh_data)
        # Initial fetch
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real data from API endpoints - mirrors web's useEffect fetches."""
        if not self.api_client:
            return

        try:
            # Fetch audio status - /api/audio/status
            audio_result = await self.api_client.get_audio_status()
            if audio_result.success and audio_result.data:
                self._audio_status = audio_result.data

            # Fetch pipedal metrics - /api/audio/pipedal
            pipedal_result = await self.api_client.get_audio_pipedal_metrics()
            if pipedal_result.success and pipedal_result.data:
                self._pipedal_status = pipedal_result.data

            # Fetch audio levels - /api/audio/levels
            levels_result = await self.api_client.get_audio_levels()
            if levels_result.success and levels_result.data:
                self._audio_levels = levels_result.data

            # Fetch latency - /api/audio/latency
            latency_result = await self.api_client.get_audio_latency()
            if latency_result.success and latency_result.data:
                self._audio_latency = latency_result.data

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching audio status: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            table = self.query_one("#audio-engine-table", DataTable)
            table.clear()

            # Engine status
            engine = self._audio_status.get("engine", "JACK Audio")
            running = self._audio_status.get("running", False)
            status = "🟢 Running" if running else "🔴 Stopped"
            table.add_row("Engine", engine, status)

            # Sample rate
            sample_rate = self._audio_status.get("sample_rate", 48000)
            table.add_row("Sample Rate", f"{sample_rate} Hz", "🟢 OK")

            # Buffer size
            buffer_size = self._audio_status.get("buffer_size", 256)
            table.add_row("Buffer Size", str(buffer_size), "🟢 OK")

            # Latency
            latency = self._audio_latency.get("latency_ms", 0) if isinstance(self._audio_latency, dict) else 0
            if isinstance(latency, (int, float)):
                latency = round(latency, 2)
            latency_status = "🟢 Low" if latency < 10 else "🟡 Medium" if latency < 20 else "🔴 High"
            table.add_row("Latency", f"{latency} ms", latency_status)

            # CPU load
            cpu_load = self._pipedal_status.get("cpu_load", 0)
            if isinstance(cpu_load, (int, float)):
                cpu_load = round(cpu_load, 1)
            cpu_status = "🟢 OK" if cpu_load < 50 else "🟡 Moderate" if cpu_load < 80 else "🔴 High"
            table.add_row("CPU Load", f"{cpu_load}%", cpu_status)

            # Xruns
            xruns = self._pipedal_status.get("xruns", 0)
            xrun_status = "🟢 None" if xruns == 0 else "🟡 Some" if xruns < 10 else "🔴 Many"
            table.add_row("Xruns", str(xruns), xrun_status)

            # Audio levels - API returns input_left, input_right, output_left, output_right (0.0-1.0 scale)
            input_left = float(self._audio_levels.get("input_left", 0))
            input_right = float(self._audio_levels.get("input_right", 0))
            output_left = float(self._audio_levels.get("output_left", 0))
            output_right = float(self._audio_levels.get("output_right", 0))
            # Convert to dB (avoid log of 0)
            input_level = 20 * math.log10(max(input_left, input_right, 0.00001))
            output_level = 20 * math.log10(max(output_left, output_right, 0.00001))
            table.add_row("Input Level", f"{input_level:.1f} dB", "📊")
            table.add_row("Output Level", f"{output_level:.1f} dB", "📊")

        except Exception as e:
            logger.debug(f"Error updating audio display: {e}")


class PluginMetricsWidget(Static):
    """Display plugin and chain metrics - mirrors web's plugin/chain data fetching."""

    DEFAULT_CSS = """
    #plugin-metrics {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $warning;
        padding: 1 2;
        margin: 1 0;
    }

    #metrics-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None):
        super().__init__()
        self.api_client = api_client
        self.id = "plugin-metrics"
        # Data state
        self._plugins = []
        self._chains = []
        self._presets = []
        self._history_status = {}

    def compose(self) -> ComposeResult:
        """Compose plugin metrics with table."""
        yield Label("SYSTEM METRICS", id="metrics-title")
        yield DataTable(id="metrics-table")

    def _init_table(self) -> None:
        """Initialize table with headers."""
        table = self.query_one("#metrics-table", DataTable)
        if not table.columns:
            table.add_columns("Category", "Count", "Details")
            table.add_row("Plugins", "...", "Loading...")
            table.add_row("Chains", "...", "Loading...")
            table.add_row("Presets", "...", "Loading...")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_table()
        self.set_interval(5.0, self._refresh_data)
        # Initial fetch
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real data from API endpoints."""
        if not self.api_client:
            return

        try:
            # Fetch plugins - /api/pipedal/plugins/list
            plugins_result = await self.api_client.list_plugins()
            if plugins_result.success and plugins_result.data:
                self._plugins = plugins_result.data if isinstance(plugins_result.data, list) else plugins_result.data.get("plugins", [])

            # Fetch chains - /api/chains/
            chains_result = await self.api_client.list_chains()
            if chains_result.success and chains_result.data:
                self._chains = chains_result.data if isinstance(chains_result.data, list) else chains_result.data.get("chains", [])

            # Fetch presets - /api/presets/
            presets_result = await self.api_client.list_presets()
            if presets_result.success and presets_result.data:
                self._presets = presets_result.data if isinstance(presets_result.data, list) else presets_result.data.get("presets", [])

            # Fetch history status - /api/history/status
            history_result = await self.api_client.get_history_status()
            if history_result.success and history_result.data:
                self._history_status = history_result.data

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching plugin metrics: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            table = self.query_one("#metrics-table", DataTable)
            table.clear()

            # Plugin metrics
            total_plugins = len(self._plugins)
            effect_count = sum(1 for p in self._plugins if p.get("category", "").lower() in ["effect", "effects", "dynamics", "filter", "modulator"])
            table.add_row("Plugins", str(total_plugins), f"Effects: {effect_count}")

            # Chain metrics
            total_chains = len(self._chains)
            active_chains = sum(1 for c in self._chains if c.get("active", False) or c.get("is_active", False))
            table.add_row("Chains", str(total_chains), f"{active_chains} active")

            # Presets
            table.add_row("Presets", str(len(self._presets)), "Available")

            # History
            history_count = self._history_status.get("history_count", 0)
            can_undo = self._history_status.get("can_undo", False)
            undo_text = "Undo available" if can_undo else "No undo"
            table.add_row("History", f"{history_count} steps", undo_text)

        except Exception as e:
            logger.debug(f"Error updating plugin metrics display: {e}")


class ABModeStatusWidget(Static):
    """Display A/B comparison mode status - mirrors web's A/B mode features."""

    DEFAULT_CSS = """
    #ab-mode-status {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $accent;
        padding: 1 2;
        margin: 1 0;
    }

    #ab-mode-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #ab-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None):
        super().__init__()
        self.api_client = api_client
        self.id = "ab-mode-status"
        # Data state
        self._ab_status = {}
        self._chains = []

    def compose(self) -> ComposeResult:
        """Compose A/B mode status with tables."""
        yield Label("A/B COMPARISON MODE", id="ab-title")
        yield DataTable(id="ab-mode-table")
        yield Label("Quick Actions:", id="ab-actions-label")
        yield DataTable(id="ab-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Status table
        table = self.query_one("#ab-mode-table", DataTable)
        if not table.columns:
            table.add_columns("Slot", "Chain", "Plugins", "Status")
            table.add_row("A", "Loading...", "...", "...")
            table.add_row("B", "Loading...", "...", "...")

        # Actions table
        actions = self.query_one("#ab-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.add_row("[", "100% A", "Full signal from chain A")
            actions.add_row("=", "50/50", "Equal blend from both")
            actions.add_row("]", "100% B", "Full signal from chain B")
            actions.add_row("x", "Swap", "Swap A and B chains")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(3.0, self._refresh_data)
        # Initial fetch
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real A/B mode data from API."""
        if not self.api_client:
            return

        try:
            # Fetch A/B mode status - /api/chains/ab-mode/status
            ab_result = await self.api_client.get_ab_mode_status()
            if ab_result.success and ab_result.data:
                self._ab_status = ab_result.data

            # Fetch chains for context - /api/chains/
            chains_result = await self.api_client.list_chains()
            if chains_result.success and chains_result.data:
                self._chains = chains_result.data if isinstance(chains_result.data, list) else chains_result.data.get("chains", [])

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching A/B mode status: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            table = self.query_one("#ab-mode-table", DataTable)
            table.clear()

            enabled = self._ab_status.get("enabled", False)

            if enabled:
                chain_a_id = self._ab_status.get("chain_a_id")
                chain_b_id = self._ab_status.get("chain_b_id")
                blend = self._ab_status.get("blend", 50)

                # Find chain names
                chain_a_name = "Chain A"
                chain_b_name = "Chain B"
                chain_a_plugins = 0
                chain_b_plugins = 0

                for chain in self._chains:
                    cid = chain.get("id") or chain.get("chain_id")
                    if cid == chain_a_id:
                        chain_a_name = chain.get("name", "Chain A")
                        chain_a_plugins = len(chain.get("plugins", []))
                    elif cid == chain_b_id:
                        chain_b_name = chain.get("name", "Chain B")
                        chain_b_plugins = len(chain.get("plugins", []))

                a_percent = 100 - blend
                b_percent = blend
                table.add_row("A", chain_a_name, str(chain_a_plugins), f"🟢 {a_percent}%")
                table.add_row("B", chain_b_name, str(chain_b_plugins), f"🟢 {b_percent}%")
                table.add_row("Blend", f"{a_percent}/{b_percent}", "-", "Active")
            else:
                table.add_row("A", "Not configured", "-", "⚪ Off")
                table.add_row("B", "Not configured", "-", "⚪ Off")
                table.add_row("Mode", "Disabled", "-", "Select chains to enable")

        except Exception as e:
            logger.debug(f"Error updating A/B display: {e}")


class RecentActivityWidget(Static):
    """Display recent chains and presets - mirrors web's recent activity."""

    DEFAULT_CSS = """
    #recent-activity {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $accent;
        padding: 1 2;
        margin: 1 0;
    }

    #recent-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None):
        super().__init__()
        self.api_client = api_client
        self.id = "recent-activity"
        # Data state
        self._chains = []
        self._presets = []
        self._sessions = []

    def compose(self) -> ComposeResult:
        """Compose recent activity with table."""
        yield Label("RECENT ACTIVITY", id="recent-title")
        yield DataTable(id="recent-table")

    def _init_table(self) -> None:
        """Initialize table with headers."""
        table = self.query_one("#recent-table", DataTable)
        if not table.columns:
            table.add_columns("Type", "Name", "Details")
            table.add_row("...", "Loading...", "...")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_table()
        self.set_interval(10.0, self._refresh_data)
        # Initial fetch
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real recent activity data from API."""
        if not self.api_client:
            return

        try:
            # Fetch chains - /api/chains/
            chains_result = await self.api_client.list_chains()
            if chains_result.success and chains_result.data:
                self._chains = chains_result.data if isinstance(chains_result.data, list) else chains_result.data.get("chains", [])

            # Fetch presets - /api/presets/
            presets_result = await self.api_client.list_presets()
            if presets_result.success and presets_result.data:
                self._presets = presets_result.data if isinstance(presets_result.data, list) else presets_result.data.get("presets", [])

            # Fetch sessions - /api/sessions/list
            sessions_result = await self.api_client.list_sessions()
            if sessions_result.success and sessions_result.data:
                self._sessions = sessions_result.data if isinstance(sessions_result.data, list) else sessions_result.data.get("sessions", [])

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching recent activity: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            table = self.query_one("#recent-table", DataTable)
            table.clear()

            # Recent chains (last 3)
            for chain in self._chains[:3]:
                name = chain.get("name", "Unnamed")
                plugins = len(chain.get("plugins", []))
                active = chain.get("active", False) or chain.get("is_active", False)
                status = "🟢 Active" if active else ""
                table.add_row("🎸 Chain", name, f"{plugins} plugins {status}")

            # Recent presets (last 2)
            for preset in self._presets[:2]:
                name = preset.get("name", "Unnamed")
                category = preset.get("category", "General")
                table.add_row("🎚️ Preset", name, category)

            # Recent sessions (last 2)
            for session in self._sessions[:2]:
                name = session.get("name", "Unnamed")
                table.add_row("📋 Session", name, "")

            if not self._chains and not self._presets and not self._sessions:
                table.add_row("-", "No recent activity", "-")

        except Exception as e:
            logger.debug(f"Error updating recent activity display: {e}")


class PedalboardHealthWidget(Static):
    """Display pedalboard/chain health and diagnostics - mirrors web's health checks."""

    DEFAULT_CSS = """
    #pedalboard-health {
        width: 100%;
        height: auto;
        background: $panel 30%;
        border: solid $primary;
        padding: 1 2;
        margin: 1 0;
    }

    #health-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #health-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None):
        super().__init__()
        self.api_client = api_client
        self.id = "pedalboard-health"
        # Data state
        self._health = {}
        self._metrics = {}
        self._midi_status = {}
        self._network_status = {}

    def compose(self) -> ComposeResult:
        """Compose pedalboard health with tables."""
        yield Label("SYSTEM HEALTH", id="health-title")
        yield DataTable(id="health-table")
        yield Label("Actions:", id="health-actions-label")
        yield DataTable(id="health-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Health table
        table = self.query_one("#health-table", DataTable)
        if not table.columns:
            table.add_columns("Component", "Status", "Value")
            table.add_row("Audio", "Loading...", "...")
            table.add_row("MIDI", "Loading...", "...")
            table.add_row("Network", "Loading...", "...")
            table.add_row("CPU", "Loading...", "...")
            table.add_row("Memory", "Loading...", "...")

        # Actions table
        actions = self.query_one("#health-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.add_row("d", "Diagnostic", "Run full system diagnostic")
            actions.add_row("e", "Export", "Export health report")
            actions.add_row("l", "Logs", "View system logs")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(5.0, self._refresh_data)
        # Initial fetch
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real health data from API - mirrors web's health checks."""
        if not self.api_client:
            return

        try:
            # Fetch health - /api/health
            health_result = await self.api_client.get_health()
            if health_result.success and health_result.data:
                self._health = health_result.data

            # Fetch current metrics - /api/metrics/current
            metrics_result = await self.api_client.get_current_metrics()
            if metrics_result.success and metrics_result.data:
                self._metrics = metrics_result.data

            # Fetch MIDI status - /api/midi/status
            midi_result = await self.api_client.get_midi_status()
            if midi_result.success and midi_result.data:
                self._midi_status = midi_result.data

            # Fetch network status - /api/network/status
            network_result = await self.api_client.get_network_status()
            if network_result.success and network_result.data:
                self._network_status = network_result.data

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching health status: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            table = self.query_one("#health-table", DataTable)
            table.clear()

            # Audio status
            audio_ok = self._health.get("audio", {}).get("status", "unknown") == "healthy" or self._health.get("status") == "ok"
            audio_status = "🟢 OK" if audio_ok else "🔴 Error"
            table.add_row("Audio Engine", audio_status, "Running")

            # MIDI status
            midi_ok = self._midi_status.get("enabled", False) or self._midi_status.get("available", False)
            midi_status = "🟢 OK" if midi_ok else "⚪ N/A"
            midi_devices = self._midi_status.get("devices", 0)
            table.add_row("MIDI", midi_status, f"{midi_devices} devices")

            # Network status
            network_ok = self._network_status.get("connected", False) or self._network_status.get("status") == "connected"
            network_status = "🟢 Connected" if network_ok else "🟡 Disconnected"
            ip = self._network_status.get("ip_address", "N/A")
            table.add_row("Network", network_status, ip)

            # CPU and Memory status
            if not self._metrics or (self._metrics.get("cpu_percent") is None and self._metrics.get("memory_percent") is None):
                table.add_row("CPU", "[red]No data[/red]", "Backend unavailable?")
                table.add_row("Memory", "[red]No data[/red]", "Backend unavailable?")
            else:
                cpu_percent = self._metrics.get("cpu_percent", 0)
                if isinstance(cpu_percent, (int, float)):
                    cpu_percent = round(cpu_percent, 1)
                cpu_status = "🟢 OK" if cpu_percent < 50 else "🟡 Moderate" if cpu_percent < 80 else "🔴 High"
                table.add_row("CPU", cpu_status, f"{cpu_percent}%")

                memory_percent = self._metrics.get("memory_percent", 0)
                memory_used = self._metrics.get("memory_used_gb", 0)
                memory_total = self._metrics.get("memory_total_gb", 0)
                if isinstance(memory_percent, (int, float)):
                    memory_percent = round(memory_percent, 1)
                if isinstance(memory_used, (int, float)):
                    memory_used = round(memory_used, 1)
                if isinstance(memory_total, (int, float)):
                    memory_total = round(memory_total, 1)
                mem_status = "🟢 OK" if memory_percent < 50 else "🟡 Moderate" if memory_percent < 80 else "🔴 High"
                table.add_row("Memory", mem_status, f"{memory_percent}% ({memory_used}/{memory_total}GB)")

        except Exception as e:
            logger.debug(f"Error updating health display: {e}")


class DashboardScreen(Static):
    """
    Enhanced Dashboard Screen - Real system overview reflecting web API.

    Shows:
    - Audio engine status (JACK, CPU, Latency, Xruns) - from /api/audio/*
    - Plugin and chain metrics - from /api/pipedal/plugins, /api/chains
    - A/B comparison mode status - from /api/chains/ab-mode/status
    - Recent chains and presets - from /api/chains, /api/presets
    - System health diagnostics - from /api/health, /api/metrics
    """

    DEFAULT_CSS = """
    DashboardScreen {
        width: 100%;
        height: 100%;
        background: $surface;
        layout: vertical;
        overflow: auto;
    }
    """

    BINDINGS = [
        Binding("a", "toggle_ab_mode", "A/B Mode", show=True),
        Binding("r", "refresh_data", "Refresh", show=True),
        Binding("d", "diagnostics", "Diag", show=True),
    ]

    def __init__(self, api_client=None, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client

    def compose(self) -> ComposeResult:
        """Compose dashboard with real system data."""
        with Vertical(id="dashboard-container"):
            yield AudioEngineStatusWidget(self.api_client)
            yield PluginMetricsWidget(self.api_client)
            yield ABModeStatusWidget(self.api_client)
            yield RecentActivityWidget(self.api_client)
            yield PedalboardHealthWidget(self.api_client)

    async def action_toggle_ab_mode(self) -> None:
        """Toggle A/B comparison mode."""
        if not self.api_client:
            self.notify("API client not available", severity="warning", timeout=2)
            return

        try:
            # Get current A/B status
            ab_result = await self.api_client.get_ab_mode_status()
            if ab_result.success and ab_result.data:
                enabled = ab_result.data.get("enabled", False)

                if enabled:
                    # Disable A/B mode
                    result = await self.api_client.disable_ab_mode()
                    if result.success:
                        self.notify("A/B Mode disabled", severity="information", timeout=2)
                    else:
                        self.notify(f"Failed to disable A/B mode: {result.error}", severity="error", timeout=3)
                else:
                    # Need to select chains first - notify user
                    self.notify("Select two chains to enable A/B mode", severity="warning", timeout=3)
            else:
                self.notify("Could not get A/B mode status", severity="warning", timeout=2)
        except Exception as e:
            self.notify(f"Error toggling A/B mode: {e}", severity="error", timeout=3)

    async def action_refresh_data(self) -> None:
        """Refresh all dashboard data."""
        self.notify("Refreshing dashboard...", severity="information", timeout=1)

        # Trigger refresh on all child widgets
        try:
            for widget in self.query("AudioEngineStatusWidget"):
                asyncio.create_task(widget._refresh_data())
            for widget in self.query("PluginMetricsWidget"):
                asyncio.create_task(widget._refresh_data())
            for widget in self.query("ABModeStatusWidget"):
                asyncio.create_task(widget._refresh_data())
            for widget in self.query("RecentActivityWidget"):
                asyncio.create_task(widget._refresh_data())
            for widget in self.query("PedalboardHealthWidget"):
                asyncio.create_task(widget._refresh_data())

            self.notify("Dashboard refreshed", severity="information", timeout=2)
        except Exception as e:
            self.notify(f"Refresh error: {e}", severity="error", timeout=3)

    def action_diagnostics(self) -> None:
        """Open diagnostics tab."""
        try:
            # Try to navigate to diagnostics tab (usually tab 6)
            if hasattr(self.app, 'action_goto_tab_6'):
                self.app.action_goto_tab_6()
            else:
                self.notify("Diagnostics: Press 'd' to run full system diagnostic", severity="information", timeout=3)
        except Exception as e:
            self.notify(f"Could not open diagnostics: {e}", severity="warning", timeout=2)

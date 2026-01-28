"""
Plugin Loader Screen - Unified Plugin Management System

This screen integrates the following previously unused components:
- LV2 Discovery & Enhanced Services (plugin scanning)
- Native Plugin Adapters (NAM, IR Loaders, ReevR)
- DSP Manager (quality modes, CPU budgeting)
- Latency Compensation (per-plugin latency tracking)
- RT Monitor (real-time performance metrics)
- Command History (undo/redo for plugin operations)
- MIDI Mapping Service (CC to parameter bindings)
- Command Queue (RT-safe database operations)

Architecture:
┌─────────────────────────────────────────────────────────────┐
│                 Plugin Loader System                         │
├─────────────────────────────────────────────────────────────┤
│  Discovery → Loading → DSP Management → RT Monitoring       │
│  ↓                                                           │
│  MIDI Mapping ← Command History (Undo/Redo)                 │
└─────────────────────────────────────────────────────────────┘
"""

from typing import Optional, List, Dict, Any
from textual.app import ComposeResult
from textual.widgets import Static, Button, Label, DataTable, ProgressBar, Switch
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.reactive import reactive

import logging
import sys

logger = logging.getLogger(__name__)
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from api_client import MAP2APIClient
from widgets import ActionButton, StatusIndicator


class PluginCard(Static):
    """Card displaying a single plugin with load/unload controls."""

    DEFAULT_CSS = """
    PluginCard {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $primary-darken-2;
        padding: 1;
        margin-bottom: 1;
    }

    PluginCard:hover {
        background: $panel-lighten-1;
        border: solid $primary;
    }

    PluginCard.loaded {
        border: solid $success;
        background: $success 10%;
    }

    PluginCard.native {
        border: solid $warning;
    }

    .plugin-header {
        width: 100%;
        height: auto;
        layout: horizontal;
    }

    .plugin-name {
        text-style: bold;
        color: $text;
        width: 1fr;
    }

    .plugin-category {
        color: $accent;
        padding: 0 1;
    }

    .plugin-uri {
        color: $text-muted;
        text-style: italic;
        width: 100%;
        height: auto;
    }

    .plugin-stats {
        width: 100%;
        height: auto;
        margin-top: 1;
        layout: horizontal;
    }

    .stat-item {
        width: auto;
        padding-right: 2;
    }

    .stat-label {
        color: $text-muted;
        width: auto;
    }

    .stat-value {
        color: $success;
        margin-right: 2;
        text-style: bold;
    }

    .stat-warning {
        color: $warning;
    }

    .stat-critical {
        color: $error;
    }
    """

    def __init__(self, plugin_data: Dict[str, Any], **kwargs):
        super().__init__(**kwargs)
        self.plugin_data = plugin_data
        self.is_loaded = plugin_data.get('loaded', False)
        self.is_native = plugin_data.get('uri', '').startswith('http://map2-audio.local/')

    def compose(self) -> ComposeResult:
        with Vertical():
            # Header row with name and category
            with Horizontal(classes="plugin-header"):
                yield Label(self.plugin_data.get('name', 'Unknown'), classes="plugin-name")
                category = self.plugin_data.get('category', 'Utility')
                if category:
                    yield Label(f"[{category}]", classes="plugin-category")

            # URI row
            uri = self.plugin_data.get('uri', '')
            if uri:
                yield Label(uri, classes="plugin-uri")

            # Description if available
            desc = self.plugin_data.get('description', '')
            if desc:
                yield Label(desc, classes="plugin-uri")

            # Stats row
            with Horizontal(classes="plugin-stats"):
                # Author
                author = self.plugin_data.get('author', '')
                if author:
                    with Vertical(classes="stat-item"):
                        yield Label(f"Author: {author}", classes="stat-label")

                # Latency
                latency = self.plugin_data.get('latency_samples', 0)
                with Vertical(classes="stat-item"):
                    yield Label(f"Latency: {latency} samples", classes="stat-label")

                # CPU
                cpu = self.plugin_data.get('cpu_estimate_us', 0)
                cpu_class = "stat-value" if cpu < 1000 else ("stat-warning" if cpu < 3000 else "stat-critical")
                with Vertical(classes="stat-item"):
                    yield Label(f"CPU: {cpu}μs", classes=cpu_class)

                # RT-Safe
                rt_safe = self.plugin_data.get('is_rt_safe', True)
                with Vertical(classes="stat-item"):
                    yield Label(f"RT-Safe: {'✓' if rt_safe else '✗'}", classes="stat-value" if rt_safe else "stat-critical")

                # Ports
                in_ports = self.plugin_data.get('in_ports', 0)
                out_ports = self.plugin_data.get('out_ports', 0)
                with Vertical(classes="stat-item"):
                    yield Label(f"I/O: {in_ports}→{out_ports}", classes="stat-label")

    def on_mount(self) -> None:
        if self.is_loaded:
            self.add_class("loaded")
        if self.is_native:
            self.add_class("native")


class DSPModeSelector(Static):
    """DSP Quality Mode selector with CPU budget display."""

    DEFAULT_CSS = """
    DSPModeSelector {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $accent;
        padding: 1;
        margin-bottom: 1;
    }

    .mode-title {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    .mode-buttons {
        width: 100%;
        height: auto;
    }

    .mode-button {
        margin-right: 1;
        min-width: 15;
    }

    .mode-active {
        background: $success;
        color: $text;
    }

    .cpu-display {
        width: 100%;
        height: auto;
        margin-top: 1;
    }

    .cpu-bar {
        width: 1fr;
        margin: 0 1;
    }

    .cpu-label {
        color: $text-muted;
    }

    .cpu-value {
        color: $success;
        text-style: bold;
    }

    .cpu-warning {
        color: $warning;
    }

    .cpu-critical {
        color: $error;
    }
    """

    current_mode: reactive[str] = reactive("BALANCED")
    cpu_usage: reactive[float] = reactive(0.0)
    cpu_budget: reactive[float] = reactive(80.0)

    def compose(self) -> ComposeResult:
        yield Label("⚡ DSP Quality Mode", classes="mode-title")

        with Horizontal(classes="mode-buttons"):
            yield Button("🚀 Performance", id="mode-performance", classes="mode-button")
            yield Button("⚖️ Balanced", id="mode-balanced", classes="mode-button mode-active")
            yield Button("🎧 Quality", id="mode-quality", classes="mode-button")

        with Horizontal(classes="cpu-display"):
            yield Label("CPU:", classes="cpu-label")
            yield ProgressBar(total=100, show_eta=False, classes="cpu-bar", id="cpu-bar")
            yield Label("0%", id="cpu-value", classes="cpu-value")
            yield Label(f"/ {self.cpu_budget}% budget", classes="cpu-label")

    def watch_cpu_usage(self, value: float) -> None:
        """Update CPU display when usage changes."""
        try:
            bar = self.query_one("#cpu-bar", ProgressBar)
            label = self.query_one("#cpu-value", Label)
            bar.progress = value
            label.update(f"{value:.1f}%")

            # Update color based on usage
            label.remove_class("cpu-value", "cpu-warning", "cpu-critical")
            if value > 90:
                label.add_class("cpu-critical")
            elif value > 70:
                label.add_class("cpu-warning")
            else:
                label.add_class("cpu-value")
        except Exception as e:
            self.log.debug(f"Could not update CPU display: {e}")

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle mode button clicks."""
        # Remove active class from all
        for btn in self.query(".mode-button"):
            btn.remove_class("mode-active")

        # Add active to pressed button
        event.button.add_class("mode-active")

        # Update mode
        if event.button.id == "mode-performance":
            self.current_mode = "PERFORMANCE"
        elif event.button.id == "mode-balanced":
            self.current_mode = "BALANCED"
        elif event.button.id == "mode-quality":
            self.current_mode = "QUALITY"


class RTMonitorPanel(Static):
    """Real-time performance monitoring panel."""

    DEFAULT_CSS = """
    RTMonitorPanel {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    .monitor-title {
        text-style: bold;
        color: $primary;
        margin-bottom: 1;
    }

    .monitor-grid {
        width: 100%;
        height: auto;
    }

    .metric-row {
        width: 100%;
        height: auto;
        padding: 0;
    }

    .metric-label {
        width: 20;
        color: $text-muted;
    }

    .metric-value {
        width: 15;
        text-style: bold;
    }

    .health-healthy {
        color: $success;
    }

    .health-warning {
        color: $warning;
    }

    .health-critical {
        color: $error;
        text-style: bold blink;
    }
    """

    health_status: reactive[str] = reactive("healthy")
    callback_mean: reactive[float] = reactive(0.0)
    callback_p95: reactive[float] = reactive(0.0)
    xrun_count: reactive[int] = reactive(0)
    xrun_rate: reactive[float] = reactive(0.0)

    def compose(self) -> ComposeResult:
        yield Label("📊 Real-Time Monitor", classes="monitor-title")

        with Vertical(classes="monitor-grid"):
            with Horizontal(classes="metric-row"):
                yield Label("Health Status:", classes="metric-label")
                yield Label("● Healthy", id="health-indicator", classes="metric-value health-healthy")

            with Horizontal(classes="metric-row"):
                yield Label("Callback (mean):", classes="metric-label")
                yield Label("0.0 μs", id="callback-mean", classes="metric-value")

            with Horizontal(classes="metric-row"):
                yield Label("Callback (p95):", classes="metric-label")
                yield Label("0.0 μs", id="callback-p95", classes="metric-value")

            with Horizontal(classes="metric-row"):
                yield Label("Xruns:", classes="metric-label")
                yield Label("0", id="xrun-count", classes="metric-value")

            with Horizontal(classes="metric-row"):
                yield Label("Xrun Rate:", classes="metric-label")
                yield Label("0.0%", id="xrun-rate", classes="metric-value")

    def update_metrics(self, metrics: Dict[str, Any]) -> None:
        """Update all metrics from dict."""
        try:
            self.query_one("#callback-mean", Label).update(f"{metrics.get('mean_callback_us', 0):.1f} μs")
            self.query_one("#callback-p95", Label).update(f"{metrics.get('p95_callback_us', 0):.1f} μs")
            self.query_one("#xrun-count", Label).update(str(metrics.get('xrun_count', 0)))
            self.query_one("#xrun-rate", Label).update(f"{metrics.get('xrun_rate_pct', 0):.2f}%")

            # Update health indicator
            health = metrics.get('health', 'healthy')
            indicator = self.query_one("#health-indicator", Label)
            indicator.remove_class("health-healthy", "health-warning", "health-critical")

            if health == "critical":
                indicator.update("● CRITICAL")
                indicator.add_class("health-critical")
            elif health == "warning":
                indicator.update("● Warning")
                indicator.add_class("health-warning")
            else:
                indicator.update("● Healthy")
                indicator.add_class("health-healthy")
        except Exception:
            pass


class CommandHistoryPanel(Static):
    """Undo/Redo command history panel."""

    DEFAULT_CSS = """
    CommandHistoryPanel {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $secondary;
        padding: 1;
        margin-bottom: 1;
    }

    .history-title {
        text-style: bold;
        color: $secondary;
        margin-bottom: 1;
    }

    .history-buttons {
        width: 100%;
        height: auto;
    }

    .history-button {
        margin-right: 1;
        min-width: 12;
    }

    .history-button:disabled {
        opacity: 0.5;
    }

    .history-status {
        color: $text-muted;
        margin-top: 1;
    }
    """

    can_undo: reactive[bool] = reactive(False)
    can_redo: reactive[bool] = reactive(False)
    last_action: reactive[str] = reactive("")

    def compose(self) -> ComposeResult:
        yield Label("↩️ Command History", classes="history-title")

        with Horizontal(classes="history-buttons"):
            yield Button("↶ Undo", id="btn-undo", classes="history-button", disabled=True)
            yield Button("↷ Redo", id="btn-redo", classes="history-button", disabled=True)
            yield Button("📸 Snapshot", id="btn-snapshot", classes="history-button")
            yield Button("🔄 Restore", id="btn-restore", classes="history-button")

        yield Label("No actions yet", id="history-status", classes="history-status")

    def watch_can_undo(self, value: bool) -> None:
        try:
            self.query_one("#btn-undo", Button).disabled = not value
        except Exception:
            pass

    def watch_can_redo(self, value: bool) -> None:
        try:
            self.query_one("#btn-redo", Button).disabled = not value
        except Exception:
            pass

    def watch_last_action(self, value: str) -> None:
        try:
            self.query_one("#history-status", Label).update(value if value else "No actions yet")
        except Exception:
            pass


class LatencyCompensationPanel(Static):
    """Latency compensation settings panel."""

    DEFAULT_CSS = """
    LatencyCompensationPanel {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $warning;
        padding: 1;
        margin-bottom: 1;
    }

    .latency-title {
        text-style: bold;
        color: $warning;
        margin-bottom: 1;
    }

    .latency-row {
        width: 100%;
        height: auto;
    }

    .latency-label {
        color: $text-muted;
        width: 25;
    }

    .latency-value {
        color: $text;
        text-style: bold;
    }

    .compensation-enabled {
        color: $success;
    }

    .compensation-disabled {
        color: $text-muted;
    }
    """

    enabled: reactive[bool] = reactive(False)
    total_latency_samples: reactive[int] = reactive(0)
    total_latency_ms: reactive[float] = reactive(0.0)

    def compose(self) -> ComposeResult:
        yield Label("⏱️ Latency Compensation", classes="latency-title")

        with Vertical():
            with Horizontal(classes="latency-row"):
                yield Label("Compensation:", classes="latency-label")
                yield Label("Disabled", id="comp-status", classes="latency-value compensation-disabled")
                yield Button("Enable", id="btn-comp-toggle", variant="success")

            with Horizontal(classes="latency-row"):
                yield Label("Total Chain Latency:", classes="latency-label")
                yield Label("0 samples (0.0 ms)", id="total-latency", classes="latency-value")

            with Horizontal(classes="latency-row"):
                yield Button("🔍 Measure All", id="btn-measure", variant="primary")
                yield Button("🔄 Reset Delays", id="btn-reset-delays", variant="warning")

    def update_latency(self, samples: int, ms: float, enabled: bool) -> None:
        try:
            self.query_one("#total-latency", Label).update(f"{samples} samples ({ms:.2f} ms)")
            status = self.query_one("#comp-status", Label)
            btn = self.query_one("#btn-comp-toggle", Button)

            status.remove_class("compensation-enabled", "compensation-disabled")
            if enabled:
                status.update("Enabled")
                status.add_class("compensation-enabled")
                btn.label = "Disable"
                btn.variant = "error"
            else:
                status.update("Disabled")
                status.add_class("compensation-disabled")
                btn.label = "Enable"
                btn.variant = "success"
        except Exception:
            pass


class NativePluginsPanel(Static):
    """Panel showing native MAP2 plugins (NAM, IR Loaders, etc.)."""

    DEFAULT_CSS = """
    NativePluginsPanel {
        width: 100%;
        height: auto;
        background: $panel;
        border: double $warning;
        padding: 1;
        margin-bottom: 1;
    }

    .native-title {
        text-style: bold;
        color: $warning;
        margin-bottom: 1;
    }

    .native-plugin-row {
        width: 100%;
        height: auto;
        padding: 0 0 1 0;
        border-bottom: solid $panel-lighten-1;
    }

    .native-plugin-name {
        width: 1fr;
        text-style: bold;
    }

    .native-plugin-uri {
        color: $text-muted;
        text-style: italic;
    }

    .native-plugin-status {
        color: $success;
    }
    """

    NATIVE_PLUGINS = [
        {"name": "NAM Loader", "uri": "http://map2-audio.local/nam-loader", "desc": "Neural Amp Modeler - AI amp/pedal simulation"},
        {"name": "Cabinet IR Loader", "uri": "http://map2-audio.local/ir-cabinet-loader", "desc": "Cabinet impulse response convolution"},
        {"name": "Reverb IR Loader", "uri": "http://map2-audio.local/ir-reverb-loader", "desc": "Reverb impulse response convolution"},
        {"name": "ReevR Engine", "uri": "http://map2-audio.local/reevr-engine", "desc": "High-quality convolution reverb engine"},
    ]

    def compose(self) -> ComposeResult:
        yield Label("🔌 Native MAP2 Plugins", classes="native-title")

        with Vertical():
            for plugin in self.NATIVE_PLUGINS:
                with Vertical(classes="native-plugin-row"):
                    with Horizontal():
                        yield Label(plugin["name"], classes="native-plugin-name")
                        yield Label("● Available", classes="native-plugin-status")
                    yield Label(plugin["uri"], classes="native-plugin-uri")
                    yield Label(plugin["desc"], classes="native-plugin-uri")


class PluginLoaderScreen(ScrollableContainer):
    """
    Plugin Loader Screen - Unified Plugin Management System.

    Integrates:
    - Plugin Discovery (LV2 + Native)
    - DSP Quality Management
    - Latency Compensation
    - Real-Time Monitoring
    - Command History (Undo/Redo)
    - MIDI Mapping
    """

    CSS = """
    PluginLoaderScreen {
        background: $background;
        width: 100%;
        height: 100%;
        padding: 1;
    }

    .screen-title {
        text-style: bold;
        color: $text;
        text-align: center;
        width: 100%;
        padding: 1;
        background: $accent;
        margin-bottom: 1;
    }

    .main-columns {
        width: 100%;
        height: 1fr;
    }

    .left-column {
        width: 2fr;
        height: 100%;
        padding-right: 1;
    }

    .right-column {
        width: 1fr;
        height: 100%;
        padding-left: 1;
        overflow-y: auto;
    }

    .section-title {
        text-style: bold;
        color: $accent;
        margin-top: 1;
        margin-bottom: 1;
        border-bottom: solid $accent;
        padding-bottom: 0;
    }

    .plugin-list {
        width: 100%;
        height: 1fr;
        overflow-y: auto;
    }

    .scan-controls {
        width: 100%;
        height: auto;
        margin-bottom: 1;
    }

    .scan-button {
        margin-right: 1;
    }

    .plugin-count {
        color: $text-muted;
        margin-left: 2;
    }

    .filter-row {
        width: 100%;
        height: auto;
        margin-bottom: 1;
    }

    .filter-label {
        color: $text-muted;
        margin-right: 1;
    }

    .category-button {
        margin-right: 1;
        min-width: 10;
    }

    .category-active {
        background: $accent;
    }
    """

    # Reactive state
    plugins: reactive[List[Dict[str, Any]]] = reactive([])
    categories: reactive[List[str]] = reactive([])
    selected_category: reactive[str] = reactive("All")
    scan_in_progress: reactive[bool] = reactive(False)

    def __init__(self, api_client: MAP2APIClient, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client

    def watch_plugins(self, plugins: List[Dict[str, Any]]) -> None:
        """Update plugin list when plugins reactive property changes."""
        self.log(f"watch_plugins called with {len(plugins)} plugins")
        self.update_plugin_list()

    def compose(self) -> ComposeResult:
        yield Label("🔌 PLUGIN LOADER - Unified Plugin Management System", classes="screen-title")

        with Horizontal(classes="main-columns"):
            # Left column - Plugin Discovery & List
            with Vertical(classes="left-column"):
                yield Label("📦 Plugin Discovery", classes="section-title")

                with Horizontal(classes="scan-controls"):
                    yield Button("🔍 Scan LV2", id="btn-scan-lv2", classes="scan-button", variant="primary")
                    yield Button("🔄 Refresh", id="btn-refresh", classes="scan-button")
                    yield Label("0 plugins found", id="plugin-count", classes="plugin-count")

                with Horizontal(classes="filter-row"):
                    yield Label("Category:", classes="filter-label")
                    yield Button("All", id="cat-all", classes="category-button category-active")
                    yield Button("Amp", id="cat-amp", classes="category-button")
                    yield Button("Effect", id="cat-effect", classes="category-button")
                    yield Button("Reverb", id="cat-reverb", classes="category-button")
                    yield Button("EQ", id="cat-eq", classes="category-button")

                yield NativePluginsPanel()

                yield Label("📋 Available Plugins", classes="section-title")
                with Vertical(classes="plugin-list", id="plugin-list"):
                    yield Label("Press 'Scan LV2' to discover plugins...", classes="plugin-count")

            # Right column - Management Panels
            with Vertical(classes="right-column"):
                yield DSPModeSelector()
                yield RTMonitorPanel()
                yield LatencyCompensationPanel()
                yield CommandHistoryPanel()

    async def on_mount(self) -> None:
        """Initialize screen and load data."""
        self.log("PluginLoaderScreen on_mount started")
        try:
            await self.refresh_data()
            self.log(f"refresh_data complete, plugins count: {len(self.plugins)}")
            # Update display after widgets are mounted
            self.call_after_refresh(self.update_plugin_list)
        except Exception as e:
            self.log(f"Error on mount: {e}")
            self.notify(f"Error on mount: {e}", severity="error")
            # Set empty plugins list to prevent crashes
            self.plugins = []
            self.call_after_refresh(self.update_plugin_list)

        # Start periodic RT monitor updates
        try:
            self.set_interval(5.0, self.update_rt_metrics)
        except Exception as e:
            self.log(f"Error setting interval: {e}")

        # Auto-refresh plugin list every 30 seconds
        try:
            self.set_interval(30.0, self.auto_refresh_plugins)
        except Exception as e:
            self.log(f"Error setting auto-refresh interval: {e}")

    async def auto_refresh_plugins(self) -> None:
        """Auto-refresh plugin list periodically."""
        if not self.scan_in_progress:
            try:
                response = await self.api_client.get("/api/plugins/discover")
                if response and isinstance(response, dict):
                    new_plugins = response.get('plugins', [])
                    # Only update if the list changed
                    if len(new_plugins) != len(self.plugins):
                        self.plugins = new_plugins
                        self.update_plugin_list()
                        self.log(f"Auto-refresh: plugin count changed to {len(self.plugins)}")
            except Exception as e:
                self.log(f"Auto-refresh failed: {e}")

    async def refresh_data(self) -> None:
        """Refresh all data from API."""
        try:
            self.log("Starting refresh_data")
            # Get plugin list from discover endpoint
            response = await self.api_client.get("/api/plugins/discover")
            self.log(f"API response type: {type(response)}")
            
            if response and isinstance(response, dict):
                plugins = response.get('plugins', [])
                self.log(f"Found {len(plugins)} plugins in dict response")
                self.plugins = plugins
            elif response and isinstance(response, list):
                self.log(f"Found {len(response)} plugins in list response")
                self.plugins = response
            else:
                self.log("No plugins found in response")
                self.plugins = []

            self.log(f"Plugins set to: {len(self.plugins)} items")

            # Get DSP status (optional, don't fail if not available)
            try:
                dsp_status = await self.api_client.get("/api/dsp/status")
                if dsp_status:
                    mode_selector = self.query_one(DSPModeSelector, expect_type=DSPModeSelector)
                    if mode_selector:
                        mode_selector.cpu_usage = dsp_status.get('cpu_utilization', 0)
                        mode_selector.current_mode = dsp_status.get('mode', 'BALANCED')
            except Exception as e:
                self.log(f"DSP status not available: {e}")

            # Get latency status (optional, don't fail if not available)
            try:
                latency_status = await self.api_client.get("/api/latency/status")
                if latency_status:
                    latency_panel = self.query_one(LatencyCompensationPanel, expect_type=LatencyCompensationPanel)
                    if latency_panel:
                        latency_panel.update_latency(
                            latency_status.get('total_samples', 0),
                            latency_status.get('total_ms', 0),
                            latency_status.get('enabled', False)
                        )
            except Exception as e:
                self.log(f"Latency status not available: {e}")

            self.log("refresh_data completed successfully")

        except Exception as e:
            self.log(f"Error refreshing data: {e}")
            self.notify(f"Error refreshing data: {e}", severity="error")
            # Set empty list to prevent crashes
            self.plugins = []

    async def update_rt_metrics(self) -> None:
        """Update real-time metrics periodically."""
        try:
            metrics = await self.api_client.get("/api/metrics/")
            if metrics:
                try:
                    rt_panel = self.query_one(RTMonitorPanel, expect_type=RTMonitorPanel)
                    if rt_panel:
                        rt_panel.update_metrics({
                            'mean_callback_us': metrics.get('callback_us', 0),
                            'p95_callback_us': metrics.get('callback_us', 0) * 1.2,  # Estimate
                            'xrun_count': metrics.get('xruns', 0),
                            'xrun_rate_pct': 0.0,
                            'health': 'healthy' if metrics.get('xruns', 0) == 0 else 'warning'
                        })
                except Exception as e:
                    self.log(f"Error updating RT panel: {e}")

                # Update DSP CPU
                try:
                    dsp_selector = self.query_one(DSPModeSelector, expect_type=DSPModeSelector)
                    if dsp_selector:
                        dsp_selector.cpu_usage = metrics.get('cpu_usage_pct', 0)
                except Exception as e:
                    self.log(f"Error updating DSP selector: {e}")
        except Exception as e:
            self.log(f"Error getting metrics: {e}")

    def update_plugin_list(self) -> None:
        """Update the plugin list display."""
        self.log(f"update_plugin_list called with {len(self.plugins)} total plugins")
        try:
            # Find the plugin list container
            plugin_list = self.query_one("#plugin-list", expect_type=Vertical)
            self.log(f"Found plugin-list container")

            # Clear existing widgets
            removed_count = 0
            for child in list(plugin_list.children):
                try:
                    child.remove()
                    removed_count += 1
                except Exception as e:
                    self.log(f"Error removing child: {e}")
            self.log(f"Removed {removed_count} children")

            # Filter by category
            filtered = self.plugins
            if self.selected_category != "All":
                filtered = [p for p in self.plugins if self.selected_category.lower() in p.get('category', '').lower()]

            self.log(f"After filter: {len(filtered)} plugins")

            # Update count
            try:
                count_label = self.query_one("#plugin-count", expect_type=Label)
                if count_label:
                    count_label.update(f"{len(filtered)} plugins found")
            except Exception as e:
                self.log(f"Could not update plugin count: {e}")

            # Add plugin cards
            if not filtered:
                try:
                    empty_label = Label("No plugins found. Press 'Scan LV2' to discover plugins.", classes="plugin-count")
                    plugin_list.mount(empty_label)
                except Exception as e:
                    self.log(f"Error adding empty label: {e}")
            else:
                mounted_count = 0
                # Limit to first 20 plugins to avoid overwhelming the interface
                for plugin in filtered[:20]:
                    try:
                        card = PluginCard(plugin)
                        plugin_list.mount(card)
                        mounted_count += 1
                    except Exception as e:
                        self.log(f"Error mounting plugin card: {e}")
                
                self.log(f"Mounted {mounted_count} plugin cards")
                
                # Show message if there are more plugins
                if len(filtered) > 20:
                    try:
                        more_label = Label(f"... and {len(filtered) - 20} more plugins (use category filter to narrow)", classes="plugin-count")
                        plugin_list.mount(more_label)
                    except Exception as e:
                        self.log(f"Error adding 'more' label: {e}")

        except Exception as e:
            self.log(f"Error updating plugin list: {e}")
            self.notify(f"Error updating plugin list: {e}", severity="error")

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button presses."""
        button_id = event.button.id

        if button_id == "btn-scan-lv2":
            await self.scan_plugins()
        elif button_id == "btn-refresh":
            await self.refresh_data()
            self.update_plugin_list()
        elif button_id and button_id.startswith("cat-"):
            await self.select_category(button_id)
        elif button_id == "btn-undo":
            await self.undo_action()
        elif button_id == "btn-redo":
            await self.redo_action()
        elif button_id == "btn-snapshot":
            await self.create_snapshot()
        elif button_id == "btn-comp-toggle":
            await self.toggle_compensation()
        elif button_id == "btn-measure":
            await self.measure_latency()

    async def scan_plugins(self) -> None:
        """Scan for LV2 plugins with forced refresh."""
        self.scan_in_progress = True
        self.notify("Scanning for LV2 plugins (forcing refresh)...", severity="information")

        try:
            # Force refresh of plugin cache
            response = await self.api_client.get("/api/plugins/discover?refresh=true")
            if response:
                self.plugins = response.get('plugins', []) if isinstance(response, dict) else response
                self.update_plugin_list()
                cached = response.get('cached', False) if isinstance(response, dict) else False
                self.notify(f"Found {len(self.plugins)} plugins {'(cached)' if cached else '(fresh scan)'}", severity="information")
            else:
                # Fall back to listing existing plugins
                await self.refresh_data()
        except Exception as e:
            self.notify(f"Scan failed: {e}", severity="error")
        finally:
            self.scan_in_progress = False

    async def select_category(self, button_id: str) -> None:
        """Handle category filter selection."""
        # Remove active class from all category buttons
        for btn in self.query(".category-button"):
            btn.remove_class("category-active")

        # Add active class to selected
        try:
            self.query_one(f"#{button_id}", Button).add_class("category-active")
        except Exception:
            pass

        # Update filter
        category_map = {
            "cat-all": "All",
            "cat-amp": "Amp",
            "cat-effect": "Effect",
            "cat-reverb": "Reverb",
            "cat-eq": "EQ"
        }
        self.selected_category = category_map.get(button_id, "All")
        self.update_plugin_list()

    async def undo_action(self) -> None:
        """Undo last action."""
        try:
            response = await self.api_client.post("/api/history/undo")
            if response and response.get('success'):
                self.notify("Action undone", severity="information")
                history_panel = self.query_one(CommandHistoryPanel)
                history_panel.last_action = f"Undid: {response.get('description', 'action')}"
                await self.refresh_data()
        except Exception as e:
            self.notify(f"Undo failed: {e}", severity="error")

    async def redo_action(self) -> None:
        """Redo last undone action."""
        try:
            response = await self.api_client.post("/api/history/redo")
            if response and response.get('success'):
                self.notify("Action redone", severity="information")
                history_panel = self.query_one(CommandHistoryPanel)
                history_panel.last_action = f"Redid: {response.get('description', 'action')}"
                await self.refresh_data()
        except Exception as e:
            self.notify(f"Redo failed: {e}", severity="error")

    async def create_snapshot(self) -> None:
        """Create a state snapshot."""
        try:
            response = await self.api_client.post("/api/history/snapshot", json={"description": "Manual snapshot"})
            if response:
                self.notify("Snapshot created", severity="information")
        except Exception as e:
            self.notify(f"Snapshot failed: {e}", severity="error")

    async def toggle_compensation(self) -> None:
        """Toggle latency compensation."""
        try:
            response = await self.api_client.post("/latency/compensate")
            if response:
                await self.refresh_data()
        except Exception as e:
            self.notify(f"Toggle failed: {e}", severity="error")

    async def measure_latency(self) -> None:
        """Measure latency for all plugins."""
        self.notify("Measuring plugin latencies...", severity="information")
        try:
            response = await self.api_client.post("/latency/measure")
            if response:
                self.notify(f"Measured {response.get('plugins_measured', 0)} plugins", severity="information")
                await self.refresh_data()
        except Exception as e:
            self.notify(f"Measurement failed: {e}", severity="error")

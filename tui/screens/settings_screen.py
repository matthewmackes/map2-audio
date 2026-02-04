"""
Settings Screen - Application Settings & Configuration
Consolidates: Audio, Display, Network, Advanced Settings

Wired to real API endpoints:
- Audio: /api/audio/*, /api/pipedal/*
- Network: /api/network/*, /api/www/*
- System: /api/system/*
"""

import logging
import asyncio
from textual.app import ComposeResult
from textual.widgets import Static, Label, DataTable, Input
from textual.containers import Vertical, Horizontal, ScrollableContainer
from ..config import config as tui_config
from textual.binding import Binding
from rich.text import Text

# Import newer widgets with fallbacks for older Textual versions
try:
    from textual.widgets import Collapsible
    COLLAPSIBLE_AVAILABLE = True
except ImportError:
    COLLAPSIBLE_AVAILABLE = False
    Collapsible = None

try:
    from textual.widgets import Rule
    RULE_AVAILABLE = True
except ImportError:
    RULE_AVAILABLE = False
    Rule = None

try:
    from textual.widgets import LoadingIndicator
    LOADING_AVAILABLE = True
except ImportError:
    LOADING_AVAILABLE = False
    LoadingIndicator = None

logger = logging.getLogger(__name__)


class AudioSettingsWidget(Static):
    """Audio device and settings - wired to /api/audio/*, /api/pipedal/* endpoints."""

    DEFAULT_CSS = """
    #audio-settings {
        width: 100%;
        height: auto;
        padding: 0 1;
    }

    #audio-settings-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #audio-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    .audio-loading {
        height: 3;
        align: center middle;
    }

    .audio-status-bar {
        height: 1;
        background: $surface;
        padding: 0 1;
    }
    """

    def __init__(self, api_client=None, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client
        self.id = "audio-settings"
        # Data state
        self._audio_status = {}
        self._pipedal_status = {}
        self._audio_latency = {}
        self._dsp_status = {}
        self._usb_devices = {}
        self._loading = True

    def compose(self) -> ComposeResult:
        """Compose audio settings with tables."""
        yield Label("", id="audio-status-bar", classes="audio-status-bar")
        if LOADING_AVAILABLE and LoadingIndicator:
            yield LoadingIndicator(id="audio-loading", classes="audio-loading")
        yield DataTable(id="audio-settings-table")
        if RULE_AVAILABLE and Rule:
            yield Rule(line_style="heavy")
        yield Label("⌨️ Keyboard Shortcuts", id="audio-actions-label")
        yield DataTable(id="audio-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Settings table with zebra striping
        table = self.query_one("#audio-settings-table", DataTable)
        if not table.columns:
            table.add_columns("Setting", "Value", "Status")
            table.zebra_stripes = True
            table.cursor_type = "row"
            table.add_row("Audio Engine", "Loading...", "...")
            table.add_row("Sample Rate", "...", "...")
            table.add_row("Buffer Size", "...", "...")

        # Actions table with zebra striping
        actions = self.query_one("#audio-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.zebra_stripes = True
            actions.cursor_type = "row"
            actions.add_row("S", "Start", "Start audio engine")
            actions.add_row("X", "Stop", "Stop audio engine")
            actions.add_row("t", "Test", "Run audio latency test")
            actions.add_row("r", "Restart", "Restart audio services")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(5.0, self._refresh_data)
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real audio settings from API."""
        if not self.api_client:
            return

        try:
            # Fetch audio status - /api/audio/status
            audio_result = await self.api_client.get_audio_status()
            if audio_result.success and audio_result.data:
                self._audio_status = audio_result.data

            # Fetch PiPedal status - /api/pipedal/status
            pipedal_result = await self.api_client.get_pipedal_status()
            if pipedal_result.success and pipedal_result.data:
                self._pipedal_status = pipedal_result.data

            # Fetch latency - /api/audio/latency
            latency_result = await self.api_client.get_audio_latency()
            if latency_result.success and latency_result.data:
                self._audio_latency = latency_result.data

            # Fetch DSP status - /api/dsp/status
            dsp_result = await self.api_client.get_dsp_status()
            if dsp_result.success and dsp_result.data:
                self._dsp_status = dsp_result.data

            # Fetch USB devices - /api/usb/devices
            usb_result = await self.api_client.get_usb_devices()
            if usb_result.success and usb_result.data:
                self._usb_devices = usb_result.data

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching audio settings: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            # Hide loading indicator
            if self._loading:
                self._loading = False
                if LOADING_AVAILABLE and LoadingIndicator:
                    try:
                        loading = self.query_one("#audio-loading", LoadingIndicator)
                        loading.display = False
                    except Exception:
                        pass

            # Update status bar with live metrics
            running = self._audio_status.get("running", False)
            latency = self._audio_latency.get("latency_ms", 0) if isinstance(self._audio_latency, dict) else 0
            cpu_load = self._pipedal_status.get("cpu_load", 0)
            xruns = self._pipedal_status.get("xruns", 0)

            status_parts = []
            status_parts.append("🟢 Running" if running else "🔴 Stopped")
            status_parts.append(f"Latency: {latency:.1f}ms")
            status_parts.append(f"CPU: {cpu_load:.0f}%")
            status_parts.append(f"Xruns: {xruns}")

            status_bar = self.query_one("#audio-status-bar", Label)
            status_bar.update(" │ ".join(status_parts))

            # Update settings table
            table = self.query_one("#audio-settings-table", DataTable)
            table.clear()

            # Audio engine
            engine = self._audio_status.get("engine", "JACK Audio")
            running = self._audio_status.get("running", False)
            engine_status = "🟢 Running" if running else "🔴 Stopped"
            table.add_row("Audio Engine", engine, engine_status)

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

            # CPU load from PiPedal
            cpu_load = self._pipedal_status.get("cpu_load", 0)
            if isinstance(cpu_load, (int, float)):
                cpu_load = round(cpu_load, 1)
            cpu_status = "🟢 OK" if cpu_load < 50 else "🟡 Moderate" if cpu_load < 80 else "🔴 High"
            table.add_row("CPU Load", f"{cpu_load}%", cpu_status)

            # Xruns
            xruns = self._pipedal_status.get("xruns", 0)
            xrun_status = "🟢 None" if xruns == 0 else "🟡 Some" if xruns < 10 else "🔴 Many"
            table.add_row("Xruns", str(xruns), xrun_status)

            # DSP quality mode
            quality_mode = self._dsp_status.get("quality_mode", "balanced")
            target_cpu = self._dsp_status.get("target_cpu_percent", 70)
            table.add_row("DSP Mode", quality_mode.title(), f"Target: {target_cpu}%")

            # USB audio device
            devices = self._usb_devices.get("devices", []) if isinstance(self._usb_devices, dict) else []
            audio_device = None
            for dev in devices if isinstance(devices, list) else []:
                if dev.get("is_audio", False) or "audio" in dev.get("name", "").lower():
                    audio_device = dev.get("name", "Audio Device")
                    break
            if audio_device:
                table.add_row("USB Device", audio_device[:25], "🟢 Connected")
            else:
                table.add_row("USB Device", "None detected", "⚪ N/A")

        except Exception as e:
            logger.debug(f"Error updating audio settings display: {e}")


class DisplaySettingsWidget(Static):
    """Display and theme settings - wired to TUI theme engine and layout system."""

    DEFAULT_CSS = """
    #display-settings {
        width: 100%;
        height: auto;
        padding: 0 1;
    }

    #display-settings-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #display-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    .theme-preview {
        height: 1;
        background: $surface;
        padding: 0 1;
    }

    .refresh-row {
        height: 3;
        align: left middle;
    }

    .refresh-row Label {
        width: auto;
        padding-right: 1;
    }

    .refresh-row Input {
        width: 10;
    }
    """

    # Available themes from Textual
    AVAILABLE_THEMES = [
        "textual-dark", "textual-light", "monokai", "dracula",
        "nord", "gruvbox", "solarized-light", "solarized-dark",
        "tokyo-night", "catppuccin-mocha"
    ]

    LAYOUT_MODES = ["Compact", "Normal", "Wide", "Fullscreen", "Sidebar-L", "Sidebar-R"]

    def __init__(self, api_client=None, **kwargs):
        super().__init__()
        self.api_client = api_client
        self.id = "display-settings"
        self._current_theme = "textual-dark"
        self._current_layout = "Normal"

    def compose(self) -> ComposeResult:
        """Compose display settings with tables."""
        yield Label("", id="theme-preview", classes="theme-preview")
        yield DataTable(id="display-settings-table")
        if RULE_AVAILABLE and Rule:
            yield Rule(line_style="heavy")
        # Inline setting: auto-refresh interval
        with Horizontal(classes="refresh-row"):
            yield Label("⏱️ Auto-refresh interval:")
            yield Input(placeholder=str(tui_config.get("ui.refresh_interval", 10)), id="refresh-interval-input")
            yield Label("seconds")
        if RULE_AVAILABLE and Rule:
            yield Rule()
        yield Label("⌨️ Keyboard Shortcuts", id="display-actions-label")
        yield DataTable(id="display-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Settings table with zebra striping
        table = self.query_one("#display-settings-table", DataTable)
        if not table.columns:
            table.add_columns("Setting", "Value", "Options")
            table.zebra_stripes = True
            table.cursor_type = "row"

        # Actions table with zebra striping
        actions = self.query_one("#display-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.zebra_stripes = True
            actions.cursor_type = "row"
            actions.add_row("Ctrl+T", "Cycle Theme", "Cycle through available themes")
            actions.add_row("Alt+1-6", "Layout", "Switch layout mode")
            actions.add_row("R", "Reset", "Reset to default settings")

    def on_mount(self) -> None:
        """Initialize display on mount."""
        self._init_tables()
        self._get_current_settings()
        self._update_display()

    def _get_current_settings(self) -> None:
        """Get current theme and layout from app."""
        try:
            if hasattr(self.app, 'theme'):
                self._current_theme = self.app.theme or "textual-dark"
        except Exception:
            pass

    def _update_display(self) -> None:
        """Update the widget display."""
        try:
            # Update theme preview bar
            theme_index = self.AVAILABLE_THEMES.index(self._current_theme) + 1 if self._current_theme in self.AVAILABLE_THEMES else 1
            preview = self.query_one("#theme-preview", Label)
            preview.update(f"🎨 Theme: {self._current_theme} ({theme_index}/{len(self.AVAILABLE_THEMES)}) │ Layout: {self._current_layout}")

            # Update settings table
            table = self.query_one("#display-settings-table", DataTable)
            table.clear()

            # Current theme
            table.add_row("Theme", self._current_theme, f"{theme_index}/{len(self.AVAILABLE_THEMES)} available")

            # Layout mode
            table.add_row("Layout Mode", self._current_layout, "Alt+1-6 to change")

            # Keybindings info
            table.add_row("Theme Hotkey", "Ctrl+T", "Cycle themes")
            table.add_row("Refresh", "R", "Refresh current screen")
            table.add_row("Hot Reload", "Ctrl+R", "Reload modules & CSS")

            # Update inline input with current config value
            try:
                interval = int(tui_config.get("ui.refresh_interval", 10))
            except Exception:
                interval = 10
            try:
                inp = self.query_one("#refresh-interval-input", Input)
                inp.value = str(interval)
            except Exception:
                pass

        except Exception as e:
            logger.debug(f"Error updating display settings: {e}")

    def on_input_changed(self, event: Input.Changed) -> None:
        """Handle changes to inline inputs such as refresh interval."""
        try:
            if event.input.id == "refresh-interval-input":
                val = event.value.strip()
                if not val:
                    return
                try:
                    ival = int(val)
                    if ival < 1:
                        self.app.notify("Refresh interval must be >= 1 second", severity="error", timeout=3)
                        return
                    tui_config.set("ui.refresh_interval", ival)
                    self.app.notify(f"Refresh interval set to {ival}s", severity="information", timeout=2)
                except ValueError:
                    self.app.notify("Please enter a valid integer", severity="error", timeout=3)
        except Exception as e:
            logger.debug(f"Input change handler error: {e}")


class NetworkSettingsWidget(Static):
    """Network settings - wired to /api/network/*, /api/www/* endpoints."""

    DEFAULT_CSS = """
    #network-settings {
        width: 100%;
        height: auto;
        padding: 0 1;
    }

    #network-settings-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #network-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    .network-status-bar {
        height: 1;
        background: $surface;
        padding: 0 1;
    }

    .network-loading {
        height: 3;
        align: center middle;
    }
    """

    def __init__(self, api_client=None, **kwargs):
        super().__init__()
        self.api_client = api_client
        self.id = "network-settings"
        # Data state
        self._network_status = {}
        self._www_status = {}
        self._www_config = {}
        self._hostname = {}
        self._loading = True

    def compose(self) -> ComposeResult:
        """Compose network settings with tables."""
        yield Label("", id="network-status-bar", classes="network-status-bar")
        if LOADING_AVAILABLE and LoadingIndicator:
            yield LoadingIndicator(id="network-loading", classes="network-loading")
        yield DataTable(id="network-settings-table")
        if RULE_AVAILABLE and Rule:
            yield Rule(line_style="heavy")
        yield Label("⌨️ Keyboard Shortcuts", id="network-actions-label")
        yield DataTable(id="network-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Settings table with zebra striping
        table = self.query_one("#network-settings-table", DataTable)
        if not table.columns:
            table.add_columns("Service", "Address", "Status")
            table.zebra_stripes = True
            table.cursor_type = "row"
            table.add_row("Network", "Loading...", "...")

        # Actions table with zebra striping
        actions = self.query_one("#network-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.zebra_stripes = True
            actions.cursor_type = "row"
            actions.add_row("p", "Ping", "Test network connectivity")
            actions.add_row("w", "WiFi Scan", "Scan for WiFi networks")
            actions.add_row("R", "Restart Web", "Restart web server")
            actions.add_row("h", "Hostname", "View/change hostname")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(10.0, self._refresh_data)
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real network settings from API."""
        if not self.api_client:
            return

        try:
            # Fetch network status - /api/network/status
            network_result = await self.api_client.get_network_status()
            if network_result.success and network_result.data:
                self._network_status = network_result.data

            # Fetch www status - /api/www/status
            www_result = await self.api_client.get_www_status()
            if www_result.success and www_result.data:
                self._www_status = www_result.data

            # Fetch www config - /api/www/config
            config_result = await self.api_client.get_www_config()
            if config_result.success and config_result.data:
                self._www_config = config_result.data

            # Fetch hostname - /api/network/hostname
            hostname_result = await self.api_client.get_hostname()
            if hostname_result.success and hostname_result.data:
                self._hostname = hostname_result.data

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching network settings: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            # Hide loading indicator
            if self._loading:
                self._loading = False
                if LOADING_AVAILABLE and LoadingIndicator:
                    try:
                        loading = self.query_one("#network-loading", LoadingIndicator)
                        loading.display = False
                    except Exception:
                        pass

            # Update status bar
            connected = self._network_status.get("internet_connected", False) or self._network_status.get("connected", False)
            ip = self._network_status.get("ip_address", "N/A")
            hostname = self._hostname.get("hostname", "map2-audio") if isinstance(self._hostname, dict) else "map2-audio"
            ws_count = self._www_status.get("websocket_connections", 0) if isinstance(self._www_status, dict) else 0

            status_parts = []
            status_parts.append("🟢 Connected" if connected else "🔴 Disconnected")
            status_parts.append(f"IP: {ip}")
            status_parts.append(f"Host: {hostname}")
            status_parts.append(f"WS: {ws_count}")

            status_bar = self.query_one("#network-status-bar", Label)
            status_bar.update(" │ ".join(status_parts))

            # Update settings table
            table = self.query_one("#network-settings-table", DataTable)
            table.clear()

            # Hostname
            hostname = self._hostname.get("hostname", "map2-audio") if isinstance(self._hostname, dict) else "map2-audio"
            table.add_row("Hostname", hostname, "🟢 Set")

            # IP Address
            ip = self._network_status.get("ip_address", "N/A")
            local = self._network_status.get("local_connected", False)
            internet = self._network_status.get("internet_connected", False)
            if internet:
                ip_status = "🟢 Internet"
            elif local:
                ip_status = "🟡 Local only"
            else:
                ip_status = "🔴 No network"
            table.add_row("IP Address", str(ip), ip_status)

            # Web server
            www_running = self._www_status.get("running", False) if isinstance(self._www_status, dict) else False
            www_port = self._www_config.get("port", 5000) if isinstance(self._www_config, dict) else 5000
            www_status = "🟢 Running" if www_running else "🔴 Stopped"
            table.add_row("Web Server", f"Port {www_port}", www_status)

            # API server (we know it's running if we got here)
            table.add_row("API Server", "Port 8080", "🟢 Running")

            # SSL status
            ssl_enabled = self._www_config.get("ssl_enabled", False) if isinstance(self._www_config, dict) else False
            ssl_status = "🟢 Enabled" if ssl_enabled else "⚪ Disabled"
            table.add_row("SSL/HTTPS", "TLS 1.3" if ssl_enabled else "Off", ssl_status)

            # WebSocket connections
            ws_stats = self._www_status.get("websocket_connections", 0) if isinstance(self._www_status, dict) else 0
            table.add_row("WebSocket", f"{ws_stats} connections", "🟢 Active")

        except Exception as e:
            logger.debug(f"Error updating network settings display: {e}")


class AdvancedSettingsWidget(Static):
    """Advanced system settings - wired to /api/system/*, /api/dsp/* endpoints."""

    DEFAULT_CSS = """
    #advanced-settings {
        width: 100%;
        height: auto;
        padding: 0 1;
    }

    #advanced-settings-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #advanced-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    .advanced-status-bar {
        height: 1;
        background: $surface;
        padding: 0 1;
    }

    .advanced-loading {
        height: 3;
        align: center middle;
    }
    """

    def __init__(self, api_client=None, **kwargs):
        super().__init__()
        self.api_client = api_client
        self.id = "advanced-settings"
        # Data state
        self._dsp_status = {}
        self._realtime_status = {}
        self._health = {}
        self._metrics = {}
        self._loading = True

    def compose(self) -> ComposeResult:
        """Compose advanced settings with tables."""
        yield Label("", id="advanced-status-bar", classes="advanced-status-bar")
        if LOADING_AVAILABLE and LoadingIndicator:
            yield LoadingIndicator(id="advanced-loading", classes="advanced-loading")
        yield DataTable(id="advanced-settings-table")
        if RULE_AVAILABLE and Rule:
            yield Rule(line_style="heavy")
        yield Label("⌨️ Keyboard Shortcuts", id="advanced-actions-label")
        yield DataTable(id="advanced-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Settings table with zebra striping
        table = self.query_one("#advanced-settings-table", DataTable)
        if not table.columns:
            table.add_columns("Setting", "Value", "Status")
            table.zebra_stripes = True
            table.cursor_type = "row"
            table.add_row("DSP Mode", "Loading...", "...")

        # Actions table with zebra striping
        actions = self.query_one("#advanced-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.zebra_stripes = True
            actions.cursor_type = "row"
            actions.add_row("D", "DSP Mode", "Cycle DSP quality mode")
            actions.add_row("c", "Clear Cache", "Clear application cache")
            actions.add_row("R", "Restart Services", "Restart all services")
            actions.add_row("L", "Logs", "View system logs")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(10.0, self._refresh_data)
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real advanced settings from API."""
        if not self.api_client:
            return

        try:
            # Fetch DSP status - /api/dsp/status
            dsp_result = await self.api_client.get_dsp_status()
            if dsp_result.success and dsp_result.data:
                self._dsp_status = dsp_result.data

            # Fetch realtime status - /api/www/realtime/status
            rt_result = await self.api_client.get_realtime_status()
            if rt_result.success and rt_result.data:
                self._realtime_status = rt_result.data

            # Fetch health - /api/health
            health_result = await self.api_client.get_health()
            if health_result.success and health_result.data:
                self._health = health_result.data

            # Fetch metrics - /api/metrics/current
            metrics_result = await self.api_client.get_current_metrics()
            if metrics_result.success and metrics_result.data:
                self._metrics = metrics_result.data

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching advanced settings: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            # Hide loading indicator
            if self._loading:
                self._loading = False
                if LOADING_AVAILABLE and LoadingIndicator:
                    try:
                        loading = self.query_one("#advanced-loading", LoadingIndicator)
                        loading.display = False
                    except Exception:
                        pass

            # Update status bar with system metrics
            cpu = self._metrics.get("cpu_percent", 0)
            mem = self._metrics.get("memory_percent", 0)
            dsp_mode = self._dsp_status.get("quality_mode", "balanced")
            health_ok = self._health.get("status") == "ok" or self._health.get("healthy", False)

            status_parts = []
            status_parts.append("🟢 Healthy" if health_ok else "🔴 Issues")
            status_parts.append(f"CPU: {cpu:.0f}%")
            status_parts.append(f"MEM: {mem:.0f}%")
            status_parts.append(f"DSP: {dsp_mode.title()}")

            status_bar = self.query_one("#advanced-status-bar", Label)
            status_bar.update(" │ ".join(status_parts))

            # Update settings table
            table = self.query_one("#advanced-settings-table", DataTable)
            table.clear()

            # DSP Mode
            quality_mode = self._dsp_status.get("quality_mode", "balanced")
            target_cpu = self._dsp_status.get("target_cpu_percent", 70)
            table.add_row("DSP Quality", quality_mode.title(), f"Target: {target_cpu}%")

            # DSP Metrics - API returns utilization_percent
            current_load = self._dsp_status.get("utilization_percent", self._dsp_status.get("current_load_percent", 0))
            if isinstance(current_load, (int, float)):
                current_load = round(current_load, 1)
            load_status = "🟢 OK" if current_load < 50 else "🟡 Moderate" if current_load < 80 else "🔴 High"
            table.add_row("DSP Load", f"{current_load}%", load_status)

            # Realtime status
            latency = self._realtime_status.get("latency_ms", 0) if isinstance(self._realtime_status, dict) else 0
            clients = self._realtime_status.get("clients", 0) if isinstance(self._realtime_status, dict) else 0
            rt_status = "🟢 Active" if clients > 0 else "⚪ Idle"
            table.add_row("Realtime", f"{clients} clients", rt_status)

            # System uptime
            uptime = self._metrics.get("uptime", "N/A")
            table.add_row("Uptime", str(uptime), "🟢 Running")

            # CPU usage
            cpu_percent = self._metrics.get("cpu_percent", 0)
            if isinstance(cpu_percent, (int, float)):
                cpu_percent = round(cpu_percent, 1)
            cpu_status = "🟢 OK" if cpu_percent < 50 else "🟡 Moderate" if cpu_percent < 80 else "🔴 High"
            table.add_row("System CPU", f"{cpu_percent}%", cpu_status)

            # Memory usage
            memory_percent = self._metrics.get("memory_percent", 0)
            if isinstance(memory_percent, (int, float)):
                memory_percent = round(memory_percent, 1)
            mem_status = "🟢 OK" if memory_percent < 70 else "🟡 Moderate" if memory_percent < 85 else "🔴 High"
            table.add_row("Memory", f"{memory_percent}%", mem_status)

            # Health status
            health_ok = self._health.get("status") == "ok" or self._health.get("healthy", False)
            health_status = "🟢 Healthy" if health_ok else "🔴 Issues"
            table.add_row("System Health", "All checks", health_status)

        except Exception as e:
            logger.debug(f"Error updating advanced settings display: {e}")


class SettingsScreen(Static):
    """
    Settings Screen - Application settings.

    Shows:
    - Audio device configuration from /api/audio/*, /api/pipedal/*
    - Display and theme settings
    - Network settings from /api/network/*, /api/www/*
    - Advanced system settings from /api/dsp/*, /api/health
    """

    DEFAULT_CSS = """
    SettingsScreen {
        width: 100%;
        height: 100%;
        background: $surface;
        layout: vertical;
        overflow: auto;
    }

    #settings-container {
        width: 100%;
        height: auto;
        padding: 1 2;
    }

    .settings-header {
        width: 100%;
        height: 3;
        background: $primary;
        color: $text;
        content-align: center middle;
        text-style: bold;
        margin-bottom: 1;
    }

    Collapsible {
        margin-bottom: 1;
        border: round $primary-darken-2;
    }

    Collapsible.-collapsed {
        border: round $surface-lighten-2;
    }

    #audio-collapsible {
        border: round $success;
    }

    #display-collapsible {
        border: round $warning;
    }

    #network-collapsible {
        border: round $accent;
    }

    #advanced-collapsible {
        border: round $primary;
    }

    CollapsibleTitle {
        padding: 1;
        text-style: bold;
    }
    """

    BINDINGS = [
        Binding("t", "cycle_theme", "Theme", show=True),
        Binding("T", "test_audio", "Test", show=True),
        Binding("r", "refresh_data", "Refresh", show=True),
        Binding("p", "ping_network", "Ping", show=True),
        Binding("1", "expand_audio", "Audio", show=False),
        Binding("2", "expand_display", "Display", show=False),
        Binding("3", "expand_network", "Network", show=False),
        Binding("4", "expand_advanced", "Advanced", show=False),
        Binding("a", "expand_all", "Expand All", show=True),
        Binding("c", "collapse_all", "Collapse All", show=True),
    ]

    def __init__(self, api_client=None, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client

    def compose(self) -> ComposeResult:
        """Compose settings widgets with collapsible sections."""
        with ScrollableContainer(id="settings-container"):
            yield Label("⚙️ SETTINGS", classes="settings-header")

            if COLLAPSIBLE_AVAILABLE and Collapsible:
                with Collapsible(title="🔊 Audio Settings", collapsed=False, id="audio-collapsible"):
                    yield AudioSettingsWidget(self.api_client)

                with Collapsible(title="🎨 Display Settings", collapsed=True, id="display-collapsible"):
                    yield DisplaySettingsWidget(self.api_client)

                with Collapsible(title="🌐 Network Settings", collapsed=True, id="network-collapsible"):
                    yield NetworkSettingsWidget(self.api_client)

                with Collapsible(title="⚙️ Advanced Settings", collapsed=True, id="advanced-collapsible"):
                    yield AdvancedSettingsWidget(self.api_client)
            else:
                # Fallback for older Textual versions without Collapsible
                yield Label("🔊 Audio Settings", classes="section-title")
                yield AudioSettingsWidget(self.api_client)
                yield Label("🎨 Display Settings", classes="section-title")
                yield DisplaySettingsWidget(self.api_client)
                yield Label("🌐 Network Settings", classes="section-title")
                yield NetworkSettingsWidget(self.api_client)
                yield Label("⚙️ Advanced Settings", classes="section-title")
                yield AdvancedSettingsWidget(self.api_client)

    def action_expand_audio(self) -> None:
        """Expand audio settings section."""
        self._toggle_section("audio-collapsible")

    def action_expand_display(self) -> None:
        """Expand display settings section."""
        self._toggle_section("display-collapsible")

    def action_expand_network(self) -> None:
        """Expand network settings section."""
        self._toggle_section("network-collapsible")

    def action_expand_advanced(self) -> None:
        """Expand advanced settings section."""
        self._toggle_section("advanced-collapsible")

    def _toggle_section(self, section_id: str) -> None:
        """Toggle a collapsible section."""
        if not COLLAPSIBLE_AVAILABLE or not Collapsible:
            return
        try:
            section = self.query_one(f"#{section_id}", Collapsible)
            section.collapsed = not section.collapsed
        except Exception as e:
            logger.debug(f"Error toggling section {section_id}: {e}")

    def action_expand_all(self) -> None:
        """Expand all collapsible sections."""
        for collapsible in self.query("Collapsible"):
            collapsible.collapsed = False

    def action_collapse_all(self) -> None:
        """Collapse all collapsible sections."""
        for collapsible in self.query("Collapsible"):
            collapsible.collapsed = True

    def action_cycle_theme(self) -> None:
        """Cycle through available themes."""
        try:
            if hasattr(self.app, 'action_cycle_theme'):
                self.app.action_cycle_theme()
            else:
                self.app.notify("Press Ctrl+T to cycle themes", severity="information", timeout=2)
        except Exception as e:
            self.app.notify(f"Theme error: {e}", severity="error", timeout=3)

    async def action_test_audio(self) -> None:
        """Run audio latency test."""
        if not self.api_client:
            self.app.notify("API client not available", severity="warning", timeout=2)
            return

        try:
            self.app.notify("Testing audio latency...", severity="information", timeout=2)
            result = await self.api_client.get_audio_latency()
            if result.success and result.data:
                latency = result.data.get("latency_ms", 0)
                if isinstance(latency, (int, float)):
                    latency = round(latency, 2)
                status = "Good" if latency < 10 else "Acceptable" if latency < 20 else "High"
                self.app.notify(f"Audio latency: {latency}ms ({status})", severity="information", timeout=3)
            else:
                self.app.notify(f"Test failed: {result.error}", severity="error", timeout=3)
        except Exception as e:
            self.app.notify(f"Error: {e}", severity="error", timeout=3)

    async def action_ping_network(self) -> None:
        """Test network connectivity."""
        if not self.api_client:
            self.app.notify("API client not available", severity="warning", timeout=2)
            return

        try:
            self.app.notify("Testing network...", severity="information", timeout=2)
            result = await self.api_client.get_network_status()
            if result.success and result.data:
                internet = result.data.get("internet_connected", False)
                local = result.data.get("local_connected", False)
                ip = result.data.get("ip_address", "N/A")

                if internet:
                    self.app.notify(f"Network OK: {ip} (internet connected)", severity="information", timeout=3)
                elif local:
                    self.app.notify(f"Local network only: {ip}", severity="warning", timeout=3)
                else:
                    self.app.notify("No network connection", severity="error", timeout=3)
            else:
                self.app.notify(f"Test failed: {result.error}", severity="error", timeout=3)
        except Exception as e:
            self.app.notify(f"Error: {e}", severity="error", timeout=3)

    async def action_refresh_data(self) -> None:
        """Refresh all settings data."""
        self.app.notify("Refreshing settings...", severity="information", timeout=1)

        try:
            for widget in self.query("AudioSettingsWidget"):
                asyncio.create_task(widget._refresh_data())
            for widget in self.query("NetworkSettingsWidget"):
                asyncio.create_task(widget._refresh_data())
            for widget in self.query("AdvancedSettingsWidget"):
                asyncio.create_task(widget._refresh_data())

            # Also refresh display settings
            for widget in self.query("DisplaySettingsWidget"):
                widget._get_current_settings()
                widget._update_display()

            self.app.notify("Settings refreshed", severity="information", timeout=2)
        except Exception as e:
            self.app.notify(f"Refresh error: {e}", severity="error", timeout=3)

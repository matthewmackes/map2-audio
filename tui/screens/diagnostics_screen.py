"""
Diagnostics Screen - System Health & Troubleshooting
Consolidates: Diagnostics, Health Checks, Logs, Troubleshooting

Mirrors the web's diagnostic features by fetching real data from the same API endpoints.
"""

import logging
import asyncio
from textual.app import ComposeResult
from textual.widgets import Static, Label, DataTable
from textual.containers import Vertical
from textual.binding import Binding

logger = logging.getLogger(__name__)


class HealthCheckWidget(Static):
    """System health checks - mirrors web's health monitoring."""

    DEFAULT_CSS = """
    #health-check {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $success;
        padding: 1 2;
        margin: 1 0;
    }

    #health-status-table {
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

    def __init__(self, api_client=None, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client
        self.id = "health-check"
        # Data state
        self._health = {}
        self._metrics = {}
        self._audio_status = {}
        self._realtime_test = {}

    def compose(self) -> ComposeResult:
        """Compose health checks with tables."""
        yield Label("SYSTEM HEALTH", id="health-title")
        yield DataTable(id="health-status-table")
        yield Label("Actions:", id="health-actions-label")
        yield DataTable(id="health-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Status table
        table = self.query_one("#health-status-table", DataTable)
        if not table.columns:
            table.add_columns("Component", "Status", "Details")
            table.add_row("API Server", "Loading...", "-")
            table.add_row("Audio Interface", "Loading...", "-")
            table.add_row("Storage", "Loading...", "-")
            table.add_row("CPU", "Loading...", "-")
            table.add_row("Memory", "Loading...", "-")

        # Actions table
        actions = self.query_one("#health-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.add_row("h", "Diagnostic", "Run full system diagnostic")
            actions.add_row("e", "Export", "Export diagnostic report")
            actions.add_row("r", "Refresh", "Refresh health status")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(5.0, self._refresh_data)
        # Initial fetch
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real health data from API."""
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

            # Fetch audio status - /api/audio/status
            audio_result = await self.api_client.get_audio_status()
            if audio_result.success and audio_result.data:
                self._audio_status = audio_result.data

            # Fetch audio latency - /api/audio/latency
            latency_result = await self.api_client.get_audio_latency()
            if latency_result.success and latency_result.data:
                self._realtime_test = latency_result.data

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching health data: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            table = self.query_one("#health-status-table", DataTable)

            # Clear and rebuild table rows
            table.clear()

            # API Server status
            api_ok = self._health.get("status") == "ok" or self._health.get("healthy", False)
            uptime = self._metrics.get("uptime", "N/A")
            api_status = "🟢 Running" if api_ok else "🔴 Down"
            table.add_row("API Server", api_status, f"Uptime: {uptime}")

            # Audio Interface status
            audio_running = self._audio_status.get("running", False)
            latency = self._realtime_test.get("latency_ms", 0)
            if isinstance(latency, (int, float)):
                latency = round(latency, 2)
            audio_status = "🟢 Connected" if audio_running else "🔴 Disconnected"
            table.add_row("Audio Interface", audio_status, f"Latency: {latency}ms")

            # Storage status
            disk_percent = self._metrics.get("disk_percent", 0)
            disk_free_gb = self._metrics.get("disk_free_gb", 0)
            if isinstance(disk_percent, (int, float)):
                disk_percent = round(disk_percent, 1)
            if isinstance(disk_free_gb, (int, float)):
                disk_free_gb = round(disk_free_gb, 1)
            disk_status = "🟢 OK" if disk_percent < 80 else "🟡 Warning" if disk_percent < 90 else "🔴 Full"
            table.add_row("Storage", disk_status, f"{disk_percent}% used ({disk_free_gb}GB free)")

            # CPU status
            cpu_percent = self._metrics.get("cpu_percent", 0)
            if isinstance(cpu_percent, (int, float)):
                cpu_percent = round(cpu_percent, 1)
            cpu_status = "🟢 OK" if cpu_percent < 50 else "🟡 Moderate" if cpu_percent < 80 else "🔴 High"
            table.add_row("CPU", cpu_status, f"{cpu_percent}% usage")

            # Memory status
            memory_percent = self._metrics.get("memory_percent", 0)
            if isinstance(memory_percent, (int, float)):
                memory_percent = round(memory_percent, 1)
            mem_status = "🟢 OK" if memory_percent < 50 else "🟡 Moderate" if memory_percent < 80 else "🔴 High"
            table.add_row("Memory", mem_status, f"{memory_percent}% usage")

        except Exception as e:
            logger.debug(f"Error updating health display: {e}")


class LogViewerWidget(Static):
    """Log viewer - shows recent system activity in a table."""

    DEFAULT_CSS = """
    #log-viewer {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $warning;
        padding: 1 2;
        margin: 1 0;
    }

    #logs-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #logs-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None, **kwargs):
        super().__init__()
        self.api_client = api_client
        self.id = "log-viewer"
        # Data state
        self._access_logs = []
        self._health_history = {}

    def compose(self) -> ComposeResult:
        """Compose log viewer with tables."""
        yield Label("RECENT ACTIVITY", id="logs-title")
        yield DataTable(id="logs-table")
        yield Label("Actions:", id="logs-actions-label")
        yield DataTable(id="logs-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Logs table
        table = self.query_one("#logs-table", DataTable)
        if not table.columns:
            table.add_columns("Level", "Method", "Path", "Time")
            table.add_row("...", "...", "Loading...", "...")

        # Actions table
        actions = self.query_one("#logs-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.add_row("l", "Full Log", "Show full log file")
            actions.add_row("c", "Clear", "Clear log entries")
            actions.add_row("f", "Filter", "Filter by log level")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(10.0, self._refresh_data)
        # Initial fetch
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real log data from API."""
        if not self.api_client:
            return

        try:
            # Fetch access logs - /api/www/logs
            logs_result = await self.api_client.get_access_logs(limit=10)
            if logs_result.success and logs_result.data:
                self._access_logs = logs_result.data if isinstance(logs_result.data, list) else logs_result.data.get("logs", [])

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching logs: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            table = self.query_one("#logs-table", DataTable)

            # Clear and rebuild table rows
            table.clear()

            # Display recent logs (up to 6)
            for i, log in enumerate(self._access_logs[:6]):
                timestamp = log.get("timestamp", "")
                method = log.get("method", "")
                path = log.get("path", "")
                status = log.get("status_code", 200)

                # Format timestamp
                if timestamp:
                    try:
                        time_part = timestamp.split("T")[1].split(".")[0] if "T" in timestamp else timestamp
                    except:
                        time_part = timestamp[:8]
                else:
                    time_part = "--:--:--"

                # Determine level based on status
                if status >= 500:
                    level = "🔴 ERROR"
                elif status >= 400:
                    level = "🟡 WARN"
                else:
                    level = "🟢 INFO"

                table.add_row(level, method, path[:30], time_part)

            if not self._access_logs:
                table.add_row("-", "-", "No log entries", "-")

        except Exception as e:
            logger.debug(f"Error updating log display: {e}")


class TroubleshootingWidget(Static):
    """Troubleshooting tools - system maintenance actions in tables."""

    DEFAULT_CSS = """
    #troubleshooting {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $accent;
        padding: 1 2;
        margin: 1 0;
    }

    #troubleshoot-status-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #troubleshoot-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None, **kwargs):
        super().__init__()
        self.api_client = api_client
        self.id = "troubleshooting"
        # Data state
        self._usb_status = {}
        self._network_status = {}

    def compose(self) -> ComposeResult:
        """Compose troubleshooting tools with tables."""
        yield Label("TROUBLESHOOTING TOOLS", id="troubleshooting-title")
        yield DataTable(id="troubleshoot-status-table")
        yield Label("Maintenance Actions:", id="troubleshoot-actions-label")
        yield DataTable(id="troubleshoot-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Status table
        table = self.query_one("#troubleshoot-status-table", DataTable)
        if not table.columns:
            table.add_columns("Component", "Status", "Details")
            table.add_row("USB Audio", "Loading...", "-")
            table.add_row("Network", "Loading...", "-")

        # Actions table
        actions = self.query_one("#troubleshoot-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.add_row("1", "Restart Services", "Restart all audio services")
            actions.add_row("2", "Reset Cache", "Clear application cache")
            actions.add_row("3", "Rebuild Index", "Rebuild plugin index")
            actions.add_row("4", "Test Audio", "Run audio loopback test")
            actions.add_row("5", "USB Diag", "Run USB diagnostics")
            actions.add_row("6", "Network Test", "Test network connectivity")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(10.0, self._refresh_data)
        # Initial fetch
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real diagnostic data from API."""
        if not self.api_client:
            return

        try:
            # Fetch USB diagnostics - /api/usb/diagnostics
            usb_result = await self.api_client.get_usb_diagnostics()
            if usb_result.success and usb_result.data:
                self._usb_status = usb_result.data

            # Fetch network status - /api/network/status
            network_result = await self.api_client.get_network_status()
            if network_result.success and network_result.data:
                self._network_status = network_result.data

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching diagnostic data: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            table = self.query_one("#troubleshoot-status-table", DataTable)

            # Clear and rebuild table rows
            table.clear()

            # USB status
            usb_devices = self._usb_status.get("devices", [])
            usb_count = len(usb_devices) if isinstance(usb_devices, list) else 0
            audio_device = None
            for dev in usb_devices if isinstance(usb_devices, list) else []:
                if dev.get("is_audio", False) or "audio" in dev.get("name", "").lower():
                    audio_device = dev.get("name", "Audio Device")
                    break

            if audio_device:
                usb_status = "🟢 Connected"
                usb_details = f"{audio_device} ({usb_count} devices)"
            else:
                usb_status = "⚪ No audio"
                usb_details = f"{usb_count} USB devices"
            table.add_row("USB Audio", usb_status, usb_details)

            # Network status
            internet = self._network_status.get("internet_connected", False)
            local = self._network_status.get("local_connected", False)
            ip = self._network_status.get("ip_address", "N/A")

            if internet:
                net_status = "🟢 Connected"
            elif local:
                net_status = "🟡 Local only"
            else:
                net_status = "🔴 Disconnected"
            table.add_row("Network", net_status, f"IP: {ip}")

        except Exception as e:
            logger.debug(f"Error updating troubleshooting display: {e}")


class DiagnosticsScreen(Static):
    """
    Diagnostics Screen - System health and troubleshooting.

    Shows:
    - Health checks from /api/health, /api/metrics, /api/audio
    - Recent activity from /api/www/logs
    - Troubleshooting status from /api/usb, /api/network
    """

    DEFAULT_CSS = """
    DiagnosticsScreen {
        width: 100%;
        height: 100%;
        background: $surface;
        layout: vertical;
        overflow: auto;
    }
    """

    BINDINGS = [
        Binding("h", "run_health_check", "Health", show=True),
        Binding("l", "view_logs", "Logs", show=True),
        Binding("t", "troubleshoot", "Troubleshoot", show=True),
        Binding("r", "refresh_data", "Refresh", show=True),
    ]

    def __init__(self, api_client=None, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client

    def compose(self) -> ComposeResult:
        """Compose diagnostics widgets."""
        with Vertical(id="diagnostics-container"):
            yield HealthCheckWidget(self.api_client)
            yield LogViewerWidget(self.api_client)
            yield TroubleshootingWidget(self.api_client)

    async def action_run_health_check(self) -> None:
        """Run health check."""
        if not self.api_client:
            self.notify("API client not available", severity="warning", timeout=2)
            return

        self.notify("Running health check...", severity="information", timeout=2)

        try:
            # Fetch fresh health data
            health_result = await self.api_client.get_health()
            if health_result.success and health_result.data:
                status = health_result.data.get("status", "unknown")
                if status == "ok" or health_result.data.get("healthy", False):
                    self.notify("Health check passed - system healthy", severity="information", timeout=3)
                else:
                    self.notify(f"Health check: {status}", severity="warning", timeout=3)
            else:
                self.notify(f"Health check failed: {health_result.error}", severity="error", timeout=3)

            # Refresh all widgets
            await self.action_refresh_data()
        except Exception as e:
            self.notify(f"Health check error: {e}", severity="error", timeout=3)

    async def action_view_logs(self) -> None:
        """View more logs."""
        if not self.api_client:
            self.notify("API client not available", severity="warning", timeout=2)
            return

        try:
            # Fetch more logs
            logs_result = await self.api_client.get_access_logs(limit=50)
            if logs_result.success and logs_result.data:
                logs = logs_result.data if isinstance(logs_result.data, list) else logs_result.data.get("logs", [])
                self.notify(f"Found {len(logs)} log entries - view in web interface for full log", severity="information", timeout=3)
            else:
                self.notify("No logs available", severity="information", timeout=2)
        except Exception as e:
            self.notify(f"Error fetching logs: {e}", severity="error", timeout=3)

    async def action_troubleshoot(self) -> None:
        """Run troubleshooting."""
        if not self.api_client:
            self.notify("API client not available", severity="warning", timeout=2)
            return

        self.notify("Running diagnostics...", severity="information", timeout=2)

        try:
            # Run USB diagnostics
            usb_result = await self.api_client.get_usb_diagnostics()
            if usb_result.success:
                devices = usb_result.data.get("devices", []) if usb_result.data else []
                self.notify(f"USB: {len(devices)} devices found", severity="information", timeout=2)

            # Run network test
            network_result = await self.api_client.get_network_status()
            if network_result.success:
                internet = network_result.data.get("internet_connected", False) if network_result.data else False
                status = "connected" if internet else "local only"
                self.notify(f"Network: {status}", severity="information", timeout=2)

            # Refresh all widgets
            await self.action_refresh_data()
        except Exception as e:
            self.notify(f"Troubleshooting error: {e}", severity="error", timeout=3)

    async def action_refresh_data(self) -> None:
        """Refresh all diagnostic data."""
        self.notify("Refreshing diagnostics...", severity="information", timeout=1)

        try:
            for widget in self.query("HealthCheckWidget"):
                asyncio.create_task(widget._refresh_data())
            for widget in self.query("LogViewerWidget"):
                asyncio.create_task(widget._refresh_data())
            for widget in self.query("TroubleshootingWidget"):
                asyncio.create_task(widget._refresh_data())

            self.notify("Diagnostics refreshed", severity="information", timeout=2)
        except Exception as e:
            self.notify(f"Refresh error: {e}", severity="error", timeout=3)

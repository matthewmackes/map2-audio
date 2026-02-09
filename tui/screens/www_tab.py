"""
WWW Configuration Tab
Web server and API configuration management
Parity with web WWWPanel.tsx component
"""

import asyncio
from typing import Optional, List, Dict, Any

from textual.app import ComposeResult
from textual.widgets import Static, Button, Label, Input, Select, DataTable, Switch
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.reactive import reactive

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from ..api_client import MAP2APIClient
from ..widgets import ActionButton, StatusIndicator, LoadingIndicator


class WebServerStatusPanel(Container):
    """Web server status overview panel."""

    DEFAULT_CSS = """
    WebServerStatusPanel {
        height: auto;
        width: 100%;
        background: $panel;
        border: heavy $success;
        padding: 1;
        margin-bottom: 1;
    }

    .server-title {
        text-style: bold;
        color: $success;
        margin-bottom: 1;
    }

    .status-row {
        width: 100%;
        height: auto;
        margin-bottom: 1;
    }

    .status-label {
        width: 20;
        color: $text-muted;
    }

    .status-value {
        color: $text;
        text-style: bold;
    }

    .status-running {
        color: $success;
    }

    .status-stopped {
        color: $error;
    }
    """

    def compose(self) -> ComposeResult:
        yield Label("🌐 Web Server Status", classes="server-title")

        with Horizontal(classes="status-row"):
            yield Label("Status:", classes="status-label")
            yield Static("Checking...", id="www-status", classes="status-value")

        with Horizontal(classes="status-row"):
            yield Label("Port:", classes="status-label")
            yield Static("...", id="www-port", classes="status-value")

        with Horizontal(classes="status-row"):
            yield Label("SSL/TLS:", classes="status-label")
            yield Static("...", id="www-ssl", classes="status-value")

        with Horizontal(classes="status-row"):
            yield Label("CORS:", classes="status-label")
            yield Static("...", id="www-cors", classes="status-value")

        with Horizontal(classes="status-row"):
            yield Label("Uptime:", classes="status-label")
            yield Static("...", id="www-uptime", classes="status-value")

        with Horizontal(classes="status-row"):
            yield Label("Requests:", classes="status-label")
            yield Static("...", id="www-requests", classes="status-value")


class SSLConfigPanel(Container):
    """SSL/TLS configuration panel."""

    DEFAULT_CSS = """
    SSLConfigPanel {
        height: auto;
        width: 100%;
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    .ssl-title {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    .ssl-row {
        width: 100%;
        height: auto;
        margin-bottom: 1;
    }

    .ssl-label {
        width: 15;
        color: $text-muted;
    }

    .ssl-value {
        width: 1fr;
    }

    .cert-info {
        color: $text-muted;
        font-size: small;
    }
    """

    def compose(self) -> ComposeResult:
        yield Label("🔒 SSL/TLS Configuration", classes="ssl-title")

        with Horizontal(classes="ssl-row"):
            yield Label("Enabled:", classes="ssl-label")
            yield Switch(id="ssl-enabled")

        with Horizontal(classes="ssl-row"):
            yield Label("Certificate:", classes="ssl-label")
            yield Static("Not configured", id="ssl-cert-status", classes="ssl-value")

        with Horizontal(classes="ssl-row"):
            yield Label("Expires:", classes="ssl-label")
            yield Static("N/A", id="ssl-expires", classes="ssl-value")

        with Horizontal(classes="ssl-row"):
            yield ActionButton("Generate Self-Signed", variant="primary", id="btn-gen-ssl")
            yield ActionButton("Upload Certificate", variant="default", id="btn-upload-ssl")


class CORSConfigPanel(Container):
    """CORS configuration panel."""

    DEFAULT_CSS = """
    CORSConfigPanel {
        height: auto;
        width: 100%;
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    .cors-title {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    .cors-row {
        width: 100%;
        height: auto;
        margin-bottom: 1;
    }

    .cors-label {
        width: 15;
        color: $text-muted;
    }

    .cors-origins {
        background: $panel-darken-1;
        border: solid $primary-darken-1;
        padding: 1;
        min-height: 3;
    }
    """

    def compose(self) -> ComposeResult:
        yield Label("🔗 CORS Configuration", classes="cors-title")

        with Horizontal(classes="cors-row"):
            yield Label("Enabled:", classes="cors-label")
            yield Switch(id="cors-enabled")

        yield Label("Allowed Origins:", classes="cors-label")
        yield Static("*", id="cors-origins", classes="cors-origins")

        with Horizontal(classes="cors-row"):
            yield Input(placeholder="https://example.com", id="cors-new-origin")
            yield ActionButton("Add Origin", variant="primary", id="btn-add-origin")


class APIEndpointList(Container):
    """List of API endpoints."""

    DEFAULT_CSS = """
    APIEndpointList {
        height: auto;
        max-height: 15;
        width: 100%;
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    .endpoints-title {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    .endpoints-table {
        height: 1fr;
        width: 100%;
    }
    """

    endpoints: reactive[List[Dict]] = reactive(list)

    def compose(self) -> ComposeResult:
        yield Label("📋 API Endpoints", classes="endpoints-title")
        yield DataTable(id="endpoints-table", classes="endpoints-table")

    def on_mount(self) -> None:
        """Set up the data table."""
        table = self.query_one("#endpoints-table", DataTable)
        table.add_columns("Method", "Path", "Description")

    def update_endpoints(self, endpoints: List[Dict]) -> None:
        """Update the endpoints display."""
        self.endpoints = endpoints
        try:
            table = self.query_one("#endpoints-table", DataTable)
            table.clear()

            for endpoint in endpoints[:50]:  # Limit to 50 for performance
                method = endpoint.get("method", "GET")
                path = endpoint.get("path", "/")
                desc = endpoint.get("description", "")[:40]

                # Color code methods
                if method == "GET":
                    method_str = f"[green]{method}[/]"
                elif method == "POST":
                    method_str = f"[blue]{method}[/]"
                elif method == "PUT":
                    method_str = f"[yellow]{method}[/]"
                elif method == "DELETE":
                    method_str = f"[red]{method}[/]"
                else:
                    method_str = method

                table.add_row(method_str, path, desc)
        except Exception:
            pass


class AccessLogPanel(Container):
    """Recent access logs panel."""

    DEFAULT_CSS = """
    AccessLogPanel {
        height: auto;
        max-height: 12;
        width: 100%;
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    .logs-title {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    .logs-table {
        height: 1fr;
        width: 100%;
    }

    .logs-controls {
        width: 100%;
        height: auto;
        margin-top: 1;
    }
    """

    logs: reactive[List[Dict]] = reactive(list)

    def compose(self) -> ComposeResult:
        yield Label("📜 Recent Access Logs", classes="logs-title")
        yield DataTable(id="logs-table", classes="logs-table")
        with Horizontal(classes="logs-controls"):
            yield ActionButton("Refresh Logs", variant="default", id="btn-refresh-logs")
            yield ActionButton("Clear Logs", variant="error", id="btn-clear-logs")

    def on_mount(self) -> None:
        """Set up the data table."""
        table = self.query_one("#logs-table", DataTable)
        table.add_columns("Time", "Method", "Path", "Status", "Duration")

    def update_logs(self, logs: List[Dict]) -> None:
        """Update the logs display."""
        self.logs = logs
        try:
            table = self.query_one("#logs-table", DataTable)
            table.clear()

            for log in logs[:30]:  # Limit to 30 for performance
                time = log.get("timestamp", "")[:19]  # Truncate to datetime
                method = log.get("method", "GET")
                path = log.get("path", "/")[:30]
                status = log.get("status_code", 0)
                duration = log.get("duration_ms", 0)

                # Color code status
                if 200 <= status < 300:
                    status_str = f"[green]{status}[/]"
                elif 400 <= status < 500:
                    status_str = f"[yellow]{status}[/]"
                elif status >= 500:
                    status_str = f"[red]{status}[/]"
                else:
                    status_str = str(status)

                table.add_row(time, method, path, status_str, f"{duration}ms")
        except Exception:
            pass


class WebSocketStatsPanel(Container):
    """WebSocket connection statistics."""

    DEFAULT_CSS = """
    WebSocketStatsPanel {
        height: auto;
        width: 100%;
        background: $panel;
        border: solid $warning;
        padding: 1;
        margin-bottom: 1;
    }

    .ws-title {
        text-style: bold;
        color: $warning;
        margin-bottom: 1;
    }

    .ws-row {
        width: 100%;
        height: auto;
        margin-bottom: 1;
    }

    .ws-label {
        width: 20;
        color: $text-muted;
    }

    .ws-value {
        color: $text;
        text-style: bold;
    }
    """

    def compose(self) -> ComposeResult:
        yield Label("⚡ WebSocket Statistics", classes="ws-title")

        with Horizontal(classes="ws-row"):
            yield Label("Active Connections:", classes="ws-label")
            yield Static("0", id="ws-connections", classes="ws-value")

        with Horizontal(classes="ws-row"):
            yield Label("Messages Sent:", classes="ws-label")
            yield Static("0", id="ws-sent", classes="ws-value")

        with Horizontal(classes="ws-row"):
            yield Label("Messages Received:", classes="ws-label")
            yield Static("0", id="ws-received", classes="ws-value")

        with Horizontal(classes="ws-row"):
            yield Label("Avg Latency:", classes="ws-label")
            yield Static("N/A", id="ws-latency", classes="ws-value")


class WWWTab(ScrollableContainer):
    """
    WWW Configuration Tab.

    Features:
    - Web server status overview
    - SSL/TLS configuration
    - CORS settings
    - API endpoint listing
    - Access log viewer
    - WebSocket statistics
    """

    CSS = """
    WWWTab {
        background: $background;
        padding: 0 1;
        overflow-y: auto;
        height: 100%;
    }

    .main-header {
        width: 100%;
        height: 1;
        content-align: center middle;
        background: $accent;
        color: $text;
        text-style: bold;
    }

    .section-title {
        text-style: bold;
        color: $accent;
        margin-top: 1;
        margin-bottom: 1;
    }

    .two-col {
        width: 100%;
        height: auto;
    }

    .col-left {
        width: 50%;
        height: auto;
        padding-right: 1;
    }

    .col-right {
        width: 50%;
        height: auto;
        padding-left: 1;
    }

    .server-controls {
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    .server-controls Button {
        min-width: 15;
        margin-right: 1;
    }
    """

    def __init__(self, api_client: MAP2APIClient, id: Optional[str] = None):
        super().__init__(id=id)
        self.api_client = api_client
        self.www_status: Dict[str, Any] = {}
        self.www_config: Dict[str, Any] = {}
        self.endpoints: List[Dict] = []
        self.logs: List[Dict] = []
        self.ws_stats: Dict[str, Any] = {}

    def compose(self) -> ComposeResult:
        """Build WWW configuration UI."""

        # Main Header
        yield Label("🌐 WEB SERVER CONFIGURATION", classes="main-header")

        # Loading indicator
        yield LoadingIndicator("Loading web server status...", id="loading-www")

        # Server Status
        yield WebServerStatusPanel(id="server-status")

        # Server Controls
        with Container(classes="server-controls"):
            yield Label("Server Controls", classes="section-title")
            with Horizontal():
                yield ActionButton("🔄 Restart Server", variant="warning", id="btn-restart-www")
                yield ActionButton("📊 View Metrics", variant="default", id="btn-view-metrics")
                yield ActionButton("🔄 Refresh", variant="default", id="btn-refresh-www")

        # Two Column Layout
        with Horizontal(classes="two-col"):

            # Left Column - Configuration
            with Vertical(classes="col-left"):
                yield SSLConfigPanel(id="ssl-config")
                yield CORSConfigPanel(id="cors-config")

            # Right Column - Statistics
            with Vertical(classes="col-right"):
                yield WebSocketStatsPanel(id="ws-stats")

        # API Endpoints
        yield APIEndpointList(id="endpoints-list")

        # Access Logs
        yield AccessLogPanel(id="logs-panel")

    async def on_mount(self) -> None:
        """Initialize WWW data on mount."""
        await self.refresh_data()
        # Auto-refresh WebSocket stats every 7 seconds (non-disruptive)
        from ..polling_config import get_polling_interval
        self.set_interval(get_polling_interval('general'), self.refresh_ws_stats)

    async def refresh_data(self) -> None:
        """Refresh all WWW data."""
        loading = self.query_one("#loading-www", LoadingIndicator)
        loading.show("Refreshing web server data...")

        try:
            # Fetch server status
            status_result = await self.api_client.get_www_status()
            if status_result.success:
                self.www_status = status_result.data or {}
                self._update_status_panel()

            # Fetch server config
            config_result = await self.api_client.get_www_config()
            if config_result.success:
                self.www_config = config_result.data or {}
                self._update_config_panels()

            # Fetch API endpoints
            endpoints_result = await self.api_client.get_api_endpoints()
            if endpoints_result.success:
                self.endpoints = endpoints_result.data.get("endpoints", []) if endpoints_result.data else []
                self._update_endpoints_list()

            # Fetch access logs
            logs_result = await self.api_client.get_access_logs(limit=30)
            if logs_result.success:
                self.logs = logs_result.data.get("logs", []) if logs_result.data else []
                self._update_logs_panel()

            # Fetch WebSocket stats
            await self.refresh_ws_stats()

        except Exception as e:
            self.app.notify(f"Error loading WWW data: {str(e)}", severity="error")
        finally:
            loading.hide()

    async def refresh_ws_stats(self) -> None:
        """Refresh only WebSocket statistics."""
        try:
            ws_result = await self.api_client.get_websocket_stats()
            if ws_result.success:
                self.ws_stats = ws_result.data or {}
                self._update_ws_stats()
        except Exception:
            pass

    def _update_status_panel(self) -> None:
        """Update server status panel."""
        try:
            is_running = self.www_status.get("running", False)
            port = self.www_status.get("port", 8080)
            ssl = self.www_status.get("ssl_enabled", False)
            cors = self.www_status.get("cors_enabled", False)
            uptime = self.www_status.get("uptime_seconds", 0)
            requests = self.www_status.get("total_requests", 0)

            status_display = self.query_one("#www-status", Static)
            if is_running:
                status_display.update("[green]● Running[/]")
            else:
                status_display.update("[red]● Stopped[/]")

            self.query_one("#www-port", Static).update(str(port))
            self.query_one("#www-ssl", Static).update("Enabled" if ssl else "Disabled")
            self.query_one("#www-cors", Static).update("Enabled" if cors else "Disabled")

            # Format uptime
            if uptime > 86400:
                uptime_str = f"{uptime // 86400}d {(uptime % 86400) // 3600}h"
            elif uptime > 3600:
                uptime_str = f"{uptime // 3600}h {(uptime % 3600) // 60}m"
            else:
                uptime_str = f"{uptime // 60}m {uptime % 60}s"

            self.query_one("#www-uptime", Static).update(uptime_str)
            self.query_one("#www-requests", Static).update(f"{requests:,}")
        except Exception:
            pass

    def _update_config_panels(self) -> None:
        """Update configuration panels."""
        try:
            # SSL config
            ssl_enabled = self.www_config.get("ssl_enabled", False)
            ssl_switch = self.query_one("#ssl-enabled", Switch)
            ssl_switch.value = ssl_enabled

            ssl_cert = self.www_config.get("ssl_certificate", "")
            cert_status = self.query_one("#ssl-cert-status", Static)
            if ssl_cert:
                cert_status.update("[green]Configured[/]")
            else:
                cert_status.update("[yellow]Not configured[/]")

            ssl_expires = self.www_config.get("ssl_expires", "")
            self.query_one("#ssl-expires", Static).update(ssl_expires or "N/A")

            # CORS config
            cors_enabled = self.www_config.get("cors_enabled", False)
            cors_switch = self.query_one("#cors-enabled", Switch)
            cors_switch.value = cors_enabled

            origins = self.www_config.get("cors_origins", ["*"])
            origins_str = "\n".join(origins) if origins else "*"
            self.query_one("#cors-origins", Static).update(origins_str)
        except Exception:
            pass

    def _update_endpoints_list(self) -> None:
        """Update API endpoints list."""
        try:
            endpoints_panel = self.query_one("#endpoints-list", APIEndpointList)
            endpoints_panel.update_endpoints(self.endpoints)
        except Exception:
            pass

    def _update_logs_panel(self) -> None:
        """Update access logs panel."""
        try:
            logs_panel = self.query_one("#logs-panel", AccessLogPanel)
            logs_panel.update_logs(self.logs)
        except Exception:
            pass

    def _update_ws_stats(self) -> None:
        """Update WebSocket statistics."""
        try:
            connections = self.ws_stats.get("active_connections", 0)
            sent = self.ws_stats.get("messages_sent", 0)
            received = self.ws_stats.get("messages_received", 0)
            latency = self.ws_stats.get("avg_latency_ms", None)

            self.query_one("#ws-connections", Static).update(str(connections))
            self.query_one("#ws-sent", Static).update(f"{sent:,}")
            self.query_one("#ws-received", Static).update(f"{received:,}")

            if latency is not None:
                self.query_one("#ws-latency", Static).update(f"{latency:.1f}ms")
            else:
                self.query_one("#ws-latency", Static).update("N/A")
        except Exception:
            pass

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button presses."""
        button_id = event.button.id or ""

        if button_id == "btn-refresh-www":
            await self.refresh_data()
        elif button_id == "btn-restart-www":
            await self._restart_server()
        elif button_id == "btn-gen-ssl":
            await self._generate_ssl()
        elif button_id == "btn-add-origin":
            await self._add_cors_origin()
        elif button_id == "btn-refresh-logs":
            await self._refresh_logs()
        elif button_id == "btn-clear-logs":
            await self._clear_logs()

    async def _restart_server(self) -> None:
        """Restart the web server."""
        self.app.notify("Restarting web server...", severity="information", timeout=2)

        result = await self.api_client.restart_web_server()
        if result.success:
            self.app.notify("Web server restarted", severity="information")
            await asyncio.sleep(1)  # Wait for restart
            await self.refresh_data()
        else:
            self.app.notify(f"Restart failed: {result.error}", severity="error")

    async def _generate_ssl(self) -> None:
        """Generate a self-signed SSL certificate."""
        self.app.notify("Generating SSL certificate...", severity="information", timeout=2)

        result = await self.api_client.generate_ssl_certificate()
        if result.success:
            self.app.notify("SSL certificate generated", severity="information")
            await self.refresh_data()
        else:
            self.app.notify(f"Generation failed: {result.error}", severity="error")

    async def _add_cors_origin(self) -> None:
        """Add a CORS origin."""
        try:
            origin_input = self.query_one("#cors-new-origin", Input)
            new_origin = origin_input.value.strip()

            if not new_origin:
                self.app.notify("Please enter an origin URL", severity="warning")
                return

            # Get current origins and add new one
            current = self.www_config.get("cors_origins", ["*"])
            if new_origin not in current:
                current.append(new_origin)

            result = await self.api_client.set_cors_origins(current)
            if result.success:
                self.app.notify(f"Added origin: {new_origin}", severity="information")
                origin_input.value = ""
                await self.refresh_data()
            else:
                self.app.notify(f"Failed to add origin: {result.error}", severity="error")
        except Exception as e:
            self.app.notify(f"CORS error: {str(e)}", severity="error")

    async def _refresh_logs(self) -> None:
        """Refresh access logs."""
        logs_result = await self.api_client.get_access_logs(limit=30)
        if logs_result.success:
            self.logs = logs_result.data.get("logs", []) if logs_result.data else []
            self._update_logs_panel()
            self.app.notify("Logs refreshed", severity="information", timeout=2)

    async def _clear_logs(self) -> None:
        """Clear access logs."""
        result = await self.api_client.clear_access_logs()
        if result.success:
            self.logs = []
            self._update_logs_panel()
            self.app.notify("Logs cleared", severity="information")
        else:
            self.app.notify(f"Failed to clear logs: {result.error}", severity="error")

    async def on_switch_changed(self, event: Switch.Changed) -> None:
        """Handle switch toggles."""
        switch_id = event.switch.id or ""

        if switch_id == "ssl-enabled":
            await self._toggle_ssl(event.value)
        elif switch_id == "cors-enabled":
            await self._toggle_cors(event.value)

    async def _toggle_ssl(self, enabled: bool) -> None:
        """Toggle SSL/TLS."""
        result = await self.api_client.set_www_config(ssl_enabled=enabled)
        if result.success:
            state = "enabled" if enabled else "disabled"
            self.app.notify(f"SSL {state}", severity="information")
        else:
            self.app.notify(f"Failed to toggle SSL: {result.error}", severity="error")
            await self.refresh_data()

    async def _toggle_cors(self, enabled: bool) -> None:
        """Toggle CORS."""
        result = await self.api_client.set_www_config(cors_enabled=enabled)
        if result.success:
            state = "enabled" if enabled else "disabled"
            self.app.notify(f"CORS {state}", severity="information")
        else:
            self.app.notify(f"Failed to toggle CORS: {result.error}", severity="error")
            await self.refresh_data()

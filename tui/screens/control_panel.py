"""
Service Control Panel Screen for MAP2 TUI

Provides comprehensive service management with:
- Real-time service status display
- Start/stop/restart controls
- Health monitoring
- Dependency visualization
- Performance metrics
"""

from typing import Optional, Dict, Any, List
from textual.app import ComposeResult
from textual.widgets import Static, Button, Label, DataTable, ProgressBar, Rule
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.reactive import reactive
from textual import work
from textual.timer import Timer
from rich.text import Text
from rich.style import Style

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from api_client import MAP2APIClient


# Service state colors
STATE_COLORS = {
    "running": "#4ec9b0",    # Green
    "stopped": "#808080",    # Gray
    "starting": "#dcdcaa",   # Yellow
    "stopping": "#dcdcaa",   # Yellow
    "failed": "#f14c4c",     # Red
    "degraded": "#ce9178",   # Orange
}

# Priority labels
PRIORITY_LABELS = {
    1: "CRITICAL",
    2: "HIGH",
    3: "NORMAL",
    4: "LOW",
    5: "BACKGROUND",
}


class ServiceCard(Container):
    """Individual service status card."""

    DEFAULT_CSS = """
    ServiceCard {
        width: 100%;
        height: auto;
        padding: 1;
        margin: 0 0 1 0;
        border: solid $primary-background-lighten-2;
        background: $surface;
    }

    ServiceCard.running {
        border: solid #4ec9b0;
    }

    ServiceCard.stopped {
        border: solid #808080;
    }

    ServiceCard.failed {
        border: solid #f14c4c;
    }

    ServiceCard.degraded {
        border: solid #ce9178;
    }

    ServiceCard .service-header {
        width: 100%;
        height: 1;
    }

    ServiceCard .service-name {
        width: 1fr;
        text-style: bold;
    }

    ServiceCard .service-state {
        width: auto;
        padding: 0 1;
    }

    ServiceCard .service-controls {
        width: 100%;
        height: 3;
        margin-top: 1;
    }

    ServiceCard .service-controls Button {
        width: auto;
        min-width: 10;
        margin-right: 1;
    }

    ServiceCard .service-metrics {
        width: 100%;
        height: auto;
        margin-top: 1;
        color: $text-muted;
    }
    """

    def __init__(self, service_data: Dict[str, Any], api_client: MAP2APIClient, **kwargs):
        super().__init__(**kwargs)
        self.service_data = service_data
        self.api_client = api_client
        self.service_name = service_data.get("name", "unknown")

    def compose(self) -> ComposeResult:
        state = self.service_data.get("state", "stopped")
        display_name = self.service_data.get("display_name", self.service_name)
        description = self.service_data.get("description", "")
        health = self.service_data.get("health", {})
        priority = self.service_data.get("priority", 3)
        is_optional = self.service_data.get("is_optional", False)

        # Update card class based on state
        self.add_class(state)

        # Header with name and state
        with Horizontal(classes="service-header"):
            name_text = f"{display_name}"
            if is_optional:
                name_text += " [optional]"
            yield Label(name_text, classes="service-name")

            state_color = STATE_COLORS.get(state, "#808080")
            yield Label(f"[{state_color}]{state.upper()}[/]", classes="service-state")

        # Description
        yield Label(f"[dim]{description}[/]")

        # Health message
        health_msg = health.get("message", "")
        if health_msg:
            healthy = health.get("healthy", False)
            color = "#4ec9b0" if healthy else "#f14c4c"
            yield Label(f"[{color}]{health_msg}[/]")

        # Metrics
        metrics = health.get("metrics", {})
        if metrics:
            metrics_str = " | ".join(f"{k}: {v}" for k, v in list(metrics.items())[:3])
            yield Label(f"[dim]{metrics_str}[/]", classes="service-metrics")

        # Control buttons
        with Horizontal(classes="service-controls"):
            if state in ("stopped", "failed"):
                yield Button("Start", id=f"start-{self.service_name}", variant="success")
            elif state in ("running", "degraded"):
                yield Button("Stop", id=f"stop-{self.service_name}", variant="error")
                yield Button("Restart", id=f"restart-{self.service_name}", variant="warning")


class ControlPanelScreen(Container):
    """Service Control Panel screen."""

    DEFAULT_CSS = """
    ControlPanelScreen {
        width: 100%;
        height: 100%;
        background: $surface-darken-1;
    }

    ControlPanelScreen .panel-header {
        width: 100%;
        height: 5;
        background: $primary-background;
        padding: 1;
    }

    ControlPanelScreen .panel-title {
        text-style: bold;
        color: $text;
    }

    ControlPanelScreen .panel-stats {
        width: 100%;
        height: 1;
        margin-top: 1;
    }

    ControlPanelScreen .stats-item {
        width: auto;
        margin-right: 3;
    }

    ControlPanelScreen .panel-controls {
        width: 100%;
        height: 5;
        padding: 1;
        background: $panel;
    }

    ControlPanelScreen .panel-controls Button {
        margin-right: 1;
    }

    ControlPanelScreen .services-container {
        width: 100%;
        height: 1fr;
        padding: 1;
    }

    ControlPanelScreen .priority-section {
        width: 100%;
        height: auto;
        margin-bottom: 1;
    }

    ControlPanelScreen .priority-header {
        width: 100%;
        height: 1;
        background: $panel-lighten-1;
        padding: 0 1;
        text-style: bold;
    }

    ControlPanelScreen .dependency-info {
        width: 100%;
        height: auto;
        padding: 1;
        background: $panel;
        margin-top: 1;
    }
    """

    services_data: reactive[Dict[str, Any]] = reactive({})

    def __init__(self, api_client: MAP2APIClient, id: str = None):
        super().__init__(id=id)
        self.api_client = api_client
        self._refresh_timer: Optional[Timer] = None

    def compose(self) -> ComposeResult:
        # Header
        with Container(classes="panel-header"):
            yield Label("SERVICE CONTROL PANEL", classes="panel-title")
            with Horizontal(classes="panel-stats"):
                yield Label("Total: 0", id="stat-total", classes="stats-item")
                yield Label("[#4ec9b0]Running: 0[/]", id="stat-running", classes="stats-item")
                yield Label("[#808080]Stopped: 0[/]", id="stat-stopped", classes="stats-item")
                yield Label("[#f14c4c]Failed: 0[/]", id="stat-failed", classes="stats-item")
                yield Label("Uptime: --", id="stat-uptime", classes="stats-item")

        # Global controls
        with Horizontal(classes="panel-controls"):
            yield Button("Start All", id="btn-start-all", variant="success")
            yield Button("Stop All", id="btn-stop-all", variant="error")
            yield Button("Refresh", id="btn-refresh", variant="primary")
            yield Button("View Logs", id="btn-logs", variant="default")

        # Services list
        with ScrollableContainer(classes="services-container"):
            yield Container(id="services-list")

    async def on_mount(self) -> None:
        """Initialize screen on mount."""
        await self.refresh_services()
        # Auto-refresh every 5 seconds
        self._refresh_timer = self.set_interval(5.0, self.refresh_services)

    async def on_unmount(self) -> None:
        """Cleanup on unmount."""
        if self._refresh_timer:
            self._refresh_timer.stop()

    @work(exclusive=True)
    async def refresh_services(self) -> None:
        """Refresh service status from API."""
        try:
            result = await self.api_client._request("GET", "/api/services/status")
            if result.success:
                self.services_data = result.data
                await self._update_display()
        except Exception as e:
            self.notify(f"Failed to refresh services: {e}", severity="error")

    async def _update_display(self) -> None:
        """Update the display with current service data."""
        if not self.services_data:
            return

        orchestrator = self.services_data.get("orchestrator", {})
        services = self.services_data.get("services", {})

        # Update stats
        total = len(services)
        running = sum(1 for s in services.values() if s.get("state") == "running")
        stopped = sum(1 for s in services.values() if s.get("state") == "stopped")
        failed = sum(1 for s in services.values() if s.get("state") == "failed")
        uptime = orchestrator.get("uptime_seconds", 0)

        try:
            self.query_one("#stat-total", Label).update(f"Total: {total}")
            self.query_one("#stat-running", Label).update(f"[#4ec9b0]Running: {running}[/]")
            self.query_one("#stat-stopped", Label).update(f"[#808080]Stopped: {stopped}[/]")
            self.query_one("#stat-failed", Label).update(f"[#f14c4c]Failed: {failed}[/]")

            hours = int(uptime // 3600)
            minutes = int((uptime % 3600) // 60)
            self.query_one("#stat-uptime", Label).update(f"Uptime: {hours}h {minutes}m")
        except Exception as e:
            self.log.debug(f"Could not update stats display: {e}")

        # Update services list
        services_list = self.query_one("#services-list", Container)

        # Clear existing cards
        for child in list(services_list.children):
            child.remove()

        # Group services by priority
        by_priority: Dict[int, List[Dict]] = {}
        for name, service in services.items():
            priority = service.get("priority", 3)
            if priority not in by_priority:
                by_priority[priority] = []
            by_priority[priority].append(service)

        # Create cards grouped by priority
        for priority in sorted(by_priority.keys()):
            priority_label = PRIORITY_LABELS.get(priority, f"PRIORITY {priority}")

            # Priority header
            header = Label(f"━━━ {priority_label} ━━━", classes="priority-header")
            await services_list.mount(header)

            # Service cards
            for service in by_priority[priority]:
                card = ServiceCard(service, self.api_client, id=f"card-{service['name']}")
                await services_list.mount(card)

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button presses."""
        button_id = event.button.id

        if button_id == "btn-start-all":
            await self._start_all_services()
        elif button_id == "btn-stop-all":
            await self._stop_all_services()
        elif button_id == "btn-refresh":
            await self.refresh_services()
        elif button_id == "btn-logs":
            self.notify("Log viewer not yet implemented", severity="information")
        elif button_id and button_id.startswith("start-"):
            service_name = button_id.replace("start-", "")
            await self._start_service(service_name)
        elif button_id and button_id.startswith("stop-"):
            service_name = button_id.replace("stop-", "")
            await self._stop_service(service_name)
        elif button_id and button_id.startswith("restart-"):
            service_name = button_id.replace("restart-", "")
            await self._restart_service(service_name)

    @work(exclusive=True)
    async def _start_all_services(self) -> None:
        """Start all services."""
        self.notify("Starting all services...", severity="information")
        try:
            result = await self.api_client._request("POST", "/api/services/start-all")
            if result.success:
                self.notify("All services started", severity="information")
            else:
                self.notify(f"Failed: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error: {e}", severity="error")
        await self.refresh_services()

    @work(exclusive=True)
    async def _stop_all_services(self) -> None:
        """Stop all services."""
        self.notify("Stopping all services...", severity="warning")
        try:
            result = await self.api_client._request("POST", "/api/services/stop-all")
            if result.success:
                self.notify("All services stopped", severity="information")
            else:
                self.notify(f"Failed: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error: {e}", severity="error")
        await self.refresh_services()

    @work(exclusive=True)
    async def _start_service(self, name: str) -> None:
        """Start a specific service."""
        self.notify(f"Starting {name}...", severity="information")
        try:
            result = await self.api_client._request("POST", f"/api/services/start/{name}")
            if result.success:
                self.notify(f"{name} started", severity="information")
            else:
                self.notify(f"Failed: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error: {e}", severity="error")
        await self.refresh_services()

    @work(exclusive=True)
    async def _stop_service(self, name: str) -> None:
        """Stop a specific service."""
        self.notify(f"Stopping {name}...", severity="warning")
        try:
            result = await self.api_client._request("POST", f"/api/services/stop/{name}")
            if result.success:
                self.notify(f"{name} stopped", severity="information")
            else:
                self.notify(f"Failed: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error: {e}", severity="error")
        await self.refresh_services()

    @work(exclusive=True)
    async def _restart_service(self, name: str) -> None:
        """Restart a specific service."""
        self.notify(f"Restarting {name}...", severity="warning")
        try:
            result = await self.api_client._request("POST", f"/api/services/restart/{name}")
            if result.success:
                self.notify(f"{name} restarted", severity="information")
            else:
                self.notify(f"Failed: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error: {e}", severity="error")
        await self.refresh_services()

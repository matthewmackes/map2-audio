"""
Cluster Diagnostics Screen
Real-time cluster health monitoring and troubleshooting.
"""

import asyncio
from typing import Optional, Dict, Any, List

try:
    from textual.app import ComposeResult
    from textual.containers import Vertical, Horizontal, Container
    from textual.widgets import Static, Label, Button
    from textual.binding import Binding
except ImportError:
    pass

from tui.cluster_api_client import ClusterAPIClient
from tui.cluster_types import ClusterHealthReport
from tui.widgets.data_grid_widget import DataGridWidget, DataGridColumn
from tui.widgets.notification_widget import NotificationWidget, NotificationSeverity


class ClusterDiagnosticsScreen(Static):
    """Screen for cluster health diagnostics and troubleshooting."""

    DEFAULT_CSS = """
    ClusterDiagnosticsScreen {
        width: 100%;
        height: 100%;
        background: $surface;
        layout: vertical;
    }

    #diagnostics-header {
        width: 100%;
        height: 2;
        background: $panel;
        border-bottom: solid $primary;
        padding: 1 2;
        dock: top;
    }

    .header-title {
        width: 100%;
        height: 1;
        text-style: bold;
        color: $text;
    }

    #diagnostics-content {
        width: 100%;
        height: 1fr;
        layout: vertical;
    }

    #health-summary {
        width: 100%;
        height: 3;
        background: $panel;
        padding: 1;
        border-bottom: solid $primary;
    }

    #issues-grid {
        width: 100%;
        height: 1fr;
    }

    #diagnostics-toolbar {
        width: 100%;
        height: 1;
        background: $panel;
        border-top: solid $primary;
        padding: 0 1;
        dock: bottom;
    }
    """

    BINDINGS = [
        Binding("r", "refresh", "Refresh", show=True),
        Binding("q", "quit", "Quit", show=True),
    ]

    def __init__(self, api_client: ClusterAPIClient, **kwargs) -> None:
        super().__init__(**kwargs)
        self.api_client = api_client
        self.health_report: Optional[ClusterHealthReport] = None
        self.update_task: Optional[asyncio.Task] = None

    def compose(self) -> ComposeResult:
        with Vertical():
            with Container(id="diagnostics-header"):
                yield Label("Cluster Diagnostics", classes="header-title")

            with Vertical(id="diagnostics-content"):
                yield Label("Cluster Health Summary", id="health-summary-title")
                yield Label("Loading health report...", id="health-summary")

                yield Label("Issues & Warnings", id="issues-title")
                columns = [
                    DataGridColumn("severity", "Severity", width=10),
                    DataGridColumn("message", "Message", width=50),
                ]
                yield DataGridWidget(columns=columns, id="issues-grid")

            with Horizontal(id="diagnostics-toolbar"):
                yield Button("Refresh", id="btn-refresh")

            yield NotificationWidget(id="notifications", max_notifications=3)

    async def on_mount(self) -> None:
        self.update_task = asyncio.create_task(self._load_health())

    async def on_unmount(self) -> None:
        if self.update_task:
            self.update_task.cancel()

    async def _load_health(self) -> None:
        try:
            result = await self.api_client.get_cluster_health()
            if result.success and result.data:
                self.health_report = result.data
                self._render_health()
                self._notify("Health report loaded", NotificationSeverity.SUCCESS, 1.0)
            else:
                self._notify(f"Failed to load health: {result.error}", NotificationSeverity.ERROR)
        except Exception as exc:
            self._notify(f"Error loading health: {exc}", NotificationSeverity.ERROR)

    def _render_health(self) -> None:
        if not self.health_report:
            return

        report = self.health_report
        summary = (
            f"Overall Health: {report.overall_health}% | "
            f"Online: {report.nodes_online} | "
            f"Offline: {report.nodes_offline} | "
            f"Avg CPU: {report.avg_cpu_percent:.1f}% | "
            f"Avg Latency: {report.avg_latency_ms:.1f}ms"
        )

        try:
            label = self.query_one("#health-summary", Label)
            label.update(summary)
        except Exception:
            pass

        rows = []
        for issue in (report.critical_issues or []):
            rows.append({"severity": "CRITICAL", "message": issue})
        for warning in (report.warnings or []):
            rows.append({"severity": "WARNING", "message": warning})

        try:
            grid = self.query_one("#issues-grid", DataGridWidget)
            grid.set_data(rows)
        except Exception:
            pass

    def _notify(self, message: str, severity: NotificationSeverity, duration: float = 2.0) -> None:
        try:
            notif = self.query_one("#notifications", NotificationWidget)
            notif.show(message, severity, duration)
        except Exception:
            pass

    async def action_refresh(self) -> None:
        await self._load_health()

    def action_quit(self) -> None:
        self.app.exit()

    async def on_button_pressed(self, event: "Button.Pressed") -> None:
        """Handle toolbar button presses."""
        if event.button.id == "btn-refresh":
            await self.action_refresh()

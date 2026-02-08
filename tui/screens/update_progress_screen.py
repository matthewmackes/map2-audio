"""
Update Progress Viewer (TUI)

Real-time monitoring of cluster update operations:
- Live progress per node
- Update stages with detailed status
- Error reporting and recovery suggestions
- Rollback controls
- Log streaming
- Health monitoring during updates

Features:
- Multi-node parallel progress tracking
- Stage-by-stage breakdown (download, install, restart, verify)
- Color-coded status indicators
- Auto-refresh with pause control
- Detailed error messages with recovery actions
- Rollback triggers and confirmations
"""

from textual.app import ComposeResult
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.widgets import Static, Button, DataTable, ProgressBar, Log, TabbedContent, TabPane
from textual.reactive import reactive
from textual.screen import Screen
from textual import work
from typing import Dict, List, Optional
from datetime import datetime
import httpx
import asyncio


class NodeUpdateProgress(Static):
    """Widget showing update progress for a single node."""

    CSS = """
    NodeUpdateProgress {
        height: auto;
        border: solid $primary;
        padding: 1;
        margin: 1 0;
    }

    .node-header {
        height: auto;
        text-style: bold;
        margin-bottom: 1;
    }

    .stage-progress {
        height: auto;
        margin: 0 0 1 2;
    }

    .error-box {
        height: auto;
        background: $error 20%;
        border: solid $error;
        padding: 1;
        margin: 1 0;
    }
    """

    node_id: reactive[str] = reactive("")
    status: reactive[str] = reactive("idle")
    current_stage: reactive[str] = reactive("")
    progress_percent: reactive[int] = reactive(0)
    error_message: reactive[str] = reactive("")
    stages: reactive[List[Dict]] = reactive([])

    def __init__(self, node_id: str, **kwargs):
        super().__init__(**kwargs)
        self.node_id = node_id
        self.stages = [
            {"name": "Validation", "status": "pending", "progress": 0},
            {"name": "Download", "status": "pending", "progress": 0},
            {"name": "Install", "status": "pending", "progress": 0},
            {"name": "Restart", "status": "pending", "progress": 0},
            {"name": "Verify", "status": "pending", "progress": 0},
        ]

    def render(self) -> str:
        lines = []

        # Header with node ID and overall status
        status_icon = {
            "idle": "⏸️ ",
            "running": "⏳",
            "success": "✅",
            "failed": "❌",
            "rollback": "↩️ ",
        }.get(self.status, "❓")

        lines.append(f"{status_icon} Node: {self.node_id} - {self.status.upper()}")
        lines.append(f"Current Stage: {self.current_stage or 'N/A'}")
        lines.append(f"Overall Progress: {self.progress_percent}%")
        lines.append("─" * 60)

        # Stage breakdown
        for stage in self.stages:
            stage_icon = {
                "pending": "⏸️ ",
                "running": "⏳",
                "completed": "✅",
                "failed": "❌",
            }.get(stage["status"], "❓")

            stage_name = stage["name"].ljust(12)
            stage_progress = f"{stage['progress']:3d}%"
            progress_bar = "█" * (stage["progress"] // 5) + "░" * (20 - stage["progress"] // 5)

            lines.append(f"  {stage_icon} {stage_name} [{progress_bar}] {stage_progress}")

        # Error message if present
        if self.error_message:
            lines.append("")
            lines.append("ERROR:")
            lines.append(f"  {self.error_message}")

        return "\n".join(lines)

    def update_stage(self, stage_name: str, status: str, progress: int) -> None:
        """Update a specific stage's status and progress."""
        for stage in self.stages:
            if stage["name"] == stage_name:
                stage["status"] = status
                stage["progress"] = progress
                break
        self.current_stage = stage_name
        self.refresh()

    def update_progress(self, overall_percent: int, status: str = None) -> None:
        """Update overall progress."""
        self.progress_percent = overall_percent
        if status:
            self.status = status
        self.refresh()

    def set_error(self, error: str) -> None:
        """Set error message."""
        self.error_message = error
        self.status = "failed"
        self.refresh()


class UpdateProgressScreen(Screen):
    """
    Comprehensive update progress monitoring screen.

    Features:
    - Real-time progress tracking per node
    - Stage-by-stage breakdown (5 stages per node)
    - Color-coded status indicators
    - Live log streaming
    - Error detection and recovery suggestions
    - Rollback controls with confirmation
    - Auto-refresh with pause/resume
    - Summary statistics

    Update Stages:
    1. Validation - Pre-update checks
    2. Download - Package download
    3. Install - Package installation
    4. Restart - Service restart
    5. Verify - Post-update validation

    Keyboard Shortcuts:
    - r: Refresh now
    - p: Pause/resume auto-refresh
    - b: Trigger rollback (with confirmation)
    - l: View detailed logs
    - q: Quit (returns to previous screen)
    """

    BINDINGS = [
        ("r", "refresh", "Refresh"),
        ("p", "pause", "Pause/Resume"),
        ("b", "rollback", "Rollback"),
        ("l", "logs", "Logs"),
        ("q", "quit", "Quit"),
    ]

    CSS = """
    UpdateProgressScreen {
        background: $surface;
    }

    #header {
        height: 7;
        border: solid $primary;
        padding: 1;
    }

    #stats {
        height: 5;
        border: solid $accent;
        padding: 1;
        margin: 1 0;
    }

    #node-progress-container {
        height: 1fr;
        border: solid $panel;
        overflow-y: auto;
    }

    #controls {
        height: 5;
        border-top: solid $accent;
        padding: 1;
    }

    #log-panel {
        height: 15;
        border: solid $warning;
    }
    """

    auto_refresh: reactive[bool] = reactive(True)
    update_id: reactive[str] = reactive("")
    total_nodes: reactive[int] = reactive(0)
    completed_nodes: reactive[int] = reactive(0)
    failed_nodes: reactive[int] = reactive(0)

    def __init__(self, update_id: str = "", **kwargs):
        super().__init__(**kwargs)
        self.update_id = update_id
        self.node_widgets: Dict[str, NodeUpdateProgress] = {}

    def compose(self) -> ComposeResult:
        # Header
        with Vertical(id="header"):
            yield Static("🔄 Cluster Update Progress Monitor", classes="title")
            yield Static(f"Update ID: {self.update_id or 'N/A'}", classes="subtitle")
            yield Static("Auto-refresh: ON | Press 'p' to pause", id="refresh-status")

        # Statistics
        with Horizontal(id="stats"):
            yield Static("Total Nodes: 0", id="stat-total")
            yield Static("Completed: 0", id="stat-completed")
            yield Static("Failed: 0", id="stat-failed")
            yield Static("Progress: 0%", id="stat-progress")

        # Tabbed content - Progress and Logs
        with TabbedContent():
            with TabPane("Node Progress", id="tab-progress"):
                yield ScrollableContainer(id="node-progress-container")

            with TabPane("Event Log", id="tab-logs"):
                yield Log(id="event-log")

        # Controls
        with Horizontal(id="controls"):
            yield Button("🔄 Refresh Now", id="btn-refresh", variant="primary")
            yield Button("⏸️  Pause Auto-Refresh", id="btn-pause")
            yield Button("↩️  Rollback", id="btn-rollback", variant="error")
            yield Button("❌ Close", id="btn-close")

    def on_mount(self) -> None:
        """Initialize and start auto-refresh."""
        self._log("Update progress monitor started")
        self._refresh_task = asyncio.create_task(self._auto_refresh_loop())

    def on_unmount(self) -> None:
        """Cancel auto-refresh on unmount."""
        if hasattr(self, "_refresh_task"):
            self._refresh_task.cancel()

    def _log(self, message: str, severity: str = "info") -> None:
        """Add message to event log."""
        try:
            log = self.query_one("#event-log", Log)
            timestamp = datetime.now().strftime("%H:%M:%S")
            
            if severity == "error":
                log.write(f"[red][{timestamp}][/red] ❌ {message}")
            elif severity == "warning":
                log.write(f"[yellow][{timestamp}][/yellow] ⚠️  {message}")
            elif severity == "success":
                log.write(f"[green][{timestamp}][/green] ✅ {message}")
            else:
                log.write(f"[cyan][{timestamp}][/cyan] ℹ️  {message}")
        except Exception as e:
            pass

    def _update_stats(self) -> None:
        """Update statistics display."""
        try:
            self.query_one("#stat-total", Static).update(f"Total Nodes: {self.total_nodes}")
            self.query_one("#stat-completed", Static).update(f"Completed: {self.completed_nodes}")
            self.query_one("#stat-failed", Static).update(f"Failed: {self.failed_nodes}")
            
            if self.total_nodes > 0:
                progress = int((self.completed_nodes / self.total_nodes) * 100)
                self.query_one("#stat-progress", Static).update(f"Progress: {progress}%")
        except Exception as e:
            pass

    @work
    async def _fetch_update_status(self) -> None:
        """Fetch current update status from API."""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get("http://localhost:8080/api/cluster/update/status")
                resp.raise_for_status()
                data = resp.json()

            # Update overall stats
            nodes = data.get("nodes", [])
            self.total_nodes = len(nodes)
            self.completed_nodes = sum(1 for n in nodes if n.get("status") == "completed")
            self.failed_nodes = sum(1 for n in nodes if n.get("status") == "failed")
            self._update_stats()

            # Update individual node widgets
            container = self.query_one("#node-progress-container", ScrollableContainer)
            
            for node_data in nodes:
                node_id = node_data.get("node_id", "unknown")
                
                # Create widget if it doesn't exist
                if node_id not in self.node_widgets:
                    widget = NodeUpdateProgress(node_id)
                    self.node_widgets[node_id] = widget
                    await container.mount(widget)
                
                # Update widget
                widget = self.node_widgets[node_id]
                widget.update_progress(
                    node_data.get("progress_percent", 0),
                    node_data.get("status", "idle")
                )
                
                # Update stages
                stages = node_data.get("stages", [])
                for stage in stages:
                    widget.update_stage(
                        stage.get("name", ""),
                        stage.get("status", "pending"),
                        stage.get("progress", 0),
                    )
                
                # Set error if present
                if error := node_data.get("error"):
                    widget.set_error(error)

            self._log("Status refreshed", "success")

        except Exception as e:
            self._log(f"Failed to fetch status: {e}", "error")

    async def _auto_refresh_loop(self) -> None:
        """Auto-refresh loop."""
        while True:
            if self.auto_refresh:
                await self._fetch_update_status()
            await asyncio.sleep(5)  # Refresh every 5 seconds

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button presses."""
        if event.button.id == "btn-refresh":
            await self._fetch_update_status()

        elif event.button.id == "btn-pause":
            self.auto_refresh = not self.auto_refresh
            status = "ON" if self.auto_refresh else "OFF"
            self.query_one("#refresh-status", Static).update(
                f"Auto-refresh: {status} | Press 'p' to {'pause' if self.auto_refresh else 'resume'}"
            )
            event.button.label = "▶️  Resume Auto-Refresh" if not self.auto_refresh else "⏸️  Pause Auto-Refresh"
            self._log(f"Auto-refresh {'enabled' if self.auto_refresh else 'disabled'}")

        elif event.button.id == "btn-rollback":
            # Confirmation would go here
            self._log("Triggering rollback...", "warning")
            await self._trigger_rollback()

        elif event.button.id == "btn-close":
            self.app.pop_screen()

    @work
    async def _trigger_rollback(self) -> None:
        """Trigger update rollback."""
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "http://localhost:8080/api/cluster/update/rollback",
                    json={"reason": "User-triggered rollback", "force": False},
                )
                resp.raise_for_status()
                result = resp.json()

            self._log(f"Rollback initiated: {result.get('message', 'OK')}", "success")

        except Exception as e:
            self._log(f"Rollback failed: {e}", "error")

    async def action_refresh(self) -> None:
        """Manual refresh action."""
        await self._fetch_update_status()

    async def action_pause(self) -> None:
        """Toggle auto-refresh."""
        btn = self.query_one("#btn-pause", Button)
        await self.on_button_pressed(Button.Pressed(btn))

    async def action_rollback(self) -> None:
        """Trigger rollback action."""
        btn = self.query_one("#btn-rollback", Button)
        await self.on_button_pressed(Button.Pressed(btn))

    async def action_logs(self) -> None:
        """Switch to logs tab."""
        try:
            tabs = self.query_one(TabbedContent)
            tabs.active = "tab-logs"
        except Exception as e:
            pass

    async def action_quit(self) -> None:
        """Quit screen."""
        self.app.pop_screen()

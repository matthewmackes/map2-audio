"""
Workflow Settings Screen - Automation & Workflow Configuration
Consolidates: Automation, Workflow

Wired to real API endpoints:
- Automation: /api/automation/* for automation lanes, LFOs, playback status
- Templates: /api/sessions/* for workflow templates

Note: Backup features are now in the dedicated Backup tab (tab 9).
"""

import logging
import asyncio
from textual.app import ComposeResult
from textual.widgets import Static, Label, DataTable
from textual.containers import Vertical
from textual.binding import Binding

logger = logging.getLogger(__name__)


class AutomationWidget(Static):
    """Automation rules in a table - wired to /api/automation/* endpoints."""

    DEFAULT_CSS = """
    #automation {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $success;
        padding: 1 2;
        margin: 1 0;
    }

    #automation-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #automation-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client
        self.id = "automation"
        # Data state
        self._automation_status = {}
        self._automation_lanes = []
        self._lfos = []

    def compose(self) -> ComposeResult:
        """Compose automation rules with tables."""
        yield Label("⚙️ AUTOMATION RULES", id="automation-title")
        yield DataTable(id="automation-table")
        yield Label("Actions:", id="automation-actions-label")
        yield DataTable(id="automation-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Rules table
        table = self.query_one("#automation-table", DataTable)
        if not table.columns:
            table.add_columns("Status", "Parameter", "Type", "Details")
            table.add_row("...", "Loading...", "...", "...")

        # Actions table
        actions = self.query_one("#automation-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.add_row("n", "New Lane", "Create new automation lane")
            actions.add_row("l", "Add LFO", "Add LFO to parameter")
            actions.add_row("d", "Delete", "Delete selected lane")
            actions.add_row("p", "Play", "Start automation playback")
            actions.add_row("s", "Stop", "Stop automation playback")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(5.0, self._refresh_data)
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real automation data from API."""
        if not self.api_client:
            return

        try:
            # Fetch automation status - /api/automation/status
            status_result = await self.api_client.get_automation_status()
            if status_result.success and status_result.data:
                self._automation_status = status_result.data

            # Fetch automation lanes - /api/automation/lanes
            lanes_result = await self.api_client.list_automation_lanes()
            if lanes_result.success and lanes_result.data:
                self._automation_lanes = lanes_result.data.get("lanes", []) if isinstance(lanes_result.data, dict) else lanes_result.data

            # Fetch active LFOs - /api/automation/lfo
            lfos_result = await self.api_client.list_lfos()
            if lfos_result.success and lfos_result.data:
                self._lfos = lfos_result.data.get("lfos", []) if isinstance(lfos_result.data, dict) else lfos_result.data

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching automation data: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            # Update title with status
            is_playing = self._automation_status.get("is_playing", False)
            is_looping = self._automation_status.get("is_looping", False)
            status_text = "▶ Playing" if is_playing else "⏹ Stopped"
            loop_text = " [LOOP]" if is_looping else ""

            title = self.query_one("#automation-title", Label)
            title.update(f"⚙️ AUTOMATION RULES | {status_text}{loop_text}")

            # Update rules table
            table = self.query_one("#automation-table", DataTable)
            table.clear()

            # Add automation lanes
            if self._automation_lanes:
                for lane in self._automation_lanes:
                    lane_id = lane.get("id", "?")
                    param_name = lane.get("parameter_name", f"Lane {lane_id}")
                    points = len(lane.get("points", []))
                    has_lfo = lane.get("lfo_config") is not None
                    status = "🟢" if points > 0 or has_lfo else "⚪"
                    lane_type = "LFO" if has_lfo else f"{points} points"
                    details = f"ID: {lane_id}"
                    table.add_row(status, param_name, lane_type, details)

            # Add active LFOs
            for lfo in self._lfos:
                param = lfo.get("parameter_name", lfo.get("parameter_id", "Unknown"))
                rate = lfo.get("rate_hz", 1.0)
                waveform = lfo.get("waveform", "sine")
                depth = lfo.get("depth", 0.5)
                if isinstance(depth, (int, float)):
                    depth = round(depth * 100)
                table.add_row("🌊", param, f"LFO {waveform}", f"{rate}Hz {depth}%")

            if not self._automation_lanes and not self._lfos:
                table.add_row("-", "No automation configured", "-", "Press 'n' to add")

        except Exception as e:
            logger.debug(f"Error updating automation display: {e}")


class WorkflowTemplatesWidget(Static):
    """Workflow templates in a table - wired to /api/sessions/* endpoints."""

    DEFAULT_CSS = """
    #workflow-templates {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $accent;
        padding: 1 2;
        margin: 1 0;
    }

    #workflow-templates-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #workflow-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None, **kwargs):
        super().__init__()
        self.api_client = api_client
        self.id = "workflow-templates"
        # Data state
        self._sessions = []
        self._chain_templates = []

    def compose(self) -> ComposeResult:
        """Compose workflow templates with tables."""
        yield Label("📋 WORKFLOW TEMPLATES & SESSIONS", id="templates-title")
        yield DataTable(id="workflow-templates-table")
        yield Label("Actions:", id="workflow-actions-label")
        yield DataTable(id="workflow-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Templates table
        table = self.query_one("#workflow-templates-table", DataTable)
        if not table.columns:
            table.add_columns("★", "Name", "Type", "Details")
            table.add_row("...", "Loading...", "...", "...")

        # Actions table
        actions = self.query_one("#workflow-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.add_row("Enter", "Load", "Load selected session/template")
            actions.add_row("s", "Save", "Save current state as session")
            actions.add_row("n", "New", "Create new from current setup")
            actions.add_row("d", "Delete", "Delete selected session")
            actions.add_row("t", "Templates", "Browse chain templates")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(15.0, self._refresh_data)
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real session/template data from API."""
        if not self.api_client:
            return

        try:
            # Fetch sessions - /api/sessions/list
            sessions_result = await self.api_client.list_sessions()
            if sessions_result.success and sessions_result.data:
                self._sessions = sessions_result.data if isinstance(sessions_result.data, list) else sessions_result.data.get("sessions", [])

            # Fetch chain templates - /api/chains/templates/list
            templates_result = await self.api_client.list_templates()
            if templates_result.success and templates_result.data:
                self._chain_templates = templates_result.data if isinstance(templates_result.data, list) else templates_result.data.get("templates", [])

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching template data: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            # Update title with counts
            session_count = len(self._sessions)
            template_count = len(self._chain_templates)

            title = self.query_one("#templates-title", Label)
            title.update(f"📋 SESSIONS ({session_count}) | TEMPLATES ({template_count})")

            # Update table
            table = self.query_one("#workflow-templates-table", DataTable)
            table.clear()

            # Add saved sessions first
            for session in self._sessions[:5]:
                name = session.get("name", "Unnamed Session")
                description = session.get("description", "")
                tags = session.get("tags", [])

                # Format details
                details = description if description else ", ".join(tags) if tags else "-"
                if len(details) > 25:
                    details = details[:22] + "..."

                # Check for favorite
                star = "★" if session.get("favorite", False) else ""

                table.add_row(star, name[:25], "Session", details)

            # Add chain templates
            for template in self._chain_templates[:5]:
                name = template.get("name", "Unnamed Template")
                description = template.get("description", "")
                plugin_count = template.get("plugin_count", 0)

                details = f"{plugin_count} plugins" if plugin_count else description[:20] if description else "-"

                table.add_row("", name[:25], "Template", details)

            if not self._sessions and not self._chain_templates:
                table.add_row("-", "No sessions/templates", "-", "Press 's' to save")

        except Exception as e:
            logger.debug(f"Error updating templates display: {e}")


class WorkflowSettingsScreen(Static):
    """
    Workflow Settings Screen - Manage automation and workflows.

    Shows:
    - Automation rules from /api/automation/*
    - Workflow templates from /api/sessions/*

    Note: Backup features are now in the dedicated Backup tab (tab 9).
    """

    DEFAULT_CSS = """
    WorkflowSettingsScreen {
        width: 100%;
        height: 100%;
        background: $surface;
        layout: vertical;
        overflow: auto;
    }
    """

    BINDINGS = [
        Binding("p", "play_automation", "Play", show=True),
        Binding("P", "stop_automation", "Stop", show=False),
        Binding("s", "save_session", "Save", show=True),
        Binding("r", "refresh_data", "Refresh", show=True),
    ]

    def __init__(self, api_client=None, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client

    def compose(self) -> ComposeResult:
        """Compose workflow settings widgets."""
        with Vertical(id="workflow-container"):
            yield AutomationWidget(self.api_client)
            yield WorkflowTemplatesWidget(self.api_client)

    async def action_play_automation(self) -> None:
        """Start automation playback."""
        if not self.api_client:
            self.notify("API client not available", severity="warning", timeout=2)
            return

        try:
            result = await self.api_client.start_automation()
            if result.success:
                self.notify("Automation started ▶", severity="information", timeout=2)
                await self.action_refresh_data()
            else:
                self.notify(f"Failed to start: {result.error}", severity="error", timeout=3)
        except Exception as e:
            self.notify(f"Error: {e}", severity="error", timeout=3)

    async def action_stop_automation(self) -> None:
        """Stop automation playback."""
        if not self.api_client:
            self.notify("API client not available", severity="warning", timeout=2)
            return

        try:
            result = await self.api_client.stop_automation()
            if result.success:
                self.notify("Automation stopped ⏹", severity="information", timeout=2)
                await self.action_refresh_data()
            else:
                self.notify(f"Failed to stop: {result.error}", severity="error", timeout=3)
        except Exception as e:
            self.notify(f"Error: {e}", severity="error", timeout=3)

    async def action_save_session(self) -> None:
        """Save current state as session."""
        if not self.api_client:
            self.notify("API client not available", severity="warning", timeout=2)
            return

        try:
            import time
            name = f"Session_{int(time.time())}"
            result = await self.api_client.save_session(name, description="Saved from TUI")
            if result.success:
                self.notify(f"Session '{name}' saved!", severity="information", timeout=3)
                await self.action_refresh_data()
            else:
                self.notify(f"Save failed: {result.error}", severity="error", timeout=3)
        except Exception as e:
            self.notify(f"Error: {e}", severity="error", timeout=3)

    async def action_refresh_data(self) -> None:
        """Refresh all workflow data."""
        self.notify("Refreshing...", severity="information", timeout=1)

        try:
            for widget in self.query("AutomationWidget"):
                asyncio.create_task(widget._refresh_data())
            for widget in self.query("WorkflowTemplatesWidget"):
                asyncio.create_task(widget._refresh_data())

            self.notify("Workflow data refreshed", severity="information", timeout=2)
        except Exception as e:
            self.notify(f"Refresh error: {e}", severity="error", timeout=3)

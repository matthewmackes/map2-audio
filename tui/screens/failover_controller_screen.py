"""
Failover Controller Screen
UI for managing manual failover operations and monitoring failover status.
"""

import asyncio
from typing import Optional, Dict, Any, List

try:
    from textual.app import ComposeResult
    from textual.containers import Vertical, Horizontal, Container
    from textual.widgets import Static, Label, Button
    from textual.binding import Binding
    from textual.reactive import reactive
except ImportError:
    pass

from tui.cluster_api_client import ClusterAPIClient
from tui.cluster_types import FlowAssignment, FailoverEvent, FailoverHistory
from tui.widgets.searchable_list_widget import SearchableListWidget
from tui.widgets.data_grid_widget import DataGridWidget, DataGridColumn
from tui.widgets.notification_widget import NotificationWidget, NotificationSeverity


class FailoverControllerScreen(Static):
    """
    Screen for managing failover operations.

    Workflow:
    - Select a flow assignment
    - Choose target node for failover
    - Trigger manual failover
    - Monitor failover history
    """

    DEFAULT_CSS = """
    FailoverControllerScreen {
        width: 100%;
        height: 100%;
        background: $surface;
        layout: vertical;
    }

    #failover-header {
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

    #failover-content {
        width: 100%;
        height: 1fr;
        layout: horizontal;
    }

    #assignment-list-pane {
        width: 30%;
        height: 100%;
        border-right: solid $primary;
        padding: 1;
    }

    #failover-pane {
        width: 70%;
        height: 100%;
        padding: 1;
    }

    #failover-history-grid {
        width: 100%;
        height: 1fr;
    }

    #failover-toolbar {
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
        Binding("f", "trigger_failover", "Failover", show=True),
        Binding("q", "quit", "Quit", show=True),
    ]

    selected_flow_id: reactive[Optional[str]] = reactive(None)
    selected_chain_id: reactive[Optional[int]] = reactive(None)

    def __init__(self, api_client: ClusterAPIClient, **kwargs) -> None:
        super().__init__(**kwargs)
        self.api_client = api_client
        self.assignments: Dict[str, FlowAssignment] = {}
        self.failover_history: Optional[FailoverHistory] = None
        self.update_task: Optional[asyncio.Task] = None

    def compose(self) -> ComposeResult:
        with Vertical():
            with Container(id="failover-header"):
                yield Label("Failover Controller", classes="header-title")

            with Horizontal(id="failover-content"):
                with Vertical(id="assignment-list-pane"):
                    yield Label("Assignments", id="assignment-list-title")
                    yield SearchableListWidget(
                        id="assignment-list",
                        items=[],
                        search_fields=["flow_id", "primary_node_id"],
                        display_field="flow_id",
                        on_select=self._on_assignment_selected,
                    )

                with Vertical(id="failover-pane"):
                    yield Label("Failover History", id="failover-history-title")
                    columns = [
                        DataGridColumn("event_id", "Event ID", width=12),
                        DataGridColumn("from_node_id", "From", width=12),
                        DataGridColumn("to_node_id", "To", width=12),
                        DataGridColumn("state", "State", width=12),
                        DataGridColumn("triggered_at", "Triggered", width=20),
                    ]
                    yield DataGridWidget(columns=columns, id="failover-history-grid")

            with Horizontal(id="failover-toolbar"):
                yield Button("Refresh", id="btn-refresh")
                yield Button("Trigger Failover", id="btn-failover")

            yield NotificationWidget(id="notifications", max_notifications=3)

    async def on_mount(self) -> None:
        self.update_task = asyncio.create_task(self._load_assignments())

    async def on_unmount(self) -> None:
        if self.update_task:
            self.update_task.cancel()

    async def _load_assignments(self) -> None:
        try:
            result = await self.api_client.get_flow_assignments()
            if result.success and result.data:
                self.assignments = result.data
                self._render_assignment_list()
            else:
                self._notify(f"Failed to load assignments: {result.error}", NotificationSeverity.ERROR)
        except Exception as exc:
            self._notify(f"Error loading assignments: {exc}", NotificationSeverity.ERROR)

    def _render_assignment_list(self) -> None:
        items = []
        for flow_id, assignment in self.assignments.items():
            items.append({
                "flow_id": flow_id,
                "chain_id": assignment.chain_id,
                "primary_node_id": assignment.primary_node_id,
                "standby_node_ids": ", ".join(assignment.standby_node_ids or []),
            })

        try:
            assign_list = self.query_one("#assignment-list", SearchableListWidget)
            assign_list.set_items(items)
        except Exception:
            pass

    def _on_assignment_selected(self, item: Dict[str, Any]) -> None:
        self.selected_flow_id = item.get("flow_id")
        self.selected_chain_id = item.get("chain_id")
        asyncio.create_task(self._fetch_failover_history())

    async def _fetch_failover_history(self) -> None:
        if not self.selected_flow_id:
            return

        try:
            result = await self.api_client.get_failover_history(flow_id=self.selected_flow_id)
            if result.success:
                self.failover_history = result.data
                self._render_failover_history()
                self._notify("Failover history loaded", NotificationSeverity.SUCCESS, 1.0)
            else:
                self._notify(f"Error: {result.error}", NotificationSeverity.ERROR)
        except Exception as exc:
            self._notify(f"Error loading history: {exc}", NotificationSeverity.ERROR)

    def _render_failover_history(self) -> None:
        if not self.failover_history or not self.failover_history.events:
            try:
                grid = self.query_one("#failover-history-grid", DataGridWidget)
                grid.set_data([])
            except Exception:
                pass
            return

        rows = []
        for event in self.failover_history.events:
            rows.append({
                "event_id": event.event_id[:8],
                "from_node_id": event.from_node_id,
                "to_node_id": event.to_node_id,
                "state": event.state.value,
                "triggered_at": event.triggered_at,
            })

        try:
            grid = self.query_one("#failover-history-grid", DataGridWidget)
            grid.set_data(rows)
        except Exception:
            pass

    async def _trigger_failover(self) -> None:
        if not self.selected_flow_id or self.selected_chain_id is None:
            self._notify("Select an assignment first", NotificationSeverity.WARNING)
            return

        assignment = self.assignments.get(self.selected_flow_id)
        if not assignment or not assignment.standby_node_ids:
            self._notify("No standby nodes available for failover", NotificationSeverity.WARNING)
            return

        target_node = assignment.standby_node_ids[0]

        try:
            result = await self.api_client.trigger_failover(
                flow_id=self.selected_flow_id,
                target_node_id=target_node,
                reason="user_request"
            )
            if result.success:
                self._notify("Failover triggered", NotificationSeverity.SUCCESS, 2.0)
                await self._fetch_failover_history()
            else:
                self._notify(f"Failover error: {result.error}", NotificationSeverity.ERROR)
        except Exception as exc:
            self._notify(f"Failover error: {exc}", NotificationSeverity.ERROR)

    def _notify(self, message: str, severity: NotificationSeverity, duration: float = 2.0) -> None:
        try:
            notif = self.query_one("#notifications", NotificationWidget)
            notif.show(message, severity, duration)
        except Exception:
            pass

    async def action_refresh(self) -> None:
        await self._load_assignments()

    async def action_trigger_failover(self) -> None:
        await self._trigger_failover()

    def action_quit(self) -> None:
        self.app.exit()

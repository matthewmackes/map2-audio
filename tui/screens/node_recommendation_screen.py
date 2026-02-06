"""
Node Recommendation Screen
UI for AI-based node assignment recommendations.
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
from tui.cluster_types import FlowAssignment, AssignmentRecommendation
from tui.widgets.searchable_list_widget import SearchableListWidget
from tui.widgets.data_grid_widget import DataGridWidget, DataGridColumn
from tui.widgets.notification_widget import NotificationWidget, NotificationSeverity


class NodeRecommendationScreen(Static):
    """
    Screen for viewing node assignment recommendations.

    Workflow:
    - Fetch current flow assignments
    - Select a flow from the list
    - Fetch and display AI recommendations for that flow
    """

    DEFAULT_CSS = """
    NodeRecommendationScreen {
        width: 100%;
        height: 100%;
        background: $surface;
        layout: vertical;
    }

    #recommendation-header {
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

    #recommendation-content {
        width: 100%;
        height: 1fr;
        layout: horizontal;
    }

    #flow-list-pane {
        width: 30%;
        height: 100%;
        border-right: solid $primary;
        padding: 1;
    }

    #recommendations-pane {
        width: 70%;
        height: 100%;
        padding: 1;
    }

    #recommendation-details {
        width: 100%;
        height: 3;
        color: $text-muted;
        margin: 0 0 1 0;
    }

    #recommendations-grid {
        width: 100%;
        height: 1fr;
    }

    #recommendation-toolbar {
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
        Binding("g", "get_recommendations", "Recommend", show=True),
        Binding("a", "apply_top", "Apply", show=True),
        Binding("q", "quit", "Quit", show=True),
    ]

    selected_flow_id: reactive[Optional[str]] = reactive(None)
    selected_chain_id: reactive[Optional[int]] = reactive(None)

    def __init__(self, api_client: ClusterAPIClient, **kwargs) -> None:
        super().__init__(**kwargs)
        self.api_client = api_client
        self.assignments: Dict[str, FlowAssignment] = {}
        self.recommendations: List[AssignmentRecommendation] = []
        self.update_task: Optional[asyncio.Task] = None

    def compose(self) -> ComposeResult:
        with Vertical():
            with Container(id="recommendation-header"):
                yield Label("Node Recommendation UI", classes="header-title")

            with Horizontal(id="recommendation-content"):
                with Vertical(id="flow-list-pane"):
                    yield Label("Flows", id="flow-list-title")
                    yield SearchableListWidget(
                        id="flow-list",
                        items=[],
                        search_fields=["flow_id", "primary_node_id"],
                        display_field="flow_id",
                        on_select=self._on_flow_selected,
                    )

                with Vertical(id="recommendations-pane"):
                    yield Label("Recommendations", id="recommendations-title")
                    yield Label("Select a flow to view recommendations.", id="recommendation-details")
                    columns = [
                        DataGridColumn("recommended_node_id", "Node", width=16),
                        DataGridColumn("confidence", "Confidence", width=12),
                        DataGridColumn("reason", "Reason", width=30),
                        DataGridColumn("estimated_cpu", "CPU", width=8),
                        DataGridColumn("estimated_memory_mb", "Memory MB", width=12),
                    ]
                    yield DataGridWidget(columns=columns, id="recommendations-grid")

            with Horizontal(id="recommendation-toolbar"):
                yield Button("Refresh Flows", id="btn-refresh")
                yield Button("Get Recommendations", id="btn-recommend")
                yield Button("Apply Top", id="btn-apply")

            yield NotificationWidget(id="notifications", max_notifications=3)

    async def on_mount(self) -> None:
        self.update_task = asyncio.create_task(self._load_flows())

    async def on_unmount(self) -> None:
        if self.update_task:
            self.update_task.cancel()

    async def _load_flows(self) -> None:
        try:
            result = await self.api_client.get_flow_assignments()
            if result.success and result.data:
                self.assignments = result.data
                self._render_flow_list()
                self._update_details("Flows loaded. Select a flow.")
            else:
                self._notify(f"Failed to load flows: {result.error}", NotificationSeverity.ERROR)
                self._update_details("Failed to load flows.")
        except Exception as exc:
            self._notify(f"Error loading flows: {exc}", NotificationSeverity.ERROR)
            self._update_details("Error loading flows.")

    def _render_flow_list(self) -> None:
        items = []
        for flow_id, assignment in self.assignments.items():
            items.append({
                "flow_id": flow_id,
                "chain_id": assignment.chain_id,
                "primary_node_id": assignment.primary_node_id,
            })

        try:
            flow_list = self.query_one("#flow-list", SearchableListWidget)
            flow_list.set_items(items)
        except Exception:
            pass

    def _on_flow_selected(self, item: Dict[str, Any]) -> None:
        self.selected_flow_id = item.get("flow_id")
        self.selected_chain_id = item.get("chain_id")
        flow_id = self.selected_flow_id or "(unknown)"
        self._update_details(f"Selected flow: {flow_id}. Fetching recommendations...")
        asyncio.create_task(self._fetch_recommendations())

    async def _fetch_recommendations(self) -> None:
        if not self.selected_flow_id or self.selected_chain_id is None:
            self._notify("Select a flow to get recommendations", NotificationSeverity.WARNING)
            self._update_details("Select a flow to view recommendations.")
            return

        try:
            result = await self.api_client.get_assignment_recommendations(
                flow_id=self.selected_flow_id,
                chain_id=self.selected_chain_id
            )
            if result.success:
                self.recommendations = result.data or []
                self._render_recommendations()
                count = len(self.recommendations)
                self._update_details(f"Recommendations ready: {count} suggestion(s).")
                self._notify("Recommendations updated", NotificationSeverity.SUCCESS, 1.0)
            else:
                self._notify(f"Recommendation error: {result.error}", NotificationSeverity.ERROR)
                self._update_details("Recommendation error.")
        except Exception as exc:
            self._notify(f"Recommendation error: {exc}", NotificationSeverity.ERROR)
            self._update_details("Recommendation error.")

    async def _apply_top_recommendation(self) -> None:
        if not self.recommendations:
            self._notify("No recommendations to apply", NotificationSeverity.WARNING)
            return
        if not self.selected_flow_id or self.selected_chain_id is None:
            self._notify("Select a flow before applying", NotificationSeverity.WARNING)
            return

        top = self.recommendations[0]
        result = await self.api_client.assign_flow(
            flow_id=self.selected_flow_id,
            chain_id=self.selected_chain_id,
            primary_node_id=top.recommended_node_id,
            standby_node_ids=[],
            redundancy_enabled=False,
        )

        if result.success:
            self._notify("Recommendation applied", NotificationSeverity.SUCCESS, 2.0)
            await self._load_flows()
        else:
            self._notify(f"Apply failed: {result.error}", NotificationSeverity.ERROR)

    def _render_recommendations(self) -> None:
        if not self.recommendations:
            try:
                grid = self.query_one("#recommendations-grid", DataGridWidget)
                grid.set_data([])
            except Exception:
                pass
            return
        rows = []
        for rec in self.recommendations:
            rows.append({
                "recommended_node_id": rec.recommended_node_id,
                "confidence": f"{rec.confidence:.2f}",
                "reason": rec.reason,
                "estimated_cpu": f"{rec.estimated_cpu:.1f}%",
                "estimated_memory_mb": f"{rec.estimated_memory_mb:.0f}",
            })

        try:
            grid = self.query_one("#recommendations-grid", DataGridWidget)
            grid.set_data(rows)
        except Exception:
            pass

    def _notify(self, message: str, severity: NotificationSeverity, duration: float = 2.0) -> None:
        try:
            notif = self.query_one("#notifications", NotificationWidget)
            notif.show(message, severity, duration)
        except Exception:
            pass

    def _update_details(self, message: str) -> None:
        try:
            details = self.query_one("#recommendation-details", Label)
            details.update(message)
        except Exception:
            pass

    async def action_refresh(self) -> None:
        await self._load_flows()

    async def action_get_recommendations(self) -> None:
        await self._fetch_recommendations()

    async def action_apply_top(self) -> None:
        await self._apply_top_recommendation()

    async def on_button_pressed(self, event: "Button.Pressed") -> None:
        """Handle toolbar button presses."""
        if event.button.id == "btn-refresh":
            await self.action_refresh()
        elif event.button.id == "btn-recommend":
            await self.action_get_recommendations()
        elif event.button.id == "btn-apply":
            await self.action_apply_top()

    def action_quit(self) -> None:
        self.app.exit()

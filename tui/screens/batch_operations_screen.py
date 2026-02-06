"""Batch Operations Controller - Multi-flow management."""

try:
    from textual.app import ComposeResult
    from textual.containers import Vertical, Horizontal, Container
    from textual.widgets import Static, Label, Button
    from textual.binding import Binding
except ImportError:
    pass

from tui.cluster_api_client import ClusterAPIClient
from tui.widgets.searchable_list_widget import SearchableListWidget
from tui.widgets.notification_widget import NotificationWidget, NotificationSeverity


class BatchOperationsScreen(Static):
    """Batch operations for multiple flows."""

    DEFAULT_CSS = """
    BatchOperationsScreen {
        width: 100%;
        height: 100%;
        background: $surface;
        layout: vertical;
    }

    #batch-header {
        width: 100%;
        height: 2;
        background: $panel;
        border-bottom: solid $primary;
        padding: 1 2;
        dock: top;
    }

    #batch-content {
        width: 100%;
        height: 1fr;
        layout: horizontal;
    }

    #flow-list-pane {
        width: 35%;
        height: 100%;
        border-right: solid $primary;
        padding: 1;
    }

    #batch-control-pane {
        width: 65%;
        height: 100%;
        padding: 1;
        layout: vertical;
    }

    #operation-buttons {
        width: 100%;
        height: auto;
    }

    #batch-status {
        width: 100%;
        height: 3;
        background: $panel;
        margin: 1 0;
        padding: 1;
    }

    #batch-toolbar {
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
        self.flows = {}
        self.selected_flows = set()

    def compose(self) -> ComposeResult:
        with Vertical():
            with Container(id="batch-header"):
                yield Label("Batch Operations", classes="header-title")

            with Horizontal(id="batch-content"):
                with Vertical(id="flow-list-pane"):
                    yield Label("Select Flows", id="flow-list-title")
                    yield SearchableListWidget(
                        id="batch-flow-list",
                        items=[],
                        search_fields=["flow_id"],
                        display_field="flow_id",
                    )

                with Vertical(id="batch-control-pane"):
                    yield Label("Operations", id="ops-title")
                    with Horizontal(id="operation-buttons"):
                        yield Button("Enable Selected", id="btn-enable")
                        yield Button("Disable Selected", id="btn-disable")
                        yield Button("Restart Selected", id="btn-restart")

                    yield Label("Status: Ready", id="batch-status")

            with Horizontal(id="batch-toolbar"):
                yield Button("Refresh", id="btn-refresh")

            yield NotificationWidget(id="notifications", max_notifications=3)

    async def on_mount(self) -> None:
        """Load flows on mount."""
        try:
            result = await self.api_client.get_flow_assignments()
            if result.success and result.data:
                self.flows = result.data
                items = [{"flow_id": fid} for fid in self.flows.keys()]
                self.query_one("#batch-flow-list", SearchableListWidget).set_items(items)
                self._notify("Flows loaded", NotificationSeverity.SUCCESS, 1.0)
        except Exception as exc:
            self._notify(f"Error loading: {exc}", NotificationSeverity.ERROR)

    def _notify(self, message: str, severity: NotificationSeverity, duration: float = 2.0) -> None:
        try:
            notif = self.query_one("#notifications", NotificationWidget)
            notif.show(message, severity, duration)
        except Exception:
            pass

    async def action_refresh(self) -> None:
        """Refresh flows."""
        await self.on_mount()

    def action_quit(self) -> None:
        self.app.exit()

    async def on_button_pressed(self, event: "Button.Pressed") -> None:
        """Handle buttons."""
        if event.button.id == "btn-refresh":
            await self.action_refresh()
        elif event.button.id in ("btn-enable", "btn-disable", "btn-restart"):
            self._notify("Batch operation would execute here", NotificationSeverity.INFO, 2.0)

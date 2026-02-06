"""
Flow Assignment Matrix Screen
Interactive matrix for viewing and managing flow-to-node assignments.
Shows flows on one axis, nodes on the other, with assignment status and health.
"""

import asyncio
from typing import Optional, Dict, List, Any, Tuple
from dataclasses import dataclass

try:
    from textual.app import ComposeResult
    from textual.containers import Container, Vertical, Horizontal, ScrollableContainer
    from textual.widgets import Static, Label, Button, DataTable
    from textual.binding import Binding
    from textual.reactive import reactive
except ImportError:
    pass

from tui.cluster_api_client import ClusterAPIClient
from tui.cluster_websocket import ClusterWebSocketManager
from tui.cluster_types import FlowAssignment, AssignmentMatrix
from tui.widgets.notification_widget import NotificationWidget, NotificationSeverity
from tui.widgets.dialog_widget import DialogWidget


@dataclass
class CellData:
    """Data for a matrix cell."""
    flow_id: str
    node_id: str
    is_assigned: bool
    is_primary: bool
    is_healthy: bool
    cpu_usage: float
    latency_ms: float


class MatrixCell(Static):
    """Single cell in assignment matrix."""
    
    DEFAULT_CSS = """
    MatrixCell {
        width: 10;
        height: 3;
        border: solid $primary;
        padding: 0 1;
    }
    
    MatrixCell.assigned {
        background: $success;
        color: $text;
    }
    
    MatrixCell.primary {
        background: $accent;
        color: $text;
        text-style: bold;
    }
    
    MatrixCell.standby {
        background: $warning;
        color: $text;
    }
    
    MatrixCell.unassigned {
        background: $surface;
        color: $text-muted;
    }
    
    MatrixCell.unhealthy {
        background: $error;
        color: $text;
    }
    """
    
    def __init__(self, cell_data: CellData, **kwargs):
        """Initialize matrix cell."""
        super().__init__(**kwargs)
        self.cell_data = cell_data
        self._update_style()
    
    def compose(self) -> ComposeResult:
        """Compose cell content."""
        with Vertical():
            status = "●" if self.cell_data.is_assigned else "○"
            marker = "P" if self.cell_data.is_primary else "S" if self.cell_data.is_assigned else ""
            yield Label(f"{status} {marker}", id="cell-status")
            yield Label(f"{self.cell_data.cpu_usage:.0f}%", id="cell-cpu")
            yield Label(f"{self.cell_data.latency_ms:.1f}ms", id="cell-latency")
    
    def _update_style(self) -> None:
        """Update cell styling."""
        # Remove all classes
        self.set_class(False, "assigned")
        self.set_class(False, "primary")
        self.set_class(False, "standby")
        self.set_class(False, "unassigned")
        self.set_class(False, "unhealthy")
        
        # Apply new class
        if not self.cell_data.is_healthy:
            self.set_class(True, "unhealthy")
        elif self.cell_data.is_primary:
            self.set_class(True, "primary")
        elif self.cell_data.is_assigned:
            self.set_class(True, "standby")
        else:
            self.set_class(True, "unassigned")


class FlowAssignmentMatrix(Static):
    """
    Interactive flow assignment matrix screen.
    
    Displays:
    - Flows as rows
    - Nodes as columns
    - Assignment status at each intersection
    - Real-time updates via WebSocket
    - Assignment recommendations
    - Health indicators
    
    Color coding:
    - Green: Primary assignment (healthy)
    - Orange: Standby assignment
    - Red: Unhealthy assignment
    - Gray: No assignment
    
    Example usage:
        matrix = FlowAssignmentMatrix(
            api_client=cluster_api_client,
            websocket_manager=ws_manager
        )
        yield matrix
    """
    
    DEFAULT_CSS = """
    FlowAssignmentMatrix {
        width: 100%;
        height: 100%;
        background: $surface;
        layout: vertical;
    }
    
    #matrix-header {
        width: 100%;
        height: 2;
        background: $panel;
        border-bottom: solid $primary;
        padding: 1 2;
        dock: top;
    }
    
    .matrix-title {
        width: 100%;
        height: 1;
        text-style: bold;
        color: $text;
    }
    
    #matrix-content {
        width: 100%;
        height: 1fr;
        layout: vertical;
    }
    
    #matrix-legend {
        width: 100%;
        height: auto;
        background: $panel;
        padding: 0 1;
        border-bottom: solid $primary;
    }
    
    .legend-item {
        width: auto;
        height: 1;
        margin: 0 1 0 0;
    }
    
    #matrix-display {
        width: 100%;
        height: 1fr;
        background: $surface;
        overflow: auto;
    }
    
    #matrix-toolbar {
        width: 100%;
        height: 1;
        background: $panel;
        border-top: solid $primary;
        padding: 0 1;
        dock: bottom;
    }
    
    .toolbar-button {
        margin: 0 1;
    }
    
    #notifications {
        width: 100%;
        height: auto;
        dock: bottom;
    }
    """
    
    BINDINGS = [
        Binding("r", "refresh", "Refresh", show=True),
        Binding("a", "auto_assign", "Auto-Assign", show=True),
        Binding("q", "quit", "Quit", show=True),
    ]
    
    # Reactive properties
    flow_count: reactive[int] = reactive(0)
    node_count: reactive[int] = reactive(0)
    assignment_count: reactive[int] = reactive(0)
    
    def __init__(
        self,
        api_client: ClusterAPIClient,
        websocket_manager: Optional[ClusterWebSocketManager] = None,
        **kwargs
    ):
        """
        Initialize flow assignment matrix.
        
        Args:
            api_client: ClusterAPIClient for API calls
            websocket_manager: Optional WebSocket manager for real-time updates
            **kwargs: Additional widget arguments
        """
        super().__init__(**kwargs)
        self.api_client = api_client
        self.websocket_manager = websocket_manager
        self.assignments: Dict[str, FlowAssignment] = {}
        self.matrix_data: Optional[AssignmentMatrix] = None
        self.update_task: Optional[asyncio.Task] = None
        self.ws_task: Optional[asyncio.Task] = None
    
    def compose(self) -> ComposeResult:
        """Compose the matrix screen."""
        with Vertical():
            # Header
            with Container(id="matrix-header"):
                yield Label("Flow Assignment Matrix", classes="matrix-title")
            
            # Legend
            with Horizontal(id="matrix-legend"):
                yield Label("● Primary", classes="legend-item")
                yield Label("◐ Standby", classes="legend-item")
                yield Label("○ Unassigned", classes="legend-item")
                yield Label("✗ Unhealthy", classes="legend-item")
            
            # Matrix display
            with ScrollableContainer(id="matrix-display"):
                yield Label("Loading matrix...", id="matrix-content")
            
            # Toolbar
            with Horizontal(id="matrix-toolbar"):
                yield Button("Refresh", id="btn-refresh", classes="toolbar-button")
                yield Button("Auto-Assign", id="btn-auto-assign", classes="toolbar-button")
                yield Button("Recommendations", id="btn-recommend", classes="toolbar-button")
            
            # Notifications
            yield NotificationWidget(id="notifications", max_notifications=3)
    
    async def on_mount(self) -> None:
        """Initialize matrix on mount."""
        # Start update tasks
        self.update_task = asyncio.create_task(self._update_loop())
        
        # Subscribe to WebSocket events
        if self.websocket_manager:
            self.ws_task = asyncio.create_task(self._websocket_loop())
    
    async def on_unmount(self) -> None:
        """Clean up on unmount."""
        if self.update_task:
            self.update_task.cancel()
        if self.ws_task:
            self.ws_task.cancel()
    
    async def _update_loop(self) -> None:
        """Periodically fetch assignment data."""
        while True:
            try:
                # Fetch assignments
                result = await self.api_client.get_flow_assignments()
                
                if result.success and result.data:
                    self.assignments = result.data
                    self._render_matrix()
                    self._update_stats()
                else:
                    notif = self.query_one("#notifications", NotificationWidget)
                    notif.show(
                        f"Error fetching assignments: {result.error}",
                        NotificationSeverity.ERROR,
                        3.0
                    )
                
                # Update interval: 3 seconds
                await asyncio.sleep(3.0)
            
            except asyncio.CancelledError:
                break
            except Exception as e:
                notif = self.query_one("#notifications", NotificationWidget)
                notif.show(f"Update error: {str(e)}", NotificationSeverity.ERROR)
                await asyncio.sleep(5.0)
    
    async def _websocket_loop(self) -> None:
        """Subscribe to WebSocket updates."""
        if not self.websocket_manager:
            return
        
        try:
            # Subscribe to assignment updates
            await self.websocket_manager.subscribe(
                "assignments",
                self._on_assignment_update
            )
        except Exception as e:
            notif = self.query_one("#notifications", NotificationWidget)
            notif.show(f"WebSocket error: {str(e)}", NotificationSeverity.WARNING)
    
    def _on_assignment_update(self, event_data: Dict[str, Any]) -> None:
        """Handle assignment update event."""
        flow_id = event_data.get("flow_id")
        node_id = event_data.get("primary_node_id")
        
        notif = self.query_one("#notifications", NotificationWidget)
        notif.show(
            f"Assignment updated: {flow_id} → {node_id}",
            NotificationSeverity.INFO,
            2.0
        )
        
        # Trigger refresh
        asyncio.create_task(self._force_refresh())
    
    async def _force_refresh(self) -> None:
        """Force immediate refresh."""
        result = await self.api_client.get_flow_assignments()
        if result.success and result.data:
            self.assignments = result.data
            self._render_matrix()
            self._update_stats()
    
    def _render_matrix(self) -> None:
        """Render the assignment matrix."""
        try:
            # For now, display as text. Could be enhanced with better visualization
            matrix_text = "Flow Assignment Matrix\n\n"
            
            if self.assignments:
                matrix_text += "Assignments:\n"
                for flow_id, assignment in self.assignments.items():
                    primary = assignment.primary_node_id
                    standby = ", ".join(assignment.standby_node_ids) if assignment.standby_node_ids else "None"
                    health = "✓" if assignment.is_healthy else "✗"
                    
                    matrix_text += f"  {health} {flow_id:20} → {primary:10} (standby: {standby})\n"
                    matrix_text += f"     CPU: {assignment.cpu_usage_percent:.1f}% | Latency: {assignment.latency_ms:.1f}ms\n"
            else:
                matrix_text += "No assignments found."
            
            content = self.query_one("#matrix-content", Label)
            content.update(matrix_text)
        except Exception as e:
            pass
    
    def _update_stats(self) -> None:
        """Update statistics."""
        self.flow_count = len(self.assignments)
        self.assignment_count = sum(1 for a in self.assignments.values() if a.is_active)
    
    async def action_refresh(self) -> None:
        """Refresh assignment matrix."""
        await self._force_refresh()
        notif = self.query_one("#notifications", NotificationWidget)
        notif.show("Refreshed", NotificationSeverity.SUCCESS, 1.0)
    
    async def action_auto_assign(self) -> None:
        """Trigger auto-assignment."""
        notif = self.query_one("#notifications", NotificationWidget)
        notif.show("Auto-assignment in progress...", NotificationSeverity.INFO, 3.0)
        
        if not self.assignments:
            notif.show("No flows available for recommendations", NotificationSeverity.WARNING, 2.0)
            return
        
        # Pick the first assignment as a sample for recommendations
        first_assignment = next(iter(self.assignments.values()))
        result = await self.api_client.get_assignment_recommendations(
            flow_id=first_assignment.flow_id,
            chain_id=first_assignment.chain_id
        )
        
        if result.success:
            count = len(result.data) if result.data else 0
            notif.show(
                f"Recommendations: {count} suggestions",
                NotificationSeverity.SUCCESS,
                3.0
            )
        else:
            notif.show(
                f"Error getting recommendations: {result.error}",
                NotificationSeverity.ERROR,
                3.0
            )
    
    def action_quit(self) -> None:
        """Exit the matrix."""
        self.app.exit()

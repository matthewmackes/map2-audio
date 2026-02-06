"""
Cluster Node Dashboard Screen
Main TUI screen for viewing and managing cluster nodes.
Displays node status, metrics, and real-time updates.
"""

import asyncio
from typing import Optional, List, Dict, Any
from datetime import datetime

try:
    from textual.app import ComposeResult
    from textual.containers import Container, Vertical, Horizontal, ScrollableContainer
    from textual.widgets import Static, Label, Button
    from textual.binding import Binding
    from textual.reactive import reactive
except ImportError:
    pass

from tui.cluster_api_client import ClusterAPIClient
from tui.cluster_websocket import ClusterWebSocketManager
from tui.cluster_types import NodeStatus, NodeMetrics
from tui.widgets.data_grid_widget import DataGridWidget, DataGridColumn
from tui.widgets.status_indicator_widget import StatusIndicatorWidget, StatusLevel
from tui.widgets.metrics_display_widget import MetricsDisplayWidget
from tui.widgets.notification_widget import NotificationWidget, NotificationSeverity
from tui.widgets.dialog_widget import DialogWidget


class NodeMetricsPanel(Static):
    """Display detailed metrics for a single node."""
    
    DEFAULT_CSS = """
    NodeMetricsPanel {
        width: 100%;
        height: auto;
        border: solid $primary;
        background: $surface;
        padding: 1 2;
        margin: 0 0;
    }
    
    .metrics-title {
        width: 100%;
        height: 1;
        text-style: bold;
        color: $text;
        margin: 0 0 1 0;
    }
    
    .metrics-container {
        width: 100%;
        height: auto;
    }
    """
    
    def __init__(self, node_id: str = "", **kwargs):
        """Initialize metrics panel."""
        super().__init__(**kwargs)
        self.node_id = node_id
        self.node_data: Optional[NodeStatus] = None
    
    def compose(self) -> ComposeResult:
        """Compose metrics panel."""
        with Vertical(classes="metrics-container"):
            yield Label("Node Metrics", classes="metrics-title")
            yield Label("Loading metrics...", id="metrics-content")
    
    def update_metrics(self, node: NodeStatus) -> None:
        """Update displayed metrics."""
        self.node_data = node
        
        if not node.metrics:
            return
        
        temperature = (
            f"{node.metrics.temperature_c:.1f}°C"
            if node.metrics.temperature_c is not None
            else "N/A"
        )
        uptime_hours = int(node.metrics.uptime_seconds / 3600)
        uptime_minutes = int((node.metrics.uptime_seconds % 3600) / 60)
        
        metrics_text = (
            f"CPU:             {node.metrics.cpu_percent:.1f}%\n"
            f"Memory:          {node.metrics.memory_percent:.1f}% "
            f"({node.metrics.memory_mb:.0f}MB / {node.metrics.memory_max_mb:.0f}MB)\n"
            f"Disk:            {node.metrics.disk_percent:.1f}%\n"
            f"Temperature:     {temperature}\n"
            f"Uptime:          {uptime_hours}h {uptime_minutes}m\n"
            f"Response Time:   {node.response_time_ms:.1f}ms\n"
        )
        
        try:
            content = self.query_one("#metrics-content", Label)
            content.update(metrics_text)
        except:
            pass


class ClusterNodeDashboard(Static):
    """
    Main cluster node dashboard screen.
    
    Displays:
    - Grid of all cluster nodes
    - Real-time status indicators
    - Metrics for each node
    - Node management controls
    - Live WebSocket updates
    
    Example usage:
        dashboard = ClusterNodeDashboard(
            api_client=cluster_api_client,
            websocket_manager=ws_manager
        )
        yield dashboard
    """
    
    DEFAULT_CSS = """
    ClusterNodeDashboard {
        width: 100%;
        height: 100%;
        background: $surface;
        layout: vertical;
    }
    
    #dashboard-header {
        width: 100%;
        height: 3;
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
        margin: 0 0 1 0;
    }
    
    .header-status {
        width: 100%;
        height: 1;
        color: $text-muted;
    }
    
    #dashboard-content {
        width: 100%;
        height: 1fr;
        layout: vertical;
    }
    
    #nodes-grid {
        width: 100%;
        height: 1fr;
        border: solid $primary;
        background: $surface;
    }
    
    #dashboard-toolbar {
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
        Binding("m", "set_maintenance", "Maintenance", show=True),
        Binding("q", "quit", "Quit", show=True),
    ]
    
    # Reactive properties
    selected_node: reactive[Optional[str]] = reactive(None)
    node_count: reactive[int] = reactive(0)
    online_count: reactive[int] = reactive(0)
    last_update: reactive[str] = reactive("Never")
    
    def __init__(
        self,
        api_client: ClusterAPIClient,
        websocket_manager: Optional[ClusterWebSocketManager] = None,
        **kwargs
    ):
        """
        Initialize cluster node dashboard.
        
        Args:
            api_client: ClusterAPIClient for API calls
            websocket_manager: Optional WebSocket manager for real-time updates
            **kwargs: Additional widget arguments
        """
        super().__init__(**kwargs)
        self.api_client = api_client
        self.websocket_manager = websocket_manager
        self.nodes: Dict[str, NodeStatus] = {}
        self.update_task: Optional[asyncio.Task] = None
        self.ws_task: Optional[asyncio.Task] = None
    
    def compose(self) -> ComposeResult:
        """Compose the dashboard."""
        with Vertical():
            # Header
            with Container(id="dashboard-header"):
                yield Label("Cluster Node Dashboard", classes="header-title")
                yield Label("Loading cluster information...", classes="header-status", id="header-status")
            
            # Content area
            with ScrollableContainer(id="dashboard-content"):
                # Nodes grid
                columns = [
                    DataGridColumn("hostname", "Hostname", width=15),
                    DataGridColumn("status", "Status", width=10),
                    DataGridColumn("ip_address", "IP Address", width=15),
                    DataGridColumn("cpu_percent", "CPU", width=8),
                    DataGridColumn("memory_percent", "Memory", width=8),
                    DataGridColumn("active_flows", "Flows", width=8),
                    DataGridColumn("response_time_ms", "Latency", width=10),
                ]
                yield DataGridWidget(
                    columns=columns,
                    id="nodes-grid"
                )
            
            # Toolbar
            with Horizontal(id="dashboard-toolbar"):
                yield Button("Refresh", id="btn-refresh", classes="toolbar-button")
                yield Button("Details", id="btn-details", classes="toolbar-button")
                yield Button("Maintenance", id="btn-maintenance", classes="toolbar-button")
            
            # Notifications
            yield NotificationWidget(id="notifications", max_notifications=3)
    
    async def on_mount(self) -> None:
        """Initialize dashboard on mount."""
        # Focus the grid
        try:
            grid = self.query_one("#nodes-grid", DataGridWidget)
            grid.focus()
        except:
            pass
        
        # Start update tasks
        self.update_task = asyncio.create_task(self._update_loop())
        
        # Subscribe to WebSocket events if available
        if self.websocket_manager:
            self.ws_task = asyncio.create_task(self._websocket_loop())
    
    async def on_unmount(self) -> None:
        """Clean up on unmount."""
        if self.update_task:
            self.update_task.cancel()
        if self.ws_task:
            self.ws_task.cancel()
    
    async def _update_loop(self) -> None:
        """Periodically fetch node status."""
        while True:
            try:
                # Fetch nodes from API
                result = await self.api_client.get_nodes()
                
                if result.success and result.data:
                    # Update nodes
                    self.nodes = {node.node_id: node for node in result.data}
                    self._render_nodes()
                    
                    # Update header
                    self._update_header()
                    
                    # Show notification on error recovery
                    notif = self.query_one("#notifications", NotificationWidget)
                    if hasattr(self, '_had_error'):
                        if self._had_error:
                            notif.show("Cluster reconnected", NotificationSeverity.SUCCESS, 2.0)
                            self._had_error = False
                else:
                    # Show error notification
                    notif = self.query_one("#notifications", NotificationWidget)
                    notif.show(
                        f"Error fetching nodes: {result.error}",
                        NotificationSeverity.ERROR,
                        3.0
                    )
                    self._had_error = True
                
                # Update interval: 2 seconds
                await asyncio.sleep(2.0)
            
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
            # Subscribe to node status changes
            await self.websocket_manager.subscribe(
                "nodes",
                self._on_node_status_change
            )
            
            # Subscribe to metrics updates
            await self.websocket_manager.subscribe(
                "metrics",
                self._on_metrics_update
            )
        except Exception as e:
            notif = self.query_one("#notifications", NotificationWidget)
            notif.show(f"WebSocket error: {str(e)}", NotificationSeverity.WARNING)
    
    def _on_node_status_change(self, event_data: Dict[str, Any]) -> None:
        """Handle node status change event."""
        node_id = event_data.get("node_id")
        status = event_data.get("status")
        
        notif = self.query_one("#notifications", NotificationWidget)
        notif.show(f"Node {node_id}: {status}", NotificationSeverity.INFO, 2.0)
        
        # Trigger refresh
        asyncio.create_task(self._force_refresh())
    
    def _on_metrics_update(self, event_data: Dict[str, Any]) -> None:
        """Handle metrics update event."""
        # Real-time metrics update
        node_id = event_data.get("node_id")
        if node_id in self.nodes:
            # Could update metrics in real-time here
            pass
    
    async def _force_refresh(self) -> None:
        """Force immediate refresh."""
        result = await self.api_client.get_nodes()
        if result.success and result.data:
            self.nodes = {node.node_id: node for node in result.data}
            self._render_nodes()
            self._update_header()
    
    def _render_nodes(self) -> None:
        """Render nodes in grid."""
        try:
            grid = self.query_one("#nodes-grid", DataGridWidget)
            
            # Convert nodes to list for grid
            node_list = []
            for node in self.nodes.values():
                metrics = node.metrics or NodeMetrics(
                    cpu_percent=0, memory_percent=0, memory_mb=0, memory_max_mb=0,
                    disk_percent=0, gpu_percent=0, gpu_memory_percent=0,
                    temperature_c=0, uptime_seconds=0, last_update=""
                )
                
                node_list.append({
                    "hostname": node.hostname,
                    "status": str(node.status).split(".")[-1] if node.status else "UNKNOWN",
                    "ip_address": node.ip_address,
                    "cpu_percent": f"{metrics.cpu_percent:.1f}%",
                    "memory_percent": f"{metrics.memory_percent:.1f}%",
                    "active_flows": str(node.active_flow_count),
                    "response_time_ms": f"{node.response_time_ms:.1f}ms",
                })
            
            grid.set_data(node_list)
        except Exception as e:
            pass
    
    def _update_header(self) -> None:
        """Update header with cluster stats."""
        try:
            online = sum(1 for n in self.nodes.values() if n.is_responsive)
            total = len(self.nodes)
            timestamp = datetime.now().strftime("%H:%M:%S")
            
            self.node_count = total
            self.online_count = online
            self.last_update = timestamp
            
            header = self.query_one("#header-status", Label)
            header.update(
                f"Nodes: {online}/{total} online | Last update: {timestamp}"
            )
        except:
            pass
    
    async def action_refresh(self) -> None:
        """Refresh node list."""
        await self._force_refresh()
        notif = self.query_one("#notifications", NotificationWidget)
        notif.show("Refreshed", NotificationSeverity.SUCCESS, 1.0)
    
    async def action_set_maintenance(self) -> None:
        """Set selected node to maintenance mode."""
        notif = self.query_one("#notifications", NotificationWidget)
        notif.show("Maintenance mode not yet implemented", NotificationSeverity.WARNING, 2.0)
    
    def action_quit(self) -> None:
        """Exit the dashboard."""
        self.app.exit()

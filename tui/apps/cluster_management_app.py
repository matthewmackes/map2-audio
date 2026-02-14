"""
Main Cluster Management TUI Application
Central application integrating all cluster screens and navigation.
"""

import asyncio
from typing import Optional, List
from datetime import datetime

try:
    from textual.app import ComposeResult, App
    from textual.containers import Container, Vertical, Horizontal
    from textual.widgets import Static, Label, Footer
    from textual.binding import Binding
except ImportError:
    pass

from tui.cluster_api_client import ClusterAPIClient
from tui.cluster_websocket import ClusterWebSocketManager
from tui.screens.cluster_node_dashboard import ClusterNodeDashboard
from tui.screens.flow_assignment_matrix import FlowAssignmentMatrix
from tui.screens.node_recommendation_screen import NodeRecommendationScreen
from tui.screens.failover_controller_screen import FailoverControllerScreen
from tui.screens.cluster_diagnostics_screen import ClusterDiagnosticsScreen
from tui.screens.settings_screen import SettingsScreen
from tui.screens.help_screen import HelpScreen
from tui.screens.batch_operations_screen import BatchOperationsScreen
from tui.widgets.notification_widget import NotificationWidget, NotificationSeverity


class StatusBar(Static):
    """Application status bar."""
    
    DEFAULT_CSS = """
    StatusBar {
        width: 100%;
        height: 1;
        background: $panel;
        border-top: solid $primary;
        padding: 0 1;
        dock: bottom;
    }
    
    .status-text {
        width: 1fr;
        height: 1;
        color: $text-muted;
    }
    """
    
    def __init__(self, **kwargs):
        """Initialize status bar."""
        super().__init__(**kwargs)
        self.current_screen = "Dashboard"
        self.connection_status = "Connecting..."
    
    def compose(self) -> ComposeResult:
        """Compose status bar."""
        with Horizontal():
            yield Label(self.current_screen, id="screen-name", classes="status-text")
            yield Label(self.connection_status, id="connection-status", classes="status-text")
            yield Label(datetime.now().strftime("%H:%M:%S"), id="time", classes="status-text")
    
    def update_screen_name(self, name: str) -> None:
        """Update current screen name."""
        self.current_screen = name
        try:
            self.query_one("#screen-name", Label).update(name)
        except:
            pass
    
    def update_connection_status(self, status: str) -> None:
        """Update connection status."""
        self.connection_status = status
        try:
            self.query_one("#connection-status", Label).update(status)
        except:
            pass
    
    def update_time(self) -> None:
        """Update time display."""
        try:
            self.query_one("#time", Label).update(datetime.now().strftime("%H:%M:%S"))
        except:
            pass


class ClusterManagementApp(App):
    """
    Main cluster management TUI application.
    
    Provides:
    - Navigation between cluster screens
    - API client management
    - WebSocket connection handling
    - Unified keyboard controls
    - Real-time status display
    
    Screens:
    - Dashboard: Node overview
    - Matrix: Flow assignments
    - Settings: Configuration
    
    Example usage:
        app = ClusterManagementApp(
            api_url="http://cluster:8080",
            ws_url="ws://cluster:8080"
        )
        app.run()
    """
    
    BINDINGS = [
        Binding("1", "switch_to_dashboard", "Dashboard", show=True),
        Binding("2", "switch_to_matrix", "Matrix", show=True),
        Binding("3", "switch_to_recommendations", "Recommend", show=True),
        Binding("4", "switch_to_failover", "Failover", show=True),
        Binding("5", "switch_to_diagnostics", "Diagnostics", show=True),
        Binding("6", "switch_to_batch", "Batch", show=True),
        Binding("7", "switch_to_help", "Help", show=True),
        Binding("8", "switch_to_settings", "Settings", show=True),
        Binding("ctrl+r", "reconnect", "Reconnect", show=False),
        Binding("ctrl+q", "quit", "Quit", show=True),
        Binding("ctrl+l", "toggle_logs", "Logs", show=False),
    ]
    
    CSS = """
    Screen {
        layout: vertical;
        background: $surface;
    }
    
    #app-header {
        width: 100%;
        height: 3;
        background: $panel;
        border-bottom: solid $primary;
        padding: 1 2;
        dock: top;
    }
    
    .app-title {
        width: 100%;
        height: 1;
        text-style: bold;
        color: $text;
        margin: 0 0 1 0;
    }
    
    .app-status {
        width: 100%;
        height: 1;
        color: $text-muted;
    }
    
    #screen-container {
        width: 100%;
        height: 1fr;
        background: $surface;
    }
    
    #status-bar {
        width: 100%;
        height: 1;
        background: $panel;
        border-top: solid $primary;
        padding: 0 1;
        dock: bottom;
    }
    
    #notifications {
        width: 100%;
        height: auto;
        dock: bottom;
    }
    """
    
    def __init__(
        self,
        api_url: str = "http://localhost:8080",
        ws_url: str = "ws://localhost:8080",
        **kwargs
    ):
        """
        Initialize cluster management app.
        
        Args:
            api_url: Cluster API base URL
            ws_url: WebSocket server URL
            **kwargs: Additional app arguments
        """
        super().__init__(**kwargs)
        self.api_url = api_url
        self.ws_url = ws_url
        self.api_client = ClusterAPIClient(base_url=api_url)
        self.ws_manager = ClusterWebSocketManager(base_url=ws_url)
        self.current_screen_name = "Dashboard"
        self.status_bar: Optional[StatusBar] = None
        self.time_update_task: Optional[asyncio.Task] = None
        self.connection_task: Optional[asyncio.Task] = None
        self.log_enabled = False
    
    def compose(self) -> ComposeResult:
        """Compose main application."""
        # Header
        with Container(id="app-header"):
            yield Label("MAP2 Audio Cluster Management", classes="app-title")
            yield Label(
                f"API: {self.api_url} | WebSocket: {self.ws_url}",
                classes="app-status",
                id="header-status"
            )
        
        # Main screen container
        yield Container(id="screen-container")
        
        # Notifications
        yield NotificationWidget(id="notifications", max_notifications=3)
        
        # Status bar
        yield StatusBar(id="status-bar")
    
    async def on_mount(self) -> None:
        """Initialize app on mount."""
        try:
            self.status_bar = self.query_one("#status-bar", StatusBar)
        except Exception:
            self.status_bar = None
        # Try to connect API client
        try:
            connected = await self.api_client.connect()
            if connected:
                self._update_connection_status("Connected ✓")
            else:
                self._update_connection_status("Connection failed")
        except Exception as e:
            self._update_connection_status(f"Error: {str(e)[:20]}")
        
        # Start time update task
        self.time_update_task = asyncio.create_task(self._update_time_loop())
        
        # Switch to default screen (Dashboard)
        await self.action_switch_to_dashboard()
    
    async def on_unmount(self) -> None:
        """Cleanup on unmount."""
        # Cancel tasks
        if self.time_update_task:
            self.time_update_task.cancel()
        if self.connection_task:
            self.connection_task.cancel()
        
        # Disconnect clients
        try:
            await self.api_client.disconnect()
            await self.ws_manager.disconnect()
        except:
            pass
    
    async def _update_time_loop(self) -> None:
        """Update status bar time periodically."""
        while True:
            try:
                if self.status_bar:
                    self.status_bar.update_time()
                await asyncio.sleep(1.0)
            except asyncio.CancelledError:
                break
            except:
                pass
    
    async def action_switch_to_dashboard(self) -> None:
        """Switch to node dashboard screen."""
        try:
            container = self.query_one("#screen-container", Container)
            
            # Remove old screen
            for child in list(container.children):
                await child.remove()
            
            # Add dashboard
            dashboard = ClusterNodeDashboard(
                api_client=self.api_client,
                websocket_manager=self.ws_manager
            )
            container.mount(dashboard)
            
            self.current_screen_name = "Dashboard"
            if self.status_bar:
                self.status_bar.update_screen_name("Dashboard")
            
            # Show notification
            notif = self.query_one("#notifications", NotificationWidget)
            notif.show("Switched to Dashboard", NotificationSeverity.INFO, 1.0)
        
        except Exception as e:
            notif = self.query_one("#notifications", NotificationWidget)
            notif.show(f"Error switching screens: {str(e)}", NotificationSeverity.ERROR)
    
    async def action_switch_to_matrix(self) -> None:
        """Switch to assignment matrix screen."""
        try:
            container = self.query_one("#screen-container", Container)
            
            # Remove old screen
            for child in list(container.children):
                await child.remove()
            
            # Add matrix
            matrix = FlowAssignmentMatrix(
                api_client=self.api_client,
                websocket_manager=self.ws_manager
            )
            container.mount(matrix)
            
            self.current_screen_name = "Assignment Matrix"
            if self.status_bar:
                self.status_bar.update_screen_name("Assignment Matrix")
            
            # Show notification
            notif = self.query_one("#notifications", NotificationWidget)
            notif.show("Switched to Matrix", NotificationSeverity.INFO, 1.0)
        
        except Exception as e:
            notif = self.query_one("#notifications", NotificationWidget)
            notif.show(f"Error switching screens: {str(e)}", NotificationSeverity.ERROR)
    
    async def action_switch_to_settings(self) -> None:
        """Switch to settings screen."""
        try:
            container = self.query_one("#screen-container", Container)

            for child in list(container.children):
                await child.remove()

            screen = SettingsScreen(api_client=self.api_client)
            container.mount(screen)

            self.current_screen_name = "Settings"
            if self.status_bar:
                self.status_bar.update_screen_name("Settings")

            notif = self.query_one("#notifications", NotificationWidget)
            notif.show("Switched to Settings", NotificationSeverity.INFO, 1.0)
        except Exception as e:
            notif = self.query_one("#notifications", NotificationWidget)
            notif.show(f"Error switching screens: {str(e)}", NotificationSeverity.ERROR)

    async def action_switch_to_recommendations(self) -> None:
        """Switch to node recommendation screen."""
        try:
            container = self.query_one("#screen-container", Container)

            for child in list(container.children):
                await child.remove()

            screen = NodeRecommendationScreen(api_client=self.api_client)
            container.mount(screen)

            self.current_screen_name = "Recommendations"
            if self.status_bar:
                self.status_bar.update_screen_name("Recommendations")

            notif = self.query_one("#notifications", NotificationWidget)
            notif.show("Switched to Recommendations", NotificationSeverity.INFO, 1.0)
        except Exception as e:
            notif = self.query_one("#notifications", NotificationWidget)
            notif.show(f"Error switching screens: {str(e)}", NotificationSeverity.ERROR)

    async def action_switch_to_failover(self) -> None:
        """Switch to failover controller screen."""
        try:
            container = self.query_one("#screen-container", Container)

            for child in list(container.children):
                await child.remove()

            screen = FailoverControllerScreen(api_client=self.api_client)
            container.mount(screen)

            self.current_screen_name = "Failover"
            if self.status_bar:
                self.status_bar.update_screen_name("Failover")

            notif = self.query_one("#notifications", NotificationWidget)
            notif.show("Switched to Failover", NotificationSeverity.INFO, 1.0)
        except Exception as e:
            notif = self.query_one("#notifications", NotificationWidget)
            notif.show(f"Error switching screens: {str(e)}", NotificationSeverity.ERROR)

    async def action_switch_to_diagnostics(self) -> None:
        """Switch to cluster diagnostics screen."""
        try:
            container = self.query_one("#screen-container", Container)

            for child in list(container.children):
                await child.remove()

            screen = ClusterDiagnosticsScreen(api_client=self.api_client)
            container.mount(screen)

            self.current_screen_name = "Diagnostics"
            if self.status_bar:
                self.status_bar.update_screen_name("Diagnostics")

            notif = self.query_one("#notifications", NotificationWidget)
            notif.show("Switched to Diagnostics", NotificationSeverity.INFO, 1.0)
        except Exception as e:
            notif = self.query_one("#notifications", NotificationWidget)
            notif.show(f"Error switching screens: {str(e)}", NotificationSeverity.ERROR)

    async def action_switch_to_batch(self) -> None:
        """Switch to batch operations screen."""
        try:
            container = self.query_one("#screen-container", Container)

            for child in list(container.children):
                await child.remove()

            screen = BatchOperationsScreen(api_client=self.api_client)
            container.mount(screen)

            self.current_screen_name = "Batch Operations"
            if self.status_bar:
                self.status_bar.update_screen_name("Batch Operations")

            notif = self.query_one("#notifications", NotificationWidget)
            notif.show("Switched to Batch Operations", NotificationSeverity.INFO, 1.0)
        except Exception as e:
            notif = self.query_one("#notifications", NotificationWidget)
            notif.show(f"Error switching screens: {str(e)}", NotificationSeverity.ERROR)

    async def action_switch_to_help(self) -> None:
        """Switch to help screen."""
        try:
            container = self.query_one("#screen-container", Container)

            for child in list(container.children):
                await child.remove()

            screen = HelpScreen()
            container.mount(screen)

            self.current_screen_name = "Help"
            if self.status_bar:
                self.status_bar.update_screen_name("Help")

            notif = self.query_one("#notifications", NotificationWidget)
            notif.show("Switched to Help", NotificationSeverity.INFO, 1.0)
        except Exception as e:
            notif = self.query_one("#notifications", NotificationWidget)
            notif.show(f"Error switching screens: {str(e)}", NotificationSeverity.ERROR)

    async def action_reconnect(self) -> None:
        """Reconnect to cluster."""
        try:
            # Disconnect
            await self.api_client.disconnect()
            await self.ws_manager.disconnect()
            
            # Reconnect
            self._update_connection_status("Reconnecting...")
            connected = await self.api_client.connect()
            
            if connected:
                self._update_connection_status("Connected ✓")
                notif = self.query_one("#notifications", NotificationWidget)
                notif.show("Reconnected to cluster", NotificationSeverity.SUCCESS, 2.0)
            else:
                self._update_connection_status("Reconnection failed")
                notif = self.query_one("#notifications", NotificationWidget)
                notif.show("Failed to reconnect", NotificationSeverity.ERROR, 2.0)
        
        except Exception as e:
            self._update_connection_status(f"Error: {str(e)[:20]}")
            notif = self.query_one("#notifications", NotificationWidget)
            notif.show(f"Reconnection error: {str(e)}", NotificationSeverity.ERROR)
    
    async def action_toggle_logs(self) -> None:
        """Toggle log display (placeholder)."""
        self.log_enabled = not self.log_enabled
        notif = self.query_one("#notifications", NotificationWidget)
        state = "enabled" if self.log_enabled else "disabled"
        notif.show(f"Logs {state}", NotificationSeverity.INFO, 1.0)
    
    async def action_quit(self) -> None:
        """Quit application."""
        self.exit()
    
    def _update_connection_status(self, status: str) -> None:
        """Update connection status."""
        if self.status_bar:
            self.status_bar.update_connection_status(status)


def run_cluster_app(
    api_url: str = "http://localhost:8080",
    ws_url: str = "ws://localhost:8080"
) -> None:
    """
    Run the cluster management application.
    
    Args:
        api_url: Cluster API base URL
        ws_url: WebSocket server URL
    """
    app = ClusterManagementApp(api_url=api_url, ws_url=ws_url)
    app.run()


if __name__ == "__main__":
    import sys
    
    # Parse arguments
    api_url = "http://localhost:8080"
    ws_url = "ws://localhost:8080"
    
    if len(sys.argv) > 1:
        api_url = sys.argv[1]
    if len(sys.argv) > 2:
        ws_url = sys.argv[2]
    
    run_cluster_app(api_url=api_url, ws_url=ws_url)

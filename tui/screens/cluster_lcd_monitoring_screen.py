"""
Cluster LCD Monitoring TUI Screen

Screen 9: Monitor LCD displays from all cluster nodes with:
- Cluster-wide event feed
- Per-node LCD status
- Node health information
- Critical alerts
"""

import asyncio
from typing import Dict, List, Optional
from datetime import datetime
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.console import Console

from app.lcd_models.lcd_event import LCDEvent, EventType, EventSeverity


class ClusterLCDMonitoringScreen:
    """
    TUI screen for monitoring LCD displays across all cluster nodes.
    """
    
    def __init__(self, lcd_manager):
        self.lcd_manager = lcd_manager
        self.console = Console()
        
        # Display state
        self.selected_node: Optional[str] = None
        self.history_page = 0
        self.events_per_page = 15
        self.auto_refresh = True
        self.refresh_rate = 2  # seconds
        
    async def render(self):
        """Render the full cluster monitoring screen"""
        self.console.clear()
        
        # Title
        title = Text("CLUSTER LCD MONITORING", style="bold cyan")
        self.console.print(title)
        
        # Cluster event feed
        await self._render_cluster_events()
        
        # Node status
        await self._render_node_status()
        
        # Critical alerts
        await self._render_critical_alerts()
        
        # Controls
        self._render_controls()
    
    async def _render_cluster_events(self):
        """Render cluster-wide event feed"""
        all_events = self.lcd_manager.get_all_recent_events(50)
        
        table = Table(
            title=f"[bold]CLUSTER EVENT FEED[/bold] ({len(all_events)} events)",
            show_header=True
        )
        table.add_column("Time", style="cyan", width=10)
        table.add_column("Node", style="yellow", width=18)
        table.add_column("Type", style="magenta", width=10)
        table.add_column("Severity", width=10)
        table.add_column("Message", width=45)
        
        for event in all_events[:self.events_per_page]:
            time_str = event.timestamp.strftime("%H:%M:%S")
            
            # Node indicator
            if event.source_node == self.lcd_manager.node_label:
                node_text = f"[green]{event.source_node}[/green]"
            else:
                node_text = f"[yellow]{event.source_node}[/yellow]"
            
            # Severity color
            severity_style = {
                EventSeverity.INFO: "green",
                EventSeverity.WARNING: "yellow",
                EventSeverity.ERROR: "red",
                EventSeverity.CRITICAL: "bold red"
            }.get(event.severity, "white")
            
            severity_text = event.severity.value.upper()
            
            table.add_row(
                time_str,
                node_text,
                event.event_type.value,
                Text(severity_text, style=severity_style),
                f"{event.icon} {event.message[:40]}"
            )
        
        self.console.print(table)
    
    async def _render_node_status(self):
        """Render status of all active nodes"""
        active_nodes = self.lcd_manager.remote_aggregator.get_active_nodes()
        active_nodes.append(self.lcd_manager.node_label)  # Include self
        active_nodes = list(set(active_nodes))
        
        table = Table(title="[bold]AUDIO NODES[/bold]", show_header=True)
        table.add_column("Node ID", style="yellow", width=18)
        table.add_column("Status", width=12)
        table.add_column("Last Event", style="cyan", width=12)
        table.add_column("Events", width=8)
        table.add_column("CPU", width=6)
        table.add_column("Memory", width=6)
        
        for node_id in sorted(active_nodes):
            # Check if local or remote
            if node_id == self.lcd_manager.node_label:
                status_text = Text("✓ LOCAL", style="green bold")
                is_local = True
            else:
                # Check if connected
                is_connected = self.lcd_manager.event_router.is_connected_to(node_id)
                status_text = Text("✓ ONLINE" if is_connected else "⚠ OFFLINE", 
                                  style="green" if is_connected else "yellow")
                is_local = False
            
            # Get last event time
            if is_local:
                events = self.lcd_manager.get_recent_local_events(1)
            else:
                events = self.lcd_manager.remote_aggregator.get_events_by_node(node_id, 1)
            
            last_event_str = events[0].timestamp.strftime("%H:%M:%S") if events else "—"
            
            # Event count
            if is_local:
                event_count = len(self.lcd_manager.get_recent_local_events(100))
            else:
                event_count = len(self.lcd_manager.remote_aggregator.get_events_by_node(node_id, 100))
            
            table.add_row(
                node_id,
                status_text,
                last_event_str,
                str(event_count),
                "—",  # CPU placeholder
                "—"   # Memory placeholder
            )
        
        self.console.print(table)
    
    async def _render_critical_alerts(self):
        """Render critical alerts from cluster"""
        critical_events = self.lcd_manager.remote_aggregator.get_critical_alerts(10)
        
        if not critical_events:
            self.console.print("[green]✓ No critical alerts[/green]")
            return
        
        table = Table(title="[bold red]CRITICAL ALERTS[/bold red]", show_header=True)
        table.add_column("Time", style="red", width=10)
        table.add_column("Node", style="yellow", width=18)
        table.add_column("Alert", width=50)
        
        for event in critical_events[:5]:
            time_str = event.timestamp.strftime("%H:%M:%S")
            table.add_row(
                time_str,
                event.source_node[:18],
                f"{event.icon} {event.title}: {event.message[:40]}"
            )
        
        self.console.print(table)
    
    def _render_controls(self):
        """Render control hints"""
        controls = """
[dim]Controls:[/dim]
  [N] Select Node | [H] History | [F] Filters | [R] Refresh
  [S] Statistics | [↑↓] Scroll | [Q] Back | [ESC] Exit
  [SPACE] Auto-refresh: [{'ON' if self.auto_refresh else 'OFF'}]
"""
        self.console.print(controls)
    
    async def handle_input(self, key: str):
        """Handle keyboard input"""
        if key.lower() == 'n':
            await self._select_node()
        elif key.lower() == 'h':
            await self._show_history()
        elif key.lower() == 'f':
            await self._show_filters()
        elif key.lower() == 'r':
            # Re-render immediately
            await self.render()
            return True
        elif key.lower() == 's':
            await self._show_statistics()
        elif key == 'ArrowUp':
            if self.history_page > 0:
                self.history_page -= 1
        elif key == 'ArrowDown':
            self.history_page += 1
        elif key == ' ':
            self.auto_refresh = not self.auto_refresh
        elif key.lower() == 'q':
            return False
        
        return True
    
    async def _select_node(self):
        """Select a specific node to monitor"""
        active_nodes = self.lcd_manager.remote_aggregator.get_active_nodes()
        active_nodes.append(self.lcd_manager.node_label)
        
        self.console.print("[cyan]Select node:[/cyan]")
        for i, node in enumerate(sorted(set(active_nodes)), 1):
            marker = ">" if node == self.selected_node else " "
            self.console.print(f"  {marker} [{i}] {node}")
        
        # TODO: Implement node selection
    
    async def _show_history(self):
        """Show event history for selected node"""
        if self.selected_node:
            events = self.lcd_manager.remote_aggregator.get_events_by_node(self.selected_node, 50)
            self.console.print(f"[cyan]History for {self.selected_node}:[/cyan]")
            self.console.print(f"  {len(events)} events in history")
        else:
            self.console.print("[yellow]Select a node first[/yellow]")
        
        await asyncio.sleep(1)
    
    async def _show_filters(self):
        """Show filter options"""
        self.console.print("""[cyan]Filter Options:[/cyan]
  [1] Info
  [2] Warning
  [3] Error
  [4] Critical
  [A] All events
  [Q] Back
""")
        # TODO: Implement filtering
    
    async def _show_statistics(self):
        """Show cluster statistics"""
        stats = {
            "local_events": len(self.lcd_manager.get_recent_local_events(100)),
            "remote_events": len(self.lcd_manager.get_recent_remote_events(100)),
            "active_nodes": len(self.lcd_manager.remote_aggregator.get_active_nodes()),
            "connected_peers": len(self.lcd_manager.event_router.get_connected_peers())
        }
        
        self.console.print("""[cyan]CLUSTER STATISTICS[/cyan]
""")
        
        table = Table(show_header=False)
        for key, value in stats.items():
            table.add_row(key.replace('_', ' ').title() + ":", str(value))
        
        self.console.print(table)
        await asyncio.sleep(2)

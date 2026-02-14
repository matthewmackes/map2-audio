"""
LCD Management TUI Screen

Screen 8: Local LCD management with:
- Live LCD preview (4x20 mockup)
- Event queue display
- Event filters
- Backlight control
- Event history browser
- Test event injection
"""

import asyncio
from typing import Optional, List
from datetime import datetime
from rich.panel import Panel
from rich.table import Table
from rich.progress import Progress, BarColumn, TextColumn
from rich.text import Text
from rich.console import Console

from app.lcd_models.lcd_event import LCDEvent, EventType, EventSeverity


class LCDManagementScreen:
    """
    TUI screen for managing local LCD display and events.
    """
    
    def __init__(self, lcd_manager):
        self.lcd_manager = lcd_manager
        self.console = Console()
        
        # Filter state
        self.show_local = True
        self.show_remote = True
        self.min_severity = EventSeverity.INFO
        self.selected_type: Optional[EventType] = None
        
        # Display state
        self.history_page = 0
        self.events_per_page = 10
        self.backlight_level = 100
        self.backlight_control_mode = False
        self.backlight_schedule_enabled = False
        
    async def render(self):
        """Render the full screen"""
        self.console.clear()
        
        # Title
        title = Text("LCD MANAGEMENT", style="bold cyan")
        node_label = Text(f"  {self.lcd_manager.node_label}", style="yellow")
        self.console.print(title + node_label)
        
        # Live LCD preview
        await self._render_lcd_preview()
        
        # Event queue
        await self._render_event_queue()
        
        # Filters
        self._render_filters()
        
        # Event history
        await self._render_event_history()
        
        # Controls
        self._render_controls()
    
    async def _render_lcd_preview(self):
        """Render live LCD display preview (4x20 mockup)"""
        # Get current LCD content
        current_event = self.lcd_manager.current_event
        
        if current_event:
            # Format display like physical LCD
            source = "[LOCAL]" if current_event.source_node == self.lcd_manager.node_label else "[REMOTE]"
            
            lines = [
                f"MAP2 - {self.lcd_manager.node_label[:14]}",
                f"{source} {current_event.icon} {current_event.title[:13]}",
                current_event.message[:20],
                current_event.timestamp.strftime("%H:%M:%S")
            ]
        else:
            lines = [
                f"MAP2 - {self.lcd_manager.node_label[:14]}",
                "No events",
                "Waiting...",
                ""
            ]
        
        # Create LCD panel with border
        lcd_content = "\n".join([f"│ {line:<20} │" for line in lines])
        lcd_box = f"""┌──────────────────────┐
{lcd_content}
└──────────────────────┘"""
        
        panel = Panel(lcd_box, title="[bold]LIVE LCD PREVIEW[/bold]", border_style="cyan")
        self.console.print(panel)
    
    async def _render_event_queue(self):
        """Render upcoming events in queue"""
        # Get recent events
        local_events = self.lcd_manager.get_recent_local_events(5)
        
        table = Table(title="[bold]EVENT QUEUE (Next 5)[/bold]", show_header=True)
        table.add_column("Time", style="cyan", width=8)
        table.add_column("Type", style="magenta", width=10)
        table.add_column("Title", style="white", width=30)
        table.add_column("Severity", width=10)
        
        for event in local_events:
            time_str = event.timestamp.strftime("%H:%M:%S")
            
            # Color by severity
            severity_style = {
                EventSeverity.INFO: "green",
                EventSeverity.WARNING: "yellow",
                EventSeverity.ERROR: "red",
                EventSeverity.CRITICAL: "bold red"
            }.get(event.severity, "white")
            
            severity_text = event.severity.value.upper()
            
            table.add_row(
                time_str,
                event.event_type.value,
                event.title[:30],
                Text(severity_text, style=severity_style)
            )
        
        self.console.print(table)
    
    def _render_filters(self):
        """Render filter controls"""
        filters_text = f"""
[cyan]Filters:[/cyan]
  [{'green' if self.show_local else 'dim'}]✓ Local[/] Events
  [{'green' if self.show_remote else 'dim'}]✓ Remote[/] Events
  Min Severity: {self.min_severity.value.upper()}
  Type: {self.selected_type.value if self.selected_type else 'All'}

[dim]Press: [F] to toggle filters | [S] for severity | [T] for type[/dim]
"""
        self.console.print(filters_text)
    
    async def _render_event_history(self):
        """Render event history with pagination"""
        all_events = self.lcd_manager.get_all_recent_events(100)
        
        # Apply filters
        filtered = all_events
        
        if not self.show_local:
            filtered = [e for e in filtered if e.source_node != self.lcd_manager.node_label]
        if not self.show_remote:
            filtered = [e for e in filtered if e.source_node == self.lcd_manager.node_label]
        if self.selected_type:
            filtered = [e for e in filtered if e.event_type == self.selected_type]
        
        # Paginate
        start = self.history_page * self.events_per_page
        end = start + self.events_per_page
        page_events = filtered[start:end]
        
        table = Table(
            title=f"[bold]EVENT HISTORY[/bold] (Page {self.history_page + 1})",
            show_header=True
        )
        table.add_column("Time", style="cyan", width=10)
        table.add_column("Source", style="yellow", width=15)
        table.add_column("Type", style="magenta", width=10)
        table.add_column("Severity", width=10)
        table.add_column("Message", width=40)
        
        for event in page_events:
            time_str = event.timestamp.strftime("%H:%M:%S")
            source = event.source_node[:13]
            
            severity_style = {
                EventSeverity.INFO: "green",
                EventSeverity.WARNING: "yellow",
                EventSeverity.ERROR: "red",
                EventSeverity.CRITICAL: "bold red"
            }.get(event.severity, "white")
            
            severity_text = event.severity.value.upper()
            
            table.add_row(
                time_str,
                source,
                event.event_type.value,
                Text(severity_text, style=severity_style),
                event.message[:40]
            )
        
        self.console.print(table)
    
    def _render_controls(self):
        """Render control hints"""
        controls = """
[dim]Controls:[/dim]
  [H] History | [F] Filters | [B] Backlight | [D] Dismiss All
  [T] Test Event | [↑↓] Pages | [Q] Back | [ESC] Exit
"""
        self.console.print(controls)
    
    async def handle_input(self, key: str):
        """Handle keyboard input"""
        if self.backlight_control_mode:
            return await self._handle_backlight_input(key)

        if key.lower() == 'h':
            await self._show_history_details()
        elif key.lower() == 'f':
            await self._toggle_filters()
        elif key.lower() == 'b':
            await self._control_backlight()
        elif key.lower() == 'd':
            await self._dismiss_all_events()
        elif key.lower() == 't':
            await self._send_test_event()
        elif key == 'ArrowUp':
            if self.history_page > 0:
                self.history_page -= 1
        elif key == 'ArrowDown':
            self.history_page += 1
        elif key.lower() == 'q':
            return False
        
        return True
    
    async def _show_history_details(self):
        """Show detailed event history"""
        events = self.lcd_manager.get_all_recent_events(200)
        start = self.history_page * self.events_per_page
        page_events = events[start:start + self.events_per_page]
        table = Table(
            title=f"[bold]DETAILED EVENT HISTORY[/bold] (page {self.history_page + 1})",
            show_header=True,
        )
        table.add_column("Timestamp", style="cyan", width=19)
        table.add_column("Node", style="yellow", width=16)
        table.add_column("Type", style="magenta", width=10)
        table.add_column("Severity", width=9)
        table.add_column("Title", width=20)
        for event in page_events:
            table.add_row(
                event.timestamp.strftime("%Y-%m-%d %H:%M:%S"),
                event.source_node[:16],
                event.event_type.value,
                event.severity.value.upper(),
                event.title[:20],
            )
        self.console.print(table)
        await asyncio.sleep(0.9)
    
    async def _toggle_filters(self):
        """Toggle filter options"""
        self.show_local = not self.show_local
        self.show_remote = not self.show_remote
    
    async def _control_backlight(self):
        """Control LCD backlight"""
        self.backlight_control_mode = True
        self.console.print("[cyan]Backlight Control:[/cyan]")
        self.console.print(f"  Current: {self.backlight_level}%")
        self.console.print(
            "  [1-9] Set brightness | [+/-] Adjust | [0] Off | [S] Toggle schedule | [Q] Back"
        )

    async def _handle_backlight_input(self, key: str) -> bool:
        """Handle input when backlight control is active."""
        k = key.lower()
        if k == "q":
            self.backlight_control_mode = False
            return True

        if key in "123456789":
            self.backlight_level = int(key) * 10
            await self._apply_backlight()
            return True

        if key == "0":
            self.backlight_level = 0
            await self._apply_backlight()
            return True

        if key == "+":
            self.backlight_level = min(100, self.backlight_level + 10)
            await self._apply_backlight()
            return True

        if key == "-":
            self.backlight_level = max(0, self.backlight_level - 10)
            await self._apply_backlight()
            return True

        if k == "s":
            self.backlight_schedule_enabled = not self.backlight_schedule_enabled
            status = "enabled" if self.backlight_schedule_enabled else "disabled"
            self.console.print(f"[cyan]Backlight schedule {status}[/cyan]")
            return True

        return True

    async def _apply_backlight(self):
        """Apply selected backlight level to LCD."""
        await self.lcd_manager.lcd.set_backlight(self.backlight_level)
        self.console.print(f"[green]Backlight set to {self.backlight_level}%[/green]")
    
    async def _dismiss_all_events(self):
        """Dismiss all events from queue"""
        self.console.print("[yellow]Clearing event queue...[/yellow]")
        # Clear display queue
        while not self.lcd_manager.display_queue.empty():
            try:
                self.lcd_manager.display_queue.get_nowait()
            except:
                break
        await asyncio.sleep(0.5)
    
    async def _send_test_event(self):
        """Send a test event"""
        from app.lcd_models.lcd_event import LCDEvent
        import uuid
        
        test_event = LCDEvent(
            event_id=str(uuid.uuid4()),
            timestamp=datetime.now(),
            source_node=self.lcd_manager.node_label,
            event_type=EventType.USER,
            severity=EventSeverity.INFO,
            title="TEST EVENT",
            message="This is a test event from TUI",
            icon="✓",
            color="green",
            broadcast=True
        )
        
        await self.lcd_manager.publish_event(test_event)
        self.console.print("[green]Test event sent![/green]")
        await asyncio.sleep(1)

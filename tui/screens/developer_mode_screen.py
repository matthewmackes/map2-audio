"""
Developer Mode Screen
====================
TUI screen for toggling between DEVELOPMENT and STAGE modes.

Features:
- Toggle button for mode switching
- Real-time status display (services, memory, VM settings)
- Build command helpers with copy functionality
- Clear warnings about service stoppage
"""

import asyncio
import logging
from textual.app import ComposeResult
from textual.widgets import Static, Label, Button, DataTable, Markdown
from textual.containers import Vertical, Horizontal, Container
from textual.binding import Binding
from textual.reactive import reactive
from textual.message import Message

from ..base_screen import BaseScreen
from ..dev_mode import dev_mode_manager, DevModeStatus

logger = logging.getLogger(__name__)


class ModeToggleWidget(Static):
    """Widget for toggling between DEV and STAGE modes."""
    
    DEFAULT_CSS = """
    ModeToggleWidget {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $accent;
        padding: 1 2;
        margin: 1 0;
    }
    
    .mode-title {
        text-style: bold;
        text-align: center;
        color: $text;
        margin: 0 0 1 0;
    }
    
    .current-mode {
        text-align: center;
        margin: 1 0;
    }
    
    .dev-mode {
        background: $error;
        color: $text;
        text-style: bold;
        padding: 1 2;
    }
    
    .stage-mode {
        background: $success;
        color: $text;
        text-style: bold;
        padding: 1 2;
    }
    
    .toggle-button {
        width: 100%;
        margin: 1 0;
    }
    
    .warning-box {
        background: $warning-darken-2;
        color: $text;
        border: solid $warning;
        padding: 1 2;
        margin: 1 0;
    }
    """
    
    current_mode: reactive[str] = reactive("STAGE")
    
    def compose(self) -> ComposeResult:
        yield Label("🔧 DEVELOPER MODE CONTROL", classes="mode-title")
        
        with Container():
            yield Label("Current Mode:", id="mode-label")
            yield Label("STAGE MODE", id="current-mode", classes="current-mode stage-mode")
            yield Button("Switch to DEVELOPMENT MODE", id="toggle-button", classes="toggle-button", variant="error")
        
        yield Markdown(
            """
**⚠️ WARNING: Development Mode Impact**

When DEVELOPMENT MODE is enabled:
- 🔴 Backend service will be **STOPPED**
- 🔴 Frontend service will be **STOPPED** 
- 💾 System memory will be optimized for builds
- ⚡ VM settings will be tuned for compilation performance
- 🛑 Web interface will be **UNAVAILABLE**

Only enable for JUCE builds, then switch back to STAGE MODE for normal operation.
            """,
            classes="warning-box"
        )
    
    def watch_current_mode(self, old_mode: str, new_mode: str) -> None:
        """Update UI when mode changes."""
        mode_label = self.query_one("#current-mode", Label)
        toggle_btn = self.query_one("#toggle-button", Button)
        
        if new_mode == "DEVELOPMENT":
            mode_label.update("🔴 DEVELOPMENT MODE")
            mode_label.remove_class("stage-mode")
            mode_label.add_class("dev-mode")
            toggle_btn.label = "Switch to STAGE MODE"
            toggle_btn.variant = "success"
        else:
            mode_label.update("🟢 STAGE MODE")
            mode_label.remove_class("dev-mode") 
            mode_label.add_class("stage-mode")
            toggle_btn.label = "Switch to DEVELOPMENT MODE"
            toggle_btn.variant = "error"
    
    def update_mode(self, is_dev_mode: bool) -> None:
        """Update the displayed mode."""
        self.current_mode = "DEVELOPMENT" if is_dev_mode else "STAGE"
    
    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle toggle button press."""
        if event.button.id == "toggle-button":
            # Disable button during operation
            event.button.disabled = True
            event.button.label = "Switching..."
            
            try:
                success, message = await dev_mode_manager.toggle_mode()
                
                if success:
                    self.app.notify(message, severity="information", timeout=5)
                    # Update mode will happen via refresh from parent
                else:
                    self.app.notify(f"Error: {message}", severity="error", timeout=8)
                
                # Post message to parent to refresh status
                self.post_message(self.ModeToggled())
                
            finally:
                event.button.disabled = False
    
    class ModeToggled(Message):
        """Message sent when mode is toggled."""
        pass


class SystemStatusWidget(Static):
    """Widget showing detailed system status."""
    
    DEFAULT_CSS = """
    SystemStatusWidget {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $primary;
        padding: 1 2;
        margin: 1 0;
    }
    
    .status-title {
        text-style: bold;
        color: $accent;
        margin: 0 0 1 0;
    }
    
    #status-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    
    .running {
        color: $success;
        text-style: bold;
    }
    
    .stopped {
        color: $error;
        text-style: bold;
    }
    """
    
    def compose(self) -> ComposeResult:
        yield Label("📊 SYSTEM STATUS", classes="status-title")
        yield DataTable(id="status-table")
    
    def on_mount(self) -> None:
        """Initialize the status table."""
        table = self.query_one("#status-table", DataTable)
        table.add_columns("Component", "Status", "Details")
        
        # Add initial rows
        table.add_row("Backend", "Loading...", "-")
        table.add_row("Frontend", "Loading...", "-")
        table.add_row("Memory Used", "Loading...", "-")
        table.add_row("Swappiness", "Loading...", "-")
        table.add_row("Dirty Ratio", "Loading...", "-")
        table.add_row("CPU Cores", "Loading...", "-")
    
    def update_status(self, status: DevModeStatus) -> None:
        """Update the status table with fresh data."""
        table = self.query_one("#status-table", DataTable)
        
        # Clear and rebuild table
        table.clear()
        table.add_columns("Component", "Status", "Details")
        
        # Backend status
        if status.backend_running:
            backend_status = f"🟢 RUNNING (PID: {status.backend_pid})" if status.backend_pid else "🟢 RUNNING"
        else:
            backend_status = "🔴 STOPPED"
        table.add_row("Backend", backend_status, f"Port 8080")
        
        # Frontend status  
        if status.frontend_running:
            frontend_status = f"🟢 RUNNING (PID: {status.frontend_pid})" if status.frontend_pid else "🟢 RUNNING"
        else:
            frontend_status = "🔴 STOPPED"
        table.add_row("Frontend", frontend_status, f"Port 3000")
        
        # Memory info
        if status.memory_total_gb > 0:
            memory_pct = (status.memory_used_mb / (status.memory_total_gb * 1024)) * 100
            memory_detail = f"{status.memory_used_mb}MB / {status.memory_total_gb}GB ({memory_pct:.1f}%)"
        else:
            memory_detail = f"{status.memory_used_mb}MB"
        table.add_row("Memory Used", memory_detail, "")
        
        # VM Settings
        swappiness_status = "🔴 Optimized" if status.swappiness <= 1 else "🟢 Normal"
        table.add_row("Swappiness", f"{status.swappiness}", swappiness_status)
        
        dirty_status = "🔴 Optimized" if status.dirty_ratio >= 40 else "🟢 Normal" 
        table.add_row("Dirty Ratio", f"{status.dirty_ratio}%", dirty_status)
        
        # CPU info
        table.add_row("CPU Cores", str(status.cpu_cores), f"Optimal -j{status.optimal_jobs}")
        
        if status.error:
            table.add_row("❌ Error", status.error, "Check logs")


class BuildCommandsWidget(Static):
    """Widget showing recommended build commands."""
    
    DEFAULT_CSS = """
    BuildCommandsWidget {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $accent;
        padding: 1 2;
        margin: 1 0;
    }
    
    .commands-title {
        text-style: bold;
        color: $accent;
        margin: 0 0 1 0;
    }
    
    .command-box {
        background: $surface;
        color: $text;
        border: solid $primary;
        padding: 1 2;
        margin: 1 0;
        text-style: bold;
    }
    
    .command-label {
        color: $text-muted;
        margin: 0 0 1 0;
    }
    """
    
    def compose(self) -> ComposeResult:
        yield Label("🔨 RECOMMENDED BUILD COMMANDS", classes="commands-title")
        
        yield Label("Standard build (when in DEV MODE):", classes="command-label")
        yield Label("nice -n -10 make -j5", id="std-command", classes="command-box")
        
        yield Label("With I/O priority:", classes="command-label")
        yield Label("nice -n -10 ionice -c2 -n0 make -j5", id="io-command", classes="command-box")
        
        yield Label("JUCE-specific build:", classes="command-label")
        yield Label("cd juce-engine/build && nice -n -10 make -j5", id="juce-command", classes="command-box")
    
    def update_commands(self, status: DevModeStatus) -> None:
        """Update commands with optimal job count."""
        jobs = status.optimal_jobs or 4
        
        self.query_one("#std-command", Label).update(f"nice -n -10 make -j{jobs}")
        self.query_one("#io-command", Label).update(f"nice -n -10 ionice -c2 -n0 make -j{jobs}")
        self.query_one("#juce-command", Label).update(f"cd juce-engine/build && nice -n -10 make -j{jobs}")


class DeveloperModeScreen(BaseScreen):
    """
    Developer Mode Screen - Toggle between DEVELOPMENT and STAGE modes.
    
    DEVELOPMENT MODE:
    - Stops backend/frontend services
    - Optimizes system for build performance
    - Frees memory for compilation
    
    STAGE MODE:
    - Normal operation with all services running
    - Web interface available
    - Regular system settings
    """
    
    BINDINGS = [
        Binding("r", "refresh", "Refresh", show=True),
        Binding("enter", "toggle_mode", "Toggle Mode", show=True),
        Binding("t", "toggle_mode", "Toggle Mode", show=True),
        Binding("b", "show_build_help", "Build Help", show=True),
    ]
    
    screen_name = "DeveloperModeScreen"
    
    def __init__(self, api_client=None, **kwargs):
        super().__init__(api_client=api_client, **kwargs)
        self._current_status: Optional[DevModeStatus] = None
        
    def compose(self) -> ComposeResult:
        """Compose the developer mode screen."""
        with Vertical():
            yield ModeToggleWidget(id="mode-toggle")
            yield SystemStatusWidget(id="system-status")
            yield BuildCommandsWidget(id="build-commands")
    
    async def on_mount(self) -> None:
        """Initialize screen and start data refresh."""
        # Set refresh interval
        from ..polling_config import get_polling_interval
        self.set_interval(get_polling_interval('general'), self._refresh_status)  # 7s non-disruptive polling
        
        # Initial refresh
        await self._refresh_status()
    
    async def _refresh_status(self) -> None:
        """Refresh system status."""
        try:
            status = await dev_mode_manager.get_status()
            self._current_status = status
            
            # Update all widgets
            self.query_one("#mode-toggle", ModeToggleWidget).update_mode(status.is_dev_mode)
            self.query_one("#system-status", SystemStatusWidget).update_status(status)
            self.query_one("#build-commands", BuildCommandsWidget).update_commands(status)
            
        except Exception as e:
            logger.error(f"Failed to refresh developer mode status: {e}")
            self.app.notify(f"Status refresh error: {e}", severity="warning", timeout=5)
    
    async def action_refresh(self) -> None:
        """Handle refresh action."""
        self.app.notify("Refreshing developer mode status...", severity="information", timeout=2)
        await self._refresh_status()
    
    async def action_toggle_mode(self) -> None:
        """Handle mode toggle action."""
        # Trigger the toggle button
        toggle_widget = self.query_one("#mode-toggle", ModeToggleWidget)
        button = toggle_widget.query_one("#toggle-button", Button)
        await toggle_widget.on_button_pressed(Button.Pressed(button))
    
    async def action_show_build_help(self) -> None:
        """Show build help information."""
        if self._current_status:
            help_text = f"""
# Build Commands Help

## Current System Status
- Mode: {'DEVELOPMENT' if self._current_status.is_dev_mode else 'STAGE'}
- CPU Cores: {self._current_status.cpu_cores}
- Optimal Jobs: {self._current_status.optimal_jobs}
- Memory: {self._current_status.memory_used_mb}MB used

## Recommended Commands

### Standard Build
```
{dev_mode_manager.get_build_command()}
```

### With I/O Priority  
```
{dev_mode_manager.get_build_command_with_ionice()}
```

### JUCE Project
```
cd juce-engine/build
{dev_mode_manager.get_build_command()}
```

## Development Mode Benefits
- Backend/Frontend stopped (frees ~400-600MB)
- Swappiness reduced to 1 (minimal swapping)
- Dirty ratio increased to 40% (more write buffering)
- Background services paused
- Caches dropped for maximum available memory

## Important Notes
- Always return to STAGE MODE after building
- Web interface unavailable in DEV MODE  
- Services auto-restart when returning to STAGE MODE
            """
            
            self.app.push_screen("help", content=help_text)
        else:
            self.app.notify("Status not loaded yet", severity="warning", timeout=3)
    
    async def on_mode_toggle_widget_mode_toggled(self, event: ModeToggleWidget.ModeToggled) -> None:
        """Handle mode toggle completion."""
        # Refresh status after mode change
        await self._refresh_status()
    
    def get_state(self) -> dict:
        """Get current screen state."""
        return {
            "last_refresh": self._last_update,
            "current_mode": self._current_status.is_dev_mode if self._current_status else False
        }
    
    def restore_state(self, state: dict) -> None:
        """Restore screen state."""
        self._last_update = state.get("last_refresh")
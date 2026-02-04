"""
Mode Indicator Widget
====================
Global widget that appears on every screen showing current mode (DEV/STAGE).

Features:
- Compact display in top-left corner
- Red background for DEV MODE  
- Green/neutral background for STAGE MODE
- Auto-refreshes to stay current
- Clickable to quickly navigate to Developer Mode screen
"""

import asyncio
import logging
from textual.widgets import Static, Label
from textual.reactive import reactive
from textual.binding import Binding

from ..dev_mode import dev_mode_manager

logger = logging.getLogger(__name__)


class ModeIndicatorWidget(Static):
    """
    Compact mode indicator widget for header display.
    
    Shows current operating mode:
    - DEV MODE: Red background, indicates services stopped
    - STAGE MODE: Normal background, indicates normal operation
    """
    
    DEFAULT_CSS = """
    ModeIndicatorWidget {
        width: auto;
        height: auto;
        min-width: 12;
        background: $panel;
        border: solid $primary;
        padding: 0 1;
        margin: 0 1 0 0;
    }
    
    .mode-indicator {
        text-style: bold;
        text-align: center;
        padding: 0 1;
    }
    
    .dev-mode {
        background: $error;
        color: $text;
        text-style: bold;
        border: solid $error;
    }
    
    .stage-mode {
        background: $success-darken-1;
        color: $text;
        text-style: bold;
        border: solid $success;
    }
    
    .loading-mode {
        background: $warning-darken-2;
        color: $text;
        text-style: dim;
        border: solid $warning;
    }
    
    .error-mode {
        background: $error-darken-2;
        color: $text-muted;
        text-style: dim;
        border: solid $error-darken-1;
    }
    
    ModeIndicatorWidget:hover {
        border: solid $accent;
        opacity: 0.8;
    }
    """
    
    current_mode: reactive[str] = reactive("LOADING")
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.id = "mode-indicator"
        self._refresh_task: Optional[asyncio.Task] = None
        
    def compose(self):
        yield Label("LOADING", id="mode-label", classes="mode-indicator loading-mode")
    
    async def on_mount(self) -> None:
        """Start periodic refresh when mounted."""
        # Initial check
        await self._refresh_mode()
        
        # Set up periodic refresh (every 5 seconds)
        self.set_interval(5.0, self._refresh_mode)
    
    async def _refresh_mode(self) -> None:
        """Refresh current mode status."""
        try:
            # Quick sync check - don't block the UI
            is_dev = dev_mode_manager.is_dev_mode()
            new_mode = "DEVELOPMENT" if is_dev else "STAGE"
            
            if new_mode != self.current_mode and self.current_mode != "LOADING":
                # Mode changed, notify
                logger.debug(f"Mode changed from {self.current_mode} to {new_mode}")
            
            self.current_mode = new_mode
            
        except Exception as e:
            logger.warning(f"Failed to refresh mode indicator: {e}")
            self.current_mode = "ERROR"
    
    def watch_current_mode(self, old_mode: str, new_mode: str) -> None:
        """Update display when mode changes."""
        label = self.query_one("#mode-label", Label)
        
        # Remove all mode classes
        label.remove_class("dev-mode")
        label.remove_class("stage-mode") 
        label.remove_class("loading-mode")
        label.remove_class("error-mode")
        
        if new_mode == "DEVELOPMENT":
            label.update("🔴 DEV MODE")
            label.add_class("dev-mode")
        elif new_mode == "STAGE":
            label.update("🟢 STAGE")
            label.add_class("stage-mode")
        elif new_mode == "LOADING":
            label.update("LOADING")
            label.add_class("loading-mode")
        elif new_mode == "ERROR":
            label.update("ERROR")
            label.add_class("error-mode")
    
    async def on_click(self) -> None:
        """Handle click to navigate to Developer Mode screen."""
        # Try to navigate to the developer mode tab
        # This assumes the app has a way to switch to tab 10 (index for Developer Mode)
        try:
            if hasattr(self.app, 'show_tab'):
                await self.app.show_tab(10)  # Assuming Developer Mode is tab 10
            elif hasattr(self.app, 'action_goto_tab_10'):
                await self.app.action_goto_tab_10()
        except Exception as e:
            logger.debug(f"Could not navigate to developer mode: {e}")
            self.app.notify("Navigate to Developer Mode tab manually", severity="information", timeout=3)
    
    def force_refresh(self) -> None:
        """Force an immediate refresh of the mode status."""
        asyncio.create_task(self._refresh_mode())
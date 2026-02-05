"""
Mode Indicator Widget
====================
Global widget that appears on every screen showing current deployment mode.

Features:
- Displays deployment mode: DEVELOPER, AUDIO-NODE, CONTROL-NODE, etc.
- Color-coded by mode type
- Auto-refreshes to stay current
- Clickable to quickly navigate to Developer Mode screen
"""

import asyncio
import logging
import os
from typing import Optional
from textual.widgets import Static, Label
from textual.reactive import reactive
from textual.binding import Binding

from ..dev_mode import dev_mode_manager

logger = logging.getLogger(__name__)


class ModeIndicatorWidget(Static):
    """
    Deployment mode indicator widget for header display.
    
    Shows current deployment mode from MAP2_DEPLOYMENT_MODE:
    - DEVELOPER: Red background, development environment
    - AUDIO-NODE: Blue background, audio processing node
    - CONTROL-NODE: Green background, control/monitoring node
    - Other: Gray background, other deployment types
    """
    
    DEFAULT_CSS = """
    ModeIndicatorWidget {
        width: auto;
        height: auto;
        min-width: 16;
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
    
    .developer-mode {
        background: $error;
        color: $text;
        text-style: bold;
        border: solid $error;
    }
    
    .audio-node-mode {
        background: $accent;
        color: $text;
        text-style: bold;
        border: solid $accent;
    }
    
    .control-node-mode {
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
    
    .other-mode {
        background: $panel-lighten-1;
        color: $text;
        text-style: bold;
        border: solid $primary;
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
        """Refresh current deployment mode status."""
        try:
            # Get deployment mode from environment variable
            deployment_mode = os.getenv("MAP2_DEPLOYMENT_MODE", "UNKNOWN").upper()
            
            if deployment_mode != self.current_mode and self.current_mode != "LOADING":
                logger.debug(f"Deployment mode changed from {self.current_mode} to {deployment_mode}")
            
            self.current_mode = deployment_mode
            
        except Exception as e:
            logger.warning(f"Failed to refresh mode indicator: {e}")
            self.current_mode = "ERROR"
    
    def watch_current_mode(self, old_mode: str, new_mode: str) -> None:
        """Update display when mode changes."""
        label = self.query_one("#mode-label", Label)
        
        # Remove all mode classes
        label.remove_class("developer-mode")
        label.remove_class("audio-node-mode")
        label.remove_class("control-node-mode")
        label.remove_class("loading-mode")
        label.remove_class("error-mode")
        label.remove_class("other-mode")
        
        if new_mode == "DEVELOPER":
            label.update("🔴 DEVELOPER")
            label.add_class("developer-mode")
        elif new_mode == "AUDIO-NODE":
            label.update("🔵 AUDIO-NODE")
            label.add_class("audio-node-mode")
        elif new_mode == "CONTROL-NODE":
            label.update("🟢 CONTROL-NODE")
            label.add_class("control-node-mode")
        elif new_mode == "LOADING":
            label.update("⏳ LOADING")
            label.add_class("loading-mode")
        elif new_mode == "ERROR":
            label.update("❌ ERROR")
            label.add_class("error-mode")
        else:
            # Other deployment modes
            label.update(f"▪ {new_mode}")
            label.add_class("other-mode")
    
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
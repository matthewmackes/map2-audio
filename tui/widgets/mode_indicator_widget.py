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
from typing import Optional, Dict, Any
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
        self._health_status: Dict[str, Any] = {}
        self._deployment_status: Dict[str, Any] = {}
        
    def compose(self):
        yield Label("LOADING", id="mode-label", classes="mode-indicator loading-mode")
    
    async def on_mount(self) -> None:
        """Start periodic refresh when mounted."""
        # Initial check
        await self._refresh_mode()
        
        # Set up periodic refresh (every 5 seconds)
        self.set_interval(5.0, self._refresh_mode)
    
    async def _refresh_mode(self) -> None:
        """Refresh current deployment mode status and cluster health."""
        try:
            deployment_mode = None

            # Prefer API if available
            if hasattr(self.app, "api_client") and self.app.api_client:
                if hasattr(self.app.api_client, "get_deployment_mode"):
                    result = await self.app.api_client.get_deployment_mode()
                    if getattr(result, "success", False) and result.data:
                        deployment_mode = result.data.get("mode")

                # Fetch health and deployment status
                if hasattr(self.app.api_client, "get_health_status"):
                    health_result = await self.app.api_client.get_health_status()
                    if getattr(health_result, "success", False) and health_result.data:
                        self._health_status = health_result.data

                if hasattr(self.app.api_client, "get_deployment_status"):
                    deploy_result = await self.app.api_client.get_deployment_status()
                    if getattr(deploy_result, "success", False) and deploy_result.data:
                        self._deployment_status = deploy_result.data

            # Fallback to environment variable
            if not deployment_mode:
                deployment_mode = os.getenv("MAP2_DEPLOYMENT_MODE", "UNKNOWN")

            deployment_mode = self._normalize_mode(str(deployment_mode).upper())

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
        
        # Build status string
        status_text = self._build_status_text(new_mode)
        
        if new_mode in ("DEVELOPER", "DEVELOPMENT"):
            label.update(f"🔴 {status_text}")
            label.add_class("developer-mode")
        elif new_mode == "AUDIO-NODE":
            label.update(f"🔵 {status_text}")
            label.add_class("audio-node-mode")
        elif new_mode == "CONTROL-NODE":
            label.update(f"🟢 {status_text}")
            label.add_class("control-node-mode")
        elif new_mode == "ALL-IN-ONE":
            label.update(f"🟣 {status_text}")
            label.add_class("other-mode")
        elif new_mode == "LOADING":
            label.update("⏳ LOADING")
            label.add_class("loading-mode")
        elif new_mode == "ERROR":
            label.update("❌ ERROR")
            label.add_class("error-mode")
        else:
            # Other deployment modes
            label.update(f"▪ {status_text}")
            label.add_class("other-mode")
    
    def _build_status_text(self, mode: str) -> str:
        """Build status text with health and service info."""
        status_parts = [mode]
        
        # Add health status
        if self._health_status:
            overall = self._health_status.get("overall_status", "unknown")
            passed = self._health_status.get("checks_passed", 0)
            failed = self._health_status.get("checks_failed", 0)
            
            if overall == "healthy":
                status_parts.append(f"[green]✓{passed}[/green]")
            elif overall == "degraded":
                warned = self._health_status.get("checks_warned", 0)
                status_parts.append(f"[yellow]⚠{warned}[/yellow]")
            elif overall == "unhealthy":
                status_parts.append(f"[red]✗{failed}[/red]")
        
        # Add service count
        if self._deployment_status and isinstance(self._deployment_status, dict):
            services = self._deployment_status.get("services", [])
            running = sum(1 for s in services if s.get("status") == "running")
            if services:
                status_parts.append(f"[blue]{running}/{len(services)}svc[/blue]")
        
        return " ".join(status_parts)

    @staticmethod
    def _normalize_mode(mode: str) -> str:
        """Normalize deployment mode tokens."""
        if not mode:
            return "UNKNOWN"
        mode = mode.upper().replace("_", "-")
        if mode == "ALL-IN-ONE" or mode == "ALLINONE":
            return "ALL-IN-ONE"
        if mode == "DEVELOPMENT":
            return "DEVELOPER"
        return mode
    
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
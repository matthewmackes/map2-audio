"""
MAP2 Node Console — Main Textual Application.

This is the top-level TUI app.  It owns:
  • Header + Footer  (Anaconda-style)
  • TabbedContent with six tabs
  • Background timer for periodic status refresh
  • Keyboard bindings for tab switching, refresh, quit
  • Modal confirmation flows for dangerous actions
"""

from __future__ import annotations

import asyncio
import logging
import os
import socket
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.timer import Timer
from textual.widgets import (
    Button,
    Footer,
    Header,
    Label,
    Static,
    TabbedContent,
    TabPane,
)

from . import __app_name__, __version__
from .api_client import NodeAPIClient
from .collectors import collect_snapshot
from .models import NodeSnapshot
from .modals.confirm import ConfirmModal, ProgressModal
from .screens.audio import AudioPane
from .screens.cluster import ClusterPane
from .screens.dashboard import DashboardPane
from .screens.help import HelpPane
from .screens.logs import LogsPane
from .screens.node_actions import NodeActionsPane

logger = logging.getLogger(__name__)

# Path to the CSS theme file (sibling of this module)
CSS_PATH = str(Path(__file__).parent / "theme.tcss")


class NodeConsoleApp(App):
    """MAP2 Audio Node Console — professional headless TUI."""

    TITLE = __app_name__
    SUB_TITLE = socket.gethostname()
    CSS_PATH = "theme.tcss"

    # ── Key bindings ─────────────────────────────────────────────────
    BINDINGS = [
        Binding("q", "quit", "Quit", priority=True),
        Binding("f1", "show_tab('help')", "Help", show=True),
        Binding("f5", "force_refresh", "Refresh", show=True),
        Binding("d", "show_tab('dashboard')", "Dashboard", show=False),
        Binding("a", "show_tab('audio')", "Audio", show=False),
        Binding("c", "show_tab('cluster')", "Cluster", show=False),
        Binding("m", "show_tab('actions')", "Mode", show=False),
        Binding("l", "show_tab('logs')", "Logs", show=False),
        Binding("r", "force_refresh", "Refresh", show=False),
        Binding("1", "show_tab('dashboard')", "Tab 1", show=False),
        Binding("2", "show_tab('audio')", "Tab 2", show=False),
        Binding("3", "show_tab('cluster')", "Tab 3", show=False),
        Binding("4", "show_tab('actions')", "Tab 4", show=False),
        Binding("5", "show_tab('logs')", "Tab 5", show=False),
        Binding("6", "show_tab('help')", "Tab 6", show=False),
    ]

    # ── Configuration ────────────────────────────────────────────────
    REFRESH_INTERVAL: float = 5.0  # seconds between auto-refresh
    API_BASE_URL: str = os.getenv("MAP2_API_URL", "http://localhost:8080")

    def __init__(self, api_url: Optional[str] = None, no_color: bool = False) -> None:
        super().__init__()
        if api_url:
            self.API_BASE_URL = api_url
        self._api = NodeAPIClient(base_url=self.API_BASE_URL)
        self._snapshot: Optional[NodeSnapshot] = None
        self._refresh_timer: Optional[Timer] = None
        self._refreshing: bool = False

    # ── Compose ──────────────────────────────────────────────────────

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)

        with TabbedContent(id="main-tabs"):
            with TabPane("Dashboard", id="dashboard"):
                yield DashboardPane(id="pane-dashboard")
            with TabPane("Audio", id="audio"):
                yield AudioPane(id="pane-audio")
            with TabPane("Cluster", id="cluster"):
                yield ClusterPane(id="pane-cluster")
            with TabPane("Mode & Actions", id="actions"):
                yield NodeActionsPane(id="pane-actions")
            with TabPane("Logs", id="logs"):
                yield LogsPane(id="pane-logs")
            with TabPane("Help", id="help"):
                yield HelpPane(id="pane-help")

        yield Footer()

    # ── Lifecycle ────────────────────────────────────────────────────

    async def on_mount(self) -> None:
        """Start the API client and periodic refresh timer."""
        await self._api.start()
        # Initial data fetch
        await self._do_refresh()
        # Periodic refresh
        self._refresh_timer = self.set_interval(
            self.REFRESH_INTERVAL, self._do_refresh, pause=False,
        )

    async def on_unmount(self) -> None:
        """Clean up resources."""
        if self._refresh_timer:
            self._refresh_timer.stop()
        await self._api.stop()

    # ── Refresh logic ────────────────────────────────────────────────

    async def _do_refresh(self) -> None:
        """Collect a fresh snapshot and push it to all panes."""
        if self._refreshing:
            return
        self._refreshing = True
        try:
            self._snapshot = await collect_snapshot(self._api)
            self._push_snapshot()
        except Exception as exc:
            logger.error("Refresh failed: %s", exc)
        finally:
            self._refreshing = False

    def _push_snapshot(self) -> None:
        """Send the current snapshot to all screen panes."""
        if not self._snapshot:
            return
        # Update header subtitle with live info
        mode_str = self._snapshot.mode.value.upper().replace("-", " ")
        health_icon = self._snapshot.health.icon
        self.sub_title = (
            f"{self._snapshot.hostname}  │  {mode_str}  │  "
            f"{health_icon} {self._snapshot.health.value.upper()}"
        )

        # Push to each pane
        for pane_id in ("pane-dashboard", "pane-audio", "pane-cluster", "pane-actions", "pane-logs", "pane-help"):
            try:
                pane = self.query_one(f"#{pane_id}")
                if hasattr(pane, "refresh_snapshot"):
                    pane.refresh_snapshot(self._snapshot)
            except Exception:
                pass

    # ── Actions ──────────────────────────────────────────────────────

    def action_show_tab(self, tab_id: str) -> None:
        """Switch to a named tab."""
        tabs = self.query_one("#main-tabs", TabbedContent)
        tabs.active = tab_id

    async def action_force_refresh(self) -> None:
        """Manual refresh triggered by F5 or 'r'."""
        await self._do_refresh()

    # ── Button event handlers ────────────────────────────────────────

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        btn_id = event.button.id

        # ── Audio / Pipewire restarts ────────────────────────────────
        if btn_id == "btn-restart-pw" or btn_id == "btn-restart-pw-act":
            confirmed = await self.push_screen_wait(
                ConfirmModal(
                    title="Restart Pipewire",
                    body="This will restart the Pipewire audio server.\nAudio will be interrupted briefly.",
                    confirm_label="Restart",
                )
            )
            if confirmed:
                self.notify("Restarting Pipewire…", severity="warning")
                result = await self._api.restart_pipewire()
                if result:
                    self.notify("Pipewire restarted.", severity="information")
                else:
                    self.notify("Pipewire restart failed!", severity="error")
                await self._do_refresh()

        elif btn_id == "btn-restart-audio" or btn_id == "btn-restart-audio-act":
            confirmed = await self.push_screen_wait(
                ConfirmModal(
                    title="Restart Audio Engine",
                    body="This will restart the JUCE audio engine.\nActive audio processing will stop momentarily.",
                    confirm_label="Restart",
                )
            )
            if confirmed:
                self.notify("Restarting audio engine…", severity="warning")
                result = await self._api.restart_audio()
                if result:
                    self.notify("Audio engine restarted.", severity="information")
                else:
                    self.notify("Audio restart failed!", severity="error")
                await self._do_refresh()

        elif btn_id == "btn-restart-backend":
            confirmed = await self.push_screen_wait(
                ConfirmModal(
                    title="Restart Backend",
                    body="This will restart the MAP2 backend service.\nAll API connections will be dropped.",
                    confirm_label="Restart",
                    danger=True,
                )
            )
            if confirmed:
                self.notify("Restarting backend…", severity="warning")
                await self._api.restart_backend()
                self.notify("Backend restart requested.", severity="information")

        elif btn_id == "btn-refresh-audio":
            await self._do_refresh()

        # ── Mode change ──────────────────────────────────────────────
        elif btn_id == "btn-apply-mode":
            actions_pane = self.query_one("#pane-actions", NodeActionsPane)
            new_mode = actions_pane.get_selected_mode()
            current = self._snapshot.mode.value if self._snapshot else "unknown"
            if new_mode == current:
                self.notify("Already in that mode.", severity="warning")
                return
            confirmed = await self.push_screen_wait(
                ConfirmModal(
                    title="Change Node Mode",
                    body=(
                        f"Change mode from [{current.upper()}] to [{new_mode.upper()}]?\n\n"
                        "This will reconfigure CPU isolation, systemd services,\n"
                        "and audio tuning.  The backend will restart."
                    ),
                    confirm_label="Apply",
                    danger=True,
                )
            )
            if confirmed:
                self.notify(f"Applying mode: {new_mode}…", severity="warning")
                result = await self._api.set_mode(new_mode)
                if result:
                    self.notify(f"Mode changed to {new_mode}.", severity="information")
                else:
                    self.notify("Mode change failed!", severity="error")
                await asyncio.sleep(2)
                await self._do_refresh()

        # ── System controls ──────────────────────────────────────────
        elif btn_id == "btn-reboot":
            confirmed = await self.push_screen_wait(
                ConfirmModal(
                    title="⚠  REBOOT SYSTEM",
                    body=(
                        "This will REBOOT the entire system.\n"
                        "All audio processing will stop.\n"
                        "All connections will be lost.\n\n"
                        "Are you absolutely sure?"
                    ),
                    confirm_label="REBOOT NOW",
                    cancel_label="Cancel",
                    danger=True,
                )
            )
            if confirmed:
                self.notify("Rebooting system…", severity="error")
                await self._api.restart_system()

        elif btn_id == "btn-shutdown":
            confirmed = await self.push_screen_wait(
                ConfirmModal(
                    title="⚠  SHUTDOWN SYSTEM",
                    body=(
                        "This will POWER OFF the system.\n"
                        "The node will go completely offline.\n"
                        "Physical access may be required to restart.\n\n"
                        "Are you absolutely sure?"
                    ),
                    confirm_label="SHUTDOWN NOW",
                    cancel_label="Cancel",
                    danger=True,
                )
            )
            if confirmed:
                self.notify("Shutting down…", severity="error")
                # Use subprocess for shutdown since there's no API endpoint
                import subprocess
                try:
                    subprocess.run(
                        ["sudo", "systemctl", "poweroff"],
                        timeout=5, check=False,
                    )
                except Exception:
                    self.notify("Shutdown command failed.", severity="error")

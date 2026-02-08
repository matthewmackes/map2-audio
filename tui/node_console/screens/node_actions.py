"""
Node Mode & Actions screen.

Provides:
  • Current mode display
  • Mode selector (All-in-One / Audio / Management) with confirmation
  • Service restart buttons
  • Reboot / Shutdown with confirmation modals
"""

from __future__ import annotations

from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widgets import Button, Label, RadioButton, RadioSet, Static

from ..models import NodeMode, NodeSnapshot


_MODE_DESCRIPTIONS = {
    NodeMode.ALL_IN_ONE: (
        "All-in-One: Audio processing + Web UI + management on the same machine.\n"
        "Target latency: 4–5 ms.  Suitable for single-node setups."
    ),
    NodeMode.AUDIO: (
        "Audio Node: Dedicated low-latency audio processor.\n"
        "Target latency: <3 ms.  CPU isolation & RT tuning active."
    ),
    NodeMode.MANAGEMENT: (
        "Management Node: Web UI & cluster management only.\n"
        "No audio processing on this node."
    ),
}


class NodeActionsPane(Static):
    """Node mode & actions tab content."""

    def compose(self) -> ComposeResult:
        # ── Current mode ─────────────────────────────────────────────
        with Vertical(classes="section-box"):
            yield Label("⬡ Current Node Mode", classes="section-title")
            yield Static("Loading…", id="actions-current-mode", classes="mode-current")

        # ── Mode selector ────────────────────────────────────────────
        with Vertical(classes="mode-selector"):
            yield Label("Change Mode", classes="section-title")
            yield Static(
                "Select a mode and press Apply.  A confirmation dialog will appear.",
            )
            with RadioSet(id="mode-radio-set"):
                yield RadioButton("All-in-One", id="radio-all-in-one", value=True)
                yield RadioButton("Audio Node", id="radio-audio")
                yield RadioButton("Management", id="radio-management")
            yield Static("", id="actions-mode-desc")
            yield Button("Apply Mode Change", id="btn-apply-mode", variant="warning")

        # ── Service controls ─────────────────────────────────────────
        with Vertical(classes="section-box"):
            yield Label("🔧 Service Controls", classes="section-title")
            with Horizontal(classes="action-bar"):
                yield Button("Restart Backend", id="btn-restart-backend", variant="primary")
                yield Button("Restart Audio", id="btn-restart-audio-act", variant="primary")
                yield Button("Restart Pipewire", id="btn-restart-pw-act", variant="primary")

        # ── System controls ──────────────────────────────────────────
        with Vertical(classes="section-box"):
            yield Label("⚡ System Controls", classes="section-title")
            yield Static(
                "[dim]These actions affect the entire system.  "
                "A confirmation dialog will appear before execution.[/dim]"
            )
            with Horizontal(classes="action-bar"):
                yield Button("Reboot", id="btn-reboot", variant="error", classes="btn-danger")
                yield Button("Shutdown", id="btn-shutdown", variant="error", classes="btn-danger")

    def on_mount(self) -> None:
        self._update_mode_description()

    def on_radio_set_changed(self, event: RadioSet.Changed) -> None:
        self._update_mode_description()

    def _update_mode_description(self) -> None:
        desc_w = self.query_one("#actions-mode-desc", Static)
        radio_set = self.query_one("#mode-radio-set", RadioSet)
        idx = radio_set.pressed_index
        modes = [NodeMode.ALL_IN_ONE, NodeMode.AUDIO, NodeMode.MANAGEMENT]
        if 0 <= idx < len(modes):
            desc_w.update(_MODE_DESCRIPTIONS.get(modes[idx], ""))

    def get_selected_mode(self) -> str:
        """Return the mode string selected in the radio set."""
        radio_set = self.query_one("#mode-radio-set", RadioSet)
        idx = radio_set.pressed_index
        mode_values = ["all-in-one", "audio", "management"]
        if 0 <= idx < len(mode_values):
            return mode_values[idx]
        return "all-in-one"

    def refresh_snapshot(self, snap: NodeSnapshot) -> None:
        mode_w = self.query_one("#actions-current-mode", Static)
        mode_display = snap.mode.value.upper().replace("-", " ")
        health_color = snap.health.color
        mode_w.update(
            f"[{health_color} bold]{snap.health.icon} {mode_display}[/{health_color} bold]  │  "
            f"Hostname: {snap.hostname}  │  "
            f"API: {'[green]Connected[/green]' if snap.api_reachable else '[red]Down[/red]'}"
        )

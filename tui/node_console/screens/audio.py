"""
Audio Status screen.

Displays detailed audio engine information:
  • Engine health & configuration
  • Input/output channels with levels
  • Latency breakdown
  • XRun counter
  • Recovery actions (restart Pipewire, restart audio, etc.)
"""

from __future__ import annotations

from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widgets import Button, DataTable, Label, Static

from ...table_sync import sync_table_rows
from ..models import (
    AudioEngineStatus,
    NodeSnapshot,
    PipewireStatus,
    ServiceState,
)


def _state_badge(state: ServiceState) -> str:
    if state == ServiceState.RUNNING:
        return "[green bold]● RUNNING[/green bold]"
    elif state == ServiceState.FAILED:
        return "[red bold]✖ FAILED[/red bold]"
    elif state == ServiceState.STOPPED:
        return "[dim]○ STOPPED[/dim]"
    return "[dim]? UNKNOWN[/dim]"


class AudioPane(Static):
    """Audio status tab content."""

    def compose(self) -> ComposeResult:
        # ── Engine overview ──────────────────────────────────────────
        with Vertical(classes="section-box"):
            yield Label("🔊 Audio Engine", classes="section-title")
            yield Static("Collecting…", id="audio-engine-info")

        # ── Pipewire details ─────────────────────────────────────────
        with Vertical(classes="section-box"):
            yield Label("🔗 Pipewire / JACK", classes="section-title")
            yield Static("Collecting…", id="audio-pw-info")

        # ── Channels table ───────────────────────────────────────────
        with Vertical(classes="section-box"):
            yield Label("📊 Audio Channels", classes="section-title")
            yield DataTable(id="audio-channels-table")

        # ── Recovery actions ─────────────────────────────────────────
        with Horizontal(classes="action-bar"):
            yield Button("Restart Pipewire", id="btn-restart-pw", variant="warning")
            yield Button("Restart Audio Engine", id="btn-restart-audio", variant="warning")
            yield Button("Refresh", id="btn-refresh-audio", variant="default")

    def on_mount(self) -> None:
        table = self.query_one("#audio-channels-table", DataTable)
        table.add_columns("Name", "Dir", "Format", "Rate", "State", "XRuns", "Peak dB")
        table.cursor_type = "none"
        table.zebra_stripes = True

    def refresh_snapshot(self, snap: NodeSnapshot) -> None:
        au = snap.audio
        pw = snap.pipewire

        # ── Engine info ──────────────────────────────────────────────
        engine_w = self.query_one("#audio-engine-info", Static)
        engine_w.update(
            f"State:        {_state_badge(au.state)}\n"
            f"Engine:       {au.engine_type}\n"
            f"Sample Rate:  {au.sample_rate} Hz\n"
            f"Buffer Size:  {au.buffer_size} frames\n"
            f"RT Latency:   {au.latency_ms:.2f} ms\n"
            f"XRuns:        {au.xruns}\n"
            f"Plugins:      {au.plugins_loaded}\n"
            f"NAM:          {'[green]Available[/green]' if au.nam_available else '[dim]Unavailable[/dim]'}\n"
            f"IR Conv:      {'[green]Available[/green]' if au.ir_available else '[dim]Unavailable[/dim]'}"
        )

        # ── Pipewire info ────────────────────────────────────────────
        pw_w = self.query_one("#audio-pw-info", Static)
        pw_w.update(
            f"State:        {_state_badge(pw.state)}\n"
            f"Sample Rate:  {pw.sample_rate} Hz\n"
            f"Quantum:      {pw.quantum}\n"
            f"Buffer:       {pw.buffer_size} frames\n"
            f"Latency:      {pw.latency_ms:.2f} ms\n"
            f"XRuns:        {pw.xruns}"
        )

        # ── Channels table ───────────────────────────────────────────
        table = self.query_one("#audio-channels-table", DataTable)
        if au.channels:
            sync_table_rows(
                table,
                [
                    (
                        ch.name,
                        ch.direction,
                        ch.format,
                        str(ch.sample_rate),
                        "[green]●[/green]" if ch.state == ServiceState.RUNNING else "[red]✖[/red]" if ch.state == ServiceState.FAILED else "[dim]○[/dim]",
                        str(ch.xruns),
                        f"[{'green' if ch.peak_db < -12 else 'yellow' if ch.peak_db < -3 else 'red'}]{ch.peak_db:.1f}[/{'green' if ch.peak_db < -12 else 'yellow' if ch.peak_db < -3 else 'red'}]",
                    )
                    for ch in au.channels
                ],
                row_keys=[f"channel-{ch.name}" for ch in au.channels],
                sort_columns=("Name",),
            )
        else:
            sync_table_rows(table, [("[dim]No channels detected[/dim]", "", "", "", "", "", "")], row_keys=["empty"])

"""
Dashboard screen — the default home view.

Shows at-a-glance:
  • Status banner (healthy / warning / critical)
  • Node identity (hostname, mode, uptime)
  • System resources (CPU, RAM, temp)
  • Network interfaces
  • Pipewire / Audio engine status
  • Services health
  • Recent events
"""

from __future__ import annotations

from textual.app import ComposeResult
from textual.containers import Horizontal, Vertical
from textual.widgets import DataTable, Label, Static

from ..models import (
    HealthLevel,
    NodeSnapshot,
    ServiceState,
)


def _fmt_uptime(seconds: float) -> str:
    """Format seconds into '3d 4h 12m'."""
    days = int(seconds // 86400)
    hours = int((seconds % 86400) // 3600)
    mins = int((seconds % 3600) // 60)
    parts = []
    if days:
        parts.append(f"{days}d")
    if hours:
        parts.append(f"{hours}h")
    parts.append(f"{mins}m")
    return " ".join(parts)


def _state_icon(state: ServiceState) -> str:
    icons = {
        ServiceState.RUNNING: "[green]●[/green]",
        ServiceState.STOPPED: "[dim]○[/dim]",
        ServiceState.FAILED: "[red]✖[/red]",
        ServiceState.UNKNOWN: "[dim]?[/dim]",
    }
    return icons.get(state, "?")


def _health_markup(level: HealthLevel) -> str:
    return f"[{level.color}]{level.icon} {level.value.upper()}[/{level.color}]"


class DashboardPane(Static):
    """The dashboard tab content.  Updated externally by the app."""

    def compose(self) -> ComposeResult:
        # ── Status banner ────────────────────────────────────────────
        yield Static(
            "○ Waiting for data…",
            id="dash-banner",
            classes="status-banner",
        )

        # ── Two-column grid ──────────────────────────────────────────
        with Horizontal(classes="dashboard-grid"):
            # Left column
            with Vertical(classes="section-box"):
                yield Label("⬡ Node Identity", classes="section-title")
                yield Static("", id="dash-identity")

            # Right column
            with Vertical(classes="section-box"):
                yield Label("⚙ System Resources", classes="section-title")
                yield Static("", id="dash-resources")

        with Horizontal(classes="dashboard-grid"):
            with Vertical(classes="section-box"):
                yield Label("🔊 Audio / Pipewire", classes="section-title")
                yield Static("", id="dash-audio")

            with Vertical(classes="section-box"):
                yield Label("🌐 Network", classes="section-title")
                yield Static("", id="dash-network")

        # ── Services table (full width) ──────────────────────────────
        with Vertical(classes="section-box dashboard-full-width"):
            yield Label("🔧 Services", classes="section-title")
            yield DataTable(id="dash-services-table")

        # ── Events (full width) ──────────────────────────────────────
        with Vertical(classes="section-box dashboard-full-width"):
            yield Label("📋 Recent Events", classes="section-title")
            yield Static("No events yet.", id="dash-events")

    def on_mount(self) -> None:
        table = self.query_one("#dash-services-table", DataTable)
        table.add_columns("Service", "Status", "State")
        table.cursor_type = "none"
        table.zebra_stripes = True

    def refresh_snapshot(self, snap: NodeSnapshot) -> None:
        """Update all dashboard widgets from a snapshot."""
        # ── Banner ───────────────────────────────────────────────────
        banner = self.query_one("#dash-banner", Static)
        health_text = _health_markup(snap.health)
        banner_class_map = {
            HealthLevel.HEALTHY: "status-banner status-banner-healthy",
            HealthLevel.WARNING: "status-banner status-banner-warning",
            HealthLevel.CRITICAL: "status-banner status-banner-critical",
        }
        banner.set_classes(
            banner_class_map.get(snap.health, "status-banner")
        )
        mode_display = snap.mode.value.upper().replace("-", " ")
        banner.update(
            f"{health_text}  │  {snap.hostname}  │  Mode: {mode_display}"
        )

        # ── Identity ─────────────────────────────────────────────────
        identity = self.query_one("#dash-identity", Static)
        api_status = "[green]● Connected[/green]" if snap.api_reachable else "[red]✖ Unreachable[/red]"
        identity.update(
            f"Hostname:   [bold]{snap.hostname}[/bold]\n"
            f"Mode:       [bold]{mode_display}[/bold]\n"
            f"Uptime:     {_fmt_uptime(snap.uptime_seconds)}\n"
            f"API:        {api_status}\n"
            f"Version:    {snap.api_version or 'n/a'}\n"
            f"Services:   {snap.services_running}/{snap.services_total} running"
        )

        # ── Resources ────────────────────────────────────────────────
        resources = self.query_one("#dash-resources", Static)
        cpu_color = "green" if snap.cpu.percent < 70 else "yellow" if snap.cpu.percent < 90 else "red"
        mem_color = "green" if snap.memory.percent < 70 else "yellow" if snap.memory.percent < 90 else "red"
        temp_str = f"{snap.temperature.cpu_temp_c:.0f}°C" if snap.temperature.cpu_temp_c else "n/a"
        temp_color = "green"
        if snap.temperature.cpu_temp_c:
            if snap.temperature.cpu_temp_c > 80:
                temp_color = "red"
            elif snap.temperature.cpu_temp_c > 65:
                temp_color = "yellow"

        resources.update(
            f"CPU:        [{cpu_color}]{snap.cpu.percent:5.1f}%[/{cpu_color}]  "
            f"({snap.cpu.core_count} cores, gov: {snap.cpu.governor})\n"
            f"Load:       {snap.cpu.load_avg_1:.2f} / {snap.cpu.load_avg_5:.2f} / {snap.cpu.load_avg_15:.2f}\n"
            f"RAM:        [{mem_color}]{snap.memory.percent:5.1f}%[/{mem_color}]  "
            f"({snap.memory.used_mb:.0f} / {snap.memory.total_mb:.0f} MB)\n"
            f"Swap:       {snap.memory.swap_percent:.1f}%\n"
            f"Temp:       [{temp_color}]{temp_str}[/{temp_color}]\n"
            f"Isolated:   {snap.cpu.isolated_cores or 'none'}"
        )

        # ── Audio / Pipewire ─────────────────────────────────────────
        audio_w = self.query_one("#dash-audio", Static)
        pw = snap.pipewire
        au = snap.audio
        pw_icon = _state_icon(pw.state)
        au_icon = _state_icon(au.state)
        xrun_color = "green" if au.xruns < 10 else "yellow" if au.xruns < 100 else "red"
        audio_w.update(
            f"Pipewire:   {pw_icon}  {pw.sample_rate} Hz / {pw.buffer_size} frames "
            f"({pw.latency_ms:.1f} ms)\n"
            f"Engine:     {au_icon}  {au.engine_type}  "
            f"({au.sample_rate} Hz / {au.buffer_size} buf)\n"
            f"Latency:    {au.latency_ms:.1f} ms round-trip\n"
            f"XRuns:      [{xrun_color}]{au.xruns}[/{xrun_color}]\n"
            f"Plugins:    {au.plugins_loaded} loaded\n"
            f"NAM / IR:   {'✓' if au.nam_available else '✗'} / {'✓' if au.ir_available else '✗'}"
        )

        # ── Network ──────────────────────────────────────────────────
        net_w = self.query_one("#dash-network", Static)
        if snap.network_interfaces:
            lines = []
            for iface in snap.network_interfaces[:6]:
                icon = "[green]▲[/green]" if iface.is_up else "[red]▼[/red]"
                ip = iface.ipv4 or "no ip"
                speed = f"{iface.speed_mbps}M" if iface.speed_mbps else ""
                lines.append(f"{icon} {iface.name:<12} {ip:<16} {speed}")
            net_w.update("\n".join(lines))
        else:
            net_w.update("[dim]No interfaces detected[/dim]")

        # ── Services table ───────────────────────────────────────────
        table = self.query_one("#dash-services-table", DataTable)
        table.clear()
        for svc in snap.services:
            icon = _state_icon(svc.state)
            table.add_row(svc.name, icon, svc.state.value)

        # ── Events ───────────────────────────────────────────────────
        events_w = self.query_one("#dash-events", Static)
        if snap.collector_errors:
            lines = [f"[red]⚠ {e}[/red]" for e in snap.collector_errors[-5:]]
            events_w.update("\n".join(lines))
        elif snap.recent_events:
            events_w.update("\n".join(snap.recent_events[-8:]))
        else:
            events_w.update("[dim]No recent events.[/dim]")

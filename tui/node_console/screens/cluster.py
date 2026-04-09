"""
Cluster & Distribution screen.

Shows:
  • Cluster membership overview
  • Peer node list with health / latency
  • Audio flows between nodes
  • Clock synchronisation status
"""

from __future__ import annotations

from textual.app import ComposeResult
from textual.containers import Vertical
from textual.widgets import DataTable, Label, Static

from ...table_sync import sync_table_rows
from ..models import ClusterStatus, HealthLevel, NodeSnapshot


class ClusterPane(Static):
    """Cluster status tab content."""

    def compose(self) -> ComposeResult:
        # ── Overview ─────────────────────────────────────────────────
        with Vertical(classes="section-box"):
            yield Label("🌐 Cluster Overview", classes="section-title")
            yield Static("Collecting…", id="cluster-overview")

        # ── Peer nodes ───────────────────────────────────────────────
        with Vertical(classes="section-box cluster-section"):
            yield Label("🖥  Peer Nodes", classes="section-title")
            yield DataTable(id="cluster-peers-table")

        # ── Audio flows ──────────────────────────────────────────────
        with Vertical(classes="section-box cluster-section"):
            yield Label("🔀 Audio Flows", classes="section-title")
            yield DataTable(id="cluster-flows-table")

        # ── Clock sync ───────────────────────────────────────────────
        with Vertical(classes="section-box"):
            yield Label("🕐 Clock Synchronisation", classes="section-title")
            yield Static("", id="cluster-clock")

    def on_mount(self) -> None:
        # Peer table
        pt = self.query_one("#cluster-peers-table", DataTable)
        pt.add_columns("Node ID", "Hostname", "IP", "Mode", "Health", "Latency")
        pt.cursor_type = "none"
        pt.zebra_stripes = True

        # Flows table
        ft = self.query_one("#cluster-flows-table", DataTable)
        ft.add_columns("Flow", "Source", "Dest", "Channel", "Latency", "Loss %", "Drops", "Sync")
        ft.cursor_type = "none"
        ft.zebra_stripes = True

    def refresh_snapshot(self, snap: NodeSnapshot) -> None:
        cl = snap.cluster

        # ── Overview ─────────────────────────────────────────────────
        ov = self.query_one("#cluster-overview", Static)
        if cl.enabled:
            ov.update(
                f"Status:     [green bold]ENABLED[/green bold]\n"
                f"Peers:      {cl.peer_count}\n"
                f"Flows:      {len(cl.flows)}\n"
                f"Manager Δ:  {cl.manager_latency_ms:.1f} ms"
            )
        else:
            ov.update(
                "[dim]Cluster mode is disabled.\n"
                "This node operates in standalone / all-in-one mode.\n"
                "Enable clustering via Node Mode & Actions.[/dim]"
            )

        # ── Peers ────────────────────────────────────────────────────
        pt = self.query_one("#cluster-peers-table", DataTable)
        if cl.peers:
            sync_table_rows(
                pt,
                [
                    (
                        peer.node_id[:16],
                        peer.hostname,
                        peer.ip,
                        peer.mode,
                        {
                            HealthLevel.HEALTHY: "[green]●[/green]",
                            HealthLevel.WARNING: "[yellow]▲[/yellow]",
                            HealthLevel.CRITICAL: "[red]✖[/red]",
                        }.get(peer.health, "[dim]○[/dim]"),
                        f"[{'green' if peer.latency_ms < 5 else 'yellow' if peer.latency_ms < 20 else 'red'}]{peer.latency_ms:.1f} ms[/{'green' if peer.latency_ms < 5 else 'yellow' if peer.latency_ms < 20 else 'red'}]",
                    )
                    for peer in cl.peers
                ],
                row_keys=[peer.node_id for peer in cl.peers],
                sort_columns=("Hostname",),
            )
        else:
            sync_table_rows(pt, [("[dim]No peers discovered[/dim]", "", "", "", "", "")], row_keys=["empty-peers"])

        # ── Flows ────────────────────────────────────────────────────
        ft = self.query_one("#cluster-flows-table", DataTable)
        if cl.flows:
            sync_table_rows(
                ft,
                [
                    (
                        flow.flow_id[:12],
                        flow.source_node[:12],
                        flow.dest_node[:12],
                        flow.channel_name,
                        f"{flow.latency_ms:.1f} ms",
                        f"[{'green' if flow.packet_loss < 0.1 else 'yellow' if flow.packet_loss < 1 else 'red'}]{flow.packet_loss:.2f}%[/{'green' if flow.packet_loss < 0.1 else 'yellow' if flow.packet_loss < 1 else 'red'}]",
                        str(flow.drop_count),
                        "[green]✓[/green]" if flow.sync_state == "synced" else "[yellow]~[/yellow]",
                    )
                    for flow in cl.flows
                ],
                row_keys=[flow.flow_id for flow in cl.flows],
                sort_columns=("Flow",),
            )
        else:
            sync_table_rows(ft, [("[dim]No active flows[/dim]", "", "", "", "", "", "", "")], row_keys=["empty-flows"])

        # ── Clock ────────────────────────────────────────────────────
        clk = self.query_one("#cluster-clock", Static)
        sync_icon = "[green]● Synced[/green]" if cl.clock_synced else "[yellow]▲ Not synced[/yellow]"
        clk.update(
            f"Source:  {cl.clock_source}\n"
            f"Status:  {sync_icon}"
        )

"""
AVB/TSN Monitoring Tab for Textual TUI

Displays AVB network status, streams, and PTP synchronization.
Only appears when AVB is available. Gracefully hides when disabled.
"""

import asyncio
from datetime import datetime
from typing import Dict, List, Optional

from textual.app import ComposeResult
from textual.containers import Container, Horizontal, Vertical
from textual.widgets import Static, DataTable, Label
from textual.reactive import reactive

from tui.api_client import APIClient


class AvbStatusWidget(Static):
    """Widget showing AVB overall status"""

    status_text = reactive("")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.border_title = "AVB/TSN Status"

    def compose(self) -> ComposeResult:
        yield Label(self.status_text)

    def watch_status_text(self, new_text: str) -> None:
        """Update label when status text changes"""
        label = self.query_one(Label)
        label.update(new_text)

    def update_status(self, status: Dict) -> None:
        """Update status display from API data"""
        if not status.get("enabled"):
            self.status_text = "[yellow]AVB Disabled in Configuration[/yellow]"
            self.border_subtitle = "Disabled"
            return

        if not status.get("available"):
            reason = status.get("reason", "Unknown")
            self.status_text = f"[red]AVB Unavailable[/red]\nReason: {reason}"
            self.border_subtitle = "Unavailable"
            return

        interface = status.get("interface", "N/A")
        ptp = status.get("ptp", {})
        ptp_status = ptp.get("available", False)

        lines = [
            f"[green]AVB Enabled & Available[/green]",
            f"Interface: [cyan]{interface}[/cyan]",
            f"PTP Sync: [{'green' if ptp_status else 'yellow'}]{'Synced' if ptp_status else 'Unsynced'}[/]",
        ]

        if ptp_status and "offset_ns" in ptp:
            offset = ptp["offset_ns"]
            lines.append(f"PTP Offset: [cyan]{offset:.1f}ns[/cyan]")

        self.status_text = "\n".join(lines)
        self.border_subtitle = "Active"

    def on_mount(self) -> None:
        """Set default styling"""
        self.styles.border = ("solid", "green")
        self.styles.height = "auto"
        self.styles.padding = (1, 2)


class PtpStatusWidget(Static):
    """Widget showing PTP synchronization details"""

    ptp_text = reactive("")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.border_title = "IEEE 802.1AS gPTP"

    def compose(self) -> ComposeResult:
        yield Label(self.ptp_text)

    def watch_ptp_text(self, new_text: str) -> None:
        """Update label when PTP text changes"""
        label = self.query_one(Label)
        label.update(new_text)

    def update_ptp(self, ptp: Dict) -> None:
        """Update PTP display from API data"""
        if not ptp.get("available"):
            error = ptp.get("error", "Unknown error")
            self.ptp_text = f"[yellow]PTP Not Available[/yellow]\n{error}"
            self.border_subtitle = "Unavailable"
            return

        state = ptp.get("state", "UNKNOWN")
        offset_ns = ptp.get("offset_ns", 0.0)
        delay_ns = ptp.get("mean_path_delay_ns", 0.0)
        gm_id = ptp.get("grandmaster_id", "N/A")

        # Color offset based on magnitude
        offset_color = "green" if abs(offset_ns) < 100 else "yellow" if abs(offset_ns) < 500 else "red"

        lines = [
            f"State: [cyan]{state}[/cyan]",
            f"Offset: [{offset_color}]{offset_ns:.1f}ns[/]",
            f"Path Delay: [cyan]{delay_ns:.1f}ns[/cyan]",
            f"Grandmaster: [dim]{gm_id[:16]}...[/dim]" if len(gm_id) > 16 else f"Grandmaster: [dim]{gm_id}[/dim]",
        ]

        self.ptp_text = "\n".join(lines)
        self.border_subtitle = state

    def on_mount(self) -> None:
        """Set default styling"""
        self.styles.border = ("solid", "cyan")
        self.styles.height = "auto"
        self.styles.padding = (1, 2)


class TsnStatusWidget(Static):
    """Widget showing TSN qdisc configuration"""

    tsn_text = reactive("")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.border_title = "TSN Traffic Shaping"

    def compose(self) -> ComposeResult:
        yield Label(self.tsn_text)

    def watch_tsn_text(self, new_text: str) -> None:
        """Update label when TSN text changes"""
        label = self.query_one(Label)
        label.update(new_text)

    def update_tsn(self, tsn: Dict) -> None:
        """Update TSN display from API data"""
        if not tsn.get("available"):
            error = tsn.get("error", "TSN not configured")
            self.tsn_text = f"[yellow]TSN Not Configured[/yellow]\n{error}"
            self.border_subtitle = "Not Configured"
            return

        interface = tsn.get("interface", "N/A")
        mqprio = tsn.get("mqprio_configured", False)
        cbs = tsn.get("cbs_configured", False)
        etf = tsn.get("etf_configured", False)
        vlan = tsn.get("vlan_configured", False)

        lines = [
            f"Interface: [cyan]{interface}[/cyan]",
            f"mqprio (802.1Qbv): [{'green' if mqprio else 'red'}]{'✓' if mqprio else '✗'}[/]",
            f"CBS (802.1Qav): [{'green' if cbs else 'red'}]{'✓' if cbs else '✗'}[/]",
            f"ETF: [{'green' if etf else 'red'}]{'✓' if etf else '✗'}[/]",
            f"VLAN 2: [{'green' if vlan else 'red'}]{'✓' if vlan else '✗'}[/]",
        ]

        if cbs and "cbs_idleslope" in tsn:
            idleslope_mbps = tsn["cbs_idleslope"] / 1_000_000
            lines.append(f"CBS Idleslope: [cyan]{idleslope_mbps:.1f} Mbps[/cyan]")

        self.tsn_text = "\n".join(lines)
        self.border_subtitle = "Configured"

    def on_mount(self) -> None:
        """Set default styling"""
        self.styles.border = ("solid", "yellow")
        self.styles.height = "auto"
        self.styles.padding = (1, 2)


class StreamsTable(Static):
    """Table showing active AVB streams"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.border_title = "Active Streams"

    def compose(self) -> ComposeResult:
        table = DataTable()
        table.add_columns("Stream ID", "Direction", "State", "Channels", "Sample Rate")
        table.cursor_type = "row"
        yield table

    def update_streams(self, streams: List[Dict]) -> None:
        """Update table with stream data"""
        table = self.query_one(DataTable)
        table.clear()

        if not streams:
            table.border_subtitle = "No Streams"
            return

        for stream in streams:
            stream_id = stream.get("stream_id", "N/A")
            direction = stream.get("direction", "N/A")
            state = stream.get("state", "N/A")
            channels = stream.get("channels", 0)
            sample_rate = stream.get("sample_rate", 0)

            # Color code state
            state_color = {
                "running": "green",
                "starting": "yellow",
                "stopping": "yellow",
                "stopped": "dim",
                "error": "red",
            }.get(state, "white")

            # Color code direction
            direction_display = f"[cyan]{direction}[/cyan]" if direction == "talker" else f"[magenta]{direction}[/magenta]"

            table.add_row(
                stream_id[:16],
                direction_display,
                f"[{state_color}]{state}[/]",
                str(channels),
                f"{sample_rate} Hz",
            )

        table.border_subtitle = f"{len(streams)} stream(s)"

    def on_mount(self) -> None:
        """Set default styling"""
        self.styles.border = ("solid", "blue")
        self.styles.height = 12


class DiscoveryTable(Static):
    """Table showing discovered AVB nodes"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.border_title = "Discovered Nodes (mDNS)"

    def compose(self) -> ComposeResult:
        table = DataTable()
        table.add_columns("Node ID", "Hostname", "IP Address", "PTP", "Streams")
        table.cursor_type = "row"
        yield table

    def update_discovery(self, discovery: Dict) -> None:
        """Update table with discovery data"""
        table = self.query_one(DataTable)
        table.clear()

        if not discovery.get("enabled"):
            table.border_subtitle = "Discovery Disabled"
            return

        nodes = discovery.get("nodes", [])
        if not nodes:
            table.border_subtitle = "No Nodes Discovered"
            return

        for node in nodes:
            node_id = node.get("node_id", "N/A")
            hostname = node.get("hostname", "N/A")
            addresses = node.get("addresses", [])
            ip_addr = addresses[0] if addresses else "N/A"

            caps = node.get("avb_capabilities", {})
            ptp_synced = caps.get("ptp_synced", False)
            total_streams = caps.get("talker_streams", 0) + caps.get("listener_streams", 0)

            table.add_row(
                node_id[:16],
                hostname,
                ip_addr,
                f"[{'green' if ptp_synced else 'red'}]{'✓' if ptp_synced else '✗'}[/]",
                str(total_streams),
            )

        table.border_subtitle = f"{len(nodes)} node(s)"

    def on_mount(self) -> None:
        """Set default styling"""
        self.styles.border = ("solid", "magenta")
        self.styles.height = 10


class AvbTab(Container):
    """
    AVB/TSN Monitoring Tab

    Displays comprehensive AVB network information.
    Hides itself completely if AVB is not available.
    """

    def __init__(self, api_client: APIClient, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.api_client = api_client
        self.update_task: Optional[asyncio.Task] = None

    def compose(self) -> ComposeResult:
        """Compose the AVB tab layout"""
        with Vertical():
            # Top row: Status widgets
            with Horizontal():
                yield AvbStatusWidget(id="avb-status")
                yield PtpStatusWidget(id="ptp-status")
                yield TsnStatusWidget(id="tsn-status")

            # Middle: Streams table
            yield StreamsTable(id="streams-table")

            # Bottom: Discovery table
            yield DiscoveryTable(id="discovery-table")

    async def on_mount(self) -> None:
        """Check AVB availability and start updates"""
        # Check if AVB is available
        try:
            status = await self.api_client.get("/api/avb/status")
            if not status.get("enabled") or not status.get("available"):
                # AVB not available - hide this tab
                self.display = False
                return
        except Exception:
            # Error checking AVB - hide this tab
            self.display = False
            return

        # AVB is available - start periodic updates
        self.update_task = asyncio.create_task(self.update_loop())

    async def on_unmount(self) -> None:
        """Cancel update task when unmounting"""
        if self.update_task:
            self.update_task.cancel()
            try:
                await self.update_task
            except asyncio.CancelledError:
                pass

    async def update_loop(self) -> None:
        """Periodically fetch and update AVB data"""
        while True:
            try:
                await self.update_data()
            except Exception as e:
                # Log error but continue trying
                pass

            await asyncio.sleep(5)  # Update every 5 seconds

    async def update_data(self) -> None:
        """Fetch latest AVB data from API and update widgets"""
        try:
            # Fetch all data in parallel
            status_task = self.api_client.get("/api/avb/status")
            ptp_task = self.api_client.get("/api/avb/ptp/status")
            tsn_task = self.api_client.get("/api/avb/tsn/status")
            streams_task = self.api_client.get("/api/avb/streams")
            discovery_task = self.api_client.get("/api/avb/discovery")

            status, ptp, tsn, streams_resp, discovery = await asyncio.gather(
                status_task, ptp_task, tsn_task, streams_task, discovery_task,
                return_exceptions=True
            )

            # Update widgets (only if data fetch succeeded)
            if isinstance(status, dict):
                self.query_one("#avb-status", AvbStatusWidget).update_status(status)

            if isinstance(ptp, dict):
                self.query_one("#ptp-status", PtpStatusWidget).update_ptp(ptp)

            if isinstance(tsn, dict):
                self.query_one("#tsn-status", TsnStatusWidget).update_tsn(tsn)

            if isinstance(streams_resp, dict):
                streams = streams_resp.get("streams", [])
                self.query_one("#streams-table", StreamsTable).update_streams(streams)

            if isinstance(discovery, dict):
                self.query_one("#discovery-table", DiscoveryTable).update_discovery(discovery)

        except Exception as e:
            # If AVB becomes unavailable, hide the tab
            if "503" in str(e) or "404" in str(e):
                self.display = False

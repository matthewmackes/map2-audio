"""
AVB Status Widget for Cluster Dashboards

Optional widget that displays AVB/TSN status when available.
Gracefully hides when AVB is disabled or unavailable.
"""

from textual.widgets import Static, Label
from textual.reactive import reactive
from typing import Dict, Optional


class AvbStatusIndicator(Static):
    """
    Small AVB status indicator for cluster node displays.

    Shows:
    - AVB enabled/disabled status
    - PTP sync status
    - Active stream count
    - TSN configuration status

    Hides completely when AVB unavailable.
    """

    status_text = reactive("")
    is_available = reactive(False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.border_title = "AVB/TSN"

    def compose(self):
        yield Label(self.status_text)

    def watch_status_text(self, new_text: str) -> None:
        """Update label when status changes"""
        label = self.query_one(Label)
        label.update(new_text)

    def watch_is_available(self, available: bool) -> None:
        """Show/hide widget based on availability"""
        self.display = available

    def update_from_node_metadata(self, metadata: Dict) -> None:
        """
        Update AVB status from cluster node metadata.

        Args:
            metadata: ClusterNodeMetadata dict with AVB fields
        """
        # Check if AVB is enabled
        avb_enabled = metadata.get("avb_enabled", False)
        if not avb_enabled:
            self.is_available = False
            return

        self.is_available = True

        # Extract AVB data
        interface = metadata.get("avb_interface", "N/A")
        ptp_synced = metadata.get("avb_ptp_synced", False)
        ptp_offset_ns = metadata.get("avb_ptp_offset_ns", 0.0)
        tsn_configured = metadata.get("avb_tsn_configured", False)
        streams = metadata.get("avb_streams", [])

        # Count streams by direction
        talker_count = sum(1 for s in streams if s.get("direction") == "talker")
        listener_count = sum(1 for s in streams if s.get("direction") == "listener")

        # Build status text
        lines = []

        # Interface line
        lines.append(f"IF: [cyan]{interface}[/cyan]")

        # PTP status line
        if ptp_synced:
            offset_color = "green" if abs(ptp_offset_ns) < 100 else "yellow"
            lines.append(f"PTP: [{offset_color}]✓ {ptp_offset_ns:.0f}ns[/]")
        else:
            lines.append("PTP: [red]✗ Not synced[/]")

        # TSN status line
        tsn_indicator = "[green]✓[/]" if tsn_configured else "[dim]✗[/]"
        lines.append(f"TSN: {tsn_indicator}")

        # Streams line
        if talker_count > 0 or listener_count > 0:
            lines.append(f"Streams: [cyan]{talker_count}T/{listener_count}L[/cyan]")
        else:
            lines.append("Streams: [dim]None[/dim]")

        self.status_text = "\n".join(lines)

        # Update border color based on health
        if ptp_synced and tsn_configured:
            self.styles.border = ("solid", "green")
            self.border_subtitle = "Healthy"
        elif ptp_synced or tsn_configured:
            self.styles.border = ("solid", "yellow")
            self.border_subtitle = "Partial"
        else:
            self.styles.border = ("solid", "red")
            self.border_subtitle = "Degraded"

    def update_from_avb_status(self, status: Dict) -> None:
        """
        Update AVB status from /api/avb/status endpoint.

        Args:
            status: AVB status response dict
        """
        # Check if AVB is available
        if not status.get("enabled") or not status.get("available"):
            self.is_available = False
            return

        self.is_available = True

        # Extract data
        interface = status.get("interface", "N/A")
        ptp = status.get("ptp", {})
        ptp_available = ptp.get("available", False)
        ptp_offset = ptp.get("offset_ns", 0.0)

        # Build status text
        lines = []
        lines.append(f"IF: [cyan]{interface}[/cyan]")

        if ptp_available:
            offset_color = "green" if abs(ptp_offset) < 100 else "yellow"
            ptp_state = ptp.get("state", "UNKNOWN")
            lines.append(f"PTP: [{offset_color}]{ptp_state}[/]")
            lines.append(f"Offset: [{offset_color}]{ptp_offset:.0f}ns[/]")
        else:
            lines.append("PTP: [red]Unavailable[/]")

        self.status_text = "\n".join(lines)

        # Set border color
        if ptp_available:
            self.styles.border = ("solid", "green")
            self.border_subtitle = "Active"
        else:
            self.styles.border = ("solid", "yellow")
            self.border_subtitle = "Degraded"

    def on_mount(self) -> None:
        """Set default styling"""
        self.styles.border = ("solid", "dim")
        self.styles.height = "auto"
        self.styles.padding = (1, 1)
        self.styles.min_width = 20
        self.display = False  # Hidden by default until data loaded


class AvbStreamsSummary(Static):
    """
    Compact AVB streams summary widget.

    Shows stream count and health indicators.
    Can be embedded in cluster dashboards.
    """

    summary_text = reactive("")
    is_available = reactive(False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.border_title = "AVB Streams"

    def compose(self):
        yield Label(self.summary_text)

    def watch_summary_text(self, new_text: str) -> None:
        """Update label when summary changes"""
        label = self.query_one(Label)
        label.update(new_text)

    def watch_is_available(self, available: bool) -> None:
        """Show/hide widget based on availability"""
        self.display = available

    def update_streams(self, streams: list) -> None:
        """
        Update stream summary from stream list.

        Args:
            streams: List of AVB stream dicts
        """
        if not streams:
            self.is_available = False
            return

        self.is_available = True

        # Categorize streams
        talkers = [s for s in streams if s.get("direction") == "talker"]
        listeners = [s for s in streams if s.get("direction") == "listener"]

        # Count by state
        running = sum(1 for s in streams if s.get("state") == "running")
        stopped = sum(1 for s in streams if s.get("state") == "stopped")
        error = sum(1 for s in streams if s.get("state") == "error")

        # Build summary
        lines = []
        lines.append(f"[cyan]{len(talkers)}[/cyan] Talkers, [magenta]{len(listeners)}[/magenta] Listeners")

        # Status summary
        if running > 0:
            lines.append(f"Running: [green]{running}[/]")
        if stopped > 0:
            lines.append(f"Stopped: [dim]{stopped}[/]")
        if error > 0:
            lines.append(f"Error: [red]{error}[/]")

        self.summary_text = "\n".join(lines)

        # Set border color based on health
        if error > 0:
            self.styles.border = ("solid", "red")
            self.border_subtitle = "Errors"
        elif running > 0:
            self.styles.border = ("solid", "green")
            self.border_subtitle = "Active"
        else:
            self.styles.border = ("solid", "dim")
            self.border_subtitle = "Idle"

    def on_mount(self) -> None:
        """Set default styling"""
        self.styles.border = ("solid", "dim")
        self.styles.height = "auto"
        self.styles.padding = (1, 1)
        self.display = False  # Hidden by default


# Export widgets
__all__ = ['AvbStatusIndicator', 'AvbStreamsSummary']

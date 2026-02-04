"""
Alert List Widget for Backend Services Monitoring TUI
=====================================================
Displays active alerts with severity color coding.

Layout:
+---------------------------+
| ALERTS (3)                |
+---------------------------+
| !! CRITICAL juce_engine   |
|    Audio thread stalled   |
| !  WARNING  midi_engine   |
|    High latency: 120ms    |
| i  INFO     database      |
|    Connection pool at 80% |
+---------------------------+
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List, Dict, Any, Callable
import asyncio
import logging

try:
    from textual.app import ComposeResult
    from textual.containers import Vertical, ScrollableContainer
    from textual.widgets import Static, Label
    from textual.reactive import reactive
    from textual.message import Message
    TEXTUAL_AVAILABLE = True
except ImportError:
    TEXTUAL_AVAILABLE = False
    Static = object

logger = logging.getLogger(__name__)


class AlertSeverity:
    """Alert severity levels."""
    CRITICAL = "CRITICAL"
    WARNING = "WARNING"
    INFO = "INFO"


@dataclass
class Alert:
    """Alert data model."""
    id: str
    severity: str
    service: str
    message: str
    timestamp: datetime
    acknowledged: bool = False
    details: Optional[str] = None

    @property
    def icon(self) -> str:
        """Get severity icon."""
        icons = {
            AlertSeverity.CRITICAL: "!!",
            AlertSeverity.WARNING: "!",
            AlertSeverity.INFO: "i",
        }
        return icons.get(self.severity, "?")

    @property
    def color(self) -> str:
        """Get severity color."""
        colors = {
            AlertSeverity.CRITICAL: "#EF4444",
            AlertSeverity.WARNING: "#F59E0B",
            AlertSeverity.INFO: "#2563EB",
        }
        return colors.get(self.severity, "#6B7280")

    @property
    def bg_color(self) -> str:
        """Get severity background color."""
        colors = {
            AlertSeverity.CRITICAL: "#450A0A",
            AlertSeverity.WARNING: "#451A03",
            AlertSeverity.INFO: "#1E3A5F",
        }
        return colors.get(self.severity, "#374151")


class AlertListWidget(Static):
    """
    Active alerts display with severity indicators.

    Features:
    - Color-coded severity (critical=red, warning=yellow, info=blue)
    - Severity icons (!! for critical, ! for warning, i for info)
    - Auto-refresh from API
    - Alert acknowledgment
    - Click to expand details
    """

    DEFAULT_CSS = """
    AlertListWidget {
        width: 100%;
        height: auto;
        max-height: 15;
        background: $surface;
        padding: 1;
    }

    AlertListWidget .alert-header {
        width: 100%;
        height: 1;
        text-style: bold;
        margin-bottom: 1;
    }

    AlertListWidget .alert-scroll {
        width: 100%;
        height: auto;
        max-height: 12;
    }

    AlertListWidget .alert-item {
        width: 100%;
        height: auto;
        padding: 0 1;
        margin-bottom: 1;
    }

    AlertListWidget .alert-critical {
        border-left: thick #EF4444;
        background: #450A0A;
    }

    AlertListWidget .alert-warning {
        border-left: thick #F59E0B;
        background: #451A03;
    }

    AlertListWidget .alert-info {
        border-left: thick #2563EB;
        background: #1E3A5F;
    }

    AlertListWidget .no-alerts {
        color: #10B981;
        text-style: italic;
    }
    """

    # Messages
    class AlertSelected(Message):
        """Emitted when an alert is selected."""
        def __init__(self, alert_id: str):
            super().__init__()
            self.alert_id = alert_id

    class AlertAcknowledged(Message):
        """Emitted when an alert is acknowledged."""
        def __init__(self, alert_id: str):
            super().__init__()
            self.alert_id = alert_id

    # Reactive
    alerts: reactive[List[Alert]] = reactive(list, always_update=True)

    def __init__(
        self,
        api_client: Optional[Any] = None,
        refresh_interval: float = 5.0,
        max_alerts: int = 10,
        id: Optional[str] = None,
        classes: Optional[str] = None,
    ):
        """
        Initialize alert list widget.

        Args:
            api_client: MAP2 API client
            refresh_interval: Auto-refresh interval in seconds
            max_alerts: Maximum alerts to display
            id: Widget ID
            classes: CSS classes
        """
        super().__init__(id=id, classes=classes)
        self._api_client = api_client
        self._refresh_interval = refresh_interval
        self._max_alerts = max_alerts
        self._alerts: List[Alert] = []
        self._refresh_task: Optional[asyncio.Task] = None

    def compose(self) -> ComposeResult:
        """Compose the widget."""
        yield Label(self._render_header(), id="alert-header", classes="alert-header")
        yield Label(self._render_content(), id="alert-content")

    def _render_header(self) -> str:
        """Render the header with alert count."""
        count = len(self._alerts)
        if count == 0:
            return "ALERTS"

        # Color code based on severity
        critical_count = sum(1 for a in self._alerts if a.severity == AlertSeverity.CRITICAL)
        if critical_count > 0:
            return f"[#EF4444]ALERTS ({count})[/]"
        else:
            return f"[#F59E0B]ALERTS ({count})[/]"

    def _render_content(self) -> str:
        """Render alerts content."""
        if not self._alerts:
            return "[#10B981]No active alerts[/]"

        lines = []
        for alert in self._alerts[:self._max_alerts]:
            # Severity line
            lines.append(
                f"[{alert.color}]{alert.icon} {alert.severity:<8}[/] {alert.service}"
            )
            # Message line
            msg = alert.message[:45] + "..." if len(alert.message) > 45 else alert.message
            lines.append(f"   {msg}")

        if len(self._alerts) > self._max_alerts:
            remaining = len(self._alerts) - self._max_alerts
            lines.append(f"[dim]... and {remaining} more alerts[/]")

        return "\n".join(lines)

    async def on_mount(self) -> None:
        """Start refresh loop."""
        self._refresh_task = asyncio.create_task(self._refresh_loop())

    async def on_unmount(self) -> None:
        """Stop refresh loop."""
        if self._refresh_task:
            self._refresh_task.cancel()
            try:
                await self._refresh_task
            except asyncio.CancelledError:
                pass

    async def _refresh_loop(self) -> None:
        """Periodically refresh alerts."""
        while True:
            try:
                await self.refresh_alerts()
                await asyncio.sleep(self._refresh_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error refreshing alerts: {e}")
                await asyncio.sleep(self._refresh_interval)

    async def refresh_alerts(self) -> None:
        """Fetch alerts from API."""
        if not self._api_client:
            return

        try:
            result = await self._api_client.get_active_alerts()
            if result.success and result.data:
                self._parse_alerts(result.data)
                self._update_display()
        except Exception as e:
            logger.error(f"Failed to fetch alerts: {e}")

    def _parse_alerts(self, data: Any) -> None:
        """Parse alerts from API response."""
        alerts_list = data.get("alerts", []) if isinstance(data, dict) else data
        if not isinstance(alerts_list, list):
            return

        self._alerts = []
        for alert_data in alerts_list:
            try:
                alert = Alert(
                    id=alert_data.get("id", ""),
                    severity=alert_data.get("severity", AlertSeverity.INFO),
                    service=alert_data.get("service", "unknown"),
                    message=alert_data.get("message", ""),
                    timestamp=datetime.fromisoformat(
                        alert_data.get("timestamp", datetime.now().isoformat())
                    ),
                    acknowledged=alert_data.get("acknowledged", False),
                    details=alert_data.get("details"),
                )
                self._alerts.append(alert)
            except Exception as e:
                logger.debug(f"Failed to parse alert: {e}")

        # Sort by severity (critical first) then by timestamp (newest first)
        severity_order = {
            AlertSeverity.CRITICAL: 0,
            AlertSeverity.WARNING: 1,
            AlertSeverity.INFO: 2,
        }
        self._alerts.sort(
            key=lambda a: (severity_order.get(a.severity, 3), -a.timestamp.timestamp())
        )

    def _update_display(self) -> None:
        """Update the display."""
        try:
            header = self.query_one("#alert-header", Label)
            header.update(self._render_header())
            content = self.query_one("#alert-content", Label)
            content.update(self._render_content())
        except Exception:
            pass

    def update_alerts(self, alerts: List[Dict[str, Any]]) -> None:
        """
        Update alerts directly (for external updates).

        Args:
            alerts: List of alert dictionaries
        """
        self._parse_alerts({"alerts": alerts})
        self._update_display()

    def add_alert(self, alert: Alert) -> None:
        """Add a single alert."""
        self._alerts.insert(0, alert)
        self._update_display()

    def remove_alert(self, alert_id: str) -> None:
        """Remove an alert by ID."""
        self._alerts = [a for a in self._alerts if a.id != alert_id]
        self._update_display()

    def acknowledge_alert(self, alert_id: str) -> None:
        """Mark an alert as acknowledged."""
        for alert in self._alerts:
            if alert.id == alert_id:
                alert.acknowledged = True
                break
        self._update_display()
        self.post_message(self.AlertAcknowledged(alert_id))

    @property
    def alert_count(self) -> int:
        """Get total alert count."""
        return len(self._alerts)

    @property
    def critical_count(self) -> int:
        """Get critical alert count."""
        return sum(1 for a in self._alerts if a.severity == AlertSeverity.CRITICAL)

    @property
    def warning_count(self) -> int:
        """Get warning alert count."""
        return sum(1 for a in self._alerts if a.severity == AlertSeverity.WARNING)

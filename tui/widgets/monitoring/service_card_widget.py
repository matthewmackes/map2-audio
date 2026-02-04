"""
Service Card Widget for Backend Services Monitoring TUI
=======================================================
Compact visual representation of individual service health status.

Layout:
+---------------------------+
| database          HEALTHY |
| [========] 2.1ms   99.9%  |
| CB: CLOSED    Err: 0      |
+---------------------------+
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List, Callable
import logging

try:
    from textual.app import ComposeResult
    from textual.containers import Horizontal, Vertical
    from textual.widgets import Static, Label
    from textual.reactive import reactive
    from textual.message import Message
    TEXTUAL_AVAILABLE = True
except ImportError:
    TEXTUAL_AVAILABLE = False
    Static = object

from .sparkline_widget import render_status_bar, render_sparkline

logger = logging.getLogger(__name__)


# Health status constants
class HealthStatus:
    HEALTHY = "HEALTHY"
    DEGRADED = "DEGRADED"
    CRITICAL = "CRITICAL"
    OFFLINE = "OFFLINE"


# Circuit breaker state constants
class CircuitState:
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


@dataclass
class ServiceHealth:
    """Data model for service health information."""
    name: str
    status: str = HealthStatus.HEALTHY
    latency_ms: float = 0.0
    uptime_percent: float = 100.0
    error_count: int = 0
    circuit_state: str = CircuitState.CLOSED
    last_check: Optional[datetime] = None
    latency_history: Optional[List[float]] = None
    failure_count: int = 0
    failure_threshold: int = 5

    @property
    def status_class(self) -> str:
        """Get CSS class for status."""
        return self.status.lower()

    @property
    def circuit_class(self) -> str:
        """Get CSS class for circuit breaker state."""
        return f"cb-{self.circuit_state.lower().replace('_', '-')}"

    @property
    def is_healthy(self) -> bool:
        """Check if service is healthy."""
        return self.status == HealthStatus.HEALTHY

    @property
    def status_icon(self) -> str:
        """Get status icon."""
        icons = {
            HealthStatus.HEALTHY: "●",
            HealthStatus.DEGRADED: "◐",
            HealthStatus.CRITICAL: "○",
            HealthStatus.OFFLINE: "◌",
        }
        return icons.get(self.status, "?")


class ServiceCardWidget(Static):
    """
    Compact service health card widget.

    Displays:
    - Service name and health status
    - Latency bar with numeric value
    - Uptime percentage
    - Circuit breaker state
    - Error count

    Features:
    - Color-coded border by health status
    - Mini sparkline of latency trend
    - Click to open detail view
    - Keyboard navigable
    """

    DEFAULT_CSS = """
    ServiceCardWidget {
        width: 100%;
        height: 5;
        background: $surface;
        border: solid $primary;
        padding: 0 1;
        margin: 0 0 1 0;
    }

    ServiceCardWidget:hover {
        border: solid $accent;
    }

    ServiceCardWidget:focus {
        border: double $accent;
    }

    ServiceCardWidget.healthy {
        border: solid #10B981;
    }

    ServiceCardWidget.degraded {
        border: solid #F59E0B;
    }

    ServiceCardWidget.critical {
        border: solid #EF4444;
    }

    ServiceCardWidget.offline {
        border: solid #6B7280;
        opacity: 0.7;
    }

    ServiceCardWidget .card-header {
        width: 100%;
        height: 1;
    }

    ServiceCardWidget .card-name {
        width: 1fr;
        text-style: bold;
    }

    ServiceCardWidget .card-status {
        width: auto;
    }

    ServiceCardWidget .card-status.healthy {
        color: #10B981;
    }

    ServiceCardWidget .card-status.degraded {
        color: #F59E0B;
    }

    ServiceCardWidget .card-status.critical {
        color: #EF4444;
    }

    ServiceCardWidget .card-status.offline {
        color: #6B7280;
    }

    ServiceCardWidget .card-metrics {
        width: 100%;
        height: 1;
        color: $text-muted;
    }

    ServiceCardWidget .card-footer {
        width: 100%;
        height: 1;
        color: $text-muted;
    }

    ServiceCardWidget .cb-closed {
        color: #10B981;
    }

    ServiceCardWidget .cb-open {
        color: #EF4444;
    }

    ServiceCardWidget .cb-half-open {
        color: #F59E0B;
    }
    """

    # Messages
    class Selected(Message):
        """Emitted when service card is selected."""
        def __init__(self, service_name: str):
            super().__init__()
            self.service_name = service_name

    # Reactive properties for auto-updates
    service_data: reactive[Optional[ServiceHealth]] = reactive(None, always_update=True)

    def __init__(
        self,
        service: Optional[ServiceHealth] = None,
        id: Optional[str] = None,
        classes: Optional[str] = None,
    ):
        """
        Initialize service card widget.

        Args:
            service: Initial service health data
            id: Widget ID
            classes: CSS classes
        """
        super().__init__(id=id, classes=classes)
        self._service = service or ServiceHealth(name="Unknown")
        self.can_focus = True

    def compose(self) -> ComposeResult:
        """Compose the widget layout."""
        with Vertical():
            # Header row: name and status
            with Horizontal(classes="card-header"):
                yield Label(self._service.name, classes="card-name")
                yield Label(
                    self._service.status,
                    classes=f"card-status {self._service.status_class}"
                )

            # Metrics row: latency bar, latency value, uptime
            with Horizontal(classes="card-metrics"):
                yield Label(self._render_metrics(), classes="card-metrics-content")

            # Footer row: circuit breaker state and errors
            with Horizontal(classes="card-footer"):
                yield Label(self._render_footer(), classes="card-footer-content")

    def _render_metrics(self) -> str:
        """Render the metrics line."""
        # Status bar based on latency (lower is better, scale 0-100ms)
        bar = render_status_bar(
            value=max(0, 100 - self._service.latency_ms),
            max_value=100,
            width=8
        )

        # Latency value
        latency = f"{self._service.latency_ms:.1f}ms"

        # Uptime
        uptime = f"{self._service.uptime_percent:.1f}%"

        # Mini sparkline if history available
        sparkline = ""
        if self._service.latency_history and len(self._service.latency_history) > 2:
            sparkline = " " + render_sparkline(
                self._service.latency_history,
                width=6,
                min_value=0,
                max_value=100
            )

        return f"{bar} {latency:>7} {uptime:>6}{sparkline}"

    def _render_footer(self) -> str:
        """Render the footer line."""
        # Circuit breaker state
        cb_state = self._service.circuit_state
        if cb_state == CircuitState.HALF_OPEN:
            cb_display = "HALF-OPEN"
        else:
            cb_display = cb_state

        # Failure count
        failures = self._service.failure_count
        threshold = self._service.failure_threshold

        return f"CB: {cb_display:<10} Err: {failures}/{threshold}"

    def update_service(self, service: ServiceHealth) -> None:
        """
        Update the service data and refresh display.

        Args:
            service: New service health data
        """
        self._service = service

        # Update CSS class for border color
        self.remove_class("healthy", "degraded", "critical", "offline")
        self.add_class(service.status_class)

        # Refresh content
        self.refresh()

    def on_mount(self) -> None:
        """Called when widget is mounted."""
        # Set initial status class
        self.add_class(self._service.status_class)

    def on_click(self) -> None:
        """Handle click event."""
        self.post_message(self.Selected(self._service.name))

    def on_key(self, event) -> None:
        """Handle key events."""
        if event.key == "enter":
            self.post_message(self.Selected(self._service.name))

    def render(self) -> str:
        """Render the widget content."""
        # Header
        status_color = {
            HealthStatus.HEALTHY: "[#10B981]",
            HealthStatus.DEGRADED: "[#F59E0B]",
            HealthStatus.CRITICAL: "[#EF4444]",
            HealthStatus.OFFLINE: "[#6B7280]",
        }.get(self._service.status, "")

        status_end = "[/]" if status_color else ""

        header = f"[bold]{self._service.name:<16}[/bold] {status_color}{self._service.status:>8}{status_end}"

        # Metrics line
        metrics = self._render_metrics()

        # Footer line
        footer = self._render_footer()

        return f"{header}\n{metrics}\n{footer}"


class ServiceCardCompact(Static):
    """
    Ultra-compact single-line service card.

    Layout: database [====] 2.1ms HEALTHY
    """

    DEFAULT_CSS = """
    ServiceCardCompact {
        width: 100%;
        height: 1;
    }

    ServiceCardCompact.healthy {
        color: #10B981;
    }

    ServiceCardCompact.degraded {
        color: #F59E0B;
    }

    ServiceCardCompact.critical {
        color: #EF4444;
    }

    ServiceCardCompact.offline {
        color: #6B7280;
    }
    """

    def __init__(
        self,
        service: Optional[ServiceHealth] = None,
        id: Optional[str] = None,
        classes: Optional[str] = None,
    ):
        super().__init__(id=id, classes=classes)
        self._service = service or ServiceHealth(name="Unknown")

    def update_service(self, service: ServiceHealth) -> None:
        """Update service data."""
        self._service = service
        self.remove_class("healthy", "degraded", "critical", "offline")
        self.add_class(service.status_class)
        self.refresh()

    def render(self) -> str:
        """Render compact single-line format."""
        name = self._service.name[:14].ljust(14)
        bar = render_status_bar(
            value=max(0, 100 - self._service.latency_ms),
            max_value=100,
            width=8
        )
        latency = f"{self._service.latency_ms:.1f}ms".rjust(7)
        status = self._service.status

        return f"{name} {bar} {latency}  {status}"

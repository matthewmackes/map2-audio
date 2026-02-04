"""
Circuit Breaker Widget for Backend Services Monitoring TUI
=========================================================
Visual state machine for circuit breaker status.

Layout:
+-----------------------------+
|     CIRCUIT BREAKERS        |
+-----------------------------+
|   ┌─────────┐               |
|   │ CLOSED  │ ← Normal      |
|   └────┬────┘               |
|        │ (failures)         |
|   ┌────▼────┐               |
|   │  OPEN   │ → Failing     |
|   └────┬────┘               |
|        │ (timeout)          |
|   ┌────▼────┐               |
|   │HALF-OPEN│ → Testing     |
|   └─────────┘               |
|                             |
|   Failures: 3/5             |
|   Timeout:  30s remaining   |
+-----------------------------+
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
import asyncio
import logging

try:
    from textual.app import ComposeResult
    from textual.containers import Vertical
    from textual.widgets import Static, Label
    from textual.reactive import reactive
    TEXTUAL_AVAILABLE = True
except ImportError:
    TEXTUAL_AVAILABLE = False
    Static = object

logger = logging.getLogger(__name__)


class CircuitState:
    """Circuit breaker states."""
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


@dataclass
class CircuitBreakerStatus:
    """Circuit breaker status for a service."""
    service: str
    state: str = CircuitState.CLOSED
    failure_count: int = 0
    failure_threshold: int = 5
    success_count: int = 0
    success_threshold: int = 2
    last_failure_time: Optional[datetime] = None
    timeout_seconds: int = 30
    remaining_timeout: Optional[int] = None

    @property
    def state_color(self) -> str:
        """Get color for current state."""
        colors = {
            CircuitState.CLOSED: "#10B981",  # Green
            CircuitState.OPEN: "#EF4444",    # Red
            CircuitState.HALF_OPEN: "#F59E0B",  # Yellow
        }
        return colors.get(self.state, "#6B7280")

    @property
    def state_icon(self) -> str:
        """Get icon for current state."""
        icons = {
            CircuitState.CLOSED: "●",
            CircuitState.OPEN: "○",
            CircuitState.HALF_OPEN: "◐",
        }
        return icons.get(self.state, "?")

    @property
    def is_healthy(self) -> bool:
        """Check if circuit is healthy (closed)."""
        return self.state == CircuitState.CLOSED


class CircuitBreakerWidget(Static):
    """
    Circuit breaker state visualization widget.

    Features:
    - Visual state machine display
    - State color coding
    - Failure count progress
    - Timeout countdown when open
    - State transition animations
    """

    DEFAULT_CSS = """
    CircuitBreakerWidget {
        width: 100%;
        height: auto;
        background: $surface;
        padding: 1;
    }

    CircuitBreakerWidget .cb-title {
        width: 100%;
        height: 1;
        text-style: bold;
        margin-bottom: 1;
    }

    CircuitBreakerWidget .cb-state-box {
        width: 100%;
        height: 3;
        border: solid $primary;
        padding: 0 1;
        content-align: center middle;
    }

    CircuitBreakerWidget .cb-state-box.closed {
        border: solid #10B981;
    }

    CircuitBreakerWidget .cb-state-box.open {
        border: solid #EF4444;
    }

    CircuitBreakerWidget .cb-state-box.half-open {
        border: solid #F59E0B;
    }

    CircuitBreakerWidget .cb-details {
        width: 100%;
        height: auto;
        color: $text-muted;
        padding-top: 1;
    }
    """

    def __init__(
        self,
        id: Optional[str] = None,
        classes: Optional[str] = None,
    ):
        """Initialize circuit breaker widget."""
        super().__init__(id=id, classes=classes)
        self._breakers: Dict[str, CircuitBreakerStatus] = {}

    def compose(self) -> ComposeResult:
        """Compose the widget."""
        yield Label("CIRCUIT BREAKERS", classes="cb-title")
        yield Label(self._render_content(), id="cb-content")

    def _render_content(self) -> str:
        """Render the circuit breaker visualization."""
        if not self._breakers:
            # Default healthy state
            return self._render_summary_view()

        # Check for any open or half-open circuits
        open_breakers = [b for b in self._breakers.values() if b.state == CircuitState.OPEN]
        half_open_breakers = [b for b in self._breakers.values() if b.state == CircuitState.HALF_OPEN]

        if open_breakers:
            return self._render_alert_view(open_breakers, half_open_breakers)
        elif half_open_breakers:
            return self._render_testing_view(half_open_breakers)
        else:
            return self._render_summary_view()

    def _render_summary_view(self) -> str:
        """Render summary when all circuits are closed."""
        total_failures = sum(b.failure_count for b in self._breakers.values())

        lines = [
            "┌─────────────────┐",
            "│ [#10B981]CLOSED (normal)[/] │",
            "└─────────────────┘",
            "",
            f"All circuits healthy",
            f"Total failures: {total_failures}",
        ]

        return "\n".join(lines)

    def _render_alert_view(
        self,
        open_breakers: List[CircuitBreakerStatus],
        half_open_breakers: List[CircuitBreakerStatus]
    ) -> str:
        """Render alert view when circuits are open."""
        lines = [
            "┌─────────────────┐",
            f"│ [#EF4444]OPEN ({len(open_breakers)} circuits)[/] │",
            "└─────────────────┘",
            "",
        ]

        for breaker in open_breakers[:3]:  # Show max 3
            lines.append(f"[#EF4444]● {breaker.service}[/]")
            lines.append(f"  Failures: {breaker.failure_count}/{breaker.failure_threshold}")
            if breaker.remaining_timeout:
                lines.append(f"  Timeout: {breaker.remaining_timeout}s")

        if len(open_breakers) > 3:
            lines.append(f"[dim]... and {len(open_breakers) - 3} more[/]")

        return "\n".join(lines)

    def _render_testing_view(
        self,
        half_open_breakers: List[CircuitBreakerStatus]
    ) -> str:
        """Render testing view when circuits are half-open."""
        lines = [
            "┌─────────────────────┐",
            f"│ [#F59E0B]HALF-OPEN (testing)[/] │",
            "└─────────────────────┘",
            "",
        ]

        for breaker in half_open_breakers[:3]:
            lines.append(f"[#F59E0B]◐ {breaker.service}[/]")
            lines.append(f"  Success: {breaker.success_count}/{breaker.success_threshold}")

        return "\n".join(lines)

    def _render_state_diagram(self) -> str:
        """Render ASCII state machine diagram."""
        return """
   CLOSED ──(failures)──▶ OPEN
      ▲                     │
      │                (timeout)
      │                     │
      └──(success)── HALF-OPEN
"""

    def update_breakers(self, breakers: Dict[str, Dict[str, Any]]) -> None:
        """
        Update circuit breaker data.

        Args:
            breakers: Dictionary of service name to breaker status
        """
        for service, data in breakers.items():
            self._breakers[service] = CircuitBreakerStatus(
                service=service,
                state=data.get("state", CircuitState.CLOSED),
                failure_count=data.get("failure_count", 0),
                failure_threshold=data.get("failure_threshold", 5),
                success_count=data.get("success_count", 0),
                success_threshold=data.get("success_threshold", 2),
                timeout_seconds=data.get("timeout_seconds", 30),
                remaining_timeout=data.get("remaining_timeout"),
            )

        self._update_display()

    def update_single(self, status: CircuitBreakerStatus) -> None:
        """Update a single circuit breaker."""
        self._breakers[status.service] = status
        self._update_display()

    def _update_display(self) -> None:
        """Refresh the display."""
        try:
            content = self.query_one("#cb-content", Label)
            content.update(self._render_content())
        except Exception:
            pass

    @property
    def open_count(self) -> int:
        """Count of open circuits."""
        return sum(1 for b in self._breakers.values() if b.state == CircuitState.OPEN)

    @property
    def half_open_count(self) -> int:
        """Count of half-open circuits."""
        return sum(1 for b in self._breakers.values() if b.state == CircuitState.HALF_OPEN)

    @property
    def all_healthy(self) -> bool:
        """Check if all circuits are healthy."""
        return all(b.is_healthy for b in self._breakers.values())

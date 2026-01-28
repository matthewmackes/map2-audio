"""
Sidebar Widget - API Error Monitor
Shows real-time API errors that auto-expire after 60 seconds.
"""

import logging
import time
from dataclasses import dataclass, field
from typing import List, Optional, Callable
from textual.widgets import Static
from textual.binding import Binding

logger = logging.getLogger(__name__)

# Error expiration time in seconds
ERROR_EXPIRY_SECONDS = 60


@dataclass
class APIError:
    """Represents an API error with timestamp for expiration tracking."""
    timestamp: float
    method: str
    endpoint: str
    error: str
    duration_ms: float

    @property
    def age_seconds(self) -> float:
        """Get age of error in seconds."""
        return time.time() - self.timestamp

    @property
    def is_expired(self) -> bool:
        """Check if error has expired (older than 60 seconds)."""
        return self.age_seconds >= ERROR_EXPIRY_SECONDS

    @property
    def time_remaining(self) -> int:
        """Get seconds remaining before expiration."""
        return max(0, int(ERROR_EXPIRY_SECONDS - self.age_seconds))

    @property
    def short_endpoint(self) -> str:
        """Get shortened endpoint for display."""
        # Remove /api prefix and truncate
        ep = self.endpoint
        if ep.startswith("/api/"):
            ep = ep[5:]
        # Truncate long endpoints
        if len(ep) > 18:
            ep = ep[:15] + "..."
        return ep

    @property
    def short_error(self) -> str:
        """Get shortened error message for display."""
        err = self.error
        if len(err) > 20:
            err = err[:17] + "..."
        return err


class SidebarWidget(Static):
    """
    API Error Monitor Sidebar.

    Displays API errors in real-time with automatic expiration after 60 seconds.
    Integrates with MAP2APIClient's log callback to capture errors.
    """

    BINDINGS = [
        Binding("ctrl+b", "toggle_sidebar", "Toggle Sidebar", show=False),
    ]

    def __init__(self, api_client=None):
        super().__init__()
        self.api_client = api_client
        self.id = "sidebar"
        self.collapsed = False
        self._errors: List[APIError] = []
        self._refresh_interval = None
        self._total_errors = 0
        self._errors_last_minute = 0

        # Register callback with API client if provided
        if api_client:
            self._register_callback()

    def set_api_client(self, api_client) -> None:
        """Set or update the API client and register callback."""
        self.api_client = api_client
        self._register_callback()

    def _register_callback(self) -> None:
        """Register the error tracking callback with the API client."""
        if self.api_client and hasattr(self.api_client, 'set_log_callback'):
            self.api_client.set_log_callback(self._on_api_call)
            logger.info("Sidebar registered API log callback")

    def _on_api_call(self, method: str, endpoint: str, status: str,
                     result: str, duration_ms: float) -> None:
        """
        Callback for API calls from the API client.

        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path
            status: "success" or "error"
            result: Result summary or error message
            duration_ms: Response time in milliseconds
        """
        if status == "error":
            error = APIError(
                timestamp=time.time(),
                method=method,
                endpoint=endpoint,
                error=result,
                duration_ms=duration_ms
            )
            self._errors.append(error)
            self._total_errors += 1
            logger.debug(f"API error tracked: {method} {endpoint} - {result}")

            # Trigger refresh on main thread
            try:
                self.refresh()
            except Exception:
                pass  # Widget might not be mounted yet

    def on_mount(self) -> None:
        """Start periodic refresh to update expiration times and remove old errors."""
        self._refresh_interval = self.set_interval(1.0, self._periodic_refresh)

    def _periodic_refresh(self) -> None:
        """Refresh display and clean up expired errors."""
        # Remove expired errors
        before_count = len(self._errors)
        self._errors = [e for e in self._errors if not e.is_expired]
        after_count = len(self._errors)

        if before_count != after_count:
            logger.debug(f"Removed {before_count - after_count} expired errors")

        # Update errors in last minute count
        self._errors_last_minute = len([e for e in self._errors if e.age_seconds < 60])

        self.refresh()

    def add_error(self, method: str, endpoint: str, error: str,
                  duration_ms: float = 0.0) -> None:
        """
        Manually add an API error to track.

        Args:
            method: HTTP method
            endpoint: API endpoint
            error: Error message
            duration_ms: Response time
        """
        api_error = APIError(
            timestamp=time.time(),
            method=method,
            endpoint=endpoint,
            error=error,
            duration_ms=duration_ms
        )
        self._errors.append(api_error)
        self._total_errors += 1
        self.refresh()

    def clear_errors(self) -> None:
        """Clear all tracked errors."""
        self._errors.clear()
        self.refresh()

    def render(self) -> str:
        """Render sidebar content showing API errors."""
        if self.collapsed:
            error_count = len(self._errors)
            if error_count > 0:
                return f"[red]◀ {error_count}[/]"
            return "▶"

        lines = []
        lines.append("┏━━━━━━━━━━━━━━━━━━━┓")
        lines.append("┃ [red]⚠ API ERRORS[/]     ┃")
        lines.append("┣━━━━━━━━━━━━━━━━━━━┫")

        # Show error count and stats
        active_count = len(self._errors)
        if active_count == 0:
            lines.append("┃ [green]✓ No errors[/]       ┃")
            lines.append("┃   (last 60s)       ┃")
        else:
            lines.append(f"┃ [red]{active_count:2d} active error{'s' if active_count != 1 else ' '}[/]  ┃")
            lines.append(f"┃ [dim]Total: {self._total_errors}[/]         ┃")

        lines.append("┣━━━━━━━━━━━━━━━━━━━┫")

        if self._errors:
            # Show most recent errors (up to 8)
            recent_errors = sorted(self._errors, key=lambda e: e.timestamp, reverse=True)[:8]

            for error in recent_errors:
                remaining = error.time_remaining
                method_short = error.method[:3]
                endpoint = error.short_endpoint

                # Color code by time remaining
                if remaining > 30:
                    time_color = "yellow"
                elif remaining > 10:
                    time_color = "bright_red"
                else:
                    time_color = "red dim"

                # Format: METHOD /endpoint [XXs]
                line = f"┃ [{time_color}]{remaining:2d}s[/] {method_short} "

                # Truncate endpoint to fit
                max_ep_len = 10
                if len(endpoint) > max_ep_len:
                    endpoint = endpoint[:max_ep_len-2] + ".."

                line += f"[cyan]{endpoint:<{max_ep_len}}[/]┃"
                lines.append(line)

                # Show error message on next line (truncated)
                err_msg = error.short_error
                lines.append(f"┃   [dim]{err_msg:<16}[/]┃")

            # Show "more" indicator if there are more errors
            if len(self._errors) > 8:
                more = len(self._errors) - 8
                lines.append(f"┃ [dim]... +{more} more[/]      ┃")
        else:
            lines.append("┃ [dim]Monitoring...[/]     ┃")
            lines.append("┃ [dim]Errors appear[/]     ┃")
            lines.append("┃ [dim]here and auto-[/]    ┃")
            lines.append("┃ [dim]expire in 60s[/]     ┃")

        lines.append("┣━━━━━━━━━━━━━━━━━━━┫")
        lines.append("┃ [dim]LEGEND[/]            ┃")
        lines.append("┃ [yellow]##s[/] = time left   ┃")
        lines.append("┃ [cyan]endpoint[/] = path   ┃")
        lines.append("┗━━━━━━━━━━━━━━━━━━━┛")

        return "\n".join(lines)

    def action_toggle_sidebar(self) -> None:
        """Toggle sidebar collapsed state."""
        self.collapsed = not self.collapsed
        self.refresh()

    @property
    def error_count(self) -> int:
        """Get current count of active (non-expired) errors."""
        return len(self._errors)

    @property
    def has_errors(self) -> bool:
        """Check if there are any active errors."""
        return len(self._errors) > 0

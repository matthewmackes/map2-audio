"""
API Call Log Widget for MAP2 TUI
Displays real-time API calls and their results.
"""

import asyncio
import logging
from datetime import datetime
from typing import Optional, List, Deque
from collections import deque

try:
    from textual.app import ComposeResult
    from textual.containers import Vertical, VerticalScroll
    from textual.widgets import Static, DataTable, Label
    from textual.reactive import reactive
    TEXTUAL_AVAILABLE = True
except ImportError:
    TEXTUAL_AVAILABLE = False

logger = logging.getLogger(__name__)


class APILogEntry:
    """Represents a single API call log entry."""

    def __init__(self, method: str, endpoint: str, status: str = "pending",
                 result: str = "", duration_ms: float = 0):
        self.timestamp = datetime.now()
        self.method = method
        self.endpoint = endpoint
        self.status = status
        self.result = result
        self.duration_ms = duration_ms

    def time_str(self) -> str:
        return self.timestamp.strftime("%H:%M:%S.%f")[:-3]

    def status_icon(self) -> str:
        if self.status == "success":
            return "🟢"
        elif self.status == "error":
            return "🔴"
        elif self.status == "pending":
            return "🟡"
        else:
            return "⚪"


class APILogWidget(Static):
    """
    Real-time API call log widget.

    Displays:
    - Timestamp of each API call
    - HTTP method (GET/POST/PUT/DELETE)
    - Endpoint URL
    - Status (success/error)
    - Result summary or error message
    - Response time in ms
    """

    DEFAULT_CSS = """
    APILogWidget {
        width: 100%;
        height: 10;
        min-height: 10;
        max-height: 10;
        background: $surface;
        border: none;
        padding: 0;
    }

    .log-header {
        width: 100%;
        height: auto;
        background: #37474F;
        color: $text;
        text-style: bold;
        padding: 0 1;
        border-bottom: solid #546E7A;
    }

    .log-stats {
        width: 100%;
        height: auto;
        background: #263238;
        color: $text-muted;
        padding: 0 1;
        layout: horizontal;
    }

    .stat-item {
        width: auto;
        padding: 0 2;
    }

    .log-scroll {
        width: 100%;
        height: 8;
        min-height: 8;
        max-height: 8;
        background: #1E272E;
        overflow-y: auto;
    }

    .log-table {
        width: 100%;
        height: auto;
        background: #1E272E;
    }

    .log-controls {
        width: 100%;
        height: auto;
        background: #263238;
        padding: 0 1;
        layout: horizontal;
    }
    """

    # Maximum number of log entries to keep
    MAX_LOG_ENTRIES = 200

    # Stats
    total_calls: reactive[int] = reactive(0)
    success_calls: reactive[int] = reactive(0)
    error_calls: reactive[int] = reactive(0)
    avg_response_ms: reactive[float] = reactive(0.0)

    def __init__(self, api_client=None, id: str = "api-log"):
        super().__init__(id=id)
        self.api_client = api_client
        self._log_entries: Deque[APILogEntry] = deque(maxlen=self.MAX_LOG_ENTRIES)
        self._table: Optional[DataTable] = None
        self._response_times: Deque[float] = deque(maxlen=100)

        # Register this widget with the API client for callbacks
        if api_client and hasattr(api_client, 'set_log_callback'):
            api_client.set_log_callback(self.log_api_call)

    def compose(self) -> ComposeResult:
        yield Label("API CALL LOG", classes="log-header")

        with Static(classes="log-stats"):
            yield Label("Total: 0", id="stat-total", classes="stat-item")
            yield Label("OK: 0", id="stat-success", classes="stat-item")
            yield Label("Err: 0", id="stat-error", classes="stat-item")
            yield Label("Avg: 0ms", id="stat-avg", classes="stat-item")

        with VerticalScroll(classes="log-scroll"):
            yield DataTable(id="log-table", classes="log-table")

    def _init_table(self) -> None:
        """Initialize the log table."""
        try:
            self._table = self.query_one("#log-table", DataTable)
            self._table.cursor_type = "row"
            self._table.zebra_stripes = True
            self._table.add_column("Time", key="time", width=12)
            self._table.add_column("", key="status", width=3)
            self._table.add_column("Method", key="method", width=6)
            self._table.add_column("Endpoint", key="endpoint", width=35)
            self._table.add_column("ms", key="duration", width=6)
            self._table.add_column("Result", key="result", width=40)
        except Exception as e:
            logger.debug(f"Could not init log table: {e}")

    async def on_mount(self) -> None:
        """Initialize on mount."""
        self._init_table()
        # Re-register callback after mount
        if self.api_client and hasattr(self.api_client, 'set_log_callback'):
            self.api_client.set_log_callback(self.log_api_call)

    def log_api_call(self, method: str, endpoint: str, status: str,
                     result: str, duration_ms: float) -> None:
        """
        Log an API call. Called by the API client.

        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path
            status: "success" or "error"
            result: Result summary or error message
            duration_ms: Response time in milliseconds
        """
        entry = APILogEntry(
            method=method,
            endpoint=endpoint,
            status=status,
            result=result[:50] if result else "",
            duration_ms=duration_ms
        )

        self._log_entries.appendleft(entry)
        self._response_times.append(duration_ms)

        # Update stats
        self.total_calls += 1
        if status == "success":
            self.success_calls += 1
        else:
            self.error_calls += 1

        if self._response_times:
            self.avg_response_ms = sum(self._response_times) / len(self._response_times)

        # Update display
        self._update_display()

    def _update_display(self) -> None:
        """Update the log table and stats."""
        try:
            # Update stats labels
            self.query_one("#stat-total", Label).update(f"Total: {self.total_calls}")
            self.query_one("#stat-success", Label).update(f"OK: {self.success_calls}")
            self.query_one("#stat-error", Label).update(f"Err: {self.error_calls}")
            self.query_one("#stat-avg", Label).update(f"Avg: {self.avg_response_ms:.0f}ms")

            # Update table - only show most recent entries
            if self._table:
                self._table.clear()
                for entry in list(self._log_entries)[:50]:  # Show last 50
                    self._table.add_row(
                        entry.time_str(),
                        entry.status_icon(),
                        entry.method,
                        entry.endpoint[:35],
                        f"{entry.duration_ms:.0f}",
                        entry.result[:40]
                    )
        except Exception as e:
            logger.debug(f"Log display update error: {e}")

    def clear_log(self) -> None:
        """Clear all log entries."""
        self._log_entries.clear()
        self._response_times.clear()
        self.total_calls = 0
        self.success_calls = 0
        self.error_calls = 0
        self.avg_response_ms = 0.0
        self._update_display()

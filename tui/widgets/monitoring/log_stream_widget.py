"""
Log Stream Widget for Backend Services Monitoring TUI
====================================================
Real-time log viewer with RichLog, filtering, search, and color-coding.

Features:
- RichLog widget for smooth auto-scrolling
- Syntax highlighting for log levels
- Interactive filter toolbar
- Search highlighting
- Export functionality
- Log level statistics

Layout:
+--------------------------------------------------+
| LOGS (50/100) [E:5 W:12 I:30 D:3]  Filter: ERROR |
+--------------------------------------------------+
| 14:32:01 ERROR juce_engine                       |
|   Audio thread deadline exceeded: 15ms           |
| 14:32:00 WARN  midi_engine                       |
|   High latency detected: 120ms                   |
+--------------------------------------------------+
| [E] Errors  [W] Warns  [I] Info  [/] Search      |
+--------------------------------------------------+
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List, Dict, Any, Callable
from collections import Counter
import asyncio
import logging

try:
    from textual.app import ComposeResult
    from textual.containers import Vertical, Horizontal, Container
    from textual.widgets import Static, Label, RichLog, Input, Button, Rule
    from textual.reactive import reactive
    from textual.message import Message
    from textual.binding import Binding
    from rich.text import Text
    from rich.style import Style
    TEXTUAL_AVAILABLE = True
except ImportError:
    TEXTUAL_AVAILABLE = False
    Static = object

logger = logging.getLogger(__name__)


class LogLevel:
    """Log levels with styling."""
    ERROR = "ERROR"
    WARN = "WARN"
    INFO = "INFO"
    DEBUG = "DEBUG"

    STYLES = {
        "ERROR": Style(color="#EF4444", bold=True),
        "WARN": Style(color="#F59E0B", bold=True),
        "INFO": Style(color="#3B82F6"),
        "DEBUG": Style(color="#6B7280", dim=True),
    }

    ICONS = {
        "ERROR": "✗",
        "WARN": "⚠",
        "INFO": "●",
        "DEBUG": "○",
    }

    @classmethod
    def all(cls) -> List[str]:
        return [cls.ERROR, cls.WARN, cls.INFO, cls.DEBUG]

    @classmethod
    def get_style(cls, level: str) -> Style:
        return cls.STYLES.get(level.upper(), cls.STYLES["INFO"])

    @classmethod
    def get_icon(cls, level: str) -> str:
        return cls.ICONS.get(level.upper(), "●")


@dataclass
class LogEntry:
    """Log entry data model."""
    timestamp: datetime
    level: str
    service: str
    message: str
    details: Optional[str] = None

    @property
    def level_color(self) -> str:
        """Get color for log level."""
        colors = {
            LogLevel.ERROR: "#EF4444",
            LogLevel.WARN: "#F59E0B",
            LogLevel.INFO: "#3B82F6",
            LogLevel.DEBUG: "#6B7280",
        }
        return colors.get(self.level.upper(), "#6B7280")

    @property
    def formatted_time(self) -> str:
        """Get formatted timestamp."""
        return self.timestamp.strftime("%H:%M:%S")

    @property
    def formatted_time_full(self) -> str:
        """Get full formatted timestamp with milliseconds."""
        return self.timestamp.strftime("%H:%M:%S.%f")[:-3]

    def to_rich_text(self, highlight_text: Optional[str] = None) -> Text:
        """Convert to Rich Text with formatting."""
        text = Text()

        # Icon and timestamp
        icon = LogLevel.get_icon(self.level)
        style = LogLevel.get_style(self.level)

        text.append(f"{icon} ", style=style)
        text.append(f"{self.formatted_time} ", style=Style(color="#888888"))
        text.append(f"{self.level:<5} ", style=style)
        text.append(f"[{self.service}] ", style=Style(color="#10B981", bold=True))

        # Message with optional highlighting
        msg = self.message
        if highlight_text and highlight_text.lower() in msg.lower():
            # Highlight search term
            lower_msg = msg.lower()
            lower_search = highlight_text.lower()
            start = lower_msg.find(lower_search)
            if start >= 0:
                text.append(msg[:start])
                text.append(msg[start:start+len(highlight_text)], style=Style(bgcolor="yellow", color="black"))
                text.append(msg[start+len(highlight_text):])
            else:
                text.append(msg)
        else:
            text.append(msg)

        return text


class LogFilterToolbar(Static):
    """Toolbar for log filtering controls."""

    DEFAULT_CSS = """
    LogFilterToolbar {
        width: 100%;
        height: 3;
        background: $surface;
        padding: 0 1;
        layout: horizontal;
    }

    LogFilterToolbar Button {
        min-width: 8;
        height: 3;
        margin: 0 1 0 0;
    }

    LogFilterToolbar Input {
        width: 20;
        height: 3;
    }

    LogFilterToolbar .filter-active {
        background: $accent;
    }

    LogFilterToolbar .stats-label {
        width: auto;
        height: 3;
        padding: 1;
        color: $text-muted;
    }
    """

    class FilterChanged(Message):
        """Emitted when filter changes."""
        def __init__(self, level: Optional[str], search: Optional[str]):
            super().__init__()
            self.level = level
            self.search = search

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._active_level: Optional[str] = None
        self._stats: Dict[str, int] = {"ERROR": 0, "WARN": 0, "INFO": 0, "DEBUG": 0}

    def compose(self) -> ComposeResult:
        yield Button("E", id="btn-error", variant="error", classes="level-btn")
        yield Button("W", id="btn-warn", variant="warning", classes="level-btn")
        yield Button("I", id="btn-info", variant="primary", classes="level-btn")
        yield Button("D", id="btn-debug", variant="default", classes="level-btn")
        yield Button("✕", id="btn-clear", variant="default", tooltip="Clear filters")
        yield Input(placeholder="Search logs...", id="search-input")
        yield Label("", id="stats-label", classes="stats-label")

    def update_stats(self, stats: Dict[str, int]) -> None:
        """Update level statistics."""
        self._stats = stats
        try:
            label = self.query_one("#stats-label", Label)
            label.update(
                f"E:{stats.get('ERROR', 0)} W:{stats.get('WARN', 0)} "
                f"I:{stats.get('INFO', 0)} D:{stats.get('DEBUG', 0)}"
            )
        except Exception:
            pass

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle filter button presses."""
        btn_id = event.button.id

        # Level filter buttons
        level_map = {
            "btn-error": LogLevel.ERROR,
            "btn-warn": LogLevel.WARN,
            "btn-info": LogLevel.INFO,
            "btn-debug": LogLevel.DEBUG,
        }

        if btn_id in level_map:
            new_level = level_map[btn_id]
            if self._active_level == new_level:
                self._active_level = None  # Toggle off
            else:
                self._active_level = new_level

            # Update button styles
            for bid, _ in level_map.items():
                btn = self.query_one(f"#{bid}", Button)
                if bid == btn_id and self._active_level:
                    btn.add_class("filter-active")
                else:
                    btn.remove_class("filter-active")

            search = self.query_one("#search-input", Input).value or None
            self.post_message(self.FilterChanged(self._active_level, search))

        elif btn_id == "btn-clear":
            self._active_level = None
            for bid in level_map:
                self.query_one(f"#{bid}", Button).remove_class("filter-active")
            self.query_one("#search-input", Input).value = ""
            self.post_message(self.FilterChanged(None, None))

    async def on_input_changed(self, event: Input.Changed) -> None:
        """Handle search input changes."""
        if event.input.id == "search-input":
            search = event.value.strip() or None
            self.post_message(self.FilterChanged(self._active_level, search))


class LogStreamWidget(Static):
    """
    Real-time log viewer using Textual's RichLog widget.

    Features:
    - Smooth auto-scrolling with RichLog
    - Rich text formatting with syntax highlighting
    - Interactive filter toolbar
    - Search highlighting
    - Level statistics
    - Export capability
    - Keyboard shortcuts for filtering
    """

    DEFAULT_CSS = """
    LogStreamWidget {
        width: 100%;
        height: 100%;
        background: $background;
        layout: vertical;
    }

    LogStreamWidget .log-header {
        width: 100%;
        height: 1;
        text-style: bold;
        padding: 0 1;
        background: $surface;
    }

    LogStreamWidget RichLog {
        width: 100%;
        height: 1fr;
        background: $surface;
        border: solid $primary-darken-2;
        scrollbar-gutter: stable;
    }

    LogStreamWidget RichLog:focus {
        border: solid $accent;
    }

    LogStreamWidget .log-footer {
        width: 100%;
        height: 1;
        background: $surface;
        padding: 0 1;
        color: $text-muted;
    }
    """

    BINDINGS = [
        Binding("e", "filter_error", "Errors", show=False),
        Binding("w", "filter_warn", "Warnings", show=False),
        Binding("i", "filter_info", "Info", show=False),
        Binding("d", "filter_debug", "Debug", show=False),
        Binding("c", "clear_logs", "Clear", show=False),
        Binding("slash", "focus_search", "Search", show=False),
        Binding("escape", "clear_filters", "Clear filters", show=False),
    ]

    # Messages
    class LogReceived(Message):
        """Emitted when a new log is received."""
        def __init__(self, log_entry: LogEntry):
            super().__init__()
            self.log_entry = log_entry

    def __init__(
        self,
        api_client: Optional[Any] = None,
        refresh_interval: float = 2.0,
        max_entries: int = 500,
        auto_scroll: bool = True,
        show_toolbar: bool = True,
        id: Optional[str] = None,
        classes: Optional[str] = None,
    ):
        """
        Initialize log stream widget.

        Args:
            api_client: MAP2 API client
            refresh_interval: Auto-refresh interval
            max_entries: Maximum log entries to keep
            auto_scroll: Auto-scroll to latest
            show_toolbar: Show filter toolbar
            id: Widget ID
            classes: CSS classes
        """
        super().__init__(id=id, classes=classes)
        self._api_client = api_client
        self._refresh_interval = refresh_interval
        self._max_entries = max_entries
        self._auto_scroll = auto_scroll
        self._show_toolbar = show_toolbar
        self._entries: List[LogEntry] = []
        self._filter_level: Optional[str] = None
        self._filter_service: Optional[str] = None
        self._filter_text: Optional[str] = None
        self._refresh_task: Optional[asyncio.Task] = None
        self._paused: bool = False

    def compose(self) -> ComposeResult:
        """Compose the widget with RichLog."""
        yield Label(self._render_header(), id="log-header", classes="log-header")
        if self._show_toolbar:
            yield LogFilterToolbar(id="filter-toolbar")
        yield RichLog(
            id="log-content",
            highlight=True,
            markup=True,
            auto_scroll=self._auto_scroll,
            max_lines=self._max_entries,
        )
        yield Label("[E]rror [W]arn [I]nfo [D]ebug  [/]Search  [C]lear", classes="log-footer")

    def _render_header(self) -> str:
        """Render the header with filter info."""
        filtered = len(self._get_filtered_entries())
        total = len(self._entries)

        # Count by level
        stats = Counter(e.level.upper() for e in self._entries)

        header = f"📋 LOGS ({filtered}/{total})"

        filters = []
        if self._filter_level:
            filters.append(f"Level: {self._filter_level}")
        if self._filter_service:
            filters.append(f"Service: {self._filter_service}")
        if self._filter_text:
            filters.append(f"Search: \"{self._filter_text}\"")

        if filters:
            header += "  [" + ", ".join(filters) + "]"

        if self._paused:
            header += " [PAUSED]"

        return header

    def _get_filtered_entries(self) -> List[LogEntry]:
        """Get entries matching current filters."""
        entries = self._entries

        if self._filter_level:
            level_priority = {
                LogLevel.ERROR: 0,
                LogLevel.WARN: 1,
                LogLevel.INFO: 2,
                LogLevel.DEBUG: 3,
            }
            filter_priority = level_priority.get(self._filter_level, 3)
            entries = [
                e for e in entries
                if level_priority.get(e.level.upper(), 3) <= filter_priority
            ]

        if self._filter_service:
            entries = [e for e in entries if e.service == self._filter_service]

        if self._filter_text:
            text = self._filter_text.lower()
            entries = [
                e for e in entries
                if text in e.message.lower() or text in e.service.lower()
            ]

        return entries

    def _update_stats(self) -> None:
        """Update level statistics in toolbar."""
        try:
            stats = Counter(e.level.upper() for e in self._entries)
            toolbar = self.query_one("#filter-toolbar", LogFilterToolbar)
            toolbar.update_stats(dict(stats))
        except Exception:
            pass

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
        """Periodically refresh logs."""
        while True:
            try:
                if not self._paused:
                    await self.refresh_logs()
                await asyncio.sleep(self._refresh_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error refreshing logs: {e}")
                await asyncio.sleep(self._refresh_interval)

    async def refresh_logs(self) -> None:
        """Fetch logs from API."""
        if not self._api_client:
            return

        try:
            result = await self._api_client.get_system_logs(limit=50)
            if result.success and result.data:
                self._parse_logs(result.data)
        except Exception as e:
            logger.error(f"Failed to fetch logs: {e}")

    def _parse_logs(self, data: Any) -> None:
        """Parse logs from API response."""
        logs_list = data.get("logs", []) if isinstance(data, dict) else data
        if not isinstance(logs_list, list):
            return

        new_entries = []
        existing_times = {e.timestamp for e in self._entries}

        for log_data in logs_list:
            try:
                timestamp = datetime.fromisoformat(
                    log_data.get("timestamp", datetime.now().isoformat())
                )
                if timestamp in existing_times:
                    continue

                entry = LogEntry(
                    timestamp=timestamp,
                    level=log_data.get("level", LogLevel.INFO).upper(),
                    service=log_data.get("service", "unknown"),
                    message=log_data.get("message", ""),
                    details=log_data.get("details"),
                )
                new_entries.append(entry)
            except Exception as e:
                logger.debug(f"Failed to parse log: {e}")

        if new_entries:
            self._entries.extend(new_entries)
            self._entries.sort(key=lambda e: e.timestamp)

            # Trim to max entries
            if len(self._entries) > self._max_entries:
                self._entries = self._entries[-self._max_entries:]

            # Add to RichLog
            self._render_new_entries(new_entries)
            self._update_header()
            self._update_stats()

            # Post messages
            for entry in new_entries:
                self.post_message(self.LogReceived(entry))

    def _render_new_entries(self, entries: List[LogEntry]) -> None:
        """Render new entries to RichLog."""
        try:
            log_widget = self.query_one("#log-content", RichLog)
            for entry in entries:
                if self._should_show_entry(entry):
                    log_widget.write(entry.to_rich_text(self._filter_text))
        except Exception:
            pass

    def _should_show_entry(self, entry: LogEntry) -> bool:
        """Check if entry passes current filters."""
        if self._filter_level:
            level_priority = {
                LogLevel.ERROR: 0,
                LogLevel.WARN: 1,
                LogLevel.INFO: 2,
                LogLevel.DEBUG: 3,
            }
            filter_priority = level_priority.get(self._filter_level, 3)
            if level_priority.get(entry.level.upper(), 3) > filter_priority:
                return False

        if self._filter_service and entry.service != self._filter_service:
            return False

        if self._filter_text:
            text = self._filter_text.lower()
            if text not in entry.message.lower() and text not in entry.service.lower():
                return False

        return True

    def _redraw_all_logs(self) -> None:
        """Redraw all logs (after filter change)."""
        try:
            log_widget = self.query_one("#log-content", RichLog)
            log_widget.clear()

            for entry in self._get_filtered_entries():
                log_widget.write(entry.to_rich_text(self._filter_text))
        except Exception:
            pass

    def _update_header(self) -> None:
        """Update header display."""
        try:
            header = self.query_one("#log-header", Label)
            header.update(self._render_header())
        except Exception:
            pass

    # Filter change handler
    async def on_log_filter_toolbar_filter_changed(
        self, event: LogFilterToolbar.FilterChanged
    ) -> None:
        """Handle filter changes from toolbar."""
        self._filter_level = event.level
        self._filter_text = event.search
        self._update_header()
        self._redraw_all_logs()

    # Action handlers
    def action_filter_error(self) -> None:
        """Filter to errors only."""
        self._filter_level = LogLevel.ERROR if self._filter_level != LogLevel.ERROR else None
        self._update_header()
        self._redraw_all_logs()

    def action_filter_warn(self) -> None:
        """Filter to warnings and above."""
        self._filter_level = LogLevel.WARN if self._filter_level != LogLevel.WARN else None
        self._update_header()
        self._redraw_all_logs()

    def action_filter_info(self) -> None:
        """Filter to info and above."""
        self._filter_level = LogLevel.INFO if self._filter_level != LogLevel.INFO else None
        self._update_header()
        self._redraw_all_logs()

    def action_filter_debug(self) -> None:
        """Show all including debug."""
        self._filter_level = LogLevel.DEBUG if self._filter_level != LogLevel.DEBUG else None
        self._update_header()
        self._redraw_all_logs()

    def action_clear_logs(self) -> None:
        """Clear all logs."""
        self._entries = []
        try:
            log_widget = self.query_one("#log-content", RichLog)
            log_widget.clear()
        except Exception:
            pass
        self._update_header()
        self._update_stats()

    def action_clear_filters(self) -> None:
        """Clear all filters."""
        self._filter_level = None
        self._filter_service = None
        self._filter_text = None
        self._update_header()
        self._redraw_all_logs()

    def action_focus_search(self) -> None:
        """Focus the search input."""
        try:
            search = self.query_one("#search-input", Input)
            search.focus()
        except Exception:
            pass

    # Public API
    def add_log(self, entry: LogEntry) -> None:
        """Add a log entry (for direct/WebSocket updates)."""
        self._entries.append(entry)
        if len(self._entries) > self._max_entries:
            self._entries = self._entries[-self._max_entries:]

        if self._should_show_entry(entry):
            try:
                log_widget = self.query_one("#log-content", RichLog)
                log_widget.write(entry.to_rich_text(self._filter_text))
            except Exception:
                pass

        self._update_header()
        self._update_stats()
        self.post_message(self.LogReceived(entry))

    def set_level_filter(self, level: Optional[str]) -> None:
        """Set log level filter."""
        self._filter_level = level
        self._update_header()
        self._redraw_all_logs()

    def set_service_filter(self, service: Optional[str]) -> None:
        """Set service filter."""
        self._filter_service = service
        self._update_header()
        self._redraw_all_logs()

    def set_text_filter(self, text: Optional[str]) -> None:
        """Set text search filter."""
        self._filter_text = text
        self._update_header()
        self._redraw_all_logs()

    def clear_filters(self) -> None:
        """Clear all filters."""
        self._filter_level = None
        self._filter_service = None
        self._filter_text = None
        self._update_header()
        self._redraw_all_logs()

    def clear_logs(self) -> None:
        """Clear all log entries."""
        self._entries = []
        try:
            log_widget = self.query_one("#log-content", RichLog)
            log_widget.clear()
        except Exception:
            pass
        self._update_header()
        self._update_stats()

    def pause(self) -> None:
        """Pause log updates."""
        self._paused = True
        self._update_header()

    def resume(self) -> None:
        """Resume log updates."""
        self._paused = False
        self._update_header()

    def toggle_pause(self) -> None:
        """Toggle pause state."""
        self._paused = not self._paused
        self._update_header()

    def export_logs(self) -> str:
        """Export logs as text."""
        lines = []
        for entry in self._get_filtered_entries():
            lines.append(
                f"{entry.formatted_time_full} {entry.level:<5} [{entry.service}] {entry.message}"
            )
        return "\n".join(lines)

    @property
    def entry_count(self) -> int:
        """Get total entry count."""
        return len(self._entries)

    @property
    def filtered_count(self) -> int:
        """Get filtered entry count."""
        return len(self._get_filtered_entries())

    @property
    def is_paused(self) -> bool:
        """Check if updates are paused."""
        return self._paused

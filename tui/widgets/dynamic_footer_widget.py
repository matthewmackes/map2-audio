"""
Dynamic Footer Widget for MAP2 TUI
Displays context-sensitive keybindings and system status.
"""

import asyncio
import logging
from typing import Optional, Dict, Any, List, Tuple

try:
    from textual.app import ComposeResult
    from textual.containers import Horizontal
    from textual.widgets import Static, Label, Footer
    from textual.reactive import reactive
    from textual.binding import Binding
    from rich.text import Text
    TEXTUAL_AVAILABLE = True
except ImportError:
    TEXTUAL_AVAILABLE = False

logger = logging.getLogger(__name__)


class DynamicFooter(Static):
    """
    Dynamic footer that shows context-sensitive keybindings.

    Features:
    - Updates keybindings based on current screen
    - Shows global keybindings (always visible)
    - Color-coded key hints
    - Compact, space-efficient layout
    - WebSocket/API connection status
    """

    DEFAULT_CSS = """
    DynamicFooter {
        width: 100%;
        height: 2;
        background: $panel;
        border-top: hkey $primary-darken-2;
        layout: horizontal;
        align: center middle;
    }

    DynamicFooter .footer-left {
        width: 1fr;
        height: 100%;
        content-align: left middle;
        padding: 0 1;
    }

    DynamicFooter .footer-center {
        width: 2fr;
        height: 100%;
        content-align: center middle;
        padding: 0 1;
    }

    DynamicFooter .footer-right {
        width: auto;
        height: 100%;
        content-align: right middle;
        padding: 0 1;
    }

    DynamicFooter .key {
        background: $primary;
        color: $text;
        padding: 0 1;
        text-style: bold;
    }

    DynamicFooter .action {
        color: $text-muted;
        padding-right: 2;
    }

    DynamicFooter .status-connected {
        color: $success;
    }

    DynamicFooter .status-disconnected {
        color: $error;
    }
    """

    # Global keybindings (always shown)
    GLOBAL_BINDINGS: List[Tuple[str, str]] = [
        ("←→", "tabs"),
        ("r", "refresh"),
        ("Ctrl+T", "theme"),
        ("Ctrl+L", "log"),
        ("F1", "help"),
        ("q", "quit"),
    ]

    # Context-specific keybindings by screen name
    SCREEN_BINDINGS: Dict[str, List[Tuple[str, str]]] = {
        "dashboard": [
            ("Enter", "select"),
            ("↑↓", "navigate"),
        ],
        "chains": [
            ("n", "new chain"),
            ("Enter", "select"),
            ("d", "delete"),
            ("c", "copy"),
        ],
        "effects": [
            ("Enter", "add"),
            ("s", "search"),
            ("f", "filter"),
        ],
        "midi": [
            ("m", "learn"),
            ("c", "clear"),
            ("p", "panic"),
        ],
        "settings": [
            ("1-4", "section"),
            ("a", "expand all"),
            ("c", "collapse"),
            ("T", "test audio"),
        ],
        "backup": [
            ("Enter", "select"),
            ("n", "new backup"),
            ("r", "restore"),
            ("d", "delete"),
        ],
        "monitor": [
            ("1-9", "service"),
            ("Tab", "panel"),
            ("a", "alerts"),
            ("l", "logs"),
        ],
        "diagnostics": [
            ("t", "test"),
            ("l", "logs"),
            ("c", "clear"),
        ],
        "stage": [
            ("Space", "toggle"),
            ("n/p", "prev/next"),
        ],
        "lcd": [
            ("Enter", "configure"),
            ("t", "test"),
            ("r", "reset"),
        ],
    }

    def __init__(
        self,
        api_client: Optional[Any] = None,
        id: Optional[str] = None,
        classes: Optional[str] = None,
    ):
        """
        Initialize dynamic footer.

        Args:
            api_client: MAP2 API client for status
            id: Widget ID
            classes: CSS classes
        """
        super().__init__(id=id, classes=classes)
        self._api_client = api_client
        self._current_screen = "dashboard"
        self._ws_connected = False
        self._api_connected = True

    def compose(self) -> ComposeResult:
        """Compose the footer layout."""
        with Horizontal():
            yield Label("", id="footer-context", classes="footer-left")
            yield Label("", id="footer-global", classes="footer-center")
            yield Label("", id="footer-status", classes="footer-right")

    def on_mount(self) -> None:
        """Initialize footer content."""
        self._update_display()
        self.set_interval(5.0, self._check_status)

    def set_screen(self, screen_name: str) -> None:
        """
        Update footer for the current screen.

        Args:
            screen_name: Name of the current screen
        """
        self._current_screen = screen_name.lower()
        self._update_display()

    def _update_display(self) -> None:
        """Update the footer display."""
        try:
            # Update context-specific bindings
            context_label = self.query_one("#footer-context", Label)
            context_bindings = self.SCREEN_BINDINGS.get(self._current_screen, [])
            context_text = self._format_bindings(context_bindings)
            context_label.update(context_text)

            # Update global bindings
            global_label = self.query_one("#footer-global", Label)
            global_text = self._format_bindings(self.GLOBAL_BINDINGS)
            global_label.update(global_text)

            # Update status
            status_label = self.query_one("#footer-status", Label)
            status_text = self._format_status()
            status_label.update(status_text)

        except Exception as e:
            logger.debug(f"Error updating footer: {e}")

    def _format_bindings(self, bindings: List[Tuple[str, str]]) -> Text:
        """
        Format keybindings as rich text.

        Args:
            bindings: List of (key, action) tuples

        Returns:
            Formatted Rich Text
        """
        text = Text()
        for i, (key, action) in enumerate(bindings):
            if i > 0:
                text.append(" ")
            text.append(f" {key} ", style="bold reverse")
            text.append(f" {action}", style="dim")
        return text

    def _format_status(self) -> Text:
        """
        Format connection status.

        Returns:
            Formatted Rich Text with status indicators
        """
        text = Text()

        # API status
        if self._api_connected:
            text.append("● ", style="green bold")
            text.append("API ", style="dim")
        else:
            text.append("○ ", style="red bold")
            text.append("API ", style="dim")

        # WebSocket status
        if self._ws_connected:
            text.append("● ", style="green bold")
            text.append("WS", style="dim")
        else:
            text.append("○ ", style="yellow bold")
            text.append("WS", style="dim")

        return text

    async def _check_status(self) -> None:
        """Check API and WebSocket status."""
        if not self._api_client:
            return

        try:
            # Check API
            result = await self._api_client.get_health()
            self._api_connected = result.success

            # Check WebSocket (if available)
            if hasattr(self._api_client, 'ws_connected'):
                self._ws_connected = self._api_client.ws_connected

            self._update_display()
        except Exception:
            self._api_connected = False
            self._update_display()

    def set_ws_status(self, connected: bool) -> None:
        """
        Update WebSocket connection status.

        Args:
            connected: Whether WebSocket is connected
        """
        self._ws_connected = connected
        self._update_display()


class CompactFooter(Static):
    """
    Compact single-line footer with essential keybindings.

    Features:
    - Single line height
    - Most important keybindings only
    - Status indicator on right
    """

    DEFAULT_CSS = """
    CompactFooter {
        width: 100%;
        height: 1;
        background: $primary-darken-3;
        color: $text-muted;
        content-align: center middle;
    }
    """

    def __init__(
        self,
        api_client: Optional[Any] = None,
        id: Optional[str] = None,
        classes: Optional[str] = None,
    ):
        super().__init__(id=id, classes=classes)
        self._api_client = api_client
        self._status = "●"

    def compose(self) -> ComposeResult:
        """Compose compact footer."""
        yield Label(self._render(), id="compact-content")

    def _render(self) -> Text:
        """Render the compact footer content."""
        text = Text()
        text.append("  ")

        # Essential keybindings
        bindings = [
            ("←→", "tabs"),
            ("r", "refresh"),
            ("Ctrl+T", "theme"),
            ("F1", "help"),
            ("q", "quit"),
        ]

        for i, (key, action) in enumerate(bindings):
            if i > 0:
                text.append("  │  ", style="dim")
            text.append(key, style="bold")
            text.append(f" {action}", style="dim")

        # Status on right
        text.append("  │  ", style="dim")
        text.append(self._status, style="green bold" if self._status == "●" else "red bold")

        return text

    def set_status(self, connected: bool) -> None:
        """Update connection status."""
        self._status = "●" if connected else "○"
        try:
            label = self.query_one("#compact-content", Label)
            label.update(self._render())
        except Exception:
            pass

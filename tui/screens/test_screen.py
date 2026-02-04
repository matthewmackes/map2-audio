"""Minimal test screen to verify layout works."""

from textual.app import ComposeResult
from textual.widgets import Static, Label


class TestScreen(Static):
    """Minimal test screen with visible content."""

    DEFAULT_CSS = """
    TestScreen {
        width: 100%;
        height: 100%;
        background: $surface;
        layout: vertical;
        padding: 2;
    }

    TestScreen > Label {
        width: 100%;
        height: auto;
        background: $surface;
        color: $text;
    }
    """

    def __init__(self, api_client=None, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client

    def compose(self) -> ComposeResult:
        """Compose test content."""
        yield Label("[bold]TEST SCREEN[/bold]")
        yield Label("")
        yield Label("If you see this text, the layout is working correctly!")
        yield Label("")
        yield Label("Line 1: This is visible")
        yield Label("Line 2: This is visible")
        yield Label("Line 3: This is visible")

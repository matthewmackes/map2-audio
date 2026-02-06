"""Help & About Screen - Documentation and information."""

try:
    from textual.app import ComposeResult
    from textual.containers import Vertical, Container
    from textual.widgets import Static, Label, Button
    from textual.binding import Binding
except ImportError:
    pass


class HelpScreen(Static):
    """Help and about information."""

    DEFAULT_CSS = """
    HelpScreen {
        width: 100%;
        height: 100%;
        background: $surface;
        layout: vertical;
    }

    #help-header {
        width: 100%;
        height: 2;
        background: $panel;
        border-bottom: solid $primary;
        padding: 1 2;
        dock: top;
    }

    #help-content {
        width: 100%;
        height: 1fr;
        padding: 2;
        overflow: auto;
    }

    #help-toolbar {
        width: 100%;
        height: 1;
        background: $panel;
        border-top: solid $primary;
        padding: 0 1;
        dock: bottom;
    }
    """

    BINDINGS = [
        Binding("q", "quit", "Quit", show=True),
    ]

    def compose(self) -> ComposeResult:
        with Vertical():
            with Container(id="help-header"):
                yield Label("Help & About", classes="header-title")

            with Vertical(id="help-content"):
                yield Label("MAP2 Audio Cluster Management TUI", id="title")
                yield Label("")
                yield Label("VERSION: 1.0.0", id="version")
                yield Label("DATE: February 6, 2026", id="date")
                yield Label("")
                yield Label("KEYBOARD SHORTCUTS:")
                yield Label("  1 - Dashboard")
                yield Label("  2 - Flow Assignment Matrix")
                yield Label("  3 - Node Recommendations")
                yield Label("  4 - Failover Controller")
                yield Label("  5 - Cluster Diagnostics")
                yield Label("  6 - Settings")
                yield Label("  Ctrl+R - Reconnect to cluster")
                yield Label("  Ctrl+Q - Quit application")
                yield Label("")
                yield Label("FEATURES:")
                yield Label("  • Real-time cluster monitoring")
                yield Label("  • Node management and health tracking")
                yield Label("  • Flow assignment & recommendations")
                yield Label("  • Failover management")
                yield Label("  • Batch operations")
                yield Label("  • Cluster diagnostics")
                yield Label("")
                yield Label("SUPPORT: See documentation for detailed help")

            yield Button("Close", id="btn-close")

    def action_quit(self) -> None:
        self.app.exit()

    async def on_button_pressed(self, event: "Button.Pressed") -> None:
        """Handle button press."""
        if event.button.id == "btn-close":
            self.action_quit()

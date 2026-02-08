"""
Help / About screen.

Displays:
  • Keyboard shortcuts reference
  • Version & build info
  • Quick diagnostic commands
  • Future extension points
"""

from __future__ import annotations

from textual.app import ComposeResult
from textual.containers import Vertical
from textual.widgets import DataTable, Label, Static

from .. import __app_name__, __version__


_SHORTCUTS = [
    ("F1", "Show this help screen"),
    ("F5", "Force refresh all data"),
    ("1–6", "Switch to tab 1–6"),
    ("Tab / Shift+Tab", "Next / previous widget"),
    ("↑ ↓ ← →", "Navigate within tables & lists"),
    ("Enter", "Activate / confirm selection"),
    ("Escape", "Close modal / cancel"),
    ("r", "Refresh current view"),
    ("m", "Go to Mode & Actions"),
    ("l", "Go to Logs"),
    ("d", "Go to Dashboard"),
    ("q", "Quit application"),
    ("Ctrl+C", "Force quit"),
]


class HelpPane(Static):
    """Help & About tab content."""

    def compose(self) -> ComposeResult:
        # ── About ────────────────────────────────────────────────────
        with Vertical(classes="section-box"):
            yield Label("ℹ  About", classes="help-title")
            yield Static(
                f"[bold]{__app_name__}[/bold]  v{__version__}\n"
                f"\n"
                f"Professional TUI for headless MAP2 Audio Platform nodes.\n"
                f"Designed for sysadmins, audio engineers, and DevOps.\n"
                f"\n"
                f"Built with [bold]Textual[/bold] — the modern Python TUI framework.\n"
                f"Backend: FastAPI on localhost:8080\n"
                f"Audio: JUCE engine + Pipewire + NeuralAmpModeler",
                id="help-about",
            )

        # ── Keyboard shortcuts ───────────────────────────────────────
        with Vertical(classes="section-box"):
            yield Label("⌨  Keyboard Shortcuts", classes="help-title")
            yield DataTable(id="help-shortcuts-table")

        # ── Diagnostics ──────────────────────────────────────────────
        with Vertical(classes="section-box"):
            yield Label("🔍 Quick Diagnostics", classes="help-title")
            yield Static(
                "Run these from a separate terminal for troubleshooting:\n"
                "\n"
                "  [bold]systemctl status map2-backend[/bold]\n"
                "    → Check backend service status\n"
                "\n"
                "  [bold]pw-cli info all[/bold]\n"
                "    → Pipewire node information\n"
                "\n"
                "  [bold]pw-top[/bold]\n"
                "    → Real-time Pipewire performance monitor\n"
                "\n"
                "  [bold]journalctl -u map2-backend -f[/bold]\n"
                "    → Live backend logs\n"
                "\n"
                "  [bold]curl localhost:8080/api/health | python -m json.tool[/bold]\n"
                "    → API health check\n"
                "\n"
                "  [bold]cat /etc/guitarfx-mode.conf[/bold]\n"
                "    → Current node mode configuration",
                id="help-diagnostics",
            )

        # ── Extension points ─────────────────────────────────────────
        with Vertical(classes="section-box"):
            yield Label("🔌 Extension Points", classes="help-title")
            yield Static(
                "The TUI is designed for extensibility:\n"
                "\n"
                "  • Add new tabs in [bold]app.py[/bold] compose()\n"
                "  • Custom widgets go in [bold]tui/node_console/widgets/[/bold]\n"
                "  • New data sources: extend [bold]collectors.py[/bold]\n"
                "  • Plugin screens for third-party integrations\n"
                "  • Grafana/Prometheus metrics export screen\n"
                "  • Preset management & plugin browser screens\n"
                "  • Multi-node fleet overview (for management nodes)",
                id="help-extensions",
            )

    def on_mount(self) -> None:
        table = self.query_one("#help-shortcuts-table", DataTable)
        table.add_columns("Key", "Action")
        table.cursor_type = "none"
        table.zebra_stripes = True
        for key, desc in _SHORTCUTS:
            table.add_row(f"[bold yellow]{key}[/bold yellow]", desc)

    def refresh_snapshot(self, snap) -> None:
        """Help pane is static — no snapshot needed."""
        pass

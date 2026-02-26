"""
installer/ui/widgets/help_overlay.py
======================================
Modal overlays for:
  • HelpOverlay      — F1/? context-sensitive educational help
  • ConfirmQuitOverlay — Ctrl+C quit confirmation
  • LogViewerOverlay — Ctrl+L installer log viewer

Anaconda analogy:
  Anaconda's TUI displays a '?' key hint in the footer.  Pressing it shows
  a full-page help screen for the current spoke.  We implement this as a
  Textual ModalScreen — an overlay that appears above the current screen
  and can be dismissed with Escape.

Educational design:
  Help text is written in plain, educational prose — not just a command
  reference.  It explains WHY each setting matters, gives a pro tip,
  and warns of the most common mistake.  This turns the installer into
  a learning experience as well as a setup tool.
"""

from __future__ import annotations

from pathlib import Path

from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Center, Vertical
from textual.screen import ModalScreen
from textual.widgets import Button, Footer, Label, Markdown, RichLog, Static


class HelpOverlay(ModalScreen):
    """
    F1/? context-sensitive help modal.

    Displays the current screen's help_text property as formatted Markdown
    in a centred modal panel.  Dismissed with Escape or the Close button.
    """

    BINDINGS = [
        Binding("escape", "dismiss", "Close", show=True),
        Binding("q",      "dismiss", "Close", show=False),
    ]

    CSS = """
    HelpOverlay {
        align: center middle;
    }
    #help-dialog {
        width: 80;
        max-height: 90%;
        background: $surface;
        border: double $accent;
        padding: 1 2;
    }
    #help-title {
        color: $accent;
        text-style: bold;
        text-align: center;
        border-bottom: thin $primary;
        padding-bottom: 1;
        margin-bottom: 1;
    }
    #help-content {
        height: 1fr;
        overflow-y: auto;
    }
    #close-btn {
        margin-top: 1;
        align: center middle;
        width: 100%;
    }
    """

    def __init__(self, help_text: str, title: str = "Help", **kwargs):
        super().__init__(**kwargs)
        self._help_text = help_text
        self._title     = title

    def compose(self) -> ComposeResult:
        with Vertical(id="help-dialog"):
            yield Label(f"Help: {self._title}", id="help-title")
            yield Markdown(self._help_text, id="help-content")
            yield Button("Close (Escape)", id="close-btn", variant="default")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        self.dismiss()


class ConfirmQuitOverlay(ModalScreen):
    """
    Ctrl+C quit confirmation modal.

    Prevents accidental exits by requiring explicit confirmation.
    Shows a summary of what will be lost if the user quits mid-install.
    """

    BINDINGS = [
        Binding("escape", "dismiss", "Cancel", show=True),
    ]

    CSS = """
    ConfirmQuitOverlay { align: center middle; }
    #quit-dialog {
        width: 60;
        height: 12;
        background: $surface;
        border: double $error;
        padding: 1 2;
        align: center middle;
    }
    #quit-title { color: $error; text-style: bold; text-align: center; }
    #quit-btns  { margin-top: 2; align: center middle; }
    """

    def compose(self) -> ComposeResult:
        with Vertical(id="quit-dialog"):
            yield Label("Quit Installer?", id="quit-title")
            yield Static(
                "Your configuration choices will be lost.\n"
                "Any partially-completed install stages are NOT rolled back.\n\n"
                "Press Ctrl+S first to save a Kickstart YAML if you want to resume later."
            )
            with Center(id="quit-btns"):
                yield Button("Keep Installing", id="keep-btn", variant="success")
                yield Button("Quit",            id="quit-btn", variant="error")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "quit-btn":
            self.app.exit(return_code=3)
        else:
            self.dismiss()


class LogViewerOverlay(ModalScreen):
    """
    Ctrl+L installer log viewer overlay.

    Reads the installer log file and displays the last N lines in a
    scrollable RichLog widget.  Useful for diagnosing failures without
    leaving the installer.
    """

    BINDINGS = [
        Binding("escape", "dismiss", "Close", show=True),
        Binding("r",      "refresh", "Refresh", show=True),
    ]

    LOG_PATHS = [
        "/var/log/map2-installer.log",
        "/tmp/map2-installer-debug.log",
    ]
    TAIL_LINES = 200

    CSS = """
    LogViewerOverlay { align: center middle; }
    #log-dialog {
        width: 90%;
        height: 90%;
        background: $surface;
        border: double $primary;
        padding: 1;
    }
    #log-title { color: $primary; text-style: bold; margin-bottom: 1; }
    #log-view  { height: 1fr; }
    """

    def compose(self) -> ComposeResult:
        with Vertical(id="log-dialog"):
            yield Label("Installer Log (Escape to close, R to refresh)", id="log-title")
            yield RichLog(id="log-view", highlight=False, markup=False)
            yield Button("Close", id="close-btn", variant="default")

    def on_mount(self) -> None:
        self._load_log()

    def action_refresh(self) -> None:
        log = self.query_one("#log-view", RichLog)
        log.clear()
        self._load_log()

    def _load_log(self) -> None:
        log = self.query_one("#log-view", RichLog)
        for path in self.LOG_PATHS:
            p = Path(path)
            if p.exists():
                try:
                    lines = p.read_text(errors="replace").splitlines()
                    log.write(f"=== {path} (last {self.TAIL_LINES} lines) ===")
                    for line in lines[-self.TAIL_LINES:]:
                        log.write(line)
                    return
                except Exception as e:
                    log.write(f"Error reading {path}: {e}")
        log.write("No log file found.  Log will appear here during installation.")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        self.dismiss()

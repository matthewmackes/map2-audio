"""
installer/installer.py
=======================
MAP2InstallerApp — the root Textual Application class.

Anaconda analogy:
  This is the equivalent of Anaconda's main hub screen and screen router.
  It owns the screen stack (like Anaconda's spoke/hub model), holds the
  shared InstallerConfig, and manages forward/back navigation between stages.

Architecture:
  - SCREEN_SEQUENCE lists the stage screens in order (index = stage number).
  - action_next_screen / action_prev_screen push/pop screens on the Textual
    screen stack, preserving state when going back.
  - The config object lives on the App so all screens share one instance.
  - Theme is selected at startup based on terminal capabilities.

Navigation model:
  Textual's screen stack works like a browser history: push_screen() adds
  a screen on top, pop_screen() returns to the previous.  We keep a
  separate _stage_index so we know where we are in the linear sequence
  regardless of how many times the user went back.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from typing import List, Optional, Type

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.widgets import Footer, Header  # noqa: F401 — used by screens, not app

from installer.config.schema import InstallerConfig, InstallMode


class MAP2InstallerApp(App):
    """
    Root Textual application for the MAP2 Enterprise Installer.

    Owns:
      self.config         — shared InstallerConfig (all screens read/write this)
      self._stage_index   — current position in SCREEN_SEQUENCE
      self._dry_run       — if True, no system changes are made
    """

    CSS_PATH = Path(__file__).parent / "ui" / "styles" / "main.tcss"

    TITLE    = "MAP2 Audio Platform Installer"
    SUB_TITLE = "Enterprise Edition — v1.0.0"

    BINDINGS = [
        Binding("ctrl+q", "quit",        "Quit",    show=True),
        Binding("ctrl+s", "save_ks",     "Save KS", show=True),
        Binding("ctrl+l", "show_log",    "Log",     show=True),
        # ctrl+n / escape / f1 are handled per-screen in BaseInstallerScreen
        # ctrl+p is reserved by Textual's built-in command palette
    ]

    # ── Screen sequence (one entry per installer stage) ───────────────────────
    # Loaded lazily so import errors in one screen don't crash the whole app.
    SCREEN_SEQUENCE: List[str] = [
        "welcome",           # Stage 00: splash + environment detection
        "mode",              # Stage 01: audio / all-in-one / management / custom
        "network",           # Stage 02: network config + live connectivity test
        "storage",           # Stage 03: install paths + disk space check
        "software",          # Stage 04: component checklist
        "audio",             # Stage 05: audio interface + buffer size
        "realtime",          # Stage 06: RT scheduling + GRUB cmdline preview
        "users",             # Stage 07: user account + password strength
        "review",            # Stage 08: KS-like dry-run summary
        "install_progress",  # Stage 09: live install with log + progress bars
        "verify",            # Stage 10: post-install health checklist
    ]

    # ── Initialisation ────────────────────────────────────────────────────────

    def __init__(
        self,
        config: Optional[InstallerConfig] = None,
        dry_run: bool = False,
        start_stage: int = 0,
        **kwargs,
    ):
        super().__init__(**kwargs)
        # The shared config object — every screen reads from and writes to this
        self.config    = config or InstallerConfig()
        self.config.dry_run = dry_run
        self._dry_run  = dry_run
        self._stage_index = start_stage

    # ── Compose (initial render) ───────────────────────────────────────────────

    def compose(self) -> ComposeResult:
        """
        The App compose() is intentionally empty — each stage Screen owns its
        own Header/Footer.  Yielding them here would create duplicate chrome
        widgets and corrupt the screen layout in Textual 7.x.
        """
        yield from []

    def on_mount(self) -> None:
        """Push the first stage screen after the app shell is ready."""
        self._push_stage(self._stage_index)

    # ── Screen management ─────────────────────────────────────────────────────

    def _load_screen(self, name: str):
        """
        Lazily import and instantiate a stage screen by name.

        Lazy loading means a syntax error in one screen module won't prevent
        the installer from starting — it will only fail when that screen is
        actually navigated to.  This matches Anaconda's spoke-loading behaviour.
        """
        import importlib
        try:
            mod = importlib.import_module(f"installer.ui.screens.{name}")
            # Convention: each screen module exports a class named after the
            # module in PascalCase, e.g. 'welcome' → WelcomeScreen
            class_name = "".join(w.title() for w in name.split("_")) + "Screen"
            cls = getattr(mod, class_name)
            return cls()
        except (ImportError, AttributeError) as e:
            # Graceful degradation: show a placeholder screen for missing stages
            return self._placeholder_screen(name, str(e))

    def _placeholder_screen(self, name: str, error: str):
        """Return a simple error screen for unimplemented stages."""
        from textual.screen import Screen
        from textual.widgets import Label, Static

        class PlaceholderScreen(Screen):
            BINDINGS = [Binding("ctrl+n", "app.next_screen", "Next"), Binding("escape", "app.prev_screen", "Back")]
            def compose(self):
                yield Header()
                yield Static(f"[bold red]Stage '{name}' not yet implemented[/]\n\n{error}", id="placeholder")
                yield Footer()

        return PlaceholderScreen()

    def _push_stage(self, index: int) -> None:
        """Push the stage screen at `index` onto the screen stack."""
        if 0 <= index < len(self.SCREEN_SEQUENCE):
            name = self.SCREEN_SEQUENCE[index]
            screen = self._load_screen(name)
            self.push_screen(screen)

    # ── Navigation actions (called by BaseInstallerScreen) ────────────────────

    def action_next_screen(self) -> None:
        """Advance to the next stage screen."""
        next_index = self._stage_index + 1
        if next_index >= len(self.SCREEN_SEQUENCE):
            self.notify("Installation complete!", title="Done", severity="information")
            return
        self._stage_index = next_index
        self._push_stage(self._stage_index)

    def action_prev_screen(self) -> None:
        """Return to the previous stage screen."""
        if self._stage_index == 0:
            self.notify("Already at the first screen.", severity="warning")
            return
        self._stage_index -= 1
        self.pop_screen()

    # ── Bound to BINDINGS above ───────────────────────────────────────────────

    def action_save_ks(self) -> None:
        """Ctrl+S — save current config to kickstart YAML."""
        from installer.config.kickstart import save_kickstart
        ks_path = Path("/tmp/map2-ks.yaml")
        save_kickstart(self.config, ks_path)
        self.notify(f"Kickstart saved to {ks_path}", title="Saved", severity="information")

    def action_show_log(self) -> None:
        """Ctrl+L — open the installer log viewer overlay."""
        from installer.ui.widgets.help_overlay import LogViewerOverlay
        self.push_screen(LogViewerOverlay())

    def action_help(self) -> None:
        """F1 — delegate to the current screen's help action."""
        if isinstance(self.screen, object) and hasattr(self.screen, "action_show_help"):
            self.screen.action_show_help()

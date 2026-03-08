"""
installer/ui/screens/_base.py
==============================
BaseInstallerScreen — the parent class every stage screen inherits from.

Anaconda analogy:
  Anaconda's TUI screens all share a common chrome: a title bar, a help line
  at the bottom listing active keys, and a consistent navigation model
  (b=back, c=continue, r=refresh, !=shell).  Our BaseInstallerScreen provides
  the same contract so users have a predictable experience across all stages.

Design decisions:
  - Every screen stores a reference to `app.config` (InstallerConfig) so
    screens can read prior choices and write their own without passing data
    through constructors.
  - help_text property: override in subclass to provide F1/? context.
  - validate() method: override to return list[str] of error messages;
    returning [] means the screen is valid and the user can advance.
  - on_key binding for F1/? opens the HelpOverlay modal.
  - SCREEN_TITLE and SCREEN_SUBTITLE define the header text.
"""

from __future__ import annotations

from typing import ClassVar, List

from textual.app import ComposeResult
from textual.binding import Binding
from textual.screen import Screen
from textual.widgets import Footer, Header, Label, Static


class BaseInstallerScreen(Screen):
    """
    Parent class for all MAP2 installer stage screens.

    Subclass and override:
        SCREEN_TITLE    – shown in the header
        SCREEN_SUBTITLE – shown below the title
        compose()       – build the UI widgets
        validate()      – return list[str] of validation errors
        help_text       – property returning educational help string
        on_mount()      – called after widgets are mounted (run live checks here)
    """

    # Subclasses set these to customise the header
    SCREEN_TITLE:    ClassVar[str] = "MAP2 Installer"
    SCREEN_SUBTITLE: ClassVar[str] = ""

    # Anaconda-style key bindings shown in the Footer widget
    # Each screen can extend this list in its own BINDINGS
    BINDINGS = [
        Binding("f1",         "show_help",   "Help",     show=True),
        Binding("question_mark", "show_help", "?=Help",  show=False),
        Binding("ctrl+c",     "quit_confirm","Quit",     show=True),
        Binding("escape",     "go_back",     "Back",     show=True),
        Binding("ctrl+n",     "go_next",     "Next",     show=True),
    ]

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def compose(self) -> ComposeResult:
        """
        Default compose — subclasses call super().compose() then yield their
        own widgets, OR override entirely and include Header/Footer themselves.
        """
        yield Header(show_clock=True)
        yield Footer()

    def on_mount(self) -> None:
        """Called after the screen is mounted. Override for async init tasks."""
        self.title    = self.SCREEN_TITLE
        self.sub_title = self.SCREEN_SUBTITLE

    # ── Config access ─────────────────────────────────────────────────────────

    @property
    def config(self):
        """
        Convenience access to the shared InstallerConfig stored on the App.
        All screens read from and write to this single config object so that
        choices made in earlier screens are visible to later ones.
        """
        return self.app.config  # type: ignore[attr-defined]

    # ── Validation ────────────────────────────────────────────────────────────

    def validate(self) -> List[str]:
        """
        Return a list of human-readable error strings.

        An empty list means the screen is valid and the user may advance.
        Each error string is shown as a red inline message beneath the field
        that triggered it.

        Override in subclasses with real-time field checks.
        """
        return []

    # ── Help system ───────────────────────────────────────────────────────────

    @property
    def help_text(self) -> str:
        """
        Educational help content for this screen.

        Override in subclasses to provide context-sensitive F1/? help.
        Should include: what this screen does, why the choices matter,
        a PRO TIP, and a COMMON PITFALL.
        """
        return (
            f"# {self.SCREEN_TITLE}\n\n"
            f"{self.SCREEN_SUBTITLE}\n\n"
            "No additional help available for this screen.\n\n"
            "Navigate with Tab / Shift-Tab.  Press Enter to activate buttons.\n"
            "Press Ctrl+N to advance, Escape to go back."
        )

    def action_show_help(self) -> None:
        """Open the F1/? help overlay for this screen."""
        from installer.ui.widgets.help_overlay import HelpOverlay
        self.app.push_screen(HelpOverlay(self.help_text, self.SCREEN_TITLE))

    # ── Navigation ────────────────────────────────────────────────────────────

    def action_go_next(self) -> None:
        """
        Validate then advance to the next stage screen.

        Like Anaconda's 'c' key (continue), this checks all validators before
        allowing the user to proceed.  Errors are shown inline rather than
        blocking navigation with a modal — users can see exactly which field
        failed and why.
        """
        errors = self.validate()
        if errors:
            self.app.notify(
                "\n".join(errors),
                title="Validation errors — please fix before continuing",
                severity="error",
                timeout=6,
            )
            return
        self.app.action_next_screen()

    def action_go_back(self) -> None:
        """Go back to the previous screen (Anaconda: 'b' key)."""
        self.app.action_prev_screen()

    def action_quit_confirm(self) -> None:
        """Prompt before quitting so users don't lose partial config."""
        from installer.ui.widgets.help_overlay import ConfirmQuitOverlay
        self.app.push_screen(ConfirmQuitOverlay())

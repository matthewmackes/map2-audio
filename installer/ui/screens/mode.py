"""
installer/ui/screens/mode.py
=============================
Stage 01 — Installation Mode Selection.

Anaconda analogy:
  Anaconda's "Installation Type" screen lets users choose between:
  Workstation, Server, Minimal, Custom.  Our mode picker does the same
  for MAP2: audio node / all-in-one / management / custom.

  Like Anaconda, selecting a mode pre-populates all subsequent screens
  with sensible defaults — the user only needs to change what differs
  from the mode's standard configuration.

Educational design:
  Each mode card shows a one-line summary AND a detailed explanation
  (accessible via the detail expander or F1).  Users learn what each
  mode does, why it exists, and what trade-offs it makes.
"""

from __future__ import annotations

from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import ScrollableContainer, Vertical
from textual.widgets import Button, Footer, Header, Label, RadioButton, RadioSet, Rule, Static

from installer.config.defaults import MODE_DESCRIPTIONS, config_for_mode
from installer.config.schema import InstallMode
from installer.ui.screens._base import BaseInstallerScreen


class ModeScreen(BaseInstallerScreen):

    SCREEN_TITLE    = "Installation Mode"
    SCREEN_SUBTITLE = "Choose how this machine will function in the MAP2 network"

    BINDINGS = BaseInstallerScreen.BINDINGS + [
        Binding("ctrl+n", "go_next", "Select Mode ▶", show=True),
    ]

    CSS = """
    ModeScreen { background: $surface; }
    #mode-intro {
        margin: 1 4;
        color: $text-muted;
    }
    #mode-set {
        margin: 0 4;
        border: round $primary;
        padding: 1;
        height: auto;
    }
    .mode-card {
        margin: 0 0 1 0;
        padding: 0 1;
        border-left: tall $primary;
        height: auto;
    }
    .mode-label {
        text-style: bold;
    }
    .mode-summary {
        color: $text-muted;
    }
    #detail-box {
        margin: 1 4;
        border: round $accent;
        padding: 1;
        height: auto;
    }
    #detail-title {
        color: $accent;
        text-style: bold;
    }
    """

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        yield Static(
            "Select the role this machine will play in the MAP2 Audio Platform network.\n"
            "Your choice sets default values for all subsequent screens — you can still "
            "override any individual setting.",
            id="mode-intro",
        )
        with ScrollableContainer():
            with RadioSet(id="mode-set"):
                for mode in InstallMode:
                    desc = MODE_DESCRIPTIONS[mode]
                    yield RadioButton(
                        f"{desc['icon']}  {desc['label']} — {desc['summary']}",
                        value=(mode == InstallMode.AUDIO),  # Default selection
                        id=f"mode-{mode.value}",
                        name=mode.value,
                    )
            Rule()
            with Vertical(id="detail-box"):
                yield Label("Mode Detail", id="detail-title")
                yield Static(MODE_DESCRIPTIONS[InstallMode.AUDIO]["detail"], id="detail-text")
        yield Footer()

    def on_mount(self) -> None:
        super().on_mount()
        # Show detail for the default (audio) mode
        self._update_detail(InstallMode.AUDIO)

    def on_radio_set_changed(self, event: RadioSet.Changed) -> None:
        """Update the detail panel and config when the user changes mode."""
        selected_name = event.pressed.name
        try:
            mode = InstallMode(selected_name)
            self._update_detail(mode)
            # Update the shared config with mode-appropriate defaults
            new_config = config_for_mode(mode)
            self.config.mode     = new_config.mode
            self.config.software = new_config.software
            self.config.realtime = new_config.realtime
            self.config.audio    = new_config.audio
        except ValueError:
            pass

    def _update_detail(self, mode: InstallMode) -> None:
        """Update the detail text panel for the selected mode."""
        desc = MODE_DESCRIPTIONS[mode]
        detail_box = self.query_one("#detail-box")
        detail_box.query_one("#detail-title", Label).update(
            f"{desc['icon']}  {desc['label']}"
        )
        detail_box.query_one("#detail-text", Static).update(desc["detail"])

    @property
    def help_text(self) -> str:
        return """\
# Installation Mode

MAP2 supports four operating modes, each optimised for a different role:

## audio — Dedicated Audio Processing Node
The lowest-latency configuration. The JUCE engine and LV2 plugins are
installed; the web frontend is omitted to reduce background CPU load.
CPU cores 4,5 are isolated with isolcpus for the audio callback thread.

Use this for: stage or studio hardware whose only job is running MAP2.

## all-in-one — Full Stack on One Machine
The complete MAP2 stack: audio engine + web UI + cluster manager.
Slightly larger buffer size recommended (128 vs 64 samples) because the
web server runs alongside the audio engine.

Use this for: development machines, rehearsal rooms, small venues.

## management — Orchestration / Monitoring Node
No audio engine. Installs the web dashboard and cluster manager so you
can monitor and control a fleet of audio nodes from one machine.

Use this for: a backstage laptop that controls multiple stage audio nodes.

## custom — Expert Configuration
All components are off by default. You select exactly what to install.
Useful for integrating MAP2 into an existing system.

## Pro Tip
The mode you select here sets DEFAULT values for all later screens —
you are not locked in. For example, you can select 'audio' mode and
then manually enable the frontend in the Software Selection screen.

## Common Pitfall
Don't run 'audio' mode on a machine that also runs a desktop environment.
The GNOME or KDE compositor competes for CPU time on the non-isolated
cores, causing occasional dropouts during heavy rendering operations.

Navigate: Tab / Shift-Tab │ Help: F1 │ Next: Ctrl+N │ Back: Escape
"""

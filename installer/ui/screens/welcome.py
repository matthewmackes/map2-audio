"""
installer/ui/screens/welcome.py
================================
Stage 00 — Welcome Screen + Automatic Environment Detection.

Anaconda analogy:
  Anaconda's first TUI screen shows the product name, detected hardware
  summary, and asks the user to choose a language.  We split language into
  a later screen and focus Stage 00 on a rich hardware detection panel,
  giving users immediate feedback on whether their system meets requirements.

  Like Anaconda's 'loading hardware' phase, detection runs asynchronously
  in the background so the UI remains responsive.

Design decisions:
  - Detection runs in a Worker (Textual's async background task) so the TUI
    doesn't freeze during /proc reads and subprocess calls.
  - Each detected item appears progressively as it resolves.
  - Warnings (insufficient RAM, no audio devices) appear as amber badges.
  - The user can press Ctrl+N to proceed even while detection is still running,
    but warnings will re-display on the next screen that needs the data.
"""

from __future__ import annotations

import asyncio

from textual import work
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import ScrollableContainer, Vertical, Horizontal
from textual.widgets import (
    Button, Footer, Header, Label, LoadingIndicator, ProgressBar,
    RichLog, Rule, Static,
)

from installer.ui.screens._base import BaseInstallerScreen


class WelcomeScreen(BaseInstallerScreen):

    SCREEN_TITLE    = "MAP2 Audio Platform Installer"
    SCREEN_SUBTITLE = "Enterprise Edition — Real-Time Audio System Setup"

    BINDINGS = BaseInstallerScreen.BINDINGS + [
        Binding("ctrl+n", "go_next",  "Begin Setup ▶", show=True),
    ]

    CSS = """
    WelcomeScreen {
        background: $surface;
    }
    #banner {
        color: $accent;
        text-align: center;
        padding: 1 2;
        border: double $accent;
        margin: 1 4;
    }
    #detect-panel {
        height: auto;
        margin: 0 4;
        border: round $primary;
        padding: 1;
    }
    #detect-title {
        color: $primary;
        text-style: bold;
        margin-bottom: 1;
    }
    #warnings-panel {
        height: auto;
        margin: 0 4;
        border: round $warning;
        padding: 1;
        display: none;
    }
    #warnings-panel.visible {
        display: block;
    }
    .warning-item {
        color: $warning;
    }
    .pass-item {
        color: $success;
    }
    .fail-item {
        color: $error;
    }
    #spinner {
        height: 1;
        margin: 0 4;
    }
    #actions {
        dock: bottom;
        height: 3;
        align: center middle;
        margin: 1 4;
    }
    """

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        yield Static(
            "[bold]MAP2 Audio Platform[/bold]\n"
            "[dim]Enterprise Educational Installer — v1.0.0[/dim]\n\n"
            "[italic]Anaconda-inspired · Textual TUI · Kickstart-compatible[/italic]",
            id="banner",
        )
        with ScrollableContainer():
            with Vertical(id="detect-panel"):
                yield Label("System Detection", id="detect-title")
                yield LoadingIndicator(id="spinner")
                yield RichLog(id="detect-log", highlight=True, markup=True)
            with Vertical(id="warnings-panel"):
                yield Label("[bold yellow]Warnings / Recommendations[/bold yellow]")
                yield Static("", id="warnings-content")
        yield Footer()

    def on_mount(self) -> None:
        super().on_mount()
        self.run_detection()

    @work(exclusive=True, thread=True)
    def run_detection(self) -> None:
        """
        Run system detection in a background thread so the TUI stays responsive.

        Textual Workers run in a thread pool; we post updates back to the main
        thread via self.app.call_from_thread().
        """
        from installer.backend.system import detect_system

        log = self.query_one("#detect-log", RichLog)

        def post(msg: str) -> None:
            self.app.call_from_thread(log.write, msg)

        post("[bold cyan]── Environment Detection ──[/bold cyan]")
        post("Scanning system hardware and software…")

        try:
            sysinfo = detect_system()
            # Store on app so later screens can access it without re-detecting
            self.app.call_from_thread(setattr, self.app, "_sysinfo", sysinfo)

            post(f"\n[green]✓[/green] OS:      {sysinfo.os_version} / {sysinfo.kernel}")
            post(f"[green]✓[/green] CPU:     {sysinfo.cpu.model}")
            post(f"    Cores: {sysinfo.cpu.cores}  "
                 f"Isolated: {sysinfo.cpu.isolated or 'none (GRUB update needed)'}")
            post(f"[green]✓[/green] RAM:     {sysinfo.memory.total_gb} GB total, "
                 f"{sysinfo.memory.avail_gb} GB available")

            # Disk
            for d in sysinfo.disks:
                col = "green" if d.free_gb >= 20 else "yellow"
                post(f"[{col}]{'✓' if d.free_gb >= 20 else '⚠'}[/{col}] Disk {d.path}: "
                     f"{d.free_gb:.0f} GB free / {d.total_gb:.0f} GB")

            # Audio devices
            if sysinfo.audio_devs:
                post(f"\n[green]✓[/green] Audio interfaces detected:")
                for dev in sysinfo.audio_devs:
                    post(f"    [{dev.card_id}] {dev.display_name}")
            else:
                post("[yellow]⚠[/yellow] No ALSA audio devices detected.")

            # Software
            pw_icon = "[green]✓[/green]" if sysinfo.has_pipewire else "[yellow]⚠[/yellow]"
            post(f"\n{pw_icon} PipeWire: {'installed' if sysinfo.has_pipewire else 'not found — will install'}")
            rt_icon = "[green]✓[/green]" if sysinfo.has_rtkit else "[yellow]⚠[/yellow]"
            post(f"{rt_icon} rtkit:    {'installed' if sysinfo.has_rtkit else 'not found — will install'}")
            post(f"[green]✓[/green] Python:   {sysinfo.python_ver}")
            node_col = "green" if sysinfo.node_ver != "not found" else "yellow"
            post(f"[{node_col}]{'✓' if sysinfo.node_ver != 'not found' else '⚠'}[/{node_col}] Node.js:  {sysinfo.node_ver}")
            cmake_col = "green" if sysinfo.cmake_ver != "not found" else "yellow"
            post(f"[{cmake_col}]{'✓' if sysinfo.cmake_ver != 'not found' else '⚠'}[/{cmake_col}] CMake:    {sysinfo.cmake_ver}")

            post("\n[bold green]Detection complete.[/bold green]  Press [bold]Ctrl+N[/bold] to begin setup.")

            # Show warnings panel if any
            if sysinfo.warnings:
                def show_warnings():
                    panel = self.query_one("#warnings-panel")
                    panel.add_class("visible")
                    content = self.query_one("#warnings-content", Static)
                    content.update("\n".join(sysinfo.warnings))
                self.app.call_from_thread(show_warnings)

        except Exception as e:
            post(f"[bold red]Detection error:[/bold red] {e}")
        finally:
            def hide_spinner():
                try:
                    self.query_one("#spinner", LoadingIndicator).remove()
                except Exception:
                    pass
            self.app.call_from_thread(hide_spinner)

    @property
    def help_text(self) -> str:
        return """\
# Welcome — System Detection

This screen automatically scans your hardware and software to:
  • Verify minimum requirements (RAM, disk space, Python version)
  • Detect audio interfaces (USB/ALSA card names for Stage 05)
  • Check for existing PipeWire / rtkit / JACK installations
  • Show which CPU cores are currently isolated (isolcpus)

## Why environment detection matters

Enterprise installers (like Fedora's Anaconda) detect hardware first to
give the configuration screens accurate default values.  For example:
  • Detected audio interfaces become the picker choices in Stage 05
  • CPU core count determines sensible isolation defaults in Stage 06
  • Free disk space is checked before allowing a full build

## What the colours mean

  ✓  Green — requirement met, no action needed
  ⚠  Yellow — warning, installer will handle it but you should be aware
  ✗  Red — blocking issue, must be resolved before proceeding

## Pro Tip

If no audio interfaces appear, ensure your USB interface is plugged in
before running the installer.  You can always re-run detection by
pressing Escape and restarting the installer.

## Common Pitfall

If CPU cores show 'isolated: none', it means isolcpus has not been
applied to the current boot.  The installer will update GRUB in Stage 06
and a reboot will be required after installation completes.

Navigate: Tab / Shift-Tab │ Help: F1 │ Next: Ctrl+N │ Back: Escape
"""

"""
installer/ui/screens/verify.py
================================
Stage 10 — Post-Install Verification.

Anaconda analogy:
  Anaconda's firstboot wizard verifies installed packages, disk layout,
  and service readiness after the first reboot.  We perform the equivalent
  checks immediately after installation: RT scheduling, PipeWire quantum,
  JUCE engine binary, user groups, and GRUB cmdline.

Each check renders a pass/warn/fail badge and an educational explanation.
The results are saved to ~/.map2/install-verification.json for later
reference and CI/CD pipeline inspection.
"""

from __future__ import annotations

from textual import work
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import ScrollableContainer, Vertical, Horizontal
from textual.widgets import Button, Footer, Header, Label, RichLog, Static

from installer.ui.screens._base import BaseInstallerScreen
from installer.backend.verifier import CheckStatus


class VerifyScreen(BaseInstallerScreen):

    SCREEN_TITLE    = "Post-Install Verification"
    SCREEN_SUBTITLE = "Confirming all MAP2 components are correctly installed"

    BINDINGS = [
        Binding("ctrl+r", "rerun_checks", "Re-run Checks", show=True),
        Binding("f1",     "show_help",    "Help",          show=True),
    ]

    CSS = """
    VerifyScreen { background: $surface; }
    #verify-intro { margin: 1 4; color: $text-muted; }
    #checks-log   { margin: 0 4; height: 1fr; }
    #summary-bar {
        margin: 1 4;
        border: round $primary;
        padding: 1;
        text-align: center;
        height: 3;
    }
    #reboot-notice {
        margin: 1 4;
        border: double $warning;
        padding: 1;
        color: $warning;
    }
    #action-bar {
        dock: bottom;
        height: 5;
        padding: 1 4;
        background: $surface;
        border-top: thin $primary;
    }
    """

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        yield Static(
            "Running post-install health checks…\n"
            "Each check verifies one component of the MAP2 audio system.",
            id="verify-intro",
        )
        yield RichLog(id="checks-log", highlight=True, markup=True)
        yield Static("", id="summary-bar")
        yield Static("", id="reboot-notice")
        with Horizontal(id="action-bar"):
            yield Button("Re-run Checks (Ctrl+R)", id="rerun-btn", variant="default")
            yield Button("Save Report",            id="save-btn",  variant="default")
            yield Button("Done — Exit Installer",  id="done-btn",  variant="success")
        yield Footer()

    def on_mount(self) -> None:
        super().on_mount()
        self.run_verification()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "rerun-btn":
            self.action_rerun_checks()
        elif event.button.id == "save-btn":
            self._save_report()
        elif event.button.id == "done-btn":
            self.app.exit()

    def action_rerun_checks(self) -> None:
        log = self.query_one("#checks-log", RichLog)
        log.clear()
        self.run_verification()

    @work(exclusive=True, thread=True)
    def run_verification(self) -> None:
        """Run post-install checks in background thread."""
        from installer.backend.executor import CommandExecutor
        from installer.backend.verifier import PostInstallVerifier

        log = self.query_one("#checks-log", RichLog)

        def post(msg: str) -> None:
            self.app.call_from_thread(log.write, msg)

        executor = CommandExecutor(dry_run=False)  # Always real checks, even in dry-run
        verifier = PostInstallVerifier(executor, self.config)

        post("[bold cyan]══ Post-Install Verification ══[/bold cyan]\n")

        results = verifier.run_all()
        pass_count = warn_count = fail_count = skip_count = 0

        for r in results:
            status_colors = {
                CheckStatus.PASS: "green",
                CheckStatus.WARN: "yellow",
                CheckStatus.FAIL: "red",
                CheckStatus.SKIP: "dim",
            }
            col = status_colors[r.status]
            post(f"[{col}]{r.icon} {r.name}[/{col}]")
            post(f"   {r.message}")
            if r.fix_hint:
                post(f"   [dim]Fix: {r.fix_hint}[/dim]")

            if   r.status == CheckStatus.PASS: pass_count += 1
            elif r.status == CheckStatus.WARN: warn_count += 1
            elif r.status == CheckStatus.FAIL: fail_count += 1
            elif r.status == CheckStatus.SKIP: skip_count += 1

        total = len(results)
        post(f"\n[bold]Results: {pass_count}/{total} passed, "
             f"{warn_count} warnings, {fail_count} failures[/bold]")

        # Update summary bar
        if fail_count == 0:
            summary_col = "green" if warn_count == 0 else "yellow"
            summary = f"[{summary_col}]✓ Verification {'complete' if warn_count == 0 else 'complete with warnings'}[/{summary_col}]"
        else:
            summary = f"[red]✗ {fail_count} check(s) failed — see details above[/red]"

        self.app.call_from_thread(
            self.query_one("#summary-bar", Static).update, summary
        )

        # Show reboot notice if GRUB was written
        if self.config.realtime.write_grub and self.config.realtime.isolated_cores:
            self.app.call_from_thread(
                self.query_one("#reboot-notice", Static).update,
                "⚠ REBOOT REQUIRED\n"
                "GRUB kernel parameters were updated.  Reboot now to activate:\n"
                f"  isolcpus={self.config.realtime.isolated_cores} (CPU isolation for audio)"
            )

        # Save report
        try:
            report_path = verifier.save_report(results)
            post(f"\n[dim]Verification report saved to {report_path}[/dim]")
        except Exception as e:
            post(f"\n[yellow]Could not save report: {e}[/yellow]")

    def _save_report(self) -> None:
        self.app.notify(
            "Report is saved to ~/.map2/install-verification.json",
            severity="information",
        )

    @property
    def help_text(self) -> str:
        return """\
# Post-Install Verification

## Purpose
After installation completes, this screen automatically runs a battery
of checks to confirm that every MAP2 component is correctly installed
and configured.  Any failures are shown with fix hints.

## Understanding Check Results

  ✓ PASS  — Component is correctly installed and configured.
  ⚠ WARN  — Component is present but may need attention.
             Installation will work but may be suboptimal.
  ✗ FAIL  — Component is missing or misconfigured.
             MAP2 may not work correctly until this is fixed.
  ○ SKIP  — Check was skipped because a prerequisite failed.

## Checks Performed

  PipeWire running    — pw-cli info returns successfully
  PipeWire quantum    — force-quantum matches your buffer size setting
  JUCE engine binary  — .so file exists in juce-engine/build/
  RT limits           — /etc/security/limits.d/99-map2-audio.conf exists
  rtkit-daemon        — systemctl is-active rtkit-daemon.service
  map2-backend        — systemctl is-enabled map2-backend.service
  Audio group         — user is in the 'audio' group
  CPU isolation       — isolcpus= in /proc/cmdline (needs reboot if WARN)
  Python venv         — .venv/bin/pip exists

## After Verification

If all checks pass (or only warnings remain):
  1. If GRUB was updated → REBOOT NOW
  2. Start MAP2: sudo systemctl start map2-backend.service
  3. Open the web UI: http://localhost:3000

## Pro Tip
After reboot, run this verification again:
  python -m installer --validate-ks ~/.map2/install-verification.json
(Not yet implemented — future feature)

Or manually verify RT scheduling:
  chrt -p $(pgrep -f "data-loop")
  → Should show SCHED_FIFO, priority 80

## Common Pitfall
If PipeWire quantum shows WARN after installation, restart the service:
  sudo systemctl restart map2-backend.service
The ExecStartPre pw-metadata commands will re-apply the quantum.

Navigate: Ctrl+R = Re-run │ Help: F1 │ Done: click "Done"
"""

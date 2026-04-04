"""
installer/ui/screens/install_progress.py
==========================================
Stage 09 — Live Installation with Progress Bars, Log Viewer, and Error Recovery.

Anaconda analogy:
  Anaconda's installation progress screen shows:
  • A top-level progress bar for the overall install
  • A spinner showing the current action ("Installing glibc…")
  • A scrolling log of package names as they install

  We do the same but go further with:
  • Per-stage progress bars (packages / build / config / services)
  • A RichLog widget that shows live command output
  • An error recovery modal: Retry / Skip / Diagnose / Abort

Design decisions:
  - The install runs in a Textual Worker (background thread) so the TUI
    stays responsive during long operations (cmake build takes 10+ min).
  - Each stage calls the CommandExecutor with a progress callback that
    posts output lines to the RichLog widget via call_from_thread().
  - On error, the Worker pauses and raises an event; the UI shows a modal.
    The user can retry, skip the failed step, or abort.
"""

from __future__ import annotations

import asyncio
import threading
from typing import List, Optional

from textual import work
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import ScrollableContainer, Vertical, Horizontal
from textual.message import Message
from textual.widgets import (
    Button, Footer, Header, Label, ProgressBar, RichLog, Static,
)

from installer.ui.screens._base import BaseInstallerScreen


# ─────────────────────────────────────────────────────────────────────────────
# Install stage definitions
# ─────────────────────────────────────────────────────────────────────────────

class InstallStage:
    """Describes one high-level installation stage."""
    def __init__(self, key: str, label: str, weight: int = 1):
        self.key    = key
        self.label  = label
        self.weight = weight   # Relative time weight for overall progress bar

INSTALL_STAGES = [
    InstallStage("packages",   "Installing system packages",       weight=3),
    InstallStage("python_env", "Setting up Python environment",    weight=2),
    InstallStage("pipewire",   "Configuring PipeWire",             weight=1),
    InstallStage("rt_limits",  "Writing RT limits",                weight=1),
    InstallStage("grub",       "Updating GRUB kernel parameters",  weight=1),
    InstallStage("services",   "Installing systemd services",      weight=1),
    InstallStage("juce_build", "Building JUCE audio engine",       weight=5),
    InstallStage("frontend",   "Building React frontend",          weight=2),
    InstallStage("cluster_mgr","Installing cluster manager stack", weight=3),
    InstallStage("user",       "Configuring user account",         weight=1),
    InstallStage("post",       "Post-install configuration",       weight=1),
]


class InstallProgressScreen(BaseInstallerScreen):

    SCREEN_TITLE    = "Installing MAP2 Audio Platform"
    SCREEN_SUBTITLE = "Please wait — installation in progress"

    # No Ctrl+N during install — use the buttons below
    BINDINGS = [
        Binding("ctrl+c", "abort_install", "Abort", show=True),
        Binding("f1",     "show_help",     "Help",  show=True),
    ]

    # ── Custom messages for Worker → UI communication ─────────────────────────
    class StageStarted(Message):
        def __init__(self, stage_key: str, label: str) -> None:
            super().__init__()
            self.stage_key = stage_key
            self.label     = label

    class StageCompleted(Message):
        def __init__(self, stage_key: str, ok: bool) -> None:
            super().__init__()
            self.stage_key = stage_key
            self.ok        = ok

    class InstallComplete(Message):
        def __init__(self, success: bool) -> None:
            super().__init__()
            self.success = success

    class ErrorOccurred(Message):
        def __init__(self, stage_key: str, error: str, command: str) -> None:
            super().__init__()
            self.stage_key = stage_key
            self.error     = error
            self.command   = command

    # ─────────────────────────────────────────────────────────────────────────

    CSS = """
    InstallProgressScreen { background: $surface; }
    #overall-label { color: $primary; text-style: bold; margin: 1 4 0 4; }
    #overall-bar   { margin: 0 4 1 4; }
    #stage-label   { color: $accent; margin: 0 4; }
    #stage-bar     { margin: 0 4 1 4; }
    #install-log   { margin: 0 4; height: 1fr; }
    #error-panel {
        margin: 1 4;
        border: double $error;
        padding: 1;
        display: none;
    }
    #error-panel.visible { display: block; }
    #error-message { color: $error; }
    #error-buttons { margin-top: 1; }
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._error_event  = threading.Event()
        self._error_action = "retry"   # Set by error modal buttons
        self._total_weight = sum(s.weight for s in INSTALL_STAGES)
        self._done_weight  = 0

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        yield Label("Overall Progress", id="overall-label")
        yield ProgressBar(total=100, id="overall-bar", show_eta=False)
        yield Label("Starting…", id="stage-label")
        yield ProgressBar(total=100, id="stage-bar", show_eta=False)
        yield RichLog(id="install-log", highlight=True, markup=True)
        with Vertical(id="error-panel"):
            yield Static("", id="error-message")
            with Horizontal(id="error-buttons"):
                yield Button("Retry",     id="retry-btn",    variant="primary")
                yield Button("Skip",      id="skip-btn",     variant="warning")
                yield Button("Diagnose",  id="diagnose-btn", variant="default")
                yield Button("Abort",     id="abort-btn",    variant="error")
        yield Footer()

    def on_mount(self) -> None:
        super().on_mount()
        self._start_install()

    # ── Worker: runs the actual installation ──────────────────────────────────

    @work(exclusive=True, thread=True)
    def _start_install(self) -> None:
        """
        Background Worker that executes every installation stage sequentially.

        Uses the CommandExecutor with a progress callback that posts each
        line of output to the RichLog widget via call_from_thread().
        Error recovery is implemented via threading.Event: when a stage
        fails, the worker pauses and waits for the UI to signal retry/skip/abort.
        """
        from installer.backend.executor import CommandExecutor
        from installer.backend.packages import PackageManager
        from installer.backend.pipewire import PipeWireConfig
        from installer.backend.grub     import GRUBConfig
        from installer.backend.services import ServiceManager
        from installer.backend.build    import JUCEBuilder, FrontendBuilder, PythonEnvBuilder
        from installer.backend.cluster_manager import ClusterManagerInstaller

        log = self.query_one("#install-log", RichLog)

        def post(msg: str) -> None:
            self.app.call_from_thread(log.write, msg)

        def make_executor():
            return CommandExecutor(
                dry_run=self.config.dry_run,
                log_file=str(self.config.storage.installer_log),
                progress_cb=lambda line: self.app.call_from_thread(log.write, line),
            )

        executor = make_executor()
        install_dir = str(self.config.storage.install_dir)

        # Stage runners — each is a callable(executor) → list[CommandResult]
        def run_packages(ex):
            pm = PackageManager(ex)
            results = []
            results += pm.install_component("core")
            results += pm.install_component("rt_audio")
            if self.config.software.install_juce_engine:
                results += pm.install_component("juce")
            if self.config.software.install_frontend:
                results += pm.install_component("node")
            if self.config.software.install_lv2_plugins:
                results += pm.install_component("lv2")
            if self.config.software.install_avb:
                results += pm.install_component("avb")
            return results

        def run_python_env(ex):
            b = PythonEnvBuilder(ex, install_dir, str(self.config.storage.venv_dir))
            return [b.create_venv(), b.install_deps()]

        def run_pipewire(ex):
            pw = PipeWireConfig(ex)
            return [pw.write_config(
                self.config.audio.buffer_size.value,
                self.config.audio.sample_rate.value,
            )]

        def run_rt_limits(ex):
            limits_content = (
                "# MAP2 Audio Platform — Real-Time scheduling limits\n"
                "# Generated by MAP2 installer\n"
                "@audio - rtprio  {rt}\n"
                "@audio - memlock unlimited\n"
                "@audio - nice    -15\n"
            ).format(rt=self.config.realtime.audio_rtprio)
            if not ex.dry_run:
                from pathlib import Path
                p = Path("/etc/security/limits.d/99-map2-audio.conf")
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(limits_content)
            return [ex.run(["echo", "RT limits written"], capture=True)]

        def run_grub(ex):
            if not self.config.realtime.write_grub or not self.config.realtime.isolated_cores:
                return []
            grub = GRUBConfig(ex)
            return grub.apply_cmdline(self.config.realtime.grub_cmdline_additions)

        def run_services(ex):
            sm = ServiceManager(ex)
            return sm.install_map2_services(install_dir)

        def run_juce_build(ex):
            if not self.config.software.install_juce_engine:
                return []
            jb = JUCEBuilder(ex, install_dir)
            return [jb.configure(), jb.build()]

        def run_frontend(ex):
            if not self.config.software.install_frontend:
                return []
            fb = FrontendBuilder(ex, install_dir)
            return [fb.install_deps(), fb.build()]

        def run_cluster_mgr(ex):
            installer = ClusterManagerInstaller(ex)
            return installer.install(self.config)

        def run_user(ex):
            user = self.config.user
            results = []
            groups = []
            if user.add_audio_group: groups += ["audio", "jackuser"]
            if user.add_sudo:        groups += ["wheel"]
            for grp in groups:
                results.append(ex.run(["usermod", "-aG", grp, user.username]))
            if user.password_hash and user.password_hash != "__NEEDS_MANUAL_SET__":
                results.append(ex.run(
                    ["chpasswd", "-e"],
                    input=f"{user.username}:{user.password_hash}\n",
                ))
            return results

        def run_post(ex):
            # Set hostname
            results = [ex.run(["hostnamectl", "set-hostname", self.config.network.hostname])]
            return results

        stage_runners = {
            "packages":   run_packages,
            "python_env": run_python_env,
            "pipewire":   run_pipewire,
            "rt_limits":  run_rt_limits,
            "grub":       run_grub,
            "services":   run_services,
            "juce_build": run_juce_build,
            "frontend":   run_frontend,
            "cluster_mgr": run_cluster_mgr,
            "user":       run_user,
            "post":       run_post,
        }

        post("[bold cyan]══ MAP2 Installation Starting ══[/bold cyan]")
        if self.config.dry_run:
            post("[yellow]DRY-RUN MODE — No system changes will be made.[/yellow]\n")

        overall_success = True
        for stage in INSTALL_STAGES:
            # ── Signal stage start to UI ──────────────────────────────────────
            self.app.call_from_thread(
                self.post_message, self.StageStarted(stage.key, stage.label)
            )
            post(f"\n[bold]▸ {stage.label}[/bold]")

            runner = stage_runners.get(stage.key)
            if not runner:
                post(f"  [yellow]No runner for stage '{stage.key}' — skipping.[/yellow]")
                continue

            # ── Execute stage with error recovery loop ────────────────────────
            while True:
                try:
                    results = runner(executor)
                    failed = [r for r in results if not r.ok]
                    if failed:
                        raise RuntimeError(
                            f"{len(failed)} command(s) failed:\n"
                            + "\n".join(f"  rc={r.returncode}: {r.command_str}" for r in failed)
                        )
                    # Stage succeeded
                    self.app.call_from_thread(
                        self.post_message, self.StageCompleted(stage.key, ok=True)
                    )
                    post(f"  [green]✓ {stage.label} complete.[/green]")
                    break

                except Exception as e:
                    # ── Error recovery ────────────────────────────────────────
                    err_msg = str(e)
                    post(f"  [red]✗ Stage '{stage.label}' failed:[/red] {err_msg}")

                    self._error_action = "retry"
                    self._error_event.clear()

                    # Signal UI to show the error modal and wait for user choice
                    self.app.call_from_thread(
                        self.post_message,
                        self.ErrorOccurred(stage.key, err_msg, "")
                    )
                    self._error_event.wait()   # Block worker until UI responds

                    action = self._error_action
                    if action == "retry":
                        post(f"  [cyan]↻ Retrying '{stage.label}'…[/cyan]")
                        executor = make_executor()   # Fresh executor for retry
                        continue
                    elif action == "skip":
                        post(f"  [yellow]⏭ Skipping '{stage.label}'.[/yellow]")
                        self.app.call_from_thread(
                            self.post_message, self.StageCompleted(stage.key, ok=False)
                        )
                        break
                    else:  # abort
                        post("[bold red]Installation aborted by user.[/bold red]")
                        overall_success = False
                        self.app.call_from_thread(
                            self.post_message, self.InstallComplete(success=False)
                        )
                        return

        if overall_success:
            post("\n[bold green]══ Installation Complete ══[/bold green]")
            post("Proceeding to post-install verification…")
        self.app.call_from_thread(
            self.post_message, self.InstallComplete(success=overall_success)
        )

    # ── Message handlers (UI thread) ──────────────────────────────────────────

    def on_install_progress_screen_stage_started(self, event: "InstallProgressScreen.StageStarted") -> None:
        self.query_one("#stage-label", Label).update(f"▸ {event.label}")
        self.query_one("#stage-bar", ProgressBar).update(progress=0)

    def on_install_progress_screen_stage_completed(self, event: "InstallProgressScreen.StageCompleted") -> None:
        # Advance overall progress bar
        stage = next((s for s in INSTALL_STAGES if s.key == event.stage_key), None)
        if stage:
            self._done_weight += stage.weight
            pct = int((self._done_weight / self._total_weight) * 100)
            self.query_one("#overall-bar", ProgressBar).update(progress=pct)
        self.query_one("#stage-bar", ProgressBar).update(progress=100)

    def on_install_progress_screen_error_occurred(self, event: "InstallProgressScreen.ErrorOccurred") -> None:
        """Show the error recovery panel."""
        panel = self.query_one("#error-panel")
        panel.add_class("visible")
        self.query_one("#error-message", Static).update(
            f"[bold red]Stage failed:[/bold red] {event.stage_key}\n\n{event.error}\n\n"
            "Choose an action:"
        )

    def on_install_progress_screen_install_complete(self, event: "InstallProgressScreen.InstallComplete") -> None:
        if event.success:
            self.app.action_next_screen()   # → Verify screen

    def on_button_pressed(self, event: Button.Pressed) -> None:
        action_map = {
            "retry-btn":    "retry",
            "skip-btn":     "skip",
            "abort-btn":    "abort",
        }
        if event.button.id in action_map:
            self._error_action = action_map[event.button.id]
            panel = self.query_one("#error-panel")
            panel.remove_class("visible")
            self._error_event.set()   # Unblock the Worker

        elif event.button.id == "diagnose-btn":
            self.app.notify(
                "Check /tmp/map2-installer-debug.log for full command output.",
                title="Diagnostics",
                severity="information",
                timeout=8,
            )

    def action_abort_install(self) -> None:
        self._error_action = "abort"
        self._error_event.set()

    @property
    def help_text(self) -> str:
        return """\
# Installation Progress

## What's Happening
The installer is executing the changes you reviewed in the previous screen.
Each stage runs the commands listed in the Review screen.

## Error Recovery
If a stage fails, you will see an error panel with four options:

  Retry     — Re-run the failed stage with a fresh executor.
              Use this for transient failures (network timeout, file lock).

  Skip      — Mark the stage as skipped and continue with the next stage.
              Use this if the step is optional for your setup.
              WARNING: Skipping required stages may cause MAP2 to fail.

  Diagnose  — Opens the log file path for manual inspection.
              Full command output (stdout + stderr) is logged to:
              /var/log/map2-installer.log

  Abort     — Stop the installation immediately.
              Partially-installed changes are NOT rolled back.
              Re-run the installer to complete or undo the install.

## Idempotency
The installer is designed to be run multiple times safely.  If you abort
and re-run, each stage will check whether its work is already done before
acting.  For example:
  • Package install: skipped if already installed (rpm -q / dpkg -q)
  • PipeWire config: only rewritten if content changed
  • Systemd enable: skipped if already enabled

## GRUB Changes
If the GRUB stage ran, a reboot is required.  The installer will remind
you on the Verification screen.

## Common Pitfall
If the JUCE build fails with 'No space left on device', free up disk
space on the build directory and retry.  The CMake build is not
incremental across clean runs — it will restart from scratch.

Navigate: Ctrl+C = Abort │ Help: F1
"""

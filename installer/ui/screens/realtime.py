"""
installer/ui/screens/realtime.py
=================================
Stage 06 — Real-Time and Low-Latency Kernel Configuration.

The most educational screen in the installer.  Every setting here maps
directly to a Linux kernel concept that most users have never encountered.

The GRUB preview panel shows exactly what will be written to
/etc/default/grub — users can see the concrete output of their choices
before any changes are made.  This is the 'preview before commit'
principle from Anaconda's storage formatting review.
"""

from __future__ import annotations

from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import ScrollableContainer, Vertical
from textual.widgets import (
    Checkbox, Footer, Header, Input, Label, RadioButton, RadioSet, Rule,
    Static, Switch,
)

from installer.config.schema import SchedPolicy
from installer.ui.screens._base import BaseInstallerScreen


class RealtimeScreen(BaseInstallerScreen):

    SCREEN_TITLE    = "Real-Time / Low-Latency Configuration"
    SCREEN_SUBTITLE = "Configure CPU isolation, RT scheduling, and GRUB kernel parameters"

    BINDINGS = BaseInstallerScreen.BINDINGS + [
        Binding("ctrl+n", "go_next", "Continue ▶", show=True),
    ]

    CSS = """
    RealtimeScreen { background: $surface; }
    .field-group { margin: 1 4; border: round $primary; padding: 1; height: auto; }
    .field-label { color: $primary; text-style: bold; }
    .field-hint  { color: $text-muted; }
    .error-text  { color: $error; }
    #grub-preview {
        margin: 1 4;
        border: double $warning;
        padding: 1;
        height: auto;
        background: $surface-darken-2;
    }
    #grub-preview-label { color: $warning; text-style: bold; }
    #grub-cmdline       { color: $text; }
    #reboot-notice {
        margin: 1 4;
        border-left: thick $warning;
        padding-left: 2;
        color: $warning;
    }
    """

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with ScrollableContainer():
            # ── GRUB preview (shown first so users see what they're changing) ──
            with Vertical(id="grub-preview"):
                yield Label("GRUB Kernel Parameters Preview", id="grub-preview-label")
                yield Static("(loading…)", id="grub-cmdline")
                yield Static(
                    "[dim]This will be written to /etc/default/grub.\n"
                    "⚠ Changes only take effect after reboot.[/dim]"
                )

            yield Static(
                "⚠ A REBOOT is required after this screen writes GRUB changes.\n"
                "The installer will remind you at the end.",
                id="reboot-notice",
            )

            # ── CPU isolation ─────────────────────────────────────────────────
            with Vertical(classes="field-group"):
                yield Label("Isolated CPU Cores (isolcpus=)", classes="field-label")
                yield Static(
                    "Cores removed from the Linux scheduler — ONLY audio threads run here.\n"
                    "Format: '4,5' or '2-3,6'.  Must not include core 0 (kernel needs it).",
                    classes="field-hint",
                )
                yield Input(
                    value=self.config.realtime.isolated_cores,
                    id="isolated-input",
                )
                yield Static("", id="isolated-error", classes="error-text")

            # ── Max C-state ───────────────────────────────────────────────────
            with Vertical(classes="field-group"):
                yield Label("Intel C-State Limit (intel_idle.max_cstate=)", classes="field-label")
                yield Static(
                    "C-states are CPU power-saving sleep states.  C1=light sleep (~1µs wakeup).\n"
                    "C3+ can add 100-500µs wakeup latency — catastrophic for 1.33 ms buffers.\n"
                    "Set to 1 to allow C0 (active) and C1 only.",
                    classes="field-hint",
                )
                yield Input(
                    value=str(self.config.realtime.max_cstate),
                    id="cstate-input",
                )

            # ── RT priorities ─────────────────────────────────────────────────
            with Vertical(classes="field-group"):
                yield Label("SCHED_FIFO Priorities", classes="field-label")
                yield Static(
                    "Higher number = higher priority (1–99).\n"
                    "Audio callback: 80 (matches PipeWire's data-loop thread).\n"
                    "IRQ thread: 50 (USB interrupt handler for the audio interface).",
                    classes="field-hint",
                )
                yield Label("Audio callback RTPRIO (1–99):")
                yield Input(
                    value=str(self.config.realtime.audio_rtprio),
                    id="audio-rtprio-input",
                )
                yield Label("IRQ thread RTPRIO (1–99):")
                yield Input(
                    value=str(self.config.realtime.irq_rtprio),
                    id="irq-rtprio-input",
                )

            # ── Options ───────────────────────────────────────────────────────
            with Vertical(classes="field-group"):
                yield Label("Options", classes="field-label")
                yield Checkbox(
                    "Write isolcpus / nohz_full / threadirqs to GRUB",
                    value=self.config.realtime.write_grub,
                    id="write-grub-check",
                )
                yield Checkbox(
                    "Enable rtkit-daemon (RT priority elevation for audio group)",
                    value=self.config.realtime.enable_rtkit,
                    id="rtkit-check",
                )

        yield Footer()

    def on_mount(self) -> None:
        super().on_mount()
        self._refresh_grub_preview()

    def on_input_changed(self, event) -> None:
        iid = event.input.id
        val = event.value

        if iid == "isolated-input":
            try:
                self.config.realtime.isolated_cores = val
                self.query_one("#isolated-error", Static).update("")
            except Exception as e:
                self.query_one("#isolated-error", Static).update(str(e))
            self._refresh_grub_preview()

        elif iid == "cstate-input":
            if val.isdigit():
                self.config.realtime.max_cstate = int(val)
                self._refresh_grub_preview()

        elif iid == "audio-rtprio-input":
            if val.isdigit() and 1 <= int(val) <= 99:
                self.config.realtime.audio_rtprio = int(val)

        elif iid == "irq-rtprio-input":
            if val.isdigit() and 1 <= int(val) <= 99:
                self.config.realtime.irq_rtprio = int(val)

    def on_checkbox_changed(self, event) -> None:
        cid = event.checkbox.id
        if cid == "write-grub-check":
            self.config.realtime.write_grub = event.value
            self._refresh_grub_preview()
        elif cid == "rtkit-check":
            self.config.realtime.enable_rtkit = event.value

    def _refresh_grub_preview(self) -> None:
        """Update the live GRUB cmdline preview."""
        rt  = self.config.realtime
        if not rt.write_grub or not rt.isolated_cores:
            self.query_one("#grub-cmdline", Static).update(
                "[dim](GRUB write disabled — existing cmdline preserved)[/dim]"
            )
            return

        from installer.backend.grub import GRUBConfig
        from installer.backend.executor import CommandExecutor
        grub    = GRUBConfig(CommandExecutor(dry_run=True))
        preview = grub.preview_cmdline(rt.grub_cmdline_additions)
        self.query_one("#grub-cmdline", Static).update(
            f'[bold]GRUB_CMDLINE_LINUX=[/bold]"[yellow]{preview}[/yellow]"'
        )

    def validate(self) -> list[str]:
        errors = []
        rt = self.config.realtime
        if rt.write_grub and not rt.isolated_cores:
            errors.append("Isolated cores cannot be empty when GRUB write is enabled.")
        if rt.audio_rtprio >= 95:
            errors.append("Audio RTPRIO ≥ 95 can starve the kernel watchdog. Use ≤ 90.")
        return errors

    @property
    def help_text(self) -> str:
        return """\
# Real-Time / Low-Latency Configuration

## Why CPU Isolation Matters (isolcpus)
By default, the Linux CFS (Completely Fair Scheduler) can run any process
on any CPU core.  This means a web browser tab, virus scanner, or kernel
task might briefly share a core with the audio callback thread, causing a
scheduling delay called an 'xrun' (buffer overrun/underrun).

With isolcpus=4,5, cores 4 and 5 are removed from the scheduler's pool.
Only threads that explicitly set CPU affinity to those cores will run there.
The audio callback thread is pinned to core 4 by the systemd service's
CPUAffinity= setting.

## nohz_full (Dynticks)
Without nohz_full, Linux fires a timer interrupt (HZ=250 by default = every
4ms) on every core, even isolated ones.  This 4ms tick is longer than the
entire 1.33ms audio buffer at 64 samples!

nohz_full=4,5 disables these ticks on the isolated cores.
Combined with isolcpus, this gives near-deterministic execution.

## C-State Limits
Modern CPUs have multiple idle power states (C0–C10):
  C0 = fully running
  C1 = light sleep (wakeup ~1 µs)
  C3 = deep sleep (wakeup ~100 µs)
  C6 = package sleep (wakeup ~300–500 µs)

At 64 samples / 48 kHz, the callback fires every 1.33 ms.
If the CPU is in C6 when the IRQ fires, it takes 500µs just to wake up —
nearly 40% of the entire buffer duration.  Setting max_cstate=1 prevents
the CPU from entering any state deeper than C1.

## SCHED_FIFO Priorities (1–99)
SCHED_FIFO is a real-time scheduling policy.  Priority 80 means the audio
callback will preempt any normal (CFS) thread instantly.  It will NOT
preempt threads running at priority 81+.  The kernel watchdog runs at 99
— never set audio priority to 99.

## Pro Tip
After the installer completes, verify RT scheduling with:
  chrt -p $(pgrep -f "data-loop")
You should see 'scheduling policy: SCHED_FIFO' and priority 80.

## Common Pitfall
Isolating core 0 (isolcpus=0) will prevent the kernel from booting
on most systems.  Always leave core 0 available for the kernel.

Navigate: Tab / Shift-Tab │ Help: F1 │ Next: Ctrl+N │ Back: Escape
"""

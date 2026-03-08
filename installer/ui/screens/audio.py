"""
installer/ui/screens/audio.py
==============================
Stage 05 — Audio Interface and Latency Configuration.

This is the most audio-technically-dense screen.  Every choice here has
a direct, measurable impact on latency and reliability.

Educational goals:
  • Teach the buffer_size → latency_ms → xrun_risk triangle.
  • Show the live latency calculation as the user changes buffer size.
  • Explain why we use PipeWire over direct ALSA.
  • Show detected audio interfaces with USB/PCI labels.
"""

from __future__ import annotations

from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import ScrollableContainer, Vertical, Horizontal
from textual.widgets import (
    Footer, Header, Input, Label, RadioButton, RadioSet, Rule,
    Select, Static,
)

from installer.config.schema import BufferSize, SampleRate
from installer.ui.screens._base import BaseInstallerScreen


class AudioScreen(BaseInstallerScreen):

    SCREEN_TITLE    = "Audio Interface & Latency"
    SCREEN_SUBTITLE = "Configure audio hardware, buffer size, and target latency"

    BINDINGS = BaseInstallerScreen.BINDINGS + [
        Binding("ctrl+n", "go_next", "Continue ▶", show=True),
    ]

    CSS = """
    AudioScreen { background: $surface; }
    .field-group {
        margin: 1 4;
        border: round $primary;
        padding: 1;
        height: auto;
    }
    .field-label { color: $primary; text-style: bold; margin-bottom: 0; }
    .field-hint  { color: $text-muted; }
    #latency-display {
        margin: 1 4;
        border: double $accent;
        padding: 1;
        text-align: center;
        height: 5;
    }
    #latency-value  { color: $accent;   text-style: bold; }
    #latency-detail { color: $text-muted; }
    #buffer-set { margin: 0 4; border: round $primary; padding: 1; height: auto; }
    """

    # Buffer sizes shown in the picker with their risk level
    BUFFER_OPTIONS = [
        (BufferSize.S32,   "32  samples — 0.67 ms  [EXTREME: xruns likely on non-RT kernel]"),
        (BufferSize.S64,   "64  samples — 1.33 ms  [PRO: requires isolcpus + RT kernel]"),
        (BufferSize.S128,  "128 samples — 2.67 ms  [STUDIO: reliable with RT tuning]"),
        (BufferSize.S256,  "256 samples — 5.33 ms  [SAFE: works on most Linux systems]"),
        (BufferSize.S512,  "512 samples — 10.7 ms  [STABLE: for all-in-one / management]"),
        (BufferSize.S1024, "1024 samples — 21.3 ms [BROADCAST: monitoring / streaming]"),
    ]

    RATE_OPTIONS = [
        (SampleRate.SR44100, "44100 Hz — CD quality (some interfaces only support this)"),
        (SampleRate.SR48000, "48000 Hz — Professional standard (recommended for MAP2)"),
        (SampleRate.SR96000, "96000 Hz — High-resolution (doubles CPU load)"),
    ]

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with ScrollableContainer():
            # ── Live latency display ──────────────────────────────────────────
            with Vertical(id="latency-display"):
                yield Static("", id="latency-value")
                yield Static("", id="latency-detail")

            # ── Audio interface picker ────────────────────────────────────────
            with Vertical(classes="field-group"):
                yield Label("Audio Interface", classes="field-label")
                yield Static(
                    "Select the ALSA/PipeWire audio interface for MAP2.\n"
                    "'auto' = use the default PipeWire device.",
                    classes="field-hint",
                )
                # Build Select options from detected devices + auto
                sysinfo = getattr(self.app, "_sysinfo", None)
                options = [("auto — PipeWire default", "auto")]
                if sysinfo:
                    for dev in sysinfo.audio_devs:
                        options.append((dev.display_name, dev.alsa_id))
                yield Select(
                    options=[(label, val) for label, val in options],
                    value=self.config.audio.audio_interface,
                    id="iface-select",
                )

            # ── Sample rate ───────────────────────────────────────────────────
            with Vertical(classes="field-group"):
                yield Label("Sample Rate", classes="field-label")
                yield Static(
                    "48000 Hz is the MAP2 standard.  Only change if your interface requires it.",
                    classes="field-hint",
                )
                with RadioSet(id="rate-set"):
                    for rate, label in self.RATE_OPTIONS:
                        yield RadioButton(
                            label,
                            value=(rate == self.config.audio.sample_rate),
                            name=str(rate.value),
                        )

            # ── Buffer size ───────────────────────────────────────────────────
            with Vertical(classes="field-group"):
                yield Label("Buffer Size (PipeWire Quantum)", classes="field-label")
                yield Static(
                    "Lower = less latency but more CPU load and xrun risk.\n"
                    "64 samples requires CPU isolation (isolcpus) — configured in Stage 06.",
                    classes="field-hint",
                )
                with RadioSet(id="buffer-set"):
                    for buf, label in self.BUFFER_OPTIONS:
                        yield RadioButton(
                            label,
                            value=(buf == self.config.audio.buffer_size),
                            name=str(buf.value),
                        )

            # ── User for audio group ──────────────────────────────────────────
            with Vertical(classes="field-group"):
                yield Label("Audio User", classes="field-label")
                yield Static(
                    "This user will be added to the 'audio' and 'jackuser' groups "
                    "to allow real-time priority elevation without root.",
                    classes="field-hint",
                )
                yield Input(
                    value=self.config.audio.audio_group_user,
                    id="user-input",
                )

        yield Footer()

    def on_mount(self) -> None:
        super().on_mount()
        self._refresh_latency_display()

    def on_radio_set_changed(self, event: RadioSet.Changed) -> None:
        if event.radio_set.id == "buffer-set":
            self.config.audio.buffer_size = BufferSize(int(event.pressed.name))
        elif event.radio_set.id == "rate-set":
            self.config.audio.sample_rate = SampleRate(int(event.pressed.name))
        self._refresh_latency_display()

    def on_select_changed(self, event: Select.Changed) -> None:
        if event.select.id == "iface-select":
            self.config.audio.audio_interface = str(event.value)

    def on_input_changed(self, event) -> None:
        if event.input.id == "user-input":
            self.config.audio.audio_group_user = event.value

    def _refresh_latency_display(self) -> None:
        """Update the live latency display when buffer size or rate changes."""
        buf  = self.config.audio.buffer_size.value
        rate = self.config.audio.sample_rate.value
        ms   = round((buf / rate) * 1000, 3)

        # Risk colour coding
        if ms < 2.0:
            risk_col, risk = "red",    "EXTREME — requires full RT isolation"
        elif ms < 3.0:
            risk_col, risk = "yellow", "PRO — requires isolcpus + rtkit"
        elif ms < 8.0:
            risk_col, risk = "green",  "STUDIO — reliable with RT tuning"
        else:
            risk_col, risk = "cyan",   "SAFE — works on most Linux systems"

        self.query_one("#latency-value", Static).update(
            f"[bold]One-way latency: [{risk_col}]{ms} ms[/{risk_col}][/bold]"
        )
        self.query_one("#latency-detail", Static).update(
            f"{buf} samples ÷ {rate} Hz = {ms} ms    "
            f"[{risk_col}]{risk}[/{risk_col}]\n"
            f"PipeWire env: PIPEWIRE_LATENCY={buf}/{rate}"
        )

    @property
    def help_text(self) -> str:
        return """\
# Audio Interface & Latency

## The Latency Triangle
Every audio system has three competing constraints:
  • Latency:    lower buffer size = less delay (good for live performance)
  • Reliability: lower buffer size = more dropout risk (xruns)
  • CPU load:   lower buffer size = more frequent callbacks = more CPU

The formula is simple:
  latency_ms = (buffer_size / sample_rate) × 1000

At 64 samples / 48000 Hz:  64 / 48000 × 1000 = 1.333 ms

## Buffer Size Recommendations

  32 samples (0.67 ms) — Only use with PREEMPT_RT kernel + isolcpus.
                         Even then, expect occasional xruns.

  64 samples (1.33 ms) — MAP2 target.  Requires CPU isolation (Stage 06)
                         and the rtkit-daemon for RT priority elevation.

  128 samples (2.67 ms) — Good for all-in-one systems.  Reliable without
                           a real-time kernel.

  256+ samples — For monitoring, recording, or non-performance use.

## Sample Rate
48000 Hz is the MAP2 standard because:
  • Matches the EDIROL UA-1000's native rate
  • All MAP2 test vectors and IRs are at 48 kHz
  • PipeWire defaults to 48 kHz

Only use 44100 Hz if your interface doesn't support 48 kHz natively.
Sample rate conversion (SRC) adds 1–3 ms of additional latency.

## Audio Group
The 'audio' Linux group grants:
  • Real-time scheduling (SCHED_FIFO) via rtkit-daemon
  • Memory locking (mlockall) for zero-swap audio buffers
  • Access to /dev/snd/* without root

## Pro Tip
The EDIROL UA-1000 is the MAP2 reference interface.  Its USB 2.0 driver
supports 64-sample periods at 48 kHz reliably when the USB host
controller's IRQ is pinned to the isolated CPU cores.

## Common Pitfall
Never use ALSA 'plughw' (plug:hw:0) for real-time audio — it adds a
software sample-rate converter that adds ~5 ms latency.  Always use
'hw:N' or let PipeWire manage the device directly.

Navigate: Tab / Shift-Tab │ Help: F1 │ Next: Ctrl+N │ Back: Escape
"""

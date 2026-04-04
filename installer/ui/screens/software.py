"""
installer/ui/screens/software.py
==================================
Stage 04 — Software Component Selection.

Anaconda analogy:
  Anaconda's "Software Selection" spoke lets users choose base environments
  and add-ons (Server with GUI, Minimal, etc.).  We do the same for MAP2:
  the mode pre-selects a sensible set; users can add/remove components.

  Each component has an educational description explaining what it does,
  why you might or might not want it, and its disk/CPU cost.
"""

from __future__ import annotations

from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import ScrollableContainer, Vertical, Horizontal
from textual.widgets import Checkbox, Footer, Header, Label, Static, Rule

from installer.ui.screens._base import BaseInstallerScreen

# Component definitions: (field_name, label, description, size_hint)
COMPONENTS = [
    (
        "install_juce_engine",
        "JUCE Audio Engine (C++)",
        "Core real-time audio processing engine.\n"
        "Provides: Map2AudioEngine, JuceAudioIO, JuceAudioGraph, pybind11 bridge.\n"
        "Required for all audio processing modes.\n"
        "Disk: ~3 GB (JUCE download + build artifacts).",
        True,  # Required in audio/all-in-one modes
    ),
    (
        "install_lv2_plugins",
        "LV2 / VST3 Plugin Suite",
        "LV2 and VST3 audio plugins for effects, EQ, compression, reverb, etc.\n"
        "Includes: Airwindows, ToobAmp, and the full LV2 collection.\n"
        "Disk: ~500 MB.  CPU: negligible at idle.",
        False,
    ),
    (
        "install_nam",
        "Neural Amp Modeler (NAM)",
        "Neural network-based guitar amp modelling.\n"
        "Captures and replays the exact character of real tube amplifiers.\n"
        "Uses CPU SIMD intrinsics — benefits from -march=native build flag.\n"
        "Disk: ~100 MB.  CPU: 5–15% of one core at 48 kHz.",
        False,
    ),
    (
        "install_frontend",
        "React Web Frontend",
        "Browser-based control interface for MAP2.\n"
        "Features: signal chain editor, MPX-1 panel, AVB diagnostics, metering.\n"
        "Served by the Python FastAPI backend on port 3000.\n"
        "Grafana is a separate management-plane UI and should stay off dedicated audio nodes.\n"
        "Disk: ~500 MB (node_modules + bundle).  RAM: ~50 MB serving.",
        False,
    ),
    (
        "install_avb",
        "AVB / IEEE 1722 Networking",
        "Audio-Video Bridging for ultra-low-latency network audio.\n"
        "Streams uncompressed audio between MAP2 nodes over Gigabit Ethernet.\n"
        "Requires: hardware AVB-capable NIC + AVB-aware network switch.\n"
        "Adds: avb_service.py, AVTP stack in JUCE engine, SRP protocol.",
        False,
    ),
    (
        "install_lcd",
        "LCD Display Support",
        "Support for HD44780-compatible 20x4 LCD displays.\n"
        "Shows: latency, level meters, current mode, stream status.\n"
        "Requires: USB-to-serial adapter or I2C connection.\n"
        "Disk: ~10 MB.  CPU: <1%.",
        False,
    ),
    (
        "install_cluster_mgr",
        "Cluster Manager",
        "Multi-node orchestration for MAP2 audio networks.\n"
        "Features: node health, failover, flow assignment, load balancing, and central observability hosting.\n"
        "Prometheus/Grafana belong on management or all-in-one nodes, not dedicated audio nodes.\n"
        "Required for multi-node deployments; optional for single-node.\n"
        "Disk: ~50 MB.  RAM: ~30 MB.",
        False,
    ),
]


class SoftwareScreen(BaseInstallerScreen):

    SCREEN_TITLE    = "Software Selection"
    SCREEN_SUBTITLE = "Choose which MAP2 components to install"

    BINDINGS = BaseInstallerScreen.BINDINGS + [
        Binding("ctrl+n", "go_next", "Continue ▶", show=True),
    ]

    CSS = """
    SoftwareScreen { background: $surface; }
    .section-label {
        color: $primary;
        text-style: bold;
        margin: 1 4 0 4;
    }
    .component-card {
        margin: 0 4 1 4;
        border: round $primary;
        padding: 1;
        height: auto;
    }
    .component-desc {
        color: $text-muted;
        margin-left: 4;
    }
    .required-badge {
        color: $accent;
        text-style: italic;
        margin-left: 4;
    }
    #mode-notice {
        margin: 1 4;
        color: $text-muted;
        border-left: thick $accent;
        padding-left: 2;
    }
    """

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with ScrollableContainer():
            yield Static(
                f"Mode '{self.config.mode.value}' defaults shown. "
                "You can enable/disable any component.",
                id="mode-notice",
            )
            yield Label("Components", classes="section-label")
            for field, label, desc, _ in COMPONENTS:
                current = getattr(self.config.software, field, False)
                with Vertical(classes="component-card"):
                    yield Checkbox(label, value=current, id=f"check-{field}", name=field)
                    yield Static(desc, classes="component-desc")
        yield Footer()

    def on_checkbox_changed(self, event: Checkbox.Changed) -> None:
        """Write checkbox state directly to config.software."""
        field = event.checkbox.name
        if field and hasattr(self.config.software, field):
            setattr(self.config.software, field, event.value)

    def validate(self) -> list[str]:
        errors = []
        sw = self.config.software
        # LV2 and NAM require the JUCE engine
        if (sw.install_lv2_plugins or sw.install_nam) and not sw.install_juce_engine:
            errors.append("LV2 plugins and NAM require the JUCE audio engine. Enable it above.")
        # AVB also needs the engine (AVTP is embedded in the C++ layer)
        if sw.install_avb and not sw.install_juce_engine:
            errors.append("AVB networking requires the JUCE audio engine.")
        return errors

    @property
    def help_text(self) -> str:
        return """\
# Software Selection

Choose which MAP2 components to install.  Components disabled for your
selected mode are unchecked by default but can be re-enabled here.

## JUCE Audio Engine
The heart of MAP2.  The C++ engine is compiled with:
  cmake -B juce-engine/build -DCMAKE_BUILD_TYPE=Release
  cmake --build juce-engine/build
Build time: ~10 minutes on a modern 6-core CPU.

Why C++?  Real-time audio constraints (no GC pauses, no interpreter
overhead, guaranteed sub-millisecond latency) require native code.
Python is used for configuration and control, not the audio path.

## LV2 / VST3 Plugins
LV2 is an open plugin standard for Linux audio.  MAP2 uses Lilv to
load and host LV2 plugins inside the JUCE engine via the PDC (Plugin
Delay Compensator) graph.

## NAM (Neural Amp Modeler)
NAM uses a WaveNet-like convolutional neural network to model tube amp
response in real time.  It achieves professional-quality amp tones at
only ~10% CPU on a modern Intel CPU with AVX2 support.

## Pro Tip
If disk space is tight, disable the JUCE build and use a pre-built
binary (if available for your architecture).  Or skip NAM — you can
always re-run the installer to add components later.

## Common Pitfall
Enabling AVB without an AVB-capable NIC will cause the AVB service to
fail on startup.  The installer will warn you if no suitable NIC is
detected in the Network screen.

Navigate: Tab / Shift-Tab │ Help: F1 │ Next: Ctrl+N │ Back: Escape
"""

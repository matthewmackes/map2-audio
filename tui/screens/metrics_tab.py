"""
World-Class Settings & Control Panel
Professional layout with comprehensive system management
"""

import asyncio
from pathlib import Path
from typing import Optional, List, Dict, Any

from textual.app import ComposeResult
from textual.widgets import Static, Button, Label, Input, OptionList, DataTable
from textual.widgets.option_list import Option
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.reactive import reactive

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from ..api_client import MAP2APIClient


class StatusPanel(Container):
    """Real-time status overview panel."""

    DEFAULT_CSS = """
    StatusPanel {
        height: auto;
        border: heavy $success;
        background: $panel;
        padding: 0 2;
        margin-bottom: 1;
    }

    StatusPanel .status-title {
        width: 100%;
        height: 1;
        text-style: bold;
        color: $success;
        text-align: center;
    }

    StatusPanel .status-grid {
        height: auto;
        width: 100%;
    }

    StatusPanel .status-item {
        height: 1;
        width: 33%;
    }

    StatusPanel .status-label {
        width: 14;
        color: $text-muted;
    }

    StatusPanel .status-value {
        color: $text;
        text-style: bold;
    }
    """

    def compose(self) -> ComposeResult:
        yield Label("⚡ SYSTEM STATUS", classes="status-title")
        with Horizontal(classes="status-grid"):
            with Vertical(classes="status-item"):
                with Horizontal():
                    yield Label("Backend:", classes="status-label")
                    yield Static("...", id="status-backend", classes="status-value")
                with Horizontal():
                    yield Label("Audio:", classes="status-label")
                    yield Static("...", id="status-audio", classes="status-value")
                with Horizontal():
                    yield Label("MIDI:", classes="status-label")
                    yield Static("...", id="status-midi", classes="status-value")
            with Vertical(classes="status-item"):
                with Horizontal():
                    yield Label("USB Device:", classes="status-label")
                    yield Static("...", id="status-usb", classes="status-value")
                with Horizontal():
                    yield Label("CPU:", classes="status-label")
                    yield Static("...", id="status-cpu", classes="status-value")
                with Horizontal():
                    yield Label("Memory:", classes="status-label")
                    yield Static("...", id="status-memory", classes="status-value")
            with Vertical(classes="status-item"):
                with Horizontal():
                    yield Label("RT Quality:", classes="status-label")
                    yield Static("...", id="status-rt", classes="status-value")
                with Horizontal():
                    yield Label("DSP Load:", classes="status-label")
                    yield Static("...", id="status-dsp", classes="status-value")
                with Horizontal():
                    yield Label("Xruns:", classes="status-label")
                    yield Static("0", id="status-xruns", classes="status-value")


class ControlPanel(Container):
    """Control panel with title and buttons."""

    DEFAULT_CSS = """
    ControlPanel {
        height: auto;
        border: solid $primary;
        background: $panel;
        padding: 0 1;
        margin-bottom: 1;
    }

    ControlPanel .panel-title {
        width: 100%;
        height: 1;
        text-style: bold;
        color: $accent;
    }

    ControlPanel .btn-row {
        width: 100%;
        height: auto;
        margin-top: 0;
    }

    ControlPanel Button {
        width: 1fr;
        height: 3;
        min-width: 10;
        text-style: bold;
        margin: 0 1 0 0;
    }

    ControlPanel Button:last-child {
        margin-right: 0;
    }

    ControlPanel .info-box {
        width: 100%;
        min-height: 2;
        border: solid $primary-darken-1;
        background: $panel-darken-1;
        padding: 0 1;
        margin: 0;
        color: $text-muted;
    }

    ControlPanel OptionList {
        height: 5;
        border: solid $primary-darken-1;
        margin: 0;
    }

    ControlPanel Input {
        width: 1fr;
        margin-right: 1;
    }

    ControlPanel .input-row {
        width: 100%;
        height: auto;
        margin: 0;
    }
    """

    def __init__(self, title: str, icon: str = "", *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.panel_title = f"{icon} {title}" if icon else title

    def compose(self) -> ComposeResult:
        yield Label(self.panel_title, classes="panel-title")


class MetricsTab(ScrollableContainer):
    """World-class settings and control panel."""

    CSS = """
    MetricsTab {
        background: $background;
        padding: 0 1;
        overflow-y: auto;
        height: 100%;
    }

    .main-header {
        width: 100%;
        height: 1;
        content-align: center middle;
        background: $accent;
        color: $text;
        text-style: bold;
    }

    .two-col {
        width: 100%;
        height: auto;
    }

    .col-left {
        width: 50%;
        height: auto;
        padding-right: 1;
    }

    .col-right {
        width: 50%;
        height: auto;
        padding-left: 1;
    }

    .btn-green {
        background: $success;
        color: $text;
    }

    .btn-green:hover {
        background: $success-lighten-1;
    }

    .btn-red {
        background: $error;
        color: $text;
    }

    .btn-red:hover {
        background: $error-lighten-1;
    }

    .btn-yellow {
        background: $warning;
        color: #000000;
    }

    .btn-yellow:hover {
        background: $warning-lighten-1;
    }

    .btn-blue {
        background: $primary;
        color: $text;
    }

    .btn-blue:hover {
        background: $primary-lighten-1;
    }
    """

    audio_running: reactive[bool] = reactive(False)
    midi_enabled: reactive[bool] = reactive(False)

    def __init__(self, api_client: MAP2APIClient, id: Optional[str] = None):
        super().__init__(id=id)
        self.api_client = api_client
        self.project_root = Path("/home/mm/map2-audio")
        self.sessions = []
        self.presets = []
        self.templates = []

        # Additional state for backward compatibility
        self.target_cpu = 80.0
        self.midi_learning = False
        self.midi_mappings = []
        self.sample_rate = 48000
        self.buffer_size = 256
        self.alsa_device = ""

    def compose(self) -> ComposeResult:
        """Build world-class UI."""

        # Main Header
        yield Label("⚙️ SYSTEM SETTINGS & CONTROL CENTER", classes="main-header")


        # Status Overview
        yield StatusPanel()

        # Real-time Buffer/CPU/XRun Visuals
        with Horizontal():
            yield Label("Buffer Health:")
            yield ProgressBar(total=100, id="buffer-health-bar", classes="buffer-health-bar")
            yield Label("CPU:")
            yield ProgressBar(total=100, id="cpu-bar", classes="cpu-bar")
            yield Label("XRuns:")
            yield Static("0", id="xruns-count", classes="xruns-count")

        # Single Column Layout - Core System Controls
        with Vertical():

            # Audio Engine Control
            with ControlPanel("AUDIO ENGINE", "🎵"):
                yield Static("SR: ... | Buf: ... | Lat: ... | Dev: ...", id="audio-info", classes="info-box")
                with Horizontal(classes="btn-row"):
                    yield Button("▶ START", id="btn-audio-start", classes="btn-green")
                    yield Button("⏹ STOP", id="btn-audio-stop", classes="btn-red")
                    yield Button("🔄 RESTART", id="btn-audio-restart", classes="btn-yellow")
                with Horizontal(classes="btn-row"):
                    yield Button("🔍 STATUS", id="btn-audio-status", classes="btn-blue")
                    yield Button("⚙️ CONFIG", id="btn-audio-config", classes="btn-blue")
                # Buffer size and RT priority controls
                with Horizontal(classes="btn-row"):
                    yield Label("Buffer Size:")
                    yield Select(options=[("64",64),("128",128),("256",256),("512",512),("1024",1024)], value=str(self.buffer_size), id="buffer-size-select")
                    yield Label("RT Priority:")
                    yield Switch(value=True, id="rt-priority-switch")

                # MIDI Control
                with ControlPanel("MIDI CONTROL", "🎹"):
                    yield Static("Device: ... | Mappings: 0 | Learn: Off", id="midi-info", classes="info-box")
                    with Horizontal(classes="btn-row"):
                        yield Button("✅ ENABLE", id="btn-midi-enable", classes="btn-green")
                        yield Button("❌ DISABLE", id="btn-midi-disable", classes="btn-red")
                        yield Button("🎓 LEARN", id="btn-midi-learn", classes="btn-yellow")
                    with Horizontal(classes="btn-row"):
                        yield Button("⏹ STOP LEARN", id="btn-midi-stop-learn", classes="btn-red")
                        yield Button("📋 MAPPINGS", id="btn-midi-mappings", classes="btn-blue")

                # USB Audio Interface
                with ControlPanel("USB AUDIO", "🔌"):
                    yield Static("Device: ... | Autosuspend: ... | Status: ...", id="usb-info", classes="info-box")
                    with Horizontal(classes="btn-row"):
                        yield Button("🔍 DETECT", id="btn-usb-detect", classes="btn-blue")
                        yield Button("⏰ NO SLEEP", id="btn-usb-nosleep", classes="btn-green")
                        yield Button("🩺 DIAG", id="btn-usb-diag", classes="btn-yellow")

                # DSP Performance
                with ControlPanel("DSP PERFORMANCE", "⚙️"):
                    yield Static("Mode: ... | Load: ...% | Headroom: ...%", id="dsp-info", classes="info-box")
                    with Horizontal(classes="btn-row"):
                        yield Button("⚡ PERF", id="btn-dsp-perf", classes="btn-green")
                        yield Button("⚖️ BAL", id="btn-dsp-balanced", classes="btn-yellow")
                        yield Button("💎 QUAL", id="btn-dsp-quality", classes="btn-blue")
                    with Horizontal(classes="btn-row"):
                        yield Button("🚀 AUTO OPT", id="btn-dsp-optimize", classes="btn-yellow")
                        yield Button("🔍 HEADROOM", id="btn-dsp-headroom", classes="btn-blue")
                        yield Button("📊 STATUS", id="btn-dsp-status", classes="btn-blue")

                # Snapshots (Quick Save/Recall)
                with ControlPanel("SNAPSHOTS", "💾"):
                    yield Static("Current: None | Last Saved: ...", id="snapshot-info", classes="info-box")
                    with Horizontal(classes="btn-row"):
                        yield Button("0", id="btn-snapshot-0", classes="btn-yellow")
                        yield Button("1", id="btn-snapshot-1", classes="btn-yellow")
                        yield Button("2", id="btn-snapshot-2", classes="btn-yellow")
                        yield Button("3", id="btn-snapshot-3", classes="btn-yellow")
                        yield Button("4", id="btn-snapshot-4", classes="btn-yellow")
                    with Horizontal(classes="btn-row"):
                        yield Button("5", id="btn-snapshot-5", classes="btn-yellow")
                        yield Button("6", id="btn-snapshot-6", classes="btn-yellow")
                        yield Button("7", id="btn-snapshot-7", classes="btn-yellow")
                        yield Button("💾 SAVE", id="btn-snapshot-save", classes="btn-green")
                        yield Button("📋 LIST", id="btn-snapshot-list", classes="btn-blue")

    async def on_mount(self) -> None:
        """Initialize on mount."""
        try:
            from ..polling_config import get_polling_interval
            await self.refresh_data()
            self.set_interval(get_polling_interval('audio_status'), self.refresh_data)  # 7s non-disruptive polling
        except Exception as e:
            self.log.error(f"Mount error: {e}")

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle all button clicks with proper error handling."""
        btn_id = event.button.id
        if not btn_id:
            return

        try:
            # Audio Engine
            if btn_id == "btn-audio-start":
                await self._start_audio()
            elif btn_id == "btn-audio-stop":
                await self._stop_audio()
            elif btn_id == "btn-audio-restart":
                await self._restart_audio()
            elif btn_id == "btn-audio-status":
                await self._show_audio_status()
            elif btn_id == "btn-audio-config":
                await self._show_audio_config()

            # MIDI
            elif btn_id == "btn-midi-enable":
                await self._enable_midi()
            elif btn_id == "btn-midi-disable":
                await self._disable_midi()
            elif btn_id == "btn-midi-learn":
                await self._start_midi_learn()
            elif btn_id == "btn-midi-stop-learn":
                await self._stop_midi_learn()
            elif btn_id == "btn-midi-mappings":
                await self._show_midi_mappings()

            # USB
            elif btn_id == "btn-usb-detect":
                await self._detect_usb()
            elif btn_id == "btn-usb-nosleep":
                await self._usb_no_sleep()
            elif btn_id == "btn-usb-diag":
                await self._usb_diagnostics()
            elif btn_id == "btn-usb-alsa":
                await self._usb_alsa_config()

            # DSP
            elif btn_id == "btn-dsp-optimize":
                await self._optimize_dsp()
            elif btn_id == "btn-dsp-headroom":
                await self._show_cpu_headroom()
            elif btn_id == "btn-dsp-perf":
                await self._set_dsp_mode("performance")
            elif btn_id == "btn-dsp-balanced":
                await self._set_dsp_mode("balanced")
            elif btn_id == "btn-dsp-quality":
                await self._set_dsp_mode("quality")
            elif btn_id == "btn-dsp-status":
                await self._show_dsp_status()

            # Snapshots
            elif btn_id and btn_id.startswith("btn-snapshot-"):
                snap_num = int(btn_id.split("-")[-1])
                await self._load_snapshot(snap_num)
            elif btn_id == "btn-snapshot-save":
                await self._save_current_snapshot()
            elif btn_id == "btn-snapshot-list":
                await self._show_snapshot_list()

        except Exception as e:
            self.app.notify(f"Error: {str(e)}", severity="error", timeout=5)
            self.log.error(f"Button handler error for {btn_id}: {e}")

    async def refresh_data(self) -> None:
        """Update all status displays with safe error handling."""
        try:
            # Backend status
            try:
                backend_ok = await self.api_client.health_check()
                self.query_one("#status-backend", Static).update(
                    "[green]✅ Online[/]" if backend_ok else "[red]❌ Offline[/]"
                )
            except:
                self.query_one("#status-backend", Static).update("[red]❌ Error[/]")

            # Audio status
            try:
                result = await self.api_client.get_audio_status()
                audio_status = result.data if hasattr(result, 'data') else result
                if audio_status:
                    running = audio_status.get("running", False)
                    self.query_one("#status-audio", Static).update(
                        "[green]✅ Running[/]" if running else "[yellow]⏹ Stopped[/]"
                    )
                    self.audio_running = running

                    # Update audio info
                    sr = audio_status.get('sample_rate', 'N/A')
                    buf = audio_status.get('buffer_size', 'N/A')
                    lat = audio_status.get('latency_ms', 'N/A')
                    dev = audio_status.get('device', 'N/A')
                    info = f"SR: {sr}Hz | Buf: {buf} | Lat: {lat}ms | Dev: {dev}"
                    self.query_one("#audio-info", Static).update(info)
            except Exception as e:
                self.query_one("#status-audio", Static).update("[red]❌ Error[/]")
                self.log.error(f"Error getting audio status: {e}")

            # USB device
            try:
                result = await self.api_client.get_usb_devices()
                usb_devices = result.data if hasattr(result, 'data') else result
                if usb_devices and len(usb_devices) > 0:
                    self.query_one("#status-usb", Static).update(
                        f"[green]✅ {usb_devices[0].get('name', 'Device')}[/]"
                    )
                else:
                    self.query_one("#status-usb", Static).update("[yellow]⭕ Not found[/]")
            except Exception as e:
                self.query_one("#status-usb", Static).update("[red]❌ Error[/]")
                self.log.error(f"Error getting USB devices: {e}")

            # MIDI status
            try:
                result = await self.api_client.get_midi_status()
                midi_status = result.data if hasattr(result, 'data') else result
                if midi_status:
                    enabled = midi_status.get("enabled", False)
                    self.query_one("#status-midi", Static).update(
                        "[green]✅ Enabled[/]" if enabled else "[yellow]⏹ Disabled[/]"
                    )
                    self.midi_enabled = enabled
            except Exception as e:
                self.query_one("#status-midi", Static).update("[red]❌ Error[/]")
                self.log.error(f"Error getting MIDI status: {e}")

            # Performance metrics
            try:
                result = await self.api_client.get_metrics()
                metrics = result.data if hasattr(result, 'data') else result
                if metrics:
                    cpu = metrics.get("cpu_percent", 0)
                    mem = metrics.get("memory_mb", 0)
                    rt_load = metrics.get("dsp_load", 0)

                    self.query_one("#status-cpu", Static).update(f"[cyan]{cpu:.1f}%[/]")
                    self.query_one("#status-memory", Static).update(f"[cyan]{mem:.0f} MB[/]")
                    self.query_one("#status-dsp", Static).update(f"[cyan]{rt_load:.1f}%[/]")

                    # Update metrics display
                    metrics_text = f"CPU: [cyan]{cpu:.1f}%[/] | Mem: [cyan]{mem:.0f} MB[/] | DSP: [cyan]{rt_load:.1f}%[/]"
                    self.query_one("#metrics-display", Static).update(metrics_text)
            except Exception as e:
                self.query_one("#status-cpu", Static).update("[red]N/A[/]")
                self.log.error(f"Error getting metrics: {e}")

            # RT quality
            try:
                result = await self.api_client.get_realtime_status()
                rt_status = result.data if hasattr(result, 'data') else result
                if rt_status:
                    grade = rt_status.get("rt_quality", "Unknown")
                    color = "green" if grade == "A" else "yellow" if grade in ["B", "C"] else "red"
                    self.query_one("#status-rt", Static).update(f"[{color}]{grade}[/]")
            except Exception as e:
                self.query_one("#status-rt", Static).update("[red]N/A[/]")
                self.log.error(f"Error getting RT status: {e}")

        except Exception as e:
            self.log.error(f"Error refreshing data: {e}")

    # ═══════════════════════════════════════════════════════════════════════
    # Audio Engine Methods
    # ═══════════════════════════════════════════════════════════════════════

    async def _start_audio(self) -> None:
        result = await self.api_client.start_audio()
        if result.success:
            self.app.notify("✅ Audio engine started", severity="information", timeout=2)
            await self.refresh_data()
        else:
            self.app.notify(f"❌ Failed to start audio: {result.error}", severity="error", timeout=4)

    async def _stop_audio(self) -> None:
        result = await self.api_client.stop_audio()
        if result.success:
            self.app.notify("⏹ Audio engine stopped", severity="warning", timeout=2)
            await self.refresh_data()
        else:
            self.app.notify(f"❌ Failed to stop audio: {result.error}", severity="error", timeout=4)

    async def _restart_audio(self) -> None:
        self.app.notify("🔄 Restarting audio engine...", severity="information", timeout=2)
        await self._stop_audio()
        await asyncio.sleep(0.5)
        await self._start_audio()

    async def _show_audio_status(self) -> None:
        result = await self.api_client.get_audio_status()
        if result.success and result.data:
            status = result.data
            msg = f"Audio: {status.get('backend', 'N/A')} @ {status.get('sample_rate', 'N/A')}Hz, Buffer: {status.get('buffer_size', 'N/A')}"
            self.app.notify(msg, severity="information", timeout=5)
        else:
            self.app.notify("❌ Failed to get audio status", severity="error", timeout=3)

    async def _show_audio_config(self) -> None:
        """Show current RT/audio configuration summary."""
        rt_result = await self.api_client.get_realtime_status()
        audio_result = await self.api_client.get_audio_status()

        if not rt_result.success and not audio_result.success:
            self.app.notify("❌ Failed to read audio configuration", severity="error", timeout=3)
            return

        rt_quality = "N/A"
        if rt_result.success and isinstance(rt_result.data, dict):
            rt_quality = str(rt_result.data.get("rt_quality", "N/A"))

        backend = sr = buf = "N/A"
        if audio_result.success and isinstance(audio_result.data, dict):
            backend = str(audio_result.data.get("backend", "N/A"))
            sr = str(audio_result.data.get("sample_rate", "N/A"))
            buf = str(audio_result.data.get("buffer_size", "N/A"))

        self.app.notify(
            f"⚙️ {backend} | SR {sr}Hz | Buf {buf} | RT {rt_quality}",
            severity="information",
            timeout=5,
        )

    # ═══════════════════════════════════════════════════════════════════════
    # MIDI Methods
    # ═══════════════════════════════════════════════════════════════════════

    async def _enable_midi(self) -> None:
        result = await self.api_client.enable_midi(True)
        if result.success:
            self.app.notify("✅ MIDI enabled", severity="information", timeout=2)
            await self.refresh_data()
        else:
            self.app.notify(f"❌ Failed: {result.error}", severity="error", timeout=3)

    async def _disable_midi(self) -> None:
        result = await self.api_client.enable_midi(False)
        if result.success:
            self.app.notify("⏹ MIDI disabled", severity="warning", timeout=2)
            await self.refresh_data()
        else:
            self.app.notify(f"❌ Failed: {result.error}", severity="error", timeout=3)

    async def _start_midi_learn(self) -> None:
        result = await self.api_client.start_midi_learn()
        if result.success:
            self.app.notify("🎓 MIDI learn mode active", severity="information", timeout=2)
        else:
            self.app.notify(f"❌ Failed: {result.error}", severity="error", timeout=3)

    async def _stop_midi_learn(self) -> None:
        result = await self.api_client.stop_midi_learn()
        if result.success:
            self.app.notify("⏹ MIDI learn stopped", severity="warning", timeout=2)
        else:
            self.app.notify(f"❌ Failed: {result.error}", severity="error", timeout=3)

    async def _show_midi_mappings(self) -> None:
        """Show summary of configured MIDI mappings."""
        result = await self.api_client.list_midi_mappings()
        if not result.success:
            self.app.notify(f"❌ Failed to fetch mappings: {result.error}", severity="error", timeout=4)
            return

        mappings = result.data or []
        if isinstance(mappings, dict):
            mappings = mappings.get("mappings", [])

        count = len(mappings) if isinstance(mappings, list) else 0
        if count == 0:
            self.app.notify("🎛️ MIDI mappings: none", severity="information", timeout=3)
            return

        self.app.notify(f"🎛️ MIDI mappings configured: {count}", severity="information", timeout=4)

    # ═══════════════════════════════════════════════════════════════════════
    # USB Methods
    # ═══════════════════════════════════════════════════════════════════════

    async def _detect_usb(self) -> None:
        result = await self.api_client.get_usb_devices()
        if result.success and result.data:
            count = len(result.data)
            self.app.notify(f"🔍 Found {count} USB device(s)", severity="information", timeout=3)
            await self.refresh_data()
        else:
            self.app.notify("⭕ No USB devices found", severity="warning", timeout=3)

    async def _usb_no_sleep(self) -> None:
        result = await self.api_client.disable_hotone_autosuspend()
        if result.success:
            self.app.notify("✅ USB autosuspend disabled", severity="information", timeout=2)
        else:
            self.app.notify(f"❌ Failed: {result.error}", severity="error", timeout=3)

    async def _usb_diagnostics(self) -> None:
        result = await self.api_client.get_usb_diagnostics()
        if result.success and result.data:
            self.app.notify(f"🩺 USB Diagnostics: {result.data}", severity="information", timeout=5)
        else:
            self.app.notify("❌ Diagnostics failed", severity="error", timeout=3)

    async def _usb_alsa_config(self) -> None:
        result = await self.api_client.get_alsa_config()
        if result.success and result.data:
            self.app.notify(f"🎚️ ALSA Config loaded", severity="information", timeout=3)
        else:
            self.app.notify("❌ Failed to load ALSA config", severity="error", timeout=3)

    # ═══════════════════════════════════════════════════════════════════════
    # DSP Methods
    # ═══════════════════════════════════════════════════════════════════════

    async def _optimize_dsp(self) -> None:
        result = await self.api_client.optimize_dsp()
        if result.success:
            self.app.notify("🚀 DSP optimized", severity="information", timeout=2)
        else:
            self.app.notify(f"❌ Optimization failed: {result.error}", severity="error", timeout=3)

    async def _show_cpu_headroom(self) -> None:
        result = await self.api_client.get_cpu_headroom()
        if result.success and result.data:
            headroom = result.data.get('headroom_percent', 'N/A')
            self.app.notify(f"📊 CPU Headroom: {headroom}%", severity="information", timeout=3)
        else:
            self.app.notify("❌ Failed to get CPU headroom", severity="error", timeout=3)

    async def _set_dsp_mode(self, mode: str) -> None:
        result = await self.api_client.set_quality_mode(mode)
        if result.success:
            self.app.notify(f"✅ DSP mode: {mode.upper()}", severity="information", timeout=2)
        else:
            self.app.notify(f"❌ Failed to set mode: {result.error}", severity="error", timeout=3)

    async def _show_dsp_status(self) -> None:
        result = await self.api_client.get_dsp_status()
        if result.success and result.data:
            status = result.data
            msg = f"DSP: {status.get('mode', 'N/A')}, Load: {status.get('load_percent', 'N/A')}%"
            self.app.notify(msg, severity="information", timeout=4)
        else:
            self.app.notify("❌ Failed to get DSP status", severity="error", timeout=3)

    # ═══════════════════════════════════════════════════════════════════════
    # Snapshot Methods
    # ═══════════════════════════════════════════════════════════════════════

    async def _load_snapshot(self, snapshot_num: int) -> None:
        result = await self.api_client.load_snapshot(snapshot_num)
        if result.success:
            self.app.notify(f"💾 Loaded snapshot {snapshot_num}", severity="information", timeout=2)
        else:
            self.app.notify(f"❌ Failed to load snapshot: {result.error}", severity="error", timeout=3)

    async def _save_current_snapshot(self) -> None:
        """Save current state into active snapshot slot."""
        current = await self.api_client.get_current_snapshot()
        slot = 0
        if current.success and isinstance(current.data, dict):
            slot = int(current.data.get("snapshot_id", current.data.get("current_snapshot", 0)))

        result = await self.api_client.save_snapshot_slot(slot)
        if result.success:
            self.app.notify(f"💾 Saved snapshot slot {slot}", severity="information", timeout=3)
        else:
            self.app.notify(f"❌ Failed to save snapshot: {result.error}", severity="error", timeout=4)

    async def _show_snapshot_list(self) -> None:
        """Show compact snapshot slot occupancy summary."""
        result = await self.api_client.list_snapshots()
        if not result.success:
            self.app.notify(f"❌ Failed to list snapshots: {result.error}", severity="error", timeout=4)
            return

        data = result.data or {}
        snapshots = data.get("snapshots", []) if isinstance(data, dict) else []
        if not snapshots:
            self.app.notify("📋 No snapshots reported", severity="warning", timeout=3)
            return

        occupied = 0
        for snap in snapshots:
            if isinstance(snap, dict) and (snap.get("has_data") or snap.get("plugin_count", 0) > 0):
                occupied += 1

        self.app.notify(
            f"📋 Snapshots: {occupied}/{len(snapshots)} occupied",
            severity="information",
            timeout=4,
        )

    # Backward compatibility methods
    def update_audio_status(self, *args, **kwargs) -> None:
        """Update audio status display (external - backward compatibility)."""
        try:
            # Called with: audio_running, sample_rate, buffer_size, latency, alsa_device
            if len(args) == 5:
                audio_running, sample_rate, buffer_size, latency, alsa_device = args
                self.audio_running = audio_running
                self.sample_rate = sample_rate
                self.buffer_size = buffer_size
                self.alsa_device = alsa_device

                status_widget = self.query_one("#status-audio", Static)
                status_widget.update("[green]✅ Running[/]" if audio_running else "[yellow]⏹ Stopped[/]")

                # Update audio info box
                info = f"SR: {sample_rate}Hz | Buf: {buffer_size} | Lat: {latency}ms | Dev: {alsa_device}"
                self.query_one("#audio-info", Static).update(info)
            # Called with dict
            elif len(args) == 1 and isinstance(args[0], dict):
                status = args[0]
                running = status.get("running", False)
                self.audio_running = running
                if "sample_rate" in status:
                    self.sample_rate = status["sample_rate"]
                if "buffer_size" in status:
                    self.buffer_size = status["buffer_size"]
                if "alsa_device" in status:
                    self.alsa_device = status["alsa_device"]

                status_widget = self.query_one("#status-audio", Static)
                status_widget.update("[green]✅ Running[/]" if running else "[yellow]⏹ Stopped[/]")
        except Exception as e:
            self.log.error(f"Error in update_audio_status: {e}")

    def update_rt_status(self, status: dict) -> None:
        """Update RT status display (external - backward compatibility)."""
        try:
            if status and isinstance(status, dict):
                grade = status.get("rt_quality", "Unknown")
                color = "green" if grade == "A" else "yellow" if grade in ["B", "C"] else "red"
                self.query_one("#status-rt", Static).update(f"[{color}]{grade}[/]")
        except Exception as e:
            self.log.error(f"Error in update_rt_status: {e}")

    def update_performance(self, cpu_percent: float, dsp_load: float, memory_mb: float = 0.0) -> None:
        """Update performance metrics display (external - backward compatibility)."""
        try:
            # Update status bar
            self.query_one("#status-cpu", Static).update(f"[cyan]{cpu_percent:.1f}%[/]")
            self.query_one("#status-memory", Static).update(f"[cyan]{memory_mb:.0f} MB[/]")
            self.query_one("#status-dsp", Static).update(f"[cyan]{dsp_load:.1f}%[/]")

            # Update metrics display
            metrics_text = f"CPU: [cyan]{cpu_percent:.1f}%[/] | Mem: [cyan]{memory_mb:.0f} MB[/] | DSP: [cyan]{dsp_load:.1f}%[/]"
            self.query_one("#metrics-display", Static).update(metrics_text)
        except Exception as e:
            self.log.error(f"Error in update_performance: {e}")

    def update_version(self, version: str) -> None:
        """Update version display (backward compatibility).
        
        Note: MetricsTab displays real-time performance data only.
        Version info is available in the AboutTab or app header.
        This method exists for interface compatibility with other tabs.
        """
        self.log.debug(f"update_version called with '{version}' - not displayed in MetricsTab")

    def update_midi_status(self, enabled: bool) -> None:
        """Update MIDI status (backward compatibility)."""
        try:
            self.midi_enabled = enabled
            self.query_one("#status-midi", Static).update(
                "[green]✅ Enabled[/]" if enabled else "[yellow]⏹ Disabled[/]"
            )
        except Exception as e:
            self.log.error(f"Error in update_midi_status: {e}")

    def update_midi_device(self, device_name: str) -> None:
        """Update MIDI device name (backward compatibility).
        
        Note: MIDI device details are shown in the dedicated MIDIScreen.
        This method exists for interface compatibility.
        """
        self.log.debug(f"update_midi_device called with '{device_name}' - displayed in MIDIScreen")

    def update_snapshot(self, snapshot_id: int) -> None:
        """Update current snapshot (backward compatibility).
        
        Note: Snapshot management is handled in SessionsScreen.
        This method exists for interface compatibility.
        """
        self.log.debug(f"update_snapshot called with id={snapshot_id} - managed in SessionsScreen")

    def update_audio_levels(self, input_l: float, input_r: float, output_l: float, output_r: float) -> None:
        """Update audio levels (backward compatibility).
        
        Note: Audio level meters are displayed in the main dashboard VU meter widget.
        MetricsTab focuses on system performance metrics (CPU, DSP, memory).
        """
        # Store for potential future use in extended metrics view
        self._audio_levels = {
            'input_l': input_l, 'input_r': input_r,
            'output_l': output_l, 'output_r': output_r
        }

    def update_cpu_headroom(self, headroom: float) -> None:
        """Update CPU headroom percentage.
        
        Headroom indicates remaining CPU capacity for real-time audio processing.
        Higher headroom means more processing capacity available.
        """
        try:
            # Update DSP headroom in the status display
            headroom_pct = max(0.0, min(100.0, headroom))
            status_text = f"[green]{headroom_pct:.1f}%[/]" if headroom_pct > 30 else f"[yellow]{headroom_pct:.1f}%[/]" if headroom_pct > 10 else f"[red]{headroom_pct:.1f}%[/]"
            self.query_one("#status-dsp", Static).update(status_text)
        except Exception as e:
            self.log.debug(f"Could not update headroom display: {e}")

    def update_target_cpu(self, target: float) -> None:
        """Update target CPU (backward compatibility)."""
        self.target_cpu = target

    def set_midi_learn_active(self, active: bool) -> None:
        """Set MIDI learn active state (backward compatibility)."""
        self.midi_learning = active

    def update_midi_devices(self, devices: list) -> None:
        """Update MIDI devices list (backward compatibility).
        
        Note: Full MIDI device listing is available in MIDIScreen.
        This stores device count for potential status bar updates.
        """
        self._midi_device_count = len(devices) if devices else 0
        self.log.debug(f"MIDI devices updated: {self._midi_device_count} device(s) available")

    def update_midi_engine_status(self, running: bool) -> None:
        """Update MIDI engine running status.
        
        Tracks whether the MIDI engine is active for status display.
        """
        self._midi_engine_running = running
        try:
            # Update MIDI indicator in status bar if visible
            self.query_one("#status-midi", Static).update(
                "[green]✅ MIDI[/]" if running else "[dim]⏹ MIDI[/]"
            )
        except Exception:
            pass  # Status widget may not exist in all configurations

    def update_midi_mappings(self, mappings: list) -> None:
        """Update MIDI mappings (backward compatibility)."""
        self.midi_mappings = mappings

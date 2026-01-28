"""
Automation Editor Tab
Timeline-based parameter automation with LFO configuration
Parity with web AutomationEditor.tsx component
"""

import asyncio
from typing import Optional, List, Dict, Any

from textual.app import ComposeResult
from textual.widgets import Static, Button, Label, Input, Select, DataTable, Switch
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.reactive import reactive

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from api_client import MAP2APIClient
from widgets import ActionButton, StatusIndicator, LoadingIndicator


# Constants
CURVE_TYPES = [
    ("Linear", "linear"),
    ("Exponential", "exponential"),
    ("Logarithmic", "logarithmic"),
    ("S-Curve", "s_curve"),
    ("Step", "step"),
]

LFO_WAVEFORMS = [
    ("Sine", "sine"),
    ("Triangle", "triangle"),
    ("Square", "square"),
    ("Sawtooth", "saw"),
]


class TransportControls(Container):
    """Transport controls for automation playback."""

    DEFAULT_CSS = """
    TransportControls {
        height: auto;
        width: 100%;
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    .transport-title {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    .transport-buttons {
        width: 100%;
        height: auto;
    }

    .transport-buttons Button {
        min-width: 12;
        margin-right: 1;
    }

    .transport-status {
        color: $text-muted;
        margin-top: 1;
    }

    .playing {
        color: $success;
        text-style: bold;
    }

    .paused {
        color: $warning;
    }

    .stopped {
        color: $text-muted;
    }
    """

    is_playing: reactive[bool] = reactive(False)
    is_paused: reactive[bool] = reactive(False)
    is_looping: reactive[bool] = reactive(False)
    current_time: reactive[float] = reactive(0.0)

    def compose(self) -> ComposeResult:
        yield Label("🎬 Transport", classes="transport-title")
        with Horizontal(classes="transport-buttons"):
            yield Button("⏮ Rewind", id="btn-rewind", variant="default")
            yield Button("▶ Play", id="btn-play", variant="success")
            yield Button("⏸ Pause", id="btn-pause", variant="warning")
            yield Button("⏹ Stop", id="btn-stop", variant="error")
            yield Button("🔁 Loop", id="btn-loop", variant="default")
        yield Static("Status: Stopped | Time: 0.00s", id="transport-status", classes="transport-status stopped")

    def watch_is_playing(self, playing: bool) -> None:
        """Update status display when playing state changes."""
        self._update_status()

    def watch_is_paused(self, paused: bool) -> None:
        """Update status display when paused state changes."""
        self._update_status()

    def watch_is_looping(self, looping: bool) -> None:
        """Update loop button appearance."""
        try:
            loop_btn = self.query_one("#btn-loop", Button)
            if looping:
                loop_btn.variant = "primary"
            else:
                loop_btn.variant = "default"
        except Exception:
            pass

    def _update_status(self) -> None:
        """Update the status display."""
        try:
            status = self.query_one("#transport-status", Static)
            loop_str = " [LOOP]" if self.is_looping else ""

            if self.is_playing:
                status.update(f"Status: ▶ Playing{loop_str} | Time: {self.current_time:.2f}s")
                status.remove_class("stopped", "paused")
                status.add_class("playing")
            elif self.is_paused:
                status.update(f"Status: ⏸ Paused{loop_str} | Time: {self.current_time:.2f}s")
                status.remove_class("stopped", "playing")
                status.add_class("paused")
            else:
                status.update(f"Status: ⏹ Stopped{loop_str} | Time: 0.00s")
                status.remove_class("playing", "paused")
                status.add_class("stopped")
        except Exception:
            pass


class LFOConfigPanel(Container):
    """LFO configuration panel for a parameter."""

    DEFAULT_CSS = """
    LFOConfigPanel {
        height: auto;
        width: 100%;
        background: $panel;
        border: solid $warning;
        padding: 1;
        margin-bottom: 1;
    }

    .lfo-title {
        text-style: bold;
        color: $warning;
        margin-bottom: 1;
    }

    .lfo-row {
        width: 100%;
        height: auto;
        margin-bottom: 1;
    }

    .lfo-label {
        width: 15;
        color: $text-muted;
    }

    .lfo-value {
        width: 1fr;
    }

    .lfo-active {
        background: $warning 20%;
    }
    """

    def __init__(self, api_client: MAP2APIClient, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client
        self.selected_parameter: Optional[str] = None

    def compose(self) -> ComposeResult:
        yield Label("🌊 LFO Configuration", classes="lfo-title")

        with Horizontal(classes="lfo-row"):
            yield Label("Parameter:", classes="lfo-label")
            yield Static("None selected", id="lfo-param-name", classes="lfo-value")

        with Horizontal(classes="lfo-row"):
            yield Label("Waveform:", classes="lfo-label")
            yield Select(
                options=LFO_WAVEFORMS,
                id="lfo-waveform",
                value="sine"
            )

        with Horizontal(classes="lfo-row"):
            yield Label("Rate (Hz):", classes="lfo-label")
            yield Input(placeholder="1.0", id="lfo-rate", value="1.0")

        with Horizontal(classes="lfo-row"):
            yield Label("Depth (%):", classes="lfo-label")
            yield Input(placeholder="50", id="lfo-depth", value="50")

        with Horizontal(classes="lfo-row"):
            yield ActionButton("Apply LFO", variant="warning", id="btn-apply-lfo")
            yield ActionButton("Remove LFO", variant="error", id="btn-remove-lfo")

    def set_parameter(self, param_id: str, param_name: str) -> None:
        """Set the parameter being configured."""
        self.selected_parameter = param_id
        try:
            name_label = self.query_one("#lfo-param-name", Static)
            name_label.update(param_name)
        except Exception:
            pass


class AutomationLaneList(Container):
    """List of automation lanes with their points."""

    DEFAULT_CSS = """
    AutomationLaneList {
        height: 1fr;
        width: 100%;
        background: $panel;
        border: solid $primary;
        padding: 1;
    }

    .lanes-title {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    .lanes-table {
        height: 1fr;
        width: 100%;
    }
    """

    lanes: reactive[List[Dict]] = reactive(list)

    def compose(self) -> ComposeResult:
        yield Label("📊 Automation Lanes", classes="lanes-title")
        yield DataTable(id="lanes-table", classes="lanes-table")

    def on_mount(self) -> None:
        """Set up the data table."""
        table = self.query_one("#lanes-table", DataTable)
        table.add_columns("ID", "Parameter", "Points", "LFO", "Actions")

    def update_lanes(self, lanes: List[Dict]) -> None:
        """Update the lanes display."""
        self.lanes = lanes
        try:
            table = self.query_one("#lanes-table", DataTable)
            table.clear()

            for lane in lanes:
                lane_id = lane.get("id", 0)
                param_name = lane.get("parameter_name", "Unknown")
                point_count = len(lane.get("points", []))
                has_lfo = "🌊 Yes" if lane.get("lfo_config") else "No"

                table.add_row(
                    str(lane_id),
                    param_name,
                    str(point_count),
                    has_lfo,
                    "Edit | Delete"
                )
        except Exception:
            pass


class AddPointPanel(Container):
    """Panel for adding automation points."""

    DEFAULT_CSS = """
    AddPointPanel {
        height: auto;
        width: 100%;
        background: $panel;
        border: solid $success;
        padding: 1;
        margin-bottom: 1;
    }

    .add-title {
        text-style: bold;
        color: $success;
        margin-bottom: 1;
    }

    .add-row {
        width: 100%;
        height: auto;
        margin-bottom: 1;
    }

    .add-label {
        width: 12;
        color: $text-muted;
    }

    .add-value {
        width: 1fr;
    }
    """

    def compose(self) -> ComposeResult:
        yield Label("➕ Add Automation Point", classes="add-title")

        with Horizontal(classes="add-row"):
            yield Label("Lane:", classes="add-label")
            yield Select(options=[], id="add-lane-select")

        with Horizontal(classes="add-row"):
            yield Label("Time (s):", classes="add-label")
            yield Input(placeholder="0.0", id="add-time", value="0.0")

        with Horizontal(classes="add-row"):
            yield Label("Value (%):", classes="add-label")
            yield Input(placeholder="50", id="add-value", value="50")

        with Horizontal(classes="add-row"):
            yield Label("Curve:", classes="add-label")
            yield Select(options=CURVE_TYPES, id="add-curve", value="linear")

        yield ActionButton("Add Point", variant="success", id="btn-add-point")


class AutomationTab(ScrollableContainer):
    """
    Automation Editor Tab.

    Features:
    - Transport controls (play/pause/stop/rewind/loop)
    - Automation lane list
    - Add/edit automation points
    - LFO configuration per parameter
    """

    CSS = """
    AutomationTab {
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
        width: 60%;
        height: auto;
        padding-right: 1;
    }

    .col-right {
        width: 40%;
        height: auto;
        padding-left: 1;
    }

    .section-title {
        text-style: bold;
        color: $accent;
        margin-top: 1;
        margin-bottom: 1;
    }

    .active-lfos {
        background: $panel;
        border: solid $warning;
        padding: 1;
        margin-bottom: 1;
    }
    """

    def __init__(self, api_client: MAP2APIClient, id: Optional[str] = None):
        super().__init__(id=id)
        self.api_client = api_client
        self.lanes: List[Dict] = []
        self.lfos: List[Dict] = []
        self.status: Dict[str, Any] = {}

    def compose(self) -> ComposeResult:
        """Build automation editor UI."""

        # Main Header
        yield Label("🎛️ AUTOMATION EDITOR", classes="main-header")

        # Loading indicator
        yield LoadingIndicator("Loading automation data...", id="loading-automation")

        # Transport Controls
        yield TransportControls(id="transport")

        # Two Column Layout
        with Horizontal(classes="two-col"):

            # Left Column - Lanes and Points
            with Vertical(classes="col-left"):
                yield AutomationLaneList(id="lane-list")
                yield AddPointPanel(id="add-point-panel")

            # Right Column - LFO Configuration
            with Vertical(classes="col-right"):
                yield LFOConfigPanel(self.api_client, id="lfo-config")

                # Active LFOs display
                with Container(classes="active-lfos"):
                    yield Label("🌊 Active LFOs", classes="section-title")
                    yield Static("No active LFOs", id="active-lfos-list")

    async def on_mount(self) -> None:
        """Initialize automation data on mount."""
        await self.refresh_data()
        # Auto-refresh every 2 seconds for playback status
        self.set_interval(2.0, self.refresh_status)

    async def refresh_data(self) -> None:
        """Refresh all automation data."""
        loading = self.query_one("#loading-automation", LoadingIndicator)
        loading.show("Refreshing automation data...")

        try:
            # Fetch automation status
            status_result = await self.api_client.get_automation_status()
            if status_result.success:
                self.status = status_result.data or {}
                self._update_transport_status()

            # Fetch automation lanes
            lanes_result = await self.api_client.list_automation_lanes()
            if lanes_result.success:
                self.lanes = lanes_result.data.get("lanes", []) if lanes_result.data else []
                self._update_lanes_display()
                self._update_lane_select()

            # Fetch active LFOs
            lfos_result = await self.api_client.list_lfos()
            if lfos_result.success:
                self.lfos = lfos_result.data.get("lfos", []) if lfos_result.data else []
                self._update_lfos_display()

        except Exception as e:
            self.app.notify(f"Error loading automation: {str(e)}", severity="error")
        finally:
            loading.hide()

    async def refresh_status(self) -> None:
        """Refresh only playback status (for frequent updates)."""
        try:
            status_result = await self.api_client.get_automation_status()
            if status_result.success:
                self.status = status_result.data or {}
                self._update_transport_status()
        except Exception:
            pass

    def _update_transport_status(self) -> None:
        """Update transport controls from status."""
        try:
            transport = self.query_one("#transport", TransportControls)
            transport.is_playing = self.status.get("is_playing", False)
            transport.is_paused = self.status.get("is_paused", False)
            transport.is_looping = self.status.get("is_looping", False)
            transport.current_time = self.status.get("current_time", 0.0)
        except Exception:
            pass

    def _update_lanes_display(self) -> None:
        """Update lanes list display."""
        try:
            lane_list = self.query_one("#lane-list", AutomationLaneList)
            lane_list.update_lanes(self.lanes)
        except Exception:
            pass

    def _update_lane_select(self) -> None:
        """Update lane select dropdown."""
        try:
            lane_select = self.query_one("#add-lane-select", Select)
            options = [(lane.get("parameter_name", f"Lane {lane.get('id')}"), str(lane.get("id")))
                       for lane in self.lanes]
            if options:
                lane_select.set_options(options)
        except Exception:
            pass

    def _update_lfos_display(self) -> None:
        """Update active LFOs display."""
        try:
            lfos_display = self.query_one("#active-lfos-list", Static)
            if not self.lfos:
                lfos_display.update("No active LFOs")
            else:
                lines = []
                for lfo in self.lfos:
                    param = lfo.get("parameter_name", lfo.get("parameter_id", "Unknown"))
                    rate = lfo.get("rate_hz", 1.0)
                    depth = lfo.get("depth", 0.5) * 100
                    waveform = lfo.get("waveform", "sine")
                    lines.append(f"🌊 {param}: {waveform} @ {rate:.1f}Hz ({depth:.0f}%)")
                lfos_display.update("\n".join(lines))
        except Exception:
            pass

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button presses."""
        button_id = event.button.id

        if button_id == "btn-play":
            await self._play()
        elif button_id == "btn-pause":
            await self._pause()
        elif button_id == "btn-stop":
            await self._stop()
        elif button_id == "btn-rewind":
            await self._rewind()
        elif button_id == "btn-loop":
            await self._toggle_loop()
        elif button_id == "btn-add-point":
            await self._add_point()
        elif button_id == "btn-apply-lfo":
            await self._apply_lfo()
        elif button_id == "btn-remove-lfo":
            await self._remove_lfo()

    async def _play(self) -> None:
        """Start automation playback."""
        result = await self.api_client.start_automation()
        if result.success:
            self.app.notify("Automation playing", severity="information", timeout=2)
            await self.refresh_status()
        else:
            self.app.notify(f"Failed to start: {result.error}", severity="error")

    async def _pause(self) -> None:
        """Pause automation playback."""
        result = await self.api_client.pause_automation()
        if result.success:
            self.app.notify("Automation paused", severity="information", timeout=2)
            await self.refresh_status()
        else:
            self.app.notify(f"Failed to pause: {result.error}", severity="error")

    async def _stop(self) -> None:
        """Stop automation playback."""
        result = await self.api_client.stop_automation()
        if result.success:
            self.app.notify("Automation stopped", severity="information", timeout=2)
            await self.refresh_status()
        else:
            self.app.notify(f"Failed to stop: {result.error}", severity="error")

    async def _rewind(self) -> None:
        """Rewind automation to start."""
        result = await self.api_client.rewind_automation()
        if result.success:
            self.app.notify("Rewound to start", severity="information", timeout=2)
            await self.refresh_status()
        else:
            self.app.notify(f"Failed to rewind: {result.error}", severity="error")

    async def _toggle_loop(self) -> None:
        """Toggle loop mode."""
        current_loop = self.status.get("is_looping", False)
        result = await self.api_client.set_automation_loop(not current_loop)
        if result.success:
            state = "enabled" if not current_loop else "disabled"
            self.app.notify(f"Loop {state}", severity="information", timeout=2)
            await self.refresh_status()
        else:
            self.app.notify(f"Failed to toggle loop: {result.error}", severity="error")

    async def _add_point(self) -> None:
        """Add an automation point."""
        try:
            lane_select = self.query_one("#add-lane-select", Select)
            time_input = self.query_one("#add-time", Input)
            value_input = self.query_one("#add-value", Input)
            curve_select = self.query_one("#add-curve", Select)

            lane_id = int(lane_select.value) if lane_select.value else None
            if lane_id is None:
                self.app.notify("Please select a lane", severity="warning")
                return

            time_val = float(time_input.value or 0)
            value_val = float(value_input.value or 50) / 100.0  # Convert to 0-1
            curve_type = str(curve_select.value) if curve_select.value else "linear"

            result = await self.api_client.add_automation_point(lane_id, time_val, value_val, curve_type)
            if result.success:
                self.app.notify("Point added", severity="information", timeout=2)
                await self.refresh_data()
            else:
                self.app.notify(f"Failed to add point: {result.error}", severity="error")
        except ValueError as e:
            self.app.notify(f"Invalid input: {str(e)}", severity="error")

    async def _apply_lfo(self) -> None:
        """Apply LFO to selected parameter."""
        try:
            lfo_panel = self.query_one("#lfo-config", LFOConfigPanel)
            if not lfo_panel.selected_parameter:
                self.app.notify("No parameter selected", severity="warning")
                return

            waveform_select = self.query_one("#lfo-waveform", Select)
            rate_input = self.query_one("#lfo-rate", Input)
            depth_input = self.query_one("#lfo-depth", Input)

            waveform = str(waveform_select.value) if waveform_select.value else "sine"
            rate = float(rate_input.value or 1.0)
            depth = float(depth_input.value or 50) / 100.0

            result = await self.api_client.set_lfo(
                lfo_panel.selected_parameter,
                rate,
                depth,
                waveform
            )
            if result.success:
                self.app.notify("LFO applied", severity="information", timeout=2)
                await self.refresh_data()
            else:
                self.app.notify(f"Failed to apply LFO: {result.error}", severity="error")
        except ValueError as e:
            self.app.notify(f"Invalid input: {str(e)}", severity="error")

    async def _remove_lfo(self) -> None:
        """Remove LFO from selected parameter."""
        lfo_panel = self.query_one("#lfo-config", LFOConfigPanel)
        if not lfo_panel.selected_parameter:
            self.app.notify("No parameter selected", severity="warning")
            return

        result = await self.api_client.remove_lfo(lfo_panel.selected_parameter)
        if result.success:
            self.app.notify("LFO removed", severity="information", timeout=2)
            await self.refresh_data()
        else:
            self.app.notify(f"Failed to remove LFO: {result.error}", severity="error")

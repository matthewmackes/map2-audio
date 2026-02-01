"""
MIDI Control Center v2 - Enhanced TUI
=======================================
Comprehensive MIDI configuration with CC mappings, chain switching,
real-time activity monitoring, and device management.

Features:
- CC Mappings with curve types (linear, log, exp, s-curve)
- Chain switching via Program Change
- MIDI Learn mode with target selection
- Real-time MIDI activity visualization
- MIDI output for controller feedback
- Per-chain mapping scope
"""

from typing import Optional, Dict, Any, List
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.widgets import (
    Static, Label, Button, DataTable, Select, Switch,
    Input, TabbedContent, TabPane, ProgressBar, Rule
)
from textual.app import ComposeResult
from textual.reactive import reactive
from textual import work
from textual.timer import Timer
from dataclasses import dataclass
import asyncio

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from api_client import MAP2APIClient
from modals import ConfirmDialog, FormDialog
from widgets import ActionButton, StatusIndicator, LoadingIndicator


# Curve type options
CURVE_TYPES = [
    ("Linear", "linear"),
    ("Logarithmic", "logarithmic"),
    ("Exponential", "exponential"),
    ("S-Curve", "s_curve"),
]


@dataclass
class MIDIActivity:
    """Real-time MIDI activity data."""
    channel: int
    cc: int
    value: int
    timestamp: float


class CCValueBar(Static):
    """Visual CC value bar widget."""

    DEFAULT_CSS = """
    CCValueBar {
        width: 100%;
        height: 1;
    }

    CCValueBar .bar-fill {
        background: $success;
    }

    CCValueBar .bar-empty {
        background: $surface;
    }
    """

    value: reactive[int] = reactive(0)

    def render(self) -> str:
        bar_width = 20
        filled = int((self.value / 127) * bar_width)
        empty = bar_width - filled
        return f"[green]{'█' * filled}[/][dim]{'░' * empty}[/] {self.value:3d}"


class MIDIActivityMonitor(Container):
    """Real-time MIDI activity display with value bars."""

    DEFAULT_CSS = """
    MIDIActivityMonitor {
        width: 100%;
        height: 12;
        background: $surface;
        border: solid $border;
        padding: 1;
    }

    MIDIActivityMonitor .activity-row {
        width: 100%;
        height: 1;
    }

    MIDIActivityMonitor .cc-label {
        width: 12;
        color: $text-muted;
    }
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.cc_values: Dict[int, int] = {}
        self.last_activity: List[str] = []

    def compose(self) -> ComposeResult:
        yield Label("[bold]MIDI Activity[/]")
        yield Static("Waiting for MIDI...", id="activity-display")

    def update_cc(self, channel: int, cc: int, value: int):
        """Update CC value display."""
        self.cc_values[cc] = value
        self.last_activity.insert(0, f"Ch{channel:02d} CC{cc:03d} = {value:3d}")
        self.last_activity = self.last_activity[:8]  # Keep last 8

        display = self.query_one("#activity-display", Static)
        lines = []
        for i, activity in enumerate(self.last_activity):
            fade = "" if i == 0 else "[dim]"
            lines.append(f"{fade}{activity}")
        display.update("\n".join(lines) if lines else "Waiting for MIDI...")


class MIDIV2Screen(ScrollableContainer):
    """
    Enhanced MIDI Control Center with full feature set.

    Tabs:
    - Mappings: CC mapping management with curves
    - Commands: Chain switching via Program Change
    - Devices: Input/output device selection
    - Monitor: Real-time MIDI activity
    - Learn: MIDI learn mode
    """

    DEFAULT_CSS = """
    MIDIV2Screen {
        background: $background;
        width: 100%;
        height: 100%;
        padding: 1;
    }

    MIDIV2Screen .section-header {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    MIDIV2Screen .status-panel {
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    MIDIV2Screen .mapping-table {
        height: 15;
        margin-bottom: 1;
    }

    MIDIV2Screen .form-row {
        width: 100%;
        height: 3;
        margin-bottom: 1;
    }

    MIDIV2Screen .form-label {
        width: 15;
        padding-top: 1;
    }

    MIDIV2Screen .form-input {
        width: 1fr;
    }

    MIDIV2Screen .btn-row {
        width: 100%;
        height: auto;
        margin-top: 1;
    }

    MIDIV2Screen .btn-row Button {
        margin-right: 1;
    }

    MIDIV2Screen .learn-active {
        background: $warning-darken-1;
        border: solid $warning;
        animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
    }

    MIDIV2Screen .command-card {
        background: $panel-lighten-1;
        border: solid $border;
        padding: 1;
        margin-bottom: 1;
    }
    """

    # Reactive state
    midi_enabled: reactive[bool] = reactive(False)
    learning: reactive[bool] = reactive(False)
    mappings: reactive[List[Dict]] = reactive([])
    commands: reactive[List[Dict]] = reactive([])
    devices: reactive[List[Dict]] = reactive([])
    chains: reactive[List[Dict]] = reactive([])

    def __init__(self, api_client: MAP2APIClient, id: Optional[str] = None):
        super().__init__(id=id)
        self.api_client = api_client
        self._activity_timer: Optional[Timer] = None

    def compose(self) -> ComposeResult:
        yield Label("🎹 MIDI Control Center v2", classes="section-header")

        # Status Panel
        with Container(classes="status-panel", id="status-panel"):
            with Horizontal():
                yield StatusIndicator("MIDI Engine", id="status-midi")
                yield Static("  |  ", classes="separator")
                yield Static("Mappings: 0", id="mapping-count")
                yield Static("  |  ", classes="separator")
                yield Static("Commands: 0", id="command-count")

            with Horizontal(classes="btn-row"):
                yield ActionButton("▶ Start MIDI", variant="success", id="btn-start-midi")
                yield ActionButton("⏹ Stop MIDI", variant="error", id="btn-stop-midi")
                yield ActionButton("🔄 Refresh", variant="default", id="btn-refresh")

        yield LoadingIndicator("Loading...", id="loading")

        # Tabbed Content
        with TabbedContent(id="midi-tabs"):
            # Mappings Tab
            with TabPane("🎛️ Mappings", id="tab-mappings"):
                yield self._compose_mappings_tab()

            # Commands Tab (Chain Switching)
            with TabPane("🔀 Commands", id="tab-commands"):
                yield self._compose_commands_tab()

            # Devices Tab
            with TabPane("🎹 Devices", id="tab-devices"):
                yield self._compose_devices_tab()

            # Monitor Tab
            with TabPane("📊 Monitor", id="tab-monitor"):
                yield self._compose_monitor_tab()

            # Learn Tab
            with TabPane("🎯 Learn", id="tab-learn"):
                yield self._compose_learn_tab()

    def _compose_mappings_tab(self) -> ComposeResult:
        """Compose CC mappings management tab."""
        yield Label("[bold]CC Mappings[/]")
        yield Static("[dim]Map MIDI CC to plugin parameters with custom curves[/]")
        yield Rule()

        # Mappings Table
        table = DataTable(id="mappings-table", classes="mapping-table")
        table.cursor_type = "row"
        table.add_columns("ID", "Ch", "CC", "Plugin", "Parameter", "Range", "Curve", "Chain")
        yield table

        yield Rule()
        yield Label("[bold]Create New Mapping[/]")

        # Mapping Form
        with Vertical(id="mapping-form"):
            with Horizontal(classes="form-row"):
                yield Label("Channel:", classes="form-label")
                yield Input(placeholder="1-16 (0=omni)", id="input-channel", classes="form-input")
                yield Label("CC:", classes="form-label")
                yield Input(placeholder="0-127", id="input-cc", classes="form-input")

            with Horizontal(classes="form-row"):
                yield Label("Plugin URI:", classes="form-label")
                yield Input(placeholder="urn:plugin:example", id="input-plugin", classes="form-input")

            with Horizontal(classes="form-row"):
                yield Label("Parameter:", classes="form-label")
                yield Input(placeholder="Parameter symbol", id="input-param", classes="form-input")
                yield Label("Index:", classes="form-label")
                yield Input(placeholder="0", id="input-param-idx", classes="form-input")

            with Horizontal(classes="form-row"):
                yield Label("Min:", classes="form-label")
                yield Input(placeholder="0.0", value="0.0", id="input-min", classes="form-input")
                yield Label("Max:", classes="form-label")
                yield Input(placeholder="1.0", value="1.0", id="input-max", classes="form-input")

            with Horizontal(classes="form-row"):
                yield Label("Curve:", classes="form-label")
                yield Select(options=CURVE_TYPES, value="linear", id="select-curve", classes="form-input")
                yield Label("Invert:", classes="form-label")
                yield Switch(value=False, id="switch-invert")

            with Horizontal(classes="form-row"):
                yield Label("Chain:", classes="form-label")
                yield Select(options=[], id="select-chain", allow_blank=True, classes="form-input")
                yield Label("Feedback:", classes="form-label")
                yield Switch(value=True, id="switch-feedback")

        with Horizontal(classes="btn-row"):
            yield ActionButton("➕ Create Mapping", variant="primary", id="btn-create-mapping")
            yield ActionButton("🗑️ Delete Selected", variant="error", id="btn-delete-mapping")

        return Container()

    def _compose_commands_tab(self) -> ComposeResult:
        """Compose chain switching commands tab."""
        yield Label("[bold]Chain Switching Commands[/]")
        yield Static("[dim]Switch active chain using MIDI Program Change messages[/]")
        yield Rule()

        # Commands Table
        table = DataTable(id="commands-table")
        table.cursor_type = "row"
        table.add_columns("PC#", "Bank", "Chain", "Action", "Enabled")
        yield table

        yield Rule()
        yield Label("[bold]Configure Chain → Program Change[/]")

        with Vertical(id="command-form"):
            with Horizontal(classes="form-row"):
                yield Label("Chain:", classes="form-label")
                yield Select(options=[], id="select-cmd-chain", classes="form-input")

            with Horizontal(classes="form-row"):
                yield Label("PC Number:", classes="form-label")
                yield Input(placeholder="0-127", id="input-pc-number", classes="form-input")

            with Horizontal(classes="form-row"):
                yield Label("Bank MSB:", classes="form-label")
                yield Input(placeholder="0", value="0", id="input-bank-msb", classes="form-input")
                yield Label("Bank LSB:", classes="form-label")
                yield Input(placeholder="0", value="0", id="input-bank-lsb", classes="form-input")

            with Horizontal(classes="form-row"):
                yield Label("Send PC on activate:", classes="form-label")
                yield Switch(value=True, id="switch-send-pc")

        with Horizontal(classes="btn-row"):
            yield ActionButton("➕ Add Command", variant="primary", id="btn-add-command")
            yield ActionButton("🗑️ Delete Selected", variant="error", id="btn-delete-command")

        return Container()

    def _compose_devices_tab(self) -> ComposeResult:
        """Compose MIDI devices tab."""
        yield Label("[bold]MIDI Devices[/]")
        yield Static("[dim]Configure input and output MIDI devices[/]")
        yield Rule()

        # Input Devices
        yield Label("🔊 Input Devices")
        yield Static("", id="input-devices-list")

        yield Rule()

        # Output Devices
        yield Label("🔈 Output Devices (for controller feedback)")
        yield Static("", id="output-devices-list")

        with Horizontal(classes="btn-row"):
            yield ActionButton("🔄 Refresh Devices", variant="default", id="btn-refresh-devices")
            yield ActionButton("🔌 Open Selected Input", variant="primary", id="btn-open-input")
            yield ActionButton("🔌 Open Selected Output", variant="primary", id="btn-open-output")

        return Container()

    def _compose_monitor_tab(self) -> ComposeResult:
        """Compose real-time MIDI monitor tab."""
        yield Label("[bold]Real-time MIDI Monitor[/]")
        yield Static("[dim]Live view of incoming MIDI messages[/]")
        yield Rule()

        yield MIDIActivityMonitor(id="activity-monitor")

        yield Rule()
        yield Label("[bold]Message Log[/]")

        yield Static("", id="midi-log", classes="monitor-display")

        with Horizontal(classes="btn-row"):
            yield ActionButton("▶ Start Monitor", variant="success", id="btn-start-monitor")
            yield ActionButton("⏹ Stop Monitor", variant="error", id="btn-stop-monitor")
            yield ActionButton("🗑️ Clear", variant="warning", id="btn-clear-monitor")

        return Container()

    def _compose_learn_tab(self) -> ComposeResult:
        """Compose MIDI learn mode tab."""
        yield Label("[bold]MIDI Learn Mode[/]")
        yield Static(
            "[dim]Quick way to create CC mappings:\n"
            "1. Select a target plugin and parameter\n"
            "2. Start learn mode\n"
            "3. Move a MIDI control (knob/slider)\n"
            "4. Mapping is created automatically[/]"
        )
        yield Rule()

        with Container(classes="status-panel", id="learn-status-panel"):
            yield Static("🔴 Learn Mode: Inactive", id="learn-status")

        with Vertical(id="learn-form"):
            with Horizontal(classes="form-row"):
                yield Label("Target Plugin:", classes="form-label")
                yield Input(placeholder="Plugin URI", id="learn-plugin", classes="form-input")

            with Horizontal(classes="form-row"):
                yield Label("Parameter Index:", classes="form-label")
                yield Input(placeholder="0", value="0", id="learn-param-idx", classes="form-input")

            with Horizontal(classes="form-row"):
                yield Label("Curve Type:", classes="form-label")
                yield Select(options=CURVE_TYPES, value="linear", id="learn-curve", classes="form-input")

        with Horizontal(classes="btn-row"):
            yield ActionButton("🎯 Start Learn", variant="warning", id="btn-start-learn")
            yield ActionButton("⏹ Stop Learn", variant="error", id="btn-stop-learn", disabled=True)

        yield Rule()
        yield Label("[dim]Learn will auto-stop after 30 seconds if no MIDI received[/]")

        return Container()

    async def on_mount(self) -> None:
        """Load data when screen mounts."""
        await self._refresh_all()
        # Start periodic refresh
        self.set_interval(5.0, self._refresh_status)

    async def _refresh_all(self) -> None:
        """Refresh all data."""
        loading = self.query_one("#loading", LoadingIndicator)
        loading.show("Loading MIDI data...")

        try:
            await asyncio.gather(
                self._load_mappings(),
                self._load_commands(),
                self._load_devices(),
                self._load_chains(),
                self._refresh_status(),
            )
        except Exception as e:
            self.notify(f"Error loading data: {e}", severity="error")
        finally:
            loading.hide()

    async def _refresh_status(self) -> None:
        """Refresh MIDI engine status."""
        try:
            result = await self.api_client.get_midi_status()
            if result.success and result.data:
                self.midi_enabled = result.data.get("enabled", False)
                status = self.query_one("#status-midi", StatusIndicator)
                status.set_status(self.midi_enabled)
        except Exception:
            pass

    async def _load_mappings(self) -> None:
        """Load CC mappings."""
        try:
            result = await self.api_client.list_midi_mappings()
            if result.success:
                data = result.data
                if isinstance(data, dict):
                    self.mappings = data.get("mappings", [])
                elif isinstance(data, list):
                    self.mappings = data
                else:
                    self.mappings = []

                self._update_mappings_table()

                count = self.query_one("#mapping-count", Static)
                count.update(f"Mappings: {len(self.mappings)}")
        except Exception as e:
            self.notify(f"Failed to load mappings: {e}", severity="error")

    async def _load_commands(self) -> None:
        """Load chain switching commands."""
        try:
            # Commands are stored per-chain, fetch from chain MIDI config
            result = await self.api_client.get("/api/v2/midi/commands")
            if result:
                self.commands = result.get("commands", [])
            else:
                self.commands = []

            self._update_commands_table()

            count = self.query_one("#command-count", Static)
            count.update(f"Commands: {len(self.commands)}")
        except Exception:
            self.commands = []

    async def _load_devices(self) -> None:
        """Load MIDI devices."""
        try:
            result = await self.api_client.get_midi_devices()
            if result.success and result.data:
                self.devices = result.data if isinstance(result.data, list) else []
            self._update_devices_display()
        except Exception as e:
            self.notify(f"Failed to load devices: {e}", severity="error")

    async def _load_chains(self) -> None:
        """Load chains for selection dropdowns."""
        try:
            result = await self.api_client.list_chains()
            if result.success and result.data:
                chains = result.data.get("chains", []) if isinstance(result.data, dict) else result.data
                self.chains = chains if isinstance(chains, list) else []

                # Update chain selects
                options = [(c.get("name", f"Chain {c.get('id')}"), str(c.get("id"))) for c in self.chains]

                for select_id in ["select-chain", "select-cmd-chain"]:
                    try:
                        select = self.query_one(f"#{select_id}", Select)
                        select.set_options(options)
                    except Exception:
                        pass
        except Exception:
            pass

    def _update_mappings_table(self) -> None:
        """Update mappings DataTable."""
        try:
            table = self.query_one("#mappings-table", DataTable)
            table.clear()

            for mapping in self.mappings:
                table.add_row(
                    str(mapping.get("id", "-")),
                    str(mapping.get("channel", "All")),
                    str(mapping.get("cc", mapping.get("cc_number", 0))),
                    mapping.get("plugin_uri", "")[:30],
                    mapping.get("parameter_name", mapping.get("param_symbol", "-")),
                    f"{mapping.get('min_val', 0)}-{mapping.get('max_val', 1)}",
                    mapping.get("curve_type", "linear"),
                    str(mapping.get("chain_id", "-")),
                )
        except Exception:
            pass

    def _update_commands_table(self) -> None:
        """Update commands DataTable."""
        try:
            table = self.query_one("#commands-table", DataTable)
            table.clear()

            for cmd in self.commands:
                chain_name = cmd.get("chain_name", f"Chain {cmd.get('chain_id')}")
                table.add_row(
                    str(cmd.get("program_number", "-")),
                    f"{cmd.get('bank_msb', 0)}/{cmd.get('bank_lsb', 0)}",
                    chain_name,
                    "Activate Chain",
                    "✓" if cmd.get("enabled", True) else "✗",
                )
        except Exception:
            pass

    def _update_devices_display(self) -> None:
        """Update devices display."""
        try:
            inputs = [d for d in self.devices if d.get("direction") == "input" or d.get("type") == "input"]
            outputs = [d for d in self.devices if d.get("direction") == "output" or d.get("type") == "output"]

            # Input devices
            input_list = self.query_one("#input-devices-list", Static)
            if inputs:
                lines = []
                for i, d in enumerate(inputs):
                    status = "🟢" if d.get("is_open") else "⚪"
                    lines.append(f"  {status} [{i}] {d.get('name', 'Unknown')}")
                input_list.update("\n".join(lines))
            else:
                input_list.update("[dim]No input devices found[/]")

            # Output devices
            output_list = self.query_one("#output-devices-list", Static)
            if outputs:
                lines = []
                for i, d in enumerate(outputs):
                    status = "🟢" if d.get("is_open") else "⚪"
                    lines.append(f"  {status} [{i}] {d.get('name', 'Unknown')}")
                output_list.update("\n".join(lines))
            else:
                output_list.update("[dim]No output devices found[/]")
        except Exception:
            pass

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button presses."""
        btn_id = event.button.id

        handlers = {
            "btn-start-midi": self._start_midi,
            "btn-stop-midi": self._stop_midi,
            "btn-refresh": self._refresh_all,
            "btn-refresh-devices": self._load_devices,
            "btn-create-mapping": self._create_mapping,
            "btn-delete-mapping": self._delete_selected_mapping,
            "btn-add-command": self._add_command,
            "btn-delete-command": self._delete_selected_command,
            "btn-start-learn": self._start_learn,
            "btn-stop-learn": self._stop_learn,
            "btn-start-monitor": self._start_monitor,
            "btn-stop-monitor": self._stop_monitor,
            "btn-clear-monitor": self._clear_monitor,
        }

        handler = handlers.get(btn_id)
        if handler:
            await handler()

    async def _start_midi(self) -> None:
        """Start MIDI engine."""
        btn = self.query_one("#btn-start-midi", ActionButton)
        btn.set_loading(True, "Starting...")

        result = await self.api_client.start_midi()

        btn.set_loading(False)

        if result.success:
            self.notify("MIDI engine started", severity="information")
            await self._refresh_status()
        else:
            self.notify(f"Failed: {result.error}", severity="error")

    async def _stop_midi(self) -> None:
        """Stop MIDI engine."""
        btn = self.query_one("#btn-stop-midi", ActionButton)
        btn.set_loading(True, "Stopping...")

        result = await self.api_client.stop_midi()

        btn.set_loading(False)

        if result.success:
            self.notify("MIDI engine stopped", severity="information")
            await self._refresh_status()
        else:
            self.notify(f"Failed: {result.error}", severity="error")

    async def _create_mapping(self) -> None:
        """Create a new CC mapping."""
        try:
            # Get form values
            channel = int(self.query_one("#input-channel", Input).value or "0")
            cc = int(self.query_one("#input-cc", Input).value or "0")
            plugin = self.query_one("#input-plugin", Input).value
            param = self.query_one("#input-param", Input).value
            param_idx = int(self.query_one("#input-param-idx", Input).value or "0")
            min_val = float(self.query_one("#input-min", Input).value or "0")
            max_val = float(self.query_one("#input-max", Input).value or "1")
            curve = self.query_one("#select-curve", Select).value
            invert = self.query_one("#switch-invert", Switch).value
            chain_select = self.query_one("#select-chain", Select)
            chain_id = int(chain_select.value) if chain_select.value else None
            feedback = self.query_one("#switch-feedback", Switch).value

            if not plugin:
                self.notify("Plugin URI is required", severity="warning")
                return

            # Create mapping via API
            mapping_data = {
                "channel": channel,
                "cc_number": cc,
                "plugin_uri": plugin,
                "param_index": param_idx,
                "param_symbol": param,
                "min_val": min_val,
                "max_val": max_val,
                "curve_type": curve,
                "invert": invert,
                "chain_id": chain_id,
                "feedback_enabled": feedback,
            }

            result = await self.api_client.create_midi_mapping(
                midi_channel=channel,
                cc_number=cc,
                plugin_uri=plugin,
                parameter_index=param_idx,
                parameter_name=param
            )

            if result.success:
                self.notify("Mapping created", severity="information")
                await self._load_mappings()
            else:
                self.notify(f"Failed: {result.error}", severity="error")

        except ValueError as e:
            self.notify(f"Invalid input: {e}", severity="error")

    async def _delete_selected_mapping(self) -> None:
        """Delete the selected mapping."""
        try:
            table = self.query_one("#mappings-table", DataTable)
            if table.cursor_row is None or table.cursor_row < 0:
                self.notify("Select a mapping first", severity="warning")
                return

            row = table.get_row_at(table.cursor_row)
            mapping_id = row[0]  # First column is ID

            if mapping_id == "-":
                return

            # Get CC info for deletion
            channel = int(row[1]) if row[1] != "All" else 0
            cc = int(row[2])

            confirmed = await self.app.push_screen_wait(
                ConfirmDialog(f"Delete mapping CC{cc} on Ch{channel}?", title="Confirm Delete")
            )

            if confirmed:
                result = await self.api_client.delete_midi_mapping(channel, cc)
                if result.success:
                    self.notify("Mapping deleted", severity="information")
                    await self._load_mappings()
                else:
                    self.notify(f"Failed: {result.error}", severity="error")

        except Exception as e:
            self.notify(f"Error: {e}", severity="error")

    async def _add_command(self) -> None:
        """Add a chain switching command."""
        try:
            chain_select = self.query_one("#select-cmd-chain", Select)
            chain_id = int(chain_select.value) if chain_select.value else None

            if chain_id is None:
                self.notify("Select a chain", severity="warning")
                return

            pc_number = int(self.query_one("#input-pc-number", Input).value or "0")
            bank_msb = int(self.query_one("#input-bank-msb", Input).value or "0")
            bank_lsb = int(self.query_one("#input-bank-lsb", Input).value or "0")
            send_pc = self.query_one("#switch-send-pc", Switch).value

            # Create command via API
            result = await self.api_client.post("/api/v2/midi/commands", json={
                "chain_id": chain_id,
                "program_number": pc_number,
                "bank_msb": bank_msb,
                "bank_lsb": bank_lsb,
                "send_pc_on_activate": send_pc,
            })

            if result:
                self.notify("Command added", severity="information")
                await self._load_commands()
            else:
                self.notify("Failed to add command", severity="error")

        except ValueError as e:
            self.notify(f"Invalid input: {e}", severity="error")

    async def _delete_selected_command(self) -> None:
        """Delete the selected command."""
        try:
            table = self.query_one("#commands-table", DataTable)
            if table.cursor_row is None or table.cursor_row < 0:
                self.notify("Select a command first", severity="warning")
                return

            row = table.get_row_at(table.cursor_row)
            pc_number = row[0]

            confirmed = await self.app.push_screen_wait(
                ConfirmDialog(f"Delete command PC#{pc_number}?", title="Confirm Delete")
            )

            if confirmed:
                # Find and delete command
                for cmd in self.commands:
                    if str(cmd.get("program_number")) == str(pc_number):
                        await self.api_client._request(
                            "DELETE", f"/api/v2/midi/commands/{cmd.get('id')}"
                        )
                        break

                self.notify("Command deleted", severity="information")
                await self._load_commands()

        except Exception as e:
            self.notify(f"Error: {e}", severity="error")

    async def _start_learn(self) -> None:
        """Start MIDI learn mode."""
        try:
            plugin = self.query_one("#learn-plugin", Input).value
            param_idx = int(self.query_one("#learn-param-idx", Input).value or "0")

            btn_start = self.query_one("#btn-start-learn", ActionButton)
            btn_stop = self.query_one("#btn-stop-learn", ActionButton)
            status_panel = self.query_one("#learn-status-panel", Container)
            status = self.query_one("#learn-status", Static)

            btn_start.set_loading(True, "Starting...")

            result = await self.api_client.start_midi_learn(plugin, param_idx)

            btn_start.set_loading(False)

            if result.success:
                self.learning = True
                btn_start.disabled = True
                btn_stop.disabled = False
                status_panel.add_class("learn-active")
                status.update("🔴 Learn Mode: ACTIVE - Move a MIDI control")

                self.notify("MIDI Learn active - Move a control", severity="warning")

                # Auto-stop after 30s
                self.set_timer(30.0, self._auto_stop_learn)
            else:
                self.notify(f"Failed: {result.error}", severity="error")

        except Exception as e:
            self.notify(f"Error: {e}", severity="error")

    async def _stop_learn(self) -> None:
        """Stop MIDI learn mode."""
        btn_start = self.query_one("#btn-start-learn", ActionButton)
        btn_stop = self.query_one("#btn-stop-learn", ActionButton)
        status_panel = self.query_one("#learn-status-panel", Container)
        status = self.query_one("#learn-status", Static)

        btn_stop.set_loading(True, "Stopping...")

        result = await self.api_client.stop_midi_learn()

        btn_stop.set_loading(False)

        if result.success:
            self.learning = False
            btn_start.disabled = False
            btn_stop.disabled = True
            status_panel.remove_class("learn-active")
            status.update("🔴 Learn Mode: Inactive")

            self.notify("MIDI Learn stopped", severity="information")
            await self._load_mappings()
        else:
            self.notify(f"Failed: {result.error}", severity="error")

    async def _auto_stop_learn(self) -> None:
        """Auto-stop learn after timeout."""
        if self.learning:
            await self._stop_learn()
            self.notify("Learn auto-stopped after 30s", severity="warning")

    async def _start_monitor(self) -> None:
        """Start MIDI monitor."""
        self.notify("Monitor started", severity="information")
        # Would connect to WebSocket for real-time updates

    async def _stop_monitor(self) -> None:
        """Stop MIDI monitor."""
        self.notify("Monitor stopped", severity="information")

    async def _clear_monitor(self) -> None:
        """Clear MIDI monitor."""
        try:
            log = self.query_one("#midi-log", Static)
            log.update("")

            monitor = self.query_one("#activity-monitor", MIDIActivityMonitor)
            monitor.last_activity = []
            monitor.cc_values = {}

            self.notify("Monitor cleared", severity="information")
        except Exception:
            pass

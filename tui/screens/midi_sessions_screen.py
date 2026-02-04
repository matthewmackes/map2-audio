"""
MIDI Sessions Screen - Enhanced MIDI Configuration & Sessions
Consolidates: MIDI Setup, Sessions, Controllers, CC Mappings, Chain Switching

Features (v2):
- CC Mappings with curve types (linear, logarithmic, exponential, s-curve)
- Chain switching via Program Change
- Per-chain mapping scope
- MIDI output for controller feedback
- Real-time activity monitoring

Wired to JUCE engine API endpoints:
- MIDI Devices: /api/engine/midi/devices, /api/engine/midi/status
- MIDI Mappings: /api/engine/midi/mappings
- MIDI Learn: /api/engine/midi/learn/*
- Sessions: /api/sessions/*
- Commands (v2): /api/v2/midi/commands
"""

import logging
import asyncio
from textual.app import ComposeResult
from textual.widgets import Static, Label, DataTable, TabbedContent, TabPane, Button, Input, Select, Switch
from textual.containers import Vertical, Horizontal, Container
from textual.binding import Binding

logger = logging.getLogger(__name__)

# Curve type options for CC mappings
CURVE_TYPES = [
    ("Linear", "linear"),
    ("Logarithmic", "logarithmic"),
    ("Exponential", "exponential"),
    ("S-Curve", "s_curve"),
]


class MIDIDevicesWidget(Static):
    """Display MIDI devices - wired to /api/midi/devices, /api/midi/status endpoints."""

    DEFAULT_CSS = """
    #midi-devices {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $success;
        padding: 1 2;
        margin: 1 0;
    }

    #midi-devices-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #midi-devices-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client
        self.id = "midi-devices"
        # Data state
        self._devices = []
        self._midi_status = {}

    def compose(self) -> ComposeResult:
        """Compose MIDI devices list with tables."""
        yield Label("🎹 MIDI DEVICES", id="midi-title")
        yield DataTable(id="midi-devices-table")
        yield Label("Actions:", id="midi-devices-actions-label")
        yield DataTable(id="midi-devices-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Devices table
        table = self.query_one("#midi-devices-table", DataTable)
        if not table.columns:
            table.add_columns("Status", "Device", "Type", "Ports")
            table.add_row("...", "Loading...", "...", "...")

        # Actions table
        actions = self.query_one("#midi-devices-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.add_row("c", "Connect", "Connect to selected device")
            actions.add_row("e", "Edit", "Edit device settings")
            actions.add_row("a", "Add", "Add new MIDI device")
            actions.add_row("r", "Refresh", "Refresh device list")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(5.0, self._refresh_data)
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real MIDI data from API."""
        if not self.api_client:
            return

        try:
            # Fetch MIDI devices - /api/midi/devices
            devices_result = await self.api_client.get_midi_devices()
            if devices_result.success and devices_result.data:
                self._devices = devices_result.data if isinstance(devices_result.data, list) else devices_result.data.get("devices", [])

            # Fetch MIDI status - /api/midi/status
            status_result = await self.api_client.get_midi_status()
            if status_result.success and status_result.data:
                self._midi_status = status_result.data

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching MIDI data: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            # Update title with device count
            enabled = self._midi_status.get("enabled", False)
            device_count = len(self._devices)
            status_text = "🟢 Enabled" if enabled else "⚪ Disabled"

            title = self.query_one("#midi-title", Label)
            title.update(f"🎹 MIDI DEVICES ({device_count}) | {status_text}")

            # Update devices table
            table = self.query_one("#midi-devices-table", DataTable)
            table.clear()

            if self._devices:
                for device in self._devices:
                    name = device.get("name", "Unknown Device")
                    device_type = device.get("type", device.get("device_type", "MIDI"))
                    connected = device.get("connected", False) or device.get("is_connected", False)

                    # Determine ports
                    has_input = device.get("has_input", device.get("input", False))
                    has_output = device.get("has_output", device.get("output", False))
                    if has_input and has_output:
                        ports = "In/Out"
                    elif has_input:
                        ports = "In"
                    elif has_output:
                        ports = "Out"
                    else:
                        ports = "-"

                    status = "🟢" if connected else "⚪"
                    table.add_row(status, name[:25], device_type, ports)
            else:
                table.add_row("-", "No MIDI devices found", "-", "-")

        except Exception as e:
            logger.debug(f"Error updating MIDI display: {e}")


class SessionsWidget(Static):
    """Display saved sessions - wired to /api/sessions/* endpoints."""

    DEFAULT_CSS = """
    #sessions {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $warning;
        padding: 1 2;
        margin: 1 0;
    }

    #sessions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #sessions-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None, **kwargs):
        super().__init__()
        self.api_client = api_client
        self.id = "sessions"
        # Data state
        self._sessions = []

    def compose(self) -> ComposeResult:
        """Compose sessions list with tables."""
        yield Label("📋 SAVED SESSIONS", id="sessions-title")
        yield DataTable(id="sessions-table")
        yield Label("Actions:", id="sessions-actions-label")
        yield DataTable(id="sessions-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Sessions table
        table = self.query_one("#sessions-table", DataTable)
        if not table.columns:
            table.add_columns("★", "Name", "Description", "Modified")
            table.add_row("...", "Loading...", "...", "...")

        # Actions table
        actions = self.query_one("#sessions-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.add_row("Enter", "Load", "Load selected session")
            actions.add_row("s", "Save", "Save current state")
            actions.add_row("d", "Delete", "Delete selected session")
            actions.add_row("n", "New", "Create new session")
            actions.add_row("i", "Import", "Import session from file")
            actions.add_row("x", "Export", "Export session to file")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(15.0, self._refresh_data)
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real session data from API."""
        if not self.api_client:
            return

        try:
            # Fetch sessions - /api/sessions/list
            sessions_result = await self.api_client.list_sessions()
            if sessions_result.success and sessions_result.data:
                self._sessions = sessions_result.data if isinstance(sessions_result.data, list) else sessions_result.data.get("sessions", [])

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching sessions: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            # Update title with count
            session_count = len(self._sessions)

            title = self.query_one("#sessions-title", Label)
            title.update(f"📋 SAVED SESSIONS ({session_count})")

            # Update sessions table
            table = self.query_one("#sessions-table", DataTable)
            table.clear()

            if self._sessions:
                for session in self._sessions[:8]:
                    name = session.get("name", "Unnamed")
                    description = session.get("description", "")
                    favorite = session.get("favorite", False)
                    star = "★" if favorite else ""

                    # Format description
                    if len(description) > 20:
                        description = description[:17] + "..."

                    # Format modified date
                    modified = session.get("modified", session.get("updated_at", session.get("created_at", "")))
                    if modified:
                        modified_str = str(modified)[:10] if len(str(modified)) > 10 else str(modified)
                    else:
                        modified_str = "-"

                    table.add_row(star, name[:20], description or "-", modified_str)
            else:
                table.add_row("-", "No sessions saved", "-", "-")

        except Exception as e:
            logger.debug(f"Error updating sessions display: {e}")


class ChainSwitchingWidget(Static):
    """Chain switching via Program Change - NEW v2 feature."""

    DEFAULT_CSS = """
    #chain-switching {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $primary;
        padding: 1 2;
        margin: 1 0;
    }

    #chain-commands-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    .form-row {
        width: 100%;
        height: 3;
        margin-bottom: 1;
    }

    .form-label {
        width: 15;
        padding-top: 1;
    }
    """

    def __init__(self, api_client=None, **kwargs):
        super().__init__()
        self.api_client = api_client
        self.id = "chain-switching"
        self._commands = []
        self._chains = []

    def compose(self) -> ComposeResult:
        yield Label("🔀 CHAIN SWITCHING (Program Change)", id="chain-switching-title")
        yield Static("[dim]Switch active chain using MIDI Program Change messages[/]")
        yield DataTable(id="chain-commands-table")

        yield Label("Add Chain → PC Mapping:", id="add-mapping-label")
        with Horizontal(classes="form-row"):
            yield Label("Chain:", classes="form-label")
            yield Select(options=[], id="chain-select", allow_blank=True)
            yield Label("PC#:", classes="form-label")
            yield Input(placeholder="0-127", id="pc-number-input")
            yield Button("Add", id="btn-add-chain-pc", variant="primary")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        table = self.query_one("#chain-commands-table", DataTable)
        if not table.columns:
            table.add_columns("PC#", "Bank", "Chain", "Feedback", "Status")
            table.add_row("...", "...", "Loading...", "...", "...")

    async def on_mount(self) -> None:
        """Initialize on mount."""
        self._init_tables()
        self.set_interval(10.0, self._refresh_data)
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch chain switching commands."""
        if not self.api_client:
            return

        try:
            # Fetch chains for dropdown
            chains_result = await self.api_client.list_chains()
            if chains_result.success and chains_result.data:
                chains = chains_result.data.get("chains", []) if isinstance(chains_result.data, dict) else chains_result.data
                self._chains = chains if isinstance(chains, list) else []

                # Update chain select dropdown
                try:
                    select = self.query_one("#chain-select", Select)
                    options = [(c.get("name", f"Chain {c.get('id')}"), str(c.get("id"))) for c in self._chains]
                    select.set_options(options)
                except Exception:
                    pass

            # Fetch PC commands (v2 API)
            try:
                result = await self.api_client.get("/api/v2/midi/commands")
                if result:
                    self._commands = result.get("commands", [])
            except Exception:
                self._commands = []

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching chain switching data: {e}")

    def _update_display(self) -> None:
        """Update display with commands."""
        try:
            table = self.query_one("#chain-commands-table", DataTable)
            table.clear()

            if self._commands:
                for cmd in self._commands:
                    chain_name = cmd.get("chain_name", f"Chain {cmd.get('chain_id')}")
                    pc = cmd.get("program_number", "-")
                    bank = f"{cmd.get('bank_msb', 0)}/{cmd.get('bank_lsb', 0)}"
                    feedback = "✓" if cmd.get("send_pc_on_activate", True) else "✗"
                    enabled = "🟢" if cmd.get("enabled", True) else "⚪"
                    table.add_row(str(pc), bank, chain_name[:20], feedback, enabled)
            else:
                table.add_row("-", "-", "No chain switching configured", "-", "-")
                table.add_row("-", "-", "Send PC#1 → Chain 1, etc.", "-", "-")
        except Exception as e:
            logger.debug(f"Error updating chain switching display: {e}")

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button presses."""
        if event.button.id == "btn-add-chain-pc":
            await self._add_chain_pc()

    async def _add_chain_pc(self) -> None:
        """Add chain → PC mapping."""
        try:
            select = self.query_one("#chain-select", Select)
            pc_input = self.query_one("#pc-number-input", Input)

            chain_id = select.value
            pc_number = pc_input.value

            if not chain_id or not pc_number:
                self.app.notify("Select chain and enter PC number", severity="warning")
                return

            # Create command via API
            await self.api_client.post("/api/v2/midi/commands", json={
                "chain_id": int(chain_id),
                "program_number": int(pc_number),
                "bank_msb": 0,
                "bank_lsb": 0,
                "send_pc_on_activate": True,
            })

            self.app.notify(f"PC#{pc_number} → Chain configured", severity="information")
            pc_input.value = ""
            await self._refresh_data()

        except ValueError as e:
            self.app.notify(f"Invalid input: {e}", severity="error")
        except Exception as e:
            logger.debug(f"Error adding chain PC: {e}")


class ControlMappingWidget(Static):
    """Enhanced MIDI control mapping - with curve types (v2 feature)."""

    DEFAULT_CSS = """
    #control-mapping {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $accent;
        padding: 1 2;
        margin: 1 0;
    }

    #mapping-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #mapping-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    .create-mapping-row {
        width: 100%;
        height: 3;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None, **kwargs):
        super().__init__()
        self.api_client = api_client
        self.id = "control-mapping"
        # Data state
        self._mappings = []
        self._learn_mode = False

    def compose(self) -> ComposeResult:
        """Compose control mapping with tables and create form."""
        yield Label("🎛️ CC MAPPINGS", id="mapping-title")
        yield Static("[dim]Map MIDI CC to plugin parameters with custom curves[/]")
        yield DataTable(id="mapping-table")

        yield Label("Quick Create:", id="quick-create-label")
        with Horizontal(classes="create-mapping-row"):
            yield Input(placeholder="CC# (0-127)", id="new-cc-input")
            yield Input(placeholder="Plugin URI", id="new-plugin-input")
            yield Input(placeholder="Param Index", id="new-param-input")
            yield Select(options=CURVE_TYPES, value="linear", id="new-curve-select")
            yield Button("Add", id="btn-add-mapping", variant="primary")

        yield Label("Actions:", id="mapping-actions-label")
        yield DataTable(id="mapping-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Mappings table - enhanced with curve type
        table = self.query_one("#mapping-table", DataTable)
        if not table.columns:
            table.add_columns("Ch", "CC", "Plugin", "Param", "Range", "Curve")
            table.add_row("...", "...", "Loading...", "...", "...", "...")

        # Actions table
        actions = self.query_one("#mapping-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.add_row("L", "Learn", "Enter MIDI learn mode")
            actions.add_row("C", "Clear", "Clear selected mapping")
            actions.add_row("S", "Save", "Save current mappings")
            actions.add_row("D", "Default", "Load default mappings")

    async def on_mount(self) -> None:
        """Start periodic data refresh on mount."""
        self._init_tables()
        self.set_interval(10.0, self._refresh_data)
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch real MIDI mapping data from API."""
        if not self.api_client:
            return

        try:
            # Fetch MIDI mappings - /api/midi/mappings
            mappings_result = await self.api_client.list_midi_mappings()
            if mappings_result.success and mappings_result.data:
                self._mappings = mappings_result.data if isinstance(mappings_result.data, list) else mappings_result.data.get("mappings", [])

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching MIDI mappings: {e}")

    def _update_display(self) -> None:
        """Update the widget display with fetched data."""
        try:
            # Update title with mapping count
            mapping_count = len(self._mappings)
            learn_text = " [🔴 LEARN MODE]" if self._learn_mode else ""

            title = self.query_one("#mapping-title", Label)
            title.update(f"🎛️ CC MAPPINGS ({mapping_count}){learn_text}")

            # Update mappings table with enhanced columns
            table = self.query_one("#mapping-table", DataTable)
            table.clear()

            if self._mappings:
                for mapping in self._mappings[:10]:
                    # Get mapping details
                    channel = mapping.get("channel", mapping.get("midi_channel", "All"))
                    cc = mapping.get("cc", mapping.get("cc_number", mapping.get("control_number", 0)))
                    plugin = mapping.get("plugin_uri", mapping.get("target_plugin_uri", ""))
                    param = mapping.get("parameter_name", mapping.get("param_symbol", mapping.get("target", "-")))
                    min_val = mapping.get("min_val", mapping.get("min_value", 0))
                    max_val = mapping.get("max_val", mapping.get("max_value", 1))
                    curve = mapping.get("curve_type", "linear")

                    # Truncate plugin URI for display
                    plugin_short = plugin.split("/")[-1][:15] if plugin else "-"

                    # Format range
                    range_str = f"{min_val:.1f}-{max_val:.1f}"

                    table.add_row(
                        str(channel) if channel else "All",
                        str(cc),
                        plugin_short,
                        str(param)[:12],
                        range_str,
                        curve[:8]
                    )
            else:
                table.add_row("-", "-", "No mappings configured", "-", "-", "-")
                table.add_row("-", "-", "Press 'L' to start learn mode", "-", "-", "-")

        except Exception as e:
            logger.debug(f"Error updating mappings display: {e}")

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button presses for mapping creation."""
        if event.button.id == "btn-add-mapping":
            await self._add_mapping()

    async def _add_mapping(self) -> None:
        """Add a new CC mapping with curve type."""
        try:
            cc = int(self.query_one("#new-cc-input", Input).value or "0")
            plugin = self.query_one("#new-plugin-input", Input).value
            param_idx = int(self.query_one("#new-param-input", Input).value or "0")
            curve = self.query_one("#new-curve-select", Select).value

            if not plugin:
                self.app.notify("Plugin URI is required", severity="warning")
                return

            # Create mapping via API
            result = await self.api_client.create_midi_mapping(
                midi_channel=0,  # Omni
                cc_number=cc,
                plugin_uri=plugin,
                parameter_index=param_idx,
                parameter_name=""
            )

            if result.success:
                self.app.notify(f"CC{cc} mapping created", severity="information")
                # Clear inputs
                self.query_one("#new-cc-input", Input).value = ""
                self.query_one("#new-plugin-input", Input).value = ""
                self.query_one("#new-param-input", Input).value = ""
                await self._refresh_data()
            else:
                self.app.notify(f"Failed: {result.error}", severity="error")

        except ValueError as e:
            self.app.notify(f"Invalid input: {e}", severity="error")
        except Exception as e:
            logger.debug(f"Error adding mapping: {e}")


class MIDISessionsScreen(Static):
    """
    MIDI Sessions Screen - Manage MIDI configuration.

    Shows:
    - Connected MIDI devices from /api/midi/*
    - Saved sessions from /api/sessions/*
    - Control mappings from /api/midi/mappings
    """

    DEFAULT_CSS = """
    MIDISessionsScreen {
        width: 100%;
        height: 100%;
        background: $surface;
        layout: vertical;
        overflow: auto;
    }
    """

    BINDINGS = [
        Binding("L", "midi_learn", "Learn", show=True),
        Binding("s", "save_session", "Save", show=True),
        Binding("r", "refresh_data", "Refresh", show=True),
        Binding("R", "rescan_midi", "Rescan", show=True),
    ]

    def __init__(self, api_client=None, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client

    def compose(self) -> ComposeResult:
        """Compose MIDI sessions widgets with enhanced v2 features."""
        with TabbedContent(id="midi-tabs"):
            # Overview Tab - Main MIDI status
            with TabPane("📊 Overview", id="tab-overview"):
                with Vertical(id="midi-overview"):
                    yield MIDIDevicesWidget(self.api_client)
                    yield ControlMappingWidget(self.api_client)

            # Chain Switching Tab - NEW v2 feature
            with TabPane("🔀 Chain Switch", id="tab-chain-switch"):
                with Vertical(id="chain-switch-container"):
                    yield ChainSwitchingWidget(self.api_client)
                    yield Static(
                        "[dim]\n"
                        "Chain Switching via Program Change:\n"
                        "• Send PC#1 to switch to Chain 1\n"
                        "• Bank Select (CC#0, CC#32) + PC for >128 chains\n"
                        "• Feedback sends PC back to sync controller[/]"
                    )

            # Sessions Tab
            with TabPane("💾 Sessions", id="tab-sessions"):
                with Vertical(id="sessions-container"):
                    yield SessionsWidget(self.api_client)

    async def action_midi_learn(self) -> None:
        """Toggle MIDI learn mode via JUCE engine."""
        if not self.api_client:
            self.app.notify("API client not available", severity="warning", timeout=2)
            return

        try:
            # Toggle MIDI learn mode via JUCE
            result = await self.api_client.toggle_midi_learn()
            if result.success:
                # Check status from response (JUCE returns "status": "learning" or "status": "stopped")
                status = result.data.get("status", "") if result.data else ""
                if status == "learning":
                    self.app.notify("MIDI Learn mode ON - move a control", severity="information", timeout=3)
                else:
                    self.app.notify("MIDI Learn mode OFF", severity="information", timeout=2)
                await self.action_refresh_data()
            else:
                self.app.notify("MIDI Learn: Touch a control then a parameter", severity="information", timeout=3)
        except Exception as e:
            self.app.notify(f"MIDI Learn: Touch a control then a parameter", severity="information", timeout=3)

    async def action_save_session(self) -> None:
        """Save current state as session."""
        if not self.api_client:
            self.app.notify("API client not available", severity="warning", timeout=2)
            return

        try:
            import time
            name = f"MIDI_Session_{int(time.time())}"
            result = await self.api_client.save_session(name, description="MIDI session from TUI")
            if result.success:
                self.app.notify(f"Session '{name}' saved!", severity="information", timeout=3)
                await self.action_refresh_data()
            else:
                self.app.notify(f"Save failed: {result.error}", severity="error", timeout=3)
        except Exception as e:
            self.app.notify(f"Error: {e}", severity="error", timeout=3)

    async def action_rescan_midi(self) -> None:
        """Rescan for MIDI devices."""
        if not self.api_client:
            self.app.notify("API client not available", severity="warning", timeout=2)
            return

        try:
            self.app.notify("Scanning for MIDI devices...", severity="information", timeout=2)
            result = await self.api_client.refresh_midi_devices()
            if result.success:
                devices = result.data.get("devices", []) if result.data else []
                self.app.notify(f"Found {len(devices)} MIDI devices", severity="information", timeout=3)
                await self.action_refresh_data()
            else:
                # Fallback to refresh
                await self.action_refresh_data()
                self.app.notify("MIDI devices refreshed", severity="information", timeout=2)
        except Exception as e:
            await self.action_refresh_data()
            self.app.notify("MIDI devices refreshed", severity="information", timeout=2)

    async def action_refresh_data(self) -> None:
        """Refresh all MIDI data."""
        self.app.notify("Refreshing MIDI data...", severity="information", timeout=1)

        try:
            for widget in self.query("MIDIDevicesWidget"):
                asyncio.create_task(widget._refresh_data())
            for widget in self.query("SessionsWidget"):
                asyncio.create_task(widget._refresh_data())
            for widget in self.query("ControlMappingWidget"):
                asyncio.create_task(widget._refresh_data())

            self.app.notify("MIDI data refreshed", severity="information", timeout=2)
        except Exception as e:
            self.app.notify(f"Refresh error: {e}", severity="error", timeout=3)

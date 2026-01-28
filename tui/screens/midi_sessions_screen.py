"""
MIDI Sessions Screen - MIDI Configuration & Sessions
Consolidates: MIDI Setup, Sessions, Controllers

Wired to JUCE engine API endpoints:
- MIDI Devices: /api/engine/midi/devices, /api/engine/midi/status
- MIDI Mappings: /api/engine/midi/mappings
- MIDI Learn: /api/engine/midi/learn/*
- Sessions: /api/sessions/*
"""

import logging
import asyncio
from textual.app import ComposeResult
from textual.widgets import Static, Label, DataTable
from textual.containers import Vertical
from textual.binding import Binding

logger = logging.getLogger(__name__)


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

    def __init__(self, api_client=None):
        super().__init__()
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

    def __init__(self, api_client=None):
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


class ControlMappingWidget(Static):
    """MIDI control mapping - wired to /api/midi/mappings endpoint."""

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
    """

    def __init__(self, api_client=None):
        super().__init__()
        self.api_client = api_client
        self.id = "control-mapping"
        # Data state
        self._mappings = []
        self._learn_mode = False

    def compose(self) -> ComposeResult:
        """Compose control mapping with tables."""
        yield Label("🎛️ CONTROL MAPPING", id="mapping-title")
        yield DataTable(id="mapping-table")
        yield Label("Actions:", id="mapping-actions-label")
        yield DataTable(id="mapping-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with headers."""
        # Mappings table
        table = self.query_one("#mapping-table", DataTable)
        if not table.columns:
            table.add_columns("Control", "MIDI", "Target", "Range")
            table.add_row("...", "Loading...", "...", "...")

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
            learn_text = " [LEARN MODE]" if self._learn_mode else ""

            title = self.query_one("#mapping-title", Label)
            title.update(f"🎛️ CONTROL MAPPING ({mapping_count} mappings){learn_text}")

            # Update mappings table
            table = self.query_one("#mapping-table", DataTable)
            table.clear()

            if self._mappings:
                for mapping in self._mappings[:10]:
                    # Get mapping details
                    control_name = mapping.get("control_name", mapping.get("name", "Control"))
                    midi_type = mapping.get("midi_type", "CC")
                    midi_channel = mapping.get("channel", 1)
                    midi_cc = mapping.get("cc", mapping.get("control_number", mapping.get("note", 0)))
                    target = mapping.get("target", mapping.get("parameter", "Unknown"))
                    min_val = mapping.get("min_value", mapping.get("range_min", 0))
                    max_val = mapping.get("max_value", mapping.get("range_max", 127))

                    # Format MIDI info
                    if midi_type.lower() == "note":
                        midi_info = f"Note {midi_cc}"
                    else:
                        midi_info = f"CC {midi_cc}"

                    if midi_channel != 1:
                        midi_info += f" Ch{midi_channel}"

                    # Format range
                    range_str = f"{min_val}-{max_val}"

                    table.add_row(control_name[:15], midi_info, target[:20], range_str)
            else:
                table.add_row("-", "No mappings", "-", "-")
                table.add_row("-", "Press 'L' to learn", "-", "-")

        except Exception as e:
            logger.debug(f"Error updating mappings display: {e}")


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
        """Compose MIDI sessions widgets."""
        with Vertical(id="midi-container"):
            yield MIDIDevicesWidget(self.api_client)
            yield SessionsWidget(self.api_client)
            yield ControlMappingWidget(self.api_client)

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

"""
Interactive MIDI Control Screen
MIDI engine management, device monitoring, learn mode, and mapping CRUD
"""

from typing import Optional, List, Dict, Any
from textual.app import ComposeResult
from textual.widgets import Static, Button, Label, ListView, ListItem
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.reactive import reactive

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from ..api_client import MAP2APIClient
from ..modals import ConfirmDialog, FormDialog
from ..widgets import ActionButton, StatusIndicator, LoadingIndicator


class MIDIScreen(ScrollableContainer):
    """
    Interactive MIDI control screen.

    Features:
    - Start/stop MIDI engine
    - View MIDI devices with status
    - MIDI Learn mode toggle
    - Create manual MIDI mappings
    - Delete existing mappings
    - Real-time mapping display
    """

    CSS = """
    MIDIScreen {
        background: $background;
        width: 100%;
        height: 100%;
        padding: 1;
    }
.section-title {
        text-style: bold;
        color: $accent;
        margin-top: 1;
        margin-bottom: 1;
    }

    .engine-section {
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    .devices-section {
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
        max-height: 15;
    }

    .learn-section {
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    .learn-active {
        background: $error;
        border: solid $error;
        animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
    }

    .mappings-section {
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    .control-buttons {
        width: 100%;
        height: auto;
    }

    .control-buttons Button {
        margin: 0 1 1 0;
        min-width: 20;
    }

    .device-item {
        padding: 0 1;
        margin-bottom: 0;
    }

    .device-open {
        color: $success;
    }

    .device-closed {
        color: $text-muted;
    }

    .mapping-card {
        background: $panel-lighten-1;
        border: solid $primary-lighten-1;
        padding: 1;
        margin-bottom: 1;
    }

    .mapping-card:hover {
        background: $panel-lighten-2;
    }

    .mapping-header {
        width: 100%;
        height: auto;
    }

    .mapping-info {
        width: 1fr;
    }

    .mapping-cc {
        text-style: bold;
        color: $success;
    }

    .mapping-param {
        color: $text;
    }

    .mapping-plugin {
        color: $text-muted;
        font-size: 90%;
    }
    """

    midi_running: reactive[bool] = reactive(False)
    learning: reactive[bool] = reactive(False)
    devices: reactive[List[Dict[str, Any]]] = reactive([])
    mappings: reactive[List[Dict[str, Any]]] = reactive([])

    def __init__(self, api_client: MAP2APIClient, id: Optional[str] = None):
        """
        Initialize MIDI screen.

        Args:
            api_client: API client instance
            id: Optional screen ID
        """
        super().__init__(id=id)
        self.api_client = api_client

    def compose(self) -> ComposeResult:
        """Compose MIDI screen widgets."""
        yield Label("🎹 MIDI Control Center", classes="section-title")

            # MIDI Engine Controls
        with Container(classes="engine-section", id="engine-section"):
            yield Label("MIDI Engine", classes="section-title")
            yield StatusIndicator("MIDI Engine", id="status-midi")
            with Horizontal(classes="control-buttons"):
                yield ActionButton(
                    "▶ Start MIDI",
                    variant="success",
                    id="btn-start-midi"
                )
                yield ActionButton(
                    "⏹ Stop MIDI",
                    variant="error",
                    id="btn-stop-midi"
                )

            # Loading Indicator
        yield LoadingIndicator("Loading MIDI data...", id="loading-midi")

            # MIDI Devices
        with Container(classes="devices-section"):
            yield Label("MIDI Devices", classes="section-title")
            yield Static("", id="devices-list")

            # MIDI Learn Mode
        with Container(classes="learn-section", id="learn-section"):
            yield Label("MIDI Learn Mode", classes="section-title")
            yield Static(
                "Quick way to map MIDI controls to plugin parameters.\n"
                "1. Start learn mode\n"
                "2. Move a MIDI control (knob/slider/button)\n"
                "3. Mapping is created automatically",
                id="learn-info"
            )
            with Horizontal(classes="control-buttons"):
                yield ActionButton(
                    "🎯 Start MIDI Learn",
                    variant="success",
                    id="btn-start-learn"
                )
                yield ActionButton(
                    "⏹ Stop MIDI Learn",
                    variant="error",
                    id="btn-stop-learn",
                    disabled=True
                )

            # Manual Mapping Creation
        with Container(classes="engine-section"):
            yield Label("Manual Mapping", classes="section-title")
            yield Static(
                "Create custom MIDI CC mappings to plugin parameters.",
                id="manual-info"
            )
            with Horizontal(classes="control-buttons"):
                yield ActionButton(
                    "➕ Create Mapping",
                    variant="primary",
                    id="btn-create-mapping"
                )
                yield ActionButton(
                    "🔄 Refresh",
                    variant="default",
                    id="btn-refresh"
                )

            # MIDI Mappings List
        with Container(classes="mappings-section"):
            yield Label("Active MIDI Mappings", classes="section-title")
            yield Static("", id="mappings-count")
            with Vertical(id="mappings-list"):
                yield Label("No MIDI mappings configured yet.", id="empty-mappings")

    async def on_mount(self) -> None:
        """Called when screen is mounted."""
        await self.refresh_data()
        self.set_interval(5.0, self.refresh_data)

    async def refresh_data(self) -> None:
        """Refresh MIDI data."""
        loading = self.query_one("#loading-midi", LoadingIndicator)
        loading.show("Refreshing MIDI data...")

        try:
            # Fetch MIDI devices
            devices_result = await self.api_client.list_midi_devices()
            if devices_result.success:
                self.devices = devices_result.data
                self._update_devices_display()

            # Fetch MIDI mappings
            mappings_result = await self.api_client.list_midi_mappings()
            if mappings_result.success:
                data = mappings_result.data
                if isinstance(data, dict):
                    self.mappings = data.get("mappings", [])
                else:
                    self.mappings = []
                self._update_mappings_display()

            # Check MIDI engine status (inferred from devices)
            # Backend may not have dedicated status endpoint
            self.midi_running = any(d.get("is_open", False) for d in self.devices)
            midi_status = self.query_one("#status-midi", StatusIndicator)
            midi_status.set_status(self.midi_running)

        except Exception as e:
            self.app.notify(f"Error refreshing data: {str(e)}", severity="error")
        finally:
            loading.hide()

    def _update_devices_display(self) -> None:
        """Update MIDI devices list."""
        devices_list = self.query_one("#devices-list", Static)

        if not self.devices:
            devices_list.update("[dim]No MIDI devices detected[/dim]")
            return

        lines = []
        for device in self.devices:
            name = device.get("name", "Unknown")
            dev_type = device.get("type", "unknown").upper()
            is_open = device.get("is_open", False)

            status_icon = "🟢" if is_open else "⚪"
            status_text = "OPEN" if is_open else "CLOSED"

            lines.append(f"{status_icon} {name} [{dev_type}] - {status_text}")

        devices_list.update("\n".join(lines))

    def _update_mappings_display(self) -> None:
        """Update MIDI mappings display."""
        mappings_list = self.query_one("#mappings-list", Vertical)
        mappings_count = self.query_one("#mappings-count", Static)
        empty_message = self.query_one("#empty-mappings", Label)

        # Update count
        mappings_count.update(f"{len(self.mappings)} mappings configured")

        # Clear existing mappings (except empty message)
        for widget in list(mappings_list.children):
            if widget.id != "empty-mappings":
                widget.remove()

        if not self.mappings:
            empty_message.display = True
            return

        empty_message.display = False

        # Display mappings
        for mapping in self.mappings:
            card = self._create_mapping_card(mapping)
            mappings_list.mount(card)

    def _create_mapping_card(self, mapping: Dict[str, Any]) -> Container:
        """Create a mapping card widget."""
        mapping_id = mapping.get("id", 0)
        channel = mapping.get("midi_channel", 0)
        cc = mapping.get("cc_number", 0)
        param_name = mapping.get("parameter_name", "Unknown")
        plugin_uri = mapping.get("plugin_uri", "")
        plugin_name = plugin_uri.split("/")[-1] if plugin_uri else "Unknown"

        card = Container(classes="mapping-card")

        header = Horizontal(classes="mapping-header")
        info = Vertical(classes="mapping-info")

        info.mount(Label(f"Ch{channel} CC{cc:03d} → {param_name}", classes="mapping-cc"))
        info.mount(Label(f"Plugin: {plugin_name}", classes="mapping-plugin"))

        header.mount(info)
        header.mount(
            ActionButton(
                "🗑 Delete",
                variant="error",
                id=f"btn-delete-mapping-{mapping_id}"
            )
        )

        card.mount(header)
        return card

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button clicks."""
        button_id = event.button.id

        if button_id == "btn-start-midi":
            await self._start_midi()
        elif button_id == "btn-stop-midi":
            await self._stop_midi()
        elif button_id == "btn-start-learn":
            await self._start_learn()
        elif button_id == "btn-stop-learn":
            await self._stop_learn()
        elif button_id == "btn-create-mapping":
            await self._create_mapping()
        elif button_id == "btn-refresh":
            await self.refresh_data()
        elif button_id and button_id.startswith("btn-delete-mapping-"):
            mapping_id = int(button_id.replace("btn-delete-mapping-", ""))
            await self._delete_mapping(mapping_id)

    async def _start_midi(self) -> None:
        """Start MIDI engine."""
        btn = self.query_one("#btn-start-midi", ActionButton)
        btn.set_loading(True, "Starting...")

        result = await self.api_client.start_midi()

        btn.set_loading(False)

        if result.success:
            self.app.notify("MIDI engine started", severity="information")
            await self.refresh_data()
        else:
            self.app.notify(f"Failed to start MIDI: {result.error}", severity="error")

    async def _stop_midi(self) -> None:
        """Stop MIDI engine."""
        btn = self.query_one("#btn-stop-midi", ActionButton)
        btn.set_loading(True, "Stopping...")

        result = await self.api_client.stop_midi()

        btn.set_loading(False)

        if result.success:
            self.app.notify("MIDI engine stopped", severity="information")
            await self.refresh_data()
        else:
            self.app.notify(f"Failed to stop MIDI: {result.error}", severity="error")

    async def _start_learn(self) -> None:
        """Start MIDI learn mode."""
        btn_start = self.query_one("#btn-start-learn", ActionButton)
        btn_stop = self.query_one("#btn-stop-learn", ActionButton)
        learn_section = self.query_one("#learn-section", Container)

        btn_start.set_loading(True, "Starting...")

        result = await self.api_client.start_midi_learn()

        btn_start.set_loading(False)

        if result.success:
            self.learning = True
            btn_start.disabled = True
            btn_stop.disabled = False
            learn_section.add_class("learn-active")

            self.app.notify("🔴 MIDI Learn active - Move a MIDI control", severity="warning")

            # Auto-stop after 30 seconds
            self.set_timer(30.0, self._auto_stop_learn)
        else:
            self.app.notify(f"Failed to start learn: {result.error}", severity="error")

    async def _stop_learn(self) -> None:
        """Stop MIDI learn mode."""
        btn_start = self.query_one("#btn-start-learn", ActionButton)
        btn_stop = self.query_one("#btn-stop-learn", ActionButton)
        learn_section = self.query_one("#learn-section", Container)

        btn_stop.set_loading(True, "Stopping...")

        result = await self.api_client.stop_midi_learn()

        btn_stop.set_loading(False)

        if result.success:
            self.learning = False
            btn_start.disabled = False
            btn_stop.disabled = True
            learn_section.remove_class("learn-active")

            self.app.notify("MIDI Learn stopped", severity="information")
            await self.refresh_data()
        else:
            self.app.notify(f"Failed to stop learn: {result.error}", severity="error")

    async def _auto_stop_learn(self) -> None:
        """Auto-stop learn mode after timeout."""
        if self.learning:
            await self._stop_learn()
            self.app.notify("MIDI Learn auto-stopped after 30s", severity="warning")

    async def _create_mapping(self) -> None:
        """Create a manual MIDI mapping."""
        fields = [
            {
                "name": "midi_channel",
                "label": "MIDI Channel (1-16):",
                "type": "text",
                "required": True,
                "default": "1"
            },
            {
                "name": "cc_number",
                "label": "CC Number (0-127):",
                "type": "text",
                "required": True,
                "default": "74"
            },
            {
                "name": "plugin_uri",
                "label": "Plugin URI:",
                "type": "text",
                "required": True,
                "placeholder": "http://example.org/plugin"
            },
            {
                "name": "parameter_index",
                "label": "Parameter Index:",
                "type": "text",
                "required": True,
                "default": "0"
            },
            {
                "name": "parameter_name",
                "label": "Parameter Name:",
                "type": "text",
                "required": True,
                "placeholder": "cutoff"
            }
        ]

        result = await self.app.push_screen_wait(
            FormDialog(fields, title="Create MIDI Mapping")
        )

        if result:
            loading = self.query_one("#loading-midi", LoadingIndicator)
            loading.show("Creating mapping...")

            try:
                # Convert string inputs to proper types
                mapping_data = {
                    "midi_channel": int(result["midi_channel"]),
                    "cc_number": int(result["cc_number"]),
                    "plugin_uri": result["plugin_uri"],
                    "parameter_index": int(result["parameter_index"]),
                    "parameter_name": result["parameter_name"]
                }

                create_result = await self.api_client.create_midi_mapping(mapping_data)

                loading.hide()

                if create_result.success:
                    self.app.notify("MIDI mapping created", severity="information")
                    await self.refresh_data()
                else:
                    self.app.notify(f"Failed to create mapping: {create_result.error}", severity="error")

            except ValueError as e:
                loading.hide()
                self.app.notify(f"Invalid input: {str(e)}", severity="error")

    async def _delete_mapping(self, mapping_id: int) -> None:
        """Delete a MIDI mapping."""
        # Find mapping for confirmation
        mapping = next((m for m in self.mappings if m.get("id") == mapping_id), None)
        if not mapping:
            return

        param_name = mapping.get("parameter_name", "this mapping")
        confirmed = await self.app.push_screen_wait(
            ConfirmDialog(
                f"Delete MIDI mapping for '{param_name}'?",
                title="Confirm Delete"
            )
        )

        if confirmed:
            loading = self.query_one("#loading-midi", LoadingIndicator)
            loading.show("Deleting mapping...")

            delete_result = await self.api_client.delete_midi_mapping(mapping_id)

            loading.hide()

            if delete_result.success:
                self.app.notify("MIDI mapping deleted", severity="information")
                await self.refresh_data()
            else:
                self.app.notify(f"Failed to delete mapping: {delete_result.error}", severity="error")

"""
Enhanced MIDI Tab - Original TUI
=================================
Tabbed MIDI configuration with Devices, Mappings, Routing, Monitor, and Clock.
"""

from typing import Optional, Dict, Any, List
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.widgets import Static, Label, Button, DataTable, Select, Switch, Input, TabPane, Tabs
from textual.app import ComposeResult
from textual.reactive import reactive
from textual import work

from ..api_client import MAP2APIClient


class MIDITab(Container):
    """
    Enhanced MIDI tab with tabbed sub-sections.
    
    Features:
    - Device selection
    - CC mapping management
    - MIDI routing configuration
    - Real-time MIDI monitor
    - Clock/sync configuration
    """
    
    DEFAULT_CSS = """
    MIDITab {
        width: 100%;
        height: 100%;
    }
    
    MIDITab .tab-content {
        width: 100%;
        height: 1fr;
        padding: 1;
    }
    
    MIDITab .status-card {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $border;
        padding: 1;
        margin-bottom: 1;
    }
    
    MIDITab .control-row {
        width: 100%;
        height: 3;
        margin-bottom: 1;
    }
    
    MIDITab .table-container {
        width: 100%;
        height: 1fr;
        margin-bottom: 1;
    }
    
    MIDITab .monitor-display {
        width: 100%;
        height: 15;
        background: $surface;
        border: solid $border;
        padding: 1;
        margin-bottom: 1;
    }
    """
    
    midi_mappings: reactive[List[Dict]] = reactive([])
    midi_monitor: reactive[List[Dict]] = reactive([])
    
    def __init__(self, api_client: MAP2APIClient, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client
    
    def compose(self) -> ComposeResult:
        with Tabs(id="midi-tabs"):
            # Devices Tab
            with TabPane("🎹 Devices", id="tab-devices"):
                yield ScrollableContainer(
                    id="devices-content",
                    classes="tab-content"
                )
            
            # Mappings Tab
            with TabPane("🎛️ Mappings", id="tab-mappings"):
                yield ScrollableContainer(
                    id="mappings-content",
                    classes="tab-content"
                )
            
            # Routing Tab
            with TabPane("🔀 Routing", id="tab-routing"):
                yield ScrollableContainer(
                    id="routing-content",
                    classes="tab-content"
                )
            
            # Monitor Tab
            with TabPane("📊 Monitor", id="tab-monitor"):
                yield ScrollableContainer(
                    id="monitor-content",
                    classes="tab-content"
                )
            
            # Clock Tab
            with TabPane("⏱️ Clock", id="tab-clock"):
                yield ScrollableContainer(
                    id="clock-content",
                    classes="tab-content"
                )
    
    async def on_mount(self) -> None:
        """Load MIDI data when tab mounts."""
        await self._load_devices_tab()
        await self._load_mappings_tab()
        await self._load_routing_tab()
        await self._load_monitor_tab()
        await self._load_clock_tab()
    
    # =========================================================================
    # Devices Tab
    # =========================================================================
    
    async def _load_devices_tab(self) -> None:
        """Load device selection content."""
        try:
            devices = await self.api_client.get_midi_devices()
            
            content = self.query_one("#devices-content", ScrollableContainer)
            await content.remove_children()
            
            await content.mount(Label("🎹 MIDI INPUT DEVICE"))
            await content.mount(Static("[dim]Select your MIDI input device[/]"))
            
            input_options = [(d.get("name", "Unknown"), d.get("id", "")) for d in devices if d.get("direction") == "input"]
            if input_options:
                select = Select(
                    options=input_options,
                    id="midi-input-device",
                    allow_blank=True
                )
                await content.mount(select)
            
            await content.mount(Static(""))
            await content.mount(Label("🎹 MIDI OUTPUT DEVICE"))
            await content.mount(Static("[dim]Select your MIDI output device[/]"))
            
            output_options = [(d.get("name", "Unknown"), d.get("id", "")) for d in devices if d.get("direction") == "output"]
            if output_options:
                select = Select(
                    options=output_options,
                    id="midi-output-device",
                    allow_blank=True
                )
                await content.mount(select)
            
            await content.mount(Button("🔄 Refresh Devices", id="btn-refresh-devices", variant="primary"))
            
        except Exception as e:
            self.notify(f"Failed to load devices: {e}", severity="error")
    
    # =========================================================================
    # Mappings Tab
    # =========================================================================
    
    async def _load_mappings_tab(self) -> None:
        """Load CC mapping content."""
        try:
            content = self.query_one("#mappings-content", ScrollableContainer)
            await content.remove_children()
            
            await content.mount(Label("🎛️ CC MAPPINGS"))
            await content.mount(Static("[dim]Learn mode allows automatic mapping of MIDI CC to parameters[/]"))
            
            with await content.mount(Container(classes="status-card")):
                with await content.mount(Horizontal()):
                    await content.mount(Input(
                        placeholder="Parameter ID",
                        id="learn-param-input"
                    ))
                    await content.mount(Button("Start Learn", id="btn-start-learn", variant="warning"))
                    await content.mount(Button("Stop Learn", id="btn-stop-learn", variant="error"))
            
            await content.mount(Static("📋 EXISTING MAPPINGS"))
            table = DataTable(id="mappings-table")
            table.add_columns("CC", "Channel", "Parameter", "Min", "Max", "Actions")
            await content.mount(table)
            
            self.midi_mappings = await self.api_client.get_midi_mappings()
            for mapping in self.midi_mappings:
                cc = mapping.get("cc", 0)
                channel = mapping.get("channel", "All")
                param = mapping.get("parameter_name", "Unknown")
                min_val = mapping.get("min_value", 0)
                max_val = mapping.get("max_value", 127)
                table.add_row(str(cc), str(channel), param, str(min_val), str(max_val), "Delete")
            
        except Exception as e:
            self.notify(f"Failed to load mappings: {e}", severity="error")
    
    # =========================================================================
    # Routing Tab
    # =========================================================================
    
    async def _load_routing_tab(self) -> None:
        """Load MIDI routing content."""
        try:
            routing = await self.api_client.get_midi_routing()
            
            content = self.query_one("#routing-content", ScrollableContainer)
            await content.remove_children()
            
            await content.mount(Label("🔀 MIDI ROUTING"))
            await content.mount(Static("[dim]Configure MIDI routing between devices[/]"))
            
            with await content.mount(Container(classes="status-card")):
                with await content.mount(Horizontal(classes="control-row")):
                    await content.mount(Label("Input: "))
                    await content.mount(Input(placeholder="Input port", id="route-input-port"))
                
                with await content.mount(Horizontal(classes="control-row")):
                    await content.mount(Label("Output: "))
                    await content.mount(Input(placeholder="Output port", id="route-output-port"))
                
                with await content.mount(Horizontal()):
                    await content.mount(Button("Add Route", id="btn-add-route", variant="primary"))
                    await content.mount(Button("Refresh", id="btn-refresh-routes", variant="default"))
            
            await content.mount(Static("📋 ACTIVE ROUTES"))
            table = DataTable(id="routes-table")
            table.add_columns("Input", "Output", "Status", "Actions")
            await content.mount(table)
            
            routes = routing.get("routes", [])
            for route in routes:
                input_port = route.get("input_port", "Unknown")
                output_port = route.get("output_port", "Unknown")
                enabled = "[green]✓[/]" if route.get("enabled") else "[red]✗[/]"
                table.add_row(input_port, output_port, enabled, "Delete")
            
        except Exception as e:
            self.notify(f"Failed to load routing: {e}", severity="error")
    
    # =========================================================================
    # Monitor Tab
    # =========================================================================
    
    async def _load_monitor_tab(self) -> None:
        """Load MIDI monitor content."""
        try:
            content = self.query_one("#monitor-content", ScrollableContainer)
            await content.remove_children()
            
            await content.mount(Label("📊 MIDI MONITOR"))
            await content.mount(Static("[dim]Real-time MIDI message display[/]"))
            
            with await content.mount(Horizontal()):
                await content.mount(Button("▶ Start", id="btn-start-monitor", variant="success"))
                await content.mount(Button("⏹ Stop", id="btn-stop-monitor", variant="error"))
                await content.mount(Button("Clear", id="btn-clear-monitor", variant="warning"))
            
            monitor_display = Static(
                "[dim]Waiting for MIDI messages...[/]",
                id="monitor-display",
                classes="monitor-display"
            )
            await content.mount(monitor_display)
            
            self.midi_monitor = await self.api_client.get_midi_monitor(limit=100)
            await self._update_monitor_display()
            
        except Exception as e:
            self.notify(f"Failed to load monitor: {e}", severity="error")
    
    async def _update_monitor_display(self) -> None:
        """Update the monitor display with latest messages."""
        try:
            display = self.query_one("#monitor-display", Static)
            
            if not self.midi_monitor:
                await display.update("[dim]No MIDI messages received[/]")
                return
            
            lines = []
            for msg in self.midi_monitor[-20:]:
                timestamp = msg.get("timestamp", "?")
                msg_type = msg.get("type", "Unknown")
                channel = msg.get("channel", "?")
                
                if msg_type == "CC":
                    cc = msg.get("cc", 0)
                    value = msg.get("value", 0)
                    lines.append(f"[cyan]{timestamp}[/] [yellow]CC[/] Ch{channel} CC{cc}={value}")
                elif msg_type == "Note":
                    note = msg.get("note", 0)
                    velocity = msg.get("velocity", 0)
                    action = "ON" if velocity > 0 else "OFF"
                    lines.append(f"[cyan]{timestamp}[/] [green]Note {action}[/] Ch{channel} Note{note} vel{velocity}")
                else:
                    lines.append(f"[cyan]{timestamp}[/] {msg_type}")
            
            content = "\n".join(lines[-20:])
            await display.update(content)
        except Exception as e:
            self.notify(f"Failed to update monitor: {e}", severity="error")
    
    # =========================================================================
    # Clock Tab
    # =========================================================================
    
    async def _load_clock_tab(self) -> None:
        """Load clock/sync configuration content."""
        try:
            clock_config = await self.api_client.get_midi_clock_config()
            
            content = self.query_one("#clock-content", ScrollableContainer)
            await content.remove_children()
            
            await content.mount(Label("⏱️ MIDI CLOCK"))
            await content.mount(Static("[dim]Configure MIDI clock and synchronization[/]"))
            
            with await content.mount(Container(classes="status-card")):
                with await content.mount(Horizontal(classes="control-row")):
                    await content.mount(Label("Mode: "))
                    mode_options = [("Internal", "internal"), ("External", "external"), ("Disabled", "disabled")]
                    await content.mount(Select(
                        options=mode_options,
                        value=clock_config.get("mode", "internal"),
                        id="clock-mode"
                    ))
                
                with await content.mount(Horizontal(classes="control-row")):
                    await content.mount(Label("BPM: "))
                    await content.mount(Input(
                        value=str(clock_config.get("bpm", 120)),
                        id="clock-bpm",
                        type="number"
                    ))
                
                with await content.mount(Horizontal(classes="control-row")):
                    await content.mount(Label("Send Clock: "))
                    await content.mount(Switch(
                        value=clock_config.get("send_clock", True),
                        id="clock-send"
                    ))
                
                with await content.mount(Horizontal(classes="control-row")):
                    await content.mount(Label("Receive Clock: "))
                    await content.mount(Switch(
                        value=clock_config.get("receive_clock", True),
                        id="clock-receive"
                    ))
                
                await content.mount(Button("Apply Clock Settings", id="btn-apply-clock", variant="primary"))
        
        except Exception as e:
            self.notify(f"Failed to load clock: {e}", severity="error")
    
    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button presses."""
        btn_id = event.button.id
        
        if btn_id == "btn-refresh-devices":
            await self._load_devices_tab()
            self.notify("Devices refreshed")
        elif btn_id == "btn-start-learn":
            await self._start_midi_learn()
        elif btn_id == "btn-stop-learn":
            await self._stop_midi_learn()
        elif btn_id == "btn-add-route":
            await self._add_route()
        elif btn_id == "btn-clear-monitor":
            self.midi_monitor = []
            await self._update_monitor_display()
        elif btn_id == "btn-apply-clock":
            await self._apply_clock_settings()
    
    async def _start_midi_learn(self) -> None:
        """Start MIDI learn mode."""
        param_input = self.query_one("#learn-param-input", Input)
        param_id = param_input.value.strip()
        
        if not param_id:
            self.notify("Enter a parameter ID", severity="warning")
            return
        
        result = await self.api_client.start_midi_learn(param_id)
        if result.success:
            self.notify("MIDI Learn active - move your control", severity="information")
        else:
            self.notify(f"Failed: {result.error}", severity="error")
    
    async def _stop_midi_learn(self) -> None:
        """Stop MIDI learn mode."""
        result = await self.api_client.stop_midi_learn()
        if result.success:
            self.notify("MIDI Learn stopped")
            await self._load_mappings_tab()
        else:
            self.notify(f"Failed: {result.error}", severity="error")
    
    async def _add_route(self) -> None:
        """Add a MIDI route."""
        input_port = self.query_one("#route-input-port", Input).value.strip()
        output_port = self.query_one("#route-output-port", Input).value.strip()
        
        if not input_port or not output_port:
            self.notify("Enter both ports", severity="warning")
            return
        
        result = await self.api_client.set_midi_route(input_port, output_port)
        if result.success:
            self.notify("Route added")
            await self._load_routing_tab()
        else:
            self.notify(f"Failed: {result.error}", severity="error")
    
    async def _apply_clock_settings(self) -> None:
        """Apply clock settings."""
        mode_select = self.query_one("#clock-mode", Select)
        bpm_input = self.query_one("#clock-bpm", Input)
        send_switch = self.query_one("#clock-send", Switch)
        receive_switch = self.query_one("#clock-receive", Switch)
        
        try:
            bpm = float(bpm_input.value or 120)
            mode = str(mode_select.value) if mode_select.value else "internal"
            
            result = await self.api_client.set_midi_clock_config(
                mode=mode,
                bpm=bpm,
                send_clock=send_switch.value,
                receive_clock=receive_switch.value
            )
            
            if result.success:
                self.notify("Clock settings applied")
            else:
                self.notify(f"Failed: {result.error}", severity="error")
        except ValueError:
            self.notify("Invalid BPM value", severity="error")

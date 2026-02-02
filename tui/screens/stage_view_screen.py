"""
Stage View Screen - Full-screen performance display for live use.

Provides a musician-friendly overview designed for use with MIDI foot controllers:
- Active chain(s) with color-coded effect type icons
- Real-time system health (CPU, latency, xruns)
- Live MIDI message log

Optimized for visibility at a distance during performance.
"""

import logging
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any
from collections import deque
from textual.app import ComposeResult
from textual.containers import Vertical, Horizontal, Container
from textual.widgets import Static, Label
from textual.binding import Binding
from textual.reactive import reactive

# Import shared utilities
try:
    from utils import get_plugin_icon, get_plugin_type_name, truncate_name
except ImportError:
    # Fallback if running as a module from parent directory
    from ..utils import get_plugin_icon, get_plugin_type_name, truncate_name

logger = logging.getLogger(__name__)


# Color coding for effect types - Rich markup colors
EFFECT_TYPE_COLORS: Dict[str, str] = {
    'reverb': 'cyan',
    'delay': 'blue',
    'compressor': 'yellow',
    'dynamics': 'yellow',
    'eq': 'green',
    'equalizer': 'green',
    'distortion': 'red',
    'overdrive': 'red',
    'amp': 'magenta',
    'amplifier': 'magenta',
    'chorus': 'bright_cyan',
    'flanger': 'bright_cyan',
    'phaser': 'bright_cyan',
    'modulation': 'bright_cyan',
    'gate': 'bright_yellow',
    'limiter': 'bright_yellow',
    'cabinet': 'bright_magenta',
    'cab': 'bright_magenta',
    'ir': 'bright_magenta',
    'filter': 'bright_green',
    'wah': 'bright_green',
    'pitch': 'bright_blue',
    'tremolo': 'bright_white',
    'vibrato': 'bright_white',
    'nam': 'magenta',
    'neural': 'magenta',
}

DEFAULT_EFFECT_COLOR = 'white'


def get_effect_color(uri_or_name: str) -> str:
    """Get color for effect type based on URI or name."""
    text = uri_or_name.lower()
    for keyword, color in EFFECT_TYPE_COLORS.items():
        if keyword in text:
            return color
    return DEFAULT_EFFECT_COLOR


class ChainDisplayWidget(Static):
    """
    Large visual display of active chain(s) with color-coded effects.
    Designed for visibility at a distance.
    """

    DEFAULT_CSS = """
    ChainDisplayWidget {
        width: 100%;
        height: 1fr;
        background: $surface;
        border: heavy $success;
        padding: 1 2;
    }

    ChainDisplayWidget #chain-title {
        width: 100%;
        text-align: center;
        text-style: bold;
        color: $success;
        margin-bottom: 1;
    }

    ChainDisplayWidget #chain-name-display {
        width: 100%;
        text-align: center;
        text-style: bold;
        color: $text;
        margin-bottom: 1;
    }

    ChainDisplayWidget #effects-flow {
        width: 100%;
        height: auto;
        align: center middle;
        margin: 1 0;
    }

    ChainDisplayWidget .effect-block {
        padding: 1 2;
        margin: 0 1;
        border: solid $primary;
        text-align: center;
        min-width: 12;
    }

    ChainDisplayWidget .effect-block-bypassed {
        border: dashed gray;
        color: $text-muted;
    }

    ChainDisplayWidget .flow-arrow {
        color: $primary;
        padding: 0 1;
    }

    ChainDisplayWidget #no-chain-message {
        width: 100%;
        text-align: center;
        color: $text-muted;
        padding: 4;
    }
    """

    def __init__(self, api_client=None):
        super().__init__()
        self.api_client = api_client
        self._active_chain: Optional[Dict[str, Any]] = None
        self._chains: List[Dict[str, Any]] = []

    def compose(self) -> ComposeResult:
        yield Label("ACTIVE CHAIN", id="chain-title")
        yield Label("No active chain", id="chain-name-display")
        yield Container(id="effects-flow")

    async def on_mount(self) -> None:
        self.set_interval(2.0, self._refresh_data)
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        if not self.api_client:
            return

        try:
            result = await self.api_client.list_chains()
            if result.success and result.data:
                self._chains = result.data if isinstance(result.data, list) else result.data.get("chains", [])

                # Find active chain
                self._active_chain = None
                for chain in self._chains:
                    if chain.get("is_active", False) or chain.get("active", False):
                        self._active_chain = chain
                        break

                self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching chains: {e}")

    def _update_display(self) -> None:
        try:
            name_label = self.query_one("#chain-name-display", Label)
            flow_container = self.query_one("#effects-flow", Container)

            # Clear flow container
            flow_container.remove_children()

            if not self._active_chain:
                name_label.update("[dim]No active chain[/dim]")
                flow_container.mount(Label("Press a MIDI switch to activate a chain", id="no-chain-message"))
                return

            # Update chain name
            chain_name = self._active_chain.get("name", "Unnamed Chain")
            name_label.update(f"[bold bright_white]{chain_name}[/bold bright_white]")

            # Build effects flow visualization
            plugins = self._active_chain.get("plugins", [])
            if not plugins:
                flow_container.mount(Label("[dim]Empty chain - add effects[/dim]"))
                return

            # Create horizontal layout for effects
            effects_row = Horizontal(classes="effects-row")

            for i, plugin in enumerate(plugins):
                plugin_name = plugin.get("name", plugin.get("uri", "Unknown").split("/")[-1])
                plugin_uri = plugin.get("uri", "")
                bypassed = plugin.get("bypass", False) or plugin.get("bypassed", False)

                # Get icon and color
                icon = get_plugin_icon(plugin_uri)
                color = get_effect_color(plugin_uri)
                effect_type = get_plugin_type_name(plugin_uri)
                display_name = truncate_name(plugin_name, 10)

                # Create effect block
                if bypassed:
                    block_text = f"[dim]{icon}\n{display_name}\n[BY][/dim]"
                    block_class = "effect-block effect-block-bypassed"
                else:
                    block_text = f"[{color}]{icon}[/{color}]\n[bold]{display_name}[/bold]\n[dim]{effect_type}[/dim]"
                    block_class = "effect-block"

                effects_row.mount(Static(block_text, classes=block_class))

                # Add arrow between effects (except after last)
                if i < len(plugins) - 1:
                    effects_row.mount(Static("[bright_green]\u2192[/bright_green]", classes="flow-arrow"))

            flow_container.mount(effects_row)

        except Exception as e:
            logger.debug(f"Error updating chain display: {e}")


class SystemHealthWidget(Static):
    """
    Real-time system health display with large, visible indicators.
    Shows CPU, latency, xruns, and overall status.
    """

    DEFAULT_CSS = """
    SystemHealthWidget {
        width: 100%;
        height: auto;
        background: $surface;
        border: heavy $warning;
        padding: 1 2;
    }

    SystemHealthWidget #health-title {
        width: 100%;
        text-align: center;
        text-style: bold;
        color: $warning;
        margin-bottom: 1;
    }

    SystemHealthWidget .health-grid {
        width: 100%;
        height: auto;
        layout: grid;
        grid-size: 4 2;
        grid-columns: 1fr 1fr 1fr 1fr;
        grid-rows: auto auto;
    }

    SystemHealthWidget .health-item {
        width: 100%;
        height: auto;
        text-align: center;
        padding: 1;
        border: solid $panel;
    }

    SystemHealthWidget .health-value {
        text-style: bold;
    }

    SystemHealthWidget .health-label {
        color: $text-muted;
    }

    SystemHealthWidget .status-good {
        color: $success;
    }

    SystemHealthWidget .status-warn {
        color: $warning;
    }

    SystemHealthWidget .status-bad {
        color: $error;
    }
    """

    def __init__(self, api_client=None):
        super().__init__()
        self.api_client = api_client
        self._audio_status: Dict[str, Any] = {}
        self._pipedal_status: Dict[str, Any] = {}
        self._latency: Optional[Dict[str, Any]] = None
        self._metrics: Dict[str, Any] = {}

    def compose(self) -> ComposeResult:
        yield Label("SYSTEM HEALTH", id="health-title")
        with Horizontal(classes="health-grid"):
            yield Static(self._format_cpu(0), id="health-cpu", classes="health-item")
            yield Static(self._format_latency(0), id="health-latency", classes="health-item")
            yield Static(self._format_xruns(0), id="health-xruns", classes="health-item")
            yield Static(self._format_buffer(256), id="health-buffer", classes="health-item")
            yield Static(self._format_sample_rate(48000), id="health-rate", classes="health-item")
            yield Static(self._format_engine_status(True), id="health-engine", classes="health-item")
            yield Static(self._format_memory(0), id="health-memory", classes="health-item")
            yield Static(self._format_overall("OK"), id="health-overall", classes="health-item")

    async def on_mount(self) -> None:
        self.set_interval(1.0, self._refresh_data)
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        if not self.api_client:
            return

        try:
            # Fetch audio status
            audio_result = await self.api_client.get_audio_status()
            if audio_result.success and audio_result.data:
                self._audio_status = audio_result.data

            # Fetch pipedal metrics (CPU, xruns)
            pipedal_result = await self.api_client.get_audio_pipedal_metrics()
            if pipedal_result.success and pipedal_result.data:
                self._pipedal_status = pipedal_result.data

            # Fetch latency
            latency_result = await self.api_client.get_audio_latency()
            if latency_result.success and latency_result.data:
                self._latency = latency_result.data

            # Fetch system metrics
            metrics_result = await self.api_client.get_current_metrics()
            if metrics_result.success and metrics_result.data:
                self._metrics = metrics_result.data

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching health data: {e}")

    def _update_display(self) -> None:
        try:
            # CPU
            cpu_load = self._pipedal_status.get("cpu_load", 0)
            if isinstance(cpu_load, (int, float)):
                cpu_load = round(cpu_load, 1)
            self.query_one("#health-cpu", Static).update(self._format_cpu(cpu_load))

            # Latency
            latency = 0
            if isinstance(self._latency, dict):
                latency = self._latency.get("latency_ms", 0)
            if isinstance(latency, (int, float)):
                latency = round(latency, 1)
            self.query_one("#health-latency", Static).update(self._format_latency(latency))

            # Xruns
            xruns = self._pipedal_status.get("xruns", 0)
            self.query_one("#health-xruns", Static).update(self._format_xruns(xruns))

            # Buffer
            buffer_size = self._audio_status.get("buffer_size", 256)
            self.query_one("#health-buffer", Static).update(self._format_buffer(buffer_size))

            # Sample rate
            sample_rate = self._audio_status.get("sample_rate", 48000)
            self.query_one("#health-rate", Static).update(self._format_sample_rate(sample_rate))

            # Engine status
            running = self._audio_status.get("running", False)
            self.query_one("#health-engine", Static).update(self._format_engine_status(running))

            # Memory
            memory_percent = self._metrics.get("memory_percent", 0)
            if isinstance(memory_percent, (int, float)):
                memory_percent = round(memory_percent, 1)
            self.query_one("#health-memory", Static).update(self._format_memory(memory_percent))

            # Overall status
            if not running:
                overall = "STOPPED"
            elif cpu_load > 80 or xruns > 10:
                overall = "WARNING"
            else:
                overall = "OK"
            self.query_one("#health-overall", Static).update(self._format_overall(overall))

        except Exception as e:
            logger.debug(f"Error updating health display: {e}")

    def _format_cpu(self, value: float) -> str:
        if value < 50:
            status_class = "status-good"
            color = "green"
        elif value < 80:
            status_class = "status-warn"
            color = "yellow"
        else:
            status_class = "status-bad"
            color = "red"
        return f"[{color}]CPU\n[bold]{value}%[/bold][/{color}]"

    def _format_latency(self, value: float) -> str:
        if value < 10:
            color = "green"
        elif value < 20:
            color = "yellow"
        else:
            color = "red"
        return f"[{color}]LATENCY\n[bold]{value}ms[/bold][/{color}]"

    def _format_xruns(self, value: int) -> str:
        if value == 0:
            color = "green"
        elif value < 10:
            color = "yellow"
        else:
            color = "red"
        return f"[{color}]XRUNS\n[bold]{value}[/bold][/{color}]"

    def _format_buffer(self, value: int) -> str:
        return f"[cyan]BUFFER\n[bold]{value}[/bold][/cyan]"

    def _format_sample_rate(self, value: int) -> str:
        return f"[cyan]RATE\n[bold]{value}Hz[/bold][/cyan]"

    def _format_engine_status(self, running: bool) -> str:
        if running:
            return "[green]ENGINE\n[bold]RUNNING[/bold][/green]"
        else:
            return "[red]ENGINE\n[bold]STOPPED[/bold][/red]"

    def _format_memory(self, value: float) -> str:
        if value < 50:
            color = "green"
        elif value < 80:
            color = "yellow"
        else:
            color = "red"
        return f"[{color}]MEMORY\n[bold]{value}%[/bold][/{color}]"

    def _format_overall(self, status: str) -> str:
        if status == "OK":
            return "[green bold]STATUS\nOK[/green bold]"
        elif status == "WARNING":
            return "[yellow bold]STATUS\nWARNING[/yellow bold]"
        else:
            return "[red bold]STATUS\nSTOPPED[/red bold]"


class MIDILogWidget(Static):
    """
    Real-time MIDI message log display.
    Shows incoming MIDI messages with timestamp, channel, type, and value.
    """

    DEFAULT_CSS = """
    MIDILogWidget {
        width: 100%;
        height: 12;
        background: $surface;
        border: heavy $accent;
        padding: 1 2;
    }

    MIDILogWidget #midi-title {
        width: 100%;
        text-align: center;
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    MIDILogWidget #midi-log-container {
        width: 100%;
        height: 1fr;
        overflow-y: auto;
    }

    MIDILogWidget .midi-message {
        width: 100%;
    }

    MIDILogWidget .midi-message-cc {
        color: $success;
    }

    MIDILogWidget .midi-message-pc {
        color: $warning;
    }

    MIDILogWidget .midi-message-note {
        color: $accent;
    }

    MIDILogWidget #midi-empty {
        color: $text-muted;
        text-align: center;
    }
    """

    MAX_MESSAGES = 8  # Keep last N messages

    def __init__(self, api_client=None):
        super().__init__()
        self.api_client = api_client
        self._messages: deque = deque(maxlen=self.MAX_MESSAGES)
        self._last_activity_time: float = 0

    def compose(self) -> ComposeResult:
        yield Label("MIDI ACTIVITY", id="midi-title")
        yield Container(id="midi-log-container")

    async def on_mount(self) -> None:
        self.set_interval(0.25, self._refresh_data)

    async def _refresh_data(self) -> None:
        if not self.api_client:
            return

        try:
            # Fetch MIDI activity from API
            result = await self.api_client.get_midi_activity()
            if result.success and result.data:
                activity = result.data

                # Process new messages
                if isinstance(activity, dict):
                    messages = activity.get("messages", [])
                    if isinstance(messages, list):
                        for msg in messages:
                            self._add_message(msg)
                elif isinstance(activity, list):
                    for msg in activity:
                        self._add_message(msg)

                self._update_display()
        except Exception as e:
            # MIDI activity endpoint might not exist - that's OK
            pass

    def _add_message(self, msg: Dict[str, Any]) -> None:
        """Add a MIDI message to the log."""
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-4]
        channel = msg.get("channel", 0)
        msg_type = msg.get("type", msg.get("message_type", "CC"))
        value = msg.get("value", 0)
        cc = msg.get("cc", msg.get("control", 0))
        note = msg.get("note", 0)
        velocity = msg.get("velocity", 0)

        if msg_type.upper() in ("CC", "CONTROL_CHANGE", "CONTROL"):
            text = f"[green]{timestamp}[/green] CH{channel:02d} [bold]CC{cc:03d}[/bold] = {value:03d}"
            msg_class = "midi-message-cc"
        elif msg_type.upper() in ("PC", "PROGRAM_CHANGE", "PROGRAM"):
            pc = msg.get("program", msg.get("pc", value))
            text = f"[yellow]{timestamp}[/yellow] CH{channel:02d} [bold]PC{pc:03d}[/bold]"
            msg_class = "midi-message-pc"
        elif msg_type.upper() in ("NOTE_ON", "NOTE"):
            text = f"[cyan]{timestamp}[/cyan] CH{channel:02d} [bold]Note {note}[/bold] vel={velocity}"
            msg_class = "midi-message-note"
        elif msg_type.upper() == "NOTE_OFF":
            text = f"[dim]{timestamp}[/dim] CH{channel:02d} [dim]Note {note} OFF[/dim]"
            msg_class = "midi-message"
        else:
            text = f"[dim]{timestamp}[/dim] CH{channel:02d} {msg_type} = {value}"
            msg_class = "midi-message"

        self._messages.append((text, msg_class))

    def _update_display(self) -> None:
        try:
            container = self.query_one("#midi-log-container", Container)
            container.remove_children()

            if not self._messages:
                container.mount(Label("[dim]Waiting for MIDI input...[/dim]", id="midi-empty"))
                return

            for text, msg_class in self._messages:
                container.mount(Static(text, classes=f"midi-message {msg_class}"))

        except Exception as e:
            logger.debug(f"Error updating MIDI display: {e}")

    def add_test_message(self, msg_type: str = "CC", channel: int = 1, cc: int = 7, value: int = 64) -> None:
        """Add a test message for demonstration."""
        self._add_message({
            "type": msg_type,
            "channel": channel,
            "cc": cc,
            "value": value,
        })
        self._update_display()


class StageViewScreen(Static):
    """
    STAGE VIEW - Full-screen performance display.

    Designed for musicians using MIDI foot controllers:
    - Large, colorful active chain display with effect type icons
    - Real-time system health monitoring (CPU, latency, xruns)
    - Live MIDI message log

    Optimized for visibility at a distance during live performance.
    """

    DEFAULT_CSS = """
    StageViewScreen {
        width: 100%;
        height: 100%;
        background: $background;
        layout: vertical;
    }

    StageViewScreen #stage-header {
        width: 100%;
        height: 3;
        background: $primary;
        text-align: center;
        padding: 1;
    }

    StageViewScreen #stage-header-text {
        text-style: bold;
        color: $text;
    }

    StageViewScreen #main-content {
        width: 100%;
        height: 1fr;
        layout: vertical;
    }

    StageViewScreen #bottom-panel {
        width: 100%;
        height: auto;
        layout: horizontal;
    }

    StageViewScreen #health-section {
        width: 60%;
        height: auto;
    }

    StageViewScreen #midi-section {
        width: 40%;
        height: auto;
    }
    """

    BINDINGS = [
        Binding("r", "refresh_all", "Refresh", show=True),
        Binding("m", "test_midi", "Test MIDI", show=True),
        Binding("q", "quit_stage", "Quit", show=True),
    ]

    def __init__(self, api_client=None, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client

    def compose(self) -> ComposeResult:
        """Compose the full-screen stage view."""
        yield Static(
            "[bold bright_white]STAGE VIEW[/bold bright_white] - [dim]Live Performance Display[/dim]",
            id="stage-header"
        )

        with Vertical(id="main-content"):
            # Large chain display takes most of the screen
            yield ChainDisplayWidget(self.api_client)

            # Bottom panel with health and MIDI
            with Horizontal(id="bottom-panel"):
                with Container(id="health-section"):
                    yield SystemHealthWidget(self.api_client)
                with Container(id="midi-section"):
                    yield MIDILogWidget(self.api_client)

    async def action_refresh_all(self) -> None:
        """Force refresh all widgets."""
        self.notify("Refreshing stage view...", timeout=1)

        try:
            # Refresh chain display
            for widget in self.query("ChainDisplayWidget"):
                asyncio.create_task(widget._refresh_data())

            # Refresh health widget
            for widget in self.query("SystemHealthWidget"):
                asyncio.create_task(widget._refresh_data())

            # Refresh MIDI log
            for widget in self.query("MIDILogWidget"):
                asyncio.create_task(widget._refresh_data())

            self.notify("Stage view refreshed", timeout=2)
        except Exception as e:
            self.notify(f"Refresh error: {e}", severity="error", timeout=3)

    def action_test_midi(self) -> None:
        """Send a test MIDI message for demonstration."""
        try:
            import random
            for widget in self.query("MIDILogWidget"):
                widget.add_test_message(
                    msg_type="CC",
                    channel=random.randint(1, 16),
                    cc=random.randint(0, 127),
                    value=random.randint(0, 127)
                )
            self.notify("Test MIDI message added", timeout=1)
        except Exception as e:
            self.notify(f"Error: {e}", severity="error", timeout=2)

    def action_quit_stage(self) -> None:
        """Exit stage view (notify parent app)."""
        self.notify("Use tab navigation or Ctrl+C to exit", timeout=2)

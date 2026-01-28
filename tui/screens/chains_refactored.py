"""
PiPedal-Style Signal Chains Management Screen
Visual pedalboard layout with effect blocks and signal routing
"""

from typing import Optional, List, Dict, Any
from textual.app import ComposeResult
from textual.message import Message
from textual.widgets import Static, Button, Label, Input, Select, OptionList, Switch, ProgressBar
from textual.widgets.option_list import Option
from textual.widgets import TabbedContent, TabPane, DataTable, Rule
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer, Grid, VerticalScroll
from textual.reactive import reactive
from textual import work

import asyncio
import logging
import sys
import os

logger = logging.getLogger(__name__)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from api_client import MAP2APIClient
from modals import ConfirmDialog, InputDialog, SelectDialog
from screens.metrics_tab import MetricsTab


class EffectBlock(Container):
    """
    Visual effect block widget representing a loaded plugin in the chain.

    Displays:
    - Plugin name and brand
    - Bypass toggle
    - Parameter indicators (levels/meters)
    - Click to edit parameters
    """

    DEFAULT_CSS = """
    EffectBlock {
        background: $panel;
        border: heavy $primary;
        width: 100%;
        height: 1fr;
        min-height: 6;
        padding: 0 1;
        margin: 0 1 1 0;
    }

    EffectBlock:hover {
        background: $panel-lighten-1;
        border: heavy $accent;
    }

    EffectBlock.active {
        border: heavy $success;
        background: $success-darken-3;
    }

    EffectBlock.bypassed {
        border: heavy $warning;
        background: $panel-darken-2;
        opacity: 0.7;
    }

    .effect-header {
        width: 100%;
        height: 1;
    }

    .effect-name {
        color: $accent;
        text-style: bold;
        width: 1fr;
    }

    .effect-brand {
        color: $text-muted;
        margin-top: 0;
    }

    .effect-meters {
        width: 100%;
        height: 3;
        margin-top: 1;
    }

    .param-indicator {
        width: 100%;
        margin-top: 0;
    }

    .effect-remove {
        width: 3;
        min-width: 3;
        height: 1;
        margin-left: 1;
    }

    .effect-footer {
        width: 100%;
        height: 2;
        margin-top: 1;
    }

    .effect-move {
        width: 3;
        min-width: 3;
        height: 1;
    }
    """

    def __init__(
        self,
        plugin_uri: str,
        plugin_name: str,
        plugin_brand: str = "",
        is_bypassed: bool = False,
        chain_id: int = 0,
        **kwargs
    ):
        super().__init__(**kwargs)
        self.plugin_uri = plugin_uri
        self.plugin_name = plugin_name
        self.plugin_brand = plugin_brand
        self.is_bypassed = is_bypassed
        self.chain_id = chain_id

    def compose(self) -> ComposeResult:
        """Compose effect block widgets."""
        # Header: name, bypass toggle, automation, and remove button
        with Horizontal(classes="effect-header"):
            yield Label(self.plugin_name, classes="effect-name")
            yield Switch(value=not self.is_bypassed, id=f"bypass-{id(self)}")
            yield Button("⚙️ Automate", id=f"automate-{id(self)}", classes="effect-automate")
            yield Button("X", variant="error", id=f"remove-{id(self)}", classes="effect-remove")

        # Brand/author
        if self.plugin_brand:
            yield Label(f"by {self.plugin_brand}", classes="effect-brand")

        # Move buttons and parameter indicator
        with Horizontal(classes="effect-footer"):
            yield Button("◀", variant="default", id=f"move-left-{id(self)}", classes="effect-move")
            yield ProgressBar(total=100, show_eta=False, classes="param-indicator")
            yield Button("▶", variant="default", id=f"move-right-{id(self)}", classes="effect-move")

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id and event.button.id.startswith("automate-"):
            # Open parameter automation UI for this effect
            from screens.parameter_automation import ParameterAutomationPanel
            # For demo, just use a placeholder parameter name
            panel = ParameterAutomationPanel(parameter_name="gain")
            self.mount(panel)

    def on_mount(self) -> None:
        """Apply initial bypass state styling."""
        if self.is_bypassed:
            self.add_class("bypassed")

    def set_bypass(self, bypassed: bool) -> None:
        """Update bypass state."""
        self.is_bypassed = bypassed
        if bypassed:
            self.add_class("bypassed")
        else:
            self.remove_class("bypassed")

    async def on_switch_changed(self, event: Switch.Changed) -> None:
        """Handle bypass toggle switch change."""
        # Switch value True = enabled (not bypassed), False = bypassed
        new_bypass_state = not event.value
        self.set_bypass(new_bypass_state)
        # Post message to parent to update API
        self.post_message(EffectBlock.BypassToggled(
            self.plugin_uri,
            self.plugin_name,
            new_bypass_state,
            self.chain_id
        ))

    async def on_click(self) -> None:
        """Handle click on effect block."""
        # Post message to parent to load parameters
        self.post_message(EffectBlock.Selected(self.plugin_uri, self.plugin_name))

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button presses (remove, move left, move right)."""
        if not event.button.id:
            return

        event.stop()  # Prevent click from propagating

        if event.button.id.startswith("remove-"):
            self.post_message(EffectBlock.RemoveRequested(
                self.plugin_uri,
                self.plugin_name,
                self.chain_id
            ))
        elif event.button.id.startswith("move-left-"):
            self.post_message(EffectBlock.MoveRequested(
                self.plugin_uri,
                self.plugin_name,
                self.chain_id,
                "left"
            ))
        elif event.button.id.startswith("move-right-"):
            self.post_message(EffectBlock.MoveRequested(
                self.plugin_uri,
                self.plugin_name,
                self.chain_id,
                "right"
            ))

    class Selected(Message):
        """Message sent when effect block is clicked."""
        def __init__(self, plugin_uri: str, plugin_name: str):
            super().__init__()
            self.plugin_uri = plugin_uri
            self.plugin_name = plugin_name

    class BypassToggled(Message):
        """Message sent when bypass switch is toggled."""
        def __init__(self, plugin_uri: str, plugin_name: str, bypassed: bool, chain_id: int):
            super().__init__()
            self.plugin_uri = plugin_uri
            self.plugin_name = plugin_name
            self.bypassed = bypassed
            self.chain_id = chain_id

    class RemoveRequested(Message):
        """Message sent when remove button is clicked."""
        def __init__(self, plugin_uri: str, plugin_name: str, chain_id: int):
            super().__init__()
            self.plugin_uri = plugin_uri
            self.plugin_name = plugin_name
            self.chain_id = chain_id

    class MoveRequested(Message):
        """Message sent when move button is clicked."""
        def __init__(self, plugin_uri: str, plugin_name: str, chain_id: int, direction: str):
            super().__init__()
            self.plugin_uri = plugin_uri
            self.plugin_name = plugin_name
            self.chain_id = chain_id
            self.direction = direction  # "left" or "right"


class EmptySlot(Container):
    """
    Empty effect slot in the pedalboard.
    Click to add a new effect.
    """

    DEFAULT_CSS = """
    EmptySlot {
        background: $panel-darken-2;
        border: dashed $primary-darken-2;
        width: 100%;
        height: 1fr;
        min-height: 6;
        padding: 0 1;
        margin: 0 1 1 0;
        align: center middle;
    }

    EmptySlot:hover {
        background: $panel-darken-1;
        border: dashed $accent;
        cursor: pointer;
    }

    .empty-label {
        color: $text-muted;
        text-align: center;
        text-style: italic;
    }
    """

    def compose(self) -> ComposeResult:
        """Compose empty slot."""
        yield Label("+ Add Effect", classes="empty-label")

    async def on_click(self) -> None:
        """Handle click on empty slot - signal to open plugin browser."""
        self.post_message(EmptySlot.Clicked())

    class Clicked(Message):
        """Message sent when empty slot is clicked."""
        pass


class SignalLink(Static):
    """
    Visual indicator showing signal flow between effects.
    Displays channel configuration (Stereo/Mono) and any conversion.
    """

    DEFAULT_CSS = """
    SignalLink {
        width: 100%;
        height: 1;
        text-align: center;
        color: $text-muted;
    }

    SignalLink.stereo {
        color: $success;
    }

    SignalLink.mono {
        color: $warning;
    }

    SignalLink.conversion {
        color: $accent;
        text-style: bold;
    }
    """

    def __init__(
        self,
        from_outputs: int,
        to_inputs: int,
        from_name: str = "",
        to_name: str = "",
        **kwargs
    ):
        self.from_outputs = from_outputs
        self.to_inputs = to_inputs
        self.from_name = from_name
        self.to_name = to_name

        # Determine signal type and any conversion
        link_text, css_class = self._compute_link_info()

        super().__init__(link_text, **kwargs)
        self._css_class = css_class

    def _compute_link_info(self) -> tuple[str, str]:
        """Compute link display text and CSS class."""
        out_ch = self.from_outputs
        in_ch = self.to_inputs

        # Determine channel types
        out_type = "Stereo" if out_ch >= 2 else "Mono"
        in_type = "Stereo" if in_ch >= 2 else "Mono"

        # Check for conversion
        if out_ch == in_ch:
            # No conversion
            if out_ch >= 2:
                return ("  │ ══ Stereo ══ │", "stereo")
            else:
                return ("  │ ── Mono ── │", "mono")
        elif out_ch > in_ch:
            # Stereo to Mono (downmix)
            return (f"  │ {out_type}→{in_type} ▼ │", "conversion")
        else:
            # Mono to Stereo (upmix/duplicate)
            return (f"  │ {out_type}→{in_type} ▲ │", "conversion")

    def on_mount(self) -> None:
        """Apply CSS class on mount."""
        self.add_class(self._css_class)


class SignalChainPanel(Container):
        # Undo/redo stacks for chain edits
        _undo_stack: list = []
        _redo_stack: list = []

        def push_undo(self, state):
            self._undo_stack.append(state)
            self._redo_stack.clear()

        def undo(self):
            if self._undo_stack:
                state = self._undo_stack.pop()
                self._redo_stack.append(self.save_state())
                self.restore_state(state)
                self.notify("Undo: Chain edit reverted", severity="information")

        def redo(self):
            if self._redo_stack:
                state = self._redo_stack.pop()
                self._undo_stack.append(self.save_state())
                self.restore_state(state)
                self.notify("Redo: Chain edit reapplied", severity="information")

        def save_state(self):
            # Save current plugins and chain_id (extend as needed)
            return {
                "chain_id": self.chain_id,
                "plugins": [p.copy() for p in self.plugins],
            }

        def restore_state(self, state):
            self.chain_id = state["chain_id"]
            self.plugins = [p.copy() for p in state["plugins"]]
            self.update_effects_list(self.plugins)

        async def on_key(self, event):
            # Ctrl+Z = Undo, Ctrl+Y = Redo
            if event.key == "z" and event.ctrl:
                self.undo()
                event.stop()
            elif event.key == "y" and event.ctrl:
                self.redo()
                event.stop()

class SignalChainPanel(Container):
    """
    Vertical signal chain panel showing effects as a stacked list.
    Located on the left side of the screen.
    """

    DEFAULT_CSS = """
    SignalChainPanel {
        background: $panel;
        border: solid $primary;
        width: 100%;
        height: 100%;
        padding: 0;
    }

    .chain-header {
        width: 100%;
        height: auto;
        background: $panel-darken-1;
        padding: 1;
    }

    .chain-name-box {
        width: 100%;
        height: 3;
        background: $primary-darken-2;
        border: tall $accent;
        padding: 0 1;
        text-align: center;
        content-align: center middle;
    }

    .chain-title {
        text-style: bold;
        color: $text;
        width: 100%;
        text-align: center;
    }

    .chain-info {
        color: $text-muted;
        text-align: center;
        width: 100%;
        margin-top: 1;
    }

    .signal-flow {
        width: 100%;
        height: 1;
        background: $success-darken-2;
        color: $success;
        text-align: center;
    }

    .effects-scroll {
        width: 100%;
        height: 1fr;
    }

    .effects-list {
        width: 100%;
        height: auto;
        padding: 0 1;
    }

    .chain-effect {
        width: 100%;
        height: 2;
        background: $panel-darken-1;
        border-left: thick $primary;
        margin-bottom: 1;
        padding: 0 1;
    }

    .chain-effect:hover {
        background: $panel;
        border-left: thick $accent;
    }

    .chain-effect.selected {
        background: $primary-darken-1;
        border-left: thick $accent;
    }

    .chain-effect.bypassed {
        opacity: 0.5;
        border-left: thick $error;
    }
    """

    chain_id: reactive[int] = reactive(0)
    chain_name: reactive[str] = reactive("")
    plugins: reactive[list] = reactive(list)
    selected_index: reactive[int] = reactive(-1)
    input_device: reactive[str] = reactive("")
    output_device: reactive[str] = reactive("")

    def compose(self) -> ComposeResult:
        """Compose signal chain panel."""
        # Header with chain info
        with Vertical(classes="chain-header"):
            # Emphasized box for chain name
            with Vertical(classes="chain-name-box"):
                yield Label("🔗 Signal Chain", classes="chain-title", id="chain-title")
            yield Label("No chain loaded", classes="chain-info", id="chain-info")

        # Signal flow indicator - Input
        yield Label("▼ INPUT", classes="signal-flow", id="input-label")

        # Scrollable effects list
        with ScrollableContainer(classes="effects-scroll", id="effects-scroll"):
            yield Vertical(classes="effects-list", id="effects-list")

        # Signal flow indicator - Output
        yield Label("▼ OUTPUT", classes="signal-flow", id="output-label")

    def watch_input_device(self, new_device: str) -> None:
        """Update input label when device changes."""
        try:
            label = self.query_one("#input-label", Label)
            if new_device:
                label.update(f"▼ INPUT [{new_device}]")
            else:
                label.update("▼ INPUT")
        except Exception:
            pass

    def watch_output_device(self, new_device: str) -> None:
        """Update output label when device changes."""
        try:
            label = self.query_one("#output-label", Label)
            if new_device:
                label.update(f"▼ OUTPUT [{new_device}]")
            else:
                label.update("▼ OUTPUT")
        except Exception:
            pass

    def set_audio_devices(self, input_dev: str, output_dev: str = "") -> None:
        """Set the audio input and output device names."""
        self.input_device = input_dev
        self.output_device = output_dev if output_dev else input_dev

    def watch_chain_id(self, new_chain_id: int) -> None:
        """React to chain selection change."""
        try:
            title = self.query_one("#chain-title", Label)
            info = self.query_one("#chain-info", Label)
            if new_chain_id > 0:
                title.update(f"🔗 {self.chain_name}")
                info.update(f"Chain #{new_chain_id}")
            else:
                title.update("🔗 Signal Chain")
                info.update("No chain loaded")
        except Exception:
            pass

    def watch_plugins(self, new_plugins: list) -> None:
        """Update effects list when plugins change."""
        self.update_effects_list(new_plugins)

    def update_effects_list(self, plugins: list = None) -> None:
        # Push undo state before any edit (except when restoring)
        if plugins is not None and plugins != self.plugins:
            self.push_undo(self.save_state())
        """Update the effects list display with parallel/branching and outstanding feedback."""
        if plugins is None:
            plugins = self.plugins

        try:
            effects_list = self.query_one("#effects-list", Vertical)
        except Exception:
            return

        effects_list.remove_children()

        try:
            info = self.query_one("#chain-info", Label)
            if plugins:
                info.update(f"{len(plugins)} effects")
            else:
                info.update("Empty chain")
        except Exception:
            pass

        if not plugins:
            effects_list.mount(Label("No effects - click Add to start", classes="chain-info"))
            return

        # --- Parallel/Branching Routing Visualization ---
        # For now, simulate a split after the first plugin and merge before the last
        # In a real implementation, this would be data-driven from the chain structure
        prev_outputs = 2
        for idx, plugin in enumerate(plugins):
            plugin_uri = plugin.get("uri", "")
            plugin_name = plugin.get("name", "Unknown")
            is_bypassed = plugin.get("bypassed", plugin.get("bypass", False))
            audio_inputs = plugin.get("audio_inputs", plugin.get("inputs", 2))
            audio_outputs = plugin.get("audio_outputs", plugin.get("outputs", 2))
            cpu_usage = plugin.get("cpu_usage", plugin.get("cpu", 0.0))
            error_state = plugin.get("error", False)

            # Simulate a split after the first plugin
            if idx == 1:
                effects_list.mount(Static("┬─── Parallel Split ───┬", classes="routing-split"))

            # Add animated signal link
            prev_name = plugins[idx - 1].get("name", "Input") if idx > 0 else "Input"
            link_widget = SignalLink(
                from_outputs=prev_outputs,
                to_inputs=audio_inputs,
                from_name=prev_name,
                to_name=plugin_name
            )
            effects_list.mount(link_widget)

            # Add effect block with outstanding feedback
            effect_widget = ChainEffectEntry(
                index=idx,
                plugin_uri=plugin_uri,
                plugin_name=plugin_name,
                is_bypassed=is_bypassed,
                chain_id=self.chain_id,
                audio_inputs=audio_inputs,
                audio_outputs=audio_outputs,
                cpu_usage=cpu_usage
            )
            # Outstanding feedback: error/cpu icons, animated border
            if error_state:
                effect_widget.add_class("error")
                effect_widget.update(f"{effect_widget.renderable} ⚠️ Error")
            elif cpu_usage > 80.0:
                effect_widget.add_class("cpu-high")
                effect_widget.update(f"{effect_widget.renderable} 🔥 CPU")
            effects_list.mount(effect_widget)

            # Simulate a merge before the last plugin
            if idx == len(plugins) - 2:
                effects_list.mount(Static("┴─── Merge ───┴", classes="routing-merge"))

            prev_outputs = audio_outputs

        # Add final signal link to output
        if plugins:
            last_plugin = plugins[-1]
            last_outputs = last_plugin.get("audio_outputs", last_plugin.get("outputs", 2))
            final_link = SignalLink(
                from_outputs=last_outputs,
                to_inputs=2,
                from_name=last_plugin.get("name", "Effect"),
                to_name="Output"
            )
            effects_list.mount(final_link)

        # Outstanding feedback: animated toast for successful update
        effects_list.mount(Static("✔️ Chain updated", classes="chain-toast"))


class ChainEffectEntry(Static, can_focus=True):
    """Single effect entry - displays as one line with plugin info."""

    BINDINGS = [
        ("enter", "select", "Select"),
        ("space", "select", "Select"),
        ("m", "show_menu", "Menu"),
        ("delete", "delete_effect", "Delete"),
    ]

    DEFAULT_CSS = """
    ChainEffectEntry {
        width: 100%;
        height: 1;
        background: $panel-darken-1;
        border-left: thick $primary;
        padding: 0 1;
        color: $text;
    }

    ChainEffectEntry:focus {
        background: $primary-darken-1;
        border-left: thick $accent;
    }

    ChainEffectEntry:hover {
        background: $panel;
        border-left: thick $accent;
    }

    ChainEffectEntry.selected {
        background: $primary-darken-1;
        border-left: thick $accent;
    }

    ChainEffectEntry.bypassed {
        opacity: 0.5;
        border-left: thick $error;
        text-style: italic;
    }
    """

    def __init__(
        self,
        index: int,
        plugin_uri: str,
        plugin_name: str,
        is_bypassed: bool = False,
        chain_id: int = 0,
        audio_inputs: int = 2,
        audio_outputs: int = 2,
        cpu_usage: float = 0.0,
        **kwargs
    ):
        # Determine stereo status
        is_stereo = audio_inputs >= 2 and audio_outputs >= 2
        stereo_mark = "ST" if is_stereo else "MO"

        # Create display text with info on right
        bypass_mark = "○" if is_bypassed else "●"
        name_part = f"{index + 1}. {bypass_mark} {plugin_name[:14]}"
        info_part = f"I:{audio_inputs} O:{audio_outputs} {stereo_mark} {cpu_usage:.1f}%"
        display_text = f"{name_part:<22} {info_part}"

        super().__init__(display_text, **kwargs)
        self.index = index
        self.plugin_uri = plugin_uri
        self.plugin_name = plugin_name
        self.is_bypassed = is_bypassed
        self.chain_id = chain_id
        self.audio_inputs = audio_inputs
        self.audio_outputs = audio_outputs
        self.cpu_usage = cpu_usage

    def on_mount(self) -> None:
        """Apply initial state."""
        if self.is_bypassed:
            self.add_class("bypassed")

    async def on_click(self) -> None:
        """Handle click - select this effect."""
        self.focus()
        self.post_message(EffectBlock.Selected(self.plugin_uri, self.plugin_name))

    def action_select(self) -> None:
        """Handle enter/space key - select this effect."""
        self.post_message(EffectBlock.Selected(self.plugin_uri, self.plugin_name))

    def action_show_menu(self) -> None:
        """Show context menu for effect options."""
        self.post_message(EffectBlock.RemoveRequested(
            self.plugin_uri,
            self.plugin_name,
            self.chain_id
        ))

    def action_delete_effect(self) -> None:
        """Delete effect via delete key."""
        self.post_message(EffectBlock.RemoveRequested(
            self.plugin_uri,
            self.plugin_name,
            self.chain_id
        ))


class PedalboardView(Container):
    """
    Visual pedalboard showing effect chain as blocks.
    Uses ScrollableContainer with Grid layout for dynamic effect slots.

    Fix 5: Supports unlimited plugins with scrolling instead of fixed 9 slots.
    """

    DEFAULT_CSS = """
    PedalboardView {
        background: $background-darken-1;
        border: solid $primary;
        padding: 0 1;
        width: 100%;
    }

    .pedalboard-title {
        text-style: bold;
        color: $accent;
        text-align: center;
        background: $panel-darken-1;
        padding: 0 1;
        margin-bottom: 1;
    }

    .pedalboard-scroll {
        width: 100%;
        height: 1fr;
        min-height: 6;
    }

    .pedalboard-grid {
        grid-size: 3;  /* 3 columns */
        grid-gutter: 1;
        width: 100%;
        height: auto;
        margin-top: 1;
    }

    .signal-path {
        width: 100%;
        height: 3;
        margin: 1 0;
    }

    .path-line {
        color: $accent;
        text-align: center;
    }

    .pedalboard-empty {
        color: $text-muted;
        text-align: center;
        text-style: italic;
        padding: 4;
    }

    .effect-count {
        color: $text-muted;
        text-align: right;
        padding-right: 2;
    }
    """

    # Fix 5: Configurable minimum empty slots to show
    MIN_EMPTY_SLOTS = 3

    chain_id: reactive[int] = reactive(0)
    chain_name: reactive[str] = reactive("")
    plugins: reactive[list] = reactive(list)

    def compose(self) -> ComposeResult:
        """Compose pedalboard view."""
        # Fix 5: Header with title and effect count
        with Horizontal(classes="signal-path"):
            yield Label("🎸 Pedalboard View", classes="pedalboard-title", id="pedalboard-title")
            yield Label("", classes="effect-count", id="effect-count")

        # Signal path indicator (Input -> Effects -> Output)
        with Container(classes="signal-path"):
            yield Label("IN ▶ [ Effects Chain ] ▶ OUT", classes="path-line")

        # Fix 5: ScrollableContainer wrapping Grid for unlimited plugins
        with ScrollableContainer(classes="pedalboard-scroll", id="pedalboard-scroll"):
            with Grid(classes="pedalboard-grid", id="effects-grid"):
                # Will be populated dynamically
                yield Label("No chain selected", classes="pedalboard-empty", id="empty-message")

    def watch_chain_id(self, new_chain_id: int) -> None:
        """React to chain selection change."""
        if new_chain_id > 0:
            self.query_one("#pedalboard-title", Label).update(f"🎸 {self.chain_name}")

    def watch_plugins(self, new_plugins: list) -> None:
        """Update effect blocks when plugins change."""
        try:
            grid = self.query_one("#effects-grid", Grid)
        except Exception:
            # Grid not mounted yet
            return

        # Clear existing children
        grid.remove_children()

        # Fix 5: Update effect count display
        try:
            count_label = self.query_one("#effect-count", Label)
            count_label.update(f"{len(new_plugins)} effects" if new_plugins else "")
        except Exception:
            pass

        if not new_plugins:
            # Show empty message (no ID to avoid duplicates)
            grid.mount(Label("Chain is empty - add effects to get started", classes="pedalboard-empty"))
            return

        # Add effect blocks for loaded plugins
        for plugin in new_plugins:
            plugin_uri = plugin.get("uri", "")
            plugin_name = plugin.get("name", "Unknown Effect")
            plugin_brand = plugin.get("brand", plugin.get("author", ""))
            is_bypassed = plugin.get("bypassed", plugin.get("bypass", False))

            grid.mount(EffectBlock(
                plugin_uri=plugin_uri,
                plugin_name=plugin_name,
                plugin_brand=plugin_brand,
                is_bypassed=is_bypassed,
                chain_id=self.chain_id
            ))

        # Fix 5: Dynamic empty slots - always show MIN_EMPTY_SLOTS for adding more
        # Round up to fill the current row (3 columns) plus MIN_EMPTY_SLOTS
        current_count = len(new_plugins)
        # Calculate how many slots needed to complete current row
        remainder = current_count % 3
        slots_to_complete_row = (3 - remainder) if remainder > 0 else 0
        # Add at least MIN_EMPTY_SLOTS, but complete the row first
        empty_slots = max(self.MIN_EMPTY_SLOTS, slots_to_complete_row)

        for _ in range(empty_slots):
            grid.mount(EmptySlot())


class ChainToolbar(Container):
    """
    Unified toolbar with chain and effect management buttons.
    Single row with two visually distinct button groups.
    """

    DEFAULT_CSS = """
    ChainToolbar {
        background: $panel-darken-1;
        border-bottom: solid $primary;
        padding: 0 1;
        width: 100%;
        height: 4;
        max-height: 4;
        layout: horizontal;
    }

    .chain-button-group {
        height: 3;
        layout: horizontal;
        align: left middle;
    }

    .effect-button-group {
        height: 3;
        layout: horizontal;
        align: right middle;
        width: 1fr;
    }

    ChainToolbar Button {
        min-width: 5;
        height: 3;
        margin: 0 1 0 0;
        padding: 0 1;
    }
    """

    def compose(self) -> ComposeResult:
        """Compose unified toolbar with chain and effect buttons."""
        # Chain management buttons (dark blue background)
        with Horizontal(classes="chain-button-group"):
            yield Button("New", variant="success", id="btn-create-chain")
            yield Button("Demo", variant="primary", id="btn-load-demo")
            yield Button("On", variant="primary", id="btn-activate-chain")
            yield Button("Off", variant="default", id="btn-deactivate-chain")
            yield Button("Rename", variant="default", id="btn-rename-chain")
            yield Button("Del", variant="error", id="btn-delete-chain")
            yield Button("Refresh", variant="default", id="btn-refresh-chains")

        # Effect management buttons (accent background)
        with Horizontal(classes="effect-button-group"):
            yield Button("+Add", variant="success", id="btn-add-effect")
            yield Button("-Rem", variant="error", id="btn-remove-effect")
            yield Button("↑Up", variant="default", id="btn-move-effect-up")
            yield Button("↓Dn", variant="default", id="btn-move-effect-down")
            yield Button("Byp", variant="warning", id="btn-bypass-effect")


class ChainSelector(Container):
    """
    Chain selection widget - dropdown and info only.
    """

    DEFAULT_CSS = """
    ChainSelector {
        background: $panel-darken-1;
        border-bottom: solid $primary;
        padding: 0 1;
        width: 100%;
        height: 3;
        max-height: 3;
        layout: horizontal;
        align: left middle;
    }

    .selector-section {
        width: auto;
        height: 2;
        padding-right: 2;
    }

    .selector-title {
        text-style: bold;
        color: $accent;
        width: auto;
        margin-right: 1;
    }

    .chain-select {
        width: 30;
        min-width: 20;
    }

    .chain-info-label {
        color: $text-muted;
        width: auto;
        padding: 0 2;
    }
    """

    chains: reactive[list] = reactive(list)
    selected_chain_id: reactive[int] = reactive(0)

    def compose(self) -> ComposeResult:
        """Compose chain selector - dropdown and info only."""
        # Left: Chain selector dropdown
        with Horizontal(classes="selector-section"):
            yield Label("Chain:", classes="selector-title")
            yield Select([], id="chain-select", classes="chain-select", allow_blank=True, prompt="Select chain...")

        # Right: Chain info
        yield Label("No chain selected", id="chain-info-text", classes="chain-info-label")

    def watch_chains(self, new_chains: list) -> None:
        """Update chain select dropdown when chains change."""
        chain_select = self.query_one("#chain-select", Select)

        # Build options list for Select widget: list of (label, value) tuples
        options = []
        for chain in new_chains:
            chain_id = chain.get("id", 0)
            name = chain.get("name", "Untitled")
            is_active = chain.get("is_active", False)
            plugin_count = chain.get("plugin_count", len(chain.get("plugins", [])))

            status = "🟢" if is_active else "⚪"
            label = f"{status} {name} ({plugin_count} fx)"

            options.append((label, chain_id))

        # Update the Select widget options
        chain_select.set_options(options)


class ParameterPanel(Container):
    """
    LV2-compliant Parameter editing panel.

    Supports:
    - Parameter units (dB, Hz, ms, %)
    - Default values with reset
    - Scale points (enum values)
    - Toggle (boolean) parameters
    - Integer vs Float types
    - Logarithmic scale indication
    """

    DEFAULT_CSS = """
    ParameterPanel {
        background: $panel;
        border: none;
        padding: 1;
        width: 100%;
        height: 100%;
        layout: vertical;
    }

    .param-title {
        text-style: bold;
        color: $accent;
        height: 1;
    }

    .param-table {
        width: 100%;
        height: 1fr;
        min-height: 4;
    }

    .param-actions {
        width: 100%;
        height: 4;
        min-height: 4;
    }

    .param-actions Button {
        margin-right: 1;
        height: 3;
    }

    .param-count {
        color: $text-muted;
        height: 1;
    }
    """

    plugin_uri: reactive[str] = reactive("")
    plugin_name: reactive[str] = reactive("")
    parameters_data: reactive[list] = reactive(list)  # Store full param data

    def compose(self) -> ComposeResult:
        """Compose parameter panel."""
        yield Label("⚙️ Parameters", classes="param-title", id="param-title")

        # Parameter table with LV2 columns
        yield DataTable(id="param-table", classes="param-table", zebra_stripes=True, cursor_type="row")

        # Parameter count
        yield Label("", id="param-count", classes="param-count")

        # Actions
        with Horizontal(classes="param-actions"):
            yield Button("💾 Save Preset", variant="primary", id="btn-save-param-preset")
            yield Button("📂 Load Preset", variant="default", id="btn-load-param-preset")
            yield Button("🔄 Reset", variant="default", id="btn-reset-params")
            yield Button("⚡ Priority", variant="default", id="btn-set-priority")

    def on_mount(self) -> None:
        """Initialize parameter table with LV2-compliant columns."""
        table = self.query_one("#param-table", DataTable)
        table.add_columns("Parameter", "Value", "Default", "Range", "Unit")

        # Show initial placeholder message
        count_label = self.query_one("#param-count", Label)
        count_label.update("Select a plugin from the signal chain to view its parameters")

    def watch_plugin_name(self, new_name: str) -> None:
        """Update title when plugin changes."""
        if new_name:
            self.query_one("#param-title", Label).update(f"⚙️ {new_name} Parameters")
        else:
            self.query_one("#param-title", Label).update("⚙️ Parameters")

    def update_parameters(self, parameters: List[Dict]) -> None:
        """Update parameter table with LV2-compliant plugin parameters."""
        table = self.query_one("#param-table", DataTable)
        table.clear()

        # Store full parameter data for editing
        self.parameters_data = parameters

        for param in parameters:
            symbol = param.get("symbol", "")
            name = param.get("name", symbol)
            value = param.get("value", param.get("default", 0))
            default = param.get("default", value)
            min_val = param.get("min", param.get("minimum", 0))
            max_val = param.get("max", param.get("maximum", 1))
            unit = param.get("unit", param.get("units", ""))

            # Handle special LV2 types
            is_toggle = param.get("is_toggle", param.get("toggled", False))
            is_integer = param.get("is_integer", param.get("integer", False))
            is_logarithmic = param.get("is_logarithmic", param.get("logarithmic", False))
            scale_points = param.get("scale_points", param.get("scalePoints", []))

            # Format value display
            if is_toggle:
                value_str = "ON" if value > 0.5 else "OFF"
                default_str = "ON" if default > 0.5 else "OFF"
                range_str = "Toggle"
            elif scale_points:
                # Find matching scale point label
                value_str = self._find_scale_point_label(value, scale_points)
                default_str = self._find_scale_point_label(default, scale_points)
                range_str = f"{len(scale_points)} options"
            elif is_integer:
                value_str = f"{int(value)}"
                default_str = f"{int(default)}"
                range_str = f"{int(min_val)} - {int(max_val)}"
            else:
                value_str = f"{value:.2f}"
                default_str = f"{default:.2f}"
                if is_logarithmic:
                    range_str = f"{min_val:.2f} - {max_val:.2f} (log)"
                else:
                    range_str = f"{min_val:.2f} - {max_val:.2f}"

            # Format unit display
            unit_str = self._format_unit(unit)

            table.add_row(
                name,
                value_str,
                default_str,
                range_str,
                unit_str,
                key=symbol
            )

        # Update parameter count
        count_label = self.query_one("#param-count", Label)
        count_label.update(f"{len(parameters)} parameters")

    def _find_scale_point_label(self, value: float, scale_points: List[Dict]) -> str:
        """Find the label for a scale point value."""
        for sp in scale_points:
            sp_value = sp.get("value", sp.get("Value", 0))
            if abs(float(sp_value) - float(value)) < 0.001:
                return sp.get("label", sp.get("Label", str(value)))
        return f"{value:.2f}"

    def _format_unit(self, unit: str) -> str:
        """Format LV2 unit for display."""
        if not unit:
            return "-"

        # Common LV2 unit URIs to readable names
        unit_map = {
            "db": "dB",
            "hz": "Hz",
            "khz": "kHz",
            "ms": "ms",
            "s": "sec",
            "pc": "%",
            "percent": "%",
            "coef": "×",
            "semitone12tet": "st",
            "midiNote": "note",
            "bpm": "BPM",
        }

        unit_lower = unit.lower()
        for key, display in unit_map.items():
            if key in unit_lower:
                return display

        return unit

    def get_parameter_info(self, symbol: str) -> Optional[Dict]:
        """Get full parameter info by symbol."""
        for param in self.parameters_data:
            if param.get("symbol") == symbol:
                return param
        return None


class ExtendedParameterPanel(Container):
    """
    Extended parameter panel for quick access controls.

    Shows currently selected plugin's key parameters with
    sliders and quick-access controls.
    """

    DEFAULT_CSS = """
    ExtendedParameterPanel {
        background: $panel;
        border: solid $primary;
        padding: 0 1;
        width: 100%;
        height: 100%;
    }

    .ext-param-title {
        text-style: bold;
        color: $accent;
        height: 1;
    }

    .ext-param-content {
        width: 100%;
        height: 1fr;
    }

    .ext-param-row {
        width: 100%;
        height: auto;
    }

    .ext-param-label {
        width: 30%;
        color: $text-muted;
    }

    .ext-param-value {
        width: 70%;
        color: $text;
    }

    .ext-param-info {
        color: $text-muted;
        text-align: center;
        height: 100%;
        content-align: center middle;
    }
    """

    plugin_uri: reactive[str] = reactive("")
    plugin_name: reactive[str] = reactive("")

    def compose(self) -> ComposeResult:
        """Compose extended parameter panel."""
        yield Label("🎚️ Quick Controls", classes="ext-param-title", id="ext-param-title")
        with Container(classes="ext-param-content", id="ext-param-content"):
            yield Label("Select a plugin to view quick controls", classes="ext-param-info", id="ext-param-info")

    def watch_plugin_name(self, new_name: str) -> None:
        """Update title when plugin changes."""
        if new_name:
            self.query_one("#ext-param-title", Label).update(f"🎚️ {new_name}")
        else:
            self.query_one("#ext-param-title", Label).update("🎚️ Quick Controls")

    def update_quick_controls(self, parameters: List[Dict], plugin_name: str = "") -> None:
        """Update quick controls with key parameters."""
        self.plugin_name = plugin_name
        content = self.query_one("#ext-param-content", Container)

        # Clear existing content
        for child in list(content.children):
            child.remove()

        if not parameters:
            content.mount(Label("Select a plugin to view quick controls", classes="ext-param-info", id="ext-param-info"))
            return

        # Show first 4 key parameters as quick controls
        key_params = parameters[:4]

        for param in key_params:
            name = param.get("name", param.get("symbol", ""))
            value = param.get("value", param.get("default", 0))
            unit = param.get("unit", param.get("units", ""))
            is_toggle = param.get("is_toggle", param.get("toggled", False))

            # Format value
            if is_toggle:
                value_str = "ON" if value > 0.5 else "OFF"
            elif isinstance(value, float):
                value_str = f"{value:.1f}"
            else:
                value_str = str(value)

            if unit:
                value_str = f"{value_str} {unit}"

            row = Horizontal(classes="ext-param-row")
            content.mount(row)
            row.mount(Label(f"{name}:", classes="ext-param-label"))
            row.mount(Label(value_str, classes="ext-param-value"))


# PiPedal category mapping for plugin filtering (from PiPedal design)
PIPEDAL_CATEGORY_MAPPING = {
    "all": [],
    "dynamics": ["compressor", "limiter", "gate", "expander", "dynamics"],
    "eq": ["equalizer", "filter", "eq", "parametric", "highpass", "lowpass", "bandpass"],
    "reverb": ["reverb", "delay", "echo", "room", "hall", "plate"],
    "modulation": ["chorus", "flanger", "phaser", "tremolo", "vibrato", "rotary"],
    "distortion": ["distortion", "overdrive", "fuzz", "saturation", "drive"],
    "amp": ["amplifier", "amp", "preamp", "cabinet", "cab", "simulator"],
    "utility": ["utility", "meter", "tuner", "analyzer", "gain", "volume"],
}


class PluginBrowserPanel(Container):
    """
    PiPedal-compliant Plugin browser for adding effects to the chain.

    Features:
    - Real-time search/filter by name, author, brand, URI
    - PiPedal category filtering (Dynamics, EQ, Reverb, etc.)
    - Plugin info panel with ports and details
    - Discover/Refresh functionality
    - Add to active chain integration
    """

    DEFAULT_CSS = """
    PluginBrowserPanel {
        background: $panel;
        padding: 0 1;
        width: 100%;
        height: 100%;
        layout: vertical;
    }

    .browser-header {
        width: 100%;
        height: 1;
        margin-bottom: 0;
    }

    .browser-title {
        text-style: bold;
        color: $accent;
    }

    .browser-stats {
        color: $text-muted;
        text-align: right;
    }

    .browser-search {
        width: 100%;
        height: 3;
        margin: 0;
    }

    .category-filter {
        width: 100%;
        height: 3;
        margin: 0;
    }

    .plugin-list {
        width: 100%;
        height: auto;
        max-height: 20;
        min-height: 4;
        border: solid $primary-darken-1;
    }

    .browser-actions {
        width: 100%;
        height: 4;
        min-height: 4;
        margin-top: 1;
    }

    .browser-actions Button {
        min-width: 8;
        height: 3;
        margin-right: 1;
    }

    .plugin-count {
        color: $text-muted;
        height: 1;
    }
    """

    all_plugins: reactive[list] = reactive(list)
    filtered_plugins: reactive[list] = reactive(list)
    search_query: reactive[str] = reactive("")
    selected_category: reactive[str] = reactive("all")
    selected_plugin_uri: reactive[str] = reactive("")
    favorite_uris: reactive[set] = reactive(set)
    recent_uris: reactive[list] = reactive(list)  # Most recent first

    def compose(self) -> ComposeResult:
        """Compose plugin browser with compact layout."""
        # Header with title and stats
        with Horizontal(classes="browser-header"):
            yield Label("🔌 Plugins", classes="browser-title")
            yield Label("", id="plugin-stats", classes="browser-stats")

        # Search input
        yield Input(
            placeholder="Search plugins...",
            id="plugin-search",
            classes="browser-search"
        )

        # Category filter (compact)
        yield Select(
            options=[
                ("All", "all"),
                ("⭐ Favorites", "favorites"),
                ("🕐 Recent", "recent"),
                ("Dynamics", "dynamics"),
                ("EQ", "eq"),
                ("Reverb/Delay", "reverb"),
                ("Modulation", "modulation"),
                ("Distortion", "distortion"),
                ("Amp/Cab", "amp"),
                ("Utility", "utility"),
            ],
            value="all",
            id="category-filter",
            classes="category-filter"
        )

        # Plugin list (main content)
        yield OptionList(id="plugin-list", classes="plugin-list")

        # Plugin count
        yield Label("Loading...", id="plugin-count", classes="plugin-count")

        # Action buttons (compact)
        with Horizontal(classes="browser-actions"):
            yield Button("➕ Add", variant="success", id="btn-add-to-chain")
            yield Button("⭐", variant="default", id="btn-toggle-favorite")
            yield Button("🔄", variant="default", id="btn-refresh-plugins")

    def on_mount(self) -> None:
        """Initialize plugin browser."""
        self.load_plugins()

    def load_plugins(self) -> None:
        """Load plugins from parent screen.

        Note: Plugins are loaded by the parent ChainsScreenRefactored via
        refresh_plugins() which sets the all_plugins reactive property.
        The watch_all_plugins watcher then triggers filter_plugins().
        """
        # Parent sets all_plugins via reactive property - no action needed here

    def watch_all_plugins(self, new_plugins: list) -> None:
        """React to plugins being loaded."""
        self.filter_plugins()
        self._update_stats()

    def watch_search_query(self, new_query: str) -> None:
        """React to search query change."""
        self.filter_plugins()

    def watch_selected_category(self, new_category: str) -> None:
        """React to category filter change."""
        self.filter_plugins()

    def filter_plugins(self) -> None:
        """Filter plugins based on search and category using PiPedal categories."""
        filtered = list(self.all_plugins)

        # Handle special categories
        if self.selected_category == "favorites":
            # Show only favorite plugins
            filtered = [p for p in filtered if p.get("uri") in self.favorite_uris]
        elif self.selected_category == "recent":
            # Show recent plugins in order
            uri_to_plugin = {p.get("uri"): p for p in filtered}
            filtered = [uri_to_plugin[uri] for uri in self.recent_uris if uri in uri_to_plugin]
        elif self.selected_category == "separator":
            # Ignore separator selection, keep all
            pass
        elif self.selected_category != "all":
            # Apply category filter using PiPedal mapping
            keywords = PIPEDAL_CATEGORY_MAPPING.get(self.selected_category, [])
            if keywords:
                filtered = [
                    p for p in filtered
                    if any(
                        kw in p.get("category", "").lower() or
                        kw in p.get("plugin_type", "").lower() or
                        kw in p.get("name", "").lower() or
                        kw in p.get("class_label", "").lower()
                        for kw in keywords
                    )
                ]

        # Apply search filter
        if self.search_query:
            query = self.search_query.lower()
            filtered = [
                p for p in filtered
                if query in p.get("name", "").lower()
                or query in p.get("author", "").lower()
                or query in p.get("brand", "").lower()
                or query in p.get("uri", "").lower()
                or query in p.get("category", "").lower()
            ]

        self.filtered_plugins = filtered
        self.update_plugin_list()
        self._update_stats()

    def _update_stats(self) -> None:
        """Update plugin statistics display."""
        try:
            stats = self.query_one("#plugin-stats", Label)
            total = len(self.all_plugins)
            filtered = len(self.filtered_plugins)

            if self.search_query or self.selected_category != "all":
                stats.update(f"{filtered}/{total}")
            else:
                stats.update(f"{total} plugins")
        except Exception:
            pass

    def update_plugin_list(self) -> None:
        """Update the plugin list display with PiPedal-style formatting."""
        plugin_list = self.query_one("#plugin-list", OptionList)
        plugin_list.clear_options()

        # Show message if no plugins available
        if not self.filtered_plugins:
            count_label = self.query_one("#plugin-count", Label)
            if not self.all_plugins:
                count_label.update("Loading plugins... (Press 🔄 if none appear)")
            elif self.search_query or self.selected_category != "all":
                count_label.update("No plugins match current filter")
            else:
                count_label.update("No plugins available")
            return

        for plugin in self.filtered_plugins:
            uri = plugin.get("uri", "")
            name = plugin.get("name", "Unknown")
            brand = plugin.get("brand", "")
            author = plugin.get("author", plugin.get("author_name", ""))
            category = plugin.get("category", plugin.get("plugin_type", ""))

            # Add favorite marker
            fav_marker = "⭐ " if uri in self.favorite_uris else ""

            # PiPedal-style: [⭐] Brand: Name [Category]
            if brand:
                label = f"{fav_marker}{brand}: {name}"
            elif author:
                label = f"{fav_marker}{name} - {author}"
            else:
                label = f"{fav_marker}{name}"

            if category:
                label = f"{label} [{category}]"

            # Use Option with id to store URI for later retrieval
            plugin_list.add_option(Option(label, id=uri))

        # Update count
        count_label = self.query_one("#plugin-count", Label)
        total = len(self.all_plugins)
        filtered = len(self.filtered_plugins)
        fav_count = len(self.favorite_uris)

        if self.selected_category == "favorites":
            count_label.update(f"{fav_count} favorite plugins")
        elif self.selected_category == "recent":
            count_label.update(f"{filtered} recently used plugins")
        elif self.search_query or self.selected_category != "all":
            count_label.update(f"Showing {filtered} of {total} plugins")
        else:
            count_label.update(f"{total} plugins available")

    def update_plugin_info(self, plugin: dict) -> None:
        """Update plugin info display (compact mode - updates count label)."""
        # In compact mode, we show selected plugin info in the count label
        name = plugin.get("name", "Unknown")
        author = plugin.get("author", plugin.get("brand", ""))
        try:
            count_label = self.query_one("#plugin-count", Label)
            if author:
                count_label.update(f"Selected: {name} ({author})")
            else:
                count_label.update(f"Selected: {name}")
        except Exception:
            pass

    def clear_plugin_info(self) -> None:
        """Clear the plugin info display."""
        pass  # No-op in compact mode

    async def on_input_changed(self, event: Input.Changed) -> None:
        """Handle search input changes."""
        if event.input.id == "plugin-search":
            self.search_query = event.value

    async def on_select_changed(self, event: Select.Changed) -> None:
        """Handle category filter changes."""
        if event.select.id == "category-filter":
            self.selected_category = str(event.value)

    async def on_option_list_option_highlighted(self, event: OptionList.OptionHighlighted) -> None:
        """Handle plugin highlight (selection) to update info panel."""
        if event.option_list.id == "plugin-list":
            # Get URI from option index - match to filtered_plugins list
            option_index = event.option_index
            if option_index is not None and 0 <= option_index < len(self.filtered_plugins):
                plugin = self.filtered_plugins[option_index]
                uri = plugin.get("uri", "")
                if uri:
                    self.selected_plugin_uri = uri
                    self.update_plugin_info(plugin)
                    self._update_favorite_button()

    def _update_favorite_button(self) -> None:
        """Update the favorite button based on current selection."""
        try:
            fav_btn = self.query_one("#btn-toggle-favorite", Button)
            if self.selected_plugin_uri in self.favorite_uris:
                fav_btn.label = "★"  # Filled star
                fav_btn.variant = "warning"
            else:
                fav_btn.label = "⭐"  # Outline star
                fav_btn.variant = "default"
        except Exception:
            pass

    def toggle_favorite(self, plugin_uri: str) -> bool:
        """Toggle favorite status for a plugin. Returns new favorite state."""
        if plugin_uri in self.favorite_uris:
            self.favorite_uris = self.favorite_uris - {plugin_uri}
            return False
        else:
            self.favorite_uris = self.favorite_uris | {plugin_uri}
            return True

    def add_to_recent(self, plugin_uri: str) -> None:
        """Add a plugin to the recent list (max 20 items)."""
        # Remove if already exists
        recent = [u for u in self.recent_uris if u != plugin_uri]
        # Add to front
        recent.insert(0, plugin_uri)
        # Keep only last 20
        self.recent_uris = recent[:20]



class LCDPanel(Container):
    """LCD Display control panel with render window, options table, and navigation."""

    DEFAULT_CSS = """
    LCDPanel {
        background: $panel;
        padding: 1;
        width: 100%;
        height: 100%;
        layout: vertical;
        overflow-y: auto;
        align: center top;
    }

    .lcd-render-section {
        width: 100%;
        height: auto;
        align: center middle;
        padding: 1 0;
    }

    .lcd-render-box {
        background: #001a00;
        border: heavy #00ff00 50%;
        padding: 1 2;
        width: 34;
        height: 9;
        align: center middle;
        margin: 0 1;
    }

    .lcd-label {
        color: #00ff00;
        text-style: bold;
        text-align: center;
        height: 1;
    }

    .lcd-render-line {
        color: #00ff00;
        text-style: bold;
        width: 100%;
        text-align: center;
    }

    .lcd-render-border {
        color: #00aa00;
        width: 100%;
        text-align: center;
    }

    .lcd-table-section {
        width: 100%;
        height: auto;
        padding: 1 2;
        align: center middle;
    }

    #lcd-options-table {
        width: auto;
        min-width: 80;
        height: auto;
    }

    #lcd-options-table > .datatable--header {
        background: $panel-darken-2;
        text-style: bold;
    }

    #lcd-options-table > .datatable--cursor {
        background: $accent 30%;
    }

    .lcd-nav-section {
        width: 100%;
        height: auto;
        padding: 1 0;
        align: center middle;
    }

    .lcd-nav-pad {
        width: auto;
        height: auto;
        align: center middle;
        padding: 1;
    }

    .lcd-nav-row {
        width: auto;
        height: 3;
        align: center middle;
    }

    .lcd-nav-btn {
        width: 6;
        min-width: 6;
        margin: 0 1;
    }

    .lcd-nav-spacer {
        width: 6;
        min-width: 6;
        margin: 0 1;
    }

    .lcd-select-btn {
        width: 8;
        min-width: 8;
        margin: 0 1;
        background: $success-darken-1;
    }

    .lcd-select-btn:hover {
        background: $success;
    }

    .lcd-action-section {
        width: 100%;
        height: auto;
        padding: 1 0;
        align: center middle;
    }

    .lcd-action-row {
        width: auto;
        height: auto;
        align: center middle;
    }

    .lcd-action-row Button {
        margin: 0 1;
        min-width: 12;
    }

    .lcd-encoder-section {
        width: 100%;
        height: auto;
        padding: 1 0;
        align: center middle;
    }

    .lcd-encoder-row {
        width: auto;
        height: auto;
        align: center middle;
    }

    .lcd-encoder-row Button {
        margin: 0 1;
        min-width: 10;
    }

    .btn-encoder {
        background: $primary-darken-1;
    }

    .btn-encoder:hover {
        background: $primary;
    }

    .btn-encoder-press {
        background: $warning-darken-1;
    }

    .btn-encoder-press:hover {
        background: $warning;
    }
    """

    # Reactive state
    lcd_running: reactive[bool] = reactive(False)
    simulation_mode: reactive[bool] = reactive(False)
    current_page: reactive[str] = reactive("status")
    uptime: reactive[float] = reactive(0.0)
    update_count: reactive[int] = reactive(0)
    error_count: reactive[int] = reactive(0)

    # Row keys for table updates
    row_keys: dict = {}

    def _styled(self, text: str, color: str, bold: bool = False) -> "Text":
        """Create styled Rich text."""
        from rich.text import Text
        from rich.style import Style
        style = Style(color=color, bold=bold)
        return Text(text, style=style)

    def compose(self) -> ComposeResult:
        """Compose LCD panel: Dual render windows at top, options table, nav buttons centered below."""

        # ═══════════════════════════════════════════════════════════════════
        # DUAL LCD RENDER WINDOWS AT TOP (side by side)
        # ═══════════════════════════════════════════════════════════════════
        with Horizontal(classes="lcd-render-section"):
            # LCD 1 (Primary - I2C 0x27)
            with Vertical(classes="lcd-render-box", id="lcd-simulation-container-1"):
                yield Label("LCD 1 (0x27)", classes="lcd-label")
                yield Label("╔════════════════════════╗", classes="lcd-render-border")
                yield Label("║                        ║", id="lcd-sim-line1", classes="lcd-render-line")
                yield Label("║                        ║", id="lcd-sim-line2", classes="lcd-render-line")
                yield Label("╚════════════════════════╝", classes="lcd-render-border")

            # LCD 2 (Secondary - I2C 0x3F)
            with Vertical(classes="lcd-render-box", id="lcd-simulation-container-2"):
                yield Label("LCD 2 (0x3F)", classes="lcd-label")
                yield Label("╔════════════════════════╗", classes="lcd-render-border")
                yield Label("║                        ║", id="lcd2-sim-line1", classes="lcd-render-line")
                yield Label("║                        ║", id="lcd2-sim-line2", classes="lcd-render-line")
                yield Label("╚════════════════════════╝", classes="lcd-render-border")

        # ═══════════════════════════════════════════════════════════════════
        # OPTIONS TABLE (centered)
        # ═══════════════════════════════════════════════════════════════════
        with Horizontal(classes="lcd-table-section"):
            yield DataTable(id="lcd-options-table", cursor_type="row", zebra_stripes=True)

        # ═══════════════════════════════════════════════════════════════════
        # NAVIGATION D-PAD (centered)
        # ═══════════════════════════════════════════════════════════════════
        with Horizontal(classes="lcd-nav-section"):
            with Vertical(classes="lcd-nav-pad"):
                with Horizontal(classes="lcd-nav-row"):
                    yield Static("", classes="lcd-nav-spacer")
                    yield Button("▲", variant="default", id="btn-lcd-input-up", classes="lcd-nav-btn")
                    yield Static("", classes="lcd-nav-spacer")
                with Horizontal(classes="lcd-nav-row"):
                    yield Button("◄", variant="default", id="btn-lcd-input-left", classes="lcd-nav-btn")
                    yield Button("OK", variant="success", id="btn-lcd-input-select", classes="lcd-select-btn")
                    yield Button("►", variant="default", id="btn-lcd-input-right", classes="lcd-nav-btn")
                with Horizontal(classes="lcd-nav-row"):
                    yield Static("", classes="lcd-nav-spacer")
                    yield Button("▼", variant="default", id="btn-lcd-input-down", classes="lcd-nav-btn")
                    yield Static("", classes="lcd-nav-spacer")

        # ═══════════════════════════════════════════════════════════════════
        # ACTION BUTTONS (centered)
        # ═══════════════════════════════════════════════════════════════════
        with Horizontal(classes="lcd-action-section"):
            with Horizontal(classes="lcd-action-row"):
                yield Button("Menu", variant="default", id="btn-lcd-input-menu")
                yield Button("Back", variant="default", id="btn-lcd-input-back")
                yield Button("◄ Prev", variant="default", id="btn-lcd-input-prev")
                yield Button("Next ►", variant="default", id="btn-lcd-input-next")
                yield Button("Refresh", variant="primary", id="btn-lcd-refresh")

        # ═══════════════════════════════════════════════════════════════════
        # ENCODER CONTROLS (centered)
        # ═══════════════════════════════════════════════════════════════════
        with Horizontal(classes="lcd-encoder-section"):
            with Horizontal(classes="lcd-encoder-row"):
                yield Button("↺ CCW", id="btn-lcd-encoder-ccw", classes="btn-encoder")
                yield Button("Push", id="btn-lcd-encoder-press", classes="btn-encoder-press")
                yield Button("CW ↻", id="btn-lcd-encoder-cw", classes="btn-encoder")

    async def on_mount(self) -> None:
        """Build the options table on mount."""
        self._build_options_table()

    def _build_options_table(self) -> None:
        """Build the LCD options table with all settings."""
        try:
            table = self.query_one("#lcd-options-table", DataTable)

            # Define colors
            C_SECTION = "#4fc1ff"   # Light blue for sections
            C_LABEL = "#9cdcfe"    # Light cyan for labels
            C_VALUE = "#808080"    # Gray for values
            C_OK = "#4ec9b0"       # Green
            C_ERR = "#f14c4c"      # Red
            C_WARN = "#cca700"     # Yellow

            # Add columns
            table.add_column("Category", width=18)
            table.add_column("Option", width=20)
            table.add_column("Value", width=25)
            table.add_column("Status", width=15)

            # STATUS SECTION
            self.row_keys["system_status"] = table.add_row(
                self._styled("STATUS", C_SECTION, bold=True),
                self._styled("Connection", C_LABEL),
                self._styled("Not Connected", C_VALUE),
                self._styled("--", C_VALUE),
                key="system_status"
            )
            self.row_keys["mode"] = table.add_row(
                self._styled("", C_SECTION),
                self._styled("Mode", C_LABEL),
                self._styled("Unknown", C_VALUE),
                self._styled("", C_VALUE),
                key="mode"
            )
            self.row_keys["current_page"] = table.add_row(
                self._styled("", C_SECTION),
                self._styled("Current Page", C_LABEL),
                self._styled("None", C_VALUE),
                self._styled("", C_VALUE),
                key="current_page"
            )
            self.row_keys["uptime"] = table.add_row(
                self._styled("", C_SECTION),
                self._styled("Uptime", C_LABEL),
                self._styled("0s", C_VALUE),
                self._styled("", C_VALUE),
                key="uptime"
            )
            self.row_keys["updates"] = table.add_row(
                self._styled("", C_SECTION),
                self._styled("Update Count", C_LABEL),
                self._styled("0", C_VALUE),
                self._styled("", C_VALUE),
                key="updates"
            )
            self.row_keys["errors"] = table.add_row(
                self._styled("", C_SECTION),
                self._styled("Error Count", C_LABEL),
                self._styled("0", C_VALUE),
                self._styled("", C_VALUE),
                key="errors"
            )

            # DISPLAY SECTION - Dual LCD Support
            self.row_keys["display_type"] = table.add_row(
                self._styled("DISPLAY", C_SECTION, bold=True),
                self._styled("Configuration", C_LABEL),
                self._styled("Dual 20x2 LCD I2C", C_VALUE),
                self._styled("", C_VALUE),
                key="display_type"
            )
            self.row_keys["lcd1_addr"] = table.add_row(
                self._styled("", C_SECTION),
                self._styled("LCD 1 Address", C_LABEL),
                self._styled("0x27 (Primary)", C_VALUE),
                self._styled("", C_VALUE),
                key="lcd1_addr"
            )
            self.row_keys["lcd2_addr"] = table.add_row(
                self._styled("", C_SECTION),
                self._styled("LCD 2 Address", C_LABEL),
                self._styled("0x3F (Secondary)", C_VALUE),
                self._styled("", C_VALUE),
                key="lcd2_addr"
            )
            self.row_keys["backlight"] = table.add_row(
                self._styled("", C_SECTION),
                self._styled("Backlight", C_LABEL),
                self._styled("On", C_VALUE),
                self._styled("", C_VALUE),
                key="backlight"
            )
            self.row_keys["contrast"] = table.add_row(
                self._styled("", C_SECTION),
                self._styled("Contrast", C_LABEL),
                self._styled("100%", C_VALUE),
                self._styled("", C_VALUE),
                key="contrast"
            )
            self.row_keys["refresh_rate"] = table.add_row(
                self._styled("", C_SECTION),
                self._styled("Refresh Rate", C_LABEL),
                self._styled("10 Hz", C_VALUE),
                self._styled("", C_VALUE),
                key="refresh_rate"
            )

            # PAGES SECTION
            self.row_keys["page_status"] = table.add_row(
                self._styled("PAGES", C_SECTION, bold=True),
                self._styled("Status", C_LABEL),
                self._styled("System info display", C_VALUE),
                self._styled("", C_VALUE),
                key="page_status"
            )
            self.row_keys["page_vu"] = table.add_row(
                self._styled("", C_SECTION),
                self._styled("VU Meters", C_LABEL),
                self._styled("Audio level meters", C_VALUE),
                self._styled("", C_VALUE),
                key="page_vu"
            )
            self.row_keys["page_chain"] = table.add_row(
                self._styled("", C_SECTION),
                self._styled("Chain", C_LABEL),
                self._styled("Effect chain view", C_VALUE),
                self._styled("", C_VALUE),
                key="page_chain"
            )
            self.row_keys["page_plugins"] = table.add_row(
                self._styled("", C_SECTION),
                self._styled("Plugins", C_LABEL),
                self._styled("Plugin parameters", C_VALUE),
                self._styled("", C_VALUE),
                key="page_plugins"
            )
            self.row_keys["page_midi"] = table.add_row(
                self._styled("", C_SECTION),
                self._styled("MIDI", C_LABEL),
                self._styled("MIDI activity", C_VALUE),
                self._styled("", C_VALUE),
                key="page_midi"
            )
            self.row_keys["page_perf"] = table.add_row(
                self._styled("", C_SECTION),
                self._styled("Performance", C_LABEL),
                self._styled("CPU/DSP metrics", C_VALUE),
                self._styled("", C_VALUE),
                key="page_perf"
            )
            self.row_keys["page_settings"] = table.add_row(
                self._styled("", C_SECTION),
                self._styled("Settings", C_LABEL),
                self._styled("Configuration menu", C_VALUE),
                self._styled("", C_VALUE),
                key="page_settings"
            )
            self.row_keys["page_menu"] = table.add_row(
                self._styled("", C_SECTION),
                self._styled("Menu", C_LABEL),
                self._styled("Main navigation", C_VALUE),
                self._styled("", C_VALUE),
                key="page_menu"
            )

            # INPUT SECTION
            self.row_keys["encoder"] = table.add_row(
                self._styled("INPUT", C_SECTION, bold=True),
                self._styled("Rotary Encoder", C_LABEL),
                self._styled("Navigation/Value", C_VALUE),
                self._styled("", C_VALUE),
                key="encoder"
            )
            self.row_keys["buttons"] = table.add_row(
                self._styled("", C_SECTION),
                self._styled("Buttons", C_LABEL),
                self._styled("Menu/Back/Prev/Next", C_VALUE),
                self._styled("", C_VALUE),
                key="buttons"
            )
            self.row_keys["gpio_pins"] = table.add_row(
                self._styled("", C_SECTION),
                self._styled("GPIO Pins", C_LABEL),
                self._styled("BCM 17, 27, 22, 23", C_VALUE),
                self._styled("", C_VALUE),
                key="gpio_pins"
            )

        except Exception:
            pass

    def _update_table_row(self, key: str, value: str = None, status: str = None,
                          value_color: str = None, status_color: str = None) -> None:
        """Update a specific row in the options table."""
        try:
            table = self.query_one("#lcd-options-table", DataTable)
            if key not in self.row_keys:
                return

            row_key = self.row_keys[key]
            C_VALUE = "#808080"

            if value is not None:
                color = value_color or C_VALUE
                table.update_cell(row_key, "Value", self._styled(value, color))

            if status is not None:
                color = status_color or C_VALUE
                table.update_cell(row_key, "Status", self._styled(status, color))
        except Exception:
            pass

    def update_status(self, running: bool, simulation_mode: bool, current_page: str,
                      uptime: float, statistics: dict) -> None:
        """Update LCD status display via table."""
        self.lcd_running = running
        self.simulation_mode = simulation_mode
        self.current_page = current_page
        self.uptime = uptime
        self.update_count = statistics.get("updates", 0)
        self.error_count = statistics.get("errors", 0)

        C_OK = "#4ec9b0"
        C_ERR = "#f14c4c"
        C_WARN = "#cca700"

        # Update connection status
        if running:
            self._update_table_row("system_status", value="Connected", value_color=C_OK,
                                   status="● Running", status_color=C_OK)
        else:
            self._update_table_row("system_status", value="Disconnected", value_color=C_ERR,
                                   status="○ Stopped", status_color=C_ERR)

        # Update mode
        mode_str = "Simulation" if simulation_mode else "Hardware"
        self._update_table_row("mode", value=mode_str)

        # Update current page
        page_str = current_page.capitalize() if current_page else "None"
        self._update_table_row("current_page", value=page_str)

        # Update uptime
        if uptime >= 3600:
            uptime_str = f"{uptime/3600:.1f}h"
        elif uptime >= 60:
            uptime_str = f"{uptime/60:.1f}m"
        else:
            uptime_str = f"{uptime:.0f}s"
        self._update_table_row("uptime", value=uptime_str)

        # Update statistics
        self._update_table_row("updates", value=f"{self.update_count:,}")

        # Error count with color coding
        if self.error_count > 0:
            self._update_table_row("errors", value=str(self.error_count), value_color=C_ERR)
        else:
            self._update_table_row("errors", value="0", value_color=C_OK)

        # Highlight current page in table
        self._highlight_current_page(current_page)

    def _highlight_current_page(self, current_page: str) -> None:
        """Highlight the current page row in the table."""
        C_OK = "#4ec9b0"
        C_VALUE = "#808080"

        page_rows = {
            "status": "page_status",
            "vu": "page_vu",
            "vu_meters": "page_vu",
            "chain": "page_chain",
            "plugins": "page_plugins",
            "midi": "page_midi",
            "perf": "page_perf",
            "performance": "page_perf",
            "settings": "page_settings",
            "menu": "page_menu",
        }

        # Reset all page status indicators
        for row_key in ["page_status", "page_vu", "page_chain", "page_plugins",
                        "page_midi", "page_perf", "page_settings", "page_menu"]:
            self._update_table_row(row_key, status="")

        # Highlight current page
        if current_page:
            current_row = page_rows.get(current_page.lower(), "")
            if current_row:
                self._update_table_row(current_row, status="● Active", status_color=C_OK)

    def update_simulation(self, lines: list, lcd_num: int = 1) -> None:
        """Update the LCD render window display for specified LCD.

        Args:
            lines: List of text lines to display
            lcd_num: LCD number (1 or 2)
        """
        try:
            prefix = "" if lcd_num == 1 else "lcd2-"
            if len(lines) >= 1:
                line1 = lines[0][:24].center(24) if lines[0] else " " * 24
                self.query_one(f"#{prefix}lcd-sim-line1", Label).update(f"║{line1}║")
            if len(lines) >= 2:
                line2 = lines[1][:24].center(24) if lines[1] else " " * 24
                self.query_one(f"#{prefix}lcd-sim-line2", Label).update(f"║{line2}║")
        except Exception:
            pass

    def update_dual_simulation(self, lcd1_lines: list, lcd2_lines: list) -> None:
        """Update both LCD render windows."""
        self.update_simulation(lcd1_lines, lcd_num=1)
        self.update_simulation(lcd2_lines, lcd_num=2)

    def set_disconnected(self) -> None:
        """Set panel to disconnected state."""
        C_ERR = "#f14c4c"
        C_VALUE = "#808080"

        self._update_table_row("system_status", value="Not Connected", value_color=C_ERR,
                               status="○ Offline", status_color=C_ERR)
        self._update_table_row("mode", value="Unknown")
        self._update_table_row("current_page", value="None")
        self._update_table_row("uptime", value="0s")
        self._update_table_row("updates", value="0")
        self._update_table_row("errors", value="0")

        # Set both LCDs to disconnected state
        try:
            self.query_one("#lcd-sim-line1", Label).update("║   LCD 1 Not Active   ║")
            self.query_one("#lcd-sim-line2", Label).update("║                        ║")
            self.query_one("#lcd2-sim-line1", Label).update("║   LCD 2 Not Active   ║")
            self.query_one("#lcd2-sim-line2", Label).update("║                        ║")
        except Exception:
            pass


class PresetManagementPanel(Container):
    """
    Preset management panel for saving, loading, and organizing chain presets.
    """

    DEFAULT_CSS = """
    PresetManagementPanel {
        background: $panel;
        padding: 0 1;
        width: 100%;
        height: 100%;
        layout: vertical;
    }

    .preset-title {
        text-style: bold;
        color: $accent;
        height: 1;
    }

    .preset-list {
        width: 100%;
        height: 1fr;
        min-height: 4;
        border: solid $primary-darken-1;
    }

    .preset-info {
        height: 1;
        color: $text-muted;
    }

    .preset-actions {
        width: 100%;
        height: 3;
    }

    .preset-actions Button {
        margin-right: 1;
    }

    .filter-input {
        width: 100%;
        height: 3;
    }
    """

    # Reactive state
    presets: reactive[list] = reactive(list)
    selected_preset_id: reactive[int] = reactive(0)

    def compose(self) -> ComposeResult:
        """Compose preset management panel (compact)."""
        yield Label("💾 Presets", classes="preset-title")

        # Search/filter
        yield Input(
            placeholder="Search presets...",
            id="preset-search",
            classes="filter-input"
        )

        # Preset list
        yield OptionList(id="preset-list", classes="preset-list")

        # Selected preset info (compact single line)
        yield Label("No preset selected", id="preset-info-text", classes="preset-info")

        # Actions (horizontal, compact)
        with Horizontal(classes="preset-actions"):
            yield Button("📂 Load", variant="primary", id="btn-load-preset")
            yield Button("💾 Save", variant="success", id="btn-save-as-preset")
            yield Button("🗑️", variant="error", id="btn-delete-preset")
            yield Button("🔄", variant="default", id="btn-refresh-presets")

    def watch_presets(self, new_presets: list) -> None:
        """Update preset list when presets change."""
        preset_list = self.query_one("#preset-list", OptionList)
        preset_list.clear_options()

        for preset in new_presets:
            preset_id = preset.get("id", 0)
            name = preset.get("name", "Untitled")
            chain_name = preset.get("chain_name", "")
            category = preset.get("category", "User")
            tags = preset.get("tags", [])

            tag_str = f" [{', '.join(tags[:2])}]" if tags else ""
            label = f"{name} ({chain_name}){tag_str}"

            preset_list.add_option(Option(label, id=str(preset_id)))

    def update_preset_info(self, preset: dict) -> None:
        """Update the preset info display (compact single line)."""
        info_label = self.query_one("#preset-info-text", Label)
        if preset:
            name = preset.get("name", "Unknown")
            chain_name = preset.get("chain_name", "")
            plugin_count = preset.get("plugin_count", 0)
            info_label.update(f"Selected: {name} ({chain_name}, {plugin_count} plugins)")
        else:
            info_label.update("No preset selected")


class NAMIRPanel(Container):
    """
    Neural Amp Modeler and Impulse Response panel.

    Provides controls for:
    - NAM model selection and activation
    - Cabinet IR selection
    - Reverb IR selection
    - Status display for active models/IRs
    """

    DEFAULT_CSS = """
    NAMIRPanel {
        background: $panel;
        padding: 0 1;
        width: 100%;
        height: 100%;
        layout: vertical;
    }

    .namir-title {
        text-style: bold;
        color: $accent;
        height: 1;
        margin-bottom: 1;
    }

    .namir-section {
        width: 100%;
        margin-bottom: 1;
        border: solid $primary-darken-1;
        padding: 1;
    }

    .namir-section-title {
        text-style: bold;
        color: $success;
        height: 1;
    }

    .namir-status {
        height: 1;
        color: $text-muted;
    }

    .namir-list {
        width: 100%;
        height: auto;
        min-height: 3;
        max-height: 8;
        border: solid $panel-lighten-1;
    }

    .namir-actions {
        width: 100%;
        height: 3;
        margin-top: 1;
    }

    .namir-actions Button {
        margin-right: 1;
    }

    .namir-info {
        height: 2;
        color: $text-muted;
        text-style: italic;
    }

    .active-indicator {
        color: $success;
        text-style: bold;
    }

    .inactive-indicator {
        color: $text-muted;
    }
    """

    # Reactive state
    nam_models: reactive[list] = reactive(list)
    cabinet_irs: reactive[list] = reactive(list)
    reverb_irs: reactive[list] = reactive(list)
    active_nam: reactive[str] = reactive("")
    active_cabinet: reactive[str] = reactive("")
    active_reverb: reactive[str] = reactive("")

    def compose(self) -> ComposeResult:
        """Compose NAM/IR panel."""
        yield Label("🎸 NAM & Impulse Responses", classes="namir-title")

        # NAM Models Section
        with Container(classes="namir-section"):
            yield Label("🔊 NAM Models (Neural Amp)", classes="namir-section-title")
            yield Label("No model active", id="nam-status", classes="namir-status")
            yield OptionList(id="nam-model-list", classes="namir-list")
            with Horizontal(classes="namir-actions"):
                yield Button("▶ Activate", variant="success", id="btn-activate-nam")
                yield Button("🔄 Refresh", variant="default", id="btn-refresh-nam")

        # Cabinet IRs Section
        with Container(classes="namir-section"):
            yield Label("🔈 Cabinet IRs", classes="namir-section-title")
            yield Label("No cabinet loaded", id="cabinet-status", classes="namir-status")
            yield OptionList(id="cabinet-ir-list", classes="namir-list")
            with Horizontal(classes="namir-actions"):
                yield Button("▶ Load", variant="primary", id="btn-load-cabinet")
                yield Button("📁 Upload", variant="default", id="btn-upload-cabinet")
                yield Button("🔄", variant="default", id="btn-refresh-cabinets")

        # Reverb IRs Section
        with Container(classes="namir-section"):
            yield Label("🌊 Reverb IRs", classes="namir-section-title")
            yield Label("No reverb loaded", id="reverb-status", classes="namir-status")
            yield OptionList(id="reverb-ir-list", classes="namir-list")
            with Horizontal(classes="namir-actions"):
                yield Button("▶ Load", variant="primary", id="btn-load-reverb")
                yield Button("📁 Upload", variant="default", id="btn-upload-reverb")
                yield Button("🔄", variant="default", id="btn-refresh-reverbs")

        # Info section
        yield Label("Use Tab 6 (Guitar/NAM) for full controls", classes="namir-info")

    def watch_nam_models(self, new_models: list) -> None:
        """Update NAM model list."""
        try:
            model_list = self.query_one("#nam-model-list", OptionList)
            model_list.clear_options()
            for model in new_models:
                name = model.get("name", "") if isinstance(model, dict) else str(model)
                is_active = name == self.active_nam
                prefix = "● " if is_active else "○ "
                model_list.add_option(Option(f"{prefix}{name}", id=name))
        except Exception:
            pass

    def watch_cabinet_irs(self, new_irs: list) -> None:
        """Update cabinet IR list."""
        try:
            ir_list = self.query_one("#cabinet-ir-list", OptionList)
            ir_list.clear_options()
            for ir in new_irs:
                name = ir.get("name", "") if isinstance(ir, dict) else str(ir)
                is_active = name == self.active_cabinet
                prefix = "● " if is_active else "○ "
                ir_list.add_option(Option(f"{prefix}{name}", id=name))
        except Exception:
            pass

    def watch_reverb_irs(self, new_irs: list) -> None:
        """Update reverb IR list."""
        try:
            ir_list = self.query_one("#reverb-ir-list", OptionList)
            ir_list.clear_options()
            for ir in new_irs:
                name = ir.get("name", "") if isinstance(ir, dict) else str(ir)
                is_active = name == self.active_reverb
                prefix = "● " if is_active else "○ "
                ir_list.add_option(Option(f"{prefix}{name}", id=name))
        except Exception:
            pass

    def watch_active_nam(self, new_active: str) -> None:
        """Update active NAM status."""
        try:
            status = self.query_one("#nam-status", Label)
            if new_active:
                status.update(f"● Active: {new_active}")
                status.add_class("active-indicator")
                status.remove_class("inactive-indicator")
            else:
                status.update("○ No model active")
                status.add_class("inactive-indicator")
                status.remove_class("active-indicator")
        except Exception:
            pass

    def watch_active_cabinet(self, new_active: str) -> None:
        """Update active cabinet status."""
        try:
            status = self.query_one("#cabinet-status", Label)
            if new_active:
                status.update(f"● Loaded: {new_active}")
                status.add_class("active-indicator")
                status.remove_class("inactive-indicator")
            else:
                status.update("○ No cabinet loaded")
                status.add_class("inactive-indicator")
                status.remove_class("active-indicator")
        except Exception:
            pass

    def watch_active_reverb(self, new_active: str) -> None:
        """Update active reverb status."""
        try:
            status = self.query_one("#reverb-status", Label)
            if new_active:
                status.update(f"● Loaded: {new_active}")
                status.add_class("active-indicator")
                status.remove_class("inactive-indicator")
            else:
                status.update("○ No reverb loaded")
                status.add_class("inactive-indicator")
                status.remove_class("active-indicator")
        except Exception:
            pass

    def get_selected_nam_model(self) -> str:
        """Get selected NAM model name."""
        try:
            model_list = self.query_one("#nam-model-list", OptionList)
            if model_list.highlighted is not None:
                option = model_list.get_option_at_index(model_list.highlighted)
                return str(option.id) if option else ""
        except Exception:
            pass
        return ""

    def get_selected_cabinet_ir(self) -> str:
        """Get selected cabinet IR name."""
        try:
            ir_list = self.query_one("#cabinet-ir-list", OptionList)
            if ir_list.highlighted is not None:
                option = ir_list.get_option_at_index(ir_list.highlighted)
                return str(option.id) if option else ""
        except Exception:
            pass
        return ""

    def get_selected_reverb_ir(self) -> str:
        """Get selected reverb IR name."""
        try:
            ir_list = self.query_one("#reverb-ir-list", OptionList)
            if ir_list.highlighted is not None:
                option = ir_list.get_option_at_index(ir_list.highlighted)
                return str(option.id) if option else ""
        except Exception:
            pass
        return ""


class StatusBanner(Container):
    """
    Compact single-line status bar for bottom of screen.

    Shows:
    - Service ON/OFF controls (START/STOP buttons)
    - System status (API, Audio, MIDI) in horizontal line
    - Performance metrics (CPU, DSP)
    - Tab navigation on far right
    """

    DEFAULT_CSS = """
    StatusBanner {
        background: $panel-darken-2;
        width: 100%;
        height: 1;
        max-height: 1;
        padding: 0;
        layout: horizontal;
        align: left middle;
        overflow: hidden;
    }

    .engine-btn {
        min-width: 3;
        height: 1;
        margin: 0;
        padding: 0;
        border: none;
    }

    .engine-btn-start {
        background: $success-darken-1;
        color: $text;
    }

    .engine-btn-start:hover {
        background: $success;
    }

    .engine-btn-start:focus {
        background: $success;
    }

    .engine-btn-stop {
        background: $error-darken-1;
        color: $text;
    }

    .engine-btn-stop:hover {
        background: $error;
    }

    .engine-btn-stop:focus {
        background: $error;
    }

    .status-text {
        width: auto;
        height: 1;
        padding: 0 1;
        color: $text-muted;
    }

    .status-ok {
        color: $success;
    }

    .status-error {
        color: $error;
    }

    .service-on {
        color: $success;
        text-style: bold;
    }

    .service-off {
        color: $error;
        text-style: bold;
    }

    .metric-text {
        width: auto;
        height: 1;
        padding: 0 1;
        color: $text-muted;
    }

    .metric-bar {
        width: 15;
        height: 1;
        color: $success;
    }

    .metric-bar-warning {
        color: $warning;
    }

    .metric-bar-critical {
        color: $error;
    }

    .spacer {
        width: 1fr;
    }

    .nav-btn {
        min-width: 14;
        height: 1;
        margin: 0;
        padding: 0;
        border: none;
    }

    .nav-btn-active {
        background: $accent;
        color: $text;
        text-style: bold;
    }

    .nav-btn-inactive {
        background: $panel;
        color: $text-muted;
    }

    .nav-btn-inactive:hover {
        background: $panel-lighten-1;
        color: $text;
    }
    """

    # Reactive properties for metrics
    backend_ok: reactive[bool] = reactive(True)
    audio_running: reactive[bool] = reactive(False)
    midi_enabled: reactive[bool] = reactive(False)
    cpu_percent: reactive[float] = reactive(0.0)
    memory_mb: reactive[float] = reactive(0.0)
    uptime_seconds: reactive[float] = reactive(0.0)
    sample_rate: reactive[int] = reactive(48000)
    buffer_size: reactive[int] = reactive(256)
    cpu_load: reactive[float] = reactive(0.0)
    underruns: reactive[int] = reactive(0)
    chains_count: reactive[int] = reactive(0)
    active_chains: reactive[int] = reactive(0)
    loaded_plugins: reactive[int] = reactive(0)
    total_plugins: reactive[int] = reactive(0)
    midi_mappings: reactive[int] = reactive(0)
    pipedal_version: reactive[str] = reactive("--")
    active_pedalboard: reactive[str] = reactive("None")
    alsa_device: reactive[str] = reactive("default")

    # History for averaging (last 10 samples)
    HISTORY_SIZE = 10

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.cpu_history: list[float] = []
        self.dsp_history: list[float] = []

    def compose(self) -> ComposeResult:
        """Compose compact single-line status bar."""
        # Engine label and controls (START/STOP)
        yield Label("Engine:", classes="status-text")
        yield Button("▶", id="banner-btn-start", classes="engine-btn engine-btn-start")
        yield Button("⏹", id="banner-btn-stop", classes="engine-btn engine-btn-stop")

        # Service status
        yield Label("OFF", id="service-status", classes="status-text service-off")

        # Separator
        yield Label("│", classes="status-text")

        # Status indicators in horizontal line
        yield Label("API:", classes="status-text")
        yield Label("OK", id="api-status", classes="status-text status-ok")
        yield Label("Audio:", classes="status-text")
        yield Label("OFF", id="audio-status", classes="status-text status-error")
        yield Label("MIDI:", classes="status-text")
        yield Label("OFF", id="midi-status", classes="status-text status-error")

        # Separator
        yield Label("│", classes="status-text")

        # Stats
        yield Label("Chains:0", id="stats-chains", classes="status-text")
        yield Label("Plugins:0", id="stats-plugins", classes="status-text")

        # Separator
        yield Label("│", classes="status-text")

        # Performance metrics
        yield Label("CPU:", classes="metric-text")
        yield Label("░░░░░░░░░░", id="banner-cpu-bar", classes="metric-bar")
        yield Label("DSP:", classes="metric-text")
        yield Label("░░░░░░░░░░", id="banner-dsp-bar", classes="metric-bar")

        # Spacer to push nav to right
        yield Static("", classes="spacer")

        # Tab navigation on far right
        yield Button("🎛️ PEDALBOARD", id="nav-btn-pedalboard", classes="nav-btn nav-btn-active")
        yield Button("🎹 MIDI", id="nav-btn-midi", classes="nav-btn nav-btn-inactive")

    def update_system_status(self, backend: bool, audio: bool, midi: bool) -> None:
        """Update system status indicators."""
        self.backend_ok = backend
        self.audio_running = audio
        self.midi_enabled = midi

        # Update service status label (prominent ON/OFF)
        service_label = self.query_one("#service-status", Label)
        service_label.remove_class("service-on", "service-off")
        if audio:
            service_label.update(" ON ")
            service_label.add_class("service-on")
        else:
            service_label.update(" OFF ")
            service_label.add_class("service-off")

        # Update individual status indicators
        api_label = self.query_one("#api-status", Label)
        api_label.update("OK" if backend else "ERR")
        api_label.remove_class("status-ok", "status-error")
        api_label.add_class("status-ok" if backend else "status-error")

        audio_label = self.query_one("#audio-status", Label)
        audio_label.update("ON" if audio else "OFF")
        audio_label.remove_class("status-ok", "status-error")
        audio_label.add_class("status-ok" if audio else "status-error")

        midi_label = self.query_one("#midi-status", Label)
        midi_label.update("ON" if midi else "OFF")
        midi_label.remove_class("status-ok", "status-error")
        midi_label.add_class("status-ok" if midi else "status-error")

        # Update engine button states
        self.update_engine_buttons(audio)

    def update_pipedal_info(self, version: str, pedalboard: str, device: str) -> None:
        """Update PiPedal engine info (stored but not displayed in compact mode)."""
        self.pipedal_version = version
        self.active_pedalboard = pedalboard
        self.alsa_device = device

    def update_audio_info(self, sample_rate: int, buffer_size: int, underruns: int) -> None:
        """Update audio information (stored for later use)."""
        self.sample_rate = sample_rate
        self.buffer_size = buffer_size
        self.underruns = underruns

    def update_performance(self, cpu_percent: float, dsp_load: float, memory_mb: float) -> None:
        """Update performance metrics with real-time graph bars and averaging."""
        self.cpu_percent = cpu_percent
        self.cpu_load = dsp_load
        self.memory_mb = memory_mb

        # Add to history for averaging
        self.cpu_history.append(cpu_percent)
        self.dsp_history.append(dsp_load)

        # Keep only last N samples
        if len(self.cpu_history) > self.HISTORY_SIZE:
            self.cpu_history.pop(0)
        if len(self.dsp_history) > self.HISTORY_SIZE:
            self.dsp_history.pop(0)

        # Calculate averages
        cpu_avg = sum(self.cpu_history) / len(self.cpu_history) if self.cpu_history else 0
        dsp_avg = sum(self.dsp_history) / len(self.dsp_history) if self.dsp_history else 0

        bar_width = 8  # Compact bars

        # CPU bar graph with average
        cpu_filled = int((cpu_avg / 100) * bar_width)
        cpu_bar = "█" * cpu_filled + "░" * (bar_width - cpu_filled)
        cpu_label = self.query_one("#banner-cpu-bar", Label)
        cpu_label.update(f"{cpu_bar} {cpu_avg:4.1f}%")
        cpu_label.remove_class("metric-bar-warning", "metric-bar-critical")
        if cpu_avg > 80:
            cpu_label.add_class("metric-bar-critical")
        elif cpu_avg > 50:
            cpu_label.add_class("metric-bar-warning")

        # DSP bar graph with average
        dsp_filled = int((dsp_avg / 100) * bar_width)
        dsp_bar = "█" * dsp_filled + "░" * (bar_width - dsp_filled)
        dsp_label = self.query_one("#banner-dsp-bar", Label)
        dsp_label.update(f"{dsp_bar} {dsp_avg:4.1f}%")
        dsp_label.remove_class("metric-bar-warning", "metric-bar-critical")
        if dsp_avg > 80:
            dsp_label.add_class("metric-bar-critical")
        elif dsp_avg > 50:
            dsp_label.add_class("metric-bar-warning")

    def update_engine_buttons(self, audio_running: bool) -> None:
        """Update engine control button states based on audio running status."""
        start_btn = self.query_one("#banner-btn-start", Button)
        stop_btn = self.query_one("#banner-btn-stop", Button)

        start_btn.disabled = audio_running
        stop_btn.disabled = not audio_running

    def update_statistics(self, chains: int, active: int, loaded: int, total: int, midi_maps: int) -> None:
        """Update statistics display."""
        self.chains_count = chains
        self.active_chains = active
        self.loaded_plugins = loaded
        self.total_plugins = total
        self.midi_mappings = midi_maps

        # Update stats labels
        chains_label = self.query_one("#stats-chains", Label)
        chains_label.update(f"Chains:{active}/{chains}")

        plugins_label = self.query_one("#stats-plugins", Label)
        plugins_label.update(f"Plugins:{loaded}")


class ActivityLog(ScrollableContainer):
    """
    Scrollable activity log that shows all changes as they are applied.
    Displays timestamped entries for actions, status changes, and errors.
    """

    DEFAULT_CSS = """
    ActivityLog {
        background: $surface-darken-1;
        border: solid $primary-darken-1;
        width: 100%;
        height: 6;
        min-height: 6;
        max-height: 6;
        padding: 0;
    }

    .log-header {
        background: $panel-darken-2;
        color: $text-muted;
        text-style: bold;
        padding: 0 1;
        width: 100%;
        height: 1;
        display: none;
    }

    .log-entry {
        width: 100%;
        height: auto;
        padding: 0;
    }

    .log-timestamp {
        color: $text-muted;
        width: 10;
    }

    .log-message {
        color: $text;
        width: 1fr;
    }

    .log-info {
        color: $primary;
    }

    .log-success {
        color: $success;
    }

    .log-warning {
        color: $warning;
    }

    .log-error {
        color: $error;
    }

    .log-action {
        color: $accent;
    }
    """

    max_entries: reactive[int] = reactive(100)

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.entries = []

    def compose(self) -> ComposeResult:
        yield Label("📋 ACTIVITY LOG", classes="log-header")

    def log(self, message: str, level: str = "info") -> None:
        """Add a log entry with timestamp."""
        from datetime import datetime
        timestamp = datetime.now().strftime("%H:%M:%S")

        # Create log entry widget
        entry = Horizontal(classes="log-entry")
        ts_label = Label(f"[{timestamp}]", classes="log-timestamp")
        msg_label = Label(message, classes=f"log-message log-{level}")

        # Mount the entry
        self.mount(entry)
        entry.mount(ts_label)
        entry.mount(msg_label)

        # Store entry reference
        self.entries.append(entry)

        # Trim old entries if over max
        while len(self.entries) > self.max_entries:
            old_entry = self.entries.pop(0)
            old_entry.remove()

        # Scroll to bottom
        self.scroll_end(animate=False)

    def log_info(self, message: str) -> None:
        """Log an info message."""
        self.log(message, "info")

    def log_success(self, message: str) -> None:
        """Log a success message."""
        self.log(message, "success")

    def log_warning(self, message: str) -> None:
        """Log a warning message."""
        self.log(message, "warning")

    def log_error(self, message: str) -> None:
        """Log an error message."""
        self.log(message, "error")

    def log_action(self, message: str) -> None:
        """Log an action message."""
        self.log(message, "action")

    def clear(self) -> None:
        """Clear all log entries."""
        for entry in self.entries:
            entry.remove()
        self.entries.clear()


class ChainsScreenRefactored(Container):
    """
    Refactored Chains Screen with reorganized layout.

    Layout:
    ┌──────────────────────┬──────────────────────────────────────────────┐
    │                      │                                              │
    │  Signal Chain        │                                              │
    │  (Left column ~30%)  │  Tabs: Parameters | Plugins | Presets        │
    │                      │        Settings | LCD | NAM/IR               │
    │  - Vertical list     │  (Right column ~70% - full height)           │
    │  - Effect controls   │                                              │
    │  - Add button        │                                              │
    │                      │                                              │
    ├──────────────────────┤                                              │
    │ Activity Log (6 rows)│                                              │
    ├──────────────────────┤                                              │
    │ Status (1 line)      │                                              │
    └──────────────────────┴──────────────────────────────────────────────┘
    """

    CSS = """
    ChainsScreenRefactored {
        background: $background;
        width: 100%;
        height: 100%;
        layout: vertical;
    }

    /* Status banner - fixed 1 line at bottom */
    #status-banner {
        width: 100%;
        height: 1;
        min-height: 1;
        max-height: 1;
        padding: 0;
        overflow: hidden;
    }

    #status-banner Button {
        height: 1;
        min-height: 1;
        max-height: 1;
    }

    #status-banner Label {
        height: 1;
    }

    #status-banner Static {
        height: 1;
    }

    /* Main content area - horizontal split */
    #main-content {
        width: 100%;
        height: 1fr;
        layout: horizontal;
    }

    /* Left column - Signal Chain (30% width) */
    #left-column {
        width: 30%;
        height: 100%;
    }

    /* Chain toolbar - above signal chain */
    #chain-toolbar {
        width: 100%;
        height: 7;
        min-height: 7;
        max-height: 7;
    }

    /* Effect toolbar - below chain toolbar */
    #effect-toolbar {
        width: 100%;
        height: 4;
        min-height: 4;
        max-height: 4;
    }

    #signal-chain-panel {
        width: 100%;
        height: 1fr;
    }

    /* Right column - Parameters + Tools (70% width) */
    #right-column {
        width: 70%;
        height: 100%;
    }

    /* Chain selector dropdown - at top */
    #chain-selector {
        width: 100%;
        height: 3;
        min-height: 3;
        max-height: 3;
    }

    /* Tabbed tools area - fills remaining space */
    #tools-tabs {
        width: 100%;
        height: 1fr;
        min-height: 10;
    }

    /* Ensure TabbedContent internal components fill space */
    TabbedContent ContentSwitcher {
        width: 100%;
        height: 1fr;
    }

    TabbedContent TabPane {
        width: 100%;
        height: 1fr;
        padding: 1;
    }

    /* Tab content panels - all fill their containers */
    #parameter-panel, #plugin-browser, #presets-panel, #settings-panel {
        width: 100%;
        height: 1fr;
        border: none;
    }

    /* Settings panel styling */
    #settings-panel {
        width: 100%;
        height: 100%;
        overflow-y: auto;
        border: none;
    }

    /* Make tab content scrollable if needed */
    #tab-plugins, #tab-presets, #tab-settings, #tab-lcd {
        height: 100%;
        overflow-y: auto;
    }
    """

    def __init__(self, api_client: MAP2APIClient = None, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client if api_client else MAP2APIClient()
        self.chains = []
        self.selected_chain_id = 0
        self.selected_plugin_uri = ""

    def compose(self) -> ComposeResult:
        """Compose refactored chains screen."""
        # 1. Main content area (horizontal split - full height)
        with Horizontal(id="main-content"):
            # Left column (30%): Chain Selector + Toolbar + Signal Chain + Activity Log + Status
            with Vertical(id="left-column"):
                yield ChainSelector(id="chain-selector")
                yield ChainToolbar(id="chain-toolbar")
                yield SignalChainPanel(id="signal-chain-panel")

                # 2. Activity Log (scrolling terminal above status bar)
                yield ActivityLog(id="activity-log")

                # 3. Status Banner (compact, 1 line - fixed at bottom)
                yield StatusBanner(id="status-banner")

            # Right column (70%): Tabs - extends to bottom
            with Vertical(id="right-column"):

                # Tabbed tools area (fills remaining space)
                with TabbedContent(id="tools-tabs"):
                    with TabPane("⚙️ Parameters", id="tab-params"):
                        with VerticalScroll():
                            yield ParameterPanel(id="parameter-panel")

                    with TabPane("🔌 Plugins", id="tab-plugins"):
                        with VerticalScroll():
                            yield PluginBrowserPanel(id="plugin-browser")

                    with TabPane("💾 Presets", id="tab-presets"):
                        with VerticalScroll():
                            yield PresetManagementPanel(id="presets-panel")

                    with TabPane("⚙️ Settings", id="tab-settings"):
                        with VerticalScroll():
                            yield MetricsTab(self.api_client, id="settings-panel")

                    with TabPane("📺 LCD", id="tab-lcd"):
                        with VerticalScroll():
                            yield LCDPanel(id="lcd-panel")

                    with TabPane("🎸 NAM/IR", id="tab-namir"):
                        with VerticalScroll():
                            yield NAMIRPanel(id="namir-panel")

    def log(self, message: str, level: str = "info") -> None:
        """Log a message to the activity log."""
        try:
            activity_log = self.query_one("#activity-log", ActivityLog)
            activity_log.log(message, level)
        except Exception:
            pass

    def log_info(self, message: str) -> None:
        """Log an info message."""
        self.log(message, "info")

    def log_success(self, message: str) -> None:
        """Log a success message."""
        self.log(message, "success")

    def log_warning(self, message: str) -> None:
        """Log a warning message."""
        self.log(message, "warning")

    def log_error(self, message: str) -> None:
        """Log an error message."""
        self.log(message, "error")

    def log_action(self, message: str) -> None:
        """Log an action message."""
        self.log(message, "action")

    async def check_backend_connectivity(self) -> bool:
        """
        Fix 1: Check if the backend API is reachable.

        Returns:
            True if backend is available, False otherwise
        """
        try:
            result = await self.api_client.get_health()
            return result.success
        except Exception:
            return False

    def _extract_chain_id(self, data: Any) -> Optional[int]:
        """
        Fix 3: Extract chain ID from various API response formats.

        Handles different response structures:
        - {"id": 123}
        - {"chain_id": 123}
        - {"chain": {"id": 123}}
        - {"data": {"id": 123}}
        - 123 (direct integer)

        Returns:
            Chain ID if found, None otherwise
        """
        if data is None:
            return None

        if isinstance(data, int):
            return data

        if isinstance(data, dict):
            # Try common key names
            for key in ("id", "chain_id", "chainId"):
                if key in data:
                    val = data[key]
                    if isinstance(val, int):
                        return val

            # Try nested structures
            for nested_key in ("chain", "data", "result"):
                if nested_key in data and isinstance(data[nested_key], dict):
                    nested = data[nested_key]
                    for key in ("id", "chain_id", "chainId"):
                        if key in nested and isinstance(nested[key], int):
                            return nested[key]

        return None

    def _find_chain_id_by_name(self, name: str) -> Optional[int]:
        """
        Fix 3: Find a chain ID by name from the current chains list.

        Args:
            name: Chain name to search for

        Returns:
            Chain ID if found, None otherwise
        """
        for chain in self.chains:
            if chain.get("name") == name:
                return chain.get("id")
        return None

    async def on_mount(self) -> None:
        """Initialize screen on mount."""
        self.log_info("PiPedal TUI started")

        # Fix 1: Check backend connectivity before any operations
        if not await self.check_backend_connectivity():
            self.log_error("Backend not available - some features may not work")
            self.notify("Backend not available. Please ensure the server is running.", severity="error", timeout=5)
        else:
            self.log_success("Backend connection verified")

        # Run all refresh operations in parallel for faster startup
        await asyncio.gather(
            self.refresh_chains(),
            self.refresh_plugins(),
            self.refresh_presets(),
            self.refresh_pipedal_status(),
            self.refresh_rt_status(),
            self.refresh_all_namir(),
        )

        self.log_success("Initialization complete")

        # Auto-refresh chains every 10 seconds (reduced from 5s)
        self.set_interval(10.0, self.refresh_chains)
        # Auto-refresh engine status every 5 seconds (reduced from 2s)
        self.set_interval(5.0, self.refresh_pipedal_status)
        # Auto-refresh audio levels every 500ms (reduced from 100ms - was causing slowness)
        self.set_interval(0.5, self.refresh_audio_levels)
        # Auto-refresh CPU headroom every 5 seconds (reduced from 2s)
        self.set_interval(5.0, self.refresh_cpu_headroom)

    async def refresh_plugins(self) -> None:
        """Load plugins from PiPedal API."""
        try:
            # Try list_plugins first (faster, returns cached list)
            result = await self.api_client.list_plugins()
            self.log_info(f"list_plugins result: success={result.success}, data type={type(result.data)}")

            if result.success:
                data = result.data

                # Handle different possible data structures
                if isinstance(data, list):
                    plugins = data
                    self.log_info(f"Got list directly: {len(plugins)} plugins")
                elif isinstance(data, dict):
                    plugins = data.get("plugins", [])
                    if not plugins and data:
                        # Maybe the dict IS the plugins structure?
                        self.log_info(f"Dict keys: {list(data.keys())[:10]}")
                else:
                    plugins = []
                    self.log_warning(f"Unexpected data type: {type(data)}")

                # If list_plugins returns empty, try discover_plugins
                if not plugins:
                    self.log_info("No plugins from list, trying discover...")
                    result = await self.api_client.discover_plugins()
                    if result.success:
                        data = result.data
                        if isinstance(data, list):
                            plugins = data
                        elif isinstance(data, dict):
                            plugins = data.get("plugins", [])
                        else:
                            plugins = []

                # Update plugin browser
                plugin_browser = self.query_one("#plugin-browser", PluginBrowserPanel)
                plugin_browser.all_plugins = plugins

                if plugins:
                    self.log_success(f"Loaded {len(plugins)} plugins from PiPedal")
                    self.notify(f"Loaded {len(plugins)} plugins", severity="information", timeout=2)
                else:
                    self.log_warning("No plugins found - check backend status")
                    self.notify("No plugins found. Press 🔄 to refresh", severity="warning", timeout=3)
            else:
                self.log_error(f"Plugin API error: {result.error}")
                self.notify(f"Error loading plugins: {result.error}", severity="error")
        except Exception as e:
            self.log_error(f"Exception loading plugins: {e}")
            self.notify(f"Error loading plugins: {e}", severity="error")

    async def refresh_chains(self) -> None:
        """Refresh chains list from API."""
        try:
            result = await self.api_client.list_chains()
            if result.success:
                data = result.data
                if isinstance(data, dict):
                    self.chains = data.get("chains", [])
                elif isinstance(data, list):
                    self.chains = data
                else:
                    self.chains = []

                # Update chain selector
                chain_selector = self.query_one("#chain-selector", ChainSelector)
                chain_selector.chains = self.chains
        except Exception as e:
            self.notify(f"Error refreshing chains: {e}", severity="error")

    async def refresh_presets(self) -> None:
        """Refresh presets list from API."""
        try:
            result = await self.api_client.list_chain_presets()
            if result.success:
                data = result.data
                presets = data.get("presets", []) if isinstance(data, dict) else []

                # Update preset panel
                preset_panel = self.query_one("#presets-panel", PresetManagementPanel)
                preset_panel.presets = presets
        except Exception as e:
            self.notify(f"Error refreshing presets: {e}", severity="error")

    async def on_select_changed(self, event: Select.Changed) -> None:
        """Handle chain selection from Select dropdown."""
        if event.select.id == "chain-select":
            if event.value is not None and event.value != Select.BLANK:
                chain_id = event.value
                await self.load_chain(chain_id)

    async def on_option_list_option_selected(self, event: OptionList.OptionSelected) -> None:
        """Handle plugin or preset selection from OptionLists."""
        if event.option_list.id == "plugin-list":
            # Plugin selected in browser - handled by PluginBrowserPanel's
            # on_option_list_option_highlighted which updates its selected_plugin_uri
            pass

        elif event.option_list.id == "preset-list":
            # Preset selected in preset panel
            preset_id = event.option_id
            await self.select_preset(preset_id)

    async def load_chain(self, chain_id: int) -> None:
        """Load chain details and display in signal chain panel."""
        self.selected_chain_id = chain_id

        try:
            result = await self.api_client.get_chain(chain_id)
            if result.success:
                chain_data = result.data
                chain_name = chain_data.get("name", "Unknown")
                # API may return "nodes" or "plugins" depending on backend
                plugins = chain_data.get("plugins", chain_data.get("nodes", []))

                # Enrich plugin data with name/brand from plugin browser cache
                plugin_browser = self.query_one("#plugin-browser", PluginBrowserPanel)
                plugin_lookup = {p.get("uri"): p for p in plugin_browser.all_plugins}

                enriched_plugins = []
                for plugin in plugins:
                    # Handle both "uri" and "plugin_uri" field names
                    uri = plugin.get("uri", plugin.get("plugin_uri", ""))
                    plugin_info = plugin_lookup.get(uri, {})
                    enriched_plugins.append({
                        "uri": uri,
                        "name": plugin_info.get("name", plugin.get("name", uri.split("#")[-1] if "#" in uri else "Unknown")),
                        "brand": plugin_info.get("brand", plugin_info.get("author", plugin.get("brand", ""))),
                        "bypass": plugin.get("bypass", plugin.get("bypassed", False)),
                        "position": plugin.get("position", plugin.get("index", 0)),
                        "audio_inputs": plugin_info.get("audio_inputs", plugin.get("audio_inputs", plugin.get("inputs", 2))),
                        "audio_outputs": plugin_info.get("audio_outputs", plugin.get("audio_outputs", plugin.get("outputs", 2))),
                        "cpu_usage": plugin.get("cpu_usage", plugin.get("cpu", 0.0))
                    })

                # Update signal chain panel (left column)
                signal_chain = self.query_one("#signal-chain-panel", SignalChainPanel)
                signal_chain.chain_id = chain_id
                signal_chain.chain_name = chain_name
                signal_chain.plugins = enriched_plugins
                # Explicitly call update to ensure effects display
                signal_chain.update_effects_list(enriched_plugins)

                # Update chain info in selector
                try:
                    info_text = self.query_one("#chain-info-text", Label)
                    info_text.update(f"Chain: {chain_name} | {len(enriched_plugins)} effects")
                except Exception:
                    pass

                self.notify(f"Loaded chain: {chain_name}", severity="information")
        except Exception as e:
            self.notify(f"Error loading chain: {e}", severity="error")

    @work
    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button presses."""
        button_id = event.button.id

        # Handle effect select button clicks (select-effect-0, select-effect-1, etc.)
        if button_id and button_id.startswith("select-effect-"):
            # Find the parent ChainEffectEntry
            button = event.button
            parent = button.parent
            if isinstance(parent, ChainEffectEntry):
                self.selected_plugin_uri = parent.plugin_uri
                # Mark as selected visually
                signal_chain = self.query_one("#signal-chain-panel", SignalChainPanel)
                for child in signal_chain.query(ChainEffectEntry):
                    child.remove_class("selected")
                parent.add_class("selected")
                # Load parameters
                await self.load_plugin_parameters(parent.plugin_uri, parent.plugin_name)
            return

        if button_id == "btn-create-chain":
            await self.create_chain()

        elif button_id == "btn-activate-chain":
            await self.activate_chain()

        elif button_id == "btn-deactivate-chain":
            await self.deactivate_chain()

        elif button_id == "btn-delete-chain":
            await self.delete_chain()

        elif button_id == "btn-rename-chain":
            await self.rename_chain()

        elif button_id == "btn-refresh-chains":
            await self.refresh_chains()

        elif button_id == "btn-load-demo":
            await self.load_demo_pedalboard()

        elif button_id == "btn-add-to-chain":
            await self.add_plugin_to_chain()

        elif button_id == "btn-add-effect":
            # Switch to Plugins tab when Add Effect is clicked
            try:
                tabs = self.query_one("#tools-tabs", TabbedContent)
                tabs.active = "tab-plugins"
                # Focus the plugin search
                search = self.query_one("#plugin-search", Input)
                search.focus()
            except Exception:
                pass

        elif button_id == "btn-remove-effect":
            await self.remove_selected_effect()

        elif button_id == "btn-move-effect-up":
            await self.move_selected_effect("up")

        elif button_id == "btn-move-effect-down":
            await self.move_selected_effect("down")

        elif button_id == "btn-bypass-effect":
            await self.bypass_selected_effect()

        elif button_id == "btn-plugin-info":
            await self.show_plugin_info()

        elif button_id == "btn-refresh-plugins":
            await self.refresh_plugins()

        elif button_id == "btn-test-plugin":
            await self.test_plugin()

        elif button_id == "btn-toggle-favorite":
            await self.toggle_plugin_favorite()

        elif button_id == "btn-save-param-preset":
            await self.save_param_preset()

        elif button_id == "btn-load-param-preset":
            await self.load_param_preset()

        elif button_id == "btn-reset-params":
            await self.reset_params()

        elif button_id == "btn-set-priority":
            await self.set_plugin_priority()

        # Settings panel buttons
        elif button_id == "btn-start-audio":
            await self.start_audio()

        elif button_id == "btn-stop-audio":
            await self.stop_audio()

        elif button_id == "btn-enable-midi":
            await self.toggle_midi()

        elif button_id == "btn-midi-learn":
            await self.toggle_midi_learn()

        elif button_id == "btn-midi-devices":
            await self.show_midi_devices()

        elif button_id == "btn-midi-mappings":
            await self.show_midi_mappings()

        elif button_id == "btn-audio-config":
            await self.configure_audio()

        elif button_id == "btn-refresh-status":
            await self.refresh_pipedal_status()

        elif button_id == "btn-check-rt-status":
            await self.refresh_rt_status()

        # MIDI Advanced buttons
        elif button_id == "btn-start-midi-engine":
            await self.start_midi_engine()

        elif button_id == "btn-stop-midi-engine":
            await self.stop_midi_engine()

        elif button_id == "btn-start-midi-learn":
            await self.start_midi_learn()

        elif button_id == "btn-stop-midi-learn":
            await self.stop_midi_learn()

        elif button_id == "btn-add-midi-mapping":
            await self.add_midi_mapping()

        elif button_id == "btn-refresh-midi":
            await self.refresh_midi_data()

        elif button_id and button_id.startswith("btn-delete-midi-mapping-"):
            mapping_id = int(button_id.replace("btn-delete-midi-mapping-", ""))
            await self.delete_midi_mapping(mapping_id)

        elif button_id == "btn-shutdown-engine":
            await self.shutdown_engine()

        elif button_id == "btn-show-profiling":
            await self.show_profiling()

        elif button_id == "btn-optimize-dsp":
            await self.optimize_dsp()

        elif button_id == "btn-set-target-cpu":
            await self.set_target_cpu()

        elif button_id.startswith("btn-snapshot-"):
            snapshot_id = int(button_id.split("-")[-1])
            await self.load_snapshot(snapshot_id)

        # Preset panel buttons
        elif button_id == "btn-load-preset":
            await self.load_selected_preset()

        elif button_id == "btn-save-as-preset":
            await self.save_chain_as_preset()

        elif button_id == "btn-rename-preset":
            await self.rename_preset()

        elif button_id == "btn-delete-preset":
            await self.delete_preset()

        elif button_id == "btn-refresh-presets":
            await self.refresh_presets()

        elif button_id == "btn-save-pedalboard":
            await self.save_pedalboard()

        elif button_id == "btn-load-pedalboard":
            await self.load_pedalboard()

        # Status Banner buttons
        elif button_id == "banner-btn-start":
            await self.start_audio()

        elif button_id == "banner-btn-stop":
            await self.stop_audio()

        # Navigation buttons
        elif button_id == "nav-btn-pedalboard":
            await self.app.show_tab(0)

        elif button_id == "nav-btn-midi":
            await self.app.show_tab(1)

        # LCD Panel buttons
        elif button_id == "btn-lcd-refresh":
            await self.refresh_lcd_status()

        elif button_id.startswith("btn-lcd-page-"):
            page = button_id.replace("btn-lcd-page-", "")
            await self.set_lcd_page(page)

        elif button_id.startswith("btn-lcd-input-"):
            action = button_id.replace("btn-lcd-input-", "")
            await self.send_lcd_input(action)

        elif button_id.startswith("btn-lcd-encoder-"):
            action = button_id.replace("btn-lcd-encoder-", "")
            if action == "ccw":
                await self.send_lcd_input("encoder_ccw")
            elif action == "cw":
                await self.send_lcd_input("encoder_cw")
            elif action == "press":
                await self.send_lcd_input("encoder_press")

        # NAM/IR Panel buttons
        elif button_id == "btn-activate-nam":
            await self.activate_selected_nam()

        elif button_id == "btn-refresh-nam":
            await self.refresh_nam_models()

        elif button_id == "btn-load-cabinet":
            await self.load_selected_cabinet()

        elif button_id == "btn-upload-cabinet":
            await self.upload_cabinet_ir()

        elif button_id == "btn-refresh-cabinets":
            await self.refresh_cabinet_irs()

        elif button_id == "btn-load-reverb":
            await self.load_selected_reverb()

        elif button_id == "btn-upload-reverb":
            await self.upload_reverb_ir()

        elif button_id == "btn-refresh-reverbs":
            await self.refresh_reverb_irs()

        # Maintenance buttons
        elif button_id == "btn-restart-backend":
            await self.restart_backend()

        elif button_id == "btn-restart-system":
            await self.restart_system()

        elif button_id == "btn-reinstall-branding":
            await self.reinstall_branding()

    async def restart_backend(self) -> None:
        """Restart the backend service."""
        from modals import ConfirmDialog

        confirm = await self.app.push_screen_wait(
            ConfirmDialog(
                "Are you sure you want to restart the backend service?\n\nThe TUI will disconnect temporarily.",
                title="Restart Backend"
            )
        )

        if confirm:
            self.notify("Restarting backend service...", severity="warning")
            result = await self.api_client.restart_backend()
            if result.success:
                self.notify("Backend restart initiated", severity="information")
            else:
                self.notify(f"Failed to restart backend: {result.error}", severity="error")

    async def restart_system(self) -> None:
        """Restart the entire system."""
        from modals import ConfirmDialog

        confirm = await self.app.push_screen_wait(
            ConfirmDialog(
                "Are you sure you want to restart the entire system?\n\nThis will reboot the machine.",
                title="Restart System"
            )
        )

        if confirm:
            self.notify("Initiating system restart...", severity="warning")
            result = await self.api_client.restart_system()
            if result.success:
                self.notify("System restart initiated", severity="information")
            else:
                self.notify(f"Failed to restart system: {result.error}", severity="error")

    async def reinstall_branding(self) -> None:
        """Reinstall boot splash and welcome message."""
        from modals import ConfirmDialog

        confirm = await self.app.push_screen_wait(
            ConfirmDialog(
                "Reinstall branding components?\n\n"
                "This will install/update:\n"
                "  - Plymouth boot splash theme\n"
                "  - Terminal welcome message\n\n"
                "Requires sudo access. Reboot needed for boot splash.",
                title="Reinstall Branding"
            )
        )

        if confirm:
            self.notify("Reinstalling branding (this may take a moment)...", severity="information")
            self.log_action("Reinstalling branding...")

            result = await self.api_client.reinstall_branding()
            if result.success:
                data = result.data if result.data else {}
                message = data.get("message", "Branding reinstalled")
                note = data.get("note", "")
                results = data.get("results", [])

                self.log_success(message)
                for r in results:
                    self.log_action(f"  {r}")

                if note:
                    self.notify(f"{message}. {note}", severity="success", timeout=10)
                else:
                    self.notify(message, severity="success")
            else:
                error = result.error or "Unknown error"
                self.notify(f"Failed to reinstall branding: {error}", severity="error")
                self.log_error(f"Branding reinstall failed: {error}")

    # ==================== LCD Methods ====================

    async def refresh_lcd_status(self) -> None:
        """Refresh LCD status and simulation display."""
        try:
            lcd_panel = self.query_one("#lcd-panel", LCDPanel)

            # Get LCD status
            status_result = await self.api_client.get_lcd_status()
            if status_result.success:
                data = status_result.data
                lcd_panel.update_status(
                    running=data.get("running", False),
                    simulation_mode=data.get("simulation_mode", False),
                    current_page=data.get("current_page", ""),
                    uptime=data.get("uptime_seconds", 0),
                    statistics=data.get("statistics", {})
                )

                # Get simulation output
                sim_result = await self.api_client.get_lcd_simulation()
                if sim_result.success:
                    lines = sim_result.data.get("lines", [])
                    lcd_panel.update_simulation(lines)

                self.notify("LCD status refreshed", severity="information")
            else:
                lcd_panel.set_disconnected()
                self.notify(f"LCD not available: {status_result.error}", severity="warning")

        except Exception as e:
            self.notify(f"Error refreshing LCD: {e}", severity="error")

    async def set_lcd_page(self, page: str) -> None:
        """Set the LCD to a specific page."""
        try:
            result = await self.api_client.set_lcd_page(page)
            if result.success:
                self.notify(f"LCD page changed to {page}", severity="information")
                # Refresh to update the display
                await self.refresh_lcd_status()
            else:
                self.notify(f"Failed to change LCD page: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error setting LCD page: {e}", severity="error")

    async def send_lcd_input(self, action: str) -> None:
        """Send an input action to the LCD."""
        try:
            result = await self.api_client.send_lcd_input(action)
            if result.success:
                # Refresh to show updated display
                await self.refresh_lcd_status()
            else:
                self.notify(f"LCD input failed: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error sending LCD input: {e}", severity="error")

    # ==================== NAM/IR Methods ====================

    async def refresh_nam_models(self) -> None:
        """Refresh the list of available NAM models."""
        try:
            namir_panel = self.query_one("#namir-panel", NAMIRPanel)
            result = await self.api_client.get_nam_models()
            if result.success:
                models = result.data if isinstance(result.data, list) else result.data.get("models", [])
                namir_panel.nam_models = models
                self.log_info(f"Loaded {len(models)} NAM models")

                # Also get current status
                status_result = await self.api_client.get_nam_status()
                if status_result.success:
                    active = status_result.data.get("active_model", "") if status_result.data else ""
                    namir_panel.active_nam = active
            else:
                self.notify(f"Failed to load NAM models: {result.error}", severity="error")
        except Exception as e:
            self.log_error(f"Error refreshing NAM models: {e}")

    async def activate_selected_nam(self) -> None:
        """Activate the selected NAM model."""
        try:
            namir_panel = self.query_one("#namir-panel", NAMIRPanel)
            model_name = namir_panel.get_selected_nam_model()

            if not model_name:
                self.notify("Select a NAM model first", severity="warning")
                return

            self.log_action(f"Activating NAM model: {model_name}")
            result = await self.api_client.activate_nam_model(model_name)
            if result.success:
                namir_panel.active_nam = model_name
                self.notify(f"NAM model activated: {model_name}", severity="success")
                self.log_success(f"NAM model '{model_name}' activated")
            else:
                self.notify(f"Failed to activate NAM: {result.error}", severity="error")
                self.log_error(f"Failed to activate NAM: {result.error}")
        except Exception as e:
            self.notify(f"Error activating NAM: {e}", severity="error")

    async def refresh_cabinet_irs(self) -> None:
        """Refresh the list of available cabinet IRs."""
        try:
            namir_panel = self.query_one("#namir-panel", NAMIRPanel)
            result = await self.api_client.get_cabinet_irs()
            if result.success:
                irs = result.data if isinstance(result.data, list) else result.data.get("irs", [])
                namir_panel.cabinet_irs = irs
                self.log_info(f"Loaded {len(irs)} cabinet IRs")
            else:
                self.notify(f"Failed to load cabinet IRs: {result.error}", severity="error")
        except Exception as e:
            self.log_error(f"Error refreshing cabinet IRs: {e}")

    async def load_selected_cabinet(self) -> None:
        """Load the selected cabinet IR."""
        try:
            namir_panel = self.query_one("#namir-panel", NAMIRPanel)
            ir_name = namir_panel.get_selected_cabinet_ir()

            if not ir_name:
                self.notify("Select a cabinet IR first", severity="warning")
                return

            self.log_action(f"Loading cabinet IR: {ir_name}")
            result = await self.api_client.post(f"/api/ir/cabinets/{ir_name}/load")
            if result.success:
                namir_panel.active_cabinet = ir_name
                self.notify(f"Cabinet IR loaded: {ir_name}", severity="success")
                self.log_success(f"Cabinet IR '{ir_name}' loaded")
            else:
                self.notify(f"Failed to load cabinet IR: {result.error}", severity="error")
                self.log_error(f"Failed to load cabinet IR: {result.error}")
        except Exception as e:
            self.notify(f"Error loading cabinet IR: {e}", severity="error")

    async def upload_cabinet_ir(self) -> None:
        """Upload a cabinet IR file."""
        from modals import InputDialog

        file_path = await self.app.push_screen_wait(
            InputDialog(
                "Enter path to cabinet IR file (.wav, .flac, .aiff):",
                title="Upload Cabinet IR",
                placeholder="/path/to/cabinet.wav",
            )
        )

        if file_path:
            self.log_action(f"Uploading cabinet IR: {file_path}")
            self.notify("Uploading cabinet IR...", severity="information")
            result = await self.api_client.upload_cabinet_ir(file_path)
            if result.success:
                self.notify("Cabinet IR uploaded successfully", severity="success")
                self.log_success(f"Cabinet IR uploaded: {file_path}")
                await self.refresh_cabinet_irs()
            else:
                self.notify(f"Failed to upload: {result.error}", severity="error")
                self.log_error(f"Failed to upload cabinet IR: {result.error}")

    async def refresh_reverb_irs(self) -> None:
        """Refresh the list of available reverb IRs."""
        try:
            namir_panel = self.query_one("#namir-panel", NAMIRPanel)
            result = await self.api_client.get_reverb_irs()
            if result.success:
                irs = result.data if isinstance(result.data, list) else result.data.get("irs", [])
                namir_panel.reverb_irs = irs
                self.log_info(f"Loaded {len(irs)} reverb IRs")
            else:
                self.notify(f"Failed to load reverb IRs: {result.error}", severity="error")
        except Exception as e:
            self.log_error(f"Error refreshing reverb IRs: {e}")

    async def load_selected_reverb(self) -> None:
        """Load the selected reverb IR."""
        try:
            namir_panel = self.query_one("#namir-panel", NAMIRPanel)
            ir_name = namir_panel.get_selected_reverb_ir()

            if not ir_name:
                self.notify("Select a reverb IR first", severity="warning")
                return

            self.log_action(f"Loading reverb IR: {ir_name}")
            result = await self.api_client.post(f"/api/ir/reverbs/{ir_name}/load")
            if result.success:
                namir_panel.active_reverb = ir_name
                self.notify(f"Reverb IR loaded: {ir_name}", severity="success")
                self.log_success(f"Reverb IR '{ir_name}' loaded")
            else:
                self.notify(f"Failed to load reverb IR: {result.error}", severity="error")
                self.log_error(f"Failed to load reverb IR: {result.error}")
        except Exception as e:
            self.notify(f"Error loading reverb IR: {e}", severity="error")

    async def upload_reverb_ir(self) -> None:
        """Upload a reverb IR file."""
        from modals import InputDialog

        file_path = await self.app.push_screen_wait(
            InputDialog(
                "Enter path to reverb IR file (.wav, .flac, .aiff):",
                title="Upload Reverb IR",
                placeholder="/path/to/reverb.wav",
            )
        )

        if file_path:
            self.log_action(f"Uploading reverb IR: {file_path}")
            self.notify("Uploading reverb IR...", severity="information")
            result = await self.api_client.upload_reverb_ir(file_path)
            if result.success:
                self.notify("Reverb IR uploaded successfully", severity="success")
                self.log_success(f"Reverb IR uploaded: {file_path}")
                await self.refresh_reverb_irs()
            else:
                self.notify(f"Failed to upload: {result.error}", severity="error")
                self.log_error(f"Failed to upload reverb IR: {result.error}")

    async def refresh_all_namir(self) -> None:
        """Refresh all NAM models and IRs."""
        await self.refresh_nam_models()
        await self.refresh_cabinet_irs()
        await self.refresh_reverb_irs()

    # ==================== Real-Time System Status ====================

    async def refresh_rt_status(self) -> None:
        """Refresh real-time audio system status."""
        try:
            settings_panel = self.query_one("#settings-panel", MetricsTab)
            result = await self.api_client.get_realtime_status()
            if result.success:
                settings_panel.update_rt_status(result.data)
                summary = result.data.get("summary", {})
                grade = summary.get("grade", "?")
                passed = summary.get("passed", 0)
                warnings = summary.get("warnings", 0)
                failed = summary.get("failed", 0)
                self.notify(
                    f"RT Status: Grade {grade} ({passed} passed, {warnings} warnings, {failed} failed)",
                    severity="information"
                )
            else:
                self.notify(f"Failed to check RT status: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error checking RT status: {e}", severity="error")

    async def create_chain(self) -> None:
        """Create a new chain via input dialog."""
        from datetime import datetime

        # Fix 4: Get existing chain names for duplicate validation
        existing_names = {chain.get("name", "").lower() for chain in self.chains}

        def validate_chain_name(name: str) -> Optional[str]:
            if not name:
                return "Chain name is required"
            if len(name) > 256:
                return "Chain name must be 256 characters or less"
            # Fix 4: Check for duplicate names (case-insensitive)
            if name.lower() in existing_names:
                return f"A chain named '{name}' already exists"
            return None

        # Generate default name with current date/time using underscores
        default_name = datetime.now().strftime("Chain_%Y_%m_%d_%H_%M")

        result = await self.app.push_screen_wait(
            InputDialog(
                "Enter chain name:",
                title="Create New Chain",
                default_value=default_name,
                placeholder="My Chain",
                max_length=256,
                validator=validate_chain_name
            )
        )

        if result:
            self.log_action(f"Creating chain '{result}'...")
            try:
                api_result = await self.api_client.create_chain(result)
                if api_result.success:
                    self.notify(f"Created chain: {result}", severity="success")
                    self.log_success(f"Chain '{result}' created")
                    await self.refresh_chains()
                    # Fix 3: Improved auto-selection with flexible API response handling
                    new_chain_id = self._extract_chain_id(api_result.data)
                    if new_chain_id:
                        await self.load_chain(new_chain_id)
                    else:
                        # Fallback: find the chain by name in the refreshed list
                        new_chain_id = self._find_chain_id_by_name(result)
                        if new_chain_id:
                            await self.load_chain(new_chain_id)
                else:
                    self.notify(f"Failed to create chain: {api_result.error}", severity="error")
                    self.log_error(f"Failed to create chain: {api_result.error}")
            except Exception as e:
                self.notify(f"Error creating chain: {e}", severity="error")
                self.log_error(f"Error creating chain: {e}")

    async def activate_chain(self) -> None:
        """Activate selected chain (deactivates all other chains)."""
        if self.selected_chain_id == 0:
            self.notify("No chain selected", severity="warning")
            return

        # Check if another chain is already active
        # Backend enforces single-active-chain by deactivating all others
        active_chain_name = None
        for chain in self.chains:
            if chain.get("is_active", False) and chain.get("id") != self.selected_chain_id:
                active_chain_name = chain.get("name", f"Chain {chain.get('id')}")
                break

        if active_chain_name:
            self.notify(
                f"Switching to chain {self.selected_chain_id} (will deactivate '{active_chain_name}')",
                severity="information"
            )

        self.log_action(f"Activating chain {self.selected_chain_id}...")
        try:
            result = await self.api_client.activate_chain(self.selected_chain_id)
            if result.success:
                self.notify("Chain activated", severity="success")
                self.log_success(f"Chain {self.selected_chain_id} activated")
                await self.refresh_chains()
        except Exception as e:
            self.notify(f"Error activating chain: {e}", severity="error")
            self.log_error(f"Error activating chain: {e}")

    async def deactivate_chain(self) -> None:
        """Deactivate selected chain."""
        if self.selected_chain_id == 0:
            self.notify("No chain selected", severity="warning")
            return

        self.log_action(f"Deactivating chain {self.selected_chain_id}...")
        try:
            result = await self.api_client.deactivate_chain(self.selected_chain_id)
            if result.success:
                self.notify("Chain deactivated", severity="success")
                self.log_success(f"Chain {self.selected_chain_id} deactivated")
                await self.refresh_chains()
        except Exception as e:
            self.notify(f"Error deactivating chain: {e}", severity="error")
            self.log_error(f"Error deactivating chain: {e}")

    async def delete_chain(self) -> None:
        """Delete selected chain with confirmation."""
        if self.selected_chain_id == 0:
            self.notify("No chain selected", severity="warning")
            return

        # Find chain name for confirmation message
        chain_name = "Unknown"
        for chain in self.chains:
            if chain.get("id") == self.selected_chain_id:
                chain_name = chain.get("name", "Unknown")
                break

        confirmed = await self.app.push_screen_wait(
            ConfirmDialog(
                f"Are you sure you want to delete '{chain_name}'?\n\nThis action cannot be undone.",
                title="Delete Chain"
            )
        )

        if confirmed:
            self.log_action(f"Deleting chain '{chain_name}'...")
            try:
                result = await self.api_client.delete_chain(self.selected_chain_id)
                if result.success:
                    self.notify(f"Deleted chain: {chain_name}", severity="success")
                    self.log_success(f"Chain '{chain_name}' deleted")
                    self.selected_chain_id = 0
                    # Clear pedalboard view
                    pedalboard = self.query_one("#pedalboard-view", PedalboardView)
                    pedalboard.chain_id = 0
                    pedalboard.chain_name = ""
                    pedalboard.plugins = []
                    await self.refresh_chains()
                else:
                    self.notify(f"Failed to delete chain: {result.error}", severity="error")
                    self.log_error(f"Failed to delete chain: {result.error}")
            except Exception as e:
                self.notify(f"Error deleting chain: {e}", severity="error")
                self.log_error(f"Error deleting chain: {e}")

    async def rename_chain(self) -> None:
        """Rename selected chain."""
        if self.selected_chain_id == 0:
            self.notify("No chain selected", severity="warning")
            return

        # Find current chain name
        current_name = "Unknown"
        for chain in self.chains:
            if chain.get("id") == self.selected_chain_id:
                current_name = chain.get("name", "Unknown")
                break

        result = await self.app.push_screen_wait(
            InputDialog(
                "Enter new chain name:",
                title="Rename Chain",
                default_value=current_name,
                max_length=256
            )
        )

        if result and result != current_name:
            try:
                api_result = await self.api_client.rename_chain(self.selected_chain_id, result)
                if api_result.success:
                    self.notify(f"Renamed chain to: {result}", severity="success")
                    # Update pedalboard view title
                    pedalboard = self.query_one("#pedalboard-view", PedalboardView)
                    pedalboard.chain_name = result
                    # Refresh chains list
                    await self.refresh_chains()
                else:
                    self.notify(f"Failed to rename chain: {api_result.error}", severity="error")
            except Exception as e:
                self.notify(f"Error renaming chain: {e}", severity="error")

    async def load_demo_pedalboard(self) -> None:
        """Load a demo pedalboard from templates."""
        try:
            # Get list of available templates
            result = await self.api_client.list_templates()
            if not result.success:
                self.notify(f"Failed to load templates: {result.error}", severity="error")
                return

            templates = result.data.get("templates", []) if isinstance(result.data, dict) else []
            if not templates:
                self.notify("No demo templates available", severity="warning")
                return

            # Build options for selection dialog: (template_name, display_label)
            template_options = [
                (
                    template.get("name", "Unknown"),
                    f"{template.get('name', 'Unknown')} ({template.get('plugin_count', 0)} plugins)"
                )
                for template in templates
            ]

            # Show template selection dialog
            selected_template = await self.app.push_screen_wait(
                SelectDialog(
                    template_options,
                    title="Load Demo Pedalboard",
                    message="Select a demo template to load:"
                )
            )

            if selected_template:
                # Load the selected template
                load_result = await self.api_client.load_template(selected_template)
                if load_result.success:
                    chain_data = load_result.data.get("chain", {}) if isinstance(load_result.data, dict) else {}
                    chain_id = chain_data.get("id")
                    chain_name = chain_data.get("name", selected_template)

                    self.notify(f"Loaded demo: {chain_name}", severity="success")
                    await self.refresh_chains()

                    # Auto-select and load the new chain
                    if chain_id:
                        await self.load_chain(chain_id)
                else:
                    self.notify(f"Failed to load demo: {load_result.error}", severity="error")

        except Exception as e:
            self.notify(f"Error loading demo: {e}", severity="error")

    async def add_plugin_to_chain(self) -> None:
        """Add selected plugin to active chain."""
        if self.selected_chain_id == 0:
            self.notify("No chain selected", severity="warning")
            return

        # Get selected plugin from browser panel
        plugin_browser = self.query_one("#plugin-browser", PluginBrowserPanel)

        # Get URI from the currently highlighted option in the list
        plugin_uri = plugin_browser.selected_plugin_uri
        plugin_name = "Unknown"

        if not plugin_uri:
            # Fallback: get from option list directly
            try:
                plugin_list = plugin_browser.query_one("#plugin-list", OptionList)
                highlighted_idx = plugin_list.highlighted
                if highlighted_idx is not None and 0 <= highlighted_idx < len(plugin_browser.filtered_plugins):
                    plugin = plugin_browser.filtered_plugins[highlighted_idx]
                    plugin_uri = plugin.get("uri", "")
                    plugin_name = plugin.get("name", "Unknown")
            except Exception as e:
                self.log_error(f"Error getting plugin: {e}")

        if not plugin_uri:
            self.notify("No plugin selected - please select a plugin from the list", severity="warning")
            return

        # Find plugin name for notification if not already set
        if plugin_name == "Unknown":
            plugin = next((p for p in plugin_browser.all_plugins if p.get("uri") == plugin_uri), None)
            plugin_name = plugin.get("name", "Plugin") if plugin else "Plugin"

        self.log_action(f"Adding plugin '{plugin_name}' (URI: {plugin_uri[:50]}...) to chain...")
        try:
            result = await self.api_client.add_plugin_to_chain(
                self.selected_chain_id,
                plugin_uri
            )
            if result.success:
                self.notify(f"Added '{plugin_name}' to chain", severity="success")
                self.log_success(f"Plugin '{plugin_name}' added to chain")
                # Track in recent plugins
                plugin_browser.add_to_recent(plugin_uri)
                await self.load_chain(self.selected_chain_id)
            else:
                self.notify(f"Failed to add plugin: {result.error}", severity="error")
                self.log_error(f"Failed to add plugin: {result.error}")
        except Exception as e:
            self.notify(f"Error adding plugin: {e}", severity="error")
            self.log_error(f"Error adding plugin: {e}")

    async def remove_selected_effect(self) -> None:
        """Remove the currently selected effect from the chain."""
        if self.selected_chain_id == 0:
            self.notify("No chain selected", severity="warning")
            return

        if not self.selected_plugin_uri:
            self.notify("No effect selected", severity="warning")
            return

        confirmed = await self.app.push_screen_wait(
            ConfirmDialog(
                f"Remove this effect from the chain?",
                title="Remove Effect"
            )
        )

        if confirmed:
            try:
                result = await self.api_client.remove_plugin_from_chain(
                    self.selected_chain_id,
                    self.selected_plugin_uri
                )
                if result.success:
                    self.notify("Effect removed", severity="information")
                    self.selected_plugin_uri = ""
                    await self.load_chain(self.selected_chain_id)
                else:
                    self.notify(f"Failed to remove effect: {result.error}", severity="error")
            except Exception as e:
                self.notify(f"Error removing effect: {e}", severity="error")

    async def move_selected_effect(self, direction: str) -> None:
        """Move the currently selected effect up or down in the chain."""
        if self.selected_chain_id == 0:
            self.notify("No chain selected", severity="warning")
            return

        if not self.selected_plugin_uri:
            self.notify("No effect selected", severity="warning")
            return

        try:
            # Find current position of the plugin
            signal_chain = self.query_one("#signal-chain-panel", SignalChainPanel)
            plugin_uris = [p.get("uri") for p in signal_chain.plugins]

            if self.selected_plugin_uri not in plugin_uris:
                self.notify("Effect not found in chain", severity="error")
                return

            current_pos = plugin_uris.index(self.selected_plugin_uri)

            # Calculate new position
            if direction == "up":
                new_pos = max(0, current_pos - 1)
            else:
                new_pos = min(len(plugin_uris) - 1, current_pos + 1)

            if new_pos == current_pos:
                self.notify(f"Already at {direction}most position", severity="information")
                return

            # Reorder the list by moving the plugin to new position
            plugin_uris.pop(current_pos)
            plugin_uris.insert(new_pos, self.selected_plugin_uri)

            result = await self.api_client.reorder_plugins(
                self.selected_chain_id,
                plugin_uris
            )
            if result.success:
                self.notify(f"Effect moved {direction}", severity="information")
                await self.load_chain(self.selected_chain_id)
            else:
                self.notify(f"Failed to move effect: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error moving effect: {e}", severity="error")

    async def bypass_selected_effect(self) -> None:
        """Toggle bypass on the currently selected effect."""
        if self.selected_chain_id == 0:
            self.notify("No chain selected", severity="warning")
            return

        if not self.selected_plugin_uri:
            self.notify("No effect selected", severity="warning")
            return

        try:
            # Get current bypass state from signal chain panel
            signal_chain = self.query_one("#signal-chain-panel", SignalChainPanel)
            current_plugin = None
            for plugin in signal_chain.plugins:
                if plugin.get("uri") == self.selected_plugin_uri:
                    current_plugin = plugin
                    break

            if current_plugin:
                new_bypass_state = not current_plugin.get("bypass", False)
                result = await self.api_client.toggle_plugin_bypass(
                    self.selected_chain_id,
                    self.selected_plugin_uri,
                    new_bypass_state
                )
                if result.success:
                    status = "bypassed" if new_bypass_state else "active"
                    self.notify(f"Effect {status}", severity="information")
                    await self.load_chain(self.selected_chain_id)
                else:
                    self.notify(f"Failed to toggle bypass: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error toggling bypass: {e}", severity="error")

    async def on_effect_block_selected(self, message: EffectBlock.Selected) -> None:
        """Handle effect block selection."""
        self.selected_plugin_uri = message.plugin_uri
        await self.load_plugin_parameters(message.plugin_uri, message.plugin_name)

    async def on_empty_slot_clicked(self, message: EmptySlot.Clicked) -> None:
        """Handle empty slot click - focus plugin browser."""
        if self.selected_chain_id == 0:
            self.notify("Select a chain first", severity="warning")
            return
        # Switch to Plugins tab and focus search
        try:
            tabs = self.query_one("#tools-tabs", TabbedContent)
            tabs.active = "tab-plugins"
            plugin_search = self.query_one("#plugin-search", Input)
            plugin_search.focus()
            self.notify("Select a plugin to add to your chain", severity="information")
        except Exception as e:
            # Log error but don't crash - UI tab switching is non-critical
            self.notify(f"Could not focus plugin browser: {e}", severity="warning")

    async def on_effect_block_bypass_toggled(self, message: EffectBlock.BypassToggled) -> None:
        """Handle bypass toggle from effect block."""
        try:
            result = await self.api_client.toggle_plugin_bypass(
                message.chain_id,
                message.plugin_uri,
                message.bypassed
            )
            if result.success:
                state = "bypassed" if message.bypassed else "enabled"
                self.notify(f"{message.plugin_name} {state}", severity="information")
                self.log_info(f"Plugin '{message.plugin_name}' {state}")
            else:
                self.notify(f"Failed to toggle bypass: {result.error}", severity="error")
                self.log_error(f"Failed to toggle bypass: {result.error}")
        except Exception as e:
            self.notify(f"Error toggling bypass: {e}", severity="error")
            self.log_error(f"Error toggling bypass: {e}")

    async def on_effect_block_remove_requested(self, message: EffectBlock.RemoveRequested) -> None:
        """Handle plugin removal request from effect block."""
        confirmed = await self.app.push_screen_wait(
            ConfirmDialog(
                f"Remove '{message.plugin_name}' from chain?",
                title="Remove Plugin"
            )
        )

        if confirmed:
            self.log_action(f"Removing plugin '{message.plugin_name}'...")
            try:
                result = await self.api_client.remove_plugin_from_chain(
                    message.chain_id,
                    message.plugin_uri
                )
                if result.success:
                    self.notify(f"Removed {message.plugin_name}", severity="success")
                    self.log_success(f"Plugin '{message.plugin_name}' removed")
                    # Reload the chain to reflect changes
                    await self.load_chain(message.chain_id)
                else:
                    self.notify(f"Failed to remove plugin: {result.error}", severity="error")
                    self.log_error(f"Failed to remove plugin: {result.error}")
            except Exception as e:
                self.notify(f"Error removing plugin: {e}", severity="error")
                self.log_error(f"Error removing plugin: {e}")

    async def on_effect_block_move_requested(self, message: EffectBlock.MoveRequested) -> None:
        """Handle plugin move request from effect block."""
        # Get current plugin positions from pedalboard
        pedalboard = self.query_one("#pedalboard-view", PedalboardView)
        plugins = pedalboard.plugins

        # Find current position
        current_pos = -1
        for i, plugin in enumerate(plugins):
            if plugin.get("uri") == message.plugin_uri:
                current_pos = i
                break

        if current_pos == -1:
            self.notify("Plugin not found in chain", severity="error")
            return

        # Calculate new position
        if message.direction == "left":
            new_pos = current_pos - 1
            if new_pos < 0:
                self.notify("Plugin is already at the start", severity="warning")
                return
        else:  # right
            new_pos = current_pos + 1
            if new_pos >= len(plugins):
                self.notify("Plugin is already at the end", severity="warning")
                return

        try:
            result = await self.api_client.move_plugin_in_chain(
                message.chain_id,
                message.plugin_uri,
                new_pos
            )
            if result.success:
                self.notify(f"Moved {message.plugin_name}", severity="success")
                # Reload the chain to reflect changes
                await self.load_chain(message.chain_id)
            else:
                self.notify(f"Failed to move plugin: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error moving plugin: {e}", severity="error")

    async def load_plugin_parameters(self, plugin_uri: str, plugin_name: str) -> None:
        """Load parameters for selected plugin."""
        try:
            result = await self.api_client.get_plugin_parameters(
                self.selected_chain_id,
                plugin_uri
            )
            if result.success:
                data = result.data
                parameters = data.get("parameters", []) if isinstance(data, dict) else []

                # Update parameter panel
                param_panel = self.query_one("#parameter-panel", ParameterPanel)
                param_panel.plugin_uri = plugin_uri
                param_panel.plugin_name = plugin_name
                param_panel.update_parameters(parameters)

                # Update extended parameter panel with quick controls
                try:
                    ext_param_panel = self.query_one("#extended-params", ExtendedParameterPanel)
                    ext_param_panel.update_quick_controls(parameters, plugin_name)
                except Exception:
                    pass  # Panel may not exist

                self.notify(f"Loaded {len(parameters)} parameters", severity="information")
        except Exception as e:
            self.notify(f"Error loading parameters: {e}", severity="error")

    @work
    async def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        """Handle parameter table row selection for LV2-aware editing."""
        param_symbol = event.row_key.value if hasattr(event.row_key, 'value') else str(event.row_key)
        param_panel = self.query_one("#parameter-panel", ParameterPanel)

        # Get full parameter info from stored data
        param_info = param_panel.get_parameter_info(param_symbol)
        if not param_info:
            self.notify("Parameter info not found", severity="error")
            return

        param_name = param_info.get("name", param_symbol)
        current_value = param_info.get("value", param_info.get("default", 0))
        min_val = param_info.get("min", param_info.get("minimum", 0))
        max_val = param_info.get("max", param_info.get("maximum", 1))
        default_val = param_info.get("default", current_value)

        # Check LV2 parameter types
        is_toggle = param_info.get("is_toggle", param_info.get("toggled", False))
        is_integer = param_info.get("is_integer", param_info.get("integer", False))
        scale_points = param_info.get("scale_points", param_info.get("scalePoints", []))

        new_value = None

        try:
            if is_toggle:
                # Toggle parameter - use confirm dialog
                current_state = "ON" if current_value > 0.5 else "OFF"
                confirmed = await self.app.push_screen_wait(
                    ConfirmDialog(
                        f"Toggle '{param_name}'?\n\nCurrent: {current_state}",
                        title="Toggle Parameter"
                    )
                )
                if confirmed:
                    new_value = 0.0 if current_value > 0.5 else 1.0

            elif scale_points:
                # Enum parameter - use selection dialog
                options = [
                    (str(sp.get("value", sp.get("Value", i))),
                     sp.get("label", sp.get("Label", f"Option {i}")))
                    for i, sp in enumerate(scale_points)
                ]

                selected = await self.app.push_screen_wait(
                    SelectDialog(
                        options,
                        title=f"Set {param_name}",
                        message=f"Select value for {param_name}:"
                    )
                )

                if selected is not None:
                    new_value = float(selected)

            else:
                # Numeric parameter - use number input
                from modals import NumberInputDialog

                # Add reset to default option
                dialog_msg = f"Set {param_name}:"
                if default_val != current_value:
                    dialog_msg += f"\n(Default: {default_val:.2f})"

                input_value = await self.app.push_screen_wait(
                    NumberInputDialog(
                        dialog_msg,
                        title="Edit Parameter",
                        min_value=float(min_val),
                        max_value=float(max_val),
                        default=float(current_value)
                    )
                )

                if input_value is not None:
                    new_value = int(input_value) if is_integer else input_value

            # Apply new value if set
            if new_value is not None:
                result = await self.api_client.set_plugin_parameter(
                    self.selected_chain_id,
                    param_panel.plugin_uri,
                    param_symbol,
                    new_value
                )
                if result.success:
                    if is_toggle:
                        display = "ON" if new_value > 0.5 else "OFF"
                        self.notify(f"Set {param_name} = {display}", severity="success")
                    elif is_integer:
                        self.notify(f"Set {param_name} = {int(new_value)}", severity="success")
                    else:
                        self.notify(f"Set {param_name} = {new_value:.2f}", severity="success")
                    # Reload parameters
                    await self.load_plugin_parameters(param_panel.plugin_uri, param_panel.plugin_name)
                else:
                    self.notify(f"Failed to set parameter: {result.error}", severity="error")

        except ValueError:
            self.notify("Invalid parameter value", severity="error")
        except Exception as e:
            self.notify(f"Error editing parameter: {e}", severity="error")

    async def show_plugin_info(self) -> None:
        """Show detailed info for selected plugin from the browser panel."""
        # Get selected plugin from browser panel
        plugin_browser = self.query_one("#plugin-browser", PluginBrowserPanel)
        plugin_uri = plugin_browser.selected_plugin_uri

        if not plugin_uri:
            self.notify("No plugin selected", severity="warning")
            return

        try:
            result = await self.api_client.get_plugin_info(plugin_uri)
            if result.success:
                plugin = result.data
                name = plugin.get("name", "Unknown")
                author = plugin.get("author_name", plugin.get("author", "Unknown"))
                brand = plugin.get("brand", "")
                category = plugin.get("plugin_type", plugin.get("category", "Unknown"))
                uri = plugin.get("uri", plugin_uri)
                ports = plugin.get("ports", [])

                # Count port types
                audio_in = sum(1 for p in ports if p.get("is_audio") and p.get("is_input"))
                audio_out = sum(1 for p in ports if p.get("is_audio") and not p.get("is_input"))
                control_in = sum(1 for p in ports if p.get("is_control_port") and p.get("is_input"))

                # Build info with PiPedal-style details
                info_lines = [
                    f"Name: {name}",
                    f"Author: {author}",
                ]
                if brand:
                    info_lines.append(f"Brand: {brand}")
                info_lines.extend([
                    f"Category: {category}",
                    f"",
                    f"Audio Ports: {audio_in} in / {audio_out} out",
                    f"Parameters: {control_in}",
                    f"",
                    f"URI: {uri[:60]}{'...' if len(uri) > 60 else ''}"
                ])

                from modals import MessageDialog
                await self.app.push_screen_wait(
                    MessageDialog("\n".join(info_lines), title="Plugin Information")
                )
            else:
                self.notify(f"Failed to get plugin info: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error getting plugin info: {e}", severity="error")

    async def save_param_preset(self) -> None:
        """Save current chain as preset."""
        if self.selected_chain_id == 0:
            self.notify("No chain selected", severity="warning")
            return

        result = await self.app.push_screen_wait(
            InputDialog(
                "Enter preset name:",
                title="Save Preset",
                placeholder="My Preset",
                max_length=256
            )
        )

        if result:
            try:
                api_result = await self.api_client.save_chain_preset(self.selected_chain_id, result)
                if api_result.success:
                    self.notify(f"Saved preset: {result}", severity="success")
                else:
                    self.notify(f"Failed to save preset: {api_result.error}", severity="error")
            except Exception as e:
                self.notify(f"Error saving preset: {e}", severity="error")

    async def load_param_preset(self) -> None:
        """Load a chain preset."""
        try:
            result = await self.api_client.list_chain_presets()
            if result.success:
                data = result.data
                presets = data.get("presets", []) if isinstance(data, dict) else []

                if not presets:
                    self.notify("No presets available", severity="warning")
                    return

                # Build options for selection dialog: (preset_id, display_label)
                preset_options = [
                    (str(p.get("id", i)), f"{p.get('name', 'Unknown')} ({p.get('chain_name', 'No chain')})")
                    for i, p in enumerate(presets)
                ]

                selected_preset_id = await self.app.push_screen_wait(
                    SelectDialog(
                        preset_options,
                        title="Load Preset",
                        message="Select a preset to load:"
                    )
                )

                if selected_preset_id:
                    # Load the selected preset
                    load_result = await self.api_client.load_chain_preset(int(selected_preset_id))
                    if load_result.success:
                        # Find the preset name for notification
                        preset_name = next(
                            (p.get("name", "Preset") for p in presets if str(p.get("id")) == selected_preset_id),
                            "Preset"
                        )
                        self.notify(f"Loaded preset: {preset_name}", severity="success")
                        await self.refresh_chains()
                        # If a new chain was created, load it
                        if load_result.data and isinstance(load_result.data, dict):
                            new_chain_id = load_result.data.get("chain_id") or load_result.data.get("id")
                            if new_chain_id:
                                await self.load_chain(new_chain_id)
                    else:
                        self.notify(f"Failed to load preset: {load_result.error}", severity="error")
            else:
                self.notify(f"Failed to list presets: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error loading presets: {e}", severity="error")

    async def reset_params(self) -> None:
        """Reset parameters to default values."""
        param_panel = self.query_one("#parameter-panel", ParameterPanel)
        if not param_panel.plugin_uri:
            self.notify("No plugin selected", severity="warning")
            return

        confirmed = await self.app.push_screen_wait(
            ConfirmDialog(
                f"Reset all parameters for {param_panel.plugin_name} to defaults?",
                title="Reset Parameters"
            )
        )

        if confirmed:
            # Reload parameters (they will show default values)
            await self.load_plugin_parameters(param_panel.plugin_uri, param_panel.plugin_name)
            self.notify("Parameters reset to defaults", severity="information")

    # ==================== PRESET MANAGEMENT ====================

    async def select_preset(self, preset_id: int) -> None:
        """Handle preset selection in the preset list."""
        preset_panel = self.query_one("#presets-panel", PresetManagementPanel)
        preset_panel.selected_preset_id = preset_id

        # Find the preset in the list and update info
        for preset in preset_panel.presets:
            if preset.get("id") == preset_id:
                preset_panel.update_preset_info(preset)
                break

    async def load_selected_preset(self) -> None:
        """Load the currently selected preset from the preset panel."""
        preset_panel = self.query_one("#presets-panel", PresetManagementPanel)

        if preset_panel.selected_preset_id == 0:
            self.notify("No preset selected", severity="warning")
            return

        try:
            load_result = await self.api_client.load_chain_preset(preset_panel.selected_preset_id)
            if load_result.success:
                # Find preset name
                preset_name = next(
                    (p.get("name", "Preset") for p in preset_panel.presets
                     if p.get("id") == preset_panel.selected_preset_id),
                    "Preset"
                )
                self.notify(f"Loaded preset: {preset_name}", severity="success")
                await self.refresh_chains()
                # Load the new/updated chain
                if load_result.data and isinstance(load_result.data, dict):
                    new_chain_id = load_result.data.get("chain_id") or load_result.data.get("id")
                    if new_chain_id:
                        await self.load_chain(new_chain_id)
            else:
                self.notify(f"Failed to load preset: {load_result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error loading preset: {e}", severity="error")

    async def save_chain_as_preset(self) -> None:
        """Save the current chain as a new preset."""
        if self.selected_chain_id == 0:
            self.notify("No chain selected", severity="warning")
            return

        result = await self.app.push_screen_wait(
            InputDialog(
                "Enter preset name:",
                title="Save as Preset",
                placeholder="My Preset",
                max_length=256
            )
        )

        if result:
            try:
                api_result = await self.api_client.save_chain_preset(self.selected_chain_id, result)
                if api_result.success:
                    self.notify(f"Saved preset: {result}", severity="success")
                    await self.refresh_presets()
                else:
                    self.notify(f"Failed to save preset: {api_result.error}", severity="error")
            except Exception as e:
                self.notify(f"Error saving preset: {e}", severity="error")

    async def rename_preset(self) -> None:
        """Rename the selected preset."""
        preset_panel = self.query_one("#presets-panel", PresetManagementPanel)

        if preset_panel.selected_preset_id == 0:
            self.notify("No preset selected", severity="warning")
            return

        # Get current name
        current_name = next(
            (p.get("name", "") for p in preset_panel.presets
             if p.get("id") == preset_panel.selected_preset_id),
            ""
        )

        result = await self.app.push_screen_wait(
            InputDialog(
                "Enter new preset name:",
                title="Rename Preset",
                default_value=current_name,
                max_length=256
            )
        )

        if result and result != current_name:
            try:
                # Use the PATCH /api/presets/{id} endpoint to rename
                api_result = await self.api_client.update_preset(
                    preset_panel.selected_preset_id,
                    name=result
                )
                if api_result.get("status") == "success":
                    self.notify(f"Preset renamed to '{result}'", severity="information")
                    # Refresh preset list
                    await self._refresh_presets()
                else:
                    self.notify("Failed to rename preset", severity="error")
            except Exception as e:
                self.notify(f"Error renaming preset: {e}", severity="error")

    async def delete_preset(self) -> None:
        """Delete the selected preset."""
        preset_panel = self.query_one("#presets-panel", PresetManagementPanel)

        if preset_panel.selected_preset_id == 0:
            self.notify("No preset selected", severity="warning")
            return

        # Get preset name for confirmation
        preset_name = next(
            (p.get("name", "Unknown") for p in preset_panel.presets
             if p.get("id") == preset_panel.selected_preset_id),
            "Unknown"
        )

        confirmed = await self.app.push_screen_wait(
            ConfirmDialog(
                f"Are you sure you want to delete preset '{preset_name}'?\n\nThis action cannot be undone.",
                title="Delete Preset"
            )
        )

        if confirmed:
            try:
                result = await self.api_client.delete_chain_preset(preset_panel.selected_preset_id)
                if result.success:
                    self.notify(f"Deleted preset: {preset_name}", severity="success")
                    preset_panel.selected_preset_id = 0
                    preset_panel.update_preset_info({})
                    await self.refresh_presets()
                else:
                    self.notify(f"Failed to delete preset: {result.error}", severity="error")
            except Exception as e:
                self.notify(f"Error deleting preset: {e}", severity="error")

    # ==================== PIPEDAL ENGINE CONTROLS ====================

    async def refresh_pipedal_status(self) -> None:
        """Refresh PiPedal engine status and update settings panel and status banner."""
        settings_panel = self.query_one("#settings-panel", MetricsTab)
        status_banner = self.query_one("#status-banner", StatusBanner)

        # Variables to collect for status banner
        audio_running = False
        midi_enabled = False
        sample_rate = 48000
        buffer_size = 256
        underruns = 0
        cpu_load = 0.0
        version = "Unknown"
        pedalboard = "None"
        alsa_device = "default"
        cpu_percent = 0.0
        memory_mb = 0.0
        loaded_plugins = 0
        total_plugins = 0
        midi_mappings = 0

        try:
            # Get audio status
            audio_result = await self.api_client.get_audio_status()
            if audio_result.success:
                data = audio_result.data
                audio_running = data.get("running", False)
                sample_rate = data.get("sample_rate", 48000)
                buffer_size = data.get("buffer_size", 256)
                alsa_device = data.get("alsa_device", data.get("device", "default"))
                # Calculate latency: (buffer_size / sample_rate) * 1000 ms
                latency = (buffer_size / sample_rate) * 1000
                settings_panel.update_audio_status(audio_running, sample_rate, buffer_size, latency, alsa_device)

                # Update signal chain panel with audio device info
                try:
                    signal_chain = self.query_one("#signal-chain-panel", SignalChainPanel)
                    signal_chain.set_audio_devices(alsa_device)
                except Exception:
                    pass

            # Get PiPedal metrics (CPU, underruns)
            metrics_result = await self.api_client.get_audio_pipedal_metrics()
            if metrics_result.success:
                data = metrics_result.data
                cpu_load = data.get("cpu_load", 0.0)
                underruns = data.get("underruns", 0)
                version = data.get("version", "Unknown")
                midi_enabled = data.get("midi_enabled", False)
                midi_device = data.get("midi_device", None)
                pedalboard = data.get("active_pedalboard", "None")
                loaded_plugins = data.get("loaded_plugins", 0)
                total_plugins = data.get("plugin_count", 0)
                settings_panel.update_performance(cpu_load, underruns)
                settings_panel.update_version(version)
                settings_panel.update_midi_status(midi_enabled)
                if midi_device:
                    settings_panel.update_midi_device(midi_device)

            # Get current snapshot
            snapshot_result = await self.api_client.get_current_snapshot()
            if snapshot_result.success:
                snapshot_id = snapshot_result.data.get("snapshot_id", 0)
                settings_panel.update_snapshot(snapshot_id)

            # Get system health metrics (CPU, memory)
            health_result = await self.api_client.get_health()
            if health_result.success:
                health = health_result.data
                cpu_percent = health.get("cpu_percent", health.get("cpu", 0.0))
                memory_mb = health.get("memory_mb", health.get("memory", 0.0))

            # Get MIDI mappings count
            mappings_result = await self.api_client.list_midi_mappings()
            if mappings_result.success:
                data = mappings_result.data
                if isinstance(data, dict):
                    midi_mappings = len(data.get("mappings", []))

            # Update Status Banner with all collected metrics
            status_banner.update_system_status(
                backend=True,
                audio=audio_running,
                midi=midi_enabled
            )
            status_banner.update_pipedal_info(
                version=version,
                pedalboard=pedalboard,
                device=alsa_device
            )
            status_banner.update_audio_info(
                sample_rate=sample_rate,
                buffer_size=buffer_size,
                underruns=underruns
            )
            status_banner.update_performance(
                cpu_percent=cpu_percent,
                dsp_load=cpu_load,
                memory_mb=memory_mb
            )
            # Calculate actual plugins loaded in chains
            actual_loaded_plugins = sum(
                len(chain.get("plugins", []))
                for chain in self.chains
            )
            # Use the higher of API-reported or chain-calculated plugins
            effective_loaded = max(loaded_plugins, actual_loaded_plugins)

            status_banner.update_statistics(
                chains=len(self.chains),
                active=sum(1 for c in self.chains if c.get("is_active", False)),
                loaded=effective_loaded,
                total=total_plugins,
                midi_maps=midi_mappings
            )
            # Update engine control button states
            status_banner.update_engine_buttons(audio_running)

        except Exception as e:
            self.notify(f"Error refreshing status: {e}", severity="error")
            # Mark backend as error in status banner
            status_banner.update_system_status(backend=False, audio=False, midi=False)
            status_banner.update_engine_buttons(False)

    async def start_audio(self) -> None:
        """Start PiPedal audio processing."""
        self.log_action("Starting audio engine...")
        try:
            result = await self.api_client.start_audio()
            if result.success:
                self.notify("Audio processing started", severity="success")
                self.log_success("Audio engine started")
                await self.refresh_pipedal_status()
            else:
                self.notify(f"Failed to start audio: {result.error}", severity="error")
                self.log_error(f"Failed to start audio: {result.error}")
        except Exception as e:
            self.notify(f"Error starting audio: {e}", severity="error")
            self.log_error(f"Error starting audio: {e}")

    async def stop_audio(self) -> None:
        """Stop PiPedal audio processing."""
        self.log_action("Stopping audio engine...")
        try:
            result = await self.api_client.stop_audio()
            if result.success:
                self.notify("Audio processing stopped", severity="success")
                self.log_success("Audio engine stopped")
                await self.refresh_pipedal_status()
            else:
                self.notify(f"Failed to stop audio: {result.error}", severity="error")
                self.log_error(f"Failed to stop audio: {result.error}")
        except Exception as e:
            self.notify(f"Error stopping audio: {e}", severity="error")
            self.log_error(f"Error stopping audio: {e}")

    async def toggle_midi(self) -> None:
        """Toggle MIDI enable/disable."""
        settings_panel = self.query_one("#settings-panel", MetricsTab)
        new_state = not settings_panel.midi_enabled

        self.log_action(f"{'Enabling' if new_state else 'Disabling'} MIDI...")
        try:
            result = await self.api_client.enable_midi(new_state)
            if result.success:
                state_str = "enabled" if new_state else "disabled"
                self.notify(f"MIDI {state_str}", severity="success")
                self.log_success(f"MIDI {state_str}")
                settings_panel.update_midi_status(new_state)
            else:
                self.notify(f"Failed to toggle MIDI: {result.error}", severity="error")
                self.log_error(f"Failed to toggle MIDI: {result.error}")
        except Exception as e:
            self.notify(f"Error toggling MIDI: {e}", severity="error")
            self.log_error(f"Error toggling MIDI: {e}")

    async def toggle_midi_learn(self) -> None:
        """Toggle MIDI learn mode."""
        try:
            # Check current status first
            status_result = await self.api_client._request("GET", "/api/midi-learn/learn/status")
            if status_result.success:
                is_learning = status_result.data.get("learning", False)

                if is_learning:
                    result = await self.api_client.stop_midi_learn()
                    if result.success:
                        self.notify("MIDI Learn mode stopped", severity="information")
                else:
                    result = await self.api_client.start_midi_learn()
                    if result.success:
                        self.notify("MIDI Learn mode started - move a MIDI controller", severity="success")
            else:
                # Just try to start
                result = await self.api_client.start_midi_learn()
                if result.success:
                    self.notify("MIDI Learn mode started", severity="success")
        except Exception as e:
            self.notify(f"Error with MIDI Learn: {e}", severity="error")

    async def load_snapshot(self, snapshot_id: int) -> None:
        """Load a snapshot (0-5)."""
        try:
            result = await self.api_client.load_snapshot(snapshot_id)
            if result.success:
                self.notify(f"Loaded snapshot {snapshot_id}", severity="success")
                settings_panel = self.query_one("#settings-panel", MetricsTab)
                settings_panel.update_snapshot(snapshot_id)
            else:
                self.notify(f"Failed to load snapshot: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error loading snapshot: {e}", severity="error")

    # ==================== PEDALBOARD SAVE/LOAD ====================

    async def save_pedalboard(self) -> None:
        """Save current pedalboard configuration."""
        result = await self.app.push_screen_wait(
            InputDialog(
                "Enter pedalboard name:",
                title="Save Pedalboard",
                placeholder="My Pedalboard",
                max_length=256
            )
        )

        if result:
            try:
                api_result = await self.api_client.save_pedalboard(result)
                if api_result.success:
                    self.notify(f"Saved pedalboard: {result}", severity="success")
                    # Update settings panel pedalboard name
                    pedalboard_label = self.query_one("#pedalboard-name-value", Label)
                    pedalboard_label.update(result)
                else:
                    self.notify(f"Failed to save pedalboard: {api_result.error}", severity="error")
            except Exception as e:
                self.notify(f"Error saving pedalboard: {e}", severity="error")

    async def load_pedalboard(self) -> None:
        """Load a saved pedalboard configuration."""
        try:
            # First, get list of available pedalboards
            # Note: API may not have a list endpoint, so we'll use an input dialog
            result = await self.app.push_screen_wait(
                InputDialog(
                    "Enter pedalboard name to load:",
                    title="Load Pedalboard",
                    placeholder="My Pedalboard",
                    max_length=256
                )
            )

            if result:
                api_result = await self.api_client.load_pedalboard(result)
                if api_result.success:
                    self.notify(f"Loaded pedalboard: {result}", severity="success")
                    # Update settings panel pedalboard name
                    pedalboard_label = self.query_one("#pedalboard-name-value", Label)
                    pedalboard_label.update(result)
                    # Refresh chains to show any changes
                    await self.refresh_chains()
                else:
                    self.notify(f"Failed to load pedalboard: {api_result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error loading pedalboard: {e}", severity="error")

    # ==================== MIDI DEVICE & MAPPINGS ====================

    async def show_midi_devices(self) -> None:
        """Show available MIDI devices and allow selection."""
        try:
            result = await self.api_client.get_midi_devices()
            if not result.success:
                self.notify(f"Failed to get MIDI devices: {result.error}", severity="error")
                return

            devices = result.data.get("devices", []) if isinstance(result.data, dict) else []

            if not devices:
                self.notify("No MIDI devices found", severity="warning")
                return

            # Build options for selection dialog
            device_options = [
                (device.get("id", str(i)), f"{device.get('name', 'Unknown')} ({device.get('type', 'unknown')})")
                for i, device in enumerate(devices)
            ]

            selected_device = await self.app.push_screen_wait(
                SelectDialog(
                    device_options,
                    title="MIDI Devices",
                    message="Available MIDI devices:"
                )
            )

            if selected_device:
                # Update settings panel to show selected device
                settings_panel = self.query_one("#settings-panel", MetricsTab)
                device_name = next(
                    (d.get("name", "Unknown") for d in devices if d.get("id") == selected_device),
                    selected_device
                )
                settings_panel.update_midi_device(device_name)
                self.notify(f"Selected MIDI device: {device_name}", severity="information")

        except Exception as e:
            self.notify(f"Error getting MIDI devices: {e}", severity="error")

    async def show_midi_mappings(self) -> None:
        """Show and manage MIDI CC mappings."""
        try:
            result = await self.api_client.list_midi_mappings()
            if not result.success:
                self.notify(f"Failed to get MIDI mappings: {result.error}", severity="error")
                return

            mappings = result.data.get("mappings", []) if isinstance(result.data, dict) else []

            if not mappings:
                # No mappings - offer to create one
                from modals import MessageDialog
                await self.app.push_screen_wait(
                    MessageDialog(
                        "No MIDI mappings configured.\n\n"
                        "Use MIDI Learn to create mappings:\n"
                        "1. Click 'MIDI Learn' button\n"
                        "2. Select a parameter in the Parameter panel\n"
                        "3. Move a MIDI controller",
                        title="MIDI Mappings"
                    )
                )
                return

            # Build options showing existing mappings
            mapping_options = [
                (
                    str(m.get("id", i)),
                    f"Ch{m.get('midi_channel', '?')} CC{m.get('cc_number', '?')} → {m.get('parameter_name', 'Unknown')}"
                )
                for i, m in enumerate(mappings)
            ]

            # Add option to delete
            mapping_options.append(("__delete__", "🗑️ Delete a mapping..."))

            selected = await self.app.push_screen_wait(
                SelectDialog(
                    mapping_options,
                    title="MIDI Mappings",
                    message=f"{len(mappings)} MIDI mapping(s) configured:"
                )
            )

            if selected == "__delete__":
                # Show delete dialog
                delete_options = [
                    (
                        str(m.get("id", i)),
                        f"Ch{m.get('midi_channel', '?')} CC{m.get('cc_number', '?')} → {m.get('parameter_name', 'Unknown')}"
                    )
                    for i, m in enumerate(mappings)
                ]

                to_delete = await self.app.push_screen_wait(
                    SelectDialog(
                        delete_options,
                        title="Delete Mapping",
                        message="Select mapping to delete:"
                    )
                )

                if to_delete:
                    confirmed = await self.app.push_screen_wait(
                        ConfirmDialog(
                            "Are you sure you want to delete this MIDI mapping?",
                            title="Delete MIDI Mapping"
                        )
                    )
                    if confirmed:
                        delete_result = await self.api_client.delete_midi_mapping(int(to_delete))
                        if delete_result.success:
                            self.notify("MIDI mapping deleted", severity="success")
                        else:
                            self.notify(f"Failed to delete mapping: {delete_result.error}", severity="error")

        except Exception as e:
            self.notify(f"Error managing MIDI mappings: {e}", severity="error")

    # ==================== AUDIO CONFIGURATION ====================

    async def configure_audio(self) -> None:
        """Configure audio device settings (sample rate, buffer size, ALSA device)."""
        settings_panel = self.query_one("#settings-panel", MetricsTab)

        # Get current settings
        current_sample_rate = settings_panel.sample_rate
        current_buffer_size = settings_panel.buffer_size
        current_alsa_device = settings_panel.alsa_device

        # Sample rate options
        sample_rate_options = [
            ("44100", "44100 Hz (CD Quality)"),
            ("48000", "48000 Hz (Standard)" + (" (Current)" if current_sample_rate == 48000 else "")),
            ("96000", "96000 Hz (High Quality)"),
        ]

        selected_rate = await self.app.push_screen_wait(
            SelectDialog(
                sample_rate_options,
                title="Sample Rate",
                message=f"Current: {current_sample_rate} Hz\nSelect new sample rate:"
            )
        )

        if not selected_rate:
            return

        # Buffer size options
        buffer_options = [
            ("64", "64 samples (~1.3ms @ 48kHz) - Very Low Latency"),
            ("128", "128 samples (~2.7ms @ 48kHz) - Low Latency"),
            ("256", "256 samples (~5.3ms @ 48kHz) - Balanced" + (" (Current)" if current_buffer_size == 256 else "")),
            ("512", "512 samples (~10.7ms @ 48kHz) - Stable"),
        ]

        selected_buffer = await self.app.push_screen_wait(
            SelectDialog(
                buffer_options,
                title="Buffer Size",
                message=f"Current: {current_buffer_size} samples\nSelect buffer size:"
            )
        )

        if not selected_buffer:
            return

        # ALSA device input
        alsa_device = await self.app.push_screen_wait(
            InputDialog(
                "Enter ALSA device name:",
                title="ALSA Device",
                default_value=current_alsa_device,
                placeholder="default",
                max_length=256
            )
        )

        if not alsa_device:
            return

        # Confirm and apply
        new_sample_rate = int(selected_rate)
        new_buffer_size = int(selected_buffer)

        confirmed = await self.app.push_screen_wait(
            ConfirmDialog(
                f"Apply audio configuration?\n\n"
                f"Sample Rate: {new_sample_rate} Hz\n"
                f"Buffer Size: {new_buffer_size} samples\n"
                f"ALSA Device: {alsa_device}\n\n"
                f"Note: This will reinitialize the audio engine.",
                title="Confirm Audio Configuration"
            )
        )

        if confirmed:
            try:
                # First stop audio if running
                if settings_panel.audio_running:
                    await self.api_client.stop_audio()

                # Initialize with new settings
                result = await self.api_client.initialize_pipedal(
                    sample_rate=new_sample_rate,
                    buffer_size=new_buffer_size,
                    alsa_device=alsa_device,
                    enable_midi=settings_panel.midi_enabled
                )

                if result.success:
                    self.notify("Audio configuration applied", severity="success")
                    # Restart audio
                    await self.api_client.start_audio()
                    await self.refresh_pipedal_status()
                else:
                    self.notify(f"Failed to apply configuration: {result.error}", severity="error")
            except Exception as e:
                self.notify(f"Error configuring audio: {e}", severity="error")

    async def refresh_audio_levels(self) -> None:
        """Refresh audio level meters."""
        try:
            result = await self.api_client.get_audio_levels()
            if result.success:
                data = result.data
                # Convert dB or linear values to percentage (0-100)
                # Assuming API returns values in dB or 0.0-1.0 range
                input_l = data.get("input_left", 0) * 100 if data.get("input_left", 0) <= 1.0 else data.get("input_left", 0)
                input_r = data.get("input_right", 0) * 100 if data.get("input_right", 0) <= 1.0 else data.get("input_right", 0)
                output_l = data.get("output_left", 0) * 100 if data.get("output_left", 0) <= 1.0 else data.get("output_left", 0)
                output_r = data.get("output_right", 0) * 100 if data.get("output_right", 0) <= 1.0 else data.get("output_right", 0)

                settings_panel = self.query_one("#settings-panel", MetricsTab)
                settings_panel.update_audio_levels(input_l, input_r, output_l, output_r)
        except Exception:
            pass  # Silent fail for level meters

    async def shutdown_engine(self) -> None:
        """Shutdown PiPedal engine with confirmation."""
        confirmed = await self.app.push_screen_wait(
            ConfirmDialog(
                "Are you sure you want to shutdown the PiPedal engine?\n\n"
                "This will stop all audio processing and close the audio device.",
                title="Shutdown Engine"
            )
        )

        if confirmed:
            try:
                # Stop audio first if running
                settings_panel = self.query_one("#settings-panel", MetricsTab)
                if settings_panel.audio_running:
                    await self.api_client.stop_audio()

                # Shutdown the engine
                result = await self.api_client.shutdown_pipedal()
                if result.success:
                    self.notify("PiPedal engine shutdown complete", severity="success")
                    await self.refresh_pipedal_status()
                else:
                    self.notify(f"Failed to shutdown engine: {result.error}", severity="error")
            except Exception as e:
                self.notify(f"Error shutting down engine: {e}", severity="error")

    # ==================== DSP PROFILING & OPTIMIZATION ====================

    async def show_profiling(self) -> None:
        """Show plugin performance profiling data."""
        try:
            result = await self.api_client.get_profiling_data()
            if not result.success:
                self.notify(f"Failed to get profiling data: {result.error}", severity="error")
                return

            data = result.data
            plugins = data.get("plugins", []) if isinstance(data, dict) else []

            if not plugins:
                from modals import MessageDialog
                await self.app.push_screen_wait(
                    MessageDialog(
                        "No profiling data available.\n\n"
                        "Profiling data is collected while audio is running.\n"
                        "Start audio and load some plugins to see performance data.",
                        title="Plugin Profiling"
                    )
                )
                return

            # Build a formatted profiling report
            report_lines = ["Plugin Performance Profiling\n" + "=" * 40 + "\n"]

            # Sort by CPU usage (highest first)
            sorted_plugins = sorted(plugins, key=lambda p: p.get("cpu_percent", 0), reverse=True)

            for plugin in sorted_plugins[:15]:  # Top 15
                name = plugin.get("name", plugin.get("uri", "Unknown"))
                cpu = plugin.get("cpu_percent", 0)
                avg_time = plugin.get("avg_time_us", 0)
                max_time = plugin.get("max_time_us", 0)
                calls = plugin.get("call_count", 0)

                # Truncate long names
                if len(name) > 25:
                    name = name[:22] + "..."

                report_lines.append(f"{name:<25} CPU: {cpu:5.1f}%")
                report_lines.append(f"  Avg: {avg_time:6.0f}µs  Max: {max_time:6.0f}µs  Calls: {calls}")
                report_lines.append("")

            total_cpu = sum(p.get("cpu_percent", 0) for p in plugins)
            report_lines.append("=" * 40)
            report_lines.append(f"Total Plugin CPU: {total_cpu:.1f}%")

            from modals import MessageDialog
            await self.app.push_screen_wait(
                MessageDialog("\n".join(report_lines), title="Plugin Profiling")
            )

        except Exception as e:
            self.notify(f"Error getting profiling data: {e}", severity="error")

    async def optimize_dsp(self) -> None:
        """Run DSP optimization to re-evaluate all plugins."""
        try:
            result = await self.api_client.optimize_dsp()
            if result.success:
                data = result.data
                active = data.get("active_plugins", []) if isinstance(data, dict) else []
                bypassed = data.get("bypassed_plugins", []) if isinstance(data, dict) else []

                self.notify(
                    f"DSP optimized: {len(active)} active, {len(bypassed)} bypassed",
                    severity="success"
                )

                # Reload current chain to reflect changes
                if self.selected_chain_id:
                    await self.load_chain(self.selected_chain_id)

                await self.refresh_pipedal_status()
            else:
                self.notify(f"DSP optimization failed: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error optimizing DSP: {e}", severity="error")

    async def set_target_cpu(self) -> None:
        """Set target CPU utilization percentage."""
        settings_panel = self.query_one("#settings-panel", MetricsTab)
        current_target = settings_panel.target_cpu

        # CPU target options
        target_options = [
            ("50", "50% - Conservative (headroom for peaks)"),
            ("65", "65% - Moderate"),
            ("80", "80% - Balanced (Recommended)" + (" (Current)" if current_target == 80 else "")),
            ("90", "90% - Aggressive (minimal headroom)"),
        ]

        selected = await self.app.push_screen_wait(
            SelectDialog(
                target_options,
                title="Target CPU",
                message=f"Current target: {current_target:.0f}%\nSelect new CPU target:"
            )
        )

        if selected:
            try:
                new_target = float(selected)
                result = await self.api_client.set_target_cpu(new_target)
                if result.success:
                    self.notify(f"Target CPU set to {new_target:.0f}%", severity="success")
                    settings_panel.update_target_cpu(new_target)
                    # Re-optimize with new budget
                    await self.optimize_dsp()
                else:
                    self.notify(f"Failed to set target CPU: {result.error}", severity="error")
            except Exception as e:
                self.notify(f"Error setting target CPU: {e}", severity="error")

    async def refresh_cpu_headroom(self) -> None:
        """Refresh CPU headroom display."""
        try:
            result = await self.api_client.get_cpu_headroom()
            if result.success:
                data = result.data
                headroom = data.get("headroom_percent", 100) if isinstance(data, dict) else 100
                target = data.get("target_percent", 80) if isinstance(data, dict) else 80

                settings_panel = self.query_one("#settings-panel", MetricsTab)
                settings_panel.update_cpu_headroom(headroom)
                settings_panel.update_target_cpu(target)
        except Exception:
            pass  # Silent fail for headroom updates

    async def set_plugin_priority(self) -> None:
        """Set priority for the currently selected plugin."""
        param_panel = self.query_one("#parameter-panel", ParameterPanel)
        if not param_panel.plugin_uri:
            self.notify("No plugin selected", severity="warning")
            return

        # Get current priorities
        try:
            priorities_result = await self.api_client.get_plugin_priorities()
            current_priority = 5  # Default
            if priorities_result.success:
                priorities = priorities_result.data.get("priorities", {}) if isinstance(priorities_result.data, dict) else {}
                current_priority = priorities.get(param_panel.plugin_uri, 5)
        except Exception:
            current_priority = 5

        # Priority options (1-10)
        priority_options = [
            ("1", "1 - Lowest (bypass first when CPU limited)"),
            ("3", "3 - Low"),
            ("5", "5 - Normal (Default)" + (" (Current)" if current_priority == 5 else "")),
            ("7", "7 - High"),
        ]

        # Add current if not in standard options
        if current_priority not in [1, 3, 5, 7]:
            priority_options.insert(0, (str(current_priority), f"{current_priority} (Current)"))

        selected = await self.app.push_screen_wait(
            SelectDialog(
                priority_options,
                title=f"Plugin Priority: {param_panel.plugin_name}",
                message=f"Current priority: {current_priority}\n"
                        f"Higher priority plugins are kept active when CPU is limited.\n"
                        f"Lower priority plugins are bypassed first."
            )
        )

        if selected:
            try:
                new_priority = int(selected)
                result = await self.api_client.set_plugin_priority(param_panel.plugin_uri, new_priority)
                if result.success:
                    self.notify(f"Set {param_panel.plugin_name} priority to {new_priority}", severity="success")
                else:
                    self.notify(f"Failed to set priority: {result.error}", severity="error")
            except Exception as e:
                self.notify(f"Error setting priority: {e}", severity="error")

    # ==================== PLUGIN TESTING ====================

    async def test_plugin(self) -> None:
        """Load a plugin for testing without adding to chain.

        This allows users to hear how a plugin sounds before committing
        to adding it to a chain. The plugin is loaded directly into
        the PiPedal engine for preview.
        """
        plugin_browser = self.query_one("#plugin-browser", PluginBrowserPanel)
        plugin_uri = plugin_browser.selected_plugin_uri

        if not plugin_uri:
            self.notify("No plugin selected", severity="warning")
            return

        # Find plugin name
        plugin = next((p for p in plugin_browser.all_plugins if p.get("uri") == plugin_uri), None)
        plugin_name = plugin.get("name", "Plugin") if plugin else "Plugin"

        # Show test options
        test_options = [
            ("load", f"🎧 Load '{plugin_name}' for preview"),
            ("unload", "⏹️ Unload current test plugin"),
            ("params", "⚙️ View parameters"),
        ]

        selected = await self.app.push_screen_wait(
            SelectDialog(
                test_options,
                title="Test Plugin",
                message=f"Test '{plugin_name}' without adding to chain:"
            )
        )

        if selected == "load":
            await self._load_test_plugin(plugin_uri, plugin_name)
        elif selected == "unload":
            await self._unload_test_plugin(plugin_uri, plugin_name)
        elif selected == "params":
            await self.show_plugin_info()

    async def _load_test_plugin(self, plugin_uri: str, plugin_name: str) -> None:
        """Load plugin into PiPedal engine for testing."""
        try:
            result = await self.api_client.load_plugin(plugin_uri)
            if result.success:
                self.notify(
                    f"Loaded '{plugin_name}' for testing\n"
                    "Audio will pass through this plugin.",
                    severity="success"
                )
                # Store the test plugin URI for later unload
                self._test_plugin_uri = plugin_uri
                self._test_plugin_name = plugin_name
            else:
                self.notify(f"Failed to load plugin: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error loading plugin: {e}", severity="error")

    async def _unload_test_plugin(self, plugin_uri: str, plugin_name: str) -> None:
        """Unload test plugin from PiPedal engine."""
        # Use stored test plugin if available
        uri_to_unload = getattr(self, '_test_plugin_uri', plugin_uri)
        name_to_unload = getattr(self, '_test_plugin_name', plugin_name)

        try:
            result = await self.api_client.unload_plugin(uri_to_unload)
            if result.success:
                self.notify(f"Unloaded '{name_to_unload}'", severity="information")
                self._test_plugin_uri = None
                self._test_plugin_name = None
            else:
                self.notify(f"Failed to unload plugin: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error unloading plugin: {e}", severity="error")

    async def toggle_plugin_favorite(self) -> None:
        """Toggle favorite status for the selected plugin."""
        plugin_browser = self.query_one("#plugin-browser", PluginBrowserPanel)
        plugin_uri = plugin_browser.selected_plugin_uri

        if not plugin_uri:
            self.notify("No plugin selected", severity="warning")
            return

        # Find plugin name
        plugin = next((p for p in plugin_browser.all_plugins if p.get("uri") == plugin_uri), None)
        plugin_name = plugin.get("name", "Plugin") if plugin else "Plugin"

        # Toggle favorite
        is_favorite = plugin_browser.toggle_favorite(plugin_uri)

        if is_favorite:
            self.notify(f"Added '{plugin_name}' to favorites", severity="information")
        else:
            self.notify(f"Removed '{plugin_name}' from favorites", severity="information")

        # Update button appearance
        plugin_browser._update_favorite_button()

        # Refresh list if currently viewing favorites
        if plugin_browser.selected_category == "favorites":
            plugin_browser.filter_plugins()

    # ==================== MIDI ADVANCED CONTROLS ====================

    async def start_midi_engine(self) -> None:
        """Start the MIDI engine."""
        self.notify("Starting MIDI engine...", severity="information")
        try:
            result = await self.api_client.start_midi()
            if result.success:
                self.notify("MIDI engine started", severity="success")
                await self.refresh_midi_data()
            else:
                self.notify(f"Failed to start MIDI: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error starting MIDI: {e}", severity="error")

    async def stop_midi_engine(self) -> None:
        """Stop the MIDI engine."""
        self.notify("Stopping MIDI engine...", severity="information")
        try:
            result = await self.api_client.stop_midi()
            if result.success:
                self.notify("MIDI engine stopped", severity="success")
                await self.refresh_midi_data()
            else:
                self.notify(f"Failed to stop MIDI: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error stopping MIDI: {e}", severity="error")

    async def start_midi_learn(self) -> None:
        """Start MIDI learn mode."""
        settings_panel = self.query_one("#settings-panel", MetricsTab)

        try:
            result = await self.api_client.start_midi_learn()
            if result.success:
                settings_panel.set_midi_learn_active(True)
                self.notify("🔴 MIDI Learn active - Move a MIDI control", severity="warning")

                # Auto-stop after 30 seconds
                self.set_timer(30.0, self._auto_stop_midi_learn)
            else:
                self.notify(f"Failed to start MIDI Learn: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error starting MIDI Learn: {e}", severity="error")

    async def _auto_stop_midi_learn(self) -> None:
        """Auto-stop MIDI learn after timeout."""
        settings_panel = self.query_one("#settings-panel", MetricsTab)
        if settings_panel.midi_learning:
            await self.stop_midi_learn()
            self.notify("MIDI Learn auto-stopped after 30s", severity="warning")

    async def stop_midi_learn(self) -> None:
        """Stop MIDI learn mode."""
        settings_panel = self.query_one("#settings-panel", MetricsTab)

        try:
            result = await self.api_client.stop_midi_learn()
            if result.success:
                settings_panel.set_midi_learn_active(False)
                self.notify("MIDI Learn stopped", severity="information")
                await self.refresh_midi_data()
            else:
                self.notify(f"Failed to stop MIDI Learn: {result.error}", severity="error")
        except Exception as e:
            self.notify(f"Error stopping MIDI Learn: {e}", severity="error")

    async def add_midi_mapping(self) -> None:
        """Create a manual MIDI mapping."""
        from modals import FormDialog

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
            try:
                mapping_data = {
                    "midi_channel": int(result["midi_channel"]),
                    "cc_number": int(result["cc_number"]),
                    "plugin_uri": result["plugin_uri"],
                    "parameter_index": int(result["parameter_index"]),
                    "parameter_name": result["parameter_name"]
                }

                create_result = await self.api_client.create_midi_mapping(mapping_data)

                if create_result.success:
                    self.notify("MIDI mapping created", severity="success")
                    await self.refresh_midi_data()
                else:
                    self.notify(f"Failed to create mapping: {create_result.error}", severity="error")
            except ValueError as e:
                self.notify(f"Invalid input: {e}", severity="error")
            except Exception as e:
                self.notify(f"Error creating mapping: {e}", severity="error")

    async def delete_midi_mapping(self, mapping_id: int) -> None:
        """Delete a MIDI mapping."""
        from modals import ConfirmDialog

        settings_panel = self.query_one("#settings-panel", MetricsTab)

        # Find mapping for confirmation
        mapping = next((m for m in settings_panel.midi_mappings if m.get("id") == mapping_id), None)
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
            try:
                result = await self.api_client.delete_midi_mapping(mapping_id)
                if result.success:
                    self.notify("MIDI mapping deleted", severity="success")
                    await self.refresh_midi_data()
                else:
                    self.notify(f"Failed to delete mapping: {result.error}", severity="error")
            except Exception as e:
                self.notify(f"Error deleting mapping: {e}", severity="error")

    async def refresh_midi_data(self) -> None:
        """Refresh all MIDI data (devices, mappings, engine status)."""
        settings_panel = self.query_one("#settings-panel", MetricsTab)

        try:
            # Fetch MIDI devices
            devices_result = await self.api_client.list_midi_devices()
            if devices_result.success:
                devices = devices_result.data
                settings_panel.update_midi_devices(devices)

                # Infer MIDI engine status from devices
                midi_running = any(d.get("is_open", False) for d in devices)
                settings_panel.update_midi_engine_status(midi_running)

            # Fetch MIDI mappings
            mappings_result = await self.api_client.list_midi_mappings()
            if mappings_result.success:
                data = mappings_result.data
                if isinstance(data, dict):
                    mappings = data.get("mappings", [])
                else:
                    mappings = []
                settings_panel.update_midi_mappings(mappings)

        except Exception as e:
            self.notify(f"Error refreshing MIDI data: {e}", severity="error")

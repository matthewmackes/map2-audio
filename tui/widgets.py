"""
Custom Interactive Widgets for MAP2 Audio Platform TUI
Reusable widget components for interactive controls across all screens.
"""

from typing import Optional, Callable, List, Dict, Any
from textual.app import ComposeResult
from textual.widgets import Static, Button, Label, Input, ProgressBar, ListView, ListItem, Tree
from textual.widgets.tree import TreeNode
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.reactive import reactive
from textual.binding import Binding
from textual.message import Message

# Import shared utilities to avoid code duplication
from utils import get_plugin_icon, truncate_name, format_cpu_percent, RefreshDebouncer


class StatusIndicator(Static):
    """
    Real-time status indicator with colored display.

    Usage:
        indicator = StatusIndicator("Audio Engine")
        indicator.set_status(True)  # Green "Running"
        indicator.set_status(False)  # Gray "Stopped"
    """

    DEFAULT_CSS = """
    StatusIndicator {
        width: auto;
        height: auto;
        padding: 0 1;
    }

    StatusIndicator .status-label {
        text-align: left;
    }

    StatusIndicator .status-running {
        color: $success;
    }

    StatusIndicator .status-stopped {
        color: $text-muted;
    }

    StatusIndicator .status-error {
        color: $error;
    }
    """

    status: reactive[bool] = reactive(False)

    def __init__(self, label: str, id: Optional[str] = None):
        """
        Initialize status indicator.

        Args:
            label: Text label for the status
            id: Optional widget ID
        """
        super().__init__(id=id)
        self.label_text = label

    def compose(self) -> ComposeResult:
        """Compose status indicator."""
        yield Label(self._format_status(), classes="status-label", id=f"{self.id}-label")

    def _format_status(self) -> str:
        """Format status string with indicator."""
        indicator = "🟢" if self.status else "⚫"
        status_text = "Running" if self.status else "Stopped"
        return f"{indicator} {self.label_text}: {status_text}"

    def set_status(self, running: bool) -> None:
        """Update status display."""
        self.status = running
        label = self.query_one(f"#{self.id}-label", Label)
        label.update(self._format_status())

        if running:
            label.remove_class("status-stopped", "status-error")
            label.add_class("status-running")
        else:
            label.remove_class("status-running", "status-error")
            label.add_class("status-stopped")

    def set_error(self, error_msg: str) -> None:
        """Set error state."""
        label = self.query_one(f"#{self.id}-label", Label)
        label.update(f"❌ {self.label_text}: {error_msg}")
        label.remove_class("status-running", "status-stopped")
        label.add_class("status-error")


class LoadingIndicator(Static):
    """
    Animated loading indicator.

    Usage:
        loading = LoadingIndicator("Discovering plugins...")
        loading.show()
        # ... do work ...
        loading.hide()
    """

    DEFAULT_CSS = """
    LoadingIndicator {
        width: 100%;
        height: auto;
        text-align: center;
        padding: 1;
        background: $panel;
        border: solid $primary;
    }

    LoadingIndicator.hidden {
        display: none;
    }
    """

    visible: reactive[bool] = reactive(False)

    def __init__(self, message: str = "Loading...", id: Optional[str] = None):
        """
        Initialize loading indicator.

        Args:
            message: Loading message to display
            id: Optional widget ID
        """
        super().__init__(id=id)
        self.message = message
        self.frame = 0
        self.frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

    def compose(self) -> ComposeResult:
        """Compose loading indicator."""
        yield Label(self._format_message(), id=f"{self.id}-label")

    def _format_message(self) -> str:
        """Format loading message with spinner."""
        return f"{self.frames[self.frame]} {self.message}"

    def on_mount(self) -> None:
        """Start animation when mounted."""
        self.add_class("hidden")
        self.set_interval(0.1, self._animate)

    def _animate(self) -> None:
        """Animate spinner."""
        if self.visible:
            self.frame = (self.frame + 1) % len(self.frames)
            label = self.query_one(f"#{self.id}-label", Label)
            label.update(self._format_message())

    def show(self, message: Optional[str] = None) -> None:
        """Show loading indicator."""
        if message:
            self.message = message
        self.visible = True
        self.remove_class("hidden")

    def hide(self) -> None:
        """Hide loading indicator."""
        self.visible = False
        self.add_class("hidden")


class ActionButton(Button):
    """
    Enhanced button with loading state and confirmation support.

    Usage:
        btn = ActionButton("Delete", variant="error", requires_confirm=True,
                          confirm_message="Are you sure?")
        btn.on_click = lambda: self.delete_item()
    """

    def __init__(
        self,
        label: str,
        variant: str = "default",
        requires_confirm: bool = False,
        confirm_message: str = "Are you sure?",
        id: Optional[str] = None,
        disabled: bool = False
    ):
        """
        Initialize action button.

        Args:
            label: Button label
            variant: Button style variant
            requires_confirm: Whether to show confirmation dialog
            confirm_message: Confirmation dialog message
            id: Optional widget ID
            disabled: Whether button is disabled
        """
        super().__init__(label, variant=variant, id=id, disabled=disabled)
        self.original_label = label
        self.requires_confirm = requires_confirm
        self.confirm_message = confirm_message
        self.is_loading = False

    def set_loading(self, loading: bool, loading_text: str = "Working...") -> None:
        """Set loading state."""
        self.is_loading = loading
        if loading:
            self.label = f"⏳ {loading_text}"
            self.disabled = True
        else:
            self.label = self.original_label
            self.disabled = False


class MixControl(Static):
    """
    Mix level control widget (0-100%).

    Usage:
        mix_control = MixControl("NAM Mix", default_value=100.0,
                                on_change=lambda val: self.set_nam_mix(val))
    """

    DEFAULT_CSS = """
    MixControl {
        width: 100%;
        height: auto;
        padding: 1;
        background: $panel;
        border: solid $primary;
    }

    MixControl Label {
        width: 100%;
        text-align: center;
        margin-bottom: 1;
    }

    MixControl Horizontal {
        width: 100%;
        height: auto;
        align: center middle;
    }

    MixControl Input {
        width: 10;
        margin: 0 1;
    }

    MixControl Button {
        width: 8;
    }
    """

    value: reactive[float] = reactive(100.0)

    def __init__(
        self,
        label: str,
        default_value: float = 100.0,
        min_value: float = 0.0,
        max_value: float = 100.0,
        step: float = 5.0,
        on_change: Optional[Callable[[float], None]] = None,
        id: Optional[str] = None
    ):
        """
        Initialize mix control.

        Args:
            label: Control label
            default_value: Initial value
            min_value: Minimum value
            max_value: Maximum value
            step: Increment/decrement step
            on_change: Callback when value changes
            id: Optional widget ID
        """
        super().__init__(id=id)
        self.label_text = label
        self.value = default_value
        self.min_value = min_value
        self.max_value = max_value
        self.step = step
        self.on_change_callback = on_change

    def compose(self) -> ComposeResult:
        """Compose mix control."""
        yield Label(f"{self.label_text}: {self.value:.1f}%")
        yield Horizontal(
            Button("-", id=f"{self.id}-dec", variant="default"),
            Input(value=str(self.value), type="number", id=f"{self.id}-input"),
            Button("+", id=f"{self.id}-inc", variant="default"),
            Button("Set", id=f"{self.id}-set", variant="primary"),
        )

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button clicks."""
        if event.button.id == f"{self.id}-dec":
            self._decrement()
        elif event.button.id == f"{self.id}-inc":
            self._increment()
        elif event.button.id == f"{self.id}-set":
            self._set_value()

    def _increment(self) -> None:
        """Increment value."""
        new_value = min(self.value + self.step, self.max_value)
        self._update_value(new_value)

    def _decrement(self) -> None:
        """Decrement value."""
        new_value = max(self.value - self.step, self.min_value)
        self._update_value(new_value)

    def _set_value(self) -> None:
        """Set value from input."""
        input_widget = self.query_one(f"#{self.id}-input", Input)
        try:
            new_value = float(input_widget.value)
            new_value = max(self.min_value, min(new_value, self.max_value))
            self._update_value(new_value)
        except ValueError:
            self.app.notify("Invalid number", severity="error")

    def _update_value(self, new_value: float) -> None:
        """Update displayed value."""
        self.value = new_value
        label = self.query_one(Label)
        label.update(f"{self.label_text}: {self.value:.1f}%")
        input_widget = self.query_one(f"#{self.id}-input", Input)
        input_widget.value = f"{self.value:.1f}"

        if self.on_change_callback:
            self.on_change_callback(self.value)


class BypassToggle(Static):
    """
    Bypass toggle button with visual state indicator.

    Usage:
        toggle = BypassToggle("Plugin Name", initial_state=False,
                             on_toggle=lambda bypassed: self.set_bypass(uri, bypassed))
    """

    DEFAULT_CSS = """
    BypassToggle {
        width: 100%;
        height: auto;
        padding: 0 1;
    }

    BypassToggle Horizontal {
        width: 100%;
        height: auto;
        align: center middle;
    }

    BypassToggle Label {
        width: 1fr;
    }

    BypassToggle Button {
        width: 12;
    }

    BypassToggle .bypassed {
        color: $text-muted;
        text-style: italic;
    }

    BypassToggle .active {
        color: $success;
    }
    """

    bypassed: reactive[bool] = reactive(False)

    def __init__(
        self,
        item_label: str,
        initial_state: bool = False,
        on_toggle: Optional[Callable[[bool], None]] = None,
        id: Optional[str] = None
    ):
        """
        Initialize bypass toggle.

        Args:
            item_label: Label for the item being bypassed
            initial_state: Initial bypass state
            on_toggle: Callback when state changes
            id: Optional widget ID
        """
        super().__init__(id=id)
        self.item_label = item_label
        self.bypassed = initial_state
        self.on_toggle_callback = on_toggle

    def compose(self) -> ComposeResult:
        """Compose bypass toggle."""
        yield Horizontal(
            Label(self._format_label(), id=f"{self.id}-label"),
            Button(self._button_label(), id=f"{self.id}-btn", variant=self._button_variant()),
        )

    def _format_label(self) -> str:
        """Format label with bypass indicator."""
        if self.bypassed:
            return f"🔇 {self.item_label}"
        else:
            return f"🔊 {self.item_label}"

    def _button_label(self) -> str:
        """Get button label based on state."""
        return "Unmute" if self.bypassed else "Mute"

    def _button_variant(self) -> str:
        """Get button variant based on state."""
        return "default" if self.bypassed else "warning"

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle toggle button click."""
        if event.button.id == f"{self.id}-btn":
            self.toggle()

    def toggle(self) -> None:
        """Toggle bypass state."""
        self.bypassed = not self.bypassed
        self._update_display()

        if self.on_toggle_callback:
            self.on_toggle_callback(self.bypassed)

    def set_state(self, bypassed: bool) -> None:
        """Set bypass state programmatically."""
        self.bypassed = bypassed
        self._update_display()

    def _update_display(self) -> None:
        """Update visual display."""
        label = self.query_one(f"#{self.id}-label", Label)
        button = self.query_one(f"#{self.id}-btn", Button)

        label.update(self._format_label())
        button.label = self._button_label()
        button.variant = self._button_variant()

        if self.bypassed:
            label.remove_class("active")
            label.add_class("bypassed")
        else:
            label.remove_class("bypassed")
            label.add_class("active")


class PluginListItem(Static):
    """
    Plugin list item with load button and metadata display.

    Usage:
        item = PluginListItem(plugin_data, on_load=lambda uri: self.load_plugin(uri))
    """

    DEFAULT_CSS = """
    PluginListItem {
        width: 100%;
        height: auto;
        padding: 1;
        background: $panel;
        border: solid $primary;
        margin-bottom: 1;
    }

    PluginListItem:hover {
        background: $panel-lighten-1;
    }

    PluginListItem Label {
        width: 1fr;
    }

    PluginListItem .plugin-name {
        text-style: bold;
        color: $text;
    }

    PluginListItem .plugin-meta {
        color: $text-muted;
        text-style: italic;
    }

    PluginListItem Button {
        width: 12;
    }
    """

    def __init__(
        self,
        plugin_data: Dict[str, Any],
        on_load: Optional[Callable[[str], None]] = None,
        id: Optional[str] = None
    ):
        """
        Initialize plugin list item.

        Args:
            plugin_data: Plugin metadata dict with name, uri, author, category
            on_load: Callback when load button clicked
            id: Optional widget ID
        """
        super().__init__(id=id)
        self.plugin_data = plugin_data
        self.on_load_callback = on_load

    def compose(self) -> ComposeResult:
        """Compose plugin list item."""
        name = self.plugin_data.get("name", "Unknown")
        author = self.plugin_data.get("author", "Unknown Author")
        category = self.plugin_data.get("category", "Unknown")

        yield Horizontal(
            Vertical(
                Label(name, classes="plugin-name"),
                Label(f"By {author} | {category}", classes="plugin-meta"),
            ),
            Button("Load", id=f"{self.id}-load", variant="primary"),
        )

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle load button click."""
        if event.button.id == f"{self.id}-load":
            if self.on_load_callback:
                uri = self.plugin_data.get("uri", "")
                self.on_load_callback(uri)


class ChainListItem(Static):
    """
    Chain list item with expand/collapse and action buttons.

    Usage:
        item = ChainListItem(chain_data,
                            on_activate=lambda id: self.activate_chain(id),
                            on_rename=lambda id: self.rename_chain(id),
                            on_delete=lambda id: self.delete_chain(id))
    """

    DEFAULT_CSS = """
    ChainListItem {
        width: 100%;
        height: auto;
        padding: 1;
        background: $panel;
        border: solid $primary;
        margin-bottom: 1;
    }

    ChainListItem:hover {
        background: $panel-lighten-1;
    }

    ChainListItem .chain-header {
        width: 100%;
        height: auto;
    }

    ChainListItem .chain-name {
        text-style: bold;
        color: $text;
    }

    ChainListItem .chain-active {
        color: $success;
    }

    ChainListItem .chain-plugins {
        width: 100%;
        height: auto;
        padding: 1 0 0 2;
    }

    ChainListItem Button {
        margin: 0 1;
    }
    """

    expanded: reactive[bool] = reactive(False)

    def __init__(
        self,
        chain_data: Dict[str, Any],
        on_activate: Optional[Callable[[int], None]] = None,
        on_rename: Optional[Callable[[int], None]] = None,
        on_delete: Optional[Callable[[int], None]] = None,
        id: Optional[str] = None
    ):
        """
        Initialize chain list item.

        Args:
            chain_data: Chain metadata dict
            on_activate: Callback when activate clicked
            on_rename: Callback when rename clicked
            on_delete: Callback when delete clicked
            id: Optional widget ID
        """
        super().__init__(id=id)
        self.chain_data = chain_data
        self.on_activate_callback = on_activate
        self.on_rename_callback = on_rename
        self.on_delete_callback = on_delete

    def compose(self) -> ComposeResult:
        """Compose chain list item."""
        chain_id = self.chain_data.get("id", 0)
        name = self.chain_data.get("name", "Unknown")
        is_active = self.chain_data.get("is_active", False)
        plugin_count = len(self.chain_data.get("plugins", []))

        status = "🟢" if is_active else "⚫"

        yield Vertical(
            Horizontal(
                Label(f"{status} {name} ({plugin_count} plugins)", classes="chain-name"),
                Button("▶" if not is_active else "⏸", id=f"{self.id}-activate", variant="primary"),
                Button("✏", id=f"{self.id}-rename", variant="default"),
                Button("🗑", id=f"{self.id}-delete", variant="error"),
                classes="chain-header"
            ),
            Container(id=f"{self.id}-plugins", classes="chain-plugins"),
        )

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button clicks."""
        chain_id = self.chain_data.get("id", 0)

        if event.button.id == f"{self.id}-activate":
            if self.on_activate_callback:
                self.on_activate_callback(chain_id)
        elif event.button.id == f"{self.id}-rename":
            if self.on_rename_callback:
                self.on_rename_callback(chain_id)
        elif event.button.id == f"{self.id}-delete":
            if self.on_delete_callback:
                self.on_delete_callback(chain_id)


class PluginBlock(Container):
    """
    Visual representation of a single plugin in the signal flow.

    Displays plugin name, bypass status, and selection state.
    """

    DEFAULT_CSS = """
    PluginBlock {
        width: auto;
        height: auto;
        padding: 0;
        margin: 0 1;
    }

    PluginBlock.selected {
        background: $accent;
        color: $text;
    }

    PluginBlock .block-border {
        border: solid $primary;
        padding: 0 1;
    }

    PluginBlock.selected .block-border {
        border: solid $success;
    }

    PluginBlock.bypassed {
        color: $text-muted;
    }

    PluginBlock .block-name {
        text-align: center;
        text-style: bold;
    }

    PluginBlock .block-status {
        text-align: center;
        font-size: 90%;
    }

    PluginBlock .block-cpu {
        text-align: center;
        font-size: 80%;
        color: $text-muted;
    }
    """

    def __init__(
        self,
        plugin_uri: str,
        plugin_name: str,
        bypassed: bool = False,
        cpu_percent: float = 0.0,
        selected: bool = False,
        id: Optional[str] = None
    ):
        super().__init__(id=id)
        self.plugin_uri = plugin_uri
        self.plugin_name = plugin_name
        self.bypassed = bypassed
        self.cpu_percent = cpu_percent
        # Debouncer for refresh calls
        self._refresh_debouncer = RefreshDebouncer(delay_ms=30)

        if selected:
            self.add_class("selected")
        if bypassed:
            self.add_class("bypassed")

    def compose(self) -> ComposeResult:
        """Render the plugin block."""
        # Get plugin icon based on type (using shared utility)
        icon = get_plugin_icon(self.plugin_uri)

        # Truncate name if too long (using shared utility)
        display_name = truncate_name(self.plugin_name, 10)

        # Status indicator
        status = "[BY]" if self.bypassed else "[ON]"

        # CPU usage
        cpu_display = format_cpu_percent(self.cpu_percent) if self.cpu_percent > 0.1 else ""

        with Container(classes="block-border"):
            yield Label(f"{icon}", classes="block-name")
            yield Label(f"{display_name}", classes="block-name")
            yield Label(f"{status}", classes="block-status")
            if cpu_display:
                yield Label(f"{cpu_display}", classes="block-cpu")

    def set_selected(self, selected: bool) -> None:
        """Update selection state."""
        if selected:
            self.add_class("selected")
        else:
            self.remove_class("selected")

    def set_bypassed(self, bypassed: bool) -> None:
        """Update bypass state."""
        self.bypassed = bypassed
        if bypassed:
            self.add_class("bypassed")
        else:
            self.remove_class("bypassed")
        # Use debounced refresh
        self._refresh_debouncer.request_refresh(self, layout=True)


class SignalFlowWidget(Container):
    """
    Visual signal flow diagram showing plugin chain.

    Features:
    - Block-based visual representation
    - Arrow indicators between blocks
    - Keyboard navigation (←/→)
    - Block selection highlighting
    - CPU usage display per block
    """

    DEFAULT_CSS = """
    SignalFlowWidget {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $primary;
        padding: 1;
    }

    SignalFlowWidget .flow-title {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    SignalFlowWidget .flow-container {
        width: 100%;
        height: auto;
        align: center middle;
    }

    SignalFlowWidget .flow-row {
        width: 100%;
        height: auto;
        align: center middle;
    }

    SignalFlowWidget .flow-arrow {
        color: $primary;
        padding: 0 1;
    }

    SignalFlowWidget .cpu-bar {
        width: 100%;
        margin-top: 1;
    }

    SignalFlowWidget .empty-message {
        text-align: center;
        color: $text-muted;
        padding: 2;
    }
    """

    BINDINGS = [
        Binding("left", "prev_block", "← Prev Block", show=False),
        Binding("right", "next_block", "→ Next Block", show=False),
        Binding("b", "toggle_bypass", "Bypass", show=False),
        Binding("delete", "delete_block", "Delete", show=False),
        Binding("ctrl+up", "move_up", "Move Up", show=False),
        Binding("ctrl+down", "move_down", "Move Down", show=False),
    ]

    plugins: reactive[List[Dict[str, Any]]] = reactive([])
    selected_index: reactive[int] = reactive(-1)
    total_cpu: reactive[float] = reactive(0.0)

    def __init__(self, chain_id: int, id: Optional[str] = None):
        super().__init__(id=id)
        self.chain_id = chain_id
        self.on_selection_changed: Optional[Callable] = None
        self.on_bypass_toggled: Optional[Callable] = None
        self.on_delete_requested: Optional[Callable] = None
        self.on_move_requested: Optional[Callable] = None
        # Debouncer for refresh calls to prevent flickering
        self._refresh_debouncer = RefreshDebouncer(delay_ms=50)

    def compose(self) -> ComposeResult:
        """Render the signal flow diagram."""
        yield Label("📊 Signal Flow", classes="flow-title")

        if not self.plugins:
            yield Label("No plugins in chain. Press '+' to add plugins.", classes="empty-message")
        else:
            with Horizontal(classes="flow-container"):
                yield from self._render_blocks()

            # CPU usage bar
            cpu_bar = self._render_cpu_bar()
            yield Static(cpu_bar, classes="cpu-bar")

    def _render_blocks(self) -> List[ComposeResult]:
        """Render plugin blocks with arrows."""
        blocks = []

        for i, plugin in enumerate(self.plugins):
            # Create plugin block
            block = PluginBlock(
                plugin_uri=plugin.get('uri', ''),
                plugin_name=plugin.get('name', 'Unknown'),
                bypassed=plugin.get('bypass', False),
                cpu_percent=plugin.get('cpu_percent', 0.0),
                selected=(i == self.selected_index),
                id=f"block-{i}"
            )
            blocks.append(block)

            # Add arrow between blocks (except after last block)
            if i < len(self.plugins) - 1:
                blocks.append(Label("→", classes="flow-arrow"))

        return blocks

    def _render_cpu_bar(self) -> str:
        """Render CPU usage bar."""
        cpu_pct = min(100.0, self.total_cpu)
        filled = int(cpu_pct / 5)  # 20 char width
        bar = "█" * filled + "░" * (20 - filled)

        # Color based on usage
        if cpu_pct < 50:
            color = "green"
        elif cpu_pct < 80:
            color = "yellow"
        else:
            color = "red"

        return f"CPU: [{color}]{bar}[/] {cpu_pct:.1f}%"

    def update_plugins(self, plugins: List[Dict[str, Any]]) -> None:
        """Update the plugin list and refresh display."""
        self.plugins = plugins

        # Calculate total CPU
        self.total_cpu = sum(p.get('cpu_percent', 0.0) for p in plugins)

        # Auto-select first block if none selected
        if self.selected_index < 0 and plugins:
            self.selected_index = 0
        elif self.selected_index >= len(plugins):
            self.selected_index = max(0, len(plugins) - 1)

        # Use debounced refresh to prevent flickering
        self._refresh_debouncer.request_refresh(self, layout=True)

        # Notify selection change
        if self.on_selection_changed and self.selected_index >= 0:
            self.on_selection_changed(self.selected_index)

    def action_prev_block(self) -> None:
        """Navigate to previous block."""
        if not self.plugins:
            return

        self.selected_index = (self.selected_index - 1) % len(self.plugins)
        # Use debounced refresh for navigation
        self._refresh_debouncer.request_refresh(self, layout=True)

        if self.on_selection_changed:
            self.on_selection_changed(self.selected_index)

    def action_next_block(self) -> None:
        """Navigate to next block."""
        if not self.plugins:
            return

        self.selected_index = (self.selected_index + 1) % len(self.plugins)
        # Use debounced refresh for navigation
        self._refresh_debouncer.request_refresh(self, layout=True)

        if self.on_selection_changed:
            self.on_selection_changed(self.selected_index)

    def action_toggle_bypass(self) -> None:
        """Toggle bypass on selected block."""
        if self.selected_index < 0 or self.selected_index >= len(self.plugins):
            return

        plugin = self.plugins[self.selected_index]
        new_bypass_state = not plugin.get('bypass', False)

        if self.on_bypass_toggled:
            self.on_bypass_toggled(self.selected_index, new_bypass_state)

    def action_delete_block(self) -> None:
        """Request deletion of selected block."""
        if self.selected_index < 0 or self.selected_index >= len(self.plugins):
            return

        if self.on_delete_requested:
            self.on_delete_requested(self.selected_index)

    def action_move_up(self) -> None:
        """Move selected plugin up in the chain."""
        if self.selected_index <= 0:
            return

        new_position = self.selected_index - 1

        if self.on_move_requested:
            self.on_move_requested(self.selected_index, new_position)

    def action_move_down(self) -> None:
        """Move selected plugin down in the chain."""
        if self.selected_index < 0 or self.selected_index >= len(self.plugins) - 1:
            return

        new_position = self.selected_index + 1

        if self.on_move_requested:
            self.on_move_requested(self.selected_index, new_position)

    def get_selected_plugin(self) -> Optional[Dict[str, Any]]:
        """Get currently selected plugin."""
        if self.selected_index < 0 or self.selected_index >= len(self.plugins):
            return None
        return self.plugins[self.selected_index]


class ParameterControl(Container):
    """Single parameter control with interactive editing."""

    DEFAULT_CSS = """
    ParameterControl {
        width: 100%;
        height: auto;
        padding: 0 0 1 0;
    }

    ParameterControl .param-header {
        width: 100%;
        height: auto;
    }

    ParameterControl .param-name {
        width: 50%;
        text-style: bold;
    }

    ParameterControl .param-value {
        width: 30%;
        text-align: right;
        color: $accent;
    }

    ParameterControl .param-edit-btn {
        width: 20%;
    }

    ParameterControl .param-bar {
        width: 100%;
        color: $success;
    }

    ParameterControl .param-input-container {
        width: 100%;
        height: auto;
    }

    ParameterControl .param-input {
        width: 70%;
    }

    ParameterControl .param-set-btn {
        width: 15%;
    }

    ParameterControl .param-cancel-btn {
        width: 15%;
    }
    """

    value: reactive[float] = reactive(0.0)
    editing: reactive[bool] = reactive(False)

    def __init__(
        self,
        param_name: str,
        param_uri: str,
        value: Any,
        minimum: float = 0.0,
        maximum: float = 1.0,
        on_change: Optional[Callable[[str, float], None]] = None,
        id: Optional[str] = None
    ):
        super().__init__(id=id)
        self.param_name = param_name
        self.param_uri = param_uri
        self.value = float(value)
        self.minimum = minimum
        self.maximum = maximum
        self.on_change_callback = on_change

    def compose(self) -> ComposeResult:
        """Render parameter control."""
        # Header with name, value, and edit button
        with Horizontal(classes="param-header"):
            yield Label(self.param_name, classes="param-name")
            yield Label(f"{self.value:.2f}", id=f"{self.id}-value-label", classes="param-value")
            yield Button("✏️", id=f"{self.id}-edit", classes="param-edit-btn", variant="default")

        # Slider bar
        if self.maximum > self.minimum:
            normalized = (self.value - self.minimum) / (self.maximum - self.minimum)
        else:
            normalized = 0.5

        filled = int(normalized * 30)
        bar = "█" * filled + "░" * (30 - filled)
        yield Static(f"[{bar}]", id=f"{self.id}-bar", classes="param-bar")

        # Input container (hidden by default)
        with Horizontal(id=f"{self.id}-input-container", classes="param-input-container"):
            yield Input(
                value=str(self.value),
                type="number",
                id=f"{self.id}-input",
                classes="param-input"
            )
            yield Button("✓", id=f"{self.id}-set", classes="param-set-btn", variant="success")
            yield Button("✗", id=f"{self.id}-cancel", classes="param-cancel-btn", variant="error")

    def on_mount(self) -> None:
        """Hide input container on mount."""
        input_container = self.query_one(f"#{self.id}-input-container")
        input_container.display = False

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button clicks."""
        if event.button.id == f"{self.id}-edit":
            self._start_editing()
        elif event.button.id == f"{self.id}-set":
            self._save_value()
        elif event.button.id == f"{self.id}-cancel":
            self._cancel_editing()

    def _start_editing(self) -> None:
        """Show input field for editing."""
        input_container = self.query_one(f"#{self.id}-input-container")
        input_container.display = True

        input_widget = self.query_one(f"#{self.id}-input", Input)
        input_widget.value = str(self.value)
        input_widget.focus()

    def _cancel_editing(self) -> None:
        """Hide input field without saving."""
        input_container = self.query_one(f"#{self.id}-input-container")
        input_container.display = False

    def _save_value(self) -> None:
        """Save the edited value."""
        input_widget = self.query_one(f"#{self.id}-input", Input)

        try:
            new_value = float(input_widget.value)
            new_value = max(self.minimum, min(new_value, self.maximum))

            self.value = new_value
            self._update_display()

            # Hide input container
            input_container = self.query_one(f"#{self.id}-input-container")
            input_container.display = False

            # Call callback if set
            if self.on_change_callback:
                self.on_change_callback(self.param_uri, new_value)

        except ValueError:
            self.app.notify("Invalid number format", severity="error")

    def _update_display(self) -> None:
        """Update the value label and slider bar."""
        # Update value label
        value_label = self.query_one(f"#{self.id}-value-label", Label)
        value_label.update(f"{self.value:.2f}")

        # Update slider bar
        if self.maximum > self.minimum:
            normalized = (self.value - self.minimum) / (self.maximum - self.minimum)
        else:
            normalized = 0.5

        filled = int(normalized * 30)
        bar = "█" * filled + "░" * (30 - filled)

        bar_widget = self.query_one(f"#{self.id}-bar", Static)
        bar_widget.update(f"[{bar}]")


class ParameterEditor(Container):
    """Parameter editor for selected plugin."""

    DEFAULT_CSS = """
    ParameterEditor {
        width: 100%;
        height: auto;
        background: $panel;
        padding: 1;
    }

    ParameterEditor .editor-title {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    ParameterEditor .params-list {
        width: 100%;
        max-height: 20;
    }

    ParameterEditor .no-params {
        text-align: center;
        color: $text-muted;
        padding: 2;
    }
    """

    parameters: reactive[List[Dict[str, Any]]] = reactive([])

    def __init__(
        self,
        plugin_name: str = "",
        on_parameter_change: Optional[Callable[[str, float], None]] = None,
        id: Optional[str] = None
    ):
        super().__init__(id=id)
        self.plugin_name = plugin_name
        self.on_parameter_change_callback = on_parameter_change

    def compose(self) -> ComposeResult:
        """Render parameter editor."""
        yield Label(f"🎛️ {self.plugin_name or 'Parameters'}", classes="editor-title")

        with ScrollableContainer(classes="params-list"):
            if not self.parameters:
                yield Label("Select a plugin to view parameters", classes="no-params")
            else:
                for i, param in enumerate(self.parameters):
                    yield ParameterControl(
                        param_name=param.get('name', 'Unknown'),
                        param_uri=param.get('uri', ''),
                        value=param.get('value', 0.0),
                        minimum=param.get('minimum', 0.0),
                        maximum=param.get('maximum', 1.0),
                        on_change=self.on_parameter_change_callback,
                        id=f"param-{i}"
                    )

    def update_parameters(self, plugin_name: str, parameters: List[Dict[str, Any]]) -> None:
        """Update displayed parameters."""
        self.plugin_name = plugin_name
        self.parameters = parameters
        self.refresh(layout=True)


class PluginBrowser(Container):
    """Modal plugin browser for adding plugins to chain."""

    DEFAULT_CSS = """
    PluginBrowser {
        width: 80%;
        height: 80%;
        background: $panel;
        border: thick $primary;
        padding: 1;
    }

    PluginBrowser .browser-title {
        text-style: bold;
        color: $accent;
        text-align: center;
        margin-bottom: 1;
    }

    PluginBrowser .search-bar {
        width: 100%;
        margin-bottom: 1;
    }

    PluginBrowser .plugin-list {
        width: 100%;
        height: 1fr;
        border: solid $primary-lighten-1;
    }

    PluginBrowser .button-bar {
        width: 100%;
        height: auto;
        margin-top: 1;
    }

    PluginBrowser .button-bar Button {
        margin: 0 1;
    }

    PluginBrowser ListItem {
        padding: 1;
    }

    PluginBrowser ListItem:hover {
        background: $primary-darken-1;
    }
    """

    BINDINGS = [
        Binding("escape", "cancel", "Cancel", show=False),
    ]

    class PluginSelected(Message):
        """Message sent when a plugin is selected."""

        def __init__(self, plugin_uri: str, plugin_name: str) -> None:
            super().__init__()
            self.plugin_uri = plugin_uri
            self.plugin_name = plugin_name

    plugins: reactive[List[Dict[str, Any]]] = reactive([])
    filtered_plugins: reactive[List[Dict[str, Any]]] = reactive([])
    search_query: reactive[str] = reactive("")

    def __init__(self, plugins: List[Dict[str, Any]], id: Optional[str] = None):
        super().__init__(id=id)
        self.plugins = plugins
        self.filtered_plugins = plugins

    def compose(self) -> ComposeResult:
        """Render plugin browser."""
        yield Label("🎛️ Add Plugin to Chain", classes="browser-title")

        # Search bar
        yield Input(
            placeholder="Search plugins...",
            id="plugin-search",
            classes="search-bar"
        )

        # Plugin list
        with ScrollableContainer(classes="plugin-list"):
            plugin_list = ListView(id="plugin-list-view")
            for plugin in self.filtered_plugins:
                name = plugin.get("name", "Unknown")
                uri = plugin.get("uri", "")
                category = plugin.get("class", "Unknown")

                item_text = f"{name}\n{category} - {uri[:50]}..."
                plugin_list.append(ListItem(Label(item_text), id=f"plugin-{uri}"))

            yield plugin_list

        # Buttons
        with Horizontal(classes="button-bar"):
            yield Button("Add Selected", id="btn-add-selected", variant="success")
            yield Button("Cancel", id="btn-cancel", variant="default")

    def on_input_changed(self, event: Input.Changed) -> None:
        """Filter plugins based on search query."""
        if event.input.id != "plugin-search":
            return

        query = event.value.lower()
        self.search_query = query

        if not query:
            self.filtered_plugins = self.plugins
        else:
            self.filtered_plugins = [
                p for p in self.plugins
                if query in p.get("name", "").lower()
                or query in p.get("uri", "").lower()
                or query in p.get("class", "").lower()
            ]

        self._refresh_list()

    def _refresh_list(self) -> None:
        """Refresh the plugin list display."""
        list_view = self.query_one("#plugin-list-view", ListView)
        list_view.clear()

        for plugin in self.filtered_plugins:
            name = plugin.get("name", "Unknown")
            uri = plugin.get("uri", "")
            category = plugin.get("class", "Unknown")

            item_text = f"{name}\n{category} - {uri[:50]}..."
            list_view.append(ListItem(Label(item_text), id=f"plugin-{uri}"))

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button clicks."""
        if event.button.id == "btn-add-selected":
            self._add_selected()
        elif event.button.id == "btn-cancel":
            self.action_cancel()

    def _add_selected(self) -> None:
        """Add the selected plugin."""
        list_view = self.query_one("#plugin-list-view", ListView)

        if list_view.index is not None and list_view.index < len(self.filtered_plugins):
            plugin = self.filtered_plugins[list_view.index]
            plugin_uri = plugin.get("uri", "")
            plugin_name = plugin.get("name", "Unknown")

            self.post_message(self.PluginSelected(plugin_uri, plugin_name))

    def action_cancel(self) -> None:
        """Cancel and close browser."""
        self.remove()


class IRBrowser(Container):
    """Impulse Response (IR) file browser for cabinets and reverbs."""

    DEFAULT_CSS = """
    IRBrowser {
        width: 80%;
        height: 80%;
        background: $panel;
        border: thick $primary;
        padding: 1;
    }

    IRBrowser .browser-title {
        text-style: bold;
        color: $accent;
        text-align: center;
        margin-bottom: 1;
    }

    IRBrowser .ir-type-tabs {
        width: 100%;
        height: auto;
        margin-bottom: 1;
    }

    IRBrowser .ir-type-tabs Button {
        margin: 0 1;
    }

    IRBrowser .search-bar {
        width: 100%;
        margin-bottom: 1;
    }

    IRBrowser .ir-list {
        width: 100%;
        height: 1fr;
        border: solid $primary-lighten-1;
    }

    IRBrowser .ir-info {
        width: 100%;
        height: auto;
        background: $panel-darken-1;
        padding: 1;
        margin-top: 1;
    }

    IRBrowser .button-bar {
        width: 100%;
        height: auto;
        margin-top: 1;
    }

    IRBrowser .button-bar Button {
        margin: 0 1;
    }

    IRBrowser ListItem {
        padding: 1;
    }

    IRBrowser ListItem:hover {
        background: $primary-darken-1;
    }

    IRBrowser .active-tab {
        background: $success;
    }
    """

    BINDINGS = [
        Binding("escape", "cancel", "Cancel", show=False),
        Binding("1", "switch_cabinets", "Cabinets", show=False),
        Binding("2", "switch_reverbs", "Reverbs", show=False),
    ]

    class IRSelected(Message):
        """Message sent when an IR is selected."""

        def __init__(self, ir_name: str, ir_type: str) -> None:
            super().__init__()
            self.ir_name = ir_name
            self.ir_type = ir_type

    ir_type: reactive[str] = reactive("cabinet")  # "cabinet" or "reverb"
    cabinet_irs: reactive[List[Dict[str, Any]]] = reactive([])
    reverb_irs: reactive[List[Dict[str, Any]]] = reactive([])
    filtered_irs: reactive[List[Dict[str, Any]]] = reactive([])
    search_query: reactive[str] = reactive("")

    def __init__(
        self,
        cabinet_irs: List[Dict[str, Any]],
        reverb_irs: List[Dict[str, Any]],
        id: Optional[str] = None
    ):
        super().__init__(id=id)
        self.cabinet_irs = cabinet_irs
        self.reverb_irs = reverb_irs
        self.filtered_irs = cabinet_irs  # Start with cabinets

    def compose(self) -> ComposeResult:
        """Render IR browser."""
        yield Label("📢 Impulse Response Browser", classes="browser-title")

        # IR type tabs
        with Horizontal(classes="ir-type-tabs"):
            yield Button(
                "🎸 Cabinets",
                id="btn-tab-cabinet",
                classes="active-tab",
                variant="success"
            )
            yield Button(
                "🌊 Reverbs",
                id="btn-tab-reverb",
                variant="default"
            )

        # Search bar
        yield Input(
            placeholder="Search IR files...",
            id="ir-search",
            classes="search-bar"
        )

        # IR list
        with ScrollableContainer(classes="ir-list"):
            ir_list = ListView(id="ir-list-view")
            for ir in self.filtered_irs:
                name = ir.get("name", "Unknown")
                size = ir.get("samples", 0)
                sample_rate = ir.get("sample_rate", 48000)

                item_text = f"{name}\n{size} samples @ {sample_rate}Hz"
                ir_list.append(ListItem(Label(item_text), id=f"ir-{name}"))

            yield ir_list

        # IR info panel
        with Container(classes="ir-info"):
            yield Label("Select an IR to see details", id="ir-info-text")

        # Buttons
        with Horizontal(classes="button-bar"):
            yield Button("Load Selected", id="btn-load-selected", variant="success")
            yield Button("Cancel", id="btn-cancel", variant="default")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button clicks."""
        if event.button.id == "btn-tab-cabinet":
            self.action_switch_cabinets()
        elif event.button.id == "btn-tab-reverb":
            self.action_switch_reverbs()
        elif event.button.id == "btn-load-selected":
            self._load_selected()
        elif event.button.id == "btn-cancel":
            self.action_cancel()

    def action_switch_cabinets(self) -> None:
        """Switch to cabinet IR tab."""
        self.ir_type = "cabinet"
        self.filtered_irs = self.cabinet_irs
        self._update_tabs()
        self._refresh_list()

    def action_switch_reverbs(self) -> None:
        """Switch to reverb IR tab."""
        self.ir_type = "reverb"
        self.filtered_irs = self.reverb_irs
        self._update_tabs()
        self._refresh_list()

    def _update_tabs(self) -> None:
        """Update tab button styling."""
        cab_btn = self.query_one("#btn-tab-cabinet", Button)
        rev_btn = self.query_one("#btn-tab-reverb", Button)

        if self.ir_type == "cabinet":
            cab_btn.add_class("active-tab")
            cab_btn.variant = "success"
            rev_btn.remove_class("active-tab")
            rev_btn.variant = "default"
        else:
            rev_btn.add_class("active-tab")
            rev_btn.variant = "success"
            cab_btn.remove_class("active-tab")
            cab_btn.variant = "default"

    def on_input_changed(self, event: Input.Changed) -> None:
        """Filter IRs based on search query."""
        if event.input.id != "ir-search":
            return

        query = event.value.lower()
        self.search_query = query

        source_irs = self.cabinet_irs if self.ir_type == "cabinet" else self.reverb_irs

        if not query:
            self.filtered_irs = source_irs
        else:
            self.filtered_irs = [
                ir for ir in source_irs
                if query in ir.get("name", "").lower()
            ]

        self._refresh_list()

    def _refresh_list(self) -> None:
        """Refresh the IR list display."""
        list_view = self.query_one("#ir-list-view", ListView)
        list_view.clear()

        for ir in self.filtered_irs:
            name = ir.get("name", "Unknown")
            size = ir.get("samples", 0)
            sample_rate = ir.get("sample_rate", 48000)

            item_text = f"{name}\n{size} samples @ {sample_rate}Hz"
            list_view.append(ListItem(Label(item_text), id=f"ir-{name}"))

    def _load_selected(self) -> None:
        """Load the selected IR."""
        list_view = self.query_one("#ir-list-view", ListView)

        if list_view.index is not None and list_view.index < len(self.filtered_irs):
            ir = self.filtered_irs[list_view.index]
            ir_name = ir.get("name", "")

            self.post_message(self.IRSelected(ir_name, self.ir_type))

    def action_cancel(self) -> None:
        """Cancel and close browser."""
        self.remove()


class ChainTreeWidget(Tree):
    """
    Tree widget for displaying chains and their plugins hierarchically.

    Structure:
    - Root: "Chains"
      - Chain 1 (name, status, plugin count)
        - Plugin 1 (name, bypass status)
        - Plugin 2 (name, bypass status)
      - Chain 2
        - Plugin 1
        ...

    Features:
    - Expandable/collapsible chains
    - Real-time updates when plugins are added/removed
    - Visual status indicators (active/inactive)
    - Plugin bypass status display
    - Interactive selection

    Usage:
        tree = ChainTreeWidget(
            "Chains",
            on_chain_selected=lambda chain_id: handle_selection(chain_id),
            on_plugin_selected=lambda chain_id, plugin_uri: handle_plugin(chain_id, plugin_uri)
        )
        tree.update_chains(chains_data)
    """

    DEFAULT_CSS = """
    ChainTreeWidget {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $primary;
        padding: 1;
    }

    ChainTreeWidget:focus {
        border: solid $accent;
    }

    ChainTreeWidget .tree--guides {
        color: $primary;
    }

    ChainTreeWidget .tree--label {
        text-style: bold;
    }
    """

    class ChainSelected(Message):
        """Posted when a chain is selected."""
        def __init__(self, chain_id: int) -> None:
            self.chain_id = chain_id
            super().__init__()

    class PluginSelected(Message):
        """Posted when a plugin is selected."""
        def __init__(self, chain_id: int, plugin_uri: str) -> None:
            self.chain_id = chain_id
            self.plugin_uri = plugin_uri
            super().__init__()

    def __init__(
        self,
        label: str,
        on_chain_selected: Optional[Callable[[int], None]] = None,
        on_plugin_selected: Optional[Callable[[int, str], None]] = None,
        id: Optional[str] = None
    ):
        """
        Initialize the chain tree widget.

        Args:
            label: Root label for the tree
            on_chain_selected: Callback when a chain is selected
            on_plugin_selected: Callback when a plugin is selected
            id: Optional widget ID
        """
        super().__init__(label, id=id)
        self.on_chain_selected_callback = on_chain_selected
        self.on_plugin_selected_callback = on_plugin_selected
        self.chain_nodes: Dict[int, TreeNode] = {}
        self.plugin_nodes: Dict[str, TreeNode] = {}

    def update_chains(self, chains: List[Dict[str, Any]]) -> None:
        """
        Update the tree with new chain data.

        Args:
            chains: List of chain data dictionaries
        """
        # Clear existing chain nodes
        self.clear()
        self.chain_nodes.clear()
        self.plugin_nodes.clear()

        # Reset root
        self.root.expand()

        # Add each chain as a tree node
        for chain in chains:
            self._add_chain_node(chain)

    def _add_chain_node(self, chain: Dict[str, Any]) -> TreeNode:
        """
        Add a chain node to the tree.

        Args:
            chain: Chain data dictionary

        Returns:
            The created tree node
        """
        chain_id = chain.get("id", 0)
        name = chain.get("name", "Unknown")
        is_active = chain.get("is_active", False)
        plugins = chain.get("plugins", [])

        # Create label with status indicator
        status_icon = "🟢" if is_active else "⚪"
        label = f"{status_icon} {name} ({len(plugins)} plugins)"

        # Add chain node
        chain_node = self.root.add(label, data={"type": "chain", "id": chain_id})
        self.chain_nodes[chain_id] = chain_node

        # Add plugin nodes
        for plugin in plugins:
            self._add_plugin_node(chain_node, chain_id, plugin)

        # Expand if active
        if is_active:
            chain_node.expand()

        return chain_node

    def _add_plugin_node(
        self, parent_node: TreeNode, chain_id: int, plugin: Dict[str, Any]
    ) -> TreeNode:
        """
        Add a plugin node under a chain node.

        Args:
            parent_node: Parent chain node
            chain_id: Chain ID
            plugin: Plugin data dictionary

        Returns:
            The created plugin node
        """
        plugin_uri = plugin.get("uri", "")
        plugin_name = plugin.get("name", plugin_uri.split("/")[-1])
        bypassed = plugin.get("bypass", False)
        cpu_percent = plugin.get("cpu_percent", 0.0)

        # Get plugin icon using shared utility
        icon = get_plugin_icon(plugin_uri)

        # Create label with bypass status
        status = "[BY]" if bypassed else "[ON]"
        cpu_display = f" ({format_cpu_percent(cpu_percent)})" if cpu_percent > 0.1 else ""
        label = f"{icon} {plugin_name} {status}{cpu_display}"

        # Add plugin node
        plugin_node = parent_node.add(
            label,
            data={"type": "plugin", "chain_id": chain_id, "uri": plugin_uri}
        )

        # Store reference
        node_key = f"{chain_id}:{plugin_uri}"
        self.plugin_nodes[node_key] = plugin_node

        return plugin_node

    def add_plugin_to_chain(self, chain_id: int, plugin: Dict[str, Any]) -> None:
        """
        Add a new plugin to an existing chain in the tree.

        Args:
            chain_id: ID of the chain
            plugin: Plugin data dictionary
        """
        if chain_id not in self.chain_nodes:
            return

        chain_node = self.chain_nodes[chain_id]
        self._add_plugin_node(chain_node, chain_id, plugin)

        # Update chain label with new plugin count
        plugin_count = len(list(chain_node.children))
        current_label = str(chain_node.label)

        # Extract status icon and name
        parts = current_label.split(" (")
        if len(parts) >= 2:
            base_label = parts[0]
            chain_node.set_label(f"{base_label} ({plugin_count} plugins)")

        # Expand the chain to show the new plugin
        chain_node.expand()

    def remove_plugin_from_chain(self, chain_id: int, plugin_uri: str) -> None:
        """
        Remove a plugin from a chain in the tree.

        Args:
            chain_id: ID of the chain
            plugin_uri: URI of the plugin to remove
        """
        node_key = f"{chain_id}:{plugin_uri}"
        if node_key not in self.plugin_nodes:
            return

        plugin_node = self.plugin_nodes[node_key]
        plugin_node.remove()
        del self.plugin_nodes[node_key]

        # Update chain label with new plugin count
        if chain_id in self.chain_nodes:
            chain_node = self.chain_nodes[chain_id]
            plugin_count = len(list(chain_node.children))
            current_label = str(chain_node.label)

            # Extract status icon and name
            parts = current_label.split(" (")
            if len(parts) >= 2:
                base_label = parts[0]
                chain_node.set_label(f"{base_label} ({plugin_count} plugins)")

    def update_chain_status(self, chain_id: int, is_active: bool) -> None:
        """
        Update a chain's active status.

        Args:
            chain_id: ID of the chain
            is_active: New active status
        """
        if chain_id not in self.chain_nodes:
            return

        chain_node = self.chain_nodes[chain_id]
        current_label = str(chain_node.label)

        # Replace status icon
        status_icon = "🟢" if is_active else "⚪"
        new_label = current_label[2:]  # Remove old icon
        chain_node.set_label(f"{status_icon} {new_label}")

        # Expand if active, collapse if inactive
        if is_active:
            chain_node.expand()
        else:
            chain_node.collapse()

    def update_plugin_bypass(self, chain_id: int, plugin_uri: str, bypassed: bool) -> None:
        """
        Update a plugin's bypass status.

        Args:
            chain_id: ID of the chain
            plugin_uri: URI of the plugin
            bypassed: New bypass status
        """
        node_key = f"{chain_id}:{plugin_uri}"
        if node_key not in self.plugin_nodes:
            return

        plugin_node = self.plugin_nodes[node_key]
        current_label = str(plugin_node.label)

        # Update bypass status in label
        status = "[BY]" if bypassed else "[ON]"

        # Replace the status part
        if "[BY]" in current_label:
            new_label = current_label.replace("[BY]", status)
        elif "[ON]" in current_label:
            new_label = current_label.replace("[ON]", status)
        else:
            new_label = current_label + f" {status}"

        plugin_node.set_label(new_label)

    def on_tree_node_selected(self, event: Tree.NodeSelected) -> None:
        """Handle tree node selection."""
        node = event.node
        if node.data is None:
            return

        data_type = node.data.get("type")

        if data_type == "chain":
            chain_id = node.data.get("id")
            self.post_message(self.ChainSelected(chain_id))
            if self.on_chain_selected_callback:
                self.on_chain_selected_callback(chain_id)

        elif data_type == "plugin":
            chain_id = node.data.get("chain_id")
            plugin_uri = node.data.get("uri")
            self.post_message(self.PluginSelected(chain_id, plugin_uri))
            if self.on_plugin_selected_callback:
                self.on_plugin_selected_callback(chain_id, plugin_uri)


__all__ = [
    'StatusIndicator',
    'LoadingIndicator',
    'ActionButton',
    'MixControl',
    'BypassToggle',
    'PluginListItem',
    'ChainListItem',
    'PluginBlock',
    'SignalFlowWidget',
    'ParameterControl',
    'ParameterEditor',
    'PluginBrowser',
    'IRBrowser',
    'ChainTreeWidget',
]

"""
Interactive Guitar Chain Screen
NAM models, Cabinet IRs, Reverb IRs with load/bypass/mix controls
"""

from typing import Optional, List, Dict, Any
from pathlib import Path
from textual.app import ComposeResult
from textual.widgets import Static, Button, Label, Select, Input
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.reactive import reactive

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from api_client import MAP2APIClient
from modals import NumberInputDialog
from widgets import ActionButton, LoadingIndicator, MixControl, BypassToggle


class GuitarChainScreen(ScrollableContainer):
    """
    Interactive Guitar Chain screen.

    Features:
    - Load NAM amp models
    - Load Cabinet IRs
    - Load Reverb IRs
    - Adjust mix levels for each stage
    - Toggle bypass for each stage
    - Visual signal flow display
    """

    CSS = """
    GuitarChainScreen {
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

    .signal-flow {
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
        text-align: center;
    }

    .stage-section {
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    .active-item {
        color: $success;
        text-style: bold;
    }

    .item-list {
        max-height: 10;
        padding: 1 0;
    }

    .item-card {
        background: $panel-lighten-1;
        border: solid $primary-lighten-1;
        padding: 1;
        margin-bottom: 1;
    }

    .item-card:hover {
        background: $panel-lighten-2;
    }

    .control-buttons Button {
        margin: 0 1 1 0;
        min-width: 15;
    }
    """

    guitar_data: reactive[Dict[str, Any]] = reactive({})
    nam_models: reactive[List[Dict[str, Any]]] = reactive([])
    cabinet_irs: reactive[List[Dict[str, Any]]] = reactive([])
    reverb_irs: reactive[List[Dict[str, Any]]] = reactive([])

    def __init__(self, api_client: MAP2APIClient, id: Optional[str] = None):
        """
        Initialize Guitar Chain screen.

        Args:
            api_client: API client instance
            id: Optional screen ID
        """
        super().__init__(id=id)
        self.api_client = api_client

    def compose(self) -> ComposeResult:
        """Compose guitar chain screen widgets."""
        yield Label("🎸 Guitar Processing Chain", classes="section-title")

            # Loading Indicator
        yield LoadingIndicator("Loading guitar chain...", id="loading-guitar")

            # Signal Flow Visualization
        with Container(classes="signal-flow"):
            yield Label("Signal Flow", classes="section-title")
            yield Static("", id="signal-flow-display")

            # NAM Models Section
        with Container(classes="stage-section"):
            yield Label("🎚️ NAM Amp Models", classes="section-title")
            yield Static("", id="nam-status")
            yield BypassToggle("NAM Stage", id="bypass-nam", on_toggle=self._toggle_nam_bypass)
            yield MixControl("NAM Mix", default_value=100.0, id="mix-nam", on_change=self._set_nam_mix)
            with Horizontal(classes="control-buttons"):
                yield ActionButton("📁 Upload NAM", variant="primary", id="btn-upload-nam")
                yield ActionButton("➕ Add NAM Loader to Chain", variant="success", id="btn-add-nam-loader")
            with Horizontal(classes="control-buttons"):
                yield Input(placeholder="/path/to/model.nam", id="input-nam-path")
            with Vertical(classes="item-list", id="nam-list"):
                yield Label("Loading models...", id="nam-empty")

            # Cabinet IRs Section
        with Container(classes="stage-section"):
            yield Label("🔊 Cabinet IRs", classes="section-title")
            yield Static("", id="cabinet-status")
            yield BypassToggle("Cabinet Stage", id="bypass-cabinet", on_toggle=self._toggle_cabinet_bypass)
            yield MixControl("Cabinet Mix", default_value=100.0, id="mix-cabinet", on_change=self._set_cabinet_mix)
            with Horizontal(classes="control-buttons"):
                yield ActionButton("📁 Upload Cabinet IR", variant="primary", id="btn-upload-cabinet")
                yield ActionButton("➕ Add Cabinet Loader to Chain", variant="success", id="btn-add-cabinet-loader")
            with Horizontal(classes="control-buttons"):
                yield Input(placeholder="/path/to/cabinet.wav", id="input-cabinet-path")
            with Vertical(classes="item-list", id="cabinet-list"):
                yield Label("Loading IRs...", id="cabinet-empty")

            # Reverb IRs Section
        with Container(classes="stage-section"):
            yield Label("✨ Reverb IRs", classes="section-title")
            yield Static("", id="reverb-status")
            yield BypassToggle("Reverb Stage", id="bypass-reverb", on_toggle=self._toggle_reverb_bypass)
            yield MixControl("Reverb Mix", default_value=30.0, id="mix-reverb", on_change=self._set_reverb_mix)
            with Horizontal(classes="control-buttons"):
                yield ActionButton("📁 Upload Reverb IR", variant="primary", id="btn-upload-reverb")
                yield ActionButton("➕ Add Reverb Loader to Chain", variant="success", id="btn-add-reverb-loader")
            with Horizontal(classes="control-buttons"):
                yield Input(placeholder="/path/to/reverb.wav", id="input-reverb-path")
            with Vertical(classes="item-list", id="reverb-list"):
                yield Label("Loading IRs...", id="reverb-empty")

            # File Paths Information
        with Container(classes="stage-section"):
            yield Label("📁 Model & IR File Paths", classes="section-title")
            yield Static("[dim]NAM Models:[/dim]     ~/.local/share/map2/nam")
            yield Static("[dim]Cabinet IRs:[/dim]    ~/.local/share/map2/ir/cabinets")
            yield Static("[dim]Reverb IRs:[/dim]     ~/.local/share/map2/ir/reverbs")

            # Refresh Button
        with Container(classes="stage-section"):
            with Horizontal(classes="control-buttons"):
                yield ActionButton("🔄 Refresh", variant="primary", id="btn-refresh")

    async def on_mount(self) -> None:
        """Called when screen is mounted."""
        await self.refresh_data()
        self.set_interval(5.0, self.refresh_data)

    async def refresh_data(self) -> None:
        """Refresh guitar chain data."""
        loading = self.query_one("#loading-guitar", LoadingIndicator)
        loading.show("Refreshing guitar chain...")

        try:
            # Fetch guitar chain status
            status_result = await self.api_client.get_guitar_status()
            if status_result.success:
                self.guitar_data = status_result.data
                self._update_signal_flow()
                self._update_status_displays()
                self._update_bypass_states()
                self._update_mix_controls()

            # Fetch NAM models
            nam_result = await self.api_client.list_nam_models()
            if nam_result.success:
                self.nam_models = nam_result.data.get("models", [])
                self._update_nam_list()

            # Fetch cabinet IRs
            cab_result = await self.api_client.list_cabinet_irs()
            if cab_result.success:
                self.cabinet_irs = cab_result.data.get("irs", [])
                self._update_cabinet_list()

            # Fetch reverb IRs
            rev_result = await self.api_client.list_reverb_irs()
            if rev_result.success:
                self.reverb_irs = rev_result.data.get("irs", [])
                self._update_reverb_list()

        except Exception as e:
            self.app.notify(f"Error refreshing data: {str(e)}", severity="error")
        finally:
            loading.hide()

    def _update_signal_flow(self) -> None:
        """Update signal flow visualization."""
        nam_status = self.guitar_data.get("nam", {})
        ir_data = self.guitar_data.get("ir", {})
        bypass_data = self.guitar_data.get("bypass", {})

        nam_active = nam_status.get("active_model") is not None
        nam_bypassed = bypass_data.get("nam", False)
        cab_active = ir_data.get("active_cabinet") is not None
        cab_bypassed = bypass_data.get("cabinet", False)
        rev_active = ir_data.get("active_reverb") is not None
        rev_bypassed = bypass_data.get("reverb", False)

        # Build flow display
        if nam_bypassed:
            nam_stage = "[dim strikethrough]NAM Amp[/dim strikethrough]"
        elif nam_active:
            nam_stage = "[green]NAM Amp[/green]"
        else:
            nam_stage = "[dim]NAM Amp[/dim]"

        if cab_bypassed:
            cab_stage = "[dim strikethrough]Cabinet IR[/dim strikethrough]"
        elif cab_active:
            cab_stage = "[green]Cabinet IR[/green]"
        else:
            cab_stage = "[dim]Cabinet IR[/dim]"

        if rev_bypassed:
            rev_stage = "[dim strikethrough]Reverb IR[/dim strikethrough]"
        elif rev_active:
            rev_stage = "[green]Reverb IR[/green]"
        else:
            rev_stage = "[dim]Reverb IR[/dim]"

        flow_display = self.query_one("#signal-flow-display", Static)
        flow_display.update(f"{nam_stage} → {cab_stage} → {rev_stage}")

    def _update_status_displays(self) -> None:
        """Update status text for each stage."""
        nam_status = self.guitar_data.get("nam", {})
        ir_data = self.guitar_data.get("ir", {})

        # NAM status
        nam_widget = self.query_one("#nam-status", Static)
        active_model = nam_status.get("active_model")
        if active_model:
            nam_widget.update(f"Active Model: [green]{active_model}[/green]")
        else:
            nam_widget.update("[dim]No model loaded[/dim]")

        # Cabinet status
        cab_widget = self.query_one("#cabinet-status", Static)
        active_cabinet = ir_data.get("active_cabinet")
        if active_cabinet:
            cab_widget.update(f"Active IR: [green]{active_cabinet}[/green]")
        else:
            cab_widget.update("[dim]No IR loaded[/dim]")

        # Reverb status
        rev_widget = self.query_one("#reverb-status", Static)
        active_reverb = ir_data.get("active_reverb")
        if active_reverb:
            rev_widget.update(f"Active IR: [green]{active_reverb}[/green]")
        else:
            rev_widget.update("[dim]No IR loaded[/dim]")

    def _update_bypass_states(self) -> None:
        """Update bypass toggle states."""
        bypass_data = self.guitar_data.get("bypass", {})

        nam_toggle = self.query_one("#bypass-nam", BypassToggle)
        nam_toggle.set_state(bypass_data.get("nam", False))

        cab_toggle = self.query_one("#bypass-cabinet", BypassToggle)
        cab_toggle.set_state(bypass_data.get("cabinet", False))

        rev_toggle = self.query_one("#bypass-reverb", BypassToggle)
        rev_toggle.set_state(bypass_data.get("reverb", False))

    def _update_mix_controls(self) -> None:
        """Update mix control values."""
        mix_data = self.guitar_data.get("mix", {})

        nam_mix = self.query_one("#mix-nam", MixControl)
        nam_mix.value = mix_data.get("nam", 1.0) * 100

        cab_mix = self.query_one("#mix-cabinet", MixControl)
        cab_mix.value = mix_data.get("cabinet", 1.0) * 100

        rev_mix = self.query_one("#mix-reverb", MixControl)
        rev_mix.value = mix_data.get("reverb", 0.3) * 100

    def _update_nam_list(self) -> None:
        """Update NAM models list."""
        nam_list = self.query_one("#nam-list", Vertical)
        empty = self.query_one("#nam-empty", Label)

        # Clear existing items
        for widget in list(nam_list.children):
            if widget.id != "nam-empty":
                widget.remove()

        if not self.nam_models:
            empty.update("No NAM models found")
            empty.display = True
            return

        empty.display = False

        # Add model cards (show first 5)
        for model in self.nam_models[:5]:
            card = self._create_item_card(model, "nam")
            nam_list.mount(card)

        if len(self.nam_models) > 5:
            nam_list.mount(Label(f"[dim]... and {len(self.nam_models) - 5} more models[/dim]"))

    def _update_cabinet_list(self) -> None:
        """Update cabinet IRs list."""
        cab_list = self.query_one("#cabinet-list", Vertical)
        empty = self.query_one("#cabinet-empty", Label)

        # Clear existing items
        for widget in list(cab_list.children):
            if widget.id != "cabinet-empty":
                widget.remove()

        if not self.cabinet_irs:
            empty.update("No cabinet IRs found")
            empty.display = True
            return

        empty.display = False

        # Add IR cards (show first 5)
        for ir in self.cabinet_irs[:5]:
            card = self._create_item_card(ir, "cabinet")
            cab_list.mount(card)

        if len(self.cabinet_irs) > 5:
            cab_list.mount(Label(f"[dim]... and {len(self.cabinet_irs) - 5} more IRs[/dim]"))

    def _update_reverb_list(self) -> None:
        """Update reverb IRs list."""
        rev_list = self.query_one("#reverb-list", Vertical)
        empty = self.query_one("#reverb-empty", Label)

        # Clear existing items
        for widget in list(rev_list.children):
            if widget.id != "reverb-empty":
                widget.remove()

        if not self.reverb_irs:
            empty.update("No reverb IRs found")
            empty.display = True
            return

        empty.display = False

        # Add IR cards (show first 5)
        for ir in self.reverb_irs[:5]:
            card = self._create_item_card(ir, "reverb")
            rev_list.mount(card)

        if len(self.reverb_irs) > 5:
            rev_list.mount(Label(f"[dim]... and {len(self.reverb_irs) - 5} more IRs[/dim]"))

    def _create_item_card(self, item: Dict[str, Any], item_type: str) -> Container:
        """Create an item card with load button."""
        name = item.get("name", "Unknown")
        size = item.get("size_mb", 0)

        card = Container(classes="item-card")
        header = Horizontal()

        header.mount(Label(f"{name} ({size:.1f} MB)"))
        header.mount(
            ActionButton(
                "Load",
                variant="primary",
                id=f"btn-load-{item_type}-{hash(name)}"
            )
        )

        card.mount(header)
        card.item_name = name
        card.item_type = item_type

        return card

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button clicks."""
        button_id = event.button.id

        if button_id == "btn-refresh":
            await self.refresh_data()
        elif button_id == "btn-upload-nam":
            await self._upload_nam()
        elif button_id == "btn-upload-cabinet":
            await self._upload_cabinet()
        elif button_id == "btn-upload-reverb":
            await self._upload_reverb()
        elif button_id == "btn-add-nam-loader":
            await self._add_nam_loader_to_chain()
        elif button_id == "btn-add-cabinet-loader":
            await self._add_cabinet_loader_to_chain()
        elif button_id == "btn-add-reverb-loader":
            await self._add_reverb_loader_to_chain()
        elif button_id and button_id.startswith("btn-load-"):
            # Extract type and find parent card
            parent = event.button.parent.parent
            if hasattr(parent, 'item_name') and hasattr(parent, 'item_type'):
                await self._load_item(parent.item_type, parent.item_name)

    async def _load_item(self, item_type: str, name: str) -> None:
        """Load a NAM model or IR."""
        loading = self.query_one("#loading-guitar", LoadingIndicator)
        loading.show(f"Loading {name}...")

        if item_type == "nam":
            result = await self.api_client.load_nam_model(name)
        elif item_type == "cabinet":
            result = await self.api_client.load_cabinet_ir(name)
        elif item_type == "reverb":
            result = await self.api_client.load_reverb_ir(name)
        else:
            loading.hide()
            return

        loading.hide()

        if result.success:
            self.app.notify(f"{name} loaded successfully", severity="information")
            await self.refresh_data()
        else:
            self.app.notify(f"Failed to load {name}: {result.error}", severity="error")

    async def _toggle_nam_bypass(self, bypassed: bool) -> None:
        """Toggle NAM bypass."""
        result = await self.api_client.set_guitar_bypass(nam=bypassed)
        if result.success:
            self.app.notify(f"NAM {'bypassed' if bypassed else 'active'}", severity="information")
            await self.refresh_data()
        else:
            self.app.notify(f"Failed to toggle bypass: {result.error}", severity="error")

    async def _toggle_cabinet_bypass(self, bypassed: bool) -> None:
        """Toggle cabinet bypass."""
        result = await self.api_client.set_guitar_bypass(cabinet=bypassed)
        if result.success:
            self.app.notify(f"Cabinet {'bypassed' if bypassed else 'active'}", severity="information")
            await self.refresh_data()
        else:
            self.app.notify(f"Failed to toggle bypass: {result.error}", severity="error")

    async def _toggle_reverb_bypass(self, bypassed: bool) -> None:
        """Toggle reverb bypass."""
        result = await self.api_client.set_guitar_bypass(reverb=bypassed)
        if result.success:
            self.app.notify(f"Reverb {'bypassed' if bypassed else 'active'}", severity="information")
            await self.refresh_data()
        else:
            self.app.notify(f"Failed to toggle bypass: {result.error}", severity="error")

    async def _set_nam_mix(self, value: float) -> None:
        """Set NAM mix level."""
        result = await self.api_client.set_guitar_mix(nam=value / 100.0)
        if result.success:
            self.app.notify(f"NAM mix set to {value:.0f}%", severity="information")
        else:
            self.app.notify(f"Failed to set mix: {result.error}", severity="error")

    async def _set_cabinet_mix(self, value: float) -> None:
        """Set cabinet mix level."""
        result = await self.api_client.set_guitar_mix(cabinet=value / 100.0)
        if result.success:
            self.app.notify(f"Cabinet mix set to {value:.0f}%", severity="information")
        else:
            self.app.notify(f"Failed to set mix: {result.error}", severity="error")

    async def _set_reverb_mix(self, value: float) -> None:
        """Set reverb mix level."""
        result = await self.api_client.set_guitar_mix(reverb=value / 100.0)
        if result.success:
            self.app.notify(f"Reverb mix set to {value:.0f}%", severity="information")
        else:
            self.app.notify(f"Failed to set mix: {result.error}", severity="error")

    async def _upload_nam(self) -> None:
        """Upload NAM model file."""
        input_widget = self.query_one("#input-nam-path", Input)
        file_path = input_widget.value.strip()

        if not file_path:
            self.app.notify("Please enter a file path", severity="warning")
            return

        loading = self.query_one("#loading-guitar", LoadingIndicator)
        loading.show(f"Uploading NAM model...")

        result = await self.api_client.upload_nam_model(file_path)
        loading.hide()

        if result.success:
            self.app.notify(f"NAM model uploaded successfully", severity="information")
            input_widget.value = ""
            await self.refresh_data()
        else:
            self.app.notify(f"Failed to upload: {result.error}", severity="error")

    async def _upload_cabinet(self) -> None:
        """Upload Cabinet IR file."""
        input_widget = self.query_one("#input-cabinet-path", Input)
        file_path = input_widget.value.strip()

        if not file_path:
            self.app.notify("Please enter a file path", severity="warning")
            return

        loading = self.query_one("#loading-guitar", LoadingIndicator)
        loading.show(f"Uploading Cabinet IR...")

        result = await self.api_client.upload_cabinet_ir(file_path)
        loading.hide()

        if result.success:
            self.app.notify(f"Cabinet IR uploaded successfully", severity="information")
            input_widget.value = ""
            await self.refresh_data()
        else:
            self.app.notify(f"Failed to upload: {result.error}", severity="error")

    async def _upload_reverb(self) -> None:
        """Upload Reverb IR file."""
        input_widget = self.query_one("#input-reverb-path", Input)
        file_path = input_widget.value.strip()

        if not file_path:
            self.app.notify("Please enter a file path", severity="warning")
            return

        loading = self.query_one("#loading-guitar", LoadingIndicator)
        loading.show(f"Uploading Reverb IR...")

        result = await self.api_client.upload_reverb_ir(file_path)
        loading.hide()

        if result.success:
            self.app.notify(f"Reverb IR uploaded successfully", severity="information")
            input_widget.value = ""
            await self.refresh_data()
        else:
            self.app.notify(f"Failed to upload: {result.error}", severity="error")

    async def _add_nam_loader_to_chain(self) -> None:
        """Add NAM loader plugin to current chain."""
        # For the guitar chain, we use a fixed approach since NAM is integrated
        # This would typically involve adding a NAM plugin to the main pedalboard chain
        self.app.notify(
            "NAM is integrated into the guitar chain. Use 'Load' on a model to activate it.",
            severity="information"
        )

    async def _add_cabinet_loader_to_chain(self) -> None:
        """Add Cabinet IR loader plugin to current chain."""
        # For the guitar chain, Cabinet IR is integrated
        # This would typically involve adding a convolution plugin to the main pedalboard chain
        self.app.notify(
            "Cabinet IR is integrated into the guitar chain. Use 'Load' on an IR to activate it.",
            severity="information"
        )

    async def _add_reverb_loader_to_chain(self) -> None:
        """Add Reverb IR loader plugin to current chain."""
        # For the guitar chain, Reverb IR is integrated
        # This would typically involve adding a convolution plugin to the main pedalboard chain
        self.app.notify(
            "Reverb IR is integrated into the guitar chain. Use 'Load' on an IR to activate it.",
            severity="information"
        )

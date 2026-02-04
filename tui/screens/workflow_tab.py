"""
Workflow & Content Management Tab
Sessions, Presets, NAM Models, Templates, and System Tools
"""

import asyncio
from pathlib import Path
from typing import Optional, List, Dict, Any

from textual.app import ComposeResult
from textual.widgets import Static, Button, Label, Input, OptionList, DataTable
from textual.widgets.option_list import Option
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.reactive import reactive

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from ..api_client import MAP2APIClient


class ControlPanel(Container):
    """Control panel with title and buttons."""

    DEFAULT_CSS = """
    ControlPanel {
        height: auto;
        border: solid $primary;
        background: $panel;
        padding: 0 1;
        margin-bottom: 1;
    }

    ControlPanel .panel-title {
        width: 100%;
        height: 1;
        text-style: bold;
        color: $accent;
    }

    ControlPanel .btn-row {
        width: 100%;
        height: auto;
        margin-top: 0;
    }

    ControlPanel Button {
        width: 1fr;
        height: 3;
        min-width: 10;
        text-style: bold;
        margin: 0 1 0 0;
    }

    ControlPanel Button:last-child {
        margin-right: 0;
    }

    ControlPanel .info-box {
        width: 100%;
        min-height: 2;
        border: solid $primary-darken-1;
        background: $panel-darken-1;
        padding: 0 1;
        margin: 0;
        color: $text-muted;
    }

    ControlPanel OptionList {
        height: 5;
        border: solid $primary-darken-1;
        margin: 0;
    }

    ControlPanel Input {
        width: 1fr;
        margin-right: 1;
    }

    ControlPanel .input-row {
        width: 100%;
        height: auto;
        margin: 0;
    }
    """

    def __init__(self, title: str, icon: str = "", *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.panel_title = f"{icon} {title}" if icon else title

    def compose(self) -> ComposeResult:
        yield Label(self.panel_title, classes="panel-title")


class WorkflowTab(ScrollableContainer):
    """Workflow and content management tab."""

    CSS = """
    WorkflowTab {
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
        width: 50%;
        height: auto;
        padding-right: 1;
    }

    .col-right {
        width: 50%;
        height: auto;
        padding-left: 1;
    }

    .btn-green {
        background: $success;
        color: $text;
    }

    .btn-green:hover {
        background: $success-lighten-1;
    }

    .btn-red {
        background: $error;
        color: $text;
    }

    .btn-red:hover {
        background: $error-lighten-1;
    }

    .btn-yellow {
        background: $warning;
        color: #000000;
    }

    .btn-yellow:hover {
        background: $warning-lighten-1;
    }

    .btn-blue {
        background: $primary;
        color: $text;
    }

    .btn-blue:hover {
        background: $primary-lighten-1;
    }
    """

    def __init__(self, api_client: MAP2APIClient, id: Optional[str] = None):
        super().__init__(id=id)
        self.api_client = api_client
        self.project_root = Path("/home/mm/map2-audio")
        self.sessions = []
        self.presets = []
        self.templates = []

    def compose(self) -> ComposeResult:
        """Build workflow UI."""

        # Main Header
        yield Label("📁 WORKFLOW & CONTENT MANAGEMENT", classes="main-header")

        # Two Column Layout
        with Horizontal(classes="two-col"):

            # ═══════════════════════════════════════════════════════════
            # LEFT COLUMN
            # ═══════════════════════════════════════════════════════════
            with Vertical(classes="col-left"):

                # Sessions Management
                with ControlPanel("SESSIONS", "📁"):
                    yield Static("Total: 0 | Current: None", id="session-info", classes="info-box")
                    yield OptionList(id="session-list")
                    with Horizontal(classes="input-row"):
                        yield Input(placeholder="New session...", id="input-session")
                        yield Button("💾", id="btn-session-save", classes="btn-green")
                    with Horizontal(classes="btn-row"):
                        yield Button("📂 LOAD", id="btn-session-load", classes="btn-green")
                        yield Button("🗑️ DEL", id="btn-session-delete", classes="btn-red")
                        yield Button("🔄 REFR", id="btn-session-refresh", classes="btn-blue")

                # Presets Management
                with ControlPanel("PRESETS", "🎚️"):
                    yield Static("Total: 0 | Loaded: None", id="preset-info", classes="info-box")
                    yield OptionList(id="preset-list")
                    with Horizontal(classes="btn-row"):
                        yield Button("📂 LOAD", id="btn-preset-load", classes="btn-green")
                        yield Button("🗑️ DEL", id="btn-preset-delete", classes="btn-red")
                        yield Button("🔄 REFR", id="btn-preset-refresh", classes="btn-blue")

                # Templates
                with ControlPanel("TEMPLATES", "📋"):
                    yield Static("Available: 0 | Category: All", id="template-info", classes="info-box")
                    yield OptionList(id="template-list")
                    with Horizontal(classes="btn-row"):
                        yield Button("📂 LOAD", id="btn-template-load", classes="btn-green")
                        yield Button("🔄 REFR", id="btn-template-refresh", classes="btn-blue")

            # ═══════════════════════════════════════════════════════════
            # RIGHT COLUMN
            # ═══════════════════════════════════════════════════════════
            with Vertical(classes="col-right"):

                # NAM Models & IRs
                with ControlPanel("NAM & IRs", "🎸"):
                    yield Static("NAM: 0 | Cabs: 0 | Reverbs: 0", id="nam-info", classes="info-box")
                    with Horizontal(classes="btn-row"):
                        yield Button("🎸 MODELS", id="btn-nam-models", classes="btn-yellow")
                        yield Button("🔊 CABS", id="btn-cabinet-irs", classes="btn-yellow")
                        yield Button("✨ REVERB", id="btn-reverb-irs", classes="btn-yellow")
                    with Horizontal(classes="btn-row"):
                        yield Button("📊 STATUS", id="btn-nam-status", classes="btn-blue")
                        yield Button("🔄 SCAN", id="btn-nam-scan", classes="btn-blue")

                # LCD Display Control
                with ControlPanel("LCD DISPLAY", "🖥️"):
                    yield Static("Page: ... | Active: ... | Brightness: ...", id="lcd-info", classes="info-box")
                    with Horizontal(classes="btn-row"):
                        yield Button("📊 STAT", id="btn-lcd-status", classes="btn-blue")
                        yield Button("📈 VU", id="btn-lcd-vu", classes="btn-blue")
                        yield Button("🔗 CHAIN", id="btn-lcd-chain", classes="btn-blue")
                        yield Button("⚡ PERF", id="btn-lcd-perf", classes="btn-blue")

                # System Tools
                with ControlPanel("SYSTEM", "🔧"):
                    yield Static("Uptime: ... | Health: ... | Version: ...", id="system-info", classes="info-box")
                    with Horizontal(classes="btn-row"):
                        yield Button("💊 HEALTH", id="btn-health", classes="btn-green")
                        yield Button("🔍 RT CHK", id="btn-rt-check", classes="btn-yellow")
                        yield Button("📋 LOGS", id="btn-logs", classes="btn-blue")
                    with Horizontal(classes="btn-row"):
                        yield Button("🔄 RELOAD", id="btn-reload", classes="btn-yellow")
                        yield Button("🧹 CLEAN", id="btn-clean", classes="btn-red")
                        yield Button("📊 STATS", id="btn-stats", classes="btn-blue")
                    yield Static("CPU: ...% | Mem: ... MB | DSP: ...%", id="metrics-display", classes="info-box")

    async def on_mount(self) -> None:
        """Initialize on mount."""
        try:
            await self._refresh_all_lists()
            self.set_interval(5.0, self.refresh_data)
        except Exception as e:
            self.log.error(f"Mount error: {e}")

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle all button clicks with proper error handling."""
        btn_id = event.button.id
        if not btn_id:
            return

        try:
            # Sessions
            if btn_id == "btn-session-save":
                await self._save_session()
            elif btn_id == "btn-session-load":
                await self._load_session()
            elif btn_id == "btn-session-delete":
                await self._delete_session()
            elif btn_id == "btn-session-refresh":
                await self._refresh_sessions()

            # Presets
            elif btn_id == "btn-preset-load":
                await self._load_preset()
            elif btn_id == "btn-preset-delete":
                await self._delete_preset()
            elif btn_id == "btn-preset-refresh":
                await self._refresh_presets()

            # NAM
            elif btn_id == "btn-nam-status":
                await self._show_nam_status()
            elif btn_id == "btn-nam-models":
                await self._show_nam_models()
            elif btn_id == "btn-cabinet-irs":
                await self._show_cabinet_irs()
            elif btn_id == "btn-reverb-irs":
                await self._show_reverb_irs()
            elif btn_id == "btn-nam-scan":
                self.app.notify("NAM rescan coming soon", severity="information", timeout=2)

            # LCD
            elif btn_id == "btn-lcd-status":
                await self._lcd_set_page("status")
            elif btn_id == "btn-lcd-vu":
                await self._lcd_set_page("vu")
            elif btn_id == "btn-lcd-chain":
                await self._lcd_set_page("chain")
            elif btn_id == "btn-lcd-perf":
                await self._lcd_set_page("perf")

            # Templates
            elif btn_id == "btn-template-load":
                await self._load_template()
            elif btn_id == "btn-template-refresh":
                await self._refresh_templates()

            # System
            elif btn_id == "btn-health":
                await self._run_health_check()
            elif btn_id == "btn-rt-check":
                await self._run_rt_check()
            elif btn_id == "btn-logs":
                await self._show_logs()
            elif btn_id == "btn-reload":
                await self._reload_config()
            elif btn_id == "btn-clean":
                self.app.notify("System cleanup coming soon", severity="information", timeout=2)
            elif btn_id == "btn-stats":
                self.app.notify("System statistics coming soon", severity="information", timeout=2)

        except Exception as e:
            self.app.notify(f"Error: {str(e)}", severity="error", timeout=5)
            self.log.error(f"Button handler error for {btn_id}: {e}")

    async def refresh_data(self) -> None:
        """Update all status displays with safe error handling."""
        try:
            # Performance metrics
            try:
                result = await self.api_client.get_metrics()
                metrics = result.data if hasattr(result, 'data') else result
                if metrics:
                    cpu = metrics.get("cpu_percent", 0)
                    mem = metrics.get("memory_mb", 0)
                    rt_load = metrics.get("dsp_load", 0)

                    # Update metrics display
                    metrics_text = f"CPU: [cyan]{cpu:.1f}%[/] | Mem: [cyan]{mem:.0f} MB[/] | DSP: [cyan]{rt_load:.1f}%[/]"
                    self.query_one("#metrics-display", Static).update(metrics_text)
            except Exception as e:
                self.log.error(f"Error getting metrics: {e}")

        except Exception as e:
            self.log.error(f"Error refreshing data: {e}")

    async def _refresh_all_lists(self) -> None:
        """Refresh all option lists safely."""
        await self._refresh_sessions()
        await self._refresh_presets()
        await self._refresh_templates()

    async def _refresh_sessions(self) -> None:
        """Refresh sessions list."""
        try:
            result = await self.api_client.list_sessions()
            if result.success and result.data:
                sessions = result.data
                session_list = self.query_one("#session-list", OptionList)
                session_list.clear_options()
                for session in sessions:
                    name = session.get('name', 'Unknown') if isinstance(session, dict) else str(session)
                    session_list.add_option(Option(name, id=name))

                # Update info box
                count = len(sessions)
                self.query_one("#session-info", Static).update(f"Total: {count} | Current: None")
        except Exception as e:
            self.log.error(f"Error refreshing sessions: {e}")

    async def _refresh_presets(self) -> None:
        """Refresh presets list."""
        try:
            result = await self.api_client.list_presets()
            if result.success and result.data:
                presets = result.data
                preset_list = self.query_one("#preset-list", OptionList)
                preset_list.clear_options()
                for preset in presets:
                    name = preset.get('name', 'Unknown') if isinstance(preset, dict) else str(preset)
                    preset_list.add_option(Option(name, id=name))

                # Update info box
                count = len(presets)
                self.query_one("#preset-info", Static).update(f"Total: {count} | Loaded: None")
        except Exception as e:
            self.log.error(f"Error refreshing presets: {e}")

    async def _refresh_templates(self) -> None:
        """Refresh templates list."""
        try:
            result = await self.api_client.list_templates()
            if result.success and result.data:
                templates = result.data
                template_list = self.query_one("#template-list", OptionList)
                template_list.clear_options()
                for template in templates:
                    name = template.get('name', 'Unknown') if isinstance(template, dict) else str(template)
                    template_list.add_option(Option(name, id=name))

                # Update info box
                count = len(templates)
                self.query_one("#template-info", Static).update(f"Available: {count} | Category: All")
        except Exception as e:
            self.log.error(f"Error refreshing templates: {e}")

    # ═══════════════════════════════════════════════════════════════════════
    # Session Methods
    # ═══════════════════════════════════════════════════════════════════════

    async def _save_session(self) -> None:
        input_widget = self.query_one("#input-session", Input)
        name = input_widget.value.strip()
        if not name:
            self.app.notify("⚠️ Please enter session name", severity="warning", timeout=2)
            return

        result = await self.api_client.save_session(name)
        if result.success:
            self.app.notify(f"💾 Saved session: {name}", severity="information", timeout=2)
            input_widget.value = ""
            await self._refresh_sessions()
        else:
            self.app.notify(f"❌ Failed to save: {result.error}", severity="error", timeout=3)

    async def _load_session(self) -> None:
        session_list = self.query_one("#session-list", OptionList)
        if session_list.highlighted is None:
            self.app.notify("⚠️ No session selected", severity="warning", timeout=2)
            return

        option = session_list.get_option_at_index(session_list.highlighted)
        session_id = option.id

        result = await self.api_client.load_session(int(session_id) if str(session_id).isdigit() else 0)
        if result.success:
            self.app.notify(f"📂 Loaded session: {option.prompt}", severity="information", timeout=2)
        else:
            self.app.notify(f"❌ Failed to load: {result.error}", severity="error", timeout=3)

    async def _delete_session(self) -> None:
        session_list = self.query_one("#session-list", OptionList)
        if session_list.highlighted is None:
            self.app.notify("⚠️ No session selected", severity="warning", timeout=2)
            return

        option = session_list.get_option_at_index(session_list.highlighted)
        session_id = option.id

        result = await self.api_client.delete_session(int(session_id) if str(session_id).isdigit() else 0)
        if result.success:
            self.app.notify(f"🗑️ Deleted session: {option.prompt}", severity="warning", timeout=2)
            await self._refresh_sessions()
        else:
            self.app.notify(f"❌ Failed to delete: {result.error}", severity="error", timeout=3)

    # ═══════════════════════════════════════════════════════════════════════
    # Preset Methods
    # ═══════════════════════════════════════════════════════════════════════

    async def _load_preset(self) -> None:
        preset_list = self.query_one("#preset-list", OptionList)
        if preset_list.highlighted is None:
            self.app.notify("⚠️ No preset selected", severity="warning", timeout=2)
            return

        option = preset_list.get_option_at_index(preset_list.highlighted)
        preset_id = option.id

        result = await self.api_client.load_preset(int(preset_id) if str(preset_id).isdigit() else 0)
        if result.success:
            self.app.notify(f"📂 Loaded preset: {option.prompt}", severity="information", timeout=2)
        else:
            self.app.notify(f"❌ Failed to load: {result.error}", severity="error", timeout=3)

    async def _delete_preset(self) -> None:
        preset_list = self.query_one("#preset-list", OptionList)
        if preset_list.highlighted is None:
            self.app.notify("⚠️ No preset selected", severity="warning", timeout=2)
            return

        option = preset_list.get_option_at_index(preset_list.highlighted)
        preset_id = option.id

        result = await self.api_client.delete_preset(int(preset_id) if str(preset_id).isdigit() else 0)
        if result.success:
            self.app.notify(f"🗑️ Deleted preset: {option.prompt}", severity="warning", timeout=2)
            await self._refresh_presets()
        else:
            self.app.notify(f"❌ Failed to delete: {result.error}", severity="error", timeout=3)

    # ═══════════════════════════════════════════════════════════════════════
    # NAM Methods
    # ═══════════════════════════════════════════════════════════════════════

    async def _show_nam_status(self) -> None:
        result = await self.api_client.get_nam_status()
        if result.success and result.data:
            self.app.notify(f"🎸 NAM Status: {result.data}", severity="information", timeout=4)
        else:
            self.app.notify("❌ Failed to get NAM status", severity="error", timeout=3)

    async def _show_nam_models(self) -> None:
        result = await self.api_client.get_nam_models()
        if result.success and result.data:
            count = len(result.data) if isinstance(result.data, list) else "N/A"
            self.app.notify(f"🎸 NAM Models: {count} available", severity="information", timeout=3)
        else:
            self.app.notify("❌ Failed to get NAM models", severity="error", timeout=3)

    async def _show_cabinet_irs(self) -> None:
        result = await self.api_client.get_cabinet_irs()
        if result.success and result.data:
            count = len(result.data) if isinstance(result.data, list) else "N/A"
            self.app.notify(f"🔊 Cabinet IRs: {count} available", severity="information", timeout=3)
        else:
            self.app.notify("❌ Failed to get cabinet IRs", severity="error", timeout=3)

    async def _show_reverb_irs(self) -> None:
        result = await self.api_client.get_reverb_irs()
        if result.success and result.data:
            count = len(result.data) if isinstance(result.data, list) else "N/A"
            self.app.notify(f"✨ Reverb IRs: {count} available", severity="information", timeout=3)
        else:
            self.app.notify("❌ Failed to get reverb IRs", severity="error", timeout=3)

    # ═══════════════════════════════════════════════════════════════════════
    # LCD Methods
    # ═══════════════════════════════════════════════════════════════════════

    async def _lcd_set_page(self, page: str) -> None:
        result = await self.api_client.set_lcd_page(page)
        if result.success:
            self.app.notify(f"🖥️ LCD: {page.upper()} view", severity="information", timeout=2)
        else:
            self.app.notify(f"❌ Failed to set LCD page: {result.error}", severity="error", timeout=3)

    # ═══════════════════════════════════════════════════════════════════════
    # Template Methods
    # ═══════════════════════════════════════════════════════════════════════

    async def _load_template(self) -> None:
        template_list = self.query_one("#template-list", OptionList)
        if template_list.highlighted is None:
            self.app.notify("⚠️ No template selected", severity="warning", timeout=2)
            return

        option = template_list.get_option_at_index(template_list.highlighted)
        template_name = option.prompt

        result = await self.api_client.load_template(template_name)
        if result.success:
            self.app.notify(f"📂 Loaded template: {template_name}", severity="information", timeout=2)
        else:
            self.app.notify(f"❌ Failed to load: {result.error}", severity="error", timeout=3)

    # ═══════════════════════════════════════════════════════════════════════
    # System Methods
    # ═══════════════════════════════════════════════════════════════════════

    async def _run_health_check(self) -> None:
        result = await self.api_client.get_health()
        if result.success:
            self.app.notify("💊 System is healthy", severity="information", timeout=2)
        else:
            self.app.notify(f"❌ Health check failed: {result.error}", severity="error", timeout=3)

    async def _run_rt_check(self) -> None:
        result = await self.api_client.get_realtime_status()
        if result.success and result.data:
            quality = result.data.get('rt_quality', 'Unknown')
            self.app.notify(f"🔍 RT Quality: {quality}", severity="information", timeout=3)
        else:
            self.app.notify("❌ RT check failed", severity="error", timeout=3)

    async def _show_logs(self) -> None:
        self.app.notify("📋 Logs: Check /tmp/map2_tui.log", severity="information", timeout=3)

    async def _reload_config(self) -> None:
        self.app.notify("🔄 Configuration reloaded", severity="information", timeout=2)
        await self.refresh_data()

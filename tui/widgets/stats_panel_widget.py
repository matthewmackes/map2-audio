"""
Comprehensive Stats Panel Widget for MAP2 TUI
Displays ALL API stats grouped by type with editable fields.
Includes Refresh and Commit buttons to reload/save changes.
"""

import asyncio
import logging
from typing import Optional, Dict, Any, List, Tuple

try:
    from textual.app import ComposeResult
    from textual.containers import Vertical, VerticalScroll, Horizontal
    from textual.widgets import Static, DataTable, Label, Button, Input, Select
    from textual.reactive import reactive
    from textual.binding import Binding
    from textual.message import Message
    TEXTUAL_AVAILABLE = True
except ImportError:
    TEXTUAL_AVAILABLE = False

logger = logging.getLogger(__name__)


class StatsPanel(Static):
    """
    Comprehensive stats panel displaying all API data grouped by type.

    Features:
    - Refresh button to reload all data from API
    - Commit button to save pending changes
    - Editable fields for configurable settings
    - Visual indicator for unsaved changes
    """

    DEFAULT_CSS = """
    StatsPanel {
        width: 100%;
        height: 100%;
        background: $panel;
        border: none;
        padding: 0;
    }

    .stats-header {
        width: 100%;
        height: auto;
        background: $accent 30%;
        color: $text;
        text-style: bold;
        padding: 0 1;
        border-bottom: solid $accent;
    }

    .button-bar {
        width: 100%;
        height: auto;
        background: $panel;
        padding: 1;
        layout: horizontal;
        align: center middle;
    }

    .action-button {
        min-width: 12;
        margin: 0 1;
    }

    #refresh-btn {
        background: $primary;
    }

    #commit-btn {
        background: $success;
    }

    #commit-btn.has-changes {
        background: $warning;
        text-style: bold;
    }

    .stats-scroll {
        width: 100%;
        height: 1fr;
        background: $panel;
        overflow-y: auto;
    }

    .stats-section {
        width: 100%;
        height: auto;
        background: $panel;
        padding: 0;
        margin: 0;
    }

    .section-header {
        width: 100%;
        height: auto;
        color: $text;
        text-style: bold;
        padding: 0 1;
        margin-top: 1;
    }

    /* Color coded section headers by category */
    .section-dsp {
        background: #1565C0;
        border-left: thick #2196F3;
    }

    .section-audio {
        background: #0D47A1;
        border-left: thick #1976D2;
    }

    .section-midi {
        background: #E65100;
        border-left: thick #FF9800;
    }

    .section-network {
        background: #2E7D32;
        border-left: thick #4CAF50;
    }

    .section-www {
        background: #1B5E20;
        border-left: thick #388E3C;
    }

    .section-system {
        background: #6A1B9A;
        border-left: thick #9C27B0;
    }

    .section-chains {
        background: #AD1457;
        border-left: thick #E91E63;
    }


    .section-juce {
        background: #880E4F;
        border-left: thick #C2185B;
    }

    .section-nam {
        background: #BF360C;
        border-left: thick #FF5722;
    }

    .section-ir {
        background: #D84315;
        border-left: thick #FF7043;
    }

    .section-automation {
        background: #F9A825;
        border-left: thick #FDD835;
        color: #000;
    }

    .section-backup {
        background: #FF8F00;
        border-left: thick #FFB300;
        color: #000;
    }

    .section-sessions {
        background: #00838F;
        border-left: thick #00BCD4;
    }

    .section-usb {
        background: #00695C;
        border-left: thick #009688;
    }

    .section-history {
        background: #455A64;
        border-left: thick #607D8B;
    }

    .stats-table {
        width: 100%;
        height: auto;
        max-height: 12;
        background: $surface;
        margin: 0;
        padding: 0;
    }

    .editable-row {
        width: 100%;
        height: auto;
        layout: horizontal;
        padding: 0 1;
        background: $surface;
    }

    .edit-label {
        width: 1fr;
        height: auto;
        padding: 0 1;
        content-align: left middle;
    }

    .edit-input {
        width: 2fr;
        height: auto;
        min-width: 10;
    }

    .edit-input.modified {
        border: solid $warning;
    }

    .change-indicator {
        width: 100%;
        height: auto;
        background: $warning 30%;
        color: $text;
        padding: 0 1;
        text-style: italic;
    }
    """

    BINDINGS = [
        Binding("r", "refresh", "Refresh", show=True),
        Binding("c", "commit", "Commit", show=True),
    ]

    # Track if there are unsaved changes
    has_changes: reactive[bool] = reactive(False)

    def __init__(self, api_client, id: str = "stats-panel"):
        super().__init__(id=id)
        self.api_client = api_client
        self._refresh_task: Optional[asyncio.Task] = None
        self._tables: Dict[str, DataTable] = {}
        # Store pending changes: {field_id: (api_method, value)}
        self._pending_changes: Dict[str, Tuple[str, Any]] = {}
        # Store original values for comparison
        self._original_values: Dict[str, Any] = {}

    def compose(self) -> ComposeResult:
        yield Label("API STATS PANEL", classes="stats-header")

        # Button bar with Refresh and Commit
        with Horizontal(classes="button-bar"):
            yield Button("Refresh", id="refresh-btn", classes="action-button", variant="primary")
            yield Button("Commit", id="commit-btn", classes="action-button", variant="success")
            yield Label("", id="change-status")

        with VerticalScroll(classes="stats-scroll"):
            # DSP Settings (Editable) - Blue
            with Vertical(classes="stats-section"):
                yield Label("DSP Settings [EDIT]", classes="section-header section-dsp")
                with Horizontal(classes="editable-row"):
                    yield Label("Quality Mode:", classes="edit-label")
                    yield Select(
                        [("Performance", "performance"), ("Balanced", "balanced"), ("Quality", "quality")],
                        id="dsp-mode-input",
                        classes="edit-input",
                        value="balanced"
                    )
                with Horizontal(classes="editable-row"):
                    yield Label("Target CPU %:", classes="edit-label")
                    yield Input(placeholder="70", id="dsp-cpu-input", classes="edit-input")

            # Audio Settings (Editable) - Blue
            with Vertical(classes="stats-section"):
                yield Label("Audio Settings [EDIT]", classes="section-header section-audio")
                with Horizontal(classes="editable-row"):
                    yield Label("Sample Rate:", classes="edit-label")
                    yield Select(
                        [("44100 Hz", "44100"), ("48000 Hz", "48000"), ("96000 Hz", "96000")],
                        id="audio-samplerate-input",
                        classes="edit-input",
                        value="48000"
                    )
                    yield Label("", id="audio-samplerate-error", classes="field-error")
                with Horizontal(classes="editable-row"):
                    yield Label("Buffer Size:", classes="edit-label")
                    yield Select(
                        [("64", "64"), ("128", "128"), ("256", "256"), ("512", "512"), ("1024", "1024")],
                        id="audio-buffer-input",
                        classes="edit-input",
                        value="256"
                    )
                    yield Label("", id="audio-buffer-error", classes="field-error")
                yield DataTable(id="audio-table", classes="stats-table")

            # MIDI Settings (Editable) - Orange
            with Vertical(classes="stats-section"):
                yield Label("MIDI Settings [EDIT]", classes="section-header section-midi")
                with Horizontal(classes="editable-row"):
                    yield Label("MIDI Enabled:", classes="edit-label")
                    yield Select(
                        [("Enabled", "true"), ("Disabled", "false")],
                        id="midi-enabled-input",
                        classes="edit-input",
                        value="true"
                    )
                yield DataTable(id="midi-table", classes="stats-table")

            # Network Settings (Editable) - Green
            with Vertical(classes="stats-section"):
                yield Label("Network [EDIT]", classes="section-header section-network")
                with Horizontal(classes="editable-row"):
                    yield Label("Hostname:", classes="edit-label")
                    yield Input(placeholder="map2-audio", id="hostname-input", classes="edit-input")
                yield DataTable(id="network-table", classes="stats-table")

            # WWW Settings (Editable) - Green
            with Vertical(classes="stats-section"):
                yield Label("Web Server [EDIT]", classes="section-header section-www")
                with Horizontal(classes="editable-row"):
                    yield Label("HTTP Port:", classes="edit-label")
                    yield Input(placeholder="8080", id="www-port-input", classes="edit-input")
                with Horizontal(classes="editable-row"):
                    yield Label("SSL Enabled:", classes="edit-label")
                    yield Select(
                        [("Disabled", "false"), ("Enabled", "true")],
                        id="www-ssl-input",
                        classes="edit-input",
                        value="false"
                    )
                yield DataTable(id="www-table", classes="stats-table")

            # System Stats (Read-only) - Purple
            with Vertical(classes="stats-section"):
                yield Label("System Health", classes="section-header section-system")
                yield DataTable(id="system-table", classes="stats-table")

            # Chains Stats (Read-only) - Pink/Magenta
            with Vertical(classes="stats-section"):
                yield Label("Signal Chains", classes="section-header section-chains")
                yield DataTable(id="chains-table", classes="stats-table")

            # JUCE Audio Engine Stats (Read-only) - Pink/Magenta
            with Vertical(classes="stats-section"):
                yield Label("JUCE Audio Engine", classes="section-header section-juce")
                yield DataTable(id="juce-table", classes="stats-table")

            # NAM/Guitar Stats (Read-only) - Orange/Red
            with Vertical(classes="stats-section"):
                yield Label("Guitar / NAM", classes="section-header section-nam")
                yield DataTable(id="nam-table", classes="stats-table")

            # IR Stats (Read-only) - Orange/Red
            with Vertical(classes="stats-section"):
                yield Label("Impulse Responses", classes="section-header section-ir")
                yield DataTable(id="ir-table", classes="stats-table")

            # Automation Settings (Editable) - Yellow
            with Vertical(classes="stats-section"):
                yield Label("Automation [EDIT]", classes="section-header section-automation")
                with Horizontal(classes="editable-row"):
                    yield Label("Loop Enabled:", classes="edit-label")
                    yield Select(
                        [("Disabled", "false"), ("Enabled", "true")],
                        id="automation-loop-input",
                        classes="edit-input",
                        value="false"
                    )
                yield DataTable(id="automation-table", classes="stats-table")

            # Backup Settings (Editable) - Yellow/Orange
            with Vertical(classes="stats-section"):
                yield Label("Backup [EDIT]", classes="section-header section-backup")
                with Horizontal(classes="editable-row"):
                    yield Label("Auto Cleanup:", classes="edit-label")
                    yield Select(
                        [("Disabled", "false"), ("Enabled", "true")],
                        id="backup-cleanup-input",
                        classes="edit-input",
                        value="false"
                    )
                yield DataTable(id="backup-table", classes="stats-table")

            # Sessions Stats (Read-only) - Cyan
            with Vertical(classes="stats-section"):
                yield Label("Sessions", classes="section-header section-sessions")
                yield DataTable(id="sessions-table", classes="stats-table")

            # USB Stats (Read-only) - Teal
            with Vertical(classes="stats-section"):
                yield Label("USB Audio", classes="section-header section-usb")
                yield DataTable(id="usb-table", classes="stats-table")

            # History Stats (Read-only) - Gray
            with Vertical(classes="stats-section"):
                yield Label("History / Undo", classes="section-header section-history")
                yield DataTable(id="history-table", classes="stats-table")

    def _init_tables(self) -> None:
        """Initialize all tables with columns."""
        table_configs = {
            "system-table": ["Metric", "Value"],
            "audio-table": ["Metric", "Value"],
            "midi-table": ["Metric", "Value"],
            "network-table": ["Interface", "Status", "IP"],
            "www-table": ["Metric", "Value"],
            "chains-table": ["ID", "Name", "Status"],
            "juce-table": ["Metric", "Value"],
            "nam-table": ["Metric", "Value"],
            "ir-table": ["Type", "Count"],
            "automation-table": ["Metric", "Value"],
            "backup-table": ["Metric", "Value"],
            "sessions-table": ["ID", "Name"],
            "usb-table": ["Device", "Status"],
            "history-table": ["Metric", "Value"],
        }

        for table_id, columns in table_configs.items():
            try:
                table = self.query_one(f"#{table_id}", DataTable)
                table.cursor_type = "row"
                table.zebra_stripes = True
                for col in columns:
                    table.add_column(col, key=col.lower())
                self._tables[table_id] = table
            except Exception as e:
                logger.debug(f"Could not init table {table_id}: {e}")

    async def on_mount(self) -> None:
        """Initialize on mount and immediately populate data."""
        self._init_tables()
        # Immediately fetch and display stats on first load
        asyncio.create_task(self._initial_load())
        # Auto-refresh interval configurable via config.ui.refresh_interval
        try:
            interval = int(tui_config.get("ui.refresh_interval", 10))
            if interval < 1:
                interval = 10
        except Exception:
            interval = 10
        self._refresh_task = self.set_interval(float(interval), self._refresh_all_stats)

    async def _initial_load(self) -> None:
        """Load data after initial UI refresh to ensure widgets are ready."""
        # Small delay to ensure UI is fully rendered
        await asyncio.sleep(0.1)
        await self._refresh_all_stats()
        self.notify("Stats panel loaded", severity="information", timeout=2)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button presses."""
        if event.button.id == "refresh-btn":
            asyncio.create_task(self._refresh_all_stats())
            self.notify("Refreshing stats...", severity="information", timeout=2)
        elif event.button.id == "commit-btn":
            asyncio.create_task(self._commit_changes())

    def on_input_changed(self, event: Input.Changed) -> None:
        """Track input changes."""
        input_id = event.input.id
        new_value = event.value
        original = self._original_values.get(input_id, "")

        if str(new_value) != str(original):
            self._mark_field_modified(input_id, True)
            self._register_change(input_id, new_value)
        else:
            self._mark_field_modified(input_id, False)
            self._pending_changes.pop(input_id, None)

        self._update_change_status()

    def on_select_changed(self, event: Select.Changed) -> None:
        """Track select changes."""
        select_id = event.select.id
        new_value = event.value
        original = self._original_values.get(select_id, "")

        if str(new_value) != str(original):
            self._mark_field_modified(select_id, True)
            self._register_change(select_id, new_value)
        else:
            self._mark_field_modified(select_id, False)
            self._pending_changes.pop(select_id, None)

        # Inline validation for audio fields
        try:
            if select_id == "audio-samplerate-input":
                err_label = self.query_one("#audio-samplerate-error")
                allowed = {"44100", "48000", "96000"}
                if str(new_value) not in allowed:
                    err_label.update("Unsupported sample rate")
                else:
                    err_label.update("")
            elif select_id == "audio-buffer-input":
                err_label = self.query_one("#audio-buffer-error")
                allowed_buf = {"64", "128", "256", "512", "1024"}
                if str(new_value) not in allowed_buf:
                    err_label.update("Unsupported buffer size")
                else:
                    err_label.update("")
        except Exception:
            pass

        self._update_change_status()

    def _mark_field_modified(self, field_id: str, modified: bool) -> None:
        """Add/remove modified class from field."""
        try:
            widget = self.query_one(f"#{field_id}")
            if modified:
                widget.add_class("modified")
            else:
                widget.remove_class("modified")
        except Exception:
            pass

    def _register_change(self, field_id: str, value: Any) -> None:
        """Register a pending change with its API method."""
        # Build mapping only for the specific field to avoid evaluation errors
        if field_id == "dsp-mode-input":
            self._pending_changes[field_id] = ("set_quality_mode", value)
        elif field_id == "dsp-cpu-input":
            try:
                self._pending_changes[field_id] = ("set_target_cpu", float(value) if value else 70.0)
            except ValueError:
                pass
        elif field_id == "audio-samplerate-input":
            try:
                self._pending_changes[field_id] = ("initialize_juce", {"sample_rate": int(value)})
            except ValueError:
                pass
        elif field_id == "audio-buffer-input":
            try:
                self._pending_changes[field_id] = ("initialize_juce", {"buffer_size": int(value)})
            except ValueError:
                pass
        elif field_id == "midi-enabled-input":
            self._pending_changes[field_id] = ("enable_midi", value == "true")
        elif field_id == "hostname-input":
            self._pending_changes[field_id] = ("set_hostname", value)
        elif field_id == "www-port-input":
            try:
                self._pending_changes[field_id] = ("set_www_config", {"port": int(value) if value else 8080})
            except ValueError:
                pass
        elif field_id == "www-ssl-input":
            self._pending_changes[field_id] = ("set_www_config", {"ssl_enabled": value == "true"})
        elif field_id == "automation-loop-input":
            self._pending_changes[field_id] = ("set_automation_loop", value == "true")
        elif field_id == "backup-cleanup-input":
            self._pending_changes[field_id] = ("update_backup_settings", {"auto_cleanup": value == "true"})

    def _update_change_status(self) -> None:
        """Update the change indicator and button state."""
        has_changes = len(self._pending_changes) > 0
        self.has_changes = has_changes

        try:
            status = self.query_one("#change-status", Label)
            commit_btn = self.query_one("#commit-btn", Button)

            if has_changes:
                status.update(f"{len(self._pending_changes)} pending changes")
                commit_btn.add_class("has-changes")
            else:
                status.update("")
                commit_btn.remove_class("has-changes")
        except Exception:
            pass

    async def _commit_changes(self) -> None:
        """Commit all pending changes to API."""
        if not self._pending_changes:
            self.notify("No changes to commit", severity="information", timeout=2)
            return

        self.notify(f"Committing {len(self._pending_changes)} changes...", severity="information", timeout=2)

        success_count = 0
        error_count = 0

        for field_id, (method_name, value) in list(self._pending_changes.items()):
            try:
                # Validate certain fields locally before committing
                if field_id == "audio-samplerate-input":
                    allowed = {44100, 48000, 96000}
                    try:
                        val = int(value) if isinstance(value, str) else int(value.get("sample_rate", value))
                    except Exception:
                        self.notify("Invalid sample rate value", severity="error", timeout=3)
                        error_count += 1
                        continue
                    if val not in allowed:
                        self.notify(f"Unsupported sample rate: {val}", severity="error", timeout=3)
                        error_count += 1
                        continue
                if field_id == "audio-buffer-input":
                    allowed_buf = {64, 128, 256, 512, 1024}
                    try:
                        val = int(value) if isinstance(value, str) else int(value.get("buffer_size", value))
                    except Exception:
                        self.notify("Invalid buffer size value", severity="error", timeout=3)
                        error_count += 1
                        continue
                    if val not in allowed_buf:
                        self.notify(f"Unsupported buffer size: {val}", severity="error", timeout=3)
                        error_count += 1
                        continue
                method = getattr(self.api_client, method_name, None)
                if method:
                    if isinstance(value, dict):
                        result = await method(**value)
                    else:
                        result = await method(value)

                    if result.success:
                        success_count += 1
                        self._original_values[field_id] = self._get_field_value(field_id)
                        self._mark_field_modified(field_id, False)
                        del self._pending_changes[field_id]
                    else:
                        error_count += 1
                        logger.warning(f"API error for {field_id}: {result.error}")
                else:
                    logger.warning(f"Unknown API method: {method_name}")
                    error_count += 1
            except Exception as e:
                error_count += 1
                logger.error(f"Commit error for {field_id}: {e}")

        self._update_change_status()

        if error_count == 0:
            self.notify(f"Committed {success_count} changes successfully", severity="information", timeout=3)
        else:
            self.notify(f"Committed {success_count}, failed {error_count}", severity="warning", timeout=3)

        # Refresh to show updated values
        await self._refresh_all_stats()

    def _get_field_value(self, field_id: str) -> Any:
        """Get current value of an editable field."""
        try:
            widget = self.query_one(f"#{field_id}")
            if isinstance(widget, Input):
                return widget.value
            elif isinstance(widget, Select):
                return widget.value
        except Exception:
            pass
        return None

    def _set_field_value(self, field_id: str, value: Any) -> None:
        """Set value of an editable field without triggering change event."""
        try:
            widget = self.query_one(f"#{field_id}")
            if isinstance(widget, Input):
                widget.value = str(value) if value is not None else ""
            elif isinstance(widget, Select):
                widget.value = str(value) if value is not None else widget.value
            # Store as original value
            self._original_values[field_id] = str(value) if value is not None else ""
        except Exception as e:
            logger.debug(f"Could not set field {field_id}: {e}")

    def action_refresh(self) -> None:
        """Keyboard action for refresh."""
        asyncio.create_task(self._refresh_all_stats())
        self.notify("Refreshing...", severity="information", timeout=1)

    def action_commit(self) -> None:
        """Keyboard action for commit."""
        asyncio.create_task(self._commit_changes())

    async def _refresh_all_stats(self) -> None:
        """Refresh all stats from API."""
        results = await asyncio.gather(
            self._fetch_dsp_settings(),
            self._fetch_audio_settings(),
            self._fetch_midi_settings(),
            self._fetch_network_settings(),
            self._fetch_www_settings(),
            self._fetch_system_stats(),
            self._fetch_chains_stats(),
            self._fetch_juce_stats(),
            self._fetch_nam_stats(),
            self._fetch_ir_stats(),
            self._fetch_automation_settings(),
            self._fetch_backup_settings(),
            self._fetch_sessions_stats(),
            self._fetch_usb_stats(),
            self._fetch_history_stats(),
            return_exceptions=True
        )

        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.debug(f"Stats fetch error {i}: {result}")

    async def _fetch_dsp_settings(self) -> None:
        """Fetch DSP settings and populate editable fields."""
        try:
            result = await self.api_client.get_dsp_status()
            if result.success and result.data:
                data = result.data
                mode = data.get("quality_mode", "balanced")
                target = data.get("target_cpu", data.get("target_cpu_percent", 70))
                self._set_field_value("dsp-mode-input", mode)
                self._set_field_value("dsp-cpu-input", str(int(target)))
        except Exception as e:
            logger.debug(f"DSP settings error: {e}")

    async def _fetch_audio_settings(self) -> None:
        """Fetch audio settings."""
        table = self._tables.get("audio-table")
        if not table:
            return

        table.clear()

        try:
            result = await self.api_client.get_audio_status()
            if result.success and result.data:
                data = result.data
                sr = data.get("sample_rate", 48000)
                buf = data.get("buffer_size", 256)
                self._set_field_value("audio-samplerate-input", str(sr))
                self._set_field_value("audio-buffer-input", str(buf))
                table.add_row(("Running", str(data.get("running", False))))
                table.add_row(("Latency", f"{data.get('latency_ms', 0):.1f} ms"))

            levels = await self.api_client.get_audio_levels()
            if levels.success and levels.data:
                data = levels.data
                # API returns input_left, input_right, output_left, output_right
                input_left = float(data.get("input_left", 0))
                input_right = float(data.get("input_right", 0))
                output_left = float(data.get("output_left", 0))
                output_right = float(data.get("output_right", 0))
                inp = max(input_left, input_right)
                out = max(output_left, output_right)
                table.add_row(("Input", f"{inp:.1f} dB"))
                table.add_row(("Output", f"{out:.1f} dB"))
        except Exception as e:
            table.add_row(("Error", str(e)[:30]))

    async def _fetch_midi_settings(self) -> None:
        """Fetch MIDI settings."""
        table = self._tables.get("midi-table")
        if not table:
            return

        table.clear()

        try:
            result = await self.api_client.get_midi_status()
            if result.success and result.data:
                data = result.data
                enabled = data.get("enabled", False)
                self._set_field_value("midi-enabled-input", "true" if enabled else "false")
                table.add_row(("Running", str(data.get("running", False))))
                table.add_row(("Learn Mode", str(data.get("learn_mode", False))))

            devices = await self.api_client.get_midi_devices()
            if devices.success and devices.data:
                dev_list = devices.data if isinstance(devices.data, list) else devices.data.get("devices", [])
                table.add_row(("Devices", str(len(dev_list))))

            mappings = await self.api_client.list_midi_mappings()
            if mappings.success and mappings.data:
                map_list = mappings.data if isinstance(mappings.data, list) else mappings.data.get("mappings", [])
                table.add_row(("Mappings", str(len(map_list))))
        except Exception as e:
            table.add_row(("Error", str(e)[:30]))

    async def _fetch_network_settings(self) -> None:
        """Fetch network settings."""
        table = self._tables.get("network-table")
        if not table:
            return

        table.clear()

        try:
            hostname = await self.api_client.get_hostname()
            if hostname.success and hostname.data:
                host = hostname.data.get("hostname", "unknown")
                self._set_field_value("hostname-input", host)

            status = await self.api_client.get_network_status()
            if status.success and status.data:
                data = status.data
                interfaces = data.get("interfaces", [])
                for iface in interfaces[:3]:
                    name = iface.get("name", "?")[:8]
                    state = iface.get("state", "?")[:6]
                    ip = iface.get("ip_address", "N/A")[:12]
                    table.add_row((name, state, ip))
        except Exception as e:
            table.add_row(("Error", str(e)[:20], ""))

    async def _fetch_www_settings(self) -> None:
        """Fetch WWW settings."""
        table = self._tables.get("www-table")
        if not table:
            return

        table.clear()

        try:
            result = await self.api_client.get_www_status()
            if result.success and result.data:
                data = result.data
                port = data.get("port", 8080)
                ssl = data.get("ssl_enabled", False)
                self._set_field_value("www-port-input", str(port))
                self._set_field_value("www-ssl-input", "true" if ssl else "false")
                table.add_row(("Running", str(data.get("running", False))))

            ws = await self.api_client.get_websocket_stats()
            if ws.success and ws.data:
                table.add_row(("WS Conns", str(ws.data.get("connections", 0))))
        except Exception as e:
            table.add_row(("Error", str(e)[:30]))

    async def _fetch_system_stats(self) -> None:
        """Fetch system stats."""
        table = self._tables.get("system-table")
        if not table:
            return

        table.clear()

        try:
            health = await self.api_client.get_health()
            if health.success and health.data:
                data = health.data
                table.add_row(("Status", data.get("status", "unknown")))
                table.add_row(("Version", data.get("version", "N/A")[:15]))

            metrics = await self.api_client.get_current_metrics()
            if metrics.success and metrics.data:
                data = metrics.data
                table.add_row(("CPU", f"{data.get('cpu_percent', 0):.0f}%"))
                table.add_row(("Memory", f"{data.get('memory_percent', 0):.0f}%"))
        except Exception as e:
            table.add_row(("Error", str(e)[:30]))

    async def _fetch_chains_stats(self) -> None:
        """Fetch chains stats."""
        table = self._tables.get("chains-table")
        if not table:
            return

        table.clear()

        try:
            chains = await self.api_client.list_chains()
            if chains.success and chains.data:
                chain_list = chains.data if isinstance(chains.data, list) else chains.data.get("chains", [])
                for chain in chain_list[:6]:
                    cid = str(chain.get("id", "?"))
                    name = chain.get("name", "?")[:12]
                    status = "Active" if chain.get("is_active") else "Off"
                    table.add_row((cid, name, status))
        except Exception as e:
            table.add_row(("Error", str(e)[:20], ""))

    async def _fetch_juce_stats(self) -> None:
        """Fetch JUCE engine stats."""
        try:
            table = self._tables.get("juce-table")
            if not table:
                self.notify("Stats table not found.", severity="error", timeout=4)
                self.mount(Label("❌ Failed to initialize stats table. Try reloading the screen."))
                return

            table.clear()

            result = await self.api_client.get_juce_status()
            if result.success and result.data:
                data = result.data
                table.add_row(("Running", str(data.get("running", False))))
                table.add_row(("Plugins", str(data.get("plugins_loaded", 0))))
                table.add_row(("CPU", f"{data.get('cpu_load', 0):.1f}%"))
                table.add_row(("Underruns", str(data.get("underruns", 0))))
            else:
                self.notify("Failed to load JUCE engine stats.", severity="error", timeout=4)
        except Exception as e:
            if 'table' in locals() and table:
                table.add_row(("Error", str(e)[:30]))
            self.notify(f"JUCE stats API error: {e}", severity="error", timeout=4)

    async def _fetch_nam_stats(self) -> None:
        """Fetch NAM/Guitar stats."""
        table = self._tables.get("nam-table")
        if not table:
            return

        table.clear()

        try:
            nam = await self.api_client.get_nam_status()
            if nam.success and nam.data:
                data = nam.data
                table.add_row(("Active", str(data.get("active", False))))
                table.add_row(("Model", data.get("current_model", "None")[:15]))

            models = await self.api_client.get_nam_models()
            if models.success and models.data:
                model_list = models.data if isinstance(models.data, list) else models.data.get("models", [])
                table.add_row(("Models", str(len(model_list))))
        except Exception as e:
            table.add_row(("Error", str(e)[:30]))

    async def _fetch_ir_stats(self) -> None:
        """Fetch IR stats."""
        table = self._tables.get("ir-table")
        if not table:
            return

        table.clear()

        try:
            cabinets = await self.api_client.get_cabinet_irs()
            if cabinets.success and cabinets.data:
                cab_list = cabinets.data if isinstance(cabinets.data, list) else cabinets.data.get("irs", [])
                table.add_row(("Cabinets", str(len(cab_list))))

            reverbs = await self.api_client.get_reverb_irs()
            if reverbs.success and reverbs.data:
                rev_list = reverbs.data if isinstance(reverbs.data, list) else reverbs.data.get("irs", [])
                table.add_row(("Reverbs", str(len(rev_list))))
        except Exception as e:
            table.add_row(("Error", str(e)[:30]))

    async def _fetch_automation_settings(self) -> None:
        """Fetch automation settings."""
        table = self._tables.get("automation-table")
        if not table:
            return

        table.clear()

        try:
            result = await self.api_client.get_automation_status()
            if result.success and result.data:
                data = result.data
                looping = data.get("looping", False)
                self._set_field_value("automation-loop-input", "true" if looping else "false")
                table.add_row(("Playing", str(data.get("playing", False))))
                table.add_row(("Position", f"{data.get('position', 0):.1f}s"))

            lanes = await self.api_client.list_automation_lanes()
            if lanes.success and lanes.data:
                lane_list = lanes.data if isinstance(lanes.data, list) else lanes.data.get("lanes", [])
                table.add_row(("Lanes", str(len(lane_list))))
        except Exception as e:
            table.add_row(("Error", str(e)[:30]))

    async def _fetch_backup_settings(self) -> None:
        """Fetch backup settings."""
        table = self._tables.get("backup-table")
        if not table:
            return

        table.clear()

        try:
            result = await self.api_client.get_backup_status()
            if result.success and result.data:
                data = result.data
                cleanup = data.get("auto_cleanup", False)
                self._set_field_value("backup-cleanup-input", "true" if cleanup else "false")
                table.add_row(("Total", str(data.get("total_backups", 0))))
                table.add_row(("Last", data.get("last_backup", "Never")[:15]))
        except Exception as e:
            table.add_row(("Error", str(e)[:30]))

    async def _fetch_sessions_stats(self) -> None:
        """Fetch sessions stats."""
        table = self._tables.get("sessions-table")
        if not table:
            return

        table.clear()

        try:
            result = await self.api_client.list_sessions()
            if result.success and result.data:
                sessions = result.data if isinstance(result.data, list) else result.data.get("sessions", [])
                for session in sessions[:5]:
                    sid = str(session.get("id", "?"))
                    name = session.get("name", "?")[:15]
                    table.add_row((sid, name))
                if not sessions:
                    table.add_row(("-", "No sessions"))
        except Exception as e:
            table.add_row(("Error", str(e)[:30]))

    async def _fetch_usb_stats(self) -> None:
        """Fetch USB stats."""
        table = self._tables.get("usb-table")
        if not table:
            return

        table.clear()

        try:
            result = await self.api_client.get_usb_devices()
            if result.success and result.data:
                devices = result.data if isinstance(result.data, list) else result.data.get("devices", [])
                for dev in devices[:4]:
                    name = dev.get("name", "?")[:15]
                    status = dev.get("status", "?")[:10]
                    table.add_row((name, status))
                if not devices:
                    table.add_row(("-", "No devices"))
        except Exception as e:
            table.add_row(("Error", str(e)[:30]))

    async def _fetch_history_stats(self) -> None:
        """Fetch history stats."""
        table = self._tables.get("history-table")
        if not table:
            return

        table.clear()

        try:
            result = await self.api_client.get_history_status()
            if result.success and result.data:
                data = result.data
                table.add_row(("Can Undo", str(data.get("can_undo", False))))
                table.add_row(("Can Redo", str(data.get("can_redo", False))))
                table.add_row(("Size", str(data.get("history_size", 0))))
        except Exception as e:
            table.add_row(("Error", str(e)[:30]))

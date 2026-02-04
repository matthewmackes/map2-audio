"""
Backup & Restore Management Tab
Backup creation, restoration, and lifecycle management for MAP2 Audio Platform.
"""

import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

from textual.app import ComposeResult
from textual.widgets import Static, Button, Label, Input, OptionList, DataTable, Switch
from textual.widgets.option_list import Option
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.reactive import reactive
from textual import work

# Import newer widgets with fallbacks for older Textual versions
try:
    from textual.widgets import SelectionList
    from textual.widgets.selection_list import Selection
    SELECTION_LIST_AVAILABLE = True
except ImportError:
    SELECTION_LIST_AVAILABLE = False
    SelectionList = None
    Selection = None

try:
    from textual.widgets import Rule
    RULE_AVAILABLE = True
except ImportError:
    RULE_AVAILABLE = False
    Rule = None

try:
    from textual.widgets import LoadingIndicator
    LOADING_AVAILABLE = True
except ImportError:
    LOADING_AVAILABLE = False
    LoadingIndicator = None

from ..api_client import MAP2APIClient
from ..modals import ConfirmDialog
from ..widgets.ssh_setup_dialog import SSHSetupDialog
from ..widgets.ssh_connection_manager import SSHConnectionManager

logger = logging.getLogger(__name__)


class SectionCard(Container):
    """Styled section card with icon and title."""

    DEFAULT_CSS = """
    SectionCard {
        height: auto;
        width: 100%;
        background: $panel;
        border: thick $primary;
        padding: 1 2;
        margin-bottom: 1;
        layout: vertical;
    }

    SectionCard.success {
        border: thick $success;
    }

    SectionCard.warning {
        border: thick $warning;
    }

    SectionCard.error {
        border: thick $error;
    }

    SectionCard > .section-header {
        width: 100%;
        height: auto;
        margin-bottom: 1;
    }

    SectionCard > .section-header > .section-icon {
        width: auto;
        margin-right: 1;
    }

    SectionCard > .section-header > .section-title {
        width: 1fr;
        text-style: bold;
        color: $accent;
    }

    SectionCard > .section-header > .section-badge {
        width: auto;
        padding: 0 1;
        background: $primary;
        color: $text;
    }

    SectionCard .section-content {
        width: 100%;
        height: auto;
    }

    SectionCard .stat-row {
        width: 100%;
        height: auto;
        margin: 0 0 1 0;
    }

    SectionCard .stat-label {
        width: auto;
        color: $text-muted;
        margin-right: 1;
    }

    SectionCard .stat-value {
        width: 1fr;
        color: $text;
        text-style: bold;
    }

    SectionCard .btn-group {
        width: 100%;
        height: auto;
        margin-top: 1;
    }

    SectionCard .btn-group Button {
        min-width: 14;
        height: 3;
        margin: 0 1 1 0;
    }

    SectionCard OptionList {
        height: 10;
        border: solid $primary-darken-2;
        background: $surface;
        margin-top: 1;
    }

    SectionCard Input {
        width: 10;
        margin: 0 1 0 0;
    }

    SectionCard Switch {
        margin: 0 2 0 0;
    }

    SectionCard .settings-row {
        width: 100%;
        height: auto;
        align: left middle;
        margin: 1 0;
    }

    SectionCard .settings-row Label {
        width: auto;
        margin-right: 1;
    }
    """

    def __init__(self, title: str, icon: str = "", badge: str = "", variant: str = "", **kwargs):
        super().__init__(**kwargs)
        self._title = title
        self._icon = icon
        self._badge = badge
        self._variant = variant

    async def on_mount(self) -> None:
        """Mount the header at the beginning of the card."""
        if self._variant:
            self.add_class(self._variant)

        # Build header widgets list
        header_children = []
        if self._icon:
            header_children.append(Static(self._icon, classes="section-icon"))
        header_children.append(Label(self._title, classes="section-title"))
        if self._badge:
            header_children.append(Static(self._badge, classes="section-badge"))

        # Create header with children already included
        header = Horizontal(*header_children, classes="section-header")

        # Insert header at the beginning (before any children from with block)
        await self.mount(header, before=0)


class BackupTab(ScrollableContainer):
    """
    Modern Backup & Restore Management Tab for MAP2 Audio Platform
    Fedora Server deployment and installable package creation
    """

    CSS = """
    BackupTab {
        background: $surface;
        padding: 1 2;
        overflow-y: auto;
        height: 100%;
    }

    .main-header {
        width: 100%;
        height: 3;
        content-align: center middle;
        background: $primary;
        color: $text;
        text-style: bold;
        border: thick $primary-lighten-1;
        margin-bottom: 1;
    }

    .two-col {
        width: 100%;
        height: auto;
    }

    .col-left {
        width: 1fr;
        height: auto;
        padding-right: 1;
    }

    .col-right {
        width: 1fr;
        height: auto;
        padding-left: 1;
    }

    .section-card {
        width: 100%;
        height: auto;
        background: $panel;
        border: thick $primary;
        padding: 1 2;
        margin-bottom: 1;
    }

    .section-card.card-success {
        border: thick $success;
    }

    .status-grid {
        width: 100%;
        height: auto;
        margin-bottom: 1;
    }

    .status-item {
        width: 1fr;
        height: auto;
        background: $panel-darken-1;
        border: solid $primary-darken-2;
        padding: 1;
        margin: 0 1 0 0;
    }

    .status-item:last-child {
        margin-right: 0;
    }

    .status-item .status-label {
        color: $text-muted;
        text-style: italic;
    }

    .status-item .status-value {
        color: $accent;
        text-style: bold;
        margin-top: 0;
    }

    .action-buttons {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    .action-buttons Button {
        min-width: 16;
        height: 3;
        margin: 0 1 1 0;
    }

    .settings-row {
        width: 100%;
        height: auto;
        align: left middle;
        margin: 1 0;
    }

    .settings-row Label {
        width: auto;
        margin-right: 1;
    }

    .settings-row Switch {
        margin: 0 2 0 0;
    }

    .settings-row Input {
        width: 8;
        margin: 0 2 0 0;
    }

    .section-description {
        color: $text-muted;
        margin-bottom: 1;
    }

    #input-backup-desc {
        width: 1fr;
    }

    #backup-list {
        height: 8;
        border: solid $primary-darken-2;
        background: $surface;
    }

    #restore-components {
        height: 8;
        border: solid $accent;
        background: $surface;
        margin: 1 0;
    }

    #restore-components > .selection-list--option-highlighted {
        background: $accent-darken-1;
    }

    #restore-components > .selection-list--option-selected {
        color: $success;
    }

    .loading-indicator {
        height: 3;
        align: center middle;
    }
    """

    def __init__(self, api_client: MAP2APIClient, id: Optional[str] = None):
        super().__init__(id=id)
        self.api_client = api_client
        self.ssh_manager = None
        self.backups = []
        self.settings = {
            "max_backups": 5,
            "retention_days": 30,
            "auto_cleanup": True,
            "backup_location": ""
        }

    def _build_restore_card(self) -> Container:
        """Build restore options card with fallback for older Textual versions."""
        if SELECTION_LIST_AVAILABLE and SelectionList and Selection:
            # Use SelectionList for newer Textual versions
            return Container(
                Static("[dim]Select components to restore from backup:[/]", classes="section-description"),
                SelectionList[str](
                    Selection("🗄️  Database", "database", True),
                    Selection("📁 User Data", "user_data", True),
                    Selection("⚙️  Configuration", "config", True),
                    Selection("🔌 Plugin Settings", "plugins", False),
                    Selection("🎹 MIDI Mappings", "midi", False),
                    Selection("📊 Performance Profiles", "profiles", False),
                    id="restore-components",
                ),
                Rule() if RULE_AVAILABLE and Rule else Static("─" * 40),
                Horizontal(
                    Button("Restore Selected Backup", id="btn-restore-backup", variant="primary"),
                    Button("Select All", id="btn-select-all", variant="default"),
                    Button("Select None", id="btn-select-none", variant="default"),
                    classes="action-buttons"
                ),
                id="card-restore",
                classes="section-card"
            )
        else:
            # Fallback to Switch widgets for older Textual versions
            return Container(
                Static("[dim]Select components to restore from backup:[/]", classes="section-description"),
                Horizontal(
                    Label("Database:"),
                    Switch(id="switch-restore-db", value=True),
                    Label("User Data:"),
                    Switch(id="switch-restore-data", value=True),
                    Label("Config:"),
                    Switch(id="switch-restore-config", value=True),
                    classes="settings-row"
                ),
                Horizontal(
                    Button("Restore Selected Backup", id="btn-restore-backup", variant="primary"),
                    classes="action-buttons"
                ),
                id="card-restore",
                classes="section-card"
            )

    def compose(self) -> ComposeResult:
        # Main Header
        yield Static("BACKUP & RESTORE", classes="main-header")

        # LEFT COLUMN - Status & Backups
        left_column = Vertical(
            # Status Overview Card
            Container(
                Horizontal(
                    Vertical(
                        Static("Last Backup", classes="status-label"),
                        Static("-", id="last-backup", classes="status-value"),
                        classes="status-item"
                    ),
                    Vertical(
                        Static("Total Count", classes="status-label"),
                        Static("-", id="backup-stats", classes="status-value"),
                        classes="status-item"
                    ),
                    Vertical(
                        Static("Total Size", classes="status-label"),
                        Static("-", id="backup-size", classes="status-value"),
                        classes="status-item"
                    ),
                    Vertical(
                        Static("Valid/Invalid", classes="status-label"),
                        Static("-", id="backup-valid-count", classes="status-value"),
                        classes="status-item"
                    ),
                    classes="status-grid"
                ),
                Static("", id="backup-location", classes="status-label"),
                id="card-status",
                classes="section-card"
            ),
            # Create Backup Card
            Container(
                Horizontal(
                    Label("Description:"),
                    Input(id="input-backup-desc", placeholder="Optional backup description...", value=""),
                    classes="settings-row"
                ),
                Horizontal(
                    Button("Create Backup", id="btn-create-backup", variant="success"),
                    classes="action-buttons"
                ),
                id="card-create",
                classes="section-card card-success"
            ),
            # Backup List Card
            Container(
                OptionList(id="backup-list"),
                Horizontal(
                    Button("Refresh", id="btn-refresh", variant="default"),
                    Button("View Details", id="btn-details", variant="warning"),
                    classes="action-buttons"
                ),
                id="card-list",
                classes="section-card"
            ),
            # Backup Operations Card
            Container(
                Horizontal(
                    Button("Update Selected", id="btn-update-backup", variant="primary"),
                    Button("Update All", id="btn-update-all", variant="primary"),
                    Button("Delete", id="btn-delete-backup", variant="error"),
                    classes="action-buttons"
                ),
                id="card-operations",
                classes="section-card"
            ),
            classes="col-left"
        )

        # RIGHT COLUMN - Settings & Tools
        right_column = Vertical(
            # Restore Options Card
            self._build_restore_card(),
            # Lifecycle Settings Card
            Container(
                Horizontal(
                    Label("Max Backups:"),
                    Input(id="input-max-backups", placeholder="5", value="5"),
                    Label("Retention (days):"),
                    Input(id="input-retention-days", placeholder="30", value="30"),
                    classes="settings-row"
                ),
                Horizontal(
                    Label("Auto Cleanup:"),
                    Switch(id="switch-auto-cleanup", value=True),
                    classes="settings-row"
                ),
                Horizontal(
                    Button("Save Settings", id="btn-save-settings", variant="success"),
                    Button("Run Cleanup", id="btn-manual-cleanup", variant="warning"),
                    classes="action-buttons"
                ),
                id="card-lifecycle",
                classes="section-card"
            ),
            # SSH Remote Backup Card
            Container(
                Horizontal(
                    Button("SSH Setup", id="btn-ssh-setup", variant="warning"),
                    Button("List Connections", id="btn-list-ssh", variant="default"),
                    classes="action-buttons"
                ),
                Horizontal(
                    Button("Upload Latest", id="btn-backup-upload", variant="success"),
                    Button("Sync All", id="btn-sync-all-backups", variant="primary"),
                    classes="action-buttons"
                ),
                id="card-ssh",
                classes="section-card"
            ),
            # Fedora Deployment Card
            Container(
                Static(
                    "[dim]Generate installable packages for fresh Fedora installations[/]",
                    classes="section-description"
                ),
                Horizontal(
                    Button("Generate Package", id="btn-generate-rebuild", variant="success"),
                    Button("View Skip List", id="btn-show-skip-list", variant="warning"),
                    classes="action-buttons"
                ),
                id="card-fedora",
                classes="section-card card-success"
            ),
            classes="col-right"
        )

        yield Horizontal(left_column, right_column, classes="two-col")

    async def on_mount(self) -> None:
        """Initialize state, load settings and backups."""
        # Initialize API client and SSH manager if not set
        if self.api_client is None:
            from ..api_client import MAP2APIClient
            self.api_client = MAP2APIClient()
        if self.ssh_manager is None:
            from ..widgets.ssh_connection_manager import SSHConnectionManager
            self.ssh_manager = SSHConnectionManager()
        await self._refresh_all()

    @work
    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle all button clicks."""
        btn_id = event.button.id
        if btn_id == "btn-create-backup":
            await self._create_backup()
        elif btn_id == "btn-restore-backup":
            await self._restore_backup()
        elif btn_id == "btn-delete-backup":
            await self._delete_backup()
        elif btn_id == "btn-details":
            await self._show_details()
        elif btn_id == "btn-refresh":
            await self._refresh_all()
        elif btn_id == "btn-manual-cleanup":
            await self._run_cleanup()
        elif btn_id == "btn-save-settings":
            await self._save_settings()
        elif btn_id == "btn-update-backup":
            await self._update_backup()
        elif btn_id == "btn-update-all":
            await self._update_all_backups()
        elif btn_id == "btn-ssh-setup":
            await self._show_ssh_setup_dialog()
        elif btn_id == "btn-list-ssh":
            await self._list_ssh_connections()
        elif btn_id == "btn-backup-upload":
            await self._upload_latest_backup()
        elif btn_id == "btn-sync-all-backups":
            await self._sync_all_backups()
        elif btn_id == "btn-generate-rebuild":
            await self._generate_rebuild_script()
        elif btn_id == "btn-show-skip-list":
            await self._show_skip_list()
        elif btn_id == "btn-select-all":
            self._select_all_components()
        elif btn_id == "btn-select-none":
            self._select_none_components()

    def _select_all_components(self) -> None:
        """Select all restore components."""
        if not SELECTION_LIST_AVAILABLE or not SelectionList:
            return
        try:
            selection_list = self.query_one("#restore-components", SelectionList)
            selection_list.select_all()
        except Exception as e:
            logger.debug(f"Error selecting all: {e}")

    def _select_none_components(self) -> None:
        """Deselect all restore components."""
        if not SELECTION_LIST_AVAILABLE or not SelectionList:
            return
        try:
            selection_list = self.query_one("#restore-components", SelectionList)
            selection_list.deselect_all()
        except Exception as e:
            logger.debug(f"Error deselecting all: {e}")

    async def _refresh_all(self):
        await self._refresh_status()
        await self._refresh_backups()
        await self._refresh_settings()

    async def _refresh_status(self):
        """Refresh backup status display."""
        try:
            result = await self.api_client.get_backup_status()
            if result.success and result.data:
                data = result.data

                # Update last backup
                last = data.get("last_backup")
                if last:
                    last_date = last.get("created_at", "Unknown")
                    try:
                        dt = datetime.fromisoformat(last_date)
                        last_date = dt.strftime("%m/%d %H:%M")
                    except Exception:
                        pass
                    self.query_one("#last-backup", Static).update(f"[cyan]{last_date}[/]")
                else:
                    self.query_one("#last-backup", Static).update("[yellow]None[/]")

                # Update count
                count = data.get("backup_count", 0)
                self.query_one("#backup-stats", Static).update(f"[cyan]{count}[/]")

                # Update size
                total_size = data.get("total_size_human", "0 B")
                self.query_one("#backup-size", Static).update(f"[cyan]{total_size}[/]")

                # Update valid/invalid count
                valid_count = data.get("valid_count", 0)
                invalid_count = data.get("invalid_count", 0)
                if invalid_count > 0:
                    self.query_one("#backup-valid-count", Static).update(
                        f"[green]{valid_count}[/]/[red]{invalid_count}[/]"
                    )
                else:
                    self.query_one("#backup-valid-count", Static).update(
                        f"[green]{valid_count}[/]/0"
                    )

                # Update location
                location = data.get("backup_location", "~/.local/share/map2/backups/")
                self.query_one("#backup-location", Static).update(
                    f"[dim]Location: {location}[/]"
                )
        except Exception as e:
            self.log.error(f"Error refreshing status: {e}")

    async def _refresh_backups(self) -> None:
        """Refresh backup list."""
        try:
            result = await self.api_client.list_backups()
            if result.success and result.data:
                backups = result.data.get("backups", [])
                self.backups = backups

                backup_list = self.query_one("#backup-list", OptionList)
                backup_list.clear_options()

                for backup in backups:
                    backup_id = backup.get("id", "unknown")
                    created = backup.get("created_at", "")
                    size = backup.get("size_human", "")
                    valid = backup.get("valid", True)

                    # Format date
                    try:
                        dt = datetime.fromisoformat(created)
                        date_str = dt.strftime("%Y-%m-%d %H:%M")
                    except Exception:
                        date_str = created[:16] if created else "Unknown"

                    status = "[green]Valid[/]" if valid else "[red]Invalid[/]"
                    label = f"{date_str} | {size} | {status}"
                    backup_list.add_option(Option(label, id=backup_id))

        except Exception as e:
            self.log.error(f"Error refreshing backups: {e}")

    async def _refresh_settings(self) -> None:
        """Refresh settings from backend."""
        try:
            result = await self.api_client.get_backup_settings()
            if result.success and result.data:
                self.settings = result.data

                # Update input fields
                self.query_one("#input-max-backups", Input).value = str(
                    self.settings.get("max_backups", 5)
                )
                self.query_one("#input-retention-days", Input).value = str(
                    self.settings.get("retention_days", 30)
                )

                # Update auto-cleanup switch
                auto_cleanup = self.settings.get("auto_cleanup", True)
                self.query_one("#switch-auto-cleanup", Switch).value = auto_cleanup

        except Exception as e:
            self.log.error(f"Error refreshing settings: {e}")

    async def _create_backup(self) -> None:
        """Create a new backup with optional description."""
        # Get description from input
        description = self.query_one("#input-backup-desc", Input).value.strip()

        self.app.notify("Creating backup...", severity="information", timeout=2)
        try:
            result = await self.api_client.create_backup(description=description)
            # Clear description input after successful create
            self.query_one("#input-backup-desc", Input).value = ""
            if result.success:
                backup = result.data.get("backup", {})
                filename = backup.get("filename", "backup")
                size = backup.get("size_human", "")
                self.app.notify(
                    f"[b][green]Backup created![/green][/b]\n\n"
                    f"[cyan]{filename}[/cyan] ([magenta]{size}[/magenta])\n\n"
                    f"[b]This backup includes:[/b]\n"
                    f"- [green]Full reinstall script[/green] ([bold]reinstall.sh[/bold])\n"
                    f"- [green]Step-by-step README[/green] ([bold]README.md[/bold])\n"
                    f"- [green]Manifest & skip list[/green] ([bold]manifest.json[/bold], [bold]skip_list.json[/bold])\n"
                    f"- [green]Complete documentation[/green] ([bold]docs/[/bold])\n\n"
                    f"[b]To migrate or restore on a new Fedora Server:[/b]\n"
                    f"1. Extract the backup archive\n"
                    f"2. Run: chmod +x reinstall.sh && sudo ./reinstall.sh\n"
                    f"3. See README.md for full instructions\n",
                    severity="information",
                    timeout=12
                )
                await self._refresh_all()
            else:
                logger.error(f"Backup creation failed: {result.error}")
                self.app.notify(
                    f"Backup failed: {result.error}",
                    severity="error",
                    timeout=5
                )
        except Exception as e:
            logger.exception(f"Unexpected error during backup creation: {e}")
            self.app.notify(f"Backup error: {str(e)}", severity="error", timeout=5)

    async def _restore_backup(self) -> None:
        """Restore from selected backup with user-selected options."""
        backup_list = self.query_one("#backup-list", OptionList)
        if backup_list.highlighted is None:
            self.app.notify("No backup selected", severity="warning", timeout=2)
            return

        option = backup_list.get_option_at_index(backup_list.highlighted)
        backup_id = option.id

        # Get selected restore components - handles both SelectionList and Switch fallback
        if SELECTION_LIST_AVAILABLE and SelectionList:
            try:
                selection_list = self.query_one("#restore-components", SelectionList)
                selected = list(selection_list.selected)
            except Exception:
                selected = []
        else:
            # Fallback to Switch widgets
            selected = []
            try:
                if self.query_one("#switch-restore-db", Switch).value:
                    selected.append("database")
                if self.query_one("#switch-restore-data", Switch).value:
                    selected.append("user_data")
                if self.query_one("#switch-restore-config", Switch).value:
                    selected.append("config")
            except Exception:
                pass

        if not selected:
            self.app.notify("Select at least one component to restore", severity="warning", timeout=3)
            return

        # Map selection values to component names for display
        component_names = {
            "database": "Database",
            "user_data": "User Data",
            "config": "Configuration",
            "plugins": "Plugin Settings",
            "midi": "MIDI Mappings",
            "profiles": "Performance Profiles",
        }
        components = [component_names.get(s, s) for s in selected]

        # Determine legacy flags for API compatibility
        restore_db = "database" in selected
        restore_data = "user_data" in selected
        restore_config = "config" in selected

        # Confirm restore action
        confirmed = await self.app.push_screen_wait(
            ConfirmDialog(
                f"Restore backup?\n\nComponents: {', '.join(components)}\n\nThis will overwrite existing data.",
                title="Confirm Restore"
            )
        )

        if not confirmed:
            return

        self.app.notify("Restoring backup...", severity="warning", timeout=2)
        try:
            result = await self.api_client.restore_backup(
                backup_id=backup_id,
                restore_database=restore_db,
                restore_user_data=restore_data,
                restore_config=restore_config,
                components=selected  # Pass all selected components
            )
            if result.success:
                restore_result = result.data.get("result", {})
                restored = restore_result.get("restored_items", [])
                skipped = restore_result.get("skipped_items", [])
                errors = restore_result.get("errors", [])

                msg = f"Restored {len(restored)} items"
                if skipped:
                    msg += f", skipped {len(skipped)}"
                if errors:
                    msg += f", {len(errors)} errors"

                self.app.notify(msg, severity="information", timeout=5)
                await self._refresh_all()
            else:
                logger.error(f"Restore failed for backup {backup_id}: {result.error}")
                self.app.notify(
                    f"Restore failed: {result.error}",
                    severity="error",
                    timeout=5
                )
        except Exception as e:
            logger.exception(f"Unexpected error during restore of backup {backup_id}: {e}")
            self.app.notify(f"Restore error: {str(e)}", severity="error", timeout=5)

    async def _delete_backup(self) -> None:
        """Delete selected backup."""
        backup_list = self.query_one("#backup-list", OptionList)
        if backup_list.highlighted is None:
            self.app.notify("No backup selected", severity="warning", timeout=2)
            return

        option = backup_list.get_option_at_index(backup_list.highlighted)
        backup_id = option.id

        # Confirm delete action
        confirmed = await self.app.push_screen_wait(
            ConfirmDialog(
                f"Delete this backup?\n\nBackup ID: {backup_id}\n\nThis action cannot be undone.",
                title="Confirm Delete"
            )
        )

        if not confirmed:
            return

        try:
            result = await self.api_client.delete_backup(backup_id)
            if result.success:
                logger.info(f"Deleted backup: {backup_id}")
                self.app.notify(f"Deleted backup: {backup_id}", severity="warning", timeout=3)
                await self._refresh_all()
            else:
                logger.error(f"Failed to delete backup {backup_id}: {result.error}")
                self.app.notify(
                    f"Delete failed: {result.error}",
                    severity="error",
                    timeout=5
                )
        except Exception as e:
            logger.exception(f"Unexpected error deleting backup {backup_id}: {e}")
            self.app.notify(f"Delete error: {str(e)}", severity="error", timeout=5)

    async def _show_details(self) -> None:
        """Show details of selected backup."""
        backup_list = self.query_one("#backup-list", OptionList)
        if backup_list.highlighted is None:
            self.app.notify("No backup selected", severity="warning", timeout=2)
            return

        option = backup_list.get_option_at_index(backup_list.highlighted)
        backup_id = option.id

        try:
            result = await self.api_client.get_backup(backup_id)
            if result.success and result.data:
                data = result.data
                manifest = data.get("manifest", {})
                contents = manifest.get("contents", {})

                details = []
                for key, info in contents.items():
                    if isinstance(info, dict):
                        size = info.get("size_bytes", 0)
                        count = info.get("count", "")
                        if count:
                            details.append(f"  {key}: {count} files ({self._human_size(size)})")
                        else:
                            details.append(f"  {key}: {self._human_size(size)}")

                detail_text = "\n".join(details) if details else "No content details"
                self.app.notify(
                    f"Backup contents:\n{detail_text}",
                    severity="information",
                    timeout=10
                )
            else:
                self.app.notify("Could not get backup details", severity="error", timeout=3)
        except Exception as e:
            self.app.notify(f"Details error: {str(e)}", severity="error", timeout=5)

    def _human_size(self, size_bytes: int) -> str:
        """Convert bytes to human readable."""
        for unit in ['B', 'KB', 'MB', 'GB']:
            if size_bytes < 1024:
                return f"{size_bytes:.1f} {unit}"
            size_bytes /= 1024
        return f"{size_bytes:.1f} TB"

    async def _save_settings(self) -> None:
        """Save lifecycle settings."""
        try:
            max_backups_raw = self.query_one("#input-max-backups", Input).value
            retention_days_raw = self.query_one("#input-retention-days", Input).value
            if not max_backups_raw or not retention_days_raw:
                self.app.notify("All fields are required.", severity="error", timeout=3)
                return
            if not max_backups_raw.isdigit() or not retention_days_raw.isdigit():
                self.app.notify("Max backups and retention days must be positive integers.", severity="error", timeout=3)
                return
            max_backups = int(max_backups_raw)
            retention_days = int(retention_days_raw)
            if max_backups < 1 or retention_days < 1:
                self.app.notify("Values must be greater than zero.", severity="error", timeout=3)
                return

            # Read auto_cleanup from the switch
            auto_cleanup = self.query_one("#switch-auto-cleanup", Switch).value

            result = await self.api_client.update_backup_settings(
                max_backups=max_backups,
                retention_days=retention_days,
                auto_cleanup=auto_cleanup
            )

            if result.success:
                self.app.notify(
                    f"Settings saved: Max={max_backups}, Retention={retention_days}d, AutoCleanup={'On' if auto_cleanup else 'Off'}",
                    severity="information",
                    timeout=3
                )
                await self._refresh_settings()
            else:
                self.app.notify(f"Save failed: {result.error}", severity="error", timeout=3)
        except Exception as e:
            self.app.notify(f"Save error: {str(e)}", severity="error", timeout=5)

    async def _run_cleanup(self) -> None:
        """Manually run backup cleanup."""
        self.app.notify("Running cleanup...", severity="information", timeout=2)
        try:
            result = await self.api_client.cleanup_backups()
            if result.success:
                cleanup_result = result.data.get("result", {})
                deleted = cleanup_result.get("deleted_count", 0)
                remaining = cleanup_result.get("remaining_count", 0)
                self.app.notify(
                    f"Cleanup complete: {deleted} deleted, {remaining} remaining",
                    severity="information",
                    timeout=5
                )
                await self._refresh_all()
            else:
                self.app.notify(f"Cleanup failed: {result.error}", severity="error", timeout=3)
        except Exception as e:
            self.app.notify(f"Cleanup error: {str(e)}", severity="error", timeout=5)

    async def _show_skip_list(self) -> None:
        """Show full skip list."""
        try:
            result = await self.api_client.get_backup_skip_list()
            if result.success and result.data:
                categories = result.data.get("categories", {})

                lines = ["Items NOT included in backups (reinstall via package managers):"]
                for category, items in categories.items():
                    lines.append(f"\n[cyan]{category}:[/]")
                    for item in items[:5]:  # Limit items shown
                        lines.append(f"  - {item}")
                    if len(items) > 5:
                        lines.append(f"  ... and {len(items) - 5} more")

                self.app.notify("\n".join(lines), severity="information", timeout=15)
            else:
                self.app.notify("Could not get skip list", severity="error", timeout=3)
        except Exception as e:
            self.app.notify(f"Error: {str(e)}", severity="error", timeout=5)

    async def _update_backup(self) -> None:
        """Update selected backup with latest reinstaller and documentation."""
        backup_list = self.query_one("#backup-list", OptionList)
        if backup_list.highlighted is None:
            self.app.notify("No backup selected", severity="warning", timeout=2)
            return

        option = backup_list.get_option_at_index(backup_list.highlighted)
        backup_id = option.id

        self.app.notify("Updating backup...", severity="information", timeout=2)
        try:
            result = await self.api_client.update_backup(backup_id)
            if result.success:
                backup = result.data.get("backup", {})
                last_updated = backup.get("last_updated", "")
                self.app.notify(
                    f"Backup updated with latest installer and docs\nUpdated: {last_updated}",
                    severity="information",
                    timeout=5
                )
                await self._refresh_all()
            else:
                self.app.notify(
                    f"Update failed: {result.error}",
                    severity="error",
                    timeout=5
                )
        except Exception as e:
            self.app.notify(f"Update error: {str(e)}", severity="error", timeout=5)

    async def _update_all_backups(self) -> None:
        """Update all backups with latest reinstaller and documentation."""
        self.app.notify("Updating all backups...", severity="information", timeout=2)
        try:
            result = await self.api_client.update_all_backups()
            if result.success:
                update_result = result.data.get("result", {})
                updated = len(update_result.get("updated", []))
                failed = len(update_result.get("failed", []))
                skipped = len(update_result.get("skipped", []))
                self.app.notify(
                    f"All backups processed:\n"
                    f"Updated: {updated} | Failed: {failed} | Skipped: {skipped}",
                    severity="information",
                    timeout=5
                )
                await self._refresh_all()
            else:
                self.app.notify(
                    f"Update failed: {result.error}",
                    severity="error",
                    timeout=5
                )
        except Exception as e:
            self.app.notify(f"Update error: {str(e)}", severity="error", timeout=5)

    async def _generate_rebuild_script(self) -> None:
        """Generate a standalone rebuild script for system reinstallation."""
        self.app.notify("Generating rebuild script...", severity="information", timeout=2)

        # Update status display
        try:
            status_widget = self.query_one("#rebuild-status", Static)
            status_widget.update("[yellow]Generating...[/]")
        except Exception:
            pass

        try:
            result = await self.api_client.generate_rebuild_script()
            if result.success:
                saved_to = result.data.get("saved_to", "unknown")
                script_name = result.data.get("script_name", "map2-rebuild.sh")
                version = result.data.get("version", "1.0.0")

                # Update status display
                try:
                    status_widget = self.query_one("#rebuild-status", Static)
                    status_widget.update(
                        f"[green]✓ Script saved:[/] [cyan]{saved_to}[/]\n"
                        f"[dim]Run: chmod +x {script_name} && sudo ./{script_name}[/]"
                    )
                except Exception:
                    pass

                self.app.notify(
                    f"Rebuild script generated!\n"
                    f"Saved to: {saved_to}\n"
                    f"Version: {version}\n\n"
                    f"To use on fresh Fedora:\n"
                    f"  chmod +x {script_name}\n"
                    f"  sudo ./{script_name}",
                    severity="information",
                    timeout=10
                )
            else:
                try:
                    status_widget = self.query_one("#rebuild-status", Static)
                    status_widget.update(f"[red]Error: {result.error}[/]")
                except Exception:
                    pass

                self.app.notify(
                    f"Failed to generate script: {result.error}",
                    severity="error",
                    timeout=5
                )
        except Exception as e:
            try:
                status_widget = self.query_one("#rebuild-status", Static)
                status_widget.update(f"[red]Error: {str(e)}[/]")
            except Exception:
                pass

            self.app.notify(f"Error: {str(e)}", severity="error", timeout=5)

    def _get_ssh_connection_summary(self) -> str:
        if not hasattr(self, 'ssh_manager') or self.ssh_manager is None:
            return "[yellow]No SSH connection configured.[/yellow]"
        connections = self.ssh_manager.load_connections()
        if not connections:
            return "[yellow]No SSH connection configured.[/yellow]"
        name, info = next(iter(connections.items()))
        return f"[green]SSH Connection:[/green] {info['user']}@{info['host']}:{info['port']} → {info['dest_path']}"

    async def _show_ssh_setup_dialog(self) -> None:
        """Show SSH setup dialog for configuring backup server."""
        # Get existing connection if any
        existing = None
        if self.ssh_manager:
            connections = self.ssh_manager.load_connections()
            if connections:
                name, info = next(iter(connections.items()))
                existing = info

        result = await self.app.push_screen_wait(
            SSHSetupDialog(ssh_manager=self.ssh_manager, existing_connection=existing)
        )

        if result is None:
            return

        action = result.pop("action", None)

        if action == "save":
            if self.ssh_manager:
                try:
                    self.ssh_manager.save_connection("default", **result)
                except ValueError as e:
                    self.app.notify(f"Invalid input: {e}", severity="error", timeout=5)
                    return

                if not self.ssh_manager.key_exists():
                    try:
                        self.ssh_manager.generate_key_pair()
                    except Exception as e:
                        self.app.notify(f"Key generation failed: {e}", severity="error", timeout=5)
                        return

                pubkey = self.ssh_manager.get_public_key() or "Key not found"
                self.app.notify(
                    f"SSH connection saved!\n\nAdd this public key to ~/.ssh/authorized_keys on remote server:\n{pubkey}",
                    severity="information",
                    timeout=15
                )

    async def _list_ssh_connections(self) -> None:
        """List configured SSH connections."""
        if not self.ssh_manager:
            self.app.notify("SSH manager not initialized", severity="error", timeout=3)
            return

        connections = self.ssh_manager.load_connections()
        if not connections:
            self.app.notify("No SSH connections configured", severity="warning", timeout=3)
            return

        msg_parts = ["[b]Configured SSH Connections:[/b]\n"]
        for name, info in connections.items():
            msg_parts.append(
                f"  [cyan]{name}[/]: {info['user']}@{info['host']}:{info['port']} → {info['dest_path']}"
            )

        if self.ssh_manager.key_exists():
            msg_parts.append("\n[green]SSH key pair exists[/]")
        else:
            msg_parts.append("\n[yellow]No SSH key pair generated[/]")

        self.app.notify("\n".join(msg_parts), severity="information", timeout=8)

    async def _upload_latest_backup(self) -> None:
        """Upload the latest backup to configured SSH server."""
        if not self.ssh_manager:
            self.app.notify("SSH manager not initialized", severity="error", timeout=3)
            return

        connections = self.ssh_manager.load_connections()
        if not connections:
            self.app.notify("No SSH connection configured. Use SSH Setup first.", severity="warning", timeout=5)
            return

        # Get latest backup
        try:
            result = await self.api_client.get_backup_status()
            if not result.success or not result.data:
                self.app.notify("Failed to get backup status", severity="error", timeout=3)
                return

            last_backup = result.data.get("last_backup")
            if not last_backup:
                self.app.notify("No backups available to upload", severity="warning", timeout=3)
                return

            backup_path = last_backup.get("path")
            if not backup_path:
                self.app.notify("Backup path not found", severity="error", timeout=3)
                return

            self.app.notify(f"Uploading {last_backup.get('filename', 'backup')}...", severity="information", timeout=2)

            # Upload via SSH (returns tuple now)
            conn_name = next(iter(connections.keys()))
            success, message = self.ssh_manager.upload_file(conn_name, backup_path)

            if success:
                self.app.notify(message, severity="information", timeout=5)
            else:
                self.app.notify(f"Upload failed: {message}", severity="error", timeout=5)

        except Exception as e:
            self.log.error(f"Upload error: {e}")
            self.app.notify(f"Upload error: {str(e)}", severity="error", timeout=5)

    async def _sync_all_backups(self) -> None:
        """Sync all local backups to configured SSH server."""
        if not self.ssh_manager:
            self.app.notify("SSH manager not initialized", severity="error", timeout=3)
            return

        connections = self.ssh_manager.load_connections()
        if not connections:
            self.app.notify("No SSH connection configured. Use SSH Setup first.", severity="warning", timeout=5)
            return

        try:
            result = await self.api_client.list_backups()
            if not result.success or not result.data:
                self.app.notify("Failed to list backups", severity="error", timeout=3)
                return

            backups = result.data.get("backups", [])
            if not backups:
                self.app.notify("No backups to sync", severity="warning", timeout=3)
                return

            conn_name = next(iter(connections.keys()))
            uploaded = 0
            failed = 0
            last_error = ""

            self.app.notify(f"Syncing {len(backups)} backups...", severity="information", timeout=2)

            for backup in backups:
                backup_path = backup.get("path")
                if backup_path:
                    success, message = self.ssh_manager.upload_file(conn_name, backup_path)
                    if success:
                        uploaded += 1
                    else:
                        failed += 1
                        last_error = message

            if failed == 0:
                self.app.notify(
                    f"All {uploaded} backups synced successfully",
                    severity="information",
                    timeout=5
                )
            else:
                self.app.notify(
                    f"Synced {uploaded} backups, {failed} failed\nLast error: {last_error}",
                    severity="warning",
                    timeout=8
                )

        except Exception as e:
            self.log.error(f"Sync error: {e}")
            self.app.notify(f"Sync error: {str(e)}", severity="error", timeout=5)

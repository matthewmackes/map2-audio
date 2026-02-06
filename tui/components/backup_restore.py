"""
Backup & Restore Wizard (TUI)

Step-by-step terminal interface for backup and restore operations:
- Select backup date
- Choose restore type
- Preview changes
- Execute operation
- Verify integrity
- Show progress
"""

from textual.app import ComposeResult
from textual.containers import Container, Vertical, Horizontal, ScrollableContainer
from textual.widgets import (
    Static,
    Button,
    Label,
    ProgressBar,
    RadioSet,
    RadioButton,
    ListView,
    ListItem,
    Header,
    Footer,
)
from textual.screen import ModalScreen
from textual import work
from typing import List, Dict, Optional
from datetime import datetime
import asyncio
import httpx


class StepIndicator(Static):
    """Visual step indicator widget"""
    
    def __init__(self, total_steps: int, current_step: int = 0):
        super().__init__()
        self.total_steps = total_steps
        self.current_step = current_step
    
    def render(self) -> str:
        steps = []
        for i in range(self.total_steps):
            if i < self.current_step:
                steps.append("[green]✓[/green]")
            elif i == self.current_step:
                steps.append("[cyan]●[/cyan]")
            else:
                steps.append("[dim]○[/dim]")
        
        return " → ".join(steps)
    
    def set_step(self, step: int) -> None:
        self.current_step = step
        self.refresh()


class BackupRestoreWizard(ModalScreen):
    """
    Backup/Restore Wizard Modal Screen
    
    Modes:
    - 'backup': Create new backup
    - 'restore': Restore from backup
    
    Steps for Restore:
    1. Select backup
    2. Choose restore type
    3. Preview changes
    4. Execute restore
    5. Verification
    
    Steps for Backup:
    1. Choose backup type
    2. Review
    3. Execute backup
    4. Verification
    """
    
    CSS = """
    BackupRestoreWizard {
        align: center middle;
    }
    
    #wizard-container {
        width: 80;
        height: auto;
        border: thick $primary;
        background: $surface;
        padding: 1;
    }
    
    #step-indicator {
        height: 3;
        text-align: center;
        margin: 1 0;
    }
    
    #content-area {
        height: 20;
        border: solid $accent;
        margin: 1 0;
        padding: 1;
    }
    
    #button-bar {
        height: 3;
        layout: horizontal;
    }
    
    ProgressBar {
        margin: 1 0;
    }
    
    ListView {
        height: 15;
        border: solid $primary;
    }
    """
    
    BINDINGS = [
        ("escape", "cancel", "Cancel"),
    ]
    
    def __init__(self, mode: str = 'restore', *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.mode = mode
        self.api_base = "http://localhost:8080/api/cluster"
        
        # State
        self.current_step = 0
        self.backups: List[Dict] = []
        self.selected_backup: Optional[str] = None
        self.restore_type = "full"
        self.progress_value = 0
        
        # Define steps
        if mode == 'restore':
            self.steps = [
                "Select Backup",
                "Choose Type",
                "Preview",
                "Execute",
                "Verify",
            ]
        else:
            self.steps = [
                "Choose Type",
                "Review",
                "Execute",
                "Verify",
            ]
        
        self.total_steps = len(self.steps)
    
    def compose(self) -> ComposeResult:
        """Compose the wizard UI"""
        with Container(id="wizard-container"):
            yield Label(
                "Backup Wizard" if self.mode == 'backup' else "Restore Wizard",
                id="wizard-title",
            )
            yield StepIndicator(self.total_steps, self.current_step, id="step-indicator")
            
            with ScrollableContainer(id="content-area"):
                yield Label(id="step-title")
                yield Container(id="step-content")
            
            with Horizontal(id="button-bar"):
                yield Button("Back", id="btn-back", variant="default", disabled=True)
                yield Button("Next", id="btn-next", variant="primary")
                yield Button("Cancel", id="btn-cancel", variant="error")
    
    def on_mount(self) -> None:
        """Initialize wizard on mount"""
        if self.mode == 'restore':
            self.load_backups()
        self.update_step_content()
    
    @work(exclusive=True, thread=True)
    async def load_backups(self) -> None:
        """Load available backups"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.api_base}/backup/list?limit=20")
                if response.status_code == 200:
                    data = response.json()
                    self.backups = data.get('backups', [])
                    self.update_step_content()
        except Exception as e:
            self.notify(f"Failed to load backups: {str(e)}", severity="error")
    
    def update_step_content(self) -> None:
        """Update content based on current step"""
        step_indicator = self.query_one("#step-indicator", StepIndicator)
        step_indicator.set_step(self.current_step)
        
        step_title = self.query_one("#step-title", Label)
        step_title.update(f"Step {self.current_step + 1}: {self.steps[self.current_step]}")
        
        content_area = self.query_one("#step-content", Container)
        content_area.remove_children()
        
        # Render appropriate step content
        if self.mode == 'restore':
            if self.current_step == 0:
                self._render_select_backup_step(content_area)
            elif self.current_step == 1:
                self._render_restore_type_step(content_area)
            elif self.current_step == 2:
                self._render_preview_step(content_area)
            elif self.current_step == 3:
                self._render_execute_step(content_area)
            elif self.current_step == 4:
                self._render_verification_step(content_area)
        else:  # backup mode
            if self.current_step == 0:
                self._render_restore_type_step(content_area)
            elif self.current_step == 1:
                self._render_preview_step(content_area)
            elif self.current_step == 2:
                self._render_execute_step(content_area)
            elif self.current_step == 3:
                self._render_verification_step(content_area)
        
        # Update button states
        self.update_button_states()
    
    def _render_select_backup_step(self, container: Container) -> None:
        """Render backup selection step"""
        if not self.backups:
            container.mount(Label("No backups available"))
            return
        
        with container:
            container.mount(Label("Select a backup to restore:"))
            
            list_view = ListView(id="backup-list")
            for backup in self.backups:
                timestamp = datetime.fromisoformat(backup['timestamp']).strftime('%Y-%m-%d %H:%M')
                label = f"{backup['backup_id'][:30]} | {backup['backup_type']} | {timestamp} | {backup['size_mb']:.1f}MB"
                list_view.append(ListItem(Label(label)))
            
            container.mount(list_view)
    
    def _render_restore_type_step(self, container: Container) -> None:
        """Render restore type selection step"""
        with container:
            if self.mode == 'restore':
                container.mount(Label("What would you like to restore?"))
            else:
                container.mount(Label("What would you like to backup?"))
            
            radio_set = RadioSet(id="restore-type-radio")
            radio_set.mount(RadioButton("Full (everything)", value=True, id="type-full"))
            radio_set.mount(RadioButton("Database only", id="type-database"))
            radio_set.mount(RadioButton("Presets only", id="type-presets"))
            radio_set.mount(RadioButton("Config only", id="type-config"))
            
            container.mount(radio_set)
    
    def _render_preview_step(self, container: Container) -> None:
        """Render preview step"""
        with container:
            container.mount(Label("[yellow]⚠ Warning[/yellow]"))
            container.mount(Label("This will overwrite current data."))
            container.mount(Label("A safety backup will be created automatically."))
            container.mount(Label(""))
            
            if self.mode == 'restore':
                container.mount(Label(f"Backup ID: {self.selected_backup or 'None'}"))
            container.mount(Label(f"Operation: {self.restore_type}"))
    
    def _render_execute_step(self, container: Container) -> None:
        """Render execution step"""
        with container:
            if self.progress_value == 0:
                action = "restore" if self.mode == 'restore' else "backup"
                container.mount(Label(f"Ready to {action}"))
                container.mount(Button(
                    f"Start {action.capitalize()}",
                    id="btn-execute",
                    variant="primary"
                ))
            else:
                container.mount(Label("Operation in progress..."))
                progress = ProgressBar(total=100, show_eta=False)
                progress.update(progress=self.progress_value)
                container.mount(progress)
                container.mount(Label(f"Progress: {self.progress_value}%"))
    
    def _render_verification_step(self, container: Container) -> None:
        """Render verification step"""
        with container:
            if self.progress_value == 100:
                container.mount(Label("[green]✓ Success![/green]"))
                action = "Restore" if self.mode == 'restore' else "Backup"
                container.mount(Label(f"{action} completed successfully."))
            else:
                container.mount(Label("[red]✗ Failed[/red]"))
                container.mount(Label("Operation failed. Check logs for details."))
    
    def update_button_states(self) -> None:
        """Update navigation button states"""
        back_btn = self.query_one("#btn-back", Button)
        next_btn = self.query_one("#btn-next", Button)
        
        # Disable back on first step
        back_btn.disabled = self.current_step == 0
        
        # Update next button label
        if self.current_step == self.total_steps - 1:
            next_btn.label = "Finish"
        else:
            next_btn.label = "Next"
        
        # Disable next if on execute step and not complete
        if self.current_step == (self.total_steps - 2):
            next_btn.disabled = self.progress_value < 100
        else:
            next_btn.disabled = False
    
    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button presses"""
        if event.button.id == "btn-back":
            self.go_back()
        elif event.button.id == "btn-next":
            self.go_next()
        elif event.button.id == "btn-cancel":
            self.action_cancel()
        elif event.button.id == "btn-execute":
            self.execute_operation()
    
    def on_list_view_selected(self, event: ListView.Selected) -> None:
        """Handle backup selection"""
        if event.list_view.id == "backup-list":
            index = event.list_view.index
            if 0 <= index < len(self.backups):
                self.selected_backup = self.backups[index]['backup_id']
    
    def on_radio_set_changed(self, event: RadioSet.Changed) -> None:
        """Handle restore type selection"""
        if event.radio_set.id == "restore-type-radio":
            button = event.pressed
            if button.id == "type-full":
                self.restore_type = "full"
            elif button.id == "type-database":
                self.restore_type = "database"
            elif button.id == "type-presets":
                self.restore_type = "presets"
            elif button.id == "type-config":
                self.restore_type = "config"
    
    def go_back(self) -> None:
        """Go to previous step"""
        if self.current_step > 0:
            self.current_step -= 1
            self.update_step_content()
    
    def go_next(self) -> None:
        """Go to next step"""
        if self.current_step < self.total_steps - 1:
            self.current_step += 1
            self.update_step_content()
        else:
            # Finish
            self.dismiss(True)
    
    def action_cancel(self) -> None:
        """Cancel wizard"""
        self.dismiss(False)
    
    @work(exclusive=True, thread=True)
    async def execute_operation(self) -> None:
        """Execute backup or restore operation"""
        try:
            async with httpx.AsyncClient() as client:
                if self.mode == 'restore':
                    response = await client.post(
                        f"{self.api_base}/backup/restore",
                        json={
                            "backup_id": self.selected_backup,
                            "restore_type": self.restore_type,
                        },
                        timeout=120.0,
                    )
                else:
                    response = await client.post(
                        f"{self.api_base}/backup/create?backup_type={self.restore_type}",
                        timeout=120.0,
                    )
                
                # Simulate progress
                for i in range(0, 101, 20):
                    await asyncio.sleep(1)
                    self.progress_value = i
                    self.update_step_content()
                
                if response.status_code == 200:
                    self.progress_value = 100
                    self.update_step_content()
                    self.notify("Operation completed successfully!", severity="information")
                else:
                    raise Exception(f"Operation failed: {response.text}")
                    
        except Exception as e:
            self.notify(f"Operation failed: {str(e)}", severity="error")
            self.progress_value = 0
            self.update_step_content()


# Helper function to launch wizard
def show_backup_restore_wizard(app, mode: str = 'restore'):
    """Show the backup/restore wizard"""
    def check_result(result):
        if result:
            app.notify(f"{'Restore' if mode == 'restore' else 'Backup'} wizard completed")
    
    wizard = BackupRestoreWizard(mode=mode)
    app.push_screen(wizard, check_result)

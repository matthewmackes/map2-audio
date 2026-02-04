"""
Interactive Sessions Management Screen
Save, load, and delete session configurations
"""

from typing import Optional, List, Dict, Any
from textual.app import ComposeResult
from textual.widgets import Static, Button, Label
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.reactive import reactive

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from ..api_client import MAP2APIClient
from ..modals import ConfirmDialog, FormDialog
from ..widgets import ActionButton, LoadingIndicator


class SessionsScreen(ScrollableContainer):
    """
    Interactive Sessions management screen.

    Features:
    - Save current configuration as session
    - Load saved sessions
    - Delete sessions
    - Display session metadata
    """

    CSS = """
    SessionsScreen {
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

    .controls-section {
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    .sessions-list {
        width: 100%;
        height: auto;
    }

    .session-card {
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    .session-card:hover {
        background: $panel-lighten-1;
    }

    .session-name {
        text-style: bold;
        color: $text;
    }

    .session-meta {
        color: $text-muted;
        font-size: 90%;
    }

    .control-buttons Button {
        margin: 0 1 1 0;
        min-width: 15;
    }
    """

    sessions: reactive[List[Dict[str, Any]]] = reactive([])

    def __init__(self, api_client: MAP2APIClient, id: Optional[str] = None):
        super().__init__(id=id)
        self.api_client = api_client

    def compose(self) -> ComposeResult:
        yield Label("💾 Session Management", classes="section-title")

        with Container(classes="controls-section"):
            yield Label("Session Controls", classes="section-title")
            with Horizontal(classes="control-buttons"):
                yield ActionButton("💾 Save Current Session", variant="success", id="btn-save")
                yield ActionButton("🔄 Refresh", variant="primary", id="btn-refresh")

        yield LoadingIndicator("Loading sessions...", id="loading-sessions")

        with Vertical(classes="sessions-list", id="sessions-list"):
            yield Label("No saved sessions yet.", id="empty-sessions")

    async def on_mount(self) -> None:
        await self.refresh_data()
        self.set_interval(10.0, self.refresh_data)

    async def refresh_data(self) -> None:
        loading = self.query_one("#loading-sessions", LoadingIndicator)
        loading.show("Refreshing sessions...")

        try:
            result = await self.api_client.list_sessions()
            if result.success:
                self.sessions = result.data.get("sessions", [])
                self._update_sessions_display()
        except Exception as e:
            self.app.notify(f"Error refreshing data: {str(e)}", severity="error")
        finally:
            loading.hide()

    def _update_sessions_display(self) -> None:
        sessions_list = self.query_one("#sessions-list", Vertical)
        empty = self.query_one("#empty-sessions", Label)

        for widget in list(sessions_list.children):
            if widget.id != "empty-sessions":
                widget.remove()

        if not self.sessions:
            empty.display = True
            return

        empty.display = False

        for session in self.sessions:
            card = self._create_session_card(session)
            sessions_list.mount(card)

    def _create_session_card(self, session: Dict[str, Any]) -> Container:
        session_id = session.get("id", 0)
        name = session.get("name", "Untitled")
        description = session.get("description", "")
        chains_count = len(session.get("chains", []))

        card = Container(classes="session-card")

        info = Vertical()
        info.mount(Label(name, classes="session-name"))
        if description:
            desc = description[:80] + "..." if len(description) > 80 else description
            info.mount(Label(description, classes="session-meta"))
        info.mount(Label(f"Chains: {chains_count}", classes="session-meta"))

        buttons = Horizontal()
        buttons.mount(ActionButton("Load", variant="primary", id=f"btn-load-{session_id}"))
        buttons.mount(ActionButton("Delete", variant="error", id=f"btn-delete-{session_id}"))

        card.mount(info)
        card.mount(buttons)
        return card

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        button_id = event.button.id

        if button_id == "btn-save":
            await self._save_session()
        elif button_id == "btn-refresh":
            await self.refresh_data()
        elif button_id and button_id.startswith("btn-load-"):
            session_id = int(button_id.replace("btn-load-", ""))
            await self._load_session(session_id)
        elif button_id and button_id.startswith("btn-delete-"):
            session_id = int(button_id.replace("btn-delete-", ""))
            await self._delete_session(session_id)

    async def _save_session(self) -> None:
        fields = [
            {"name": "name", "label": "Session Name:", "type": "text", "required": True},
            {"name": "description", "label": "Description:", "type": "textarea"},
            {"name": "tags", "label": "Tags (comma-separated):", "type": "text"}
        ]

        result = await self.app.push_screen_wait(FormDialog(fields, title="Save Session"))

        if result:
            loading = self.query_one("#loading-sessions", LoadingIndicator)
            loading.show("Saving session...")

            session_data = {
                "name": result["name"],
                "description": result.get("description", ""),
                "tags": [t.strip() for t in result.get("tags", "").split(",") if t.strip()]
            }

            save_result = await self.api_client.save_session(session_data)
            loading.hide()

            if save_result.success:
                self.app.notify("Session saved successfully", severity="information")
                await self.refresh_data()
            else:
                self.app.notify(f"Failed to save: {save_result.error}", severity="error")

    async def _load_session(self, session_id: int) -> None:
        loading = self.query_one("#loading-sessions", LoadingIndicator)
        loading.show("Loading session...")

        result = await self.api_client.load_session(session_id)
        loading.hide()

        if result.success:
            self.app.notify("Session loaded successfully", severity="information")
        else:
            self.app.notify(f"Failed to load: {result.error}", severity="error")

    async def _delete_session(self, session_id: int) -> None:
        session = next((s for s in self.sessions if s.get("id") == session_id), None)
        name = session.get("name", "this session") if session else "this session"

        confirmed = await self.app.push_screen_wait(
            ConfirmDialog(f"Delete session '{name}'?", title="Confirm Delete")
        )

        if confirmed:
            loading = self.query_one("#loading-sessions", LoadingIndicator)
            loading.show("Deleting session...")

            result = await self.api_client.delete_session(session_id)
            loading.hide()

            if result.success:
                self.app.notify("Session deleted", severity="information")
                await self.refresh_data()
            else:
                self.app.notify(f"Failed to delete: {result.error}", severity="error")

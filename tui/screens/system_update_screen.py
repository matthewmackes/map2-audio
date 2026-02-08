"""
System Update Screen (TUI)

Provides a fast control panel for:
- Update this node
- Update all nodes (rolling)
- Manifest capture
- Manifest drift check
- Manifest enforce (per node)
"""

from textual.app import ComposeResult
from textual.containers import Container, Horizontal, Vertical
from textual.widgets import Static, Button, Input, Log
from textual.reactive import reactive
from textual.screen import Screen
from textual import work
import httpx


class SystemUpdateScreen(Screen):
    """TUI screen for system updates and manifest operations."""

    api_base = "http://localhost:8080"

    CSS = """
    SystemUpdateScreen {
        background: $surface;
    }

    #header {
        height: 3;
        content-align: left middle;
        padding: 0 1;
        border-bottom: solid $accent;
    }

    #actions {
        height: auto;
        padding: 1;
        border-bottom: solid $panel;
    }

    #status {
        height: 3;
        content-align: left middle;
        padding: 0 1;
        border-bottom: solid $panel;
    }

    #log {
        height: 1fr;
        border: solid $primary;
    }
    """

    status_text: reactive[str] = reactive("Idle")

    def compose(self) -> ComposeResult:
        yield Static("🔄 System Updates", id="header")

        with Vertical(id="actions"):
            with Horizontal():
                yield Button("Update This Node", id="update-local", variant="primary")
                yield Button("Update All Nodes", id="update-all", variant="warning")
                yield Button("Check Updates", id="check-updates")
            with Horizontal():
                yield Button("Capture Manifest", id="manifest-capture")
                yield Button("Check Drift", id="manifest-drift")
                yield Button("Enforce Manifest", id="manifest-enforce")
            with Horizontal():
                yield Static("Target Node:", classes="label")
                yield Input(placeholder="node id", id="node-id")

        yield Static("Status: Idle", id="status")
        yield Log(id="log")

    def on_mount(self) -> None:
        self._log("System Update screen ready.")

    def _log(self, message: str) -> None:
        log = self.query_one("#log", Log)
        log.write(message)

    def _set_status(self, message: str) -> None:
        status = self.query_one("#status", Static)
        status.update(f"Status: {message}")

    async def _post(self, path: str, payload: dict | None = None) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{self.api_base}{path}", json=payload)
            resp.raise_for_status()
            return resp.json()

    async def _get(self, path: str) -> dict:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"{self.api_base}{path}")
            resp.raise_for_status()
            return resp.json()

    @work
    async def _update_local(self) -> None:
        node_id = self.query_one("#node-id", Input).value.strip()
        if not node_id:
            self._set_status("Provide a node id")
            return
        self._set_status(f"Updating node {node_id}...")
        try:
            result = await self._post(f"/api/cluster/nodes/{node_id}/update", None)
            self._log(f"Update triggered: {result}")
            self._set_status("Node update triggered")
        except Exception as e:
            self._log(f"Update failed: {e}")
            self._set_status("Update failed")

    @work
    async def _update_all(self) -> None:
        self._set_status("Starting cluster update...")
        try:
            result = await self._post(
                "/api/cluster/update/trigger",
                {"target_version": "latest", "dry_run": False},
            )
            self._log(f"Cluster update triggered: {result}")
            self._set_status("Cluster update triggered")
        except Exception as e:
            self._log(f"Cluster update failed: {e}")
            self._set_status("Cluster update failed")

    @work
    async def _check_updates(self) -> None:
        self._set_status("Checking updates...")
        try:
            result = await self._get("/api/cluster/update/schedule")
            self._log(f"Update schedule: {result}")
            self._set_status("Schedule loaded")
        except Exception as e:
            self._log(f"Check failed: {e}")
            self._set_status("Check failed")

    @work
    async def _capture_manifest(self) -> None:
        node_id = self.query_one("#node-id", Input).value.strip()
        if not node_id:
            self._set_status("Provide a node id")
            return
        self._set_status("Capturing manifest...")
        try:
            result = await self._post("/api/cluster/update/manifest/capture", {"source_node_id": node_id})
            self._log(f"Manifest captured: {result}")
            self._set_status("Manifest captured")
        except Exception as e:
            self._log(f"Capture failed: {e}")
            self._set_status("Capture failed")

    @work
    async def _check_drift(self) -> None:
        self._set_status("Checking drift...")
        try:
            result = await self._get("/api/cluster/update/manifest/drift")
            self._log(f"Drift: {result}")
            self._set_status("Drift check complete")
        except Exception as e:
            self._log(f"Drift check failed: {e}")
            self._set_status("Drift check failed")

    @work
    async def _enforce_manifest(self) -> None:
        node_id = self.query_one("#node-id", Input).value.strip()
        if not node_id:
            self._set_status("Provide a node id")
            return
        self._set_status("Enforcing manifest...")
        try:
            result = await self._post(
                "/api/cluster/update/manifest/enforce",
                {"node_id": node_id, "dry_run": False},
            )
            self._log(f"Manifest enforced: {result}")
            self._set_status("Manifest enforced")
        except Exception as e:
            self._log(f"Enforce failed: {e}")
            self._set_status("Enforce failed")

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        match event.button.id:
            case "update-local":
                self._update_local()
            case "update-all":
                self._update_all()
            case "check-updates":
                self._check_updates()
            case "manifest-capture":
                self._capture_manifest()
            case "manifest-drift":
                self._check_drift()
            case "manifest-enforce":
                self._enforce_manifest()

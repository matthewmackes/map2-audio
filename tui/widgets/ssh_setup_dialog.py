"""
SSH Setup Dialog for MAP2 Backup System.
Provides a modal dialog for configuring SSH backup connections.
"""

from typing import Optional, Dict, Any
from textual.screen import ModalScreen
from textual.widgets import Button, Label, Input, Static
from textual.containers import Vertical, Horizontal, Container
from textual.app import ComposeResult
from textual.binding import Binding
from textual import work


class SSHSetupDialog(ModalScreen[Optional[Dict[str, Any]]]):
    """
    Modal dialog for SSH backup setup, connection test, and host key management.

    Returns:
        Dict with connection info and action on save/test/accept_key
        None on cancel
    """

    CSS = """
    SSHSetupDialog {
        align: center middle;
    }

    #ssh-dialog-container {
        width: 80;
        height: auto;
        max-height: 90%;
        background: $panel;
        border: thick $primary;
        padding: 1 2;
    }

    #ssh-dialog-title {
        text-align: center;
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    .ssh-field-label {
        margin-top: 1;
    }

    #ssh-key-info {
        margin-top: 1;
        padding: 1;
        background: $surface;
        border: solid $primary-darken-2;
    }

    #ssh-key-content {
        color: $text;
        text-style: italic;
    }

    #ssh-fingerprint-section {
        margin-top: 1;
        padding: 1;
        background: $warning-darken-3;
        border: solid $warning;
        display: none;
    }

    #ssh-fingerprint-section.visible {
        display: block;
    }

    #ssh-fingerprint-label {
        color: $warning;
        text-style: bold;
    }

    #ssh-fingerprint {
        color: $text;
        margin-top: 0;
    }

    #ssh-status {
        margin-top: 1;
        padding: 1;
        text-align: center;
        min-height: 3;
    }

    #ssh-dialog-buttons {
        width: 100%;
        height: auto;
        align: center middle;
        margin-top: 1;
    }

    #ssh-dialog-buttons Button {
        margin: 0 1;
    }

    #btn-accept-host-key {
        display: none;
    }

    #btn-accept-host-key.visible {
        display: block;
    }

    .ssh-section-title {
        text-style: bold;
        color: $primary;
        margin-top: 1;
    }
    """

    BINDINGS = [
        Binding("escape", "cancel", "Cancel", show=False),
    ]

    def __init__(self, ssh_manager=None, existing_connection: Optional[Dict[str, Any]] = None):
        """
        Initialize SSH setup dialog.

        Args:
            ssh_manager: SSHConnectionManager instance for testing/saving
            existing_connection: Pre-fill with existing connection data
        """
        self.ssh_manager = ssh_manager
        self.existing = existing_connection or {}
        self._pending_host_key = None
        self._pending_port = 22
        super().__init__()

    def compose(self) -> ComposeResult:
        """Compose dialog widgets."""
        yield Container(
            Label("SSH Backup Server Setup", id="ssh-dialog-title"),
            Vertical(
                # Connection Settings
                Label("Connection Settings", classes="ssh-section-title"),
                Label("Server Hostname/IP:", classes="ssh-field-label"),
                Input(
                    placeholder="example.com or 192.168.1.100",
                    id="ssh-host",
                    value=self.existing.get("host", "")
                ),
                Label("Username:", classes="ssh-field-label"),
                Input(
                    placeholder="backup-user",
                    id="ssh-user",
                    value=self.existing.get("user", "")
                ),
                Label("Port:", classes="ssh-field-label"),
                Input(
                    placeholder="22",
                    id="ssh-port",
                    value=str(self.existing.get("port", "22"))
                ),
                Label("Remote Backup Path:", classes="ssh-field-label"),
                Input(
                    placeholder="/home/user/backups or ~/backups",
                    id="ssh-dest-path",
                    value=self.existing.get("dest_path", "")
                ),

                # Public Key Section
                Label("SSH Public Key", classes="ssh-section-title"),
                Container(
                    Static("", id="ssh-key-content"),
                    id="ssh-key-info"
                ),

                # Host Key Fingerprint Section (shown when needed)
                Container(
                    Static("Host Key Verification Required", id="ssh-fingerprint-label"),
                    Static("", id="ssh-fingerprint"),
                    Static("[dim]Verify this fingerprint matches the server before accepting.[/]"),
                    id="ssh-fingerprint-section"
                ),

                # Status
                Static("", id="ssh-status"),
            ),
            Horizontal(
                Button("Test Connection", id="btn-ssh-test", variant="primary"),
                Button("Accept Host Key", id="btn-accept-host-key", variant="warning"),
                Button("Save", id="btn-ssh-save", variant="success"),
                Button("Cancel", id="btn-ssh-cancel", variant="default"),
                id="ssh-dialog-buttons"
            ),
            id="ssh-dialog-container"
        )

    def on_mount(self) -> None:
        """Initialize dialog on mount."""
        self.query_one("#ssh-host", Input).focus()
        self._update_public_key_display()

    def _update_public_key_display(self) -> None:
        """Update the public key display."""
        key_content = self.query_one("#ssh-key-content", Static)

        if self.ssh_manager and self.ssh_manager.key_exists():
            pubkey = self.ssh_manager.get_public_key()
            if pubkey:
                # Truncate for display but show full key
                if len(pubkey) > 100:
                    display_key = pubkey[:80] + "..."
                else:
                    display_key = pubkey
                key_content.update(
                    f"[green]Key exists[/]\n"
                    f"[dim]{display_key}[/]\n\n"
                    f"[yellow]Copy this key to ~/.ssh/authorized_keys on the server[/]"
                )
            else:
                key_content.update("[yellow]Key will be generated on first save/test[/]")
        else:
            key_content.update("[yellow]Key will be generated on first save/test[/]")

    def _get_form_data(self) -> Dict[str, Any]:
        """Get current form data."""
        port_str = self.query_one("#ssh-port", Input).value.strip()
        try:
            port = int(port_str) if port_str else 22
        except ValueError:
            port = 22

        return {
            "host": self.query_one("#ssh-host", Input).value.strip(),
            "user": self.query_one("#ssh-user", Input).value.strip(),
            "port": port,
            "dest_path": self.query_one("#ssh-dest-path", Input).value.strip(),
        }

    def _validate_form(self) -> Optional[str]:
        """Validate form data. Returns error message or None if valid."""
        data = self._get_form_data()

        if not data["host"]:
            return "Hostname is required"
        if not data["user"]:
            return "Username is required"
        if not data["dest_path"]:
            return "Destination path is required"

        port_str = self.query_one("#ssh-port", Input).value.strip()
        try:
            port = int(port_str) if port_str else 22
            if port < 1 or port > 65535:
                return "Port must be between 1 and 65535"
        except ValueError:
            return "Port must be a number"

        # Validate using SSH manager if available
        if self.ssh_manager:
            from widgets.ssh_connection_manager import SSHConnectionManager
            try:
                SSHConnectionManager._sanitize_hostname(data["host"])
            except ValueError as e:
                return str(e)

            try:
                SSHConnectionManager._sanitize_username(data["user"])
            except ValueError as e:
                return str(e)

            try:
                SSHConnectionManager._sanitize_path(data["dest_path"])
            except ValueError as e:
                return str(e)

        return None

    def _show_fingerprint_section(self, fingerprint: str, host: str, port: int) -> None:
        """Show the host key fingerprint section for user verification."""
        section = self.query_one("#ssh-fingerprint-section", Container)
        fingerprint_display = self.query_one("#ssh-fingerprint", Static)
        accept_btn = self.query_one("#btn-accept-host-key", Button)

        fingerprint_display.update(
            f"Host: [cyan]{host}:{port}[/]\n"
            f"Fingerprint:\n[bold]{fingerprint}[/]"
        )

        section.add_class("visible")
        accept_btn.add_class("visible")

        self._pending_host_key = host
        self._pending_port = port

    def _hide_fingerprint_section(self) -> None:
        """Hide the host key fingerprint section."""
        section = self.query_one("#ssh-fingerprint-section", Container)
        accept_btn = self.query_one("#btn-accept-host-key", Button)

        section.remove_class("visible")
        accept_btn.remove_class("visible")

        self._pending_host_key = None

    def _set_status(self, message: str, severity: str = "info") -> None:
        """Update status display."""
        status = self.query_one("#ssh-status", Static)

        color_map = {
            "info": "blue",
            "success": "green",
            "warning": "yellow",
            "error": "red"
        }
        color = color_map.get(severity, "white")
        status.update(f"[{color}]{message}[/]")

    @work
    async def _do_test_connection(self, accept_new_key: bool = False) -> None:
        """Test the SSH connection."""
        error = self._validate_form()
        if error:
            self._set_status(error, "error")
            return

        data = self._get_form_data()
        self._set_status("Testing connection...", "info")

        if not self.ssh_manager:
            self._set_status("SSH manager not initialized", "error")
            return

        # Ensure key exists
        if not self.ssh_manager.key_exists():
            self._set_status("Generating SSH key pair...", "info")
            try:
                self.ssh_manager.generate_key_pair()
                self._update_public_key_display()
            except Exception as e:
                self._set_status(f"Key generation failed: {e}", "error")
                return

        # Save connection first so we can test it
        try:
            self.ssh_manager.save_connection(
                "default",
                data["host"],
                data["user"],
                data["port"],
                data["dest_path"]
            )
        except ValueError as e:
            self._set_status(f"Invalid input: {e}", "error")
            return

        # Test connection
        success, message = self.ssh_manager.test_connection(
            "default",
            accept_new_host_key=accept_new_key
        )

        if success:
            self._set_status("Connection successful!", "success")
            self._hide_fingerprint_section()
        else:
            if "host key verification failed" in message.lower():
                # Show fingerprint for user to verify
                fingerprint = self.ssh_manager.get_host_key_fingerprint(
                    data["host"],
                    data["port"]
                )
                if fingerprint:
                    self._show_fingerprint_section(
                        fingerprint,
                        data["host"],
                        data["port"]
                    )
                    self._set_status(
                        "Host key not recognized. Verify fingerprint and click 'Accept Host Key'",
                        "warning"
                    )
                else:
                    self._set_status(
                        f"Cannot retrieve host key from {data['host']}:{data['port']}",
                        "error"
                    )
            else:
                self._set_status(message, "error")

    @work
    async def _do_accept_host_key(self) -> None:
        """Accept the pending host key."""
        if not self._pending_host_key or not self.ssh_manager:
            return

        self._set_status("Adding host key...", "info")

        success, message = self.ssh_manager.add_host_to_known_hosts(
            self._pending_host_key,
            self._pending_port
        )

        if success:
            self._set_status("Host key accepted. Testing connection...", "success")
            self._hide_fingerprint_section()
            # Now test the connection again
            await self._do_test_connection(accept_new_key=False)
        else:
            self._set_status(f"Failed to add host key: {message}", "error")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button clicks."""
        if event.button.id == "btn-ssh-test":
            self._do_test_connection(accept_new_key=False)

        elif event.button.id == "btn-accept-host-key":
            self._do_accept_host_key()

        elif event.button.id == "btn-ssh-save":
            error = self._validate_form()
            if error:
                self._set_status(error, "error")
                return

            data = self._get_form_data()
            data["action"] = "save"
            self.dismiss(data)

        elif event.button.id == "btn-ssh-cancel":
            self.dismiss(None)

    def action_cancel(self) -> None:
        """Cancel action (Escape key)."""
        self.dismiss(None)

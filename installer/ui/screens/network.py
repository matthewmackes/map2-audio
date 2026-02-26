"""
installer/ui/screens/network.py
================================
Stage 02 — Network Configuration + Live Connectivity Test.

Anaconda analogy:
  Anaconda's Network & Host Name spoke lets users configure interfaces,
  set the hostname, and test connectivity.  Our screen does the same with
  real-time validation: as the user types a hostname, it's validated
  immediately.  A background ping test runs automatically to verify
  internet connectivity for later package downloads.
"""

from __future__ import annotations

import re
import subprocess

from textual import work
from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import ScrollableContainer, Vertical, Horizontal
from textual.widgets import (
    Button, Checkbox, Footer, Header, Input, Label, RichLog, Rule, Static,
)

from installer.ui.screens._base import BaseInstallerScreen

# Hosts we ping to verify connectivity (order matters — first success wins)
CONNECTIVITY_TARGETS = [
    ("github.com",    "GitHub (package downloads)"),
    ("pypi.org",      "PyPI (Python packages)"),
    ("8.8.8.8",       "Google DNS (network baseline)"),
]

HOSTNAME_RE = re.compile(r'^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?$', re.IGNORECASE)


class NetworkScreen(BaseInstallerScreen):

    SCREEN_TITLE    = "Network Configuration"
    SCREEN_SUBTITLE = "Set hostname and verify connectivity for package downloads"

    BINDINGS = BaseInstallerScreen.BINDINGS + [
        Binding("ctrl+n", "go_next",       "Continue ▶", show=True),
        Binding("ctrl+r", "test_connectivity", "Test Connection", show=True),
    ]

    CSS = """
    NetworkScreen { background: $surface; }
    .field-group {
        margin: 1 4;
        border: round $primary;
        padding: 1;
        height: auto;
    }
    .field-label {
        color: $primary;
        text-style: bold;
        margin-bottom: 0;
    }
    .field-hint {
        color: $text-muted;
        margin-bottom: 1;
    }
    .error-text {
        color: $error;
    }
    #connectivity-log {
        height: 8;
        margin: 0 4;
        border: round $success;
    }
    #avb-group {
        margin: 1 4;
        border: round $primary;
        padding: 1;
        height: auto;
    }
    """

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with ScrollableContainer():
            with Vertical(classes="field-group"):
                yield Label("Hostname", classes="field-label")
                yield Static(
                    "The system hostname used by PipeWire, JACK, and the MAP2 web UI.",
                    classes="field-hint",
                )
                yield Input(
                    value=self.config.network.hostname,
                    placeholder="e.g. map2-audio-01",
                    id="hostname-input",
                )
                yield Static("", id="hostname-error", classes="error-text")

            with Vertical(classes="field-group"):
                yield Label("HTTP Proxy (optional)", classes="field-label")
                yield Static(
                    "Leave blank if you have direct internet access.",
                    classes="field-hint",
                )
                yield Input(
                    value=self.config.network.proxy_url or "",
                    placeholder="http://proxy.corp.example.com:3128",
                    id="proxy-input",
                )

            Rule()
            yield Label("  Connectivity Test", classes="field-label")
            yield RichLog(id="connectivity-log", highlight=True, markup=True)
            yield Button("Test Connectivity (Ctrl+R)", id="test-btn", variant="primary")

            with Vertical(id="avb-group"):
                yield Label("AVB Network Interface (optional)", classes="field-label")
                yield Static(
                    "Only required if you selected AVB in the Software screen.\n"
                    "Leave blank to auto-detect later.",
                    classes="field-hint",
                )
                yield Checkbox(
                    "Configure AVB/TSN network interface",
                    value=self.config.network.configure_avb,
                    id="avb-check",
                )
                yield Input(
                    value=self.config.network.avb_interface or "",
                    placeholder="e.g. enp0s25  (Gigabit NIC for AVB)",
                    id="avb-iface-input",
                )
        yield Footer()

    def on_mount(self) -> None:
        super().on_mount()
        # Run connectivity test automatically on mount
        self.action_test_connectivity()

    def on_input_changed(self, event: Input.Changed) -> None:
        """Real-time validation as the user types."""
        if event.input.id == "hostname-input":
            self._validate_hostname(event.value)
            self.config.network.hostname = event.value

        elif event.input.id == "proxy-input":
            self.config.network.proxy_url = event.value or None

        elif event.input.id == "avb-iface-input":
            self.config.network.avb_interface = event.value or None

    def on_checkbox_changed(self, event: Checkbox.Changed) -> None:
        if event.checkbox.id == "avb-check":
            self.config.network.configure_avb = event.value

    def _validate_hostname(self, value: str) -> bool:
        """Validate hostname and display inline error if invalid."""
        err_widget = self.query_one("#hostname-error", Static)
        if not value:
            err_widget.update("Hostname cannot be empty.")
            return False
        if not HOSTNAME_RE.match(value):
            err_widget.update(
                "Invalid hostname. Use only letters, digits, and hyphens. "
                "Cannot start or end with a hyphen."
            )
            return False
        err_widget.update("")
        return True

    def validate(self) -> list[str]:
        errors = []
        if not self._validate_hostname(self.config.network.hostname):
            errors.append("Hostname is invalid — see the inline error above.")
        return errors

    @work(exclusive=True, thread=True)
    def action_test_connectivity(self) -> None:
        """Background connectivity test — runs as a Worker thread."""
        log = self.query_one("#connectivity-log", RichLog)

        def post(msg: str) -> None:
            self.app.call_from_thread(log.write, msg)

        post("[bold cyan]── Connectivity Test ──[/bold cyan]")
        all_ok = True

        for host, label in CONNECTIVITY_TARGETS:
            try:
                result = subprocess.run(
                    ["ping", "-c", "1", "-W", "3", host],
                    capture_output=True, text=True, timeout=5,
                )
                if result.returncode == 0:
                    post(f"[green]✓[/green] {label} ({host})")
                else:
                    post(f"[yellow]⚠[/yellow] {label} ({host}) — unreachable")
                    all_ok = False
            except Exception as e:
                post(f"[red]✗[/red] {label} ({host}) — {e}")
                all_ok = False

        if all_ok:
            post("\n[bold green]All connectivity checks passed.[/bold green]")
        else:
            post(
                "\n[bold yellow]Some checks failed.[/bold yellow]\n"
                "Package downloads may fail.  Check network/firewall or configure proxy above."
            )

        self.app.call_from_thread(
            setattr, self.config.network, "connectivity_ok", all_ok
        )

    @property
    def help_text(self) -> str:
        return """\
# Network Configuration

## Hostname
The system hostname is used by:
  • PipeWire to name audio nodes (visible in pw-top / Carla)
  • The MAP2 web UI (shown in the browser title and cluster view)
  • JACK to identify audio clients
  • mDNS/Avahi for automatic discovery by other MAP2 nodes

Rules: lowercase letters, digits, and hyphens only.  Cannot start or
end with a hyphen.  Maximum 63 characters.

## Connectivity Test
The installer pings github.com and pypi.org to verify you can reach
the package repositories needed during installation:
  • GitHub: clone MAP2 repo if not already installed
  • PyPI: pip install -r requirements.txt
  • npm registry: npm install for the React frontend

If connectivity fails, you can still proceed — the installer will
attempt offline install from cached packages where possible.

## HTTP Proxy
If your network requires a proxy, enter it here in the format:
  http://proxy.host:port  or  http://user:pass@proxy.host:port

This is set as HTTP_PROXY / HTTPS_PROXY for pip, npm, and curl.

## AVB Interface
Only relevant if you selected the AVB component in Software Selection.
The AVB NIC must be a physical Gigabit Ethernet port (not Wi-Fi).
AVB requires hardware timestamping support — check with: ethtool -T <iface>

## Pro Tip
On a dedicated audio node, disable Wi-Fi (nmcli radio wifi off) to
eliminate periodic Wi-Fi scan interrupts that add latency jitter.

## Common Pitfall
Using a hostname with uppercase letters can cause mDNS discovery
failures.  Always use lowercase for MAP2 hostnames.

Navigate: Tab / Shift-Tab │ Help: F1 │ Test: Ctrl+R │ Next: Ctrl+N
"""

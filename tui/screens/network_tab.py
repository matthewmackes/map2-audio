"""
Network Configuration Tab
Comprehensive network management for Fedora-based systems
Parity with web NetworkPanel.tsx component
"""

import asyncio
from typing import Optional, List, Dict, Any

from textual.app import ComposeResult
from textual.widgets import Static, Button, Label, Input, Select, DataTable, Switch
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.reactive import reactive

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from api_client import MAP2APIClient
from widgets import ActionButton, StatusIndicator, LoadingIndicator
from modals import ConfirmDialog, InputDialog


class InterfaceCard(Container):
    """Network interface status card."""

    DEFAULT_CSS = """
    InterfaceCard {
        height: auto;
        width: 100%;
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    InterfaceCard.connected {
        border: solid $success;
    }

    InterfaceCard.disconnected {
        border: solid $error;
    }

    .interface-header {
        width: 100%;
        height: auto;
    }

    .interface-name {
        text-style: bold;
        color: $accent;
        width: 1fr;
    }

    .interface-status {
        width: auto;
        padding: 0 1;
    }

    .interface-details {
        color: $text-muted;
        margin-top: 1;
    }

    .interface-actions {
        width: 100%;
        height: auto;
        margin-top: 1;
    }

    .interface-actions Button {
        min-width: 12;
        margin-right: 1;
    }
    """

    def __init__(self, interface_data: Dict[str, Any], interface_type: str = "ethernet", **kwargs):
        super().__init__(**kwargs)
        self.interface_data = interface_data
        self.interface_type = interface_type
        self.is_connected = interface_data.get("connected", False)

    def on_mount(self) -> None:
        """Apply styling based on connection status."""
        if self.is_connected:
            self.add_class("connected")
        else:
            self.add_class("disconnected")

    def compose(self) -> ComposeResult:
        name = self.interface_data.get("name", "Unknown")
        connected = self.interface_data.get("connected", False)
        ip = self.interface_data.get("ip_address", "N/A")
        mac = self.interface_data.get("mac_address", "N/A")
        speed = self.interface_data.get("speed", "N/A")

        # Header
        with Horizontal(classes="interface-header"):
            icon = "📶" if self.interface_type == "wifi" else "🔌"
            yield Label(f"{icon} {name}", classes="interface-name")
            status_text = "[green]Connected[/]" if connected else "[red]Disconnected[/]"
            yield Static(status_text, classes="interface-status")

        # Details
        yield Static(f"IP: {ip} | MAC: {mac}", classes="interface-details")

        if self.interface_type == "wifi" and connected:
            ssid = self.interface_data.get("ssid", "N/A")
            signal = self.interface_data.get("signal_strength", 0)
            yield Static(f"SSID: {ssid} | Signal: {signal}%", classes="interface-details")
        elif self.interface_type == "ethernet" and connected:
            yield Static(f"Speed: {speed}", classes="interface-details")

        # Actions
        with Horizontal(classes="interface-actions"):
            if self.interface_type == "wifi":
                if connected:
                    yield Button("Disconnect", id=f"disconnect-{name}", variant="error")
                yield Button("Scan Networks", id=f"scan-{name}", variant="primary")
            yield Button("Configure IP", id=f"config-ip-{name}", variant="default")


class WiFiNetworkList(Container):
    """List of available WiFi networks."""

    DEFAULT_CSS = """
    WiFiNetworkList {
        height: auto;
        max-height: 20;
        width: 100%;
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    .wifi-title {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    .wifi-table {
        height: 1fr;
        width: 100%;
    }
    """

    networks: reactive[List[Dict]] = reactive(list)

    def compose(self) -> ComposeResult:
        yield Label("📡 Available WiFi Networks", classes="wifi-title")
        yield DataTable(id="wifi-networks-table", classes="wifi-table")

    def on_mount(self) -> None:
        """Set up the data table."""
        table = self.query_one("#wifi-networks-table", DataTable)
        table.add_columns("SSID", "Signal", "Security", "Action")

    def update_networks(self, networks: List[Dict]) -> None:
        """Update the networks display."""
        self.networks = networks
        try:
            table = self.query_one("#wifi-networks-table", DataTable)
            table.clear()

            for network in sorted(networks, key=lambda x: x.get("signal_strength", 0), reverse=True):
                ssid = network.get("ssid", "Hidden")
                signal = network.get("signal_strength", 0)
                security = network.get("security", "open")

                # Signal bars
                if signal >= 80:
                    signal_str = "████ Excellent"
                elif signal >= 60:
                    signal_str = "███░ Good"
                elif signal >= 40:
                    signal_str = "██░░ Fair"
                elif signal >= 20:
                    signal_str = "█░░░ Weak"
                else:
                    signal_str = "░░░░ Poor"

                # Security icon
                if security in ("open", "none"):
                    sec_str = "🔓 Open"
                else:
                    sec_str = f"🔒 {security.upper()}"

                table.add_row(ssid, signal_str, sec_str, "Connect")
        except Exception:
            pass


class DNSConfigPanel(Container):
    """DNS configuration panel."""

    DEFAULT_CSS = """
    DNSConfigPanel {
        height: auto;
        width: 100%;
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    .dns-title {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    .dns-row {
        width: 100%;
        height: auto;
        margin-bottom: 1;
    }

    .dns-label {
        width: 15;
        color: $text-muted;
    }

    .dns-servers {
        color: $text;
    }
    """

    def __init__(self, api_client: MAP2APIClient, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client

    def compose(self) -> ComposeResult:
        yield Label("🌐 DNS Configuration", classes="dns-title")

        with Horizontal(classes="dns-row"):
            yield Label("Primary:", classes="dns-label")
            yield Input(placeholder="8.8.8.8", id="dns-primary")

        with Horizontal(classes="dns-row"):
            yield Label("Secondary:", classes="dns-label")
            yield Input(placeholder="8.8.4.4", id="dns-secondary")

        with Horizontal(classes="dns-row"):
            yield ActionButton("Apply DNS", variant="primary", id="btn-apply-dns")
            yield ActionButton("Use Google DNS", variant="default", id="btn-google-dns")
            yield ActionButton("Use Cloudflare", variant="default", id="btn-cloudflare-dns")


class HostnamePanel(Container):
    """Hostname configuration panel."""

    DEFAULT_CSS = """
    HostnamePanel {
        height: auto;
        width: 100%;
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    .hostname-title {
        text-style: bold;
        color: $accent;
        margin-bottom: 1;
    }

    .hostname-row {
        width: 100%;
        height: auto;
        margin-bottom: 1;
    }

    .hostname-current {
        color: $success;
        text-style: bold;
    }
    """

    def compose(self) -> ComposeResult:
        yield Label("🖥️ Hostname", classes="hostname-title")

        with Horizontal(classes="hostname-row"):
            yield Label("Current: ", classes="dns-label")
            yield Static("loading...", id="current-hostname", classes="hostname-current")

        with Horizontal(classes="hostname-row"):
            yield Input(placeholder="new-hostname", id="new-hostname")
            yield ActionButton("Change", variant="primary", id="btn-change-hostname")


class NetworkTab(ScrollableContainer):
    """
    Network Configuration Tab.

    Features:
    - View network interfaces (Ethernet, WiFi)
    - Scan and connect to WiFi networks
    - Configure IP (DHCP/Static)
    - DNS configuration
    - Hostname management
    - Connectivity testing (ping)
    """

    CSS = """
    NetworkTab {
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

    .section-title {
        text-style: bold;
        color: $accent;
        margin-top: 1;
        margin-bottom: 1;
    }

    .status-summary {
        background: $panel;
        border: heavy $primary;
        padding: 1;
        margin-bottom: 1;
    }

    .status-row {
        width: 100%;
        height: auto;
    }

    .ping-section {
        background: $panel;
        border: solid $primary;
        padding: 1;
        margin-bottom: 1;
    }

    .ping-row {
        width: 100%;
        height: auto;
    }

    .ping-result {
        color: $text-muted;
        margin-top: 1;
    }
    """

    def __init__(self, api_client: MAP2APIClient, id: Optional[str] = None):
        super().__init__(id=id)
        self.api_client = api_client
        self.network_status: Dict[str, Any] = {}
        self.ethernet_interfaces: List[Dict] = []
        self.wifi_interfaces: List[Dict] = []
        self.wifi_networks: List[Dict] = []

    def compose(self) -> ComposeResult:
        """Build network configuration UI."""

        # Main Header
        yield Label("🌐 NETWORK CONFIGURATION", classes="main-header")

        # Loading indicator
        yield LoadingIndicator("Loading network status...", id="loading-network")

        # Status Summary
        with Container(classes="status-summary"):
            yield Label("Network Status", classes="section-title")
            with Horizontal(classes="status-row"):
                yield StatusIndicator("Internet", id="status-internet")
                yield StatusIndicator("Local Network", id="status-local")
                yield StatusIndicator("DNS", id="status-dns")

        # Ethernet Interfaces
        yield Label("🔌 Ethernet Interfaces", classes="section-title")
        yield Vertical(id="ethernet-list")

        # WiFi Interfaces
        yield Label("📶 WiFi Interfaces", classes="section-title")
        yield Vertical(id="wifi-list")

        # WiFi Networks
        yield WiFiNetworkList(id="wifi-networks")

        # DNS Configuration
        yield DNSConfigPanel(self.api_client, id="dns-config")

        # Hostname
        yield HostnamePanel(id="hostname-panel")

        # Connectivity Test
        with Container(classes="ping-section"):
            yield Label("🔍 Connectivity Test", classes="section-title")
            with Horizontal(classes="ping-row"):
                yield Input(placeholder="Host to ping (e.g., google.com)", id="ping-host")
                yield ActionButton("Ping", variant="primary", id="btn-ping")
            yield Static("", id="ping-result", classes="ping-result")

        # Refresh button
        yield ActionButton("🔄 Refresh Network Status", variant="default", id="btn-refresh-network")

    async def on_mount(self) -> None:
        """Initialize network data on mount."""
        await self.refresh_data()

    async def refresh_data(self) -> None:
        """Refresh all network data."""
        loading = self.query_one("#loading-network", LoadingIndicator)
        loading.show("Refreshing network status...")

        try:
            # Fetch network status
            status_result = await self.api_client.get_network_status()
            if status_result.success:
                self.network_status = status_result.data or {}
                self._update_status_summary()

            # Fetch ethernet interfaces
            eth_result = await self.api_client.get_ethernet_interfaces()
            if eth_result.success:
                self.ethernet_interfaces = eth_result.data.get("interfaces", []) if eth_result.data else []
                self._update_ethernet_list()

            # Fetch WiFi interfaces
            wifi_result = await self.api_client.get_wifi_interfaces()
            if wifi_result.success:
                self.wifi_interfaces = wifi_result.data.get("interfaces", []) if wifi_result.data else []
                self._update_wifi_list()

            # Fetch hostname
            hostname_result = await self.api_client.get_hostname()
            if hostname_result.success:
                hostname = hostname_result.data.get("hostname", "unknown") if hostname_result.data else "unknown"
                self._update_hostname(hostname)

            # Fetch DNS config
            dns_result = await self.api_client.get_dns_config()
            if dns_result.success:
                self._update_dns_config(dns_result.data or {})

        except Exception as e:
            self.app.notify(f"Error loading network data: {str(e)}", severity="error")
        finally:
            loading.hide()

    def _update_status_summary(self) -> None:
        """Update status indicators."""
        try:
            internet_status = self.query_one("#status-internet", StatusIndicator)
            local_status = self.query_one("#status-local", StatusIndicator)
            dns_status = self.query_one("#status-dns", StatusIndicator)

            internet_status.set_status(self.network_status.get("internet_connected", False))
            local_status.set_status(self.network_status.get("local_connected", False))
            dns_status.set_status(self.network_status.get("dns_working", False))
        except Exception:
            pass

    def _update_ethernet_list(self) -> None:
        """Update ethernet interfaces list."""
        try:
            eth_list = self.query_one("#ethernet-list", Vertical)
            eth_list.remove_children()

            if not self.ethernet_interfaces:
                eth_list.mount(Label("[dim]No ethernet interfaces found[/dim]"))
                return

            for iface in self.ethernet_interfaces:
                card = InterfaceCard(iface, interface_type="ethernet")
                eth_list.mount(card)
        except Exception:
            pass

    def _update_wifi_list(self) -> None:
        """Update WiFi interfaces list."""
        try:
            wifi_list = self.query_one("#wifi-list", Vertical)
            wifi_list.remove_children()

            if not self.wifi_interfaces:
                wifi_list.mount(Label("[dim]No WiFi interfaces found[/dim]"))
                return

            for iface in self.wifi_interfaces:
                card = InterfaceCard(iface, interface_type="wifi")
                wifi_list.mount(card)
        except Exception:
            pass

    def _update_hostname(self, hostname: str) -> None:
        """Update hostname display."""
        try:
            hostname_label = self.query_one("#current-hostname", Static)
            hostname_label.update(hostname)
        except Exception:
            pass

    def _update_dns_config(self, dns_config: Dict) -> None:
        """Update DNS configuration inputs."""
        try:
            servers = dns_config.get("servers", [])
            primary_input = self.query_one("#dns-primary", Input)
            secondary_input = self.query_one("#dns-secondary", Input)

            if len(servers) > 0:
                primary_input.value = servers[0]
            if len(servers) > 1:
                secondary_input.value = servers[1]
        except Exception:
            pass

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button presses."""
        button_id = event.button.id or ""

        if button_id == "btn-refresh-network":
            await self.refresh_data()
        elif button_id == "btn-ping":
            await self._ping_host()
        elif button_id == "btn-apply-dns":
            await self._apply_dns()
        elif button_id == "btn-google-dns":
            await self._set_google_dns()
        elif button_id == "btn-cloudflare-dns":
            await self._set_cloudflare_dns()
        elif button_id == "btn-change-hostname":
            await self._change_hostname()
        elif button_id.startswith("scan-"):
            await self._scan_wifi()
        elif button_id.startswith("disconnect-"):
            interface = button_id.replace("disconnect-", "")
            await self._disconnect_wifi(interface)
        elif button_id.startswith("config-ip-"):
            interface = button_id.replace("config-ip-", "")
            await self._configure_ip(interface)

    async def _ping_host(self) -> None:
        """Ping a host and show results."""
        try:
            host_input = self.query_one("#ping-host", Input)
            result_display = self.query_one("#ping-result", Static)

            host = host_input.value.strip()
            if not host:
                self.app.notify("Please enter a host to ping", severity="warning")
                return

            result_display.update(f"Pinging {host}...")

            result = await self.api_client.ping_host(host, count=4)
            if result.success:
                data = result.data or {}
                success_rate = data.get("success_rate", 0)
                avg_time = data.get("avg_time_ms", 0)
                output = data.get("output", "")

                if success_rate > 0:
                    result_display.update(
                        f"[green]✓ {host} reachable[/]\n"
                        f"Success: {success_rate}% | Avg: {avg_time:.1f}ms\n"
                        f"{output}"
                    )
                else:
                    result_display.update(f"[red]✗ {host} unreachable[/]\n{output}")
            else:
                result_display.update(f"[red]Ping failed: {result.error}[/]")
        except Exception as e:
            self.app.notify(f"Ping error: {str(e)}", severity="error")

    async def _scan_wifi(self) -> None:
        """Scan for WiFi networks."""
        self.app.notify("Scanning for WiFi networks...", severity="information", timeout=2)

        result = await self.api_client.scan_wifi_networks()
        if result.success:
            networks = result.data.get("networks", []) if result.data else []
            wifi_list = self.query_one("#wifi-networks", WiFiNetworkList)
            wifi_list.update_networks(networks)
            self.app.notify(f"Found {len(networks)} networks", severity="information", timeout=2)
        else:
            self.app.notify(f"Scan failed: {result.error}", severity="error")

    async def _disconnect_wifi(self, interface: str) -> None:
        """Disconnect from WiFi."""
        result = await self.api_client.disconnect_wifi(interface)
        if result.success:
            self.app.notify("Disconnected from WiFi", severity="information")
            await self.refresh_data()
        else:
            self.app.notify(f"Disconnect failed: {result.error}", severity="error")

    async def _apply_dns(self) -> None:
        """Apply DNS configuration."""
        try:
            primary = self.query_one("#dns-primary", Input).value.strip()
            secondary = self.query_one("#dns-secondary", Input).value.strip()

            servers = [s for s in [primary, secondary] if s]
            if not servers:
                self.app.notify("Please enter at least one DNS server", severity="warning")
                return

            result = await self.api_client.set_dns_servers(servers)
            if result.success:
                self.app.notify("DNS configuration applied", severity="information")
            else:
                self.app.notify(f"Failed to apply DNS: {result.error}", severity="error")
        except Exception as e:
            self.app.notify(f"DNS error: {str(e)}", severity="error")

    async def _set_google_dns(self) -> None:
        """Set Google DNS servers."""
        try:
            self.query_one("#dns-primary", Input).value = "8.8.8.8"
            self.query_one("#dns-secondary", Input).value = "8.8.4.4"
            await self._apply_dns()
        except Exception:
            pass

    async def _set_cloudflare_dns(self) -> None:
        """Set Cloudflare DNS servers."""
        try:
            self.query_one("#dns-primary", Input).value = "1.1.1.1"
            self.query_one("#dns-secondary", Input).value = "1.0.0.1"
            await self._apply_dns()
        except Exception:
            pass

    async def _change_hostname(self) -> None:
        """Change system hostname."""
        try:
            new_hostname = self.query_one("#new-hostname", Input).value.strip()
            if not new_hostname:
                self.app.notify("Please enter a new hostname", severity="warning")
                return

            result = await self.api_client.set_hostname(new_hostname)
            if result.success:
                self.app.notify(f"Hostname changed to {new_hostname}", severity="information")
                self._update_hostname(new_hostname)
            else:
                self.app.notify(f"Failed to change hostname: {result.error}", severity="error")
        except Exception as e:
            self.app.notify(f"Hostname error: {str(e)}", severity="error")

    async def _configure_ip(self, interface: str) -> None:
        """Configure IP for an interface - mirrors web's IP configuration."""
        try:
            # Get current IP config
            result = await self.api_client.get_ip_config(interface)
            if not result.success:
                self.app.notify(f"Failed to get IP config: {result.error}", severity="error")
                return

            current_config = result.data or {}
            current_mode = current_config.get("mode", "dhcp")
            current_ip = current_config.get("ip_address", "")
            current_netmask = current_config.get("netmask", "255.255.255.0")
            current_gateway = current_config.get("gateway", "")

            # Use InputDialog to get configuration
            from modals import InputDialog

            # First ask for mode (DHCP or Static)
            mode_dialog = InputDialog(
                title=f"Configure IP for {interface}",
                message=f"Current mode: {current_mode}\nEnter 'dhcp' for automatic or 'static' for manual:",
                default=current_mode,
                validators=[]
            )
            mode_result = await self.app.push_screen_wait(mode_dialog)

            if not mode_result:
                return

            mode = mode_result.strip().lower()

            if mode == "dhcp":
                # Apply DHCP mode
                apply_result = await self.api_client.set_ip_config(interface, mode="dhcp")
                if apply_result.success:
                    self.app.notify(f"{interface}: Switched to DHCP", severity="information")
                    await self.refresh_data()
                else:
                    self.app.notify(f"Failed to set DHCP: {apply_result.error}", severity="error")
            elif mode == "static":
                # Get static IP configuration
                ip_dialog = InputDialog(
                    title=f"Static IP for {interface}",
                    message="Enter IP address (e.g., 192.168.1.100):",
                    default=current_ip or "192.168.1.100",
                    validators=[]
                )
                ip_address = await self.app.push_screen_wait(ip_dialog)
                if not ip_address:
                    return

                netmask_dialog = InputDialog(
                    title=f"Netmask for {interface}",
                    message="Enter netmask (e.g., 255.255.255.0):",
                    default=current_netmask or "255.255.255.0",
                    validators=[]
                )
                netmask = await self.app.push_screen_wait(netmask_dialog)
                if not netmask:
                    return

                gateway_dialog = InputDialog(
                    title=f"Gateway for {interface}",
                    message="Enter gateway (optional, e.g., 192.168.1.1):",
                    default=current_gateway or "",
                    validators=[]
                )
                gateway = await self.app.push_screen_wait(gateway_dialog)

                # Apply static IP configuration
                apply_result = await self.api_client.set_ip_config(
                    interface,
                    mode="static",
                    ip_address=ip_address.strip(),
                    netmask=netmask.strip(),
                    gateway=gateway.strip() if gateway else None
                )

                if apply_result.success:
                    self.app.notify(f"{interface}: Static IP configured", severity="information")
                    await self.refresh_data()
                else:
                    self.app.notify(f"Failed to set static IP: {apply_result.error}", severity="error")
            else:
                self.app.notify("Invalid mode. Use 'dhcp' or 'static'", severity="warning")

        except Exception as e:
            self.app.notify(f"IP configuration error: {str(e)}", severity="error")

"""
Cluster Mode & Discovery Screen

Provides a unified view of deployment mode, discovery state, peer links,
SSH trust status, and troubleshooting actions.

Features:
- Deployment mode overview and switching
- mDNS peer discovery with latency tracking
- SSH trust management
- One-click remediation actions
- Mode readiness checklist
- Health status monitoring
"""

import asyncio
import logging
import os
from typing import Any, Dict, List, Optional

from textual.app import ComposeResult
from textual.binding import Binding
from textual.containers import Container, Horizontal, Vertical
from textual.widgets import Button, DataTable, Label, Static, TabbedContent, Tabs, TabPane

from ..base_screen import BaseScreen
from ..widgets.ssh_connection_manager import SSHConnectionManager
from ..widgets.ssh_setup_dialog import SSHSetupDialog

logger = logging.getLogger(__name__)


class ClusterModeScreen(BaseScreen):
    """Deployment mode, discovery, and cluster troubleshooting screen."""

    screen_name = "ClusterModeScreen"

    BINDINGS = [
        Binding("r", "refresh", "Refresh", show=True),
        Binding("p", "ping_all", "Ping All", show=True),
    ]

    DEFAULT_CSS = """
    ClusterModeScreen {
        layout: vertical;
        background: $background;
    }

    #title {
        width: 100%;
        height: auto;
        padding: 1 2;
        background: $surface;
        border-bottom: solid $primary;
        text-style: bold;
    }

    .panels {
        height: 1fr;
        width: 100%;
    }

    .left-panel {
        width: 45%;
        height: 100%;
        padding: 1;
    }

    .right-panel {
        width: 55%;
        height: 100%;
        padding: 1;
        border-left: solid $primary;
    }

    .section {
        background: $panel;
        border: solid $primary;
        padding: 1 2;
        margin-bottom: 1;
        height: auto;
    }

    #peers-table {
        height: 14;
        width: 100%;
    }

    #peer-detail {
        height: auto;
        width: 100%;
        margin-top: 1;
        padding: 1 2;
        border: solid $secondary;
        background: $surface;
    }

    .action-row {
        height: auto;
        width: 100%;
        margin-top: 1;
        align: left middle;
    }

    .action-row Button {
        margin-right: 1;
    }
    """

    def __init__(self, api_client: Optional[Any] = None, id: Optional[str] = None, **kwargs):
        super().__init__(api_client=api_client, id=id, **kwargs)
        self._lcd_status: Dict[str, Any] = {}
        self._www_status: Dict[str, Any] = {}
        self._network_status: Dict[str, Any] = {}
        self._peer_status: Dict[str, Any] = {}
        self._deployment_status: Dict[str, Any] = {}
        self._health_status: Dict[str, Any] = {}
        self._health_checks: List[Dict[str, Any]] = []
        self._readiness_checklist: Dict[str, Any] = {}
        self._ping_results: Dict[str, float] = {}
        self._selected_peer: Optional[str] = None
        self._ssh_manager: Optional[SSHConnectionManager] = None

    def compose(self) -> ComposeResult:
        yield Label("🛰️ DEPLOYMENT & CLUSTER CONTROL", id="title")

        with Horizontal(classes="panels"):
            with Vertical(classes="left-panel"):
                yield Static("Loading overview...", id="overview", classes="section")
                yield Static("Loading health...", id="health", classes="section")
                yield Static("Loading troubleshooting...", id="troubleshooting", classes="section")

            with Vertical(classes="right-panel"):
                # Tabbed view for peers, readiness checklist, and remediation
                with TabbedContent():
                    with TabPane("Peers", id="tab-peers"):
                        yield Label("Discovered Peers", classes="section")
                        yield DataTable(id="peers-table")
                        yield Static("Select a peer to view details.", id="peer-detail")

                    with TabPane("Readiness", id="tab-readiness"):
                        yield Static("Loading readiness checklist...", id="readiness-checklist", classes="section")

                    with TabPane("Actions", id="tab-actions"):
                        yield Static("Loading remediation actions...", id="remediation-actions", classes="section")

                with Horizontal(classes="action-row"):
                    yield Button("Refresh", id="btn-refresh", variant="primary")
                    yield Button("Ping All", id="btn-ping", variant="default")
                    yield Button("Link Peer", id="btn-link", variant="success")

                with Horizontal(classes="action-row"):
                    yield Button("All-in-One", id="btn-mode-all", variant="warning")
                    yield Button("Audio Node", id="btn-mode-audio", variant="warning")
                    yield Button("Control Node", id="btn-mode-control", variant="warning")

                with Horizontal(classes="action-row"):
                    yield Button("Run Checks", id="btn-checks", variant="default")
                    yield Button("Restart mDNS", id="btn-restart-mdns", variant="error")
                    yield Button("Restart SSH", id="btn-restart-ssh", variant="error")

    async def on_mount(self) -> None:
        table = self.query_one("#peers-table", DataTable)
        if not table.columns:
            table.add_columns("Node", "Mode", "Host", "API", "WS", "Connected", "Pending", "Ping", "SSH")
        if self._ssh_manager is None:
            self._ssh_manager = SSHConnectionManager()
        from ..polling_config import get_polling_interval
        self.set_interval(get_polling_interval('cluster_status'), self._refresh_data)  # 7s non-disruptive polling
        await self._refresh_data()

    async def action_refresh(self) -> None:
        await self._refresh_data()

    async def action_ping_all(self) -> None:
        await self._ping_all_peers()

    async def _refresh_data(self) -> None:
        if not self.api_client:
            return

        try:
            results = await asyncio.gather(
                self.api_client.get_lcd_status(),
                self.api_client.get_www_status(),
                self.api_client.get_network_status(),
                self.api_client.get_lcd_peers(),
                self.api_client.get_deployment_status() if hasattr(self.api_client, 'get_deployment_status') else None,
                self.api_client.get_health_status() if hasattr(self.api_client, 'get_health_status') else None,
                self.api_client.get_health_checks() if hasattr(self.api_client, 'get_health_checks') else None,
                self.api_client.get_readiness_checklist() if hasattr(self.api_client, 'get_readiness_checklist') else None,
                return_exceptions=True,
            )
            
            lcd_res, www_res, net_res, peers_res, deploy_res, health_res, health_checks_res, readiness_res = results[:8]

            if hasattr(lcd_res, "success") and lcd_res.success:
                self._lcd_status = lcd_res.data or {}
            if hasattr(www_res, "success") and www_res.success:
                self._www_status = www_res.data or {}
            if hasattr(net_res, "success") and net_res.success:
                self._network_status = net_res.data or {}
            if hasattr(peers_res, "success") and peers_res.success:
                self._peer_status = peers_res.data or {}

            # Store new data
            self._deployment_status = deploy_res.data if hasattr(deploy_res, 'success') and deploy_res.success else {}
            self._health_status = health_res.data if hasattr(health_res, 'success') and health_res.success else {}
            self._health_checks = health_checks_res.data if hasattr(health_checks_res, 'success') and health_checks_res.success else []
            self._readiness_checklist = readiness_res.data if hasattr(readiness_res, 'success') and readiness_res.success else {}

            self._update_overview()
            self._update_health()
            self._update_troubleshooting()
            self._update_peer_table()
            self._update_peer_detail()
            self._update_readiness_checklist()
            self._update_remediation_actions()
        except Exception as e:
            logger.debug(f"ClusterModeScreen refresh failed: {e}")

    def _update_overview(self) -> None:
        overview = self.query_one("#overview", Static)
        
        # Get mode from deployment status first, fall back to other sources
        mode = self._deployment_status.get("mode", "UNKNOWN")
        if mode == "UNKNOWN":
            system = self._peer_status.get("system") or self._lcd_status.get("system", {})
            mode = system.get("deployment_mode", "UNKNOWN")
        
        node_id = self._lcd_status.get("system", {}).get("node_id", "—")
        uptime = self._lcd_status.get("uptime", {}).get("human_readable", "—")

        backend_running = self._www_status.get("backend_running", False)
        frontend_running = self._www_status.get("frontend_running", False)
        backend_port = self._www_status.get("backend_port", 8080)
        frontend_port = self._www_status.get("frontend_port", 3000)

        hostname = self._network_status.get("hostname", "localhost")
        api_url = f"http://{hostname}:{backend_port}"
        web_url = f"http://{hostname}:{frontend_port}"

        overview.update(
            "\n".join([
                "[b]📋 Current State[/b]",
                f"Mode: [cyan]{mode}[/cyan]",
                f"Node ID: [yellow]{node_id}[/yellow]",
                f"Uptime: {uptime}",
                f"Backend API: {'[green]ONLINE[/green]' if backend_running else '[red]OFFLINE[/red]'} ({api_url})",
                f"Web UI: {'[green]ONLINE[/green]' if frontend_running else '[red]OFFLINE[/red]'} ({web_url})",
            ])
        )
    
    def _update_health(self) -> None:
        """Update health status from deployment health checks"""
        health = self.query_one("#health", Static)
        health_status = self._health_status.get('overall_status', 'unknown')
        passed = self._health_status.get('checks_passed', 0)
        warned = self._health_status.get('checks_warned', 0)
        failed = self._health_status.get('checks_failed', 0)
        total = self._health_status.get('total_checks', 0)
        last_checked = self._health_status.get('last_checked', 'Never')
        
        status_icon = {
            'healthy': '[green]✓[/green]',
            'degraded': '[yellow]⚠[/yellow]',
            'unhealthy': '[red]✗[/red]',
        }.get(health_status, '?')
        
        health.update(
            "\n".join([
                f"[b]🏥 Health Status[/b]",
                f"Status: {status_icon} {health_status.upper()}",
                f"Checks: {passed} pass, {warned} warn, {failed} fail (total {total})",
                f"Last Checked: [dim]{last_checked}[/dim]",
            ])
        )

    def _update_discovery(self) -> None:
        discovery = self.query_one("#discovery", Static)
        discovery_data = self._peer_status.get("discovery", {})
        connections = self._peer_status.get("connections", {})
        enabled = discovery_data.get("enabled", False)
        discovered = discovery_data.get("discovered_peers", [])
        connected_peers = connections.get("connected_peers", 0)
        total_peers = connections.get("total_peers", 0)

        mdns_running = self._get_service_status("avahi-daemon")
        ssh_running = self._get_service_status("sshd")

        discovery.update(
            "\n".join([
                "[b]Discovery Process[/b]",
                f"mDNS Enabled: {'[green]Yes[/green]' if enabled else '[red]No[/red]'}",
                f"mDNS Service: {'[green]Running[/green]' if mdns_running else '[red]Stopped[/red]'}",
                f"SSH Service: {'[green]Running[/green]' if ssh_running else '[red]Stopped[/red]'}",
                f"Discovered Peers: {len(discovered)}",
                f"Connected Peers: {connected_peers}/{max(total_peers, len(discovered))}",
            ])
        )

    def _update_discovery(self) -> None:
        discovery = self.query_one("#discovery", Static)
        discovery_data = self._peer_status.get("discovery", {})
        connections = self._peer_status.get("connections", {})
        enabled = discovery_data.get("enabled", False)
        discovered = discovery_data.get("discovered_peers", [])
        connected_peers = connections.get("connected_peers", 0)
        total_peers = connections.get("total_peers", 0)

        mdns_running = self._get_service_status("avahi-daemon")
        ssh_running = self._get_service_status("sshd")

        discovery.update(
            "\n".join([
                "[b]Discovery Process[/b]",
                f"mDNS Enabled: {'[green]Yes[/green]' if enabled else '[red]No[/red]'}",
                f"mDNS Service: {'[green]Running[/green]' if mdns_running else '[red]Stopped[/red]'}",
                f"SSH Service: {'[green]Running[/green]' if ssh_running else '[red]Stopped[/red]'}",
                f"Discovered Peers: {len(discovered)}",
                f"Connected Peers: {connected_peers}/{max(total_peers, len(discovered))}",
            ])
        )

    def _update_troubleshooting(self) -> None:
        troubleshooting = self.query_one("#troubleshooting", Static)
        hints: List[str] = ["[b]🔧 Troubleshooting[/b]"]

        # Use health check failures as hints
        if self._health_status:
            overall = self._health_status.get("overall_status", "unknown")
            failed = self._health_status.get("checks_failed", 0)
            warned = self._health_status.get("checks_warned", 0)
            if overall == "unhealthy":
                hints.append(f"• [red]{failed} health checks failed[/red]")
            elif overall == "degraded":
                hints.append(f"• [yellow]{warned} warnings detected[/yellow]")

        if not self._www_status.get("backend_running", False):
            hints.append("• Backend offline → run ./map2.sh start or systemctl restart map2-backend")
        if not self._www_status.get("frontend_running", False):
            hints.append("• Frontend offline → run npm dev or systemctl restart map2-frontend")
        if not self._get_service_status("avahi-daemon"):
            hints.append("• mDNS off → start avahi-daemon for discovery")
        if not self._get_service_status("sshd"):
            hints.append("• SSH off → enable sshd to link nodes")

        # Add detailed failed/warned health checks
        failed_checks = [c for c in self._health_checks if c.get("status") == "fail"]
        warned_checks = [c for c in self._health_checks if c.get("status") == "warn"]
        if failed_checks or warned_checks:
            hints.append("[b]Health Check Details:[/b]")
            for check in failed_checks:
                name = check.get("name", "unknown").replace("_", " ").title()
                message = check.get("message", "")
                remediation = check.get("remediation")
                command = check.get("command")
                hints.append(f"• [red]{name}[/red] → {message}")
                if remediation:
                    hints.append(f"  [yellow]Fix:[/yellow] {remediation}")
                if command:
                    hints.append(f"  [dim]Cmd:[/dim] {command}")
            for check in warned_checks:
                name = check.get("name", "unknown").replace("_", " ").title()
                message = check.get("message", "")
                hints.append(f"• [yellow]{name}[/yellow] → {message}")
        if len(hints) == 1:
            hints.append("[green]• All core services look healthy[/green]")

        troubleshooting.update("\n".join(hints))

    def _update_peer_table(self) -> None:
        table = self.query_one("#peers-table", DataTable)
        table.clear()

        discovery_data = self._peer_status.get("discovery", {})
        peers = discovery_data.get("discovered_peers", [])
        connections = self._peer_status.get("connections", {})
        peer_status = connections.get("peer_status", {})

        if not peers:
            table.add_row("—", "—", "—", "—", "—", "—", "—", "—", "—", key="no-peers")
            return

        for peer in peers:
            node_id = peer.get("node_id", "unknown")
            host = peer.get("host", "—")
            port = peer.get("port", 8080)
            mode = peer.get("mode", "?")
            api_url = f"http://{host}:{port}"
            ws_url = peer.get("url", f"ws://{host}:{port}/api/lcd/ws/events")

            status = peer_status.get(node_id, {})
            connected = "✓" if status.get("connected") else "✗"
            pending = str(status.get("pending_events", 0))

            ping_ms = self._ping_results.get(node_id)
            ping_text = f"{ping_ms:.1f}ms" if isinstance(ping_ms, (int, float)) else "—"

            ssh_status = self._get_ssh_status(host)

            table.add_row(
                node_id,
                mode,
                host,
                api_url,
                ws_url,
                connected,
                pending,
                ping_text,
                ssh_status,
                key=node_id,
            )

    def _update_peer_detail(self) -> None:
        detail = self.query_one("#peer-detail", Static)
        discovery_data = self._peer_status.get("discovery", {})
        peers = {peer.get("node_id"): peer for peer in discovery_data.get("discovered_peers", [])}

        if not self._selected_peer or self._selected_peer not in peers:
            detail.update("Select a peer to view details.")
            return

        peer = peers[self._selected_peer]
        host = peer.get("host", "—")
        port = peer.get("port", 8080)
        api_url = f"http://{host}:{port}"
        ws_url = peer.get("url", f"ws://{host}:{port}/api/lcd/ws/events")
        ssh_status = self._get_ssh_status(host)

        detail.update(
            "\n".join([
                f"[b]Peer {self._selected_peer}[/b]",
                f"Host: {host}",
                f"API: {api_url}",
                f"WS: {ws_url}",
                f"SSH: {ssh_status}",
            ])
        )

    async def _ping_all_peers(self) -> None:
        if not self.api_client:
            return

        discovery_data = self._peer_status.get("discovery", {})
        peers = discovery_data.get("discovered_peers", [])
        if not peers:
            self.app.notify("No peers to ping", severity="warning", timeout=3)
            return

        results = {}
        for peer in peers:
            host = peer.get("host")
            node_id = peer.get("node_id")
            if not host or not node_id:
                continue
            response = await self.api_client.ping_host(host, count=2)
            if response.success and response.data:
                results[node_id] = response.data.get("avg_time_ms")
            else:
                results[node_id] = None

        self._ping_results = results
        self._update_peer_table()
        self._update_peer_detail()

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        btn_id = event.button.id
        if btn_id == "btn-refresh":
            self.app.notify("Refreshing cluster status...", severity="information", timeout=2)
            await self._refresh_data()
            self.app.notify("Cluster status refreshed", severity="information", timeout=2)
        elif btn_id == "btn-ping":
            self.app.notify("Pinging all peers...", severity="information", timeout=2)
            await self._ping_all_peers()
        elif btn_id == "btn-link":
            self.app.notify("Linking peer...", severity="information", timeout=2)
            await self._link_selected_peer()
        elif btn_id == "btn-mode-all":
            self.app.notify("Switching to ALL-IN-ONE mode...", severity="warning", timeout=2)
            await self._set_deployment_mode("ALL-IN-ONE")
        elif btn_id == "btn-mode-audio":
            self.app.notify("Switching to AUDIO-NODE mode...", severity="warning", timeout=2)
            await self._set_deployment_mode("AUDIO-NODE")
        elif btn_id == "btn-mode-control":
            self.app.notify("Switching to CONTROL-NODE mode...", severity="warning", timeout=2)
            await self._set_deployment_mode("CONTROL-NODE")
        elif btn_id == "btn-checks":
            self.app.notify("Running health checks...", severity="information", timeout=3)
            await self._run_health_checks()
            self.app.notify("Health checks complete - refreshing...", severity="information", timeout=2)
        elif btn_id == "btn-restart-mdns":
            self.app.notify("Restarting mDNS service...", severity="warning", timeout=2)
            await self._restart_mdns()
        elif btn_id == "btn-restart-ssh":
            self.app.notify("Restarting SSH service...", severity="warning", timeout=2)
            await self._restart_ssh()

    async def _restart_web(self) -> None:
        if not self.api_client:
            return
        result = await self.api_client.restart_web_server()
        if result.success:
            self.app.notify("Web server restart triggered", severity="information", timeout=4)
        else:
            self.app.notify(result.error or "Failed to restart web server", severity="error", timeout=5)

    async def _link_selected_peer(self) -> None:
        if not self._selected_peer:
            self.app.notify("Select a peer first", severity="warning", timeout=3)
            return

        discovery_data = self._peer_status.get("discovery", {})
        peers = {peer.get("node_id"): peer for peer in discovery_data.get("discovered_peers", [])}
        peer = peers.get(self._selected_peer)
        if not peer:
            self.app.notify("Peer not found", severity="warning", timeout=3)
            return

        if self._ssh_manager is None:
            self._ssh_manager = SSHConnectionManager()

        existing = {
            "host": peer.get("host", ""),
            "user": "mm",
            "port": 22,
            "dest_path": "/var/lib/map2",
        }

        result = await self.app.push_screen_wait(
            SSHSetupDialog(ssh_manager=self._ssh_manager, existing_connection=existing)
        )

        if result and result.get("action") == "save":
            try:
                self._ssh_manager.save_connection(
                    self._selected_peer,
                    result["host"],
                    result["user"],
                    result["port"],
                    result["dest_path"],
                )
                if not self._ssh_manager.key_exists():
                    self._ssh_manager.generate_key_pair()
                self.app.notify("SSH link saved", severity="information", timeout=4)
            except Exception as e:
                self.app.notify(f"SSH link failed: {e}", severity="error", timeout=5)

        self._update_peer_table()
        self._update_peer_detail()

    def _set_deployment_mode(self, mode: str) -> None:
        os.environ["MAP2_DEPLOYMENT_MODE"] = mode
        config_path = "/etc/map2/lcd.conf"
        try:
            lines: List[str] = []
            updated = False
            try:
                with open(config_path, "r", encoding="utf-8") as fh:
                    for line in fh:
                        if line.strip().startswith("DEPLOYMENT_MODE="):
                            lines.append(f"DEPLOYMENT_MODE={mode}\n")
                            updated = True
                        else:
                            lines.append(line)
            except FileNotFoundError:
                pass

            if not updated:
                lines.append(f"DEPLOYMENT_MODE={mode}\n")

            os.makedirs(os.path.dirname(config_path), exist_ok=True)
            with open(config_path, "w", encoding="utf-8") as fh:
                fh.writelines(lines)

            self.app.notify(f"Mode set to {mode}. Restart required.", severity="warning", timeout=4)
        except Exception as e:
            fallback_path = os.path.expanduser("~/.config/map2/lcd.conf")
            try:
                os.makedirs(os.path.dirname(fallback_path), exist_ok=True)
                with open(fallback_path, "w", encoding="utf-8") as fh:
                    fh.write(f"DEPLOYMENT_MODE={mode}\n")
                self.app.notify(
                    f"Mode set to {mode}. Restart required. Saved to {fallback_path}",
                    severity="warning",
                    timeout=6,
                )
            except Exception:
                self.app.notify(
                    f"Mode set to {mode} (restart required). Failed to write config: {e}",
                    severity="error",
                    timeout=6,
                )

    def _get_ssh_status(self, host: str) -> str:
        if not self._ssh_manager:
            return "—"
        connections = self._ssh_manager.load_connections()
        for info in connections.values():
            if info.get("host") == host:
                return "Linked"
        return "Unlinked"

    def _get_service_status(self, service_name: str) -> bool:
        services = self._network_status.get("services", [])
        for service in services:
            if service.get("name") == service_name:
                return bool(service.get("running"))
        return False

    def _update_readiness_checklist(self) -> None:
        """Update readiness checklist from API response"""
        try:
            checklist_widget = self.query_one("#readiness-checklist", Static)
        except:
            return
        
        checklist = self._readiness_checklist
        if not checklist:
            checklist_widget.update("[yellow]No readiness data[/yellow]")
            return
        
        mode = checklist.get('mode', 'Unknown')
        ready = checklist.get('ready', False)
        items = checklist.get('items', [])
        
        ready_text = "[green]READY[/green]" if ready else "[yellow]NOT READY[/yellow]"
        lines = [f"[b]📋 Readiness Checklist - {mode}[/b]", f"Status: {ready_text}", ""]
        
        for item in items:
            name = item.get('name', 'Unknown')
            status = item.get('status', 'unknown')
            required = item.get('required', False)
            message = item.get('message', '')
            
            # Format name nicely
            display_name = name.replace('_', ' ').title()
            
            status_icon = {
                'pass': '[green]✓[/green]',
                'warn': '[yellow]⚠[/yellow]',
                'fail': '[red]✗[/red]',
                'unknown': '[dim]?[/dim]',
            }.get(status, '?')
            
            required_mark = "[red]*[/red]" if required else " "
            lines.append(f"{status_icon} {required_mark} {display_name}")
        
        lines.append("")
        lines.append("[dim]* = required for mode[/dim]")
        checklist_widget.update("\n".join(lines))
    
    def _update_remediation_actions(self) -> None:
        """Update available remediation actions"""
        try:
            actions_widget = self.query_one("#remediation-actions", Static)
        except:
            return
        
        lines = [
            "[b]🔧 Remediation Actions[/b]",
            "[dim]Click buttons below to run actions:[/dim]",
            "",
            "• Restart mDNS - Restart peer discovery service",
            "• Restart SSH - Restart SSH server",
            "• Run Checks - Execute all health checks",
            "• Mode buttons - Switch deployment mode",
            "• Link Peer - Establish SSH + mDNS + LCD routing",
            "",
            "[yellow]Pro tip: Use health checks first to identify issues[/yellow]",
        ]
        
        actions_widget.update("\n".join(lines))
    
    async def _set_deployment_mode(self, mode: str) -> None:
        """Switch deployment mode"""
        if not self.api_client:
            self.app.notify("API client not available", severity="error", timeout=3)
            return
        
        try:
            # Call deployment API
            if hasattr(self.api_client, 'set_deployment_mode'):
                result = await self.api_client.set_deployment_mode(mode)
                if result.success:
                    self.app.notify(f"✓ Mode switched to {mode}", severity="information", timeout=4)
                    await self._refresh_data()
                    self.app.notify(f"✓ Configuration applied - system ready", severity="information", timeout=3)
                else:
                    self.app.notify(f"✗ Failed to switch mode: {result.error}", severity="error", timeout=5)
        except Exception as e:
            self.app.notify(f"✗ Mode switch error: {e}", severity="error", timeout=5)
    
    async def _run_health_checks(self) -> None:
        """Run all deployment health checks"""
        if not self.api_client:
            self.app.notify("API client not available", severity="error", timeout=3)
            return
        
        try:
            if hasattr(self.api_client, 'run_health_checks'):
                result = await self.api_client.run_health_checks()
                if result.success:
                    self.app.notify("✓ Health checks completed - refreshing status", severity="information", timeout=3)
                    await self._refresh_data()
                    self.app.notify("✓ Status updated", severity="information", timeout=2)
                else:
                    self.app.notify(f"✗ Health checks failed: {result.error}", severity="error", timeout=5)
        except Exception as e:
            self.app.notify(f"✗ Health check error: {e}", severity="error", timeout=5)
    
    async def _restart_mdns(self) -> None:
        """Restart mDNS service"""
        if not self.api_client:
            self.app.notify("API client not available", severity="error", timeout=3)
            return
        
        try:
            if hasattr(self.api_client, 'run_remediation'):
                result = await self.api_client.run_remediation("restart-mdns")
                if result.success:
                    self.app.notify("✓ mDNS service restart initiated", severity="information", timeout=3)
                    await self._refresh_data()
                    self.app.notify("✓ Peer discovery should resume", severity="information", timeout=2)
                else:
                    self.app.notify(f"✗ mDNS restart failed: {result.error}", severity="error", timeout=5)
            else:
                self.app.notify("✗ Remediation API not available", severity="error", timeout=3)
        except Exception as e:
            self.app.notify(f"✗ Error: {e}", severity="error", timeout=5)
    
    async def _restart_ssh(self) -> None:
        """Restart SSH service"""
        if not self.api_client:
            self.app.notify("API client not available", severity="error", timeout=3)
            return
        
        try:
            if hasattr(self.api_client, 'run_remediation'):
                result = await self.api_client.run_remediation("restart-ssh")
                if result.success:
                    self.app.notify("✓ SSH service restart initiated", severity="information", timeout=3)
                    await self._refresh_data()
                    self.app.notify("✓ SSH should be available for peer linking", severity="information", timeout=2)
                else:
                    self.app.notify(f"✗ SSH restart failed: {result.error}", severity="error", timeout=5)
            else:
                self.app.notify("✗ Remediation API not available", severity="error", timeout=3)
        except Exception as e:
            self.app.notify(f"✗ Error: {e}", severity="error", timeout=5)

    async def on_data_table_row_selected(self, event: DataTable.RowSelected) -> None:
        if event.data_table.id != "peers-table":
            return
        key = event.row_key
        if key and key != "no-peers":
            self._selected_peer = str(key)
            self._update_peer_detail()

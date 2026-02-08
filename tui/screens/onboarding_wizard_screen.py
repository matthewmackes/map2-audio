"""
Cluster Onboarding Wizard (TUI)

Comprehensive step-by-step wizard for initial cluster setup:
- Deployment mode selection
- Node discovery and registration
- Network configuration
- Certificate setup
- Initial manifest capture
- Health validation

Features:
- Multi-step wizard with clear progress indicators
- Validation at each step
- Ability to go back and revise
- Summary before final commit
- Detailed help text per step
- Error recovery with clear guidance
"""

from textual.app import ComposeResult
from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
from textual.widgets import (
    Static,
    Button,
    Input,
    Select,
    Label,
    RadioSet,
    RadioButton,
    Checkbox,
    ProgressBar,
    Log,
)
from textual.reactive import reactive
from textual.screen import Screen
from textual import work
from typing import Dict, List, Optional
import httpx


class WizardStep(Container):
    """Base class for wizard steps with validation."""

    step_number: reactive[int] = reactive(0)
    step_title: reactive[str] = reactive("")
    is_valid: reactive[bool] = reactive(False)

    def __init__(self, step_number: int, title: str, **kwargs):
        super().__init__(**kwargs)
        self.step_number = step_number
        self.step_title = title

    def validate(self) -> tuple[bool, str]:
        """Validate step data. Returns (is_valid, error_message)."""
        return True, ""

    def get_data(self) -> Dict:
        """Get step data for final submission."""
        return {}


class DeploymentModeStep(WizardStep):
    """Step 1: Select deployment mode."""

    CSS = """
    DeploymentModeStep {
        height: auto;
        padding: 1;
    }

    .mode-option {
        height: auto;
        border: solid $primary;
        padding: 1;
        margin: 1 0;
    }

    .mode-option:focus {
        border: solid $accent;
    }
    """

    def compose(self) -> ComposeResult:
        yield Static("## Step 1: Choose Deployment Mode\n", classes="step-header")
        yield Static(
            "Select how you want to deploy your MAP2 Audio cluster:\n",
            classes="step-help",
        )

        with RadioSet(id="deployment-mode"):
            yield RadioButton(
                "🖥️  ALL-IN-ONE: Single node with all services (Development/Testing)",
                value="all-in-one",
            )
            yield RadioButton(
                "🌐 DISTRIBUTED: Multiple nodes, distributed services (Production)",
                value="distributed",
            )
            yield RadioButton(
                "☁️  CLOUD: Cloud-native with auto-scaling (Enterprise)",
                value="cloud",
            )

        yield Static("\n📖 Mode Details:", classes="help-section")
        yield Static(
            "• ALL-IN-ONE: Fastest setup, no network required, limited scalability\n"
            "• DISTRIBUTED: High availability, load balancing, requires 2+ nodes\n"
            "• CLOUD: Auto-scaling, multi-region, requires cloud provider",
            classes="help-text",
        )

    def validate(self) -> tuple[bool, str]:
        try:
            radio = self.query_one("#deployment-mode", RadioSet)
            if radio.pressed_button is None:
                return False, "Please select a deployment mode"
            return True, ""
        except Exception as e:
            return False, str(e)

    def get_data(self) -> Dict:
        radio = self.query_one("#deployment-mode", RadioSet)
        return {"deployment_mode": str(radio.pressed_button.value) if radio.pressed_button else "all-in-one"}


class NodeDiscoveryStep(WizardStep):
    """Step 2: Discover and register nodes."""

    CSS = """
    NodeDiscoveryStep {
        height: auto;
        padding: 1;
    }

    #discovery-status {
        height: 3;
        border: solid $primary;
        padding: 1;
        margin: 1 0;
    }

    #node-list {
        height: 15;
        border: solid $accent;
        margin: 1 0;
    }
    """

    discovered_nodes: reactive[List[Dict]] = reactive([])

    def compose(self) -> ComposeResult:
        yield Static("## Step 2: Node Discovery\n", classes="step-header")
        yield Static(
            "Discover nodes on your network or manually add them:\n",
            classes="step-help",
        )

        with Horizontal():
            yield Button("🔍 Auto-Discover", id="auto-discover", variant="primary")
            yield Button("➕ Add Manually", id="manual-add")
            yield Button("🔄 Refresh", id="refresh-nodes")

        yield Static("Discovering nodes...", id="discovery-status")
        yield Log(id="node-list")

        yield Static("\n📖 Discovery Methods:", classes="help-section")
        yield Static(
            "• Auto-Discovery: mDNS/DNS-SD scan for MAP2 nodes on local network\n"
            "• Manual Add: Specify IP address and credentials for remote nodes\n"
            "• Refresh: Re-scan network for new nodes",
            classes="help-text",
        )

    def on_mount(self) -> None:
        self._log("Ready to discover nodes. Click 'Auto-Discover' or 'Add Manually'.")

    def _log(self, message: str) -> None:
        log = self.query_one("#node-list", Log)
        log.write(message)

    def _update_status(self, message: str) -> None:
        status = self.query_one("#discovery-status", Static)
        status.update(message)

    @work
    async def _auto_discover(self) -> None:
        self._update_status("⏳ Scanning network for nodes...")
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post("http://localhost:8080/api/cluster/discovery/scan")
                resp.raise_for_status()
                result = resp.json()

            nodes = result.get("nodes", [])
            self.discovered_nodes = nodes
            self._log(f"\n✅ Found {len(nodes)} node(s):")
            for node in nodes:
                self._log(f"  • {node.get('hostname')} - {node.get('ip_address')} [{node.get('role')}]")
            self._update_status(f"✅ Discovered {len(nodes)} nodes")
        except Exception as e:
            self._log(f"\n❌ Discovery failed: {e}")
            self._update_status("❌ Discovery failed")

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "auto-discover":
            await self._auto_discover()
        elif event.button.id == "manual-add":
            self._log("\n📝 Manual add: Enter node IP in the format: <ip>:<port>")
            self._update_status("ℹ️  Manual entry mode - use manual-add endpoint")
        elif event.button.id == "refresh-nodes":
            await self._auto_discover()

    def validate(self) -> tuple[bool, str]:
        if not self.discovered_nodes:
            return False, "No nodes discovered. Please run discovery or add nodes manually."
        return True, ""

    def get_data(self) -> Dict:
        return {"discovered_nodes": self.discovered_nodes}


class NetworkConfigStep(WizardStep):
    """Step 3: Configure network settings."""

    CSS = """
    NetworkConfigStep {
        height: auto;
        padding: 1;
    }

    .config-field {
        height: auto;
        margin: 1 0;
    }
    """

    def compose(self) -> ComposeResult:
        yield Static("## Step 3: Network Configuration\n", classes="step-header")
        yield Static(
            "Configure cluster networking and communication:\n",
            classes="step-help",
        )

        with Vertical(classes="config-field"):
            yield Label("Cluster Name:")
            yield Input(placeholder="my-audio-cluster", id="cluster-name")

        with Vertical(classes="config-field"):
            yield Label("Management Node IP:")
            yield Input(placeholder="192.168.1.100", id="management-ip")

        with Vertical(classes="config-field"):
            yield Label("Network Interface:")
            yield Select(
                [("eth0", "eth0"), ("wlan0", "wlan0"), ("enp0s3", "enp0s3")],
                prompt="Select interface",
                id="network-interface",
            )

        with Vertical(classes="config-field"):
            yield Label("API Port:")
            yield Input(placeholder="8080", id="api-port", value="8080")

        with Vertical(classes="config-field"):
            yield Checkbox("Enable mDNS discovery", id="enable-mdns", value=True)
            yield Checkbox("Enable TLS/SSL", id="enable-tls", value=False)

        yield Static("\n📖 Configuration Tips:", classes="help-section")
        yield Static(
            "• Cluster Name: Unique identifier for your cluster\n"
            "• Management IP: IP of the primary management/control node\n"
            "• mDNS: Automatic discovery (requires multicast support)\n"
            "• TLS: Encrypted communication (requires certificates)",
            classes="help-text",
        )

    def validate(self) -> tuple[bool, str]:
        cluster_name = self.query_one("#cluster-name", Input).value.strip()
        if not cluster_name:
            return False, "Cluster name is required"

        mgmt_ip = self.query_one("#management-ip", Input).value.strip()
        if not mgmt_ip:
            return False, "Management node IP is required"

        return True, ""

    def get_data(self) -> Dict:
        return {
            "cluster_name": self.query_one("#cluster-name", Input).value.strip(),
            "management_ip": self.query_one("#management-ip", Input).value.strip(),
            "network_interface": str(self.query_one("#network-interface", Select).value),
            "api_port": int(self.query_one("#api-port", Input).value or 8080),
            "enable_mdns": self.query_one("#enable-mdns", Checkbox).value,
            "enable_tls": self.query_one("#enable-tls", Checkbox).value,
        }


class CertificateSetupStep(WizardStep):
    """Step 4: SSL/TLS certificate setup."""

    CSS = """
    CertificateSetupStep {
        height: auto;
        padding: 1;
    }
    """

    def compose(self) -> ComposeResult:
        yield Static("## Step 4: Certificate Setup\n", classes="step-header")
        yield Static(
            "Configure SSL/TLS certificates for secure communication:\n",
            classes="step-help",
        )

        with RadioSet(id="cert-mode"):
            yield RadioButton("🔧 Auto-generate self-signed certificates", value="self-signed")
            yield RadioButton("📜 Use existing certificate authority", value="existing-ca")
            yield RadioButton("⏭️  Skip (insecure - not recommended)", value="skip")

        yield Static("\n📖 Certificate Options:", classes="help-section")
        yield Static(
            "• Self-signed: Quick setup, browser warnings, good for testing\n"
            "• Existing CA: Production-ready, requires CA cert/key files\n"
            "• Skip: No encryption, only for isolated test environments",
            classes="help-text",
        )

    def validate(self) -> tuple[bool, str]:
        radio = self.query_one("#cert-mode", RadioSet)
        if radio.pressed_button is None:
            return False, "Please select a certificate option"
        return True, ""

    def get_data(self) -> Dict:
        radio = self.query_one("#cert-mode", RadioSet)
        return {"cert_mode": str(radio.pressed_button.value) if radio.pressed_button else "skip"}


class SummaryStep(WizardStep):
    """Step 5: Review and confirm settings."""

    CSS = """
    SummaryStep {
        height: auto;
        padding: 1;
    }

    #summary-box {
        height: auto;
        border: solid $accent;
        padding: 1;
        margin: 1 0;
    }
    """

    summary_data: reactive[Dict] = reactive({})

    def compose(self) -> ComposeResult:
        yield Static("## Step 5: Review Configuration\n", classes="step-header")
        yield Static(
            "Review your cluster configuration before applying:\n",
            classes="step-help",
        )

        yield ScrollableContainer(Static("Loading summary...", id="summary-content"), id="summary-box")

        yield Static("\n⚠️  Important:", classes="help-section")
        yield Static(
            "• Review all settings carefully before proceeding\n"
            "• Changes will be applied to all discovered nodes\n"
            "• You can go back to modify any step",
            classes="help-text",
        )

    def set_summary_data(self, data: Dict) -> None:
        self.summary_data = data
        self._render_summary()

    def _render_summary(self) -> None:
        content = self.query_one("#summary-content", Static)
        lines = ["📋 Configuration Summary:\n"]
        
        lines.append(f"\n🌐 Deployment Mode: {self.summary_data.get('deployment_mode', 'N/A')}")
        lines.append(f"\n🖥️  Cluster Name: {self.summary_data.get('cluster_name', 'N/A')}")
        lines.append(f"📍 Management IP: {self.summary_data.get('management_ip', 'N/A')}")
        lines.append(f"🔌 Network Interface: {self.summary_data.get('network_interface', 'N/A')}")
        lines.append(f"🔢 API Port: {self.summary_data.get('api_port', 'N/A')}")
        lines.append(f"🔍 mDNS Enabled: {self.summary_data.get('enable_mdns', False)}")
        lines.append(f"🔒 TLS Enabled: {self.summary_data.get('enable_tls', False)}")
        lines.append(f"📜 Certificate Mode: {self.summary_data.get('cert_mode', 'N/A')}")
        
        nodes = self.summary_data.get('discovered_nodes', [])
        lines.append(f"\n\n🖥️  Discovered Nodes ({len(nodes)}):")
        for i, node in enumerate(nodes, 1):
            lines.append(f"  {i}. {node.get('hostname', 'Unknown')} - {node.get('ip_address', 'N/A')}")

        content.update("\n".join(lines))

    def validate(self) -> tuple[bool, str]:
        return True, ""

    def get_data(self) -> Dict:
        return self.summary_data


class OnboardingWizardScreen(Screen):
    """
    Comprehensive cluster onboarding wizard.
    
    Features:
    - 5-step guided setup process
    - Visual progress indicator
    - Validation at each step
    - Back/Next navigation
    - Summary before commit
    - Detailed help text
    - Error handling with recovery
    
    Steps:
    1. Deployment Mode Selection
    2. Node Discovery
    3. Network Configuration
    4. Certificate Setup
    5. Summary & Confirmation
    """

    BINDINGS = [
        ("escape", "cancel", "Cancel"),
        ("ctrl+n", "next", "Next"),
        ("ctrl+b", "back", "Back"),
    ]

    CSS = """
    OnboardingWizardScreen {
        background: $surface;
    }

    #wizard-header {
        height: 5;
        border: solid $primary;
        padding: 1;
        content-align: center middle;
    }

    #progress-section {
        height: 5;
        border: solid $panel;
        padding: 1;
    }

    #step-container {
        height: 1fr;
        padding: 1;
        overflow-y: auto;
    }

    #button-bar {
        height: 5;
        border-top: solid $accent;
        padding: 1;
    }

    .step-header {
        text-style: bold;
        color: $accent;
    }

    .step-help {
        color: $text-muted;
        margin: 1 0;
    }

    .help-section {
        color: $primary;
        text-style: bold;
        margin: 2 0 1 0;
    }

    .help-text {
        color: $text-muted;
    }
    """

    current_step: reactive[int] = reactive(0)
    total_steps: reactive[int] = reactive(5)
    wizard_data: reactive[Dict] = reactive({})

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.steps: List[WizardStep] = []

    def compose(self) -> ComposeResult:
        yield Static("🧙 Cluster Onboarding Wizard", id="wizard-header")

        with Vertical(id="progress-section"):
            yield Static("Step 1 of 5: Deployment Mode", id="progress-label")
            yield ProgressBar(total=5, show_eta=False, id="progress-bar")

        yield Container(id="step-container")

        with Horizontal(id="button-bar"):
            yield Button("⬅️  Back", id="back-btn", variant="default", disabled=True)
            yield Button("➡️  Next", id="next-btn", variant="primary")
            yield Button("✅ Finish", id="finish-btn", variant="success", disabled=True)
            yield Button("❌ Cancel", id="cancel-btn", variant="error")

    def on_mount(self) -> None:
        # Initialize steps
        self.steps = [
            DeploymentModeStep(1, "Deployment Mode"),
            NodeDiscoveryStep(2, "Node Discovery"),
            NetworkConfigStep(3, "Network Configuration"),
            CertificateSetupStep(4, "Certificate Setup"),
            SummaryStep(5, "Summary"),
        ]
        self._show_step(0)

    async def _show_step(self, step_index: int) -> None:
        """Display the specified step."""
        self.current_step = step_index

        # Update progress
        progress_bar = self.query_one("#progress-bar", ProgressBar)
        progress_bar.update(progress=step_index + 1)

        step_label = self.query_one("#progress-label", Static)
        step_label.update(f"Step {step_index + 1} of {self.total_steps}: {self.steps[step_index].step_title}")

        # Clear and show step content
        container = self.query_one("#step-container", Container)
        await container.remove_children()
        await container.mount(self.steps[step_index])

        # Update button states
        back_btn = self.query_one("#back-btn", Button)
        next_btn = self.query_one("#next-btn", Button)
        finish_btn = self.query_one("#finish-btn", Button)

        back_btn.disabled = step_index == 0
        next_btn.disabled = step_index == self.total_steps - 1
        finish_btn.disabled = step_index != self.total_steps - 1

        # If showing summary, populate it
        if isinstance(self.steps[step_index], SummaryStep):
            self.steps[step_index].set_summary_data(self.wizard_data)

    async def _validate_current_step(self) -> bool:
        """Validate current step data."""
        current = self.steps[self.current_step]
        is_valid, error_msg = current.validate()
        
        if not is_valid:
            self.notify(f"❌ Validation Error: {error_msg}", severity="error", timeout=5)
            return False

        # Save step data
        step_data = current.get_data()
        self.wizard_data.update(step_data)
        return True

    async def on_button_pressed(self, event: Button.Pressed) -> None:
        if event.button.id == "next-btn":
            if await self._validate_current_step():
                await self._show_step(self.current_step + 1)

        elif event.button.id == "back-btn":
            await self._show_step(self.current_step - 1)

        elif event.button.id == "finish-btn":
            await self._finish_wizard()

        elif event.button.id == "cancel-btn":
            self.app.pop_screen()

    @work
    async def _finish_wizard(self) -> None:
        """Apply configuration and complete wizard."""
        self.notify("⏳ Applying configuration...", severity="information", timeout=3)
        
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    "http://localhost:8080/api/cluster/setup",
                    json=self.wizard_data,
                )
                resp.raise_for_status()
                result = resp.json()

            self.notify("✅ Cluster setup complete!", severity="information", timeout=5)
            await self.app.pop_screen()

        except Exception as e:
            self.notify(f"❌ Setup failed: {e}", severity="error", timeout=10)

    async def action_cancel(self) -> None:
        """Cancel wizard."""
        self.app.pop_screen()

    async def action_next(self) -> None:
        """Go to next step."""
        if not self.query_one("#next-btn", Button).disabled:
            if await self._validate_current_step():
                await self._show_step(self.current_step + 1)

    async def action_back(self) -> None:
        """Go to previous step."""
        if not self.query_one("#back-btn", Button).disabled:
            await self._show_step(self.current_step - 1)

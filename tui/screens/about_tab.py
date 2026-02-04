"""
About Tab - Information and Credits
Shows version info, system details, and credits to audio projects
"""

import platform
from pathlib import Path
from typing import Optional

from textual.app import ComposeResult
from textual.widgets import Static, Label
from textual.containers import Container, Vertical, ScrollableContainer

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from ..api_client import MAP2APIClient


class AboutTab(ScrollableContainer):
    """About and Credits tab."""

    CSS = """
    AboutTab {
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

    .section-header {
        width: 100%;
        height: 1;
        text-style: bold;
        color: $accent;
        background: $panel;
        padding: 0 1;
        margin-top: 1;
        margin-bottom: 0;
    }

    .info-panel {
        width: 100%;
        height: auto;
        border: solid $primary;
        background: $panel;
        padding: 1 2;
        margin-bottom: 1;
    }

    .info-line {
        width: 100%;
        height: auto;
        color: $text;
        margin: 0;
    }

    .credits-panel {
        width: 100%;
        height: auto;
        border: solid $success;
        background: $panel;
        padding: 1 2;
        margin-bottom: 1;
    }

    .credit-item {
        width: 100%;
        height: auto;
        margin: 0;
    }

    .credit-name {
        color: $accent;
        text-style: bold;
    }

    .credit-desc {
        color: $text-muted;
    }

    .logo {
        width: 100%;
        height: auto;
        content-align: center middle;
        color: $success;
        text-style: bold;
        margin-bottom: 1;
    }
    """

    def __init__(self, api_client: MAP2APIClient, id: Optional[str] = None):
        super().__init__(id=id)
        self.api_client = api_client
        self.version = "2.0.0-FEB2025"
        self.backend_version = "Unknown"

    def compose(self) -> ComposeResult:
        """Build About UI."""

        # ASCII Art Logo
        yield Static("""
  __  __            _               _             _ _
 |  \\/  | __ _  ___| | _____  ___  / \\  _   _  __| (_) ___
 | |\\/| |/ _` |/ __| |/ / _ \\/ __| / _ \\| | | |/ _` | |/ _ \\
 | |  | | (_| | (__|   <  __/\\__ \\/ ___ \\ |_| | (_| | | (_) |
 |_|  |_|\\__,_|\\___|_|\\_\\___||___/_/   \\_\\__,_|\\__,_|_|\\___/

       Platform 2 FEB2025 - Professional Audio Processing
""", classes="logo")

        # Main Header
        yield Label("ℹ️ MACKES AUDIO PLATFORM 2 FEB2025", classes="main-header")

        # System Information
        yield Label("📊 SYSTEM INFORMATION", classes="section-header")
        with Container(classes="info-panel"):
            yield Static(f"[cyan]Mackes Audio Platform 2[/] v{self.version}", classes="info-line", id="version-info")
            yield Static(f"[cyan]Backend Version:[/] ...", classes="info-line", id="backend-version")
            yield Static(f"[cyan]Platform:[/] {platform.system()} {platform.release()}", classes="info-line")
            yield Static(f"[cyan]Architecture:[/] {platform.machine()}", classes="info-line")
            yield Static(f"[cyan]Python:[/] {platform.python_version()}", classes="info-line")
            yield Static(f"[cyan]Node:[/] {platform.node()}", classes="info-line")

        # Asset Counts with Network Share Status
        yield Label("📦 AVAILABLE ASSETS", classes="section-header")
        with Container(classes="info-panel"):
            yield Static("[cyan]Network Shares:[/] Checking...", classes="info-line", id="network-status")
            yield Static("[cyan]LV2 Plugins:[/] ...", classes="info-line", id="lv2-count")
            yield Static("[cyan]Cabinet IRs:[/] ...", classes="info-line", id="cabinet-ir-count")
            yield Static("[cyan]Reverb IRs:[/] ...", classes="info-line", id="reverb-ir-count")
            yield Static("[cyan]NAM Models:[/] ...", classes="info-line", id="nam-count")
            yield Static("", classes="info-line", id="share-urls")

        # Project Description
        yield Label("📖 PROJECT DESCRIPTION", classes="section-header")
        with Container(classes="info-panel"):
            yield Static(
                "MAP2 Audio Platform is a professional real-time audio processing system designed for "
                "guitarists, musicians, and audio engineers. It provides a comprehensive suite of tools "
                "for signal chain management, plugin hosting, MIDI control, and neural amp modeling.",
                classes="info-line"
            )

        # Core Technologies
        yield Label("⚙️ CORE TECHNOLOGIES", classes="section-header")
        with Container(classes="credits-panel"):
            yield Static("[green]PiPedal[/] - LV2 Plugin Host & Audio Engine", classes="credit-item")
            yield Static("  Real-time audio processing engine with low-latency performance", classes="credit-desc")
            yield Static("", classes="credit-item")

            yield Static("[green]LV2[/] - Audio Plugin Standard", classes="credit-item")
            yield Static("  Open-source plugin architecture for professional audio", classes="credit-desc")
            yield Static("", classes="credit-item")

            yield Static("[green]JACK Audio[/] - Professional Audio Server", classes="credit-item")
            yield Static("  Low-latency audio connection system for Linux", classes="credit-desc")
            yield Static("", classes="credit-item")

            yield Static("[green]ALSA[/] - Advanced Linux Sound Architecture", classes="credit-item")
            yield Static("  Linux kernel audio framework", classes="credit-desc")

        # Plugin Collections
        yield Label("🎛️ PLUGIN COLLECTIONS", classes="section-header")
        with Container(classes="credits-panel"):
            yield Static("[yellow]GxPlugins[/] - Guitarix LV2 Plugins", classes="credit-item")
            yield Static("  High-quality guitar amp simulations and effects", classes="credit-desc")
            yield Static("", classes="credit-item")

            yield Static("[yellow]Calf Studio Gear[/] - Professional Audio Plugins", classes="credit-item")
            yield Static("  Comprehensive collection of studio effects and instruments", classes="credit-desc")
            yield Static("", classes="credit-item")

            yield Static("[yellow]LSP (Linux Studio Plugins)[/] - Audio Processing Suite", classes="credit-item")
            yield Static("  High-quality EQ, dynamics, and analysis tools", classes="credit-desc")
            yield Static("", classes="credit-item")

            yield Static("[yellow]ToobAmp[/] - Tube Amplifier Simulation", classes="credit-item")
            yield Static("  Authentic tube amp modeling plugins", classes="credit-desc")

        # Neural Amp Modeling
        yield Label("🎸 NEURAL AMP MODELING", classes="section-header")
        with Container(classes="credits-panel"):
            yield Static("[magenta]NAM (Neural Amp Modeler)[/] - AI-Powered Amp Modeling", classes="credit-item")
            yield Static("  Machine learning-based amplifier and pedal modeling", classes="credit-desc")
            yield Static("", classes="credit-item")

            yield Static("[magenta]RTNeural[/] - Real-Time Neural Network Inference", classes="credit-item")
            yield Static("  Fast neural network processing for audio applications", classes="credit-desc")

        # Model & IR File Paths
        yield Label("📁 MODEL & IR FILE PATHS", classes="section-header")
        with Container(classes="info-panel"):
            yield Static("[cyan]NAM Models:[/]     ~/.local/share/map2/nam", classes="info-line")
            yield Static("[cyan]Cabinet IRs:[/]    ~/.local/share/map2/ir/cabinets", classes="info-line")
            yield Static("[cyan]Reverb IRs:[/]     ~/.local/share/map2/ir/reverbs", classes="info-line")
            yield Static("", classes="info-line")
            yield Static("[dim]Place your NAM models (.nam) and IR files (.wav) in these directories.[/]", classes="info-line")
            yield Static("[dim]They will be automatically discovered and available for loading.[/]", classes="info-line")

        # Impulse Response Collections
        yield Label("🔊 IMPULSE RESPONSE LIBRARIES", classes="section-header")
        with Container(classes="credits-panel"):
            yield Static("[blue]Conner's IR Collection[/] - Cabinet Impulse Responses", classes="credit-item")
            yield Static("  Professional guitar cabinet simulations", classes="credit-desc")
            yield Static("", classes="credit-item")

            yield Static("[blue]OpenAir[/] - Acoustic Space Impulse Responses", classes="credit-item")
            yield Static("  Reverb and room simulation library", classes="credit-desc")

        # Development Frameworks
        yield Label("🛠️ DEVELOPMENT FRAMEWORKS", classes="section-header")
        with Container(classes="credits-panel"):
            yield Static("[cyan]FastAPI[/] - Modern Python Web Framework", classes="credit-item")
            yield Static("  High-performance API backend with async support", classes="credit-desc")
            yield Static("", classes="credit-item")

            yield Static("[cyan]Textual[/] - Modern TUI Framework", classes="credit-item")
            yield Static("  Beautiful terminal user interface built with Python", classes="credit-desc")
            yield Static("", classes="credit-item")

            yield Static("[cyan]SQLAlchemy[/] - Database ORM", classes="credit-item")
            yield Static("  Powerful data persistence and management", classes="credit-desc")

        # Special Thanks
        yield Label("🙏 SPECIAL THANKS", classes="section-header")
        with Container(classes="info-panel"):
            yield Static(
                "Special thanks to the open-source audio community, including the developers and "
                "maintainers of PiPedal, LV2, JACK, all plugin developers, and the countless "
                "contributors who make professional audio on Linux possible.",
                classes="info-line"
            )
            yield Static("", classes="info-line")
            yield Static(
                "This project stands on the shoulders of giants - the dedication and expertise "
                "of the open-source audio community makes tools like MAP2 Audio Platform possible.",
                classes="info-line"
            )

        # License & Contact
        yield Label("📜 LICENSE & CONTACT", classes="section-header")
        with Container(classes="info-panel"):
            yield Static("[cyan]License:[/] MIT License", classes="info-line")
            yield Static("[cyan]Project:[/] MAP2 Audio Platform", classes="info-line")
            yield Static("[cyan]Repository:[/] github.com/yourusername/map2-audio", classes="info-line")
            yield Static("[cyan]Documentation:[/] docs.map2audio.dev", classes="info-line")

    async def on_mount(self) -> None:
        """Fetch version information when tab is mounted."""
        try:
            # Get backend version
            result = await self.api_client.get_pipedal_version()
            if result.success and result.data:
                version = result.data.get("version", "Unknown")
                self.backend_version = version
                self.query_one("#backend-version", Static).update(
                    f"[cyan]Backend Version:[/] {version}"
                )
        except Exception as e:
            self.log.error(f"Error fetching backend version: {e}")

        # Fetch asset counts
        try:
            counts = await self.api_client.get("/folders/counts")
            if counts.success and counts.data:
                data = counts.data
                lv2_total = data.get("lv2", {}).get("total", 0)
                ir_cabinets = data.get("irs", {}).get("cabinets", 0)
                ir_reverbs = data.get("irs", {}).get("reverbs", 0)
                nams = data.get("nams", 0)

                self.query_one("#lv2-count", Static).update(
                    f"[cyan]LV2 Plugins:[/] {lv2_total} installed"
                )
                self.query_one("#cabinet-ir-count", Static).update(
                    f"[cyan]Cabinet IRs:[/] {ir_cabinets} available"
                )
                self.query_one("#reverb-ir-count", Static).update(
                    f"[cyan]Reverb IRs:[/] {ir_reverbs} available"
                )
                self.query_one("#nam-count", Static).update(
                    f"[cyan]NAM Models:[/] {nams} available"
                )
        except Exception as e:
            self.log.error(f"Error fetching asset counts: {e}")

        # Fetch network share status
        try:
            network = await self.api_client.get("/folders/network-shares")
            if network.success and network.data:
                data = network.data
                smb_enabled = data.get("smb_enabled", False)
                local_ip = data.get("local_ip", "unknown")
                shares = data.get("shares", [])

                if smb_enabled:
                    self.query_one("#network-status", Static).update(
                        f"[cyan]Network Shares:[/] [green]● Active[/] (SMB on {local_ip})"
                    )
                    # Build share URLs
                    share_info = []
                    for share in shares:
                        status = "[green]✓[/]" if share.get("accessible") else "[red]✗[/]"
                        share_info.append(f"  {status} {share['name']}: \\\\\\\\{local_ip}\\\\{share['name']}")
                    if share_info:
                        self.query_one("#share-urls", Static).update(
                            "[cyan]Share Paths:[/]\n" + "\n".join(share_info)
                        )
                else:
                    self.query_one("#network-status", Static).update(
                        "[cyan]Network Shares:[/] [red]● Offline[/] (SMB not running)"
                    )
        except Exception as e:
            self.query_one("#network-status", Static).update(
                "[cyan]Network Shares:[/] [yellow]● Unknown[/]"
            )
            self.log.error(f"Error fetching network status: {e}")

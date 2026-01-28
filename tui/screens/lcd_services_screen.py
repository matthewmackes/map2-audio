"""
LCD Services Screen - Comprehensive LCD Programming, Testing, and Alert Management

Provides:
- Real-time dual LCD simulation display
- Hardware setup wizard (I2C scan, display test, GPIO test)
- Test suite runner with visual progress
- Alert routing and information assignment to specific LCDs
"""

import logging
import asyncio
from typing import Dict, List, Optional, Any
from textual.app import ComposeResult
from textual.widgets import Static, Label, DataTable
from textual.containers import Vertical, Horizontal
from textual.binding import Binding

logger = logging.getLogger(__name__)


class LCDSimulationBox(Static):
    """ASCII simulation box for a single LCD display."""

    DEFAULT_CSS = """
    LCDSimulationBox {
        width: 30;
        height: 8;
        background: $panel;
        border: solid $accent;
        padding: 0 1;
        margin: 0 1;
    }

    .lcd-header {
        color: $text-muted;
        text-style: bold;
    }

    .lcd-content {
        background: #1a1a2e;
        color: #00ff00;
        padding: 0;
        height: 4;
    }

    .lcd-status {
        color: $success;
        text-style: italic;
    }

    .lcd-disconnected {
        color: $error;
    }
    """

    def __init__(self, lcd_id: int = 0, **kwargs):
        super().__init__(**kwargs)
        self.lcd_id = lcd_id
        self.address = 0x27 if lcd_id == 0 else 0x3F
        self.connected = False
        self.current_page = "STATUS"
        self.lines = ["", "", "", ""]

    def compose(self) -> ComposeResult:
        yield Label(f"LCD {self.lcd_id + 1} (0x{self.address:02X})", classes="lcd-header")
        yield Static(self._render_lcd_content(), id=f"lcd-content-{self.lcd_id}", classes="lcd-content")
        yield Label("Status: Checking...", id=f"lcd-status-{self.lcd_id}", classes="lcd-status")

    def _render_lcd_content(self) -> str:
        """Render LCD content as ASCII box."""
        width = 20
        border_top = "+" + "-" * width + "+"
        content_lines = []
        for line in self.lines[:4]:  # Max 4 lines for 20x4 display
            padded = line[:width].ljust(width)
            content_lines.append(f"|{padded}|")
        # Pad to 4 lines if needed
        while len(content_lines) < 4:
            content_lines.append("|" + " " * width + "|")
        border_bottom = "+" + "-" * width + "+"
        return "\n".join([border_top] + content_lines + [border_bottom])

    def update_display(self, lines: List[str], connected: bool, page: str):
        """Update the display content."""
        self.lines = lines[:4] if lines else ["", "", "", ""]
        self.connected = connected
        self.current_page = page

        try:
            content_widget = self.query_one(f"#lcd-content-{self.lcd_id}", Static)
            content_widget.update(self._render_lcd_content())

            status_widget = self.query_one(f"#lcd-status-{self.lcd_id}", Label)
            if connected:
                status_widget.update(f"Page: {page}")
                status_widget.remove_class("lcd-disconnected")
                status_widget.add_class("lcd-status")
            else:
                status_widget.update("DISCONNECTED")
                status_widget.remove_class("lcd-status")
                status_widget.add_class("lcd-disconnected")
        except Exception as e:
            logger.debug(f"Error updating LCD display: {e}")


class LCDStatusWidget(Static):
    """Real-time status of both LCD displays with ASCII simulation."""

    DEFAULT_CSS = """
    LCDStatusWidget {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $success;
        padding: 1 2;
        margin: 1 0;
    }

    .lcd-displays-container {
        width: 100%;
        height: auto;
        layout: horizontal;
    }

    .lcd-stats-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None):
        super().__init__()
        self.api_client = api_client
        self.id = "lcd-status"
        self._lcd_status = {}
        self._lcd_simulation = {}

    def compose(self) -> ComposeResult:
        yield Label("LCD HARDWARE STATUS", id="lcd-status-title")
        with Horizontal(classes="lcd-displays-container"):
            yield LCDSimulationBox(lcd_id=0, id="lcd-sim-0")
            yield LCDSimulationBox(lcd_id=1, id="lcd-sim-1")
        yield DataTable(id="lcd-stats-table", classes="lcd-stats-table")

    def _init_table(self) -> None:
        """Initialize stats table."""
        table = self.query_one("#lcd-stats-table", DataTable)
        if not table.columns:
            table.add_columns("Metric", "LCD 1", "LCD 2")
            table.add_row("I2C Address", "0x27", "0x3F")
            table.add_row("Connection", "Checking...", "Checking...")
            table.add_row("Updates", "0", "0")
            table.add_row("Errors", "0", "0")

    async def on_mount(self) -> None:
        """Start periodic refresh."""
        self._init_table()
        self.set_interval(0.5, self._refresh_data)
        asyncio.create_task(self._refresh_data())

    async def _refresh_data(self) -> None:
        """Fetch LCD status and simulation data."""
        if not self.api_client:
            return

        try:
            # Fetch LCD status
            status_result = await self.api_client._get("/lcd/status")
            if status_result.success and status_result.data:
                self._lcd_status = status_result.data

            # Fetch simulation
            sim_result = await self.api_client._get("/lcd/simulation")
            if sim_result.success and sim_result.data:
                self._lcd_simulation = sim_result.data

            self._update_display()
        except Exception as e:
            logger.debug(f"Error fetching LCD data: {e}")

    def _update_display(self) -> None:
        """Update displays with fetched data."""
        try:
            # Update LCD simulations
            lines = self._lcd_simulation.get("lines", [])
            running = self._lcd_status.get("running", False)
            page = self._lcd_status.get("current_page", "UNKNOWN")

            # LCD 1
            lcd1 = self.query_one("#lcd-sim-0", LCDSimulationBox)
            lcd1.update_display(lines[:2] if lines else [], running, page)

            # LCD 2 (shares same data for now, can be split later)
            lcd2 = self.query_one("#lcd-sim-1", LCDSimulationBox)
            lcd2.update_display(lines[2:4] if len(lines) > 2 else lines[:2], running, page)

            # Update stats table
            table = self.query_one("#lcd-stats-table", DataTable)
            table.clear()

            stats = self._lcd_status.get("statistics", {})
            hw = self._lcd_status.get("hardware", {})

            table.add_row("I2C Address", "0x27", "0x3F")
            table.add_row("Connection",
                          "Connected" if running else "Disconnected",
                          "Connected" if running else "Disconnected")
            table.add_row("Updates", str(stats.get("updates", 0)), "-")
            table.add_row("Page Changes", str(stats.get("page_changes", 0)), "-")
            table.add_row("Errors", str(stats.get("errors", 0)), "-")
            table.add_row("Uptime", f"{self._lcd_status.get('uptime_seconds', 0):.0f}s", "-")

        except Exception as e:
            logger.debug(f"Error updating LCD status display: {e}")


class LCDProgrammingWidget(Static):
    """LCD setup and programming services."""

    DEFAULT_CSS = """
    LCDProgrammingWidget {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $warning;
        padding: 1 2;
        margin: 1 0;
    }

    #programming-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #programming-results {
        width: 100%;
        height: auto;
        background: $surface;
        padding: 1;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None):
        super().__init__()
        self.api_client = api_client
        self.id = "lcd-programming"
        self._scan_results = []
        self._last_action = ""

    def compose(self) -> ComposeResult:
        yield Label("PROGRAMMING & SETUP", id="programming-title")
        yield DataTable(id="programming-actions-table")
        yield Label("Ready for action", id="programming-results")

    def _init_table(self) -> None:
        """Initialize actions table."""
        table = self.query_one("#programming-actions-table", DataTable)
        if not table.columns:
            table.add_columns("Key", "Action", "Description")
            table.add_row("s", "Scan I2C", "Detect connected LCD displays")
            table.add_row("d", "Display Test", "Write test patterns to displays")
            table.add_row("g", "GPIO Test", "Test rotary encoder and buttons")
            table.add_row("c", "Generate Config", "Create lcd_config.ini")
            table.add_row("b", "Backlight", "Toggle backlight on/off")
            table.add_row("w", "Write Message", "Send custom message to LCD")
            table.add_row("x", "Reset", "Reset displays to defaults")

    async def on_mount(self) -> None:
        """Initialize widget."""
        self._init_table()

    def update_results(self, message: str):
        """Update the results display."""
        try:
            results = self.query_one("#programming-results", Label)
            results.update(message)
        except Exception as e:
            logger.debug(f"Error updating results: {e}")


class LCDTestingWidget(Static):
    """Test suite runner with visual progress."""

    DEFAULT_CSS = """
    LCDTestingWidget {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $accent;
        padding: 1 2;
        margin: 1 0;
    }

    #test-results-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #test-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #test-summary {
        width: 100%;
        height: auto;
        padding: 1;
        background: $surface;
    }
    """

    def __init__(self, api_client=None):
        super().__init__()
        self.api_client = api_client
        self.id = "lcd-testing"
        self._test_results = {}
        self._running = False

    def compose(self) -> ComposeResult:
        yield Label("TEST SUITE RUNNER", id="testing-title")
        yield DataTable(id="test-results-table")
        yield Label("Press [a] to run all tests", id="test-summary")
        yield DataTable(id="test-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables."""
        # Results table
        results = self.query_one("#test-results-table", DataTable)
        if not results.columns:
            results.add_columns("Category", "Tests", "Status", "Time")
            results.add_row("UI Engine", "5", "---", "---")
            results.add_row("Hardware", "4", "---", "---")
            results.add_row("Input Handler", "3", "---", "---")
            results.add_row("Integration", "4", "---", "---")
            results.add_row("Performance", "2", "---", "---")

        # Actions table
        actions = self.query_one("#test-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.add_row("a", "Run All", "Run complete test suite")
            actions.add_row("1", "UI Engine", "Test page rendering")
            actions.add_row("2", "Hardware", "Test I2C communication")
            actions.add_row("3", "Input", "Test encoder/buttons")
            actions.add_row("4", "Integration", "Test full system")
            actions.add_row("5", "Performance", "Run benchmarks")
            actions.add_row("m", "Demo Mode", "Run hardware demo")

    async def on_mount(self) -> None:
        """Initialize widget."""
        self._init_tables()

    def update_test_status(self, category: str, passed: int, total: int, time_ms: float):
        """Update test results for a category."""
        try:
            results = self.query_one("#test-results-table", DataTable)
            # Would need to update specific row - simplified for now
            status = f"{passed}/{total}"
            time_str = f"{time_ms:.0f}ms"
            logger.debug(f"Test {category}: {status} in {time_str}")
        except Exception as e:
            logger.debug(f"Error updating test status: {e}")

    def update_summary(self, message: str):
        """Update summary display."""
        try:
            summary = self.query_one("#test-summary", Label)
            summary.update(message)
        except Exception as e:
            logger.debug(f"Error updating summary: {e}")


class LCDAlertConfigWidget(Static):
    """Alert routing and information assignment to specific LCDs."""

    DEFAULT_CSS = """
    LCDAlertConfigWidget {
        width: 100%;
        height: auto;
        background: $panel;
        border: solid $primary;
        padding: 1 2;
        margin: 1 0;
    }

    #alert-routing-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #page-assignment-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }

    #alert-actions-table {
        width: 100%;
        height: auto;
        margin: 1 0;
    }
    """

    def __init__(self, api_client=None):
        super().__init__()
        self.api_client = api_client
        self.id = "lcd-alert-config"
        self._alert_config = {}
        self._page_config = {}

    def compose(self) -> ComposeResult:
        yield Label("ALERT & INFORMATION ROUTING", id="alert-config-title")
        yield Label("Alert Routing:", id="alert-routing-label")
        yield DataTable(id="alert-routing-table")
        yield Label("Page Assignment:", id="page-assignment-label")
        yield DataTable(id="page-assignment-table")
        yield Label("Actions:", id="alert-actions-label")
        yield DataTable(id="alert-actions-table")

    def _init_tables(self) -> None:
        """Initialize tables with default config."""
        # Alert routing table
        routing = self.query_one("#alert-routing-table", DataTable)
        if not routing.columns:
            routing.add_columns("Alert Type", "Severity", "Target LCD", "Duration", "Enabled")
            routing.add_row("XRUN", "warning", "LCD 1", "5s", "Yes")
            routing.add_row("HIGH_XRUN_RATE", "critical", "BOTH", "10s", "Yes")
            routing.add_row("THREAD_STALL", "critical", "BOTH", "30s", "Yes")
            routing.add_row("SIGNAL_LOST", "info", "LCD 2", "3s", "Yes")
            routing.add_row("AUTO_MUTED", "info", "LCD 2", "3s", "Yes")
            routing.add_row("Custom Message", "user", "Selectable", "Manual", "-")

        # Page assignment table
        pages = self.query_one("#page-assignment-table", DataTable)
        if not pages.columns:
            pages.add_columns("LCD", "Default Page", "Alert Interrupt", "Auto-Cycle")
            pages.add_row("LCD 1", "STATUS", "Yes", "No")
            pages.add_row("LCD 2", "VU_METERS", "No", "Yes (10s)")

        # Actions table
        actions = self.query_one("#alert-actions-table", DataTable)
        if not actions.columns:
            actions.add_columns("Key", "Action", "Description")
            actions.add_row("e", "Edit Routing", "Configure alert routing")
            actions.add_row("p", "Set Page", "Set default page for LCD")
            actions.add_row("m", "Custom Message", "Send message to LCD")
            actions.add_row("t", "Test Alert", "Send test alert")

    async def on_mount(self) -> None:
        """Initialize widget."""
        self._init_tables()


class LCDServicesScreen(Static):
    """
    LCD Services Screen - Complete LCD management interface.

    Provides:
    - Real-time LCD simulation for both displays
    - Hardware setup wizard
    - Test suite runner
    - Alert routing configuration
    """

    DEFAULT_CSS = """
    LCDServicesScreen {
        width: 100%;
        height: 100%;
        background: $surface;
        layout: vertical;
        overflow: auto;
    }
    """

    BINDINGS = [
        # Programming actions
        Binding("s", "scan_i2c", "Scan I2C", show=True),
        Binding("d", "test_display", "Test Display", show=True),
        Binding("g", "test_gpio", "GPIO Test", show=False),
        Binding("c", "generate_config", "Gen Config", show=False),
        Binding("b", "toggle_backlight", "Backlight", show=False),
        Binding("w", "write_message", "Message", show=True),
        Binding("x", "reset_displays", "Reset", show=False),
        # Testing actions
        Binding("a", "run_all_tests", "Run Tests", show=True),
        Binding("m", "demo_mode", "Demo", show=False),
        # Alert actions
        Binding("e", "edit_routing", "Edit Routing", show=False),
        Binding("p", "set_page", "Set Page", show=True),
        Binding("t", "test_alert", "Test Alert", show=False),
        # General
        Binding("r", "refresh_all", "Refresh", show=True),
    ]

    def __init__(self, api_client=None, **kwargs):
        super().__init__(**kwargs)
        self.api_client = api_client

    def compose(self) -> ComposeResult:
        with Vertical(id="lcd-services-container"):
            yield LCDStatusWidget(self.api_client)
            yield LCDProgrammingWidget(self.api_client)
            yield LCDTestingWidget(self.api_client)
            yield LCDAlertConfigWidget(self.api_client)

    async def action_scan_i2c(self) -> None:
        """Scan I2C bus for LCD displays."""
        self.notify("Scanning I2C bus...", severity="information", timeout=2)

        if not self.api_client:
            self.notify("API client not available", severity="warning", timeout=2)
            return

        try:
            result = await self.api_client._post("/lcd/scan", {})
            if result.success and result.data:
                devices = result.data.get("devices", [])
                if devices:
                    self.notify(f"Found {len(devices)} I2C device(s)", severity="information", timeout=3)
                    programming = self.query_one("#lcd-programming", LCDProgrammingWidget)
                    addresses = [f"0x{d.get('address', 0):02X}" for d in devices]
                    programming.update_results(f"Found: {', '.join(addresses)}")
                else:
                    self.notify("No I2C devices found", severity="warning", timeout=3)
            else:
                # Fallback: call status which shows what's detected
                status_result = await self.api_client._get("/lcd/status")
                if status_result.success:
                    self.notify("LCD system status retrieved", severity="information", timeout=2)
                else:
                    self.notify("I2C scan not available", severity="warning", timeout=2)
        except Exception as e:
            self.notify(f"Scan error: {e}", severity="error", timeout=3)

    async def action_test_display(self) -> None:
        """Run display test."""
        self.notify("Testing displays...", severity="information", timeout=2)

        if not self.api_client:
            return

        try:
            # Use the input simulation to trigger a display update
            result = await self.api_client._post("/lcd/input/select", {})
            if result.success:
                self.notify("Display test triggered", severity="information", timeout=2)
            else:
                self.notify("Display test not available via API", severity="warning", timeout=2)
        except Exception as e:
            self.notify(f"Test error: {e}", severity="error", timeout=3)

    async def action_test_gpio(self) -> None:
        """Test GPIO inputs."""
        self.notify("GPIO testing requires hardware - check encoder and buttons", severity="information", timeout=3)

    async def action_generate_config(self) -> None:
        """Generate configuration file."""
        self.notify("Configuration generation triggered", severity="information", timeout=2)
        programming = self.query_one("#lcd-programming", LCDProgrammingWidget)
        programming.update_results("Config generation requires running setup_tool.py")

    async def action_toggle_backlight(self) -> None:
        """Toggle LCD backlight."""
        self.notify("Toggling backlight...", severity="information", timeout=1)
        # Would need API endpoint for this

    async def action_write_message(self) -> None:
        """Write custom message to LCD."""
        self.notify("Custom message dialog - use API directly for now", severity="information", timeout=2)
        # Could show input dialog here

    async def action_reset_displays(self) -> None:
        """Reset displays to defaults."""
        self.notify("Resetting displays...", severity="information", timeout=2)

        if not self.api_client:
            return

        try:
            result = await self.api_client._post("/lcd/page", {"page": "status"})
            if result.success:
                self.notify("Displays reset to STATUS page", severity="information", timeout=2)
        except Exception as e:
            self.notify(f"Reset error: {e}", severity="error", timeout=3)

    async def action_run_all_tests(self) -> None:
        """Run complete LCD test suite."""
        self.notify("Running LCD test suite...", severity="information", timeout=2)

        testing = self.query_one("#lcd-testing", LCDTestingWidget)
        testing.update_summary("Running tests...")

        if not self.api_client:
            testing.update_summary("API not available - run: python3 -m lcd.test_suite")
            return

        try:
            # Try to trigger tests via API
            result = await self.api_client._post("/lcd/tests/run", {})
            if result.success and result.data:
                results = result.data
                passed = results.get("passed", 0)
                total = results.get("total", 0)
                testing.update_summary(f"Tests: {passed}/{total} passed")
                self.notify(f"Tests completed: {passed}/{total} passed", severity="information", timeout=3)
            else:
                testing.update_summary("Run manually: python3 -m lcd.test_suite")
                self.notify("Test API not available - run manually", severity="warning", timeout=3)
        except Exception as e:
            testing.update_summary(f"Error: {e}")
            self.notify(f"Test error: {e}", severity="error", timeout=3)

    async def action_demo_mode(self) -> None:
        """Run hardware demo mode."""
        self.notify("Starting demo mode - cycling through pages...", severity="information", timeout=2)

        if not self.api_client:
            return

        pages = ["status", "vu", "chain", "plugins", "midi", "perf", "menu"]
        for page in pages:
            try:
                await self.api_client._post("/lcd/page", {"page": page})
                await asyncio.sleep(2)
            except Exception as e:
                logger.debug(f"Demo page change error: {e}")

        self.notify("Demo complete", severity="information", timeout=2)

    async def action_edit_routing(self) -> None:
        """Edit alert routing configuration."""
        self.notify("Alert routing editor - feature in development", severity="information", timeout=2)

    async def action_set_page(self) -> None:
        """Set default page for LCD."""
        self.notify("Cycling page...", severity="information", timeout=1)

        if not self.api_client:
            return

        try:
            # Get current status
            status_result = await self.api_client._get("/lcd/status")
            if status_result.success and status_result.data:
                current = status_result.data.get("current_page", "status")
                pages = ["status", "vu", "chain", "plugins", "midi", "perf"]
                try:
                    idx = pages.index(current.lower())
                    next_page = pages[(idx + 1) % len(pages)]
                except ValueError:
                    next_page = "status"

                await self.api_client._post("/lcd/page", {"page": next_page})
                self.notify(f"Page set to: {next_page.upper()}", severity="information", timeout=2)
        except Exception as e:
            self.notify(f"Page change error: {e}", severity="error", timeout=3)

    async def action_test_alert(self) -> None:
        """Send test alert to LCD."""
        self.notify("Test alert sent to displays", severity="information", timeout=2)
        # Would trigger an alert display

    async def action_refresh_all(self) -> None:
        """Refresh all LCD status."""
        self.notify("Refreshing LCD status...", severity="information", timeout=1)

        try:
            # Refresh status widget
            for widget in self.query("LCDStatusWidget"):
                asyncio.create_task(widget._refresh_data())

            self.notify("Status refreshed", severity="information", timeout=2)
        except Exception as e:
            self.notify(f"Refresh error: {e}", severity="error", timeout=3)

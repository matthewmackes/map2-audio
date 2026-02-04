"""
Backend Monitor Screen for MAP2 TUI
====================================
World-class backend services monitoring dashboard.

Displays:
- All 13 backend services with real-time health status
- System metrics (CPU, Memory, Latency)
- Active alerts with severity indicators
- Circuit breaker status
- Service dependency graph
- Real-time logs

Layout:
+==================================================================================+
|  MAP2 BACKEND SERVICES MONITOR  |  HEALTHY  |  Uptime: 3d 14h 22m  |  14:32:05  |
+==================================================================================+
|  SERVICES (13/13 healthy)                       |  ALERTS                        |
|  [Service Grid - 13 cards]                      |  [Alert List]                  |
|                                                  |  [Circuit Breaker]             |
|                                                  |  [System Metrics]              |
|  [Overview] [Metrics] [Dependencies] [Logs]                                      |
|  [Tab Content Area]                                                              |
+==================================================================================+
| [1-9] Service  [r]efresh  [a]lerts  [d]etail  [q]uit           WS: CONNECTED     |
+==================================================================================+
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
import asyncio
import logging

try:
    from textual.app import ComposeResult
    from textual.containers import Container, Horizontal, Vertical, ScrollableContainer
    from textual.widgets import (
        Static, Label, Header, Footer, DataTable,
        TabbedContent, TabPane, Rule, ContentSwitcher,
        LoadingIndicator, ProgressBar
    )
    from textual.binding import Binding
    from textual.reactive import reactive
    from textual.css.query import NoMatches
    TEXTUAL_AVAILABLE = True
except ImportError:
    TEXTUAL_AVAILABLE = False
    Static = object

# Import from parent package using relative imports with fallbacks
try:
    from ..base_screen import BaseScreen
except ImportError as e:
    from textual.widget import Widget as BaseScreen

# Import monitoring widgets with individual fallbacks
try:
    from ..widgets.monitoring.services_grid_widget import ServicesGridWidget
except ImportError:
    ServicesGridWidget = None

try:
    from ..widgets.monitoring.metrics_gauge_widget import MetricsGaugeWidget
except ImportError:
    MetricsGaugeWidget = None

try:
    from ..widgets.monitoring.service_card_widget import ServiceHealth, HealthStatus
except ImportError:
    class HealthStatus:
        HEALTHY = "HEALTHY"
        DEGRADED = "DEGRADED"
        CRITICAL = "CRITICAL"
        OFFLINE = "OFFLINE"
    class ServiceHealth:
        def __init__(self, name="", status=HealthStatus.OFFLINE, **kwargs):
            self.name = name
            self.status = status
            for k, v in kwargs.items():
                setattr(self, k, v)

try:
    from ..widgets.monitoring.alert_list_widget import AlertListWidget
except ImportError:
    AlertListWidget = None

try:
    from ..widgets.monitoring.circuit_breaker_widget import CircuitBreakerWidget
except ImportError:
    CircuitBreakerWidget = None

try:
    from ..widgets.monitoring.dependency_graph_widget import DependencyGraphWidget
except ImportError:
    DependencyGraphWidget = None

try:
    from ..widgets.monitoring.log_stream_widget import LogStreamWidget
except ImportError:
    LogStreamWidget = None

logger = logging.getLogger(__name__)


class MonitoringHeader(Static):
    """
    Monitoring dashboard header.

    Shows: Title | Overall Status | Uptime | Clock
    """

    DEFAULT_CSS = """
    MonitoringHeader {
        dock: top;
        width: 100%;
        height: 3;
        background: $primary;
        color: $text;
        text-style: bold;
        padding: 0 2;
        content-align: center middle;
    }
    """

    overall_status: reactive[str] = reactive("HEALTHY")
    uptime_seconds: reactive[int] = reactive(0)

    def __init__(self, id: Optional[str] = None):
        super().__init__(id=id)
        self._start_time = datetime.now()

    def render(self) -> str:
        """Render the header."""
        title = "MAP2 BACKEND SERVICES MONITOR"

        # Status badge
        status_colors = {
            "HEALTHY": "[#10B981 on #064E3B]",
            "DEGRADED": "[#F59E0B on #78350F]",
            "CRITICAL": "[#EF4444 on #7F1D1D]",
            "OFFLINE": "[#6B7280 on #374151]",
        }
        status_color = status_colors.get(self.overall_status, "")
        status_badge = f"{status_color} {self.overall_status} [/]"

        # Uptime
        uptime = self._format_uptime()

        # Clock
        clock = datetime.now().strftime("%H:%M:%S")

        return f"{title}  |  {status_badge}  |  Uptime: {uptime}  |  {clock}"

    def _format_uptime(self) -> str:
        """Format uptime as human-readable string."""
        td = timedelta(seconds=self.uptime_seconds)
        days = td.days
        hours, remainder = divmod(td.seconds, 3600)
        minutes, seconds = divmod(remainder, 60)

        if days > 0:
            return f"{days}d {hours}h {minutes}m"
        elif hours > 0:
            return f"{hours}h {minutes}m {seconds}s"
        elif minutes > 0:
            return f"{minutes}m {seconds}s"
        else:
            return f"{seconds}s"

    def update_status(self, status: str, uptime: int = 0) -> None:
        """Update status and uptime."""
        self.overall_status = status
        self.uptime_seconds = uptime
        self.refresh()


class WebSocketStatusWidget(Static):
    """WebSocket connection status indicator."""

    DEFAULT_CSS = """
    WebSocketStatusWidget {
        width: auto;
        height: 1;
    }

    WebSocketStatusWidget.connected {
        color: #10B981;
    }

    WebSocketStatusWidget.disconnected {
        color: #EF4444;
    }
    """

    connected: reactive[bool] = reactive(False)

    def render(self) -> str:
        """Render status."""
        if self.connected:
            return "WS: [#10B981]CONNECTED[/]"
        else:
            return "WS: [#EF4444]DISCONNECTED[/]"


class ServiceDetailPanel(Static):
    """
    Service detail panel with ContentSwitcher for smooth transitions.

    Shows detailed information about a selected service with
    animated transitions between different detail views.
    """

    DEFAULT_CSS = """
    ServiceDetailPanel {
        width: 100%;
        height: auto;
        min-height: 10;
        background: $surface;
        border: round $primary-darken-2;
        padding: 1;
    }

    ServiceDetailPanel .detail-header {
        width: 100%;
        height: 2;
        background: $primary;
        color: $text;
        content-align: center middle;
        text-style: bold;
    }

    ServiceDetailPanel ContentSwitcher {
        width: 100%;
        height: auto;
        min-height: 8;
    }

    ServiceDetailPanel .detail-section {
        width: 100%;
        height: auto;
        padding: 1;
    }

    ServiceDetailPanel .metric-row {
        width: 100%;
        height: 2;
        layout: horizontal;
    }

    ServiceDetailPanel .metric-label {
        width: 1fr;
        color: $text-muted;
    }

    ServiceDetailPanel .metric-value {
        width: 1fr;
        text-align: right;
        color: $text;
        text-style: bold;
    }

    ServiceDetailPanel ProgressBar {
        width: 100%;
        margin: 1 0;
    }

    ServiceDetailPanel .detail-tabs {
        width: 100%;
        height: auto;
        layout: horizontal;
        padding: 1 0;
    }

    ServiceDetailPanel .tab-btn {
        min-width: 10;
        margin-right: 1;
    }

    ServiceDetailPanel .tab-btn.-active {
        border: solid $primary;
    }
    """

    current_service: reactive[str] = reactive("")
    current_view: reactive[str] = reactive("overview")

    def __init__(
        self,
        api_client: Optional[Any] = None,
        id: Optional[str] = None,
    ):
        super().__init__(id=id)
        self._api_client = api_client
        self._service_data: Dict[str, Any] = {}

    def compose(self) -> ComposeResult:
        """Compose the detail panel with ContentSwitcher."""
        yield Label("Service Detail", id="detail-title", classes="detail-header")

        # Content switcher for smooth transitions between views
        with ContentSwitcher(initial="overview", id="detail-switcher"):
            # Overview view
            with Vertical(id="overview", classes="detail-section"):
                yield Label("Select a service to view details", id="overview-placeholder")
                with Horizontal(classes="metric-row"):
                    yield Label("Status:", classes="metric-label")
                    yield Label("--", id="detail-status", classes="metric-value")
                with Horizontal(classes="metric-row"):
                    yield Label("Latency:", classes="metric-label")
                    yield Label("--", id="detail-latency", classes="metric-value")
                with Horizontal(classes="metric-row"):
                    yield Label("Uptime:", classes="metric-label")
                    yield Label("--", id="detail-uptime", classes="metric-value")
                with Horizontal(classes="metric-row"):
                    yield Label("Circuit Breaker:", classes="metric-label")
                    yield Label("--", id="detail-circuit", classes="metric-value")
                yield ProgressBar(total=100, show_eta=False, id="detail-health-bar")

            # Metrics view
            with Vertical(id="metrics", classes="detail-section"):
                yield Label("Detailed Metrics", classes="section-title")
                with Horizontal(classes="metric-row"):
                    yield Label("Requests/min:", classes="metric-label")
                    yield Label("--", id="detail-requests", classes="metric-value")
                with Horizontal(classes="metric-row"):
                    yield Label("Errors/hr:", classes="metric-label")
                    yield Label("--", id="detail-errors", classes="metric-value")
                with Horizontal(classes="metric-row"):
                    yield Label("Avg Response:", classes="metric-label")
                    yield Label("--", id="detail-avg-response", classes="metric-value")
                with Horizontal(classes="metric-row"):
                    yield Label("p99 Latency:", classes="metric-label")
                    yield Label("--", id="detail-p99", classes="metric-value")

            # Dependencies view
            with Vertical(id="dependencies", classes="detail-section"):
                yield Label("Dependencies", classes="section-title")
                yield Label("--", id="detail-deps-list")

            # Loading view
            with Vertical(id="loading", classes="detail-section"):
                yield LoadingIndicator()
                yield Label("Loading service details...")

    def show_service(self, service_name: str) -> None:
        """Show details for a service with animated transition."""
        self.current_service = service_name

        # Show loading state
        try:
            switcher = self.query_one("#detail-switcher", ContentSwitcher)
            switcher.current = "loading"

            # Update title
            title = self.query_one("#detail-title", Label)
            title.update(f"Service: {service_name}")

            # Trigger async load
            asyncio.create_task(self._load_service_details(service_name))
        except Exception as e:
            logger.debug(f"Error showing service: {e}")

    async def _load_service_details(self, service_name: str) -> None:
        """Load service details from API."""
        await asyncio.sleep(0.2)  # Brief delay for animation

        try:
            if self._api_client:
                result = await self._api_client.get_service_details(service_name)
                if result.success and result.data:
                    self._service_data = result.data
                    self._update_display()

            # Switch to overview
            switcher = self.query_one("#detail-switcher", ContentSwitcher)
            switcher.current = "overview"
        except Exception as e:
            logger.debug(f"Error loading service details: {e}")

    def _update_display(self) -> None:
        """Update display with service data."""
        try:
            data = self._service_data

            # Update overview fields
            status = data.get("status", "UNKNOWN")
            self.query_one("#detail-status", Label).update(status)

            latency = data.get("latency_ms", 0)
            self.query_one("#detail-latency", Label).update(f"{latency:.1f}ms")

            uptime = data.get("uptime_percent", 0)
            self.query_one("#detail-uptime", Label).update(f"{uptime:.2f}%")

            circuit = data.get("circuit_state", "CLOSED")
            self.query_one("#detail-circuit", Label).update(circuit)

            # Update health bar
            health = data.get("health_score", 100)
            health_bar = self.query_one("#detail-health-bar", ProgressBar)
            health_bar.update(progress=health)

            # Update metrics
            self.query_one("#detail-requests", Label).update(
                f"{data.get('requests_per_min', 0):,}"
            )
            self.query_one("#detail-errors", Label).update(
                str(data.get("errors_per_hour", 0))
            )
            self.query_one("#detail-avg-response", Label).update(
                f"{data.get('avg_response_ms', 0):.1f}ms"
            )
            self.query_one("#detail-p99", Label).update(
                f"{data.get('p99_latency_ms', 0):.1f}ms"
            )

            # Update dependencies
            deps = data.get("dependencies", [])
            deps_text = ", ".join(deps) if deps else "None"
            self.query_one("#detail-deps-list", Label).update(deps_text)

        except Exception as e:
            logger.debug(f"Error updating detail display: {e}")

    def switch_view(self, view: str) -> None:
        """Switch to a different detail view with animation."""
        try:
            switcher = self.query_one("#detail-switcher", ContentSwitcher)
            if view in ["overview", "metrics", "dependencies"]:
                switcher.current = view
                self.current_view = view
        except Exception as e:
            logger.debug(f"Error switching view: {e}")


class BackendMonitorScreen(BaseScreen if TEXTUAL_AVAILABLE else object):
    """
    Main backend services monitoring screen.

    Provides comprehensive monitoring of all 13 backend services
    with real-time health status, metrics, alerts, and logs.
    """

    BINDINGS = [
        Binding("r", "refresh", "Refresh"),
        Binding("a", "focus_alerts", "Alerts"),
        Binding("d", "show_detail", "Detail"),
        Binding("l", "focus_logs", "Logs"),
        Binding("o", "switch_overview", "Overview", show=False),
        Binding("m", "switch_metrics", "Metrics", show=False),
        Binding("1", "select_service_1", "Service 1", show=False),
        Binding("2", "select_service_2", "Service 2", show=False),
        Binding("3", "select_service_3", "Service 3", show=False),
        Binding("4", "select_service_4", "Service 4", show=False),
        Binding("5", "select_service_5", "Service 5", show=False),
        Binding("6", "select_service_6", "Service 6", show=False),
        Binding("7", "select_service_7", "Service 7", show=False),
        Binding("8", "select_service_8", "Service 8", show=False),
        Binding("9", "select_service_9", "Service 9", show=False),
        Binding("escape", "go_back", "Back"),
    ]

    DEFAULT_CSS = """
    BackendMonitorScreen {
        layout: vertical;
        background: $background;
    }

    BackendMonitorScreen .main-content {
        width: 100%;
        height: 1fr;
    }

    BackendMonitorScreen .left-panel {
        width: 70%;
        height: 100%;
        padding: 1;
    }

    BackendMonitorScreen .right-panel {
        width: 30%;
        height: 100%;
        padding: 1;
        background: $surface;
        border-left: solid $primary;
    }

    BackendMonitorScreen .tabs-container {
        width: 100%;
        height: 40%;
        border-top: solid $primary;
    }

    BackendMonitorScreen .monitoring-footer {
        dock: bottom;
        width: 100%;
        height: 1;
        background: $surface;
        padding: 0 2;
    }
    """

    def __init__(self, api_client: Optional[Any] = None, name: str = "monitor", id: Optional[str] = None, **kwargs):
        """
        Initialize backend monitor screen.

        Args:
            api_client: MAP2 API client
            name: Screen name
            id: Widget ID
            **kwargs: Additional arguments for parent class
        """
        super().__init__(id=id, **kwargs)
        self._api_client = api_client
        self._ws_connected = False
        self._refresh_task: Optional[asyncio.Task] = None
        self._start_time = datetime.now()

    def compose(self) -> ComposeResult:
        """Compose the screen layout with graceful widget fallbacks."""
        # Header
        yield MonitoringHeader(id="monitoring-header")

        # Main content area
        with Horizontal(classes="main-content"):
            # Left panel - Services grid
            with Vertical(classes="left-panel"):
                if ServicesGridWidget:
                    yield ServicesGridWidget(
                        api_client=self._api_client,
                        id="services-grid"
                    )
                else:
                    yield Label("Services Grid: Widget unavailable", id="services-grid-fallback")

            # Right panel - Alerts, CB, Metrics
            with Vertical(classes="right-panel"):
                if AlertListWidget:
                    yield AlertListWidget(
                        api_client=self._api_client,
                        id="alert-list"
                    )
                else:
                    yield Label("Alerts: Widget unavailable", id="alert-list-fallback")

                if CircuitBreakerWidget:
                    yield CircuitBreakerWidget(id="circuit-breakers")
                else:
                    yield Label("Circuit Breakers: Widget unavailable", id="cb-fallback")

                if MetricsGaugeWidget:
                    yield MetricsGaugeWidget(
                        api_client=self._api_client,
                        id="metrics-gauge"
                    )
                else:
                    yield Label("Metrics: Widget unavailable", id="metrics-fallback")

        # Tabbed content area
        with TabbedContent(classes="tabs-container"):
            with TabPane("Overview", id="tab-overview"):
                yield self._create_overview_table()
            with TabPane("Service Detail", id="tab-detail"):
                # Service detail panel using ContentSwitcher for smooth transitions
                yield ServiceDetailPanel(
                    api_client=self._api_client,
                    id="service-detail"
                )
            with TabPane("Metrics", id="tab-metrics"):
                yield Label("Detailed metrics charts...", id="metrics-detail")
            with TabPane("Dependencies", id="tab-deps"):
                if DependencyGraphWidget:
                    yield DependencyGraphWidget(
                        api_client=self._api_client,
                        id="dependency-graph"
                    )
                else:
                    yield Label(self._render_dependency_graph(), id="dependency-fallback")
            with TabPane("Logs", id="tab-logs"):
                if LogStreamWidget:
                    yield LogStreamWidget(
                        api_client=self._api_client,
                        id="log-stream"
                    )
                else:
                    yield Label("Logs: Widget unavailable", id="logs-fallback")

        # Footer
        with Horizontal(classes="monitoring-footer"):
            yield Label("[1-9] Service  [r]efresh  [a]lerts  [d]etail  [l]ogs  [q]uit")
            yield WebSocketStatusWidget(id="ws-status")

    def _create_overview_table(self) -> DataTable:
        """Create the overview data table."""
        table = DataTable(id="overview-table")
        table.add_columns("Service", "Status", "Latency", "Uptime", "CB State", "Errors")
        return table

    def _render_dependency_graph(self) -> str:
        """Render ASCII dependency graph."""
        graph = """
Service Dependency Graph:

  database
  ├── plugin_loader
  ├── juce_engine
  │   ├── midi_engine
  │   └── meter_broadcaster
  ├── command_queue
  │   └── event_publisher
  └── websocket_manager

  rt_monitor (standalone)
  plugin_profiler (standalone)
  folder_scanner (standalone)
  lcd_display (standalone)
  metrics_collector (standalone)
"""
        return graph

    async def on_mount(self) -> None:
        """Initialize when screen is mounted."""
        # Start periodic refresh
        self._refresh_task = asyncio.create_task(self._periodic_refresh())

        # Initial data load
        await self._refresh_all()

    async def on_unmount(self) -> None:
        """Cleanup when screen is unmounted."""
        if self._refresh_task:
            self._refresh_task.cancel()
            try:
                await self._refresh_task
            except asyncio.CancelledError:
                pass

    async def _periodic_refresh(self) -> None:
        """Periodically refresh header and alerts."""
        while True:
            try:
                await self._update_header()
                await self._refresh_alerts()
                await asyncio.sleep(5)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Periodic refresh error: {e}")
                await asyncio.sleep(5)

    async def _refresh_all(self) -> None:
        """Refresh all dashboard data."""
        await self._update_header()
        await self._refresh_alerts()
        await self._refresh_overview_table()

    async def _update_header(self) -> None:
        """Update header status and uptime."""
        try:
            header = self.query_one("#monitoring-header", MonitoringHeader)

            # Calculate uptime
            uptime = int((datetime.now() - self._start_time).total_seconds())

            # Get overall status from services grid (if available)
            status = "HEALTHY"
            if ServicesGridWidget:
                try:
                    grid = self.query_one("#services-grid", ServicesGridWidget)
                    if grid.healthy_count == grid.total_count:
                        status = "HEALTHY"
                    elif grid.healthy_count >= grid.total_count * 0.8:
                        status = "DEGRADED"
                    else:
                        status = "CRITICAL"
                except (NoMatches, Exception):
                    pass

            header.update_status(status, uptime)
        except (NoMatches, Exception) as e:
            logger.debug(f"Could not update header: {e}")

    async def _refresh_alerts(self) -> None:
        """Refresh alerts from API."""
        if not self._api_client:
            return

        try:
            result = await self._api_client.get_active_alerts()
            if result.success and result.data:
                alerts = result.data.get("alerts", []) if isinstance(result.data, dict) else result.data
                try:
                    alert_widget = self.query_one("#alert-list", AlertListWidget)
                    alert_widget.update_alerts(alerts)
                except NoMatches:
                    pass
        except Exception as e:
            logger.error(f"Failed to refresh alerts: {e}")

    async def _refresh_overview_table(self) -> None:
        """Refresh the overview table."""
        if not ServicesGridWidget:
            return

        try:
            table = self.query_one("#overview-table", DataTable)
            grid = self.query_one("#services-grid", ServicesGridWidget)

            table.clear()
            for name, service in grid.get_all_services().items():
                # Status with color
                status_colors = {
                    "HEALTHY": "[#10B981]",
                    "DEGRADED": "[#F59E0B]",
                    "CRITICAL": "[#EF4444]",
                    "OFFLINE": "[#6B7280]",
                }
                status_color = status_colors.get(service.status, "")
                status_display = f"{status_color}{service.status}[/]"

                table.add_row(
                    service.name,
                    status_display,
                    f"{service.latency_ms:.1f}ms",
                    f"{service.uptime_percent:.1f}%",
                    service.circuit_state,
                    str(service.error_count)
                )
        except (NoMatches, Exception) as e:
            logger.debug(f"Could not refresh overview table: {e}")

    # Action handlers
    async def action_refresh(self) -> None:
        """Manual refresh."""
        await self._refresh_all()

    def action_focus_alerts(self) -> None:
        """Focus on alerts panel."""
        try:
            alert_widget = self.query_one("#alert-list", AlertListWidget)
            alert_widget.focus()
        except NoMatches:
            pass

    def action_show_detail(self) -> None:
        """Show service detail using ContentSwitcher panel."""
        try:
            # Switch to detail tab
            tabs = self.query_one(TabbedContent)
            tabs.active = "tab-detail"

            if ServicesGridWidget:
                try:
                    grid = self.query_one("#services-grid", ServicesGridWidget)
                    services = list(grid.get_all_services().keys())
                    if services:
                        # Show first service or selected service
                        detail_panel = self.query_one("#service-detail", ServiceDetailPanel)
                        detail_panel.show_service(services[0])
                except NoMatches:
                    self.notify("Services grid not available")
            else:
                self.notify("Services grid widget not loaded")
        except (NoMatches, Exception) as e:
            self.notify(f"Could not show detail: {e}")

    def action_switch_overview(self) -> None:
        """Switch to overview view in detail panel."""
        try:
            detail_panel = self.query_one("#service-detail", ServiceDetailPanel)
            detail_panel.switch_view("overview")
        except NoMatches:
            pass

    def action_switch_metrics(self) -> None:
        """Switch to metrics view in detail panel."""
        try:
            detail_panel = self.query_one("#service-detail", ServiceDetailPanel)
            detail_panel.switch_view("metrics")
        except NoMatches:
            pass

    def action_focus_logs(self) -> None:
        """Focus on logs tab."""
        try:
            tabs = self.query_one(TabbedContent)
            tabs.active = "tab-logs"
        except NoMatches:
            pass

    def action_go_back(self) -> None:
        """Go back to previous screen."""
        self.app.pop_screen()

    # Service selection shortcuts
    def _select_service_by_index(self, index: int) -> None:
        """Select a service by index and show detail."""
        if not ServicesGridWidget:
            self.notify("Services grid not available")
            return

        try:
            grid = self.query_one("#services-grid", ServicesGridWidget)
            services = list(grid.get_all_services().keys())
            if index < len(services):
                service_name = services[index]
                self.notify(f"Selected: {service_name}")
                # Show detail using ContentSwitcher
                try:
                    detail_panel = self.query_one("#service-detail", ServiceDetailPanel)
                    detail_panel.show_service(service_name)
                except (NoMatches, Exception):
                    pass
        except (NoMatches, Exception) as e:
            logger.debug(f"Could not select service: {e}")

    def action_select_service_1(self) -> None:
        self._select_service_by_index(0)

    def action_select_service_2(self) -> None:
        self._select_service_by_index(1)

    def action_select_service_3(self) -> None:
        self._select_service_by_index(2)

    def action_select_service_4(self) -> None:
        self._select_service_by_index(3)

    def action_select_service_5(self) -> None:
        self._select_service_by_index(4)

    def action_select_service_6(self) -> None:
        self._select_service_by_index(5)

    def action_select_service_7(self) -> None:
        self._select_service_by_index(6)

    def action_select_service_8(self) -> None:
        self._select_service_by_index(7)

    def action_select_service_9(self) -> None:
        self._select_service_by_index(8)

    # Message handlers - handle missing widget gracefully
    def on_services_grid_widget_service_selected(self, message) -> None:
        """Handle service selection from grid."""
        if not ServicesGridWidget:
            return
        service_name = getattr(message, 'service_name', 'Unknown')
        self.notify(f"Service selected: {service_name}")
        # Switch to detail tab and show service detail using ContentSwitcher
        try:
            tabs = self.query_one(TabbedContent)
            tabs.active = "tab-detail"

            detail_panel = self.query_one("#service-detail", ServiceDetailPanel)
            detail_panel.show_service(service_name)
        except (NoMatches, Exception):
            pass

    def on_services_grid_widget_services_updated(self, message) -> None:
        """Handle services data update."""
        if not ServicesGridWidget:
            return
        # Update header status
        asyncio.create_task(self._update_header())
        # Update overview table
        asyncio.create_task(self._refresh_overview_table())

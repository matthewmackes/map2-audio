"""
Services Grid Widget for Backend Services Monitoring TUI
========================================================
Grid layout displaying all backend services with real-time status.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List, Dict, Any, Callable
import asyncio
import logging

try:
    from textual.app import ComposeResult
    from textual.containers import Container, Vertical, ScrollableContainer
    from textual.widgets import Static, Label
    from textual.reactive import reactive
    from textual.message import Message
    TEXTUAL_AVAILABLE = True
except ImportError:
    TEXTUAL_AVAILABLE = False
    Static = object

from .service_card_widget import ServiceCardWidget, ServiceHealth, HealthStatus, CircuitState

logger = logging.getLogger(__name__)


class ServicesGridWidget(Static):
    """
    Grid display of all backend services.

    Features:
    - Displays all 13 services in a responsive grid
    - Real-time status updates
    - Keyboard navigation between cards
    - Service selection via click or Enter
    - Auto-refresh with configurable interval
    """

    DEFAULT_CSS = """
    ServicesGridWidget {
        width: 100%;
        height: 100%;
        background: $background;
        padding: 1;
    }

    ServicesGridWidget .grid-header {
        width: 100%;
        height: 1;
        text-style: bold;
        margin-bottom: 1;
    }

    ServicesGridWidget .grid-container {
        width: 100%;
        height: 1fr;
        layout: grid;
        grid-size: 2;
        grid-gutter: 1;
    }

    ServicesGridWidget .services-scroll {
        width: 100%;
        height: 1fr;
    }
    """

    # Messages
    class ServiceSelected(Message):
        """Emitted when a service is selected."""
        def __init__(self, service_name: str):
            super().__init__()
            self.service_name = service_name

    class ServicesUpdated(Message):
        """Emitted when services data is refreshed."""
        def __init__(self, service_count: int, healthy_count: int):
            super().__init__()
            self.service_count = service_count
            self.healthy_count = healthy_count

    # Reactive properties
    services: reactive[Dict[str, ServiceHealth]] = reactive(dict, always_update=True)

    def __init__(
        self,
        api_client: Optional[Any] = None,
        refresh_interval: float = 2.0,
        id: Optional[str] = None,
        classes: Optional[str] = None,
    ):
        """
        Initialize services grid widget.

        Args:
            api_client: MAP2 API client for fetching service data
            refresh_interval: Auto-refresh interval in seconds
            id: Widget ID
            classes: CSS classes
        """
        super().__init__(id=id, classes=classes)
        self._api_client = api_client
        self._refresh_interval = refresh_interval
        self._services: Dict[str, ServiceHealth] = {}
        self._service_cards: Dict[str, ServiceCardWidget] = {}
        self._refresh_task: Optional[asyncio.Task] = None

    def compose(self) -> ComposeResult:
        """Compose the grid layout."""
        # Header with summary
        yield Label(self._render_header(), id="grid-header", classes="grid-header")

        # Scrollable container with service cards
        with ScrollableContainer(classes="services-scroll"):
            with Container(classes="grid-container"):
                # Create cards for known services
                for service_name in self._get_default_services():
                    service = self._services.get(
                        service_name,
                        ServiceHealth(name=service_name, status=HealthStatus.OFFLINE)
                    )
                    card = ServiceCardWidget(
                        service=service,
                        id=f"service-{service_name}",
                        classes="service-card"
                    )
                    self._service_cards[service_name] = card
                    yield card

    def _get_default_services(self) -> List[str]:
        """Get list of default service names."""
        return [
            "database",
            "plugin_loader",
            "juce_engine",
            "midi_engine",
            "command_queue",
            "websocket_manager",
            "meter_broadcaster",
            "event_publisher",
            "folder_scanner",
            "rt_monitor",
            "plugin_profiler",
            "lcd_display",
            "metrics_collector",
        ]

    def _render_header(self) -> str:
        """Render the header with summary."""
        total = len(self._services) if self._services else len(self._get_default_services())
        healthy = sum(
            1 for s in self._services.values()
            if s.status == HealthStatus.HEALTHY
        )

        # Status indicator
        if healthy == total:
            status = "[#10B981]HEALTHY[/]"
        elif healthy >= total * 0.8:
            status = "[#F59E0B]DEGRADED[/]"
        else:
            status = "[#EF4444]CRITICAL[/]"

        return f"SERVICES ({healthy}/{total} healthy) {status}"

    async def on_mount(self) -> None:
        """Start refresh loop when mounted."""
        self._refresh_task = asyncio.create_task(self._refresh_loop())

    async def on_unmount(self) -> None:
        """Stop refresh loop when unmounted."""
        if self._refresh_task:
            self._refresh_task.cancel()
            try:
                await self._refresh_task
            except asyncio.CancelledError:
                pass

    async def _refresh_loop(self) -> None:
        """Periodically refresh service data."""
        while True:
            try:
                await self.refresh_services()
                await asyncio.sleep(self._refresh_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error refreshing services: {e}")
                await asyncio.sleep(self._refresh_interval)

    async def refresh_services(self) -> None:
        """Fetch and update service data from API."""
        if not self._api_client:
            return

        try:
            result = await self._api_client.get_monitored_services()
            if result.success and result.data:
                self._update_services(result.data)
        except Exception as e:
            logger.error(f"Failed to fetch services: {e}")

    def _update_services(self, data: Any) -> None:
        """
        Update services from API response.

        Args:
            data: API response data (list of service dicts)
        """
        if isinstance(data, dict) and "services" in data:
            services_list = data["services"]
        elif isinstance(data, list):
            services_list = data
        else:
            return

        for service_data in services_list:
            name = service_data.get("name", "")
            if not name:
                continue

            # Parse service data into ServiceHealth
            service = ServiceHealth(
                name=name,
                status=service_data.get("status", HealthStatus.OFFLINE),
                latency_ms=service_data.get("latency_ms", 0.0),
                uptime_percent=service_data.get("uptime_percent", 0.0),
                error_count=service_data.get("error_count", 0),
                circuit_state=service_data.get("circuit_state", CircuitState.CLOSED),
                failure_count=service_data.get("failure_count", 0),
                failure_threshold=service_data.get("failure_threshold", 5),
            )

            # Parse latency history if available
            if "latency_history" in service_data:
                service.latency_history = service_data["latency_history"]

            self._services[name] = service

            # Update card if it exists
            if name in self._service_cards:
                self._service_cards[name].update_service(service)

        # Update header
        try:
            header = self.query_one("#grid-header", Label)
            header.update(self._render_header())
        except Exception:
            pass

        # Emit update message
        healthy_count = sum(
            1 for s in self._services.values()
            if s.status == HealthStatus.HEALTHY
        )
        self.post_message(self.ServicesUpdated(
            service_count=len(self._services),
            healthy_count=healthy_count
        ))

    def update_service(self, service: ServiceHealth) -> None:
        """
        Update a single service (for WebSocket updates).

        Args:
            service: Updated service health data
        """
        self._services[service.name] = service
        if service.name in self._service_cards:
            self._service_cards[service.name].update_service(service)

        # Update header
        try:
            header = self.query_one("#grid-header", Label)
            header.update(self._render_header())
        except Exception:
            pass

    def on_service_card_widget_selected(self, message: ServiceCardWidget.Selected) -> None:
        """Handle service card selection."""
        self.post_message(self.ServiceSelected(message.service_name))

    def get_service(self, name: str) -> Optional[ServiceHealth]:
        """Get service health data by name."""
        return self._services.get(name)

    def get_all_services(self) -> Dict[str, ServiceHealth]:
        """Get all service health data."""
        return self._services.copy()

    @property
    def healthy_count(self) -> int:
        """Get count of healthy services."""
        return sum(
            1 for s in self._services.values()
            if s.status == HealthStatus.HEALTHY
        )

    @property
    def total_count(self) -> int:
        """Get total count of services."""
        return len(self._services) or len(self._get_default_services())

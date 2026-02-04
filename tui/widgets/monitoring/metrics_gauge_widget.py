"""
Metrics Gauge Widget for Backend Services Monitoring TUI
========================================================
Real-time system metrics with native Textual widgets.

Layout:
+----------------------------------+
|  SYSTEM METRICS                  |
|                                  |
|  CPU    [████████░░] 42%  ▅▆▇▆▅  |
|  Memory [██████░░░░] 31%  ▃▃▄▄▅  |
|  Disk   [████░░░░░░] 22%  ▁▁▁▁▁  |
|                                  |
|  Latency: 2.3ms avg (p99: 8.1ms) |
|  Requests: 1,234/min             |
|  Connections: 5 active           |
+----------------------------------+
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List, Dict, Any
import asyncio
import logging

try:
    from textual.app import ComposeResult
    from textual.containers import Vertical, Horizontal
    from textual.widgets import Static, Label, ProgressBar, Sparkline, Rule, LoadingIndicator
    from textual.reactive import reactive
    TEXTUAL_AVAILABLE = True
except ImportError:
    TEXTUAL_AVAILABLE = False
    Static = object

logger = logging.getLogger(__name__)


@dataclass
class SystemMetrics:
    """System metrics data model."""
    cpu_percent: float = 0.0
    memory_percent: float = 0.0
    disk_percent: float = 0.0
    latency_avg_ms: float = 0.0
    latency_p99_ms: float = 0.0
    requests_per_min: int = 0
    active_connections: int = 0
    cpu_history: Optional[List[float]] = None
    memory_history: Optional[List[float]] = None
    disk_history: Optional[List[float]] = None
    latency_history: Optional[List[float]] = None
    timestamp: Optional[datetime] = None


class MetricRow(Static):
    """Single metric row with progress bar and sparkline."""

    DEFAULT_CSS = """
    MetricRow {
        width: 100%;
        height: 2;
        layout: horizontal;
        align: left middle;
    }

    MetricRow .metric-label {
        width: 5;
        text-style: bold;
    }

    MetricRow ProgressBar {
        width: 14;
        margin: 0 1;
    }

    MetricRow .metric-value {
        width: 6;
        text-align: right;
    }

    MetricRow Sparkline {
        width: 12;
        height: 1;
        margin-left: 1;
    }

    MetricRow .metric-good { color: #10B981; }
    MetricRow .metric-warn { color: #F59E0B; }
    MetricRow .metric-crit { color: #EF4444; }
    """

    def __init__(
        self,
        label: str,
        warn_threshold: float = 70,
        crit_threshold: float = 90,
        id: Optional[str] = None,
    ):
        super().__init__(id=id)
        self._label = label
        self._warn_threshold = warn_threshold
        self._crit_threshold = crit_threshold
        self._value = 0.0
        self._history: List[float] = []

    def compose(self) -> ComposeResult:
        """Compose the metric row."""
        yield Label(self._label, classes="metric-label")
        yield ProgressBar(total=100, show_eta=False, show_percentage=False, id=f"{self.id}-progress")
        yield Label("0%", id=f"{self.id}-value", classes="metric-value")
        yield Sparkline(data=[], id=f"{self.id}-spark")

    def update_value(self, value: float, history: Optional[List[float]] = None) -> None:
        """Update the metric value and history."""
        self._value = value
        if history:
            self._history = history[-30:]  # Keep last 30 samples
        else:
            self._history.append(value)
            if len(self._history) > 30:
                self._history = self._history[-30:]

        try:
            # Update progress bar
            progress = self.query_one(f"#{self.id}-progress", ProgressBar)
            progress.update(progress=value)

            # Update value label with color
            value_label = self.query_one(f"#{self.id}-value", Label)
            value_label.update(f"{value:.0f}%")

            # Apply color classes
            value_label.remove_class("metric-good", "metric-warn", "metric-crit")
            if value >= self._crit_threshold:
                value_label.add_class("metric-crit")
            elif value >= self._warn_threshold:
                value_label.add_class("metric-warn")
            else:
                value_label.add_class("metric-good")

            # Update sparkline
            sparkline = self.query_one(f"#{self.id}-spark", Sparkline)
            sparkline.data = self._history
        except Exception as e:
            logger.debug(f"Error updating metric row: {e}")


class MetricsGaugeWidget(Static):
    """
    System metrics display with native Textual widgets.

    Features:
    - CPU, Memory, Disk usage with ProgressBar
    - Native Sparkline for trend visualization
    - Color-coded thresholds (green/yellow/red)
    - Additional metrics (latency, requests, connections)
    - LoadingIndicator during initial fetch
    - Auto-refresh from API
    """

    DEFAULT_CSS = """
    MetricsGaugeWidget {
        width: 100%;
        height: auto;
        background: $surface;
        padding: 1;
        border: round $primary-darken-2;
    }

    MetricsGaugeWidget .metrics-title {
        width: 100%;
        height: 1;
        text-style: bold;
        margin-bottom: 1;
        color: $text;
    }

    MetricsGaugeWidget .metrics-loading {
        width: 100%;
        height: 3;
        align: center middle;
    }

    MetricsGaugeWidget .extra-metrics {
        width: 100%;
        height: auto;
        margin-top: 1;
    }

    MetricsGaugeWidget .extra-row {
        width: 100%;
        height: 1;
        layout: horizontal;
    }

    MetricsGaugeWidget .extra-label {
        width: 5;
        text-style: bold;
    }

    MetricsGaugeWidget .extra-value {
        width: auto;
    }

    MetricsGaugeWidget .latency-good { color: #10B981; }
    MetricsGaugeWidget .latency-warn { color: #F59E0B; }
    MetricsGaugeWidget .latency-crit { color: #EF4444; }
    """

    # Thresholds for color coding
    CPU_WARN = 70
    CPU_CRIT = 90
    MEM_WARN = 80
    MEM_CRIT = 95
    DISK_WARN = 80
    DISK_CRIT = 95
    LATENCY_WARN = 20  # ms
    LATENCY_CRIT = 50  # ms

    def __init__(
        self,
        api_client: Optional[Any] = None,
        refresh_interval: float = 2.0,
        id: Optional[str] = None,
        classes: Optional[str] = None,
    ):
        """
        Initialize metrics gauge widget.

        Args:
            api_client: MAP2 API client
            refresh_interval: Auto-refresh interval in seconds
            id: Widget ID
            classes: CSS classes
        """
        super().__init__(id=id, classes=classes)
        self._api_client = api_client
        self._refresh_interval = refresh_interval
        self._metrics = SystemMetrics()
        self._refresh_task: Optional[asyncio.Task] = None
        self._loading = True

    def compose(self) -> ComposeResult:
        """Compose the widget layout with native widgets."""
        yield Label("📊 SYSTEM METRICS", classes="metrics-title")
        yield LoadingIndicator(id="metrics-loading", classes="metrics-loading")

        with Vertical(id="metrics-content"):
            yield MetricRow("CPU", self.CPU_WARN, self.CPU_CRIT, id="cpu-row")
            yield MetricRow("MEM", self.MEM_WARN, self.MEM_CRIT, id="mem-row")
            yield MetricRow("DISK", self.DISK_WARN, self.DISK_CRIT, id="disk-row")

            yield Rule(line_style="heavy")

            with Vertical(classes="extra-metrics"):
                with Horizontal(classes="extra-row"):
                    yield Label("LAT", classes="extra-label")
                    yield Label("-- ms avg", id="latency-value", classes="extra-value")

                with Horizontal(classes="extra-row"):
                    yield Label("REQ", classes="extra-label")
                    yield Label("--/min", id="requests-value", classes="extra-value")

                with Horizontal(classes="extra-row"):
                    yield Label("CONN", classes="extra-label")
                    yield Label("-- active", id="connections-value", classes="extra-value")

    async def on_mount(self) -> None:
        """Start refresh loop when mounted."""
        # Hide content initially
        try:
            content = self.query_one("#metrics-content")
            content.display = False
        except Exception:
            pass

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
        """Periodically refresh metrics data."""
        while True:
            try:
                await self.refresh_metrics()
                await asyncio.sleep(self._refresh_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error refreshing metrics: {e}")
                await asyncio.sleep(self._refresh_interval)

    async def refresh_metrics(self) -> None:
        """Fetch and update metrics from API."""
        if not self._api_client:
            return

        try:
            result = await self._api_client.get_current_metrics()
            if result.success and result.data:
                self._update_metrics(result.data)
        except Exception as e:
            logger.error(f"Failed to fetch metrics: {e}")

    def _update_metrics(self, data: Dict[str, Any]) -> None:
        """Update metrics from API response."""
        # Hide loading indicator on first update
        if self._loading:
            self._loading = False
            try:
                loading = self.query_one("#metrics-loading", LoadingIndicator)
                loading.display = False
                content = self.query_one("#metrics-content")
                content.display = True
            except Exception:
                pass

        # Extract nested data if present
        if "metrics" in data:
            data = data["metrics"]

        # Update metrics
        self._metrics.cpu_percent = data.get("cpu_percent", data.get("cpu", {}).get("percent", 0.0))
        self._metrics.memory_percent = data.get("memory_percent", data.get("memory", {}).get("percent", 0.0))
        self._metrics.disk_percent = data.get("disk_percent", data.get("disk", {}).get("percent", 0.0))
        self._metrics.latency_avg_ms = data.get("latency_avg_ms", data.get("latency", {}).get("avg_ms", 0.0))
        self._metrics.latency_p99_ms = data.get("latency_p99_ms", data.get("latency", {}).get("p99_ms", 0.0))
        self._metrics.requests_per_min = data.get("requests_per_min", 0)
        self._metrics.active_connections = data.get("active_connections", 0)

        # Update history if available
        if "cpu_history" in data:
            self._metrics.cpu_history = data["cpu_history"]
        if "memory_history" in data:
            self._metrics.memory_history = data["memory_history"]
        if "latency_history" in data:
            self._metrics.latency_history = data["latency_history"]

        # Update display
        self._update_display()

    def _update_display(self) -> None:
        """Update the widget display."""
        try:
            # Update CPU row
            cpu_row = self.query_one("#cpu-row", MetricRow)
            cpu_row.update_value(self._metrics.cpu_percent, self._metrics.cpu_history)

            # Update Memory row
            mem_row = self.query_one("#mem-row", MetricRow)
            mem_row.update_value(self._metrics.memory_percent, self._metrics.memory_history)

            # Update Disk row
            disk_row = self.query_one("#disk-row", MetricRow)
            disk_row.update_value(self._metrics.disk_percent, self._metrics.disk_history)

            # Update latency with color coding
            latency_label = self.query_one("#latency-value", Label)
            latency_text = f"{self._metrics.latency_avg_ms:.1f}ms avg (p99: {self._metrics.latency_p99_ms:.1f}ms)"
            latency_label.update(latency_text)

            latency_label.remove_class("latency-good", "latency-warn", "latency-crit")
            if self._metrics.latency_avg_ms >= self.LATENCY_CRIT:
                latency_label.add_class("latency-crit")
            elif self._metrics.latency_avg_ms >= self.LATENCY_WARN:
                latency_label.add_class("latency-warn")
            else:
                latency_label.add_class("latency-good")

            # Update requests
            req_label = self.query_one("#requests-value", Label)
            req_label.update(f"{self._metrics.requests_per_min:,}/min")

            # Update connections
            conn_label = self.query_one("#connections-value", Label)
            conn_label.update(f"{self._metrics.active_connections} active")

        except Exception as e:
            logger.debug(f"Error updating display: {e}")

    def update_metrics(self, metrics: SystemMetrics) -> None:
        """
        Update metrics directly (for WebSocket updates).

        Args:
            metrics: New metrics data
        """
        self._metrics = metrics
        self._update_display()

    def add_cpu_sample(self, value: float) -> None:
        """Add a CPU sample to history."""
        if self._metrics.cpu_history is None:
            self._metrics.cpu_history = []
        self._metrics.cpu_history.append(value)
        if len(self._metrics.cpu_history) > 60:
            self._metrics.cpu_history = self._metrics.cpu_history[-60:]
        self._metrics.cpu_percent = value
        self._update_display()

    def add_memory_sample(self, value: float) -> None:
        """Add a memory sample to history."""
        if self._metrics.memory_history is None:
            self._metrics.memory_history = []
        self._metrics.memory_history.append(value)
        if len(self._metrics.memory_history) > 60:
            self._metrics.memory_history = self._metrics.memory_history[-60:]
        self._metrics.memory_percent = value
        self._update_display()

    @property
    def metrics(self) -> SystemMetrics:
        """Get current metrics."""
        return self._metrics

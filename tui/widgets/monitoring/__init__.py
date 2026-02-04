"""
Monitoring Widgets for Backend Services TUI
============================================
World-class visualization components for service health monitoring.

Each widget is imported separately to prevent cascade failures.
"""

import logging

logger = logging.getLogger(__name__)

# Isolated imports to prevent cascade failures
# Each widget can fail independently without affecting others

# Sparkline widget
try:
    from .sparkline_widget import (
        SparklineWidget,
        render_sparkline,
        render_progress_bar,
        render_status_bar,
    )
except ImportError as e:
    logger.warning(f"Could not import sparkline_widget: {e}")
    SparklineWidget = None
    render_sparkline = lambda *args, **kwargs: "---"
    render_progress_bar = lambda *args, **kwargs: "[------]"
    render_status_bar = lambda *args, **kwargs: "[------]"

# Service card widget
try:
    from .service_card_widget import (
        ServiceCardWidget,
        ServiceCardCompact,
        ServiceHealth,
        HealthStatus,
        CircuitState,
    )
except ImportError as e:
    logger.warning(f"Could not import service_card_widget: {e}")
    ServiceCardWidget = None
    ServiceCardCompact = None
    # Provide minimal data classes
    class HealthStatus:
        HEALTHY = "HEALTHY"
        DEGRADED = "DEGRADED"
        CRITICAL = "CRITICAL"
        OFFLINE = "OFFLINE"

    class CircuitState:
        CLOSED = "CLOSED"
        OPEN = "OPEN"
        HALF_OPEN = "HALF_OPEN"

    class ServiceHealth:
        def __init__(self, name="", status=HealthStatus.OFFLINE, **kwargs):
            self.name = name
            self.status = status
            for k, v in kwargs.items():
                setattr(self, k, v)

# Services grid widget
try:
    from .services_grid_widget import ServicesGridWidget
except ImportError as e:
    logger.warning(f"Could not import services_grid_widget: {e}")
    ServicesGridWidget = None

# Metrics gauge widget
try:
    from .metrics_gauge_widget import MetricsGaugeWidget, SystemMetrics
except ImportError as e:
    logger.warning(f"Could not import metrics_gauge_widget: {e}")
    MetricsGaugeWidget = None
    class SystemMetrics:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

# Alert list widget
try:
    from .alert_list_widget import AlertListWidget, Alert, AlertSeverity
except ImportError as e:
    logger.warning(f"Could not import alert_list_widget: {e}")
    AlertListWidget = None
    class AlertSeverity:
        CRITICAL = "CRITICAL"
        WARNING = "WARNING"
        INFO = "INFO"
    class Alert:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

# Circuit breaker widget
try:
    from .circuit_breaker_widget import (
        CircuitBreakerWidget,
        CircuitBreakerStatus,
        CircuitState as CBCircuitState,
    )
except ImportError as e:
    logger.warning(f"Could not import circuit_breaker_widget: {e}")
    CircuitBreakerWidget = None
    CircuitBreakerStatus = None
    CBCircuitState = CircuitState

# Dependency graph widget
try:
    from .dependency_graph_widget import DependencyGraphWidget, ServiceNode
except ImportError as e:
    logger.warning(f"Could not import dependency_graph_widget: {e}")
    DependencyGraphWidget = None
    class ServiceNode:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

# Log stream widget
try:
    from .log_stream_widget import LogStreamWidget, LogEntry, LogLevel
except ImportError as e:
    logger.warning(f"Could not import log_stream_widget: {e}")
    LogStreamWidget = None
    class LogLevel:
        DEBUG = "DEBUG"
        INFO = "INFO"
        WARNING = "WARNING"
        ERROR = "ERROR"
    class LogEntry:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

__all__ = [
    # Sparkline
    "SparklineWidget",
    "render_sparkline",
    "render_progress_bar",
    "render_status_bar",
    # Service Card
    "ServiceCardWidget",
    "ServiceCardCompact",
    "ServiceHealth",
    "HealthStatus",
    "CircuitState",
    # Services Grid
    "ServicesGridWidget",
    # Metrics
    "MetricsGaugeWidget",
    "SystemMetrics",
    # Alerts
    "AlertListWidget",
    "Alert",
    "AlertSeverity",
    # Circuit Breaker
    "CircuitBreakerWidget",
    "CircuitBreakerStatus",
    "CBCircuitState",
    # Dependencies
    "DependencyGraphWidget",
    "ServiceNode",
    # Logs
    "LogStreamWidget",
    "LogEntry",
    "LogLevel",
]

"""
Health Monitoring System for MAP2 Audio Platform

Comprehensive health tracking for all services with:
- Real-time service status monitoring
- Historical metrics retention
- Alert generation
- Dependency tracking
- WebSocket integration for live updates
"""

import asyncio
import logging
import psutil
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field, asdict
from enum import Enum
import json

from app.utils.singleton import Singleton
from app.utils.logging_utils import get_logger

logger = get_logger(__name__)


class HealthStatus(Enum):
    """Health status levels for services."""
    HEALTHY = "healthy"              # All metrics normal
    DEGRADED = "degraded"            # Operating but with issues
    CRITICAL = "critical"            # Major problems
    OFFLINE = "offline"              # Service unavailable


@dataclass
class ServiceMetrics:
    """Metrics snapshot for a service."""
    service_name: str
    timestamp: datetime = field(default_factory=datetime.now)
    status: HealthStatus = HealthStatus.HEALTHY
    response_time_ms: float = 0.0
    error_rate: float = 0.0              # 0.0 to 1.0
    success_rate: float = 1.0            # 0.0 to 1.0
    request_count: int = 0
    error_count: int = 0
    memory_mb: float = 0.0
    cpu_percent: float = 0.0
    uptime_seconds: float = 0.0
    last_error: Optional[str] = None
    dependencies: Dict[str, HealthStatus] = field(default_factory=dict)
    custom_metrics: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary, handling datetime and enum serialization."""
        data = asdict(self)
        data['timestamp'] = self.timestamp.isoformat()
        data['status'] = self.status.value
        data['dependencies'] = {k: v.value for k, v in self.dependencies.items()}
        return data


@dataclass
class AlertRule:
    """Rule for generating alerts when thresholds exceeded."""
    name: str
    metric: str                    # 'error_rate', 'response_time_ms', 'memory_mb', 'cpu_percent'
    threshold: float
    comparison: str = ">"          # '>', '<', '>=', '<=', '==', '!='
    duration_seconds: int = 60     # Alert if condition true for this long
    severity: str = "warning"      # 'info', 'warning', 'critical'
    enabled: bool = True


@dataclass
class Alert:
    """Alert generated when threshold exceeded."""
    alert_rule_name: str
    service_name: str
    metric: str
    value: float
    threshold: float
    timestamp: datetime = field(default_factory=datetime.now)
    severity: str = "warning"
    message: str = ""


class HealthMonitor(Singleton):
    """
    Centralized health monitoring system.
    
    Tracks service health, collects metrics, generates alerts,
    and provides historical data for dashboards.
    """
    
    def __init__(self, history_retention_hours: int = 24,
                 check_interval_seconds: int = 30,
                 max_history_points: int = 1440):
        """
        Initialize health monitor.
        
        Args:
            history_retention_hours: How long to keep historical data
            check_interval_seconds: How often to collect metrics
            max_history_points: Max data points per service (~1 day at 1-min intervals)
        """
        super().__init__()
        self.services: Dict[str, ServiceMetrics] = {}
        self.service_history: Dict[str, List[ServiceMetrics]] = {}
        self.active_alerts: Dict[str, List[Alert]] = {}
        
        self.alert_rules: List[AlertRule] = []
        self._alert_history: List[Alert] = []
        
        self.history_retention_hours = history_retention_hours
        self.check_interval_seconds = check_interval_seconds
        self.max_history_points = max_history_points
        
        self._monitoring_task: Optional[asyncio.Task] = None
        self._health_check_functions: Dict[str, Callable] = {}
        self._lock = asyncio.Lock()
        
        self._started_at = datetime.now()
        
        # Default alert rules
        self._init_default_alert_rules()
    
    def _init_default_alert_rules(self):
        """Initialize default alert rules."""
        self.alert_rules = [
            AlertRule(
                name="high_error_rate",
                metric="error_rate",
                threshold=0.1,  # 10%
                comparison=">",
                duration_seconds=60,
                severity="warning"
            ),
            AlertRule(
                name="high_response_time",
                metric="response_time_ms",
                threshold=1000.0,  # 1 second
                comparison=">",
                duration_seconds=60,
                severity="warning"
            ),
            AlertRule(
                name="high_memory_usage",
                metric="memory_mb",
                threshold=500.0,  # 500MB
                comparison=">",
                duration_seconds=300,
                severity="warning"
            ),
            AlertRule(
                name="high_cpu_usage",
                metric="cpu_percent",
                threshold=80.0,  # 80%
                comparison=">",
                duration_seconds=300,
                severity="warning"
            ),
            AlertRule(
                name="service_offline",
                metric="status",
                threshold=HealthStatus.OFFLINE.value,
                comparison="==",
                duration_seconds=10,
                severity="critical"
            ),
        ]
    
    def register_health_check(self, service_name: str, 
                             check_func: Callable[[], asyncio.coroutine]) -> None:
        """
        Register a health check function for a service.
        
        Args:
            service_name: Name of the service
            check_func: Async function that returns ServiceMetrics
        """
        self._health_check_functions[service_name] = check_func
        logger.info(f"Registered health check for {service_name}")
    
    async def start_monitoring(self) -> None:
        """Start background health monitoring task."""
        if self._monitoring_task is None or self._monitoring_task.done():
            self._monitoring_task = asyncio.create_task(self._monitoring_loop())
            logger.info("Health monitoring started")
    
    async def stop_monitoring(self) -> None:
        """Stop background health monitoring task."""
        if self._monitoring_task and not self._monitoring_task.done():
            self._monitoring_task.cancel()
            try:
                await self._monitoring_task
            except asyncio.CancelledError:
                pass
            logger.info("Health monitoring stopped")
    
    async def _monitoring_loop(self) -> None:
        """Background task that periodically collects health metrics."""
        try:
            while True:
                await asyncio.sleep(self.check_interval_seconds)
                await self._collect_metrics()
                await self._check_alert_rules()
        except asyncio.CancelledError:
            pass
    
    async def _collect_metrics(self) -> None:
        """Collect metrics from all registered services."""
        try:
            for service_name, check_func in self._health_check_functions.items():
                try:
                    metrics = await check_func()
                    
                    async with self._lock:
                        self.services[service_name] = metrics
                        
                        # Add to history
                        if service_name not in self.service_history:
                            self.service_history[service_name] = []
                        
                        self.service_history[service_name].append(metrics)
                        
                        # Trim history if too large
                        if len(self.service_history[service_name]) > self.max_history_points:
                            self.service_history[service_name] = \
                                self.service_history[service_name][-self.max_history_points:]
                
                except Exception as e:
                    logger.error(f"Error collecting metrics for {service_name}: {e}")
                    
                    # Mark service as offline
                    async with self._lock:
                        self.services[service_name] = ServiceMetrics(
                            service_name=service_name,
                            status=HealthStatus.OFFLINE,
                            last_error=str(e)
                        )
        
        except Exception as e:
            logger.error(f"Error in metrics collection loop: {e}")
    
    async def _check_alert_rules(self) -> None:
        """Check alert rules against current metrics."""
        async with self._lock:
            for rule in self.alert_rules:
                if not rule.enabled:
                    continue
                
                for service_name, metrics in self.services.items():
                    if self._rule_triggered(rule, metrics):
                        # Create alert
                        alert = Alert(
                            alert_rule_name=rule.name,
                            service_name=service_name,
                            metric=rule.metric,
                            value=getattr(metrics, rule.metric, 0),
                            threshold=rule.threshold,
                            severity=rule.severity,
                            message=f"{rule.name} triggered for {service_name}"
                        )
                        
                        # Add to active alerts
                        if service_name not in self.active_alerts:
                            self.active_alerts[service_name] = []
                        
                        self.active_alerts[service_name].append(alert)
                        self._alert_history.append(alert)
                        
                        logger.warning(f"Alert: {alert.message}")
    
    def _rule_triggered(self, rule: AlertRule, metrics: ServiceMetrics) -> bool:
        """Check if an alert rule is triggered."""
        try:
            if rule.metric == "status":
                # Special handling for status metric
                metric_value = metrics.status.value
                threshold_value = rule.threshold
            else:
                metric_value = getattr(metrics, rule.metric, 0)
                threshold_value = rule.threshold
            
            # Evaluate comparison
            if rule.comparison == ">":
                return metric_value > threshold_value
            elif rule.comparison == "<":
                return metric_value < threshold_value
            elif rule.comparison == ">=":
                return metric_value >= threshold_value
            elif rule.comparison == "<=":
                return metric_value <= threshold_value
            elif rule.comparison == "==":
                return metric_value == threshold_value
            elif rule.comparison == "!=":
                return metric_value != threshold_value
        
        except Exception as e:
            logger.error(f"Error evaluating alert rule {rule.name}: {e}")
        
        return False
    
    def update_service_metrics(self, metrics: ServiceMetrics) -> None:
        """Manually update metrics for a service (non-blocking)."""
        self.services[metrics.service_name] = metrics
        
        if metrics.service_name not in self.service_history:
            self.service_history[metrics.service_name] = []
        
        self.service_history[metrics.service_name].append(metrics)
    
    def get_overall_status(self) -> HealthStatus:
        """Get overall system health status."""
        if not self.services:
            return HealthStatus.HEALTHY
        
        # Determine overall status
        if any(m.status == HealthStatus.OFFLINE for m in self.services.values()):
            return HealthStatus.CRITICAL
        elif any(m.status == HealthStatus.CRITICAL for m in self.services.values()):
            return HealthStatus.CRITICAL
        elif any(m.status == HealthStatus.DEGRADED for m in self.services.values()):
            return HealthStatus.DEGRADED
        else:
            return HealthStatus.HEALTHY
    
    def get_service_status(self, service_name: str) -> Optional[ServiceMetrics]:
        """Get current status of a specific service."""
        return self.services.get(service_name)
    
    def get_all_services_status(self) -> Dict[str, ServiceMetrics]:
        """Get status of all services."""
        return self.services.copy()
    
    def get_service_history(self, service_name: str, 
                           hours: int = 1) -> List[ServiceMetrics]:
        """Get historical metrics for a service."""
        if service_name not in self.service_history:
            return []
        
        cutoff = datetime.now() - timedelta(hours=hours)
        return [m for m in self.service_history[service_name] 
                if m.timestamp >= cutoff]
    
    def get_active_alerts(self, service_name: Optional[str] = None) -> List[Alert]:
        """Get active alerts."""
        if service_name:
            return self.active_alerts.get(service_name, [])
        
        alerts = []
        for service_alerts in self.active_alerts.values():
            alerts.extend(service_alerts)
        return alerts
    
    def get_alert_history(self, limit: int = 100) -> List[Alert]:
        """Get recent alert history."""
        return self._alert_history[-limit:]
    
    def acknowledge_alert(self, alert: Alert) -> None:
        """Remove/acknowledge an alert."""
        if alert.service_name in self.active_alerts:
            self.active_alerts[alert.service_name] = [
                a for a in self.active_alerts[alert.service_name]
                if a.timestamp != alert.timestamp
            ]
    
    def get_system_health_summary(self) -> Dict[str, Any]:
        """Get comprehensive system health summary for dashboards."""
        overall = self.get_overall_status()
        
        return {
            'timestamp': datetime.now().isoformat(),
            'overall_status': overall.value,
            'uptime_seconds': (datetime.now() - self._started_at).total_seconds(),
            'service_count': len(self.services),
            'healthy_count': sum(1 for m in self.services.values() 
                                if m.status == HealthStatus.HEALTHY),
            'degraded_count': sum(1 for m in self.services.values() 
                                 if m.status == HealthStatus.DEGRADED),
            'critical_count': sum(1 for m in self.services.values() 
                                 if m.status == HealthStatus.CRITICAL),
            'offline_count': sum(1 for m in self.services.values() 
                                if m.status == HealthStatus.OFFLINE),
            'active_alerts_count': len(self.get_active_alerts()),
            'services': {
                name: {
                    'status': m.status.value,
                    'response_time_ms': m.response_time_ms,
                    'error_rate': m.error_rate,
                    'memory_mb': m.memory_mb,
                    'cpu_percent': m.cpu_percent,
                    'uptime_seconds': m.uptime_seconds,
                    'last_error': m.last_error
                }
                for name, m in self.services.items()
            },
            'active_alerts': [
                {
                    'service': a.service_name,
                    'rule': a.alert_rule_name,
                    'severity': a.severity,
                    'message': a.message,
                    'timestamp': a.timestamp.isoformat()
                }
                for a in self.get_active_alerts()
            ]
        }
    
    def get_dependency_graph(self) -> Dict[str, Any]:
        """Get service dependency graph."""
        graph = {}
        
        for service_name, metrics in self.services.items():
            graph[service_name] = {
                'status': metrics.status.value,
                'dependencies': {
                    dep_name: dep_status.value
                    for dep_name, dep_status in metrics.dependencies.items()
                },
                'dependent_services': []
            }
        
        # Find which services depend on each service
        for service_name, metrics in self.services.items():
            for dep_name in metrics.dependencies:
                if dep_name in graph:
                    graph[dep_name]['dependent_services'].append(service_name)
        
        return graph


def get_health_monitor() -> HealthMonitor:
    """Get global health monitor instance (singleton)."""
    return HealthMonitor.get_instance()

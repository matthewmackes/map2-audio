"""
MAP2 Audio Cluster - Prometheus Metrics Exporter

Exports cluster metrics in Prometheus format for monitoring and alerting.
Supports custom metric registration and real-time metric collection.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Callable, Any
from enum import Enum
import time
import logging
import threading
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


# ============================================================================
# Metric Types
# ============================================================================

class MetricType(str, Enum):
    """Prometheus metric types."""
    COUNTER = "counter"       # Only increases
    GAUGE = "gauge"           # Can increase or decrease
    HISTOGRAM = "histogram"   # Distribution of values
    SUMMARY = "summary"       # Quantiles


# ============================================================================
# Metric Definitions
# ============================================================================

@dataclass
class MetricDefinition:
    """Definition of a Prometheus metric."""
    name: str
    help_text: str
    metric_type: MetricType
    labels: List[str] = field(default_factory=list)
    unit: Optional[str] = None  # e.g., "seconds", "bytes", "percent"


class ClusterMetrics:
    """Metrics definitions for cluster monitoring."""
    
    # Node availability metrics
    NODES_TOTAL = MetricDefinition(
        name="map2_cluster_nodes_total",
        help_text="Total number of nodes in the cluster",
        metric_type=MetricType.GAUGE,
    )
    
    NODES_ONLINE = MetricDefinition(
        name="map2_cluster_nodes_online",
        help_text="Number of online (healthy) nodes",
        metric_type=MetricType.GAUGE,
    )
    
    NODES_OFFLINE = MetricDefinition(
        name="map2_cluster_nodes_offline",
        help_text="Number of offline (unhealthy) nodes",
        metric_type=MetricType.GAUGE,
    )
    
    NODE_UP = MetricDefinition(
        name="map2_cluster_node_up",
        help_text="Node availability (1=up, 0=down)",
        metric_type=MetricType.GAUGE,
        labels=["node_id", "hostname", "role"],
    )
    
    # Health metrics
    HEALTH_SCORE = MetricDefinition(
        name="map2_cluster_node_health_score",
        help_text="Node health score (0-100)",
        metric_type=MetricType.GAUGE,
        labels=["node_id", "hostname"],
        unit="percent",
    )
    
    CLUSTER_HEALTH_SCORE = MetricDefinition(
        name="map2_cluster_health_score",
        help_text="Overall cluster health score (0-100)",
        metric_type=MetricType.GAUGE,
        unit="percent",
    )
    
    # CPU metrics
    NODE_CPU_USAGE = MetricDefinition(
        name="map2_cluster_node_cpu_usage_percent",
        help_text="Node CPU usage percentage",
        metric_type=MetricType.GAUGE,
        labels=["node_id", "hostname"],
        unit="percent",
    )
    
    NODE_CPU_CORES = MetricDefinition(
        name="map2_cluster_node_cpu_cores",
        help_text="Number of CPU cores",
        metric_type=MetricType.GAUGE,
        labels=["node_id", "hostname"],
    )
    
    # Memory metrics
    NODE_MEMORY_USAGE = MetricDefinition(
        name="map2_cluster_node_memory_usage_bytes",
        help_text="Node memory usage in bytes",
        metric_type=MetricType.GAUGE,
        labels=["node_id", "hostname"],
        unit="bytes",
    )
    
    NODE_MEMORY_TOTAL = MetricDefinition(
        name="map2_cluster_node_memory_total_bytes",
        help_text="Node total memory in bytes",
        metric_type=MetricType.GAUGE,
        labels=["node_id", "hostname"],
        unit="bytes",
    )
    
    NODE_MEMORY_PERCENT = MetricDefinition(
        name="map2_cluster_node_memory_usage_percent",
        help_text="Node memory usage percentage",
        metric_type=MetricType.GAUGE,
        labels=["node_id", "hostname"],
        unit="percent",
    )
    
    # Audio metrics
    NODE_AUDIO_DSP_LOAD = MetricDefinition(
        name="map2_cluster_node_audio_dsp_load_percent",
        help_text="Node audio DSP load percentage",
        metric_type=MetricType.GAUGE,
        labels=["node_id", "hostname"],
        unit="percent",
    )
    
    NODE_XRUNS = MetricDefinition(
        name="map2_cluster_node_xruns_total",
        help_text="Total number of audio buffer underruns (xruns)",
        metric_type=MetricType.COUNTER,
        labels=["node_id", "hostname"],
    )
    
    NODE_XRUN_RATE = MetricDefinition(
        name="map2_cluster_node_xrun_rate_per_minute",
        help_text="Audio xrun rate per minute",
        metric_type=MetricType.GAUGE,
        labels=["node_id", "hostname"],
    )
    
    NODE_AUDIO_DEVICES = MetricDefinition(
        name="map2_cluster_node_audio_devices",
        help_text="Number of audio devices detected",
        metric_type=MetricType.GAUGE,
        labels=["node_id", "hostname"],
    )
    
    # Network metrics
    NODE_LATENCY = MetricDefinition(
        name="map2_cluster_network_latency_ms",
        help_text="Network latency to node in milliseconds",
        metric_type=MetricType.GAUGE,
        labels=["from_node", "to_node"],
        unit="milliseconds",
    )
    
    NODE_PACKET_LOSS = MetricDefinition(
        name="map2_cluster_network_packet_loss_percent",
        help_text="Network packet loss percentage",
        metric_type=MetricType.GAUGE,
        labels=["from_node", "to_node"],
        unit="percent",
    )
    
    # Update metrics
    UPDATE_OPERATIONS_TOTAL = MetricDefinition(
        name="map2_cluster_updates_total",
        help_text="Total number of update operations",
        metric_type=MetricType.COUNTER,
        labels=["status"],  # success, failed, cancelled
    )
    
    UPDATE_NODES_PENDING = MetricDefinition(
        name="map2_cluster_update_nodes_pending",
        help_text="Number of nodes pending updates",
        metric_type=MetricType.GAUGE,
    )
    
    UPDATE_SUCCESS_RATE = MetricDefinition(
        name="map2_cluster_update_success_rate",
        help_text="Update operation success rate (0-100)",
        metric_type=MetricType.GAUGE,
        unit="percent",
    )
    
    # Failover metrics
    FAILOVERS_TOTAL = MetricDefinition(
        name="map2_cluster_failovers_total",
        help_text="Total number of failover events",
        metric_type=MetricType.COUNTER,
    )
    
    FAILOVER_DURATION_SECONDS = MetricDefinition(
        name="map2_cluster_failover_duration_seconds",
        help_text="Failover operation duration in seconds",
        metric_type=MetricType.GAUGE,
        unit="seconds",
    )
    
    # Event metrics
    EVENTS_LOGGED_TOTAL = MetricDefinition(
        name="map2_cluster_events_logged_total",
        help_text="Total number of events logged",
        metric_type=MetricType.COUNTER,
        labels=["event_type"],
    )
    
    # Backup metrics
    BACKUP_OPERATIONS_TOTAL = MetricDefinition(
        name="map2_cluster_backups_total",
        help_text="Total number of backup operations",
        metric_type=MetricType.COUNTER,
        labels=["status"],  # success, failed
    )
    
    BACKUP_SIZE_BYTES = MetricDefinition(
        name="map2_cluster_backup_size_bytes",
        help_text="Size of latest backup in bytes",
        metric_type=MetricType.GAUGE,
        unit="bytes",
    )
    
    BACKUP_AGE_SECONDS = MetricDefinition(
        name="map2_cluster_backup_age_seconds",
        help_text="Age of latest backup in seconds",
        metric_type=MetricType.GAUGE,
        unit="seconds",
    )
    
    # Database metrics
    DATABASE_QUERIES_TOTAL = MetricDefinition(
        name="map2_cluster_database_queries_total",
        help_text="Total number of database queries",
        metric_type=MetricType.COUNTER,
    )
    
    DATABASE_QUERY_DURATION_MS = MetricDefinition(
        name="map2_cluster_database_query_duration_ms",
        help_text="Database query duration in milliseconds",
        metric_type=MetricType.HISTOGRAM,
        unit="milliseconds",
    )
    
    # API metrics
    API_REQUESTS_TOTAL = MetricDefinition(
        name="map2_cluster_api_requests_total",
        help_text="Total number of API requests",
        metric_type=MetricType.COUNTER,
        labels=["method", "endpoint", "status"],
    )
    
    API_REQUEST_DURATION_MS = MetricDefinition(
        name="map2_cluster_api_request_duration_ms",
        help_text="API request duration in milliseconds",
        metric_type=MetricType.HISTOGRAM,
        labels=["method", "endpoint"],
        unit="milliseconds",
    )
    
    # Uptime metrics
    CLUSTER_UPTIME_SECONDS = MetricDefinition(
        name="map2_cluster_uptime_seconds",
        help_text="Cluster uptime in seconds",
        metric_type=MetricType.GAUGE,
        unit="seconds",
    )
    
    NODE_UPTIME_SECONDS = MetricDefinition(
        name="map2_cluster_node_uptime_seconds",
        help_text="Node uptime in seconds",
        metric_type=MetricType.GAUGE,
        labels=["node_id", "hostname"],
        unit="seconds",
    )


# ============================================================================
# Metric Storage
# ============================================================================

@dataclass
class MetricValue:
    """Stored metric value with timestamp."""
    value: float
    timestamp: float
    labels: Dict[str, str] = field(default_factory=dict)


class MetricStorage:
    """In-memory storage for metrics."""
    
    def __init__(self):
        """Initialize metric storage."""
        self.metrics: Dict[str, List[MetricValue]] = {}
        self.lock = threading.RLock()
    
    def add_metric(self, metric_name: str, value: float, 
                   labels: Optional[Dict[str, str]] = None) -> None:
        """
        Add a metric value.
        
        Args:
            metric_name: Name of the metric
            value: Metric value
            labels: Optional label dictionary
        """
        with self.lock:
            if metric_name not in self.metrics:
                self.metrics[metric_name] = []
            
            self.metrics[metric_name].append(MetricValue(
                value=value,
                timestamp=time.time(),
                labels=labels or {}
            ))
    
    def get_metric(self, metric_name: str) -> Optional[List[MetricValue]]:
        """Get all values for a metric."""
        with self.lock:
            values = self.metrics.get(metric_name)
            return list(values) if values is not None else None
    
    def clear(self) -> None:
        """Clear all metrics."""
        with self.lock:
            self.metrics.clear()


# ============================================================================
# Prometheus Text Format Exporter
# ============================================================================

class PrometheusExporter:
    """Exports metrics in Prometheus text format."""
    
    def __init__(self):
        """Initialize exporter."""
        self.storage = MetricStorage()
        self.collectors: List[Callable[[], None]] = []
        self.targets: Dict[str, Dict[str, Any]] = {}
    
    def register_collector(self, collector: Callable[[], None]) -> None:
        """
        Register a collector function.
        
        Collector function should call add_metric() on the exporter.
        
        Args:
            collector: Callable that collects metrics
        """
        self.collectors.append(collector)
    
    def add_metric(self, metric_name: str, value: float,
                   labels: Optional[Dict[str, str]] = None) -> None:
        """Add a metric value."""
        self.storage.add_metric(metric_name, value, labels)
    
    def collect(self, clear: bool = True) -> None:
        """Run all registered custom collectors and gather metrics."""
        if clear:
            self.storage.clear()

        for collector in self.collectors:
            try:
                collector()
            except Exception as e:
                logger.error(f"Error in collector: {e}")

    def add_target(
        self,
        name: str,
        address: str,
        port: int = 8080,
        metrics_path: str = "/api/metrics/prometheus",
    ) -> None:
        """Register a scrape target for management-plane monitoring."""
        self.targets[name] = {
            "name": name,
            "address": address,
            "port": int(port),
            "metrics_path": metrics_path,
        }

    def get_targets(self) -> List[Dict[str, Any]]:
        """Return the currently registered scrape targets."""
        return list(self.targets.values())
    
    def generate_exposition(self) -> str:
        """
        Generate Prometheus text format exposition.
        
        Returns:
            Prometheus text format string
        """
        lines = []
        
        # Add header comment
        lines.append("# HELP cluster_metrics MAP2 Audio Cluster Metrics")
        lines.append("# TYPE cluster_metrics untyped")
        lines.append("")
        
        # Add metrics
        for metric_name, values in sorted(self.storage.metrics.items()):
            if not values:
                continue
            
            # Get latest value
            latest = values[-1]
            
            # Format metric line
            if latest.labels:
                # Format labels
                label_str = ", ".join(
                    f'{k}="{v}"' for k, v in sorted(latest.labels.items())
                )
                line = f"{metric_name}{{{label_str}}} {latest.value}"
            else:
                line = f"{metric_name} {latest.value}"
            
            # Add timestamp
            timestamp_ms = int(latest.timestamp * 1000)
            line += f" {timestamp_ms}"
            
            lines.append(line)
        
        return "\n".join(lines) + "\n"


# ============================================================================
# Cluster Metrics Collector
# ============================================================================

class ClusterMetricsCollector:
    """Collects cluster-wide metrics."""
    
    def __init__(self, exporter: PrometheusExporter,
                 get_node_data: Optional[Callable] = None,
                 get_health_data: Optional[Callable] = None,
                 get_update_data: Optional[Callable] = None):
        """
        Initialize collector.
        
        Args:
            exporter: Prometheus exporter instance
            get_node_data: Callable to get node data
            get_health_data: Callable to get health data
            get_update_data: Callable to get update data
        """
        self.exporter = exporter
        self.get_node_data = get_node_data or self._default_get_node_data
        self.get_health_data = get_health_data or self._default_get_health_data
        self.get_update_data = get_update_data or self._default_get_update_data
        self.start_time = time.time()
    
    def collect_all(self) -> None:
        """Collect all metrics."""
        self.collect_node_metrics()
        self.collect_health_metrics()
        self.collect_update_metrics()
        self.collect_uptime_metrics()
    
    def collect_node_metrics(self) -> None:
        """Collect node availability metrics."""
        nodes = self.get_node_data()
        
        if not nodes:
            self.exporter.add_metric(ClusterMetrics.NODES_TOTAL.name, 0)
            self.exporter.add_metric(ClusterMetrics.NODES_ONLINE.name, 0)
            self.exporter.add_metric(ClusterMetrics.NODES_OFFLINE.name, 0)
            return
        
        # Total nodes
        self.exporter.add_metric(
            ClusterMetrics.NODES_TOTAL.name,
            len(nodes)
        )
        
        # Count online/offline
        online_count = sum(1 for n in nodes if n.get("status") == "online")
        offline_count = len(nodes) - online_count
        
        self.exporter.add_metric(
            ClusterMetrics.NODES_ONLINE.name,
            online_count
        )
        self.exporter.add_metric(
            ClusterMetrics.NODES_OFFLINE.name,
            offline_count
        )
        
        # Per-node metrics
        for node in nodes:
            node_id = node.get("id", "unknown")
            hostname = node.get("hostname", "unknown")
            role = node.get("role", "unknown")
            status = node.get("status", "unknown")
            
            # Node up/down
            up_value = 1 if status == "online" else 0
            self.exporter.add_metric(
                ClusterMetrics.NODE_UP.name,
                up_value,
                {"node_id": node_id, "hostname": hostname, "role": role}
            )
            
            # CPU metrics
            cpu_usage = node.get("cpu_usage", 0)
            cpu_cores = node.get("cpu_cores", 0)
            self.exporter.add_metric(
                ClusterMetrics.NODE_CPU_USAGE.name,
                cpu_usage,
                {"node_id": node_id, "hostname": hostname}
            )
            self.exporter.add_metric(
                ClusterMetrics.NODE_CPU_CORES.name,
                cpu_cores,
                {"node_id": node_id, "hostname": hostname}
            )
            
            # Memory metrics
            memory_usage = node.get("memory_usage", 0)
            memory_total = node.get("memory_total", 1)
            memory_percent = (memory_usage / memory_total * 100) if memory_total > 0 else 0
            
            self.exporter.add_metric(
                ClusterMetrics.NODE_MEMORY_USAGE.name,
                memory_usage,
                {"node_id": node_id, "hostname": hostname}
            )
            self.exporter.add_metric(
                ClusterMetrics.NODE_MEMORY_TOTAL.name,
                memory_total,
                {"node_id": node_id, "hostname": hostname}
            )
            self.exporter.add_metric(
                ClusterMetrics.NODE_MEMORY_PERCENT.name,
                memory_percent,
                {"node_id": node_id, "hostname": hostname}
            )
            
            # Audio metrics
            dsp_load = node.get("audio_dsp_load", 0)
            xruns = node.get("xruns", 0)
            xrun_rate = node.get("xrun_rate", 0)
            audio_devices = node.get("audio_devices", 0)
            
            self.exporter.add_metric(
                ClusterMetrics.NODE_AUDIO_DSP_LOAD.name,
                dsp_load,
                {"node_id": node_id, "hostname": hostname}
            )
            self.exporter.add_metric(
                ClusterMetrics.NODE_XRUNS.name,
                xruns,
                {"node_id": node_id, "hostname": hostname}
            )
            self.exporter.add_metric(
                ClusterMetrics.NODE_XRUN_RATE.name,
                xrun_rate,
                {"node_id": node_id, "hostname": hostname}
            )
            self.exporter.add_metric(
                ClusterMetrics.NODE_AUDIO_DEVICES.name,
                audio_devices,
                {"node_id": node_id, "hostname": hostname}
            )
            
            # Uptime
            uptime = node.get("uptime", 0)
            self.exporter.add_metric(
                ClusterMetrics.NODE_UPTIME_SECONDS.name,
                uptime,
                {"node_id": node_id, "hostname": hostname}
            )
    
    def collect_health_metrics(self) -> None:
        """Collect health metrics."""
        health = self.get_health_data()
        
        if not health:
            return
        
        # Overall cluster health
        cluster_health = health.get("overall_score", 0)
        self.exporter.add_metric(
            ClusterMetrics.CLUSTER_HEALTH_SCORE.name,
            cluster_health
        )
        
        # Per-node health
        nodes_health = health.get("nodes", {})
        for node_id, node_health in nodes_health.items():
            score = node_health.get("score", 0)
            hostname = node_health.get("hostname", node_id)
            
            self.exporter.add_metric(
                ClusterMetrics.HEALTH_SCORE.name,
                score,
                {"node_id": node_id, "hostname": hostname}
            )
    
    def collect_update_metrics(self) -> None:
        """Collect update operation metrics."""
        updates = self.get_update_data()
        
        if not updates:
            return
        
        # Update success rate
        total = updates.get("total", 0)
        successful = updates.get("successful", 0)
        success_rate = (successful / total * 100) if total > 0 else 0
        
        self.exporter.add_metric(
            ClusterMetrics.UPDATE_SUCCESS_RATE.name,
            success_rate
        )
        
        # Pending updates
        pending = updates.get("pending", 0)
        self.exporter.add_metric(
            ClusterMetrics.UPDATE_NODES_PENDING.name,
            pending
        )
    
    def collect_uptime_metrics(self) -> None:
        """Collect uptime metrics."""
        uptime = time.time() - self.start_time
        self.exporter.add_metric(
            ClusterMetrics.CLUSTER_UPTIME_SECONDS.name,
            uptime
        )
    
    @staticmethod
    def _default_get_node_data() -> List[Dict[str, Any]]:
        """Default (empty) node data getter."""
        return []
    
    @staticmethod
    def _default_get_health_data() -> Dict[str, Any]:
        """Default (empty) health data getter."""
        return {}
    
    @staticmethod
    def _default_get_update_data() -> Dict[str, Any]:
        """Default (empty) update data getter."""
        return {}


# ============================================================================
# Metrics Manager
# ============================================================================

class MetricsManager:
    """Central manager for Prometheus metrics."""
    
    _instance: Optional['MetricsManager'] = None
    
    def __new__(cls):
        """Singleton pattern."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        """Initialize metrics manager."""
        if self._initialized:
            return
        
        self.exporter = PrometheusExporter()
        self.collector = ClusterMetricsCollector(self.exporter)
        self._initialized = True
        
        logger.info("Metrics manager initialized")
    
    def register_collector(self, collector: Callable[[], None]) -> None:
        """Register a custom collector."""
        self.exporter.register_collector(collector)
    
    def set_data_providers(self, 
                          get_node_data: Optional[Callable] = None,
                          get_health_data: Optional[Callable] = None,
                          get_update_data: Optional[Callable] = None) -> None:
        """Set data provider functions."""
        if get_node_data:
            self.collector.get_node_data = get_node_data
        if get_health_data:
            self.collector.get_health_data = get_health_data
        if get_update_data:
            self.collector.get_update_data = get_update_data
    
    def collect_metrics(self) -> None:
        """Collect all metrics."""
        self.exporter.storage.clear()
        self.collector.collect_all()
        self.exporter.collect(clear=False)
    
    def get_exposition(self) -> str:
        """Get Prometheus text format exposition."""
        self.collect_metrics()
        return self.exporter.generate_exposition()
    
    def add_metric(self, metric_name: str, value: float,
                   labels: Optional[Dict[str, str]] = None) -> None:
        """Add a custom metric."""
        self.exporter.add_metric(metric_name, value, labels)

    def add_target(
        self,
        name: str,
        address: str,
        port: int = 8080,
        metrics_path: str = "/api/metrics/prometheus",
    ) -> None:
        """Register a scrape target on the underlying exporter."""
        self.exporter.add_target(name=name, address=address, port=port, metrics_path=metrics_path)

    def get_targets(self) -> List[Dict[str, Any]]:
        """Return known scrape targets."""
        return self.exporter.get_targets()


_metrics_manager: Optional[MetricsManager] = None


def get_prometheus_exporter() -> MetricsManager:
    """Get or create the shared MAP2 Prometheus metrics manager."""
    global _metrics_manager
    if _metrics_manager is None:
        _metrics_manager = MetricsManager()
    return _metrics_manager

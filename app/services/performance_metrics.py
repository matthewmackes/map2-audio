"""
Performance Monitoring Service
Collects and tracks CPU, memory, latency, and audio metrics with Prometheus export.

Features:
- Time-series history with configurable retention
- Plugin-level performance tracking
- Buffer underrun monitoring with alerts
- Prometheus and JSON export formats

REAL-TIME SAFETY:
- All blocking system calls run in thread pool
- Non-blocking API for async code
- No interference with audio thread
"""

import logging
import psutil
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from collections import deque
from dataclasses import dataclass, field
import json
import threading
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)


@dataclass
class PluginStats:
    """Performance statistics for a single plugin."""
    plugin_id: str
    plugin_name: str
    total_cpu_ms: float = 0.0
    call_count: int = 0
    avg_latency_ms: float = 0.0
    max_latency_ms: float = 0.0
    last_call_time: Optional[datetime] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "plugin_id": self.plugin_id,
            "plugin_name": self.plugin_name,
            "total_cpu_ms": self.total_cpu_ms,
            "call_count": self.call_count,
            "avg_latency_ms": self.avg_latency_ms,
            "max_latency_ms": self.max_latency_ms,
            "last_call_time": self.last_call_time.isoformat() if self.last_call_time else None
        }


@dataclass
class PerformanceAlert:
    """Performance alert/warning."""
    level: str  # "warning", "critical"
    metric: str
    message: str
    value: float
    threshold: float
    timestamp: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "level": self.level,
            "metric": self.metric,
            "message": self.message,
            "value": self.value,
            "threshold": self.threshold,
            "timestamp": self.timestamp.isoformat()
        }


class MetricsCollector:
    """Collect and track system and audio metrics (RT-safe).
    
    All blocking operations run in thread pool to avoid
    blocking the main event loop or audio threads.
    
    Features:
    - Time-series storage with configurable retention
    - Per-plugin performance tracking
    - Automatic alert generation for threshold violations
    - Prometheus and JSON export
    """
    
    # Alert thresholds
    CPU_WARNING_THRESHOLD = 70.0
    CPU_CRITICAL_THRESHOLD = 90.0
    MEMORY_WARNING_THRESHOLD = 80.0
    MEMORY_CRITICAL_THRESHOLD = 95.0
    LATENCY_WARNING_THRESHOLD = 20.0  # ms
    LATENCY_CRITICAL_THRESHOLD = 50.0  # ms

    def __init__(self, max_history: int = 3600):
        """Initialize metrics collector.
        
        Args:
            max_history: Maximum number of historical samples to keep (1 hour at 1s interval)
        """
        self.max_history = max_history
        self.cpu_history: deque = deque(maxlen=max_history)
        self.memory_history: deque = deque(maxlen=max_history)
        self.latency_history: deque = deque(maxlen=max_history)
        self.audio_samples_processed = 0
        self.buffer_underruns = 0
        self.start_time = datetime.utcnow()
        self.is_collecting = False
        
        # Plugin tracking
        self._plugin_stats: Dict[str, PluginStats] = {}
        self._plugin_lock = threading.Lock()
        
        # Alerts
        self._alerts: List[PerformanceAlert] = []
        self._alert_lock = threading.Lock()
        self._max_alerts = 100
        
        # Thread pool for blocking operations
        self.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="metrics")

    async def start_collection(self, interval: float = 1.0) -> None:
        """Start collecting metrics.
        
        Args:
            interval: Collection interval in seconds
        """
        self.is_collecting = True
        while self.is_collecting:
            await self.collect_metrics()
            await asyncio.sleep(interval)

    async def stop_collection(self) -> None:
        """Stop collecting metrics."""
        self.is_collecting = False
        self.executor.shutdown(wait=False)

    def _collect_metrics_blocking(self) -> Dict[str, Any]:
        """Collect metrics (blocking - runs in thread pool).

        This method contains all the blocking psutil calls.
        NEVER call directly from async code - use collect_metrics() instead.
        """
        try:
            # CPU metrics (reduced blocking: 10ms instead of 100ms for RT-safety)
            cpu_percent = psutil.cpu_percent(interval=0.01)

            # Memory metrics
            memory = psutil.virtual_memory()
            memory_percent = memory.percent
            memory_used_mb = memory.used / (1024 * 1024)
            memory_total_mb = memory.total / (1024 * 1024)

            # Disk metrics
            disk = psutil.disk_usage('/')
            disk_percent = disk.percent

            # Process-specific metrics (reduced blocking: 1ms instead of 10ms)
            process = psutil.Process()
            process_memory = process.memory_info().rss / (1024 * 1024)
            process_cpu = process.cpu_percent(interval=0.001)

            return {
                "timestamp": datetime.utcnow().isoformat(),
                "cpu_percent": cpu_percent,
                "memory_percent": memory_percent,
                "memory_used_mb": memory_used_mb,
                "memory_total_mb": memory_total_mb,
                "disk_percent": disk_percent,
                "process_cpu_percent": process_cpu,
                "process_memory_mb": process_memory,
                "audio_samples": self.audio_samples_processed,
                "uptime_seconds": (datetime.utcnow() - self.start_time).total_seconds(),
                "audio_xruns": 0,  # Updated from JACK when available
                "audio_latency_ms": 0.0,  # Updated from JACK when available
            }
        except Exception as e:
            logger.error(f"Error collecting metrics: {e}")
            return {}

    async def collect_metrics(self) -> Dict[str, Any]:
        """Collect current system metrics (non-blocking).
        
        Runs blocking calls in thread pool to avoid blocking event loop.
        
        Returns:
            Metrics dict
        """
        try:
            # Run blocking metrics collection in thread pool
            metrics = await asyncio.get_event_loop().run_in_executor(
                self.executor,
                self._collect_metrics_blocking
            )
            
            if not metrics:
                return {}
            
            # Store in history with full snapshot
            timestamp = metrics["timestamp"]
            
            self.cpu_history.append({
                "timestamp": timestamp,
                "value": metrics["cpu_percent"]
            })

            self.memory_history.append({
                "timestamp": timestamp,
                "value": metrics["memory_percent"],
                "used_mb": metrics["memory_used_mb"]
            })
            
            # Check for alert conditions
            self._check_alerts(metrics)

            return metrics
        except Exception as e:
            logger.error(f"Error in async metrics collection: {e}")
            return {}
    
    def _check_alerts(self, metrics: Dict[str, Any]) -> None:
        """Check metrics against thresholds and generate alerts."""
        with self._alert_lock:
            # Trim old alerts
            if len(self._alerts) > self._max_alerts:
                self._alerts = self._alerts[-self._max_alerts:]
            
            cpu = metrics.get("cpu_percent", 0)
            memory = metrics.get("memory_percent", 0)
            
            if cpu >= self.CPU_CRITICAL_THRESHOLD:
                self._alerts.append(PerformanceAlert(
                    level="critical",
                    metric="cpu",
                    message=f"CPU usage critical: {cpu:.1f}%",
                    value=cpu,
                    threshold=self.CPU_CRITICAL_THRESHOLD
                ))
            elif cpu >= self.CPU_WARNING_THRESHOLD:
                self._alerts.append(PerformanceAlert(
                    level="warning",
                    metric="cpu",
                    message=f"CPU usage high: {cpu:.1f}%",
                    value=cpu,
                    threshold=self.CPU_WARNING_THRESHOLD
                ))
            
            if memory >= self.MEMORY_CRITICAL_THRESHOLD:
                self._alerts.append(PerformanceAlert(
                    level="critical",
                    metric="memory",
                    message=f"Memory usage critical: {memory:.1f}%",
                    value=memory,
                    threshold=self.MEMORY_CRITICAL_THRESHOLD
                ))
            elif memory >= self.MEMORY_WARNING_THRESHOLD:
                self._alerts.append(PerformanceAlert(
                    level="warning",
                    metric="memory",
                    message=f"Memory usage high: {memory:.1f}%",
                    value=memory,
                    threshold=self.MEMORY_WARNING_THRESHOLD
                ))
    
    def get_alerts(self, since: Optional[datetime] = None, level: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get performance alerts.
        
        Args:
            since: Only return alerts after this time
            level: Filter by level ("warning" or "critical")
            
        Returns:
            List of alert dictionaries
        """
        with self._alert_lock:
            alerts = self._alerts.copy()
        
        if since:
            alerts = [a for a in alerts if a.timestamp >= since]
        if level:
            alerts = [a for a in alerts if a.level == level]
        
        return [a.to_dict() for a in alerts]
    
    def clear_alerts(self) -> None:
        """Clear all alerts."""
        with self._alert_lock:
            self._alerts.clear()

    def record_audio_samples(self, sample_count: int) -> None:
        """Record audio samples processed.
        
        Args:
            sample_count: Number of samples processed
        """
        self.audio_samples_processed += sample_count
    
    def record_buffer_underrun(self) -> int:
        """Record a buffer underrun event.
        
        Returns:
            Total underrun count
        """
        self.buffer_underruns += 1
        with self._alert_lock:
            self._alerts.append(PerformanceAlert(
                level="warning",
                metric="audio",
                message=f"Buffer underrun detected (total: {self.buffer_underruns})",
                value=float(self.buffer_underruns),
                threshold=0
            ))
        return self.buffer_underruns

    def record_latency(self, latency_ms: float) -> None:
        """Record audio latency.
        
        Args:
            latency_ms: Latency in milliseconds
        """
        self.latency_history.append({
            "timestamp": datetime.utcnow().isoformat(),
            "value": latency_ms
        })
        
        # Check latency thresholds
        if latency_ms >= self.LATENCY_CRITICAL_THRESHOLD:
            with self._alert_lock:
                self._alerts.append(PerformanceAlert(
                    level="critical",
                    metric="latency",
                    message=f"Audio latency critical: {latency_ms:.1f}ms",
                    value=latency_ms,
                    threshold=self.LATENCY_CRITICAL_THRESHOLD
                ))
        elif latency_ms >= self.LATENCY_WARNING_THRESHOLD:
            with self._alert_lock:
                self._alerts.append(PerformanceAlert(
                    level="warning",
                    metric="latency",
                    message=f"Audio latency high: {latency_ms:.1f}ms",
                    value=latency_ms,
                    threshold=self.LATENCY_WARNING_THRESHOLD
                ))
    
    # ========================================================================
    # Plugin Performance Tracking
    # ========================================================================
    
    def record_plugin_call(self, plugin_id: str, plugin_name: str, 
                          duration_ms: float) -> None:
        """Record a plugin processing call.
        
        Args:
            plugin_id: Unique plugin identifier
            plugin_name: Human-readable plugin name
            duration_ms: Call duration in milliseconds
        """
        with self._plugin_lock:
            if plugin_id not in self._plugin_stats:
                self._plugin_stats[plugin_id] = PluginStats(
                    plugin_id=plugin_id,
                    plugin_name=plugin_name
                )
            
            stats = self._plugin_stats[plugin_id]
            stats.total_cpu_ms += duration_ms
            stats.call_count += 1
            stats.avg_latency_ms = stats.total_cpu_ms / stats.call_count
            stats.max_latency_ms = max(stats.max_latency_ms, duration_ms)
            stats.last_call_time = datetime.utcnow()
    
    def get_plugin_stats(self, plugin_id: Optional[str] = None) -> Dict[str, Any]:
        """Get plugin performance statistics.
        
        Args:
            plugin_id: Specific plugin (None for all)
            
        Returns:
            Plugin statistics
        """
        with self._plugin_lock:
            if plugin_id:
                if plugin_id in self._plugin_stats:
                    return {"plugins": [self._plugin_stats[plugin_id].to_dict()]}
                return {"plugins": []}
            
            plugins = [s.to_dict() for s in self._plugin_stats.values()]
            total_cpu = sum(s.total_cpu_ms for s in self._plugin_stats.values())
            
            return {
                "plugins": plugins,
                "total_cpu_ms": total_cpu,
                "total_cpu_percent": 0.0  # Would need sample rate to calculate
            }
    
    def reset_plugin_stats(self, plugin_id: Optional[str] = None) -> None:
        """Reset plugin statistics.
        
        Args:
            plugin_id: Specific plugin to reset (None for all)
        """
        with self._plugin_lock:
            if plugin_id:
                if plugin_id in self._plugin_stats:
                    del self._plugin_stats[plugin_id]
            else:
                self._plugin_stats.clear()
    
    # ========================================================================
    # History Retrieval
    # ========================================================================
    
    def get_history(self, duration_seconds: int = 60, 
                   resolution_seconds: int = 1) -> Dict[str, Any]:
        """Get performance history with downsampling.
        
        Args:
            duration_seconds: How far back to retrieve
            resolution_seconds: Sample interval (for downsampling)
            
        Returns:
            Historical snapshots with statistics
        """
        now = datetime.utcnow()
        cutoff = now - timedelta(seconds=duration_seconds)
        cutoff_str = cutoff.isoformat()
        
        # Filter and downsample CPU history
        cpu_samples = [
            h for h in self.cpu_history 
            if h["timestamp"] >= cutoff_str
        ]
        
        memory_samples = [
            h for h in self.memory_history
            if h["timestamp"] >= cutoff_str
        ]
        
        latency_samples = [
            h for h in self.latency_history
            if h["timestamp"] >= cutoff_str
        ]
        
        # Downsample if resolution > 1
        if resolution_seconds > 1 and cpu_samples:
            cpu_samples = self._downsample(cpu_samples, resolution_seconds)
            memory_samples = self._downsample(memory_samples, resolution_seconds)
            if latency_samples:
                latency_samples = self._downsample(latency_samples, resolution_seconds)
        
        # Build snapshots
        snapshots = []
        for i, cpu in enumerate(cpu_samples):
            snapshot = {
                "timestamp": cpu["timestamp"],
                "cpu_percent": cpu["value"]
            }
            if i < len(memory_samples):
                snapshot["memory_percent"] = memory_samples[i]["value"]
                snapshot["memory_used_mb"] = memory_samples[i].get("used_mb", 0)
            if i < len(latency_samples):
                snapshot["latency_ms"] = latency_samples[i]["value"]
            snapshots.append(snapshot)
        
        # Calculate statistics
        cpu_values = [s["cpu_percent"] for s in snapshots] if snapshots else [0]
        mem_values = [s.get("memory_percent", 0) for s in snapshots] if snapshots else [0]
        
        statistics = {
            "cpu": {
                "avg": sum(cpu_values) / len(cpu_values),
                "min": min(cpu_values),
                "max": max(cpu_values)
            },
            "memory": {
                "avg": sum(mem_values) / len(mem_values),
                "min": min(mem_values),
                "max": max(mem_values)
            },
            "buffer_underruns": self.buffer_underruns
        }
        
        return {
            "snapshots": snapshots,
            "statistics": statistics
        }
    
    def _downsample(self, samples: List[Dict], resolution: int) -> List[Dict]:
        """Downsample time series data.
        
        Args:
            samples: List of sample dicts with 'value' key
            resolution: Target resolution in seconds
            
        Returns:
            Downsampled list
        """
        if not samples or resolution <= 1:
            return samples
        
        result = []
        for i in range(0, len(samples), resolution):
            chunk = samples[i:i + resolution]
            if chunk:
                avg_value = sum(s["value"] for s in chunk) / len(chunk)
                result.append({
                    "timestamp": chunk[0]["timestamp"],
                    "value": avg_value,
                    **{k: v for k, v in chunk[0].items() if k not in ("timestamp", "value")}
                })
        return result

    def get_current_metrics(self) -> Dict[str, Any]:
        """Get current metrics.

        Returns:
            Current metrics dict
        """
        try:
            process = psutil.Process()
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')

            # Use non-blocking interval=None to get cached CPU values (RT-safe)
            return {
                "cpu_percent": psutil.cpu_percent(interval=None),
                "memory_percent": memory.percent,
                "memory_used_mb": memory.used / (1024 * 1024),
                "memory_total_mb": memory.total / (1024 * 1024),
                "memory_mb": process.memory_info().rss / (1024 * 1024),
                "disk_percent": disk.percent,
                "process_cpu_percent": process.cpu_percent(interval=None),
                "audio_samples": self.audio_samples_processed,
                "uptime_seconds": (datetime.utcnow() - self.start_time).total_seconds(),
                "audio_xruns": 0,  # Placeholder - actual xrun count from JACK
                "audio_latency_ms": 0.0,  # Placeholder - actual latency from JACK
            }
        except Exception as e:
            logger.error(f"Error getting current metrics: {e}")
            return {}

    def get_metrics_history(self, metric_type: str = "cpu", limit: int = 60) -> List[Dict[str, Any]]:
        """Get metrics history.
        
        Args:
            metric_type: "cpu", "memory", or "latency"
            limit: Maximum number of entries to return
            
        Returns:
            List of metric samples
        """
        if metric_type == "cpu":
            return list(self.cpu_history)[-limit:]
        elif metric_type == "memory":
            return list(self.memory_history)[-limit:]
        elif metric_type == "latency":
            return list(self.latency_history)[-limit:]
        return []

    def get_summary(self) -> Dict[str, Any]:
        """Get summary statistics.
        
        Returns:
            Summary dict with averages, min, max
        """
        try:
            def calculate_stats(history):
                if not history:
                    return {"avg": 0, "min": 0, "max": 0, "latest": 0}
                values = [h["value"] for h in history]
                return {
                    "avg": sum(values) / len(values),
                    "min": min(values),
                    "max": max(values),
                    "latest": values[-1] if values else 0
                }

            return {
                "uptime_seconds": (datetime.utcnow() - self.start_time).total_seconds(),
                "cpu": calculate_stats(self.cpu_history),
                "memory": calculate_stats(self.memory_history),
                "latency": calculate_stats(self.latency_history),
                "audio_samples": self.audio_samples_processed
            }
        except Exception as e:
            logger.error(f"Error getting summary: {e}")
            return {}

    def export_prometheus(self) -> str:
        """Export metrics in Prometheus format.

        Returns:
            Prometheus format metrics string
        """
        try:
            metrics = self.get_current_metrics()

            prometheus_lines = [
                "# HELP map2_cpu_percent System CPU usage percentage",
                "# TYPE map2_cpu_percent gauge",
                f"map2_cpu_percent {metrics.get('cpu_percent', 0)}",
                "",
                "# HELP map2_memory_percent Memory usage percentage",
                "# TYPE map2_memory_percent gauge",
                f"map2_memory_percent {metrics.get('memory_percent', 0)}",
                "",
                "# HELP map2_memory_mb Memory usage in megabytes",
                "# TYPE map2_memory_mb gauge",
                f"map2_memory_mb {metrics.get('memory_mb', 0)}",
                "",
                "# HELP map2_disk_percent Disk usage percentage",
                "# TYPE map2_disk_percent gauge",
                f"map2_disk_percent {metrics.get('disk_percent', 0)}",
                "",
                "# HELP map2_process_cpu_percent Process CPU usage percentage",
                "# TYPE map2_process_cpu_percent gauge",
                f"map2_process_cpu_percent {metrics.get('process_cpu_percent', 0)}",
                "",
                "# HELP map2_audio_samples Total audio samples processed",
                "# TYPE map2_audio_samples counter",
                f"map2_audio_samples {metrics.get('audio_samples', 0)}",
                "",
                "# HELP map2_uptime_seconds Application uptime in seconds",
                "# TYPE map2_uptime_seconds counter",
                f"map2_uptime_seconds {metrics.get('uptime_seconds', 0)}",
                "",
                "# HELP map2_audio_xruns Total audio xruns",
                "# TYPE map2_audio_xruns counter",
                f"map2_audio_xruns {metrics.get('audio_xruns', 0)}",
                "",
            ]

            return "\n".join(prometheus_lines)
        except Exception as e:
            logger.error(f"Error exporting Prometheus metrics: {e}")
            return ""

    def export_json(self) -> str:
        """Export metrics as JSON.
        
        Returns:
            JSON formatted metrics
        """
        try:
            data = {
                "timestamp": datetime.utcnow().isoformat(),
                "current": self.get_current_metrics(),
                "summary": self.get_summary(),
                "cpu_history": list(self.cpu_history),
                "memory_history": list(self.memory_history),
                "latency_history": list(self.latency_history)
            }
            return json.dumps(data, default=str, indent=2)
        except Exception as e:
            logger.error(f"Error exporting JSON metrics: {e}")
            return "{}"


# Global metrics collector instance
_metrics_collector: MetricsCollector = None
_collector_lock = threading.Lock()


async def get_metrics_collector() -> MetricsCollector:
    """Get or create global metrics collector.
    
    Returns:
        MetricsCollector instance
    """
    global _metrics_collector
    with _collector_lock:
        if _metrics_collector is None:
            _metrics_collector = MetricsCollector()
    return _metrics_collector


def get_performance_stats() -> Dict[str, Any]:
    """Get current performance statistics (sync wrapper).

    Returns:
        Current performance metrics with standardized keys
    """
    global _metrics_collector
    try:
        with _collector_lock:
            if _metrics_collector is None:
                _metrics_collector = MetricsCollector()

        # Get current metrics and normalize keys
        metrics = _metrics_collector.get_current_metrics()
        return {
            'cpu_usage_pct': metrics.get('cpu_percent', 0.0),
            'memory_usage_mb': metrics.get('memory_mb', 0.0),
            'process_cpu_pct': metrics.get('process_cpu_percent', 0.0),
            'audio_samples': metrics.get('audio_samples', 0),
            'uptime_seconds': metrics.get('uptime_seconds', 0),
            'buffer_underruns': _metrics_collector.buffer_underruns,
            # Include original keys for backwards compatibility
            'cpu_percent': metrics.get('cpu_percent', 0.0),
            'memory_mb': metrics.get('memory_mb', 0.0),
        }
    except Exception as e:
        logger.error(f"Error getting performance stats: {e}")
        # Return safe defaults
        return {
            'cpu_usage_pct': 0.0,
            'memory_usage_mb': 0.0,
            'audio_latency_ms': 0.0,
            'uptime_seconds': 0,
            'cpu_percent': 0.0,
            'memory_mb': 0.0,
        }


async def get_performance_history(duration: int = 60, resolution: int = 1) -> Dict[str, Any]:
    """Get performance history with time-series data.
    
    Args:
        duration: Duration in seconds
        resolution: Sample resolution in seconds
        
    Returns:
        Historical data with snapshots and statistics
    """
    collector = await get_metrics_collector()
    return collector.get_history(duration, resolution)


async def get_plugin_performance(plugin_id: Optional[str] = None) -> Dict[str, Any]:
    """Get plugin performance statistics.
    
    Args:
        plugin_id: Specific plugin ID or None for all
        
    Returns:
        Plugin performance data
    """
    collector = await get_metrics_collector()
    return collector.get_plugin_stats(plugin_id)


def record_buffer_underrun() -> int:
    """Record a buffer underrun event.
    
    Returns:
        Total underrun count
    """
    global _metrics_collector
    with _collector_lock:
        if _metrics_collector is None:
            _metrics_collector = MetricsCollector()
    return _metrics_collector.record_buffer_underrun()


def start_metrics_collection(interval: float = 1.0) -> None:
    """Start background metrics collection (called by service orchestrator).

    Args:
        interval: Collection interval in seconds
    """
    global _metrics_collector
    with _collector_lock:
        if _metrics_collector is None:
            _metrics_collector = MetricsCollector()

    def _collection_loop():
        import time
        while _metrics_collector and _metrics_collector.is_collecting:
            try:
                metrics = _metrics_collector._collect_metrics_blocking()
                # Store in history
                if metrics:
                    _metrics_collector.cpu_history.append({
                        "timestamp": metrics["timestamp"],
                        "value": metrics["cpu_percent"]
                    })
                    _metrics_collector.memory_history.append({
                        "timestamp": metrics["timestamp"],
                        "value": metrics["memory_percent"],
                        "used_mb": metrics["memory_used_mb"]
                    })
                    _metrics_collector._check_alerts(metrics)
            except Exception as e:
                logger.error(f"Metrics collection error: {e}")
            time.sleep(interval)

    _metrics_collector.is_collecting = True
    thread = threading.Thread(target=_collection_loop, daemon=True, name="metrics-collector")
    thread.start()
    logger.info(f"Started metrics collection (interval={interval}s, history={_metrics_collector.max_history})")

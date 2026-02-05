"""
System Health & Metrics Collection

Provides:
- Health check endpoints
- System status reporting
- Performance metrics
- Prometheus metrics export
"""

import asyncio
import time
import psutil
from datetime import datetime, timedelta
from typing import Dict
from collections import deque

from app.utils.logging_utils import get_logger

logger = get_logger(__name__)


class HealthMetrics:
    """Collect system health metrics."""
    
    def __init__(self):
        self.start_time = time.time()
        self.process = psutil.Process()
        
        # Event tracking
        self.events_processed = 0
        self.events_last_minute = deque(maxlen=60)
        self.latencies = deque(maxlen=1000)
        
        # Rate limit tracking
        self.rate_limit_violations = 0
        self.rate_limit_violations_by_endpoint = {}
        
        # Component status
        self.components_status = {
            'event_bus': False,
            'lcd_display': False,
            'database': False,
            'websocket': False,
        }
    
    def record_event(self, latency_ms: float = 0):
        """Record event processing."""
        self.events_processed += 1
        self.events_last_minute.append(time.time())
        if latency_ms > 0:
            self.latencies.append(latency_ms)
    
    def record_rate_limit_violation(self, endpoint: str):
        """Record rate limit violation."""
        self.rate_limit_violations += 1
        if endpoint not in self.rate_limit_violations_by_endpoint:
            self.rate_limit_violations_by_endpoint[endpoint] = 0
        self.rate_limit_violations_by_endpoint[endpoint] += 1
    
    def get_uptime_seconds(self) -> float:
        """Get uptime in seconds."""
        return time.time() - self.start_time
    
    def get_events_per_second(self) -> float:
        """Get current event rate."""
        if len(self.events_last_minute) == 0:
            return 0
        
        now = time.time()
        recent_count = sum(1 for t in self.events_last_minute 
                         if now - t < 60)
        return recent_count / 60.0
    
    def get_memory_info(self) -> Dict:
        """Get memory usage."""
        mem = self.process.memory_info()
        vm = psutil.virtual_memory()
        
        return {
            'process_rss_mb': mem.rss / 1024 / 1024,
            'process_vms_mb': mem.vms / 1024 / 1024,
            'system_percent': vm.percent,
            'system_available_mb': vm.available / 1024 / 1024,
        }
    
    def get_cpu_info(self) -> Dict:
        """Get CPU usage."""
        return {
            'process_percent': self.process.cpu_percent(interval=0.1),
            'system_percent': psutil.cpu_percent(interval=0.1),
            'core_count': psutil.cpu_count(),
        }
    
    def get_disk_info(self) -> Dict:
        """Get disk usage."""
        disk = psutil.disk_usage('/')
        
        return {
            'total_gb': disk.total / 1024**3,
            'used_gb': disk.used / 1024**3,
            'free_gb': disk.free / 1024**3,
            'percent': disk.percent,
        }
    
    def get_latency_stats(self) -> Dict:
        """Get event latency statistics."""
        if not self.latencies:
            return {
                'min_ms': 0,
                'max_ms': 0,
                'mean_ms': 0,
                'median_ms': 0,
            }
        
        import statistics
        lats = list(self.latencies)
        
        return {
            'min_ms': min(lats),
            'max_ms': max(lats),
            'mean_ms': statistics.mean(lats),
            'median_ms': statistics.median(lats),
            'p95_ms': sorted(lats)[int(len(lats)*0.95)] if lats else 0,
        }
    
    def set_component_status(self, component: str, status: bool):
        """Update component status."""
        if component in self.components_status:
            self.components_status[component] = status
    
    def get_health_status(self) -> Dict:
        """Get overall health status."""
        all_ok = all(self.components_status.values())
        
        return {
            'status': 'healthy' if all_ok else 'degraded',
            'timestamp': datetime.now().isoformat(),
            'uptime_seconds': int(self.get_uptime_seconds()),
            'events_processed': self.events_processed,
            'events_per_sec': round(self.get_events_per_second(), 2),
            'components': self.components_status,
            'memory': self.get_memory_info(),
            'cpu': self.get_cpu_info(),
            'disk': self.get_disk_info(),
            'latency': self.get_latency_stats(),
            'rate_limits': {
                'total_violations': self.rate_limit_violations,
                'by_endpoint': self.rate_limit_violations_by_endpoint,
            },
        }


# Global metrics instance
_health_metrics = None


def get_health_metrics() -> HealthMetrics:
    """Get global health metrics instance."""
    global _health_metrics
    if _health_metrics is None:
        _health_metrics = HealthMetrics()
    return _health_metrics


def init_health_metrics():
    """Initialize health metrics."""
    global _health_metrics
    _health_metrics = HealthMetrics()
    logger.info("Health metrics initialized")

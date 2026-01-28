"""
Advanced Analytics System
=========================
Historical metrics, trends, and performance analysis.
"""

import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
from dataclasses import dataclass
from datetime import datetime, timedelta
import time

logger = logging.getLogger(__name__)


@dataclass
class MetricSnapshot:
    """A snapshot of metrics at a point in time."""
    timestamp: float
    cpu_usage: float
    ram_usage: float
    latency: float
    active_plugins: int
    chain_name: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "timestamp": self.timestamp,
            "cpu_usage": self.cpu_usage,
            "ram_usage": self.ram_usage,
            "latency": self.latency,
            "active_plugins": self.active_plugins,
            "chain_name": self.chain_name
        }


class AdvancedAnalytics:
    """Tracks and analyzes system metrics over time."""
    
    METRICS_DIR = Path.home() / ".config" / "map2" / "metrics"
    MAX_SNAPSHOTS = 1000  # Keep 1000 snapshots (~8 hours at 2-second intervals)
    
    def __init__(self):
        """Initialize analytics system."""
        self.METRICS_DIR.mkdir(parents=True, exist_ok=True)
        self._snapshots: List[MetricSnapshot] = []
        self._load_metrics()
    
    def record_metric(self, cpu: float, ram: float, latency: float, 
                     active_plugins: int, chain_name: str = "") -> None:
        """Record a metric snapshot."""
        snapshot = MetricSnapshot(
            timestamp=time.time(),
            cpu_usage=cpu,
            ram_usage=ram,
            latency=latency,
            active_plugins=active_plugins,
            chain_name=chain_name
        )
        self._snapshots.append(snapshot)
        
        # Keep only recent snapshots
        if len(self._snapshots) > self.MAX_SNAPSHOTS:
            self._snapshots.pop(0)
    
    def get_metric_range(self, seconds_back: int = 3600) -> List[MetricSnapshot]:
        """Get metrics from the last N seconds."""
        cutoff = time.time() - seconds_back
        return [s for s in self._snapshots if s.timestamp >= cutoff]
    
    def get_statistics(self, seconds_back: int = 3600) -> Dict[str, Any]:
        """Get statistical analysis of metrics."""
        snapshots = self.get_metric_range(seconds_back)
        if not snapshots:
            return {}
        
        cpus = [s.cpu_usage for s in snapshots]
        rams = [s.ram_usage for s in snapshots]
        latencies = [s.latency for s in snapshots]
        
        return {
            "cpu": {
                "current": snapshots[-1].cpu_usage,
                "average": sum(cpus) / len(cpus),
                "peak": max(cpus),
                "minimum": min(cpus)
            },
            "ram": {
                "current": snapshots[-1].ram_usage,
                "average": sum(rams) / len(rams),
                "peak": max(rams),
                "minimum": min(rams)
            },
            "latency": {
                "current": snapshots[-1].latency,
                "average": sum(latencies) / len(latencies),
                "peak": max(latencies),
                "minimum": min(latencies)
            },
            "sample_count": len(snapshots),
            "time_period_seconds": seconds_back
        }
    
    def detect_bottlenecks(self, threshold_cpu: float = 80, 
                          threshold_latency: float = 10) -> Dict[str, Any]:
        """Detect performance bottlenecks."""
        recent = self.get_metric_range(3600)
        if not recent:
            return {}
        
        high_cpu = [s for s in recent if s.cpu_usage > threshold_cpu]
        high_latency = [s for s in recent if s.latency > threshold_latency]
        
        return {
            "high_cpu_events": len(high_cpu),
            "high_latency_events": len(high_latency),
            "total_events": len(recent),
            "high_cpu_percentage": (len(high_cpu) / len(recent) * 100) if recent else 0,
            "high_latency_percentage": (len(high_latency) / len(recent) * 100) if recent else 0,
            "worst_cpu_spike": max([s.cpu_usage for s in recent]) if recent else 0,
            "worst_latency_spike": max([s.latency for s in recent]) if recent else 0
        }
    
    def get_trend(self, metric: str, seconds_back: int = 3600) -> Tuple[str, float]:
        """
        Get trend for a metric (up, down, stable).
        Returns (trend, rate_of_change_percent)
        """
        snapshots = self.get_metric_range(seconds_back)
        if len(snapshots) < 2:
            return ("unknown", 0.0)
        
        # Get first and last values
        metric_map = {
            "cpu": "cpu_usage",
            "ram": "ram_usage",
            "latency": "latency"
        }
        
        attr = metric_map.get(metric)
        if not attr:
            return ("unknown", 0.0)
        
        first_val = getattr(snapshots[0], attr)
        last_val = getattr(snapshots[-1], attr)
        
        if first_val == 0:
            change_percent = 0
        else:
            change_percent = ((last_val - first_val) / first_val) * 100
        
        if change_percent > 5:
            trend = "increasing"
        elif change_percent < -5:
            trend = "decreasing"
        else:
            trend = "stable"
        
        return (trend, change_percent)
    
    def export_metrics(self, format: str = "json", time_range: int = 3600) -> str:
        """Export metrics in specified format."""
        snapshots = self.get_metric_range(time_range)
        
        if format == "json":
            data = [s.to_dict() for s in snapshots]
            return json.dumps(data, indent=2)
        elif format == "csv":
            lines = ["timestamp,cpu_usage,ram_usage,latency,active_plugins,chain_name"]
            for s in snapshots:
                lines.append(
                    f"{s.timestamp},{s.cpu_usage},{s.ram_usage},"
                    f"{s.latency},{s.active_plugins},{s.chain_name}"
                )
            return "\n".join(lines)
        else:
            raise ValueError(f"Unknown format: {format}")
    
    def _save_metrics(self) -> None:
        """Save current metrics to disk."""
        try:
            data = [s.to_dict() for s in self._snapshots[-100:]]  # Save last 100
            metrics_file = self.METRICS_DIR / f"metrics_{datetime.now().strftime('%Y%m%d')}.json"
            metrics_file.write_text(json.dumps(data, indent=2))
        except Exception as e:
            logger.error(f"Failed to save metrics: {e}")
    
    def _load_metrics(self) -> None:
        """Load historical metrics from disk."""
        try:
            # Load most recent metrics file
            today = datetime.now().strftime('%Y%m%d')
            metrics_file = self.METRICS_DIR / f"metrics_{today}.json"
            
            if metrics_file.exists():
                data = json.loads(metrics_file.read_text())
                for item in data:
                    self._snapshots.append(MetricSnapshot(
                        timestamp=item["timestamp"],
                        cpu_usage=item["cpu_usage"],
                        ram_usage=item["ram_usage"],
                        latency=item["latency"],
                        active_plugins=item["active_plugins"],
                        chain_name=item.get("chain_name", "")
                    ))
                logger.debug(f"Loaded {len(self._snapshots)} historical metrics")
        except Exception as e:
            logger.error(f"Failed to load metrics: {e}")
    
    def get_summary(self) -> Dict[str, Any]:
        """Get summary of collected metrics."""
        return {
            "total_snapshots": len(self._snapshots),
            "time_coverage_minutes": (
                (self._snapshots[-1].timestamp - self._snapshots[0].timestamp) / 60
                if self._snapshots else 0
            ),
            "start_time": (
                datetime.fromtimestamp(self._snapshots[0].timestamp).isoformat()
                if self._snapshots else None
            ),
            "end_time": (
                datetime.fromtimestamp(self._snapshots[-1].timestamp).isoformat()
                if self._snapshots else None
            )
        }


# Global instance
analytics = AdvancedAnalytics()

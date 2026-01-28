"""
Performance Monitor
==================
Real-time performance tracking and optimization insights.
"""

import logging
import time
from typing import Dict, List, Any, Optional
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class PerformanceMetric:
    """A single performance metric."""
    name: str
    timestamp: float
    value: float
    unit: str = "ms"
    category: str = "general"


@dataclass
class ComponentMetrics:
    """Performance metrics for a component."""
    name: str
    total_renders: int = 0
    avg_render_time: float = 0.0
    max_render_time: float = 0.0
    min_render_time: float = 0.0
    last_render_time: float = 0.0
    render_times: deque = field(default_factory=lambda: deque(maxlen=100))
    
    def add_render_time(self, duration: float) -> None:
        """Add a render time measurement."""
        self.render_times.append(duration)
        self.total_renders += 1
        self.last_render_time = duration
        self.max_render_time = max(self.max_render_time, duration)
        self.min_render_time = min(self.min_render_time, duration) if self.min_render_time > 0 else duration
        self.avg_render_time = sum(self.render_times) / len(self.render_times)


class PerformanceMonitor:
    """Monitors and reports on application performance."""
    
    def __init__(self, enabled: bool = True):
        """
        Initialize performance monitor.
        
        Args:
            enabled: Whether monitoring is active
        """
        self._enabled = enabled
        self._components: Dict[str, ComponentMetrics] = {}
        self._metrics: deque = deque(maxlen=1000)
        self._frame_times: deque = deque(maxlen=60)
        self._start_time = time.time()
        self._frame_count = 0
        self._fps = 0.0
        self._memory_usage: Dict[str, float] = {}
        self._bottlenecks: List[Dict[str, Any]] = []
    
    def record_component_render(self, component_name: str, duration: float) -> None:
        """
        Record component render time.
        
        Args:
            component_name: Name of component
            duration: Render time in milliseconds
        """
        if not self._enabled:
            return
        
        if component_name not in self._components:
            self._components[component_name] = ComponentMetrics(name=component_name)
        
        self._components[component_name].add_render_time(duration)
        
        # Record metric
        metric = PerformanceMetric(
            name=f"render_{component_name}",
            timestamp=time.time(),
            value=duration,
            unit="ms",
            category="render"
        )
        self._metrics.append(metric)
    
    def record_frame(self, duration: float) -> None:
        """
        Record frame render time.
        
        Args:
            duration: Frame time in milliseconds
        """
        if not self._enabled:
            return
        
        self._frame_times.append(duration)
        self._frame_count += 1
        
        # Calculate FPS
        if len(self._frame_times) > 0:
            avg_frame_time = sum(self._frame_times) / len(self._frame_times)
            self._fps = 1000.0 / avg_frame_time if avg_frame_time > 0 else 0
    
    def record_metric(
        self,
        name: str,
        value: float,
        unit: str = "ms",
        category: str = "general"
    ) -> None:
        """
        Record a generic metric.
        
        Args:
            name: Metric name
            value: Metric value
            unit: Unit of measurement
            category: Metric category
        """
        if not self._enabled:
            return
        
        metric = PerformanceMetric(
            name=name,
            timestamp=time.time(),
            value=value,
            unit=unit,
            category=category
        )
        self._metrics.append(metric)
    
    def record_memory(self, component: str, usage_mb: float) -> None:
        """Record memory usage."""
        self._memory_usage[component] = usage_mb
    
    def detect_bottlenecks(self, threshold_ms: float = 16.0) -> List[Dict[str, Any]]:
        """
        Detect performance bottlenecks.
        
        Args:
            threshold_ms: Time threshold for bottleneck (default: 16ms = 60 FPS)
            
        Returns:
            List of bottleneck findings
        """
        self._bottlenecks = []
        
        for comp_name, metrics in self._components.items():
            if metrics.avg_render_time > threshold_ms:
                self._bottlenecks.append({
                    "component": comp_name,
                    "type": "slow_render",
                    "avg_time": metrics.avg_render_time,
                    "max_time": metrics.max_render_time,
                    "threshold": threshold_ms,
                    "recommendation": f"Optimize {comp_name} rendering or split into smaller components"
                })
        
        # Check FPS
        if self._fps < 50:
            self._bottlenecks.append({
                "type": "low_fps",
                "fps": self._fps,
                "threshold": 60,
                "recommendation": "Check for expensive operations in render loop"
            })
        
        # Check memory
        total_memory = sum(self._memory_usage.values())
        if total_memory > 500:  # 500 MB threshold
            self._bottlenecks.append({
                "type": "high_memory",
                "usage_mb": total_memory,
                "components": self._memory_usage,
                "recommendation": "Review memory usage, consider lazy loading or caching"
            })
        
        return self._bottlenecks
    
    def get_fps(self) -> float:
        """Get current FPS."""
        return self._fps
    
    def get_component_metrics(self, component_name: Optional[str] = None) -> Dict[str, Any]:
        """
        Get component metrics.
        
        Args:
            component_name: Specific component or None for all
            
        Returns:
            Component metrics
        """
        if component_name:
            comp = self._components.get(component_name)
            if not comp:
                return {}
            return {
                "name": comp.name,
                "total_renders": comp.total_renders,
                "avg_render_time": round(comp.avg_render_time, 2),
                "max_render_time": round(comp.max_render_time, 2),
                "min_render_time": round(comp.min_render_time, 2),
                "last_render_time": round(comp.last_render_time, 2)
            }
        
        return {
            name: {
                "total_renders": comp.total_renders,
                "avg_render_time": round(comp.avg_render_time, 2),
                "max_render_time": round(comp.max_render_time, 2)
            }
            for name, comp in self._components.items()
        }
    
    def get_dashboard_display(self) -> str:
        """Get formatted dashboard for display."""
        lines = []
        lines.append("\n╔════════════════════════════════════════╗")
        lines.append("║      PERFORMANCE MONITOR (F10)         ║")
        lines.append("╠════════════════════════════════════════╣")
        
        # FPS
        fps_color = "🟢" if self._fps >= 50 else "🟡" if self._fps >= 30 else "🔴"
        lines.append(f"║ FPS: {fps_color} {self._fps:.1f} FPS                       ║")
        
        # Avg frame time
        if self._frame_times:
            avg_frame = sum(self._frame_times) / len(self._frame_times)
            lines.append(f"║ Frame Time: {avg_frame:.2f} ms                    ║")
        
        # Memory
        total_mem = sum(self._memory_usage.values())
        lines.append(f"║ Memory: {total_mem:.1f} MB                       ║")
        
        # Top components
        lines.append("║                                        ║")
        lines.append("║ SLOWEST COMPONENTS:                    ║")
        
        sorted_comps = sorted(
            self._components.items(),
            key=lambda x: x[1].avg_render_time,
            reverse=True
        )[:3]
        
        for comp_name, metrics in sorted_comps:
            display_name = comp_name[:20].ljust(20)
            lines.append(f"║  {display_name} {metrics.avg_render_time:6.2f}ms ║")
        
        # Bottlenecks
        bottlenecks = self.detect_bottlenecks()
        if bottlenecks:
            lines.append("║                                        ║")
            lines.append("║ ⚠️  BOTTLENECKS DETECTED:              ║")
            for bn in bottlenecks[:2]:
                bn_type = bn.get("type", "unknown")[:15]
                lines.append(f"║  {bn_type}                     ║")
        
        lines.append("╚════════════════════════════════════════╝")
        return "\n".join(lines)
    
    def get_summary(self) -> Dict[str, Any]:
        """Get performance summary."""
        return {
            "fps": round(self._fps, 1),
            "frame_count": self._frame_count,
            "total_components": len(self._components),
            "memory_usage_mb": sum(self._memory_usage.values()),
            "bottleneck_count": len(self._bottlenecks),
            "uptime_seconds": time.time() - self._start_time,
            "metrics_recorded": len(self._metrics)
        }
    
    def export_report(self) -> Dict[str, Any]:
        """Export full performance report."""
        return {
            "timestamp": datetime.now().isoformat(),
            "summary": self.get_summary(),
            "fps": self._fps,
            "components": self.get_component_metrics(),
            "bottlenecks": self._bottlenecks,
            "memory": self._memory_usage
        }
    
    def reset(self) -> None:
        """Reset all metrics."""
        self._components.clear()
        self._metrics.clear()
        self._frame_times.clear()
        self._bottlenecks.clear()
        self._memory_usage.clear()
        self._frame_count = 0
        logger.info("Performance monitor reset")


# Global instance
performance_monitor = PerformanceMonitor()

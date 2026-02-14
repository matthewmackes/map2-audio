"""
Metrics Display Widget - Visual metrics representation
Displays metrics with gauges, progress bars, and formatted values.
"""

import math
from typing import Optional, Dict, Any

try:
    from textual.app import ComposeResult
    from textual.containers import Horizontal, Vertical
    from textual.widgets import Static, Label, ProgressBar
    from textual.reactive import reactive
except ImportError:
    pass


class MetricsDisplayWidget(Static):
    """
    Metrics display with visual gauges and values.
    
    Shows metrics like CPU, memory, latency with colored progress bars.
    
    Example:
        metrics = MetricsDisplayWidget(
            metrics={
                "CPU": {"value": 45.0, "max": 100, "unit": "%"},
                "Memory": {"value": 2048, "max": 8192, "unit": "MB"},
            }
        )
        yield metrics
    """
    
    DEFAULT_CSS = """
    MetricsDisplayWidget {
        width: 100%;
        height: auto;
        background: $surface;
        padding: 1 2;
        margin: 0 0;
    }
    
    .metric-row {
        width: 100%;
        height: 3;
        margin: 0 0 1 0;
    }
    
    .metric-label {
        width: 16;
        height: 1;
        color: $text;
        text-style: bold;
    }
    
    .metric-bar {
        width: 1fr;
        height: 1;
    }
    
    .metric-value {
        width: 12;
        height: 1;
        text-align: right;
        color: $text;
    }
    
    .metric-bar.critical {
        background: $error;
    }
    
    .metric-bar.warning {
        background: $warning;
    }
    
    .metric-bar.ok {
        background: $success;
    }
    """
    
    def __init__(
        self,
        metrics: Optional[Dict[str, Dict[str, Any]]] = None,
        id: Optional[str] = None,
        **kwargs
    ):
        """
        Initialize metrics display.
        
        Args:
            metrics: Dict of metric_name -> {value, max, unit}
            id: Widget ID
        """
        super().__init__(id=id, **kwargs)
        self.metrics = metrics or {}
    
    def compose(self) -> ComposeResult:
        """Compose metrics display."""
        with Vertical():
            for name, data in self.metrics.items():
                with Horizontal(classes="metric-row"):
                    yield Label(name, classes="metric-label")
                    yield ProgressBar(
                        total=data.get("max", 100),
                        classes="metric-bar"
                    )
                    yield Label("0%", classes="metric-value")
    
    async def on_mount(self) -> None:
        """Update metrics display on mount."""
        self._update_display()
    
    def _update_display(self) -> None:
        """Update all metrics displays."""
        metric_items = list(self.metrics.items())
        bars = list(self.query(ProgressBar))
        values = list(self.query(".metric-value"))
        
        for i, (name, data) in enumerate(metric_items):
            if i < len(bars):
                bar = bars[i]
                value = data.get("value", 0)
                max_val = data.get("max", 100)
                unit = data.get("unit", "%")
                
                # Update progress bar
                bar.total = max_val
                bar.progress = value
                
                # Determine color based on value
                percentage = (value / max_val * 100) if max_val > 0 else 0
                if percentage >= 90:
                    bar.set_class(True, "critical")
                elif percentage >= 70:
                    bar.set_class(True, "warning")
                else:
                    bar.set_class(True, "ok")
                
                # Update value label
                if i < len(values):
                    value_label = values[i]
                    formatted_value = self._format_value(value, unit)
                    value_label.update(formatted_value)
    
    def _format_value(self, value: float, unit: str) -> str:
        """Format value with unit."""
        if unit == "%":
            return f"{value:.1f}%"
        elif unit in ("MB", "GB"):
            if value > 1024 and unit == "MB":
                return f"{value/1024:.1f}GB"
            return f"{value:.0f}{unit}"
        elif unit == "ms":
            return f"{value:.1f}ms"
        else:
            return f"{value:.2f}{unit}"
    
    def set_metrics(self, metrics: Dict[str, Dict[str, Any]]) -> None:
        """Update metrics dictionary."""
        self.metrics = metrics
        self._update_display()
    
    def update_metric(self, name: str, value: float) -> None:
        """Update single metric value."""
        if name in self.metrics:
            self.metrics[name]["value"] = value
            self._update_display()
    
    def get_metric(self, name: str) -> Optional[float]:
        """Get metric value."""
        if name in self.metrics:
            return self.metrics[name].get("value")
        return None

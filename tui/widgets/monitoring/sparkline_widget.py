"""
Sparkline Widget for Backend Services Monitoring TUI
====================================================
Native Textual Sparkline integration with enhanced features.

Example output: CPU: ▂▃▅▆▇█▆▅▃▂ 45%
"""

from typing import List, Optional, Tuple
import logging

try:
    from textual.app import ComposeResult
    from textual.widgets import Static, Sparkline, Label, ProgressBar
    from textual.containers import Horizontal, Vertical
    from textual.reactive import reactive
    from rich.text import Text
    from rich.style import Style
    TEXTUAL_AVAILABLE = True
except ImportError:
    TEXTUAL_AVAILABLE = False
    Static = object

logger = logging.getLogger(__name__)

# Unicode block characters for sparkline rendering (8 levels)
SPARKLINE_CHARS = "▁▂▃▄▅▆▇█"

# Color thresholds for gradient coloring
COLOR_THRESHOLDS = {
    "low": 0.33,    # Green zone
    "mid": 0.66,    # Yellow zone
    "high": 1.0,    # Red zone
}


class EnhancedSparkline(Static):
    """
    Enhanced sparkline widget using Textual's native Sparkline.

    Features:
    - Native Textual Sparkline for smooth rendering
    - Label prefix support
    - Current value display
    - Color-coded based on value thresholds
    - Configurable summary function (min, max, last)

    Usage:
        sparkline = EnhancedSparkline(
            label="CPU",
            width=20,
            min_value=0,
            max_value=100,
            show_value=True
        )
        sparkline.update_data([10, 20, 30, 40, 50, 60, 70, 80])
    """

    DEFAULT_CSS = """
    EnhancedSparkline {
        width: 100%;
        height: 3;
        layout: horizontal;
    }

    EnhancedSparkline .spark-label {
        width: 6;
        height: 1;
        text-style: bold;
        padding-right: 1;
    }

    EnhancedSparkline .spark-container {
        width: 1fr;
        height: 1;
    }

    EnhancedSparkline .spark-value {
        width: 8;
        height: 1;
        text-align: right;
    }

    EnhancedSparkline Sparkline {
        width: 100%;
        height: 1;
    }

    EnhancedSparkline .spark-good {
        color: #10B981;
    }

    EnhancedSparkline .spark-warn {
        color: #F59E0B;
    }

    EnhancedSparkline .spark-crit {
        color: #EF4444;
    }
    """

    def __init__(
        self,
        label: str = "",
        width: int = 20,
        min_value: Optional[float] = None,
        max_value: Optional[float] = None,
        show_value: bool = True,
        value_format: str = "{:.1f}%",
        warn_threshold: float = 70,
        crit_threshold: float = 90,
        summary_function: str = "last",
        id: Optional[str] = None,
        classes: Optional[str] = None,
    ):
        """
        Initialize enhanced sparkline widget.

        Args:
            label: Label prefix (e.g., "CPU", "MEM")
            width: Number of data points to display
            min_value: Fixed minimum value (auto-scale if None)
            max_value: Fixed maximum value (auto-scale if None)
            show_value: Show current value
            value_format: Format string for value display
            warn_threshold: Warning threshold (0-100)
            crit_threshold: Critical threshold (0-100)
            summary_function: How to summarize ("last", "min", "max", "mean")
            id: Widget ID
            classes: CSS classes
        """
        super().__init__(id=id, classes=classes)
        self._label = label
        self._width = width
        self._min_value = min_value
        self._max_value = max_value
        self._show_value = show_value
        self._value_format = value_format
        self._warn_threshold = warn_threshold
        self._crit_threshold = crit_threshold
        self._summary_function = summary_function
        self._data: List[float] = []

    def compose(self) -> ComposeResult:
        """Compose the widget with native Sparkline."""
        with Horizontal():
            if self._label:
                yield Label(self._label, classes="spark-label")
            yield Sparkline(
                data=self._data,
                summary_function=self._get_summary_function(),
                id="native-sparkline",
                classes="spark-container",
            )
            if self._show_value:
                yield Label("--", id="spark-value", classes="spark-value")

    def _get_summary_function(self):
        """Get the summary function for sparkline."""
        if self._summary_function == "min":
            return min
        elif self._summary_function == "max":
            return max
        elif self._summary_function == "mean":
            return lambda data: sum(data) / len(data) if data else 0
        else:  # "last"
            return lambda data: data[-1] if data else 0

    def update_data(self, values: List[float]) -> None:
        """
        Update sparkline with new data values.

        Args:
            values: List of numeric values to display
        """
        self._data = list(values[-self._width:]) if values else []
        self._update_display()

    def add_value(self, value: float) -> None:
        """
        Add a single value to the sparkline (rolling window).

        Args:
            value: New value to append
        """
        self._data.append(value)
        if len(self._data) > self._width:
            self._data = self._data[-self._width:]
        self._update_display()

    def _update_display(self) -> None:
        """Update the sparkline display."""
        try:
            # Update native sparkline
            sparkline = self.query_one("#native-sparkline", Sparkline)
            sparkline.data = self._data

            # Update value label with color
            if self._show_value and self._data:
                value_label = self.query_one("#spark-value", Label)
                current = self._data[-1]
                text = self._value_format.format(current)

                # Determine color based on thresholds
                if current >= self._crit_threshold:
                    value_label.remove_class("spark-good", "spark-warn")
                    value_label.add_class("spark-crit")
                elif current >= self._warn_threshold:
                    value_label.remove_class("spark-good", "spark-crit")
                    value_label.add_class("spark-warn")
                else:
                    value_label.remove_class("spark-warn", "spark-crit")
                    value_label.add_class("spark-good")

                value_label.update(text)
        except Exception as e:
            logger.debug(f"Error updating sparkline: {e}")

    @property
    def current_value(self) -> Optional[float]:
        """Get the current (last) value."""
        return self._data[-1] if self._data else None


class MetricSparkline(Static):
    """
    Complete metric display with label, progress bar, sparkline, and value.

    Layout:
    +----------------------------------------------+
    | CPU  [████████░░] 42%  ▂▃▅▆▇█▆▅▃▂            |
    +----------------------------------------------+
    """

    DEFAULT_CSS = """
    MetricSparkline {
        width: 100%;
        height: 1;
        layout: horizontal;
    }

    MetricSparkline .metric-name {
        width: 5;
        text-style: bold;
    }

    MetricSparkline ProgressBar {
        width: 12;
        padding: 0 1;
    }

    MetricSparkline .metric-percent {
        width: 5;
        text-align: right;
    }

    MetricSparkline Sparkline {
        width: 12;
        margin-left: 1;
    }

    MetricSparkline .metric-good { color: #10B981; }
    MetricSparkline .metric-warn { color: #F59E0B; }
    MetricSparkline .metric-crit { color: #EF4444; }
    """

    def __init__(
        self,
        name: str,
        warn_threshold: float = 70,
        crit_threshold: float = 90,
        id: Optional[str] = None,
        classes: Optional[str] = None,
    ):
        """
        Initialize metric sparkline.

        Args:
            name: Metric name (e.g., "CPU", "MEM", "DISK")
            warn_threshold: Warning threshold percentage
            crit_threshold: Critical threshold percentage
            id: Widget ID
            classes: CSS classes
        """
        super().__init__(id=id, classes=classes)
        self._name = name
        self._warn_threshold = warn_threshold
        self._crit_threshold = crit_threshold
        self._value = 0.0
        self._history: List[float] = []

    def compose(self) -> ComposeResult:
        """Compose the metric display."""
        yield Label(self._name, classes="metric-name")
        yield ProgressBar(total=100, show_eta=False, show_percentage=False, id="progress")
        yield Label("0%", id="percent", classes="metric-percent")
        yield Sparkline(data=[], id="history")

    def update(self, value: float, add_to_history: bool = True) -> None:
        """
        Update the metric value.

        Args:
            value: New value (0-100)
            add_to_history: Whether to add to history
        """
        self._value = value
        if add_to_history:
            self._history.append(value)
            if len(self._history) > 60:
                self._history = self._history[-60:]

        try:
            # Update progress bar
            progress = self.query_one("#progress", ProgressBar)
            progress.update(progress=value)

            # Update percentage label with color
            percent = self.query_one("#percent", Label)
            percent.update(f"{value:.0f}%")

            if value >= self._crit_threshold:
                percent.remove_class("metric-good", "metric-warn")
                percent.add_class("metric-crit")
            elif value >= self._warn_threshold:
                percent.remove_class("metric-good", "metric-crit")
                percent.add_class("metric-warn")
            else:
                percent.remove_class("metric-warn", "metric-crit")
                percent.add_class("metric-good")

            # Update sparkline
            sparkline = self.query_one("#history", Sparkline)
            sparkline.data = self._history
        except Exception as e:
            logger.debug(f"Error updating metric: {e}")


# Legacy functions for backward compatibility

def render_sparkline(
    values: List[float],
    width: int = 20,
    min_value: Optional[float] = None,
    max_value: Optional[float] = None,
) -> str:
    """
    Standalone function to render a sparkline string.

    Args:
        values: List of numeric values
        width: Number of characters
        min_value: Fixed minimum (auto-scale if None)
        max_value: Fixed maximum (auto-scale if None)

    Returns:
        Sparkline string

    Example:
        >>> render_sparkline([1, 2, 3, 4, 5, 4, 3, 2, 1], width=9)
        '▁▂▄▆█▆▄▂▁'
    """
    if not values:
        return "─" * width

    # Take last `width` values
    values = list(values[-width:])

    # Determine scale
    min_val = min_value if min_value is not None else min(values)
    max_val = max_value if max_value is not None else max(values)

    value_range = max_val - min_val
    if value_range == 0:
        value_range = 1

    # Build sparkline
    chars = []
    for value in values:
        normalized = (value - min_val) / value_range
        normalized = max(0, min(1, normalized))
        char_index = int(normalized * (len(SPARKLINE_CHARS) - 1))
        chars.append(SPARKLINE_CHARS[char_index])

    # Pad if needed
    while len(chars) < width:
        chars.insert(0, " ")

    return "".join(chars)


def render_progress_bar(
    value: float,
    max_value: float = 100,
    width: int = 10,
    filled_char: str = "█",
    empty_char: str = "░",
) -> str:
    """
    Render a simple progress bar.

    Args:
        value: Current value
        max_value: Maximum value (100 for percentage)
        width: Bar width in characters
        filled_char: Character for filled portion
        empty_char: Character for empty portion

    Returns:
        Progress bar string

    Example:
        >>> render_progress_bar(45, 100, 10)
        '████░░░░░░'
    """
    if max_value <= 0:
        max_value = 1

    ratio = max(0, min(1, value / max_value))
    filled = int(ratio * width)
    empty = width - filled

    return f"{filled_char * filled}{empty_char * empty}"


def render_status_bar(
    value: float,
    max_value: float = 100,
    width: int = 8,
) -> str:
    """
    Render a status bar with brackets.

    Args:
        value: Current value
        max_value: Maximum value
        width: Inner bar width (excluding brackets)

    Returns:
        Status bar string like '[========]' or '[====    ]'

    Example:
        >>> render_status_bar(50, 100, 8)
        '[====    ]'
    """
    if max_value <= 0:
        max_value = 1

    ratio = max(0, min(1, value / max_value))
    filled = int(ratio * width)
    empty = width - filled

    return f"[{'=' * filled}{' ' * empty}]"


# Keep backward compatible class name
SparklineWidget = EnhancedSparkline

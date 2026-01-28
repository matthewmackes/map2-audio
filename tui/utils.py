"""
Shared utility functions for MAP2 TUI.

This module provides common functionality used across multiple TUI components
to avoid code duplication and ensure consistent behavior.
"""

from typing import Dict, Optional, Callable, Any
import asyncio
from functools import wraps
import time


# Plugin icon mapping based on plugin URI or category
PLUGIN_ICONS: Dict[str, str] = {
    # Effect types
    'reverb': '\U0001f30a',      # Wave emoji
    'delay': '\u23f1\ufe0f',      # Stopwatch emoji
    'compressor': '\U0001f4ca',   # Bar chart emoji
    'eq': '\U0001f39a\ufe0f',     # Level slider emoji
    'equalizer': '\U0001f39a\ufe0f',
    'distortion': '\U0001f525',   # Fire emoji
    'overdrive': '\U0001f525',
    'amp': '\U0001f3b8',          # Guitar emoji
    'amplifier': '\U0001f3b8',
    'chorus': '\U0001f300',       # Cyclone emoji
    'flanger': '\U0001f300',
    'phaser': '\U0001f300',
    'gate': '\U0001f6aa',         # Door emoji
    'noise': '\U0001f6aa',
    'limiter': '\U0001f6e1\ufe0f', # Shield emoji
    'cabinet': '\U0001f4e2',      # Loudspeaker emoji
    'cab': '\U0001f4e2',
    'ir': '\U0001f4e2',
    'filter': '\U0001f50a',       # Speaker emoji
    'wah': '\U0001f50a',
    'pitch': '\U0001f3b5',        # Musical note emoji
    'tuner': '\U0001f3b5',
    'tremolo': '\U0001f4a0',      # Diamond emoji
    'vibrato': '\U0001f4a0',
    'looper': '\U0001f501',       # Repeat emoji
    'utility': '\U0001f527',      # Wrench emoji
    'mixer': '\U0001f39b\ufe0f',  # Control knobs emoji
    'nam': '\U0001f3b8',          # Guitar for NAM models
    'neural': '\U0001f9e0',       # Brain emoji
    'modulation': '\U0001f300',   # Cyclone
    'dynamics': '\U0001f4ca',     # Bar chart
    'spatial': '\U0001f30a',      # Wave
}

# Default icon for unknown plugin types
DEFAULT_PLUGIN_ICON = '\U0001f39b\ufe0f'  # Control knobs emoji


def get_plugin_icon(uri_or_name: str, category: Optional[str] = None) -> str:
    """
    Get an appropriate icon for a plugin based on its URI, name, or category.

    This function checks the plugin URI/name for keywords that indicate the
    plugin type, and returns an appropriate emoji icon.

    Args:
        uri_or_name: Plugin URI or display name
        category: Optional plugin category string

    Returns:
        Single emoji character representing the plugin type

    Examples:
        >>> get_plugin_icon("http://lv2plug.in/plugins/eg-reverb")
        '\U0001f30a'
        >>> get_plugin_icon("Calf Compressor", category="Dynamics")
        '\U0001f4ca'
    """
    # Convert to lowercase for matching
    text = uri_or_name.lower()
    if category:
        text = f"{text} {category.lower()}"

    # Check each keyword
    for keyword, icon in PLUGIN_ICONS.items():
        if keyword in text:
            return icon

    return DEFAULT_PLUGIN_ICON


def get_plugin_type_name(uri_or_name: str) -> str:
    """
    Get a human-readable plugin type name based on URI or name.

    Args:
        uri_or_name: Plugin URI or display name

    Returns:
        Human-readable type name (e.g., "Reverb", "Compressor")
    """
    text = uri_or_name.lower()

    type_names = {
        'reverb': 'Reverb',
        'delay': 'Delay',
        'compressor': 'Compressor',
        'eq': 'EQ',
        'equalizer': 'EQ',
        'distortion': 'Distortion',
        'overdrive': 'Overdrive',
        'amp': 'Amplifier',
        'amplifier': 'Amplifier',
        'chorus': 'Chorus',
        'flanger': 'Flanger',
        'phaser': 'Phaser',
        'gate': 'Gate',
        'limiter': 'Limiter',
        'cabinet': 'Cabinet',
        'cab': 'Cabinet',
        'filter': 'Filter',
        'wah': 'Wah',
        'pitch': 'Pitch',
        'tremolo': 'Tremolo',
        'vibrato': 'Vibrato',
        'nam': 'NAM Model',
        'neural': 'Neural',
    }

    for keyword, name in type_names.items():
        if keyword in text:
            return name

    return 'Effect'


def format_cpu_percent(cpu: float) -> str:
    """
    Format CPU percentage for display.

    Args:
        cpu: CPU usage as percentage (0-100)

    Returns:
        Formatted string with color indicator
    """
    if cpu < 10:
        return f"{cpu:.1f}%"
    elif cpu < 50:
        return f"{cpu:.0f}%"
    else:
        return f"{cpu:.0f}%!"


def truncate_name(name: str, max_length: int = 20) -> str:
    """
    Truncate a plugin name to fit in limited space.

    Args:
        name: Full plugin name
        max_length: Maximum length

    Returns:
        Truncated name with ellipsis if needed
    """
    if len(name) <= max_length:
        return name
    return name[:max_length - 1] + '\u2026'  # Ellipsis character


def format_parameter_value(value: float, minimum: float, maximum: float) -> str:
    """
    Format a parameter value for display.

    Automatically chooses appropriate precision based on range.

    Args:
        value: Current value
        minimum: Minimum value
        maximum: Maximum value

    Returns:
        Formatted value string
    """
    range_size = maximum - minimum

    if range_size == 0:
        return f"{value:.2f}"
    elif range_size < 1:
        return f"{value:.3f}"
    elif range_size < 10:
        return f"{value:.2f}"
    elif range_size < 100:
        return f"{value:.1f}"
    else:
        return f"{value:.0f}"


def calculate_percentage(value: float, minimum: float, maximum: float) -> float:
    """
    Calculate percentage position of value within a range.

    Args:
        value: Current value
        minimum: Range minimum
        maximum: Range maximum

    Returns:
        Percentage (0.0 to 100.0)
    """
    if maximum <= minimum:
        return 0.0
    return ((value - minimum) / (maximum - minimum)) * 100.0


class RefreshDebouncer:
    """
    Debouncer for widget refresh calls to prevent excessive re-rendering.

    Usage in a Textual widget:
        def __init__(self):
            self._refresh_debouncer = RefreshDebouncer(delay_ms=50)

        def some_update_method(self):
            # Instead of: self.refresh(layout=True)
            self._refresh_debouncer.request_refresh(self)

    This will batch multiple rapid refresh requests into a single refresh
    after the delay period.
    """

    def __init__(self, delay_ms: float = 50):
        """
        Initialize debouncer.

        Args:
            delay_ms: Delay in milliseconds before executing refresh
        """
        self.delay_ms = delay_ms
        self._pending_refresh: Optional[asyncio.Task] = None
        self._last_request_time: float = 0
        self._widget = None

    def request_refresh(self, widget: Any, layout: bool = True) -> None:
        """
        Request a debounced refresh.

        Args:
            widget: The Textual widget to refresh
            layout: Whether to recalculate layout
        """
        self._widget = widget
        self._last_request_time = time.time()
        self._layout = layout

        # Cancel any pending refresh
        if self._pending_refresh and not self._pending_refresh.done():
            self._pending_refresh.cancel()

        # Schedule new refresh
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                self._pending_refresh = asyncio.create_task(self._delayed_refresh())
        except RuntimeError:
            # No event loop, do immediate refresh
            if self._widget:
                self._widget.refresh(layout=layout)

    async def _delayed_refresh(self) -> None:
        """Execute the refresh after delay."""
        await asyncio.sleep(self.delay_ms / 1000.0)
        if self._widget:
            self._widget.refresh(layout=self._layout)
            self._pending_refresh = None

    def cancel(self) -> None:
        """Cancel any pending refresh."""
        if self._pending_refresh and not self._pending_refresh.done():
            self._pending_refresh.cancel()
            self._pending_refresh = None


class ThrottledUpdater:
    """
    Throttle updates to ensure a minimum interval between executions.

    Unlike debouncing (which waits for quiet), throttling ensures updates
    happen at most once per interval, useful for real-time displays.

    Usage:
        throttled = ThrottledUpdater(interval_ms=100)

        def update_display(data):
            if throttled.should_update():
                # Actually update the display
                ...
    """

    def __init__(self, interval_ms: float = 100):
        """
        Initialize throttler.

        Args:
            interval_ms: Minimum interval between updates in milliseconds
        """
        self.interval_ms = interval_ms
        self._last_update: float = 0

    def should_update(self) -> bool:
        """
        Check if enough time has passed for another update.

        Returns:
            True if update should proceed, False if throttled
        """
        now = time.time()
        elapsed_ms = (now - self._last_update) * 1000

        if elapsed_ms >= self.interval_ms:
            self._last_update = now
            return True
        return False

    def reset(self) -> None:
        """Reset the throttle timer."""
        self._last_update = 0


def debounced_refresh(delay_ms: float = 50):
    """
    Decorator to debounce a method that triggers widget refresh.

    Usage:
        class MyWidget(Container):
            @debounced_refresh(delay_ms=50)
            def update_data(self, new_data):
                self.data = new_data
                # refresh will be called automatically after delay

    Args:
        delay_ms: Delay before refresh in milliseconds
    """
    def decorator(func: Callable) -> Callable:
        _debouncer = RefreshDebouncer(delay_ms=delay_ms)

        @wraps(func)
        def wrapper(self, *args, **kwargs):
            result = func(self, *args, **kwargs)
            _debouncer.request_refresh(self, layout=True)
            return result

        return wrapper
    return decorator

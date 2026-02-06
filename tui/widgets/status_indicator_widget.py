"""
Status Indicator Widget - Color-coded status display
Shows status with color coding and optional metrics.
"""

from typing import Optional
from enum import Enum

try:
    from textual.app import ComposeResult
    from textual.containers import Horizontal, Vertical
    from textual.widgets import Static, Label
    from textual.reactive import reactive
except ImportError:
    pass


class StatusLevel(str, Enum):
    """Status level with colors."""
    OK = "ok"
    WARNING = "warning"
    CRITICAL = "critical"
    OFFLINE = "offline"
    UNKNOWN = "unknown"


class StatusIndicatorWidget(Static):
    """
    Color-coded status indicator widget.
    
    Displays status with color-coded background and optional additional info.
    Useful for showing node status, flow health, etc.
    
    Example:
        indicator = StatusIndicatorWidget(
            label="Node 1",
            status=StatusLevel.OK,
            message="Online and healthy"
        )
        yield indicator
    """
    
    DEFAULT_CSS = """
    StatusIndicatorWidget {
        width: 100%;
        height: auto;
        padding: 0 1;
        margin: 0 0;
    }
    
    StatusIndicatorWidget.status-ok {
        background: $success;
        color: $text;
    }
    
    StatusIndicatorWidget.status-warning {
        background: $warning;
        color: $text;
    }
    
    StatusIndicatorWidget.status-critical {
        background: $error;
        color: $text;
    }
    
    StatusIndicatorWidget.status-offline {
        background: #333333;
        color: $text-muted;
    }
    
    StatusIndicatorWidget.status-unknown {
        background: #555555;
        color: $text-muted;
    }
    
    .status-content {
        width: 100%;
        height: auto;
    }
    
    .status-main {
        width: 100%;
        height: 1;
        text-style: bold;
    }
    
    .status-detail {
        width: 100%;
        height: auto;
        color: $text-muted;
    }
    """
    
    # Reactive properties
    status: reactive[StatusLevel] = reactive(StatusLevel.UNKNOWN)
    label: reactive[str] = reactive("")
    message: reactive[str] = reactive("")
    
    def __init__(
        self,
        label: str = "",
        status: StatusLevel = StatusLevel.UNKNOWN,
        message: str = "",
        id: Optional[str] = None,
        **kwargs
    ):
        """
        Initialize status indicator.
        
        Args:
            label: Status label (e.g., "Node 1")
            status: StatusLevel
            message: Optional detailed message
            id: Widget ID
        """
        super().__init__(id=id, **kwargs)
        self.label = label
        self.status = status
        self.message = message
    
    def compose(self) -> ComposeResult:
        """Compose the indicator."""
        with Vertical(classes="status-content"):
            yield Label("...", classes="status-main")
            if self.message:
                yield Label("...", classes="status-detail")
    
    async def on_mount(self) -> None:
        """Update display on mount."""
        self._update_display()
    
    def _update_display(self) -> None:
        """Update status display."""
        # Update class for color coding
        self.set_class(True, f"status-{self.status.value}")
        
        # Update labels
        try:
            main_label = self.query_one(".status-main", Label)
            main_label.update(f"● {self.label}")
            
            if self.message:
                try:
                    detail_label = self.query_one(".status-detail", Label)
                    detail_label.update(self.message)
                except:
                    pass
        except:
            pass
    
    def watch_status(self, old: StatusLevel, new: StatusLevel) -> None:
        """Update when status changes."""
        # Remove old class
        if old:
            self.set_class(False, f"status-{old.value}")
        # Add new class
        if new:
            self.set_class(True, f"status-{new.value}")
        self._update_display()
    
    def watch_label(self, value: str) -> None:
        """Update when label changes."""
        self._update_display()
    
    def watch_message(self, value: str) -> None:
        """Update when message changes."""
        self._update_display()
    
    def set_status(self, status: StatusLevel, message: str = "") -> None:
        """Set status and optional message."""
        self.status = status
        if message:
            self.message = message
    
    def get_status(self) -> StatusLevel:
        """Get current status."""
        return self.status

"""
Notification Widget - Toast and popup notifications
Displays notifications with auto-dismiss and severity levels.
"""

import asyncio
from typing import Optional, List
from enum import Enum
from dataclasses import dataclass

try:
    from textual.app import ComposeResult
    from textual.containers import Vertical
    from textual.widgets import Static, Label
    from textual.reactive import reactive
except ImportError:
    pass


class NotificationSeverity(str, Enum):
    """Notification severity levels."""
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"


@dataclass
class Notification:
    """Single notification."""
    message: str
    severity: NotificationSeverity = NotificationSeverity.INFO
    duration_seconds: Optional[float] = 3.0
    dismiss_callback: Optional[callable] = None


class NotificationWidget(Static):
    """
    Toast notification widget for messages.
    
    Displays notifications with auto-dismiss, showing multiple
    notifications in a queue.
    
    Example:
        notif = NotificationWidget()
        yield notif
        
        # Later, show notifications:
        notif.show("Operation successful", NotificationSeverity.SUCCESS)
    """
    
    DEFAULT_CSS = """
    NotificationWidget {
        width: 100%;
        height: auto;
        background: transparent;
        padding: 0;
        margin: 0;
    }
    
    .notification {
        width: 100%;
        height: auto;
        padding: 1 2;
        margin: 0 0 1 0;
        border: solid;
    }
    
    .notification.info {
        background: $panel;
        border-color: $primary;
        color: $text;
    }
    
    .notification.success {
        background: $surface;
        border-color: $success;
        color: $text;
    }
    
    .notification.warning {
        background: $surface;
        border-color: $warning;
        color: $text;
    }
    
    .notification.error {
        background: $surface;
        border-color: $error;
        color: $error;
    }
    
    .notification-text {
        width: 100%;
        height: auto;
        text-style: bold;
    }
    """
    
    def __init__(
        self,
        max_notifications: int = 5,
        id: Optional[str] = None,
        **kwargs
    ):
        """
        Initialize notification widget.
        
        Args:
            max_notifications: Maximum notifications to show
            id: Widget ID
        """
        super().__init__(id=id, **kwargs)
        self.max_notifications = max_notifications
        self.notifications: List[Notification] = []
    
    def compose(self) -> ComposeResult:
        """Compose notification container."""
        with Vertical():
            yield Label("Notifications ready", classes="notification-text")
    
    def show(
        self,
        message: str,
        severity: NotificationSeverity = NotificationSeverity.INFO,
        duration_seconds: Optional[float] = 3.0
    ) -> None:
        """
        Show a notification.
        
        Args:
            message: Notification message
            severity: NotificationSeverity level
            duration_seconds: Auto-dismiss after this many seconds (None = no auto-dismiss)
        """
        notification = Notification(message, severity, duration_seconds)
        self.notifications.append(notification)
        self._render_notifications()
        
        # Auto-dismiss if duration specified
        if duration_seconds:
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(self._auto_dismiss(notification, duration_seconds))
            except RuntimeError:
                # No running loop (e.g., synchronous unit tests) - keep notification.
                pass
    
    async def _auto_dismiss(self, notification: Notification, delay: float) -> None:
        """Auto-dismiss notification after delay."""
        await asyncio.sleep(delay)
        if notification in self.notifications:
            self.notifications.remove(notification)
            self._render_notifications()
    
    def _render_notifications(self) -> None:
        """Render current notifications."""
        try:
            container = self.query_one(Vertical)
            container.children = []
            
            # Limit to max notifications
            visible = self.notifications[-self.max_notifications:]
            
            for notif in visible:
                label = Label(
                    f"● {notif.message}",
                    classes=f"notification {notif.severity.value}"
                )
                container.mount(label)
        except:
            pass
    
    def clear(self) -> None:
        """Clear all notifications."""
        self.notifications.clear()
        self._render_notifications()
    
    def dismiss_all(self) -> None:
        """Dismiss all notifications."""
        self.clear()
    
    def get_notifications(self) -> List[Notification]:
        """Get list of current notifications."""
        return self.notifications.copy()

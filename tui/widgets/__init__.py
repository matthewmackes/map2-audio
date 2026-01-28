"""
TUI Widgets Package
"""

from widgets.sidebar_widget import SidebarWidget
from widgets.context_panel_widget import ContextPanelWidget
from widgets.breadcrumb_widget import BreadcrumbWidget
from widgets.enhanced_status_bar_widget import EnhancedStatusBarWidget

__all__ = [
    'SidebarWidget',
    'ContextPanelWidget',
    'BreadcrumbWidget',
    'EnhancedStatusBarWidget',
]

class ActionButton:
    """Placeholder for ActionButton widget."""
    def __init__(self, label: str, action: Callable):
        self.label = label
        self.action = action

class StatusIndicator:
    """Placeholder for StatusIndicator widget."""
    def __init__(self, status: str):
        self.status = status

class LoadingIndicator:
    """Placeholder for LoadingIndicator widget."""
    def __init__(self):
        pass

class MixControl:
    """Placeholder for MixControl widget."""
    def __init__(self, mix: float):
        self.mix = mix

class BypassToggle:
    """Placeholder for BypassToggle widget."""
    def __init__(self, bypassed: bool = False):
        self.bypassed = bypassed

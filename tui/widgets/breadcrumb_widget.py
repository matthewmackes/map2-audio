"""
Breadcrumb Widget - Navigation Trail
Shows: Current tab, current section, current item
"""

import logging
from textual.widgets import Static
from textual.binding import Binding

logger = logging.getLogger(__name__)


class BreadcrumbWidget(Static):
    """
    Breadcrumb navigation showing current location in the interface.
    Helps users understand where they are and navigate back.
    """
    
    BINDINGS = [
        Binding("alt+left", "go_back", "Back", show=False),
        Binding("alt+right", "go_forward", "Forward", show=False),
    ]
    
    def __init__(self, api_client=None):
        super().__init__()
        self.api_client = api_client
        self.id = "breadcrumb"
        self.history = ["Home"]
        self.current_index = 0
    
    def render(self) -> str:
        """Render breadcrumb navigation."""
        # Build breadcrumb path
        if len(self.history) == 0:
            path = "📊 Dashboard"
        else:
            path = " › ".join(self.history[:self.current_index + 1])
        
        return f"🏠 {path}"
    
    def update_breadcrumb(self, tab_name: str, section: str = "", item: str = "") -> None:
        """
        Update breadcrumb with new location.
        
        Args:
            tab_name: Current tab name
            section: Optional section within tab
            item: Optional item within section
        """
        self.history = [tab_name]
        if section:
            self.history.append(section)
        if item:
            self.history.append(item)
        self.current_index = len(self.history) - 1
        self.refresh()
    
    def action_go_back(self) -> None:
        """Navigate back in history."""
        if self.current_index > 0:
            self.current_index -= 1
            self.refresh()
    
    def action_go_forward(self) -> None:
        """Navigate forward in history."""
        if self.current_index < len(self.history) - 1:
            self.current_index += 1
            self.refresh()

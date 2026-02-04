"""
Base Screen Class
=================
Provides consistent interface for all screens with state management.
"""

import logging
from typing import Any, Dict, Optional, TYPE_CHECKING
from textual.screen import Screen
from textual.widget import Widget
from .screen_state import screen_state

if TYPE_CHECKING:
    from api_client import MAP2APIClient

logger = logging.getLogger(__name__)


class BaseScreen(Widget):
    """
    Base class for all TUI screens.
    
    Provides:
    - Consistent initialization
    - State persistence
    - Error handling
    - Data caching
    - Loading indicators
    """
    
    screen_name: str = "BaseScreen"
    
    def __init__(self, api_client: Optional["MAP2APIClient"] = None, **kwargs):
        """Initialize screen with API client."""
        super().__init__(**kwargs)
        self.api_client = api_client
        self._loading = False
        self._error_message: Optional[str] = None
        self._last_update: Optional[float] = None
    
    def on_mount(self) -> None:
        """Called when screen is mounted."""
        # Restore saved state if available
        saved_state = screen_state.load_screen_state(self.screen_name)
        if saved_state:
            self.restore_state(saved_state)
            logger.debug(f"Restored state for {self.screen_name}")
    
    def on_unmount(self) -> None:
        """Called when screen is unmounted."""
        # Save current state
        state = self.get_state()
        if state:
            screen_state.save_screen_state(self.screen_name, state)
            logger.debug(f"Saved state for {self.screen_name}")
    
    def get_state(self) -> Dict[str, Any]:
        """Get current screen state for persistence. Override in subclasses."""
        return {}
    
    def restore_state(self, state: Dict[str, Any]) -> None:
        """Restore screen state from saved data. Override in subclasses."""
        pass
    
    async def load_data(self) -> None:
        """Load data for screen. Override in subclasses."""
        pass
    
    async def refresh_data(self, force: bool = False) -> None:
        """Refresh screen data with optional cache bypass."""
        self._loading = True
        try:
            await self.load_data()
            self._error_message = None
        except Exception as e:
            self._error_message = str(e)
            logger.error(f"Error loading data for {self.screen_name}: {e}")
        finally:
            self._loading = False
    
    def show_loading(self) -> None:
        """Show loading indicator."""
        self._loading = True
    
    def hide_loading(self) -> None:
        """Hide loading indicator."""
        self._loading = False
    
    def show_error(self, message: str) -> None:
        """Show error message to user."""
        self._error_message = message
        logger.error(f"{self.screen_name}: {message}")
    
    def clear_error(self) -> None:
        """Clear error message."""
        self._error_message = None
    
    def get_cached_data(self, key: str) -> Optional[Any]:
        """Get data from cache."""
        cache_key = f"{self.screen_name}:{key}"
        return screen_state.get_cached_data(cache_key)
    
    def cache_data(self, key: str, data: Any, ttl: int = 300) -> None:
        """Cache data with TTL."""
        cache_key = f"{self.screen_name}:{key}"
        screen_state.cache_data(cache_key, data, ttl)

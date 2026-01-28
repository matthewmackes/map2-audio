"""
Screen State Management
========================
Manages screen state persistence, scroll positions, selections, and cached data.
"""

import json
import logging
from typing import Any, Dict, Optional
from pathlib import Path
import hashlib

logger = logging.getLogger(__name__)


class ScreenState:
    """Manages persistent state for screens."""
    
    STATE_DIR = Path.home() / ".config" / "map2" / "tui_state"
    
    def __init__(self):
        """Initialize screen state manager."""
        self.STATE_DIR.mkdir(parents=True, exist_ok=True)
        self._state_cache: Dict[str, Dict[str, Any]] = {}
        self._data_cache: Dict[str, Any] = {}
        self._timestamps: Dict[str, float] = {}
    
    def _get_state_file(self, screen_name: str) -> Path:
        """Get state file path for screen."""
        safe_name = hashlib.md5(screen_name.encode()).hexdigest()[:8]
        return self.STATE_DIR / f"{screen_name}_{safe_name}.json"
    
    def save_screen_state(self, screen_name: str, state: Dict[str, Any]) -> None:
        """Save screen state (scroll position, selections, etc)."""
        try:
            self._state_cache[screen_name] = state
            state_file = self._get_state_file(screen_name)
            state_file.write_text(json.dumps(state, indent=2))
            logger.debug(f"Saved state for screen: {screen_name}")
        except Exception as e:
            logger.error(f"Failed to save screen state: {e}")
    
    def load_screen_state(self, screen_name: str) -> Optional[Dict[str, Any]]:
        """Load saved screen state."""
        # Check cache first
        if screen_name in self._state_cache:
            return self._state_cache[screen_name]
        
        try:
            state_file = self._get_state_file(screen_name)
            if state_file.exists():
                state = json.loads(state_file.read_text())
                self._state_cache[screen_name] = state
                return state
        except Exception as e:
            logger.error(f"Failed to load screen state: {e}")
        
        return None
    
    def cache_data(self, key: str, data: Any, ttl: int = 300) -> None:
        """Cache computed data with TTL."""
        import time
        self._data_cache[key] = data
        self._timestamps[key] = time.time() + ttl
    
    def get_cached_data(self, key: str) -> Optional[Any]:
        """Get cached data if not expired."""
        import time
        if key in self._data_cache:
            if self._timestamps.get(key, 0) > time.time():
                logger.debug(f"Cache hit for: {key}")
                return self._data_cache[key]
            else:
                # Expired
                del self._data_cache[key]
                del self._timestamps[key]
        return None
    
    def clear_expired(self) -> None:
        """Clear all expired cache entries."""
        import time
        now = time.time()
        expired = [k for k, ts in self._timestamps.items() if ts <= now]
        for k in expired:
            del self._data_cache[k]
            del self._timestamps[k]
        if expired:
            logger.debug(f"Cleared {len(expired)} expired cache entries")
    
    def clear_all(self) -> None:
        """Clear all state and cache."""
        self._state_cache.clear()
        self._data_cache.clear()
        self._timestamps.clear()
        logger.info("Cleared all screen state and cache")


# Global instance
screen_state = ScreenState()

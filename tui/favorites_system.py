"""
Favorites & Quick Actions System
================================
Manage favorite chains, actions, and quick access shortcuts.
"""

import json
import logging
from typing import List, Dict, Any, Optional
from pathlib import Path
from dataclasses import dataclass, asdict
import time

logger = logging.getLogger(__name__)


@dataclass
class Favorite:
    """A favorite item."""
    id: str
    name: str
    type: str  # "chain", "action", "view"
    data: Dict[str, Any]
    icon: str = ""
    created_at: float = None
    last_accessed: float = None
    access_count: int = 0
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = time.time()


class FavoritesManager:
    """Manages favorite items and quick actions."""
    
    FAVORITES_FILE = Path.home() / ".config" / "map2" / "favorites.json"
    
    def __init__(self):
        """Initialize favorites manager."""
        self.FAVORITES_FILE.parent.mkdir(parents=True, exist_ok=True)
        self._favorites: Dict[str, Favorite] = {}
        self._quick_actions: List[Dict[str, Any]] = []
        self._load()
    
    def add_favorite(self, item_id: str, name: str, item_type: str, 
                    data: Dict[str, Any], icon: str = "") -> Favorite:
        """Add an item to favorites."""
        fav = Favorite(
            id=item_id,
            name=name,
            type=item_type,
            data=data,
            icon=icon
        )
        self._favorites[item_id] = fav
        self._save()
        logger.debug(f"Added favorite: {name}")
        return fav
    
    def remove_favorite(self, item_id: str) -> bool:
        """Remove item from favorites."""
        if item_id in self._favorites:
            del self._favorites[item_id]
            self._save()
            logger.debug(f"Removed favorite: {item_id}")
            return True
        return False
    
    def get_favorite(self, item_id: str) -> Optional[Favorite]:
        """Get favorite by ID."""
        return self._favorites.get(item_id)
    
    def list_favorites(self, item_type: Optional[str] = None) -> List[Favorite]:
        """List all favorites, optionally filtered by type."""
        favs = list(self._favorites.values())
        if item_type:
            favs = [f for f in favs if f.type == item_type]
        # Sort by most recently accessed
        return sorted(favs, key=lambda f: f.last_accessed or 0, reverse=True)
    
    def access_favorite(self, item_id: str) -> None:
        """Mark favorite as accessed."""
        if item_id in self._favorites:
            fav = self._favorites[item_id]
            fav.last_accessed = time.time()
            fav.access_count += 1
            self._save()
    
    def add_quick_action(self, name: str, action: str, icon: str = "", 
                        position: int = -1) -> Dict[str, Any]:
        """Add a quick action button."""
        quick_action = {
            "name": name,
            "action": action,
            "icon": icon,
            "enabled": True
        }
        if position == -1:
            self._quick_actions.append(quick_action)
        else:
            self._quick_actions.insert(position, quick_action)
        self._save()
        logger.debug(f"Added quick action: {name}")
        return quick_action
    
    def remove_quick_action(self, name: str) -> bool:
        """Remove quick action by name."""
        original_len = len(self._quick_actions)
        self._quick_actions = [a for a in self._quick_actions if a["name"] != name]
        if len(self._quick_actions) < original_len:
            self._save()
            logger.debug(f"Removed quick action: {name}")
            return True
        return False
    
    def get_quick_actions(self) -> List[Dict[str, Any]]:
        """Get all quick actions."""
        return self._quick_actions.copy()
    
    def reorder_quick_actions(self, new_order: List[str]) -> None:
        """Reorder quick actions."""
        actions_by_name = {a["name"]: a for a in self._quick_actions}
        self._quick_actions = [actions_by_name[name] for name in new_order if name in actions_by_name]
        self._save()
        logger.debug("Reordered quick actions")
    
    def toggle_quick_action(self, name: str) -> None:
        """Toggle quick action enabled state."""
        for action in self._quick_actions:
            if action["name"] == name:
                action["enabled"] = not action["enabled"]
                self._save()
                break
    
    def _save(self) -> None:
        """Save favorites and quick actions to file."""
        try:
            data = {
                "favorites": {
                    fid: {
                        **asdict(fav),
                        "created_at": fav.created_at,
                        "last_accessed": fav.last_accessed
                    }
                    for fid, fav in self._favorites.items()
                },
                "quick_actions": self._quick_actions
            }
            self.FAVORITES_FILE.write_text(json.dumps(data, indent=2))
            logger.debug("Saved favorites and quick actions")
        except Exception as e:
            logger.error(f"Failed to save favorites: {e}")
    
    def _load(self) -> None:
        """Load favorites and quick actions from file."""
        if not self.FAVORITES_FILE.exists():
            logger.debug("No favorites file found, starting fresh")
            return
        
        try:
            data = json.loads(self.FAVORITES_FILE.read_text())
            
            # Load favorites
            for fid, fav_data in data.get("favorites", {}).items():
                fav = Favorite(
                    id=fav_data["id"],
                    name=fav_data["name"],
                    type=fav_data["type"],
                    data=fav_data["data"],
                    icon=fav_data.get("icon", ""),
                    created_at=fav_data.get("created_at"),
                    last_accessed=fav_data.get("last_accessed"),
                    access_count=fav_data.get("access_count", 0)
                )
                self._favorites[fid] = fav
            
            # Load quick actions
            self._quick_actions = data.get("quick_actions", [])
            
            logger.debug(f"Loaded {len(self._favorites)} favorites and {len(self._quick_actions)} quick actions")
        except Exception as e:
            logger.error(f"Failed to load favorites: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get favorites statistics."""
        return {
            "total_favorites": len(self._favorites),
            "chains": len([f for f in self._favorites.values() if f.type == "chain"]),
            "actions": len([f for f in self._favorites.values() if f.type == "action"]),
            "views": len([f for f in self._favorites.values() if f.type == "view"]),
            "quick_actions": len(self._quick_actions),
            "most_accessed": sorted(
                self._favorites.values(),
                key=lambda f: f.access_count,
                reverse=True
            )[:5]
        }


# Global instance
favorites_manager = FavoritesManager()

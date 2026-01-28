"""
Custom Keybindings System
=========================
Interactive configuration and management of keyboard shortcuts.
"""

import json
import logging
from typing import Dict, List, Optional, Tuple
from pathlib import Path
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)


@dataclass
class KeyBinding:
    """A keyboard binding."""
    key: str
    action: str
    description: str
    profile: str = "default"
    enabled: bool = True
    
    def __hash__(self):
        return hash(self.key)


class KeyBindingManager:
    """Manages custom keyboard bindings and profiles."""
    
    BINDINGS_FILE = Path.home() / ".config" / "map2" / "keybindings.json"
    
    DEFAULT_BINDINGS = {
        "default": {
            "ctrl+f": ("search", "Universal search"),
            "ctrl+k": ("command_palette", "Show command palette"),
            "1-9": ("goto_tab", "Jump to tab"),
            "left": ("prev_tab", "Previous tab"),
            "right": ("next_tab", "Next tab"),
            "r": ("refresh", "Refresh screen"),
            "ctrl+r": ("hot_reload", "Hot reload modules"),
            "ctrl+z": ("undo", "Undo last action"),
            "ctrl+y": ("redo", "Redo last action"),
            "ctrl+s": ("save_favorites", "Save as favorite"),
            "ctrl+d": ("toggle_dark_mode", "Toggle dark mode"),
            "ctrl+h": ("toggle_help", "Toggle help"),
            "?": ("show_help", "Show help"),
            "q": ("quit", "Quit"),
        },
        "vim": {
            "/": ("search", "Universal search"),
            ":": ("command_palette", "Show command palette"),
            "h": ("prev_tab", "Previous tab"),
            "l": ("next_tab", "Next tab"),
            "r": ("refresh", "Refresh screen"),
            "u": ("undo", "Undo last action"),
            "ctrl+r": ("redo", "Redo last action"),
            "m": ("save_favorites", "Save as favorite"),
        },
        "emacs": {
            "ctrl+s": ("search", "Universal search"),
            "ctrl+x": ("command_palette", "Show command palette"),
            "ctrl+b": ("prev_tab", "Previous tab"),
            "ctrl+f": ("next_tab", "Next tab"),
            "ctrl+_": ("undo", "Undo last action"),
        }
    }
    
    def __init__(self):
        """Initialize keybinding manager."""
        self.BINDINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        self._bindings: Dict[str, Dict[str, Tuple[str, str]]] = {}
        self._profiles: List[str] = ["default", "vim", "emacs"]
        self._current_profile = "default"
        self._conflicts: List[Tuple[str, str, str]] = []  # (key, profile1, profile2)
        self._load()
    
    def load_profile(self, profile_name: str) -> bool:
        """Load a keybinding profile."""
        if profile_name not in self._profiles:
            logger.error(f"Profile not found: {profile_name}")
            return False
        
        self._current_profile = profile_name
        logger.info(f"Loaded keybinding profile: {profile_name}")
        return True
    
    def get_current_profile(self) -> str:
        """Get current active profile."""
        return self._current_profile
    
    def get_profiles(self) -> List[str]:
        """Get available profiles."""
        return self._profiles.copy()
    
    def create_profile(self, name: str, base_profile: str = "default") -> bool:
        """Create a new keybinding profile."""
        if name in self._profiles:
            logger.error(f"Profile already exists: {name}")
            return False
        
        self._profiles.append(name)
        if base_profile in self._bindings:
            self._bindings[name] = self._bindings[base_profile].copy()
        else:
            self._bindings[name] = {}
        
        self._save()
        logger.info(f"Created keybinding profile: {name}")
        return True
    
    def set_binding(self, key: str, action: str, description: str, 
                   profile: Optional[str] = None) -> bool:
        """Set a keybinding."""
        profile = profile or self._current_profile
        
        if profile not in self._bindings:
            self._bindings[profile] = {}
        
        # Check for conflicts
        conflicts = self._check_conflicts(key, profile)
        if conflicts:
            logger.warning(f"Key binding conflict: {key} in {conflicts}")
        
        self._bindings[profile][key] = (action, description)
        self._save()
        logger.debug(f"Set binding: {key} -> {action}")
        return True
    
    def get_binding(self, key: str, profile: Optional[str] = None) -> Optional[Tuple[str, str]]:
        """Get a keybinding."""
        profile = profile or self._current_profile
        
        if profile in self._bindings:
            return self._bindings[profile].get(key)
        return None
    
    def get_all_bindings(self, profile: Optional[str] = None) -> Dict[str, Tuple[str, str]]:
        """Get all keybindings for a profile."""
        profile = profile or self._current_profile
        return self._bindings.get(profile, {}).copy()
    
    def remove_binding(self, key: str, profile: Optional[str] = None) -> bool:
        """Remove a keybinding."""
        profile = profile or self._current_profile
        
        if profile in self._bindings and key in self._bindings[profile]:
            del self._bindings[profile][key]
            self._save()
            logger.debug(f"Removed binding: {key}")
            return True
        return False
    
    def reset_profile(self, profile: str) -> bool:
        """Reset profile to defaults."""
        if profile not in self.DEFAULT_BINDINGS:
            logger.error(f"No default for profile: {profile}")
            return False
        
        self._bindings[profile] = self.DEFAULT_BINDINGS[profile].copy()
        self._save()
        logger.info(f"Reset profile to defaults: {profile}")
        return True
    
    def check_conflicts(self) -> Dict[str, List[Tuple[str, str]]]:
        """Check for key binding conflicts across profiles."""
        conflicts = {}
        
        all_keys = set()
        for bindings in self._bindings.values():
            all_keys.update(bindings.keys())
        
        for key in all_keys:
            profiles_with_key = [
                p for p, bindings in self._bindings.items() if key in bindings
            ]
            if len(profiles_with_key) > 1:
                actions = [
                    (p, self._bindings[p][key][0]) for p in profiles_with_key
                ]
                conflicts[key] = actions
        
        return conflicts
    
    def _check_conflicts(self, key: str, profile: str) -> List[str]:
        """Check if a key conflicts with other profiles."""
        conflicts = []
        for p, bindings in self._bindings.items():
            if p != profile and key in bindings:
                conflicts.append(p)
        return conflicts
    
    def export_profile(self, profile: str = None) -> str:
        """Export profile as JSON."""
        profile = profile or self._current_profile
        bindings = self._bindings.get(profile, {})
        return json.dumps(bindings, indent=2)
    
    def import_profile(self, profile_name: str, data: str) -> bool:
        """Import profile from JSON."""
        try:
            bindings = json.loads(data)
            self._bindings[profile_name] = bindings
            if profile_name not in self._profiles:
                self._profiles.append(profile_name)
            self._save()
            logger.info(f"Imported profile: {profile_name}")
            return True
        except Exception as e:
            logger.error(f"Failed to import profile: {e}")
            return False
    
    def _save(self) -> None:
        """Save bindings to file."""
        try:
            data = {
                "profiles": self._profiles,
                "current_profile": self._current_profile,
                "bindings": self._bindings
            }
            self.BINDINGS_FILE.write_text(json.dumps(data, indent=2))
            logger.debug("Saved keybindings")
        except Exception as e:
            logger.error(f"Failed to save keybindings: {e}")
    
    def _load(self) -> None:
        """Load bindings from file."""
        if self.BINDINGS_FILE.exists():
            try:
                data = json.loads(self.BINDINGS_FILE.read_text())
                self._profiles = data.get("profiles", self._profiles)
                self._current_profile = data.get("current_profile", "default")
                self._bindings = data.get("bindings", {})
                logger.debug("Loaded keybindings from file")
            except Exception as e:
                logger.error(f"Failed to load keybindings: {e}")
        
        # Ensure defaults exist
        for profile, defaults in self.DEFAULT_BINDINGS.items():
            if profile not in self._bindings:
                self._bindings[profile] = defaults.copy()


# Global instance
keybinding_manager = KeyBindingManager()

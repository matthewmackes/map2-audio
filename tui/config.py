"""
Configuration System
====================
Manages application configuration, themes, key bindings, and defaults.
"""

import json
import logging
from typing import Any, Dict, Optional
from pathlib import Path
from dataclasses import dataclass, asdict
from enum import Enum

logger = logging.getLogger(__name__)


class Theme(Enum):
    """Available themes."""
    DARK = "textual-dark"
    DEFAULT = "default"
    NORD = "nord"


@dataclass
class KeyBindings:
    """Keyboard shortcuts configuration."""
    next_tab: str = "right"
    prev_tab: str = "left"
    refresh: str = "r"
    hot_reload: str = "ctrl+r"
    quit: str = "q"
    help: str = "?"
    search: str = "ctrl+f"


@dataclass
class UIConfig:
    """UI configuration."""
    theme: Theme = Theme.DARK
    show_status_bar: bool = True
    show_metrics: bool = True
    screen_cache_size: int = 4
    refresh_interval: int = 2  # seconds
    data_cache_ttl: int = 300  # seconds


@dataclass
class AppConfig:
    """Main application configuration."""
    api_base_url: str = "http://localhost:8080"
    api_timeout: int = 30
    log_level: str = "INFO"
    keybindings: KeyBindings = None
    ui: UIConfig = None
    
    def __post_init__(self):
        """Set defaults after init."""
        if self.keybindings is None:
            self.keybindings = KeyBindings()
        if self.ui is None:
            self.ui = UIConfig()


class ConfigManager:
    """Manages application configuration."""
    
    CONFIG_DIR = Path.home() / ".config" / "map2"
    CONFIG_FILE = CONFIG_DIR / "tui_config.json"
    
    def __init__(self):
        """Initialize config manager."""
        self.CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        self.config = self._load_config()
    
    def _load_config(self) -> AppConfig:
        """Load configuration from file or use defaults. Raises on error."""
        if self.CONFIG_FILE.exists():
            try:
                data = json.loads(self.CONFIG_FILE.read_text())
                logger.info(f"Loaded config from {self.CONFIG_FILE}")
                # Convert to proper types
                if "ui" in data:
                    data["ui"] = UIConfig(**data["ui"])
                if "keybindings" in data:
                    data["keybindings"] = KeyBindings(**data["keybindings"])
                return AppConfig(**data)
            except Exception as e:
                logger.error(f"Failed to load config: {e}")
                raise RuntimeError(f"Configuration load failed: {e}")
        return AppConfig()

    def try_load_config(self) -> (AppConfig, str):
        """Try to load config, return (config, error_message)."""
        if self.CONFIG_FILE.exists():
            try:
                data = json.loads(self.CONFIG_FILE.read_text())
                if "ui" in data:
                    data["ui"] = UIConfig(**data["ui"])
                if "keybindings" in data:
                    data["keybindings"] = KeyBindings(**data["keybindings"])
                return AppConfig(**data), ""
            except Exception as e:
                return AppConfig(), f"Failed to load config: {e}"
        return AppConfig(), ""
    
    def save_config(self) -> None:
        """Save current configuration to file."""
        try:
            data = asdict(self.config)
            # Convert enums to strings
            if isinstance(data["ui"]["theme"], Theme):
                data["ui"]["theme"] = data["ui"]["theme"].value
            
            self.CONFIG_FILE.write_text(json.dumps(data, indent=2))
            logger.info(f"Saved config to {self.CONFIG_FILE}")
        except Exception as e:
            logger.error(f"Failed to save config: {e}")
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get config value by dot-notation path."""
        parts = key.split(".")
        value = self.config
        
        for part in parts:
            if hasattr(value, part):
                value = getattr(value, part)
            elif isinstance(value, dict) and part in value:
                value = value[part]
            else:
                return default
        
        return value
    
    def set(self, key: str, value: Any) -> None:
        """Set config value by dot-notation path."""
        parts = key.split(".")
        obj = self.config
        
        # Navigate to parent
        for part in parts[:-1]:
            if hasattr(obj, part):
                obj = getattr(obj, part)
            else:
                raise KeyError(f"Invalid config path: {key}")
        
        # Set value
        setattr(obj, parts[-1], value)
        self.save_config()


# Global instance
config = ConfigManager()

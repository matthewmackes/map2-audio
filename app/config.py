"""
Centralized Configuration System for MAP2 Audio Platform

Features:
- JSON file persistence with automatic backup
- Environment variable overrides (MAP2_* prefix)
- Type-safe accessors with validation
- Observer pattern for change notifications
- Schema definition with defaults and descriptions
- Multiple config sections with dot notation access
- Singleton pattern for global access
- Database integration for session-specific settings
"""

from __future__ import annotations

import copy
import json
import logging
import os
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Set

from app.config_schema import CONFIG_SCHEMA, ConfigOption, ConfigSection

logger = logging.getLogger(__name__)


# ============================================================================
# Configuration Manager
# ============================================================================

class ConfigManager:
    """
    Centralized configuration management with file, environment, and database support.

    Features:
    - JSON file persistence with automatic backup
    - Environment variable overrides (MAP2_* prefix)
    - Type-safe accessors with validation
    - Observer pattern for change notifications
    - Schema definition with defaults and descriptions
    """

    _instance: Optional['ConfigManager'] = None
    CONFIG_DIR = Path.home() / ".map2"
    CONFIG_FILE = Path.home() / ".map2" / "config.json"
    CONFIG_BACKUP = Path.home() / ".map2" / "config.backup.json"

    def __init__(self, config_path: Optional[Path] = None):
        """Initialize configuration manager.

        Args:
            config_path: Custom config file path (default: ~/.map2/config.json)
        """
        self.config_path = config_path or self.CONFIG_FILE
        self.config_backup_path = self.CONFIG_BACKUP
        self._config: Dict[str, Any] = {}
        self._observers: Dict[str, Set[Callable[[str, Any, Any], None]]] = {}
        self._dirty = False

        # Ensure config directory exists
        self.CONFIG_DIR.mkdir(parents=True, exist_ok=True)

        # Load configuration
        self._load()

    @classmethod
    def get_instance(cls) -> 'ConfigManager':
        """Get singleton instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load(self) -> None:
        """Load configuration from file, environment, and defaults."""
        # Start with schema defaults
        self._config = self._build_defaults()

        # Load from file
        if self.config_path.exists():
            try:
                with open(self.config_path, 'r') as f:
                    file_config = json.load(f)
                self._merge_config(file_config)
                logger.info(f"Loaded config from {self.config_path}")
            except Exception as e:
                logger.warning(f"Failed to load config file: {e}")

        # Apply environment variable overrides
        self._apply_env_overrides()

    def _build_defaults(self) -> Dict[str, Any]:
        """Build default configuration from schema."""
        config = {}
        for key, option in CONFIG_SCHEMA.items():
            self._set_nested(config, key, option.default)
        return config

    def _set_nested(self, d: Dict, key: str, value: Any) -> None:
        """Set a nested value using dot notation."""
        keys = key.split(".")
        current = d
        for k in keys[:-1]:
            if k not in current:
                current[k] = {}
            current = current[k]
        current[keys[-1]] = value

    def _get_nested(self, d: Dict, key: str, default: Any = None) -> Any:
        """Get a nested value using dot notation."""
        keys = key.split(".")
        current = d
        for k in keys:
            if isinstance(current, dict) and k in current:
                current = current[k]
            else:
                return default
        return current

    def _merge_config(self, source: Dict[str, Any], prefix: str = "") -> None:
        """Recursively merge source config into current config."""
        for key, value in source.items():
            full_key = f"{prefix}.{key}" if prefix else key
            if isinstance(value, dict):
                self._merge_config(value, full_key)
            else:
                self._set_nested(self._config, full_key, value)

    def _apply_env_overrides(self) -> None:
        """Apply environment variable overrides."""
        for key, option in CONFIG_SCHEMA.items():
            if option.env_var:
                env_value = os.environ.get(option.env_var)
                if env_value is not None:
                    try:
                        converted = self._convert_type(env_value, option.value_type)
                        self._set_nested(self._config, key, converted)
                        if not option.sensitive:
                            logger.debug(f"Config override from env: {key}={converted}")
                    except Exception as e:
                        logger.warning(f"Failed to convert env var {option.env_var}: {e}")

    def _convert_type(self, value: str, target_type: type) -> Any:
        """Convert string value to target type."""
        if target_type == bool:
            return value.lower() in ('true', '1', 'yes', 'on')
        elif target_type == int:
            return int(value)
        elif target_type == float:
            return float(value)
        elif target_type == list:
            return json.loads(value) if value.startswith('[') else value.split(',')
        else:
            return value

    def _validate_value(self, key: str, value: Any) -> bool:
        """Validate a configuration value against its schema."""
        option = CONFIG_SCHEMA.get(key)
        if not option:
            return True  # Unknown keys are allowed

        # Type check
        if value is not None and not isinstance(value, option.value_type):
            if option.value_type in (int, float) and isinstance(value, (int, float)):
                pass  # Allow int/float conversion
            else:
                logger.warning(f"Config type mismatch: {key} expected {option.value_type}, got {type(value)}")
                return False

        if option.value_type is list and value is not None and option.element_type is not None:
            for index, item in enumerate(value):
                if not isinstance(item, option.element_type):
                    logger.warning(
                        "Config list element type mismatch: %s[%s] expected %s, got %s",
                        key,
                        index,
                        option.element_type,
                        type(item),
                    )
                    return False

        # Range check
        if option.min_value is not None and value < option.min_value:
            logger.warning(f"Config value below minimum: {key}={value} (min={option.min_value})")
            return False
        if option.max_value is not None and value > option.max_value:
            logger.warning(f"Config value above maximum: {key}={value} (max={option.max_value})")
            return False

        # Choice check
        if option.choices is not None and value not in option.choices:
            logger.warning(f"Config value not in choices: {key}={value} (choices={option.choices})")
            return False

        return True

    def get(self, key: str, default: Any = None) -> Any:
        """
        Get configuration value using dot notation.

        Args:
            key: Configuration key (e.g., 'audio.sample_rate')
            default: Default value if key not found

        Returns:
            Configuration value
        """
        return self._get_nested(self._config, key, default)

    def get_int(self, key: str, default: int = 0) -> int:
        """Get configuration value as integer."""
        value = self.get(key, default)
        return int(value) if value is not None else default

    def get_float(self, key: str, default: float = 0.0) -> float:
        """Get configuration value as float."""
        value = self.get(key, default)
        return float(value) if value is not None else default

    def get_bool(self, key: str, default: bool = False) -> bool:
        """Get configuration value as boolean."""
        value = self.get(key, default)
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ('true', '1', 'yes', 'on')
        return bool(value) if value is not None else default

    def get_str(self, key: str, default: str = "") -> str:
        """Get configuration value as string."""
        value = self.get(key, default)
        return str(value) if value is not None else default

    def get_list(self, key: str, default: Optional[List] = None) -> List:
        """Get configuration value as list."""
        value = self.get(key, default or [])
        return list(value) if value is not None else (default or [])

    def set(self, key: str, value: Any, save: bool = True) -> bool:
        """
        Set configuration value.

        Args:
            key: Configuration key
            value: New value
            save: Whether to persist to file

        Returns:
            True if value was set successfully
            
        Raises:
            ValueError: If the setting is locked for Tier A performance
        """
        # Check if setting is locked (Tier A performance protection)
        if self.is_locked(key):
            raise ValueError(
                f"Configuration key '{key}' is LOCKED for Tier A professional guitar processor performance. "
                f"This setting can only be changed in the systemd service (map2-backend.service) and requires a service restart. "
                f"Locked settings ensure <3ms round-trip latency and prevent buffer size mismatches."
            )
        
        if not self._validate_value(key, value):
            return False

        old_value = self.get(key)
        self._set_nested(self._config, key, value)
        self._dirty = True

        # Notify observers
        self._notify_observers(key, old_value, value)

        if save:
            self.save()

        return True
    
    def is_locked(self, key: str) -> bool:
        """
        Check if a configuration key is locked (cannot be changed at runtime).
        
        Locked settings are critical for Tier A performance and can only be
        changed in the systemd service configuration.
        
        Args:
            key: Configuration key to check
            
        Returns:
            True if the setting is locked, False otherwise
        """
        option = CONFIG_SCHEMA.get(key)
        return option.locked if option else False

    def save(self) -> bool:
        """Save configuration to file."""
        if not self._dirty:
            return True

        try:
            # Backup existing config
            if self.config_path.exists():
                import shutil
                shutil.copy2(self.config_path, self.config_backup_path)

            # Write new config
            with open(self.config_path, 'w') as f:
                json.dump(self._config, f, indent=2)

            self._dirty = False
            logger.info(f"Configuration saved to {self.config_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to save config: {e}")
            return False

    def reload(self) -> None:
        """Reload configuration from file."""
        self._load()
        logger.info("Configuration reloaded")

    def reset_to_defaults(self) -> None:
        """Reset all configuration to defaults."""
        self._config = self._build_defaults()
        self._dirty = True
        self.save()
        logger.info("Configuration reset to defaults")

    def add_observer(self, key_pattern: str, callback: Callable[[str, Any, Any], None]) -> None:
        """
        Add observer for configuration changes.

        Args:
            key_pattern: Key pattern to observe (e.g., 'audio.*' or 'audio.sample_rate')
            callback: Callback(key, old_value, new_value)
        """
        if key_pattern not in self._observers:
            self._observers[key_pattern] = set()
        self._observers[key_pattern].add(callback)

    def remove_observer(self, key_pattern: str, callback: Callable) -> None:
        """Remove observer for configuration changes."""
        if key_pattern in self._observers:
            self._observers[key_pattern].discard(callback)

    def _notify_observers(self, key: str, old_value: Any, new_value: Any) -> None:
        """Notify all matching observers of a config change."""
        for pattern, callbacks in self._observers.items():
            if pattern == key or (pattern.endswith('.*') and key.startswith(pattern[:-2])):
                for callback in callbacks:
                    try:
                        callback(key, old_value, new_value)
                    except Exception as e:
                        logger.error(f"Observer callback error: {e}")

    def get_section(self, section: str) -> Dict[str, Any]:
        """Get all values in a configuration section."""
        return self._get_nested(self._config, section, {})

    def get_all(self) -> Dict[str, Any]:
        """Get entire configuration."""
        return copy.deepcopy(self._config)

    def get_schema(self) -> Dict[str, Dict[str, Any]]:
        """Get configuration schema for documentation/UI."""
        schema = {}
        for key, option in CONFIG_SCHEMA.items():
            schema[key] = {
                "default": option.default,
                "description": option.description,
                "type": option.value_type.__name__,
                "env_var": option.env_var,
                "min": option.min_value,
                "max": option.max_value,
                "choices": option.choices,
                "restart_required": option.restart_required,
                "locked": option.locked,
                "element_type": option.element_type.__name__ if option.element_type else None,
            }
        return schema

    def get_option_info(self, key: str) -> Optional[Dict[str, Any]]:
        """Get schema information for a specific option."""
        option = CONFIG_SCHEMA.get(key)
        if option:
            return {
                "key": option.key,
                "default": option.default,
                "description": option.description,
                "type": option.value_type.__name__,
                "current": self.get(key),
                "locked": option.locked,
                "element_type": option.element_type.__name__ if option.element_type else None,
            }
        return None


# ============================================================================
# Global Access Functions
# ============================================================================

def get_config() -> ConfigManager:
    """Get the global configuration manager instance."""
    return ConfigManager.get_instance()


def config_get(key: str, default: Any = None) -> Any:
    """Convenience function to get config value."""
    return get_config().get(key, default)


def config_set(key: str, value: Any) -> bool:
    """Convenience function to set config value."""
    return get_config().set(key, value)

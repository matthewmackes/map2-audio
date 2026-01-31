"""
Configuration Validation & Hot Reload

Provides JSON Schema validation for all configuration:
- JSON Schema validation
- Config validation endpoint
- Hot reload for non-critical settings
- Config versioning
- Validation in CI/CD
"""

import json
from typing import Dict, Any, Optional, List
from pathlib import Path
from dataclasses import dataclass
from datetime import datetime

from app.utils.logging_utils import get_logger
from app.exceptions import ConfigurationValidationException, ConfigurationNotFoundException

logger = get_logger(__name__)


# JSON Schema for MAP2 configuration
CONFIG_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
        "backend": {
            "type": "object",
            "properties": {
                "host": {"type": "string", "pattern": "^[0-9.]+$"},
                "port": {"type": "integer", "minimum": 1024, "maximum": 65535},
                "workers": {"type": "integer", "minimum": 1, "maximum": 32},
            },
            "required": ["host", "port"],
        },
        "audio": {
            "type": "object",
            "properties": {
                "sample_rate": {"type": "integer", "enum": [44100, 48000, 96000, 192000]},
                "buffer_size": {"type": "integer", "enum": [64, 128, 256, 512, 1024, 2048]},
                "channels": {"type": "integer", "minimum": 1, "maximum": 32},
                "device": {"type": "string"},
            },
            "required": ["sample_rate", "buffer_size"],
        },
        "midi": {
            "type": "object",
            "properties": {
                "enabled": {"type": "boolean"},
                "input_device": {"type": ["string", "null"]},
                "output_device": {"type": ["string", "null"]},
            },
        },
        "plugins": {
            "type": "object",
            "properties": {
                "lv2_paths": {"type": "array", "items": {"type": "string"}},
                "vst3_paths": {"type": "array", "items": {"type": "string"}},
                "max_load_time_ms": {"type": "number", "minimum": 100, "maximum": 10000},
                "enable_sandboxing": {"type": "boolean"},
            },
        },
        "system": {
            "type": "object",
            "properties": {
                "rt_priority": {"type": "integer", "minimum": 0, "maximum": 99},
                "cpu_affinity": {"type": "array", "items": {"type": "integer"}},
                "enable_watchdog": {"type": "boolean"},
            },
        },
    },
}


@dataclass
class ValidationResult:
    """Result of configuration validation."""
    valid: bool
    errors: List[str]
    warnings: List[str]
    timestamp: datetime
    config_version: Optional[str] = None


class ConfigValidator:
    """Validates configuration against schema."""
    
    def __init__(self, schema: Dict[str, Any] = CONFIG_SCHEMA):
        self.schema = schema
        self._validation_cache: Dict[str, ValidationResult] = {}
    
    def validate(self, config: Dict[str, Any], cache_key: Optional[str] = None) -> ValidationResult:
        """
        Validate configuration against schema.
        
        Args:
            config: Configuration dictionary
            cache_key: Optional cache key for result
        
        Returns:
            ValidationResult with errors and warnings
        """
        errors = []
        warnings = []
        
        try:
            # Use jsonschema for validation if available
            try:
                import jsonschema
                validator = jsonschema.Draft7Validator(self.schema)
                schema_errors = list(validator.iter_errors(config))
                
                for error in schema_errors:
                    path = ".".join(str(p) for p in error.path)
                    errors.append(f"{path}: {error.message}")
                    
            except ImportError:
                # Fallback to manual validation
                errors.extend(self._validate_manual(config))
            
            # Additional custom validations
            warnings.extend(self._validate_custom(config))
            
            result = ValidationResult(
                valid=len(errors) == 0,
                errors=errors,
                warnings=warnings,
                timestamp=datetime.now(),
            )
            
            # Cache result
            if cache_key:
                self._validation_cache[cache_key] = result
            
            return result
            
        except Exception as e:
            logger.error(f"Configuration validation error: {e}")
            return ValidationResult(
                valid=False,
                errors=[f"Validation failed: {str(e)}"],
                warnings=[],
                timestamp=datetime.now(),
            )
    
    def _validate_manual(self, config: Dict[str, Any]) -> List[str]:
        """Manual validation fallback."""
        errors = []
        
        # Validate audio settings
        if "audio" in config:
            audio = config["audio"]
            if "sample_rate" in audio and audio["sample_rate"] not in [44100, 48000, 96000, 192000]:
                errors.append("audio.sample_rate: Invalid sample rate")
            if "buffer_size" in audio and audio["buffer_size"] not in [64, 128, 256, 512, 1024, 2048]:
                errors.append("audio.buffer_size: Invalid buffer size")
        
        # Validate backend settings
        if "backend" in config:
            backend = config["backend"]
            if "port" in backend and not (1024 <= backend["port"] <= 65535):
                errors.append("backend.port: Port must be between 1024 and 65535")
        
        return errors
    
    def _validate_custom(self, config: Dict[str, Any]) -> List[str]:
        """Custom validation rules."""
        warnings = []
        
        # Check for deprecated settings
        if "legacy_audio" in config:
            warnings.append("legacy_audio: Deprecated, use JUCE engine instead")
        
        # Check for risky combinations
        if config.get("audio", {}).get("buffer_size", 256) < 128:
            if config.get("plugins", {}).get("max_plugins", 10) > 5:
                warnings.append("Small buffer size with many plugins may cause xruns")
        
        return warnings
    
    def validate_file(self, config_path: Path) -> ValidationResult:
        """Validate configuration file."""
        try:
            with open(config_path, 'r') as f:
                config = json.load(f)
            return self.validate(config, cache_key=str(config_path))
        except Exception as e:
            return ValidationResult(
                valid=False,
                errors=[f"Failed to load config file: {e}"],
                warnings=[],
                timestamp=datetime.now(),
            )


class HotReloadManager:
    """Manages hot reload of configuration changes."""
    
    def __init__(self):
        self._reloadable_keys = {
            "logging.level",
            "plugins.max_load_time_ms",
            "system.enable_watchdog",
            "midi.enabled",
        }
        self._reload_callbacks = {}
    
    def is_reloadable(self, key: str) -> bool:
        """Check if configuration key can be hot-reloaded."""
        return key in self._reloadable_keys
    
    def register_callback(self, key: str, callback: callable):
        """Register callback for configuration change."""
        if key not in self._reload_callbacks:
            self._reload_callbacks[key] = []
        self._reload_callbacks[key].append(callback)
    
    async def reload(self, key: str, new_value: Any) -> bool:
        """Hot reload a configuration value."""
        if not self.is_reloadable(key):
            raise ConfigurationValidationException(
                f"Configuration key '{key}' requires restart"
            )
        
        try:
            # Call registered callbacks
            if key in self._reload_callbacks:
                for callback in self._reload_callbacks[key]:
                    await callback(new_value)
            
            logger.info(f"✅ Hot reloaded configuration: {key} = {new_value}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to hot reload {key}: {e}")
            return False


# Global instances
_validator = ConfigValidator()
_hot_reload_manager = HotReloadManager()


def get_validator() -> ConfigValidator:
    """Get configuration validator instance."""
    return _validator


def get_hot_reload_manager() -> HotReloadManager:
    """Get hot reload manager instance."""
    return _hot_reload_manager

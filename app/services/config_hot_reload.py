"""
MAP2 Audio Cluster - Configuration Hot-Reload System

Enables no-downtime configuration updates with validation,
rollback support, and change notifications.
"""

from typing import Dict, Any, Optional, List, Callable
from dataclasses import dataclass
from pathlib import Path
from datetime import datetime
import json
import yaml
import hashlib
import logging
try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler, FileModifiedEvent
    HAS_WATCHDOG = True
except ImportError:
    Observer = None  # type: ignore
    FileSystemEventHandler = object  # type: ignore
    FileModifiedEvent = None  # type: ignore
    HAS_WATCHDOG = False
import asyncio
from copy import deepcopy

logger = logging.getLogger(__name__)


@dataclass
class ConfigChange:
    """Record of a configuration change."""
    timestamp: str
    config_file: str
    changes: Dict[str, Any]
    previous_hash: str
    new_hash: str
    validated: bool
    applied: bool
    
    def to_dict(self) -> Dict:
        return {
            "timestamp": self.timestamp,
            "config_file": self.config_file,
            "changes": self.changes,
            "previous_hash": self.previous_hash,
            "new_hash": self.new_hash,
            "validated": self.validated,
            "applied": self.applied
        }


class ConfigValidator:
    """Validates configuration changes before applying."""
    
    def __init__(self):
        """Initialize validator."""
        self.validation_rules: Dict[str, Callable] = {}
    
    def add_rule(self, config_key: str, validator: Callable[[Any], bool]) -> None:
        """
        Add validation rule for a config key.
        
        Args:
            config_key: Configuration key path (e.g., "cluster.max_nodes")
            validator: Function that returns True if value is valid
        """
        self.validation_rules[config_key] = validator
        logger.debug(f"Added validation rule for {config_key}")
    
    def validate(self, config: Dict, key_prefix: str = "") -> List[str]:
        """
        Validate configuration.
        
        Args:
            config: Configuration dictionary
            key_prefix: Prefix for nested keys
        
        Returns:
            List of validation errors (empty if valid)
        """
        errors = []
        
        for key, value in config.items():
            full_key = f"{key_prefix}.{key}" if key_prefix else key
            
            # Check if there's a validation rule for this key
            if full_key in self.validation_rules:
                try:
                    if not self.validation_rules[full_key](value):
                        errors.append(f"Invalid value for {full_key}: {value}")
                except Exception as e:
                    errors.append(f"Validation error for {full_key}: {str(e)}")
            
            # Recursively validate nested dicts
            if isinstance(value, dict):
                nested_errors = self.validate(value, full_key)
                errors.extend(nested_errors)
        
        return errors


class ConfigurationHotReloader:
    """
    Hot-reload configuration without service restart.
    
    Features:
    - File watching (auto-reload on change)
    - Validation before apply
    - Rollback on error
    - Change notifications
    - Configuration versioning
    """
    
    def __init__(self, config_file: str):
        """
        Initialize hot-reloader.
        
        Args:
            config_file: Path to configuration file
        """
        self.config_file = Path(config_file)
        self.current_config: Dict = {}
        self.previous_config: Dict = {}
        self.config_hash: str = ""
        self.validator = ConfigValidator()
        self.change_callbacks: List[Callable] = []
        self.change_history: List[ConfigChange] = []
        self.watch_enabled = False
        self.observer: Optional[Observer] = None
        
        # Setup default validation rules
        self._setup_default_validators()
        
        # Load initial config
        self.reload_config()
    
    def _setup_default_validators(self) -> None:
        """Set up default validation rules."""
        # Cluster size validation
        self.validator.add_rule(
            "cluster.max_nodes",
            lambda v: isinstance(v, int) and 1 <= v <= 100
        )
        
        # Port validation
        self.validator.add_rule(
            "api.port",
            lambda v: isinstance(v, int) and 1024 <= v <= 65535
        )
        
        # Health check interval
        self.validator.add_rule(
            "health.check_interval_seconds",
            lambda v: isinstance(v, int) and v >= 10
        )
        
        # Update schedule validation
        self.validator.add_rule(
            "updates.schedule.enabled",
            lambda v: isinstance(v, bool)
        )
    
    def add_validator(self, config_key: str, validator: Callable[[Any], bool]) -> None:
        """Add custom validation rule."""
        self.validator.add_rule(config_key, validator)
    
    def add_change_callback(self, callback: Callable[[Dict], None]) -> None:
        """
        Register callback for configuration changes.
        
        Callback receives dict of changes.
        """
        self.change_callbacks.append(callback)
        logger.debug(f"Added config change callback: {callback.__name__}")
    
    def _compute_hash(self, config: Dict) -> str:
        """Compute hash of configuration."""
        config_json = json.dumps(config, sort_keys=True)
        return hashlib.sha256(config_json.encode()).hexdigest()
    
    def _load_config_file(self) -> Dict:
        """Load configuration from file."""
        if not self.config_file.exists():
            raise FileNotFoundError(f"Config file not found: {self.config_file}")
        
        # Determine file type and load
        if self.config_file.suffix in ['.yaml', '.yml']:
            with open(self.config_file, 'r') as f:
                return yaml.safe_load(f) or {}
        elif self.config_file.suffix == '.json':
            with open(self.config_file, 'r') as f:
                return json.load(f)
        else:
            raise ValueError(f"Unsupported config file format: {self.config_file.suffix}")
    
    def _detect_changes(self, new_config: Dict) -> Dict[str, Any]:
        """
        Detect what changed between configs.
        
        Returns:
            Dict of changes
        """
        changes = {}
        
        def compare_dicts(old: Dict, new: Dict, prefix: str = ""):
            for key in set(list(old.keys()) + list(new.keys())):
                full_key = f"{prefix}.{key}" if prefix else key
                
                if key not in new:
                    changes[full_key] = {"action": "removed", "old_value": old[key]}
                elif key not in old:
                    changes[full_key] = {"action": "added", "new_value": new[key]}
                elif old[key] != new[key]:
                    if isinstance(old[key], dict) and isinstance(new[key], dict):
                        # Recursively compare nested dicts
                        compare_dicts(old[key], new[key], full_key)
                    else:
                        changes[full_key] = {
                            "action": "modified",
                            "old_value": old[key],
                            "new_value": new[key]
                        }
        
        compare_dicts(self.current_config, new_config)
        return changes
    
    def reload_config(self, dry_run: bool = False) -> bool:
        """
        Reload configuration from file.
        
        Args:
            dry_run: If True, validate but don't apply
        
        Returns:
            True if reload successful
        """
        try:
            logger.info(f"{'Validating' if dry_run else 'Reloading'} configuration from {self.config_file}")
            
            # Load new config
            new_config = self._load_config_file()
            new_hash = self._compute_hash(new_config)
            
            # Check if config actually changed
            if new_hash == self.config_hash:
                logger.debug("Configuration unchanged, skipping reload")
                return True
            
            # Detect changes
            changes = self._detect_changes(new_config)
            
            if not changes:
                logger.debug("No substantive changes detected")
                return True
            
            logger.info(f"Detected {len(changes)} configuration changes")
            
            # Validate new config
            validation_errors = self.validator.validate(new_config)
            
            if validation_errors:
                logger.error(f"Configuration validation failed: {validation_errors}")
                return False
            
            logger.info("Configuration validation passed")
            
            if dry_run:
                logger.info("Dry run complete - configuration valid but not applied")
                return True
            
            # Apply new config
            self.previous_config = deepcopy(self.current_config)
            previous_hash = self.config_hash
            
            self.current_config = new_config
            self.config_hash = new_hash
            
            # Record change
            change_record = ConfigChange(
                timestamp=datetime.now().isoformat(),
                config_file=str(self.config_file),
                changes=changes,
                previous_hash=previous_hash,
                new_hash=new_hash,
                validated=True,
                applied=True
            )
            self.change_history.append(change_record)
            
            # Keep only last 100 changes
            if len(self.change_history) > 100:
                self.change_history = self.change_history[-100:]
            
            # Notify callbacks
            self._notify_callbacks(changes)
            
            logger.info(f"Configuration reloaded successfully ({len(changes)} changes applied)")
            return True
            
        except Exception as e:
            logger.error(f"Failed to reload configuration: {str(e)}")
            return False
    
    def rollback(self) -> bool:
        """
        Rollback to previous configuration.
        
        Returns:
            True if rollback successful
        """
        if not self.previous_config:
            logger.error("No previous configuration to rollback to")
            return False
        
        logger.warning("Rolling back to previous configuration")
        
        try:
            # Swap configs
            self.current_config, self.previous_config = self.previous_config, self.current_config
            self.config_hash = self._compute_hash(self.current_config)
            
            # Notify callbacks
            changes = {"rollback": {"action": "rollback", "timestamp": datetime.now().isoformat()}}
            self._notify_callbacks(changes)
            
            logger.info("Configuration rolled back successfully")
            return True
            
        except Exception as e:
            logger.error(f"Rollback failed: {str(e)}")
            return False
    
    def _notify_callbacks(self, changes: Dict) -> None:
        """Notify all registered callbacks of changes."""
        for callback in self.change_callbacks:
            try:
                callback(changes)
            except Exception as e:
                logger.error(f"Callback {callback.__name__} failed: {str(e)}")
    
    def get(self, key_path: str, default: Any = None) -> Any:
        """
        Get configuration value by dot-separated key path.
        
        Args:
            key_path: Dot-separated path (e.g., "cluster.max_nodes")
            default: Default value if key not found
        
        Returns:
            Configuration value
        """
        keys = key_path.split('.')
        value = self.current_config
        
        for key in keys:
            if isinstance(value, dict) and key in value:
                value = value[key]
            else:
                return default
        
        return value
    
    def set(self, key_path: str, value: Any, persist: bool = True) -> bool:
        """
        Set configuration value.
        
        Args:
            key_path: Dot-separated path
            value: New value
            persist: If True, write to config file
        
        Returns:
            True if successful
        """
        keys = key_path.split('.')
        config = self.current_config
        
        # Navigate to parent of target key
        for key in keys[:-1]:
            if key not in config:
                config[key] = {}
            config = config[key]
        
        # Set value
        old_value = config.get(keys[-1])
        config[keys[-1]] = value
        
        # Validate
        validation_errors = self.validator.validate(self.current_config)
        if validation_errors:
            # Revert
            if old_value is not None:
                config[keys[-1]] = old_value
            else:
                del config[keys[-1]]
            logger.error(f"Failed to set {key_path}: validation failed")
            return False
        
        # Persist to file if requested
        if persist:
            try:
                self._write_config_file()
            except Exception as e:
                logger.error(f"Failed to persist config: {str(e)}")
                return False
        
        # Update hash
        self.config_hash = self._compute_hash(self.current_config)
        
        # Notify
        changes = {key_path: {"action": "set", "old_value": old_value, "new_value": value}}
        self._notify_callbacks(changes)
        
        return True
    
    def _write_config_file(self) -> None:
        """Write current config to file."""
        if self.config_file.suffix in ['.yaml', '.yml']:
            with open(self.config_file, 'w') as f:
                yaml.dump(self.current_config, f, default_flow_style=False)
        elif self.config_file.suffix == '.json':
            with open(self.config_file, 'w') as f:
                json.dump(self.current_config, f, indent=2)
    
    def start_watching(self) -> None:
        """Start watching config file for changes."""
        if not HAS_WATCHDOG:
            logger.warning("watchdog package not installed — file watching disabled")
            return
        
        if self.watch_enabled:
            logger.warning("File watching already enabled")
            return
        
        class ConfigFileHandler(FileSystemEventHandler):
            def __init__(self, reloader):
                self.reloader = reloader
            
            def on_modified(self, event):
                if event.src_path == str(self.reloader.config_file):
                    logger.info(f"Config file modified: {event.src_path}")
                    # Reload config
                    asyncio.create_task(asyncio.to_thread(self.reloader.reload_config))
        
        self.observer = Observer()
        handler = ConfigFileHandler(self)
        self.observer.schedule(handler, str(self.config_file.parent), recursive=False)
        self.observer.start()
        
        self.watch_enabled = True
        logger.info(f"Started watching {self.config_file} for changes")
    
    def stop_watching(self) -> None:
        """Stop watching config file."""
        if self.observer:
            self.observer.stop()
            self.observer.join()
            self.observer = None
        
        self.watch_enabled = False
        logger.info("Stopped watching config file")
    
    def get_change_history(self, limit: int = 10) -> List[Dict]:
        """Get recent configuration changes."""
        return [change.to_dict() for change in self.change_history[-limit:]]


# =========================================================================
# Global Instance
# =========================================================================

# Global config hot-reloader (initialized by application)
config_reloader: Optional[ConfigurationHotReloader] = None


def init_config_reloader(config_file: str, watch: bool = True) -> ConfigurationHotReloader:
    """
    Initialize global configuration hot-reloader.
    
    Args:
        config_file: Path to config file
        watch: Enable file watching
    
    Returns:
        ConfigurationHotReloader instance
    """
    global config_reloader
    
    config_reloader = ConfigurationHotReloader(config_file)
    
    if watch:
        config_reloader.start_watching()
    
    logger.info(f"Configuration hot-reloader initialized: {config_file}")
    return config_reloader


def get_config(key_path: str, default: Any = None) -> Any:
    """Convenience function to get config value."""
    if config_reloader is None:
        raise RuntimeError("Config reloader not initialized")
    return config_reloader.get(key_path, default)


# =========================================================================
# CLI/Testing
# =========================================================================

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python config_hot_reload.py <config_file>")
        sys.exit(1)
    
    config_file = sys.argv[1]
    
    # Initialize reloader
    reloader = ConfigurationHotReloader(config_file)
    
    # Add callback
    def on_config_change(changes):
        print(f"\n🔄 Configuration changed:")
        for key, change_info in changes.items():
            print(f"  {key}: {change_info}")
    
    reloader.add_change_callback(on_config_change)
    
    print(f"✓ Configuration loaded from {config_file}")
    print(f"  Hash: {reloader.config_hash[:12]}...")
    print(f"  Keys: {list(reloader.current_config.keys())}")
    
    # Start watching
    reloader.start_watching()
    print(f"\n👁 Watching {config_file} for changes...")
    print("  Press Ctrl+C to stop")
    
    try:
        import time
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n\nStopping...")
        reloader.stop_watching()

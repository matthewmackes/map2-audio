"""
MAP2 Audio Cluster - Configuration Hot-Reload System

Enables no-downtime configuration updates with validation,
rollback support, and change notifications.
"""

from typing import Dict, Any, Optional, List, Callable
from dataclasses import dataclass
from pathlib import Path
from datetime import datetime
import time
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
        self._async_loop: Optional[asyncio.AbstractEventLoop] = None
        self._ignore_file_events_until = 0.0
        self._suspend_cluster_broadcast = True
        self.local_node_id = ""
        self.local_node_role = ""
        self._event_bus = None
        
        # Setup default validation rules
        self._setup_default_validators()
        self._init_cluster_sync()
        
        # Load initial config
        self.reload_config()
        self._suspend_cluster_broadcast = False

    def bind_event_loop(self, loop: Optional[asyncio.AbstractEventLoop] = None) -> None:
        """Bind an asyncio loop so callbacks from watcher threads can publish events."""
        if loop is not None:
            self._async_loop = loop
            return
        try:
            self._async_loop = asyncio.get_running_loop()
        except RuntimeError:
            pass

    def _init_cluster_sync(self) -> None:
        """Attach to the distributed event bus for cluster config propagation."""
        try:
            from app.services.cluster.distributed_event_bus import EventType, get_event_bus
            from app.services.cluster.enhanced_node_identity import get_enhanced_node_identity

            identity = get_enhanced_node_identity()
            self.local_node_id = identity.get_node_id()
            self.local_node_role = identity.get_role()
            self._event_bus = get_event_bus()
            self._event_bus.subscribe(EventType.CONFIG_CHANGED, self._on_cluster_config_changed)
        except Exception as exc:
            logger.debug(f"Cluster config sync unavailable: {exc}")

    def _schedule_async(self, coro: Any) -> None:
        """Schedule a coroutine from either the main loop or a watcher thread."""
        if self._async_loop is not None and self._async_loop.is_running():
            asyncio.run_coroutine_threadsafe(coro, self._async_loop)
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(coro)

    @staticmethod
    def _default_value_for_key(key_path: str) -> Any:
        """Return schema default for a config key if available."""
        try:
            from app.config import CONFIG_SCHEMA

            option = CONFIG_SCHEMA.get(key_path)
            return option.default if option else None
        except Exception:
            return None

    def _event_value_for_change(self, key_path: str, change: Dict[str, Any]) -> Any:
        action = str(change.get("action", "modified"))
        if action == "removed":
            return self._default_value_for_key(key_path)
        if "new_value" in change:
            return change.get("new_value")
        return self.get(key_path)

    def _scope_applies_to_local(self, scope: str) -> bool:
        normalized = str(scope or "cluster").strip()
        if normalized == "cluster":
            return True
        if normalized == "node":
            return False
        if normalized.startswith("role:"):
            return normalized.split(":", 1)[1].strip() == self.local_node_role
        return False

    async def _publish_config_changed(self, key_path: str, value: Any, scope: str, action: str = "modified") -> None:
        if self._event_bus is None:
            return

        from app.services.cluster.distributed_event_bus import ClusterEvent, EventSeverity, EventType

        await self._event_bus.publish_event(
            ClusterEvent(
                event_type=EventType.CONFIG_CHANGED,
                severity=EventSeverity.INFO,
                source_node_id=self.local_node_id,
                message=f"Configuration changed: {key_path}",
                details={
                    "key": key_path,
                    "value": value,
                    "scope": scope,
                    "action": action,
                    "source_node_id": self.local_node_id,
                },
            )
        )

    def _broadcast_changes(self, changes: Dict[str, Any], scope: str = "cluster") -> None:
        if self._suspend_cluster_broadcast or scope == "node":
            return

        for key_path, change in changes.items():
            if not isinstance(change, dict):
                continue
            action = str(change.get("action", "modified"))
            if action not in {"added", "modified", "removed", "set"}:
                continue
            value = self._event_value_for_change(key_path, change)
            self._schedule_async(self._publish_config_changed(key_path, value, scope, action))

    async def _on_cluster_config_changed(self, event: Any) -> None:
        details = dict(getattr(event, "details", {}) or {})
        source_node_id = str(getattr(event, "source_node_id", "") or details.get("source_node_id", "")).strip()
        if not details or not source_node_id or source_node_id == self.local_node_id:
            return

        scope = str(details.get("scope", "cluster") or "cluster").strip()
        if not self._scope_applies_to_local(scope):
            return

        key_path = str(details.get("key", "") or "").strip()
        if not key_path:
            return

        value = details.get("value")
        await self.apply_runtime_change(
            key_path,
            value,
            scope="node",
            broadcast=False,
            action=str(details.get("action", "modified") or "modified"),
        )
    
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

            try:
                from app.config import get_config as get_runtime_config_manager

                runtime_manager = get_runtime_config_manager()
                if self.config_file.resolve() == runtime_manager.config_path.resolve():
                    runtime_manager.reload()
            except Exception as exc:
                logger.debug(f"Runtime config reload skipped: {exc}")
            
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
            self._broadcast_changes(changes, scope="cluster")
            
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

    async def apply_runtime_change(
        self,
        key_path: str,
        value: Any,
        scope: str = "node",
        broadcast: bool = True,
        action: str = "set",
    ) -> bool:
        """
        Apply a runtime config change via the shared ConfigManager and optionally broadcast it.
        """
        from app.config import get_config as get_runtime_config_manager

        self.bind_event_loop()
        runtime_manager = get_runtime_config_manager()
        old_value = runtime_manager.get(key_path)

        try:
            self._ignore_file_events_until = time.monotonic() + 1.0
            success = runtime_manager.set(key_path, value, save=True)
        except ValueError:
            raise

        if not success:
            return False

        self.previous_config = deepcopy(self.current_config)
        self.current_config = runtime_manager.get_all()
        previous_hash = self.config_hash
        self.config_hash = self._compute_hash(self.current_config)

        changes = {
            key_path: {
                "action": action,
                "old_value": old_value,
                "new_value": value,
            }
        }
        self.change_history.append(
            ConfigChange(
                timestamp=datetime.now().isoformat(),
                config_file=str(self.config_file),
                changes=changes,
                previous_hash=previous_hash,
                new_hash=self.config_hash,
                validated=True,
                applied=True,
            )
        )
        if len(self.change_history) > 100:
            self.change_history = self.change_history[-100:]

        self._notify_callbacks(changes)
        if broadcast and scope != "node":
            await self._publish_config_changed(key_path, value, scope, action)
        return True

    async def reload_config_async(self, dry_run: bool = False) -> bool:
        """Async wrapper for watcher-triggered reloads."""
        return await asyncio.to_thread(self.reload_config, dry_run)
    
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
                    if time.monotonic() < self.reloader._ignore_file_events_until:
                        return
                    logger.info(f"Config file modified: {event.src_path}")
                    if self.reloader._async_loop and self.reloader._async_loop.is_running():
                        asyncio.run_coroutine_threadsafe(
                            self.reloader.reload_config_async(),
                            self.reloader._async_loop,
                        )
                    else:
                        self.reloader.reload_config()
        
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
    config_reloader.bind_event_loop()
    
    if watch:
        config_reloader.start_watching()
    
    logger.info(f"Configuration hot-reloader initialized: {config_file}")
    return config_reloader


def get_config(key_path: str, default: Any = None) -> Any:
    """Convenience function to get config value."""
    if config_reloader is None:
        raise RuntimeError("Config reloader not initialized")
    return config_reloader.get(key_path, default)


def get_or_init_config_reloader(watch: bool = True) -> ConfigurationHotReloader:
    """Get the global config reloader, initializing it against the shared runtime config if needed."""
    global config_reloader
    if config_reloader is None:
        from app.config import get_config as get_runtime_config_manager

        runtime_manager = get_runtime_config_manager()
        config_reloader = ConfigurationHotReloader(str(runtime_manager.config_path))
        config_reloader.bind_event_loop()
        if watch:
            config_reloader.start_watching()
    else:
        config_reloader.bind_event_loop()
        if watch and not config_reloader.watch_enabled:
            config_reloader.start_watching()
    return config_reloader


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

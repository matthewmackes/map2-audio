"""
Cluster Configuration Manager

Manages cluster-wide configuration settings:
- Network configuration
- TLS/mTLS settings
- Node role assignments
- API ports and discovery
"""

import logging
import json
import hashlib
from typing import Dict, Any, Optional
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)


class ConfigManager:
    """Manages cluster configuration with persistence."""

    def __init__(self):
        self._history_path = Path("/var/lib/map2/config-manager-history.json")
        self._history_path.parent.mkdir(parents=True, exist_ok=True)
        self._config: Dict[str, Any] = {
            "cluster_name": "map2-cluster",
            "management_ip": None,
            "network_interface": None,
            "api_port": 8080,
            "enable_mdns": True,
            "enable_tls": False,
        }
        self._history = self._load_history()
        if self._history:
            latest = self._history[-1]
            self._config = dict(latest.get("config", self._config))
        else:
            self._record_version("Initial configuration")

    def update_config(self, updates: Dict[str, Any]) -> None:
        """Update cluster configuration with provided values."""
        for key, value in updates.items():
            if value is not None:
                self._config[key] = value
        logger.info(f"Cluster config updated: {list(updates.keys())}")

    def get_config(self) -> Dict[str, Any]:
        """Get current cluster configuration."""
        return dict(self._config)

    def get(self, key: str, default: Any = None) -> Any:
        """Get a specific config value."""
        return self._config.get(key, default)

    def set(self, key: str, value: Any) -> None:
        """Set a specific config value."""
        self._config[key] = value

    def validate(self) -> bool:
        """Validate current configuration."""
        required = ["cluster_name", "api_port"]
        return all(self._config.get(k) is not None for k in required)

    async def apply_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Apply configuration changes and return result."""
        self.update_config(config)
        version = self._record_version(
            f"Applied updates: {', '.join(sorted(config.keys())) or 'none'}"
        )
        return {
            "status": "ok",
            "applied": list(config.keys()),
            "version": version,
        }

    async def rollback_config(self, version: Optional[str] = None) -> Dict[str, Any]:
        """Rollback configuration to a previous version."""
        if not self._history:
            return {
                "status": "error",
                "message": "No configuration history available",
            }

        target_index = None
        if version:
            for idx, entry in enumerate(self._history):
                if entry.get("version") == version:
                    target_index = idx
                    break
            if target_index is None:
                return {
                    "status": "error",
                    "message": f"Version not found: {version}",
                    "available_versions": [h.get("version") for h in self._history[-10:]],
                }
        else:
            # Default rollback target: the previous version.
            if len(self._history) < 2:
                return {
                    "status": "error",
                    "message": "No previous version to rollback to",
                }
            target_index = len(self._history) - 2

        target = self._history[target_index]
        self._config = dict(target.get("config", {}))
        new_version = self._record_version(
            f"Rollback to {target.get('version')}"
        )
        logger.info(
            "Rolled back config to version %s (new head %s)",
            target.get("version"),
            new_version,
        )
        return {
            "status": "ok",
            "message": "Rollback complete",
            "rolled_back_to": target.get("version"),
            "current_version": new_version,
            "timestamp": datetime.utcnow().isoformat(),
        }

    def _load_history(self) -> list:
        """Load config history from disk."""
        if not self._history_path.exists():
            return []
        try:
            with open(self._history_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                return data
        except Exception as e:
            logger.warning(f"Failed to load config history: {e}")
        return []

    def _save_history(self) -> None:
        """Persist config history to disk."""
        with open(self._history_path, "w", encoding="utf-8") as f:
            json.dump(self._history, f, indent=2)

    def _record_version(self, message: str) -> str:
        """Create and persist a new config version snapshot."""
        payload = json.dumps(self._config, sort_keys=True)
        version = hashlib.sha1(
            f"{datetime.utcnow().isoformat()}::{payload}".encode("utf-8")
        ).hexdigest()[:12]
        self._history.append(
            {
                "version": version,
                "timestamp": datetime.utcnow().isoformat(),
                "message": message,
                "config": dict(self._config),
            }
        )
        # Keep bounded history.
        self._history = self._history[-200:]
        self._save_history()
        return version


# Singleton
_config_manager: Optional[ConfigManager] = None


def get_config_manager() -> ConfigManager:
    """Get or create the config manager singleton."""
    global _config_manager
    if _config_manager is None:
        _config_manager = ConfigManager()
    return _config_manager

"""
Cluster Configuration Manager

Manages cluster-wide configuration settings:
- Network configuration
- TLS/mTLS settings
- Node role assignments
- API ports and discovery
"""

import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class ConfigManager:
    """Manages cluster configuration with persistence."""

    def __init__(self):
        self._config: Dict[str, Any] = {
            "cluster_name": "map2-cluster",
            "management_ip": None,
            "network_interface": None,
            "api_port": 8080,
            "enable_mdns": True,
            "enable_tls": False,
        }

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
        return {"status": "ok", "applied": list(config.keys())}

    async def rollback_config(self, version: Optional[str] = None) -> Dict[str, Any]:
        """Rollback configuration to a previous version."""
        # TODO: Implement config versioning and rollback
        logger.warning("Config rollback requested but versioning not yet implemented")
        return {"status": "ok", "message": "Rollback not yet implemented"}


# Singleton
_config_manager: Optional[ConfigManager] = None


def get_config_manager() -> ConfigManager:
    """Get or create the config manager singleton."""
    global _config_manager
    if _config_manager is None:
        _config_manager = ConfigManager()
    return _config_manager

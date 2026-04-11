"""
Cluster Deployment Manager

Manages deployment mode and node role orchestration:
- all-in-one: Single node runs everything
- distributed: Multiple nodes with role assignments
- hybrid: Management + audio node separation
"""

import logging
from typing import Dict, Any, Optional

from app.utils.singleton import Singleton

logger = logging.getLogger(__name__)


class DeploymentManager(Singleton):
    """Manages cluster deployment mode and transitions."""

    def __init__(self):
        self._mode = "all-in-one"
        self._transitioning = False

    @property
    def mode(self) -> str:
        """Current deployment mode."""
        return self._mode

    async def set_mode(self, mode: str) -> None:
        """Set the deployment mode."""
        valid_modes = ["all-in-one", "distributed", "hybrid"]
        if mode not in valid_modes:
            raise ValueError(f"Invalid mode '{mode}'. Valid: {valid_modes}")
        self._mode = mode
        logger.info(f"Deployment mode set to: {mode}")

    def get_status(self) -> Dict[str, Any]:
        """Get current deployment status."""
        return {
            "mode": self._mode,
            "transitioning": self._transitioning,
        }

def get_deployment_manager() -> DeploymentManager:
    """Get the process-wide deployment manager singleton."""
    return DeploymentManager.get_instance()

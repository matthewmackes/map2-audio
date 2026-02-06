"""
Configuration Distribution System (GitOps-style)

Centralized configuration management for the cluster:
- Manages presets, MIDI mappings, audio chain configs
- Version control using local git repository
- Push-based distribution to all nodes
- Pull-based polling from audio nodes (30-second interval)
- Diff/rollback capabilities
- Automatic sync on config changes

Runs on Management Node.
"""

import asyncio
import logging
import json
import hashlib
import subprocess
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class ConfigVersion:
    """Represents a version of cluster configuration"""
    
    version_hash: str
    timestamp: datetime
    author: str
    message: str
    files_changed: int
    config_data: Dict


class ConfigSync:
    """
    Manages configuration distribution across cluster.
    
    Uses local git repository for versioning and rollback.
    """
    
    def __init__(self, config_repo_path: str = "/var/lib/map2/config-repo"):
        """
        Initialize config sync manager.
        
        Args:
            config_repo_path: Path to local git repository for configs
        """
        self.repo_path = Path(config_repo_path)
        self.logger = logging.getLogger(__name__)
        self._init_repo()
    
    def _init_repo(self):
        """Initialize git repository if not exists"""
        try:
            if not self.repo_path.exists():
                self.repo_path.mkdir(parents=True, exist_ok=True)
                subprocess.run(
                    ["git", "init"],
                    cwd=self.repo_path,
                    check=True,
                    capture_output=True,
                )
                self.logger.info(f"Initialized config repository at {self.repo_path}")
        except Exception as e:
            self.logger.error(f"Failed to initialize repo: {e}")
    
    async def push_config_to_nodes(
        self, 
        config_type: str,  # "preset", "midi_mapping", "audio_chain"
        config_data: Dict,
        message: str,
    ) -> bool:
        """
        Push configuration to all nodes.
        
        Args:
            config_type: Type of configuration
            config_data: Configuration data
            message: Commit message
            
        Returns:
            True if successful
        """
        try:
            self.logger.info(f"Pushing {config_type} to all nodes...")
            
            # Write config file
            config_file = self.repo_path / f"{config_type}.json"
            with open(config_file, 'w') as f:
                json.dump(config_data, f, indent=2)
            
            # Commit to git
            subprocess.run(
                ["git", "add", str(config_file)],
                cwd=self.repo_path,
                check=True,
                capture_output=True,
            )
            
            subprocess.run(
                ["git", "commit", "-m", message],
                cwd=self.repo_path,
                check=True,
                capture_output=True,
            )
            
            self.logger.info(f"Committed {config_type} to repository")
            
            # TODO: Distribute to all nodes via API/SSH
            # For now, just log
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to push config: {e}")
            return False
    
    async def pull_config_from_nodes(self) -> Dict[str, Dict]:
        """
        Poll nodes for configuration changes.
        
        Returns:
            Dictionary mapping node_id to their current config hash
        """
        try:
            # TODO: Implement polling logic
            # Poll each audio node every 30 seconds
            # Check if their config hash matches repository
            # If different, offer to sync
            
            return {}
            
        except Exception as e:
            self.logger.error(f"Failed to pull configs: {e}")
            return {}
    
    async def get_config_diff(
        self,
        version_a: str,
        version_b: str,
    ) -> Dict:
        """
        Get diff between two configuration versions.
        
        Args:
            version_a: First version hash
            version_b: Second version hash
            
        Returns:
            Dictionary showing differences
        """
        try:
            # TODO: Implement git diff logic
            return {}
            
        except Exception as e:
            self.logger.error(f"Failed to get diff: {e}")
            return {}
    
    async def rollback_config(self, version_hash: str) -> bool:
        """
        Rollback to previous configuration version.
        
        Args:
            version_hash: Git commit hash to restore
            
        Returns:
            True if successful
        """
        try:
            self.logger.info(f"Rolling back config to {version_hash}")
            
            # TODO: Implement git checkout logic
            # Checkout the specified version
            # Push to all nodes
            
            return True
            
        except Exception as e:
            self.logger.error(f"Failed to rollback: {e}")
            return False
    
    def get_config_history(self, limit: int = 20) -> List[ConfigVersion]:
        """
        Get history of configuration changes.
        
        Args:
            limit: Maximum number of versions to return
            
        Returns:
            List of ConfigVersion objects
        """
        try:
            # TODO: Implement git log parsing
            return []
            
        except Exception as e:
            self.logger.error(f"Failed to get history: {e}")
            return []


# Global instance
_config_sync: Optional[ConfigSync] = None


def get_config_sync() -> ConfigSync:
    """Get or create the config sync instance"""
    global _config_sync
    if _config_sync is None:
        _config_sync = ConfigSync()
    return _config_sync

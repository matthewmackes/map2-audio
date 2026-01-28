"""
Canonical service configuration.
Single source of truth for service metadata (not duplicated).
"""

import json
import logging
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Optional
import uuid as uuid_lib

logger = logging.getLogger(__name__)


@dataclass
class ServiceConfiguration:
    """
    Service metadata and configuration.
    Canonical implementation - used everywhere, not duplicated.
    """
    
    # Service identity
    uuid: str = field(default_factory=lambda: str(uuid_lib.uuid4()))
    device_name: str = "MAP2-Audio"
    
    # Network
    server_port: int = 8080
    server_host: str = "0.0.0.0"
    
    # Version
    version: str = "1.24.25.1"
    
    # Paths (canonical locations only)
    CONFIG_PATH_CANONICAL = Path("/etc/map2-audio/service.conf")
    CONFIG_PATH_USER = Path.home() / ".config" / "map2-audio" / "service.conf"
    
    @classmethod
    def load(cls) -> "ServiceConfiguration":
        """
        Load configuration from canonical path.
        Falls back to user path, then defaults.
        """
        # Try canonical path first
        if cls.CONFIG_PATH_CANONICAL.exists():
            try:
                return cls._load_from_file(cls.CONFIG_PATH_CANONICAL)
            except Exception as e:
                logger.warning(f"Failed to load config from {cls.CONFIG_PATH_CANONICAL}: {e}")
        
        # Try user path
        if cls.CONFIG_PATH_USER.exists():
            try:
                config = cls._load_from_file(cls.CONFIG_PATH_USER)
                # Migrate to canonical path
                config.save()
                logger.info(f"Migrated config from {cls.CONFIG_PATH_USER} to {cls.CONFIG_PATH_CANONICAL}")
                return config
            except Exception as e:
                logger.warning(f"Failed to load config from {cls.CONFIG_PATH_USER}: {e}")
        
        # Return defaults
        logger.info("Using default configuration")
        return cls()
    
    @classmethod
    def _load_from_file(cls, path: Path) -> "ServiceConfiguration":
        """Load configuration from file"""
        with open(path, 'r') as f:
            data = json.load(f)
        
        return cls(**data)
    
    def save(self) -> None:
        """Save to canonical path"""
        try:
            # Create directory
            self.CONFIG_PATH_CANONICAL.parent.mkdir(parents=True, exist_ok=True)
            
            # Write atomically
            data = asdict(self)
            temp_path = self.CONFIG_PATH_CANONICAL.with_suffix('.tmp')
            
            with open(temp_path, 'w') as f:
                json.dump(data, f, indent=2)
            
            # Atomic rename
            temp_path.replace(self.CONFIG_PATH_CANONICAL)
            logger.info(f"Saved config to {self.CONFIG_PATH_CANONICAL}")
            
        except Exception as e:
            logger.error(f"Failed to save config: {e}")
            raise
    
    def to_dict(self) -> dict:
        """Convert to dictionary"""
        return asdict(self)
    
    def get_service_uri(self) -> str:
        """Get service URI"""
        return f"http://{self.server_host}:{self.server_port}"


# Global instance
_instance: Optional[ServiceConfiguration] = None


def get_service_config() -> ServiceConfiguration:
    """Get global service configuration instance (singleton)"""
    global _instance
    
    if _instance is None:
        _instance = ServiceConfiguration.load()
    
    return _instance


def set_service_config(config: ServiceConfiguration) -> None:
    """Set global service configuration instance"""
    global _instance
    _instance = config


def reload_service_config() -> ServiceConfiguration:
    """Reload service configuration from disk"""
    global _instance
    _instance = ServiceConfiguration.load()
    return _instance

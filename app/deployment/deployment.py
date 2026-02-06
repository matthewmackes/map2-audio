"""
Deployment Configuration Engine

Manages:
- Deployment mode (ALL-IN-ONE, AUDIO-NODE, CONTROL-NODE)
- Service enable/disable policies by mode
- Configuration persistence (~/.map2/deployment.json)
- Mode validation and health checks
"""

import json
import logging
import os
from pathlib import Path
from typing import Dict, List, Optional, Set
from enum import Enum
from datetime import datetime

logger = logging.getLogger(__name__)


class DeploymentMode(Enum):
    """Supported deployment modes"""
    ALL_IN_ONE = "ALL-IN-ONE"
    AUDIO_NODE = "AUDIO-NODE"
    CONTROL_NODE = "CONTROL-NODE"
    FRONTEND_ONLY = "FRONTEND-ONLY"  # Lightweight frontend mode


class ServicePolicy(Enum):
    """Service enable/disable policies"""
    ENABLED = "enabled"
    DISABLED = "disabled"
    DEGRADED = "degraded"  # Running but with reduced resources


# Define which services run in each mode
SERVICE_POLICIES = {
    DeploymentMode.ALL_IN_ONE: {
        "juce_engine": ServicePolicy.ENABLED,
        "audio_io": ServicePolicy.ENABLED,
        "plugin_loader": ServicePolicy.ENABLED,
        "api_server": ServicePolicy.ENABLED,
        "web_ui": ServicePolicy.ENABLED,
        "tui": ServicePolicy.ENABLED,
        "database": ServicePolicy.ENABLED,
        "mdns_discovery": ServicePolicy.ENABLED,
        "lcd_manager": ServicePolicy.ENABLED,
    },
    DeploymentMode.AUDIO_NODE: {
        "juce_engine": ServicePolicy.ENABLED,
        "audio_io": ServicePolicy.ENABLED,
        "plugin_loader": ServicePolicy.ENABLED,
        "api_server": ServicePolicy.ENABLED,
        "web_ui": ServicePolicy.DISABLED,
        "tui": ServicePolicy.ENABLED,
        "database": ServicePolicy.ENABLED,
        "mdns_discovery": ServicePolicy.ENABLED,
        "lcd_manager": ServicePolicy.ENABLED,
    },
    DeploymentMode.CONTROL_NODE: {
        "juce_engine": ServicePolicy.DISABLED,
        "audio_io": ServicePolicy.DISABLED,
        "plugin_loader": ServicePolicy.DISABLED,
        "api_server": ServicePolicy.ENABLED,
        "web_ui": ServicePolicy.ENABLED,
        "tui": ServicePolicy.ENABLED,
        "database": ServicePolicy.ENABLED,
        "mdns_discovery": ServicePolicy.ENABLED,
        "lcd_manager": ServicePolicy.DISABLED,
    },
    DeploymentMode.FRONTEND_ONLY: {
        "juce_engine": ServicePolicy.DISABLED,
        "audio_io": ServicePolicy.DISABLED,
        "plugin_loader": ServicePolicy.DISABLED,
        "api_server": ServicePolicy.DEGRADED,  # Minimal API with placeholder responses
        "web_ui": ServicePolicy.ENABLED,
        "tui": ServicePolicy.ENABLED,
        "database": ServicePolicy.DISABLED,
        "mdns_discovery": ServicePolicy.ENABLED,
        "lcd_manager": ServicePolicy.DISABLED,
    },
}


class DeploymentConfig:
    """
    Manages deployment configuration.
    
    Single source of truth for deployment mode and service policies.
    Persists to ~/.map2/deployment.json
    """

    def __init__(self, config_dir: Optional[str] = None):
        if config_dir is None:
            config_dir = str(Path.home() / ".map2")
        
        self.config_dir = Path(config_dir)
        self.config_file = self.config_dir / "deployment.json"
        
        # Runtime state
        self.mode: DeploymentMode = DeploymentMode.ALL_IN_ONE
        self.service_policies: Dict[str, ServicePolicy] = {}
        self.created_at: Optional[str] = None
        self.updated_at: Optional[str] = None
        
        # Load existing or create default
        self._load_or_create()
    
    def _load_or_create(self):
        """Load config from file or create default"""
        if self.config_file.exists():
            try:
                self._load()
                logger.info(f"Loaded deployment config: {self.mode.value}")
            except Exception as e:
                logger.error(f"Failed to load deployment config: {e}, using default")
                self._create_default()
        else:
            self._create_default()
    
    def _load(self):
        """Load configuration from file"""
        with open(self.config_file, 'r') as f:
            data = json.load(f)
        
        # Parse mode
        mode_str = data.get('mode', 'ALL-IN-ONE')
        self.mode = DeploymentMode(mode_str)
        
        # Parse service policies
        policies_data = data.get('service_policies', {})
        self.service_policies = {
            service: ServicePolicy(policy)
            for service, policy in policies_data.items()
        }
        
        # Ensure all services are present
        self._validate_policies()
        
        self.created_at = data.get('created_at')
        self.updated_at = data.get('updated_at')
    
    def _create_default(self):
        """Create default configuration"""
        logger.info("Creating default deployment config")
        
        # Check environment variable for initial mode
        mode_env = os.getenv("MAP2_DEPLOYMENT_MODE", "ALL-IN-ONE").upper()
        try:
            self.mode = DeploymentMode(mode_env)
        except ValueError:
            logger.warning(f"Invalid mode {mode_env}, using ALL-IN-ONE")
            self.mode = DeploymentMode.ALL_IN_ONE
        
        # Set policies for mode
        self.service_policies = SERVICE_POLICIES[self.mode].copy()
        
        # Timestamps
        now = datetime.utcnow().isoformat()
        self.created_at = now
        self.updated_at = now
        
        # Persist
        self.save()
    
    def _validate_policies(self):
        """Ensure all services have policies"""
        default_policies = SERVICE_POLICIES[self.mode]
        for service, policy in default_policies.items():
            if service not in self.service_policies:
                self.service_policies[service] = policy
    
    def save(self):
        """Persist configuration to file"""
        self.config_dir.mkdir(parents=True, exist_ok=True)
        
        data = {
            'mode': self.mode.value,
            'service_policies': {
                service: policy.value
                for service, policy in self.service_policies.items()
            },
            'created_at': self.created_at,
            'updated_at': datetime.utcnow().isoformat(),
        }
        
        with open(self.config_file, 'w') as f:
            json.dump(data, f, indent=2)
        
        self.updated_at = data['updated_at']
        logger.info(f"Saved deployment config: {self.mode.value}")
    
    def set_mode(self, mode: DeploymentMode):
        """Switch deployment mode and update service policies"""
        logger.info(f"Switching deployment mode from {self.mode.value} to {mode.value}")
        
        self.mode = mode
        self.service_policies = SERVICE_POLICIES[mode].copy()
        self.save()
    
    def get_service_policy(self, service: str) -> ServicePolicy:
        """Get policy for a service"""
        return self.service_policies.get(service, ServicePolicy.DISABLED)
    
    def is_service_enabled(self, service: str) -> bool:
        """Check if service is enabled"""
        policy = self.get_service_policy(service)
        return policy == ServicePolicy.ENABLED
    
    def is_service_degraded(self, service: str) -> bool:
        """Check if service is in degraded mode"""
        policy = self.get_service_policy(service)
        return policy == ServicePolicy.DEGRADED
    
    def to_dict(self) -> Dict:
        """Export configuration as dictionary"""
        return {
            'mode': self.mode.value,
            'service_policies': {
                service: policy.value
                for service, policy in self.service_policies.items()
            },
            'created_at': self.created_at,
            'updated_at': self.updated_at,
        }


# Global instance
_deployment_config: Optional[DeploymentConfig] = None


def get_deployment_config() -> DeploymentConfig:
    """Get or create global deployment config"""
    global _deployment_config
    if _deployment_config is None:
        _deployment_config = DeploymentConfig()
    return _deployment_config


def initialize_deployment_config(config_dir: Optional[str] = None):
    """Initialize global deployment config"""
    global _deployment_config
    _deployment_config = DeploymentConfig(config_dir)

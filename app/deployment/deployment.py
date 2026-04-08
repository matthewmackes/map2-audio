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
import tempfile
from typing import Dict, List, Optional, Set
from enum import Enum
from datetime import datetime

logger = logging.getLogger(__name__)


def _atomic_write_json(path: Path, payload: Dict[str, object]) -> None:
    """Persist JSON atomically in the destination directory."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temp_path = Path(temp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, path)
    finally:
        if temp_path.exists():
            temp_path.unlink()


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


MONITORING_HOST_MODES = {
    DeploymentMode.ALL_IN_ONE,
    DeploymentMode.CONTROL_NODE,
}


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
        "metrics_exporter": ServicePolicy.ENABLED,
        "prometheus": ServicePolicy.ENABLED,
        "grafana": ServicePolicy.ENABLED,
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
        "metrics_exporter": ServicePolicy.ENABLED,
        "prometheus": ServicePolicy.DISABLED,
        "grafana": ServicePolicy.DISABLED,
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
        "metrics_exporter": ServicePolicy.ENABLED,
        "prometheus": ServicePolicy.ENABLED,
        "grafana": ServicePolicy.ENABLED,
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
        "metrics_exporter": ServicePolicy.DEGRADED,
        "prometheus": ServicePolicy.DISABLED,
        "grafana": ServicePolicy.DISABLED,
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
        data = {
            'mode': self.mode.value,
            'service_policies': {
                service: policy.value
                for service, policy in self.service_policies.items()
            },
            'created_at': self.created_at,
            'updated_at': datetime.utcnow().isoformat(),
        }

        _atomic_write_json(self.config_file, data)
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

    def hosts_monitoring_stack(self) -> bool:
        """
        Return True when this node should host Prometheus/Grafana locally.

        Monitoring is intentionally kept off dedicated audio nodes so they only
        export lightweight scrape endpoints and avoid unnecessary background
        CPU, memory, and disk pressure.
        """
        return (
            self.mode in MONITORING_HOST_MODES
            and self.is_service_enabled("prometheus")
            and self.is_service_enabled("grafana")
        )

    def exports_node_metrics(self) -> bool:
        """
        Return True when this node should expose lightweight metrics exports.

        Audio nodes stay in this category even when they do not host the full
        monitoring stack, which lets management-plane Prometheus instances
        scrape them remotely without running local Prometheus/Grafana.
        """
        return self.get_service_policy("metrics_exporter") != ServicePolicy.DISABLED
    
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

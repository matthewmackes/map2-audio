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
from app.utils.time import utc_now

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

    T2437-B phase 2: mode authority is ``/etc/map2/mode.json`` (T2431-E).
    This class is now a **view + service-policy resolver** over that
    authority: it loads mode from the authority file, derives service
    policies as a pure function of mode, and no longer writes its own
    copy to ``~/.map2/deployment.json``. ``set_mode()`` updates the
    authority and regenerates the environment projection so every
    downstream consumer sees the change atomically.

    The legacy ``~/.map2/deployment.json`` file is read once at startup
    for backwards compatibility if the authority file is absent; it is
    never written by this class again.
    """

    def __init__(self, config_dir: Optional[str] = None):
        if config_dir is None:
            config_dir = str(Path.home() / ".map2")

        self.config_dir = Path(config_dir)
        # Retained for backwards-compat introspection only; we no longer
        # write to this file after T2437-B phase 2.
        self.config_file = self.config_dir / "deployment.json"

        # Runtime state
        self.mode: DeploymentMode = DeploymentMode.ALL_IN_ONE
        self.service_policies: Dict[str, ServicePolicy] = {}
        self.created_at: Optional[str] = None
        self.updated_at: Optional[str] = None

        # Load existing or create default
        self._load_or_create()

    def _load_or_create(self):
        """Load config from the T2437 authority, falling back to legacy."""
        # T2437-B phase 2: authority first.
        try:
            from app.deployment.authority import (
                DeploymentModeAuthorityError,
                get_deployment_mode_authority,
            )

            authority = get_deployment_mode_authority()
            if authority.exists():
                try:
                    payload = authority.read()
                    self.mode = DeploymentMode(payload.mode)
                    self.service_policies = SERVICE_POLICIES[self.mode].copy()
                    self.created_at = payload.updated_at
                    self.updated_at = payload.updated_at
                    logger.info(
                        "Loaded deployment mode from authority %s: %s",
                        authority.path,
                        self.mode.value,
                    )
                    return
                except DeploymentModeAuthorityError as exc:
                    logger.warning(
                        "Authority file %s unreadable: %s — falling back to legacy",
                        authority.path,
                        exc,
                    )
        except Exception as exc:  # pragma: no cover — import/circular safety
            logger.debug("Authority load skipped: %s", exc)

        # Legacy fallback: ~/.map2/deployment.json (read-only after T2437-B).
        if self.config_file.exists():
            try:
                self._load()
                logger.info(
                    "Loaded deployment config from legacy mirror %s: %s "
                    "(authority file %s absent — operator should run "
                    "`map2-authority-doctor.py create-authority <mode>`)",
                    self.config_file,
                    self.mode.value,
                    "/etc/map2/mode.json",
                )
            except Exception as e:
                logger.error(f"Failed to load deployment config: {e}, using default")
                self._create_default()
        else:
            self._create_default()

    def _load(self):
        """Load configuration from the legacy mirror (read-only path)."""
        with open(self.config_file, 'r') as f:
            data = json.load(f)

        mode_str = data.get('mode', 'ALL-IN-ONE')
        self.mode = DeploymentMode(mode_str)

        policies_data = data.get('service_policies', {})
        self.service_policies = {
            service: ServicePolicy(policy)
            for service, policy in policies_data.items()
        }

        self._validate_policies()
        self.created_at = data.get('created_at')
        self.updated_at = data.get('updated_at')

    def _create_default(self):
        """Create default configuration from env var (read-only path)."""
        logger.info("Creating default in-memory deployment config")

        mode_env = os.getenv("MAP2_DEPLOYMENT_MODE", "ALL-IN-ONE").upper()
        try:
            self.mode = DeploymentMode(mode_env)
        except ValueError:
            logger.warning(f"Invalid mode {mode_env}, using ALL-IN-ONE")
            self.mode = DeploymentMode.ALL_IN_ONE

        self.service_policies = SERVICE_POLICIES[self.mode].copy()
        now = utc_now().isoformat()
        self.created_at = now
        self.updated_at = now
        # T2437-B phase 2: no longer persists. The authority is operator-
        # created via `map2-authority-doctor.py create-authority <mode>`;
        # this in-memory default keeps the process alive until then.

    def _validate_policies(self):
        """Ensure all services have policies"""
        default_policies = SERVICE_POLICIES[self.mode]
        for service, policy in default_policies.items():
            if service not in self.service_policies:
                self.service_policies[service] = policy

    def save(self):
        """No-op after T2437-B phase 2 — the authority owns persistence.

        Retained so any external caller that invokes ``save()`` does not
        crash. Writes are handled by ``set_mode()`` against the authority
        file, not against the legacy mirror.
        """
        logger.debug(
            "DeploymentConfig.save() is a no-op after T2437-B. "
            "Mutate the authority via set_mode() or map2-authority-doctor.py."
        )

    def set_mode(self, mode: DeploymentMode):
        """Switch deployment mode via the authority file."""
        logger.info(f"Switching deployment mode from {self.mode.value} to {mode.value}")

        self.mode = mode
        self.service_policies = SERVICE_POLICIES[mode].copy()
        self.updated_at = utc_now().isoformat()

        # T2437-B phase 2: write the authority file + regenerate the env
        # projection. Doctors on other nodes will detect the new checksum.
        try:
            from app.deployment.authority import (
                get_deployment_mode_authority,
                write_environment_projection,
            )

            authority = get_deployment_mode_authority()
            authority.write(mode.value, set_by="DeploymentConfig.set_mode")
            try:
                write_environment_projection(authority)
            except Exception as exc:
                logger.warning("Environment projection refresh failed: %s", exc)
        except Exception as exc:
            logger.warning(
                "Authority-file write failed (mode still set in-memory): %s",
                exc,
            )
    
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

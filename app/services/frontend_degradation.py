"""
Frontend-Only Mode Graceful Degradation

When deployed in FRONTEND-ONLY mode:
- Disable heavy audio services
- Return placeholder/proxy responses from API
- Maintain read-only access to remote backend
- Optimize for lightweight frontend operation
"""

import logging
from typing import Optional, Dict, Any
from app.deployment.deployment import get_deployment_config, DeploymentMode, ServicePolicy
from app.utils.singleton import Singleton

logger = logging.getLogger(__name__)


class FrontendOnlyGracefulDegradation(Singleton):
    """
    Manages graceful degradation in frontend-only mode.
    Provides proxy responses and disables heavy services.
    """
    
    def __init__(self):
        self.config = get_deployment_config()
        self.remote_backend_url: Optional[str] = None
    
    def is_frontend_only_mode(self) -> bool:
        """Check if we're running in frontend-only mode"""
        return self.config.mode == DeploymentMode.FRONTEND_ONLY
    
    def set_remote_backend(self, url: str):
        """Set the remote backend URL for proxying requests"""
        self.remote_backend_url = url
        logger.info(f"Remote backend configured: {url}")
    
    def is_service_available(self, service: str) -> bool:
        """Check if a service is available in current mode"""
        if not self.is_frontend_only_mode():
            return self.config.is_service_enabled(service)
        
        policy = self.config.get_service_policy(service)
        return policy != ServicePolicy.DISABLED
    
    def get_service_policy(self, service: str) -> ServicePolicy:
        """Get policy for a service"""
        return self.config.get_service_policy(service)
    
    def should_proxy_request(self, service: str) -> bool:
        """Should this request be proxied to remote backend?"""
        if not self.is_frontend_only_mode():
            return False
        
        policy = self.config.get_service_policy(service)
        return policy == ServicePolicy.DEGRADED
    
    def get_placeholder_response(self, service: str, endpoint: str = "") -> Dict[str, Any]:
        """
        Get a placeholder response for disabled services
        
        Args:
            service: Service name (e.g., "audio_io", "plugin_loader")
            endpoint: Specific endpoint being called
        """
        if not self.is_frontend_only_mode():
            return {}
        
        placeholders = {
            "juce_engine": {
                "status": "disabled",
                "message": "JUCE audio engine disabled in frontend-only mode",
                "suggestion": "Connect to an audio-node for audio processing",
            },
            "audio_io": {
                "status": "disabled",
                "message": "Audio I/O disabled in frontend-only mode",
                "audio_devices": [],
                "suggestion": "Connect to an audio-node for audio processing",
            },
            "plugin_loader": {
                "status": "disabled",
                "message": "Plugin loading disabled in frontend-only mode",
                "plugins": [],
                "suggestion": "Connect to an audio-node to load and manage plugins",
            },
            "plugin_scanner": {
                "status": "disabled",
                "message": "Plugin scanning disabled in frontend-only mode",
                "plugins": [],
            },
            "database": {
                "status": "degraded",
                "message": "Database in read-only mode",
                "mode": "read-only",
            },
            "api_server": {
                "status": "degraded",
                "message": "API server running in frontend-only mode with limited functionality",
                "remote_backend": self.remote_backend_url or "not configured",
            },
        }
        
        return placeholders.get(service, {
            "status": "degraded",
            "message": f"{service} not available in frontend-only mode",
        })
    
    def get_health_check_response(self) -> Dict[str, Any]:
        """Get health check response for frontend-only mode"""
        if not self.is_frontend_only_mode():
            return {}
        
        return {
            "mode": "frontend-only",
            "status": "running",
            "capabilities": {
                "web_ui": True,
                "tui": True,
                "api_server": True,
                "mdns_discovery": True,
                "audio_processing": False,
                "plugin_loading": False,
                "database": "read-only",
            },
            "remote_backend": self.remote_backend_url or None,
            "message": "Frontend-only mode: Connect to audio-node for full capabilities",
        }


def get_frontend_degradation() -> FrontendOnlyGracefulDegradation:
    """Get or create global frontend degradation manager"""
    return FrontendOnlyGracefulDegradation.get_instance()


def initialize_frontend_degradation(remote_backend_url: Optional[str] = None):
    """Initialize frontend-only degradation"""
    FrontendOnlyGracefulDegradation.reset_instance()
    manager = FrontendOnlyGracefulDegradation.get_instance()
    if remote_backend_url:
        manager.set_remote_backend(remote_backend_url)
    
    logger.info("Frontend-only graceful degradation initialized")

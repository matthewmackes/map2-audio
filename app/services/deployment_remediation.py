"""
Deployment Remediation Service

One-click remediation actions in TUI:
- Restart services
- Fix configuration issues
- Re-discover peers
- Run health checks
"""

import logging
import subprocess
import asyncio
from typing import Dict, Optional, Callable, Any
from enum import Enum

logger = logging.getLogger(__name__)


class RemediationAction(Enum):
    """Available remediation actions"""
    RESTART_MDNS = "restart_mdns"
    RESTART_SSH = "restart_ssh"
    RESTART_BACKEND = "restart_backend"
    RESTART_WEB_UI = "restart_web_ui"
    REGENERATE_SSH_KEYS = "regenerate_ssh_keys"
    REDISCOVER_PEERS = "rediscover_peers"
    RESET_DATABASE = "reset_database"
    CHECK_NETWORK = "check_network"


class RemediationResult:
    """Result of a remediation action"""
    
    def __init__(
        self,
        action: RemediationAction,
        success: bool,
        message: str,
        details: Optional[str] = None,
    ):
        self.action = action
        self.success = success
        self.message = message
        self.details = details
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'action': self.action.value,
            'success': self.success,
            'message': self.message,
            'details': self.details,
        }


class DeploymentRemediationService:
    """
    Provides one-click remediation actions for deployment issues.
    """
    
    async def restart_mdns(self) -> RemediationResult:
        """Restart mDNS (Avahi) service"""
        try:
            # Stop
            subprocess.run(
                ['sudo', 'systemctl', 'stop', 'avahi-daemon'],
                capture_output=True,
                timeout=10,
            )
            
            # Wait a moment
            await asyncio.sleep(1)
            
            # Start
            result = subprocess.run(
                ['sudo', 'systemctl', 'start', 'avahi-daemon'],
                capture_output=True,
                timeout=10,
                text=True,
            )
            
            if result.returncode == 0:
                return RemediationResult(
                    action=RemediationAction.RESTART_MDNS,
                    success=True,
                    message="mDNS service restarted successfully",
                )
            else:
                return RemediationResult(
                    action=RemediationAction.RESTART_MDNS,
                    success=False,
                    message="Failed to restart mDNS service",
                    details=result.stderr or result.stdout,
                )
        except Exception as e:
            return RemediationResult(
                action=RemediationAction.RESTART_MDNS,
                success=False,
                message=f"Error restarting mDNS: {e}",
            )
    
    async def restart_ssh(self) -> RemediationResult:
        """Restart SSH service"""
        try:
            result = subprocess.run(
                ['sudo', 'systemctl', 'restart', 'ssh'],
                capture_output=True,
                timeout=10,
                text=True,
            )
            
            if result.returncode == 0:
                return RemediationResult(
                    action=RemediationAction.RESTART_SSH,
                    success=True,
                    message="SSH service restarted successfully",
                )
            else:
                return RemediationResult(
                    action=RemediationAction.RESTART_SSH,
                    success=False,
                    message="Failed to restart SSH service",
                    details=result.stderr or result.stdout,
                )
        except Exception as e:
            return RemediationResult(
                action=RemediationAction.RESTART_SSH,
                success=False,
                message=f"Error restarting SSH: {e}",
            )
    
    async def restart_backend(self) -> RemediationResult:
        """Restart backend service (MAP2)"""
        try:
            # Try to restart MAP2 service if it exists
            result = subprocess.run(
                ['sudo', 'systemctl', 'restart', 'map2-audio'],
                capture_output=True,
                timeout=15,
                text=True,
            )
            
            if result.returncode == 0:
                return RemediationResult(
                    action=RemediationAction.RESTART_BACKEND,
                    success=True,
                    message="Backend service restarted successfully",
                )
            else:
                # Service might not be managed by systemd
                return RemediationResult(
                    action=RemediationAction.RESTART_BACKEND,
                    success=False,
                    message="Backend service restart not available",
                    details="Service may not be running as systemd unit",
                )
        except Exception as e:
            return RemediationResult(
                action=RemediationAction.RESTART_BACKEND,
                success=False,
                message=f"Error restarting backend: {e}",
            )
    
    async def restart_web_ui(self) -> RemediationResult:
        """Restart web UI service"""
        try:
            # Web UI typically runs as part of backend, but we can check nginx if used
            result = subprocess.run(
                ['sudo', 'systemctl', 'restart', 'nginx'],
                capture_output=True,
                timeout=10,
                text=True,
            )
            
            if result.returncode == 0:
                return RemediationResult(
                    action=RemediationAction.RESTART_WEB_UI,
                    success=True,
                    message="Web UI (nginx) restarted successfully",
                )
            else:
                # nginx might not be in use
                return RemediationResult(
                    action=RemediationAction.RESTART_WEB_UI,
                    success=False,
                    message="Web UI service not found",
                    details="nginx service not running or installed",
                )
        except Exception as e:
            return RemediationResult(
                action=RemediationAction.RESTART_WEB_UI,
                success=False,
                message=f"Error with web UI: {e}",
            )
    
    async def regenerate_ssh_keys(self) -> RemediationResult:
        """Regenerate SSH keys"""
        try:
            from app.routes.ssh_trust import GenerateKeyRequest
            from app.routes import ssh_trust as ssh_trust_module
            
            # Create a fake request object
            class FakeRequest:
                key_type = "rsa"
                key_bits = 4096
            
            # Call the generate function
            result = await ssh_trust_module.generate_ssh_keys(FakeRequest())
            
            return RemediationResult(
                action=RemediationAction.REGENERATE_SSH_KEYS,
                success=True,
                message="SSH keys regenerated successfully",
                details=f"Fingerprint: {result.fingerprint}",
            )
        except Exception as e:
            return RemediationResult(
                action=RemediationAction.REGENERATE_SSH_KEYS,
                success=False,
                message=f"Error regenerating SSH keys: {e}",
            )
    
    async def rediscover_peers(self) -> RemediationResult:
        """Trigger peer re-discovery"""
        try:
            from app.services.lcd_manager import lcd_manager as global_lcd_manager
            
            if not global_lcd_manager or not global_lcd_manager.mdns_discovery:
                return RemediationResult(
                    action=RemediationAction.REDISCOVER_PEERS,
                    success=False,
                    message="mDNS discovery not available",
                )
            
            mdns = global_lcd_manager.mdns_discovery
            
            # Restart discovery
            if hasattr(mdns, 'stop'):
                await mdns.stop()
            
            await asyncio.sleep(1)
            
            if hasattr(mdns, 'start'):
                await mdns.start()
            
            return RemediationResult(
                action=RemediationAction.REDISCOVER_PEERS,
                success=True,
                message="Peer discovery restarted",
            )
        except Exception as e:
            return RemediationResult(
                action=RemediationAction.REDISCOVER_PEERS,
                success=False,
                message=f"Error rediscovering peers: {e}",
            )
    
    async def check_network(self) -> RemediationResult:
        """Run network diagnostics"""
        try:
            diagnostics = []
            
            # Check connectivity
            result = subprocess.run(
                ['ping', '-c', '1', '8.8.8.8'],
                capture_output=True,
                timeout=5,
            )
            
            if result.returncode == 0:
                diagnostics.append("✓ Internet connectivity OK")
            else:
                diagnostics.append("✗ No internet connectivity")
            
            # Check DNS
            result = subprocess.run(
                ['nslookup', 'google.com'],
                capture_output=True,
                timeout=5,
            )
            
            if result.returncode == 0:
                diagnostics.append("✓ DNS resolution OK")
            else:
                diagnostics.append("✗ DNS resolution failed")
            
            # Check local network
            result = subprocess.run(
                ['ip', 'addr', 'show'],
                capture_output=True,
                timeout=5,
                text=True,
            )
            
            # Count active interfaces
            interfaces = [l for l in result.stdout.split('\n') if 'inet' in l]
            diagnostics.append(f"✓ {len(interfaces)} active network interfaces")
            
            return RemediationResult(
                action=RemediationAction.CHECK_NETWORK,
                success=True,
                message="Network diagnostics completed",
                details="\n".join(diagnostics),
            )
        except Exception as e:
            return RemediationResult(
                action=RemediationAction.CHECK_NETWORK,
                success=False,
                message=f"Error running network diagnostics: {e}",
            )
    
    async def execute_action(self, action: RemediationAction) -> RemediationResult:
        """Execute a remediation action"""
        logger.info(f"Executing remediation action: {action.value}")
        
        handlers = {
            RemediationAction.RESTART_MDNS: self.restart_mdns,
            RemediationAction.RESTART_SSH: self.restart_ssh,
            RemediationAction.RESTART_BACKEND: self.restart_backend,
            RemediationAction.RESTART_WEB_UI: self.restart_web_ui,
            RemediationAction.REGENERATE_SSH_KEYS: self.regenerate_ssh_keys,
            RemediationAction.REDISCOVER_PEERS: self.rediscover_peers,
            RemediationAction.CHECK_NETWORK: self.check_network,
        }
        
        handler = handlers.get(action)
        if not handler:
            return RemediationResult(
                action=action,
                success=False,
                message=f"Unknown remediation action: {action.value}",
            )
        
        try:
            result = await handler()
            logger.info(f"Remediation action {action.value}: {result.message}")
            return result
        except Exception as e:
            logger.error(f"Error executing remediation action {action.value}: {e}")
            return RemediationResult(
                action=action,
                success=False,
                message=f"Error executing remediation: {e}",
            )


# Global instance
_remediation_service: Optional[DeploymentRemediationService] = None


def get_remediation_service() -> DeploymentRemediationService:
    """Get or create global remediation service"""
    global _remediation_service
    if _remediation_service is None:
        _remediation_service = DeploymentRemediationService()
    return _remediation_service

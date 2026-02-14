"""
Deployment Mode Health Checks

Provides mode-specific health check logic and remediation actions.
Verifies prerequisites for each deployment mode and reports issues.
"""

import logging
import subprocess
import asyncio
from typing import List, Dict, Optional, Callable
from dataclasses import dataclass
from enum import Enum
from datetime import datetime

from app.deployment.deployment import get_deployment_config, DeploymentMode

logger = logging.getLogger(__name__)


class CheckStatus(Enum):
    """Health check status"""
    PASS = "pass"
    WARN = "warn"
    FAIL = "fail"


@dataclass
class HealthCheckResult:
    """Result of a health check"""
    check_name: str
    status: CheckStatus
    message: str
    remediation: Optional[str] = None
    command: Optional[str] = None


class DeploymentModeHealthChecker:
    """
    Performs mode-specific health checks and provides remediation actions.
    """
    
    def __init__(self):
        self.config = get_deployment_config()
        self.last_check_time: Optional[datetime] = datetime.now()  # Initialize to current time
    
    async def check_network_connectivity(self) -> HealthCheckResult:
        """Check basic network connectivity"""
        try:
            result = subprocess.run(
                ['ping', '-c', '1', '8.8.8.8'],
                capture_output=True,
                timeout=5,
            )
            if result.returncode == 0:
                return HealthCheckResult(
                    check_name="network_connectivity",
                    status=CheckStatus.PASS,
                    message="Network connectivity OK",
                )
            else:
                return HealthCheckResult(
                    check_name="network_connectivity",
                    status=CheckStatus.FAIL,
                    message="No internet connectivity",
                    remediation="Check network connection and firewall settings",
                )
        except Exception as e:
            return HealthCheckResult(
                check_name="network_connectivity",
                status=CheckStatus.WARN,
                message=f"Network check failed: {e}",
            )
    
    async def check_mdns_service(self) -> HealthCheckResult:
        """Check mDNS/Avahi service"""
        try:
            result = subprocess.run(
                ['systemctl', 'is-active', 'avahi-daemon'],
                capture_output=True,
                timeout=5,
            )
            if result.returncode == 0:
                return HealthCheckResult(
                    check_name="mdns_service",
                    status=CheckStatus.PASS,
                    message="mDNS (Avahi) service running",
                )
            else:
                return HealthCheckResult(
                    check_name="mdns_service",
                    status=CheckStatus.FAIL,
                    message="mDNS (Avahi) service not running",
                    remediation="Start Avahi daemon",
                    command="sudo systemctl start avahi-daemon",
                )
        except Exception as e:
            return HealthCheckResult(
                check_name="mdns_service",
                status=CheckStatus.WARN,
                message=f"mDNS check failed: {e}",
                remediation="Check that avahi-daemon is installed",
                command="sudo apt-get install avahi-daemon",
            )
    
    async def check_ssh_keys(self) -> HealthCheckResult:
        """Check SSH keys exist and are configured"""
        from pathlib import Path
        
        try:
            ssh_dir = Path.home() / ".ssh"
            ssh_keys = list(ssh_dir.glob("map2_*"))
            
            if ssh_keys:
                key_count = len([k for k in ssh_keys if not str(k).endswith('.pub')])
                return HealthCheckResult(
                    check_name="ssh_keys",
                    status=CheckStatus.PASS,
                    message=f"SSH keys available ({key_count} key pairs)",
                )
            else:
                return HealthCheckResult(
                    check_name="ssh_keys",
                    status=CheckStatus.FAIL,
                    message="No SSH keys found",
                    remediation="Generate SSH keys via /api/ssh/keys/generate",
                )
        except Exception as e:
            return HealthCheckResult(
                check_name="ssh_keys",
                status=CheckStatus.WARN,
                message=f"SSH key check failed: {e}",
            )
    
    async def check_ssh_connectivity(self) -> HealthCheckResult:
        """Check SSH connectivity to other nodes"""
        try:
            # Check if SSH server is running locally (sshd on most distros, ssh on Debian)
            sshd_result = subprocess.run(
                ['systemctl', 'is-active', 'sshd'],
                capture_output=True,
                timeout=5,
            )
            ssh_result = subprocess.run(
                ['systemctl', 'is-active', 'ssh'],
                capture_output=True,
                timeout=5,
            )

            if sshd_result.returncode == 0 or ssh_result.returncode == 0:
                return HealthCheckResult(
                    check_name="ssh_connectivity",
                    status=CheckStatus.PASS,
                    message="SSH server running",
                )
            else:
                return HealthCheckResult(
                    check_name="ssh_connectivity",
                    status=CheckStatus.FAIL,
                    message="SSH server not running",
                    remediation="Start SSH server",
                    command="sudo systemctl start sshd",
                )
        except Exception as e:
            return HealthCheckResult(
                check_name="ssh_connectivity",
                status=CheckStatus.WARN,
                message=f"SSH check failed: {e}",
                remediation="Check that openssh-server is installed",
                command="sudo apt-get install openssh-server",
            )
    
    async def check_database_connectivity(self) -> HealthCheckResult:
        """Check database availability"""
        try:
            # Try to import and check database
            from app.database_session import get_session
            
            session = get_session()
            if session:
                return HealthCheckResult(
                    check_name="database_connectivity",
                    status=CheckStatus.PASS,
                    message="Database connection available",
                )
            else:
                return HealthCheckResult(
                    check_name="database_connectivity",
                    status=CheckStatus.FAIL,
                    message="Database connection failed",
                )
        except Exception as e:
            return HealthCheckResult(
                check_name="database_connectivity",
                status=CheckStatus.WARN,
                message=f"Database check failed: {e}",
            )
    
    async def check_audio_hardware(self) -> HealthCheckResult:
        """Check audio hardware availability (for AUDIO-NODE mode)"""
        if self.config.mode not in [DeploymentMode.AUDIO_NODE, DeploymentMode.ALL_IN_ONE]:
            return HealthCheckResult(
                check_name="audio_hardware",
                status=CheckStatus.PASS,
                message="Audio hardware check not needed in this mode",
            )
        
        try:
            # Check for ALSA or JACK
            result = subprocess.run(
                ['aplay', '-l'],
                capture_output=True,
                timeout=5,
            )
            
            if result.returncode == 0:
                lines = result.stdout.decode().strip().split('\n')
                device_count = len([l for l in lines if 'card' in l.lower()])
                
                return HealthCheckResult(
                    check_name="audio_hardware",
                    status=CheckStatus.PASS,
                    message=f"Audio hardware available ({device_count} devices)",
                )
            else:
                return HealthCheckResult(
                    check_name="audio_hardware",
                    status=CheckStatus.WARN,
                    message="No audio devices detected",
                    remediation="Check audio hardware connection and drivers",
                )
        except Exception as e:
            return HealthCheckResult(
                check_name="audio_hardware",
                status=CheckStatus.WARN,
                message=f"Audio hardware check failed: {e}",
            )
    
    async def check_alsa_config(self) -> HealthCheckResult:
        """Check ALSA configuration (for AUDIO-NODE mode)"""
        if self.config.mode not in [DeploymentMode.AUDIO_NODE, DeploymentMode.ALL_IN_ONE]:
            return HealthCheckResult(
                check_name="alsa_config",
                status=CheckStatus.PASS,
                message="ALSA check not needed in this mode",
            )
        
        try:
            from pathlib import Path
            
            asound_rc = Path.home() / ".asoundrc"
            if asound_rc.exists():
                return HealthCheckResult(
                    check_name="alsa_config",
                    status=CheckStatus.PASS,
                    message="ALSA configuration file present",
                )
            else:
                return HealthCheckResult(
                    check_name="alsa_config",
                    status=CheckStatus.PASS,
                    message="ALSA configuration not required for MAP2",
                )
        except Exception as e:
            return HealthCheckResult(
                check_name="alsa_config",
                status=CheckStatus.WARN,
                message=f"ALSA config check failed: {e}",
            )
    
    async def check_peers_discovered(self) -> HealthCheckResult:
        """Check if any peers have been discovered (for multi-node modes)"""
        if self.config.mode == DeploymentMode.ALL_IN_ONE:
            return HealthCheckResult(
                check_name="peers_discovered",
                status=CheckStatus.PASS,
                message="Peer discovery not needed in all-in-one mode",
            )
        
        try:
            from app.services.cluster.mdns_discovery_enhanced import get_enhanced_mdns_discovery

            discovery = get_enhanced_mdns_discovery()
            summary = discovery.get_cluster_summary()
            online_nodes = int(summary.get("online_nodes", 0))
            total_discovered = int(summary.get("total_discovered", 0))

            if online_nodes > 0:
                return HealthCheckResult(
                    check_name="peers_discovered",
                    status=CheckStatus.PASS,
                    message=f"Discovered {online_nodes} online peer(s) ({total_discovered} cached)",
                )

            return HealthCheckResult(
                check_name="peers_discovered",
                status=CheckStatus.WARN,
                message="No online peers discovered",
                remediation="Check mDNS broadcast, network multicast, and peer service status",
            )
        except Exception as e:
            return HealthCheckResult(
                check_name="peers_discovered",
                status=CheckStatus.WARN,
                message=f"Peer discovery check failed: {e}",
            )
    
    async def run_all_checks(self) -> List[HealthCheckResult]:
        """Run all relevant health checks for current mode"""
        # Record check start time
        self.last_check_time = datetime.now()
        
        checks = [
            self.check_network_connectivity(),
            self.check_mdns_service(),
            self.check_ssh_keys(),
            self.check_ssh_connectivity(),
            self.check_database_connectivity(),
        ]
        
        # Mode-specific checks
        if self.config.mode in [DeploymentMode.AUDIO_NODE, DeploymentMode.ALL_IN_ONE]:
            checks.extend([
                self.check_audio_hardware(),
                self.check_alsa_config(),
            ])
        
        if self.config.mode != DeploymentMode.ALL_IN_ONE:
            checks.append(self.check_peers_discovered())
        
        # Run all checks concurrently
        return await asyncio.gather(*checks)
    
    async def get_overall_status(self) -> Dict:
        """Get overall deployment health status"""
        checks = await self.run_all_checks()
        
        passed = sum(1 for c in checks if c.status == CheckStatus.PASS)
        warned = sum(1 for c in checks if c.status == CheckStatus.WARN)
        failed = sum(1 for c in checks if c.status == CheckStatus.FAIL)
        
        if failed > 0:
            overall = "unhealthy"
        elif warned > 2:
            overall = "degraded"
        else:
            overall = "healthy"
        
        failed_checks = [c for c in checks if c.status == CheckStatus.FAIL]
        
        # Format last check time
        last_checked = "Never"
        if self.last_check_time:
            delta = (datetime.now() - self.last_check_time).total_seconds()
            if delta < 60:
                last_checked = f"{int(delta)}s ago"
            elif delta < 3600:
                last_checked = f"{int(delta // 60)}m ago"
            else:
                last_checked = self.last_check_time.strftime("%H:%M:%S")
        
        return {
            "mode": self.config.mode.value,
            "overall_status": overall,
            "checks_passed": passed,
            "checks_warned": warned,
            "checks_failed": failed,
            "total_checks": len(checks),
            "last_checked": last_checked,
            "last_check_timestamp": self.last_check_time.isoformat() if self.last_check_time else None,
            "failed_checks": [
                {
                    "name": c.check_name,
                    "message": c.message,
                    "remediation": c.remediation,
                    "command": c.command,
                }
                for c in failed_checks
            ],
            "all_checks": [
                {
                    "name": c.check_name,
                    "status": c.status.value,
                    "message": c.message,
                    "remediation": c.remediation,
                }
                for c in checks
            ],
        }


# Global instance
_health_checker: Optional[DeploymentModeHealthChecker] = None


def get_deployment_health_checker() -> DeploymentModeHealthChecker:
    """Get or create global health checker"""
    global _health_checker
    if _health_checker is None:
        _health_checker = DeploymentModeHealthChecker()
    return _health_checker

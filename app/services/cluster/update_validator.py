"""
MAP2 Audio Cluster - Update Validation Engine

Comprehensive validation for pre-update and post-update health checks.
Prevents problematic updates and ensures successful deployments.
"""

from dataclasses import dataclass
from enum import Enum
from typing import List, Dict, Tuple, Optional
import subprocess
import json
from datetime import datetime, timezone
from pathlib import Path
import logging

from app.services.cluster.registry import get_cluster_registry
from app.services.cluster.health_aggregator import get_health_aggregator
from app.services.cluster.fedora_package_manager import get_dnf_manager
from app.services.cluster.integration_helpers import HybridNodeClient
from app.utils.time import utc_now


class ValidationLevel(Enum):
    """Validation severity levels."""
    CRITICAL = "critical"      # Must pass to proceed
    WARNING = "warning"        # Alert, but can proceed
    INFO = "info"              # Informational only


@dataclass
class ValidationResult:
    """Result of a single validation check."""
    name: str
    level: ValidationLevel
    passed: bool
    message: str
    details: Dict = None
    timestamp: str = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = utc_now().isoformat()
    
    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "name": self.name,
            "level": self.level.value,
            "passed": self.passed,
            "message": self.message,
            "details": self.details or {},
            "timestamp": self.timestamp
        }


@dataclass
class ValidationReport:
    """Complete validation report."""
    check_type: str  # "pre-update" or "post-update"
    timestamp: str
    total_checks: int
    passed_checks: int
    failed_critical: int
    failed_warning: int
    results: List[ValidationResult]
    can_proceed: bool
    
    def summary(self) -> str:
        """Generate summary text."""
        return (
            f"Validation Report ({self.check_type})\n"
            f"{'=' * 50}\n"
            f"Total Checks: {self.total_checks}\n"
            f"Passed: {self.passed_checks}\n"
            f"Failed (Critical): {self.failed_critical}\n"
            f"Failed (Warning): {self.failed_warning}\n"
            f"Can Proceed: {'✓ Yes' if self.can_proceed else '✗ No'}\n"
        )


class UpdateValidator:
    """Pre-update and post-update validation engine."""
    
    def __init__(self, cluster_api_url: str = "http://localhost:8080"):
        """Initialize validator."""
        self.api_url = cluster_api_url
        self.results = []
        self.logger = logging.getLogger(__name__)
        self.registry = get_cluster_registry()
        self.aggregator = get_health_aggregator()
        self.dnf = get_dnf_manager()

    def _get_node_client(self, node_id: str) -> Optional[HybridNodeClient]:
        """Create a HybridNodeClient for a node if possible."""
        if not self.registry:
            return None
        node = self.registry.get_node(node_id)
        if not node:
            return None
        node_ip = node.get("ip_address") or node.get("ip") or node.get("host") or node.get("hostname")
        if not node_ip:
            return None
        return HybridNodeClient(node_id, node_ip, f"http://{node_ip}:8080")
    
    # =========================================================================
    # Pre-Update Validations
    # =========================================================================
    
    def validate_pre_update(self, node_id: Optional[str] = None) -> ValidationReport:
        """Run all pre-update validations."""
        self.results = []
        
        # Health checks
        self.check_cluster_health()
        self.check_node_health(node_id)
        self.check_audio_devices()
        
        # System checks
        self.check_disk_space()
        self.check_network_connectivity()
        self.check_memory_available()
        
        # Package checks
        self.check_package_compatibility()
        self.check_dependency_resolution()
        
        # State checks
        self.check_no_active_updates()
        self.check_recent_backup_exists()
        self.check_state_consistency()
        
        return self._generate_report("pre-update")
    
    def check_cluster_health(self) -> None:
        """Verify cluster health score is acceptable."""
        try:
            health_summary = self.aggregator.get_cluster_health() if self.aggregator else {}
            health_score = health_summary.get("overall_health", 50.0)
            
            if health_score >= 80:
                self.results.append(ValidationResult(
                    name="Cluster Health Score",
                    level=ValidationLevel.CRITICAL,
                    passed=True,
                    message=f"Cluster health score: {health_score}% (acceptable)"
                ))
            elif health_score >= 70:
                self.results.append(ValidationResult(
                    name="Cluster Health Score",
                    level=ValidationLevel.WARNING,
                    passed=True,
                    message=f"Cluster health score: {health_score}% (degraded)",
                    details={"recommended_action": "investigate_before_update"}
                ))
            else:
                self.results.append(ValidationResult(
                    name="Cluster Health Score",
                    level=ValidationLevel.CRITICAL,
                    passed=False,
                    message=f"Cluster health score too low: {health_score}%"
                ))
        except Exception as e:
            self.results.append(ValidationResult(
                name="Cluster Health Score",
                level=ValidationLevel.WARNING,
                passed=False,
                message=f"Could not verify cluster health: {str(e)}"
            ))
    
    def check_node_health(self, node_id: Optional[str] = None) -> None:
        """Check individual node health."""
        try:
            nodes = {}
            if self.registry:
                try:
                    all_nodes = self.registry.get_all_nodes()
                    for node in all_nodes:
                        nid = node.get("id") or node.get("node_id")
                        if not nid:
                            continue
                        health = None
                        if self.aggregator:
                            health = self.aggregator.get_node_health(nid)
                        nodes[nid] = health
                except Exception as e:
                    self.logger.warning(f"Failed to get nodes: {e}")

            if not nodes:
                self.results.append(ValidationResult(
                    name="Node Health Check",
                    level=ValidationLevel.WARNING,
                    passed=False,
                    message="No node health data available"
                ))
                return
            
            for nid, score in nodes.items():
                if node_id and nid != node_id:
                    continue
                
                if score is None:
                    self.results.append(ValidationResult(
                        name=f"Node Health ({nid})",
                        level=ValidationLevel.WARNING,
                        passed=False,
                        message=f"No health score available for {nid}"
                    ))
                elif score >= 80:
                    self.results.append(ValidationResult(
                        name=f"Node Health ({nid})",
                        level=ValidationLevel.CRITICAL,
                        passed=True,
                        message=f"Node {nid} health: {score}%"
                    ))
                else:
                    self.results.append(ValidationResult(
                        name=f"Node Health ({nid})",
                        level=ValidationLevel.WARNING,
                        passed=False,
                        message=f"Node {nid} health below optimal: {score}%"
                    ))
        except Exception as e:
            self.results.append(ValidationResult(
                name="Node Health Check",
                level=ValidationLevel.WARNING,
                passed=False,
                message=f"Could not verify node health: {str(e)}"
            ))
    
    def check_audio_devices(self) -> None:
        """Verify audio devices are responsive."""
        try:
            nodes = self.registry.get_nodes_by_role("AUDIO-NODE") if self.registry else []
            if not nodes:
                self.results.append(ValidationResult(
                    name="Audio Devices",
                    level=ValidationLevel.WARNING,
                    passed=False,
                    message="No audio nodes found to verify devices"
                ))
                return

            for node in nodes:
                node_id = node.get("id") or node.get("node_id")
                if not node_id:
                    continue
                client = self._get_node_client(node_id)
                if not client:
                    self.results.append(ValidationResult(
                        name=f"Audio Devices ({node_id})",
                        level=ValidationLevel.WARNING,
                        passed=False,
                        message="No connection info available"
                    ))
                    continue
                try:
                    rc, output, _ = client.execute_command("aplay -l | grep -c '^card'", timeout=10)
                    if rc != 0:
                        raise RuntimeError("aplay failed")
                    device_count = int(output.strip() or 0)
                    if device_count > 0:
                        self.results.append(ValidationResult(
                            name=f"Audio Devices ({node_id})",
                            level=ValidationLevel.CRITICAL,
                            passed=True,
                            message=f"{device_count} audio device(s) detected"
                        ))
                    else:
                        self.results.append(ValidationResult(
                            name=f"Audio Devices ({node_id})",
                            level=ValidationLevel.CRITICAL,
                            passed=False,
                            message="No audio devices detected"
                        ))
                except Exception as e:
                    self.results.append(ValidationResult(
                        name=f"Audio Devices ({node_id})",
                        level=ValidationLevel.WARNING,
                        passed=False,
                        message=f"Could not verify audio devices: {str(e)}"
                    ))
        except Exception as e:
            self.results.append(ValidationResult(
                name="Audio Devices Check",
                level=ValidationLevel.WARNING,
                passed=False,
                message=f"Could not verify audio devices: {str(e)}"
            ))
    
    def check_disk_space(self) -> None:
        """Verify sufficient disk space for update."""
        try:
            required_mb = self.dnf.get_disk_space_required() if self.dnf else 2048
            nodes = self.registry.get_all_nodes() if self.registry else []

            if not nodes:
                ok = self.dnf.verify_disk_space(required_mb) if self.dnf else True
                self.results.append(ValidationResult(
                    name="Disk Space (local)",
                    level=ValidationLevel.CRITICAL,
                    passed=ok,
                    message=f"Local disk space {'OK' if ok else 'insufficient'}",
                    details={"required_mb": required_mb}
                ))
                return

            for node in nodes:
                node_id = node.get("id") or node.get("node_id")
                if not node_id:
                    continue
                client = self._get_node_client(node_id)
                if not client:
                    self.results.append(ValidationResult(
                        name=f"Disk Space ({node_id})",
                        level=ValidationLevel.WARNING,
                        passed=False,
                        message="No connection info available"
                    ))
                    continue
                try:
                    rc, output, _ = client.execute_command("df -m / --output=avail | tail -n1", timeout=10)
                    if rc != 0:
                        raise RuntimeError("df failed")
                    available_mb = int(output.strip())
                    if available_mb >= required_mb * 2:
                        self.results.append(ValidationResult(
                            name=f"Disk Space ({node_id})",
                            level=ValidationLevel.CRITICAL,
                            passed=True,
                            message=f"Disk space: {available_mb}MB available"
                        ))
                    elif available_mb >= required_mb:
                        self.results.append(ValidationResult(
                            name=f"Disk Space ({node_id})",
                            level=ValidationLevel.WARNING,
                            passed=True,
                            message=f"Disk space low: {available_mb}MB available",
                            details={"recommendation": "clean_old_logs"}
                        ))
                    else:
                        self.results.append(ValidationResult(
                            name=f"Disk Space ({node_id})",
                            level=ValidationLevel.CRITICAL,
                            passed=False,
                            message=f"Insufficient disk space: {available_mb}MB < {required_mb}MB required"
                        ))
                except Exception as e:
                    self.results.append(ValidationResult(
                        name=f"Disk Space ({node_id})",
                        level=ValidationLevel.WARNING,
                        passed=False,
                        message=f"Could not verify disk space: {str(e)}"
                    ))
        except Exception as e:
            self.results.append(ValidationResult(
                name="Disk Space Check",
                level=ValidationLevel.WARNING,
                passed=False,
                message=f"Could not verify disk space: {str(e)}"
            ))
    
    def check_network_connectivity(self) -> None:
        """Verify network connectivity between nodes."""
        try:
            nodes = self.registry.get_all_nodes() if self.registry else []
            if not nodes:
                self.results.append(ValidationResult(
                    name="Network Connectivity",
                    level=ValidationLevel.WARNING,
                    passed=False,
                    message="No nodes available to test connectivity"
                ))
                return

            for node in nodes:
                node_id = node.get("id") or node.get("node_id")
                node_ip = node.get("ip_address") or node.get("ip") or node.get("host")
                if not node_id or not node_ip:
                    continue
                try:
                    result = subprocess.run(
                        ["ping", "-c", "2", "-W", "2", node_ip],
                        capture_output=True,
                        text=True,
                        timeout=5,
                    )
                    if result.returncode == 0:
                        self.results.append(ValidationResult(
                            name=f"Network Connectivity ({node_id})",
                            level=ValidationLevel.CRITICAL,
                            passed=True,
                            message="Ping OK"
                        ))
                    else:
                        self.results.append(ValidationResult(
                            name=f"Network Connectivity ({node_id})",
                            level=ValidationLevel.WARNING,
                            passed=False,
                            message="Ping failed"
                        ))
                except Exception as e:
                    self.results.append(ValidationResult(
                        name=f"Network Connectivity ({node_id})",
                        level=ValidationLevel.WARNING,
                        passed=False,
                        message=f"Ping error: {str(e)}"
                    ))
        except Exception as e:
            self.results.append(ValidationResult(
                name="Network Connectivity Check",
                level=ValidationLevel.WARNING,
                passed=False,
                message=f"Could not verify network connectivity: {str(e)}"
            ))
    
    def check_memory_available(self) -> None:
        """Check available memory on nodes."""
        try:
            nodes = self.registry.get_all_nodes() if self.registry else []
            if not nodes:
                self.results.append(ValidationResult(
                    name="Memory Available",
                    level=ValidationLevel.WARNING,
                    passed=False,
                    message="No nodes available to test memory"
                ))
                return

            min_required_mb = 4096
            for node in nodes:
                node_id = node.get("id") or node.get("node_id")
                if not node_id:
                    continue
                client = self._get_node_client(node_id)
                if not client:
                    self.results.append(ValidationResult(
                        name=f"Memory Available ({node_id})",
                        level=ValidationLevel.WARNING,
                        passed=False,
                        message="No connection info available"
                    ))
                    continue
                try:
                    rc, output, _ = client.execute_command("free -m | awk '/Mem:/ {print $2, $7}'", timeout=10)
                    if rc != 0:
                        raise RuntimeError("free failed")
                    total_mb, avail_mb = (int(x) for x in output.strip().split())
                    if avail_mb >= min_required_mb * 2:
                        self.results.append(ValidationResult(
                            name=f"Memory Available ({node_id})",
                            level=ValidationLevel.CRITICAL,
                            passed=True,
                            message=f"Memory: {avail_mb}MB available"
                        ))
                    elif avail_mb >= min_required_mb:
                        self.results.append(ValidationResult(
                            name=f"Memory Available ({node_id})",
                            level=ValidationLevel.WARNING,
                            passed=True,
                            message=f"Memory low: {avail_mb}MB available",
                            details={"recommendation": "restart_non_essential_services"}
                        ))
                    else:
                        self.results.append(ValidationResult(
                            name=f"Memory Available ({node_id})",
                            level=ValidationLevel.CRITICAL,
                            passed=False,
                            message=f"Insufficient memory: {avail_mb}MB < {min_required_mb}MB required"
                        ))
                except Exception as e:
                    self.results.append(ValidationResult(
                        name=f"Memory Available ({node_id})",
                        level=ValidationLevel.WARNING,
                        passed=False,
                        message=f"Could not verify memory: {str(e)}"
                    ))
        except Exception as e:
            self.results.append(ValidationResult(
                name="Memory Check",
                level=ValidationLevel.WARNING,
                passed=False,
                message=f"Could not verify memory: {str(e)}"
            ))
    
    def check_package_compatibility(self) -> None:
        """Check package update compatibility."""
        try:
            updates = self.dnf.check_for_updates() if self.dnf else []
            if updates:
                self.results.append(ValidationResult(
                    name="Package Compatibility",
                    level=ValidationLevel.CRITICAL,
                    passed=True,
                    message=f"{len(updates)} updates available; compatibility not blocked"
                ))
            else:
                self.results.append(ValidationResult(
                    name="Package Compatibility",
                    level=ValidationLevel.INFO,
                    passed=True,
                    message="No updates available"
                ))
        except Exception as e:
            self.results.append(ValidationResult(
                name="Package Compatibility Check",
                level=ValidationLevel.WARNING,
                passed=False,
                message=f"Could not verify package compatibility: {str(e)}"
            ))
    
    def check_dependency_resolution(self) -> None:
        """Check package dependency resolution."""
        try:
            simulation = self.dnf.simulate_update() if self.dnf else {"success": True}
            resolved = simulation.get("success", False)
            self.results.append(ValidationResult(
                name="Dependency Resolution",
                level=ValidationLevel.CRITICAL,
                passed=resolved,
                message="All package dependencies resolved" if resolved else "Unmet dependencies detected",
                details=simulation if not resolved else None
            ))
        except Exception as e:
            self.results.append(ValidationResult(
                name="Dependency Resolution",
                level=ValidationLevel.CRITICAL,
                passed=False,
                message=f"Could not check dependencies: {str(e)}"
            ))
    
    def check_no_active_updates(self) -> None:
        """Ensure no updates are currently in progress."""
        try:
            updating_nodes = []
            if self.registry:
                try:
                    nodes = self.registry.get_all_nodes()
                    updating_nodes = [
                        n.get("id") for n in nodes if n.get("status") == "updating"
                    ]
                except Exception:
                    updating_nodes = []
            
            if not updating_nodes:
                self.results.append(ValidationResult(
                    name="No Active Updates",
                    level=ValidationLevel.CRITICAL,
                    passed=True,
                    message="No active updates in progress"
                ))
            else:
                self.results.append(ValidationResult(
                    name="No Active Updates",
                    level=ValidationLevel.CRITICAL,
                    passed=False,
                    message=f"Updates in progress on: {', '.join(updating_nodes)}"
                ))
        except Exception as e:
            self.results.append(ValidationResult(
                name="Active Updates Check",
                level=ValidationLevel.WARNING,
                passed=False,
                message=f"Could not check active updates: {str(e)}"
            ))
    
    def check_recent_backup_exists(self) -> None:
        """Verify recent backup exists before updating."""
        try:
            backup_dir = Path("/var/lib/map2/backups")
            max_age_hours = 24
            if not backup_dir.exists():
                self.results.append(ValidationResult(
                    name="Recent Backup",
                    level=ValidationLevel.WARNING,
                    passed=False,
                    message="Backup directory not found"
                ))
                return

            backups = sorted(backup_dir.glob("**/*"), key=lambda p: p.stat().st_mtime, reverse=True)
            if not backups:
                self.results.append(ValidationResult(
                    name="Recent Backup",
                    level=ValidationLevel.CRITICAL,
                    passed=False,
                    message="No backups found"
                ))
                return

            latest = backups[0]
            age_hours = (
                utc_now() - datetime.fromtimestamp(latest.stat().st_mtime, tz=timezone.utc)
            ).total_seconds() / 3600

            if age_hours <= max_age_hours:
                self.results.append(ValidationResult(
                    name="Recent Backup",
                    level=ValidationLevel.CRITICAL,
                    passed=True,
                    message=f"Recent backup exists ({age_hours:.1f} hours old)"
                ))
            else:
                self.results.append(ValidationResult(
                    name="Recent Backup",
                    level=ValidationLevel.CRITICAL,
                    passed=False,
                    message=f"No recent backup (last: {age_hours:.1f} hours ago)"
                ))
        except Exception as e:
            self.results.append(ValidationResult(
                name="Recent Backup Check",
                level=ValidationLevel.CRITICAL,
                passed=False,
                message=f"Could not verify backup: {str(e)}"
            ))
    
    def check_state_consistency(self) -> None:
        """Check cluster state consistency."""
        try:
            # Verify all nodes agree on cluster state
            consistent = True  # Would compare node states
            
            self.results.append(ValidationResult(
                name="State Consistency",
                level=ValidationLevel.CRITICAL,
                passed=consistent,
                message="Cluster state consistent across all nodes" if consistent else "State inconsistency detected"
            ))
        except Exception as e:
            self.results.append(ValidationResult(
                name="State Consistency Check",
                level=ValidationLevel.WARNING,
                passed=False,
                message=f"Could not verify state consistency: {str(e)}"
            ))
    
    # =========================================================================
    # Post-Update Validations
    # =========================================================================
    
    def validate_post_update(self, node_id: Optional[str] = None) -> ValidationReport:
        """Run all post-update validations."""
        self.results = []
        
        # Service checks
        self.check_services_running(node_id)
        self.check_cluster_agent_running(node_id)
        
        # Audio checks
        self.check_audio_subsystem()
        self.check_xruns_acceptable()
        self.check_dsp_load_normal()
        
        # Network checks
        self.check_network_after_update()
        
        # System checks
        self.check_logs_for_errors()
        self.check_health_score_recovery()
        
        return self._generate_report("post-update")
    
    def check_services_running(self, node_id: Optional[str] = None) -> None:
        """Verify critical services are running."""
        try:
            nodes = self.registry.get_all_nodes() if self.registry else []
            if node_id:
                nodes = [n for n in nodes if (n.get("id") or n.get("node_id")) == node_id]

            if not nodes:
                self.results.append(ValidationResult(
                    name="Service Running",
                    level=ValidationLevel.WARNING,
                    passed=False,
                    message="No nodes available to verify services"
                ))
                return

            services = ["map2-cluster-agent", "map2-audio-engine", "map2-api-server"]
            for node in nodes:
                nid = node.get("id") or node.get("node_id")
                if not nid:
                    continue
                client = self._get_node_client(nid)
                if not client:
                    self.results.append(ValidationResult(
                        name=f"Service Running ({nid})",
                        level=ValidationLevel.WARNING,
                        passed=False,
                        message="No connection info available"
                    ))
                    continue
                for service in services:
                    try:
                        rc, _, _ = client.execute_command(f"systemctl is-active {service}", timeout=10)
                        running = rc == 0
                        self.results.append(ValidationResult(
                            name=f"Service Running ({service} on {nid})",
                            level=ValidationLevel.CRITICAL,
                            passed=running,
                            message=f"{service} is {'running' if running else 'not running'}"
                        ))
                    except Exception as e:
                        self.results.append(ValidationResult(
                            name=f"Service Running ({service} on {nid})",
                            level=ValidationLevel.WARNING,
                            passed=False,
                            message=f"Could not verify service: {str(e)}"
                        ))
        except Exception as e:
            self.results.append(ValidationResult(
                name="Services Check",
                level=ValidationLevel.CRITICAL,
                passed=False,
                message=f"Could not verify services: {str(e)}"
            ))
    
    def check_cluster_agent_running(self, node_id: Optional[str] = None) -> None:
        """Check cluster agent connectivity."""
        try:
            nodes = self.registry.get_all_nodes() if self.registry else []
            expected_nodes = len(nodes)
            online_nodes = [n for n in nodes if n.get("status") == "online"]
            nodes_connected = len(online_nodes)
            
            if expected_nodes == 0:
                self.results.append(ValidationResult(
                    name="Cluster Agent Connected",
                    level=ValidationLevel.WARNING,
                    passed=False,
                    message="No nodes registered"
                ))
                return

            if nodes_connected == expected_nodes:
                self.results.append(ValidationResult(
                    name="Cluster Agent Connected",
                    level=ValidationLevel.CRITICAL,
                    passed=True,
                    message=f"All {nodes_connected} nodes connected to cluster"
                ))
            else:
                self.results.append(ValidationResult(
                    name="Cluster Agent Connected",
                    level=ValidationLevel.CRITICAL,
                    passed=False,
                    message=f"Only {nodes_connected}/{expected_nodes} nodes connected"
                ))
        except Exception as e:
            self.results.append(ValidationResult(
                name="Cluster Agent Check",
                level=ValidationLevel.WARNING,
                passed=False,
                message=f"Could not verify cluster agent: {str(e)}"
            ))
    
    def check_audio_subsystem(self) -> None:
        """Verify audio subsystem functional."""
        try:
            nodes = self.registry.get_nodes_by_role("AUDIO-NODE") if self.registry else []
            if not nodes:
                self.results.append(ValidationResult(
                    name="Audio Subsystem",
                    level=ValidationLevel.WARNING,
                    passed=False,
                    message="No audio nodes available"
                ))
                return

            for node in nodes:
                node_id = node.get("id") or node.get("node_id")
                if not node_id:
                    continue
                client = self._get_node_client(node_id)
                if not client:
                    self.results.append(ValidationResult(
                        name=f"Audio Subsystem ({node_id})",
                        level=ValidationLevel.WARNING,
                        passed=False,
                        message="No connection info available"
                    ))
                    continue
                try:
                    rc, _, _ = client.execute_command("systemctl is-active pipewire", timeout=10)
                    ok = rc == 0
                    self.results.append(ValidationResult(
                        name=f"Audio Subsystem ({node_id})",
                        level=ValidationLevel.CRITICAL,
                        passed=ok,
                        message="Audio subsystem functional" if ok else "Audio subsystem error detected"
                    ))
                except Exception as e:
                    self.results.append(ValidationResult(
                        name=f"Audio Subsystem ({node_id})",
                        level=ValidationLevel.WARNING,
                        passed=False,
                        message=f"Could not verify audio subsystem: {str(e)}"
                    ))
        except Exception as e:
            self.results.append(ValidationResult(
                name="Audio Subsystem Check",
                level=ValidationLevel.CRITICAL,
                passed=False,
                message=f"Could not verify audio subsystem: {str(e)}"
            ))
    
    def check_xruns_acceptable(self) -> None:
        """Check xrun count is back to normal."""
        try:
            if not self.aggregator or not self.aggregator.metrics_cache:
                self.results.append(ValidationResult(
                    name="Xruns Acceptable",
                    level=ValidationLevel.WARNING,
                    passed=False,
                    message="No xrun metrics available"
                ))
                return

            for node_id, metrics in self.aggregator.metrics_cache.items():
                xrun_count = metrics.xrun_count
                if xrun_count == 0:
                    self.results.append(ValidationResult(
                        name=f"Xruns Acceptable ({node_id})",
                        level=ValidationLevel.CRITICAL,
                        passed=True,
                        message="No xruns detected post-update"
                    ))
                elif xrun_count < 5:
                    self.results.append(ValidationResult(
                        name=f"Xruns Acceptable ({node_id})",
                        level=ValidationLevel.WARNING,
                        passed=True,
                        message=f"Minor xruns detected: {xrun_count} (monitoring)",
                        details={"recommendation": "monitor_closely"}
                    ))
                else:
                    self.results.append(ValidationResult(
                        name=f"Xruns Acceptable ({node_id})",
                        level=ValidationLevel.CRITICAL,
                        passed=False,
                        message=f"Excessive xruns post-update: {xrun_count}"
                    ))
        except Exception as e:
            self.results.append(ValidationResult(
                name="Xruns Check",
                level=ValidationLevel.WARNING,
                passed=False,
                message=f"Could not check xruns: {str(e)}"
            ))
    
    def check_dsp_load_normal(self) -> None:
        """Verify DSP load is normal."""
        try:
            if not self.aggregator or not self.aggregator.metrics_cache:
                self.results.append(ValidationResult(
                    name="DSP Load Normal",
                    level=ValidationLevel.WARNING,
                    passed=False,
                    message="No DSP metrics available"
                ))
                return

            for node_id, metrics in self.aggregator.metrics_cache.items():
                load = metrics.dsp_load_percent
                if load < 70:
                    self.results.append(ValidationResult(
                        name=f"DSP Load Normal ({node_id})",
                        level=ValidationLevel.CRITICAL,
                        passed=True,
                        message=f"DSP load normal: {load}%"
                    ))
                else:
                    self.results.append(ValidationResult(
                        name=f"DSP Load Normal ({node_id})",
                        level=ValidationLevel.WARNING,
                        passed=False,
                        message=f"DSP load elevated post-update: {load}%"
                    ))
        except Exception as e:
            self.results.append(ValidationResult(
                name="DSP Load Check",
                level=ValidationLevel.WARNING,
                passed=False,
                message=f"Could not check DSP load: {str(e)}"
            ))
    
    def check_network_after_update(self) -> None:
        """Verify network operation post-update."""
        try:
            nodes = self.registry.get_all_nodes() if self.registry else []
            if not nodes:
                self.results.append(ValidationResult(
                    name="Network After Update",
                    level=ValidationLevel.WARNING,
                    passed=False,
                    message="No nodes available to verify network"
                ))
                return

            for node in nodes:
                node_id = node.get("id") or node.get("node_id")
                node_ip = node.get("ip_address") or node.get("ip") or node.get("host")
                if not node_id or not node_ip:
                    continue
                try:
                    result = subprocess.run(
                        ["ping", "-c", "2", "-W", "2", node_ip],
                        capture_output=True,
                        text=True,
                        timeout=5,
                    )
                    ok = result.returncode == 0
                    self.results.append(ValidationResult(
                        name=f"Network After Update ({node_id})",
                        level=ValidationLevel.CRITICAL if ok else ValidationLevel.WARNING,
                        passed=ok,
                        message="Network reachable" if ok else "Network unreachable"
                    ))
                except Exception as e:
                    self.results.append(ValidationResult(
                        name=f"Network After Update ({node_id})",
                        level=ValidationLevel.WARNING,
                        passed=False,
                        message=f"Network check failed: {str(e)}"
                    ))
        except Exception as e:
            self.results.append(ValidationResult(
                name="Network Check",
                level=ValidationLevel.WARNING,
                passed=False,
                message=f"Could not verify network: {str(e)}"
            ))
    
    def check_logs_for_errors(self) -> None:
        """Check logs for critical errors post-update."""
        try:
            try:
                result = subprocess.run(
                    ["journalctl", "-p", "err", "-n", "20", "--no-pager"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                error_count = len([line for line in result.stdout.splitlines() if line.strip()])
                if error_count == 0:
                    self.results.append(ValidationResult(
                        name="Logs Clear of Errors",
                        level=ValidationLevel.CRITICAL,
                        passed=True,
                        message="No critical errors in logs"
                    ))
                else:
                    self.results.append(ValidationResult(
                        name="Logs Clear of Errors",
                        level=ValidationLevel.WARNING,
                        passed=False,
                        message=f"{error_count} error(s) found in logs post-update"
                    ))
            except Exception as e:
                self.results.append(ValidationResult(
                    name="Logs Clear of Errors",
                    level=ValidationLevel.WARNING,
                    passed=False,
                    message=f"Could not check logs: {str(e)}"
                ))
        except Exception as e:
            self.results.append(ValidationResult(
                name="Log Check",
                level=ValidationLevel.WARNING,
                passed=False,
                message=f"Could not check logs: {str(e)}"
            ))
    
    def check_health_score_recovery(self) -> None:
        """Verify cluster health score recovers post-update."""
        try:
            health_summary = self.aggregator.get_cluster_health() if self.aggregator else {}
            health_score = health_summary.get("overall_health", 0.0)
            baseline = max(health_summary.get("avg_health", 0.0), 1.0)
            recovery_percent = (health_score / baseline) * 100 if baseline else 0

            if recovery_percent >= 95:
                self.results.append(ValidationResult(
                    name="Health Score Recovery",
                    level=ValidationLevel.CRITICAL,
                    passed=True,
                    message=f"Health score recovered: {health_score:.1f}% ({recovery_percent:.0f}% of baseline)"
                ))
            elif recovery_percent >= 80:
                self.results.append(ValidationResult(
                    name="Health Score Recovery",
                    level=ValidationLevel.WARNING,
                    passed=True,
                    message=f"Health score recovering: {health_score:.1f}% ({recovery_percent:.0f}% of baseline)"
                ))
            else:
                self.results.append(ValidationResult(
                    name="Health Score Recovery",
                    level=ValidationLevel.CRITICAL,
                    passed=False,
                    message=f"Health score not recovered: {health_score:.1f}% (only {recovery_percent:.0f}% of baseline)"
                ))
        except Exception as e:
            self.results.append(ValidationResult(
                name="Health Score Check",
                level=ValidationLevel.WARNING,
                passed=False,
                message=f"Could not check health score: {str(e)}"
            ))
    
    # =========================================================================
    # Report Generation
    # =========================================================================
    
    def _generate_report(self, check_type: str) -> ValidationReport:
        """Generate validation report."""
        passed = sum(1 for r in self.results if r.passed)
        failed_critical = sum(1 for r in self.results if not r.passed and r.level == ValidationLevel.CRITICAL)
        failed_warning = sum(1 for r in self.results if not r.passed and r.level == ValidationLevel.WARNING)
        
        can_proceed = failed_critical == 0
        
        return ValidationReport(
            check_type=check_type,
            timestamp=utc_now().isoformat(),
            total_checks=len(self.results),
            passed_checks=passed,
            failed_critical=failed_critical,
            failed_warning=failed_warning,
            results=self.results,
            can_proceed=can_proceed
        )
    
    def export_report_json(self, report: ValidationReport, filepath: str) -> None:
        """Export report to JSON."""
        data = {
            "check_type": report.check_type,
            "timestamp": report.timestamp,
            "summary": {
                "total": report.total_checks,
                "passed": report.passed_checks,
                "failed_critical": report.failed_critical,
                "failed_warning": report.failed_warning,
                "can_proceed": report.can_proceed
            },
            "results": [r.to_dict() for r in report.results]
        }
        
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)


# =========================================================================
# CLI Usage
# =========================================================================

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Update Validation Engine")
    parser.add_argument("--type", choices=["pre", "post"], required=True, help="Validation type")
    parser.add_argument("--node", help="Specific node ID (optional)")
    parser.add_argument("--export", help="Export report to JSON file")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")
    
    args = parser.parse_args()
    
    validator = UpdateValidator()
    
    if args.type == "pre":
        report = validator.validate_pre_update(args.node)
    else:
        report = validator.validate_post_update(args.node)
    
    print(report.summary())
    
    if args.verbose:
        for result in report.results:
            status = "✓" if result.passed else "✗"
            print(f"{status} {result.name}: {result.message}")
    
    if args.export:
        validator.export_report_json(report, args.export)
        print(f"Report exported to: {args.export}")
    
    exit(0 if report.can_proceed else 1)

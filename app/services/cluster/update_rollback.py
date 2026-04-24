"""
MAP2 Audio Cluster - Automatic Update Rollback System

Detects failed updates and automatically rolls back to previous
stable state using package snapshots and state restoration.
"""

from dataclasses import dataclass
from enum import Enum
from typing import List, Dict, Optional
import subprocess
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from app.paths import Map2Paths

from .post_update_health import HealthCheckResult, HealthCheckPhase

logger = logging.getLogger(__name__)


class RollbackReason(Enum):
    """Reasons for triggering rollback."""
    HEALTH_CHECK_FAILED = "health_check_failed"
    SERVICES_NOT_STARTING = "services_not_starting"
    AUDIO_SUBSYSTEM_ERROR = "audio_subsystem_error"
    EXCESSIVE_XRUNS = "excessive_xruns"
    NETWORK_CONNECTIVITY_LOST = "network_connectivity_lost"
    MANUAL_TRIGGER = "manual_trigger"
    HEALTH_DEGRADATION = "health_degradation"


@dataclass
class RollbackSnapshot:
    """Snapshot of system state before update."""
    snapshot_id: str
    node_id: str
    timestamp: str
    packages: Dict[str, str]  # package_name -> version
    config_files: List[str]
    database_backup: Optional[str]
    service_states: Dict[str, bool]
    
    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "snapshot_id": self.snapshot_id,
            "node_id": self.node_id,
            "timestamp": self.timestamp,
            "packages": self.packages,
            "config_files": self.config_files,
            "database_backup": self.database_backup,
            "service_states": self.service_states
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'RollbackSnapshot':
        """Create from dictionary."""
        return cls(
            snapshot_id=data["snapshot_id"],
            node_id=data["node_id"],
            timestamp=data["timestamp"],
            packages=data["packages"],
            config_files=data["config_files"],
            database_backup=data.get("database_backup"),
            service_states=data["service_states"]
        )


@dataclass
class RollbackResult:
    """Result of rollback operation."""
    success: bool
    node_id: str
    snapshot_id: str
    timestamp: str
    reason: RollbackReason
    steps_completed: List[str]
    errors: List[str]
    duration_seconds: float
    
    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "success": self.success,
            "node_id": self.node_id,
            "snapshot_id": self.snapshot_id,
            "timestamp": self.timestamp,
            "reason": self.reason.value,
            "steps_completed": self.steps_completed,
            "errors": self.errors,
            "duration_seconds": self.duration_seconds
        }


class UpdateRollbackManager:
    """
    Manages automatic rollback of failed updates.
    
    Features:
    - Pre-update snapshot creation
    - Package version rollback (dnf history undo)
    - Configuration file restoration
    - Service state restoration
    - Database backup restoration
    - Validation after rollback
    """
    
    def __init__(self, snapshot_dir: Optional[str] = None):
        """Initialize rollback manager."""
        self.snapshot_dir = Path(snapshot_dir) if snapshot_dir else Map2Paths.service_file("rollback_snapshots")
        self.snapshot_dir.mkdir(parents=True, exist_ok=True)
        
        # Packages to always capture in snapshot
        self.critical_packages = [
            "python3",
            "pipewire",
            "wireplumber",
            "kernel",
            "systemd",
            "map2-cluster-agent",
            "map2-audio-engine"
        ]
        
        # Config files to backup
        self.critical_configs = [
            "/etc/map2/cluster.conf",
            "/etc/map2/node.conf",
            "/etc/systemd/system/map2-*.service"
        ]
    
    def create_snapshot(self, node_id: str) -> RollbackSnapshot:
        """
        Create pre-update snapshot.
        
        Args:
            node_id: Node to snapshot
        
        Returns:
            Snapshot object
        """
        logger.info(f"Creating rollback snapshot for {node_id}")
        
        snapshot_id = f"{node_id}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"
        
        # Capture package versions
        packages = self._capture_package_versions()
        
        # Backup config files
        config_files = self._backup_config_files(snapshot_id)
        
        # Backup database
        database_backup = self._backup_database(snapshot_id)
        
        # Capture service states
        service_states = self._capture_service_states()
        
        snapshot = RollbackSnapshot(
            snapshot_id=snapshot_id,
            node_id=node_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            packages=packages,
            config_files=config_files,
            database_backup=database_backup,
            service_states=service_states
        )
        
        # Save snapshot metadata
        self._save_snapshot(snapshot)
        
        logger.info(f"Snapshot created: {snapshot_id}")
        return snapshot
    
    def rollback(
        self, 
        snapshot_id: str, 
        reason: RollbackReason,
        validate_after: bool = True
    ) -> RollbackResult:
        """
        Perform automatic rollback to snapshot.
        
        Args:
            snapshot_id: Snapshot to restore
            reason: Reason for rollback
            validate_after: Run validation after rollback
        
        Returns:
            Rollback result
        """
        start_time = datetime.now(timezone.utc)
        steps_completed = []
        errors = []
        
        logger.warning(f"Starting rollback to snapshot {snapshot_id} (reason: {reason.value})")
        
        try:
            # Load snapshot
            snapshot = self._load_snapshot(snapshot_id)
            if not snapshot:
                raise ValueError(f"Snapshot {snapshot_id} not found")
            
            # Step 1: Stop services
            try:
                self._stop_services()
                steps_completed.append("stop_services")
            except Exception as e:
                errors.append(f"Failed to stop services: {str(e)}")
            
            # Step 2: Rollback packages
            try:
                self._rollback_packages(snapshot.packages)
                steps_completed.append("rollback_packages")
            except Exception as e:
                errors.append(f"Failed to rollback packages: {str(e)}")
                # Package rollback failure is critical
                raise
            
            # Step 3: Restore config files
            try:
                self._restore_config_files(snapshot.snapshot_id, snapshot.config_files)
                steps_completed.append("restore_configs")
            except Exception as e:
                errors.append(f"Failed to restore configs: {str(e)}")
            
            # Step 4: Restore database
            if snapshot.database_backup:
                try:
                    self._restore_database(snapshot.database_backup)
                    steps_completed.append("restore_database")
                except Exception as e:
                    errors.append(f"Failed to restore database: {str(e)}")
            
            # Step 5: Restart services
            try:
                self._start_services(snapshot.service_states)
                steps_completed.append("restart_services")
            except Exception as e:
                errors.append(f"Failed to restart services: {str(e)}")
            
            # Step 6: Validate rollback (if requested)
            if validate_after:
                try:
                    validation_ok = self._validate_rollback(snapshot.node_id)
                    if validation_ok:
                        steps_completed.append("validation_passed")
                    else:
                        errors.append("Post-rollback validation failed")
                except Exception as e:
                    errors.append(f"Validation error: {str(e)}")
            
            duration = (datetime.now(timezone.utc) - start_time).total_seconds()
            
            success = len(errors) == 0
            
            result = RollbackResult(
                success=success,
                node_id=snapshot.node_id,
                snapshot_id=snapshot_id,
                timestamp=datetime.now(timezone.utc).isoformat(),
                reason=reason,
                steps_completed=steps_completed,
                errors=errors,
                duration_seconds=duration
            )
            
            if success:
                logger.info(f"Rollback completed successfully in {duration:.1f}s")
            else:
                logger.error(f"Rollback completed with errors: {errors}")
            
            # Save rollback result
            self._save_rollback_result(result)
            
            return result
            
        except Exception as e:
            duration = (datetime.now(timezone.utc) - start_time).total_seconds()
            logger.error(f"Rollback failed: {str(e)}")
            
            return RollbackResult(
                success=False,
                node_id=snapshot.node_id if 'snapshot' in locals() else "unknown",
                snapshot_id=snapshot_id,
                timestamp=datetime.now(timezone.utc).isoformat(),
                reason=reason,
                steps_completed=steps_completed,
                errors=errors + [f"Critical error: {str(e)}"],
                duration_seconds=duration
            )
    
    def auto_rollback_on_health_failure(
        self, 
        health_result: HealthCheckResult,
        snapshot_id: str
    ) -> Optional[RollbackResult]:
        """
        Automatically trigger rollback based on health check failure.
        
        Args:
            health_result: Failed health check result
            snapshot_id: Snapshot to rollback to
        
        Returns:
            Rollback result if triggered, None if not needed
        """
        if not health_result.should_rollback:
            return None
        
        # Determine reason based on health check phase
        reason_map = {
            HealthCheckPhase.IMMEDIATE: RollbackReason.SERVICES_NOT_STARTING,
            HealthCheckPhase.SHORT_TERM: RollbackReason.AUDIO_SUBSYSTEM_ERROR,
            HealthCheckPhase.MEDIUM_TERM: RollbackReason.HEALTH_DEGRADATION,
            HealthCheckPhase.LONG_TERM: RollbackReason.HEALTH_DEGRADATION
        }
        
        reason = reason_map.get(health_result.phase, RollbackReason.HEALTH_CHECK_FAILED)
        
        logger.warning(
            f"Health check failure detected at {health_result.phase.value} phase, "
            f"triggering automatic rollback"
        )
        
        return self.rollback(snapshot_id, reason, validate_after=True)
    
    # =========================================================================
    # Internal Helper Methods
    # =========================================================================
    
    def _capture_package_versions(self) -> Dict[str, str]:
        """Capture current package versions."""
        packages = {}
        
        try:
            # Query DNF for installed packages
            result = subprocess.run(
                ["rpm", "-qa", "--queryformat", "%{NAME} %{VERSION}-%{RELEASE}\n"],
                capture_output=True,
                text=True,
                check=True
            )
            
            for line in result.stdout.strip().split('\n'):
                if not line:
                    continue
                parts = line.split(' ', 1)
                if len(parts) == 2:
                    name, version = parts
                    # Only capture critical packages to save space
                    if any(crit in name for crit in self.critical_packages):
                        packages[name] = version
            
            logger.info(f"Captured {len(packages)} package versions")
            
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to capture package versions: {e}")
        
        return packages
    
    def _backup_config_files(self, snapshot_id: str) -> List[str]:
        """Backup configuration files."""
        backup_dir = self.snapshot_dir / snapshot_id / "configs"
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        backed_up = []
        
        for config_pattern in self.critical_configs:
            try:
                # Handle glob patterns
                import glob
                for config_file in glob.glob(config_pattern):
                    if Path(config_file).exists():
                        dest = backup_dir / Path(config_file).name
                        subprocess.run(["cp", "-a", config_file, str(dest)], check=True)
                        backed_up.append(config_file)
            except Exception as e:
                logger.warning(f"Failed to backup {config_pattern}: {e}")
        
        logger.info(f"Backed up {len(backed_up)} config files")
        return backed_up
    
    def _backup_database(self, snapshot_id: str) -> Optional[str]:
        """Backup SQLite database."""
        db_path = Map2Paths.cluster_db_path()
        
        if not db_path.exists():
            return None
        
        backup_dir = self.snapshot_dir / snapshot_id / "database"
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        backup_file = backup_dir / "cluster.db.backup"
        
        try:
            subprocess.run(["cp", "-a", str(db_path), str(backup_file)], check=True)
            logger.info(f"Database backed up to {backup_file}")
            return str(backup_file)
        except Exception as e:
            logger.error(f"Failed to backup database: {e}")
            return None
    
    def _capture_service_states(self) -> Dict[str, bool]:
        """Capture current service states."""
        services = {}
        
        # List of MAP2 services to track
        map2_services = [
            "map2-cluster-agent",
            "map2-audio-engine",
            "map2-api-server"
        ]
        
        for service in map2_services:
            try:
                result = subprocess.run(
                    ["systemctl", "is-active", service],
                    capture_output=True,
                    text=True
                )
                services[service] = result.returncode == 0
            except Exception as e:
                logger.warning(f"Failed to check {service}: {e}")
                services[service] = False
        
        return services
    
    def _save_snapshot(self, snapshot: RollbackSnapshot) -> None:
        """Save snapshot metadata to JSON."""
        metadata_file = self.snapshot_dir / f"{snapshot.snapshot_id}.json"
        
        with open(metadata_file, 'w') as f:
            json.dump(snapshot.to_dict(), f, indent=2)
        
        logger.info(f"Snapshot metadata saved to {metadata_file}")
    
    def _load_snapshot(self, snapshot_id: str) -> Optional[RollbackSnapshot]:
        """Load snapshot from metadata."""
        metadata_file = self.snapshot_dir / f"{snapshot_id}.json"
        
        if not metadata_file.exists():
            logger.error(f"Snapshot metadata not found: {metadata_file}")
            return None
        
        with open(metadata_file, 'r') as f:
            data = json.load(f)
        
        return RollbackSnapshot.from_dict(data)
    
    def _stop_services(self) -> None:
        """Stop MAP2 services."""
        logger.info("Stopping MAP2 services")
        
        services = [
            "map2-cluster-agent",
            "map2-audio-engine",
            "map2-api-server"
        ]
        
        for service in services:
            try:
                subprocess.run(["systemctl", "stop", service], check=True)
            except subprocess.CalledProcessError as e:
                logger.warning(f"Failed to stop {service}: {e}")
    
    def _rollback_packages(self, packages: Dict[str, str]) -> None:
        """
        Rollback packages to previous versions.
        
        Uses DNF history undo or direct package downgrade.
        """
        logger.info("Rolling back packages")
        
        # Get last DNF transaction
        try:
            result = subprocess.run(
                ["dnf", "history", "list", "--reverse"],
                capture_output=True,
                text=True,
                check=True
            )
            
            # Parse to get last transaction ID
            lines = result.stdout.strip().split('\n')
            if len(lines) > 1:
                # Extract transaction ID from first data line
                parts = lines[1].split()
                if parts:
                    last_txn = parts[0]
                    
                    # Undo last transaction
                    logger.info(f"Undoing DNF transaction {last_txn}")
                    subprocess.run(
                        ["dnf", "history", "undo", last_txn, "-y"],
                        check=True
                    )
                    return
        except Exception as e:
            logger.warning(f"DNF history undo failed: {e}, trying package downgrade")
        
        # Fallback: downgrade specific packages
        for package_name, version in packages.items():
            try:
                subprocess.run(
                    ["dnf", "downgrade", f"{package_name}-{version}", "-y"],
                    check=True
                )
            except subprocess.CalledProcessError as e:
                logger.warning(f"Failed to downgrade {package_name}: {e}")
    
    def _restore_config_files(self, snapshot_id: str, config_files: List[str]) -> None:
        """Restore configuration files from backup."""
        logger.info("Restoring configuration files")

        backup_dir = self.snapshot_dir / snapshot_id / "configs"
        if not backup_dir.exists():
            logger.warning(f"Config backup directory not found: {backup_dir}")
            return

        for config_file in config_files:
            try:
                source = backup_dir / Path(config_file).name
                if not source.exists():
                    logger.warning(f"Backup not found for {config_file}: {source}")
                    continue

                target_path = Path(config_file)
                target_path.parent.mkdir(parents=True, exist_ok=True)
                subprocess.run(["cp", "-a", str(source), str(target_path)], check=True)
                logger.info(f"Restored {config_file} from {source}")
            except Exception as e:
                logger.warning(f"Failed to restore {config_file}: {e}")
    
    def _restore_database(self, backup_path: str) -> None:
        """Restore database from backup."""
        logger.info(f"Restoring database from {backup_path}")
        
        db_path = Map2Paths.cluster_db_path()
        
        try:
            subprocess.run(["cp", "-a", backup_path, str(db_path)], check=True)
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to restore database: {e}")
            raise
    
    def _start_services(self, service_states: Dict[str, bool]) -> None:
        """Start services based on previous states."""
        logger.info("Starting services")
        
        for service, was_active in service_states.items():
            if was_active:
                try:
                    subprocess.run(["systemctl", "start", service], check=True)
                except subprocess.CalledProcessError as e:
                    logger.error(f"Failed to start {service}: {e}")
                    raise
    
    def _validate_rollback(self, node_id: str) -> bool:
        """Validate system state after rollback."""
        logger.info("Validating rollback")
        
        # Check services are running
        all_services_ok = True
        for service in ["map2-cluster-agent", "map2-audio-engine"]:
            result = subprocess.run(
                ["systemctl", "is-active", service],
                capture_output=True
            )
            if result.returncode != 0:
                logger.error(f"Service {service} not running after rollback")
                all_services_ok = False
        
        return all_services_ok
    
    def _save_rollback_result(self, result: RollbackResult) -> None:
        """Save rollback result to log."""
        log_file = self.snapshot_dir / "rollback_history.json"
        
        # Load existing history
        history = []
        if log_file.exists():
            with open(log_file, 'r') as f:
                history = json.load(f)
        
        # Append new result
        history.append(result.to_dict())
        
        # Save
        with open(log_file, 'w') as f:
            json.dump(history, f, indent=2)
    
    def list_snapshots(self, node_id: Optional[str] = None) -> List[RollbackSnapshot]:
        """List available snapshots."""
        snapshots = []
        
        for metadata_file in self.snapshot_dir.glob("*.json"):
            if metadata_file.name == "rollback_history.json":
                continue
            
            snapshot = self._load_snapshot(metadata_file.stem)
            if snapshot:
                if node_id is None or snapshot.node_id == node_id:
                    snapshots.append(snapshot)
        
        return sorted(snapshots, key=lambda s: s.timestamp, reverse=True)


# =========================================================================
# CLI Usage
# =========================================================================

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Update Rollback Manager")
    parser.add_argument("action", choices=["create", "rollback", "list"], help="Action to perform")
    parser.add_argument("--node", help="Node ID")
    parser.add_argument("--snapshot", help="Snapshot ID for rollback")
    parser.add_argument("--reason", default="manual_trigger", help="Rollback reason")
    
    args = parser.parse_args()
    
    manager = UpdateRollbackManager()
    
    if args.action == "create":
        if not args.node:
            print("Error: --node required for create")
            exit(1)
        
        snapshot = manager.create_snapshot(args.node)
        print(f"✓ Snapshot created: {snapshot.snapshot_id}")
        print(f"  Packages: {len(snapshot.packages)}")
        print(f"  Configs: {len(snapshot.config_files)}")
    
    elif args.action == "rollback":
        if not args.snapshot:
            print("Error: --snapshot required for rollback")
            exit(1)
        
        reason = RollbackReason(args.reason)
        result = manager.rollback(args.snapshot, reason)
        
        if result.success:
            print(f"✓ Rollback successful")
            print(f"  Duration: {result.duration_seconds:.1f}s")
            print(f"  Steps: {', '.join(result.steps_completed)}")
        else:
            print(f"✗ Rollback failed")
            print(f"  Errors: {', '.join(result.errors)}")
            exit(1)
    
    elif args.action == "list":
        snapshots = manager.list_snapshots(args.node)
        print(f"Available snapshots: {len(snapshots)}")
        for snapshot in snapshots:
            print(f"  {snapshot.snapshot_id} ({snapshot.node_id}) - {snapshot.timestamp}")

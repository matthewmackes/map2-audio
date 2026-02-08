"""
Fedora DNF Package Manager Integration

Handles package management and updates across the cluster:
- Check for available updates
- Track package versions
- Implement staged update strategy
- Dry-run capability
- Rollback tracking

Uses subprocess to call dnf commands (Fedora package manager).
"""

import logging
import subprocess
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
import json
from pathlib import Path

logger = logging.getLogger(__name__)


@dataclass
class PackageUpdate:
    """Information about an available package update"""

    package_name: str
    current_version: str
    available_version: str
    repo: str = ""
    release_date: Optional[str] = None
    description: str = ""
    security: bool = False
    bugfix: bool = False
    enhancement: bool = False

    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        return {
            "package_name": self.package_name,
            "current_version": self.current_version,
            "available_version": self.available_version,
            "repo": self.repo,
            "release_date": self.release_date,
            "description": self.description,
            "security": self.security,
            "bugfix": self.bugfix,
            "enhancement": self.enhancement,
        }


@dataclass
class PackageVersionSnapshot:
    """Snapshot of installed packages at a point in time"""

    timestamp: datetime = field(default_factory=datetime.utcnow)
    node_id: str = ""
    packages: Dict[str, str] = field(default_factory=dict)  # name -> version

    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        return {
            "timestamp": self.timestamp.isoformat(),
            "node_id": self.node_id,
            "packages": self.packages,
            "package_count": len(self.packages),
        }


class FedoraDNFManager:
    """
    DNF package manager integration for Fedora systems.

    Handles package checking, updating, and tracking.
    """

    def __init__(self):
        """Initialize DNF manager"""
        self.logger = logging.getLogger(__name__)
        self.version_snapshots: Dict[str, PackageVersionSnapshot] = {}

    def check_for_updates(self) -> List[PackageUpdate]:
        """
        Check for available updates using dnf.

        Returns:
            List of available PackageUpdate objects
        """
        try:
            self.logger.debug("Checking for available updates...")

            # Run dnf check-update to get list of updates
            result = subprocess.run(
                ["dnf", "check-update", "-q"],
                capture_output=True,
                text=True,
                timeout=30,
            )

            # Exit code 100 means updates are available
            if result.returncode not in (0, 100):
                self.logger.warning(f"dnf check-update failed: {result.stderr}")
                return []

            updates = []
            if result.stdout:
                for line in result.stdout.strip().split("\n"):
                    if not line or line.startswith("Last metadata"):
                        continue

                    parts = line.split()
                    if len(parts) >= 2:
                        package_name = parts[0]
                        # Format: name version repo
                        # Extract current and available versions from dnf info
                        current_version = self._get_package_version(package_name)
                        available_version = parts[1] if len(parts) > 1 else ""

                        if current_version and available_version:
                            updates.append(
                                PackageUpdate(
                                    package_name=package_name,
                                    current_version=current_version,
                                    available_version=available_version,
                                    repo=parts[2] if len(parts) > 2 else "updates",
                                )
                            )

            self.logger.info(f"Found {len(updates)} available updates")
            return updates

        except subprocess.TimeoutExpired:
            self.logger.error("dnf check-update timed out")
            return []
        except Exception as e:
            self.logger.error(f"Failed to check for updates: {e}")
            return []

    def _get_package_version(self, package_name: str) -> Optional[str]:
        """Get currently installed version of a package"""
        try:
            result = subprocess.run(
                ["rpm", "-q", package_name],
                capture_output=True,
                text=True,
                timeout=5,
            )

            if result.returncode == 0:
                # Output format: package-version-release
                full_name = result.stdout.strip()
                # Extract version (everything after package name)
                if "-" in full_name:
                    # Remove package name prefix
                    parts = full_name.split("-")
                    # Version is typically second-to-last part before release
                    if len(parts) >= 2:
                        return parts[-2]

            return None

        except Exception as e:
            self.logger.debug(f"Failed to get package version: {e}")
            return None

    def simulate_update(self, packages: Optional[List[str]] = None) -> Dict:
        """
        Simulate an update (dry run) to check for conflicts.

        Args:
            packages: Optional list of specific packages to update (None = all)

        Returns:
            Dictionary with simulation results
        """
        try:
            self.logger.info("Simulating package update...")

            cmd = ["dnf", "update", "--setopt=tsflags=test"]
            if packages:
                cmd.extend(packages)

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60,
            )

            return {
                "success": result.returncode == 0,
                "returncode": result.returncode,
                "stdout": result.stdout[-500:] if result.stdout else "",  # Last 500 chars
                "stderr": result.stderr[-500:] if result.stderr else "",
                "conflicts": "conflict" in result.stderr.lower(),
                "dependencies": "dependency" in result.stderr.lower(),
            }

        except subprocess.TimeoutExpired:
            self.logger.error("DNF update simulation timed out")
            return {
                "success": False,
                "error": "Timeout during simulation",
            }
        except Exception as e:
            self.logger.error(f"Failed to simulate update: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    def apply_updates(
        self,
        packages: Optional[List[str]] = None,
        dry_run: bool = False,
        refresh: bool = True,
    ) -> Dict:
        """
        Apply package updates using dnf.

        Args:
            packages: Optional list of specific packages to update (None = all)
            dry_run: If true, only simulate update
            refresh: If true, run dnf with --refresh

        Returns:
            Dictionary with execution results
        """
        if dry_run:
            return self.simulate_update(packages=packages)

        try:
            self.logger.info("Applying package updates...")

            cmd = ["dnf", "update", "-y"]
            if refresh:
                cmd.append("--refresh")
            if packages:
                cmd.extend(packages)

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600,
            )

            return {
                "success": result.returncode == 0,
                "returncode": result.returncode,
                "stdout": result.stdout[-2000:] if result.stdout else "",
                "stderr": result.stderr[-2000:] if result.stderr else "",
            }

        except subprocess.TimeoutExpired:
            self.logger.error("DNF update timed out")
            return {
                "success": False,
                "error": "Timeout during update",
            }
        except Exception as e:
            self.logger.error(f"Failed to apply updates: {e}")
            return {
                "success": False,
                "error": str(e),
            }

    def get_disk_space_required(self) -> int:
        """
        Estimate disk space required for updates (in MB).

        Returns:
            Estimated MB required
        """
        try:
            # Get size of dnf cache + buffer
            result = subprocess.run(
                ["du", "-sh", "/var/cache/dnf/"],
                capture_output=True,
                text=True,
                timeout=10,
            )

            if result.returncode == 0:
                size_str = result.stdout.split()[0]
                # Parse the size (e.g., "256M")
                if "G" in size_str:
                    return int(float(size_str.replace("G", "")) * 1024)
                elif "M" in size_str:
                    return int(float(size_str.replace("M", "")))

            # Default estimate
            return 500

        except Exception:
            return 500  # Default estimate

    def snapshot_packages(self, node_id: str) -> PackageVersionSnapshot:
        """
        Take a snapshot of currently installed packages.

        Args:
            node_id: Node identifier

        Returns:
            PackageVersionSnapshot object
        """
        try:
            self.logger.debug(f"Creating package snapshot for {node_id}...")

            result = subprocess.run(
                ["rpm", "-qa", "--queryformat", "%{NAME}|%{VERSION}\n"],
                capture_output=True,
                text=True,
                timeout=30,
            )

            packages = {}
            if result.returncode == 0:
                for line in result.stdout.strip().split("\n"):
                    if "|" in line:
                        name, version = line.split("|", 1)
                        packages[name] = version

            snapshot = PackageVersionSnapshot(
                node_id=node_id,
                packages=packages,
            )

            # Store in cache
            self.version_snapshots[node_id] = snapshot

            self.logger.info(
                f"Created snapshot for {node_id}: {len(packages)} packages"
            )

            return snapshot

        except subprocess.TimeoutExpired:
            self.logger.error("Package snapshot command timed out")
            return PackageVersionSnapshot(node_id=node_id)
        except Exception as e:
            self.logger.error(f"Failed to snapshot packages: {e}")
            return PackageVersionSnapshot(node_id=node_id)

    def get_package_changes(
        self, node_id: str
    ) -> Optional[Tuple[List[str], List[str], List[str]]]:
        """
        Get changes since last snapshot for a node.

        Args:
            node_id: Node identifier

        Returns:
            Tuple of (added, removed, updated) package names or None if no prior snapshot
        """
        try:
            old_snapshot = self.version_snapshots.get(node_id)
            if not old_snapshot:
                return None

            new_snapshot = self.snapshot_packages(node_id)

            old_packages = set(old_snapshot.packages.keys())
            new_packages = set(new_snapshot.packages.keys())

            added = list(new_packages - old_packages)
            removed = list(old_packages - new_packages)

            # Updated: packages that exist in both but with different version
            updated = [
                pkg
                for pkg in old_packages & new_packages
                if old_snapshot.packages[pkg] != new_snapshot.packages[pkg]
            ]

            return (added, removed, updated)

        except Exception as e:
            self.logger.error(f"Failed to get package changes: {e}")
            return None

    def verify_disk_space(self, required_mb: int = 2048) -> bool:
        """
        Verify sufficient disk space for updates.

        Args:
            required_mb: Minimum required MB (default 2GB)

        Returns:
            True if sufficient space available
        """
        try:
            result = subprocess.run(
                ["df", "/"],
                capture_output=True,
                text=True,
                timeout=5,
            )

            if result.returncode == 0:
                # Parse df output (skip header)
                lines = result.stdout.strip().split("\n")
                if len(lines) > 1:
                    # Get available space (4th column)
                    parts = lines[1].split()
                    if len(parts) >= 4:
                        available_kb = int(parts[3])
                        available_mb = available_kb / 1024

                        if available_mb >= required_mb:
                            self.logger.info(
                                f"Disk space OK: {available_mb:.0f}MB available (need {required_mb}MB)"
                            )
                            return True
                        else:
                            self.logger.warning(
                                f"Insufficient disk space: {available_mb:.0f}MB available (need {required_mb}MB)"
                            )
                            return False

            return True  # Assume OK if can't verify

        except Exception as e:
            self.logger.error(f"Failed to verify disk space: {e}")
            return True  # Assume OK on error

    def get_update_info(self) -> Dict:
        """
        Get comprehensive update information.

        Returns:
            Dictionary with available updates, disk space, etc.
        """
        try:
            updates = self.check_for_updates()
            disk_required = self.get_disk_space_required()
            disk_ok = self.verify_disk_space(disk_required + 500)  # Add buffer

            return {
                "timestamp": datetime.utcnow().isoformat(),
                "updates_available": len(updates),
                "updates": [u.to_dict() for u in updates],
                "disk_required_mb": disk_required,
                "disk_space_ok": disk_ok,
                "security_updates": len([u for u in updates if u.security]),
                "bugfix_updates": len([u for u in updates if u.bugfix]),
                "enhancement_updates": len([u for u in updates if u.enhancement]),
            }

        except Exception as e:
            self.logger.error(f"Failed to get update info: {e}")
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "error": str(e),
            }


# Global DNF manager instance
_dnf_manager: Optional[FedoraDNFManager] = None


def get_dnf_manager() -> FedoraDNFManager:
    """Get or create the DNF manager singleton"""
    global _dnf_manager
    if _dnf_manager is None:
        _dnf_manager = FedoraDNFManager()
    return _dnf_manager

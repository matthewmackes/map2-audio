"""
Cluster Version Manifest Management

Tracks the golden package set for all cluster nodes and detects drift.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from pathlib import Path
import errno
import json
import logging
import os
import subprocess

from app.services.cluster.registry import get_cluster_registry
from app.services.cluster.integration_helpers import HybridNodeClient
from app.utils.singleton import Singleton

logger = logging.getLogger(__name__)
_READ_ONLY_STATVFS_FLAG = getattr(os, "ST_RDONLY", 1)


@dataclass
class ManifestDiff:
    """Differences between a node's packages and the manifest."""

    added: List[str]
    removed: List[str]
    mismatched: Dict[str, Dict[str, str]]  # name -> {"expected": v, "actual": v}

    def to_dict(self) -> Dict:
        return {
            "added": self.added,
            "removed": self.removed,
            "mismatched": self.mismatched,
        }


@dataclass(frozen=True)
class ManifestStorageStatus:
    """Writable-state availability for version manifest operations."""

    available: bool
    reason: Optional[str]
    detail: Optional[str]
    target_path: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "available": self.available,
            "reason": self.reason,
            "detail": self.detail,
            "target_path": self.target_path,
        }


class ManifestStorageUnavailableError(RuntimeError):
    """Raised when manifest-backed write workflows cannot access state storage."""

    def __init__(self, status: ManifestStorageStatus):
        self.status = status
        super().__init__(status.detail or "Version manifest storage is unavailable")


def _nearest_existing_path(path: Path) -> Path:
    current = path
    while not current.exists():
        parent = current.parent
        if parent == current:
            break
        current = parent
    return current


def _path_on_read_only_filesystem(path: Path) -> bool:
    try:
        stats = os.statvfs(path)
    except (AttributeError, OSError):
        return False
    return bool(getattr(stats, "f_flag", 0) & _READ_ONLY_STATVFS_FLAG)


def _build_storage_status(target_path: Path) -> ManifestStorageStatus:
    probe_path = _nearest_existing_path(target_path)
    if _path_on_read_only_filesystem(probe_path):
        return ManifestStorageStatus(
            available=False,
            reason="read_only_filesystem",
            detail=f"Version manifest storage is unavailable at {target_path} because {probe_path} is mounted read-only.",
            target_path=str(target_path),
        )
    if os.access(probe_path, os.W_OK):
        return ManifestStorageStatus(
            available=True,
            reason=None,
            detail=None,
            target_path=str(target_path),
        )
    return ManifestStorageStatus(
        available=False,
        reason="permission_denied",
        detail=f"Version manifest storage is unavailable at {target_path} because {probe_path} is not writable.",
        target_path=str(target_path),
    )


class VersionManifest(Singleton):
    """Golden package manifest manager."""

    def __init__(self, manifest_path: str = "/var/lib/map2/version_manifest.json"):
        self.manifest_path = Path(manifest_path)
        self.history_dir = self.manifest_path.parent / "version_manifest_history"
        self.registry = get_cluster_registry()

    def get_storage_status(self) -> ManifestStorageStatus:
        return _build_storage_status(self.history_dir)

    def require_storage(self) -> ManifestStorageStatus:
        status = self.get_storage_status()
        if not status.available:
            raise ManifestStorageUnavailableError(status)
        return status

    def _ensure_storage_ready(self) -> None:
        self.require_storage()
        try:
            self.manifest_path.parent.mkdir(parents=True, exist_ok=True)
            self.history_dir.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            reason = "read_only_filesystem" if exc.errno == errno.EROFS else "storage_unavailable"
            raise ManifestStorageUnavailableError(
                ManifestStorageStatus(
                    available=False,
                    reason=reason,
                    detail=f"Version manifest storage is unavailable at {self.history_dir}: {exc}",
                    target_path=str(self.history_dir),
                )
            ) from exc

    def _save_manifest(self, manifest: Dict) -> None:
        self._ensure_storage_ready()
        with open(self.manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)

        timestamp = manifest.get("timestamp", datetime.now(timezone.utc).isoformat())
        history_file = self.history_dir / f"manifest_{timestamp.replace(':', '')}.json"
        with open(history_file, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)

    def get_manifest(self) -> Optional[Dict]:
        if not self.manifest_path.exists():
            return None
        with open(self.manifest_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def list_manifest_history(self) -> List[str]:
        if not self.history_dir.exists():
            return []
        return [p.name for p in sorted(self.history_dir.glob("manifest_*.json"))]

    def _get_node_packages(self, node_id: str) -> Dict[str, str]:
        """Get package versions for a node via SSH/API or local rpm."""
        node = self.registry.get_node(node_id) if self.registry else None
        node_ip = None
        if node:
            node_ip = node.get("ip_address") or node.get("ip") or node.get("host") or node.get("hostname")

        # Local fallback
        if not node_ip or node_ip in ("127.0.0.1", "localhost"):
            result = subprocess.run(
                ["rpm", "-qa", "--queryformat", "%{NAME}|%{VERSION}-%{RELEASE}\n"],
                capture_output=True,
                text=True,
                timeout=60,
            )
            packages = {}
            if result.returncode == 0:
                for line in result.stdout.strip().split("\n"):
                    if "|" in line:
                        name, version = line.split("|", 1)
                        packages[name] = version
            return packages

        client = HybridNodeClient(node_id, node_ip, f"http://{node_ip}:8080")
        rc, stdout, _ = client.execute_command(
            "rpm -qa --queryformat '%{NAME}|%{VERSION}-%{RELEASE}\\n'",
            timeout=60,
        )
        if rc != 0:
            raise RuntimeError(f"Failed to query packages for {node_id}")

        packages = {}
        for line in stdout.strip().split("\n"):
            if "|" in line:
                name, version = line.split("|", 1)
                packages[name] = version
        return packages

    def capture_manifest(self, source_node_id: str) -> Dict:
        """Capture a golden manifest from a source node."""
        packages = self._get_node_packages(source_node_id)
        manifest = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source_node": source_node_id,
            "package_count": len(packages),
            "packages": packages,
        }
        self._save_manifest(manifest)
        return manifest

    def compare_node(self, node_id: str) -> ManifestDiff:
        """Compare a node to the golden manifest."""
        manifest = self.get_manifest()
        if not manifest:
            raise RuntimeError("No manifest found")

        expected = manifest.get("packages", {})
        actual = self._get_node_packages(node_id)

        expected_names = set(expected.keys())
        actual_names = set(actual.keys())

        added = sorted(list(actual_names - expected_names))
        removed = sorted(list(expected_names - actual_names))

        mismatched = {}
        for name in expected_names & actual_names:
            if expected[name] != actual[name]:
                mismatched[name] = {
                    "expected": expected[name],
                    "actual": actual[name],
                }

        return ManifestDiff(added=added, removed=removed, mismatched=mismatched)

    def compare_all_nodes(self) -> Dict[str, Dict]:
        """Compare all nodes to the manifest."""
        results = {}
        nodes = self.registry.get_all_nodes() if self.registry else []
        for node in nodes:
            node_id = node.get("id") or node.get("node_id")
            if not node_id:
                continue
            try:
                results[node_id] = self.compare_node(node_id).to_dict()
            except Exception as e:
                results[node_id] = {"error": str(e)}
        return results

    def enforce_manifest(self, node_id: str, dry_run: bool = True) -> Dict:
        """Bring a node into alignment with the manifest."""
        diff = self.compare_node(node_id)
        if not diff.mismatched:
            return {
                "status": "ok",
                "message": "No mismatches to fix",
                "dry_run": dry_run,
                "changes": [],
            }

        node = self.registry.get_node(node_id) if self.registry else None
        node_ip = None
        if node:
            node_ip = node.get("ip_address") or node.get("ip") or node.get("host") or node.get("hostname")

        packages = [f"{name}-{info['expected']}" for name, info in diff.mismatched.items()]
        cmd = "dnf install -y " + " ".join(packages)

        if dry_run:
            return {
                "status": "ok",
                "dry_run": True,
                "command": cmd,
                "changes": packages,
            }

        # Local
        if not node_ip or node_ip in ("127.0.0.1", "localhost"):
            result = subprocess.run(cmd.split(), capture_output=True, text=True, timeout=600)
            return {
                "status": "ok" if result.returncode == 0 else "failed",
                "dry_run": False,
                "stdout": result.stdout[-2000:] if result.stdout else "",
                "stderr": result.stderr[-2000:] if result.stderr else "",
                "changes": packages,
            }

        client = HybridNodeClient(node_id, node_ip, f"http://{node_ip}:8080")
        rc, stdout, stderr = client.execute_command(cmd, timeout=600, check_returncode=False)
        return {
            "status": "ok" if rc == 0 else "failed",
            "dry_run": False,
            "stdout": stdout[-2000:] if stdout else "",
            "stderr": stderr[-2000:] if stderr else "",
            "changes": packages,
        }

def get_version_manifest() -> VersionManifest:
    """Get the process-wide version manifest singleton."""
    return VersionManifest.get_instance()


def set_version_manifest(manager: Optional[VersionManifest]) -> None:
    """Override the singleton for tests or explicit runtime wiring."""
    with VersionManifest._lock:
        if manager is None:
            VersionManifest._instances.pop(VersionManifest, None)
        else:
            VersionManifest._instances[VersionManifest] = manager

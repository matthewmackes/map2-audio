"""
Clone reset + rejoin service for cluster onboarding.

Provides an operator-safe workflow for cloned MAP2 instances:
- Reset persisted node identity artifacts back to default
- Optionally clear local registry membership references
- Recreate node identity
- Optionally rejoin/register with cluster services
"""

from __future__ import annotations

import json
import logging
import socket
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger(__name__)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class IdentitySnapshot:
    basic_node_id: Optional[str]
    enhanced_node_id: Optional[str]
    role: Optional[str]
    hostname: str
    local_addresses: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


_NODE_IDENTITY_PATH = Path("/etc/map2/node-identity.json")
_ENHANCED_NODE_CONFIG_PATH = Path("/etc/map2/node.conf")
_ENHANCED_NODE_CONFIG_BACKUP_PATH = Path("/etc/map2/node.conf.bak")
_TRUSTED_NODES_PATH = Path("/etc/map2/trust/trusted-nodes.json")
_ZTP_MARKER_PATH = Path("/var/lib/map2/.ztp-complete")


def _read_json_dict(path: Path) -> Dict[str, Any]:
    try:
        if not path.exists():
            return {}
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
        return payload if isinstance(payload, dict) else {}
    except Exception as exc:
        logger.debug("Failed to read JSON from %s: %s", path, exc)
        return {}


def _resolve_local_addresses() -> List[str]:
    addresses: Set[str] = {"127.0.0.1"}
    hostnames = {socket.gethostname(), socket.getfqdn(), "localhost"}

    for name in hostnames:
        if not name:
            continue
        try:
            resolved = socket.getaddrinfo(name, None)
            for _, _, _, _, sockaddr in resolved:
                if sockaddr:
                    addresses.add(str(sockaddr[0]))
        except Exception:
            continue

    return sorted(addresses)


def _collect_identity_snapshot() -> IdentitySnapshot:
    basic_data = _read_json_dict(_NODE_IDENTITY_PATH)
    enhanced_data = _read_json_dict(_ENHANCED_NODE_CONFIG_PATH)
    hostname = socket.gethostname()

    basic_node_id = str(basic_data.get("node_id") or "").strip() or None
    enhanced_node_id = str(enhanced_data.get("node_id") or "").strip() or None
    role = str(enhanced_data.get("role") or "").strip() or None

    return IdentitySnapshot(
        basic_node_id=basic_node_id,
        enhanced_node_id=enhanced_node_id,
        role=role,
        hostname=hostname,
        local_addresses=_resolve_local_addresses(),
    )


def _target_paths_for_reset(snapshot: IdentitySnapshot) -> List[Path]:
    targets = [
        _ENHANCED_NODE_CONFIG_PATH,
        _ENHANCED_NODE_CONFIG_BACKUP_PATH,
        _NODE_IDENTITY_PATH,
        _TRUSTED_NODES_PATH,
        _ZTP_MARKER_PATH,
    ]

    if snapshot.basic_node_id:
        ssh_base = Path.home() / ".ssh" / f"map2_{snapshot.basic_node_id}"
        targets.extend([ssh_base, Path(f"{ssh_base}.pub")])

    return targets


def _unlink_target(path: Path) -> Optional[str]:
    try:
        if path.is_dir():
            # Preserve parent directory structure; only remove file targets here.
            return f"target is a directory: {path}"
        if path.exists():
            path.unlink()
        return None
    except Exception as exc:
        return str(exc)


def _clear_local_registry_membership(snapshot: IdentitySnapshot) -> Dict[str, Any]:
    removed_node_ids: List[str] = []
    failed_node_ids: List[Dict[str, str]] = []

    try:
        from app.services.cluster.registry import get_cluster_registry

        registry = get_cluster_registry()
        candidate_ids = {
            item
            for item in [snapshot.basic_node_id, snapshot.enhanced_node_id]
            if item
        }

        for node_id in sorted(candidate_ids):
            try:
                if registry.remove_node(node_id):
                    removed_node_ids.append(node_id)
            except Exception as exc:
                failed_node_ids.append({"node_id": node_id, "error": str(exc)})

        for node in registry.get_all_nodes():
            node_id = str(node.get("id") or "").strip()
            if not node_id or node_id in removed_node_ids:
                continue
            node_hostname = str(node.get("hostname") or "").strip()
            node_ip = str(node.get("ip_address") or node.get("ip") or "").strip()
            is_local_match = (
                node_hostname == snapshot.hostname
                or node_ip in snapshot.local_addresses
            )
            if not is_local_match:
                continue

            try:
                if registry.remove_node(node_id):
                    removed_node_ids.append(node_id)
            except Exception as exc:
                failed_node_ids.append({"node_id": node_id, "error": str(exc)})

    except Exception as exc:
        failed_node_ids.append({"node_id": "registry", "error": str(exc)})

    return {
        "removed_node_ids": removed_node_ids,
        "failed": failed_node_ids,
    }


def _clear_mdns_cache(snapshot: IdentitySnapshot) -> None:
    try:
        from app.services.cluster.mdns_discovery_enhanced import get_enhanced_mdns_discovery

        mdns = get_enhanced_mdns_discovery()
        remove_ids = {
            item
            for item in [snapshot.basic_node_id, snapshot.enhanced_node_id]
            if item
        }

        for node_id in list(mdns.discovered_nodes.keys()):
            node = mdns.discovered_nodes.get(node_id)
            if not node:
                continue
            if node_id in remove_ids:
                mdns.discovered_nodes.pop(node_id, None)
                continue
            if node.hostname == snapshot.hostname:
                mdns.discovered_nodes.pop(node_id, None)
    except Exception as exc:
        logger.debug("Skipping mDNS cache cleanup: %s", exc)


def _reset_identity_singletons() -> None:
    try:
        from app.services.cluster import enhanced_node_identity as enhanced_identity_module

        enhanced_identity_module._enhanced_node_identity = None
    except Exception as exc:
        logger.debug("Failed to reset enhanced identity singleton: %s", exc)

    try:
        from app.services.cluster import ztp as ztp_module

        ztp_module._ztp_instance = None
    except Exception as exc:
        logger.debug("Failed to reset ZTP singleton: %s", exc)


def preview_clone_reset() -> Dict[str, Any]:
    snapshot = _collect_identity_snapshot()
    targets = _target_paths_for_reset(snapshot)
    existing = [str(path) for path in targets if path.exists()]
    missing = [str(path) for path in targets if not path.exists()]

    return {
        "timestamp": _utc_now_iso(),
        "identity": snapshot.to_dict(),
        "targets": {
            "existing": existing,
            "missing": missing,
        },
        "notes": [
            "Reset removes local node identity and cluster trust artifacts only.",
            "Audio presets and signal-chain content are preserved.",
        ],
    }


async def reset_clone_to_default_and_rejoin(
    *,
    management_node_ip: Optional[str] = None,
    rejoin: bool = True,
    clear_registry_state: bool = True,
) -> Dict[str, Any]:
    pre_reset = _collect_identity_snapshot()
    targets = _target_paths_for_reset(pre_reset)

    removed_paths: List[str] = []
    missing_paths: List[str] = []
    failed_paths: List[Dict[str, str]] = []

    for target in targets:
        if not target.exists():
            missing_paths.append(str(target))
            continue
        error = _unlink_target(target)
        if error is None:
            removed_paths.append(str(target))
        else:
            failed_paths.append({"path": str(target), "error": error})

    registry_result = {"removed_node_ids": [], "failed": []}
    if clear_registry_state:
        registry_result = _clear_local_registry_membership(pre_reset)

    _clear_mdns_cache(pre_reset)
    _reset_identity_singletons()

    rejoin_result: Dict[str, Any] = {
        "requested": rejoin,
        "success": False,
        "management_node_ip": management_node_ip,
    }

    try:
        from app.services.cluster.enhanced_node_identity import get_enhanced_node_identity
        from app.services.node_identity import NodeIdentity

        enhanced_identity = get_enhanced_node_identity()
        role = enhanced_identity.get_role()
        basic_identity = NodeIdentity(mode=role)

        # Keep post-reset identity available even if rejoin fails.
        post_reset = IdentitySnapshot(
            basic_node_id=basic_identity.node_id,
            enhanced_node_id=enhanced_identity.get_node_id(),
            role=role,
            hostname=socket.gethostname(),
            local_addresses=_resolve_local_addresses(),
        )
    except Exception as exc:
        post_reset = _collect_identity_snapshot()
        rejoin_result["error"] = f"Failed to rebuild identity after reset: {exc}"
        return {
            "success": False,
            "timestamp": _utc_now_iso(),
            "pre_reset": pre_reset.to_dict(),
            "post_reset": post_reset.to_dict(),
            "files": {
                "removed": removed_paths,
                "missing": missing_paths,
                "failed": failed_paths,
            },
            "registry": registry_result,
            "rejoin": rejoin_result,
        }

    if rejoin:
        try:
            from app.services.cluster.ztp import get_ztp_bootstrap

            ztp = get_ztp_bootstrap()
            ztp.node_identity = enhanced_identity
            rejoin_result["success"] = await ztp.register_with_cluster(
                management_node_ip=management_node_ip
            )
            if not rejoin_result["success"]:
                rejoin_result["error"] = "Cluster registration returned failure"
        except Exception as exc:
            rejoin_result["success"] = False
            rejoin_result["error"] = str(exc)
    else:
        rejoin_result["success"] = True
        rejoin_result["message"] = "Rejoin skipped by request"

    success = (not failed_paths) and bool(rejoin_result.get("success", False))
    warnings: List[str] = []
    if failed_paths:
        warnings.append("Some reset targets could not be removed.")
    if registry_result.get("failed"):
        warnings.append("Some local registry entries could not be removed.")
    if not rejoin_result.get("success"):
        warnings.append("Node reset completed, but rejoin did not complete successfully.")

    return {
        "success": success,
        "timestamp": _utc_now_iso(),
        "pre_reset": pre_reset.to_dict(),
        "post_reset": post_reset.to_dict(),
        "files": {
            "removed": removed_paths,
            "missing": missing_paths,
            "failed": failed_paths,
        },
        "registry": registry_result,
        "rejoin": rejoin_result,
        "warnings": warnings,
    }

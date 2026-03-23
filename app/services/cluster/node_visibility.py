"""
Unified remote-node visibility snapshot for operator-facing cluster surfaces.
"""

from __future__ import annotations

import json
import os
import socket
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any, Dict, Optional
from urllib.parse import urlparse

VISIBILITY_CONTRACT_VERSION = "2026-03-23"
VISIBILITY_CONTRACT = (
    "mDNS-only peers remain operator-visible as discovered nodes, but they still "
    "require explicit cluster registration before AVB routing and heartbeat-managed "
    "cluster views treat them as managed nodes."
)


def _parse_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        try:
            if raw.endswith("Z"):
                raw = raw[:-1] + "+00:00"
            return datetime.fromisoformat(raw)
        except ValueError:
            return None
    return None


def _normalize_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _coerce_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _coerce_float(value: Any) -> Optional[float]:
    try:
        if value in (None, ""):
            return None
        return float(value)
    except Exception:
        return None


def _parse_metadata(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
        except Exception:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _serialize_capabilities(value: Any) -> Optional[Dict[str, Any]]:
    if value is None:
        return None
    if isinstance(value, dict):
        return dict(value)
    if hasattr(value, "to_dict"):
        try:
            serialized = value.to_dict()
        except Exception:
            serialized = None
        if isinstance(serialized, dict):
            return serialized
    try:
        serialized = asdict(value)
    except Exception:
        serialized = None
    if isinstance(serialized, dict):
        return serialized
    return None


def _resolve_registry_api_host_port(node: Dict[str, Any], metadata: Dict[str, Any]) -> tuple[Optional[str], int]:
    explicit_url = _normalize_text(metadata.get("node_url") or metadata.get("url"))
    if explicit_url:
        parsed = urlparse(explicit_url)
        if parsed.hostname:
            return parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 8080)

    host = (
        _normalize_text(node.get("ip_address"))
        or _normalize_text(metadata.get("ip_address"))
        or _normalize_text(node.get("hostname"))
    )
    port = _coerce_int(metadata.get("api_port"), 8080)
    return host, port


def _resolve_local_identity() -> tuple[str, str]:
    try:
        from app.services.lcd_manager import get_lcd_manager

        manager = get_lcd_manager()
        local_node_id = _normalize_text(getattr(manager, "node_id", None))
        if local_node_id:
            return local_node_id, socket.gethostname() or local_node_id
    except Exception:
        pass

    for env_name in ("NODE_ID", "MAP2_NODE_ID"):
        env_value = _normalize_text(os.environ.get(env_name))
        if env_value:
            return env_value, socket.gethostname() or env_value

    hostname = socket.gethostname() or "localhost"
    return hostname, hostname


def _is_management_role(node_mode: str) -> bool:
    normalized = (node_mode or "").strip().upper()
    return "MANAGEMENT" in normalized or "CONTROL" in normalized or "ALL-IN-ONE" in normalized


def _build_visibility_reason(node: "VisibleRemoteNode") -> str:
    if node.visibility_state == "managed-online":
        return "Registered node is reachable through heartbeat-managed cluster health."
    if node.visibility_state == "managed-discovered":
        return "Registered node is visible through mDNS discovery but has not reported heartbeat health."
    if node.visibility_state == "discovered-unmanaged":
        return "Peer is visible through mDNS discovery only and still requires cluster registration."
    return "Registered node is not currently visible through heartbeat or live mDNS discovery."


@dataclass
class VisibleRemoteNode:
    node_id: str
    hostname: str
    host: Optional[str] = None
    port: int = 8000
    node_mode: str = "UNKNOWN"
    last_seen: Optional[datetime] = None
    discovered_at: Optional[datetime] = None
    health_score: Optional[float] = None
    capabilities: Optional[Dict[str, Any]] = None
    addresses: list[str] = field(default_factory=list)
    sources: set[str] = field(default_factory=set)
    metadata: Dict[str, Any] = field(default_factory=dict)
    registered: bool = False
    registry_status: Optional[str] = None
    heartbeat_online: Optional[bool] = None
    is_online: bool = False
    api_url: Optional[str] = None
    ws_url: Optional[str] = None
    basic_mdns_online: bool = False
    enhanced_mdns_online: bool = False
    visible: bool = False
    discovered_via_mdns: bool = False
    discovered_via_peer_mdns: bool = False
    discovered_via_cluster_mdns: bool = False
    registration_required: bool = False
    visibility_state: str = "managed-offline"
    visibility_reason: str = ""
    routing_ready: bool = False
    avb_enabled: bool = True
    trust_state: Optional[str] = None
    adoption_state: Optional[str] = None
    activation_state: Optional[str] = None
    readiness_status: Optional[str] = None
    adoption_candidate_id: Optional[str] = None

    def apply_host(self, host: Optional[str], port: Optional[int] = None) -> None:
        normalized_host = _normalize_text(host)
        if normalized_host and not self.host:
            self.host = normalized_host
        if port is not None and port > 0 and (self.port <= 0 or (self.port == 8000 and port != 8000)):
            self.port = port
        if normalized_host and normalized_host not in self.addresses:
            self.addresses.append(normalized_host)

    def recompute_state(self) -> None:
        if not self.trust_state:
            self.trust_state = "trusted" if self.registered else "unknown"
        if not self.adoption_state:
            self.adoption_state = "ready" if self.registered else "candidate"
        if not self.activation_state:
            self.activation_state = "active" if self.registered and self.visible else "standby"
        base_routing_ready = bool(self.registered and self.visible and self.api_url and self.avb_enabled)
        self.routing_ready = bool(base_routing_ready and self.activation_state == "active")

    def finalize(self) -> None:
        if self.host and not self.api_url:
            self.api_url = f"http://{self.host}:{self.port or 8000}"
        if self.host and not self.ws_url:
            self.ws_url = f"ws://{self.host}:{self.port or 8000}/api/lcd/ws/events"

        self.discovered_via_peer_mdns = self.basic_mdns_online
        self.discovered_via_cluster_mdns = self.enhanced_mdns_online
        self.discovered_via_mdns = self.discovered_via_peer_mdns or self.discovered_via_cluster_mdns
        self.registration_required = not self.registered
        self.avb_enabled = self.metadata.get("avb_enabled") is not False

        if self.registered:
            if self.heartbeat_online:
                self.visibility_state = "managed-online"
                self.is_online = True
            elif self.discovered_via_mdns:
                self.visibility_state = "managed-discovered"
                self.is_online = True
            else:
                self.visibility_state = "managed-offline"
                self.is_online = False
        else:
            self.visibility_state = "discovered-unmanaged"
            self.is_online = self.discovered_via_mdns or bool(self.heartbeat_online)

        self.visible = self.visibility_state != "managed-offline"
        self.visibility_reason = _build_visibility_reason(self)
        self.recompute_state()

    def to_discovered_dict(self) -> Dict[str, Any]:
        payload = {
            "node_id": self.node_id,
            "hostname": self.hostname,
            "host": self.host,
            "addresses": list(dict.fromkeys(self.addresses)),
            "port": self.port,
            "role": self.node_mode,
            "node_mode": self.node_mode,
            "health_score": self.health_score,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "discovered_at": self.discovered_at.isoformat() if self.discovered_at else None,
            "capabilities": self.capabilities,
            "sources": sorted(self.sources),
            "metadata": dict(self.metadata),
            "registered": self.registered,
            "registry_status": self.registry_status,
            "heartbeat_online": self.heartbeat_online,
            "is_online": self.is_online,
            "visible": self.visible,
            "api_url": self.api_url,
            "ws_url": self.ws_url,
            "avb_enabled": self.avb_enabled,
            "discovered_via_mdns": self.discovered_via_mdns,
            "discovered_via_peer_mdns": self.discovered_via_peer_mdns,
            "discovered_via_cluster_mdns": self.discovered_via_cluster_mdns,
            "visibility_state": self.visibility_state,
            "registration_required": self.registration_required,
            "routing_ready": self.routing_ready,
            "visibility_reason": self.visibility_reason,
            "trust_state": self.trust_state,
            "adoption_state": self.adoption_state,
            "activation_state": self.activation_state,
            "readiness_status": self.readiness_status,
            "adoption_candidate_id": self.adoption_candidate_id,
        }
        return payload


def _ensure_node(
    nodes: Dict[str, VisibleRemoteNode],
    *,
    node_id: str,
    hostname: Optional[str],
) -> VisibleRemoteNode:
    existing = nodes.get(node_id)
    if existing is not None:
        if hostname and existing.hostname == node_id:
            existing.hostname = hostname
        return existing

    node = VisibleRemoteNode(
        node_id=node_id,
        hostname=hostname or node_id,
    )
    nodes[node_id] = node
    return node


def _is_local_candidate(
    *,
    node_id: str,
    hostname: Optional[str],
    host: Optional[str],
    local_node_id: str,
    local_hostname: str,
) -> bool:
    normalized_node_id = node_id.strip().lower()
    normalized_hostname = _normalize_text(hostname)
    normalized_host = _normalize_text(host)
    local_node_id_l = local_node_id.strip().lower()
    local_hostname_l = local_hostname.strip().lower()

    if normalized_node_id and normalized_node_id == local_node_id_l:
        return True
    if normalized_hostname and normalized_hostname.lower() == local_hostname_l:
        return True
    if normalized_host and normalized_host.lower() in {"127.0.0.1", "localhost", local_hostname_l}:
        return True
    return False


def get_visible_remote_nodes() -> tuple[str, Dict[str, VisibleRemoteNode]]:
    local_node_id, local_hostname = _resolve_local_identity()
    nodes: Dict[str, VisibleRemoteNode] = {}

    try:
        from app.services.cluster.registry import get_cluster_registry

        for raw_node in get_cluster_registry().get_all_nodes():
            if not isinstance(raw_node, dict):
                continue
            node_id = _normalize_text(raw_node.get("id") or raw_node.get("node_id") or raw_node.get("hostname"))
            if not node_id:
                continue

            metadata = _parse_metadata(raw_node.get("metadata"))
            hostname = _normalize_text(raw_node.get("hostname")) or node_id
            host, port = _resolve_registry_api_host_port(raw_node, metadata)

            if _is_local_candidate(
                node_id=node_id,
                hostname=hostname,
                host=host,
                local_node_id=local_node_id,
                local_hostname=local_hostname,
            ):
                continue

            node = _ensure_node(nodes, node_id=node_id, hostname=hostname)
            node.apply_host(host, port)
            node.node_mode = (
                _normalize_text(raw_node.get("role"))
                or _normalize_text(raw_node.get("deployment_mode"))
                or node.node_mode
            )
            node.health_score = _coerce_float(raw_node.get("health_score")) or node.health_score
            node.last_seen = _parse_datetime(raw_node.get("last_seen")) or node.last_seen
            node.registered = True
            node.registry_status = _normalize_text(raw_node.get("status")) or node.registry_status
            node.metadata.update(metadata)
            node.sources.add("registry")

            capabilities = {
                "cpu_cores": raw_node.get("cpu_cores"),
                "memory_gb": raw_node.get("total_memory_gb"),
                "audio_interfaces": list(raw_node.get("audio_devices") or []),
                "midi_inputs": raw_node.get("midi_input_count"),
                "midi_outputs": raw_node.get("midi_output_count"),
            }
            if any(value not in (None, [], "") for value in capabilities.values()):
                node.capabilities = {
                    key: value
                    for key, value in capabilities.items()
                    if value not in (None, [], "")
                }
    except Exception:
        pass

    try:
        from app.services.cluster.heartbeat_monitor import get_heartbeat_monitor

        for node_id, status in get_heartbeat_monitor().get_all_health().items():
            if _is_local_candidate(
                node_id=node_id,
                hostname=None,
                host=None,
                local_node_id=local_node_id,
                local_hostname=local_hostname,
            ):
                continue

            node = _ensure_node(nodes, node_id=node_id, hostname=node_id)
            node.heartbeat_online = bool(getattr(status, "is_online", False))
            node.last_seen = getattr(status, "last_seen", None) or node.last_seen
            node.sources.add("heartbeat")

            metadata = getattr(status, "metadata", None)
            if isinstance(metadata, dict):
                node.metadata.update(metadata)
    except Exception:
        pass

    try:
        from app.services.lcd_manager import get_lcd_manager

        manager = get_lcd_manager()
        mdns = getattr(manager, "mdns_discovery", None) if manager else None
        discovered = (
            mdns.get_discovered_peers()
            if mdns and hasattr(mdns, "get_discovered_peers")
            else getattr(mdns, "discovered_peers", {})
            if mdns
            else {}
        )
        for node_id, peer_data in (discovered or {}).items():
            if not isinstance(peer_data, dict):
                continue
            host = _normalize_text(peer_data.get("host") or peer_data.get("hostname"))
            hostname = _normalize_text(peer_data.get("hostname") or host or node_id) or node_id
            port = _coerce_int(peer_data.get("port"), 8000)

            if _is_local_candidate(
                node_id=node_id,
                hostname=hostname,
                host=host,
                local_node_id=local_node_id,
                local_hostname=local_hostname,
            ):
                continue

            node = _ensure_node(nodes, node_id=node_id, hostname=hostname)
            node.apply_host(host, port)
            node.node_mode = _normalize_text(peer_data.get("mode") or peer_data.get("node_mode")) or node.node_mode
            node.discovered_at = _parse_datetime(peer_data.get("discovered_at")) or node.discovered_at
            node.last_seen = _parse_datetime(peer_data.get("last_seen")) or node.last_seen
            if host:
                node.host = host
                if host not in node.addresses:
                    node.addresses.append(host)
            if port > 0:
                node.port = port
            node.api_url = (
                _normalize_text(peer_data.get("api_url"))
                or (f"http://{host}:{port}" if host else None)
                or node.api_url
            )
            node.ws_url = (
                _normalize_text(peer_data.get("url") or peer_data.get("ws_url"))
                or (f"ws://{host}:{port}/api/lcd/ws/events" if host else None)
                or node.ws_url
            )
            node.sources.add("mdns")
            node.basic_mdns_online = True
    except Exception:
        pass

    try:
        from app.services.cluster.mdns_discovery_enhanced import get_enhanced_mdns_discovery

        for discovered_node in get_enhanced_mdns_discovery().get_discovered_nodes(online_only=False):
            node_id = _normalize_text(getattr(discovered_node, "node_id", None))
            if not node_id:
                continue
            addresses = list(getattr(discovered_node, "addresses", None) or [])
            host = addresses[0] if addresses else _normalize_text(getattr(discovered_node, "hostname", None))
            hostname = _normalize_text(getattr(discovered_node, "hostname", None)) or host or node_id
            port = _coerce_int(getattr(discovered_node, "port", None), 8000)

            if _is_local_candidate(
                node_id=node_id,
                hostname=hostname,
                host=host,
                local_node_id=local_node_id,
                local_hostname=local_hostname,
            ):
                continue

            node = _ensure_node(nodes, node_id=node_id, hostname=hostname)
            node.apply_host(host, port)
            for address in addresses:
                normalized_address = _normalize_text(address)
                if normalized_address and normalized_address not in node.addresses:
                    node.addresses.append(normalized_address)
            if host and not node.basic_mdns_online:
                node.host = host
            if port > 0 and not node.basic_mdns_online:
                node.port = port
            if host and not node.basic_mdns_online:
                node.api_url = f"http://{host}:{node.port}"
                node.ws_url = f"ws://{host}:{node.port}/api/lcd/ws/events"
            node.node_mode = _normalize_text(getattr(discovered_node, "role", None)) or node.node_mode
            node.health_score = _coerce_float(getattr(discovered_node, "health_score", None)) or node.health_score
            node.last_seen = getattr(discovered_node, "last_seen", None) or node.last_seen
            capabilities = getattr(discovered_node, "capabilities", None)
            if capabilities is not None:
                node.capabilities = _serialize_capabilities(capabilities) or node.capabilities
            node.sources.add("enhanced_mdns")
            if hasattr(discovered_node, "is_online"):
                node.enhanced_mdns_online = bool(discovered_node.is_online())
    except Exception:
        pass

    finalized_nodes: Dict[str, VisibleRemoteNode] = {}
    for node_id, node in nodes.items():
        if not node.host:
            node.host = node.hostname
        if not node.addresses and node.host:
            node.addresses.append(node.host)
        node.finalize()
        finalized_nodes[node_id] = node

    try:
        from app.services.cluster.adoption import get_adoption_service

        get_adoption_service().apply_visibility_overlay(finalized_nodes)
    except Exception:
        pass

    return local_node_id, finalized_nodes


def get_visible_remote_node(node_id: str) -> Optional[VisibleRemoteNode]:
    _, nodes = get_visible_remote_nodes()
    return nodes.get(node_id)


def get_visible_cluster_summary() -> Dict[str, Any]:
    _, nodes = get_visible_remote_nodes()
    visible_nodes = sorted(nodes.values(), key=lambda item: item.node_id)
    online_nodes = [node for node in visible_nodes if node.is_online]
    visible_node_ids = [node.node_id for node in visible_nodes if node.visible]
    managed_online_nodes = [node for node in visible_nodes if node.visibility_state == "managed-online"]
    managed_discovered_nodes = [node for node in visible_nodes if node.visibility_state == "managed-discovered"]
    managed_offline_nodes = [node for node in visible_nodes if node.visibility_state == "managed-offline"]
    discovered_unmanaged_nodes = [node for node in visible_nodes if node.visibility_state == "discovered-unmanaged"]
    routing_ready_nodes = [node for node in visible_nodes if node.routing_ready]
    peer_mdns_nodes = [node for node in visible_nodes if node.discovered_via_peer_mdns]
    cluster_mdns_nodes = [node for node in visible_nodes if node.discovered_via_cluster_mdns]

    return {
        "contract_version": VISIBILITY_CONTRACT_VERSION,
        "visibility_contract": VISIBILITY_CONTRACT,
        "total_discovered": len(visible_nodes),
        "total_nodes": len(visible_nodes),
        "online_nodes": len(online_nodes),
        "management_nodes": len([node for node in online_nodes if _is_management_role(node.node_mode)]),
        "audio_nodes": len([node for node in online_nodes if not _is_management_role(node.node_mode)]),
        "avg_health": (
            sum(node.health_score for node in online_nodes if node.health_score is not None)
            / len([node for node in online_nodes if node.health_score is not None])
            if any(node.health_score is not None for node in online_nodes)
            else 0.0
        ),
        "counts": {
            "total_nodes": len(visible_nodes),
            "registered_nodes": len([node for node in visible_nodes if node.registered]),
            "visible_nodes": len(visible_node_ids),
            "managed_online_nodes": len(managed_online_nodes),
            "managed_discovered_nodes": len(managed_discovered_nodes),
            "managed_offline_nodes": len(managed_offline_nodes),
            "discovered_unmanaged_nodes": len(discovered_unmanaged_nodes),
            "routing_ready_nodes": len(routing_ready_nodes),
            "peer_mdns_nodes": len(peer_mdns_nodes),
            "cluster_mdns_nodes": len(cluster_mdns_nodes),
        },
        "visible_node_ids": visible_node_ids,
        "managed_online_node_ids": [node.node_id for node in managed_online_nodes],
        "managed_discovered_node_ids": [node.node_id for node in managed_discovered_nodes],
        "managed_offline_node_ids": [node.node_id for node in managed_offline_nodes],
        "discovered_unmanaged_node_ids": [node.node_id for node in discovered_unmanaged_nodes],
        "registration_required_node_ids": [node.node_id for node in discovered_unmanaged_nodes],
        "routing_ready_node_ids": [node.node_id for node in routing_ready_nodes],
        "nodes": [node.to_discovered_dict() for node in visible_nodes],
    }

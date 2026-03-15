"""
Node discovery, identity enrichment, and topology assembly.
"""

from __future__ import annotations

import asyncio
import logging
import os
import socket
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional

import httpx
from fastapi import HTTPException

from app.config import config_get, config_set
from app.deployment.deployment import DeploymentMode, get_deployment_config
from app.models.node import (
    NodeAudioEdge,
    NodeHealth,
    NodeIdentity,
    NodeNetworkEdge,
    NodeRole,
    NodeSummary,
    NodeTopology,
)
from app.services.node_health_service import NodeHealthService, get_node_health_service

logger = logging.getLogger(__name__)


def _parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            pass
    return datetime.utcnow()


@dataclass(frozen=True)
class KnownNodeEndpoint:
    node_id: str
    host: str
    hostname: str
    is_local: bool = False


@dataclass(frozen=True)
class PeerRecord:
    node_id: str
    host: str
    hostname: str
    node_mode: str
    last_seen: datetime
    latency_ms: Optional[float] = None


class NodeDiscoveryService:
    CACHE_TTL_S = 4.0
    REMOTE_TIMEOUT_S = 2.0
    DISPLAY_LABEL_KEY = "node.display_label"

    def __init__(self, health_service: Optional[NodeHealthService] = None):
        self._health_service = health_service or get_node_health_service()
        self._topology_cache: Optional[NodeTopology] = None
        self._topology_cached_at = 0.0
        self._peer_index: dict[str, KnownNodeEndpoint] = {}
        self._peer_index_cached_at = 0.0
        self._cache_lock = asyncio.Lock()

    async def get_local_identity(self) -> NodeIdentity:
        hostname = socket.gethostname() or "localhost"
        node_id = await self._resolve_local_node_id(hostname)
        return NodeIdentity(
            hostname=hostname,
            display_label=self._get_display_label(),
            role=self._detect_local_role(),
            node_id=node_id,
        )

    async def get_topology(self) -> NodeTopology:
        if self._topology_cache is not None and (time.monotonic() - self._topology_cached_at) < self.CACHE_TTL_S:
            return self._topology_cache

        async with self._cache_lock:
            if self._topology_cache is not None and (time.monotonic() - self._topology_cached_at) < self.CACHE_TTL_S:
                return self._topology_cache

            topology = await self._build_topology()
            self._topology_cache = topology
            self._topology_cached_at = time.monotonic()
            return topology

    async def set_display_label(self, label: str) -> NodeIdentity:
        normalized = str(label or "").strip()
        if len(normalized) > 64:
            raise HTTPException(status_code=422, detail="display_label must be 64 characters or fewer")

        value_to_store: Optional[str] = normalized or None
        if not config_set(self.DISPLAY_LABEL_KEY, value_to_store):
            raise HTTPException(status_code=500, detail="Failed to persist node display label")

        self.invalidate_cache()
        return await self.get_local_identity()

    async def resolve_known_node(self, node_id: str) -> Optional[KnownNodeEndpoint]:
        local_identity = await self.get_local_identity()
        normalized = str(node_id or "").strip().lower()
        if not normalized:
            return None

        if normalized in {local_identity.node_id.lower(), local_identity.hostname.lower(), "local"}:
            return KnownNodeEndpoint(
                node_id=local_identity.node_id,
                host="127.0.0.1",
                hostname=local_identity.hostname,
                is_local=True,
            )

        await self._refresh_peer_index()
        return self._peer_index.get(normalized)

    def invalidate_cache(self) -> None:
        self._topology_cache = None
        self._topology_cached_at = 0.0
        self._peer_index_cached_at = 0.0

    async def _build_topology(self) -> NodeTopology:
        local_identity = await self.get_local_identity()
        local_health = await self._health_service.get_local_health()
        local_summary = self._summary_from_identity_health(
            identity=local_identity,
            health=local_health,
            last_seen=datetime.utcnow(),
            is_local=True,
            is_viewed=True,
        )

        await self._refresh_peer_index(local_identity=local_identity)

        if local_identity.role == NodeRole.audio_node:
            return NodeTopology(nodes=[local_summary], audio_edges=[], network_edges=[])

        peers = await self._load_peer_records()
        remote_summaries = [
            summary
            for summary in await asyncio.gather(*(self._build_peer_summary(peer) for peer in peers))
            if summary is not None
        ]
        known_node_ids = {local_summary.node_id, *(node.node_id for node in remote_summaries)}

        return NodeTopology(
            nodes=[local_summary, *remote_summaries],
            audio_edges=self._build_audio_edges(known_node_ids),
            network_edges=self._build_network_edges(local_summary.node_id, peers, known_node_ids),
        )

    async def _build_peer_summary(self, peer: PeerRecord) -> Optional[NodeSummary]:
        local_identity = await self.get_local_identity()
        if peer.node_id == local_identity.node_id:
            return None
        if peer.host in {"127.0.0.1", "localhost"} or peer.hostname.lower() == local_identity.hostname.lower():
            return None

        identity, health = await asyncio.gather(
            self._fetch_remote_identity(peer),
            self._health_service.get_remote_health(peer.host),
        )

        effective_identity = identity.model_copy(
            update={
                "node_id": peer.node_id or identity.node_id,
                "hostname": identity.hostname or peer.hostname,
            }
        )
        return self._summary_from_identity_health(
            identity=effective_identity,
            health=health,
            last_seen=peer.last_seen,
            is_local=False,
            is_viewed=False,
        )

    async def _refresh_peer_index(self, *, local_identity: Optional[NodeIdentity] = None) -> None:
        if (time.monotonic() - self._peer_index_cached_at) < self.CACHE_TTL_S and self._peer_index:
            return

        local_identity = local_identity or await self.get_local_identity()
        peers = await self._load_peer_records()

        index: dict[str, KnownNodeEndpoint] = {
            local_identity.node_id.lower(): KnownNodeEndpoint(
                node_id=local_identity.node_id,
                host="127.0.0.1",
                hostname=local_identity.hostname,
                is_local=True,
            ),
            local_identity.hostname.lower(): KnownNodeEndpoint(
                node_id=local_identity.node_id,
                host="127.0.0.1",
                hostname=local_identity.hostname,
                is_local=True,
            ),
        }
        for peer in peers:
            endpoint = KnownNodeEndpoint(node_id=peer.node_id, host=peer.host, hostname=peer.hostname, is_local=False)
            for key in {peer.node_id.lower(), peer.host.lower(), peer.hostname.lower()}:
                index[key] = endpoint

        self._peer_index = index
        self._peer_index_cached_at = time.monotonic()

    async def _load_peer_records(self) -> list[PeerRecord]:
        payload = await self._load_peer_payload()
        raw_peers = payload.get("peers") or []
        peers: list[PeerRecord] = []
        for raw_peer in raw_peers:
            if not isinstance(raw_peer, dict):
                continue
            node_id = str(raw_peer.get("node_id") or "").strip()
            host = str(raw_peer.get("host") or raw_peer.get("hostname") or "").strip()
            if not node_id or not host:
                continue
            peers.append(
                PeerRecord(
                    node_id=node_id,
                    host=host,
                    hostname=str(raw_peer.get("hostname") or host).strip() or host,
                    node_mode=str(raw_peer.get("node_mode") or "").strip(),
                    last_seen=_parse_datetime(raw_peer.get("last_seen")),
                    latency_ms=self._coerce_float(raw_peer.get("latency_ms")),
                )
            )
        return peers

    async def _load_peer_payload(self) -> dict[str, Any]:
        try:
            from app.routes import peer_discovery

            payload = await peer_discovery.get_peer_discovery_status()
            if hasattr(payload, "model_dump"):
                payload = payload.model_dump()
            elif hasattr(payload, "dict"):
                payload = payload.dict()
            if isinstance(payload, dict):
                return payload
        except Exception as exc:
            logger.debug("Peer discovery route lookup failed: %s", exc)

        try:
            from app.services.cluster.mdns_discovery_enhanced import get_enhanced_mdns_discovery

            discovery = get_enhanced_mdns_discovery()
            local_node_id = str(os.getenv("NODE_ID") or socket.gethostname())
            peers = [
                {
                    "node_id": node.node_id,
                    "node_mode": node.role,
                    "host": (node.addresses[0] if node.addresses else node.hostname),
                    "hostname": node.hostname,
                    "last_seen": node.last_seen.isoformat(),
                    "latency_ms": None,
                }
                for node in discovery.get_discovered_nodes(online_only=True)
            ]
            return {"local_node_id": local_node_id, "peers": peers}
        except Exception as exc:
            logger.debug("Enhanced mDNS peer discovery fallback failed: %s", exc)

        return {
            "local_node_id": str(os.getenv("NODE_ID") or socket.gethostname()),
            "peers": [],
        }

    async def _resolve_local_node_id(self, hostname: str) -> str:
        for env_name in ("NODE_ID", "MAP2_NODE_ID"):
            env_value = str(os.getenv(env_name) or "").strip()
            if env_value:
                return env_value

        try:
            payload = await self._load_peer_payload()
            local_node_id = str(payload.get("local_node_id") or "").strip()
            if local_node_id:
                return local_node_id
        except Exception:
            pass

        return hostname

    async def _fetch_remote_identity(self, peer: PeerRecord) -> NodeIdentity:
        fallback = NodeIdentity(
            hostname=peer.hostname or peer.host,
            display_label=None,
            role=self._map_role(peer.node_mode),
            node_id=peer.node_id,
        )
        try:
            async with httpx.AsyncClient(timeout=self.REMOTE_TIMEOUT_S) as client:
                response = await client.get(f"http://{peer.host}:8080/api/node/identity")
                response.raise_for_status()
            payload = NodeIdentity.model_validate(response.json())
            return payload.model_copy(
                update={
                    "node_id": peer.node_id or payload.node_id,
                    "hostname": payload.hostname or fallback.hostname,
                }
            )
        except Exception as exc:
            logger.debug("Remote identity lookup failed for %s: %s", peer.host, exc)
            return fallback

    def _build_audio_edges(self, known_node_ids: set[str]) -> list[NodeAudioEdge]:
        try:
            from app.services.avb.avb_service import get_avb_service

            raw_streams = get_avb_service().get_all_streams()
        except Exception as exc:
            logger.debug("AVB stream lookup failed: %s", exc)
            return []

        edges: dict[tuple[str, str, str], NodeAudioEdge] = {}
        for stream in raw_streams:
            if not isinstance(stream, dict):
                continue
            ownership = stream.get("ownership") or {}
            source = str(ownership.get("talker_node_id") or ownership.get("owner_node_id") or "").strip()
            dest = str(ownership.get("listener_node_id") or ownership.get("peer_node_id") or "").strip()
            if not source or not dest or source == dest:
                continue
            if source not in known_node_ids or dest not in known_node_ids:
                continue
            key = (source, dest, "avb")
            edges[key] = NodeAudioEdge(
                source_node_id=source,
                dest_node_id=dest,
                stream_type="avb",
                active=str(stream.get("state") or "").lower() == "running",
            )
        return list(edges.values())

    def _build_network_edges(
        self,
        local_node_id: str,
        peers: list[PeerRecord],
        known_node_ids: set[str],
    ) -> list[NodeNetworkEdge]:
        edges: list[NodeNetworkEdge] = []
        for peer in peers:
            if peer.node_id not in known_node_ids:
                continue
            edges.append(
                NodeNetworkEdge(
                    source_node_id=local_node_id,
                    dest_node_id=peer.node_id,
                    latency_ms=peer.latency_ms,
                )
            )
        return edges

    def _summary_from_identity_health(
        self,
        *,
        identity: NodeIdentity,
        health: NodeHealth,
        last_seen: datetime,
        is_local: bool,
        is_viewed: bool,
    ) -> NodeSummary:
        payload = {}
        payload.update(identity.model_dump())
        payload.update(health.model_dump())
        payload["last_seen"] = last_seen
        payload["is_local"] = is_local
        payload["is_viewed"] = is_viewed
        return NodeSummary.model_validate(payload)

    def _get_display_label(self) -> Optional[str]:
        value = config_get(self.DISPLAY_LABEL_KEY, None)
        if isinstance(value, str):
            normalized = value.strip()
            return normalized or None
        return None

    def _detect_local_role(self) -> NodeRole:
        if self._truthy_env("ALL_IN_ONE"):
            return NodeRole.all_in_one

        deployment_mode = str(os.getenv("MAP2_DEPLOYMENT_MODE") or "").strip().upper()
        if deployment_mode == DeploymentMode.ALL_IN_ONE.value:
            return NodeRole.all_in_one
        if deployment_mode in {DeploymentMode.CONTROL_NODE.value, DeploymentMode.FRONTEND_ONLY.value}:
            return NodeRole.management_node

        try:
            mode = get_deployment_config().mode
            if mode == DeploymentMode.ALL_IN_ONE:
                return NodeRole.all_in_one
            if mode in {DeploymentMode.CONTROL_NODE, DeploymentMode.FRONTEND_ONLY}:
                return NodeRole.management_node
        except Exception as exc:
            logger.debug("Deployment config lookup failed: %s", exc)

        return NodeRole.audio_node

    @staticmethod
    def _coerce_float(value: Any) -> Optional[float]:
        try:
            if value is None or value == "":
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _map_role(node_mode: str) -> NodeRole:
        normalized = str(node_mode or "").strip().lower()
        if "all" in normalized:
            return NodeRole.all_in_one
        if "control" in normalized or "management" in normalized or "frontend" in normalized:
            return NodeRole.management_node
        return NodeRole.audio_node

    @staticmethod
    def _truthy_env(name: str) -> bool:
        return str(os.getenv(name) or "").strip().lower() in {"1", "true", "yes", "on"}


_node_discovery_service: Optional[NodeDiscoveryService] = None


def get_node_discovery_service() -> NodeDiscoveryService:
    global _node_discovery_service
    if _node_discovery_service is None:
        _node_discovery_service = NodeDiscoveryService()
    return _node_discovery_service

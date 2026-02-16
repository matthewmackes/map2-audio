"""
AVB Stream Routing Matrix

Manages N-to-M talker-to-listener stream connections across AVB network.
Supports both MAP2-to-MAP2 (mDNS) and third-party AVDECC devices.

Architecture:
- MAP2 nodes: Use internal stream management API
- AVDECC devices: Use IEEE 1722.1 ACMP protocol
- Routing matrix tracks all possible connections
- Auto-discovery populates available talkers/listeners
"""

import asyncio
import logging
import hashlib
import json
import socket
from urllib.parse import urlparse
from typing import Any, Dict, List, Optional, Set, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum

import httpx

from app.config import config_get

logger = logging.getLogger(__name__)

_SRP_RELEASE_REMEDIATION = (
    "Verify SRP daemon health via GET /api/avb/srp/status.",
    "Check admission logs via GET /api/avb/srp/admissions.",
)


def _build_srp_release_warning(
    *,
    reason: str,
    reservation_id: str,
    detail: Any,
) -> Dict[str, Any]:
    return {
        "code": "SRP_RELEASE_FAILED",
        "reason": reason,
        "reservation_id": reservation_id,
        "detail": str(detail),
        "remediation": list(_SRP_RELEASE_REMEDIATION),
    }


def _build_srp_release_payload(
    release_result: Any,
    *,
    reservation_id: Optional[str] = None,
) -> Dict[str, Any]:
    payload = {
        "success": bool(getattr(release_result, "success", False)),
        "reason_code": getattr(release_result, "reason_code", None),
        "reason": getattr(release_result, "reason", None),
    }

    daemon_type = getattr(release_result, "daemon_type", None)
    if daemon_type is not None:
        payload["daemon_type"] = daemon_type

    raw_response = getattr(release_result, "raw_response", None)
    if raw_response is not None:
        payload["raw_response"] = raw_response

    if reservation_id is not None:
        payload["reservation_id"] = reservation_id

    return payload


class StreamDirection(str, Enum):
    """Stream direction enum"""
    TALKER = "talker"
    LISTENER = "listener"


class ConnectionState(str, Enum):
    """Connection state enum"""
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    DISCONNECTING = "disconnecting"
    ERROR = "error"


@dataclass
class AudioEndpoint:
    """Represents an AVB audio endpoint (talker or listener)"""
    entity_id: str  # Hex string (e.g., "001122fffe334455")
    unique_id: int  # Stream unique ID (0-65535)
    direction: StreamDirection
    device_type: str  # "map2", "avdecc", "unknown"
    device_name: str
    channels: int
    sample_rate: int
    format: str = "24-bit PCM"  # Audio format
    mac_address: Optional[str] = None  # For AVDECC devices
    node_address: Optional[str] = None  # For MAP2 nodes (http://...)
    available: bool = True
    last_seen: datetime = field(default_factory=datetime.now)

    def endpoint_id(self) -> str:
        """Unique identifier for this endpoint"""
        return f"{self.entity_id}:{self.unique_id}"


@dataclass
class StreamConnection:
    """Represents a talker-to-listener connection"""
    talker: AudioEndpoint
    listener: AudioEndpoint
    state: ConnectionState = ConnectionState.DISCONNECTED
    established_time: Optional[datetime] = None
    error_message: Optional[str] = None
    connection_count: int = 0  # ACMP connection count
    srp_reservation_id: Optional[str] = None
    srp_admission_id: Optional[str] = None

    def connection_id(self) -> str:
        """Unique identifier for this connection"""
        return f"{self.talker.endpoint_id()}→{self.listener.endpoint_id()}"


class AvbRouter:
    """
    AVB Stream Routing Matrix

    Manages stream connections between talkers and listeners.
    Supports MAP2 nodes and AVDECC third-party devices.
    """

    def __init__(self, engine_service=None, avdecc_entity=None):
        """
        Initialize router.

        Args:
            engine_service: JuceEngineService for MAP2 stream management
            avdecc_entity: AvdeccEntity C++ wrapper for AVDECC protocol
        """
        self.engine_service = engine_service
        self.avdecc_entity = avdecc_entity

        self.endpoints: Dict[str, AudioEndpoint] = {}  # endpoint_id -> AudioEndpoint
        self.connections: Dict[str, StreamConnection] = {}  # connection_id -> StreamConnection

        self._discovery_task: Optional[asyncio.Task] = None
        self._cleanup_task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self):
        """Start router services"""
        if self._running:
            return

        self._running = True

        # Start discovery
        self._discovery_task = asyncio.create_task(self._discovery_loop())

        # Start cleanup (remove stale endpoints)
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())

        logger.info("AVB Router started")

    async def stop(self):
        """Stop router services"""
        if not self._running:
            return

        self._running = False

        if self._discovery_task:
            self._discovery_task.cancel()
            try:
                await self._discovery_task
            except asyncio.CancelledError:
                pass

        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

        logger.info("AVB Router stopped")

    # ========================================================================
    # Discovery
    # ========================================================================

    @staticmethod
    def _normalize_entity_id(raw_entity_id: Any, fallback_seed: str) -> str:
        """Return a 16-char hex entity ID string with deterministic fallback."""
        if raw_entity_id is not None:
            value = str(raw_entity_id).lower().replace("0x", "").strip()
            if len(value) <= 16 and all(ch in "0123456789abcdef" for ch in value):
                return value.zfill(16)

        digest = hashlib.sha1(fallback_seed.encode("utf-8")).hexdigest()
        return digest[:16]

    @staticmethod
    def _coerce_metadata(node: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize node metadata from registry row into a dictionary."""
        metadata = node.get("metadata")
        if isinstance(metadata, dict):
            return metadata
        if isinstance(metadata, str) and metadata:
            try:
                parsed = json.loads(metadata)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                return {}
        return {}

    @staticmethod
    def _coerce_int(value: Any, fallback: int) -> int:
        """Parse int-like values safely."""
        try:
            return int(value)
        except Exception:
            return fallback

    async def _discovery_loop(self):
        """Periodically discover endpoints"""
        while self._running:
            try:
                await self._discover_map2_endpoints()
                await self._discover_avdecc_endpoints()
            except Exception as e:
                logger.error(f"Discovery error: {e}")

            await asyncio.sleep(5)  # Discovery every 5 seconds

    async def _discover_map2_endpoints(self):
        """Discover MAP2 nodes via existing mDNS discovery"""
        if not self.engine_service:
            return

        try:
            from app.services.cluster.registry import get_cluster_registry

            registry = get_cluster_registry()
            nodes = await asyncio.to_thread(registry.get_all_nodes)

            for node in nodes:
                status = str(node.get("status", "")).lower()
                if status in {"offline", "failed"}:
                    continue

                metadata = self._coerce_metadata(node)
                if metadata.get("avb_enabled") is False:
                    continue

                node_id = str(node.get("id") or node.get("hostname") or "map2-node")
                entity_id = self._normalize_entity_id(
                    metadata.get("avb_entity_id"),
                    fallback_seed=node_id,
                )
                device_name = str(node.get("hostname") or node_id)
                mac_address = node.get("mac_address") or metadata.get("mac_address")
                ip_address = node.get("ip_address") or metadata.get("ip_address")
                node_address = f"http://{ip_address}:8080" if ip_address else None

                streams = metadata.get("avb_streams") or []
                if not streams:
                    streams = [
                        {"direction": "talker", "channels": 2, "sample_rate": 48000, "format": "24-bit PCM"},
                        {"direction": "listener", "channels": 2, "sample_rate": 48000, "format": "24-bit PCM"},
                    ]

                for index, stream in enumerate(streams):
                    direction_raw = str(stream.get("direction", "")).lower()
                    if direction_raw == "talker":
                        direction = StreamDirection.TALKER
                    elif direction_raw == "listener":
                        direction = StreamDirection.LISTENER
                    else:
                        continue

                    unique_id = self._coerce_int(stream.get("unique_id", index), index)
                    channels = self._coerce_int(stream.get("channels", 2), 2)
                    sample_rate = self._coerce_int(stream.get("sample_rate", 48000), 48000)
                    audio_format = str(stream.get("format") or "24-bit PCM")

                    endpoint = AudioEndpoint(
                        entity_id=entity_id,
                        unique_id=unique_id,
                        direction=direction,
                        device_type="map2",
                        device_name=device_name,
                        channels=max(1, channels),
                        sample_rate=max(1, sample_rate),
                        format=audio_format,
                        mac_address=mac_address,
                        node_address=node_address,
                        available=True,
                        last_seen=datetime.now(),
                    )
                    self.endpoints[endpoint.endpoint_id()] = endpoint
        except Exception as e:
            logger.error(f"MAP2 discovery error: {e}")

    async def _discover_avdecc_endpoints(self):
        """Discover AVDECC devices via ADP"""
        if not self.avdecc_entity:
            return

        try:
            # Get discovered entities from AVDECC
            entities = await asyncio.to_thread(
                self.avdecc_entity.getDiscoveredEntities
            )

            for entity in entities:
                if not entity.available:
                    continue

                entity_id_str = format(entity.entity_id, '016x')

                # Register talker endpoints
                for i in range(entity.talker_stream_sources):
                    endpoint = AudioEndpoint(
                        entity_id=entity_id_str,
                        unique_id=i,
                        direction=StreamDirection.TALKER,
                        device_type="avdecc",
                        device_name=entity.entity_name or f"AVDECC-{entity_id_str[:8]}",
                        channels=2,  # Default, would query via AECP
                        sample_rate=48000,  # Default
                        mac_address=":".join(f"{b:02x}" for b in entity.mac_address),
                        last_seen=datetime.now()
                    )
                    self.endpoints[endpoint.endpoint_id()] = endpoint

                # Register listener endpoints
                for i in range(entity.listener_stream_sinks):
                    endpoint = AudioEndpoint(
                        entity_id=entity_id_str,
                        unique_id=i,
                        direction=StreamDirection.LISTENER,
                        device_type="avdecc",
                        device_name=entity.entity_name or f"AVDECC-{entity_id_str[:8]}",
                        channels=2,
                        sample_rate=48000,
                        mac_address=":".join(f"{b:02x}" for b in entity.mac_address),
                        last_seen=datetime.now()
                    )
                    self.endpoints[endpoint.endpoint_id()] = endpoint

        except Exception as e:
            logger.error(f"AVDECC discovery error: {e}")

    async def _cleanup_loop(self):
        """Remove stale endpoints"""
        while self._running:
            await asyncio.sleep(30)  # Cleanup every 30 seconds

            try:
                now = datetime.now()
                stale_threshold = timedelta(seconds=60)

                stale_endpoints = [
                    endpoint_id
                    for endpoint_id, endpoint in self.endpoints.items()
                    if now - endpoint.last_seen > stale_threshold
                ]

                for endpoint_id in stale_endpoints:
                    logger.info(f"Removing stale endpoint: {endpoint_id}")
                    del self.endpoints[endpoint_id]

            except Exception as e:
                logger.error(f"Cleanup error: {e}")

    # ========================================================================
    # Connection Management
    # ========================================================================

    @staticmethod
    def _build_stream_id(
        endpoint: AudioEndpoint,
        peer: AudioEndpoint,
        direction: str,
    ) -> str:
        """Build deterministic stream id for connection lifecycle."""
        return (
            f"map2-{direction}-"
            f"{endpoint.entity_id}-{endpoint.unique_id}-"
            f"{peer.entity_id}-{peer.unique_id}"
        )

    @staticmethod
    def _parse_host(node_address: Optional[str]) -> str:
        """Extract host from node address."""
        if not node_address:
            return ""
        try:
            parsed = urlparse(node_address)
            return (parsed.hostname or "").strip()
        except Exception:
            return ""

    def _is_local_node_address(self, node_address: Optional[str]) -> bool:
        """Best-effort check whether a node address points to this host."""
        host = self._parse_host(node_address)
        if not host:
            return True
        if host in {"localhost", "127.0.0.1", "::1"}:
            return True

        try:
            local_hosts = {socket.gethostname(), socket.getfqdn()}
            for h in list(local_hosts):
                try:
                    local_hosts.update(socket.gethostbyname_ex(h)[2])
                except Exception:
                    continue
            return host in local_hosts
        except Exception:
            return False

    async def _remote_post(self, node_address: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Issue POST request to remote MAP2 node and normalize result."""
        url = f"{node_address.rstrip('/')}{path}"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(url, json=payload or {})
            if response.status_code >= 400:
                return {"success": False, "error": f"{response.status_code} {response.text}"}
            data = response.json() if response.content else {}
            if isinstance(data, dict):
                if data.get("error"):
                    return {"success": False, "error": str(data["error"])}
                return {"success": True, "data": data}
            return {"success": True, "data": {}}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    async def _remote_delete(self, node_address: str, path: str) -> Dict[str, Any]:
        """Issue DELETE request to remote MAP2 node and normalize result."""
        url = f"{node_address.rstrip('/')}{path}"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.delete(url)
            if response.status_code == 404:
                return {"success": True, "data": {"status": "not_found"}}
            if response.status_code >= 400:
                return {"success": False, "error": f"{response.status_code} {response.text}"}
            data = response.json() if response.content else {}
            return {"success": True, "data": data if isinstance(data, dict) else {}}
        except Exception as exc:
            return {"success": False, "error": str(exc)}

    async def _provision_map2_stream(
        self,
        endpoint: AudioEndpoint,
        stream_config: Dict[str, Any],
    ) -> Tuple[bool, str]:
        """Create and start a stream on local or remote MAP2 node."""
        stream_id = str(stream_config["stream_id"])
        is_local = self._is_local_node_address(endpoint.node_address)

        if is_local:
            from app.services.avb.avb_service import get_avb_service, AvbStreamConfig, StreamDirection

            avb_service = get_avb_service()
            direction = StreamDirection(stream_config["direction"])
            cfg = AvbStreamConfig(
                stream_id=stream_id,
                direction=direction,
                channels=int(stream_config.get("channels", 2)),
                sample_rate=int(stream_config.get("sample_rate", 48000)),
                buffer_size=int(stream_config.get("buffer_size", 256)),
                interface=str(stream_config.get("interface", "")),
                dest_mac=stream_config.get("dest_mac"),
                presentation_offset_us=int(stream_config.get("presentation_offset_us", 2000)),
                priority=int(stream_config.get("priority", 3)),
            )

            create_result = await avb_service.create_stream(cfg)
            if create_result.get("error") and create_result.get("code") != "STREAM_EXISTS":
                return False, str(create_result["error"])

            start_result = await avb_service.start_stream(stream_id)
            if start_result.get("error"):
                return False, str(start_result["error"])

            return True, ""

        if not endpoint.node_address:
            return False, "Missing node address for remote MAP2 endpoint"

        create_res = await self._remote_post(endpoint.node_address, "/api/avb/streams", stream_config)
        if not create_res.get("success"):
            return False, str(create_res.get("error"))

        start_res = await self._remote_post(endpoint.node_address, f"/api/avb/streams/{stream_id}/start")
        if not start_res.get("success"):
            return False, str(start_res.get("error"))

        return True, ""

    async def _deprovision_map2_stream(
        self,
        endpoint: AudioEndpoint,
        stream_id: str,
    ) -> Tuple[bool, str]:
        """Stop and delete a stream on local or remote MAP2 node."""
        is_local = self._is_local_node_address(endpoint.node_address)

        if is_local:
            from app.services.avb.avb_service import get_avb_service

            avb_service = get_avb_service()
            stop_result = await avb_service.stop_stream(stream_id)
            if stop_result.get("error") and stop_result.get("code") != "NOT_FOUND":
                return False, str(stop_result["error"])

            delete_result = await avb_service.delete_stream(stream_id)
            if delete_result.get("error") and delete_result.get("code") != "NOT_FOUND":
                return False, str(delete_result["error"])

            return True, ""

        if not endpoint.node_address:
            return False, "Missing node address for remote MAP2 endpoint"

        stop_res = await self._remote_post(endpoint.node_address, f"/api/avb/streams/{stream_id}/stop")
        if not stop_res.get("success"):
            # Treat stream-not-found as best-effort success for idempotent disconnect.
            if "404" not in str(stop_res.get("error", "")):
                return False, str(stop_res.get("error"))

        delete_res = await self._remote_delete(endpoint.node_address, f"/api/avb/streams/{stream_id}")
        if not delete_res.get("success"):
            return False, str(delete_res.get("error"))

        return True, ""

    async def connect(
        self,
        talker_id: str,
        listener_id: str,
        reservation_id: Optional[str] = None,
        admission_id: Optional[str] = None,
        return_details: bool = False,
    ) -> Any:
        """
        Connect talker to listener.

        Args:
            talker_id: Talker endpoint ID (entity_id:unique_id)
            listener_id: Listener endpoint ID (entity_id:unique_id)
            return_details: Return structured result payload instead of bool

        Returns:
            True if connection initiated successfully, or structured result payload
            when return_details=True.
        """
        result: Dict[str, Any] = {"success": False}
        talker = self.endpoints.get(talker_id)
        listener = self.endpoints.get(listener_id)

        if not talker or not listener:
            if reservation_id:
                warning = await self._release_rejected_reservation(reservation_id, talker_id, listener_id)
                if warning is not None:
                    result["srp_release_warning"] = warning
            logger.error(f"Endpoint not found: talker={talker_id}, listener={listener_id}")
            result["reason"] = "Endpoint not found"
            return result if return_details else False

        if talker.direction != StreamDirection.TALKER:
            if reservation_id:
                warning = await self._release_rejected_reservation(reservation_id, talker_id, listener_id)
                if warning is not None:
                    result["srp_release_warning"] = warning
            logger.error(f"Not a talker: {talker_id}")
            result["reason"] = "Not a talker"
            return result if return_details else False

        if listener.direction != StreamDirection.LISTENER:
            if reservation_id:
                warning = await self._release_rejected_reservation(reservation_id, talker_id, listener_id)
                if warning is not None:
                    result["srp_release_warning"] = warning
            logger.error(f"Not a listener: {listener_id}")
            result["reason"] = "Not a listener"
            return result if return_details else False

        if reservation_id is None and bool(config_get("avb.srp.enabled", True)):
            try:
                from app.services.avb.srp_admission import (
                    SrpAdmissionRequest,
                    get_srp_admission_service,
                )

                admission = await get_srp_admission_service().admit(
                    SrpAdmissionRequest(
                        endpoint="router.connect.internal",
                        stream_id=f"{talker_id}->{listener_id}",
                        talker_id=talker_id,
                        listener_id=listener_id,
                        talker_mac=talker.mac_address,
                        listener_mac=listener.mac_address,
                        request_metadata={
                            "talker_device_type": talker.device_type,
                            "listener_device_type": listener.device_type,
                        },
                    )
                )
                if admission.decision == "denied":
                    logger.error(
                        "SRP admission denied for %s: %s %s",
                        f"{talker_id}->{listener_id}",
                        admission.reason_code,
                        admission.reason,
                    )
                    result["reason"] = f"SRP admission denied: {admission.reason_code}"
                    return result if return_details else False
                if admission.decision == "allowed":
                    if not admission.reservation_id:
                        logger.error(
                            "SRP admission for %s returned allowed without reservation_id",
                            f"{talker_id}->{listener_id}",
                        )
                        if bool(config_get("avb.srp.required", True)):
                            result["reason"] = "SRP admission returned allowed without reservation_id"
                            return result if return_details else False
                    else:
                        reservation_id = admission.reservation_id
                        admission_id = admission.admission_id
                elif admission.decision == "bypass":
                    # Preserve optional bypass and prevent redundant re-admission.
                    reservation_id = ""
            except Exception as exc:
                logger.error("SRP admission error for %s: %s", f"{talker_id}->{listener_id}", exc)
                if bool(config_get("avb.srp.required", True)):
                    result["reason"] = f"SRP admission error: {exc}"
                    return result if return_details else False

        # Create connection
        connection = StreamConnection(
            talker=talker,
            listener=listener,
            state=ConnectionState.CONNECTING,
            srp_reservation_id=reservation_id,
            srp_admission_id=admission_id,
        )

        conn_id = connection.connection_id()
        self.connections[conn_id] = connection

        # Dispatch to appropriate handler
        if talker.device_type == "map2" and listener.device_type == "map2":
            success = await self._connect_map2_to_map2(connection)
        elif talker.device_type == "avdecc" or listener.device_type == "avdecc":
            success = await self._connect_via_avdecc(connection)
        else:
            logger.error(f"Unsupported connection type: {talker.device_type} → {listener.device_type}")
            success = False

        if success:
            connection.state = ConnectionState.CONNECTED
            connection.established_time = datetime.now()
            logger.info(f"Connected: {conn_id}")
            result["success"] = True
            result["connection_id"] = conn_id
        else:
            if connection.srp_reservation_id:
                reservation_to_release = connection.srp_reservation_id
                try:
                    from app.services.avb.srp_admission import get_srp_admission_service

                    release_result = await get_srp_admission_service().release(
                        reservation_id=reservation_to_release,
                        endpoint="router.connect.rollback",
                        stream_id=conn_id,
                        talker_id=talker_id,
                        listener_id=listener_id,
                    )
                    result["srp_release"] = _build_srp_release_payload(
                        release_result,
                        reservation_id=reservation_to_release,
                    )
                    if not bool(getattr(release_result, "success", False)):
                        result["srp_release_warning"] = _build_srp_release_warning(
                            reason="Router connect failed and SRP rollback release failed",
                            reservation_id=reservation_to_release,
                            detail=(
                                f"{getattr(release_result, 'reason_code', None)}:"
                                f" {getattr(release_result, 'reason', None)}"
                            ),
                        )
                except Exception as exc:
                    logger.warning("SRP rollback release failed for %s: %s", conn_id, exc)
                    result["srp_release_warning"] = _build_srp_release_warning(
                        reason="Router connect failed and SRP rollback release failed",
                        reservation_id=reservation_to_release,
                        detail=exc,
                    )
            connection.state = ConnectionState.ERROR
            connection.error_message = "Connection failed"
            logger.error(f"Connection failed: {conn_id}")
            result["reason"] = "Connection failed"

        return result if return_details else success

    async def _release_rejected_reservation(
        self,
        reservation_id: str,
        talker_id: str,
        listener_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Release route-level SRP reservation rejected before connection provisioning."""
        if not reservation_id:
            return None

        try:
            from app.services.avb.srp_admission import get_srp_admission_service

            release_result = await get_srp_admission_service().release(
                reservation_id=reservation_id,
                endpoint="router.connect.reject",
                stream_id=f"{talker_id}->{listener_id}",
                talker_id=talker_id,
                listener_id=listener_id,
            )
            if not bool(getattr(release_result, "success", False)):
                return _build_srp_release_warning(
                    reason="Router connect rejected request and SRP reservation release failed",
                    reservation_id=reservation_id,
                    detail=(
                        f"{getattr(release_result, 'reason_code', None)}:"
                        f" {getattr(release_result, 'reason', None)}"
                    ),
                )
            return None
        except Exception as exc:
            logger.warning(
                "SRP reject release failed for %s->%s: %s",
                talker_id,
                listener_id,
                exc,
            )
            return _build_srp_release_warning(
                reason="Router connect rejected request and SRP reservation release failed",
                reservation_id=reservation_id,
                detail=exc,
            )

    async def disconnect(self, talker_id: str, listener_id: str, return_details: bool = False) -> Any:
        """
        Disconnect talker from listener.

        Args:
            talker_id: Talker endpoint ID
            listener_id: Listener endpoint ID
            return_details: Return structured result payload instead of bool

        Returns:
            True if disconnection successful, or structured result payload when
            return_details=True.
        """
        conn_id = f"{talker_id}→{listener_id}"
        connection = self.connections.get(conn_id)
        result: Dict[str, Any] = {"success": False}

        if not connection:
            logger.warning(f"Connection not found: {conn_id}")
            return result if return_details else False

        connection.state = ConnectionState.DISCONNECTING

        # Dispatch to appropriate handler
        if connection.talker.device_type == "map2" and connection.listener.device_type == "map2":
            success = await self._disconnect_map2_to_map2(connection)
        elif connection.talker.device_type == "avdecc" or connection.listener.device_type == "avdecc":
            success = await self._disconnect_via_avdecc(connection)
        else:
            success = False

        if success:
            if connection.srp_reservation_id:
                reservation_id = connection.srp_reservation_id
                try:
                    from app.services.avb.srp_admission import get_srp_admission_service

                    release_result = await get_srp_admission_service().release(
                        reservation_id=reservation_id,
                        endpoint="router.disconnect",
                        stream_id=conn_id,
                        talker_id=talker_id,
                        listener_id=listener_id,
                    )
                    result["srp_release"] = _build_srp_release_payload(
                        release_result,
                        reservation_id=reservation_id,
                    )
                    if not bool(getattr(release_result, "success", False)):
                        logger.warning(
                            "SRP release failed for %s (%s): %s",
                            conn_id,
                            getattr(release_result, "reason_code", None),
                            getattr(release_result, "reason", None),
                        )
                        result["srp_release_warning"] = _build_srp_release_warning(
                            reason="Router disconnect succeeded but SRP reservation release failed",
                            reservation_id=reservation_id,
                            detail=(
                                f"{getattr(release_result, 'reason_code', None)}:"
                                f" {getattr(release_result, 'reason', None)}"
                            ),
                        )
                except Exception as exc:
                    logger.warning("SRP release raised for %s: %s", conn_id, exc)
                    result["srp_release_warning"] = _build_srp_release_warning(
                        reason="Router disconnect succeeded but SRP reservation release failed",
                        reservation_id=reservation_id,
                        detail=exc,
                    )
            del self.connections[conn_id]
            logger.info(f"Disconnected: {conn_id}")
            result["success"] = True
        else:
            connection.state = ConnectionState.ERROR
            connection.error_message = "Disconnection failed"
            logger.error(f"Disconnection failed: {conn_id}")

        return result if return_details else success

    # ========================================================================
    # MAP2-to-MAP2 Connections
    # ========================================================================

    async def _connect_map2_to_map2(self, connection: StreamConnection) -> bool:
        """Connect two MAP2 nodes directly"""
        try:
            interface = config_get("avb.interface", "")
            buffer_size = int(config_get("audio.buffer_size", 256))
            priority = int(config_get("avb.stream_priority", 3))

            talker_config = {
                "stream_id": self._build_stream_id(connection.talker, connection.listener, "talker"),
                "direction": "talker",
                "channels": connection.talker.channels,
                "sample_rate": connection.talker.sample_rate,
                "buffer_size": buffer_size,
                "interface": interface,
                "dest_mac": connection.listener.mac_address or "91:e0:f0:00:fe:01",
                "presentation_offset_us": 2000,
                "priority": priority,
            }

            listener_config = {
                "stream_id": self._build_stream_id(connection.listener, connection.talker, "listener"),
                "direction": "listener",
                "channels": connection.listener.channels,
                "sample_rate": connection.listener.sample_rate,
                "buffer_size": buffer_size,
                "interface": interface,
                "presentation_offset_us": 2000,
                "priority": priority,
            }

            talker_ok, talker_error = await self._provision_map2_stream(connection.talker, talker_config)
            if not talker_ok:
                connection.error_message = f"talker provision failed: {talker_error}"
                return False

            listener_ok, listener_error = await self._provision_map2_stream(connection.listener, listener_config)
            if not listener_ok:
                # Roll back talker if listener provisioning failed.
                await self._deprovision_map2_stream(connection.talker, str(talker_config["stream_id"]))
                connection.error_message = f"listener provision failed: {listener_error}"
                return False

            return True

        except Exception as e:
            logger.error(f"MAP2-to-MAP2 connection error: {e}")
            return False

    async def _disconnect_map2_to_map2(self, connection: StreamConnection) -> bool:
        """Disconnect two MAP2 nodes"""
        try:
            talker_stream_id = self._build_stream_id(connection.talker, connection.listener, "talker")
            listener_stream_id = self._build_stream_id(connection.listener, connection.talker, "listener")

            talker_ok, talker_error = await self._deprovision_map2_stream(connection.talker, talker_stream_id)
            listener_ok, listener_error = await self._deprovision_map2_stream(connection.listener, listener_stream_id)

            if not talker_ok or not listener_ok:
                errors = [err for err in [talker_error, listener_error] if err]
                connection.error_message = "; ".join(errors) if errors else "Disconnect failed"
                return False

            return True

        except Exception as e:
            logger.error(f"MAP2-to-MAP2 disconnection error: {e}")
            return False

    # ========================================================================
    # AVDECC Connections
    # ========================================================================

    async def _connect_via_avdecc(self, connection: StreamConnection) -> bool:
        """Connect using AVDECC ACMP protocol"""
        if not self.avdecc_entity:
            return False

        try:
            talker_entity_id = int(connection.talker.entity_id, 16)
            listener_entity_id = int(connection.listener.entity_id, 16)

            # Send ACMP CONNECT_TX_COMMAND
            success = await asyncio.to_thread(
                self.avdecc_entity.connectStream,
                talker_entity_id,
                connection.talker.unique_id,
                listener_entity_id,
                connection.listener.unique_id
            )

            return success

        except Exception as e:
            logger.error(f"AVDECC connection error: {e}")
            return False

    async def _disconnect_via_avdecc(self, connection: StreamConnection) -> bool:
        """Disconnect using AVDECC ACMP protocol"""
        if not self.avdecc_entity:
            return False

        try:
            talker_entity_id = int(connection.talker.entity_id, 16)
            listener_entity_id = int(connection.listener.entity_id, 16)

            # Send ACMP DISCONNECT_TX_COMMAND
            success = await asyncio.to_thread(
                self.avdecc_entity.disconnectStream,
                talker_entity_id,
                connection.talker.unique_id,
                listener_entity_id,
                connection.listener.unique_id
            )

            return success

        except Exception as e:
            logger.error(f"AVDECC disconnection error: {e}")
            return False

    # ========================================================================
    # Query Methods
    # ========================================================================

    def get_endpoints(self, direction: Optional[StreamDirection] = None) -> List[AudioEndpoint]:
        """Get all endpoints, optionally filtered by direction"""
        if direction:
            return [ep for ep in self.endpoints.values() if ep.direction == direction]
        return list(self.endpoints.values())

    def get_talkers(self) -> List[AudioEndpoint]:
        """Get all talker endpoints"""
        return self.get_endpoints(StreamDirection.TALKER)

    def get_listeners(self) -> List[AudioEndpoint]:
        """Get all listener endpoints"""
        return self.get_endpoints(StreamDirection.LISTENER)

    def get_connections(self) -> List[StreamConnection]:
        """Get all active connections"""
        return list(self.connections.values())

    def get_routing_matrix(self) -> Dict[str, Dict[str, Optional[ConnectionState]]]:
        """
        Get routing matrix showing all possible connections.

        Returns:
            Dict[talker_id, Dict[listener_id, ConnectionState or None]]
        """
        matrix: Dict[str, Dict[str, Optional[ConnectionState]]] = {}

        talkers = self.get_talkers()
        listeners = self.get_listeners()

        for talker in talkers:
            matrix[talker.endpoint_id()] = {}
            for listener in listeners:
                conn_id = f"{talker.endpoint_id()}→{listener.endpoint_id()}"
                connection = self.connections.get(conn_id)
                matrix[talker.endpoint_id()][listener.endpoint_id()] = (
                    connection.state if connection else None
                )

        return matrix

    def get_stats(self) -> Dict:
        """Get router statistics"""
        return {
            "endpoints": {
                "total": len(self.endpoints),
                "talkers": len(self.get_talkers()),
                "listeners": len(self.get_listeners()),
                "map2": len([ep for ep in self.endpoints.values() if ep.device_type == "map2"]),
                "avdecc": len([ep for ep in self.endpoints.values() if ep.device_type == "avdecc"])
            },
            "connections": {
                "total": len(self.connections),
                "connected": len([c for c in self.connections.values() if c.state == ConnectionState.CONNECTED]),
                "connecting": len([c for c in self.connections.values() if c.state == ConnectionState.CONNECTING]),
                "error": len([c for c in self.connections.values() if c.state == ConnectionState.ERROR])
            }
        }


def _extract_avdecc_entity(engine: Any) -> Optional[Any]:
    """
    Resolve AVDECC entity wrapper from a JUCE C++ engine instance.

    The Python binding surface may vary by build, so probe common
    method/attribute names and fail closed.
    """
    if engine is None:
        return None

    candidates = (
        "get_avdecc_entity",
        "getAvdeccEntity",
        "avdecc_entity",
        "avdeccEntity",
    )

    for name in candidates:
        value = getattr(engine, name, None)
        if value is None:
            continue

        if callable(value):
            try:
                entity = value()
            except Exception as exc:
                logger.debug("AVDECC entity resolver %s failed: %s", name, exc)
                continue
            if entity is not None:
                return entity
            continue

        return value

    return None


# Singleton instance
_avb_router: Optional[AvbRouter] = None


def get_avb_router() -> AvbRouter:
    """
    Get singleton AVB router instance.

    Router initialization is intentionally tolerant of missing JUCE/AVDECC
    bindings so API endpoints can still return graceful unavailable states.
    """
    global _avb_router

    if _avb_router is None:
        engine_service = None
        avdecc_entity = None

        try:
            from app.services.juce_engine_service import get_audio_engine

            engine_service = get_audio_engine()
            engine = getattr(engine_service, "_engine", None)
            avdecc_entity = _extract_avdecc_entity(engine)
        except Exception as exc:
            logger.debug("AVB router initialized without engine bindings: %s", exc)

        _avb_router = AvbRouter(engine_service=engine_service, avdecc_entity=avdecc_entity)
        return _avb_router

    # Late-bind if engine was initialized after router creation.
    try:
        if _avb_router.engine_service is None or _avb_router.avdecc_entity is None:
            from app.services.juce_engine_service import get_audio_engine

            engine_service = get_audio_engine()
            engine = getattr(engine_service, "_engine", None)
            avdecc_entity = _extract_avdecc_entity(engine)

            if _avb_router.engine_service is None:
                _avb_router.engine_service = engine_service
            if _avb_router.avdecc_entity is None and avdecc_entity is not None:
                _avb_router.avdecc_entity = avdecc_entity
    except Exception as exc:
        logger.debug("AVB router late-bind skipped: %s", exc)

    return _avb_router

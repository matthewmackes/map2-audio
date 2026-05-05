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
import inspect
import json
import socket
import uuid
from urllib.parse import urlparse
from typing import Any, Dict, List, Optional, Set, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
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


_ALLOWED_CONNECTION_ROLES = {
    "effects_loop_send",
    "effects_loop_return",
    "general_route",
}


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
    node_id: Optional[str] = None  # Owning node identifier (MAP2 or AVDECC synthetic ID)
    node_address: Optional[str] = None  # For MAP2 nodes (http://...)
    host: Optional[str] = None  # Source host label for UI and diagnostics
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
    flow_trace_id: Optional[str] = None
    connection_role: str = "general_route"
    loop_id: Optional[str] = None
    # T2496-2 — set after `connect()` writes the connection through
    # `AvbBindingAuthority`. Read-side projection (router_projection.py)
    # skips connections whose authority_binding_id is set so the
    # operator surface doesn't see both a synthetic projection and a
    # durable authority row for the same connection.
    authority_binding_id: Optional[str] = None

    def connection_id(self) -> str:
        """Unique identifier for this connection"""
        return f"{self.talker.endpoint_id()}→{self.listener.endpoint_id()}"


class AvbRouter:
    """
    AVB Stream Routing Matrix

    Manages stream connections between talkers and listeners.
    Supports MAP2 nodes and AVDECC third-party devices.
    """

    _AVDECC_SAMPLE_RATE_FROM_CODE: Dict[int, int] = {
        0x01: 8000,
        0x02: 16000,
        0x03: 32000,
        0x04: 44100,
        0x05: 48000,
        0x06: 88200,
        0x07: 96000,
        0x08: 176400,
        0x09: 192000,
    }
    _AVDECC_FORMAT_BITS_PER_SAMPLE: Dict[int, str] = {
        8: "8-bit PCM",
        16: "16-bit PCM",
        20: "20-bit PCM",
        24: "24-bit PCM",
        32: "32-bit PCM",
    }
    _DEFAULT_AVDECC_CHANNELS = 1
    _DEFAULT_AVDECC_SAMPLE_RATE = 1

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
        self._auto_connect_task: Optional[asyncio.Task] = None
        self._running = False
        self._discovery_cycles = 0
        self._cleanup_cycles = 0
        self._auto_connect_runs = 0
        self._stale_removed_total = 0
        self._last_discovery_error: Optional[str] = None
        self._last_cleanup_error: Optional[str] = None
        self._last_auto_connect_error: Optional[str] = None
        self._last_auto_connect_summary: Optional[Dict[str, Any]] = None

    async def start(self):
        """Start router services"""
        if self._running:
            return

        self._running = True

        # Start discovery
        self._discovery_task = asyncio.create_task(self._discovery_loop())

        # Start cleanup (remove stale endpoints)
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())

        if self._is_auto_connect_enabled():
            self._auto_connect_task = asyncio.create_task(self._auto_connect_startup())

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

        if self._auto_connect_task:
            self._auto_connect_task.cancel()
            try:
                await self._auto_connect_task
            except asyncio.CancelledError:
                pass

        self.endpoints.clear()
        self.connections.clear()
        await self._sync_engine_discovered_devices()

        logger.info("AVB Router stopped")

    @property
    def is_running(self) -> bool:
        """Return whether router background loops are active."""
        return self._running

    def _is_auto_connect_enabled(self) -> bool:
        """Return whether startup auto-connect orchestration is enabled."""
        return self._coerce_bool(config_get("avb.auto_connect", True), True)

    async def trigger_auto_connect(self, *, reason: str = "manual") -> Dict[str, Any]:
        """Run an explicit auto-connect pass outside startup orchestration."""
        if not self._is_auto_connect_enabled():
            summary = {
                "reason": str(reason),
                "enabled": False,
                "connected": 0,
                "failed": 0,
                "candidate_pairs": 0,
                "error": "AVB auto-connect disabled",
            }
            self._last_auto_connect_summary = summary
            self._last_auto_connect_error = None
            return dict(summary)

        attempt = self._auto_connect_runs + 1
        self._auto_connect_runs += 1
        try:
            summary = await self._auto_connect_once(attempt=attempt)
            summary["reason"] = str(reason)
            self._last_auto_connect_summary = summary
            self._last_auto_connect_error = None
            return dict(summary)
        except Exception as exc:
            self._last_auto_connect_error = str(exc)
            summary = {
                "reason": str(reason),
                "enabled": True,
                "connected": 0,
                "failed": 1,
                "candidate_pairs": 0,
                "error": str(exc),
            }
            self._last_auto_connect_summary = summary
            logger.warning("AVB auto-connect trigger failed (%s): %s", reason, exc)
            return dict(summary)

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

    @staticmethod
    def _coerce_format_int(value: Any, fallback: int) -> int:
        """Parse int-like values and hex-style strings safely."""
        if value is None:
            return fallback
        if isinstance(value, int):
            return value
        if isinstance(value, str):
            normalized = value.strip()
            if not normalized:
                return fallback
            try:
                return int(normalized, 0)
            except Exception:
                pass
            if any(ch in "abcdefABCDEF" for ch in normalized):
                try:
                    return int(normalized, 16)
                except Exception:
                    return fallback
            return fallback
        try:
            return int(value)
        except Exception:
            return fallback

    @classmethod
    def _parse_avdecc_stream_format(cls, current_format: Any) -> Dict[str, int]:
        """Decode IEEE 1722.1 stream format into key fields."""
        value = cls._coerce_format_int(current_format, 0)
        if value <= 0:
            return {}

        sample_rate_code = value & 0xFFFF
        return {
            "channels": (value >> 32) & 0xFF,
            "sample_rate": cls._AVDECC_SAMPLE_RATE_FROM_CODE.get(sample_rate_code, 0),
            "bits_per_sample": (value >> 24) & 0xFF,
        }

    @classmethod
    def _label_avdecc_format_bits(cls, bits_per_sample: Any) -> str:
        return cls._AVDECC_FORMAT_BITS_PER_SAMPLE.get(
            int(bits_per_sample),
            "Unknown PCM",
        )

    @staticmethod
    def _coerce_bool(value: Any, fallback: bool = False) -> bool:
        """Parse bool-like values safely."""
        if value is None:
            return fallback
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value != 0
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "on"}:
                return True
            if normalized in {"0", "false", "no", "off", ""}:
                return False
        return fallback

    @staticmethod
    def _normalize_connection_role(raw: Any) -> str:
        """Normalize optional route role metadata for observability."""
        role = str(raw or "").strip().lower()
        if role in _ALLOWED_CONNECTION_ROLES:
            return role
        return "general_route"

    @staticmethod
    def _new_flow_trace_id(prefix: str) -> str:
        return f"{prefix}-{uuid.uuid4().hex[:12]}"

    def _record_flow_stage(
        self,
        *,
        result: Dict[str, Any],
        trace_id: str,
        stage: str,
        status: str,
        detail: Optional[str] = None,
    ) -> None:
        stages = result.setdefault("stages", [])
        payload: Dict[str, str] = {"stage": stage, "status": status}
        if detail:
            payload["detail"] = detail
        stages.append(payload)

        detail_text = f" detail={detail}" if detail else ""
        log_line = f"avb-flow trace={trace_id} stage={stage} status={status}{detail_text}"
        if status in {"error", "failed"}:
            logger.error(log_line)
        elif status in {"warning", "retry"}:
            logger.warning(log_line)
        else:
            logger.info(log_line)

    @staticmethod
    def _is_transient_operation_error(error: Optional[str]) -> bool:
        """Best-effort classifier for retryable transport/control-plane failures."""
        message = str(error or "").lower()
        if not message:
            return False

        transient_markers = (
            "timeout",
            "timed out",
            "temporar",
            "try again",
            "eagain",
            "wouldblock",
            "connection reset",
            "connection refused",
            "network",
            "unavailable",
            "busy",
            "503",
            "502",
            "504",
        )
        return any(marker in message for marker in transient_markers)

    async def _execute_with_backoff_retry(
        self,
        *,
        operation: str,
        action,
        trace_id: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """Run operation with bounded backoff retries for transient failures."""
        try:
            max_attempts = max(1, int(config_get("avb.router.retry.max_attempts", 3)))
        except Exception:
            max_attempts = 3

        try:
            base_delay_ms = max(0, int(config_get("avb.router.retry.base_delay_ms", 100)))
        except Exception:
            base_delay_ms = 100

        try:
            max_delay_ms = max(base_delay_ms, int(config_get("avb.router.retry.max_delay_ms", 1000)))
        except Exception:
            max_delay_ms = max(base_delay_ms, 1000)

        last_error = ""
        for attempt in range(1, max_attempts + 1):
            ok, err = await action()
            if ok:
                return True, ""

            last_error = str(err or f"{operation} failed")
            should_retry = attempt < max_attempts and self._is_transient_operation_error(last_error)
            if not should_retry:
                return False, last_error

            delay_ms = min(base_delay_ms * (2 ** (attempt - 1)), max_delay_ms)
            if trace_id:
                logger.warning(
                    "avb-flow trace=%s stage=%s status=retry attempt=%s/%s detail=%s",
                    trace_id,
                    operation,
                    attempt + 1,
                    max_attempts,
                    last_error,
                )
            else:
                logger.warning(
                    "Retrying %s (%s/%s) after transient failure: %s",
                    operation,
                    attempt + 1,
                    max_attempts,
                    last_error,
                )
            if delay_ms > 0:
                await asyncio.sleep(delay_ms / 1000.0)

        return False, last_error

    @staticmethod
    def _read_entity_field(entity: Any, *names: str, default: Any = None) -> Any:
        """Read a field from object or dict-like AVDECC entity payloads."""
        if entity is None:
            return default

        for name in names:
            try:
                if isinstance(entity, dict):
                    if name in entity and entity[name] is not None:
                        return entity[name]
                elif hasattr(entity, name):
                    value = getattr(entity, name)
                    if value is not None:
                        return value
            except Exception:
                continue

        return default

    def _resolve_avdecc_callable(self, names: Tuple[str, ...]) -> Optional[Any]:
        """Resolve a callable on avdecc_entity by probing common method names."""
        if self.avdecc_entity is None:
            return None
        for name in names:
            candidate = getattr(self.avdecc_entity, name, None)
            if callable(candidate):
                return candidate
        return None

    @staticmethod
    def _normalize_avdecc_entity_id(raw: Any) -> Optional[str]:
        """Normalize AVDECC entity ID into a 16-char lowercase hex string."""
        if raw is None:
            return None

        try:
            if isinstance(raw, int):
                if raw < 0:
                    return None
                return f"{raw:016x}"
            text = str(raw).strip().lower().replace("0x", "")
            if not text:
                return None
            if len(text) <= 16 and all(ch in "0123456789abcdef" for ch in text):
                return text.zfill(16)
        except Exception:
            return None

        return None

    @staticmethod
    def _normalize_mac_address(raw: Any) -> Optional[str]:
        """Normalize MAC address from bytes/list/string to aa:bb:cc:dd:ee:ff."""
        if raw is None:
            return None

        if isinstance(raw, str):
            normalized = raw.strip().lower().replace("-", ":")
            parts = [part for part in normalized.split(":") if part]
            if len(parts) == 6 and all(len(part) <= 2 for part in parts):
                try:
                    bytes_parsed = [int(part, 16) for part in parts]
                    if all(0 <= b <= 255 for b in bytes_parsed):
                        return ":".join(f"{b:02x}" for b in bytes_parsed)
                except Exception:
                    return None
            return None

        if isinstance(raw, (list, tuple)) and len(raw) == 6:
            try:
                bytes_parsed = [int(item) & 0xFF for item in raw]
                return ":".join(f"{b:02x}" for b in bytes_parsed)
            except Exception:
                return None

        return None

    def _resolve_avdecc_host_label(self, entity: Any, entity_id: str) -> str:
        """Resolve best host label for AVDECC endpoint attribution."""
        explicit_host = self._read_entity_field(
            entity,
            "host",
            "hostname",
            "node_host",
            "nodeHost",
            default=None,
        )
        if explicit_host:
            host = str(explicit_host).strip()
            if host:
                return host

        node_address = self._read_entity_field(entity, "node_address", "nodeAddress", default=None)
        parsed_host = self._parse_host(str(node_address)) if node_address else ""
        if parsed_host:
            return parsed_host

        group_name = self._read_entity_field(entity, "group_name", "groupName", default=None)
        if group_name:
            host = str(group_name).strip()
            if host:
                return host

        mac_address = self._normalize_mac_address(
            self._read_entity_field(entity, "mac_address", "macAddress", default=None)
        )
        if mac_address:
            return mac_address

        return f"entity-{entity_id[:8]}"

    def _resolve_avdecc_stream_profiles(
        self,
        entity: Any,
        direction: StreamDirection,
    ) -> List[Dict[str, Any]]:
        """Normalize optional AVDECC stream profile metadata when available."""
        raw_streams = self._read_entity_field(
            entity,
            "streams",
            "avb_streams",
            "stream_profiles",
            "streamProfiles",
        )
        if not isinstance(raw_streams, list):
            raw_streams = []

        if not raw_streams:
            if direction == StreamDirection.TALKER:
                raw_streams = self._read_entity_field(
                    entity,
                    "stream_inputs",
                    "streamInputs",
                    default=[],
                )
            elif direction == StreamDirection.LISTENER:
                raw_streams = self._read_entity_field(
                    entity,
                    "stream_outputs",
                    "streamOutputs",
                    default=[],
                )
            else:
                raw_streams = []

            if not raw_streams:
                config_like = self._read_entity_field(
                    entity,
                    "current_config",
                    "currentConfig",
                    default=None,
                )
                if isinstance(config_like, dict):
                    if direction == StreamDirection.TALKER:
                        raw_streams = self._read_entity_field(
                            config_like,
                            "stream_inputs",
                            "streamInputs",
                            default=[],
                        )
                    elif direction == StreamDirection.LISTENER:
                        raw_streams = self._read_entity_field(
                            config_like,
                            "stream_outputs",
                            "streamOutputs",
                            default=[],
                        )

            if not raw_streams:
                configurations = self._read_entity_field(
                    entity,
                    "configurations",
                    default=[],
                )
                if isinstance(configurations, list) and configurations:
                    config_like = configurations[0]
                    if direction == StreamDirection.TALKER:
                        raw_streams = self._read_entity_field(
                            config_like,
                            "stream_inputs",
                            "streamInputs",
                            default=[],
                        )
                    elif direction == StreamDirection.LISTENER:
                        raw_streams = self._read_entity_field(
                            config_like,
                            "stream_outputs",
                            "streamOutputs",
                            default=[],
                        )

            if not isinstance(raw_streams, list):
                raw_streams = []

        profiles: List[Dict[str, Any]] = []
        for stream in raw_streams:
            if not isinstance(stream, dict):
                continue

            direction_raw = str(stream.get("direction", "")).strip().lower()
            if direction_raw and direction_raw != direction.value:
                continue

            format_metadata = self._parse_avdecc_stream_format(
                self._read_entity_field(
                    stream,
                    "current_format",
                    "currentFormat",
                    default=None,
                )
            )
            unique_id = self._coerce_int(
                self._read_entity_field(
                    stream,
                    "unique_id",
                    "stream_index",
                    "streamIndex",
                    default=len(profiles),
                ),
                len(profiles),
            )
            channels = self._coerce_int(
                self._read_entity_field(
                    stream,
                    "channels",
                    "channel_count",
                    "channelCount",
                    default=self._coerce_int(
                        format_metadata.get("channels"),
                        self._DEFAULT_AVDECC_CHANNELS,
                    ),
                ),
                self._DEFAULT_AVDECC_CHANNELS,
            )
            sample_rate = self._coerce_int(
                self._read_entity_field(
                    stream,
                    "sample_rate",
                    "sampleRate",
                    default=self._coerce_int(
                        format_metadata.get("sample_rate"),
                        self._DEFAULT_AVDECC_SAMPLE_RATE,
                    ),
                ),
                self._DEFAULT_AVDECC_SAMPLE_RATE,
            )
            bits_per_sample = self._coerce_int(
                self._read_entity_field(
                    stream,
                    "bits_per_sample",
                    "bitsPerSample",
                    default=format_metadata.get("bits_per_sample", 0),
                ),
                format_metadata.get("bits_per_sample", 0),
            )
            audio_format = str(
                self._read_entity_field(
                    stream,
                    "format",
                    "audio_format",
                    default=self._label_avdecc_format_bits(bits_per_sample),
                )
                or self._label_avdecc_format_bits(bits_per_sample)
            )

            profiles.append(
                {
                    "unique_id": unique_id,
                    "channels": max(1, channels),
                    "sample_rate": max(1, sample_rate),
                    "format": audio_format,
                }
            )

        return profiles

    def _build_engine_discovered_devices_payload(self) -> List[Dict[str, Any]]:
        """Build normalized discovered endpoint payload for the JUCE engine cache."""
        payload: List[Dict[str, Any]] = []
        for endpoint in self.endpoints.values():
            endpoint_id = endpoint.endpoint_id()
            direction = endpoint.direction.value
            source = str(endpoint.device_type or "unknown")
            host = str(endpoint.host or self._parse_host(endpoint.node_address)).strip()
            label_source = endpoint.device_name or source or "endpoint"
            display_name = f"AVB {direction.title()} [{label_source}::{endpoint_id}]"

            payload.append(
                {
                    "endpoint_id": endpoint_id,
                    "device_name": display_name,
                    "direction": direction,
                    "device_type": source,
                    "node_address": endpoint.node_address or "",
                    "audio_format": endpoint.format or "24-bit PCM",
                    "channels": max(1, int(endpoint.channels)),
                    "sample_rate": max(1, int(endpoint.sample_rate)),
                    "available": bool(endpoint.available),
                    "host": host,
                }
            )

        payload.sort(key=lambda item: str(item.get("endpoint_id", "")))
        return payload

    async def _sync_engine_discovered_devices(self) -> None:
        """Best-effort sync of discovered endpoints into engine AVB device cache."""
        if self.engine_service is None:
            return

        engine = getattr(self.engine_service, "_engine", None)
        if engine is None:
            return

        setter = getattr(engine, "set_avb_discovered_devices", None)
        if not callable(setter):
            setter = getattr(engine, "setAvbDiscoveredDevices", None)
        if not callable(setter):
            return

        payload = self._build_engine_discovered_devices_payload()

        try:
            result = setter(payload)
            if inspect.isawaitable(result):
                result = await result
            if isinstance(result, dict) and result.get("error"):
                logger.debug("Engine discovered-device sync error: %s", result.get("error"))
        except Exception as exc:
            logger.debug("Engine discovered-device sync skipped: %s", exc)

    async def _discovery_loop(self):
        """Periodically discover endpoints"""
        while self._running:
            self._discovery_cycles += 1
            try:
                await self._discover_map2_endpoints()
                await self._discover_avdecc_endpoints()
                await self._sync_engine_discovered_devices()
                self._last_discovery_error = None
            except Exception as e:
                logger.error(f"Discovery error: {e}")
                self._last_discovery_error = str(e)

            await asyncio.sleep(5)  # Discovery every 5 seconds

    async def _discover_map2_endpoints(self):
        """Discover MAP2 nodes via existing mDNS discovery"""
        if not self.engine_service:
            return

        try:
            from app.services.cluster.node_visibility import get_visible_remote_nodes

            _, visible_nodes = await asyncio.to_thread(get_visible_remote_nodes)

            for node_id, visible in visible_nodes.items():
                routing_ready = getattr(visible, "routing_ready", None)
                if routing_ready is None:
                    activation_state = getattr(visible, "activation_state", None)
                    routing_ready = bool(
                        getattr(visible, "registered", False)
                        and getattr(visible, "is_online", False)
                        and getattr(visible, "api_url", None)
                        and (activation_state in (None, "active"))
                    )

                if not routing_ready:
                    continue

                metadata = self._coerce_metadata(visible.metadata)
                if metadata.get("avb_enabled") is False:
                    continue

                entity_id = self._normalize_entity_id(
                    metadata.get("avb_entity_id"),
                    fallback_seed=node_id,
                )
                device_name = str(visible.hostname or node_id)
                mac_address = metadata.get("mac_address")
                node_address = visible.api_url
                if not node_address:
                    continue

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
                        node_id=node_id,
                        node_address=node_address,
                        host=visible.host or self._parse_host(node_address),
                        available=True,
                        last_seen=datetime.now(timezone.utc),
                    )
                    self.endpoints[endpoint.endpoint_id()] = endpoint
        except Exception as e:
            logger.error(f"MAP2 discovery error: {e}")

    async def _discover_avdecc_endpoints(self):
        """Discover AVDECC devices via ADP"""
        if not self.avdecc_entity:
            return

        try:
            discover_fn = self._resolve_avdecc_callable(
                (
                    "getDiscoveredEntities",
                    "get_discovered_entities",
                    "get_avdecc_entities",
                    "getAvdeccEntities",
                )
            )
            if discover_fn is None:
                return

            entities = discover_fn()
            if inspect.isawaitable(entities):
                entities = await entities
            if entities is None:
                return

            for entity in entities:
                available = self._coerce_bool(
                    self._read_entity_field(entity, "available", default=True),
                    True,
                )
                if not available:
                    continue

                entity_id_raw = self._read_entity_field(entity, "entity_id", "entityId", default=None)
                entity_id_str = self._normalize_avdecc_entity_id(entity_id_raw)
                if entity_id_str is None:
                    continue

                entity_name_raw = self._read_entity_field(entity, "entity_name", "device_name", "name", default=None)
                base_name = str(entity_name_raw).strip() if entity_name_raw else f"AVDECC-{entity_id_str[:8]}"

                host_label = self._resolve_avdecc_host_label(entity, entity_id_str)
                host_name_for_title = host_label.strip().lower()
                titled_device_name = (
                    base_name
                    if not host_name_for_title or host_name_for_title in base_name.lower()
                    else f"{base_name} @ {host_label}"
                )

                mac_address = self._normalize_mac_address(
                    self._read_entity_field(entity, "mac_address", "macAddress", default=None)
                )
                host_token = "".join(
                    ch.lower() if ch.isalnum() or ch in {"-", "."} else "-"
                    for ch in host_label
                ).strip("-")
                if not host_token:
                    host_token = f"entity-{entity_id_str[:8]}"
                node_address = f"avdecc://{host_token}"
                node_id = f"avdecc-{entity_id_str}"

                talker_stream_count = self._coerce_int(
                    self._read_entity_field(
                        entity,
                        "talker_stream_sources",
                        "talker_streams",
                        "talkerStreams",
                        default=0,
                    ),
                    0,
                )
                listener_stream_count = self._coerce_int(
                    self._read_entity_field(
                        entity,
                        "listener_stream_sinks",
                        "listener_streams",
                        "listenerStreams",
                        default=0,
                    ),
                    0,
                )

                capabilities = self._read_entity_field(entity, "capabilities", default={})
                if isinstance(capabilities, dict):
                    if talker_stream_count <= 0:
                        talker_stream_count = self._coerce_int(
                            capabilities.get("talker_streams", capabilities.get("talker_stream_sources", 0)),
                            0,
                        )
                    if listener_stream_count <= 0:
                        listener_stream_count = self._coerce_int(
                            capabilities.get("listener_streams", capabilities.get("listener_stream_sinks", 0)),
                            0,
                        )

                talker_profiles = self._resolve_avdecc_stream_profiles(entity, StreamDirection.TALKER)
                listener_profiles = self._resolve_avdecc_stream_profiles(entity, StreamDirection.LISTENER)
                if talker_stream_count <= 0 and talker_profiles:
                    talker_stream_count = len(talker_profiles)
                if listener_stream_count <= 0 and listener_profiles:
                    listener_stream_count = len(listener_profiles)

                # Register talker endpoints
                for i in range(max(0, talker_stream_count)):
                    stream_profile = (
                        talker_profiles[i]
                        if i < len(talker_profiles)
                        else {
                            "unique_id": i,
                            "channels": self._DEFAULT_AVDECC_CHANNELS,
                            "sample_rate": self._DEFAULT_AVDECC_SAMPLE_RATE,
                            "format": "24-bit PCM",
                        }
                    )
                    endpoint = AudioEndpoint(
                        entity_id=entity_id_str,
                        unique_id=self._coerce_int(stream_profile.get("unique_id", i), i),
                        direction=StreamDirection.TALKER,
                        device_type="avdecc",
                        device_name=titled_device_name,
                        channels=max(
                            1,
                            self._coerce_int(
                                stream_profile.get("channels"),
                                self._DEFAULT_AVDECC_CHANNELS,
                            ),
                        ),
                        sample_rate=max(
                            1,
                            self._coerce_int(
                                stream_profile.get("sample_rate"),
                                self._DEFAULT_AVDECC_SAMPLE_RATE,
                            ),
                        ),
                        format=str(stream_profile.get("format") or "24-bit PCM"),
                        mac_address=mac_address,
                        node_id=node_id,
                        node_address=node_address,
                        host=host_label,
                        available=available,
                        last_seen=datetime.now(timezone.utc)
                    )
                    self.endpoints[endpoint.endpoint_id()] = endpoint

                # Register listener endpoints
                for i in range(max(0, listener_stream_count)):
                    stream_profile = (
                        listener_profiles[i]
                        if i < len(listener_profiles)
                        else {
                            "unique_id": i,
                            "channels": self._DEFAULT_AVDECC_CHANNELS,
                            "sample_rate": self._DEFAULT_AVDECC_SAMPLE_RATE,
                            "format": "24-bit PCM",
                        }
                    )
                    endpoint = AudioEndpoint(
                        entity_id=entity_id_str,
                        unique_id=self._coerce_int(stream_profile.get("unique_id", i), i),
                        direction=StreamDirection.LISTENER,
                        device_type="avdecc",
                        device_name=titled_device_name,
                        channels=max(
                            1,
                            self._coerce_int(
                                stream_profile.get("channels"),
                                self._DEFAULT_AVDECC_CHANNELS,
                            ),
                        ),
                        sample_rate=max(
                            1,
                            self._coerce_int(
                                stream_profile.get("sample_rate"),
                                self._DEFAULT_AVDECC_SAMPLE_RATE,
                            ),
                        ),
                        format=str(stream_profile.get("format") or "24-bit PCM"),
                        mac_address=mac_address,
                        node_id=node_id,
                        node_address=node_address,
                        host=host_label,
                        available=available,
                        last_seen=datetime.now(timezone.utc)
                    )
                    self.endpoints[endpoint.endpoint_id()] = endpoint

        except Exception as e:
            logger.error(f"AVDECC discovery error: {e}")

    @staticmethod
    def _endpoint_sort_key(endpoint: AudioEndpoint) -> Tuple[str, str, str, int]:
        """Build deterministic sort key for endpoint pairing decisions."""
        try:
            unique_id = int(endpoint.unique_id)
        except Exception:
            unique_id = 0
        return (
            str(endpoint.node_id or "").strip().lower(),
            str(endpoint.device_type or "").strip().lower(),
            str(endpoint.entity_id or "").strip().lower(),
            unique_id,
        )

    def _auto_connect_pair_allowed(self, talker: AudioEndpoint, listener: AudioEndpoint) -> bool:
        """Validate a safe deterministic pair candidate for startup auto-connect."""
        if talker.direction != StreamDirection.TALKER:
            return False
        if listener.direction != StreamDirection.LISTENER:
            return False
        if not talker.available or not listener.available:
            return False
        if talker.endpoint_id() == listener.endpoint_id():
            return False
        if self._resolve_endpoint_node_id(talker) == self._resolve_endpoint_node_id(listener):
            return False
        if self._coerce_int(talker.sample_rate, 0) != self._coerce_int(listener.sample_rate, 0):
            return False
        if self._coerce_int(talker.channels, 0) != self._coerce_int(listener.channels, 0):
            return False
        return True

    def _build_auto_connect_pairs(self) -> List[Tuple[str, str]]:
        """Build a deterministic one-to-one map of startup auto-connect candidates."""
        pairs: List[Tuple[str, str]] = []
        used_listeners: Set[str] = set()

        connected_talkers = {
            conn.talker.endpoint_id()
            for conn in self.connections.values()
            if conn.state in {ConnectionState.CONNECTED, ConnectionState.CONNECTING}
        }
        connected_listeners = {
            conn.listener.endpoint_id()
            for conn in self.connections.values()
            if conn.state in {ConnectionState.CONNECTED, ConnectionState.CONNECTING}
        }

        talkers = sorted(
            (ep for ep in self.get_talkers() if ep.available),
            key=self._endpoint_sort_key,
        )
        listeners = sorted(
            (ep for ep in self.get_listeners() if ep.available),
            key=self._endpoint_sort_key,
        )

        for talker in talkers:
            talker_id = talker.endpoint_id()
            if talker_id in connected_talkers:
                continue

            for listener in listeners:
                listener_id = listener.endpoint_id()
                if listener_id in connected_listeners or listener_id in used_listeners:
                    continue
                if not self._auto_connect_pair_allowed(talker, listener):
                    continue

                pairs.append((talker_id, listener_id))
                used_listeners.add(listener_id)
                break

        return pairs

    async def _auto_connect_once(self, *, attempt: int) -> Dict[str, Any]:
        """Run one auto-connect pass after refreshing endpoint discovery state."""
        await self._discover_map2_endpoints()
        await self._discover_avdecc_endpoints()
        await self._sync_engine_discovered_devices()

        pairs = self._build_auto_connect_pairs()
        summary: Dict[str, Any] = {
            "attempt": attempt,
            "enabled": True,
            "talkers": len([ep for ep in self.get_talkers() if ep.available]),
            "listeners": len([ep for ep in self.get_listeners() if ep.available]),
            "candidate_pairs": len(pairs),
            "connected": 0,
            "failed": 0,
            "already_connected": 0,
            "errors": [],
        }

        for talker_id, listener_id in pairs:
            conn_id = f"{talker_id}→{listener_id}"
            existing = self.connections.get(conn_id)
            if existing and existing.state in {ConnectionState.CONNECTED, ConnectionState.CONNECTING}:
                summary["already_connected"] += 1
                continue

            try:
                result = await self.connect(
                    talker_id,
                    listener_id,
                    return_details=True,
                )
                if isinstance(result, dict) and result.get("success"):
                    summary["connected"] += 1
                else:
                    summary["failed"] += 1
                    if isinstance(result, dict):
                        reason = str(result.get("reason") or "unknown")
                        summary["errors"].append(f"{conn_id}: {reason}")
                    else:
                        summary["errors"].append(f"{conn_id}: connection failed")
            except Exception as exc:
                summary["failed"] += 1
                summary["errors"].append(f"{conn_id}: {exc}")

        return summary

    async def _auto_connect_startup(self) -> None:
        """Best-effort startup orchestration controlled by avb.auto_connect config."""
        attempts = max(1, self._coerce_int(config_get("avb.auto_connect.startup_attempts", 3), 3))
        retry_delay_ms = max(0, self._coerce_int(config_get("avb.auto_connect.retry_delay_ms", 2000), 2000))

        for attempt in range(1, attempts + 1):
            if not self._running or not self._is_auto_connect_enabled():
                return

            self._auto_connect_runs += 1
            try:
                summary = await self._auto_connect_once(attempt=attempt)
                self._last_auto_connect_summary = summary
                self._last_auto_connect_error = None
                logger.info(
                    "AVB auto-connect attempt %s/%s: talkers=%s listeners=%s candidates=%s connected=%s failed=%s",
                    attempt,
                    attempts,
                    summary.get("talkers", 0),
                    summary.get("listeners", 0),
                    summary.get("candidate_pairs", 0),
                    summary.get("connected", 0),
                    summary.get("failed", 0),
                )
                if summary.get("connected", 0) > 0 or summary.get("already_connected", 0) > 0:
                    return
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self._last_auto_connect_error = str(exc)
                logger.warning("AVB auto-connect attempt %s/%s failed: %s", attempt, attempts, exc)

            if attempt < attempts:
                await asyncio.sleep(retry_delay_ms / 1000.0)

    async def _cleanup_loop(self):
        """Remove stale endpoints"""
        while self._running:
            await asyncio.sleep(30)  # Cleanup every 30 seconds
            self._cleanup_cycles += 1

            try:
                now = datetime.now(timezone.utc)
                stale_threshold = timedelta(seconds=60)

                stale_endpoints = [
                    endpoint_id
                    for endpoint_id, endpoint in self.endpoints.items()
                    if now - endpoint.last_seen > stale_threshold
                ]

                for endpoint_id in stale_endpoints:
                    logger.info(f"Removing stale endpoint: {endpoint_id}")
                    del self.endpoints[endpoint_id]
                self._stale_removed_total += len(stale_endpoints)
                if stale_endpoints:
                    await self._sync_engine_discovered_devices()
                self._last_cleanup_error = None

            except Exception as e:
                logger.error(f"Cleanup error: {e}")
                self._last_cleanup_error = str(e)

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
            host = (parsed.hostname or "").strip()
            if host:
                return host
        except Exception:
            pass

        normalized = str(node_address).strip().split("/", 1)[0].split("@")[-1]
        return normalized.split(":", 1)[0].strip()

    @staticmethod
    def _coerce_optional_text(value: Any) -> Optional[str]:
        """Normalize optional text fields to non-empty strings."""
        if value is None:
            return None
        parsed = str(value).strip()
        return parsed or None

    def _resolve_endpoint_node_id(self, endpoint: AudioEndpoint) -> str:
        """Resolve deterministic endpoint node id from explicit id, host, or address."""
        node_id = self._coerce_optional_text(endpoint.node_id)
        if node_id:
            return node_id

        host = self._coerce_optional_text(endpoint.host) or self._coerce_optional_text(
            self._parse_host(endpoint.node_address)
        )
        if host:
            return host

        return "local"

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
                owner_node_id=self._coerce_optional_text(stream_config.get("owner_node_id")),
                peer_node_id=self._coerce_optional_text(stream_config.get("peer_node_id")),
                owner_endpoint_id=self._coerce_optional_text(stream_config.get("owner_endpoint_id")),
                peer_endpoint_id=self._coerce_optional_text(stream_config.get("peer_endpoint_id")),
                talker_node_id=self._coerce_optional_text(stream_config.get("talker_node_id")),
                listener_node_id=self._coerce_optional_text(stream_config.get("listener_node_id")),
                talker_endpoint_id=self._coerce_optional_text(stream_config.get("talker_endpoint_id")),
                listener_endpoint_id=self._coerce_optional_text(stream_config.get("listener_endpoint_id")),
                connection_role=self._normalize_connection_role(stream_config.get("connection_role")),
                loop_id=self._coerce_optional_text(stream_config.get("loop_id")),
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
        connection_role: str = "general_route",
        loop_id: Optional[str] = None,
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
        trace_id = self._new_flow_trace_id("connect")
        result: Dict[str, Any] = {"success": False, "trace_id": trace_id}
        self._record_flow_stage(
            result=result,
            trace_id=trace_id,
            stage="connect.start",
            status="ok",
            detail=f"{talker_id}->{listener_id}",
        )
        talker = self.endpoints.get(talker_id)
        listener = self.endpoints.get(listener_id)

        if not talker or not listener:
            if reservation_id:
                warning = await self._release_rejected_reservation(reservation_id, talker_id, listener_id)
                if warning is not None:
                    result["srp_release_warning"] = warning
            logger.error(f"Endpoint not found: talker={talker_id}, listener={listener_id}")
            result["reason"] = "Endpoint not found"
            self._record_flow_stage(
                result=result,
                trace_id=trace_id,
                stage="connect.validate_endpoints",
                status="error",
                detail=result["reason"],
            )
            return result if return_details else False

        if talker.direction != StreamDirection.TALKER:
            if reservation_id:
                warning = await self._release_rejected_reservation(reservation_id, talker_id, listener_id)
                if warning is not None:
                    result["srp_release_warning"] = warning
            logger.error(f"Not a talker: {talker_id}")
            result["reason"] = "Not a talker"
            self._record_flow_stage(
                result=result,
                trace_id=trace_id,
                stage="connect.validate_talker",
                status="error",
                detail=result["reason"],
            )
            return result if return_details else False

        if listener.direction != StreamDirection.LISTENER:
            if reservation_id:
                warning = await self._release_rejected_reservation(reservation_id, talker_id, listener_id)
                if warning is not None:
                    result["srp_release_warning"] = warning
            logger.error(f"Not a listener: {listener_id}")
            result["reason"] = "Not a listener"
            self._record_flow_stage(
                result=result,
                trace_id=trace_id,
                stage="connect.validate_listener",
                status="error",
                detail=result["reason"],
            )
            return result if return_details else False

        self._record_flow_stage(
            result=result,
            trace_id=trace_id,
            stage="connect.validate_endpoints",
            status="ok",
        )

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
                    self._record_flow_stage(
                        result=result,
                        trace_id=trace_id,
                        stage="connect.srp_admit",
                        status="error",
                        detail=result["reason"],
                    )
                    return result if return_details else False
                if admission.decision == "allowed":
                    if not admission.reservation_id:
                        message = "SRP admission returned allowed without reservation_id"
                        if bool(config_get("avb.srp.required", True)):
                            logger.error(
                                "SRP admission for %s returned allowed without reservation_id",
                                f"{talker_id}->{listener_id}",
                            )
                            result["reason"] = message
                            self._record_flow_stage(
                                result=result,
                                trace_id=trace_id,
                                stage="connect.srp_admit",
                                status="error",
                                detail=result["reason"],
                            )
                            return result if return_details else False
                        logger.warning(
                            "SRP admission optional for %s returned allowed without reservation_id",
                            f"{talker_id}->{listener_id}",
                        )
                        self._record_flow_stage(
                            result=result,
                            trace_id=trace_id,
                            stage="connect.srp_admit",
                            status="warning",
                            detail=message,
                        )
                    else:
                        reservation_id = admission.reservation_id
                        admission_id = admission.admission_id
                        self._record_flow_stage(
                            result=result,
                            trace_id=trace_id,
                            stage="connect.srp_admit",
                            status="ok",
                            detail=f"allowed reservation={reservation_id}",
                        )
                elif admission.decision == "bypass":
                    # Preserve optional bypass and prevent redundant re-admission.
                    reservation_id = ""
                    self._record_flow_stage(
                        result=result,
                        trace_id=trace_id,
                        stage="connect.srp_admit",
                        status="ok",
                        detail="bypass",
                    )
                else:
                    result["reason"] = f"Unexpected SRP admission decision: {admission.decision}"
                    self._record_flow_stage(
                        result=result,
                        trace_id=trace_id,
                        stage="connect.srp_admit",
                        status="error",
                        detail=result["reason"],
                    )
                    return result if return_details else False
            except Exception as exc:
                logger.error("SRP admission error for %s: %s", f"{talker_id}->{listener_id}", exc)
                if bool(config_get("avb.srp.required", True)):
                    result["reason"] = f"SRP admission error: {exc}"
                    self._record_flow_stage(
                        result=result,
                        trace_id=trace_id,
                        stage="connect.srp_admit",
                        status="error",
                        detail=result["reason"],
                    )
                    return result if return_details else False
        else:
            self._record_flow_stage(
                result=result,
                trace_id=trace_id,
                stage="connect.srp_admit",
                status="skipped",
            )

        # Create connection
        normalized_role = self._normalize_connection_role(connection_role)
        connection = StreamConnection(
            talker=talker,
            listener=listener,
            state=ConnectionState.CONNECTING,
            srp_reservation_id=reservation_id,
            srp_admission_id=admission_id,
            flow_trace_id=trace_id,
            connection_role=normalized_role,
            loop_id=self._coerce_optional_text(loop_id),
        )

        conn_id = connection.connection_id()
        self.connections[conn_id] = connection

        # Dispatch to appropriate handler
        self._record_flow_stage(
            result=result,
            trace_id=trace_id,
            stage="connect.dispatch",
            status="ok",
            detail=f"{talker.device_type}->{listener.device_type}",
        )
        if talker.device_type == "map2" and listener.device_type == "map2":
            success = await self._connect_map2_to_map2(connection)
        elif talker.device_type == "avdecc" or listener.device_type == "avdecc":
            success = await self._connect_via_avdecc(connection)
        elif "tesira" in (talker.device_type, listener.device_type):
            success = await self._connect_tesira_route(connection)
        else:
            logger.error(f"Unsupported connection type: {talker.device_type} → {listener.device_type}")
            success = False
            self._record_flow_stage(
                result=result,
                trace_id=trace_id,
                stage="connect.dispatch",
                status="error",
                detail="Unsupported connection type",
            )

        if success:
            connection.state = ConnectionState.CONNECTED
            connection.established_time = datetime.now(timezone.utc)
            # T2496-2 — write the durable AvbBinding row before reporting
            # success. Defensive: a DB failure logs a warning but does
            # NOT fail the connection (the router stays operational).
            try:
                from app.services.avb.router_authority_writer import (
                    record_connection_in_authority,
                )

                connection.authority_binding_id = (
                    await record_connection_in_authority(connection)
                )
                self._record_flow_stage(
                    result=result,
                    trace_id=trace_id,
                    stage="connect.authority_record",
                    status="ok" if connection.authority_binding_id else "warning",
                    detail=connection.authority_binding_id or "no binding_id returned",
                )
            except Exception as auth_exc:  # noqa: BLE001 — defensive
                logger.warning(
                    "AvbRouter: authority_record raised for %s: %s",
                    conn_id,
                    auth_exc,
                )
                self._record_flow_stage(
                    result=result,
                    trace_id=trace_id,
                    stage="connect.authority_record",
                    status="warning",
                    detail=str(auth_exc),
                )
            logger.info(f"Connected: {conn_id}")
            result["success"] = True
            result["connection_id"] = conn_id
            result["connection_role"] = connection.connection_role
            result["loop_id"] = connection.loop_id
            if connection.authority_binding_id:
                result["authority_binding_id"] = connection.authority_binding_id
            self._record_flow_stage(
                result=result,
                trace_id=trace_id,
                stage="connect.complete",
                status="ok",
                detail=conn_id,
            )
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
                        self._record_flow_stage(
                            result=result,
                            trace_id=trace_id,
                            stage="connect.rollback_release",
                            status="warning",
                            detail=reservation_to_release,
                        )
                    else:
                        self._record_flow_stage(
                            result=result,
                            trace_id=trace_id,
                            stage="connect.rollback_release",
                            status="ok",
                            detail=reservation_to_release,
                        )
                except Exception as exc:
                    logger.warning("SRP rollback release failed for %s: %s", conn_id, exc)
                    result["srp_release_warning"] = _build_srp_release_warning(
                        reason="Router connect failed and SRP rollback release failed",
                        reservation_id=reservation_to_release,
                        detail=exc,
                    )
                    self._record_flow_stage(
                        result=result,
                        trace_id=trace_id,
                        stage="connect.rollback_release",
                        status="warning",
                        detail=str(exc),
                    )
            else:
                self._record_flow_stage(
                    result=result,
                    trace_id=trace_id,
                    stage="connect.rollback_release",
                    status="skipped",
                )
            connection.state = ConnectionState.ERROR
            connection.error_message = "Connection failed"
            logger.error(f"Connection failed: {conn_id}")
            result["reason"] = "Connection failed"
            self._record_flow_stage(
                result=result,
                trace_id=trace_id,
                stage="connect.complete",
                status="error",
                detail=result["reason"],
            )

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
        trace_id = self._new_flow_trace_id("disconnect")
        conn_id = f"{talker_id}→{listener_id}"
        connection = self.connections.get(conn_id)
        result: Dict[str, Any] = {"success": False, "trace_id": trace_id}
        self._record_flow_stage(
            result=result,
            trace_id=trace_id,
            stage="disconnect.start",
            status="ok",
            detail=conn_id,
        )

        if not connection:
            logger.warning(f"Connection not found: {conn_id}")
            self._record_flow_stage(
                result=result,
                trace_id=trace_id,
                stage="disconnect.lookup",
                status="error",
                detail="Connection not found",
            )
            return result if return_details else False

        self._record_flow_stage(
            result=result,
            trace_id=trace_id,
            stage="disconnect.lookup",
            status="ok",
        )
        connection.state = ConnectionState.DISCONNECTING
        connection.flow_trace_id = trace_id

        # Dispatch to appropriate handler
        self._record_flow_stage(
            result=result,
            trace_id=trace_id,
            stage="disconnect.dispatch",
            status="ok",
            detail=f"{connection.talker.device_type}->{connection.listener.device_type}",
        )
        if connection.talker.device_type == "map2" and connection.listener.device_type == "map2":
            success = await self._disconnect_map2_to_map2(connection)
        elif connection.talker.device_type == "avdecc" or connection.listener.device_type == "avdecc":
            success = await self._disconnect_via_avdecc(connection)
        elif "tesira" in (connection.talker.device_type, connection.listener.device_type):
            success = await self._disconnect_tesira_route(connection)
        else:
            success = False
            self._record_flow_stage(
                result=result,
                trace_id=trace_id,
                stage="disconnect.dispatch",
                status="error",
                detail="Unsupported connection type",
            )

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
                        self._record_flow_stage(
                            result=result,
                            trace_id=trace_id,
                            stage="disconnect.release_srp",
                            status="warning",
                            detail=reservation_id,
                        )
                    else:
                        self._record_flow_stage(
                            result=result,
                            trace_id=trace_id,
                            stage="disconnect.release_srp",
                            status="ok",
                            detail=reservation_id,
                        )
                except Exception as exc:
                    logger.warning("SRP release raised for %s: %s", conn_id, exc)
                    result["srp_release_warning"] = _build_srp_release_warning(
                        reason="Router disconnect succeeded but SRP reservation release failed",
                        reservation_id=reservation_id,
                        detail=exc,
                    )
                    self._record_flow_stage(
                        result=result,
                        trace_id=trace_id,
                        stage="disconnect.release_srp",
                        status="warning",
                        detail=str(exc),
                    )
            else:
                self._record_flow_stage(
                    result=result,
                    trace_id=trace_id,
                    stage="disconnect.release_srp",
                    status="skipped",
                )
            # T2496-2 — clear the durable AvbBinding row before dropping
            # the in-memory connection. Defensive: a DB failure logs a
            # warning but does NOT fail the disconnect.
            try:
                from app.services.avb.router_authority_writer import (
                    clear_connection_in_authority,
                )

                cleared = await clear_connection_in_authority(conn_id)
                self._record_flow_stage(
                    result=result,
                    trace_id=trace_id,
                    stage="disconnect.authority_clear",
                    status="ok",
                    detail=f"rows_deleted={cleared}",
                )
                if cleared:
                    result["authority_rows_cleared"] = cleared
            except Exception as auth_exc:  # noqa: BLE001 — defensive
                logger.warning(
                    "AvbRouter: authority_clear raised for %s: %s",
                    conn_id,
                    auth_exc,
                )
                self._record_flow_stage(
                    result=result,
                    trace_id=trace_id,
                    stage="disconnect.authority_clear",
                    status="warning",
                    detail=str(auth_exc),
                )
            del self.connections[conn_id]
            logger.info(f"Disconnected: {conn_id}")
            result["success"] = True
            result["connection_role"] = connection.connection_role
            result["loop_id"] = connection.loop_id
            self._record_flow_stage(
                result=result,
                trace_id=trace_id,
                stage="disconnect.complete",
                status="ok",
                detail=conn_id,
            )
        else:
            connection.state = ConnectionState.ERROR
            connection.error_message = "Disconnection failed"
            logger.error(f"Disconnection failed: {conn_id}")
            self._record_flow_stage(
                result=result,
                trace_id=trace_id,
                stage="disconnect.complete",
                status="error",
                detail="Disconnection failed",
            )

        return result if return_details else success

    # ========================================================================
    # MAP2-to-MAP2 Connections
    # ========================================================================

    async def _connect_map2_to_map2(self, connection: StreamConnection) -> bool:
        """Connect two MAP2 nodes directly"""
        try:
            trace_id = connection.flow_trace_id
            interface = config_get("avb.interface", "")
            buffer_size = int(config_get("audio.buffer_size", 256))
            priority = int(config_get("avb.stream_priority", 3))
            talker_endpoint_id = connection.talker.endpoint_id()
            listener_endpoint_id = connection.listener.endpoint_id()
            talker_node_id = self._resolve_endpoint_node_id(connection.talker)
            listener_node_id = self._resolve_endpoint_node_id(connection.listener)

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
                "owner_node_id": talker_node_id,
                "peer_node_id": listener_node_id,
                "owner_endpoint_id": talker_endpoint_id,
                "peer_endpoint_id": listener_endpoint_id,
                "talker_node_id": talker_node_id,
                "listener_node_id": listener_node_id,
                "talker_endpoint_id": talker_endpoint_id,
                "listener_endpoint_id": listener_endpoint_id,
                "connection_role": connection.connection_role,
                "loop_id": connection.loop_id,
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
                "owner_node_id": listener_node_id,
                "peer_node_id": talker_node_id,
                "owner_endpoint_id": listener_endpoint_id,
                "peer_endpoint_id": talker_endpoint_id,
                "talker_node_id": talker_node_id,
                "listener_node_id": listener_node_id,
                "talker_endpoint_id": talker_endpoint_id,
                "listener_endpoint_id": listener_endpoint_id,
                "connection_role": connection.connection_role,
                "loop_id": connection.loop_id,
            }

            async def _provision_talker() -> Tuple[bool, str]:
                return await self._provision_map2_stream(connection.talker, talker_config)

            talker_ok, talker_error = await self._execute_with_backoff_retry(
                operation=f"talker provision {connection.talker.endpoint_id()}",
                action=_provision_talker,
                trace_id=trace_id,
            )
            if not talker_ok:
                connection.error_message = f"talker provision failed: {talker_error}"
                return False

            async def _provision_listener() -> Tuple[bool, str]:
                return await self._provision_map2_stream(connection.listener, listener_config)

            listener_ok, listener_error = await self._execute_with_backoff_retry(
                operation=f"listener provision {connection.listener.endpoint_id()}",
                action=_provision_listener,
                trace_id=trace_id,
            )
            if not listener_ok:
                # Roll back talker if listener provisioning failed.
                async def _rollback_talker() -> Tuple[bool, str]:
                    return await self._deprovision_map2_stream(connection.talker, str(talker_config["stream_id"]))

                rollback_ok, rollback_error = await self._execute_with_backoff_retry(
                    operation=f"talker rollback {connection.talker.endpoint_id()}",
                    action=_rollback_talker,
                    trace_id=trace_id,
                )
                if rollback_ok:
                    connection.error_message = f"listener provision failed: {listener_error}"
                else:
                    connection.error_message = (
                        f"listener provision failed: {listener_error}; "
                        f"talker rollback failed: {rollback_error}"
                    )
                return False

            return True

        except Exception as e:
            logger.error(f"MAP2-to-MAP2 connection error: {e}")
            return False

    async def _disconnect_map2_to_map2(self, connection: StreamConnection) -> bool:
        """Disconnect two MAP2 nodes"""
        try:
            trace_id = connection.flow_trace_id
            talker_stream_id = self._build_stream_id(connection.talker, connection.listener, "talker")
            listener_stream_id = self._build_stream_id(connection.listener, connection.talker, "listener")

            async def _deprovision_talker() -> Tuple[bool, str]:
                return await self._deprovision_map2_stream(connection.talker, talker_stream_id)

            async def _deprovision_listener() -> Tuple[bool, str]:
                return await self._deprovision_map2_stream(connection.listener, listener_stream_id)

            # Attempt both sides even if one fails, so cleanup remains best-effort.
            talker_ok, talker_error = await self._execute_with_backoff_retry(
                operation=f"talker deprovision {connection.talker.endpoint_id()}",
                action=_deprovision_talker,
                trace_id=trace_id,
            )
            listener_ok, listener_error = await self._execute_with_backoff_retry(
                operation=f"listener deprovision {connection.listener.endpoint_id()}",
                action=_deprovision_listener,
                trace_id=trace_id,
            )

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

    async def _connect_tesira_route(self, connection: StreamConnection) -> bool:
        """
        Handle an AVB connection where one endpoint is a Tesira device.
        The Tesira side manages its own stream attach via DSP template tags;
        MAP2 side still needs explicit stream provisioning.
        """
        try:
            tesira_ep = (
                connection.talker
                if connection.talker.device_type == "tesira"
                else connection.listener
            )
            map2_ep = (
                connection.listener
                if connection.talker.device_type == "tesira"
                else connection.talker
            )

            if map2_ep.device_type != "map2":
                connection.error_message = "Tesira routing requires one MAP2 endpoint"
                return False

            if not bool(getattr(connection.talker, "available", True)) or not bool(
                getattr(connection.listener, "available", True)
            ):
                connection.error_message = "Endpoint unavailable"
                return False

            talker_rate = int(connection.talker.sample_rate or 0)
            listener_rate = int(connection.listener.sample_rate or 0)
            if talker_rate <= 0 or listener_rate <= 0 or talker_rate != listener_rate:
                connection.error_message = "Sample-rate mismatch between Tesira and MAP2 endpoints"
                return False

            channels = min(int(connection.talker.channels or 0), int(connection.listener.channels or 0))
            if channels <= 0 or channels > 8:
                connection.error_message = "Unsupported channel count for Tesira loop route"
                return False

            try:
                from app.services.avb import get_avb_readiness

                readiness = get_avb_readiness()
                checks = readiness.get("checks", {}) if isinstance(readiness, dict) else {}
                if not bool(checks.get("ptp4l_running", False)):
                    connection.error_message = "PTP lock prerequisite failed (ptp4l not running)"
                    return False
            except Exception as exc:
                logger.debug("Tesira preflight readiness probe skipped: %s", exc)

            stream_direction = str(getattr(map2_ep.direction, "value", map2_ep.direction))
            if stream_direction not in {"talker", "listener"}:
                connection.error_message = "Unsupported MAP2 endpoint direction for Tesira route"
                return False

            stream_id = self._build_stream_id(
                map2_ep,
                tesira_ep,
                "tesira-listener" if stream_direction == "listener" else "tesira-talker",
            )
            stream_config = {
                "stream_id": stream_id,
                "direction": stream_direction,
                "channels": channels,
                "sample_rate": talker_rate,
                "buffer_size": int(config_get("audio.buffer_size", 256)),
                "interface": str(config_get("avb.interface", "") or ""),
                "dest_mac": tesira_ep.mac_address or "91:e0:f0:00:fe:01",
                "presentation_offset_us": 2000,
                "priority": int(config_get("avb.stream_priority", 3)),
                "owner_node_id": self._resolve_endpoint_node_id(map2_ep),
                "peer_node_id": self._resolve_endpoint_node_id(tesira_ep),
                "owner_endpoint_id": map2_ep.endpoint_id(),
                "peer_endpoint_id": tesira_ep.endpoint_id(),
                "talker_node_id": self._resolve_endpoint_node_id(connection.talker),
                "listener_node_id": self._resolve_endpoint_node_id(connection.listener),
                "talker_endpoint_id": connection.talker.endpoint_id(),
                "listener_endpoint_id": connection.listener.endpoint_id(),
                "connection_role": connection.connection_role,
                "loop_id": connection.loop_id,
            }

            async def _provision_map2_side() -> Tuple[bool, str]:
                return await self._provision_map2_stream(map2_ep, stream_config)

            provisioned, error = await self._execute_with_backoff_retry(
                operation=f"tesira map2 provision {map2_ep.endpoint_id()}",
                action=_provision_map2_side,
                trace_id=connection.flow_trace_id,
            )
            if not provisioned:
                connection.error_message = f"MAP2 stream provision failed: {error}"
                return False

            logger.info(
                "Tesira AVB bridge provisioned: %s(%s) ↔ map2(%s) role=%s loop_id=%s",
                tesira_ep.device_name,
                tesira_ep.direction,
                map2_ep.device_name,
                connection.connection_role,
                connection.loop_id,
            )
            return True
        except Exception as exc:
            logger.error("_connect_tesira_route error: %s", exc)
            connection.error_message = str(exc)
            return False

    async def _disconnect_tesira_route(self, connection: StreamConnection) -> bool:
        """Disconnect Tesira bridge by deprovisioning MAP2 side stream."""
        try:
            tesira_ep = (
                connection.talker
                if connection.talker.device_type == "tesira"
                else connection.listener
            )
            map2_ep = (
                connection.listener
                if connection.talker.device_type == "tesira"
                else connection.talker
            )
            if map2_ep.device_type != "map2":
                return True

            stream_direction = str(getattr(map2_ep.direction, "value", map2_ep.direction))
            stream_id = self._build_stream_id(
                map2_ep,
                tesira_ep,
                "tesira-listener" if stream_direction == "listener" else "tesira-talker",
            )

            async def _deprovision_map2_side() -> Tuple[bool, str]:
                return await self._deprovision_map2_stream(map2_ep, stream_id)

            removed, error = await self._execute_with_backoff_retry(
                operation=f"tesira map2 deprovision {map2_ep.endpoint_id()}",
                action=_deprovision_map2_side,
                trace_id=connection.flow_trace_id,
            )
            if not removed:
                connection.error_message = f"MAP2 stream deprovision failed: {error}"
                return False
            return True
        except Exception as exc:
            connection.error_message = str(exc)
            logger.error("_disconnect_tesira_route error: %s", exc)
            return False

    async def _connect_via_avdecc(self, connection: StreamConnection) -> bool:
        """Connect using AVDECC ACMP protocol"""
        if not self.avdecc_entity:
            return False

        try:
            connect_fn = self._resolve_avdecc_callable(("connectStream", "connect_stream"))
            if connect_fn is None:
                return False

            talker_entity_id = int(connection.talker.entity_id, 16)
            listener_entity_id = int(connection.listener.entity_id, 16)

            # Send ACMP CONNECT_TX_COMMAND
            success = connect_fn(
                talker_entity_id,
                connection.talker.unique_id,
                listener_entity_id,
                connection.listener.unique_id
            )
            if inspect.isawaitable(success):
                success = await success

            return bool(success)

        except Exception as e:
            logger.error(f"AVDECC connection error: {e}")
            return False

    async def _disconnect_via_avdecc(self, connection: StreamConnection) -> bool:
        """Disconnect using AVDECC ACMP protocol"""
        if not self.avdecc_entity:
            return False

        try:
            disconnect_fn = self._resolve_avdecc_callable(("disconnectStream", "disconnect_stream"))
            if disconnect_fn is None:
                return False

            talker_entity_id = int(connection.talker.entity_id, 16)
            listener_entity_id = int(connection.listener.entity_id, 16)

            # Send ACMP DISCONNECT_TX_COMMAND
            success = disconnect_fn(
                talker_entity_id,
                connection.talker.unique_id,
                listener_entity_id,
                connection.listener.unique_id
            )
            if inspect.isawaitable(success):
                success = await success

            return bool(success)

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
                "avdecc": len([ep for ep in self.endpoints.values() if ep.device_type == "avdecc"]),
                "tesira": len([ep for ep in self.endpoints.values() if ep.device_type == "tesira"]),
            },
            "connections": {
                "total": len(self.connections),
                "connected": len([c for c in self.connections.values() if c.state == ConnectionState.CONNECTED]),
                "connecting": len([c for c in self.connections.values() if c.state == ConnectionState.CONNECTING]),
                "error": len([c for c in self.connections.values() if c.state == ConnectionState.ERROR])
            },
            "auto_connect": {
                "enabled": self._is_auto_connect_enabled(),
                "task_running": self._auto_connect_task is not None and not self._auto_connect_task.done(),
                "runs": self._auto_connect_runs,
                "last_error": self._last_auto_connect_error,
                "last_summary": self._last_auto_connect_summary,
            },
            "loops": {
                "running": self._running,
                "discovery_running": self._discovery_task is not None and not self._discovery_task.done(),
                "cleanup_running": self._cleanup_task is not None and not self._cleanup_task.done(),
                "discovery_cycles": self._discovery_cycles,
                "cleanup_cycles": self._cleanup_cycles,
                "stale_removed_total": self._stale_removed_total,
                "last_discovery_error": self._last_discovery_error,
                "last_cleanup_error": self._last_cleanup_error,
            },
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

    # Engine-level AVDECC APIs exposed by pybind bindings.
    if any(
        callable(getattr(engine, name, None))
        for name in (
            "getDiscoveredEntities",
            "get_discovered_entities",
            "get_avdecc_entities",
            "connectStream",
            "connect_stream",
            "disconnectStream",
            "disconnect_stream",
        )
    ):
        return engine

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



# ──────────────────────────────────────────────────────────────────────────────
# Tesira AVB endpoint registration helper
# ──────────────────────────────────────────────────────────────────────────────

def register_tesira_endpoint(router, device_id: str, stream_info) -> None:
    """
    Create and register an AudioEndpoint for one Tesira AVB stream.

    Called by TesiraFleet._register_endpoints() for each discovered stream.
    The endpoint appears in GET /api/avb/router/endpoints as device_type='tesira'
    and in the AvbRoutingApp NodeTree as a 'tesira' node.
    """
    try:
        direction = (
            StreamDirection.TALKER
            if stream_info.direction == 'talker'
            else StreamDirection.LISTENER
        )
        endpoint = AudioEndpoint(
            entity_id=stream_info.entity_id,
            unique_id=stream_info.stream_index,
            direction=direction,
            device_type="tesira",
            device_name=stream_info.name,
            channels=stream_info.channels,
            sample_rate=48000,
            node_id=f"tesira_{device_id}",
            node_address=None,
            host=device_id,
            available=True,
        )
        router.endpoints[endpoint.endpoint_id()] = endpoint
        logger.debug(
            "Registered Tesira endpoint: %s (%s, %dch)",
            endpoint.device_name, stream_info.direction, stream_info.channels,
        )
    except Exception as exc:
        logger.warning("register_tesira_endpoint error: %s", exc)

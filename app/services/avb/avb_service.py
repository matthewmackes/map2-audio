"""
AVB Stream Management Service

Manages AVB/TSN audio streams:
- Stream creation/deletion
- Stream status monitoring
- Integration with JUCE audio engine
- Cluster-aware stream routing
"""

import logging
from typing import Dict, List, Optional, Any, Tuple
from urllib.parse import urlparse
from dataclasses import dataclass, asdict, field
from enum import Enum

logger = logging.getLogger(__name__)


class StreamDirection(Enum):
    """AVB stream direction"""
    TALKER = "talker"
    LISTENER = "listener"


class StreamState(Enum):
    """AVB stream state"""
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    ERROR = "error"


@dataclass
class AvbStreamConfig:
    """AVB stream configuration"""
    stream_id: str
    direction: StreamDirection
    channels: int
    sample_rate: int
    buffer_size: int
    interface: str
    dest_mac: Optional[str] = None  # For talkers
    presentation_offset_us: int = 2000
    priority: int = 3  # 802.1Q SR Class A
    failover_policy: str = "none"
    failover_interfaces: List[str] = field(default_factory=list)
    srp_reservation_id: Optional[str] = None
    srp_admission_id: Optional[str] = None
    srp_metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AvbStreamStats:
    """AVB stream statistics"""
    frames_sent: int = 0
    frames_received: int = 0
    send_errors: int = 0
    receive_errors: int = 0
    underruns: int = 0
    overruns: int = 0
    timestamp_errors: int = 0
    sequence_errors: int = 0
    bytes_transferred: int = 0
    max_latency_ns: int = 0
    min_latency_ns: int = 0


@dataclass
class AvbStreamInfo:
    """Complete AVB stream information"""
    stream_id: str
    direction: StreamDirection
    state: StreamState
    config: AvbStreamConfig
    stats: AvbStreamStats
    error: Optional[str] = None


class AvbService:
    """
    AVB Stream Management Service

    Singleton service for managing AVB audio streams.
    Integrates with JUCE audio engine for actual stream I/O.
    """

    def __init__(self):
        self.streams: Dict[str, AvbStreamInfo] = {}
        self._srp_bindings: Dict[str, Dict[str, Any]] = {}
        self._engine = None  # Will be set by juce_engine_service

    def set_engine(self, engine):
        """Set JUCE audio engine reference"""
        self._engine = engine

    def _ensure_engine_bound(self) -> None:
        """Lazily bind to JUCE engine if available."""
        if self._engine is not None:
            return

        try:
            from app.services.juce_engine_service import get_audio_engine

            engine_service = get_audio_engine()
            engine = getattr(engine_service, "_engine", None)
            if engine is not None:
                self._engine = engine
        except Exception as e:
            logger.debug(f"AVB engine bind skipped: {e}")

    def is_available(self) -> bool:
        """
        Check if AVB is available.

        Returns False if:
        - Engine not initialized
        - AVB not enabled in config
        - No AVB hardware
        - ptp4l not running
        """
        self._ensure_engine_bound()

        if self._engine is None:
            return False

        try:
            # Check if engine has AVB support (compiled with USE_AVB=ON).
            # Prefer snake_case contract, keep camelCase for compatibility.
            for method_name in ("is_avb_available", "isAvbAvailable"):
                method = getattr(self._engine, method_name, None)
                if callable(method):
                    return bool(method())
            return False
        except Exception as e:
            logger.debug(f"AVB availability check failed: {e}")
            return False

    def _call_engine_stream_api(
        self,
        method_candidates: List[str],
        *args: Any,
    ) -> Tuple[bool, bool, Optional[str]]:
        """
        Try calling a stream-related engine method by candidate names.

        Returns:
            (method_found, success, error_message)
        """
        self._ensure_engine_bound()
        if self._engine is None:
            return False, False, "Engine not initialized"

        for method_name in method_candidates:
            method = getattr(self._engine, method_name, None)
            if not callable(method):
                continue

            try:
                result = method(*args)

                if isinstance(result, bool):
                    return True, result, None if result else f"{method_name} returned False"

                if isinstance(result, dict):
                    if result.get("error"):
                        return True, False, str(result.get("error"))
                    if "success" in result:
                        ok = bool(result.get("success"))
                        return True, ok, None if ok else str(result.get("message", "engine call failed"))
                    return True, True, None

                if result is None:
                    return True, True, None

                ok = bool(result)
                return True, ok, None if ok else f"{method_name} returned falsy result"

            except Exception as exc:
                return True, False, str(exc)

        return False, False, None

    def _call_engine_stream_data_api(
        self,
        method_candidates: List[str],
        *args: Any,
    ) -> Tuple[bool, Optional[Any], Optional[str]]:
        """
        Try calling a stream-related engine method that returns data.

        Returns:
            (method_found, data, error_message)
        """
        self._ensure_engine_bound()
        if self._engine is None:
            return False, None, "Engine not initialized"

        for method_name in method_candidates:
            method = getattr(self._engine, method_name, None)
            if not callable(method):
                continue

            try:
                return True, method(*args), None
            except Exception as exc:
                return True, None, str(exc)

        return False, None, None

    @staticmethod
    def _missing_engine_stream_api_error(operation: str) -> Dict[str, Any]:
        """Standardized error payload for unavailable engine AVB stream hooks."""
        return {
            "error": f"Engine AVB stream {operation} API unavailable",
            "code": "ENGINE_METHOD_UNAVAILABLE",
        }

    @staticmethod
    def _engine_not_ready_error(message: Optional[str]) -> Dict[str, Any]:
        """Standardized error payload when JUCE engine is not ready."""
        return {
            "error": message or "Engine not initialized",
            "code": "ENGINE_NOT_READY",
        }

    @staticmethod
    def _coerce_non_negative_int(value: Any, default: int) -> int:
        """Coerce values into non-negative integers, preserving defaults on failure."""
        try:
            parsed = int(value)
            if parsed < 0:
                return default
            return parsed
        except Exception:
            return default

    @classmethod
    def _normalize_stream_stats(
        cls,
        raw_stats: Any,
        fallback: AvbStreamStats,
    ) -> AvbStreamStats:
        """Normalize engine stats payload (dict/object) into AvbStreamStats."""
        values = asdict(fallback)
        aliases = {
            "frames_sent": ("frames_sent", "framesSent"),
            "frames_received": ("frames_received", "framesReceived"),
            "send_errors": ("send_errors", "sendErrors"),
            "receive_errors": ("receive_errors", "receiveErrors"),
            "underruns": ("underruns",),
            "overruns": ("overruns",),
            "timestamp_errors": ("timestamp_errors", "timestampErrors"),
            "sequence_errors": ("sequence_errors", "sequenceErrors"),
            "bytes_transferred": ("bytes_transferred", "bytesTransferred"),
            "max_latency_ns": ("max_latency_ns", "maxLatencyNs"),
            "min_latency_ns": ("min_latency_ns", "minLatencyNs"),
        }

        for field_name, candidate_keys in aliases.items():
            candidate_value = None

            if isinstance(raw_stats, dict):
                for key in candidate_keys:
                    if key in raw_stats:
                        candidate_value = raw_stats[key]
                        break
            else:
                for key in candidate_keys:
                    if hasattr(raw_stats, key):
                        candidate_value = getattr(raw_stats, key)
                        break

            if candidate_value is None:
                continue

            values[field_name] = cls._coerce_non_negative_int(
                candidate_value,
                values[field_name],
            )

        return AvbStreamStats(**values)

    async def create_stream(self, config: AvbStreamConfig) -> Dict[str, Any]:
        """
        Create new AVB stream.

        Args:
            config: Stream configuration

        Returns:
            Result dict with stream_id or error
        """
        if not self.is_available():
            return {"error": "AVB not available", "code": "AVB_DISABLED"}

        stream_id = config.stream_id if isinstance(config.stream_id, str) else ""
        stream_id = stream_id.strip()
        if not stream_id:
            return {"error": "Invalid stream_id", "code": "INVALID_CONFIG"}

        if config.channels <= 0 or config.sample_rate <= 0 or config.buffer_size <= 0:
            return {"error": "Invalid stream configuration", "code": "INVALID_CONFIG"}

        if stream_id != config.stream_id:
            config.stream_id = stream_id

        # Check if stream already exists
        if stream_id in self.streams:
            return {"error": "Stream already exists", "code": "STREAM_EXISTS"}

        try:
            engine_config = asdict(config)
            engine_config["direction"] = config.direction.value
            engine_config.pop("srp_reservation_id", None)
            engine_config.pop("srp_admission_id", None)
            engine_config.pop("srp_metadata", None)
            found, success, error = self._call_engine_stream_api(
                [
                    "create_avb_stream",
                    "createAvbStream",
                ],
                engine_config,
            )
            if not found:
                if error:
                    return self._engine_not_ready_error(error)
                return self._missing_engine_stream_api_error("create")
            if found and not success:
                return {"error": error or "Engine create_stream failed", "code": "CREATION_FAILED"}

            stream_info = AvbStreamInfo(
                stream_id=config.stream_id,
                direction=config.direction,
                state=StreamState.STOPPED,
                config=config,
                stats=AvbStreamStats()
            )

            self.streams[stream_id] = stream_info

            if config.srp_reservation_id:
                self._srp_bindings[stream_id] = {
                    "reservation_id": config.srp_reservation_id,
                    "admission_id": config.srp_admission_id,
                    "metadata": dict(config.srp_metadata or {}),
                }

            logger.info(f"Created AVB {config.direction.value} stream: {stream_id}")

            return {
                "stream_id": stream_id,
                "status": "created"
            }

        except Exception as e:
            logger.error(f"Failed to create AVB stream: {e}", exc_info=True)
            return {"error": str(e), "code": "CREATION_FAILED"}

    async def delete_stream(self, stream_id: str) -> Dict[str, Any]:
        """
        Delete AVB stream.

        Args:
            stream_id: Stream identifier

        Returns:
            Result dict
        """
        if stream_id not in self.streams:
            return {"error": "Stream not found", "code": "NOT_FOUND"}

        try:
            stream = self.streams[stream_id]

            # Stop if running
            if stream.state == StreamState.RUNNING:
                stop_result = await self.stop_stream(stream_id)
                if stop_result.get("error"):
                    return {
                        "error": stop_result.get("error", "Failed to stop stream before delete"),
                        "code": "DELETE_FAILED",
                    }

            found, success, error = self._call_engine_stream_api(
                [
                    "delete_avb_stream",
                    "deleteAvbStream",
                ],
                stream_id,
            )
            if not found:
                if error:
                    return self._engine_not_ready_error(error)
                return self._missing_engine_stream_api_error("delete")
            if found and not success:
                return {"error": error or "Engine delete_stream failed", "code": "DELETE_FAILED"}

            del self.streams[stream_id]
            self._srp_bindings.pop(stream_id, None)

            logger.info(f"Deleted AVB stream: {stream_id}")

            return {"status": "deleted"}

        except Exception as e:
            logger.error(f"Failed to delete AVB stream: {e}", exc_info=True)
            return {"error": str(e), "code": "DELETE_FAILED"}

    async def start_stream(self, stream_id: str) -> Dict[str, Any]:
        """
        Start AVB stream.

        Args:
            stream_id: Stream identifier

        Returns:
            Result dict
        """
        if stream_id not in self.streams:
            return {"error": "Stream not found", "code": "NOT_FOUND"}

        try:
            stream = self.streams[stream_id]

            if stream.state == StreamState.RUNNING:
                return {"status": "already_running"}

            stream.state = StreamState.STARTING

            found, success, error = self._call_engine_stream_api(
                [
                    "start_avb_stream",
                    "startAvbStream",
                ],
                stream_id,
            )
            if not found:
                if error:
                    stream.state = StreamState.ERROR
                    stream.error = error
                    return self._engine_not_ready_error(error)
                stream.state = StreamState.ERROR
                stream.error = self._missing_engine_stream_api_error("start")["error"]
                return self._missing_engine_stream_api_error("start")
            if found and not success:
                stream.state = StreamState.ERROR
                stream.error = error or "Engine start_stream failed"
                return {"error": stream.error, "code": "START_FAILED"}

            stream.state = StreamState.RUNNING
            stream.error = None

            logger.info(f"Started AVB stream: {stream_id}")

            return {"status": "started"}

        except Exception as e:
            logger.error(f"Failed to start AVB stream: {e}", exc_info=True)
            stream = self.streams.get(stream_id)
            if stream:
                stream.state = StreamState.ERROR
                stream.error = str(e)
            return {"error": str(e), "code": "START_FAILED"}

    async def stop_stream(self, stream_id: str) -> Dict[str, Any]:
        """
        Stop AVB stream.

        Args:
            stream_id: Stream identifier

        Returns:
            Result dict
        """
        if stream_id not in self.streams:
            return {"error": "Stream not found", "code": "NOT_FOUND"}

        try:
            stream = self.streams[stream_id]

            if stream.state == StreamState.STOPPED:
                return {"status": "already_stopped"}

            stream.state = StreamState.STOPPING

            found, success, error = self._call_engine_stream_api(
                [
                    "stop_avb_stream",
                    "stopAvbStream",
                ],
                stream_id,
            )
            if not found:
                if error:
                    stream.state = StreamState.ERROR
                    stream.error = error
                    return self._engine_not_ready_error(error)
                stream.state = StreamState.ERROR
                stream.error = self._missing_engine_stream_api_error("stop")["error"]
                return self._missing_engine_stream_api_error("stop")
            if found and not success:
                stream.state = StreamState.ERROR
                stream.error = error or "Engine stop_stream failed"
                return {"error": stream.error, "code": "STOP_FAILED"}

            stream.state = StreamState.STOPPED
            stream.error = None

            logger.info(f"Stopped AVB stream: {stream_id}")

            return {"status": "stopped"}

        except Exception as e:
            logger.error(f"Failed to stop AVB stream: {e}", exc_info=True)
            stream = self.streams.get(stream_id)
            if stream:
                stream.state = StreamState.ERROR
                stream.error = str(e)
            return {"error": str(e), "code": "STOP_FAILED"}

    def get_stream(self, stream_id: str) -> Optional[Dict[str, Any]]:
        """Get stream information"""
        stream = self.streams.get(stream_id)
        if stream:
            return self._stream_to_dict(stream)
        return None

    def get_srp_binding(self, stream_id: str) -> Optional[Dict[str, Any]]:
        """Get SRP binding metadata for a stream."""
        binding = self._srp_bindings.get(stream_id)
        if binding is None:
            return None
        return {
            "reservation_id": binding.get("reservation_id"),
            "admission_id": binding.get("admission_id"),
            "metadata": dict(binding.get("metadata") or {}),
        }

    def bind_srp_reservation(
        self,
        stream_id: str,
        reservation_id: str,
        admission_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Bind SRP reservation metadata to an existing stream."""
        if stream_id not in self.streams:
            return False
        if not reservation_id:
            return False
        self._srp_bindings[stream_id] = {
            "reservation_id": reservation_id,
            "admission_id": admission_id,
            "metadata": dict(metadata or {}),
        }
        return True

    def clear_srp_reservation(self, stream_id: str) -> Optional[Dict[str, Any]]:
        """Clear and return SRP reservation metadata for a stream."""
        binding = self._srp_bindings.pop(stream_id, None)
        if binding is None:
            return None
        return {
            "reservation_id": binding.get("reservation_id"),
            "admission_id": binding.get("admission_id"),
            "metadata": dict(binding.get("metadata") or {}),
        }

    def get_all_streams(self) -> List[Dict[str, Any]]:
        """Get all streams"""
        return [self._stream_to_dict(s) for s in self.streams.values()]

    def get_device_names(self) -> List[str]:
        """Get JUCE-visible AVB device names from engine."""
        found, payload, _error = self._call_engine_stream_data_api(
            [
                "get_avb_device_names",
                "getAvbDeviceNames",
            ]
        )
        if not found or not isinstance(payload, list):
            return []

        names: List[str] = []
        for item in payload:
            value = str(item).strip()
            if value:
                names.append(value)
        return sorted(set(names))

    @staticmethod
    def _parse_host(node_address: Optional[str]) -> str:
        """Best-effort host extraction from an endpoint node address."""
        if not node_address:
            return ""
        try:
            parsed = urlparse(str(node_address))
            host = (parsed.hostname or "").strip()
            if host:
                return host
        except Exception:
            pass

        normalized = str(node_address).strip().split("/", 1)[0].split("@")[-1]
        return normalized.split(":", 1)[0].strip()

    def get_discovered_devices(self) -> List[Dict[str, Any]]:
        """Get normalized discovered AVB endpoint cache from engine, if supported."""
        found, payload, _error = self._call_engine_stream_data_api(
            [
                "get_avb_discovered_devices",
                "getAvbDiscoveredDevices",
            ]
        )
        if not found or not isinstance(payload, list):
            return []

        normalized: List[Dict[str, Any]] = []
        for item in payload:
            if not isinstance(item, dict):
                continue

            endpoint_id = str(item.get("endpoint_id") or item.get("endpointId") or "").strip()
            device_name = str(item.get("device_name") or item.get("deviceName") or "").strip()
            direction = str(item.get("direction") or "listener").strip().lower()
            device_type = str(item.get("device_type") or item.get("deviceType") or "unknown").strip().lower()
            node_address = str(item.get("node_address") or item.get("nodeAddress") or "").strip()
            audio_format = str(item.get("audio_format") or item.get("audioFormat") or "24-bit PCM").strip()
            host = str(item.get("host") or item.get("hostname") or "").strip()
            if not host:
                host = self._parse_host(node_address)
            available = bool(item.get("available", True))

            try:
                channels = max(1, int(item.get("channels", 2)))
            except Exception:
                channels = 2

            try:
                sample_rate = max(1, int(item.get("sample_rate", item.get("sampleRate", 48000))))
            except Exception:
                sample_rate = 48000

            if not endpoint_id or not device_name:
                continue

            if direction not in {"talker", "listener"}:
                direction = "listener"
            if device_type not in {"map2", "avdecc", "unknown"}:
                device_type = "unknown"

            normalized.append(
                {
                    "endpoint_id": endpoint_id,
                    "device_name": device_name,
                    "direction": direction,
                    "device_type": device_type,
                    "node_address": node_address,
                    "audio_format": audio_format or "24-bit PCM",
                    "host": host,
                    "channels": channels,
                    "sample_rate": sample_rate,
                    "available": available,
                }
            )

        normalized.sort(key=lambda row: (row["endpoint_id"], row["device_name"]))
        return normalized

    def get_stream_stats(self, stream_id: str) -> Optional[Dict[str, Any]]:
        """Get stream statistics"""
        stream = self.streams.get(stream_id)
        if not stream:
            return None

        found, raw_stats, error = self._call_engine_stream_data_api(
            [
                "get_avb_stream_stats",
                "getAvbStreamStats",
            ],
            stream_id,
        )
        if found:
            if error:
                stream.error = error
            elif raw_stats is not None:
                stream.stats = self._normalize_stream_stats(raw_stats, stream.stats)
                stream.error = None
        elif error:
            stream.error = error

        return asdict(stream.stats)

    def reset_stream_stats(self, stream_id: str) -> bool:
        """Reset stream statistics"""
        stream = self.streams.get(stream_id)
        if not stream:
            return False

        found, success, error = self._call_engine_stream_api(
            [
                "reset_avb_stream_stats",
                "resetAvbStreamStats",
            ],
            stream_id,
        )
        if not found:
            if error:
                stream.error = error
                return False
            stream.error = self._missing_engine_stream_api_error("reset")["error"]
            return False
        if found and not success:
            stream.error = error or "Engine reset_stream_stats failed"
            return False

        stream.stats = AvbStreamStats()
        if found:
            stream.error = None
        return True

    def _stream_to_dict(self, stream: AvbStreamInfo) -> Dict[str, Any]:
        """Convert stream info to dict for JSON serialization"""
        return {
            "stream_id": stream.stream_id,
            "direction": stream.direction.value,
            "state": stream.state.value,
            "config": asdict(stream.config),
            "stats": asdict(stream.stats),
            "error": stream.error,
            "srp_binding": self.get_srp_binding(stream.stream_id),
        }


# Singleton instance
_avb_service: Optional[AvbService] = None


def get_avb_service() -> AvbService:
    """Get singleton AVB service instance"""
    global _avb_service
    if _avb_service is None:
        _avb_service = AvbService()
    _avb_service._ensure_engine_bound()
    return _avb_service

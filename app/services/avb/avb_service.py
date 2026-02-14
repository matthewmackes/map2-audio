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
from dataclasses import dataclass, asdict
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
            # Check if engine has AVB support (compiled with USE_AVB=ON)
            if not hasattr(self._engine, 'isAvbAvailable'):
                return False

            return self._engine.isAvbAvailable()
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
            found, success, error = self._call_engine_stream_api(
                [
                    "create_avb_stream",
                    "createAvbStream",
                    "add_avb_stream",
                    "addAvbStream",
                ],
                engine_config,
            )
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
                await self.stop_stream(stream_id)

            found, success, error = self._call_engine_stream_api(
                [
                    "delete_avb_stream",
                    "deleteAvbStream",
                    "remove_avb_stream",
                    "removeAvbStream",
                ],
                stream_id,
            )
            if found and not success:
                return {"error": error or "Engine delete_stream failed", "code": "DELETE_FAILED"}

            del self.streams[stream_id]

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
            if found and not success:
                stream.state = StreamState.ERROR
                stream.error = error or "Engine start_stream failed"
                return {"error": stream.error, "code": "START_FAILED"}

            stream.state = StreamState.RUNNING

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
            if found and not success:
                stream.state = StreamState.ERROR
                stream.error = error or "Engine stop_stream failed"
                return {"error": stream.error, "code": "STOP_FAILED"}

            stream.state = StreamState.STOPPED

            logger.info(f"Stopped AVB stream: {stream_id}")

            return {"status": "stopped"}

        except Exception as e:
            logger.error(f"Failed to stop AVB stream: {e}", exc_info=True)
            return {"error": str(e), "code": "STOP_FAILED"}

    def get_stream(self, stream_id: str) -> Optional[Dict[str, Any]]:
        """Get stream information"""
        stream = self.streams.get(stream_id)
        if stream:
            return self._stream_to_dict(stream)
        return None

    def get_all_streams(self) -> List[Dict[str, Any]]:
        """Get all streams"""
        return [self._stream_to_dict(s) for s in self.streams.values()]

    def get_stream_stats(self, stream_id: str) -> Optional[Dict[str, Any]]:
        """Get stream statistics"""
        stream = self.streams.get(stream_id)
        if stream:
            # In real implementation, would query C++ AvbStream::getStats()
            return asdict(stream.stats)
        return None

    def reset_stream_stats(self, stream_id: str) -> bool:
        """Reset stream statistics"""
        stream = self.streams.get(stream_id)
        if stream:
            # In real implementation, would call C++ AvbStream::resetStats()
            stream.stats = AvbStreamStats()
            return True
        return False

    def _stream_to_dict(self, stream: AvbStreamInfo) -> Dict[str, Any]:
        """Convert stream info to dict for JSON serialization"""
        return {
            "stream_id": stream.stream_id,
            "direction": stream.direction.value,
            "state": stream.state.value,
            "config": asdict(stream.config),
            "stats": asdict(stream.stats),
            "error": stream.error
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

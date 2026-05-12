"""T2508-6 (rich path) — 15 fps periodic broadcaster for in-flight recorder sessions.

Companion to ``recorder_ws_bridge`` (transition-only path). Where the
bridge emits one frame per ARM / ROLL / STOP / DISARM transition,
this module emits a periodic heartbeat for every session currently
in ``ROLLING`` state, enriched with the real-time counters T2507
exposes through the engine's ``recorder_get_status`` binding.

Frame envelope:

    {
        "type": "recorder_session_tick",
        "payload": {
            "session_id": ...,
            "snapshot_id": ...,
            "state": "rolling",
            "elapsed_seconds": <float>,
            "total_samples": <int>,
            "armed_at_iso": <str | null>,
            "pre_ring_overflow_count": <int>,
            "post_ring_overflow_count": <int>,
            "channel_overflow_count": <int>,
            "disk_bytes_written": null,        # v2 once writer exposes it
            "take_counts_by_chain": null,      # v2 (per-chain TapNode path)
            "peak_levels_by_tap": null,        # v2 (RMS/peak meters)
        },
    }

The ``recorder_session_tick`` frame type is deliberately distinct
from the transition frame's ``recorder_session`` type so consumers
can demultiplex without dedupe logic.

RT-safety profile: runs on the FastAPI asyncio loop. The engine
call (``engine.recorder_get_status``) is sync pybind11 + grabs the
C++ RecorderService mutex — never enters the audio thread. We wrap
it in ``asyncio.to_thread`` to keep the loop responsive.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Optional

from app.config import config_get
from app.services.recorder_service import (
    RECORDER_SESSION_TOPIC,
    RecorderService,
    RecorderSessionState,
    get_recorder_service,
)
from app.services.websocket_manager import ws_manager


logger = logging.getLogger(__name__)


_FRAME_TYPE = "recorder_session_tick"
_DEFAULT_FPS = 15.0
_DEFAULT_SAMPLE_RATE = 48000.0
_ENGINE_ERROR_LOG_INTERVAL_SECONDS = 60.0


class RecorderPeriodicBroadcaster:
    """Periodic 15 fps tick producer for in-flight recorder sessions.

    Lifecycle: ``start()`` schedules a single background task that
    loops on a fixed period (``1 / fps``). On each tick it:

    1. Snapshots the live session map from ``RecorderService``.
    2. For each session in ``ROLLING`` state, asks the engine for
       its live status counters (one shared status call covers the
       single-session engine v1; T2511 punch-in introduces per-
       session engine state).
    3. Builds + broadcasts a ``recorder_session_tick`` frame.

    Errors from the engine binding are caught and logged at most
    once per ``_ENGINE_ERROR_LOG_INTERVAL_SECONDS`` so a misbehaving
    engine SO doesn't spam the log at 15 Hz.
    """

    def __init__(
        self,
        *,
        service: Optional[RecorderService] = None,
        engine: Any = None,
        fps: Optional[float] = None,
        sample_rate: float = _DEFAULT_SAMPLE_RATE,
        ws_publisher: Optional[Any] = None,
    ) -> None:
        self._service = service if service is not None else get_recorder_service()
        self._engine = engine
        self._fps = float(fps) if fps and fps > 0 else _resolve_fps()
        self._sample_rate = float(sample_rate) if sample_rate > 0 else _DEFAULT_SAMPLE_RATE
        self._publisher = ws_publisher if ws_publisher is not None else ws_manager.broadcast_json
        self._task: Optional[asyncio.Task[None]] = None
        self._stopping = False
        self._last_engine_error_log: float = 0.0

    @property
    def period_seconds(self) -> float:
        return 1.0 / self._fps

    @property
    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    def start(self) -> asyncio.Task[None]:
        """Schedule the periodic loop. Idempotent — re-calling
        returns the existing task without starting a second loop."""
        if self.is_running:
            return self._task  # type: ignore[return-value]
        self._stopping = False
        self._task = asyncio.create_task(
            self._run_forever(),
            name="recorder_periodic_broadcaster",
        )
        logger.info(
            "RecorderPeriodicBroadcaster started: %.1f fps (%.3f s period)",
            self._fps,
            self.period_seconds,
        )
        return self._task

    async def stop(self) -> None:
        """Cancel the loop + await drain. Safe to call from
        lifespan shutdown."""
        if self._task is None:
            return
        self._stopping = True
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        finally:
            self._task = None
            logger.info("RecorderPeriodicBroadcaster stopped")

    async def _run_forever(self) -> None:
        period = self.period_seconds
        try:
            while not self._stopping:
                try:
                    await self._tick_once()
                except asyncio.CancelledError:
                    raise
                except Exception as exc:  # noqa: BLE001
                    logger.exception(
                        "RecorderPeriodicBroadcaster: tick failed: %s",
                        exc,
                    )
                await asyncio.sleep(period)
        except asyncio.CancelledError:
            return

    async def _tick_once(self) -> None:
        sessions = await self._service.list_sessions()
        rolling = [s for s in sessions if s.state == RecorderSessionState.ROLLING]
        if not rolling:
            return

        engine_status = await self._fetch_engine_status_safely()

        for session in rolling:
            payload = self._build_payload(session, engine_status)
            frame = {"type": _FRAME_TYPE, "payload": payload}
            try:
                await self._publisher(frame, topic=RECORDER_SESSION_TOPIC)
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "RecorderPeriodicBroadcaster: broadcast failed for %s: %s",
                    session.session_id,
                    exc,
                )

    async def _fetch_engine_status_safely(self) -> dict[str, Any]:
        """Pull live counters from the engine. Returns an empty dict
        on any failure so the broadcaster still ships a usable
        payload (Python state is authoritative for ``state`` and
        timestamps even when the engine binding is unhappy)."""
        if self._engine is None or not hasattr(self._engine, "recorder_get_status"):
            return {}
        try:
            return await asyncio.to_thread(self._engine.recorder_get_status)
        except Exception as exc:  # noqa: BLE001
            now = time.monotonic()
            if now - self._last_engine_error_log >= _ENGINE_ERROR_LOG_INTERVAL_SECONDS:
                self._last_engine_error_log = now
                logger.warning(
                    "RecorderPeriodicBroadcaster: engine.recorder_get_status "
                    "raised %s; ticks will keep firing without engine counters.",
                    exc,
                )
            return {}

    def _build_payload(
        self,
        session: Any,
        engine_status: dict[str, Any],
    ) -> dict[str, Any]:
        total_samples = _coerce_int(engine_status.get("total_samples"))
        elapsed_seconds: Optional[float]
        if total_samples is not None and self._sample_rate > 0:
            elapsed_seconds = total_samples / self._sample_rate
        else:
            elapsed_seconds = None

        return {
            "session_id": session.session_id,
            "snapshot_id": session.snapshot_id,
            "state": session.state.value,
            "elapsed_seconds": elapsed_seconds,
            "total_samples": total_samples,
            "armed_at_iso": engine_status.get("armed_at_iso"),
            "pre_ring_overflow_count": _coerce_int(
                engine_status.get("pre_ring_overflow_count"),
            ),
            "post_ring_overflow_count": _coerce_int(
                engine_status.get("post_ring_overflow_count"),
            ),
            "channel_overflow_count": _coerce_int(
                engine_status.get("channel_overflow_count"),
            ),
            "disk_bytes_written": None,
            "take_counts_by_chain": None,
            "peak_levels_by_tap": None,
        }


def _resolve_fps() -> float:
    raw = config_get("recorder.broadcast_fps", _DEFAULT_FPS)
    try:
        fps = float(raw)
    except (TypeError, ValueError):
        return _DEFAULT_FPS
    return fps if fps > 0 else _DEFAULT_FPS


def _coerce_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


_broadcaster: Optional[RecorderPeriodicBroadcaster] = None


def init_recorder_periodic_broadcaster(
    *,
    engine: Any = None,
    sample_rate: float = _DEFAULT_SAMPLE_RATE,
) -> RecorderPeriodicBroadcaster:
    """Build + start the singleton periodic broadcaster.

    Wired from ``app/main.py`` lifespan startup immediately after
    ``init_recorder_ws_bridge()``. Idempotent — re-calling returns
    the running singleton without restarting it."""
    global _broadcaster
    if _broadcaster is not None and _broadcaster.is_running:
        return _broadcaster
    _broadcaster = RecorderPeriodicBroadcaster(
        engine=engine,
        sample_rate=sample_rate,
    )
    _broadcaster.start()
    return _broadcaster


def get_recorder_periodic_broadcaster() -> Optional[RecorderPeriodicBroadcaster]:
    return _broadcaster


def set_recorder_periodic_broadcaster(
    broadcaster: Optional[RecorderPeriodicBroadcaster],
) -> None:
    global _broadcaster
    _broadcaster = broadcaster

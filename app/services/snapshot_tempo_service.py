"""Session-scoped snapshot tempo state and live tap-tempo override handling."""

from __future__ import annotations

import copy
import logging
import statistics
import threading
import time
from datetime import datetime, timezone
from typing import Any, Optional

from app.services import snapshot_runtime_service
from app.services.midi_hub.clock_engine import get_midi_clock_engine
from app.utils.singleton import Singleton

logger = logging.getLogger(__name__)


def _clamp_bpm(value: Any) -> float:
    try:
        bpm = float(value)
    except (TypeError, ValueError):
        bpm = 120.0
    return max(20.0, min(300.0, bpm))


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SnapshotTempoService(Singleton):
    """Tracks stored snapshot tempo plus a session-only live tap override."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._active_snapshot_id: Optional[int] = None
        self._stored_tempo_bpm = 120.0
        self._live_tempo_bpm: Optional[float] = None
        self._tempo_source = "stored"
        self._updated_at = _utcnow_iso()
        self._tap_timestamps: list[float] = []

    def get_status(
        self,
        *,
        snapshot_id: Optional[int],
        stored_tempo_bpm: Any,
        is_active: bool = False,
    ) -> dict[str, Any]:
        stored_bpm = _clamp_bpm(stored_tempo_bpm)
        with self._lock:
            is_current_snapshot = bool(
                snapshot_id is not None
                and snapshot_id == self._active_snapshot_id
                and is_active
            )
            tempo_source = self._tempo_source if is_current_snapshot else "stored"
            live_tempo_bpm = self._live_tempo_bpm if is_current_snapshot else None
            active_tempo_bpm = (
                _clamp_bpm(live_tempo_bpm)
                if tempo_source == "tap" and live_tempo_bpm is not None
                else stored_bpm
            )
            return {
                "snapshot_id": snapshot_id,
                "stored_tempo_bpm": stored_bpm,
                "live_tempo_bpm": _clamp_bpm(live_tempo_bpm) if live_tempo_bpm is not None else None,
                "active_tempo_bpm": active_tempo_bpm,
                "tempo_source": tempo_source,
                "is_live_override_active": tempo_source == "tap" and live_tempo_bpm is not None,
                "updated_at": self._updated_at,
                "tap_count": len(self._tap_timestamps) if is_current_snapshot else 0,
            }

    async def activate_snapshot(
        self,
        snapshot_id: int,
        stored_tempo_bpm: Any,
        *,
        snapshot_data: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        target_bpm = _clamp_bpm(stored_tempo_bpm)
        with self._lock:
            self._active_snapshot_id = int(snapshot_id)
            self._stored_tempo_bpm = target_bpm
            self._live_tempo_bpm = None
            self._tempo_source = "stored"
            self._tap_timestamps = []
            self._updated_at = _utcnow_iso()
        await self._apply_tempo(target_bpm, snapshot_data=snapshot_data)
        return self.get_status(snapshot_id=snapshot_id, stored_tempo_bpm=target_bpm, is_active=True)

    async def update_stored_tempo(
        self,
        snapshot_id: int,
        stored_tempo_bpm: Any,
        *,
        snapshot_data: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        target_bpm = _clamp_bpm(stored_tempo_bpm)
        should_apply = False
        with self._lock:
            if self._active_snapshot_id == snapshot_id:
                self._stored_tempo_bpm = target_bpm
                self._updated_at = _utcnow_iso()
                should_apply = not (self._tempo_source == "tap" and self._live_tempo_bpm is not None)
        if should_apply:
            await self._apply_tempo(target_bpm, snapshot_data=snapshot_data)
        return self.get_status(snapshot_id=snapshot_id, stored_tempo_bpm=target_bpm, is_active=self._active_snapshot_id == snapshot_id)

    async def tap_tempo(
        self,
        snapshot_id: int,
        stored_tempo_bpm: Any,
        *,
        snapshot_data: Optional[dict[str, Any]] = None,
        timestamp_ms: Optional[float] = None,
    ) -> dict[str, Any]:
        stored_bpm = _clamp_bpm(stored_tempo_bpm)
        apply_bpm: Optional[float] = None
        with self._lock:
            if self._active_snapshot_id is None:
                self._active_snapshot_id = snapshot_id
                self._stored_tempo_bpm = stored_bpm
                self._tempo_source = "stored"
            elif self._active_snapshot_id != snapshot_id:
                raise ValueError("Tap tempo requires the live snapshot")

            current_timestamp = (
                float(timestamp_ms) / 1000.0
                if timestamp_ms is not None
                else time.time()
            )
            self._tap_timestamps.append(current_timestamp)
            if len(self._tap_timestamps) > 6:
                self._tap_timestamps = self._tap_timestamps[-6:]

            intervals = [
                later - earlier
                for earlier, later in zip(self._tap_timestamps, self._tap_timestamps[1:])
                if later > earlier
            ]
            if intervals:
                average_interval = statistics.mean(intervals[-4:])
                if average_interval > 0:
                    apply_bpm = _clamp_bpm(60.0 / average_interval)
                    self._live_tempo_bpm = apply_bpm
                    self._tempo_source = "tap"
            self._updated_at = _utcnow_iso()

        if apply_bpm is not None:
            await self._apply_tempo(apply_bpm, snapshot_data=snapshot_data)
        return self.get_status(snapshot_id=snapshot_id, stored_tempo_bpm=stored_bpm, is_active=True)

    async def reset_tempo(
        self,
        snapshot_id: int,
        stored_tempo_bpm: Any,
        *,
        snapshot_data: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        target_bpm = _clamp_bpm(stored_tempo_bpm)
        should_apply = False
        with self._lock:
            if self._active_snapshot_id == snapshot_id:
                should_apply = self._tempo_source == "tap" and self._live_tempo_bpm is not None
                self._stored_tempo_bpm = target_bpm
                self._live_tempo_bpm = None
                self._tempo_source = "stored"
                self._tap_timestamps = []
                self._updated_at = _utcnow_iso()
        if should_apply:
            await self._apply_tempo(target_bpm, snapshot_data=snapshot_data)
        return self.get_status(snapshot_id=snapshot_id, stored_tempo_bpm=target_bpm, is_active=self._active_snapshot_id == snapshot_id)

    async def _apply_tempo(self, bpm: float, *, snapshot_data: Optional[dict[str, Any]] = None) -> None:
        try:
            from app.services.automation_engine import automation_engine

            automation_engine.set_tempo(float(bpm))
        except Exception as exc:
            logger.debug("Failed to update automation tempo: %s", exc)

        try:
            clock_engine = get_midi_clock_engine()
            current_clock = clock_engine.status()
            snapshot_sync_enabled = bool(current_clock.get("snapshot_sync_enabled"))
            output_ports = list(current_clock.get("output_ports") or [])
            if snapshot_sync_enabled:
                current_clock = clock_engine.configure(bpm=float(bpm), source_mode="internal")
            else:
                current_clock = clock_engine.configure(bpm=float(bpm))
            if (
                snapshot_sync_enabled
                and output_ports
                and not current_clock.get("running")
            ):
                await clock_engine.start()
        except Exception as exc:
            logger.debug("Failed to update MIDI clock tempo: %s", exc)

        try:
            if isinstance(snapshot_data, dict):
                await snapshot_runtime_service.apply_snapshot_tempo_to_engine(copy.deepcopy(snapshot_data), float(bpm))
        except Exception as exc:
            logger.debug("Failed to apply snapshot tempo to runtime plugins: %s", exc)


def get_snapshot_tempo_service() -> SnapshotTempoService:
    return SnapshotTempoService.get_instance()


def reset_snapshot_tempo_service() -> None:
    SnapshotTempoService.reset_instance()

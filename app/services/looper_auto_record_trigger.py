"""T2512-AUTO-TRIGGER — input-level state machine for auto-record.

Completes the T2512-AUTO feature shipped in cycle 14 of the first
Continue run. The flag (auto_armed) + threshold (auto_threshold_db)
already live on LooperService; this module supplies the trigger that
fires ``record(track)`` when an armed track receives an input-level
push above its threshold.

How it works
------------
A consumer (engine-side input-level RMS push, test harness, or a
stub poll loop) calls ``push_input_level(track, level_db)`` on every
RMS sample (or on every Nth audio buffer — the trigger has no
opinion about the cadence). The trigger:

1. Reads the looper service's status for the track:
   - track must be ``state == EMPTY`` (no captured loop yet)
   - track must have ``auto_armed == True``
   - the pushed ``level_db`` must exceed the track's ``auto_threshold_db``
2. If all three conditions hold AND we're outside the post-fire
   cooldown window, the trigger fires:
   - calls ``service.record(track)``  (state moves EMPTY → RECORDING)
   - calls ``service.set_auto_armed(track, False)`` (disarms — the
     operator explicitly re-arms for the next take)
   - records the fire timestamp to gate the cooldown window
3. Otherwise the push is a no-op.

Why disarm-on-fire
------------------
A guitarist hitting the first note of a take should start recording
once. Leaving the flag armed means a fingertip release or string
ring-down could re-trigger on the next ground-up RMS spike. The
operator explicitly re-arms for the next take by toggling auto_armed
back on (CC footswitch / UI toggle / engine_command verb).

Cooldown
--------
50 ms default; long enough to cover the slowest realistic operator
disarm path but short enough that a fast operator can re-arm the
next track without missing a beat. Configurable via the constructor.

Test seam
---------
The class takes an optional ``clock_fn`` (returns monotonic seconds)
so tests can advance a fake clock without sleeping.

RT-safety
---------
Never touches the audio thread. The trigger runs wherever its caller
runs: in the engine's input-level poll, in a pytest function, in a
WS callback. Calls into LooperService go through the service's
existing sync API (``get_status``, ``record``, ``set_auto_armed``)
which themselves never block the audio callback.
"""

from __future__ import annotations

import logging
import time
from typing import Callable, Optional

from app.services.looper_service import (
    LooperService,
    TrackState,
    get_looper_service,
)


logger = logging.getLogger(__name__)


DEFAULT_COOLDOWN_S = 0.050  # 50 ms — see module docstring


class LooperAutoRecordTrigger:
    """Decision engine for T2512-AUTO input-threshold auto-record."""

    def __init__(
        self,
        *,
        service: Optional[LooperService] = None,
        cooldown_s: float = DEFAULT_COOLDOWN_S,
        clock_fn: Optional[Callable[[], float]] = None,
    ) -> None:
        self._service = service
        self._cooldown_s = float(cooldown_s)
        self._clock = clock_fn or time.monotonic
        # Per-track last-fire timestamp (monotonic seconds). 0.0
        # means "never fired".
        self._last_fire: list[float] = [0.0, 0.0, 0.0, 0.0]

    def _resolve_service(self) -> Optional[LooperService]:
        if self._service is not None:
            return self._service
        try:
            return get_looper_service()
        except Exception as exc:  # noqa: BLE001
            logger.debug(
                "auto_record_trigger: get_looper_service failed: %s", exc
            )
            return None

    def push_input_level(self, track: int, level_db: float) -> bool:
        """T2512-AUTO-TRIGGER — entry point for input-level pushes.

        Returns True if the trigger fired (``record(track)`` was called),
        False otherwise. Out-of-range tracks return False without
        raising — the caller (engine binding, test stub) may not have
        full track-index validation.
        """
        if not (0 <= track < 4):
            return False

        service = self._resolve_service()
        if service is None:
            return False

        # Cooldown check first so we can short-circuit cheap.
        now = self._clock()
        last = self._last_fire[track]
        if last > 0.0 and (now - last) < self._cooldown_s:
            return False

        try:
            status = service.get_status()
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "auto_record_trigger: get_status failed: %s", exc
            )
            return False

        track_status = status.tracks[track]
        if not track_status.auto_armed:
            return False
        if track_status.state != TrackState.EMPTY:
            # Only fire on a fresh EMPTY track. RECORDING / PLAYING /
            # OVERDUBBING / STOPPED tracks are owned by the operator's
            # explicit state machine; the auto-trigger never preempts.
            return False
        if level_db <= track_status.auto_threshold_db:
            return False

        # Conditions met — fire.
        try:
            service.record(track)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "auto_record_trigger: record(%d) failed: %s", track, exc
            )
            return False

        # Disarm after fire. If this raises, the loop is already
        # recording — don't bubble out.
        try:
            service.set_auto_armed(track, False)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "auto_record_trigger: set_auto_armed(%d, False) failed: %s",
                track,
                exc,
            )

        self._last_fire[track] = now
        logger.info(
            "auto_record_trigger: fired record(%d) at level=%.2f dB "
            "(threshold=%.2f dB)",
            track,
            level_db,
            track_status.auto_threshold_db,
        )
        return True

    def reset(self) -> None:
        """Drop all per-track cooldown state. Used at lifespan
        teardown and in test fixtures."""
        self._last_fire = [0.0, 0.0, 0.0, 0.0]

    # Test seam ------------------------------------------------------------

    def _last_fire_for_test(self) -> list[float]:
        return list(self._last_fire)


# ----------------------------------------------------------------------
# Singleton accessor
# ----------------------------------------------------------------------

_trigger: Optional[LooperAutoRecordTrigger] = None


def init_looper_auto_record_trigger(
    *,
    service: Optional[LooperService] = None,
    cooldown_s: float = DEFAULT_COOLDOWN_S,
    clock_fn: Optional[Callable[[], float]] = None,
) -> LooperAutoRecordTrigger:
    """Create + register the singleton. Idempotent."""
    global _trigger
    if _trigger is None:
        _trigger = LooperAutoRecordTrigger(
            service=service, cooldown_s=cooldown_s, clock_fn=clock_fn
        )
    return _trigger


def get_looper_auto_record_trigger() -> Optional[LooperAutoRecordTrigger]:
    return _trigger


def reset_looper_auto_record_trigger_for_tests() -> None:
    """Drop the singleton so tests can rebuild it against a fresh service."""
    global _trigger
    if _trigger is not None:
        _trigger.reset()
    _trigger = None

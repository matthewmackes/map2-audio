"""T2512-OS-RUNNER — async auto-stop watcher for one-shot mode.

Completes the T2512-OS feature shipped in cycle 12 of the 2026-05-12
Continue run. The flag/route/UI/dispatcher target/WS surface for
one-shot mode landed earlier; this module supplies the *runner* that
actually performs the auto-stop.

How it works
------------
The runner installs itself as a LooperService status observer (via the
broadcaster injection point used by the WS bridge). On every status
frame, the runner looks at each track and decides:

1. If a track is in one_shot=True and state=PLAYING and we don't yet
   have a pending auto-stop task: schedule one. The deadline is
   ``(loop_length_frames - playhead_frames) / sample_rate`` seconds
   from now. Sample rate is fixed at 48000 to match the engine's
   ``DEFAULT_BUFFER_SIZE=64`` audio path.
2. If a pending task exists for a track but the track is no longer in
   one_shot=True or state=PLAYING: cancel the task. Avoids firing
   ``stop_track`` on a track the operator has already cleared,
   re-recorded, or manually stopped.
3. When the deadline fires, the runner calls
   ``LooperService.stop_track(track)``. The resulting status broadcast
   feeds back into observe() and cleans up the task slot.

Isolation
---------
The runner is fully testable without a real LooperService: callers
inject the service via ``__init__`` and the asyncio loop is captured
at install time (mirrors the WS bridge's lifespan-ordering pattern).

RT-safety
---------
Never touches the JUCE audio callback. All work runs on the FastAPI
asyncio loop. Status reads come from the existing broadcaster path;
``stop_track`` flips an atomic flag in the engine; nothing here can
allocate on the audio thread.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from app.services.looper_service import (
    LooperService,
    LooperStatus,
    TrackState,
    get_looper_service,
)


logger = logging.getLogger(__name__)

# Matches the engine's fixed sample rate (CONFIG_SCHEMA.audio.sample_rate
# is locked at 48000 — see Tier A locked settings in the project rules).
SAMPLE_RATE_HZ = 48000.0


class LooperOneShotRunner:
    """Per-track auto-stop scheduler for one-shot mode.

    Lifetime: created once at lifespan startup; ``observe`` is
    registered as a LooperService broadcaster (composed with the WS
    fan-out by ``init_looper_ws_bridge``). Cleanup at process exit
    cancels any pending tasks.
    """

    def __init__(
        self,
        *,
        service: Optional[LooperService] = None,
        loop: Optional[asyncio.AbstractEventLoop] = None,
        sample_rate_hz: float = SAMPLE_RATE_HZ,
    ) -> None:
        self._service = service
        self._loop = loop
        self._sample_rate_hz = sample_rate_hz
        # Per-track pending stop tasks, indexed 0..3. None means no
        # pending auto-stop for that track.
        self._pending: list[Optional[asyncio.TimerHandle]] = [
            None, None, None, None
        ]

    def _resolve_service(self) -> Optional[LooperService]:
        if self._service is not None:
            return self._service
        try:
            return get_looper_service()
        except Exception as exc:  # noqa: BLE001
            logger.debug("one_shot_runner: get_looper_service failed: %s", exc)
            return None

    def observe(self, status: LooperStatus) -> None:
        """Sync entrypoint matching the LooperService broadcaster shape.

        Called inline from the service's mutating verbs; must not
        block. Scheduling happens via ``loop.call_later`` rather than
        ``asyncio.create_task`` so we don't depend on being inside the
        loop's thread.
        """
        if self._loop is None:
            # No loop attached yet — runner is inert. The WS bridge
            # wires this at lifespan startup.
            return

        for track_status in status.tracks:
            self._evaluate_track(track_status)

    def _evaluate_track(self, t: Any) -> None:
        track_idx = int(t.track)
        if not (0 <= track_idx < 4):
            return

        should_be_pending = bool(
            t.one_shot
            and t.state == TrackState.PLAYING
            and t.loop_length_frames > 0
        )
        existing = self._pending[track_idx]

        if not should_be_pending:
            # Cancel any stale pending task — the operator changed
            # state on this track before the deadline fired.
            if existing is not None:
                existing.cancel()
                self._pending[track_idx] = None
            return

        if existing is not None:
            # Already scheduled — don't double-book. We intentionally
            # do NOT reschedule on later status frames; the original
            # deadline is the right one (the operator armed one-shot
            # at a specific instant). If we re-saw the same playing
            # frame and rescheduled, the loop would never stop on
            # tracks that broadcast status more than once per pass.
            return

        # Compute remaining-time on the current pass.
        remaining_frames = max(0, t.loop_length_frames - t.playhead_frames)
        delay_s = remaining_frames / self._sample_rate_hz
        # Guard against zero-delay scheduling (would fire on the next
        # event loop iteration before the recording even reaches the
        # caller's expected duration). Clamp to a 5 ms floor so the
        # operator's perception of "one full pass" is preserved even
        # if the broadcast arrived at the very end of the loop.
        delay_s = max(0.005, delay_s)

        assert self._loop is not None  # narrowed by the early-return above
        handle = self._loop.call_later(
            delay_s, self._on_deadline, track_idx
        )
        self._pending[track_idx] = handle
        logger.info(
            "one_shot_runner: track %d auto-stop scheduled in %.3f s",
            track_idx,
            delay_s,
        )

    def _on_deadline(self, track_idx: int) -> None:
        """Fire the auto-stop. Runs on the asyncio loop thread."""
        # Clear the slot first so a status broadcast generated by
        # stop_track doesn't see a stale handle.
        self._pending[track_idx] = None
        service = self._resolve_service()
        if service is None:
            logger.info(
                "one_shot_runner: track %d deadline hit but LooperService "
                "not ready",
                track_idx,
            )
            return
        try:
            service.stop_track(track_idx)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "one_shot_runner: stop_track(%d) failed: %s",
                track_idx,
                exc,
            )

    def cancel_all(self) -> None:
        """Cancel every pending task. Called at shutdown."""
        for idx, handle in enumerate(self._pending):
            if handle is not None:
                handle.cancel()
                self._pending[idx] = None

    # Test seams ------------------------------------------------------------

    def _pending_for_test(self) -> list[Optional[asyncio.TimerHandle]]:
        return list(self._pending)


# ----------------------------------------------------------------------
# Singleton accessor (mirrors the WS bridge pattern)
# ----------------------------------------------------------------------

_runner: Optional[LooperOneShotRunner] = None


def init_looper_one_shot_runner(
    *,
    service: Optional[LooperService] = None,
    loop: Optional[asyncio.AbstractEventLoop] = None,
) -> LooperOneShotRunner:
    """Create + register the singleton runner. Idempotent."""
    global _runner
    if _runner is None:
        _runner = LooperOneShotRunner(service=service, loop=loop)
    return _runner


def get_looper_one_shot_runner() -> Optional[LooperOneShotRunner]:
    return _runner


def reset_looper_one_shot_runner_for_tests() -> None:
    """Drop the singleton so tests can rebuild it against a fresh loop."""
    global _runner
    if _runner is not None:
        _runner.cancel_all()
    _runner = None

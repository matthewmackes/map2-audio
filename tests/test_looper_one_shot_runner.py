"""T2512-OS-RUNNER — auto-stop watcher tests.

The runner observes LooperService status broadcasts and schedules a
``stop_track`` after one full playhead pass on any track that's
one_shot=True + state=PLAYING. Tests inject a fake service so
``stop_track`` is observable without a real engine.
"""

from __future__ import annotations

import asyncio

import pytest

from app.services.looper_one_shot_runner import (
    LooperOneShotRunner,
    SAMPLE_RATE_HZ,
    init_looper_one_shot_runner,
    reset_looper_one_shot_runner_for_tests,
)
from app.services.looper_service import (
    LooperStatus,
    TrackState,
    TrackStatus,
)


@pytest.fixture(autouse=True)
def _reset_singleton():
    reset_looper_one_shot_runner_for_tests()
    yield
    reset_looper_one_shot_runner_for_tests()


class _FakeService:
    def __init__(self) -> None:
        self.stop_calls: list[int] = []

    def stop_track(self, track: int) -> None:
        self.stop_calls.append(track)


def _track(
    idx: int,
    *,
    state: TrackState = TrackState.EMPTY,
    one_shot: bool = False,
    loop_length_frames: int = 0,
    playhead_frames: int = 0,
    one_shot_passes: int = 1,
) -> TrackStatus:
    return TrackStatus(
        track=idx,
        state=state,
        state_label=state.label,
        loop_length_frames=loop_length_frames,
        playhead_frames=playhead_frames,
        layer_count=0,
        level_db=0.0,
        muted=False,
        soloed=False,
        reverse=False,
        half_speed=False,
        locked=False,
        one_shot=one_shot,
        one_shot_passes=one_shot_passes,
    )


def _status(tracks: list[TrackStatus]) -> LooperStatus:
    return LooperStatus(
        tracks=tracks,
        active_track_count=sum(
            1 for t in tracks if t.state != TrackState.EMPTY
        ),
        sync_master=False,
        master_level_db=0.0,
    )


# ---------------------------------------------------------------------------
# Scheduling
# ---------------------------------------------------------------------------


async def test_playing_one_shot_track_schedules_a_pending_stop():
    loop = asyncio.get_event_loop()
    service = _FakeService()
    runner = LooperOneShotRunner(service=service, loop=loop)

    runner.observe(
        _status([
            _track(0, state=TrackState.PLAYING, one_shot=True,
                   loop_length_frames=48_000,  # 1.0 s
                   playhead_frames=0),
            _track(1),
            _track(2),
            _track(3),
        ])
    )
    pending = runner._pending_for_test()
    assert pending[0] is not None
    assert pending[1] is None
    assert pending[2] is None
    assert pending[3] is None
    # Don't actually wait the full second — cancel the handle.
    runner.cancel_all()


async def test_non_one_shot_track_does_not_schedule():
    loop = asyncio.get_event_loop()
    runner = LooperOneShotRunner(service=_FakeService(), loop=loop)

    runner.observe(
        _status([
            _track(0, state=TrackState.PLAYING, one_shot=False,
                   loop_length_frames=48_000, playhead_frames=0),
            _track(1),
            _track(2),
            _track(3),
        ])
    )
    assert runner._pending_for_test() == [None, None, None, None]


async def test_one_shot_in_other_states_does_not_schedule():
    loop = asyncio.get_event_loop()
    runner = LooperOneShotRunner(service=_FakeService(), loop=loop)

    for state in (
        TrackState.EMPTY,
        TrackState.RECORDING,
        TrackState.OVERDUBBING,
        TrackState.STOPPED,
    ):
        runner.observe(
            _status([
                _track(0, state=state, one_shot=True,
                       loop_length_frames=48_000, playhead_frames=0),
                _track(1),
                _track(2),
                _track(3),
            ])
        )
        assert runner._pending_for_test()[0] is None, state


async def test_repeated_observe_does_not_reschedule():
    """Status broadcasts arrive on every mutating verb — the runner
    must not double-book if it sees the same playing track twice."""
    loop = asyncio.get_event_loop()
    runner = LooperOneShotRunner(service=_FakeService(), loop=loop)

    status = _status([
        _track(0, state=TrackState.PLAYING, one_shot=True,
               loop_length_frames=48_000, playhead_frames=0),
        _track(1), _track(2), _track(3),
    ])
    runner.observe(status)
    first = runner._pending_for_test()[0]
    runner.observe(status)
    second = runner._pending_for_test()[0]
    assert first is second  # same TimerHandle, no reschedule
    runner.cancel_all()


# ---------------------------------------------------------------------------
# Cancellation
# ---------------------------------------------------------------------------


async def test_state_change_cancels_pending_stop():
    """Operator hits Record again → state flips PLAYING → OVERDUBBING.
    The pending auto-stop must be cancelled so we don't ``stop_track``
    on a re-recording loop."""
    loop = asyncio.get_event_loop()
    runner = LooperOneShotRunner(service=_FakeService(), loop=loop)

    runner.observe(
        _status([
            _track(0, state=TrackState.PLAYING, one_shot=True,
                   loop_length_frames=48_000, playhead_frames=0),
            _track(1), _track(2), _track(3),
        ])
    )
    assert runner._pending_for_test()[0] is not None

    runner.observe(
        _status([
            _track(0, state=TrackState.OVERDUBBING, one_shot=True,
                   loop_length_frames=48_000, playhead_frames=0),
            _track(1), _track(2), _track(3),
        ])
    )
    assert runner._pending_for_test()[0] is None


async def test_clearing_one_shot_flag_cancels_pending_stop():
    """Operator disarms one-shot → no auto-stop should fire."""
    loop = asyncio.get_event_loop()
    runner = LooperOneShotRunner(service=_FakeService(), loop=loop)

    runner.observe(
        _status([
            _track(0, state=TrackState.PLAYING, one_shot=True,
                   loop_length_frames=48_000, playhead_frames=0),
            _track(1), _track(2), _track(3),
        ])
    )
    assert runner._pending_for_test()[0] is not None

    runner.observe(
        _status([
            _track(0, state=TrackState.PLAYING, one_shot=False,
                   loop_length_frames=48_000, playhead_frames=0),
            _track(1), _track(2), _track(3),
        ])
    )
    assert runner._pending_for_test()[0] is None


# ---------------------------------------------------------------------------
# Firing the stop
# ---------------------------------------------------------------------------


async def test_deadline_calls_service_stop_track():
    """Schedule a very short auto-stop (50 ms) and assert
    service.stop_track(track) gets called once the deadline fires."""
    loop = asyncio.get_event_loop()
    service = _FakeService()
    # 50 ms remaining: 50/1000 * 48000 = 2400 frames out of 48000.
    runner = LooperOneShotRunner(service=service, loop=loop)
    runner.observe(
        _status([
            _track(0, state=TrackState.PLAYING, one_shot=True,
                   loop_length_frames=48_000, playhead_frames=45_600),
            _track(1), _track(2), _track(3),
        ])
    )
    assert runner._pending_for_test()[0] is not None
    await asyncio.sleep(0.15)  # enough for the 50 ms deadline + slack
    assert service.stop_calls == [0]
    # Pending cleared.
    assert runner._pending_for_test()[0] is None


async def test_runner_with_no_service_logs_and_drops():
    """If the LooperService singleton isn't ready when the deadline
    fires, the runner logs and drops — does not raise."""
    loop = asyncio.get_event_loop()
    # service=None forces _resolve_service to call get_looper_service()
    # which returns whatever the singleton is. We use set_looper_service
    # to clear it explicitly.
    from app.services.looper_service import set_looper_service
    set_looper_service(None)
    runner = LooperOneShotRunner(loop=loop)
    runner.observe(
        _status([
            _track(0, state=TrackState.PLAYING, one_shot=True,
                   loop_length_frames=480, playhead_frames=0),
            _track(1), _track(2), _track(3),
        ])
    )
    # 480 / 48000 = 10 ms — but the floor clamps to 5 ms minimum so
    # this still fires fast. Wait the clamp + slack.
    await asyncio.sleep(0.05)
    # No exception bubbled — test passes.


async def test_loop_length_zero_does_not_schedule():
    """A track that's PLAYING but has no captured content yet (length=0)
    must not schedule a 0-second auto-stop."""
    loop = asyncio.get_event_loop()
    runner = LooperOneShotRunner(service=_FakeService(), loop=loop)
    runner.observe(
        _status([
            _track(0, state=TrackState.PLAYING, one_shot=True,
                   loop_length_frames=0, playhead_frames=0),
            _track(1), _track(2), _track(3),
        ])
    )
    assert runner._pending_for_test()[0] is None


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


def test_runner_without_loop_is_inert():
    """No loop attached → observe() is a no-op (the WS bridge sets the
    loop at lifespan startup; tests can construct a service before
    the bridge runs)."""
    runner = LooperOneShotRunner(service=_FakeService())
    runner.observe(
        _status([
            _track(0, state=TrackState.PLAYING, one_shot=True,
                   loop_length_frames=48_000, playhead_frames=0),
            _track(1), _track(2), _track(3),
        ])
    )
    assert runner._pending_for_test() == [None, None, None, None]


async def test_cancel_all_clears_pending_tasks():
    loop = asyncio.get_event_loop()
    runner = LooperOneShotRunner(service=_FakeService(), loop=loop)
    runner.observe(
        _status([
            _track(0, state=TrackState.PLAYING, one_shot=True,
                   loop_length_frames=48_000, playhead_frames=0),
            _track(1, state=TrackState.PLAYING, one_shot=True,
                   loop_length_frames=48_000, playhead_frames=0),
            _track(2), _track(3),
        ])
    )
    assert runner._pending_for_test()[0] is not None
    assert runner._pending_for_test()[1] is not None
    runner.cancel_all()
    assert runner._pending_for_test() == [None, None, None, None]


def test_init_singleton_is_idempotent():
    loop = asyncio.new_event_loop()
    try:
        first = init_looper_one_shot_runner(loop=loop)
        second = init_looper_one_shot_runner(loop=loop)
        assert first is second
    finally:
        loop.close()


# ---------------------------------------------------------------------------
# Sample-rate seam
# ---------------------------------------------------------------------------


async def test_sample_rate_constant_matches_48000():
    """SAMPLE_RATE_HZ must match the engine's locked rate. A regression
    here would silently shift the deadline math."""
    assert SAMPLE_RATE_HZ == 48000.0


# ---------------------------------------------------------------------------
# T2512-OS-COUNT — multi-pass one-shot
# ---------------------------------------------------------------------------


class _ScriptedService:
    """Fake LooperService whose ``get_status`` returns a queue of
    scripted statuses. Used by OS-COUNT tests where the runner
    re-reads status after each pass to decide whether to keep
    rescheduling."""

    def __init__(self, statuses: list[LooperStatus]) -> None:
        self._statuses = list(statuses)
        self.stop_calls: list[int] = []
        self.status_reads = 0

    def stop_track(self, track: int) -> None:
        self.stop_calls.append(track)

    def get_status(self) -> LooperStatus:
        self.status_reads += 1
        if not self._statuses:
            raise AssertionError(
                "ScriptedService: ran out of scripted statuses"
            )
        # Last status repeats once exhausted to model "still playing".
        if len(self._statuses) == 1:
            return self._statuses[0]
        return self._statuses.pop(0)


def test_one_shot_passes_initial_observe_captures_count():
    """Runner reads one_shot_passes from the first observe() that
    schedules the deadline (not from later status frames)."""
    import asyncio
    loop = asyncio.new_event_loop()
    try:
        runner = LooperOneShotRunner(service=_FakeService(), loop=loop)
        runner.observe(
            _status([
                _track(0, state=TrackState.PLAYING, one_shot=True,
                       loop_length_frames=48_000, playhead_frames=0,
                       one_shot_passes=3),
                _track(1), _track(2), _track(3),
            ])
        )
        assert runner._passes_remaining_for_test()[0] == 3
        runner.cancel_all()
    finally:
        loop.close()


def test_cancel_resets_passes_remaining():
    """When the runner cancels a pending stop (state change), the
    passes-remaining counter must reset to 0 — a future re-observe
    starts a fresh count instead of inheriting stale state."""
    import asyncio
    loop = asyncio.new_event_loop()
    try:
        runner = LooperOneShotRunner(service=_FakeService(), loop=loop)
        runner.observe(
            _status([
                _track(0, state=TrackState.PLAYING, one_shot=True,
                       loop_length_frames=48_000, playhead_frames=0,
                       one_shot_passes=4),
                _track(1), _track(2), _track(3),
            ])
        )
        assert runner._passes_remaining_for_test()[0] == 4
        # Operator stops the track → state OVERDUBBING (or any non-PLAYING).
        runner.observe(
            _status([
                _track(0, state=TrackState.OVERDUBBING, one_shot=True,
                       loop_length_frames=48_000, playhead_frames=0,
                       one_shot_passes=4),
                _track(1), _track(2), _track(3),
            ])
        )
        assert runner._passes_remaining_for_test()[0] == 0
    finally:
        loop.close()


async def test_two_pass_one_shot_reschedules_then_stops():
    """passes=2 + a short initial deadline: first deadline reschedules,
    second deadline calls stop_track."""
    loop = asyncio.get_event_loop()
    # 48k loop, head at 47900 → ~2.08 ms remaining + 5 ms floor = 5 ms.
    # Loop length is 48000 frames = 1.0 s, so the rescheduled pass is 1 s.
    # That's too long for a test — shrink the loop_length to a few ms.
    # 480 frames = 10 ms; full reschedule is 10 ms (clamped to 5 ms minimum
    # but 10 > 5 so we get 10 ms).
    playing_status = _status([
        _track(0, state=TrackState.PLAYING, one_shot=True,
               loop_length_frames=480, playhead_frames=0,
               one_shot_passes=2),
        _track(1), _track(2), _track(3),
    ])
    service = _ScriptedService([playing_status])
    runner = LooperOneShotRunner(service=service, loop=loop)
    runner.observe(playing_status)
    assert runner._passes_remaining_for_test()[0] == 2
    # First deadline (5 ms + slack) → reschedules; second deadline
    # (10 ms + slack) → stops.
    await asyncio.sleep(0.10)
    assert service.stop_calls == [0]
    assert runner._passes_remaining_for_test()[0] == 0


async def test_passes_count_clamped_via_max_in_runner():
    """A track with one_shot_passes=1 (default) still works identically
    to the pre-OS-COUNT behavior — single deadline → single stop."""
    loop = asyncio.get_event_loop()
    playing_status = _status([
        _track(0, state=TrackState.PLAYING, one_shot=True,
               loop_length_frames=480, playhead_frames=0,
               one_shot_passes=1),
        _track(1), _track(2), _track(3),
    ])
    service = _ScriptedService([playing_status])
    runner = LooperOneShotRunner(service=service, loop=loop)
    runner.observe(playing_status)
    assert runner._passes_remaining_for_test()[0] == 1
    await asyncio.sleep(0.05)
    assert service.stop_calls == [0]
    # Status was read 0 times because the single-pass path doesn't
    # reschedule — it goes straight to stop_track.
    assert service.status_reads == 0


async def test_reschedule_aborts_to_stop_when_track_no_longer_playing():
    """Defensive: between the first deadline firing and our re-read
    of get_status, the operator may have stopped/cleared the track.
    If status no longer shows one_shot + PLAYING, fall through to
    stop_track to resolve the operator intent."""
    loop = asyncio.get_event_loop()
    playing_status = _status([
        _track(0, state=TrackState.PLAYING, one_shot=True,
               loop_length_frames=480, playhead_frames=0,
               one_shot_passes=3),
        _track(1), _track(2), _track(3),
    ])
    stopped_status = _status([
        _track(0, state=TrackState.STOPPED, one_shot=True,
               loop_length_frames=480, playhead_frames=480,
               one_shot_passes=3),
        _track(1), _track(2), _track(3),
    ])
    service = _ScriptedService([playing_status, stopped_status, stopped_status])
    runner = LooperOneShotRunner(service=service, loop=loop)
    runner.observe(playing_status)
    assert runner._passes_remaining_for_test()[0] == 3
    await asyncio.sleep(0.05)
    # stop_track called even though we never burned all 3 passes,
    # because get_status reported a non-playing track at reschedule
    # time. The operator's one_shot intent resolves cleanly.
    assert service.stop_calls == [0]


async def test_cancel_all_clears_passes_remaining():
    loop = asyncio.get_event_loop()
    runner = LooperOneShotRunner(service=_FakeService(), loop=loop)
    runner.observe(
        _status([
            _track(0, state=TrackState.PLAYING, one_shot=True,
                   loop_length_frames=48_000, playhead_frames=0,
                   one_shot_passes=5),
            _track(1), _track(2), _track(3),
        ])
    )
    assert runner._passes_remaining_for_test()[0] == 5
    runner.cancel_all()
    assert runner._passes_remaining_for_test() == [0, 0, 0, 0]

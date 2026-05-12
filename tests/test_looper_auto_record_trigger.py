"""T2512-AUTO-TRIGGER — input-level state machine tests.

The trigger reads LooperService status (auto_armed + auto_threshold_db
+ state) and fires ``record(track)`` on threshold crossings. Tests
inject a real LooperService with a fake engine so the firing path
through ``service.record(track)`` is exercised end-to-end.
"""

from __future__ import annotations

import pytest

from app.services.looper_auto_record_trigger import (
    DEFAULT_COOLDOWN_S,
    LooperAutoRecordTrigger,
    get_looper_auto_record_trigger,
    init_looper_auto_record_trigger,
    reset_looper_auto_record_trigger_for_tests,
)
from app.services.looper_service import (
    LooperService,
    TrackState,
    set_looper_service,
)


@pytest.fixture(autouse=True)
def _reset_singleton():
    reset_looper_auto_record_trigger_for_tests()
    yield
    reset_looper_auto_record_trigger_for_tests()
    set_looper_service(None)


class _FakeEngine:
    """Minimum engine binding the LooperService probes for."""

    def __init__(self) -> None:
        self.record_calls: list[int] = []
        self._recording: set[int] = set()

    def looper_record(self, track: int) -> None:
        self.record_calls.append(track)
        self._recording.add(track)

    def looper_stop(self, track: int) -> None:
        self._recording.discard(track)

    def looper_get_status(self) -> dict:
        return {
            "tracks": [
                {
                    "track": i,
                    "state": int(
                        TrackState.RECORDING if i in self._recording
                        else TrackState.EMPTY
                    ),
                    "loop_length_frames": 0,
                    "playhead_frames": 0,
                    "layer_count": 1 if i in self._recording else 0,
                    "level_db": 0.0,
                    "muted": False,
                    "soloed": False,
                    "reverse": False,
                    "half_speed": False,
                }
                for i in range(4)
            ],
            "active_track_count": len(self._recording),
            "sync_master": False,
            "master_level_db": 0.0,
        }


class _FakeClock:
    """Manual monotonic clock for cooldown tests."""

    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


# ---------------------------------------------------------------------------
# Firing happy path
# ---------------------------------------------------------------------------


def test_fires_record_when_armed_and_level_exceeds_threshold() -> None:
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_auto_armed(0, True)
    service.set_auto_threshold_db(0, -36.0)

    trigger = LooperAutoRecordTrigger(service=service)
    fired = trigger.push_input_level(0, -20.0)  # well above -36 dB
    assert fired is True
    assert engine.record_calls == [0]


def test_disarms_after_firing() -> None:
    """T2512-AUTO-TRIGGER fires once, then disarms the flag. The
    operator must re-arm explicitly for the next take."""
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_auto_armed(0, True)
    service.set_auto_threshold_db(0, -36.0)

    trigger = LooperAutoRecordTrigger(service=service)
    trigger.push_input_level(0, -10.0)
    status = service.get_status()
    assert status.tracks[0].auto_armed is False


def test_does_not_fire_when_not_armed() -> None:
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    # auto_armed defaults to False.
    trigger = LooperAutoRecordTrigger(service=service)
    fired = trigger.push_input_level(0, 0.0)  # 0 dB — way above threshold
    assert fired is False
    assert engine.record_calls == []


def test_does_not_fire_below_threshold() -> None:
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_auto_armed(0, True)
    service.set_auto_threshold_db(0, -24.0)

    trigger = LooperAutoRecordTrigger(service=service)
    fired = trigger.push_input_level(0, -30.0)  # 6 dB below threshold
    assert fired is False
    assert engine.record_calls == []


def test_does_not_fire_at_exactly_threshold() -> None:
    """Threshold is strict (>) — a level exactly at threshold should
    not fire (avoids edge-case fire on quiet noise floor)."""
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_auto_armed(0, True)
    service.set_auto_threshold_db(0, -24.0)

    trigger = LooperAutoRecordTrigger(service=service)
    fired = trigger.push_input_level(0, -24.0)  # equal to threshold
    assert fired is False


# ---------------------------------------------------------------------------
# State-machine guards
# ---------------------------------------------------------------------------


def test_does_not_fire_on_already_recording_track() -> None:
    """auto-record only fires on a fresh EMPTY track. A track already
    RECORDING / PLAYING / OVERDUBBING is owned by the operator's
    explicit state machine."""
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_auto_armed(0, True)
    service.set_auto_threshold_db(0, -36.0)
    service.record(0)  # state = RECORDING

    # Track 0 is RECORDING; auto_armed is still True (set_auto_armed
    # before record). Push a level — must NOT re-fire record.
    pre_count = len(engine.record_calls)
    trigger = LooperAutoRecordTrigger(service=service)
    fired = trigger.push_input_level(0, 0.0)
    assert fired is False
    assert len(engine.record_calls) == pre_count


def test_invalid_track_returns_false_without_raising() -> None:
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    trigger = LooperAutoRecordTrigger(service=service)
    # Above any reasonable track index.
    assert trigger.push_input_level(9, 0.0) is False
    assert trigger.push_input_level(-1, 0.0) is False


# ---------------------------------------------------------------------------
# Cooldown
# ---------------------------------------------------------------------------


def test_cooldown_blocks_immediate_refire() -> None:
    """Once a track fires, the trigger gates re-fires for the
    cooldown window. The cooldown matters when a caller might push
    multiple RMS samples within milliseconds of the first crossing."""
    clock = _FakeClock()
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_auto_armed(0, True)
    service.set_auto_threshold_db(0, -36.0)

    trigger = LooperAutoRecordTrigger(
        service=service, cooldown_s=0.050, clock_fn=clock
    )
    trigger.push_input_level(0, -10.0)
    assert engine.record_calls == [0]

    # Re-arm the operator flag (the trigger disarmed on fire) and
    # try again within the cooldown window. The cooldown gates the
    # second fire even though armed is back to True.
    service.set_auto_armed(0, True)
    clock.advance(0.020)  # 20 ms — still under the 50 ms cooldown
    fired = trigger.push_input_level(0, -10.0)
    assert fired is False
    assert engine.record_calls == [0]


def test_cooldown_clears_after_window_expires() -> None:
    clock = _FakeClock()
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_auto_armed(0, True)
    service.set_auto_threshold_db(0, -36.0)

    trigger = LooperAutoRecordTrigger(
        service=service, cooldown_s=0.050, clock_fn=clock
    )
    trigger.push_input_level(0, -10.0)
    # Re-arm + clear the loop so the second fire has a fresh empty track.
    service.set_auto_armed(0, True)
    service.stop_track(0)
    service.clear(0)
    clock.advance(0.060)  # past the 50 ms cooldown
    fired = trigger.push_input_level(0, -10.0)
    assert fired is True
    assert engine.record_calls == [0, 0]


def test_cooldown_is_per_track() -> None:
    """Track 0 firing must not gate track 1 from firing."""
    clock = _FakeClock()
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    for t in range(4):
        service.set_auto_armed(t, True)
        service.set_auto_threshold_db(t, -36.0)

    trigger = LooperAutoRecordTrigger(
        service=service, cooldown_s=0.050, clock_fn=clock
    )
    trigger.push_input_level(0, -10.0)
    assert engine.record_calls == [0]

    # Without advancing the clock, push track 1 — its cooldown
    # window has not started, so it fires.
    trigger.push_input_level(1, -10.0)
    assert engine.record_calls == [0, 1]


# ---------------------------------------------------------------------------
# Lifecycle / robustness
# ---------------------------------------------------------------------------


def test_no_service_resolves_returns_false() -> None:
    set_looper_service(None)
    trigger = LooperAutoRecordTrigger()
    # service=None falls back to get_looper_service() → None.
    assert trigger.push_input_level(0, 0.0) is False


def test_service_record_failure_does_not_raise() -> None:
    class _BoomService:
        def get_status(self):
            from app.services.looper_service import LooperService
            return LooperService().get_status()

        def record(self, *_a, **_k):
            raise RuntimeError("simulated record failure")

        def set_auto_armed(self, *_a, **_k):
            pass

    # Construct a service that returns "armed + above threshold" then
    # raises on record(). The trigger must swallow + log.
    real_engine = _FakeEngine()
    real_service = LooperService(engine=real_engine)
    real_service.set_auto_armed(0, True)
    real_service.set_auto_threshold_db(0, -36.0)

    class _BoomOnRecord:
        def __init__(self, base):
            self.base = base

        def __getattr__(self, name):
            if name == "record":
                def _boom(*_a, **_k):
                    raise RuntimeError("simulated")
                return _boom
            return getattr(self.base, name)

    trigger = LooperAutoRecordTrigger(service=_BoomOnRecord(real_service))
    fired = trigger.push_input_level(0, -10.0)
    # Did not raise; returns False because record() failed.
    assert fired is False


def test_init_singleton_is_idempotent() -> None:
    a = init_looper_auto_record_trigger()
    b = init_looper_auto_record_trigger()
    assert a is b
    assert get_looper_auto_record_trigger() is a


def test_get_returns_none_before_init() -> None:
    assert get_looper_auto_record_trigger() is None


def test_reset_clears_per_track_cooldown() -> None:
    clock = _FakeClock()
    clock.advance(1.0)  # any non-zero clock so the fire timestamp is observable
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_auto_armed(0, True)
    service.set_auto_threshold_db(0, -36.0)

    trigger = LooperAutoRecordTrigger(
        service=service, cooldown_s=0.050, clock_fn=clock
    )
    trigger.push_input_level(0, -10.0)
    assert trigger._last_fire_for_test()[0] > 0.0

    trigger.reset()
    assert trigger._last_fire_for_test() == [0.0, 0.0, 0.0, 0.0]


# ---------------------------------------------------------------------------
# Module-level defaults
# ---------------------------------------------------------------------------


def test_default_cooldown_is_50_ms() -> None:
    assert DEFAULT_COOLDOWN_S == 0.050

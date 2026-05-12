"""T2508-6 (rich path) — periodic broadcaster tests.

Covers the 15 fps tick producer that ships ``recorder_session_tick``
frames over ``RECORDER_SESSION_TOPIC`` for every in-flight ROLLING
session.
"""

from __future__ import annotations

import asyncio
from typing import Any, Optional

import pytest

from app.services.recorder_periodic_broadcaster import (
    RecorderPeriodicBroadcaster,
    _DEFAULT_SAMPLE_RATE,
)
from app.services.recorder_service import (
    RECORDER_SESSION_TOPIC,
    RecorderService,
)


# ---------------------------------------------------------------------------
# Helpers / fakes
# ---------------------------------------------------------------------------


class FakeEngine:
    """Mimics the pybind11 binding's ``recorder_get_status`` shape."""

    def __init__(self, status: Optional[dict[str, Any]] = None, raises: bool = False):
        self.status = status or {}
        self.raises = raises
        self.call_count = 0

    def recorder_get_status(self) -> dict[str, Any]:
        self.call_count += 1
        if self.raises:
            raise RuntimeError("engine binding angry")
        return dict(self.status)


class FakePublisher:
    """Collects every broadcast frame so tests can assert envelopes."""

    def __init__(self, raises: bool = False):
        self.frames: list[tuple[dict[str, Any], Optional[str]]] = []
        self.raises = raises

    async def __call__(self, frame: dict[str, Any], topic: Optional[str] = None) -> None:
        if self.raises:
            raise RuntimeError("ws broken")
        self.frames.append((frame, topic))


def _build_service() -> RecorderService:
    """Each test gets its own service so session maps don't bleed."""
    return RecorderService()


def _broadcaster(
    service: RecorderService,
    *,
    engine: Any = None,
    publisher: Optional[FakePublisher] = None,
    fps: float = 100.0,
    sample_rate: float = _DEFAULT_SAMPLE_RATE,
) -> tuple[RecorderPeriodicBroadcaster, FakePublisher]:
    pub = publisher if publisher is not None else FakePublisher()
    bcaster = RecorderPeriodicBroadcaster(
        service=service,
        engine=engine,
        fps=fps,
        sample_rate=sample_rate,
        ws_publisher=pub,
    )
    return bcaster, pub


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_idle_when_no_sessions_emits_nothing():
    """Empty session map → no broadcasts, no engine queries."""
    service = _build_service()
    engine = FakeEngine()
    bcaster, pub = _broadcaster(service, engine=engine)

    await bcaster._tick_once()

    assert pub.frames == []
    assert engine.call_count == 0


@pytest.mark.asyncio
async def test_armed_session_emits_no_tick():
    """ROLLING-only scope: ARMED sessions don't get periodic ticks."""
    service = _build_service()
    await service.arm_session(snapshot_id=1, tap_matrix={})

    engine = FakeEngine({"total_samples": 1234})
    bcaster, pub = _broadcaster(service, engine=engine)
    await bcaster._tick_once()

    assert pub.frames == []
    assert engine.call_count == 0


@pytest.mark.asyncio
async def test_rolling_session_emits_one_tick():
    service = _build_service()
    status = await service.arm_session(snapshot_id=42, tap_matrix={})
    await service.start_rolling(session_id=status.session_id)

    engine = FakeEngine(
        {
            "total_samples": 48000,
            "armed_at_iso": "2026-05-12T00:00:00Z",
            "pre_ring_overflow_count": 0,
            "post_ring_overflow_count": 1,
            "channel_overflow_count": 2,
        }
    )
    bcaster, pub = _broadcaster(service, engine=engine, sample_rate=48000.0)
    await bcaster._tick_once()

    assert len(pub.frames) == 1
    frame, topic = pub.frames[0]
    assert topic == RECORDER_SESSION_TOPIC
    assert frame["type"] == "recorder_session_tick"
    payload = frame["payload"]
    assert payload["session_id"] == status.session_id
    assert payload["snapshot_id"] == 42
    assert payload["state"] == "rolling"
    assert payload["elapsed_seconds"] == 1.0
    assert payload["total_samples"] == 48000
    assert payload["armed_at_iso"] == "2026-05-12T00:00:00Z"
    assert payload["pre_ring_overflow_count"] == 0
    assert payload["post_ring_overflow_count"] == 1
    assert payload["channel_overflow_count"] == 2
    # v2 placeholders explicitly null until the per-chain TapNode +
    # disk-writer counters ship.
    assert payload["disk_bytes_written"] is None
    assert payload["take_counts_by_chain"] is None
    assert payload["peak_levels_by_tap"] is None


@pytest.mark.asyncio
async def test_stopped_session_emits_no_tick():
    service = _build_service()
    s = await service.arm_session(snapshot_id=1, tap_matrix={})
    await service.start_rolling(session_id=s.session_id)
    await service.stop(session_id=s.session_id)

    engine = FakeEngine({"total_samples": 4800})
    bcaster, pub = _broadcaster(service, engine=engine)
    await bcaster._tick_once()

    assert pub.frames == []
    assert engine.call_count == 0


@pytest.mark.asyncio
async def test_multi_rolling_sessions_share_one_engine_status_call():
    """Engine status is queried once per tick, then projected per
    session — keeps engine-binding load constant regardless of how
    many sessions are rolling (single-session engine v1)."""
    service = _build_service()
    a = await service.arm_session(snapshot_id=1, tap_matrix={})
    b = await service.arm_session(snapshot_id=2, tap_matrix={})
    await service.start_rolling(session_id=a.session_id)
    await service.start_rolling(session_id=b.session_id)

    engine = FakeEngine({"total_samples": 96000})
    bcaster, pub = _broadcaster(service, engine=engine, sample_rate=48000.0)
    await bcaster._tick_once()

    assert engine.call_count == 1  # one engine call services both sessions
    assert len(pub.frames) == 2
    session_ids = {f[0]["payload"]["session_id"] for f in pub.frames}
    assert session_ids == {a.session_id, b.session_id}
    # Same engine counters projected onto both frames
    for frame, _ in pub.frames:
        assert frame["payload"]["elapsed_seconds"] == 2.0
        assert frame["payload"]["total_samples"] == 96000


@pytest.mark.asyncio
async def test_engine_error_does_not_break_tick():
    """Engine raising → Python-side state still ships; engine fields null."""
    service = _build_service()
    s = await service.arm_session(snapshot_id=7, tap_matrix={})
    await service.start_rolling(session_id=s.session_id)

    engine = FakeEngine(raises=True)
    bcaster, pub = _broadcaster(service, engine=engine)
    await bcaster._tick_once()

    assert len(pub.frames) == 1
    payload = pub.frames[0][0]["payload"]
    assert payload["session_id"] == s.session_id
    assert payload["state"] == "rolling"
    assert payload["total_samples"] is None
    assert payload["elapsed_seconds"] is None
    assert payload["armed_at_iso"] is None
    assert payload["pre_ring_overflow_count"] is None


@pytest.mark.asyncio
async def test_engine_returns_active_false_still_emits_tick():
    """Engine v1 reports active=false during the brief window between
    the audio callback's last push and the writer's drain. Python state
    is authoritative for 'rolling' — keep emitting ticks."""
    service = _build_service()
    s = await service.arm_session(snapshot_id=3, tap_matrix={})
    await service.start_rolling(session_id=s.session_id)

    engine = FakeEngine({"active": False})
    bcaster, pub = _broadcaster(service, engine=engine)
    await bcaster._tick_once()

    assert len(pub.frames) == 1
    payload = pub.frames[0][0]["payload"]
    assert payload["state"] == "rolling"
    assert payload["total_samples"] is None
    assert payload["elapsed_seconds"] is None


@pytest.mark.asyncio
async def test_no_engine_binding_still_emits_tick():
    """Engine None → ticks fire with engine fields null. Same path as
    pre-T2507-5b backends where the SO predates the bindings."""
    service = _build_service()
    s = await service.arm_session(snapshot_id=9, tap_matrix={})
    await service.start_rolling(session_id=s.session_id)

    bcaster, pub = _broadcaster(service, engine=None)
    await bcaster._tick_once()

    assert len(pub.frames) == 1
    payload = pub.frames[0][0]["payload"]
    assert payload["total_samples"] is None
    assert payload["pre_ring_overflow_count"] is None


@pytest.mark.asyncio
async def test_engine_without_status_method_silent_no_engine_call():
    """Engine SO missing recorder_get_status binding → ticks still
    fire, engine fields null, no AttributeError."""
    class BareEngine:
        pass

    service = _build_service()
    s = await service.arm_session(snapshot_id=2, tap_matrix={})
    await service.start_rolling(session_id=s.session_id)

    bcaster, pub = _broadcaster(service, engine=BareEngine())
    await bcaster._tick_once()
    assert len(pub.frames) == 1
    assert pub.frames[0][0]["payload"]["total_samples"] is None


@pytest.mark.asyncio
async def test_broadcast_failure_isolated_per_session():
    """A failing publish must not stop the loop or other sessions'
    frames from going out."""
    service = _build_service()
    a = await service.arm_session(snapshot_id=1, tap_matrix={})
    b = await service.arm_session(snapshot_id=2, tap_matrix={})
    await service.start_rolling(session_id=a.session_id)
    await service.start_rolling(session_id=b.session_id)

    # Custom publisher: fail on the first frame, succeed on the second
    delivered: list[dict[str, Any]] = []
    call_idx = {"n": 0}

    async def flaky(frame, topic=None):
        call_idx["n"] += 1
        if call_idx["n"] == 1:
            raise RuntimeError("first frame angry")
        delivered.append(frame)

    engine = FakeEngine({"total_samples": 1024})
    bcaster = RecorderPeriodicBroadcaster(
        service=service,
        engine=engine,
        fps=100.0,
        sample_rate=48000.0,
        ws_publisher=flaky,
    )
    await bcaster._tick_once()

    # Two publish attempts; one succeeded after one failure
    assert call_idx["n"] == 2
    assert len(delivered) == 1


@pytest.mark.asyncio
async def test_frame_envelope_distinct_from_transition_type():
    """Tick frames use `recorder_session_tick`, not `recorder_session` —
    keeps consumers from double-handling lifecycle vs heartbeat."""
    service = _build_service()
    s = await service.arm_session(snapshot_id=1, tap_matrix={})
    await service.start_rolling(session_id=s.session_id)

    bcaster, pub = _broadcaster(service, engine=FakeEngine({"total_samples": 0}))
    await bcaster._tick_once()
    assert pub.frames[0][0]["type"] == "recorder_session_tick"


@pytest.mark.asyncio
async def test_fps_period_derivation():
    bcaster, _ = _broadcaster(_build_service(), fps=15.0)
    assert pytest.approx(bcaster.period_seconds, rel=1e-9) == 1.0 / 15.0
    bcaster2, _ = _broadcaster(_build_service(), fps=30.0)
    assert pytest.approx(bcaster2.period_seconds, rel=1e-9) == 1.0 / 30.0


@pytest.mark.asyncio
async def test_start_stop_lifecycle_is_clean():
    """start() schedules the task; stop() cancels + drains it."""
    service = _build_service()
    bcaster, pub = _broadcaster(service, fps=200.0)  # short period
    assert not bcaster.is_running

    bcaster.start()
    assert bcaster.is_running

    # Give the loop a moment to spin
    await asyncio.sleep(0.02)
    await bcaster.stop()
    assert not bcaster.is_running


@pytest.mark.asyncio
async def test_start_is_idempotent():
    """Calling start() twice returns the same task, doesn't spawn two
    loops."""
    bcaster, _ = _broadcaster(_build_service(), fps=200.0)
    t1 = bcaster.start()
    t2 = bcaster.start()
    assert t1 is t2
    await bcaster.stop()


@pytest.mark.asyncio
async def test_running_loop_actually_emits_ticks():
    """Full loop integration: spin the broadcaster, arm + roll a
    session, observe at least one frame land on the publisher."""
    service = _build_service()
    s = await service.arm_session(snapshot_id=11, tap_matrix={})
    await service.start_rolling(session_id=s.session_id)

    engine = FakeEngine({"total_samples": 480})
    pub = FakePublisher()
    bcaster = RecorderPeriodicBroadcaster(
        service=service,
        engine=engine,
        fps=200.0,
        ws_publisher=pub,
    )
    bcaster.start()
    try:
        # 200 fps → 5 ms period; give a 30 ms budget to see multiple frames
        await asyncio.sleep(0.03)
    finally:
        await bcaster.stop()

    assert len(pub.frames) >= 1
    assert pub.frames[0][0]["type"] == "recorder_session_tick"
    assert pub.frames[0][0]["payload"]["session_id"] == s.session_id


@pytest.mark.asyncio
async def test_coerces_non_int_counter_to_none():
    """If the engine ever returns a malformed counter (string, None,
    nan) we project null rather than crash the broadcaster."""
    service = _build_service()
    s = await service.arm_session(snapshot_id=1, tap_matrix={})
    await service.start_rolling(session_id=s.session_id)

    engine = FakeEngine({
        "total_samples": "not-an-int",
        "pre_ring_overflow_count": None,
        "post_ring_overflow_count": "boom",
    })
    bcaster, pub = _broadcaster(service, engine=engine)
    await bcaster._tick_once()
    payload = pub.frames[0][0]["payload"]
    assert payload["total_samples"] is None
    assert payload["elapsed_seconds"] is None
    assert payload["pre_ring_overflow_count"] is None
    assert payload["post_ring_overflow_count"] is None

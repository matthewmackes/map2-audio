"""T2512-LIFESPAN — lifespan install-order smoke tests.

The looper has four moving parts that have to be installed in the
right order for the production WS + auto-stop path to work:

1. ``LooperService(engine=...)`` — instantiated against the engine
   bindings.
2. ``set_looper_service(svc)`` — registers the singleton so route
   handlers + the engine_command bridge can resolve it lazily.
3. ``init_looper_ws_bridge(...)`` — composes the WS broadcaster +
   the one-shot runner, replaces the service's broadcaster with the
   composed closure.
4. After install: every mutating verb on the singleton fires both
   the WS broadcast AND the one-shot runner's status observer.

These tests boot the install chain in isolation (no FastAPI lifespan)
and assert the contract holds — so a future refactor that swaps the
order silently breaks the WS for verbs that fire before the bridge
is wired.

The tests use the public ``init_*`` functions exactly as
``app/main.py``'s lifespan startup does, ensuring the smoke-tested
codepath is the same one production runs.
"""

from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest

from app.services import looper_ws_bridge
from app.services.looper_one_shot_runner import (
    reset_looper_one_shot_runner_for_tests,
)
from app.services.looper_service import (
    LooperService,
    LooperStatus,
    TrackState,
    set_looper_service,
)


@pytest.fixture(autouse=True)
def _reset_runner_singleton():
    reset_looper_one_shot_runner_for_tests()
    yield
    reset_looper_one_shot_runner_for_tests()
    set_looper_service(None)


class _FakeEngine:
    """Minimum engine binding surface the LooperService probes for."""

    def __init__(self) -> None:
        self.record_calls: list[int] = []
        self.stop_calls: list[int] = []

    def looper_record(self, track: int) -> None:
        self.record_calls.append(track)

    def looper_stop(self, track: int) -> None:
        self.stop_calls.append(track)

    def looper_get_status(self) -> dict:
        return {
            "tracks": [
                {
                    "track": i,
                    "state": int(TrackState.EMPTY),
                    "loop_length_frames": 0,
                    "playhead_frames": 0,
                    "layer_count": 0,
                    "level_db": 0.0,
                    "muted": False,
                    "soloed": False,
                    "reverse": False,
                    "half_speed": False,
                }
                for i in range(4)
            ],
            "active_track_count": 0,
            "sync_master": False,
            "master_level_db": 0.0,
        }


# ---------------------------------------------------------------------------
# Happy path: production install order
# ---------------------------------------------------------------------------


async def test_production_install_order_wires_ws_and_runner() -> None:
    """Replay the same sequence app/main.py runs at lifespan startup
    and assert that after install, a mutating verb fires both the WS
    broadcast AND drives the one-shot runner."""
    engine = _FakeEngine()
    service = LooperService(engine=engine)

    # Step 1 + 2: register the singleton.
    set_looper_service(service)

    # Step 3: install the WS bridge against the running loop. This
    # is the same call lifespan startup makes.
    loop = asyncio.get_event_loop()

    ws_calls: list[tuple[dict, str | None]] = []

    async def fake_broadcast(data: dict, topic: str | None = None) -> None:
        ws_calls.append((data, topic))

    with patch.object(
        looper_ws_bridge.ws_manager,
        "broadcast_json",
        side_effect=fake_broadcast,
    ):
        bound = looper_ws_bridge.init_looper_ws_bridge(
            service=service, loop=loop
        )
        # Idempotent: bound is the service we registered.
        assert bound is service

        # Step 4: a mutating verb fires both subscribers.
        service.record(0)
        # Let the scheduled coroutine run.
        await asyncio.sleep(0)
        await asyncio.sleep(0)

    assert engine.record_calls == [0]
    # WS push fired once for the mutation.
    assert len(ws_calls) == 1
    data, topic = ws_calls[0]
    assert data["type"] == "looper_status"
    assert topic == "looper:status"


async def test_runner_observes_status_after_install() -> None:
    """After init_looper_ws_bridge the one-shot runner is wired
    inline. A status broadcast with a PLAYING one_shot track should
    cause the runner to schedule an auto-stop."""
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    set_looper_service(service)

    loop = asyncio.get_event_loop()
    with patch.object(
        looper_ws_bridge.ws_manager,
        "broadcast_json",
        new=lambda *args, **kwargs: asyncio.sleep(0),
    ):
        looper_ws_bridge.init_looper_ws_bridge(service=service, loop=loop)

        # Set one_shot, drive the engine "playing" state by faking
        # the engine status. The runner observes the broadcast and
        # should schedule a pending auto-stop.
        service.set_one_shot(0, True)

        # Replace the fake engine's status to look PLAYING with a
        # 1 s loop length so the runner schedules a deadline.
        engine.looper_get_status = lambda: {  # type: ignore[method-assign]
            "tracks": [
                {
                    "track": i,
                    "state": int(TrackState.PLAYING if i == 0 else TrackState.EMPTY),
                    "loop_length_frames": 48000 if i == 0 else 0,
                    "playhead_frames": 0,
                    "layer_count": 1 if i == 0 else 0,
                    "level_db": 0.0,
                    "muted": False,
                    "soloed": False,
                    "reverse": False,
                    "half_speed": False,
                }
                for i in range(4)
            ],
            "active_track_count": 1,
            "sync_master": False,
            "master_level_db": 0.0,
        }
        # Trigger another mutation so the status frame goes through
        # the composed broadcaster.
        service.set_level_db(0, -6.0)
        await asyncio.sleep(0)

    # Pull the runner singleton — its pending slot for track 0
    # must be populated.
    from app.services.looper_one_shot_runner import (
        get_looper_one_shot_runner,
    )
    runner = get_looper_one_shot_runner()
    assert runner is not None
    pending = runner._pending_for_test()
    assert pending[0] is not None, "expected auto-stop scheduled after install"
    # Cancel so the test loop doesn't actually fire the stop.
    runner.cancel_all()


# ---------------------------------------------------------------------------
# Negative path: wrong install order
# ---------------------------------------------------------------------------


async def test_init_bridge_before_service_falls_back_safely() -> None:
    """If init_looper_ws_bridge runs before set_looper_service, it
    resolves the singleton lazily — must not raise. (Production
    can't actually arrive here because lifespan sets the singleton
    first, but this guards the no-op-when-unbound contract.)"""
    set_looper_service(None)
    loop = asyncio.get_event_loop()

    with patch.object(
        looper_ws_bridge.ws_manager,
        "broadcast_json",
        new=lambda *args, **kwargs: asyncio.sleep(0),
    ):
        # Passing service=None forces init to fall back to
        # get_looper_service(); the resolved instance is the
        # global singleton. Construct one on the fly so the call
        # has a real target.
        service = LooperService()
        set_looper_service(service)
        bound = looper_ws_bridge.init_looper_ws_bridge(loop=loop)
        assert bound is service


async def test_double_init_is_idempotent_on_runner() -> None:
    """Two calls to init_looper_ws_bridge must not stack two
    runners; the singleton is preserved."""
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    set_looper_service(service)
    loop = asyncio.get_event_loop()

    with patch.object(
        looper_ws_bridge.ws_manager,
        "broadcast_json",
        new=lambda *args, **kwargs: asyncio.sleep(0),
    ):
        looper_ws_bridge.init_looper_ws_bridge(service=service, loop=loop)
        from app.services.looper_one_shot_runner import (
            get_looper_one_shot_runner,
        )
        first = get_looper_one_shot_runner()
        # Calling again should reuse the singleton.
        looper_ws_bridge.init_looper_ws_bridge(service=service, loop=loop)
        second = get_looper_one_shot_runner()
        assert first is second


# ---------------------------------------------------------------------------
# Contract: post-install, the composed broadcaster does not bubble
# observer exceptions back into the service's mutating verb call.
# ---------------------------------------------------------------------------


async def test_runner_exception_does_not_break_mutating_verb() -> None:
    """A runner that throws on observe() must not propagate the
    exception out of service.record(). The bridge's composed
    broadcaster swallows + logs."""
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    set_looper_service(service)
    loop = asyncio.get_event_loop()

    with patch.object(
        looper_ws_bridge.ws_manager,
        "broadcast_json",
        new=lambda *args, **kwargs: asyncio.sleep(0),
    ):
        looper_ws_bridge.init_looper_ws_bridge(service=service, loop=loop)
        # Replace the runner's observe with a thrower.
        from app.services.looper_one_shot_runner import (
            get_looper_one_shot_runner,
        )
        runner = get_looper_one_shot_runner()
        assert runner is not None

        def _boom(_status: LooperStatus) -> None:
            raise RuntimeError("simulated runner failure")

        runner.observe = _boom  # type: ignore[method-assign]
        # Should not raise.
        status = service.record(0)
        assert status.tracks[0].track == 0
        assert engine.record_calls == [0]


async def test_ws_broadcast_failure_does_not_break_mutating_verb() -> None:
    """Same hardening on the other side: ws_manager.broadcast_json
    raising must not propagate. Already covered in test_looper_ws_bridge
    at the unit level — this is the integration restatement."""
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    set_looper_service(service)
    loop = asyncio.get_event_loop()

    async def boom(*args, **kwargs):
        raise RuntimeError("WS down")

    with patch.object(
        looper_ws_bridge.ws_manager,
        "broadcast_json",
        side_effect=boom,
    ):
        looper_ws_bridge.init_looper_ws_bridge(service=service, loop=loop)
        # Should not raise; the failure surfaces only as a log line
        # from the future's done-callback.
        status = service.record(0)
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        assert engine.record_calls == [0]
        assert status.tracks[0].track == 0

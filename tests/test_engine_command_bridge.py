"""Tests for the engine-command bridge wiring.

Covers the production hook that connects the dispatcher's
``snapshot.recall`` handler to a real activation service, the
loop-from-thread bridging, and graceful failure when the controller-host
isn't reachable.
"""

from __future__ import annotations

import asyncio
import threading
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.engine_command_bridge import (
    EngineCommandBridge,
    get_engine_command_bridge,
    init_engine_command_bridge,
    reset_engine_command_bridge_for_tests,
)


@pytest.fixture(autouse=True)
def _reset_bridge_singleton():
    reset_engine_command_bridge_for_tests()
    yield
    reset_engine_command_bridge_for_tests()


def _engine_command_frame(
    target: str = "audio.snapshot.recall",
    action: str = "set",
    value: float = 13.0,
) -> dict:
    """Minimum-viable frame matching the dispatcher's input contract."""
    return {
        "type": "engine_command",
        "msg_id": "test-msg-1",
        "schema_version": 1,
        "controller_key": "test/controller",
        "target": target,
        "action": action,
        "value": value,
        "args": [],
    }


def test_init_is_idempotent():
    loop = asyncio.new_event_loop()
    try:
        first = init_engine_command_bridge(loop)
        second = init_engine_command_bridge(loop)
        assert first is second
        assert get_engine_command_bridge() is first
    finally:
        loop.close()


def test_get_returns_none_before_init():
    assert get_engine_command_bridge() is None


def test_dispatch_engine_command_routes_snapshot_recall():
    """The bridge wires the dispatcher's snapshot.recall handler to the
    bridge's _recall_snapshot_hook. Dispatching a recall frame must
    schedule the activation coroutine onto the bridge's loop."""
    loop = asyncio.new_event_loop()
    try:
        bridge = EngineCommandBridge(loop)

        captured: dict = {}

        async def _fake_activate(snapshot_id: int) -> dict:
            captured["snapshot_id"] = snapshot_id
            return {"status": "ok"}

        # Replace the async activator with a stub that doesn't touch DB.
        with patch.object(
            bridge, "_activate_snapshot", side_effect=_fake_activate
        ):
            # Run the loop in a background thread so the
            # run_coroutine_threadsafe call has a target.
            t = threading.Thread(target=loop.run_forever, daemon=True)
            t.start()
            try:
                bridge.dispatch_engine_command(_engine_command_frame(value=42))
                # Give the scheduled coroutine a moment to run.
                deadline = time.monotonic() + 2.0
                while "snapshot_id" not in captured and time.monotonic() < deadline:
                    time.sleep(0.02)
            finally:
                loop.call_soon_threadsafe(loop.stop)
                t.join(timeout=2.0)

        assert captured == {"snapshot_id": 42}
    finally:
        loop.close()


def test_dispatch_ignores_non_set_action():
    """The snapshot.recall handler is a 'set'-only target; toggle/inc
    must be silently dropped without invoking the activator."""
    loop = asyncio.new_event_loop()
    try:
        bridge = EngineCommandBridge(loop)
        with patch.object(bridge, "_activate_snapshot") as mock_activate:
            bridge.dispatch_engine_command(
                _engine_command_frame(action="toggle", value=42)
            )
            # No coroutine scheduled — nothing to run.
            time.sleep(0.05)
            assert not mock_activate.called
    finally:
        loop.close()


def test_dispatch_unknown_target_no_op():
    """Frames targeting unknown actions reach the dispatcher's pattern
    table; misses log a warning but must not raise."""
    loop = asyncio.new_event_loop()
    try:
        bridge = EngineCommandBridge(loop)
        with patch.object(bridge, "_activate_snapshot") as mock_activate:
            bridge.dispatch_engine_command(
                _engine_command_frame(target="audio.unknown.target")
            )
            assert not mock_activate.called
    finally:
        loop.close()


def test_recall_hook_logs_failure_without_raising():
    """When the activation coroutine raises, the bridge swallows it via
    the future's done-callback and logs. The reader thread must not
    propagate the exception (would kill the subscription)."""
    loop = asyncio.new_event_loop()

    async def _boom(snapshot_id: int) -> dict:
        raise RuntimeError("simulated activation failure")

    try:
        bridge = EngineCommandBridge(loop)
        with patch.object(bridge, "_activate_snapshot", side_effect=_boom):
            t = threading.Thread(target=loop.run_forever, daemon=True)
            t.start()
            try:
                bridge.dispatch_engine_command(_engine_command_frame(value=99))
                # Give the future + done-callback a moment to fire.
                time.sleep(0.3)
            finally:
                loop.call_soon_threadsafe(loop.stop)
                t.join(timeout=2.0)
        # No exception bubbled out → test passes.
    finally:
        loop.close()


def test_start_subscription_returns_false_when_host_unreachable():
    """If the controller-host isn't running, the bridge must return
    False (not raise) so app startup can proceed."""
    loop = asyncio.new_event_loop()
    try:
        bridge = EngineCommandBridge(loop)
        # Patch wait_for_daemon to immediately report unreachable.
        fake_client = MagicMock()
        fake_client.wait_for_daemon.return_value = False
        with patch(
            "app.services.midi_host_client.MidiHostClient",
            return_value=fake_client,
        ):
            ok = bridge.start_subscription(wait_timeout_s=0.1)
        assert ok is False
    finally:
        loop.close()


def test_stop_subscription_is_idempotent():
    """Calling stop_subscription with no live subscription is a no-op
    so shutdown ordering is forgiving."""
    loop = asyncio.new_event_loop()
    try:
        bridge = EngineCommandBridge(loop)
        bridge.stop_subscription()  # No active subscription — must not raise.
    finally:
        loop.close()


# ---------------------------------------------------------------------------
# T2512-MIDI / T2512-LOCK-MIDI — looper hook end-to-end coverage.
#
# The bridge's _looper_call / _looper_call_master closures resolve the
# LooperService singleton at call time, so a test can inject a fake
# service via ``set_looper_service`` and assert the dispatched frame
# reaches the right method with the right args.
# ---------------------------------------------------------------------------


def _looper_frame(target: str, action: str = "set", value: float | None = 1.0) -> dict:
    frame: dict = {
        "type": "engine_command",
        "msg_id": "looper-test",
        "schema_version": 1,
        "controller_key": "test/controller",
        "target": target,
        "action": action,
    }
    if value is not None:
        frame["value"] = value
    return frame


class _FakeLooperService:
    """Stub that mirrors the LooperService surface the bridge invokes."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple, dict]] = []

    def __getattr__(self, name: str):
        def _record(*args, **kwargs):
            self.calls.append((name, args, kwargs))
            return None
        return _record


def test_looper_stomp_dispatch_routes_to_service_method():
    """audio.looper.<n>.record frame ⇒ LooperService.record(n)."""
    from app.services.looper_service import set_looper_service

    loop = asyncio.new_event_loop()
    fake = _FakeLooperService()
    try:
        set_looper_service(fake)  # type: ignore[arg-type]
        bridge = EngineCommandBridge(loop)
        bridge.dispatch_engine_command(
            _looper_frame("audio.looper.2.record", value=127.0)
        )
        assert fake.calls == [("record", (2,), {})]
    finally:
        set_looper_service(None)
        loop.close()


def test_looper_stop_dispatch_routes_to_stop_track_method():
    """The bridge maps ``looper_stop`` hook → ``service.stop_track(n)``
    (not ``stop``) because LooperService's public method is named
    ``stop_track`` to avoid shadowing the bool ``stop`` flag."""
    from app.services.looper_service import set_looper_service

    loop = asyncio.new_event_loop()
    fake = _FakeLooperService()
    try:
        set_looper_service(fake)  # type: ignore[arg-type]
        bridge = EngineCommandBridge(loop)
        bridge.dispatch_engine_command(
            _looper_frame("audio.looper.1.stop", value=127.0)
        )
        assert fake.calls == [("stop_track", (1,), {})]
    finally:
        set_looper_service(None)
        loop.close()


def test_looper_level_setter_routes_with_clamped_db_value():
    """audio.looper.<n>.level with value=-12.0 ⇒
    LooperService.set_level_db(n, -12.0)."""
    from app.services.looper_service import set_looper_service

    loop = asyncio.new_event_loop()
    fake = _FakeLooperService()
    try:
        set_looper_service(fake)  # type: ignore[arg-type]
        bridge = EngineCommandBridge(loop)
        bridge.dispatch_engine_command(
            _looper_frame("audio.looper.0.level", value=-12.0)
        )
        assert fake.calls == [("set_level_db", (0, -12.0), {})]
    finally:
        set_looper_service(None)
        loop.close()


def test_looper_bool_setter_routes_with_bool_value():
    """audio.looper.<n>.muted action=set value=1.0 ⇒
    LooperService.set_muted(n, True)."""
    from app.services.looper_service import set_looper_service

    loop = asyncio.new_event_loop()
    fake = _FakeLooperService()
    try:
        set_looper_service(fake)  # type: ignore[arg-type]
        bridge = EngineCommandBridge(loop)
        bridge.dispatch_engine_command(
            _looper_frame("audio.looper.3.muted", action="set", value=1.0)
        )
        assert fake.calls == [("set_muted", (3, True), {})]
    finally:
        set_looper_service(None)
        loop.close()


def test_looper_locked_setter_routes_to_set_locked():
    """T2512-LOCK-MIDI. audio.looper.<n>.locked ⇒
    LooperService.set_locked(n, bool)."""
    from app.services.looper_service import set_looper_service

    loop = asyncio.new_event_loop()
    fake = _FakeLooperService()
    try:
        set_looper_service(fake)  # type: ignore[arg-type]
        bridge = EngineCommandBridge(loop)
        bridge.dispatch_engine_command(
            _looper_frame("audio.looper.2.locked", action="set", value=1.0)
        )
        assert fake.calls == [("set_locked", (2, True), {})]
    finally:
        set_looper_service(None)
        loop.close()


def test_looper_master_level_routes_to_master_method():
    """audio.looper.master.level value=-3.0 ⇒
    LooperService.set_master_level_db(-3.0). Note: no track index — the
    bridge uses a separate closure for this exact target."""
    from app.services.looper_service import set_looper_service

    loop = asyncio.new_event_loop()
    fake = _FakeLooperService()
    try:
        set_looper_service(fake)  # type: ignore[arg-type]
        bridge = EngineCommandBridge(loop)
        bridge.dispatch_engine_command(
            _looper_frame("audio.looper.master.level", value=-3.0)
        )
        assert fake.calls == [("set_master_level_db", (-3.0,), {})]
    finally:
        set_looper_service(None)
        loop.close()


def test_looper_dispatch_with_no_service_logs_and_drops():
    """If LooperService isn't wired (lifespan ordering: bridge can come
    up before the engine), the hook logs and drops without raising."""
    from app.services.looper_service import set_looper_service

    loop = asyncio.new_event_loop()
    try:
        set_looper_service(None)  # ensure unbound
        bridge = EngineCommandBridge(loop)
        # Should not raise.
        bridge.dispatch_engine_command(
            _looper_frame("audio.looper.0.record", value=127.0)
        )
    finally:
        loop.close()


def test_looper_service_method_exception_is_logged_not_raised():
    """A buggy LooperService method must not bubble out of the
    dispatcher reader-thread — the bridge wraps each invocation in
    a try/except that just logs."""
    from app.services.looper_service import set_looper_service

    loop = asyncio.new_event_loop()

    class _BoomService:
        def record(self, *_a, **_k):
            raise RuntimeError("simulated record failure")

    try:
        set_looper_service(_BoomService())  # type: ignore[arg-type]
        bridge = EngineCommandBridge(loop)
        # Should not raise.
        bridge.dispatch_engine_command(
            _looper_frame("audio.looper.0.record", value=127.0)
        )
    finally:
        set_looper_service(None)
        loop.close()


# ---------------------------------------------------------------------------
# T2512-PRESET-DISPATCH — bridge wires save/apply/delete to LooperService.
# ---------------------------------------------------------------------------


def _preset_frame(target: str, name: str) -> dict:
    """Engine-command frame with ``args=[name]`` (T2512-PRESET-DISPATCH
    carries the preset name in args[0], not value)."""
    return {
        "type": "engine_command",
        "msg_id": "preset-test",
        "schema_version": 1,
        "controller_key": "test/controller",
        "target": target,
        "action": "set",
        "args": [name],
    }


def test_looper_preset_save_dispatch_routes_to_save_preset():
    """audio.looper.preset.save args=[name] ⇒ LooperService.save_preset(name)."""
    from app.services.looper_service import set_looper_service

    loop = asyncio.new_event_loop()
    fake = _FakeLooperService()
    try:
        set_looper_service(fake)  # type: ignore[arg-type]
        bridge = EngineCommandBridge(loop)
        bridge.dispatch_engine_command(_preset_frame("audio.looper.preset.save", "set-a"))
        assert fake.calls == [("save_preset", ("set-a",), {})]
    finally:
        set_looper_service(None)
        loop.close()


def test_looper_preset_apply_dispatch_routes_to_apply_preset():
    from app.services.looper_service import set_looper_service

    loop = asyncio.new_event_loop()
    fake = _FakeLooperService()
    try:
        set_looper_service(fake)  # type: ignore[arg-type]
        bridge = EngineCommandBridge(loop)
        bridge.dispatch_engine_command(
            _preset_frame("audio.looper.preset.apply", "verse-1")
        )
        assert fake.calls == [("apply_preset", ("verse-1",), {})]
    finally:
        set_looper_service(None)
        loop.close()


def test_looper_preset_delete_dispatch_routes_to_delete_preset():
    from app.services.looper_service import set_looper_service

    loop = asyncio.new_event_loop()
    fake = _FakeLooperService()
    try:
        set_looper_service(fake)  # type: ignore[arg-type]
        bridge = EngineCommandBridge(loop)
        bridge.dispatch_engine_command(
            _preset_frame("audio.looper.preset.delete", "old-take")
        )
        assert fake.calls == [("delete_preset", ("old-take",), {})]
    finally:
        set_looper_service(None)
        loop.close()


def test_looper_preset_service_error_does_not_raise():
    """LooperServiceError (preset_limit / preset_not_found) must be
    caught inside _looper_call_preset so the reader thread keeps
    running."""
    from app.services.looper_service import set_looper_service

    loop = asyncio.new_event_loop()

    class _BoomService:
        def apply_preset(self, *_a, **_k):
            raise RuntimeError("simulated preset_not_found")

    try:
        set_looper_service(_BoomService())  # type: ignore[arg-type]
        bridge = EngineCommandBridge(loop)
        # Should not raise.
        bridge.dispatch_engine_command(
            _preset_frame("audio.looper.preset.apply", "ghost")
        )
    finally:
        set_looper_service(None)
        loop.close()

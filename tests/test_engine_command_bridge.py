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

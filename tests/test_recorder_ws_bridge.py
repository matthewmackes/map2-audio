"""T2508-6 — Recorder WS bridge tests.

Covers the bridge that ships RecorderSessionStatus transitions onto
RECORDER_SESSION_TOPIC via ws_manager.broadcast_json:
  - Frame envelope shape (`{type, payload}`).
  - `broadcast_recorder_session_status` calls `ws_manager.broadcast_json`
    with the correct topic.
  - `init_recorder_ws_bridge` binds the broadcaster to the singleton;
    state-machine transitions afterward emit on the topic.
  - Broadcast failures inside `ws_manager` are logged + swallowed (no
    state-machine break).
  - RecorderService.replace_broadcaster + replace_transport surface
    swaps wiring without rebuilding the singleton or losing in-flight
    sessions.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import pytest

from app.services import recorder_ws_bridge
from app.services.recorder_service import (
    RECORDER_SESSION_TOPIC,
    RecorderService,
    RecorderSessionStatus,
    RecorderSessionState,
    RecorderVerb,
    set_recorder_service,
)


# ---------------------------------------------------------------------------
# Frame shape
# ---------------------------------------------------------------------------


async def test_broadcast_frame_has_type_and_payload_envelope() -> None:
    """`broadcast_recorder_session_status` wraps the payload in a
    `{type: 'recorder_session', payload: {...}}` envelope so multi-
    topic clients can demux."""
    captured: list[tuple[dict, str | None]] = []

    async def fake_broadcast(data: dict, topic: str | None = None) -> None:
        captured.append((data, topic))

    status = RecorderSessionStatus(
        session_id="sess-1",
        snapshot_id=42,
        state=RecorderSessionState.ARMED,
        armed=True,
        rolling=False,
        started_at="2026-05-11T18:00:00+00:00",
        rolling_at=None,
        stopped_at=None,
        tap_matrix={"chain-a": {"pre_fx": True, "post_fx": False}},
        participating_nodes=["map2-prod-01"],
    )

    with patch.object(
        recorder_ws_bridge.ws_manager,
        "broadcast_json",
        side_effect=fake_broadcast,
    ):
        await recorder_ws_bridge.broadcast_recorder_session_status(status)

    assert len(captured) == 1
    data, topic = captured[0]
    assert topic == RECORDER_SESSION_TOPIC
    assert data["type"] == "recorder_session"
    assert data["payload"] == status.to_payload()


async def test_broadcast_failure_is_logged_and_swallowed() -> None:
    """`ws_manager.broadcast_json` raising must not propagate — the
    bridge catches + logs so a misbehaving WS layer can't break the
    RecorderService state machine."""

    async def boom(data: dict, topic: str | None = None) -> None:
        raise RuntimeError("ws queue full")

    status = RecorderSessionStatus(
        session_id="sess-1",
        snapshot_id=1,
        state=RecorderSessionState.ARMED,
        armed=True,
        rolling=False,
        started_at="2026-05-11T18:00:00+00:00",
        rolling_at=None,
        stopped_at=None,
        tap_matrix={},
        participating_nodes=[],
    )

    with patch.object(
        recorder_ws_bridge.ws_manager,
        "broadcast_json",
        side_effect=boom,
    ):
        # Must NOT raise.
        await recorder_ws_bridge.broadcast_recorder_session_status(status)


# ---------------------------------------------------------------------------
# init_recorder_ws_bridge
# ---------------------------------------------------------------------------


async def test_init_binds_broadcaster_to_service_without_state_loss() -> None:
    """The bridge's idempotent install reuses the existing service so
    any in-flight sessions survive."""
    # Build a fresh service (no broadcaster) and seed an in-flight
    # session.
    service = RecorderService(
        local_node_id="map2-test",
        session_id_factory=lambda: "sess-stay",
        clock=lambda: "2026-05-11T18:00:00+00:00",
    )
    await service.arm_session(snapshot_id=7, tap_matrix={})
    pre_sessions = await service.list_sessions()
    assert len(pre_sessions) == 1
    set_recorder_service(service)
    try:
        rebuilt = recorder_ws_bridge.init_recorder_ws_bridge()
        # Same instance, not a rebuild.
        assert rebuilt is service
        # In-flight session preserved.
        post_sessions = await rebuilt.list_sessions()
        assert len(post_sessions) == 1
        assert post_sessions[0].session_id == "sess-stay"
    finally:
        set_recorder_service(None)


async def test_init_binds_real_broadcast_into_arm_path() -> None:
    """After init, arming a new session emits a frame onto the WS
    pipeline."""
    captured: list[tuple[dict, str | None]] = []

    async def fake_broadcast(data: dict, topic: str | None = None) -> None:
        captured.append((data, topic))

    service = RecorderService(
        local_node_id="map2-test",
        session_id_factory=lambda: "sess-arm-emit",
        clock=lambda: "2026-05-11T18:00:00+00:00",
    )
    set_recorder_service(service)
    try:
        recorder_ws_bridge.init_recorder_ws_bridge()
        with patch.object(
            recorder_ws_bridge.ws_manager,
            "broadcast_json",
            side_effect=fake_broadcast,
        ):
            await service.arm_session(snapshot_id=1, tap_matrix={})
            # No additional state mutation should change the count.
            assert len(captured) == 1
        data, topic = captured[0]
        assert topic == RECORDER_SESSION_TOPIC
        assert data["type"] == "recorder_session"
        assert data["payload"]["session_id"] == "sess-arm-emit"
        assert data["payload"]["state"] == "armed"
    finally:
        set_recorder_service(None)


async def test_init_emits_for_each_state_transition() -> None:
    """arm → roll → stop must each push one frame onto the topic."""
    captured: list[dict] = []

    async def fake_broadcast(data: dict, topic: str | None = None) -> None:
        captured.append(data)

    service = RecorderService(
        local_node_id="map2-test",
        session_id_factory=lambda: "sess-cycle",
        clock=lambda: "2026-05-11T18:00:00+00:00",
    )
    set_recorder_service(service)
    try:
        recorder_ws_bridge.init_recorder_ws_bridge()
        with patch.object(
            recorder_ws_bridge.ws_manager,
            "broadcast_json",
            side_effect=fake_broadcast,
        ):
            await service.arm_session(snapshot_id=1, tap_matrix={})
            await service.start_rolling(session_id="sess-cycle")
            await service.stop(session_id="sess-cycle")
        states = [frame["payload"]["state"] for frame in captured]
        assert states == ["armed", "rolling", "stopped"]
    finally:
        set_recorder_service(None)


# ---------------------------------------------------------------------------
# replace_broadcaster / replace_transport seam
# ---------------------------------------------------------------------------


async def test_replace_broadcaster_swaps_without_rebuilding_state() -> None:
    captured_a: list[RecorderSessionStatus] = []
    captured_b: list[RecorderSessionStatus] = []

    async def b_a(status):
        captured_a.append(status)

    async def b_b(status):
        captured_b.append(status)

    service = RecorderService(
        broadcaster=b_a,
        session_id_factory=lambda: "sess-swap",
        clock=lambda: "2026-05-11T18:00:00+00:00",
    )
    await service.arm_session(snapshot_id=1, tap_matrix={})
    assert len(captured_a) == 1
    assert len(captured_b) == 0

    # Swap to broadcaster B mid-lifecycle.
    service.replace_broadcaster(b_b)
    await service.stop(session_id="sess-swap")
    # A captured the arm; B captured the stop.
    assert len(captured_a) == 1
    assert len(captured_b) == 1
    assert captured_b[0].state.value == "stopped"


async def test_replace_transport_swaps_without_rebuilding_state() -> None:
    captured_a: list[tuple[RecorderVerb, str]] = []
    captured_b: list[tuple[RecorderVerb, str]] = []

    async def t_a(verb, session_id):
        captured_a.append((verb, session_id))

    async def t_b(verb, session_id):
        captured_b.append((verb, session_id))

    service = RecorderService(
        transport=t_a,
        session_id_factory=lambda: "sess-trans",
        clock=lambda: "2026-05-11T18:00:00+00:00",
    )
    await service.arm_session(snapshot_id=1, tap_matrix={})
    assert captured_a == [(RecorderVerb.ARM, "sess-trans")]
    assert captured_b == []

    service.replace_transport(t_b)
    await service.stop(session_id="sess-trans")
    assert captured_a == [(RecorderVerb.ARM, "sess-trans")]  # unchanged
    assert captured_b == [(RecorderVerb.STOP, "sess-trans")]


async def test_replace_broadcaster_none_reverts_to_silent_broadcast() -> None:
    """Passing None should be safe — subsequent transitions emit no
    broadcast but the state machine still advances."""
    captured: list[RecorderSessionStatus] = []

    async def b(status):
        captured.append(status)

    service = RecorderService(
        broadcaster=b,
        session_id_factory=lambda: "sess-silent",
        clock=lambda: "2026-05-11T18:00:00+00:00",
    )
    await service.arm_session(snapshot_id=1, tap_matrix={})
    assert len(captured) == 1

    service.replace_broadcaster(None)
    status = await service.stop(session_id="sess-silent")
    # No new broadcast.
    assert len(captured) == 1
    # State did transition.
    assert status.state.value == "stopped"

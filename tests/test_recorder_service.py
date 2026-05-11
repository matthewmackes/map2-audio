"""T2508 — RecorderService unit tests.

Covers the full lifecycle state machine (arm → roll → stop, plus the
disarm path), input validation, idempotency on already-rolling /
already-stopped, transport + broadcaster injection, error isolation
when transport/broadcaster raises, and the WS payload shape.

The service is RT-irrelevant — all tests run on the asyncio loop
with no engine binding.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.services.recorder_service import (
    RECORDER_SESSION_TOPIC,
    RecorderService,
    RecorderServiceError,
    RecorderSessionState,
    RecorderSessionStatus,
    RecorderVerb,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _new_service(
    *,
    sessions_ids: list[str] | None = None,
    clock_values: list[str] | None = None,
) -> tuple[
    RecorderService,
    list[tuple[RecorderVerb, str]],
    list[RecorderSessionStatus],
]:
    """Build a service with capturing transport + broadcaster + a
    deterministic clock + session-id factory."""
    verbs: list[tuple[RecorderVerb, str]] = []
    broadcasts: list[RecorderSessionStatus] = []

    async def transport(verb: RecorderVerb, session_id: str) -> None:
        verbs.append((verb, session_id))

    async def broadcaster(status: RecorderSessionStatus) -> None:
        broadcasts.append(status)

    id_iter = iter(sessions_ids or ["sess-1", "sess-2", "sess-3", "sess-4"])
    clock_iter = iter(
        clock_values
        or [f"2026-05-11T18:00:{n:02d}+00:00" for n in range(20)]
    )

    service = RecorderService(
        transport=transport,
        broadcaster=broadcaster,
        local_node_id="map2-prod-01",
        session_id_factory=lambda: next(id_iter),
        clock=lambda: next(clock_iter),
    )
    return service, verbs, broadcasts


# ---------------------------------------------------------------------------
# Constants + module surface
# ---------------------------------------------------------------------------


def test_topic_constant_is_canonical() -> None:
    assert RECORDER_SESSION_TOPIC == "recorder:session"


def test_recorder_verb_targets_match_dispatcher_registration() -> None:
    """T2508 dispatcher half registered exact targets — keep the verbs
    in sync."""
    expected = {
        "recorder.arm",
        "recorder.disarm",
        "recorder.roll",
        "recorder.stop",
        "recorder.status",
    }
    assert {v.value for v in RecorderVerb} == expected


# ---------------------------------------------------------------------------
# arm_session
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_arm_session_creates_session_and_emits_arm_verb() -> None:
    service, verbs, broadcasts = _new_service()
    status = await service.arm_session(
        snapshot_id=42,
        tap_matrix={"chain-rhythm": {"pre_fx": True, "post_fx": True}},
    )
    assert status.session_id == "sess-1"
    assert status.snapshot_id == 42
    assert status.state == RecorderSessionState.ARMED
    assert status.armed is True
    assert status.rolling is False
    assert status.tap_matrix == {"chain-rhythm": {"pre_fx": True, "post_fx": True}}
    assert status.participating_nodes == ["map2-prod-01"]
    assert verbs == [(RecorderVerb.ARM, "sess-1")]
    assert len(broadcasts) == 1
    assert broadcasts[0] == status


@pytest.mark.asyncio
async def test_arm_session_normalizes_malformed_tap_matrix() -> None:
    """Aligned with state_authority_graph._normalize_recording_block —
    blank chain_ids and non-dict entries drop."""
    service, _verbs, _broadcasts = _new_service()
    status = await service.arm_session(
        snapshot_id=1,
        tap_matrix={
            "chain-rhythm": {"pre_fx": True, "post_fx": False},
            "": {"pre_fx": True, "post_fx": True},  # blank id → drop
            "chain-bad": "not-a-mapping",  # bad shape → drop
            "chain-defaults": {},  # both default False
        },
    )
    assert status.tap_matrix == {
        "chain-rhythm": {"pre_fx": True, "post_fx": False},
        "chain-defaults": {"pre_fx": False, "post_fx": False},
    }


@pytest.mark.asyncio
async def test_arm_session_rejects_invalid_snapshot_id() -> None:
    service, _verbs, _broadcasts = _new_service()
    for bad in [-1, "42", None, 1.5]:
        with pytest.raises(RecorderServiceError) as exc_info:
            await service.arm_session(snapshot_id=bad, tap_matrix={})  # type: ignore[arg-type]
        assert exc_info.value.code == "invalid_snapshot_id"


@pytest.mark.asyncio
async def test_arm_session_accepts_zero_snapshot_id() -> None:
    """0 is a valid snapshot id (1-based numbering is operator-facing
    only; the State Authority graph permits 0)."""
    service, _verbs, _broadcasts = _new_service()
    status = await service.arm_session(snapshot_id=0, tap_matrix={})
    assert status.snapshot_id == 0


# ---------------------------------------------------------------------------
# start_rolling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_start_rolling_transitions_armed_to_rolling() -> None:
    service, verbs, broadcasts = _new_service()
    await service.arm_session(snapshot_id=1, tap_matrix={})
    status = await service.start_rolling(session_id="sess-1")
    assert status.state == RecorderSessionState.ROLLING
    assert status.rolling is True
    assert status.armed is True
    assert verbs == [(RecorderVerb.ARM, "sess-1"), (RecorderVerb.ROLL, "sess-1")]
    assert len(broadcasts) == 2


@pytest.mark.asyncio
async def test_start_rolling_is_idempotent_when_already_rolling() -> None:
    service, verbs, broadcasts = _new_service()
    await service.arm_session(snapshot_id=1, tap_matrix={})
    await service.start_rolling(session_id="sess-1")
    verbs.clear()
    broadcasts.clear()
    status = await service.start_rolling(session_id="sess-1")
    assert status.state == RecorderSessionState.ROLLING
    # Idempotent: no new verb emitted, no new broadcast.
    assert verbs == []
    assert broadcasts == []


@pytest.mark.asyncio
async def test_start_rolling_rejects_stopped_session() -> None:
    service, _verbs, _broadcasts = _new_service()
    await service.arm_session(snapshot_id=1, tap_matrix={})
    await service.stop(session_id="sess-1")
    with pytest.raises(RecorderServiceError) as exc_info:
        await service.start_rolling(session_id="sess-1")
    assert exc_info.value.code == "invalid_state"
    assert exc_info.value.session_id == "sess-1"


@pytest.mark.asyncio
async def test_start_rolling_rejects_unknown_session() -> None:
    service, _verbs, _broadcasts = _new_service()
    with pytest.raises(RecorderServiceError) as exc_info:
        await service.start_rolling(session_id="sess-nope")
    assert exc_info.value.code == "unknown_session"


# ---------------------------------------------------------------------------
# stop
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stop_transitions_rolling_to_stopped() -> None:
    service, verbs, broadcasts = _new_service()
    await service.arm_session(snapshot_id=1, tap_matrix={})
    await service.start_rolling(session_id="sess-1")
    status = await service.stop(session_id="sess-1")
    assert status.state == RecorderSessionState.STOPPED
    assert status.rolling is False
    assert status.armed is False
    # Three verbs: arm, roll, stop.
    assert [v[0] for v in verbs] == [RecorderVerb.ARM, RecorderVerb.ROLL, RecorderVerb.STOP]
    assert len(broadcasts) == 3


@pytest.mark.asyncio
async def test_stop_from_armed_state_still_emits_stop_verb() -> None:
    """ARMED → STOPPED — operator armed but never rolled. Stop is
    still emitted so the engine can release tap nodes."""
    service, verbs, _broadcasts = _new_service()
    await service.arm_session(snapshot_id=1, tap_matrix={})
    status = await service.stop(session_id="sess-1")
    assert status.state == RecorderSessionState.STOPPED
    assert [v[0] for v in verbs] == [RecorderVerb.ARM, RecorderVerb.STOP]


@pytest.mark.asyncio
async def test_stop_is_idempotent_when_already_stopped() -> None:
    service, verbs, broadcasts = _new_service()
    await service.arm_session(snapshot_id=1, tap_matrix={})
    await service.stop(session_id="sess-1")
    verbs.clear()
    broadcasts.clear()
    status = await service.stop(session_id="sess-1")
    assert status.state == RecorderSessionState.STOPPED
    assert verbs == []
    assert broadcasts == []


@pytest.mark.asyncio
async def test_stop_rejects_unknown_session() -> None:
    service, _verbs, _broadcasts = _new_service()
    with pytest.raises(RecorderServiceError) as exc_info:
        await service.stop(session_id="sess-nope")
    assert exc_info.value.code == "unknown_session"


# ---------------------------------------------------------------------------
# disarm_session
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_disarm_session_removes_record_and_emits_disarm() -> None:
    service, verbs, broadcasts = _new_service()
    await service.arm_session(snapshot_id=1, tap_matrix={})
    verbs.clear()
    broadcasts.clear()
    await service.disarm_session(session_id="sess-1")
    assert [v[0] for v in verbs] == [RecorderVerb.DISARM]
    # Final broadcast projects STOPPED so the UI can tear down the row.
    assert len(broadcasts) == 1
    assert broadcasts[0].state == RecorderSessionState.STOPPED
    assert broadcasts[0].armed is False
    # Session is gone — subsequent GET raises unknown_session.
    with pytest.raises(RecorderServiceError) as exc_info:
        await service.get_session_status(session_id="sess-1")
    assert exc_info.value.code == "unknown_session"


@pytest.mark.asyncio
async def test_disarm_session_is_silent_no_op_on_unknown_session() -> None:
    """Disarm on an unknown session never raises — the engine state
    we care about is "no taps installed", which is true by default."""
    service, verbs, broadcasts = _new_service()
    await service.disarm_session(session_id="sess-nope")
    assert verbs == []
    assert broadcasts == []


# ---------------------------------------------------------------------------
# get_session_status / list_sessions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_session_status_does_not_emit_verbs_or_broadcasts() -> None:
    service, verbs, broadcasts = _new_service()
    await service.arm_session(snapshot_id=1, tap_matrix={})
    verbs.clear()
    broadcasts.clear()
    status = await service.get_session_status(session_id="sess-1")
    assert status.session_id == "sess-1"
    assert verbs == []
    assert broadcasts == []


@pytest.mark.asyncio
async def test_list_sessions_returns_all_in_flight() -> None:
    service, _verbs, _broadcasts = _new_service()
    await service.arm_session(snapshot_id=1, tap_matrix={})
    await service.arm_session(snapshot_id=2, tap_matrix={})
    sessions = await service.list_sessions()
    assert {s.session_id for s in sessions} == {"sess-1", "sess-2"}


@pytest.mark.asyncio
async def test_list_sessions_after_disarm_drops_record() -> None:
    service, _verbs, _broadcasts = _new_service()
    await service.arm_session(snapshot_id=1, tap_matrix={})
    await service.arm_session(snapshot_id=2, tap_matrix={})
    await service.disarm_session(session_id="sess-1")
    sessions = await service.list_sessions()
    assert {s.session_id for s in sessions} == {"sess-2"}


# ---------------------------------------------------------------------------
# Transport / broadcaster injection + isolation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_no_transport_bound_is_a_silent_no_op() -> None:
    """Mirrors the dispatcher's no-op-when-unbound pattern. State is
    still tracked locally, broadcast still fires (via the bound
    broadcaster), only the engine-side IPC is skipped."""
    broadcasts: list[RecorderSessionStatus] = []

    async def broadcaster(status: RecorderSessionStatus) -> None:
        broadcasts.append(status)

    service = RecorderService(
        transport=None,
        broadcaster=broadcaster,
        session_id_factory=lambda: "sess-x",
        clock=lambda: "2026-05-11T18:00:00+00:00",
    )
    status = await service.arm_session(snapshot_id=1, tap_matrix={})
    assert status.state == RecorderSessionState.ARMED
    assert len(broadcasts) == 1


@pytest.mark.asyncio
async def test_transport_exception_does_not_break_state_machine() -> None:
    """A transport that raises is logged and swallowed; the local
    state-machine transition still happens (mirrors the dispatcher's
    error isolation pattern)."""

    async def bad_transport(verb: RecorderVerb, session_id: str) -> None:
        raise RuntimeError("engine IPC down")

    service = RecorderService(
        transport=bad_transport,
        broadcaster=None,
        session_id_factory=lambda: "sess-x",
        clock=lambda: "2026-05-11T18:00:00+00:00",
    )
    status = await service.arm_session(snapshot_id=1, tap_matrix={})
    assert status.state == RecorderSessionState.ARMED


@pytest.mark.asyncio
async def test_broadcaster_exception_does_not_break_state_machine() -> None:
    async def bad_broadcaster(status: RecorderSessionStatus) -> None:
        raise RuntimeError("ws queue full")

    service = RecorderService(
        transport=None,
        broadcaster=bad_broadcaster,
        session_id_factory=lambda: "sess-x",
        clock=lambda: "2026-05-11T18:00:00+00:00",
    )
    status = await service.arm_session(snapshot_id=1, tap_matrix={})
    assert status.state == RecorderSessionState.ARMED


# ---------------------------------------------------------------------------
# Payload shape
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_to_payload_serializes_to_canonical_shape() -> None:
    service, _verbs, _broadcasts = _new_service()
    status = await service.arm_session(
        snapshot_id=42,
        tap_matrix={"chain-rhythm": {"pre_fx": True, "post_fx": False}},
    )
    payload = status.to_payload()
    assert payload == {
        "session_id": "sess-1",
        "snapshot_id": 42,
        "state": "armed",
        "armed": True,
        "rolling": False,
        "started_at": "2026-05-11T18:00:00+00:00",
        "rolling_at": None,
        "stopped_at": None,
        "tap_matrix": {"chain-rhythm": {"pre_fx": True, "post_fx": False}},
        "participating_nodes": ["map2-prod-01"],
    }


# ---------------------------------------------------------------------------
# Concurrency: arm/roll/stop on multiple sessions interleaving
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_multiple_sessions_isolate_state() -> None:
    """The asyncio.Lock serialises lifecycle mutations across sessions;
    state from one session must not bleed into another's projection."""
    service, _verbs, _broadcasts = _new_service()
    await service.arm_session(snapshot_id=1, tap_matrix={"a": {"pre_fx": True, "post_fx": False}})
    await service.arm_session(snapshot_id=2, tap_matrix={"b": {"pre_fx": False, "post_fx": True}})
    await service.start_rolling(session_id="sess-1")

    status_1 = await service.get_session_status(session_id="sess-1")
    status_2 = await service.get_session_status(session_id="sess-2")

    assert status_1.state == RecorderSessionState.ROLLING
    assert status_2.state == RecorderSessionState.ARMED
    assert status_1.snapshot_id == 1
    assert status_2.snapshot_id == 2
    assert status_1.tap_matrix == {"a": {"pre_fx": True, "post_fx": False}}
    assert status_2.tap_matrix == {"b": {"pre_fx": False, "post_fx": True}}

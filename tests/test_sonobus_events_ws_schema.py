"""Run-14c cycle 1 — SonoBus events WS schema contract."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.services.sonobus._events_ws_schema import (
    DAEMON_EVENT_FRAME_TYPE,
    HEARTBEAT_FRAME_TYPE,
    SCHEMA_VERSION,
    STATE_FRAME_TYPE,
    SonoBusDaemonEventBody,
    SonoBusDaemonEventFrame,
    SonoBusHeartbeatFrame,
    SonoBusStateFrame,
    SonoBusStatusSnapshot,
    build_daemon_event_frame,
    build_heartbeat_frame,
    build_state_frame,
    validate_daemon_event_frame,
    validate_heartbeat_frame,
    validate_state_frame,
)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------


def test_constants_match_canonical_strings() -> None:
    assert STATE_FRAME_TYPE == "sonobus:state"
    assert HEARTBEAT_FRAME_TYPE == "sonobus:heartbeat"
    assert DAEMON_EVENT_FRAME_TYPE == "sonobus:daemon"
    assert SCHEMA_VERSION == 1


# ---------------------------------------------------------------------------
# SonoBusStatusSnapshot model
# ---------------------------------------------------------------------------


def _minimum_snapshot() -> SonoBusStatusSnapshot:
    return SonoBusStatusSnapshot(
        authority_ok=True,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


def test_snapshot_defaults_match_stub_supervisor_state() -> None:
    snap = _minimum_snapshot()
    assert snap.authority_ok is True
    assert snap.error is None
    assert snap.binding_count == 0
    assert snap.enabled_binding_count == 0
    assert snap.daemon_running is False
    assert snap.daemon_endpoint is None
    assert snap.daemon_status == "stopped"
    assert snap.daemon_capabilities is None


def test_snapshot_accepts_authority_error_envelope() -> None:
    """authority_ok=False path: error is populated, counts stay at default."""
    snap = SonoBusStatusSnapshot(
        authority_ok=False,
        error="DB connection lost",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
    assert snap.authority_ok is False
    assert snap.error == "DB connection lost"


# ---------------------------------------------------------------------------
# State frame envelope
# ---------------------------------------------------------------------------


def test_state_frame_locks_topic_and_version() -> None:
    snap = _minimum_snapshot()
    frame = SonoBusStateFrame(data=snap)
    assert frame.type == STATE_FRAME_TYPE
    assert frame.schema_version == SCHEMA_VERSION


def test_state_frame_rejects_wrong_topic() -> None:
    with pytest.raises(ValueError):
        SonoBusStateFrame(
            type=HEARTBEAT_FRAME_TYPE,  # type: ignore[arg-type]
            data=_minimum_snapshot(),
        )


def test_state_frame_rejects_wrong_schema_version() -> None:
    with pytest.raises(ValueError):
        SonoBusStateFrame(
            schema_version=99,  # type: ignore[arg-type]
            data=_minimum_snapshot(),
        )


# ---------------------------------------------------------------------------
# Heartbeat frame envelope
# ---------------------------------------------------------------------------


def test_heartbeat_frame_locks_topic_and_version() -> None:
    snap = _minimum_snapshot()
    frame = SonoBusHeartbeatFrame(data=snap)
    assert frame.type == HEARTBEAT_FRAME_TYPE
    assert frame.schema_version == SCHEMA_VERSION


def test_heartbeat_frame_shares_body_schema_with_state() -> None:
    """State + heartbeat carry the same body type — the only diff is
    the envelope's `type` field. Drift here would let a future schema
    bump miss one of the two frames."""
    snap = _minimum_snapshot()
    s_frame = SonoBusStateFrame(data=snap)
    h_frame = SonoBusHeartbeatFrame(data=snap)
    assert s_frame.data == h_frame.data


# ---------------------------------------------------------------------------
# Daemon event frame envelope
# ---------------------------------------------------------------------------


def test_daemon_event_frame_carries_inner_event_type() -> None:
    """The inner `data.type` field discriminates which daemon event
    class the envelope carries (peer_up, metrics_snapshot, etc.)."""
    body = SonoBusDaemonEventBody(
        type="metrics_snapshot",
        payload={"streams": []},
    )
    frame = SonoBusDaemonEventFrame(data=body)
    assert frame.type == DAEMON_EVENT_FRAME_TYPE
    assert frame.data.type == "metrics_snapshot"
    assert frame.data.event is True


def test_daemon_event_body_defaults_event_true() -> None:
    body = SonoBusDaemonEventBody(type="peer_up")
    assert body.event is True


def test_daemon_event_payload_defaults_to_empty_dict() -> None:
    body = SonoBusDaemonEventBody(type="peer_up")
    assert body.payload == {}


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------


def test_build_state_frame_round_trips() -> None:
    snap = _minimum_snapshot()
    frame = build_state_frame(snap)
    assert frame["type"] == STATE_FRAME_TYPE
    assert frame["schema_version"] == SCHEMA_VERSION
    parsed = validate_state_frame(frame)
    assert parsed.data.authority_ok is True


def test_build_heartbeat_frame_round_trips() -> None:
    snap = _minimum_snapshot()
    frame = build_heartbeat_frame(snap)
    parsed = validate_heartbeat_frame(frame)
    assert parsed.type == HEARTBEAT_FRAME_TYPE


def test_build_daemon_event_frame_round_trips() -> None:
    event = {"type": "peer_up", "event": True, "payload": {"peer_id": "node-42"}}
    frame = build_daemon_event_frame(event)
    parsed = validate_daemon_event_frame(frame)
    assert parsed.data.type == "peer_up"
    assert parsed.data.payload == {"peer_id": "node-42"}


def test_build_daemon_event_frame_defensive_on_missing_type() -> None:
    """A malformed event (no `type`) must still produce a valid envelope
    so the WS fanout loop doesn't throw on backend drift."""
    frame = build_daemon_event_frame({"payload": {"x": 1}})
    parsed = validate_daemon_event_frame(frame)
    assert parsed.data.type == "unknown"


def test_build_daemon_event_frame_defensive_on_non_dict_payload() -> None:
    """If the daemon ever pushes an event with a non-dict payload, the
    builder coerces to {} so the strict validation still passes."""
    frame = build_daemon_event_frame({"type": "transport_error", "payload": "string-not-dict"})
    parsed = validate_daemon_event_frame(frame)
    assert parsed.data.type == "transport_error"
    assert parsed.data.payload == {}


# ---------------------------------------------------------------------------
# Validators reject bad shapes
# ---------------------------------------------------------------------------


def test_validate_state_frame_rejects_missing_data() -> None:
    with pytest.raises(ValueError):
        validate_state_frame({"type": STATE_FRAME_TYPE, "schema_version": 1})


def test_validate_state_frame_rejects_wrong_topic() -> None:
    with pytest.raises(ValueError):
        validate_state_frame({
            "type": HEARTBEAT_FRAME_TYPE,
            "schema_version": 1,
            "data": {"authority_ok": True, "timestamp": "2026-05-16T00:00:00+00:00"},
        })


def test_validate_daemon_event_frame_rejects_missing_inner_type() -> None:
    with pytest.raises(ValueError):
        validate_daemon_event_frame({
            "type": DAEMON_EVENT_FRAME_TYPE,
            "schema_version": 1,
            "data": {"event": True, "payload": {}},  # no `type`
        })


# ---------------------------------------------------------------------------
# Backward compat: a legacy frame from the existing route must validate
# ---------------------------------------------------------------------------


def test_legacy_state_frame_validates() -> None:
    legacy = {
        "type": "sonobus:state",
        "schema_version": 1,
        "data": {
            "authority_ok": True,
            "binding_count": 0,
            "enabled_binding_count": 0,
            "daemon_running": False,
            "daemon_endpoint": None,
            "daemon_status": "stopped",
            "daemon_capabilities": None,
            "timestamp": "2026-05-16T12:00:00+00:00",
        },
    }
    parsed = validate_state_frame(legacy)
    assert parsed.data.daemon_status == "stopped"


def test_legacy_daemon_event_frame_validates() -> None:
    legacy = {
        "type": "sonobus:daemon",
        "schema_version": 1,
        "data": {
            "type": "metrics_snapshot",
            "event": True,
            "payload": {"streams": [], "taken_at_unix_ms": 1715731200000},
        },
    }
    parsed = validate_daemon_event_frame(legacy)
    assert parsed.data.type == "metrics_snapshot"

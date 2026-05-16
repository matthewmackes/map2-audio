"""Canonical Pydantic schemas for the SonoBus events WebSocket frame envelopes.

Run-14c cycle 1 (2026-05-16). Extends the run-14b pick #1 pattern
(`_meter_ws_schema.py`) to the second WS topic in the platform — the
SonoBus events stream emitted by `binding_routes.sonobus_events_ws()`.

Three frame topics:

  `sonobus:state`         — initial state on WS connect (authority +
                            binding counts + supervisor capabilities)
  `sonobus:heartbeat`     — periodic state refresh every 5 s
  `sonobus:daemon`        — forwarded daemon event (peer_up, peer_down,
                            session_start, session_stop,
                            metrics_snapshot, transport_error)

The state + heartbeat topics share a body schema (`SonoBusStatusSnapshot`);
the daemon topic carries an opaque payload that mirrors the daemon's
own UDS event shape (see `docs/architecture/SONOBUS_DAEMON.md`).

Pattern mirrors `_meter_ws_schema.py` exactly:
  - Pydantic models are the single source of truth
  - Module-level constants (`*_FRAME_TYPE`, `SCHEMA_VERSION`) for route
    handlers + tests + TS codegen
  - `build_*_frame()` helpers so handlers don't duplicate the envelope
  - `validate_*_frame()` helpers for test assertions
"""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Canonical wire-protocol constants
# ---------------------------------------------------------------------------

STATE_FRAME_TYPE = "sonobus:state"
HEARTBEAT_FRAME_TYPE = "sonobus:heartbeat"
DAEMON_EVENT_FRAME_TYPE = "sonobus:daemon"
SCHEMA_VERSION = 1


# ---------------------------------------------------------------------------
# State/heartbeat body — derived from supervisor.status_payload + binding
# authority counts
# ---------------------------------------------------------------------------


class SonoBusStatusSnapshot(BaseModel):
    """The body of `sonobus:state` + `sonobus:heartbeat` frames.

    Mirrors the dict that `_snapshot()` returns in
    `binding_routes.sonobus_events_ws()`. The supervisor's status fields
    are merged in via `_supervisor_status_fields()`; the field shapes
    line up with `SonoBusStatusResponse.daemon_*` so the GUI can swap
    between the WS frame + the polled REST status without re-mapping.
    """

    authority_ok: bool = Field(
        ...,
        description="True iff the SonoBusBindingAuthority responded to the count probe.",
    )
    error: Optional[str] = Field(
        default=None,
        description="Set only when authority_ok=False; carries the exception message.",
    )
    binding_count: int = Field(
        default=0,
        description="Total SonoBusBinding rows in the authority.",
    )
    enabled_binding_count: int = Field(
        default=0,
        description="Subset of bindings with enabled=True.",
    )
    timestamp: str = Field(
        ...,
        description="ISO-8601 wall-clock when this snapshot was taken.",
    )
    # Daemon-side fields merged in from SonoBusDaemonSupervisor.
    daemon_running: bool = Field(default=False)
    daemon_endpoint: Optional[str] = Field(default=None)
    daemon_status: str = Field(
        default="stopped",
        description=(
            "Canonical supervisor state string. One of: stopped / waiting-for-binary "
            "/ waiting-for-daemon / connecting / running / reconnecting / degraded "
            "/ shutdown. See docs/architecture/SONOBUS_DAEMON.md § supervisor lifecycle."
        ),
    )
    daemon_capabilities: Optional[dict[str, Any]] = Field(
        default=None,
        description="Full daemon hello-handshake snapshot when connected.",
    )


# ---------------------------------------------------------------------------
# State/heartbeat frame envelopes
# ---------------------------------------------------------------------------


class SonoBusStateFrame(BaseModel):
    """Initial `sonobus:state` frame sent on WS connect."""

    type: Literal["sonobus:state"] = STATE_FRAME_TYPE  # type: ignore[assignment]
    schema_version: Literal[1] = SCHEMA_VERSION  # type: ignore[assignment]
    data: SonoBusStatusSnapshot


class SonoBusHeartbeatFrame(BaseModel):
    """Periodic `sonobus:heartbeat` frame (every 5 s)."""

    type: Literal["sonobus:heartbeat"] = HEARTBEAT_FRAME_TYPE  # type: ignore[assignment]
    schema_version: Literal[1] = SCHEMA_VERSION  # type: ignore[assignment]
    data: SonoBusStatusSnapshot


# ---------------------------------------------------------------------------
# Daemon event frame envelope
# ---------------------------------------------------------------------------


class SonoBusDaemonEventBody(BaseModel):
    """The body of `sonobus:daemon` frames.

    Wraps one async event from the daemon supervisor's events queue.
    The inner `payload` is opaque (the daemon's UDS event types evolve
    independently); the envelope's `type` field discriminates which
    daemon event class it carries.
    """

    type: str = Field(
        ...,
        description=(
            "Daemon event type. One of: peer_up / peer_down / session_start / "
            "session_stop / metrics_snapshot / transport_error. (Future events "
            "land here as the daemon side wires them up.)"
        ),
    )
    event: Literal[True] = Field(
        default=True,
        description="Always True. Discriminates events from delayed command responses.",
    )
    payload: dict[str, Any] = Field(
        default_factory=dict,
        description="Event-specific payload. See docs/architecture/SONOBUS_DAEMON.md.",
    )


class SonoBusDaemonEventFrame(BaseModel):
    """Forwarded daemon event wrapped in the WS envelope."""

    type: Literal["sonobus:daemon"] = DAEMON_EVENT_FRAME_TYPE  # type: ignore[assignment]
    schema_version: Literal[1] = SCHEMA_VERSION  # type: ignore[assignment]
    data: SonoBusDaemonEventBody


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------


def build_state_frame(snapshot: SonoBusStatusSnapshot) -> dict:
    """Build a sonobus:state frame from a snapshot model."""
    return SonoBusStateFrame(data=snapshot).model_dump()


def build_heartbeat_frame(snapshot: SonoBusStatusSnapshot) -> dict:
    """Build a sonobus:heartbeat frame from a snapshot model."""
    return SonoBusHeartbeatFrame(data=snapshot).model_dump()


def build_daemon_event_frame(event: dict[str, Any]) -> dict:
    """Build a sonobus:daemon frame from one raw daemon-event dict.

    Defensive: a malformed event from the daemon (missing `type`) is
    wrapped under type="unknown" so the WS subscriber still receives a
    valid envelope it can warn about, rather than throwing in the
    fanout loop.
    """
    event_type = event.get("type")
    if not isinstance(event_type, str) or not event_type:
        event_type = "unknown"
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    return SonoBusDaemonEventFrame(
        data=SonoBusDaemonEventBody(
            type=event_type,
            payload=payload or {},
        ),
    ).model_dump()


# ---------------------------------------------------------------------------
# Validators (used by tests + cross-process tooling)
# ---------------------------------------------------------------------------


def validate_state_frame(frame: dict) -> SonoBusStateFrame:
    return SonoBusStateFrame.model_validate(frame)


def validate_heartbeat_frame(frame: dict) -> SonoBusHeartbeatFrame:
    return SonoBusHeartbeatFrame.model_validate(frame)


def validate_daemon_event_frame(frame: dict) -> SonoBusDaemonEventFrame:
    return SonoBusDaemonEventFrame.model_validate(frame)


__all__ = [
    # Constants
    "STATE_FRAME_TYPE",
    "HEARTBEAT_FRAME_TYPE",
    "DAEMON_EVENT_FRAME_TYPE",
    "SCHEMA_VERSION",
    # Models
    "SonoBusStatusSnapshot",
    "SonoBusStateFrame",
    "SonoBusHeartbeatFrame",
    "SonoBusDaemonEventBody",
    "SonoBusDaemonEventFrame",
    # Builders
    "build_state_frame",
    "build_heartbeat_frame",
    "build_daemon_event_frame",
    # Validators
    "validate_state_frame",
    "validate_heartbeat_frame",
    "validate_daemon_event_frame",
]

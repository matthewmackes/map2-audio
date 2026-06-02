"""T2508 phase 4 of T2504 — Multi-Track Recorder Python service facade.

This module provides the operator-facing recorder lifecycle without
touching the JUCE audio engine. Real engine wiring (the T2507 RT-safe
tap nodes) is consumed via an injected ``RecorderTransport`` callable;
when no transport is bound, the service tracks state internally and
logs the verbs it would have emitted. This lets us land + test the
service surface ahead of the C++ work, per the operator's
"RT safety is most important" directive (issued 2026-05-11).

RT-safety profile
-----------------
This module never runs inside the JUCE audioCallback. Every method
runs on the FastAPI asyncio loop or a test harness; lifecycle
mutations cross the IPC boundary to the engine (when transport is
bound) where the T2507 SPSC ring buffer takes over. The service
itself has no RT obligations and is permitted to allocate, log, and
take asyncio locks freely.

Session lifecycle state machine
-------------------------------
    arm_session(snapshot_id, tap_matrix)  ──► ARMED
    start_rolling(session_id)             ──► ROLLING
    stop(session_id)                      ──► STOPPED
    seal_session(session_id)              ──► SEALED  (read-only terminal)
    disarm_session(session_id)            ──► removed entirely

Transitions are validated; calling ``start_rolling`` on an unknown or
already-stopped session raises ``RecorderServiceError`` so the route
layer can emit a 4xx envelope.

``SEALED`` is the terminal, read-only state (T2510-5): once every
participating peer has flushed its writers and registered its takes in
the StateAuthorityAsset registry, the cluster seals the session. A
sealed session rejects ``start_rolling`` / ``stop`` / re-``arm`` /
``disarm`` so the archived record can never be re-mutated.

WebSocket broadcast
-------------------
Every state transition pushes a ``RecorderSessionStatus`` onto
``RECORDER_SESSION_TOPIC``. Consumers subscribe per the existing
WebSocket plumbing. The 15 fps in-flight cadence (T2508-6) is owned
by the bridge layer that watches running sessions — this service
emits only on transition.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Awaitable, Callable, Optional, Protocol


logger = logging.getLogger(__name__)


RECORDER_SESSION_TOPIC = "recorder:session"


class RecorderSessionState(str, Enum):
    """Lifecycle states for a recorder session.

    Values are lower-snake strings so they serialize directly into the
    WebSocket payload + REST responses without translation.
    """

    ARMED = "armed"
    ROLLING = "rolling"
    STOPPED = "stopped"
    SEALED = "sealed"


class RecorderVerb(str, Enum):
    """Five engine_command verbs the service emits.

    These match the dispatcher's `recorder.arm` / `recorder.disarm` /
    `recorder.roll` / `recorder.stop` / `recorder.status` targets
    landed in cycle 4 (commit 1cd7d9a8). The service emits via the
    injected transport; the dispatcher consumes on the receiving side.
    """

    ARM = "recorder.arm"
    DISARM = "recorder.disarm"
    ROLL = "recorder.roll"
    STOP = "recorder.stop"
    STATUS = "recorder.status"


class RecorderServiceError(RuntimeError):
    """Raised on state-machine violations or unknown sessions.

    Route handlers catch this and emit a 4xx envelope per the
    API contract standards. Logs at WARN, not ERROR — operators see
    these on misclicks.
    """

    def __init__(self, *, code: str, message: str, session_id: Optional[str] = None) -> None:
        super().__init__(message)
        self.code = code
        self.session_id = session_id


# ---------------------------------------------------------------------------
# T2521-7 Q12 — SonoBus exclusion gate
# ---------------------------------------------------------------------------
#
# Per the T2521 decision lock (Q12: "no recorder/artifact integration
# for this transport"), every Recorder code path that accepts an
# interface ID must reject SonoBus IDs with a structured error.
# Importing the canonical helper from app.services.sonobus.interface_ids
# keeps the message + locked-decision rationale consistent across the
# Recorder, Audio Artifacts, and any future recorder-adjacent service.
#
# Call `_assert_no_sonobus_in(interface_ids, service_name="Recorder")`
# anywhere the Recorder ingests a list of interface IDs. The recorder
# service today operates on snapshot-bound `tap_matrix` (per-chain
# enables) rather than raw interface IDs, but the gate exists in this
# module so future ingestion points have the contract co-located with
# the rest of the recorder code.

def assert_no_sonobus_interface_ids(
    interface_ids: Optional[list[str]],
    *,
    service_name: str = "Recorder",
) -> None:
    """Q12 — reject any SonoBus interface ID in a recorder call path.

    Raises ``RecorderServiceError`` with ``code="sonobus_excluded"`` so
    routes return a 422 envelope citing the locked decision. Falls
    through silently for empty / non-SonoBus IDs.

    Wired into the public recorder API now even though `tap_matrix`
    doesn't yet carry raw interface IDs — keeps the gate co-located
    with the service it protects.
    """
    if not interface_ids:
        return
    from app.services.sonobus.interface_ids import (
        SonoBusInterfaceForbiddenError,
        assert_not_sonobus_id,
    )

    for interface_id in interface_ids:
        try:
            assert_not_sonobus_id(interface_id, service_name=service_name)
        except SonoBusInterfaceForbiddenError as exc:
            raise RecorderServiceError(
                code="sonobus_excluded",
                message=str(exc),
            ) from exc


# ---------------------------------------------------------------------------
# Transport seam (engine IPC) + WS publisher
# ---------------------------------------------------------------------------


class RecorderTransport(Protocol):
    """Callable that ships an engine_command verb to the JUCE engine.

    The T2507 C++ recorder consumes the same five verbs over the shm
    event ring (or its async-IPC equivalent). When no transport is
    bound, the service logs the verb at INFO and stays side-effect-
    free outside its own session map — the same no-op-when-unbound
    pattern the dispatcher uses for its hooks.
    """

    def __call__(self, verb: RecorderVerb, session_id: str) -> Awaitable[None]: ...


class RecorderBroadcaster(Protocol):
    """Callable that pushes a session-status payload onto the WS
    queue. Decoupled from the websocket_rt module so tests can inject
    a list-appending fake. Production wiring binds this to
    ``publish_payload(RECORDER_SESSION_TOPIC, status.to_payload())``.
    """

    def __call__(self, status: "RecorderSessionStatus") -> Awaitable[None]: ...


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class RecorderSession:
    """Internal session record. Operators never see this directly —
    they see ``RecorderSessionStatus``. Internal mutability is
    permitted (asyncio-locked); the projection is immutable."""

    session_id: str
    snapshot_id: int
    tap_matrix: dict[str, dict[str, bool]]
    state: RecorderSessionState
    started_at: Optional[str] = None
    rolling_at: Optional[str] = None
    stopped_at: Optional[str] = None
    sealed_at: Optional[str] = None
    participating_nodes: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class RecorderSessionStatus:
    """Immutable projection for the WS topic + REST GET responses.

    Field shape matches T2508-6's WS broadcast spec verbatim so the
    UI consumer (T2509-5) can subscribe without translation."""

    session_id: str
    snapshot_id: int
    state: RecorderSessionState
    armed: bool
    rolling: bool
    sealed: bool
    started_at: Optional[str]
    rolling_at: Optional[str]
    stopped_at: Optional[str]
    sealed_at: Optional[str]
    tap_matrix: dict[str, dict[str, bool]]
    participating_nodes: list[str]

    def to_payload(self) -> dict[str, Any]:
        """Plain-dict shape for JSON serialization (WS + REST)."""
        return {
            "session_id": self.session_id,
            "snapshot_id": self.snapshot_id,
            "state": self.state.value,
            "armed": self.armed,
            "rolling": self.rolling,
            "sealed": self.sealed,
            "started_at": self.started_at,
            "rolling_at": self.rolling_at,
            "stopped_at": self.stopped_at,
            "sealed_at": self.sealed_at,
            "tap_matrix": dict(self.tap_matrix),
            "participating_nodes": list(self.participating_nodes),
        }


# ---------------------------------------------------------------------------
# RecorderService
# ---------------------------------------------------------------------------


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _generate_session_id() -> str:
    """RFC-4122 v4 UUID, prefixed with `sess-` for grep-ability."""
    return f"sess-{uuid.uuid4()}"


def _coerce_tap_matrix(raw: Any) -> dict[str, dict[str, bool]]:
    """Match the canonical T2506 ``tap_matrix`` shape.

    Strips blank chain_ids, drops non-dict tap entries, defaults
    ``pre_fx`` and ``post_fx`` to ``False``. Aligned with
    ``state_authority_graph._normalize_recording_block``.
    """
    if not isinstance(raw, dict):
        return {}
    normalized: dict[str, dict[str, bool]] = {}
    for chain_id, taps in raw.items():
        chain_key = str(chain_id or "").strip()
        if not chain_key or not isinstance(taps, dict):
            continue
        normalized[chain_key] = {
            "pre_fx": bool(taps.get("pre_fx", False)),
            "post_fx": bool(taps.get("post_fx", False)),
        }
    return normalized


class RecorderService:
    """Operator-facing recorder facade.

    Singleton-friendly: one instance per backend process. Holds the
    in-flight session map in memory; the canonical record lives in
    the State Authority graph's ``recording`` block (T2506) once the
    snapshot is mutated, but this service owns the *runtime* lifecycle.
    """

    def __init__(
        self,
        *,
        transport: Optional[RecorderTransport] = None,
        broadcaster: Optional[RecorderBroadcaster] = None,
        local_node_id: str = "local",
        session_id_factory: Callable[[], str] = _generate_session_id,
        clock: Callable[[], str] = _utcnow_iso,
    ) -> None:
        self._transport = transport
        self._broadcaster = broadcaster
        self._local_node_id = local_node_id
        self._session_id_factory = session_id_factory
        self._clock = clock
        self._sessions: dict[str, RecorderSession] = {}
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def arm_session(
        self,
        *,
        snapshot_id: int,
        tap_matrix: dict[str, Any],
        session_id: Optional[str] = None,
    ) -> RecorderSessionStatus:
        """Allocate a new session and arm capture for the given snapshot.

        Emits ``recorder.arm`` over the transport. Session starts in
        ``ARMED`` state. ``snapshot_id`` is validated as int.

        ``session_id`` is normally allocated locally via the injected
        factory. T2510-2 cluster followers pass an explicit
        ``session_id`` so the whole cluster shares the leader's id for
        a snapshot's recording session (followers must NOT mint their
        own). Re-arming an already-known session id is idempotent — the
        existing session is returned without a second arm.
        """
        if not isinstance(snapshot_id, int) or snapshot_id < 0:
            raise RecorderServiceError(
                code="invalid_snapshot_id",
                message=f"snapshot_id must be a non-negative int (got {snapshot_id!r})",
            )

        normalized_matrix = _coerce_tap_matrix(tap_matrix)
        session_id = session_id if session_id else self._session_id_factory()
        now = self._clock()

        async with self._lock:
            existing = self._sessions.get(session_id)
            if existing is not None:
                if existing.state == RecorderSessionState.SEALED:
                    # Read-only terminal state — a sealed session id can
                    # never be re-armed. Reject so the route emits a 409.
                    raise RecorderServiceError(
                        code="invalid_state",
                        message=f"cannot re-arm a sealed (read-only) session ({session_id})",
                        session_id=session_id,
                    )
                # Idempotent: a session with this id is already armed
                # (e.g. a re-applied Raft recording mutation). Return the
                # current projection without re-emitting ARM.
                return self._project(existing)
            session = RecorderSession(
                session_id=session_id,
                snapshot_id=snapshot_id,
                tap_matrix=normalized_matrix,
                state=RecorderSessionState.ARMED,
                started_at=now,
                participating_nodes=[self._local_node_id],
            )
            self._sessions[session_id] = session

        await self._emit_verb(RecorderVerb.ARM, session_id)
        status = self._project(session)
        await self._broadcast(status)
        logger.info(
            "RecorderService: armed session %s for snapshot %d (%d chain taps)",
            session_id,
            snapshot_id,
            len(normalized_matrix),
        )
        return status

    async def start_rolling(self, *, session_id: str) -> RecorderSessionStatus:
        """Transition ARMED → ROLLING. Idempotent on already-rolling."""
        async with self._lock:
            session = self._require_session_locked(session_id)
            if session.state == RecorderSessionState.SEALED:
                raise RecorderServiceError(
                    code="invalid_state",
                    message=f"cannot roll a sealed (read-only) session ({session_id})",
                    session_id=session_id,
                )
            if session.state == RecorderSessionState.STOPPED:
                raise RecorderServiceError(
                    code="invalid_state",
                    message=f"cannot roll a stopped session ({session_id})",
                    session_id=session_id,
                )
            if session.state == RecorderSessionState.ROLLING:
                # Idempotent: same state, no transition event.
                return self._project(session)
            session.state = RecorderSessionState.ROLLING
            session.rolling_at = self._clock()

        await self._emit_verb(RecorderVerb.ROLL, session_id)
        status = self._project(session)
        await self._broadcast(status)
        logger.info("RecorderService: rolling session %s", session_id)
        return status

    async def stop(self, *, session_id: str) -> RecorderSessionStatus:
        """Transition ROLLING → STOPPED or ARMED → STOPPED.

        Idempotent on already-stopped. ``recorder.stop`` is still
        emitted so the engine can finalize any pending writes (even
        if the engine never started rolling, e.g. a quick arm/stop).
        """
        async with self._lock:
            session = self._require_session_locked(session_id)
            if session.state == RecorderSessionState.SEALED:
                raise RecorderServiceError(
                    code="invalid_state",
                    message=f"cannot stop a sealed (read-only) session ({session_id})",
                    session_id=session_id,
                )
            if session.state == RecorderSessionState.STOPPED:
                return self._project(session)
            session.state = RecorderSessionState.STOPPED
            session.stopped_at = self._clock()

        await self._emit_verb(RecorderVerb.STOP, session_id)
        status = self._project(session)
        await self._broadcast(status)
        logger.info("RecorderService: stopped session %s", session_id)
        return status

    async def seal_session(self, *, session_id: str) -> RecorderSessionStatus:
        """Transition STOPPED → SEALED — the read-only terminal state.

        T2510-5: the cluster calls this once every participating peer
        has flushed its writers and registered its takes in the
        StateAuthorityAsset registry. The session metadata flips to
        ``sealed=True`` and the record becomes immutable — subsequent
        ``start_rolling`` / ``stop`` / re-``arm`` / ``disarm`` calls
        raise ``invalid_state``.

        Only ``STOPPED`` → ``SEALED`` is valid; sealing an ``ARMED`` or
        ``ROLLING`` (still-capturing) session raises ``invalid_state``.
        Idempotent on already-``SEALED``: returns the current projection
        without re-broadcasting.

        Seal is a *metadata-only* lifecycle marker. Unlike arm/roll/stop,
        it has **no** engine side-effect (the engine already stopped at
        STOPPED and the writers are flushed), so no ``engine_command``
        verb is emitted — the dispatcher's five recorder verbs stay the
        canonical engine surface. Seal only broadcasts the new status to
        the WS topic + REST projection.
        """
        async with self._lock:
            session = self._require_session_locked(session_id)
            if session.state == RecorderSessionState.SEALED:
                # Idempotent: already terminal. No re-broadcast.
                return self._project(session)
            if session.state != RecorderSessionState.STOPPED:
                raise RecorderServiceError(
                    code="invalid_state",
                    message=(
                        "cannot seal a non-stopped session "
                        f"(state={session.state.value}, session={session_id}); "
                        "stop the session before sealing"
                    ),
                    session_id=session_id,
                )
            session.state = RecorderSessionState.SEALED
            session.sealed_at = self._clock()

        # No engine verb — seal is a pure metadata transition (see
        # docstring). Broadcast the projection so the UI flips to the
        # read-only sealed badge and the REST GET reflects the seal.
        status = self._project(session)
        await self._broadcast(status)
        logger.info("RecorderService: sealed session %s (read-only)", session_id)
        return status

    async def disarm_session(self, *, session_id: str) -> None:
        """Drop a session entirely. Sends ``recorder.disarm`` first so
        the engine releases tap nodes; then removes the local record.
        Idempotent — disarming an unknown session is a silent no-op
        (the route still returns 200; the engine state is what we
        care about, and a missing session is already disarmed).

        A SEALED session is read-only (T2510-5): its takes have been
        flushed + registered in the StateAuthorityAsset registry, so
        dropping the record would discard the archived session. Disarm
        is therefore rejected with ``invalid_state`` rather than allowed
        as a cleanup path — sealing is the deliberate terminal step.
        """
        async with self._lock:
            current = self._sessions.get(session_id)
            if current is not None and current.state == RecorderSessionState.SEALED:
                raise RecorderServiceError(
                    code="invalid_state",
                    message=f"cannot disarm a sealed (read-only) session ({session_id})",
                    session_id=session_id,
                )
            session = self._sessions.pop(session_id, None)
        if session is None:
            logger.info(
                "RecorderService: disarm on unknown session %s (no-op)",
                session_id,
            )
            return
        await self._emit_verb(RecorderVerb.DISARM, session_id)
        # Broadcast a final "stopped + disarmed" projection so the UI
        # tears down its row without race conditions; we synthesize a
        # STOPPED state because the session object is gone.
        status = RecorderSessionStatus(
            session_id=session.session_id,
            snapshot_id=session.snapshot_id,
            state=RecorderSessionState.STOPPED,
            armed=False,
            rolling=False,
            sealed=False,
            started_at=session.started_at,
            rolling_at=session.rolling_at,
            stopped_at=self._clock(),
            sealed_at=session.sealed_at,
            tap_matrix=session.tap_matrix,
            participating_nodes=session.participating_nodes,
        )
        await self._broadcast(status)
        logger.info("RecorderService: disarmed session %s", session_id)

    async def get_session_status(self, *, session_id: str) -> RecorderSessionStatus:
        """Return the projection without emitting any verbs. Used by
        REST GET handlers + the WS replay-on-connect path."""
        async with self._lock:
            session = self._require_session_locked(session_id)
            return self._project(session)

    async def list_sessions(self) -> list[RecorderSessionStatus]:
        """Snapshot of all in-flight sessions for the list route."""
        async with self._lock:
            return [self._project(s) for s in self._sessions.values()]

    # ------------------------------------------------------------------
    # Late binding seams (production-wiring helpers)
    # ------------------------------------------------------------------

    def replace_broadcaster(self, broadcaster: Optional[RecorderBroadcaster]) -> None:
        """Swap the broadcaster after construction. Used by
        `recorder_ws_bridge.init_recorder_ws_bridge` so app startup
        can wire the singleton to the WS pipeline without rebuilding
        the in-flight session map. ``None`` un-binds and reverts to
        silent broadcast.
        """
        self._broadcaster = broadcaster

    def replace_transport(self, transport: Optional[RecorderTransport]) -> None:
        """Swap the transport after construction. Used once the T2507
        engine-side IPC lands so app startup can bind real verb
        emission without rebuilding the singleton."""
        self._transport = transport

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _require_session_locked(self, session_id: str) -> RecorderSession:
        """Caller must hold ``self._lock``."""
        session = self._sessions.get(session_id)
        if session is None:
            raise RecorderServiceError(
                code="unknown_session",
                message=f"recorder session {session_id!r} not found",
                session_id=session_id,
            )
        return session

    def _project(self, session: RecorderSession) -> RecorderSessionStatus:
        return RecorderSessionStatus(
            session_id=session.session_id,
            snapshot_id=session.snapshot_id,
            state=session.state,
            armed=session.state in (RecorderSessionState.ARMED, RecorderSessionState.ROLLING),
            rolling=session.state == RecorderSessionState.ROLLING,
            sealed=session.state == RecorderSessionState.SEALED,
            started_at=session.started_at,
            rolling_at=session.rolling_at,
            stopped_at=session.stopped_at,
            sealed_at=session.sealed_at,
            tap_matrix=dict(session.tap_matrix),
            participating_nodes=list(session.participating_nodes),
        )

    async def _emit_verb(self, verb: RecorderVerb, session_id: str) -> None:
        if self._transport is None:
            logger.info(
                "RecorderService: no transport bound; would emit %s for %s",
                verb.value,
                session_id,
            )
            return
        try:
            await self._transport(verb, session_id)
        except Exception as exc:  # noqa: BLE001
            # Log and continue — the local state-machine transition is
            # authoritative for the WS broadcast even if the engine IPC
            # missed the verb. A retry/reconciliation strategy belongs
            # in the transport layer (see T2510 cluster sync).
            logger.exception(
                "RecorderService: transport failed for %s(session=%s): %s",
                verb.value,
                session_id,
                exc,
            )

    async def _broadcast(self, status: RecorderSessionStatus) -> None:
        if self._broadcaster is None:
            return
        try:
            await self._broadcaster(status)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "RecorderService: broadcaster failed for session %s: %s",
                status.session_id,
                exc,
            )


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------


_service: Optional[RecorderService] = None


def get_recorder_service() -> RecorderService:
    """Return the process-wide RecorderService. Routes use this so the
    in-flight session map survives request boundaries. Wired in
    ``app/main.py`` lifespan startup; tests call ``set_recorder_service``
    to inject a fixture instance."""
    global _service
    if _service is None:
        _service = RecorderService()
    return _service


def set_recorder_service(service: Optional[RecorderService]) -> None:
    """Test seam — override the singleton with a fixture (or clear it
    by passing None)."""
    global _service
    _service = service

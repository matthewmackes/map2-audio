"""Engine-command handler implementations.

T2459-H Outer Loop 2 (L2.4-L2.6).

Each handler in this module is a thin translator: takes an
``EngineCommandContext`` from the dispatcher and turns it into a call
on the appropriate existing MAP2 service (or a queued action that the
existing service will process). Handlers are stateless and idempotent
where possible; the source-of-truth state lives in the service layer
(snapshot service, chain service, audio engine), not here.

Why a separate handler module
=============================
The dispatcher (``engine_command_dispatcher.py``) is a generic routing
mechanism. The handler logic — what ``audio.chain.1.bypass`` *means* —
is policy specific to MAP2's audio surface and changes with the audio
engine, so we keep it apart from the routing primitive.

Wiring
======

At backend startup (e.g. in ``app/main.py``'s startup event):

    from app.services.engine_command_dispatcher import EngineCommandDispatcher
    from app.services.engine_command_handlers import register_default_handlers
    from app.services.midi_host_client import MidiHostClient

    dispatcher = EngineCommandDispatcher()
    register_default_handlers(dispatcher, app_state=app.state)

    client = MidiHostClient(...)
    subscription = client.subscribe()
    subscription.on_engine_command(dispatcher.dispatch)
    subscription.start()

Handlers do NOT take service references at module import time —
``register_default_handlers`` accepts a callable injection point so
tests can swap in fakes without touching app state.

Action semantics
================

* ``set`` — value carries the target value (clamp 0..1 for normalized
  params).
* ``toggle`` — flip a boolean, ignore value.
* ``increment`` / ``decrement`` — bump by ``value`` (default 0.05) or
  by ``args[0]``.

Targets handled here
====================

* ``audio.chain.<N>.bypass``           (L2.4)
* ``audio.snapshot.recall``            (L2.5)
* ``audio.master.volume``              (L2.6)
* ``audio.transport.tap_tempo``        (L2.6)

Adding a new target
===================

Write a new ``HandlerImpl`` class with a class-level ``TARGET`` (or
``PATTERN``), implement ``__call__(self, ctx)``, and register it in
``register_default_handlers``. Tests live next to it under
``tests/test_engine_command_handlers_t2459h.py``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Callable, Optional, Protocol

from app.services.engine_command_dispatcher import (
    EngineCommandContext,
    EngineCommandDispatcher,
)


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Handler-side service hooks (dependency injection seam)
# ---------------------------------------------------------------------------


class _ChainBypassFn(Protocol):
    def __call__(self, chain_id: int, bypass: bool) -> None: ...


class _SnapshotRecallFn(Protocol):
    def __call__(self, snapshot_id: int) -> None: ...


class _MasterVolumeFn(Protocol):
    def __call__(self, volume: float) -> None: ...


class _TapTempoFn(Protocol):
    def __call__(self, timestamp_ns: Optional[int]) -> None: ...


# T2508 (phase 4 of T2504 Multi-Track Recorder) — recorder-service hooks.
# Non-RT: all five recorder verbs are dispatched from the controller-host /
# Python WS path, never from inside the JUCE audioCallback. The T2507 C++
# tap nodes consume the same verbs over IPC; the dispatcher here is the
# Python-side authority.
class _RecorderArmFn(Protocol):
    def __call__(self, session_id: str) -> None: ...


class _RecorderDisarmFn(Protocol):
    def __call__(self, session_id: str) -> None: ...


class _RecorderRollFn(Protocol):
    def __call__(self, session_id: str) -> None: ...


class _RecorderStopFn(Protocol):
    def __call__(self, session_id: str) -> None: ...


class _RecorderStatusFn(Protocol):
    def __call__(self, session_id: str) -> None: ...


@dataclass
class HandlerHooks:
    """Bundle of side-effect functions handlers call.

    Each hook is optional — ``None`` means "no production binding wired
    up yet"; the handler logs and increments a counter but stays
    side-effect-free. This lets us land the dispatcher path before the
    audio-engine APIs are finalized, without forcing CI to mock real
    services.
    """

    set_chain_bypass: Optional[_ChainBypassFn] = None
    recall_snapshot: Optional[_SnapshotRecallFn] = None
    set_master_volume: Optional[_MasterVolumeFn] = None
    tap_tempo: Optional[_TapTempoFn] = None
    # T2508 (phase 4 of T2504 Multi-Track Recorder).
    recorder_arm: Optional[_RecorderArmFn] = None
    recorder_disarm: Optional[_RecorderDisarmFn] = None
    recorder_roll: Optional[_RecorderRollFn] = None
    recorder_stop: Optional[_RecorderStopFn] = None
    recorder_status: Optional[_RecorderStatusFn] = None


# ---------------------------------------------------------------------------
# Action-value normalization helpers
# ---------------------------------------------------------------------------


def _resolve_bool_for_action(
    action: str,
    value: Optional[float],
    current: Optional[bool] = None,
) -> Optional[bool]:
    """Decide the target boolean for a set/toggle command.

    For ``set``: ``value`` truthy → True, value 0/None → False.
    For ``toggle``: flip the current value (caller must supply it; if
    None, default to True so the *first* toggle does something).
    Unknown actions return None so callers can decline to act.
    """
    if action == "toggle":
        if current is None:
            return True
        return not current
    if action == "set":
        if value is None:
            # Treat absence-of-value on a set action as "unset" → False.
            return False
        return value != 0.0
    return None


def _resolve_float_for_action(
    action: str,
    value: Optional[float],
    current: Optional[float] = None,
    default_step: float = 0.05,
) -> Optional[float]:
    if action == "set":
        return value
    if action in ("increment", "decrement"):
        sign = 1.0 if action == "increment" else -1.0
        step = value if value is not None else default_step
        if current is None:
            # Without state, increment from 0; the audio engine clamps.
            return sign * step
        return current + sign * step
    return None


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


# ---------------------------------------------------------------------------
# Individual handlers (each is a small callable closure factory)
# ---------------------------------------------------------------------------


def _make_chain_bypass_handler(hooks: HandlerHooks) -> Callable[[EngineCommandContext], None]:
    """Pattern: ``audio.chain.*.bypass`` — bypass / un-bypass a chain.

    ``ctx.params[0]`` is the chain index as a string from the matched
    pattern. We parse it to int; non-int chain refs (e.g. by name)
    aren't supported in this iteration.

    Per-chain bypass state is tracked locally so ``toggle`` flips
    correctly across consecutive presses without relying on the audio
    engine echoing state back. This is best-effort; the engine's value
    remains authoritative if it diverges (e.g. UI-driven bypass).
    """
    bypass_state: dict[int, bool] = {}

    def handler(ctx: EngineCommandContext) -> None:
        if not ctx.params:
            logger.warning(
                "chain.bypass: missing chain_id in ctx.params (target=%s)",
                ctx.target,
            )
            return
        try:
            chain_id = int(ctx.params[0])
        except (TypeError, ValueError):
            logger.warning(
                "chain.bypass: non-integer chain_id %r in target %s",
                ctx.params[0],
                ctx.target,
            )
            return

        current = bypass_state.get(chain_id)
        target_bypass = _resolve_bool_for_action(
            ctx.action, ctx.value, current=current
        )
        if target_bypass is None:
            logger.warning(
                "chain.bypass: unknown action %r for target %s",
                ctx.action,
                ctx.target,
            )
            return

        bypass_state[chain_id] = target_bypass

        if hooks.set_chain_bypass is None:
            logger.info(
                "chain.bypass: no service hook wired; would set chain %d bypass=%s",
                chain_id,
                target_bypass,
            )
            return
        hooks.set_chain_bypass(chain_id=chain_id, bypass=target_bypass)

    return handler


def _make_snapshot_recall_handler(hooks: HandlerHooks) -> Callable[[EngineCommandContext], None]:
    """Exact target: ``audio.snapshot.recall``.

    ``value`` carries the snapshot id (1-based to match operator
    expectation; the snapshot service may translate further). Action
    is always ``set`` for this target — recall is not a toggle.
    """

    def handler(ctx: EngineCommandContext) -> None:
        if ctx.action != "set":
            logger.info(
                "snapshot.recall: ignoring non-set action %r",
                ctx.action,
            )
            return
        if ctx.value is None:
            logger.warning("snapshot.recall: missing value")
            return
        try:
            snapshot_id = int(ctx.value)
        except (TypeError, ValueError):
            logger.warning("snapshot.recall: non-integer snapshot id %r", ctx.value)
            return
        if hooks.recall_snapshot is None:
            logger.info(
                "snapshot.recall: no service hook wired; would recall snapshot %d",
                snapshot_id,
            )
            return
        hooks.recall_snapshot(snapshot_id=snapshot_id)

    return handler


def _make_master_volume_handler(hooks: HandlerHooks) -> Callable[[EngineCommandContext], None]:
    """Exact target: ``audio.master.volume``.

    Normalized 0..1 float. Increment/decrement clamp to that range.
    The audio engine is responsible for translating to its own
    representation (dB, gain, etc.).
    """

    # Track last-known value so increment/decrement work even without
    # the audio engine echoing state back. This is best-effort; the
    # engine's value is authoritative.
    state: dict[str, float] = {"current": 1.0}

    def handler(ctx: EngineCommandContext) -> None:
        new_val = _resolve_float_for_action(
            ctx.action, ctx.value, current=state["current"], default_step=0.05
        )
        if new_val is None:
            logger.warning(
                "master.volume: unknown action %r",
                ctx.action,
            )
            return
        clamped = _clamp(new_val, 0.0, 1.0)
        state["current"] = clamped
        if hooks.set_master_volume is None:
            logger.info(
                "master.volume: no service hook wired; would set %.3f",
                clamped,
            )
            return
        hooks.set_master_volume(volume=clamped)

    return handler


def _make_tap_tempo_handler(hooks: HandlerHooks) -> Callable[[EngineCommandContext], None]:
    """Exact target: ``audio.transport.tap_tempo``.

    Each invocation feeds a tap to the transport. The host emits
    ``timestamp_ns`` in ``args[0]`` (or via the ControllerEvent that
    triggered the script) when available; if absent, the transport
    uses arrival time. Action and value are ignored.
    """

    def handler(ctx: EngineCommandContext) -> None:
        timestamp_ns: Optional[int] = None
        if ctx.args:
            try:
                timestamp_ns = int(ctx.args[0])
            except (TypeError, ValueError):
                timestamp_ns = None
        if hooks.tap_tempo is None:
            logger.info(
                "transport.tap_tempo: no service hook wired; tap @ %s",
                timestamp_ns,
            )
            return
        hooks.tap_tempo(timestamp_ns=timestamp_ns)

    return handler


# ---------------------------------------------------------------------------
# T2508 — recorder verb handlers
# ---------------------------------------------------------------------------
#
# Five verbs share the same lifecycle shape:
#
#     target: "recorder.arm"     args: [session_id]
#     target: "recorder.disarm"  args: [session_id]
#     target: "recorder.roll"    args: [session_id]
#     target: "recorder.stop"    args: [session_id]
#     target: "recorder.status"  args: [session_id]
#
# All five are exact-match (not pattern) targets — session_id rides in
# args[0] rather than the target path so dispatch never has to parse a
# variable URL-style segment. ``action`` is always ``set``; non-set
# actions are logged and dropped (mirrors snapshot.recall's treatment).
# ``value`` is unused — recorder verbs are lifecycle triggers, not
# numeric setters.
#
# RT-safety note: these handlers run on the Python event loop / WS
# thread, never inside the JUCE audioCallback. The T2507 engine-side
# capture nodes consume the same verbs over the shm IPC ring; the
# Python side never touches the audio thread.


def _extract_recorder_session_id(ctx: EngineCommandContext, verb: str) -> Optional[str]:
    """Pull the session_id off the verb context.

    Returns ``None`` and logs at WARN if the args are missing/empty or
    the session_id is blank after str() + strip(). Non-set actions are
    rejected (recorder verbs are lifecycle triggers — there is no
    'toggle' meaning).
    """
    if ctx.action != "set":
        logger.info("recorder.%s: ignoring non-set action %r", verb, ctx.action)
        return None
    if not ctx.args:
        logger.warning("recorder.%s: missing session_id in args[0]", verb)
        return None
    raw = ctx.args[0]
    session_id = str(raw or "").strip()
    if not session_id:
        logger.warning("recorder.%s: blank session_id %r", verb, raw)
        return None
    return session_id


def _make_recorder_arm_handler(hooks: HandlerHooks) -> Callable[[EngineCommandContext], None]:
    """Exact target: ``recorder.arm`` — arm a session for capture."""

    def handler(ctx: EngineCommandContext) -> None:
        session_id = _extract_recorder_session_id(ctx, "arm")
        if session_id is None:
            return
        if hooks.recorder_arm is None:
            logger.info(
                "recorder.arm: no service hook wired; would arm session %s",
                session_id,
            )
            return
        hooks.recorder_arm(session_id=session_id)

    return handler


def _make_recorder_disarm_handler(hooks: HandlerHooks) -> Callable[[EngineCommandContext], None]:
    """Exact target: ``recorder.disarm`` — release a previously-armed session."""

    def handler(ctx: EngineCommandContext) -> None:
        session_id = _extract_recorder_session_id(ctx, "disarm")
        if session_id is None:
            return
        if hooks.recorder_disarm is None:
            logger.info(
                "recorder.disarm: no service hook wired; would disarm session %s",
                session_id,
            )
            return
        hooks.recorder_disarm(session_id=session_id)

    return handler


def _make_recorder_roll_handler(hooks: HandlerHooks) -> Callable[[EngineCommandContext], None]:
    """Exact target: ``recorder.roll`` — start rolling on an armed session."""

    def handler(ctx: EngineCommandContext) -> None:
        session_id = _extract_recorder_session_id(ctx, "roll")
        if session_id is None:
            return
        if hooks.recorder_roll is None:
            logger.info(
                "recorder.roll: no service hook wired; would roll session %s",
                session_id,
            )
            return
        hooks.recorder_roll(session_id=session_id)

    return handler


def _make_recorder_stop_handler(hooks: HandlerHooks) -> Callable[[EngineCommandContext], None]:
    """Exact target: ``recorder.stop`` — stop a rolling session."""

    def handler(ctx: EngineCommandContext) -> None:
        session_id = _extract_recorder_session_id(ctx, "stop")
        if session_id is None:
            return
        if hooks.recorder_stop is None:
            logger.info(
                "recorder.stop: no service hook wired; would stop session %s",
                session_id,
            )
            return
        hooks.recorder_stop(session_id=session_id)

    return handler


def _make_recorder_status_handler(hooks: HandlerHooks) -> Callable[[EngineCommandContext], None]:
    """Exact target: ``recorder.status`` — request a one-shot status broadcast."""

    def handler(ctx: EngineCommandContext) -> None:
        session_id = _extract_recorder_session_id(ctx, "status")
        if session_id is None:
            return
        if hooks.recorder_status is None:
            logger.info(
                "recorder.status: no service hook wired; would query session %s",
                session_id,
            )
            return
        hooks.recorder_status(session_id=session_id)

    return handler


# ---------------------------------------------------------------------------
# Public registration entrypoint
# ---------------------------------------------------------------------------


def register_default_handlers(
    dispatcher: EngineCommandDispatcher,
    hooks: Optional[HandlerHooks] = None,
) -> None:
    """Wire the four canonical handlers into a dispatcher.

    Pass a populated ``HandlerHooks`` to bind real audio-engine side
    effects; pass ``None`` to bind the no-op variants (logs only).
    Tests use the no-op variant by default and inject targeted hooks
    where needed.
    """
    actual_hooks = hooks if hooks is not None else HandlerHooks()

    dispatcher.register_pattern(
        "audio.chain.*.bypass", _make_chain_bypass_handler(actual_hooks)
    )
    dispatcher.register(
        "audio.snapshot.recall", _make_snapshot_recall_handler(actual_hooks)
    )
    dispatcher.register(
        "audio.master.volume", _make_master_volume_handler(actual_hooks)
    )
    dispatcher.register(
        "audio.transport.tap_tempo", _make_tap_tempo_handler(actual_hooks)
    )

    # T2508 — recorder verbs (phase 4 of T2504 Multi-Track Recorder).
    # All five share the same args[0]=session_id, action=set shape; their
    # service-side bindings (hooks.recorder_*) stay None until T2508's
    # `RecorderService` lands in `app/services/recorder_service.py`.
    dispatcher.register("recorder.arm", _make_recorder_arm_handler(actual_hooks))
    dispatcher.register("recorder.disarm", _make_recorder_disarm_handler(actual_hooks))
    dispatcher.register("recorder.roll", _make_recorder_roll_handler(actual_hooks))
    dispatcher.register("recorder.stop", _make_recorder_stop_handler(actual_hooks))
    dispatcher.register("recorder.status", _make_recorder_status_handler(actual_hooks))

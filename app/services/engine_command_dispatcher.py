"""Engine-command dispatcher.

T2459-H Phase H Outer Loop 2 (L2.3-L2.6).

When the controller-host's QuickJS runtime executes a vendor mapping
script, it calls ``engine.setValue("audio.chain.1.bypass", true)`` (or
similar). The host serializes that into an ``EngineCommand`` IPC frame
and pushes it to the backend over the UDS event subscription. This
module is the consumer side: it receives those frames and actuates the
real audio-engine side effect.

Why this layer exists
=====================
The ``MidiHostClient.MidiEventSubscription`` exposes
``on_engine_command(fn)`` — but as of 2026-05-04 (per
``project_t2459h_midi_unification.md``) **no production code registers
a callback**. The existing controller-host can produce
``engine_command`` frames; until something consumes them, the entire
mapping path from physical control → audio side effect is broken
end-to-end. This dispatcher closes that gap.

Architecture
============

Input shape
    ``EngineCommand`` TypedDict from
    ``app/schemas/controller_host.py``. Required: ``type``, ``msg_id``,
    ``schema_version``, ``controller_key``, ``target``, ``action``.
    Optional: ``value``, ``args``.

Routing
    The dispatcher maintains a registry keyed by ``target``. Targets
    are namespaced (``audio.chain.1.bypass``,
    ``audio.snapshot.recall``, ``audio.master.volume``,
    ``audio.transport.tap_tempo``, …). A single handler registers for
    a target and gets called with the parsed command.

Pattern matching
    Some targets are parametric — ``audio.chain.<N>.bypass`` for any
    chain index N. The dispatcher supports two registration shapes:

    1. **Exact match** — register for ``"audio.snapshot.recall"`` and
       get called whenever ``target == "audio.snapshot.recall"``.
    2. **Pattern match** — register for ``"audio.chain.*.bypass"``
       (single-segment glob) and the dispatcher passes the matched
       segments via ``params`` so the handler can extract the chain
       index.

Error handling
    Handlers run synchronously on the reader thread (see
    ``MidiEventSubscription._dispatch``). The dispatcher wraps each
    handler call in try/except and routes failures to a logger and an
    optional ``on_error`` hook. A buggy handler must not kill the
    subscription — the entire mapping path would go silent.

Lifecycle
    The dispatcher is a long-lived singleton on the backend side. Wire
    it up at startup:

        dispatcher = EngineCommandDispatcher()
        dispatcher.register_handlers(...)  # see app/services/engine_command_handlers.py
        subscription = midi_host_client.subscribe()
        subscription.on_engine_command(dispatcher.dispatch)
        subscription.start()

    When the backend shuts down, ``subscription.stop()`` halts the
    reader thread and the dispatcher goes idle.
"""

from __future__ import annotations

import fnmatch
import logging
from dataclasses import dataclass
from typing import Any, Callable, Optional


logger = logging.getLogger(__name__)


@dataclass
class EngineCommandContext:
    """Parsed payload passed to handlers.

    The dispatcher converts the raw ``EngineCommand`` TypedDict into
    this typed wrapper so handlers don't need to deal with
    ``NotRequired`` field absence. ``params`` carries the matched
    pattern segments for pattern-registered handlers (empty for
    exact-match handlers).
    """

    target: str
    action: str
    value: Optional[float]
    args: list[Any]
    controller_key: str
    msg_id: str
    params: list[str]


HandlerFn = Callable[[EngineCommandContext], None]


@dataclass
class _Registration:
    pattern: str
    handler: HandlerFn
    is_exact: bool


class EngineCommandDispatcher:
    """Routes ``engine_command`` frames to registered handlers."""

    def __init__(
        self,
        on_error: Optional[Callable[[str, Exception], None]] = None,
    ) -> None:
        # Exact-match map: O(1) lookup for the common case.
        self._exact: dict[str, HandlerFn] = {}
        # Pattern-match list: linear scan, fine because we expect ~5-10
        # patterns total across the platform. Order is registration
        # order; first match wins so callers can register specific
        # patterns before catch-alls.
        self._patterns: list[_Registration] = []
        self._on_error = on_error
        # Stats for observability — 'dispatched' counts successful
        # routings, 'unmatched' counts targets with no handler,
        # 'errored' counts handler exceptions.
        self.dispatched_count = 0
        self.unmatched_count = 0
        self.errored_count = 0

    def register(self, target: str, handler: HandlerFn) -> None:
        """Register a handler for an exact target string.

        Re-registering an existing exact target overwrites the
        previous handler — useful for tests but a programming error
        in production code; we log a warning so it surfaces.
        """
        if target in self._exact:
            logger.warning(
                "EngineCommandDispatcher: re-registering exact target %r "
                "(previous handler will be replaced)",
                target,
            )
        self._exact[target] = handler

    def register_pattern(self, pattern: str, handler: HandlerFn) -> None:
        """Register a handler for a fnmatch-style pattern.

        Patterns use ``*`` to match a single dotted segment (and any
        characters within), e.g. ``"audio.chain.*.bypass"``. Handlers
        receive the matched segments as ``ctx.params`` so they can
        extract the chain index.

        Order matters: patterns are scanned in registration order;
        register the most specific first.
        """
        self._patterns.append(
            _Registration(pattern=pattern, handler=handler, is_exact=False)
        )

    def dispatch(self, message: dict[str, Any]) -> None:
        """Route an ``engine_command`` IPC message to its handler.

        ``message`` is the raw decoded TypedDict from the UDS reader
        thread. Validates frame type before dispatching — a non-engine
        message is silently dropped (the subscription multiplexer
        should never deliver one here, but defense-in-depth).
        """
        if message.get("type") != "engine_command":
            # Wrong frame type — caller wired the dispatcher up
            # against a non-engine_command callback by mistake.
            logger.warning(
                "EngineCommandDispatcher: dropping non-engine_command frame "
                "(type=%r)",
                message.get("type"),
            )
            return

        target = message.get("target")
        if not isinstance(target, str) or not target:
            logger.warning(
                "EngineCommandDispatcher: dropping engine_command with "
                "missing/invalid target: %r",
                message,
            )
            return

        ctx = _build_context(message)

        # Exact match path.
        exact_handler = self._exact.get(target)
        if exact_handler is not None:
            self._invoke(exact_handler, ctx, target)
            return

        # Pattern match path — first registered match wins.
        for reg in self._patterns:
            if fnmatch.fnmatchcase(target, reg.pattern):
                ctx_with_params = _with_pattern_params(ctx, reg.pattern)
                self._invoke(reg.handler, ctx_with_params, target)
                return

        # Unmatched target — log at info, not warning, so the noise
        # floor stays low when scripts emit experimental targets.
        self.unmatched_count += 1
        logger.info(
            "EngineCommandDispatcher: no handler for target %r "
            "(controller_key=%s, action=%s)",
            target,
            ctx.controller_key,
            ctx.action,
        )

    def _invoke(self, handler: HandlerFn, ctx: EngineCommandContext, target: str) -> None:
        try:
            handler(ctx)
            self.dispatched_count += 1
        except Exception as exc:  # noqa: BLE001 — handler must not kill the reader
            self.errored_count += 1
            logger.exception(
                "EngineCommandDispatcher: handler for %r raised %r",
                target,
                exc,
            )
            if self._on_error is not None:
                try:
                    self._on_error(target, exc)
                except Exception:
                    # The error hook itself failed — give up and log;
                    # we are not in a position to escalate further.
                    logger.exception(
                        "EngineCommandDispatcher: on_error hook also raised; "
                        "swallowing"
                    )

    def reset_stats(self) -> None:
        """Reset dispatched/unmatched/errored counters. Test seam."""
        self.dispatched_count = 0
        self.unmatched_count = 0
        self.errored_count = 0


def _build_context(message: dict[str, Any]) -> EngineCommandContext:
    raw_value = message.get("value")
    value: Optional[float]
    if raw_value is None:
        value = None
    else:
        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            value = None

    raw_args = message.get("args")
    args: list[Any] = list(raw_args) if isinstance(raw_args, list) else []

    return EngineCommandContext(
        target=str(message.get("target", "")),
        action=str(message.get("action", "")),
        value=value,
        args=args,
        controller_key=str(message.get("controller_key", "")),
        msg_id=str(message.get("msg_id", "")),
        params=[],
    )


def _with_pattern_params(
    ctx: EngineCommandContext,
    pattern: str,
) -> EngineCommandContext:
    """Extract pattern segments from the matched target.

    ``"audio.chain.*.bypass"`` against ``"audio.chain.5.bypass"``
    yields ``params=["5"]``. Splits both on '.' and pairs by index.
    """
    pattern_segments = pattern.split(".")
    target_segments = ctx.target.split(".")
    params: list[str] = []
    for pat_seg, tgt_seg in zip(pattern_segments, target_segments):
        if pat_seg == "*":
            params.append(tgt_seg)
    return EngineCommandContext(
        target=ctx.target,
        action=ctx.action,
        value=ctx.value,
        args=ctx.args,
        controller_key=ctx.controller_key,
        msg_id=ctx.msg_id,
        params=params,
    )

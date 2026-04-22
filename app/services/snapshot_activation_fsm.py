"""MAP2 State Authority — Activation State Machine (plan §Activation).

Formalizes the 5-phase activation lifecycle specified in the plan:

    IDLE → VALIDATING → STAGING → APPLYING → VERIFYING → LIVE

With phase-aware rollback (Q64 + Q65):
- Failure BEFORE `APPLYING` enters → keep old audio, report error, stay IDLE.
- Failure DURING or AFTER `APPLYING` → stop audio, report partial state.

And a 10-second total timeout (Q24) with auto-stop-and-report.

The FSM is transport-agnostic: it emits progress events through an injected
publisher so `WebSocket snapshot_runtime_live_state` (Q51), Raft log entries,
Prometheus counters, and test observers can all subscribe. It is also
asyncio-native — phase handlers are coroutines with per-phase timeouts so
a stuck hook cannot hang the activation.

Config-file activation hooks (Q40/Q46/Q90) are loaded from
`~/.map2/config.json → activation_hooks` and fired with best-effort error
handling (Q10) during VERIFYING.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Awaitable, Callable, Iterable

logger = logging.getLogger(__name__)


class ActivationPhase(str, Enum):
    """The 5 canonical phases of the activation lifecycle."""

    IDLE = "idle"
    VALIDATING = "validating"
    STAGING = "staging"
    APPLYING = "applying"
    VERIFYING = "verifying"
    LIVE = "live"
    FAILED = "failed"


# Phases after which a failure must stop audio (Q65). The divider is `APPLYING`:
# reaching or passing APPLYING means the engine has started handing real audio
# through the new graph, so a rollback must stop the engine rather than
# keeping the old audio alive.
_PHASE_ORDER = [
    ActivationPhase.IDLE,
    ActivationPhase.VALIDATING,
    ActivationPhase.STAGING,
    ActivationPhase.APPLYING,
    ActivationPhase.VERIFYING,
    ActivationPhase.LIVE,
]
_PHASES_AFTER_APPLY_BOUNDARY = {
    ActivationPhase.APPLYING,
    ActivationPhase.VERIFYING,
    ActivationPhase.LIVE,
}


# Default per-phase timeouts in milliseconds. The sum is capped at 10s total
# (Q24). Individual phases get a share that reflects their expected cost.
DEFAULT_PHASE_TIMEOUTS_MS: dict[ActivationPhase, int] = {
    ActivationPhase.VALIDATING: 1000,   # schema + plugin availability + asset hash check
    ActivationPhase.STAGING: 4500,      # load plugins, build shadow ValueTree, preload assets
    ActivationPhase.APPLYING: 1500,     # send ValueTree to engine + start crossfade
    ActivationPhase.VERIFYING: 2500,    # 2.5s health check + hooks
}
TOTAL_ACTIVATION_TIMEOUT_MS = 10_000


@dataclass(frozen=True)
class PhaseProgressEvent:
    """One phase transition or progress tick emitted during activation."""

    phase: ActivationPhase
    snapshot_id: str
    elapsed_ms: int
    detail: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


@dataclass
class ActivationResult:
    """Final outcome of an activation attempt."""

    phase: ActivationPhase
    snapshot_id: str
    elapsed_ms: int
    success: bool
    error: str | None = None
    failed_phase: ActivationPhase | None = None
    details: dict[str, Any] = field(default_factory=dict)
    hook_results: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class ActivationHookConfig:
    """One configured activation hook (plan Q90 — full fields with metadata)."""

    name: str
    module: str
    function: str
    phase: str = "post_apply"
    enabled: bool = True
    timeout_ms: int = 2000
    on_error: str = "warn"  # warn | abort | ignore


ActivationPhaseHandler = Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]
ProgressPublisher = Callable[[PhaseProgressEvent], Awaitable[None]]
# Coarse-grained event emitter — maps activation outcome to the canonical
# PlatformEventBus kinds (snapshot.activation.started / .ok / .failed).
# Injected so the FSM stays transport-agnostic; the bus adapter lives in
# app.main lifespan. Signature: (kind, severity, context) -> awaitable.
ActivationEventEmitter = Callable[[str, str, dict[str, Any]], Awaitable[None]]


class ActivationFailedError(Exception):
    """Raised by a phase handler to signal a failure that must stop the FSM."""

    def __init__(self, phase: ActivationPhase, message: str, details: dict[str, Any] | None = None):
        super().__init__(f"{phase.value}: {message}")
        self.phase = phase
        self.message = message
        self.details = details or {}


def phase_is_past_apply_boundary(phase: ActivationPhase) -> bool:
    """Return True iff a failure at this phase should stop audio (Q65)."""
    return phase in _PHASES_AFTER_APPLY_BOUNDARY


def phase_order() -> list[ActivationPhase]:
    """Canonical ordering of phases in the activation lifecycle."""
    return list(_PHASE_ORDER)


async def _noop_publisher(_event: PhaseProgressEvent) -> None:
    return None


async def _call_hook(
    hook: ActivationHookConfig,
    *,
    context: dict[str, Any],
    resolver: Callable[[str, str], Callable[..., Awaitable[Any]] | None],
) -> dict[str, Any]:
    """Resolve a hook's `module.function` and invoke it with a timeout."""
    fn = resolver(hook.module, hook.function)
    result: dict[str, Any] = {"name": hook.name, "status": "skipped"}
    if fn is None:
        result["reason"] = f"{hook.module}.{hook.function} not resolvable"
        return result
    try:
        async with asyncio.timeout(max(hook.timeout_ms, 10) / 1000):
            out = fn(context)
            if asyncio.iscoroutine(out):
                await out
            result["status"] = "ok"
    except asyncio.TimeoutError:
        result["status"] = "timeout"
        result["timeout_ms"] = hook.timeout_ms
    except Exception as exc:  # noqa: BLE001 — best-effort per Q10
        result["status"] = "error"
        result["error"] = repr(exc)
    return result


class SnapshotActivationFSM:
    """Orchestrate the 5-phase activation lifecycle with 10s total timeout."""

    def __init__(
        self,
        *,
        validator: ActivationPhaseHandler | None = None,
        stager: ActivationPhaseHandler | None = None,
        applier: ActivationPhaseHandler | None = None,
        verifier: ActivationPhaseHandler | None = None,
        hooks: Iterable[ActivationHookConfig] = (),
        publish_progress: ProgressPublisher | None = None,
        hook_resolver: Callable[[str, str], Callable[..., Awaitable[Any]] | None] | None = None,
        now_ms: Callable[[], int] | None = None,
        phase_timeouts_ms: dict[ActivationPhase, int] | None = None,
        total_timeout_ms: int = TOTAL_ACTIVATION_TIMEOUT_MS,
        event_emitter: ActivationEventEmitter | None = None,
    ) -> None:
        self._validator = validator
        self._stager = stager
        self._applier = applier
        self._verifier = verifier
        self._hooks = tuple(hooks)
        self._publish = publish_progress or _noop_publisher
        self._hook_resolver = hook_resolver or (lambda _m, _f: None)
        self._now_ms = now_ms or (lambda: int(time.monotonic() * 1000))
        self._phase_timeouts_ms = {**DEFAULT_PHASE_TIMEOUTS_MS, **(phase_timeouts_ms or {})}
        # Floor at 50ms so tests can exercise short-timeout paths; production
        # callers should pass at least 1000ms (Q24 total = 10s default).
        self._total_timeout_ms = max(total_timeout_ms, 50)
        # Coarse-grained event emitter for the canonical PlatformEventBus.
        # Optional: None = silent (preserves test harnesses that don't inject
        # a bus). Errors during emit are swallowed so a dead bus never
        # crashes the activation lifecycle (plan Q10 — best-effort).
        self._emit_event = event_emitter

    async def activate(self, snapshot_id: str, context: dict[str, Any] | None = None) -> ActivationResult:
        """Run the full lifecycle, emitting one progress event per phase."""
        context = dict(context or {})
        context["snapshot_id"] = snapshot_id
        start_ms = self._now_ms()

        async def _elapsed() -> int:
            return self._now_ms() - start_ms

        # Emit started event before the FSM runs any phase handler so
        # downstream surfaces (Stage Notification, webhooks) know an
        # activation is inflight from t=0.
        await self._safe_emit_event(
            "snapshot.activation.started",
            "info",
            {"snapshot_id": snapshot_id, "total_timeout_ms": self._total_timeout_ms},
        )

        try:
            async with asyncio.timeout(self._total_timeout_ms / 1000):
                # VALIDATING
                await self._run_phase(
                    snapshot_id=snapshot_id,
                    phase=ActivationPhase.VALIDATING,
                    handler=self._validator,
                    context=context,
                    start_ms=start_ms,
                )
                # STAGING
                await self._run_phase(
                    snapshot_id=snapshot_id,
                    phase=ActivationPhase.STAGING,
                    handler=self._stager,
                    context=context,
                    start_ms=start_ms,
                )
                # APPLYING
                await self._run_phase(
                    snapshot_id=snapshot_id,
                    phase=ActivationPhase.APPLYING,
                    handler=self._applier,
                    context=context,
                    start_ms=start_ms,
                )
                # VERIFYING
                verify_details = await self._run_phase(
                    snapshot_id=snapshot_id,
                    phase=ActivationPhase.VERIFYING,
                    handler=self._verifier,
                    context=context,
                    start_ms=start_ms,
                )
                # Hooks run during VERIFYING (Q91: post_apply)
                hook_results = await self._run_hooks(context=context)
                # LIVE
                elapsed = await _elapsed()
                await self._publish(PhaseProgressEvent(
                    phase=ActivationPhase.LIVE,
                    snapshot_id=snapshot_id,
                    elapsed_ms=elapsed,
                    detail={**verify_details, "hook_count": len(hook_results)},
                ))
                await self._safe_emit_event(
                    "snapshot.activation.ok",
                    "info",
                    {
                        "snapshot_id": snapshot_id,
                        "elapsed_ms": elapsed,
                        "hook_count": len(hook_results),
                    },
                )
                return ActivationResult(
                    phase=ActivationPhase.LIVE,
                    snapshot_id=snapshot_id,
                    elapsed_ms=elapsed,
                    success=True,
                    details=verify_details,
                    hook_results=hook_results,
                )
        except ActivationFailedError as exc:
            elapsed = await _elapsed()
            await self._publish(PhaseProgressEvent(
                phase=ActivationPhase.FAILED,
                snapshot_id=snapshot_id,
                elapsed_ms=elapsed,
                detail=exc.details,
                error=exc.message,
            ))
            await self._safe_emit_event(
                "snapshot.activation.failed",
                "error" if phase_is_past_apply_boundary(exc.phase) else "warning",
                {
                    "snapshot_id": snapshot_id,
                    "elapsed_ms": elapsed,
                    "failed_phase": exc.phase.value,
                    "error": exc.message,
                    "past_apply_boundary": phase_is_past_apply_boundary(exc.phase),
                },
            )
            return ActivationResult(
                phase=ActivationPhase.FAILED,
                snapshot_id=snapshot_id,
                elapsed_ms=elapsed,
                success=False,
                error=exc.message,
                failed_phase=exc.phase,
                details=exc.details,
            )
        except asyncio.TimeoutError:
            elapsed = await _elapsed()
            err = f"activation exceeded {self._total_timeout_ms}ms total timeout"
            await self._publish(PhaseProgressEvent(
                phase=ActivationPhase.FAILED,
                snapshot_id=snapshot_id,
                elapsed_ms=elapsed,
                error=err,
            ))
            await self._safe_emit_event(
                "snapshot.activation.failed",
                "error",
                {
                    "snapshot_id": snapshot_id,
                    "elapsed_ms": elapsed,
                    "error": err,
                    "reason": "total_timeout",
                },
            )
            return ActivationResult(
                phase=ActivationPhase.FAILED,
                snapshot_id=snapshot_id,
                elapsed_ms=elapsed,
                success=False,
                error=err,
                failed_phase=None,
            )

    async def _run_phase(
        self,
        *,
        snapshot_id: str,
        phase: ActivationPhase,
        handler: ActivationPhaseHandler | None,
        context: dict[str, Any],
        start_ms: int,
    ) -> dict[str, Any]:
        await self._publish(PhaseProgressEvent(
            phase=phase,
            snapshot_id=snapshot_id,
            elapsed_ms=self._now_ms() - start_ms,
            detail={},
        ))
        if handler is None:
            return {}
        phase_timeout_ms = self._phase_timeouts_ms.get(phase, 2000)
        try:
            async with asyncio.timeout(phase_timeout_ms / 1000):
                result = await handler(context)
                return dict(result or {})
        except ActivationFailedError:
            raise
        except asyncio.TimeoutError as exc:
            raise ActivationFailedError(
                phase=phase,
                message=f"{phase.value} phase exceeded {phase_timeout_ms}ms",
            ) from exc
        except Exception as exc:  # noqa: BLE001
            raise ActivationFailedError(
                phase=phase,
                message=f"{phase.value} phase raised: {exc!r}",
                details={"exception_type": type(exc).__name__},
            ) from exc

    async def _run_hooks(self, *, context: dict[str, Any]) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for hook in self._hooks:
            if not hook.enabled:
                results.append({"name": hook.name, "status": "disabled"})
                continue
            result = await _call_hook(hook, context=context, resolver=self._hook_resolver)
            results.append(result)
            if hook.on_error == "abort" and result.get("status") in {"error", "timeout"}:
                raise ActivationFailedError(
                    phase=ActivationPhase.VERIFYING,
                    message=f"hook {hook.name!r} failed with on_error=abort",
                    details={"hook_result": result},
                )
        return results

    async def _safe_emit_event(
        self, kind: str, severity: str, context: dict[str, Any]
    ) -> None:
        """Fire a PlatformEvent through the injected emitter.

        Swallows any failure so a dead event bus cannot crash the
        activation lifecycle (plan Q10 — best-effort error handling).
        """
        if self._emit_event is None:
            return
        try:
            await self._emit_event(kind, severity, context)
        except Exception as exc:  # noqa: BLE001
            logger.debug("Activation event emission failed: %s", exc)


def load_activation_hooks_from_config(config: dict[str, Any]) -> tuple[ActivationHookConfig, ...]:
    """Parse `activation_hooks` (Q40) out of a loaded ~/.map2/config.json dict."""
    raw = config.get("activation_hooks") if isinstance(config, dict) else None
    if not isinstance(raw, list):
        return ()
    hooks: list[ActivationHookConfig] = []
    for entry in raw:
        if not isinstance(entry, dict):
            continue
        name = str(entry.get("name") or "").strip()
        module = str(entry.get("module") or "").strip()
        function = str(entry.get("function") or "").strip()
        if not (name and module and function):
            continue
        hooks.append(ActivationHookConfig(
            name=name,
            module=module,
            function=function,
            phase=str(entry.get("phase") or "post_apply").strip() or "post_apply",
            enabled=bool(entry.get("enabled", True)),
            timeout_ms=int(entry.get("timeout_ms", 2000) or 2000),
            on_error=str(entry.get("on_error") or "warn").strip() or "warn",
        ))
    return tuple(hooks)

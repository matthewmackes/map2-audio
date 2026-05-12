"""Production wiring for the engine-command dispatcher.

Closes the "broken end-to-end" gap called out in
``engine_command_dispatcher.py``: the dispatcher + four canonical handlers
have always been in place, but no production code ever populated
``HandlerHooks`` with real audio-engine side effects, and no production
code ever forwarded the controller-host's ``engine_command`` frames to
the dispatcher.

What this module does
=====================

- Exposes a singleton :class:`EngineCommandBridge` that owns:
  - one :class:`EngineCommandDispatcher`
  - a :class:`HandlerHooks` populated with real services (currently:
    ``recall_snapshot``)
  - the running asyncio event loop reference used to bridge handler
    callbacks (which run on a reader thread) back into async DB work
- Provides a single entrypoint :func:`dispatch_engine_command` callable
  used as the ``MidiEventSubscription.on_engine_command(...)`` callback.
- Schedules async hooks via ``asyncio.run_coroutine_threadsafe`` and
  swallows-and-logs exceptions so a buggy handler cannot kill the
  reader thread.

Wiring lives in ``app/main.py`` lifespan startup; one extra block under
the existing ControllerHostService init block. No FastAPI route changes,
no schema changes — handlers + dispatcher are already covered by tests.

Today only ``audio.snapshot.recall`` is bound to a real service; the
other three handlers (``audio.chain.*.bypass``, ``audio.master.volume``,
``audio.transport.tap_tempo``) keep their no-op behavior until their
audio-engine APIs land. Adding more hooks later is a one-line change to
``_build_hooks`` below.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from app.services.engine_command_dispatcher import EngineCommandDispatcher
from app.services.engine_command_handlers import HandlerHooks, register_default_handlers

logger = logging.getLogger(__name__)


class EngineCommandBridge:
    """Wires a dispatcher + production hooks to the reader-thread callback.

    Lifetime: created once at lifespan startup; ``dispatch_engine_command``
    is set as the ``MidiEventSubscription.on_engine_command(...)``
    callback. The bridge holds a reference to the asyncio event loop so
    handler callbacks can schedule async work back onto it.
    """

    def __init__(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop
        self._dispatcher = EngineCommandDispatcher(on_error=self._on_handler_error)
        self._subscription: Optional[Any] = None
        register_default_handlers(self._dispatcher, hooks=self._build_hooks())

    # ------------------------------------------------------------------
    # Subscription lifecycle
    # ------------------------------------------------------------------

    def start_subscription(self, *, wait_timeout_s: float = 10.0) -> bool:
        """Subscribe to the controller-host's ``engine_command`` stream.

        Blocks up to ``wait_timeout_s`` for the host UDS to come up
        (the supervisor may still be spawning when lifespan calls us).
        Returns True if the subscription is live, False if the host
        never became reachable. Failure is non-fatal — backend can
        run without the bridge; mappings will queue at the host until
        the next backend restart.
        """
        # Imported here so this module remains import-light for tests.
        from app.services.midi_host_client import MidiHostClient

        client = MidiHostClient()
        if not client.wait_for_daemon(timeout_s=wait_timeout_s):
            logger.info(
                "EngineCommandBridge: controller-host not reachable within %.1fs; "
                "skipping subscription start",
                wait_timeout_s,
            )
            return False

        try:
            subscription = client.subscribe()
            subscription.on_engine_command(self.dispatch_engine_command)
            subscription.start()
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "EngineCommandBridge: subscription failed to start: %s", exc
            )
            return False

        self._subscription = subscription
        logger.info(
            "EngineCommandBridge: subscribed to controller-host engine_command stream"
        )
        return True

    def stop_subscription(self) -> None:
        if self._subscription is None:
            return
        try:
            self._subscription.stop()
        except Exception as exc:  # noqa: BLE001
            logger.debug("EngineCommandBridge: subscription stop error: %s", exc)
        finally:
            self._subscription = None

    @property
    def dispatcher(self) -> EngineCommandDispatcher:
        return self._dispatcher

    def dispatch_engine_command(self, frame: dict[str, Any]) -> None:
        """Reader-thread entrypoint. Forwards a parsed engine_command
        frame to the dispatcher. Exceptions are caught by the dispatcher
        itself; this function is the public callback shape expected by
        :meth:`MidiEventSubscription.on_engine_command`."""
        self._dispatcher.dispatch(frame)

    # ------------------------------------------------------------------
    # Hooks
    # ------------------------------------------------------------------

    def _build_hooks(self) -> HandlerHooks:
        return HandlerHooks(
            recall_snapshot=self._recall_snapshot_hook,
            # T2512-MIDI — looper verbs. Each hook resolves the
            # LooperService singleton at call time; if the engine /
            # service isn't up yet, the resolver logs and returns
            # without calling into the binding.
            looper_record=lambda track: self._looper_call("record", track),
            looper_stop=lambda track: self._looper_call("stop_track", track),
            looper_clear=lambda track: self._looper_call("clear", track),
            looper_undo=lambda track: self._looper_call("undo", track),
            looper_redo=lambda track: self._looper_call("redo", track),
            looper_set_level=lambda track, value: self._looper_call(
                "set_level_db", track, value
            ),
            looper_set_muted=lambda track, value: self._looper_call(
                "set_muted", track, value
            ),
            looper_set_soloed=lambda track, value: self._looper_call(
                "set_soloed", track, value
            ),
            looper_set_reverse=lambda track, value: self._looper_call(
                "set_reverse", track, value
            ),
            looper_set_half_speed=lambda track, value: self._looper_call(
                "set_half_speed", track, value
            ),
            # T2512-LOCK over MIDI — footswitch latches write-protection.
            looper_set_locked=lambda track, value: self._looper_call(
                "set_locked", track, value
            ),
            # T2512-OS — footswitch latches one-shot / trigger mode.
            looper_set_one_shot=lambda track, value: self._looper_call(
                "set_one_shot", track, value
            ),
            # T2512-AUTO — footswitch arms input-threshold auto-record.
            looper_set_auto_armed=lambda track, value: self._looper_call(
                "set_auto_armed", track, value
            ),
            # T2512-DISPATCH-V2 — cycle-6/7/9 setters via dispatcher.
            looper_set_stop_mode=lambda track, value: self._looper_call(
                "set_stop_mode", track, value
            ),
            looper_set_fade_ms=lambda track, value: self._looper_call(
                "set_fade_ms", track, int(value)
            ),
            looper_set_sync_mode=lambda track, value: self._looper_call(
                "set_sync_mode", track, value
            ),
            looper_set_quantize_division=lambda track, value: self._looper_call(
                "set_quantize_division", track, value
            ),
            looper_set_master_level=lambda value: self._looper_call_master(
                "set_master_level_db", value
            ),
            # Other hooks left None — handlers fall back to no-op +
            # log line until their audio-engine APIs are ready.
        )

    @staticmethod
    def _resolve_looper_service() -> Optional[Any]:
        """Late-bind the LooperService singleton. Returns None if the
        service hasn't been wired yet (lifespan ordering: bridge may
        come up before JuceEngineService is ready)."""
        try:
            from app.services.looper_service import get_looper_service
        except ImportError:
            return None
        return get_looper_service()

    def _looper_call(self, method_name: str, track: int, *extra: Any) -> None:
        """Resolve LooperService and invoke ``method_name(track, *extra)``.
        All looper verbs run on the reader thread; they call into the
        pybind11 bindings which only flip atomic flags inside the
        engine — no async scheduling needed."""
        service = self._resolve_looper_service()
        if service is None:
            logger.info(
                "engine_command looper.%s(track=%d): LooperService not ready",
                method_name,
                track,
            )
            return
        method = getattr(service, method_name, None)
        if method is None:
            logger.warning(
                "engine_command looper.%s: LooperService missing method", method_name
            )
            return
        try:
            method(track, *extra)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "engine_command looper.%s(track=%d, extra=%r) failed: %s",
                method_name,
                track,
                extra,
                exc,
            )

    def _looper_call_master(self, method_name: str, value: float) -> None:
        service = self._resolve_looper_service()
        if service is None:
            logger.info(
                "engine_command looper.%s(value=%.3f): LooperService not ready",
                method_name,
                value,
            )
            return
        method = getattr(service, method_name, None)
        if method is None:
            logger.warning(
                "engine_command looper.%s: LooperService missing method", method_name
            )
            return
        try:
            method(value)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "engine_command looper.%s(value=%.3f) failed: %s",
                method_name,
                value,
                exc,
            )

    def _recall_snapshot_hook(self, *, snapshot_id: int) -> None:
        """Schedule an async snapshot activation onto the FastAPI loop.

        Runs from the controller-host reader thread; cannot block.
        ``asyncio.run_coroutine_threadsafe`` returns a Future — we keep
        a reference long enough to log a failure, but do not block on
        it. If the activation fails the reader thread keeps running.
        """
        try:
            future = asyncio.run_coroutine_threadsafe(
                self._activate_snapshot(snapshot_id), self._loop
            )
        except RuntimeError as exc:
            # Loop has shut down (test teardown, bridge stopped) — drop.
            logger.warning(
                "engine_command snapshot.recall: cannot schedule (loop stopped): %s",
                exc,
            )
            return

        def _log_result(fut: Any) -> None:
            try:
                fut.result()
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "engine_command snapshot.recall(snapshot_id=%d) failed: %s",
                    snapshot_id,
                    exc,
                )

        future.add_done_callback(_log_result)

    async def _activate_snapshot(self, snapshot_id: int) -> Optional[dict[str, Any]]:
        # Imported lazily so this module can be unit-tested without
        # pulling in the whole FastAPI app graph.
        from app.database import get_session
        from app.services.snapshot import SnapshotService

        async with get_session() as session:
            service = SnapshotService(session)
            payload = await service.state_authority_activation.activate_snapshot(
                snapshot_id, triggered_by="engine_command"
            )
            return payload

    # ------------------------------------------------------------------
    # Error sink
    # ------------------------------------------------------------------

    @staticmethod
    def _on_handler_error(target: str, exc: Exception) -> None:
        logger.exception(
            "engine_command handler error for target=%r: %s", target, exc
        )


# ----------------------------------------------------------------------
# Singleton accessor
# ----------------------------------------------------------------------

_bridge: Optional[EngineCommandBridge] = None


def init_engine_command_bridge(loop: asyncio.AbstractEventLoop) -> EngineCommandBridge:
    """Create + register the singleton bridge. Idempotent: subsequent
    calls return the existing bridge unchanged. Wired from
    ``app/main.py`` lifespan startup."""
    global _bridge
    if _bridge is None:
        _bridge = EngineCommandBridge(loop)
    return _bridge


def get_engine_command_bridge() -> Optional[EngineCommandBridge]:
    return _bridge


def reset_engine_command_bridge_for_tests() -> None:
    """Drop the singleton so tests can rebuild it against a fresh loop."""
    global _bridge
    _bridge = None

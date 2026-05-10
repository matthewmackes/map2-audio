"""T2503 Set 4 — DAW verb dispatch seam.

Single in-process seam between the FastAPI ``/api/v1/daw/*`` routes and the
``engine_command`` dispatcher. Set 7 wires the real engine_command bridge
into ``set_dispatcher`` so verbs travel over IPC to the engine; until then,
the seam dispatches in-process so pytest can assert handler invocation
without a running engine.

Three states:

1. **No dispatcher set** (default; flag-OFF default builds): ``dispatch_daw_verb``
   logs the verb and returns. Routes still return 200 — they reported the
   verb to the operator but no side effect occurred. This keeps the API
   contract stable across builds and avoids exposing engine readiness as a
   request-time concern.
2. **In-process dispatcher set** (test pattern + flag-ON code-side): calls
   the dispatcher synchronously. Handlers + their hooks fire.
3. **IPC bridge set** (Set 7+): forwards to the engine_command channel.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any, List, Optional

from app.services.engine_command_dispatcher import (
    EngineCommandContext,
    EngineCommandDispatcher,
)

logger = logging.getLogger(__name__)

_DISPATCHER: Optional[EngineCommandDispatcher] = None
_DISPATCHER_LOCK = threading.Lock()
_MSG_COUNTER = 0


def set_dispatcher(dispatcher: Optional[EngineCommandDispatcher]) -> None:
    """Wire the in-process dispatcher (or clear it).

    Called by tests to inject a dispatcher with registered handlers, or by
    the app lifespan to bind the production dispatcher when the engine
    bridge is online.
    """
    global _DISPATCHER
    with _DISPATCHER_LOCK:
        _DISPATCHER = dispatcher


def get_dispatcher() -> Optional[EngineCommandDispatcher]:
    with _DISPATCHER_LOCK:
        return _DISPATCHER


def dispatch_daw_verb(
    verb: str,
    args: List[Any],
    *,
    value: Optional[float] = None,
    action: str = "set",
) -> None:
    """Dispatch a single ``daw.*`` verb.

    Builds a synthetic ``EngineCommandContext`` and routes it through the
    registered dispatcher. With no dispatcher set, logs the verb and returns
    (this is the default path until the engine bridge is wired in Set 7+).
    """
    global _MSG_COUNTER
    dispatcher: Optional[EngineCommandDispatcher]
    with _DISPATCHER_LOCK:
        dispatcher = _DISPATCHER

    if dispatcher is None:
        logger.info(
            "daw dispatch (no dispatcher wired): verb=%s args=%r value=%r",
            verb, args, value,
        )
        return

    with _DISPATCHER_LOCK:
        _MSG_COUNTER += 1
        msg_id = f"daw-rest-{_MSG_COUNTER:08d}"

    # Build the engine_command frame the dispatcher.dispatch() expects. The
    # `ctx.params` field is for pattern-match handlers; daw.* handlers are
    # exact-match so we leave it empty.
    message = {
        "type": "engine_command",
        "target": verb,
        "action": action,
        "value": value,
        "args": list(args),
        "controller_key": "daw-rest",
        "msg_id": msg_id,
    }
    dispatcher.dispatch(message)

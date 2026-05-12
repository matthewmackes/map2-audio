"""T2512-WS — LooperService → WebSocket broadcast bridge.

Wires LooperService's per-mutation broadcaster injection point to the
platform-wide ``ws_manager`` so every record / stop / clear / undo /
redo / level / muted / soloed / reverse / half_speed / locked /
master.level transition pushes a status frame to subscribed WS clients
on ``LOOPER_STATUS_TOPIC``.

Why a bridge module
===================
The service's broadcaster is sync (matches its callers — the route
handlers and the engine_command dispatcher both run on the FastAPI
asyncio loop, but the service methods themselves are sync so a sync
hook keeps them simple and test-friendly). The actual WS push has to
be awaited. The bridge captures a reference to the running event loop
at install time and schedules the broadcast via
``asyncio.run_coroutine_threadsafe`` — same pattern the
``engine_command_bridge`` uses for snapshot.recall.

RT-safety profile: never enters the JUCE audioCallback. Bridge runs
on the FastAPI asyncio loop; the audio thread is untouched.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from app.services.looper_service import (
    LOOPER_STATUS_TOPIC,
    LooperService,
    LooperStatus,
    get_looper_service,
)
from app.services.websocket_manager import ws_manager


logger = logging.getLogger(__name__)


# Frame envelope shape mirrors the recorder bridge so a client
# subscribing to both topics can demultiplex by ``type``.
_FRAME_TYPE = "looper_status"


async def broadcast_looper_status(status: LooperStatus) -> None:
    """Push a status frame onto ``LOOPER_STATUS_TOPIC``. Wrap the raw
    payload in a ``{type, payload}`` envelope so the receiving client
    can route the message to its handler without inspecting fields."""
    frame = {
        "type": _FRAME_TYPE,
        "payload": status.to_payload(),
    }
    try:
        await ws_manager.broadcast_json(frame, topic=LOOPER_STATUS_TOPIC)
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "looper_ws_bridge: broadcast failed: %s", exc
        )


def init_looper_ws_bridge(
    *,
    service: Optional[LooperService] = None,
    loop: Optional[asyncio.AbstractEventLoop] = None,
) -> LooperService:
    """Install a sync→async scheduling closure as the service's
    broadcaster.

    Captures the running event loop at install time so the sync
    broadcaster can schedule its async WS push back onto the FastAPI
    loop from any thread (route handler, engine_command dispatcher
    reader thread, etc.).

    Idempotent: re-running with the same broadcaster replaces it.
    Wired from ``app/main.py`` lifespan startup after the LooperService
    singleton + ws_manager are both up.
    """
    active = service if service is not None else get_looper_service()
    target_loop = loop if loop is not None else asyncio.get_event_loop()

    def _schedule(status: LooperStatus) -> None:
        """Sync entrypoint: schedule the async broadcast on the loop.
        We do not block on the future — broadcast failures are logged
        inside ``broadcast_looper_status`` and inside the
        ``_log_result`` callback below."""
        try:
            future = asyncio.run_coroutine_threadsafe(
                broadcast_looper_status(status), target_loop
            )
        except RuntimeError as exc:
            # Loop has shut down (test teardown, etc.) — drop.
            logger.debug(
                "looper_ws_bridge: cannot schedule (loop stopped): %s", exc
            )
            return

        def _log_result(fut) -> None:
            try:
                fut.result()
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "looper_ws_bridge: scheduled broadcast failed: %s", exc
                )

        future.add_done_callback(_log_result)

    active.replace_broadcaster(_schedule)
    logger.info(
        "LooperService WS broadcaster bound to topic %r", LOOPER_STATUS_TOPIC
    )
    return active

"""T2508-6 — RecorderService → WebSocket broadcast bridge.

Wires the `RecorderBroadcaster` injection point on
`RecorderService` to the platform-wide `ws_manager` so every
session-lifecycle transition (arm / roll / stop / disarm) streams
to subscribed WS clients on `RECORDER_SESSION_TOPIC`.

Transition-only path for now. The richer 15 fps cadence with real-
time fields (`elapsed_seconds`, `take_counts_by_chain`,
`disk_bytes_written`, `peak_levels_by_tap`) lands once T2507 ships
the engine-side counters; the route is the same once those numbers
are available, just driven by a periodic task instead of by
lifecycle transitions.

RT-safety profile: never enters the JUCE audioCallback. The bridge
runs on the FastAPI asyncio loop, pulled from `ws_manager` whose
broadcast path also lives there. The audio thread is untouched.
"""

from __future__ import annotations

import logging
from typing import Optional

from app.services.recorder_service import (
    RECORDER_SESSION_TOPIC,
    RecorderService,
    RecorderSessionStatus,
    get_recorder_service,
)
from app.services.websocket_manager import ws_manager


logger = logging.getLogger(__name__)


# Frame envelope shape matches the convention used by the rest of
# the platform's WS topics: a typed wrapper around a payload, so a
# client subscribing to multiple topics can demultiplex by `type`.
_FRAME_TYPE = "recorder_session"


async def broadcast_recorder_session_status(
    status: RecorderSessionStatus,
) -> None:
    """Push a session-status frame onto `RECORDER_SESSION_TOPIC`.

    Bound as the `broadcaster` injection on the singleton
    `RecorderService` via `init_recorder_ws_bridge()`. Wrap the raw
    payload in a `{type, payload}` envelope so the receiving client
    can route the message to its handler without inspecting fields
    (the recorder UI hook keys on the `type` field).
    """
    frame = {
        "type": _FRAME_TYPE,
        "payload": status.to_payload(),
    }
    try:
        await ws_manager.broadcast_json(frame, topic=RECORDER_SESSION_TOPIC)
    except Exception as exc:  # noqa: BLE001
        # Broadcast failures must not leak back into the service —
        # the RecorderService already wraps the broadcaster call in
        # its own try/except, but log here too for visibility when
        # the WS layer itself is the source of trouble.
        logger.exception(
            "recorder_ws_bridge: broadcast failed for session %s: %s",
            status.session_id,
            exc,
        )


def init_recorder_ws_bridge(
    *,
    service: Optional[RecorderService] = None,
) -> RecorderService:
    """Install `broadcast_recorder_session_status` as the
    broadcaster on the recorder service.

    Idempotent: re-running with the same broadcaster is a no-op.
    Returns the service instance for caller-side wiring. Wired from
    `app/main.py` lifespan startup.
    """
    active = service if service is not None else get_recorder_service()
    active.replace_broadcaster(broadcast_recorder_session_status)
    logger.info(
        "RecorderService WS broadcaster bound to topic %r",
        RECORDER_SESSION_TOPIC,
    )
    return active

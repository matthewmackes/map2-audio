"""MIDI Connections Visualization — WebSocket endpoint.

T2500-MV-B3.

Accepts a single connection at ``/ws/midi/visualization`` and:

  1. Sends the rolling-buffer replay as one ``{"type": "replay",
     "events": [...]}`` frame on connect, so a freshly-loaded page
     paints recent activity instead of an empty canvas.
  2. Subscribes to the buffer's live observer and forwards each
     subsequent event as ``{"type": "event", "event": {...}}``.
  3. Closes cleanly when the client disconnects, removing the
     observer to drop its share of the producer dispatch cost.

The endpoint is intentionally simple: no per-client topic filtering,
no auth (it inherits the platform-wide CORS + auth middleware that
wraps every WS path). All filtering decisions (event-kind toggle,
clock filter, scope chips) live on the frontend — see
``useMidiVisualizationGraph``.

Backpressure model: the frontend coalesces incoming events per
``requestAnimationFrame`` so per-message rendering cost is independent
of arrival rate. The server pushes everything; the producer-side
buffer's ``per_edge_max=600`` cap is the only ceiling.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.midi_visualization_buffer import (
    get_midi_visualization_buffer,
)


logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/midi/visualization")
async def midi_visualization_ws(websocket: WebSocket) -> None:
    """Stream the visualization buffer to the page."""
    await websocket.accept()

    buffer = get_midi_visualization_buffer()
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    def _on_event(event: dict[str, Any]) -> None:
        # Producer thread → async loop. ``call_soon_threadsafe`` schedules
        # the put_nowait inside the loop, which is what asyncio.Queue
        # requires for cross-thread producers.
        try:
            loop.call_soon_threadsafe(queue.put_nowait, event)
        except RuntimeError:
            # Loop has closed (shutdown race) — drop silently.
            pass

    unsubscribe = buffer.subscribe(_on_event)
    try:
        # 1. Send replay handshake.
        await websocket.send_json(
            {
                "type": "replay",
                # Serve the noisy events too — frontend can filter
                # client-side via the clock-filter toggle. Keeps the
                # buffer the single source of truth for "what was".
                "events": buffer.replay(include_noise=True),
            }
        )

        # 2. Live-stream loop. ``recv_task`` exists only to detect
        #    client disconnect (the page never sends frames upstream).
        recv_task = asyncio.create_task(websocket.receive_text())
        try:
            while True:
                send_task = asyncio.create_task(queue.get())
                done, _pending = await asyncio.wait(
                    {send_task, recv_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if recv_task in done:
                    # Client sent something or disconnected — either way
                    # we're done. recv_task.result() will raise on
                    # disconnect and propagate to the WebSocketDisconnect
                    # except clause below.
                    send_task.cancel()
                    recv_task.result()
                    # If receive_text() returned without raising, just
                    # drop the inbound payload (we don't accept commands)
                    # and rearm the receive task.
                    recv_task = asyncio.create_task(websocket.receive_text())
                    continue
                event = send_task.result()
                await websocket.send_json({"type": "event", "event": event})
        finally:
            recv_task.cancel()
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa: BLE001
        logger.warning("midi_visualization_ws: connection error: %s", exc)
    finally:
        unsubscribe()

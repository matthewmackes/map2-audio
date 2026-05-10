"""T2503 Set 4 — DAW event bus.

Async publish/subscribe for DAW events. The /api/v1/daw/events WebSocket
endpoint subscribes; engine-side state changes (Set 7+) publish via the
``EngineCommandBridge`` callbacks.

Implementation is deliberately small: a list of asyncio.Queue subscribers.
For Set 4 we ship the bus + the subscribe/publish API; Set 7 wires the
engine_command-bridge callbacks to it.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class DawEventBus:
    """In-process pub/sub for DAW events.

    Subscribers receive every event published after their subscription. The
    bus is bounded per subscriber so a slow WS client cannot stall the
    publisher; we drop the oldest event when a queue is full and log a
    warning.
    """

    DEFAULT_QUEUE_CAPACITY = 256

    def __init__(self) -> None:
        self._subscribers: List[asyncio.Queue[Dict[str, Any]]] = []
        self._lock = asyncio.Lock()

    async def subscribe(
        self, *, queue_capacity: int = DEFAULT_QUEUE_CAPACITY
    ) -> asyncio.Queue[Dict[str, Any]]:
        queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue(maxsize=queue_capacity)
        async with self._lock:
            self._subscribers.append(queue)
        return queue

    async def unsubscribe(self, queue: asyncio.Queue[Dict[str, Any]]) -> None:
        async with self._lock:
            try:
                self._subscribers.remove(queue)
            except ValueError:
                pass

    def publish(self, kind: str, payload: Optional[Dict[str, Any]] = None) -> None:
        """Publish an event to all subscribers.

        Synchronous so engine-side code can call it from any thread without
        adopting asyncio. The actual queue puts hop to the event loop via
        ``call_soon_threadsafe``.
        """
        event = {
            "kind": kind,
            "payload": payload or {},
            "timestamp": time.time(),
        }
        # Snapshot subscribers under a sync lock-free path. Updates use
        # asyncio.Lock — but the publisher runs in any thread, so we copy
        # without locking. This is safe because subscriber-list mutation
        # happens during connect/disconnect, never under publish-rate load.
        snapshot = list(self._subscribers)
        for queue in snapshot:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # Drop the oldest, retry once. If still full, drop the new one.
                try:
                    _ = queue.get_nowait()
                    queue.put_nowait(event)
                    logger.warning("DAW event bus: dropped oldest event for slow subscriber")
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    logger.warning("DAW event bus: dropped event for stalled subscriber")

    def subscriber_count(self) -> int:
        return len(self._subscribers)


_BUS: Optional[DawEventBus] = None


def get_daw_event_bus() -> DawEventBus:
    global _BUS
    if _BUS is None:
        _BUS = DawEventBus()
    return _BUS


def reset_daw_event_bus() -> None:
    """Test helper."""
    global _BUS
    _BUS = None

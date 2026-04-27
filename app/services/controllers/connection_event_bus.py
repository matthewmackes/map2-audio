"""Connection event bus + detection loop for the Hardware Store.

T2459-G2. Drives the ``WS /api/devices/ws`` channel by:

  1. Running ``detect_connections(registry)`` on a fixed cadence
     (default 1 s).
  2. Diffing the snapshot against the previous snapshot to emit
     ``device.connected`` and ``device.disconnected`` events.
  3. Forwarding ``pack.degraded`` and ``host.crash`` signals when the
     ProfileRegistry / ControllerHostService surface them.

The bus uses the same per-client ``asyncio.Queue`` pattern as the
MPX1 / IntelFX routes (``app/services/sysex_device_bridge.py:1655``)
so the GUI can drop a client without affecting peers.

Architecture: ``docs/architecture/HARDWARE_STORE_INTEGRATION.md`` §5.
Worklist: ``T2459-G2``.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from app.services.controllers.bench_state import get_bench_state_tracker
from app.services.controllers.connection_detector import (
    DetectionSnapshot,
    detect_connections,
)
from app.services.controllers.profile_registry import (
    DevicePack,
    ProfileRegistry,
    get_profile_registry,
)

logger = logging.getLogger(__name__)

DEFAULT_POLL_INTERVAL_S = 1.0
HEARTBEAT_INTERVAL_S = 10.0

# Event type vocabulary — mirrored on the GUI hook side.
EVT_CONNECTED = "device.connected"
EVT_DISCONNECTED = "device.disconnected"
EVT_PACK_DEGRADED = "pack.degraded"
EVT_HOST_CRASH = "host.crash"
EVT_HEARTBEAT = "devices.heartbeat"
EVT_SNAPSHOT = "devices.snapshot"   # initial state on connect


class ConnectionEventBus:
    """Process-singleton event bus + detection loop.

    Lifecycle:
      - ``await bus.start()`` from app startup (FastAPI lifespan).
      - The loop runs until ``await bus.stop()``.
      - WS handlers register a client via ``register_client()``,
        receive an initial snapshot, then drain queued events.
    """

    def __init__(
        self,
        *,
        poll_interval_s: float = DEFAULT_POLL_INTERVAL_S,
        registry_provider=get_profile_registry,
    ) -> None:
        self._poll_interval_s = poll_interval_s
        self._registry_provider = registry_provider
        self._task: asyncio.Task | None = None
        self._running = False
        self._subscribers: dict[str, asyncio.Queue] = {}
        self._lock = asyncio.Lock()
        self._last_keys: set[str] = set()
        self._last_degraded_packs: set[str] = set()
        self._last_host_crash_count: int = 0

    # ----- subscriber management -----------------------------------------

    async def register_client(self, client_id: str) -> asyncio.Queue:
        """Register a WS client; returns the per-client event queue.

        The caller should immediately consume from the queue and call
        ``unregister_client(client_id)`` when the WS closes.
        """
        async with self._lock:
            queue: asyncio.Queue = asyncio.Queue(maxsize=512)
            self._subscribers[client_id] = queue
            return queue

    async def unregister_client(self, client_id: str) -> None:
        async with self._lock:
            self._subscribers.pop(client_id, None)

    def subscriber_count(self) -> int:
        return len(self._subscribers)

    async def _publish(self, event_type: str, data: dict[str, Any]) -> None:
        """Push one event to every subscriber. Drop full queues
        (slow / stuck clients) without backpressuring detection.
        """
        message = {
            "type": event_type,
            "data": data,
            "timestamp": time.time(),
        }
        stale: list[str] = []
        async with self._lock:
            for client_id, queue in self._subscribers.items():
                try:
                    queue.put_nowait(message)
                except asyncio.QueueFull:
                    logger.warning("Dropping slow WS subscriber %s", client_id)
                    stale.append(client_id)
            for client_id in stale:
                self._subscribers.pop(client_id, None)

    # ----- initial snapshot for new clients ------------------------------

    def build_initial_snapshot(self) -> dict[str, Any]:
        """Return a single ``devices.snapshot`` payload synthesised from
        the bus's last poll. New WS clients receive this immediately so
        their UI doesn't have to wait a full poll cycle.
        """
        tracker = get_bench_state_tracker()
        return {
            "connected_keys": sorted(self._last_keys),
            "known_keys": list(tracker.known_keys()),
            "pinned_keys": list(tracker.pinned_keys()),
            "degraded_packs": sorted(self._last_degraded_packs),
        }

    # ----- detection loop ------------------------------------------------

    async def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._running = True
        self._task = asyncio.create_task(self._loop(), name="connection-event-bus")
        logger.info("ConnectionEventBus started (poll=%.1fs)", self._poll_interval_s)

    async def stop(self) -> None:
        self._running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, BaseException):
                pass
            self._task = None
        logger.info("ConnectionEventBus stopped")

    async def _loop(self) -> None:
        last_heartbeat_ts = 0.0
        while self._running:
            try:
                await self._tick()
                # Heartbeat every HEARTBEAT_INTERVAL_S regardless of changes
                now = time.time()
                if now - last_heartbeat_ts >= HEARTBEAT_INTERVAL_S:
                    await self._publish(EVT_HEARTBEAT, {
                        "subscriber_count": self.subscriber_count(),
                        "connected_keys": sorted(self._last_keys),
                    })
                    last_heartbeat_ts = now
            except asyncio.CancelledError:
                raise
            except Exception as exc:   # noqa: BLE001 — defensive
                logger.warning("Detection tick failed: %s", exc)
            await asyncio.sleep(self._poll_interval_s)

    async def _tick(self) -> None:
        """One detection pass + diff + emit."""
        registry = self._registry_provider()
        # Detection runs on a thread to avoid blocking the event loop on
        # subprocess calls (aconnect / pw-dump).
        loop = asyncio.get_running_loop()
        snapshot: DetectionSnapshot = await loop.run_in_executor(
            None, lambda: detect_connections(registry),
        )

        new_keys = {r.profile_key for r in snapshot.records}
        added = new_keys - self._last_keys
        removed = self._last_keys - new_keys

        # Update bench-state tracker so /known and /recently-disconnected
        # stay coherent with WS-driven clients that may not poll those
        # routes.
        tracker = get_bench_state_tracker()
        tracker.record_seen(list(new_keys))

        for key in sorted(added):
            rec = next(r for r in snapshot.records if r.profile_key == key)
            await self._publish(EVT_CONNECTED, rec.to_dict())

        for key in sorted(removed):
            await self._publish(EVT_DISCONNECTED, {
                "profile_key": key,
                "last_seen_at": tracker.last_seen(key),
            })

        # Pack-degraded signal: emit on transitions only.
        current_degraded = {
            pack.pack_id for pack in registry.packs() if pack.is_degraded
        }
        for pack_id in sorted(current_degraded - self._last_degraded_packs):
            pack: DevicePack | None = registry.get_pack(pack_id)
            await self._publish(EVT_PACK_DEGRADED, {
                "pack_id": pack_id,
                "degraded_files": (
                    [str(f) for f in pack.degraded_files] if pack else []
                ),
            })
        self._last_degraded_packs = current_degraded

        # Host-crash signal: rising-edge detection on the supervisor's
        # restart count. Failures here never abort the detection loop.
        try:
            from app.services.controller_host_service import (
                get_controller_host_service,
            )
            host = get_controller_host_service()
            payload = host.status_payload()
            restart_count = int(payload.get("restart_count") or 0)
            if restart_count > self._last_host_crash_count:
                await self._publish(EVT_HOST_CRASH, {
                    "restart_count": restart_count,
                    "previous_count": self._last_host_crash_count,
                    "status": payload.get("status"),
                    "last_error": payload.get("last_error"),
                })
            self._last_host_crash_count = restart_count
        except Exception as exc:   # noqa: BLE001
            logger.debug("Host-crash signal unavailable: %s", exc)

        self._last_keys = new_keys


# ---------------------------------------------------------------------------
# Singleton accessor
# ---------------------------------------------------------------------------

_singleton: ConnectionEventBus | None = None


def get_connection_event_bus() -> ConnectionEventBus:
    global _singleton
    if _singleton is None:
        _singleton = ConnectionEventBus()
    return _singleton


def reset_connection_event_bus_for_tests(
    *, poll_interval_s: float = 0.05,
    registry_provider=None,
) -> ConnectionEventBus:
    """Replace the singleton with a fresh bus for tests."""
    global _singleton
    _singleton = ConnectionEventBus(
        poll_interval_s=poll_interval_s,
        registry_provider=registry_provider or get_profile_registry,
    )
    return _singleton

from __future__ import annotations

import asyncio
import inspect
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

logger = logging.getLogger(__name__)


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


@dataclass
class MidiCommanderReconnectNotification:
    severity: str
    title: str
    subtitle: str
    emitted_at: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity,
            "title": self.title,
            "subtitle": self.subtitle,
            "emitted_at": self.emitted_at,
        }


class MidiCommanderSurfaceDaemon:
    def __init__(
        self,
        *,
        get_ports: Callable[[], Any],
        repush_surface_state: Callable[[], Any],
        emit: Callable[[str, dict[str, Any]], Any],
        poll_interval_s: float = 2.0,
        enabled: bool = True,
    ) -> None:
        self._get_ports = get_ports
        self._repush_surface_state = repush_surface_state
        self._emit = emit
        self._poll_interval_s = max(0.25, float(poll_interval_s))
        self._enabled = bool(enabled)
        self._task: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()
        self._initialized = False
        self._available = False
        self._status: dict[str, Any] = {
            "enabled": self._enabled,
            "state": "idle" if self._enabled else "disabled",
            "available": False,
            "poll_interval_s": self._poll_interval_s,
            "last_checked_at": None,
            "last_seen_at": None,
            "last_repush_at": None,
            "last_error": None,
            "reconnect_count": 0,
            "matched_port_count": 0,
            "notification": None,
        }

    def snapshot(self) -> dict[str, Any]:
        return dict(self._status)

    async def ensure_started(self) -> None:
        if not self._enabled:
            return
        if self._task is not None and not self._task.done():
            return
        loop = asyncio.get_running_loop()
        self._task = loop.create_task(self._run(), name="midi-commander-surface-daemon")

    async def stop(self) -> None:
        task = self._task
        self._task = None
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    async def _publish_state(
        self,
        *,
        state: str,
        available: bool,
        matched_port_count: int,
        notification: MidiCommanderReconnectNotification | None = None,
        error: str | None = None,
    ) -> None:
        checked_at = _utc_timestamp()
        self._status.update(
            {
                "state": state,
                "available": available,
                "matched_port_count": matched_port_count,
                "last_checked_at": checked_at,
                "last_error": error,
                "notification": notification.to_dict() if notification else self._status.get("notification"),
            }
        )
        if available:
            self._status["last_seen_at"] = checked_at
        await _maybe_await(self._emit("midi_commander_surface:daemon", self.snapshot()))

    async def _run(self) -> None:
        while True:
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("MIDI Commander daemon poll failed: %s", exc, exc_info=True)
                await self._publish_state(
                    state="error",
                    available=self._available,
                    matched_port_count=int(self._status.get("matched_port_count") or 0),
                    error=str(exc),
                )
            await asyncio.sleep(self._poll_interval_s)

    async def tick(self) -> None:
        async with self._lock:
            ports = await _maybe_await(self._get_ports())
            matched_ports = ports if isinstance(ports, list) else []
            available = bool(matched_ports)
            matched_port_count = len(matched_ports)
            now = _utc_timestamp()
            self._status["last_checked_at"] = now
            self._status["matched_port_count"] = matched_port_count
            if available:
                self._status["last_seen_at"] = now

            if not self._initialized:
                self._initialized = True
                self._available = available
                await self._publish_state(
                    state="connected" if available else "reconnecting",
                    available=available,
                    matched_port_count=matched_port_count,
                )
                return

            if available and not self._available:
                self._available = True
                self._status["reconnect_count"] = int(self._status.get("reconnect_count") or 0) + 1
                reconnect_note = MidiCommanderReconnectNotification(
                    severity="info",
                    title="MIDI Commander reconnected",
                    subtitle="Refreshing the current snapshot mapping contract and manual setup guidance.",
                    emitted_at=now,
                )
                await self._publish_state(
                    state="repushing",
                    available=True,
                    matched_port_count=matched_port_count,
                    notification=reconnect_note,
                )
                repush_result = await _maybe_await(self._repush_surface_state())
                self._status["last_repush_at"] = _utc_timestamp()
                done_note = MidiCommanderReconnectNotification(
                    severity="info",
                    title="MIDI Commander state refreshed",
                    subtitle=str(repush_result.get("status_label") or "Current snapshot mappings were refreshed."),
                    emitted_at=self._status["last_repush_at"],
                )
                await self._publish_state(
                    state="connected",
                    available=True,
                    matched_port_count=matched_port_count,
                    notification=done_note,
                )
                return

            if not available and self._available:
                self._available = False
                note = MidiCommanderReconnectNotification(
                    severity="warning",
                    title="MIDI Commander disconnected",
                    subtitle="Waiting for the controller to reconnect so MAP2 can refresh the current snapshot mapping posture.",
                    emitted_at=now,
                )
                await self._publish_state(
                    state="reconnecting",
                    available=False,
                    matched_port_count=matched_port_count,
                    notification=note,
                )
                return

            await self._publish_state(
                state="connected" if available else "reconnecting",
                available=available,
                matched_port_count=matched_port_count,
            )

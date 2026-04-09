from __future__ import annotations

import asyncio
import inspect
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional

logger = logging.getLogger(__name__)


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


@dataclass
class GroundControlReconnectNotification:
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


class GroundControlProDaemon:
    def __init__(
        self,
        *,
        get_ports: Callable[[], Any],
        get_live_snapshot: Callable[[], Any],
        repush_live_snapshot: Callable[[], Any],
        emit: Callable[[str, dict[str, Any]], Any],
        poll_interval_s: float = 2.0,
        enabled: bool = True,
    ) -> None:
        self._get_ports = get_ports
        self._get_live_snapshot = get_live_snapshot
        self._repush_live_snapshot = repush_live_snapshot
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
            "matched_input_count": 0,
            "matched_output_count": 0,
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
        self._task = loop.create_task(self._run(), name="ground-control-pro-daemon")

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
        matched_input_count: int,
        matched_output_count: int,
        notification: GroundControlReconnectNotification | None = None,
        error: str | None = None,
    ) -> None:
        checked_at = _utc_timestamp()
        self._status.update(
            {
                "state": state,
                "available": available,
                "matched_input_count": matched_input_count,
                "matched_output_count": matched_output_count,
                "last_checked_at": checked_at,
                "last_error": error,
                "notification": notification.to_dict() if notification else self._status.get("notification"),
            }
        )
        if available:
            self._status["last_seen_at"] = checked_at
        payload = self.snapshot()
        await _maybe_await(self._emit("ground-control-pro:daemon", payload))

    async def _run(self) -> None:
        while True:
            try:
                await self.tick()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("Ground Control Pro daemon poll failed: %s", exc, exc_info=True)
                await self._publish_state(
                    state="error",
                    available=self._available,
                    matched_input_count=int(self._status.get("matched_input_count") or 0),
                    matched_output_count=int(self._status.get("matched_output_count") or 0),
                    error=str(exc),
                )
            await asyncio.sleep(self._poll_interval_s)

    async def tick(self) -> None:
        async with self._lock:
            ports = await _maybe_await(self._get_ports())
            inputs = ports.get("ground_control_inputs") if isinstance(ports.get("ground_control_inputs"), list) else []
            outputs = ports.get("ground_control_outputs") if isinstance(ports.get("ground_control_outputs"), list) else []
            available = bool(outputs)
            input_count = len(inputs)
            output_count = len(outputs)
            now = _utc_timestamp()
            self._status["last_checked_at"] = now
            self._status["matched_input_count"] = input_count
            self._status["matched_output_count"] = output_count
            if available:
                self._status["last_seen_at"] = now

            if not self._initialized:
                self._initialized = True
                self._available = available
                await self._publish_state(
                    state="connected" if available else "reconnecting",
                    available=available,
                    matched_input_count=input_count,
                    matched_output_count=output_count,
                )
                return

            if available and not self._available:
                self._available = True
                self._status["reconnect_count"] = int(self._status.get("reconnect_count") or 0) + 1
                reconnect_note = GroundControlReconnectNotification(
                    severity="info",
                    title="Ground Control Pro reconnected",
                    subtitle="Re-pushing the live snapshot controller state.",
                    emitted_at=now,
                )
                await self._publish_state(
                    state="repushing",
                    available=True,
                    matched_input_count=input_count,
                    matched_output_count=output_count,
                    notification=reconnect_note,
                )
                repush_result = await _maybe_await(self._repush_live_snapshot())
                self._status["last_repush_at"] = _utc_timestamp()
                done_note = GroundControlReconnectNotification(
                    severity="info",
                    title="Ground Control Pro state restored",
                    subtitle=str(repush_result.get("status_label") or "Live snapshot assignments re-pushed."),
                    emitted_at=self._status["last_repush_at"],
                )
                await self._publish_state(
                    state="connected",
                    available=True,
                    matched_input_count=input_count,
                    matched_output_count=output_count,
                    notification=done_note,
                )
                return

            if not available and self._available:
                self._available = False
                note = GroundControlReconnectNotification(
                    severity="warning",
                    title="Ground Control Pro disconnected",
                    subtitle="Waiting for the controller to reconnect so MAP2 can re-push the live snapshot state.",
                    emitted_at=now,
                )
                await self._publish_state(
                    state="reconnecting",
                    available=False,
                    matched_input_count=input_count,
                    matched_output_count=output_count,
                    notification=note,
                )
                return

            await self._publish_state(
                state="connected" if available else "reconnecting",
                available=available,
                matched_input_count=input_count,
                matched_output_count=output_count,
            )

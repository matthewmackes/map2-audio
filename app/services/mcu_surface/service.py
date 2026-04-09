from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any, Optional

from app.services.event_publisher import RealtimeMessagePublisher, event_publisher

from .protocol import (
    build_device_query,
    build_meter_bridge_sysex,
    build_scribble_strip_sysex,
    is_mcu_port_name,
    parse_mcu_message,
)

logger = logging.getLogger(__name__)
_mcu_surface_service_lock = threading.Lock()
_mcu_surface_service: Optional["McuSurfaceService"] = None


class McuSurfaceService:
    def __init__(
        self,
        *,
        midi_hub: Any = None,
        publisher: Optional[RealtimeMessagePublisher] = None,
    ) -> None:
        self._publisher = publisher or event_publisher
        self._midi_hub = midi_hub
        self._midi_hub_loop: asyncio.AbstractEventLoop | None = None
        self._subscriber_id = f"mcu_surface:{id(self)}"
        self._last_identity: dict[str, Any] | None = None
        self._recent_events: list[dict[str, Any]] = []
        if self._midi_hub is None:
            self._subscribe_to_midi_hub()
        elif hasattr(self._midi_hub, "subscribe"):
            self._midi_hub.subscribe(self._subscriber_id, self._on_midi_hub_message)

    async def _emit(self, topic: str, payload: dict[str, Any]) -> None:
        await self._publisher.publish_message(
            {"type": topic, "data": payload},
            topics=(topic, "mcu_surface"),
        )

    @staticmethod
    def _matches_mcu_source(*, source_port: str, metadata: dict[str, Any] | None = None) -> bool:
        payload = dict(metadata or {})
        profile_id = str(payload.get("profile_id") or payload.get("device_profile_id") or "").strip().lower()
        if profile_id == "mackie_mcu_pro":
            return True
        if is_mcu_port_name(str(source_port or "")):
            return True
        return is_mcu_port_name(str(payload.get("port_name") or payload.get("source_port_name") or ""))

    def _subscribe_to_midi_hub(self) -> None:
        try:
            from app.services.midi_hub.hub import get_midi_hub

            self._midi_hub = get_midi_hub()
            self._midi_hub.subscribe(self._subscriber_id, self._on_midi_hub_message)
        except Exception:
            logger.debug("MCU surface service started without MIDI Hub subscription.", exc_info=True)

    def _on_midi_hub_message(self, message: Any) -> None:
        if self._midi_hub_loop is None:
            try:
                self._midi_hub_loop = asyncio.get_running_loop()
            except RuntimeError:
                return
        payload = bytes(getattr(message, "data", b"") or b"")
        if not payload:
            return
        try:
            asyncio.run_coroutine_threadsafe(
                self.handle_inbound_message(
                    payload,
                    source_port=str(getattr(message, "source_port", "") or ""),
                    metadata=dict(getattr(message, "metadata", {}) or {}),
                ),
                self._midi_hub_loop,
            )
        except Exception as exc:  # pragma: no cover - callback scheduling path
            logger.debug("MCU hub callback scheduling failed: %s", exc)

    async def handle_inbound_message(
        self,
        data: bytes,
        *,
        source_port: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not self._matches_mcu_source(source_port=source_port, metadata=metadata):
            return {"status": "skipped", "reason": "non_mcu_source"}
        event = parse_mcu_message(data)
        if event is None:
            return {"status": "skipped", "reason": "unsupported_message"}
        payload = {
            "status": "completed",
            "source_port": source_port,
            "event": event,
        }
        if event.get("event_type") == "identity_response":
            self._last_identity = dict(event)
        self._recent_events.append(payload)
        self._recent_events = self._recent_events[-64:]
        await self._emit("mcu_surface:event", payload)
        return payload

    def get_state_snapshot(self) -> dict[str, Any]:
        return {
            "identity": dict(self._last_identity) if isinstance(self._last_identity, dict) else None,
            "recent_events": [dict(item) for item in self._recent_events[-16:]],
        }

    def query_device(self, *, destination_port: str, source_port: str = "map2:mcu_surface", metadata: dict[str, Any] | None = None) -> bool:
        if self._midi_hub is None:
            return False
        return bool(
            self._midi_hub.send(
                source_port=source_port,
                destination_port=destination_port,
                data=build_device_query(),
                metadata=metadata or {"profile_id": "mackie_mcu_pro", "message_type": "device_query"},
            )
        )

    def push_scribble_strip(
        self,
        *,
        destination_port: str,
        labels: list[str],
        source_port: str = "map2:mcu_surface",
        metadata: dict[str, Any] | None = None,
    ) -> bool:
        if self._midi_hub is None:
            return False
        return bool(
            self._midi_hub.send(
                source_port=source_port,
                destination_port=destination_port,
                data=build_scribble_strip_sysex(labels),
                metadata=metadata or {"profile_id": "mackie_mcu_pro", "message_type": "scribble_strip"},
            )
        )

    def push_meter_bridge(
        self,
        *,
        destination_port: str,
        levels: list[int],
        source_port: str = "map2:mcu_surface",
        metadata: dict[str, Any] | None = None,
    ) -> bool:
        if self._midi_hub is None:
            return False
        return bool(
            self._midi_hub.send(
                source_port=source_port,
                destination_port=destination_port,
                data=build_meter_bridge_sysex(levels),
                metadata=metadata or {"profile_id": "mackie_mcu_pro", "message_type": "meter_bridge"},
            )
        )


def get_mcu_surface_service() -> McuSurfaceService:
    global _mcu_surface_service
    if _mcu_surface_service is None:
        with _mcu_surface_service_lock:
            if _mcu_surface_service is None:
                _mcu_surface_service = McuSurfaceService()
    return _mcu_surface_service

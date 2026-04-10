from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any, Optional

from app.services.event_publisher import RealtimeMessagePublisher, event_publisher

from .daemon import McuSurfaceDaemon
from .protocol import (
    build_device_query,
    build_fader_pitch_bend,
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
        self._daemon = McuSurfaceDaemon(
            get_ports=self.list_matching_ports,
            repush_surface_state=self._repush_surface_state,
            emit=self._emit,
        )
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
            "daemon_status": self._daemon.snapshot(),
        }

    async def ensure_daemon_started(self) -> None:
        await self._daemon.ensure_started()

    def list_matching_ports(self) -> list[dict[str, Any]]:
        midi_hub = self._midi_hub
        if midi_hub is None or not hasattr(midi_hub, "list_ports"):
            return []
        try:
            ports = midi_hub.list_ports()
        except Exception:
            return []

        matches: list[dict[str, Any]] = []
        for port in ports:
            name = str(getattr(port, "name", "") or "")
            if not is_mcu_port_name(name):
                continue
            matches.append(
                {
                    "port_id": str(getattr(port, "port_id", "") or ""),
                    "name": name,
                    "direction": str(getattr(port, "direction", "") or ""),
                }
            )
        return matches

    def list_output_ports(self) -> list[dict[str, Any]]:
        return [
            port
            for port in self.list_matching_ports()
            if str(port.get("direction") or "").strip().lower() in {"output", "duplex", "bidirectional", "inout", "input/output"}
        ]

    async def _repush_surface_state(self) -> dict[str, Any]:
        from app.database import get_session
        from app.services.transport_service import get_transport_service
        from .bridge import get_mcu_snapshot_editor_bridge_service

        destination_ports: list[str] = []
        projection: dict[str, Any] | None = None
        async with get_session(read_only=True) as session:
            bridge = get_mcu_snapshot_editor_bridge_service()
            for port in self.list_output_ports():
                destination_port = str(port.get("port_id") or port.get("name") or "").strip()
                if not destination_port:
                    continue
                self.query_device(destination_port=destination_port)
                projection = await bridge.build_projection(session, destination_port=destination_port)
                destination_ports.append(destination_port)

        transport = get_transport_service().get_state()
        await self._emit(
            "mcu_surface:transport_state",
            {
                "transport": transport,
                "destination_ports": destination_ports,
            },
        )
        selected_plugin = projection.get("selected_plugin") if isinstance(projection, dict) else {}
        plugin_name = str(selected_plugin.get("plugin_name") or "Focused plugin bank").strip()
        return {
            "status": "completed",
            "status_label": (
                f"{plugin_name} restored to 1 destination."
                if len(destination_ports) == 1
                else f"{plugin_name} restored to {len(destination_ports)} destinations."
            ),
            "destination_ports": destination_ports,
            "projection": projection,
            "transport": transport,
        }

    async def push_snapshot_activation(self, *, snapshot_id: int, snapshot_name: str) -> dict[str, Any]:
        if not self.list_output_ports():
            return {
                "status": "skipped",
                "reason": "mcu_output_unavailable",
                "snapshot_id": int(snapshot_id),
            }
        result = await self._repush_surface_state()
        payload = dict(result) if isinstance(result, dict) else {"status": "completed"}
        payload["snapshot_id"] = int(snapshot_id)
        payload["snapshot_name"] = str(snapshot_name or f"Snapshot {snapshot_id}")
        return payload

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

    def push_fader_positions(
        self,
        *,
        destination_port: str,
        normalized_values: list[float],
        source_port: str = "map2:mcu_surface",
        metadata: dict[str, Any] | None = None,
    ) -> bool:
        if self._midi_hub is None:
            return False
        sent = False
        for index, normalized in enumerate(normalized_values[:8]):
            absolute = max(0, min(0x3FFF, round(float(normalized) * 0x3FFF)))
            sent = bool(
                self._midi_hub.send(
                    source_port=source_port,
                    destination_port=destination_port,
                    data=build_fader_pitch_bend(index, absolute),
                    metadata=metadata or {"profile_id": "mackie_mcu_pro", "message_type": "motor_fader"},
                )
            ) or sent
        return sent

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

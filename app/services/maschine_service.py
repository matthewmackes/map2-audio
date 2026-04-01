"""Maschine MK1 daemon state, routing, and encoder-map persistence."""

from __future__ import annotations

import asyncio
import contextlib
import copy
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import WebSocket
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Snapshot
from app.services.chain_service import ChainService
from app.services.maschine_encoder_map_service import (
    default_maschine_encoder_map,
    normalize_maschine_encoder_map,
)

logger = logging.getLogger(__name__)

MASCHINE_STATUS_TOPIC = "maschine:status"
MASCHINE_HID_TRAFFIC_TOPIC = "maschine:hid_traffic"

_DEFAULT_LED_PADS = [
    {"index": index, "state": "off", "color": "empty", "selected": False}
    for index in range(16)
]
_DEFAULT_LCD_BITMAP = {
    "width": 128,
    "height": 64,
    "format": "xbm",
    "data": "",
}
def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


@dataclass
class MaschineDaemonState:
    connected: bool = False
    status: str = "disconnected"
    daemon_version: str | None = None
    websocket_connected: bool = False
    virtual_port_name: str = "MAP2:Maschine-MK1"
    hid_device: dict[str, Any] = field(default_factory=dict)
    firmware_info: dict[str, Any] = field(default_factory=dict)
    capabilities: dict[str, Any] = field(default_factory=dict)
    last_seen_at: str | None = None
    registered_at: str | None = None
    heartbeat_at: str | None = None
    last_event_type: str | None = None
    lcd: dict[str, Any] = field(
        default_factory=lambda: {
            "left": copy.deepcopy(_DEFAULT_LCD_BITMAP),
            "right": copy.deepcopy(_DEFAULT_LCD_BITMAP),
        }
    )
    led_state: dict[str, Any] = field(
        default_factory=lambda: {
            "pads": copy.deepcopy(_DEFAULT_LED_PADS),
            "updated_at": None,
        }
    )
    audio_grid: dict[str, Any] = field(
        default_factory=lambda: {
            "blocks": [],
            "selected_block_id": None,
            "page_index": 0,
            "updated_at": None,
            "snapshot_id": None,
            "snapshot_name": None,
        }
    )

    def to_dict(self) -> dict[str, Any]:
        return {
            "connected": self.connected,
            "status": self.status,
            "daemon_version": self.daemon_version,
            "websocket_connected": self.websocket_connected,
            "virtual_port_name": self.virtual_port_name,
            "hid_device": copy.deepcopy(self.hid_device),
            "firmware_info": copy.deepcopy(self.firmware_info),
            "capabilities": copy.deepcopy(self.capabilities),
            "last_seen_at": self.last_seen_at,
            "registered_at": self.registered_at,
            "heartbeat_at": self.heartbeat_at,
            "last_event_type": self.last_event_type,
            "lcd": copy.deepcopy(self.lcd),
            "led_state": copy.deepcopy(self.led_state),
            "audio_grid": copy.deepcopy(self.audio_grid),
        }


class MaschineService:
    def __init__(self) -> None:
        self._state = MaschineDaemonState()
        self._encoder_map_fallback = default_maschine_encoder_map()
        self._clients: set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self._hid_history: list[dict[str, Any]] = []

    async def register_daemon(
        self,
        *,
        daemon_version: str | None = None,
        virtual_port_name: str | None = None,
        hid_device: dict[str, Any] | None = None,
        firmware_info: dict[str, Any] | None = None,
        capabilities: dict[str, Any] | None = None,
        status: str | None = None,
    ) -> dict[str, Any]:
        async with self._lock:
            now = _utcnow_iso()
            self._state.connected = True
            self._state.status = str(status or "connected")
            self._state.daemon_version = daemon_version or self._state.daemon_version
            self._state.virtual_port_name = (
                str(virtual_port_name).strip() if virtual_port_name else self._state.virtual_port_name
            )
            self._state.hid_device = dict(hid_device or self._state.hid_device)
            self._state.firmware_info = dict(firmware_info or self._state.firmware_info)
            self._state.capabilities = dict(capabilities or self._state.capabilities)
            self._state.last_seen_at = now
            self._state.heartbeat_at = now
            if self._state.registered_at is None:
                self._state.registered_at = now
            payload = self._status_event_payload_locked(event="registered")
        await self._broadcast_status_payload(payload)
        return payload["data"]

    async def disconnect_daemon(self, *, reason: str = "disconnected") -> dict[str, Any]:
        async with self._lock:
            self._state.connected = False
            self._state.websocket_connected = False
            self._state.status = reason
            self._state.last_event_type = "disconnect"
            payload = self._status_event_payload_locked(event="disconnect")
        await self._broadcast_status_payload(payload)
        return payload["data"]

    async def set_websocket_connected(self, connected: bool) -> dict[str, Any]:
        async with self._lock:
            self._state.websocket_connected = bool(connected)
            if connected:
                self._state.connected = True
                self._state.status = "connected"
                self._state.last_seen_at = _utcnow_iso()
            self._state.last_event_type = "ws_connect" if connected else "ws_disconnect"
            payload = self._status_event_payload_locked(event=self._state.last_event_type)
        await self._broadcast_status_payload(payload)
        return payload["data"]

    def get_status(self) -> dict[str, Any]:
        return self._state.to_dict()

    async def get_encoder_map(self, session: AsyncSession) -> dict[str, Any]:
        snapshot = await self._get_active_snapshot(session)
        if snapshot is None:
            return copy.deepcopy(self._encoder_map_fallback)
        payload = dict(snapshot.controls_payload or {})
        stored_map = payload.get("maschine_encoder_map")
        if isinstance(stored_map, dict):
            return normalize_maschine_encoder_map(stored_map)
        return copy.deepcopy(self._encoder_map_fallback)

    async def update_encoder_map(self, session: AsyncSession, encoder_map: dict[str, Any]) -> dict[str, Any]:
        normalized = normalize_maschine_encoder_map(encoder_map)
        snapshot = await self._get_active_snapshot(session)
        self._encoder_map_fallback = copy.deepcopy(normalized)
        if snapshot is not None:
            controls_payload = dict(snapshot.controls_payload or {})
            controls_payload["maschine_encoder_map"] = copy.deepcopy(normalized)
            snapshot.controls_payload = controls_payload
            snapshot.updated_at = datetime.utcnow()
            await session.flush()
        async with self._lock:
            payload = self._status_event_payload_locked(
                event="encoder_map_updated",
                extra={"encoder_map": copy.deepcopy(normalized)},
            )
        await self._broadcast_status_payload(payload)
        return normalized

    async def get_audio_grid_projection(self, session: AsyncSession) -> dict[str, Any]:
        projection = await self._build_audio_grid_projection(session)
        async with self._lock:
            self._state.audio_grid = copy.deepcopy(projection)
            self._state.led_state = self._led_state_from_blocks(
                projection.get("blocks", []),
                selected_block_id=projection.get("selected_block_id"),
            )
            payload = self._status_event_payload_locked(event="audio_grid")
        await self._broadcast_status_payload(payload)
        return copy.deepcopy(self._state.audio_grid)

    async def select_audio_grid_block(self, session: AsyncSession, block_id: str) -> dict[str, Any]:
        projection = await self._build_audio_grid_projection(session)
        block_ids = {str(block.get("block_id")) for block in projection.get("blocks", [])}
        if block_id not in block_ids:
            raise ValueError("audio_grid_block_not_found")
        projection["selected_block_id"] = block_id
        projection["updated_at"] = _utcnow_iso()
        async with self._lock:
            self._state.audio_grid = copy.deepcopy(projection)
            self._state.led_state = self._led_state_from_blocks(
                projection.get("blocks", []),
                selected_block_id=projection.get("selected_block_id"),
            )
            payload = self._status_event_payload_locked(event="audio_grid_selected")
        await self._broadcast_status_payload(payload)
        return copy.deepcopy(self._state.audio_grid)

    async def toggle_audio_grid_block_bypass(self, session: AsyncSession, block_id: str) -> dict[str, Any]:
        projection = await self._build_audio_grid_projection(session)
        target = next((block for block in projection.get("blocks", []) if block.get("block_id") == block_id), None)
        if target is None:
            raise ValueError("audio_grid_block_not_found")
        runtime_chain_id = target.get("runtime_chain_id")
        if runtime_chain_id is None:
            raise ValueError("audio_grid_runtime_chain_missing")
        success = await ChainService(session).set_plugin_bypass(
            int(runtime_chain_id),
            str(target.get("plugin_uri") or ""),
            not bool(target.get("bypassed", False)),
            plugin_position=int(target.get("plugin_position") or 0),
        )
        if not success:
            raise ValueError("audio_grid_bypass_failed")
        return await self.get_audio_grid_projection(session)

    def get_led_state(self) -> dict[str, Any]:
        return copy.deepcopy(self._state.led_state)

    async def update_led_state(self, pads: list[dict[str, Any]]) -> dict[str, Any]:
        normalized_pads: list[dict[str, Any]] = []
        for index in range(16):
            incoming = pads[index] if index < len(pads) and isinstance(pads[index], dict) else {}
            normalized_pads.append(
                {
                    "index": index,
                    "state": str(incoming.get("state") or "off"),
                    "color": str(incoming.get("color") or "empty"),
                    "selected": bool(incoming.get("selected", False)),
                }
            )
        async with self._lock:
            self._state.led_state = {
                "pads": normalized_pads,
                "updated_at": _utcnow_iso(),
            }
            self._state.last_seen_at = self._state.led_state["updated_at"]
            self._state.last_event_type = "led_state"
            payload = self._status_event_payload_locked(event="led_state")
        await self._broadcast_status_payload(payload)
        return copy.deepcopy(self._state.led_state)

    async def update_lcd(
        self,
        *,
        side: Literal["left", "right"],
        bitmap: dict[str, Any],
        source: str = "api",
    ) -> dict[str, Any]:
        normalized = {
            "width": int(bitmap.get("width") or 128),
            "height": int(bitmap.get("height") or 64),
            "format": str(bitmap.get("format") or "xbm"),
            "data": str(bitmap.get("data") or ""),
            "source": source,
            "updated_at": _utcnow_iso(),
        }
        async with self._lock:
            self._state.lcd[side] = normalized
            self._state.last_seen_at = normalized["updated_at"]
            self._state.last_event_type = "lcd"
            payload = self._status_event_payload_locked(event="lcd")
        await self._broadcast_status_payload(payload)
        return copy.deepcopy(self._state.lcd)

    async def update_lcd_pair(
        self,
        *,
        left: dict[str, Any],
        right: dict[str, Any],
        source: str = "api",
    ) -> dict[str, Any]:
        now = _utcnow_iso()
        normalized = {
            "left": {
                "width": int(left.get("width") or 128),
                "height": int(left.get("height") or 64),
                "format": str(left.get("format") or "xbm"),
                "data": str(left.get("data") or ""),
                "source": source,
                "updated_at": now,
            },
            "right": {
                "width": int(right.get("width") or 128),
                "height": int(right.get("height") or 64),
                "format": str(right.get("format") or "xbm"),
                "data": str(right.get("data") or ""),
                "source": source,
                "updated_at": now,
            },
        }
        async with self._lock:
            self._state.lcd = normalized
            self._state.last_seen_at = now
            self._state.last_event_type = "lcd"
            payload = self._status_event_payload_locked(event="lcd")
        await self._broadcast_status_payload(payload)
        return copy.deepcopy(self._state.lcd)

    async def handle_ws_message(self, session: AsyncSession, message: dict[str, Any]) -> dict[str, Any] | None:
        message_type = str(message.get("type") or "").strip().lower()
        payload = dict(message.get("payload") or {})
        if message_type in {"heartbeat", "status"}:
            return await self.register_daemon(
                daemon_version=payload.get("daemon_version"),
                virtual_port_name=payload.get("virtual_port_name"),
                hid_device=payload.get("hid_device"),
                firmware_info=payload.get("firmware_info"),
                capabilities=payload.get("capabilities"),
                status=payload.get("status") or ("connected" if message_type == "heartbeat" else None),
            )
        if message_type == "hid_event":
            return await self.record_hid_event(payload)
        if message_type == "led_state":
            return await self.update_led_state(list(payload.get("pads") or []))
        if message_type == "lcd":
            side = str(payload.get("side") or "left").lower()
            if side not in {"left", "right"}:
                raise ValueError("lcd_side_invalid")
            return await self.update_lcd(side=side, bitmap=dict(payload.get("bitmap") or {}), source="ws")
        if message_type == "encoder_map":
            return await self.update_encoder_map(session, dict(payload.get("encoder_map") or {}))
        if message_type == "audio_grid_request":
            return await self.get_audio_grid_projection(session)
        if message_type == "audio_grid_select":
            return await self.select_audio_grid_block(session, str(payload.get("block_id") or ""))
        if message_type == "audio_grid_bypass":
            return await self.toggle_audio_grid_block_bypass(session, str(payload.get("block_id") or ""))
        if message_type == "request_state":
            return self.get_status()
        return None

    async def record_hid_event(self, payload: dict[str, Any]) -> dict[str, Any]:
        event = {
            "timestamp": str(payload.get("timestamp") or _utcnow_iso()),
            "direction": str(payload.get("direction") or "in"),
            "report_id": payload.get("report_id"),
            "decoded_type": str(payload.get("decoded_type") or payload.get("type") or "unknown"),
            "raw_hex": str(payload.get("raw_hex") or ""),
            "payload": copy.deepcopy(payload),
        }
        async with self._lock:
            self._hid_history.append(event)
            self._hid_history = self._hid_history[-200:]
            self._state.connected = True
            self._state.status = "connected"
            self._state.last_seen_at = event["timestamp"]
            self._state.heartbeat_at = event["timestamp"]
            self._state.last_event_type = "hid_event"
            status_payload = self._status_event_payload_locked(event="hid_event")
        await self._broadcast_hid_event(event)
        await self._broadcast_status_payload(status_payload)
        return event

    def get_hid_history(self, *, limit: int = 200) -> list[dict[str, Any]]:
        return copy.deepcopy(self._hid_history[-max(1, min(200, int(limit))):])

    async def connect_client(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._clients.add(websocket)

    async def disconnect_client(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(websocket)

    async def send_ws_message(self, websocket: WebSocket, message: dict[str, Any]) -> None:
        await websocket.send_json(message)

    def _status_event_payload_locked(self, *, event: str, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        data = self._state.to_dict()
        data["event"] = event
        if extra:
            data.update(copy.deepcopy(extra))
        return {
            "type": MASCHINE_STATUS_TOPIC,
            "topic": MASCHINE_STATUS_TOPIC,
            "data": data,
            "timestamp": _utcnow_iso(),
        }

    async def _broadcast_status_payload(self, payload: dict[str, Any]) -> None:
        await self._broadcast_topic(payload, topic=MASCHINE_STATUS_TOPIC)

    async def _broadcast_hid_event(self, event: dict[str, Any]) -> None:
        payload = {
            "type": MASCHINE_HID_TRAFFIC_TOPIC,
            "topic": MASCHINE_HID_TRAFFIC_TOPIC,
            "data": event,
            "timestamp": _utcnow_iso(),
        }
        await self._broadcast_topic(payload, topic=MASCHINE_HID_TRAFFIC_TOPIC)

    async def _broadcast_topic(self, payload: dict[str, Any], *, topic: str) -> None:
        try:
            from app.services.websocket_manager import ws_manager

            await ws_manager.broadcast_json(payload, topic=topic)
        except Exception as exc:
            logger.debug("Maschine websocket manager broadcast failed for %s: %s", topic, exc)

        async with self._lock:
            clients = list(self._clients)
        stale_clients: list[WebSocket] = []
        for websocket in clients:
            try:
                await websocket.send_json(payload)
            except Exception:
                stale_clients.append(websocket)
        if stale_clients:
            async with self._lock:
                for websocket in stale_clients:
                    self._clients.discard(websocket)

    async def _build_audio_grid_projection(self, session: AsyncSession) -> dict[str, Any]:
        snapshot = await self._get_live_snapshot_detail(session)
        blocks: list[dict[str, Any]] = []
        if isinstance(snapshot, dict):
            for path_index, path in enumerate(snapshot.get("paths", [])):
                if not isinstance(path, dict):
                    continue
                path_plugins = path.get("plugins", [])
                if not isinstance(path_plugins, list):
                    continue
                for plugin in path_plugins:
                    if not isinstance(plugin, dict):
                        continue
                    if len(blocks) >= 16:
                        break
                    parameters = plugin.get("parameters") or {}
                    parameter_items = list(parameters.items()) if isinstance(parameters, dict) else []
                    page_size = 7
                    page_count = max(1, (len(parameter_items) + page_size - 1) // page_size)
                    block_id = f"{path.get('id') or path_index}:{plugin.get('position', len(blocks))}"
                    blocks.append(
                        {
                            "block_id": block_id,
                            "pad_index": len(blocks),
                            "path_id": path.get("id"),
                            "path_label": path.get("label"),
                            "chain_name": path.get("name") or path.get("label") or f"Path {path_index + 1}",
                            "snapshot_chain_id": path.get("snapshot_chain_id"),
                            "runtime_chain_id": path.get("runtime_chain_id"),
                            "plugin_uri": plugin.get("uri"),
                            "plugin_name": plugin.get("name") or plugin.get("uri"),
                            "plugin_position": plugin.get("position", len(blocks)),
                            "bypassed": bool(plugin.get("bypass", plugin.get("bypassed", False))),
                            "page_index": 0,
                            "page_count": page_count,
                            "top_parameters": [
                                {"param_id": str(param_id), "value": value}
                                for param_id, value in parameter_items[:page_size]
                            ],
                        }
                    )
                if len(blocks) >= 16:
                    break
        selected_block_id = None
        async with self._lock:
            previous_selected = self._state.audio_grid.get("selected_block_id")
        block_ids = {str(block.get("block_id")) for block in blocks}
        if previous_selected in block_ids:
            selected_block_id = previous_selected
        elif blocks:
            selected_block_id = str(blocks[0].get("block_id"))
        return {
            "blocks": blocks,
            "selected_block_id": selected_block_id,
            "page_index": 0,
            "updated_at": _utcnow_iso(),
            "snapshot_id": snapshot.get("id") if isinstance(snapshot, dict) else None,
            "snapshot_name": snapshot.get("name") if isinstance(snapshot, dict) else None,
        }

    async def _get_live_snapshot_detail(self, session: AsyncSession) -> dict[str, Any] | None:
        from app.services.snapshot_service import SnapshotService

        return await SnapshotService(session).get_live_snapshot()

    @staticmethod
    def _led_state_from_blocks(blocks: list[dict[str, Any]], *, selected_block_id: str | None) -> dict[str, Any]:
        pads: list[dict[str, Any]] = []
        for index in range(16):
            block = blocks[index] if index < len(blocks) else None
            if not isinstance(block, dict):
                pads.append({"index": index, "state": "off", "color": "empty", "selected": False})
                continue
            bypassed = bool(block.get("bypassed", False))
            is_selected = str(block.get("block_id")) == str(selected_block_id)
            pads.append(
                {
                    "index": index,
                    "state": "pulsing" if is_selected else ("dim" if bypassed else "bright"),
                    "color": "selected" if is_selected else ("bypassed" if bypassed else "active"),
                    "selected": is_selected,
                    "block_id": block.get("block_id"),
                    "plugin_name": block.get("plugin_name"),
                }
            )
        return {
            "pads": pads,
            "updated_at": _utcnow_iso(),
        }

    async def _get_active_snapshot(self, session: AsyncSession) -> Snapshot | None:
        result = await session.execute(
            select(Snapshot)
            .where(Snapshot.is_active.is_(True))
            .order_by(Snapshot.updated_at.desc(), Snapshot.id.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()


_maschine_service_singleton: MaschineService | None = None


def get_maschine_service() -> MaschineService:
    global _maschine_service_singleton
    if _maschine_service_singleton is None:
        _maschine_service_singleton = MaschineService()
    return _maschine_service_singleton


def reset_maschine_service() -> None:
    global _maschine_service_singleton
    service = _maschine_service_singleton
    _maschine_service_singleton = None
    if service is None:
        return
    for websocket in list(service._clients):
        with contextlib.suppress(Exception):
            asyncio.create_task(websocket.close())

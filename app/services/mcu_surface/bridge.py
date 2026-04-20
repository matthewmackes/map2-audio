from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Mapping, Sequence
from typing import Any, Optional

from app.services.event_publisher import RealtimeMessagePublisher, event_publisher
from app.services.snapshot_controller_display_preview_service import build_controller_display_plugin_catalog
from app.utils.singleton import Singleton

from .param_grouping import build_parameter_banks

logger = logging.getLogger(__name__)

MCU_CHANNEL_SELECT_BASE_NOTE = 0x18
MCU_CHANNEL_SELECT_COUNT = 8
MCU_BANK_LEFT_NOTE = 0x2E
MCU_BANK_RIGHT_NOTE = 0x2F
MCU_REWIND_NOTE = 0x5B
MCU_FAST_FORWARD_NOTE = 0x5C
MCU_STOP_NOTE = 0x5D
MCU_PLAY_NOTE = 0x5E
MCU_RECORD_NOTE = 0x5F
_TRANSPORT_ACTIONS_BY_NOTE = {
    MCU_REWIND_NOTE: "rew",
    MCU_FAST_FORWARD_NOTE: "ff",
    MCU_STOP_NOTE: "stop",
    MCU_PLAY_NOTE: "play",
    MCU_RECORD_NOTE: "record",
}

def _safe_int(value: Any, fallback: int | None = None) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _safe_float(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _normalize_parameter_value(value: Any, *, minimum: float, maximum: float, default: float) -> float:
    numeric = _safe_float(value, default)
    if maximum <= minimum:
        return default
    return min(max(numeric, minimum), maximum)


def _normalize_parameter_position(value: float, *, minimum: float, maximum: float) -> float:
    if maximum <= minimum:
        return 0.0
    return min(max((value - minimum) / (maximum - minimum), 0.0), 1.0)


def _truncate_scribble_label(name: str, symbol: str) -> str:
    base = (symbol or name or "Param").strip()
    compact = base.replace("band", "b").replace("Band", "B").replace("_", " ").strip()
    if len(compact) <= 7:
        return compact
    tokens = compact.split()
    if len(tokens) >= 2:
        joined = "".join(token[:3] for token in tokens[:2])
        if joined:
            return joined[:7]
    return compact[:7]


class McuSnapshotEditorBridgeService(Singleton):
    def __init__(
        self,
        *,
        maschine_service: Any = None,
        mcu_surface_service: Any = None,
        publisher: Optional[RealtimeMessagePublisher] = None,
        plugin_catalog_provider: Callable[[], dict[str, dict[str, Any]]] = build_controller_display_plugin_catalog,
        snapshot_provider: Callable[[Any], Awaitable[dict[str, Any] | None]] | None = None,
        transport_dispatcher: Callable[[str], Awaitable[dict[str, Any]]] | None = None,
        parameter_applier: Callable[[dict[str, Any], dict[str, Any]], Awaitable[dict[str, Any]]] | None = None,
    ) -> None:
        self._maschine_service = maschine_service
        self._mcu_surface_service = mcu_surface_service
        self._publisher = publisher or event_publisher
        self._plugin_catalog_provider = plugin_catalog_provider
        self._snapshot_provider = snapshot_provider or self._default_snapshot_provider
        self._transport_dispatcher = transport_dispatcher or self._default_transport_dispatcher
        self._parameter_applier = parameter_applier or self._default_parameter_applier
        self._bank_index_by_block: dict[str, int] = {}
        self._focused_strip_index_by_block: dict[str, int] = {}
        self._last_projection: dict[str, Any] | None = None

    async def _default_snapshot_provider(self, session: Any) -> dict[str, Any] | None:
        from app.services.snapshot import SnapshotService

        return await SnapshotService(session).get_control_plane_snapshot()

    async def _default_transport_dispatcher(self, action: str) -> dict[str, Any]:
        from app.services.transport_service import get_transport_service

        return await get_transport_service().dispatch(action)

    async def _default_parameter_applier(self, context: dict[str, Any], update: dict[str, Any]) -> dict[str, Any]:
        from app.services.juce_engine_service import get_audio_engine
        from app.services.snapshot import SnapshotService

        session = context["session"]
        snapshot_id = _safe_int(context.get("snapshot_id"))
        chain_id = _safe_int(context.get("snapshot_chain_id"))
        plugin_position = _safe_int(context.get("plugin_position"))
        symbol = str(update.get("symbol") or "").strip()
        value = _safe_float(update.get("value"), 0.0)
        if snapshot_id is None or chain_id is None or plugin_position is None or not symbol:
            return {"applied": False, "reason": "missing_snapshot_context"}

        service = SnapshotService(session)
        detail = await service.update_plugin_parameter_by_position(
            snapshot_id,
            chain_id,
            plugin_position,
            symbol,
            value,
        )
        applied_engine = False
        try:
            engine = get_audio_engine()
            if engine is not None:
                applied_engine = bool(
                    await engine.set_parameter(
                        str(context.get("plugin_uri") or ""),
                        symbol,
                        value,
                        plugin_position=plugin_position,
                    )
                )
        except Exception as exc:
            logger.debug(
                "MCU jog-wheel engine apply failed for %s[%s] %s: %s",
                context.get("plugin_uri"),
                plugin_position,
                symbol,
                exc,
            )
        return {
            "applied": detail is not None,
            "engine_applied": applied_engine,
            "reason": "applied" if detail is not None else "snapshot_plugin_not_found",
            "snapshot": detail,
        }

    async def _emit(self, topic: str, payload: dict[str, Any]) -> None:
        await self._publisher.publish_message(
            {"type": topic, "data": payload},
            topics=(topic, "mcu_surface"),
        )

    async def build_projection(
        self,
        session: Any,
        *,
        destination_port: str | None = None,
    ) -> dict[str, Any]:
        maschine_service = self._resolve_maschine_service()
        audio_grid = await maschine_service.get_audio_grid_projection(session)
        snapshot = await self._snapshot_provider(session)
        projection = self._compose_projection(audio_grid=audio_grid, snapshot=snapshot)
        self._last_projection = projection
        if destination_port:
            labels = list(projection.get("scribble_labels") or [])
            strips = projection.get("channel_strips") if isinstance(projection.get("channel_strips"), Sequence) else []
            normalized_values = [
                _safe_float(strip.get("normalized_value"), 0.0)
                for strip in strips
                if isinstance(strip, Mapping)
            ]
            meter_levels = [
                max(0, min(15, round(_safe_float(strip.get("normalized_value"), 0.0) * 15)))
                for strip in strips
                if isinstance(strip, Mapping)
            ]
            surface = self._resolve_mcu_surface_service()
            if labels:
                surface.push_scribble_strip(
                    destination_port=destination_port,
                    labels=labels,
                )
            if normalized_values:
                surface.push_fader_positions(
                    destination_port=destination_port,
                    normalized_values=normalized_values,
                )
            if meter_levels:
                surface.push_meter_bridge(
                    destination_port=destination_port,
                    levels=meter_levels,
                )
        await self._emit("mcu_surface:projection", projection)
        return projection

    async def handle_surface_event(
        self,
        session: Any,
        event: Mapping[str, Any],
        *,
        destination_port: str | None = None,
    ) -> dict[str, Any]:
        event_type = str(event.get("event_type") or "").strip().lower()
        projection = self._last_projection or await self.build_projection(session)
        if event_type in {"vpot", "fader"}:
            return self._register_focus_hint(projection=projection, event=event)
        if event_type == "jog_wheel":
            return await self._apply_jog_wheel(session, projection=projection, event=event, destination_port=destination_port)
        if event_type != "button" or not bool(event.get("pressed", False)):
            return {"status": "skipped", "reason": "unsupported_event"}
        note = _safe_int(event.get("note"), -1)
        if note in _TRANSPORT_ACTIONS_BY_NOTE:
            return await self._dispatch_transport(note=note)
        if note == MCU_BANK_LEFT_NOTE:
            return await self._shift_bank(session, projection=projection, direction=-1, destination_port=destination_port)
        if note == MCU_BANK_RIGHT_NOTE:
            return await self._shift_bank(session, projection=projection, direction=1, destination_port=destination_port)
        if MCU_CHANNEL_SELECT_BASE_NOTE <= note < MCU_CHANNEL_SELECT_BASE_NOTE + MCU_CHANNEL_SELECT_COUNT:
            strip_index = note - MCU_CHANNEL_SELECT_BASE_NOTE
            return await self._select_block(session, projection=projection, strip_index=strip_index, destination_port=destination_port)
        return {"status": "skipped", "reason": "unmapped_button"}

    def _compose_projection(
        self,
        *,
        audio_grid: Mapping[str, Any],
        snapshot: Mapping[str, Any] | None,
    ) -> dict[str, Any]:
        blocks = [dict(block) for block in audio_grid.get("blocks", []) if isinstance(block, Mapping)]
        selected_block_id = str(audio_grid.get("selected_block_id") or "").strip()
        selected_block = next(
            (block for block in blocks if str(block.get("block_id") or "").strip() == selected_block_id),
            blocks[0] if blocks else None,
        )
        selected_plugin = self._resolve_selected_snapshot_plugin(snapshot=snapshot, selected_block=selected_block)
        bank_payload = self._build_bank_payload(selected_block=selected_block, snapshot_plugin=selected_plugin)
        return {
            "audio_grid": {
                "snapshot_id": _safe_int(snapshot.get("id")) if isinstance(snapshot, Mapping) else None,
                "selected_block_id": selected_block_id or None,
                "blocks": [
                    {
                        "block_id": str(block.get("block_id") or ""),
                        "plugin_name": str(block.get("plugin_name") or ""),
                        "plugin_uri": str(block.get("plugin_uri") or ""),
                        "plugin_position": _safe_int(block.get("plugin_position")),
                        "snapshot_chain_id": _safe_int(block.get("snapshot_chain_id")),
                        "pad_index": _safe_int(block.get("pad_index")),
                    }
                    for block in blocks
                ],
            },
            **bank_payload,
        }

    def _build_bank_payload(
        self,
        *,
        selected_block: Mapping[str, Any] | None,
        snapshot_plugin: Mapping[str, Any] | None,
    ) -> dict[str, Any]:
        if not isinstance(selected_block, Mapping) or not isinstance(snapshot_plugin, Mapping):
            return {
                "selected_plugin": None,
                "bank_index": 0,
                "bank_count": 0,
                "banks": [],
                "active_bank": None,
                "scribble_labels": [],
                "channel_strips": [],
            }

        plugin_uri = str(snapshot_plugin.get("uri") or "").strip()
        catalog = self._plugin_catalog_provider()
        catalog_entry = dict(catalog.get(plugin_uri) or {})
        parameter_definitions = catalog_entry.get("parameters") if isinstance(catalog_entry.get("parameters"), Sequence) else []
        parameter_values = snapshot_plugin.get("parameters") if isinstance(snapshot_plugin.get("parameters"), Mapping) else {}
        merged_parameters: list[dict[str, Any]] = []

        for index, parameter in enumerate(parameter_definitions):
            if not isinstance(parameter, Mapping):
                continue
            symbol = str(parameter.get("symbol") or "").strip()
            current_value = parameter_values.get(symbol, parameter_values.get(str(parameter.get("index", index))))
            merged_parameters.append(
                {
                    "index": _safe_int(parameter.get("index"), index) or index,
                    "name": str(parameter.get("name") or symbol or f"Param {index + 1}"),
                    "symbol": symbol,
                    "min": _safe_float(parameter.get("min"), 0.0),
                    "max": _safe_float(parameter.get("max"), 1.0),
                    "default": _safe_float(parameter.get("default"), 0.0),
                    "is_toggled": bool(parameter.get("is_toggled", False)),
                    "is_log": bool(parameter.get("is_log", False)),
                    "unit": str(parameter.get("unit") or "").strip(),
                    "current": current_value,
                }
            )

        if not merged_parameters and isinstance(parameter_values, Mapping):
            for index, symbol in enumerate(sorted(str(key) for key in parameter_values.keys())):
                merged_parameters.append(
                    {
                        "index": index,
                        "name": symbol.replace("_", " ").title(),
                        "symbol": symbol,
                        "min": 0.0,
                        "max": 1.0,
                        "default": 0.0,
                        "is_toggled": False,
                        "is_log": False,
                        "unit": "",
                        "current": parameter_values.get(symbol),
                    }
                )

        banks = build_parameter_banks(
            merged_parameters,
            plugin_name=str(snapshot_plugin.get("name") or selected_block.get("plugin_name") or ""),
            plugin_category=str(snapshot_plugin.get("category") or ""),
            plugin_class=str(snapshot_plugin.get("class_label") or ""),
        )

        block_id = str(selected_block.get("block_id") or "")
        bank_count = len(banks)
        selected_bank_index = min(max(self._bank_index_by_block.get(block_id, 0), 0), max(bank_count - 1, 0))
        self._bank_index_by_block[block_id] = selected_bank_index
        active_bank = banks[selected_bank_index] if banks else None
        focused_strip_index = self._focused_strip_index_by_block.get(block_id, 0)
        channel_strips = self._build_channel_strips(active_bank, focused_strip_index=focused_strip_index)
        focused_strip_index = next(
            (
                strip["slot_index"]
                for strip in channel_strips
                if strip.get("assigned") and strip.get("focused")
            ),
            0,
        )
        self._focused_strip_index_by_block[block_id] = focused_strip_index
        return {
            "selected_plugin": {
                "block_id": block_id,
                "plugin_name": str(selected_block.get("plugin_name") or snapshot_plugin.get("name") or ""),
                "plugin_uri": plugin_uri,
                "plugin_position": _safe_int(selected_block.get("plugin_position")),
                "snapshot_chain_id": _safe_int(selected_block.get("snapshot_chain_id")),
                "path_id": selected_block.get("path_id"),
                "bank_group": active_bank.get("group_id") if isinstance(active_bank, Mapping) else None,
            },
            "bank_index": selected_bank_index,
            "bank_count": bank_count,
            "banks": banks,
            "active_bank": active_bank,
            "focused_strip_index": focused_strip_index,
            "scribble_labels": [strip["scribble_label"] for strip in channel_strips],
            "channel_strips": channel_strips,
        }

    def _build_channel_strips(self, active_bank: Mapping[str, Any] | None, *, focused_strip_index: int) -> list[dict[str, Any]]:
        parameters = active_bank.get("parameters") if isinstance(active_bank, Mapping) else []
        strips: list[dict[str, Any]] = []
        for slot_index in range(MCU_CHANNEL_SELECT_COUNT):
            parameter = parameters[slot_index] if isinstance(parameters, Sequence) and slot_index < len(parameters) else None
            if not isinstance(parameter, Mapping):
                strips.append(
                    {
                        "slot_index": slot_index,
                        "assigned": False,
                        "focused": False,
                        "scribble_label": "",
                    }
                )
                continue

            minimum = _safe_float(parameter.get("min"), 0.0)
            maximum = _safe_float(parameter.get("max"), 1.0)
            default = _safe_float(parameter.get("default"), minimum)
            current_value = _normalize_parameter_value(
                parameter.get("current"),
                minimum=minimum,
                maximum=maximum,
                default=default,
            )
            strips.append(
                {
                    "slot_index": slot_index,
                    "assigned": True,
                    "parameter_index": _safe_int(parameter.get("index"), slot_index),
                    "name": str(parameter.get("name") or ""),
                    "symbol": str(parameter.get("symbol") or ""),
                    "group_id": str(parameter.get("group_id") or ""),
                    "value": current_value,
                    "normalized_value": _normalize_parameter_position(current_value, minimum=minimum, maximum=maximum),
                    "min": minimum,
                    "max": maximum,
                    "default": default,
                    "is_toggled": bool(parameter.get("is_toggled", False)),
                    "focused": slot_index == focused_strip_index,
                    "scribble_label": _truncate_scribble_label(
                        str(parameter.get("name") or ""),
                        str(parameter.get("symbol") or ""),
                    ),
                }
            )
        return strips

    def _resolve_selected_snapshot_plugin(
        self,
        *,
        snapshot: Mapping[str, Any] | None,
        selected_block: Mapping[str, Any] | None,
    ) -> Mapping[str, Any] | None:
        if not isinstance(snapshot, Mapping) or not isinstance(selected_block, Mapping):
            return None
        path_id = str(selected_block.get("path_id") or "").strip()
        plugin_position = _safe_int(selected_block.get("plugin_position"))
        plugin_uri = str(selected_block.get("plugin_uri") or "").strip()
        for path_index, path in enumerate(snapshot.get("paths", [])):
            if not isinstance(path, Mapping):
                continue
            candidate_path_id = str(path.get("id") or path_index).strip()
            if path_id and candidate_path_id != path_id:
                continue
            for plugin_index, plugin in enumerate(path.get("plugins", [])):
                if not isinstance(plugin, Mapping):
                    continue
                candidate_position = _safe_int(plugin.get("position"), plugin_index)
                candidate_uri = str(plugin.get("uri") or "").strip()
                if plugin_position is not None and candidate_position == plugin_position:
                    return plugin
                if plugin_uri and candidate_uri == plugin_uri:
                    return plugin
        return None

    async def _shift_bank(
        self,
        session: Any,
        *,
        projection: Mapping[str, Any],
        direction: int,
        destination_port: str | None,
    ) -> dict[str, Any]:
        selected_plugin = projection.get("selected_plugin") if isinstance(projection.get("selected_plugin"), Mapping) else None
        block_id = str(selected_plugin.get("block_id") or "") if isinstance(selected_plugin, Mapping) else ""
        bank_count = _safe_int(projection.get("bank_count"), 0) or 0
        if not block_id or bank_count <= 0:
            return {"status": "skipped", "reason": "no_bank_context"}
        current_index = self._bank_index_by_block.get(block_id, _safe_int(projection.get("bank_index"), 0) or 0)
        self._bank_index_by_block[block_id] = min(max(current_index + direction, 0), bank_count - 1)
        self._focused_strip_index_by_block.setdefault(block_id, 0)
        next_projection = await self.build_projection(session, destination_port=destination_port)
        return {
            "status": "completed",
            "action": "bank_navigation",
            "direction": direction,
            "projection": next_projection,
        }

    async def _select_block(
        self,
        session: Any,
        *,
        projection: Mapping[str, Any],
        strip_index: int,
        destination_port: str | None,
    ) -> dict[str, Any]:
        audio_grid = projection.get("audio_grid") if isinstance(projection.get("audio_grid"), Mapping) else {}
        blocks = audio_grid.get("blocks") if isinstance(audio_grid.get("blocks"), Sequence) else []
        if strip_index < 0 or strip_index >= len(blocks):
            return {"status": "skipped", "reason": "strip_without_block"}
        target_block = blocks[strip_index]
        if not isinstance(target_block, Mapping):
            return {"status": "skipped", "reason": "strip_without_block"}
        block_id = str(target_block.get("block_id") or "").strip()
        if not block_id:
            return {"status": "skipped", "reason": "strip_without_block"}
        await self._resolve_maschine_service().select_audio_grid_block(session, block_id)
        self._focused_strip_index_by_block.setdefault(block_id, 0)
        next_projection = await self.build_projection(session, destination_port=destination_port)
        return {
            "status": "completed",
            "action": "select_block",
            "selected_block_id": block_id,
            "projection": next_projection,
        }

    def _register_focus_hint(self, *, projection: Mapping[str, Any], event: Mapping[str, Any]) -> dict[str, Any]:
        selected_plugin = projection.get("selected_plugin") if isinstance(projection.get("selected_plugin"), Mapping) else None
        block_id = str(selected_plugin.get("block_id") or "") if isinstance(selected_plugin, Mapping) else ""
        if not block_id:
            return {"status": "skipped", "reason": "no_selected_plugin"}
        strip_index = _safe_int(event.get("vpot_index"), _safe_int(event.get("fader_index"), -1))
        if strip_index is None or strip_index < 0 or strip_index >= MCU_CHANNEL_SELECT_COUNT:
            return {"status": "skipped", "reason": "invalid_focus_hint"}
        self._focused_strip_index_by_block[block_id] = strip_index
        return {
            "status": "completed",
            "action": "focus_parameter",
            "focused_strip_index": strip_index,
        }

    async def _dispatch_transport(self, *, note: int) -> dict[str, Any]:
        action = _TRANSPORT_ACTIONS_BY_NOTE[note]
        transport = await self._transport_dispatcher(action)
        return {
            "status": "completed",
            "action": "transport",
            "transport_action": action,
            "transport": transport,
        }

    async def _apply_jog_wheel(
        self,
        session: Any,
        *,
        projection: Mapping[str, Any],
        event: Mapping[str, Any],
        destination_port: str | None,
    ) -> dict[str, Any]:
        selected_plugin = projection.get("selected_plugin") if isinstance(projection.get("selected_plugin"), Mapping) else None
        channel_strips = projection.get("channel_strips") if isinstance(projection.get("channel_strips"), Sequence) else []
        block_id = str(selected_plugin.get("block_id") or "") if isinstance(selected_plugin, Mapping) else ""
        if not block_id or not isinstance(selected_plugin, Mapping):
            return {"status": "skipped", "reason": "no_selected_plugin"}
        focused_strip_index = self._focused_strip_index_by_block.get(
            block_id,
            _safe_int(projection.get("focused_strip_index"), 0) or 0,
        )
        if focused_strip_index < 0 or focused_strip_index >= len(channel_strips):
            return {"status": "skipped", "reason": "focused_strip_missing"}
        strip = channel_strips[focused_strip_index]
        if not isinstance(strip, Mapping) or not bool(strip.get("assigned")):
            return {"status": "skipped", "reason": "focused_strip_missing"}
        delta = _safe_int(event.get("delta"), 0) or 0
        if delta == 0:
            return {"status": "skipped", "reason": "zero_delta"}
        minimum = _safe_float(strip.get("min"), 0.0)
        maximum = _safe_float(strip.get("max"), 1.0)
        current_value = _safe_float(strip.get("value"), _safe_float(strip.get("default"), minimum))
        span = max(maximum - minimum, 0.0)
        step = 1.0 if bool(strip.get("is_toggled")) else (0.01 if span <= 1.0 else max(span / 200.0, 0.001))
        next_value = min(max(current_value + (delta * step), minimum), maximum)
        apply_result = await self._parameter_applier(
            {
                "session": session,
                "snapshot_id": projection.get("audio_grid", {}).get("snapshot_id") if isinstance(projection.get("audio_grid"), Mapping) else None,
                "plugin_uri": selected_plugin.get("plugin_uri"),
                "plugin_position": selected_plugin.get("plugin_position"),
                "snapshot_chain_id": selected_plugin.get("snapshot_chain_id"),
                "selected_block_id": block_id,
            },
            {
                "symbol": strip.get("symbol"),
                "parameter_index": strip.get("parameter_index"),
                "value": next_value,
            },
        )
        next_projection = await self.build_projection(session, destination_port=destination_port)
        return {
            "status": "completed" if apply_result.get("applied") else "skipped",
            "action": "jog_wheel",
            "parameter_symbol": strip.get("symbol"),
            "delta": delta,
            "value": next_value,
            "apply_result": apply_result,
            "projection": next_projection,
        }

    def _resolve_maschine_service(self) -> Any:
        if self._maschine_service is not None:
            return self._maschine_service
        from app.services.maschine_service import get_maschine_service

        self._maschine_service = get_maschine_service()
        return self._maschine_service

    def _resolve_mcu_surface_service(self) -> Any:
        if self._mcu_surface_service is not None:
            return self._mcu_surface_service
        from .service import get_mcu_surface_service

        self._mcu_surface_service = get_mcu_surface_service()
        return self._mcu_surface_service


def get_mcu_snapshot_editor_bridge_service() -> McuSnapshotEditorBridgeService:
    return McuSnapshotEditorBridgeService.get_instance()


def reset_mcu_snapshot_editor_bridge_service() -> None:
    McuSnapshotEditorBridgeService.reset_instance()

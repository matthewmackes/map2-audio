"""Controller-display push helpers for activation and live parameter refresh."""

from __future__ import annotations

import copy
import logging
import re
from collections.abc import Mapping
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.midi_hub.device_registry import get_midi_device_registry
from app.services.midi_hub.hub import get_midi_hub
from app.services.midi_service import midi_service
from app.services.snapshot_controller_display_preview_service import (
    build_snapshot_controller_display_preview,
)
from app.services.snapshot_footswitch_label_service import (
    build_morningstar_preset_short_name_sysex,
    get_controller_display_capabilities,
    sanitize_controller_display_text,
)
from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService


logger = logging.getLogger(__name__)


def _coerce_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize_plugin_uri(value: Any) -> str:
    return str(value or "").strip()


def _normalize_display_text(value: Any) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    text = re.sub(r"[^\x20-\x7E]", "", text)
    return text.strip()


def _build_slot_status_value(slot: Mapping[str, Any]) -> str:
    slot_state = str(slot.get("slot_state") or "").strip().lower()
    if slot_state == "bypassed":
        return "Off"
    if slot_state == "unresolved":
        return "--"

    key_parameter = slot.get("key_parameter")
    if isinstance(key_parameter, Mapping):
        formatted_value = str(key_parameter.get("formatted_value") or "").strip()
        if formatted_value:
            return formatted_value
    return "On"


def _resolve_device_output_port_id(device: Mapping[str, Any]) -> str | None:
    hub = get_midi_hub()
    for port_id in device.get("port_ids", []):
        port = hub.resolve_port(str(port_id))
        if port is not None and port.can_send():
            return str(port_id)
    return None


def _build_compact_morningstar_label(slot: Mapping[str, Any], *, max_length: int) -> str:
    slot_number = _coerce_int(slot.get("slot_number")) or 0
    base_label = sanitize_controller_display_text(
        slot.get("display_label")
        or slot.get("plugin_name")
        or f"S{slot_number}",
        max_length=max_length,
    )
    status_value = sanitize_controller_display_text(
        _build_slot_status_value(slot),
        max_length=max_length,
    )

    if not status_value:
        return base_label
    if not base_label:
        return status_value

    compact_label = base_label.replace(" ", "")
    initials = "".join(token[:1] for token in base_label.split() if token)

    candidates = [
        f"{base_label} {status_value}",
        f"{base_label}{status_value}",
        f"{compact_label} {status_value}",
        f"{compact_label}{status_value}",
        f"{initials} {status_value}",
        f"{initials}{status_value}",
    ]

    label_variants = [base_label, compact_label, initials]
    for variant in label_variants:
        if not variant:
            continue
        reserve = max_length - len(status_value) - 1
        if reserve > 0:
            candidates.append(f"{variant[:reserve]} {status_value}")
        reserve = max_length - len(status_value)
        if reserve > 0:
            candidates.append(f"{variant[:reserve]}{status_value}")

    for candidate in candidates:
        normalized = _normalize_display_text(candidate)
        if normalized and len(normalized) <= max_length:
            return normalized

    return sanitize_controller_display_text(base_label or status_value, max_length=max_length)


def _build_device_packets(
    *,
    registry: Any,
    profile_id: str,
    preview_payload: Mapping[str, Any],
) -> list[tuple[int, bytes]]:
    capabilities = get_controller_display_capabilities(registry, profile_id)
    if capabilities.get("transport") != "morningstar_short_name":
        return []
    if not capabilities.get("supports_per_switch_labels"):
        return []

    preset_count = int(capabilities.get("switch_count") or 0)
    model_id = int(capabilities.get("model_id") or -1)
    label_length = int(capabilities.get("label_max_length") or 0)
    if preset_count <= 0 or model_id < 0 or label_length <= 0:
        return []

    packets: list[tuple[int, bytes]] = []
    for slot in preview_payload.get("slots", []):
        if not isinstance(slot, Mapping):
            continue
        slot_index = _coerce_int(slot.get("slot_index"))
        if slot_index is None or slot_index < 0 or slot_index >= preset_count:
            continue

        label = _build_compact_morningstar_label(slot, max_length=label_length)
        if not label:
            continue

        packets.append(
            (
                slot_index,
                build_morningstar_preset_short_name_sysex(
                    model_id=model_id,
                    label_length=label_length,
                    preset_index=slot_index,
                    label=label,
                ),
            )
        )
    return packets


async def push_snapshot_controller_display_preview(
    *,
    snapshot_id: int,
    snapshot_name: str,
    preview_payload: Mapping[str, Any] | None,
) -> dict[str, Any]:
    preview = dict(preview_payload or {})
    if not isinstance(preview.get("slots"), list) or not preview.get("slots"):
        return {
            "snapshot_id": snapshot_id,
            "slots_pushed": 0,
            "device_count": 0,
            "devices": [],
        }

    registry = get_midi_device_registry()
    inventory = registry.snapshot()
    devices = [
        dict(device)
        for device in inventory.get("devices", [])
        if isinstance(device, dict) and device.get("connected")
    ]
    if not devices:
        try:
            refreshed = await registry.refresh()
        except Exception as exc:
            logger.debug(
                "Controller-display device refresh skipped for snapshot %s: %s",
                snapshot_id,
                exc,
            )
        else:
            devices = [
                dict(device)
                for device in refreshed.get("devices", [])
                if isinstance(device, dict) and device.get("connected")
            ]

    hub = get_midi_hub()
    pushed_devices: list[str] = []
    slots_pushed = 0

    for device in devices:
        profile_id = str(device.get("profile_id") or "").strip()
        packets = _build_device_packets(
            registry=registry,
            profile_id=profile_id,
            preview_payload=preview,
        )
        if not packets:
            continue

        destination_port = _resolve_device_output_port_id(device)
        if not destination_port:
            continue

        sent_count = 0
        for slot_index, packet in packets:
            if hub.send(
                source_port=f"snapshot:{snapshot_id}:controller-display",
                destination_port=destination_port,
                data=packet,
                metadata={
                    "event": "snapshot_controller_display",
                    "snapshot_id": snapshot_id,
                    "snapshot_name": snapshot_name,
                    "profile_id": profile_id,
                    "slot_index": slot_index,
                },
            ):
                sent_count += 1

        if sent_count:
            pushed_devices.append(str(device.get("device_id") or profile_id))
            slots_pushed += sent_count

    return {
        "snapshot_id": snapshot_id,
        "slots_pushed": slots_pushed,
        "device_count": len(pushed_devices),
        "devices": pushed_devices,
    }


def _plugin_matches(
    plugin: Mapping[str, Any],
    *,
    plugin_uri: str,
    plugin_position: int | None,
) -> bool:
    if _normalize_plugin_uri(plugin.get("uri")) != plugin_uri:
        return False
    if plugin_position is None:
        return True
    return _coerce_int(plugin.get("position")) == plugin_position


def _apply_parameter_update_to_live_payload(
    live_snapshot_payload: dict[str, Any],
    *,
    plugin_uri: str,
    parameter_symbol: str,
    value: float,
    plugin_position: int | None,
) -> int:
    matched_plugins: list[dict[str, Any]] = []
    for chain in live_snapshot_payload.get("chains", []):
        if not isinstance(chain, dict):
            continue
        for plugin in chain.get("plugins", []):
            if not isinstance(plugin, dict):
                continue
            if _plugin_matches(
                plugin,
                plugin_uri=plugin_uri,
                plugin_position=plugin_position,
            ):
                matched_plugins.append(plugin)

    if not matched_plugins:
        return 0

    targets = matched_plugins if plugin_position is not None else matched_plugins[:1]
    for plugin in targets:
        parameters = dict(plugin.get("parameters") or {})
        parameters[str(parameter_symbol)] = float(value)
        plugin["parameters"] = parameters
    return len(targets)


def _slot_matches_parameter_update(slot: Mapping[str, Any], update: Mapping[str, Any]) -> bool:
    if _normalize_plugin_uri(slot.get("target_plugin_uri")) != _normalize_plugin_uri(update.get("plugin_uri")):
        return False

    slot_position = _coerce_int(slot.get("target_plugin_position"))
    update_position = _coerce_int(update.get("plugin_position"))
    if slot_position is not None and update_position is not None and slot_position != update_position:
        return False

    key_parameter = slot.get("key_parameter")
    if not isinstance(key_parameter, Mapping):
        return False
    return str(key_parameter.get("parameter_symbol") or "").strip() == str(update.get("parameter_symbol") or "").strip()


async def refresh_live_snapshot_controller_display_for_parameter_updates(
    *,
    session: AsyncSession,
    parameter_updates: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    normalized_updates = []
    for update in parameter_updates or []:
        if not isinstance(update, dict):
            continue
        plugin_uri = _normalize_plugin_uri(update.get("plugin_uri"))
        parameter_symbol = str(update.get("parameter_symbol") or "").strip()
        if not plugin_uri or not parameter_symbol:
            continue
        try:
            value = float(update.get("value"))
        except (TypeError, ValueError):
            continue
        normalized_updates.append(
            {
                "plugin_uri": plugin_uri,
                "parameter_symbol": parameter_symbol,
                "value": value,
                "plugin_position": _coerce_int(update.get("plugin_position")),
            }
        )

    if not normalized_updates:
        return {"updated": False, "reason": "no_parameter_updates"}

    runtime_state_service = SnapshotRuntimeStateService(session)
    live_state = await runtime_state_service.get_live_state()
    live_snapshot_payload = live_state.get("live_snapshot_payload")
    if (
        str(live_state.get("state") or "").lower() != "live"
        or not isinstance(live_snapshot_payload, dict)
    ):
        return {"updated": False, "reason": "no_live_snapshot"}

    snapshot_id = _coerce_int(live_state.get("snapshot_id") or live_snapshot_payload.get("id"))
    if snapshot_id is None:
        return {"updated": False, "reason": "missing_live_snapshot_id"}

    next_payload = copy.deepcopy(live_snapshot_payload)
    matched_plugins = 0
    for update in normalized_updates:
        matched_plugins += _apply_parameter_update_to_live_payload(
            next_payload,
            plugin_uri=update["plugin_uri"],
            parameter_symbol=update["parameter_symbol"],
            value=update["value"],
            plugin_position=update.get("plugin_position"),
        )

    if matched_plugins <= 0:
        return {
            "updated": False,
            "reason": "target_plugin_not_in_live_snapshot",
            "snapshot_id": snapshot_id,
        }

    commands = await midi_service.get_all_commands(session)
    preview_payload = build_snapshot_controller_display_preview(next_payload, commands)
    matched_slots = [
        dict(slot)
        for slot in preview_payload.get("slots", [])
        if isinstance(slot, Mapping)
        and any(_slot_matches_parameter_update(slot, update) for update in normalized_updates)
    ]
    if not matched_slots:
        return {
            "updated": False,
            "reason": "parameter_not_used_by_controller_display",
            "snapshot_id": snapshot_id,
            "matched_plugins": matched_plugins,
        }

    next_payload["controller_display_preview"] = preview_payload
    snapshot_revision = (
        str(live_state.get("snapshot_revision") or "").strip()
        or str(next_payload.get("snapshot_revision") or "").strip()
        or None
    )
    await runtime_state_service.sync_live_snapshot_payload(
        snapshot_id=snapshot_id,
        live_snapshot_payload=next_payload,
        snapshot_revision=snapshot_revision,
    )
    await runtime_state_service.record_retained_runtime_edit(
        snapshot_id=snapshot_id,
        snapshot_revision=snapshot_revision,
        mutation_kind="refresh_controller_display_preview",
        triggered_by="snapshot_controller_display_push_service.refresh_live_snapshot_controller_display_for_parameter_updates",
        metadata={
            "matched_plugins": matched_plugins,
            "matched_slots": len(matched_slots),
            "updated_parameters": [
                {
                    "plugin_uri": update["plugin_uri"],
                    "plugin_position": update.get("plugin_position"),
                    "parameter_symbol": update["parameter_symbol"],
                    "value": update["value"],
                }
                for update in normalized_updates
            ],
        },
    )
    push_result = await push_snapshot_controller_display_preview(
        snapshot_id=snapshot_id,
        snapshot_name=str(next_payload.get("name") or ""),
        preview_payload=preview_payload,
    )
    return {
        "updated": True,
        "snapshot_id": snapshot_id,
        "matched_plugins": matched_plugins,
        "matched_slots": len(matched_slots),
        "push_result": push_result,
    }

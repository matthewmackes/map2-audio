"""Per-snapshot footswitch label helpers and controller push service."""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime
from typing import Any, Optional

from app.lcd_models.lcd_event import EventSeverity, EventType, LCDEvent
from app.services.lcd_manager import get_lcd_manager
from app.services.midi_hub.device_registry import get_midi_device_registry
from app.services.midi_hub.hub import get_midi_hub


logger = logging.getLogger(__name__)

SNAPSHOT_FOOTSWITCH_LABEL_ACTION = "footswitch_label_map"
SNAPSHOT_FOOTSWITCH_LABEL_MAX_LENGTH = 8
SNAPSHOT_FOOTSWITCH_LABEL_COUNT = 8

def sanitize_footswitch_label(value: Any) -> str:
    """Normalize a hardware-friendly footswitch label."""

    text = re.sub(r"\s+", " ", str(value or "").strip())
    text = re.sub(r"[^\x20-\x7E]", "", text)
    return text[:SNAPSHOT_FOOTSWITCH_LABEL_MAX_LENGTH].strip()


def normalize_footswitch_label_map(
    value: Any,
    *,
    max_switches: int = SNAPSHOT_FOOTSWITCH_LABEL_COUNT,
) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}

    normalized: dict[str, str] = {}
    for raw_key, raw_label in value.items():
        try:
            switch_number = int(str(raw_key).strip())
        except (TypeError, ValueError):
            continue
        if switch_number < 1 or switch_number > max_switches:
            continue
        label = sanitize_footswitch_label(raw_label)
        if label:
            normalized[str(switch_number)] = label
    return normalized


def extract_snapshot_footswitch_label_map(entries: list[dict[str, Any]] | None) -> dict[str, str]:
    for entry in entries or []:
        if not isinstance(entry, dict):
            continue
        if entry.get("action") != SNAPSHOT_FOOTSWITCH_LABEL_ACTION:
            continue
        return normalize_footswitch_label_map(
            entry.get("label_map") or entry.get("labels"),
        )
    return {}


def replace_snapshot_footswitch_label_map(
    entries: list[dict[str, Any]] | None,
    label_map: dict[str, str],
) -> list[dict[str, Any]]:
    preserved_entries = [
        dict(entry)
        for entry in entries or []
        if isinstance(entry, dict) and entry.get("action") != SNAPSHOT_FOOTSWITCH_LABEL_ACTION
    ]

    normalized_label_map = normalize_footswitch_label_map(label_map)
    if not normalized_label_map:
        return preserved_entries

    preserved_entries.append(
        {
            "action": SNAPSHOT_FOOTSWITCH_LABEL_ACTION,
            "label_map": normalized_label_map,
            "max_length": SNAPSHOT_FOOTSWITCH_LABEL_MAX_LENGTH,
        }
    )
    return preserved_entries


def build_morningstar_preset_short_name_sysex(
    *,
    model_id: int,
    label_length: int,
    preset_index: int,
    label: str,
) -> bytes:
    payload_length = int(label_length)
    payload_text = sanitize_footswitch_label(label).ljust(payload_length)[:payload_length]
    payload_bytes = [ord(character) & 0x7F for character in payload_text]
    message_body = [
        0x00,
        0x39,
        int(model_id) & 0x7F,
        0x7F,
        0x0B,
        0x01,
        0x00,
        int(preset_index) & 0x7F,
        *payload_bytes,
    ]
    checksum = sum(message_body) % 128
    return bytes([0xF0, *message_body, checksum, 0xF7])


def _resolve_device_output_port_id(device: dict[str, Any]) -> Optional[str]:
    hub = get_midi_hub()
    for port_id in device.get("port_ids", []):
        port = hub.resolve_port(str(port_id))
        if port is not None and port.can_send():
            return str(port_id)
    return None


def _get_display_capabilities(
    registry: Any,
    profile_id: str,
) -> dict[str, Any]:
    if hasattr(registry, "get_display_capabilities"):
        capabilities = registry.get_display_capabilities(profile_id)
        if isinstance(capabilities, dict):
            return dict(capabilities)

    profile = registry.get_profile(profile_id) if hasattr(registry, "get_profile") else None
    if not isinstance(profile, dict):
        return {}
    metadata = profile.get("metadata")
    if not isinstance(metadata, dict):
        return {}
    capabilities = metadata.get("display_capabilities")
    if isinstance(capabilities, dict):
        return dict(capabilities)
    return {}


def _build_device_packets(
    *,
    registry: Any,
    profile_id: str,
    label_map: dict[str, str],
) -> list[bytes]:
    capabilities = _get_display_capabilities(registry, profile_id)
    if capabilities.get("transport") != "morningstar_short_name":
        return []
    if not capabilities.get("supports_per_switch_labels"):
        return []

    preset_count = int(capabilities.get("switch_count") or 0)
    model_id = int(capabilities.get("model_id") or -1)
    label_length = int(capabilities.get("label_max_length") or 0)
    if preset_count <= 0 or model_id < 0 or label_length <= 0:
        return []

    packets: list[bytes] = []
    for preset_index in range(preset_count):
        label = label_map.get(str(preset_index + 1))
        if not label:
            continue
        packets.append(
            build_morningstar_preset_short_name_sysex(
                model_id=model_id,
                label_length=label_length,
                preset_index=preset_index,
                label=label,
            )
        )
    return packets


def _build_lcd_event(snapshot_name: str, label_map: dict[str, str]) -> LCDEvent:
    preview = " | ".join(
        f"S{switch_id} {label}"
        for switch_id, label in sorted(
            label_map.items(),
            key=lambda item: int(item[0]),
        )[:4]
    )
    return LCDEvent(
        event_id=str(uuid.uuid4()),
        timestamp=datetime.now(),
        source_node="MAP2",
        event_type=EventType.SYSTEM,
        severity=EventSeverity.INFO,
        title=f"{snapshot_name or 'Snapshot'} labels",
        message=preview or "No footswitch labels configured",
        icon="FS",
        context={
            "snapshot_name": snapshot_name,
            "label_map": dict(label_map),
            "event_type": "snapshot_footswitch_labels",
        },
    )


async def push_snapshot_footswitch_labels(
    *,
    snapshot_id: int,
    snapshot_name: str,
    midi_map_entries: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    label_map = extract_snapshot_footswitch_label_map(midi_map_entries)
    if not label_map:
        return {
            "snapshot_id": snapshot_id,
            "labels_pushed": 0,
            "device_count": 0,
            "devices": [],
            "lcd_updated": False,
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
            logger.debug("Footswitch label device refresh skipped for snapshot %s: %s", snapshot_id, exc)
        else:
            devices = [
                dict(device)
                for device in refreshed.get("devices", [])
                if isinstance(device, dict) and device.get("connected")
            ]

    hub = get_midi_hub()
    pushed_devices: list[str] = []
    labels_pushed = 0

    for device in devices:
        profile_id = str(device.get("profile_id") or "").strip()
        packets = _build_device_packets(
            registry=registry,
            profile_id=profile_id,
            label_map=label_map,
        )
        if not packets:
            continue

        destination_port = _resolve_device_output_port_id(device)
        if not destination_port:
            continue

        sent_count = 0
        for packet in packets:
            if hub.send(
                source_port=f"snapshot:{snapshot_id}:footswitch-labels",
                destination_port=destination_port,
                data=packet,
                metadata={
                    "event": "snapshot_footswitch_labels",
                    "snapshot_id": snapshot_id,
                    "snapshot_name": snapshot_name,
                    "profile_id": profile_id,
                },
            ):
                sent_count += 1

        if sent_count:
            pushed_devices.append(str(device.get("device_id") or profile_id))
            labels_pushed += sent_count

    lcd_updated = False
    lcd_manager = get_lcd_manager()
    if lcd_manager is not None:
        try:
            await lcd_manager.publish_event(_build_lcd_event(snapshot_name, label_map))
            lcd_updated = True
        except Exception as exc:
            logger.debug("Footswitch label LCD push failed for snapshot %s: %s", snapshot_id, exc)

    return {
        "snapshot_id": snapshot_id,
        "labels_pushed": labels_pushed,
        "device_count": len(pushed_devices),
        "devices": pushed_devices,
        "lcd_updated": lcd_updated,
    }

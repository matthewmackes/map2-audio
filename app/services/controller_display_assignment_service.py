"""Shared controller-display assignment resolution for plugin-toggle commands."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from app.services.snapshot_footswitch_label_service import extract_snapshot_footswitch_label_map


@dataclass(frozen=True)
class ControllerDisplayAssignment:
    """Deterministic display-slot ownership for a plugin-toggle MIDI command."""

    slot_index: int
    slot_number: int
    command_id: int | None
    command_name: str
    command_type: str
    channel: int
    trigger_value: int | None
    target_plugin_uri: str
    target_plugin_position: int | None
    label_override: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _coerce_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _extract_slot_index(action_data: Any) -> int | None:
    if not isinstance(action_data, dict):
        return None
    for key in ("slot_index", "slot", "switch_index", "footswitch_index"):
        slot_index = _coerce_int(action_data.get(key))
        if slot_index is not None:
            return slot_index
    switch_number = _coerce_int(action_data.get("switch_number"))
    if switch_number is not None and switch_number > 0:
        return switch_number - 1
    return None


def build_controller_display_assignments(
    commands: list[dict[str, Any]] | None,
    *,
    snapshot_midi_map_entries: list[dict[str, Any]] | None = None,
    max_slots: int | None = None,
) -> dict[str, Any]:
    """Resolve deterministic display-slot ownership for plugin-toggle MIDI commands."""

    label_map = extract_snapshot_footswitch_label_map(snapshot_midi_map_entries)
    assignments_by_slot: dict[int, ControllerDisplayAssignment] = {}
    conflicts: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []

    for source_index, command in enumerate(commands or []):
        if not isinstance(command, dict):
            skipped.append(
                {
                    "source_index": source_index,
                    "reason": "invalid_command_payload",
                }
            )
            continue

        action_type = str(command.get("action_type") or "").strip().lower()
        if action_type != "toggle_plugin":
            continue
        if not bool(command.get("is_enabled", True)):
            skipped.append(
                {
                    "source_index": source_index,
                    "command_id": _coerce_int(command.get("id")),
                    "reason": "disabled_command",
                }
            )
            continue

        slot_index = _extract_slot_index(command.get("action_data"))
        if slot_index is None or slot_index < 0:
            skipped.append(
                {
                    "source_index": source_index,
                    "command_id": _coerce_int(command.get("id")),
                    "reason": "missing_slot_index",
                }
            )
            continue
        if max_slots is not None and slot_index >= max_slots:
            skipped.append(
                {
                    "source_index": source_index,
                    "command_id": _coerce_int(command.get("id")),
                    "reason": "slot_out_of_range",
                    "slot_index": slot_index,
                    "max_slots": max_slots,
                }
            )
            continue

        target_plugin_uri = str(command.get("target_plugin_uri") or "").strip()
        if not target_plugin_uri:
            skipped.append(
                {
                    "source_index": source_index,
                    "command_id": _coerce_int(command.get("id")),
                    "reason": "missing_target_plugin_uri",
                    "slot_index": slot_index,
                }
            )
            continue

        slot_number = slot_index + 1
        assignment = ControllerDisplayAssignment(
            slot_index=slot_index,
            slot_number=slot_number,
            command_id=_coerce_int(command.get("id")),
            command_name=str(command.get("name") or "").strip(),
            command_type=str(command.get("command_type") or "").strip(),
            channel=_coerce_int(command.get("channel")) or 0,
            trigger_value=_coerce_int(command.get("data1")),
            target_plugin_uri=target_plugin_uri,
            target_plugin_position=_coerce_int(command.get("target_plugin_position")),
            label_override=label_map.get(str(slot_number)),
        )

        existing = assignments_by_slot.get(slot_index)
        if existing is not None:
            conflicts.append(
                {
                    "type": "duplicate_slot_assignment",
                    "slot_index": slot_index,
                    "slot_number": slot_number,
                    "kept_command_id": existing.command_id,
                    "replaced_by_command_id": assignment.command_id,
                }
            )
        assignments_by_slot[slot_index] = assignment

    assignments = [
        assignment.to_dict()
        for slot_index, assignment in sorted(assignments_by_slot.items(), key=lambda item: item[0])
    ]
    return {
        "assignments": assignments,
        "conflicts": conflicts,
        "skipped": skipped,
        "label_map": label_map,
    }

"""Sequencer consumer projection over the MidiBinding canonical authority.

Translates between:
  - The T2480-5 MidiDeviceState.bindings shape (a list of
    MidiDeviceBinding records hung off the registry's device record):
        {
          "consumer_type": "snapshot",
          "consumer_id": "<snapshot_id>",
          "consumer_name": "<friendly snapshot name>",
          "bound_at": "<ISO-8601>",
          "source": "brain-setup-task" | "manual" | ...,
        }
  - The canonical MidiBinding row (see app/services/midi/models.py).

T2480-5 wrote those records onto the registry's MidiDeviceState as a
seed for the canonical authority. P2.4 promotes them: the MidiBinding
table is now the source of truth; the registry's in-memory bindings
field becomes a derived projection over the canonical store.

P2.4 part 1 (this file) ships the projection adapter + migration helper.
The actual cutover of the registry's MidiDeviceState.bindings field to
read through this projection lands later — for now the projection is a
read-side parallel surface so consumers can begin migrating without
breaking the existing T2480-5 contract.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from app.services.midi.authority import MidiBindingAuthority
from app.services.midi.schemas import (
    BindingScope,
    MidiBindingCreate,
    MidiBindingRead,
)


def _iso(now: Optional[datetime] = None) -> str:
    return (now or datetime.now(timezone.utc)).isoformat()


def device_binding_to_create_payload(
    *,
    device_id: str,
    consumer_type: str,
    consumer_id: str,
    consumer_name: str,
    source: str,
    bound_at: Optional[str] = None,
) -> MidiBindingCreate:
    """Convert a T2480-5 MidiDeviceBinding-shaped record into a
    MidiBindingCreate. Used by the migration script to lift in-memory
    registry bindings into the canonical store.

    Mapping:
      - The T2480-5 binding's `consumer_type` ("snapshot" today, plus
        future expansion) maps directly to MidiBinding.consumer_type.
      - `device_id` is preserved as-is (the binding is "owned by" the
        consumer, but it's "driven by" the device — the device_id
        column on MidiBinding captures that direction).
      - `bound_at` is preserved as the canonical row's `created_at`.
      - `source` is preserved verbatim (e.g., "brain-setup-task").
      - `metadata.legacy_kind = "midi_device_binding"` so a future
        audit can identify rows that originated from the T2480-5 seed.

    The T2480-5 record carries no source/target descriptor — Brain's
    "this device drives that snapshot" relationship is essentially
    "any input from device → consumer's activate action". We model
    that as source_type="midi_pc", target_type="snapshot_action"
    when consumer_type="snapshot" (PC was the ad-hoc convention in
    Sequencer Setup); for unknown consumer types we use empty descriptors
    so the binding still lives in the canonical store but doesn't
    falsely claim a specific source/target shape.
    """
    if consumer_type == "snapshot":
        source_type = "midi_pc"
        source_descriptor = {"channel": 0}
        target_type = "snapshot_action"
        target_descriptor = {"action": "activate", "snapshot_id": str(consumer_id)}
    else:
        source_type = "midi_cc"
        source_descriptor = {}
        target_type = "engine_command"
        target_descriptor = {}

    metadata: dict[str, Any] = {
        "legacy_kind": "midi_device_binding",
        "legacy_consumer_name": consumer_name,
    }
    if bound_at:
        metadata["legacy_bound_at"] = bound_at

    # Sequencer device bindings are not snapshot-scoped — they apply
    # globally regardless of which snapshot is live (the binding IS
    # what selects which snapshot becomes active).
    return MidiBindingCreate(
        consumer_type=consumer_type,  # type: ignore[arg-type]
        consumer_id=str(consumer_id),
        consumer_label=consumer_name,
        source_type=source_type,  # type: ignore[arg-type]
        source_descriptor=source_descriptor,
        target_type=target_type,  # type: ignore[arg-type]
        target_descriptor=target_descriptor,
        device_id=device_id,
        scope="global",
        scope_id=None,
        enabled=True,
        created_by="brain-projection",
        source=source,
        metadata=metadata,
    )


def binding_to_legacy_device_binding(binding: MidiBindingRead) -> dict[str, Any]:
    """Reverse direction: build a T2480-5 MidiDeviceBinding-shape dict
    from a canonical MidiBindingRead. Used by the registry's projection
    layer once it cuts over from in-memory storage to canonical-backed
    reads.
    """
    metadata = binding.metadata or {}
    consumer_name = (
        metadata.get("legacy_consumer_name")
        or binding.consumer_label
        or f"{binding.consumer_type}:{binding.consumer_id}"
    )
    bound_at = metadata.get("legacy_bound_at") or _iso(binding.created_at)
    return {
        "consumer_type": binding.consumer_type,
        "consumer_id": binding.consumer_id,
        "consumer_name": consumer_name,
        "bound_at": bound_at,
        "source": binding.source,
    }


async def list_brain_device_bindings(
    authority: MidiBindingAuthority,
    device_id: str,
) -> list[dict[str, Any]]:
    """Read-side projection: list every T2480-5-style binding that
    targets a given device, in the legacy shape. Used by the Brain
    Setup Detect-phase row sub-line + the Hardware Store DeviceCard
    binding tag (T2480-6) once they cut over to canonical reads."""
    bindings = await authority.list_for_device(device_id, enabled_only=False)
    return [binding_to_legacy_device_binding(b) for b in bindings]


async def write_brain_device_binding(
    authority: MidiBindingAuthority,
    *,
    device_id: str,
    consumer_type: str,
    consumer_id: str,
    consumer_name: str,
    source: str = "brain-setup-task",
) -> MidiBindingRead:
    """Write-side projection: create a canonical MidiBinding row that
    represents a T2480-5-style device→consumer link. Replace-by-
    (consumer_type, source) semantics: any prior binding for this
    device with the same (consumer_type, source) gets removed first
    so a re-bind from the same source replaces rather than duplicates.

    Mirrors the T2480-5 add_binding contract on MidiDeviceState.
    """
    # Replace-by-key: find any existing binding for this device with
    # the same (consumer_type, source) and delete it before insertion.
    existing = await authority.list_for_device(device_id, enabled_only=False)
    for binding in existing:
        if binding.consumer_type == consumer_type and binding.source == source:
            await authority.delete(binding.binding_id)

    payload = device_binding_to_create_payload(
        device_id=device_id,
        consumer_type=consumer_type,
        consumer_id=consumer_id,
        consumer_name=consumer_name,
        source=source,
    )
    return await authority.create(payload)


async def remove_brain_device_binding(
    authority: MidiBindingAuthority,
    *,
    device_id: str,
    consumer_type: str,
    consumer_id: str,
) -> bool:
    """Remove every binding for (device_id, consumer_type, consumer_id).
    Returns True when at least one binding was removed."""
    existing = await authority.list_for_device(device_id, enabled_only=False)
    removed = False
    for binding in existing:
        if (
            binding.consumer_type == consumer_type
            and binding.consumer_id == str(consumer_id)
        ):
            if await authority.delete(binding.binding_id):
                removed = True
    return removed

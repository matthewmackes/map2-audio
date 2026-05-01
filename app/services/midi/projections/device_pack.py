"""Device-pack consumer projection (T2482-P2.5 part 1).

Models per-device-pack DEFAULT bindings — the factory-supplied
mappings that ship with a device-pack and apply unless an operator
overrides them per-snapshot or per-instance.

The consumer_type is "device_pack" because the bindings are owned by
the device-pack profile (e.g., "native-instruments/maschine-mk1.midi"),
not by any specific snapshot or session.

consumer_id format:
  - "<profile_key>" — the device-pack profile_key from the registry,
    same shape that Hardware Store uses (e.g.,
    "native-instruments/maschine-mk1.midi").

Today these defaults live as YAML inside each device-pack profile
(e.g., `device-packs/native-instruments/profiles/maschine-mk1.midi.yaml`).
P2.5 part 1 (this file) provides the typed projection adapter +
helpers to convert pack-level YAML defaults into canonical bindings.
P2.5 part 2 wires the migration that loads existing pack-level
defaults into the canonical store.
"""

from __future__ import annotations

from typing import Any, Iterable, Optional

from app.services.midi.authority import MidiBindingAuthority
from app.services.midi.schemas import (
    BindingSourceType,
    BindingTargetType,
    MidiBindingCreate,
    MidiBindingRead,
)


def make_consumer_id(profile_key: str) -> str:
    """Compose the canonical consumer_id for a device-pack default."""
    profile_key = profile_key.strip()
    if not profile_key:
        raise ValueError("device-pack profile_key must be non-empty")
    return profile_key


def make_create_payload(
    *,
    profile_key: str,
    binding_label: str,
    source_type: BindingSourceType,
    source_descriptor: dict[str, Any],
    target_type: BindingTargetType,
    target_descriptor: dict[str, Any],
    channel: Optional[int] = None,
    cc: Optional[int] = None,
    note: Optional[int] = None,
    extras: Optional[dict[str, Any]] = None,
    pack_version: Optional[str] = None,
    created_by: str = "device-pack-projection",
    source: str = "pack-yaml",
) -> MidiBindingCreate:
    """Build a MidiBindingCreate for a device-pack default.

    Convenience: if `source_descriptor` is empty and channel/cc/note are
    set, populates a default source_descriptor.

    Pack-level defaults are global-scope (they apply across all
    snapshots). Operators override per-snapshot via plugin_param or
    snapshot bindings.

    Args:
      profile_key: device-pack identifier (e.g.,
        "native-instruments/maschine-mk1.midi").
      binding_label: human-readable label (e.g., "Pad 1 → ch10 note 36").
      source_descriptor / target_descriptor: shapes per the
        source_type / target_type contracts.
      pack_version: optional version stamp from the pack manifest;
        recorded in metadata.pack_version for diff/audit.
    """
    consumer_id = make_consumer_id(profile_key)

    descriptor = dict(source_descriptor)
    if channel is not None and "channel" not in descriptor:
        descriptor["channel"] = int(channel)
    if cc is not None and source_type == "midi_cc" and "cc" not in descriptor:
        descriptor["cc"] = int(cc)
    if note is not None and source_type == "midi_note" and "note" not in descriptor:
        descriptor["note"] = int(note)

    metadata: dict[str, Any] = {}
    if pack_version is not None:
        metadata["pack_version"] = pack_version
    if extras:
        metadata["extra"] = dict(extras)

    return MidiBindingCreate(
        consumer_type="device_pack",
        consumer_id=consumer_id,
        consumer_label=binding_label,
        source_type=source_type,
        source_descriptor=descriptor,
        target_type=target_type,
        target_descriptor=dict(target_descriptor),
        device_id=None,
        scope="global",
        scope_id=None,
        enabled=True,
        created_by=created_by,
        source=source,
        metadata=metadata,
    )


async def list_device_pack_defaults(
    authority: MidiBindingAuthority,
    profile_key: str,
) -> list[MidiBindingRead]:
    """All default bindings shipped by a single device-pack."""
    return await authority.list_for_consumer(
        "device_pack", make_consumer_id(profile_key), enabled_only=False
    )


async def list_all_device_pack_defaults(
    authority: MidiBindingAuthority,
) -> list[MidiBindingRead]:
    """Every device-pack default binding across every pack."""
    in_scope = await authority.list_in_scope("global", None, enabled_only=False)
    return [b for b in in_scope if b.consumer_type == "device_pack"]


async def replace_device_pack_defaults(
    authority: MidiBindingAuthority,
    profile_key: str,
    payloads: Iterable[MidiBindingCreate],
) -> list[MidiBindingRead]:
    """Replace every default binding for a device-pack with the given
    set. Used by the pack-load step to refresh defaults when a pack
    version bumps."""
    consumer_id = make_consumer_id(profile_key)
    await authority.delete_for_consumer("device_pack", consumer_id)
    created = await authority.create_many(payloads)
    return created

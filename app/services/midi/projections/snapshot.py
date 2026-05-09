"""Snapshot consumer projection over the MidiBinding canonical authority.

Translates between:
  - The legacy SnapshotMidiMap.entries shape (list of opaque dicts; see
    `web/src/map2/types.ts SnapshotMidiMapEntry`):
        {
          "action": "load" | "morph" | "ab-toggle" | ...,
          "program_number"?: int,
          "channel"?: int,
          "cc"?: int,
          "note"?: int,
          "curve"?: "linear" | ...,
          ... (any consumer-defined extras pass through verbatim)
        }
  - The canonical MidiBinding row (see app/services/midi/models.py).

P2.3 part 1 (this file) is read-side only: takes a snapshot_id, returns
the legacy entries shape derived from MidiBinding rows. The write-side
+ migration script land in P2.3 part 2 (next iter).

Compatibility notes:
- Entries that originated as snapshot midi_map.entries during the Phase 2
  migration carry metadata.legacy_table="snapshot_midi_maps" +
  metadata.legacy_entry_index=<int> for traceability and round-trip
  fidelity.
- Every "unknown" field on the legacy entry shape is preserved through
  the metadata.extra dict so future surfaces that emit non-standard
  fields don't lose data.
"""

from __future__ import annotations

from typing import Any, Optional

from app.services.midi.authority import MidiBindingAuthority
from app.services.midi.schemas import (
    BindingSourceType,
    BindingTargetType,
    MidiBindingCreate,
    MidiBindingRead,
)


# ---------- Mapping rules ----------

# Legacy entries don't have a single canonical shape; the action keyword
# determines the target_type, and the source descriptor varies by entry
# kind (CC vs Note vs PC). These mappings are best-effort: anything we
# can't pattern-match into a canonical source/target keeps the original
# fields verbatim under metadata.extra so a round-trip back to the
# legacy shape preserves them.

_SNAPSHOT_ACTION_TARGET_TYPE: BindingTargetType = "snapshot_action"

# Known legacy field names that map to canonical source descriptors.
# Anything else stays under metadata.extra.
_KNOWN_LEGACY_FIELDS = frozenset(
    {
        "action",
        "program_number",
        "channel",
        "cc",
        "note",
        "velocity",
        "curve",
        "min",
        "max",
        "value",
    }
)


def _has_value(entry: dict[str, Any], key: str) -> bool:
    """A legacy field counts as 'present' only when it carries a real
    value. Real-world snapshot payloads frequently include keys with
    None values (e.g. ``program_number: None`` for non-PC actions); we
    treat those as absent so int() conversion below doesn't blow up."""
    return key in entry and entry[key] is not None


def _infer_source_type(entry: dict[str, Any]) -> BindingSourceType:
    """Choose a canonical source_type from the legacy entry's shape.

    Heuristic order: explicit source_type > program_number => midi_pc >
    cc => midi_cc > note => midi_note > fallback midi_cc.
    """
    explicit = entry.get("source_type")
    if explicit in {
        "midi_cc",
        "midi_note",
        "midi_pc",
        "midi_nrpn",
        "midi_sysex",
        "midi_clock",
        "midi_aftertouch",
        "midi_pitchbend",
        "midi_channel_pressure",
    }:
        return explicit  # type: ignore[return-value]
    if _has_value(entry, "program_number"):
        return "midi_pc"
    if _has_value(entry, "cc"):
        return "midi_cc"
    if _has_value(entry, "note"):
        return "midi_note"
    return "midi_cc"


def legacy_entry_to_create_payload(
    entry: dict[str, Any],
    *,
    snapshot_id: int,
    legacy_entry_index: int,
    created_by: str = "phase2-migration",
    source: str = "legacy-migration",
) -> MidiBindingCreate:
    """Convert one legacy SnapshotMidiMap entry into a MidiBindingCreate.

    Used by both the migration script (P2.3 part 2) and the live
    write-side projection (also P2.3 part 2).
    """
    source_type = _infer_source_type(entry)

    # Source descriptor: pick known signal fields explicitly; anything
    # else passes through metadata.extra. None-valued keys are treated
    # as absent so we don't crash on real snapshot payloads that
    # include placeholders like ``program_number: None``.
    source_descriptor: dict[str, Any] = {}
    if _has_value(entry, "channel"):
        source_descriptor["channel"] = int(entry["channel"])
    if source_type == "midi_cc" and _has_value(entry, "cc"):
        source_descriptor["cc"] = int(entry["cc"])
    if source_type == "midi_note" and _has_value(entry, "note"):
        source_descriptor["note"] = int(entry["note"])
    if source_type == "midi_pc" and _has_value(entry, "program_number"):
        source_descriptor["program_number"] = int(entry["program_number"])
    if _has_value(entry, "curve"):
        source_descriptor["curve"] = entry["curve"]
    if _has_value(entry, "min"):
        source_descriptor["min"] = entry["min"]
    if _has_value(entry, "max"):
        source_descriptor["max"] = entry["max"]

    # Target descriptor: the legacy entry's "action" string + any extras.
    target_descriptor: dict[str, Any] = {}
    action = entry.get("action")
    if action is not None:
        target_descriptor["action"] = str(action)
    if _has_value(entry, "program_number") and source_type != "midi_pc":
        # PC bindings carry program_number on the source side (above);
        # other source types that mention program_number put it here.
        target_descriptor["program_number"] = int(entry["program_number"])

    # Carry every unrecognized field through metadata.extra so the
    # round-trip is lossless.
    extras = {k: v for k, v in entry.items() if k not in _KNOWN_LEGACY_FIELDS}

    metadata: dict[str, Any] = {
        "legacy_table": "snapshot_midi_maps",
        "legacy_entry_index": legacy_entry_index,
    }
    if extras:
        metadata["extra"] = extras

    consumer_id = str(snapshot_id)
    consumer_label = (
        f"{action} (snapshot {snapshot_id})"
        if action
        else f"snapshot {snapshot_id} entry {legacy_entry_index}"
    )

    return MidiBindingCreate(
        consumer_type="snapshot",
        consumer_id=consumer_id,
        consumer_label=consumer_label,
        source_type=source_type,
        source_descriptor=source_descriptor,
        target_type=_SNAPSHOT_ACTION_TARGET_TYPE,
        target_descriptor=target_descriptor,
        device_id=None,
        scope="snapshot",
        scope_id=consumer_id,
        enabled=True,
        created_by=created_by,
        source=source,
        metadata=metadata,
    )


def binding_to_legacy_entry(binding: MidiBindingRead) -> dict[str, Any]:
    """Reverse direction: build the legacy SnapshotMidiMap entry shape
    from a canonical MidiBindingRead. Used by the read-side projection
    so the snapshot read path keeps emitting the historical shape
    untouched (Snapshot Editor + every existing consumer ignorant of
    the migration)."""
    entry: dict[str, Any] = {}

    # Reverse the source_descriptor.
    src = binding.source_descriptor or {}
    if "channel" in src:
        entry["channel"] = src["channel"]
    if binding.source_type == "midi_cc" and "cc" in src:
        entry["cc"] = src["cc"]
    if binding.source_type == "midi_note" and "note" in src:
        entry["note"] = src["note"]
    if binding.source_type == "midi_pc" and "program_number" in src:
        entry["program_number"] = src["program_number"]
    if "curve" in src:
        entry["curve"] = src["curve"]
    if "min" in src:
        entry["min"] = src["min"]
    if "max" in src:
        entry["max"] = src["max"]

    # Reverse the target_descriptor.
    tgt = binding.target_descriptor or {}
    if "action" in tgt:
        entry["action"] = tgt["action"]
    if "program_number" in tgt and binding.source_type != "midi_pc":
        entry["program_number"] = tgt["program_number"]

    # Restore any non-canonical fields preserved in metadata.extra.
    extras = (binding.metadata or {}).get("extra") or {}
    for k, v in extras.items():
        if k not in entry:
            entry[k] = v

    return entry


def _is_midi_map_binding(binding: MidiBindingRead) -> bool:
    """A midi_map[] binding is any snapshot-consumer row whose
    metadata.kind is NOT 'program_number'. The sibling
    ``snapshot_program`` projection writes its rows with
    metadata.kind='program_number'; this discriminator keeps the two
    projections from clobbering each other when they share the same
    consumer_type='snapshot' bucket."""
    return (binding.metadata or {}).get("kind") != "program_number"


async def list_snapshot_midi_map_entries(
    authority: MidiBindingAuthority,
    snapshot_id: int,
) -> list[dict[str, Any]]:
    """Read-side projection: return every midi_map[] binding for this
    snapshot in the legacy entries shape, ordered by legacy_entry_index
    when available (so a migrated snapshot reads back in its original
    order). Sibling program-number bindings are excluded — they are
    served by ``snapshot_program.get_program_number_binding``."""
    bindings = await authority.list_for_consumer(
        "snapshot", str(snapshot_id), enabled_only=False
    )

    def _sort_key(binding: MidiBindingRead) -> tuple[int, str]:
        idx = (binding.metadata or {}).get("legacy_entry_index")
        if isinstance(idx, int):
            return (0, f"{idx:08d}")
        # Bindings authored after the migration get a stable secondary
        # ordering by binding_id (UUID) so the order is deterministic.
        return (1, binding.binding_id)

    bindings = [b for b in bindings if _is_midi_map_binding(b)]
    bindings.sort(key=_sort_key)
    return [binding_to_legacy_entry(b) for b in bindings]


async def replace_snapshot_midi_map_entries(
    authority: MidiBindingAuthority,
    snapshot_id: int,
    entries: list[dict[str, Any]],
    *,
    modified_by: str = "snapshot-editor",
) -> list[dict[str, Any]]:
    """Write-side projection: replace every midi_map[] binding for this
    snapshot with the supplied entry list.

    Semantics: hard delete + bulk insert, **scoped to midi_map[]
    bindings only**. The sibling program-number binding (if any) is
    left untouched — it's owned by ``snapshot_program.sync_program_number``.

    Matches the legacy ``snapshot_persistence`` SnapshotMidiMap full-
    replace contract. Caller owns commit/rollback.

    This is the canonical write path for snapshot MIDI bindings.
    """
    # Per-binding delete (instead of delete_for_consumer) so we don't
    # clobber the snapshot's program-number binding.
    existing = await authority.list_for_consumer("snapshot", str(snapshot_id))
    for binding in existing:
        if _is_midi_map_binding(binding):
            await authority.delete(binding.binding_id)

    for index, entry in enumerate(entries):
        payload = legacy_entry_to_create_payload(
            entry,
            snapshot_id=snapshot_id,
            legacy_entry_index=index,
            created_by=modified_by,
            source="snapshot-editor",
        )
        await authority.create(payload)
    return await list_snapshot_midi_map_entries(authority, snapshot_id)


async def migrate_snapshot_midi_maps_table(
    authority: MidiBindingAuthority,
    *,
    skip_already_migrated: bool = True,
) -> dict[str, int]:
    """T2482-P2.3 migration: walk the legacy snapshot_midi_maps table
    and populate the canonical MidiBinding table.

    Idempotency: if `skip_already_migrated=True` and a snapshot already
    has any binding with metadata.legacy_table='snapshot_midi_maps',
    the migration skips that snapshot. So this can be safely re-run.

    Returns: {snapshots_migrated, entries_migrated, snapshots_skipped}.

    Caller owns commit. The legacy snapshot_midi_maps table is NOT
    dropped here — that's P2.8 (legacy store deletion) once every
    consumer is verified to read through the canonical authority.
    """
    from sqlalchemy import select

    from app.database import SnapshotMidiMap

    snapshots_migrated = 0
    entries_migrated = 0
    snapshots_skipped = 0

    result = await authority._session.execute(select(SnapshotMidiMap))
    rows = result.scalars().all()

    for row in rows:
        snapshot_id = int(row.snapshot_id)
        entries = row.entries or []
        if not entries:
            continue

        if skip_already_migrated:
            existing = await authority.list_for_consumer("snapshot", str(snapshot_id))
            already = any(
                (b.metadata or {}).get("legacy_table") == "snapshot_midi_maps"
                for b in existing
            )
            if already:
                snapshots_skipped += 1
                continue

        for index, entry in enumerate(entries):
            if not isinstance(entry, dict):
                continue
            payload = legacy_entry_to_create_payload(
                entry,
                snapshot_id=snapshot_id,
                legacy_entry_index=index,
            )
            await authority.create(payload)
            entries_migrated += 1
        snapshots_migrated += 1

    return {
        "snapshots_migrated": snapshots_migrated,
        "entries_migrated": entries_migrated,
        "snapshots_skipped": snapshots_skipped,
    }

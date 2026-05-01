"""Plugin-parameter consumer projection (T2482-P2.7).

The Snapshot Editor's inline MIDI editors (per-effect parameter
mappings, A/B switch trigger, expression pedal) author bindings whose
consumer is a specific plugin parameter inside a snapshot's chain.

The canonical consumer_id format for this consumer_type is:
    "<chain_id>:<plugin_uri>:<param_index>"

This projection translates between that consumer_id format and the
typed shape that the inline editors use.

Per the Q2 refinement (2026-05-01): the inline editors STAY in place
visually; backend rewires through the canonical authority via this
projection. The Snapshot Editor's existing UI surfaces don't change.

P2.7 ships the projection adapter; the wire-up of
SnapshotAbSwitchMidiCard / SnapshotExpressionMappingsCard /
SnapshotEditorSelectedBlockMidiPanel to call into this projection
lands as part of the snapshot-editor-side rewire (frontend Phase 3
work; backend contract is here).
"""

from __future__ import annotations

from typing import Any, Optional

from app.services.midi.authority import MidiBindingAuthority
from app.services.midi.schemas import (
    BindingSourceType,
    MidiBindingCreate,
    MidiBindingRead,
)


def make_consumer_id(*, chain_id: int, plugin_uri: str, param_index: int) -> str:
    """Compose the canonical consumer_id for a plugin-parameter binding."""
    return f"{int(chain_id)}:{plugin_uri}:{int(param_index)}"


def parse_consumer_id(consumer_id: str) -> tuple[int, str, int]:
    """Reverse: split consumer_id back into (chain_id, plugin_uri, param_index).

    Plugin URIs may contain colons (e.g., LV2 URIs like
    "http://lv2plug.in/plugins/eg-amp"); we split on the FIRST colon
    for chain_id and the LAST colon for param_index, leaving everything
    in between as the plugin URI.

    Raises ValueError when consumer_id is malformed.
    """
    first_colon = consumer_id.find(":")
    last_colon = consumer_id.rfind(":")
    if first_colon == -1 or last_colon == -1 or first_colon == last_colon:
        raise ValueError(f"malformed plugin_param consumer_id: {consumer_id!r}")
    chain_id_str = consumer_id[:first_colon]
    plugin_uri = consumer_id[first_colon + 1 : last_colon]
    param_index_str = consumer_id[last_colon + 1 :]
    try:
        return int(chain_id_str), plugin_uri, int(param_index_str)
    except ValueError as exc:
        raise ValueError(f"malformed plugin_param consumer_id: {consumer_id!r}") from exc


def make_create_payload(
    *,
    chain_id: int,
    plugin_uri: str,
    param_index: int,
    snapshot_id: int,
    source_type: BindingSourceType,
    channel: Optional[int],
    cc: Optional[int] = None,
    note: Optional[int] = None,
    curve: Optional[str] = None,
    range_min: Optional[float] = None,
    range_max: Optional[float] = None,
    parameter_label: Optional[str] = None,
    feedback_cc: Optional[int] = None,
    extras: Optional[dict[str, Any]] = None,
    created_by: str = "snapshot-editor",
    source: str = "snapshot-editor",
) -> MidiBindingCreate:
    """Build a MidiBindingCreate for a per-plugin-param binding.

    Snapshot-scoped: scope="snapshot", scope_id=str(snapshot_id) so a
    binding only fires when its owning snapshot is live.
    """
    consumer_id = make_consumer_id(
        chain_id=chain_id, plugin_uri=plugin_uri, param_index=param_index
    )
    label = (
        f"{parameter_label} (snapshot {snapshot_id})"
        if parameter_label
        else f"chain {chain_id} param {param_index}"
    )

    source_descriptor: dict[str, Any] = {}
    if channel is not None:
        source_descriptor["channel"] = int(channel)
    if cc is not None and source_type == "midi_cc":
        source_descriptor["cc"] = int(cc)
    if note is not None and source_type == "midi_note":
        source_descriptor["note"] = int(note)
    if curve is not None:
        source_descriptor["curve"] = curve
    if range_min is not None:
        source_descriptor["min"] = range_min
    if range_max is not None:
        source_descriptor["max"] = range_max

    target_descriptor: dict[str, Any] = {
        "chain_id": int(chain_id),
        "plugin_uri": plugin_uri,
        "param_index": int(param_index),
    }
    if feedback_cc is not None:
        target_descriptor["feedback_cc"] = int(feedback_cc)
    if parameter_label is not None:
        target_descriptor["parameter_label"] = parameter_label

    metadata: dict[str, Any] = {}
    if extras:
        metadata["extra"] = dict(extras)

    return MidiBindingCreate(
        consumer_type="plugin_param",
        consumer_id=consumer_id,
        consumer_label=label,
        source_type=source_type,
        source_descriptor=source_descriptor,
        target_type="engine_param",
        target_descriptor=target_descriptor,
        device_id=None,
        scope="snapshot",
        scope_id=str(snapshot_id),
        enabled=True,
        created_by=created_by,
        source=source,
        metadata=metadata,
    )


async def list_plugin_param_bindings_for_snapshot(
    authority: MidiBindingAuthority,
    snapshot_id: int,
) -> list[MidiBindingRead]:
    """All plugin-param bindings owned by snapshots that are scoped to
    this snapshot_id."""
    in_scope = await authority.list_in_scope("snapshot", str(snapshot_id), enabled_only=False)
    return [b for b in in_scope if b.consumer_type == "plugin_param"]


async def list_plugin_param_bindings_for_param(
    authority: MidiBindingAuthority,
    *,
    chain_id: int,
    plugin_uri: str,
    param_index: int,
) -> list[MidiBindingRead]:
    """All bindings authored against a specific (chain, plugin, param)
    triple, across all snapshots."""
    consumer_id = make_consumer_id(
        chain_id=chain_id, plugin_uri=plugin_uri, param_index=param_index
    )
    return await authority.list_for_consumer("plugin_param", consumer_id, enabled_only=False)


async def migrate_midi_mappings_table(
    authority: MidiBindingAuthority,
    *,
    skip_already_migrated: bool = True,
) -> dict[str, int]:
    """T2482-P2.5 part 2 migration: walk the legacy MIDIMapping table
    and lift each row into a canonical plugin_param binding.

    The legacy MIDIMapping table is a global (non-snapshot-scoped)
    plugin-param binding store. Each row maps:
        (channel, cc) → (chain_id, plugin_uri, param_index)
    with min/max/curve/feedback fields.

    Migrated bindings:
      - consumer_type='plugin_param'
      - consumer_id="<chain_id>:<plugin_uri>:<param_index>"
      - source_type='midi_cc' (the legacy table is CC-only)
      - scope='global' (legacy is not snapshot-scoped; new snapshot
        bindings live as separate rows per snapshot in P2.7's
        plugin_param projection)
      - source='legacy-migration', metadata.legacy_table='midi_mappings'

    Idempotent: skips rows already migrated when
    `skip_already_migrated=True` (detected via metadata.legacy_table +
    metadata.legacy_row_id).

    Returns: {mappings_migrated, mappings_skipped}.
    """
    from sqlalchemy import select

    from app.database import MIDIMapping

    mappings_migrated = 0
    mappings_skipped = 0

    result = await authority._session.execute(select(MIDIMapping))
    rows = result.scalars().all()

    for row in rows:
        legacy_id = int(row.id)
        if not row.target_plugin_uri or row.target_param_index is None or row.chain_id is None:
            mappings_skipped += 1
            continue
        consumer_id = make_consumer_id(
            chain_id=int(row.chain_id),
            plugin_uri=str(row.target_plugin_uri),
            param_index=int(row.target_param_index),
        )

        if skip_already_migrated:
            existing = await authority.list_for_consumer("plugin_param", consumer_id)
            already = any(
                (b.metadata or {}).get("legacy_table") == "midi_mappings"
                and (b.metadata or {}).get("legacy_row_id") == legacy_id
                for b in existing
            )
            if already:
                mappings_skipped += 1
                continue

        source_descriptor: dict[str, Any] = {
            "channel": int(row.channel),
            "cc": int(row.cc),
        }
        if row.min_val is not None:
            source_descriptor["min"] = float(row.min_val)
        if row.max_val is not None:
            source_descriptor["max"] = float(row.max_val)
        if row.curve_type:
            source_descriptor["curve"] = str(row.curve_type)
        if bool(row.invert):
            source_descriptor["invert"] = True

        target_descriptor: dict[str, Any] = {
            "chain_id": int(row.chain_id),
            "plugin_uri": str(row.target_plugin_uri),
            "param_index": int(row.target_param_index),
        }
        if row.target_param_symbol:
            target_descriptor["parameter_symbol"] = str(row.target_param_symbol)
        if row.feedback_cc is not None:
            target_descriptor["feedback_cc"] = int(row.feedback_cc)
        if row.target_plugin_position is not None:
            target_descriptor["plugin_position"] = int(row.target_plugin_position)

        metadata = {
            "legacy_table": "midi_mappings",
            "legacy_row_id": legacy_id,
        }
        if row.is_learned:
            metadata["learned"] = True
        if row.group_id is not None:
            metadata["legacy_group_id"] = int(row.group_id)

        label = (
            row.name.strip()
            if (row.name and row.name.strip())
            else f"chain {row.chain_id} param {row.target_param_index} (legacy {legacy_id})"
        )

        payload = MidiBindingCreate(
            consumer_type="plugin_param",
            consumer_id=consumer_id,
            consumer_label=label,
            source_type="midi_cc",
            source_descriptor=source_descriptor,
            target_type="engine_param",
            target_descriptor=target_descriptor,
            device_id=None,
            scope="global",
            scope_id=None,
            enabled=bool(row.is_enabled),
            created_by="phase2-migration",
            source="legacy-migration",
            metadata=metadata,
        )
        await authority.create(payload)
        mappings_migrated += 1

    return {
        "mappings_migrated": mappings_migrated,
        "mappings_skipped": mappings_skipped,
    }

"""Global plugin-parameter consumer projection (T2482-P2.8 part 1).

Sibling of `plugin_param.py` but for bindings authored at GLOBAL scope
— i.e., the legacy MIDIMapping rows where chain_id was NULL. Those
49 rows lack the chain context that `plugin_param` requires, so they
get their own consumer type rather than fabricating a chain_id.

The consumer_id format omits chain_id:
    "<plugin_uri>:<param_index>"

Read-side: same shape as plugin_param's binding records (consumer
sees the same source/target descriptors). Write-side: the legacy
MIDIMapping migration script gets a sibling helper that lifts
chain-less rows into this consumer type.

Anti-pattern explicitly avoided: we DO NOT invent a sentinel chain_id
(0, -1, NULL-cast-to-0, etc.) just to fit `plugin_param`. The
canonical model has different shapes for different binding kinds; new
legacy rows that don't fit any existing kind get their own kind.
"""

from __future__ import annotations

from typing import Any, Optional

from app.services.midi.authority import MidiBindingAuthority
from app.services.midi.schemas import (
    BindingSourceType,
    MidiBindingCreate,
    MidiBindingRead,
)


def make_consumer_id(*, plugin_uri: str, param_index: int) -> str:
    """Compose the canonical consumer_id for a global_param binding.

    Plugin URIs may contain colons (LV2 URIs). We split the consumer_id
    on the LAST colon to recover param_index; everything before is the
    plugin_uri.
    """
    plugin_uri = plugin_uri.strip()
    if not plugin_uri:
        raise ValueError("global_param plugin_uri must be non-empty")
    return f"{plugin_uri}:{int(param_index)}"


def parse_consumer_id(consumer_id: str) -> tuple[str, int]:
    """Reverse: split consumer_id back into (plugin_uri, param_index).

    Raises ValueError when malformed.
    """
    last_colon = consumer_id.rfind(":")
    if last_colon == -1:
        raise ValueError(f"malformed global_param consumer_id: {consumer_id!r}")
    plugin_uri = consumer_id[:last_colon]
    param_index_str = consumer_id[last_colon + 1 :]
    if not plugin_uri:
        raise ValueError(f"malformed global_param consumer_id: {consumer_id!r}")
    try:
        return plugin_uri, int(param_index_str)
    except ValueError as exc:
        raise ValueError(f"malformed global_param consumer_id: {consumer_id!r}") from exc


def make_create_payload(
    *,
    plugin_uri: str,
    param_index: int,
    source_type: BindingSourceType,
    channel: Optional[int] = None,
    cc: Optional[int] = None,
    note: Optional[int] = None,
    curve: Optional[str] = None,
    range_min: Optional[float] = None,
    range_max: Optional[float] = None,
    parameter_label: Optional[str] = None,
    feedback_cc: Optional[int] = None,
    extras: Optional[dict[str, Any]] = None,
    created_by: str = "global-param-projection",
    source: str = "manual",
) -> MidiBindingCreate:
    """Build a MidiBindingCreate for a chain-less global plugin-param
    binding. Global scope (fires regardless of which snapshot is live).
    """
    consumer_id = make_consumer_id(plugin_uri=plugin_uri, param_index=param_index)
    label = parameter_label or f"global {plugin_uri} param {param_index}"

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
        consumer_type="global_param",
        consumer_id=consumer_id,
        consumer_label=label,
        source_type=source_type,
        source_descriptor=source_descriptor,
        target_type="engine_param",
        target_descriptor=target_descriptor,
        device_id=None,
        scope="global",
        scope_id=None,
        enabled=True,
        created_by=created_by,
        source=source,
        metadata=metadata,
    )


async def list_global_param_bindings(
    authority: MidiBindingAuthority,
) -> list[MidiBindingRead]:
    """All global_param bindings."""
    in_scope = await authority.list_in_scope("global", None, enabled_only=False)
    return [b for b in in_scope if b.consumer_type == "global_param"]


async def list_global_param_bindings_for_param(
    authority: MidiBindingAuthority,
    *,
    plugin_uri: str,
    param_index: int,
) -> list[MidiBindingRead]:
    """All bindings authored against a specific (plugin_uri, param_index)
    triple at global scope."""
    consumer_id = make_consumer_id(plugin_uri=plugin_uri, param_index=param_index)
    return await authority.list_for_consumer(
        "global_param", consumer_id, enabled_only=False
    )


async def migrate_chain_less_midi_mappings(
    authority: MidiBindingAuthority,
    *,
    skip_already_migrated: bool = True,
) -> dict[str, int]:
    """T2482-P2.8 part 1 migration: walk MIDIMapping rows where
    chain_id IS NULL and lift each into a global_param canonical row.

    Pairs with `migrate_midi_mappings_table` from `plugin_param.py` —
    that one handles chain-bound rows; this one handles chain-less.
    Together they cover the full MIDIMapping table.

    Idempotent via metadata.legacy_table='midi_mappings' +
    metadata.legacy_row_id matching.

    Returns: {mappings_migrated, mappings_skipped}.
    """
    from sqlalchemy import select

    from app.database import MIDIMapping

    mappings_migrated = 0
    mappings_skipped = 0

    result = await authority._session.execute(
        select(MIDIMapping).where(MIDIMapping.chain_id.is_(None))
    )
    rows = result.scalars().all()

    for row in rows:
        legacy_id = int(row.id)
        if not row.target_plugin_uri or row.target_param_index is None:
            mappings_skipped += 1
            continue
        consumer_id = make_consumer_id(
            plugin_uri=str(row.target_plugin_uri),
            param_index=int(row.target_param_index),
        )

        if skip_already_migrated:
            existing = await authority.list_for_consumer("global_param", consumer_id)
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
            else f"global {row.target_plugin_uri} param {row.target_param_index} (legacy {legacy_id})"
        )

        payload = MidiBindingCreate(
            consumer_type="global_param",
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

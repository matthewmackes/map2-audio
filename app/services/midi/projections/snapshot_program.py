"""Snapshot program-number projection over the MidiBinding authority.

Surfaces the per-snapshot `program_number` column (a single MIDI Program
Change number bound to a snapshot's `recall` action) in the canonical
MidiBinding table so it shows up alongside every other MIDI binding in
the MIDI Services Bindings + Routing pages.

This is distinct from `snapshot.py` in this directory, which projects the
per-effect `midi_map[]` array nested inside a snapshot's controls payload.
The two projections are siblings: one snapshot can have at most one
program-number binding (one row here, identified by metadata.kind="program_number"),
plus zero or more midi_map entries from the other projection.

Write semantics: `sync_program_number()` is called from the snapshot
update path. It diffs the desired state (program_number int or None)
against the existing program-number binding for that snapshot and
performs the minimal create / update / delete to converge.

Why a write-through projection rather than a virtual read-time one:
- Stable binding_ids (bindings can be edited/disabled by binding_id from
  the Bindings UI without resolving back to the snapshot).
- Conflict checks land in the same authority used by every other
  consumer.
- The MIDI Routing matrix counts the binding without the bindings
  endpoint having to know about the snapshot domain.
"""

from __future__ import annotations

import logging
from typing import Optional

from app.services.midi.authority import MidiBindingAuthority
from app.services.midi.schemas import (
    MidiBindingCreate,
    MidiBindingRead,
    MidiBindingUpdate,
)

logger = logging.getLogger(__name__)


_KIND = "program_number"


def _is_program_number_binding(binding: MidiBindingRead) -> bool:
    """A program-number binding is the snapshot-consumer row whose
    metadata.kind == 'program_number'. The midi_map[] projection writes
    rows without that marker, so this filter cleanly distinguishes the
    two sibling projections sharing the 'snapshot' consumer_type."""
    return (binding.metadata or {}).get("kind") == _KIND


def _build_create_payload(
    snapshot_id: int,
    program_number: int,
    *,
    snapshot_name: Optional[str] = None,
    created_by: str = "snapshot-editor",
    source: str = "snapshot-program-number",
) -> MidiBindingCreate:
    label = (
        f"Program #{program_number} → snapshot \"{snapshot_name}\""
        if snapshot_name
        else f"Program #{program_number} → snapshot {snapshot_id}"
    )
    return MidiBindingCreate(
        consumer_type="snapshot",
        consumer_id=str(snapshot_id),
        consumer_label=label,
        source_type="midi_pc",
        source_descriptor={"program_number": int(program_number)},
        target_type="snapshot_action",
        target_descriptor={"action": "recall"},
        device_id=None,
        scope="snapshot",
        scope_id=str(snapshot_id),
        enabled=True,
        created_by=created_by,
        source=source,
        metadata={"kind": _KIND},
    )


async def get_program_number_binding(
    authority: MidiBindingAuthority,
    snapshot_id: int,
) -> Optional[MidiBindingRead]:
    """Return the single program-number binding for this snapshot, if any."""
    bindings = await authority.list_for_consumer(
        "snapshot", str(snapshot_id), enabled_only=False
    )
    for binding in bindings:
        if _is_program_number_binding(binding):
            return binding
    return None


def _label_for(snapshot_id: int, program_number: int, snapshot_name: Optional[str]) -> str:
    return (
        f"Program #{program_number} → snapshot \"{snapshot_name}\""
        if snapshot_name
        else f"Program #{program_number} → snapshot {snapshot_id}"
    )


async def sync_program_number(
    authority: MidiBindingAuthority,
    snapshot_id: int,
    program_number: Optional[int],
    *,
    snapshot_name: Optional[str] = None,
    modified_by: str = "snapshot-editor",
) -> Optional[MidiBindingRead]:
    """Converge the canonical authority with the snapshot's program_number.

    - None  → delete any existing program-number binding for this snapshot.
    - int   → upsert the program-number binding. If a binding exists with
              a different program_number OR a stale consumer_label, update
              source_descriptor / consumer_label in place (preserves
              binding_id and audit trail).

    Returns the resulting MidiBindingRead, or None when the projection
    state is "no binding" (program_number cleared).

    Idempotent: calling with the same program_number AND same snapshot_name
    a second time is a no-op (no row touched).
    """
    existing = await get_program_number_binding(authority, snapshot_id)

    if program_number is None:
        if existing is not None:
            await authority.delete(existing.binding_id)
        return None

    if existing is None:
        return await authority.create(
            _build_create_payload(
                snapshot_id,
                int(program_number),
                snapshot_name=snapshot_name,
                created_by=modified_by,
            )
        )

    desired_pn = int(program_number)
    desired_label = _label_for(snapshot_id, desired_pn, snapshot_name)
    current_pn = (existing.source_descriptor or {}).get("program_number")
    if current_pn == desired_pn and existing.consumer_label == desired_label:
        return existing

    return await authority.update(
        existing.binding_id,
        MidiBindingUpdate(
            source_descriptor={"program_number": desired_pn},
            consumer_label=desired_label,
            modified_by=modified_by,
        ),
    )


async def delete_program_number_binding(
    authority: MidiBindingAuthority,
    snapshot_id: int,
) -> bool:
    """Drop the program-number binding for this snapshot. Returns True
    if a binding was removed, False if none existed. Used when a snapshot
    is permanently deleted."""
    existing = await get_program_number_binding(authority, snapshot_id)
    if existing is None:
        return False
    await authority.delete(existing.binding_id)
    return True


async def backfill_program_number_bindings(
    authority: MidiBindingAuthority,
) -> dict[str, int]:
    """One-shot: walk every snapshot with a non-null program_number and
    ensure a corresponding canonical binding exists.

    Idempotent: snapshots whose program-number binding already exists
    (and matches) are skipped. Snapshots whose program-number binding is
    stale are converged via sync_program_number().

    Returns: {created, updated, skipped, total}.
    """
    from sqlalchemy import select

    from app.database import Snapshot

    created = 0
    updated = 0
    skipped = 0
    total = 0

    result = await authority._session.execute(
        select(Snapshot).where(Snapshot.program_number.is_not(None))
    )
    rows = result.scalars().all()

    for row in rows:
        total += 1
        snapshot_id = int(row.id)
        program_number = int(row.program_number)
        existing = await get_program_number_binding(authority, snapshot_id)
        if existing is None:
            await authority.create(
                _build_create_payload(
                    snapshot_id,
                    program_number,
                    snapshot_name=row.name,
                    created_by="backfill-program-number",
                    source="backfill-program-number",
                )
            )
            created += 1
            continue

        current_pn = (existing.source_descriptor or {}).get("program_number")
        if current_pn == program_number:
            skipped += 1
            continue

        await sync_program_number(
            authority,
            snapshot_id,
            program_number,
            snapshot_name=row.name,
            modified_by="backfill-program-number",
        )
        updated += 1

    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "total": total,
    }

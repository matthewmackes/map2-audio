#!/usr/bin/env python3
"""Backfill canonical MidiBinding rows for every snapshot's midi_map[] entries.

Sibling to ``backfill_snapshot_program_bindings.py``. Reads from the
legacy ``snapshot_midi_maps`` table and populates the canonical
authority via ``app.services.midi.projections.snapshot.migrate_
snapshot_midi_maps_table``.

Idempotent: snapshots already represented (any row with
``metadata.legacy_table='snapshot_midi_maps'``) are skipped. Re-run as
often as needed.

After cycle 2, new snapshot writes go through the canonical authority
automatically. This script catches up snapshots that existed before
the write-through landed.

Run with: python3 scripts/backfill_snapshot_midi_map_bindings.py
"""

from __future__ import annotations

import asyncio
import sys

from app.database import get_session, init_async_db
from app.services.midi.authority import MidiBindingAuthority
from app.services.midi.projections.snapshot import (
    migrate_snapshot_midi_maps_table,
)


async def main() -> int:
    init_async_db()

    async with get_session() as session:
        authority = MidiBindingAuthority(session)
        result = await migrate_snapshot_midi_maps_table(authority)
        await session.commit()

    print(
        "Backfill complete: "
        f"{result['snapshots_migrated']} snapshots migrated, "
        f"{result['entries_migrated']} entries migrated, "
        f"{result['snapshots_skipped']} snapshots already in sync."
    )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

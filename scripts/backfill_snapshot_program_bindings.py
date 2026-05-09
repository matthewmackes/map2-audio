#!/usr/bin/env python3
"""Backfill MidiBinding rows for every snapshot whose program_number is set.

Idempotent: snapshots already represented in the canonical authority are
skipped (or updated when the cached snapshot name diverges from the current
name). Safe to run repeatedly.

Run with: python3 scripts/backfill_snapshot_program_bindings.py
"""

from __future__ import annotations

import asyncio
import sys

from app.database import get_session, init_async_db
from app.services.midi.authority import MidiBindingAuthority
from app.services.midi.projections.snapshot_program import (
    backfill_program_number_bindings,
)


async def main() -> int:
    init_async_db()

    async with get_session() as session:
        authority = MidiBindingAuthority(session)
        result = await backfill_program_number_bindings(authority)
        await session.commit()

    print(
        "Backfill complete: "
        f"{result['created']} created, "
        f"{result['updated']} updated, "
        f"{result['skipped']} already in sync, "
        f"{result['total']} snapshots scanned."
    )
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

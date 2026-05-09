"""Service-level round-trip: snapshot program update → canonical binding row.

Locks the contract that ``POST /api/snapshots/{id}/program`` →
``SnapshotService.update_snapshot(program_number=N)`` →
``MidiBindingAuthority`` produces a queryable canonical binding,
discoverable via the same shape ``GET /api/midi/bindings`` filters by.

The full FastAPI route stack is heavy to spin up; this test exercises
the service layer (which is what the route delegates to verbatim) and
verifies the side-effect lands in the bindings authority.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app import database as database_module
from app.services.midi import MidiBindingAuthority
from app.services.midi.projections.snapshot_program import (
    get_program_number_binding,
)
from app.services.snapshot import SnapshotService


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(
        f"sqlite+aiosqlite:///{tmp_path / 'snapshot-program-roundtrip.db'}"
    )


@pytest.fixture(autouse=True)
def _dispose_after_each_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def test_setting_program_number_creates_canonical_binding(tmp_path):
    """End-to-end: create a snapshot, set program_number=24 via the same
    update_snapshot call the route uses, then look the binding up via
    the canonical authority."""
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="TestRig",
                tempo_bpm=120.0,
            )
            snapshot_id = int(created["id"])
            await service.update_snapshot(snapshot_id, program_number=24)
            await session.commit()

            # Same query shape the API serves.
            authority = MidiBindingAuthority(session)
            binding = await get_program_number_binding(authority, snapshot_id)
            assert binding is not None
            assert binding.source_type == "midi_pc"
            assert (binding.source_descriptor or {}).get("program_number") == 24
            assert binding.scope == "snapshot"
            assert binding.scope_id == str(snapshot_id)
            assert (binding.metadata or {}).get("kind") == "program_number"

    asyncio.run(_run())


def test_clearing_program_number_drops_canonical_binding(tmp_path):
    """Setting program_number=None removes the canonical binding so
    the snapshot stops appearing in the bindings list."""
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="Drift",
                tempo_bpm=120.0,
                program_number=24,
            )
            snapshot_id = int(created["id"])
            await session.commit()

            # Confirm the binding exists.
            authority = MidiBindingAuthority(session)
            assert await get_program_number_binding(authority, snapshot_id) is not None

            # Now clear it.
            await service.update_snapshot(snapshot_id, program_number=None)
            await session.commit()
            assert await get_program_number_binding(authority, snapshot_id) is None

    asyncio.run(_run())


def test_changing_program_number_updates_binding_in_place(tmp_path):
    """A program_number change preserves the binding_id (so audit trail
    is intact) and updates the source_descriptor to the new number."""
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="A",
                tempo_bpm=120.0,
                program_number=24,
            )
            snapshot_id = int(created["id"])
            await session.commit()

            authority = MidiBindingAuthority(session)
            first = await get_program_number_binding(authority, snapshot_id)
            assert first is not None

            await service.update_snapshot(snapshot_id, program_number=31)
            await session.commit()
            second = await get_program_number_binding(authority, snapshot_id)
            assert second is not None
            assert second.binding_id == first.binding_id
            assert (second.source_descriptor or {}).get("program_number") == 31

    asyncio.run(_run())


def test_deleting_snapshot_cleans_up_canonical_binding(tmp_path):
    """delete_snapshot drops the program-number binding so a recreated
    snapshot ID can pick up a fresh row without conflict.

    The first snapshot in a fresh DB becomes the live/control-plane
    snapshot and is not deletable; create two and delete the second."""
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            # Anchor snapshot — becomes live, ineligible for delete.
            await service.create_snapshot(name="Anchor", tempo_bpm=120.0)
            target = await service.create_snapshot(
                name="ToDelete",
                tempo_bpm=120.0,
                program_number=24,
            )
            target_id = int(target["id"])
            await session.commit()

            authority = MidiBindingAuthority(session)
            assert await get_program_number_binding(authority, target_id) is not None

            removed = await service.delete_snapshot(target_id)
            assert removed is True
            await session.commit()
            assert await get_program_number_binding(authority, target_id) is None

    asyncio.run(_run())

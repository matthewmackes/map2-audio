"""Tests for the snapshot program-number write-through projection.

Covers create / update-in-place / clear / idempotent / coexistence with
the sibling midi_map projection / backfill.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app import database as database_module
from app.services.midi import MidiBindingAuthority
from app.services.midi.projections.snapshot import (
    legacy_entry_to_create_payload,
)
from app.services.midi.projections.snapshot_program import (
    backfill_program_number_bindings,
    delete_program_number_binding,
    get_program_number_binding,
    sync_program_number,
)


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(
        f"sqlite+aiosqlite:///{tmp_path / 'snapshot-program-projection.db'}"
    )


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def test_sync_creates_binding_when_program_number_set(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            binding = await sync_program_number(
                authority, 42, 24, snapshot_name="Lead Tone"
            )
            await session.commit()

            assert binding is not None
            assert binding.consumer_type == "snapshot"
            assert binding.consumer_id == "42"
            assert binding.source_type == "midi_pc"
            assert binding.source_descriptor == {"program_number": 24}
            assert binding.target_type == "snapshot_action"
            assert binding.target_descriptor == {"action": "recall"}
            assert binding.scope == "snapshot"
            assert binding.scope_id == "42"
            assert binding.enabled is True
            assert (binding.metadata or {}).get("kind") == "program_number"
            assert "Lead Tone" in binding.consumer_label
            assert "#24" in binding.consumer_label

    asyncio.run(_run())


def test_sync_is_idempotent_for_same_program_number_and_name(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            first = await sync_program_number(
                authority, 42, 24, snapshot_name="Lead"
            )
            await session.commit()
            second = await sync_program_number(
                authority, 42, 24, snapshot_name="Lead"
            )
            await session.commit()
            assert first is not None and second is not None
            assert first.binding_id == second.binding_id
            # No-op did not touch the row. Compare naive datetimes since
            # SQLite round-trips drop tzinfo on the second read.
            assert first.modified_at.replace(tzinfo=None) == second.modified_at.replace(tzinfo=None)

    asyncio.run(_run())


def test_sync_updates_in_place_when_program_number_changes(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            first = await sync_program_number(authority, 42, 24, snapshot_name="A")
            await session.commit()
            second = await sync_program_number(authority, 42, 31, snapshot_name="A")
            await session.commit()
            assert first is not None and second is not None
            assert first.binding_id == second.binding_id  # same row
            assert second.source_descriptor == {"program_number": 31}
            assert "#31" in second.consumer_label

    asyncio.run(_run())


def test_sync_updates_label_when_snapshot_name_changes(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            first = await sync_program_number(
                authority, 42, 24, snapshot_name="Old Name"
            )
            await session.commit()
            second = await sync_program_number(
                authority, 42, 24, snapshot_name="New Name"
            )
            await session.commit()
            assert first is not None and second is not None
            assert first.binding_id == second.binding_id
            assert "New Name" in second.consumer_label
            assert "Old Name" not in second.consumer_label

    asyncio.run(_run())


def test_sync_with_none_clears_existing_binding(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await sync_program_number(authority, 42, 24, snapshot_name="A")
            await session.commit()
            cleared = await sync_program_number(authority, 42, None)
            await session.commit()
            assert cleared is None
            assert await get_program_number_binding(authority, 42) is None

    asyncio.run(_run())


def test_sync_with_none_when_no_binding_is_noop(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            cleared = await sync_program_number(authority, 42, None)
            await session.commit()
            assert cleared is None

    asyncio.run(_run())


def test_delete_program_number_binding_only_removes_program_row(tmp_path):
    """The midi_map[] projection writes other snapshot-consumer rows for
    the same snapshot. Deleting the program-number binding must NOT
    touch those sibling rows."""
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            # Sibling midi_map binding
            await authority.create(
                legacy_entry_to_create_payload(
                    {"channel": 0, "cc": 7, "action": "load"},
                    snapshot_id=42,
                    legacy_entry_index=0,
                )
            )
            # Our program-number binding
            await sync_program_number(authority, 42, 24, snapshot_name="A")
            await session.commit()

            removed = await delete_program_number_binding(authority, 42)
            await session.commit()
            assert removed is True

            remaining = await authority.list_for_consumer("snapshot", "42")
            assert len(remaining) == 1
            # The surviving row is the midi_map sibling, not our program-number row.
            assert (remaining[0].metadata or {}).get("kind") != "program_number"
            assert remaining[0].source_type == "midi_cc"

    asyncio.run(_run())


def test_get_returns_only_program_number_binding_when_siblings_present(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                legacy_entry_to_create_payload(
                    {"channel": 0, "cc": 7, "action": "load"},
                    snapshot_id=42,
                    legacy_entry_index=0,
                )
            )
            await sync_program_number(authority, 42, 24, snapshot_name="A")
            await session.commit()

            found = await get_program_number_binding(authority, 42)
            assert found is not None
            assert found.source_type == "midi_pc"
            assert (found.metadata or {}).get("kind") == "program_number"

    asyncio.run(_run())


def test_backfill_creates_bindings_for_existing_snapshots(tmp_path):
    """Backfill walks every Snapshot row with a non-null program_number
    and ensures a corresponding canonical binding exists."""
    _init_temp_db(tmp_path)

    async def _run():
        from app.database import Snapshot

        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            session.add(
                Snapshot(name="Has PC", program_number=24, display_order=1)
            )
            session.add(
                Snapshot(name="Also Has PC", program_number=31, display_order=2)
            )
            session.add(
                Snapshot(name="No PC", program_number=None, display_order=3)
            )
            await session.commit()

            authority = MidiBindingAuthority(session)
            result = await backfill_program_number_bindings(authority)
            await session.commit()

            assert result["total"] == 2
            assert result["created"] == 2
            assert result["updated"] == 0
            assert result["skipped"] == 0

            # Re-running is a no-op (everything skipped).
            result_again = await backfill_program_number_bindings(authority)
            await session.commit()
            assert result_again["created"] == 0
            assert result_again["updated"] == 0
            assert result_again["skipped"] == 2

    asyncio.run(_run())


def test_backfill_updates_stale_program_number(tmp_path):
    """When a snapshot's program_number diverges from a stale binding
    (e.g. a row got out of sync because something wrote directly to the
    snapshots table), backfill converges it."""
    _init_temp_db(tmp_path)

    async def _run():
        from app.database import Snapshot

        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            snap = Snapshot(name="Drift", program_number=24, display_order=1)
            session.add(snap)
            await session.flush()
            snap_id = int(snap.id)
            await sync_program_number(authority, snap_id, 24, snapshot_name="Drift")
            # Mutate the snapshot's program_number behind the projection's back.
            snap.program_number = 99
            await session.commit()

            result = await backfill_program_number_bindings(authority)
            await session.commit()

            assert result["updated"] == 1
            current = await get_program_number_binding(authority, snap_id)
            assert current is not None
            assert (current.source_descriptor or {}).get("program_number") == 99

    asyncio.run(_run())

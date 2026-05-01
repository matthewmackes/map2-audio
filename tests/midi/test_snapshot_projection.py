"""T2482-P2.3 part 1: snapshot projection round-trip tests.

Verifies the legacy-entry → MidiBinding → legacy-entry round-trip is
lossless for every entry shape we expect to see in the wild.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app import database as database_module
from app.services.midi import MidiBindingAuthority, MidiBindingCreate, MidiBindingRead
from app.services.midi.projections.snapshot import (
    binding_to_legacy_entry,
    legacy_entry_to_create_payload,
    list_snapshot_midi_map_entries,
)


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'snapshot-projection.db'}")


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


# ---------- Pure-function round-trip tests ----------


def _assert_round_trip(legacy_entry: dict, *, snapshot_id: int = 42) -> None:
    """legacy → create payload → fake binding → legacy. Every recognized
    field survives the trip; extras are preserved in metadata.extra."""
    payload = legacy_entry_to_create_payload(
        legacy_entry, snapshot_id=snapshot_id, legacy_entry_index=0
    )
    # Build a synthetic binding read from the payload (mimics what the
    # authority would emit after persisting).
    fake_binding = MidiBindingRead(
        binding_id="11111111-2222-3333-4444-555555555555",
        consumer_type=payload.consumer_type,
        consumer_id=payload.consumer_id,
        consumer_label=payload.consumer_label,
        source_type=payload.source_type,
        source_descriptor=payload.source_descriptor,
        target_type=payload.target_type,
        target_descriptor=payload.target_descriptor,
        device_id=payload.device_id,
        scope=payload.scope,
        scope_id=payload.scope_id,
        enabled=payload.enabled,
        created_at=datetime.now(timezone.utc),
        created_by=payload.created_by,
        modified_at=datetime.now(timezone.utc),
        modified_by=payload.created_by,
        source=payload.source,
        metadata=payload.metadata,
    )
    recovered = binding_to_legacy_entry(fake_binding)
    for key, value in legacy_entry.items():
        assert recovered.get(key) == value, (
            f"round-trip lost key '{key}': original={value!r} recovered={recovered.get(key)!r}"
        )


def test_round_trip_cc_with_action():
    _assert_round_trip(
        {
            "channel": 0,
            "cc": 7,
            "action": "ab-toggle",
        }
    )


def test_round_trip_pc_load():
    _assert_round_trip(
        {
            "channel": 1,
            "program_number": 12,
            "action": "load",
        }
    )


def test_round_trip_note_with_curve():
    _assert_round_trip(
        {
            "channel": 0,
            "note": 60,
            "action": "morph",
            "curve": "exponential",
        }
    )


def test_round_trip_with_min_max_clamping():
    _assert_round_trip(
        {
            "channel": 0,
            "cc": 11,
            "action": "morph",
            "curve": "linear",
            "min": 0,
            "max": 127,
        }
    )


def test_round_trip_preserves_unknown_fields_via_metadata():
    """Any field the canonical schema doesn't recognize must round-trip
    verbatim through metadata.extra."""
    entry = {
        "channel": 0,
        "cc": 7,
        "action": "ab-toggle",
        "expression_curve": "s_curve",
        "vendor_field": "some_value",
        "nested_thing": {"inner": "value"},
    }
    payload = legacy_entry_to_create_payload(
        entry, snapshot_id=42, legacy_entry_index=0
    )
    assert "extra" in payload.metadata
    assert payload.metadata["extra"]["expression_curve"] == "s_curve"
    assert payload.metadata["extra"]["vendor_field"] == "some_value"
    assert payload.metadata["extra"]["nested_thing"] == {"inner": "value"}
    _assert_round_trip(entry)


def test_payload_provenance_fields():
    payload = legacy_entry_to_create_payload(
        {"channel": 0, "cc": 7, "action": "ab-toggle"},
        snapshot_id=42,
        legacy_entry_index=3,
    )
    assert payload.consumer_type == "snapshot"
    assert payload.consumer_id == "42"
    assert payload.scope == "snapshot"
    assert payload.scope_id == "42"
    assert payload.created_by == "phase2-migration"
    assert payload.source == "legacy-migration"
    assert payload.metadata["legacy_table"] == "snapshot_midi_maps"
    assert payload.metadata["legacy_entry_index"] == 3


def test_source_type_inferred_from_program_number():
    payload = legacy_entry_to_create_payload(
        {"channel": 0, "program_number": 5, "action": "load"},
        snapshot_id=1,
        legacy_entry_index=0,
    )
    assert payload.source_type == "midi_pc"
    assert payload.source_descriptor["program_number"] == 5


def test_source_type_inferred_from_cc():
    payload = legacy_entry_to_create_payload(
        {"channel": 0, "cc": 64, "action": "morph"},
        snapshot_id=1,
        legacy_entry_index=0,
    )
    assert payload.source_type == "midi_cc"


def test_source_type_inferred_from_note():
    payload = legacy_entry_to_create_payload(
        {"channel": 0, "note": 60, "action": "ab-toggle"},
        snapshot_id=1,
        legacy_entry_index=0,
    )
    assert payload.source_type == "midi_note"


def test_explicit_source_type_overrides_inference():
    payload = legacy_entry_to_create_payload(
        {"channel": 0, "cc": 7, "action": "ab-toggle", "source_type": "midi_aftertouch"},
        snapshot_id=1,
        legacy_entry_index=0,
    )
    assert payload.source_type == "midi_aftertouch"


def test_consumer_label_includes_action_and_snapshot_id():
    payload = legacy_entry_to_create_payload(
        {"channel": 0, "cc": 7, "action": "ab-toggle"},
        snapshot_id=42,
        legacy_entry_index=0,
    )
    assert "ab-toggle" in payload.consumer_label
    assert "42" in payload.consumer_label


# ---------- DB-backed read-side projection tests ----------


def test_list_snapshot_midi_map_entries_returns_in_legacy_index_order(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            # Insert in REVERSE order; expect read-back in legacy order.
            await authority.create(
                legacy_entry_to_create_payload(
                    {"channel": 0, "cc": 1, "action": "second"},
                    snapshot_id=42,
                    legacy_entry_index=1,
                )
            )
            await authority.create(
                legacy_entry_to_create_payload(
                    {"channel": 0, "cc": 0, "action": "first"},
                    snapshot_id=42,
                    legacy_entry_index=0,
                )
            )
            await session.commit()
            entries = await list_snapshot_midi_map_entries(authority, 42)
            assert len(entries) == 2
            assert entries[0]["action"] == "first"
            assert entries[1]["action"] == "second"

    asyncio.run(_run())


def test_list_snapshot_midi_map_entries_filters_by_snapshot_id(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(
                legacy_entry_to_create_payload(
                    {"channel": 0, "cc": 7, "action": "for-42"},
                    snapshot_id=42,
                    legacy_entry_index=0,
                )
            )
            await authority.create(
                legacy_entry_to_create_payload(
                    {"channel": 0, "cc": 7, "action": "for-99"},
                    snapshot_id=99,
                    legacy_entry_index=0,
                )
            )
            await session.commit()
            entries_42 = await list_snapshot_midi_map_entries(authority, 42)
            entries_99 = await list_snapshot_midi_map_entries(authority, 99)
            assert len(entries_42) == 1
            assert len(entries_99) == 1
            assert entries_42[0]["action"] == "for-42"
            assert entries_99[0]["action"] == "for-99"

    asyncio.run(_run())


def test_list_snapshot_midi_map_entries_returns_empty_for_unknown(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            entries = await list_snapshot_midi_map_entries(authority, 999)
            assert entries == []

    asyncio.run(_run())


# ---------- Write-side projection tests (P2.3 part 2) ----------


def test_replace_snapshot_midi_map_entries_full_replace(tmp_path):
    _init_temp_db(tmp_path)

    from app.services.midi.projections.snapshot import (
        replace_snapshot_midi_map_entries,
    )

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            # Initial set
            await replace_snapshot_midi_map_entries(
                authority,
                42,
                [
                    {"channel": 0, "cc": 7, "action": "ab-toggle"},
                    {"channel": 0, "cc": 8, "action": "morph"},
                ],
            )
            await session.commit()
            # Replace with a different set; full replace, not merge.
            recovered = await replace_snapshot_midi_map_entries(
                authority,
                42,
                [{"channel": 1, "program_number": 5, "action": "load"}],
                modified_by="operator",
            )
            await session.commit()
            assert len(recovered) == 1
            assert recovered[0]["action"] == "load"
            assert recovered[0]["program_number"] == 5
            # Verify the old entries are GONE.
            from sqlalchemy import select, func
            from app.services.midi.models import MidiBinding
            n = await session.scalar(
                select(func.count(MidiBinding.binding_id)).where(
                    MidiBinding.consumer_id == "42"
                )
            )
            assert n == 1

    asyncio.run(_run())


def test_replace_with_empty_list_clears_all_entries(tmp_path):
    _init_temp_db(tmp_path)

    from app.services.midi.projections.snapshot import (
        replace_snapshot_midi_map_entries,
    )

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await replace_snapshot_midi_map_entries(
                authority,
                42,
                [{"channel": 0, "cc": 7, "action": "ab-toggle"}],
            )
            await session.commit()
            await replace_snapshot_midi_map_entries(authority, 42, [])
            await session.commit()
            recovered = await list_snapshot_midi_map_entries(authority, 42)
            assert recovered == []

    asyncio.run(_run())


def test_replace_does_not_touch_other_snapshots(tmp_path):
    _init_temp_db(tmp_path)

    from app.services.midi.projections.snapshot import (
        replace_snapshot_midi_map_entries,
    )

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await replace_snapshot_midi_map_entries(
                authority, 42, [{"channel": 0, "cc": 7, "action": "for-42"}]
            )
            await replace_snapshot_midi_map_entries(
                authority, 99, [{"channel": 0, "cc": 7, "action": "for-99"}]
            )
            await session.commit()
            await replace_snapshot_midi_map_entries(authority, 42, [])
            await session.commit()
            entries_42 = await list_snapshot_midi_map_entries(authority, 42)
            entries_99 = await list_snapshot_midi_map_entries(authority, 99)
            assert entries_42 == []
            assert len(entries_99) == 1

    asyncio.run(_run())


# ---------- Migration script tests (P2.3 part 2) ----------


def test_migration_script_walks_snapshot_midi_maps_table(tmp_path):
    """Seed two snapshots with legacy entries via raw SQL (avoids
    SQLAlchemy ORM lazy-load greenlet issues that fire on the
    Snapshot model's many relationship backrefs)."""
    _init_temp_db(tmp_path)

    from sqlalchemy import text
    from app.services.midi.projections.snapshot import (
        migrate_snapshot_midi_maps_table,
    )

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            await session.execute(
                text("INSERT INTO snapshots (name, version) VALUES ('One', 1), ('Two', 1)")
            )
            await session.execute(
                text(
                    "INSERT INTO snapshot_midi_maps (snapshot_id, entries) "
                    "VALUES (1, :entries1), (2, :entries2)"
                ),
                {
                    "entries1": (
                        '[{"channel":0,"cc":7,"action":"ab-toggle"},'
                        '{"channel":1,"program_number":5,"action":"load"}]'
                    ),
                    "entries2": '[{"channel":0,"cc":11,"action":"morph"}]',
                },
            )
            await session.commit()

            authority = MidiBindingAuthority(session)
            stats = await migrate_snapshot_midi_maps_table(authority)
            await session.commit()

            assert stats["snapshots_migrated"] == 2
            assert stats["entries_migrated"] == 3
            assert stats["snapshots_skipped"] == 0

            entries_1 = await list_snapshot_midi_map_entries(authority, 1)
            entries_2 = await list_snapshot_midi_map_entries(authority, 2)
            assert len(entries_1) == 2
            assert len(entries_2) == 1
            assert entries_1[0]["action"] == "ab-toggle"
            assert entries_1[1]["action"] == "load"
            assert entries_2[0]["action"] == "morph"

    asyncio.run(_run())


def test_migration_script_is_idempotent(tmp_path):
    _init_temp_db(tmp_path)

    from sqlalchemy import text
    from app.services.midi.projections.snapshot import (
        migrate_snapshot_midi_maps_table,
    )

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            await session.execute(text("INSERT INTO snapshots (name, version) VALUES ('One', 1)"))
            await session.execute(
                text(
                    "INSERT INTO snapshot_midi_maps (snapshot_id, entries) "
                    "VALUES (1, :entries)"
                ),
                {"entries": '[{"channel":0,"cc":7,"action":"ab-toggle"}]'},
            )
            await session.commit()

            authority = MidiBindingAuthority(session)
            first = await migrate_snapshot_midi_maps_table(authority)
            await session.commit()
            second = await migrate_snapshot_midi_maps_table(authority)
            await session.commit()

            assert first["snapshots_migrated"] == 1
            assert first["snapshots_skipped"] == 0
            # Second run: snapshot already has migrated bindings, skip it.
            assert second["snapshots_migrated"] == 0
            assert second["snapshots_skipped"] == 1
            # Total binding count stays 1 (no duplicates created).
            assert await authority.count() == 1

    asyncio.run(_run())


def test_migration_skips_empty_entry_lists(tmp_path):
    _init_temp_db(tmp_path)

    from sqlalchemy import text
    from app.services.midi.projections.snapshot import (
        migrate_snapshot_midi_maps_table,
    )

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            await session.execute(text("INSERT INTO snapshots (name, version) VALUES ('Empty', 1)"))
            await session.execute(
                text(
                    "INSERT INTO snapshot_midi_maps (snapshot_id, entries) "
                    "VALUES (1, :entries)"
                ),
                {"entries": "[]"},
            )
            await session.commit()

            authority = MidiBindingAuthority(session)
            stats = await migrate_snapshot_midi_maps_table(authority)
            await session.commit()
            assert stats["snapshots_migrated"] == 0
            assert stats["entries_migrated"] == 0
            assert await authority.count() == 0

    asyncio.run(_run())


def test_full_round_trip_through_db(tmp_path):
    _init_temp_db(tmp_path)

    legacy_entries = [
        {"channel": 0, "cc": 7, "action": "ab-toggle"},
        {"channel": 1, "program_number": 5, "action": "load"},
        {"channel": 0, "note": 60, "action": "morph", "curve": "exponential"},
        {
            "channel": 0,
            "cc": 11,
            "action": "morph",
            "expression_curve": "s_curve",
            "vendor_field": "x",
        },
    ]

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            for i, entry in enumerate(legacy_entries):
                await authority.create(
                    legacy_entry_to_create_payload(
                        entry, snapshot_id=42, legacy_entry_index=i
                    )
                )
            await session.commit()
            recovered = await list_snapshot_midi_map_entries(authority, 42)
            assert len(recovered) == len(legacy_entries)
            for original, got in zip(legacy_entries, recovered):
                for key, value in original.items():
                    assert got.get(key) == value, (
                        f"round-trip lost key '{key}' in entry {original!r}: "
                        f"got {got.get(key)!r}"
                    )

    asyncio.run(_run())

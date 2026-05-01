"""T2482-P2.1: tests for the canonical MidiBinding table schema + migration.

Verifies the migration creates the table cleanly on a fresh DB,
the indexes are in place, and the ORM model round-trips a row.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import text

from app import database as database_module


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'midi-binding-schema.db'}")


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def test_migration_creates_midi_bindings_table(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session(read_only=True) as session:
            result = await session.execute(
                text(
                    "SELECT name FROM sqlite_master "
                    "WHERE type='table' AND name='midi_bindings'"
                )
            )
            assert result.fetchone() is not None, "midi_bindings table not created"

    asyncio.run(_run())


def test_table_has_expected_columns(tmp_path):
    _init_temp_db(tmp_path)

    expected = {
        "binding_id",
        "consumer_type",
        "consumer_id",
        "consumer_label",
        "source_type",
        "source_descriptor",
        "target_type",
        "target_descriptor",
        "device_id",
        "scope",
        "scope_id",
        "enabled",
        "created_at",
        "created_by",
        "modified_at",
        "modified_by",
        "source",
        "metadata",
    }

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session(read_only=True) as session:
            result = await session.execute(text("PRAGMA table_info(midi_bindings)"))
            cols = {row[1] for row in result.fetchall()}
            missing = expected - cols
            assert not missing, f"missing columns: {missing}"

    asyncio.run(_run())


def test_table_has_expected_indexes(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session(read_only=True) as session:
            result = await session.execute(
                text(
                    "SELECT name FROM sqlite_master "
                    "WHERE type='index' AND tbl_name='midi_bindings' AND name LIKE 'ix_%'"
                )
            )
            idx_names = {row[0] for row in result.fetchall()}
            assert "ix_midi_bindings_consumer" in idx_names
            assert "ix_midi_bindings_device_enabled" in idx_names
            assert "ix_midi_bindings_scope" in idx_names

    asyncio.run(_run())


def test_orm_model_round_trips_a_row(tmp_path):
    _init_temp_db(tmp_path)

    from app.services.midi.models import MidiBinding

    async def _run():
        await database_module._ensure_tables_created()
        binding_id = "11111111-2222-3333-4444-555555555555"
        async with database_module.get_session() as session:
            session.add(
                MidiBinding(
                    binding_id=binding_id,
                    consumer_type="snapshot",
                    consumer_id="42",
                    consumer_label="A/B switch",
                    source_type="midi_cc",
                    source_descriptor={"channel": 0, "cc": 7},
                    target_type="snapshot_action",
                    target_descriptor={"action": "ab-toggle"},
                    device_id=None,
                    scope="snapshot",
                    scope_id="42",
                    enabled=True,
                    created_by="phase2-test",
                    modified_by="phase2-test",
                    source="phase2-test",
                    metadata_json={"test": True},
                )
            )
            await session.commit()
        async with database_module.get_session(read_only=True) as session:
            from sqlalchemy import select

            row = await session.scalar(
                select(MidiBinding).where(MidiBinding.binding_id == binding_id)
            )
            assert row is not None
            assert row.consumer_type == "snapshot"
            assert row.consumer_id == "42"
            assert row.source_descriptor == {"channel": 0, "cc": 7}
            assert row.target_descriptor == {"action": "ab-toggle"}
            assert row.scope == "snapshot"
            assert row.scope_id == "42"
            assert row.enabled is True
            assert row.created_by == "phase2-test"
            assert row.metadata_json == {"test": True}

    asyncio.run(_run())


def test_pydantic_schemas_are_importable_and_validate():
    """Independent of DB state — sanity-check the schema module."""
    from app.services.midi.schemas import (
        BindingConsumerType,
        BindingScope,
        BindingSourceType,
        BindingTargetType,
        MidiBindingCreate,
        MidiBindingRead,
        MidiBindingUpdate,
    )

    payload = MidiBindingCreate(
        consumer_type="snapshot",
        consumer_id="42",
        source_type="midi_cc",
        source_descriptor={"channel": 0, "cc": 7},
        target_type="snapshot_action",
        target_descriptor={"action": "ab-toggle"},
    )
    assert payload.scope == "global"
    assert payload.enabled is True
    assert payload.created_by == "unknown"

    update = MidiBindingUpdate(enabled=False, modified_by="operator")
    assert update.enabled is False

    # Round-trip a Read shape from a dict.
    read = MidiBindingRead(
        binding_id="11111111-2222-3333-4444-555555555555",
        consumer_type="snapshot",
        consumer_id="42",
        source_type="midi_cc",
        source_descriptor={"channel": 0, "cc": 7},
        target_type="snapshot_action",
        target_descriptor={"action": "ab-toggle"},
        created_at=datetime.now(timezone.utc),
        modified_at=datetime.now(timezone.utc),
        created_by="phase2-test",
        modified_by="phase2-test",
    )
    assert read.binding_id.endswith("5")


def test_schema_rejects_invalid_consumer_type():
    """The Pydantic Literal must reject unknown consumer types."""
    from pydantic import ValidationError
    from app.services.midi.schemas import MidiBindingCreate

    with pytest.raises(ValidationError):
        MidiBindingCreate(
            consumer_type="not_a_real_type",  # type: ignore[arg-type]
            consumer_id="42",
            source_type="midi_cc",
            target_type="snapshot_action",
        )


def test_schema_rejects_extra_fields():
    """extra='forbid' protects the wire format from typos."""
    from pydantic import ValidationError
    from app.services.midi.schemas import MidiBindingCreate

    with pytest.raises(ValidationError):
        MidiBindingCreate(
            consumer_type="snapshot",
            consumer_id="42",
            source_type="midi_cc",
            target_type="snapshot_action",
            unknown_field="hello",  # type: ignore[call-arg]
        )

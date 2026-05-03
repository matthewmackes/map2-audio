"""T2482-P2.4: Sequencer consumer projection tests.

Verifies the T2480-5 MidiDeviceBinding shape round-trips through the
canonical MidiBinding store losslessly, and that the
write-side replace-by-(consumer_type, source) semantics match the
T2480-5 add_binding contract.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app import database as database_module
from app.services.midi import MidiBindingAuthority, MidiBindingCreate
from app.services.midi.projections.sequencer import (
    binding_to_legacy_device_binding,
    device_binding_to_create_payload,
    list_brain_device_bindings,
    remove_brain_device_binding,
    write_brain_device_binding,
)


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'brain-projection.db'}")


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


# ---------- Pure conversion tests ----------


def test_payload_for_snapshot_consumer_uses_pc_source_and_snapshot_target():
    payload = device_binding_to_create_payload(
        device_id="kbd:abc",
        consumer_type="snapshot",
        consumer_id="42",
        consumer_name="Sequencer — KBD (set up 2026-04-30)",
        source="brain-setup-task",
    )
    assert payload.consumer_type == "snapshot"
    assert payload.consumer_id == "42"
    assert payload.device_id == "kbd:abc"
    assert payload.scope == "global"
    assert payload.source_type == "midi_pc"
    assert payload.target_type == "snapshot_action"
    assert payload.target_descriptor == {"action": "activate", "snapshot_id": "42"}
    assert payload.source == "brain-setup-task"
    assert payload.metadata["legacy_kind"] == "midi_device_binding"
    assert payload.metadata["legacy_consumer_name"] == "Sequencer — KBD (set up 2026-04-30)"


def test_payload_for_unknown_consumer_uses_empty_descriptors():
    payload = device_binding_to_create_payload(
        device_id="kbd:abc",
        consumer_type="performance_preset",
        consumer_id="preset-12",
        consumer_name="Live Set",
        source="manual",
    )
    assert payload.consumer_type == "performance_preset"
    assert payload.source_descriptor == {}
    assert payload.target_descriptor == {}


def test_round_trip_via_synthetic_binding_read():
    from datetime import datetime, timezone
    from app.services.midi.schemas import MidiBindingRead

    payload = device_binding_to_create_payload(
        device_id="kbd:abc",
        consumer_type="snapshot",
        consumer_id="42",
        consumer_name="Sequencer — KBD",
        source="brain-setup-task",
    )
    fake = MidiBindingRead(
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
        modified_at=datetime.now(timezone.utc),
        created_by=payload.created_by,
        modified_by=payload.created_by,
        source=payload.source,
        metadata=payload.metadata,
    )
    legacy = binding_to_legacy_device_binding(fake)
    assert legacy["consumer_type"] == "snapshot"
    assert legacy["consumer_id"] == "42"
    assert legacy["consumer_name"] == "Sequencer — KBD"
    assert legacy["source"] == "brain-setup-task"
    assert isinstance(legacy["bound_at"], str)


# ---------- DB-backed write/read tests ----------


def test_write_creates_binding_with_correct_provenance(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            created = await write_brain_device_binding(
                authority,
                device_id="kbd:abc",
                consumer_type="snapshot",
                consumer_id="42",
                consumer_name="Sequencer — KBD",
                source="brain-setup-task",
            )
            await session.commit()
            assert created.consumer_type == "snapshot"
            assert created.consumer_id == "42"
            assert created.device_id == "kbd:abc"
            assert created.source == "brain-setup-task"

    asyncio.run(_run())


def test_write_replaces_by_consumer_type_and_source(tmp_path):
    """T2480-5 contract: re-binding the same device with the same
    (consumer_type, source) replaces rather than appends."""
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await write_brain_device_binding(
                authority,
                device_id="kbd:abc",
                consumer_type="snapshot",
                consumer_id="42",
                consumer_name="A",
                source="brain-setup-task",
            )
            await write_brain_device_binding(
                authority,
                device_id="kbd:abc",
                consumer_type="snapshot",
                consumer_id="99",
                consumer_name="B",
                source="brain-setup-task",
            )
            await session.commit()
            bindings = await list_brain_device_bindings(authority, "kbd:abc")
            assert len(bindings) == 1
            assert bindings[0]["consumer_id"] == "99"
            assert bindings[0]["consumer_name"] == "B"

    asyncio.run(_run())


def test_write_keeps_distinct_sources(tmp_path):
    """Same device with the same consumer_type but different sources
    coexist (e.g., one binding from brain-setup-task + one manual)."""
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await write_brain_device_binding(
                authority,
                device_id="kbd:abc",
                consumer_type="snapshot",
                consumer_id="42",
                consumer_name="A",
                source="brain-setup-task",
            )
            await write_brain_device_binding(
                authority,
                device_id="kbd:abc",
                consumer_type="snapshot",
                consumer_id="99",
                consumer_name="B",
                source="manual",
            )
            await session.commit()
            bindings = await list_brain_device_bindings(authority, "kbd:abc")
            assert len(bindings) == 2
            consumer_ids = {b["consumer_id"] for b in bindings}
            assert consumer_ids == {"42", "99"}
            sources = {b["source"] for b in bindings}
            assert sources == {"brain-setup-task", "manual"}

    asyncio.run(_run())


def test_remove_deletes_binding(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await write_brain_device_binding(
                authority,
                device_id="kbd:abc",
                consumer_type="snapshot",
                consumer_id="42",
                consumer_name="A",
            )
            await session.commit()
            removed = await remove_brain_device_binding(
                authority,
                device_id="kbd:abc",
                consumer_type="snapshot",
                consumer_id="42",
            )
            await session.commit()
            assert removed is True
            assert await list_brain_device_bindings(authority, "kbd:abc") == []

    asyncio.run(_run())


def test_remove_returns_false_when_not_present(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            removed = await remove_brain_device_binding(
                authority,
                device_id="kbd:nope",
                consumer_type="snapshot",
                consumer_id="42",
            )
            assert removed is False

    asyncio.run(_run())


def test_list_filters_by_device(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await write_brain_device_binding(
                authority,
                device_id="kbd:1",
                consumer_type="snapshot",
                consumer_id="42",
                consumer_name="A",
            )
            await write_brain_device_binding(
                authority,
                device_id="kbd:2",
                consumer_type="snapshot",
                consumer_id="99",
                consumer_name="B",
            )
            await session.commit()
            for_kbd1 = await list_brain_device_bindings(authority, "kbd:1")
            for_kbd2 = await list_brain_device_bindings(authority, "kbd:2")
            assert len(for_kbd1) == 1
            assert len(for_kbd2) == 1
            assert for_kbd1[0]["consumer_id"] == "42"
            assert for_kbd2[0]["consumer_id"] == "99"

    asyncio.run(_run())

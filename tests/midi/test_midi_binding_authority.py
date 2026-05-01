"""T2482-P2.2: MidiBindingAuthority service tests.

Covers create / get / list_for_consumer / list_for_device / list_in_scope /
update / disable / enable / delete / delete_for_consumer / count.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app import database as database_module
from app.services.midi import (
    MidiBindingAuthority,
    MidiBindingCreate,
    MidiBindingNotFound,
    MidiBindingUpdate,
)


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'midi-binding-authority.db'}")


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def _snapshot_payload(consumer_id: str, **overrides) -> MidiBindingCreate:
    base = dict(
        consumer_type="snapshot",
        consumer_id=consumer_id,
        consumer_label=f"snapshot-{consumer_id}",
        source_type="midi_cc",
        source_descriptor={"channel": 0, "cc": 7},
        target_type="snapshot_action",
        target_descriptor={"action": "ab-toggle"},
        scope="snapshot",
        scope_id=consumer_id,
        created_by="phase2-test",
        source="phase2-test",
    )
    base.update(overrides)
    return MidiBindingCreate(**base)


def test_create_assigns_uuid_and_timestamps(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            created = await authority.create(_snapshot_payload("42"))
            await session.commit()
            assert len(created.binding_id) == 36
            assert created.binding_id.count("-") == 4
            assert created.consumer_type == "snapshot"
            assert created.consumer_id == "42"
            assert created.created_by == "phase2-test"
            assert created.modified_by == "phase2-test"
            assert created.created_at is not None
            assert created.modified_at is not None

    asyncio.run(_run())


def test_get_returns_created_row(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            created = await authority.create(_snapshot_payload("42"))
            await session.commit()
            fetched = await authority.get(created.binding_id)
            assert fetched.binding_id == created.binding_id
            assert fetched.source_descriptor == {"channel": 0, "cc": 7}

    asyncio.run(_run())


def test_get_unknown_raises_not_found(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            with pytest.raises(MidiBindingNotFound):
                await authority.get("00000000-0000-0000-0000-000000000000")

    asyncio.run(_run())


def test_list_for_consumer_filters_correctly(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(_snapshot_payload("42"))
            await authority.create(_snapshot_payload("99"))
            await authority.create(
                _snapshot_payload(
                    "42",
                    source_descriptor={"channel": 1, "cc": 1},
                    target_descriptor={"action": "morph"},
                )
            )
            await session.commit()
            for_42 = await authority.list_for_consumer("snapshot", "42")
            for_99 = await authority.list_for_consumer("snapshot", "99")
            assert len(for_42) == 2
            assert len(for_99) == 1
            assert all(b.consumer_id == "42" for b in for_42)

    asyncio.run(_run())


def test_list_for_device_filters_correctly(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(_snapshot_payload("42", device_id="kbd:1"))
            await authority.create(_snapshot_payload("99", device_id="kbd:2"))
            await authority.create(_snapshot_payload("100", device_id="kbd:1"))
            await session.commit()
            for_kbd1 = await authority.list_for_device("kbd:1")
            for_kbd2 = await authority.list_for_device("kbd:2")
            assert len(for_kbd1) == 2
            assert len(for_kbd2) == 1

    asyncio.run(_run())


def test_list_for_device_enabled_only(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            a = await authority.create(_snapshot_payload("42", device_id="kbd:1"))
            await authority.create(_snapshot_payload("99", device_id="kbd:1", enabled=False))
            await session.commit()
            enabled = await authority.list_for_device("kbd:1", enabled_only=True)
            both = await authority.list_for_device("kbd:1", enabled_only=False)
            assert len(enabled) == 1
            assert enabled[0].binding_id == a.binding_id
            assert len(both) == 2

    asyncio.run(_run())


def test_list_in_scope_global_vs_snapshot(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(_snapshot_payload("42"))  # scope="snapshot", scope_id="42"
            await authority.create(
                MidiBindingCreate(
                    consumer_type="transport",
                    consumer_id="clock",
                    source_type="midi_clock",
                    target_type="engine_command",
                    scope="global",
                    created_by="phase2-test",
                )
            )
            await session.commit()
            in_snapshot = await authority.list_in_scope("snapshot", "42")
            in_global = await authority.list_in_scope("global", None)
            assert len(in_snapshot) == 1
            assert len(in_global) == 1
            assert in_snapshot[0].consumer_id == "42"
            assert in_global[0].consumer_id == "clock"

    asyncio.run(_run())


def test_update_modifies_fields_and_bumps_modified_by(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            created = await authority.create(_snapshot_payload("42"))
            await session.commit()
            updated = await authority.update(
                created.binding_id,
                MidiBindingUpdate(
                    consumer_label="renamed",
                    enabled=False,
                    modified_by="operator",
                ),
            )
            await session.commit()
            assert updated.consumer_label == "renamed"
            assert updated.enabled is False
            assert updated.modified_by == "operator"

    asyncio.run(_run())


def test_disable_and_enable_roundtrip(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            created = await authority.create(_snapshot_payload("42"))
            await session.commit()
            disabled = await authority.disable(created.binding_id, modified_by="op")
            assert disabled.enabled is False
            enabled = await authority.enable(created.binding_id, modified_by="op")
            assert enabled.enabled is True

    asyncio.run(_run())


def test_delete_removes_row(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            created = await authority.create(_snapshot_payload("42"))
            await session.commit()
            assert await authority.delete(created.binding_id) is True
            await session.commit()
            with pytest.raises(MidiBindingNotFound):
                await authority.get(created.binding_id)

    asyncio.run(_run())


def test_delete_returns_false_when_unknown(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            assert await authority.delete("00000000-0000-0000-0000-000000000000") is False

    asyncio.run(_run())


def test_delete_for_consumer_bulk(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            await authority.create(_snapshot_payload("42"))
            await authority.create(_snapshot_payload("42"))
            await authority.create(_snapshot_payload("99"))
            await session.commit()
            n = await authority.delete_for_consumer("snapshot", "42")
            await session.commit()
            assert n == 2
            remaining = await authority.list_for_consumer("snapshot", "99")
            assert len(remaining) == 1

    asyncio.run(_run())


def test_count(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            assert await authority.count() == 0
            await authority.create(_snapshot_payload("1"))
            await authority.create(_snapshot_payload("2"))
            await authority.create(_snapshot_payload("3"))
            await session.commit()
            assert await authority.count() == 3

    asyncio.run(_run())


def test_create_many_bulk_insert(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = MidiBindingAuthority(session)
            payloads = [_snapshot_payload(str(i)) for i in range(5)]
            results = await authority.create_many(payloads)
            await session.commit()
            assert len(results) == 5
            assert len({r.binding_id for r in results}) == 5  # all unique
            assert await authority.count() == 5

    asyncio.run(_run())

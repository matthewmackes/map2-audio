"""T2490-2: AvbBindingAuthority service tests.

Mirrors `tests/midi/test_midi_binding_authority.py` so the four-services
discipline applies the same coverage to AVB. Covers create / get /
list_for_consumer / list_for_stream / list_for_cluster_pair /
list_in_scope / update / disable / enable / delete /
delete_for_consumer / count.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app import database as database_module
from app.services.avb import (
    AvbBindingAuthority,
    AvbBindingCreate,
    AvbBindingNotFound,
    AvbBindingUpdate,
)


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(
        f"sqlite+aiosqlite:///{tmp_path / 'avb-binding-authority.db'}"
    )


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def _stream_payload(consumer_id: str, **overrides) -> AvbBindingCreate:
    base = dict(
        consumer_type="avdecc_stream",
        consumer_id=consumer_id,
        consumer_label=f"avb-stream-{consumer_id}",
        source_type="avdecc_talker",
        source_descriptor={
            "talker_entity_id": "0x91E0F000FE000001",
            "talker_unique_id": 0,
        },
        target_type="avdecc_listener",
        target_descriptor={
            "listener_entity_id": "0x91E0F000FE000002",
            "listener_unique_id": 0,
        },
        stream_id="91E0F000FE0000010000",
        stream_format="iec-61883-6/AM824/8ch/48k",
        srp_class="A",
        scope="global",
        created_by="t2490-test",
        source="t2490-test",
    )
    base.update(overrides)
    return AvbBindingCreate(**base)


def test_create_assigns_uuid_and_timestamps(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            created = await authority.create(_stream_payload("stream-1"))
            await session.commit()
            assert len(created.binding_id) == 36
            assert created.binding_id.count("-") == 4
            assert created.consumer_type == "avdecc_stream"
            assert created.consumer_id == "stream-1"
            assert created.created_by == "t2490-test"
            assert created.modified_by == "t2490-test"
            assert created.created_at is not None
            assert created.modified_at is not None
            assert created.stream_id == "91E0F000FE0000010000"
            assert created.srp_class == "A"

    asyncio.run(_run())


def test_get_returns_created_row(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            created = await authority.create(_stream_payload("stream-1"))
            await session.commit()
            fetched = await authority.get(created.binding_id)
            assert fetched.binding_id == created.binding_id
            assert fetched.source_descriptor["talker_unique_id"] == 0

    asyncio.run(_run())


def test_get_unknown_raises_not_found(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            with pytest.raises(AvbBindingNotFound):
                await authority.get("00000000-0000-0000-0000-000000000000")

    asyncio.run(_run())


def test_list_for_consumer_filters_correctly(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            await authority.create(_stream_payload("stream-1"))
            await authority.create(_stream_payload("stream-2"))
            await authority.create(
                _stream_payload(
                    "stream-1",
                    stream_id="91E0F000FE000001AAAA",
                )
            )
            await session.commit()
            for_one = await authority.list_for_consumer("avdecc_stream", "stream-1")
            for_two = await authority.list_for_consumer("avdecc_stream", "stream-2")
            assert len(for_one) == 2
            assert len(for_two) == 1
            assert all(b.consumer_id == "stream-1" for b in for_one)

    asyncio.run(_run())


def test_list_for_stream_returns_only_matching_stream(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            await authority.create(_stream_payload("a", stream_id="aaa1"))
            await authority.create(_stream_payload("b", stream_id="aaa1"))
            await authority.create(_stream_payload("c", stream_id="bbb2"))
            await session.commit()
            matches = await authority.list_for_stream("aaa1")
            assert len(matches) == 2
            assert {m.consumer_id for m in matches} == {"a", "b"}

    asyncio.run(_run())


def test_list_for_cluster_pair_filters_by_talker_listener(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            await authority.create(
                _stream_payload(
                    "a",
                    talker_node_id="node-A",
                    listener_node_id="node-B",
                )
            )
            await authority.create(
                _stream_payload(
                    "b",
                    talker_node_id="node-A",
                    listener_node_id="node-C",
                )
            )
            await authority.create(
                _stream_payload(
                    "c",
                    talker_node_id="node-D",
                    listener_node_id="node-B",
                )
            )
            await session.commit()

            from_a = await authority.list_for_cluster_pair("node-A", None)
            into_b = await authority.list_for_cluster_pair(None, "node-B")
            a_to_b = await authority.list_for_cluster_pair("node-A", "node-B")
            assert {b.consumer_id for b in from_a} == {"a", "b"}
            assert {b.consumer_id for b in into_b} == {"a", "c"}
            assert [b.consumer_id for b in a_to_b] == ["a"]

    asyncio.run(_run())


def test_list_in_scope_global_excludes_scoped(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            await authority.create(_stream_payload("g", scope="global"))
            await authority.create(
                _stream_payload("s", scope="snapshot", scope_id="snap-1")
            )
            await session.commit()
            globals_only = await authority.list_in_scope("global", None)
            assert {b.consumer_id for b in globals_only} == {"g"}

    asyncio.run(_run())


def test_update_changes_field_and_bumps_modified_by(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            created = await authority.create(_stream_payload("a"))
            await session.commit()
            patched = await authority.update(
                created.binding_id,
                AvbBindingUpdate(consumer_label="renamed", modified_by="operator"),
            )
            await session.commit()
            assert patched.consumer_label == "renamed"
            assert patched.modified_by == "operator"
            # Other fields preserved.
            assert patched.stream_id == "91E0F000FE0000010000"

    asyncio.run(_run())


def test_disable_then_enable_roundtrip(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            created = await authority.create(_stream_payload("a"))
            await session.commit()
            disabled = await authority.disable(created.binding_id, modified_by="op")
            await session.commit()
            assert disabled.enabled is False
            enabled = await authority.enable(created.binding_id, modified_by="op")
            await session.commit()
            assert enabled.enabled is True

    asyncio.run(_run())


def test_delete_returns_true_then_false(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            created = await authority.create(_stream_payload("a"))
            await session.commit()
            assert await authority.delete(created.binding_id) is True
            await session.commit()
            assert await authority.delete(created.binding_id) is False

    asyncio.run(_run())


def test_delete_for_consumer_removes_all_owned(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            await authority.create(_stream_payload("a"))
            await authority.create(_stream_payload("a"))
            await authority.create(_stream_payload("b"))
            await session.commit()
            removed = await authority.delete_for_consumer("avdecc_stream", "a")
            await session.commit()
            assert removed == 2
            remaining = await authority.list_for_consumer("avdecc_stream", "b")
            assert len(remaining) == 1

    asyncio.run(_run())


def test_count_reflects_inserts(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            assert await authority.count() == 0
            for tag in ("a", "b", "c"):
                await authority.create(_stream_payload(tag))
            await session.commit()
            assert await authority.count() == 3

    asyncio.run(_run())


def test_enabled_only_filter_excludes_disabled_rows(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            keep = await authority.create(_stream_payload("a"))
            drop = await authority.create(_stream_payload("a"))
            await authority.disable(drop.binding_id)
            await session.commit()
            enabled_only = await authority.list_for_consumer(
                "avdecc_stream", "a", enabled_only=True
            )
            assert {b.binding_id for b in enabled_only} == {keep.binding_id}

    asyncio.run(_run())

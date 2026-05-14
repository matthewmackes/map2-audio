"""T2521-3: SonoBusBindingAuthority service tests.

Mirrors `tests/avb/test_avb_binding_authority.py` so the four-services
discipline applies the same coverage. Covers create / get /
list_for_consumer / list_by_kind / list_for_group /
list_for_cluster_pair / list_in_scope / update / disable / enable /
delete / delete_for_consumer / count plus the SonoBus-specific defaults
locked by Q7-Q9, Q14, and Q18.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app import database as database_module
from app.services.sonobus import (
    SonoBusBindingAuthority,
    SonoBusBindingCreate,
    SonoBusBindingNotFound,
    SonoBusBindingUpdate,
)


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(
        f"sqlite+aiosqlite:///{tmp_path / 'sonobus-binding-authority.db'}"
    )


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def _stream_payload(consumer_id: str, **overrides) -> SonoBusBindingCreate:
    base = dict(
        consumer_type="sonobus_stream",
        consumer_id=consumer_id,
        consumer_label=f"sonobus-stream-{consumer_id}",
        binding_kind="stream",
        source_type="aoo_source",
        source_descriptor={
            "aoo_source_id": 1001,
            "channel_count": 2,
            "bind_interface": "eth0",
        },
        target_type="aoo_sink",
        target_descriptor={
            "listener_peer_endpoint": "10.0.0.10:10001",
            "aoo_sink_id": 2002,
        },
        group_id=f"group-{consumer_id}",
        session_label="default session",
        talker_node_id="node-alpha",
        listener_node_id="node-beta",
        scope="global",
        created_by="t2521-test",
        source="t2521-test",
    )
    base.update(overrides)
    return SonoBusBindingCreate(**base)


def _peer_payload(consumer_id: str, **overrides) -> SonoBusBindingCreate:
    base = dict(
        consumer_type="sonobus_peer",
        consumer_id=consumer_id,
        consumer_label=f"peer-{consumer_id}",
        binding_kind="peer",
        source_type="peer_endpoint",
        source_descriptor={"endpoint": "10.0.0.10:10001"},
        target_type="peer_endpoint",
        target_descriptor={"endpoint": "10.0.0.11:10001"},
        listener_capability="map2",
        scope="cluster",
        scope_id="cluster-default",
        created_by="t2521-test",
        source="t2521-test",
    )
    base.update(overrides)
    return SonoBusBindingCreate(**base)


def test_create_assigns_uuid_and_timestamps(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = SonoBusBindingAuthority(session)
            created = await authority.create(_stream_payload("stream-1"))
            await session.commit()
            assert len(created.binding_id) == 36
            assert created.binding_id.count("-") == 4
            assert created.consumer_type == "sonobus_stream"
            assert created.consumer_id == "stream-1"
            assert created.created_by == "t2521-test"
            assert created.modified_by == "t2521-test"
            assert created.created_at is not None
            assert created.modified_at is not None
            assert created.binding_kind == "stream"

    asyncio.run(_run())


def test_create_applies_locked_defaults(tmp_path):
    """Q7/Q8 PCM 24-bit/48 kHz, Q9 jitter buffer 4 ms + burst_loss_only,
    Q14 channel_count=1 default, Q18 transport_priority=avb_preferred."""
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = SonoBusBindingAuthority(session)
            created = await authority.create(_stream_payload("stream-defaults"))
            await session.commit()
            assert created.stream_format == "pcm_s24_48000"
            assert created.codec_profile == "pcm"
            assert created.jitter_buffer_ms == 4
            assert created.resend_policy == "burst_loss_only"
            assert created.latency_target_ms == 8
            assert created.channel_count == 1
            assert created.transport_priority == "avb_preferred"
            assert created.transport_protocol == "udp"
            assert created.listener_capability == "map2"

    asyncio.run(_run())


def test_get_returns_created_row(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = SonoBusBindingAuthority(session)
            created = await authority.create(_stream_payload("stream-1"))
            await session.commit()
            fetched = await authority.get(created.binding_id)
            assert fetched.binding_id == created.binding_id
            assert fetched.source_descriptor["aoo_source_id"] == 1001

    asyncio.run(_run())


def test_get_unknown_raises_not_found(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = SonoBusBindingAuthority(session)
            with pytest.raises(SonoBusBindingNotFound):
                await authority.get("00000000-0000-0000-0000-000000000000")

    asyncio.run(_run())


def test_list_for_consumer_filters_correctly(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = SonoBusBindingAuthority(session)
            await authority.create(_stream_payload("stream-1"))
            await authority.create(_stream_payload("stream-2"))
            await authority.create(_peer_payload("peer-1"))
            await session.commit()
            streams = await authority.list_for_consumer(
                "sonobus_stream", "stream-1"
            )
            assert len(streams) == 1
            assert streams[0].consumer_id == "stream-1"

    asyncio.run(_run())


def test_list_by_kind(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = SonoBusBindingAuthority(session)
            await authority.create(_stream_payload("stream-1"))
            await authority.create(_stream_payload("stream-2"))
            await authority.create(_peer_payload("peer-1"))
            await session.commit()
            streams = await authority.list_by_kind("stream")
            peers = await authority.list_by_kind("peer")
            assert len(streams) == 2
            assert len(peers) == 1
            assert all(b.binding_kind == "stream" for b in streams)
            assert peers[0].binding_kind == "peer"

    asyncio.run(_run())


def test_list_for_group(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = SonoBusBindingAuthority(session)
            await authority.create(_stream_payload("stream-1", group_id="g-1"))
            await authority.create(_stream_payload("stream-2", group_id="g-1"))
            await authority.create(_stream_payload("stream-3", group_id="g-2"))
            await session.commit()
            in_g1 = await authority.list_for_group("g-1")
            in_g2 = await authority.list_for_group("g-2")
            assert len(in_g1) == 2
            assert len(in_g2) == 1

    asyncio.run(_run())


def test_list_for_cluster_pair(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = SonoBusBindingAuthority(session)
            await authority.create(
                _stream_payload(
                    "s-ab", talker_node_id="node-alpha", listener_node_id="node-beta"
                )
            )
            await authority.create(
                _stream_payload(
                    "s-ac", talker_node_id="node-alpha", listener_node_id="node-gamma"
                )
            )
            await authority.create(
                _stream_payload(
                    "s-bc", talker_node_id="node-beta", listener_node_id="node-gamma"
                )
            )
            await session.commit()
            into_gamma = await authority.list_for_cluster_pair(None, "node-gamma")
            from_alpha = await authority.list_for_cluster_pair("node-alpha", None)
            ab = await authority.list_for_cluster_pair("node-alpha", "node-beta")
            assert len(into_gamma) == 2
            assert len(from_alpha) == 2
            assert len(ab) == 1

    asyncio.run(_run())


def test_list_in_scope(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = SonoBusBindingAuthority(session)
            await authority.create(_stream_payload("global-1"))
            await authority.create(
                _stream_payload("snap-1", scope="snapshot", scope_id="snap-X")
            )
            await authority.create(_peer_payload("peer-1"))
            await session.commit()
            globals_ = await authority.list_in_scope("global", None)
            snaps = await authority.list_in_scope("snapshot", "snap-X")
            cluster = await authority.list_in_scope("cluster", "cluster-default")
            assert len(globals_) == 1
            assert len(snaps) == 1
            assert len(cluster) == 1

    asyncio.run(_run())


def test_update_bumps_modified_fields(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = SonoBusBindingAuthority(session)
            created = await authority.create(_stream_payload("stream-1"))
            await session.commit()
            updated = await authority.update(
                created.binding_id,
                SonoBusBindingUpdate(
                    consumer_label="renamed",
                    jitter_buffer_ms=12,
                    transport_priority="sonobus_preferred",
                    modified_by="t2521-update",
                ),
            )
            await session.commit()
            assert updated.consumer_label == "renamed"
            assert updated.jitter_buffer_ms == 12
            assert updated.transport_priority == "sonobus_preferred"
            assert updated.modified_by == "t2521-update"
            # created_by must remain immutable
            assert updated.created_by == created.created_by

    asyncio.run(_run())


def test_disable_then_enable(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = SonoBusBindingAuthority(session)
            created = await authority.create(_stream_payload("stream-1"))
            await session.commit()
            assert created.enabled is True

            disabled = await authority.disable(
                created.binding_id, modified_by="ops"
            )
            await session.commit()
            assert disabled.enabled is False
            assert disabled.modified_by == "ops"

            enabled = await authority.enable(
                created.binding_id, modified_by="ops"
            )
            await session.commit()
            assert enabled.enabled is True

    asyncio.run(_run())


def test_delete_removes_row(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = SonoBusBindingAuthority(session)
            created = await authority.create(_stream_payload("stream-1"))
            await session.commit()
            assert await authority.delete(created.binding_id) is True
            await session.commit()
            assert await authority.delete(created.binding_id) is False
            with pytest.raises(SonoBusBindingNotFound):
                await authority.get(created.binding_id)

    asyncio.run(_run())


def test_delete_for_consumer_returns_count(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = SonoBusBindingAuthority(session)
            await authority.create(_stream_payload("stream-1"))
            await authority.create(_stream_payload("stream-1"))  # same consumer_id
            await authority.create(_stream_payload("stream-2"))
            await session.commit()
            removed = await authority.delete_for_consumer(
                "sonobus_stream", "stream-1"
            )
            await session.commit()
            assert removed == 2
            remaining = await authority.list_by_kind("stream")
            assert len(remaining) == 1
            assert remaining[0].consumer_id == "stream-2"

    asyncio.run(_run())


def test_count(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = SonoBusBindingAuthority(session)
            assert await authority.count() == 0
            await authority.create(_stream_payload("stream-1"))
            await authority.create(_stream_payload("stream-2"))
            await authority.create(_peer_payload("peer-1"))
            await session.commit()
            assert await authority.count() == 3

    asyncio.run(_run())


def test_channel_count_cap_enforced_by_schema(tmp_path):
    """Q14 caps channel_count at 32. Pydantic should reject 33."""
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = SonoBusBindingAuthority(session)
            with pytest.raises(Exception):
                await authority.create(
                    _stream_payload("oversized", channel_count=33)
                )

    asyncio.run(_run())


def test_transport_priority_enum_enforced(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await database_module._ensure_tables_created()
        async with database_module.get_session() as session:
            authority = SonoBusBindingAuthority(session)
            with pytest.raises(Exception):
                await authority.create(
                    _stream_payload(
                        "bad-priority", transport_priority="ethernet_only"
                    )
                )

    asyncio.run(_run())

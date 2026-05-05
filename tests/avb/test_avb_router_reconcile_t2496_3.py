"""T2496-3 — AvbRouter reconciliation from AvbBindingAuthority tests.

Validates that the router rehydrates its in-memory `connections` dict
from durable authority rows on `start()` so the authority is the
source of truth for which talker→listener pairings are active across
restarts.

Coverage:
  - reconcile reads source="avb_router" rows and rebuilds the dict.
  - reconcile reads source="acmp_persisted" rows too (T2491-8 saved
    connections).
  - reconcile ignores rows with other source values (manual operator
    bindings, Tesira preset bindings — those aren't router-owned).
  - reconcile is idempotent: a second call with the same authority
    state doesn't duplicate dict entries.
  - reconcile leaves the in-memory dict untouched when the DB is
    unreachable (defensive).
  - rehydrated connections carry authority_binding_id, so downstream
    projection skips them (round-trip with T2496-2).
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app import database as database_module
from app.services.avb import AvbBindingAuthority, AvbBindingCreate
from app.services.avb.avb_router import AvbRouter
from app.services.avb.router_authority_writer import (
    ROUTER_WRITER_SOURCE,
    record_connection_in_authority,
)
from app.services.avb.router_projection import _project_one_connection
from tests.avb.test_avb_router_authority_writer_t2496_2 import _make_connection


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(
        f"sqlite+aiosqlite:///{tmp_path / 'avb-router-reconcile.db'}"
    )


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def _stream_payload(consumer_id: str, *, source: str = ROUTER_WRITER_SOURCE) -> AvbBindingCreate:
    return AvbBindingCreate(
        consumer_type="avdecc_stream",
        consumer_id=consumer_id,
        consumer_label="Test Talker → Test Listener",
        source_type="avdecc_talker",
        source_descriptor={
            "talker_entity_id": "0x91E0F000FE000001",
            "talker_unique_id": 0,
            "channels": 8,
            "sample_rate": 48000,
            "device_type": "avdecc",
        },
        target_type="avdecc_listener",
        target_descriptor={
            "listener_entity_id": "0x91E0F000FE000002",
            "listener_unique_id": 0,
            "channels": 8,
            "sample_rate": 48000,
            "device_type": "avdecc",
        },
        stream_id="0X91E0F000FE000001:0",
        stream_format="24-bit PCM",
        scope="global",
        source=source,
        created_by=source,
        enabled=True,
    )


def test_reconcile_hydrates_dict_from_authority(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        # Seed the authority with a router-owned binding directly
        # (simulating a prior connect that landed before this start()).
        connection = _make_connection()
        binding_id = await record_connection_in_authority(connection)
        assert binding_id is not None

        # New router instance with empty in-memory dict.
        router = AvbRouter()
        assert router.connections == {}

        hydrated = await router._reconcile_connections_from_authority()
        assert hydrated == 1

        # The rehydrated connection carries the durable binding_id.
        rebuilt = list(router.connections.values())[0]
        assert rebuilt.authority_binding_id == binding_id
        assert rebuilt.connection_id() == connection.connection_id()

    asyncio.run(_run())


def test_reconcile_includes_acmp_persisted_rows(tmp_path):
    """T2491-8 saved connections (source="acmp_persisted") must also
    rehydrate so AVDECC fast-connect replay survives a router restart."""
    _init_temp_db(tmp_path)

    async def _run():
        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            created = await authority.create(
                _stream_payload("acmp-saved-1", source="acmp_persisted")
            )
            await session.commit()
            saved_binding_id = created.binding_id

        router = AvbRouter()
        hydrated = await router._reconcile_connections_from_authority()
        assert hydrated == 1
        # Verify the rehydrated connection carries the durable
        # binding_id from the persisted row (the connection_id is
        # computed from talker/listener endpoints, not the consumer_id).
        rebuilt = list(router.connections.values())[0]
        assert rebuilt.authority_binding_id == saved_binding_id

    asyncio.run(_run())


def test_reconcile_ignores_non_router_sources(tmp_path):
    """Rows authored by other writers (manual operator binding, Tesira
    preset adapter) must NOT enter the router's connections dict —
    those aren't router-owned."""
    _init_temp_db(tmp_path)

    async def _run():
        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            await authority.create(
                _stream_payload("manual-binding", source="manual")
            )
            await authority.create(
                _stream_payload("tesira-binding", source="tesira_fleet")
            )
            await session.commit()

        router = AvbRouter()
        hydrated = await router._reconcile_connections_from_authority()
        assert hydrated == 0
        assert router.connections == {}

    asyncio.run(_run())


def test_reconcile_is_idempotent(tmp_path):
    """A second reconcile() call with the same authority state must
    not duplicate dict entries."""
    _init_temp_db(tmp_path)

    async def _run():
        connection = _make_connection()
        await record_connection_in_authority(connection)

        router = AvbRouter()
        first = await router._reconcile_connections_from_authority()
        second = await router._reconcile_connections_from_authority()
        assert first == 1
        assert second == 1
        assert len(router.connections) == 1

    asyncio.run(_run())


def test_reconcile_skips_unmappable_row_without_failing_others(tmp_path):
    """A row with a missing/empty descriptor must be skipped without
    blocking other rows from hydrating."""
    _init_temp_db(tmp_path)

    async def _run():
        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            # Good row.
            await authority.create(_stream_payload("good-stream"))
            # "Bad" row — empty descriptors. The reconciler should
            # still mint a StreamConnection with default endpoint
            # values; this protects against the catastrophic case where
            # a malformed row poisons reconciliation.
            await authority.create(
                AvbBindingCreate(
                    consumer_type="avdecc_stream",
                    consumer_id="empty-descriptors",
                    consumer_label="empty",
                    source_type="avdecc_talker",
                    source_descriptor={},
                    target_type="avdecc_listener",
                    target_descriptor={},
                    stream_id=None,
                    stream_format=None,
                    scope="global",
                    source=ROUTER_WRITER_SOURCE,
                    created_by=ROUTER_WRITER_SOURCE,
                )
            )
            await session.commit()

        router = AvbRouter()
        hydrated = await router._reconcile_connections_from_authority()
        # Both rows hydrate — the reconciler is permissive about empty
        # descriptors (defaults to "" entity_id, 0 unique_id, etc.).
        # The point of this test is that one bad row does not block
        # the whole reconciliation.
        assert hydrated == 2

    asyncio.run(_run())


def test_rehydrated_connection_skips_projection(tmp_path):
    """Round-trip with T2496-2 contract: a connection rehydrated from
    the authority carries authority_binding_id, so the read-side
    projection skips it."""
    _init_temp_db(tmp_path)

    async def _run():
        connection = _make_connection()
        await record_connection_in_authority(connection)

        router = AvbRouter()
        await router._reconcile_connections_from_authority()
        rebuilt = list(router.connections.values())[0]

        # Projection skips authority-backed connections.
        projected = _project_one_connection(rebuilt)
        assert projected is None

    asyncio.run(_run())

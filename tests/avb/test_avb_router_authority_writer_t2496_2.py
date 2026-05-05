"""T2496-2 — AvbRouter writer-side coupling tests.

Validates that `record_connection_in_authority` translates a
`StreamConnection` into a real `AvbBinding` row through
`AvbBindingAuthority` (closes the T2490-3b deferred refactor).

Coverage:
  - happy path: connect → authority row exists with non-projected
    binding_id (UUID4, not "proj-" prefix), correct consumer_id /
    stream_id / endpoints, source="avb_router".
  - idempotent on duplicate: a second record() call for the same
    connection_id returns the existing binding_id without inserting
    a second row.
  - clear_connection_in_authority: deletes every row keyed on the
    connection_id, returns the rowcount; second call is a no-op
    returning 0.
  - the read-side projection skips connections whose
    authority_binding_id is set, avoiding double-display in the
    operator surface.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path

import pytest

from app import database as database_module
from app.services.avb import AvbBindingAuthority
from app.services.avb.avb_router import (
    AudioEndpoint,
    ConnectionState,
    StreamConnection,
    StreamDirection,
)
from app.services.avb.router_authority_writer import (
    ROUTER_WRITER_SOURCE,
    clear_connection_in_authority,
    record_connection_in_authority,
)
from app.services.avb.router_projection import _project_one_connection


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(
        f"sqlite+aiosqlite:///{tmp_path / 'avb-router-writer.db'}"
    )


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def _make_connection(
    *,
    talker_entity_id: str = "0x91E0F000FE000001",
    talker_unique_id: int = 0,
    listener_entity_id: str = "0x91E0F000FE000002",
    listener_unique_id: int = 0,
    state: ConnectionState = ConnectionState.CONNECTED,
    talker_node_id: str | None = None,
    listener_node_id: str | None = None,
) -> StreamConnection:
    talker = AudioEndpoint(
        entity_id=talker_entity_id,
        unique_id=talker_unique_id,
        direction=StreamDirection.TALKER,
        device_type="avdecc",
        device_name="Test Talker",
        channels=8,
        sample_rate=48000,
        format="24-bit PCM",
        node_id=talker_node_id,
    )
    listener = AudioEndpoint(
        entity_id=listener_entity_id,
        unique_id=listener_unique_id,
        direction=StreamDirection.LISTENER,
        device_type="avdecc",
        device_name="Test Listener",
        channels=8,
        sample_rate=48000,
        format="24-bit PCM",
        node_id=listener_node_id,
    )
    return StreamConnection(
        talker=talker,
        listener=listener,
        state=state,
        established_time=datetime.now(timezone.utc),
        connection_role="general_route",
    )


def test_record_connection_creates_authority_row(tmp_path):
    """Happy path: connect writes a real UUID4 binding row through the
    authority, not a synthetic 'proj-' projection."""
    _init_temp_db(tmp_path)

    async def _run():
        connection = _make_connection()
        binding_id = await record_connection_in_authority(connection)

        # Real UUID4 (36 chars, 4 dashes), not a synthetic 'proj-' id.
        assert binding_id is not None
        assert len(binding_id) == 36
        assert binding_id.count("-") == 4
        assert not binding_id.startswith("proj-")

        # Authority round-trip: the row exists and matches the connection.
        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            rows = await authority.list_for_consumer(
                consumer_type="avdecc_stream",
                consumer_id=connection.connection_id(),
            )
            assert len(rows) == 1
            row = rows[0]
            assert row.binding_id == binding_id
            assert row.consumer_id == connection.connection_id()
            assert row.source == ROUTER_WRITER_SOURCE
            assert row.created_by == ROUTER_WRITER_SOURCE
            assert row.stream_id == "0X91E0F000FE000001:0"
            assert row.source_type == "avdecc_talker"
            assert row.target_type == "avdecc_listener"
            assert row.scope == "global"
            assert row.enabled is True
            # source_descriptor / target_descriptor are populated.
            assert row.source_descriptor["talker_entity_id"] == "0x91E0F000FE000001"
            assert row.target_descriptor["listener_entity_id"] == "0x91E0F000FE000002"

    asyncio.run(_run())


def test_record_connection_is_idempotent_on_duplicate(tmp_path):
    """Calling record() twice for the same connection returns the same
    binding_id and does NOT insert a second row."""
    _init_temp_db(tmp_path)

    async def _run():
        connection = _make_connection()
        first_id = await record_connection_in_authority(connection)
        second_id = await record_connection_in_authority(connection)
        assert first_id == second_id

        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            rows = await authority.list_for_consumer(
                consumer_type="avdecc_stream",
                consumer_id=connection.connection_id(),
            )
            assert len(rows) == 1

    asyncio.run(_run())


def test_clear_connection_deletes_authority_row(tmp_path):
    """disconnect() path: clear_connection_in_authority removes every
    row keyed on the connection_id."""
    _init_temp_db(tmp_path)

    async def _run():
        connection = _make_connection()
        binding_id = await record_connection_in_authority(connection)
        assert binding_id is not None

        rowcount = await clear_connection_in_authority(connection.connection_id())
        assert rowcount == 1

        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            rows = await authority.list_for_consumer(
                consumer_type="avdecc_stream",
                consumer_id=connection.connection_id(),
            )
            assert rows == []

    asyncio.run(_run())


def test_clear_connection_is_no_op_when_row_absent(tmp_path):
    """A second clear() call (or a clear() against an unknown connection)
    returns 0 without raising."""
    _init_temp_db(tmp_path)

    async def _run():
        connection = _make_connection()
        await record_connection_in_authority(connection)
        first = await clear_connection_in_authority(connection.connection_id())
        second = await clear_connection_in_authority(connection.connection_id())
        assert first == 1
        assert second == 0

    asyncio.run(_run())


def test_cluster_scope_when_either_node_is_set(tmp_path):
    """When either endpoint has a node_id, the binding scope is 'cluster'
    so peer-fan-out matrix queries pick the row up."""
    _init_temp_db(tmp_path)

    async def _run():
        connection = _make_connection(
            talker_node_id="node-a",
            listener_node_id=None,
        )
        binding_id = await record_connection_in_authority(connection)
        assert binding_id is not None

        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            row = await authority.get(binding_id)
            assert row.scope == "cluster"
            assert row.talker_node_id == "node-a"
            assert row.listener_node_id is None

    asyncio.run(_run())


def test_projection_skips_authority_backed_connection(tmp_path):
    """T2496-2 contract: once a connection has an authority_binding_id,
    the read-side projection layer skips it so the operator surface
    doesn't show both a synthetic projection and the durable row for
    the same connection."""
    _init_temp_db(tmp_path)

    async def _run():
        connection = _make_connection()
        # Pre-coupling: projection produces a synthetic AvbBindingRead.
        before = _project_one_connection(connection)
        assert before is not None
        assert before.binding_id.startswith("proj-")

        # Writer-side coupling assigns the durable binding_id.
        connection.authority_binding_id = await record_connection_in_authority(connection)
        assert connection.authority_binding_id is not None
        assert not connection.authority_binding_id.startswith("proj-")

        # Post-coupling: projection skips this connection.
        after = _project_one_connection(connection)
        assert after is None

    asyncio.run(_run())

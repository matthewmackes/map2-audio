"""T2496-4 — TesiraFleet binding adapter tests.

Validates that `record_tesira_subscription_in_authority` translates a
Tesira TTP subscription into a real `AvbBinding` row through the
canonical authority (closes the T2490-6b deferred refactor — Tesira
subscriptions become canonical bindings, removing the parallel-store
gap between TesiraFleet and AvbBindingAuthority).
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app import database as database_module
from app.services.avb import AvbBindingAuthority
from app.services.tesira.binding_adapter import (
    TESIRA_FLEET_SOURCE,
    _make_consumer_id,
    clear_tesira_subscription_in_authority,
    list_tesira_bindings_for_device,
    record_tesira_subscription_in_authority,
)


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(
        f"sqlite+aiosqlite:///{tmp_path / 'tesira-binding-adapter.db'}"
    )


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def test_record_subscription_creates_authority_row(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        binding_id = await record_tesira_subscription_in_authority(
            device_host="10.0.5.10",
            device_name="Booth-Forte",
            ttp_tag="MainOut.input.level",
            block_path="MainOut/level",
            metering_interval_ms=100,
        )
        assert binding_id is not None
        assert len(binding_id) == 36
        assert not binding_id.startswith("proj-")

        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            rows = await authority.list_for_consumer(
                consumer_type="tesira_block",
                consumer_id=_make_consumer_id("10.0.5.10", "MainOut.input.level"),
            )
            assert len(rows) == 1
            row = rows[0]
            assert row.binding_id == binding_id
            assert row.consumer_type == "tesira_block"
            assert row.consumer_id == "10.0.5.10::MainOut.input.level"
            assert row.consumer_label == "Booth-Forte — MainOut.input.level"
            assert row.source_type == "tesira_subscription"
            assert row.target_type == "tesira_apply"
            assert row.source == TESIRA_FLEET_SOURCE
            assert row.created_by == TESIRA_FLEET_SOURCE
            assert row.scope == "global"
            assert row.enabled is True
            assert row.metadata["device_host"] == "10.0.5.10"
            assert row.metadata["device_name"] == "Booth-Forte"
            assert row.metadata["ttp_tag"] == "MainOut.input.level"
            assert row.metadata["block_path"] == "MainOut/level"
            assert row.metadata["metering_interval_ms"] == 100

    asyncio.run(_run())


def test_record_subscription_is_idempotent_on_duplicate(tmp_path):
    """A second call for the same (device_host, ttp_tag) returns the
    same binding_id and does NOT insert a second row."""
    _init_temp_db(tmp_path)

    async def _run():
        first = await record_tesira_subscription_in_authority(
            device_host="10.0.5.10",
            device_name="Forte-A",
            ttp_tag="Mute1",
        )
        second = await record_tesira_subscription_in_authority(
            device_host="10.0.5.10",
            device_name="Forte-A",
            ttp_tag="Mute1",
        )
        assert first == second

        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            rows = await authority.list_for_consumer(
                consumer_type="tesira_block",
                consumer_id="10.0.5.10::Mute1",
            )
            assert len(rows) == 1

    asyncio.run(_run())


def test_clear_subscription_deletes_authority_row(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        binding_id = await record_tesira_subscription_in_authority(
            device_host="10.0.5.10",
            device_name="Forte-A",
            ttp_tag="Mute1",
        )
        assert binding_id is not None

        rowcount = await clear_tesira_subscription_in_authority(
            device_host="10.0.5.10",
            ttp_tag="Mute1",
        )
        assert rowcount == 1

        # Second clear is a no-op.
        again = await clear_tesira_subscription_in_authority(
            device_host="10.0.5.10",
            ttp_tag="Mute1",
        )
        assert again == 0

    asyncio.run(_run())


def test_extra_metadata_merges_into_row(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        binding_id = await record_tesira_subscription_in_authority(
            device_host="10.0.5.10",
            device_name="Forte-A",
            ttp_tag="Comp1.threshold",
            extra_metadata={"author": "operator-1", "live_pinned": True},
        )
        assert binding_id is not None

        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            row = await authority.get(binding_id)
            assert row.metadata["author"] == "operator-1"
            assert row.metadata["live_pinned"] is True
            # Standard fields still populate.
            assert row.metadata["device_host"] == "10.0.5.10"
            assert row.metadata["ttp_tag"] == "Comp1.threshold"

    asyncio.run(_run())


def test_list_for_device_filters_correctly(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        # Two devices, two subscriptions each.
        await record_tesira_subscription_in_authority(
            device_host="10.0.5.10", device_name="A", ttp_tag="X"
        )
        await record_tesira_subscription_in_authority(
            device_host="10.0.5.10", device_name="A", ttp_tag="Y"
        )
        await record_tesira_subscription_in_authority(
            device_host="10.0.5.20", device_name="B", ttp_tag="X"
        )
        await record_tesira_subscription_in_authority(
            device_host="10.0.5.20", device_name="B", ttp_tag="Z"
        )

        only_a = await list_tesira_bindings_for_device("10.0.5.10")
        assert {r.consumer_id for r in only_a} == {
            "10.0.5.10::X",
            "10.0.5.10::Y",
        }

        only_b = await list_tesira_bindings_for_device("10.0.5.20")
        assert {r.consumer_id for r in only_b} == {
            "10.0.5.20::X",
            "10.0.5.20::Z",
        }

        none = await list_tesira_bindings_for_device("10.0.99.99")
        assert none == []

    asyncio.run(_run())


def test_consumer_type_is_tesira_block_not_avdecc(tmp_path):
    """The Tesira adapter must use consumer_type=tesira_block so the
    canonical authority's per-vocab dispatch picks the right writer
    (and the operator surface filters correctly)."""
    _init_temp_db(tmp_path)

    async def _run():
        await record_tesira_subscription_in_authority(
            device_host="10.0.5.10", device_name="A", ttp_tag="X"
        )

        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            avdecc_rows = await authority.list_for_consumer(
                consumer_type="avdecc_stream",
                consumer_id="10.0.5.10::X",
            )
            assert avdecc_rows == []
            tesira_rows = await authority.list_for_consumer(
                consumer_type="tesira_block",
                consumer_id="10.0.5.10::X",
            )
            assert len(tesira_rows) == 1

    asyncio.run(_run())

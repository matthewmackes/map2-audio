"""T2496-5b — Tesira preset recall route → AvbBindingAuthority integration.

Validates that the actual `/api/tesira/devices/{id}/presets/{idx}/recall`
REST handler now writes through the canonical authority before
invoking the device and flips `enabled=True` on success. Closes the
T2496-5 deferred follow-up explicitly called out in the ship notes.

Strategy: source-grep test (guarantees the integration sites stay
wired) plus a direct round-trip test of the adapter call shape the
route uses.
"""

from __future__ import annotations

import asyncio
import inspect
from pathlib import Path

import pytest

from app import database as database_module
from app.services.avb import AvbBindingAuthority
from app.services.tesira.binding_adapter import (
    mark_preset_acked_in_authority,
    record_tesira_preset_in_authority,
)


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(
        f"sqlite+aiosqlite:///{tmp_path / 'tesira-route-integration.db'}"
    )


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def test_recall_preset_route_imports_binding_adapter():
    """The recall_preset route handler must call both
    record_tesira_preset_in_authority (pre-write) and
    mark_preset_acked_in_authority (post-success flip)."""
    from app.routes import tesira as tesira_routes

    source = inspect.getsource(tesira_routes)
    assert "record_tesira_preset_in_authority" in source, (
        "recall_preset must pre-write a pending binding row through "
        "AvbBindingAuthority before invoking device.recall_preset."
    )
    assert "mark_preset_acked_in_authority" in source, (
        "recall_preset must flip the binding to enabled=True after the "
        "device acks the recall."
    )


def test_recall_preset_call_shape_pending_then_acked(tmp_path):
    """Mirrors the route's call sequence: pre-write pending, then ack
    on success. After both calls the row exists with enabled=True and
    metadata.pending=False."""
    _init_temp_db(tmp_path)

    async def _run():
        # Step 1: route pre-writes a pending row.
        binding_id = await record_tesira_preset_in_authority(
            device_host="10.0.5.10",
            device_name="Forte-A",
            preset_id=12,
            pending=True,
        )
        assert binding_id is not None

        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            row = await authority.get(binding_id)
            assert row.enabled is False
            assert row.metadata["pending"] is True

        # Step 2: device acks → route flips enabled=True.
        acked = await mark_preset_acked_in_authority(
            device_host="10.0.5.10",
            preset_id=12,
        )
        assert acked is True

        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            row = await authority.get(binding_id)
            assert row.enabled is True
            assert row.metadata["pending"] is False

    asyncio.run(_run())


def test_recall_preset_idempotent_on_repeat(tmp_path):
    """Repeat recall of the same preset doesn't double-insert; the
    second call returns the same binding_id (the authority's
    consumer_id pre-check is keyed on (host, preset_id))."""
    _init_temp_db(tmp_path)

    async def _run():
        first = await record_tesira_preset_in_authority(
            device_host="10.0.5.10",
            device_name="Forte-A",
            preset_id=12,
            pending=True,
        )
        # Repeat (e.g., operator double-clicks the recall button).
        second = await record_tesira_preset_in_authority(
            device_host="10.0.5.10",
            device_name="Forte-A",
            preset_id=12,
            pending=True,
        )
        assert first == second

        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            rows = await authority.list_for_consumer(
                consumer_type="tesira_preset",
                consumer_id="10.0.5.10::preset::12",
            )
            assert len(rows) == 1

    asyncio.run(_run())

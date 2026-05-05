"""T2496-4b — TesiraFleet ↔ AvbBindingAuthority integration tests.

Validates that the actual `TesiraFleet` code path now writes through
the canonical authority on subscription start (the helper-primitive
adapter shipped in T2496-4 — this slice wires it into the fleet).

Strategy: avoid spinning up the whole TesiraFleet (which needs real
TCP connectivity to TTP devices). Instead, exercise the integration
seam directly: confirm that the fleet module imports the adapter at
the metering-start site, and verify the adapter's idempotent
write-through behavior matches the fleet's call shape.
"""

from __future__ import annotations

import asyncio
import inspect
from pathlib import Path

import pytest

from app import database as database_module
from app.services.avb import AvbBindingAuthority
from app.services.tesira.binding_adapter import (
    record_tesira_subscription_in_authority,
    clear_tesira_subscription_in_authority,
    list_tesira_bindings_for_device,
)


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(
        f"sqlite+aiosqlite:///{tmp_path / 'tesira-fleet-integration.db'}"
    )


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def test_tesira_fleet_imports_binding_adapter():
    """The fleet module must import the binding adapter at runtime —
    grep on the source guarantees the integration site exists."""
    from app.services.tesira import tesira_fleet

    source = inspect.getsource(tesira_fleet)
    assert "record_tesira_subscription_in_authority" in source, (
        "TesiraFleet should call record_tesira_subscription_in_authority "
        "after start_metering succeeds (T2496-4 integration site)."
    )
    assert "clear_tesira_subscription_in_authority" in source, (
        "TesiraFleet should call clear_tesira_subscription_in_authority "
        "on stop() to prevent stale rows accumulating."
    )


def test_fleet_call_shape_round_trips_through_authority(tmp_path):
    """Exercise the same call shape the fleet uses: record on
    start_metering success, list_for_device for cleanup, clear by
    (host, tag). Round-trip works end-to-end."""
    _init_temp_db(tmp_path)

    async def _run():
        # Simulate fleet startup: record three subscriptions for one
        # device (matching the fleet's loop over cfg.metering_tags).
        for tag in ("MainOut.input.level", "Comp1.threshold", "Mute1"):
            binding_id = await record_tesira_subscription_in_authority(
                device_host="10.0.5.10",
                device_name="Booth-Forte",
                ttp_tag=tag,
                metering_interval_ms=100,
            )
            assert binding_id is not None

        # The Devices page surface uses list_for_device to populate
        # the per-device card — verify it returns all three rows.
        rows = await list_tesira_bindings_for_device("10.0.5.10")
        assert {r.metadata["ttp_tag"] for r in rows} == {
            "MainOut.input.level",
            "Comp1.threshold",
            "Mute1",
        }

        # Simulate fleet stop(): the cleanup loop reads
        # list_for_device, then clears each one by (host, tag).
        for row in rows:
            ttp_tag = row.metadata["ttp_tag"]
            cleared = await clear_tesira_subscription_in_authority(
                device_host="10.0.5.10",
                ttp_tag=ttp_tag,
            )
            assert cleared == 1

        # All gone.
        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            count_after = sum(
                1
                for r in await authority.list_in_scope("global", None, enabled_only=False)
                if r.consumer_type == "tesira_block"
            )
            assert count_after == 0

    asyncio.run(_run())


def test_fleet_restart_idempotency(tmp_path):
    """A fleet restart re-runs start_metering for every configured
    tag. The adapter must NOT create duplicate rows on the second
    pass — idempotent on (host, tag)."""
    _init_temp_db(tmp_path)

    async def _run():
        # First fleet start.
        first_id = await record_tesira_subscription_in_authority(
            device_host="10.0.5.10",
            device_name="Booth-Forte",
            ttp_tag="MainOut.input.level",
        )
        # Restart (same tag).
        second_id = await record_tesira_subscription_in_authority(
            device_host="10.0.5.10",
            device_name="Booth-Forte",
            ttp_tag="MainOut.input.level",
        )
        assert first_id == second_id

        rows = await list_tesira_bindings_for_device("10.0.5.10")
        assert len(rows) == 1

    asyncio.run(_run())

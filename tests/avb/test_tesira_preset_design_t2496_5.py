"""T2496-5 — Tesira preset / design recall as canonical AvbBindings.

Validates that preset recalls and design pushes write through the
canonical authority before the device is asked to act, and that the
ack-handler flips `enabled=True` once the device confirms.

Closes the T2490-6c deferred refactor.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app import database as database_module
from app.services.avb import AvbBindingAuthority
from app.services.tesira.binding_adapter import (
    TESIRA_FLEET_SOURCE,
    clear_tesira_design_in_authority,
    clear_tesira_preset_in_authority,
    mark_design_acked_in_authority,
    mark_preset_acked_in_authority,
    record_tesira_design_in_authority,
    record_tesira_preset_in_authority,
)


def _init_temp_db(tmp_path: Path) -> None:
    asyncio.run(database_module.dispose_async_db())
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._sync_migrations_applied = False
    database_module.init_async_db(
        f"sqlite+aiosqlite:///{tmp_path / 'tesira-preset-design.db'}"
    )


@pytest.fixture(autouse=True)
def _dispose_async_db_after_test():
    yield
    asyncio.run(database_module.dispose_async_db())


def test_record_preset_creates_pending_row(tmp_path):
    """Preset recall with pending=True creates an enabled=False row."""
    _init_temp_db(tmp_path)

    async def _run():
        binding_id = await record_tesira_preset_in_authority(
            device_host="10.0.5.10",
            device_name="Forte-A",
            preset_id=12,
            preset_label="Show A",
        )
        assert binding_id is not None

        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            row = await authority.get(binding_id)
            assert row.consumer_type == "tesira_preset"
            assert row.consumer_id == "10.0.5.10::preset::12"
            assert row.consumer_label == "Forte-A — Show A"
            assert row.source == TESIRA_FLEET_SOURCE
            assert row.metadata["kind"] == "preset"
            assert row.metadata["preset_id"] == "12"
            assert row.metadata["preset_label"] == "Show A"
            assert row.metadata["pending"] is True
            # Pending → enabled=False so operator UI tags warm-gray.
            assert row.enabled is False

    asyncio.run(_run())


def test_record_preset_with_pending_false_creates_enabled_row(tmp_path):
    """When the caller knows the preset is already applied (e.g.,
    rehydration of historical state), pending=False creates an
    enabled=True row immediately."""
    _init_temp_db(tmp_path)

    async def _run():
        binding_id = await record_tesira_preset_in_authority(
            device_host="10.0.5.10",
            device_name="Forte-A",
            preset_id=7,
            pending=False,
        )
        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            row = await authority.get(binding_id)
            assert row.enabled is True
            assert row.metadata["pending"] is False

    asyncio.run(_run())


def test_mark_preset_acked_flips_enabled_to_true(tmp_path):
    """Round-trip: pending preset → record (enabled=False) → ack →
    enabled=True + metadata.pending=False."""
    _init_temp_db(tmp_path)

    async def _run():
        binding_id = await record_tesira_preset_in_authority(
            device_host="10.0.5.10",
            device_name="Forte-A",
            preset_id=12,
        )
        assert binding_id is not None

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


def test_mark_preset_acked_returns_false_when_no_row(tmp_path):
    """Marking a preset that was never recorded is a no-op (returns
    False), not an error."""
    _init_temp_db(tmp_path)

    async def _run():
        acked = await mark_preset_acked_in_authority(
            device_host="10.0.99.99",
            preset_id=999,
        )
        assert acked is False

    asyncio.run(_run())


def test_record_design_uses_design_consumer_id(tmp_path):
    """Designs share the tesira_preset consumer_type bucket but use a
    distinct consumer_id pattern + metadata.kind="design"."""
    _init_temp_db(tmp_path)

    async def _run():
        binding_id = await record_tesira_design_in_authority(
            device_host="10.0.5.10",
            device_name="Forte-A",
            design_id="show-a-v2",
            design_label="Show A v2",
        )
        assert binding_id is not None

        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            row = await authority.get(binding_id)
            assert row.consumer_type == "tesira_preset"
            assert row.consumer_id == "10.0.5.10::design::show-a-v2"
            assert row.metadata["kind"] == "design"
            assert row.metadata["design_id"] == "show-a-v2"
            assert row.metadata["design_label"] == "Show A v2"
            assert row.target_descriptor["action"] == "push"
            assert row.enabled is False  # pending by default

    asyncio.run(_run())


def test_mark_design_acked_flips_enabled(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        binding_id = await record_tesira_design_in_authority(
            device_host="10.0.5.10",
            device_name="Forte-A",
            design_id="show-a",
        )
        assert binding_id is not None

        acked = await mark_design_acked_in_authority(
            device_host="10.0.5.10",
            design_id="show-a",
        )
        assert acked is True

        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            row = await authority.get(binding_id)
            assert row.enabled is True
            assert row.metadata["pending"] is False

    asyncio.run(_run())


def test_record_preset_is_idempotent(tmp_path):
    """Two consecutive recalls of the same preset return the same
    binding_id."""
    _init_temp_db(tmp_path)

    async def _run():
        first = await record_tesira_preset_in_authority(
            device_host="10.0.5.10", device_name="A", preset_id=5,
        )
        second = await record_tesira_preset_in_authority(
            device_host="10.0.5.10", device_name="A", preset_id=5,
        )
        assert first == second

        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            rows = await authority.list_for_consumer(
                consumer_type="tesira_preset",
                consumer_id="10.0.5.10::preset::5",
            )
            assert len(rows) == 1

    asyncio.run(_run())


def test_clear_preset_and_design_delete_rows(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        await record_tesira_preset_in_authority(
            device_host="10.0.5.10", device_name="A", preset_id=5,
        )
        await record_tesira_design_in_authority(
            device_host="10.0.5.10", device_name="A", design_id="d1",
        )

        cleared_preset = await clear_tesira_preset_in_authority(
            device_host="10.0.5.10", preset_id=5,
        )
        cleared_design = await clear_tesira_design_in_authority(
            device_host="10.0.5.10", design_id="d1",
        )
        assert cleared_preset == 1
        assert cleared_design == 1

        # Second clear is a no-op.
        again_p = await clear_tesira_preset_in_authority(
            device_host="10.0.5.10", preset_id=5,
        )
        again_d = await clear_tesira_design_in_authority(
            device_host="10.0.5.10", design_id="d1",
        )
        assert again_p == 0
        assert again_d == 0

    asyncio.run(_run())


def test_preset_and_design_dont_collide_on_same_id(tmp_path):
    """A preset id of "5" and a design id of "5" must produce distinct
    consumer_ids so they don't collide in the authority."""
    _init_temp_db(tmp_path)

    async def _run():
        preset_id_str = await record_tesira_preset_in_authority(
            device_host="10.0.5.10", device_name="A", preset_id="5",
        )
        design_id_str = await record_tesira_design_in_authority(
            device_host="10.0.5.10", device_name="A", design_id="5",
        )
        assert preset_id_str != design_id_str

        async with database_module.get_session() as session:
            authority = AvbBindingAuthority(session)
            preset = await authority.get(preset_id_str)
            design = await authority.get(design_id_str)
            assert preset.consumer_id == "10.0.5.10::preset::5"
            assert design.consumer_id == "10.0.5.10::design::5"
            assert preset.metadata["kind"] == "preset"
            assert design.metadata["kind"] == "design"

    asyncio.run(_run())

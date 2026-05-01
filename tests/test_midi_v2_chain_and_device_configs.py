"""Route-contract tests for the new chain-configs and device-configs endpoints.

These cover the GUI-facing surface in `web/src/map2/clients/midi.ts`:
  GET    /api/v2/midi/chain-configs
  PUT    /api/v2/midi/chain-configs/{chain_id}
  DELETE /api/v2/midi/chain-configs/{chain_id}
  GET    /api/v2/midi/device-configs
  POST   /api/v2/midi/device-configs

Pre-fix the legacy "MIDI Assignments · Advanced" tab showed
"chain-configs: API Error 404" because these endpoints were absent from
midi_v2.py. See audit dated 2026-04-30.
"""

from __future__ import annotations

import asyncio

import pytest

from app import database as database_module
from app.routes import midi_v2 as routes


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(
        f"sqlite+aiosqlite:///{tmp_path / 'midi-configs-routes.db'}"
    )


async def _seed_chain(chain_id: int, name: str = "Test Chain"):
    async with database_module.get_session() as session:
        session.add(
            database_module.Chain(
                id=chain_id,
                name=name,
                is_active=False,
                config="{}",
            )
        )
        await session.flush()


def test_chain_configs_crud_contract(tmp_path):
    _init_temp_db(tmp_path)
    asyncio.run(_seed_chain(101, "PC bound"))
    asyncio.run(_seed_chain(102, "Other"))

    async def _run():
        empty = await routes.list_chain_configs()
        assert empty == {"configs": [], "count": 0}

        upserted = await routes.upsert_chain_config(
            101,
            routes.ChainConfigUpsertRequest(
                program_number=12,
                bank_msb=1,
                bank_lsb=2,
                send_pc_on_activate=False,
            ),
        )
        cfg = upserted["config"]
        assert cfg["chain_id"] == 101
        assert cfg["program_number"] == 12
        assert cfg["bank_msb"] == 1
        assert cfg["bank_lsb"] == 2
        assert cfg["send_pc_on_activate"] is False

        # Update existing — partial body should patch, not reset.
        updated = await routes.upsert_chain_config(
            101,
            routes.ChainConfigUpsertRequest(program_number=42),
        )
        assert updated["config"]["program_number"] == 42
        # bank_msb/lsb/send_pc_on_activate omitted → preserved from prior upsert
        assert updated["config"]["bank_msb"] == 1
        assert updated["config"]["bank_lsb"] == 2
        assert updated["config"]["send_pc_on_activate"] is False

        listed = await routes.list_chain_configs()
        assert listed["count"] == 1
        assert listed["configs"][0]["chain_id"] == 101

        deleted = await routes.delete_chain_config(101)
        assert deleted["success"] is True

        listed_after = await routes.list_chain_configs()
        assert listed_after["count"] == 0

    asyncio.run(_run())


def test_chain_config_upsert_rejects_unknown_chain(tmp_path):
    _init_temp_db(tmp_path)

    from fastapi import HTTPException

    async def _run():
        with pytest.raises(HTTPException) as exc:
            await routes.upsert_chain_config(
                9999,
                routes.ChainConfigUpsertRequest(program_number=1),
            )
        assert exc.value.status_code == 404

    asyncio.run(_run())


def test_chain_config_delete_unknown_returns_404(tmp_path):
    _init_temp_db(tmp_path)

    from fastapi import HTTPException

    async def _run():
        with pytest.raises(HTTPException) as exc:
            await routes.delete_chain_config(9999)
        assert exc.value.status_code == 404

    asyncio.run(_run())


def test_device_configs_upsert_and_list(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        empty = await routes.list_device_configs()
        assert empty == {"configs": [], "count": 0}

        first = await routes.upsert_device_config(
            routes.DeviceConfigUpsertRequest(
                device_name="Edirol UA-1000",
                device_type="input",
                is_enabled=True,
                auto_connect=True,
                channel_filter=None,
            )
        )
        assert first["config"]["device_name"] == "Edirol UA-1000"
        assert first["config"]["device_type"] == "input"
        assert first["config"]["is_enabled"] is True

        # Same device_name should patch, not duplicate.
        patched = await routes.upsert_device_config(
            routes.DeviceConfigUpsertRequest(
                device_name="Edirol UA-1000",
                channel_filter=5,
            )
        )
        assert patched["config"]["channel_filter"] == 5
        assert patched["config"]["is_enabled"] is True  # preserved

        listed = await routes.list_device_configs()
        assert listed["count"] == 1
        assert listed["configs"][0]["channel_filter"] == 5

    asyncio.run(_run())

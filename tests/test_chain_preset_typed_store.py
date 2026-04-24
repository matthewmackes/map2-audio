"""T2436-C — round-trip tests for the typed chain_presets store.

Locks the contract that the typed `ChainPreset` table replaces the old
SystemConfig JSON-blob surface without changing the public API shape of
`ChainService.save_preset` / `load_preset` / `list_presets` / `delete_preset`.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app import database as database_module
from app.services.chain_service import ChainService


def _init_temp_db(tmp_path: Path) -> Path:
    db_path = tmp_path / "chain-preset.db"
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_db(f"sqlite:///{db_path}")
    database_module.init_async_db(f"sqlite+aiosqlite:///{db_path}")
    return db_path


async def _seed_chain_with_plugins(
    session, chain_name: str, plugin_uris: list[tuple[str, int]]
) -> int:
    chain = database_module.Chain(name=chain_name, is_active=False)
    session.add(chain)
    await session.flush()
    for uri, position in plugin_uris:
        session.add(
            database_module.ChainPlugin(
                chain_id=chain.id,
                plugin_uri=uri,
                position=position,
                bypass=False,
            )
        )
    await session.flush()
    return int(chain.id)


@pytest.mark.asyncio
async def test_save_preset_persists_typed_row(tmp_path: Path) -> None:
    _init_temp_db(tmp_path)
    async with database_module.get_session() as session:
        chain_id = await _seed_chain_with_plugins(
            session,
            "Save Chain",
            [("urn:x:drive", 0), ("urn:x:reverb", 1)],
        )
        service = ChainService(session)
        preset_id = await service.save_preset(chain_id, "MyPreset")
        assert preset_id is not None

    async with database_module.get_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(database_module.ChainPreset).filter(database_module.ChainPreset.id == preset_id)
        )
        row = result.scalar_one()
        assert row.name == "MyPreset"
        assert isinstance(row.payload, dict)
        assert row.payload["name"] == "Save Chain"
        assert len(row.payload["plugins"]) == 2


@pytest.mark.asyncio
async def test_save_preset_overwrites_existing_by_name(tmp_path: Path) -> None:
    _init_temp_db(tmp_path)
    async with database_module.get_session() as session:
        chain_a = await _seed_chain_with_plugins(session, "First", [("urn:a", 0)])
        chain_b = await _seed_chain_with_plugins(session, "Second", [("urn:b", 0), ("urn:c", 1)])
        service = ChainService(session)
        pid1 = await service.save_preset(chain_a, "Snapshot")
        pid2 = await service.save_preset(chain_b, "Snapshot")
    assert pid1 == pid2  # same row, updated in place
    async with database_module.get_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(database_module.ChainPreset).filter(database_module.ChainPreset.id == pid1)
        )
        row = result.scalar_one()
        assert row.payload["name"] == "Second"
        assert len(row.payload["plugins"]) == 2


@pytest.mark.asyncio
async def test_list_presets_returns_typed_rows(tmp_path: Path) -> None:
    _init_temp_db(tmp_path)
    async with database_module.get_session() as session:
        c1 = await _seed_chain_with_plugins(session, "One", [("urn:x", 0)])
        c2 = await _seed_chain_with_plugins(session, "Two", [("urn:y", 0), ("urn:z", 1)])
        service = ChainService(session)
        await service.save_preset(c1, "Lead")
        await service.save_preset(c2, "Solo")
        listing = await service.list_presets()
    names = {p["name"] for p in listing}
    assert names == {"Lead", "Solo"}
    by_name = {p["name"]: p for p in listing}
    assert by_name["Solo"]["plugin_count"] == 2
    assert by_name["Lead"]["plugin_count"] == 1


@pytest.mark.asyncio
async def test_load_preset_creates_new_chain(tmp_path: Path) -> None:
    _init_temp_db(tmp_path)
    async with database_module.get_session() as session:
        source_chain = await _seed_chain_with_plugins(
            session,
            "Source",
            [("urn:a", 0), ("urn:b", 1)],
        )
        service = ChainService(session)
        preset_id = await service.save_preset(source_chain, "Template")

    async with database_module.get_session() as session:
        service = ChainService(session)
        new_chain_id = await service.load_preset(preset_id)
    assert new_chain_id is not None
    assert new_chain_id != source_chain

    async with database_module.get_session() as session:
        from sqlalchemy import select
        cp_result = await session.execute(
            select(database_module.ChainPlugin)
            .filter(database_module.ChainPlugin.chain_id == new_chain_id)
            .order_by(database_module.ChainPlugin.position)
        )
        plugins = cp_result.scalars().all()
        assert [p.plugin_uri for p in plugins] == ["urn:a", "urn:b"]


@pytest.mark.asyncio
async def test_delete_preset_removes_row(tmp_path: Path) -> None:
    _init_temp_db(tmp_path)
    async with database_module.get_session() as session:
        chain_id = await _seed_chain_with_plugins(session, "X", [("urn:q", 0)])
        service = ChainService(session)
        preset_id = await service.save_preset(chain_id, "Doomed")
        ok = await service.delete_preset(preset_id)
        assert ok is True

    async with database_module.get_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(database_module.ChainPreset).filter(database_module.ChainPreset.id == preset_id)
        )
        assert result.scalar_one_or_none() is None


def test_model_declares_unique_name() -> None:
    """The typed store replaces a `system_config.key`-unique blob; the
    typed model must preserve that uniqueness on `name`."""
    col = database_module.ChainPreset.__table__.c.name
    assert col.unique is True

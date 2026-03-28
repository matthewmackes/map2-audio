import asyncio
import sqlite3

import pytest
from sqlalchemy import select

from app import database as database_module
from app.routes import chains as chains_routes
from app.services.chain_service import ChainService


def _reset_db_state() -> None:
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module._async_engine = None
    database_module._async_session_maker = None
    database_module._engine = None
    database_module._SessionLocal = None


def _init_temp_async_db(tmp_path, name: str) -> None:
    _reset_db_state()
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / name}")


async def _dispose_db() -> None:
    await database_module.dispose_async_db()
    _reset_db_state()


def test_sqlite_schema_upgrade_adds_chain_plugin_loader_state_columns(tmp_path):
    db_path = tmp_path / "legacy-chain-loader-state.db"
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "CREATE TABLE chains ("
            "id INTEGER PRIMARY KEY, name VARCHAR(255) NOT NULL, is_active BOOLEAN DEFAULT 0, "
            "config TEXT DEFAULT '{}', created_at DATETIME, updated_at DATETIME)"
        )
        conn.execute(
            "CREATE TABLE chain_plugins ("
            "id INTEGER PRIMARY KEY, chain_id INTEGER NOT NULL, plugin_uri VARCHAR(255) NOT NULL, "
            "position INTEGER NOT NULL, bypass BOOLEAN DEFAULT 0, created_at DATETIME)"
        )
        conn.commit()

    _init_temp_async_db(tmp_path, "legacy-chain-loader-state.db")

    async def _run() -> None:
        async with database_module.get_session(read_only=True):
            pass

    asyncio.run(_run())

    with sqlite3.connect(db_path) as conn:
        chain_plugin_columns = {row[1] for row in conn.execute("PRAGMA table_info(chain_plugins)")}

    assert "selected_asset_name" in chain_plugin_columns
    assert "selected_asset_path" in chain_plugin_columns
    assert "nam_input_gain" in chain_plugin_columns
    assert "nam_output_gain" in chain_plugin_columns
    assert "nam_normalize" in chain_plugin_columns
    assert "ir_mix" in chain_plugin_columns

    asyncio.run(_dispose_db())


@pytest.mark.asyncio
async def test_chain_service_serializes_persisted_loader_state(tmp_path):
    _init_temp_async_db(tmp_path, "chain-loader-serialization.db")

    async with database_module.get_session() as session:
        chain = database_module.Chain(name="Scoped Loaders", is_active=False)
        session.add(chain)
        await session.flush()

        session.add_all(
            [
                database_module.ChainPlugin(
                    chain_id=chain.id,
                    plugin_uri="map2://juce/nam",
                    position=0,
                    bypass=True,
                    selected_asset_name="Crunch Deluxe",
                    selected_asset_path="/tmp/crunch-deluxe.nam",
                    nam_input_gain=1.5,
                    nam_output_gain=-2.0,
                    nam_normalize=False,
                ),
                database_module.ChainPlugin(
                    chain_id=chain.id,
                    plugin_uri="map2://juce/convolution/cabinet",
                    position=1,
                    bypass=False,
                    selected_asset_name="Mesa 4x12",
                    selected_asset_path="/tmp/mesa.wav",
                    ir_mix=85.0,
                ),
            ]
        )
        await session.flush()

        payload = await ChainService(session).get_chain(chain.id)

    plugins = payload["plugins"]
    assert plugins[0]["loader_state"] == {
        "selected_model": "Crunch Deluxe",
        "selected_asset_name": "Crunch Deluxe",
        "selected_asset_path": "/tmp/crunch-deluxe.nam",
        "input_gain": 1.5,
        "output_gain": -2.0,
        "normalize": False,
        "bypass": True,
    }
    assert plugins[1]["loader_state"] == {
        "selected_ir": "Mesa 4x12",
        "selected_asset_name": "Mesa 4x12",
        "selected_asset_path": "/tmp/mesa.wav",
        "mix": 85.0,
        "bypass": False,
        "ir_type": "cabinet",
    }

    await _dispose_db()


def test_normalize_deploy_plugins_preserves_loader_state():
    normalized = chains_routes._normalize_deploy_plugins(  # noqa: SLF001
        [
            {
                "uri": "map2://juce/nam",
                "bypass": True,
                "loader_state": {
                    "selected_model": "Edge Clean",
                    "selected_asset_name": "Edge Clean",
                    "selected_asset_path": "/tmp/edge-clean.nam",
                    "input_gain": 0.75,
                    "output_gain": -1.25,
                    "normalize": True,
                },
            }
        ]
    )

    assert normalized == [
        {
            "uri": "map2://juce/nam",
            "position": 0,
            "bypass": True,
            "loader_state": {
                "selected_model": "Edge Clean",
                "selected_asset_name": "Edge Clean",
                "selected_asset_path": "/tmp/edge-clean.nam",
                "input_gain": 0.75,
                "output_gain": -1.25,
                "normalize": True,
            },
        }
    ]


@pytest.mark.asyncio
async def test_chain_preset_round_trip_preserves_loader_state(tmp_path):
    _init_temp_async_db(tmp_path, "chain-loader-preset.db")

    async with database_module.get_session() as session:
        chain = database_module.Chain(name="Preset Source", is_active=False)
        session.add(chain)
        await session.flush()
        session.add_all(
            [
                database_module.ChainPlugin(
                    chain_id=chain.id,
                    plugin_uri="urn:map2:nam-player",
                    position=0,
                    bypass=False,
                    selected_asset_name="Wide Crunch",
                    selected_asset_path="/tmp/wide-crunch.nam",
                    nam_input_gain=2.25,
                    nam_output_gain=-0.5,
                    nam_normalize=True,
                ),
                database_module.ChainPlugin(
                    chain_id=chain.id,
                    plugin_uri="urn:map2:ir-reverb",
                    position=1,
                    bypass=True,
                    selected_asset_name="Hall Bloom",
                    selected_asset_path="/tmp/hall-bloom.wav",
                    ir_mix=42.0,
                ),
            ]
        )
        await session.flush()

        service = ChainService(session)
        preset_id = await service.save_preset(chain.id, "loader-state")
        cloned_chain_id = await service.load_preset(preset_id)

        result = await session.execute(
            select(database_module.ChainPlugin)
            .where(database_module.ChainPlugin.chain_id == cloned_chain_id)
            .order_by(database_module.ChainPlugin.position.asc())
        )
        cloned_plugins = result.scalars().all()
        cloned_plugin_payloads = [
            {
                "selected_asset_name": plugin.selected_asset_name,
                "selected_asset_path": plugin.selected_asset_path,
                "nam_input_gain": plugin.nam_input_gain,
                "nam_output_gain": plugin.nam_output_gain,
                "nam_normalize": plugin.nam_normalize,
                "ir_mix": plugin.ir_mix,
                "bypass": plugin.bypass,
            }
            for plugin in cloned_plugins
        ]

    assert cloned_plugin_payloads[0]["selected_asset_name"] == "Wide Crunch"
    assert cloned_plugin_payloads[0]["selected_asset_path"] == "/tmp/wide-crunch.nam"
    assert cloned_plugin_payloads[0]["nam_input_gain"] == pytest.approx(2.25)
    assert cloned_plugin_payloads[0]["nam_output_gain"] == pytest.approx(-0.5)
    assert cloned_plugin_payloads[0]["nam_normalize"] is True
    assert cloned_plugin_payloads[1]["selected_asset_name"] == "Hall Bloom"
    assert cloned_plugin_payloads[1]["selected_asset_path"] == "/tmp/hall-bloom.wav"
    assert cloned_plugin_payloads[1]["ir_mix"] == pytest.approx(42.0)
    assert cloned_plugin_payloads[1]["bypass"] is True

    await _dispose_db()

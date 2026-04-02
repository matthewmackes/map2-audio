import asyncio
import sqlite3

import pytest
from sqlalchemy import select

from app import database as database_module
from app.routes import chains as chains_routes
from app.services.chain_service import ChainService
from app.services.snapshot_system_blocks import NOISE_GATE_PLUGIN_URI


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


@pytest.mark.asyncio
async def test_chain_service_creates_system_noise_gate_and_refuses_removal_or_reorder(tmp_path):
    _init_temp_async_db(tmp_path, "chain-system-noise-gate.db")

    async with database_module.get_session() as session:
        service = ChainService(session)

        created = await service.create_chain("Protected Input Chain")

        assert created is not None
        assert created["plugins"][0]["uri"] == NOISE_GATE_PLUGIN_URI
        assert created["plugins"][0]["position"] == 0
        assert created["plugins"][0]["loader_state"] == {
            "system_block_role": "noise_gate",
            "system_block_locked": True,
            "system_block_label": "SYS",
        }
        assert created["plugins"][0]["parameters"] == {
            "threshold": pytest.approx(-40.0),
            "ratio": pytest.approx(10.0),
            "attack": pytest.approx(1.0),
            "release": pytest.approx(100.0),
        }

        chain_result = await session.execute(
            select(database_module.Chain).where(database_module.Chain.id == created["id"])
        )
        chain_model = chain_result.scalar_one()
        chain_config = service._parse_chain_config(chain_model.config)
        assert chain_config["system_blocks"] == [
            {
                "role": "noise_gate",
                "plugin_uri": NOISE_GATE_PLUGIN_URI,
                "position": 0,
                "label": "SYS",
            }
        ]

        assert await service.add_plugin_to_chain(created["id"], "map2://juce/modulation/phaser") is True

        populated = await service.get_chain(created["id"])
        assert populated is not None
        assert [plugin["uri"] for plugin in populated["plugins"]] == [
            NOISE_GATE_PLUGIN_URI,
            "map2://juce/modulation/phaser",
        ]

        assert await service.remove_plugin_from_chain(created["id"], NOISE_GATE_PLUGIN_URI, 0) is False
        assert await service.reorder_plugins(
            created["id"],
            [
                {"uri": "map2://juce/modulation/phaser", "position": 1},
                {"uri": NOISE_GATE_PLUGIN_URI, "position": 0},
            ],
        ) is False

        final_chain = await service.get_chain(created["id"])
        assert final_chain is not None
        assert [plugin["uri"] for plugin in final_chain["plugins"]] == [
            NOISE_GATE_PLUGIN_URI,
            "map2://juce/modulation/phaser",
        ]

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


@pytest.mark.asyncio
async def test_activate_chain_records_runtime_sync_capability_gap_when_deploy_disabled(tmp_path, monkeypatch):
    _init_temp_async_db(tmp_path, "chain-loader-runtime-gap.db")
    monkeypatch.setattr("app.services.chain_service._ENABLE_ENGINE_CHAIN_DEPLOY", False)

    async with database_module.get_session() as session:
        chain = database_module.Chain(name="Runtime Gap", is_active=False)
        session.add(chain)
        await session.flush()
        session.add(
            database_module.ChainPlugin(
                chain_id=chain.id,
                plugin_uri="map2://juce/nam",
                position=0,
                bypass=False,
            )
        )
        await session.flush()

        service = ChainService(session)
        assert await service.activate_chain(chain.id) is True
        payload = await service.get_chain(chain.id)

    assert payload["runtime_sync"] == {
        "enabled": False,
        "status": "capability_gap",
        "reason": "engine_chain_deploy_disabled",
        "runtime_items": 0,
        "warnings": ["MAP2_ENABLE_ENGINE_CHAIN_DEPLOY is disabled"],
        "restored_positions": [],
        "missing_positions": [],
    }

    await _dispose_db()


class _FakeRuntimeEngine:
    def __init__(self) -> None:
        self.items: list[dict] = []
        self.add_calls: list[tuple[int, int]] = []

    def clear_chain(self) -> None:
        self.items = []

    def add_to_chain(self, instance_id: int, position: int) -> None:
        self.add_calls.append((instance_id, position))
        for item in self.items:
            if item["instance_id"] == instance_id:
                item["position"] = position
                return

    def get_current_pedalboard(self):
        return {"name": "Runtime Chain", "items": list(self.items)}


class _FakeRuntimeEngineService:
    def __init__(self) -> None:
        self._engine = _FakeRuntimeEngine()
        self.loaded_plugin_calls: list[str] = []
        self.nam_load_calls: list[tuple[int, str]] = []
        self.nam_input_gain_calls: list[tuple[int, float]] = []
        self.nam_output_gain_calls: list[tuple[int, float]] = []
        self.nam_normalize_calls: list[tuple[int, bool]] = []
        self.nam_bypass_calls: list[tuple[int, bool]] = []
        self.ir_load_calls: list[tuple[str, int, str]] = []
        self.ir_mix_calls: list[tuple[int, float]] = []
        self.ir_bypass_calls: list[tuple[int, bool]] = []
        self._next_instance_id = 100

    async def load_plugin(self, uri: str) -> int:
        self.loaded_plugin_calls.append(uri)
        self._next_instance_id += 1
        instance_id = self._next_instance_id
        self._engine.items.append({"uri": uri, "instance_id": instance_id})
        return instance_id

    async def load_nam_model_instance(self, instance_id: int, path: str) -> bool:
        self.nam_load_calls.append((instance_id, path))
        return True

    async def set_nam_input_gain_instance(self, instance_id: int, value: float) -> bool:
        self.nam_input_gain_calls.append((instance_id, value))
        return True

    async def set_nam_output_gain_instance(self, instance_id: int, value: float) -> bool:
        self.nam_output_gain_calls.append((instance_id, value))
        return True

    async def set_nam_normalize_instance(self, instance_id: int, normalize: bool) -> bool:
        self.nam_normalize_calls.append((instance_id, normalize))
        return True

    async def set_nam_bypass_instance(self, instance_id: int, bypass: bool) -> bool:
        self.nam_bypass_calls.append((instance_id, bypass))
        return True

    async def load_cabinet_ir_instance(self, instance_id: int, path: str) -> bool:
        self.ir_load_calls.append(("cabinet", instance_id, path))
        return True

    async def load_reverb_ir_instance(self, instance_id: int, path: str) -> bool:
        self.ir_load_calls.append(("reverb", instance_id, path))
        return True

    async def set_ir_mix_instance(self, instance_id: int, mix: float) -> bool:
        self.ir_mix_calls.append((instance_id, mix))
        return True

    async def set_ir_bypass_instance(self, instance_id: int, bypass: bool) -> bool:
        self.ir_bypass_calls.append((instance_id, bypass))
        return True

    async def get_current_pedalboard(self):
        return self._engine.get_current_pedalboard()


@pytest.mark.asyncio
async def test_activate_chain_restores_persisted_loader_state_into_runtime_instances(tmp_path, monkeypatch):
    _init_temp_async_db(tmp_path, "chain-loader-runtime-restore.db")
    fake_engine_service = _FakeRuntimeEngineService()
    monkeypatch.setattr("app.services.chain_service._ENABLE_ENGINE_CHAIN_DEPLOY", True)

    class _FakeJuceEngineService:
        @staticmethod
        def get_instance():
            return fake_engine_service

    monkeypatch.setattr("app.services.juce_engine_service.JuceEngineService", _FakeJuceEngineService)

    async with database_module.get_session() as session:
        chain = database_module.Chain(name="Runtime Restore", is_active=False)
        session.add(chain)
        await session.flush()
        session.add_all(
            [
                database_module.ChainPlugin(
                    chain_id=chain.id,
                    plugin_uri="map2://juce/nam",
                    position=0,
                    bypass=True,
                    selected_asset_path="/tmp/runtime.nam",
                    nam_input_gain=3.5,
                    nam_output_gain=-2.5,
                    nam_normalize=False,
                ),
                database_module.ChainPlugin(
                    chain_id=chain.id,
                    plugin_uri="map2://juce/convolution/cabinet",
                    position=1,
                    bypass=False,
                    selected_asset_path="/tmp/runtime-cab.wav",
                    ir_mix=72.0,
                ),
            ]
        )
        await session.flush()

        service = ChainService(session)
        assert await service.activate_chain(chain.id) is True
        payload = await service.get_chain(chain.id)

    assert fake_engine_service.loaded_plugin_calls == [
        "map2://juce/nam",
        "map2://juce/convolution/cabinet",
    ]
    assert fake_engine_service.nam_load_calls == [(101, "/tmp/runtime.nam")]
    assert fake_engine_service.nam_input_gain_calls == [(101, 3.5)]
    assert fake_engine_service.nam_output_gain_calls == [(101, -2.5)]
    assert fake_engine_service.nam_normalize_calls == [(101, False)]
    assert fake_engine_service.nam_bypass_calls == [(101, True)]
    assert fake_engine_service.ir_load_calls == [("cabinet", 102, "/tmp/runtime-cab.wav")]
    assert fake_engine_service.ir_mix_calls == [(102, 72.0)]
    assert fake_engine_service.ir_bypass_calls == [(102, False)]
    assert payload["runtime_sync"] == {
        "enabled": True,
        "status": "active",
        "runtime_items": 2,
        "warnings": [],
        "restored_positions": [0, 1],
        "missing_positions": [],
    }

    await _dispose_db()

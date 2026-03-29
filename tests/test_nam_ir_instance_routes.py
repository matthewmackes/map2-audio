from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import database as database_module
from app.routes import ir as ir_routes
from app.routes import nam as nam_routes
from app.services.upload_service import AssetType, UnifiedUploadService


class _FakeNamEngine:
    async def get_nam_model_info_instance(self, instance_id: int):
        assert instance_id == 42
        return {
            "name": "Tight Crunch",
            "loaded": True,
            "bypass": False,
            "input_level": -14.0,
            "output_level": -9.5,
            "input_gain": 1.5,
            "output_gain": -0.5,
            "normalize": True,
        }


class _FakePositionScopedNamEngine:
    def __init__(self):
        self.resolve_calls: list[tuple[str, int | None, int | None]] = []
        self.load_calls: list[tuple[int, str]] = []
        self.input_gain_calls: list[tuple[int, float]] = []
        self.output_gain_calls: list[tuple[int, float]] = []
        self.normalize_calls: list[tuple[int, bool]] = []
        self.bypass_calls: list[tuple[int, bool]] = []
        self.unload_calls: list[int] = []

    async def resolve_instance_id(
        self,
        plugin_uri: str,
        plugin_position: int | None = None,
        fallback_instance_id: int | None = None,
    ):
        self.resolve_calls.append((plugin_uri, plugin_position, fallback_instance_id))
        return 84 if plugin_uri == "map2://juce/nam" and plugin_position == 5 else None

    async def load_nam_model_instance(self, instance_id: int, model_path: str) -> bool:
        self.load_calls.append((instance_id, model_path))
        return True

    async def unload_nam_model_instance(self, instance_id: int) -> bool:
        self.unload_calls.append(instance_id)
        return True

    async def set_nam_input_gain_instance(self, instance_id: int, gain_db: float) -> bool:
        self.input_gain_calls.append((instance_id, gain_db))
        return True

    async def set_nam_output_gain_instance(self, instance_id: int, gain_db: float) -> bool:
        self.output_gain_calls.append((instance_id, gain_db))
        return True

    async def set_nam_normalize_instance(self, instance_id: int, normalize: bool) -> bool:
        self.normalize_calls.append((instance_id, normalize))
        return True

    async def set_nam_bypass_instance(self, instance_id: int, bypass: bool) -> bool:
        self.bypass_calls.append((instance_id, bypass))
        return True

    async def get_nam_model_info_instance(self, instance_id: int):
        assert instance_id == 84
        return {
            "name": "Scoped Crunch",
            "loaded": True,
            "bypass": False,
            "input_level": -16.0,
            "output_level": -8.0,
            "input_gain": 2.0,
            "output_gain": -1.0,
            "normalize": True,
        }


class _FakeGlobalFallbackNamEngine:
    def __init__(self):
        self.resolve_calls: list[tuple[str, int | None, int | None]] = []
        self.global_load_calls: list[str] = []

    async def resolve_instance_id(
        self,
        plugin_uri: str,
        plugin_position: int | None = None,
        fallback_instance_id: int | None = None,
    ):
        self.resolve_calls.append((plugin_uri, plugin_position, fallback_instance_id))
        return None

    async def get_current_pedalboard(self):
        return {"name": "Current Chain", "items": []}

    async def load_nam_model(self, model_path: str) -> bool:
        self.global_load_calls.append(model_path)
        return True

    async def is_nam_available(self) -> bool:
        return True

    async def is_nam_model_loaded(self) -> bool:
        return True

    async def is_nam_loading(self) -> bool:
        return False

    async def is_nam_bypassed(self) -> bool:
        return False

    async def get_nam_model_info(self):
        return {"name": "Global Crunch", "loaded": True}

    async def get_nam_input_level(self) -> float:
        return -13.0

    async def get_nam_output_level(self) -> float:
        return -7.0

    async def get_nam_input_gain(self) -> float:
        return 0.5

    async def get_nam_output_gain(self) -> float:
        return -1.5

    async def is_nam_normalized(self) -> bool:
        return True


class _FakeIrEngine:
    def __init__(self):
        self.load_calls: list[tuple[int, str]] = []

    async def load_cabinet_ir_instance(self, instance_id: int, path: str) -> bool:
        self.load_calls.append((instance_id, path))
        return True

    async def get_ir_info_instance(self, instance_id: int):
        assert instance_id == 7
        return {
            "name": "Mesa OS",
            "loaded": True,
            "mix": 72.0,
            "bypass": True,
            "length_samples": 4096,
            "length_ms": 85.333,
            "sample_rate": 48000.0,
        }


class _FakePositionScopedIrEngine:
    def __init__(self):
        self.resolve_calls: list[tuple[str, int | None, int | None]] = []
        self.load_calls: list[tuple[int, str]] = []

    async def resolve_instance_id(
        self,
        plugin_uri: str,
        plugin_position: int | None = None,
        fallback_instance_id: int | None = None,
    ):
        self.resolve_calls.append((plugin_uri, plugin_position, fallback_instance_id))
        return 17 if plugin_uri == "map2://juce/convolution/cabinet" and plugin_position == 6 else None

    async def load_cabinet_ir_instance(self, instance_id: int, path: str) -> bool:
        self.load_calls.append((instance_id, path))
        return True

    async def get_ir_info_instance(self, instance_id: int):
        assert instance_id == 17
        return {
            "name": "Scoped Mesa",
            "loaded": True,
            "mix": 63.0,
            "bypass": False,
            "length_samples": 4096,
            "length_ms": 85.333,
            "sample_rate": 48000.0,
        }


class _FakeGlobalFallbackIrEngine:
    def __init__(self):
        self.resolve_calls: list[tuple[str, int | None, int | None]] = []

    async def resolve_instance_id(
        self,
        plugin_uri: str,
        plugin_position: int | None = None,
        fallback_instance_id: int | None = None,
    ):
        self.resolve_calls.append((plugin_uri, plugin_position, fallback_instance_id))
        return None

    async def get_current_pedalboard(self):
        return {"name": "Current Chain", "items": []}


def _make_sync_session_factory(tmp_path: Path, name: str):
    engine = create_engine(f"sqlite:///{tmp_path / name}")
    database_module.Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autocommit=False, autoflush=False), engine


def test_nam_status_uses_instance_engine_when_instance_id_present(monkeypatch):
    monkeypatch.setattr(nam_routes, "get_audio_engine", lambda: _FakeNamEngine())
    monkeypatch.setattr(
        nam_routes,
        "_scan_nam_models",
        lambda: [{"name": "Tight Crunch"}, {"name": "Clean Glass"}],
    )

    payload = asyncio.run(nam_routes.get_nam_status(instance_id=42))

    assert payload["activeModel"] == "Tight Crunch"
    assert payload["availableModels"] == ["Tight Crunch", "Clean Glass"]
    assert payload["input_gain"] == 1.5
    assert payload["output_gain"] == -0.5
    assert payload["normalize"] is True


def test_nam_routes_resolve_position_scoped_instances_when_instance_id_is_absent(monkeypatch):
    engine = _FakePositionScopedNamEngine()
    monkeypatch.setattr(nam_routes, "get_audio_engine", lambda: engine)
    monkeypatch.setattr(
        nam_routes,
        "_scan_nam_models",
        lambda: [
            {"name": "Scoped Crunch", "path": "/tmp/scoped-crunch.nam"},
            {"name": "Clean Glass", "path": "/tmp/clean-glass.nam"},
        ],
    )

    load_payload = asyncio.run(nam_routes.load_nam_model("Scoped Crunch", plugin_position=5))
    status_payload = asyncio.run(nam_routes.get_nam_status(plugin_position=5))

    assert engine.resolve_calls == [
        ("map2://juce/nam", 5, None),
        ("map2://juce/nam", 5, None),
    ]
    assert engine.load_calls == [(84, "/tmp/scoped-crunch.nam")]
    assert load_payload["status"] == "loading"
    assert status_payload["activeModel"] == "Scoped Crunch"
    assert status_payload["availableModels"] == ["Scoped Crunch", "Clean Glass"]
    assert status_payload["input_gain"] == 2.0
    assert status_payload["output_gain"] == -1.0


def test_nam_routes_recover_from_stale_explicit_instance_ids_using_plugin_position(monkeypatch):
    engine = _FakePositionScopedNamEngine()
    monkeypatch.setattr(nam_routes, "get_audio_engine", lambda: engine)
    monkeypatch.setattr(
        nam_routes,
        "_scan_nam_models",
        lambda: [{"name": "Scoped Crunch", "path": "/tmp/scoped-crunch.nam"}],
    )

    load_payload = asyncio.run(nam_routes.load_nam_model("Scoped Crunch", instance_id=999, plugin_position=5))

    assert engine.resolve_calls == [("map2://juce/nam", 5, 999)]
    assert engine.load_calls == [(84, "/tmp/scoped-crunch.nam")]
    assert load_payload["status"] == "loading"


def test_nam_routes_fall_back_to_global_processor_when_position_scope_has_no_runtime_match(monkeypatch):
    engine = _FakeGlobalFallbackNamEngine()
    monkeypatch.setattr(nam_routes, "get_audio_engine", lambda: engine)
    monkeypatch.setattr(nam_routes, "_configured_nam_blocks_allow_global_fallback", lambda: True)
    monkeypatch.setattr(
        nam_routes,
        "_scan_nam_models",
        lambda: [
            {"name": "Global Crunch", "path": "/tmp/global-crunch.nam"},
            {"name": "Clean Glass", "path": "/tmp/clean-glass.nam"},
        ],
    )

    load_payload = asyncio.run(nam_routes.load_nam_model("Global Crunch", plugin_position=0))
    status_payload = asyncio.run(nam_routes.get_nam_status(plugin_position=0))

    assert engine.resolve_calls == [
        ("map2://juce/nam", 0, None),
        ("map2://juce/nam", 0, None),
    ]
    assert engine.global_load_calls == ["/tmp/global-crunch.nam"]
    assert load_payload["status"] == "loading"
    assert status_payload["activeModel"] == "Global Crunch"
    assert status_payload["availableModels"] == ["Global Crunch", "Clean Glass"]
    assert status_payload["input_gain"] == 0.5
    assert status_payload["output_gain"] == -1.5
    assert status_payload["normalize"] is True


def test_nam_routes_refuse_global_fallback_when_multiple_configured_loaders_exist(monkeypatch):
    engine = _FakeGlobalFallbackNamEngine()
    monkeypatch.setattr(nam_routes, "get_audio_engine", lambda: engine)
    monkeypatch.setattr(nam_routes, "_configured_nam_blocks_allow_global_fallback", lambda: False)
    monkeypatch.setattr(
        nam_routes,
        "_scan_nam_models",
        lambda: [
            {"name": "Global Crunch", "path": "/tmp/global-crunch.nam"},
            {"name": "Clean Glass", "path": "/tmp/clean-glass.nam"},
        ],
    )

    status_payload = asyncio.run(nam_routes.get_nam_status(plugin_position=0))

    assert status_payload["activeModel"] is None
    assert status_payload["input_gain"] == 0.0
    assert status_payload["output_gain"] == 0.0
    assert status_payload["normalize"] is True

    with pytest.raises(nam_routes.HTTPException) as exc_info:
        asyncio.run(nam_routes.load_nam_model("Global Crunch", plugin_position=0))

    assert exc_info.value.status_code == 409
    assert "refusing global fallback" in str(exc_info.value.detail)
    assert engine.global_load_calls == []


def test_nam_routes_allow_global_fallback_when_plugin_position_is_unique_across_active_loaders(tmp_path, monkeypatch):
    engine = _FakeGlobalFallbackNamEngine()
    session_factory, db_engine = _make_sync_session_factory(tmp_path, "nam-active-position-fallback.db")
    chain_a_id: int
    chain_b_id: int

    with session_factory() as session:
        chain_a = database_module.Chain(name="Flow A", is_active=True)
        chain_b = database_module.Chain(name="Flow B", is_active=True)
        session.add_all([chain_a, chain_b])
        session.flush()
        chain_a_id = chain_a.id
        chain_b_id = chain_b.id
        session.add_all(
            [
                database_module.ChainPlugin(
                    chain_id=chain_a_id,
                    plugin_uri="map2://juce/nam",
                    position=2,
                    bypass=False,
                ),
                database_module.ChainPlugin(
                    chain_id=chain_b_id,
                    plugin_uri="map2://juce/nam",
                    position=0,
                    bypass=False,
                ),
            ]
        )
        session.commit()

    monkeypatch.setattr(nam_routes, "get_audio_engine", lambda: engine)
    monkeypatch.setattr(nam_routes, "get_db_session", lambda: session_factory())
    monkeypatch.setattr(
        nam_routes,
        "_scan_nam_models",
        lambda: [{"name": "Global Crunch", "path": "/tmp/global-crunch.nam"}],
    )

    try:
        assert nam_routes._configured_nam_blocks_allow_global_fallback(2) is True

        payload = asyncio.run(nam_routes.load_nam_model("Global Crunch", plugin_position=2))

        assert payload["status"] == "loading"
        assert engine.global_load_calls == ["/tmp/global-crunch.nam"]

        with session_factory() as session:
            scoped_plugin = (
                session.query(database_module.ChainPlugin)
                .filter(
                    database_module.ChainPlugin.chain_id == chain_a_id,
                    database_module.ChainPlugin.position == 2,
                )
                .one()
            )
            other_plugin = (
                session.query(database_module.ChainPlugin)
                .filter(
                    database_module.ChainPlugin.chain_id == chain_b_id,
                    database_module.ChainPlugin.position == 0,
                )
                .one()
            )

        assert scoped_plugin.selected_asset_name == "Global Crunch"
        assert scoped_plugin.selected_asset_path == "/tmp/global-crunch.nam"
        assert other_plugin.selected_asset_name is None
    finally:
        db_engine.dispose()


def test_nam_status_surfaces_configured_state_when_runtime_identity_is_missing(monkeypatch):
    engine = _FakeGlobalFallbackNamEngine()
    monkeypatch.setattr(nam_routes, "get_audio_engine", lambda: engine)
    monkeypatch.setattr(nam_routes, "_configured_nam_blocks_allow_global_fallback", lambda: False)
    monkeypatch.setattr(
        nam_routes,
        "_get_configured_nam_state",
        lambda plugin_position: {
            "model": "Stored Crunch",
            "asset_path": "/tmp/stored-crunch.nam",
            "input_gain": 1.25,
            "output_gain": -0.75,
            "normalize": False,
            "bypass": True,
        },
    )
    monkeypatch.setattr(
        nam_routes,
        "_scan_nam_models",
        lambda: [{"name": "Stored Crunch", "path": "/tmp/stored-crunch.nam"}],
    )

    payload = asyncio.run(nam_routes.get_nam_status(plugin_position=0))

    assert payload["configuredModel"] == "Stored Crunch"
    assert payload["configuredAssetPath"] == "/tmp/stored-crunch.nam"
    assert payload["configuredInputGain"] == 1.25
    assert payload["configuredOutputGain"] == -0.75
    assert payload["configuredNormalize"] is False
    assert payload["configuredBypass"] is True
    assert payload["runtimeWarning"] == "Configured NAM block is not active in the live runtime"


def test_nam_routes_persist_scoped_loader_state_after_mutations(monkeypatch):
    engine = _FakePositionScopedNamEngine()
    persisted_calls: list[dict[str, object]] = []
    monkeypatch.setattr(nam_routes, "get_audio_engine", lambda: engine)
    monkeypatch.setattr(
        nam_routes,
        "_scan_nam_models",
        lambda: [{"name": "Scoped Crunch", "path": "/tmp/scoped-crunch.nam"}],
    )
    monkeypatch.setattr(
        nam_routes,
        "_persist_scoped_nam_state",
        lambda plugin_position, **kwargs: persisted_calls.append(
            {"plugin_position": plugin_position, **kwargs}
        )
        or True,
    )

    asyncio.run(nam_routes.load_nam_model("Scoped Crunch", plugin_position=5))
    asyncio.run(nam_routes.set_nam_input_gain(nam_routes.NAMGainRequest(gain_db=2.5), plugin_position=5))
    asyncio.run(nam_routes.set_nam_output_gain(nam_routes.NAMGainRequest(gain_db=-1.25), plugin_position=5))
    asyncio.run(nam_routes.set_nam_normalize(False, plugin_position=5))
    asyncio.run(nam_routes.set_nam_bypass(True, plugin_position=5))
    asyncio.run(nam_routes.unload_nam_model(plugin_position=5))

    assert persisted_calls == [
        {
            "plugin_position": 5,
            "model_name": "Scoped Crunch",
            "model_path": "/tmp/scoped-crunch.nam",
        },
        {"plugin_position": 5, "input_gain": 2.5},
        {"plugin_position": 5, "output_gain": -1.25},
        {"plugin_position": 5, "normalize": False},
        {"plugin_position": 5, "bypass": True},
        {"plugin_position": 5, "clear_model": True},
    ]


def test_ir_routes_load_and_report_status_per_instance(monkeypatch):
    engine = _FakeIrEngine()
    monkeypatch.setattr(ir_routes, "get_audio_engine", lambda: engine)
    monkeypatch.setattr(
        ir_routes,
        "_scan_irs",
        lambda ir_type: [{"name": "Mesa OS", "path": f"/tmp/{ir_type}-mesa.wav", "size_mb": 1.25}],
    )

    load_payload = asyncio.run(ir_routes.load_cabinet_ir("Mesa OS", instance_id=7))
    status_payload = asyncio.run(ir_routes.get_ir_status(type="cabinet", instance_id=7))

    assert engine.load_calls == [(7, "/tmp/cabinet-mesa.wav")]
    assert load_payload["status"] == "loaded"
    assert status_payload["loaded"] == "Mesa OS"
    assert status_payload["loaded_cabinet"] == "Mesa OS"
    assert status_payload["mix"] == 72.0
    assert status_payload["bypass"] is True


def test_ir_routes_resolve_position_scoped_instances_when_instance_id_is_absent(monkeypatch):
    engine = _FakePositionScopedIrEngine()
    monkeypatch.setattr(ir_routes, "get_audio_engine", lambda: engine)
    monkeypatch.setattr(
        ir_routes,
        "_scan_irs",
        lambda ir_type: [{"name": "Scoped Mesa", "path": f"/tmp/{ir_type}-scoped.wav", "size_mb": 1.5}],
    )

    load_payload = asyncio.run(ir_routes.load_cabinet_ir("Scoped Mesa", plugin_position=6))
    status_payload = asyncio.run(ir_routes.get_ir_status(type="cabinet", plugin_position=6))

    assert engine.resolve_calls == [
        ("map2://juce/convolution/cabinet", 6, None),
        ("map2://juce/convolution/cabinet", 6, None),
    ]
    assert engine.load_calls == [(17, "/tmp/cabinet-scoped.wav")]
    assert load_payload["status"] == "loaded"
    assert status_payload["loaded"] == "Scoped Mesa"
    assert status_payload["loaded_cabinet"] == "Scoped Mesa"
    assert status_payload["mix"] == 63.0
    assert status_payload["bypass"] is False


def test_ir_routes_recover_from_stale_explicit_instance_ids_using_plugin_position(monkeypatch):
    engine = _FakePositionScopedIrEngine()
    monkeypatch.setattr(ir_routes, "get_audio_engine", lambda: engine)
    monkeypatch.setattr(
        ir_routes,
        "_scan_irs",
        lambda ir_type: [{"name": "Scoped Mesa", "path": f"/tmp/{ir_type}-scoped.wav", "size_mb": 1.5}],
    )

    payload = asyncio.run(ir_routes.load_cabinet_ir("Scoped Mesa", instance_id=999, plugin_position=6))

    assert engine.resolve_calls == [("map2://juce/convolution/cabinet", 6, 999)]
    assert engine.load_calls == [(17, "/tmp/cabinet-scoped.wav")]
    assert payload["status"] == "loaded"


class _FakeMissingScopedIrEngine:
    async def resolve_instance_id(
        self,
        plugin_uri: str,
        plugin_position: int | None = None,
        fallback_instance_id: int | None = None,
    ):
        del plugin_uri, plugin_position, fallback_instance_id
        return None


def test_ir_status_rejects_invalid_explicit_instance_id_without_global_fallback(monkeypatch):
    monkeypatch.setattr(ir_routes, "get_audio_engine", lambda: _FakeMissingScopedIrEngine())
    monkeypatch.setattr(
        ir_routes,
        "_scan_irs",
        lambda ir_type: [{"name": "Scoped Mesa", "path": f"/tmp/{ir_type}-scoped.wav", "size_mb": 1.5}],
    )

    try:
        asyncio.run(ir_routes.get_ir_status(type="cabinet", instance_id=999))
    except ir_routes.HTTPException as exc:
        assert exc.status_code == 404
        assert exc.detail == "IR instance not found: 999"
    else:
        raise AssertionError("Expected invalid scoped IR request to fail closed")


def test_ir_routes_fall_back_to_global_processor_when_position_scope_has_no_runtime_match(monkeypatch):
    engine = _FakeGlobalFallbackIrEngine()
    persisted_calls: list[dict[str, object]] = []
    monkeypatch.setattr(ir_routes, "get_audio_engine", lambda: engine)
    monkeypatch.setattr(ir_routes, "_configured_ir_blocks_allow_global_fallback", lambda ir_type: True)
    monkeypatch.setattr(
        ir_routes,
        "_scan_irs",
        lambda ir_type: [{"name": "Scoped Mesa", "path": f"/tmp/{ir_type}-scoped.wav", "size_mb": 1.5}],
    )
    monkeypatch.setattr(ir_routes._ir_processor, "load_ir", lambda ir_name, ir_type: True)
    monkeypatch.setattr(
        ir_routes,
        "_persist_scoped_ir_state",
        lambda ir_type, plugin_position, **kwargs: persisted_calls.append(
            {"ir_type": ir_type, "plugin_position": plugin_position, **kwargs}
        )
        or True,
    )

    payload = asyncio.run(ir_routes.load_cabinet_ir("Scoped Mesa", plugin_position=6))

    assert engine.resolve_calls == [("map2://juce/convolution/cabinet", 6, None)]
    assert payload["status"] == "loaded"
    assert persisted_calls == [
        {
            "ir_type": "cabinet",
            "plugin_position": 6,
            "ir_name": "Scoped Mesa",
            "ir_path": "/tmp/cabinet-scoped.wav",
        }
    ]


def test_ir_routes_refuse_global_fallback_when_multiple_configured_loaders_exist(monkeypatch):
    engine = _FakeGlobalFallbackIrEngine()
    monkeypatch.setattr(ir_routes, "get_audio_engine", lambda: engine)
    monkeypatch.setattr(ir_routes, "_configured_ir_blocks_allow_global_fallback", lambda ir_type: False)
    monkeypatch.setattr(
        ir_routes,
        "_get_configured_ir_state",
        lambda ir_type, plugin_position: {
            "ir": "Stored Mesa",
            "asset_path": "/tmp/stored-mesa.wav",
            "mix": 88.0,
            "bypass": True,
        },
    )
    monkeypatch.setattr(
        ir_routes,
        "_scan_irs",
        lambda ir_type: [{"name": "Stored Mesa", "path": f"/tmp/{ir_type}-stored.wav", "size_mb": 1.5}],
    )

    status_payload = asyncio.run(ir_routes.get_ir_status(type="cabinet", plugin_position=6))

    assert status_payload["configuredIR"] == "Stored Mesa"
    assert status_payload["configuredAssetPath"] == "/tmp/stored-mesa.wav"
    assert status_payload["configuredMix"] == 88.0
    assert status_payload["configuredBypass"] is True
    assert status_payload["runtimeWarning"] == "Configured cabinet IR block is not active in the live runtime"

    with pytest.raises(ir_routes.HTTPException) as exc_info:
        asyncio.run(ir_routes.load_cabinet_ir("Stored Mesa", plugin_position=6))

    assert exc_info.value.status_code == 409
    assert "refusing global fallback" in str(exc_info.value.detail)


def test_ir_routes_allow_global_fallback_when_plugin_position_is_unique_across_active_loaders(tmp_path, monkeypatch):
    engine = _FakeGlobalFallbackIrEngine()
    session_factory, db_engine = _make_sync_session_factory(tmp_path, "ir-active-position-fallback.db")
    chain_a_id: int
    chain_b_id: int

    with session_factory() as session:
        chain_a = database_module.Chain(name="Flow A", is_active=True)
        chain_b = database_module.Chain(name="Flow B", is_active=True)
        session.add_all([chain_a, chain_b])
        session.flush()
        chain_a_id = chain_a.id
        chain_b_id = chain_b.id
        session.add_all(
            [
                database_module.ChainPlugin(
                    chain_id=chain_a_id,
                    plugin_uri="map2://juce/convolution/cabinet",
                    position=6,
                    bypass=False,
                ),
                database_module.ChainPlugin(
                    chain_id=chain_b_id,
                    plugin_uri="map2://juce/convolution/cabinet",
                    position=1,
                    bypass=False,
                ),
            ]
        )
        session.commit()

    monkeypatch.setattr(ir_routes, "get_audio_engine", lambda: engine)
    monkeypatch.setattr(ir_routes, "get_db_session", lambda: session_factory())
    monkeypatch.setattr(
        ir_routes,
        "_scan_irs",
        lambda ir_type: [{"name": "Scoped Mesa", "path": f"/tmp/{ir_type}-scoped.wav", "size_mb": 1.5}],
    )
    monkeypatch.setattr(ir_routes._ir_processor, "load_ir", lambda ir_name, ir_type: True)

    try:
        assert ir_routes._configured_ir_blocks_allow_global_fallback("cabinet", 6) is True

        payload = asyncio.run(ir_routes.load_cabinet_ir("Scoped Mesa", plugin_position=6))

        assert payload["status"] == "loaded"

        with session_factory() as session:
            scoped_plugin = (
                session.query(database_module.ChainPlugin)
                .filter(
                    database_module.ChainPlugin.chain_id == chain_a_id,
                    database_module.ChainPlugin.position == 6,
                )
                .one()
            )
            other_plugin = (
                session.query(database_module.ChainPlugin)
                .filter(
                    database_module.ChainPlugin.chain_id == chain_b_id,
                    database_module.ChainPlugin.position == 1,
                )
                .one()
            )

        assert scoped_plugin.selected_asset_name == "Scoped Mesa"
        assert scoped_plugin.selected_asset_path == "/tmp/cabinet-scoped.wav"
        assert other_plugin.selected_asset_name is None
    finally:
        db_engine.dispose()


def test_upload_service_rejects_traversal_and_saves_safe_name(monkeypatch, tmp_path: Path):
    service = UnifiedUploadService()
    monkeypatch.setattr(service, "get_storage_path", lambda asset_type: tmp_path)

    rejected = asyncio.run(service.save_upload("../escape.nam", b"data", AssetType.NAM))
    saved = asyncio.run(service.save_upload("valid.nam", b"data", AssetType.NAM))

    assert rejected.success is False
    assert rejected.error == "Invalid filename"
    assert saved.success is True
    assert Path(saved.file_path).name == "valid.nam"
    assert (tmp_path / "valid.nam").read_bytes() == b"data"

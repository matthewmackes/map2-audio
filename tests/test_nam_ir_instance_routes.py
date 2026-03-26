from __future__ import annotations

import asyncio
from pathlib import Path

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
        self.resolve_calls: list[tuple[str, int | None]] = []
        self.load_calls: list[tuple[int, str]] = []

    async def resolve_instance_id(self, plugin_uri: str, plugin_position: int | None = None):
        self.resolve_calls.append((plugin_uri, plugin_position))
        return 84 if plugin_uri == "map2://juce/nam" and plugin_position == 5 else None

    async def load_nam_model_instance(self, instance_id: int, model_path: str) -> bool:
        self.load_calls.append((instance_id, model_path))
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
        self.resolve_calls: list[tuple[str, int | None]] = []
        self.load_calls: list[tuple[int, str]] = []

    async def resolve_instance_id(self, plugin_uri: str, plugin_position: int | None = None):
        self.resolve_calls.append((plugin_uri, plugin_position))
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
        ("map2://juce/nam", 5),
        ("map2://juce/nam", 5),
    ]
    assert engine.load_calls == [(84, "/tmp/scoped-crunch.nam")]
    assert load_payload["status"] == "loading"
    assert status_payload["activeModel"] == "Scoped Crunch"
    assert status_payload["availableModels"] == ["Scoped Crunch", "Clean Glass"]
    assert status_payload["input_gain"] == 2.0
    assert status_payload["output_gain"] == -1.0


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
        ("map2://juce/convolution/cabinet", 6),
        ("map2://juce/convolution/cabinet", 6),
    ]
    assert engine.load_calls == [(17, "/tmp/cabinet-scoped.wav")]
    assert load_payload["status"] == "loaded"
    assert status_payload["loaded"] == "Scoped Mesa"
    assert status_payload["loaded_cabinet"] == "Scoped Mesa"
    assert status_payload["mix"] == 63.0
    assert status_payload["bypass"] is False


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

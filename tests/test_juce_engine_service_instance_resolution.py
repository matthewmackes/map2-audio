import asyncio
import sys
from pathlib import Path

from app.services.juce_engine_service import (
    JuceEngineService,
    _configure_juce_module_search_path,
    _discover_juce_module_build_dirs,
)


class _FakePedalboardEngine:
    def __init__(self, items):
        self._items = list(items)

    def get_current_pedalboard(self):
        return {"name": "Test", "items": list(self._items)}


class _FakeTelemetryEngine(_FakePedalboardEngine):
    def __init__(self, items, vu_levels, cpu_metrics):
        super().__init__(items)
        self._vu_levels = list(vu_levels)
        self._cpu_metrics = dict(cpu_metrics)

    def get_plugin_vu_levels(self):
        return list(self._vu_levels)

    def get_cpu_metrics(self):
        return dict(self._cpu_metrics)


class _FakeNamInstanceInfoEngine:
    def is_nam_available(self):
        return True

    def get_nam_model_info_instance(self, instance_id: int):
        assert instance_id == 42
        return {
            "name": "Scoped Crunch",
            "loaded": True,
            "loading": False,
            "bypass": True,
            "input_level": -17.5,
            "output_level": -9.25,
            "input_gain": 2.5,
            "output_gain": -1.5,
            "normalize": False,
        }


class _FakeGraphDocumentEngine:
    def __init__(self):
        self.saved_seed = None
        self.loaded_payload = None
        self.loaded_crossfade = None
        self.loaded_max_crossfade_ms = None
        self.cleared_morph = False
        self.morph_endpoint_calls = []
        self.morph_xy = None

    def save_graph_document(self, seed_document=None):
        self.saved_seed = seed_document
        return {
            "version": "2026.04",
            "meta": {"name": "Live Graph", "type": "snapshot"},
            "graph": {"nodes": [], "edges": [], "chains": []},
        }

    def load_graph_document(self, graph_document, use_independent_crossfade=False, max_crossfade_ms=500):
        self.loaded_payload = graph_document
        self.loaded_crossfade = use_independent_crossfade
        self.loaded_max_crossfade_ms = max_crossfade_ms
        return True

    def clear_morph_endpoints(self):
        self.cleared_morph = True
        return True

    def set_morph_endpoint(self, corner_id, graph_document):
        self.morph_endpoint_calls.append((corner_id, graph_document))
        return True

    def set_morph_position_2d(self, x, y):
        self.morph_xy = (x, y)
        return True

    def get_morph_state(self):
        return {"configured_corners": ["a", "b"], "x": 0.25, "y": 0.75}


def test_get_instance_id_for_uri_prefers_matching_position_for_duplicates():
    service = JuceEngineService()
    service._engine = _FakePedalboardEngine([  # noqa: SLF001 - explicit unit isolation
        {"uri": "urn:test:duplicate", "instance_id": 101, "position": 0},
        {"uri": "urn:test:duplicate", "instance_id": 202, "position": 3},
    ])

    assert service._get_instance_id_for_uri("urn:test:duplicate", 3) == 202  # noqa: SLF001


def test_get_instance_id_for_uri_falls_back_to_first_match_without_position():
    service = JuceEngineService()
    service._engine = _FakePedalboardEngine([  # noqa: SLF001 - explicit unit isolation
        {"uri": "urn:test:duplicate", "instance_id": 101},
        {"uri": "urn:test:duplicate", "instance_id": 202},
    ])

    assert service._get_instance_id_for_uri("urn:test:duplicate") == 101  # noqa: SLF001


def test_resolve_instance_id_prefers_live_position_over_stale_fallback_instance():
    service = JuceEngineService()
    service._engine = _FakePedalboardEngine([  # noqa: SLF001 - explicit unit isolation
        {"uri": "urn:test:duplicate", "instance_id": 202, "position": 3},
    ])

    resolved = asyncio.run(service.resolve_instance_id("urn:test:duplicate", 3, 999))

    assert resolved == 202


def test_get_plugin_vu_levels_attaches_runtime_identity_to_duplicate_uris():
    service = JuceEngineService()
    service._engine = _FakeTelemetryEngine(  # noqa: SLF001 - explicit unit isolation
        [
            {"uri": "urn:test:duplicate", "instance_id": 101, "position": 0},
            {"uri": "urn:test:duplicate", "instance_id": 202, "position": 1},
        ],
        [
            {"uri": "urn:test:duplicate", "input": 0.11, "output": 0.22},
            {"uri": "urn:test:duplicate", "input": 0.33, "output": 0.44},
        ],
        {"per_plugin_percent": {}},
    )

    levels = asyncio.run(service.get_plugin_vu_levels())

    assert levels[0]["instance_id"] == 101
    assert levels[0]["position"] == 0
    assert levels[1]["instance_id"] == 202
    assert levels[1]["position"] == 1


def test_get_runtime_plugin_cpu_telemetry_uses_instance_ids():
    service = JuceEngineService()
    service._engine = _FakeTelemetryEngine(  # noqa: SLF001 - explicit unit isolation
        [
            {"uri": "urn:test:duplicate", "name": "Duplicate A", "instance_id": 101, "position": 0, "latency_samples": 64},
            {"uri": "urn:test:duplicate", "name": "Duplicate B", "instance_id": 202, "position": 1, "latency_samples": 32},
        ],
        [],
        {"per_plugin_percent": {"101": 3.5, 202: 5.25}},
    )

    telemetry = asyncio.run(service.get_runtime_plugin_cpu_telemetry())

    assert telemetry == [
        {
            "uri": "urn:test:duplicate",
            "name": "Duplicate A",
            "cpu_percent": 3.5,
            "instance_id": 101,
            "position": 0,
            "plugin_position": 0,
            "latency_samples": 64,
        },
        {
            "uri": "urn:test:duplicate",
            "name": "Duplicate B",
            "cpu_percent": 5.25,
            "instance_id": 202,
            "position": 1,
            "plugin_position": 1,
            "latency_samples": 32,
        },
    ]


def test_get_nam_status_instance_reads_duplicate_safe_instance_info():
    service = JuceEngineService()
    service._engine = _FakeNamInstanceInfoEngine()  # noqa: SLF001 - explicit unit isolation

    status = asyncio.run(service.get_nam_status_instance(42))

    assert status == {
        "available": True,
        "model_loaded": True,
        "loading": False,
        "bypassed": True,
        "normalized": False,
        "input_gain": 2.5,
        "output_gain": -1.5,
        "input_level": -17.5,
        "output_level": -9.25,
        "model_info": {
            "name": "Scoped Crunch",
            "loaded": True,
            "loading": False,
            "bypass": True,
            "input_level": -17.5,
            "output_level": -9.25,
            "input_gain": 2.5,
            "output_gain": -1.5,
            "normalize": False,
        },
    }


def test_save_graph_document_passes_seed_payload_through_service():
    service = JuceEngineService()
    service._engine = _FakeGraphDocumentEngine()  # noqa: SLF001 - explicit unit isolation

    payload = asyncio.run(service.save_graph_document({"meta": {"name": "Seed"}}))

    assert payload["meta"]["name"] == "Live Graph"
    assert service._engine.saved_seed == {"meta": {"name": "Seed"}}  # noqa: SLF001


def test_load_graph_document_passes_options_through_service():
    service = JuceEngineService()
    service._engine = _FakeGraphDocumentEngine()  # noqa: SLF001 - explicit unit isolation
    document = {
        "version": "2026.04",
        "meta": {"name": "Snapshot", "type": "snapshot"},
        "graph": {"nodes": [], "edges": [], "chains": []},
    }

    result = asyncio.run(
        service.load_graph_document(
            document,
            use_independent_crossfade=True,
            max_crossfade_ms=240,
        )
    )

    assert result is True
    assert service._engine.loaded_payload == document  # noqa: SLF001
    assert service._engine.loaded_crossfade is True  # noqa: SLF001
    assert service._engine.loaded_max_crossfade_ms == 240  # noqa: SLF001


def test_morph_engine_wrappers_pass_through_service():
    service = JuceEngineService()
    service._engine = _FakeGraphDocumentEngine()  # noqa: SLF001 - explicit unit isolation
    document = {
        "version": "2026.04",
        "meta": {"name": "Morph A", "type": "snapshot"},
        "graph": {"nodes": [], "edges": [], "chains": []},
    }

    assert asyncio.run(service.clear_morph_endpoints()) is True
    assert asyncio.run(service.set_morph_endpoint("a", document)) is True
    assert asyncio.run(service.set_morph_position_2d(0.25, 0.75)) is True
    assert asyncio.run(service.get_morph_state()) == {
        "configured_corners": ["a", "b"],
        "x": 0.25,
        "y": 0.75,
    }

    assert service._engine.cleared_morph is True  # noqa: SLF001
    assert service._engine.morph_endpoint_calls == [("a", document)]  # noqa: SLF001
    assert service._engine.morph_xy == (0.25, 0.75)  # noqa: SLF001


class _FakeFixedNativeEngine:
    def __init__(self):
        self.delay_mix = 0.0
        self.delay_bypass = False
        self.delay_staged = False
        self.lexilove_mix = 0.0
        self.lexilove_bypass = False
        self.lexilove_staged = False
        self.shoegaze_mix = 0.0
        self.shoegaze_bypass = False
        self.shoegaze_staged = False

    def set_delay_mix(self, percent: float):
        self.delay_mix = percent

    def get_delay_parameters(self):
        return {"mix": self.delay_mix, "bypass": self.delay_bypass, "spillover": True}

    def set_delay_bypass(self, bypass: bool):
        self.delay_bypass = bypass

    def is_delay_bypassed(self):
        return self.delay_bypass

    def has_delay_spillover(self):
        return True

    def stage_delay_spillover(self):
        self.delay_staged = True
        return True

    def set_lexilove_mix(self, percent: float):
        self.lexilove_mix = percent

    def get_lexilove_parameters(self):
        return {"mix": self.lexilove_mix, "bypass": self.lexilove_bypass, "spillover": True}

    def set_lexilove_bypass(self, bypass: bool):
        self.lexilove_bypass = bypass

    def is_lexilove_bypassed(self):
        return self.lexilove_bypass

    def stage_lexilove_spillover(self):
        self.lexilove_staged = True
        return True

    def set_shoegaze_mix(self, percent: float):
        self.shoegaze_mix = percent

    def get_shoegaze_parameters(self):
        return {"mix": self.shoegaze_mix, "bypass": self.shoegaze_bypass, "spillover": True}

    def set_shoegaze_bypass(self, bypass: bool):
        self.shoegaze_bypass = bypass

    def is_shoegaze_bypassed(self):
        return self.shoegaze_bypass

    def stage_shoegaze_spillover(self):
        self.shoegaze_staged = True
        return True


def _write_fake_engine_module(build_dir: Path, *, mtime: int) -> Path:
    build_dir.mkdir(parents=True, exist_ok=True)
    module_path = build_dir / "map2_audio_engine.cpython-314-x86_64-linux-gnu.so"
    module_path.write_bytes(b"fake")
    module_path.touch()
    module_path.chmod(0o644)
    import os

    os.utime(module_path, (mtime, mtime))
    return module_path


def test_discover_juce_module_build_dirs_prefers_newest_build(tmp_path):
    old_build = tmp_path / "build"
    new_build = tmp_path / "juce-engine" / "build"
    _write_fake_engine_module(old_build, mtime=10)
    _write_fake_engine_module(new_build, mtime=20)

    ordered = _discover_juce_module_build_dirs(tmp_path)

    assert ordered == [new_build, old_build]


def test_configure_juce_module_search_path_moves_freshest_build_to_front(tmp_path, monkeypatch):
    old_build = tmp_path / "build"
    new_build = tmp_path / "juce-engine" / "build"
    _write_fake_engine_module(old_build, mtime=10)
    _write_fake_engine_module(new_build, mtime=20)

    monkeypatch.setattr(sys, "path", [str(old_build), "/tmp/existing", str(new_build)])

    ordered = _configure_juce_module_search_path(tmp_path)

    assert ordered == [str(new_build), str(old_build)]
    assert sys.path[0] == str(new_build)
    assert sys.path[1] == str(old_build)


def test_nam_instance_status_helpers_return_safe_defaults_without_engine():
    service = JuceEngineService()

    assert asyncio.run(service.is_nam_model_loaded_instance(77)) is False
    assert asyncio.run(service.is_nam_loading_instance(77)) is False
    assert asyncio.run(service.is_nam_bypassed_instance(77)) is False
    assert asyncio.run(service.is_nam_normalized_instance(77)) is True
    assert asyncio.run(service.get_nam_input_gain_instance(77)) == 0.0
    assert asyncio.run(service.get_nam_output_gain_instance(77)) == 0.0
    assert asyncio.run(service.get_nam_input_level_instance(77)) == -100.0
    assert asyncio.run(service.get_nam_output_level_instance(77)) == -100.0


def test_fixed_native_parameter_fallback_uses_direct_service_methods():
    service = JuceEngineService()
    service._engine = _FakeFixedNativeEngine()  # noqa: SLF001 - explicit unit isolation

    assert asyncio.run(service.set_parameter("map2://juce/delay", "mix", 0.25))
    assert service._engine.delay_mix == 25.0  # noqa: SLF001
    assert asyncio.run(service.get_parameter("map2://juce/delay", "mix")) == 0.25

    assert asyncio.run(service.set_parameter("map2://juce/reverb/pcm70", "mix", 0.5))
    assert service._engine.lexilove_mix == 50.0  # noqa: SLF001
    assert asyncio.run(service.get_parameter("map2://juce/reverb/pcm70", "mix")) == 0.5
    assert asyncio.run(service.set_parameter("map2://juce/reverb/pcm70", "bypass", 1.0))
    assert asyncio.run(service.get_parameter("map2://juce/reverb/pcm70", "bypass")) == 1.0

    assert asyncio.run(service.set_parameter("map2://juce/multieffect/shoegaze", "mix", 0.75))
    assert service._engine.shoegaze_mix == 75.0  # noqa: SLF001
    assert asyncio.run(service.get_parameter("map2://juce/multieffect/shoegaze", "mix")) == 0.75
    assert asyncio.run(service.set_parameter("map2://juce/multieffect/shoegaze", "bypass", 0.0))
    assert asyncio.run(service.get_parameter("map2://juce/multieffect/shoegaze", "bypass")) == 0.0


def test_fixed_native_spillover_stage_helpers_use_direct_engine_methods():
    service = JuceEngineService()
    service._engine = _FakeFixedNativeEngine()  # noqa: SLF001 - explicit unit isolation

    assert asyncio.run(service.stage_delay_spillover()) is True
    assert asyncio.run(service.stage_shoegaze_spillover()) is True
    assert asyncio.run(service.stage_lexilove_spillover()) is True

    assert service._engine.delay_staged is True  # noqa: SLF001
    assert service._engine.shoegaze_staged is True  # noqa: SLF001
    assert service._engine.lexilove_staged is True  # noqa: SLF001

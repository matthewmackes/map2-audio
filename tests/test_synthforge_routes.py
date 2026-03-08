import asyncio

import pytest
from fastapi import HTTPException

from app.routes import synthforge as synthforge_routes


class _DummySynthForgeService:
    def __init__(self):
        self.note_events = []
        self.backend = "sfizz"
        self.streaming = {
            "enabled": True,
            "preload_size": 131072,
            "max_voices": 64,
            "interpolation": "hermite",
            "quality_live": 5,
            "quality_freewheeling": 8,
            "memory_limit_mb": 256,
        }
        self.hot_reload = {
            "enabled": False,
            "interval_ms": 1000,
            "pending_reload": False,
            "reloaded": False,
            "generation": 0,
            "last_reload_iso": "",
            "last_error": "",
        }
        self.scala = {
            "enabled": False,
            "scala_path": "",
            "root_key": 60,
            "reference_hz": 440.0,
        }
        self.mpe = {
            "enabled": False,
            "lower_zone_channels": 0,
            "upper_zone_channels": 0,
            "pitch_bend_range_semitones": 48,
        }
        self.routes = []
        self.freeze = {
            "freeze_enabled": False,
            "frozen_signal_ready": False,
            "freeze_samples": 0,
            "render_path": "",
            "last_error": "",
        }

    async def get_synthforge_parts_config(self):
        return [
            {
                "part_index": idx,
                "midi_channel": idx + 1,
                "output_bus": "main",
                "level": 1.0,
                "pan": 0.0,
                "mute": False,
                "solo": False,
            }
            for idx in range(16)
        ]

    async def set_synthforge_part_config(self, _part_index, _config):
        return True

    async def get_synthforge_patches(self, _category=None):
        return [
            {
                "bank": 0,
                "program": 0,
                "name": "Init Multi",
                "category": "factory",
                "author": "MAP2 Audio",
                "description": "Default patch",
            }
        ]

    async def load_synthforge_patch(self, _part_index, _bank, _program):
        return True

    async def save_synthforge_patch(self, _part_index, _bank, _program, _name):
        return True

    async def get_synthforge_voice_metrics(self):
        return {
            "active_voices": 3,
            "peak_voices": 5,
            "voices_per_part": [3] + [0] * 15,
            "cpu_percent": 0.0,
        }

    async def get_synthforge_part_parameters(self, part_index):
        return {"part_index": float(part_index), "osc1.level": 0.5}

    async def set_synthforge_parameter(self, _part_index, _param, _value):
        return True

    async def load_synthforge_sfz(self, _part_index, _sfz_path):
        return True

    async def get_synthforge_part_sample_status(self, part_index):
        return {
            "loaded": True,
            "sampler_mode": True,
            "part_index": part_index,
            "region_count": 4,
            "loaded_sample_count": 4,
            "sfz_path": "/tmp/test.sfz",
            "last_error": "",
            "warnings": [],
        }

    async def reload_synthforge_sfz_if_changed(self, _part_index):
        self.hot_reload["reloaded"] = True
        self.hot_reload["generation"] += 1
        return True

    async def set_synthforge_part_sampler_backend(self, _part_index, backend):
        self.backend = backend
        return backend in {"native", "sfizz"}

    async def get_synthforge_part_sampler_backend(self, _part_index):
        return self.backend

    async def set_synthforge_part_streaming_config(self, _part_index, config):
        self.streaming = dict(config)
        return True

    async def get_synthforge_part_streaming_config(self, _part_index):
        return dict(self.streaming)

    async def set_synthforge_part_hot_reload(self, _part_index, enabled, interval_ms):
        self.hot_reload["enabled"] = enabled
        self.hot_reload["interval_ms"] = interval_ms
        return True

    async def get_synthforge_part_hot_reload_status(self, _part_index):
        return dict(self.hot_reload)

    async def load_synthforge_part_scala_tuning(self, _part_index, scala_path, root_key, reference_hz):
        self.scala = {
            "enabled": True,
            "scala_path": scala_path,
            "root_key": root_key,
            "reference_hz": reference_hz,
        }
        return True

    async def get_synthforge_part_scala_tuning(self, _part_index):
        return dict(self.scala)

    async def set_synthforge_part_mpe_config(self, _part_index, config):
        self.mpe = dict(config)
        return True

    async def get_synthforge_part_mpe_config(self, _part_index):
        return dict(self.mpe)

    async def set_synthforge_part_mod_matrix_routes(self, _part_index, routes):
        self.routes = list(routes)
        return True

    async def get_synthforge_part_mod_matrix_routes(self, _part_index):
        return list(self.routes)

    async def set_synthforge_part_freeze(self, _part_index, enabled):
        self.freeze["freeze_enabled"] = enabled
        return True

    async def get_synthforge_part_freeze_status(self, _part_index):
        return dict(self.freeze)

    async def render_synthforge_part_to_file(self, _part_index, output_path, _duration_ms):
        self.freeze["render_path"] = output_path
        self.freeze["last_error"] = ""
        return True

    async def get_synthforge_part_analyzer_frame(self, _part_index):
        return {
            "peak_left": 0.5,
            "peak_right": 0.4,
            "rms_left": 0.2,
            "rms_right": 0.18,
            "midi_events": 4,
            "active_voices": 2,
        }

    async def get_synthforge_analyzer_frames(self):
        return [await self.get_synthforge_part_analyzer_frame(0)] * 16

    async def get_synthforge_part_backend_status(self, _part_index):
        return {
            "backend": self.backend,
            "sfizz_available": True,
            "sfizz_loaded": self.backend == "sfizz",
            "region_count": 12,
            "group_count": 5,
            "preloaded_samples": 9,
            "unknown_opcodes": [],
            "unsupported_opcodes": [],
        }

    async def get_synthforge_backend_status(self):
        return [await self.get_synthforge_part_backend_status(i) for i in range(16)]

    async def get_synthforge_metering(self):
        return {
            "voice_metrics": {
                "active_voices": 0,
                "peak_voices": 0,
                "voices_per_part": [0] * 16,
                "cpu_percent": 0.0,
            },
            "part_levels": [1.0] * 16,
        }

    async def inject_midi_note_on(self, channel, note, velocity):
        self.note_events.append(("on", channel, note, velocity))
        return True

    async def inject_midi_note_off(self, channel, note, velocity):
        self.note_events.append(("off", channel, note, velocity))
        return True


def test_get_parts_returns_16_entries(monkeypatch):
    monkeypatch.setattr(
        synthforge_routes,
        "get_audio_engine",
        lambda: _DummySynthForgeService(),
    )

    payload = asyncio.run(synthforge_routes.get_parts())
    assert len(payload) == 16
    assert payload[0]["midi_channel"] == 1
    assert payload[15]["midi_channel"] == 16


def test_update_part_rejects_mismatched_part_index(monkeypatch):
    monkeypatch.setattr(
        synthforge_routes,
        "get_audio_engine",
        lambda: _DummySynthForgeService(),
    )

    config = synthforge_routes.PartConfig(
        part_index=0,
        midi_channel=1,
        output_bus="main",
        level=1.0,
        pan=0.0,
        mute=False,
        solo=False,
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(synthforge_routes.update_part_config(1, config))

    assert exc.value.status_code == 400
    assert "must match" in str(exc.value.detail)


def test_list_patches_returns_patch_models(monkeypatch):
    monkeypatch.setattr(
        synthforge_routes,
        "get_audio_engine",
        lambda: _DummySynthForgeService(),
    )

    patches = asyncio.run(synthforge_routes.list_patches())
    assert len(patches) == 1
    assert patches[0].name == "Init Multi"
    assert patches[0].category == "factory"


def test_get_part_parameters_rejects_invalid_part():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(synthforge_routes.get_part_parameters(16))
    assert exc.value.status_code == 400


def test_set_part_parameter_success(monkeypatch):
    monkeypatch.setattr(
        synthforge_routes,
        "get_audio_engine",
        lambda: _DummySynthForgeService(),
    )

    request = synthforge_routes.ParameterUpdateRequest(param="osc1.level", value=0.7)
    payload = asyncio.run(synthforge_routes.set_part_parameter(0, request))

    assert payload["status"] == "ok"
    assert payload["part_index"] == 0
    assert payload["param"] == "osc1.level"


def test_load_part_sfz_rejects_non_sfz(monkeypatch):
    monkeypatch.setattr(
        synthforge_routes,
        "get_audio_engine",
        lambda: _DummySynthForgeService(),
    )

    request = synthforge_routes.SfzLoadRequest(part_index=0, sfz_path="/tmp/not_sfz.wav")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(synthforge_routes.load_part_sfz(request))

    assert exc.value.status_code == 400
    assert ".sfz" in str(exc.value.detail)


def test_load_part_sfz_success(monkeypatch):
    monkeypatch.setattr(
        synthforge_routes,
        "get_audio_engine",
        lambda: _DummySynthForgeService(),
    )

    request = synthforge_routes.SfzLoadRequest(part_index=2, sfz_path="/tmp/pad.sfz")
    payload = asyncio.run(synthforge_routes.load_part_sfz(request))

    assert payload["status"] == "ok"
    assert payload["part_index"] == 2
    assert payload["sample_status"]["loaded"] is True


def test_get_part_sfz_status(monkeypatch):
    monkeypatch.setattr(
        synthforge_routes,
        "get_audio_engine",
        lambda: _DummySynthForgeService(),
    )

    payload = asyncio.run(synthforge_routes.get_part_sfz_status(3))
    assert payload["part_index"] == 3
    assert payload["loaded"] is True


def test_inject_note_on_success(monkeypatch):
    service = _DummySynthForgeService()
    monkeypatch.setattr(
        synthforge_routes,
        "get_audio_engine",
        lambda: service,
    )

    request = synthforge_routes.MidiNoteRequest(channel=2, note=64, velocity=110)
    payload = asyncio.run(synthforge_routes.inject_note_on(request))

    assert payload["status"] == "ok"
    assert payload["channel"] == 2
    assert payload["note"] == 64
    assert service.note_events == [("on", 2, 64, 110)]


def test_inject_note_off_success(monkeypatch):
    service = _DummySynthForgeService()
    monkeypatch.setattr(
        synthforge_routes,
        "get_audio_engine",
        lambda: service,
    )

    request = synthforge_routes.MidiNoteOffRequest(channel=9, note=72, velocity=0)
    payload = asyncio.run(synthforge_routes.inject_note_off(request))

    assert payload["status"] == "ok"
    assert payload["channel"] == 9
    assert payload["note"] == 72
    assert service.note_events == [("off", 9, 72, 0)]


def test_inject_note_rejects_when_engine_unavailable(monkeypatch):
    class _FailingService(_DummySynthForgeService):
        async def inject_midi_note_on(self, _channel, _note, _velocity):
            return False

    monkeypatch.setattr(
        synthforge_routes,
        "get_audio_engine",
        lambda: _FailingService(),
    )

    request = synthforge_routes.MidiNoteRequest(channel=1, note=60, velocity=100)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(synthforge_routes.inject_note_on(request))

    assert exc.value.status_code == 503


def test_sampler_backend_and_streaming_routes(monkeypatch):
    service = _DummySynthForgeService()
    monkeypatch.setattr(
        synthforge_routes,
        "get_audio_engine",
        lambda: service,
    )

    backend_payload = asyncio.run(
        synthforge_routes.set_part_sampler_backend(
            0,
            synthforge_routes.SamplerBackendRequest(backend="sfizz"),
        )
    )
    assert backend_payload["backend"] == "sfizz"

    backend_read = asyncio.run(synthforge_routes.get_part_sampler_backend(0))
    assert backend_read["backend"] == "sfizz"

    streaming_payload = asyncio.run(
        synthforge_routes.set_part_streaming_config(
            0,
            synthforge_routes.StreamingConfigRequest(
                enabled=True,
                preload_size=262144,
                max_voices=96,
                interpolation="sinc",
                quality_live=8,
                quality_freewheeling=10,
                memory_limit_mb=768,
            ),
        )
    )
    assert streaming_payload["config"]["interpolation"] == "sinc"

    streaming_read = asyncio.run(synthforge_routes.get_part_streaming_config(0))
    assert streaming_read["max_voices"] == 96


def test_hot_reload_and_reload_if_changed_routes(monkeypatch):
    service = _DummySynthForgeService()
    monkeypatch.setattr(
        synthforge_routes,
        "get_audio_engine",
        lambda: service,
    )

    hot_payload = asyncio.run(
        synthforge_routes.set_part_hot_reload(
            0,
            synthforge_routes.HotReloadRequest(enabled=True, interval_ms=750),
        )
    )
    assert hot_payload["hot_reload"]["enabled"] is True
    assert hot_payload["hot_reload"]["interval_ms"] == 750

    reload_payload = asyncio.run(synthforge_routes.reload_part_sfz_if_changed(0))
    assert reload_payload["reloaded"] is True
    assert reload_payload["hot_reload"]["generation"] >= 1


def test_scala_mpe_and_mod_matrix_routes(monkeypatch):
    service = _DummySynthForgeService()
    monkeypatch.setattr(
        synthforge_routes,
        "get_audio_engine",
        lambda: service,
    )

    scala_payload = asyncio.run(
        synthforge_routes.load_part_scala_tuning(
            0,
            synthforge_routes.ScalaTuningRequest(
                scala_path="/tmp/test.scl",
                root_key=57,
                reference_hz=432.0,
            ),
        )
    )
    assert scala_payload["tuning"]["root_key"] == 57

    mpe_payload = asyncio.run(
        synthforge_routes.set_part_mpe_config(
            0,
            synthforge_routes.MpeConfigRequest(
                enabled=True,
                lower_zone_channels=8,
                upper_zone_channels=0,
                pitch_bend_range_semitones=24,
            ),
        )
    )
    assert mpe_payload["mpe"]["enabled"] is True

    mod_payload = asyncio.run(
        synthforge_routes.set_part_mod_matrix_routes(
            0,
            synthforge_routes.ModMatrixRoutesRequest(
                routes=[
                    synthforge_routes.ModMatrixRouteModel(
                        source="cc.1",
                        destination="filter1.cutoff",
                        amount=0.5,
                        bipolar=False,
                        enabled=True,
                    )
                ]
            ),
        )
    )
    assert len(mod_payload["routes"]) == 1


def test_freeze_render_analyzer_and_backend_status_routes(monkeypatch):
    service = _DummySynthForgeService()
    monkeypatch.setattr(
        synthforge_routes,
        "get_audio_engine",
        lambda: service,
    )

    freeze_payload = asyncio.run(
        synthforge_routes.set_part_freeze(
            0,
            synthforge_routes.FreezeRequest(enabled=True),
        )
    )
    assert freeze_payload["freeze"]["freeze_enabled"] is True

    render_payload = asyncio.run(
        synthforge_routes.render_part_to_file(
            0,
            synthforge_routes.RenderRequest(output_path="/tmp/synthforge-render.wav", duration_ms=500),
        )
    )
    assert render_payload["freeze"]["render_path"].endswith("synthforge-render.wav")

    analyzer = asyncio.run(synthforge_routes.get_part_analyzer_frame(0))
    assert analyzer["active_voices"] == 2

    backend = asyncio.run(synthforge_routes.get_part_backend_status(0))
    assert backend["backend"] in {"native", "sfizz"}

    all_backend = asyncio.run(synthforge_routes.get_backend_status())
    assert len(all_backend) == 16

from fastapi import FastAPI
from fastapi.testclient import TestClient


def test_audio_config_route_applies_audio_device(monkeypatch):
    from app.routes import audio as audio_routes

    class _FakeService:
        is_available = True

        def __init__(self):
            self.audio_device_calls: list[str] = []
            self.input_channel_mode_calls: list[str] = []
            self.input_gain_calls: list[float] = []
            self.output_gain_calls: list[float] = []

        async def set_audio_device(self, device_name: str) -> bool:
            self.audio_device_calls.append(device_name)
            return True

        async def set_sample_rate(self, sample_rate: int) -> bool:
            return True

        async def set_buffer_size(self, buffer_size: int) -> bool:
            return True

        async def set_input_channel_mode(self, mode: str) -> bool:
            self.input_channel_mode_calls.append(mode)
            return True

        async def set_input_gain_db(self, gain_db: float) -> bool:
            self.input_gain_calls.append(gain_db)
            return True

        async def set_output_gain_db(self, gain_db: float) -> bool:
            self.output_gain_calls.append(gain_db)
            return True

        def get_system_info(self):
            return {
                "sample_rate": 48000,
                "buffer_size": 256,
                "cpu_load": 9.5,
                "audio_device": self.audio_device_calls[-1] if self.audio_device_calls else "hw:2,0",
                "input_channel_mode": self.input_channel_mode_calls[-1] if self.input_channel_mode_calls else "stereo",
                "input_gain_db": self.input_gain_calls[-1] if self.input_gain_calls else 0.0,
                "output_gain_db": self.output_gain_calls[-1] if self.output_gain_calls else 0.0,
            }

    service = _FakeService()
    monkeypatch.setattr(audio_routes, "get_engine_service", lambda: service)

    app = FastAPI()
    app.include_router(audio_routes.router)
    client = TestClient(app)

    response = client.post("/api/audio/config?audio_device=hw:3,0&input_channel_mode=mono_left&input_gain_db=6&output_gain_db=-3")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["updated_settings"]["audio_device"] == "hw:3,0"
    assert payload["updated_settings"]["input_channel_mode"] == "mono_left"
    assert payload["updated_settings"]["input_gain_db"] == 6.0
    assert payload["updated_settings"]["output_gain_db"] == -3.0
    assert payload["current_config"]["audio_device"] == "hw:3,0"
    assert payload["current_config"]["input_channel_mode"] == "mono_left"
    assert payload["current_config"]["input_gain_db"] == 6.0
    assert payload["current_config"]["output_gain_db"] == -3.0
    assert service.audio_device_calls == ["hw:3,0"]
    assert service.input_channel_mode_calls == ["mono_left"]
    assert service.input_gain_calls == [6.0]
    assert service.output_gain_calls == [-3.0]

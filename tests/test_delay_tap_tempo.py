import asyncio
import json

from app.routes import delay


class _DummyEngine:
    def __init__(self) -> None:
        self.tempo_values = []

    async def set_delay_tempo(self, tempo: float) -> None:
        self.tempo_values.append(tempo)


def test_tap_tempo_persist_and_load_roundtrip(tmp_path, monkeypatch):
    store_path = tmp_path / "delay_tap_tempo.json"
    monkeypatch.setattr(delay, "_tap_state_path", store_path)

    with delay._tap_lock:
        delay._tap_times = [float(i) for i in range(12)]

    delay._persist_tap_tempo()

    with delay._tap_lock:
        delay._tap_times = []

    delay._load_tap_tempo()

    with delay._tap_lock:
        assert delay._tap_times == [float(i) for i in range(4, 12)]


def test_tap_tempo_load_malformed_file_resets_state(tmp_path, monkeypatch):
    store_path = tmp_path / "delay_tap_tempo.json"
    store_path.write_text("{broken-json", encoding="utf-8")
    monkeypatch.setattr(delay, "_tap_state_path", store_path)

    with delay._tap_lock:
        delay._tap_times = [1000.0, 1500.0]

    delay._load_tap_tempo()

    with delay._tap_lock:
        assert delay._tap_times == []


def test_tap_tempo_calculates_and_persists(tmp_path, monkeypatch):
    store_path = tmp_path / "delay_tap_tempo.json"
    monkeypatch.setattr(delay, "_tap_state_path", store_path)

    dummy_engine = _DummyEngine()
    monkeypatch.setattr(delay, "get_audio_engine", lambda: dummy_engine)

    with delay._tap_lock:
        delay._tap_times = []

    first = asyncio.run(delay.tap_tempo(delay.TapTempoRequest(timestamp=1000.0)))
    second = asyncio.run(delay.tap_tempo(delay.TapTempoRequest(timestamp=1500.0)))

    assert first.tempo is None
    assert first.taps == 1
    assert second.tempo == 120.0
    assert second.taps == 2
    assert dummy_engine.tempo_values == [120.0]

    payload = json.loads(store_path.read_text(encoding="utf-8"))
    assert payload["tap_times"] == [1000.0, 1500.0]


def test_clear_tap_tempo_persists_empty_state(tmp_path, monkeypatch):
    store_path = tmp_path / "delay_tap_tempo.json"
    monkeypatch.setattr(delay, "_tap_state_path", store_path)

    with delay._tap_lock:
        delay._tap_times = [1000.0, 1500.0]

    response = asyncio.run(delay.clear_tap_tempo())

    assert response == {"status": "ok"}
    with delay._tap_lock:
        assert delay._tap_times == []

    payload = json.loads(store_path.read_text(encoding="utf-8"))
    assert payload["tap_times"] == []

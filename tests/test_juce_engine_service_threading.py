from __future__ import annotations

import asyncio

from app.services.juce_engine_service import JuceEngineService


class _Engine:
    def __init__(self) -> None:
        self.calls: list[tuple[str, tuple[object, ...]]] = []

    def set_bypass(self, instance_id: int, bypass: bool) -> bool:
        self.calls.append(("set_bypass", (instance_id, bypass)))
        return True

    def get_current_snapshot(self) -> int:
        self.calls.append(("get_current_snapshot", ()))
        return 2

    def enable_midi(self, enable: bool) -> bool:
        self.calls.append(("enable_midi", (enable,)))
        return enable

    def get_midi_devices(self):
        self.calls.append(("get_midi_devices", ()))
        return ["dev-a"]

    def get_spectrum(self):
        self.calls.append(("get_spectrum", ()))
        return {
            "magnitudes": [0.1],
            "frequencies": [110.0],
            "peak_frequency": 110.0,
            "peak_magnitude": -12.0,
            "spectral_centroid": 110.0,
        }

    def connect_sidechain(self, source: int, dest: int, dest_bus: int) -> bool:
        self.calls.append(("connect_sidechain", (source, dest, dest_bus)))
        return True


def test_run_engine_call_uses_worker_thread_helper(monkeypatch):
    service = JuceEngineService()
    service._engine = _Engine()
    seen: list[tuple[str, tuple[object, ...]]] = []

    async def _fake_to_thread(func, *args, **kwargs):
        seen.append((func.__name__, args))
        return func(*args, **kwargs)

    monkeypatch.setattr("app.services.juce_engine_service.asyncio.to_thread", _fake_to_thread)

    assert asyncio.run(service.set_bypass(12, True)) is True
    assert asyncio.run(service.get_current_snapshot()) == 2
    assert asyncio.run(service.enable_midi(True)) is True
    assert asyncio.run(service.get_midi_devices()) == ["dev-a"]
    assert asyncio.run(service.get_spectrum())["peak_frequency"] == 110.0
    assert asyncio.run(service.connect_sidechain(1, 2, 3)) is True

    assert seen == [
        ("set_bypass", (12, True)),
        ("get_current_snapshot", ()),
        ("enable_midi", (True,)),
        ("get_midi_devices", ()),
        ("get_spectrum", ()),
        ("connect_sidechain", (1, 2, 3)),
    ]


def test_inject_midi_note_methods_use_worker_thread(monkeypatch):
    service = JuceEngineService()

    class _MidiEngine:
        def midi_inject_note_on(self, channel, note, velocity):
            return (channel, note, velocity) == (1, 60, 100)

        def midi_inject_note_off(self, channel, note, velocity):
            return (channel, note, velocity) == (1, 60, 0)

    service._engine = _MidiEngine()
    seen: list[tuple[str, tuple[object, ...]]] = []

    async def _fake_to_thread(func, *args, **kwargs):
        seen.append((func.__name__, args))
        return func(*args, **kwargs)

    monkeypatch.setattr("app.services.juce_engine_service.asyncio.to_thread", _fake_to_thread)

    assert asyncio.run(service.inject_midi_note_on(1, 60, 100)) is True
    assert asyncio.run(service.inject_midi_note_off(1, 60, 0)) is True
    assert seen == [
        ("midi_inject_note_on", (1, 60, 100)),
        ("midi_inject_note_off", (1, 60, 0)),
    ]

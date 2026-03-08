import asyncio

from app.services.juce_engine_service import JuceEngineService


class _DummyEngine:
    def __init__(self):
        self.calls = []

    def midi_inject_note_on(self, channel, note, velocity):
        self.calls.append(("on", channel, note, velocity))
        return True

    def midi_inject_note_off(self, channel, note, velocity):
        self.calls.append(("off", channel, note, velocity))
        return True


def test_inject_midi_note_methods_delegate_to_engine_binding():
    service = JuceEngineService()
    service._engine = _DummyEngine()

    on_ok = asyncio.run(service.inject_midi_note_on(1, 60, 100))
    off_ok = asyncio.run(service.inject_midi_note_off(1, 60, 0))

    assert on_ok is True
    assert off_ok is True
    assert service._engine.calls == [
        ("on", 1, 60, 100),
        ("off", 1, 60, 0),
    ]


def test_inject_midi_note_methods_return_false_when_binding_missing():
    service = JuceEngineService()
    service._engine = object()

    assert asyncio.run(service.inject_midi_note_on(1, 60, 100)) is False
    assert asyncio.run(service.inject_midi_note_off(1, 60, 0)) is False

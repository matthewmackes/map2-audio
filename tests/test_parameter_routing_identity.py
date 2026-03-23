import pytest

from app.services import parameter_routing


class _FakeRTBridge:
    def __init__(self) -> None:
        self.engine_callback = None
        self.midi_updates: list[tuple[str, int, float, int | None, int | None]] = []
        self.automation_updates: list[tuple[str, int, float, int | None, int | None]] = []

    def set_engine_callback(self, callback):
        self.engine_callback = callback

    async def update_from_midi(
        self,
        plugin_uri: str,
        param_index: int,
        value: float,
        *,
        plugin_position: int | None = None,
        instance_id: int | None = None,
    ):
        self.midi_updates.append((plugin_uri, param_index, value, instance_id, plugin_position))

    async def update_from_automation(
        self,
        plugin_uri: str,
        param_index: int,
        value: float,
        *,
        plugin_position: int | None = None,
        instance_id: int | None = None,
    ):
        self.automation_updates.append((plugin_uri, param_index, value, instance_id, plugin_position))


class _FakeMIDIEngineService:
    _instance = None
    instances: list["_FakeMIDIEngineService"] = []

    def __init__(self):
        self.parameter_callback = None
        _FakeMIDIEngineService.instances.append(self)

    def set_parameter_callback(self, callback):
        self.parameter_callback = callback


class _FakeAutomationEngine:
    def __init__(self) -> None:
        self.parameter_callback = None

    def set_parameter_callback(self, callback):
        self.parameter_callback = callback


class _FakeDispatcher:
    def __init__(self) -> None:
        self.load_called = False
        self.engine = None
        self.dispatch_calls: list[tuple[str, int, float]] = []

    def load(self):
        self.load_called = True

    def set_engine(self, engine):
        self.engine = engine

    def dispatch(self, plugin_uri: str, param_index: int, value: float):
        self.dispatch_calls.append((plugin_uri, param_index, value))


class _FakeInnerEngine:
    def __init__(self) -> None:
        self.parameter_sets: list[tuple[int, int, float]] = []

    def set_parameter(self, instance_id: int, param_index: int, value: float):
        self.parameter_sets.append((instance_id, param_index, value))


class _FakeEngine:
    def __init__(self) -> None:
        self._engine = _FakeInnerEngine()

    def _get_instance_id_for_uri(self, plugin_uri: str, plugin_position: int | None = None):
        if plugin_uri == "map2://juce/amp/peavey5150" and plugin_position == 4:
            return 404
        if plugin_uri == "urn:test:lv2" and plugin_position == 7:
            return 707
        return None


@pytest.mark.asyncio
async def test_parameter_routing_preserves_plugin_position_for_engine_callback(monkeypatch):
    fake_bridge = _FakeRTBridge()
    fake_dispatcher = _FakeDispatcher()
    fake_engine = _FakeEngine()
    fake_automation = _FakeAutomationEngine()
    _FakeMIDIEngineService.instances.clear()
    _FakeMIDIEngineService._instance = None

    monkeypatch.setattr("app.services.realtime_parameter_bridge.rt_parameter_bridge", fake_bridge)
    monkeypatch.setattr("app.services.midi_engine.MIDIEngineService", _FakeMIDIEngineService)
    monkeypatch.setattr("app.services.automation_engine.automation_engine", fake_automation)
    monkeypatch.setattr("app.services.juce_engine_service.get_audio_engine", lambda: fake_engine)
    monkeypatch.setattr("app.services.juce_rt_dispatcher.juce_rt_dispatcher", fake_dispatcher)

    await parameter_routing.connect_parameter_routing()

    midi_engine = _FakeMIDIEngineService.instances[0]
    assert midi_engine.parameter_callback is not None
    assert fake_automation.parameter_callback is not None
    assert fake_bridge.engine_callback is not None

    await midi_engine.parameter_callback("urn:test:lv2", 1, 0.5, 7, None)
    await fake_automation.parameter_callback("urn:test:lv2", 2, 0.8, 7, None)

    assert fake_bridge.midi_updates == [("urn:test:lv2", 1, 0.5, None, 7)]
    assert fake_bridge.automation_updates == [("urn:test:lv2", 2, 0.8, None, 7)]

    fake_bridge.engine_callback("map2://juce/amp/peavey5150", 3, 0.25, None, 4)
    fake_bridge.engine_callback("map2://juce/amp/peavey5150", 1, 0.1, None, None)
    fake_bridge.engine_callback("urn:test:lv2", 5, 0.9, None, 7)

    assert fake_dispatcher.dispatch_calls == [("map2://juce/amp/peavey5150", 1, 0.1)]
    assert fake_engine._engine.parameter_sets == [
        (404, 3, 0.25),
        (707, 5, 0.9),
    ]

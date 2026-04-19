from __future__ import annotations

from app.services.automation_engine import AutomationEngine, ModulationSource
from app.services.maschine.maschine_mk1_daemon import DaemonConfig, MaschineMK1Daemon
from app.services.maschine.mk1_protocol import PadEvent
from app.services.performance_brain_service import PerformanceBrainService


def test_automation_engine_midi_source_uses_latest_external_value() -> None:
    engine = AutomationEngine(sample_rate=48000, buffer_size=64)
    lane = engine.add_lane("urn:test:eq", 4, plugin_position=2, modulation_source=ModulationSource.MIDI)
    assert engine.configure_midi_source(lane.parameter_id, "maschine.pad.3") is True

    engine.push_midi_modulation("maschine.pad.3", 0.75)

    assert engine.get_parameter_value(lane.parameter_id, time=0.0) == 0.75


def test_daemon_pad_dispatch_fans_out_pressure_to_automation_and_brain(monkeypatch) -> None:
    daemon = MaschineMK1Daemon(DaemonConfig())
    daemon._midi.send_messages = lambda _messages: None
    daemon._enqueue_backend_message = lambda _payload: None

    pushed: list[tuple[str, float]] = []

    class _FakeAutomationEngine:
        @staticmethod
        def push_midi_modulation(source_id: str, normalized_value: float) -> None:
            pushed.append((source_id, normalized_value))

    class _FakeClient:
        def post(self, *_args, **_kwargs):
            raise AssertionError("pad selection should not post without audio-grid blocks")

    brain = PerformanceBrainService(root_path=None)
    brain._pad_pressure_observers.clear()

    monkeypatch.setattr("app.services.maschine.maschine_mk1_daemon.automation_engine", _FakeAutomationEngine())
    monkeypatch.setattr("app.services.maschine.maschine_mk1_daemon.get_performance_brain_service", lambda: brain)

    daemon._dispatch_pad_event(_FakeClient(), PadEvent(pad=2, pressure=2048, pressed=True), {}, {})

    assert pushed == [("maschine.pad.2", 2048 / 4095.0)]
    snapshot = brain.get_pad_pressure_snapshot()
    assert snapshot["pads"][0]["pad"] == 2
    assert snapshot["pads"][0]["pressed"] is True
    assert snapshot["pads"][0]["pressure"] == 2048

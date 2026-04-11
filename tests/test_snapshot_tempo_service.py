import types

import pytest

from app.services import snapshot_runtime_service, snapshot_tempo_service


class _FakeClockEngine:
    def __init__(self, *, snapshot_sync_enabled: bool, output_ports: list[str] | None = None) -> None:
        self._status = {
            "bpm": 120.0,
            "running": False,
            "source_mode": "external",
            "output_ports": list(output_ports or []),
            "snapshot_sync_enabled": snapshot_sync_enabled,
            "divider": 1.0,
            "multiplier": 1.0,
            "offset_ms": 0.0,
            "detected_bpm": None,
            "song_position": 0,
            "tap_note": None,
            "tap_cc": None,
        }
        self.configure_calls: list[dict[str, object]] = []
        self.start_calls = 0

    def status(self) -> dict[str, object]:
        return dict(self._status)

    def configure(self, **updates: object) -> dict[str, object]:
        self.configure_calls.append(dict(updates))
        self._status.update(updates)
        return self.status()

    async def start(self) -> dict[str, object]:
        self.start_calls += 1
        self._status["running"] = True
        return self.status()


@pytest.mark.asyncio
async def test_snapshot_tempo_service_tracks_live_override_and_syncs_clock(monkeypatch: pytest.MonkeyPatch):
    snapshot_tempo_service.reset_snapshot_tempo_service()
    fake_clock = _FakeClockEngine(snapshot_sync_enabled=True, output_ports=["din-out"])
    fake_automation = types.SimpleNamespace(tempo_values=[])

    def _set_tempo(value: float) -> None:
        fake_automation.tempo_values.append(float(value))

    fake_automation.set_tempo = _set_tempo
    applied_plugin_tempos: list[tuple[dict[str, object], float]] = []

    async def _fake_apply_snapshot_tempo_to_engine(snapshot_data, bpm):
        applied_plugin_tempos.append((snapshot_data, float(bpm)))
        return 1

    monkeypatch.setattr(snapshot_tempo_service, "get_midi_clock_engine", lambda: fake_clock)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_tempo_to_engine", _fake_apply_snapshot_tempo_to_engine)

    import app.services.automation_engine as automation_module

    monkeypatch.setattr(automation_module, "automation_engine", fake_automation)

    service = snapshot_tempo_service.get_snapshot_tempo_service()
    activation = await service.activate_snapshot(7, 132.0, snapshot_data={"chains": {}})
    assert activation["tempo_source"] == "stored"
    assert activation["active_tempo_bpm"] == 132.0
    assert fake_clock.configure_calls[0]["bpm"] == 132.0
    assert fake_clock.configure_calls[0]["source_mode"] == "internal"
    assert fake_clock.start_calls == 1

    first_tap = await service.tap_tempo(7, 132.0, snapshot_data={"chains": {}}, timestamp_ms=1000.0)
    assert first_tap["tempo_source"] == "stored"
    assert first_tap["active_tempo_bpm"] == 132.0

    second_tap = await service.tap_tempo(7, 132.0, snapshot_data={"chains": {}}, timestamp_ms=1500.0)
    assert second_tap["tempo_source"] == "tap"
    assert second_tap["live_tempo_bpm"] == 120.0
    assert second_tap["active_tempo_bpm"] == 120.0

    updated = await service.update_stored_tempo(7, 140.0, snapshot_data={"chains": {}})
    assert updated["stored_tempo_bpm"] == 140.0
    assert updated["active_tempo_bpm"] == 120.0
    assert updated["tempo_source"] == "tap"

    reset = await service.reset_tempo(7, 140.0, snapshot_data={"chains": {}})
    assert reset["tempo_source"] == "stored"
    assert reset["active_tempo_bpm"] == 140.0

    next_snapshot = await service.activate_snapshot(8, 90.0, snapshot_data={"chains": {}})
    assert next_snapshot["tempo_source"] == "stored"
    assert next_snapshot["active_tempo_bpm"] == 90.0
    assert fake_automation.tempo_values == [132.0, 120.0, 140.0, 90.0]
    assert [bpm for (_snapshot_data, bpm) in applied_plugin_tempos] == [132.0, 120.0, 140.0, 90.0]


@pytest.mark.asyncio
async def test_apply_snapshot_tempo_to_engine_updates_only_synced_or_dedicated_bpm_parameters(monkeypatch: pytest.MonkeyPatch):
    class _FakeEngine:
        is_available = True
        is_running = True

        def __init__(self) -> None:
            self.calls: list[tuple[str, str, float, int | None]] = []

        async def set_parameter(self, plugin_uri: str, param_name: str, value: float, *, plugin_position=None):
            self.calls.append((plugin_uri, param_name, float(value), plugin_position))
            return True

    fake_engine = _FakeEngine()

    import app.services.juce_engine_service as juce_engine_module
    import app.routes.plugins as plugins_module

    monkeypatch.setattr(juce_engine_module, "get_audio_engine", lambda: fake_engine)
    monkeypatch.setattr(
        plugins_module,
        "_discovered_plugins",
        [
            {
                "uri": "map2://juce/delay",
                "parameters": [
                    {"symbol": "delay_time_l", "name": "Delay L"},
                    {"symbol": "tempo", "name": "Tempo"},
                    {"symbol": "tempo_sync_l", "name": "Sync L"},
                ],
            },
            {
                "uri": "urn:test:unsynced",
                "parameters": [
                    {"symbol": "bpm", "name": "BPM"},
                    {"symbol": "beat_sync", "name": "Beat Sync"},
                ],
            },
            {
                "uri": "urn:test:free-bpm",
                "parameters": [
                    {"symbol": "bpm", "name": "BPM"},
                ],
            },
        ],
    )

    params_applied = await snapshot_runtime_service.apply_snapshot_tempo_to_engine(
        {
            "chains": {
                "1": {
                    "plugins": [
                        {
                            "uri": "map2://juce/delay",
                            "position": 0,
                            "parameters": {"2": 4, "1": 110.0},
                        },
                        {
                            "uri": "urn:test:unsynced",
                            "position": 1,
                            "parameters": {"0": 90.0, "1": 0},
                        },
                        {
                            "uri": "urn:test:free-bpm",
                            "position": 2,
                            "parameters": {"0": 90.0},
                        },
                    ]
                }
            }
        },
        136.0,
    )

    assert params_applied == 2
    assert fake_engine.calls == [
        ("map2://juce/delay", "tempo", 136.0, 0),
        ("urn:test:free-bpm", "bpm", 136.0, 2),
    ]


def test_snapshot_tempo_service_singleton_reset():
    snapshot_tempo_service.reset_snapshot_tempo_service()
    first = snapshot_tempo_service.get_snapshot_tempo_service()
    second = snapshot_tempo_service.get_snapshot_tempo_service()
    assert first is second

    snapshot_tempo_service.reset_snapshot_tempo_service()
    replacement = snapshot_tempo_service.get_snapshot_tempo_service()
    assert replacement is not first

import json

from app.services import drum_machine_service as drum_machine_service_module
from app.services import drum_sequencer_service as sequencer_service_module


class _FakeSequencerEngine:
    def __init__(self):
        self.patterns = {}
        self.song = []
        self.swing = 0.0
        self.accent_velocity = 127
        self.song_loop = False

    def get_drum_pattern_data(self, pattern_id):
        return self.patterns.get(pattern_id, self._default_pattern(pattern_id))

    def clear_drum_pattern(self, pattern_id):
        self.patterns[pattern_id] = self._default_pattern(pattern_id)
        return True

    def set_drum_pattern_length(self, pattern_id, steps):
        pattern = self.patterns.setdefault(pattern_id, self._default_pattern(pattern_id))
        pattern["length"] = steps
        return True

    def set_drum_step(self, pattern_id, instrument, step, velocity, accent=False):
        pattern = self.patterns.setdefault(pattern_id, self._default_pattern(pattern_id))
        pattern["steps"][instrument][step] = {"velocity": velocity, "accent": accent}
        return True

    def get_drum_song(self):
        return list(self.song)

    def clear_drum_song(self):
        self.song = []
        return True

    def add_drum_song_entry(self, pattern, repeat_count, position=-1):
        entry = {"pattern": pattern, "repeat_count": repeat_count}
        if position < 0 or position >= len(self.song):
            self.song.append(entry)
        else:
            self.song.insert(position, entry)
        return True

    def set_drum_song_loop(self, enabled):
        self.song_loop = enabled
        return True

    def get_drum_song_loop(self):
        return self.song_loop

    def set_drum_swing(self, percent):
        self.swing = percent
        return True

    def get_drum_swing(self):
        return self.swing

    def set_drum_accent_velocity(self, velocity):
        self.accent_velocity = velocity
        return True

    def get_drum_accent_velocity(self):
        return self.accent_velocity

    @staticmethod
    def _default_pattern(pattern_id):
        return {
            "length": 16,
            "steps": [
                [{"velocity": 0, "accent": False} for _ in range(64)]
                for _ in range(16)
            ],
            "pattern_id": pattern_id,
        }


def _build_service(tmp_path, monkeypatch):
    patterns_dir = tmp_path / "patterns"
    bundles_dir = tmp_path / "bundles"
    autosave_path = tmp_path / "sequencer-autosave.json"
    fake_engine = _FakeSequencerEngine()
    fake_engine_service = type("FakeEngineService", (), {"engine": fake_engine})()

    monkeypatch.setattr(sequencer_service_module, "_PATTERNS_DIR", patterns_dir)
    monkeypatch.setattr(sequencer_service_module, "_BUNDLES_DIR", bundles_dir)
    monkeypatch.setattr(sequencer_service_module, "_AUTOSAVE_PATH", autosave_path)
    monkeypatch.setattr(sequencer_service_module, "get_audio_engine", lambda: fake_engine_service)
    sequencer_service_module.DrumSequencerService.reset_instance()

    monkeypatch.setattr(drum_machine_service_module, "get_audio_engine", lambda: fake_engine_service)
    drum_machine_service_module.DrumMachineService.reset_instance()

    return (
        sequencer_service_module.get_drum_sequencer_service(),
        drum_machine_service_module.get_drum_machine_service(),
        fake_engine,
        patterns_dir,
        bundles_dir,
        autosave_path,
    )


def test_drum_sequencer_service_persists_pattern_edits(tmp_path, monkeypatch):
    service, _, fake_engine, patterns_dir, _, _ = _build_service(tmp_path, monkeypatch)

    saved = service.save_pattern(
        7,
        {
            "length": 32,
            "steps": [
                [{"velocity": 0, "accent": False} for _ in range(64)]
                for _ in range(16)
            ],
        },
    )
    assert saved["length"] == 32

    updated = service.set_step(7, 3, 12, 99, True)
    assert updated["steps"][3][12]["velocity"] == 99
    assert updated["steps"][3][12]["accent"] is True
    assert fake_engine.get_drum_pattern_data(7)["steps"][3][12]["velocity"] == 99

    persisted = json.loads((patterns_dir / "pattern-007.json").read_text())
    assert persisted["steps"][3][12]["velocity"] == 99
    assert persisted["length"] == 32


def test_drum_sequencer_service_round_trips_bundle_and_song(tmp_path, monkeypatch):
    service, _, fake_engine, _, bundles_dir, _ = _build_service(tmp_path, monkeypatch)

    service.set_step(2, 1, 4, 88, False)
    fake_engine.set_drum_swing(18.5)
    fake_engine.set_drum_accent_velocity(116)
    fake_engine.add_drum_song_entry(2, 2, 0)
    fake_engine.add_drum_song_entry(9, 1, 1)
    fake_engine.set_drum_song_loop(True)

    saved = service.save_bundle("session-a", "/kits/factory.sfz")
    assert saved["bundle_id"] == "session-a"

    bundle_path = bundles_dir / "session-a.json"
    bundle = json.loads(bundle_path.read_text())
    assert bundle["song"][0]["pattern"] == 2
    assert bundle["song"][0]["repeat_count"] == 2
    assert bundle["swing"] == 18.5
    assert bundle["accent_velocity"] == 116

    fake_engine.clear_drum_pattern(2)
    fake_engine.clear_drum_song()
    fake_engine.set_drum_song_loop(False)
    fake_engine.set_drum_swing(0.0)
    fake_engine.set_drum_accent_velocity(127)

    loaded = service.load_bundle("session-a")
    assert loaded["song_loop"] is True
    assert fake_engine.get_drum_pattern_data(2)["steps"][1][4]["velocity"] == 88
    assert fake_engine.get_drum_song()[0]["pattern"] == 2
    assert fake_engine.get_drum_song_loop() is True
    assert fake_engine.get_drum_swing() == 18.5
    assert fake_engine.get_drum_accent_velocity() == 116


def test_drum_machine_transport_stop_triggers_sequencer_autosave(tmp_path, monkeypatch):
    _, drum_machine_service, fake_engine, _, _, autosave_path = _build_service(tmp_path, monkeypatch)

    fake_engine.set_drum_step(5, 0, 0, 120, False)
    fake_engine.add_drum_song_entry(5, 4, 0)
    fake_engine.set_drum_song_loop(True)

    transport = drum_machine_service.update_transport({"is_playing": False, "pattern": 5})
    assert transport["is_playing"] is False

    autosave = json.loads(autosave_path.read_text())
    assert autosave["bundle_id"] == "autosave"
    assert autosave["patterns"][5]["steps"][0][0]["velocity"] == 120
    assert autosave["song"][0]["pattern"] == 5
    assert autosave["song_loop"] is True

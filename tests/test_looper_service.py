"""T2512 — LooperService unit tests.

Initial focus: T2512-LOCK (per-track write-lock toggle, Python-only —
no engine dependency). Backstops the JS-level / route-level behavior
so the lock can never silently regress.
"""

from __future__ import annotations

import pytest

from app.services.looper_service import (
    LooperService,
    LooperServiceError,
    TrackState,
)


class _FakeEngine:
    """In-memory stand-in for the JuceAudioEngine pybind11 module.

    Tracks the last call site for each verb so tests can assert that
    locked verbs never reach the engine.
    """

    def __init__(self) -> None:
        self.record_calls: list[int] = []
        self.clear_calls: list[int] = []
        self.undo_calls: list[int] = []
        self.redo_calls: list[int] = []
        self.stop_calls: list[int] = []
        self.muted_calls: list[tuple[int, bool]] = []
        self.level_calls: list[tuple[int, float]] = []

    def looper_record(self, track: int) -> None:
        self.record_calls.append(track)

    def looper_stop(self, track: int) -> None:
        self.stop_calls.append(track)

    def looper_clear(self, track: int) -> None:
        self.clear_calls.append(track)

    def looper_undo(self, track: int) -> None:
        self.undo_calls.append(track)

    def looper_redo(self, track: int) -> None:
        self.redo_calls.append(track)

    def looper_set_muted(self, track: int, muted: bool) -> None:
        self.muted_calls.append((track, muted))

    def looper_set_level_db(self, track: int, db: float) -> None:
        self.level_calls.append((track, db))

    def looper_get_status(self) -> dict:
        # Return a stable 4-track empty snapshot — locking is a
        # service-layer overlay, not engine state.
        return {
            "tracks": [
                {
                    "track": i,
                    "state": int(TrackState.EMPTY),
                    "loop_length_frames": 0,
                    "playhead_frames": 0,
                    "layer_count": 0,
                    "level_db": 0.0,
                    "muted": False,
                    "soloed": False,
                    "reverse": False,
                    "half_speed": False,
                }
                for i in range(4)
            ],
            "active_track_count": 0,
            "sync_master": False,
            "master_level_db": 0.0,
        }


# ---------------------------------------------------------------------------
# T2512-LOCK
# ---------------------------------------------------------------------------


def test_locked_track_blocks_record() -> None:
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_locked(2, True)
    with pytest.raises(LooperServiceError) as exc:
        service.record(2)
    assert exc.value.code == "track_locked"
    assert engine.record_calls == []  # never reached the engine


def test_locked_track_blocks_clear_undo_redo() -> None:
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_locked(0, True)
    for verb_name, calls in (
        ("clear", engine.clear_calls),
        ("undo", engine.undo_calls),
        ("redo", engine.redo_calls),
    ):
        with pytest.raises(LooperServiceError) as exc:
            getattr(service, verb_name)(0)
        assert exc.value.code == "track_locked", verb_name
        assert calls == [], verb_name


def test_locked_track_still_allows_stop_and_mixer_verbs() -> None:
    """Locking protects loop *content*, not playback/mix verbs."""
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_locked(1, True)
    # Stop is permitted.
    service.stop_track(1)
    assert engine.stop_calls == [1]
    # Mute / level are permitted.
    service.set_muted(1, True)
    service.set_level_db(1, -6.0)
    assert engine.muted_calls == [(1, True)]
    assert engine.level_calls == [(1, -6.0)]


def test_unlock_restores_record() -> None:
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_locked(3, True)
    with pytest.raises(LooperServiceError):
        service.record(3)
    service.set_locked(3, False)
    service.record(3)
    assert engine.record_calls == [3]


def test_lock_is_per_track() -> None:
    """Locking track 0 does not affect track 1."""
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_locked(0, True)
    # Track 0 blocked.
    with pytest.raises(LooperServiceError):
        service.record(0)
    # Track 1 still works.
    service.record(1)
    assert engine.record_calls == [1]


def test_lock_state_surfaces_in_status() -> None:
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_locked(0, True)
    service.set_locked(2, True)
    status = service.get_status()
    assert status.tracks[0].locked is True
    assert status.tracks[1].locked is False
    assert status.tracks[2].locked is True
    assert status.tracks[3].locked is False


def test_set_locked_validates_track_index() -> None:
    service = LooperService()
    with pytest.raises(LooperServiceError) as exc:
        service.set_locked(4, True)
    assert exc.value.code == "invalid_track"


def test_lock_default_is_unlocked() -> None:
    service = LooperService()
    status = service.get_status()
    assert all(t.locked is False for t in status.tracks)


# ---------------------------------------------------------------------------
# T2512-WS — broadcaster injection
# ---------------------------------------------------------------------------


def test_broadcaster_fires_on_every_mutating_verb() -> None:
    engine = _FakeEngine()
    received: list = []
    service = LooperService(engine=engine, broadcaster=received.append)
    service.record(0)
    service.stop_track(0)
    service.clear(0)
    service.undo(0)
    service.redo(0)
    service.set_level_db(0, -6.0)
    service.set_muted(0, True)
    service.set_soloed(0, True)
    service.set_reverse(0, True)
    service.set_half_speed(0, True)
    service.set_master_level_db(0.0)
    service.set_locked(0, True)
    # 12 mutating verbs → 12 broadcasts.
    assert len(received) == 12


def test_get_status_does_not_broadcast() -> None:
    """Read-only inspection must never fire the broadcaster — it would
    create an infinite loop if the WS client pulls status on every push."""
    engine = _FakeEngine()
    received: list = []
    service = LooperService(engine=engine, broadcaster=received.append)
    service.get_status()
    service.get_status()
    assert received == []


def test_replace_broadcaster_swaps_destination() -> None:
    """The bridge replaces the broadcaster at lifespan startup; later
    broadcasts must hit the new sink."""
    engine = _FakeEngine()
    first: list = []
    second: list = []
    service = LooperService(engine=engine, broadcaster=first.append)
    service.record(0)
    service.replace_broadcaster(second.append)
    service.record(0)
    assert len(first) == 1
    assert len(second) == 1


def test_broadcaster_exception_does_not_break_verb() -> None:
    """A flaky WS layer can never bring down the operator control flow."""
    engine = _FakeEngine()

    def boom(_status) -> None:
        raise RuntimeError("WS layer down")

    service = LooperService(engine=engine, broadcaster=boom)
    # Should not raise.
    status = service.record(0)
    assert status.tracks[0].track == 0
    assert engine.record_calls == [0]


def test_no_broadcaster_means_silent_default() -> None:
    """Tests + early-lifespan callers don't have to wire a broadcaster."""
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    # Just ensure it doesn't raise.
    service.record(0)
    service.set_locked(0, True)


# ---------------------------------------------------------------------------
# T2512-OS — one-shot / trigger mode
# ---------------------------------------------------------------------------


def test_one_shot_default_is_off() -> None:
    service = LooperService()
    status = service.get_status()
    assert all(t.one_shot is False for t in status.tracks)


def test_set_one_shot_flips_flag_in_status() -> None:
    service = LooperService()
    service.set_one_shot(2, True)
    status = service.get_status()
    assert status.tracks[2].one_shot is True
    # Other tracks unaffected.
    assert all(
        status.tracks[i].one_shot is False for i in (0, 1, 3)
    )


def test_set_one_shot_persistent_across_state_transitions() -> None:
    """T2512-OS — flag must survive record/clear/undo/redo. The
    operator clears it explicitly, not implicitly."""
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_one_shot(0, True)
    service.record(0)
    service.stop_track(0)
    service.clear(0)
    status = service.get_status()
    assert status.tracks[0].one_shot is True


def test_set_one_shot_invalid_track_raises() -> None:
    service = LooperService()
    with pytest.raises(LooperServiceError) as exc:
        service.set_one_shot(7, True)
    assert exc.value.code == "invalid_track"


def test_set_one_shot_broadcasts() -> None:
    """T2512-OS hooked into the WS fan-out for live UI updates."""
    received: list = []
    service = LooperService(broadcaster=received.append)
    service.set_one_shot(0, True)
    service.set_one_shot(0, False)
    assert len(received) == 2


def test_one_shot_is_orthogonal_to_locked() -> None:
    """Locking a track does NOT lock the one_shot flag — the operator
    must be able to arm/disarm one-shot on a write-protected loop."""
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_locked(1, True)
    # Should succeed without raising.
    service.set_one_shot(1, True)
    status = service.get_status()
    assert status.tracks[1].locked is True
    assert status.tracks[1].one_shot is True


# ---------------------------------------------------------------------------
# T2512-CLOCK (inbound) — snapshot BPM surfaced in LooperStatus
# ---------------------------------------------------------------------------


def test_status_includes_bpm_field() -> None:
    """LooperStatus.bpm is always present (may be None) so the UI can
    rely on a stable field shape."""
    service = LooperService()
    status = service.get_status()
    # bpm is a top-level field on LooperStatus.
    assert hasattr(status, "bpm")


def test_status_bpm_reads_snapshot_tempo_service(monkeypatch) -> None:
    """get_status() pulls live BPM from SnapshotTempoService.current_bpm()."""
    service = LooperService()

    class _FakeTempo:
        def current_bpm(self) -> float:
            return 142.5

    import app.services.snapshot_tempo_service as tempo_mod
    monkeypatch.setattr(tempo_mod, "SnapshotTempoService", lambda: _FakeTempo())

    status = service.get_status()
    assert status.bpm == 142.5


def test_status_bpm_is_none_when_tempo_service_unavailable(monkeypatch) -> None:
    """A broken tempo service must not break the looper status read."""
    service = LooperService()

    def _boom():
        raise RuntimeError("tempo service down")

    import app.services.snapshot_tempo_service as tempo_mod
    monkeypatch.setattr(tempo_mod, "SnapshotTempoService", _boom)

    status = service.get_status()
    # Status still returns; bpm is None on tempo-read failure.
    assert status.bpm is None


def test_status_payload_includes_bpm_key() -> None:
    """LooperStatus.to_payload() includes bpm so the WS frame + HTTP
    response carry it through to the client."""
    service = LooperService()
    payload = service.get_status().to_payload()
    assert "bpm" in payload


# ---------------------------------------------------------------------------
# T2512-AUTO — auto-record state surface
# ---------------------------------------------------------------------------


def test_auto_armed_default_is_off() -> None:
    service = LooperService()
    status = service.get_status()
    assert all(t.auto_armed is False for t in status.tracks)


def test_auto_threshold_default_is_minus_36() -> None:
    """A sensible default for guitar input — quiet enough not to false-
    trigger from cabinet bleed, loud enough that a normal pick fires."""
    service = LooperService()
    status = service.get_status()
    assert all(t.auto_threshold_db == -36.0 for t in status.tracks)


def test_set_auto_armed_flips_flag() -> None:
    service = LooperService()
    service.set_auto_armed(2, True)
    status = service.get_status()
    assert status.tracks[2].auto_armed is True
    assert all(status.tracks[i].auto_armed is False for i in (0, 1, 3))


def test_set_auto_threshold_db_clamps_extreme_values() -> None:
    service = LooperService()
    service.set_auto_threshold_db(0, -200.0)  # below clamp
    service.set_auto_threshold_db(1, 50.0)     # above clamp
    service.set_auto_threshold_db(2, -24.0)
    status = service.get_status()
    assert status.tracks[0].auto_threshold_db == -90.0
    assert status.tracks[1].auto_threshold_db == 0.0
    assert status.tracks[2].auto_threshold_db == -24.0


def test_set_auto_armed_invalid_track_raises() -> None:
    service = LooperService()
    with pytest.raises(LooperServiceError) as exc:
        service.set_auto_armed(9, True)
    assert exc.value.code == "invalid_track"


def test_set_auto_threshold_invalid_track_raises() -> None:
    service = LooperService()
    with pytest.raises(LooperServiceError) as exc:
        service.set_auto_threshold_db(-1, -24.0)
    assert exc.value.code == "invalid_track"


def test_auto_state_broadcasts() -> None:
    """Auto setters fan out to the WS like any other mutating verb."""
    received: list = []
    service = LooperService(broadcaster=received.append)
    service.set_auto_armed(0, True)
    service.set_auto_threshold_db(0, -24.0)
    assert len(received) == 2


def test_auto_state_persistent_across_record() -> None:
    """T2512-AUTO state survives record/clear/undo/redo — the operator
    explicitly clears it, just like locked + one_shot."""
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_auto_armed(0, True)
    service.set_auto_threshold_db(0, -24.0)
    service.record(0)
    service.stop_track(0)
    service.clear(0)
    status = service.get_status()
    assert status.tracks[0].auto_armed is True
    assert status.tracks[0].auto_threshold_db == -24.0


def test_auto_state_payload_includes_both_keys() -> None:
    service = LooperService()
    payload = service.get_status().to_payload()
    assert "auto_armed" in payload["tracks"][0]
    assert "auto_threshold_db" in payload["tracks"][0]


# ---------------------------------------------------------------------------
# T2512-FADE — stop mode + fade duration state surface
# ---------------------------------------------------------------------------


def test_stop_mode_default_is_hard() -> None:
    service = LooperService()
    status = service.get_status()
    assert all(t.stop_mode == "hard" for t in status.tracks)


def test_fade_ms_default_is_250() -> None:
    service = LooperService()
    status = service.get_status()
    assert all(t.fade_ms == 250 for t in status.tracks)


def test_set_stop_mode_to_fade() -> None:
    service = LooperService()
    service.set_stop_mode(0, "fade")
    status = service.get_status()
    assert status.tracks[0].stop_mode == "fade"
    assert all(t.stop_mode == "hard" for t in status.tracks[1:])


def test_set_stop_mode_rejects_unknown_value() -> None:
    service = LooperService()
    with pytest.raises(LooperServiceError) as exc:
        service.set_stop_mode(0, "ramp")
    assert exc.value.code == "invalid_stop_mode"


def test_set_stop_mode_invalid_track_raises() -> None:
    service = LooperService()
    with pytest.raises(LooperServiceError) as exc:
        service.set_stop_mode(7, "fade")
    assert exc.value.code == "invalid_track"


def test_set_fade_ms_clamps_extreme_values() -> None:
    service = LooperService()
    service.set_fade_ms(0, -500)    # below clamp
    service.set_fade_ms(1, 99999)   # above clamp
    service.set_fade_ms(2, 1500)
    status = service.get_status()
    assert status.tracks[0].fade_ms == 0
    assert status.tracks[1].fade_ms == 5000
    assert status.tracks[2].fade_ms == 1500


def test_set_fade_ms_invalid_track_raises() -> None:
    service = LooperService()
    with pytest.raises(LooperServiceError) as exc:
        service.set_fade_ms(-1, 100)
    assert exc.value.code == "invalid_track"


def test_fade_state_broadcasts() -> None:
    received: list = []
    service = LooperService(broadcaster=received.append)
    service.set_stop_mode(0, "fade")
    service.set_fade_ms(0, 500)
    assert len(received) == 2


def test_fade_state_persistent_across_record() -> None:
    """Like other operator policy state, fade mode must survive
    record/clear/undo/redo."""
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_stop_mode(0, "fade")
    service.set_fade_ms(0, 750)
    service.record(0)
    service.stop_track(0)
    service.clear(0)
    status = service.get_status()
    assert status.tracks[0].stop_mode == "fade"
    assert status.tracks[0].fade_ms == 750


def test_fade_state_payload_includes_both_keys() -> None:
    service = LooperService()
    payload = service.get_status().to_payload()
    assert "stop_mode" in payload["tracks"][0]
    assert "fade_ms" in payload["tracks"][0]


# ---------------------------------------------------------------------------
# T2512-SNAP — export_state / apply_state primitive
# ---------------------------------------------------------------------------


def test_export_state_default_shape() -> None:
    service = LooperService()
    payload = service.export_state()
    assert payload["schema_version"] == 1
    assert len(payload["tracks"]) == 4
    for track in payload["tracks"]:
        assert track == {
            "locked": False,
            "one_shot": False,
            "auto_armed": False,
            "auto_threshold_db": -36.0,
            "stop_mode": "hard",
            "fade_ms": 250,
        }
    assert payload["master_level_db"] == 0.0


def test_export_state_reflects_operator_changes() -> None:
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_locked(0, True)
    service.set_one_shot(1, True)
    service.set_auto_armed(2, True)
    service.set_auto_threshold_db(2, -24.0)

    payload = service.export_state()
    assert payload["tracks"][0]["locked"] is True
    assert payload["tracks"][1]["one_shot"] is True
    assert payload["tracks"][2]["auto_armed"] is True
    assert payload["tracks"][2]["auto_threshold_db"] == -24.0


def test_apply_state_restores_full_payload() -> None:
    service = LooperService()
    payload = {
        "schema_version": 1,
        "tracks": [
            {"locked": True,  "one_shot": False, "auto_armed": True,
             "auto_threshold_db": -18.0},
            {"locked": False, "one_shot": True,  "auto_armed": False,
             "auto_threshold_db": -36.0},
            {"locked": False, "one_shot": False, "auto_armed": False,
             "auto_threshold_db": -42.0},
            {"locked": True,  "one_shot": True,  "auto_armed": True,
             "auto_threshold_db": -60.0},
        ],
        "master_level_db": -6.0,
    }
    service.apply_state(payload)
    status = service.get_status()
    assert status.tracks[0].locked is True
    assert status.tracks[0].auto_armed is True
    assert status.tracks[0].auto_threshold_db == -18.0
    assert status.tracks[1].one_shot is True
    assert status.tracks[2].auto_threshold_db == -42.0
    assert status.tracks[3].locked is True
    assert status.tracks[3].one_shot is True


def test_apply_state_tolerates_missing_keys() -> None:
    """A payload with only some fields must not crash; missing fields
    keep their prior value."""
    service = LooperService()
    service.set_locked(0, True)
    service.apply_state({
        "tracks": [
            {"one_shot": True},  # only this key
            {},
            {},
            {},
        ],
    })
    status = service.get_status()
    # locked preserved, one_shot applied.
    assert status.tracks[0].locked is True
    assert status.tracks[0].one_shot is True


def test_apply_state_ignores_unknown_future_fields() -> None:
    service = LooperService()
    service.apply_state({
        "schema_version": 99,
        "tracks": [
            {"locked": True, "future_knob": "hello"},
            {}, {}, {},
        ],
        "future_block": {"key": "value"},
    })
    status = service.get_status()
    assert status.tracks[0].locked is True


def test_apply_state_drops_non_dict_payload() -> None:
    service = LooperService()
    # Must not raise.
    service.apply_state("not a dict")  # type: ignore[arg-type]
    service.apply_state(None)  # type: ignore[arg-type]
    service.apply_state([])  # type: ignore[arg-type]


def test_apply_state_clamps_extreme_threshold_db() -> None:
    service = LooperService()
    service.apply_state({
        "tracks": [
            {"auto_threshold_db": -200.0},  # below clamp
            {"auto_threshold_db": 50.0},     # above clamp
            {}, {},
        ],
    })
    status = service.get_status()
    assert status.tracks[0].auto_threshold_db == -90.0
    assert status.tracks[1].auto_threshold_db == 0.0


def test_apply_state_broadcasts_once() -> None:
    """Bulk apply should fan out a single status broadcast, not one
    per modified field (would flood subscribers)."""
    received: list = []
    service = LooperService(broadcaster=received.append)
    service.apply_state({
        "tracks": [
            {"locked": True, "one_shot": True, "auto_armed": True,
             "auto_threshold_db": -24.0},
            {}, {}, {},
        ],
        "master_level_db": -6.0,
    })
    assert len(received) == 1


def test_apply_state_handles_short_tracks_array() -> None:
    """Older snapshot payload with fewer than 4 tracks must not crash."""
    service = LooperService()
    service.apply_state({
        "tracks": [
            {"locked": True},
            {"one_shot": True},
        ],
    })
    status = service.get_status()
    assert status.tracks[0].locked is True
    assert status.tracks[1].one_shot is True
    # Tracks 2, 3 still default.
    assert status.tracks[2].locked is False


def test_export_state_includes_fade_fields() -> None:
    """T2512-FADE — stop_mode + fade_ms must be in the snapshot payload."""
    service = LooperService()
    service.set_stop_mode(0, "fade")
    service.set_fade_ms(0, 1000)
    payload = service.export_state()
    assert payload["tracks"][0]["stop_mode"] == "fade"
    assert payload["tracks"][0]["fade_ms"] == 1000


def test_apply_state_restores_fade_fields() -> None:
    service = LooperService()
    service.apply_state({
        "tracks": [
            {"stop_mode": "fade", "fade_ms": 750},
            {"stop_mode": "hard", "fade_ms": 100},
            {}, {},
        ],
    })
    status = service.get_status()
    assert status.tracks[0].stop_mode == "fade"
    assert status.tracks[0].fade_ms == 750
    assert status.tracks[1].stop_mode == "hard"
    assert status.tracks[1].fade_ms == 100


def test_apply_state_drops_invalid_stop_mode() -> None:
    """An unknown stop_mode value must NOT be applied — keep the
    prior valid value rather than corrupt the service state."""
    service = LooperService()
    service.set_stop_mode(0, "fade")
    service.apply_state({
        "tracks": [
            {"stop_mode": "ramp"},  # not in {"hard", "fade"}
            {}, {}, {},
        ],
    })
    assert service.get_status().tracks[0].stop_mode == "fade"


def test_round_trip_export_then_apply_preserves_state() -> None:
    """The output of export_state must be a valid input to
    apply_state — round-trip identity for policy state."""
    engine = _FakeEngine()
    a = LooperService(engine=engine)
    a.set_locked(0, True)
    a.set_one_shot(1, True)
    a.set_auto_armed(2, True)
    a.set_auto_threshold_db(3, -24.0)

    payload = a.export_state()

    b = LooperService()
    b.apply_state(payload)
    b_status = b.get_status()

    assert b_status.tracks[0].locked is True
    assert b_status.tracks[1].one_shot is True
    assert b_status.tracks[2].auto_armed is True
    assert b_status.tracks[3].auto_threshold_db == -24.0

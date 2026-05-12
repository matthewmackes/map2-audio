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
# T2512-SYNC — per-track sync mode + master-track invariant
# ---------------------------------------------------------------------------


def test_sync_mode_default_is_free() -> None:
    service = LooperService()
    status = service.get_status()
    assert all(t.sync_mode == "free" for t in status.tracks)
    assert status.sync_master is False
    assert status.sync_master_track is None


def test_set_sync_mode_to_master() -> None:
    service = LooperService()
    service.set_sync_mode(0, "master")
    status = service.get_status()
    assert status.tracks[0].sync_mode == "master"
    assert status.sync_master is True
    assert status.sync_master_track == 0


def test_set_sync_mode_demotes_previous_master() -> None:
    """At-most-one-master invariant — promoting track 2 demotes track 0."""
    service = LooperService()
    service.set_sync_mode(0, "master")
    service.set_sync_mode(2, "master")
    status = service.get_status()
    assert status.tracks[0].sync_mode == "free"
    assert status.tracks[2].sync_mode == "master"
    assert status.sync_master_track == 2


def test_set_sync_mode_slave() -> None:
    service = LooperService()
    service.set_sync_mode(0, "master")
    service.set_sync_mode(1, "slave")
    service.set_sync_mode(2, "slave")
    status = service.get_status()
    assert status.tracks[1].sync_mode == "slave"
    assert status.tracks[2].sync_mode == "slave"
    # Slaves don't disturb the master.
    assert status.sync_master_track == 0


def test_set_sync_mode_rejects_unknown() -> None:
    service = LooperService()
    with pytest.raises(LooperServiceError) as exc:
        service.set_sync_mode(0, "follower")
    assert exc.value.code == "invalid_sync_mode"


def test_set_sync_mode_invalid_track_raises() -> None:
    service = LooperService()
    with pytest.raises(LooperServiceError) as exc:
        service.set_sync_mode(9, "free")
    assert exc.value.code == "invalid_track"


def test_sync_master_track_returns_none_when_demoted_to_free() -> None:
    service = LooperService()
    service.set_sync_mode(0, "master")
    service.set_sync_mode(0, "free")
    status = service.get_status()
    assert status.sync_master_track is None
    assert status.sync_master is False


def test_sync_state_broadcasts() -> None:
    received: list = []
    service = LooperService(broadcaster=received.append)
    service.set_sync_mode(0, "master")
    service.set_sync_mode(1, "slave")
    assert len(received) == 2


def test_sync_state_persistent_across_record() -> None:
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_sync_mode(0, "master")
    service.set_sync_mode(1, "slave")
    service.record(0)
    service.stop_track(0)
    service.clear(0)
    status = service.get_status()
    assert status.tracks[0].sync_mode == "master"
    assert status.tracks[1].sync_mode == "slave"


def test_export_state_includes_sync_mode() -> None:
    service = LooperService()
    service.set_sync_mode(0, "master")
    service.set_sync_mode(1, "slave")
    payload = service.export_state()
    assert payload["tracks"][0]["sync_mode"] == "master"
    assert payload["tracks"][1]["sync_mode"] == "slave"


def test_apply_state_restores_sync_mode() -> None:
    service = LooperService()
    service.apply_state({
        "tracks": [
            {"sync_mode": "master"},
            {"sync_mode": "slave"},
            {"sync_mode": "free"},
            {"sync_mode": "slave"},
        ],
    })
    status = service.get_status()
    assert status.tracks[0].sync_mode == "master"
    assert status.tracks[1].sync_mode == "slave"
    assert status.tracks[3].sync_mode == "slave"
    assert status.sync_master_track == 0


def test_apply_state_drops_invalid_sync_mode() -> None:
    """Unknown sync_mode in a payload must NOT overwrite valid prior state."""
    service = LooperService()
    service.set_sync_mode(0, "master")
    service.apply_state({
        "tracks": [
            {"sync_mode": "boss"},  # unknown
            {}, {}, {},
        ],
    })
    assert service.get_status().tracks[0].sync_mode == "master"


def test_apply_state_includes_slices_round_trip() -> None:
    """T2512-SLICE — slices round-trip through export/apply."""
    a = LooperService()
    a.add_slice(0, 0, 48000, "intro")
    a.add_slice(0, 48000, 96000, "verse")
    payload = a.export_state()

    b = LooperService()
    b.apply_state(payload)
    status = b.get_status()
    assert len(status.tracks[0].slices) == 2
    assert status.tracks[0].slices[0].label == "intro"
    assert status.tracks[0].slices[1].label == "verse"


def test_apply_state_drops_overlapping_slices_in_payload() -> None:
    """A malformed payload with overlapping slices keeps the first
    one and drops the rest."""
    service = LooperService()
    service.apply_state({
        "tracks": [
            {"slices": [
                {"start_frame": 0,    "end_frame": 1000, "label": "a"},
                {"start_frame": 500,  "end_frame": 1500, "label": "b"},  # overlaps a
                {"start_frame": 2000, "end_frame": 3000, "label": "c"},
            ]},
            {}, {}, {},
        ],
    })
    status = service.get_status()
    labels = [s.label for s in status.tracks[0].slices]
    assert labels == ["a", "c"]


def test_apply_state_demotes_multiple_masters_in_payload() -> None:
    """A malformed payload with two masters keeps the lowest-indexed
    one as master and demotes the rest to free."""
    service = LooperService()
    service.apply_state({
        "tracks": [
            {"sync_mode": "master"},
            {"sync_mode": "master"},  # duplicate
            {"sync_mode": "master"},  # duplicate
            {"sync_mode": "slave"},
        ],
    })
    status = service.get_status()
    assert status.tracks[0].sync_mode == "master"
    assert status.tracks[1].sync_mode == "free"
    assert status.tracks[2].sync_mode == "free"
    assert status.tracks[3].sync_mode == "slave"
    assert status.sync_master_track == 0


# ---------------------------------------------------------------------------
# T2512-SLICE — non-destructive slice metadata
# ---------------------------------------------------------------------------


def test_slices_default_empty() -> None:
    service = LooperService()
    status = service.get_status()
    for track in status.tracks:
        assert track.slices == ()


def test_add_slice_records_metadata() -> None:
    service = LooperService()
    service.add_slice(0, 0, 48000, "intro")
    status = service.get_status()
    assert len(status.tracks[0].slices) == 1
    slc = status.tracks[0].slices[0]
    assert slc.start_frame == 0
    assert slc.end_frame == 48000
    assert slc.label == "intro"


def test_add_slice_orders_by_start_frame() -> None:
    service = LooperService()
    service.add_slice(0, 96000, 144000, "outro")
    service.add_slice(0, 0,     48000,  "intro")
    service.add_slice(0, 48000, 96000,  "verse")
    status = service.get_status()
    labels = [s.label for s in status.tracks[0].slices]
    assert labels == ["intro", "verse", "outro"]


def test_add_slice_rejects_overlap() -> None:
    service = LooperService()
    service.add_slice(0, 0, 1000, "a")
    with pytest.raises(LooperServiceError) as exc:
        service.add_slice(0, 500, 1500, "b")
    assert exc.value.code == "slice_overlap"
    # Existing slice still intact.
    assert len(service.get_status().tracks[0].slices) == 1


def test_add_slice_rejects_inverted_range() -> None:
    service = LooperService()
    with pytest.raises(LooperServiceError) as exc:
        service.add_slice(0, 1000, 500, "")
    assert exc.value.code == "invalid_slice"


def test_add_slice_rejects_zero_length() -> None:
    service = LooperService()
    with pytest.raises(LooperServiceError) as exc:
        service.add_slice(0, 500, 500, "")
    assert exc.value.code == "invalid_slice"


def test_add_slice_rejects_negative_start() -> None:
    service = LooperService()
    with pytest.raises(LooperServiceError) as exc:
        service.add_slice(0, -10, 1000, "")
    assert exc.value.code == "invalid_slice"


def test_add_slice_invalid_track_raises() -> None:
    service = LooperService()
    with pytest.raises(LooperServiceError) as exc:
        service.add_slice(9, 0, 1000, "")
    assert exc.value.code == "invalid_track"


def test_add_slice_trims_long_label() -> None:
    service = LooperService()
    service.add_slice(0, 0, 1000, "  hello  ")
    assert service.get_status().tracks[0].slices[0].label == "hello"

    long_label = "x" * 200
    service.add_slice(0, 2000, 3000, long_label)
    truncated = service.get_status().tracks[0].slices[1].label
    assert len(truncated) == 64
    assert truncated == "x" * 64


def test_add_slice_enforces_per_track_cap() -> None:
    service = LooperService()
    # Add 64 slices.
    for i in range(64):
        service.add_slice(0, i * 100, i * 100 + 50, f"s{i}")
    with pytest.raises(LooperServiceError) as exc:
        service.add_slice(0, 100_000, 101_000, "overflow")
    assert exc.value.code == "slice_limit"


def test_clear_slices_drops_everything() -> None:
    service = LooperService()
    service.add_slice(0, 0, 1000, "a")
    service.add_slice(0, 2000, 3000, "b")
    service.clear_slices(0)
    assert service.get_status().tracks[0].slices == ()


def test_clear_slices_is_idempotent() -> None:
    service = LooperService()
    # No slices yet — should not raise.
    service.clear_slices(0)
    service.clear_slices(0)


def test_clear_slices_per_track() -> None:
    """Clearing track 0 must not touch track 1's slices."""
    service = LooperService()
    service.add_slice(0, 0, 1000, "a")
    service.add_slice(1, 0, 2000, "b")
    service.clear_slices(0)
    status = service.get_status()
    assert status.tracks[0].slices == ()
    assert len(status.tracks[1].slices) == 1
    assert status.tracks[1].slices[0].label == "b"


def test_slice_state_broadcasts() -> None:
    received: list = []
    service = LooperService(broadcaster=received.append)
    service.add_slice(0, 0, 1000, "a")
    service.add_slice(0, 2000, 3000, "b")
    service.clear_slices(0)
    assert len(received) == 3


def test_slices_persist_across_record() -> None:
    """Operator policy state survives state-machine transitions."""
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.add_slice(0, 0, 48000, "intro")
    service.record(0)
    service.stop_track(0)
    service.clear(0)
    status = service.get_status()
    assert len(status.tracks[0].slices) == 1
    assert status.tracks[0].slices[0].label == "intro"


def test_delete_slice_drops_matching_slice() -> None:
    service = LooperService()
    service.add_slice(0, 0,     1000,  "a")
    service.add_slice(0, 2000,  3000,  "b")
    service.add_slice(0, 5000,  6000,  "c")
    service.delete_slice(0, 2000)
    labels = [s.label for s in service.get_status().tracks[0].slices]
    assert labels == ["a", "c"]


def test_delete_slice_per_track() -> None:
    service = LooperService()
    service.add_slice(0, 0, 1000, "a")
    service.add_slice(1, 0, 1000, "b")
    service.delete_slice(0, 0)
    s = service.get_status()
    assert s.tracks[0].slices == ()
    assert len(s.tracks[1].slices) == 1
    assert s.tracks[1].slices[0].label == "b"


def test_delete_slice_not_found_raises() -> None:
    service = LooperService()
    service.add_slice(0, 0, 1000, "a")
    with pytest.raises(LooperServiceError) as exc:
        service.delete_slice(0, 9999)
    assert exc.value.code == "slice_not_found"
    # Existing slice untouched.
    assert len(service.get_status().tracks[0].slices) == 1


def test_delete_slice_invalid_track_raises() -> None:
    service = LooperService()
    with pytest.raises(LooperServiceError) as exc:
        service.delete_slice(7, 0)
    assert exc.value.code == "invalid_track"


def test_delete_slice_invalid_start_frame_type_raises() -> None:
    service = LooperService()
    with pytest.raises(LooperServiceError) as exc:
        service.delete_slice(0, "not-an-int")  # type: ignore[arg-type]
    assert exc.value.code == "invalid_slice"


def test_delete_slice_broadcasts() -> None:
    received: list = []
    service = LooperService(broadcaster=received.append)
    service.add_slice(0, 0, 1000, "a")
    received.clear()
    service.delete_slice(0, 0)
    assert len(received) == 1


# ---------------------------------------------------------------------------
# T2512-SLICE-AT-PLAYHEAD — playhead-driven slice helper
# ---------------------------------------------------------------------------


class _PlayheadEngine:
    """Test engine that lets a test fix the playhead frame count."""

    def __init__(self, playhead: int = 0) -> None:
        self.playhead = playhead

    def looper_get_status(self) -> dict:
        return {
            "tracks": [
                {
                    "track": i,
                    "state": int(TrackState.PLAYING if i == 0 else TrackState.EMPTY),
                    "loop_length_frames": 96000 if i == 0 else 0,
                    "playhead_frames": self.playhead if i == 0 else 0,
                    "layer_count": 1 if i == 0 else 0,
                    "level_db": 0.0,
                    "muted": False,
                    "soloed": False,
                    "reverse": False,
                    "half_speed": False,
                }
                for i in range(4)
            ],
            "active_track_count": 1,
            "sync_master": False,
            "master_level_db": 0.0,
        }


def test_add_slice_at_playhead_first_slice_spans_zero_to_playhead() -> None:
    engine = _PlayheadEngine(playhead=48000)
    service = LooperService(engine=engine)
    service.add_slice_at_playhead(0, "intro")
    slices = service.get_status().tracks[0].slices
    assert len(slices) == 1
    assert slices[0].start_frame == 0
    assert slices[0].end_frame == 48000
    assert slices[0].label == "intro"


def test_add_slice_at_playhead_subsequent_starts_at_prior_end() -> None:
    engine = _PlayheadEngine(playhead=24000)
    service = LooperService(engine=engine)
    service.add_slice_at_playhead(0, "intro")
    engine.playhead = 48000
    service.add_slice_at_playhead(0, "verse")
    slices = service.get_status().tracks[0].slices
    assert [s.start_frame for s in slices] == [0, 24000]
    assert [s.end_frame   for s in slices] == [24000, 48000]
    assert [s.label       for s in slices] == ["intro", "verse"]


def test_add_slice_at_playhead_rejects_zero_playhead() -> None:
    engine = _PlayheadEngine(playhead=0)
    service = LooperService(engine=engine)
    with pytest.raises(LooperServiceError) as exc:
        service.add_slice_at_playhead(0, "")
    assert exc.value.code == "invalid_slice"


def test_add_slice_at_playhead_rejects_playhead_at_or_before_prior_end() -> None:
    engine = _PlayheadEngine(playhead=48000)
    service = LooperService(engine=engine)
    service.add_slice_at_playhead(0, "first")
    # Playhead hasn't advanced — operator's second click is a no-op.
    with pytest.raises(LooperServiceError) as exc:
        service.add_slice_at_playhead(0, "second")
    assert exc.value.code == "invalid_slice"


def test_add_slice_at_playhead_invalid_track_raises() -> None:
    engine = _PlayheadEngine(playhead=48000)
    service = LooperService(engine=engine)
    with pytest.raises(LooperServiceError) as exc:
        service.add_slice_at_playhead(9, "")
    assert exc.value.code == "invalid_track"


def test_add_slice_at_playhead_no_engine_returns_invalid_slice() -> None:
    """Without an engine, the default fallback status has playhead=0,
    so the helper rejects with invalid_slice (not a crash)."""
    service = LooperService()
    with pytest.raises(LooperServiceError) as exc:
        service.add_slice_at_playhead(0, "")
    assert exc.value.code == "invalid_slice"


def test_add_slice_at_playhead_broadcasts_once() -> None:
    engine = _PlayheadEngine(playhead=48000)
    received: list = []
    service = LooperService(engine=engine, broadcaster=received.append)
    service.add_slice_at_playhead(0, "x")
    # Single broadcast through add_slice (the helper reuses it).
    assert len(received) == 1


def test_add_slice_at_playhead_label_truncation() -> None:
    """Reuses add_slice's 64-char label cap."""
    engine = _PlayheadEngine(playhead=48000)
    service = LooperService(engine=engine)
    service.add_slice_at_playhead(0, "x" * 200)
    assert service.get_status().tracks[0].slices[0].label == "x" * 64


def test_slice_payload_serialization() -> None:
    """to_payload() shape for each slice — what the WS frame ships."""
    service = LooperService()
    service.add_slice(0, 1000, 2000, "test")
    payload = service.get_status().to_payload()
    assert payload["tracks"][0]["slices"] == [
        {"start_frame": 1000, "end_frame": 2000, "label": "test"},
    ]


# ---------------------------------------------------------------------------
# T2512-QUANT-WIRE — per-track quantize_division + quantize_record_length
# ---------------------------------------------------------------------------


def test_quantize_division_default_is_off() -> None:
    service = LooperService()
    status = service.get_status()
    assert all(t.quantize_division == "off" for t in status.tracks)


def test_set_quantize_division_accepts_known_grids() -> None:
    service = LooperService()
    for division in ("whole", "half", "quarter", "eighth",
                     "sixteenth", "thirty-second", "1/4", "1/8"):
        service.set_quantize_division(0, division)
        assert service.get_status().tracks[0].quantize_division == division


def test_set_quantize_division_rejects_unknown() -> None:
    service = LooperService()
    with pytest.raises(LooperServiceError) as exc:
        service.set_quantize_division(0, "1/3")
    assert exc.value.code == "invalid_quantize_division"


def test_set_quantize_division_invalid_track_raises() -> None:
    service = LooperService()
    with pytest.raises(LooperServiceError) as exc:
        service.set_quantize_division(9, "quarter")
    assert exc.value.code == "invalid_track"


def test_quantize_record_length_off_returns_raw(monkeypatch) -> None:
    """The "off" default must be a no-op even when tempo is wired."""
    service = LooperService()

    class _FakeTempo:
        def current_bpm(self) -> float:
            return 120.0

    import app.services.snapshot_tempo_service as tempo_mod
    monkeypatch.setattr(tempo_mod, "SnapshotTempoService", lambda: _FakeTempo())

    assert service.quantize_record_length(0, 33333) == 33333


def test_quantize_record_length_snaps_to_quarter_at_120bpm(monkeypatch) -> None:
    """120 BPM, quarter division = 24000 frames/beat. 23900 frames
    snaps to 24000 (nearest)."""
    service = LooperService()
    service.set_quantize_division(0, "quarter")

    class _FakeTempo:
        def current_bpm(self) -> float:
            return 120.0

    import app.services.snapshot_tempo_service as tempo_mod
    monkeypatch.setattr(tempo_mod, "SnapshotTempoService", lambda: _FakeTempo())

    assert service.quantize_record_length(0, 23900) == 24000
    assert service.quantize_record_length(0, 24100) == 24000
    assert service.quantize_record_length(0, 0) == 0


def test_quantize_record_length_zero_or_negative_passes_through() -> None:
    service = LooperService()
    service.set_quantize_division(0, "quarter")
    assert service.quantize_record_length(0, 0) == 0
    assert service.quantize_record_length(0, -42) == -42


def test_quantize_record_length_no_tempo_returns_raw(monkeypatch) -> None:
    """If the tempo service is unreachable, the helper falls back to
    returning ``raw_frames`` unchanged — no usable grid."""
    service = LooperService()
    service.set_quantize_division(0, "quarter")

    def _boom():
        raise RuntimeError("tempo down")

    import app.services.snapshot_tempo_service as tempo_mod
    monkeypatch.setattr(tempo_mod, "SnapshotTempoService", _boom)

    assert service.quantize_record_length(0, 33333) == 33333


def test_quantize_record_length_invalid_track_raises() -> None:
    service = LooperService()
    with pytest.raises(LooperServiceError) as exc:
        service.quantize_record_length(9, 24000)
    assert exc.value.code == "invalid_track"


def test_quantize_division_broadcasts() -> None:
    received: list = []
    service = LooperService(broadcaster=received.append)
    service.set_quantize_division(0, "quarter")
    service.set_quantize_division(0, "off")
    assert len(received) == 2


def test_quantize_division_persists_across_record() -> None:
    engine = _FakeEngine()
    service = LooperService(engine=engine)
    service.set_quantize_division(0, "eighth")
    service.record(0)
    service.stop_track(0)
    service.clear(0)
    assert service.get_status().tracks[0].quantize_division == "eighth"


def test_quantize_division_round_trips_through_snapshot_state() -> None:
    a = LooperService()
    a.set_quantize_division(0, "quarter")
    a.set_quantize_division(2, "sixteenth")
    payload = a.export_state()
    b = LooperService()
    b.apply_state(payload)
    status = b.get_status()
    assert status.tracks[0].quantize_division == "quarter"
    assert status.tracks[2].quantize_division == "sixteenth"
    assert status.tracks[1].quantize_division == "off"


def test_apply_state_drops_invalid_quantize_division() -> None:
    service = LooperService()
    service.set_quantize_division(0, "quarter")
    service.apply_state({
        "tracks": [
            {"quantize_division": "1/3"},  # unknown
            {}, {}, {},
        ],
    })
    assert service.get_status().tracks[0].quantize_division == "quarter"


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
            "sync_mode": "free",
            "slices": [],
            "quantize_division": "off",
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

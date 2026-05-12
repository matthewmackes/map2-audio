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

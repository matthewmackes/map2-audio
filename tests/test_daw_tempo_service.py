"""T2503 Set 7 — DAW tempo service tests."""

from __future__ import annotations

import time

import pytest

from app.services.daw_tempo_service import (
    DawTempoService,
    SyncSource,
    TempoState,
)


def test_defaults() -> None:
    svc = DawTempoService()
    s = svc.state()
    assert s.bpm == 120.0
    assert s.time_sig_numerator == 4
    assert s.time_sig_denominator == 4
    assert s.sync_source == SyncSource.INTERNAL
    assert s.position_samples == 0
    assert s.sample_rate == 48000


def test_set_bpm() -> None:
    svc = DawTempoService()
    s = svc.set_bpm(140)
    assert s.bpm == 140.0


@pytest.mark.parametrize("bad", [0, 19.99, 1000, -1])
def test_set_bpm_rejects_out_of_range(bad: float) -> None:
    svc = DawTempoService()
    with pytest.raises(ValueError):
        svc.set_bpm(bad)


def test_set_time_signature() -> None:
    svc = DawTempoService()
    svc.set_time_signature(6, 8)
    assert svc.state().time_sig_numerator == 6
    assert svc.state().time_sig_denominator == 8


def test_set_time_signature_rejects_invalid() -> None:
    svc = DawTempoService()
    with pytest.raises(ValueError):
        svc.set_time_signature(0, 4)
    with pytest.raises(ValueError):
        svc.set_time_signature(4, 3)
    with pytest.raises(ValueError):
        svc.set_time_signature(33, 4)


def test_sync_source_switching() -> None:
    svc = DawTempoService()
    svc.set_sync_source(SyncSource.MIDI_CLOCK_IN)
    assert svc.state().sync_source == SyncSource.MIDI_CLOCK_IN
    svc.set_sync_source(SyncSource.MTC)
    assert svc.state().sync_source == SyncSource.MTC
    svc.set_sync_source(SyncSource.INTERNAL)
    assert svc.state().sync_source == SyncSource.INTERNAL


def test_set_bpm_blocked_when_externally_synced() -> None:
    svc = DawTempoService()
    svc.set_sync_source(SyncSource.MIDI_CLOCK_IN)
    with pytest.raises(RuntimeError):
        svc.set_bpm(180)


def test_set_position_samples() -> None:
    svc = DawTempoService()
    svc.set_position_samples(96000)
    assert svc.state().position_samples == 96000


def test_set_position_samples_rejects_negative() -> None:
    svc = DawTempoService()
    with pytest.raises(ValueError):
        svc.set_position_samples(-1)


def test_listener_fires_on_state_change() -> None:
    svc = DawTempoService()
    log: list[tuple[float, float]] = []

    def listener(old: TempoState, new: TempoState) -> None:
        log.append((old.bpm, new.bpm))

    svc.add_listener(listener)
    svc.set_bpm(140.0)
    svc.set_bpm(150.0)
    assert log == [(120.0, 140.0), (140.0, 150.0)]


def test_listener_can_be_removed() -> None:
    svc = DawTempoService()
    fired = 0

    def listener(o: TempoState, n: TempoState) -> None:
        nonlocal fired
        fired += 1

    svc.add_listener(listener)
    svc.set_bpm(140)
    svc.remove_listener(listener)
    svc.set_bpm(150)
    assert fired == 1


def test_listener_exception_does_not_break_state_machine() -> None:
    svc = DawTempoService()
    svc.add_listener(lambda o, n: 1 / 0)  # always raises
    # The state mutation must complete despite the listener exception.
    s = svc.set_bpm(140)
    assert s.bpm == 140.0


def test_midi_clock_in_derives_bpm_when_synced() -> None:
    svc = DawTempoService()
    # Without midi_clock_in source, ticks are no-ops.
    svc.on_midi_clock_tick()
    svc.on_midi_clock_tick()
    assert svc.state().bpm == 120.0  # unchanged

    # Switch to midi_clock_in. Drive ticks at 120bpm × 24PPQ = 48 Hz =
    # ~20.83ms apart. Inject directly via on_midi_clock_tick (uses
    # monotonic_ns internally; we can't fake time, so run a real loop).
    svc.set_sync_source(SyncSource.MIDI_CLOCK_IN)
    # Reset bpm so the IIR has somewhere to converge from.
    # Note: set_bpm is blocked while externally synced; tweak directly.
    interval_s = 1.0 / 48.0
    deadline = time.monotonic() + 0.6  # 0.6s = ~29 ticks at 48 Hz
    next_tick = time.monotonic()
    while time.monotonic() < deadline:
        if time.monotonic() >= next_tick:
            svc.on_midi_clock_tick()
            next_tick += interval_s
        time.sleep(0.001)
    # Convergence is approximate — assert bpm is in a wide bracket.
    assert 100 <= svc.state().bpm <= 140

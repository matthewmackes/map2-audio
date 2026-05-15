"""T2523 — Maschine MK1 transport buttons → Looper service.

Exercises ``MaschineMK1Daemon._dispatch_looper_transport`` against an
in-memory ``LooperService`` (no engine, no HTTP). Each Mixxx-style
transport press should land on exactly one service verb and a
matching activity-log entry. Locked tracks must NOT crash the daemon
when an erase / record is attempted on them.
"""

from __future__ import annotations

import logging

import pytest

import app.services.maschine.maschine_mk1_daemon as daemon_module
from app.services.looper_service import LooperService, TrackState


class _StubDaemon:
    """Lightweight host for the ``_dispatch_looper_transport`` method.

    The full ``MaschineMK1Daemon`` constructor needs a USB transport,
    USB descriptor probe, MIDI sender, render thread, etc. We only
    need the one method under test plus the class-level
    ``_LOOPER_ACTIVE_TRACK`` constant — bind both onto an empty stub.
    """

    _LOOPER_ACTIVE_TRACK = daemon_module.MaschineMK1Daemon._LOOPER_ACTIVE_TRACK
    _dispatch_looper_transport = (
        daemon_module.MaschineMK1Daemon._dispatch_looper_transport
    )


@pytest.fixture
def looper_service_swap(monkeypatch: pytest.MonkeyPatch) -> LooperService:
    """Replace the process-wide singleton with a fresh service so
    individual tests don't pollute each other's state."""
    service = LooperService()
    monkeypatch.setattr(daemon_module, "get_looper_service", lambda: service)
    return service


def test_play_press_invokes_play_track(looper_service_swap: LooperService) -> None:
    _StubDaemon()._dispatch_looper_transport("play")
    activity = looper_service_swap.get_activity()
    assert any(ev.verb == "play" and ev.track == 0 for ev in activity)


def test_stop_press_invokes_stop_track(looper_service_swap: LooperService) -> None:
    _StubDaemon()._dispatch_looper_transport("stop")
    activity = looper_service_swap.get_activity()
    assert any(ev.verb == "stop" and ev.track == 0 for ev in activity)


def test_record_press_invokes_record(looper_service_swap: LooperService) -> None:
    _StubDaemon()._dispatch_looper_transport("record")
    activity = looper_service_swap.get_activity()
    assert any(ev.verb == "record" and ev.track == 0 for ev in activity)


def test_restart_press_invokes_restart_track(looper_service_swap: LooperService) -> None:
    _StubDaemon()._dispatch_looper_transport("restart")
    activity = looper_service_swap.get_activity()
    assert any(ev.verb == "restart" and ev.track == 0 for ev in activity)


def test_erase_press_invokes_clear(looper_service_swap: LooperService) -> None:
    _StubDaemon()._dispatch_looper_transport("erase")
    activity = looper_service_swap.get_activity()
    assert any(ev.verb == "clear" and ev.track == 0 for ev in activity)


def test_unknown_action_is_a_noop(
    looper_service_swap: LooperService,
    caplog: pytest.LogCaptureFixture,
) -> None:
    with caplog.at_level(logging.DEBUG, logger=daemon_module.LOGGER.name):
        _StubDaemon()._dispatch_looper_transport("rewind-everything")
    assert looper_service_swap.get_activity() == []


def test_locked_track_swallows_locked_error(
    looper_service_swap: LooperService,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Per T2523 dispatch contract, a write-locked active track must
    not crash the daemon. The locked verb is silently dropped."""
    looper_service_swap.set_locked(0, True)
    with caplog.at_level(logging.DEBUG, logger=daemon_module.LOGGER.name):
        # Record + erase both target locked content → both must be
        # rejected by the service and swallowed by the daemon.
        _StubDaemon()._dispatch_looper_transport("record")
        _StubDaemon()._dispatch_looper_transport("erase")
    activity = looper_service_swap.get_activity()
    # Neither verb should have produced an activity entry — they were
    # rejected before reaching the activity log.
    assert not any(ev.verb in {"record", "clear"} for ev in activity)


def test_v1_active_track_is_track_zero() -> None:
    """T2523 v1 pins the Maschine transport buttons to looper Track 0.
    Multi-track selection lands in a follow-on slice; until then the
    constant must stay 0 so the GUI strip and LCD render context can
    rely on it."""
    assert daemon_module.MaschineMK1Daemon._LOOPER_ACTIVE_TRACK == 0


def test_play_press_emits_broadcast(looper_service_swap: LooperService) -> None:
    """The service broadcaster fires on every transport press so the
    WS bridge surfaces operator presses in real time."""
    received: list = []
    looper_service_swap.replace_broadcaster(received.append)
    _StubDaemon()._dispatch_looper_transport("play")
    assert len(received) == 1
    # The broadcast carries a full LooperStatus payload — minimally
    # check it has the four tracks the operator expects.
    status = received[0]
    assert len(status.tracks) == 4
    assert status.tracks[0].track == 0


def test_stop_press_does_not_engage_lock_check(
    looper_service_swap: LooperService,
) -> None:
    """``stop_track`` is intentionally NOT lock-guarded (the service
    contract preserves freezing a locked track via stop). The daemon
    dispatch must respect that: a locked track still receives stop."""
    looper_service_swap.set_locked(0, True)
    _StubDaemon()._dispatch_looper_transport("stop")
    activity = looper_service_swap.get_activity()
    assert any(ev.verb == "stop" and ev.track == 0 for ev in activity)


def test_initial_status_has_four_tracks_in_empty_state(
    looper_service_swap: LooperService,
) -> None:
    """Sanity backstop: the four-track invariant the LCD render
    context (T2523-B) depends on is upheld by the service before any
    transport press."""
    status = looper_service_swap.get_status()
    assert len(status.tracks) == 4
    for track in status.tracks:
        assert track.state == TrackState.EMPTY

"""T2459-H Outer Loop 2 — handler implementation tests.

Wires fake hooks into the dispatcher + handlers and asserts that real
service calls are produced for each canonical target.
"""

from __future__ import annotations

import pytest

from app.services.engine_command_dispatcher import EngineCommandDispatcher
from app.services.engine_command_handlers import (
    HandlerHooks,
    register_default_handlers,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _frame(target: str, action: str = "set", value=None, args=None) -> dict:
    out: dict = {
        "type": "engine_command",
        "msg_id": "m1",
        "schema_version": 1,
        "controller_key": "k",
        "target": target,
        "action": action,
    }
    if value is not None:
        out["value"] = value
    if args is not None:
        out["args"] = args
    return out


def _make_dispatcher_with_recording_hooks() -> tuple[
    EngineCommandDispatcher,
    list[tuple[int, bool]],
    list[int],
    list[float],
    list[int | None],
]:
    bypass_calls: list[tuple[int, bool]] = []
    recall_calls: list[int] = []
    volume_calls: list[float] = []
    tempo_calls: list[int | None] = []

    hooks = HandlerHooks(
        set_chain_bypass=lambda chain_id, bypass: bypass_calls.append(
            (chain_id, bypass)
        ),
        recall_snapshot=lambda snapshot_id: recall_calls.append(snapshot_id),
        set_master_volume=lambda volume: volume_calls.append(volume),
        tap_tempo=lambda timestamp_ns: tempo_calls.append(timestamp_ns),
    )

    dispatcher = EngineCommandDispatcher()
    register_default_handlers(dispatcher, hooks=hooks)
    return dispatcher, bypass_calls, recall_calls, volume_calls, tempo_calls


def _make_dispatcher_with_recorder_hooks() -> tuple[
    EngineCommandDispatcher,
    list[str],  # arm
    list[str],  # disarm
    list[str],  # roll
    list[str],  # stop
    list[str],  # status
]:
    """T2508 — recorder-verb harness. Each verb appends session_id."""
    arm_calls: list[str] = []
    disarm_calls: list[str] = []
    roll_calls: list[str] = []
    stop_calls: list[str] = []
    status_calls: list[str] = []

    hooks = HandlerHooks(
        recorder_arm=lambda session_id: arm_calls.append(session_id),
        recorder_disarm=lambda session_id: disarm_calls.append(session_id),
        recorder_roll=lambda session_id: roll_calls.append(session_id),
        recorder_stop=lambda session_id: stop_calls.append(session_id),
        recorder_status=lambda session_id: status_calls.append(session_id),
    )

    dispatcher = EngineCommandDispatcher()
    register_default_handlers(dispatcher, hooks=hooks)
    return dispatcher, arm_calls, disarm_calls, roll_calls, stop_calls, status_calls


# ---------------------------------------------------------------------------
# audio.chain.<N>.bypass
# ---------------------------------------------------------------------------


def test_chain_bypass_set_true() -> None:
    d, bypass_calls, *_ = _make_dispatcher_with_recording_hooks()
    d.dispatch(_frame("audio.chain.5.bypass", action="set", value=1.0))
    assert bypass_calls == [(5, True)]


def test_chain_bypass_set_zero_means_unbypassed() -> None:
    d, bypass_calls, *_ = _make_dispatcher_with_recording_hooks()
    d.dispatch(_frame("audio.chain.5.bypass", action="set", value=0.0))
    assert bypass_calls == [(5, False)]


def test_chain_bypass_toggle_with_no_state_defaults_true() -> None:
    """First toggle without prior state turns bypass ON. Operators
    expect 'first press' to do something visible."""
    d, bypass_calls, *_ = _make_dispatcher_with_recording_hooks()
    d.dispatch(_frame("audio.chain.5.bypass", action="toggle"))
    assert bypass_calls == [(5, True)]


def test_chain_bypass_handles_multiple_chains() -> None:
    d, bypass_calls, *_ = _make_dispatcher_with_recording_hooks()
    d.dispatch(_frame("audio.chain.1.bypass", action="set", value=1.0))
    d.dispatch(_frame("audio.chain.2.bypass", action="set", value=1.0))
    d.dispatch(_frame("audio.chain.7.bypass", action="set", value=0.0))
    assert bypass_calls == [(1, True), (2, True), (7, False)]


def test_chain_bypass_drops_non_integer_chain_id() -> None:
    d, bypass_calls, *_ = _make_dispatcher_with_recording_hooks()
    d.dispatch(_frame("audio.chain.foo.bypass", action="set", value=1.0))
    assert bypass_calls == []


def test_chain_bypass_drops_unknown_action() -> None:
    d, bypass_calls, *_ = _make_dispatcher_with_recording_hooks()
    d.dispatch(_frame("audio.chain.5.bypass", action="multiply", value=1.0))
    assert bypass_calls == []


# ---------------------------------------------------------------------------
# audio.snapshot.recall
# ---------------------------------------------------------------------------


def test_snapshot_recall_routes_with_value() -> None:
    d, _, recall_calls, *_ = _make_dispatcher_with_recording_hooks()
    d.dispatch(_frame("audio.snapshot.recall", action="set", value=12.0))
    assert recall_calls == [12]


def test_snapshot_recall_drops_missing_value() -> None:
    d, _, recall_calls, *_ = _make_dispatcher_with_recording_hooks()
    d.dispatch(_frame("audio.snapshot.recall", action="set"))
    assert recall_calls == []


def test_snapshot_recall_ignores_non_set_action() -> None:
    d, _, recall_calls, *_ = _make_dispatcher_with_recording_hooks()
    d.dispatch(_frame("audio.snapshot.recall", action="toggle", value=3.0))
    assert recall_calls == []


# ---------------------------------------------------------------------------
# audio.master.volume
# ---------------------------------------------------------------------------


def test_master_volume_set_clamps_to_unit_range() -> None:
    d, _, _, vol_calls, _ = _make_dispatcher_with_recording_hooks()
    d.dispatch(_frame("audio.master.volume", action="set", value=2.0))
    d.dispatch(_frame("audio.master.volume", action="set", value=-0.5))
    d.dispatch(_frame("audio.master.volume", action="set", value=0.7))
    assert vol_calls == [1.0, 0.0, 0.7]


def test_master_volume_increment_uses_internal_state() -> None:
    """increment without value defaults to step=0.05 from current
    state; current state is the last clamped value."""
    d, _, _, vol_calls, _ = _make_dispatcher_with_recording_hooks()
    d.dispatch(_frame("audio.master.volume", action="set", value=0.5))
    d.dispatch(_frame("audio.master.volume", action="increment"))
    d.dispatch(_frame("audio.master.volume", action="increment", value=0.1))
    assert vol_calls == [0.5, pytest.approx(0.55), pytest.approx(0.65)]


def test_master_volume_decrement_clamps_to_zero() -> None:
    d, _, _, vol_calls, _ = _make_dispatcher_with_recording_hooks()
    d.dispatch(_frame("audio.master.volume", action="set", value=0.05))
    d.dispatch(_frame("audio.master.volume", action="decrement", value=0.5))
    assert vol_calls[1] == 0.0


# ---------------------------------------------------------------------------
# audio.transport.tap_tempo
# ---------------------------------------------------------------------------


def test_tap_tempo_with_timestamp() -> None:
    d, _, _, _, tempo_calls = _make_dispatcher_with_recording_hooks()
    d.dispatch(
        _frame(
            "audio.transport.tap_tempo",
            action="trigger",
            args=[1234567890],
        )
    )
    assert tempo_calls == [1234567890]


def test_tap_tempo_without_timestamp() -> None:
    d, _, _, _, tempo_calls = _make_dispatcher_with_recording_hooks()
    d.dispatch(_frame("audio.transport.tap_tempo"))
    assert tempo_calls == [None]


def test_tap_tempo_with_invalid_timestamp_string_falls_through_to_none() -> None:
    d, _, _, _, tempo_calls = _make_dispatcher_with_recording_hooks()
    d.dispatch(
        _frame(
            "audio.transport.tap_tempo",
            action="trigger",
            args=["not-a-number"],
        )
    )
    assert tempo_calls == [None]


def test_tap_tempo_multiple_taps_recorded() -> None:
    d, _, _, _, tempo_calls = _make_dispatcher_with_recording_hooks()
    for ts in [100, 200, 300, 400]:
        d.dispatch(
            _frame("audio.transport.tap_tempo", action="trigger", args=[ts])
        )
    assert tempo_calls == [100, 200, 300, 400]


# ---------------------------------------------------------------------------
# No-hook (production-not-yet-wired) fallback
# ---------------------------------------------------------------------------


def test_handlers_with_no_hooks_are_silent_no_ops() -> None:
    """Default HandlerHooks() has all hooks=None. Dispatch must not
    raise and must increment dispatched_count (handler did fire) — it
    just doesn't do anything observable."""
    dispatcher = EngineCommandDispatcher()
    register_default_handlers(dispatcher, hooks=None)
    dispatcher.dispatch(_frame("audio.chain.1.bypass", action="set", value=1.0))
    dispatcher.dispatch(_frame("audio.snapshot.recall", action="set", value=2.0))
    dispatcher.dispatch(_frame("audio.master.volume", action="set", value=0.5))
    dispatcher.dispatch(_frame("audio.transport.tap_tempo"))
    # T2508 — five recorder verbs share the same no-hook silent-no-op behavior.
    dispatcher.dispatch(_frame("recorder.arm", args=["sess-1"]))
    dispatcher.dispatch(_frame("recorder.disarm", args=["sess-1"]))
    dispatcher.dispatch(_frame("recorder.roll", args=["sess-1"]))
    dispatcher.dispatch(_frame("recorder.stop", args=["sess-1"]))
    dispatcher.dispatch(_frame("recorder.status", args=["sess-1"]))
    assert dispatcher.dispatched_count == 9
    assert dispatcher.errored_count == 0


def test_register_default_handlers_does_not_overlap_targets() -> None:
    """Sanity: every registered target/pattern is unique."""
    dispatcher = EngineCommandDispatcher()
    register_default_handlers(dispatcher)
    # Exact targets: snapshot.recall, master.volume, transport.tap_tempo,
    # plus the 5 T2508 recorder verbs, plus audio.looper.master.level
    # from T2512-MIDI = 9 total.
    # Pattern list: audio.chain.*.bypass + the 10 audio.looper.*.<verb>
    # patterns from T2512-MIDI + audio.looper.*.locked from
    # T2512-LOCK-MIDI = 12.
    assert len(dispatcher._exact) == 9  # type: ignore[attr-defined]
    assert len(dispatcher._patterns) == 12  # type: ignore[attr-defined]
    expected_exact = {
        "audio.snapshot.recall",
        "audio.master.volume",
        "audio.transport.tap_tempo",
        "recorder.arm",
        "recorder.disarm",
        "recorder.roll",
        "recorder.stop",
        "recorder.status",
        "audio.looper.master.level",
    }
    assert set(dispatcher._exact.keys()) == expected_exact  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# T2508 — recorder verbs (recorder.arm / disarm / roll / stop / status)
# ---------------------------------------------------------------------------


def test_recorder_arm_routes_with_session_id() -> None:
    d, arm_calls, *_ = _make_dispatcher_with_recorder_hooks()
    d.dispatch(_frame("recorder.arm", args=["sess-42"]))
    assert arm_calls == ["sess-42"]


def test_recorder_disarm_routes_with_session_id() -> None:
    d, _arm, disarm_calls, *_ = _make_dispatcher_with_recorder_hooks()
    d.dispatch(_frame("recorder.disarm", args=["sess-42"]))
    assert disarm_calls == ["sess-42"]


def test_recorder_roll_routes_with_session_id() -> None:
    d, _arm, _disarm, roll_calls, *_ = _make_dispatcher_with_recorder_hooks()
    d.dispatch(_frame("recorder.roll", args=["sess-42"]))
    assert roll_calls == ["sess-42"]


def test_recorder_stop_routes_with_session_id() -> None:
    d, _arm, _disarm, _roll, stop_calls, _status = (
        _make_dispatcher_with_recorder_hooks()
    )
    d.dispatch(_frame("recorder.stop", args=["sess-42"]))
    assert stop_calls == ["sess-42"]


def test_recorder_status_routes_with_session_id() -> None:
    d, _arm, _disarm, _roll, _stop, status_calls = (
        _make_dispatcher_with_recorder_hooks()
    )
    d.dispatch(_frame("recorder.status", args=["sess-42"]))
    assert status_calls == ["sess-42"]


def test_recorder_arm_drops_missing_args() -> None:
    """No args → handler logs WARN and returns; no service call."""
    d, arm_calls, *_ = _make_dispatcher_with_recorder_hooks()
    d.dispatch(_frame("recorder.arm"))
    assert arm_calls == []
    # Dispatcher still counts the dispatch as completed (the handler did
    # fire — it just declined to invoke the hook). That matches the
    # established "WARN + return" pattern used by snapshot.recall when
    # value is missing.
    assert d.dispatched_count == 1
    assert d.errored_count == 0


def test_recorder_disarm_drops_blank_session_id() -> None:
    """Blank session_id (empty string, whitespace) → handler declines."""
    d, _arm, disarm_calls, *_ = _make_dispatcher_with_recorder_hooks()
    d.dispatch(_frame("recorder.disarm", args=[""]))
    d.dispatch(_frame("recorder.disarm", args=["   "]))
    d.dispatch(_frame("recorder.disarm", args=[None]))
    assert disarm_calls == []
    assert d.dispatched_count == 3
    assert d.errored_count == 0


def test_recorder_roll_ignores_non_set_action() -> None:
    """Recorder verbs are lifecycle triggers — no toggle / increment."""
    d, _arm, _disarm, roll_calls, *_ = _make_dispatcher_with_recorder_hooks()
    d.dispatch(_frame("recorder.roll", action="toggle", args=["sess-42"]))
    d.dispatch(_frame("recorder.roll", action="increment", args=["sess-42"]))
    assert roll_calls == []
    assert d.dispatched_count == 2
    assert d.errored_count == 0


def test_recorder_stop_coerces_non_string_session_id_to_str() -> None:
    """args[0] arrives as whatever JSON parsed it as. The handler runs
    str() + strip() so an integer / float / bool round-trips into a
    string session_id without crashing."""
    d, _arm, _disarm, _roll, stop_calls, _status = (
        _make_dispatcher_with_recorder_hooks()
    )
    d.dispatch(_frame("recorder.stop", args=[42]))
    d.dispatch(_frame("recorder.stop", args=[True]))
    assert stop_calls == ["42", "True"]


def test_recorder_status_multiple_dispatches_for_same_session() -> None:
    """Status pings are idempotent — handler doesn't dedupe; the
    recorder service does that if it cares to."""
    d, _arm, _disarm, _roll, _stop, status_calls = (
        _make_dispatcher_with_recorder_hooks()
    )
    d.dispatch(_frame("recorder.status", args=["sess-1"]))
    d.dispatch(_frame("recorder.status", args=["sess-1"]))
    d.dispatch(_frame("recorder.status", args=["sess-1"]))
    assert status_calls == ["sess-1", "sess-1", "sess-1"]


def test_recorder_verbs_with_no_hooks_are_silent_no_ops() -> None:
    """T2508 default HandlerHooks() has every recorder_* hook = None.
    Dispatch must not raise and must increment dispatched_count."""
    dispatcher = EngineCommandDispatcher()
    register_default_handlers(dispatcher, hooks=None)
    dispatcher.dispatch(_frame("recorder.arm", args=["sess-1"]))
    dispatcher.dispatch(_frame("recorder.disarm", args=["sess-1"]))
    dispatcher.dispatch(_frame("recorder.roll", args=["sess-1"]))
    dispatcher.dispatch(_frame("recorder.stop", args=["sess-1"]))
    dispatcher.dispatch(_frame("recorder.status", args=["sess-1"]))
    assert dispatcher.dispatched_count == 5
    assert dispatcher.errored_count == 0


def test_recorder_handlers_isolate_session_ids() -> None:
    """Five verbs can interleave on multiple sessions without cross-talk."""
    d, arm_calls, disarm_calls, roll_calls, stop_calls, status_calls = (
        _make_dispatcher_with_recorder_hooks()
    )
    d.dispatch(_frame("recorder.arm", args=["sess-A"]))
    d.dispatch(_frame("recorder.arm", args=["sess-B"]))
    d.dispatch(_frame("recorder.roll", args=["sess-A"]))
    d.dispatch(_frame("recorder.status", args=["sess-B"]))
    d.dispatch(_frame("recorder.stop", args=["sess-A"]))
    d.dispatch(_frame("recorder.disarm", args=["sess-B"]))
    assert arm_calls == ["sess-A", "sess-B"]
    assert roll_calls == ["sess-A"]
    assert status_calls == ["sess-B"]
    assert stop_calls == ["sess-A"]
    assert disarm_calls == ["sess-B"]


# ---------------------------------------------------------------------------
# T2512-MIDI — audio.looper.<track>.<verb> + audio.looper.master.level
# ---------------------------------------------------------------------------


def _make_dispatcher_with_looper_hooks() -> tuple[
    EngineCommandDispatcher,
    dict[str, list],
]:
    """Per-verb recording harness for the looper dispatcher path."""
    log: dict[str, list] = {
        "record": [],
        "stop": [],
        "clear": [],
        "undo": [],
        "redo": [],
        "level": [],
        "muted": [],
        "soloed": [],
        "reverse": [],
        "half_speed": [],
        "locked": [],
        "master_level": [],
    }

    hooks = HandlerHooks(
        looper_record=lambda track: log["record"].append(track),
        looper_stop=lambda track: log["stop"].append(track),
        looper_clear=lambda track: log["clear"].append(track),
        looper_undo=lambda track: log["undo"].append(track),
        looper_redo=lambda track: log["redo"].append(track),
        looper_set_level=lambda track, value: log["level"].append((track, value)),
        looper_set_muted=lambda track, value: log["muted"].append((track, value)),
        looper_set_soloed=lambda track, value: log["soloed"].append((track, value)),
        looper_set_reverse=lambda track, value: log["reverse"].append((track, value)),
        looper_set_half_speed=lambda track, value: log["half_speed"].append(
            (track, value)
        ),
        looper_set_locked=lambda track, value: log["locked"].append((track, value)),
        looper_set_master_level=lambda value: log["master_level"].append(value),
    )
    dispatcher = EngineCommandDispatcher()
    register_default_handlers(dispatcher, hooks=hooks)
    return dispatcher, log


def test_looper_record_stomp_routes_to_track() -> None:
    d, log = _make_dispatcher_with_looper_hooks()
    d.dispatch(_frame("audio.looper.0.record", action="set", value=127.0))
    d.dispatch(_frame("audio.looper.2.record", action="set", value=64.0))
    assert log["record"] == [0, 2]


def test_looper_stomp_drops_release_at_value_zero() -> None:
    """A MIDI footswitch sends CC value=0 on release; ignore it."""
    d, log = _make_dispatcher_with_looper_hooks()
    d.dispatch(_frame("audio.looper.0.record", action="set", value=127.0))
    d.dispatch(_frame("audio.looper.0.record", action="set", value=0.0))
    assert log["record"] == [0]


def test_looper_all_stomp_verbs_dispatch() -> None:
    d, log = _make_dispatcher_with_looper_hooks()
    for verb in ("record", "stop", "clear", "undo", "redo"):
        d.dispatch(_frame(f"audio.looper.1.{verb}", action="set", value=127.0))
    assert log["record"] == [1]
    assert log["stop"] == [1]
    assert log["clear"] == [1]
    assert log["undo"] == [1]
    assert log["redo"] == [1]


def test_looper_level_setter_clamps_and_routes() -> None:
    d, log = _make_dispatcher_with_looper_hooks()
    d.dispatch(_frame("audio.looper.0.level", action="set", value=-12.0))
    d.dispatch(_frame("audio.looper.1.level", action="set", value=99.0))  # > 6dB
    d.dispatch(_frame("audio.looper.2.level", action="set", value=-999.0))  # < -60
    assert log["level"] == [(0, -12.0), (1, 6.0), (2, -60.0)]


def test_looper_bool_setters_set_and_toggle() -> None:
    d, log = _make_dispatcher_with_looper_hooks()
    d.dispatch(_frame("audio.looper.0.muted", action="set", value=1.0))
    d.dispatch(_frame("audio.looper.0.muted", action="set", value=0.0))
    d.dispatch(_frame("audio.looper.3.soloed", action="toggle"))
    d.dispatch(_frame("audio.looper.2.reverse", action="set", value=1.0))
    d.dispatch(_frame("audio.looper.2.half_speed", action="set", value=1.0))
    assert log["muted"] == [(0, True), (0, False)]
    assert log["soloed"] == [(3, True)]
    assert log["reverse"] == [(2, True)]
    assert log["half_speed"] == [(2, True)]


def test_looper_invalid_track_index_dropped() -> None:
    d, log = _make_dispatcher_with_looper_hooks()
    d.dispatch(_frame("audio.looper.4.record", action="set", value=127.0))  # out of range
    d.dispatch(_frame("audio.looper.x.record", action="set", value=127.0))  # non-int
    d.dispatch(_frame("audio.looper.-1.record", action="set", value=127.0))  # negative
    assert log["record"] == []


def test_looper_master_level_clamps() -> None:
    d, log = _make_dispatcher_with_looper_hooks()
    d.dispatch(_frame("audio.looper.master.level", action="set", value=-3.0))
    d.dispatch(_frame("audio.looper.master.level", action="set", value=99.0))  # > 6
    d.dispatch(_frame("audio.looper.master.level", action="set", value=-999.0))  # < -60
    assert log["master_level"] == [-3.0, 6.0, -60.0]


def test_looper_handlers_safe_with_no_hooks_wired() -> None:
    """Default HandlerHooks() has every looper_* = None. Dispatch must not
    raise and must increment dispatched_count."""
    dispatcher = EngineCommandDispatcher()
    register_default_handlers(dispatcher, hooks=None)
    dispatcher.dispatch(_frame("audio.looper.0.record", action="set", value=127.0))
    dispatcher.dispatch(_frame("audio.looper.1.level", action="set", value=-6.0))
    dispatcher.dispatch(_frame("audio.looper.2.muted", action="set", value=1.0))
    dispatcher.dispatch(_frame("audio.looper.master.level", action="set", value=0.0))
    dispatcher.dispatch(_frame("audio.looper.3.locked", action="set", value=1.0))
    assert dispatcher.dispatched_count == 5
    assert dispatcher.errored_count == 0


# ---------------------------------------------------------------------------
# T2512-LOCK-MIDI — audio.looper.<n>.locked dispatcher target
# ---------------------------------------------------------------------------


def test_looper_locked_routes_via_set() -> None:
    d, log = _make_dispatcher_with_looper_hooks()
    d.dispatch(_frame("audio.looper.0.locked", action="set", value=1.0))
    d.dispatch(_frame("audio.looper.0.locked", action="set", value=0.0))
    assert log["locked"] == [(0, True), (0, False)]


def test_looper_locked_honors_toggle_action() -> None:
    d, log = _make_dispatcher_with_looper_hooks()
    d.dispatch(_frame("audio.looper.2.locked", action="toggle"))
    assert log["locked"] == [(2, True)]


def test_looper_locked_invalid_track_dropped() -> None:
    d, log = _make_dispatcher_with_looper_hooks()
    d.dispatch(_frame("audio.looper.9.locked", action="set", value=1.0))
    assert log["locked"] == []

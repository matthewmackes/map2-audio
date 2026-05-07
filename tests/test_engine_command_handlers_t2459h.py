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
    assert dispatcher.dispatched_count == 4
    assert dispatcher.errored_count == 0


def test_register_default_handlers_does_not_overlap_targets() -> None:
    """Sanity: the four target/patterns we register don't collide."""
    dispatcher = EngineCommandDispatcher()
    register_default_handlers(dispatcher)
    # exact map has 3 entries; pattern list has 1.
    assert len(dispatcher._exact) == 3  # type: ignore[attr-defined]
    assert len(dispatcher._patterns) == 1  # type: ignore[attr-defined]

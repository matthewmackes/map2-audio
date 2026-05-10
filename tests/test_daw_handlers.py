"""T2503 Set 4 — daw.* engine_command handler suite tests.

Pumps every verb through a real EngineCommandDispatcher with fake hooks,
asserting (a) verbs are registered, (b) handlers extract args correctly,
(c) hook call shapes match the schema, (d) malformed payloads are handled
gracefully (warning, no crash).
"""

from __future__ import annotations

from typing import Any, List

import pytest

from app.services.daw_handlers import (
    DAW_VERBS,
    DawHandlerHooks,
    register_daw_handlers,
)
from app.services.engine_command_dispatcher import EngineCommandDispatcher


@pytest.fixture
def dispatcher_with_hooks():
    """Build a dispatcher with a dataclass that records every hook call."""
    calls: List[tuple] = []

    hooks = DawHandlerHooks(
        transport_play=lambda: calls.append(("transport_play",)),
        transport_stop=lambda: calls.append(("transport_stop",)),
        transport_record=lambda arm: calls.append(("transport_record", arm)),
        transport_set_position=lambda samples: calls.append(("transport_set_position", samples)),
        project_new=lambda name: calls.append(("project_new", name)),
        project_load=lambda path: calls.append(("project_load", path)),
        project_save=lambda: calls.append(("project_save",)),
        track_create=lambda track_type, **kwargs: (calls.append(("track_create", track_type, kwargs)), 7)[1],  # returns 7
        track_delete=lambda tid: calls.append(("track_delete", tid)),
        track_set_arm=lambda tid, arm: calls.append(("track_set_arm", tid, arm)),
        clip_add=lambda tid, start, length, source: (calls.append(("clip_add", tid, start, length, source)), 11)[1],
        clip_remove=lambda cid: calls.append(("clip_remove", cid)),
        clip_move=lambda cid, ns: calls.append(("clip_move", cid, ns)),
        automation_set_point=lambda lid, pos, val: calls.append(("automation_set_point", lid, pos, val)),
        plugin_add_to_track=lambda tid, uri: (calls.append(("plugin_add_to_track", tid, uri)), 0)[1],
        plugin_remove_from_track=lambda tid, slot: calls.append(("plugin_remove_from_track", tid, slot)),
        plugin_set_param=lambda tid, slot, pid, val: calls.append(("plugin_set_param", tid, slot, pid, val)),
    )

    dispatcher = EngineCommandDispatcher()
    register_daw_handlers(dispatcher, hooks=hooks)
    return dispatcher, calls


def _frame(target: str, *, action: str = "set", value: Any = None, args: List[Any] = None) -> dict:
    return {
        "type": "engine_command",
        "target": target,
        "action": action,
        "value": value,
        "args": list(args) if args is not None else [],
        "controller_key": "test",
        "msg_id": "test-1",
    }


def test_all_17_verbs_registered() -> None:
    """Every verb in DAW_VERBS resolves through the dispatcher."""
    dispatcher = EngineCommandDispatcher()
    register_daw_handlers(dispatcher)
    assert len(DAW_VERBS) == 17
    # Internal: registered verbs all live in dispatcher._exact.
    assert set(DAW_VERBS).issubset(set(dispatcher._exact.keys()))  # type: ignore[attr-defined]


def test_transport_play_dispatches(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(_frame("daw.transport.play"))
    assert calls == [("transport_play",)]


def test_transport_stop_dispatches(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(_frame("daw.transport.stop"))
    assert calls == [("transport_stop",)]


def test_transport_record_arm_true(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(_frame("daw.transport.record", value=1.0))
    assert calls == [("transport_record", True)]


def test_transport_record_arm_false(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(_frame("daw.transport.record", value=0.0))
    assert calls == [("transport_record", False)]


def test_transport_set_position(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(_frame("daw.transport.set_position", value=48000))
    assert calls == [("transport_set_position", 48000)]


def test_transport_set_position_missing_value_warns(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(_frame("daw.transport.set_position", value=None))
    assert calls == []  # no hook fired


def test_project_new(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(_frame("daw.project.new", args=["my-song"]))
    assert calls == [("project_new", "my-song")]


def test_project_load(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(_frame("daw.project.load", args=["~/.map2/daw/my-song"]))
    assert calls == [("project_load", "~/.map2/daw/my-song")]


def test_project_save(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(_frame("daw.project.save"))
    assert calls == [("project_save",)]


def test_track_create_with_name(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(_frame("daw.track.create", args=["audio", "Lead Vocal"]))
    assert calls == [("track_create", "audio", {"name": "Lead Vocal"})]


def test_track_create_default_name(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(_frame("daw.track.create", args=["midi"]))
    # No name kwarg passed when name absent.
    assert calls == [("track_create", "midi", {})]


def test_track_delete(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(_frame("daw.track.delete", value=3))
    assert calls == [("track_delete", 3)]


def test_track_set_arm(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(_frame("daw.track.set_arm", value=2, args=[True]))
    assert calls == [("track_set_arm", 2, True)]


def test_clip_add(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(
        _frame("daw.clip.add", args=[1, 0, 48000, "audio/take1.wav"])
    )
    assert calls == [("clip_add", 1, 0, 48000, "audio/take1.wav")]


def test_clip_add_missing_args_warns(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(_frame("daw.clip.add", args=[1, 0]))  # only 2 of 4
    assert calls == []


def test_clip_remove(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(_frame("daw.clip.remove", args=[42]))
    assert calls == [("clip_remove", 42)]


def test_clip_move(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(_frame("daw.clip.move", args=[42, 96000]))
    assert calls == [("clip_move", 42, 96000)]


def test_automation_set_point(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(
        _frame("daw.automation.set_point", args=[5, 1.5, 0.75])
    )
    assert calls == [("automation_set_point", 5, 1.5, 0.75)]


def test_plugin_add_to_track(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(
        _frame("daw.plugin.add_to_track", args=[2, "http://lv2plug.in/plugins/eg-amp"])
    )
    assert calls == [("plugin_add_to_track", 2, "http://lv2plug.in/plugins/eg-amp")]


def test_plugin_remove_from_track(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(_frame("daw.plugin.remove_from_track", args=[2, 0]))
    assert calls == [("plugin_remove_from_track", 2, 0)]


def test_plugin_set_param(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(
        _frame("daw.plugin.set_param", args=[2, 0, "gain", 0.5])
    )
    assert calls == [("plugin_set_param", 2, 0, "gain", 0.5)]


def test_no_hook_path_logs_and_returns() -> None:
    """With None hooks, every verb is a clean no-op."""
    dispatcher = EngineCommandDispatcher()
    register_daw_handlers(dispatcher, hooks=None)
    # Pump a representative verb. No exception, no crash.
    dispatcher.dispatch(_frame("daw.transport.play"))
    dispatcher.dispatch(_frame("daw.track.delete", value=1))
    dispatcher.dispatch(_frame("daw.clip.add", args=[1, 0, 48000, "audio/x.wav"]))


def test_malformed_args_on_clip_add_does_not_crash(dispatcher_with_hooks) -> None:
    """Non-int chain id in args triggers a warning, no hook fire."""
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(_frame("daw.clip.add", args=["bogus", 0, 48000, "x.wav"]))
    assert calls == []


def test_track_set_arm_missing_value_warns(dispatcher_with_hooks) -> None:
    dispatcher, calls = dispatcher_with_hooks
    dispatcher.dispatch(_frame("daw.track.set_arm", value=None, args=[True]))
    assert calls == []

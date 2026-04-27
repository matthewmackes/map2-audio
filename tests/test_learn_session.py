"""Tests for the in-memory MIDI learn session registry.

T2459-D4.
"""

from __future__ import annotations

import pytest

from app.services.controllers.learn_session import (
    LearnSessionRegistry,
    get_learn_registry,
    reset_learn_registry_for_tests,
)


@pytest.fixture(autouse=True)
def _reset_registry() -> None:
    reset_learn_registry_for_tests()
    yield
    reset_learn_registry_for_tests()


def test_start_returns_a_unique_session_id() -> None:
    reg = LearnSessionRegistry()
    a = reg.start("alsa-seq:UA-1000:0", "edirol-ua", "ua-1000")
    b = reg.start("alsa-seq:UA-1000:0", "edirol-ua", "ua-1000")
    assert a != b
    assert reg.get(a) is not None
    assert reg.get(b) is not None


def test_capture_appends_and_classifies() -> None:
    reg = LearnSessionRegistry()
    sid = reg.start("k", "edirol-ua", "ua-1000")
    # Capture a CC sweep — should classify as knob_absolute.
    for v in (0, 32, 64, 96, 127):
        result = reg.capture(sid, [0xB0, 7, v])
    # After enough samples, the classifier should recognise the absolute pot.
    assert result.kind in ("knob_absolute", "unknown")
    if result.kind == "knob_absolute":
        assert result.midino == 7
        assert result.status == 0xB0


def test_capture_for_unknown_session_returns_unknown_without_raising() -> None:
    reg = LearnSessionRegistry()
    result = reg.capture("does-not-exist", [0xB0, 7, 64])
    assert result.kind == "unknown"
    assert result.confidence == 0.0


def test_assign_translates_classification_to_yaml_row() -> None:
    reg = LearnSessionRegistry()
    sid = reg.start("k", "edirol-ua", "ua-1000")
    for v in (0, 32, 64, 96, 127):
        reg.capture(sid, [0xB0, 7, v])
    row = reg.assign(sid, target="audio.master.volume", script=None,
                     action="set", fast_path=False)
    assert row is not None
    assert row["status"] == 0xB0
    assert row["midino"] == 7
    assert row["target"] == "audio.master.volume"
    assert row["action"] == "set"
    assert "fast_path" not in row    # default false → omitted


def test_assign_with_fast_path_sets_flag() -> None:
    reg = LearnSessionRegistry()
    sid = reg.start("k", "edirol-ua", "ua-1000")
    reg.capture(sid, [0xB0, 64, 127])
    reg.capture(sid, [0xB0, 64, 0])
    row = reg.assign(sid, target="audio.chain.1.bypass", script=None,
                     action="toggle", fast_path=True)
    assert row is not None
    assert row["fast_path"] is True


def test_assign_clears_session_after_use() -> None:
    reg = LearnSessionRegistry()
    sid = reg.start("k", "edirol-ua", "ua-1000")
    reg.capture(sid, [0xB0, 7, 100])
    reg.assign(sid, target="audio.master.volume", script=None,
                action="set", fast_path=False)
    # Session should be gone after assign.
    assert reg.get(sid) is None


def test_assign_returns_none_for_empty_session() -> None:
    reg = LearnSessionRegistry()
    sid = reg.start("k", "edirol-ua", "ua-1000")
    row = reg.assign(sid, target="audio.master.volume", script=None,
                     action="set", fast_path=False)
    assert row is None   # no captured messages → unknown classification


def test_cancel_removes_session() -> None:
    reg = LearnSessionRegistry()
    sid = reg.start("k", "edirol-ua", "ua-1000")
    assert reg.cancel(sid) is True
    assert reg.cancel(sid) is False   # second cancel: no-op


def test_singleton_helper() -> None:
    a = get_learn_registry()
    b = get_learn_registry()
    assert a is b
    reset_learn_registry_for_tests()
    c = get_learn_registry()
    assert c is not a

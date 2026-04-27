"""T2461-A3 — bench-state tracker last_bound_at API."""

from __future__ import annotations

import time
from pathlib import Path

import pytest

from app.services.controllers.bench_state import BenchStateTracker


@pytest.fixture
def tracker(tmp_path: Path) -> BenchStateTracker:
    return BenchStateTracker(pin_file=tmp_path / "pins.json")


def test_record_binding_save_and_last_bound(tracker):
    assert tracker.last_bound("edirol-ua/ua-1000.midi") is None
    before = time.time()
    tracker.record_binding_save("edirol-ua/ua-1000.midi")
    after = time.time()
    ts = tracker.last_bound("edirol-ua/ua-1000.midi")
    assert ts is not None
    assert before <= ts <= after


def test_record_binding_save_updates_existing(tracker):
    tracker.record_binding_save("edirol-ua/ua-1000.midi", now=100.0)
    assert tracker.last_bound("edirol-ua/ua-1000.midi") == 100.0
    tracker.record_binding_save("edirol-ua/ua-1000.midi", now=200.0)
    assert tracker.last_bound("edirol-ua/ua-1000.midi") == 200.0


def test_last_bound_unknown_key_returns_none(tracker):
    assert tracker.last_bound("nope/missing.midi") is None


def test_record_binding_save_drops_24h_stale_entries(tracker):
    # Plant a stale entry by manipulating internal state via a save with
    # a fake `now` in the past.
    tracker.record_binding_save("old/profile.midi", now=time.time() - 100_000)
    tracker.record_binding_save("fresh/profile.midi", now=time.time())
    # GC fires inside record_binding_save; old entry should be gone.
    assert tracker.last_bound("old/profile.midi") is None
    assert tracker.last_bound("fresh/profile.midi") is not None

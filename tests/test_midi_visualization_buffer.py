"""T2500-MV-B1 — rolling 5-min edge traffic buffer tests."""

from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import pytest

from app.services.midi_visualization_buffer import (
    MidiTrafficBuffer,
    is_noise_event,
)


def _evt(
    src: str = "device:p1",
    dst: str = "mapping:m1",
    *,
    ts_ms: float | None = None,
    **extra: Any,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "kind": "raw",
        "source_node_id": src,
        "target_node_id": dst,
    }
    if ts_ms is not None:
        out["ts_ms"] = ts_ms
    out.update(extra)
    return out


# ---------------------------------------------------------------------
# Append + replay roundtrip
# ---------------------------------------------------------------------


def test_append_and_replay_roundtrip() -> None:
    buf = MidiTrafficBuffer(clock_filter_default=False, time_source=lambda: 0.0)
    buf.append(_evt(ts_ms=1.0))
    buf.append(_evt(ts_ms=2.0))
    out = buf.replay()
    assert [e["ts_ms"] for e in out] == [1.0, 2.0]


def test_replay_returns_events_in_chronological_order() -> None:
    buf = MidiTrafficBuffer(clock_filter_default=False, time_source=lambda: 0.0)
    # Insert out of order; replay must sort.
    for ts in (5.0, 1.0, 3.0, 2.0, 4.0):
        buf.append(_evt(ts_ms=ts))
    out = buf.replay()
    assert [e["ts_ms"] for e in out] == [1.0, 2.0, 3.0, 4.0, 5.0]


# ---------------------------------------------------------------------
# Eviction
# ---------------------------------------------------------------------


def test_events_older_than_ttl_are_evicted_on_replay() -> None:
    now = [1000.0]  # seconds
    buf = MidiTrafficBuffer(
        ttl_s=10.0,
        clock_filter_default=False,
        time_source=lambda: now[0],
    )
    buf.append(_evt(ts_ms=900_000.0))   # 100 s ago — too old
    buf.append(_evt(ts_ms=995_000.0))   # 5 s ago — fresh
    buf.append(_evt(ts_ms=999_000.0))   # 1 s ago — fresh
    out = buf.replay()
    assert [e["ts_ms"] for e in out] == [995_000.0, 999_000.0]


# ---------------------------------------------------------------------
# Per-edge cap (deque maxlen)
# ---------------------------------------------------------------------


def test_per_edge_cap_drops_oldest_when_full() -> None:
    buf = MidiTrafficBuffer(
        per_edge_max=3, clock_filter_default=False, time_source=lambda: 0.0
    )
    for i in range(5):
        buf.append(_evt(ts_ms=float(i)))
    out = buf.replay()
    # Only the last 3 survive.
    assert [e["ts_ms"] for e in out] == [2.0, 3.0, 4.0]


# ---------------------------------------------------------------------
# Multi-thread concurrency
# ---------------------------------------------------------------------


def test_concurrent_appends_preserve_all_events() -> None:
    buf = MidiTrafficBuffer(
        per_edge_max=10_000, clock_filter_default=False, time_source=lambda: 0.0
    )

    def _producer(thread_id: int) -> None:
        for i in range(200):
            buf.append(
                _evt(
                    src=f"device:t{thread_id}",
                    dst=f"mapping:t{thread_id}",
                    ts_ms=float(thread_id * 10_000 + i),
                )
            )

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(_producer, range(8)))

    out = buf.replay()
    # 8 threads × 200 events = 1600 events.
    assert len(out) == 8 * 200


# ---------------------------------------------------------------------
# Clock filter
# ---------------------------------------------------------------------


def test_clock_filter_drops_noise_events_by_default() -> None:
    buf = MidiTrafficBuffer(time_source=lambda: 0.0)  # clock_filter_default=True
    buf.append(_evt(ts_ms=1.0, raw_hex="f8"))            # MIDI clock
    buf.append(_evt(ts_ms=2.0, raw_hex="903c40"))        # Note On
    buf.append(_evt(ts_ms=3.0, raw_hex="fe"))            # Active sense
    out = buf.replay()  # default include_noise=None → defer to filter (drop)
    assert [e["raw_hex"] for e in out] == ["903c40"]


def test_clock_filter_can_be_overridden_per_replay() -> None:
    buf = MidiTrafficBuffer(time_source=lambda: 0.0)
    buf.append(_evt(ts_ms=1.0, raw_hex="f8"))
    buf.append(_evt(ts_ms=2.0, raw_hex="903c40"))
    forced_in = buf.replay(include_noise=True)
    assert {e["raw_hex"] for e in forced_in} == {"f8", "903c40"}


def test_is_noise_event_recognises_decoded_status() -> None:
    assert is_noise_event({"decoded": {"status": 0xF8}}) is True
    assert is_noise_event({"decoded": {"status": 0x90}}) is False
    assert is_noise_event({"status_byte": 0xFE}) is True
    assert is_noise_event({}) is False


# ---------------------------------------------------------------------
# Defensive
# ---------------------------------------------------------------------


def test_append_drops_event_with_missing_node_ids() -> None:
    buf = MidiTrafficBuffer(clock_filter_default=False, time_source=lambda: 0.0)
    buf.append({"kind": "raw"})  # no source/target
    buf.append({"kind": "raw", "source_node_id": "device:p1"})  # only one
    assert buf.event_count() == 0


def test_subscribe_observer_fires_on_each_append() -> None:
    buf = MidiTrafficBuffer(clock_filter_default=False, time_source=lambda: 0.0)
    seen: list[float] = []
    unsubscribe = buf.subscribe(lambda evt: seen.append(evt["ts_ms"]))
    buf.append(_evt(ts_ms=1.0))
    buf.append(_evt(ts_ms=2.0))
    unsubscribe()
    buf.append(_evt(ts_ms=3.0))
    assert seen == [1.0, 2.0]


def test_buggy_observer_does_not_kill_producer() -> None:
    buf = MidiTrafficBuffer(clock_filter_default=False, time_source=lambda: 0.0)
    buf.subscribe(lambda evt: (_ for _ in ()).throw(RuntimeError("boom")))
    survivor: list[float] = []
    buf.subscribe(lambda evt: survivor.append(evt["ts_ms"]))
    buf.append(_evt(ts_ms=1.0))
    assert survivor == [1.0]
    # Buffer also recorded the event despite the bad observer.
    assert buf.event_count() == 1


def test_invalid_ttl_or_per_edge_max_raises() -> None:
    with pytest.raises(ValueError):
        MidiTrafficBuffer(ttl_s=0)
    with pytest.raises(ValueError):
        MidiTrafficBuffer(per_edge_max=0)

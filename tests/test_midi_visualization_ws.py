"""T2500-MV-B3 — /ws/midi/visualization endpoint tests."""

from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import midi_visualization_ws
from app.services.midi_visualization_buffer import (
    MidiTrafficBuffer,
    reset_midi_visualization_buffer_for_tests,
)


def _build_client(buffer: MidiTrafficBuffer) -> TestClient:
    # Patch the route's buffer accessor to point at our test buffer.
    midi_visualization_ws.get_midi_visualization_buffer = lambda: buffer  # type: ignore[assignment]
    app = FastAPI()
    app.include_router(midi_visualization_ws.router)
    return TestClient(app)


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
# Replay handshake
# ---------------------------------------------------------------------


def test_replay_handshake_returns_buffered_events() -> None:
    buf = MidiTrafficBuffer(clock_filter_default=False, time_source=lambda: 0.0)
    buf.append(_evt(ts_ms=1.0))
    buf.append(_evt(ts_ms=2.0))
    client = _build_client(buf)

    with client.websocket_connect("/ws/midi/visualization") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "replay"
        assert [e["ts_ms"] for e in msg["events"]] == [1.0, 2.0]


def test_replay_handshake_includes_noise_events() -> None:
    buf = MidiTrafficBuffer(clock_filter_default=True, time_source=lambda: 0.0)
    buf.append(_evt(ts_ms=1.0, raw_hex="f8"))  # MIDI clock — noise
    buf.append(_evt(ts_ms=2.0, raw_hex="903c40"))  # Note On
    client = _build_client(buf)

    with client.websocket_connect("/ws/midi/visualization") as ws:
        msg = ws.receive_json()
        # Frontend opts to filter; server replay carries everything so
        # the toggle has data to operate on.
        assert {e["raw_hex"] for e in msg["events"]} == {"f8", "903c40"}


# ---------------------------------------------------------------------
# Live forwarding
# ---------------------------------------------------------------------


def test_live_event_forwarded_after_replay() -> None:
    buf = MidiTrafficBuffer(clock_filter_default=False, time_source=lambda: 0.0)
    client = _build_client(buf)

    with client.websocket_connect("/ws/midi/visualization") as ws:
        # Drain the (empty) replay frame first.
        replay = ws.receive_json()
        assert replay["type"] == "replay"
        assert replay["events"] == []

        # Producer-side append from outside the connection — must
        # surface as a live "event" frame.
        buf.append(_evt(ts_ms=42.0, raw_hex="903c40"))
        # The TestClient drives the asyncio loop synchronously between
        # send/receive calls, so the queued event is delivered on the
        # next receive_json().
        msg = ws.receive_json()
        assert msg["type"] == "event"
        assert msg["event"]["ts_ms"] == 42.0
        assert msg["event"]["raw_hex"] == "903c40"


def test_disconnect_unsubscribes_observer() -> None:
    buf = MidiTrafficBuffer(clock_filter_default=False, time_source=lambda: 0.0)
    client = _build_client(buf)

    # Take the baseline observer count.
    baseline = len(buf._observers)  # noqa: SLF001 - test inspects internal state

    with client.websocket_connect("/ws/midi/visualization") as ws:
        ws.receive_json()  # replay
        # During the connection, exactly one observer is installed.
        assert len(buf._observers) == baseline + 1  # noqa: SLF001

    # On clean disconnect, the observer is removed.
    assert len(buf._observers) == baseline  # noqa: SLF001

"""T2500-MV-F1 — backend end-to-end test.

Wires the dispatcher → bridge → buffer → WS chain through real
modules (no FastAPI app, just the components plumbed together) and
verifies that a dispatched engine_command shows up over the WS as a
``{type: 'event'}`` frame after a fresh subscriber misses the replay.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import midi_visualization, midi_visualization_ws
from app.services.engine_command_dispatcher import EngineCommandDispatcher
from app.services.midi_visualization_buffer import (
    MidiTrafficBuffer,
    reset_midi_visualization_buffer_for_tests,
)
from app.services.midi_visualization_bridge import MidiVisualizationProducerBridge


@pytest.fixture
def buffer() -> MidiTrafficBuffer:
    """Fresh buffer per test, decoupled from the singleton."""
    return MidiTrafficBuffer(clock_filter_default=False, time_source=lambda: 0.0)


def test_dispatched_event_flows_through_bridge_into_buffer_and_replays_over_ws(
    buffer: MidiTrafficBuffer,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """End-to-end: dispatch a frame → bridge writes buffer → WS replay
    handshake hands it to a fresh subscriber."""
    dispatcher = EngineCommandDispatcher()

    class _StubBridge:
        def __init__(self, dispatcher: EngineCommandDispatcher) -> None:
            self.dispatcher = dispatcher

    monkeypatch.setattr(
        "app.services.engine_command_bridge.get_engine_command_bridge",
        lambda: _StubBridge(dispatcher),
    )
    monkeypatch.setattr(
        MidiVisualizationProducerBridge,
        "_install_hub_subscription",
        lambda self: None,
    )

    bridge = MidiVisualizationProducerBridge(buffer=buffer)
    bridge.install()

    dispatcher.register("audio.snapshot.recall", lambda c: None)

    # Drive 3 dispatches before the subscriber connects → all 3 should
    # land in the buffer and arrive in the replay handshake.
    for i in range(3):
        dispatcher.dispatch(
            {
                "type": "engine_command",
                "msg_id": f"m{i}",
                "schema_version": 1,
                "controller_key": "alsa:32:0",
                "target": "audio.snapshot.recall",
                "action": "set",
                "value": float(i),
            }
        )

    # Patch the WS route's buffer accessor to point at our test buffer.
    midi_visualization_ws.get_midi_visualization_buffer = (  # type: ignore[assignment]
        lambda: buffer
    )
    app = FastAPI()
    app.include_router(midi_visualization_ws.router)
    client = TestClient(app)

    with client.websocket_connect("/ws/midi/visualization") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "replay"
        assert len(msg["events"]) == 3
        kinds = {e["kind"] for e in msg["events"]}
        assert kinds == {"dispatched"}
        targets = {e["target_node_id"] for e in msg["events"]}
        assert targets == {"target:audio.snapshot.recall"}


def test_topology_route_includes_dispatcher_targets(monkeypatch: pytest.MonkeyPatch) -> None:
    """The graph endpoint surfaces dispatcher targets even when the
    controller-host is unreachable (degraded path)."""
    # No mappings, no ports — only targets via dispatcher introspection.
    dispatcher = EngineCommandDispatcher()
    dispatcher.register("audio.snapshot.recall", lambda c: None)
    dispatcher.register_pattern("audio.chain.*.bypass", lambda c: None)

    class _StubBridge:
        def __init__(self, dispatcher: EngineCommandDispatcher) -> None:
            self.dispatcher = dispatcher

    monkeypatch.setattr(
        "app.services.engine_command_bridge.get_engine_command_bridge",
        lambda: _StubBridge(dispatcher),
    )
    # Force ports + mappings providers to return empty.
    from app.services import midi_visualization_topology as topo_mod

    monkeypatch.setattr(topo_mod, "_default_ports_provider", lambda: [])
    monkeypatch.setattr(topo_mod, "_default_mappings_provider", lambda: [])

    app = FastAPI()
    app.include_router(midi_visualization.router)
    client = TestClient(app)
    resp = client.get("/api/midi/visualization/graph")
    assert resp.status_code == 200
    body = resp.json()
    target_labels = {n["label"] for n in body["nodes"] if n["kind"] == "target"}
    assert "audio.snapshot.recall" in target_labels
    assert "audio.chain.*.bypass" in target_labels

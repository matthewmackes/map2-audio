"""T2500-MV-A3 — topology HTTP route tests."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import midi_visualization


def _client_with_topology(monkeypatch, topology: dict) -> TestClient:
    monkeypatch.setattr(
        midi_visualization,
        "build_topology",
        lambda: topology,
    )
    app = FastAPI()
    app.include_router(midi_visualization.router)
    return TestClient(app)


def test_topology_endpoint_returns_empty_shape(monkeypatch) -> None:
    client = _client_with_topology(monkeypatch, {"nodes": [], "edges": []})
    resp = client.get("/api/midi/visualization/graph")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"nodes": [], "edges": []}


def test_topology_endpoint_returns_full_shape(monkeypatch) -> None:
    client = _client_with_topology(
        monkeypatch,
        {
            "nodes": [
                {"id": "device:p1", "kind": "device", "label": "Port 1", "raw": {}},
                {"id": "mapping:m1", "kind": "mapping", "label": "Map 1", "raw": {}},
                {"id": "target:audio.snapshot.recall", "kind": "target", "label": "snapshot.recall", "raw": {}},
            ],
            "edges": [
                {"source": "device:p1", "target": "mapping:m1"},
                {"source": "mapping:m1", "target": "target:audio.snapshot.recall"},
            ],
        },
    )
    resp = client.get("/api/midi/visualization/graph")
    assert resp.status_code == 200
    body = resp.json()
    assert {n["kind"] for n in body["nodes"]} == {"device", "mapping", "target"}
    assert len(body["edges"]) == 2

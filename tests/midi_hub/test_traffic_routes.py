from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import midi_hub as midi_hub_routes
from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.router import MidiRouter
from app.services.midi_hub.traffic_monitor import MidiTrafficMonitor, MidiTrafficRecord


def _build_client(tmp_path, monkeypatch):
    hub = MidiHub(auto_discover_alsa=False)
    monitor = MidiTrafficMonitor(capacity=128, export_dir=tmp_path)
    router = MidiRouter(hub=hub, persist_path=tmp_path / "routes.json", traffic_monitor=monitor)

    monkeypatch.setattr(midi_hub_routes, "get_midi_hub", lambda: hub)
    monkeypatch.setattr(midi_hub_routes, "get_midi_router", lambda: router)
    monkeypatch.setattr(midi_hub_routes, "get_midi_traffic_monitor", lambda: monitor)

    app = FastAPI()
    app.include_router(midi_hub_routes.router)
    return TestClient(app), hub, router, monitor


def test_traffic_snapshot_stats_export_clear(tmp_path, monkeypatch):
    client, hub, router, monitor = _build_client(tmp_path, monkeypatch)
    monitor.record(
        MidiTrafficRecord(
            timestamp_ns=1000,
            source_port="src",
            destination_port="dst",
            direction="outbound",
            raw_hex="90 3C 64",
            decoded={"message_type": "note_on", "channel": 1, "data1": 60, "data2": 100},
            route_id="r1",
        )
    )

    snapshot = client.get("/api/midi/hub/traffic/snapshot?limit=10")
    assert snapshot.status_code == 200
    payload = snapshot.json()
    assert payload["count"] == 1
    assert payload["records"][0]["source_port"] == "src"

    stats = client.get("/api/midi/hub/traffic/stats")
    assert stats.status_code == 200
    stats_payload = stats.json()
    assert stats_payload["count"] == 1
    assert stats_payload["per_type"]["note_on"] == 1

    exported = client.post("/api/midi/hub/traffic/export", json={"format": "csv", "limit": 50})
    assert exported.status_code == 200
    export_payload = exported.json()
    assert export_payload["ok"] is True
    assert export_payload["format"] == "csv"

    cleared = client.post("/api/midi/hub/traffic/clear")
    assert cleared.status_code == 200
    assert cleared.json()["ok"] is True

    snapshot_after = client.get("/api/midi/hub/traffic/snapshot?limit=10")
    assert snapshot_after.status_code == 200
    assert snapshot_after.json()["count"] == 0

    # status endpoint reports hub/router state and monitor capacity metadata.
    status = client.get("/api/midi/hub/status")
    assert status.status_code == 200
    status_payload = status.json()
    assert "traffic" in status_payload
    assert "route_count" in status_payload

    # lifecycle operations are exposed and safe when repeatedly called.
    started = client.post("/api/midi/hub/start")
    assert started.status_code == 200
    stopped = client.post("/api/midi/hub/stop")
    assert stopped.status_code == 200
    assert stopped.json()["running"] is False


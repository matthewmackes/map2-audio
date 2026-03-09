from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import midi_hub as midi_hub_routes
from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.router import MidiRouter
from app.services.midi_hub.ports import VirtualMidiPort
from app.services.midi_hub.preset_service import MidiHubPresetService
from app.services.midi_hub.traffic_monitor import MidiTrafficMonitor, MidiTrafficRecord


def _build_client(tmp_path, monkeypatch):
    hub = MidiHub(auto_discover_alsa=False)
    hub.register_port(VirtualMidiPort(port_id="src", name="Source", direction="input"), open_now=False)
    hub.register_port(VirtualMidiPort(port_id="dst", name="Destination", direction="duplex"), open_now=False)
    monitor = MidiTrafficMonitor(capacity=128, export_dir=tmp_path)
    router = MidiRouter(hub=hub, persist_path=tmp_path / "routes.json", traffic_monitor=monitor)
    preset_service = MidiHubPresetService(router=router, hub=hub, storage_path=tmp_path / "presets.json")

    monkeypatch.setattr(midi_hub_routes, "get_midi_hub", lambda: hub)
    monkeypatch.setattr(midi_hub_routes, "get_midi_router", lambda: router)
    monkeypatch.setattr(midi_hub_routes, "get_midi_traffic_monitor", lambda: monitor)
    monkeypatch.setattr(midi_hub_routes, "get_midi_hub_preset_service", lambda: preset_service)

    app = FastAPI()
    app.include_router(midi_hub_routes.router)
    return TestClient(app), hub, router, monitor, preset_service


def test_traffic_snapshot_stats_export_clear(tmp_path, monkeypatch):
    client, hub, router, monitor, _ = _build_client(tmp_path, monkeypatch)
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

    created = client.post(
        "/api/midi/hub/routes",
        json={
            "source_port": "src",
            "destination_ports": ["dst"],
            "enabled": True,
            "priority": 110,
            "route_type": "pass_through",
            "filter": {"message_types": ["note_on"], "channels": [1]},
            "transform_chain": [],
            "latency_compensation_enabled": False,
            "destination_latency_ms": {},
        },
    )
    assert created.status_code == 200
    route = created.json()["route"]
    route_id = route["route_id"]

    listed = client.get("/api/midi/hub/routes")
    assert listed.status_code == 200
    assert listed.json()["routes"]

    updated = client.put(
        f"/api/midi/hub/routes/{route_id}",
        json={
            "source_port": "src",
            "destination_ports": ["dst"],
            "enabled": False,
            "priority": 90,
            "route_type": "filter",
            "filter": {"message_types": ["control_change"], "channels": [1]},
            "transform_chain": [],
            "latency_compensation_enabled": False,
            "destination_latency_ms": {},
        },
    )
    assert updated.status_code == 200
    assert updated.json()["ok"] is True

    enabled = client.post(f"/api/midi/hub/routes/{route_id}/enable")
    assert enabled.status_code == 200
    assert enabled.json()["ok"] is True

    deleted = client.delete(f"/api/midi/hub/routes/{route_id}")
    assert deleted.status_code == 200
    assert deleted.json()["ok"] is True

    # lifecycle operations are exposed and safe when repeatedly called.
    started = client.post("/api/midi/hub/start")
    assert started.status_code == 200
    stopped = client.post("/api/midi/hub/stop")
    assert stopped.status_code == 200
    assert stopped.json()["running"] is False


def test_preset_routes_save_compare_slots_and_recall(tmp_path, monkeypatch):
    client, hub, router, _, preset_service = _build_client(tmp_path, monkeypatch)
    created_route = router.add_route(
        {
            "route_id": "route_a",
            "source_port": "src",
            "destination_ports": ["dst"],
            "enabled": True,
            "priority": 100,
        }
    )
    assert created_route["route_id"] == "route_a"

    save_first = client.post(
        "/api/midi/hub/presets",
        json={
            "preset_id": "preset_a",
            "name": "Preset A",
            "description": "first snapshot",
            "conditions": {"scene": "intro"},
        },
    )
    assert save_first.status_code == 200
    assert save_first.json()["ok"] is True

    router.add_route(
        {
            "route_id": "route_b",
            "source_port": "src",
            "destination_ports": ["dst"],
            "enabled": True,
            "priority": 120,
        }
    )

    save_second = client.post(
        "/api/midi/hub/presets",
        json={
            "preset_id": "preset_b",
            "name": "Preset B",
            "description": "second snapshot",
        },
    )
    assert save_second.status_code == 200

    listed = client.get("/api/midi/hub/presets")
    assert listed.status_code == 200
    assert listed.json()["presets"]

    compare = client.post(
        "/api/midi/hub/presets/compare",
        json={"left_preset_id": "preset_a", "right_preset_id": "preset_b"},
    )
    assert compare.status_code == 200
    diff = compare.json()["diff"]
    assert "route_b" in diff["routes"]["added"]

    set_default = client.put("/api/midi/hub/presets/default", json={"preset_id": "preset_b"})
    assert set_default.status_code == 200
    assert set_default.json()["default_preset_id"] == "preset_b"

    set_slot = client.put("/api/midi/hub/presets/slots/7", json={"target_id": "preset_a"})
    assert set_slot.status_code == 200
    assert set_slot.json()["target_id"] == "preset_a"

    set_chain = client.put("/api/midi/hub/presets/chains/songA", json={"preset_ids": ["preset_a", "preset_b"]})
    assert set_chain.status_code == 200
    assert set_chain.json()["preset_ids"] == ["preset_a", "preset_b"]

    set_chain_slot = client.put("/api/midi/hub/presets/slots/8", json={"target_id": "chain:songA"})
    assert set_chain_slot.status_code == 200

    slots = client.get("/api/midi/hub/presets/slots")
    assert slots.status_code == 200
    assert slots.json()["slots"]["7"] == "preset_a"
    assert slots.json()["slots"]["8"] == "chain:songA"

    run_chain = client.post(
        "/api/midi/hub/presets/chains/songA/run",
        json={"interval_ms": 100, "cycles": 1, "start_immediately": False},
    )
    assert run_chain.status_code == 200
    assert run_chain.json()["running"] is True

    stop_chain = client.post("/api/midi/hub/presets/chains/songA/stop")
    assert stop_chain.status_code == 200
    assert stop_chain.json()["running"] is False

    delete_slot = client.delete("/api/midi/hub/presets/slots/7")
    assert delete_slot.status_code == 200
    assert delete_slot.json()["ok"] is True

    recall_a = client.post("/api/midi/hub/presets/preset_a/recall")
    assert recall_a.status_code == 200
    assert recall_a.json()["ok"] is True

    # Preset recall replaces route table atomically.
    routes_after = router.list_routes()
    route_ids = {row["route_id"] for row in routes_after}
    assert "route_a" in route_ids
    assert "route_b" not in route_ids

    evaluate = client.post("/api/midi/hub/presets/context/evaluate", json={"context": {"scene": "intro"}})
    assert evaluate.status_code == 200
    assert "preset_a" in evaluate.json()["recalled_preset_ids"]

    export_resp = client.post("/api/midi/hub/presets/preset_a/export", json={"export_path": str(tmp_path / "exported.json")})
    assert export_resp.status_code == 200
    exported_path = export_resp.json()["path"]

    imported = client.post("/api/midi/hub/presets/import", json={"file_path": exported_path})
    assert imported.status_code == 200
    assert imported.json()["preset"]["preset_id"] == "preset_a"

    remove_preset = client.delete("/api/midi/hub/presets/preset_b")
    assert remove_preset.status_code == 200
    assert remove_preset.json()["ok"] is True

    assert preset_service.get_default_preset()["default_preset_id"] is None

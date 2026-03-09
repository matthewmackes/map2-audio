import time
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routes import midi_hub as midi_hub_routes
from app.services.midi_hub.clock_engine import MidiClockEngine
from app.services.midi_hub.device_registry import MidiDeviceRegistry
from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.macros import MidiMacroService
from app.services.midi_hub.midi2 import Midi2Manager
from app.services.midi_hub.network import MidiNetworkBridge
from app.services.midi_hub.recorder import MidiRecorder
from app.services.midi_hub.router import MidiRouter
from app.services.midi_hub.ports import MidiMessage, VirtualMidiPort
from app.services.midi_hub.preset_service import MidiHubPresetService
from app.services.midi_hub.scheduler import MidiMessageScheduler
from app.services.midi_hub.script_engine import MidiScriptEngine
from app.services.midi_hub.traffic_monitor import MidiTrafficMonitor, MidiTrafficRecord


def _build_client(tmp_path, monkeypatch):
    hub = MidiHub(auto_discover_alsa=False)
    hub.register_port(VirtualMidiPort(port_id="src", name="Source", direction="input"), open_now=False)
    hub.register_port(VirtualMidiPort(port_id="dst", name="Destination", direction="duplex"), open_now=False)
    monitor = MidiTrafficMonitor(capacity=128, export_dir=tmp_path)
    router = MidiRouter(hub=hub, persist_path=tmp_path / "routes.json", traffic_monitor=monitor)
    preset_service = MidiHubPresetService(router=router, hub=hub, storage_path=tmp_path / "presets.json")
    script_engine = MidiScriptEngine(
        hub=hub,
        router=router,
        scripts_path=tmp_path / "scripts.json",
        state_path=tmp_path / "script-state.json",
    )
    clock_engine = MidiClockEngine(hub=hub)
    network_bridge = MidiNetworkBridge(hub=hub)
    midi2_manager = Midi2Manager(enabled=False)
    registry = MidiDeviceRegistry(hub)
    macro_service = MidiMacroService(
        hub=hub,
        router=router,
        preset_service=preset_service,
        storage_path=tmp_path / "macros.json",
    )
    recorder = MidiRecorder(hub=hub, storage_dir=tmp_path / "recordings")
    scheduler = MidiMessageScheduler(hub=hub, storage_path=tmp_path / "scheduler.json")

    monkeypatch.setattr(midi_hub_routes, "get_midi_hub", lambda: hub)
    monkeypatch.setattr(midi_hub_routes, "get_midi_router", lambda: router)
    monkeypatch.setattr(midi_hub_routes, "get_midi_traffic_monitor", lambda: monitor)
    monkeypatch.setattr(midi_hub_routes, "get_midi_hub_preset_service", lambda: preset_service)
    monkeypatch.setattr(midi_hub_routes, "get_midi_script_engine", lambda: script_engine)
    monkeypatch.setattr(midi_hub_routes, "get_midi_clock_engine", lambda: clock_engine)
    monkeypatch.setattr(midi_hub_routes, "get_midi_network_bridge", lambda: network_bridge)
    monkeypatch.setattr(midi_hub_routes, "get_midi2_manager", lambda: midi2_manager)
    monkeypatch.setattr(midi_hub_routes, "get_midi_device_registry", lambda: registry)
    monkeypatch.setattr(midi_hub_routes, "get_midi_macro_service", lambda: macro_service)
    monkeypatch.setattr(midi_hub_routes, "get_midi_recorder", lambda: recorder)
    monkeypatch.setattr(midi_hub_routes, "get_midi_scheduler", lambda: scheduler)

    app = FastAPI()
    app.include_router(midi_hub_routes.router)
    return TestClient(app), hub, router, monitor, preset_service, script_engine, clock_engine, network_bridge, midi2_manager


def test_traffic_snapshot_stats_export_clear(tmp_path, monkeypatch):
    client, hub, router, monitor, _, _, _, _, _ = _build_client(tmp_path, monkeypatch)
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
    client, hub, router, _, preset_service, _, _, _, _ = _build_client(tmp_path, monkeypatch)
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


def test_script_routes_crud_run_console_and_toggle(tmp_path, monkeypatch):
    client, _, _, _, _, _, _, _, _ = _build_client(tmp_path, monkeypatch)

    examples = client.get("/api/midi/hub/scripts/examples")
    assert examples.status_code == 200
    assert examples.json()["count"] >= 1

    upsert = client.post(
        "/api/midi/hub/scripts",
        json={
            "script_id": "script_a",
            "name": "Script A",
            "enabled": True,
            "code": "def main(event):\n    log.info('ok')\n    state.set('last', event.get('tag', 'none'))\n",
        },
    )
    assert upsert.status_code == 200
    assert upsert.json()["script"]["script_id"] == "script_a"

    listed = client.get("/api/midi/hub/scripts")
    assert listed.status_code == 200
    assert listed.json()["count"] == 1

    fetched = client.get("/api/midi/hub/scripts/script_a")
    assert fetched.status_code == 200
    assert fetched.json()["ok"] is True

    run_resp = client.post("/api/midi/hub/scripts/script_a/run", json={"event": {"tag": "run"}})
    assert run_resp.status_code == 200
    assert run_resp.json()["ok"] is True, run_resp.json()

    trigger_resp = client.post("/api/midi/hub/scripts/script_a/trigger", json={"event": {"tag": "trigger"}})
    assert trigger_resp.status_code == 200
    assert trigger_resp.json()["ok"] is True

    console = client.get("/api/midi/hub/scripts/script_a/console?limit=50")
    assert console.status_code == 200
    assert console.json()["count"] >= 1

    disable = client.post("/api/midi/hub/scripts/script_a/disable")
    assert disable.status_code == 200
    assert disable.json()["script"]["enabled"] is False

    enable = client.post("/api/midi/hub/scripts/script_a/enable")
    assert enable.status_code == 200
    assert enable.json()["script"]["enabled"] is True

    stop = client.post("/api/midi/hub/scripts/script_a/stop")
    assert stop.status_code == 200
    assert "ok" in stop.json()

    delete = client.delete("/api/midi/hub/scripts/script_a")
    assert delete.status_code == 200
    assert delete.json()["ok"] is True


def test_clock_routes_config_tap_start_stop_and_continue(tmp_path, monkeypatch):
    client, _, _, _, _, _, _, _, _ = _build_client(tmp_path, monkeypatch)

    status = client.get("/api/midi/hub/clock")
    assert status.status_code == 200
    assert "bpm" in status.json()

    configure = client.put(
        "/api/midi/hub/clock",
        json={
            "bpm": 128.5,
            "source_mode": "internal",
            "output_ports": ["dst"],
            "divider": 1.0,
            "multiplier": 1.0,
            "offset_ms": 0.0,
        },
    )
    assert configure.status_code == 200
    assert abs(configure.json()["bpm"] - 128.5) < 0.001

    tap_one = client.post("/api/midi/hub/clock/tap")
    assert tap_one.status_code == 200
    tap_two = client.post("/api/midi/hub/clock/tap")
    assert tap_two.status_code == 200
    assert 20.0 <= tap_two.json()["bpm"] <= 300.0

    start = client.post("/api/midi/hub/clock/start")
    assert start.status_code == 200
    assert start.json()["running"] is True

    cont = client.post("/api/midi/hub/clock/continue")
    assert cont.status_code == 200
    assert cont.json()["running"] is True

    stop = client.post("/api/midi/hub/clock/stop")
    assert stop.status_code == 200
    assert stop.json()["running"] is False


def test_network_and_osc_routes(tmp_path, monkeypatch):
    client, _, _, _, _, _, _, _, _ = _build_client(tmp_path, monkeypatch)

    create_session = client.post(
        "/api/midi/hub/network/sessions",
        json={
            "session_id": "net1",
            "host": "127.0.0.1",
            "port": 56010,
            "mode": "send",
        },
    )
    assert create_session.status_code == 200
    assert create_session.json()["ok"] is True

    list_sessions = client.get("/api/midi/hub/network/sessions")
    assert list_sessions.status_code == 200
    assert list_sessions.json()["count"] == 1

    send_midi = client.post(
        "/api/midi/hub/network/sessions/net1/send",
        json={"message": [0x90, 64, 100]},
    )
    assert send_midi.status_code == 200
    assert "ok" in send_midi.json()

    set_mappings = client.put(
        "/api/midi/hub/network/osc/mappings",
        json={
            "mappings": [
                {
                    "address": "/map2/cc1",
                    "destination_port": "dst",
                    "message_type": "cc",
                    "channel": 1,
                    "cc": 1,
                }
            ]
        },
    )
    assert set_mappings.status_code == 200
    assert set_mappings.json()["count"] == 1

    get_mappings = client.get("/api/midi/hub/network/osc/mappings")
    assert get_mappings.status_code == 200
    assert get_mappings.json()["count"] == 1

    start_osc = client.post("/api/midi/hub/network/osc/server", json={"listen_port": 58020})
    assert start_osc.status_code == 200
    assert start_osc.json()["ok"] is True

    send_osc = client.post(
        "/api/midi/hub/network/osc/send",
        json={
            "host": "127.0.0.1",
            "port": 58020,
            "address": "/map2/cc1",
            "value": 0.5,
        },
    )
    assert send_osc.status_code == 200
    assert send_osc.json()["ok"] is True

    stop_osc = client.delete("/api/midi/hub/network/osc/server")
    assert stop_osc.status_code == 200
    assert stop_osc.json()["ok"] is True

    delete_session = client.delete("/api/midi/hub/network/sessions/net1")
    assert delete_session.status_code == 200
    assert delete_session.json()["ok"] is True


def test_midi2_routes_config_discovery_profiles_properties_and_translate(tmp_path, monkeypatch):
    client, _, _, _, _, _, _, _, _ = _build_client(tmp_path, monkeypatch)

    status = client.get("/api/midi/hub/midi2")
    assert status.status_code == 200
    assert status.json()["enabled"] is False

    configure = client.put("/api/midi/hub/midi2", json={"enabled": True, "default_protocol": "midi2"})
    assert configure.status_code == 200
    assert configure.json()["enabled"] is True
    assert configure.json()["default_protocol"] == "midi2"

    discover = client.post("/api/midi/hub/midi2/discover", json={"device_id": "dev-1"})
    assert discover.status_code == 200
    assert discover.json()["ok"] is True
    assert discover.json()["device"]["device_id"] == "dev-1"

    profile = client.put("/api/midi/hub/midi2/dev-1/profiles", json={"profile_id": "gm2", "enabled": True})
    assert profile.status_code == 200
    assert profile.json()["ok"] is True
    assert profile.json()["device"]["profiles"]["gm2"] is True

    set_prop = client.put(
        "/api/midi/hub/midi2/dev-1/properties",
        json={"key": "patch_name", "value": "Init"},
    )
    assert set_prop.status_code == 200
    assert set_prop.json()["ok"] is True

    get_prop = client.get("/api/midi/hub/midi2/dev-1/properties/patch_name")
    assert get_prop.status_code == 200
    assert get_prop.json()["value"] == "Init"

    to_ump = client.post("/api/midi/hub/midi2/translate/midi1-to-ump", json={"message": [0x90, 60, 100]})
    assert to_ump.status_code == 200
    assert len(to_ump.json()["words"]) == 1

    to_midi1 = client.post("/api/midi/hub/midi2/translate/ump-to-midi1", json={"words": to_ump.json()["words"]})
    assert to_midi1.status_code == 200
    assert to_midi1.json()["message"][:3] == [0x90, 60, 100]


def test_subp_innovation_routes_learn_macro_recorder_scheduler_mesh_and_shadow(tmp_path, monkeypatch):
    client, hub, router, _, _, _, _, _, _ = _build_client(tmp_path, monkeypatch)

    start = client.post("/api/midi/hub/start")
    assert start.status_code == 200

    learn = client.post(
        "/api/midi/hub/learn/suggestions",
        json={
            "parameter_id": "wah_filter_mix",
            "chain_context": {
                "active_plugins": ["wah", "delay"],
                "bypassed_plugins": ["chorus"],
                "split_targets": ["chain_A", "chain_B"],
            },
        },
    )
    assert learn.status_code == 200
    learn_payload = learn.json()
    assert learn_payload["ok"] is True
    assert learn_payload["suggestions"]
    assert learn_payload["plugin_context"]["auto_suspended"] is True
    assert len(learn_payload["split_suggestions"]) == 2

    macro_create = client.post(
        "/api/midi/hub/macros",
        json={
            "macro_id": "macro_a",
            "name": "Macro A",
            "trigger": {"message_type": "control_change", "cc": 11},
            "actions": [
                {
                    "target": "dst",
                    "action": "send_midi",
                    "delay_ms": 0,
                    "params": {"message": [0xB0, 11, 100]},
                }
            ],
            "enabled": True,
        },
    )
    assert macro_create.status_code == 200
    assert macro_create.json()["ok"] is True

    macros = client.get("/api/midi/hub/macros")
    assert macros.status_code == 200
    assert macros.json()["count"] == 1

    macro_trigger = client.post("/api/midi/hub/macros/macro_a/trigger", json={"payload": {"source": "test"}})
    assert macro_trigger.status_code == 200
    assert macro_trigger.json()["ok"] is True

    macro_match = client.post(
        "/api/midi/hub/macros/match",
        json={"payload": {"message_type": "control_change", "cc": 11}},
    )
    assert macro_match.status_code == 200
    assert "macro_a" in macro_match.json()["triggered_macro_ids"]

    recorder_start = client.post("/api/midi/hub/recorder/start", json={"session_id": "take1", "name": "Take 1"})
    assert recorder_start.status_code == 200
    hub.inject(
        MidiMessage(
            data=bytes([0x90, 60, 100]),
            timestamp_ns=time.time_ns(),
            source_port="src",
            destination_port="dst",
            metadata={"test": True},
        )
    )
    time.sleep(0.06)
    recorder_stop = client.post("/api/midi/hub/recorder/stop")
    assert recorder_stop.status_code == 200
    assert recorder_stop.json()["ok"] is True

    recorder_get = client.get("/api/midi/hub/recorder/sessions/take1?include_events=true")
    assert recorder_get.status_code == 200
    assert recorder_get.json()["session"]["event_count"] >= 1

    export_path = tmp_path / "take1.mid"
    recorder_export = client.post(
        "/api/midi/hub/recorder/sessions/take1/export",
        json={"export_path": str(export_path), "bpm": 120.0, "ticks_per_quarter": 480},
    )
    assert recorder_export.status_code == 200
    assert Path(recorder_export.json()["path"]).exists()

    playback = client.post(
        "/api/midi/hub/recorder/sessions/take1/playback",
        json={"destination_override": "dst", "loop": False, "speed": 1.0},
    )
    assert playback.status_code == 200
    stop_playback = client.post("/api/midi/hub/recorder/sessions/take1/stop")
    assert stop_playback.status_code == 200
    assert "ok" in stop_playback.json()

    scheduled = client.post(
        "/api/midi/hub/scheduler",
        json={
            "schedule_id": "sch1",
            "destination_port": "dst",
            "message": [0xC0, 10],
            "delay_ms": 0,
            "metadata": {"source": "test"},
        },
    )
    assert scheduled.status_code == 200
    assert scheduled.json()["ok"] is True

    scheduler_list = client.get("/api/midi/hub/scheduler")
    assert scheduler_list.status_code == 200
    assert scheduler_list.json()["count"] >= 1

    scheduler_update = client.put(
        "/api/midi/hub/scheduler/sch1",
        json={"delay_ms": 100, "message": [0xC0, 11], "metadata": {"updated": True}},
    )
    assert scheduler_update.status_code == 200
    assert scheduler_update.json()["entry"]["schedule_id"] == "sch1"

    scheduler_cancel = client.delete("/api/midi/hub/scheduler/sch1")
    assert scheduler_cancel.status_code == 200
    assert scheduler_cancel.json()["ok"] is True

    mesh_status = client.get("/api/midi/hub/network/mesh")
    assert mesh_status.status_code == 200
    assert mesh_status.json()["peer_count"] == 0

    mesh_peer = client.post(
        "/api/midi/hub/network/mesh/peers",
        json={"peer_id": "peer_a", "base_url": "http://127.0.0.1:9", "active": True},
    )
    assert mesh_peer.status_code == 200
    assert mesh_peer.json()["peer"]["peer_id"] == "peer_a"

    mesh_forwarding = client.put("/api/midi/hub/network/mesh/forwarding", json={"forwarding_enabled": True})
    assert mesh_forwarding.status_code == 200
    assert mesh_forwarding.json()["forwarding_enabled"] is True

    router.add_route(
        {
            "route_id": "mesh_route_a",
            "source_port": "src",
            "destination_ports": ["dst"],
            "enabled": True,
            "priority": 90,
        }
    )
    mesh_routes = client.post(
        "/api/midi/hub/network/mesh/routes",
        json={
            "source_instance": "local",
            "routes": router.list_routes(),
            "fanout": False,
        },
    )
    assert mesh_routes.status_code == 200
    assert mesh_routes.json()["route_count"] >= 1

    mesh_forward = client.post(
        "/api/midi/hub/network/mesh/forward",
        json={
            "source_instance": "peer_a",
            "source_port": "mesh:peer_a",
            "destination_port": "dst",
            "data_hex": "903c64",
            "metadata": {"mesh": True},
        },
    )
    assert mesh_forward.status_code == 200
    assert mesh_forward.json()["ok"] is True

    mesh_peer_delete = client.delete("/api/midi/hub/network/mesh/peers/peer_a")
    assert mesh_peer_delete.status_code == 200
    assert mesh_peer_delete.json()["ok"] is True

    shadow_seed = client.put(
        "/api/midi/hub/devices/usb_din_adapter:lab/shadow",
        json={
            "expected_state": {
                "connected": True,
                "responding": True,
                "health": "online",
                "latency_ms": 1.0,
            },
            "source": "test",
        },
    )
    assert shadow_seed.status_code == 200
    assert "drift_detected" in shadow_seed.json()

    shadow_read = client.get("/api/midi/hub/devices/shadow")
    assert shadow_read.status_code == 200
    assert "shadow_state" in shadow_read.json()

    shadow_clear = client.post("/api/midi/hub/devices/shadow/clear")
    assert shadow_clear.status_code == 200
    assert shadow_clear.json()["ok"] is True

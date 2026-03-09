from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from app import database as database_module
from app.routes import midi_hub as midi_hub_routes
from app.services.midi_hub.clock_engine import MidiClockEngine
from app.services.midi_hub.device_registry import MidiDeviceRegistry
from app.services.midi_hub.gateway import MidiGatewayManager
from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.macros import MidiMacroService
from app.services.midi_hub.midi2 import Midi2Manager
from app.services.midi_hub.network import MidiNetworkBridge
from app.services.midi_hub.preset_service import MidiHubPresetService
from app.services.midi_hub.recorder import MidiRecorder
from app.services.midi_hub.router import MidiRouter
from app.services.midi_hub.scheduler import MidiMessageScheduler
from app.services.midi_hub.script_engine import MidiScriptEngine
from app.services.midi_hub.traffic_monitor import MidiTrafficMonitor


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'midi-hub-routes.db'}")


@pytest.fixture
def client(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    hub = MidiHub(auto_discover_alsa=False, poll_interval_s=0.001)
    registry = MidiDeviceRegistry(hub)
    manager = MidiGatewayManager(hub=hub)
    router = MidiRouter(hub=hub, persist_path=tmp_path / "midi-routes.json")
    preset_service = MidiHubPresetService(
        router=router,
        registry=registry,
        gateway_manager=manager,
        hub=hub,
        storage_path=tmp_path / "midi-presets.json",
    )
    script_engine = MidiScriptEngine(
        hub=hub,
        router=router,
        scripts_path=tmp_path / "scripts.json",
        state_path=tmp_path / "scripts-state.json",
    )
    clock_engine = MidiClockEngine(hub=hub)
    network_bridge = MidiNetworkBridge(hub=hub)
    midi2_manager = Midi2Manager(enabled=False)
    macro_service = MidiMacroService(
        hub=hub,
        router=router,
        preset_service=preset_service,
        storage_path=tmp_path / "macros.json",
    )
    recorder = MidiRecorder(hub=hub, storage_dir=tmp_path / "recordings")
    scheduler = MidiMessageScheduler(hub=hub, storage_path=tmp_path / "scheduler.json")
    traffic_monitor = MidiTrafficMonitor(capacity=2048, export_dir=tmp_path / "traffic-exports")

    monkeypatch.setattr(midi_hub_routes, "get_midi_hub", lambda: hub)
    monkeypatch.setattr(midi_hub_routes, "get_midi_device_registry", lambda: registry)
    monkeypatch.setattr(midi_hub_routes, "get_midi_gateway_manager", lambda: manager)
    monkeypatch.setattr(midi_hub_routes, "get_midi_router", lambda: router)
    monkeypatch.setattr(midi_hub_routes, "get_midi_hub_preset_service", lambda: preset_service)
    monkeypatch.setattr(midi_hub_routes, "get_midi_script_engine", lambda: script_engine)
    monkeypatch.setattr(midi_hub_routes, "get_midi_clock_engine", lambda: clock_engine)
    monkeypatch.setattr(midi_hub_routes, "get_midi_network_bridge", lambda: network_bridge)
    monkeypatch.setattr(midi_hub_routes, "get_midi2_manager", lambda: midi2_manager)
    monkeypatch.setattr(midi_hub_routes, "get_midi_macro_service", lambda: macro_service)
    monkeypatch.setattr(midi_hub_routes, "get_midi_recorder", lambda: recorder)
    monkeypatch.setattr(midi_hub_routes, "get_midi_scheduler", lambda: scheduler)
    monkeypatch.setattr(midi_hub_routes, "get_midi_traffic_monitor", lambda: traffic_monitor)

    app = FastAPI()
    app.include_router(midi_hub_routes.router)
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client

    manager.stop_all()
    router.stop()
    hub.stop()


def test_hub_status_and_virtual_port_routes(client):
    start_resp = client.post("/api/midi/hub/start")
    assert start_resp.status_code == 200
    assert start_resp.json()["running"] is True

    create_resp = client.post(
        "/api/midi/hub/ports/virtual",
        json={"port_id": "virt1", "name": "Virtual 1", "direction": "duplex"},
    )
    assert create_resp.status_code == 200
    assert create_resp.json()["port"]["port_id"] == "virt1"

    list_resp = client.get("/api/midi/hub/ports")
    assert list_resp.status_code == 200
    assert list_resp.json()["count"] >= 1

    stop_resp = client.post("/api/midi/hub/stop")
    assert stop_resp.status_code == 200
    assert stop_resp.json()["running"] is False


def test_profile_crud_and_assignment_routes(client):
    profile_resp = client.post(
        "/api/midi/hub/profiles",
        json={
            "profile_id": "custom_foot",
            "name": "Custom Foot Controller",
            "match_patterns": ["foot ctrl"],
            "default_channel": 1,
            "supports_sysex": False,
            "usb_vid_pid": ["1234:abcd"],
            "metadata": {"vendor": "Custom"},
        },
    )
    assert profile_resp.status_code == 200
    assert profile_resp.json()["profile"]["profile_id"] == "custom_foot"

    create_port = client.post(
        "/api/midi/hub/ports/virtual",
        json={"port_id": "virt2", "name": "USB MIDI Cable", "direction": "duplex"},
    )
    assert create_port.status_code == 200

    assign_resp = client.put(
        "/api/midi/hub/devices/assign",
        json={"port_name": "USB MIDI Cable", "device_id": "lexicon_mpx1:main"},
    )
    assert assign_resp.status_code == 200
    assert assign_resp.json()["assignment"]["device_id"] == "lexicon_mpx1:main"

    refresh_resp = client.post("/api/midi/hub/devices/refresh")
    assert refresh_resp.status_code == 200
    payload = refresh_resp.json()
    assert payload["count"] == 1
    assert payload["devices"][0]["device_id"] == "lexicon_mpx1:main"

    clear_resp = client.delete("/api/midi/hub/devices/assign", params={"port_name": "USB MIDI Cable"})
    assert clear_resp.status_code == 200
    assert clear_resp.json()["ok"] is True

    register_resp = client.post(
        "/api/midi/hub/devices",
        json={"device_id": "custom_device:1", "port_name": "USB MIDI Cable"},
    )
    assert register_resp.status_code == 200

    update_resp = client.put(
        "/api/midi/hub/devices/custom_device:1",
        json={"port_name": "USB MIDI Cable"},
    )
    assert update_resp.status_code == 200

    delete_device = client.delete("/api/midi/hub/devices/custom_device:1")
    assert delete_device.status_code == 200

    delete_resp = client.delete("/api/midi/hub/profiles/custom_foot")
    assert delete_resp.status_code == 200
    assert delete_resp.json()["ok"] is True


def test_gateway_routes(client):
    create_port = client.post(
        "/api/midi/hub/ports/virtual",
        json={"port_id": "loop", "name": "Loopback", "direction": "duplex"},
    )
    assert create_port.status_code == 200

    create_gateway = client.post(
        "/api/midi/hub/gateways",
        json={
            "gateway_id": "gw_api",
            "in_port_id": "loop",
            "out_port_id": "loop",
            "auto_start": False,
        },
    )
    assert create_gateway.status_code == 200
    assert create_gateway.json()["gateway"]["gateway_id"] == "gw_api"

    list_resp = client.get("/api/midi/hub/gateways")
    assert list_resp.status_code == 200
    assert list_resp.json()["count"] == 1

    health_resp = client.get("/api/midi/hub/gateways/gw_api/health")
    assert health_resp.status_code == 200
    assert health_resp.json()["gateway_id"] == "gw_api"

    reconnect_resp = client.post("/api/midi/hub/gateways/gw_api/reconnect")
    assert reconnect_resp.status_code == 200
    assert reconnect_resp.json()["ok"] is True

    delete_resp = client.delete("/api/midi/hub/gateways/gw_api")
    assert delete_resp.status_code == 200
    assert delete_resp.json()["ok"] is True


def test_router_routes_api(client):
    create_src = client.post(
        "/api/midi/hub/ports/virtual",
        json={"port_id": "src", "name": "Source", "direction": "duplex"},
    )
    create_dst = client.post(
        "/api/midi/hub/ports/virtual",
        json={"port_id": "dst", "name": "Dest", "direction": "duplex"},
    )
    assert create_src.status_code == 200
    assert create_dst.status_code == 200

    create_route = client.post(
        "/api/midi/hub/routes",
        json={
            "source_port": "src",
            "destination_ports": ["dst"],
            "enabled": True,
            "priority": 100,
            "route_type": "pass_through",
            "filter": {"message_types": ["note_on"], "channels": [1]},
            "transform_chain": [],
        },
    )
    assert create_route.status_code == 200
    route_id = create_route.json()["route"]["route_id"]

    list_routes = client.get("/api/midi/hub/routes")
    assert list_routes.status_code == 200
    assert list_routes.json()["count"] == 1

    set_transforms = client.put(
        f"/api/midi/hub/routes/{route_id}/transforms",
        json={"transform_chain": [{"type": "channel_remap", "channel": 2}]},
    )
    assert set_transforms.status_code == 200

    disable_route = client.post(f"/api/midi/hub/routes/{route_id}/disable")
    assert disable_route.status_code == 200
    assert disable_route.json()["route"]["enabled"] is False

    topology = client.get("/api/midi/hub/topology")
    assert topology.status_code == 200
    assert topology.json()["link_count"] == 1

    transform_types = client.get("/api/midi/hub/transforms/types")
    assert transform_types.status_code == 200
    assert transform_types.json()["count"] >= 1

    delete_route = client.delete(f"/api/midi/hub/routes/{route_id}")
    assert delete_route.status_code == 200
    assert delete_route.json()["ok"] is True


def test_preset_routes(client):
    client.post(
        "/api/midi/hub/ports/virtual",
        json={"port_id": "src", "name": "Source", "direction": "duplex"},
    )
    client.post(
        "/api/midi/hub/ports/virtual",
        json={"port_id": "dst", "name": "Dest", "direction": "duplex"},
    )
    route_resp = client.post(
        "/api/midi/hub/routes",
        json={
            "source_port": "src",
            "destination_ports": ["dst"],
            "enabled": True,
            "priority": 100,
            "route_type": "pass_through",
            "filter": {"message_types": ["note_on"], "channels": [1]},
            "transform_chain": [],
        },
    )
    assert route_resp.status_code == 200

    save_resp = client.post(
        "/api/midi/hub/presets",
        json={"preset_id": "p1", "name": "Preset 1", "description": "desc"},
    )
    assert save_resp.status_code == 200
    assert save_resp.json()["preset"]["preset_id"] == "p1"

    list_resp = client.get("/api/midi/hub/presets")
    assert list_resp.status_code == 200
    assert list_resp.json()["count"] == 1

    recall_resp = client.post("/api/midi/hub/presets/p1/recall")
    assert recall_resp.status_code == 200
    assert recall_resp.json()["preset"]["preset_id"] == "p1"

    delete_resp = client.delete("/api/midi/hub/presets/p1")
    assert delete_resp.status_code == 200
    assert delete_resp.json()["ok"] is True


def test_traffic_script_clock_network_midi2_macro_routes(client, tmp_path):
    client.post(
        "/api/midi/hub/ports/virtual",
        json={"port_id": "srcx", "name": "SourceX", "direction": "duplex"},
    )
    client.post(
        "/api/midi/hub/ports/virtual",
        json={"port_id": "dstx", "name": "DestX", "direction": "duplex"},
    )
    route_resp = client.post(
        "/api/midi/hub/routes",
        json={
            "source_port": "srcx",
            "destination_ports": ["dstx"],
            "enabled": True,
            "priority": 100,
            "route_type": "pass_through",
            "filter": {"message_types": ["control_change"], "channels": [1]},
            "transform_chain": [{"type": "value_scale", "scale": 0.5}],
        },
    )
    assert route_resp.status_code == 200

    # Traffic monitor APIs should be present even with empty capture.
    snap = client.get("/api/midi/hub/traffic/snapshot")
    assert snap.status_code == 200
    stats = client.get("/api/midi/hub/traffic/stats")
    assert stats.status_code == 200
    export = client.post("/api/midi/hub/traffic/export", json={"format": "json", "limit": 10})
    assert export.status_code == 200
    assert export.json()["ok"] is True
    clear = client.post("/api/midi/hub/traffic/clear")
    assert clear.status_code == 200

    # Script CRUD + trigger surface.
    upsert_script = client.post(
        "/api/midi/hub/scripts",
        json={
            "script_id": "s1",
            "name": "Test Script",
            "code": "def main(event):\n    log.info('ran')\n",
            "enabled": True,
        },
    )
    assert upsert_script.status_code == 200
    run_script = client.post("/api/midi/hub/scripts/s1/run", json={"event": {"cc": 7}})
    assert run_script.status_code == 200
    console = client.get("/api/midi/hub/scripts/s1/console")
    assert console.status_code == 200
    disable_script = client.post("/api/midi/hub/scripts/s1/disable")
    assert disable_script.status_code == 200
    delete_script = client.delete("/api/midi/hub/scripts/s1")
    assert delete_script.status_code == 200

    # Clock engine.
    get_clock = client.get("/api/midi/hub/clock")
    assert get_clock.status_code == 200
    set_clock = client.put(
        "/api/midi/hub/clock",
        json={"bpm": 128.5, "output_ports": ["dstx"], "divider": 1.0, "multiplier": 1.0},
    )
    assert set_clock.status_code == 200
    tap_clock = client.post("/api/midi/hub/clock/tap")
    assert tap_clock.status_code == 200
    start_clock = client.post("/api/midi/hub/clock/start")
    assert start_clock.status_code == 200
    stop_clock = client.post("/api/midi/hub/clock/stop")
    assert stop_clock.status_code == 200

    # Network + OSC endpoints.
    create_session = client.post(
        "/api/midi/hub/network/sessions",
        json={"session_id": "n1", "host": "127.0.0.1", "port": 56000, "mode": "send"},
    )
    assert create_session.status_code == 200
    list_sessions = client.get("/api/midi/hub/network/sessions")
    assert list_sessions.status_code == 200
    send_network = client.post(
        "/api/midi/hub/network/sessions/n1/send",
        json={"message": [0x90, 60, 100]},
    )
    assert send_network.status_code == 200
    set_osc = client.put(
        "/api/midi/hub/network/osc/mappings",
        json={"mappings": [{"address": "/cc1", "destination_port": "dstx", "message_type": "cc", "cc": 1}]},
    )
    assert set_osc.status_code == 200
    start_osc = client.post("/api/midi/hub/network/osc/server", json={"listen_port": 58000})
    assert start_osc.status_code == 200
    stop_osc = client.delete("/api/midi/hub/network/osc/server")
    assert stop_osc.status_code == 200
    delete_session = client.delete("/api/midi/hub/network/sessions/n1")
    assert delete_session.status_code == 200

    # MIDI 2.0 readiness.
    midi2_status = client.get("/api/midi/hub/midi2")
    assert midi2_status.status_code == 200
    midi2_cfg = client.put("/api/midi/hub/midi2", json={"enabled": True, "default_protocol": "midi2"})
    assert midi2_cfg.status_code == 200
    midi2_discover = client.post("/api/midi/hub/midi2/discover", json={"device_id": "dev-1"})
    assert midi2_discover.status_code == 200
    midi2_profile = client.put("/api/midi/hub/midi2/dev-1/profiles", json={"profile_id": "gm2", "enabled": True})
    assert midi2_profile.status_code == 200
    midi2_prop = client.put("/api/midi/hub/midi2/dev-1/properties", json={"key": "patch_name", "value": "Init"})
    assert midi2_prop.status_code == 200
    midi2_get_prop = client.get("/api/midi/hub/midi2/dev-1/properties/patch_name")
    assert midi2_get_prop.status_code == 200

    # Macro endpoints.
    upsert_macro = client.post(
        "/api/midi/hub/macros",
        json={
            "macro_id": "m1",
            "name": "Enable Route",
            "trigger": {"message_type": "program_change"},
            "actions": [{"target": route_resp.json()["route"]["route_id"], "action": "enable_route"}],
            "enabled": True,
        },
    )
    assert upsert_macro.status_code == 200
    list_macros = client.get("/api/midi/hub/macros")
    assert list_macros.status_code == 200
    trigger_macro = client.post("/api/midi/hub/macros/m1/trigger", json={"payload": {"message_type": "program_change"}})
    assert trigger_macro.status_code == 200
    delete_macro = client.delete("/api/midi/hub/macros/m1")
    assert delete_macro.status_code == 200

    # Recorder endpoints.
    rec_start = client.post(
        "/api/midi/hub/recorder/sessions/start",
        json={"session_id": "take1", "name": "Take 1"},
    )
    assert rec_start.status_code == 200
    rec_stop = client.post("/api/midi/hub/recorder/sessions/stop")
    assert rec_stop.status_code == 200
    rec_list = client.get("/api/midi/hub/recorder/sessions")
    assert rec_list.status_code == 200
    rec_get = client.get("/api/midi/hub/recorder/sessions/take1")
    assert rec_get.status_code == 200
    rec_delete = client.delete("/api/midi/hub/recorder/sessions/take1")
    assert rec_delete.status_code == 200

    # Scheduler endpoints.
    sched_create = client.post(
        "/api/midi/hub/scheduler",
        json={
            "schedule_id": "job1",
            "destination_port": "dstx",
            "message": [0xB0, 7, 100],
            "delay_ms": 5,
            "metadata": {"source": "test"},
        },
    )
    assert sched_create.status_code == 200
    sched_list = client.get("/api/midi/hub/scheduler")
    assert sched_list.status_code == 200
    sched_get = client.get("/api/midi/hub/scheduler/job1")
    assert sched_get.status_code == 200
    sched_update = client.put(
        "/api/midi/hub/scheduler/job1",
        json={"delay_ms": 1, "message": [0xB0, 7, 64]},
    )
    assert sched_update.status_code == 200
    sched_cancel = client.delete("/api/midi/hub/scheduler/job1")
    assert sched_cancel.status_code == 200
    sched_clear = client.delete("/api/midi/hub/scheduler")
    assert sched_clear.status_code == 200


def test_preset_compare_import_export_and_default(client, tmp_path):
    client.post(
        "/api/midi/hub/ports/virtual",
        json={"port_id": "cmp-src", "name": "Compare Source", "direction": "duplex"},
    )
    client.post(
        "/api/midi/hub/ports/virtual",
        json={"port_id": "cmp-dst", "name": "Compare Dest", "direction": "duplex"},
    )
    create_route = client.post(
        "/api/midi/hub/routes",
        json={
            "source_port": "cmp-src",
            "destination_ports": ["cmp-dst"],
            "filter": {"message_types": ["note_on"], "channels": [1]},
            "transform_chain": [],
        },
    )
    assert create_route.status_code == 200
    save_a = client.post("/api/midi/hub/presets", json={"preset_id": "pa", "name": "Preset A"})
    assert save_a.status_code == 200

    client.delete(f"/api/midi/hub/routes/{create_route.json()['route']['route_id']}")
    save_b = client.post("/api/midi/hub/presets", json={"preset_id": "pb", "name": "Preset B"})
    assert save_b.status_code == 200

    compare = client.post("/api/midi/hub/presets/compare", json={"left_preset_id": "pa", "right_preset_id": "pb"})
    assert compare.status_code == 200
    assert "routes" in compare.json()["diff"]

    export_path = tmp_path / "preset-export.json"
    export = client.post("/api/midi/hub/presets/pa/export", json={"export_path": str(export_path)})
    assert export.status_code == 200
    assert export_path.exists()

    imported = client.post("/api/midi/hub/presets/import", json={"file_path": str(export_path)})
    assert imported.status_code == 200

    set_default = client.put("/api/midi/hub/presets/default", params={"preset_id": "pa"})
    assert set_default.status_code == 200
    get_default = client.get("/api/midi/hub/presets/default")
    assert get_default.status_code == 200
    recall_default = client.post("/api/midi/hub/presets/default/activate")
    assert recall_default.status_code == 200

    set_chain = client.put("/api/midi/hub/presets/chains", json={"chain_id": "show", "preset_ids": ["pa", "pb"]})
    assert set_chain.status_code == 200
    list_chains = client.get("/api/midi/hub/presets/chains")
    assert list_chains.status_code == 200
    recall_step = client.post("/api/midi/hub/presets/chains/show/recall", params={"step": 1})
    assert recall_step.status_code == 200

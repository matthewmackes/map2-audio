from __future__ import annotations

from pathlib import Path

import pytest

from app import database as database_module
from app.routes import midi_hub as midi_hub_routes
from app.services.midi_hub.clock_engine import MidiClockEngine
from app.services.midi_hub.device_registry import MidiDeviceRegistry
from app.services.midi_hub.event_list_service import MidiHubEventListService
from app.services.midi_hub.gateway import MidiGatewayManager
from app.services.midi_hub.hub import MidiHub
from app.services.midi_hub.macros import MidiMacroService
from app.services.midi_hub.midi2 import Midi2Manager
from app.services.midi_hub.network import MidiNetworkBridge
from app.services.midi_hub.ports import VirtualMidiPort
from app.services.midi_hub.preset_service import MidiHubPresetService
from app.services.midi_hub.recorder import MidiRecorder
from app.services.midi_hub.router import MidiRouter
from app.services.midi_hub.scheduler import MidiMessageScheduler
from app.services.midi_hub.script_engine import MidiScriptEngine
from app.services.midi_hub.string_interface import StringInterfaceService
from app.services.midi_hub.tesira_client import TesiraClient
from app.services.midi_hub.traffic_monitor import MidiTrafficMonitor
from app.services.midi_hub.virtual_gpio import VirtualGpioService


def _init_temp_db(tmp_path: Path) -> None:
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'midi-hub-routes.db'}")


def _register_virtual_port(hub: MidiHub, port_id: str, name: str) -> None:
    hub.register_port(VirtualMidiPort(port_id=port_id, name=name, direction="duplex"))


@pytest.fixture
def route_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
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
    event_list_service = MidiHubEventListService(
        hub=hub,
        storage_path=tmp_path / "event-lists.sqlite3",
        macro_service=macro_service,
    )
    tesira_client = TesiraClient()
    virtual_gpio = VirtualGpioService()
    string_interface = StringInterfaceService()

    monkeypatch.setattr(midi_hub_routes, "get_midi_hub", lambda: hub)
    monkeypatch.setattr(midi_hub_routes, "get_midi_device_registry", lambda: registry)
    monkeypatch.setattr(midi_hub_routes, "get_midi_gateway_manager", lambda: manager)
    monkeypatch.setattr(midi_hub_routes, "get_midi_router", lambda: router)
    monkeypatch.setattr(midi_hub_routes, "get_midi_hub_preset_service", lambda: preset_service)
    monkeypatch.setattr(midi_hub_routes, "get_midi_hub_event_list_service", lambda: event_list_service)
    monkeypatch.setattr(midi_hub_routes, "get_midi_script_engine", lambda: script_engine)
    monkeypatch.setattr(midi_hub_routes, "get_midi_clock_engine", lambda: clock_engine)
    monkeypatch.setattr(midi_hub_routes, "get_midi_network_bridge", lambda: network_bridge)
    monkeypatch.setattr(midi_hub_routes, "get_midi2_manager", lambda: midi2_manager)
    monkeypatch.setattr(midi_hub_routes, "get_midi_macro_service", lambda: macro_service)
    monkeypatch.setattr(midi_hub_routes, "get_midi_recorder", lambda: recorder)
    monkeypatch.setattr(midi_hub_routes, "get_midi_scheduler", lambda: scheduler)
    monkeypatch.setattr(midi_hub_routes, "get_midi_traffic_monitor", lambda: traffic_monitor)
    monkeypatch.setattr(midi_hub_routes, "get_tesira_client", lambda: tesira_client)
    monkeypatch.setattr(midi_hub_routes, "get_virtual_gpio_service", lambda: virtual_gpio)
    monkeypatch.setattr(midi_hub_routes, "get_string_interface_service", lambda: string_interface)

    yield {
        "hub": hub,
        "router": router,
    }

    manager.stop_all()
    router.stop()
    hub.stop()


@pytest.mark.asyncio
async def test_hub_status_route(route_env):
    hub = route_env["hub"]
    _register_virtual_port(hub, "virt1", "Virtual 1")

    status = await midi_hub_routes.get_hub_status()
    assert status["port_count"] >= 1
    assert status["route_count"] == 0


@pytest.mark.asyncio
async def test_router_routes_api(route_env):
    hub = route_env["hub"]
    _register_virtual_port(hub, "src", "Source")
    _register_virtual_port(hub, "dst", "Dest")

    created = await midi_hub_routes.create_route(
        midi_hub_routes.RouteRequest(
            source_port="src",
            destination_ports=["dst"],
            enabled=True,
            priority=100,
            route_type="pass_through",
            filter=midi_hub_routes.RouteFilterRequest(message_types=["note_on"], channels=[1]),
            transform_chain=[],
        )
    )
    route_id = created["route"]["route_id"]

    listed = await midi_hub_routes.list_routes()
    assert len(listed["routes"]) == 1

    updated = await midi_hub_routes.update_route(
        route_id,
        midi_hub_routes.RouteRequest(
            route_id=route_id,
            source_port="src",
            destination_ports=["dst"],
            enabled=True,
            priority=100,
            route_type="pass_through",
            filter=midi_hub_routes.RouteFilterRequest(message_types=["note_on"], channels=[1]),
            transform_chain=[{"type": "channel_remap", "channel": 2}],
        ),
    )
    assert updated["ok"] is True

    disabled = await midi_hub_routes.disable_route(route_id)
    assert disabled["route"]["enabled"] is False

    topology = await midi_hub_routes.get_topology()
    assert topology["link_count"] == 1

    transform_types = await midi_hub_routes.get_transform_types()
    assert len(transform_types["types"]) >= 1

    deleted = await midi_hub_routes.delete_route(route_id)
    assert deleted["ok"] is True


@pytest.mark.asyncio
async def test_preset_routes(route_env):
    hub = route_env["hub"]
    _register_virtual_port(hub, "src", "Source")
    _register_virtual_port(hub, "dst", "Dest")

    await midi_hub_routes.create_route(
        midi_hub_routes.RouteRequest(
            source_port="src",
            destination_ports=["dst"],
            enabled=True,
            priority=100,
            route_type="pass_through",
            filter=midi_hub_routes.RouteFilterRequest(message_types=["note_on"], channels=[1]),
            transform_chain=[],
        )
    )

    saved = await midi_hub_routes.save_preset(
        midi_hub_routes.UpsertPresetRequest(preset_id="p1", name="Preset 1", description="desc")
    )
    assert saved["preset"]["preset_id"] == "p1"

    listed = await midi_hub_routes.list_presets()
    assert len(listed["presets"]) == 1

    recalled = await midi_hub_routes.recall_preset("p1")
    assert recalled["preset"]["preset_id"] == "p1"

    deleted = await midi_hub_routes.delete_preset("p1")
    assert deleted["ok"] is True


@pytest.mark.asyncio
async def test_traffic_script_clock_network_midi2_macro_recorder_scheduler_routes(route_env):
    hub = route_env["hub"]
    _register_virtual_port(hub, "srcx", "SourceX")
    _register_virtual_port(hub, "dstx", "DestX")

    route = await midi_hub_routes.create_route(
        midi_hub_routes.RouteRequest(
            source_port="srcx",
            destination_ports=["dstx"],
            enabled=True,
            priority=100,
            route_type="pass_through",
            filter=midi_hub_routes.RouteFilterRequest(message_types=["control_change"], channels=[1]),
            transform_chain=[{"type": "value_scale", "scale": 0.5}],
        )
    )
    route_id = route["route"]["route_id"]

    assert "captured_total" in await midi_hub_routes.get_traffic_snapshot(limit=500)
    assert "count" in await midi_hub_routes.get_traffic_stats()
    assert (await midi_hub_routes.export_traffic(midi_hub_routes.TrafficExportRequest(format="json", limit=10)))["ok"] is True
    assert (await midi_hub_routes.clear_traffic())["ok"] is True

    assert (
        await midi_hub_routes.upsert_script(
            midi_hub_routes.ScriptUpsertRequest(
                script_id="s1",
                name="Test Script",
                code="def main(event):\n    log.info('ran')\n",
                enabled=True,
            )
        )
    )["ok"] is True
    assert (await midi_hub_routes.run_script("s1", midi_hub_routes.ScriptRunRequest(event={"cc": 7})))["ok"] is True
    assert "lines" in await midi_hub_routes.get_script_console("s1", limit=200)
    assert (await midi_hub_routes.disable_script("s1"))["ok"] is True
    assert (await midi_hub_routes.delete_script("s1"))["ok"] is True

    assert "running" in await midi_hub_routes.get_clock_status()
    assert (
        await midi_hub_routes.configure_clock(
            midi_hub_routes.ClockConfigRequest(bpm=128.5, output_ports=["dstx"], divider=1.0, multiplier=1.0)
        )
    )["bpm"] == 128.5
    assert "bpm" in await midi_hub_routes.tap_clock()
    assert (await midi_hub_routes.start_clock())["running"] is True
    assert (await midi_hub_routes.stop_clock())["running"] is False

    assert (
        await midi_hub_routes.create_network_session(
            midi_hub_routes.NetworkSessionRequest(session_id="n1", host="127.0.0.1", port=56000, mode="send")
        )
    )["ok"] is True
    assert (await midi_hub_routes.list_network_sessions())["count"] == 1
    assert (
        await midi_hub_routes.send_network_midi("n1", midi_hub_routes.NetworkSendRequest(message=[0x90, 60, 100]))
    )["ok"] is True
    osc_mappings = await midi_hub_routes.set_osc_mappings(
        midi_hub_routes.OscMappingsRequest(
            mappings=[{"address": "/cc1", "destination_port": "dstx", "message_type": "cc", "cc": 1}]
        )
    )
    assert osc_mappings["count"] == 1
    osc_server = await midi_hub_routes.start_osc_server(midi_hub_routes.OscServerRequest(listen_port=58000))
    assert "listen_port" in osc_server
    assert "entries" in await midi_hub_routes.get_osc_namespace()
    assert (await midi_hub_routes.stop_osc_server())["ok"] is True
    assert (await midi_hub_routes.delete_network_session("n1"))["ok"] is True

    assert "enabled" in await midi_hub_routes.get_midi2_status()
    assert (
        await midi_hub_routes.configure_midi2(midi_hub_routes.Midi2ConfigRequest(enabled=True, default_protocol="midi2"))
    )["default_protocol"] == "midi2"
    assert (
        await midi_hub_routes.discover_midi2_device(midi_hub_routes.Midi2DiscoverRequest(device_id="dev-1"))
    )["device"]["device_id"] == "dev-1"
    assert (
        await midi_hub_routes.set_midi2_profile("dev-1", midi_hub_routes.Midi2ProfileRequest(profile_id="gm2", enabled=True))
    )["ok"] is True
    assert (
        await midi_hub_routes.set_midi2_property("dev-1", midi_hub_routes.Midi2PropertyRequest(key="patch_name", value="Init"))
    )["ok"] is True
    assert (
        await midi_hub_routes.get_midi2_property("dev-1", "patch_name")
    )["value"] == "Init"

    assert (
        await midi_hub_routes.upsert_macro(
            midi_hub_routes.MacroUpsertRequest(
                macro_id="m1",
                name="Enable Route",
                trigger={"message_type": "program_change"},
                actions=[{"target": route_id, "action": "enable_route"}],
                enabled=True,
            )
        )
    )["ok"] is True
    assert (await midi_hub_routes.list_macros())["count"] == 1
    assert (
        await midi_hub_routes.trigger_macro("m1", midi_hub_routes.MacroTriggerRequest(payload={"message_type": "program_change"}))
    )["ok"] is True
    assert (await midi_hub_routes.delete_macro("m1"))["ok"] is True

    assert (
        await midi_hub_routes.start_recording(
            midi_hub_routes.RecorderStartRequest(session_id="take1", name="Take 1")
        )
    )["ok"] is True
    assert (await midi_hub_routes.stop_recording())["ok"] is True
    assert (await midi_hub_routes.list_recording_sessions())["count"] == 1
    assert (await midi_hub_routes.get_recording_session("take1", include_events=False))["ok"] is True
    assert (await midi_hub_routes.delete_recording_session("take1"))["ok"] is True

    assert (
        await midi_hub_routes.create_scheduler_entry(
            midi_hub_routes.SchedulerCreateRequest(
                schedule_id="job1",
                destination_port="dstx",
                message=[0xB0, 7, 100],
                delay_ms=5,
                metadata={"source": "test"},
            )
        )
    )["ok"] is True
    assert (await midi_hub_routes.list_scheduler_entries(include_finished=True))["count"] == 1
    assert (await midi_hub_routes.get_scheduler_entry("job1"))["ok"] is True
    assert (
        await midi_hub_routes.update_scheduler_entry(
            "job1",
            midi_hub_routes.SchedulerUpdateRequest(delay_ms=1, message=[0xB0, 7, 64]),
        )
    )["ok"] is True
    assert (await midi_hub_routes.cancel_scheduler_entry("job1"))["ok"] is True
    assert (await midi_hub_routes.clear_finished_scheduler_entries())["ok"] is True


@pytest.mark.asyncio
async def test_lab_and_preset_advanced_routes(route_env, tmp_path: Path):
    hub = route_env["hub"]
    _register_virtual_port(hub, "cmp-src", "Compare Source")
    _register_virtual_port(hub, "cmp-dst", "Compare Dest")

    route = await midi_hub_routes.create_route(
        midi_hub_routes.RouteRequest(
            source_port="cmp-src",
            destination_ports=["cmp-dst"],
            filter=midi_hub_routes.RouteFilterRequest(message_types=["note_on"], channels=[1]),
            transform_chain=[],
        )
    )
    route_id = route["route"]["route_id"]
    assert (await midi_hub_routes.save_preset(midi_hub_routes.UpsertPresetRequest(preset_id="pa", name="Preset A")))["ok"] is True
    assert (await midi_hub_routes.delete_route(route_id))["ok"] is True
    assert (await midi_hub_routes.save_preset(midi_hub_routes.UpsertPresetRequest(preset_id="pb", name="Preset B")))["ok"] is True

    compare = await midi_hub_routes.compare_presets(
        midi_hub_routes.PresetCompareRequest(left_preset_id="pa", right_preset_id="pb")
    )
    assert "routes" in compare["diff"]

    export_path = tmp_path / "preset-export.json"
    assert (
        await midi_hub_routes.export_preset("pa", midi_hub_routes.PresetExportRequest(export_path=str(export_path)))
    )["ok"] is True
    assert export_path.exists()
    assert (
        await midi_hub_routes.import_preset(midi_hub_routes.PresetImportRequest(file_path=str(export_path)))
    )["ok"] is True

    assert (
        await midi_hub_routes.set_default_preset(midi_hub_routes.DefaultPresetRequest(preset_id="pa"))
    )["ok"] is True
    assert (await midi_hub_routes.get_default_preset())["default_preset_id"] == "pa"
    assert (await midi_hub_routes.recall_default_preset())["preset"]["preset_id"] == "pa"

    assert (
        await midi_hub_routes.set_preset_chain("show", midi_hub_routes.PresetChainRequest(preset_ids=["pa", "pb"]))
    )["ok"] is True
    assert "show" in (await midi_hub_routes.get_preset_chains())["chains"]
    assert (await midi_hub_routes.recall_preset_chain_step("show", 1))["preset"]["preset_id"] == "pb"

    assert "connected" in await midi_hub_routes.get_tesira_status()
    assert "inputs" in await midi_hub_routes.get_virtual_gpio()
    assert "enabled" in await midi_hub_routes.get_string_interface_status()

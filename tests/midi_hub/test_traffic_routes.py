from __future__ import annotations

import time
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
from app.services.midi_hub.ports import MidiMessage, VirtualMidiPort
from app.services.midi_hub.preset_service import MidiHubPresetService
from app.services.midi_hub.recorder import MidiRecorder
from app.services.midi_hub.router import MidiRouter
from app.services.midi_hub.scheduler import MidiMessageScheduler
from app.services.midi_hub.script_engine import MidiScriptEngine
from app.services.midi_hub.string_interface import StringInterfaceService
from app.services.midi_hub.tesira_client import TesiraClient
from app.services.midi_hub.traffic_monitor import MidiTrafficMonitor, MidiTrafficRecord
from app.services.midi_hub.virtual_gpio import VirtualGpioService


def _init_temp_db(tmp_path: Path) -> None:
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'midi-hub-traffic.db'}")


def _register_virtual_port(hub: MidiHub, port_id: str, name: str) -> None:
    hub.register_port(VirtualMidiPort(port_id=port_id, name=name, direction="duplex"))


@pytest.fixture
def route_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    _init_temp_db(tmp_path)
    hub = MidiHub(auto_discover_alsa=False)
    _register_virtual_port(hub, "src", "Source")
    _register_virtual_port(hub, "dst", "Destination")
    monitor = MidiTrafficMonitor(capacity=128, export_dir=tmp_path)
    router = MidiRouter(hub=hub, persist_path=tmp_path / "routes.json", traffic_monitor=monitor)
    manager = MidiGatewayManager(hub=hub)
    preset_service = MidiHubPresetService(
        router=router,
        registry=MidiDeviceRegistry(hub),
        gateway_manager=manager,
        hub=hub,
        storage_path=tmp_path / "presets.json",
    )
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
    event_list_service = MidiHubEventListService(
        hub=hub,
        storage_path=tmp_path / "event-lists.sqlite3",
        macro_service=macro_service,
    )
    tesira_client = TesiraClient()
    virtual_gpio = VirtualGpioService()
    string_interface = StringInterfaceService()

    monkeypatch.setattr(midi_hub_routes, "get_midi_hub", lambda: hub)
    monkeypatch.setattr(midi_hub_routes, "get_midi_router", lambda: router)
    monkeypatch.setattr(midi_hub_routes, "get_midi_traffic_monitor", lambda: monitor)
    monkeypatch.setattr(midi_hub_routes, "get_midi_hub_preset_service", lambda: preset_service)
    monkeypatch.setattr(midi_hub_routes, "get_midi_hub_event_list_service", lambda: event_list_service)
    monkeypatch.setattr(midi_hub_routes, "get_midi_script_engine", lambda: script_engine)
    monkeypatch.setattr(midi_hub_routes, "get_midi_clock_engine", lambda: clock_engine)
    monkeypatch.setattr(midi_hub_routes, "get_midi_network_bridge", lambda: network_bridge)
    monkeypatch.setattr(midi_hub_routes, "get_midi2_manager", lambda: midi2_manager)
    monkeypatch.setattr(midi_hub_routes, "get_midi_device_registry", lambda: registry)
    monkeypatch.setattr(midi_hub_routes, "get_midi_macro_service", lambda: macro_service)
    monkeypatch.setattr(midi_hub_routes, "get_midi_recorder", lambda: recorder)
    monkeypatch.setattr(midi_hub_routes, "get_midi_scheduler", lambda: scheduler)
    monkeypatch.setattr(midi_hub_routes, "get_tesira_client", lambda: tesira_client)
    monkeypatch.setattr(midi_hub_routes, "get_virtual_gpio_service", lambda: virtual_gpio)
    monkeypatch.setattr(midi_hub_routes, "get_string_interface_service", lambda: string_interface)

    yield {
        "hub": hub,
        "router": router,
        "monitor": monitor,
        "preset_service": preset_service,
        "recorder": recorder,
    }

    manager.stop_all()
    router.stop()
    hub.stop()


@pytest.mark.asyncio
async def test_traffic_snapshot_stats_export_clear(route_env):
    monitor = route_env["monitor"]
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

    snapshot = await midi_hub_routes.get_traffic_snapshot(limit=10)
    assert "captured_total" in snapshot
    assert "records" in snapshot

    stats = await midi_hub_routes.get_traffic_stats()
    assert "count" in stats
    assert "per_type" in stats

    exported = await midi_hub_routes.export_traffic(midi_hub_routes.TrafficExportRequest(format="csv", limit=50))
    assert exported["ok"] is True
    assert exported["format"] == "csv"

    cleared = await midi_hub_routes.clear_traffic()
    assert cleared["ok"] is True
    assert (await midi_hub_routes.get_traffic_snapshot(limit=10))["count"] == 0


@pytest.mark.asyncio
async def test_preset_routes_save_compare_slots_and_recall(route_env, tmp_path: Path):
    router = route_env["router"]
    preset_service = route_env["preset_service"]

    router.add_route({"route_id": "route_a", "source_port": "src", "destination_ports": ["dst"], "enabled": True, "priority": 100})
    assert (
        await midi_hub_routes.save_preset(
            midi_hub_routes.UpsertPresetRequest(
                preset_id="preset_a",
                name="Preset A",
                description="first snapshot",
                conditions={"scene": "intro"},
            )
        )
    )["ok"] is True

    router.add_route({"route_id": "route_b", "source_port": "src", "destination_ports": ["dst"], "enabled": True, "priority": 120})
    assert (
        await midi_hub_routes.save_preset(
            midi_hub_routes.UpsertPresetRequest(preset_id="preset_b", name="Preset B", description="second snapshot")
        )
    )["ok"] is True

    assert (await midi_hub_routes.list_presets())["presets"]
    compare = await midi_hub_routes.compare_presets(
        midi_hub_routes.PresetCompareRequest(left_preset_id="preset_a", right_preset_id="preset_b")
    )
    assert "routes" in compare["diff"]

    default = await midi_hub_routes.set_default_preset(midi_hub_routes.DefaultPresetRequest(preset_id="preset_b"))
    assert default["default_preset_id"] == "preset_b"

    slot = await midi_hub_routes.set_program_slot(7, midi_hub_routes.ProgramSlotRequest(target_id="preset_a"))
    assert slot["target_id"] == "preset_a"

    chain = await midi_hub_routes.set_preset_chain("songA", midi_hub_routes.PresetChainRequest(preset_ids=["preset_a", "preset_b"]))
    assert chain["preset_ids"] == ["preset_a", "preset_b"]

    chain_slot = await midi_hub_routes.set_program_slot(8, midi_hub_routes.ProgramSlotRequest(target_id="chain:songA"))
    assert chain_slot["target_id"] == "chain:songA"

    slots = await midi_hub_routes.get_program_slots()
    assert slots["slots"]["7"] == "preset_a"
    assert slots["slots"]["8"] == "chain:songA"

    run_chain = await midi_hub_routes.run_preset_chain(
        "songA",
        midi_hub_routes.PresetChainRunRequest(interval_ms=100, cycles=1, start_immediately=False),
    )
    assert run_chain["running"] is True
    stop_chain = await midi_hub_routes.stop_preset_chain("songA")
    assert stop_chain["running"] is False

    assert (await midi_hub_routes.delete_program_slot(7))["ok"] is True
    assert (await midi_hub_routes.recall_preset("preset_a"))["ok"] is True
    assert "preset_a" in (await midi_hub_routes.evaluate_preset_context(midi_hub_routes.PresetContextRequest(context={"scene": "intro"})))["recalled_preset_ids"]

    export_path = tmp_path / "exported.json"
    exported = await midi_hub_routes.export_preset("preset_a", midi_hub_routes.PresetExportRequest(export_path=str(export_path)))
    imported = await midi_hub_routes.import_preset(midi_hub_routes.PresetImportRequest(file_path=exported["path"]))
    assert imported["preset"]["preset_id"] == "preset_a"

    assert (await midi_hub_routes.delete_preset("preset_b"))["ok"] is True
    assert preset_service.get_default_preset()["default_preset_id"] is None


@pytest.mark.asyncio
async def test_script_routes_clock_network_and_midi2(route_env):
    examples = await midi_hub_routes.list_script_examples()
    assert examples["count"] >= 1

    upsert = await midi_hub_routes.upsert_script(
        midi_hub_routes.ScriptUpsertRequest(
            script_id="script_a",
            name="Script A",
            enabled=True,
            code="def main(event):\n    log.info('ok')\n    state.set('last', event.get('tag', 'none'))\n",
        )
    )
    assert upsert["script"]["script_id"] == "script_a"
    assert (await midi_hub_routes.list_scripts())["count"] == 1
    assert (await midi_hub_routes.get_script("script_a"))["ok"] is True
    assert (await midi_hub_routes.run_script("script_a", midi_hub_routes.ScriptRunRequest(event={"tag": "run"})))["ok"] is True
    assert (await midi_hub_routes.trigger_script("script_a", midi_hub_routes.ScriptRunRequest(event={"tag": "trigger"})))["ok"] is True
    assert (await midi_hub_routes.get_script_console("script_a", limit=50))["count"] >= 1
    assert (await midi_hub_routes.disable_script("script_a"))["script"]["enabled"] is False
    assert (await midi_hub_routes.enable_script("script_a"))["script"]["enabled"] is True
    assert "ok" in await midi_hub_routes.stop_script("script_a")
    assert (await midi_hub_routes.delete_script("script_a"))["ok"] is True

    assert "bpm" in await midi_hub_routes.get_clock_status()
    configured = await midi_hub_routes.configure_clock(
        midi_hub_routes.ClockConfigRequest(
            bpm=128.5,
            source_mode="internal",
            output_ports=["dst"],
            divider=1.0,
            multiplier=1.0,
            offset_ms=0.0,
        )
    )
    assert abs(configured["bpm"] - 128.5) < 0.001
    await midi_hub_routes.tap_clock()
    assert 20.0 <= (await midi_hub_routes.tap_clock())["bpm"] <= 300.0
    assert (await midi_hub_routes.start_clock())["running"] is True
    assert (await midi_hub_routes.continue_clock())["running"] is True
    assert (await midi_hub_routes.stop_clock())["running"] is False

    assert (
        await midi_hub_routes.create_network_session(
            midi_hub_routes.NetworkSessionRequest(session_id="net1", host="127.0.0.1", port=56010, mode="send")
        )
    )["ok"] is True
    assert (await midi_hub_routes.list_network_sessions())["count"] == 1
    assert (
        await midi_hub_routes.send_network_midi("net1", midi_hub_routes.NetworkSendRequest(message=[0x90, 64, 100]))
    )["ok"] is True
    assert (
        await midi_hub_routes.set_osc_mappings(
            midi_hub_routes.OscMappingsRequest(
                mappings=[{"address": "/map2/cc1", "destination_port": "dst", "message_type": "cc", "channel": 1, "cc": 1}]
            )
        )
    )["count"] == 1
    assert (await midi_hub_routes.get_osc_mappings())["count"] == 1
    assert (await midi_hub_routes.start_osc_server(midi_hub_routes.OscServerRequest(listen_port=58020)))["ok"] is True
    assert (
        await midi_hub_routes.send_osc(
            midi_hub_routes.OscSendRequest(host="127.0.0.1", port=58020, address="/map2/cc1", value=0.5)
        )
    )["ok"] is True
    assert (await midi_hub_routes.stop_osc_server())["ok"] is True
    assert (await midi_hub_routes.delete_network_session("net1"))["ok"] is True

    assert (await midi_hub_routes.get_midi2_status())["enabled"] is False
    configured_midi2 = await midi_hub_routes.configure_midi2(
        midi_hub_routes.Midi2ConfigRequest(enabled=True, default_protocol="midi2")
    )
    assert configured_midi2["default_protocol"] == "midi2"
    discovered = await midi_hub_routes.discover_midi2_device(midi_hub_routes.Midi2DiscoverRequest(device_id="dev-1"))
    assert discovered["device"]["device_id"] == "dev-1"
    profile = await midi_hub_routes.set_midi2_profile("dev-1", midi_hub_routes.Midi2ProfileRequest(profile_id="gm2", enabled=True))
    assert profile["device"]["profiles"]["gm2"] is True
    assert (
        await midi_hub_routes.set_midi2_property("dev-1", midi_hub_routes.Midi2PropertyRequest(key="patch_name", value="Init"))
    )["ok"] is True
    assert (await midi_hub_routes.get_midi2_property("dev-1", "patch_name"))["value"] == "Init"
    ump = await midi_hub_routes.translate_midi1_to_ump(midi_hub_routes.Midi2TranslateMidi1Request(message=[0x90, 60, 100]))
    assert len(ump["words"]) == 1
    midi1 = await midi_hub_routes.translate_ump_to_midi1(midi_hub_routes.Midi2TranslateUmpRequest(words=ump["words"]))
    assert midi1["message"][:3] == [0x90, 60, 100]


@pytest.mark.asyncio
async def test_innovation_routes_macro_recorder_scheduler_mesh_and_shadow(route_env, tmp_path: Path):
    hub = route_env["hub"]
    router = route_env["router"]
    recorder = route_env["recorder"]

    learn = await midi_hub_routes.get_learn_suggestions(
        midi_hub_routes.LearnSuggestRequest(
            parameter_id="wah_filter_mix",
            chain_context={
                "active_plugins": ["wah", "delay"],
                "bypassed_plugins": ["chorus"],
                "split_targets": ["chain_A", "chain_B"],
            },
        )
    )
    assert learn["ok"] is True
    assert len(learn["split_suggestions"]) == 2

    macro = await midi_hub_routes.upsert_macro(
        midi_hub_routes.MacroUpsertRequest(
            macro_id="macro_a",
            name="Macro A",
            trigger={"message_type": "control_change", "cc": 11},
            actions=[{"target": "dst", "action": "send_midi", "delay_ms": 0, "params": {"message": [0xB0, 11, 100]}}],
            enabled=True,
        )
    )
    assert macro["ok"] is True
    assert (await midi_hub_routes.list_macros())["count"] == 1
    assert (await midi_hub_routes.trigger_macro("macro_a", midi_hub_routes.MacroTriggerRequest(payload={"source": "test"})))["ok"] is True
    matched = await midi_hub_routes.match_macros(midi_hub_routes.MacroTriggerRequest(payload={"message_type": "control_change", "cc": 11}))
    assert "macro_a" in matched["triggered_macro_ids"]

    started = await midi_hub_routes.start_recording(midi_hub_routes.RecorderStartRequest(session_id="take1", name="Take 1"))
    assert started["ok"] is True
    recorder._on_message(
        MidiMessage(
            data=bytes([0x90, 60, 100]),
            timestamp_ns=time.time_ns(),
            source_port="src",
            destination_port="dst",
            metadata={"test": True},
        )
    )
    assert (await midi_hub_routes.stop_recording())["ok"] is True
    assert (await midi_hub_routes.get_recording_session("take1", include_events=True))["session"]["event_count"] >= 1

    export_path = tmp_path / "take1.mid"
    recorder_export = await midi_hub_routes.export_recording_session(
        "take1",
        midi_hub_routes.RecorderExportRequest(export_path=str(export_path), bpm=120.0, ticks_per_quarter=480),
    )
    assert Path(recorder_export["path"]).exists()
    assert (
        await midi_hub_routes.playback_recording_session(
            "take1",
            midi_hub_routes.RecorderPlaybackRequest(destination_override="dst", loop=False, speed=1.0),
        )
    )["ok"] is True
    assert "ok" in await midi_hub_routes.stop_recording_playback("take1")

    scheduled = await midi_hub_routes.create_scheduler_entry(
        midi_hub_routes.SchedulerCreateRequest(
            schedule_id="sch1",
            destination_port="dst",
            message=[0xC0, 10],
            delay_ms=0,
            metadata={"source": "test"},
        )
    )
    assert scheduled["ok"] is True
    assert (await midi_hub_routes.list_scheduler_entries(include_finished=True))["count"] >= 1
    updated = await midi_hub_routes.update_scheduler_entry(
        "sch1",
        midi_hub_routes.SchedulerUpdateRequest(delay_ms=100, message=[0xC0, 11], metadata={"updated": True}),
    )
    assert updated["entry"]["schedule_id"] == "sch1"
    assert (await midi_hub_routes.cancel_scheduler_entry("sch1"))["ok"] is True

    assert (await midi_hub_routes.get_mesh_status())["peer_count"] == 0
    peer = await midi_hub_routes.upsert_mesh_peer(
        midi_hub_routes.MeshPeerRequest(peer_id="peer_a", base_url="http://127.0.0.1:9", active=True)
    )
    assert peer["peer"]["peer_id"] == "peer_a"
    forwarding = await midi_hub_routes.set_mesh_forwarding(midi_hub_routes.MeshForwardToggleRequest(forwarding_enabled=True))
    assert forwarding["forwarding_enabled"] is True

    router.add_route({"route_id": "mesh_route_a", "source_port": "src", "destination_ports": ["dst"], "enabled": True, "priority": 90})
    mesh_routes = await midi_hub_routes.publish_mesh_routes(
        midi_hub_routes.MeshRoutesRequest(source_instance="local", routes=router.list_routes(), fanout=False)
    )
    assert mesh_routes["route_count"] >= 1
    assert (
        await midi_hub_routes.receive_mesh_forward(
            midi_hub_routes.MeshForwardRequest(
                source_instance="peer_a",
                source_port="mesh:peer_a",
                destination_port="dst",
                data_hex="903c64",
                metadata={"mesh": True},
            )
        )
    )["ok"] is True
    assert (await midi_hub_routes.delete_mesh_peer("peer_a"))["ok"] is True

    shadow_seed = await midi_hub_routes.upsert_shadow_state(
        "usb_din_adapter:lab",
        midi_hub_routes.ShadowStateRequest(
            expected_state={"connected": True, "responding": True, "health": "online", "latency_ms": 1.0},
            source="test",
        ),
    )
    assert "drift_detected" in shadow_seed
    assert "shadow_state" in await midi_hub_routes.list_shadow_drift(limit=200)
    assert (await midi_hub_routes.clear_shadow_drift())["ok"] is True

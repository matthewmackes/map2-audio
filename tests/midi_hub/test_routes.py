from __future__ import annotations

import asyncio
import json
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
from app.services.midi_hub.message_mapper import MidiMessageMapperService
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
from app.services.midi_hub.traffic_monitor import MidiTrafficMonitor
from app.services.midi_hub.virtual_gpio import VirtualGpioService


def _init_temp_db(tmp_path: Path) -> None:
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'midi-hub-routes.db'}")


def _register_virtual_port(hub: MidiHub, port_id: str, name: str) -> None:
    port = VirtualMidiPort(port_id=port_id, name=name, direction="duplex")
    port.open()
    hub.register_port(port, open_now=False)


def _encode_u7_lsb(value: int, size: int) -> list[int]:
    return [(int(value) >> (7 * index)) & 0x7F for index in range(size)]


def _profile_id(profile_hex: str) -> bytes:
    return bytes(int(token, 16) & 0x7F for token in profile_hex.split())


def _build_discovery_reply(local_muid: int, remote_muid: int) -> bytes:
    return bytes(
        [
            0xF0,
            0x7E,
            0x7F,
            0x0D,
            0x71,
            0x02,
            *_encode_u7_lsb(remote_muid, 4),
            *_encode_u7_lsb(local_muid, 4),
            0x7D,
            0x00,
            0x00,
            0x01,
            0x00,
            0x02,
            0x00,
            0x01,
            0x00,
            0x00,
            0x00,
            0x0C,
            *_encode_u7_lsb(512, 4),
            0x00,
            0xF7,
        ]
    )


def _build_profile_inquiry_reply(local_muid: int, remote_muid: int, enabled_profiles: list[str], disabled_profiles: list[str]) -> bytes:
    enabled_bytes = b"".join(_profile_id(profile_hex) for profile_hex in enabled_profiles)
    disabled_bytes = b"".join(_profile_id(profile_hex) for profile_hex in disabled_profiles)
    return bytes(
        [
            0xF0,
            0x7E,
            0x7F,
            0x0D,
            0x21,
            0x02,
            *_encode_u7_lsb(remote_muid, 4),
            *_encode_u7_lsb(local_muid, 4),
            *_encode_u7_lsb(len(enabled_profiles), 2),
            *enabled_bytes,
            *_encode_u7_lsb(len(disabled_profiles), 2),
            *disabled_bytes,
            0xF7,
        ]
    )


def _build_profile_report(remote_muid: int, profile_hex: str, *, enabled: bool) -> bytes:
    return bytes(
        [
            0xF0,
            0x7E,
            0x7F,
            0x0D,
            0x24 if enabled else 0x25,
            0x02,
            *_encode_u7_lsb(remote_muid, 4),
            0x7F,
            0x7F,
            0x7F,
            0x7F,
            *_profile_id(profile_hex),
            0x00,
            0x00,
            0xF7,
        ]
    )


def _build_profile_details_reply(local_muid: int, remote_muid: int, profile_hex: str, inquiry_target: int, payload: object) -> bytes:
    detail_bytes = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    return bytes(
        [
            0xF0,
            0x7E,
            0x7F,
            0x0D,
            0x29,
            0x02,
            *_encode_u7_lsb(remote_muid, 4),
            *_encode_u7_lsb(local_muid, 4),
            *_profile_id(profile_hex),
            int(inquiry_target) & 0x7F,
            *_encode_u7_lsb(len(detail_bytes), 2),
            *detail_bytes,
            0xF7,
        ]
    )


def _build_pe_caps_reply(local_muid: int, remote_muid: int) -> bytes:
    return bytes(
        [
            0xF0,
            0x7E,
            0x7F,
            0x0D,
            0x31,
            0x02,
            *_encode_u7_lsb(remote_muid, 4),
            *_encode_u7_lsb(local_muid, 4),
            0x01,
            0x00,
            0x00,
            0xF7,
        ]
    )


def _build_invalidate_muid(source_muid: int, target_muid: int) -> bytes:
    return bytes(
        [
            0xF0,
            0x7E,
            0x7F,
            0x0D,
            0x7E,
            0x02,
            *_encode_u7_lsb(source_muid, 4),
            *_encode_u7_lsb(0x0FFFFFFF, 4),
            *_encode_u7_lsb(target_muid, 4),
            0xF7,
        ]
    )


def _build_property_reply(local_muid: int, remote_muid: int, request_id: int, subid2: int, header: dict[str, object], property_data: object | None = None) -> bytes:
    header_bytes = json.dumps(header, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    property_bytes = (
        json.dumps(property_data, separators=(",", ":"), ensure_ascii=True).encode("ascii")
        if property_data is not None
        else b""
    )
    return bytes(
        [
            0xF0,
            0x7E,
            0x7F,
            0x0D,
            subid2,
            0x02,
            *_encode_u7_lsb(remote_muid, 4),
            *_encode_u7_lsb(local_muid, 4),
            int(request_id) & 0x7F,
            *_encode_u7_lsb(len(header_bytes), 2),
            *header_bytes,
            0x01,
            0x00,
            0x01,
            0x00,
            *_encode_u7_lsb(len(property_bytes), 2),
            *property_bytes,
            0xF7,
        ]
    )


def _build_property_exchange_chunks(
    local_muid: int,
    remote_muid: int,
    request_id: int,
    subid2: int,
    header: dict[str, object],
    property_data: object | bytes | None = None,
    *,
    max_chunk_payload: int = 40,
) -> list[bytes]:
    header_bytes = json.dumps(header, separators=(",", ":"), ensure_ascii=True).encode("ascii")
    if isinstance(property_data, bytes):
        property_bytes = property_data
    elif property_data is None:
        property_bytes = b""
    else:
        property_bytes = json.dumps(property_data, separators=(",", ":"), ensure_ascii=True).encode("ascii")

    chunks: list[tuple[bytes, bytes]] = []
    remaining_header = header_bytes
    remaining_property = property_bytes
    while remaining_header or remaining_property or not chunks:
        header_chunk = b""
        property_chunk = b""
        if remaining_header:
            header_chunk = remaining_header[:max_chunk_payload]
            remaining_header = remaining_header[len(header_chunk):]
            if not remaining_header:
                capacity = max_chunk_payload - len(header_chunk)
                property_chunk = remaining_property[:capacity]
                remaining_property = remaining_property[len(property_chunk):]
        else:
            property_chunk = remaining_property[:max_chunk_payload]
            remaining_property = remaining_property[len(property_chunk):]
        chunks.append((header_chunk, property_chunk))

    messages: list[bytes] = []
    for index, (header_chunk, property_chunk) in enumerate(chunks, start=1):
        messages.append(
            bytes(
                [
                    0xF0,
                    0x7E,
                    0x7F,
                    0x0D,
                    subid2,
                    0x02,
                    *_encode_u7_lsb(remote_muid, 4),
                    *_encode_u7_lsb(local_muid, 4),
                    int(request_id) & 0x7F,
                    *_encode_u7_lsb(len(header_chunk), 2),
                    *header_chunk,
                    *_encode_u7_lsb(len(chunks), 2),
                    *_encode_u7_lsb(index, 2),
                    *_encode_u7_lsb(len(property_chunk), 2),
                    *property_chunk,
                    0xF7,
                ]
            )
        )
    return messages


def _build_discovery_message(source_muid: int) -> bytes:
    return bytes(
        [
            0xF0,
            0x7E,
            0x7F,
            0x0D,
            0x70,
            0x02,
            *_encode_u7_lsb(source_muid, 4),
            *_encode_u7_lsb(0x0FFFFFFF, 4),
            0x7D,
            0x00,
            0x00,
            0x01,
            0x00,
            0x02,
            0x00,
            0x01,
            0x00,
            0x00,
            0x00,
            0x0C,
            *_encode_u7_lsb(512, 4),
            0x00,
            0xF7,
        ]
    )


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
    midi2_manager = Midi2Manager(enabled=False, hub=hub, network_bridge=network_bridge)
    message_mapper = MidiMessageMapperService(
        hub=hub,
        storage_path=tmp_path / "message-mapper.json",
    )
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
    monkeypatch.setattr(midi_hub_routes, "get_midi_message_mapper_service", lambda: message_mapper)
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
        "message_mapper": message_mapper,
        "network_bridge": network_bridge,
        "midi2_manager": midi2_manager,
    }

    manager.stop_all()
    midi2_manager.close()
    message_mapper.close()
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
async def test_device_inventory_profile_and_assignment_routes(route_env):
    hub = route_env["hub"]
    _register_virtual_port(hub, "midisport-a", "M-Audio MIDISPORT 4x4 Port A")

    inventory = await midi_hub_routes.get_device_inventory(refresh=True)
    assert inventory["count"] == 1
    assert inventory["devices"][0]["profile_id"] == "m_audio_midisport_4x4"

    profiles = await midi_hub_routes.list_device_profiles()
    assert any(profile["profile_id"] == "m_audio_midisport_4x4" for profile in profiles["profiles"])

    built_in = await midi_hub_routes.get_device_profile("m_audio_midisport_4x4")
    assert built_in["name"] == "M-Audio MIDISPORT 4x4"

    created = await midi_hub_routes.upsert_device_profile(
        midi_hub_routes.DeviceProfileUpsertRequest(
            profile_id="rack_usb_bridge",
            name="Rack USB Bridge",
            match_patterns=["rack bridge"],
            default_channel=0,
            supports_sysex=True,
            usb_vid_pid=["0763:1020"],
            metadata={"device_type": "adapter"},
        )
    )
    assert created["ok"] is True
    assert created["profile"]["profile_id"] == "rack_usb_bridge"

    assigned = await midi_hub_routes.assign_device_port(
        midi_hub_routes.DeviceAssignmentRequest(
            port_name="M-Audio MIDISPORT 4x4 Port A",
            device_id="rack_usb_bridge:stage_left",
        )
    )
    assert assigned["ok"] is True

    reassigned_inventory = await midi_hub_routes.get_device_inventory(refresh=True)
    assert reassigned_inventory["devices"][0]["device_id"] == "rack_usb_bridge:stage_left"
    assert reassigned_inventory["devices"][0]["manual_assignment"] == "M-Audio MIDISPORT 4x4 Port A"

    cleared = await midi_hub_routes.clear_device_assignment("M-Audio MIDISPORT 4x4 Port A")
    assert cleared["ok"] is True

    deleted = await midi_hub_routes.delete_device_profile("rack_usb_bridge")
    assert deleted["ok"] is True


@pytest.mark.asyncio
async def test_device_binding_routes_full_lifecycle(route_env):
    """T2480-5 / T2480-6 — exercise the four binding routes
    (POST/DELETE/GET on a device, GET on a consumer)."""
    from fastapi import HTTPException

    hub = route_env["hub"]
    _register_virtual_port(hub, "kbd-port-id", "Brain Test Keyboard")

    # Refresh so the registry sees the port.
    inventory = await midi_hub_routes.get_device_inventory(refresh=True)
    assert inventory["count"] == 1
    device_id = inventory["devices"][0]["device_id"]

    # POST a binding.
    add_resp = await midi_hub_routes.add_device_binding(
        device_id,
        midi_hub_routes.DeviceBindingRequest(
            consumer_type="snapshot",
            consumer_id="42",
            consumer_name="Brain — Test (set up 2026-04-30)",
            source="brain-setup-task",
        ),
    )
    assert add_resp["ok"] is True
    assert add_resp["binding"]["consumer_id"] == "42"
    assert add_resp["binding"]["source"] == "brain-setup-task"
    # bound_at should be a non-empty ISO-8601-looking string.
    assert isinstance(add_resp["binding"]["bound_at"], str)
    assert len(add_resp["binding"]["bound_at"]) > 0

    # GET the binding back.
    list_resp = await midi_hub_routes.list_device_bindings(device_id)
    assert list_resp["count"] == 1
    assert list_resp["bindings"][0]["consumer_id"] == "42"

    # Reverse-link: GET consumer's devices.
    consumer_resp = await midi_hub_routes.list_consumer_devices("snapshot", "42")
    assert consumer_resp["count"] == 1
    assert consumer_resp["device_ids"] == [device_id]

    # POST again with same source replaces (replace-by-key on
    # consumer_type+source).
    await midi_hub_routes.add_device_binding(
        device_id,
        midi_hub_routes.DeviceBindingRequest(
            consumer_type="snapshot",
            consumer_id="99",
            consumer_name="Brain — Replace (set up 2026-04-30)",
            source="brain-setup-task",
        ),
    )
    relist = await midi_hub_routes.list_device_bindings(device_id)
    assert relist["count"] == 1
    assert relist["bindings"][0]["consumer_id"] == "99"

    # DELETE removes it.
    delete_resp = await midi_hub_routes.remove_device_binding(
        device_id, "snapshot", "99"
    )
    assert delete_resp["ok"] is True

    final_list = await midi_hub_routes.list_device_bindings(device_id)
    assert final_list["count"] == 0

    # DELETE again is a 404.
    with pytest.raises(HTTPException) as excinfo:
        await midi_hub_routes.remove_device_binding(device_id, "snapshot", "99")
    assert excinfo.value.status_code == 404

    # POST against an unknown device is a 404.
    with pytest.raises(HTTPException) as excinfo:
        await midi_hub_routes.add_device_binding(
            "no-such-device",
            midi_hub_routes.DeviceBindingRequest(
                consumer_type="snapshot",
                consumer_id="1",
                consumer_name="—",
            ),
        )
    assert excinfo.value.status_code == 404


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
    message_mapper = route_env["message_mapper"]
    midi2_manager = route_env["midi2_manager"]
    _register_virtual_port(hub, "srcx", "SourceX")
    _register_virtual_port(hub, "dstx", "DestX")
    _register_virtual_port(hub, "m2-out", "MIDI 2 Out")
    _register_virtual_port(hub, "m2-in", "MIDI 2 In")

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
            midi_hub_routes.ClockConfigRequest(
                bpm=128.5,
                output_ports=["dstx"],
                snapshot_sync_enabled=True,
                divider=1.0,
                multiplier=1.0,
            )
        )
    )["bpm"] == 128.5
    assert (await midi_hub_routes.get_clock_status())["snapshot_sync_enabled"] is True
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
    assert "enabled" in await midi_hub_routes.get_midi2_status()
    assert (
        await midi_hub_routes.configure_midi2(
            midi_hub_routes.Midi2ConfigRequest(
                enabled=True,
                default_protocol="midi2",
                binding_transport="port",
                binding_target_id="m2-out",
                binding_response_port="m2-in",
            )
        )
    )["binding"]["target_id"] == "m2-out"
    discovered = await midi_hub_routes.discover_midi2_device(midi_hub_routes.Midi2DiscoverRequest())
    assert discovered["ok"] is True
    assert discovered["transport"]["target_id"] == "m2-out"
    hub._drain_outbound()
    midi2_out = hub.resolve_port("m2-out")
    assert isinstance(midi2_out, VirtualMidiPort)
    transmitted = midi2_out.read_transmitted(max_messages=8)
    assert transmitted
    assert transmitted[-1].data[0] == 0xF0
    assert transmitted[-1].data[-1] == 0xF7
    assert transmitted[-1].data[4] == 0x70
    midi2_in = hub.resolve_port("m2-in")
    assert isinstance(midi2_in, VirtualMidiPort)
    remote_muid = 0x0011223
    response = _build_discovery_reply(midi2_manager._local_muid, remote_muid)
    assert midi2_in.inject(response, source_port="m2-in") is True
    hub._collect_inbound()
    hub._dispatch_inbound()
    status = midi2_manager.status()
    assert status["last_rx_hex"] == response.hex(" ").upper()
    assert status["last_rx_device_id"] == "muid-0011223"
    device_id = status["devices"][0]["device_id"]
    assert status["devices"][0]["discovery_state"] == "confirmed"
    assert status["devices"][0]["supports_profiles"] is True
    assert status["devices"][0]["supports_property_exchange"] is True

    profile_id = "7E 00 00 01 00"
    profile_inquiry = await midi_hub_routes.inquire_midi2_profiles(device_id)
    assert profile_inquiry["ok"] is True
    profile_reply = _build_profile_inquiry_reply(
        midi2_manager._local_muid,
        remote_muid,
        enabled_profiles=[profile_id],
        disabled_profiles=[],
    )
    assert midi2_in.inject(profile_reply, source_port="m2-in") is True
    hub._collect_inbound()
    hub._dispatch_inbound()
    status = midi2_manager.status()
    assert status["devices"][0]["profiles"][profile_id] is True

    disable_profile = await midi_hub_routes.set_midi2_profile(
        device_id,
        midi_hub_routes.Midi2ProfileRequest(profile_id=profile_id, enabled=False),
    )
    assert disable_profile["ok"] is True
    disable_reply = _build_profile_report(remote_muid, profile_id, enabled=False)
    assert midi2_in.inject(disable_reply, source_port="m2-in") is True
    hub._collect_inbound()
    hub._dispatch_inbound()
    status = midi2_manager.status()
    assert status["devices"][0]["profiles"][profile_id] is False

    profile_details = await midi_hub_routes.inquire_midi2_profile_details(
        device_id,
        midi_hub_routes.Midi2ProfileDetailsRequest(profile_id=profile_id, inquiry_target=16),
    )
    assert profile_details["ok"] is True
    profile_details_reply = _build_profile_details_reply(
        midi2_manager._local_muid,
        remote_muid,
        profile_id,
        16,
        {"name": "Organ"},
    )
    assert midi2_in.inject(profile_details_reply, source_port="m2-in") is True
    hub._collect_inbound()
    hub._dispatch_inbound()
    status = midi2_manager.status()
    assert status["devices"][0]["profile_details"][f"{profile_id}@10"]["data"]["name"] == "Organ"

    pe_caps = await midi_hub_routes.inquire_midi2_property_exchange_capabilities(device_id)
    assert pe_caps["ok"] is True
    assert midi2_in.inject(_build_pe_caps_reply(midi2_manager._local_muid, remote_muid), source_port="m2-in") is True
    hub._collect_inbound()
    hub._dispatch_inbound()
    status = midi2_manager.status()
    assert status["devices"][0]["property_exchange_capabilities"]["ready"] is True

    resource_read = await midi_hub_routes.read_midi2_property(
        device_id,
        midi_hub_routes.Midi2PropertyRequest(resource="ResourceList"),
    )
    assert resource_read["ok"] is True
    read_request_id = int(resource_read["transport"]["request_id"])
    resource_reply = _build_property_reply(
        midi2_manager._local_muid,
        remote_muid,
        read_request_id,
        0x35,
        {"status": 200, "resource": "ResourceList"},
        [{"resource": "DeviceInfo"}, {"resource": "ChannelList"}],
    )
    assert midi2_in.inject(resource_reply, source_port="m2-in") is True
    hub._collect_inbound()
    hub._dispatch_inbound()
    status = midi2_manager.status()
    assert status["devices"][0]["resources"] == ["DeviceInfo", "ChannelList"]

    set_property = await midi_hub_routes.set_midi2_property(
        device_id,
        midi_hub_routes.Midi2PropertyRequest(resource="patch_name", value="Init"),
    )
    assert set_property["ok"] is True
    write_request_id = int(set_property["transport"]["request_id"])
    write_reply = _build_property_reply(
        midi2_manager._local_muid,
        remote_muid,
        write_request_id,
        0x37,
        {"status": 200, "resource": "patch_name"},
    )
    assert midi2_in.inject(write_reply, source_port="m2-in") is True
    hub._collect_inbound()
    hub._dispatch_inbound()
    assert (
        await midi_hub_routes.get_midi2_property(device_id, "patch_name")
    )["value"] == "Init"

    large_read = await midi_hub_routes.read_midi2_property(
        device_id,
        midi_hub_routes.Midi2PropertyRequest(resource="LargeResource"),
    )
    assert large_read["ok"] is True
    large_request_id = int(large_read["transport"]["request_id"])
    large_reply_chunks = _build_property_exchange_chunks(
        midi2_manager._local_muid,
        remote_muid,
        large_request_id,
        0x35,
        {"status": 200, "resource": "LargeResource"},
        {"payload": "X" * 128},
        max_chunk_payload=28,
    )
    assert len(large_reply_chunks) > 1
    for packet in large_reply_chunks:
        assert midi2_in.inject(packet, source_port="m2-in") is True
    hub._collect_inbound()
    hub._dispatch_inbound()
    assert (
        await midi_hub_routes.get_midi2_property(device_id, "LargeResource")
    )["value"] == {"payload": "X" * 128}

    subscribe = await midi_hub_routes.subscribe_midi2_property(
        device_id,
        midi_hub_routes.Midi2SubscriptionRequest(resource="patch_name"),
    )
    assert subscribe["ok"] is True
    subscribe_request_id = int(subscribe["transport"]["request_id"])
    subscribe_reply = _build_property_exchange_chunks(
        midi2_manager._local_muid,
        remote_muid,
        subscribe_request_id,
        0x39,
        {"status": 200, "subscribeId": "sub_patch"},
    )[0]
    assert midi2_in.inject(subscribe_reply, source_port="m2-in") is True
    hub._collect_inbound()
    hub._dispatch_inbound()
    status = midi2_manager.status()
    assert status["devices"][0]["subscriptions"]["sub_patch"]["resource"] == "patch_name"

    partial_update_chunks = _build_property_exchange_chunks(
        midi2_manager._local_muid,
        remote_muid,
        77,
        0x38,
        {"command": "partial", "subscribeId": "sub_patch"},
        {"/value": "Subscribed"},
    )
    assert len(partial_update_chunks) > 1
    for packet in partial_update_chunks:
        assert midi2_in.inject(packet, source_port="m2-in") is True
    hub._collect_inbound()
    hub._dispatch_inbound()
    await asyncio.sleep(0)
    assert (
        await midi_hub_routes.get_midi2_property(device_id, "patch_name")
    )["value"] == {"/value": "Subscribed"}

    notify_update_chunks = _build_property_exchange_chunks(
        midi2_manager._local_muid,
        remote_muid,
        78,
        0x38,
        {"command": "notify", "subscribeId": "sub_patch"},
    )
    assert len(notify_update_chunks) > 1
    for packet in notify_update_chunks:
        assert midi2_in.inject(packet, source_port="m2-in") is True
    hub._collect_inbound()
    hub._dispatch_inbound()
    await asyncio.sleep(0)
    hub._drain_outbound()
    transmitted = midi2_out.read_transmitted(max_messages=32)
    subscription_reply_packets = [packet for packet in transmitted if len(packet.data) > 5 and packet.data[4] == 0x39]
    refresh_packets = [packet for packet in transmitted if len(packet.data) > 5 and packet.data[4] == 0x34]
    assert subscription_reply_packets
    assert refresh_packets
    refresh_request_id = int(refresh_packets[-1].data[14]) & 0x7F
    refresh_reply_chunks = _build_property_exchange_chunks(
        midi2_manager._local_muid,
        remote_muid,
        refresh_request_id,
        0x35,
        {"status": 200, "resource": "patch_name"},
        "Refreshed",
    )
    assert len(refresh_reply_chunks) > 1
    for packet in refresh_reply_chunks:
        assert midi2_in.inject(packet, source_port="m2-in") is True
    hub._collect_inbound()
    hub._dispatch_inbound()
    assert (
        await midi_hub_routes.get_midi2_property(device_id, "patch_name")
    )["value"] == "Refreshed"

    end_subscription = await midi_hub_routes.end_midi2_subscription(device_id, "sub_patch")
    assert end_subscription["ok"] is True
    end_request_id = int(end_subscription["transport"]["request_id"])
    end_reply = _build_property_exchange_chunks(
        midi2_manager._local_muid,
        remote_muid,
        end_request_id,
        0x39,
        {"status": 200},
    )[0]
    assert midi2_in.inject(end_reply, source_port="m2-in") is True
    hub._collect_inbound()
    hub._dispatch_inbound()
    assert "sub_patch" not in midi2_manager.status()["devices"][0]["subscriptions"]

    inspect = await midi_hub_routes.inspect_ump(
        midi_hub_routes.Midi2TranslateUmpRequest(words=[0x01011234, 0x40903C00, 0x12345678])
    )
    assert inspect["messages"][0]["kind"] == "jr_clock"
    assert inspect["messages"][1]["kind"] == "note_on"

    local_muid_before_collision = midi2_manager._local_muid
    collision_probe = _build_discovery_message(local_muid_before_collision)
    assert midi2_in.inject(collision_probe, source_port="m2-in") is True
    hub._collect_inbound()
    hub._dispatch_inbound()
    await asyncio.sleep(0)
    assert midi2_manager._local_muid != local_muid_before_collision
    assert str(midi2_manager.status()["last_error"]).startswith("local_muid_collision:")

    collision_recovery_reply = _build_discovery_reply(midi2_manager._local_muid, remote_muid)
    assert midi2_in.inject(collision_recovery_reply, source_port="m2-in") is True
    hub._collect_inbound()
    hub._dispatch_inbound()
    status = midi2_manager.status()
    assert status["device_count"] == 1
    device_id = status["devices"][0]["device_id"]

    invalidated = await midi_hub_routes.invalidate_midi2_device(device_id)
    assert invalidated["ok"] is True
    assert invalidated["removed_device_ids"] == [device_id]
    hub._drain_outbound()
    transmitted = midi2_out.read_transmitted(max_messages=8)
    assert transmitted
    assert any(packet.data[4] == 0x7E for packet in transmitted if len(packet.data) > 5)
    assert midi2_manager.status()["device_count"] == 0
    assert (await midi_hub_routes.delete_network_session("n1"))["ok"] is True

    mapper_list = await midi_hub_routes.list_message_mapper_slots()
    assert mapper_list["count"] == 16
    saved_mapper = await midi_hub_routes.upsert_message_mapper_slot(
        "mapper-1",
        midi_hub_routes.MessageMapperSlotRequest(
            enabled=True,
            source_port="srcx",
            message_type="control_change",
            channel_min=1,
            channel_max=4,
            value_min=32,
            value_max=96,
            target="dstx",
            curve="linear",
        ),
    )
    assert saved_mapper["slot"]["target"] == "dstx"
    emitted = message_mapper.process_message(
        MidiMessage(
            data=bytes([0xB0, 0x07, 0x40]),
            timestamp_ns=1,
            source_port="srcx",
            destination_port=None,
        )
    )
    assert emitted[0]["ok"] is True
    hub._drain_outbound()
    transmitted = hub.resolve_port("dstx")
    assert isinstance(transmitted, VirtualMidiPort)
    output = transmitted.read_transmitted(max_messages=4)
    assert output
    mapped_packets = [
        packet for packet in output if len(packet.data) == 3 and packet.data[:2] == bytes([0xB0, 0x07])
    ]
    assert mapped_packets
    assert mapped_packets[-1].data[2] == 64
    assert (await midi_hub_routes.clear_message_mapper_slot("mapper-1"))["ok"] is True
    reset_mapper = await midi_hub_routes.reset_message_mapper_slots()
    assert reset_mapper["count"] == 16

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

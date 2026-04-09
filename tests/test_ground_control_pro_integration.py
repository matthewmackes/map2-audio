from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from sqlalchemy import select

from app import database as database_module
from app.services import snapshot_runtime_service
from app.services import snapshot_runtime_state_service as runtime_state_service_module
from app.services import snapshot_service as snapshot_service_module
from app.services.chain_service import ChainService
from app.services.ground_control_pro.model import GroundControlTransportOptions
from app.services.ground_control_pro.service import GroundControlProService
from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService
from app.services.snapshot_service import SnapshotService
from tests.test_ground_control_pro_service import (
    _FakeSnapshotPluginLoader,
    _FakeTransport,
    _init_temp_db,
)


FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "ground_control_pro"


def _read_fixture(name: str) -> bytes:
    return (FIXTURE_DIR / name).read_bytes()


class _SequencedPortTransport(_FakeTransport):
    def __init__(self, captures: list[bytes] | None = None, *, port_sequences: list[dict[str, object]] | None = None) -> None:
        super().__init__(captures=captures)
        self.port_sequences = list(port_sequences or [])
        self._last_ports: dict[str, object] = {
            "rtmidi_available": True,
            "inputs": [{"index": 0, "name": "Ground Control Pro In", "connected": False}],
            "outputs": [{"index": 0, "name": "Ground Control Pro Out", "connected": False}],
            "recommended_input_index": 0,
            "recommended_output_index": 0,
        }

    def list_ports(self):
        if self.port_sequences:
            self._last_ports = dict(self.port_sequences.pop(0))
        return dict(self._last_ports)


async def _passthrough(snapshot_data):
    return snapshot_data


async def _fake_apply(_snapshot_data):
    return 0, 0


async def _fake_push_footswitch_labels(**_kwargs):
    return {"labels_pushed": 0, "device_count": 0, "devices": [], "lcd_updated": False}


async def _fake_push_controller_display(**_kwargs):
    return {"slots_pushed": 0, "device_count": 0, "devices": []}


async def _healthy_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
    result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
    chain = result.scalar_one_or_none()
    if chain is not None:
        chain.is_active = True
    return True


async def _healthy_channels(self, *, live_snapshot_payload):
    total_count = len(live_snapshot_payload.get("channels") or []) if isinstance(live_snapshot_payload, dict) else 0
    return {
        "snapshot_payload": live_snapshot_payload,
        "active_count": total_count,
        "total_count": total_count,
        "inactive_channels": [],
        "inactive_messages": [],
    }


def _install_snapshot_runtime_stubs(monkeypatch, *, expression_calls: list[dict[str, int | str]] | None = None, selected_blocks: list[str] | None = None, toggled_blocks: list[str] | None = None) -> None:
    expression_calls = expression_calls if expression_calls is not None else []
    selected_blocks = selected_blocks if selected_blocks is not None else []
    toggled_blocks = toggled_blocks if toggled_blocks is not None else []

    class _FakeMaschineService:
        async def get_audio_grid_projection(self, _session):
            return {
                "selected_block_id": "lead:0",
                "blocks": [
                    {
                        "block_id": "lead:0",
                        "plugin_uri": "urn:test:plugin",
                        "plugin_position": 0,
                        "runtime_chain_id": 1,
                        "bypassed": False,
                    }
                ],
            }

        async def select_audio_grid_block(self, _session, block_id: str):
            selected_blocks.append(block_id)
            return {
                "selected_block_id": block_id,
                "blocks": [
                    {
                        "block_id": block_id,
                        "plugin_uri": "urn:test:plugin",
                        "plugin_position": 0,
                        "runtime_chain_id": 1,
                        "bypassed": False,
                    }
                ],
            }

        async def toggle_audio_grid_block_bypass(self, _session, block_id: str):
            toggled_blocks.append(block_id)
            return {
                "selected_block_id": block_id,
                "blocks": [
                    {
                        "block_id": block_id,
                        "plugin_uri": "urn:test:plugin",
                        "plugin_position": 0,
                        "runtime_chain_id": 1,
                        "bypassed": True,
                    }
                ],
            }

    class _FakeExpressionService:
        def process_midi_cc(self, *, cc: int, value: int, channel: int, source_port: str = "") -> None:
            expression_calls.append(
                {
                    "cc": cc,
                    "value": value,
                    "channel": channel,
                    "source_port": source_port,
                }
            )

    class _RuntimeEngineStub:
        is_available = False
        is_running = False

        async def get_topology_mutation_stats(self):
            return None

        async def set_all_midi_commands(self, commands):
            self.commands = [dict(command) for command in commands]
            return True

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_routing_to_engine", lambda detail: asyncio.sleep(0, result={"applied": True, "reason": "ab_switch"}))
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_morph_to_engine", lambda detail: asyncio.sleep(0, result={"applied": True, "reason": "unchanged"}))
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(snapshot_service_module, "get_audio_engine", lambda: _RuntimeEngineStub())
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_footswitch_labels", _fake_push_footswitch_labels)
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_controller_display_preview", _fake_push_controller_display)
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(SnapshotRuntimeStateService, "assert_snapshot_channels_active", _healthy_channels)
    monkeypatch.setattr(ChainService, "activate_chain", _healthy_activate_chain)
    monkeypatch.setattr("app.services.maschine_service.get_maschine_service", lambda: _FakeMaschineService())
    monkeypatch.setattr("app.services.expression_service.get_expression_service", lambda: _FakeExpressionService())


async def _create_live_snapshot(*, session_name: str = "GcpIntegrationSnapshot", gcp_session_id: str = "live-gcp-session") -> dict[str, object]:
    async with database_module.get_session() as session:
        snapshot_service = SnapshotService(session)
        created = await snapshot_service.create_snapshot(
            name=session_name,
            controls_payload={
                "expression_mappings": [
                    {
                        "id": "snapshot-wah",
                        "label": "EXP 1",
                        "cc": 11,
                        "channel": 3,
                        "cc_min": 0,
                        "cc_max": 127,
                        "targets": [
                            {
                                "id": "wah-target",
                                "param_id": "engine.wah_freq",
                                "param_label": "Wah",
                                "out_min": 0.0,
                                "out_max": 1.0,
                            }
                        ],
                    }
                ]
            },
            detail_payload={
                "channels": [
                    {"channel_key": "channel-a", "label": "A", "color": "#2563eb", "chain_id": 1},
                    {"channel_key": "channel-b", "label": "B", "color": "#22c55e", "chain_id": 2},
                ],
                "chains": [
                    {"id": 1, "name": "A", "plugins": [{"uri": "urn:test:plugin", "position": 0, "bypass": False, "parameters": {}}]},
                    {"id": 2, "name": "B", "plugins": []},
                ],
                "routing": {
                    "mode": "ab_switch",
                    "active_channel_key": "channel-a",
                    "blend_positions": {"channel-a": 100.0, "channel-b": 0.0},
                    "series_order": ["channel-a", "channel-b"],
                },
                "extensions": {
                    "ground_control_pro": {
                        "session_id": gcp_session_id,
                        "activation_push": {
                            "preset": {
                                "index": 3,
                                "name": "LIVEA",
                                "gcx_loop_states": [
                                    {"index": 0, "value": 1},
                                    {"index": 3, "value": 1},
                                ],
                                "gcx_toggles": [1, 0, 1, 0],
                                "instant_access_state": [
                                    {"index": 1, "value": 1},
                                ],
                            },
                            "transport": {
                                "output_port_name": "Ground Control Pro Out",
                            },
                        },
                        "input_map": {
                            "mappings": [
                                {
                                    "id": "gcp-bypass",
                                    "trigger_type": "control_change",
                                    "cc": 83,
                                    "channel": 1,
                                    "value_threshold": 64,
                                    "action_type": "toggle_plugin",
                                    "block_id": "lead:0",
                                    "plugin_uri": "urn:test:plugin",
                                    "plugin_position": 0,
                                },
                                {
                                    "id": "gcp-focus",
                                    "trigger_type": "program_change",
                                    "program": 5,
                                    "channel": 1,
                                    "action_type": "focus_block",
                                    "block_id": "lead:0",
                                    "plugin_uri": "urn:test:plugin",
                                    "plugin_position": 0,
                                },
                                {
                                    "id": "gcp-ab",
                                    "trigger_type": "control_change",
                                    "cc": 84,
                                    "channel": 1,
                                    "value_threshold": 64,
                                    "action_type": "set_routing",
                                    "routing_action": "ab_switch_toggle",
                                },
                                {
                                    "id": "gcp-exp",
                                    "trigger_type": "control_change",
                                    "cc": 7,
                                    "channel": 1,
                                    "action_type": "expression_mapping",
                                    "expression_mapping_id": "snapshot-wah",
                                },
                            ]
                        },
                    }
                },
                "midi_map": [],
            },
            apply_default_system_blocks=False,
        )
        await snapshot_service.activate_snapshot(created["id"])
        return created


def test_ground_control_pro_integration_sysex_round_trip_and_bundle_restore(tmp_path: Path) -> None:
    fixture = _read_fixture("factory_default_v113.syx")
    transport = _FakeTransport([fixture])
    service = GroundControlProService(base_dir=tmp_path / "gcp-int", transport=transport)

    backup_job = asyncio.run(service.backup(GroundControlTransportOptions(input_port_index=0), create_session=True))
    assert backup_job["status"] == "completed"
    session_id = backup_job["result"]["session"]["session_id"]

    session = asyncio.run(service.get_session(session_id))
    draft = dict(session["model"])
    draft["presets"] = [dict(preset) for preset in session["model"]["presets"]]
    draft["presets"][0]["name"] = "INTA"

    compile_result = asyncio.run(service.compile_session(session_id, draft))
    compiled_artifact_id = compile_result["artifact"]["artifact_id"]

    push_job = asyncio.run(
        service.push(
            compiled_artifact_id=compiled_artifact_id,
            session_id=session_id,
            model_payload=draft,
            options=GroundControlTransportOptions(output_port_index=0),
            force=False,
        )
    )
    assert push_job["status"] == "completed"

    compiled_bytes = Path(compile_result["artifact"]["path"]).read_bytes()
    transport.captures.append(compiled_bytes)
    verify_job = asyncio.run(service.redump_verify(compiled_artifact_id, GroundControlTransportOptions(input_port_index=0)))
    assert verify_job["status"] == "completed"
    assert verify_job["result"]["match"] is True

    bundle_payload = asyncio.run(service.export_bundle_payload(session_id=session_id))
    assert bundle_payload is not None
    restored = asyncio.run(service.import_bundle_payload(bundle_payload))
    assert restored is not None
    restored_session = asyncio.run(service.get_session(restored["session_id"]))

    assert restored_session["source_name"] == "backup:Test Input"
    assert restored_session["model"]["presets"][0]["name"] == "P000"
    assert restored["source_artifact_id"] == restored_session["summary"]["source_artifact_id"]


def test_ground_control_pro_integration_snapshot_push_input_mapping_and_reconnect_repush(tmp_path: Path, monkeypatch) -> None:
    _init_temp_db(tmp_path)
    expression_calls: list[dict[str, int | str]] = []
    selected_blocks: list[str] = []
    toggled_blocks: list[str] = []
    _install_snapshot_runtime_stubs(
        monkeypatch,
        expression_calls=expression_calls,
        selected_blocks=selected_blocks,
        toggled_blocks=toggled_blocks,
    )

    port_sequences = [
        {
            "rtmidi_available": True,
            "inputs": [],
            "outputs": [],
            "recommended_input_index": None,
            "recommended_output_index": None,
        },
        {
            "rtmidi_available": True,
            "inputs": [{"index": 0, "name": "Ground Control Pro In", "connected": True}],
            "outputs": [{"index": 0, "name": "Ground Control Pro Out", "connected": True}],
            "recommended_input_index": 0,
            "recommended_output_index": 0,
        },
    ]
    transport = _SequencedPortTransport(port_sequences=port_sequences)
    service = GroundControlProService(base_dir=tmp_path / "gcp-live", transport=transport)

    imported = asyncio.run(service.import_syx_bytes(_read_fixture("factory_default_v113.syx"), source_name="live-gcp.syx"))
    live_snapshot = asyncio.run(_create_live_snapshot(gcp_session_id=imported["session_id"]))

    activation_result = asyncio.run(
        service.push_snapshot_activation(
            snapshot_id=int(live_snapshot["id"]),
            snapshot_name=str(live_snapshot["name"]),
            extension_payload={
                "session_id": imported["session_id"],
                "activation_push": {
                    "preset": {
                        "index": 3,
                        "name": "LIVEA",
                        "gcx_loop_states": [
                            {"index": 0, "value": 1},
                            {"index": 3, "value": 1},
                        ],
                        "gcx_toggles": [1, 0, 1, 0],
                    },
                    "transport": {
                        "output_port_name": "Ground Control Pro Out",
                    },
                },
            },
        )
    )

    assert activation_result["status"] == "completed"
    updated_session = asyncio.run(service.get_session(imported["session_id"]))
    assert updated_session["model"]["presets"][3]["gcx_loop_states"][0] == 1
    assert updated_session["model"]["presets"][3]["gcx_loop_states"][3] == 1
    assert updated_session["model"]["presets"][3]["gcx_toggles"][:4] == [1, 0, 1, 0]

    bypass_result = asyncio.run(
        service.handle_inbound_message(
            bytes([0xB0, 83, 127]),
            source_port="Ground Control Pro In",
            metadata={"profile_id": "ground_control_pro"},
        )
    )
    focus_result = asyncio.run(
        service.handle_inbound_message(
            bytes([0xC0, 5]),
            source_port="Ground Control Pro In",
            metadata={"profile_id": "ground_control_pro"},
        )
    )
    ab_result = asyncio.run(
        service.handle_inbound_message(
            bytes([0xB0, 84, 127]),
            source_port="Ground Control Pro In",
            metadata={"profile_id": "ground_control_pro"},
        )
    )
    expression_result = asyncio.run(
        service.handle_inbound_message(
            bytes([0xB0, 7, 96]),
            source_port="Ground Control Pro In",
            metadata={"profile_id": "ground_control_pro"},
        )
    )

    assert bypass_result["status"] == "completed"
    assert focus_result["status"] == "completed"
    assert ab_result["results"][0]["routing"]["active_channel_key"] == "channel-b"
    assert expression_result["status"] == "completed"
    assert toggled_blocks == ["lead:0"]
    assert selected_blocks == ["lead:0"]
    assert expression_calls == [
        {
            "cc": 11,
            "value": 96,
            "channel": 3,
            "source_port": "Ground Control Pro In",
        }
    ]

    transport.port_sequences = [
        {
            "rtmidi_available": True,
            "inputs": [],
            "outputs": [],
            "recommended_input_index": None,
            "recommended_output_index": None,
        },
        {
            "rtmidi_available": True,
            "inputs": [{"index": 0, "name": "Ground Control Pro In", "connected": True}],
            "outputs": [{"index": 0, "name": "Ground Control Pro Out", "connected": True}],
            "recommended_input_index": 0,
            "recommended_output_index": 0,
        },
    ]
    asyncio.run(service._daemon.stop())
    service._daemon._initialized = False
    service._daemon._available = False

    asyncio.run(service._daemon.tick())
    daemon_snapshot = service._daemon.snapshot()
    assert daemon_snapshot["state"] == "reconnecting"

    asyncio.run(service._daemon.tick())
    daemon_snapshot = service._daemon.snapshot()
    assert daemon_snapshot["state"] == "connected"
    assert daemon_snapshot["reconnect_count"] == 1
    assert daemon_snapshot["notification"]["title"] == "Ground Control Pro state restored"
    assert len(transport.sent_messages) >= 2

from __future__ import annotations

import asyncio
from copy import deepcopy
from pathlib import Path

import pytest

from app import database as database_module
from app.services import snapshot_runtime_service
from app.services import snapshot_service as snapshot_service_module
from app.services import snapshot_runtime_state_service as runtime_state_service_module
from app.services.chain_service import ChainService
from app.services.ground_control_pro.model import GroundControlTransportOptions
from app.services.ground_control_pro.service import GroundControlProService
from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService
from app.services.snapshot_service import SnapshotService
from sqlalchemy import select


FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures" / "ground_control_pro"


def _init_temp_db(tmp_path: Path) -> None:
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'ground-control-pro-service.db'}")


class _FakeSnapshotPluginLoader:
    def get_plugin_by_uri(self, uri: str):
        if uri.startswith("urn:test:"):
            return {"uri": uri, "name": uri.rsplit(":", 1)[-1]}
        return None


class _FakeTransport:
    def __init__(self, captures: list[bytes] | None = None) -> None:
        self.captures = list(captures or [])
        self.sent_messages: list[bytes] = []

    def list_ports(self):
        return {
            "rtmidi_available": True,
            "inputs": [{"index": 0, "name": "Test Input", "connected": False}],
            "outputs": [{"index": 0, "name": "Test Output", "connected": False}],
            "recommended_input_index": 0,
            "recommended_output_index": 0,
        }

    async def receive_sysex(self, options: GroundControlTransportOptions):
        if not self.captures:
            raise TimeoutError("No capture queued")
        data = self.captures.pop(0)
        return {
            "bytes": data,
            "traffic": [{"direction": "in", "hex": data[:16].hex()}],
            "port_index": options.input_port_index or 0,
            "port_name": "Test Input",
        }

    async def send_sysex(self, data: bytes, options: GroundControlTransportOptions):
        self.sent_messages.append(bytes(data))
        return {
            "dry_run": False,
            "bytes_sent": len(data),
            "segments": 1,
            "traffic": [{"direction": "out", "hex": data[:16].hex()}],
            "port_index": options.output_port_index or 0,
            "port_name": "Test Output",
        }


def _read_fixture(name: str) -> bytes:
    return (FIXTURE_DIR / name).read_bytes()


def test_ground_control_pro_service_backup_compile_push_and_verify(tmp_path: Path) -> None:
    base_fixture = _read_fixture("factory_default_v113.syx")
    transport = _FakeTransport([base_fixture])
    service = GroundControlProService(base_dir=tmp_path, transport=transport)

    backup_job = asyncio.run(service.backup(GroundControlTransportOptions(input_port_index=0), create_session=True))

    assert backup_job["status"] == "completed"
    session = backup_job["result"]["session"]
    session_id = session["session_id"]

    draft = deepcopy(session["model"])
    draft["presets"][0]["name"] = "LEAD A"
    compile_result = asyncio.run(service.compile_session(session_id, draft))

    assert compile_result["validation"]["errors"] == []
    assert compile_result["validation"]["round_trip_identity"] is True

    compiled_bytes = Path(compile_result["artifact"]["path"]).read_bytes()
    push_job = asyncio.run(
        service.push(
            compiled_artifact_id=compile_result["artifact"]["artifact_id"],
            session_id=session_id,
            model_payload=draft,
            options=GroundControlTransportOptions(output_port_index=0),
            force=False,
        )
    )

    assert push_job["status"] == "completed"
    assert transport.sent_messages == [compiled_bytes]

    transport.captures.append(compiled_bytes)
    verify_job = asyncio.run(
        service.redump_verify(
            compile_result["artifact"]["artifact_id"],
            GroundControlTransportOptions(input_port_index=0),
        )
    )

    assert verify_job["status"] == "completed"
    assert verify_job["result"]["match"] is True

    updated_session = asyncio.run(service.get_session(session_id))
    artifact_kinds = [artifact["kind"] for artifact in updated_session["artifacts"]]
    assert "backup_syx" in artifact_kinds
    assert "compiled_syx" in artifact_kinds
    assert "transmit_syx" in artifact_kinds
    assert "verify_redump_syx" in artifact_kinds


def test_ground_control_pro_service_requires_backup_before_push(tmp_path: Path) -> None:
    transport = _FakeTransport()
    service = GroundControlProService(base_dir=tmp_path, transport=transport)
    imported = asyncio.run(service.import_syx_bytes(_read_fixture("factory_default_v113.syx"), source_name="factory_default_v113.syx"))

    with pytest.raises(ValueError, match="fresh backup is required"):
        asyncio.run(
            service.push(
                compiled_artifact_id=None,
                session_id=imported["session_id"],
                model_payload=imported["model"],
                options=GroundControlTransportOptions(output_port_index=0),
                force=False,
            )
        )


def test_ground_control_pro_service_diff_labels_fixture_delta(tmp_path: Path) -> None:
    service = GroundControlProService(base_dir=tmp_path, transport=_FakeTransport())

    diff = asyncio.run(
        service.diff(
            left_fixture="factory_default_v113.syx",
            right_fixture="single_name_change_v113.syx",
        )
    )

    assert diff["changed_count"] > 0
    assert any("presets[0].name" in label for change in diff["changes"] for label in change["labels"])


def test_ground_control_pro_service_push_snapshot_activation_overlays_assignments(tmp_path: Path) -> None:
    transport = _FakeTransport()
    service = GroundControlProService(base_dir=tmp_path, transport=transport)
    imported = asyncio.run(
        service.import_syx_bytes(
            _read_fixture("factory_default_v113.syx"),
            source_name="factory_default_v113.syx",
        )
    )

    result = asyncio.run(
        service.push_snapshot_activation(
            snapshot_id=17,
            snapshot_name="CrunchB",
            extension_payload={
                "session_id": imported["session_id"],
                "activation_push": {
                    "preset": {
                        "index": 3,
                        "name": "CrunchB",
                        "device_program_changes": [
                            {"device_index": 0, "enabled": 1, "program": 42},
                            {"device_index": 1, "enabled": 1, "program": 64},
                        ],
                        "gcx_loop_states": [
                            {"index": 0, "value": 1},
                            {"index": 7, "value": 1},
                        ],
                        "gcx_toggles": [1, 0, 1, 0],
                        "instant_access_state": [
                            {"index": 1, "value": 1},
                            {"index": 4, "value": 1},
                        ],
                    },
                    "global_config": {
                        "instant_access": [
                            {"index": 1, "function": 55, "detail": 9, "transmit_cc": 1, "switch_type": 1},
                        ],
                    },
                    "transport": {
                        "output_port_index": 0,
                    },
                },
            },
        )
    )

    assert result["status"] == "completed"
    assert result["snapshot_id"] == 17
    assert result["preset_index"] == 3
    assert result["transport"]["port_index"] == 0
    assert transport.sent_messages

    updated_session = asyncio.run(service.get_session(imported["session_id"]))
    updated_preset = updated_session["model"]["presets"][3]
    assert updated_preset["name"] == "CrunchB"
    assert updated_preset["device_program_changes"][0]["program"] == 42
    assert updated_preset["device_program_changes"][1]["program"] == 64
    assert updated_preset["gcx_loop_states"][0] == 1
    assert updated_preset["gcx_loop_states"][7] == 1
    assert updated_preset["gcx_toggles"][:4] == [1, 0, 1, 0]
    assert updated_preset["instant_access_state"][1] == 1
    assert updated_preset["instant_access_state"][4] == 1
    assert updated_session["model"]["global_config"]["instant_access"][1]["transmit_cc"] == 1


def test_ground_control_pro_service_dispatches_live_snapshot_input_mappings(tmp_path: Path, monkeypatch) -> None:
    _init_temp_db(tmp_path)
    expression_calls: list[dict[str, int | str]] = []
    selected_blocks: list[str] = []
    toggled_blocks: list[str] = []

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
        return {
            "snapshot_payload": live_snapshot_payload,
            "active_count": 2,
            "total_count": 2,
            "inactive_channels": [],
            "inactive_messages": [],
        }

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

    async def _run() -> None:
        async with database_module.get_session() as session:
            snapshot_service = SnapshotService(session)
            created = await snapshot_service.create_snapshot(
                name="GcpInboundSnapshot",
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
                            }
                        }
                    },
                    "midi_map": [],
                },
                apply_default_system_blocks=False,
            )

            activated = await snapshot_service.activate_snapshot(created["id"])
            assert activated is not None

        gcp_service = GroundControlProService(base_dir=tmp_path / "gcp-live", transport=_FakeTransport())

        bypass_result = await gcp_service.handle_inbound_message(
            bytes([0xB0, 83, 127]),
            source_port="Ground Control Pro In",
            metadata={"profile_id": "ground_control_pro"},
        )
        focus_result = await gcp_service.handle_inbound_message(
            bytes([0xC0, 5]),
            source_port="Ground Control Pro In",
            metadata={"profile_id": "ground_control_pro"},
        )
        ab_result = await gcp_service.handle_inbound_message(
            bytes([0xB0, 84, 127]),
            source_port="Ground Control Pro In",
            metadata={"profile_id": "ground_control_pro"},
        )
        expression_result = await gcp_service.handle_inbound_message(
            bytes([0xB0, 7, 96]),
            source_port="Ground Control Pro In",
            metadata={"profile_id": "ground_control_pro"},
        )
        skipped_result = await gcp_service.handle_inbound_message(
            bytes([0xB0, 7, 96]),
            source_port="Other Controller",
            metadata={"profile_id": "morningstar_mc6"},
        )

        assert bypass_result["status"] == "completed"
        assert bypass_result["results"][0]["action_type"] == "toggle_plugin"
        assert toggled_blocks == ["lead:0"]

        assert focus_result["status"] == "completed"
        assert focus_result["results"][0]["action_type"] == "focus_block"
        assert selected_blocks == ["lead:0"]

        assert ab_result["status"] == "completed"
        assert ab_result["results"][0]["routing"]["active_channel_key"] == "channel-b"

        assert expression_result["status"] == "completed"
        assert expression_result["results"][0]["action_type"] == "expression_mapping"
        assert expression_calls == [
            {
                "cc": 11,
                "value": 96,
                "channel": 3,
                "source_port": "Ground Control Pro In",
            }
        ]

        assert skipped_result == {"status": "skipped", "reason": "non_ground_control_source"}

    asyncio.run(_run())

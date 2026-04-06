import asyncio
import io
import json
import zipfile
from pathlib import Path
from types import SimpleNamespace

import pytest

from app import database as database_module
from app.services import audio_state_authority as audio_state_authority_module
from app.services import performance_brain_authority_sync as performance_brain_authority_sync_module
from app.services import performance_metrics as performance_metrics_module
from app.services import performance_brain_service as performance_brain_service_module
from app.services import snapshot_runtime_service
from app.services import snapshot_service as snapshot_service_module
from app.services import snapshot_runtime_state_service as runtime_state_service_module
from app.services import upload_service as upload_service_module
from app.services import websocket_manager as websocket_manager_module
from app.services.chain_service import ChainService
from app.services.midi_service import ActionType, CommandType, MIDICommandDTO, midi_service
from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService
from app.services.snapshot_service import SnapshotActivationPreflightError, SnapshotService
from app.services.snapshot_system_blocks import NOISE_GATE_PLUGIN_URI
from app.services.snapshot_tempo_service import reset_snapshot_tempo_service
from sqlalchemy import delete, select


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    reset_snapshot_tempo_service()
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'snapshot-service.db'}")


class _FakeSnapshotPluginLoader:
    def get_plugin_by_uri(self, uri: str):
        if uri == "urn:test:missing-plugin":
            return None
        if uri.startswith("urn:test:"):
            return {"uri": uri, "name": uri.rsplit(":", 1)[-1]}
        return None


def _count_system_noise_gates(snapshot_detail: dict[str, object]) -> int:
    return sum(
        1
        for chain in snapshot_detail.get("chains", [])
        if isinstance(chain, dict)
        for plugin in chain.get("plugins", [])
        if isinstance(plugin, dict)
        and plugin.get("uri") == NOISE_GATE_PLUGIN_URI
        and isinstance(plugin.get("loader_state"), dict)
        and plugin["loader_state"].get("system_block_role") == "noise_gate"
    )


@pytest.fixture(autouse=True)
def _disable_background_snapshot_preload(monkeypatch):
    monkeypatch.setattr(snapshot_service_module, "schedule_snapshot_preload_for_live_snapshot", lambda _snapshot_id: None)


def test_snapshot_service_crud_activation_and_import(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    scheduled_health_checks: list[dict[str, object]] = []
    footswitch_pushes: list[dict[str, object]] = []
    controller_display_pushes: list[dict[str, object]] = []

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(snapshot_data):
        assert snapshot_data["flowSlots"][0]["label"] == "A"
        return 3, 2

    async def _fake_apply_tempo(_snapshot_data, _bpm):
        return 1

    async def _fake_push_footswitch_labels(**kwargs):
        footswitch_pushes.append(dict(kwargs))
        return {"labels_pushed": 2, "device_count": 1, "devices": ["morningstar_mc6:main"], "lcd_updated": True}

    async def _fake_push_controller_display(**kwargs):
        controller_display_pushes.append(dict(kwargs))
        return {"slots_pushed": 1, "device_count": 1, "devices": ["morningstar_mc6:main"]}

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_tempo_to_engine", _fake_apply_tempo)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_footswitch_labels", _fake_push_footswitch_labels)
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_controller_display_preview", _fake_push_controller_display)
    monkeypatch.setattr(
        runtime_state_service_module,
        "schedule_post_activation_health_check",
        lambda **kwargs: scheduled_health_checks.append(dict(kwargs)),
    )

    async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            created = await service.create_snapshot(
                name="UnifiedSnapshot",
                description="Service test",
                tags=["service"],
                program_number=10,
                tempo_bpm=132.0,
                output_level_reference_dbfs=-12.5,
                output_level_warning_threshold_db=2.5,
                input_device="Capture 1",
                output_device="Playback 1",
                controls_payload={
                    "maschine_encoder_map": {
                        "enc2": {"block_id": "block-1", "param_id": "gain", "label": "Gain"},
                    }
                },
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-0",
                            "label": "A",
                            "color": "#2563eb",
                            "muted": False,
                            "solo": False,
                            "dry_wet_mix": 100.0,
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Chain A",
                            "plugins": [
                                {
                                    "uri": "urn:test:plugin",
                                    "name": "Test Plugin",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"gain": 0.5},
                                    "loader_state": {},
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-0",
                        "blend_positions": {"channel-0": 100.0},
                        "morph_position": 0.5,
                        "series_order": ["channel-0"],
                    },
                    "midi_map": [
                        {"action": "load_snapshot", "program_number": 10},
                        {"action": "footswitch_label_map", "label_map": {"1": "Clean", "2": "Lead"}},
                    ],
                },
            )

            assert created["name"] == "UnifiedSnapshot"
            assert created["channel_count"] == 1
            assert created["chain_count"] == 1
            assert created["routing"]["mode"] == "parallel_blend"
            assert created["midi_map"][0]["program_number"] == 10
            assert created["tempo_bpm"] == 132.0
            assert created["active_tempo_bpm"] == 132.0
            assert created["tempo_source"] == "stored"
            assert created["output_level_reference_dbfs"] == -12.5
            assert created["output_level_warning_threshold_db"] == 2.5
            assert created["input_device"] == "Capture 1"
            assert created["output_device"] == "Playback 1"
            assert created["io_bindings"]["input_device"] == "Capture 1"
            assert created["controls"]["midi_map"][0]["program_number"] == 10
            assert created["controls"]["maschine_encoder_map"]["enc2"]["param_id"] == "gain"
            assert created["lineage"]["derived_from_snapshot_id"] is None
            assert created["activated_at"] is None
            assert created["paths"][0]["id"] == "channel-0"
            assert created["paths"][0]["label"] == "A"
            assert created["chains"][0]["plugins"][0]["uri"] == NOISE_GATE_PLUGIN_URI
            assert created["chains"][0]["plugins"][0]["position"] == 0
            assert created["chains"][0]["plugins"][0]["loader_state"]["system_block_role"] == "noise_gate"
            assert created["chains"][0]["plugins"][0]["loader_state"]["system_block_locked"] is True
            assert created["chains"][0]["plugins"][0]["parameters"]["threshold"] == -40.0
            assert created["chains"][0]["plugins"][0]["parameters"]["release"] == 100.0
            assert created["chains"][0]["plugins"][1]["uri"] == "urn:test:plugin"
            assert created["chains"][0]["plugins"][1]["position"] == 1
            assert _count_system_noise_gates(created) == 1

            command_id = await midi_service.create_command(
                MIDICommandDTO(
                    command_type=CommandType.CC_TOGGLE,
                    channel=1,
                    data1=80,
                    action_type=ActionType.TOGGLE_PLUGIN,
                    target_plugin_uri="urn:test:plugin",
                    target_plugin_position=1,
                    action_data={"slot_index": 0},
                    name="Slot 1 Test Plugin",
                ),
                session,
            )
            assert command_id is not None

            renamed = await service.update_snapshot(
                created["id"],
                tempo_bpm=140.0,
                output_level_reference_dbfs=-9.0,
                output_level_warning_threshold_db=4.0,
                input_device="Capture 2",
                output_device=None,
                controls_payload={
                    "maschine_encoder_map": {
                        "enc3": {"block_id": "block-2", "param_id": "mix", "label": "Mix"},
                    }
                },
            )
            assert renamed is not None
            assert renamed["tempo_bpm"] == 140.0
            assert renamed["output_level_reference_dbfs"] == -9.0
            assert renamed["output_level_warning_threshold_db"] == 4.0
            assert renamed["input_device"] == "Capture 2"
            assert renamed["output_device"] is None
            assert renamed["controls"]["maschine_encoder_map"]["enc3"]["param_id"] == "mix"
            assert renamed["controls"]["maschine_encoder_map"]["enc1"] is None

            updated = await service.add_channel(
                created["id"],
                {
                    "channel_key": "channel-1",
                    "label": "B",
                    "color": "#22c55e",
                    "chain_id": None,
                },
            )
            assert updated is not None
            assert updated["channel_count"] == 2

            activated = await service.activate_snapshot(created["id"])
            assert activated is not None
            assert activated["params_applied"] == 3
            assert activated["bypass_applied"] == 2
            assert activated["snapshot_revision"]
            assert activated["runtime_live_state"]["snapshot_id"] == created["id"]
            assert activated["snapshot_data"]["live_state"]["is_live"] is True
            assert activated["snapshot_data"]["activated_at"] is not None
            assert activated["snapshot_data"]["tempo_bpm"] == 140.0
            assert activated["snapshot_data"]["active_tempo_bpm"] == 140.0
            assert activated["snapshot_data"]["tempo_source"] == "stored"
            assert activated["snapshot_data"]["controller_display_preview"]["slots"][0]["display_label"] == "Clean"
            assert activated["snapshot_data"]["controller_display_preview"]["slots"][0]["target_plugin_uri"] == "urn:test:plugin"
            assert activated["snapshot_data"]["controller_display_preview"]["slots"][0]["slot_state"] == "active"
            assert activated["snapshot_data"]["controller_display_preview"]["slots"][0]["key_parameter"]["parameter_symbol"] == "gain"
            assert activated["snapshot_data"]["controller_display_preview"]["slots"][0]["key_parameter"]["current_value"] == 0.5
            assert scheduled_health_checks[0]["snapshot_id"] == created["id"]
            assert scheduled_health_checks[0]["request_id"] == activated["activation_intent"]["request_id"]
            assert footswitch_pushes == [
                {
                    "snapshot_id": created["id"],
                    "snapshot_name": "UnifiedSnapshot",
                    "midi_map_entries": [
                        {"action": "load_snapshot", "program_number": 10},
                        {"action": "footswitch_label_map", "label_map": {"1": "Clean", "2": "Lead"}},
                    ],
                }
            ]
            assert controller_display_pushes[0]["snapshot_id"] == created["id"]
            assert controller_display_pushes[0]["snapshot_name"] == "UnifiedSnapshot"
            assert controller_display_pushes[0]["preview_payload"]["slots"][0]["display_label"] == "Clean"
            assert controller_display_pushes[0]["preview_payload"]["slots"][0]["key_parameter"]["formatted_value"] == "0.5"

            live_snapshot = await service.get_live_snapshot()
            assert live_snapshot is not None
            assert live_snapshot["id"] == created["id"]
            assert live_snapshot["live_state"]["is_live"] is True
            assert live_snapshot["activated_at"] == activated["snapshot_data"]["activated_at"]
            assert live_snapshot["snapshot_revision"] == activated["snapshot_revision"]
            assert live_snapshot["tempo_bpm"] == 140.0
            assert live_snapshot["active_tempo_bpm"] == 140.0
            assert live_snapshot["controller_display_preview"]["slots"][0]["display_label"] == "Clean"

            runtime_state_service = SnapshotRuntimeStateService(session)
            runtime_live_state = await runtime_state_service.get_live_state()
            assert runtime_live_state["snapshot_id"] == created["id"]
            assert runtime_live_state["display_state"] == "live"
            activation_events = await runtime_state_service.list_activation_events(limit=10)
            assert activation_events[0]["snapshot_id"] == created["id"]
            assert activation_events[0]["outcome"] == "success"

            locked = await service.update_snapshot(created["id"], is_locked=True)
            assert locked is not None
            assert locked["is_locked"] is True

            duplicate = await service.duplicate_snapshot(created["id"])
            assert duplicate is not None
            assert duplicate["name"] == "UnifiedSnapshotcopy"
            assert duplicate["program_number"] is None
            assert duplicate["is_locked"] is False
            assert duplicate["is_favorite"] is False
            assert duplicate["lineage"]["derived_from_snapshot_id"] == created["id"]
            assert duplicate["controls"]["midi_map"][0]["program_number"] is None
            assert duplicate["midi_map"][0]["program_number"] is None
            assert _count_system_noise_gates(duplicate) == 1

            saved_as_new = await service.save_snapshot_as_new(created["id"], name="UnifiedSnapshotV2")
            assert saved_as_new is not None
            assert saved_as_new["name"] == "UnifiedSnapshotV2"
            assert saved_as_new["program_number"] is None
            assert saved_as_new["lineage"]["derived_from_snapshot_id"] == created["id"]
            assert saved_as_new["controls"]["midi_map"][0]["program_number"] == 10
            assert saved_as_new["controls"]["maschine_encoder_map"]["enc3"]["param_id"] == "mix"
            assert saved_as_new["is_locked"] is False
            assert _count_system_noise_gates(saved_as_new) == 1

            replaced_midi_map = await service.replace_midi_map(
                created["id"],
                [
                    {"action": "load_snapshot", "program_number": 5},
                    {"action": "focus_block_note_range", "midi_channel": 3, "start_note": 48},
                ],
            )
            assert replaced_midi_map is not None
            assert replaced_midi_map["midi_map"][1]["action"] == "focus_block_note_range"
            assert replaced_midi_map["controls"]["midi_map"][1]["start_note"] == 48
            assert replaced_midi_map["controls"]["maschine_encoder_map"]["enc3"]["param_id"] == "mix"

            refetched_after_midi_map_replace = await service.get_snapshot(created["id"])
            assert refetched_after_midi_map_replace is not None
            assert refetched_after_midi_map_replace["controls"]["midi_map"][1]["midi_channel"] == 3
            assert refetched_after_midi_map_replace["midi_map"][1]["start_note"] == 48

            exported = await service.export_snapshot(created["id"])
            assert exported is not None
            assert exported["snapshot"]["name"] == "UnifiedSnapshot"

            imported = await service.import_snapshot(
                {
                    "snapshot": {
                        "name": "ImportedPlaceholderSnapshot",
                        "description": "Import",
                        "tags": ["imported"],
                        "channels": [
                            {
                                "channel_key": "channel-0",
                                "label": "A",
                                "color": "#2563eb",
                                "chain_id": 1,
                            }
                        ],
                        "chains": [
                            {
                                "id": 1,
                                "name": "Missing Chain",
                                "plugins": [
                                    {
                                        "uri": "urn:test:missing-plugin",
                                        "position": 0,
                                        "bypass": False,
                                        "parameters": {"mix": 0.25},
                                    }
                                ],
                            }
                        ],
                        "routing": {
                            "mode": "morph",
                            "active_channel_key": "channel-0",
                            "blend_positions": {},
                            "morph_position": 0.4,
                            "series_order": ["channel-0"],
                        },
                        "midi_map": [],
                    }
                }
            )
            assert imported["chains"][0]["plugins"][0]["is_placeholder"] is True
            assert imported["input_device"] is None
            assert imported["output_device"] is None
            assert _count_system_noise_gates(imported) == 0

            await service.update_snapshot(saved_as_new["id"], is_favorite=True, display_order=2)
            await service.update_snapshot(imported["id"], is_favorite=True, display_order=5)

            listed = await service.list_snapshots()
            assert len(listed) == 4
            assert [item["name"] for item in listed] == [
                "UnifiedSnapshotV2",
                "ImportedPlaceholderSnapshot",
                "UnifiedSnapshot",
                "UnifiedSnapshotcopy",
            ]
            assert listed[0]["is_favorite"] is True
            assert listed[1]["is_favorite"] is True
            assert listed[2]["is_favorite"] is False
            assert listed[3]["is_favorite"] is False
            summary = next(item for item in listed if item["name"] == "UnifiedSnapshot")
            assert summary["input_device"] == "Capture 2"
            assert summary["output_device"] is None
            assert summary["io_bindings"]["input_device"] == "Capture 2"
            assert summary["activated_at"] == activated["snapshot_data"]["activated_at"]
            assert summary["lineage"]["derived_from_snapshot_id"] is None

            by_program = await service.get_snapshot_by_program(10)
            assert by_program is not None
            assert by_program["id"] == created["id"]
            assert by_program["input_device"] == "Capture 2"
            assert by_program["output_device"] is None

    asyncio.run(_run())


def test_snapshot_service_persists_and_reads_state_authority_document(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            created = await service.create_snapshot(
                name="DocumentBacked",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-0",
                            "label": "A",
                            "color": "#2563eb",
                            "muted": False,
                            "solo": False,
                            "dry_wet_mix": 100.0,
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Chain A",
                            "plugins": [
                                {
                                    "uri": "map2://juce/nam",
                                    "name": "NAM",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"gain": 0.5},
                                    "loader_state": {},
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-0",
                        "blend_positions": {"channel-0": 100.0},
                        "series_order": ["channel-0"],
                    },
                    "midi_map": [],
                },
            )

            snapshot_row = await session.get(database_module.Snapshot, created["id"])
            assert snapshot_row is not None
            assert snapshot_row.document["version"] == "2026.04"
            assert "map2:fx:nam" in [node["uri"] for node in snapshot_row.document["graph"]["nodes"]]

            await session.execute(delete(database_module.SnapshotChannel).where(database_module.SnapshotChannel.snapshot_id == created["id"]))
            await session.execute(delete(database_module.SnapshotChainPlugin).where(database_module.SnapshotChainPlugin.snapshot_chain_id.in_(select(database_module.SnapshotChain.id).where(database_module.SnapshotChain.snapshot_id == created["id"]))))
            await session.execute(delete(database_module.SnapshotChain).where(database_module.SnapshotChain.snapshot_id == created["id"]))
            await session.execute(delete(database_module.SnapshotRouting).where(database_module.SnapshotRouting.snapshot_id == created["id"]))
            await session.execute(delete(database_module.SnapshotMidiMap).where(database_module.SnapshotMidiMap.snapshot_id == created["id"]))
            await session.flush()
            session.expire_all()

            reloaded = await service.get_snapshot(created["id"])
            assert reloaded is not None
            assert "map2://juce/nam" in [plugin["uri"] for plugin in reloaded["chains"][0]["plugins"]]
            assert reloaded["channel_count"] == 1

    asyncio.run(_run())


def test_snapshot_revision_restore_prefers_document_when_payload_missing(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            created = await service.create_snapshot(
                name="RevisionDoc",
                detail_payload={
                    "channels": [{"channel_key": "channel-0", "label": "A", "color": "#2563eb", "muted": False, "solo": False, "dry_wet_mix": 100.0, "chain_id": 1}],
                    "chains": [{"id": 1, "name": "Chain A", "plugins": [{"uri": "urn:test:drive", "name": "Drive", "position": 0, "bypass": False, "parameters": {"gain": 0.4}, "loader_state": {}}]}],
                    "routing": {"mode": "parallel_blend", "active_channel_key": "channel-0", "blend_positions": {"channel-0": 100.0}, "series_order": ["channel-0"]},
                    "midi_map": [],
                },
            )

            await service.update_snapshot(
                created["id"],
                detail_payload={
                    "channels": created["channels"],
                    "chains": [{"id": created["chains"][0]["id"], "name": "Chain A", "plugins": [{"uri": "urn:test:drive", "name": "Drive", "position": 0, "bypass": False, "parameters": {"gain": 0.7}, "loader_state": {}}]}],
                    "routing": created["routing"],
                    "midi_map": [],
                },
                create_revision=True,
            )

            result = await session.execute(select(database_module.SnapshotRevision).where(database_module.SnapshotRevision.snapshot_id == created["id"]))
            revision = result.scalar_one()
            revision.payload = {}
            await session.flush()

            restored = await service.restore_revision(created["id"], 1)
            assert restored is not None
            drive_plugin = next(
                plugin
                for plugin in restored["chains"][0]["plugins"]
                if plugin.get("uri") == "urn:test:drive"
            )
            assert drive_plugin["parameters"]["gain"] == 0.4

    asyncio.run(_run())


def test_snapshot_service_rejects_invalid_state_authority_document_write(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            def _broken_document(snapshot, normalized):
                return {
                    "version": "2026.03",
                    "meta": {"name": snapshot.name, "type": "snapshot"},
                    "graph": {
                        "nodes": [
                            {
                                "id": "node-1",
                                "uri": "invalid uri",
                                "name": "Broken",
                                "parameters": {},
                                "state": {},
                            }
                        ],
                        "edges": [],
                    },
                }

            monkeypatch.setattr(service.state_authority_documents, "build_document", _broken_document)

            try:
                await service.create_snapshot(
                    name="InvalidDocWrite",
                    detail_payload={
                        "channels": [],
                        "chains": [],
                        "routing": {"mode": "parallel_blend", "active_channel_key": None, "blend_positions": {}, "series_order": []},
                        "midi_map": [],
                    },
                )
            except ValueError as exc:
                assert "$.version" in str(exc)
                assert "Auto-repair guidance" in str(exc)
                await session.rollback()
            else:
                raise AssertionError("Invalid State Authority document write should fail")

            result = await session.execute(
                select(database_module.Snapshot).where(database_module.Snapshot.name == "InvalidDocWrite")
            )
            assert result.scalar_one_or_none() is None

    asyncio.run(_run())


def test_snapshot_service_restores_asset_paths_from_state_authority_registry(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    asset_path = tmp_path / "RegistryTone.nam"
    asset_path.write_bytes(b"registry-tone")

    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            created = await service.create_snapshot(
                name="RegistryBacked",
                detail_payload={
                    "channels": [{"channel_key": "channel-0", "label": "A", "color": "#2563eb", "muted": False, "solo": False, "dry_wet_mix": 100.0, "chain_id": 1}],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Chain A",
                            "plugins": [
                                {
                                    "uri": "map2://juce/nam",
                                    "name": "NAM",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"gain": 0.5},
                                    "loader_state": {
                                        "selected_asset_path": str(asset_path),
                                        "selected_model": "RegistryTone",
                                    },
                                }
                            ],
                        }
                    ],
                    "routing": {"mode": "parallel_blend", "active_channel_key": "channel-0", "blend_positions": {"channel-0": 100.0}, "series_order": ["channel-0"]},
                    "midi_map": [],
                },
            )

            asset_row = (
                await session.execute(select(database_module.StateAuthorityAsset))
            ).scalar_one()
            assert asset_row.asset_hash.startswith("sha256:")
            assert asset_row.source_path == str(asset_path.resolve())

            snapshot_row = await session.get(database_module.Snapshot, created["id"])
            document = dict(snapshot_row.document)
            graph = dict(document["graph"])
            nodes = list(graph["nodes"])
            nam_node = next(node for node in nodes if node["uri"] == "map2:fx:nam")
            assert nam_node["state"]["selected_asset_path"] == asset_row.asset_hash
            document["assets"] = []
            snapshot_row.document = document

            await session.execute(delete(database_module.SnapshotChannel).where(database_module.SnapshotChannel.snapshot_id == created["id"]))
            await session.execute(delete(database_module.SnapshotChainPlugin).where(database_module.SnapshotChainPlugin.snapshot_chain_id.in_(select(database_module.SnapshotChain.id).where(database_module.SnapshotChain.snapshot_id == created["id"]))))
            await session.execute(delete(database_module.SnapshotChain).where(database_module.SnapshotChain.snapshot_id == created["id"]))
            await session.execute(delete(database_module.SnapshotRouting).where(database_module.SnapshotRouting.snapshot_id == created["id"]))
            await session.execute(delete(database_module.SnapshotMidiMap).where(database_module.SnapshotMidiMap.snapshot_id == created["id"]))
            await session.flush()
            session.expire_all()

            reloaded = await service.get_snapshot(created["id"])
            assert reloaded is not None
            nam_plugin = next(
                plugin
                for plugin in reloaded["chains"][0]["plugins"]
                if plugin.get("uri") == "map2://juce/nam"
            )
            assert nam_plugin["loader_state"]["selected_asset_path"] == str(asset_path.resolve())
            assert nam_plugin["loader_state"]["selected_model"] == "RegistryTone"

    asyncio.run(_run())


def test_snapshot_service_rejects_invalid_names(tmp_path):
    _init_temp_db(tmp_path)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            try:
                await service.create_snapshot(name="Invalid Snapshot")
            except ValueError as exc:
                assert str(exc) == "Snapshot names may only contain letters and numbers, with no spaces or special characters."
            else:
                raise AssertionError("Invalid snapshot create name should fail")

            created = await service.create_snapshot(name="ValidSnapshot")

            try:
                await service.update_snapshot(created["id"], name="Still Invalid")
            except ValueError as exc:
                assert str(exc) == "Snapshot names may only contain letters and numbers, with no spaces or special characters."
            else:
                raise AssertionError("Invalid snapshot rename should fail")

    asyncio.run(_run())


def test_snapshot_service_bundle_export_import_embeds_and_restores_assets(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    export_dir = tmp_path / "bundle-source"
    export_dir.mkdir(parents=True, exist_ok=True)
    nam_source = export_dir / "CleanTone.nam"
    cab_source = export_dir / "Mesa.wav"
    nam_source.write_bytes(b"nam-model-data")
    cab_source.write_bytes(b"wave-data")

    library_root = tmp_path / "bundle-library"
    storage_paths = {
        upload_service_module.AssetType.NAM: library_root / "nam",
        upload_service_module.AssetType.CABINET_IR: library_root / "ir" / "cabinets",
        upload_service_module.AssetType.REVERB_IR: library_root / "ir" / "reverbs",
        upload_service_module.AssetType.VST3: library_root / "vst3",
    }

    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(
        upload_service_module.UnifiedUploadService,
        "get_storage_path",
        lambda self, asset_type: storage_paths[asset_type],
    )
    monkeypatch.setattr(upload_service_module, "_upload_service", None)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="BundledSnapshot",
                apply_default_system_blocks=False,
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-0",
                            "label": "A",
                            "color": "#2563eb",
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Chain A",
                            "plugins": [
                                {
                                    "uri": "map2://juce/nam",
                                    "name": "NAM",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"gain": 0.5},
                                    "loader_state": {
                                        "selected_model": "CleanTone",
                                        "selected_asset_name": "CleanTone",
                                        "selected_asset_path": str(nam_source),
                                    },
                                },
                                {
                                    "uri": "map2://juce/convolution/cabinet",
                                    "name": "Cabinet IR",
                                    "position": 1,
                                    "bypass": False,
                                    "parameters": {"mix": 1.0},
                                    "loader_state": {
                                        "selected_ir": "Mesa",
                                        "selected_asset_name": "Mesa",
                                        "selected_asset_path": str(cab_source),
                                    },
                                },
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-0",
                        "blend_positions": {"channel-0": 100.0},
                        "series_order": ["channel-0"],
                    },
                    "midi_map": [],
                },
            )

            bundle = await service.export_snapshot_bundle(created["id"])
            assert bundle is not None
            assert bundle["filename"] == "BundledSnapshot.map2snapshot"

            with zipfile.ZipFile(io.BytesIO(bundle["content"]), "r") as archive:
                assert "snapshot.json" in archive.namelist()
                payload = json.loads(archive.read("snapshot.json").decode("utf-8"))
                assert payload["snapshot"]["name"] == "BundledSnapshot"
                bundled_assets = [asset for asset in payload["asset_manifest"] if asset.get("bundle_path")]
                assert len(bundled_assets) == 2
                assert sorted(archive.namelist()) == sorted(
                    ["snapshot.json", *(asset["bundle_path"] for asset in bundled_assets)]
                )

            imported = await service.import_snapshot(bundle["content"])
            assert imported["name"] == "BundledSnapshot"

            imported_plugins = {
                plugin["uri"]: plugin
                for plugin in imported["chains"][0]["plugins"]
            }
            imported_nam_path = Path(imported_plugins["map2://juce/nam"]["loader_state"]["selected_asset_path"])
            imported_cab_path = Path(imported_plugins["map2://juce/convolution/cabinet"]["loader_state"]["selected_asset_path"])

            assert imported_nam_path.is_file()
            assert imported_cab_path.is_file()
            assert imported_nam_path == storage_paths[upload_service_module.AssetType.NAM] / nam_source.name
            assert imported_cab_path == storage_paths[upload_service_module.AssetType.CABINET_IR] / cab_source.name
            assert imported_plugins["map2://juce/nam"]["loader_state"]["selected_model"] == "CleanTone"
            assert imported_plugins["map2://juce/convolution/cabinet"]["loader_state"]["selected_ir"] == "Mesa"

            nam_models = await session.execute(select(database_module.NAMModel))
            records = nam_models.scalars().all()
            assert len(records) == 1
            assert records[0].file_path == str(imported_nam_path)

    asyncio.run(_run())


def test_snapshot_service_io_defaults_are_inherited_and_applied_on_activation(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    applied_devices: list[str] = []

    class _FakeConfig:
        def get(self, key, default=None):
            if key == snapshot_service_module.SNAPSHOT_DEFAULT_INPUT_DEVICE_CONFIG_KEY:
                return "Default Input"
            if key == snapshot_service_module.SNAPSHOT_DEFAULT_OUTPUT_DEVICE_CONFIG_KEY:
                return "Default Output"
            if key == snapshot_service_module.SNAPSHOT_DEFAULT_MONITORING_OUTPUT_INDEX_CONFIG_KEY:
                return 6
            return default

    class _AudioInventoryStub:
        is_available = True

        def get_system_info(self):
            return {
                "available_input_devices": ["Default Input"],
                "available_output_devices": ["Default Output"],
            }

    class _AudioEngineStub:
        async def set_audio_device(self, device_name):
            applied_devices.append(device_name)
            return True

        async def get_topology_mutation_stats(self):
            return None

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 0, 0

    async def _healthy_channels(self, *, live_snapshot_payload):
        return {
            "snapshot_payload": live_snapshot_payload,
            "active_count": 0,
            "total_count": 0,
            "inactive_channels": [],
            "inactive_messages": [],
        }

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_config", lambda: _FakeConfig())
    monkeypatch.setattr(snapshot_service_module, "get_audio_engine", lambda: _AudioEngineStub())
    monkeypatch.setattr("app.services.engine_runtime_facade.get_engine_service", lambda: _AudioInventoryStub())
    monkeypatch.setattr(SnapshotRuntimeStateService, "assert_snapshot_channels_active", _healthy_channels)
    monkeypatch.setattr(
        runtime_state_service_module,
        "schedule_post_activation_health_check",
        lambda **kwargs: None,
    )

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            created = await service.create_snapshot(name="DefaultsSnapshot")
            assert created["input_device"] == "Default Input"
            assert created["output_device"] == "Default Output"
            assert created["io_bindings"]["input_device"] == "Default Input"
            assert created["io_bindings"]["output_device"] == "Default Output"
            assert created["controls"]["monitoring_output_index"] == 6
            assert created["io_bindings"]["monitoring_output_index"] == 6

            activated = await service.activate_snapshot(created["id"])
            assert activated is not None
            assert applied_devices == ["Default Output"]

    asyncio.run(_run())


def test_snapshot_service_auto_tags_filtering_and_plugin_mutations(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            created = await service.create_snapshot(
                name="AutoTaggedSnapshot",
                tags=["manual"],
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-0",
                            "label": "A",
                            "color": "#2563eb",
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Chain A",
                            "plugins": [
                                {"uri": "map2://juce/nam", "position": 0, "bypass": False, "parameters": {}},
                                {"uri": "map2://juce/convolution/cabinet", "position": 1, "bypass": False, "parameters": {}, "loader_state": {"ir_type": "cabinet"}},
                                {"uri": "map2://juce/delay", "position": 2, "bypass": False, "parameters": {}},
                                {"uri": "map2://juce/modulation/chorus", "position": 3, "bypass": False, "parameters": {}},
                                {"uri": "map2://juce/dynamics/compressor", "position": 4, "bypass": False, "parameters": {}},
                                {"uri": "urn:test:overdrive", "name": "Overdrive", "position": 5, "bypass": False, "parameters": {}},
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-0",
                        "blend_positions": {"channel-0": 100.0},
                        "series_order": ["channel-0"],
                    },
                    "midi_map": [],
                },
            )
            assert created["tags"] == ["nam", "cabinet-ir", "delay", "compressor", "drive", "modulation"]

            filtered = await service.list_snapshots(tags=["delay", "modulation"])
            assert [snapshot["id"] for snapshot in filtered] == [created["id"]]

            updated = await service.update_snapshot(
                created["id"],
                tags=["still-manual"],
                detail_payload={
                    "channels": created["channels"],
                    "chains": [
                        {
                            "id": created["chains"][0]["id"],
                            "name": "Chain A",
                            "plugins": [
                                {"uri": "map2://juce/convolution/reverb", "position": 0, "bypass": False, "parameters": {}, "loader_state": {"ir_type": "reverb"}},
                                {"uri": "map2://juce/modulation/phaser", "position": 1, "bypass": False, "parameters": {}},
                            ],
                        }
                    ],
                    "routing": created["routing"],
                    "midi_map": created["midi_map"],
                },
            )
            assert updated is not None
            assert updated["tags"] == ["reverb", "modulation"]

            preserved = await service.update_snapshot(created["id"], is_favorite=True, tags=["ignored"])
            assert preserved is not None
            assert preserved["tags"] == ["reverb", "modulation"]

            chain_id = updated["chains"][0]["id"]
            plugin_added = await service.add_plugin(
                created["id"],
                chain_id,
                "map2://juce/dynamics/compressor",
                plugin_name="Compressor",
            )
            assert plugin_added is not None
            assert plugin_added["tags"] == ["reverb", "compressor", "modulation"]

            latest_detail = await service.get_snapshot(created["id"])
            assert latest_detail is not None
            chain_id = latest_detail["chains"][0]["id"]
            latest_chain = await service._get_chain(created["id"], chain_id)
            assert latest_chain is not None
            compressor_id = next(
                plugin.id
                for plugin in latest_chain.plugins
                if plugin.plugin_uri == "map2://juce/dynamics/compressor"
            )
            plugin_removed = await service.remove_plugin(created["id"], chain_id, compressor_id)
            assert plugin_removed is not None
            assert plugin_removed["tags"] == ["reverb", "modulation"]

    asyncio.run(_run())


def test_deactivate_snapshot_runtime_chain_removes_live_path(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 0, 0

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())

    async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    async def _run():
        async with database_module.get_session() as session:
            snapshot_service = SnapshotService(session)
            chain_service = ChainService(session)

            created = await snapshot_service.create_snapshot(
                name="KillableSnapshot",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-a",
                            "label": "A",
                            "color": "#2563eb",
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Chain A",
                            "plugins": [
                                {
                                    "uri": "urn:test:plugin",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"gain": 0.5},
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 100.0},
                        "series_order": ["channel-a"],
                    },
                },
            )

            activated = await snapshot_service.activate_snapshot(created["id"])
            assert activated is not None
            runtime_chain_id = activated["snapshot_data"]["live_state"]["paths"][0]["runtime_chain_id"]
            assert runtime_chain_id is not None

            deactivated = await chain_service.deactivate_chain(runtime_chain_id)
            assert deactivated is True

            live_snapshot = await snapshot_service.get_live_snapshot()
            assert live_snapshot is not None
            assert live_snapshot["live_state"]["paths"] == []
            assert live_snapshot["live_state"]["runtime_chains"] == []
            assert live_snapshot["paths"][0]["runtime_chain_id"] is None

            runtime_chain = await chain_service.get_chain(runtime_chain_id)
            assert runtime_chain is not None
            assert runtime_chain["is_active"] is False
            assert runtime_chain["runtime_sync"]["status"] == "inactive"

    monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)
    asyncio.run(_run())


def test_activate_snapshot_reuses_runtime_chains_for_same_topology(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    applied_payloads: list[dict[str, object]] = []

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(snapshot_data):
        applied_payloads.append(json.loads(json.dumps(snapshot_data)))
        return 1, 1

    async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            current_live = await service.create_snapshot(
                name="CurrentLive",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-a",
                            "label": "Clean",
                            "color": "#2563eb",
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Drive Chain",
                            "plugins": [
                                {
                                    "uri": "urn:test:plugin",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"gain": 0.25},
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 100.0},
                        "series_order": ["channel-a"],
                    },
                },
                apply_default_system_blocks=False,
            )

            activated_live = await service.activate_snapshot(current_live["id"])
            assert activated_live is not None
            assert activated_live["topology_reused"] is False
            runtime_chain_id = activated_live["snapshot_data"]["live_state"]["paths"][0]["runtime_chain_id"]
            assert runtime_chain_id is not None

            next_snapshot = await service.create_snapshot(
                name="NextLive",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-b",
                            "label": "Lead",
                            "color": "#fa4d56",
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Lead Chain",
                            "plugins": [
                                {
                                    "uri": "urn:test:plugin",
                                    "position": 0,
                                    "bypass": True,
                                    "parameters": {"gain": 0.85},
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-b",
                        "blend_positions": {"channel-b": 100.0},
                        "series_order": ["channel-b"],
                    },
                },
                apply_default_system_blocks=False,
            )

            async def _unexpected_clear():
                raise AssertionError("same-topology activation should not clear runtime chains")

            async def _unexpected_materialize(_snapshot, _detail):
                raise AssertionError("same-topology activation should not materialize new runtime chains")

            monkeypatch.setattr(service, "_clear_materialized_runtime_chains", _unexpected_clear)
            monkeypatch.setattr(service, "_materialize_live_state", _unexpected_materialize)

            activated_next = await service.activate_snapshot(next_snapshot["id"])
            assert activated_next is not None
            assert activated_next["topology_reused"] is True
            assert activated_next["snapshot_data"]["live_state"]["paths"][0]["runtime_chain_id"] == runtime_chain_id
            assert activated_next["snapshot_data"]["live_state"]["paths"][0]["path_id"] == "channel-b"
            assert activated_next["snapshot_data"]["live_state"]["paths"][0]["runtime_chain_name"] == "Lead Chain (Lead)"

            result = await session.execute(select(database_module.Chain).filter(database_module.Chain.id == runtime_chain_id))
            runtime_chain = result.scalar_one()
            runtime_config = ChainService._parse_chain_config(runtime_chain.config)
            assert runtime_config["snapshot_id"] == next_snapshot["id"]
            assert runtime_config["path_id"] == "channel-b"
            assert runtime_config["snapshot_chain_id"] == activated_next["snapshot_data"]["paths"][0]["snapshot_chain_id"]
            assert runtime_chain.name == "Lead Chain (Lead)"

            runtime_chain_detail = await ChainService(session).get_chain(runtime_chain_id)
            assert runtime_chain_detail is not None
            assert runtime_chain_detail["plugins"][0]["uri"] == "urn:test:plugin"
            assert runtime_chain_detail["plugins"][0]["bypassed"] is True

            assert applied_payloads[-1]["flowSlots"][0]["label"] == "Lead"
            applied_plugin = applied_payloads[-1]["chains"][str(activated_next["snapshot_data"]["paths"][0]["snapshot_chain_id"])]["plugins"][0]
            assert applied_plugin["parameters"] == {"gain": 0.85}
            assert applied_plugin["bypass"] is True

    asyncio.run(_run())


def test_activate_snapshot_reuses_runtime_chains_when_authority_has_no_snapshot(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    applied_payloads: list[dict[str, object]] = []

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(snapshot_data):
        applied_payloads.append(json.loads(json.dumps(snapshot_data)))
        return 1, 1

    async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    class _AuthorityWithoutCommittedSnapshot:
        async def get_committed_state(self):
            return SimpleNamespace(value=SimpleNamespace(source_snapshot=None))

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)
    monkeypatch.setattr(
        audio_state_authority_module,
        "AudioStateAuthorityService",
        lambda *args, **kwargs: _AuthorityWithoutCommittedSnapshot(),
    )

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            current_live = await service.create_snapshot(
                name="CurrentAuthorityGap",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-a",
                            "label": "Clean",
                            "color": "#2563eb",
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Drive Chain",
                            "plugins": [
                                {
                                    "uri": "urn:test:plugin",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"gain": 0.25},
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 100.0},
                        "series_order": ["channel-a"],
                    },
                },
                apply_default_system_blocks=False,
            )

            activated_live = await service.activate_snapshot(current_live["id"])
            assert activated_live is not None
            assert activated_live["topology_reused"] is False
            runtime_chain_id = activated_live["snapshot_data"]["live_state"]["paths"][0]["runtime_chain_id"]
            assert runtime_chain_id is not None

            live_snapshot = await service.get_live_snapshot()
            assert live_snapshot is not None
            assert live_snapshot["id"] == current_live["id"]

            next_snapshot = await service.create_snapshot(
                name="NextAuthorityGap",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-b",
                            "label": "Lead",
                            "color": "#fa4d56",
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Lead Chain",
                            "plugins": [
                                {
                                    "uri": "urn:test:plugin",
                                    "position": 0,
                                    "bypass": True,
                                    "parameters": {"gain": 0.85},
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-b",
                        "blend_positions": {"channel-b": 100.0},
                        "series_order": ["channel-b"],
                    },
                },
                apply_default_system_blocks=False,
            )

            activated_next = await service.activate_snapshot(next_snapshot["id"])
            assert activated_next is not None
            assert activated_next["topology_reused"] is True
            assert activated_next["snapshot_data"]["live_state"]["paths"][0]["runtime_chain_id"] == runtime_chain_id
            assert applied_payloads[-1]["flowSlots"][0]["label"] == "Lead"

    asyncio.run(_run())


def test_activate_snapshot_schedules_background_preload(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    scheduled_preloads: list[int] = []

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 0, 0

    async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(snapshot_service_module, "schedule_snapshot_preload_for_live_snapshot", lambda snapshot_id: scheduled_preloads.append(int(snapshot_id)))
    monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="LiveNow",
                program_number=10,
                detail_payload={
                    "channels": [{"channel_key": "channel-a", "label": "A", "chain_id": 1}],
                    "chains": [{"id": 1, "name": "Drive", "plugins": [{"uri": "urn:test:plugin", "position": 0}]}],
                    "routing": {"mode": "series", "active_channel_key": "channel-a", "series_order": ["channel-a"]},
                },
                apply_default_system_blocks=False,
            )

            activated = await service.activate_snapshot(created["id"])
            assert activated is not None

    asyncio.run(_run())
    assert scheduled_preloads == [1]


def test_activate_snapshot_publishes_desired_state_to_audio_authority(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    published_desired: list[object] = []

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 0, 0

    async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    class _AuthorityCapture:
        async def get_committed_state(self):
            raise audio_state_authority_module.AudioStateAuthorityError("No committed authoritative audio state exists in etcd")

        async def get_desired_state(self):
            raise audio_state_authority_module.AudioStateAuthorityError("No desired audio state exists in etcd")

        async def put_desired_state(self, desired):
            published_desired.append(desired)
            return SimpleNamespace(value=desired)

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)
    monkeypatch.setattr(
        audio_state_authority_module,
        "AudioStateAuthorityService",
        lambda *args, **kwargs: _AuthorityCapture(),
    )

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="AuthorityLive",
                program_number=12,
                detail_payload={
                    "channels": [{"channel_key": "channel-a", "label": "A", "chain_id": 1}],
                    "chains": [{"id": 1, "name": "Chain A", "plugins": [{"uri": "urn:test:plugin", "position": 0}]}],
                    "routing": {"mode": "parallel_blend", "active_channel_key": "channel-a", "series_order": ["channel-a"]},
                },
                apply_default_system_blocks=False,
            )

            activated = await service.activate_snapshot(created["id"])
            assert activated is not None

    asyncio.run(_run())

    assert len(published_desired) == 1
    desired = published_desired[0]
    assert desired.snapshot_id == 1
    assert desired.routing.mode == "parallel_blend"
    assert desired.routing.active_path_ids == ["channel-a"]


def test_activate_snapshot_preserves_existing_authority_extensions_when_publishing_desired_state(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    published_desired: list[object] = []

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 0, 0

    async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    class _AuthorityCapture:
        async def get_committed_state(self):
            return SimpleNamespace(
                value=SimpleNamespace(
                    desired=SimpleNamespace(
                        extensions={
                            "performance_brain": {
                                "instances": {
                                    "instance-17__position-3": {
                                        "runtime_instance_id": "instance-17__position-3",
                                        "instance_id": "17",
                                        "plugin_position": 3,
                                    }
                                }
                            }
                        }
                    ),
                    extensions={},
                )
            )

        async def get_desired_state(self):
            raise audio_state_authority_module.AudioStateAuthorityError("No desired audio state exists in etcd")

        async def put_desired_state(self, desired):
            published_desired.append(desired)
            return SimpleNamespace(value=desired)

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)
    monkeypatch.setattr(
        audio_state_authority_module,
        "AudioStateAuthorityService",
        lambda *args, **kwargs: _AuthorityCapture(),
    )

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="AuthorityLiveBrain",
                program_number=13,
                detail_payload={
                    "channels": [{"channel_key": "channel-a", "label": "A", "chain_id": 1}],
                    "chains": [{"id": 1, "name": "Chain A", "plugins": [{"uri": "urn:test:plugin", "position": 0}]}],
                    "routing": {"mode": "series", "active_channel_key": "channel-a", "series_order": ["channel-a"]},
                },
                apply_default_system_blocks=False,
            )

            activated = await service.activate_snapshot(created["id"])
            assert activated is not None

    asyncio.run(_run())

    assert len(published_desired) == 1
    desired = published_desired[0]
    assert desired.extensions["performance_brain"]["instances"]["instance-17__position-3"]["instance_id"] == "17"
    assert desired.extensions["performance_brain"]["instances"]["instance-17__position-3"]["plugin_position"] == 3


def test_create_snapshot_captures_current_authority_extensions_when_detail_omits_them(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    class _AuthorityCapture:
        async def get_committed_state(self):
            return SimpleNamespace(
                value=SimpleNamespace(
                    desired=SimpleNamespace(
                        extensions={
                            "performance_brain": {
                                "instances": {
                                    "instance-17__position-3": {
                                        "runtime_instance_id": "instance-17__position-3",
                                        "instance_id": "17",
                                        "plugin_position": 3,
                                    }
                                }
                            }
                        }
                    ),
                    extensions={},
                )
            )

        async def get_desired_state(self):
            raise audio_state_authority_module.AudioStateAuthorityError("No desired audio state exists in etcd")

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(
        audio_state_authority_module,
        "AudioStateAuthorityService",
        lambda *args, **kwargs: _AuthorityCapture(),
    )

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="CapturedBrainSnapshot",
                program_number=14,
                detail_payload={
                    "channels": [{"channel_key": "channel-a", "label": "A", "chain_id": 1}],
                    "chains": [{"id": 1, "name": "Chain A", "plugins": [{"uri": "urn:test:plugin", "position": 0}]}],
                    "routing": {"mode": "series", "active_channel_key": "channel-a", "series_order": ["channel-a"]},
                },
                apply_default_system_blocks=False,
            )

            fetched = await service.get_snapshot(created["id"])
            assert fetched is not None
            assert created["extensions"]["performance_brain"]["instances"]["instance-17__position-3"]["instance_id"] == "17"
            assert fetched["extensions"]["performance_brain"]["instances"]["instance-17__position-3"]["plugin_position"] == 3

    asyncio.run(_run())


def test_snapshot_revision_round_trips_snapshot_owned_extensions(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="RevisionBrainSnapshot",
                program_number=15,
                detail_payload={
                    "channels": [{"channel_key": "channel-a", "label": "A", "chain_id": 1}],
                    "chains": [{"id": 1, "name": "Chain A", "plugins": [{"uri": "urn:test:plugin", "position": 0}]}],
                    "routing": {"mode": "series", "active_channel_key": "channel-a", "series_order": ["channel-a"]},
                    "extensions": {
                        "performance_brain": {
                            "instances": {
                                "instance-17__position-3": {
                                    "runtime_instance_id": "instance-17__position-3",
                                    "instance_id": "17",
                                    "plugin_position": 3,
                                }
                            }
                        }
                    },
                },
                apply_default_system_blocks=False,
            )

            updated = await service.update_snapshot(
                created["id"],
                detail_payload={
                    "channels": created["channels"],
                    "chains": created["chains"],
                    "routing": created["routing"],
                    "midi_map": created["midi_map"],
                    "extensions": {
                        "performance_brain": {
                            "instances": {
                                "instance-18__position-4": {
                                    "runtime_instance_id": "instance-18__position-4",
                                    "instance_id": "18",
                                    "plugin_position": 4,
                                }
                            }
                        }
                    },
                },
                create_revision=True,
                capture_current_authority_extensions=False,
            )

            assert updated is not None
            assert updated["snapshot_revision"] != created["snapshot_revision"]
            assert updated["extensions"]["performance_brain"]["instances"]["instance-18__position-4"]["instance_id"] == "18"

            restored = await service.restore_revision(created["id"], 1)
            assert restored is not None
            assert restored["extensions"]["performance_brain"]["instances"]["instance-17__position-3"]["plugin_position"] == 3
            assert "instance-18__position-4" not in restored["extensions"]["performance_brain"]["instances"]

    asyncio.run(_run())


def test_activate_snapshot_rehydrates_local_brain_runtime_and_broadcasts_runtime_updates(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    published_desired: list[object] = []

    class _FakeWsManager:
        def __init__(self) -> None:
            self.messages = []

        async def broadcast_json(self, data, topic=None):
            self.messages.append({"topic": topic, "message": data})

    fake_ws_manager = _FakeWsManager()
    brain_service = performance_brain_service_module.PerformanceBrainService(root_path=tmp_path / "brain-runtime")
    brain_service.update_state(
        performance_brain_service_module.BrainStateUpdateModel(set_name="Locally Drifted Brain", active_slot=1),
        instance_id="17",
        plugin_position=3,
    )
    brain_service.update_state(
        performance_brain_service_module.BrainStateUpdateModel(set_name="Stale Previous Snapshot Brain", active_slot=5),
        instance_id="22",
        plugin_position=5,
    )

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 0, 0

    async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    class _AuthorityCapture:
        async def get_committed_state(self):
            return SimpleNamespace(
                value=SimpleNamespace(
                    desired=SimpleNamespace(
                        extensions={
                            "performance_brain": {
                                "instances": {
                                    "instance-22__position-5": {
                                        "runtime_instance_id": "instance-22__position-5",
                                        "instance_id": "22",
                                        "plugin_position": 5,
                                        "state": brain_service.get_state(instance_id="22", plugin_position=5),
                                    }
                                }
                            }
                        }
                    ),
                    extensions={},
                )
            )

        async def get_desired_state(self):
            raise audio_state_authority_module.AudioStateAuthorityError("No desired audio state exists in etcd")

        async def put_desired_state(self, desired):
            published_desired.append(desired)
            return SimpleNamespace(value=desired)

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)
    monkeypatch.setattr(
        audio_state_authority_module,
        "AudioStateAuthorityService",
        lambda *args, **kwargs: _AuthorityCapture(),
    )
    monkeypatch.setattr(performance_brain_service_module, "get_performance_brain_service", lambda: brain_service)
    monkeypatch.setattr(performance_brain_authority_sync_module, "get_performance_brain_service", lambda: brain_service)
    monkeypatch.setattr(websocket_manager_module, "ws_manager", fake_ws_manager)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="BrainRuntimeSnapshot",
                program_number=16,
                detail_payload={
                    "channels": [{"channel_key": "channel-a", "label": "A", "chain_id": 1}],
                    "chains": [{"id": 1, "name": "Chain A", "plugins": [{"uri": "urn:test:plugin", "position": 0}]}],
                    "routing": {"mode": "series", "active_channel_key": "channel-a", "series_order": ["channel-a"]},
                    "extensions": {
                        "performance_brain": {
                            "instances": {
                                "instance-17__position-3": {
                                    "runtime_instance_id": "instance-17__position-3",
                                    "instance_id": "17",
                                    "plugin_position": 3,
                                    "state": {
                                        **brain_service.get_state(instance_id="17", plugin_position=3),
                                        "set_name": "Snapshot Runtime Brain",
                                        "active_slot": 7,
                                    },
                                }
                            }
                        }
                    },
                },
                apply_default_system_blocks=False,
            )

            activated = await service.activate_snapshot(created["id"])
            assert activated is not None
            assert activated["runtime_live_state"]["runtime_metrics"]["performance_brain_runtime"]["reconciled"] is True
            assert activated["runtime_live_state"]["runtime_metrics"]["performance_brain_runtime"]["restored"] == [
                {
                    "runtime_instance_id": "instance-17__position-3",
                    "instance_id": "17",
                    "plugin_position": 3,
                }
            ]
            assert activated["runtime_live_state"]["runtime_metrics"]["performance_brain_runtime"]["reset"] == [
                {
                    "runtime_instance_id": "instance-22__position-5",
                    "instance_id": "22",
                    "plugin_position": 5,
                }
            ]

    asyncio.run(_run())

    assert published_desired
    desired_instances = published_desired[-1].extensions["performance_brain"]["instances"]
    assert set(desired_instances) == {"instance-17__position-3"}
    assert brain_service.get_state(instance_id="17", plugin_position=3)["set_name"] == "Snapshot Runtime Brain"
    assert brain_service.get_state(instance_id="17", plugin_position=3)["active_slot"] == 7
    assert brain_service.get_state(instance_id="22", plugin_position=5)["set_name"] == "Init Performance Brain"

    brain_runtime_messages = [
        message
        for message in fake_ws_manager.messages
        if message["topic"] == performance_brain_service_module.BRAIN_RUNTIME_TOPIC
    ]
    assert len(brain_runtime_messages) == 2
    assert {
        message["message"]["data"]["scope"]["runtime_instance_id"]
        for message in brain_runtime_messages
    } == {"instance-17__position-3", "instance-22__position-5"}


def test_update_routing_publishes_desired_state_for_live_snapshot(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    published_desired: list[object] = []

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 0, 0

    async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    class _AuthorityCapture:
        async def get_committed_state(self):
            raise audio_state_authority_module.AudioStateAuthorityError("No committed authoritative audio state exists in etcd")

        async def get_desired_state(self):
            raise audio_state_authority_module.AudioStateAuthorityError("No desired audio state exists in etcd")

        async def put_desired_state(self, desired):
            published_desired.append(desired)
            return SimpleNamespace(value=desired)

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)
    monkeypatch.setattr(
        audio_state_authority_module,
        "AudioStateAuthorityService",
        lambda *args, **kwargs: _AuthorityCapture(),
    )

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="RoutingLive",
                detail_payload={
                    "channels": [{"channel_key": "channel-a", "label": "A", "chain_id": 1}],
                    "chains": [{"id": 1, "name": "Chain A", "plugins": [{"uri": "urn:test:plugin", "position": 0}]}],
                    "routing": {"mode": "parallel_blend", "active_channel_key": "channel-a", "series_order": ["channel-a"]},
                },
                apply_default_system_blocks=False,
            )

            activated = await service.activate_snapshot(created["id"])
            assert activated is not None
            published_desired.clear()

            updated = await service.update_routing(
                created["id"],
                {
                    "mode": "series",
                    "active_channel_key": "channel-a",
                    "series_order": ["channel-a"],
                },
            )
            assert updated is not None
            assert updated["routing"]["mode"] == "series"

            runtime_payload = await SnapshotRuntimeStateService(session).get_live_snapshot_payload()
            assert runtime_payload is not None
            assert runtime_payload["routing"]["mode"] == "series"

    asyncio.run(_run())

    assert len(published_desired) == 1
    desired = published_desired[0]
    assert desired.routing.mode == "series"
    assert desired.routing.path_order == ["channel-a"]


def test_preload_next_snapshot_records_ready_runtime_metrics_for_program_order(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    staged_payloads: list[list[dict[str, object]]] = []

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 0, 0

    async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    async def _fake_stage_detached(self, chain_plugins):
        staged_payloads.append(
            [
                {
                    "plugin_uri": str(getattr(plugin, "plugin_uri", "")),
                    "position": int(getattr(plugin, "position", 0)),
                    "selected_asset_path": getattr(plugin, "selected_asset_path", None),
                }
                for plugin in chain_plugins
            ]
        )
        return {
            "enabled": True,
            "status": "ready",
            "runtime_items": 0,
            "warnings": [],
            "restored_positions": [0],
            "missing_positions": [],
            "staged_instance_ids": [601],
        }

    async def _fake_release_detached(self, instance_ids):
        return {
            "released_instance_ids": list(instance_ids),
            "skipped_active_instance_ids": [],
            "missing_instance_ids": [],
            "warnings": [],
        }

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(snapshot_service_module, "schedule_snapshot_preload_for_live_snapshot", lambda _snapshot_id: None)
    monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)
    monkeypatch.setattr(ChainService, "stage_detached_chain_plugins", _fake_stage_detached)
    monkeypatch.setattr(ChainService, "release_detached_instance_ids", _fake_release_detached)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            live_snapshot = await service.create_snapshot(
                name="VerseA",
                program_number=10,
                detail_payload={
                    "channels": [{"channel_key": "channel-a", "label": "A", "chain_id": 1}],
                    "chains": [{"id": 1, "name": "Chain A", "plugins": [{"uri": "urn:test:plugin", "position": 0}]}],
                    "routing": {"mode": "series", "active_channel_key": "channel-a", "series_order": ["channel-a"]},
                },
                apply_default_system_blocks=False,
            )
            next_snapshot = await service.create_snapshot(
                name="VerseB",
                program_number=11,
                detail_payload={
                    "channels": [{"channel_key": "channel-b", "label": "B", "chain_id": 1}],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Chain B",
                            "plugins": [
                                {
                                    "uri": "map2://juce/nam",
                                    "position": 0,
                                    "loader_state": {"selected_asset_path": "/tmp/preloaded-next.nam"},
                                }
                            ],
                        }
                    ],
                    "routing": {"mode": "series", "active_channel_key": "channel-b", "series_order": ["channel-b"]},
                },
                apply_default_system_blocks=False,
            )

            activated = await service.activate_snapshot(live_snapshot["id"])
            assert activated is not None

            preload = await service.preload_next_snapshot_for_live_snapshot(live_snapshot["id"])
            assert preload == {
                "status": "ready",
                "source_snapshot_id": live_snapshot["id"],
                "target_snapshot_id": next_snapshot["id"],
                "target_snapshot_name": "VerseB",
                "candidate_reason": "program_number",
                "staged_instance_ids": [601],
                "warnings": [],
                "prepared_at": preload["prepared_at"],
            }
            assert preload["prepared_at"]

            runtime_state = await SnapshotRuntimeStateService(session).get_live_state()
            assert runtime_state["runtime_metrics"]["preload"]["target_snapshot_id"] == next_snapshot["id"]
            assert runtime_state["runtime_metrics"]["preload"]["target_snapshot_name"] == "VerseB"
            assert runtime_state["runtime_metrics"]["preload"]["candidate_reason"] == "program_number"
            assert runtime_state["runtime_metrics"]["preload"]["staged_instance_ids"] == [601]

    asyncio.run(_run())

    assert staged_payloads == [[
        {
            "plugin_uri": "map2://juce/nam",
            "position": 0,
            "selected_asset_path": "/tmp/preloaded-next.nam",
        }
    ]]


def test_preload_next_snapshot_falls_back_to_display_order_when_program_numbers_missing(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 0, 0

    async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    async def _fake_stage_detached(self, chain_plugins):
        return {
            "enabled": True,
            "status": "ready",
            "runtime_items": 0,
            "warnings": [],
            "restored_positions": [int(getattr(chain_plugins[0], "position", 0))] if chain_plugins else [],
            "missing_positions": [],
            "staged_instance_ids": [777],
        }

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(snapshot_service_module, "schedule_snapshot_preload_for_live_snapshot", lambda _snapshot_id: None)
    monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)
    monkeypatch.setattr(ChainService, "stage_detached_chain_plugins", _fake_stage_detached)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            first = await service.create_snapshot(
                name="OrderOne",
                detail_payload={
                    "channels": [{"channel_key": "a", "label": "A", "chain_id": 1}],
                    "chains": [{"id": 1, "name": "A", "plugins": [{"uri": "urn:test:plugin", "position": 0}]}],
                    "routing": {"mode": "series", "active_channel_key": "a", "series_order": ["a"]},
                },
                apply_default_system_blocks=False,
            )
            second = await service.create_snapshot(
                name="OrderTwo",
                detail_payload={
                    "channels": [{"channel_key": "b", "label": "B", "chain_id": 1}],
                    "chains": [{"id": 1, "name": "B", "plugins": [{"uri": "urn:test:plugin", "position": 0}]}],
                    "routing": {"mode": "series", "active_channel_key": "b", "series_order": ["b"]},
                },
                apply_default_system_blocks=False,
            )
            await service.update_snapshot(first["id"], display_order=10)
            await service.update_snapshot(second["id"], display_order=20)

            activated = await service.activate_snapshot(first["id"])
            assert activated is not None

            preload = await service.preload_next_snapshot_for_live_snapshot(first["id"])
            assert preload is not None
            assert preload["target_snapshot_id"] == second["id"]
            assert preload["candidate_reason"] == "display_order"

    asyncio.run(_run())


def test_activate_snapshot_consumes_preloaded_instances_on_preload_hit(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    preferred_calls: list[list[int]] = []
    release_calls: list[list[int]] = []

    class _PreloadRuntimeEngineStub:
        is_available = True
        is_running = True

        async def get_topology_mutation_stats(self):
            return {
                "mutation_count": 0,
                "no_op_skip_count": 0,
                "last_mutation_duration_ms": 0.0,
                "peak_mutation_duration_ms": 0.0,
                "avg_mutation_duration_ms": 0.0,
                "last_removed_connection_count": 0,
                "last_added_connection_count": 0,
                "last_chain_size": 0,
                "last_parallel_group_count": 0,
            }

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 0, 0

    async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        preferred_calls.append(list(preferred_detached_instance_ids or []))
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    async def _fake_release_detached(self, instance_ids):
        release_calls.append(list(instance_ids))
        return {
            "released_instance_ids": [],
            "skipped_active_instance_ids": list(instance_ids),
            "missing_instance_ids": [],
            "warnings": [],
        }

    async def _fake_push_footswitch_labels(**_kwargs):
        return {"labels_pushed": 0, "device_count": 0, "devices": [], "lcd_updated": False}

    async def _fake_push_controller_display(**_kwargs):
        return {"slots_pushed": 0, "device_count": 0, "devices": []}

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(snapshot_service_module, "get_audio_engine", lambda: _PreloadRuntimeEngineStub())
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_footswitch_labels", _fake_push_footswitch_labels)
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_controller_display_preview", _fake_push_controller_display)
    monkeypatch.setattr(snapshot_service_module, "schedule_snapshot_preload_for_live_snapshot", lambda _snapshot_id: None)
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)
    monkeypatch.setattr(ChainService, "release_detached_instance_ids", _fake_release_detached)

    async def _reuse_disabled(self, *_args, **_kwargs):
        return None

    monkeypatch.setattr(SnapshotService, "_reuse_live_runtime_chains", _reuse_disabled)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            live_snapshot = await service.create_snapshot(
                name="LiveVerse",
                program_number=10,
                detail_payload={
                    "channels": [{"channel_key": "live-a", "label": "A", "chain_id": 1}],
                    "chains": [{"id": 1, "name": "Live Chain", "plugins": [{"uri": "urn:test:live", "position": 0}]}],
                    "routing": {"mode": "series", "active_channel_key": "live-a", "series_order": ["live-a"]},
                },
                apply_default_system_blocks=False,
            )
            target_snapshot = await service.create_snapshot(
                name="TargetVerse",
                program_number=11,
                detail_payload={
                    "channels": [
                        {"channel_key": "target-a", "label": "A", "chain_id": 1},
                        {"channel_key": "target-b", "label": "B", "chain_id": 2},
                    ],
                    "chains": [
                        {"id": 1, "name": "Chain A", "plugins": [{"uri": "urn:test:a", "position": 0}]},
                        {"id": 2, "name": "Chain B", "plugins": [{"uri": "urn:test:b", "position": 0}]},
                    ],
                    "routing": {"mode": "series", "active_channel_key": "target-a", "series_order": ["target-a", "target-b"]},
                },
                apply_default_system_blocks=False,
            )

            activated_live = await service.activate_snapshot(live_snapshot["id"])
            assert activated_live is not None
            preferred_calls.clear()
            release_calls.clear()

            runtime_service = SnapshotRuntimeStateService(session)
            live_payload = await runtime_service.get_live_snapshot_payload()
            live_state = await runtime_service.get_live_state()
            await runtime_service.sync_live_snapshot_payload(
                snapshot_id=live_snapshot["id"],
                live_snapshot_payload=live_payload,
                snapshot_revision=live_payload.get("snapshot_revision"),
                runtime_metrics={
                    **dict(live_state.get("runtime_metrics") or {}),
                    "preload": {
                        "status": "ready",
                        "source_snapshot_id": live_snapshot["id"],
                        "target_snapshot_id": target_snapshot["id"],
                        "target_snapshot_name": "TargetVerse",
                        "candidate_reason": "program_number",
                        "staged_instance_ids": [501, 502],
                        "warnings": [],
                        "prepared_at": "2026-04-05T00:00:00",
                    },
                },
            )

            activated_target = await service.activate_snapshot(target_snapshot["id"])
            assert activated_target is not None
            assert activated_target["runtime_live_state"]["runtime_metrics"]["preload_hit"] is True

    asyncio.run(_run())

    assert preferred_calls == [[501], [502]]
    assert release_calls == [[501, 502]]


def test_activate_snapshot_releases_stale_preloaded_instances_when_target_differs(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    preferred_calls: list[list[int]] = []
    release_calls: list[list[int]] = []

    class _PreloadRuntimeEngineStub:
        is_available = True
        is_running = True

        async def get_topology_mutation_stats(self):
            return {
                "mutation_count": 0,
                "no_op_skip_count": 0,
                "last_mutation_duration_ms": 0.0,
                "peak_mutation_duration_ms": 0.0,
                "avg_mutation_duration_ms": 0.0,
                "last_removed_connection_count": 0,
                "last_added_connection_count": 0,
                "last_chain_size": 0,
                "last_parallel_group_count": 0,
            }

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 0, 0

    async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        preferred_calls.append(list(preferred_detached_instance_ids or []))
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    async def _fake_release_detached(self, instance_ids):
        release_calls.append(list(instance_ids))
        return {
            "released_instance_ids": list(instance_ids),
            "skipped_active_instance_ids": [],
            "missing_instance_ids": [],
            "warnings": [],
        }

    async def _fake_push_footswitch_labels(**_kwargs):
        return {"labels_pushed": 0, "device_count": 0, "devices": [], "lcd_updated": False}

    async def _fake_push_controller_display(**_kwargs):
        return {"slots_pushed": 0, "device_count": 0, "devices": []}

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(snapshot_service_module, "get_audio_engine", lambda: _PreloadRuntimeEngineStub())
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_footswitch_labels", _fake_push_footswitch_labels)
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_controller_display_preview", _fake_push_controller_display)
    monkeypatch.setattr(snapshot_service_module, "schedule_snapshot_preload_for_live_snapshot", lambda _snapshot_id: None)
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)
    monkeypatch.setattr(ChainService, "release_detached_instance_ids", _fake_release_detached)

    async def _reuse_disabled(self, *_args, **_kwargs):
        return None

    monkeypatch.setattr(SnapshotService, "_reuse_live_runtime_chains", _reuse_disabled)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            live_snapshot = await service.create_snapshot(
                name="LiveVerse",
                program_number=10,
                detail_payload={
                    "channels": [{"channel_key": "live-a", "label": "A", "chain_id": 1}],
                    "chains": [{"id": 1, "name": "Live Chain", "plugins": [{"uri": "urn:test:live", "position": 0}]}],
                    "routing": {"mode": "series", "active_channel_key": "live-a", "series_order": ["live-a"]},
                },
                apply_default_system_blocks=False,
            )
            stale_target = await service.create_snapshot(
                name="StaleTarget",
                program_number=11,
                detail_payload={
                    "channels": [{"channel_key": "stale-a", "label": "A", "chain_id": 1}],
                    "chains": [{"id": 1, "name": "Stale Chain", "plugins": [{"uri": "urn:test:stale", "position": 0}]}],
                    "routing": {"mode": "series", "active_channel_key": "stale-a", "series_order": ["stale-a"]},
                },
                apply_default_system_blocks=False,
            )
            other_snapshot = await service.create_snapshot(
                name="OtherTarget",
                program_number=12,
                detail_payload={
                    "channels": [{"channel_key": "other-a", "label": "A", "chain_id": 1}],
                    "chains": [{"id": 1, "name": "Other Chain", "plugins": [{"uri": "urn:test:other", "position": 0}]}],
                    "routing": {"mode": "series", "active_channel_key": "other-a", "series_order": ["other-a"]},
                },
                apply_default_system_blocks=False,
            )

            activated_live = await service.activate_snapshot(live_snapshot["id"])
            assert activated_live is not None
            preferred_calls.clear()
            release_calls.clear()

            runtime_service = SnapshotRuntimeStateService(session)
            live_payload = await runtime_service.get_live_snapshot_payload()
            live_state = await runtime_service.get_live_state()
            await runtime_service.sync_live_snapshot_payload(
                snapshot_id=live_snapshot["id"],
                live_snapshot_payload=live_payload,
                snapshot_revision=live_payload.get("snapshot_revision"),
                runtime_metrics={
                    **dict(live_state.get("runtime_metrics") or {}),
                    "preload": {
                        "status": "ready",
                        "source_snapshot_id": live_snapshot["id"],
                        "target_snapshot_id": stale_target["id"],
                        "target_snapshot_name": "StaleTarget",
                        "candidate_reason": "program_number",
                        "staged_instance_ids": [601],
                        "warnings": [],
                        "prepared_at": "2026-04-05T00:00:00",
                    },
                },
            )

            activated_other = await service.activate_snapshot(other_snapshot["id"])
            assert activated_other is not None
            assert activated_other["runtime_live_state"]["runtime_metrics"]["preload_hit"] is False

    asyncio.run(_run())

    assert preferred_calls == [[]]
    assert release_calls == [[601]]


def test_snapshot_service_activation_rejects_missing_runtime_channels(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 1, 0

    async def _failed_activate_chain(self, chain_id):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = False
            chain.config = json.dumps(
                {
                    "source_kind": "snapshot_path",
                    "snapshot_id": 1,
                    "path_id": "channel-a",
                    "runtime_sync": {
                        "enabled": True,
                        "status": "inactive",
                        "reason": "test_activation_failure",
                        "warnings": [],
                        "runtime_items": 0,
                        "restored_positions": [],
                        "missing_positions": [0],
                    },
                }
            )
            await self.session.flush()
        return False

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(ChainService, "activate_chain", _failed_activate_chain)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            runtime_state_service = SnapshotRuntimeStateService(session)

            created = await service.create_snapshot(
                name="BrokenSnapshot",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-a",
                            "label": "Lead",
                            "color": "#fa4d56",
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Lead Chain",
                            "plugins": [
                                {
                                    "uri": "urn:test:plugin",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"gain": 0.75},
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 100.0},
                        "series_order": ["channel-a"],
                    },
                },
            )

            try:
                await service.activate_snapshot(created["id"])
            except ValueError as exc:
                assert str(exc) == "Channel Lead not loaded."
            else:
                raise AssertionError("Activation should fail when a runtime chain does not come up active")

            assert await service.get_live_snapshot() is None

            runtime_live_state = await runtime_state_service.get_live_state()
            assert runtime_live_state["state"] == "stopped"
            assert runtime_live_state["failure_reason"] == "Channel Lead not loaded."

            activation_events = await runtime_state_service.list_activation_events(limit=10)
            assert activation_events[0]["outcome"] == "failed"
            assert activation_events[0]["failure_reason"] == "Channel Lead not loaded."

    asyncio.run(_run())


def test_snapshot_runtime_health_refresh_marks_live_channels_not_loaded_when_runtime_drops(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 1, 0

    async def _healthy_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
            chain.config = json.dumps(
                {
                    "source_kind": "snapshot_path",
                    "snapshot_id": 1,
                    "path_id": "channel-a",
                    "runtime_sync": {
                        "enabled": True,
                        "status": "active",
                        "warnings": [],
                        "runtime_items": 1,
                        "restored_positions": [0],
                        "missing_positions": [],
                    },
                }
            )
            await self.session.flush()
        return True

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(ChainService, "activate_chain", _healthy_activate_chain)

    async def _run():
        async with database_module.get_session() as session:
            snapshot_service = SnapshotService(session)
            runtime_state_service = SnapshotRuntimeStateService(session)

            created = await snapshot_service.create_snapshot(
                name="WatchSnapshot",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-a",
                            "label": "Lead",
                            "color": "#fa4d56",
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Lead Chain",
                            "plugins": [
                                {
                                    "uri": "urn:test:plugin",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"gain": 0.75},
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 100.0},
                        "series_order": ["channel-a"],
                    },
                },
            )

            activated = await snapshot_service.activate_snapshot(created["id"])
            runtime_chain_id = activated["snapshot_data"]["live_state"]["paths"][0]["runtime_chain_id"]
            assert runtime_chain_id is not None

            result = await session.execute(select(database_module.Chain).filter(database_module.Chain.id == runtime_chain_id))
            runtime_chain = result.scalar_one()
            runtime_chain.is_active = False
            chain_config = ChainService._parse_chain_config(runtime_chain.config)
            chain_config["runtime_sync"] = {
                "enabled": True,
                "status": "inactive",
                "reason": "runtime_dropped",
                "warnings": [],
                "runtime_items": 0,
                "restored_positions": [],
                "missing_positions": [0],
            }
            runtime_chain.config = json.dumps(chain_config)
            await session.flush()

            refreshed = await runtime_state_service.refresh_live_snapshot_health(
                expected_snapshot_id=created["id"],
                expected_request_id=activated["activation_intent"]["request_id"],
                source="post_activation",
                emit=False,
            )

            assert refreshed is not None
            assert refreshed["runtime_metrics"]["channel_activity"]["active_count"] == 0
            assert refreshed["runtime_metrics"]["channel_activity"]["total_count"] == 1
            assert refreshed["runtime_metrics"]["channel_activity"]["inactive_channels"][0]["message"] == "Channel Lead not loaded."
            assert refreshed["runtime_metrics"]["last_channel_health_source"] == "post_activation"

            live_payload = refreshed["live_snapshot_payload"]
            assert live_payload is not None
            assert live_payload["live_state"]["paths"][0]["activation_status"] == "not_loaded"
            assert live_payload["live_state"]["runtime_chains"][0]["runtime_sync"]["status"] == "inactive"

    asyncio.run(_run())


def test_snapshot_service_activation_records_topology_mutation_metrics(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    class _TopologyStatsEngineStub:
        is_available = True
        is_running = True

        def __init__(self):
            self._responses = [
                {
                    "mutation_count": 4,
                    "no_op_skip_count": 1,
                    "last_mutation_duration_ms": 1.1,
                    "peak_mutation_duration_ms": 2.2,
                    "avg_mutation_duration_ms": 1.5,
                    "last_removed_connection_count": 6,
                    "last_added_connection_count": 8,
                    "last_chain_size": 2,
                    "last_parallel_group_count": 0,
                },
                {
                    "mutation_count": 5,
                    "no_op_skip_count": 3,
                    "last_mutation_duration_ms": 4.25,
                    "peak_mutation_duration_ms": 5.5,
                    "avg_mutation_duration_ms": 2.4,
                    "last_removed_connection_count": 14,
                    "last_added_connection_count": 16,
                    "last_chain_size": 3,
                    "last_parallel_group_count": 1,
                },
            ]

        async def get_topology_mutation_stats(self):
            if len(self._responses) > 1:
                return self._responses.pop(0)
            return self._responses[0]

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 2, 1

    async def _fake_push_footswitch_labels(**_kwargs):
        return {"labels_pushed": 0, "device_count": 0, "devices": [], "lcd_updated": False}

    async def _fake_push_controller_display(**_kwargs):
        return {"slots_pushed": 0, "device_count": 0, "devices": []}

    async def _healthy_channels(self, *, live_snapshot_payload):
        return {
            "snapshot_payload": live_snapshot_payload,
            "active_count": 1,
            "total_count": 1,
            "inactive_channels": [],
            "inactive_messages": [],
        }

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            engine_stub = _TopologyStatsEngineStub()

            monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
            monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
            monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
            monkeypatch.setattr(snapshot_service_module, "get_audio_engine", lambda: engine_stub)
            monkeypatch.setattr(snapshot_service_module, "push_snapshot_footswitch_labels", _fake_push_footswitch_labels)
            monkeypatch.setattr(snapshot_service_module, "push_snapshot_controller_display_preview", _fake_push_controller_display)
            monkeypatch.setattr(SnapshotRuntimeStateService, "assert_snapshot_channels_active", _healthy_channels)

            created = await service.create_snapshot(
                name="TopologyMetrics",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-a",
                            "label": "Lead",
                            "color": "#2563eb",
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Lead Chain",
                            "plugins": [
                                {
                                    "uri": "urn:test:plugin",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"gain": 0.75},
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 100.0},
                        "series_order": ["channel-a"],
                    },
                },
                apply_default_system_blocks=False,
            )

            activated = await service.activate_snapshot(created["id"])

            assert activated is not None
            assert activated["topology_mutation"]["delta"]["mutation_count"] == 1
            assert activated["topology_mutation"]["delta"]["no_op_skip_count"] == 2
            assert activated["topology_mutation"]["after"]["last_mutation_duration_ms"] == 4.25
            assert activated["runtime_live_state"]["runtime_metrics"]["topology_mutation"]["before"]["mutation_count"] == 4
            assert activated["runtime_live_state"]["runtime_metrics"]["topology_mutation"]["after"]["last_chain_size"] == 3
            assert activated["runtime_live_state"]["runtime_metrics"]["topology_mutation"]["delta"]["no_op_skip_count"] == 2

            runtime_state_service = SnapshotRuntimeStateService(session)
            refreshed = await runtime_state_service.get_live_state()
            assert refreshed is not None
            assert refreshed["runtime_metrics"]["topology_mutation"]["delta"]["mutation_count"] == 1
            assert refreshed["runtime_metrics"]["topology_mutation"]["after"]["last_added_connection_count"] == 16

    asyncio.run(_run())


def test_activate_snapshot_applies_output_safety_settings(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    class _OutputSafetyCollector:
        def __init__(self) -> None:
            self.reference_dbfs = None
            self.warning_threshold_db = None

        def set_output_safety_settings(
            self,
            *,
            output_level_reference_dbfs=None,
            output_warning_threshold_db=None,
        ) -> None:
            self.reference_dbfs = output_level_reference_dbfs
            self.warning_threshold_db = output_warning_threshold_db

    class _OutputSafetyEngineStub:
        is_available = True
        is_running = True

        def __init__(self) -> None:
            self.audio_device_calls: list[str] = []
            self.limiter_threshold_calls: list[float] = []

        async def set_audio_device(self, device_name: str) -> bool:
            self.audio_device_calls.append(device_name)
            return True

        async def set_limiter_threshold(self, db: float) -> None:
            self.limiter_threshold_calls.append(db)

        async def get_topology_mutation_stats(self):
            return {
                "mutation_count": 0,
                "no_op_skip_count": 0,
                "last_mutation_duration_ms": 0.0,
                "peak_mutation_duration_ms": 0.0,
                "avg_mutation_duration_ms": 0.0,
                "last_removed_connection_count": 0,
                "last_added_connection_count": 0,
                "last_chain_size": 0,
                "last_parallel_group_count": 0,
            }

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 1, 0

    async def _healthy_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    async def _fake_push_footswitch_labels(**_kwargs):
        return {"labels_pushed": 0, "device_count": 0, "devices": [], "lcd_updated": False}

    async def _fake_push_controller_display(**_kwargs):
        return {"slots_pushed": 0, "device_count": 0, "devices": []}

    collector = _OutputSafetyCollector()
    engine_stub = _OutputSafetyEngineStub()

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(snapshot_service_module, "get_audio_engine", lambda: engine_stub)
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_footswitch_labels", _fake_push_footswitch_labels)
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_controller_display_preview", _fake_push_controller_display)
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(ChainService, "activate_chain", _healthy_activate_chain)
    monkeypatch.setattr(
        performance_metrics_module,
        "get_metrics_collector",
        lambda: asyncio.sleep(0, result=collector),
    )

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="OutputSafety",
                output_level_reference_dbfs=-8.5,
                output_level_warning_threshold_db=2.75,
                input_device="Stage Input",
                output_device="House Left/Right",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-a",
                            "label": "Lead",
                            "color": "#2563eb",
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Lead Chain",
                            "plugins": [],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 100.0},
                        "series_order": ["channel-a"],
                    },
                    "midi_map": [],
                },
                apply_default_system_blocks=False,
            )

            activated = await service.activate_snapshot(created["id"])

            assert activated is not None
            assert engine_stub.audio_device_calls == ["House Left/Right"]
            assert engine_stub.limiter_threshold_calls == [-8.5]
            assert collector.reference_dbfs == -8.5
            assert collector.warning_threshold_db == 2.75
            assert activated["runtime_live_state"]["runtime_metrics"]["output_safety"] == {
                "output_level_reference_dbfs": -8.5,
                "output_warning_threshold_db": 2.75,
                "reference_applied": True,
                "warning_threshold_applied": True,
                "reason": "applied",
            }

    asyncio.run(_run())


def test_update_snapshot_reapplies_audio_device_bindings_for_live_snapshot(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    class _AudioBindingEngineStub:
        is_available = True
        is_running = True

        def __init__(self) -> None:
            self.audio_device_calls: list[str] = []
            self.monitoring_output_calls: list[int] = []

        async def set_audio_device(self, device_name: str) -> bool:
            self.audio_device_calls.append(device_name)
            return True

        async def set_monitoring_output_index(self, index: int) -> bool:
            self.monitoring_output_calls.append(index)
            return True

        async def get_topology_mutation_stats(self):
            return {
                "mutation_count": 0,
                "no_op_skip_count": 0,
                "last_mutation_duration_ms": 0.0,
                "peak_mutation_duration_ms": 0.0,
                "avg_mutation_duration_ms": 0.0,
                "last_removed_connection_count": 0,
                "last_added_connection_count": 0,
                "last_chain_size": 0,
                "last_parallel_group_count": 0,
            }

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 1, 0

    async def _healthy_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    async def _fake_push_footswitch_labels(**_kwargs):
        return {"labels_pushed": 0, "device_count": 0, "devices": [], "lcd_updated": False}

    async def _fake_push_controller_display(**_kwargs):
        return {"slots_pushed": 0, "device_count": 0, "devices": []}

    engine_stub = _AudioBindingEngineStub()

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(snapshot_service_module, "get_audio_engine", lambda: engine_stub)
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_footswitch_labels", _fake_push_footswitch_labels)
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_controller_display_preview", _fake_push_controller_display)
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(ChainService, "activate_chain", _healthy_activate_chain)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="LiveDeviceBinding",
                input_device="Stage Input",
                output_device="House Left/Right",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-a",
                            "label": "Lead",
                            "color": "#2563eb",
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Lead Chain",
                            "plugins": [],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 100.0},
                        "series_order": ["channel-a"],
                    },
                    "midi_map": [],
                },
                apply_default_system_blocks=False,
            )

            activated = await service.activate_snapshot(created["id"])
            assert activated is not None

            updated = await service.update_snapshot(
                created["id"],
                output_device="Monitor 2",
            )

            assert updated is not None
            assert updated["output_device"] == "Monitor 2"
            assert engine_stub.audio_device_calls == ["House Left/Right", "Monitor 2"]

    asyncio.run(_run())


def test_activate_snapshot_applies_monitoring_output_binding(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    class _MonitoringOutputEngineStub:
        is_available = True
        is_running = True

        def __init__(self) -> None:
            self.audio_device_calls: list[str] = []
            self.monitoring_output_calls: list[int] = []

        async def set_audio_device(self, device_name: str) -> bool:
            self.audio_device_calls.append(device_name)
            return True

        async def set_monitoring_output_index(self, index: int) -> bool:
            self.monitoring_output_calls.append(index)
            return True

        async def get_topology_mutation_stats(self):
            return {
                "mutation_count": 0,
                "no_op_skip_count": 0,
                "last_mutation_duration_ms": 0.0,
                "peak_mutation_duration_ms": 0.0,
                "avg_mutation_duration_ms": 0.0,
                "last_removed_connection_count": 0,
                "last_added_connection_count": 0,
                "last_chain_size": 0,
                "last_parallel_group_count": 0,
            }

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 1, 0

    async def _healthy_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    async def _fake_push_footswitch_labels(**_kwargs):
        return {"labels_pushed": 0, "device_count": 0, "devices": [], "lcd_updated": False}

    async def _fake_push_controller_display(**_kwargs):
        return {"slots_pushed": 0, "device_count": 0, "devices": []}

    engine_stub = _MonitoringOutputEngineStub()

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(snapshot_service_module, "get_audio_engine", lambda: engine_stub)
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_footswitch_labels", _fake_push_footswitch_labels)
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_controller_display_preview", _fake_push_controller_display)
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(ChainService, "activate_chain", _healthy_activate_chain)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="MonitoringOut",
                input_device="Stage Input",
                output_device="House Left/Right",
                controls_payload={"monitoring_output_index": 2},
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-a",
                            "label": "Lead",
                            "color": "#2563eb",
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Lead Chain",
                            "plugins": [],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 100.0},
                        "series_order": ["channel-a"],
                    },
                    "midi_map": [],
                },
                apply_default_system_blocks=False,
            )

            activated = await service.activate_snapshot(created["id"])

            assert activated is not None
            assert engine_stub.audio_device_calls == ["House Left/Right"]
            assert engine_stub.monitoring_output_calls == [2]
            assert activated["runtime_live_state"]["runtime_metrics"]["monitoring_output"] == {
                "monitoring_output_index": 2,
                "applied": True,
                "reason": "applied",
            }

    asyncio.run(_run())


def test_update_snapshot_reapplies_monitoring_output_for_live_snapshot(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    class _MonitoringOutputEngineStub:
        is_available = True
        is_running = True

        def __init__(self) -> None:
            self.audio_device_calls: list[str] = []
            self.monitoring_output_calls: list[int] = []

        async def set_audio_device(self, device_name: str) -> bool:
            self.audio_device_calls.append(device_name)
            return True

        async def set_monitoring_output_index(self, index: int) -> bool:
            self.monitoring_output_calls.append(index)
            return True

        async def get_topology_mutation_stats(self):
            return {
                "mutation_count": 0,
                "no_op_skip_count": 0,
                "last_mutation_duration_ms": 0.0,
                "peak_mutation_duration_ms": 0.0,
                "avg_mutation_duration_ms": 0.0,
                "last_removed_connection_count": 0,
                "last_added_connection_count": 0,
                "last_chain_size": 0,
                "last_parallel_group_count": 0,
            }

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 1, 0

    async def _healthy_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    async def _fake_push_footswitch_labels(**_kwargs):
        return {"labels_pushed": 0, "device_count": 0, "devices": [], "lcd_updated": False}

    async def _fake_push_controller_display(**_kwargs):
        return {"slots_pushed": 0, "device_count": 0, "devices": []}

    engine_stub = _MonitoringOutputEngineStub()

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(snapshot_service_module, "get_audio_engine", lambda: engine_stub)
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_footswitch_labels", _fake_push_footswitch_labels)
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_controller_display_preview", _fake_push_controller_display)
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(ChainService, "activate_chain", _healthy_activate_chain)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="LiveMonitoringOut",
                input_device="Stage Input",
                output_device="House Left/Right",
                controls_payload={"monitoring_output_index": 0},
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-a",
                            "label": "Lead",
                            "color": "#2563eb",
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Lead Chain",
                            "plugins": [],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 100.0},
                        "series_order": ["channel-a"],
                    },
                    "midi_map": [],
                },
                apply_default_system_blocks=False,
            )

            activated = await service.activate_snapshot(created["id"])
            assert activated is not None

            updated = await service.update_snapshot(
                created["id"],
                controls_payload={"monitoring_output_index": 4},
            )

            assert updated is not None
            assert updated["controls"]["monitoring_output_index"] == 4
            assert engine_stub.monitoring_output_calls == [0, 4]

    asyncio.run(_run())


def test_activate_snapshot_syncs_snapshot_midi_map_commands_to_engine(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    class _SnapshotMidiEngineStub:
        is_available = True
        is_running = True

        def __init__(self) -> None:
            self.command_batches: list[list[dict[str, object]]] = []

        async def set_all_midi_commands(self, commands):
            self.command_batches.append([dict(item) for item in commands])
            return True

        async def get_topology_mutation_stats(self):
            return {
                "mutation_count": 0,
                "no_op_skip_count": 0,
                "last_mutation_duration_ms": 0.0,
                "peak_mutation_duration_ms": 0.0,
                "avg_mutation_duration_ms": 0.0,
                "last_removed_connection_count": 0,
                "last_added_connection_count": 0,
                "last_chain_size": 0,
                "last_parallel_group_count": 0,
            }

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 1, 0

    async def _healthy_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    async def _fake_push_footswitch_labels(**_kwargs):
        return {"labels_pushed": 0, "device_count": 0, "devices": [], "lcd_updated": False}

    async def _fake_push_controller_display(**_kwargs):
        return {"slots_pushed": 0, "device_count": 0, "devices": []}

    engine_stub = _SnapshotMidiEngineStub()

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(snapshot_service_module, "get_audio_engine", lambda: engine_stub)
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_footswitch_labels", _fake_push_footswitch_labels)
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_controller_display_preview", _fake_push_controller_display)
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(ChainService, "activate_chain", _healthy_activate_chain)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            command_id = await midi_service.create_command(
                MIDICommandDTO(
                    command_type=CommandType.CC_TOGGLE,
                    channel=1,
                    data1=80,
                    action_type=ActionType.TOGGLE_PLUGIN,
                    target_plugin_uri="urn:test:plugin",
                    target_plugin_position=0,
                    action_data={"slot_index": 0},
                    name="Slot 1 Toggle",
                ),
                session,
            )
            assert command_id is not None

            created = await service.create_snapshot(
                name="SnapshotMidiActivation",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-a",
                            "label": "Lead",
                            "color": "#2563eb",
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Lead Chain",
                            "plugins": [],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 100.0},
                        "series_order": ["channel-a"],
                    },
                    "midi_map": [
                        {"action": "load_snapshot", "program_number": 23, "channel": 1},
                        {"action": "focus_block_note_range", "midi_channel": 2, "start_note": 60},
                        {"action": "footswitch_label_map", "label_map": {"1": "Clean"}},
                    ],
                },
                apply_default_system_blocks=False,
            )

            activated = await service.activate_snapshot(created["id"])

            assert activated is not None
            assert engine_stub.command_batches
            synced_batch = engine_stub.command_batches[-1]
            assert [command["action_type"] for command in synced_batch] == [
                "toggle_plugin",
                "load_snapshot",
                "focus_block_note_range",
            ]
            assert synced_batch[1]["command_type"] == "program_change"
            assert synced_batch[1]["channel"] == 1
            assert synced_batch[1]["data1"] == 23
            assert synced_batch[2]["command_type"] == "note_on"
            assert synced_batch[2]["channel"] == 2
            assert synced_batch[2]["data1"] == 60
            assert activated["runtime_live_state"]["runtime_metrics"]["snapshot_midi_map"] == {
                "synced": True,
                "reason": "applied",
                "global_command_count": 1,
                "snapshot_command_count": 2,
            }

    asyncio.run(_run())


def test_replace_midi_map_resyncs_live_snapshot_commands_to_engine(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    class _SnapshotMidiEngineStub:
        is_available = True
        is_running = True

        def __init__(self) -> None:
            self.command_batches: list[list[dict[str, object]]] = []

        async def set_all_midi_commands(self, commands):
            self.command_batches.append([dict(item) for item in commands])
            return True

        async def get_topology_mutation_stats(self):
            return {
                "mutation_count": 0,
                "no_op_skip_count": 0,
                "last_mutation_duration_ms": 0.0,
                "peak_mutation_duration_ms": 0.0,
                "avg_mutation_duration_ms": 0.0,
                "last_removed_connection_count": 0,
                "last_added_connection_count": 0,
                "last_chain_size": 0,
                "last_parallel_group_count": 0,
            }

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 1, 0

    async def _healthy_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    async def _fake_push_footswitch_labels(**_kwargs):
        return {"labels_pushed": 0, "device_count": 0, "devices": [], "lcd_updated": False}

    async def _fake_push_controller_display(**_kwargs):
        return {"slots_pushed": 0, "device_count": 0, "devices": []}

    engine_stub = _SnapshotMidiEngineStub()

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(snapshot_service_module, "get_audio_engine", lambda: engine_stub)
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_footswitch_labels", _fake_push_footswitch_labels)
    monkeypatch.setattr(snapshot_service_module, "push_snapshot_controller_display_preview", _fake_push_controller_display)
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(ChainService, "activate_chain", _healthy_activate_chain)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            command_id = await midi_service.create_command(
                MIDICommandDTO(
                    command_type=CommandType.CC_TOGGLE,
                    channel=1,
                    data1=81,
                    action_type=ActionType.TOGGLE_PLUGIN,
                    target_plugin_uri="urn:test:plugin",
                    target_plugin_position=1,
                    action_data={"slot_index": 1},
                    name="Slot 2 Toggle",
                ),
                session,
            )
            assert command_id is not None

            created = await service.create_snapshot(
                name="SnapshotMidiReplace",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-a",
                            "label": "Lead",
                            "color": "#2563eb",
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Lead Chain",
                            "plugins": [],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 100.0},
                        "series_order": ["channel-a"],
                    },
                    "midi_map": [
                        {"action": "load_snapshot", "program_number": 4},
                    ],
                },
                apply_default_system_blocks=False,
            )

            activated = await service.activate_snapshot(created["id"])
            assert activated is not None
            assert len(engine_stub.command_batches) == 1

            replaced = await service.replace_midi_map(
                created["id"],
                [
                    {"action": "focus_block_note_range", "midi_channel": 3, "start_note": 48},
                ],
            )

            assert replaced is not None
            assert len(engine_stub.command_batches) == 2
            synced_batch = engine_stub.command_batches[-1]
            assert [command["action_type"] for command in synced_batch] == [
                "toggle_plugin",
                "focus_block_note_range",
            ]
            assert synced_batch[1]["command_type"] == "note_on"
            assert synced_batch[1]["channel"] == 3
            assert synced_batch[1]["data1"] == 48

    asyncio.run(_run())


def test_snapshot_activation_preflight_blocks_broken_assets_and_preserves_live_snapshot(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    class _AudioInventoryStub:
        is_available = True

        def get_system_info(self):
            return {
                "available_input_devices": ["Stage Input"],
                "available_output_devices": ["House Left/Right"],
            }

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 1, 0

    async def _healthy_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr("app.services.engine_runtime_facade.get_engine_service", lambda: _AudioInventoryStub())
    monkeypatch.setattr(ChainService, "activate_chain", _healthy_activate_chain)

    missing_model_path = tmp_path / "CleanTone.nam"
    missing_ir_path = tmp_path / "WideCab.wav"

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            current_live = await service.create_snapshot(
                name="CurrentLive",
                input_device="Stage Input",
                output_device="House Left/Right",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-a",
                            "label": "Lead",
                            "color": "#fa4d56",
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Lead Chain",
                            "plugins": [
                                {
                                    "uri": "map2://juce/delay",
                                    "name": "Delay",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"mix": 0.45},
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 100.0},
                        "series_order": ["channel-a"],
                    },
                },
            )
            activated_live = await service.activate_snapshot(current_live["id"])
            assert activated_live is not None
            assert activated_live["snapshot_id"] == current_live["id"]

            broken = await service.create_snapshot(
                name="BrokenPreflight",
                input_device="Tour Rack",
                output_device="House Left/Right",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-a",
                            "label": "Lead",
                            "color": "#fa4d56",
                            "chain_id": 1,
                        },
                        {
                            "channel_key": "channel-b",
                            "label": "Ambient",
                            "color": "#22c55e",
                            "chain_id": 2,
                        },
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Lead Chain",
                            "plugins": [
                                {
                                    "uri": "urn:test:missing-plugin",
                                    "name": "Ghost Drive",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {},
                                },
                                {
                                    "uri": "map2://juce/nam",
                                    "name": "NAM",
                                    "position": 1,
                                    "bypass": False,
                                    "parameters": {},
                                    "loader_state": {
                                        "selected_asset_name": "CleanTone.nam",
                                        "selected_asset_path": str(missing_model_path),
                                    },
                                },
                            ],
                        },
                        {
                            "id": 2,
                            "name": "Ambient Chain",
                            "plugins": [
                                {
                                    "uri": "map2://juce/convolution/cabinet",
                                    "name": "Cabinet",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {},
                                    "loader_state": {
                                        "selected_asset_name": "WideCab.wav",
                                        "selected_asset_path": str(missing_ir_path),
                                        "ir_type": "cabinet",
                                    },
                                }
                            ],
                        },
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 100.0, "channel-b": 100.0},
                        "series_order": ["channel-a", "channel-b"],
                    },
                },
            )

            try:
                await service.activate_snapshot(broken["id"])
            except SnapshotActivationPreflightError as exc:
                assert exc.failures == [
                    "Cannot go live: Channel Lead - plugin urn:test:missing-plugin is not installed on this node.",
                    "Cannot go live: Channel Lead - NAM model CleanTone.nam not found on this node.",
                    "Cannot go live: Channel Ambient - cabinet IR WideCab.wav not found on this node.",
                    "Cannot go live: Input device Tour Rack is not available on this node.",
                ]
            else:
                raise AssertionError("Activation should fail when snapshot pre-flight validation finds missing dependencies")

            live_snapshot = await service.get_live_snapshot()
            assert live_snapshot is not None
            assert live_snapshot["id"] == current_live["id"]
            assert live_snapshot["name"] == "CurrentLive"

    asyncio.run(_run())


def test_snapshot_service_version_history_restore(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            created = await service.create_snapshot(
                name="RevisionSnapshot",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-0",
                            "label": "A",
                            "color": "#2563eb",
                            "muted": False,
                            "solo": False,
                            "dry_wet_mix": 100.0,
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Chain A",
                            "plugins": [
                                {
                                    "uri": "urn:test:drive",
                                    "name": "Drive",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"gain": 0.6},
                                    "loader_state": {},
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-0",
                        "blend_positions": {"channel-0": 100.0},
                        "series_order": ["channel-0"],
                    },
                    "midi_map": [],
                },
            )

            saved = await service.update_snapshot(
                created["id"],
                detail_payload={
                    "channels": created["channels"],
                    "chains": [
                        {
                            "id": created["chains"][0]["id"],
                            "name": "Chain A",
                            "plugins": [
                                {
                                    "uri": "urn:test:drive",
                                    "name": "Drive",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"gain": 0.6},
                                    "loader_state": {},
                                },
                                {
                                    "uri": "urn:test:delay",
                                    "name": "Delay",
                                    "position": 1,
                                    "bypass": False,
                                    "parameters": {"mix": 0.4},
                                    "loader_state": {},
                                },
                            ],
                        }
                    ],
                    "routing": created["routing"],
                    "midi_map": created["midi_map"],
                },
                create_revision=True,
            )
            assert saved is not None
            assert len(saved["chains"][0]["plugins"]) == 2

            revisions = await service.list_revisions(created["id"])
            assert revisions is not None
            assert len(revisions) == 1
            assert revisions[0]["revision_number"] == 1
            assert revisions[0]["summary"] == "2 blocks, 1 channel, parallel blend routing"
            assert revisions[0]["summary_metadata"]["categories"] == [
                {"key": "blocks", "label": "Blocks", "value": 2},
                {"key": "channels", "label": "Channels", "value": 1},
                {"key": "routing", "label": "Routing", "value": "parallel blend"},
                {"key": "loop_insertions", "label": "Loop Insertions", "value": 0},
                {"key": "effects_loops", "label": "Effects Loops", "value": 0},
                {"key": "midi_map", "label": "MIDI Map", "value": 0},
                {"key": "extensions", "label": "Extensions", "value": []},
            ]

            restored = await service.restore_revision(created["id"], 1)
            assert restored is not None
            assert len(restored["chains"][0]["plugins"]) == 2

            revisions_after_restore = await service.list_revisions(created["id"])
            assert revisions_after_restore is not None
            assert len(revisions_after_restore) == 2
            assert revisions_after_restore[0]["revision_number"] == 2
            assert revisions_after_restore[0]["summary"] == "2 blocks, 1 channel, parallel blend routing"
            assert revisions_after_restore[0]["summary_metadata"]["categories"][0] == {
                "key": "blocks",
                "label": "Blocks",
                "value": 2,
            }

    asyncio.run(_run())


def test_delete_snapshot_ignores_stale_runtime_live_state_when_control_plane_points_elsewhere(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            created = await service.create_snapshot(
                name="DeleteMe",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-a",
                            "label": "A",
                            "color": "#2563eb",
                            "muted": False,
                            "solo": False,
                            "dry_wet_mix": 100.0,
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Chain A",
                            "plugins": [],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 100.0},
                        "series_order": ["channel-a"],
                    },
                    "midi_map": [],
                },
            )

            runtime_service = SnapshotRuntimeStateService(session)
            await runtime_service.sync_live_snapshot_payload(
                snapshot_id=created["id"],
                live_snapshot_payload={"id": created["id"], "name": created["name"]},
                snapshot_revision=created.get("snapshot_revision"),
            )

            async def _fake_control_plane_snapshot_id():
                return None

            monkeypatch.setattr(service, "get_control_plane_snapshot_id", _fake_control_plane_snapshot_id)

            deleted = await service.delete_snapshot(created["id"])
            assert deleted is True
            assert await service.get_snapshot(created["id"]) is None

    asyncio.run(_run())


class _FakeSnapshotSpilloverEngine:
    is_available = True
    is_running = True

    def __init__(self):
        self.calls: list[str] = []

    async def stage_delay_spillover(self):
        self.calls.append("delay")

    async def stage_shoegaze_spillover(self):
        self.calls.append("shoegaze")

    async def stage_lexilove_spillover(self):
        self.calls.append("lexilove")

def test_arm_live_spillover_processors_stages_outgoing_native_wet_effects(monkeypatch):
    engine = _FakeSnapshotSpilloverEngine()
    monkeypatch.setattr(snapshot_service_module, "get_audio_engine", lambda: engine)

    service = SnapshotService(None)
    current_live_detail = {
        "chains": [
            {
                "plugins": [
                    {"uri": "map2://juce/delay", "bypass": False},
                    {"uri": "map2://juce/reverb/pcm70", "bypass": False},
                    {"uri": "map2://juce/multieffect/shoegaze", "bypass": False},
                ]
            }
        ]
    }
    target_detail = {
        "chains": [
            {
                "plugins": [
                    {"uri": "map2://juce/multieffect/shoegaze", "bypass": False},
                ]
            }
        ]
    }

    asyncio.run(
        service._arm_live_spillover_processors(  # noqa: SLF001 - targeted unit coverage
            current_live_detail=current_live_detail,
            target_detail=target_detail,
        )
    )

    assert engine.calls == ["delay", "lexilove"]


def test_arm_live_spillover_processors_stages_same_uri_native_wet_state_changes(monkeypatch):
    engine = _FakeSnapshotSpilloverEngine()
    monkeypatch.setattr(snapshot_service_module, "get_audio_engine", lambda: engine)

    service = SnapshotService(None)
    current_live_detail = {
        "chains": [
            {
                "plugins": [
                    {
                        "uri": "map2://juce/delay",
                        "bypass": False,
                        "parameters": {"0": 0.25, "1": 0.5},
                        "position": 2,
                    }
                ]
            }
        ]
    }
    target_detail = {
        "chains": [
            {
                "plugins": [
                    {
                        "uri": "map2://juce/delay",
                        "bypass": False,
                        "parameters": {"0": 0.9, "1": 0.1},
                        "position": 2,
                    }
                ]
            }
        ]
    }

    asyncio.run(
        service._arm_live_spillover_processors(  # noqa: SLF001 - targeted unit coverage
            current_live_detail=current_live_detail,
            target_detail=target_detail,
        )
    )

    assert engine.calls == ["delay"]


def test_activate_snapshot_syncs_expression_mappings_and_automation_lanes(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    class _ExpressionServiceStub:
        def __init__(self):
            self.calls = []

        def replace_snapshot_assignments(self, entries):
            payload = [dict(entry) for entry in entries]
            self.calls.append(payload)
            return {
                "cleared_count": 1,
                "applied_count": len(payload),
                "active_snapshot_count": len(payload),
            }

    class _AutomationEngineStub:
        def __init__(self):
            self.calls = []

        def replace_snapshot_lanes(self, entries):
            payload = [dict(entry) for entry in entries]
            self.calls.append(payload)
            return {
                "cleared_count": 1,
                "applied_count": len(payload),
                "invalid_count": 0,
                "active_snapshot_count": len(payload),
            }

    class _RuntimeEngineStub:
        async def set_all_midi_commands(self, commands):
            self.commands = [dict(command) for command in commands]
            return True

        async def get_topology_mutation_stats(self):
            return None

    expression_stub = _ExpressionServiceStub()
    automation_stub = _AutomationEngineStub()
    runtime_engine_stub = _RuntimeEngineStub()

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 0, 0

    async def _healthy_channels(self, *, live_snapshot_payload):
        return {
            "snapshot_payload": live_snapshot_payload,
            "active_count": 0,
            "total_count": 0,
            "inactive_channels": [],
            "inactive_messages": [],
        }

    async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(snapshot_service_module, "get_audio_engine", lambda: runtime_engine_stub)
    monkeypatch.setattr(snapshot_service_module, "get_expression_service", lambda: expression_stub)
    monkeypatch.setattr(snapshot_service_module, "automation_engine", automation_stub)
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(SnapshotRuntimeStateService, "assert_snapshot_channels_active", _healthy_channels)
    monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="ExpressionAutomationSnapshot",
                controls_payload={
                    "expression_mappings": [
                        {
                            "id": "snapshot-wah",
                            "cc": 11,
                            "channel": 1,
                            "cc_min": 0,
                            "cc_max": 127,
                            "param_id": "engine.wah_freq",
                            "param_label": "Wah",
                            "out_min": 0.1,
                            "out_max": 0.9,
                        }
                    ],
                    "automation_lanes": [
                        {
                            "parameter_id": "urn:test:plugin:1@0",
                            "plugin_uri": "urn:test:plugin",
                            "plugin_position": 0,
                            "param_index": 1,
                            "param_name": "Mix",
                            "modulation_source": "lfo",
                            "enabled": True,
                            "points": [],
                            "lfo": {
                                "rate_hz": 2.5,
                                "depth": 0.8,
                                "waveform": "triangle",
                                "sync_to_tempo": True,
                                "tempo_division": "1/8",
                                "phase_offset": 0.25,
                                "smoothing": 0.1,
                            },
                        }
                    ],
                },
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-0",
                            "label": "A",
                            "color": "#2563eb",
                            "muted": False,
                            "solo": False,
                            "dry_wet_mix": 100.0,
                            "chain_id": 1,
                        }
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Chain A",
                            "plugins": [
                                {
                                    "uri": "urn:test:plugin",
                                    "name": "Test Plugin",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"gain": 0.5},
                                    "loader_state": {},
                                }
                            ],
                        }
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-0",
                        "blend_positions": {"channel-0": 100.0},
                        "series_order": ["channel-0"],
                    },
                    "midi_map": [],
                },
            )

            activated = await service.activate_snapshot(created["id"])
            assert activated is not None
            assert expression_stub.calls == [[created["controls"]["expression_mappings"][0]]]
            assert automation_stub.calls == [[created["controls"]["automation_lanes"][0]]]
            assert activated["runtime_live_state"]["runtime_metrics"]["expression_mappings"]["synced"] is True
            assert activated["runtime_live_state"]["runtime_metrics"]["expression_mappings"]["applied_count"] == 1
            assert activated["runtime_live_state"]["runtime_metrics"]["automation_lanes"]["synced"] is True
            assert activated["runtime_live_state"]["runtime_metrics"]["automation_lanes"]["applied_count"] == 1

    asyncio.run(_run())


class _OpenGapMatrixEngineStub:
    def __init__(self) -> None:
        self.loop_calls: list[tuple[int, list[dict[str, object]]]] = []
        self.parallel_group_calls: list[tuple[int, int]] = []
        self.parallel_branch_calls: list[tuple[int, int, int, int]] = []
        self.parallel_blend_calls: list[tuple[int, float]] = []
        self.chain_mute_calls: list[tuple[int, bool]] = []
        self.chain_solo_calls: list[tuple[int, bool]] = []
        self.chain_mix_calls: list[tuple[int, float]] = []
        self.parameter_calls: list[tuple[int | None, int, float]] = []
        self._instance_ids: dict[tuple[str, int | None], int] = {}

    async def set_all_midi_commands(self, commands):
        self.commands = [dict(command) for command in commands]
        return True

    async def get_topology_mutation_stats(self):
        return None

    async def set_chain_loop_insertions(self, chain_id: int, insertions: list[dict[str, object]]) -> bool:
        self.loop_calls.append((chain_id, [dict(entry) for entry in insertions]))
        return True

    async def create_parallel_group(self, position: int = -1, num_branches: int = 2) -> int:
        self.parallel_group_calls.append((position, num_branches))
        return len(self.parallel_group_calls)

    async def add_to_parallel_branch(self, group_id: int, branch_index: int, plugin_id: int, position: int = -1) -> bool:
        self.parallel_branch_calls.append((group_id, branch_index, plugin_id, position))
        return True

    async def set_parallel_ab_blend(self, group_id: int, blend: float) -> None:
        self.parallel_blend_calls.append((group_id, float(blend)))

    async def set_chain_mute(self, chain_id: int, muted: bool) -> bool:
        self.chain_mute_calls.append((chain_id, bool(muted)))
        return True

    async def set_chain_solo(self, chain_id: int, solo: bool) -> bool:
        self.chain_solo_calls.append((chain_id, bool(solo)))
        return True

    async def set_chain_dry_wet_mix(self, chain_id: int, dry_wet_mix: float) -> bool:
        self.chain_mix_calls.append((chain_id, float(dry_wet_mix)))
        return True

    async def set_parameter(self, instance_id: int | None, param_index: int, value: float) -> bool:
        self.parameter_calls.append((instance_id, int(param_index), float(value)))
        return True

    def _get_instance_id_for_uri(self, plugin_uri: str, plugin_position: int | None = None) -> int | None:
        key = (str(plugin_uri), plugin_position if isinstance(plugin_position, int) else None)
        if key not in self._instance_ids:
            self._instance_ids[key] = len(self._instance_ids) + 1
        return self._instance_ids[key]


async def _create_and_activate_open_gap_snapshot(tmp_path, monkeypatch, *, detail_payload, controls_payload=None):
    _init_temp_db(tmp_path)
    engine_stub = _OpenGapMatrixEngineStub()

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 0, 0

    async def _healthy_channels(self, *, live_snapshot_payload):
        return {
            "snapshot_payload": live_snapshot_payload,
            "active_count": 0,
            "total_count": 0,
            "inactive_channels": [],
            "inactive_messages": [],
        }

    async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(snapshot_service_module, "get_audio_engine", lambda: engine_stub)
    monkeypatch.setattr("app.services.juce_engine_service.get_audio_engine", lambda: engine_stub)
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
    monkeypatch.setattr(SnapshotRuntimeStateService, "assert_snapshot_channels_active", _healthy_channels)
    monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)

    async with database_module.get_session() as session:
        service = SnapshotService(session)
        created = await service.create_snapshot(
            name="OpenGapMatrixSnapshot",
            controls_payload=controls_payload or {},
            detail_payload=detail_payload,
            apply_default_system_blocks=False,
        )
        activated = await service.activate_snapshot(created["id"])
        return service, created, activated, engine_stub


def test_t736_activation_should_push_loop_insertions_to_engine(tmp_path, monkeypatch):
    async def _run():
        _init_temp_db(tmp_path)
        engine_stub = _OpenGapMatrixEngineStub()

        async def _passthrough(snapshot_data):
            return snapshot_data

        async def _fake_apply(_snapshot_data):
            return 0, 0

        async def _healthy_channels(self, *, live_snapshot_payload):
            return {
                "snapshot_payload": live_snapshot_payload,
                "active_count": 0,
                "total_count": 0,
                "inactive_channels": [],
                "inactive_messages": [],
            }

        async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
            result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
            chain = result.scalar_one_or_none()
            if chain is not None:
                chain.is_active = True
            return True

        monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
        monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
        monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
        monkeypatch.setattr(snapshot_service_module, "get_audio_engine", lambda: engine_stub)
        monkeypatch.setattr("app.services.juce_engine_service.get_audio_engine", lambda: engine_stub)
        monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
        monkeypatch.setattr(SnapshotRuntimeStateService, "assert_snapshot_channels_active", _healthy_channels)
        monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)

        async with database_module.get_session() as session:
            session.add(
                database_module.EffectsLoop(
                    loop_id="loop-a",
                    name="Loop A",
                    channels=2,
                    topology="serial_insert",
                )
            )
            await session.flush()

            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="LoopSyncSnapshot",
                detail_payload={
                    "channels": [
                        {"channel_key": "channel-a", "label": "A", "color": "#2563eb", "chain_id": 1}
                    ],
                    "chains": [
                        {
                            "id": 1,
                            "name": "Loop Chain",
                            "plugins": [{"uri": "urn:test:plugin", "position": 0, "bypass": False, "parameters": {}}],
                            "loop_insertions": [
                                {
                                    "loop_id": "loop-a",
                                    "slot_index": 0,
                                    "enabled": True,
                                    "mode": "serial_insert",
                                    "blend_pct": 75.0,
                                }
                            ],
                        }
                    ],
                    "routing": {"mode": "series", "active_channel_key": "channel-a", "series_order": ["channel-a"]},
                    "midi_map": [],
                },
                apply_default_system_blocks=False,
            )
            activated = await service.activate_snapshot(created["id"])
            assert activated is not None
            assert engine_stub.loop_calls
            assert activated["runtime_live_state"]["runtime_metrics"]["loop_insertions"]["applied_count"] == 1

    asyncio.run(_run())


def test_t737_activation_should_push_channel_state_to_engine(tmp_path, monkeypatch):
    async def _run():
        _service, _created, activated, engine_stub = await _create_and_activate_open_gap_snapshot(
            tmp_path,
            monkeypatch,
            detail_payload={
                "channels": [
                    {
                        "channel_key": "channel-a",
                        "label": "A",
                        "color": "#2563eb",
                        "chain_id": 1,
                        "muted": True,
                        "solo": True,
                        "dry_wet_mix": 42.0,
                    }
                ],
                "chains": [
                    {"id": 1, "name": "State Chain", "plugins": [{"uri": "urn:test:plugin", "position": 0, "bypass": False, "parameters": {}}]}
                ],
                "routing": {"mode": "series", "active_channel_key": "channel-a", "series_order": ["channel-a"]},
                "midi_map": [],
            },
        )
        assert activated is not None
        assert engine_stub.chain_mute_calls
        assert engine_stub.chain_solo_calls
        assert engine_stub.chain_mix_calls
        assert activated["runtime_live_state"]["runtime_metrics"]["channel_state"]["applied_count"] == 1

    asyncio.run(_run())


def test_t739_activation_should_push_parallel_routing_to_engine(tmp_path, monkeypatch):
    async def _run():
        _service, _created, activated, engine_stub = await _create_and_activate_open_gap_snapshot(
            tmp_path,
            monkeypatch,
            detail_payload={
                "channels": [
                    {"channel_key": "channel-a", "label": "A", "color": "#2563eb", "chain_id": 1},
                    {"channel_key": "channel-b", "label": "B", "color": "#22c55e", "chain_id": 2},
                ],
                "chains": [
                    {"id": 1, "name": "A", "plugins": [{"uri": "urn:test:plugin-a", "position": 0, "bypass": False, "parameters": {}}]},
                    {"id": 2, "name": "B", "plugins": [{"uri": "urn:test:plugin-b", "position": 0, "bypass": False, "parameters": {}}]},
                ],
                "routing": {
                    "mode": "parallel_blend",
                    "active_channel_key": "channel-a",
                    "blend_positions": {"channel-a": 30.0, "channel-b": 70.0},
                    "series_order": ["channel-a", "channel-b"],
                },
                "midi_map": [],
            },
        )
        assert activated is not None
        assert engine_stub.parallel_group_calls
        assert engine_stub.parallel_branch_calls
        assert engine_stub.parallel_blend_calls

    asyncio.run(_run())


def test_t738_live_routing_edit_should_reapply_engine_blend(tmp_path, monkeypatch):
    async def _run():
        _init_temp_db(tmp_path)
        engine_stub = _OpenGapMatrixEngineStub()

        async def _passthrough(snapshot_data):
            return snapshot_data

        async def _fake_apply(_snapshot_data):
            return 0, 0

        async def _healthy_channels(self, *, live_snapshot_payload):
            return {
                "snapshot_payload": live_snapshot_payload,
                "active_count": 0,
                "total_count": 0,
                "inactive_channels": [],
                "inactive_messages": [],
            }

        async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
            result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
            chain = result.scalar_one_or_none()
            if chain is not None:
                chain.is_active = True
            return True

        monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
        monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
        monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
        monkeypatch.setattr(snapshot_service_module, "get_audio_engine", lambda: engine_stub)
        monkeypatch.setattr("app.services.juce_engine_service.get_audio_engine", lambda: engine_stub)
        monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
        monkeypatch.setattr(SnapshotRuntimeStateService, "assert_snapshot_channels_active", _healthy_channels)
        monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)

        async with database_module.get_session() as session:
            service = SnapshotService(session)
            created = await service.create_snapshot(
                name="LiveRoutingUpdate",
                detail_payload={
                    "channels": [
                        {"channel_key": "channel-a", "label": "A", "color": "#2563eb", "chain_id": 1},
                        {"channel_key": "channel-b", "label": "B", "color": "#22c55e", "chain_id": 2},
                    ],
                    "chains": [
                        {"id": 1, "name": "A", "plugins": [{"uri": "urn:test:plugin-a", "position": 0, "bypass": False, "parameters": {}}]},
                        {"id": 2, "name": "B", "plugins": [{"uri": "urn:test:plugin-b", "position": 0, "bypass": False, "parameters": {}}]},
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "channel-a",
                        "blend_positions": {"channel-a": 100.0, "channel-b": 0.0},
                        "series_order": ["channel-a", "channel-b"],
                    },
                    "midi_map": [],
                },
                apply_default_system_blocks=False,
            )
            activated = await service.activate_snapshot(created["id"])
            assert activated is not None

            before_calls = len(engine_stub.parallel_blend_calls)
            updated = await service.update_routing(
                created["id"],
                {"blend_positions": {"channel-a": 25.0, "channel-b": 75.0}},
            )
            assert updated is not None
            assert updated["routing_requires_reactivation"] is False
            assert updated["routing_apply"]["applied"] is True
            assert len(engine_stub.parallel_blend_calls) > before_calls

    asyncio.run(_run())


def test_t744_live_channel_edit_should_reapply_engine_channel_state(tmp_path, monkeypatch):
    async def _run():
        service, created, activated, engine_stub = await _create_and_activate_open_gap_snapshot(
            tmp_path,
            monkeypatch,
            detail_payload={
                "channels": [
                    {
                        "channel_key": "channel-a",
                        "label": "A",
                        "color": "#2563eb",
                        "chain_id": 1,
                        "muted": False,
                        "solo": False,
                        "dry_wet_mix": 100.0,
                    }
                ],
                "chains": [
                    {"id": 1, "name": "A", "plugins": [{"uri": "urn:test:plugin-a", "position": 0, "bypass": False, "parameters": {}}]}
                ],
                "routing": {"mode": "series", "active_channel_key": "channel-a", "series_order": ["channel-a"]},
                "midi_map": [],
            },
        )
        assert activated is not None
        before_calls = (
            len(engine_stub.chain_mute_calls),
            len(engine_stub.chain_solo_calls),
            len(engine_stub.chain_mix_calls),
        )
        updated = await service.update_channel(
            created["id"],
            created["channels"][0]["id"],
            {"muted": True, "solo": True, "dry_wet_mix": 35.0},
        )
        assert updated is not None
        after_calls = (
            len(engine_stub.chain_mute_calls),
            len(engine_stub.chain_solo_calls),
            len(engine_stub.chain_mix_calls),
        )
        assert after_calls > before_calls
        assert updated["channel_state_apply"]["applied_count"] == 1

    asyncio.run(_run())


def test_t742_topology_reuse_should_reapply_routing_and_loop_state(tmp_path, monkeypatch):
    async def _run():
        _init_temp_db(tmp_path)
        engine_stub = _OpenGapMatrixEngineStub()

        async def _passthrough(snapshot_data):
            return snapshot_data

        async def _fake_apply(_snapshot_data):
            return 0, 0

        async def _healthy_channels(self, *, live_snapshot_payload):
            return {
                "snapshot_payload": live_snapshot_payload,
                "active_count": 0,
                "total_count": 0,
                "inactive_channels": [],
                "inactive_messages": [],
            }

        async def _fake_activate_chain(self, chain_id, *, preferred_detached_instance_ids=None):
            result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
            chain = result.scalar_one_or_none()
            if chain is not None:
                chain.is_active = True
            return True

        monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
        monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
        monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
        monkeypatch.setattr(snapshot_service_module, "get_audio_engine", lambda: engine_stub)
        monkeypatch.setattr("app.services.juce_engine_service.get_audio_engine", lambda: engine_stub)
        monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
        monkeypatch.setattr(SnapshotRuntimeStateService, "assert_snapshot_channels_active", _healthy_channels)
        monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)

        async with database_module.get_session() as session:
            session.add(
                database_module.EffectsLoop(
                    loop_id="loop-a",
                    name="Loop A",
                    channels=2,
                    topology="serial_insert",
                )
            )
            await session.flush()
            service = SnapshotService(session)
            first = await service.create_snapshot(
                name="ReuseA",
                detail_payload={
                    "channels": [{"channel_key": "channel-a", "label": "A", "color": "#2563eb", "chain_id": 1}],
                    "chains": [{"id": 1, "name": "A", "plugins": [{"uri": "urn:test:plugin-a", "position": 0, "bypass": False, "parameters": {}}]}],
                    "routing": {"mode": "series", "active_channel_key": "channel-a", "series_order": ["channel-a"]},
                    "midi_map": [],
                },
                apply_default_system_blocks=False,
            )
            await service.activate_snapshot(first["id"])
            before_mix_calls = len(engine_stub.chain_mix_calls)

            second = await service.create_snapshot(
                name="ReuseB",
                detail_payload={
                    "channels": [
                        {
                            "channel_key": "channel-a",
                            "label": "A",
                            "color": "#2563eb",
                            "chain_id": 2,
                            "dry_wet_mix": 33.0,
                        }
                    ],
                    "chains": [
                        {
                            "id": 2,
                            "name": "A",
                            "plugins": [{"uri": "urn:test:plugin-a", "position": 0, "bypass": False, "parameters": {"0": 0.7}}],
                            "loop_insertions": [{"loop_id": "loop-a", "slot_index": 0, "enabled": True, "mode": "serial_insert"}],
                        }
                    ],
                    "routing": {"mode": "series", "active_channel_key": "channel-a", "series_order": ["channel-a"]},
                    "midi_map": [],
                },
                apply_default_system_blocks=False,
            )
            activated = await service.activate_snapshot(second["id"])
            assert activated is not None
            assert activated["topology_reused"] is True
            assert len(engine_stub.chain_mix_calls) > before_mix_calls

    asyncio.run(_run())


def test_t741_set_morph_position_should_drive_runtime_parameter_interpolation(tmp_path, monkeypatch):
    async def _run():
        service, created, activated, engine_stub = await _create_and_activate_open_gap_snapshot(
            tmp_path,
            monkeypatch,
            detail_payload={
                "channels": [
                    {"channel_key": "channel-a", "label": "A", "color": "#2563eb", "chain_id": 1},
                    {"channel_key": "channel-b", "label": "B", "color": "#22c55e", "chain_id": 2},
                ],
                "chains": [
                    {"id": 1, "name": "A", "plugins": [{"uri": "urn:test:plugin-a", "position": 0, "bypass": False, "parameters": {"0": 0.0}}]},
                    {"id": 2, "name": "B", "plugins": [{"uri": "urn:test:plugin-a", "position": 0, "bypass": False, "parameters": {"0": 1.0}}]},
                ],
                "routing": {
                    "mode": "morph",
                    "active_channel_key": "channel-a",
                    "morph_position": 0.0,
                    "morph_source_channel_key": "channel-a",
                    "morph_target_channel_key": "channel-b",
                    "series_order": ["channel-a", "channel-b"],
                },
                "midi_map": [],
            },
        )
        assert activated is not None
        before_calls = len(engine_stub.parameter_calls)
        updated = await service.set_morph_position(created["id"], 0.75)
        assert updated is not None
        assert len(engine_stub.parameter_calls) > before_calls
        assert updated["morph_apply"]["applied"] is True
        assert updated["morph_apply"]["applied_count"] == 1
        assert engine_stub.parameter_calls[-1][2] == pytest.approx(0.75)

    asyncio.run(_run())

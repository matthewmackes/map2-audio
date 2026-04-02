import asyncio
import io
import json
import zipfile
from pathlib import Path

from app import database as database_module
from app.services import snapshot_runtime_service
from app.services import snapshot_service as snapshot_service_module
from app.services import snapshot_runtime_state_service as runtime_state_service_module
from app.services import upload_service as upload_service_module
from app.services.chain_service import ChainService
from app.services.midi_service import ActionType, CommandType, MIDICommandDTO, midi_service
from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService
from app.services.snapshot_service import SnapshotActivationPreflightError, SnapshotService
from app.services.snapshot_system_blocks import NOISE_GATE_PLUGIN_URI
from app.services.snapshot_tempo_service import reset_snapshot_tempo_service
from sqlalchemy import select


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

    async def _fake_activate_chain(self, chain_id):
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
            assert created["session_notes"] == []
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

            notes = await service.add_session_note(created["id"], "First rehearsal note")
            assert notes is not None
            assert len(notes) == 1
            assert notes[0]["body"] == "First rehearsal note"

            notes = await service.add_session_note(created["id"], "Second rehearsal note")
            assert notes is not None
            assert [note["body"] for note in notes] == [
                "Second rehearsal note",
                "First rehearsal note",
            ]

            listed_notes = await service.list_session_notes(created["id"])
            assert listed_notes is not None
            assert [note["body"] for note in listed_notes] == [
                "Second rehearsal note",
                "First rehearsal note",
            ]

            detail_with_notes = await service.get_snapshot(created["id"])
            assert detail_with_notes is not None
            assert [note["body"] for note in detail_with_notes["session_notes"]] == [
                "Second rehearsal note",
                "First rehearsal note",
            ]

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

    async def _fake_activate_chain(self, chain_id):
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

    async def _healthy_activate_chain(self, chain_id):
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

    async def _healthy_activate_chain(self, chain_id):
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

            restored = await service.restore_revision(created["id"], 1)
            assert restored is not None
            assert len(restored["chains"][0]["plugins"]) == 2

            revisions_after_restore = await service.list_revisions(created["id"])
            assert revisions_after_restore is not None
            assert len(revisions_after_restore) == 2
            assert revisions_after_restore[0]["revision_number"] == 2
            assert revisions_after_restore[0]["summary"] == "2 blocks, 1 channel, parallel blend routing"

    asyncio.run(_run())

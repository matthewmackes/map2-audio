import asyncio

from app import database as database_module
from app.services import snapshot_runtime_service
from app.services.chain_service import ChainService
from app.services.snapshot_runtime_state_service import SnapshotRuntimeStateService
from app.services.snapshot_service import SnapshotService
from app.services.snapshot_tempo_service import reset_snapshot_tempo_service
from sqlalchemy import select


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    reset_snapshot_tempo_service()
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'snapshot-service.db'}")


def test_snapshot_service_crud_activation_and_import(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(snapshot_data):
        assert snapshot_data["flowSlots"][0]["label"] == "A"
        return 3, 2

    async def _fake_apply_tempo(_snapshot_data, _bpm):
        return 1

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_tempo_to_engine", _fake_apply_tempo)

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
                    "midi_map": [{"action": "load_snapshot", "program_number": 10}],
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
            assert created["paths"][0]["id"] == "channel-0"
            assert created["paths"][0]["label"] == "A"
            assert created["session_notes"] == []

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
            assert activated["snapshot_data"]["tempo_bpm"] == 140.0
            assert activated["snapshot_data"]["active_tempo_bpm"] == 140.0
            assert activated["snapshot_data"]["tempo_source"] == "stored"

            live_snapshot = await service.get_live_snapshot()
            assert live_snapshot is not None
            assert live_snapshot["id"] == created["id"]
            assert live_snapshot["live_state"]["is_live"] is True
            assert live_snapshot["snapshot_revision"] == activated["snapshot_revision"]
            assert live_snapshot["tempo_bpm"] == 140.0
            assert live_snapshot["active_tempo_bpm"] == 140.0

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

            saved_as_new = await service.save_snapshot_as_new(created["id"], name="UnifiedSnapshotV2")
            assert saved_as_new is not None
            assert saved_as_new["name"] == "UnifiedSnapshotV2"
            assert saved_as_new["program_number"] is None
            assert saved_as_new["lineage"]["derived_from_snapshot_id"] == created["id"]
            assert saved_as_new["controls"]["midi_map"][0]["program_number"] == 10
            assert saved_as_new["controls"]["maschine_encoder_map"]["enc3"]["param_id"] == "mix"
            assert saved_as_new["is_locked"] is False

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


def test_deactivate_snapshot_runtime_chain_removes_live_path(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 0, 0

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)

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
            assert revisions[0]["summary"] == "1 block, 1 channel, parallel blend routing"

            restored = await service.restore_revision(created["id"], 1)
            assert restored is not None
            assert len(restored["chains"][0]["plugins"]) == 1

            revisions_after_restore = await service.list_revisions(created["id"])
            assert revisions_after_restore is not None
            assert len(revisions_after_restore) == 2
            assert revisions_after_restore[0]["revision_number"] == 2
            assert revisions_after_restore[0]["summary"] == "2 blocks, 1 channel, parallel blend routing"

    asyncio.run(_run())

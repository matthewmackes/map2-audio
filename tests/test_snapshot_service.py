import asyncio

from app import database as database_module
from app.services import snapshot_runtime_service
from app.services.snapshot_service import SnapshotService


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'snapshot-service.db'}")


def test_snapshot_service_crud_activation_and_import(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(snapshot_data):
        assert snapshot_data["flowSlots"][0]["label"] == "A"
        return 3, 2

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)

    async def _run():
        async with database_module.get_session() as session:
            service = SnapshotService(session)

            created = await service.create_snapshot(
                name="Unified Snapshot",
                description="Service test",
                tags=["service"],
                program_number=10,
                input_device="Capture 1",
                output_device="Playback 1",
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

            assert created["name"] == "Unified Snapshot"
            assert created["channel_count"] == 1
            assert created["chain_count"] == 1
            assert created["routing"]["mode"] == "parallel_blend"
            assert created["midi_map"][0]["program_number"] == 10
            assert created["input_device"] == "Capture 1"
            assert created["output_device"] == "Playback 1"

            renamed = await service.update_snapshot(
                created["id"],
                input_device="Capture 2",
                output_device=None,
            )
            assert renamed is not None
            assert renamed["input_device"] == "Capture 2"
            assert renamed["output_device"] is None

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

            exported = await service.export_snapshot(created["id"])
            assert exported is not None
            assert exported["snapshot"]["name"] == "Unified Snapshot"

            imported = await service.import_snapshot(
                {
                    "snapshot": {
                        "name": "Imported Placeholder Snapshot",
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

            listed = await service.list_snapshots()
            assert len(listed) == 2
            assert {item["name"] for item in listed} == {
                "Unified Snapshot",
                "Imported Placeholder Snapshot",
            }
            summary = next(item for item in listed if item["name"] == "Unified Snapshot")
            assert summary["input_device"] == "Capture 2"
            assert summary["output_device"] is None

            by_program = await service.get_snapshot_by_program(10)
            assert by_program is not None
            assert by_program["id"] == created["id"]
            assert by_program["input_device"] == "Capture 2"
            assert by_program["output_device"] is None

    asyncio.run(_run())

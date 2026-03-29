import asyncio
import json
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import select

from app import database as database_module
from app.services import snapshot_runtime_service
from scripts import migrate_to_unified_snapshots as migration


def _init_temp_db(tmp_path: Path):
    db_path = tmp_path / "snapshot-migration.db"
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_db(f"sqlite:///{db_path}")
    database_module.init_async_db(f"sqlite+aiosqlite:///{db_path}")
    return db_path


def test_unified_snapshot_migration_script_migrates_flow_snapshots_and_orphan_chains(tmp_path, monkeypatch):
    db_path = _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _seed():
        async with database_module.get_session() as session:
            flow_snapshot = database_module.FlowSnapshot(
                name="Legacy Flow Snapshot",
                description="Legacy snapshot payload",
                tags=["legacy"],
                snapshot_data=json.dumps(
                    {
                        "flowSlots": [
                            {
                                "id": "flow-0",
                                "chainId": 100,
                                "label": "A",
                                "color": "#2563eb",
                                "muted": False,
                                "solo": False,
                                "dryWetMix": 100.0,
                            }
                        ],
                        "routing": {
                            "mode": "parallel_blend",
                            "activeSlotId": "flow-0",
                            "blendPositions": {"flow-0": 100.0},
                            "morphProgress": 0.5,
                            "morphSourceSlotId": None,
                            "morphTargetSlotId": None,
                            "seriesOrder": ["flow-0"],
                        },
                        "activeFlowIndex": 0,
                        "chains": {
                            "100": {
                                "name": "Legacy Chain",
                                "plugins": [
                                    {
                                        "uri": "urn:test:legacy",
                                        "position": 0,
                                        "bypass": False,
                                        "parameters": {"gain": 0.5},
                                    }
                                ],
                            }
                        },
                    }
                ),
                display_order=0,
            )
            orphan_chain = database_module.Chain(name="Orphan Chain", is_active=False)
            session.add_all([flow_snapshot, orphan_chain])
            await session.flush()
            session.add(
                database_module.ChainPlugin(
                    chain_id=orphan_chain.id,
                    plugin_uri="urn:test:orphan",
                    position=0,
                    bypass=False,
                )
            )

    asyncio.run(_seed())

    def _init_for_script(_database_url=None):
        database_module._tables_created = False
        database_module._pragmas_set = False
        database_module.init_db(f"sqlite:///{db_path}")
        database_module.init_async_db(f"sqlite+aiosqlite:///{db_path}")

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(migration, "args", SimpleNamespace(skip_backup=True))
    monkeypatch.setattr(migration, "_resolve_database_path", lambda: db_path)
    monkeypatch.setattr(migration, "init_db", _init_for_script)

    asyncio.run(migration.migrate())

    async def _verify():
        async with database_module.get_session() as session:
            result = await session.execute(select(database_module.Snapshot).order_by(database_module.Snapshot.id.asc()))
            snapshots = result.scalars().all()
            assert len(snapshots) == 2
            all_tags = [tag for snapshot in snapshots for tag in (snapshot.tags or [])]
            assert "legacy-flow-snapshot:1" in all_tags
            assert "legacy-chain:1" in all_tags

    asyncio.run(_verify())

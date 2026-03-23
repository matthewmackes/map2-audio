import asyncio
import json

from app import database as database_module
from app.routes import flow_snapshots as routes
from app.routes import plugins as plugins_routes
from app.services import juce_engine_service


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'flow-snapshots-routes.db'}")


async def _seed_snapshot() -> int:
    async with database_module.get_session() as session:
        snapshot = database_module.FlowSnapshot(
            name="Snapshot 01",
            description="Original snapshot",
            tags=["baseline"],
            program_number=12,
            snapshot_data=json.dumps({
                "flowSlots": [
                    {
                        "id": "flow-a",
                        "chainId": 1,
                        "label": "A",
                        "color": "#2563eb",
                        "muted": False,
                        "solo": False,
                        "dryWetMix": 100.0,
                    }
                ],
                "routing": {
                    "mode": "parallel_blend",
                    "activeSlotId": "flow-a",
                    "blendPositions": {"flow-a": 100.0},
                    "morphProgress": 0.0,
                    "morphSourceSlotId": None,
                    "morphTargetSlotId": None,
                    "seriesOrder": ["flow-a"],
                },
                "activeFlowIndex": 0,
                "chains": {},
            }),
            display_order=1,
            is_active=True,
            is_favorite=False,
        )
        session.add(snapshot)
        await session.flush()
        return int(snapshot.id)


def test_update_snapshot_route_can_replace_snapshot_data(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    monkeypatch.setattr(routes, "_enrich_snapshot_data", _passthrough)
    snapshot_id = asyncio.run(_seed_snapshot())

    async def _run():
        updated = await routes.update_snapshot(
            snapshot_id,
            routes.UpdateSnapshotRequest(
                description="Updated snapshot",
                snapshot_data=routes.SnapshotData(
                    flowSlots=[
                        routes.FlowSlotData(
                            id="flow-b",
                            chainId=None,
                            label="B",
                            color="#22c55e",
                            muted=False,
                            solo=True,
                            dryWetMix=55.0,
                        )
                    ],
                    routing=routes.RoutingConfigData(
                        mode="series",
                        activeSlotId="flow-b",
                        blendPositions={"flow-b": 55.0},
                        morphProgress=0.0,
                        morphSourceSlotId=None,
                        morphTargetSlotId=None,
                        seriesOrder=["flow-b"],
                    ),
                    activeFlowIndex=0,
                    chains={},
                ),
            ),
        )
        assert updated["status"] == "success"

        fetched = await routes.get_snapshot(snapshot_id)
        assert fetched["description"] == "Updated snapshot"
        assert fetched["snapshot_data"]["flowSlots"][0]["label"] == "B"
        assert fetched["snapshot_data"]["routing"]["mode"] == "series"

        listed = await routes.list_snapshots()
        listed_snapshot = next(item for item in listed["snapshots"] if item["id"] == snapshot_id)
        assert listed_snapshot["flow_slots"][0]["label"] == "B"
        assert listed_snapshot["flow_slots"][0]["chainId"] is None

    asyncio.run(_run())


def test_preview_snapshot_route_does_not_change_active_snapshot(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _fake_prepare(_session, snapshot_data):
        return snapshot_data, 0

    async def _fake_apply(_snapshot_data):
        return 0, 0

    monkeypatch.setattr(routes, "_prepare_snapshot_runtime", _fake_prepare)
    monkeypatch.setattr(routes, "_apply_snapshot_to_engine", _fake_apply)
    snapshot_id = asyncio.run(_seed_snapshot())

    async def _run():
        preview = await routes.preview_snapshot(
            routes.PreviewSnapshotRequest(
                snapshot_data=routes.SnapshotData(
                    flowSlots=[
                        routes.FlowSlotData(
                            id="flow-preview",
                            chainId=None,
                            label="Preview",
                            color="#f59e0b",
                            muted=False,
                            solo=False,
                            dryWetMix=88.0,
                        )
                    ],
                    routing=routes.RoutingConfigData(
                        mode="series",
                        activeSlotId="flow-preview",
                        blendPositions={"flow-preview": 88.0},
                        morphProgress=0.0,
                        morphSourceSlotId=None,
                        morphTargetSlotId=None,
                        seriesOrder=["flow-preview"],
                    ),
                    activeFlowIndex=0,
                    chains={},
                ),
            )
        )
        assert preview["status"] == "success"
        assert preview["snapshot_data"]["flowSlots"][0]["label"] == "Preview"

        listed = await routes.list_snapshots()
        assert listed["active_id"] == snapshot_id

    asyncio.run(_run())


class _FakeSnapshotEngine:
    is_available = True
    is_running = True

    def __init__(self) -> None:
        self.parameter_reads: list[tuple[str, str, int | None]] = []
        self.parameter_sets: list[tuple[str, str, float, int | None]] = []
        self.bypass_sets: list[tuple[int, bool]] = []

    async def get_parameter(self, plugin_uri: str, symbol: str, *, plugin_position: int | None = None) -> float:
        self.parameter_reads.append((plugin_uri, symbol, plugin_position))
        return 0.15 if plugin_position == 0 else 0.85

    def _get_instance_id_for_uri(self, plugin_uri: str, plugin_position: int | None = None):
        if plugin_uri != "urn:test:duplicate":
            return None
        return {0: 101, 1: 202}.get(plugin_position)

    async def set_bypass(self, instance_id: int, bypass: bool) -> bool:
        self.bypass_sets.append((instance_id, bypass))
        return True

    async def set_parameter(
        self,
        plugin_uri: str,
        symbol: str,
        value: float,
        *,
        plugin_position: int | None = None,
        instance_id: int | None = None,
    ) -> bool:
        del instance_id
        self.parameter_sets.append((plugin_uri, symbol, value, plugin_position))
        return True


def test_enrich_snapshot_data_reads_duplicate_plugin_parameters_by_position(monkeypatch):
    fake_engine = _FakeSnapshotEngine()
    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: fake_engine)
    monkeypatch.setattr(
        plugins_routes,
        "_discovered_plugins",
        [
            {
                "uri": "urn:test:duplicate",
                "parameters": [{"index": 0, "name": "Gain", "symbol": "gain"}],
            }
        ],
    )

    snapshot = {
        "chains": {
            "1": {
                "name": "Chain 1",
                "plugins": [
                    {"uri": "urn:test:duplicate", "position": 0, "parameters": {}},
                    {"uri": "urn:test:duplicate", "position": 1, "parameters": {}},
                ],
            }
        }
    }

    enriched = asyncio.run(routes._enrich_snapshot_data(snapshot))  # noqa: SLF001

    plugins = enriched["chains"]["1"]["plugins"]
    assert plugins[0]["parameters"] == {"0": 0.15}
    assert plugins[1]["parameters"] == {"0": 0.85}
    assert fake_engine.parameter_reads == [
        ("urn:test:duplicate", "gain", 0),
        ("urn:test:duplicate", "gain", 1),
    ]


def test_apply_snapshot_to_engine_targets_duplicate_instances_by_position(monkeypatch):
    fake_engine = _FakeSnapshotEngine()
    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: fake_engine)
    monkeypatch.setattr(
        plugins_routes,
        "_discovered_plugins",
        [
            {
                "uri": "urn:test:duplicate",
                "parameters": [{"index": 0, "name": "Gain", "symbol": "gain"}],
            }
        ],
    )

    snapshot = {
        "chains": {
            "1": {
                "name": "Chain 1",
                "plugins": [
                    {"uri": "urn:test:duplicate", "position": 0, "bypass": True, "parameters": {"0": 0.11}},
                    {"uri": "urn:test:duplicate", "position": 1, "bypass": False, "parameters": {"0": 0.82}},
                ],
            }
        }
    }

    params_applied, bypass_applied = asyncio.run(routes._apply_snapshot_to_engine(snapshot))  # noqa: SLF001

    assert (params_applied, bypass_applied) == (2, 2)
    assert fake_engine.bypass_sets == [(101, True), (202, False)]
    assert fake_engine.parameter_sets == [
        ("urn:test:duplicate", "gain", 0.11, 0),
        ("urn:test:duplicate", "gain", 0.82, 1),
    ]

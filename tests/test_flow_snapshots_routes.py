import asyncio
import json

from app import database as database_module
from app.routes import flow_snapshots as routes
from app.routes import plugins as plugins_routes
from app.services.chain_service import ChainService
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
        self.loaded_models: list[tuple[int, str]] = []
        self.loaded_cabinet_irs: list[tuple[int, str]] = []
        self.loaded_reverb_irs: list[tuple[int, str]] = []
        self.nam_input_gains: list[tuple[int, float]] = []
        self.nam_output_gains: list[tuple[int, float]] = []
        self.nam_normalize: list[tuple[int, bool]] = []
        self.nam_bypass: list[tuple[int, bool]] = []
        self.ir_mix: list[tuple[int, float]] = []
        self.ir_bypass: list[tuple[int, bool]] = []

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

    async def load_nam_model_instance(self, instance_id: int, path: str) -> bool:
        self.loaded_models.append((instance_id, path))
        return True

    async def set_nam_input_gain_instance(self, instance_id: int, db: float) -> bool:
        self.nam_input_gains.append((instance_id, db))
        return True

    async def set_nam_output_gain_instance(self, instance_id: int, db: float) -> bool:
        self.nam_output_gains.append((instance_id, db))
        return True

    async def set_nam_normalize_instance(self, instance_id: int, normalize: bool) -> bool:
        self.nam_normalize.append((instance_id, normalize))
        return True

    async def set_nam_bypass_instance(self, instance_id: int, bypass: bool) -> bool:
        self.nam_bypass.append((instance_id, bypass))
        return True

    async def load_cabinet_ir_instance(self, instance_id: int, path: str) -> bool:
        self.loaded_cabinet_irs.append((instance_id, path))
        return True

    async def load_reverb_ir_instance(self, instance_id: int, path: str) -> bool:
        self.loaded_reverb_irs.append((instance_id, path))
        return True

    async def set_ir_mix_instance(self, instance_id: int, mix: float) -> bool:
        self.ir_mix.append((instance_id, mix))
        return True

    async def set_ir_bypass_instance(self, instance_id: int, bypass: bool) -> bool:
        self.ir_bypass.append((instance_id, bypass))
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


def test_apply_snapshot_to_engine_restores_loader_state(monkeypatch):
    fake_engine = _FakeSnapshotEngine()
    monkeypatch.setattr(juce_engine_service, "get_audio_engine", lambda: fake_engine)
    monkeypatch.setattr(
        plugins_routes,
        "_discovered_plugins",
        [
            {
                "uri": "map2://juce/nam",
                "parameters": [{"index": 0, "name": "Gain", "symbol": "gain"}],
            },
            {
                "uri": "map2://juce/convolution/cabinet",
                "parameters": [],
            },
        ],
    )

    original_get_instance = fake_engine._get_instance_id_for_uri

    def _get_instance(plugin_uri: str, plugin_position: int | None = None):
        if plugin_uri == "map2://juce/nam":
            return 111
        if plugin_uri == "map2://juce/convolution/cabinet":
            return 222
        return original_get_instance(plugin_uri, plugin_position)

    fake_engine._get_instance_id_for_uri = _get_instance  # type: ignore[method-assign]

    snapshot = {
        "chains": {
            "1": {
                "name": "Chain 1",
                "plugins": [
                    {
                        "uri": "map2://juce/nam",
                        "position": 0,
                        "bypass": False,
                        "parameters": {"0": 0.42},
                        "loader_state": {
                            "selected_asset_name": "Crunch Deluxe",
                            "selected_asset_path": "/tmp/crunch-deluxe.nam",
                            "input_gain": 2.5,
                            "output_gain": -1.0,
                            "normalize": False,
                            "bypass": True,
                        },
                    },
                    {
                        "uri": "map2://juce/convolution/cabinet",
                        "position": 1,
                        "bypass": False,
                        "parameters": {},
                        "loader_state": {
                            "selected_asset_name": "Mesa 4x12",
                            "selected_asset_path": "/tmp/mesa.wav",
                            "mix": 64.0,
                            "bypass": True,
                        },
                    },
                ],
            }
        }
    }

    params_applied, bypass_applied = asyncio.run(routes._apply_snapshot_to_engine(snapshot))  # noqa: SLF001

    assert (params_applied, bypass_applied) == (1, 2)
    assert fake_engine.loaded_models == [(111, "/tmp/crunch-deluxe.nam")]
    assert fake_engine.nam_input_gains == [(111, 2.5)]
    assert fake_engine.nam_output_gains == [(111, -1.0)]
    assert fake_engine.nam_normalize == [(111, False)]
    assert fake_engine.nam_bypass == [(111, True)]
    assert fake_engine.loaded_cabinet_irs == [(222, "/tmp/mesa.wav")]
    assert fake_engine.ir_mix == [(222, 64.0)]
    assert fake_engine.ir_bypass == [(222, True)]


def test_prepare_snapshot_runtime_preserves_loader_state_for_missing_chains(tmp_path):
    _init_temp_db(tmp_path)

    snapshot = {
        "flowSlots": [
            {
                "id": "flow-a",
                "chainId": 77,
                "label": "A",
                "color": "#2563eb",
                "muted": False,
                "solo": False,
                "dryWetMix": 100.0,
            }
        ],
        "routing": {"mode": "series"},
        "activeFlowIndex": 0,
        "chains": {
            "77": {
                "name": "Recreated Chain",
                "plugins": [
                    {
                        "uri": "map2://juce/nam",
                        "position": 0,
                        "bypass": False,
                        "parameters": {},
                        "loader_state": {
                            "selected_asset_name": "Edge Clean",
                            "selected_asset_path": "/tmp/edge-clean.nam",
                            "input_gain": 1.25,
                            "output_gain": -0.5,
                            "normalize": True,
                        },
                    }
                ],
            }
        },
    }

    async def _run():
        async with database_module.get_session() as session:
            prepared, chains_created = await routes._prepare_snapshot_runtime(session, snapshot)  # noqa: SLF001
            assert chains_created == 1
            new_chain_id = prepared["flowSlots"][0]["chainId"]
            payload = await ChainService(session).get_chain(new_chain_id)
            assert payload["plugins"][0]["loader_state"] == {
                "selected_model": "Edge Clean",
                "selected_asset_name": "Edge Clean",
                "selected_asset_path": "/tmp/edge-clean.nam",
                "input_gain": 1.25,
                "output_gain": -0.5,
                "normalize": True,
                "bypass": False,
            }

    asyncio.run(_run())

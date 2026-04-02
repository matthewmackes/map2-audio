import asyncio

from app import database as database_module
from app.services import snapshot_deployment_service as deployment_service_module
from app.services.snapshot_deployment_service import SnapshotDeploymentService
from app.services.snapshot_runtime_service import enrich_snapshot_data
from app.services.snapshot_service import SnapshotService


class _FakeRegistry:
    def __init__(self) -> None:
        self._nodes = [
            {"id": "node-a", "status": "online", "cpu_load": 20.0},
            {"id": "node-b", "status": "online", "cpu_load": 5.0},
            {"id": "node-c", "status": "online", "cpu_load": 12.0},
            {"id": "node-d", "status": "maintenance", "cpu_load": 1.0},
        ]

    def get_node(self, node_id: str):
        return next((node for node in self._nodes if node["id"] == node_id), None)

    def get_all_nodes(self):
        return list(self._nodes)


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'snapshot-deployment.db'}")


def test_snapshot_deployment_service_handles_deploy_failover_and_reassignment(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)
    deployed_assets: list[tuple[str, str, tuple[str, ...]]] = []

    async def _passthrough(snapshot_data):
        return snapshot_data

    class _FakeDistributor:
        async def deploy_nam_model(self, model_path: str, target_node_ids: list[str]):
            deployed_assets.append(("nam", model_path, tuple(target_node_ids)))
            return {node_id: True for node_id in target_node_ids}

        async def deploy_ir(self, ir_path: str, target_node_ids: list[str]):
            deployed_assets.append(("ir", ir_path, tuple(target_node_ids)))
            return {node_id: True for node_id in target_node_ids}

    monkeypatch.setattr(deployment_service_module, "get_cluster_registry", lambda: _FakeRegistry())
    monkeypatch.setattr(deployment_service_module, "get_content_distributor", lambda: _FakeDistributor())
    monkeypatch.setattr("app.services.snapshot_runtime_service.enrich_snapshot_data", _passthrough)

    async def _run():
        model_path = tmp_path / "deploy-tone.nam"
        model_path.write_bytes(b"deployable-nam")

        async with database_module.get_session() as session:
            snapshot_service = SnapshotService(session)
            created = await snapshot_service.create_snapshot(
                name="DeployableSnapshot",
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
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {},
                                    "loader_state": {
                                        "selected_model": "DeployTone",
                                        "selected_asset_name": "DeployTone",
                                        "selected_asset_path": str(model_path),
                                    },
                                }
                            ],
                            "loop_insertions": [],
                            "effects_loops": [],
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
            snapshot_id = created["id"]

            service = SnapshotDeploymentService(session)

            deployed = await service.deploy_snapshot(
                snapshot_id,
                node_id="node-a",
                redundancy_enabled=True,
            )
            assert deployed is not None
            assert deployed["primary_node_id"] == "node-a"
            assert deployed["standby_node_ids"] == ["node-b", "node-c"]
            assert deployed_assets == [
                ("nam", str(model_path), ("node-a", "node-b", "node-c")),
            ]

            deployments_on_primary = await service.list_deployments(primary_node_id="node-a")
            assert len(deployments_on_primary) == 1
            assert deployments_on_primary[0]["snapshot_id"] == snapshot_id

            failed_over = await service.failover_snapshot(
                snapshot_id,
                retain_previous_primary=False,
            )
            assert failed_over is not None
            assert failed_over["primary_node_id"] == "node-b"
            assert failed_over["standby_node_ids"] == ["node-c"]

            reassigned = await service.reassign_snapshot(
                snapshot_id,
                node_id="node-c",
                failed_node_ids={"node-b"},
                assignment_strategy="automatic-failover",
            )
            assert reassigned is not None
            assert reassigned["primary_node_id"] == "node-c"
            assert reassigned["standby_node_ids"] == []
            assert reassigned["assignment_strategy"] == "automatic-failover"

            best_node = service.select_best_node(excluded_node_ids={"node-c"})
            assert best_node == "node-b"

    asyncio.run(_run())

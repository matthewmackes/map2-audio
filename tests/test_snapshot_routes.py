import asyncio

from app import database as database_module
from app.routes import cluster_snapshots as cluster_routes
from app.routes import unified_snapshots as routes
from app.services import snapshot_deployment_service as deployment_service_module
from app.services import snapshot_runtime_service


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'snapshot-routes.db'}")


class _FakeRegistry:
    def __init__(self) -> None:
        self._nodes = {
            "node-a": {"id": "node-a", "status": "online", "hostname": "Node A"},
            "node-b": {"id": "node-b", "status": "online", "hostname": "Node B"},
            "node-c": {"id": "node-c", "status": "maintenance", "hostname": "Node C"},
        }

    def get_node(self, node_id: str):
        return self._nodes.get(node_id)

    def get_all_nodes(self):
        return list(self._nodes.values())

    def update_node_status(self, node_id: str, status: str):
        node = self._nodes.get(node_id)
        if node is None:
            return False
        node["status"] = status
        return True


def test_unified_snapshot_routes_and_cluster_routes(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 1, 1

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(deployment_service_module, "get_cluster_registry", lambda: _FakeRegistry())

    async def _run():
        created = await routes.create_snapshot(
            routes.SnapshotCreateRequest(
                name="Route Snapshot",
                description="Created through route",
                channels=[
                    routes.SnapshotChannelInput(
                        channel_key="channel-0",
                        label="A",
                        color="#2563eb",
                        chain_id=1,
                    )
                ],
                chains=[
                    routes.SnapshotChainInput(
                        id=1,
                        name="Route Chain",
                        plugins=[
                            routes.SnapshotPluginInput(
                                uri="urn:test:route-plugin",
                                name="Route Plugin",
                                parameters={"drive": 0.75},
                            )
                        ],
                    )
                ],
                routing=routes.SnapshotRoutingInput(
                    mode="parallel_blend",
                    active_channel_key="channel-0",
                    blend_positions={"channel-0": 100.0},
                    series_order=["channel-0"],
                ),
            )
        )
        snapshot_id = created["snapshot_id"]
        assert created["status"] == "success"

        listed = await routes.list_snapshots()
        assert listed["count"] == 1
        assert listed["snapshots"][0]["name"] == "Route Snapshot"

        fetched = await routes.get_snapshot(snapshot_id)
        assert fetched["channels"][0]["label"] == "A"

        replaced_midi_map = await routes.replace_midi_map(
            snapshot_id,
            routes.MidiMapRequest(entries=[{"action": "load_snapshot", "program_number": 5}]),
        )
        assert replaced_midi_map["midi_map"][0]["program_number"] == 5

        activated = await routes.activate_snapshot(snapshot_id)
        assert activated["status"] == "success"

        shared = await routes.share_snapshot(snapshot_id, routes.CommunityShareRequest(author_name="Codex"))
        assert shared["snapshot"]["community_shared"] is True

        community = await routes.browse_community_snapshots()
        assert community["count"] == 1
        community_uuid = community["snapshots"][0]["community_uuid"]

        rated = await routes.rate_community_snapshot(community_uuid, routes.CommunityRateRequest(rating=4))
        assert rated["snapshot"]["community_rating_count"] == 1

        downloaded = await routes.download_community_snapshot(community_uuid)
        assert downloaded["snapshot"]["name"] == "Route Snapshot"

        deployment = await cluster_routes.deploy_snapshot(
            cluster_routes.SnapshotDeployRequest(
                snapshot_id=snapshot_id,
                node_id="node-a",
                redundancy_enabled=True,
            )
        )
        assert deployment["status"] == "deployed"
        assert deployment["deployment"]["primary_node_id"] == "node-a"
        assert "node-b" in deployment["deployment"]["standby_node_ids"]

        deployment_list = await cluster_routes.list_snapshot_deployments()
        assert deployment_list["total"] == 1

        failover = await cluster_routes.failover_snapshot(
            cluster_routes.SnapshotFailoverRequest(snapshot_id=snapshot_id)
        )
        assert failover["status"] == "failed_over"
        assert failover["deployment"]["primary_node_id"] == "node-b"

    asyncio.run(_run())

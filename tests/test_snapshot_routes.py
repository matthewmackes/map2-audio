import asyncio

from app import database as database_module
from app.routes import cluster_snapshots as cluster_routes
from app.routes import chains as chain_routes
from app.routes import unified_snapshots as routes
from app.services.chain_service import ChainService
from app.services import snapshot_deployment_service as deployment_service_module
from app.services import snapshot_runtime_service
from sqlalchemy import select


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
    cache_invalidations: list[str] = []

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 1, 1

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(deployment_service_module, "get_cluster_registry", lambda: _FakeRegistry())
    monkeypatch.setattr(chain_routes, "_invalidate_chain_list_cache", lambda: cache_invalidations.append("chains"))

    async def _fake_activate_chain(self, chain_id):
        result = await self.session.execute(select(database_module.Chain).filter(database_module.Chain.id == chain_id))
        chain = result.scalar_one_or_none()
        if chain is not None:
            chain.is_active = True
        return True

    monkeypatch.setattr(ChainService, "activate_chain", _fake_activate_chain)

    async def _run():
        created = await routes.create_snapshot(
            routes.SnapshotCreateRequest(
                name="Route Snapshot",
                description="Created through route",
                io_bindings=routes.SnapshotIOBindingsInput(
                    input_device="Route In",
                    output_device="Route Out",
                ),
                controls=routes.SnapshotControlsInput(
                    midi_map=[{"action": "load_snapshot", "program_number": 12}],
                ),
                paths=[
                    routes.SnapshotPathInput(
                        id="path-a",
                        name="Route Path A",
                        label="A",
                        color="#2563eb",
                        plugins=[
                            routes.SnapshotPluginInput(
                                uri="urn:test:route-plugin",
                                name="Route Plugin",
                                parameters={"drive": 0.75},
                            )
                        ],
                        snapshot_chain_id=1,
                    )
                ],
                routing=routes.SnapshotRoutingInput(
                    mode="parallel_blend",
                    active_channel_key="path-a",
                    blend_positions={"path-a": 100.0},
                    series_order=["path-a"],
                ),
            )
        )
        snapshot_id = created["snapshot_id"]
        assert created["status"] == "success"

        listed = await routes.list_snapshots()
        assert listed["count"] == 1
        assert listed["snapshots"][0]["name"] == "Route Snapshot"
        assert listed["snapshots"][0]["input_device"] == "Route In"
        assert listed["snapshots"][0]["output_device"] == "Route Out"
        assert listed["snapshots"][0]["lineage"]["derived_from_snapshot_id"] is None

        fetched = await routes.get_snapshot(snapshot_id)
        assert fetched["channels"][0]["label"] == "A"
        assert fetched["input_device"] == "Route In"
        assert fetched["output_device"] == "Route Out"
        assert fetched["paths"][0]["id"] == "path-a"
        assert fetched["controls"]["midi_map"][0]["program_number"] == 12

        patched = await routes.update_snapshot(
            snapshot_id,
            routes.SnapshotUpdateRequest(
                io_bindings=routes.SnapshotIOBindingsInput(input_device="Route In 2", output_device=None),
            ),
        )
        assert patched["snapshot"]["input_device"] == "Route In 2"
        assert patched["snapshot"]["output_device"] is None

        replaced_midi_map = await routes.replace_midi_map(
            snapshot_id,
            routes.MidiMapRequest(entries=[{"action": "load_snapshot", "program_number": 5}]),
        )
        assert replaced_midi_map["midi_map"][0]["program_number"] == 5

        activated = await routes.activate_snapshot(snapshot_id)
        assert activated["status"] == "success"
        assert activated["snapshot_data"]["live_state"]["is_live"] is True
        assert cache_invalidations == ["chains"]

        live_snapshot = await routes.get_live_snapshot()
        assert live_snapshot["id"] == snapshot_id
        assert live_snapshot["live_state"]["is_live"] is True

        draft = await routes.open_snapshot_draft(snapshot_id)
        assert draft["status"] == "success"
        assert draft["snapshot"]["id"] == snapshot_id

        saved_as_new = await routes.save_snapshot_as_new(
            snapshot_id,
            routes.SaveAsNewRequest(name="Route Snapshot v2"),
        )
        assert saved_as_new["status"] == "success"
        assert saved_as_new["snapshot"]["lineage"]["derived_from_snapshot_id"] == snapshot_id

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

    registered_paths = {route.path for route in routes.router.routes}
    assert "/api/snapshots" in registered_paths
    assert "/api/snapshots/{snapshot_id}" in registered_paths
    assert "/api/snapshots/{snapshot_id}/activate" in registered_paths
    assert not any(path.startswith("/api/flow-snapshots") for path in registered_paths)

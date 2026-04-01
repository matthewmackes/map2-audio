import asyncio

from app import database as database_module
from app.routes import cluster_snapshots as cluster_routes
from app.routes import chains as chain_routes
from app.routes import unified_snapshots as routes
from app.services.chain_service import ChainService
from app.services import snapshot_deployment_service as deployment_service_module
from app.services import snapshot_runtime_service
from app.services.snapshot_tempo_service import reset_snapshot_tempo_service
from fastapi import HTTPException
from sqlalchemy import select


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    reset_snapshot_tempo_service()
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

    async def _fake_apply_tempo(_snapshot_data, _bpm):
        return 1

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_tempo_to_engine", _fake_apply_tempo)
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
                name="RouteSnapshot",
                description="Created through route",
                tempo_bpm=126.0,
                is_locked=True,
                output_level_reference_dbfs=-14.0,
                output_level_warning_threshold_db=2.0,
                io_bindings=routes.SnapshotIOBindingsInput(
                    input_device="Route In",
                    output_device="Route Out",
                ),
                controls=routes.SnapshotControlsInput(
                    midi_map=[{"action": "load_snapshot", "program_number": 12}],
                    maschine_encoder_map={
                        "enc2": {"block_id": "block-1", "param_id": "mix", "label": "Mix"},
                    },
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
        assert created["snapshot"]["is_locked"] is True

        listed = await routes.list_snapshots()
        assert listed["count"] == 1
        assert listed["snapshots"][0]["name"] == "RouteSnapshot"
        assert listed["snapshots"][0]["is_locked"] is True
        assert listed["snapshots"][0]["input_device"] == "Route In"
        assert listed["snapshots"][0]["output_device"] == "Route Out"
        assert listed["snapshots"][0]["tempo_bpm"] == 126.0
        assert listed["snapshots"][0]["output_level_reference_dbfs"] == -14.0
        assert listed["snapshots"][0]["output_level_warning_threshold_db"] == 2.0
        assert listed["snapshots"][0]["lineage"]["derived_from_snapshot_id"] is None

        fetched = await routes.get_snapshot(snapshot_id)
        assert fetched["is_locked"] is True
        assert fetched["channels"][0]["label"] == "A"
        assert fetched["input_device"] == "Route In"
        assert fetched["output_device"] == "Route Out"
        assert fetched["tempo_bpm"] == 126.0
        assert fetched["output_level_reference_dbfs"] == -14.0
        assert fetched["output_level_warning_threshold_db"] == 2.0
        assert fetched["paths"][0]["id"] == "path-a"
        assert fetched["controls"]["midi_map"][0]["program_number"] == 12
        assert fetched["controls"]["maschine_encoder_map"]["enc2"]["param_id"] == "mix"
        assert fetched["session_notes"] == []

        added_note = await routes.add_snapshot_session_note(
            snapshot_id,
            routes.SnapshotSessionNoteCreateRequest(text="Arena mix translated well"),
        )
        assert added_note["status"] == "success"
        assert added_note["count"] == 1
        assert added_note["notes"][0]["body"] == "Arena mix translated well"

        listed_notes = await routes.list_snapshot_session_notes(snapshot_id)
        assert listed_notes["count"] == 1
        assert listed_notes["notes"][0]["body"] == "Arena mix translated well"

        patched = await routes.update_snapshot(
            snapshot_id,
            routes.SnapshotUpdateRequest(
                tempo_bpm=140.0,
                output_level_reference_dbfs=-10.0,
                output_level_warning_threshold_db=3.5,
                io_bindings=routes.SnapshotIOBindingsInput(input_device="Route In 2", output_device=None),
                controls=routes.SnapshotControlsInput(
                    midi_map=[{"action": "load_snapshot", "program_number": 12}],
                    maschine_encoder_map={
                        "enc4": {"block_id": "block-2", "param_id": "gain", "label": "Gain"},
                    },
                ),
            ),
        )
        assert patched["snapshot"]["tempo_bpm"] == 140.0
        assert patched["snapshot"]["output_level_reference_dbfs"] == -10.0
        assert patched["snapshot"]["output_level_warning_threshold_db"] == 3.5
        assert patched["snapshot"]["input_device"] == "Route In 2"
        assert patched["snapshot"]["output_device"] is None
        assert patched["snapshot"]["controls"]["maschine_encoder_map"]["enc4"]["param_id"] == "gain"

        replaced_midi_map = await routes.replace_midi_map(
            snapshot_id,
            routes.MidiMapRequest(entries=[{"action": "load_snapshot", "program_number": 5}]),
        )
        assert replaced_midi_map["midi_map"][0]["program_number"] == 5

        activated = await routes.activate_snapshot(snapshot_id)
        assert activated["status"] == "success"
        assert activated["snapshot_data"]["live_state"]["is_live"] is True
        assert activated["snapshot_data"]["live_state"]["paths"][0]["runtime_chain_id"] is not None
        assert len(activated["snapshot_data"]["live_state"]["runtime_chains"]) == 1
        assert activated["snapshot_data"]["tempo_bpm"] == 140.0
        assert activated["snapshot_data"]["active_tempo_bpm"] == 140.0
        assert activated["snapshot_data"]["tempo_source"] == "stored"
        assert cache_invalidations == ["chains"]

        tempo_status = await routes.get_snapshot_tempo(snapshot_id)
        assert tempo_status["tempo"]["stored_tempo_bpm"] == 140.0
        assert tempo_status["tempo"]["active_tempo_bpm"] == 140.0

        first_tap = await routes.tap_snapshot_tempo(
            snapshot_id,
            routes.SnapshotTempoTapRequest(timestamp_ms=1000.0),
        )
        assert first_tap["tempo"]["tempo_source"] == "stored"

        second_tap = await routes.tap_snapshot_tempo(
            snapshot_id,
            routes.SnapshotTempoTapRequest(timestamp_ms=1500.0),
        )
        assert second_tap["tempo"]["tempo_source"] == "tap"
        assert second_tap["tempo"]["active_tempo_bpm"] == 120.0
        assert second_tap["snapshot"]["live_tempo_bpm"] == 120.0

        live_snapshot = await routes.get_live_snapshot()
        assert live_snapshot["id"] == snapshot_id
        assert live_snapshot["live_state"]["is_live"] is True
        assert live_snapshot["snapshot_revision"] == activated["snapshot_revision"]
        assert live_snapshot["tempo_source"] == "tap"
        assert live_snapshot["active_tempo_bpm"] == 120.0

        reset_tempo = await routes.reset_snapshot_tempo(snapshot_id)
        assert reset_tempo["tempo"]["tempo_source"] == "stored"
        assert reset_tempo["snapshot"]["active_tempo_bpm"] == 140.0

        runtime_live_state = await routes.get_runtime_live_state()
        assert runtime_live_state["snapshot_id"] == snapshot_id
        assert runtime_live_state["display_state"] == "live"

        activation_events = await routes.get_runtime_activation_events()
        assert activation_events["count"] >= 1
        assert activation_events["events"][0]["snapshot_id"] == snapshot_id
        assert activation_events["events"][0]["outcome"] == "success"

        cluster_runtime = await routes.get_cluster_runtime_live_state()
        assert cluster_runtime["local_node_id"] == runtime_live_state["node_id"]
        assert any(node["snapshot_id"] == snapshot_id for node in cluster_runtime["nodes"])

        try:
            await routes.delete_snapshot(snapshot_id)
        except HTTPException as exc:
            assert exc.status_code == 409
            assert exc.detail == "Cannot delete a live snapshot."
        else:
            raise AssertionError("Deleting a live snapshot should fail")

        program_update = await routes.set_program_number(
            snapshot_id,
            routes.ProgramNumberRequest(program_number=5),
        )
        assert program_update["program_number"] == 5

        activated_by_program = await routes.activate_snapshot_by_program(5)
        assert activated_by_program["status"] == "success"
        assert activated_by_program["snapshot_id"] == snapshot_id
        assert cache_invalidations == ["chains", "chains"]

        draft = await routes.open_snapshot_draft(snapshot_id)
        assert draft["status"] == "success"
        assert draft["snapshot"]["id"] == snapshot_id

        saved_as_new = await routes.save_snapshot_as_new(
            snapshot_id,
            routes.SaveAsNewRequest(name="RouteSnapshotV2"),
        )
        assert saved_as_new["status"] == "success"
        assert saved_as_new["snapshot"]["lineage"]["derived_from_snapshot_id"] == snapshot_id
        assert saved_as_new["snapshot"]["is_locked"] is False

        duplicated = await routes.duplicate_snapshot(snapshot_id)
        assert duplicated["status"] == "success"
        assert duplicated["snapshot"]["name"] == "RouteSnapshotCopy"
        assert duplicated["snapshot"]["is_locked"] is False

        try:
            await routes.create_snapshot(routes.SnapshotCreateRequest(name="Route Snapshot"))
        except HTTPException as exc:
            assert exc.status_code == 400
            assert exc.detail == "Snapshot names may only contain letters and numbers, with no spaces or special characters."
        else:
            raise AssertionError("Invalid snapshot create name should fail")

        try:
            await routes.update_snapshot(
                snapshot_id,
                routes.SnapshotUpdateRequest(name="Route Snapshot"),
            )
        except HTTPException as exc:
            assert exc.status_code == 400
            assert exc.detail == "Snapshot names may only contain letters and numbers, with no spaces or special characters."
        else:
            raise AssertionError("Invalid snapshot rename should fail")

        shared = await routes.share_snapshot(snapshot_id, routes.CommunityShareRequest(author_name="Codex"))
        assert shared["snapshot"]["community_shared"] is True

        community = await routes.browse_community_snapshots()
        assert community["count"] == 1
        community_uuid = community["snapshots"][0]["community_uuid"]

        rated = await routes.rate_community_snapshot(community_uuid, routes.CommunityRateRequest(rating=4))
        assert rated["snapshot"]["community_rating_count"] == 1

        downloaded = await routes.download_community_snapshot(community_uuid)
        assert downloaded["snapshot"]["name"] == "RouteSnapshot"

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

        created_from_paths_only = await routes.create_snapshot(
            routes.SnapshotCreateRequest(
                name="PathsOnlySnapshot",
                snapshot_data={
                    "paths": [
                        {
                            "id": "ch_a",
                            "name": "Clean A",
                            "label": "A",
                            "color": "#2563eb",
                            "plugins": [],
                        },
                        {
                            "id": "ch_b",
                            "name": "Drive B",
                            "label": "B",
                            "color": "#22c55e",
                            "plugins": [
                                {
                                    "uri": "urn:test:path-only-plugin",
                                    "parameters": {"mix": 0.5},
                                }
                            ],
                        },
                    ],
                    "routing": {
                        "mode": "parallel_blend",
                        "active_channel_key": "ch_a",
                        "blend_positions": {"ch_a": 100.0, "ch_b": 100.0},
                        "series_order": ["ch_a", "ch_b"],
                    },
                },
            )
        )
        paths_only_id = created_from_paths_only["snapshot_id"]

        fetched_paths_only = await routes.get_snapshot(paths_only_id)
        channel_chain_ids = [channel["chain_id"] for channel in fetched_paths_only["channels"]]
        assert all(chain_id is not None for chain_id in channel_chain_ids)
        assert len(set(channel_chain_ids)) == 2
        assert fetched_paths_only["paths"][0]["snapshot_chain_id"] == fetched_paths_only["channels"][0]["chain_id"]
        assert fetched_paths_only["paths"][1]["snapshot_chain_id"] == fetched_paths_only["channels"][1]["chain_id"]
        assert any(
            chain["name"] == "Drive B" and chain["plugins"] and chain["plugins"][0]["uri"] == "urn:test:path-only-plugin"
            for chain in fetched_paths_only["chains"]
        )

        activated_paths_only = await routes.activate_snapshot(paths_only_id)
        assert activated_paths_only["status"] == "success"
        assert all(path["runtime_chain_id"] is not None for path in activated_paths_only["snapshot_data"]["live_state"]["paths"])
        assert len(activated_paths_only["snapshot_data"]["live_state"]["runtime_chains"]) == 2

        revision_snapshot = await routes.create_snapshot(
            routes.SnapshotCreateRequest(
                name="RevisionRouteSnapshot",
                snapshot_data={
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
                                    "uri": "urn:test:route-drive",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"gain": 0.5},
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
        )
        revision_snapshot_id = revision_snapshot["snapshot_id"]

        saved_revision_snapshot = await routes.update_snapshot(
            revision_snapshot_id,
            routes.SnapshotUpdateRequest(
                create_revision=True,
                snapshot_data={
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
                                    "uri": "urn:test:route-drive",
                                    "position": 0,
                                    "bypass": False,
                                    "parameters": {"gain": 0.5},
                                },
                                {
                                    "uri": "urn:test:route-delay",
                                    "position": 1,
                                    "bypass": False,
                                    "parameters": {"mix": 0.35},
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
            ),
        )
        assert len(saved_revision_snapshot["snapshot"]["chains"][0]["plugins"]) == 2

        revisions = await routes.list_snapshot_revisions(revision_snapshot_id)
        assert revisions["count"] == 1
        assert revisions["revisions"][0]["revision_number"] == 1
        assert revisions["revisions"][0]["summary"] == "1 block, 1 channel, parallel blend routing"

        restored_revision = await routes.restore_snapshot_revision(revision_snapshot_id, 1)
        assert restored_revision["status"] == "success"
        assert len(restored_revision["snapshot"]["chains"][0]["plugins"]) == 1

    asyncio.run(_run())

    registered_paths = {route.path for route in routes.router.routes}
    assert "/api/snapshots" in registered_paths
    assert "/api/snapshots/{snapshot_id}" in registered_paths
    assert "/api/snapshots/{snapshot_id}/notes" in registered_paths
    assert "/api/snapshots/{snapshot_id}/revisions" in registered_paths
    assert "/api/snapshots/{snapshot_id}/revisions/{revision_number}/restore" in registered_paths
    assert "/api/snapshots/{snapshot_id}/activate" in registered_paths
    assert not any(path.startswith("/api/flow-snapshots") for path in registered_paths)

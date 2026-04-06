import asyncio
import io
import json
import zipfile
from contextlib import asynccontextmanager

import pytest
from app import database as database_module
from app.routes import cluster_snapshots as cluster_routes
from app.routes import chains as chain_routes
from app.routes import unified_snapshots as routes
from app.services.chain_service import ChainService
from app.services import snapshot_deployment_service as deployment_service_module
from app.services import snapshot_runtime_service
from app.services import snapshot_service as snapshot_service_module
from app.services import snapshot_runtime_state_service as runtime_state_service_module
from app.services import upload_service as upload_service_module
from app.services.snapshot_system_blocks import NOISE_GATE_PLUGIN_URI
from app.services.snapshot_tempo_service import reset_snapshot_tempo_service
from fastapi import HTTPException
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    reset_snapshot_tempo_service()
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'snapshot-routes.db'}")


class _FakeSnapshotPluginLoader:
    def get_plugin_by_uri(self, uri: str):
        if uri == "urn:test:missing-plugin":
            return None
        if uri.startswith("urn:test:"):
            return {"uri": uri, "name": uri.rsplit(":", 1)[-1]}
        return None


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
    monkeypatch.setattr(snapshot_service_module, "get_plugin_loader", lambda: _FakeSnapshotPluginLoader())
    monkeypatch.setattr(deployment_service_module, "get_cluster_registry", lambda: _FakeRegistry())
    monkeypatch.setattr(runtime_state_service_module, "schedule_post_activation_health_check", lambda **kwargs: None)
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
                    monitoring_output_index=2,
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
                                uri="map2://juce/delay",
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
        assert created["snapshot"]["tags"] == ["delay"]

        listed = await routes.list_snapshots()
        assert listed["count"] == 1
        assert listed["snapshots"][0]["name"] == "RouteSnapshot"
        assert listed["snapshots"][0]["is_locked"] is True
        assert listed["snapshots"][0]["tags"] == ["delay"]
        assert listed["available_tags"] == ["delay"]
        assert listed["snapshots"][0]["input_device"] == "Route In"
        assert listed["snapshots"][0]["output_device"] == "Route Out"
        assert listed["snapshots"][0]["tempo_bpm"] == 126.0
        assert listed["snapshots"][0]["output_level_reference_dbfs"] == -14.0
        assert listed["snapshots"][0]["output_level_warning_threshold_db"] == 2.0
        assert listed["snapshots"][0]["activated_at"] is None
        assert listed["snapshots"][0]["lineage"]["derived_from_snapshot_id"] is None

        filtered = await routes.list_snapshots(tags="delay")
        assert filtered["count"] == 1
        assert filtered["snapshots"][0]["id"] == snapshot_id
        assert filtered["available_tags"] == ["delay"]

        fetched = await routes.get_snapshot(snapshot_id)
        assert fetched["is_locked"] is True
        assert fetched["channels"][0]["label"] == "A"
        assert fetched["input_device"] == "Route In"
        assert fetched["output_device"] == "Route Out"
        assert fetched["tempo_bpm"] == 126.0
        assert fetched["output_level_reference_dbfs"] == -14.0
        assert fetched["output_level_warning_threshold_db"] == 2.0
        assert fetched["activated_at"] is None
        assert fetched["paths"][0]["id"] == "path-a"
        assert fetched["controls"]["midi_map"][0]["program_number"] == 12
        assert fetched["controls"]["monitoring_output_index"] == 2
        assert fetched["controls"]["maschine_encoder_map"]["enc2"]["param_id"] == "mix"
        assert fetched["io_bindings"]["monitoring_output_index"] == 2
        assert fetched["chains"][0]["plugins"][0]["uri"] == NOISE_GATE_PLUGIN_URI
        assert fetched["chains"][0]["plugins"][0]["loader_state"]["system_block_role"] == "noise_gate"
        assert fetched["chains"][0]["plugins"][1]["uri"] == "map2://juce/delay"

        async with database_module.get_session() as session:
            plugin_result = await session.execute(
                select(database_module.SnapshotChainPlugin)
                .where(database_module.SnapshotChainPlugin.snapshot_chain_id == fetched["chains"][0]["id"])
                .order_by(database_module.SnapshotChainPlugin.position.asc())
            )
            chain_plugin_ids = [plugin.id for plugin in plugin_result.scalars().all()]
        system_gate_id = chain_plugin_ids[0]
        delay_plugin_id = chain_plugin_ids[1]

        with pytest.raises(HTTPException) as remove_exc:
            await routes.remove_plugin(snapshot_id, fetched["chains"][0]["id"], system_gate_id)
        assert remove_exc.value.status_code == 400
        assert "system noise gate" in str(remove_exc.value.detail).lower()

        with pytest.raises(HTTPException) as reorder_exc:
            await routes.reorder_plugins(
                snapshot_id,
                fetched["chains"][0]["id"],
                routes.PluginReorderRequest(plugin_ids=[delay_plugin_id, system_gate_id]),
            )
        assert reorder_exc.value.status_code == 400
        assert "first position" in str(reorder_exc.value.detail).lower()

        patched = await routes.update_snapshot(
            snapshot_id,
            routes.SnapshotUpdateRequest(
                tempo_bpm=140.0,
                output_level_reference_dbfs=-10.0,
                output_level_warning_threshold_db=3.5,
                io_bindings=routes.SnapshotIOBindingsInput(
                    input_device="Route In 2",
                    output_device=None,
                    monitoring_output_index=4,
                ),
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
        assert patched["snapshot"]["controls"]["monitoring_output_index"] == 4
        assert patched["snapshot"]["io_bindings"]["monitoring_output_index"] == 4
        assert patched["snapshot"]["controls"]["maschine_encoder_map"]["enc4"]["param_id"] == "gain"

        cleared_monitoring = await routes.update_snapshot(
            snapshot_id,
            routes.SnapshotUpdateRequest(
                controls=routes.SnapshotControlsInput(
                    midi_map=[{"action": "load_snapshot", "program_number": 12}],
                    monitoring_output_index=None,
                    maschine_encoder_map={
                        "enc4": {"block_id": "block-2", "param_id": "gain", "label": "Gain"},
                    },
                ),
            ),
        )
        assert cleared_monitoring["snapshot"]["controls"]["monitoring_output_index"] is None
        assert cleared_monitoring["snapshot"]["io_bindings"]["monitoring_output_index"] is None

        replaced_midi_map = await routes.replace_midi_map(
            snapshot_id,
            routes.MidiMapRequest(
                entries=[
                    {"action": "load_snapshot", "program_number": 5},
                    {"action": "focus_block_note_range", "midi_channel": 2, "start_note": 60},
                ],
            ),
        )
        assert replaced_midi_map["midi_map"][0]["program_number"] == 5
        assert replaced_midi_map["controls"]["midi_map"][1]["start_note"] == 60
        assert replaced_midi_map["controls"]["maschine_encoder_map"]["enc4"]["param_id"] == "gain"

        refetched_after_midi_map_replace = await routes.get_snapshot(snapshot_id)
        assert refetched_after_midi_map_replace["controls"]["midi_map"][1]["midi_channel"] == 2
        assert refetched_after_midi_map_replace["midi_map"][1]["action"] == "focus_block_note_range"

        activated = await routes.activate_snapshot(snapshot_id)
        assert activated["status"] == "success"
        assert activated["snapshot_data"]["live_state"]["is_live"] is True
        assert activated["snapshot_data"]["activated_at"] is not None
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
        assert live_snapshot["activated_at"] == activated["snapshot_data"]["activated_at"]
        assert live_snapshot["snapshot_revision"] == activated["snapshot_revision"]
        assert live_snapshot["tempo_source"] == "tap"
        assert live_snapshot["active_tempo_bpm"] == 120.0

        listed_after_activation = await routes.list_snapshots()
        assert listed_after_activation["snapshots"][0]["activated_at"] == activated["snapshot_data"]["activated_at"]

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
        assert duplicated["snapshot"]["name"] == "RouteSnapshotcopy"
        assert duplicated["snapshot"]["program_number"] is None
        assert duplicated["snapshot"]["is_locked"] is False
        assert duplicated["snapshot"]["lineage"]["derived_from_snapshot_id"] == snapshot_id
        assert duplicated["snapshot"]["controls"]["midi_map"][0]["program_number"] is None
        assert duplicated["snapshot"]["midi_map"][0]["program_number"] is None

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
            chain["name"] == "Drive B"
            and chain["plugins"]
            and chain["plugins"][0]["uri"] == NOISE_GATE_PLUGIN_URI
            and any(plugin["uri"] == "urn:test:path-only-plugin" for plugin in chain["plugins"])
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
        assert revisions["revisions"][0]["summary"] == "2 blocks, 1 channel, parallel blend routing"

        restored_revision = await routes.restore_snapshot_revision(revision_snapshot_id, 1)
        assert restored_revision["status"] == "success"
        assert len(restored_revision["snapshot"]["chains"][0]["plugins"]) == 2

    asyncio.run(_run())


def test_revision_routes_call_state_authority_revision_service_directly(monkeypatch):
    revision_calls: list[tuple[str, int, int | None]] = []

    class _FakeRevisionService:
        async def list_revisions(self, snapshot_id: int):
            revision_calls.append(("list", snapshot_id, None))
            return [{"revision_number": 3, "summary": "route summary"}]

        async def restore_revision(self, snapshot_id: int, revision_number: int):
            revision_calls.append(("restore", snapshot_id, revision_number))
            return {"id": snapshot_id, "snapshot_revision": "rev-3"}

    class _FakeSnapshotService:
        def __init__(self, _session):
            self.state_authority_revisions = _FakeRevisionService()

        async def list_revisions(self, _snapshot_id: int):
            raise AssertionError("Route should call state_authority_revisions directly")

        async def restore_revision(self, _snapshot_id: int, _revision_number: int):
            raise AssertionError("Route should call state_authority_revisions directly")

    @asynccontextmanager
    async def _fake_session():
        yield object()

    monkeypatch.setattr(routes, "SnapshotService", _FakeSnapshotService)
    monkeypatch.setattr(routes, "get_session", lambda: _fake_session())

    async def _run():
        listed = await routes.list_snapshot_revisions(7)
        restored = await routes.restore_snapshot_revision(7, 3)
        assert listed["count"] == 1
        assert restored["snapshot"]["snapshot_revision"] == "rev-3"
        assert revision_calls == [("list", 7, None), ("restore", 7, 3)]

    asyncio.run(_run())


def test_activation_routes_call_state_authority_activation_service_directly(monkeypatch):
    activation_calls: list[tuple[int, str]] = []
    cache_invalidations: list[str] = []

    class _FakeActivationService:
        async def activate_snapshot(self, snapshot_id: int, *, triggered_by: str = "ui"):
            activation_calls.append((snapshot_id, triggered_by))
            return {"status": "success", "snapshot_id": snapshot_id, "triggered_by": triggered_by}

    class _FakeSnapshotService:
        def __init__(self, _session):
            self.state_authority_activation = _FakeActivationService()

        async def activate_snapshot(self, _snapshot_id: int, *, triggered_by: str = "ui"):
            raise AssertionError("Route should call state_authority_activation directly")

        async def get_snapshot_by_program(self, program_number: int):
            return {"id": 19 if program_number == 12 else None}

    @asynccontextmanager
    async def _fake_session():
        yield object()

    monkeypatch.setattr(routes, "SnapshotService", _FakeSnapshotService)
    monkeypatch.setattr(routes, "get_session", lambda: _fake_session())
    monkeypatch.setattr(chain_routes, "_invalidate_chain_list_cache", lambda: cache_invalidations.append("chains"))

    async def _run():
        activated = await routes.activate_snapshot(11)
        activated_pc = await routes.activate_snapshot_by_program(12)
        assert activated["snapshot_id"] == 11
        assert activated_pc["snapshot_id"] == 19
        assert activation_calls == [(11, "ui"), (19, "midi_pc")]
        assert cache_invalidations == ["chains", "chains"]

    asyncio.run(_run())


def test_snapshot_export_and_import_bundle_routes(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    source_assets = tmp_path / "route-bundle-source"
    source_assets.mkdir(parents=True, exist_ok=True)
    nam_source = source_assets / "RouteTone.nam"
    nam_source.write_bytes(b"route-nam")

    storage_root = tmp_path / "route-bundle-library"
    storage_paths = {
        upload_service_module.AssetType.NAM: storage_root / "nam",
        upload_service_module.AssetType.CABINET_IR: storage_root / "ir" / "cabinets",
        upload_service_module.AssetType.REVERB_IR: storage_root / "ir" / "reverbs",
        upload_service_module.AssetType.VST3: storage_root / "vst3",
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

    async def _create_snapshot():
        created = await routes.create_snapshot(
            routes.SnapshotCreateRequest(
                name="RouteBundle",
                paths=[
                    routes.SnapshotPathInput(
                        id="path-a",
                        name="Path A",
                        label="A",
                        color="#2563eb",
                        snapshot_chain_id=1,
                        plugins=[
                            routes.SnapshotPluginInput(
                                uri="map2://juce/nam",
                                name="NAM",
                                position=0,
                                loader_state={
                                    "selected_model": "RouteTone",
                                    "selected_asset_name": "RouteTone",
                                    "selected_asset_path": str(nam_source),
                                },
                            )
                        ],
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
        return created["snapshot_id"]

    snapshot_id = asyncio.run(_create_snapshot())

    app = FastAPI()
    app.include_router(routes.router)
    client = TestClient(app)

    export_response = client.get(f"/api/snapshots/{snapshot_id}/export")
    assert export_response.status_code == 200
    assert export_response.headers["content-type"] == "application/vnd.map2.snapshot+zip"
    assert 'filename="RouteBundle.map2snapshot"' in export_response.headers["content-disposition"]

    with zipfile.ZipFile(io.BytesIO(export_response.content), "r") as archive:
        assert "snapshot.json" in archive.namelist()
        payload = json.loads(archive.read("snapshot.json").decode("utf-8"))
        assert payload["snapshot"]["name"] == "RouteBundle"

    import_response = client.post(
        "/api/snapshots/import",
        files={
            "file": (
                "RouteBundle.map2snapshot",
                export_response.content,
                "application/vnd.map2.snapshot+zip",
            )
        },
    )
    assert import_response.status_code == 200
    imported_snapshot = import_response.json()["snapshot"]
    imported_plugin = next(
        plugin
        for plugin in imported_snapshot["chains"][0]["plugins"]
        if plugin["uri"] == "map2://juce/nam"
    )
    assert imported_plugin["loader_state"]["selected_asset_path"].startswith(str(storage_paths[upload_service_module.AssetType.NAM]))

    registered_paths = {route.path for route in routes.router.routes}
    assert "/api/snapshots" in registered_paths
    assert "/api/snapshots/{snapshot_id}" in registered_paths
    assert "/api/snapshots/{snapshot_id}/revisions" in registered_paths
    assert "/api/snapshots/{snapshot_id}/revisions/{revision_number}/restore" in registered_paths
    assert "/api/snapshots/{snapshot_id}/activate" in registered_paths
    assert not any(path.startswith("/api/flow-snapshots") for path in registered_paths)


def test_activate_snapshot_route_returns_422_when_channel_does_not_load(tmp_path, monkeypatch):
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
    monkeypatch.setattr(chain_routes, "_invalidate_chain_list_cache", lambda: None)

    async def _run():
        created = await routes.create_snapshot(
            routes.SnapshotCreateRequest(
                name="BrokenRouteSnapshot",
                paths=[
                    routes.SnapshotPathInput(
                        id="channel-a",
                        name="Lead",
                        label="Lead",
                        color="#fa4d56",
                        plugins=[
                            routes.SnapshotPluginInput(
                                uri="urn:test:route-plugin",
                                name="Lead Plugin",
                                position=0,
                            )
                        ],
                        snapshot_chain_id=1,
                    )
                ],
                routing=routes.SnapshotRoutingInput(
                    mode="parallel_blend",
                    active_channel_key="channel-a",
                    blend_positions={"channel-a": 100.0},
                    series_order=["channel-a"],
                ),
            )
        )

        try:
            await routes.activate_snapshot(created["snapshot_id"])
        except HTTPException as exc:
            assert exc.status_code == 422
            assert exc.detail == "Channel Lead not loaded."
        else:
            raise AssertionError("Route activation should surface channel-load failures as 422 responses")

    asyncio.run(_run())


def test_activate_snapshot_route_returns_structured_preflight_failures(tmp_path, monkeypatch):
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
    monkeypatch.setattr(chain_routes, "_invalidate_chain_list_cache", lambda: None)

    missing_model_path = tmp_path / "CleanTone.nam"

    async def _run():
        created = await routes.create_snapshot(
            routes.SnapshotCreateRequest(
                name="PreflightRouteSnapshot",
                input_device="Tour Rack",
                output_device="House Left/Right",
                paths=[
                    routes.SnapshotPathInput(
                        id="channel-a",
                        name="Lead",
                        label="Lead",
                        color="#fa4d56",
                        snapshot_chain_id=1,
                        plugins=[
                            routes.SnapshotPluginInput(
                                uri="urn:test:missing-plugin",
                                name="Ghost Drive",
                                position=0,
                            ),
                            routes.SnapshotPluginInput(
                                uri="map2://juce/nam",
                                name="NAM",
                                position=1,
                                loader_state={
                                    "selected_asset_name": "CleanTone.nam",
                                    "selected_asset_path": str(missing_model_path),
                                },
                            ),
                        ],
                    )
                ],
                routing=routes.SnapshotRoutingInput(
                    mode="parallel_blend",
                    active_channel_key="channel-a",
                    blend_positions={"channel-a": 100.0},
                    series_order=["channel-a"],
                ),
            )
        )

        try:
            await routes.activate_snapshot(created["snapshot_id"])
        except HTTPException as exc:
            assert exc.status_code == 422
            assert exc.detail["phase"] == "VALIDATING"
            assert exc.detail["blocking"] is True
            assert exc.detail["failures"] == [
                "Cannot go live: Channel Lead - plugin urn:test:missing-plugin is not installed on this node.",
                "Cannot go live: Channel Lead - NAM model CleanTone.nam not found on this node.",
                "Cannot go live: Input device Tour Rack is not available on this node.",
            ]
            assert [issue["code"] for issue in exc.detail["issues"]] == [
                "missing_plugin",
                "missing_asset",
                "missing_input_device",
            ]
            assert [action["action"] for action in exc.detail["repair_actions"]] == [
                "install_plugin",
                "restore_asset",
                "select_available_device",
            ]
        else:
            raise AssertionError("Route activation should surface structured pre-flight failures as 422 responses")

    asyncio.run(_run())

import asyncio

import pytest

from app import database as database_module
from app.routes import unified_snapshots as snapshot_routes
from app.services import snapshot_runtime_service
from app.services.push_surface.map2_bridge import DirectMap2SurfaceBridge, MockMap2SurfaceBridge, RestWebSocketMap2SurfaceBridge


def _init_temp_db(tmp_path):
    database_module._tables_created = False
    database_module._pragmas_set = False
    database_module.init_async_db(f"sqlite+aiosqlite:///{tmp_path / 'push-surface.db'}")


@pytest.mark.asyncio
async def test_mock_bridge_mutates_parameter_and_emits_event():
    bridge = MockMap2SurfaceBridge()
    chain = (await bridge.list_chains())[0]
    node = chain.nodes[0]
    event_iter = bridge.subscribe_events()

    await bridge.set_parameter(node.id, "drive", 0.8)
    event = await asyncio.wait_for(event_iter.__anext__(), timeout=1.0)

    params = await bridge.get_node_parameters(node.id)
    assert any(param.id == "drive" and float(param.value) == 0.8 for param in params)
    assert event.event_type.value == "parameter_changed"


@pytest.mark.asyncio
async def test_direct_bridge_lists_chains_and_updates_snapshot_detail(tmp_path, monkeypatch):
    _init_temp_db(tmp_path)

    async def _passthrough(snapshot_data):
        return snapshot_data

    async def _fake_apply(_snapshot_data):
        return 0, 0

    monkeypatch.setattr(snapshot_runtime_service, "enrich_snapshot_data", _passthrough)
    monkeypatch.setattr(snapshot_runtime_service, "apply_snapshot_to_engine", _fake_apply)

    created = await snapshot_routes.create_snapshot(
        snapshot_routes.SnapshotCreateRequest(
            name="Bridge Snapshot",
            snapshot_data={
                "paths": [
                    {
                        "id": "path_a",
                        "label": "A",
                        "plugins": [
                            {
                                "uri": "urn:test:amp",
                                "name": "Amp",
                                "position": 0,
                                "parameters": {"drive": 0.5},
                            }
                        ],
                    }
                ]
            },
        )
    )
    snapshot_id = created["snapshot_id"]
    bridge = DirectMap2SurfaceBridge()
    presets = await bridge.list_presets()
    assert any(item.id == str(snapshot_id) for item in presets)

    chains = await bridge.list_chains(str(snapshot_id))
    assert chains[0].name in {"Path A", "Chain 1", "A"}
    node = chains[0].nodes[0]
    params = await bridge.get_node_parameters(node.id)
    assert params[0].id == "drive"

    await bridge.set_parameter(node.id, "drive", 0.9)
    updated_params = await bridge.get_node_parameters(node.id)
    assert any(param.id == "drive" and float(param.value) == 0.9 for param in updated_params)


def test_rest_bridge_maps_websocket_messages():
    bridge = RestWebSocketMap2SurfaceBridge()
    event = bridge._map_ws_message({"type": "snapshot_loaded", "data": {"snapshot_id": 7}})
    assert event is not None
    assert event.event_type.value == "preset_loaded"
    assert event.payload["preset_id"] == 7

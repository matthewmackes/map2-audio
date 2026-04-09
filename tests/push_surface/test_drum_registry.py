from __future__ import annotations

import pytest

from app.services.push_surface.drum_registry import DrumInstanceRegistry


@pytest.mark.asyncio
async def test_registry_merges_remote_cluster_instances_and_prioritizes_live(monkeypatch: pytest.MonkeyPatch) -> None:
    registry = DrumInstanceRegistry()

    monkeypatch.setattr("app.services.push_surface.drum_registry._local_node_id", lambda: "node-local")
    monkeypatch.setattr("app.services.push_surface.drum_registry._local_node_label", lambda: "Local Node")

    async def _fake_list_local_snapshot_summaries():
        return [{"id": 1, "name": "Local Snapshot", "is_active": False}]

    async def _fake_get_local_snapshot_detail(snapshot_id: int):
        assert snapshot_id == 1
        return {
            "paths": [],
            "chains": [
                {
                    "id": 10,
                    "name": "Quiet Chain",
                    "plugins": [{"id": 101, "uri": "map2://juce/drums", "name": "Local Drums", "position": 0}],
                }
            ],
        }

    async def _fake_list_remote_nodes():
        return [{"node_id": "node-remote", "hostname": "Remote Node", "api_url": "http://remote:8080", "is_online": True}]

    async def _fake_list_remote_snapshot_summaries(node: dict[str, object]):
        assert node["node_id"] == "node-remote"
        return [{"id": 7, "name": "Remote Snapshot", "is_active": True}]

    async def _fake_get_remote_snapshot_detail(node: dict[str, object], snapshot_id: int):
        assert node["node_id"] == "node-remote"
        assert snapshot_id == 7
        return {
            "paths": [{"snapshot_chain_id": 70, "runtime_chain_id": 700}],
            "chains": [
                {
                    "id": 70,
                    "name": "Live Chain",
                    "plugins": [{"id": 701, "uri": "map2://juce/drums", "name": "Remote Drums", "position": 2}],
                }
            ],
        }

    monkeypatch.setattr(registry, "_list_local_snapshot_summaries", _fake_list_local_snapshot_summaries)
    monkeypatch.setattr(registry, "_get_local_snapshot_detail", _fake_get_local_snapshot_detail)
    monkeypatch.setattr(registry, "_list_remote_nodes", _fake_list_remote_nodes)
    monkeypatch.setattr(registry, "_list_remote_snapshot_summaries", _fake_list_remote_snapshot_summaries)
    monkeypatch.setattr(registry, "_get_remote_snapshot_detail", _fake_get_remote_snapshot_detail)

    instances = await registry.list_instances()

    assert [instance.node_id for instance in instances] == ["node-remote", "node-local"]
    assert instances[0].is_live is True
    assert instances[0].source == "cluster_snapshot"
    assert instances[0].display_name == "Remote Snapshot / Live Chain"
    assert instances[1].is_live is False


@pytest.mark.asyncio
async def test_registry_skips_local_node_duplicate_in_remote_scan(monkeypatch: pytest.MonkeyPatch) -> None:
    registry = DrumInstanceRegistry()

    monkeypatch.setattr("app.services.push_surface.drum_registry._local_node_id", lambda: "node-local")
    monkeypatch.setattr("app.services.push_surface.drum_registry._local_node_label", lambda: "Local Node")

    async def _fake_list_local_snapshot_summaries():
        return [{"id": 2, "name": "Snapshot", "is_active": True}]

    async def _fake_get_local_snapshot_detail(snapshot_id: int):
        return {
            "paths": [{"snapshot_chain_id": 20, "runtime_chain_id": 200}],
            "chains": [
                {
                    "id": 20,
                    "name": "Chain",
                    "plugins": [{"id": 201, "uri": "map2://juce/drums", "name": "Drums", "position": 0}],
                }
            ],
        }

    async def _fake_list_remote_nodes():
        return [{"node_id": "node-local", "hostname": "Loopback", "api_url": "http://127.0.0.1:8080", "is_online": True}]

    async def _unexpected_remote_summaries(node: dict[str, object]):
        raise AssertionError(f"remote local-node fetch should be skipped: {node}")

    monkeypatch.setattr(registry, "_list_local_snapshot_summaries", _fake_list_local_snapshot_summaries)
    monkeypatch.setattr(registry, "_get_local_snapshot_detail", _fake_get_local_snapshot_detail)
    monkeypatch.setattr(registry, "_list_remote_nodes", _fake_list_remote_nodes)
    monkeypatch.setattr(registry, "_list_remote_snapshot_summaries", _unexpected_remote_summaries)

    instances = await registry.list_instances()

    assert len(instances) == 1
    assert instances[0].node_id == "node-local"
    assert instances[0].is_live is True

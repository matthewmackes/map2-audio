"""Tests for the Layer 2 cluster reconciler."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from app.services.state_authority_cluster_reconciler import ClusterReconciler


def _snapshot(chains):
    return {"id": "snap-1", "chains": chains}


def _chain(plugins):
    return {"plugins": plugins}


def _plugin(uri: str, position: int, parameters=None, loader_state=None):
    return {
        "uri": uri,
        "position": position,
        "parameters": parameters or {},
        "loader_state": loader_state or {},
    }


@pytest.fixture
def desired_doc():
    return _snapshot([
        _chain([_plugin("map2:fx:nam", 0, {"gain": 0.7})]),
    ])


@pytest.mark.asyncio
async def test_cluster_healthy_when_every_node_matches_desired(desired_doc):
    observed_by_node = {
        "node-a": desired_doc,
        "node-b": desired_doc,
    }

    reconciler = ClusterReconciler(
        desired_state=AsyncMock(return_value=desired_doc),
        observed_state=AsyncMock(side_effect=lambda n: observed_by_node[n]),
        list_nodes=AsyncMock(return_value=["node-a", "node-b"]),
    )
    report = await reconciler.reconcile()
    assert report["status"] == "healthy"
    assert report["checked_nodes"] == 2
    assert report["nodes_with_drift"] == 0
    assert report["nodes_offline"] == 0


@pytest.mark.asyncio
async def test_cluster_healthy_when_desired_state_is_none():
    """No live snapshot → nothing to reconcile — return healthy."""
    reconciler = ClusterReconciler(
        desired_state=AsyncMock(return_value=None),
        observed_state=AsyncMock(return_value=None),
        list_nodes=AsyncMock(return_value=["node-a"]),
    )
    report = await reconciler.reconcile()
    assert report["status"] == "healthy"


@pytest.mark.asyncio
async def test_cluster_reports_offline_when_observed_state_returns_none(desired_doc):
    reconciler = ClusterReconciler(
        desired_state=AsyncMock(return_value=desired_doc),
        observed_state=AsyncMock(return_value=None),
        list_nodes=AsyncMock(return_value=["offline-node"]),
    )
    report = await reconciler.reconcile()
    assert report["status"] == "degraded"
    assert report["nodes_offline"] == 1


@pytest.mark.asyncio
async def test_cluster_detects_parameter_drift_and_pushes_params(desired_doc):
    drifted = _snapshot([_chain([_plugin("map2:fx:nam", 0, {"gain": 0.2})])])
    push_params = AsyncMock(return_value=True)
    reconciler = ClusterReconciler(
        desired_state=AsyncMock(return_value=desired_doc),
        observed_state=AsyncMock(return_value=drifted),
        list_nodes=AsyncMock(return_value=["node-a"]),
        push_params=push_params,
    )
    report = await reconciler.reconcile()
    assert report["nodes_with_drift"] == 1
    node = report["node_reports"][0]
    assert node["parameter_drift"] == 1
    assert "params_pushed" in node["actions_taken"]
    push_params.assert_awaited_once()


@pytest.mark.asyncio
async def test_cluster_triggers_reactivation_on_topology_drift(desired_doc):
    """Different plugin set / positions must escalate to full re-activation."""
    drifted_topology = _snapshot([
        _chain([
            _plugin("map2:fx:nam", 0),
            _plugin("map2:fx:reverb-ir", 1),  # extra plugin
        ]),
    ])
    trigger_reactivation = AsyncMock(return_value=True)
    reconciler = ClusterReconciler(
        desired_state=AsyncMock(return_value=desired_doc),
        observed_state=AsyncMock(return_value=drifted_topology),
        list_nodes=AsyncMock(return_value=["node-a"]),
        trigger_reactivation=trigger_reactivation,
    )
    report = await reconciler.reconcile()
    node = report["node_reports"][0]
    assert node["topology_drift"] is True
    assert "reactivation_triggered" in node["actions_taken"]
    trigger_reactivation.assert_awaited_with("node-a", "snap-1")


@pytest.mark.asyncio
async def test_cluster_redeploys_missing_assets(desired_doc):
    """Observed plugin with stale loader_state path (non-hash, non-absolute)
    must trigger asset redeploy."""
    observed = _snapshot([
        _chain([
            _plugin(
                "map2:fx:nam",
                0,
                parameters={"gain": 0.7},
                loader_state={"model_path": "stale-relative-path.nam"},
            ),
        ]),
    ])
    redeploy_asset = AsyncMock(return_value=True)
    reconciler = ClusterReconciler(
        desired_state=AsyncMock(return_value=desired_doc),
        observed_state=AsyncMock(return_value=observed),
        list_nodes=AsyncMock(return_value=["node-a"]),
        redeploy_asset=redeploy_asset,
    )
    report = await reconciler.reconcile()
    node = report["node_reports"][0]
    assert node["missing_assets"] == 1
    assert "assets_redeployed" in node["actions_taken"]
    redeploy_asset.assert_awaited()


@pytest.mark.asyncio
async def test_cluster_reconciler_does_not_apply_corrections_when_disabled(desired_doc):
    drifted = _snapshot([_chain([_plugin("map2:fx:nam", 0, {"gain": 0.2})])])
    push_params = AsyncMock(return_value=True)
    reconciler = ClusterReconciler(
        desired_state=AsyncMock(return_value=desired_doc),
        observed_state=AsyncMock(return_value=drifted),
        list_nodes=AsyncMock(return_value=["node-a"]),
        push_params=push_params,
        apply_corrections=False,
    )
    report = await reconciler.reconcile()
    assert report["node_reports"][0]["status"] == "drift"
    push_params.assert_not_awaited()


@pytest.mark.asyncio
async def test_cluster_surfaces_desired_producer_errors():
    async def desired():
        raise RuntimeError("etcd unreachable")
    reconciler = ClusterReconciler(
        desired_state=desired,
        observed_state=AsyncMock(return_value=None),
        list_nodes=AsyncMock(return_value=[]),
    )
    report = await reconciler.reconcile()
    assert report["status"] == "error"
    assert "etcd unreachable" in report["error"]


@pytest.mark.asyncio
async def test_cluster_surfaces_list_nodes_errors(desired_doc):
    async def list_nodes():
        raise RuntimeError("peer discovery failed")
    reconciler = ClusterReconciler(
        desired_state=AsyncMock(return_value=desired_doc),
        observed_state=AsyncMock(return_value=None),
        list_nodes=list_nodes,
    )
    report = await reconciler.reconcile()
    assert report["status"] == "error"
    assert "peer discovery failed" in report["error"]


@pytest.mark.asyncio
async def test_tolerance_ignores_sub_threshold_parameter_drift(desired_doc):
    """1% tolerance — sub-threshold drift must not count as drift."""
    drifted = _snapshot([_chain([_plugin("map2:fx:nam", 0, {"gain": 0.7049})])])
    reconciler = ClusterReconciler(
        desired_state=AsyncMock(return_value=desired_doc),
        observed_state=AsyncMock(return_value=drifted),
        list_nodes=AsyncMock(return_value=["node-a"]),
        tolerance=0.01,
    )
    report = await reconciler.reconcile()
    assert report["nodes_with_drift"] == 0
    assert report["node_reports"][0]["parameter_drift"] == 0

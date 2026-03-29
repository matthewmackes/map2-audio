"""
Cluster snapshot deployment routes.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import get_session
from app.services.cluster.registry import get_cluster_registry
from app.services.snapshot_deployment_service import SnapshotDeploymentService
from app.services.snapshot_service import SnapshotService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["cluster-snapshots"])


class SnapshotDeployRequest(BaseModel):
    snapshot_id: int
    node_id: str
    redundancy_enabled: bool = False


class SnapshotFailoverRequest(BaseModel):
    snapshot_id: int


class MaintenanceRequest(BaseModel):
    enabled: bool


def _raise_not_found(entity: str) -> None:
    raise HTTPException(status_code=404, detail=f"{entity} not found")


@router.get("/api/cluster/snapshots/deployments")
@router.get("/api/cluster/flows/assignments")
async def list_snapshot_deployments() -> dict[str, Any]:
    try:
        async with get_session() as session:
            deployment_service = SnapshotDeploymentService(session)
            snapshot_service = SnapshotService(session)
            deployments = await deployment_service.list_deployments()
            snapshots_by_id = {
                item["id"]: item
                for item in await snapshot_service.list_snapshots()
            }
            return {
                "deployments": [
                    {
                        **deployment,
                        "snapshot": snapshots_by_id.get(deployment["snapshot_id"]),
                    }
                    for deployment in deployments
                ],
                "total": len(deployments),
            }
    except Exception as exc:
        logger.error("Error listing snapshot deployments: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/cluster/snapshots/deploy")
@router.post("/api/cluster/flows/assign")
async def deploy_snapshot(request: SnapshotDeployRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            deployment_service = SnapshotDeploymentService(session)
            snapshot_service = SnapshotService(session)
            deployment = await deployment_service.deploy_snapshot(
                request.snapshot_id,
                node_id=request.node_id,
                redundancy_enabled=request.redundancy_enabled,
            )
            if deployment is None:
                _raise_not_found("Snapshot or node")
            snapshot = await snapshot_service.get_snapshot(request.snapshot_id)
            return {
                "status": "deployed",
                "snapshot_id": request.snapshot_id,
                "node_id": request.node_id,
                "snapshot": snapshot,
                "deployment": deployment,
                "redundancy_enabled": request.redundancy_enabled,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error deploying snapshot %s: %s", request.snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/api/cluster/snapshots/failover")
@router.post("/api/cluster/flows/failover")
async def failover_snapshot(request: SnapshotFailoverRequest) -> dict[str, Any]:
    try:
        async with get_session() as session:
            deployment_service = SnapshotDeploymentService(session)
            deployment = await deployment_service.failover_snapshot(request.snapshot_id)
            if deployment is None:
                _raise_not_found("Snapshot deployment")
            return {
                "status": "failed_over",
                "snapshot_id": request.snapshot_id,
                "deployment": deployment,
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error failing over snapshot %s: %s", request.snapshot_id, exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/api/cluster/nodes")
async def get_cluster_nodes() -> dict[str, Any]:
    registry = get_cluster_registry()
    nodes = registry.get_all_nodes()
    return {"nodes": nodes, "count": len(nodes)}


@router.post("/api/cluster/nodes/{node_id}/maintenance")
async def set_node_maintenance(node_id: str, request: MaintenanceRequest) -> dict[str, Any]:
    registry = get_cluster_registry()
    status = "maintenance" if request.enabled else "online"
    updated = registry.update_node_status(node_id, status)
    if not updated:
        _raise_not_found("Node")
    return {"status": status, "node_id": node_id}

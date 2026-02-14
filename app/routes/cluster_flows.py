"""
Cluster Flow Management Routes
API endpoints for assigning flows to nodes and listing cluster state.
"""

try:
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel
    from typing import List

    from app.services.flow_orchestrator import FlowOrchestrator
    from app.services.cluster.registry import get_cluster_registry

    router = APIRouter(prefix="/api/cluster", tags=["cluster-flows"])

    class FlowAssignRequest(BaseModel):
        flow_id: str
        chain_id: int
        node_id: str
        redundancy_enabled: bool = False

    class FlowFailoverRequest(BaseModel):
        flow_id: str

    def _get_orchestrator():
        try:
            return FlowOrchestrator.get_instance()
        except RuntimeError:
            return FlowOrchestrator.initialize()

    @router.get("/flows/assignments")
    async def get_flow_assignments():
        """Get all current flow assignments."""
        orchestrator = _get_orchestrator()
        assignments = await orchestrator.get_assignments()

        return {
            "assignments": [
                {
                    "flow_id": a.flow_id,
                    "chain_id": a.chain_id,
                    "assigned_node_id": a.assigned_node_id,
                    "assignment_type": a.assignment_type,
                    "assignment_strategy": a.assignment_strategy,
                }
                for a in assignments
            ],
            "total": len(assignments),
        }

    @router.post("/flows/assign")
    async def assign_flow_to_node(request: FlowAssignRequest):
        """Assign and deploy a flow to a specific node."""
        orchestrator = _get_orchestrator()

        deployment = await orchestrator.assign_flow_to_node(
            flow_id=request.flow_id,
            chain_id=request.chain_id,
            node_id=request.node_id,
            redundancy_enabled=request.redundancy_enabled,
            strategy="manual",
        )

        if deployment is None:
            raise HTTPException(status_code=400, detail="Assignment failed")

        # Resolve chain payload and push it to the assigned node(s).
        from app.database import get_session
        from app.services.chain_service import ChainService

        async with get_session() as session:
            chain_service = ChainService(session)
            chain = await chain_service.get_chain(request.chain_id)

        if chain is None:
            raise HTTPException(
                status_code=404,
                detail=f"Chain {request.chain_id} not found for deployment",
            )

        deployed = await orchestrator.deploy_flow(deployment, chain)
        if not deployed:
            raise HTTPException(
                status_code=502,
                detail=(
                    "Flow assigned but deployment failed on target node. "
                    "Check node reachability and /api/chains/deploy response."
                ),
            )

        response = {
            "status": "deployed",
            "flow_id": request.flow_id,
            "node_id": request.node_id,
            "chain_id": request.chain_id,
            "redundancy_enabled": request.redundancy_enabled,
        }

        if deployment.error_message:
            response["degraded"] = True
            response["warning"] = deployment.error_message
        else:
            response["degraded"] = False

        return response

    @router.get("/nodes")
    async def get_cluster_nodes():
        """List cluster nodes from registry."""
        registry = get_cluster_registry()
        nodes = registry.get_all_nodes()
        return {"nodes": nodes, "count": len(nodes)}

    class MaintenanceRequest(BaseModel):
        enabled: bool

    @router.post("/nodes/{node_id}/maintenance")
    async def set_node_maintenance(node_id: str, request: MaintenanceRequest):
        """Enable/disable maintenance mode on a node."""
        registry = get_cluster_registry()
        status = "maintenance" if request.enabled else "online"
        updated = registry.update_node_status(node_id, status)
        if not updated:
            raise HTTPException(status_code=404, detail="Node not found")
        return {"status": status, "node_id": node_id}

    @router.post("/flows/failover")
    async def trigger_failover(request: FlowFailoverRequest):
        """Manually trigger failover for a flow."""
        orchestrator = _get_orchestrator()
        success = await orchestrator.failover_flow(request.flow_id)
        if not success:
            raise HTTPException(status_code=400, detail="Failover failed")
        return {"status": "failed_over", "flow_id": request.flow_id}

except Exception as e:
    router = None

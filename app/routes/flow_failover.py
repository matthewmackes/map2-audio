"""
Flow Failover Routes
Node-side endpoint for promoting standby flows.
"""

try:
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel
    from typing import Optional
    from sqlalchemy import select

    from app.database import get_session, FlowAssignment
    from app.services.chain_service import ChainService

    router = APIRouter(prefix="/api/flows", tags=["flow-failover"])

    class PromoteStandbyRequest(BaseModel):
        flow_id: str
        chain_id: Optional[int] = None

    class ActivateFlowRequest(BaseModel):
        chain_id: Optional[int] = None

    async def _resolve_chain_id(flow_id: str, chain_id: Optional[int]) -> Optional[int]:
        """Resolve chain ID from request payload or flow assignment table."""
        if chain_id is not None:
            return chain_id

        async with get_session() as session:
            result = await session.execute(
                select(FlowAssignment).where(FlowAssignment.flow_id == flow_id)
            )
            assignment = result.scalar_one_or_none()
            if assignment:
                return assignment.chain_id

        return None

    async def _activate_flow_chain(flow_id: str, chain_id: Optional[int]) -> dict:
        """Activate the chain backing a flow and return response payload."""
        resolved_chain_id = await _resolve_chain_id(flow_id, chain_id)
        if resolved_chain_id is None:
            raise HTTPException(
                status_code=404,
                detail=f"No chain mapping found for flow {flow_id}",
            )

        async with get_session() as session:
            service = ChainService(session)
            activated = await service.activate_chain(resolved_chain_id)

        if not activated:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to activate chain {resolved_chain_id} for flow {flow_id}",
            )

        return {
            "flow_id": flow_id,
            "chain_id": resolved_chain_id,
            "applied": True,
        }

    @router.post("/{flow_id}/activate")
    async def activate_flow(flow_id: str, request: Optional[ActivateFlowRequest] = None):
        """Activate a flow on this node by activating its mapped chain."""
        if not flow_id:
            raise HTTPException(status_code=400, detail="flow_id required")

        chain_id = request.chain_id if request else None
        payload = await _activate_flow_chain(flow_id, chain_id)
        return {"status": "activated", **payload}

    @router.post("/promote-standby")
    async def promote_standby(request: PromoteStandbyRequest):
        """Promote a standby flow to active on this node."""
        if not request.flow_id:
            raise HTTPException(status_code=400, detail="flow_id required")

        payload = await _activate_flow_chain(request.flow_id, request.chain_id)
        return {"status": "promoted", **payload}

except Exception:
    router = None

"""
Flow Failover Routes
Node-side endpoint for promoting standby flows.
"""

try:
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel

    router = APIRouter(prefix="/api/flows", tags=["flow-failover"])

    class PromoteStandbyRequest(BaseModel):
        flow_id: str

    @router.post("/promote-standby")
    async def promote_standby(request: PromoteStandbyRequest):
        """Promote a standby flow to active on this node.

        Placeholder implementation; integrate with audio engine later.
        """
        if not request.flow_id:
            raise HTTPException(status_code=400, detail="flow_id required")

        return {"status": "promoted", "flow_id": request.flow_id}

except Exception:
    router = None

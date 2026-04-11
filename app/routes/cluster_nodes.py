"""
Phase 3: Node Lifecycle Management API Routes

Handles node diagnostics, recovery, and lifecycle operations.
Provides endpoints for monitoring node health and managing failover.
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from app.services.cluster.node_lifecycle import get_node_lifecycle_manager
from app.utils.time import utc_now

router = APIRouter(prefix="/api/cluster/nodes", tags=["cluster-nodes"])


class HealthCheckResponse(BaseModel):
    """Health check result."""
    name: str
    status: str
    message: str
    severity: int


class DiagnosticsResponse(BaseModel):
    """Diagnostics report response."""
    node_id: str
    timestamp: str
    overall_health: int
    checks: List[HealthCheckResponse]
    services_status: Dict[str, str]
    recommendations: List[str]


class RecoveryResponse(BaseModel):
    """Node recovery result."""
    status: str
    health_before: int
    health_after: int
    actions_taken: List[str]
    message: str


@router.get("/{node_id}/diagnostics", response_model=DiagnosticsResponse)
async def get_node_diagnostics(node_id: str):
    """
    Run diagnostics on a specific node.
    
    Performs comprehensive health checks including:
    - Network connectivity
    - Audio device availability
    - Disk space
    - Memory usage
    - CPU usage
    - Service status
    
    Path parameters:
        - node_id: Node to diagnose
    
    Returns:
        Detailed diagnostics report with health score and recommendations
    """
    try:
        manager = get_node_lifecycle_manager()
        report = await manager.run_diagnostics(node_id)
        
        return DiagnosticsResponse(
            node_id=report.node_id,
            timestamp=report.timestamp.isoformat(),
            overall_health=report.overall_health,
            checks=[
                HealthCheckResponse(
                    name=check.name,
                    status=check.status,
                    message=check.message,
                    severity=check.severity
                )
                for check in report.checks
            ],
            services_status=report.services_status,
            recommendations=report.recommendations
        )
    
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, f"Diagnostics failed: {e}")


@router.post("/{node_id}/recover", response_model=RecoveryResponse)
async def recover_node(node_id: str):
    """
    Attempt to recover a failed node.
    
    Automatically:
    1. Diagnoses issues
    2. Restarts failed services
    3. Cleans up if needed
    4. Verifies recovery
    
    Path parameters:
        - node_id: Node to recover
    
    Returns:
        Recovery operation result with health scores and actions taken
    """
    try:
        manager = get_node_lifecycle_manager()
        result = await manager.recover_node(node_id)
        
        return RecoveryResponse(**result)
    
    except Exception as e:
        raise HTTPException(500, f"Recovery failed: {e}")


@router.post("/{node_id}/shutdown")
async def graceful_shutdown(node_id: str):
    """
    Gracefully shutdown a node.
    
    Steps:
    1. Drains all flows to other nodes
    2. Stops services gracefully
    3. Initiates OS shutdown
    
    Path parameters:
        - node_id: Node to shutdown
    
    Returns:
        Shutdown operation result
    """
    try:
        manager = get_node_lifecycle_manager()
        result = await manager.graceful_shutdown(node_id)
        
        return {
            "status": result["status"],
            "message": result["message"],
            "flows_drained": result["flows_drained"],
        }
    
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, f"Shutdown failed: {e}")


@router.post("/{node_id}/promote")
async def promote_node(node_id: str, new_role: str = Query(...)):
    """
    Promote node to a new role.
    
    Example: Promote AUDIO-NODE to MANAGEMENT-NODE
    
    Path parameters:
        - node_id: Node to promote
    
    Query parameters:
        - new_role: New role to assign (e.g., "MANAGEMENT-NODE")
    
    Returns:
        Promotion result with old and new roles
    """
    try:
        manager = get_node_lifecycle_manager()
        result = await manager.promote_node_role(node_id, new_role)
        
        return {
            "status": result["status"],
            "message": result["message"],
            "old_role": result["old_role"],
            "new_role": result["new_role"],
        }
    
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, f"Promotion failed: {e}")


@router.post("/{node_id}/demote")
async def demote_node(node_id: str):
    """
    Demote node to lower role.
    
    Example: Demote MANAGEMENT-NODE back to AUDIO-NODE
    
    Path parameters:
        - node_id: Node to demote
    
    Returns:
        Demotion result with flows drained
    """
    try:
        manager = get_node_lifecycle_manager()
        result = await manager.demote_node_role(node_id)
        
        return {
            "status": result["status"],
            "message": result["message"],
            "flows_drained": result["flows_drained"],
        }
    
    except ValueError as e:
        raise HTTPException(404, str(e))
    except Exception as e:
        raise HTTPException(500, f"Demotion failed: {e}")


@router.get("/health/summary")
async def get_cluster_health_summary():
    """
    Get cluster-wide health summary.
    
    Provides overview of all nodes' health status.
    
    Returns:
        Summary of node health scores and recommendations
    """
    try:
        manager = get_node_lifecycle_manager()
        registry = manager.registry
        
        nodes = registry.get_all_nodes()
        node_health = []
        
        for node in nodes:
            try:
                diag = await manager.run_diagnostics(node['id'])
                node_health.append({
                    "node_id": node['id'],
                    "health": diag.overall_health,
                    "status": "healthy" if diag.overall_health > 70 else "degraded",
                    "failed_checks": sum(1 for c in diag.checks if c.status == 'failed'),
                })
            except Exception as e:
                node_health.append({
                    "node_id": node['id'],
                    "health": 0,
                    "status": "unreachable",
                    "error": str(e),
                })
        
        avg_health = sum(nh['health'] for nh in node_health) / len(node_health) if node_health else 0
        
        return {
            "status": "ok",
            "timestamp": utc_now().isoformat(),
            "cluster_health": int(avg_health),
            "total_nodes": len(node_health),
            "healthy_nodes": sum(1 for nh in node_health if nh['status'] == 'healthy'),
            "degraded_nodes": sum(1 for nh in node_health if nh['status'] == 'degraded'),
            "unreachable_nodes": sum(1 for nh in node_health if nh['status'] == 'unreachable'),
            "nodes": node_health,
        }
    
    except Exception as e:
        raise HTTPException(500, f"Failed to get health summary: {e}")

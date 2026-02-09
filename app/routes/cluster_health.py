"""
REST API endpoints for cluster heartbeat and health monitoring.
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, List

from app.services.cluster.heartbeat_monitor import get_heartbeat_monitor, NodeHealthStatus

router = APIRouter(prefix="/api/cluster", tags=["cluster-health"])


@router.get("/health")
async def get_cluster_health():
    """Get cluster-wide health status."""
    monitor = get_heartbeat_monitor()
    all_health = monitor.get_all_health()
    online_nodes = monitor.get_online_nodes()
    offline_nodes = monitor.get_offline_nodes()
    
    return {
        "total_nodes": len(all_health),
        "online_nodes": len(online_nodes),
        "offline_nodes": len(offline_nodes),
        "status": "healthy" if len(offline_nodes) == 0 else "degraded",
        "nodes": {
            node_id: {
                "is_online": status.is_online,
                "last_seen": status.last_seen.isoformat(),
                "consecutive_failures": status.consecutive_failures,
                "response_time_ms": status.response_time_ms,
                "metadata": status.metadata
            }
            for node_id, status in all_health.items()
        }
    }


@router.get("/health/{node_id}")
async def get_node_health(node_id: str):
    """Get health status for a specific node."""
    monitor = get_heartbeat_monitor()
    status = monitor.get_node_health(node_id)
    
    if not status:
        raise HTTPException(404, f"Node {node_id} not found")
    
    return {
        "node_id": node_id,
        "is_online": status.is_online,
        "last_seen": status.last_seen.isoformat(),
        "consecutive_failures": status.consecutive_failures,
        "response_time_ms": status.response_time_ms,
        "metadata": status.metadata
    }


@router.get("/online-nodes")
async def get_online_nodes():
    """Get list of online node IDs."""
    monitor = get_heartbeat_monitor()
    return {
        "online_nodes": list(monitor.get_online_nodes())
    }


@router.get("/offline-nodes")
async def get_offline_nodes():
    """Get list of offline node IDs."""
    monitor = get_heartbeat_monitor()
    return {
        "offline_nodes": list(monitor.get_offline_nodes())
    }

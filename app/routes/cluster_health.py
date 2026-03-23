"""
REST API endpoints for cluster heartbeat and health monitoring.
"""

from datetime import datetime
from fastapi import APIRouter, HTTPException
from typing import Dict

from app.services.cluster.heartbeat_monitor import get_heartbeat_monitor
from app.services.cluster.node_visibility import (
    VISIBILITY_CONTRACT,
    VISIBILITY_CONTRACT_VERSION,
    get_visible_remote_nodes,
)

router = APIRouter(prefix="/api/cluster", tags=["cluster-health"])


@router.get("/health")
async def get_cluster_health():
    """Get cluster-wide health status."""
    monitor = get_heartbeat_monitor()
    local_node_id, visible_nodes = get_visible_remote_nodes()
    all_health = monitor.get_all_health()
    online_nodes = [node_id for node_id, node in visible_nodes.items() if node.is_online]
    offline_nodes = [node_id for node_id, node in visible_nodes.items() if not node.is_online]

    return {
        "contract_version": VISIBILITY_CONTRACT_VERSION,
        "visibility_contract": VISIBILITY_CONTRACT,
        "local_node_id": local_node_id,
        "total_nodes": len(visible_nodes),
        "online_nodes": len(online_nodes),
        "offline_nodes": len(offline_nodes),
        "status": "healthy" if len(offline_nodes) == 0 else "degraded",
        "nodes": {
            node_id: {
                "is_online": node.is_online,
                "last_seen": (
                    node.last_seen.isoformat()
                    if isinstance(node.last_seen, datetime)
                    else all_health[node_id].last_seen.isoformat()
                    if node_id in all_health
                    else None
                ),
                "consecutive_failures": all_health[node_id].consecutive_failures if node_id in all_health else 0,
                "response_time_ms": all_health[node_id].response_time_ms if node_id in all_health else None,
                "metadata": {
                    **(all_health[node_id].metadata if node_id in all_health else {}),
                    "sources": sorted(node.sources),
                    "registered": node.registered,
                    "registry_status": node.registry_status,
                    "heartbeat_online": node.heartbeat_online,
                    "visible": node.visible,
                    "visibility_state": node.visibility_state,
                    "registration_required": node.registration_required,
                    "routing_ready": node.routing_ready,
                    "visibility_reason": node.visibility_reason,
                    "api_url": node.api_url,
                    "host": node.host,
                    "hostname": node.hostname,
                    "discovered_via_mdns": node.discovered_via_mdns,
                    "discovered_via_peer_mdns": node.discovered_via_peer_mdns,
                    "discovered_via_cluster_mdns": node.discovered_via_cluster_mdns,
                },
            }
            for node_id, node in visible_nodes.items()
        }
    }


@router.get("/health/{node_id}")
async def get_node_health(node_id: str):
    """Get health status for a specific node."""
    monitor = get_heartbeat_monitor()
    status = monitor.get_node_health(node_id)
    _, visible_nodes = get_visible_remote_nodes()
    visible = visible_nodes.get(node_id)

    if not status and visible is None:
        raise HTTPException(404, f"Node {node_id} not found")

    return {
        "node_id": node_id,
        "is_online": visible.is_online if visible is not None else status.is_online,
        "last_seen": (
            visible.last_seen.isoformat()
            if visible is not None and isinstance(visible.last_seen, datetime)
            else status.last_seen.isoformat()
            if status
            else None
        ),
        "consecutive_failures": status.consecutive_failures if status else 0,
        "response_time_ms": status.response_time_ms if status else None,
        "metadata": {
            **(status.metadata if status else {}),
            "sources": sorted(visible.sources) if visible is not None else [],
            "registered": visible.registered if visible is not None else False,
            "registry_status": visible.registry_status if visible is not None else None,
            "heartbeat_online": visible.heartbeat_online if visible is not None else None,
            "visible": visible.visible if visible is not None else False,
            "visibility_state": visible.visibility_state if visible is not None else None,
            "registration_required": visible.registration_required if visible is not None else False,
            "routing_ready": visible.routing_ready if visible is not None else False,
            "visibility_reason": visible.visibility_reason if visible is not None else None,
            "api_url": visible.api_url if visible is not None else None,
            "host": visible.host if visible is not None else None,
            "hostname": visible.hostname if visible is not None else None,
            "discovered_via_mdns": visible.discovered_via_mdns if visible is not None else False,
            "discovered_via_peer_mdns": visible.discovered_via_peer_mdns if visible is not None else False,
            "discovered_via_cluster_mdns": visible.discovered_via_cluster_mdns if visible is not None else False,
        },
    }


@router.get("/online-nodes")
async def get_online_nodes():
    """Get list of online node IDs."""
    _, visible_nodes = get_visible_remote_nodes()
    return {
        "contract_version": VISIBILITY_CONTRACT_VERSION,
        "visibility_contract": VISIBILITY_CONTRACT,
        "online_nodes": sorted([node_id for node_id, node in visible_nodes.items() if node.is_online]),
        "nodes": {
            node_id: {
                "hostname": node.hostname,
                "host": node.host,
                "sources": sorted(node.sources),
                "registered": node.registered,
                "visibility_state": node.visibility_state,
                "registration_required": node.registration_required,
                "routing_ready": node.routing_ready,
                "visibility_reason": node.visibility_reason,
                "api_url": node.api_url,
            }
            for node_id, node in visible_nodes.items()
            if node.is_online
        },
    }


@router.get("/offline-nodes")
async def get_offline_nodes():
    """Get list of offline node IDs."""
    _, visible_nodes = get_visible_remote_nodes()
    return {
        "contract_version": VISIBILITY_CONTRACT_VERSION,
        "visibility_contract": VISIBILITY_CONTRACT,
        "offline_nodes": sorted([node_id for node_id, node in visible_nodes.items() if not node.is_online]),
        "nodes": {
            node_id: {
                "hostname": node.hostname,
                "host": node.host,
                "sources": sorted(node.sources),
                "registered": node.registered,
                "visibility_state": node.visibility_state,
                "registration_required": node.registration_required,
                "routing_ready": node.routing_ready,
                "visibility_reason": node.visibility_reason,
                "api_url": node.api_url,
            }
            for node_id, node in visible_nodes.items()
            if not node.is_online
        },
    }

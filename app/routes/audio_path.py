"""
Audio Path REST API Endpoints

Cluster-aware endpoints for exposing audio infrastructure across all nodes.
Provides:
- GET /api/audio-path/local - This node's complete audio path
- GET /api/audio-path/nodes - All nodes' audio paths (Management node only)
- GET /api/audio-path/nodes/{node_id} - Specific node's audio path
- WebSocket subscription to audio path changes
"""

import logging
from typing import Dict, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, status, WebSocket, WebSocketDisconnect
import asyncio
import json

from app.services.cluster.audio_path_discovery import get_audio_path_service, AudioPathService
from app.services.cluster.registry import get_cluster_registry

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/audio-path", tags=["audio-path"])


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/local")
async def get_local_audio_path() -> Dict:
    """
    Get complete audio path for this node.
    
    Returns:
        NodeAudioPath with:
        - All audio services and their health
        - PipeWire daemon status & settings
        - JUCE engine info
        - ALSA configuration
        - Latency breakdown
        - Service dependency graph
        - Active alerts
    """
    try:
        svc = get_audio_path_service()
        audio_path = await svc.get_node_audio_path()
        return {
            "status": "ok",
            "timestamp": _utc_now_iso(),
            "data": audio_path.to_dict(),
        }
    except Exception as e:
        logger.error(f"Failed to get local audio path: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get audio path: {str(e)}",
        )


@router.get("/nodes")
async def get_all_nodes_audio_paths() -> Dict:
    """
    Get audio paths for all cluster nodes (Management node endpoint).
    
    Aggregates audio path information from all nodes for cluster-wide visibility.
    
    Returns:
        Dictionary with:
        - nodes: List of all nodes with their audio paths
        - overall_health: Cluster-level audio health
        - alerts: Aggregated alerts from all nodes
        - unhealthy_nodes: Count and list of nodes with issues
    """
    try:
        registry = get_cluster_registry()
        audio_svc = get_audio_path_service()
        
        # Get all nodes
        all_nodes = registry.get_all_nodes()
        
        node_paths = []
        alerts = []
        unhealthy_count = 0
        
        # Fetch audio path for each node
        for node in all_nodes:
            try:
                node_id = node.get("id") or node.get("node_id")
                node_url = node.get("url") or f"http://{node.get('hostname', 'unknown')}:8080"
                
                # Try to fetch from the node itself
                import httpx
                async with httpx.AsyncClient(timeout=5.0) as client:
                    try:
                        resp = await client.get(f"{node_url}/api/audio-path/local")
                        if resp.status_code == 200:
                            data = resp.json().get("data", {})
                            node_paths.append({
                                "node_id": node_id,
                                "hostname": node.get("hostname"),
                                "audio_path": data,
                            })
                            
                            # Collect alerts
                            if data.get("alerts"):
                                alerts.extend([
                                    f"{node.get('hostname')}: {alert}"
                                    for alert in data["alerts"]
                                ])
                            
                            # Count unhealthy nodes
                            if data.get("overall_health") != "healthy":
                                unhealthy_count += 1
                    except Exception as e:
                        logger.debug(f"Failed to fetch audio path from {node_id}: {e}")
                        node_paths.append({
                            "node_id": node_id,
                            "hostname": node.get("hostname"),
                            "error": f"Failed to fetch: {str(e)}",
                        })
                        unhealthy_count += 1
            except Exception as e:
                logger.debug(f"Error processing node {node}: {e}")
        
        return {
            "status": "ok",
            "timestamp": _utc_now_iso(),
            "total_nodes": len(all_nodes),
            "healthy_nodes": len(all_nodes) - unhealthy_count,
            "unhealthy_nodes": unhealthy_count,
            "nodes": node_paths,
            "alerts": alerts,
        }
    
    except Exception as e:
        logger.error(f"Failed to get cluster audio paths: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get cluster audio paths: {str(e)}",
        )


@router.get("/nodes/{node_id}")
async def get_node_audio_path(node_id: str) -> Dict:
    """
    Get audio path for a specific cluster node.
    
    Path Parameters:
        node_id: Node identifier
    
    Returns:
        NodeAudioPath for the specified node
    """
    try:
        registry = get_cluster_registry()
        node = registry.get_node(node_id)
        
        if not node:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Node {node_id} not found",
            )
        
        # Fetch audio path from the node
        import httpx
        node_url = node.get("url") or f"http://{node.get('hostname')}:8080"
        
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{node_url}/api/audio-path/local")
                if resp.status_code == 200:
                    return resp.json()
        except Exception as e:
            logger.error(f"Failed to fetch audio path from {node_id}: {e}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Failed to reach node {node_id}: {str(e)}",
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get audio path for {node_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get audio path: {str(e)}",
        )


@router.get("/summary")
async def get_audio_path_summary() -> Dict:
    """
    Get a quick summary of audio health across all nodes.
    
    Returns:
        - healthy_nodes: Count of nodes with all services healthy
        - warning_nodes: Count of nodes with warnings
        - error_nodes: Count of nodes with errors
        - total_latency_avg: Average latency across nodes
        - critical_alerts: Any critical issues found
    """
    try:
        registry = get_cluster_registry()
        all_nodes = registry.get_all_nodes()
        
        healthy = 0
        warning = 0
        error = 0
        latencies = []
        critical_alerts = []
        
        import httpx
        
        for node in all_nodes:
            try:
                node_id = node.get("id") or node.get("node_id")
                node_url = node.get("url") or f"http://{node.get('hostname')}:8080"
                
                async with httpx.AsyncClient(timeout=3.0) as client:
                    resp = await client.get(f"{node_url}/api/audio-path/local")
                    if resp.status_code == 200:
                        data = resp.json().get("data", {})
                        health = data.get("overall_health", "unknown")
                        
                        if health == "healthy":
                            healthy += 1
                        elif health == "warning":
                            warning += 1
                        else:
                            error += 1
                        
                        # Collect latency
                        latency = data.get("latency", {}).get("total_ms", 0)
                        if latency > 0:
                            latencies.append(latency)
                        
                        # Collect critical alerts
                        for alert in data.get("alerts", []):
                            if "error" in alert.lower() or "🔴" in alert:
                                critical_alerts.append({
                                    "node_id": node_id,
                                    "alert": alert,
                                })
            except Exception as e:
                logger.debug(f"Error checking {node.get('hostname')}: {e}")
                error += 1
        
        avg_latency = sum(latencies) / len(latencies) if latencies else 0
        
        return {
            "status": "ok",
            "timestamp": _utc_now_iso(),
            "summary": {
                "total_nodes": len(all_nodes),
                "healthy_nodes": healthy,
                "warning_nodes": warning,
                "error_nodes": error,
                "average_latency_ms": round(avg_latency, 1),
                "critical_alerts_count": len(critical_alerts),
            },
            "critical_alerts": critical_alerts[:10],  # First 10
        }
    
    except Exception as e:
        logger.error(f"Failed to get audio path summary: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get summary: {str(e)}",
        )


# ============================================================================
# WebSocket Real-Time Audio Path Changes
# ============================================================================

_audio_path_subscribers: Dict[str, list] = {}


@router.websocket("/ws/changes")
async def websocket_audio_path_changes(websocket: WebSocket):
    """
    WebSocket for real-time audio path status changes.
    
    Receives updates whenever:
    - PipeWire daemon starts/stops
    - JUCE engine changes state
    - Latency changes significantly
    - Alerts are generated
    - XRuns occur
    
    Message format:
    {
        "type": "audio_path_update",
        "timestamp": "ISO timestamp",
        "node_id": "node-id",
        "change": "pipewire_started|juce_running|latency_spike|xrun|alert",
        "data": {...}
    }
    """
    await websocket.accept()
    
    try:
        # Subscribe to updates
        subscriber_list = _audio_path_subscribers.setdefault(websocket.client.host, [])
        subscriber_list.append(websocket)
        
        logger.info(f"Audio path WebSocket client connected: {websocket.client.host}")
        
        # Keep connection alive
        while True:
            try:
                # Wait for client messages (ping/pong to detect disconnection)
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                # Process any client requests (e.g., subscribe to specific node)
                try:
                    data = json.loads(msg)
                    if data.get("action") == "subscribe_node":
                        # Client can request updates only for specific nodes
                        logger.debug(f"Client subscribed to node: {data.get('node_id')}")
                except Exception:
                    pass
            except asyncio.TimeoutError:
                # Keep alive, no timeout
                continue
            except Exception:
                break
    
    except WebSocketDisconnect:
        logger.info(f"Audio path WebSocket client disconnected: {websocket.client.host}")
    finally:
        # Remove from subscribers
        if websocket.client.host in _audio_path_subscribers:
            _audio_path_subscribers[websocket.client.host].remove(websocket)


async def broadcast_audio_path_update(node_id: str, change_type: str, data: Dict) -> None:
    """
    Broadcast an audio path change to all WebSocket subscribers.
    
    Args:
        node_id: Node where change occurred
        change_type: Type of change (pipewire_started, juce_running, latency_spike, xrun, alert)
        data: Change data
    """
    message = {
        "type": "audio_path_update",
        "timestamp": _utc_now_iso(),
        "node_id": node_id,
        "change": change_type,
        "data": data,
    }
    
    msg_json = json.dumps(message)
    
    # Broadcast to all subscribers
    for subscribers in _audio_path_subscribers.values():
        for subscriber in list(subscribers):
            try:
                await subscriber.send_text(msg_json)
            except Exception:
                try:
                    subscribers.remove(subscriber)
                except Exception:
                    pass

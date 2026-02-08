"""
Cluster Management API Endpoints

FastAPI routes for cluster administration and monitoring:
- GET /api/cluster/nodes - List all nodes with health
- GET /api/cluster/health - Aggregate cluster health
- GET /api/cluster/status - Overall cluster state
- GET /api/cluster/metrics - Time series metrics
- POST /api/cluster/nodes/{id}/update - Trigger update
- POST /api/cluster/nodes/{id}/reboot - Reboot node
- GET /api/cluster/summary - Quick summary

All endpoints protected by mTLS and RBAC.
"""

import logging
from typing import Dict, List, Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, status

from app.services.cluster.registry import get_cluster_registry
from app.services.cluster.health_aggregator import get_health_aggregator
from app.services.cluster.mdns_discovery_enhanced import get_enhanced_mdns_discovery
from app.services.cluster.certificate_authority import get_cluster_ca
from app.services.cluster.update_orchestrator import get_update_scheduler
from app.services.cluster.config_pusher import get_config_sync
from app.services.cluster.state_replicator import get_state_replicator
from app.services.cluster.distributed_event_bus import get_event_bus, EventType
from app.services.cluster.node_lifecycle import get_lifecycle_manager
from app.services.cluster.disaster_recovery import get_disaster_recovery
from app.services.cluster.network_topology import get_topology_monitor
from app.services.cluster.config_manager import get_config_manager
from app.services.cluster.deployment_manager import get_deployment_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cluster", tags=["cluster"])


# ============================================================================
# Cluster Setup & Onboarding
# ============================================================================

@router.post("/setup")
async def setup_cluster(request: dict):
    """
    Complete cluster setup from onboarding wizard.
    
    Payload includes:
    - deployment_mode
    - cluster_name
    - discovered_nodes
    - network configuration
    - certificate mode
    """
    try:
        # Apply deployment mode
        deployment_mgr = get_deployment_manager()
        
        mode = request.get("deployment_mode", "all-in-one")
        await deployment_mgr.set_mode(mode)
        
        # Register discovered nodes
        registry = get_cluster_registry()
        for node in request.get("discovered_nodes", []):
            registry.register_node(
                node_id=node.get("node_id", node.get("hostname")),
                metadata={
                    "hostname": node.get("hostname"),
                    "ip_address": node.get("ip_address"),
                    "role": node.get("role", "worker"),
                },
            )
        
        # Update cluster config
        config_mgr = get_config_manager()
        config_mgr.update_config({
            "cluster_name": request.get("cluster_name"),
            "management_ip": request.get("management_ip"),
            "network_interface": request.get("network_interface"),
            "api_port": request.get("api_port"),
            "enable_mdns": request.get("enable_mdns"),
            "enable_tls": request.get("enable_tls"),
        })
        
        return {
            "status": "ok",
            "message": "Cluster setup complete",
            "mode": mode,
            "nodes_registered": len(request.get("discovered_nodes", [])),
        }
    except Exception as e:
        raise HTTPException(500, f"Setup failed: {e}")


# ============================================================================
# Response Models
# ============================================================================


class NodeResponse(dict):
    """Node information response"""

    pass


class NodeHealthResponse(dict):
    """Node health information"""

    pass


class ClusterHealthResponse(dict):
    """Cluster aggregate health"""

    pass


# ============================================================================
# ENDPOINTS
# ============================================================================


@router.get("/status")
async def get_cluster_status() -> Dict:
    """
    Get overall cluster status.

    Returns:
        Dictionary with cluster state, online nodes, health, etc.
    """
    try:
        registry = get_cluster_registry()
        summary = registry.get_cluster_summary()

        return {
            "status": "ok",
            "timestamp": datetime.utcnow().isoformat(),
            **summary,
        }

    except Exception as e:
        logger.error(f"Failed to get cluster status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve cluster status",
        )


@router.get("/nodes")
async def list_nodes(role: Optional[str] = None, status_filter: Optional[str] = None) -> Dict:
    """
    List all cluster nodes with their status and health.

    Query Parameters:
        role: Filter by role (AUDIO-NODE, MANAGEMENT-NODE)
        status_filter: Filter by status (online, offline, degraded, updating)

    Returns:
        List of node information objects
    """
    try:
        registry = get_cluster_registry()
        aggregator = get_health_aggregator()

        # Get nodes
        if role:
            nodes = registry.get_nodes_by_role(role)
        elif status_filter:
            nodes = registry.get_nodes_by_status(status_filter)
        else:
            nodes = registry.get_all_nodes()

        # Enhance with health scores
        for node in nodes:
            node_id = node["id"]
            health_score = aggregator.get_node_health(node_id)
            if health_score is not None:
                node["health_score"] = health_score
            node["last_seen"] = node.get("last_seen", "").isoformat()
            node["last_updated"] = node.get("last_updated", "").isoformat()

        return {
            "status": "ok",
            "timestamp": datetime.utcnow().isoformat(),
            "count": len(nodes),
            "nodes": nodes,
        }

    except Exception as e:
        logger.error(f"Failed to list nodes: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve node list",
        )


@router.get("/nodes/{node_id}")
async def get_node(node_id: str) -> Dict:
    """
    Get details for a specific node.

    Path Parameters:
        node_id: Node identifier

    Returns:
        Node information with health and metrics
    """
    try:
        registry = get_cluster_registry()
        aggregator = get_health_aggregator()

        node = registry.get_node(node_id)
        if not node:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Node {node_id} not found",
            )

        # Add health score
        health_score = aggregator.get_node_health(node_id)
        if health_score is not None:
            node["health_score"] = health_score

        node["last_seen"] = node.get("last_seen", "").isoformat()
        node["last_updated"] = node.get("last_updated", "").isoformat()

        return {
            "status": "ok",
            "timestamp": datetime.utcnow().isoformat(),
            "node": node,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get node {node_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve node details",
        )


@router.get("/health")
async def get_health() -> Dict:
    """
    Get cluster aggregate health information.

    Returns:
        Overall health score, online nodes, metrics by node
    """
    try:
        aggregator = get_health_aggregator()
        health = aggregator.get_cluster_health()

        return {
            "status": "ok",
            "timestamp": datetime.utcnow().isoformat(),
            **health,
        }

    except Exception as e:
        logger.error(f"Failed to get cluster health: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve health information",
        )


@router.get("/health/{node_id}")
async def get_node_health(node_id: str) -> Dict:
    """
    Get health details for a specific node.

    Path Parameters:
        node_id: Node identifier

    Returns:
        Node health score and metrics
    """
    try:
        registry = get_cluster_registry()
        aggregator = get_health_aggregator()

        # Verify node exists
        node = registry.get_node(node_id)
        if not node:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Node {node_id} not found",
            )

        health_score = aggregator.get_node_health(node_id) or 50.0

        return {
            "status": "ok",
            "timestamp": datetime.utcnow().isoformat(),
            "node_id": node_id,
            "health_score": health_score,
            "status_info": node.get("status", "unknown"),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get node health for {node_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve node health",
        )


@router.get("/metrics")
async def get_metrics(node_id: Optional[str] = None) -> Dict:
    """
    Get time series metrics.

    Query Parameters:
        node_id: Optional - get metrics for specific node

    Returns:
        Metrics data with timestamps
    """
    try:
        # TODO: Implement metrics time series retrieval
        # This would query the metrics_history table in the registry

        return {
            "status": "ok",
            "timestamp": datetime.utcnow().isoformat(),
            "metrics": [],
            "note": "Metrics endpoint will be implemented in metrics service",
        }

    except Exception as e:
        logger.error(f"Failed to get metrics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve metrics",
        )


@router.post("/nodes/{node_id}/update")
async def trigger_node_update(node_id: str, dry_run: bool = False) -> Dict:
    """
    Trigger package update for a node.

    Path Parameters:
        node_id: Node identifier

    Query Parameters:
        dry_run: If true, only show what would be updated

    Returns:
        Update job information
    """
    try:
        registry = get_cluster_registry()

        # Verify node exists
        node = registry.get_node(node_id)
        if not node:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Node {node_id} not found",
            )

        scheduler = get_update_scheduler()
        result = await scheduler.update_single_node(node_id=node_id, dry_run=dry_run)
        return {
            "status": result.get("status", "ok"),
            "node_id": node_id,
            "action": "update_triggered" if not dry_run else "dry_run_requested",
            "timestamp": datetime.utcnow().isoformat(),
            "result": result,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to trigger update for {node_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to trigger update",
        )


@router.post("/nodes/{node_id}/reboot")
async def reboot_node(node_id: str, force: bool = False) -> Dict:
    """
    Reboot a node.

    Path Parameters:
        node_id: Node identifier

    Query Parameters:
        force: If true, force immediate reboot (warning: may disrupt audio)

    Returns:
        Reboot status
    """
    try:
        registry = get_cluster_registry()

        # Verify node exists
        node = registry.get_node(node_id)
        if not node:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Node {node_id} not found",
            )

        # TODO: Implement actual reboot command
        # This would use systemd or SSH to reboot the node

        return {
            "status": "ok",
            "node_id": node_id,
            "action": "reboot_requested",
            "force": force,
            "timestamp": datetime.utcnow().isoformat(),
            "note": "Reboot implementation will be completed in Phase 3",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to reboot node {node_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reboot node",
        )


@router.get("/summary")
async def get_summary() -> Dict:
    """
    Get quick cluster summary (optimized for dashboards).

    Returns:
        Compact summary of cluster state
    """
    try:
        registry = get_cluster_registry()
        aggregator = get_health_aggregator()

        cluster_summary = registry.get_cluster_summary()
        health = aggregator.get_cluster_health()

        return {
            "status": "ok",
            "timestamp": datetime.utcnow().isoformat(),
            "cluster_name": "MAP2 Audio Cluster",  # TODO: Get from config
            "total_nodes": cluster_summary.get("total_nodes", 0),
            "online_nodes": cluster_summary.get("online_nodes", 0),
            "management_nodes": cluster_summary.get("management_nodes", 0),
            "audio_nodes": cluster_summary.get("audio_nodes", 0),
            "overall_health": health.get("overall_health", 50.0),
            "avg_health": health.get("avg_health", 50.0),
        }

    except Exception as e:
        logger.error(f"Failed to get cluster summary: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve cluster summary",
        )


@router.get("/discovered")
async def get_discovered_nodes() -> Dict:
    """
    Get list of discovered nodes from mDNS.

    Returns:
        List of discovered nodes with capabilities
    """
    try:
        discovery = get_enhanced_mdns_discovery()
        summary = discovery.get_cluster_summary()

        return {
            "status": "ok",
            "timestamp": datetime.utcnow().isoformat(),
            **summary,
        }

    except Exception as e:
        logger.error(f"Failed to get discovered nodes: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve discovered nodes",
        )


@router.get("/certificates/status")
async def get_certificate_status() -> Dict:
    """
    Get status of cluster certificates.

    Returns:
        Certificate information and renewal status
    """
    try:
        ca = get_cluster_ca()
        registry = get_cluster_registry()

        nodes = registry.get_all_nodes()
        cert_status = {}

        for node in nodes:
            node_id = node["id"]
            expiry = ca.get_certificate_expiry(node_id)
            should_renew = ca.should_renew_certificate(node_id)

            if expiry:
                cert_status[node_id] = {
                    "expiry": expiry.isoformat(),
                    "should_renew": should_renew,
                }

        return {
            "status": "ok",
            "timestamp": datetime.utcnow().isoformat(),
            "ca_certificate": "configured" if ca.has_root_ca() else "not_configured",
            "certificates": cert_status,
        }

    except Exception as e:
        logger.error(f"Failed to get certificate status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve certificate status",
        )


# ============================================================================
# Update Orchestration Endpoints
# ============================================================================


@router.get("/update/schedule")
async def get_update_schedule() -> Dict:
    """
    Get recommended update schedule for the cluster.
    
    Returns:
        - total_nodes: Total nodes in cluster
        - audio_nodes: Number of audio nodes
        - management_nodes: Number of management nodes
        - estimated_hours: Estimated duration
        - recommended_schedule: When to run updates
    """
    try:
        scheduler = get_update_scheduler()
        schedule = scheduler.get_update_schedule()
        return schedule
    except Exception as e:
        logger.error(f"Failed to get update schedule: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/update/dry-run")
async def update_dry_run() -> Dict:
    """
    Perform a dry-run of package updates (show what would be updated).
    
    Returns:
        - available_updates: List of packages with updates
        - affected_nodes: How many nodes would be updated
        - estimated_duration: Time to complete
    """
    try:
        scheduler = get_update_scheduler(dry_run=True)
        dnf = get_update_scheduler().dnf
        updates = dnf.check_for_updates()
        
        return {
            "available_updates": len(updates),
            "update_details": updates,
            "affected_nodes": len(get_cluster_registry().get_all_nodes()),
            "dry_run": True,
            "estimated_duration_hours": scheduler.get_update_schedule().get(
                "estimated_hours", 0
            ),
        }
    except Exception as e:
        logger.error(f"Dry-run failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/update/execute")
async def execute_updates(test_node_id: Optional[str] = None) -> Dict:
    """
    Execute cluster-wide package update.
    
    Args:
        test_node_id: Optional single node to test updates before full rollout
        
    Returns:
        - status: "started" or "failed"
        - report: Update report with results
    """
    try:
        scheduler = get_update_scheduler(test_node_id=test_node_id)
        report = await scheduler.execute_update_cycle()
        
        return {
            "status": "completed",
            "report": report.to_dict(),
        }
    except Exception as e:
        logger.error(f"Update execution failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/update/cancel")
async def cancel_update() -> Dict:
    """Cancel ongoing cluster update (graceful)."""
    try:
        scheduler = get_update_scheduler()
        success = await scheduler.cancel_update()
        
        return {
            "cancelled": success,
            "message": "Update cancelled" if success else "No update in progress",
        }
    except Exception as e:
        logger.error(f"Cancel failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/update/history")
async def get_update_history(limit: int = 50) -> Dict:
    """
    Get history of cluster updates.
    
    Args:
        limit: Maximum number of update records to return
        
    Returns:
        - updates: List of past update operations with results
    """
    try:
        registry = get_cluster_registry()
        
        # TODO: Query registry for update history
        return {
            "updates": [],
            "total": 0,
            "limit": limit,
        }
    except Exception as e:
        logger.error(f"Failed to get update history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Configuration Distribution Endpoints
# ============================================================================


@router.post("/config/push")
async def push_configuration(
    config_type: str,
    config_data: Dict,
    message: str = "Configuration update",
) -> Dict:
    """
    Push configuration to all cluster nodes.
    
    Args:
        config_type: "preset", "midi_mapping", or "audio_chain"
        config_data: Configuration data to distribute
        message: Commit message for versioning
        
    Returns:
        - success: Whether push was successful
        - nodes_updated: Number of nodes that received config
    """
    try:
        config_sync = get_config_sync()
        success = await config_sync.push_config_to_nodes(
            config_type, config_data, message
        )
        
        if success:
            nodes = get_cluster_registry().get_all_nodes()
            return {
                "success": True,
                "nodes_updated": len(nodes),
                "config_type": config_type,
                "message": message,
            }
        else:
            raise HTTPException(status_code=500, detail="Push failed")
            
    except Exception as e:
        logger.error(f"Config push failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config/history")
async def get_config_history(limit: int = 20) -> Dict:
    """
    Get history of configuration changes.
    
    Args:
        limit: Maximum number of versions to return
        
    Returns:
        - versions: List of configuration versions with timestamps
    """
    try:
        config_sync = get_config_sync()
        history = config_sync.get_config_history(limit=limit)
        
        return {
            "versions": [
                {
                    "hash": v.version_hash,
                    "timestamp": v.timestamp.isoformat(),
                    "author": v.author,
                    "message": v.message,
                    "files_changed": v.files_changed,
                }
                for v in history
            ],
            "total": len(history),
        }
    except Exception as e:
        logger.error(f"Failed to get config history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/config/diff")
async def get_config_diff(version_a: str, version_b: str) -> Dict:
    """
    Get differences between two configuration versions.
    
    Args:
        version_a: First version hash
        version_b: Second version hash
        
    Returns:
        - changes: Dictionary showing what changed
    """
    try:
        config_sync = get_config_sync()
        diff = await config_sync.get_config_diff(version_a, version_b)
        
        return {
            "version_a": version_a,
            "version_b": version_b,
            "changes": diff,
        }
    except Exception as e:
        logger.error(f"Failed to get diff: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/config/rollback")
async def rollback_configuration(version_hash: str) -> Dict:
    """
    Rollback configuration to previous version.
    
    Args:
        version_hash: Git commit hash to restore
        
    Returns:
        - success: Whether rollback was successful
        - version: Version that was restored
    """
    try:
        config_sync = get_config_sync()
        success = await config_sync.rollback_config(version_hash)
        
        return {
            "success": success,
            "version": version_hash,
            "message": "Configuration rolled back" if success else "Rollback failed",
        }
    except Exception as e:
        logger.error(f"Rollback failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# State Replication Endpoints
# ============================================================================


@router.get("/replication/status")
async def get_replication_status() -> Dict:
    """
    Get current state replication status.
    
    Returns:
        - is_primary: Whether this node is primary
        - last_replication: When state was last replicated
        - standby_host: IP of standby management node
        - replication_interval: How often replication occurs (seconds)
    """
    try:
        replicator = get_state_replicator()
        status = replicator.get_replication_status()
        
        return status
    except Exception as e:
        logger.error(f"Failed to get replication status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/replication/force-sync")
async def force_sync_replication() -> Dict:
    """Force immediate synchronization to standby (primary only)."""
    try:
        replicator = get_state_replicator()
        
        if not replicator.is_primary:
            raise HTTPException(
                status_code=403, detail="Only primary can force replication"
            )
        
        success = await replicator._replicate_to_standby()
        
        return {
            "success": success,
            "message": "Replication forced" if success else "Replication failed",
        }
    except Exception as e:
        logger.error(f"Failed to force sync: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Health check endpoint (no auth required)
@router.get("/ping")
async def cluster_ping() -> Dict:
    """Simple health check endpoint"""
    return {
        "status": "ok",
        "service": "cluster-manager",
        "timestamp": datetime.utcnow().isoformat(),
    }


# ============================================================================
# Event Bus Endpoints
# ============================================================================


@router.get("/events")
async def get_events(
    event_type: Optional[str] = None,
    severity: Optional[str] = None,
    hours: int = 24,
    limit: int = 100,
) -> Dict:
    """
    Get cluster events from log.
    
    Args:
        event_type: Filter by event type (optional)
        severity: Filter by severity (optional)
        hours: How far back to search
        limit: Maximum events to return
        
    Returns:
        - events: List of events
        - total: Number of events returned
    """
    try:
        event_bus = get_event_bus()
        
        # Convert string filters to enums if provided
        event_type_enum = None
        severity_enum = None
        
        if event_type:
            try:
                event_type_enum = EventType(event_type)
            except ValueError:
                pass
        
        if severity:
            try:
                from app.services.cluster.distributed_event_bus import EventSeverity
                severity_enum = EventSeverity(severity)
            except ValueError:
                pass
        
        events = event_bus.get_events(
            event_type=event_type_enum,
            severity=severity_enum,
            hours=hours,
            limit=limit,
        )
        
        return {
            "events": [e.to_dict() for e in events],
            "total": len(events),
            "filters": {
                "event_type": event_type,
                "severity": severity,
                "hours": hours,
            },
        }
    except Exception as e:
        logger.error(f"Failed to get events: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events/node/{node_id}")
async def get_node_events(
    node_id: str,
    hours: int = 24,
    limit: int = 100,
) -> Dict:
    """Get all events related to a specific node."""
    try:
        event_bus = get_event_bus()
        events = event_bus.get_events_by_node(node_id, hours=hours, limit=limit)
        
        return {
            "node_id": node_id,
            "events": [e.to_dict() for e in events],
            "total": len(events),
        }
    except Exception as e:
        logger.error(f"Failed to get node events: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/events/statistics")
async def get_event_statistics(hours: int = 24) -> Dict:
    """
    Get statistics about cluster events.
    
    Args:
        hours: Time window to analyze
        
    Returns:
        - total_events: Total events in window
        - events_by_type: Breakdown by event type
        - events_by_severity: Breakdown by severity
        - top_nodes: Most active nodes
    """
    try:
        event_bus = get_event_bus()
        stats = event_bus.get_statistics(hours=hours)
        
        return {
            "time_window_hours": hours,
            **stats,
        }
    except Exception as e:
        logger.error(f"Failed to get statistics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Node Lifecycle Endpoints
# ============================================================================


@router.get("/nodes/{node_id}/lifecycle")
async def get_node_lifecycle(node_id: str) -> Dict:
    """
    Get lifecycle information for a node.
    
    Args:
        node_id: ID of node
        
    Returns:
        - current_state: Current lifecycle state
        - transition_count: Number of state transitions
        - last_transition: Most recent transition details
    """
    try:
        mgr = get_lifecycle_manager(node_id)
        status = mgr.get_status()
        
        return status
    except Exception as e:
        logger.error(f"Failed to get lifecycle: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/nodes/{node_id}/lifecycle/history")
async def get_node_lifecycle_history(node_id: str) -> Dict:
    """
    Get complete state transition history for a node.
    
    Returns:
        - transitions: List of state transitions with timestamps
    """
    try:
        mgr = get_lifecycle_manager(node_id)
        history = mgr.get_history()
        
        return {
            "node_id": node_id,
            "transitions": [
                {
                    "from": t.from_state.value,
                    "to": t.to_state.value,
                    "event": t.event.value,
                    "timestamp": t.timestamp.isoformat(),
                    "message": t.message,
                }
                for t in history
            ],
            "total": len(history),
        }
    except Exception as e:
        logger.error(f"Failed to get lifecycle history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/nodes/{node_id}/lifecycle/transition")
async def trigger_lifecycle_transition(
    node_id: str,
    event: str,
    message: str = "",
) -> Dict:
    """
    Manually trigger a lifecycle state transition.
    
    Args:
        node_id: Node ID
        event: Lifecycle event to trigger
        message: Optional message
        
    Returns:
        - success: Whether transition succeeded
        - old_state: Previous state
        - new_state: Current state
    """
    try:
        from app.services.cluster.node_lifecycle import NodeLifecycleEvent
        
        mgr = get_lifecycle_manager(node_id)
        old_state = mgr.current_state
        
        # Convert string to event enum
        try:
            event_enum = NodeLifecycleEvent(event)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid event: {event}")
        
        success = await mgr.transition(event_enum, message=message)
        
        return {
            "success": success,
            "node_id": node_id,
            "old_state": old_state.value,
            "new_state": mgr.current_state.value,
            "event": event,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Transition failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Disaster Recovery Endpoints
# ============================================================================


@router.post("/backup/create")
async def create_backup(backup_type: str = "full") -> Dict:
    """
    Create a new backup.
    
    Args:
        backup_type: Type of backup ("full", "database", "presets", "config")
        
    Returns:
        - backup_id: ID of created backup
        - size_bytes: Backup size
        - timestamp: When backup was created
    """
    try:
        dr = get_disaster_recovery()
        
        if backup_type == "full":
            manifest = await dr.create_full_backup()
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported backup type: {backup_type}"
            )
        
        if manifest:
            return {
                "success": True,
                "backup": manifest.to_dict(),
            }
        else:
            raise HTTPException(status_code=500, detail="Backup creation failed")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create backup: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/backup/list")
async def list_backups(
    backup_type: Optional[str] = None,
    limit: int = 50,
) -> Dict:
    """
    List available backups.
    
    Args:
        backup_type: Filter by type (optional)
        limit: Maximum backups to return
        
    Returns:
        - backups: List of backup manifests
        - total: Number of backups
    """
    try:
        dr = get_disaster_recovery()
        backups = dr.list_backups(backup_type=backup_type, limit=limit)
        
        return {
            "backups": [b.to_dict() for b in backups],
            "total": len(backups),
        }
    except Exception as e:
        logger.error(f"Failed to list backups: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/backup/restore")
async def restore_backup(
    backup_id: str,
    restore_type: str = "full",
) -> Dict:
    """
    Restore from a backup.
    
    Args:
        backup_id: ID of backup to restore
        restore_type: What to restore ("full", "database", "presets", "config")
        
    Returns:
        - success: Whether restore succeeded
        - backup_id: ID of backup restored from
    """
    try:
        dr = get_disaster_recovery()
        success = await dr.restore_from_backup(backup_id, restore_type)
        
        return {
            "success": success,
            "backup_id": backup_id,
            "restore_type": restore_type,
        }
    except Exception as e:
        logger.error(f"Failed to restore backup: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/backup/cleanup")
async def cleanup_old_backups() -> Dict:
    """
    Remove backups older than retention period.
    
    Returns:
        - deleted: Number of backups deleted
    """
    try:
        dr = get_disaster_recovery()
        deleted = await dr.cleanup_old_backups()
        
        return {
            "success": True,
            "deleted": deleted,
        }
    except Exception as e:
        logger.error(f"Failed to cleanup backups: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Network Topology Endpoints
# ============================================================================


@router.get("/topology")
async def get_topology() -> Dict:
    """
    Get current network topology.
    
    Returns:
        - nodes: List of nodes in cluster
        - links: Network links between nodes with latency/health
        - summary: Overall topology health statistics
    """
    try:
        monitor = get_topology_monitor()
        return monitor.get_current_topology()
    except Exception as e:
        logger.error(f"Failed to get topology: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/topology/route")
async def get_optimal_route(
    source: str,
    target: str,
) -> Dict:
    """
    Calculate optimal route between two nodes.
    
    Args:
        source: Source node ID
        target: Target node ID
        
    Returns:
        - route: List of node IDs forming the optimal path
        - hops: Number of hops in the route
    """
    try:
        monitor = get_topology_monitor()
        route = monitor.get_optimal_route(source, target)
        
        if route:
            return {
                "route": route,
                "hops": len(route) - 1,
            }
        else:
            raise HTTPException(status_code=404, detail="No route found")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Route calculation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Health check endpoint (no auth required)
@router.get("/ping")
async def cluster_ping() -> Dict:
    """Simple health check endpoint"""
    return {
        "status": "ok",
        "service": "cluster-manager",
        "timestamp": datetime.utcnow().isoformat(),
    }

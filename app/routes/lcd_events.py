"""
LCD Events API Routes

REST API and WebSocket endpoints for LCD event system:
- GET /api/lcd/events - Get recent events
- POST /api/lcd/events - Publish new event
- GET /api/lcd/history - Get event history
- WS /ws/lcd-events - Real-time event stream
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import logging
import json

from app.models.lcd_event import LCDEvent, EventType, EventSeverity
from app.services.lcd_event_persistence import get_lcd_persistence
from app.utils.health_metrics import get_health_metrics
from fastapi.responses import Response
import os

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lcd", tags=["LCD Events"])

# Global LCD manager (injected by main app)
lcd_manager = None

# Active WebSocket connections
active_connections: List[WebSocket] = []


class EventCreateRequest(BaseModel):
    """Request to create new LCD event"""
    title: str
    message: str
    event_type: EventType = EventType.USER
    severity: EventSeverity = EventSeverity.INFO
    icon: str = "•"
    broadcast: bool = True
    color: str = "white"
    sound: bool = False


class EventResponse(BaseModel):
    """LCD event response"""
    event_id: str
    timestamp: str
    source_node: str
    event_type: str
    severity: str
    title: str
    message: str
    icon: str


@router.get("/events")
async def get_recent_events(
    limit: int = 50,
    event_type: Optional[str] = None,
    severity: Optional[str] = None,
    source: Optional[str] = None
):
    """
    Get recent LCD events.
    
    Query params:
    - limit: Max events to return (default 50)
    - event_type: Filter by type (audio, system, etc)
    - severity: Filter by severity (info, warning, etc)
    - source: 'local', 'remote', or specific node ID
    """
    if not lcd_manager:
        raise HTTPException(status_code=503, detail="LCD Manager not initialized")
    
    persistence = get_lcd_persistence()
    if persistence:
        # Pull from database for full history
        filters = {}
        if event_type:
            filters["event_type"] = event_type
        if severity:
            filters["severity"] = severity

        if source == "local":
            filters["source_node"] = lcd_manager.node_label
            events = await persistence.get_recent_events(limit=limit, **filters)
        elif source == "remote":
            events = await persistence.get_recent_events(limit=limit, **filters)
            events = [e for e in events if e.get("source_node") != lcd_manager.node_label]
        else:
            events = await persistence.get_recent_events(limit=limit, **filters)
        
        return {
            "events": events,
            "total": len(events),
            "node_id": lcd_manager.node_id,
            "node_label": lcd_manager.node_label
        }
    
    # Fallback to in-memory events
    if source == "local":
        events = lcd_manager.get_recent_local_events(limit)
    elif source == "remote":
        events = lcd_manager.get_recent_remote_events(limit)
    else:
        events = lcd_manager.get_all_recent_events(limit)
    
    # Apply filters
    if event_type:
        events = [e for e in events if e.event_type.value == event_type]
    
    if severity:
        events = [e for e in events if e.severity.value == severity]
    
    # Convert to response format
    return {
        "events": [event.to_dict() for event in events],
        "total": len(events),
        "node_id": lcd_manager.node_id,
        "node_label": lcd_manager.node_label
    }


@router.post("/events")
async def create_event(request: EventCreateRequest):
    """
    Create and publish new LCD event.
    
    The event will be:
    1. Displayed on local LCD
    2. Broadcast to remote nodes (if broadcast=True)
    3. Stored in event history
    """
    if not lcd_manager:
        raise HTTPException(status_code=503, detail="LCD Manager not initialized")
    
    # Create event
    event = LCDEvent(
        event_id="",  # Will be auto-generated
        timestamp=datetime.now(),
        source_node=lcd_manager.node_label,
        event_type=request.event_type,
        severity=request.severity,
        title=request.title,
        message=request.message,
        icon=request.icon,
        broadcast=request.broadcast,
        color=request.color,
        sound=request.sound
    )
    
    # Publish
    await lcd_manager.publish_event(event)
    
    return {
        "success": True,
        "event_id": event.event_id,
        "message": "Event published"
    }


@router.get("/history")
async def get_event_history(
    node_id: Optional[str] = None,
    hours: int = 24
):
    """
    Get event history for a specific node or all nodes.
    
    Query params:
    - node_id: Specific node to get events from
    - hours: How many hours back to retrieve (default 24)
    """
    if not lcd_manager:
        raise HTTPException(status_code=503, detail="LCD Manager not initialized")
    
    persistence = get_lcd_persistence()
    if persistence:
        if node_id:
            events = await persistence.get_events_by_node(node_id, limit=100)
        else:
            events = await persistence.get_recent_events(limit=100, hours=hours)
        return {
            "events": events,
            "total": len(events),
            "hours": hours
        }
    
    # Fallback to in-memory history
    if node_id:
        events = lcd_manager.remote_aggregator.get_events_by_node(node_id, limit=100)
    else:
        events = lcd_manager.get_all_recent_events(limit=100)
    
    return {
        "events": [event.to_dict() for event in events],
        "total": len(events),
        "hours": hours
    }


@router.get("/stats")
async def get_event_stats():
    """Get event statistics"""
    if not lcd_manager:
        raise HTTPException(status_code=503, detail="LCD Manager not initialized")
    
    persistence = get_lcd_persistence()
    if persistence:
        stats = await persistence.get_statistics(hours=24)
        local_count = stats.get("by_node", {}).get(lcd_manager.node_label, 0)
        total_count = stats.get("total_events", 0)
        stats.update({
            "local_events": local_count,
            "remote_events": max(total_count - local_count, 0),
            "active_nodes": lcd_manager.remote_aggregator.get_active_nodes(),
            "connected_peers": lcd_manager.event_router.get_connected_peers()
        })
        return stats
    
    local_events = lcd_manager.get_recent_local_events(100)
    remote_events = lcd_manager.get_recent_remote_events(100)
    
    # Count by type
    type_counts = {}
    for event in local_events + remote_events:
        type_counts[event.event_type.value] = type_counts.get(event.event_type.value, 0) + 1
    
    # Count by severity
    severity_counts = {}
    for event in local_events + remote_events:
        severity_counts[event.severity.value] = severity_counts.get(event.severity.value, 0) + 1
    
    return {
        "local_events": len(local_events),
        "remote_events": len(remote_events),
        "total_events": len(local_events + remote_events),
        "by_type": type_counts,
        "by_severity": severity_counts,
        "active_nodes": lcd_manager.remote_aggregator.get_active_nodes(),
        "connected_peers": lcd_manager.event_router.get_connected_peers()
    }


@router.websocket("/ws/events")
async def websocket_events(websocket: WebSocket):
    """
    WebSocket endpoint for real-time LCD event stream.
    
    Sends all local and remote events as they arrive.
    """
    await websocket.accept()
    active_connections.append(websocket)
    
    logger.info(f"WebSocket client connected (total: {len(active_connections)})")
    
    try:
        # Subscribe to both local and remote events
        async def send_event(event: LCDEvent):
            if websocket in active_connections:
                try:
                    await websocket.send_json(event.to_dict())
                except Exception as e:
                    logger.error(f"Error sending event to WebSocket: {e}")
        
        # Subscribe
        if lcd_manager:
            lcd_manager.event_bus.subscribe(send_event)
            lcd_manager.remote_aggregator.subscribe(send_event)
        
        # Keep connection alive
        while True:
            # Receive messages (just to detect disconnects)
            data = await websocket.receive_text()
            
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    finally:
        if websocket in active_connections:
            active_connections.remove(websocket)
        
        # Unsubscribe
        if lcd_manager:
            lcd_manager.event_bus.unsubscribe(send_event)
            lcd_manager.remote_aggregator.unsubscribe(send_event)


@router.get("/health")
async def health_check():
    """Health check endpoint for monitoring."""
    metrics = get_health_metrics()
    health = metrics.get_health_status()
    status_code = 200 if health['status'] == 'healthy' else 503
    return health, status_code


@router.get("/status")
async def system_status():
    """Detailed system status and metrics."""
    if not lcd_manager:
        raise HTTPException(status_code=503, detail="LCD Manager not initialized")
    
    metrics = get_health_metrics()
    health = metrics.get_health_status()
    peer_count = len(lcd_manager.event_router.get_connected_peers())
    
    return {
        "system": {
            "deployment_mode": os.getenv("MAP2_DEPLOYMENT_MODE", "AUDIO-NODE"),
            "node_id": lcd_manager.node_id,
            "node_label": lcd_manager.node_label,
            "version": "2.0.0-FEB2025",
        },
        "uptime": {
            "seconds": int(health['uptime_seconds']),
            "human_readable": format_uptime(health['uptime_seconds'])
        },
        "components": health['components'],
        "performance": {
            "events_processed": health['events_processed'],
            "events_per_sec": health['events_per_sec'],
            "latency_ms": health['latency'],
            "queue_depth": lcd_manager.display_queue.qsize(),
        },
        "resources": {
            "memory": health['memory'],
            "cpu": health['cpu'],
            "disk": health['disk'],
        },
        "cluster": {
            "connected_peers": peer_count,
            "discovered_peers": len(lcd_manager.mdns_discovery.discovered_peers) 
                                if lcd_manager.mdns_discovery else 0,
        },
        "timestamp": health['timestamp'],
    }


@router.get("/metrics")
async def prometheus_metrics():
    """Prometheus metrics endpoint for Grafana."""
    if not lcd_manager:
        raise HTTPException(status_code=503, detail="LCD Manager not initialized")
    
    metrics = get_health_metrics()
    health = metrics.get_health_status()
    
    lines = [
        "# HELP lcd_events_total Total LCD events processed",
        "# TYPE lcd_events_total counter",
        f"lcd_events_total{{node_id=\"{lcd_manager.node_id}\"}} {health['events_processed']}",
        "",
        "# HELP lcd_events_per_second Current event rate",
        "# TYPE lcd_events_per_second gauge",
        f"lcd_events_per_second{{node_id=\"{lcd_manager.node_id}\"}} {health['events_per_sec']}",
        "",
        "# HELP lcd_latency_ms Event processing latency",
        "# TYPE lcd_latency_ms histogram",
        f"lcd_latency_min_ms{{node_id=\"{lcd_manager.node_id}\"}} {health['latency']['min_ms']}",
        f"lcd_latency_mean_ms{{node_id=\"{lcd_manager.node_id}\"}} {health['latency']['mean_ms']}",
        f"lcd_latency_max_ms{{node_id=\"{lcd_manager.node_id}\"}} {health['latency']['max_ms']}",
        f"lcd_latency_p95_ms{{node_id=\"{lcd_manager.node_id}\"}} {health['latency'].get('p95_ms', 0)}",
        "",
        "# HELP lcd_uptime_seconds System uptime",
        "# TYPE lcd_uptime_seconds counter",
        f"lcd_uptime_seconds{{node_id=\"{lcd_manager.node_id}\"}} {int(health['uptime_seconds'])}",
        "",
        "# HELP lcd_queue_depth Display queue depth",
        "# TYPE lcd_queue_depth gauge",
        f"lcd_queue_depth{{node_id=\"{lcd_manager.node_id}\"}} {lcd_manager.display_queue.qsize()}",
        "",
        "# HELP lcd_memory_rss_bytes Process RSS memory",
        "# TYPE lcd_memory_rss_bytes gauge",
        f"lcd_memory_rss_bytes{{node_id=\"{lcd_manager.node_id}\"}} {int(health['memory']['process_rss_mb'] * 1024 * 1024)}",
        "",
        "# HELP lcd_cpu_percent CPU usage percentage",
        "# TYPE lcd_cpu_percent gauge",
        f"lcd_cpu_percent{{node_id=\"{lcd_manager.node_id}\"}} {health['cpu']['process_percent']}",
        "",
        "# HELP lcd_connected_peers Number of connected peer nodes",
        "# TYPE lcd_connected_peers gauge",
        f"lcd_connected_peers{{node_id=\"{lcd_manager.node_id}\"}} {len(lcd_manager.event_router.get_connected_peers())}",
    ]
    
    metrics_text = "\n".join(lines)
    return Response(content=metrics_text, media_type="text/plain; charset=utf-8")


def format_uptime(seconds: float) -> str:
    """Format uptime in human-readable form."""
    d = int(seconds // 86400)
    h = int((seconds % 86400) // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    
    if d > 0:
        return f"{d}d {h}h {m}m"
    elif h > 0:
        return f"{h}h {m}m {s}s"
    else:
        return f"{m}m {s}s"


def init_lcd_routes(manager):
    """Initialize routes with LCD manager instance"""
    global lcd_manager
    lcd_manager = manager
    logger.info("LCD routes initialized")

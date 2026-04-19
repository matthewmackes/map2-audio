"""
LCD Events API Routes

Legacy `/api/lcd/*` routes now project the canonical PlatformEvent stream onto
the LCD API shape until the public LCD event surface is removed.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from pydantic import BaseModel

from app.lcd_models.lcd_event import EventSeverity, EventType
from app.services.platform_event.factories import make_lcd_surface_event
from app.services.platform_event.severity import Severity
from app.utils.health_metrics import get_health_metrics
from app.utils.platform_version import get_platform_version

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lcd", tags=["LCD Events"])

# Global LCD manager (injected by main app)
lcd_manager = None

# Active WebSocket connections
active_connections: List[WebSocket] = []


class EventCreateRequest(BaseModel):
    """Request to create a projected LCD event."""

    title: str
    message: str
    event_type: EventType = EventType.USER
    severity: EventSeverity = EventSeverity.INFO
    icon: str = "•"
    broadcast: bool = True
    color: str = "white"
    sound: bool = False


class EventResponse(BaseModel):
    """LCD event response."""

    event_id: str
    timestamp: str
    source_node: str
    event_type: str
    severity: str
    title: str
    message: str
    icon: str


def _require_lcd_manager():
    if not lcd_manager:
        raise HTTPException(status_code=503, detail="LCD Manager not initialized")
    return lcd_manager


def _severity_from_lcd(value: EventSeverity) -> Severity:
    return (
        Severity.CRITICAL
        if value == EventSeverity.CRITICAL
        else Severity.ERROR
        if value == EventSeverity.ERROR
        else Severity.WARNING
        if value == EventSeverity.WARNING
        else Severity.INFO
    )


@router.get("/events")
async def get_recent_events(
    limit: int = 50,
    event_type: Optional[str] = None,
    severity: Optional[str] = None,
    source: Optional[str] = None,
):
    """
    Get recent LCD-projected events.

    Query params:
    - limit: Max events to return (default 50)
    - event_type: Filter by LCD event type (audio, system, etc)
    - severity: Filter by severity (info, warning, etc)
    - source: 'local', 'remote', or omitted for all
    """
    manager = _require_lcd_manager()

    if source == "local":
        events = manager.get_recent_local_events(limit, event_type=event_type, severity=severity)
    elif source == "remote":
        events = manager.get_recent_remote_events(limit, event_type=event_type, severity=severity)
    else:
        events = manager.get_all_recent_events(limit, event_type=event_type, severity=severity)

    return {
        "events": [event.to_dict() for event in events],
        "total": len(events),
        "node_id": manager.node_id,
        "node_label": manager.node_label,
    }


@router.post("/events")
async def create_event(request: EventCreateRequest):
    """
    Create and publish a canonical PlatformEvent targeted at the LCD surface.
    """
    manager = _require_lcd_manager()
    event = make_lcd_surface_event(
        event_type=request.event_type.value,
        severity=_severity_from_lcd(request.severity),
        source_node=manager.node_label,
        source_service="lcd_api",
        title=request.title,
        message=request.message,
        icon=request.icon,
        color=request.color,
        sound=request.sound,
        broadcast=request.broadcast,
        dismiss_auto=request.severity not in {EventSeverity.ERROR, EventSeverity.CRITICAL},
    )

    await manager.publish_event(event)
    return {
        "success": True,
        "event_id": event.event_id,
        "message": "Event published",
    }


@router.get("/history")
async def get_event_history(
    node_id: Optional[str] = None,
    hours: int = 24,
):
    """Get LCD-projected event history for a node or for the full local store."""
    manager = _require_lcd_manager()
    if node_id:
        events = manager.get_events_by_node(node_id, limit=100, hours=hours)
    else:
        events = manager.get_all_recent_events(limit=100, hours=hours)

    return {
        "events": [event.to_dict() for event in events],
        "total": len(events),
        "hours": hours,
    }


@router.get("/stats")
async def get_event_stats():
    """Get projected LCD event statistics from the canonical store."""
    manager = _require_lcd_manager()
    events = manager.get_all_recent_events(limit=500, hours=24)
    local_events = [event for event in events if event.source_node == manager.node_label]
    remote_events = [event for event in events if event.source_node != manager.node_label]

    type_counts: dict[str, int] = {}
    severity_counts: dict[str, int] = {}
    for event in events:
        type_counts[event.event_type.value] = type_counts.get(event.event_type.value, 0) + 1
        severity_counts[event.severity.value] = severity_counts.get(event.severity.value, 0) + 1

    return {
        "local_events": len(local_events),
        "remote_events": len(remote_events),
        "total_events": len(events),
        "by_type": type_counts,
        "by_severity": severity_counts,
        "active_nodes": manager.get_active_nodes(hours=24),
        "connected_peers": manager.get_connected_peers(),
    }


@router.websocket("/ws/events")
async def websocket_events(websocket: WebSocket):
    """
    WebSocket endpoint for the live LCD-projected event stream.
    """
    await websocket.accept()
    active_connections.append(websocket)
    logger.info("LCD WebSocket client connected (total: %s)", len(active_connections))

    manager = _require_lcd_manager()
    subscription = None

    try:
        async def send_event(event) -> None:
            if websocket in active_connections:
                await websocket.send_json(event.to_dict())

        subscription = await manager.subscribe_live(send_event)

        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        logger.info("LCD WebSocket client disconnected")
    finally:
        if websocket in active_connections:
            active_connections.remove(websocket)
        if subscription is not None:
            subscription.close()


@router.get("/health")
async def health_check():
    """Health check endpoint for monitoring."""
    metrics = get_health_metrics()
    health = metrics.get_health_status()
    status_code = 200 if health["status"] == "healthy" else 503
    return health, status_code


@router.get("/system-status")
async def system_status():
    """Detailed system status and metrics."""
    manager = _require_lcd_manager()
    metrics = get_health_metrics()
    health = metrics.get_health_status()
    connection_stats = manager.get_connection_stats()

    return {
        "system": {
            "deployment_mode": os.getenv("MAP2_DEPLOYMENT_MODE", "AUDIO-NODE"),
            "node_id": manager.node_id,
            "node_label": manager.node_label,
            "version": get_platform_version(),
        },
        "uptime": {
            "seconds": int(health["uptime_seconds"]),
            "human_readable": format_uptime(health["uptime_seconds"]),
        },
        "components": health["components"],
        "performance": {
            "events_processed": health["events_processed"],
            "events_per_sec": health["events_per_sec"],
            "latency_ms": health["latency"],
            "queue_depth": manager.display_queue.qsize(),
        },
        "resources": {
            "memory": health["memory"],
            "cpu": health["cpu"],
            "disk": health["disk"],
        },
        "cluster": {
            "connected_peers": len(manager.get_connected_peers()),
            "discovered_peers": len(manager.mdns_discovery.discovered_peers) if manager.mdns_discovery else 0,
            "connection_stats": connection_stats,
        },
        "timestamp": health["timestamp"],
    }


@router.get("/peers")
async def peer_status() -> Dict[str, Any]:
    """Return discovered peers and connection stats for cluster UI."""
    manager = _require_lcd_manager()
    discovery_enabled = manager.mdns_discovery is not None
    discovered = manager.mdns_discovery.get_discovered_peers() if discovery_enabled else {}
    discovered_list = [{"node_id": node_id, **info} for node_id, info in discovered.items()]

    return {
        "system": {
            "deployment_mode": os.getenv("MAP2_DEPLOYMENT_MODE", "AUDIO-NODE"),
            "node_id": manager.node_id,
            "node_label": manager.node_label,
        },
        "discovery": {
            "enabled": discovery_enabled,
            "discovered_peers": discovered_list,
        },
        "connections": manager.get_connection_stats(),
    }


@router.get("/metrics")
async def prometheus_metrics():
    """Prometheus metrics endpoint for Grafana."""
    manager = _require_lcd_manager()
    metrics = get_health_metrics()
    health = metrics.get_health_status()

    lines = [
        "# HELP lcd_events_total Total LCD events processed",
        "# TYPE lcd_events_total counter",
        f'lcd_events_total{{node_id="{manager.node_id}"}} {health["events_processed"]}',
        "",
        "# HELP lcd_events_per_second Current event rate",
        "# TYPE lcd_events_per_second gauge",
        f'lcd_events_per_second{{node_id="{manager.node_id}"}} {health["events_per_sec"]}',
        "",
        "# HELP lcd_latency_ms Event processing latency",
        "# TYPE lcd_latency_ms histogram",
        f'lcd_latency_min_ms{{node_id="{manager.node_id}"}} {health["latency"]["min_ms"]}',
        f'lcd_latency_mean_ms{{node_id="{manager.node_id}"}} {health["latency"]["mean_ms"]}',
        f'lcd_latency_max_ms{{node_id="{manager.node_id}"}} {health["latency"]["max_ms"]}',
        f'lcd_latency_p95_ms{{node_id="{manager.node_id}"}} {health["latency"].get("p95_ms", 0)}',
        "",
        "# HELP lcd_uptime_seconds System uptime",
        "# TYPE lcd_uptime_seconds counter",
        f'lcd_uptime_seconds{{node_id="{manager.node_id}"}} {int(health["uptime_seconds"])}',
        "",
        "# HELP lcd_queue_depth Display queue depth",
        "# TYPE lcd_queue_depth gauge",
        f'lcd_queue_depth{{node_id="{manager.node_id}"}} {manager.display_queue.qsize()}',
        "",
        "# HELP lcd_memory_rss_bytes Process RSS memory",
        "# TYPE lcd_memory_rss_bytes gauge",
        f'lcd_memory_rss_bytes{{node_id="{manager.node_id}"}} {int(health["memory"]["process_rss_mb"] * 1024 * 1024)}',
        "",
        "# HELP lcd_cpu_percent CPU usage percentage",
        "# TYPE lcd_cpu_percent gauge",
        f'lcd_cpu_percent{{node_id="{manager.node_id}"}} {health["cpu"]["process_percent"]}',
        "",
        "# HELP lcd_connected_peers Number of connected peer nodes",
        "# TYPE lcd_connected_peers gauge",
        f'lcd_connected_peers{{node_id="{manager.node_id}"}} {len(manager.get_connected_peers())}',
        "",
        "# HELP lcd_rate_limit_violations_total Total rate limit violations",
        "# TYPE lcd_rate_limit_violations_total counter",
        f'lcd_rate_limit_violations_total{{node_id="{manager.node_id}"}} {health["rate_limits"]["total_violations"]}',
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
    if h > 0:
        return f"{h}h {m}m {s}s"
    return f"{m}m {s}s"


def init_lcd_routes(manager):
    """Initialize routes with LCD manager instance."""
    global lcd_manager
    lcd_manager = manager
    logger.info("LCD routes initialized")

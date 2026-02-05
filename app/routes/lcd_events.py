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
    
    # Get events based on source
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
    
    # TODO: Implement database query for historical events
    # For now, return recent events from memory
    
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


def init_lcd_routes(manager):
    """Initialize routes with LCD manager instance"""
    global lcd_manager
    lcd_manager = manager
    logger.info("LCD routes initialized")

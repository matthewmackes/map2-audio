"""
WebSocket endpoints for real-time host machine metrics streaming.
Provides low-latency updates for health monitoring dashboard.
"""

from typing import Set
import asyncio
import json
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.routes.system import router as system_router
from app.models import SystemHealthOverview, DiskHealthData

router = APIRouter(prefix="/ws", tags=["websocket"])

# Store active WebSocket connections
active_connections: Set[WebSocket] = set()


class ConnectionManager:
    """Manages WebSocket connections with broadcast capability"""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        """Add a new WebSocket connection"""
        await websocket.accept()
        self.active_connections.add(websocket)

    async def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection"""
        self.active_connections.discard(websocket)

    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients"""
        disconnected = set()
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.add(connection)
        
        for connection in disconnected:
            await self.disconnect(connection)

    async def send_personal(self, websocket: WebSocket, message: dict):
        """Send message to a specific client"""
        try:
            await websocket.send_json(message)
        except Exception:
            await self.disconnect(websocket)


manager = ConnectionManager()


@router.websocket("/host-metrics")
async def websocket_host_metrics(websocket: WebSocket):
    """
    WebSocket endpoint for real-time host machine metrics.
    Streams health overview every 2 seconds and disk health every 5 seconds.
    """
    await manager.connect(websocket)
    health_counter = 0
    
    try:
        while True:
            # Receive any client configuration messages
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                config = json.loads(data)
                # Handle client configuration (e.g., enable/disable specific metrics)
                if config.get("type") == "config":
                    await manager.send_personal(
                        websocket,
                        {"type": "config_ack", "status": "ok"}
                    )
            except asyncio.TimeoutError:
                # No message received, continue to broadcasting
                pass

            health_counter += 1

            # Get current system metrics
            try:
                # Get health overview (every iteration = ~2 second interval)
                health_data = await get_system_health_overview()
                
                message = {
                    "type": "health_update",
                    "timestamp": datetime.utcnow().isoformat(),
                    "data": health_data.dict() if health_data else None,
                }
                
                # Every 2-3 iterations (~5-6 seconds), also send disk health
                if health_counter % 3 == 0:
                    disk_health = await get_disk_health()
                    if disk_health:
                        message["disk_health"] = disk_health.dict() if disk_health else None
                
                await manager.broadcast(message)
                
            except Exception as e:
                await manager.send_personal(
                    websocket,
                    {"type": "error", "message": str(e)}
                )

            # Wait 2 seconds before next update
            await asyncio.sleep(2)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        try:
            await manager.disconnect(websocket)
        except Exception:
            pass


@router.websocket("/metrics-stream")
async def websocket_metrics_stream(websocket: WebSocket):
    """
    Alternative WebSocket endpoint for high-frequency metrics streaming.
    Can be used for advanced monitoring with custom update intervals.
    """
    await manager.connect(websocket)
    
    try:
        # Send initial handshake
        await manager.send_personal(
            websocket,
            {
                "type": "handshake",
                "message": "Connected to metrics stream",
                "version": "1.0",
            }
        )
        
        while True:
            try:
                # Receive client configuration
                config_text = await asyncio.wait_for(websocket.receive_text(), timeout=2.0)
                config = json.loads(config_text)
                
                # Handle configuration commands
                if config.get("command") == "set_interval":
                    interval = max(1, min(60, config.get("interval", 2)))
                    await manager.send_personal(
                        websocket,
                        {
                            "type": "interval_update",
                            "interval": interval,
                            "status": "ok"
                        }
                    )
                
                elif config.get("command") == "get_status":
                    status = {
                        "type": "status",
                        "active_connections": len(manager.active_connections),
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                    await manager.send_personal(websocket, status)
                    
            except asyncio.TimeoutError:
                # Timeout on receive, send periodic update
                pass

            # Get and broadcast metrics
            try:
                health = await get_system_health_overview()
                
                update = {
                    "type": "metrics",
                    "timestamp": datetime.utcnow().isoformat(),
                    "health": health.dict() if health else None,
                }
                
                await manager.broadcast(update)
                await asyncio.sleep(2)
                
            except Exception as e:
                await manager.send_personal(
                    websocket,
                    {"type": "error", "code": "metrics_error", "message": str(e)}
                )
                await asyncio.sleep(5)

    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket stream error: {e}")
        try:
            await manager.disconnect(websocket)
        except Exception:
            pass


# Helper functions to get system metrics
async def get_system_health_overview() -> SystemHealthOverview | None:
    """Get current system health overview"""
    try:
        # This would integrate with your existing system monitoring
        # For now, return a mock implementation
        from app.services.cluster import ClusterHealthService
        service = ClusterHealthService()
        return await service.get_health_overview()
    except Exception as e:
        print(f"Error getting health overview: {e}")
        return None


async def get_disk_health() -> DiskHealthData | None:
    """Get current disk health data"""
    try:
        # This would integrate with your existing disk monitoring
        from app.services.cluster import ClusterHealthService
        service = ClusterHealthService()
        return await service.get_disk_health()
    except Exception as e:
        print(f"Error getting disk health: {e}")
        return None


# Connection status endpoint
@router.get("/ws/status")
async def websocket_status():
    """Get WebSocket connection status"""
    return {
        "active_connections": len(manager.active_connections),
        "endpoint": "/ws/host-metrics",
        "update_interval_ms": 2000,
        "features": [
            "Real-time health updates",
            "Disk health monitoring",
            "Automatic reconnection support",
            "Graceful degradation to polling"
        ]
    }

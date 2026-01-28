"""
Real-Time WebSocket Routes
Ultra-low latency WebSocket endpoint for parameter control.

This endpoint provides <10ms latency for:
- UI knob/slider control
- MIDI parameter updates
- Automation (LFO, envelope) broadcasting
- Real-time metering
"""

import logging
import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Dict, Any

from app.services.realtime_parameter_bridge import rt_parameter_bridge

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/rt")
async def realtime_websocket_endpoint(
    websocket: WebSocket,
    binary: bool = Query(False, description="Use binary protocol for minimal latency")
):
    """
    Real-time WebSocket endpoint for ultra-low latency parameter control.

    This endpoint is optimized for <10ms round-trip latency and supports:
    - Bidirectional parameter updates
    - Binary protocol option for minimal parsing overhead
    - Subscription-based updates (only receive parameters you care about)
    - Update coalescing for network efficiency

    JSON Protocol Messages (client -> server):
    ```
    // Update a parameter
    {"action": "param_update", "plugin_uri": "...", "param_index": 0, "value": 0.5}

    // Batch update multiple parameters
    {"action": "param_batch", "updates": [
        {"plugin_uri": "...", "param_index": 0, "value": 0.5},
        {"plugin_uri": "...", "param_index": 1, "value": 0.8}
    ]}

    // Subscribe to parameter changes
    {"action": "subscribe", "plugin_uri": "...", "param_index": 0}

    // Subscribe to all params for a plugin
    {"action": "subscribe_all", "plugin_uri": "...", "param_count": 10}

    // Unsubscribe from parameter
    {"action": "unsubscribe", "plugin_uri": "...", "param_index": 0}

    // Get current cached value
    {"action": "get_value", "plugin_uri": "...", "param_index": 0}

    // Keepalive ping
    {"action": "ping"}
    ```

    JSON Protocol Messages (server -> client):
    ```
    // Welcome message
    {"type": "rt_welcome", "client_id": "...", "protocol": "json", ...}

    // Parameter update
    {"type": "param_update", "plugin_uri": "...", "param_index": 0, "value": 0.5, "source": "midi", "timestamp": ...}

    // Cached value response
    {"type": "value", "plugin_uri": "...", "param_index": 0, "value": 0.5}

    // Pong response
    {"type": "pong"}
    ```

    Binary Protocol (use ?binary=true query param):
    - Even lower latency with minimal parsing
    - Message format: [type:1][payload...]
    - See BinaryMessageType enum for message types
    """
    # Generate unique client ID
    client_id = str(uuid.uuid4())

    # Connect client
    await rt_parameter_bridge.connect_client(websocket, client_id, use_binary=binary)

    try:
        while True:
            if binary:
                # Binary protocol
                data = await websocket.receive_bytes()
                await rt_parameter_bridge.handle_message(client_id, data)
            else:
                # JSON protocol
                data = await websocket.receive_text()
                await rt_parameter_bridge.handle_message(client_id, data)

    except WebSocketDisconnect:
        rt_parameter_bridge.disconnect_client(client_id)
        logger.info(f"RT client {client_id} disconnected")

    except Exception as e:
        logger.error(f"RT WebSocket error for client {client_id}: {e}")
        rt_parameter_bridge.disconnect_client(client_id)


@router.get("/ws/rt/stats")
async def get_rt_stats() -> Dict[str, Any]:
    """
    Get real-time parameter bridge statistics.

    Returns:
        Statistics including latency, throughput, and connection info
    """
    return rt_parameter_bridge.get_stats()


@router.post("/ws/rt/cache/clear")
async def clear_param_cache() -> Dict[str, str]:
    """Clear the parameter value cache."""
    rt_parameter_bridge._param_cache.clear()
    return {"status": "cleared"}

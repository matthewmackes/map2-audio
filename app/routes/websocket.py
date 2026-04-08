"""
WebSocket Routes - Real-time communication endpoints
"""

import logging
import json
import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Any

from app.services.websocket_manager import ws_manager
from app.services.ws_federation import get_ws_federator

logger = logging.getLogger(__name__)
router = APIRouter()


async def _handle_websocket_connection(websocket: WebSocket, version: str = "1.0"):
    """
    Common WebSocket connection handler for all versions.

    Args:
        websocket: WebSocket connection
        version: Protocol version (e.g., "1.0")
    """
    # Generate unique client ID
    client_id = str(uuid.uuid4())
    run_id = (websocket.query_params.get("run_id") or websocket.headers.get("x-map2-run-id") or "").strip()
    client_label = (websocket.query_params.get("client_label") or "").strip()

    # Connect client
    await ws_manager.connect(
        websocket,
        client_id,
        metadata={
            "run_id": run_id,
            "client_label": client_label,
            "path": websocket.url.path,
            "request_id": client_id,
            "protocol_version": version,
            "client_ip": websocket.client.host if websocket.client else "unknown",
        },
    )

    # Send welcome message
    await ws_manager.send_personal_message(
        json.dumps({
            "type": "welcome",
            "data": {
                "client_id": client_id,
                "version": version,
                "server": "MAP2 Audio Platform",
                "message": "Connected to MAP2 Audio WebSocket",
                "supported_topics": [
                "meters",           # VU meter levels
                "automation",       # Parameter automation updates
                "chain_updates",    # Plugin chain changes
                "plugin_params",    # Plugin parameter changes
                "schema_changed",   # OpenAPI schema diff notifications
                "traffic_event",    # API observatory traffic capture events
                "midi_cluster",     # Cluster-wide MIDI events
                "midi_cluster_nodes",
                "midi_cluster_connections",
                "midi_cluster_clock",
                "drums",
                "drums:transport",
                "drums:position",
                "drums:metering",
                "brain:runtime",
                "avb:router:connection_state", # AVB per-route connection state updates
                "avb:router:endpoints", # AVB endpoint discovery snapshots
                "avb:router:connections", # AVB routing connection snapshots
                "avb:streams",     # AVB stream lifecycle snapshots
                "avb:ptp",         # AVB PTP transition snapshots
                "avb:avdecc",      # AVDECC entity online/offline snapshots
                "spectrum",         # FFT spectrum data (30fps)
                "lufs",             # LUFS loudness levels (10fps)
                "cpu",              # CPU metrics (2fps)
                    "phase",            # Stereo phase correlation
                    "latency",          # Latency updates
                    "timing_jitter",    # Callback jitter updates (10fps)
                    "pipewire",         # PipeWire audio server metrics (2fps)
                    "node:{node_id}/<topic>",  # Federated node-prefixed topics
                    "all/<topic>"       # Broadcast subscription to all nodes
                ],
                "supported_actions": ["subscribe", "unsubscribe", "ping", "get"]
            }
        }),
        client_id
    )
    
    try:
        while True:
            # Wait for messages from client
            data = await websocket.receive_text()

            try:
                message = json.loads(data)
                action = message.get("action")

                if action == "subscribe":
                    topic = message.get("topic")
                    if topic:
                        # Federated topics: node:{id}/topic or all/topic
                        try:
                            federator = get_ws_federator()
                            if topic.startswith("node:") and "/" in topic:
                                node_id, rest = topic.split("/", 1)
                                node_id = node_id.replace("node:", "", 1)
                                await federator.subscribe_remote(node_id, rest)
                            elif topic.startswith("all/"):
                                rest = topic.split("/", 1)[1]
                                await federator.subscribe_all(rest)
                        except Exception as exc:
                            logger.warning(f"Federation subscribe failed for {topic}: {exc}")

                        await ws_manager.subscribe(client_id, topic)
                        await ws_manager.send_personal_message(
                            json.dumps({
                                "type": "subscribed",
                                "topic": topic
                            }),
                            client_id
                        )
                        logger.info(f"Client {client_id} subscribed to {topic}")

                elif action == "unsubscribe":
                    topic = message.get("topic")
                    if topic:
                        try:
                            federator = get_ws_federator()
                            if topic.startswith("node:") and "/" in topic:
                                node_id, rest = topic.split("/", 1)
                                node_id = node_id.replace("node:", "", 1)
                                await federator.unsubscribe_remote(node_id, rest)
                            elif topic.startswith("all/"):
                                rest = topic.split("/", 1)[1]
                                # nothing to do for all at unsubscribe aside from local removal
                        except Exception as exc:
                            logger.warning(f"Federation unsubscribe failed for {topic}: {exc}")

                        await ws_manager.unsubscribe(client_id, topic)
                        await ws_manager.send_personal_message(
                            json.dumps({
                                "type": "unsubscribed",
                                "topic": topic
                            }),
                            client_id
                        )
                        logger.info(f"Client {client_id} unsubscribed from {topic}")

                elif action == "ping":
                    # Respond to ping with pong
                    await ws_manager.send_personal_message(
                        json.dumps({"type": "pong"}),
                        client_id
                    )

                elif action == "get":
                    # Handle on-demand state queries
                    request_id = message.get("request_id")
                    params = message.get("params", {})
                    resource = params.get("resource")

                    response = {
                        "type": "response",
                        "request_id": request_id,
                        "data": {}
                    }

                    # Resource queries can be extended here
                    if resource == "stats":
                        response["data"] = ws_manager.get_stats()
                    elif resource == "history":
                        topic = params.get("topic")
                        response["data"] = ws_manager.get_event_history(topic)
                    else:
                        response["error"] = f"Unknown resource: {resource}"

                    await ws_manager.send_personal_message(
                        json.dumps(response),
                        client_id
                    )

                else:
                    logger.warning(f"Unknown action from client {client_id}: {action}")
                    await ws_manager.send_personal_message(
                        json.dumps({
                            "type": "error",
                            "message": f"Unknown action: {action}"
                        }),
                        client_id
                    )

            except json.JSONDecodeError:
                logger.error(f"Invalid JSON from client {client_id}: {data}")
                await ws_manager.send_personal_message(
                    json.dumps({
                        "type": "error",
                        "message": "Invalid JSON format"
                    }),
                    client_id
                )

    except WebSocketDisconnect:
        await ws_manager.disconnect(client_id, reason="disconnect")
        logger.info(f"Client {client_id} disconnected")

    except Exception as e:
        logger.error(f"WebSocket error for client {client_id}: {e}")
        await ws_manager.disconnect(client_id, reason="disconnect_error", error=str(e))


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Main WebSocket endpoint for real-time updates (latest version)

    Protocol:
    - Client connects and receives a welcome message
    - Client can send subscription requests: {"action": "subscribe", "topic": "meters"}
    - Server broadcasts updates to subscribed topics
    - Supported topics: "meters", "automation", "chain_updates", "plugin_params", "plugin_outputs"

    Message Format (from client):
    {
        "action": "subscribe" | "unsubscribe" | "ping" | "get",
        "topic": "meters" | "automation" | "chain_updates" | "plugin_params" | "plugin_outputs",
        "request_id": "optional-id-for-get-action",
        "params": {"resource": "stats|history", "topic": "..."}
    }

    Message Format (from server):
    {
        "type": "meter_update" | "automation_update" | "chain_update" | "param_update" | 
               "peak_update" | "output_port_update" | "tuner_update" | "spectrum_update",
        "data": {...},
        "timestamp": "ISO 8601 timestamp"
    }
    """
    await _handle_websocket_connection(websocket, version="1.0")


@router.websocket("/ws/v1")
async def websocket_endpoint_v1(websocket: WebSocket):
    """
    WebSocket endpoint v1 - MAP2 Native Protocol

    Enhanced protocol with:
    - Event-driven updates
    - On-demand state queries via 'get' action
    - Event history retrieval
    - Improved error handling
    """
    await _handle_websocket_connection(websocket, version="1.0")


@router.websocket("/ws/events")
async def websocket_events(websocket: WebSocket):
    """
    General-purpose event stream endpoint.

    Used by cluster sync (special settings updates) and other
    event-driven features. Same protocol as /ws/v1.
    """
    await _handle_websocket_connection(websocket, version="1.0")


@router.websocket("/ws/system/metrics")
async def system_metrics_stream(websocket: WebSocket):
    """
    Real-time system metrics WebSocket stream
    
    Streams health and performance data:
    - Health overview every 2 seconds
    - Disk health every 5 seconds
    - Heartbeat every 30 seconds
    
    Message Format (from server):
    {
        "type": "health-overview" | "disk-health" | "heartbeat",
        "data": {...system metrics...},
        "timestamp": Unix timestamp
    }
    """
    import asyncio
    import time
    from app.routes.system import (
        get_health_overview as get_system_health,
        get_disk_health
    )
    
    client_id = str(uuid.uuid4())
    await websocket.accept()
    
    logger.info(f"System metrics client connected: {client_id}")
    
    try:
        last_health_send = 0
        last_disk_send = 0
        last_heartbeat = 0
        
        while True:
            try:
                # Check for client messages (ping) with timeout
                try:
                    message_data = await asyncio.wait_for(
                        websocket.receive_text(),
                        timeout=1.0
                    )
                    
                    try:
                        message = json.loads(message_data)
                        
                        if message.get('type') == 'ping':
                            # Respond to ping
                            await websocket.send_json({
                                'type': 'pong',
                                'timestamp': time.time()
                            })
                    except json.JSONDecodeError:
                        pass
                except asyncio.TimeoutError:
                    pass  # Expected, continue loop
                
                current_time = time.time()
                
                # Send health overview every 2 seconds
                if current_time - last_health_send >= 2:
                    try:
                        health_data = await get_system_health()
                        
                        await websocket.send_json({
                            'type': 'health-overview',
                            'data': health_data,
                            'timestamp': current_time
                        })
                        
                        last_health_send = current_time
                    except Exception as e:
                        logger.error(f"Error sending health data: {e}")
                
                # Send disk health every 5 seconds
                if current_time - last_disk_send >= 5:
                    try:
                        disk_data = await get_disk_health()
                        
                        await websocket.send_json({
                            'type': 'disk-health',
                            'data': disk_data,
                            'timestamp': current_time
                        })
                        
                        last_disk_send = current_time
                    except Exception as e:
                        logger.error(f"Error sending disk data: {e}")
                
                # Send heartbeat every 30 seconds
                if current_time - last_heartbeat >= 30:
                    try:
                        await websocket.send_json({
                            'type': 'heartbeat',
                            'timestamp': current_time,
                            'status': 'connected',
                            'connection_id': client_id
                        })
                        
                        last_heartbeat = current_time
                    except Exception as e:
                        logger.error(f"Error sending heartbeat: {e}")
                
                # Yield to event loop
                await asyncio.sleep(0.1)
            
            except WebSocketDisconnect:
                break
    
    except Exception as e:
        logger.error(f"System metrics WebSocket error for client {client_id}: {e}")
    finally:
        logger.info(f"System metrics client disconnected: {client_id}")


@router.get("/ws/stats")
async def get_websocket_stats() -> Dict[str, Any]:
    """
    Get WebSocket connection statistics
    
    Returns:
        Statistics about active connections and subscriptions
    """
    return ws_manager.get_stats()

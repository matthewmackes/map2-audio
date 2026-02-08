"""
WebSocket Routes - Real-time communication endpoints
"""

import logging
import json
import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Any

from app.services.websocket_manager import ws_manager

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

    # Connect client
    await ws_manager.connect(websocket, client_id)

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
                    "spectrum",         # FFT spectrum data (30fps)
                    "lufs",             # LUFS loudness levels (10fps)
                    "cpu",              # CPU metrics (2fps)
                    "phase",            # Stereo phase correlation
                    "latency",          # Latency updates
                    "pipewire"          # PipeWire audio server metrics (2fps)
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
        ws_manager.disconnect(client_id)
        logger.info(f"Client {client_id} disconnected")

    except Exception as e:
        logger.error(f"WebSocket error for client {client_id}: {e}")
        ws_manager.disconnect(client_id)


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


@router.get("/ws/stats")
async def get_websocket_stats() -> Dict[str, Any]:
    """
    Get WebSocket connection statistics
    
    Returns:
        Statistics about active connections and subscriptions
    """
    return ws_manager.get_stats()

"""
WebSocket Manager for Real-Time Cluster Updates
Handles WebSocket connections for real-time monitoring of cluster state.
"""

import asyncio
import logging
from typing import Optional, Callable, Dict, Any, List
from datetime import datetime
from enum import Enum

try:
    import websockets
    import json
except ImportError:
    websockets = None
    json = None

logger = logging.getLogger(__name__)


class WSMessageType(str, Enum):
    """WebSocket message types."""
    SUBSCRIBE = "subscribe"
    UNSUBSCRIBE = "unsubscribe"
    ASSIGNMENT_UPDATE = "assignment_update"
    NODE_STATUS_CHANGE = "node_status_change"
    METRICS_UPDATE = "metrics_update"
    EVENT = "event"
    ERROR = "error"
    PING = "ping"
    PONG = "pong"


class ClusterWebSocketManager:
    """
    Manages WebSocket connections for real-time cluster updates.
    
    Handles multiple WebSocket streams:
    - /ws/cluster/assignments - Flow assignment changes
    - /ws/cluster/nodes - Node status changes
    - /ws/cluster/metrics - Real-time metrics updates
    - /ws/cluster/events - Event stream
    """
    
    def __init__(self, base_url: str = "ws://localhost:8080"):
        """
        Initialize WebSocket manager.
        
        Args:
            base_url: Base WebSocket URL (e.g., ws://localhost:8080)
        """
        self.base_url = base_url.rstrip('/')
        self.websocket = None
        self.is_connected = False
        self.is_running = False
        
        # Subscriptions and callbacks
        self.subscriptions: Dict[str, List[Callable]] = {
            "assignments": [],
            "nodes": [],
            "metrics": [],
            "events": []
        }
        
        # Connection management
        self.reconnect_delay = 5  # seconds
        self.max_reconnect_attempts = 10
        self.ping_interval = 30  # seconds
        
        # Message queue
        self.message_queue: asyncio.Queue = asyncio.Queue()
    
    async def connect(self, channel: str = "cluster") -> bool:
        """
        Connect to WebSocket endpoint.
        
        Args:
            channel: Channel to connect to (default: cluster)
            
        Returns:
            True if connected, False otherwise
        """
        if not websockets:
            logger.error("websockets library not installed")
            return False
        
        url = f"{self.base_url}/ws/{channel}"
        
        try:
            self.websocket = await websockets.connect(url)
            self.is_connected = True
            logger.info(f"WebSocket connected: {url}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to WebSocket: {e}")
            self.is_connected = False
            return False
    
    async def disconnect(self):
        """Disconnect from WebSocket."""
        self.is_running = False
        if self.websocket:
            try:
                await self.websocket.close()
            except Exception as e:
                logger.error(f"Error closing WebSocket: {e}")
            finally:
                self.websocket = None
                self.is_connected = False
    
    async def subscribe(
        self,
        subscription_type: str,
        callback: Callable[[Dict[str, Any]], None]
    ):
        """
        Subscribe to updates of a given type.
        
        Args:
            subscription_type: Type to subscribe to (assignments, nodes, metrics, events)
            callback: Async function called with updates
        """
        if subscription_type not in self.subscriptions:
            logger.warning(f"Unknown subscription type: {subscription_type}")
            return
        
        self.subscriptions[subscription_type].append(callback)
        logger.debug(f"Subscribed to {subscription_type}")
        
        # Send subscription message
        if self.is_connected:
            await self._send_subscribe_message(subscription_type)
    
    async def unsubscribe(
        self,
        subscription_type: str,
        callback: Callable[[Dict[str, Any]], None]
    ):
        """
        Unsubscribe from updates.
        
        Args:
            subscription_type: Type to unsubscribe from
            callback: Callback to remove
        """
        if subscription_type in self.subscriptions:
            if callback in self.subscriptions[subscription_type]:
                self.subscriptions[subscription_type].remove(callback)
                logger.debug(f"Unsubscribed from {subscription_type}")
                
                # Send unsubscribe message
                if self.is_connected:
                    await self._send_unsubscribe_message(subscription_type)
    
    async def run(self):
        """
        Main WebSocket event loop.
        Maintains connection and processes messages.
        """
        if not websockets:
            logger.error("websockets library not installed")
            return
        
        self.is_running = True
        reconnect_attempts = 0
        
        while self.is_running:
            try:
                # Connect if not connected
                if not self.is_connected:
                    if reconnect_attempts >= self.max_reconnect_attempts:
                        logger.error("Max reconnection attempts reached")
                        break
                    
                    logger.info(f"Attempting to reconnect ({reconnect_attempts + 1}/{self.max_reconnect_attempts})")
                    if not await self.connect():
                        reconnect_attempts += 1
                        await asyncio.sleep(self.reconnect_delay)
                        continue
                    
                    reconnect_attempts = 0
                
                # Listen for messages
                try:
                    message = await asyncio.wait_for(
                        self.websocket.recv(),
                        timeout=self.ping_interval + 10
                    )
                    await self._handle_message(message)
                except asyncio.TimeoutError:
                    # Send ping to keep connection alive
                    await self._send_ping()
                
            except websockets.exceptions.ConnectionClosed:
                logger.warning("WebSocket connection closed")
                self.is_connected = False
            except Exception as e:
                logger.error(f"Error in WebSocket loop: {e}")
                self.is_connected = False
                await asyncio.sleep(self.reconnect_delay)
    
    async def _handle_message(self, message: str):
        """
        Handle incoming WebSocket message.
        
        Args:
            message: Raw message string
        """
        try:
            data = json.loads(message)
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON message: {message}")
            return
        
        message_type = data.get("type")
        payload = data.get("payload", {})
        
        # Route to appropriate handlers
        if message_type == WSMessageType.ASSIGNMENT_UPDATE:
            await self._notify_subscribers("assignments", payload)
        elif message_type == WSMessageType.NODE_STATUS_CHANGE:
            await self._notify_subscribers("nodes", payload)
        elif message_type == WSMessageType.METRICS_UPDATE:
            await self._notify_subscribers("metrics", payload)
        elif message_type == WSMessageType.EVENT:
            await self._notify_subscribers("events", payload)
        elif message_type == WSMessageType.PONG:
            logger.debug("Received pong")
        elif message_type == WSMessageType.ERROR:
            logger.error(f"Server error: {payload.get('message', 'Unknown error')}")
    
    async def _notify_subscribers(self, subscription_type: str, payload: Dict[str, Any]):
        """
        Notify all subscribers of a type with payload.
        
        Args:
            subscription_type: Type that was updated
            payload: Update data
        """
        callbacks = self.subscriptions.get(subscription_type, [])
        for callback in callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(payload)
                else:
                    callback(payload)
            except Exception as e:
                logger.error(f"Error in subscriber callback: {e}")
    
    async def _send_subscribe_message(self, subscription_type: str):
        """Send subscription message to server."""
        if not self.is_connected:
            return
        
        message = {
            "type": WSMessageType.SUBSCRIBE,
            "channel": subscription_type
        }
        
        try:
            await self.websocket.send(json.dumps(message))
            logger.debug(f"Sent subscription for {subscription_type}")
        except Exception as e:
            logger.error(f"Error sending subscribe message: {e}")
    
    async def _send_unsubscribe_message(self, subscription_type: str):
        """Send unsubscription message to server."""
        if not self.is_connected:
            return
        
        message = {
            "type": WSMessageType.UNSUBSCRIBE,
            "channel": subscription_type
        }
        
        try:
            await self.websocket.send(json.dumps(message))
            logger.debug(f"Sent unsubscription for {subscription_type}")
        except Exception as e:
            logger.error(f"Error sending unsubscribe message: {e}")
    
    async def _send_ping(self):
        """Send ping message to keep connection alive."""
        if not self.is_connected:
            return
        
        message = {
            "type": WSMessageType.PING,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        try:
            await self.websocket.send(json.dumps(message))
            logger.debug("Sent ping")
        except Exception as e:
            logger.error(f"Error sending ping: {e}")
            self.is_connected = False


# Singleton instance
_ws_manager: Optional[ClusterWebSocketManager] = None


async def get_ws_manager(base_url: str = "ws://localhost:8080") -> ClusterWebSocketManager:
    """Get or create WebSocket manager singleton."""
    global _ws_manager
    
    if _ws_manager is None:
        _ws_manager = ClusterWebSocketManager(base_url)
    
    return _ws_manager

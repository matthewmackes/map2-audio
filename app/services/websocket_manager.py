"""
WebSocket Manager - Real-time communication for MAP2 Audio
Handles WebSocket connections, message broadcasting, and subscription management

Fix #8: Added optional message compression for large payloads
"""

import asyncio
import json
import logging
import gzip
import base64
from collections import deque
from typing import Dict, Set, Any, Optional, List, Deque
from fastapi import WebSocket
from datetime import datetime

logger = logging.getLogger(__name__)

# Fix #8: Message size threshold for compression (1KB)
COMPRESSION_THRESHOLD = 1024


class WebSocketManager:
    """
    Manages WebSocket connections and broadcasts real-time updates
    
    Features:
    - Connection pooling
    - Topic-based subscriptions
    - Selective broadcasting
    - Connection lifecycle management
    - Fix #8: Optional gzip compression for large messages
    """
    
    def __init__(self, enable_compression: bool = True):
        # Active connections: client_id -> WebSocket
        self.active_connections: Dict[str, WebSocket] = {}

        # Subscriptions: topic -> set of client_ids
        self.subscriptions: Dict[str, Set[str]] = {}

        # Connection metadata
        self.connection_info: Dict[str, Dict[str, Any]] = {}

        # Event history: topic -> bounded deque of recent events
        self.event_history: Dict[str, Deque[Dict[str, Any]]] = {}
        self.history_limit = 10  # Keep last 10 events per topic

        # Lock for thread-safe operations
        self._lock = asyncio.Lock()
        
        # Fix #8: Compression settings
        self.enable_compression = enable_compression
        self.bytes_saved = 0  # Track compression savings
        
    async def connect(self, websocket: WebSocket, client_id: str) -> None:
        """
        Accept and register a new WebSocket connection
        
        Args:
            websocket: FastAPI WebSocket instance
            client_id: Unique identifier for this client
        """
        await websocket.accept()
        
        async with self._lock:
            self.active_connections[client_id] = websocket
            self.connection_info[client_id] = {
                "connected_at": datetime.now().isoformat(),
                "subscriptions": set()
            }
        
        logger.info(f"WebSocket client connected: {client_id}")
        
    def disconnect(self, client_id: str) -> None:
        """
        Remove a client connection and clean up subscriptions
        
        Args:
            client_id: Client to disconnect
        """
        # Remove from active connections
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        
        # Remove from all topic subscriptions
        for topic in list(self.subscriptions.keys()):
            if client_id in self.subscriptions[topic]:
                self.subscriptions[topic].discard(client_id)
                if not self.subscriptions[topic]:
                    del self.subscriptions[topic]
        
        # Remove metadata
        if client_id in self.connection_info:
            del self.connection_info[client_id]
        
        logger.info(f"WebSocket client disconnected: {client_id}")
        
    async def subscribe(self, client_id: str, topic: str) -> None:
        """
        Subscribe a client to a specific topic
        
        Args:
            client_id: Client to subscribe
            topic: Topic name (e.g., "meters", "automation", "chain_updates")
        """
        async with self._lock:
            if topic not in self.subscriptions:
                self.subscriptions[topic] = set()
            
            self.subscriptions[topic].add(client_id)
            
            if client_id in self.connection_info:
                self.connection_info[client_id]["subscriptions"].add(topic)
        
        logger.debug(f"Client {client_id} subscribed to topic: {topic}")
        
    async def unsubscribe(self, client_id: str, topic: str) -> None:
        """
        Unsubscribe a client from a topic
        
        Args:
            client_id: Client to unsubscribe
            topic: Topic name
        """
        async with self._lock:
            if topic in self.subscriptions:
                self.subscriptions[topic].discard(client_id)
                if not self.subscriptions[topic]:
                    del self.subscriptions[topic]
            
            if client_id in self.connection_info:
                self.connection_info[client_id]["subscriptions"].discard(topic)
        
        logger.debug(f"Client {client_id} unsubscribed from topic: {topic}")
        
    async def send_personal_message(self, message: str, client_id: str) -> None:
        """
        Send a message to a specific client
        
        Args:
            message: JSON string or plain text
            client_id: Target client
        """
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_text(message)
            except Exception as e:
                logger.error(f"Error sending message to {client_id}: {e}")
                self.disconnect(client_id)
                
    async def broadcast(self, message: str, topic: Optional[str] = None) -> None:
        """
        Broadcast a message to all clients or topic subscribers
        
        Args:
            message: JSON string or plain text
            topic: If specified, only send to subscribers of this topic
        """
        # Determine target clients from a snapshot to avoid mutation during send.
        if topic:
            target_clients = set(self.subscriptions.get(topic, set()))
        else:
            target_clients = set(self.active_connections.keys())

        send_client_ids: List[str] = []
        send_tasks = []
        for client_id in target_clients:
            websocket = self.active_connections.get(client_id)
            if websocket is None:
                continue
            send_client_ids.append(client_id)
            send_tasks.append(websocket.send_text(message))

        if not send_tasks:
            return

        send_results = await asyncio.gather(*send_tasks, return_exceptions=True)
        disconnected_clients = []
        for client_id, result in zip(send_client_ids, send_results):
            if isinstance(result, Exception):
                logger.error(f"Error broadcasting to {client_id}: {result}")
                disconnected_clients.append(client_id)

        # Clean up disconnected clients
        for client_id in disconnected_clients:
            self.disconnect(client_id)
            
    async def broadcast_json(self, data: Dict[str, Any], topic: Optional[str] = None) -> None:
        """
        Broadcast a JSON message with optional compression

        Fix #8: Messages larger than COMPRESSION_THRESHOLD are gzip compressed
        
        Args:
            data: Dictionary to serialize as JSON
            topic: Optional topic filter
        """
        # Store in event history if topic is specified
        if topic:
            history = self.event_history.get(topic)
            if history is None:
                history = deque(maxlen=self.history_limit)
                self.event_history[topic] = history
            history.append(data)

        message = json.dumps(data)
        
        # Fix #8: Compress large messages
        if self.enable_compression and len(message) > COMPRESSION_THRESHOLD:
            compressed = gzip.compress(message.encode('utf-8'))
            # Only use compression if it actually reduces size
            if len(compressed) < len(message):
                self.bytes_saved += len(message) - len(compressed)
                # Send as base64-encoded compressed data with header
                message = json.dumps({
                    "_compressed": True,
                    "_encoding": "gzip+base64",
                    "data": base64.b64encode(compressed).decode('ascii')
                })
        
        await self.broadcast(message, topic)
        
    def get_subscribers(self, topic: str) -> List[str]:
        """
        Get list of client IDs subscribed to a topic
        
        Args:
            topic: Topic name
            
        Returns:
            List of client IDs
        """
        return list(self.subscriptions.get(topic, set()))
        
    def get_connection_count(self) -> int:
        """Get number of active connections"""
        return len(self.active_connections)
        
    def get_event_history(self, topic: Optional[str] = None) -> Dict[str, Any]:
        """
        Get recent event history

        Args:
            topic: If specified, get history for this topic only

        Returns:
            Dictionary with event history
        """
        if topic:
            return {
                "topic": topic,
                "events": list(self.event_history.get(topic, []))
            }
        else:
            return {
                "all_topics": {
                    topic: list(events)
                    for topic, events in self.event_history.items()
                }
            }

    def get_stats(self) -> Dict[str, Any]:
        """
        Get WebSocket statistics

        Returns:
            Dictionary with connection and subscription stats
        """
        return {
            "active_connections": len(self.active_connections),
            "topics": list(self.subscriptions.keys()),
            "subscriptions_per_topic": {
                topic: len(clients)
                for topic, clients in self.subscriptions.items()
            },
            # Fix #8: Include compression stats
            "compression_enabled": self.enable_compression,
            "bytes_saved_by_compression": self.bytes_saved
        }


# Global WebSocket manager instance
ws_manager = WebSocketManager()

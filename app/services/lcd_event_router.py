"""
LCD Event Router

Routes events between nodes via WebSocket. Handles:
- Broadcasting events to all peer nodes
- Receiving events from remote nodes
- Managing peer connections
- Event deduplication
"""

import asyncio
import logging
import json
from typing import Dict, Set, Callable
import aiohttp

from app.models.lcd_event import LCDEvent

logger = logging.getLogger(__name__)


class LCDEventRouter:
    """
    Routes LCD events between nodes in the cluster.
    
    Uses WebSocket connections to broadcast events to peer nodes
    and receive events from them.
    """
    
    def __init__(self, node_id: str, node_label: str):
        self.node_id = node_id
        self.node_label = node_label
        
        # Peer connections: {node_id: websocket}
        self.peer_connections: Dict[str, aiohttp.ClientWebSocketResponse] = {}
        
        # Event IDs we've already seen (prevent duplicates)
        self.seen_event_ids: Set[str] = set()
        
        # Remote event handler (set by aggregator)
        self.remote_event_handler: Callable = None
        
        # Background tasks
        self._connection_tasks: Dict[str, asyncio.Task] = {}
        
    async def start(self):
        """Start router"""
        logger.info(f"Starting LCD Event Router for {self.node_label}")
    
    async def stop(self):
        """Stop router and close all connections"""
        logger.info(f"Stopping LCD Event Router for {self.node_label}")
        
        # Cancel connection tasks
        for task in self._connection_tasks.values():
            task.cancel()
        
        # Close peer connections
        for ws in self.peer_connections.values():
            await ws.close()
        
        self.peer_connections.clear()
        self._connection_tasks.clear()
    
    async def connect_to_peer(self, node_id: str, node_url: str):
        """
        Establish WebSocket connection to a peer node.
        
        Args:
            node_id: Unique ID of peer node
            node_url: WebSocket URL (ws://ip:port/ws/lcd-events)
        """
        if node_id in self.peer_connections:
            logger.debug(f"Already connected to {node_id}")
            return
        
        # Start connection task
        task = asyncio.create_task(self._maintain_peer_connection(node_id, node_url))
        self._connection_tasks[node_id] = task
        
        logger.info(f"Connecting to peer {node_id} at {node_url}")
    
    async def _maintain_peer_connection(self, node_id: str, node_url: str):
        """Maintain WebSocket connection to peer (with reconnect)"""
        while True:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.ws_connect(node_url) as ws:
                        self.peer_connections[node_id] = ws
                        logger.info(f"Connected to peer {node_id}")
                        
                        # Receive events from peer
                        async for msg in ws:
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                await self._handle_remote_event(msg.data)
                            elif msg.type == aiohttp.WSMsgType.ERROR:
                                logger.error(f"WebSocket error from {node_id}")
                                break
                                
            except Exception as e:
                logger.error(f"Connection error to {node_id}: {e}")
                
            finally:
                if node_id in self.peer_connections:
                    del self.peer_connections[node_id]
            
            # Wait before reconnecting
            await asyncio.sleep(5)
    
    async def _handle_remote_event(self, data: str):
        """Process event received from remote node"""
        try:
            event_dict = json.loads(data)
            event = LCDEvent.from_dict(event_dict)
            
            # Deduplicate
            if event.event_id in self.seen_event_ids:
                logger.debug(f"Duplicate event ignored: {event.event_id}")
                return
            
            self.seen_event_ids.add(event.event_id)
            
            # Pass to remote event handler
            if self.remote_event_handler:
                await self.remote_event_handler(event)
            
            logger.debug(f"Received remote event: {event.title} from {event.source_node}")
            
        except Exception as e:
            logger.error(f"Error processing remote event: {e}")
    
    async def broadcast_event(self, event: LCDEvent):
        """
        Broadcast event to all connected peer nodes.
        
        Args:
            event: LCDEvent to broadcast
        """
        # Add to seen events
        self.seen_event_ids.add(event.event_id)
        
        # Serialize event
        event_json = json.dumps(event.to_dict())
        
        # Send to all peers
        for node_id, ws in list(self.peer_connections.items()):
            try:
                await ws.send_str(event_json)
                logger.debug(f"Sent event {event.event_id} to {node_id}")
            except Exception as e:
                logger.error(f"Error sending to {node_id}: {e}")
    
    def set_remote_event_handler(self, handler: Callable):
        """Set handler for remote events"""
        self.remote_event_handler = handler
        logger.info("Remote event handler registered")
    
    def get_connected_peers(self) -> list:
        """Get list of connected peer node IDs"""
        return list(self.peer_connections.keys())
    
    def is_connected_to(self, node_id: str) -> bool:
        """Check if connected to specific peer"""
        return node_id in self.peer_connections

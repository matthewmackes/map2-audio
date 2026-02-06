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

from app.lcd_models.lcd_event import LCDEvent

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
        
        # Reconnection configuration
        self.reconnect_base_delay = 1.0  # Start with 1 second
        self.reconnect_max_delay = 60.0  # Max 60 seconds
        self.reconnect_max_retries = 10  # Give up after 10 retries
        
        # Event queues for offline peers {node_id: queue}
        self.pending_events: Dict[str, asyncio.Queue] = {}
        self.max_queue_size = 1000  # Max events to queue per peer
        
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
        """Maintain WebSocket connection to peer with exponential backoff"""
        retry_count = 0
        
        # Create event queue for this peer
        if node_id not in self.pending_events:
            self.pending_events[node_id] = asyncio.Queue(maxsize=self.max_queue_size)
        
        while retry_count < self.reconnect_max_retries:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.ws_connect(node_url, timeout=aiohttp.ClientTimeout(total=10)) as ws:
                        self.peer_connections[node_id] = ws
                        logger.info(f"✓ Connected to peer {node_id} (attempt {retry_count + 1})")
                        
                        # Reset retry count on successful connection
                        retry_count = 0
                        
                        # Flush pending events
                        await self._flush_pending_events(node_id, ws)
                        
                        # Receive events from peer
                        async for msg in ws:
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                await self._handle_remote_event(msg.data)
                            elif msg.type == aiohttp.WSMsgType.ERROR:
                                logger.error(f"WebSocket error from {node_id}")
                                break
                            elif msg.type == aiohttp.WSMsgType.CLOSED:
                                logger.warning(f"WebSocket closed by {node_id}")
                                break
                                
            except asyncio.CancelledError:
                logger.info(f"Connection task cancelled for {node_id}")
                raise
                
            except Exception as e:
                retry_count += 1
                delay = min(
                    self.reconnect_base_delay * (2 ** (retry_count - 1)),
                    self.reconnect_max_delay
                )
                
                logger.warning(
                    f"Connection to {node_id} failed (attempt {retry_count}/{self.reconnect_max_retries}): {e}. "
                    f"Reconnecting in {delay:.1f}s..."
                )
                
                await asyncio.sleep(delay)
                
            finally:
                if node_id in self.peer_connections:
                    del self.peer_connections[node_id]
        
        logger.error(f"❌ Failed to connect to {node_id} after {self.reconnect_max_retries} retries. Giving up.")
    
    async def _flush_pending_events(self, node_id: str, ws: aiohttp.ClientWebSocketResponse):
        """Send queued events after reconnection"""
        if node_id not in self.pending_events:
            return
        
        queue = self.pending_events[node_id]
        flushed_count = 0
        
        while not queue.empty():
            try:
                event_json = queue.get_nowait()
                await ws.send_str(event_json)
                flushed_count += 1
            except asyncio.QueueEmpty:
                break
            except Exception as e:
                logger.error(f"Error flushing event to {node_id}: {e}")
                break
        
        if flushed_count > 0:
            logger.info(f"Flushed {flushed_count} pending events to {node_id}")
    
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
        Queue events for offline peers.
        
        Args:
            event: LCDEvent to broadcast
        """
        # Add to seen events
        self.seen_event_ids.add(event.event_id)
        
        # Serialize event
        event_json = json.dumps(event.to_dict())
        
        # Send to connected peers, queue for offline ones
        for node_id in self._connection_tasks.keys():
            if node_id in self.peer_connections:
                # Peer is connected - send immediately
                try:
                    ws = self.peer_connections[node_id]
                    await ws.send_str(event_json)
                    logger.debug(f"Sent event {event.event_id} to {node_id}")
                except Exception as e:
                    logger.warning(f"Failed to send event to {node_id}: {e}")
                    # Queue for retry
                    await self._queue_event(node_id, event_json)
            else:
                # Peer is offline - queue event
                await self._queue_event(node_id, event_json)
    
    async def _queue_event(self, node_id: str, event_json: str):
        """Queue event for offline peer"""
        if node_id not in self.pending_events:
            self.pending_events[node_id] = asyncio.Queue(maxsize=self.max_queue_size)
        
        queue = self.pending_events[node_id]
        
        try:
            queue.put_nowait(event_json)
            logger.debug(f"Queued event for offline peer {node_id} (queue size: {queue.qsize()})")
        except asyncio.QueueFull:
            # Drop oldest event to make room
            try:
                queue.get_nowait()
                queue.put_nowait(event_json)
                logger.warning(f"Event queue full for {node_id}, dropped oldest event")
            except Exception as e:
                logger.error(f"Error queueing event for {node_id}: {e}")
    
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
    
    def get_connection_stats(self) -> dict:
        """Get connection statistics for monitoring"""
        return {
            'total_peers': len(self._connection_tasks),
            'connected_peers': len(self.peer_connections),
            'offline_peers': len(self._connection_tasks) - len(self.peer_connections),
            'peer_status': {
                node_id: {
                    'connected': node_id in self.peer_connections,
                    'pending_events': self.pending_events[node_id].qsize() 
                                     if node_id in self.pending_events else 0
                }
                for node_id in self._connection_tasks.keys()
            },
            'total_pending_events': sum(
                q.qsize() for q in self.pending_events.values()
            )
        }

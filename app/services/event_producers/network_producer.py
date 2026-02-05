"""
Network Event Producer

Monitors network connectivity and generates LCD events for:
- Peer node connections/disconnections
- Network latency changes
- Bandwidth issues
- API connectivity
"""

import asyncio
import logging
import aiohttp
from datetime import datetime

from app.services.lcd_event_bus import LCDEventBus, create_system_event
from app.models.lcd_event import EventType, EventSeverity

logger = logging.getLogger(__name__)


class NetworkEventProducer:
    """
    Produces LCD events based on network status.
    
    Monitors:
    - Peer node connectivity
    - Network latency to peers
    - API endpoint health
    - Bandwidth/throughput issues
    """
    
    def __init__(self, event_bus: LCDEventBus):
        self.event_bus = event_bus
        
        # Known peers: {node_id: {'url': str, 'connected': bool}}
        self.peers = {}
        
        # Monitoring task
        self._monitor_task = None
        
    async def start(self):
        """Start network monitoring"""
        logger.info("Starting Network Event Producer")
        self._monitor_task = asyncio.create_task(self._monitor_loop())
    
    async def stop(self):
        """Stop monitoring"""
        logger.info("Stopping Network Event Producer")
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
    
    async def _monitor_loop(self):
        """Background monitoring loop"""
        while True:
            try:
                await self._check_peer_connectivity()
                await asyncio.sleep(15)  # Check every 15 seconds
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Network monitoring error: {e}")
                await asyncio.sleep(30)
    
    async def _check_peer_connectivity(self):
        """Check connectivity to all known peers"""
        for node_id, info in self.peers.items():
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(
                        f"{info['url']}/api/health",
                        timeout=aiohttp.ClientTimeout(total=3)
                    ) as response:
                        connected = response.status == 200
                        await self._update_peer_status(node_id, connected)
            except Exception:
                await self._update_peer_status(node_id, False)
    
    async def _update_peer_status(self, node_id: str, connected: bool):
        """Update peer connection status and generate event if changed"""
        if node_id not in self.peers:
            return
        
        previous_status = self.peers[node_id].get('connected', False)
        
        if connected != previous_status:
            self.peers[node_id]['connected'] = connected
            
            if connected:
                await self.on_peer_connected(node_id)
            else:
                await self.on_peer_disconnected(node_id)
    
    async def register_peer(self, node_id: str, node_url: str):
        """Register a peer node for monitoring"""
        self.peers[node_id] = {
            'url': node_url,
            'connected': False
        }
        logger.info(f"Registered peer for monitoring: {node_id}")
    
    async def on_peer_connected(self, node_id: str):
        """Called when peer node connects"""
        event = {
            "event_id": "",
            "timestamp": datetime.now(),
            "source_node": self.event_bus.node_label,
            "event_type": EventType.NETWORK,
            "severity": EventSeverity.INFO,
            "title": "Peer Connected",
            "message": f"{node_id} is now online",
            "icon": "🔗",
            "color": "green",
            "broadcast": True,
            "context": {"peer_node": node_id}
        }
        
        from app.models.lcd_event import LCDEvent
        await self.event_bus.publish(LCDEvent(**event))
        
        logger.info(f"Peer connected: {node_id}")
    
    async def on_peer_disconnected(self, node_id: str):
        """Called when peer node disconnects"""
        event = {
            "event_id": "",
            "timestamp": datetime.now(),
            "source_node": self.event_bus.node_label,
            "event_type": EventType.NETWORK,
            "severity": EventSeverity.WARNING,
            "title": "Peer Disconnected",
            "message": f"{node_id} went offline",
            "icon": "⚠️",
            "color": "yellow",
            "broadcast": True,
            "context": {"peer_node": node_id}
        }
        
        from app.models.lcd_event import LCDEvent
        await self.event_bus.publish(LCDEvent(**event))
        
        logger.warning(f"Peer disconnected: {node_id}")
    
    async def on_high_latency(self, node_id: str, latency_ms: float):
        """Called when latency to peer is high"""
        await create_system_event(
            self.event_bus,
            title="High Network Latency",
            message=f"{node_id}: {latency_ms:.0f}ms",
            severity=EventSeverity.WARNING,
            color="yellow",
            context={"peer_node": node_id, "latency_ms": latency_ms}
        )

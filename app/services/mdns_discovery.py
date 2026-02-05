"""
mDNS Peer Discovery

Automatic peer node discovery using Avahi (mDNS).
Nodes advertise themselves and discover other nodes without
manual configuration.
"""

import asyncio
import logging
from typing import Dict, List, Optional, Callable
import socket
import json

logger = logging.getLogger(__name__)


class MDNSPeerDiscovery:
    """
    Automatically discovers peer nodes using mDNS/Avahi.
    
    Each node advertises:
    - Service type: _map2-node._tcp
    - Hostname
    - Port (8000 for REST API)
    - Mode (AUDIO-NODE, CONTROL-NODE)
    - Node ID
    """
    
    def __init__(self, node_id: str, node_mode: str, port: int = 8000):
        self.node_id = node_id
        self.node_mode = node_mode
        self.port = port
        self.hostname = socket.gethostname()
        
        # Discovered peers: {node_id: {'host': str, 'port': int, 'mode': str, 'url': str}}
        self.discovered_peers: Dict[str, Dict] = {}
        
        # Listeners for peer discovery/removal
        self.peer_callbacks: List[Callable] = []
        
        # Discovery task
        self._discovery_task = None
        self._advertise_task = None
        
    async def start(self):
        """Start peer discovery and advertisement"""
        logger.info(f"Starting mDNS discovery for {self.node_id}")
        
        try:
            import zeroconf
            self.zeroconf = zeroconf.Zeroconf()
            
            # Start advertising self
            self._advertise_task = asyncio.create_task(self._advertise_self())
            
            # Start discovering peers
            self._discovery_task = asyncio.create_task(self._discover_peers())
            
        except ImportError:
            logger.warning("zeroconf not installed, mDNS discovery disabled")
            self.zeroconf = None
    
    async def stop(self):
        """Stop discovery and advertisement"""
        logger.info("Stopping mDNS peer discovery")
        
        if self._discovery_task:
            self._discovery_task.cancel()
        if self._advertise_task:
            self._advertise_task.cancel()
        
        if self.zeroconf:
            self.zeroconf.close()
    
    async def _advertise_self(self):
        """Advertise this node to the network"""
        if not self.zeroconf:
            return
        
        try:
            import zeroconf
            
            # Prepare service info
            service_name = f"{self.node_id}._map2-node._tcp.local."
            
            properties = {
                'mode': self.node_mode,
                'node_id': self.node_id,
                'version': '1.0'
            }
            
            # Get local IP
            hostname_ip = socket.gethostbyname(self.hostname)
            
            service_info = zeroconf.ServiceInfo(
                "_map2-node._tcp.local.",
                service_name,
                addresses=[socket.inet_aton(hostname_ip)],
                port=self.port,
                properties=properties,
                server=f"{self.hostname}.local."
            )
            
            self.zeroconf.register_service(service_info)
            logger.info(f"Advertised node {self.node_id} on {hostname_ip}:{self.port}")
            
            # Keep advertising
            while True:
                await asyncio.sleep(60)  # Re-advertise every minute
                
        except Exception as e:
            logger.error(f"Error advertising node: {e}")
    
    async def _discover_peers(self):
        """Discover other MAP2 nodes on the network"""
        if not self.zeroconf:
            return
        
        try:
            import zeroconf
            
            class ServiceBrowser(zeroconf.ServiceBrowser):
                def __init__(self, zeroconf, service_type, handler):
                    self.handler = handler
                    super().__init__(zeroconf, service_type, self)
                
                def update_record(self, zeroconf, service_type, name):
                    info = zeroconf.get_service_info(service_type, name)
                    if info:
                        self.handler(info)
            
            browser = ServiceBrowser(
                self.zeroconf,
                "_map2-node._tcp.local.",
                self._on_service_found
            )
            
            # Keep discovering
            while True:
                await asyncio.sleep(10)  # Refresh discovery every 10s
                
        except Exception as e:
            logger.error(f"Error discovering peers: {e}")
    
    def _on_service_found(self, service_info):
        """Callback when a service is found"""
        try:
            # Extract node info
            properties = service_info.properties
            node_id = properties.get(b'node_id', b'').decode()
            node_mode = properties.get(b'mode', b'').decode()
            
            # Skip self
            if node_id == self.node_id:
                return
            
            # Get IP and port
            addresses = service_info.addresses
            if addresses:
                host = socket.inet_ntoa(addresses[0])
                port = service_info.port
                
                # Update peers
                if node_id not in self.discovered_peers:
                    logger.info(f"Discovered peer: {node_id} ({node_mode}) at {host}:{port}")
                    self.discovered_peers[node_id] = {
                        'host': host,
                        'port': port,
                        'mode': node_mode,
                        'url': f"ws://{host}:{port}/ws/lcd-events"
                    }
                    
                    # Notify listeners
                    for callback in self.peer_callbacks:
                        try:
                            callback('discovered', node_id, self.discovered_peers[node_id])
                        except Exception as e:
                            logger.error(f"Callback error: {e}")
                            
        except Exception as e:
            logger.error(f"Error processing service: {e}")
    
    def subscribe(self, callback: Callable):
        """Subscribe to peer discovery events"""
        self.peer_callbacks.append(callback)
    
    def unsubscribe(self, callback: Callable):
        """Unsubscribe from peer discovery events"""
        if callback in self.peer_callbacks:
            self.peer_callbacks.remove(callback)
    
    def get_discovered_peers(self) -> Dict[str, Dict]:
        """Get all discovered peers"""
        return self.discovered_peers.copy()
    
    def get_peer(self, node_id: str) -> Optional[Dict]:
        """Get specific peer info"""
        return self.discovered_peers.get(node_id)

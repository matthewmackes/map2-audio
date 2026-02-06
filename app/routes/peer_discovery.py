"""
Enhanced Peer Discovery API

Endpoints for:
- GET /api/peers - Get enhanced peer discovery status with latency and details
- POST /api/peers/{peer_id}/ping - Ping a specific peer
- GET /api/peers/{peer_id}/latency - Get peer latency history
- POST /api/peers/{peer_id}/link - Link with peer (SSH + mDNS + LCD)
"""

import asyncio
import logging
import time
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/peers", tags=["Peer Discovery"])

# Global peer manager (injected by main app)
peer_manager = None

# Track latency history
LATENCY_HISTORY: Dict[str, List[Dict]] = {}
HISTORY_MAX_ENTRIES = 100


class PeerInfo(BaseModel):
    """Detailed peer information"""
    node_id: str
    node_mode: str
    host: str
    port: int
    api_url: str
    ws_url: str
    ssh_url: str
    discovered_at: str
    last_seen: str
    latency_ms: Optional[float] = None
    ssh_trusted: bool = False


class LatencyEntry(BaseModel):
    """Single latency measurement"""
    timestamp: str
    latency_ms: float
    success: bool


class PeerLatencyResponse(BaseModel):
    """Latency history for a peer"""
    peer_id: str
    measurements: List[LatencyEntry]
    average_latency_ms: Optional[float] = None
    min_latency_ms: Optional[float] = None
    max_latency_ms: Optional[float] = None
    packet_loss_percent: float = 0.0


class DiscoveryStatusResponse(BaseModel):
    """Peer discovery status"""
    local_node_id: str
    discovery_enabled: bool
    discovery_uptime: str
    peers_discovered: int
    peers_connected: int
    peers: List[PeerInfo]


class LinkPeerRequest(BaseModel):
    """Request to link with peer"""
    peer_id: str
    peer_host: str
    peer_user: str = "mm"
    setup_ssh: bool = True
    setup_lcd_routing: bool = True


class LinkPeerResponse(BaseModel):
    """Response from peer linking"""
    peer_id: str
    status: str  # "success", "partial", "failed"
    ssh_trust: bool = False
    lcd_routing: bool = False
    message: str


def _get_peer_manager():
    """Get peer manager from LCD manager"""
    from app.services.lcd_manager import lcd_manager as global_lcd_manager
    if global_lcd_manager and hasattr(global_lcd_manager, 'mdns_discovery'):
        return global_lcd_manager.mdns_discovery
    return None


def _record_latency(peer_id: str, latency_ms: float, success: bool = True):
    """Record latency measurement for a peer"""
    if peer_id not in LATENCY_HISTORY:
        LATENCY_HISTORY[peer_id] = []
    
    entry = {
        'timestamp': datetime.utcnow().isoformat(),
        'latency_ms': latency_ms,
        'success': success,
    }
    
    LATENCY_HISTORY[peer_id].append(entry)
    
    # Keep only recent entries
    if len(LATENCY_HISTORY[peer_id]) > HISTORY_MAX_ENTRIES:
        LATENCY_HISTORY[peer_id] = LATENCY_HISTORY[peer_id][-HISTORY_MAX_ENTRIES:]


def _calculate_latency_stats(peer_id: str) -> Dict:
    """Calculate latency statistics for a peer"""
    if peer_id not in LATENCY_HISTORY or not LATENCY_HISTORY[peer_id]:
        return {
            'average': None,
            'min': None,
            'max': None,
            'packet_loss': 0.0,
        }
    
    history = LATENCY_HISTORY[peer_id]
    successful = [h['latency_ms'] for h in history if h['success']]
    
    if not successful:
        return {
            'average': None,
            'min': None,
            'max': None,
            'packet_loss': 100.0,
        }
    
    packet_loss = (len(history) - len(successful)) / len(history) * 100
    
    return {
        'average': sum(successful) / len(successful),
        'min': min(successful),
        'max': max(successful),
        'packet_loss': packet_loss,
    }


async def _ping_peer(peer_host: str, peer_port: int = 8000) -> Optional[float]:
    """Ping a peer and measure latency"""
    try:
        import socket
        
        start = time.time()
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(2)
        
        try:
            sock.connect((peer_host, peer_port))
            latency_ms = (time.time() - start) * 1000
            return latency_ms
        finally:
            sock.close()
    except Exception as e:
        logger.debug(f"Failed to ping {peer_host}:{peer_port}: {e}")
        return None


@router.get("", response_model=DiscoveryStatusResponse)
async def get_peer_discovery_status():
    """Get comprehensive peer discovery status"""
    from app.services.lcd_manager import lcd_manager as global_lcd_manager
    
    if not global_lcd_manager:
        raise HTTPException(status_code=503, detail="LCD Manager not initialized")
    
    # Get discovered peers
    mdns = global_lcd_manager.mdns_discovery
    if not mdns:
        raise HTTPException(status_code=503, detail="mDNS discovery not enabled")
    
    discovered = mdns.get_discovered_peers() if hasattr(mdns, 'get_discovered_peers') else getattr(mdns, 'discovered_peers', {})
    
    # Get connected peers
    connected = set(global_lcd_manager.event_router.get_connected_peers()) if hasattr(global_lcd_manager.event_router, 'get_connected_peers') else set()
    
    # Read SSH trust status
    from app.services.node_identity import NodeIdentity
    from pathlib import Path
    import json
    
    identity = NodeIdentity()
    trusted_peers = set()
    
    trust_file = Path.home() / ".map2" / "ssh_trust" / "trusted_peers.json"
    if trust_file.exists():
        with open(trust_file, 'r') as f:
            trusted_data = json.load(f)
            trusted_peers = set(trusted_data.keys())
    
    # Build peer list
    peers = []
    for node_id, peer_data in discovered.items():
        # Measure current latency
        host = peer_data.get('host') or peer_data.get('hostname')
        port = peer_data.get('port', 8000)
        latency = await _ping_peer(host, port)
        
        if latency is not None:
            _record_latency(node_id, latency, success=True)
        else:
            _record_latency(node_id, 0, success=False)
        
        peer_info = PeerInfo(
            node_id=node_id,
            node_mode=peer_data.get('mode', 'UNKNOWN'),
            host=host,
            port=port,
            api_url=f"http://{host}:{port}",
            ws_url=f"ws://{host}:{port}/ws",
            ssh_url=f"ssh://mm@{host}",
            discovered_at=peer_data.get('discovered_at', datetime.utcnow().isoformat()),
            last_seen=peer_data.get('last_seen', datetime.utcnow().isoformat()),
            latency_ms=latency,
            ssh_trusted=node_id in trusted_peers,
        )
        peers.append(peer_info)
    
    return DiscoveryStatusResponse(
        local_node_id=global_lcd_manager.node_id,
        discovery_enabled=mdns is not None,
        discovery_uptime=getattr(mdns, 'discovery_uptime', 'unknown'),
        peers_discovered=len(discovered),
        peers_connected=len(connected),
        peers=peers,
    )


@router.post("/{peer_id}/ping")
async def ping_peer(peer_id: str):
    """Ping a specific peer and measure latency"""
    from app.services.lcd_manager import lcd_manager as global_lcd_manager
    
    if not global_lcd_manager or not global_lcd_manager.mdns_discovery:
        raise HTTPException(status_code=503, detail="LCD Manager not initialized")
    
    mdns = global_lcd_manager.mdns_discovery
    discovered = getattr(mdns, 'discovered_peers', {})
    
    if peer_id not in discovered:
        raise HTTPException(status_code=404, detail=f"Peer {peer_id} not discovered")
    
    peer_data = discovered[peer_id]
    host = peer_data.get('host') or peer_data.get('hostname')
    port = peer_data.get('port', 8000)
    
    latency = await _ping_peer(host, port)
    
    if latency is not None:
        _record_latency(peer_id, latency, success=True)
        return {
            'peer_id': peer_id,
            'host': host,
            'latency_ms': latency,
            'success': True,
        }
    else:
        _record_latency(peer_id, 0, success=False)
        return {
            'peer_id': peer_id,
            'host': host,
            'latency_ms': None,
            'success': False,
            'error': 'Connection timeout',
        }


@router.get("/{peer_id}/latency", response_model=PeerLatencyResponse)
async def get_peer_latency_history(peer_id: str):
    """Get latency history for a peer"""
    if peer_id not in LATENCY_HISTORY:
        raise HTTPException(status_code=404, detail=f"No latency data for peer {peer_id}")
    
    measurements = [
        LatencyEntry(
            timestamp=entry['timestamp'],
            latency_ms=entry['latency_ms'],
            success=entry['success'],
        )
        for entry in LATENCY_HISTORY[peer_id]
    ]
    
    stats = _calculate_latency_stats(peer_id)
    
    return PeerLatencyResponse(
        peer_id=peer_id,
        measurements=measurements,
        average_latency_ms=stats['average'],
        min_latency_ms=stats['min'],
        max_latency_ms=stats['max'],
        packet_loss_percent=stats['packet_loss'],
    )


@router.post("/{peer_id}/link", response_model=LinkPeerResponse)
async def link_peer(peer_id: str, request: LinkPeerRequest):
    """
    Link with a peer: setup SSH trust + mDNS + LCD routing
    
    This is a comprehensive peer linking action that:
    1. Exchanges SSH public keys and establishes trust
    2. Configures LCD event routing
    3. Records peer in deployment configuration
    """
    from app.routes.ssh_trust import add_peer_trust
    from app.services.node_identity import NodeIdentity
    import subprocess
    
    try:
        logger.info(f"Initiating peer link with {peer_id} at {request.peer_host}")
        
        ssh_success = False
        lcd_success = False
        
        # Step 1: SSH Trust setup
        if request.setup_ssh:
            try:
                # Fetch peer's SSH public key
                # Attempt via API first
                peer_api_url = f"http://{request.peer_host}:8000"
                import aiohttp
                
                async with aiohttp.ClientSession() as session:
                    async with session.get(f"{peer_api_url}/api/ssh/keys") as resp:
                        if resp.status == 200:
                            peer_keys = await resp.json()
                            peer_public_key = peer_keys['public_key']
                            
                            # Add to our trusted peers
                            await add_peer_trust({
                                'peer_id': peer_id,
                                'peer_public_key': peer_public_key,
                            })
                            
                            ssh_success = True
                            logger.info(f"SSH trust established with {peer_id}")
            except Exception as e:
                logger.warning(f"Failed to setup SSH trust: {e}")
        
        # Step 2: LCD Routing setup
        if request.setup_lcd_routing:
            try:
                # Register peer in LCD event router
                from app.services.lcd_manager import lcd_manager as global_lcd_manager
                
                if global_lcd_manager and hasattr(global_lcd_manager, 'event_router'):
                    event_router = global_lcd_manager.event_router
                    
                    if hasattr(event_router, 'add_remote_peer'):
                        await event_router.add_remote_peer(
                            peer_id=peer_id,
                            host=request.peer_host,
                            port=8000,
                        )
                        lcd_success = True
                        logger.info(f"LCD routing configured for {peer_id}")
            except Exception as e:
                logger.warning(f"Failed to setup LCD routing: {e}")
        
        # Determine overall status
        if ssh_success and lcd_success:
            status = "success"
            message = f"Successfully linked with {peer_id}"
        elif ssh_success or lcd_success:
            status = "partial"
            message = f"Partial link with {peer_id} (SSH: {ssh_success}, LCD: {lcd_success})"
        else:
            status = "failed"
            message = f"Failed to link with {peer_id}"
        
        return LinkPeerResponse(
            peer_id=peer_id,
            status=status,
            ssh_trust=ssh_success,
            lcd_routing=lcd_success,
            message=message,
        )
        
    except Exception as e:
        logger.error(f"Failed to link peer {peer_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to link peer: {e}")

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
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/peers", tags=["Peer Discovery"])

# Track latency history
LATENCY_HISTORY: Dict[str, List[Dict]] = {}
HISTORY_MAX_ENTRIES = 100


class PeerInfo(BaseModel):
    """Detailed peer information"""
    node_id: str
    node_mode: str
    hostname: Optional[str] = None
    host: str
    port: int
    api_url: str
    ws_url: str
    ssh_url: str
    discovered_at: str
    last_seen: str
    latency_ms: Optional[float] = None
    ssh_trusted: bool = False
    is_online: bool = True
    discovery_sources: List[str] = []
    registered: bool = False
    registry_status: Optional[str] = None
    heartbeat_online: Optional[bool] = None
    visible: bool = True
    visibility_state: Optional[str] = None
    registration_required: bool = False
    routing_ready: bool = False
    visibility_reason: Optional[str] = None
    avb_enabled: bool = True
    discovered_via_mdns: bool = False
    discovered_via_peer_mdns: bool = False
    discovered_via_cluster_mdns: bool = False
    trust_state: Optional[str] = None
    adoption_state: Optional[str] = None
    activation_state: Optional[str] = None
    readiness_status: Optional[str] = None
    adoption_candidate_id: Optional[str] = None


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
    from app.services.lcd_manager import get_lcd_manager

    manager = get_lcd_manager()
    if manager and hasattr(manager, "mdns_discovery"):
        return manager.mdns_discovery
    return None


def _require_lcd_manager():
    from app.services.lcd_manager import get_lcd_manager

    manager = get_lcd_manager()
    if manager is None:
        raise HTTPException(status_code=503, detail="LCD Manager not initialized")
    return manager


def _require_mdns_discovery():
    manager = _require_lcd_manager()
    mdns = getattr(manager, "mdns_discovery", None)
    if mdns is None:
        raise HTTPException(status_code=503, detail="mDNS discovery not enabled")
    return manager, mdns


def _record_latency(peer_id: str, latency_ms: float, success: bool = True):
    """Record latency measurement for a peer"""
    if peer_id not in LATENCY_HISTORY:
        LATENCY_HISTORY[peer_id] = []
    
    entry = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
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


def _to_isoformat(value: object) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str):
        normalized = value.strip()
        if normalized:
            return normalized
    return datetime.now(timezone.utc).isoformat()


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
    global_lcd_manager = _require_lcd_manager()
    mdns = getattr(global_lcd_manager, "mdns_discovery", None)
    from app.services.cluster.node_visibility import get_visible_remote_nodes

    _, visible_nodes = get_visible_remote_nodes()

    event_router = getattr(global_lcd_manager, "event_router", None)
    connected = set(event_router.get_connected_peers()) if event_router and hasattr(event_router, "get_connected_peers") else set()
    
    # Read SSH trust status
    from pathlib import Path
    import json

    trusted_peers = set()

    trust_file = Path.home() / ".map2" / "ssh_trust" / "trusted_peers.json"
    if trust_file.exists():
        with open(trust_file, "r", encoding="utf-8") as f:
            trusted_data = json.load(f)
            trusted_peers = set(trusted_data.keys())
    
    # Build peer list
    peers = []
    for node_id in sorted(visible_nodes):
        peer_data = visible_nodes[node_id]
        host = getattr(peer_data, "host", None) or getattr(peer_data, "hostname", None) or node_id
        port = int(getattr(peer_data, "port", 8000) or 8000)
        is_online = bool(getattr(peer_data, "is_online", True))
        registered = bool(getattr(peer_data, "registered", False))
        visibility_state = getattr(peer_data, "visibility_state", None)
        if visibility_state is None:
            visibility_state = "managed-online" if registered and is_online else "discovered-unmanaged"
        routing_ready = bool(getattr(peer_data, "routing_ready", registered and is_online and getattr(peer_data, "api_url", None)))
        # Measure current latency
        latency = await _ping_peer(host, port)
        
        if latency is not None:
            _record_latency(node_id, latency, success=True)
        else:
            _record_latency(node_id, 0, success=False)
        
        peer_info = PeerInfo(
            node_id=node_id,
            node_mode=getattr(peer_data, "node_mode", None) or "UNKNOWN",
            hostname=getattr(peer_data, "hostname", None) or host,
            host=host,
            port=port,
            api_url=str(getattr(peer_data, "api_url", None) or f"http://{host}:{port}"),
            ws_url=str(getattr(peer_data, "ws_url", None) or f"ws://{host}:{port}/api/lcd/ws/events"),
            ssh_url=f"ssh://mm@{host}",
            discovered_at=_to_isoformat(getattr(peer_data, "discovered_at", None) or getattr(peer_data, "last_seen", None)),
            last_seen=_to_isoformat(getattr(peer_data, "last_seen", None)),
            latency_ms=latency,
            ssh_trusted=node_id in trusted_peers,
            is_online=is_online,
            discovery_sources=sorted(getattr(peer_data, "sources", [])),
            registered=registered,
            registry_status=getattr(peer_data, "registry_status", None),
            heartbeat_online=getattr(peer_data, "heartbeat_online", None),
            visible=bool(getattr(peer_data, "visible", is_online)),
            visibility_state=visibility_state,
            registration_required=bool(getattr(peer_data, "registration_required", not registered)),
            routing_ready=routing_ready,
            visibility_reason=getattr(peer_data, "visibility_reason", None),
            avb_enabled=bool(getattr(peer_data, "avb_enabled", True)),
            discovered_via_mdns=bool(getattr(peer_data, "discovered_via_mdns", False)),
            discovered_via_peer_mdns=bool(getattr(peer_data, "discovered_via_peer_mdns", False)),
            discovered_via_cluster_mdns=bool(getattr(peer_data, "discovered_via_cluster_mdns", False)),
            trust_state=getattr(peer_data, "trust_state", None),
            adoption_state=getattr(peer_data, "adoption_state", None),
            activation_state=getattr(peer_data, "activation_state", None),
            readiness_status=getattr(peer_data, "readiness_status", None),
            adoption_candidate_id=getattr(peer_data, "adoption_candidate_id", None),
        )
        peers.append(peer_info)
    
    return DiscoveryStatusResponse(
        local_node_id=global_lcd_manager.node_id,
        discovery_enabled=mdns is not None or bool(visible_nodes),
        discovery_uptime=getattr(mdns, 'discovery_uptime', 'unknown'),
        peers_discovered=len(visible_nodes),
        peers_connected=len(connected),
        peers=peers,
    )


@router.post("/{peer_id}/ping")
async def ping_peer(peer_id: str):
    """Ping a specific peer and measure latency"""
    _require_lcd_manager()
    from app.services.cluster.node_visibility import get_visible_remote_node

    peer = get_visible_remote_node(peer_id)

    if peer is None:
        raise HTTPException(status_code=404, detail=f"Peer {peer_id} not discovered")

    host = peer.host or peer.hostname
    port = int(peer.port or 8000)
    
    latency = await _ping_peer(host, port)
    
    if latency is not None:
        _record_latency(peer_id, latency, success=True)
        return {
            "peer_id": peer_id,
            "host": host,
            "latency_ms": latency,
            "success": True,
        }
    else:
        _record_latency(peer_id, 0, success=False)
        return {
            "peer_id": peer_id,
            "host": host,
            "latency_ms": None,
            "success": False,
            "error": "Connection timeout",
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
                global_lcd_manager = _require_lcd_manager()
                event_router = getattr(global_lcd_manager, "event_router", None)

                if event_router and hasattr(event_router, "connect_to_peer"):
                    await event_router.connect_to_peer(
                        peer_id,
                        f"ws://{request.peer_host}:8000/api/lcd/ws/events",
                    )
                    lcd_success = True
                    logger.info(f"LCD routing configured for {peer_id}")
                elif event_router and hasattr(event_router, "add_remote_peer"):
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

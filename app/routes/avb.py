"""
AVB/TSN Network Audio Transport API Routes

Provides REST endpoints for:
- PTP synchronization status
- TSN qdisc configuration (Phase 2)
- AVB stream management (Phase 5)

All endpoints return available=false gracefully when AVB is disabled or hardware unavailable.
"""

import asyncio
import logging
from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional

from app.config import config_get
from app.services.avb import is_avb_available
from app.services.avb.ptp_monitor import get_ptp_monitor
from app.services.avb.tsn_qdisc import get_tsn_qdisc_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/avb", tags=["AVB/TSN"])


@router.get("/ptp/status")
async def get_ptp_status() -> Dict[str, Any]:
    """
    Get PTP (IEEE 802.1AS gPTP) synchronization status.

    Returns:
        PTPStatus dict with:
        - available: bool (false if AVB disabled or ptp4l not running)
        - state: str (MASTER, SLAVE, LISTENING, etc.) if available
        - offset_ns: float (clock offset in nanoseconds) if available
        - mean_path_delay_ns: float (network delay) if available
        - grandmaster_id: str (GM clock identity) if available
        - error: str (error message) if unavailable

    This endpoint always returns 200 OK, even when AVB is unavailable.
    Check the 'available' field to determine if PTP is active.
    """
    try:
        # Check if AVB is enabled in config
        if not config_get("avb.enabled", False):
            return {
                "available": False,
                "error": "AVB not enabled in configuration"
            }

        # Check if AVB hardware is available
        if not is_avb_available():
            return {
                "available": False,
                "error": "AVB hardware not available (no TSN NIC or ptp4l not installed)"
            }

        # Get PTP status from monitor
        ptp_monitor = get_ptp_monitor()
        status = await ptp_monitor.get_status()

        return status.to_dict()

    except Exception as e:
        logger.error(f"Error getting PTP status: {e}", exc_info=True)
        return {
            "available": False,
            "error": f"Internal error: {str(e)}"
        }


@router.get("/status")
async def get_avb_status() -> Dict[str, Any]:
    """
    Get overall AVB/TSN system status.

    Returns:
        - enabled: bool (from config)
        - available: bool (hardware + software check)
        - interface: str (configured interface)
        - ptp: PTPStatus (from /ptp/status)
        - reason: str (why unavailable, if applicable)
    """
    try:
        enabled = config_get("avb.enabled", False)
        interface = config_get("avb.interface", "")
        available = is_avb_available()

        # Get PTP status
        ptp_status = await get_ptp_status()

        # Determine reason if not available
        reason = None
        if not enabled:
            reason = "AVB disabled in configuration"
        elif not interface:
            reason = "No AVB interface configured"
        elif not available:
            reason = "AVB hardware not available"

        return {
            "enabled": enabled,
            "available": available,
            "interface": interface,
            "ptp": ptp_status,
            "reason": reason,
            "config": {
                "ptp_domain": config_get("avb.ptp_domain", 0),
                "ptp_priority1": config_get("avb.ptp_priority1", 128),
                "auto_connect": config_get("avb.auto_connect", False),
                "max_streams": config_get("avb.max_streams", 8),
            }
        }

    except Exception as e:
        logger.error(f"Error getting AVB status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tsn/status")
async def get_tsn_status() -> Dict[str, Any]:
    """
    Get TSN (Traffic Control qdisc) configuration status.

    Returns:
        TsnStatus dict with:
        - available: bool (false if not configured)
        - interface: str (network interface)
        - mqprio_configured: bool (multi-queue priority qdisc)
        - cbs_configured: bool (Credit-Based Shaper)
        - etf_configured: bool (Earliest TxTime First)
        - vlan_configured: bool (VLAN 2 interface)
        - num_traffic_classes: int (number of TCs)
        - cbs_idleslope: int (CBS idle slope in bps)
        - queue_stats: dict (per-queue statistics)

    This endpoint always returns 200 OK, even when TSN is not configured.
    Check the 'available' field to determine if qdiscs are active.
    """
    try:
        # Check if AVB is enabled in config
        if not config_get("avb.enabled", False):
            return {
                "available": False,
                "error": "AVB not enabled in configuration"
            }

        # Get TSN qdisc status
        tsn_manager = get_tsn_qdisc_manager()
        status = await tsn_manager.get_status()

        return status.to_dict()

    except Exception as e:
        logger.error(f"Error getting TSN status: {e}", exc_info=True)
        return {
            "available": False,
            "error": f"Internal error: {str(e)}"
        }


@router.get("/tsn/calculate_cbs")
async def calculate_cbs_parameters(
    sample_rate: int = 48000,
    channels: int = 2,
    bit_depth: int = 24,
    link_speed_mbps: int = 1000
) -> Dict[str, Any]:
    """
    Calculate CBS (Credit-Based Shaper) parameters for given audio specs.

    Query parameters:
        - sample_rate: Audio sample rate in Hz (default: 48000)
        - channels: Number of audio channels (default: 2)
        - bit_depth: Bits per sample (default: 24)
        - link_speed_mbps: Link speed in Mbps (default: 1000)

    Returns:
        CBS parameters: idleslope, sendslope, hicredit, locredit, estimated_bandwidth_mbps
    """
    try:
        from app.services.avb.tsn_qdisc import TsnQdiscManager

        params = TsnQdiscManager.calculate_cbs_parameters(
            sample_rate=sample_rate,
            channels=channels,
            bit_depth=bit_depth,
            link_speed_mbps=link_speed_mbps
        )

        return {
            "input": {
                "sample_rate": sample_rate,
                "channels": channels,
                "bit_depth": bit_depth,
                "link_speed_mbps": link_speed_mbps
            },
            "cbs_parameters": params
        }

    except Exception as e:
        logger.error(f"Error calculating CBS parameters: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Stream Management Endpoints
# ============================================================================

@router.get("/streams")
async def get_streams() -> Dict[str, Any]:
    """
    Get all AVB streams.

    Returns:
        List of stream information dicts
    """
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            return {
                "available": False,
                "streams": [],
                "error": "AVB not available"
            }

        streams = avb_service.get_all_streams()

        return {
            "available": True,
            "streams": streams
        }

    except Exception as e:
        logger.error(f"Error getting AVB streams: {e}", exc_info=True)
        return {
            "available": False,
            "streams": [],
            "error": f"Internal error: {str(e)}"
        }


@router.get("/streams/{stream_id}")
async def get_stream(stream_id: str) -> Dict[str, Any]:
    """Get specific AVB stream information"""
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        stream = avb_service.get_stream(stream_id)

        if stream is None:
            raise HTTPException(status_code=404, detail="Stream not found")

        return stream

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AVB stream: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/streams")
async def create_stream(config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create new AVB stream.

    Body:
        {
            "stream_id": "stream-001",
            "direction": "talker" or "listener",
            "channels": 2,
            "sample_rate": 48000,
            "buffer_size": 256,
            "interface": "enp3s0",
            "dest_mac": "01:AA:BB:CC:DD:EE"  // for talkers only
        }
    """
    try:
        from app.services.avb.avb_service import get_avb_service, AvbStreamConfig, StreamDirection

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        # Parse config
        stream_config = AvbStreamConfig(
            stream_id=config.get("stream_id"),
            direction=StreamDirection(config.get("direction")),
            channels=config.get("channels", 2),
            sample_rate=config.get("sample_rate", 48000),
            buffer_size=config.get("buffer_size", 256),
            interface=config.get("interface", ""),
            dest_mac=config.get("dest_mac"),
            presentation_offset_us=config.get("presentation_offset_us", 2000),
            priority=config.get("priority", 3)
        )

        result = await avb_service.create_stream(stream_config)

        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating AVB stream: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/streams/{stream_id}")
async def delete_stream(stream_id: str) -> Dict[str, Any]:
    """Delete AVB stream"""
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        result = await avb_service.delete_stream(stream_id)

        if "error" in result:
            if result["code"] == "NOT_FOUND":
                raise HTTPException(status_code=404, detail=result["error"])
            raise HTTPException(status_code=400, detail=result["error"])

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting AVB stream: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/streams/{stream_id}/start")
async def start_stream(stream_id: str) -> Dict[str, Any]:
    """Start AVB stream"""
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        result = await avb_service.start_stream(stream_id)

        if "error" in result:
            if result["code"] == "NOT_FOUND":
                raise HTTPException(status_code=404, detail=result["error"])
            raise HTTPException(status_code=400, detail=result["error"])

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting AVB stream: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/streams/{stream_id}/stop")
async def stop_stream(stream_id: str) -> Dict[str, Any]:
    """Stop AVB stream"""
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        result = await avb_service.stop_stream(stream_id)

        if "error" in result:
            if result["code"] == "NOT_FOUND":
                raise HTTPException(status_code=404, detail=result["error"])
            raise HTTPException(status_code=400, detail=result["error"])

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error stopping AVB stream: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/streams/{stream_id}/stats")
async def get_stream_stats(stream_id: str) -> Dict[str, Any]:
    """Get AVB stream statistics"""
    try:
        from app.services.avb.avb_service import get_avb_service

        avb_service = get_avb_service()

        if not avb_service.is_available():
            raise HTTPException(status_code=503, detail="AVB not available")

        stats = avb_service.get_stream_stats(stream_id)

        if stats is None:
            raise HTTPException(status_code=404, detail="Stream not found")

        return stats

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AVB stream stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Discovery Endpoints
# ============================================================================

@router.get("/discovery")
async def get_avb_discovery() -> Dict[str, Any]:
    """
    Get AVB device discovery summary.

    Returns:
        Discovery summary with:
        - enabled: bool (AVB discovery enabled)
        - total_discovered: int (number of discovered AVB nodes)
        - talker_nodes: int (nodes with talker streams)
        - listener_nodes: int (nodes with listener streams)
        - nodes: list of discovered AvbNode objects

    This endpoint always returns 200 OK, even when AVB discovery is disabled.
    Check the 'enabled' field to determine if discovery is active.
    """
    try:
        from app.services.avb.avb_discovery import get_avb_discovery_service

        discovery = get_avb_discovery_service()
        return discovery.get_discovery_summary()

    except Exception as e:
        logger.error(f"Error getting AVB discovery summary: {e}", exc_info=True)
        return {
            "enabled": False,
            "total_discovered": 0,
            "talker_nodes": 0,
            "listener_nodes": 0,
            "nodes": [],
            "error": f"Internal error: {str(e)}"
        }


@router.get("/discovery/nodes")
async def get_discovered_nodes() -> Dict[str, Any]:
    """
    Get list of discovered AVB nodes.

    Returns:
        List of discovered AvbNode objects (online only)
    """
    try:
        from app.services.avb.avb_discovery import get_avb_discovery_service

        discovery = get_avb_discovery_service()

        if not discovery.is_enabled():
            return {
                "enabled": False,
                "nodes": [],
                "error": "AVB discovery not enabled"
            }

        nodes = discovery.get_discovered_nodes()

        return {
            "enabled": True,
            "nodes": [n.to_dict() for n in nodes]
        }

    except Exception as e:
        logger.error(f"Error getting discovered AVB nodes: {e}", exc_info=True)
        return {
            "enabled": False,
            "nodes": [],
            "error": f"Internal error: {str(e)}"
        }


@router.get("/discovery/nodes/{node_id}")
async def get_discovered_node(node_id: str) -> Dict[str, Any]:
    """Get specific discovered AVB node by ID"""
    try:
        from app.services.avb.avb_discovery import get_avb_discovery_service

        discovery = get_avb_discovery_service()

        if not discovery.is_enabled():
            raise HTTPException(status_code=503, detail="AVB discovery not enabled")

        node = discovery.get_discovered_node(node_id)

        if node is None:
            raise HTTPException(status_code=404, detail="Node not found")

        return node.to_dict()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting discovered AVB node: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# AVDECC (IEEE 1722.1) Endpoints
# ============================================================================

@router.get("/avdecc/entities")
async def get_avdecc_entities() -> Dict[str, Any]:
    """
    Get discovered AVDECC entities (third-party AVB devices).

    Returns:
        List of discovered AVDECC entities with capabilities.
    """
    try:
        if not config_get("avb.avdecc_enabled", False):
            return {
                "enabled": False,
                "entities": [],
                "error": "AVDECC not enabled in configuration"
            }

        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router or not router.avdecc_entity:
            return {
                "enabled": False,
                "entities": [],
                "error": "AVDECC entity not initialized"
            }

        # Get discovered entities from AVDECC
        entities = await asyncio.to_thread(
            router.avdecc_entity.getDiscoveredEntities
        )

        entities_list = [
            {
                "entity_id": format(e.entity_id, '016x'),
                "entity_model_id": format(e.entity_model_id, '016x'),
                "entity_name": e.entity_name,
                "firmware_version": e.firmware_version,
                "mac_address": ":".join(f"{b:02x}" for b in e.mac_address),
                "capabilities": {
                    "talker_streams": e.talker_stream_sources,
                    "listener_streams": e.listener_stream_sinks,
                    "is_audio_talker": e.isAudioTalker(),
                    "is_audio_listener": e.isAudioListener(),
                    "gptp_supported": e.hasCapability(Avdecc.EntityCapability.GPTP_SUPPORTED)
                },
                "ptp": {
                    "grandmaster_id": format(e.gptp_grandmaster_id, '016x'),
                    "domain": e.gptp_domain_number
                },
                "available": e.available,
                "last_seen": e.last_seen.isoformat()
            }
            for e in entities
        ]

        return {
            "enabled": True,
            "entities": entities_list
        }

    except Exception as e:
        logger.error(f"Error getting AVDECC entities: {e}", exc_info=True)
        return {
            "enabled": False,
            "entities": [],
            "error": f"Internal error: {str(e)}"
        }


@router.get("/avdecc/entities/{entity_id}")
async def get_avdecc_entity(entity_id: str) -> Dict[str, Any]:
    """Get specific AVDECC entity by ID"""
    try:
        if not config_get("avb.avdecc_enabled", False):
            raise HTTPException(status_code=503, detail="AVDECC not enabled")

        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router or not router.avdecc_entity:
            raise HTTPException(status_code=503, detail="AVDECC entity not initialized")

        # Parse entity ID from hex string
        entity_id_int = int(entity_id, 16)

        # Find entity
        entity = await asyncio.to_thread(
            router.avdecc_entity.findEntity,
            entity_id_int
        )

        if not entity:
            raise HTTPException(status_code=404, detail="Entity not found")

        return {
            "entity_id": format(entity.entity_id, '016x'),
            "entity_model_id": format(entity.entity_model_id, '016x'),
            "entity_name": entity.entity_name,
            "firmware_version": entity.firmware_version,
            "mac_address": ":".join(f"{b:02x}" for b in entity.mac_address),
            "capabilities": {
                "talker_streams": entity.talker_stream_sources,
                "listener_streams": entity.listener_stream_sinks,
                "is_audio_talker": entity.isAudioTalker(),
                "is_audio_listener": entity.isAudioListener()
            },
            "available": entity.available
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting AVDECC entity: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/avdecc/stats")
async def get_avdecc_stats() -> Dict[str, Any]:
    """Get AVDECC protocol statistics"""
    try:
        if not config_get("avb.avdecc_enabled", False):
            return {
                "enabled": False,
                "error": "AVDECC not enabled"
            }

        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router or not router.avdecc_entity:
            return {
                "enabled": False,
                "error": "AVDECC entity not initialized"
            }

        stats = await asyncio.to_thread(router.avdecc_entity.getStats)

        return {
            "enabled": True,
            "adp": {
                "messages_sent": stats.adp_messages_sent,
                "messages_received": stats.adp_messages_received
            },
            "acmp": {
                "messages_sent": stats.acmp_messages_sent,
                "messages_received": stats.acmp_messages_received
            },
            "aecp": {
                "messages_sent": stats.aecp_messages_sent,
                "messages_received": stats.aecp_messages_received
            },
            "entities_discovered": stats.entities_discovered,
            "connections_active": stats.connections_active
        }

    except Exception as e:
        logger.error(f"Error getting AVDECC stats: {e}", exc_info=True)
        return {
            "enabled": False,
            "error": f"Internal error: {str(e)}"
        }


# ============================================================================
# Routing Matrix Endpoints
# ============================================================================

@router.get("/router/endpoints")
async def get_router_endpoints(direction: Optional[str] = None) -> Dict[str, Any]:
    """
    Get all audio endpoints (talkers and listeners).

    Query params:
        direction: Optional filter ("talker" or "listener")

    Returns:
        List of AudioEndpoint objects
    """
    try:
        from app.services.avb.avb_router import get_avb_router, StreamDirection

        router = get_avb_router()

        if not router:
            return {
                "endpoints": [],
                "error": "Router not initialized"
            }

        # Parse direction filter
        dir_filter = None
        if direction:
            dir_filter = StreamDirection(direction.lower())

        endpoints = router.get_endpoints(dir_filter)

        endpoints_list = [
            {
                "endpoint_id": ep.endpoint_id(),
                "entity_id": ep.entity_id,
                "unique_id": ep.unique_id,
                "direction": ep.direction.value,
                "device_type": ep.device_type,
                "device_name": ep.device_name,
                "channels": ep.channels,
                "sample_rate": ep.sample_rate,
                "format": ep.format,
                "mac_address": ep.mac_address,
                "node_address": ep.node_address,
                "available": ep.available,
                "last_seen": ep.last_seen.isoformat()
            }
            for ep in endpoints
        ]

        return {
            "endpoints": endpoints_list,
            "count": len(endpoints_list)
        }

    except Exception as e:
        logger.error(f"Error getting router endpoints: {e}", exc_info=True)
        return {
            "endpoints": [],
            "error": f"Internal error: {str(e)}"
        }


@router.get("/router/connections")
async def get_router_connections() -> Dict[str, Any]:
    """
    Get all active stream connections.

    Returns:
        List of StreamConnection objects
    """
    try:
        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router:
            return {
                "connections": [],
                "error": "Router not initialized"
            }

        connections = router.get_connections()

        connections_list = [
            {
                "connection_id": conn.connection_id(),
                "talker": {
                    "endpoint_id": conn.talker.endpoint_id(),
                    "device_name": conn.talker.device_name,
                    "channels": conn.talker.channels,
                    "sample_rate": conn.talker.sample_rate
                },
                "listener": {
                    "endpoint_id": conn.listener.endpoint_id(),
                    "device_name": conn.listener.device_name,
                    "channels": conn.listener.channels,
                    "sample_rate": conn.listener.sample_rate
                },
                "state": conn.state.value,
                "established_time": conn.established_time.isoformat() if conn.established_time else None,
                "error_message": conn.error_message
            }
            for conn in connections
        ]

        return {
            "connections": connections_list,
            "count": len(connections_list)
        }

    except Exception as e:
        logger.error(f"Error getting router connections: {e}", exc_info=True)
        return {
            "connections": [],
            "error": f"Internal error: {str(e)}"
        }


@router.get("/router/matrix")
async def get_routing_matrix() -> Dict[str, Any]:
    """
    Get routing matrix showing all possible connections.

    Returns:
        Dict[talker_id, Dict[listener_id, ConnectionState or None]]
    """
    try:
        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router:
            return {
                "matrix": {},
                "error": "Router not initialized"
            }

        matrix = router.get_routing_matrix()

        # Convert enum values to strings
        matrix_serializable = {
            talker_id: {
                listener_id: state.value if state else None
                for listener_id, state in listeners.items()
            }
            for talker_id, listeners in matrix.items()
        }

        return {
            "matrix": matrix_serializable,
            "talker_count": len(matrix),
            "listener_count": len(next(iter(matrix.values()), {}))
        }

    except Exception as e:
        logger.error(f"Error getting routing matrix: {e}", exc_info=True)
        return {
            "matrix": {},
            "error": f"Internal error: {str(e)}"
        }


@router.post("/router/connect")
async def connect_streams(connection_request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Connect talker to listener.

    Body:
        {
            "talker_id": "001122fffe334455:0",
            "listener_id": "667788fffe99aabb:1"
        }

    Returns:
        Connection result
    """
    try:
        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router:
            raise HTTPException(status_code=503, detail="Router not initialized")

        talker_id = connection_request.get("talker_id")
        listener_id = connection_request.get("listener_id")

        if not talker_id or not listener_id:
            raise HTTPException(status_code=400, detail="Missing talker_id or listener_id")

        success = await router.connect(talker_id, listener_id)

        if not success:
            raise HTTPException(status_code=500, detail="Connection failed")

        return {
            "success": True,
            "connection_id": f"{talker_id}→{listener_id}",
            "message": "Stream connected successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error connecting streams: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/router/disconnect")
async def disconnect_streams(disconnection_request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Disconnect talker from listener.

    Body:
        {
            "talker_id": "001122fffe334455:0",
            "listener_id": "667788fffe99aabb:1"
        }

    Returns:
        Disconnection result
    """
    try:
        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router:
            raise HTTPException(status_code=503, detail="Router not initialized")

        talker_id = disconnection_request.get("talker_id")
        listener_id = disconnection_request.get("listener_id")

        if not talker_id or not listener_id:
            raise HTTPException(status_code=400, detail="Missing talker_id or listener_id")

        success = await router.disconnect(talker_id, listener_id)

        if not success:
            raise HTTPException(status_code=404, detail="Connection not found or disconnect failed")

        return {
            "success": True,
            "message": "Stream disconnected successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error disconnecting streams: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/router/stats")
async def get_router_stats() -> Dict[str, Any]:
    """Get routing matrix statistics"""
    try:
        from app.services.avb.avb_router import get_avb_router

        router = get_avb_router()

        if not router:
            return {
                "error": "Router not initialized"
            }

        stats = router.get_stats()

        return stats

    except Exception as e:
        logger.error(f"Error getting router stats: {e}", exc_info=True)
        return {
            "error": f"Internal error: {str(e)}"
        }


# ============================================================================
# AVDECC Entity Model Endpoints (Phase 10)
# ============================================================================

@router.get("/avdecc/entities/{entity_id}/model")
async def get_entity_model(entity_id: str) -> Dict[str, Any]:
    """
    Get complete AVDECC entity model (descriptor tree).

    Returns enumerated entity model with all descriptors:
    - Entity descriptor (name, capabilities, etc.)
    - Configuration descriptors
    - Stream Input/Output descriptors
    - AVB Interface descriptors
    - Clock Source descriptors
    - Audio Unit descriptors

    Args:
        entity_id: Entity ID in hex format (e.g., "001b21fffe0102ab")

    Returns:
        Dict with:
        - entity_id: str (entity ID in hex)
        - model: dict (complete descriptor tree) if enumerated
        - complete: bool (true if enumeration finished successfully)
        - missing: list of missing descriptor types (if incomplete)
        - cached: bool (true if served from cache)
        - error: str (error message if unavailable)

    Raises:
        HTTPException 503: If AVDECC not available
        HTTPException 404: If entity not found or not enumerated
    """
    try:
        # Check if AVDECC is enabled
        if not config_get("avdecc.enabled", False):
            raise HTTPException(
                status_code=503,
                detail="AVDECC not enabled in configuration"
            )

        # Check if AVDECC is available
        if not is_avb_available():
            raise HTTPException(
                status_code=503,
                detail="AVDECC hardware not available"
            )

        # Parse entity ID from hex
        try:
            entity_id_int = int(entity_id, 16)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid entity ID format: {entity_id} (expected hex)"
            )

        # Get entity model via Python bindings
        from app.services.juce_engine_service import get_juce_engine
        import map2_audio_engine

        engine = get_juce_engine()
        if not engine:
            raise HTTPException(
                status_code=503,
                detail="Audio engine not available"
            )

        # Check if AVDECC is available (compile-time check)
        if not map2_audio_engine.is_avdecc_available():
            raise HTTPException(
                status_code=503,
                detail="AVDECC not compiled (USE_AVDECC=OFF)"
            )

        # Get entity model (currently placeholder - returns None)
        model_json = await asyncio.to_thread(
            map2_audio_engine.get_avdecc_entity_model,
            entity_id_int
        )

        if model_json is None:
            # Entity not found or not enumerated yet
            # Check if entity exists in discovered list
            entities = await asyncio.to_thread(map2_audio_engine.get_avdecc_entities)

            # For now, return placeholder indicating entity not found
            raise HTTPException(
                status_code=404,
                detail=f"Entity {entity_id} not found or not enumerated. "
                       f"Note: Full AVDECC integration pending (Map2AudioEngine.getAvdeccEntity() required)"
            )

        # Return model with metadata
        return {
            "entity_id": entity_id,
            "model": model_json,
            "complete": True,  # TODO: Get from model.isComplete() when available
            "missing": [],      # TODO: Get from model.getMissingDescriptors() when available
            "cached": False     # TODO: Check AEM cache when integration complete
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting entity model: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/avdecc/cache/stats")
async def get_aem_cache_stats() -> Dict[str, Any]:
    """
    Get AEM (Entity Model) cache statistics.

    Returns cache performance metrics including hit rate, entry count, etc.

    Returns:
        Dict with cache statistics:
        - hit_count: int
        - miss_count: int
        - total_requests: int
        - hit_rate_percent: float
        - entry_count: int
        - max_entries: int
        - cache_full: bool
        - enumeration_time_avg_ms: float
        - last_cleanup: datetime
        - cleanup_age_days: int
    """
    try:
        from app.services.avb.aem_cache import get_aem_cache

        cache = get_aem_cache()
        stats = await asyncio.to_thread(cache.get_stats)

        return stats

    except Exception as e:
        logger.error(f"Error getting AEM cache stats: {e}", exc_info=True)
        return {
            "error": f"Internal error: {str(e)}"
        }

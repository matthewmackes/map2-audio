"""
AVB Stream Routing Matrix

Manages N-to-M talker-to-listener stream connections across AVB network.
Supports both MAP2-to-MAP2 (mDNS) and third-party AVDECC devices.

Architecture:
- MAP2 nodes: Use internal stream management API
- AVDECC devices: Use IEEE 1722.1 ACMP protocol
- Routing matrix tracks all possible connections
- Auto-discovery populates available talkers/listeners
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional, Set, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum

logger = logging.getLogger(__name__)


class StreamDirection(str, Enum):
    """Stream direction enum"""
    TALKER = "talker"
    LISTENER = "listener"


class ConnectionState(str, Enum):
    """Connection state enum"""
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    DISCONNECTING = "disconnecting"
    ERROR = "error"


@dataclass
class AudioEndpoint:
    """Represents an AVB audio endpoint (talker or listener)"""
    entity_id: str  # Hex string (e.g., "001122fffe334455")
    unique_id: int  # Stream unique ID (0-65535)
    direction: StreamDirection
    device_type: str  # "map2", "avdecc", "unknown"
    device_name: str
    channels: int
    sample_rate: int
    format: str = "24-bit PCM"  # Audio format
    mac_address: Optional[str] = None  # For AVDECC devices
    node_address: Optional[str] = None  # For MAP2 nodes (http://...)
    available: bool = True
    last_seen: datetime = field(default_factory=datetime.now)

    def endpoint_id(self) -> str:
        """Unique identifier for this endpoint"""
        return f"{self.entity_id}:{self.unique_id}"


@dataclass
class StreamConnection:
    """Represents a talker-to-listener connection"""
    talker: AudioEndpoint
    listener: AudioEndpoint
    state: ConnectionState = ConnectionState.DISCONNECTED
    established_time: Optional[datetime] = None
    error_message: Optional[str] = None
    connection_count: int = 0  # ACMP connection count

    def connection_id(self) -> str:
        """Unique identifier for this connection"""
        return f"{self.talker.endpoint_id()}→{self.listener.endpoint_id()}"


class AvbRouter:
    """
    AVB Stream Routing Matrix

    Manages stream connections between talkers and listeners.
    Supports MAP2 nodes and AVDECC third-party devices.
    """

    def __init__(self, engine_service=None, avdecc_entity=None):
        """
        Initialize router.

        Args:
            engine_service: JuceEngineService for MAP2 stream management
            avdecc_entity: AvdeccEntity C++ wrapper for AVDECC protocol
        """
        self.engine_service = engine_service
        self.avdecc_entity = avdecc_entity

        self.endpoints: Dict[str, AudioEndpoint] = {}  # endpoint_id -> AudioEndpoint
        self.connections: Dict[str, StreamConnection] = {}  # connection_id -> StreamConnection

        self._discovery_task: Optional[asyncio.Task] = None
        self._cleanup_task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self):
        """Start router services"""
        if self._running:
            return

        self._running = True

        # Start discovery
        self._discovery_task = asyncio.create_task(self._discovery_loop())

        # Start cleanup (remove stale endpoints)
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())

        logger.info("AVB Router started")

    async def stop(self):
        """Stop router services"""
        if not self._running:
            return

        self._running = False

        if self._discovery_task:
            self._discovery_task.cancel()
            try:
                await self._discovery_task
            except asyncio.CancelledError:
                pass

        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass

        logger.info("AVB Router stopped")

    # ========================================================================
    # Discovery
    # ========================================================================

    async def _discovery_loop(self):
        """Periodically discover endpoints"""
        while self._running:
            try:
                await self._discover_map2_endpoints()
                await self._discover_avdecc_endpoints()
            except Exception as e:
                logger.error(f"Discovery error: {e}")

            await asyncio.sleep(5)  # Discovery every 5 seconds

    async def _discover_map2_endpoints(self):
        """Discover MAP2 nodes via existing mDNS discovery"""
        if not self.engine_service:
            return

        try:
            # Query cluster nodes
            # (Assumes cluster has discovery service integrated)
            # For now, placeholder - would integrate with existing MAP2 discovery

            # Example: Get nodes from cluster manager
            # nodes = await cluster_manager.get_nodes()
            # for node in nodes:
            #     if node.avb_enabled:
            #         await self._register_map2_node(node)

            pass
        except Exception as e:
            logger.error(f"MAP2 discovery error: {e}")

    async def _discover_avdecc_endpoints(self):
        """Discover AVDECC devices via ADP"""
        if not self.avdecc_entity:
            return

        try:
            # Get discovered entities from AVDECC
            entities = await asyncio.to_thread(
                self.avdecc_entity.getDiscoveredEntities
            )

            for entity in entities:
                if not entity.available:
                    continue

                entity_id_str = format(entity.entity_id, '016x')

                # Register talker endpoints
                for i in range(entity.talker_stream_sources):
                    endpoint = AudioEndpoint(
                        entity_id=entity_id_str,
                        unique_id=i,
                        direction=StreamDirection.TALKER,
                        device_type="avdecc",
                        device_name=entity.entity_name or f"AVDECC-{entity_id_str[:8]}",
                        channels=2,  # Default, would query via AECP
                        sample_rate=48000,  # Default
                        mac_address=":".join(f"{b:02x}" for b in entity.mac_address),
                        last_seen=datetime.now()
                    )
                    self.endpoints[endpoint.endpoint_id()] = endpoint

                # Register listener endpoints
                for i in range(entity.listener_stream_sinks):
                    endpoint = AudioEndpoint(
                        entity_id=entity_id_str,
                        unique_id=i,
                        direction=StreamDirection.LISTENER,
                        device_type="avdecc",
                        device_name=entity.entity_name or f"AVDECC-{entity_id_str[:8]}",
                        channels=2,
                        sample_rate=48000,
                        mac_address=":".join(f"{b:02x}" for b in entity.mac_address),
                        last_seen=datetime.now()
                    )
                    self.endpoints[endpoint.endpoint_id()] = endpoint

        except Exception as e:
            logger.error(f"AVDECC discovery error: {e}")

    async def _cleanup_loop(self):
        """Remove stale endpoints"""
        while self._running:
            await asyncio.sleep(30)  # Cleanup every 30 seconds

            try:
                now = datetime.now()
                stale_threshold = timedelta(seconds=60)

                stale_endpoints = [
                    endpoint_id
                    for endpoint_id, endpoint in self.endpoints.items()
                    if now - endpoint.last_seen > stale_threshold
                ]

                for endpoint_id in stale_endpoints:
                    logger.info(f"Removing stale endpoint: {endpoint_id}")
                    del self.endpoints[endpoint_id]

            except Exception as e:
                logger.error(f"Cleanup error: {e}")

    # ========================================================================
    # Connection Management
    # ========================================================================

    async def connect(self, talker_id: str, listener_id: str) -> bool:
        """
        Connect talker to listener.

        Args:
            talker_id: Talker endpoint ID (entity_id:unique_id)
            listener_id: Listener endpoint ID (entity_id:unique_id)

        Returns:
            True if connection initiated successfully
        """
        talker = self.endpoints.get(talker_id)
        listener = self.endpoints.get(listener_id)

        if not talker or not listener:
            logger.error(f"Endpoint not found: talker={talker_id}, listener={listener_id}")
            return False

        if talker.direction != StreamDirection.TALKER:
            logger.error(f"Not a talker: {talker_id}")
            return False

        if listener.direction != StreamDirection.LISTENER:
            logger.error(f"Not a listener: {listener_id}")
            return False

        # Create connection
        connection = StreamConnection(
            talker=talker,
            listener=listener,
            state=ConnectionState.CONNECTING
        )

        conn_id = connection.connection_id()
        self.connections[conn_id] = connection

        # Dispatch to appropriate handler
        if talker.device_type == "map2" and listener.device_type == "map2":
            success = await self._connect_map2_to_map2(connection)
        elif talker.device_type == "avdecc" or listener.device_type == "avdecc":
            success = await self._connect_via_avdecc(connection)
        else:
            logger.error(f"Unsupported connection type: {talker.device_type} → {listener.device_type}")
            success = False

        if success:
            connection.state = ConnectionState.CONNECTED
            connection.established_time = datetime.now()
            logger.info(f"Connected: {conn_id}")
        else:
            connection.state = ConnectionState.ERROR
            connection.error_message = "Connection failed"
            logger.error(f"Connection failed: {conn_id}")

        return success

    async def disconnect(self, talker_id: str, listener_id: str) -> bool:
        """
        Disconnect talker from listener.

        Args:
            talker_id: Talker endpoint ID
            listener_id: Listener endpoint ID

        Returns:
            True if disconnection successful
        """
        conn_id = f"{talker_id}→{listener_id}"
        connection = self.connections.get(conn_id)

        if not connection:
            logger.warning(f"Connection not found: {conn_id}")
            return False

        connection.state = ConnectionState.DISCONNECTING

        # Dispatch to appropriate handler
        if connection.talker.device_type == "map2" and connection.listener.device_type == "map2":
            success = await self._disconnect_map2_to_map2(connection)
        elif connection.talker.device_type == "avdecc" or connection.listener.device_type == "avdecc":
            success = await self._disconnect_via_avdecc(connection)
        else:
            success = False

        if success:
            del self.connections[conn_id]
            logger.info(f"Disconnected: {conn_id}")
        else:
            connection.state = ConnectionState.ERROR
            connection.error_message = "Disconnection failed"
            logger.error(f"Disconnection failed: {conn_id}")

        return success

    # ========================================================================
    # MAP2-to-MAP2 Connections
    # ========================================================================

    async def _connect_map2_to_map2(self, connection: StreamConnection) -> bool:
        """Connect two MAP2 nodes directly"""
        if not self.engine_service:
            return False

        try:
            # Use internal MAP2 stream management
            # This would use the existing AvbStream C++ layer
            # Talker creates output stream, listener creates input stream

            talker_config = {
                "stream_id": f"map2-{connection.talker.entity_id}-{connection.talker.unique_id}",
                "direction": "talker",
                "channels": connection.talker.channels,
                "sample_rate": connection.talker.sample_rate,
                "destination_mac": connection.listener.mac_address or "91:e0:f0:00:fe:01"
            }

            listener_config = {
                "stream_id": f"map2-{connection.listener.entity_id}-{connection.listener.unique_id}",
                "direction": "listener",
                "channels": connection.listener.channels,
                "sample_rate": connection.listener.sample_rate,
                "source_mac": connection.talker.mac_address or "00:00:00:00:00:00"
            }

            # Create streams via engine service
            # (Placeholder - actual implementation would use engine API)
            # await self.engine_service.create_avb_stream(talker_config)
            # await self.engine_service.create_avb_stream(listener_config)

            return True

        except Exception as e:
            logger.error(f"MAP2-to-MAP2 connection error: {e}")
            return False

    async def _disconnect_map2_to_map2(self, connection: StreamConnection) -> bool:
        """Disconnect two MAP2 nodes"""
        if not self.engine_service:
            return False

        try:
            # Delete streams
            # await self.engine_service.delete_avb_stream(talker_stream_id)
            # await self.engine_service.delete_avb_stream(listener_stream_id)

            return True

        except Exception as e:
            logger.error(f"MAP2-to-MAP2 disconnection error: {e}")
            return False

    # ========================================================================
    # AVDECC Connections
    # ========================================================================

    async def _connect_via_avdecc(self, connection: StreamConnection) -> bool:
        """Connect using AVDECC ACMP protocol"""
        if not self.avdecc_entity:
            return False

        try:
            talker_entity_id = int(connection.talker.entity_id, 16)
            listener_entity_id = int(connection.listener.entity_id, 16)

            # Send ACMP CONNECT_TX_COMMAND
            success = await asyncio.to_thread(
                self.avdecc_entity.connectStream,
                talker_entity_id,
                connection.talker.unique_id,
                listener_entity_id,
                connection.listener.unique_id
            )

            return success

        except Exception as e:
            logger.error(f"AVDECC connection error: {e}")
            return False

    async def _disconnect_via_avdecc(self, connection: StreamConnection) -> bool:
        """Disconnect using AVDECC ACMP protocol"""
        if not self.avdecc_entity:
            return False

        try:
            talker_entity_id = int(connection.talker.entity_id, 16)
            listener_entity_id = int(connection.listener.entity_id, 16)

            # Send ACMP DISCONNECT_TX_COMMAND
            success = await asyncio.to_thread(
                self.avdecc_entity.disconnectStream,
                talker_entity_id,
                connection.talker.unique_id,
                listener_entity_id,
                connection.listener.unique_id
            )

            return success

        except Exception as e:
            logger.error(f"AVDECC disconnection error: {e}")
            return False

    # ========================================================================
    # Query Methods
    # ========================================================================

    def get_endpoints(self, direction: Optional[StreamDirection] = None) -> List[AudioEndpoint]:
        """Get all endpoints, optionally filtered by direction"""
        if direction:
            return [ep for ep in self.endpoints.values() if ep.direction == direction]
        return list(self.endpoints.values())

    def get_talkers(self) -> List[AudioEndpoint]:
        """Get all talker endpoints"""
        return self.get_endpoints(StreamDirection.TALKER)

    def get_listeners(self) -> List[AudioEndpoint]:
        """Get all listener endpoints"""
        return self.get_endpoints(StreamDirection.LISTENER)

    def get_connections(self) -> List[StreamConnection]:
        """Get all active connections"""
        return list(self.connections.values())

    def get_routing_matrix(self) -> Dict[str, Dict[str, Optional[ConnectionState]]]:
        """
        Get routing matrix showing all possible connections.

        Returns:
            Dict[talker_id, Dict[listener_id, ConnectionState or None]]
        """
        matrix: Dict[str, Dict[str, Optional[ConnectionState]]] = {}

        talkers = self.get_talkers()
        listeners = self.get_listeners()

        for talker in talkers:
            matrix[talker.endpoint_id()] = {}
            for listener in listeners:
                conn_id = f"{talker.endpoint_id()}→{listener.endpoint_id()}"
                connection = self.connections.get(conn_id)
                matrix[talker.endpoint_id()][listener.endpoint_id()] = (
                    connection.state if connection else None
                )

        return matrix

    def get_stats(self) -> Dict:
        """Get router statistics"""
        return {
            "endpoints": {
                "total": len(self.endpoints),
                "talkers": len(self.get_talkers()),
                "listeners": len(self.get_listeners()),
                "map2": len([ep for ep in self.endpoints.values() if ep.device_type == "map2"]),
                "avdecc": len([ep for ep in self.endpoints.values() if ep.device_type == "avdecc"])
            },
            "connections": {
                "total": len(self.connections),
                "connected": len([c for c in self.connections.values() if c.state == ConnectionState.CONNECTED]),
                "connecting": len([c for c in self.connections.values() if c.state == ConnectionState.CONNECTING]),
                "error": len([c for c in self.connections.values() if c.state == ConnectionState.ERROR])
            }
        }


def _extract_avdecc_entity(engine: Any) -> Optional[Any]:
    """
    Resolve AVDECC entity wrapper from a JUCE C++ engine instance.

    The Python binding surface may vary by build, so probe common
    method/attribute names and fail closed.
    """
    if engine is None:
        return None

    candidates = (
        "get_avdecc_entity",
        "getAvdeccEntity",
        "avdecc_entity",
        "avdeccEntity",
    )

    for name in candidates:
        value = getattr(engine, name, None)
        if value is None:
            continue

        if callable(value):
            try:
                entity = value()
            except Exception as exc:
                logger.debug("AVDECC entity resolver %s failed: %s", name, exc)
                continue
            if entity is not None:
                return entity
            continue

        return value

    return None


# Singleton instance
_avb_router: Optional[AvbRouter] = None


def get_avb_router() -> AvbRouter:
    """
    Get singleton AVB router instance.

    Router initialization is intentionally tolerant of missing JUCE/AVDECC
    bindings so API endpoints can still return graceful unavailable states.
    """
    global _avb_router

    if _avb_router is None:
        engine_service = None
        avdecc_entity = None

        try:
            from app.services.juce_engine_service import get_audio_engine

            engine_service = get_audio_engine()
            engine = getattr(engine_service, "_engine", None)
            avdecc_entity = _extract_avdecc_entity(engine)
        except Exception as exc:
            logger.debug("AVB router initialized without engine bindings: %s", exc)

        _avb_router = AvbRouter(engine_service=engine_service, avdecc_entity=avdecc_entity)
        return _avb_router

    # Late-bind if engine was initialized after router creation.
    try:
        if _avb_router.engine_service is None or _avb_router.avdecc_entity is None:
            from app.services.juce_engine_service import get_audio_engine

            engine_service = get_audio_engine()
            engine = getattr(engine_service, "_engine", None)
            avdecc_entity = _extract_avdecc_entity(engine)

            if _avb_router.engine_service is None:
                _avb_router.engine_service = engine_service
            if _avb_router.avdecc_entity is None and avdecc_entity is not None:
                _avb_router.avdecc_entity = avdecc_entity
    except Exception as exc:
        logger.debug("AVB router late-bind skipped: %s", exc)

    return _avb_router

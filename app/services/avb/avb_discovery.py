"""
AVB/TSN Device Discovery via mDNS

Discovers AVB-capable MAP2 nodes on the local network via mDNS.
Broadcasts AVB-specific capabilities:
- Stream IDs and configurations
- PTP synchronization status
- TSN qdisc availability
- Available talker/listener streams
- AVB interface information

Only runs when avb.enabled=true. Gracefully fails if mDNS unavailable.
"""

import logging
import asyncio
import socket
from typing import Dict, List, Optional
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone

from app.config import config_get
from app.services.cluster.mdns_discovery_enhanced import EnhancedMDNSDiscovery, MDNSNode
from app.services.avb import is_avb_available

logger = logging.getLogger(__name__)


@dataclass
class AvbCapabilities:
    """AVB-specific capabilities to broadcast via mDNS TXT records"""

    interface: str = ""  # AVB network interface (e.g., "enp3s0")
    stream_id: str = ""  # 64-bit stream ID in hex
    ptp_synced: bool = False  # PTP synchronization status
    ptp_offset_ns: float = 0.0  # PTP clock offset (nanoseconds)
    tsn_configured: bool = False  # TSN qdiscs configured
    talker_streams: int = 0  # Number of talker streams
    listener_streams: int = 0  # Number of listener streams
    max_streams: int = 8  # Maximum supported streams
    sample_rate: int = 48000  # Default sample rate
    channels: int = 2  # Default channels

    def to_txt_records(self) -> Dict[str, str]:
        """
        Convert to mDNS TXT record dictionary.

        Note: TXT records have ~255 char limits per record, keep concise.
        """
        return {
            "avb_iface": self.interface[:15],  # Interface name
            "stream_id": self.stream_id[:16],  # Hex stream ID (truncated)
            "ptp_sync": "yes" if self.ptp_synced else "no",
            "ptp_offset": f"{int(self.ptp_offset_ns)}",  # Offset in ns
            "tsn_cfg": "yes" if self.tsn_configured else "no",
            "talkers": str(self.talker_streams),
            "listeners": str(self.listener_streams),
            "max_streams": str(self.max_streams),
            "sr": str(self.sample_rate),  # Sample rate
            "ch": str(self.channels),  # Channels
        }


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class AvbNode:
    """Discovered AVB node information"""

    node_id: str  # e.g., "AVB-NODE-a1b2"
    hostname: str
    addresses: List[str] = field(default_factory=list)  # IPv4/IPv6 addresses
    port: int = 8000
    avb_capabilities: Optional[AvbCapabilities] = None
    last_seen: datetime = field(default_factory=_utcnow)

    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        result = asdict(self)
        result["last_seen"] = self.last_seen.isoformat()
        if self.avb_capabilities:
            result["avb_capabilities"] = asdict(self.avb_capabilities)
        return result


class AvbDiscoveryService:
    """
    AVB device discovery service using mDNS.

    Discovers MAP2 nodes with AVB capabilities via _map2-avb._tcp service type.
    Only runs when AVB is enabled in configuration.
    """

    def __init__(self):
        """Initialize AVB discovery service"""
        self.enabled = config_get("avb.enabled", False)
        self.mdns_discovery: Optional[EnhancedMDNSDiscovery] = None
        self.discovered_avb_nodes: Dict[str, AvbNode] = {}
        self._zeroconf = None
        self._zeroconf_mod = None
        self._service_info = None
        self._service_name: Optional[str] = None
        self.logger = logging.getLogger(__name__)

        if self.enabled:
            try:
                # Create mDNS discovery with AVB-specific service type
                self.mdns_discovery = EnhancedMDNSDiscovery(
                    service_type="_map2-avb._tcp.local.",
                    cache_timeout=120
                )
                self.logger.info("AVB discovery service initialized")
            except Exception as e:
                self.logger.warning(f"Failed to initialize AVB discovery: {e}")
                self.enabled = False
        else:
            self.logger.debug("AVB discovery disabled (avb.enabled=false)")

    def is_enabled(self) -> bool:
        """Check if AVB discovery is enabled and available"""
        return self.enabled and self.mdns_discovery is not None

    @staticmethod
    def _try_sync_status(coro):
        """
        Run async status coroutine only when no event loop is active.

        Returns None if called from an active event loop to avoid RuntimeError.
        """
        try:
            asyncio.get_running_loop()
            try:
                coro.close()
            except Exception:
                pass
        except RuntimeError:
            try:
                return asyncio.run(coro)
            except Exception:
                return None
        return None

    def get_local_capabilities(self) -> Optional[AvbCapabilities]:
        """
        Get local node's AVB capabilities.

        Returns:
            AvbCapabilities if AVB available, None otherwise
        """
        if not is_avb_available():
            return None

        try:
            # Import here to avoid circular dependency
            from app.services.avb.ptp_monitor import get_ptp_monitor
            from app.services.avb.tsn_qdisc import get_tsn_qdisc_manager
            from app.services.avb.avb_service import get_avb_service

            # Get PTP status
            ptp_monitor = get_ptp_monitor()
            ptp_status = ptp_monitor.last_status
            if ptp_status is None:
                ptp_status = self._try_sync_status(ptp_monitor.get_status())

            # Get TSN status
            tsn_manager = get_tsn_qdisc_manager()
            tsn_status = tsn_manager.last_status
            if tsn_status is None:
                tsn_status = self._try_sync_status(tsn_manager.get_status())

            # Get stream counts
            avb_service = get_avb_service()
            streams = avb_service.get_all_streams()
            talkers = sum(1 for s in streams if s.get("direction") == "talker")
            listeners = sum(1 for s in streams if s.get("direction") == "listener")

            # Build capabilities
            capabilities = AvbCapabilities(
                interface=config_get("avb.interface", ""),
                stream_id=hex(config_get("avb.stream_id", 0))[2:],  # Remove '0x' prefix
                ptp_synced=ptp_status.available if ptp_status else False,
                ptp_offset_ns=ptp_status.offset_ns if ptp_status and ptp_status.available else 0.0,
                tsn_configured=tsn_status.available if tsn_status else False,
                talker_streams=talkers,
                listener_streams=listeners,
                max_streams=config_get("avb.max_streams", 8),
                sample_rate=config_get("audio.sample_rate", 48000),
                channels=config_get("audio.input_channels", 2),
            )

            return capabilities

        except Exception as e:
            self.logger.error(f"Failed to get local AVB capabilities: {e}")
            return None

    def _ensure_zeroconf(self) -> bool:
        """Initialize zeroconf publisher on first use."""
        if self._zeroconf is not None and self._zeroconf_mod is not None:
            return True

        try:
            import zeroconf  # type: ignore

            self._zeroconf_mod = zeroconf
            self._zeroconf = zeroconf.Zeroconf()
            return True
        except ImportError:
            self.logger.debug("zeroconf package not installed; external AVB mDNS advertisement disabled")
            return False
        except Exception as e:
            self.logger.warning(f"Failed to initialize zeroconf publisher: {e}")
            return False

    def _register_local_advertisement(
        self,
        node_id: str,
        hostname: str,
        port: int,
        addresses: List[str],
        txt_records: Dict[str, str],
    ) -> bool:
        """Register/update this node's AVB service on mDNS via zeroconf."""
        if not self._ensure_zeroconf():
            return False

        try:
            assert self._zeroconf_mod is not None
            assert self._zeroconf is not None

            service_type = "_map2-avb._tcp.local."
            service_name = f"{node_id}.{service_type}"

            ipv4_addr = next((addr for addr in addresses if "." in addr), None)
            if not ipv4_addr:
                try:
                    ipv4_addr = socket.gethostbyname(hostname)
                except Exception:
                    ipv4_addr = "127.0.0.1"

            properties = {
                k.encode("utf-8"): str(v).encode("utf-8")
                for k, v in txt_records.items()
            }

            server_name = hostname if hostname.endswith(".local.") else f"{hostname}.local."

            service_info = self._zeroconf_mod.ServiceInfo(
                service_type,
                service_name,
                addresses=[socket.inet_aton(ipv4_addr)],
                port=port,
                properties=properties,
                server=server_name,
            )

            if self._service_info is None:
                self._zeroconf.register_service(service_info)
                self.logger.info("Registered AVB mDNS service %s on %s:%s", service_name, ipv4_addr, port)
            else:
                if self._service_name != service_name:
                    self._zeroconf.unregister_service(self._service_info)
                    self._zeroconf.register_service(service_info)
                else:
                    self._zeroconf.update_service(service_info)
                self.logger.debug("Updated AVB mDNS service %s", service_name)

            self._service_info = service_info
            self._service_name = service_name
            return True
        except Exception as e:
            self.logger.warning(f"Failed to register AVB mDNS service: {e}")
            return False

    def shutdown(self) -> None:
        """Release local mDNS advertisement resources."""
        try:
            if self._zeroconf is not None and self._service_info is not None:
                self._zeroconf.unregister_service(self._service_info)
        except Exception as e:
            self.logger.debug(f"Failed to unregister AVB mDNS service: {e}")
        finally:
            try:
                if self._zeroconf is not None:
                    self._zeroconf.close()
            except Exception as e:
                self.logger.debug(f"Failed to close zeroconf publisher: {e}")
            self._zeroconf = None
            self._zeroconf_mod = None
            self._service_info = None
            self._service_name = None

    def broadcast_local_node(self, node_id: str, hostname: str, port: int = 8000) -> bool:
        """
        Broadcast this node's AVB capabilities via mDNS.

        Args:
            node_id: Unique node identifier
            hostname: Node hostname
            port: Service port

        Returns:
            True if broadcast successful, False otherwise
        """
        if not self.is_enabled():
            return False

        try:
            capabilities = self.get_local_capabilities()
            if not capabilities:
                self.logger.warning("No AVB capabilities to broadcast")
                return False

            # Convert to TXT records
            txt_records = capabilities.to_txt_records()
            txt_records["node_id"] = node_id
            txt_records["hostname"] = hostname

            addresses: List[str] = []
            if self.mdns_discovery:
                addresses = self.mdns_discovery.get_local_addresses()
            if not addresses:
                addresses = ["127.0.0.1"]

            # Register local node in discovery caches so AVB endpoints and
            # router discovery have concrete data even without external mDNS tooling.
            node = self.add_discovered_node(
                node_id=node_id,
                hostname=hostname,
                addresses=addresses,
                txt_records=txt_records,
                port=port,
            )
            if not node:
                return False

            # Best-effort external network advertisement; fallback cache registration
            # above already keeps local routing/discovery functional.
            self._register_local_advertisement(
                node_id=node_id,
                hostname=hostname,
                port=port,
                addresses=addresses,
                txt_records=txt_records,
            )

            self.logger.info(
                "Broadcasted AVB capabilities for %s on %s:%s",
                node_id,
                addresses[0],
                port,
            )

            return True

        except Exception as e:
            self.logger.error(f"Failed to broadcast AVB capabilities: {e}")
            return False

    def add_discovered_node(
        self,
        node_id: str,
        hostname: str,
        addresses: List[str],
        txt_records: Dict[str, str],
        port: int = 8000
    ) -> Optional[AvbNode]:
        """
        Add or update a discovered AVB node.

        Args:
            node_id: Node identifier
            hostname: Hostname of the node
            addresses: List of IP addresses
            txt_records: mDNS TXT records with AVB capabilities
            port: Service port

        Returns:
            AvbNode object or None on error
        """
        try:
            # Parse AVB capabilities from TXT records
            capabilities = self._parse_avb_capabilities(txt_records)

            # Create/update node
            node = AvbNode(
                node_id=node_id,
                hostname=hostname,
                addresses=addresses,
                port=port,
                avb_capabilities=capabilities,
                last_seen=_utcnow()
            )

            self.discovered_avb_nodes[node_id] = node

            # Also add to underlying mDNS discovery
            if self.mdns_discovery:
                self.mdns_discovery.add_discovered_node(
                    node_id=node_id,
                    hostname=hostname,
                    addresses=addresses,
                    txt_records=txt_records,
                    port=port
                )

            self.logger.info(
                f"Discovered AVB node: {node_id} at {addresses[0] if addresses else 'unknown'}"
            )
            return node

        except Exception as e:
            self.logger.error(f"Failed to add discovered AVB node {node_id}: {e}")
            return None

    def _parse_avb_capabilities(self, txt_records: Dict[str, str]) -> Optional[AvbCapabilities]:
        """Parse TXT records to extract AVB capabilities"""
        try:
            return AvbCapabilities(
                interface=txt_records.get("avb_iface", ""),
                stream_id=txt_records.get("stream_id", ""),
                ptp_synced=txt_records.get("ptp_sync", "no").lower() == "yes",
                ptp_offset_ns=float(txt_records.get("ptp_offset", "0")),
                tsn_configured=txt_records.get("tsn_cfg", "no").lower() == "yes",
                talker_streams=int(txt_records.get("talkers", "0")),
                listener_streams=int(txt_records.get("listeners", "0")),
                max_streams=int(txt_records.get("max_streams", "8")),
                sample_rate=int(txt_records.get("sr", "48000")),
                channels=int(txt_records.get("ch", "2")),
            )
        except Exception as e:
            self.logger.warning(f"Failed to parse AVB capabilities: {e}")
            return None

    def get_discovered_nodes(self) -> List[AvbNode]:
        """
        Get list of discovered AVB nodes.

        Returns:
            List of AvbNode objects (online nodes only)
        """
        if not self.is_enabled():
            return []

        # Filter online nodes (last seen within 120 seconds)
        now = _utcnow()
        online_nodes = []

        for node in self.discovered_avb_nodes.values():
            age = (now - node.last_seen).total_seconds()
            if age < 120:  # 2 minutes timeout
                online_nodes.append(node)

        return online_nodes

    def get_discovered_node(self, node_id: str) -> Optional[AvbNode]:
        """Get a specific discovered AVB node by ID"""
        node = self.discovered_avb_nodes.get(node_id)
        if node:
            age = (_utcnow() - node.last_seen).total_seconds()
            if age < 120:  # Still online
                return node
        return None

    def get_talker_nodes(self) -> List[AvbNode]:
        """Get all discovered nodes that have talker streams"""
        return [
            n for n in self.get_discovered_nodes()
            if n.avb_capabilities and n.avb_capabilities.talker_streams > 0
        ]

    def get_listener_nodes(self) -> List[AvbNode]:
        """Get all discovered nodes that have listener streams"""
        return [
            n for n in self.get_discovered_nodes()
            if n.avb_capabilities and n.avb_capabilities.listener_streams > 0
        ]

    def cleanup_offline_nodes(self) -> int:
        """
        Remove offline nodes from cache.

        Returns:
            Number of nodes removed
        """
        before_count = len(self.discovered_avb_nodes)

        # Keep only online nodes
        now = _utcnow()
        self.discovered_avb_nodes = {
            node_id: node
            for node_id, node in self.discovered_avb_nodes.items()
            if (now - node.last_seen).total_seconds() < 120
        }

        removed = before_count - len(self.discovered_avb_nodes)
        if removed > 0:
            self.logger.info(f"Cleaned up {removed} offline AVB nodes from cache")

        # Also cleanup underlying mDNS discovery
        if self.mdns_discovery:
            self.mdns_discovery.cleanup_offline_nodes()

        return removed

    def get_discovery_summary(self) -> Dict:
        """Get summary of AVB device discovery"""
        nodes = self.get_discovered_nodes()
        return {
            "enabled": self.enabled,
            "total_discovered": len(nodes),
            "talker_nodes": len(self.get_talker_nodes()),
            "listener_nodes": len(self.get_listener_nodes()),
            "nodes": [n.to_dict() for n in nodes]
        }


# Global singleton instance
_avb_discovery_service: Optional[AvbDiscoveryService] = None


def get_avb_discovery_service() -> AvbDiscoveryService:
    """Get or create the AVB discovery service singleton"""
    global _avb_discovery_service
    if _avb_discovery_service is None:
        _avb_discovery_service = AvbDiscoveryService()
    return _avb_discovery_service

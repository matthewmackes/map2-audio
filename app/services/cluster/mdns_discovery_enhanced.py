"""
Enhanced mDNS Discovery Service with Rich Capability Broadcasting

Extends the basic mDNS service to broadcast detailed node capabilities:
- CPU cores and model
- Available RAM
- Audio interfaces
- Kernel version
- Deployment mode
- Management node status
- Health score
- Network connectivity status

Nodes discover each other automatically on local network via Avahi/mDNS.
"""

import json
import logging
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
import socket
import asyncio

logger = logging.getLogger(__name__)


@dataclass
class MDNSCapabilities:
    """Hardware capabilities to broadcast via mDNS TXT records"""

    cpu_cores: int
    cpu_model: str
    memory_gb: int
    audio_interfaces: List[str] = field(default_factory=list)
    storage_gb: int = 0
    kernel_version: str = ""
    has_gpu: bool = False
    midi_inputs: int = 0
    midi_outputs: int = 0

    def to_txt_records(self) -> Dict[str, str]:
        """Convert to mDNS TXT record dictionary (keep values short for TXT record limits)"""
        # TXT records have size limits (~255 chars per record)
        return {
            "cpu_cores": str(self.cpu_cores),
            "cpu_model": self.cpu_model[:30],  # Truncate long names
            "memory_gb": str(self.memory_gb),
            "audio": ",".join(self.audio_interfaces[:3]),  # Up to 3 interfaces
            "storage_gb": str(self.storage_gb),
            "kernel": self.kernel_version[:20],
            "gpu": "yes" if self.has_gpu else "no",
            "midi_in": str(self.midi_inputs),
            "midi_out": str(self.midi_outputs),
        }


@dataclass
class MDNSNode:
    """Discovered node information from mDNS"""

    node_id: str  # e.g., "AUDIO-NODE-a1b2"
    hostname: str
    service_type: str  # "_map2-audio._tcp" or similar
    addresses: List[str] = field(default_factory=list)  # IPv4/IPv6 addresses
    port: int = 8000
    role: str = ""  # AUDIO-NODE, MANAGEMENT-NODE, etc
    health_score: float = 50.0
    is_manager: bool = False
    capabilities: Optional[MDNSCapabilities] = None
    last_seen: datetime = field(default_factory=datetime.utcnow)
    txt_records: Dict[str, str] = field(default_factory=dict)

    def is_online(self, timeout_seconds: int = 60) -> bool:
        """Check if node is still online based on last_seen timestamp"""
        age = datetime.utcnow() - self.last_seen
        return age < timedelta(seconds=timeout_seconds)

    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        result = asdict(self)
        result["last_seen"] = self.last_seen.isoformat()
        if self.capabilities:
            result["capabilities"] = asdict(self.capabilities)
        return result


class EnhancedMDNSDiscovery:
    """
    Enhanced mDNS discovery with capability broadcasting.

    Discovers other MAP2 nodes on the local network and maintains a cache
    of discovered nodes with their capabilities.
    """

    def __init__(
        self,
        service_type: str = "_map2-audio._tcp.local.",
        cache_timeout: int = 120,
    ):
        """
        Initialize enhanced mDNS discovery.

        Args:
            service_type: mDNS service type to advertise
            cache_timeout: Cache timeout for discovered nodes (seconds)
        """
        self.service_type = service_type
        self.cache_timeout = cache_timeout
        self.discovered_nodes: Dict[str, MDNSNode] = {}
        self.logger = logging.getLogger(__name__)

    def get_local_hostname(self) -> str:
        """Get hostname for this machine"""
        try:
            return socket.gethostname()
        except Exception:
            return "unknown"

    def get_local_addresses(self) -> List[str]:
        """Get local IP addresses for this machine"""
        addresses = []
        try:
            # Get hostname
            hostname = socket.gethostname()
            # Get all addresses
            addr_info = socket.getaddrinfo(hostname, None)
            for family, socktype, proto, canonname, sockaddr in addr_info:
                address = sockaddr[0]
                if address not in addresses and not address.startswith("127."):
                    addresses.append(address)
        except Exception as e:
            self.logger.debug(f"Failed to get local addresses: {e}")

        # Fallback to localhost
        if not addresses:
            addresses.append("127.0.0.1")

        return addresses

    def add_discovered_node(
        self,
        node_id: str,
        hostname: str,
        addresses: List[str],
        txt_records: Dict[str, str],
        port: int = 8000,
    ) -> MDNSNode:
        """
        Add or update a discovered node.

        Args:
            node_id: Node identifier
            hostname: Hostname of the node
            addresses: List of IP addresses
            txt_records: mDNS TXT records with capabilities
            port: Service port

        Returns:
            MDNSNode object
        """
        try:
            # Parse TXT records to extract capabilities
            capabilities = self._parse_capabilities(txt_records)

            # Create/update node
            node = MDNSNode(
                node_id=node_id,
                hostname=hostname,
                service_type=self.service_type,
                addresses=addresses,
                port=port,
                role=txt_records.get("role", "AUDIO-NODE"),
                health_score=float(txt_records.get("health", "50.0")),
                is_manager=txt_records.get("manager", "false").lower() == "true",
                capabilities=capabilities,
                last_seen=datetime.utcnow(),
                txt_records=txt_records,
            )

            self.discovered_nodes[node_id] = node
            self.logger.info(
                f"Discovered node: {node_id} at {addresses[0] if addresses else 'unknown'}"
            )
            return node

        except Exception as e:
            self.logger.error(f"Failed to add discovered node {node_id}: {e}")
            raise

    def _parse_capabilities(self, txt_records: Dict[str, str]) -> Optional[MDNSCapabilities]:
        """Parse TXT records to extract hardware capabilities"""
        def _parse_port_count(value: str) -> int:
            text = str(value or "").strip()
            if not text:
                return 0
            try:
                return int(text)
            except ValueError:
                return len([item for item in text.split(",") if item.strip()])

        try:
            return MDNSCapabilities(
                cpu_cores=int(txt_records.get("cpu_cores", "1")),
                cpu_model=txt_records.get("cpu_model", "Unknown"),
                memory_gb=int(txt_records.get("memory_gb", "4")),
                audio_interfaces=txt_records.get("audio", "").split(",")
                if txt_records.get("audio")
                else [],
                storage_gb=int(txt_records.get("storage_gb", "0")),
                kernel_version=txt_records.get("kernel", ""),
                has_gpu=txt_records.get("gpu", "no").lower() == "yes",
                midi_inputs=_parse_port_count(txt_records.get("midi_in", "0")),
                midi_outputs=_parse_port_count(txt_records.get("midi_out", "0")),
            )
        except Exception as e:
            self.logger.warning(f"Failed to parse capabilities: {e}")
            return None

    def get_discovered_nodes(self, online_only: bool = True) -> List[MDNSNode]:
        """
        Get list of discovered nodes.

        Args:
            online_only: Only return nodes that are currently online

        Returns:
            List of MDNSNode objects
        """
        nodes = list(self.discovered_nodes.values())

        if online_only:
            nodes = [n for n in nodes if n.is_online(self.cache_timeout)]

        return nodes

    def get_discovered_node(self, node_id: str) -> Optional[MDNSNode]:
        """Get a specific discovered node by ID"""
        node = self.discovered_nodes.get(node_id)
        if node and node.is_online(self.cache_timeout):
            return node
        return None

    def get_management_nodes(self) -> List[MDNSNode]:
        """Get all discovered management nodes"""
        return [n for n in self.get_discovered_nodes() if n.is_manager]

    def get_audio_nodes(self) -> List[MDNSNode]:
        """Get all discovered audio nodes"""
        return [n for n in self.get_discovered_nodes() if not n.is_manager]

    def cleanup_offline_nodes(self) -> int:
        """
        Remove offline nodes from cache.

        Returns:
            Number of nodes removed
        """
        before_count = len(self.discovered_nodes)

        # Keep only online nodes
        self.discovered_nodes = {
            node_id: node
            for node_id, node in self.discovered_nodes.items()
            if node.is_online(self.cache_timeout)
        }

        removed = before_count - len(self.discovered_nodes)
        if removed > 0:
            self.logger.info(f"Cleaned up {removed} offline nodes from cache")

        return removed

    def get_cluster_summary(self) -> Dict:
        """Get summary statistics about discovered cluster"""
        online_nodes = self.get_discovered_nodes()
        return {
            "total_discovered": len(self.discovered_nodes),
            "online_nodes": len(online_nodes),
            "management_nodes": len(self.get_management_nodes()),
            "audio_nodes": len(self.get_audio_nodes()),
            "avg_health": (
                sum(n.health_score for n in online_nodes) / len(online_nodes)
                if online_nodes
                else 0
            ),
            "nodes": [n.to_dict() for n in online_nodes],
        }


# Global discovery instance
_enhanced_mdns_discovery: Optional[EnhancedMDNSDiscovery] = None


def get_enhanced_mdns_discovery() -> EnhancedMDNSDiscovery:
    """Get or create the enhanced mDNS discovery singleton"""
    global _enhanced_mdns_discovery
    if _enhanced_mdns_discovery is None:
        _enhanced_mdns_discovery = EnhancedMDNSDiscovery()
    return _enhanced_mdns_discovery

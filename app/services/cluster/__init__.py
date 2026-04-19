"""
MAP2 Audio Platform - Cluster Management Module

Provides distributed cluster management capabilities for multi-node deployments:
- Node discovery and registration
- Cluster state management
- Health aggregation
- Update orchestration
- Configuration distribution
- Disaster recovery

This module is optional and loaded only when MAP2_CLUSTER_ENABLED=true.
Audio nodes can operate standalone without this module.

Classes:
    ClusterNode - Represents a single node in the cluster
    ClusterState - Aggregate cluster state
    ClusterManager - Central management orchestrator (runs on Management Node only)
    
Usage:
    from app.services.cluster import ClusterManager
    
    if os.getenv("MAP2_CLUSTER_ENABLED") == "true":
        mgr = ClusterManager()
        await mgr.start()
"""

from typing import Optional, List, Dict
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum, auto
import logging

logger = logging.getLogger(__name__)

__all__ = [
    "ClusterNodeRole",
    "ClusterNodeStatus",
    "ClusterMode",
    "ClusterNode",
    "ClusterState",
    "ClusterManager",
    "CLUSTER_ENABLED",
]


# ============================================================================
# ENUMS
# ============================================================================

class ClusterNodeRole(Enum):
    """Role of a node in the cluster"""
    AUDIO_NODE = "AUDIO-NODE"
    MANAGEMENT_NODE = "MANAGEMENT-NODE"
    STANDBY_MANAGEMENT = "STANDBY-MANAGEMENT"
    FRONTEND_ONLY = "FRONTEND-ONLY"


class ClusterNodeStatus(Enum):
    """Current status of a node"""
    ONLINE = "online"
    OFFLINE = "offline"
    DEGRADED = "degraded"
    INITIALIZING = "initializing"
    UPDATING = "updating"
    FAILED = "failed"
    RECOVERING = "recovering"


class ClusterMode(Enum):
    """Overall cluster operational mode"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    PARTIAL_FAILURE = "partial_failure"
    CRITICAL_FAILURE = "critical_failure"


# ============================================================================
# DATACLASSES
# ============================================================================

@dataclass
class ClusterNodeMetadata:
    """Extended metadata for a cluster node"""
    cpu_cores: int
    cpu_model: str
    total_memory_gb: int
    available_memory_gb: int
    kernel_version: str
    os_version: str  # e.g., "Fedora 42"
    audio_interfaces: List[str] = field(default_factory=list)
    network_interfaces: List[str] = field(default_factory=list)
    dsp_load_percent: float = 0.0
    xrun_count: int = 0
    uptime_seconds: int = 0
    # Audio path information (populated on demand)
    audio_path: Optional[Dict] = None  # NodeAudioPath as dict
    last_audio_path_update: Optional[str] = None
    # AVB/TSN network audio (optional, only populated if avb.enabled=true)
    avb_enabled: bool = False
    avb_interface: Optional[str] = None
    avb_ptp_synced: bool = False
    avb_ptp_offset_ns: Optional[float] = None
    avb_tsn_configured: bool = False
    avb_streams: List[Dict] = field(default_factory=list)  # List of stream info dicts


@dataclass
class ClusterNode:
    """
    Represents a single node in the cluster.
    Immutable node identity + mutable status.
    """
    node_id: str                              # Unique ID: UUID-MAC
    hostname: str
    role: ClusterNodeRole
    status: ClusterNodeStatus = ClusterNodeStatus.INITIALIZING
    ip_address: Optional[str] = None
    mac_address: Optional[str] = None
    port: int = 8000
    metadata: Optional[ClusterNodeMetadata] = None
    
    # Timestamps
    discovered_at: datetime = field(default_factory=datetime.utcnow)
    last_seen: datetime = field(default_factory=datetime.utcnow)
    last_updated: datetime = field(default_factory=datetime.utcnow)
    
    # Health metrics (ephemeral, updated frequently)
    health_score: float = 50.0  # 0-100
    latency_ms: float = 0.0     # To management node
    connection_errors: int = 0

    @property
    def url(self) -> str:
        """REST API URL for this node"""
        if not self.ip_address:
            return f"http://{self.hostname}:{self.port}"
        return f"http://{self.ip_address}:{self.port}"
    
    @property
    def is_healthy(self) -> bool:
        """Node is operational"""
        return self.status in [
            ClusterNodeStatus.ONLINE,
            ClusterNodeStatus.DEGRADED
        ]
    
    @property
    def is_management_node(self) -> bool:
        """Node can perform management operations"""
        return self.role in [
            ClusterNodeRole.MANAGEMENT_NODE,
            ClusterNodeRole.STANDBY_MANAGEMENT,
        ]


@dataclass
class ClusterState:
    """
    Aggregate state of the entire cluster.
    Single source of truth for cluster health/configuration.
    """
    cluster_name: str
    cluster_id: str
    mode: ClusterMode = ClusterMode.HEALTHY
    primary_node_id: Optional[str] = None
    standby_node_ids: List[str] = field(default_factory=list)
    
    # Node tracking
    all_nodes: Dict[str, ClusterNode] = field(default_factory=dict)
    
    # Timestamps
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_updated: datetime = field(default_factory=datetime.utcnow)
    last_health_check: datetime = field(default_factory=datetime.utcnow)
    
    @property
    def audio_nodes(self) -> List[ClusterNode]:
        """All AUDIO-NODE nodes in cluster"""
        return [
            n for n in self.all_nodes.values()
            if n.role == ClusterNodeRole.AUDIO_NODE
        ]
    
    @property
    def management_nodes(self) -> List[ClusterNode]:
        """All MANAGEMENT-NODE and STANDBY nodes"""
        return [
            n for n in self.all_nodes.values()
            if n.is_management_node
        ]
    
    @property
    def online_count(self) -> int:
        """Number of online nodes"""
        return sum(1 for n in self.all_nodes.values() if n.is_healthy)
    
    @property
    def total_count(self) -> int:
        """Total nodes in cluster"""
        return len(self.all_nodes)
    
    @property
    def aggregate_health_score(self) -> float:
        """Average health score across all online nodes"""
        if not self.all_nodes:
            return 0.0
        healthy_nodes = [
            n for n in self.all_nodes.values() if n.is_healthy
        ]
        if not healthy_nodes:
            return 0.0
        return sum(n.health_score for n in healthy_nodes) / len(healthy_nodes)


# ============================================================================
# CLUSTER MANAGER (Base)
# ============================================================================

class ClusterManager:
    """
    Base cluster management orchestrator.
    Subclasses implement specific management logic.
    
    Only runs on Management Nodes. Audio nodes do not instantiate this.
    """
    
    def __init__(self, cluster_state: ClusterState):
        self.cluster_state = cluster_state
        self.logger = logging.getLogger(__name__)
    
    async def start(self):
        """Start cluster management services"""
        self.logger.info(
            f"Starting Cluster Manager for cluster '{self.cluster_state.cluster_name}'"
        )
    
    async def stop(self):
        """Stop cluster management services"""
        self.logger.info("Stopping Cluster Manager")


# ============================================================================
# CONFIGURATION
# ============================================================================

# Check if clustering is enabled
import os
CLUSTER_ENABLED = os.getenv("MAP2_CLUSTER_ENABLED", "false").lower() == "true"

if CLUSTER_ENABLED:
    logger.info("Cluster management module ENABLED")
else:
    logger.debug("Cluster management module disabled (set MAP2_CLUSTER_ENABLED=true to enable)")


# ============================================================================
# INTEGRATED CLUSTER SERVICES (Tasks 1-6)
# ============================================================================

# Import integrated services for convenient access
try:
    from app.services.cluster.enhanced_node_identity import (
        get_enhanced_node_identity,
        EnhancedNodeIdentity,
    )
    logger.debug("Enhanced Node Identity service imported")
except ImportError as e:
    logger.warning(f"Failed to import Enhanced Node Identity: {e}")

try:
    from app.services.cluster.ztp import get_ztp_bootstrap, ZTPBootstrap
    logger.debug("ZTP Bootstrap service imported")
except ImportError as e:
    logger.warning(f"Failed to import ZTP Bootstrap: {e}")

try:
    from app.services.cluster.mdns_discovery_enhanced import (
        get_enhanced_mdns_discovery,
        EnhancedMDNSDiscovery,
        MDNSNode,
    )
    logger.debug("Enhanced mDNS Discovery service imported")
except ImportError as e:
    logger.warning(f"Failed to import Enhanced mDNS Discovery: {e}")

try:
    from app.services.cluster.registry import get_cluster_registry, ClusterRegistry
    logger.debug("Cluster Registry service imported")
except ImportError as e:
    logger.warning(f"Failed to import Cluster Registry: {e}")

try:
    from app.services.cluster.certificate_authority import (
        get_cluster_ca,
        ClusterCA,
    )
    logger.debug("Cluster CA service imported")
except ImportError as e:
    logger.warning(f"Failed to import Cluster CA: {e}")

# Import update orchestrator
try:
    from app.services.cluster.update_orchestrator import (
        UpdateScheduler,
        UpdatePhase,
        NodeUpdateStatus,
        UpdateJob,
        UpdateReport,
        get_update_scheduler,
    )
except ImportError as e:
    logger.warning(f"Failed to import Update Orchestrator: {e}")

# Import config distribution
try:
    from app.services.cluster.config_pusher import ConfigSync, get_config_sync
except ImportError as e:
    logger.warning(f"Failed to import Config Pusher: {e}")

# Import state replication
try:
    from app.services.cluster.state_replicator import (
        StateReplicator,
        get_state_replicator,
    )
except ImportError as e:
    logger.warning(f"Failed to import State Replicator: {e}")

# Import management orchestrator
try:
    from app.services.cluster.management_orchestrator import main as mgmt_orchestrator
except ImportError as e:
    logger.warning(f"Failed to import Management Orchestrator: {e}")

# Import failover monitor
try:
    from app.services.cluster.failover_monitor import main as failover_monitor
except ImportError as e:
    logger.warning(f"Failed to import Failover Monitor: {e}")

# Import node lifecycle manager
try:
    from app.services.cluster.node_lifecycle import (
        NodeLifecycleManager,
        NodeState,
        NodeLifecycleEvent,
        get_lifecycle_manager,
    )
except ImportError as e:
    logger.warning(f"Failed to import Node Lifecycle Manager: {e}")

# Export integrated services
__all__.extend([
    "get_enhanced_node_identity",
    "EnhancedNodeIdentity",
    "get_ztp_bootstrap",
    "ZTPBootstrap",
    "get_enhanced_mdns_discovery",
    "EnhancedMDNSDiscovery",
    "MDNSNode",
    "get_cluster_registry",
    "ClusterRegistry",
    "get_cluster_ca",
    "ClusterCA",
    "get_update_scheduler",
    "UpdateScheduler",
    "UpdatePhase",
    "UpdateJob",
    "UpdateReport",
    "get_config_sync",
    "ConfigSync",
    "get_state_replicator",
    "StateReplicator",
    "get_lifecycle_manager",
    "NodeLifecycleManager",
    "NodeState",
    "NodeLifecycleEvent",
])

logger.info("Cluster management module initialized with all services")

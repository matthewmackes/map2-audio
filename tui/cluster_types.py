"""
Cluster Management Type Definitions
Type hints and data classes for cluster management operations.
"""

from dataclasses import dataclass, field
from typing import Optional, Dict, List, Any
from enum import Enum


# ============================================================================
# Enumerations
# ============================================================================

class NodeState(str, Enum):
    """Node operational status."""
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    DEGRADED = "DEGRADED"
    MAINTENANCE = "MAINTENANCE"


class AssignmentRole(str, Enum):
    """Role of a flow assignment on a node."""
    PRIMARY = "primary"
    STANDBY = "standby"
    UNASSIGNED = "unassigned"


class FailoverState(str, Enum):
    """Failover event states."""
    TRIGGERED = "triggered"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


# ============================================================================
# Node Management
# ============================================================================

@dataclass
class NodeMetrics:
    """Real-time metrics for a node."""
    cpu_percent: float = 0.0  # 0-100
    memory_percent: float = 0.0  # 0-100
    memory_mb: float = 0.0
    memory_max_mb: float = 0.0
    disk_percent: float = 0.0  # 0-100
    gpu_percent: Optional[float] = None  # 0-100 or None if no GPU
    gpu_memory_percent: Optional[float] = None
    temperature_c: Optional[float] = None
    uptime_seconds: int = 0
    last_update: str = ""  # ISO timestamp

    def is_healthy(self) -> bool:
        """Check if metrics are within healthy ranges."""
        return (
            self.cpu_percent < 90
            and self.memory_percent < 90
            and (self.temperature_c is None or self.temperature_c < 85)
        )


@dataclass
class NodeCapabilities:
    """Capabilities/features available on a node."""
    supports_gpu: bool = False
    gpu_memory_gb: Optional[float] = None
    max_chains: int = 10
    audio_inputs: int = 2
    audio_outputs: int = 2
    sample_rates: List[int] = field(default_factory=lambda: [44100, 48000, 96000])
    buffer_sizes: List[int] = field(default_factory=lambda: [64, 128, 256, 512])


@dataclass
class NodeStatus:
    """Full status of a cluster node."""
    node_id: str
    hostname: str
    status: NodeState  # ONLINE, OFFLINE, DEGRADED, MAINTENANCE
    
    # Connectivity
    ip_address: str
    port: int = 8080
    is_responsive: bool = True
    response_time_ms: float = 0.0
    
    # Resource info
    metrics: NodeMetrics = field(default_factory=NodeMetrics)
    capabilities: NodeCapabilities = field(default_factory=NodeCapabilities)
    
    # Active flows
    active_flow_ids: List[str] = field(default_factory=list)
    active_flow_count: int = 0
    
    # Status timestamps
    last_seen: str = ""  # ISO timestamp
    connected_since: str = ""  # ISO timestamp
    
    # Health
    warning_level: int = 0  # 0=OK, 1=Warning, 2=Critical
    last_error: Optional[str] = None


# ============================================================================
# Flow Assignment Management
# ============================================================================

@dataclass
class FlowAssignment:
    """Assignment of a flow to node(s)."""
    flow_id: str
    chain_id: int
    
    # Primary assignment
    primary_node_id: str
    
    # Redundancy
    standby_node_ids: List[str] = field(default_factory=list)
    redundancy_enabled: bool = False
    redundancy_mode: str = "hot-standby"  # hot-standby, warm-standby
    
    # Status
    is_active: bool = False
    is_healthy: bool = True
    
    # Metrics
    cpu_usage_percent: float = 0.0
    memory_usage_mb: float = 0.0
    latency_ms: float = 0.0
    
    # Metadata
    assigned_at: str = ""  # ISO timestamp
    last_verified: str = ""  # ISO timestamp


@dataclass
class AssignmentRecommendation:
    """AI recommendation for flow assignment."""
    flow_id: str
    chain_id: int
    recommended_node_id: str
    confidence: float = 0.0  # 0.0-1.0
    reason: str = ""
    alternatives: List[str] = field(default_factory=list)
    
    # Why this node
    matches_requirements: bool = True
    available_resources: Dict[str, float] = field(default_factory=dict)
    estimated_cpu: float = 0.0
    estimated_memory_mb: float = 0.0


@dataclass
class AssignmentMatrix:
    """2D matrix: Flows × Nodes showing assignments."""
    timestamp: str = ""  # ISO timestamp
    flows: List[str] = field(default_factory=list)  # flow_ids
    nodes: List[str] = field(default_factory=list)  # node_ids
    
    # Matrix[flow_index][node_index] = AssignmentRole
    assignments: Dict[str, Dict[str, str]] = field(default_factory=dict)
    
    def get_assignment(self, flow_id: str, node_id: str) -> AssignmentRole:
        """Get assignment role for flow on node."""
        if flow_id in self.assignments and node_id in self.assignments[flow_id]:
            role_str = self.assignments[flow_id][node_id]
            return AssignmentRole(role_str)
        return AssignmentRole.UNASSIGNED


# ============================================================================
# Failover Management
# ============================================================================

@dataclass
class FailoverEvent:
    """Record of a failover operation."""
    event_id: str
    flow_id: str
    chain_id: int
    
    # Failover details
    from_node_id: str
    to_node_id: str
    triggered_at: str  # ISO timestamp
    completed_at: Optional[str] = None
    
    # Status
    state: FailoverState = FailoverState.TRIGGERED
    is_successful: bool = False
    error_message: Optional[str] = None
    
    # Cause
    trigger_reason: str = ""  # "node_failure", "user_request", "maintenance"
    
    # Duration
    duration_ms: Optional[float] = None


@dataclass
class FailoverHistory:
    """History of failover events."""
    flow_id: str
    events: List[FailoverEvent] = field(default_factory=list)
    total_failovers: int = 0
    last_failover: Optional[FailoverEvent] = None
    mtbf_hours: Optional[float] = None  # Mean Time Between Failures


# ============================================================================
# Diagnostics & Health
# ============================================================================

@dataclass
class NodeConnectivityCheck:
    """Results of connectivity check to a node."""
    node_id: str
    is_reachable: bool
    response_time_ms: float = 0.0
    error_message: Optional[str] = None
    timestamp: str = ""


@dataclass
class AssignmentValidation:
    """Validation of assignment configuration."""
    is_valid: bool
    flow_id: str
    assigned_node_id: str
    issues: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


@dataclass
class ClusterHealthReport:
    """Overall cluster health status."""
    timestamp: str = ""  # ISO timestamp
    overall_health: int = 100  # 0-100 score
    nodes_online: int = 0
    nodes_offline: int = 0
    nodes_degraded: int = 0
    nodes_maintenance: int = 0
    
    # Performance
    avg_cpu_percent: float = 0.0
    avg_memory_percent: float = 0.0
    avg_latency_ms: float = 0.0
    
    # Issues
    critical_issues: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    
    # Capacity
    total_cpu_capacity: float = 100.0
    used_cpu_percent: float = 0.0
    total_memory_gb: float = 0.0
    used_memory_gb: float = 0.0


# ============================================================================
# Events & Logging
# ============================================================================

class EventType(str, Enum):
    """Types of cluster events."""
    NODE_ONLINE = "node_online"
    NODE_OFFLINE = "node_offline"
    NODE_DEGRADED = "node_degraded"
    ASSIGNMENT_CREATED = "assignment_created"
    ASSIGNMENT_CHANGED = "assignment_changed"
    ASSIGNMENT_DELETED = "assignment_deleted"
    FAILOVER_TRIGGERED = "failover_triggered"
    FAILOVER_COMPLETED = "failover_completed"
    MAINTENANCE_START = "maintenance_start"
    MAINTENANCE_END = "maintenance_end"
    METRICS_UPDATE = "metrics_update"
    ERROR = "error"
    WARNING = "warning"


@dataclass
class ClusterEvent:
    """Single cluster management event."""
    event_id: str
    event_type: EventType
    timestamp: str  # ISO timestamp
    
    # Event details
    node_id: Optional[str] = None
    flow_id: Optional[str] = None
    chain_id: Optional[int] = None
    
    # Message
    message: str = ""
    severity: str = "info"  # info, warning, error, critical
    
    # Additional data
    metadata: Dict[str, Any] = field(default_factory=dict)


# ============================================================================
# API Result Wrapper
# ============================================================================

@dataclass
class ClusterAPIResult:
    """Standard result wrapper for cluster API calls."""
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    error_code: Optional[str] = None
    timestamp: str = ""
    
    def is_error(self) -> bool:
        """Check if result represents an error."""
        return not self.success or self.error is not None
    
    def get_error_message(self) -> str:
        """Get human-readable error message."""
        return self.error or "Unknown error occurred"

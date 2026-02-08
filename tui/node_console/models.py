"""
Data models for the MAP2 Node Console.

All status information is represented as frozen/immutable dataclasses.
The UI reads these; collectors produce them.  This keeps the data layer
completely decoupled from both the network/system layer and the view layer.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional


# ── Enums ────────────────────────────────────────────────────────────────────

class NodeMode(str, Enum):
    """Deployment mode for this node."""
    ALL_IN_ONE = "all-in-one"
    AUDIO = "audio"
    MANAGEMENT = "management"
    UNKNOWN = "unknown"


class HealthLevel(str, Enum):
    """Overall health indicator."""
    HEALTHY = "healthy"
    WARNING = "warning"
    CRITICAL = "critical"
    UNKNOWN = "unknown"

    @property
    def icon(self) -> str:
        return {
            HealthLevel.HEALTHY: "●",
            HealthLevel.WARNING: "▲",
            HealthLevel.CRITICAL: "✖",
            HealthLevel.UNKNOWN: "○",
        }[self]

    @property
    def color(self) -> str:
        return {
            HealthLevel.HEALTHY: "green",
            HealthLevel.WARNING: "yellow",
            HealthLevel.CRITICAL: "red",
            HealthLevel.UNKNOWN: "dim",
        }[self]


class ServiceState(str, Enum):
    RUNNING = "running"
    STOPPED = "stopped"
    FAILED = "failed"
    UNKNOWN = "unknown"


# ── System metrics ───────────────────────────────────────────────────────────

@dataclass(frozen=True)
class CpuInfo:
    percent: float = 0.0
    core_count: int = 1
    load_avg_1: float = 0.0
    load_avg_5: float = 0.0
    load_avg_15: float = 0.0
    governor: str = "unknown"
    isolated_cores: str = ""


@dataclass(frozen=True)
class MemoryInfo:
    total_mb: float = 0.0
    used_mb: float = 0.0
    percent: float = 0.0
    swap_percent: float = 0.0


@dataclass(frozen=True)
class TemperatureInfo:
    cpu_temp_c: Optional[float] = None
    gpu_temp_c: Optional[float] = None


@dataclass(frozen=True)
class NetworkInterface:
    name: str = ""
    is_up: bool = False
    ipv4: str = ""
    speed_mbps: int = 0


# ── Audio ────────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class PipewireStatus:
    state: ServiceState = ServiceState.UNKNOWN
    sample_rate: int = 0
    buffer_size: int = 0
    latency_ms: float = 0.0
    quantum: int = 0
    xruns: int = 0


@dataclass(frozen=True)
class AudioChannel:
    name: str = ""
    direction: str = "unknown"  # "input" | "output"
    format: str = ""
    sample_rate: int = 0
    state: ServiceState = ServiceState.UNKNOWN
    xruns: int = 0
    peak_db: float = -120.0


@dataclass(frozen=True)
class AudioEngineStatus:
    state: ServiceState = ServiceState.UNKNOWN
    engine_type: str = "juce"
    sample_rate: int = 48000
    buffer_size: int = 256
    latency_ms: float = 0.0
    xruns: int = 0
    channels: List[AudioChannel] = field(default_factory=list)
    nam_available: bool = False
    ir_available: bool = False
    plugins_loaded: int = 0


# ── Cluster ──────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class ClusterPeer:
    node_id: str = ""
    hostname: str = ""
    ip: str = ""
    mode: str = ""
    health: HealthLevel = HealthLevel.UNKNOWN
    latency_ms: float = 0.0
    last_heartbeat: float = 0.0


@dataclass(frozen=True)
class AudioFlow:
    flow_id: str = ""
    source_node: str = ""
    dest_node: str = ""
    channel_name: str = ""
    latency_ms: float = 0.0
    packet_loss: float = 0.0
    drop_count: int = 0
    sync_state: str = "unknown"


@dataclass(frozen=True)
class ClusterStatus:
    enabled: bool = False
    peer_count: int = 0
    peers: List[ClusterPeer] = field(default_factory=list)
    flows: List[AudioFlow] = field(default_factory=list)
    clock_source: str = "local"
    clock_synced: bool = False
    manager_latency_ms: float = 0.0


# ── Services ─────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class ServiceInfo:
    name: str = ""
    state: ServiceState = ServiceState.UNKNOWN
    uptime_seconds: float = 0.0
    error: str = ""


# ── Top-level snapshot ───────────────────────────────────────────────────────

@dataclass(frozen=True)
class NodeSnapshot:
    """Complete point-in-time snapshot of node state.

    Produced by the collector, consumed by every screen.
    Immutable so the UI never sees half-updated data.
    """
    timestamp: float = field(default_factory=time.time)
    hostname: str = "unknown"
    mode: NodeMode = NodeMode.UNKNOWN
    health: HealthLevel = HealthLevel.UNKNOWN
    uptime_seconds: float = 0.0

    # Sub-models
    cpu: CpuInfo = field(default_factory=CpuInfo)
    memory: MemoryInfo = field(default_factory=MemoryInfo)
    temperature: TemperatureInfo = field(default_factory=TemperatureInfo)
    network_interfaces: List[NetworkInterface] = field(default_factory=list)

    pipewire: PipewireStatus = field(default_factory=PipewireStatus)
    audio: AudioEngineStatus = field(default_factory=AudioEngineStatus)
    cluster: ClusterStatus = field(default_factory=ClusterStatus)

    services: List[ServiceInfo] = field(default_factory=list)

    # Backend API health
    api_reachable: bool = False
    api_version: str = ""
    services_running: int = 0
    services_total: int = 0

    # Recent events (newest first, max ~20)
    recent_events: List[str] = field(default_factory=list)

    # Error collecting status
    collector_errors: List[str] = field(default_factory=list)

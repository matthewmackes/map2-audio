"""
Audio Path & Service Discovery for Cluster Nodes

Provides comprehensive visibility into each node's audio infrastructure:
- PipeWire daemon status, settings, and graph topology
- JUCE audio engine state and plugin inventory
- ALSA device configuration
- Latency chain and performance metrics
- Service health and interdependencies

This service runs on every node and exposes its audio architecture to the cluster.
The management node aggregates this information for cluster-wide visibility.

Classes:
    NodeAudioPath - Complete audio infrastructure for a single node
    AudioPathService - Service discovery and monitoring
    
Usage:
    from app.services.cluster.audio_path_discovery import get_audio_path_service
    
    svc = get_audio_path_service()
    audio_path = await svc.get_node_audio_path()
    # Returns: Complete audio architecture snapshot
"""

import asyncio
import logging
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Any
from enum import Enum

logger = logging.getLogger(__name__)


# ============================================================================
# Service Status Enums
# ============================================================================

class ServiceHealth(Enum):
    """Health status of an audio service"""
    HEALTHY = "healthy"
    WARNING = "warning"
    ERROR = "error"
    OFFLINE = "offline"
    UNKNOWN = "unknown"


class ServiceType(Enum):
    """Types of audio services in the node"""
    PIPEWIRE = "pipewire"
    JUCE_ENGINE = "juce_engine"
    ALSA = "alsa"
    JACK = "jack"
    PLUGIN_HOST = "plugin_host"
    MIDI = "midi"
    LATENCY_COMPENSATOR = "latency_compensator"
    DSP_GRAPH = "dsp_graph"


# ============================================================================
# Data Classes
# ============================================================================

@dataclass
class PipeWireServiceInfo:
    """PipeWire audio server information"""
    daemon_running: bool
    version: str = ""
    sample_rate: int = 48000
    quantum: int = 1024
    latency_ms: float = 0.0
    xruns: int = 0
    devices: List[Dict[str, Any]] = field(default_factory=list)
    streams: List[Dict[str, Any]] = field(default_factory=list)
    links: List[Dict[str, Any]] = field(default_factory=list)
    graph_nodes: int = 0
    alerts: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class JUCEEngineServiceInfo:
    """JUCE audio engine information"""
    running: bool
    sample_rate: int = 48000
    buffer_size: int = 256
    cpu_load: float = 0.0
    input_channels: int = 0
    output_channels: int = 0
    plugin_count: int = 0
    xrun_count: int = 0
    latency_ms: float = 0.0


@dataclass
class ALSAServiceInfo:
    """ALSA backend information"""
    available: bool
    devices: List[Dict[str, str]] = field(default_factory=list)
    input_devices: List[str] = field(default_factory=list)
    output_devices: List[str] = field(default_factory=list)


@dataclass
class AudioService:
    """Single audio service status"""
    type: ServiceType
    name: str
    health: ServiceHealth
    message: str
    last_check: str = ""
    check_interval_seconds: int = 5
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AudioPathLatencyBreakdown:
    """Latency contributed by each service in the audio path"""
    pipewire_graph_ms: float = 0.0
    pipewire_driver_ms: float = 0.0
    juce_buffer_ms: float = 0.0
    alsa_hardware_ms: float = 0.0
    total_ms: float = 0.0
    
    def compute_total(self):
        """Recompute total from components"""
        self.total_ms = (
            self.pipewire_graph_ms +
            self.pipewire_driver_ms +
            self.juce_buffer_ms +
            self.alsa_hardware_ms
        )
        return self.total_ms


@dataclass
class NodeAudioPath:
    """
    Complete audio infrastructure for a single node.
    
    Represents the entire signal chain and all services involved
    in audio processing on this node.
    """
    node_id: str
    hostname: str
    timestamp: str
    
    # Service status
    services: List[AudioService] = field(default_factory=list)
    overall_health: ServiceHealth = ServiceHealth.UNKNOWN
    
    # Detailed service info
    pipewire: Optional[PipeWireServiceInfo] = None
    juce_engine: Optional[JUCEEngineServiceInfo] = None
    alsa: Optional[ALSAServiceInfo] = None
    
    # Audio metrics
    latency: AudioPathLatencyBreakdown = field(default_factory=AudioPathLatencyBreakdown)
    
    # Active flows/streams
    active_flows: int = 0
    total_dsp_load: float = 0.0
    
    # Dependencies graph: which services depend on which
    dependencies: Dict[str, List[str]] = field(default_factory=dict)
    
    # Warnings and alerts
    alerts: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return {
            "node_id": self.node_id,
            "hostname": self.hostname,
            "timestamp": self.timestamp,
            "services": [
                {
                    "type": s.type.value,
                    "name": s.name,
                    "health": s.health.value,
                    "message": s.message,
                    "last_check": s.last_check,
                    **s.metadata,
                }
                for s in self.services
            ],
            "overall_health": self.overall_health.value,
            "pipewire": asdict(self.pipewire) if self.pipewire else None,
            "juce_engine": asdict(self.juce_engine) if self.juce_engine else None,
            "alsa": asdict(self.alsa) if self.alsa else None,
            "latency": asdict(self.latency),
            "active_flows": self.active_flows,
            "total_dsp_load": self.total_dsp_load,
            "dependencies": self.dependencies,
            "alerts": self.alerts,
        }


# ============================================================================
# Audio Path Service
# ============================================================================

class AudioPathService:
    """
    Discovers and monitors audio services on the current node.
    
    Runs on all nodes (MANAGEMENT and AUDIO).
    Provides REST endpoint for cluster-wide audio path visibility.
    """
    
    _instance: Optional['AudioPathService'] = None
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self._cache: Optional[NodeAudioPath] = None
        self._cache_valid_until: float = 0
        self._cache_ttl_seconds: float = 2.0  # Refresh every 2 seconds
    
    @staticmethod
    def get_instance() -> 'AudioPathService':
        """Get or create singleton instance"""
        if AudioPathService._instance is None:
            AudioPathService._instance = AudioPathService()
        return AudioPathService._instance
    
    async def get_node_audio_path(self) -> NodeAudioPath:
        """
        Get complete audio path for this node.
        
        Returns:
            NodeAudioPath with all services, settings, and topology
        """
        import time
        
        # Check cache
        if self._cache and time.time() < self._cache_valid_until:
            return self._cache
        
        # Fetch fresh data
        node_id = self._get_node_id()
        hostname = self._get_hostname()
        
        # Gather service info in parallel
        pipewire_info = await self._get_pipewire_info()
        juce_info = await self._get_juce_info()
        alsa_info = await self._get_alsa_info()
        
        # Build service list
        services = self._build_service_list(pipewire_info, juce_info, alsa_info)
        
        # Compute overall health
        overall_health = self._compute_overall_health(services)
        
        # Build latency breakdown
        latency = self._compute_latency_breakdown(pipewire_info, juce_info)
        
        # Build dependency graph
        dependencies = self._build_dependency_graph(services)
        
        # Collect alerts
        alerts = self._collect_alerts(services, latency)
        
        # Create audio path object
        from datetime import datetime
        audio_path = NodeAudioPath(
            node_id=node_id,
            hostname=hostname,
            timestamp=datetime.utcnow().isoformat(),
            services=services,
            overall_health=overall_health,
            pipewire=pipewire_info,
            juce_engine=juce_info,
            alsa=alsa_info,
            latency=latency,
            active_flows=juce_info.plugin_count if juce_info else 0,
            total_dsp_load=juce_info.cpu_load if juce_info else 0.0,
            dependencies=dependencies,
            alerts=alerts,
        )
        
        # Cache
        import time
        self._cache = audio_path
        self._cache_valid_until = time.time() + self._cache_ttl_seconds
        
        return audio_path
    
    async def _get_pipewire_info(self) -> Optional[PipeWireServiceInfo]:
        """Fetch PipeWire daemon and graph info"""
        try:
            from app.services.pipewire_service import get_pipewire_service
            
            pw_svc = get_pipewire_service()
            snapshot = await pw_svc.get_graph_snapshot()
            
            return PipeWireServiceInfo(
                daemon_running=snapshot.daemon.running,
                version=snapshot.daemon.version,
                sample_rate=snapshot.settings.clock_rate,
                quantum=snapshot.settings.clock_force_quantum or snapshot.settings.clock_quantum,
                latency_ms=snapshot.total_latency_ms,
                xruns=snapshot.xruns,
                devices=[asdict(d) for d in snapshot.devices[:10]],  # First 10
                streams=[asdict(s) for s in snapshot.streams[:10]],  # First 10
                links=[asdict(l) for l in snapshot.links[:20]],      # First 20
                graph_nodes=len(snapshot.nodes),
                alerts=[asdict(a) for a in snapshot.alerts],
            )
        except Exception as e:
            self.logger.debug(f"Failed to fetch PipeWire info: {e}")
            return None
    
    async def _get_juce_info(self) -> Optional[JUCEEngineServiceInfo]:
        """Fetch JUCE audio engine info"""
        try:
            from app.services.audio import get_audio_manager
            
            audio_mgr = get_audio_manager()
            status = await audio_mgr.get_status()
            health = await audio_mgr.get_health()
            
            return JUCEEngineServiceInfo(
                running=status.running,
                sample_rate=status.sample_rate,
                buffer_size=status.buffer_size,
                cpu_load=status.cpu_load,
                input_channels=status.input_channels or 0,
                output_channels=status.output_channels or 0,
                plugin_count=status.plugin_count or 0,
                xrun_count=health.xruns if health else 0,
                latency_ms=health.latency_ms if health else 0.0,
            )
        except Exception as e:
            self.logger.debug(f"Failed to fetch JUCE info: {e}")
            return None
    
    async def _get_alsa_info(self) -> Optional[ALSAServiceInfo]:
        """Fetch ALSA device info"""
        try:
            import subprocess
            
            # Check if aplay/arecord available
            result = subprocess.run(
                ["aplay", "-L"], 
                capture_output=True, 
                timeout=2,
                text=True
            )
            
            devices = result.stdout.strip().split('\n') if result.returncode == 0 else []
            
            return ALSAServiceInfo(
                available=result.returncode == 0,
                devices=[{"name": d} for d in devices[:20]],  # First 20
                input_devices=devices[:10],
                output_devices=devices[:10],
            )
        except Exception as e:
            self.logger.debug(f"Failed to fetch ALSA info: {e}")
            return None
    
    def _build_service_list(
        self,
        pipewire: Optional[PipeWireServiceInfo],
        juce: Optional[JUCEEngineServiceInfo],
        alsa: Optional[ALSAServiceInfo],
    ) -> List[AudioService]:
        """Build list of active audio services with health"""
        services = []
        
        # PipeWire
        if pipewire:
            pw_health = (
                ServiceHealth.HEALTHY if pipewire.daemon_running and not pipewire.alerts
                else ServiceHealth.WARNING if pipewire.alerts
                else ServiceHealth.ERROR
            )
            services.append(AudioService(
                type=ServiceType.PIPEWIRE,
                name="PipeWire Audio Server",
                health=pw_health,
                message=f"v{pipewire.version} @ {pipewire.sample_rate}Hz, "
                        f"{pipewire.quantum}smp, {pipewire.latency_ms:.1f}ms latency",
                metadata={
                    "version": pipewire.version,
                    "sample_rate": pipewire.sample_rate,
                    "quantum": pipewire.quantum,
                    "latency_ms": pipewire.latency_ms,
                    "xruns": pipewire.xruns,
                    "graph_nodes": pipewire.graph_nodes,
                    "device_count": len(pipewire.devices),
                    "stream_count": len(pipewire.streams),
                },
            ))
        
        # JUCE Engine
        if juce:
            juce_health = (
                ServiceHealth.HEALTHY if juce.running and juce.cpu_load < 0.85
                else ServiceHealth.WARNING if juce.running and juce.cpu_load < 0.95
                else ServiceHealth.ERROR if juce.running else ServiceHealth.OFFLINE
            )
            services.append(AudioService(
                type=ServiceType.JUCE_ENGINE,
                name="JUCE Audio Engine",
                health=juce_health,
                message=f"{'Running' if juce.running else 'Stopped'}, "
                        f"{juce.input_channels}×{juce.output_channels} I/O, "
                        f"{juce.plugin_count} plugins, {juce.cpu_load*100:.1f}% CPU",
                metadata={
                    "running": juce.running,
                    "sample_rate": juce.sample_rate,
                    "buffer_size": juce.buffer_size,
                    "cpu_load": juce.cpu_load,
                    "input_channels": juce.input_channels,
                    "output_channels": juce.output_channels,
                    "plugin_count": juce.plugin_count,
                    "xrun_count": juce.xrun_count,
                },
            ))
        
        # ALSA
        if alsa:
            alsa_health = ServiceHealth.HEALTHY if alsa.available else ServiceHealth.OFFLINE
            services.append(AudioService(
                type=ServiceType.ALSA,
                name="ALSA Backend",
                health=alsa_health,
                message=f"{'Available' if alsa.available else 'Not available'}, "
                        f"{len(alsa.input_devices)} inputs, {len(alsa.output_devices)} outputs",
                metadata={
                    "available": alsa.available,
                    "input_device_count": len(alsa.input_devices),
                    "output_device_count": len(alsa.output_devices),
                },
            ))
        
        return services
    
    def _compute_overall_health(self, services: List[AudioService]) -> ServiceHealth:
        """Compute overall health from service statuses"""
        if not services:
            return ServiceHealth.UNKNOWN
        
        healths = [s.health for s in services]
        
        if ServiceHealth.ERROR in healths:
            return ServiceHealth.ERROR
        if ServiceHealth.WARNING in healths or ServiceHealth.OFFLINE in healths:
            return ServiceHealth.WARNING
        if all(h == ServiceHealth.HEALTHY for h in healths):
            return ServiceHealth.HEALTHY
        
        return ServiceHealth.UNKNOWN
    
    def _compute_latency_breakdown(
        self,
        pipewire: Optional[PipeWireServiceInfo],
        juce: Optional[JUCEEngineServiceInfo],
    ) -> AudioPathLatencyBreakdown:
        """Compute latency contribution from each service"""
        latency = AudioPathLatencyBreakdown()
        
        if pipewire:
            latency.pipewire_graph_ms = pipewire.latency_ms * 0.6  # Estimate
            latency.pipewire_driver_ms = pipewire.latency_ms * 0.4
        
        if juce:
            latency.juce_buffer_ms = (juce.buffer_size / juce.sample_rate) * 1000
        
        # Estimate hardware latency
        if pipewire:
            latency.alsa_hardware_ms = pipewire.latency_ms * 0.2
        
        latency.compute_total()
        return latency
    
    def _build_dependency_graph(self, services: List[AudioService]) -> Dict[str, List[str]]:
        """Build service dependency graph"""
        return {
            ServiceType.JUCE_ENGINE.value: [ServiceType.PIPEWIRE.value, ServiceType.ALSA.value],
            ServiceType.PIPEWIRE.value: [ServiceType.ALSA.value],
            ServiceType.ALSA.value: [],
        }
    
    def _collect_alerts(
        self,
        services: List[AudioService],
        latency: AudioPathLatencyBreakdown,
    ) -> List[str]:
        """Collect alerts from all services"""
        alerts = []
        
        for svc in services:
            if svc.health == ServiceHealth.ERROR:
                alerts.append(f"🔴 {svc.name}: {svc.message}")
            elif svc.health == ServiceHealth.WARNING:
                alerts.append(f"🟡 {svc.name}: {svc.message}")
        
        if latency.total_ms > 20:
            alerts.append(f"⚠️ High latency: {latency.total_ms:.1f}ms (target < 20ms)")
        
        return alerts
    
    def _get_node_id(self) -> str:
        """Get node ID from environment or config"""
        import os
        return os.getenv("MAP2_NODE_ID", "local")
    
    def _get_hostname(self) -> str:
        """Get hostname"""
        import socket
        return socket.gethostname()


# ============================================================================
# Singleton accessor
# ============================================================================

def get_audio_path_service() -> AudioPathService:
    """Get audio path service singleton"""
    return AudioPathService.get_instance()

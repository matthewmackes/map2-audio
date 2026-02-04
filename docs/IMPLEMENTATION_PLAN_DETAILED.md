# 🚀 MAP2 Distributed Deployment - Implementation Plan

## Executive Summary

This document provides a detailed, week-by-week implementation plan to build a world-class distributed deployment system for MAP2 Audio Platform. The plan is structured to be **immediately actionable** with clear tasks, dependencies, and deliverables.

---

## Phase 1: Foundation (Week 1-2)

### Goal
Establish core infrastructure for deployment modes, configuration management, and basic service discovery.

---

## Week 1: Core Deployment Infrastructure

### Day 1-2: Deployment Configuration Engine

**Task 1.1: Create Deployment Configuration Module**

File: `app/config/deployment.py`

```python
"""
Deployment Configuration System
Manages deployment mode selection, configuration, and validation.
"""

from enum import Enum
from typing import List, Dict, Optional
from dataclasses import dataclass, field
from datetime import datetime

class DeploymentMode(Enum):
    """Supported deployment modes"""
    ALL_IN_ONE = "all_in_one"
    BACKEND_SERVER = "backend_server"
    FRONTEND_SERVER = "frontend_server"

class ServiceRole(Enum):
    """Service roles in deployment"""
    AUDIO_ENGINE = "audio_engine"
    API_SERVER = "api_server"
    WEB_FRONTEND = "web_frontend"
    PLUGIN_MANAGER = "plugin_manager"
    MIDI_SERVER = "midi_server"
    DATABASE = "database"
    SERVICE_REGISTRY = "service_registry"
    DISCOVERY_AGENT = "discovery_agent"

@dataclass
class NetworkConfig:
    """Network configuration"""
    bind_address: str = "0.0.0.0"
    advertise_addresses: List[str] = field(default_factory=list)
    api_port: int = 8080
    web_port: int = 3000
    metrics_port: int = 9090
    allowed_subnets: List[str] = field(default_factory=list)
    discovery_enabled: bool = True
    mdns_enabled: bool = True
    tls_enabled: bool = False
    api_key_required: bool = False

@dataclass
class DeploymentConfig:
    """Complete deployment configuration"""
    mode: DeploymentMode
    node_id: str  # Unique identifier
    hostname: str
    version: str = "2.0.0"
    created_at: datetime = field(default_factory=datetime.now)
    
    # Enabled services based on mode
    enabled_services: List[ServiceRole] = field(default_factory=list)
    disabled_services: List[ServiceRole] = field(default_factory=list)
    
    # Network configuration
    network: NetworkConfig = field(default_factory=NetworkConfig)
    
    # Database
    database_url: str = "sqlite:///~/.map2/map2.db"
    database_role: str = "primary"  # primary or replica
    
    # Audio
    audio_enabled: bool = False
    audio_device: Optional[str] = None
    sample_rate: int = 48000
    buffer_size: int = 256
    
    # Metadata
    metadata: Dict[str, str] = field(default_factory=dict)
    
    def validate(self) -> tuple[bool, List[str]]:
        """Validate configuration, return (is_valid, errors)"""
        errors = []
        
        # Check node_id format
        if not self.node_id or len(self.node_id) < 3:
            errors.append("Node ID must be at least 3 characters")
        
        # Check hostname
        if not self.hostname or len(self.hostname) < 1:
            errors.append("Hostname must be specified")
        
        # Check port ranges
        if not (1 <= self.network.api_port <= 65535):
            errors.append("API port must be between 1 and 65535")
        
        # Mode-specific validation
        if self.mode == DeploymentMode.ALL_IN_ONE:
            if not self.network.bind_address or self.network.bind_address != "127.0.0.1":
                errors.append("All-in-One mode should bind to localhost")
        
        elif self.mode == DeploymentMode.BACKEND_SERVER:
            if not self.audio_enabled:
                errors.append("Backend server must have audio enabled")
        
        elif self.mode == DeploymentMode.FRONTEND_SERVER:
            if self.audio_enabled:
                errors.append("Frontend server should not have audio enabled")
        
        return (len(errors) == 0, errors)
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for serialization"""
        return {
            'mode': self.mode.value,
            'node_id': self.node_id,
            'hostname': self.hostname,
            'version': self.version,
            'created_at': self.created_at.isoformat(),
            'network': {
                'bind_address': self.network.bind_address,
                'advertise_addresses': self.network.advertise_addresses,
                'api_port': self.network.api_port,
                'web_port': self.network.web_port,
                'metrics_port': self.network.metrics_port,
                'allowed_subnets': self.network.allowed_subnets,
                'discovery_enabled': self.network.discovery_enabled,
                'mdns_enabled': self.network.mdns_enabled,
            },
            'audio': {
                'enabled': self.audio_enabled,
                'device': self.audio_device,
                'sample_rate': self.sample_rate,
                'buffer_size': self.buffer_size,
            },
            'enabled_services': [s.value for s in self.enabled_services],
            'disabled_services': [s.value for s in self.disabled_services],
        }

class DeploymentConfigBuilder:
    """Builder for creating deployment configurations"""
    
    @staticmethod
    def all_in_one(hostname: str = "map2-desktop") -> DeploymentConfig:
        """Create all-in-one configuration"""
        config = DeploymentConfig(
            mode=DeploymentMode.ALL_IN_ONE,
            node_id=hostname,
            hostname=hostname,
            audio_enabled=True,
            enabled_services=[
                ServiceRole.AUDIO_ENGINE,
                ServiceRole.API_SERVER,
                ServiceRole.WEB_FRONTEND,
                ServiceRole.PLUGIN_MANAGER,
                ServiceRole.MIDI_SERVER,
                ServiceRole.DATABASE,
            ],
            network=NetworkConfig(
                bind_address="127.0.0.1",
                advertise_addresses=["127.0.0.1"],
                discovery_enabled=False,
            )
        )
        return config
    
    @staticmethod
    def backend_server(hostname: str = "map2-audio-server") -> DeploymentConfig:
        """Create backend server configuration"""
        config = DeploymentConfig(
            mode=DeploymentMode.BACKEND_SERVER,
            node_id=hostname,
            hostname=hostname,
            audio_enabled=True,
            enabled_services=[
                ServiceRole.AUDIO_ENGINE,
                ServiceRole.API_SERVER,
                ServiceRole.PLUGIN_MANAGER,
                ServiceRole.MIDI_SERVER,
                ServiceRole.DATABASE,
                ServiceRole.SERVICE_REGISTRY,
                ServiceRole.DISCOVERY_AGENT,
            ],
            network=NetworkConfig(
                bind_address="0.0.0.0",
                api_port=8080,
                discovery_enabled=True,
            )
        )
        return config
    
    @staticmethod
    def frontend_server(hostname: str = "map2-control") -> DeploymentConfig:
        """Create frontend server configuration"""
        config = DeploymentConfig(
            mode=DeploymentMode.FRONTEND_SERVER,
            node_id=hostname,
            hostname=hostname,
            audio_enabled=False,
            enabled_services=[
                ServiceRole.WEB_FRONTEND,
            ],
            network=NetworkConfig(
                web_port=3000,
                discovery_enabled=True,
            )
        )
        return config
```

**Checklist:**
- [ ] Create file with enum and dataclass definitions
- [ ] Implement validation logic
- [ ] Implement builder pattern
- [ ] Add comprehensive docstrings
- [ ] Create unit tests
- [ ] Test all three mode builders

**Testing:**
```bash
python -m pytest app/config/test_deployment.py -v
```

**Expected Output:**
```
test_deployment_all_in_one ... PASSED
test_deployment_backend_server ... PASSED
test_deployment_frontend_server ... PASSED
test_config_validation ... PASSED
test_mode_specific_validation ... PASSED
```

---

### Day 3-4: Persistent Configuration Storage

**Task 1.2: Create Deployment State Manager**

File: `app/config/deployment_state.py`

```python
"""
Deployment State Persistence
Saves and loads deployment configuration across restarts.
"""

import json
import logging
from pathlib import Path
from typing import Optional, List, Dict
from datetime import datetime
from .deployment import DeploymentConfig, DeploymentMode

logger = logging.getLogger(__name__)

class DeploymentState:
    """Manages persistent deployment state"""
    
    def __init__(self, config_dir: Optional[Path] = None):
        self.config_dir = config_dir or Path.home() / ".map2"
        self.config_dir.mkdir(parents=True, exist_ok=True)
        
        self.deployment_file = self.config_dir / "deployment.json"
        self.peers_file = self.config_dir / "discovered_peers.json"
        self.preferences_file = self.config_dir / "connection_prefs.json"
        
        logger.info(f"Deployment state directory: {self.config_dir}")
    
    async def save_deployment_config(self, config: DeploymentConfig) -> bool:
        """Save deployment configuration to disk"""
        try:
            config_dict = config.to_dict()
            config_dict['saved_at'] = datetime.now().isoformat()
            
            self.deployment_file.write_text(
                json.dumps(config_dict, indent=2, default=str)
            )
            logger.info(f"Saved deployment config: {config.mode.value}")
            return True
        except Exception as e:
            logger.error(f"Failed to save deployment config: {e}")
            return False
    
    async def load_deployment_config(self) -> Optional[DeploymentConfig]:
        """Load deployment configuration from disk"""
        try:
            if not self.deployment_file.exists():
                logger.info("No saved deployment config found")
                return None
            
            data = json.loads(self.deployment_file.read_text())
            
            # Reconstruct config from JSON
            config = DeploymentConfig(
                mode=DeploymentMode(data['mode']),
                node_id=data['node_id'],
                hostname=data['hostname'],
                version=data.get('version', '2.0.0'),
                audio_enabled=data.get('audio', {}).get('enabled', False),
                audio_device=data.get('audio', {}).get('device'),
                sample_rate=data.get('audio', {}).get('sample_rate', 48000),
                buffer_size=data.get('audio', {}).get('buffer_size', 256),
            )
            
            logger.info(f"Loaded deployment config: {config.mode.value}")
            return config
        except Exception as e:
            logger.error(f"Failed to load deployment config: {e}")
            return None
    
    async def save_discovered_peers(self, peers: List[Dict]) -> bool:
        """Save discovered peer information"""
        try:
            peers_data = {
                'discovered_at': datetime.now().isoformat(),
                'peers': peers
            }
            
            self.peers_file.write_text(
                json.dumps(peers_data, indent=2, default=str)
            )
            logger.info(f"Saved {len(peers)} discovered peers")
            return True
        except Exception as e:
            logger.error(f"Failed to save discovered peers: {e}")
            return False
    
    async def load_discovered_peers(self) -> List[Dict]:
        """Load previously discovered peers"""
        try:
            if not self.peers_file.exists():
                return []
            
            data = json.loads(self.peers_file.read_text())
            peers = data.get('peers', [])
            logger.info(f"Loaded {len(peers)} previously discovered peers")
            return peers
        except Exception as e:
            logger.error(f"Failed to load discovered peers: {e}")
            return []
    
    async def save_connection_preferences(self, prefs: Dict[str, str]) -> bool:
        """Save connection preferences"""
        try:
            prefs_data = {
                'saved_at': datetime.now().isoformat(),
                'preferences': prefs
            }
            
            self.preferences_file.write_text(
                json.dumps(prefs_data, indent=2)
            )
            logger.info("Saved connection preferences")
            return True
        except Exception as e:
            logger.error(f"Failed to save preferences: {e}")
            return False
    
    async def load_connection_preferences(self) -> Dict[str, str]:
        """Load connection preferences"""
        try:
            if not self.preferences_file.exists():
                return {}
            
            data = json.loads(self.preferences_file.read_text())
            prefs = data.get('preferences', {})
            logger.info("Loaded connection preferences")
            return prefs
        except Exception as e:
            logger.error(f"Failed to load preferences: {e}")
            return {}
    
    async def is_first_run(self) -> bool:
        """Check if this is first run"""
        return not self.deployment_file.exists()
```

**Checklist:**
- [ ] Create DeploymentState class
- [ ] Implement save/load methods
- [ ] Handle JSON serialization
- [ ] Create data directory structure
- [ ] Add comprehensive error handling
- [ ] Create unit tests
- [ ] Test persistence across restarts

---

### Day 5: Service Registry Foundation

**Task 1.3: Create Service Registry**

File: `app/services/service_registry.py`

```python
"""
Service Registry
Central registry for service locations and metadata.
"""

import logging
from typing import Dict, List, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)

class ServiceType(Enum):
    """Types of services in MAP2"""
    AUDIO_BACKEND = "audio_backend"
    AUDIO_FRONTEND = "audio_frontend"
    METRICS = "metrics"
    MIDI = "midi"
    DISCOVERY = "discovery"

@dataclass
class ServiceInfo:
    """Information about a service"""
    name: str
    service_type: ServiceType
    addresses: List[str]
    port: int
    version: str = "2.0.0"
    capabilities: List[str] = field(default_factory=list)
    metadata: Dict[str, str] = field(default_factory=dict)
    registered_at: datetime = field(default_factory=datetime.now)
    last_heartbeat: datetime = field(default_factory=datetime.now)
    healthy: bool = True
    
    def is_alive(self, timeout_seconds: int = 30) -> bool:
        """Check if service is still alive"""
        elapsed = (datetime.now() - self.last_heartbeat).total_seconds()
        return elapsed < timeout_seconds and self.healthy

class ServiceRegistry:
    """Central service registry"""
    
    def __init__(self):
        self._services: Dict[str, ServiceInfo] = {}
        self._watchers: Dict[str, List[Callable]] = {}
        logger.info("Service registry initialized")
    
    async def register_service(
        self,
        service_name: str,
        service_type: ServiceType,
        addresses: List[str],
        port: int,
        capabilities: List[str] = None,
        metadata: Dict[str, str] = None,
    ) -> bool:
        """Register a service"""
        try:
            service = ServiceInfo(
                name=service_name,
                service_type=service_type,
                addresses=addresses,
                port=port,
                capabilities=capabilities or [],
                metadata=metadata or {},
            )
            
            self._services[service_name] = service
            logger.info(f"Registered service: {service_name} ({service_type.value})")
            
            # Notify watchers
            await self._notify_watchers(service_type, "registered", service)
            return True
        except Exception as e:
            logger.error(f"Failed to register service: {e}")
            return False
    
    async def unregister_service(self, service_name: str) -> bool:
        """Unregister a service"""
        try:
            if service_name not in self._services:
                return False
            
            service = self._services.pop(service_name)
            logger.info(f"Unregistered service: {service_name}")
            
            # Notify watchers
            await self._notify_watchers(service.service_type, "unregistered", service)
            return True
        except Exception as e:
            logger.error(f"Failed to unregister service: {e}")
            return False
    
    async def update_service_health(self, service_name: str, healthy: bool):
        """Update service health status"""
        if service_name in self._services:
            service = self._services[service_name]
            service.healthy = healthy
            service.last_heartbeat = datetime.now()
    
    async def discover_services(self, service_type: ServiceType) -> List[ServiceInfo]:
        """Discover all services of a type"""
        return [
            svc for svc in self._services.values()
            if svc.service_type == service_type and svc.is_alive()
        ]
    
    async def get_service(self, service_name: str) -> Optional[ServiceInfo]:
        """Get a specific service"""
        return self._services.get(service_name)
    
    async def watch_services(
        self,
        service_type: ServiceType,
        callback: Callable,
    ):
        """Watch for service changes"""
        key = service_type.value
        if key not in self._watchers:
            self._watchers[key] = []
        self._watchers[key].append(callback)
    
    async def _notify_watchers(
        self,
        service_type: ServiceType,
        event: str,
        service: ServiceInfo,
    ):
        """Notify watchers of service changes"""
        key = service_type.value
        if key in self._watchers:
            for callback in self._watchers[key]:
                try:
                    await callback(event, service)
                except Exception as e:
                    logger.error(f"Watcher callback failed: {e}")

# Global registry instance
_registry: Optional[ServiceRegistry] = None

def get_registry() -> ServiceRegistry:
    """Get global service registry"""
    global _registry
    if _registry is None:
        _registry = ServiceRegistry()
    return _registry
```

**Checklist:**
- [ ] Create ServiceInfo dataclass
- [ ] Create ServiceRegistry class
- [ ] Implement registration/discovery
- [ ] Implement health tracking
- [ ] Implement watchers/callbacks
- [ ] Create unit tests
- [ ] Test service discovery workflow

---

### Day 5: Install Dependencies

**Task 1.4: Update Requirements**

File: `requirements.txt` (add to existing)

```
# Service Discovery
zeroconf>=0.60.0
ifaddr>=0.2.0

# Network utilities
dnspython>=2.4.0

# Async utilities (if not already present)
aiofiles>=23.0.0
```

**Checklist:**
- [ ] Add zeroconf library
- [ ] Add ifaddr library
- [ ] Run `pip install -r requirements.txt`
- [ ] Verify imports work
- [ ] Check for version conflicts

---

## Week 2: Network Discovery & Advanced Registry

### Day 6-7: mDNS Service Discovery

**Task 2.1: Create Network Discovery Agent**

File: `app/services/network_discovery.py`

```python
"""
Network Discovery Agent
Automatic service discovery using mDNS/Bonjour.
"""

import logging
import asyncio
from typing import List, Dict, Optional, Callable
from datetime import datetime
from zeroconf import ServiceBrowser, Zeroconf, ServiceInfo
from .service_registry import get_registry, ServiceType, ServiceInfo as RegServiceInfo

logger = logging.getLogger(__name__)

class DiscoveredService:
    """A discovered service"""
    def __init__(self, name: str, host: str, port: int, properties: Dict[str, str]):
        self.name = name
        self.host = host
        self.port = port
        self.properties = properties
        self.discovered_at = datetime.now()
        self.ip_addresses: List[str] = []

class NetworkDiscoveryAgent:
    """Handles mDNS service discovery"""
    
    def __init__(self):
        self.zeroconf = Zeroconf()
        self.discovered_services: Dict[str, DiscoveredService] = {}
        self._callbacks: List[Callable] = []
        logger.info("Network discovery agent initialized")
    
    async def advertise_backend_service(
        self,
        hostname: str,
        port: int,
        addresses: List[str],
        properties: Dict[str, str],
    ) -> bool:
        """Advertise a backend audio service"""
        try:
            service_name = f"map2-audio-{hostname}._map2-audio-backend._tcp.local."
            
            service_info = ServiceInfo(
                "_map2-audio-backend._tcp.local.",
                service_name,
                port=port,
                properties=properties,
                addresses=[addr.encode() for addr in addresses],
                server=f"{hostname}.local.",
            )
            
            self.zeroconf.register_service(service_info)
            logger.info(f"Advertised backend service: {service_name}")
            return True
        except Exception as e:
            logger.error(f"Failed to advertise service: {e}")
            return False
    
    async def advertise_frontend_service(
        self,
        hostname: str,
        port: int,
        properties: Dict[str, str],
    ) -> bool:
        """Advertise a frontend service"""
        try:
            service_name = f"map2-frontend-{hostname}._map2-frontend._tcp.local."
            
            service_info = ServiceInfo(
                "_map2-frontend._tcp.local.",
                service_name,
                port=port,
                properties=properties,
                server=f"{hostname}.local.",
            )
            
            self.zeroconf.register_service(service_info)
            logger.info(f"Advertised frontend service: {service_name}")
            return True
        except Exception as e:
            logger.error(f"Failed to advertise service: {e}")
            return False
    
    async def discover_backend_services(self) -> List[DiscoveredService]:
        """Discover MAP2 backend services"""
        return await self._discover_services("_map2-audio-backend._tcp.local.")
    
    async def discover_frontend_services(self) -> List[DiscoveredService]:
        """Discover MAP2 frontend services"""
        return await self._discover_services("_map2-frontend._tcp.local.")
    
    async def watch_services(
        self,
        service_type: str,
        callback: Callable,
    ):
        """Watch for service changes"""
        self._callbacks.append(callback)
        
        # Start browser for service type
        ServiceBrowser(
            self.zeroconf,
            service_type,
            handlers=[self._on_service_state_change],
        )
    
    def _on_service_state_change(self, zeroconf, service_type, name, state_change):
        """Handle service state changes"""
        if state_change.name == "Added":
            logger.debug(f"Service discovered: {name}")
        elif state_change.name == "Removed":
            logger.debug(f"Service removed: {name}")
        elif state_change.name == "Updated":
            logger.debug(f"Service updated: {name}")
    
    async def _discover_services(self, service_type: str) -> List[DiscoveredService]:
        """Discover services of a specific type"""
        services = []
        try:
            # Use zeroconf to browse for services
            logger.info(f"Browsing for {service_type} services...")
            
            def on_service_found(info):
                services.append(DiscoveredService(
                    name=info.name,
                    host=info.hostname or info.name,
                    port=info.port,
                    properties=info.properties or {},
                ))
            
            # Create a brief browser to discover services
            browser = ServiceBrowser(
                self.zeroconf,
                service_type,
                handlers=[on_service_found],
            )
            
            # Wait for discoveries
            await asyncio.sleep(2)
            
            logger.info(f"Discovered {len(services)} {service_type} services")
            return services
        except Exception as e:
            logger.error(f"Error discovering services: {e}")
            return []
    
    async def close(self):
        """Clean up discovery agent"""
        try:
            self.zeroconf.close()
            logger.info("Discovery agent closed")
        except Exception as e:
            logger.error(f"Error closing discovery agent: {e}")

# Global discovery agent instance
_agent: Optional[NetworkDiscoveryAgent] = None

def get_discovery_agent() -> NetworkDiscoveryAgent:
    """Get global discovery agent"""
    global _agent
    if _agent is None:
        _agent = NetworkDiscoveryAgent()
    return _agent
```

**Checklist:**
- [ ] Create NetworkDiscoveryAgent class
- [ ] Implement backend/frontend service advertising
- [ ] Implement service discovery
- [ ] Implement service watching
- [ ] Create integration tests
- [ ] Test with multiple services on same network

---

### Day 8-9: Network Configuration Detection

**Task 2.2: Create Network Detector**

File: `app/services/network_detector.py`

```python
"""
Network Detector
Detects available network interfaces and connectivity.
"""

import logging
import socket
from typing import List, Dict, Optional
from dataclasses import dataclass
import ifaddr
import asyncio
import subprocess

logger = logging.getLogger(__name__)

@dataclass
class NetworkInterface:
    """Information about a network interface"""
    name: str
    type: str  # ethernet, wireless, loopback, etc.
    ipv4_addresses: List[str]
    ipv6_addresses: List[str]
    mac_address: Optional[str]
    is_up: bool
    mtu: int = 1500
    speed: Optional[str] = None
    signal_strength: Optional[int] = None
    ssid: Optional[str] = None

class NetworkDetector:
    """Detects network interfaces and connectivity"""
    
    async def detect_networks(self) -> List[NetworkInterface]:
        """Detect all network interfaces"""
        interfaces = []
        
        try:
            for adapter in ifaddr.get_adapters():
                iface = NetworkInterface(
                    name=adapter.name,
                    type=self._get_interface_type(adapter.name),
                    ipv4_addresses=[
                        ip.ip for ip in adapter.ipv4
                        if ip.ip != "127.0.0.1"
                    ],
                    ipv6_addresses=[
                        ip.ip for ip in adapter.ipv6
                        if not ip.ip.startswith("fe80:")
                    ],
                    mac_address=adapter.mac_address,
                    is_up=True,  # Simplified - could check actual status
                )
                
                if iface.ipv4_addresses or iface.ipv6_addresses:
                    interfaces.append(iface)
            
            logger.info(f"Detected {len(interfaces)} network interfaces")
            return interfaces
        except Exception as e:
            logger.error(f"Error detecting networks: {e}")
            return []
    
    async def get_best_interface(self) -> Optional[NetworkInterface]:
        """Get best interface for network communication"""
        interfaces = await self.detect_networks()
        
        if not interfaces:
            return None
        
        # Prefer ethernet over wireless
        for iface in interfaces:
            if iface.type == "ethernet" and iface.ipv4_addresses:
                return iface
        
        # Fall back to wireless
        for iface in interfaces:
            if iface.type == "wireless" and iface.ipv4_addresses:
                return iface
        
        # Fall back to any interface with IPv4
        for iface in interfaces:
            if iface.ipv4_addresses:
                return iface
        
        return interfaces[0] if interfaces else None
    
    async def test_connectivity(
        self,
        host: str,
        port: int = 80,
        timeout: float = 2.0,
    ) -> bool:
        """Test connectivity to a host"""
        try:
            loop = asyncio.get_event_loop()
            await asyncio.wait_for(
                loop.create_connection(
                    lambda: asyncio.Protocol(),
                    host,
                    port,
                ),
                timeout=timeout,
            )
            return True
        except Exception:
            return False
    
    async def get_latency(
        self,
        host: str,
        timeout: float = 2.0,
    ) -> Optional[float]:
        """Get latency to a host (in milliseconds)"""
        try:
            result = subprocess.run(
                ["ping", "-c", "1", "-W", str(int(timeout * 1000)), host],
                capture_output=True,
                text=True,
                timeout=timeout + 1,
            )
            
            if result.returncode == 0:
                # Parse ping output
                for line in result.stdout.split("\n"):
                    if "time=" in line:
                        time_str = line.split("time=")[1].split(" ")[0]
                        return float(time_str)
            
            return None
        except Exception as e:
            logger.debug(f"Error measuring latency: {e}")
            return None
    
    def _get_interface_type(self, name: str) -> str:
        """Determine interface type"""
        name_lower = name.lower()
        
        if "lo" in name_lower:
            return "loopback"
        elif "eth" in name_lower or "en" in name_lower:
            return "ethernet"
        elif "wlan" in name_lower or "wifii" in name_lower or "airport" in name_lower:
            return "wireless"
        elif "docker" in name_lower or "veth" in name_lower:
            return "container"
        elif "vir" in name_lower or "vbox" in name_lower:
            return "virtual"
        else:
            return "other"
```

**Checklist:**
- [ ] Create NetworkDetector class
- [ ] Implement interface detection
- [ ] Implement connectivity testing
- [ ] Implement latency measurement
- [ ] Create unit tests
- [ ] Test on multiple systems (Linux, macOS)

---

### Day 10: Documentation and Testing

**Task 2.3: Phase 1 Testing & Documentation**

Files:
- `tests/test_deployment_config.py`
- `tests/test_service_registry.py`
- `tests/test_network_discovery.py`
- `tests/test_network_detector.py`
- `docs/DEPLOYMENT_ARCHITECTURE_PHASE1.md`

**Checklist:**
- [ ] Create comprehensive unit tests
- [ ] Create integration tests
- [ ] Test all three deployment modes
- [ ] Test service registry operations
- [ ] Test network discovery
- [ ] Test network detection
- [ ] Create Phase 1 completion document
- [ ] Run full test suite: `pytest tests/ -v`
- [ ] Check test coverage: `pytest --cov=app tests/`

---

## Phase 2: TUI Interface (Weeks 3-4)

### Overview

Build the beautiful, world-class setup wizard TUI with all screens, animations, and interactions.

### Key Deliverables

1. **Base Setup Wizard Screen** - Main orchestrator
2. **Mode Selection Screen** - Choose deployment mode
3. **Configuration Screens** - Details for each mode
4. **Discovery Screen** - List discovered backends
5. **Validation Screen** - Pre-flight checks
6. **Status Screen** - Running system monitoring

### Architecture

```
SetupWizardApp (main)
  ├─ LaunchScreen
  ├─ ModeSelectionScreen
  ├─ ConfigurationScreen (A/B/C variants)
  ├─ DiscoveryScreen
  ├─ ValidationScreen
  ├─ ReadyScreen
  └─ StatusScreen

Supporting Widgets:
  ├─ StatusIndicator
  ├─ ProgressBar
  ├─ ConfigurationPanel
  ├─ NetworkPanel
  └─ StatusPanel
```

### Day 11-14: Base Infrastructure & Screens

**Tasks:**
- [ ] Create `tui/screens/setup_wizard_base.py` with BaseSetupScreen
- [ ] Create `tui/screens/setup_wizard_app.py` with SetupWizardApp
- [ ] Create `tui/screens/mode_selection_screen.py`
- [ ] Create `tui/screens/configuration_screen.py`
- [ ] Create `tui/screens/discovery_screen.py`
- [ ] Create `tui/screens/validation_screen.py`
- [ ] Create `tui/screens/ready_screen.py`
- [ ] Create `tui/screens/status_screen.py`
- [ ] Create `tui/widgets/status_widgets.py`
- [ ] Create `tui/styles/setup_wizard.css`

### Day 15-18: Integration & Animations

**Tasks:**
- [ ] Implement screen transitions
- [ ] Add animations (loading, success, errors)
- [ ] Implement all keyboard shortcuts
- [ ] Add form validation
- [ ] Create error handlers
- [ ] Test all screen flows
- [ ] Optimize performance
- [ ] Polish animations

### Day 19-20: Testing & Documentation

**Tasks:**
- [ ] Create TUI integration tests
- [ ] Create user interaction tests
- [ ] Test all screen flows
- [ ] Test error conditions
- [ ] Create TUI user guide
- [ ] Create developer documentation
- [ ] Performance testing
- [ ] Final polish

---

## Phase 3-6: Remaining Implementation

(Similar detailed breakdowns for each phase, including):

- **Phase 3:** Network configuration automation
- **Phase 4:** Service routing and fallback
- **Phase 5:** Integration and testing
- **Phase 6:** Hardening and documentation

---

## Resource Requirements

### Development Team
- 1 Full-time Backend Developer (Deployment infrastructure)
- 1 Full-time Frontend/TUI Developer (Interface)
- 1 Part-time DevOps/QA (Testing, deployment)

### Tools & Services
- GitHub for version control
- GitHub Actions for CI/CD
- Pytest for testing framework
- Textual for TUI development

### Testing Infrastructure
- Vagrant/Docker for multi-node testing
- Network emulation tools for latency testing
- Multiple OS testing (Linux, macOS, Windows)

---

## Success Metrics

### Phase 1
- [ ] All deployment configs persist correctly
- [ ] Service registry handles 100+ services
- [ ] mDNS discovery finds all services < 2 seconds
- [ ] 95%+ test coverage on core modules

### Phase 2
- [ ] Setup wizard completes in < 5 minutes
- [ ] All 6 screens tested with user feedback
- [ ] Animations smooth and responsive
- [ ] Error messages clear and helpful

### Phase 3
- [ ] Automatic firewall configuration works
- [ ] Network validation catches all issues
- [ ] Port conflicts detected and resolved
- [ ] Network setup validated before startup

### Phase 4
- [ ] Frontend discovers and connects to backends
- [ ] Request routing works across network
- [ ] Failover works automatically
- [ ] Offline cache enables local operation

### Phase 5
- [ ] Full integration testing passes
- [ ] All deployment modes functional
- [ ] Documentation complete
- [ ] Ready for beta testing

### Phase 6
- [ ] 99%+ system uptime
- [ ] All error conditions handled gracefully
- [ ] Performance benchmarks met
- [ ] Production-ready release

---

## Risk Mitigation

### High Risk: Network unreliability
**Mitigation:** Implement aggressive retry logic, local fallback cache, clear error messages

### High Risk: mDNS not available on target networks
**Mitigation:** Provide manual IP configuration option, support DNS-based discovery fallback

### Medium Risk: Performance impact of discovery
**Mitigation:** Optimize discovery queries, cache results, use separate discovery threads

### Medium Risk: Firewall blocking ports
**Mitigation:** Auto-detect firewall, provide auto-fix for common firewalls, manual instructions

---

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| 1 | 2 weeks | Core infrastructure, service registry, mDNS |
| 2 | 2 weeks | TUI setup wizard, all screens |
| 3 | 1 week | Network automation, firewall config |
| 4 | 1 week | Service routing, fallback logic |
| 5 | 1 week | Integration, testing, documentation |
| 6 | 1 week | Hardening, performance, release |
| **Total** | **~8 weeks** | **Production-ready distributed platform** |

---

**Document Status:** IMPLEMENTATION PLAN COMPLETE ✓  
**Last Updated:** February 4, 2025  
**Ready to Begin:** Phase 1, Week 1, Day 1

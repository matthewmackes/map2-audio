# 🌐 MAP2 Audio Platform - Distributed Deployment Architecture

## Executive Summary

This document outlines a comprehensive, **world-class solution** for deploying MAP2 Audio Platform in three distinct modes with automatic discovery, configuration, and seamless connectivity. The solution prioritizes **ease of use, reliability, and professional presentation** while maintaining full audio processing capabilities across all deployment modes.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Deployment Modes](#deployment-modes)
3. [Core Components](#core-components)
4. [Service Discovery System](#service-discovery-system)
5. [Network Configuration Automation](#network-configuration-automation)
6. [TUI Interface Design](#tui-interface-design)
7. [Implementation Roadmap](#implementation-roadmap)
8. [Technical Specifications](#technical-specifications)

---

## Architecture Overview

### Vision

MAP2 Audio Platform becomes a **distributed, composable system** where:
- Users can choose deployment topology at initialization
- Automatic discovery eliminates manual configuration
- Network issues are handled gracefully with fallback strategies
- All components can communicate securely and efficiently
- Professional, intuitive TUI guides the entire setup process

### System Design Principles

1. **Single Codebase, Multiple Modes** - Same software, different service configurations
2. **Zero-Touch Discovery** - Nodes find each other automatically on local network
3. **Graceful Degradation** - System works even if some services unavailable
4. **Professional UX** - Beautiful TUI, clear status, helpful error messages
5. **Enterprise-Grade** - Security, reliability, monitoring, logging
6. **Network-Aware** - Handles WiFi, Ethernet, disconnections, latency

### Core Two-Node Split (New Design Center)

The **core design** separates real-time JUCE audio processing from all other services:

```
┌───────────────────────────────┐        ┌──────────────────────────────────┐
│         AUDIO NODE            │        │          CONTROL NODE            │
│      (JUCE Processing)        │◄──────►│   (All Other Processing)         │
├───────────────────────────────┤        ├──────────────────────────────────┤
│  JUCE Audio Engine            │        │  API Server (FastAPI)            │
│  Audio I/O (ALSA/JACK)         │        │  Web UI (React)                  │
│  Plugin Hosting (LV2/VST3)     │        │  TUI Setup Wizard                │
│  Real-time DSP Graph           │        │  Service Discovery (mDNS)        │
│  Low-latency processing         │        │  Routing / Gateway               │
└───────────────────────────────┘        │  Database / Presets              │
                                         │  Monitoring / Metrics            │
                                         └──────────────────────────────────┘
```

This split is the **default topology**. The three deployment modes describe how these two roles are co-located or separated.

### Node Identity & Trust Requirements

**Hostname and Broadcast Identity:**
- Audio processing nodes must identify as `AUDIO-NODE-<ID4>`
- Control plane nodes must identify as `CONTROL-NODE-<ID4>`
- `<ID4>` is derived from the last 4 characters of a unique system identifier

**Accounts & SSH Trust:**
- Create user `mm` on all nodes
- Establish mutual SSH trust between all nodes (passwordless)

---

## Deployment Modes

### Mode A: All-in-One (Single Instance)

**Use Case:** Single device, all capabilities, no networking needed

```
┌─────────────────────────────────────┐
│     MAP2 Audio Platform (All-in-One) │
├─────────────────────────────────────┤
│  CONTROL NODE (Co-located)           │
│  - Web UI / Web App (Port 3000)      │
│  - TUI Interface                      │
│  - API + Routing (Port 8080)         │
│  - Database / Presets                │
├─────────────────────────────────────┤
│  AUDIO NODE (JUCE, same host)        │
│  - JUCE Audio Engine                 │
│  - Plugin Hosting (LV2/VST3)         │
│  - Real-time DSP Graph               │
│  - Audio/MIDI I/O                    │
└─────────────────────────────────────┘

Latency: < 1ms
Configuration: Zero
Network: Not required
CPU: All on single machine
```

**Services Enabled:**
- Audio Engine
- DSP Processor
- Database
- Web Server
- API Server
- WebSocket Server
- Plugin Management
- MIDI Server
- Real-time Monitoring

**Configuration:**
```yaml
deployment_mode: all_in_one
backend_host: localhost
backend_port: 8080
frontend_port: 3000
discovery_enabled: false
network_mode: local
```

---

### Mode B: Backend Server (Split Nodes)

**Use Case:** Central audio processing node, serving multiple frontends

```
┌──────────────────────────────────┐        ┌──────────────────────────────────┐
│     AUDIO NODE (JUCE)             │◄──────►│      CONTROL NODE               │
├──────────────────────────────────┤        ├──────────────────────────────────┤
│  JUCE Audio Engine                │        │  API Server (Port 8080)          │
│  Real-time Processing             │        │  Web UI / TUI (Port 3000)        │
│  Plugin Hosting (LV2/VST3)         │        │  Database (master)               │
│  Audio/MIDI I/O                   │        │  WebSocket Server                │
│  Low-latency DSP Graph            │        │  Service Registry                │
├──────────────────────────────────┤        ├──────────────────────────────────┤
│  System Services                  │        │  Network Services                │
│  - Audio Hardware Driver          │        │  - mDNS Advertiser               │
│  - MIDI Interface                 │        │  - Discovery Agent               │
│  - Plugin Scanner                 │        │  - Peer Connector                │
│  - Metrics Collection             │        │  - Metrics Exporter              │
└──────────────────────────────────┘        └──────────────────────────────────┘
        ▲           ▲           ▲
        │           │           │
   (network)   (network)   (network)
        │           │           │
┌───────┴─┐  ┌──────┴──┐  ┌────┴───┐
│Frontend │  │Frontend │  │Frontend │
│  Node 1 │  │  Node 2 │  │  Node 3 │
└─────────┘  └─────────┘  └─────────┘
```

**Services Enabled:**
- Audio Engine (full)
- DSP Processor
- Database (primary)
- API Server
- WebSocket Server
- Plugin Management (full)
- MIDI Server
- Service Registry
- Metrics Exporter
- Service Discovery mDNS

**Services Disabled:**
- Web Frontend
- TUI (optional, for backend management only)

**Configuration:**
```yaml
deployment_mode: backend_server
backend_host: 0.0.0.0
backend_port: 8080
discovery_mode: advertiser
database_role: primary
audio_hardware: enabled
allowed_client_subnets:
  - 192.168.1.0/24
  - 192.168.0.0/24
```

---

### Mode C: Frontend Server

**Use Case:** Remote control/monitoring of backend audio server

```
┌─────────────────────────────┐
│   MAP2 Frontend Server       │
├─────────────────────────────┤
│  Web UI (Port 3000)          │
│  - React Web Application     │
│  - Real-time Control UI      │
│  - Parameter Management      │
│  - Preset Control            │
├─────────────────────────────┤
│  TUI Application             │
│  - Terminal Control Interface│
│  - Quick Access Controls     │
│  - Performance Monitoring    │
├─────────────────────────────┤
│  Client Services             │
│  - Backend Discovery Client  │
│  - Service Connector         │
│  - Local Cache               │
│  - Fallback UI               │
└─────────────────────────────┘
        │
        │ (Network Request)
        │ Port 8080
        ▼
┌─────────────────────────────┐
│ Backend Audio Server         │
│ (discovered automatically)   │
└─────────────────────────────┘
```

**Services Enabled:**
- Web Frontend
- TUI Interface
- Discovery Client
- Local Cache
- Offline UI Fallback
- Parameter Routing
- Metrics Display

**Services Disabled:**
- Audio Engine
- DSP Processor
- Database
- API Server
- Plugin Scanner
- MIDI Server

**Configuration:**
```yaml
deployment_mode: frontend_server
backend_discovery: enabled
backend_host: auto  # discovered
backend_port: 8080
frontend_port: 3000
cache_enabled: true
offline_mode: fallback
ui_mode: full
```

---

## Core Components

### 1. **Deployment Configuration Engine** (`app/config/deployment.py`)

Manages deployment mode selection and validation:

```python
class DeploymentMode(Enum):
    ALL_IN_ONE = "all_in_one"
    BACKEND_SERVER = "backend_server"
    FRONTEND_SERVER = "frontend_server"

class DeploymentConfig:
    mode: DeploymentMode
    role: str
    node_id: str
    hostname: str
    
    # Network settings
    bind_address: str
    api_port: int
    advertise_addresses: List[str]
    
    # Service configuration
    enabled_services: List[str]
    disabled_services: List[str]
    
    # Discovery settings
    discovery_mode: str  # advertiser, client, disabled
    discovery_timeout: int
    
    # Security
    api_key: str
    allowed_subnets: List[str]
    tls_enabled: bool
```

### 2. **Service Registry & Discovery** (`app/services/service_registry.py`)

Central registry for service locations and health:

```python
class ServiceRegistry:
    # Register a service for discovery
    async def register_service(
        self,
        service_name: str,
        service_type: str,
        addresses: List[str],
        port: int,
        metadata: Dict[str, str]
    )
    
    # Deregister service
    async def unregister_service(self, service_name: str)
    
    # Discover services by type
    async def discover_services(
        self,
        service_type: str
    ) -> List[ServiceInfo]
    
    # Watch for service changes
    async def watch_services(
        self,
        service_type: str,
        callback: Callable
    )
    
    # Get service health
    async def get_service_health(
        self,
        service_name: str
    ) -> ServiceHealth
```

### 3. **Network Discovery Agent** (`app/services/network_discovery.py`)

Automatic service discovery using mDNS/Bonjour:

```python
class NetworkDiscoveryAgent:
    async def advertise_services(self):
        """Advertise MAP2 services on network"""
        # For backends: advertise audio-backend service
        # mDNS name: map2-audio-{node-id}._map2-audio._tcp.local
        
    async def discover_backends(self) -> List[BackendInfo]:
        """Discover available MAP2 backend servers"""
        # Browse for map2-audio services
        # Return list of discovered backends
        
    async def discover_frontends(self) -> List[FrontendInfo]:
        """Discover available MAP2 frontend servers"""
        # Browse for map2-frontend services
        
    async def watch_service_changes(self, callback):
        """Monitor service availability in real-time"""
```

### 4. **Service Router & Proxy** (`app/services/service_router.py`)

Routes requests to appropriate backend:

```python
class ServiceRouter:
    async def route_to_backend(
        self,
        request: Request,
        endpoint: str
    ) -> Response:
        """Route request to discovered backend"""
        # Find best backend (latency, availability)
        # Forward request
        # Handle timeouts and fallback
        
    async def get_backend_status(self) -> BackendStatus:
        """Get current backend status"""
        
    async def switch_backend(self, backend_id: str):
        """Switch to different backend server"""
```

### 5. **Configuration Persistence** (`app/config/deployment_state.py`)

Saves deployment choices across restarts:

```python
class DeploymentState:
    """Persistent storage of deployment configuration"""
    
    config_file: str  # ~/.map2/deployment.json
    
    async def save_deployment_config(self, config: DeploymentConfig)
    async def load_deployment_config(self) -> Optional[DeploymentConfig]
    async def save_discovered_peers(self, peers: List[PeerInfo])
    async def load_discovered_peers(self) -> List[PeerInfo]
    async def save_connection_preferences(self, prefs: Dict[str, str])
```

---

## Service Discovery System

### mDNS Service Advertisement

All modes advertise their services via mDNS (Multicast DNS) for automatic discovery.

#### Backend Services

```
Service: AUDIO-NODE-<ID4>._map2-audio-backend._tcp.local
Port: 8080
TXT Records:
  version=2.0.0
  mode=audio_node
  capabilities=audio,plugins,midi
  node_id={unique_system_id}
  hostname=AUDIO-NODE-<ID4>
  api_version=v1
  database=master
```

#### Frontend Services

```
Service: CONTROL-NODE-<ID4>._map2-frontend._tcp.local
Port: 3000
TXT Records:
  version=2.0.0
  mode=control_node
  node_id={unique_system_id}
  hostname=CONTROL-NODE-<ID4>
  ui_type=web,tui
```

### Discovery Workflow

**Backend Discovery (Frontend initiating)**

```
1. Frontend boots, needs backend
2. Browser for "_map2-audio-backend._tcp.local"
3. Display found backends to user:
   - Hostname
   - Signal strength (if WiFi)
   - Latency
   - Available capabilities
   - Last seen
4. User selects or auto-connect to best
5. Test connection, verify compatibility
6. Save preference, connect
```

**Automatic Reconnection**

```
Frontend maintains watch on discovered backends:
- If current backend unavailable, try next best
- User notification of connection changes
- Automatic fallback to offline mode if needed
```

### Implementation: Zeroconf Library

```python
# Use zeroconf library (pure Python, no dependencies)
from zeroconf import ServiceBrowser, Zeroconf, ServiceInfo

class DiscoveryClient:
    def __init__(self):
        self.zeroconf = Zeroconf()
        
    def discover_backends(self) -> List[BackendInfo]:
        """Discover MAP2 backends on network"""
        services = []
        
        def on_service_found(info: ServiceInfo):
            services.append({
                'name': info.name,
                'host': info.hostname,
                'port': info.port,
                'addresses': info.addresses,
                'properties': info.properties
            })
        
        browser = ServiceBrowser(
            self.zeroconf,
            "_map2-audio-backend._tcp.local.",
            handlers=[on_service_found]
        )
        
        return services
```

---

## Network Configuration Automation

### Network Detection

**Automatic Network Interface Detection**

```python
class NetworkDetector:
    async def detect_networks(self) -> List[NetworkInterface]:
        """Detect available network interfaces"""
        return [
            {
                'name': 'eth0',
                'type': 'ethernet',
                'ipv4': '192.168.1.100',
                'ipv6': 'fe80::1',
                'status': 'up',
                'mtu': 1500,
                'speed': '1Gbps'
            },
            {
                'name': 'wlan0',
                'type': 'wireless',
                'ipv4': '192.168.1.101',
                'status': 'up',
                'signal': 85,
                'ssid': 'Home-WiFi'
            }
        ]
    
    async def get_best_interface(self) -> NetworkInterface:
        """Get best network interface for audio"""
        # Prefer wired (lower latency, stability)
        # Consider speed and signal strength
        # Return interface suitable for real-time audio
```

### Firewall & Port Configuration

**Automatic Firewall Rules (Linux/macOS)**

```python
class FirewallConfigurator:
    async def open_ports(self, deployment_mode: DeploymentMode):
        """Automatically configure firewall rules"""
        
        ports_needed = {
            'all_in_one': [3000, 8080, 5353],
            'backend_server': [8080, 5353, 9090],  # 9090 for metrics
            'frontend_server': [3000, 5353]
        }
        
        for port in ports_needed[deployment_mode]:
            # Linux: ufw allow {port}
            # macOS: pfctl rules
            # Fallback: manual instructions
            
    async def validate_ports(self) -> bool:
        """Check if required ports are open"""
        
    async def suggest_port_changes(self, conflicts: List[int]) -> List[str]:
        """Suggest alternative ports if conflicts"""
```

### Network Configuration

**Static IP Configuration (Optional)**

```python
class NetworkConfigurator:
    async def configure_static_ip(self, interface: str, ip: str):
        """Configure static IP for network interface"""
        # Generate netplan/systemd-networkd config
        # Or fallback to manual instructions
        
    async def suggest_network_config(self) -> NetworkConfig:
        """Suggest optimal network configuration"""
        # Detect current network
        # Suggest static IPs in 192.168.1.x range
        # Recommend low-latency settings
        
    async def validate_network_connectivity(self, target_host: str) -> bool:
        """Test connectivity to remote host"""
        # Ping, traceroute, latency check
        # Return detailed connectivity info
```

### DNS Configuration

**mDNS Hostname Setup**

```python
class HostnameConfigurator:
    async def set_mdns_hostname(self, hostname: str):
        """Set mDNS hostname for node"""
        # .local domain registration
        # Ensure unique names on network
        
    async def get_accessible_hostnames(self) -> List[str]:
        """Get all ways this node is accessible"""
        # hostname.local
        # IP addresses
        # Service names
```

---

## TUI Interface Design

### Design Philosophy

The TUI is **world-class**, meaning:
- **Beautiful**: Attractive color scheme, smooth animations, clear typography
- **Intuitive**: Clear workflows, helpful hints, minimal friction
- **Responsive**: Fast feedback, no lag, smooth transitions
- **Professional**: Enterprise-grade appearance, polished details
- **Accessible**: Clear navigation, keyboard support, helpful error messages

### Launch Flow

```
┌─────────────────────────────────────────────────────────┐
│                     MAP2 AUDIO PLATFORM                 │
│                   Deployment Configuration               │
└─────────────────────────────────────────────────────────┘

                  ┌─────────────────┐
                  │  First Time?     │
                  └────────┬─────────┘
                           │
             ┌─────────────┼─────────────┐
             │             │             │
             ▼             ▼             ▼
      ┌──────────┐  ┌──────────┐  ┌──────────┐
      │ Mode A   │  │ Mode B   │  │ Mode C   │
      │All-in-One│  │ Backend  │  │ Frontend │
      └────┬─────┘  └────┬─────┘  └────┬─────┘
           │             │             │
           │             │             │
           ▼             ▼             ▼
      [Details]     [Details]     [Discovery]
       [Continue]     [Continue]     [Continue]
```

### Screen 1: Welcome & Mode Selection

```
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║              🎵 MAP2 AUDIO PLATFORM v2.0                      ║
║           Distributed Deployment Configuration               ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

Welcome! This is your first time running MAP2. Let's get you
set up in just a few minutes.

Choose your deployment mode:

  ❯ A) All-in-One          [localhost only]
      Single device with frontend & backend
      Best for: Desktop/Laptop, standalone use
      
  ( ) B) Backend Server     [network audio processor]
      Central audio processing server
      Best for: Professional studios, multi-user setups
      
  ( ) C) Frontend Server    [remote control]
      Web UI connecting to remote backend
      Best for: Tablets, secondary devices

🔍 Learn more about each mode: [?]
⏎ Select and continue | q: Quit
```

### Screen 2a: All-in-One Details

```
╔═══════════════════════════════════════════════════════════════╗
║ MODE A: ALL-IN-ONE CONFIGURATION                            ║
╚═══════════════════════════════════════════════════════════════╝

This device will run both the audio engine and web interface.

▸ Network Configuration
  ├─ Hostname:              map2-desktop
  ├─ Web UI Port:           3000
  ├─ Backend Port:          8080
  └─ mDNS Advertisement:    [ ON ] • Discoverable as map2-desktop.local

▸ Audio Configuration
  ├─ Audio Device:          [AUTO-DETECT]
  ├─ Sample Rate:           48000 Hz
  ├─ Buffer Size:           256 samples
  └─ Latency:               ~5ms

▸ Database
  ├─ Location:              ~/.map2/map2.db
  └─ Auto-backup:           [ ON ] Daily

┌─────────────────────────────────────────────────────────────┐
│ ✓ All settings configured and validated                      │
│                                                               │
│ [< Back]                                  [Next: Start Up >]  │
└─────────────────────────────────────────────────────────────┘
```

### Screen 2b: Backend Server Details

```
╔═══════════════════════════════════════════════════════════════╗
║ MODE B: BACKEND SERVER CONFIGURATION                         ║
╚═══════════════════════════════════════════════════════════════╝

Configure this device as a central audio processing server.

▸ Server Identity
  ├─ Node ID:               map2-studio-main
  ├─ Hostname:              studio-main
  └─ mDNS Name:             map2-audio-studio-main._map2-audio._tcp

▸ Network Binding
  ├─ Bind Address:          [ 0.0.0.0 ] (all interfaces)
  ├─ API Port:              8080
  ├─ Metrics Port:          9090
  └─ Status:                ✓ All ports available

▸ Audio Processing
  ├─ Audio Device:          [AUTO-DETECT]
  ├─ MIDI Interface:        [AUTO-DETECT]
  ├─ Plugin Scan:           [ ON ]
  └─ Real-time Priority:    [ ON ]

▸ Network Access Control
  ├─ Allowed Subnets:
  │  ├─ 192.168.1.0/24 ✓
  │  ├─ 192.168.0.0/24 ✓
  │  └─ [+ Add Subnet]
  └─ API Key Authentication: [ENABLED]

┌─────────────────────────────────────────────────────────────┐
│ ✓ Configuration validated • Ready to serve clients           │
│                                                               │
│ [< Back]                                  [Next: Start Up >]  │
└─────────────────────────────────────────────────────────────┘
```

### Screen 2c: Frontend Discovery

```
╔═══════════════════════════════════════════════════════════════╗
║ MODE C: DISCOVERING BACKEND SERVERS...                       ║
╚═══════════════════════════════════════════════════════════════╝

Searching for available MAP2 audio servers on your network...

Discovered Servers:

  ❯ 🟢 studio-main (192.168.1.50)
      ├─ Status:          ONLINE
      ├─ Latency:         2.3ms
      ├─ Signal:          ▓▓▓▓▓ Excellent
      ├─ Capabilities:    audio, midi, plugins
      └─ Last Seen:       now

  ( ) 🟡 studio-secondary (192.168.1.51)
      ├─ Status:          ONLINE
      ├─ Latency:         5.6ms
      ├─ Signal:          ▓▓▓▓░ Good
      ├─ Capabilities:    audio, plugins
      └─ Last Seen:       2 minutes ago

  ( ) 🔴 office-system (192.168.1.100)
      ├─ Status:          OFFLINE (was online 30 min ago)
      ├─ Latency:         --
      ├─ Signal:          ░░░░░
      └─ Last Seen:       30 min ago

  [+ Configure Manually]

  ℹ No servers found? Ensure backend is running and on same network
    Press [S] to rescan, [M] for manual connection

┌─────────────────────────────────────────────────────────────┐
│ [< Back]  [S: Scan]  [M: Manual]  [Continue >]              │
└─────────────────────────────────────────────────────────────┘
```

### Screen 3: Network Validation

```
╔═══════════════════════════════════════════════════════════════╗
║ VALIDATING NETWORK CONFIGURATION                             ║
╚═══════════════════════════════════════════════════════════════╝

Running pre-flight checks...

  ✓ Network interfaces detected       [2 found]
  ✓ Hostname resolution working       [map2-desktop.local]
  ✓ mDNS/Bonjour responding           [online]
  
  [Checking Backend Connectivity...]
    ⟳ Connecting to studio-main (192.168.1.50)...
      └─ Latency: 2.3ms
      └─ API Version: 2.0.0
      └─ Capabilities Matched: ✓
  
  ✓ Backend connection successful
  
  [Checking Audio Device...]
    ✓ Default audio device: USB Audio Device
    ✓ Channels: 2 in / 2 out
    ✓ Sample rate: 48000 Hz
    
  [Checking Firewall...]
    ⚠ Port 8080 might be blocked by firewall
      Suggestion: Run 'sudo ufw allow 8080/tcp'
      [Apply Auto-Fix] [Dismiss] [Manual]

Press any key to continue...
```

### Screen 4: Ready to Start

```
╔═══════════════════════════════════════════════════════════════╗
║                     READY TO START                           ║
╚═══════════════════════════════════════════════════════════════╝

Your MAP2 Audio Platform is configured and ready!

Configuration Summary:

┌─────────────────────────────────────────────────────────────┐
│ MODE:          All-in-One (Local)                           │
│ HOSTNAME:      map2-desktop.local                           │
│ WEB UI:        http://localhost:3000                        │
│ API:           http://localhost:8080                        │
│ AUDIO:         USB Audio Device (48kHz, stereo)             │
│ STATUS:        ✓ Ready                                      │
└─────────────────────────────────────────────────────────────┘

Services to be started:
  ✓ Audio Engine
  ✓ Backend API (FastAPI)
  ✓ Web Server (Vite)
  ✓ Database
  ✓ Real-time Processor
  ✓ WebSocket Server

Next Steps:
  1. [Start Now]      - Launch services and open web UI
  2. [Start & Close]  - Start in background
  3. [Manual Start]   - Show startup commands
  4. [Review Config]  - Edit settings before starting

┌─────────────────────────────────────────────────────────────┐
│ [< Back]                                  [Start Now >]      │
└─────────────────────────────────────────────────────────────┘
```

### Screen 5: Running Status

```
╔═══════════════════════════════════════════════════════════════╗
║                      SYSTEM RUNNING                          ║
╚═══════════════════════════════════════════════════════════════╝

Your MAP2 Audio Platform is now running!

┌──────────────────────────────────────────────────────────────┐
│ REAL-TIME STATUS                                             │
├──────────────────────────────────────────────────────────────┤
│ Audio Engine:        ✓ Running    CPU: 12%  Latency: 4.2ms  │
│ Backend API:         ✓ Running    Uptime: 45s  Requests: 127 │
│ Web Interface:       ✓ Running    Port 3000 • 1 client      │
│ Database:            ✓ Running    145 presets loaded        │
│ Plugins:             ✓ Loaded     23 instruments available  │
│ Audio Device:        ✓ Connected  USB Audio Device (2ch)    │
└──────────────────────────────────────────────────────────────┘

Quick Access:

  [W] Web Interface      → http://localhost:3000
  [D] Diagnostics       → System Health & Performance
  [P] Preferences       → Configure settings
  [L] View Logs         → Real-time logs
  
  [M] Main Menu         → Navigate to other screens
  [Q] Quit              → Shutdown services

⚠ Note: Close this window to minimize MAP2 to system tray

                   Tip: Press 'W' to open web UI
```

### Transitions & Animations

```
Loading/Scanning:
  ⟳ Scanning networks...
  ↻ Discovering services...
  ◐ Connecting...

Success:
  ✓ Successfully connected (then fade)
  
Error:
  ✗ Connection failed (red flash)
  Suggestion: Check your network settings
  
Transitions between screens:
  - Smooth fade effect (0.3s)
  - Slide animation for modals (0.2s)
  - Color highlights for important info
```

---

## Implementation Roadmap

### Phase 1: Core Infrastructure (Weeks 1-2)

**Goals:**
- Deployment mode configuration engine
- Service registry foundation
- Basic mDNS discovery

**Tasks:**
- [ ] Create `app/config/deployment.py` with DeploymentMode enum and config classes
- [ ] Create `app/config/deployment_state.py` for persistence
- [ ] Create `app/services/service_registry.py` with ServiceRegistry class
- [ ] Install and configure `zeroconf` library
- [ ] Create `app/services/network_discovery.py` with basic mDNS registration

**Files to Create:**
- `app/config/deployment.py`
- `app/config/deployment_state.py`
- `app/services/service_registry.py`
- `app/services/network_discovery.py`
- `requirements.txt` (add zeroconf, ifaddr)

**Testing:**
- Unit tests for config validation
- Integration tests for service registration
- mDNS discovery tests

---

### Phase 2: TUI Interface (Weeks 2-3)

**Goals:**
- Beautiful, functional setup wizard
- Mode selection flow
- Configuration screens

**Tasks:**
- [ ] Create base TUI screen for setup wizard
- [ ] Implement mode selection screen
- [ ] Implement mode detail screens (2a, 2b, 2c)
- [ ] Implement network validation screen
- [ ] Implement ready-to-start screen
- [ ] Implement running status screen
- [ ] Add animations and styling

**Files to Create:**
- `tui/screens/setup_wizard_screen.py`
- `tui/screens/mode_selection_screen.py`
- `tui/screens/configuration_screen.py`
- `tui/screens/discovery_screen.py`
- `tui/screens/validation_screen.py`
- `tui/screens/status_screen.py`
- `tui/widgets/network_config_widgets.py`
- `tui/styles/setup_wizard.css`

**Dependencies:**
- Existing Textual framework
- Rich for formatting

---

### Phase 3: Network Configuration (Week 3)

**Goals:**
- Automatic network detection
- Firewall configuration
- Network validation

**Tasks:**
- [ ] Create `app/services/network_detector.py`
- [ ] Create `app/services/firewall_configurator.py`
- [ ] Create `app/services/network_configurator.py`
- [ ] Implement network interface detection
- [ ] Implement firewall rule generation
- [ ] Implement connectivity validation

**Files to Create:**
- `app/services/network_detector.py`
- `app/services/firewall_configurator.py`
- `app/services/network_configurator.py`
- `app/services/network_validator.py`

**Dependencies:**
- `ifaddr` for network interface detection
- `psutil` for system info

---

### Phase 4: Service Routing (Week 4)

**Goals:**
- Request routing to discovered backends
- Connection management
- Fallback handling

**Tasks:**
- [ ] Create `app/services/service_router.py`
- [ ] Implement backend discovery client
- [ ] Implement request routing
- [ ] Implement failover logic
- [ ] Implement local cache for offline mode

**Files to Create:**
- `app/services/service_router.py`
- `app/services/backend_connector.py`
- `app/services/request_router.py`
- `app/services/fallback_cache.py`

---

### Phase 5: Integration & Testing (Week 5)

**Goals:**
- Full integration of all components
- Comprehensive testing
- Documentation

**Tasks:**
- [ ] Update main.py to support deployment modes
- [ ] Update app startup to check deployment mode
- [ ] Integrate TUI setup wizard into main app
- [ ] Add integration tests
- [ ] Update documentation
- [ ] Create deployment guide

**Files to Update:**
- `app/main.py` - Add deployment mode startup
- `tui/app.py` - Integrate setup wizard
- `app/config.py` - Add deployment config sections

---

### Phase 6: Hardening & Polish (Week 6)

**Goals:**
- Production-ready reliability
- Error handling
- Performance optimization

**Tasks:**
- [ ] Comprehensive error handling
- [ ] Retry logic for network operations
- [ ] Performance optimization
- [ ] Security review
- [ ] Documentation completion
- [ ] User guide and troubleshooting

---

## Technical Specifications

### Network Ports

| Service | Port | Protocol | Mode(s) | Purpose |
|---------|------|----------|---------|---------|
| Web UI | 3000 | HTTP/WS | All | React frontend, WebSocket |
| Backend API | 8080 | HTTP/WS | A, B | FastAPI server |
| mDNS | 5353 | UDP | All | Service discovery |
| Metrics | 9090 | HTTP | B | Prometheus metrics |

### Service Names (mDNS)

```
Backend: map2-audio-{hostname}._map2-audio-backend._tcp.local
Frontend: map2-control-{hostname}._map2-frontend._tcp.local
```

### Configuration Files

**Primary:** `~/.map2/deployment.json`
```json
{
  "deployment_mode": "all_in_one",
  "mode_specific": {
    "backend": {
      "bind_address": "0.0.0.0",
      "api_port": 8080,
      "advertise_addresses": ["192.168.1.100"]
    }
  },
  "discovered_peers": [],
  "created_at": "2025-02-04T10:00:00Z"
}
```

### Discovery Protocol

**Service Registration (Backend):**
```python
{
    'name': 'map2-audio-studio-main._map2-audio-backend._tcp.local',
    'port': 8080,
    'addresses': ['192.168.1.50', 'fe80::1'],
    'properties': {
        'version': '2.0.0',
        'mode': 'backend',
        'capabilities': 'audio,plugins,midi',
        'node_id': 'abc-def-ghi-jkl',
        'api_version': 'v1'
    }
}
```

### API Extensions for Deployment

**New Endpoints:**
```
GET /api/deployment/mode              - Get current deployment mode
GET /api/deployment/config             - Get deployment configuration
POST /api/deployment/peers             - List discovered peers
POST /api/deployment/connect            - Connect to peer
GET /api/deployment/status              - System-wide status
GET /api/service/registry               - Service registry query
GET /api/network/interfaces             - Network interface info
```

---

## Success Criteria

1. **Zero-Touch Setup** - First-time user can deploy in < 5 minutes without manual config
2. **Automatic Discovery** - All nodes discover each other without manual IP entry
3. **Beautiful TUI** - Setup wizard is professional, animated, and intuitive
4. **Reliable Networking** - System handles network changes, failures gracefully
5. **Documentation** - Complete guides for all deployment modes
6. **Performance** - No latency impact from discovery system (< 1ms overhead)
7. **Scalability** - Works with 1 to 50+ nodes on same network
8. **Security** - API key authentication, network isolation options
9. **Monitoring** - Real-time status of all nodes and services
10. **Production Ready** - Enterprise-grade reliability, logging, error handling

---

## References & Resources

### Key Libraries

- **zeroconf**: Pure Python mDNS/DNS-SD implementation
- **ifaddr**: Get IP addresses of network interfaces
- **psutil**: System and process utilities
- **textual**: TUI framework (already used)
- **fastapi**: Web framework (already used)

### Standards

- RFC 6763 - DNS-Based Service Discovery
- RFC 6762 - Multicast DNS
- mDNS/Bonjour specification

### Related Projects

- Pipedal (similar distributed audio architecture)
- Supercollider (network audio server)
- Jack (low-latency audio networking)

---

**Document Status:** ARCHITECTURE COMPLETE ✓  
**Last Updated:** February 4, 2025  
**Next Step:** Begin Phase 1 implementation

# 🎯 MAP2 Distributed Deployment - Quick Reference Guide

## What Are We Building?

A **world-class distributed audio platform** where MAP2 can run in three modes:

| Mode | Purpose | Use Case |
|------|---------|----------|
| **All-in-One** | Frontend + Backend on same machine | Desktop/Laptop standalone |
| **Backend Server** | Central audio processor serving multiple UIs | Professional studio, multi-user |
| **Frontend Server** | Remote control connecting to audio server | Tablet, secondary device |

---

## Architecture at a Glance

```
Mode A: All-in-One           Mode B: Backend Server        Mode C: Frontend Server
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│  Frontend (3000) │         │  API (8080)      │◄────────│  Web UI (3000)   │
│  Backend  (8080) │         │  Audio Engine    │         │  Discovery Client│
│  Audio Engine    │         │  Database        │         │  Cache Layer     │
│  Database        │         │  mDNS Advertiser │         │  Fallback UI     │
└──────────────────┘         │  Metrics (9090)  │         └──────────────────┘
                             └──────────────────┘
```

---

## Key Components to Build

### 1. **Deployment Configuration System** (`app/config/deployment.py`)
```python
# Stores which mode the system runs in and what services are enabled
DeploymentConfig:
  - mode: all_in_one | backend_server | frontend_server
  - enabled_services: List[ServiceRole]
  - network: NetworkConfig
  - audio: AudioConfig
  - metadata: Dict
```

### 2. **Service Registry** (`app/services/service_registry.py`)
```python
# Central registry of all available services
ServiceRegistry:
  - register_service(name, type, addresses, port)
  - discover_services(type) -> List[ServiceInfo]
  - watch_services(type, callback)
  - update_service_health(name, healthy)
```

### 3. **Network Discovery** (`app/services/network_discovery.py`)
```python
# Automatic discovery using mDNS/Bonjour
NetworkDiscoveryAgent:
  - advertise_backend_service(...)
  - advertise_frontend_service(...)
  - discover_backend_services() -> List
  - discover_frontend_services() -> List
  - watch_services(type, callback)
```

### 4. **Network Configuration** (`app/services/network_detector.py`)
```python
# Detects networks and validates connectivity
NetworkDetector:
  - detect_networks() -> List[NetworkInterface]
  - get_best_interface() -> NetworkInterface
  - test_connectivity(host, port) -> bool
  - get_latency(host) -> float
```

### 5. **TUI Setup Wizard** (`tui/screens/setup_wizard_*.py`)
```
Beautiful, animated interface for choosing mode and configuring system:
  ├─ LaunchScreen (splash, welcome)
  ├─ ModeSelectionScreen (choose A/B/C)
  ├─ ConfigurationScreen (details for each mode)
  ├─ DiscoveryScreen (find backends if Frontend)
  ├─ ValidationScreen (pre-flight checks)
  ├─ ReadyScreen (summary, ready to start)
  └─ StatusScreen (running system monitoring)
```

### 6. **Service Router** (`app/services/service_router.py`)
```python
# Routes requests to appropriate backend
ServiceRouter:
  - route_to_backend(request, endpoint)
  - get_backend_status()
  - switch_backend(backend_id)
  - handle_failover()
```

---

## Deployment Flows

### Mode A: All-in-One Setup

```
1. User launches MAP2
2. First-run detection
3. Show welcome screen
4. User selects "All-in-One"
5. Auto-configure:
   - Hostname: map2-{hostname}
   - Ports: 3000 (web), 8080 (api)
   - Bind to localhost
   - Enable all services
6. Validate configuration
7. Start all services
8. Show status screen with web URL
9. Done! User opens http://localhost:3000
```

### Mode B: Backend Server Setup

```
1. User launches MAP2
2. First-run detection
3. Show welcome screen
4. User selects "Backend Server"
5. Configure:
   - Node ID: studio-main
   - Bind address: 0.0.0.0
   - API port: 8080
   - Advertise on network
   - Allow connections from subnets
6. Validate configuration
7. Register mDNS service
8. Start all backend services
9. Show status monitoring
10. Frontends can now discover this backend
```

### Mode C: Frontend Server Setup

```
1. User launches MAP2
2. First-run detection
3. Show welcome screen
4. User selects "Frontend Server"
5. Start discovery scan
6. Show found backends:
   - studio-main (192.168.1.50) ✓ Online
   - office-system (192.168.1.100) ⚠ Offline
7. User selects studio-main
8. Test connection
9. Validate connectivity
10. Save preference
11. Start web frontend
12. Web UI connects to backend
13. User can control remote audio system
```

---

## Service Discovery with mDNS

### How It Works

```
Backend Server announces itself:
  Service: map2-audio-studio-main._map2-audio-backend._tcp.local
  Port: 8080
  Properties:
    version=2.0.0
    capabilities=audio,midi,plugins
    node_id=abc-123
    
Frontend discovers by browsing:
  _map2-audio-backend._tcp.local
  → Finds "map2-audio-studio-main"
  → Gets IP, port, properties
  → Can now connect to http://studio-main:8080/api
```

### mDNS Service Names

```
Backend: map2-audio-{hostname}._map2-audio-backend._tcp.local
         Example: map2-audio-studio-main._map2-audio-backend._tcp.local
         
Frontend: map2-frontend-{hostname}._map2-frontend._tcp.local
          Example: map2-frontend-control-1._map2-frontend._tcp.local
```

---

## Network Configuration Automation

### Firewall Management

```
Mode A (All-in-One):
  - Ports needed: 3000 (web), 8080 (api)
  - Binding: localhost only (safe)
  - Auto-fix: N/A (local only)

Mode B (Backend Server):
  - Ports needed: 8080 (api), 5353 (mDNS), 9090 (metrics)
  - Binding: 0.0.0.0 (all interfaces)
  - Auto-fix: ufw allow 8080/tcp
  - Fallback: Manual instructions

Mode C (Frontend Server):
  - Ports needed: 3000 (web), 5353 (mDNS)
  - Binding: localhost + 0.0.0.0
  - Auto-fix: ufw allow 3000/tcp
```

### Network Validation Checks

```
✓ Interfaces detected
✓ Hostname resolution working
✓ mDNS/Bonjour responding
✓ Backend connectivity (if Frontend)
✓ Audio device present (if Backend/All-in-One)
⚠ Firewall ports open
✓ No port conflicts
```

---

## Configuration Files

### Primary Config: `~/.map2/deployment.json`

```json
{
  "deployment_mode": "all_in_one",
  "node_id": "map2-desktop",
  "hostname": "map2-desktop",
  "version": "2.0.0",
  "created_at": "2025-02-04T10:00:00Z",
  "network": {
    "bind_address": "127.0.0.1",
    "advertise_addresses": ["127.0.0.1"],
    "api_port": 8080,
    "web_port": 3000,
    "discovery_enabled": false,
    "mdns_enabled": false
  },
  "audio": {
    "enabled": true,
    "device": "USB Audio Device",
    "sample_rate": 48000,
    "buffer_size": 256
  },
  "enabled_services": [
    "audio_engine",
    "api_server",
    "web_frontend",
    "database"
  ]
}
```

### Other Config Files

```
~/.map2/discovered_peers.json      # Recently discovered services
~/.map2/connection_prefs.json      # Connection preferences
~/.map2/api_key                    # API authentication key
```

---

## API Endpoints (New)

### Deployment Management

```
GET  /api/deployment/mode              → Current mode
GET  /api/deployment/config             → Full config
GET  /api/deployment/status             → System status
POST /api/deployment/peers              → List discovered peers
POST /api/deployment/connect/{peer_id}  → Connect to peer
```

### Service Discovery

```
GET  /api/service/registry              → All registered services
GET  /api/service/{type}/discover       → Discover services of type
GET  /api/service/{name}/health         → Service health status
```

### Network Management

```
GET  /api/network/interfaces            → Network interfaces
GET  /api/network/connectivity          → Test connectivity
GET  /api/network/dns/{host}            → DNS lookup
```

---

## Testing Strategy

### Unit Tests

```
tests/test_deployment_config.py
  - Config creation and validation
  - Builder patterns
  - Mode-specific validation

tests/test_service_registry.py
  - Service registration
  - Service discovery
  - Health tracking
  - Watchers/callbacks

tests/test_network_discovery.py
  - mDNS registration
  - Service browsing
  - Property handling

tests/test_network_detector.py
  - Interface detection
  - Connectivity testing
  - Latency measurement
```

### Integration Tests

```
tests/integration/test_all_in_one_flow.py
  - Full setup and startup
  - Service connectivity
  - API responsiveness

tests/integration/test_distributed_setup.py
  - Backend discovery
  - Frontend connection
  - Request routing
  - Failover
```

### Performance Tests

```
tests/performance/test_discovery_latency.py
  - Service discovery speed
  - Registry query time
  - Network overhead

tests/performance/test_routing_latency.py
  - Request routing overhead
  - Failover time
  - Cache performance
```

---

## Development Workflow

### Phase 1: Core Infrastructure (Weeks 1-2)

```
Day 1-2:   Deployment config system
Day 3-4:   Persistent state management  
Day 5:     Service registry
Day 6-7:   mDNS discovery
Day 8-9:   Network detection
Day 10:    Testing & documentation
```

**Start:** `app/config/deployment.py`  
**Test:** `pytest tests/test_deployment_config.py -v`

### Phase 2: TUI Interface (Weeks 3-4)

```
Day 11-14: Screen implementation
Day 15-18: Animations & interactions
Day 19-20: Testing & polish
```

**Start:** `tui/screens/setup_wizard_base.py`  
**Test:** Run TUI and go through all flows

### Phase 3: Network Automation (Week 5)

```
Firewall configuration
DNS setup
Port validation
Auto-fixes
```

### Phase 4: Service Routing (Week 6)

```
Request routing to backends
Connection management
Fallback logic
Local caching
```

### Phase 5: Integration (Week 7)

```
Full end-to-end testing
Documentation
Performance tuning
```

### Phase 6: Hardening (Week 8)

```
Error handling
Security review
Monitoring/logging
Production release
```

---

## Key Files to Create

### Configuration
- `app/config/deployment.py` ✓ (to be created)
- `app/config/deployment_state.py` ✓ (to be created)

### Services
- `app/services/service_registry.py` ✓ (to be created)
- `app/services/network_discovery.py` ✓ (to be created)
- `app/services/network_detector.py` ✓ (to be created)
- `app/services/firewall_configurator.py` ✓ (to be created)
- `app/services/service_router.py` ✓ (to be created)
- `app/services/backend_connector.py` ✓ (to be created)

### TUI Screens
- `tui/screens/setup_wizard_base.py` ✓ (to be created)
- `tui/screens/mode_selection_screen.py` ✓ (to be created)
- `tui/screens/configuration_screen.py` ✓ (to be created)
- `tui/screens/discovery_screen.py` ✓ (to be created)
- `tui/screens/validation_screen.py` ✓ (to be created)
- `tui/screens/ready_screen.py` ✓ (to be created)
- `tui/screens/status_screen.py` ✓ (to be created)
- `tui/widgets/status_widgets.py` ✓ (to be created)
- `tui/styles/setup_wizard.css` ✓ (to be created)

### Tests
- `tests/test_deployment_config.py` ✓ (to be created)
- `tests/test_service_registry.py` ✓ (to be created)
- `tests/test_network_discovery.py` ✓ (to be created)
- `tests/integration/test_all_in_one_flow.py` ✓ (to be created)
- `tests/integration/test_distributed_setup.py` ✓ (to be created)

### Documentation
- `docs/DISTRIBUTED_DEPLOYMENT_ARCHITECTURE.md` ✓ (created)
- `docs/TUI_INTERFACE_DESIGN_SPECIFICATION.md` ✓ (created)
- `docs/IMPLEMENTATION_PLAN_DETAILED.md` ✓ (created)
- `docs/DEPLOYMENT_USER_GUIDE.md` ✓ (to be created)
- `docs/TROUBLESHOOTING_DEPLOYMENT.md` ✓ (to be created)

---

## Success Criteria Checklist

### Phase 1: Foundation
- [ ] Deployment configs persist and load correctly
- [ ] Service registry handles 100+ services
- [ ] mDNS discovery finds services < 2 seconds
- [ ] Network detection works on Linux/macOS
- [ ] 95%+ test coverage on core modules

### Phase 2: TUI
- [ ] Setup wizard completes in < 5 minutes  
- [ ] All screens render beautifully
- [ ] Animations smooth and responsive
- [ ] Keyboard navigation complete
- [ ] Error messages helpful and clear

### Phase 3-6: Integration
- [ ] All three modes fully functional
- [ ] Auto-discovery works reliably
- [ ] Network issues handled gracefully
- [ ] Performance meets requirements
- [ ] Documentation complete
- [ ] Production-ready

---

## Quick Start Reference

### To Run Full TUI Setup Wizard
```bash
cd /home/mm/map2-audio
python -m tui.setup_wizard_app
```

### To Start Map2 in All-in-One
```bash
cd /home/mm/map2-audio
python -c "from app.config.deployment import DeploymentConfigBuilder; \
           config = DeploymentConfigBuilder.all_in_one(); \
           print(config)"
```

### To Test Discovery
```bash
cd /home/mm/map2-audio
python -c "from app.services.network_discovery import get_discovery_agent; \
           import asyncio; \
           asyncio.run(get_discovery_agent().discover_backend_services())"
```

---

## Technologies Used

```
Backend:
  - FastAPI (web framework)
  - SQLAlchemy (ORM)
  - uvicorn (ASGI server)
  - Zeroconf (mDNS/Bonjour)
  - ifaddr (network interfaces)
  - psutil (system info)

Frontend/TUI:
  - Textual (TUI framework)
  - Rich (formatting)
  - React (web UI)

Testing:
  - pytest (test framework)
  - pytest-asyncio (async tests)
  - pytest-cov (coverage)

DevOps:
  - Docker (containerization)
  - systemd (service management)
  - GitHub Actions (CI/CD)
```

---

## Support & Contact

For questions or issues during implementation:

1. **Architecture Questions:** Review `DISTRIBUTED_DEPLOYMENT_ARCHITECTURE.md`
2. **Design Questions:** Review `TUI_INTERFACE_DESIGN_SPECIFICATION.md`
3. **Implementation Questions:** Review `IMPLEMENTATION_PLAN_DETAILED.md`
4. **Code Patterns:** Check example implementations in this guide

---

## Related Documentation

- [Platform Architecture](./DISTRIBUTED_DEPLOYMENT_ARCHITECTURE.md)
- [TUI Design Specification](./TUI_INTERFACE_DESIGN_SPECIFICATION.md)
- [Implementation Plan](./IMPLEMENTATION_PLAN_DETAILED.md)
- [README](../README.md)

---

**Status:** Ready to implement  
**Last Updated:** February 4, 2025  
**Next Step:** Begin Phase 1 - Create `app/config/deployment.py`

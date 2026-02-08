# MAP2 Cluster Management - Developer Quick-Start

This document helps you quickly understand and continue the cluster management implementation.

## 📍 Current Status

- **Tasks Completed:** 2 of 50 (4%)
- **Phase:** 1 of 16 (Foundation)
- **Foundation Implementation:** ✅ COMPLETE
- **Next Task:** #3 (Zero-Touch Provisioning)

## 🗂️ Project Files

### **Core Implementation**
- `app/services/cluster/__init__.py` - Base classes and enums (350 lines)
- `app/services/cluster/enhanced_node_identity.py` - Node identity and hardware detection (550 lines)

### **Documentation**
- `CLUSTER_MANAGEMENT_IMPLEMENTATION_GUIDE.md` - Complete 50-task specification (4,200+ lines)
- `CLUSTER_PROJECT_SUMMARY.md` - Executive summary and next steps
- `CLUSTER_SETUP_GUIDE.md` - [To be created with Task 32]

## 🎯 Quick Reference

### Key Classes (Already Implemented)

**`ClusterNodeRole` (Enum)**
```python
AUDIO_NODE = "AUDIO-NODE"
MANAGEMENT_NODE = "MANAGEMENT-NODE"
STANDBY_MANAGEMENT = "STANDBY-MANAGEMENT"
FRONTEND_ONLY = "FRONTEND-ONLY"
```

**`ClusterNode` (Dataclass)**
```python
node_id: str                # e.g., "AUDIO-NODE-a1b2"
hostname: str              # e.g., "audio-01"
role: ClusterNodeRole
status: ClusterNodeStatus  # ONLINE, OFFLINE, DEGRADED, etc
metadata: NodeCapabilities # CPU, memory, audio devices
health_score: float        # 0-100
```

**`EnhancedNodeIdentity` (Singleton)**
```python
identity = get_enhanced_node_identity()
node_id = identity.get_node_id()          # "AUDIO-NODE-uuid-mac"
role = identity.get_role()                # Detected automatically
caps = identity.get_capabilities()        # Hardware specs
```

### Key Patterns Used

1. **Singleton Pattern:** `get_enhanced_node_identity()`
2. **Dataclasses:** Type-safe data structures
3. **Enums:** Avoid string magic values
4. **Type Hints:** All functions annotated

## 📋 Task #3: Zero-Touch Provisioning (NEXT)

### What It Does
Automatically configures new nodes on first boot without manual intervention.

### Files to Create
- `app/services/cluster/ztp.py` - Main ZTP logic (200-300 lines)
- `scripts/ztp-init.sh` - Shell script for systemd hook (50-100 lines)

### Implementation Outline
```python
class ZTPBootstrap:
    """First-boot automatic configuration"""
    
    async def run_first_boot(self):
        """Main ZTP workflow"""
        # 1. Check if first-boot (/etc/map2/node.conf doesn't exist)
        # 2. Generate node ID using EnhancedNodeIdentity
        # 3. Detect hardware capabilities
        # 4. Set deployment mode automatically
        # 5. Provision SSH keys
        # 6. Register with management cluster
        # 7. Mark first-boot complete
```

### Integration Points
- Depends on: `EnhancedNodeIdentity` (Task 2) ✅
- Needed by: Task 4 (mDNS Discovery)
- Systemd hook: Run via `%post` in package installation

### Testing Checklist
- [ ] First-boot detection works
- [ ] Node ID generated correctly
- [ ] Hardware detection runs
- [ ] SSH keys provisioned
- [ ] Config file written to /etc/map2/node.conf
- [ ] Can run multiple times (idempotent)

## 🔧 Development Setup

### Prerequisites
```bash
# Install Python dependencies
pip install cryptography msgpack psutil

# Create config directory
sudo mkdir -p /etc/map2
sudo chmod 755 /etc/map2
```

### Running Tests
```bash
# Test specific task (once implemented)
pytest tests/test_cluster_management.py::test_ztp_bootstrap -v

# Run full suite
pytest tests/test_cluster_management.py -v
```

### Logging
```python
import logging
logger = logging.getLogger(__name__)
logger.info("ZTP: First boot detected")
logger.debug(f"Node capabilities: {capabilities}")
logger.error("ZTP failed", exc_info=True)
```

## 📚 Key Concepts

### Node ID Format
```
AUDIO-NODE-a1b2      → Role + 4-char hash
MANAGEMENT-NODE-c3d4 → Role + 4-char hash
```

### Fedora Standards Used
- Config: `/etc/map2/*.conf` (INI format)
- Services: `/etc/systemd/system/*.service`
- Timers: `/etc/systemd/system/*.timer`
- Data: `/var/lib/map2/`
- Logs: `journalctl -u map2-*`

### Architecture Decisions
✅ **Hybrid Failover:** Primary + Standby (not complex Raft)  
✅ **Staged Updates:** Test → Audio → Management  
✅ **Push + Pull Config:** Immediate push + 2-min pull fallback  
✅ **Audio Sacred:** < 1% CPU overhead on audio nodes  
✅ **Fedora Native:** systemd, DNF, /etc/map2  

## 🐛 Common Pitfalls to Avoid

1. **❌ Blocking Audio Thread**
   - ✅ Use `asyncio` for all I/O
   - ✅ Non-blocking metrics collection
   - ✅ Separate thread pool for heavy work

2. **❌ Manual File Parsing**
   - ✅ Use `ConfigParser` for INI files
   - ✅ Use `json.load()` for JSON
   - ✅ Validate on load

3. **❌ Tight Coupling**
   - ✅ Import only from `app/services/cluster/`
   - ✅ Don't import audio-specific modules
   - ✅ Use dependency injection

4. **❌ Missing Error Handling**
   - ✅ Try/except on all I/O
   - ✅ Log exceptions with context
   - ✅ Graceful fallbacks

5. **❌ Hardcoded Values**
   - ✅ Use config files
   - ✅ Use environment variables
   - ✅ Use constants at module level

## 📊 Dependency Graph

```
Task 1: Cluster Foundation ✅
    ↓
Task 2: Enhanced Node Identity ✅
    ↓
Task 3: Zero-Touch Provisioning ← YOU ARE HERE
    ↓
Task 4: Enhanced mDNS Discovery
    ↓
Task 5: Cluster Registry
    ↓
Task 6: Certificate Authority
    ↓
Tasks 7-50: [See CLUSTER_MANAGEMENT_IMPLEMENTATION_GUIDE.md]
```

## 🚀 Execution Steps for Task #3

### Step 1: Create ZTP Module (1 hour)
```python
# app/services/cluster/ztp.py
class ZTPBootstrap:
    def __init__(self):
        self.identity = get_enhanced_node_identity()
        self.config_path = Path("/etc/map2/node.conf")
```

### Step 2: Implement First-Boot Detection (30 min)
```python
def is_first_boot(self) -> bool:
    """Check if node has been configured"""
    return not self.config_path.exists()
```

### Step 3: Implement SSH Key Provisioning (1 hour)
```python
async def provision_ssh_keys(self) -> None:
    """Generate or request SSH keys"""
    # Use EnhancedNodeIdentity for key generation
    # Store in /etc/map2/ssh/
```

### Step 4: Create Systemd Integration (30 min)
```bash
# /etc/systemd/system/map2-ztp-init.service
[Unit]
Description=MAP2 Zero-Touch Provisioning
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 -m app.services.cluster.ztp
Environment="MAP2_CLUSTER_ENABLED=true"
```

### Step 5: Write Tests (1 hour)
```python
# tests/test_cluster_management.py
@pytest.mark.asyncio
async def test_ztp_first_boot():
    """Test first-boot detection and setup"""
    ztp = ZTPBootstrap()
    assert ztp.is_first_boot()
    await ztp.run_first_boot()
    assert not ztp.is_first_boot()
```

## 📖 Code Style Guide

All cluster code follows these patterns:

```python
"""
Brief module docstring explaining purpose.
"""

import logging
from typing import Optional, List
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class MyEnum(Enum):
    """Well-documented enum"""
    OPTION_A = "option-a"
    OPTION_B = "option-b"


@dataclass
class MyData:
    """Well-documented dataclass"""
    field_a: str
    field_b: int
    field_c: Optional[str] = None


class MyService:
    """Well-documented service class"""
    
    def __init__(self):
        """Initialize service"""
        self.logger = logging.getLogger(__name__)
    
    async def do_something(self) -> bool:
        """
        Do something asynchronous.
        
        Returns:
            True if successful, False otherwise
        """
        try:
            # Implementation
            self.logger.info("Done")
            return True
        except Exception as e:
            self.logger.error(f"Failed", exc_info=True)
            return False
```

## 🎓 Learning Resources

- **Async Python:** `asyncio` patterns (used throughout)
- **Dataclasses:** Type-safe data structures
- **Enums:** Why we avoid string magic values
- **Systemd:** Timer and service units
- **Fedora/RHEL:** Standard system locations

## ✅ Checklist Before Pushing Code

- [ ] Type hints on all functions
- [ ] Docstrings on all classes and public methods
- [ ] Error handling with try/except + logging
- [ ] Tests written and passing
- [ ] No blocking I/O in critical paths
- [ ] Uses existing imports/patterns
- [ ] Follows Fedora conventions
- [ ] Works on Python 3.10+
- [ ] No external dependencies added (unless approved)
- [ ] Backward compatible (audio nodes unaffected)

## 🤝 Getting Help

If stuck on Task #3, refer to:
1. Task #3 specification in `CLUSTER_MANAGEMENT_IMPLEMENTATION_GUIDE.md`
2. Task #2 implementation (`enhanced_node_identity.py`) - similar patterns
3. Existing code in `app/services/` for patterns
4. This quick-start guide

---

**Ready to implement Task #3?**

Start with: `app/services/cluster/ztp.py` (copy template from guide)

Good luck! 🚀

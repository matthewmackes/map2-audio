# MAP2 Audio Platform - Deployment Mode System

## AI Execution Plan for Implementation and Enhancement

This document provides a comprehensive guide for AI assistants to implement, maintain, and enhance the MAP2 deployment mode switching system.

---

## 🎯 System Overview

The MAP2 Audio Platform supports four deployment modes that control which services run and how resources are optimized:

| Mode | Audio | UI | API | Use Case |
|------|:-----:|:--:|:---:|----------|
| **ALL-IN-ONE** | ✅ | ✅ | ✅ | Single machine with everything |
| **AUDIO-NODE** | ✅ | ❌ | ✅ | Dedicated audio processing server |
| **CONTROL-NODE** | ❌ | ✅ | ✅ | Remote UI machine |
| **FRONTEND-ONLY** | ❌ | ✅ | ⚠️ | Thin client browser |

---

## 📁 Key Files and Locations

### Core Configuration
| File | Purpose |
|------|---------|
| `app/deployment/deployment.py` | DeploymentConfig class, mode enum, service policies |
| `~/.map2/deployment.json` | User's persisted deployment configuration |
| `/etc/map2/environment` | Environment file for systemd services |

### API Routes
| File | Purpose |
|------|---------|
| `app/routes/deployment.py` | REST API for mode switching |
| `app/routes/deployment_health.py` | Health checks for deployment |

### TUI Components
| File | Purpose |
|------|---------|
| `tui/screens/cluster_mode_screen.py` | Mode switching UI screen |
| `tui/api_client.py` | API client with deployment methods |
| `tui/widgets/mode_indicator_widget.py` | Status bar mode indicator |

### Boot/Systemd
| File | Purpose |
|------|---------|
| `scripts/map2-boot-manager.sh` | Boot-time configuration script |
| `systemd/map2-boot-manager.service` | Systemd service for boot manager |
| `systemd/map2-backend.service` | Backend API service |

---

## 🔧 Architecture

### Service Policy Dictionary
The core mechanism is the `SERVICE_POLICIES` dictionary in `app/deployment/deployment.py`:

```python
SERVICE_POLICIES = {
    DeploymentMode.ALL_IN_ONE: {
        "juce_engine": ServicePolicy.ENABLED,
        "audio_io": ServicePolicy.ENABLED,
        "plugin_loader": ServicePolicy.ENABLED,
        "api_server": ServicePolicy.ENABLED,
        "web_ui": ServicePolicy.ENABLED,
        "tui": ServicePolicy.ENABLED,
        "database": ServicePolicy.ENABLED,
        "mdns_discovery": ServicePolicy.ENABLED,
        "lcd_manager": ServicePolicy.ENABLED,
    },
    DeploymentMode.AUDIO_NODE: {
        # Same as ALL_IN_ONE but web_ui is DISABLED
        ...
    },
    # etc.
}
```

### Mode Switching Flow
```
User Action (TUI/API) 
    → API /api/deployment/mode POST
    → DeploymentConfig.set_mode()
    → Updates service_policies dict
    → Saves to ~/.map2/deployment.json
    → Returns new mode
```

### Boot Sequence
```
System Boot
    → systemd starts map2-boot-manager.service
    → Reads ~/.map2/deployment.json
    → Sets CPU governor (performance/ondemand)
    → Sets vm.swappiness (10 for audio, 60 for UI)
    → Configures RT limits (/etc/security/limits.d/)
    → Writes /etc/map2/environment
    → systemd starts map2-backend.service
    → Backend reads environment and config
    → Applies service policies
```

---

## 🚀 API Reference

### GET /api/deployment/mode
Returns current deployment mode.

**Response:**
```json
{
  "mode": "ALL-IN-ONE",
  "description": "Single device running all services"
}
```

### POST /api/deployment/mode
Switch to a new deployment mode.

**Request:**
```json
{
  "mode": "AUDIO-NODE"
}
```

**Response:**
```json
{
  "mode": "AUDIO-NODE",
  "description": "Dedicated audio processing node with API"
}
```

### GET /api/deployment/status
Get full deployment status including service policies.

### GET /api/deployment/health/checks
Run and return health check results.

### GET /api/deployment/health/readiness
Get readiness checklist for current mode.

---

## 📋 Implementation Checklist

### For New Features
- [ ] Add service to `SERVICE_POLICIES` in `app/deployment/deployment.py`
- [ ] Create health check in `app/services/deployment_health.py`
- [ ] Add readiness check if needed
- [ ] Update TUI screen if user-facing
- [ ] Add API endpoint if external access needed
- [ ] Update boot manager if system-level config needed

### For Bug Fixes
1. Check if issue is in config loading (`DeploymentConfig.__init__`)
2. Check if issue is in mode switching (`set_mode`)
3. Check if issue is in boot sequence (`map2-boot-manager.sh`)
4. Check if issue is in TUI API client (`tui/api_client.py`)
5. Verify systemd service files are up to date

---

## 🔍 Common Issues and Solutions

### Issue: "No module named 'app.config.deployment'"
**Cause:** Python namespace conflict between `app/config.py` and `app/config/` directory.
**Solution:** Renamed directory to `app/deployment/`. Update all imports to use `app.deployment.deployment`.

### Issue: "No module named 'app.models.lcd_event'"  
**Cause:** Python namespace conflict between `app/models.py` and `app/models/` directory.
**Solution:** Renamed directory to `app/lcd_models/`. Update all imports.

### Issue: Config not persisting after reboot
**Cause:** Boot manager or backend can't write to `~/.map2/`.
**Solution:** Ensure `ReadWritePaths=/home/mm/.map2` in systemd service.

### Issue: CPU tweaks not applying
**Cause:** Boot manager not running as root or service ordering issue.
**Solution:** Ensure `map2-boot-manager.service` runs before backend, with `User=root`.

---

## 🛠 Development Tasks

### High Priority
1. **Add service-level mode awareness**
   - Services should check `is_service_enabled()` before starting
   - Graceful degradation when services are disabled

2. **Dynamic mode switching**
   - Currently requires service restart
   - Implement hot-switching without restart

3. **Cluster mode discovery**
   - mDNS discovery of other nodes
   - Automatic role negotiation

### Medium Priority
4. **Health dashboard**
   - Web UI showing all service states
   - Real-time mode status

5. **Mode profiles**
   - Save custom service configurations
   - Quick switch between profiles

6. **Metrics by mode**
   - Track resource usage per mode
   - Recommend optimal mode

### Low Priority
7. **Remote mode switching**
   - Switch mode on remote nodes
   - Coordinated cluster reconfiguration

8. **Mode scheduling**
   - Time-based mode switching
   - Performance mode during sessions

---

## 🧪 Testing

### Unit Tests
```bash
# Test deployment config
python -m pytest tests/test_deployment.py -v

# Test API endpoints
python -m pytest tests/test_deployment_api.py -v
```

### Integration Tests
```bash
# Test mode switching end-to-end
curl -X POST http://localhost:8080/api/deployment/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "AUDIO-NODE"}'

# Verify config was saved
cat ~/.map2/deployment.json

# Switch back
curl -X POST http://localhost:8080/api/deployment/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "ALL-IN-ONE"}'
```

### Boot Test
```bash
# Test boot manager
sudo /home/mm/map2-audio/scripts/map2-boot-manager.sh

# Verify settings
cat /proc/sys/vm/swappiness  # Should be 10 for audio modes
cat /etc/map2/environment     # Should have MAP2_DEPLOYMENT_MODE
```

---

## 📝 Code Style Guidelines

### Import Order
```python
# Standard library
import os
import json
from typing import Dict, Optional

# Third-party
from fastapi import APIRouter

# Local
from app.deployment.deployment import get_deployment_config
```

### Error Handling
```python
try:
    config = get_deployment_config()
    config.set_mode(DeploymentMode.AUDIO_NODE)
except Exception as e:
    logger.error(f"Failed to switch mode: {e}")
    raise HTTPException(status_code=500, detail=str(e))
```

### Logging
```python
logger.info(f"Switching deployment mode to {mode.value}")
logger.debug(f"Service policies: {config.service_policies}")
logger.warning(f"Service {name} disabled in {mode.value} mode")
logger.error(f"Failed to apply mode {mode.value}: {e}")
```

---

## 🔐 Security Considerations

1. **Privilege escalation**: Boot manager runs as root for system settings
2. **Config file permissions**: `~/.map2/deployment.json` should be user-owned
3. **API authentication**: Consider adding auth for mode switching in production
4. **Service isolation**: Each service should validate its own policy

---

## 📊 Monitoring

### Prometheus Metrics
```python
# Add to app/utils/health_metrics.py
deployment_mode = Gauge('map2_deployment_mode', 'Current deployment mode', ['mode'])
service_enabled = Gauge('map2_service_enabled', 'Service enabled state', ['service'])
```

### Log Aggregation
Important log patterns to monitor:
- `Switching deployment mode from X to Y`
- `Service X disabled in Y mode`
- `Boot manager complete - Mode: X`
- `Failed to apply mode X`

---

## 🚦 Future Enhancements

1. **WebSocket events for mode changes**
   - Real-time UI updates when mode switches
   - Cluster-wide mode change notifications

2. **Mode-specific resource limits**
   - Memory limits per mode
   - CPU affinity settings

3. **Rollback capability**
   - Save previous mode configuration
   - One-click rollback if issues

4. **Mode templates**
   - Pre-configured mode profiles
   - User-customizable templates

---

## 📚 References

- [Deployment Modes Overview](docs/DEPLOYMENT_MODES_EXPLAINED.md)
- [Quick Reference](docs/DEPLOYMENT_MODES_QUICK_REF.md)
- [Code Deep Dive](docs/DEPLOYMENT_MODES_CODE_REVIEW.md)
- [System Architecture](ARCHITECTURE.md)

---

*Last updated: 2026-02-05*
*Version: 1.0.0*

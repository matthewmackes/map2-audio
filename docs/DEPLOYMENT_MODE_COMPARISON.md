# Deployment Mode Comparison: Audio Node vs Manager Node

## Service-by-Service Breakdown

This document provides a detailed comparison of what services are enabled/disabled in each deployment mode, based on the `SERVICE_POLICIES` configuration in [app/deployment/deployment.py](../app/deployment/deployment.py).

---

## AUDIO-NODE Mode

**Purpose:** Dedicated audio processing server with remote control via API  
**Use Case:** Real-time audio engine on dedicated hardware, controlled remotely

### Services Running (`ENABLED`)
1. **`juce_engine`** - Real-time audio processing engine
2. **`audio_io`** - Audio device I/O (ALSA/JACK)
3. **`plugin_loader`** - LV2/VST3 plugin loading and management
4. **`api_server`** - REST API for remote control
5. **`tui`** - Terminal User Interface (local console access)
6. **`database`** - SQLite database for presets, chains, configurations
7. **`mdns_discovery`** - mDNS/Avahi service announcement
8. **`lcd_manager`** - LCD event sharing with network peers

### Services Disabled (`DISABLED`)
1. **`web_ui`** - Web browser interface (saves ~100MB RAM)

---

## CONTROL-NODE Mode

**Purpose:** UI and control plane machine without audio processing  
**Use Case:** Frontend machine controlling remote audio nodes

### Services Running (`ENABLED`)
1. **`api_server`** - REST API for controlling audio nodes
2. **`web_ui`** - Web browser interface
3. **`tui`** - Terminal User Interface
4. **`database`** - Local preset/chain storage
5. **`mdns_discovery`** - Auto-discover audio nodes on network

### Services Disabled (`DISABLED`)
1. **`juce_engine`** - No audio processing
2. **`audio_io`** - No audio device access
3. **`plugin_loader`** - No plugin loading (runs on audio node)
4. **`lcd_manager`** - Audio node handles LCD events

---

## Side-by-Side Comparison

| Service | Audio Node | Manager Node | Notes |
|---------|:----------:|:------------:|-------|
| **`juce_engine`** | ✅ ENABLED | ❌ DISABLED | Audio processing only on audio nodes |
| **`audio_io`** | ✅ ENABLED | ❌ DISABLED | Audio device I/O only on audio nodes |
| **`plugin_loader`** | ✅ ENABLED | ❌ DISABLED | Plugins run on audio nodes |
| **`api_server`** | ✅ ENABLED | ✅ ENABLED | Both need API (control & be controlled) |
| **`web_ui`** | ❌ DISABLED | ✅ ENABLED | UI only on manager/control nodes |
| **`tui`** | ✅ ENABLED | ✅ ENABLED | Both have terminal interface |
| **`database`** | ✅ ENABLED | ✅ ENABLED | Both maintain local configs |
| **`mdns_discovery`** | ✅ ENABLED | ✅ ENABLED | Both announce/discover peers |
| **`lcd_manager`** | ✅ ENABLED | ❌ DISABLED | Audio node shares LCD events |

---

## Key Differences Summary

### What's Different?

**Audio Node has, Manager Node doesn't:**
- Audio processing (`juce_engine`, `audio_io`, `plugin_loader`)
- LCD event management (`lcd_manager`)

**Manager Node has, Audio Node doesn't:**
- Web UI (`web_ui`)

**Both have:**
- API server (for control and being controlled)
- Terminal interface (TUI)
- Database (local configs)
- mDNS discovery (network awareness)

---

## Resource Impact

### Audio Node Mode
**Memory:** Lower (no web UI, ~100MB saved)  
**CPU:** High (real-time audio processing)  
**Network:** Announces via mDNS, accepts API connections  
**Storage:** Moderate (database, plugin cache)

### Manager Node Mode
**Memory:** Higher (web UI loaded)  
**CPU:** Low (no audio processing)  
**Network:** Discovers audio nodes, sends API commands  
**Storage:** Low (just UI assets and local configs)

---

## Code Reference

All mode configurations are defined in:
**File:** [app/deployment/deployment.py](../app/deployment/deployment.py#L37-L82)

```python
SERVICE_POLICIES = {
    DeploymentMode.AUDIO_NODE: {
        "juce_engine": ServicePolicy.ENABLED,
        "audio_io": ServicePolicy.ENABLED,
        "plugin_loader": ServicePolicy.ENABLED,
        "api_server": ServicePolicy.ENABLED,
        "web_ui": ServicePolicy.DISABLED,      # ← Key difference
        "tui": ServicePolicy.ENABLED,
        "database": ServicePolicy.ENABLED,
        "mdns_discovery": ServicePolicy.ENABLED,
        "lcd_manager": ServicePolicy.ENABLED,  # ← Key difference
    },
    DeploymentMode.CONTROL_NODE: {
        "juce_engine": ServicePolicy.DISABLED,  # ← Key difference
        "audio_io": ServicePolicy.DISABLED,     # ← Key difference
        "plugin_loader": ServicePolicy.DISABLED,# ← Key difference
        "api_server": ServicePolicy.ENABLED,
        "web_ui": ServicePolicy.ENABLED,        # ← Key difference
        "tui": ServicePolicy.ENABLED,
        "database": ServicePolicy.ENABLED,
        "mdns_discovery": ServicePolicy.ENABLED,
        "lcd_manager": ServicePolicy.DISABLED,  # ← Key difference
    },
}
```

---

## Related Documentation

- [DEPLOYMENT_MODES_EXPLAINED.md](DEPLOYMENT_MODES_EXPLAINED.md) - Full mode documentation
- [DEPLOYMENT_MODES_CODE_REVIEW.md](DEPLOYMENT_MODES_CODE_REVIEW.md) - Implementation details
- [DEPLOYMENT_MODES_QUICK_REF.md](DEPLOYMENT_MODES_QUICK_REF.md) - Quick reference guide
- [DEPLOYMENT_SYSTEM_COMPLETE.md](DEPLOYMENT_SYSTEM_COMPLETE.md) - System overview

---

**Last Updated:** February 6, 2026  
**Source:** `app/deployment/deployment.py` - `SERVICE_POLICIES` dictionary

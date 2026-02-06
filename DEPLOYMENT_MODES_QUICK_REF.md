# 📊 Deployment Modes - Quick Visual Reference

## Mode Comparison Matrix

| Service | ALL-IN-ONE | AUDIO-NODE | CONTROL-NODE | FRONTEND-ONLY |
|---------|:----------:|:----------:|:------------:|:-------------:|
| **JUCE Engine** | ✅ | ✅ | ❌ | ❌ |
| **Audio I/O** | ✅ | ✅ | ❌ | ❌ |
| **Plugin Loader** | ✅ | ✅ | ❌ | ❌ |
| **API Server** | ✅ | ✅ | ✅ | ⚠️ (degraded) |
| **Web UI** | ✅ | ❌ | ✅ | ✅ |
| **TUI** | ✅ | ✅ | ✅ | ✅ |
| **Database** | ✅ | ✅ | ✅ | ❌ |
| **mDNS Discovery** | ✅ | ✅ | ✅ | ✅ |
| **LCD Manager** | ✅ | ✅ | ❌ | ❌ |

---

## Mode Selection Guide

### Choose ALL-IN-ONE If:
- 🎮 Single machine with audio + UI
- 💻 Desktop/laptop workstation
- 🧪 Development or testing
- 📦 Everything on one device
- ✅ Default when unsure

```bash
# Start (uses default ALL-IN-ONE)
./map2.sh start

# Or explicit:
MAP2_DEPLOYMENT_MODE=ALL-IN-ONE ./map2.sh start
```

---

### Choose AUDIO-NODE If:
- 🎛️ Dedicated audio processing machine
- 🏭 Server running audio engine
- 🔌 Control from remote machine
- 📡 Networked setup
- 🎚️ Studio/professional environment

```bash
# Start as audio node
MAP2_DEPLOYMENT_MODE=AUDIO-NODE ./map2.sh start

# Check it's running
curl http://localhost:8000/api/deployment/mode
# {"mode": "AUDIO-NODE"}
```

---

### Choose CONTROL-NODE If:
- 🎮 Remote UI machine
- 💡 Controlling audio-node from laptop
- 🌐 Distributed deployment
- 📱 Multiple workstations
- 🔗 Connected to AUDIO-NODE via network

```bash
# Start as control node
MAP2_DEPLOYMENT_MODE=CONTROL-NODE ./map2.sh start

# Automatically discovers AUDIO-NODE via mDNS
curl http://localhost:8000/api/peers
# Shows discovered AUDIO-NODE
```

---

### Choose FRONTEND-ONLY If:
- 📱 Thin client / remote control
- 💾 Low resource device
- 🌐 Browser-only interface
- 🔐 Lightweight deployment
- 📡 All processing on remote backend

```bash
# Start as frontend only
MAP2_DEPLOYMENT_MODE=FRONTEND-ONLY ./map2.sh start

# Point to remote backend
export MAP2_REMOTE_BACKEND=http://audio-node:8000
```

---

## Typical Deployment Topologies

### Topology 1: Single Device
```
┌─────────────────────────────┐
│   Personal Computer         │
├─────────────────────────────┤
│ ALL-IN-ONE                  │
│ ✅ Audio Processing         │
│ ✅ Web UI + TUI             │
│ ✅ Plugins                  │
│ ✅ Database                 │
└─────────────────────────────┘
```

**Start:** `./map2.sh start`  
**Access:** http://localhost:3000

---

### Topology 2: Studio Network (Recommended for Pro)
```
┌─────────────────────────────┐     ┌──────────────────────┐
│  Audio Processing Server    │◄───►│  Control Workstation │
├─────────────────────────────┤     ├──────────────────────┤
│ AUDIO-NODE                  │     │ CONTROL-NODE         │
│ ✅ JUCE Engine              │     │ ✅ Web UI            │
│ ✅ Audio I/O                │     │ ✅ TUI               │
│ ✅ Plugins                  │     │ ✅ API Server        │
│ ✅ Database                 │     │ ✅ mDNS Discovery    │
│ ❌ Web UI (saves resources) │     │ ❌ Audio Engine      │
│                             │     │ ❌ Plugin Loader     │
│ mDNS: AUDIO-NODE-ABC1       │     │ Connects to ABC1 ←  │
└─────────────────────────────┘     └──────────────────────┘
```

**Start Audio:**  
```bash
ssh audio-server
MAP2_DEPLOYMENT_MODE=AUDIO-NODE ./map2.sh start
```

**Start Control:**  
```bash
MAP2_DEPLOYMENT_MODE=CONTROL-NODE ./map2.sh start
curl http://localhost:8000/api/peers
# Auto-discovers audio-server
```

---

### Topology 3: Thin Client (Remote Desktop)
```
┌─────────────────────────────┐     ┌──────────────────────┐
│  Powerful Backend Server    │◄───►│  Thin Client Device  │
├─────────────────────────────┤     ├──────────────────────┤
│ AUDIO-NODE                  │     │ FRONTEND-ONLY        │
│ ✅ All Heavy Processing     │     │ ✅ Web UI (only)     │
│ ✅ Plugins                  │     │ ✅ mDNS Discovery    │
│ ✅ Database                 │     │ ❌ Audio Engine      │
│                             │     │ ❌ Plugins           │
│ 🔌 Port 8000                │     │ Minimal resources ⚡ │
└─────────────────────────────┘     └──────────────────────┘
```

**Start Backend:**  
```bash
ssh backend-server
MAP2_DEPLOYMENT_MODE=AUDIO-NODE ./map2.sh start
```

**Start Frontend:**  
```bash
MAP2_DEPLOYMENT_MODE=FRONTEND-ONLY \
MAP2_REMOTE_BACKEND=http://backend-server:8000 \
./map2.sh start
```

---

### Topology 4: Multi-Site Redundancy
```
┌─────────────────────────────┐
│ Site A                      │
│ ┌──────────────────────────┐│
│ │ AUDIO-NODE               ││
│ │ Primary audio processor  ││
│ └──────────────────────────┘│
└─────────────────────────────┘
                ↑
         mDNS Discovery
                ↓
┌─────────────────────────────┐
│ Site B                      │
│ ┌──────────────────────────┐│
│ │ CONTROL-NODE             ││
│ │ Redundant control        ││
│ └──────────────────────────┘│
└─────────────────────────────┘
```

Both sites auto-discover each other.

---

## How to Switch Modes

### Quick Reference

| Method | Command | Persists? | Requires Restart? |
|--------|---------|:---------:|:-----------------:|
| **Env Var** | `MAP2_DEPLOYMENT_MODE=AUDIO-NODE ./map2.sh start` | ❌ No | ❌ No (must set before start) |
| **API** | `curl -X POST /api/deployment/mode -d {...}` | ✅ Yes | ❌ No |
| **TUI Button** | Press 'c', click mode button | ✅ Yes | ❌ No |
| **Config File** | Edit `~/.map2/deployment.json` | ✅ Yes | ✅ Yes |

---

## The Service Policy Dictionary

### In Code
```python
# app/config/deployment.py lines 39-80
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
        "juce_engine": ServicePolicy.ENABLED,
        "audio_io": ServicePolicy.ENABLED,
        "plugin_loader": ServicePolicy.ENABLED,
        "api_server": ServicePolicy.ENABLED,
        "web_ui": ServicePolicy.DISABLED,       # ← Different!
        "tui": ServicePolicy.ENABLED,
        "database": ServicePolicy.ENABLED,
        "mdns_discovery": ServicePolicy.ENABLED,
        "lcd_manager": ServicePolicy.ENABLED,
    },
    # ... CONTROL_NODE, FRONTEND_ONLY similarly defined
}
```

### What Gets Saved
```json
{
  "mode": "AUDIO-NODE",
  "service_policies": {
    "juce_engine": "enabled",
    "audio_io": "enabled",
    "plugin_loader": "enabled",
    "api_server": "enabled",
    "web_ui": "disabled",
    "tui": "enabled",
    "database": "enabled",
    "mdns_discovery": "enabled",
    "lcd_manager": "enabled"
  },
  "created_at": "2026-02-05T10:00:00",
  "updated_at": "2026-02-05T10:30:00"
}
```

---

## Mode Switching Flow

```
User Action (env var, API, TUI, or file edit)
           ↓
DeploymentConfig.set_mode(new_mode)
           ↓
  self.mode = new_mode
  self.service_policies = SERVICE_POLICIES[new_mode].copy()
  self.save()  ← Writes to ~/.map2/deployment.json
           ↓
Response returned to user
           ↓
Next time service checks: config.is_service_enabled(...)
           ↓
Returns based on new policies
```

---

## Real-World Usage Examples

### Example 1: Desktop Audio Workstation
```bash
# Laptop with audio interface
./map2.sh start

# Uses ALL-IN-ONE mode
# Everything running
# Visit http://localhost:3000
```

### Example 2: Start Audio, Add Control Later
```bash
# Machine 1: Start as audio node
ssh studio-computer
MAP2_DEPLOYMENT_MODE=AUDIO-NODE ./map2.sh start

# Machine 2: Remote control  
ssh control-laptop
MAP2_DEPLOYMENT_MODE=CONTROL-NODE ./map2.sh start

# Automatic discovery via mDNS
# No manual connection needed
```

### Example 3: Switch Modes at Runtime
```bash
# Start in all-in-one
./map2.sh start

# Check mode
curl http://localhost:8000/api/deployment/mode
# {"mode": "ALL-IN-ONE"}

# Decide to use remote backend, switch to frontend-only
curl -X POST http://localhost:8000/api/deployment/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "FRONTEND-ONLY"}'

# Verify
curl http://localhost:8000/api/deployment/mode
# {"mode": "FRONTEND-ONLY"}

# Next restart uses FRONTEND-ONLY
```

### Example 4: Restore Previous Mode
```bash
# Check saved config
cat ~/.map2/deployment.json
# {"mode": "AUDIO-NODE", ...}

# Same mode used on next start
./map2.sh stop
./map2.sh start
# Automatically in AUDIO-NODE mode
```

---

## Key Takeaways

| Concept | Summary |
|---------|---------|
| **Mode** | Set of enabled/disabled services |
| **Policy** | Individual service's state (enabled/disabled/degraded) |
| **Config** | JSON file storing mode + policies at ~/.map2/deployment.json |
| **Switching** | Change mode via env var, API, TUI, or config file |
| **Persistence** | Once set, mode survives application restart |
| **Auto-Discovery** | mDNS enables nodes to find each other automatically |

---

## Service Enable Decision Tree

```
┌─ What's my deployment scenario?
│
├─ Single device, all capabilities?
│  └─ Use: ALL-IN-ONE ✅
│
├─ Dedicated audio + remote control?
│  ├─ Audio machine: Use AUDIO-NODE ✅
│  └─ Control machine: Use CONTROL-NODE ✅
│
├─ Thin client / low resources?
│  └─ Use FRONTEND-ONLY ✅
│
└─ Not sure?
   └─ Use ALL-IN-ONE (default) ✅
```

---

**Mode: ✅ You now understand how they work!**

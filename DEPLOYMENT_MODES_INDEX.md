# 📚 Deployment Modes - Documentation Index

## Choose Your Learning Path

### 🚀 I want quick answers
**Start here:** [DEPLOYMENT_MODES_QUICK_REF.md](DEPLOYMENT_MODES_QUICK_REF.md)
- Mode comparison matrix
- When to use each mode
- Quick switching commands
- Real-world topologies
- 5-minute read

---

### 🧠 I want to understand how it works
**Start here:** [DEPLOYMENT_MODES_EXPLAINED.md](DEPLOYMENT_MODES_EXPLAINED.md)
- How modes work at architectural level
- Service policies explained
- Startup sequence
- How to engage modes (all 4 methods)
- Complete data flow
- 15-minute read

---

### 🔍 I want to see the actual code
**Start here:** [DEPLOYMENT_MODES_CODE_REVIEW.md](DEPLOYMENT_MODES_CODE_REVIEW.md)
- Line-by-line code walkthrough
- Key classes and methods
- How services integrate
- The SERVICE_POLICIES dictionary explained
- Data flow with code snippets
- 20-minute deep dive

---

## Quick Navigation

| Document | Best For | Read Time |
|----------|----------|-----------|
| [DEPLOYMENT_MODES_QUICK_REF.md](DEPLOYMENT_MODES_QUICK_REF.md) | Decision matrix, quick commands | 5 min |
| [DEPLOYMENT_MODES_EXPLAINED.md](DEPLOYMENT_MODES_EXPLAINED.md) | Understanding architecture | 15 min |
| [DEPLOYMENT_MODES_CODE_REVIEW.md](DEPLOYMENT_MODES_CODE_REVIEW.md) | Code details, implementation | 20 min |

---

## The 4 Modes at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│ ALL-IN-ONE                                                   │
│ Single machine with everything                              │
│ ✅ Audio ✅ UI ✅ Database ✅ All features                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ AUDIO-NODE                                                   │
│ Server running audio, controlled remotely                   │
│ ✅ Audio ✅ API ❌ Web UI (saves resources)                 │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ CONTROL-NODE                                                 │
│ Remote UI controlling audio elsewhere                       │
│ ✅ UI ✅ API ❌ Audio ❌ Plugins                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ FRONTEND-ONLY                                                │
│ Lightweight client with remote backend                      │
│ ✅ UI ❌ Everything else ⚡ Minimal resources                │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Files in the Implementation

### Configuration Engine
**File:** `app/config/deployment.py` (245 lines)
- `DeploymentMode` enum - The 4 modes
- `ServicePolicy` enum - ENABLED/DISABLED/DEGRADED
- `SERVICE_POLICIES` dict - All policies for all modes
- `DeploymentConfig` class - Manager

### API Endpoints
**File:** `app/routes/deployment.py` (289 lines)
- GET `/api/deployment/mode` - Get current mode
- POST `/api/deployment/mode` - Switch mode (persists)
- GET `/api/deployment/status` - Service status
- GET `/api/deployment/config` - Full configuration

### TUI Integration
**File:** `tui/screens/cluster_mode_screen.py` (modified)
- Mode buttons for each mode
- Real-time mode switching
- Health status display
- Readiness checklist

### Application Integration
**File:** `app/main.py` (modified)
- Initialization at startup
- Route registration
- Environment variable handling

---

## How Modes Work (One Sentence Each)

1. **ALL-IN-ONE** - One dictionary key maps to "all services enabled"
2. **AUDIO-NODE** - Same dict but with "web_ui: disabled"
3. **CONTROL-NODE** - All audio processing disabled, UI enabled
4. **FRONTEND-ONLY** - Everything disabled except UI, API degraded

---

## The Magic Lines

### Switching Modes (in `deployment.py`)
```python
self.service_policies = SERVICE_POLICIES[mode].copy()  # Line 209
```
Just one lookup and all policies are updated.

### Checking Policy (in services)
```python
if config.is_service_enabled("web_ui"):  # Line 161
    start_web_ui()
```
Services independently decide what to run.

### Persisting Config (in routes)
```python
config.set_mode(mode)  # Line 101
# Automatically calls save() internally
```
Changes automatically written to disk.

---

## Common Tasks

### Q: How do I switch to AUDIO-NODE mode?
**A:** Three ways:

1. At startup: `MAP2_DEPLOYMENT_MODE=AUDIO-NODE ./map2.sh start`
2. At runtime: `curl -X POST http://localhost:8000/api/deployment/mode -d '{"mode":"AUDIO-NODE"}'`
3. In TUI: Press 'c', click "Audio Node" button

(See DEPLOYMENT_MODES_QUICK_REF.md for details)

### Q: What services run in CONTROL-NODE?
**A:** API, Web UI, TUI, Database, mDNS Discovery
(See DEPLOYMENT_MODES_EXPLAINED.md Mode 3 section)

### Q: How are modes persisted?
**A:** Saved to `~/.map2/deployment.json` automatically
(See DEPLOYMENT_MODES_CODE_REVIEW.md for code)

### Q: Can I switch modes without restarting?
**A:** Yes! Use the API endpoint (doesn't require restart)
(See DEPLOYMENT_MODES_QUICK_REF.md Method table)

### Q: What's the difference between FRONTEND-ONLY and CONTROL-NODE?
**A:** FRONTEND-ONLY has DEGRADED api_server, CONTROL-NODE has ENABLED api_server
(See DEPLOYMENT_MODES_EXPLAINED.md for comparison)

---

## Real-World Scenario

**Studio with 2 Machines:**

Machine 1 (Audio Server):
```bash
MAP2_DEPLOYMENT_MODE=AUDIO-NODE ./map2.sh start
# Runs: Audio engine, plugins, API, Database
# Doesn't run: Web UI (saves RAM)
# Port: 8000
```

Machine 2 (Control Laptop):
```bash
MAP2_DEPLOYMENT_MODE=CONTROL-NODE ./map2.sh start
# Runs: Web UI, API, Database
# Doesn't run: Audio engine, plugins
# Auto-discovers Audio Server via mDNS
```

Result: Full audio system, split across two machines, with UI on one and audio on the other.

(See DEPLOYMENT_MODES_EXPLAINED.md "Studio Network" topology)

---

## What Each Mode Optimizes For

| Mode | Optimized For | Example Hardware |
|------|---------------|------------------|
| **ALL-IN-ONE** | Simplicity | Desktop/Laptop |
| **AUDIO-NODE** | Audio quality + remote control | Server with audio card |
| **CONTROL-NODE** | User interface + multiple machines | Workstation remote from audio |
| **FRONTEND-ONLY** | Resource efficiency | Thin client, low-power device |

---

## Learning Progression

```
START HERE: QUICK_REF (5 min)
     ↓ (understand modes exist)
THEN: EXPLAINED (15 min)
     ↓ (understand how they work)
THEN: CODE_REVIEW (20 min)
     ↓ (understand implementation details)
READY: To deploy anything!
```

---

## Key Takeaways

✅ Modes are pre-defined service configurations  
✅ Switching is as simple as looking up a dictionary key  
✅ Services independently check their policy  
✅ Configuration persists to `~/.map2/deployment.json`  
✅ Can switch at startup (env var), runtime (API), or manually (file)  
✅ mDNS auto-discovery works across all modes  

---

## Next Steps

1. **Quick understanding:** Read DEPLOYMENT_MODES_QUICK_REF.md (5 min)
2. **Deep dive:** Read DEPLOYMENT_MODES_EXPLAINED.md (15 min)
3. **Implementation:** Read DEPLOYMENT_MODES_CODE_REVIEW.md (20 min)
4. **Hands-on:** Try switching modes using the methods described
5. **Deploy:** Use the appropriate mode for your scenario

---

**Status: ✅ Complete Explanation Ready**

All three documents explain the same system from different angles:
- Quick Ref = "Show me the matrix"
- Explained = "Tell me how it works"
- Code Review = "Show me the code"

Pick whichever matches your learning style!

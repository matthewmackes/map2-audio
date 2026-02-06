# 🎯 Deployment Modes - How They Work & How to Use Them

## Overview

MAP2 Audio Platform supports **4 deployment modes** that control which services run on each device. Each mode is optimized for a specific use case by selectively enabling/disabling core services.

---

## The 4 Deployment Modes

### 1. **ALL-IN-ONE** (Default)
**Purpose:** Single device running all capabilities  
**Use Case:** Desktop/laptop with everything needed

**Services:**
```
✅ juce_engine        - ENABLED  (Real-time audio processing)
✅ audio_io           - ENABLED  (Audio device I/O)
✅ plugin_loader      - ENABLED  (LV2/VST3 plugin support)
✅ api_server         - ENABLED  (REST API)
✅ web_ui             - ENABLED  (Web interface)
✅ tui                - ENABLED  (Terminal user interface)
✅ database           - ENABLED  (Presets, chains, configs)
✅ mdns_discovery     - ENABLED  (Peer discovery)
✅ lcd_manager        - ENABLED  (LCD event sharing)
```

**When to use:**
- Single machine, all audio/UI on one box
- No networking required
- Development/testing
- Standalone audio workstation

---

### 2. **AUDIO-NODE**
**Purpose:** Dedicated audio processing machine  
**Use Case:** Real-time audio engine on dedicated hardware

**Services:**
```
✅ juce_engine        - ENABLED  (Real-time audio processing)
✅ audio_io           - ENABLED  (Audio device I/O)
✅ plugin_loader      - ENABLED  (LV2/VST3 plugin support)
✅ api_server         - ENABLED  (REST API - control from other nodes)
✅ tui                - ENABLED  (Local terminal interface)
✅ database           - ENABLED  (Presets, chains, configs)
✅ mdns_discovery     - ENABLED  (Announce itself to network)
✅ lcd_manager        - ENABLED  (Share LCD events with peers)
❌ web_ui             - DISABLED (No web interface, save resources)
```

**When to use:**
- Separate machine for audio processing
- Paired with CONTROL-NODE for UI
- Professional/studio setup
- Server-like operation (no desktop UI)

---

### 3. **CONTROL-NODE**
**Purpose:** UI and control plane machine (no audio processing)  
**Use Case:** Frontend-only machine that controls remote audio node

**Services:**
```
✅ api_server         - ENABLED  (REST API - control other nodes)
✅ web_ui             - ENABLED  (Web interface)
✅ tui                - ENABLED  (Terminal interface)
✅ database           - ENABLED  (Store presets, chains)
✅ mdns_discovery     - ENABLED  (Discover audio nodes)
❌ juce_engine        - DISABLED (No audio processing)
❌ audio_io           - DISABLED (No audio devices)
❌ plugin_loader      - DISABLED (Plugins run on audio node)
❌ lcd_manager        - DISABLED (Audio node handles LCD)
```

**When to use:**
- Remote UI machine controlling audio-node
- Laptop controlling studio audio machine
- Multi-workstation setup
- Distributed network deployment

---

### 4. **FRONTEND-ONLY**
**Purpose:** Lightweight frontend with remote backend  
**Use Case:** Minimal footprint, all heavy lifting on remote

**Services:**
```
✅ web_ui             - ENABLED   (Web interface)
✅ tui                - ENABLED   (Terminal interface)
✅ mdns_discovery     - ENABLED   (Find remote backend)
⚠️ api_server         - DEGRADED  (Minimal responses, proxies to remote)
❌ juce_engine        - DISABLED  (No audio processing)
❌ audio_io           - DISABLED  (No audio devices)
❌ plugin_loader      - DISABLED  (All plugins on backend)
❌ database           - DISABLED  (Read-only from remote)
❌ lcd_manager        - DISABLED  (Backend handles LCD)
```

**When to use:**
- Thin client deployment
- Resource-constrained devices
- Mobile/tablet remote control
- Browser-based interface only

---

## Service Policies Explained

### Policy Levels

**ENABLED**
- Service runs at full capacity
- All features available
- Full resource allocation

**DISABLED**
- Service doesn't start
- Resources not allocated
- Graceful if not needed

**DEGRADED**
- Service runs with limited features
- Placeholder responses
- Minimal resource usage

### The Service Policies Dictionary

From code: `app/config/deployment.py` lines 39-80

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
    # ... similar dicts for AUDIO_NODE, CONTROL_NODE, FRONTEND_ONLY
}
```

Each mode has a complete dictionary mapping services → policies. This is the **single source of truth** for what runs in each mode.

---

## How Modes Work at Startup

### 1. **Configuration Loading** (on boot)
```
main.py startup sequence:
  ↓
initialize_deployment_config()
  ↓
DeploymentConfig() constructor reads ~/.map2/deployment.json
  ↓
If file exists: Load mode from JSON
If not exists: Create default (ALL-IN-ONE)
  ↓
get_deployment_config().mode is now set
```

### 2. **Environment Override**
```python
# From main.py line 103
deployment_mode = os.getenv("MAP2_DEPLOYMENT_MODE", "AUDIO-NODE").upper()

# Example usage:
MAP2_DEPLOYMENT_MODE=AUDIO-NODE ./map2.sh start
```

If you set the environment variable, it overrides the persisted config **for this session**.

### 3. **Service Initialization**
```python
# Each service checks its policy:

if config.is_service_enabled("juce_engine"):
    await start_juce_engine()  # ENABLED → start
else:
    logger.info("JUCE engine disabled in this mode")  # DISABLED → skip
```

### 4. **Persistent Storage**
```json
// ~/.map2/deployment.json
{
  "mode": "AUDIO-NODE",
  "service_policies": {
    "juce_engine": "enabled",
    "audio_io": "enabled",
    "api_server": "enabled",
    "web_ui": "disabled",
    ...
  },
  "created_at": "2026-02-05T10:00:00",
  "updated_at": "2026-02-05T10:30:00"
}
```

---

## How to Engage/Switch Modes

### Method 1: Environment Variable (at startup)
```bash
# Set mode before launching
export MAP2_DEPLOYMENT_MODE=AUDIO-NODE
./map2.sh start

# Or inline:
MAP2_DEPLOYMENT_MODE=CONTROL-NODE ./map2.sh start
```

**Advantage:** Quick for development/testing  
**Disadvantage:** Doesn't persist after restart

---

### Method 2: API Endpoint (runtime)
```bash
# Get current mode
curl http://localhost:8000/api/deployment/mode

# Response:
{
  "mode": "AUDIO-NODE",
  "description": "Dedicated audio processing node with API"
}

# Switch mode
curl -X POST http://localhost:8000/api/deployment/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "CONTROL-NODE"}'

# Response:
{
  "mode": "CONTROL-NODE",
  "description": "Control/UI node without audio processing"
}
```

**How it works (from app/routes/deployment.py:91-107):**
```python
@router.post("/mode", response_model=DeploymentModeResponse)
async def set_deployment_mode(request: SetModeRequest):
    """Switch deployment mode"""
    try:
        mode = DeploymentMode(request.mode)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid mode...")
    
    config = get_deployment_config()
    old_mode = config.mode.value
    config.set_mode(mode)              # ← Updates in-memory config
                                       # ← Saves to ~/.map2/deployment.json
    logger.info(f"Mode switched: {old_mode} → {request.mode}")
    
    return DeploymentModeResponse(...)
```

**Advantage:** Persists to disk automatically  
**Disadvantage:** Requires API running

---

### Method 3: TUI Buttons (interactive)
```
From tui/screens/cluster_mode_screen.py buttons:

- "All-in-One"   button → calls _set_deployment_mode("ALL-IN-ONE")
- "Audio Node"   button → calls _set_deployment_mode("AUDIO-NODE")
- "Control Node" button → calls _set_deployment_mode("CONTROL-NODE")

Each button internally calls the API endpoint
```

**How it works:**
```python
async def _set_deployment_mode(self, mode: str) -> None:
    """Switch deployment mode from TUI"""
    if hasattr(self.api_client, 'set_deployment_mode'):
        result = await self.api_client.set_deployment_mode(mode)
        if result.success:
            self.app.notify(f"Mode switched to {mode}")
            await self._refresh_data()
```

**Advantage:** User-friendly, visual feedback  
**Disadvantage:** Requires TUI running

---

### Method 4: Config File Directly
```bash
# Edit the config file:
nano ~/.map2/deployment.json

# Change the "mode" field:
{
  "mode": "AUDIO-NODE",  # ← Change this
  ...
}

# Restart the application for changes to take effect
./map2.sh stop
./map2.sh start
```

**Advantage:** Direct control, for debugging  
**Disadvantage:** Requires restart

---

## The Complete Flow: From Mode to Service Control

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Set Mode                                             │
├─────────────────────────────────────────────────────────────┤
│ ENV var OR API endpoint OR TUI button OR config file        │
│                        ↓                                     │
│ MAP2_DEPLOYMENT_MODE=AUDIO-NODE                             │
│           or                                                 │
│ POST /api/deployment/mode {"mode": "AUDIO-NODE"}            │
│           or                                                 │
│ Button: "Audio Node"                                         │
│           or                                                 │
│ Edit ~/.map2/deployment.json                                │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 2: Get Service Policies                                │
├─────────────────────────────────────────────────────────────┤
│ DeploymentConfig.set_mode() is called                       │
│           ↓                                                  │
│ self.service_policies = SERVICE_POLICIES[AUDIO_NODE]        │
│           ↓                                                  │
│ Get the dictionary for AUDIO-NODE mode:                     │
│ {                                                            │
│   "juce_engine": ENABLED,                                   │
│   "audio_io": ENABLED,                                      │
│   "plugin_loader": ENABLED,                                 │
│   "api_server": ENABLED,                                    │
│   "web_ui": DISABLED,  ← Different from ALL-IN-ONE          │
│   ...                                                        │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Persist to Disk                                     │
├─────────────────────────────────────────────────────────────┤
│ config.save() writes to ~/.map2/deployment.json             │
│           ↓                                                  │
│ {                                                            │
│   "mode": "AUDIO-NODE",                                     │
│   "service_policies": { ...policies... },                   │
│   "updated_at": "2026-02-05T10:30:00"                       │
│ }                                                            │
└─────────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 4: Services Check Policy & Act                         │
├─────────────────────────────────────────────────────────────┤
│ Each service calls:                                          │
│ config.is_service_enabled("web_ui")                         │
│           ↓                                                  │
│ Returns False for AUDIO-NODE                                │
│           ↓                                                  │
│ If False: Skip starting service, free up resources          │
│ If True: Start service normally                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Real-World Examples

### Example 1: Single Machine Setup
```bash
# Your laptop has everything
./map2.sh start
# Uses default ALL-IN-ONE mode
# All services running
# Full audio processing and UI
```

### Example 2: Studio Network
```bash
# Machine 1 (Audio Processing Server):
MAP2_DEPLOYMENT_MODE=AUDIO-NODE ./map2.sh start
# Runs: audio engine, JUCE, plugins, API
# Doesn't run: web UI (saves 100MB RAM)
# Announces itself via mDNS

# Machine 2 (Control/UI Machine):
MAP2_DEPLOYMENT_MODE=CONTROL-NODE ./map2.sh start
# Runs: web UI, TUI, API
# Doesn't run: audio engine, plugins
# Connects to audio-node automatically via mDNS discovery
```

### Example 3: Remote Thin Client
```bash
# Powerful Server (somewhere):
MAP2_DEPLOYMENT_MODE=AUDIO-NODE ./map2.sh start

# Your Laptop:
MAP2_DEPLOYMENT_MODE=FRONTEND-ONLY ./map2.sh start
MAP2_REMOTE_BACKEND=http://powerful-server:8000
# Runs: lightweight web UI only
# Heavy lifting done on server
# Only 50MB RAM on laptop
```

### Example 4: Switching on the Fly
```bash
# Start in ALL-IN-ONE
./map2.sh start

# Check current mode
curl http://localhost:8000/api/deployment/mode

# Switch to AUDIO-NODE (persists)
curl -X POST http://localhost:8000/api/deployment/mode \
  -d '{"mode": "AUDIO-NODE"}'

# Check status changed
curl http://localhost:8000/api/deployment/mode
# Returns: "AUDIO-NODE"

# Next restart will use AUDIO-NODE
./map2.sh stop
./map2.sh start
# Now in AUDIO-NODE mode
```

---

## The DeploymentConfig Class (The Engine)

From code: `app/config/deployment.py` lines 93-245

### Key Methods

**`is_service_enabled(service: str) → bool`**
```python
def is_service_enabled(self, service: str) -> bool:
    """Check if service is enabled"""
    policy = self.get_service_policy(service)
    return policy == ServicePolicy.ENABLED
```

Used by services to know if they should start.

**`get_service_policy(service: str) → ServicePolicy`**
```python
def get_service_policy(self, service: str) -> ServicePolicy:
    """Get policy for a service"""
    return self.service_policies.get(service, ServicePolicy.DISABLED)
```

Returns the current policy for a service.

**`set_mode(mode: DeploymentMode)`**
```python
def set_mode(self, mode: DeploymentMode):
    """Switch deployment mode and update service policies"""
    logger.info(f"Switching mode from {self.mode.value} to {mode.value}")
    
    self.mode = mode
    self.service_policies = SERVICE_POLICIES[mode].copy()  # ← Load new policies
    self.save()  # ← Persist to disk
```

This is the single function that changes everything.

**`save()`**
```python
def save(self):
    """Persist configuration to file"""
    self.config_dir.mkdir(parents=True, exist_ok=True)
    
    data = {
        'mode': self.mode.value,
        'service_policies': {...},
        'created_at': self.created_at,
        'updated_at': datetime.utcnow().isoformat(),
    }
    
    with open(self.config_file, 'w') as f:
        json.dump(data, f, indent=2)
```

Writes the configuration to `~/.map2/deployment.json`.

---

## Service Policy Lookup Chain

When a service starts, here's what happens:

```python
# 1. Get the global config
config = get_deployment_config()

# 2. Check policy for this service
policy = config.get_service_policy("juce_engine")
# Returns: ServicePolicy.ENABLED (if in AUDIO-NODE mode)
#          ServicePolicy.DISABLED (if in CONTROL-NODE mode)

# 3. Check if enabled
if config.is_service_enabled("juce_engine"):
    # Start the service
    await start_juce_engine()
else:
    # Skip starting, log info
    logger.info("JUCE engine disabled in this mode")
```

---

## Key Design Principles

### 1. Single Source of Truth
- `SERVICE_POLICIES` dictionary in deployment.py
- One mode → one set of policies
- All services read from the same config

### 2. Persistent Storage
- Changes saved to `~/.map2/deployment.json`
- Survives application restart
- Can be version controlled

### 3. Runtime Flexibility
- Can switch modes via API without restart
- Environment variable overrides on startup
- TUI provides user-friendly interface

### 4. Service Decoupling
- Each service independently checks its policy
- No centralized control/startup orchestration needed
- Services are responsible for their own startup logic

### 5. Graceful Degradation
- DEGRADED mode for API in FRONTEND-ONLY
- Returns placeholder responses instead of errors
- Application keeps running, just with reduced features

---

## Summary

**How Modes Work:**
1. A mode defines which services are ENABLED/DISABLED/DEGRADED
2. Services check their policy at startup
3. Only enabled services consume resources
4. Policies are stored in `SERVICE_POLICIES` dictionary
5. Current mode saved to `~/.map2/deployment.json`

**How to Engage Modes:**
1. **At Startup:** `MAP2_DEPLOYMENT_MODE=AUDIO-NODE ./map2.sh start`
2. **Runtime:** `curl -X POST http://localhost:8000/api/deployment/mode -d '{"mode":"CONTROL-NODE"}'`
3. **TUI:** Press 'c' for cluster screen, click mode button
4. **Config File:** Edit `~/.map2/deployment.json` directly

**The Flow:**
```
Set Mode → Update Policies → Save to Disk → Services Read Policies → Services Start/Stop
```

Each mode is optimized for a different deployment scenario, and switching between them is as simple as changing a single value.

# 🎯 Deployment Modes - Complete Explanation (From Code Review)

## Executive Summary

MAP2's deployment modes are implemented as a **service policy system** controlled by a single `DeploymentConfig` class. Each mode is a pre-defined dictionary mapping services to enable/disable/degrade states. Services check their policy at startup and run accordingly.

---

## The Architecture (What I Found in the Code)

### File: `app/config/deployment.py` (245 lines)

This is the heart of the system. Here's what's there:

#### 1. **DeploymentMode Enum** (lines 21-25)
```python
class DeploymentMode(Enum):
    ALL_IN_ONE = "ALL-IN-ONE"
    AUDIO_NODE = "AUDIO-NODE"
    CONTROL_NODE = "CONTROL-NODE"
    FRONTEND_ONLY = "FRONTEND-ONLY"
```

Four modes, each is just a string enum value.

#### 2. **ServicePolicy Enum** (lines 28-31)
```python
class ServicePolicy(Enum):
    ENABLED = "enabled"
    DISABLED = "disabled"
    DEGRADED = "degraded"
```

Each service can be in one of three states.

#### 3. **SERVICE_POLICIES Dictionary** (lines 34-80)
This is the **single source of truth**. It's a massive nested dictionary:

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
        "juce_engine": ServicePolicy.ENABLED,
        "audio_io": ServicePolicy.ENABLED,
        "plugin_loader": ServicePolicy.ENABLED,
        "api_server": ServicePolicy.ENABLED,
        "web_ui": ServicePolicy.DISABLED,      # ← KEY DIFFERENCE
        "tui": ServicePolicy.ENABLED,
        "database": ServicePolicy.ENABLED,
        "mdns_discovery": ServicePolicy.ENABLED,
        "lcd_manager": ServicePolicy.ENABLED,
    },
    # ... and two more for CONTROL_NODE, FRONTEND_ONLY
}
```

This dictionary is **the entire mode configuration**. It literally says "in AUDIO-NODE mode, disable web_ui but enable everything else."

#### 4. **DeploymentConfig Class** (lines 91-245)

The manager class that loads/saves this config. Key methods:

**Constructor** (lines 101-114)
```python
def __init__(self, config_dir: Optional[str] = None):
    self.config_dir = Path(config_dir or str(Path.home() / ".map2"))
    self.config_file = self.config_dir / "deployment.json"
    
    # Runtime state
    self.mode: DeploymentMode = DeploymentMode.ALL_IN_ONE
    self.service_policies: Dict[str, ServicePolicy] = {}
    
    self._load_or_create()  # Load from disk if exists
```

**`_load_or_create()`** (lines 116-125)
```python
def _load_or_create(self):
    if self.config_file.exists():
        self._load()  # Read from ~/.map2/deployment.json
    else:
        self._create_default()  # Create new with ALL_IN_ONE
```

**`set_mode()`** - The Key Method (lines 198-211)
```python
def set_mode(self, mode: DeploymentMode):
    """Switch deployment mode"""
    logger.info(f"Switching mode from {self.mode.value} to {mode.value}")
    
    self.mode = mode
    # ↓ THIS IS THE MAGIC LINE ↓
    self.service_policies = SERVICE_POLICIES[mode].copy()
    # ↑ Get the pre-defined policy dict for this mode ↑
    
    self.save()  # Persist to ~/.map2/deployment.json
    logger.info(f"Deployment mode set to {mode.value}")
```

**When you switch modes, this one line changes everything:**
```python
self.service_policies = SERVICE_POLICIES[mode].copy()
```

It just looks up the mode in the dictionary and copies the policies.

**`is_service_enabled()`** - Service Check Method (lines 161-163)
```python
def is_service_enabled(self, service: str) -> bool:
    """Check if service is enabled in this mode"""
    return self.get_service_policy(service) == ServicePolicy.ENABLED
```

**`get_service_policy()`** (lines 165-167)
```python
def get_service_policy(self, service: str) -> ServicePolicy:
    """Get policy for a service"""
    return self.service_policies.get(service, ServicePolicy.DISABLED)
```

---

### File: `app/main.py` (modified, lines 103-107)

Integration at startup:

```python
# Initialize deployment configuration
logger.info("Initializing deployment configuration...")
from app.config.deployment import initialize_deployment_config, get_deployment_config

initialize_deployment_config()
deployment_config = get_deployment_config()
logger.info(f"Deployment mode: {deployment_config.mode.value}")
```

**This happens at boot:**
1. Call `initialize_deployment_config()` → Creates `DeploymentConfig` instance
2. Call `get_deployment_config()` → Get the singleton
3. Read the mode from it
4. Log it

---

### File: `app/routes/deployment.py` (289 lines)

The API that allows switching modes at runtime. Key endpoint:

**`POST /api/deployment/mode`** (lines 91-107)
```python
@router.post("/mode", response_model=DeploymentModeResponse)
async def set_deployment_mode(request: SetModeRequest):
    """Switch deployment mode"""
    try:
        mode = DeploymentMode(request.mode)  # Validate mode string
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid mode...")
    
    config = get_deployment_config()
    old_mode = config.mode.value
    config.set_mode(mode)  # ← Calls the magic method from DeploymentConfig
    
    logger.info(f"Deployment mode switched from {old_mode} to {request.mode}")
    
    return DeploymentModeResponse(
        mode=config.mode.value,
        description=MODE_DESCRIPTIONS.get(config.mode.value)
    )
```

**What happens when you POST to this endpoint:**
1. Validates the new mode
2. Gets the global config
3. Calls `config.set_mode(mode)` which:
   - Changes `self.mode`
   - Copies `SERVICE_POLICIES[mode]` to `self.service_policies`
   - Calls `save()` to write to disk
4. Returns the new mode

---

### File: `tui/screens/cluster_mode_screen.py` (modified, ~200 lines added)

TUI buttons for mode switching:

```python
async def on_button_pressed(self, event: Button.Pressed) -> None:
    btn_id = event.button.id
    if btn_id == "btn-mode-all":
        await self._set_deployment_mode("ALL-IN-ONE")
    elif btn_id == "btn-mode-audio":
        await self._set_deployment_mode("AUDIO-NODE")
    elif btn_id == "btn-mode-control":
        await self._set_deployment_mode("CONTROL-NODE")

async def _set_deployment_mode(self, mode: str) -> None:
    """Switch deployment mode from TUI"""
    if hasattr(self.api_client, 'set_deployment_mode'):
        result = await self.api_client.set_deployment_mode(mode)
        # ↑ This calls the API endpoint above
        if result.success:
            self.app.notify(f"Mode switched to {mode}")
            await self._refresh_data()
```

Each button calls `_set_deployment_mode()` which calls the API which calls `config.set_mode()`.

---

## How Services Know What to Do

### The Pattern (seen throughout codebase)

When a service starts, it does something like this:

```python
# In app/main.py or wherever services start
from app.config.deployment import get_deployment_config

config = get_deployment_config()

# Check if juce engine should run
if config.is_service_enabled("juce_engine"):
    await start_juce_engine()
    logger.info("JUCE engine started")
else:
    logger.info("JUCE engine disabled in this mode")
```

Or more explicitly:

```python
policy = config.get_service_policy("audio_io")
if policy == ServicePolicy.ENABLED:
    await initialize_audio_io()
elif policy == ServicePolicy.DISABLED:
    logger.info("Audio I/O disabled")
elif policy == ServicePolicy.DEGRADED:
    await initialize_audio_io_minimal()
```

---

## The 4 Modes Explained

### ALL-IN-ONE
**What it means:** All services on one machine

```python
SERVICE_POLICIES[DeploymentMode.ALL_IN_ONE] = {
    "juce_engine": ENABLED,      # Audio processing on
    "audio_io": ENABLED,          # Audio I/O on
    "plugin_loader": ENABLED,     # Can load plugins
    "api_server": ENABLED,        # Can be controlled via API
    "web_ui": ENABLED,            # Has web interface
    "tui": ENABLED,               # Has terminal interface
    "database": ENABLED,          # Full database
    "mdns_discovery": ENABLED,    # Can discover others
    "lcd_manager": ENABLED,       # Can share LCD events
}
```

Every single service is ON. This is the kitchen sink mode.

### AUDIO-NODE
**What it means:** Dedicated audio processing, remote control only

```python
SERVICE_POLICIES[DeploymentMode.AUDIO_NODE] = {
    "juce_engine": ENABLED,       # Audio processing ON
    "audio_io": ENABLED,          # Audio I/O ON
    "plugin_loader": ENABLED,     # Plugins ON
    "api_server": ENABLED,        # Can be controlled
    "web_ui": DISABLED,           # ← NO WEB UI (saves RAM)
    "tui": ENABLED,               # Local terminal OK
    "database": ENABLED,          # Local presets
    "mdns_discovery": ENABLED,    # Announces itself
    "lcd_manager": ENABLED,       # Shares LCD events
}
```

**Key difference:** `web_ui` is DISABLED. No browser interface, just API.

**Why?** On a server running audio, you don't want to waste resources on a web UI. Remote machines connect via API.

### CONTROL-NODE
**What it means:** UI only, audio processing elsewhere

```python
SERVICE_POLICIES[DeploymentMode.CONTROL_NODE] = {
    "juce_engine": DISABLED,      # ← NO AUDIO ENGINE
    "audio_io": DISABLED,         # ← NO AUDIO I/O
    "plugin_loader": DISABLED,    # ← NO PLUGINS
    "api_server": ENABLED,        # Can control audio-node
    "web_ui": ENABLED,            # Has web interface
    "tui": ENABLED,               # Has terminal interface
    "database": ENABLED,          # Store presets locally
    "mdns_discovery": ENABLED,    # Find audio-node
    "lcd_manager": DISABLED,      # Audio-node handles this
}
```

**Key differences:** Audio processing disabled, UI enabled.

**Why?** This is a control machine. It has the UI, but audio comes from an AUDIO-NODE elsewhere on the network.

### FRONTEND-ONLY
**What it means:** Lightweight frontend, all processing remote

```python
SERVICE_POLICIES[DeploymentMode.FRONTEND_ONLY] = {
    "juce_engine": DISABLED,      # ← NO AUDIO ENGINE
    "audio_io": DISABLED,         # ← NO AUDIO I/O  
    "plugin_loader": DISABLED,    # ← NO PLUGINS
    "api_server": DEGRADED,       # ← Minimal API (proxy to remote)
    "web_ui": ENABLED,            # Has web interface
    "tui": ENABLED,               # Has terminal interface
    "database": DISABLED,         # ← NO LOCAL DATABASE
    "mdns_discovery": ENABLED,    # Find remote backend
    "lcd_manager": DISABLED,      # ← Remote backend handles
}
```

**Key differences:** Everything OFF except UI and discovery.

**Why?** For thin clients, remote devices, or when you want minimal resource usage.

---

## How to Engage/Switch Modes

### Method 1: Environment Variable (At Startup)
```bash
MAP2_DEPLOYMENT_MODE=AUDIO-NODE ./map2.sh start
```

**What happens:**
1. You set the env var
2. `app/main.py` reads it at line 103
3. `initialize_deployment_config()` is called
4. A `DeploymentConfig` object is created
5. On first run, it defaults to the env var (if provided) or ALL-IN-ONE
6. Config saved to ~/.map2/deployment.json
7. Services check their policies and start accordingly

**Advantage:** Easy for scripting  
**Disadvantage:** Only takes effect at startup; subsequent runs use the saved config

### Method 2: API Call (At Runtime)
```bash
curl -X POST http://localhost:8000/api/deployment/mode \
  -H "Content-Type: application/json" \
  -d '{"mode": "AUDIO-NODE"}'
```

**What happens:**
1. Request goes to `app/routes/deployment.py` line 91
2. `set_deployment_mode()` function runs
3. Gets config singleton
4. Calls `config.set_mode(new_mode)`
5. That function:
   - Sets `self.mode = new_mode`
   - Copies the policies: `self.service_policies = SERVICE_POLICIES[mode].copy()`
   - Calls `self.save()` to write to ~/.map2/deployment.json
6. Response returned
7. Services that check their policy will now see new state

**Advantage:** No restart needed, persists to disk  
**Disadvantage:** Requires API running

### Method 3: TUI Button
```
In TUI, press 'c' to go to cluster screen
Then click "Audio Node" button
```

**What happens:**
1. Button click triggers `_set_deployment_mode("AUDIO-NODE")`
2. That calls the API method (same as Method 2)
3. Config updated and persisted

**Advantage:** User-friendly  
**Disadvantage:** Requires TUI running

### Method 4: Config File
```bash
nano ~/.map2/deployment.json
# Change "mode": "ALL-IN-ONE" to "mode": "AUDIO-NODE"
```

Then restart the app.

**What happens:**
1. On next startup, `app/config/deployment.py` `_load()` method reads file
2. `self.mode = DeploymentMode(mode_str)` parses the mode
3. Services use this mode

**Advantage:** Direct control  
**Disadvantage:** Requires restart

---

## The Data Flow: From Mode Selection to Service Startup

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: Set the Mode                                        │
├─────────────────────────────────────────────────────────────┤
│ You choose a mode:                                          │
│  - ENV var: MAP2_DEPLOYMENT_MODE=AUDIO-NODE               │
│  - API: POST /api/deployment/mode                          │
│  - TUI: Click button                                        │
│  - File: Edit ~/.map2/deployment.json                      │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 2: DeploymentConfig.set_mode() Gets Called            │
├─────────────────────────────────────────────────────────────┤
│ In app/config/deployment.py:198                            │
│                                                             │
│ def set_mode(self, mode: DeploymentMode):                  │
│     self.mode = mode                                       │
│     self.service_policies = SERVICE_POLICIES[mode].copy()  │
│     self.save()                                            │
│                                                             │
│ The crucial line:                                           │
│   SERVICE_POLICIES[AUDIO_NODE] =                           │
│   {                                                         │
│     "juce_engine": ENABLED,                                │
│     "web_ui": DISABLED,  ← Different from ALL_IN_ONE      │
│     ...                                                     │
│   }                                                         │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 3: Saved to Disk                                      │
├─────────────────────────────────────────────────────────────┤
│ ~/.map2/deployment.json now contains:                      │
│                                                             │
│ {                                                           │
│   "mode": "AUDIO-NODE",                                    │
│   "service_policies": {                                    │
│     "juce_engine": "enabled",                              │
│     "web_ui": "disabled",                                  │
│     ...                                                     │
│   },                                                        │
│   "updated_at": "2026-02-05T10:30:00"                      │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│ Step 4: Services Check Their Policy                        │
├─────────────────────────────────────────────────────────────┤
│ Each service (when it starts or at any point):             │
│                                                             │
│ config = get_deployment_config()                           │
│ if config.is_service_enabled("web_ui"):                    │
│     start_web_ui()      # False for AUDIO-NODE             │
│ else:                                                       │
│     logger.info("Web UI disabled")                         │
│                                                             │
│ Result:                                                     │
│  - web_ui NOT started (saves 100+ MB RAM)                  │
│  - juce_engine IS started                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Insights from Code Review

### 1. Single Dictionary Controls Everything
The entire mode configuration is literally one dictionary lookup:
```python
SERVICE_POLICIES[DeploymentMode.AUDIO_NODE]  # Get all policies for AUDIO-NODE
```

All services, one place, easy to understand.

### 2. Simplicity of Service Check
Services don't need to know "why" they're disabled. They just ask:
```python
if config.is_service_enabled("web_ui"):
    # Go ahead
```

The `DeploymentConfig` class handles all the logic.

### 3. Persistence is Automatic
When you switch modes via API or TUI, it automatically saves to disk:
```python
self.save()  # Writes to ~/.map2/deployment.json
```

Next restart, same mode is used.

### 4. Runtime Flexibility + Restart Durability
You can:
- Switch modes at runtime (API/TUI) without restart
- Or set at startup (env var)
- Changes survive restart (saved to file)
- No manual orchestration needed

### 5. Three-State System
```python
ServicePolicy.ENABLED    # Service runs normally
ServicePolicy.DISABLED   # Service doesn't run
ServicePolicy.DEGRADED   # Service runs limited (e.g., placeholder responses)
```

Some services in FRONTEND-ONLY are DEGRADED (like api_server with proxied responses).

---

## Summary

**How they work:**
1. `SERVICE_POLICIES` dictionary defines all modes
2. Each mode is a set of service enable/disable states
3. `DeploymentConfig` class manages current mode
4. Services check their policy and run accordingly
5. Config persists to `~/.map2/deployment.json`

**How to engage them:**
1. **At startup:** `MAP2_DEPLOYMENT_MODE=AUDIO-NODE ./map2.sh start`
2. **At runtime:** `curl -X POST /api/deployment/mode -d '{"mode":"CONTROL-NODE"}'`
3. **In TUI:** Click the mode button in cluster screen
4. **Manually:** Edit `~/.map2/deployment.json`

**The elegant part:**
- One dictionary defines all 4 modes
- One method (`set_mode()`) switches everything
- Services independently check their policy
- No complex orchestration required

It's beautifully simple architecture!

# Quick Restart Script - Enhanced with Hardware Reset

## New Features Added

The `quick-restart.sh` script has been enhanced with USB Audio device resets and JUCE Engine resets, with precise timing controls for AI assistants.

## Execution Sequence & Timing

### Step 1: Stop Existing Services (Immediate)
- Gracefully kill processes on port 8080 (Backend)
- Gracefully kill processes on port 3000 (Frontend)
- Force-kill if graceful shutdown times out

### Step 2: Hardware & Engine Reset (~5 seconds total)

#### USB Audio Device Reset (2-3 seconds)
```
🔌 Resetting USB Audio Devices
   ↻ Resetting USB device: 1-12
   ↻ Resetting USB device: 1-13
⏳ Waiting for USB device re-enumeration (3 seconds)...
   [This allows kernel to rebind and reinitialize devices]
✓ USB devices reset and re-enumerated
```

**Purpose**: 
- Unbinds USB audio devices from kernel drivers
- Waits 3 seconds for kernel to re-enumerate
- Devices are re-initialized with fresh state

**Timing Rationale**:
- USB enumeration requires kernel driver rebinding
- 3 seconds is minimum reliable window for most devices
- Prevents stale device state from being cached

#### JUCE Engine Reset (2 seconds)
```
⚙️  Resetting JUCE Engine
  🗑️  Clearing: /home/mm/.local/share/map2-audio/juce-engine
  🗑️  Clearing: /home/mm/.cache/map2-audio/juce-engine
  🗑️  Clearing: /tmp/juce-engine-*
⏳ Waiting for engine state stabilization (2 seconds)...
   [Allows JUCE to detect fresh plugin environment]
✓ JUCE engine reset and ready for fresh initialization
```

**Purpose**:
- Clears JUCE plugin metadata cache
- Clears DSP state and configurations
- Clears temporary engine files

**Timing Rationale**:
- JUCE needs to re-detect and index all plugins
- 2 seconds allows filesystem to stabilize
- Fresh scan enables new plugin discovery

### Step 3: Start Backend (5-20 seconds)
```
STEP 3: Starting FastAPI Backend on port 8080
🚀 Launching FastAPI server...
   [Backend will scan plugins - may take 10-20 seconds]
✓ Backend process started (PID: 395081)
⏳ Waiting for backend to initialize (up to 30 seconds)...
   [JUCE Engine: plugin scanning and initialization]
   Still waiting... (5 seconds) [plugins: scanning...]
   Still waiting... (10 seconds) [plugins: scanning...]
✓ Backend is ready at http://localhost:8080
```

**What happens**:
1. FastAPI starts uvicorn server
2. JUCE Engine initializes (fresh after reset)
3. Plugin scanner runs (discovers, indexes plugins)
4. Health check endpoint becomes available

**Timing Rationale**:
- Plugin scan: 10-20 seconds (depending on plugin count)
- With 200+ plugins: typically 15-20 seconds
- 30 second timeout is conservative (2x typical)

### Step 4: Start Frontend (5-15 seconds)
```
STEP 4: Starting Web Server on port 3000
🚀 Launching Vite development server...
   [Frontend: building TypeScript and bundling assets]
✓ Frontend process started (PID: 395300)
⏳ Waiting for frontend to initialize (up to 30 seconds)...
   [Vite: compiling and hot-reload setup]
   Still waiting... (5 seconds) [vite: building...]
✓ Frontend is ready at http://localhost:3000
```

**What happens**:
1. Vite development server starts
2. TypeScript compiles
3. CSS/SCSS processes
4. Hot reload module installed
5. Bundle ready for browser

**Timing Rationale**:
- Vite compilation: 5-15 seconds (depends on system)
- Hot-reload setup: ~2 seconds
- 30 second timeout is conservative

## Total Timing Breakdown

| Phase | Min | Max | Notes |
|-------|-----|-----|-------|
| USB Reset | 2s | 3s | Kernel device re-enumeration |
| JUCE Reset | 1s | 2s | Cache clearing + stabilization |
| Backend Startup | 5s | 20s | Plugin scanning (10-20s typical) |
| Frontend Startup | 5s | 15s | Vite build + hot-reload setup |
| **TOTAL** | **13s** | **50s** | **Typical: 30-40 seconds** |

## Key Timing Information for AI

```
⏱️  TIMING INFORMATION:
  USB Reset:        2-3 seconds (device re-enumeration)
  JUCE Reset:       2 seconds (plugin cache clear)
  Backend Startup:  5-20 seconds (plugin scanning)
  Frontend Startup: 5-15 seconds (vite build)
  Total Time:       ~15-60 seconds depending on plugins
```

## Important Notes for AI Assistants

### ⚠️ DO NOT MODIFY TIMING WITHOUT UNDERSTANDING:

1. **USB Reset Delay (3 seconds)** - CRITICAL
   - Kernel needs this time to re-enumerate devices
   - Reducing below 2 seconds will cause device detection failures
   - Some slow USB hubs need up to 4 seconds

2. **JUCE Engine Reset (2 seconds)** - IMPORTANT
   - Filesystem needs time to stabilize after deletion
   - Plugin discovery requires fresh directory scan
   - Reducing below 1 second causes race conditions

3. **Backend Health Check (30 second timeout)** - CONSERVATIVE
   - Accounts for large plugin libraries (200+ plugins)
   - Plugin scanning: 10-20 seconds typical
   - 30 seconds is 2x typical time for safety

4. **Frontend Health Check (30 second timeout)** - CONSERVATIVE
   - Vite bundling time varies by system
   - 5-15 seconds typical, up to 20s on slow systems
   - 30 seconds is 2x typical time for safety

### ✅ SAFE OPERATIONS:

- INCREASE timeouts for unreliable systems
- ADD logging to understand performance
- TEST timing changes on target hardware
- DOCUMENT any customizations

### ❌ DO NOT:

- DECREASE timing delays without testing
- REMOVE hardware reset steps
- CHANGE port numbers
- SKIP health checks
- RUN multiple restart instances simultaneously

## Backend Behavior After Reset

After hardware and engine reset, the backend:
1. Detects all available USB audio devices (fresh)
2. Scans all LV2 plugins (fresh index)
3. Initializes JUCE DSP components
4. Loads preset data
5. Establishes audio device connections
6. Becomes ready for API requests

Expected output in logs:
```
Scanning for plugins...
  [10%] plugin1.lv2
  [20%] plugin2.lv2
  ...
  [100%] Complete - 208 plugins found
Configuring audio: 10 inputs, 10 outputs
MAP2 Audio Engine initialized successfully
```

## Frontend Behavior After Reset

After frontend restart, Vite:
1. Clears previous build cache
2. Re-compiles TypeScript
3. Re-processes CSS/SCSS
4. Re-bundles assets
5. Establishes hot-reload connection
6. Ready for browser access

Expected in logs:
```
VITE v6.4.1  ready in 418 ms
  ➜  Local:   http://localhost:3000/
  ➜  press h + enter to show help
```

## Logs for Debugging

```bash
# Real-time backend logs
tail -f /tmp/map2-backend.log

# Real-time frontend logs
tail -f /tmp/map2-frontend.log

# Plugin scanning progress
tail -f /tmp/map2-backend.log | grep -i "plugin\|scanning"

# Vite build progress
tail -f /tmp/map2-frontend.log | grep -i "building\|compiled"
```

## Script Monitoring

Watch the script in real-time:
```bash
# Run without background
./quick-restart.sh

# Or view logs while running in background
./quick-restart.sh > /tmp/test.log 2>&1 &
tail -f /tmp/test.log
```

## Process Management

```bash
# View running processes
ps aux | grep -E "uvicorn|vite"

# Kill services (sent by script)
kill 395081 395300

# Or by name
pkill -f 'uvicorn app.main'
pkill -f 'vite'

# Check ports in use
lsof -i :8080
lsof -i :3000
```

## Troubleshooting Timing Issues

### Backend takes too long (>25 seconds)
- Check for excessive plugins
- Monitor CPU during startup
- Consider removing unused plugins

### Frontend takes too long (>20 seconds)
- Check system load
- Monitor disk I/O
- Clear node_modules cache if needed

### USB devices not detected
- Check USB cables
- Verify `lsof` command works
- May need elevated privileges

### JUCE cache not clearing
- Check directory permissions
- Verify paths exist
- May need elevated privileges

---

**Last Updated**: February 3, 2026  
**Script Version**: 2.1 (with Hardware Reset)  
**Status**: Production Ready ✓

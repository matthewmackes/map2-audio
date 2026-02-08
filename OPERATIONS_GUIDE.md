# MAP2 Audio Platform — Operations Guide

## Quick Reference: All Major Operations

This guide provides straightforward instructions for all MAP2 operations referenced in the welcome message.

---

## 1. START BACKEND SERVICE

### Option A: Using systemd (Recommended for Production)
```bash
systemctl start map2-backend
```
- **Service location**: `/etc/systemd/system/map2-backend.service`
- **Logs**: `journalctl -u map2-backend -f`
- **Check status**: `systemctl status map2-backend`
- **Stop**: `systemctl stop map2-backend`
- **Restart**: `systemctl restart map2-backend`

### Option B: Manual Start (Development)
```bash
cd /home/mm/map2-audio
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080
```
- **API endpoint**: http://localhost:8080
- **API documentation**: http://localhost:8080/docs
- **Logs**: Printed to terminal (Ctrl+C to stop)

---

## 2. START WEB DASHBOARD

### Via Script
```bash
/home/mm/map2-audio/scripts/start_web.sh
```

### Manual Start
```bash
cd /home/mm/map2-audio/web
npm run dev -- --host 0.0.0.0 --port 3000
```
- **Web UI**: http://localhost:3000
- **Development mode** with hot-reload
- **Logs**: Printed to terminal (Ctrl+C to stop)

### Production Build
```bash
cd /home/mm/map2-audio/web
npm run build
```
- **Output**: `dist/` directory
- **Serve with**: Any HTTP server pointing to `dist/`

---

## 3. LAUNCH TERMINAL UI (NODE CONSOLE)

### Direct Command
```bash
python3 -m tui.node_console
```

### Via Wrapper Script
```bash
/home/mm/map2-audio/tui.sh
```
- **Auto-starts backend** if not running
- **Uses new professional Textual TUI**
- **6 tabs**: Dashboard, Audio, Cluster, Mode & Actions, Logs, Help

### CLI Options
```bash
# Show version
python3 -m tui.node_console --version

# Show help
python3 -m tui.node_console --help

# Monochrome (no colors)
python3 -m tui.node_console --no-color

# Enable debug logging
python3 -m tui.node_console --debug

# Custom refresh interval (seconds)
python3 -m tui.node_console --refresh 3

# Custom API URL
python3 -m tui.node_console --api-url http://10.0.0.5:8080
```

### Remote SSH Usage
```bash
# Connect and launch
ssh user@audionode "cd /home/mm/map2-audio && python3 -m tui.node_console"

# Via wrapper script
ssh user@audionode "/home/mm/map2-audio/tui.sh"

# With optimized terminal
TERM=xterm-256color ssh user@audionode "./tui.sh"
```

### Keyboard Shortcuts in Node Console
```
F1 or 6        → Help tab
F5 or r        → Refresh all data
1-6            → Jump to specific tab
d              → Dashboard
a              → Audio
c              → Cluster
m              → Mode & Actions
l              → Logs
Tab            → Next widget
Shift+Tab      → Previous widget
Enter          → Activate/confirm
Escape         → Close modal
q              → Quit
```

---

## 4. QUICK SHELL COMMANDS (Available After Welcome)

These commands are defined in the welcome script and available in your current shell session:

### Full Stack Restart
```bash
map2-restart
```
- Stops backend (port 8080) and frontend (port 3000)
- Waits for ports to be released
- Starts backend (FastAPI)
- Starts frontend (Vite dev server)
- Displays progress and connection URLs

**Steps**:
1. Stops Backend
2. Stops Frontend
3. Starts Backend (with health check)
4. Starts Frontend (with health check)

### Tail All Logs
```bash
map2-logs
```
- Shows real-time output from both:
  - `/tmp/map2-backend.log`
  - `/tmp/map2-frontend.log`
- Press Ctrl+C to stop

### Show Service Status
```bash
map2-status
```
Displays:
- Backend status (running/stopped) with PID
- Frontend status (running/stopped) with PID
- Connection URLs if running

### Stop All Services
```bash
map2-stop
```
- Kills backend process (port 8080)
- Kills frontend process (port 3000)
- Confirms both are stopped

---

## 5. HARDWARE STATUS (Shown in Welcome)

The welcome message displays:

| Item | What It Checks |
|------|---|
| **Real-Time Audio** | Checks if user is in `audio` group |
| **Audio Devices** | Uses `aplay -l` to list cards |
| **MIDI Devices** | Uses `amidi -l` to list devices |
| **CPU Info** | Reads from `/proc/cpuinfo` |

**To enable real-time audio**:
```bash
# Add current user to audio group
sudo usermod -aG audio $USER

# Apply group membership (requires re-login or use newgrp)
newgrp audio
```

---

## 6. API INTEGRATION ENDPOINTS

All accessible at `http://localhost:8080/api/*`:

| Endpoint | Purpose |
|----------|---------|
| `/health` | Overall health, services running, plugins loaded |
| `/version` | API version info |
| `/audio/status` | Audio engine state, sample rate, buffer size |
| `/audio/latency` | Round-trip latency measurements |
| `/audio/levels` | Channel levels and XRun counts |
| `/pipewire/status` | Pipewire daemon state, quantum, latency |
| `/pipewire/devices` | Audio devices and configuration |
| `/pipewire/settings` | Pipewire settings (rate, quantum, etc.) |
| `/deployment/mode` | Current node mode (all-in-one/audio/management) |
| `/deployment/status` | Deployment status and health |
| `/deployment/health` | Health checks for deployment config |
| `/cluster/health` | Cluster overview and status |
| `/cluster/online-nodes` | List of peer nodes in cluster |

**Test connectivity**:
```bash
curl http://localhost:8080/api/health | python3 -m json.tool
```

---

## 7. FILE LOCATIONS SUMMARY

### Configuration
- **Node mode**: `/etc/guitarfx-mode.conf`
- **Systemd service**: `/etc/systemd/system/map2-backend.service`
- **Project root**: `/home/mm/map2-audio`

### Scripts
- **Backend**: `/home/mm/map2-audio/scripts/` (various)
- **Web UI**: `/home/mm/map2-audio/scripts/start_web.sh`
- **TUI wrapper**: `/home/mm/map2-audio/tui.sh`

### Audio Models & IRs
- **NAM Models**: `~/.local/share/map2/nam/`
- **Cabinet IRs**: `~/.local/share/map2/ir/cabinets/`
- **Reverb IRs**: `~/.local/share/map2/ir/reverbs/`

### Logs
- **Backend**: `/tmp/map2-backend.log`
- **Frontend**: `/tmp/map2-frontend.log`
- **TUI Debug**: `/tmp/map2_node_console.log`
- **Systemd**: `journalctl -u map2-backend -f`

### Web UI
- **Source**: `/home/mm/map2-audio/web/`
- **Dev build**: `web/` (hot-reload on port 3000)
- **Prod build**: `web/dist/` (optimized static files)

---

## 8. TROUBLESHOOTING

### Backend Won't Start
```bash
# Check if port 8080 is in use
lsof -i :8080

# Kill any existing process on 8080
kill -9 <PID>

# Check for errors
cat /tmp/map2-backend.log

# Or start manually to see errors:
cd /home/mm/map2-audio
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080
```

### Frontend Won't Start
```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill any existing process on 3000
kill -9 <PID>

# Check for missing dependencies
cd /home/mm/map2-audio/web
npm install

# Start with verbose logging
npm run dev -- --host 0.0.0.0 --port 3000
```

### Node Console Display Issues
```bash
# Set terminal to 256 colors
export TERM=xterm-256color

# Or use monochrome mode
python3 -m tui.node_console --no-color

# Enable debug logging
python3 -m tui.node_console --debug
tail -f /tmp/map2_node_console.log
```

### API Not Responding
```bash
# Check if backend is running
curl -i http://localhost:8080/api/health

# Check service status
systemctl status map2-backend

# View recent errors
journalctl -u map2-backend --no-pager -n 50

# Tail logs
journalctl -u map2-backend -f
```

---

## 9. COMMON WORKFLOWS

### Full Development Setup
```bash
# Terminal 1: Start backend
systemctl start map2-backend

# Terminal 2: Start web dashboard
/home/mm/map2-audio/scripts/start_web.sh

# Terminal 3: Monitor with Node Console
python3 -m tui.node_console

# Terminal 4: Tail logs
map2-logs  # (if defined in current shell)
```

### Quick Restart Everything
```bash
map2-restart
```
(Requires welcome script to have been sourced in current shell)

### Remote Node Monitoring
```bash
# SSH into audio node
ssh user@audionode

# Launch Node Console
python3 -m tui.node_console

# Navigate with: d/a/c/m/l keys + F1 for help
```

### Production Deployment
```bash
# Ensure backend runs via systemd
systemctl enable map2-backend
systemctl start map2-backend

# Access via web dashboard
firefox http://localhost:3000

# Or monitor via TUI
python3 -m tui.node_console
```

---

## 10. SYSTEM REQUIREMENTS

### Installed Components
- ✅ Python 3.10+
- ✅ Node.js & npm (for web UI)
- ✅ Venv with dependencies (textual, httpx, psutil, etc.)
- ✅ systemd (for service management)

### Required Tools
- `curl` — API testing
- `lsof` — Port checking
- `journalctl` — Service logs
- `ps` / `pgrep` — Process management

### Audio Hardware (Optional)
- Audio input/output devices
- MIDI devices
- I2C LCD display (for standalone mode)

---

## 11. REFERENCE: Before Welcome Script Update

**Removed section** (Shell Customization):
- Starship, Oh-My-Bash, Powerline-Shell, Liquid Prompt, Bash-it recommendations
- `map2-shell-setup` command reference
- Optional terminal enhancement tools

**Reason**: Not part of core MAP2 platform. Users can customize their shell independently if desired.

**Updated**:
- Version date from `1-22-25` → `February 2026`
- Removed shell customization detection logic
- Kept all core service management functionality

---

## Quick Start Checklist

- [ ] Backend running: `systemctl status map2-backend`
- [ ] Frontend running: Check http://localhost:3000
- [ ] API responding: `curl http://localhost:8080/api/health`
- [ ] Node Console available: `python3 -m tui.node_console`
- [ ] Commands defined: Try `map2-status` in current shell
- [ ] Documentation available: See README.md and API docs

---

## Support Resources

- **API Documentation**: http://localhost:8080/docs
- **Node Console Help**: Press `F1` in the TUI
- **System Logs**: `journalctl -u map2-backend -f`
- **Project README**: `/home/mm/map2-audio/README.md`
- **Deployment Guide**: `/home/mm/map2-audio/NODE_CONSOLE_DEPLOYMENT.md`

---

**Last Updated**: February 8, 2026  
**Version**: 2.0  
**Status**: All operations current and validated

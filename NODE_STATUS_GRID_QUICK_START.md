# Node Status Grid — Quick Start Guide

## 🚀 View the Grid Immediately

```bash
source /home/mm/map2-audio/branding/welcome.sh
```

This will display the MAP2 logo followed by the Node Status Grid at the top.

---

## 📋 What You'll See

```
┌─────────────────────────────────────────────────────────────────────┐
│                    NODE STATUS GRID                                 │
├─────────────────────────────────────────────────────────────────────┤
│  Hostname:              MAP2-TESTBED
│  Node Mode:             audio
│  IP Address:            172.20.234.234
│  Backend API:           Online
│  Services:              11/13 running
│  Connected Nodes:       3
│  API Version:           1.24.25.1
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Grid Shows 7 Key Items

| Item | What It Means |
|------|---|
| **Hostname** | Node name in cluster |
| **Node Mode** | Role: audio, management, or all-in-one |
| **IP Address** | Network address for SSH/communication |
| **Backend API** | Is the service running? (Online/Offline) |
| **Services** | How many services are running (e.g., 11/13) |
| **Connected Nodes** | How many peer nodes in cluster |
| **API Version** | Backend version number |

---

## ✅ Grid with Backend Running

When backend is online and healthy:
- ✅ All fields are populated
- ✅ Backend API shows "Online" (GREEN)
- ✅ Services shows actual counts
- ✅ Connected Nodes shows peer count

---

## ⚠️ Grid with Backend Offline

When backend is not running:
- ❌ Backend API shows "Offline" (GRAY)
- ❌ Services shows "0/0 running"
- ❌ Connected Nodes shows "N/A"
- ❌ API Version shows "N/A"

**To fix**: `systemctl start map2-backend`

---

## 🔧 How It Works

The grid automatically:
1. **Gets hostname** — Your node's name
2. **Reads node mode** — From `/etc/guitarfx-mode.conf`
3. **Gets IP address** — From `hostname -I`
4. **Checks backend** — Pings `http://localhost:8080/api/health`
5. **Fetches services** — From health check response
6. **Gets cluster info** — From cluster endpoint
7. **Gets version** — From version endpoint

**All within 2 seconds** (graceful timeout)

---

## 💾 Add to SSH Login

To see the grid every time you SSH in:

```bash
# Add to your ~/.bashrc
echo 'source /home/mm/map2-audio/branding/welcome.sh' >> ~/.bashrc

# Apply immediately
source ~/.bashrc
```

Now grid appears automatically when you SSH to any node.

---

## 🎨 Color Meanings

- 🟢 **GREEN** = Healthy (Online, running)
- 🔵 **BLUE** = Management node mode
- 🟡 **YELLOW** = All-in-One mode or title text
- ⚫ **GRAY** = Offline or offline service

Node Mode colors:
- `audio` → GREEN
- `management` → BLUE  
- `all-in-one` → YELLOW

---

## 🔍 Understanding the Display

### Hostname
Shows your node's name:
- Examples: MAP2-AUDIO-01, MAP2-MGMT-01, testbed-node

### Node Mode (Color-Coded)
- **audio** 🟢 = Processes audio only
- **management** 🔵 = Manages cluster
- **all-in-one** 🟡 = Does both

### IP Address
Your node's network address:
- Use this for SSH access: `ssh user@172.20.234.234`
- First address shown if multiple exist

### Backend API
- **Online** 🟢 = Service responding
- **Offline** ⚫ = Service not responding

### Services
- Shows: `11/13 running` (11 out of 13 running)
- All 13 should be running for full health
- Some offline? Check logs: `journalctl -u map2-backend -f`

### Connected Nodes
- Number of peer nodes visible to this node
- Cluster health indicator
- Shows "1" if standalone or API unavailable

### API Version
- Backend software version
- Example: 1.24.25.1
- Useful for debugging compatibility issues

---

## 🧪 Testing the Grid

### Test 1: View with Backend Running
```bash
# Start backend
systemctl start map2-backend

# Wait 3 seconds
sleep 3

# View grid (should show Online)
source /home/mm/map2-audio/branding/welcome.sh
```

### Test 2: View with Backend Offline
```bash
# Stop backend
systemctl stop map2-backend

# View grid (should show Offline)
source /home/mm/map2-audio/branding/welcome.sh
```

### Test 3: View Raw Data
```bash
# Hostname
hostname

# Node mode
cat /etc/guitarfx-mode.conf | grep deployment_mode

# IP Address
hostname -I

# Backend status
curl http://localhost:8080/api/health

# Services count
curl http://localhost:8080/api/health | grep services

# Connected nodes
curl http://localhost:8080/api/cluster/online-nodes

# API version
curl http://localhost:8080/api/version
```

---

## 🚨 If Grid Shows "N/A" or "Unknown"

### All fields show N/A?
**Problem**: Backend not running  
**Fix**: `systemctl start map2-backend`

### Node Mode shows "Unknown"?
**Problem**: Config file not readable  
**Fix**: Check `/etc/guitarfx-mode.conf` exists and is readable

### IP Address shows "N/A"?
**Problem**: hostname command not working  
**Fix**: Run `ip addr` to verify you have an IP

### Backend shows "Offline" but services show running?
**Problem**: API responding slowly  
**Fix**: Increase timeout in script (advanced)

---

## 📚 Full Documentation

For more details, see:

1. **[NODE_STATUS_GRID.md](NODE_STATUS_GRID.md)**
   - Technical implementation details
   - Data collection strategy
   - Customization options

2. **[NODE_STATUS_GRID_REFERENCE.md](NODE_STATUS_GRID_REFERENCE.md)**
   - Visual examples
   - Troubleshooting guide
   - Scenario walkthroughs

3. **[NODE_STATUS_GRID_SUMMARY.md](NODE_STATUS_GRID_SUMMARY.md)**
   - Complete overview
   - Implementation summary
   - Performance details

---

## 💡 Pro Tips

### Refresh Grid Data
```bash
# Re-source to get latest data
source /home/mm/map2-audio/branding/welcome.sh
```

### Use in Scripts
```bash
# Extract just one field
HOSTNAME=$(hostname)
MODE=$(grep -oP 'deployment_mode["\047]?:\s*"\K[^"]+' /etc/guitarfx-mode.conf)
echo "Node: $HOSTNAME, Mode: $MODE"
```

### Monitor Specific Node
```bash
# Watch a remote node's status
watch -n 5 "ssh audio-node-1 'source /home/mm/map2-audio/branding/welcome.sh' 2>/dev/null | head -20"
```

### Capture for Logging
```bash
# Save grid output with timestamp
{
    echo "=== Node Status at $(date) ==="
    source /home/mm/map2-audio/branding/welcome.sh
} >> /tmp/node_status.log
```

---

## 🎓 Quick Reference

| Command | Purpose |
|---------|---------|
| `source /home/mm/map2-audio/branding/welcome.sh` | View grid |
| `hostname` | Get node name |
| `cat /etc/guitarfx-mode.conf` | Check node mode |
| `hostname -I` | Get IP address |
| `curl http://localhost:8080/api/health` | Check API health |
| `systemctl status map2-backend` | Backend status |

---

## ✨ Features

- ✅ **Fast**: Shows in <2 seconds
- ✅ **Smart**: Graceful fallback if API offline
- ✅ **Informative**: 7 key data points
- ✅ **Professional**: Color-coded display
- ✅ **Zero-dep**: Uses only standard tools
- ✅ **Customizable**: Colors and fields editable
- ✅ **Always available**: Every shell session

---

## 🔗 Related Commands

```bash
# Start the TUI (Terminal UI)
python3 -m tui.node_console

# See full welcome message
source /home/mm/map2-audio/branding/welcome.sh

# Check backend logs
journalctl -u map2-backend -f

# Restart full stack
map2-restart  # (if defined in current shell)

# Check service status
map2-status   # (if defined in current shell)
```

---

## 📞 Support

**Grid not showing?**
- Make sure you're in `/home/mm/map2-audio` directory
- Run: `bash -x /home/mm/map2-audio/branding/welcome.sh` to debug

**Values showing N/A?**
- Check backend is running: `systemctl status map2-backend`
- Wait for startup: Backend takes 10-30 seconds to initialize

**Need more info?**
- See full documentation in grid markdown files
- Check `/tmp/map2_node_console.log` for TUI logs
- Review `journalctl -u map2-backend` for service logs

---

## 🎉 You're Ready!

The Node Status Grid is now active and providing instant node health visibility.

**Next step**: Add to your `~/.bashrc` to see it on every SSH login!

```bash
echo 'source /home/mm/map2-audio/branding/welcome.sh' >> ~/.bashrc
```

---

**Status**: ✅ Node Status Grid is live  
**Files**: Updated `branding/welcome.sh`  
**Documentation**: 3 detailed guides provided

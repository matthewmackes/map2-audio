# MAP2 Audio Server Commands

## 🚀 Quick Start

### Restart Web Server (Port 3000)
```bash
# Direct execution
/home/mm/map2-audio/server-restart.sh

# Or with alias (after setup)
/server-restart
# or
server-restart
```

### Check Server Status
```bash
lsof -i :3000
# or with alias
server-status
```

### View Live Server Output
```bash
cd /home/mm/map2-audio/web && npm run dev
```

---

## 📋 Setup Instructions

### 1. Add Aliases to Your Shell (Optional but Recommended)

**For Bash:**
```bash
cat /home/mm/map2-audio/.map2-aliases >> ~/.bashrc
source ~/.bashrc
```

**For Zsh:**
```bash
cat /home/mm/map2-audio/.map2-aliases >> ~/.zshrc
source ~/.zshrc
```

### 2. Verify Setup
```bash
/server-restart --help  # Check if available
```

---

## 🎯 Available Commands After Setup

| Command | Purpose |
|---------|---------|
| `/server-restart` | Restart web server on port 3000 |
| `server-restart` | Same as above (without slash) |
| `server-status` | Check if server is running |
| `api-status` | Check if API is running |
| `map2` | Navigate to project root |
| `map2-web` | Navigate to web folder |
| `map2-app` | Navigate to app folder |
| `map2-juce` | Navigate to JUCE engine folder |

---

## 🔧 What the Script Does

The `server-restart.sh` script:
1. ✓ Kills any existing process on port 3000
2. ✓ Waits 1 second for clean shutdown
3. ✓ Navigates to `/home/mm/map2-audio/web`
4. ✓ Runs `npm run dev` with host 0.0.0.0
5. ✓ Shows local and network URLs
6. ✓ Displays helpful usage information

**Output:**
```
🔄 Restarting MAP2 Web Server on Port 3000...

📍 Stopping existing processes on port 3000...
✓ Port 3000 cleared

🚀 Starting development server...
   📌 Local:   http://localhost:3000/
   📌 Network: http://172.20.234.234:3000/

Press Ctrl+C to stop the server

  VITE v6.4.1  ready in 428 ms
  ➜  Local:   http://localhost:3000/
  ➜  Network: http://172.20.234.234:3000/
```

---

## 💡 Pro Tips

### Restart and Keep Running in Background
```bash
nohup /home/mm/map2-audio/server-restart.sh > /tmp/map2-server.log 2>&1 &
```

### Monitor Server Logs
```bash
tail -f /tmp/map2-server.log
```

### Quick Kill & Restart
```bash
pkill -f "npm run dev" && sleep 1 && /server-restart
```

### Check Both Services
```bash
echo "Web Server:" && server-status
echo "API Server:" && api-status
```

---

## 🔗 Related Locations

- **Script Location:** `/home/mm/map2-audio/server-restart.sh`
- **Aliases File:** `/home/mm/map2-audio/.map2-aliases`
- **Web Directory:** `/home/mm/map2-audio/web/`
- **Package.json:** `/home/mm/map2-audio/web/package.json`
- **Vite Config:** `/home/mm/map2-audio/web/vite.config.ts`

---

**Version:** 1.0  
**Date:** February 2, 2026  
**Status:** Ready to Use

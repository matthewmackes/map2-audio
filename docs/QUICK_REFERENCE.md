# Quick Reference: Common Operations

## Backend Service

```bash
# Start (systemd - recommended)\nsystemctl start map2-backend

# Status
systemctl status map2-backend

# Logs (live)
journalctl -u map2-backend -f

# Stop
systemctl stop map2-backend

# Restart
systemctl restart map2-backend
```

---

## Web Dashboard

```bash
# Start dev server
/home/mm/map2-audio/scripts/start_web.sh

# Access at: http://localhost:3000
```

---

## Node Console (Terminal UI)

```bash
# Direct launch
python3 -m tui.node_console

# Via wrapper (auto-starts backend)
/home/mm/map2-audio/tui.sh

# SSH remote
ssh user@node "python3 -m tui.node_console"

# With options
python3 -m tui.node_console --debug
python3 -m tui.node_console --no-color
python3 -m tui.node_console --refresh 3
```

**Keyboard shortcuts in Node Console**:
- `F1` or `6` → Help
- `d/a/c/m/l` → Jump to tab
- `F5` or `r` → Refresh
- `q` → Quit

---

## Quick Commands (After Welcome Message)

```bash
# Full restart (stop both, start both)
map2-restart

# Show service status
map2-status

# Tail both logs
map2-logs

# Stop all services
map2-stop
```

---

## API Testing

```bash
# Check health
curl http://localhost:8080/api/health | python3 -m json.tool

# View API docs
# Open: http://localhost:8080/docs
```

---

## Port Verification

```bash
# Check which process is using port 8080
lsof -i :8080

# Check which process is using port 3000
lsof -i :3000

# Kill process on port 8080
kill -9 $(lsof -t -i :8080)
```

---

## File Locations

| Resource | Path |
|----------|------|
| Project root | `/home/mm/map2-audio` |
| Node mode config | `/etc/guitarfx-mode.conf` |
| Backend logs | `/tmp/map2-backend.log` |
| Frontend logs | `/tmp/map2-frontend.log` |
| TUI debug logs | `/tmp/map2_node_console.log` |
| NAM models | `~/.local/share/map2/nam/` |
| Cabinet IRs | `~/.local/share/map2/ir/cabinets/` |
| Reverb IRs | `~/.local/share/map2/ir/reverbs/` |

---

## Troubleshooting

**Port already in use?**
```bash
lsof -i :8080  # or :3000 for frontend
kill -9 <PID>
```

**Backend won't start?**
```bash
cat /tmp/map2-backend.log
# Or start manually:
cd /home/mm/map2-audio
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080
```

**TUI display issues?**
```bash
export TERM=xterm-256color
python3 -m tui.node_console
# Or use monochrome:
python3 -m tui.node_console --no-color
```

---

For full documentation, see: **OPERATIONS_GUIDE.md**

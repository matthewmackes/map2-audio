# Vite Build & Server Troubleshooting Guide
## Postmortem: "Server Down" Issue (February 12, 2026)

### Incident Summary
**Reported Issue**: "Pages are not loading correctly" / "Server down"  
**Actual Cause**: Build folder (`dist/`) was deleted, rebuild in progress, server waiting for files  
**Resolution Time**: ~60 seconds (build completion time)  
**Root Cause**: `rm -rf dist` removed build output while the production web server on port `3000` was still running, so operators saw an empty/incomplete bundle until the rebuild finished

---

## Critical Diagnostic Steps (DO THESE FIRST)

### 1. Check the FULL Stack Status
**DO NOT assume server down = pages broken**. Check ALL layers:

```bash
# Layer 1: Is the build complete?
ls -lh /home/mm/map2-audio/web/dist/index.html 2>&1 | head -1

# Layer 2: Is the server process running?
ps aux | grep -E "serve_web_dist.mjs|node.*3000" | grep -v grep

# Layer 3: Is the server responding?
curl -s -I http://localhost:3000/ 2>&1 | head -1

# Layer 4: What files are being served?
curl -s http://localhost:3000/ | grep -o 'index-[^"]*\.js' | head -1
```

### 2. Identify the Actual Problem

| Symptom | Diagnosis | Fix |
|---------|-----------|-----|
| `dist/index.html` missing | Build incomplete/failed | Wait or rebuild |
| Server process not found | Server not running | Start server |
| Server responds but 404 | Wrong port/path | Check logs/config |
| Old files being served | Stale cache | Clear browser cache |

---

## Common Scenarios & Solutions

### Scenario A: Build Deleted, Server Running
**Symptoms**:
- Server process exists
- `dist/` folder missing or empty
- Server responds with errors or empty page

**Solution**:
```bash
# Check if build is already running
ps aux | grep -E "build_web_dist_atomic.py|vite build" | grep -v grep

# If not running, start build
cd /home/mm/map2-audio/web && npm run build

# Server will automatically serve new files
```

**⚠️ DO NOT**:
- Kill and restart server unnecessarily
- Run multiple builds in parallel
- Use `rm -rf dist` during active development

---

### Scenario B: Stale Browser Cache
**Symptoms**:
- Build has correct files (verified with `grep`)
- Server serving correct files
- Browser shows old version

**Solution**:
```bash
# Verify build has changes
grep -c '00d9ff' /home/mm/map2-audio/web/dist/assets/*.js

# If build is correct, problem is browser cache
# Instruct user to:
# 1. Open DevTools (F12)
# 2. Network tab → Disable cache checkbox
# 3. Hard reload (Ctrl+Shift+R)
# 4. Or: Application → Clear storage → Clear site data
```

---

### Scenario C: Server Actually Down
**Symptoms**:
- No production web server process
- `curl` connection refused

**Solution**:
```bash
# Start server
cd /home/mm/map2-audio/web
nohup npm run serve > /tmp/map2-web-prod.log 2>&1 &

# Verify
curl --silent --show-error --fail --retry 30 --retry-delay 0 --retry-connrefused \
  --retry-all-errors --retry-max-time 15 http://localhost:3000/ >/dev/null
curl -s -I http://localhost:3000/ | head -1
```

---

## Best Practices for AI Agents

### ✅ DO

1. **Check build status first** before assuming server issues
   ```bash
   test -f /home/mm/map2-audio/web/dist/index.html && echo "Built" || echo "Building"
   ```

2. **Let long-running processes finish** (builds take ~30s)
   ```bash
   cd /home/mm/map2-audio/web && npm run build
   ```

3. **Verify the complete chain**:
   - Source has changes
   - Build includes changes  
   - Server serves build
   - Browser receives server output

4. **Use background processes properly**:
   ```bash
   nohup command > logfile 2>&1 &  # Correct
   command &  # Wrong - will stop when terminal closes
   ```

5. **Check logs before making assumptions**:
   ```bash
   journalctl -u map2-web-prod.service -n 20 --no-pager
   tail -20 /home/mm/map2-audio/logs/deploy-build.log
   ```

### ❌ DON'T

1. **Don't kill servers unnecessarily** - the production web server will serve the rebuilt `dist/` once the deploy/build finishes
2. **Don't run parallel builds** - causes conflicts and wasted resources
3. **Don't use `rm -rf dist`** during development - breaks hot module reload
4. **Don't assume terminal output = ground truth** - verify with filesystem checks
5. **Don't interrupt build processes** - let them complete (~30s)

---

## Quick Reference Commands

### Health Check (Copy-Paste)
```bash
echo "=== BUILD STATUS ===" && \
test -f /home/mm/map2-audio/web/dist/index.html && echo "✓ Built" || echo "✗ Missing" && \
echo "=== SERVER STATUS ===" && \
ps aux | grep "serve_web_dist.mjs" | grep -v grep && echo "✓ Running" || echo "✗ Stopped" && \
echo "=== SERVER RESPONSE ===" && \
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000/ || echo "✗ No response"
```

### Full Recovery (Copy-Paste)
```bash
# Full rebuild + restart
cd /home/mm/map2-audio/web && npm run deploy
```

---

## Debugging Checklist

When a user reports "pages not loading" or "server down":

- [ ] Check if `dist/index.html` exists
- [ ] Check if the production web server process is running
- [ ] Check if build process is running
- [ ] Test server response with curl
- [ ] Verify build output contains expected changes
- [ ] Check for port conflicts (`sudo lsof -ti:3000`)
- [ ] Review server logs (`journalctl -u map2-web-prod.service -n 50 --no-pager` or `/tmp/map2-web-prod.log` for manual starts)
- [ ] Review build logs (`/tmp/build.log`)
- [ ] Only after ALL checks: restart server

---

## Common Mistakes Made in This Incident

1. ✗ Assumed server down when actually build was incomplete
2. ✗ Tried multiple redundant rebuilds
3. ✗ Killed server unnecessarily (it was working fine)
4. ✗ Didn't wait for long-running build to complete
5. ✓ Eventually verified the full stack and found build was the issue

## Lessons Learned

1. **Build takes time** (~30s) - don't panic and restart
2. **Server auto-serves new files** - no need to restart after build
3. **Check filesystem first** - more reliable than terminal output
4. **One fix at a time** - don't compound problems
5. **Browser cache is sneaky** - always verify server-side first

---

## File Locations Reference

| File | Purpose |
|------|---------|
| `/home/mm/map2-audio/web/dist/` | Build output folder |
| `/home/mm/map2-audio/web/src/` | Source files |
| `/tmp/map2-web-prod.log` | Manual server log |
| `/home/mm/map2-audio/logs/deploy-build.log` | Deploy/build log |
| `http://localhost:3000/` | Local server |
| `http://172.20.234.234:3000/` | Network server |

---

**Last Updated**: February 12, 2026  
**Incident**: Pages not loading (build in progress)  
**Resolution**: Wait for build completion, verify stack, no server restart needed

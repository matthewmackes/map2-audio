# ⚠️ WEB SERVER DEPLOYMENT NOTES

## CRITICAL: Production-Only Configuration

**Last Updated:** February 11, 2026

### Port Configuration

- **Port 3000**: Production web server ONLY
  - Server: `node ../scripts/serve_web_dist.mjs --port 3000 --host 0.0.0.0`
  - Serves: Pre-built optimized bundles from `/web/dist/`
  - Type: Full production UI with backend proxy rules on the same web port

- **Port 8080**: Backend FastAPI server
  - Server: `uvicorn app.main:app --host 0.0.0.0 --port 8080`
  - Serves: REST API endpoints at `/api/*`

### Supported Contract

- The web UI is served only from `http://localhost:3000`
- The backend stays on `http://localhost:8080`
- Local editing still uses the production build path: rebuild, then refresh port 3000

### Deployment Steps

1. **Build production bundle:**
   ```bash
   cd /home/mm/map2-audio/web
   npm run build
   ```

2. **Start production web server (port 3000):**
   ```bash
   cd /home/mm/map2-audio/web
   node ../scripts/serve_web_dist.mjs --port 3000 --host 0.0.0.0
   ```
   Or run in background:
   ```bash
   nohup node ../scripts/serve_web_dist.mjs --port 3000 --host 0.0.0.0 > /tmp/map2-web-prod.log 2>&1 &
   ```

3. **Verify servers:**
   - Web UI: http://localhost:3000/
   - API: http://localhost:8080/api/engine/status

### Why Production-Only?

- **Stability:** Optimized builds tested before deployment
- **Performance:** Minified, tree-shaken bundles
- **Consistency:** The same frontend path is used for local verification and deployment
- **Single contract:** One supported web port avoids mode confusion

### Local Editing Workflow

1. Edit files in `/web/src/`
2. Run `npm run build` to create production bundle
3. Refresh browser at http://localhost:3000/

**Note:** For rapid development, use file watchers or `inotifywait` to auto-rebuild on save.

---

**See Also:**
- `/home/mm/map2-audio/docs/WEB_SERVER_PORTS.md` - Complete port documentation
- `/home/mm/map2-audio/web/README.md` - Web frontend README
- `/home/mm/map2-audio/web/package.json` - NPM scripts reference

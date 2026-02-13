# ⚠️ WEB SERVER DEPLOYMENT NOTES

## CRITICAL: Production-Only Configuration

**Last Updated:** February 11, 2026

### Port Configuration

- **Port 3000**: Production web server ONLY
  - Server: `vite preview --port 3000 --host 0.0.0.0`
  - Serves: Pre-built optimized bundles from `/web/dist/`
  - Type: Static file server (no HMR, no hot-reload)

- **Port 8080**: Backend FastAPI server
  - Server: `uvicorn app.main:app --host 0.0.0.0 --port 8080`
  - Serves: REST API endpoints at `/api/*`

### ❌ What We DO NOT Use

- **NO Vite dev server** on ANY port
- **NO port 3001** - completely unused
- **NO hot module replacement (HMR)**
- **NO development mode**
- **NO dual-server setup**

### Deployment Steps

1. **Build production bundle:**
   ```bash
   cd /home/mm/map2-audio/web
   npm run build
   ```

2. **Start production web server (port 3000):**
   ```bash
   cd /home/mm/map2-audio/web
   vite preview --port 3000 --host 0.0.0.0
   ```
   Or run in background:
   ```bash
   nohup vite preview --port 3000 --host 0.0.0.0 > /tmp/vite_prod.log 2>&1 &
   ```

3. **Verify servers:**
   - Web UI: http://localhost:3000/
   - API: http://localhost:8080/api/engine/status

### Why Production-Only?

- **Stability:** Optimized builds tested before deployment
- **Performance:** Minified, tree-shaken bundles
- **Consistency:** Same build for dev and production
- **No HMR bugs:** Avoid hot-reload edge cases

### Development Workflow

1. Edit files in `/web/src/`
2. Run `npm run build` to create production bundle
3. Refresh browser at http://localhost:3000/

**Note:** For rapid development, use file watchers or `inotifywait` to auto-rebuild on save.

---

**See Also:**
- `/home/mm/map2-audio/WEB_SERVER_PORTS.md` - Complete port documentation
- `/home/mm/map2-audio/web/README.md` - Web frontend README
- `/home/mm/map2-audio/web/package.json` - NPM scripts reference

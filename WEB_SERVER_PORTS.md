# Web Server Port Configuration

## ⚠️ CRITICAL: Production-Only Server Setup

**MAP2 uses ONLY a production server configuration.**

### Port 3000 - Production Web Server

- **Purpose:** Serves optimized, pre-built production bundles from `/web/dist/`
- **Server:** Vite preview server (`vite preview --port 3000 --host 0.0.0.0`)
- **Build:** `cd web && npm run build` (creates optimized bundle)
- **Start:** `cd web && vite preview --port 3000 --host 0.0.0.0`

### Port 8080 - FastAPI Backend Server

- **Purpose:** Python FastAPI backend serving `/api/*` endpoints
- **Server:** Uvicorn ASGI server
- **Start:** `python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080`

---

## ❌ What We DO NOT Use

- **NO Vite dev server** (no `vite --port 3001`)
- **NO hot module replacement (HMR)** in development
- **NO port 3001** - this port should remain unused
- **NO dual-server setup** - production build only

---

## Why Production-Only?

1. **Stability:** Production builds are optimized and tested
2. **Consistency:** Same build pipeline for development and deployment
3. **Performance:** Minified, tree-shaken, optimized bundles
4. **No HMR Issues:** Avoid hot-reload edge cases and state bugs

---

## Development Workflow

1. Make code changes in `/web/src/`
2. Run `cd web && npm run build` to create production bundle
3. Production server on port 3000 automatically serves new build
4. Refresh browser to see changes

**Tip:** Use `inotifywait` or similar tools to auto-rebuild on file changes if needed.

---

## Quick Reference Commands

```bash
# Build production bundle
cd web && npm run build

# Start production web server (port 3000)
cd web && vite preview --port 3000 --host 0.0.0.0

# Start backend API server (port 8080)
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080

# Build + Start (combined)
cd web && npm run start:prod
```

---

**Last Updated:** February 11, 2026

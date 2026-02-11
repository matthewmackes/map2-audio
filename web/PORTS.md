# MAP2 Web Interface Port Configuration

## Port Usage

### Port 3000 - **PRODUCTION STATIC SERVER**
- **Purpose:** Serves pre-built production bundle from `dist/` folder
- **Server:** `serve` package (static file server)
- **Command:** `npm run serve`
- **Features:**
  - ❌ NO hot module replacement
  - ❌ NO source maps
  - ✅ Optimized, minified production build
  - ✅ Gzip compression
  - ✅ SPA fallback routing (`-s` flag)
- **Use Case:** Testing production builds locally, final deployment verification
- **Started By:** `./node_modules/.bin/serve dist -l 3000 --no-clipboard -s`

### Port 3001 - **DEVELOPMENT SERVER (Vite)**
- **Purpose:** Live development with hot module replacement
- **Server:** Vite dev server
- **Command:** `npm run dev`
- **Features:**
  - ✅ Hot module replacement (HMR)
  - ✅ Source maps for debugging
  - ✅ Fast refresh on code changes
  - ✅ TypeScript type checking
  - ❌ NOT optimized (larger bundle, slower)
- **Use Case:** Active development, debugging, testing changes
- **Started By:** `vite --host 0.0.0.0 --port 3001`

## Common Mistakes to Avoid

### ❌ WRONG: "Port 3000 isn't updating when I make changes!"
**Why:** Port 3000 serves a static build. You must rebuild to see changes.
**Fix:** Use port 3001 for development, or run `npm run build` after each change (not recommended).

### ❌ WRONG: "The dev server isn't running but I see port 3000 active"
**Why:** Port 3000 is the production static server, not the dev server.
**Fix:** Check port 3001 (`lsof -i :3001`) or start dev server (`npm run dev`).

### ❌ WRONG: Assuming `npm run serve` is for development
**Why:** `serve` is a static file server for production builds.
**Fix:** Use `npm run dev` for development work.

## Quick Reference

```bash
# Check what's running on each port
lsof -i :3000  # Production static server
lsof -i :3001  # Vite dev server

# Start development (with hot reload)
cd web && npm run dev  # → http://localhost:3001

# Build and serve production
cd web && npm run build && npm run serve  # → http://localhost:3000

# Access from browser
# Development: http://localhost:3001
# Production:  http://localhost:3000
```

## For AI Assistants

When a user reports:
- "Black page" or "not updating" on port 3000 → They need to rebuild (`npm run build`) or use port 3001
- "Changes not reflecting" → Check which port they're using
- "Page loading issues" → Verify the correct server is running for their use case

**Remember:** 3000 = static prod files, 3001 = live dev server

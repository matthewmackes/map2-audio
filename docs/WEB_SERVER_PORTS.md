# Web Server Port Configuration

## Supported Ports

### Port 3000

- **Role:** The only supported MAP2 web UI port
- **Server:** `vite preview --host 0.0.0.0 --port 3000`
- **Content:** The full production build from `/web/dist/`

### Port 8080

- **Role:** FastAPI backend for `/api/*`, `/ws`, and related services
- **Server:** `python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080`

## Required Workflow

1. Edit files in `/web/src/`
2. Run `cd web && npm run build`
3. Run `cd web && npm run preview`
4. Refresh `http://localhost:3000`

## Quick Reference

```bash
cd /home/mm/map2-audio/web
npm run build
npm run preview
```

```bash
cd /home/mm/map2-audio
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080
```

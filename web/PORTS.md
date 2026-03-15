# MAP2 Web Interface Port Configuration

## Active Ports

### Port 3000

- **Purpose:** The only supported frontend port
- **Server:** `vite preview --host 0.0.0.0 --port 3000`
- **Source:** Production bundle from `dist/`
- **Use Case:** Local verification and deployed web access

### Port 8080

- **Purpose:** Backend API and WebSocket services
- **Server:** `uvicorn app.main:app --host 0.0.0.0 --port 8080`

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

## Rule

Rebuild after frontend edits and always use `http://localhost:3000`.

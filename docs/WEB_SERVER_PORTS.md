# Web Server Port Configuration

## Supported Ports

### Port 3000

- **Role:** The only supported MAP2 web UI port
- **Server:** `node ../scripts/serve_web_dist.mjs --host 0.0.0.0 --port 3000`
- **Content:** The full production build from `/web/dist/`

### Port 8080

- **Role:** FastAPI backend for `/api/*`, `/ws`, and related services
- **Server:** `python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080`
- **Metrics export:** `/api/metrics/prometheus` on every node for lightweight remote scraping

### Port 9090

- **Role:** Prometheus server
- **Host policy:** Management and all-in-one nodes only
- **Audio-node policy:** Do not host local Prometheus on dedicated audio nodes; scrape their backend exporter from a management-plane node instead

### Port 3001

- **Role:** Grafana UI
- **Host policy:** Management and all-in-one nodes only
- **Audio-node policy:** Reserved for Grafana when observability stack is enabled; dedicated audio nodes should leave it unused

## Required Workflow

1. Edit files in `/web/src/`
2. Run `cd web && npm run build`
3. Run `cd web && npm run serve`
4. Refresh `http://localhost:3000`

## Quick Reference

```bash
cd /home/mm/map2-audio/web
npm run build
npm run serve
```

```bash
cd /home/mm/map2-audio
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080
```

# Quick Restart Script

A safe, production-ready script to restart the MAP2 Audio Platform with both the backend (FastAPI) and frontend (Vite) servers.

## Overview

The `quick-restart.sh` script manages:

- **Backend FastAPI Server** - Port `8080` (FIXED)
- **Frontend Vite Server** - Port `3000` (FIXED)

## Usage

```bash
./quick-restart.sh
```

## What It Does

1. **Gracefully stops** any existing services on ports 8080 and 3000
2. **Waits** up to 5 seconds for graceful shutdown
3. **Force-kills** if processes don't respond
4. **Starts** the FastAPI backend
5. **Waits** for backend health check (up to 30 seconds)
6. **Starts** the Vite frontend development server
7. **Waits** for frontend to be ready (up to 30 seconds)
8. **Reports** success with access information

## Output

The script provides color-coded feedback:

- 🟢 **Green** - Success/Ready
- 🟡 **Yellow** - In Progress/Warnings
- 🟢 **Blue** - Information

## Access Points After Starting

Once the script completes successfully:

| Service | URL | Port |
|---------|-----|------|
| Frontend | http://localhost:3000 | 3000 |
| Backend | http://localhost:8080 | 8080 |
| API Docs | http://localhost:8080/docs | 8080 |

## Logs

Real-time logs are saved and can be monitored:

```bash
# Backend logs
tail -f /tmp/map2-backend.log

# Frontend logs
tail -f /tmp/map2-frontend.log
```

## Stopping Services

```bash
# Method 1: Kill the specific process IDs (shown by the script)
kill <BACKEND_PID> <FRONTEND_PID>

# Method 2: Kill by process name
pkill -f 'uvicorn app.main'
pkill -f 'vite'

# Method 3: Kill by port
lsof -t -i :8080 | xargs kill -9
lsof -t -i :3000 | xargs kill -9
```

## ⚠️ Important Notes for AI Assistants

**DO NOT CHANGE THE PORTS:**
- Backend is **ALWAYS** on port `8080`
- Frontend is **ALWAYS** on port `3000`

These ports are fixed by design. Do not:
- Move services to different ports
- Create environment variables to override ports
- Modify port configuration
- Suggest port changes in development or production

## Troubleshooting

### Backend won't start
Check logs: `tail -20 /tmp/map2-backend.log`

### Frontend won't start
Check logs: `tail -20 /tmp/map2-frontend.log`

### Port already in use
The script will force-kill existing processes. If it still fails:
```bash
# Check what's using the port
lsof -i :8080
lsof -i :3000

# Force kill if needed
kill -9 <PID>
```

### Health checks failing
Wait a bit longer, services may need time to initialize. Check logs for specific errors.

## Development Notes

The script:
- Uses `set -e` to exit on any error
- Gracefully handles process shutdown (SIGTERM first, SIGKILL as fallback)
- Provides real-time feedback during startup
- Validates service readiness via health checks
- Logs all output to temporary files for debugging

## Related Scripts

- `server-restart.sh` - Only restarts web server
- `start_all_services.sh` - Starts all services (including backend)

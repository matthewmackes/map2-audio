Full stack restart of MAP2 Audio Platform with step-by-step progress feedback.

## Steps to execute (run each step and show output before proceeding):

### Step 1: Stop Backend (port 8080)
```bash
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 1/4: Stopping Backend Server (port 8080)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
PIDS=$(lsof -t -i :8080 2>/dev/null || true)
if [ -n "$PIDS" ]; then
    echo "Found processes: $PIDS"
    kill -9 $PIDS 2>/dev/null || true
    sleep 1
    echo "✓ Backend stopped"
else
    echo "✓ Port 8080 already free"
fi
```

### Step 2: Stop Frontend (port 3000)
```bash
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 2/4: Stopping Frontend Server (port 3000)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
PIDS=$(lsof -t -i :3000 2>/dev/null || true)
if [ -n "$PIDS" ]; then
    echo "Found processes: $PIDS"
    kill -9 $PIDS 2>/dev/null || true
    sleep 1
    echo "✓ Frontend stopped"
else
    echo "✓ Port 3000 already free"
fi
```

### Step 3: Start Backend
Run in background and wait for health check:
```bash
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 3/4: Starting Backend (FastAPI on port 8080)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd /home/mm/map2-audio
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080 > /tmp/map2-backend.log 2>&1 &
BACKEND_PID=$!
echo "Started backend (PID: $BACKEND_PID)"
echo "Waiting for backend health check..."
for i in {1..30}; do
    if curl -s http://localhost:8080/api/health > /dev/null 2>&1; then
        echo "✓ Backend ready at http://localhost:8080"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "⚠ Backend not responding yet (may still be initializing)"
    fi
    sleep 1
done
```

### Step 4: Start Frontend
Run in background and wait for ready:
```bash
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 4/4: Starting Frontend (Vite on port 3000)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd /home/mm/map2-audio/web
npm run dev -- --host 0.0.0.0 --port 3000 > /tmp/map2-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "Started frontend (PID: $FRONTEND_PID)"
echo "Waiting for Vite to compile..."
for i in {1..20}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo "✓ Frontend ready at http://localhost:3000"
        break
    fi
    if [ $i -eq 20 ]; then
        echo "⚠ Frontend not responding yet (may still be building)"
    fi
    sleep 1
done
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ MAP2 RESTART COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:8080"
echo "API Docs: http://localhost:8080/docs"
echo ""
echo "Logs: tail -f /tmp/map2-backend.log /tmp/map2-frontend.log"
```

Execute each step sequentially, showing output as you go.

#!/bin/bash
# MAP2 Backend Services Monitor - Terminal User Interface
# World-class monitoring dashboard for all 13 backend services
#
# Features:
#   - Real-time service health status
#   - System metrics (CPU, Memory, Latency)
#   - Active alerts with severity indicators
#   - Circuit breaker visualization
#   - Service dependency graph
#   - Live log streaming
#
# Press 'm' to return to Monitor from any tab

cd "$(dirname "$0")"

# Check if backend is running
if ! curl -s --max-time 2 http://localhost:8080/api/health >/dev/null 2>&1; then
    echo "╔═══════════════════════════════════════════════════════╗"
    echo "║  MAP2 Backend Services Monitor                        ║"
    echo "╠═══════════════════════════════════════════════════════╣"
    echo "║  Backend API not running at http://localhost:8080     ║"
    echo "║  Starting backend API...                              ║"
    echo "╚═══════════════════════════════════════════════════════╝"

    # Start backend in background
    python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 >/dev/null 2>&1 &
    BACKEND_PID=$!

    # Wait for backend to start
    for i in {1..15}; do
        if curl -s --max-time 1 http://localhost:8080/api/health >/dev/null 2>&1; then
            echo "✓ Backend started (PID: $BACKEND_PID)"
            break
        fi
        echo -n "."
        sleep 1
    done
    echo ""
fi

echo "╔═══════════════════════════════════════════════════════╗"
echo "║  Launching Backend Services Monitor...                ║"
echo "╚═══════════════════════════════════════════════════════╝"

# Launch TUI as a module (required for relative imports)
exec python3 -m tui.app

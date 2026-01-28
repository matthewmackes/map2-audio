#!/bin/bash
# MAP2 Audio Platform - Launch TUI Interface
# Opens the Textual terminal user interface

cd "$(dirname "$0")"

# Check if backend is running (skip textual check - Python handles it)
if ! curl -s --max-time 2 http://localhost:8080/api/health >/dev/null 2>&1; then
    echo "Backend API not running at http://localhost:8080"
    echo "Starting backend API..."

    # Start backend in background
    python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 >/dev/null 2>&1 &
    BACKEND_PID=$!

    # Wait for backend to start (reduced timeout)
    for i in {1..15}; do
        if curl -s --max-time 1 http://localhost:8080/api/health >/dev/null 2>&1; then
            echo "Backend started (PID: $BACKEND_PID)"
            break
        fi
        sleep 1
    done
fi

# Launch TUI directly
cd tui
exec python3 app.py
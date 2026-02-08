#!/bin/bash
# MAP2 Node Console — Professional TUI for Headless Audio Nodes
#
# Features:
#   - Real-time node health: CPU, RAM, temp, audio latency
#   - Audio engine status: Pipewire, JUCE, channels, XRuns
#   - Cluster overview: peer nodes, audio flows, clock sync
#   - System controls: mode change, service restart, reboot/shutdown
#   - Live logs: journalctl tail with severity/unit filters
#   - SSH-optimized: keyboard-driven, no animations, 80×24 compatible

cd "$(dirname "$0")"

# Check if backend is running
if ! curl -s --max-time 2 http://localhost:8080/api/health >/dev/null 2>&1; then
    echo "╔═══════════════════════════════════════════════════════╗"
    echo "║  MAP2 Node Console                                    ║"
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
echo "║  Launching MAP2 Node Console...                       ║"
echo "║                                                       ║"
echo "║  Keyboard: F1=Help F5=Refresh d/a/c/m/l=Tabs q=Quit   ║"
echo "╚═══════════════════════════════════════════════════════╝"

# Launch the new Node Console (modern professional TUI)
exec python3 -m tui.node_console "$@"

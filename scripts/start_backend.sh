#!/bin/bash
# MAP2 Audio Platform - Backend Server Startup

echo "Starting MAP2 Audio Platform Backend..."
echo "========================================"
echo

# Set Python path
export PYTHONPATH=$(pwd)

# Check if uvicorn is available
if ! python3 -c "import uvicorn" 2>/dev/null; then
    echo "Error: uvicorn not installed"
    echo "Run ./setup.sh first or install manually:"
    echo "  pip3 install -r requirements.txt --user"
    exit 1
fi

# Start the server
echo "Backend API starting on http://localhost:8080"
echo "API Docs available at http://localhost:8080/docs"
echo
echo "Press Ctrl+C to stop"
echo

python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload

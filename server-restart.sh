#!/bin/bash

###############################################################################
# MAP2 Audio - Web Server Restart Command
# Usage: /server-restart or ./server-restart.sh
###############################################################################

set -e

echo "🔄 Restarting MAP2 Web Server on Port 3000..."
echo ""

# Kill existing process on port 3000
echo "📍 Stopping existing processes on port 3000..."
lsof -i :3000 2>/dev/null | grep -v COMMAND | awk '{print $2}' | xargs kill -9 2>/dev/null || true
sleep 1
echo "✓ Port 3000 cleared"
echo ""

# Navigate to web directory
cd /home/mm/map2-audio/web

# Start the development server
echo "🚀 Starting development server..."
echo "   📌 Local:   http://localhost:3000/"
echo "   📌 Network: http://$(hostname -I | awk '{print $1}'):3000/"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm run dev 2>&1

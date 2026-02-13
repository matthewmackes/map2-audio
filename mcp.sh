#!/bin/bash
#
# Master Commit & Push (MCP)
# Stages all changes, commits with a provided message, and pushes to master.
#
# Usage: ./mcp.sh "Your commit message"

set -e # Exit immediately if a command exits with a non-zero status.

# --- 1. Validate Input ---
if [ -z "$1" ]; then
  echo "🛑 Error: No commit message provided."
  echo "   Usage: ./mcp.sh "Your commit message""
  exit 1
fi

COMMIT_MESSAGE=$1

# --- 2. Stage ---
echo "⚙️  Staging all changes..."
git add .

# --- 3. Commit ---
echo "📝 Committing with message: "$COMMIT_MESSAGE""
git commit -m "$COMMIT_MESSAGE"

# --- 4. Push ---
echo "🚀 Pushing to origin master..."
git push origin master

echo "✅ Done."

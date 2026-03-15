#!/bin/bash
# Compatibility wrapper for the unified MAP2 console.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAP2_SCRIPT="$SCRIPT_DIR/map2.sh"

exec "$MAP2_SCRIPT" "$@"

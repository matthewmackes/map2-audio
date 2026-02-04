#!/bin/bash
# MAP2 Quick Access Script
# Provides shortcuts for common MAP2 operations

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MAP2_SCRIPT="$SCRIPT_DIR/map2.sh"

# Quick shortcuts
case "${1:-help}" in
    # Service shortcuts  
    on|start) "$MAP2_SCRIPT" start ;;
    off|stop) "$MAP2_SCRIPT" stop ;;
    restart|r) "$MAP2_SCRIPT" restart ;;
    qr) "$MAP2_SCRIPT" quick-restart ;;
    hr) "$MAP2_SCRIPT" hard-restart ;;
    
    # Dev mode shortcuts
    dev) "$MAP2_SCRIPT" dev on ;;
    stage) "$MAP2_SCRIPT" dev off ;;
    toggle) "$MAP2_SCRIPT" dev toggle ;;
    
    # Status shortcuts
    status|st) "$MAP2_SCRIPT" status ;;
    logs) "$MAP2_SCRIPT" logs ;;
    
    # UI shortcuts
    ui|tui) "$MAP2_SCRIPT" tui ;;
    
    # Logo shortcuts
    logo) "$MAP2_SCRIPT" logo "${2:-status}" ;;
    splash-show) "$MAP2_SCRIPT" logo splash show ;;
    splash-hide) "$MAP2_SCRIPT" logo splash hide ;;
    
    # Pass through everything else
    *) "$MAP2_SCRIPT" "$@" ;;
esac
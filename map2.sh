#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/branding/map2-welcome.sh"

COMMAND="${1:-app}"
if [[ $# -gt 0 ]]; then
    shift
fi

case "$COMMAND" in
    app|tui|console|"")
        map2_run_console "$@"
        ;;
    info|status|dashboard)
        map2_run_console --route dashboard "$@"
        ;;
    touchscreen|quad|quad-touchscreen)
        map2_run_touchscreen "$@"
        ;;
    cluster)
        map2_run_console --route cluster "$@"
        ;;
    diagnostics|diag)
        map2_run_console --route diagnostics "$@"
        ;;
    workflow|install|setup)
        map2_run_console --route workflow "$@"
        ;;
    onboarding)
        map2_run_console --route onboarding "$@"
        ;;
    version|--version)
        printf '%s %s\n' "$(map2_product_name)" "$(map2_version)"
        ;;
    help|-h|--help|actions)
        map2_shell_actions
        ;;
    shell-welcome)
        map2_shell_welcome
        ;;
    *)
        map2_shell_actions
        printf '\nUnknown command: %s\n' "$COMMAND" >&2
        exit 1
        ;;
esac

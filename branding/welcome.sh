#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/map2-welcome.sh"

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    map2_shell_welcome
fi

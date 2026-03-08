#!/bin/bash
#
# MAP2 MPX1 S/PDIF + AVB Unified Setup Wrapper
#
# Easy operator flow:
#  1) Optional AVB provisioning (PTP, TSN, SRP)
#  2) Apply one canonical bitrate/clock mapping profile everywhere
#
# Canonical profile tool:
#   scripts/apply_clock_sync_profile.py

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROFILE="dual_locked_48k"
AVB_INTERFACE=""
SKIP_AVB=false
AUTO_YES=false
DRY_RUN=false
NO_SYSTEMD=false
NO_RESTART=false
TARGET_HOME=""

usage() {
    cat <<EOF
MAP2 MPX1 S/PDIF + AVB Setup Wrapper

Usage:
  sudo bash scripts/setup_mpx1_spdif_avb.sh [options]

Options:
  --profile NAME        Clock-sync profile ID (default: ${PROFILE})
  --interface IFACE     AVB interface (e.g., enp11s0)
  --skip-avb            Skip scripts/setup_avb.sh and only apply profile mapping
  --no-systemd          Do not write systemd clock drop-in
  --no-restart          Do not restart map2-backend after apply
  --target-home PATH    Target home for ~/.map2 and PipeWire config files
  --yes, -y             Non-interactive mode for AVB setup
  --dry-run             Show actions without changing files
  --list-profiles       Print available profiles and exit
  --help, -h            Show this help

Examples:
  sudo bash scripts/setup_mpx1_spdif_avb.sh --interface enp11s0 --profile dual_locked_48k --yes
  sudo bash scripts/setup_mpx1_spdif_avb.sh --skip-avb --profile avb_master_48k
  python3 scripts/apply_clock_sync_profile.py --list-profiles
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --profile)
            PROFILE="${2:-}"
            shift 2
            ;;
        --interface|-i)
            AVB_INTERFACE="${2:-}"
            shift 2
            ;;
        --skip-avb)
            SKIP_AVB=true
            shift
            ;;
        --no-systemd)
            NO_SYSTEMD=true
            shift
            ;;
        --no-restart)
            NO_RESTART=true
            shift
            ;;
        --target-home)
            TARGET_HOME="${2:-}"
            shift 2
            ;;
        --yes|-y)
            AUTO_YES=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --list-profiles)
            python3 "${SCRIPT_DIR}/apply_clock_sync_profile.py" --list-profiles
            exit 0
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
done

if [[ "$SKIP_AVB" == false ]]; then
    if [[ "$EUID" -eq 0 ]]; then
        AVB_CMD=(bash "${SCRIPT_DIR}/setup_avb.sh")
    else
        AVB_CMD=(sudo bash "${SCRIPT_DIR}/setup_avb.sh")
    fi
    if [[ "$AUTO_YES" == true ]]; then
        AVB_CMD+=(--yes)
    fi
    if [[ -n "$AVB_INTERFACE" ]]; then
        AVB_CMD+=(--interface "$AVB_INTERFACE")
    fi
    if [[ "$DRY_RUN" == true ]]; then
        AVB_CMD+=(--dry-run)
    fi

    echo "[INFO] Running AVB setup: ${AVB_CMD[*]}"
    "${AVB_CMD[@]}"
else
    echo "[INFO] Skipping AVB provisioning (--skip-avb)."
fi

PROFILE_NEEDS_ROOT=false
if [[ "$DRY_RUN" == false && "$NO_SYSTEMD" == false ]]; then
    PROFILE_NEEDS_ROOT=true
fi
if [[ "$DRY_RUN" == false && "$NO_RESTART" == false ]]; then
    PROFILE_NEEDS_ROOT=true
fi

if [[ "$EUID" -ne 0 && "$PROFILE_NEEDS_ROOT" == true ]]; then
    PROFILE_CMD=(sudo python3 "${SCRIPT_DIR}/apply_clock_sync_profile.py" --profile "$PROFILE")
else
    PROFILE_CMD=(python3 "${SCRIPT_DIR}/apply_clock_sync_profile.py" --profile "$PROFILE")
fi
if [[ -n "$AVB_INTERFACE" ]]; then
    PROFILE_CMD+=(--avb-interface "$AVB_INTERFACE")
fi
if [[ "$NO_SYSTEMD" == true ]]; then
    PROFILE_CMD+=(--no-systemd)
fi
if [[ -n "$TARGET_HOME" ]]; then
    PROFILE_CMD+=(--target-home "$TARGET_HOME")
fi
if [[ "$DRY_RUN" == true ]]; then
    PROFILE_CMD+=(--dry-run)
elif [[ "$NO_RESTART" == false ]]; then
    PROFILE_CMD+=(--restart-backend)
fi

echo "[INFO] Applying clock-sync profile: ${PROFILE_CMD[*]}"
"${PROFILE_CMD[@]}"

echo "[SUCCESS] MPX1 S/PDIF + AVB setup flow complete."

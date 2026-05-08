#!/usr/bin/env bash
# T2459-H6 retirement soak — one-command wrapper.
#
# Runs the H6 acceptance gate: 30-min soak with the controller-host driving
# synthetic MIDI through the shm event ring on an OFF-build engine (legacy
# Map2MidiController not linked). Pass criteria pinned to the H6 worklist task:
#
#   --threshold-max-xruns 0
#   --threshold-max-peak-jitter-ms 0.35
#
# When overall_pass=True, follow the deletion runbook:
#   docs/midi/MAP2MIDICONTROLLER_RETIREMENT.md §4
#
# Usage:
#   scripts/run_t2459h6_retirement_soak.sh                # full 30-min gate run
#   scripts/run_t2459h6_retirement_soak.sh --quick        # 5-min smoke (NOT a gate run)
#   scripts/run_t2459h6_retirement_soak.sh --duration 600 # custom duration in seconds
#
# Environment variables (override sparingly):
#   T2459H6_RATE_HZ          MIDI events per second (default: 30)
#   T2459H6_MIX              MIDI message mix: note|cc|clock|mixed (default: mixed)
#   T2459H6_CONTROLLER_KEY   controller_key for the synthetic input (default: soak-driver)
#   T2459H6_TAG              soak-tag stamped into artifact metadata (default: t2459h6-shm-ring)
#   MAP2_DRY_RUN=1           print the python invocation, don't run it

set -euo pipefail

DURATION_SECONDS=1800        # 30-min gate duration
RATE_HZ="${T2459H6_RATE_HZ:-30}"
MIX="${T2459H6_MIX:-mixed}"
CONTROLLER_KEY="${T2459H6_CONTROLLER_KEY:-soak-driver}"
TAG="${T2459H6_TAG:-t2459h6-shm-ring}"
MODULE_DIR="${T2459H6_MODULE_DIR:-juce-engine/build-h6-off}"

# JUCE defaults to ALSA without this; ALSA goes through PipeWire's mixing
# layer and adds ~5ms of scheduling jitter that blows past the 0.35ms gate.
# Force JUCE to open JACK (which talks directly to the UA-1000 hardware).
export MAP2_AUDIO_PREFER_JACK="${MAP2_AUDIO_PREFER_JACK:-1}"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --quick)
            DURATION_SECONDS=300
            shift
            ;;
        --duration)
            DURATION_SECONDS="$2"
            shift 2
            ;;
        --duration=*)
            DURATION_SECONDS="${1#*=}"
            shift
            ;;
        -h|--help)
            sed -n '2,28p' "$0"
            exit 0
            ;;
        *)
            echo "unknown argument: $1" >&2
            exit 2
            ;;
    esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOAK_SCRIPT="${REPO_ROOT}/.codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py"

if [[ ! -f "${SOAK_SCRIPT}" ]]; then
    echo "soak script not found: ${SOAK_SCRIPT}" >&2
    exit 1
fi

# Pre-flight gates — surface the most common foot-guns up front.
echo "==> T2459-H6 retirement soak"
echo "    duration:       ${DURATION_SECONDS}s"
echo "    rate:           ${RATE_HZ} events/sec"
echo "    mix:            ${MIX}"
echo "    controller_key: ${CONTROLLER_KEY}"
echo "    soak-tag:       ${TAG}"
echo "    module-dir:     ${MODULE_DIR}"
echo "    audio backend:  JACK (MAP2_AUDIO_PREFER_JACK=${MAP2_AUDIO_PREFER_JACK})"
echo

if [[ "${DURATION_SECONDS}" != "1800" ]]; then
    echo "==> NOTE: duration ${DURATION_SECONDS}s != 1800s — this is NOT a full H6 gate run."
    echo "    Smoke runs are useful for confidence checks but do not satisfy the deletion criteria."
    echo "    See docs/midi/MAP2MIDICONTROLLER_RETIREMENT.md §5."
    echo
fi

if ! command -v systemctl >/dev/null 2>&1; then
    echo "==> WARN: systemctl not on PATH; skipping controller-host preflight."
else
    if ! systemctl is-active --quiet map2-controller-host 2>/dev/null; then
        echo "==> WARN: map2-controller-host is not active."
        echo "    Start it with: sudo systemctl start map2-controller-host"
        echo "    The soak's --midi-driver=host needs the daemon to receive synthetic events."
    fi
fi

ENGINE_SO=$(ls "${REPO_ROOT}/${MODULE_DIR}/"*map2_audio_engine* 2>/dev/null | head -1 || true)
if [[ -z "${ENGINE_SO}" ]]; then
    echo "==> ERROR: no map2_audio_engine artifact found under ${MODULE_DIR}/"
    echo "    Build the OFF configuration first:"
    echo "      cmake -B ${MODULE_DIR} -DMAP2_USE_LEGACY_MIDI_CONTROLLER=OFF"
    echo "      cmake --build ${MODULE_DIR} --target map2_audio_engine"
    exit 1
fi
echo "==> engine artifact:  ${ENGINE_SO}"

CMD=(
    python3 "${SOAK_SCRIPT}"
    --module-dir "${REPO_ROOT}/${MODULE_DIR}"
    --duration-seconds "${DURATION_SECONDS}"
    --flow-rotation-seconds 20
    --sample-interval-seconds 1.0
    --reset-stats-after-warmup
    --threshold-max-xruns 0
    --threshold-max-peak-jitter-ms 0.35
    --midi-driver host
    --midi-controller-key "${CONTROLLER_KEY}"
    --midi-rate-events-per-sec "${RATE_HZ}"
    --midi-message-mix "${MIX}"
    --soak-tag "${TAG}"
)

if [[ "${MAP2_DRY_RUN:-0}" == "1" ]]; then
    echo "==> dry run — would invoke:"
    printf '    %q ' "${CMD[@]}"
    echo
    exit 0
fi

echo "==> invoking soak..."
exec "${CMD[@]}"

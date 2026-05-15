#!/usr/bin/env bash
# T2529-V2 — bench-side RT-audio evidence capture for the T2529
# service-user migration acceptance.
#
# Usage:   scripts/t2529_capture_rt_audio_evidence.sh
# Exit:    0 if every capture succeeded; nonzero on the first failure.
#
# Requirements (the bench operator must have):
#   - The MAP2 RPM installed (`dnf install map2`) on the production host
#   - The Edirol UA-1000 audio interface attached
#   - The kernel-rt patched host with `isolcpus=4,5 nohz_full=4,5` GRUB cmdline
#   - map2-backend.service running for at least 5 minutes (so the audio
#     callback thread has stabilized at SCHED_FIFO/80)
#
# What it captures (lands under
# docs/fit-for-purpose-evidence/20260515/t2529-service-user/rt-audio-gates/):
#
#   - pw-metadata.txt              PipeWire rate + quantum lock
#   - jack-direct-verify.txt       JUCE → JACK direct path verified
#   - ps-rt-threads.txt            All SCHED_FIFO threads enumerated
#   - getpcaps-per-unit.txt        Live capability set per service PID
#   - seccomp-deny.txt             Recent seccomp denials (empty = clean)
#   - soak-30min-output.txt        30-min juce-random-effects-soak summary
#
# Acceptance:
#   - JUCE audio callback thread: SCHED_FIFO/80
#   - libremidi I/O thread:       SCHED_FIFO/70
#   - data-loop.0 (PipeWire):     SCHED_FIFO/55
#   - peak block jitter:          < 0.35 ms
#   - xrun count:                 0
#   - getpcaps matches the unit's AmbientCapabilities= declaration
#
# Note: the script does NOT need to run as root; getpcaps uses sudo for
# /proc/<pid>/status access, and the soak runs as the operator who owns
# the MAP2 service (typically the bench operator).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVIDENCE_DIR="${REPO_ROOT}/docs/fit-for-purpose-evidence/20260515/t2529-service-user/rt-audio-gates"

mkdir -p "${EVIDENCE_DIR}"

echo "==> T2529-V2 RT-audio evidence capture"
echo "==> Evidence dir: ${EVIDENCE_DIR}"
echo

# ─── Pre-flight ───────────────────────────────────────────────────────────

for tool in pw-metadata getpcaps ps systemctl journalctl ausearch; do
    if ! command -v "${tool}" >/dev/null 2>&1; then
        echo "WARNING: ${tool} not installed; some captures will be skipped"
    fi
done

# Verify map2-backend.service is running.
if ! systemctl is-active --quiet map2-backend.service; then
    echo "ERROR: map2-backend.service is not running."
    echo "       Start it (`sudo systemctl start map2-backend`) and wait"
    echo "       at least 5 minutes for the audio thread to stabilize."
    exit 1
fi

# ─── 1. PipeWire substrate ────────────────────────────────────────────────

echo "==> [1/6] Capturing PipeWire rate + quantum..."
pw-metadata 0 \
    | grep -E '(clock.force-rate|clock.force-quantum|clock.rate|clock.quantum)' \
    > "${EVIDENCE_DIR}/pw-metadata.txt" || true
echo "    → ${EVIDENCE_DIR}/pw-metadata.txt"

# ─── 2. JACK direct verification ──────────────────────────────────────────

echo "==> [2/6] Verifying JUCE → JACK direct path..."
{
    echo "# Captured: $(date -Is)"
    echo
    echo "## Recent backend journal (looking for JACK / MAP2_AUDIO_PREFER_JACK)"
    journalctl -u map2-backend --since "1 hour ago" --no-pager \
        | grep -iE '(jack|map2_audio_prefer_jack|audiodevicemanager|alsa)' \
        || echo "(no matching journal entries — backend may not be logging at that level)"
} > "${EVIDENCE_DIR}/jack-direct-verify.txt"
echo "    → ${EVIDENCE_DIR}/jack-direct-verify.txt"

# ─── 3. SCHED_FIFO thread enumeration ─────────────────────────────────────

echo "==> [3/6] Enumerating SCHED_FIFO threads..."
{
    echo "# Captured: $(date -Is)"
    echo
    echo "## All SCHED_FIFO threads (sorted by RT priority desc)"
    echo "## Expected: JUCE audio at 80, libremidi at 70, data-loop at 55"
    echo
    # cls=FF means SCHED_FIFO
    ps -eLo pid,tid,comm,cls,rtprio,nice 2>/dev/null \
        | awk '$4 == "FF" { print $0 }' \
        | sort -k5,5 -rn
} > "${EVIDENCE_DIR}/ps-rt-threads.txt"
echo "    → ${EVIDENCE_DIR}/ps-rt-threads.txt"

# ─── 4. Live capability set per service unit ──────────────────────────────

echo "==> [4/6] Capturing per-unit getpcaps..."
{
    echo "# Captured: $(date -Is)"
    echo
    echo "## Live capability set for each MAP2 service PID"
    echo "## Expected: matches AmbientCapabilities= in each unit"
    echo
    for unit in \
        map2-backend.service \
        map2-controller-host.service \
        map2-sonobus-transport.service \
        map2-cluster.service \
        map2-frontend.service \
        map2-tui.service \
        map2-prometheus.service \
        map2-grafana.service \
        ; do
        echo "=========================================="
        echo "${unit}"
        echo "=========================================="
        pid=$(systemctl show "${unit}" -p MainPID 2>/dev/null | cut -d= -f2)
        if [[ -z "$pid" || "$pid" -eq 0 ]]; then
            echo "  NOT RUNNING (skipped)"
        else
            echo "  PID: ${pid}"
            sudo getpcaps "${pid}" 2>&1 || echo "  getpcaps failed (need sudo?)"
        fi
        echo
    done
} > "${EVIDENCE_DIR}/getpcaps-per-unit.txt"
echo "    → ${EVIDENCE_DIR}/getpcaps-per-unit.txt"

# ─── 5. Seccomp denials (should be empty after T2529-B3) ──────────────────

echo "==> [5/6] Checking for seccomp denials..."
{
    echo "# Captured: $(date -Is)"
    echo
    echo "## Recent seccomp denials in the audit log (last 1 hour)"
    echo "## Expected: NONE (after T2529-B3 baseline; any entries here"
    echo "##           mean a syscall MAP2 needs is being blocked → file followup)"
    echo
    sudo ausearch -ts recent -m seccomp 2>&1 \
        | head -100 \
        || echo "(no seccomp denials found in audit log)"
} > "${EVIDENCE_DIR}/seccomp-deny.txt"
echo "    → ${EVIDENCE_DIR}/seccomp-deny.txt"

# ─── 6. 30-minute soak (last) ─────────────────────────────────────────────

SOAK_SCRIPT="${REPO_ROOT}/.codex/skills/juce-random-effects-soak/scripts/run_juce_random_fx_soak.py"

if [[ -f "${SOAK_SCRIPT}" ]]; then
    echo "==> [6/6] Running 30-min RT soak (peak jitter threshold 0.35 ms)..."
    echo "         This will take ~30 minutes. Press Ctrl-C to abort."
    python3 "${SOAK_SCRIPT}" \
        --duration-seconds 1800 \
        --flow-rotation-seconds 20 \
        --sample-interval-seconds 1.0 \
        --reset-stats-after-warmup \
        --threshold-max-xruns 0 \
        --threshold-max-peak-jitter-ms 0.35 \
        --evidence-dir "${EVIDENCE_DIR}" \
        2>&1 | tee "${EVIDENCE_DIR}/soak-30min-output.txt"
    echo "    → ${EVIDENCE_DIR}/soak-30min-output.txt"
else
    echo "==> [6/6] Soak script not found at ${SOAK_SCRIPT}; skipping."
fi

# ─── Summary ──────────────────────────────────────────────────────────────

echo
echo "✓ T2529-V2 evidence capture complete"
echo "  Evidence dir: ${EVIDENCE_DIR}"
echo "  Files captured:"
ls -la "${EVIDENCE_DIR}/" | grep -v '^total'

echo
echo "==> Next steps:"
echo "    1. Review each file in ${EVIDENCE_DIR}/"
echo "    2. Update MANIFEST.md: flip the 🚧 Bench-gated rows to ✅ Filed"
echo "    3. Commit the captured artefacts + push to both remotes"
echo "    4. Close out T2529 per docs/PROJECT_WORKLIST.md"

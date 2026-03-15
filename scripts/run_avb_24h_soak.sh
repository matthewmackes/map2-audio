#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  run_avb_24h_soak.sh [options]

Options:
  --duration-hours N            Soak duration in hours (default: 24)
  --checkpoint-minutes N        Snapshot interval in minutes (default: 60)
  --stream-count N              Number of streams for optional provisioning (default: 8)
  --interface IFACE             AVB interface for optional provisioning (default: MAP2_AVB_INTERFACE or eth0)
  --output-dir PATH             Artifact directory (default: /tmp/map2-avb-soak-<timestamp>)
  --provision-demo-streams      Create/start demo talker streams for soak window
  --help                        Show this help

Notes:
  - By default this script does not create/delete streams; it only snapshots running state.
  - API base can be overridden via MAP2_API_BASE (default: http://localhost:8080/api/avb).
EOF
}

DURATION_HOURS=24
CHECKPOINT_MINUTES=60
STREAM_COUNT=8
INTERFACE="${MAP2_AVB_INTERFACE:-eth0}"
OUTPUT_DIR="/tmp/map2-avb-soak-$(date +%Y%m%d-%H%M%S)"
PROVISION_DEMO_STREAMS=0
API_BASE="${MAP2_API_BASE:-http://localhost:8080/api/avb}"
SOAK_SECONDS_OVERRIDE="${MAP2_AVB_SOAK_DURATION_SECONDS_OVERRIDE:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --duration-hours)
      DURATION_HOURS="$2"
      shift 2
      ;;
    --checkpoint-minutes)
      CHECKPOINT_MINUTES="$2"
      shift 2
      ;;
    --stream-count)
      STREAM_COUNT="$2"
      shift 2
      ;;
    --interface)
      INTERFACE="$2"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --provision-demo-streams)
      PROVISION_DEMO_STREAMS=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

for value_name in DURATION_HOURS CHECKPOINT_MINUTES STREAM_COUNT; do
  value="${!value_name}"
  if ! [[ "$value" =~ ^[0-9]+$ ]] || [[ "$value" -le 0 ]]; then
    echo "ERROR: $value_name must be a positive integer (got '$value')." >&2
    exit 1
  fi
done

if [[ -n "$SOAK_SECONDS_OVERRIDE" ]]; then
  if ! [[ "$SOAK_SECONDS_OVERRIDE" =~ ^[0-9]+$ ]] || [[ "$SOAK_SECONDS_OVERRIDE" -le 0 ]]; then
    echo "ERROR: MAP2_AVB_SOAK_DURATION_SECONDS_OVERRIDE must be a positive integer (got '$SOAK_SECONDS_OVERRIDE')." >&2
    exit 1
  fi
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 is required." >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
SUMMARY_FILE="$OUTPUT_DIR/summary.txt"
EVENT_LOG="$OUTPUT_DIR/events.log"
PROVISION_LOG="$OUTPUT_DIR/provision.log"
TEARDOWN_LOG="$OUTPUT_DIR/teardown.log"

log_event() {
  local message="$1"
  local timestamp
  timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '%s %s\n' "$timestamp" "$message" | tee -a "$EVENT_LOG" >/dev/null
}

collect_snapshot() {
  local label="$1"
  local timestamp
  timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"

  curl -sf "$API_BASE/streams" > "$OUTPUT_DIR/streams.${label}.${timestamp}.json" || true
  curl -sf "$API_BASE/router/connections" > "$OUTPUT_DIR/connections.${label}.${timestamp}.json" || true
  curl -sf "$API_BASE/ptp" > "$OUTPUT_DIR/ptp.${label}.${timestamp}.json" || true
}

start_demo_streams() {
  local idx
  for ((idx=0; idx<STREAM_COUNT; idx+=1)); do
    local stream_id="soak-stream-${idx}"
    curl -sS -X POST "$API_BASE/streams" \
      -H "Content-Type: application/json" \
      -d "{
        \"stream_id\": \"${stream_id}\",
        \"direction\": \"talker\",
        \"interface\": \"${INTERFACE}\",
        \"channels\": 2,
        \"sample_rate\": 48000
      }" >> "$PROVISION_LOG" || true
    printf '\n' >> "$PROVISION_LOG"

    curl -sS -X POST "$API_BASE/streams/${stream_id}/start" >> "$PROVISION_LOG" || true
    printf '\n' >> "$PROVISION_LOG"
  done
}

stop_demo_streams() {
  local idx
  for ((idx=0; idx<STREAM_COUNT; idx+=1)); do
    local stream_id="soak-stream-${idx}"
    curl -sS -X POST "$API_BASE/streams/${stream_id}/stop" >> "$TEARDOWN_LOG" || true
    printf '\n' >> "$TEARDOWN_LOG"
    curl -sS -X DELETE "$API_BASE/streams/${stream_id}" >> "$TEARDOWN_LOG" || true
    printf '\n' >> "$TEARDOWN_LOG"
  done
}

if ! curl -sf "$API_BASE/streams" >/dev/null 2>&1; then
  echo "ERROR: AVB API not reachable at $API_BASE/streams" >&2
  exit 1
fi

SOAK_SECONDS=$((DURATION_HOURS * 3600))
if [[ -n "$SOAK_SECONDS_OVERRIDE" ]]; then
  SOAK_SECONDS="$SOAK_SECONDS_OVERRIDE"
fi
CHECKPOINT_SECONDS=$((CHECKPOINT_MINUTES * 60))
START_EPOCH="$(date +%s)"
END_EPOCH=$((START_EPOCH + SOAK_SECONDS))
NEXT_CHECKPOINT="$START_EPOCH"

log_event "soak_start duration_hours=${DURATION_HOURS} checkpoint_minutes=${CHECKPOINT_MINUTES} stream_count=${STREAM_COUNT} provision_demo_streams=${PROVISION_DEMO_STREAMS}"
collect_snapshot "baseline"

if [[ "$PROVISION_DEMO_STREAMS" -eq 1 ]]; then
  log_event "provision_demo_streams_start interface=${INTERFACE}"
  start_demo_streams
  log_event "provision_demo_streams_complete"
fi

while [[ "$(date +%s)" -lt "$END_EPOCH" ]]; do
  now="$(date +%s)"
  if [[ "$now" -ge "$NEXT_CHECKPOINT" ]]; then
    label="checkpoint"
    elapsed="$((now - START_EPOCH))"
    log_event "checkpoint elapsed_seconds=${elapsed}"
    collect_snapshot "$label"
    NEXT_CHECKPOINT=$((NEXT_CHECKPOINT + CHECKPOINT_SECONDS))
  fi
  remaining_seconds=$((END_EPOCH - now))
  if [[ "$remaining_seconds" -gt 0 ]]; then
    sleep_seconds=5
    if [[ "$remaining_seconds" -lt "$sleep_seconds" ]]; then
      sleep_seconds="$remaining_seconds"
    fi
    sleep "$sleep_seconds"
  fi
done

if [[ "$PROVISION_DEMO_STREAMS" -eq 1 ]]; then
  log_event "teardown_demo_streams_start"
  stop_demo_streams
  log_event "teardown_demo_streams_complete"
fi

collect_snapshot "final"
log_event "soak_complete"

LATEST_STREAM_SNAPSHOT="$(ls -1 "$OUTPUT_DIR"/streams.final.*.json 2>/dev/null | tail -n 1 || true)"
ERROR_STREAM_COUNT="unknown"
ACTIVE_STREAM_COUNT="unknown"
SOAK_REQUIREMENTS_MET="false"
FAILURE_REASON=""
MAX_ACTIVE_STREAMS_OBSERVED="0"
MAX_ERROR_STREAMS_OBSERVED="0"
PTP_SNAPSHOTS_TOTAL="0"
PTP_LOCKED_SNAPSHOTS="0"
EXPECTED_ACTIVE_STREAM_MIN="1"
if [[ "$PROVISION_DEMO_STREAMS" -eq 1 ]]; then
  EXPECTED_ACTIVE_STREAM_MIN="$STREAM_COUNT"
fi

analysis_output="$(
python3 - "$OUTPUT_DIR" "$EXPECTED_ACTIVE_STREAM_MIN" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path

out_dir = Path(sys.argv[1])
expected_active_min = int(sys.argv[2])

stream_files = sorted(out_dir.glob("streams.*.json"))
ptp_files = sorted(out_dir.glob("ptp.*.json"))

max_active = 0
max_error = 0
for path in stream_files:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        continue
    streams = payload.get("streams", [])
    if not isinstance(streams, list):
        continue
    active = sum(1 for stream in streams if isinstance(stream, dict) and str(stream.get("state", "")).lower() == "running")
    errors = sum(1 for stream in streams if isinstance(stream, dict) and str(stream.get("state", "")).lower() == "error")
    max_active = max(max_active, active)
    max_error = max(max_error, errors)

lock_states = {"MASTER", "SLAVE", "PASSIVE", "UNCALIBRATED", "LOCKED", "SYNCED"}
ptp_total = 0
ptp_locked = 0
for path in ptp_files:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        continue
    if not isinstance(payload, dict):
        continue
    ptp_total += 1
    if bool(payload.get("available")) and str(payload.get("state", "")).upper() in lock_states:
        ptp_locked += 1

failure_reason = ""
requirements_met = True
if max_active < expected_active_min:
    failure_reason = "no_active_running_streams_observed"
    requirements_met = False
elif ptp_locked == 0:
    failure_reason = "no_locked_ptp_snapshots_observed"
    requirements_met = False

print(f"max_active={max_active}")
print(f"max_error={max_error}")
print(f"ptp_total={ptp_total}")
print(f"ptp_locked={ptp_locked}")
print(f"requirements_met={'true' if requirements_met else 'false'}")
print(f"failure_reason={failure_reason}")
PY
)"

while IFS='=' read -r key value; do
  case "$key" in
    max_active) MAX_ACTIVE_STREAMS_OBSERVED="$value" ;;
    max_error) MAX_ERROR_STREAMS_OBSERVED="$value" ;;
    ptp_total) PTP_SNAPSHOTS_TOTAL="$value" ;;
    ptp_locked) PTP_LOCKED_SNAPSHOTS="$value" ;;
    requirements_met) SOAK_REQUIREMENTS_MET="$value" ;;
    failure_reason) FAILURE_REASON="$value" ;;
  esac
done <<< "$analysis_output"

ACTIVE_STREAM_COUNT="$MAX_ACTIVE_STREAMS_OBSERVED"
ERROR_STREAM_COUNT="$MAX_ERROR_STREAMS_OBSERVED"

cat > "$SUMMARY_FILE" <<EOF
api_base=$API_BASE
duration_hours=$DURATION_HOURS
checkpoint_minutes=$CHECKPOINT_MINUTES
provision_demo_streams=$PROVISION_DEMO_STREAMS
stream_count=$STREAM_COUNT
interface=$INTERFACE
output_dir=$OUTPUT_DIR
duration_seconds_effective=$SOAK_SECONDS
duration_seconds_override=$SOAK_SECONDS_OVERRIDE
expected_active_stream_min=$EXPECTED_ACTIVE_STREAM_MIN
soak_requirements_met=$SOAK_REQUIREMENTS_MET
failure_reason=$FAILURE_REASON
max_active_stream_count_observed=$MAX_ACTIVE_STREAMS_OBSERVED
max_error_stream_count_observed=$MAX_ERROR_STREAMS_OBSERVED
ptp_snapshots_total=$PTP_SNAPSHOTS_TOTAL
ptp_locked_snapshots=$PTP_LOCKED_SNAPSHOTS
active_stream_count_final=$ACTIVE_STREAM_COUNT
error_stream_count_final=$ERROR_STREAM_COUNT
event_log=$EVENT_LOG
provision_log=$PROVISION_LOG
teardown_log=$TEARDOWN_LOG
EOF

echo "Soak artifacts written to: $OUTPUT_DIR"
echo "Summary: $SUMMARY_FILE"

if [[ "$SOAK_REQUIREMENTS_MET" != "true" ]]; then
  case "$FAILURE_REASON" in
    no_active_running_streams_observed)
      echo "ERROR: no active running streams observed during soak; live AVB stream activity required" >&2
      ;;
    no_locked_ptp_snapshots_observed)
      echo "ERROR: no locked PTP snapshots observed during soak; stable PTP lock required" >&2
      ;;
  esac
  exit 1
fi

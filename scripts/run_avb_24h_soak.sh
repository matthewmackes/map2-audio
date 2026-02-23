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

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required." >&2
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
  sleep 5
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
if [[ -n "$LATEST_STREAM_SNAPSHOT" ]] && command -v jq >/dev/null 2>&1; then
  ERROR_STREAM_COUNT="$(jq '[.streams[]? | select(.state == "error")] | length' "$LATEST_STREAM_SNAPSHOT" 2>/dev/null || echo unknown)"
  ACTIVE_STREAM_COUNT="$(jq '[.streams[]? | select(.state == "running")] | length' "$LATEST_STREAM_SNAPSHOT" 2>/dev/null || echo unknown)"
fi

cat > "$SUMMARY_FILE" <<EOF
api_base=$API_BASE
duration_hours=$DURATION_HOURS
checkpoint_minutes=$CHECKPOINT_MINUTES
provision_demo_streams=$PROVISION_DEMO_STREAMS
stream_count=$STREAM_COUNT
interface=$INTERFACE
output_dir=$OUTPUT_DIR
active_stream_count_final=$ACTIVE_STREAM_COUNT
error_stream_count_final=$ERROR_STREAM_COUNT
event_log=$EVENT_LOG
provision_log=$PROVISION_LOG
teardown_log=$TEARDOWN_LOG
EOF

echo "Soak artifacts written to: $OUTPUT_DIR"
echo "Summary: $SUMMARY_FILE"

#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  run_avb_hil_qualification.sh [options]

Options:
  --interface IFACE          Capture interface (default: MAP2_AVB_INTERFACE or eth0)
  --capture-seconds N        Q05 capture duration (default: 600)
  --output-dir PATH          Artifact directory (default: /tmp/map2-avb-hil-<timestamp>)
  --run-q06-soak             Run Q06 soak collector in this session
  --soak-hours N             Q06 soak duration in hours (default: 24)
  --soak-checkpoint-minutes N  Q06 checkpoint interval (default: 60)
  --skip-q04                 Skip AVB integration pytest gate
  --help                     Show this help

Environment:
  MAP2_API_BASE              API base for soak script (default: http://localhost:8080/api/avb)
  MAP2_CURL_NOPROXY          curl --noproxy value for API preflight (default: *)

Behavior:
  Gates that cannot execute due missing AVB lab prerequisites are recorded as BLOCKED
  (with reasons in summary.txt) instead of FAIL.
EOF
}

INTERFACE="${MAP2_AVB_INTERFACE:-eth0}"
CAPTURE_SECONDS=600
OUTPUT_DIR="/tmp/map2-avb-hil-$(date +%Y%m%d-%H%M%S)"
RUN_Q06_SOAK=0
SOAK_HOURS=24
SOAK_CHECKPOINT_MINUTES=60
SKIP_Q04=0
API_BASE="${MAP2_API_BASE:-http://localhost:8080/api/avb}"
CURL_NOPROXY="${MAP2_CURL_NOPROXY:-*}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --interface)
      INTERFACE="$2"
      shift 2
      ;;
    --capture-seconds)
      CAPTURE_SECONDS="$2"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --run-q06-soak)
      RUN_Q06_SOAK=1
      shift
      ;;
    --soak-hours)
      SOAK_HOURS="$2"
      shift 2
      ;;
    --soak-checkpoint-minutes)
      SOAK_CHECKPOINT_MINUTES="$2"
      shift 2
      ;;
    --skip-q04)
      SKIP_Q04=1
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

for value_name in CAPTURE_SECONDS SOAK_HOURS SOAK_CHECKPOINT_MINUTES; do
  value="${!value_name}"
  if ! [[ "$value" =~ ^[0-9]+$ ]] || [[ "$value" -le 0 ]]; then
    echo "ERROR: $value_name must be a positive integer (got '$value')." >&2
    exit 1
  fi
done

if ! command -v pytest >/dev/null 2>&1; then
  echo "ERROR: pytest is required." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CAPTURE_SCRIPT="$SCRIPT_DIR/avb_capture_clock_drift.sh"
SOAK_SCRIPT="$SCRIPT_DIR/run_avb_24h_soak.sh"

mkdir -p "$OUTPUT_DIR"
SUMMARY_FILE="$OUTPUT_DIR/summary.txt"
Q04_LOG="$OUTPUT_DIR/q04_pytest.log"
Q05_LOG="$OUTPUT_DIR/q05_capture.log"
Q06_LOG="$OUTPUT_DIR/q06_soak.log"
MATRIX_SNIPPET="$OUTPUT_DIR/matrix_update.md"

Q04_STATUS="SKIPPED"
Q05_STATUS="SKIPPED"
Q06_STATUS="SKIPPED"
Q04_REASON=""
Q05_REASON=""
Q06_REASON=""
FAILED=0
BLOCKED=0

extract_json_bool() {
  local payload="$1"
  local key="$2"
  printf '%s' "$payload" | tr -d '\n' | sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\\(true\\|false\\).*/\\1/p" | head -n 1
}

classify_as_blocked_if_env_issue() {
  local log_file="$1"
  if [[ ! -f "$log_file" ]]; then
    return 1
  fi

  if grep -Eqi \
    "AVB API not reachable|AVB hardware not available|AVB not available|No such device|Network is unreachable|Connection refused|timed out|required but not found|not reachable|interface.*does not exist" \
    "$log_file"; then
    return 0
  fi

  return 1
}

mark_blocked() {
  local gate="$1"
  local reason="$2"

  case "$gate" in
    q04)
      Q04_STATUS="BLOCKED"
      Q04_REASON="$reason"
      ;;
    q05)
      Q05_STATUS="BLOCKED"
      Q05_REASON="$reason"
      ;;
    q06)
      Q06_STATUS="BLOCKED"
      Q06_REASON="$reason"
      ;;
    *)
      return 1
      ;;
  esac

  BLOCKED=1
}

echo "Q04 skipped by --skip-q04 option or blocked by preflight." > "$Q04_LOG"
echo "Q05 blocked/failed summary will be written by execution phase." > "$Q05_LOG"
echo "Q06 not executed (use --run-q06-soak to enable) or blocked by preflight." > "$Q06_LOG"

preflight_reason=""
if [[ ! -d "/sys/class/net/$INTERFACE" ]]; then
  preflight_reason="Interface '$INTERFACE' not present on host"
  if [[ "$SKIP_Q04" -eq 0 ]]; then
    mark_blocked q04 "$preflight_reason"
  fi
  mark_blocked q05 "$preflight_reason"
  if [[ "$RUN_Q06_SOAK" -eq 1 ]]; then
    mark_blocked q06 "$preflight_reason"
  fi
fi

if [[ -z "$preflight_reason" ]]; then
  if ! command -v curl >/dev/null 2>&1; then
    preflight_reason="curl not available for AVB status preflight"
    if [[ "$SKIP_Q04" -eq 0 ]]; then
      mark_blocked q04 "$preflight_reason"
    fi
    mark_blocked q05 "$preflight_reason"
    if [[ "$RUN_Q06_SOAK" -eq 1 ]]; then
      mark_blocked q06 "$preflight_reason"
    fi
  else
    avb_status_payload="$(curl -sS --fail --max-time 5 --noproxy "$CURL_NOPROXY" "$API_BASE/status" 2>/dev/null || true)"
    if [[ -z "$avb_status_payload" ]]; then
      preflight_reason="AVB status endpoint unreachable at $API_BASE/status"
      if [[ "$SKIP_Q04" -eq 0 ]]; then
        mark_blocked q04 "$preflight_reason"
      fi
      mark_blocked q05 "$preflight_reason"
      if [[ "$RUN_Q06_SOAK" -eq 1 ]]; then
        mark_blocked q06 "$preflight_reason"
      fi
    else
      avb_enabled="$(extract_json_bool "$avb_status_payload" "enabled")"
      avb_available="$(extract_json_bool "$avb_status_payload" "available")"
      if [[ -z "$avb_enabled" || -z "$avb_available" ]]; then
        preflight_reason="AVB status payload missing enabled/available fields at $API_BASE/status"
        if [[ "$SKIP_Q04" -eq 0 ]]; then
          mark_blocked q04 "$preflight_reason"
        fi
        mark_blocked q05 "$preflight_reason"
        if [[ "$RUN_Q06_SOAK" -eq 1 ]]; then
          mark_blocked q06 "$preflight_reason"
        fi
      elif [[ "$avb_enabled" == "false" || "$avb_available" == "false" ]]; then
        preflight_reason="AVB status reports enabled=${avb_enabled:-unknown} available=${avb_available:-unknown}"
        if [[ "$SKIP_Q04" -eq 0 ]]; then
          mark_blocked q04 "$preflight_reason"
        fi
        mark_blocked q05 "$preflight_reason"
        if [[ "$RUN_Q06_SOAK" -eq 1 ]]; then
          mark_blocked q06 "$preflight_reason"
        fi
      fi
    fi
  fi
fi

if [[ "$SKIP_Q04" -eq 0 && "$Q04_STATUS" != "BLOCKED" ]]; then
  if pytest -m avb tests/test_avb_integration.py -q > "$Q04_LOG" 2>&1; then
    Q04_STATUS="PASS"
  else
    if classify_as_blocked_if_env_issue "$Q04_LOG"; then
      mark_blocked q04 "Environment prevented Q04 execution; see $Q04_LOG"
    else
      Q04_STATUS="FAIL"
      FAILED=1
    fi
  fi
fi

if [[ "$Q05_STATUS" != "BLOCKED" && -x "$CAPTURE_SCRIPT" ]]; then
  if "$CAPTURE_SCRIPT" "$INTERFACE" "$CAPTURE_SECONDS" "$OUTPUT_DIR/q05_capture" > "$Q05_LOG" 2>&1; then
    Q05_STATUS="PASS"
  else
    if classify_as_blocked_if_env_issue "$Q05_LOG"; then
      mark_blocked q05 "Environment prevented Q05 execution; see $Q05_LOG"
    else
      Q05_STATUS="FAIL"
      FAILED=1
    fi
  fi
elif [[ "$Q05_STATUS" != "BLOCKED" ]]; then
  mark_blocked q05 "Capture script missing or not executable: $CAPTURE_SCRIPT"
  echo "Capture script missing or not executable: $CAPTURE_SCRIPT" > "$Q05_LOG"
fi

if [[ "$RUN_Q06_SOAK" -eq 1 && "$Q06_STATUS" != "BLOCKED" ]]; then
  if [[ -x "$SOAK_SCRIPT" ]]; then
    if "$SOAK_SCRIPT" \
      --duration-hours "$SOAK_HOURS" \
      --checkpoint-minutes "$SOAK_CHECKPOINT_MINUTES" \
      --output-dir "$OUTPUT_DIR/q06_soak" > "$Q06_LOG" 2>&1; then
      Q06_STATUS="PASS"
    else
      if classify_as_blocked_if_env_issue "$Q06_LOG"; then
        mark_blocked q06 "Environment prevented Q06 execution; see $Q06_LOG"
      else
        Q06_STATUS="FAIL"
        FAILED=1
      fi
    fi
  else
    mark_blocked q06 "Soak script missing or not executable: $SOAK_SCRIPT"
    echo "Soak script missing or not executable: $SOAK_SCRIPT" > "$Q06_LOG"
  fi
fi

cat > "$SUMMARY_FILE" <<EOF
q04_multi_node_discovery_route_churn=$Q04_STATUS
q05_ptp_lock_transport_timing=$Q05_STATUS
q06_24h_endurance_soak=$Q06_STATUS
q04_reason=$Q04_REASON
q05_reason=$Q05_REASON
q06_reason=$Q06_REASON
interface=$INTERFACE
capture_seconds=$CAPTURE_SECONDS
soak_hours=$SOAK_HOURS
soak_checkpoint_minutes=$SOAK_CHECKPOINT_MINUTES
output_dir=$OUTPUT_DIR
api_base=$API_BASE
q04_log=$Q04_LOG
q05_log=$Q05_LOG
q06_log=$Q06_LOG
EOF

run_timestamp_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
q04_outcome="See $Q04_LOG"
q05_outcome="See $Q05_LOG and $OUTPUT_DIR/q05_capture/summary.txt"
q06_outcome="See $Q06_LOG"
if [[ "$RUN_Q06_SOAK" -eq 1 ]]; then
  q06_outcome="See $Q06_LOG and $OUTPUT_DIR/q06_soak/summary.txt"
fi
if [[ "$Q04_STATUS" == "BLOCKED" ]]; then
  q04_outcome="Blocked: ${Q04_REASON:-lab precondition missing}; see $Q04_LOG"
fi
if [[ "$Q05_STATUS" == "BLOCKED" ]]; then
  q05_outcome="Blocked: ${Q05_REASON:-lab precondition missing}; see $Q05_LOG"
fi
if [[ "$Q06_STATUS" == "BLOCKED" ]]; then
  q06_outcome="Blocked: ${Q06_REASON:-lab precondition missing}; see $Q06_LOG"
elif [[ "$Q06_STATUS" == "SKIPPED" ]]; then
  q06_outcome="Skipped in this run; see $Q06_LOG"
fi

cat > "$MATRIX_SNIPPET" <<EOF
# AVB HIL Matrix Update ($run_timestamp_utc)

| ID | Latest Outcome | Status |
| --- | --- | --- |
| Q04 | $q04_outcome | $Q04_STATUS |
| Q05 | $q05_outcome | $Q05_STATUS |
| Q06 | $q06_outcome | $Q06_STATUS |
EOF

echo "HIL qualification artifacts: $OUTPUT_DIR"
echo "Summary: $SUMMARY_FILE"
echo "Matrix snippet: $MATRIX_SNIPPET"
if [[ "$BLOCKED" -ne 0 ]]; then
  echo "One or more gates are BLOCKED by environment constraints; see reasons in $SUMMARY_FILE"
fi

if [[ "$FAILED" -ne 0 ]]; then
  exit 1
fi

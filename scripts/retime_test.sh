#!/usr/bin/env bash
# ==============================================================================
# MAP2 Audio - Expression Retime Gate (T097-sub05)
# ==============================================================================
#
# Measures CC-recv -> parameter-apply latency using /api/v2/expression/retime-stats.
# Sends synthetic CC traffic with one of:
#   1) amidi loopback (if --amidi-port provided)
#   2) python-rtmidi (if available)
#   3) debug HTTP injector fallback (/api/v2/expression/debug/inject-cc)
#
# Gate: p95 <= 5.0ms
# ==============================================================================

set -euo pipefail

HOST_BASE="http://127.0.0.1:8080"
COUNT=100
CC=11
CHANNEL=1
AMIDI_PORT=""
JSON_OUTPUT=false
ASSIGNMENT_ID="__retime_probe__$$"

usage() {
  cat <<'EOF'
Usage: scripts/retime_test.sh [options]

Options:
  --host <url>          Backend base URL (default: http://127.0.0.1:8080)
  --count <n>           Number of CC events to send (default: 100)
  --cc <0-127>          CC number (default: 11)
  --channel <1-16>      MIDI channel (default: 1)
  --amidi-port <name>   ALSA port for amidi (optional)
  --json                Print JSON only
  -h, --help            Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST_BASE="$2"; shift 2 ;;
    --count) COUNT="$2"; shift 2 ;;
    --cc) CC="$2"; shift 2 ;;
    --channel) CHANNEL="$2"; shift 2 ;;
    --amidi-port) AMIDI_PORT="$2"; shift 2 ;;
    --json) JSON_OUTPUT=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

api_post() {
  local path="$1"
  local body="${2:-}"
  if [[ -n "$body" ]]; then
    curl -fsS -X POST "${HOST_BASE%/}${path}" -H "Content-Type: application/json" -d "$body"
  else
    curl -fsS -X POST "${HOST_BASE%/}${path}"
  fi
}

api_get() {
  local path="$1"
  curl -fsS "${HOST_BASE%/}${path}"
}

api_delete() {
  local path="$1"
  curl -fsS -X DELETE "${HOST_BASE%/}${path}"
}

ensure_probe_assignment() {
  api_post "/api/v2/expression/assignments" \
    "{\"id\":\"${ASSIGNMENT_ID}\",\"cc\":${CC},\"channel\":${CHANNEL},\"cc_min\":0,\"cc_max\":127,\"param_id\":\"engine.reverb_mix\",\"param_label\":\"Reverb Mix\",\"out_min\":0.0,\"out_max\":1.0,\"curve\":\"linear\",\"custom_curve\":[],\"active\":true,\"source\":\"retime_test\"}" >/dev/null
}

cleanup_probe_assignment() {
  api_delete "/api/v2/expression/assignments/${ASSIGNMENT_ID}" >/dev/null 2>&1 || true
}

send_via_debug_inject() {
  local i=0
  while (( i < COUNT )); do
    local v=$(( (i * 7) % 128 ))
    api_post "/api/v2/expression/debug/inject-cc" "{\"cc\":${CC},\"channel\":${CHANNEL},\"value\":${v}}" >/dev/null
    i=$(( i + 1 ))
  done
}

send_via_amidi() {
  local i=0
  while (( i < COUNT )); do
    local v=$(( (i * 7) % 128 ))
    # B0+channel-1, CC, value
    local status
    status=$(printf "%02X" $(( 0xB0 + CHANNEL - 1 )))
    local cc_hex
    cc_hex=$(printf "%02X" "${CC}")
    local v_hex
    v_hex=$(printf "%02X" "${v}")
    printf "%s %s %s\n" "$status" "$cc_hex" "$v_hex" | amidi -p "${AMIDI_PORT}" -S - >/dev/null 2>&1 || return 1
    i=$(( i + 1 ))
  done
}

send_via_rtmidi() {
  python3 - "$HOST_BASE" "$COUNT" "$CC" "$CHANNEL" <<'PY'
import sys
import time

host = sys.argv[1]
count = int(sys.argv[2])
cc = int(sys.argv[3])
channel = int(sys.argv[4])

try:
    import rtmidi  # type: ignore
except Exception:
    sys.exit(2)

out = rtmidi.MidiOut()
if out.get_port_count() < 1:
    sys.exit(3)

out.open_port(0)
status = 0xB0 + (channel - 1)
for i in range(count):
    value = (i * 7) % 128
    out.send_message([status, cc, value])
    time.sleep(0.001)
PY
}

main() {
  trap cleanup_probe_assignment EXIT
  api_post "/api/v2/expression/retime-reset" >/dev/null
  ensure_probe_assignment

  local sender="debug"
  if [[ -n "${AMIDI_PORT}" ]] && command -v amidi >/dev/null 2>&1; then
    sender="amidi"
    if ! send_via_amidi; then
      echo "amidi send failed, falling back to debug injector" >&2
      sender="debug"
      send_via_debug_inject
    fi
  elif send_via_rtmidi; then
    sender="rtmidi"
  else
    sender="debug"
    send_via_debug_inject
  fi

  # Let apply worker finish processing.
  sleep 0.2

  local stats_json
  stats_json="$(api_get "/api/v2/expression/retime-stats")"

  local verdict
  verdict="$(python3 - "$stats_json" "$sender" <<'PY'
import json
import sys

stats = json.loads(sys.argv[1])
sender = sys.argv[2]

p95 = float(stats.get("p95_ms", 0.0) or 0.0)
sample_count = int(stats.get("sample_count", 0) or 0)
status = "PASS" if (sample_count > 0 and p95 <= 5.0) else "FAIL"

payload = {
    "status": status,
    "sender": sender,
    "p95_ms": round(p95, 3),
    "mean_ms": float(stats.get("mean_ms", 0.0) or 0.0),
    "max_ms": float(stats.get("max_ms", 0.0) or 0.0),
    "sample_count": sample_count,
    "gate_ms": 5.0,
}
print(json.dumps(payload))
PY
)"

  if [[ "${JSON_OUTPUT}" == true ]]; then
    echo "${verdict}"
  else
    echo "Expression retime result: ${verdict}"
  fi

  local status
  status="$(python3 - "$verdict" <<'PY'
import json
import sys
print(json.loads(sys.argv[1]).get("status", "FAIL"))
PY
)"
  [[ "${status}" == "PASS" ]]
}

main

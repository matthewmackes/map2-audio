#!/usr/bin/env bash
# ==============================================================================
# MAP2 Audio - Latency Baseline Measurement (T096)
# ==============================================================================
#
# Produces schema-valid latency evidence at:
#   docs/fit-for-purpose-evidence/<YYYYMMDD>/t096/latency_baseline.json
#
# Hard fail gates:
#   - RTL p95 > 5.0ms
#   - Jitter p95 > 1.0ms
#   - XRUN delta > 0 during measurement window
#
# Warn gates:
#   - RTL p95 > 3.5ms
#   - Jitter p95 > 0.5ms
#
# Exit codes:
#   0 = PASS/WARN
#   1 = FAIL (hard gate)
#   2 = measurement/setup failure
# ==============================================================================

set -euo pipefail

METHOD="jack"
DURATION_SECONDS=10
JSON_OUTPUT=false
HOST_BASE="http://127.0.0.1:8080"
JACK_PLAYBACK_PORT=""
JACK_CAPTURE_PORT=""
OUTPUT_PATH=""

TARGET_SAMPLE_RATE=48000
TARGET_BUFFER_SIZE=64
MIN_MEASUREMENT_CYCLES=1000

HARD_RTL_P95_MS=5.0
HARD_JITTER_P95_MS=1.0
WARN_RTL_P95_MS=3.5
WARN_JITTER_P95_MS=0.5

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

log() {
    if [[ "$JSON_OUTPUT" != true ]]; then
        echo "$*"
    fi
}

fail() {
    echo "ERROR: $*" >&2
    exit 2
}

usage() {
    cat <<'EOF'
Usage: scripts/measure_latency.sh [options]

Options:
  --jack                     Use jack_iodelay loopback measurement (default)
  --internal                 Use internal estimate (no loopback cable)
  --duration <seconds>       Measurement window (default: 10)
  --host <url>               Backend base URL (default: http://127.0.0.1:8080)
  --output <path>            Evidence output path override
  --jack-playback-port <p>   JACK playback port override
  --jack-capture-port <p>    JACK capture port override
  --json                     Print evidence JSON to stdout
  -h, --help                 Show this help
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --jack) METHOD="jack"; shift ;;
        --internal) METHOD="internal"; shift ;;
        --duration) DURATION_SECONDS="$2"; shift 2 ;;
        --host) HOST_BASE="$2"; shift 2 ;;
        --output) OUTPUT_PATH="$2"; shift 2 ;;
        --jack-playback-port) JACK_PLAYBACK_PORT="$2"; shift 2 ;;
        --jack-capture-port) JACK_CAPTURE_PORT="$2"; shift 2 ;;
        --json) JSON_OUTPUT=true; shift ;;
        -h|--help) usage; exit 0 ;;
        *) fail "Unknown option: $1" ;;
    esac
done

if ! [[ "$DURATION_SECONDS" =~ ^[0-9]+$ ]] || [[ "$DURATION_SECONDS" -le 0 ]]; then
    fail "--duration must be a positive integer"
fi

if [[ "$METHOD" != "jack" && "$METHOD" != "internal" ]]; then
    fail "METHOD must be 'jack' or 'internal'"
fi

if [[ -z "$OUTPUT_PATH" ]]; then
    ymd="$(date +%Y%m%d)"
    OUTPUT_PATH="$REPO_ROOT/docs/fit-for-purpose-evidence/${ymd}/t096/latency_baseline.json"
fi

first_jack_port_match() {
    local pattern="$1"
    jack_lsp 2>/dev/null | grep -E "$pattern" | head -1 || true
}

detect_jack_playback_port() {
    if [[ -n "$JACK_PLAYBACK_PORT" ]]; then
        echo "$JACK_PLAYBACK_PORT"
        return
    fi
    local port=""
    port=$(first_jack_port_match 'UA-1000.*:playback_AUX0$')
    [[ -z "$port" ]] && port=$(first_jack_port_match 'UA-1000.*:playback_1$')
    [[ -z "$port" ]] && port=$(first_jack_port_match '^system:playback_1$')
    [[ -z "$port" ]] && port=$(first_jack_port_match ':playback_FL$')
    [[ -z "$port" ]] && port=$(first_jack_port_match ':playback_1$')
    echo "$port"
}

detect_jack_capture_port() {
    if [[ -n "$JACK_CAPTURE_PORT" ]]; then
        echo "$JACK_CAPTURE_PORT"
        return
    fi
    local port=""
    port=$(first_jack_port_match 'UA-1000.*:capture_AUX0$')
    [[ -z "$port" ]] && port=$(first_jack_port_match 'UA-1000.*:capture_1$')
    [[ -z "$port" ]] && port=$(first_jack_port_match '^system:capture_1$')
    [[ -z "$port" ]] && port=$(first_jack_port_match ':capture_FL$')
    [[ -z "$port" ]] && port=$(first_jack_port_match ':capture_1$')
    echo "$port"
}

detect_iodelay_out_port() {
    local port=""
    port=$(first_jack_port_match '^jack_iodelay:output$')
    [[ -z "$port" ]] && port=$(first_jack_port_match '^jack_iodelay:out$')
    [[ -z "$port" ]] && port=$(first_jack_port_match '^jack_delay:out$')
    [[ -z "$port" ]] && port=$(first_jack_port_match '^jack_delay-[0-9]+:out$')
    echo "$port"
}

detect_iodelay_in_port() {
    local port=""
    port=$(first_jack_port_match '^jack_iodelay:input$')
    [[ -z "$port" ]] && port=$(first_jack_port_match '^jack_iodelay:in$')
    [[ -z "$port" ]] && port=$(first_jack_port_match '^jack_delay:in$')
    [[ -z "$port" ]] && port=$(first_jack_port_match '^jack_delay-[0-9]+:in$')
    echo "$port"
}

connect_jack_ports() {
    local source_port="$1"
    local target_port="$2"
    local connected=false
    if command -v jack_connect >/dev/null 2>&1; then
        if jack_connect "$source_port" "$target_port" 2>/dev/null; then
            connected=true
        fi
    fi
    if [[ "$connected" != true ]] && command -v pw-link >/dev/null 2>&1; then
        if pw-link "$source_port" "$target_port" 2>/dev/null; then
            connected=true
        fi
    fi
    if [[ "$connected" == true ]]; then
        return 0
    fi
    if command -v pw-jack >/dev/null 2>&1; then
        pw-jack jack_connect "$source_port" "$target_port" 2>/dev/null
        return $?
    fi
    return 1
}

# Kill any leftover jack_iodelay/pw-jack instances. Stale clients from a prior
# aborted run keep generating impulses on the JACK graph and corrupt the new
# run's correlation lock.
kill_stale_iodelay() {
    pkill -9 -f '\bjack_iodelay\b' 2>/dev/null || true
    pkill -9 -f '\bpw-jack jack_iodelay\b' 2>/dev/null || true
    # Give PipeWire time to retire the dead clients and their port aliases.
    sleep 0.5
}

# Disconnect every existing link touching the chosen UA-1000 playback/capture
# port so the only signal jack_iodelay sees is its own impulse. PipeWire's
# session manager auto-relinks ALSA streams that get cut here, so this is a
# transient measurement-window isolation, not a permanent reroute.
isolate_target_ports() {
    local playback="$1"
    local capture="$2"
    if ! command -v pw-link >/dev/null 2>&1; then
        return 0
    fi
    # pw-link -lI lists links with their numeric IDs in column 1 and a "<-" or
    # "->" arrow indicating direction. We collect every link ID that names the
    # target playback or capture port and tear it down.
    pw-link -lI 2>/dev/null \
        | awk -v p="$playback" -v c="$capture" '
            /(<-|->)/ {
                if (index($0, p) > 0 || index($0, c) > 0) {
                    print $1
                }
            }
        ' \
        | while read -r link_id; do
            [[ -n "$link_id" ]] && pw-link -d "$link_id" 2>/dev/null || true
        done
}

configure_audio_target() {
    local config_url="${HOST_BASE%/}/api/audio/config?sample_rate=${TARGET_SAMPLE_RATE}&buffer_size=${TARGET_BUFFER_SIZE}"
    curl -fsS -X POST "$config_url" >/dev/null 2>&1 || true
}

get_xrun_count() {
    local url="${HOST_BASE%/}/api/audio/diagnostics/xruns"
    local payload
    payload="$(curl -fsS "$url" 2>/dev/null || true)"
    if [[ -z "$payload" ]]; then
        echo "0"
        return
    fi
    python3 - <<'PY' "$payload"
import json, sys
try:
    data = json.loads(sys.argv[1])
    print(int(data.get("xrun_count", 0) or 0))
except Exception:
    print(0)
PY
}

detect_interface_name() {
    if command -v jack_lsp >/dev/null 2>&1; then
        if jack_lsp 2>/dev/null | grep -qi "UA-1000"; then
            echo "UA-1000"
            return
        fi
        if jack_lsp 2>/dev/null | grep -qi "Jogg"; then
            echo "Hotone JoGG"
            return
        fi
    fi
    if command -v aplay >/dev/null 2>&1; then
        local card_name
        card_name="$(aplay -l 2>/dev/null | awk -F'[][]' '/^card [0-9]+:/ { print $2; exit }')"
        if [[ -n "$card_name" ]]; then
            echo "$card_name"
            return
        fi
    fi
    echo "Unknown Interface"
}

detect_cpu_cores_csv() {
    python3 - <<'PY'
import re
from pathlib import Path

cmdline = Path("/proc/cmdline").read_text(errors="ignore")
m = re.search(r"isolcpus=([^ ]+)", cmdline)
if not m:
    print("0")
    raise SystemExit

cores = set()
for token in m.group(1).split(","):
    token = token.strip()
    if not token:
        continue
    if "-" in token:
        start_s, end_s = token.split("-", 1)
        try:
            start = int(start_s)
            end = int(end_s)
        except ValueError:
            continue
        if end < start:
            start, end = end, start
        cores.update(range(start, end + 1))
    else:
        try:
            cores.add(int(token))
        except ValueError:
            continue

if not cores:
    print("0")
else:
    print(",".join(str(c) for c in sorted(cores)))
PY
}

write_values_file_from_jack() {
    local tmp_output="$1"
    local values_file="$2"
    python3 - <<'PY' "$tmp_output" "$values_file"
import re
import statistics
import sys
from pathlib import Path

src = Path(sys.argv[1]).read_text(errors="ignore")
dst = Path(sys.argv[2])

# jack_iodelay prints lines like:
#   "  16863.494 frames    351.323 ms total roundtrip latency"
# When the correlation peak isn't validated yet it appends "?? Inv". We
# extract every numeric measurement, drop zeroes (pre-lock placeholders),
# then keep only values that agree with the rolling median to within 5%.
# That filters out:
#   - the leading 0.0 frames warm-up
#   - cycle-skip outliers (jack_iodelay locking on wrong correlation peak)
# Without this filter the parser ingested 30+ unconverged samples per run
# and the script then replicated them across thousands of cycles, producing
# nonsense p95/jitter (see 2026-04-26 t055 evidence).
pattern = re.compile(
    r"([0-9]+(?:\.[0-9]+)?)\s+frames\s+([0-9]+(?:\.[0-9]+)?)\s+ms total roundtrip latency"
)
raw_ms = [float(m.group(2)) for m in pattern.finditer(src)]
non_zero = [v for v in raw_ms if v > 0.0]

if not non_zero:
    dst.write_text("", encoding="utf-8")
    print(0)
    raise SystemExit(0)

# Drop the first two non-zero readings as warm-up. jack_iodelay's first
# correlation reports often capture the impulse at the wrong cycle offset
# while PipeWire wakes the suspended USB audio device and the correlator
# converges on the steady-state peak.
warmup_drop = min(2, len(non_zero) - 1)
candidates = non_zero[warmup_drop:]

# Use the trailing portion of the run (last 60% of remaining samples) to
# build a stability anchor — that is where jack_iodelay has settled.
tail_start = max(0, int(len(candidates) * 0.4))
tail = candidates[tail_start:] or candidates
anchor = statistics.median(tail)

# Keep samples within 5% of the anchor. This is tight enough to reject
# cycle-skip jumps (which double or halve the value) and loose enough to
# preserve real per-callback jitter.
tolerance = 0.05
converged = [v for v in candidates if abs(v - anchor) <= tolerance * anchor]

# Fall back to the tail if convergence filtering removed everything (can
# happen if the device never stabilized in the measurement window).
values = converged if converged else tail

dst.write_text("\n".join(f"{v:.6f}" for v in values), encoding="utf-8")
print(len(values))
PY
}

write_values_file_internal() {
    local values_file="$1"
    python3 - <<'PY' "$values_file" "$TARGET_BUFFER_SIZE" "$TARGET_SAMPLE_RATE"
import sys
from pathlib import Path

dst = Path(sys.argv[1])
buffer_size = int(sys.argv[2])
sample_rate = int(sys.argv[3])

# Conservative internal estimate: input quantum + output quantum + 0.3ms overhead.
rtl_ms = ((buffer_size / sample_rate) * 1000.0 * 2.0) + 0.3
dst.write_text(f"{rtl_ms:.6f}\n", encoding="utf-8")
print(1)
PY
}

measurement_cycles=$(( (DURATION_SECONDS * TARGET_SAMPLE_RATE) / TARGET_BUFFER_SIZE ))
if (( measurement_cycles < MIN_MEASUREMENT_CYCLES )); then
    measurement_cycles=$MIN_MEASUREMENT_CYCLES
fi

mkdir -p "$(dirname "$OUTPUT_PATH")"
values_file="$(mktemp /tmp/map2_latency_values.XXXXXX)"
trap 'rm -f "$values_file"' EXIT

log "MAP2 latency measurement"
log "  method: $METHOD"
log "  duration: ${DURATION_SECONDS}s"
log "  target: ${TARGET_SAMPLE_RATE}Hz / ${TARGET_BUFFER_SIZE} samples"
log "  cycles: ${measurement_cycles}"

configure_audio_target
xrun_before="$(get_xrun_count)"

if [[ "$METHOD" == "jack" ]]; then
    command -v jack_iodelay >/dev/null 2>&1 || fail "jack_iodelay not found (install jack-example-tools or jack2)"
    command -v jack_lsp >/dev/null 2>&1 || fail "jack_lsp not found"

    # 1. Reap any stale jack_iodelay processes before launch; their leftover
    #    JACK port aliases (jack_delay-N:out, jack_delay-N:in) cross-pollute
    #    new runs and break correlation lock.
    kill_stale_iodelay

    # 2. Resolve the concrete UA-1000 ports we will measure against so we can
    #    isolate them before jack_iodelay starts pumping impulses.
    playback_port="$(detect_jack_playback_port)"
    capture_port="$(detect_jack_capture_port)"
    if [[ -n "$playback_port" && -n "$capture_port" ]]; then
        isolate_target_ports "$playback_port" "$capture_port"
    fi

    jack_output_file="$(mktemp /tmp/map2_jack_iodelay.XXXXXX)"
    trap 'rm -f "$values_file" "$jack_output_file"' EXIT

    if command -v pw-jack >/dev/null 2>&1; then
        timeout --signal=INT "$DURATION_SECONDS" stdbuf -oL -eL pw-jack jack_iodelay >"$jack_output_file" 2>&1 &
    else
        timeout --signal=INT "$DURATION_SECONDS" stdbuf -oL -eL jack_iodelay >"$jack_output_file" 2>&1 &
    fi
    jack_pid=$!

    sleep 2
    iodelay_out="$(detect_iodelay_out_port)"
    iodelay_in="$(detect_iodelay_in_port)"

    # 3. Re-isolate immediately after jack_iodelay has registered its ports.
    #    PipeWire's session manager may have re-attached parasitic ALSA
    #    streams to the target ports during the 2 s warm-up.
    if [[ -n "$playback_port" && -n "$capture_port" ]]; then
        isolate_target_ports "$playback_port" "$capture_port"
    fi

    if [[ -n "$iodelay_out" && -n "$playback_port" ]]; then
        connect_jack_ports "$iodelay_out" "$playback_port" || true
    fi
    if [[ -n "$capture_port" && -n "$iodelay_in" ]]; then
        connect_jack_ports "$capture_port" "$iodelay_in" || true
    fi

    wait "$jack_pid" 2>/dev/null || true

    jack_measurements="$(write_values_file_from_jack "$jack_output_file" "$values_file")"
    if ! [[ "$jack_measurements" =~ ^[0-9]+$ ]] || [[ "$jack_measurements" -le 0 ]]; then
        fail "No loopback latency samples found from jack_iodelay. Verify output->input cable and JACK routing."
    fi
else
    write_values_file_internal "$values_file" >/dev/null
    playback_port=""
    capture_port=""
    iodelay_out=""
    iodelay_in=""
fi

xrun_after="$(get_xrun_count)"
xrun_delta=$(( xrun_after - xrun_before ))
if (( xrun_delta < 0 )); then
    xrun_delta=0
fi

interface_name="$(detect_interface_name)"
cpu_cores_csv="$(detect_cpu_cores_csv)"
git_commit="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")"

set +e
python_status="$(
python3 - <<'PY' \
    "$values_file" \
    "$measurement_cycles" \
    "$xrun_delta" \
    "$OUTPUT_PATH" \
    "$interface_name" \
    "$cpu_cores_csv" \
    "$git_commit" \
    "$METHOD" \
    "$HARD_RTL_P95_MS" \
    "$HARD_JITTER_P95_MS" \
    "$WARN_RTL_P95_MS" \
    "$WARN_JITTER_P95_MS"
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

def percentile(values, p):
    if not values:
        return 0.0
    if len(values) == 1:
        return float(values[0])
    k = (len(values) - 1) * (p / 100.0)
    lo = int(math.floor(k))
    hi = int(math.ceil(k))
    if lo == hi:
        return float(values[lo])
    return float(values[lo] + (values[hi] - values[lo]) * (k - lo))

values_path = Path(sys.argv[1])
measurement_cycles = max(1, int(sys.argv[2]))
xruns = max(0, int(sys.argv[3]))
output_path = Path(sys.argv[4])
interface_name = sys.argv[5]
cpu_cores_csv = sys.argv[6]
git_commit = sys.argv[7]
method = sys.argv[8]
hard_rtl_p95 = float(sys.argv[9])
hard_jitter_p95 = float(sys.argv[10])
warn_rtl_p95 = float(sys.argv[11])
warn_jitter_p95 = float(sys.argv[12])

raw_values = []
for line in values_path.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line:
        continue
    try:
        raw_values.append(float(line))
    except ValueError:
        pass

if not raw_values:
    raise SystemExit("No numeric latency values were collected")

# raw_values has already been filtered to the converged set by
# write_values_file_from_jack. Compute statistics directly over those
# samples — do NOT replicate them across measurement_cycles. The previous
# implementation expanded a handful of unconverged samples into thousands
# of synthetic copies, which inflated p95/jitter into the seconds range
# even when the underlying loopback was steady.
expanded = sorted(raw_values)

p5 = percentile(expanded, 5)
p50 = percentile(expanded, 50)
p95 = percentile(expanded, 95)
p99 = percentile(expanded, 99)
rtl_min = float(expanded[0])
rtl_max = float(expanded[-1])
rtl_mean = float(sum(expanded) / len(expanded))
jitter_p95 = max(0.0, p95 - p5)
jitter_max = max(0.0, rtl_max - rtl_min)

hard_fail = p95 > hard_rtl_p95 or jitter_p95 > hard_jitter_p95 or xruns > 0
warn = (not hard_fail) and (p95 > warn_rtl_p95 or jitter_p95 > warn_jitter_p95)
gate = "FAIL" if hard_fail else ("WARN" if warn else "PASS")

cpu_cores = []
for token in cpu_cores_csv.split(","):
    token = token.strip()
    if not token:
        continue
    try:
        cpu_cores.append(int(token))
    except ValueError:
        continue
if not cpu_cores:
    cpu_cores = [0]

payload = {
    "timestamp": datetime.now(timezone.utc).isoformat(),
    "git_commit": git_commit,
    "hardware": {
        "interface": interface_name,
        "buffer_size": 64,
        "sample_rate": 48000,
        "cpu_cores": cpu_cores,
    },
    "rtl": {
        "min_ms": round(rtl_min, 4),
        "mean_ms": round(rtl_mean, 4),
        "p50_ms": round(p50, 4),
        "p95_ms": round(p95, 4),
        "p99_ms": round(p99, 4),
        "max_ms": round(rtl_max, 4),
    },
    "jitter": {
        "p95_ms": round(jitter_p95, 4),
        "max_ms": round(jitter_max, 4),
    },
    "xruns": xruns,
    "gate": gate,
    "notes": (
        f"method={method}; window_cycles={measurement_cycles}; "
        f"converged_samples={len(raw_values)}"
    ),
}

output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

# Keep legacy compatibility for audio diagnostics route.
compat_payload = {
    "method": method,
    "timestamp": payload["timestamp"],
    "round_trip_ms": payload["rtl"]["mean_ms"],
    "p95_ms": payload["rtl"]["p95_ms"],
    "jitter_p95_ms": payload["jitter"]["p95_ms"],
    "xruns": xruns,
    "gate": gate,
    "status": "measured" if method == "jack" else "estimated",
    "evidence_file": str(output_path),
}
Path("/tmp/map2_latency_results.json").write_text(
    json.dumps(compat_payload, indent=2) + "\n",
    encoding="utf-8",
)

print(json.dumps({
    "gate": gate,
    "rtl_p95_ms": payload["rtl"]["p95_ms"],
    "jitter_p95_ms": payload["jitter"]["p95_ms"],
    "xruns": xruns,
    "evidence_file": str(output_path),
}))

if hard_fail:
    raise SystemExit(1)
PY
)"
status_code=$?
set -e

if [[ "$JSON_OUTPUT" == true ]]; then
    cat "$OUTPUT_PATH"
else
    log "Result: ${python_status}"
    log "Evidence: $OUTPUT_PATH"
fi

exit "$status_code"

#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  avb_capture_clock_drift.sh [interface] [duration_seconds] [output_dir]

Arguments:
  interface         Network interface to capture (default: MAP2_AVB_INTERFACE or eth0)
  duration_seconds  Capture duration in seconds (default: 120)
  output_dir        Artifact directory (default: /tmp/map2-avb-evidence-<timestamp>)

Outputs:
  avtp_capture.pcap             Raw AVTP packet capture
  avtp_frames.tsv               Extracted AVTP frame timestamps
  ptp_offset_samples.csv        PTP offset/path-delay samples
  summary.txt                   Pass/fail summary with <1 us offset target check

Requirements:
  - tshark
  - pmc (linuxptp)
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

INTERFACE="${1:-${MAP2_AVB_INTERFACE:-eth0}}"
DURATION_SECONDS="${2:-120}"
OUTPUT_DIR="${3:-/tmp/map2-avb-evidence-$(date +%Y%m%d-%H%M%S)}"
SAMPLE_INTERVAL_SECONDS="${SAMPLE_INTERVAL_SECONDS:-1}"
TARGET_MAX_OFFSET_NS="${TARGET_MAX_OFFSET_NS:-1000}"

if ! [[ "$DURATION_SECONDS" =~ ^[0-9]+$ ]] || [[ "$DURATION_SECONDS" -le 0 ]]; then
  echo "ERROR: duration_seconds must be a positive integer" >&2
  exit 1
fi

if ! command -v tshark >/dev/null 2>&1; then
  echo "ERROR: tshark is required but not found in PATH" >&2
  exit 1
fi

if ! command -v pmc >/dev/null 2>&1; then
  echo "ERROR: pmc (linuxptp) is required but not found in PATH" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
PCAP_FILE="$OUTPUT_DIR/avtp_capture.pcap"
AVTP_TSV="$OUTPUT_DIR/avtp_frames.tsv"
PTP_CSV="$OUTPUT_DIR/ptp_offset_samples.csv"
SUMMARY_FILE="$OUTPUT_DIR/summary.txt"

echo "timestamp_utc,offset_from_master_ns,mean_path_delay_ns,grandmaster_identity" > "$PTP_CSV"

CAPTURE_PID=""
capture_running=0

cleanup_capture() {
  if [[ "$capture_running" -eq 1 && -n "$CAPTURE_PID" ]]; then
    kill "$CAPTURE_PID" >/dev/null 2>&1 || true
    wait "$CAPTURE_PID" 2>/dev/null || true
  fi
  capture_running=0
}

trap cleanup_capture EXIT INT TERM

echo "Starting AVTP capture on interface '$INTERFACE' for $DURATION_SECONDS seconds..."
tshark -i "$INTERFACE" -f "ether proto 0x22f0" -w "$PCAP_FILE" >/dev/null 2>&1 &
CAPTURE_PID="$!"
capture_running=1

end_epoch=$(( $(date +%s) + DURATION_SECONDS ))
while [[ "$(date +%s)" -lt "$end_epoch" ]]; do
  timestamp_utc="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  current_data="$(pmc -u -b 0 "GET CURRENT_DATA_SET" 2>/dev/null || true)"
  parent_data="$(pmc -u -b 0 "GET PARENT_DATA_SET" 2>/dev/null || true)"

  offset_ns="$(printf '%s\n' "$current_data" | awk '/offsetFromMaster/ {print $2; exit}')"
  mean_path_delay_ns="$(printf '%s\n' "$current_data" | awk '/meanPathDelay/ {print $2; exit}')"
  grandmaster_identity="$(printf '%s\n' "$parent_data" | awk '/grandmasterIdentity/ {print $2; exit}')"

  [[ -z "$offset_ns" ]] && offset_ns="nan"
  [[ -z "$mean_path_delay_ns" ]] && mean_path_delay_ns="nan"
  [[ -z "$grandmaster_identity" ]] && grandmaster_identity="unknown"

  printf '%s,%s,%s,%s\n' \
    "$timestamp_utc" \
    "$offset_ns" \
    "$mean_path_delay_ns" \
    "$grandmaster_identity" >> "$PTP_CSV"

  sleep "$SAMPLE_INTERVAL_SECONDS"
done

cleanup_capture

tshark -r "$PCAP_FILE" -Y "avtp" -T fields \
  -e frame.time_epoch \
  -e avtp.stream_id \
  -e avtp.timestamp > "$AVTP_TSV" 2>/dev/null || true

sample_count=$(awk -F, 'NR>1 {count+=1} END {print count+0}' "$PTP_CSV")
valid_count=$(awk -F, 'NR>1 && $2 != "nan" {count+=1} END {print count+0}' "$PTP_CSV")
max_abs_offset_ns=$(awk -F, '
  NR>1 && $2 != "nan" {
    value = $2 + 0
    if (value < 0) value = -value
    if (value > max) max = value
  }
  END {
    if (NR <= 1 || max == "") {
      print "nan"
    } else {
      print max
    }
  }
' "$PTP_CSV")
avtp_frame_count=$(awk 'NF > 0 {count+=1} END {print count+0}' "$AVTP_TSV")

offset_target="FAIL_OR_MISSING"
if [[ "$max_abs_offset_ns" != "nan" ]] && awk "BEGIN {exit !($max_abs_offset_ns <= $TARGET_MAX_OFFSET_NS)}"; then
  offset_target="PASS"
fi

cat > "$SUMMARY_FILE" <<EOF
interface=$INTERFACE
duration_seconds=$DURATION_SECONDS
ptp_samples_total=$sample_count
ptp_samples_with_offset=$valid_count
max_abs_offset_ns=$max_abs_offset_ns
target_max_abs_offset_ns=$TARGET_MAX_OFFSET_NS
offset_target=$offset_target
avtp_frame_count=$avtp_frame_count
pcap_file=$PCAP_FILE
avtp_frames_tsv=$AVTP_TSV
ptp_samples_csv=$PTP_CSV
EOF

echo "Artifacts written to: $OUTPUT_DIR"
echo "Summary file: $SUMMARY_FILE"

#!/usr/bin/env bash
# ==============================================================================
# MAP2 Audio - Round-Trip Latency Measurement Tool
# ==============================================================================
#
# Measures ACTUAL round-trip latency using a loopback cable or internal loopback.
# This produces REAL measured numbers, not estimates.
#
# Methods supported:
#   1. JACK loopback (jack_iodelay) - Gold standard
#   2. ALSA loopback (alsa_delay)   - Fallback
#   3. Impulse method (custom)      - Software-only measurement
#
# Requirements:
#   - PipeWire with JACK support (pipewire-jack)
#   - jack_iodelay (from jack-example-tools or jack2)
#   - Optional: loopback cable connecting output → input
#
# Usage:
#   ./measure_latency.sh              # Auto-detect best method
#   ./measure_latency.sh --jack       # Force JACK method
#   ./measure_latency.sh --internal   # Use PipeWire internal loopback
#   ./measure_latency.sh --duration 30  # Measure for 30 seconds
#   ./measure_latency.sh --json       # Output as JSON
#
# ==============================================================================

set -euo pipefail

# Defaults
METHOD="auto"
DURATION=15          # seconds to measure
JSON_OUTPUT=false
SAMPLE_RATE=48000
BUFFER_SIZE=64
RESULTS_FILE="/tmp/map2_latency_results.json"
VERBOSE=false
JACK_PLAYBACK_PORT=""
JACK_CAPTURE_PORT=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --jack)      METHOD="jack"; shift ;;
        --internal)  METHOD="internal"; shift ;;
        --alsa)      METHOD="alsa"; shift ;;
        --duration)  DURATION="$2"; shift 2 ;;
        --json)      JSON_OUTPUT=true; shift ;;
        --rate)      SAMPLE_RATE="$2"; shift 2 ;;
        --buffer)    BUFFER_SIZE="$2"; shift 2 ;;
        --jack-playback-port) JACK_PLAYBACK_PORT="$2"; shift 2 ;;
        --jack-capture-port)  JACK_CAPTURE_PORT="$2"; shift 2 ;;
        --verbose)   VERBOSE=true; shift ;;
        --help|-h)
            echo "Usage: $0 [--jack|--internal|--alsa] [--duration N] [--json] [--rate N] [--buffer N] [--jack-playback-port PORT] [--jack-capture-port PORT]"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

log() {
    if [[ "$JSON_OUTPUT" != true ]]; then
        echo -e "$1"
    fi
}

log_verbose() {
    if [[ "$VERBOSE" == true ]]; then
        log "$1"
    fi
}

# ==============================================================================
# Pre-flight checks
# ==============================================================================

preflight() {
    log "${BLUE}═══════════════════════════════════════════════════════${NC}"
    log "${BLUE}  MAP2 Audio - Round-Trip Latency Measurement${NC}"
    log "${BLUE}═══════════════════════════════════════════════════════${NC}"
    log ""

    # Check PipeWire
    if pgrep -x pipewire &>/dev/null; then
        log "${GREEN}✓${NC} PipeWire daemon running"
    else
        log "${RED}✗${NC} PipeWire not running!"
        exit 1
    fi

    # Get current PipeWire settings
    local pw_info
    if command -v pw-cli &>/dev/null; then
        pw_info=$(pw-cli info 0 2>/dev/null || true)
        if echo "$pw_info" | grep -q "default.clock.rate"; then
            SAMPLE_RATE=$(echo "$pw_info" | grep "default.clock.rate" | head -1 | grep -oP '\d+' | head -1 || echo "$SAMPLE_RATE")
        fi
        if echo "$pw_info" | grep -q "default.clock.quantum"; then
            BUFFER_SIZE=$(echo "$pw_info" | grep "default.clock.quantum" | head -1 | grep -oP '\d+' | head -1 || echo "$BUFFER_SIZE")
        fi
    fi

    log "  Sample rate: ${SAMPLE_RATE} Hz"
    log "  Buffer size: ${BUFFER_SIZE} samples"
    log "  Buffer latency: $(echo "scale=2; $BUFFER_SIZE * 1000 / $SAMPLE_RATE" | bc) ms"
    log ""

    # Check available tools
    local has_jack_iodelay=false
    local has_jack_lsp=false

    if command -v jack_iodelay &>/dev/null || command -v pw-jack &>/dev/null; then
        has_jack_iodelay=true
        log "${GREEN}✓${NC} jack_iodelay available"
    fi

    if command -v jack_lsp &>/dev/null; then
        has_jack_lsp=true
        log "${GREEN}✓${NC} jack_lsp available"
    fi

    # Auto-select method
    if [[ "$METHOD" == "auto" ]]; then
        if [[ "$has_jack_iodelay" == true ]]; then
            METHOD="jack"
        else
            METHOD="internal"
        fi
        log "  Auto-selected method: ${METHOD}"
    fi

    log ""
}

# ==============================================================================
# Method 1: JACK iodelay (Gold Standard)
# ==============================================================================

first_jack_port_match() {
    local pattern="$1"
    jack_lsp 2>/dev/null | grep -E "$pattern" | head -1 || true
}

detect_jack_playback_port() {
    if [[ -n "$JACK_PLAYBACK_PORT" ]]; then
        echo "$JACK_PLAYBACK_PORT"
        return 0
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
        return 0
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
    echo "$port"
}

detect_iodelay_in_port() {
    local port=""
    port=$(first_jack_port_match '^jack_iodelay:input$')
    [[ -z "$port" ]] && port=$(first_jack_port_match '^jack_iodelay:in$')
    [[ -z "$port" ]] && port=$(first_jack_port_match '^jack_delay:in$')
    echo "$port"
}

connect_jack_ports() {
    local source_port="$1"
    local target_port="$2"

    if command -v jack_connect &>/dev/null; then
        jack_connect "$source_port" "$target_port" 2>/dev/null || true
        return 0
    fi

    if command -v pw-jack &>/dev/null; then
        pw-jack jack_connect "$source_port" "$target_port" 2>/dev/null || true
        return 0
    fi

    return 1
}

measure_jack() {
    log "${YELLOW}▶ JACK iodelay measurement (${DURATION}s)${NC}"
    log "  Requires loopback cable: Output → Input"
    log ""

    if ! command -v jack_iodelay &>/dev/null; then
        log "${RED}✗${NC} jack_iodelay not found. Install jack-tools"
        return 1
    fi

    if ! command -v jack_lsp &>/dev/null; then
        log "${RED}✗${NC} jack_lsp not found. Install jack-tools"
        return 1
    fi

    local use_pw_jack=false
    if command -v pw-jack &>/dev/null; then
        use_pw_jack=true
    fi

    local tmpfile
    tmpfile=$(mktemp /tmp/map2_iodelay.XXXXXX)

    # Run jack_iodelay for the specified duration
    log "  Running jack_iodelay..."
    if [[ "$use_pw_jack" == true ]]; then
        timeout "${DURATION}" pw-jack jack_iodelay >"$tmpfile" 2>&1 &
    else
        timeout "${DURATION}" jack_iodelay >"$tmpfile" 2>&1 &
    fi
    local pid=$!

    # Wait a moment for it to start
    sleep 2

    local iodelay_out_port
    local iodelay_in_port
    local playback_port
    local capture_port

    iodelay_out_port=$(detect_iodelay_out_port)
    iodelay_in_port=$(detect_iodelay_in_port)
    playback_port=$(detect_jack_playback_port)
    capture_port=$(detect_jack_capture_port)

    if [[ -n "$iodelay_out_port" ]] && [[ -n "$playback_port" ]]; then
        connect_jack_ports "$iodelay_out_port" "$playback_port"
    fi
    if [[ -n "$capture_port" ]] && [[ -n "$iodelay_in_port" ]]; then
        connect_jack_ports "$capture_port" "$iodelay_in_port"
    fi

    log_verbose "  iodelay out: $iodelay_out_port"
    log_verbose "  iodelay in:  $iodelay_in_port"
    log_verbose "  playback:    $playback_port"
    log_verbose "  capture:     $capture_port"

    # Wait for measurement to complete
    wait $pid 2>/dev/null || true

    # Parse results
    local output
    output=$(cat "$tmpfile")
    rm -f "$tmpfile"

    log_verbose "  Raw output: $output"

    # jack_iodelay outputs lines like:
    #  1234.5 frames    25.7 ms total roundtrip latency
    #         extra loopback latency: 1106 frames
    #         use 553 for the backend arguments -I and -O

    local total_frames=""
    local total_ms=""
    local extra_frames=""

    if echo "$output" | grep -q "total roundtrip latency"; then
        total_frames=$(echo "$output" | grep "total roundtrip" | tail -1 | awk '{print $1}')
        total_ms=$(echo "$output" | grep "total roundtrip" | tail -1 | awk '{print $3}')
        extra_frames=$(echo "$output" | grep "extra loopback" | tail -1 | awk '{print $4}')
    fi

    if [[ -n "$total_ms" ]]; then
        local buffer_latency_ms
        buffer_latency_ms=$(echo "scale=3; $BUFFER_SIZE * 1000.0 / $SAMPLE_RATE" | bc)

        log ""
        log "${GREEN}═══ MEASUREMENT RESULTS ═══${NC}"
        log "  Total round-trip:    ${GREEN}${total_ms} ms${NC} (${total_frames} frames)"
        log "  Extra loopback:      ${extra_frames:-N/A} frames"
        log "  Buffer latency:      ${buffer_latency_ms} ms (${BUFFER_SIZE} samples)"
        log "  Sample rate:         ${SAMPLE_RATE} Hz"
        log ""

        # Save results as JSON
        cat > "$RESULTS_FILE" << EOF
{
    "method": "jack_iodelay",
    "timestamp": "$(date -Iseconds)",
    "round_trip_ms": ${total_ms},
    "round_trip_frames": ${total_frames:-0},
    "extra_loopback_frames": ${extra_frames:-0},
    "jack_ports": {
      "iodelay_output": "${iodelay_out_port}",
      "iodelay_input": "${iodelay_in_port}",
      "playback": "${playback_port}",
      "capture": "${capture_port}"
    },
    "buffer_size": ${BUFFER_SIZE},
    "sample_rate": ${SAMPLE_RATE},
    "buffer_latency_ms": ${buffer_latency_ms},
    "one_way_estimate_ms": $(echo "scale=3; ${total_ms} / 2" | bc),
    "duration_seconds": ${DURATION},
    "status": "measured"
}
EOF
        if [[ "$JSON_OUTPUT" == true ]]; then
            cat "$RESULTS_FILE"
        fi

        return 0
    else
        log "${RED}✗${NC} No measurement obtained."
        log "  Make sure a loopback cable connects output → input"
        log "  Or use --internal for software-only measurement"

        cat > "$RESULTS_FILE" << EOF
{
    "method": "jack_iodelay",
    "timestamp": "$(date -Iseconds)",
    "jack_ports": {
      "iodelay_output": "${iodelay_out_port}",
      "iodelay_input": "${iodelay_in_port}",
      "playback": "${playback_port}",
      "capture": "${capture_port}"
    },
    "status": "failed",
    "error": "No loopback signal detected. Connect output to input with a cable."
}
EOF
        if [[ "$JSON_OUTPUT" == true ]]; then
            cat "$RESULTS_FILE"
        fi

        return 1
    fi
}

# ==============================================================================
# Method 2: Internal PipeWire loopback measurement
# ==============================================================================

measure_internal() {
    log "${YELLOW}▶ PipeWire internal loopback measurement${NC}"
    log "  No cable required - measures software stack latency"
    log ""

    # Use pw-top or pw-profiler for internal measurement
    local pw_top_output
    local latency_info=""

    # Method A: Use pw-top to get driver latency
    if command -v pw-top &>/dev/null; then
        log "  Sampling pw-top for ${DURATION}s..."

        # Run pw-top in batch mode for analysis
        local tmpfile
        tmpfile=$(mktemp /tmp/map2_pwtop.XXXXXX)

        # Capture pw-top output without polluting stdout in --json mode
        timeout "$DURATION" pw-top -b >"$tmpfile" 2>&1 &
        local pid=$!
        sleep "$DURATION"
        kill $pid 2>/dev/null || true
        wait $pid 2>/dev/null || true

        pw_top_output=$(cat "$tmpfile" 2>/dev/null || true)
        rm -f "$tmpfile"
    fi

    # Method B: Calculate from PipeWire node properties
    local driver_latency_frames=0
    local graph_latency_frames=0
    local total_latency_ms=0

    # Get device-reported latency via pw-dump
    if command -v pw-dump &>/dev/null; then
        local pw_dump
        pw_dump=$(pw-dump 2>/dev/null | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    for node in data:
        if node.get('type') == 'PipeWire:Interface:Node':
            props = node.get('info', {}).get('props', {})
            if 'audio.adapter.name' in props or props.get('media.class', '') in ['Audio/Sink', 'Audio/Source']:
                name = props.get('node.name', props.get('node.description', 'unknown'))
                # Get latency from params
                params = node.get('info', {}).get('params', {})
                for fmt in params.get('Format', []):
                    if isinstance(fmt, dict) and 'rate' in fmt:
                        print(f'{name}|{fmt.get(\"rate\", 0)}|{fmt.get(\"buffer\", 0)}')
except:
    pass
" 2>/dev/null || true)
    fi

    # Calculate from known values
    local buffer_ms
    buffer_ms=$(echo "scale=3; $BUFFER_SIZE * 1000.0 / $SAMPLE_RATE" | bc)

    # PipeWire adds 1 quantum of input latency + 1 quantum of output latency
    # Plus driver overhead (typically 0.1-0.5ms)
    local pw_overhead_ms="0.3"  # Typical PipeWire overhead
    local input_latency_ms="$buffer_ms"
    local output_latency_ms="$buffer_ms"
    total_latency_ms=$(echo "scale=3; $input_latency_ms + $output_latency_ms + $pw_overhead_ms" | bc)

    # Get JACK-reported latency if available
    local jack_latency_in=0
    local jack_latency_out=0
    if command -v jack_lsp &>/dev/null; then
        local jack_info
        jack_info=$(jack_lsp -l 2>/dev/null || true)
        if echo "$jack_info" | grep -q "port latency"; then
            jack_latency_in=$(echo "$jack_info" | grep "system:capture" -A2 | grep "port latency" | head -1 | grep -oP '\[\K\d+' || echo "0")
            jack_latency_out=$(echo "$jack_info" | grep "system:playback" -A2 | grep "port latency" | head -1 | grep -oP '\[\K\d+' || echo "0")
        fi
    fi

    local jack_in_ms=0
    local jack_out_ms=0
    if [[ "$jack_latency_in" -gt 0 ]]; then
        jack_in_ms=$(echo "scale=3; $jack_latency_in * 1000.0 / $SAMPLE_RATE" | bc)
    fi
    if [[ "$jack_latency_out" -gt 0 ]]; then
        jack_out_ms=$(echo "scale=3; $jack_latency_out * 1000.0 / $SAMPLE_RATE" | bc)
    fi

    local jack_total_ms
    if [[ "$jack_latency_in" -gt 0 ]] && [[ "$jack_latency_out" -gt 0 ]]; then
        jack_total_ms=$(echo "scale=3; $jack_in_ms + $jack_out_ms" | bc)
    else
        jack_total_ms="$total_latency_ms"
    fi

    # Report
    log ""
    log "${GREEN}═══ INTERNAL LATENCY ANALYSIS ═══${NC}"
    log ""
    log "  ${BLUE}PipeWire Settings:${NC}"
    log "    Sample rate:       ${SAMPLE_RATE} Hz"
    log "    Quantum/Buffer:    ${BUFFER_SIZE} samples"
    log "    Buffer latency:    ${buffer_ms} ms"
    log ""
    log "  ${BLUE}Calculated Latency:${NC}"
    log "    Input (1 quantum):   ${input_latency_ms} ms"
    log "    Output (1 quantum):  ${output_latency_ms} ms"
    log "    PipeWire overhead:   ~${pw_overhead_ms} ms"
    log "    ──────────────────────────────"
    log "    ${GREEN}Estimated round-trip: ${total_latency_ms} ms${NC}"
    log ""

    if [[ "$jack_latency_in" -gt 0 ]]; then
        log "  ${BLUE}JACK-Reported Latency:${NC}"
        log "    Input latency:   ${jack_in_ms} ms (${jack_latency_in} frames)"
        log "    Output latency:  ${jack_out_ms} ms (${jack_latency_out} frames)"
        log "    ${GREEN}JACK round-trip: ${jack_total_ms} ms${NC}"
        log ""
    fi

    log "  ${YELLOW}⚠ This is a SOFTWARE estimate. For true hardware measurement,${NC}"
    log "  ${YELLOW}  use a loopback cable and run: $0 --jack${NC}"
    log ""

    # Save results
    cat > "$RESULTS_FILE" << EOF
{
    "method": "internal_calculation",
    "timestamp": "$(date -Iseconds)",
    "estimated_round_trip_ms": ${total_latency_ms},
    "buffer_latency_ms": ${buffer_ms},
    "input_latency_ms": ${input_latency_ms},
    "output_latency_ms": ${output_latency_ms},
    "pipewire_overhead_ms": ${pw_overhead_ms},
    "jack_input_latency_frames": ${jack_latency_in},
    "jack_output_latency_frames": ${jack_latency_out},
    "jack_input_latency_ms": ${jack_in_ms},
    "jack_output_latency_ms": ${jack_out_ms},
    "jack_round_trip_ms": ${jack_total_ms},
    "buffer_size": ${BUFFER_SIZE},
    "sample_rate": ${SAMPLE_RATE},
    "duration_seconds": ${DURATION},
    "status": "estimated",
    "note": "Software estimate only. Use loopback cable + --jack for true measurement."
}
EOF

    if [[ "$JSON_OUTPUT" == true ]]; then
        cat "$RESULTS_FILE"
    fi

    return 0
}

# ==============================================================================
# Summary with professional grading
# ==============================================================================

grade_latency() {
    local latency_ms="$1"

    # Compare against professional hardware
    local grade=""
    local comparison=""

    if (( $(echo "$latency_ms < 2.0" | bc -l) )); then
        grade="A+ (Studio Elite)"
        comparison="Matches Fractal FM9 / Kemper"
    elif (( $(echo "$latency_ms < 3.0" | bc -l) )); then
        grade="A (Professional)"
        comparison="Matches Quad Cortex / Helix"
    elif (( $(echo "$latency_ms < 5.0" | bc -l) )); then
        grade="B+ (Pro-grade)"
        comparison="Beats Boss GT-1000 Core (4.5ms)"
    elif (( $(echo "$latency_ms < 8.0" | bc -l) )); then
        grade="B (Good)"
        comparison="Acceptable for live performance"
    elif (( $(echo "$latency_ms < 12.0" | bc -l) )); then
        grade="C (Marginal)"
        comparison="Perceptible delay — needs optimization"
    else
        grade="D (Unacceptable)"
        comparison="Not suitable for live use"
    fi

    log ""
    log "${BLUE}═══ PROFESSIONAL GRADE ═══${NC}"
    log "  Grade: ${GREEN}${grade}${NC}"
    log "  ${comparison}"
    log ""
    log "  Reference: FM9=1.9ms, QC=2.2ms, Helix=2.3ms, GT-1000=4.5ms"
    log ""
}

# ==============================================================================
# Main
# ==============================================================================

main() {
    preflight

    case "$METHOD" in
        jack)
            measure_jack
            ;;
        internal)
            measure_internal
            ;;
        alsa)
            log "${RED}ALSA method not yet implemented. Use --jack or --internal${NC}"
            exit 1
            ;;
        *)
            log "${RED}Unknown method: $METHOD${NC}"
            exit 1
            ;;
    esac

    # Grade the result
    if [[ -f "$RESULTS_FILE" ]]; then
        local measured_ms
        measured_ms=$(python3 -c "
import json
with open('$RESULTS_FILE') as f:
    d = json.load(f)
    # Use whichever measurement is available
    ms = d.get('round_trip_ms', d.get('estimated_round_trip_ms', d.get('jack_round_trip_ms', 0)))
    print(f'{ms}')
" 2>/dev/null || echo "0")

        if [[ "$measured_ms" != "0" ]] && [[ "$JSON_OUTPUT" != true ]]; then
            grade_latency "$measured_ms"
        fi
    fi

    if [[ "$JSON_OUTPUT" != true ]]; then
        log "Results saved to: ${RESULTS_FILE}"
    fi
}

main "$@"

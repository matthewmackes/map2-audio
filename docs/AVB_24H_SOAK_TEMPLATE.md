# AVB 8-Stream 24h Soak Template

Use this template for qualification item `Q06` in `docs/AVB_QUALIFICATION_MATRIX.md`.

One-command wrapper for this flow:
```bash
./scripts/run_avb_24h_soak.sh --duration-hours 24 --checkpoint-minutes 60 --output-dir /tmp/map2-avb-soak
```

## Objective

Run 8 concurrent AVB streams for 24 hours and collect deterministic evidence for:
- stream lifecycle stability
- transport integrity (sequence/timestamp/decode counters)
- host health (CPU, memory, xruns, latency, jitter)
- SRP reservation cleanup/no-orphan guarantees

## Preconditions

- AVB-capable NIC and TSN network available.
- PTP lock stable before starting (`/api/avb/ptp` shows locked state).
- 8 talker/listener endpoint pairs prepared.
- Artifact directory created:
```bash
export SOAK_DIR=/tmp/map2-avb-soak-$(date +%Y%m%d-%H%M%S)
mkdir -p "$SOAK_DIR"
```

## Start Procedure (T+00:00)

1. Capture baseline state:
```bash
curl -s http://localhost:8080/api/avb/streams > "$SOAK_DIR/streams.baseline.json"
curl -s http://localhost:8080/api/avb/router/connections > "$SOAK_DIR/connections.baseline.json"
curl -s http://localhost:8080/api/avb/ptp > "$SOAK_DIR/ptp.baseline.json"
```

2. Start 8 streams (replace with lab-specific IDs):
```bash
# Example placeholder pattern. Replace stream IDs with real test matrix IDs.
for idx in 0 1 2 3 4 5 6 7; do
  curl -s -X POST http://localhost:8080/api/avb/streams \
    -H "Content-Type: application/json" \
    -d "{
      \"stream_id\": \"soak-stream-$idx\",
      \"direction\": \"talker\",
      \"interface\": \"${MAP2_AVB_INTERFACE:-eth0}\",
      \"channels\": 2,
      \"sample_rate\": 48000
    }" >> "$SOAK_DIR/start.log"
done
```

3. Start periodic diagnostics collector:
```bash
cat > "$SOAK_DIR/collect.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
out_dir="$1"
timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
curl -s http://localhost:8080/api/avb/streams > "$out_dir/streams.$timestamp.json"
curl -s http://localhost:8080/api/avb/router/connections > "$out_dir/connections.$timestamp.json"
curl -s http://localhost:8080/api/avb/ptp > "$out_dir/ptp.$timestamp.json"
EOF
chmod +x "$SOAK_DIR/collect.sh"
```

## Checkpoint Schedule

At each checkpoint run:
```bash
"$SOAK_DIR/collect.sh" "$SOAK_DIR"
```

Checkpoint times:
- `T+00:00` start
- `T+01:00`
- `T+04:00`
- `T+08:00`
- `T+12:00`
- `T+24:00` stop

Record any reconnect/restart events with absolute UTC timestamps in `"$SOAK_DIR/events.log"`.

## Stop Procedure (T+24:00)

1. Stop all soak streams.
2. Capture final state:
```bash
curl -s http://localhost:8080/api/avb/streams > "$SOAK_DIR/streams.final.json"
curl -s http://localhost:8080/api/avb/router/connections > "$SOAK_DIR/connections.final.json"
curl -s http://localhost:8080/api/avb/ptp > "$SOAK_DIR/ptp.final.json"
```
3. Verify no orphaned SRP reservations/connections remain.

## Pass/Fail Criteria

Pass when all are true:
- No unrecovered stream failures for 24h window.
- No sustained transport degradation (sequence/timestamp/decode counters stable within expected bounds).
- No persistent PTP unlock condition.
- No orphaned router/SRP state after stop.

Fail when any are true:
- Repeated stream failure without recovery.
- Continuous sequence/timestamp counter growth inconsistent with induced fault plan.
- Persistent PTP unlock.
- Residual active connections/reservations after teardown.

## Artifact Checklist

- `streams.baseline.json`, `streams.final.json`
- checkpoint `streams.*.json` snapshots
- `connections.baseline.json`, `connections.final.json`
- checkpoint `connections.*.json` snapshots
- `ptp.baseline.json`, `ptp.final.json`
- checkpoint `ptp.*.json` snapshots
- `start.log`
- `events.log`

## Post-Run Summary Template

```text
Run ID:
Start UTC:
End UTC:
Host(s):
Interface:
Total streams:
Recovered failures:
Unrecovered failures:
Max sequence error delta:
Max timestamp error delta:
Max observed PTP offset:
Residual connections after stop:
Residual SRP reservations after stop:
Result: PASS | FAIL
Notes:
```

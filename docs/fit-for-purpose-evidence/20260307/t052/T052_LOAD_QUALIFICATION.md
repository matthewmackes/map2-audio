# T052 Load Qualification (PASS)

Date: 2026-03-07
Task: T052 - Reintroduce full synchronous-equivalent plugin/pipewire behaviors with non-blocking architecture and preserve T051 load gates

## Final Qualification Command (Authoritative v2 Run)

```bash
MAP2_LOCUST_WS_CLIENTS=100 \
MAP2_LOCUST_SOAK_SECONDS=300 \
MAP2_LOCUST_MIDI_BURST_UPDATES=500 \
python3 -m locust -f tests/load_test.py --headless -u 10 -r 2 -t 310s \
  --host http://localhost:8080 \
  --csv docs/fit-for-purpose-evidence/20260307/t052/locust-final-310s-v2 \
  --csv-full-history
```

## Gate Results

- REST p95: `18.00 ms` (PASS, target `< 50 ms`)
- REST failures: `0` (PASS)
- WS drops: `0` (PASS, target `= 0`)
- WS spread p95: `0.187018 ms` (PASS)
- WS target clients: `100` connected
- WS soak duration: `300 s` target met

## Smoke Gate Confirmation

- Smoke run artifact: `locust-smoke-65s-v2*`
- Result: PASS (`REST p95=20.00 ms`, `WS drops=0`, `WS spread p95=0.214498 ms`)

## Notes

- `v1` Locust artifacts in this directory were captured before backend restart and are non-authoritative for T052 acceptance.
- `v2` artifacts are the post-restart qualification source of truth.

## Artifacts

- `locust-final-310s-v2.log`
- `locust-final-310s-v2_stats.csv`
- `locust-final-310s-v2_stats_history.csv`
- `locust-final-310s-v2_failures.csv`
- `locust-final-310s-v2_exceptions.csv`
- `locust-smoke-65s-v2.log`
- `locust-smoke-65s-v2_stats.csv`

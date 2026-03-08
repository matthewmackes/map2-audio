# T051 Load Qualification (PASS)

Date: 2026-03-07
Task: T051 - Remediate backend collapse under 100-client WS + concurrent REST load

## Final Qualification Command

```bash
MAP2_LOCUST_WS_CLIENTS=100 \
MAP2_LOCUST_SOAK_SECONDS=300 \
MAP2_LOCUST_MIDI_BURST_UPDATES=500 \
python3 -m locust -f tests/load_test.py --headless -u 10 -r 2 -t 310s \
  --host http://localhost:8080 \
  --csv docs/fit-for-purpose-evidence/20260307/t051/locust-final-310s-v1 \
  --csv-full-history
```

## Gate Results

- REST p95: `18.00 ms` (PASS, target `< 50 ms`)
- REST failures: `0` (PASS)
- WS drops: `0` (PASS, target `= 0`)
- WS spread p95: `0.209953 ms` (PASS)
- WS target clients: `100` connected
- WS soak duration: `300 s` target met

## Smoke Gate Confirmation

- Smoke run artifact: `locust-smoke-65s-v12*`
- Result: PASS (`REST p95=21.00 ms`, `WS drops=0`)

## Artifacts

- `locust-final-310s-v1.log`
- `locust-final-310s-v1_stats.csv`
- `locust-final-310s-v1_stats_history.csv`
- `locust-final-310s-v1_failures.csv`
- `locust-final-310s-v1_exceptions.csv`
- `locust-smoke-65s-v12.log`
- `locust-smoke-65s-v12_stats.csv`

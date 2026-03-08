# T050 Load Qualification (300s)

- Date: 2026-03-07
- Result: **FAIL**
- Command: `MAP2_LOCUST_WS_CLIENTS=100 MAP2_LOCUST_SOAK_SECONDS=300 python3 -m locust -f tests/load_test.py --headless -u 10 -r 2 -t 310s --host http://localhost:8080 --csv docs/fit-for-purpose-evidence/20260307/t050/locust-final --csv-full-history`

## Aggregated HTTP
- Request count: 400
- Failure count: 379
- p95 latency: 8000.00 ms
- p99 latency: 8000.00 ms
- Median latency: 8000.00 ms
- Max latency: 8008.14 ms

## WebSocket Soak Summary
- Connected clients observed: 100.0
- Dropped connections: 9240.0
- Spread p95: 0.224401 ms
- Spread mean: 0.157357 ms
- Spread samples: 994.0

## Gate Evaluation
- FAIL: REST p95 8000.00ms exceeds 50.00ms
- FAIL: WS dropped connections = 9240 (expected 0)

## Artifacts
- `locust-final_stats.csv`
- `locust-final_failures.csv`
- `locust-final_stats_history.csv`
- `locust-run-310s-final.log`
- `t050-load-qualification-summary.json`

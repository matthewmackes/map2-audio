# API Load Qualification Runbook

Use `scripts/run_t209_api_load_qualification.py` before any smoke or full Locust run.

`tests/load_test.py` now starts and stops an API Observatory recording session automatically for each qualification run, then evaluates the server-side REST gate from that full-run recording instead of the bounded live ring buffer. The default steady-state REST gate is `p95 <= 100ms`, measured after the startup grace window and before the final tail-exclusion window.

## What The Preflight Checks

- open-file soft limit (`RLIMIT_NOFILE`)
- `/api/ready` accepting-traffic state
- `/api/services/startup-order` completion state and traffic-gate presence
- `/api/services/status/websocket_manager` readiness
- `/api/chains/` route availability
- `/api/plugins/discover` route availability

If any gate is not ready, the runner exits `1` with overall status `BLOCKED` and does not run the load command.

## Preflight Only

```bash
python3 scripts/run_t209_api_load_qualification.py \
  --output-dir docs/fit-for-purpose-evidence/$(date -u +%Y%m%dT%H%M%SZ)-t209-preflight \
  --api-base http://127.0.0.1:8080
```

## Preflight Plus Smoke

```bash
export MAP2_LOAD_RUN_ID=t209-smoke-$(date -u +%Y%m%dT%H%M%SZ)
python3 scripts/run_t209_api_load_qualification.py \
  --output-dir docs/fit-for-purpose-evidence/${MAP2_LOAD_RUN_ID} \
  --api-base http://127.0.0.1:8080 \
  --run-id ${MAP2_LOAD_RUN_ID} \
  --run-load-command \
  --load-command "MAP2_LOCUST_WS_CLIENTS=100 MAP2_LOCUST_SOAK_SECONDS=65 python3 -m locust -f tests/load_test.py --headless -u 10 -r 2 -t 70s --host http://127.0.0.1:8080"
```

## Preflight Plus Full Qualification

```bash
export MAP2_LOAD_RUN_ID=t209-full-$(date -u +%Y%m%dT%H%M%SZ)
python3 scripts/run_t209_api_load_qualification.py \
  --output-dir docs/fit-for-purpose-evidence/${MAP2_LOAD_RUN_ID} \
  --api-base http://127.0.0.1:8080 \
  --run-id ${MAP2_LOAD_RUN_ID} \
  --run-load-command \
  --load-command "MAP2_LOCUST_WS_CLIENTS=100 MAP2_LOCUST_SOAK_SECONDS=300 python3 -m locust -f tests/load_test.py --headless -u 10 -r 2 -t 310s --host http://127.0.0.1:8080 --csv docs/fit-for-purpose-evidence/${MAP2_LOAD_RUN_ID}/locust --csv-full-history"
```

## Artifacts

Each run writes:

- `t209-api-load-preflight.json`
- `T209_API_LOAD_PREFLIGHT.md`
- `load.stdout.txt` / `load.stderr.txt` when a load command is executed

Use the same `MAP2_LOAD_RUN_ID` with the observability queries from `docs/API_QUALIFICATION_OBSERVABILITY.md` to export correlated HTTP and WebSocket evidence for the run.

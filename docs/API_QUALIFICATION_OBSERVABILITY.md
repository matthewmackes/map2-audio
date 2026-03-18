# API Qualification Observability

Use this flow for API restart/load qualification runs that need correlated HTTP and WebSocket evidence.

## Correlation Contract

- HTTP clients should send `X-MAP2-Run-ID: <run_id>`.
- WebSocket clients should connect with `?run_id=<run_id>&client_label=<label>`.
- `tests/load_test.py` now emits both automatically when `MAP2_LOAD_RUN_ID` is set.
- If `MAP2_LOAD_RUN_ID` is not set, the load harness generates one and prints it at start/pass output.

## Captured Telemetry

`/api/observatory/traffic` now records both:

- `event_type=http`
  - request/response timing
  - request ID
  - run ID
  - request/response snippets
  - dependency snapshot for run-tagged requests and server-side failures
- `event_type=websocket`
  - connect / subscribe / unsubscribe / disconnect lifecycle
  - run ID
  - client label
  - active connection counts
  - send-failure / slow-disconnect counters

## Querying Evidence

Examples:

```bash
curl -s "http://localhost:8080/api/observatory/traffic?run_id=<run_id>"
curl -s "http://localhost:8080/api/observatory/traffic?event_type=websocket&run_id=<run_id>"
curl -s "http://localhost:8080/api/observatory/traffic/stats?run_id=<run_id>"
```

## Recommended Capture Flow

1. Choose a run ID, for example `export MAP2_LOAD_RUN_ID=t209-restart-$(date -u +%Y%m%dT%H%M%SZ)`.
2. Start a recording session if you want a bounded export:

```bash
curl -s -X POST http://localhost:8080/api/observatory/traffic/recording/start \
  -H 'Content-Type: application/json' \
  -d '{"name":"T209 qualification"}'
```

3. Run the smoke/full qualification with `tests/load_test.py`.
4. Export the filtered evidence:

```bash
curl -s "http://localhost:8080/api/observatory/traffic?run_id=${MAP2_LOAD_RUN_ID}&limit=5000" \
  > "docs/fit-for-purpose-evidence/${MAP2_LOAD_RUN_ID}-traffic.json"
curl -s "http://localhost:8080/api/observatory/traffic?event_type=websocket&run_id=${MAP2_LOAD_RUN_ID}&limit=5000" \
  > "docs/fit-for-purpose-evidence/${MAP2_LOAD_RUN_ID}-websocket.json"
curl -s "http://localhost:8080/api/observatory/traffic/stats?run_id=${MAP2_LOAD_RUN_ID}" \
  > "docs/fit-for-purpose-evidence/${MAP2_LOAD_RUN_ID}-stats.json"
```

5. Stop the recording session if one was started:

```bash
curl -s -X POST http://localhost:8080/api/observatory/traffic/recording/stop
```

## What To Look For

- `event_type=http` rows with `status >= 500`
- dependency snapshots showing traffic gates not ready
- `event_type=websocket` rows with `action=disconnect_error` or `action=broadcast_timeout_error`
- mismatch between HTTP error spikes and WebSocket disconnect spikes under the same `run_id`

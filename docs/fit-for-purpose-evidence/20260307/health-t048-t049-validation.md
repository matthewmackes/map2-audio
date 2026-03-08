# Health Route Fix + Latency Validation (T048, T049-subA)

## Scope
- T048-subA: service lookup `audio_engine` -> `juce_engine`
- T048-subB: metrics attribute `buffer_underrun_count` -> `buffer_underruns`
- T048-subC: export `NAM_AVAILABLE` in `nam_processor.py`
- T048-subD: validate health route behavior and live endpoint response
- T049-subA: remove blocking `psutil.cpu_percent(interval=0.1)` from `/api/health`

## Validation Commands
- `pytest -q tests/test_health_routes.py`
- `curl -sS http://localhost:8080/api/health`
- `python3` latency probe loops (80+120 samples)

## Results
- Route-level tests pass for healthy contract and JUCE service lookup.
- Live endpoint now reports:
  - `audio_running: true`
  - `nam_available: true`
  - `dependency_errors: []`
  - status is currently `degraded` only because one orchestrator service is not running (`14/15`), not due to silent dependency failures.
- Health endpoint latency improved after restart and warmup:
  - p99 from `364.262ms` (old handler process) to `1.195ms` (new cached metrics path).

## Artifacts
- `docs/fit-for-purpose-evidence/20260307/health-t048-live-after-fixes.json`
- `docs/fit-for-purpose-evidence/20260307/health-t049-subA-latency-comparison.json`

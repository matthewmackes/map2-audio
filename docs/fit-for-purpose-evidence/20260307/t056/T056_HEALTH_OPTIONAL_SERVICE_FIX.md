# T056 Health Degraded False-Positive Fix (2026-03-07)

## Objective
- Remove false degraded status from `/api/health` when only optional orchestrator services are stopped.

## Root cause
- `app/routes/health.py` counted all orchestrator services equally.
- On this host, two services are intentionally stopped and marked optional:
  - `lcd_display`
  - `pipewire`
- Result before fix: `/api/health` returned issue `Only 13/15 orchestrator services are running` and `status=degraded`.

## Implementation
- Updated health aggregation logic to track:
  - `services_required_running`
  - `services_required_total`
  - `services_optional_running`
  - `services_optional_total`
- Degraded/critical status now keys off required services only.
- Added route test coverage for optional-stopped scenario in `tests/test_health_routes.py`.

## Validation
- Unit tests: `pytest -q tests/test_health_routes.py` -> `3 passed`.
- Runtime verification after backend restart:
  - `/api/health` now returns `status=healthy` with `issues=[]`.
  - `/api/services/status` confirms only optional services are stopped.

## Evidence files
- `health-after-fix.json`
- `services-status-after-fix.json`
- `pytest-health-routes.txt`

## Current state
- Platform remains in tuned analog mode (`period-size=64`, `period-num=2`, `headroom=0` on UA-1000 Pro nodes).
- Core MAP2 services remain active; health endpoint is now accurate for optional-service scenarios.

# T089 Engine Facade Refactor Validation

Date: 2026-03-10

## Scope

This validation covers the phase-1 route/service boundary extraction implemented for `T089`.

## What changed

- Added [engine_runtime_facade.py](/home/mm/map2-audio/app/services/engine_runtime_facade.py) as the stable route-facing boundary for engine access.
- Migrated [engine.py](/home/mm/map2-audio/app/routes/engine.py), [audio.py](/home/mm/map2-audio/app/routes/audio.py), and [latency.py](/home/mm/map2-audio/app/routes/latency.py) off direct `get_audio_engine()` imports.
- Replaced direct `service._engine` route access with the public `service.engine` compatibility accessor.

## Validation command

```bash
pytest tests/test_engine_runtime_facade.py tests/test_engine_route_facade_smoke.py -q && \
python3 - <<'PY'
import app.routes.audio
import app.routes.latency
print('route-import-smoke ok')
PY
```

## Result

- Status: PASS
- Tests passed: `4`
- Route import smoke: PASS

## Notes

- This is a phase-1 boundary extraction, not a full architecture cleanup.
- `app/routes/plugins.py` remains the next major engine-coupling hotspot identified for later decomposition.

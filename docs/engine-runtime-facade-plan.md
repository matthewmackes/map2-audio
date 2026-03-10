# Engine Runtime Facade Refactor Plan

This document records the phase-1 architectural extraction completed for `T089`.

## Problem

`T081-subD` found that too many route modules reach directly into `juce_engine_service` and, in several cases, into `service._engine`. That makes route modules responsible for low-level engine lifecycle assumptions instead of depending on a stable boundary.

## Phase 1 implemented here

The following route modules now depend on [engine_runtime_facade.py](/home/mm/map2-audio/app/services/engine_runtime_facade.py) instead of importing `get_audio_engine` directly:

- [engine.py](/home/mm/map2-audio/app/routes/engine.py)
- [audio.py](/home/mm/map2-audio/app/routes/audio.py)
- [latency.py](/home/mm/map2-audio/app/routes/latency.py)

The facade gives those routes a stable contract:

- `get_engine_service()`
- `require_engine_service()`
- `require_initialized_engine()`

The routes also stop peeking at `service._engine` directly and use the public `service.engine` compatibility accessor instead.

## Why this matters

This is not a full architecture rewrite. It is the first boundary extraction that turns direct singleton reach-through into an explicit service contract. That makes later work on engine lifecycle, testing, and replacement easier without changing every route again.

## Next phase after T089

The largest remaining hotspot is [plugins.py](/home/mm/map2-audio/app/routes/plugins.py), which still owns its own engine-operation queue and direct service access patterns. That should be the next extraction target, likely into a dedicated engine command facade or coordinator.

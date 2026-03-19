# API Route Readiness Matrix

Date: 2026-03-18
Owner: Codex
Related worklist item: `T209-subA`

## Purpose

This matrix defines the startup and warmup contract for load-tested API routes that must fail fast with a structured `503` response instead of hanging into client-side read/connect timeouts while dependencies are still warming up.

Common response shape:

- HTTP status: `503`
- `detail.code`: `API_ROUTE_NOT_READY`
- `detail.route`: route template for the guarded endpoint
- `detail.reason`: dependency-specific readiness reason
- `detail.issues[]`: human-readable warmup blockers
- `detail.required_services`: dependency state and health snapshot
- `Retry-After`: `2`

Helper implementation:

- `app/services/api_readiness.py`

## Matrix

| Route family | Guard | Required services | Readiness reason | Warmup blockers |
| --- | --- | --- | --- | --- |
| `/api/chains/` | `ensure_chain_route_ready()` | `database` | `chain_store_warming` | service orchestrator not running, database service not in `running` or `ready`, database health check failed |
| `/api/chains/{id}` | `ensure_chain_route_ready()` for startup plus transient `503` fallback | `database` | `chain_store_warming`, `chain_lookup_temporarily_unavailable` | same startup blockers as chain list; transient lookup timeout or unavailable backing session when no cache is usable |
| `/api/chains/{id}/activate` | `ensure_chain_route_ready()` for startup plus transient `503` fallback | `database` | `chain_store_warming`, `chain_activation_temporarily_unavailable` | same startup blockers as chain list; transient activation timeout or unavailable backing session |
| `/api/chains/{id}/deactivate` | `ensure_chain_route_ready()` for startup plus transient `503` fallback | `database` | `chain_store_warming`, `chain_deactivation_temporarily_unavailable` | same startup blockers as chain list; transient deactivation timeout or unavailable backing session |
| `/api/plugins/discover` | `ensure_plugin_route_ready()` | `database`, `plugin_loader` | `plugin_inventory_warming` | service orchestrator not running, database unavailable, plugin loader not in `running` or `ready`, plugin scan state in `starting`, `warming`, `unknown`, or `error` |
| `/api/plugins/list` | `ensure_plugin_route_ready()` | `database`, `plugin_loader` | `plugin_inventory_warming` | same blockers as plugin discovery |
| `/api/plugins/load` | `ensure_plugin_route_ready()` | `database`, `plugin_loader` | `plugin_inventory_warming` | same blockers as plugin discovery |
| `/api/plugins/unload` | transient `503` fallback from route/service path | route-specific lifecycle state | `plugin_unload_temporarily_unavailable` | plugin lifecycle state unavailable during restart or transient engine/session timeout |
| `/api/plugins/batch/parameters` | `ensure_plugin_route_ready()` | `database`, `plugin_loader` | `plugin_inventory_warming` | same blockers as plugin discovery |
| `/api/audio/status` | `ensure_audio_route_ready()` | `juce_engine` | `audio_engine_warming` | service orchestrator not running, JUCE engine not in `running` or `ready`, engine reports unavailable, engine reports not running, JUCE health check failed |
| `/api/audio/latency` | `ensure_audio_route_ready()` | `juce_engine` | `audio_engine_warming` | same blockers as audio status |
| `/api/audio/levels` | `ensure_audio_route_ready()` | `juce_engine` | `audio_engine_warming` | same blockers as audio status |
| `/api/audio/levels/plugins` | `ensure_audio_route_ready()` | `juce_engine` | `audio_engine_warming` | same blockers as audio status |
| load-tested websocket entry points | readiness-aware backend startup contract plus traffic-gate startup ordering | `websocket_manager`, traffic-gate base services from orchestrator | startup-order and `/api/ready` contract under `T209-subB` and `T221` | websocket broker not ready, traffic-gate services incomplete, backend not yet accepting traffic |

## Regression Coverage

Focused automated coverage lives in:

- `tests/test_api_route_readiness.py`
  - chain startup `503` contract
  - plugin-loader warmup `503` contract
  - JUCE engine warmup `503` contract
  - guarded route behavior for `/api/audio/status`, `/api/chains/{id}/activate`, and `/api/plugins/load`
  - transient lifecycle fallback coverage for `/api/chains/{id}` and `/api/chains/{id}/activate`

Related supporting coverage:

- `tests/test_health_routes.py`
- `tests/test_service_routes.py`
- `tests/test_plugins_residency.py`
- `tests/test_t209_api_load_qualification.py`

## Notes

- This matrix is scoped to the startup and warmup failure modes identified in the 2026-03-07 reliability review.
- Restart-safe traffic acceptance rules for `/api/ready` and `/api/services/startup-order` were refined later under `T209-subB` and `T221`; those items build on this baseline route-readiness contract rather than replacing it.

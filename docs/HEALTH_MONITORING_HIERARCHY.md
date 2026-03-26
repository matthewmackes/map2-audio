# Health Monitoring Hierarchy

This document records the current steady-state health ownership in MAP2 after
the `/api/health` aggregation moved into `app/services/system_health_summary.py`.

## Public Health Entry Points

- `GET /api/health`
  - Route: `app/routes/health.py`
  - Service: `app/services/system_health_summary.py`
  - Role: top-level local-node health payload for operators and UIs.
- `GET /api/node/health`
  - Route: `app/routes/nodes.py`
  - Service: `app/services/node_health_service.py`
  - Role: typed local/remote node snapshot for the node display contract.
- `GET /api/deployment/health*`
  - Route: `app/routes/deployment_health.py`
  - Service: `app/services/deployment_health.py`
  - Role: deployment-mode readiness, failure, and remediation checks.
- `GET /api/cluster/health*`
  - Route: `app/routes/cluster_health.py`
  - Services: heartbeat/visibility stack plus cluster services
  - Role: cluster-wide online/offline and heartbeat visibility.

## Steady-State Service Layers

1. `app/services/health_monitor.py`
   - Base service-level monitor for status, metrics, alerts, and history.
   - Audio monitoring registers into this layer instead of bypassing it.
2. `app/services/audio_health_monitor.py`
   - Audio-specialized monitor for XRuns, thread state, latency, and signal health.
   - Feeds the shared `health_monitor` and exposes richer audio summaries.
3. `app/services/node_health_service.py`
   - Builds the typed node-health payload used by local and remote node views.
   - Pulls CPU/memory/process data and folds in audio-health state.
4. `app/services/deployment_health.py`
   - Owns deployment-mode checks such as network, SSH, database, mDNS, and audio prerequisites.
5. `app/services/system_health_summary.py`
   - Canonical local aggregator for `/api/health`.
   - Composes `health_monitor`, `audio_health_monitor`, `node_health_service`,
     `deployment_health`, performance metrics, and MIDI-cluster state into one payload.
6. `app/services/cluster/health_aggregator.py`
   - Management-plane aggregation of per-node metrics, health scores, and history.
   - Used for cluster dashboards and admin summaries, not as the local `/api/health` source.

## Specialty Health Modules

- `app/services/plugin_health.py`
  - Per-plugin runtime safety and failure tracking, surfaced through audio/dashboard flows.
  - Not a top-level node or deployment aggregator.
- `app/services/cluster/post_update_health.py`
  - Phased post-update validation and rollback decisions.
  - Operationally important, but scoped to update workflows rather than steady-state health.

## Cleanup Decision

`app/services/health_checker.py` was a legacy circuit-breaker helper with no live
imports in the current app or test suite. It has been removed.

The active replacement path is:

- circuit-breaker behavior: `app/services/circuit_breaker.py`
- public local health aggregation: `app/services/system_health_summary.py`

This keeps the health stack centered on the current service and route graph
instead of preserving an unreferenced parallel helper.

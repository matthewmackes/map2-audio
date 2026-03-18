# API Restart Dependency Map

This document records the backend-side startup sequencing used to decide when MAP2 is safe to accept API and WebSocket traffic after a controlled restart.

## Base Traffic Gates

The backend is considered "accepting traffic" only after these orchestrator services are running:

- `database`
- `command_queue`
- `websocket_manager`

These are the minimum gates for stable HTTP state access plus WebSocket session establishment. Route families with additional warmup requirements continue to apply their own readiness checks on top of this base gate.

## Dependency Levels

The service orchestrator computes startup in dependency levels so services in the same level can start in parallel:

1. Level 1: services with no unresolved internal dependencies
2. Level N: services whose dependencies were satisfied by earlier levels

The live dependency map is exposed at:

- `GET /api/services/startup-order`

That route now includes:

- ordered startup and shutdown sequences
- per-service dependency level
- dependent-service fanout
- traffic-gate membership
- startup progress counts

## Readiness Contract

`GET /api/ready` now distinguishes between:

- `ready`: critical-service health state
- `accepting_traffic`: critical-service health plus the base traffic gates above

This keeps restart diagnostics explicit: a node may be partially started, but it is not considered safe for load qualification until the traffic gates are up.

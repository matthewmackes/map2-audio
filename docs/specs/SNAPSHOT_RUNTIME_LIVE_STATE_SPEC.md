# Snapshot Runtime Live-State And Synchronization Spec

Last updated: 2026-03-30

## Purpose

This document defines the authoritative contract for snapshot activation, runtime live-state, divergence detection, and cluster synchronization across MAP2 nodes.

The core rule is strict:

- The node-local realtime process is the only authority for whether a snapshot is actually `Live`.
- Backend and GUI may represent request intent, audit history, and divergence, but they must not promote any snapshot to `Live` without runtime confirmation.

## Scope

This spec covers:

- Snapshot activation from GUI `Make Live` and MIDI Program Change.
- Node-scoped runtime live-state projection.
- Runtime freshness and stale/offline display rules.
- Canonical snapshot normalization and revision hashing.
- Activation audit retention.
- Cluster read aggregation.
- Compatibility behavior for legacy snapshot APIs and GUI surfaces.

This spec does not require legacy JUCE slot stores to remain authoritative.

## Core Model

### Configuration vs runtime truth

The platform must treat these as different models:

- Persisted snapshot configuration:
  - Durable, versionable, shareable between nodes.
- Runtime truth:
  - Node-local, ephemeral, authoritative for actual live audio state.
- Divergence:
  - A node-local comparison between a saved snapshot revision and the node’s current live copy.

### Per-node live ownership

- Each node may run exactly one live snapshot at a time.
- The same snapshot revision may be live on multiple nodes at once.
- One node must never override another node’s reported runtime truth.

## State Definitions

### Runtime steady states

Authoritative runtime steady states are intentionally narrow:

- `live`
- `stopped`

### GUI display states

The GUI derives operator-facing display states from runtime truth freshness:

- `live`
  - Last authoritative runtime event is younger than 10 seconds.
- `live_warning`
  - Snapshot is still considered live, but the last authoritative runtime event is 10 seconds old or more.
- `offline`
  - Snapshot must no longer render as live once the last authoritative runtime event is 15 seconds old or more.
- `stopped`
  - The node reports no live snapshot.

### Intent vs truth

Activation intent is not live truth.

- `requested`
  - Audit/intention only.
- `live`
  - Runtime confirmed.
- `failed`
  - Runtime failed the activation and the node is `stopped`.

## Canonical Revision Contract

Backend owns the canonical normalization algorithm.

The normalization pipeline is:

1. Convert the snapshot into the normalized logical payload.
2. Strip unique or transient fields.
3. Canonicalize ordering and field layout.
4. Serialize deterministically.
5. Compute `snapshot_revision` as SHA-256 of the canonical payload.

Normalization excludes transient or unique fields such as:

- runtime ids
- timestamps
- callback-instance uniqueness
- transient engine bookkeeping

Divergence is determined by exact equality of the canonical normalized payloads.

## Message Contracts

### ActivationIntent

Produced by backend when activation is requested.

```json
{
  "request_id": "string",
  "node_id": "string",
  "snapshot_id": 123,
  "snapshot_revision": "sha256",
  "triggered_by": "ui | midi_pc",
  "requested_at": "ISO-8601",
  "normalized_snapshot_payload": {}
}
```

### NodeLiveRuntimeState

Published by the node runtime projection as websocket events and returned by REST.

```json
{
  "node_id": "string",
  "seq": 42,
  "emitted_at": "ISO-8601",
  "state": "live | stopped",
  "snapshot_id": 123,
  "snapshot_revision": "sha256 | null",
  "snapshot_name": "string | null",
  "triggered_by": "ui | midi_pc | null",
  "live_snapshot_payload": {},
  "last_successful_request_id": "string | null",
  "failure_reason": "string | null",
  "runtime_metrics": {},
  "warning_threshold_seconds": 10,
  "offline_threshold_seconds": 15,
  "age_seconds": 1.2,
  "is_warning": false,
  "is_offline": false,
  "display_state": "live | live_warning | offline | stopped",
  "display_label": "Live"
}
```

Rules:

- `seq` must be monotonic per node.
- Consumers must ignore stale or out-of-order updates.
- `live_snapshot_payload` is the node’s authoritative live copy.
- `runtime_metrics.retained_runtime_edits`, when present, is a bounded oldest-first audit list of retained live-edit compatibility mutations that updated the currently live snapshot outside canonical activation.

### NodeActivationAuditEvent

Durable per-node activation audit record.

```json
{
  "id": 1,
  "node_id": "string",
  "request_id": "string",
  "snapshot_id": 123,
  "snapshot_name": "string | null",
  "snapshot_revision": "sha256 | null",
  "triggered_by": "ui | midi_pc | null",
  "requested_at": "ISO-8601",
  "confirmed_live_at": "ISO-8601 | null",
  "outcome": "requested | success | failed",
  "failure_reason": "string | null",
  "activation_latency_ms": 12.5,
  "runtime_metrics": {}
}
```

Retention:

- Keep the last 100 activation events per node.
- Use an in-memory hot cache for reads.
- Keep the database as the durable audit source.

## API And Event Surface

### Compatibility alias

Existing snapshot activation routes remain valid:

- `POST /api/snapshots/{snapshot_id}/activate`
- `POST /api/snapshots/program-change/{program_number}/activate`

These routes now create activation intent and only become live after runtime confirmation.

### Runtime state reads

- `GET /api/runtime/live-state`
- `GET /api/runtime/live-state?node_id={node}`
- `GET /api/cluster/runtime/live-state`
- `GET /api/runtime/activation-events?limit=100`
- `GET /api/runtime/activation-events?node_id={node}&limit=100`

### Websocket topics

- `snapshot_runtime_live_state`
- `snapshot_activation_events`

## Activation Flow

1. Operator presses `Make Live` or MIDI Program Change selects a snapshot.
2. Backend loads the snapshot and computes the canonical `snapshot_revision`.
3. Backend records an `ActivationIntent`.
4. Runtime stages and applies the snapshot.
5. On success, runtime projection publishes one authoritative `live` update.
6. On failure, runtime projection publishes `stopped` with failure metadata.
7. GUI and cluster views update from runtime truth only.

## GUI Rules

### Live badge

- GUI must not show `Live` from cached snapshot summaries alone.
- GUI must render local and cluster live status from `NodeLiveRuntimeState`.

### Dirty / divergence

- `unsaved live divergence` is node-local.
- Divergence must compare canonical normalized payloads, not runtime ids.
- Saving a diverged live copy must create a new snapshot.

### Freshness

- After 10 seconds without a fresh runtime event:
  - render `Live (warning)`
- After 15 seconds without a fresh runtime event:
  - stop rendering the snapshot as live
  - render `Offline`

### Activation history

- GUI should expose the last 100 activation events per node.

## Cluster Rules

- Cluster deployment metadata is not authoritative live truth.
- Cluster aggregation must consume node-published runtime truth.
- Nodes publish local truth independently.
- Failure on one node does not alter live truth on other nodes.

## Compatibility Rules

Legacy fields remain available for transition support:

- `Snapshot.is_active`
- `Snapshot.activated_at`
- `Snapshot.live_state_payload`

These are compatibility projections only. They are not the source of truth for cluster-aware live state.

## Validation Requirements

Required automated validation:

- Same logical snapshot yields the same `snapshot_revision` after transient-field stripping.
- GUI and MIDI PC flow through the same activation pipeline.
- Runtime confirmation is required before live promotion.
- Activation failure leaves the node `stopped`.
- Warning threshold begins at 10 seconds.
- Offline threshold begins at 15 seconds.
- Out-of-order node updates are ignored.
- Same snapshot revision may be live on multiple nodes.
- Last 100 activation events are retained per node.

## Current Implementation Notes

The current repository implementation includes:

- node-scoped runtime live-state storage
- activation intent and audit persistence
- canonical snapshot normalization and revision hashing
- REST and websocket runtime state contracts
- compatibility projection updates
- GUI migration to runtime-driven live badges, divergence checks, and activation history
- cluster read aggregation from node runtime endpoints

Future improvements may move more of the confirmation and metric publication directly into lower-level realtime callbacks, but that does not change the contract defined here.

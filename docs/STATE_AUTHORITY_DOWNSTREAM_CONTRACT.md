# State Authority Downstream Contract

This document closes `T778-subD` by recording the downstream rules that future Brain and snapshot work must follow after the State Authority cutover.

## Canonical Snapshot Truth

- Persisted snapshot authority lives in `snapshots.document`.
- `snapshot_revisions.document` is the durable revision history for that same graph-document model.
- `state_authority_assets` is the durable hash-to-path registry for content-addressed loader assets.

New snapshot or Brain work must start from those State Authority artifacts, not from the compatibility projection rows.

## Compatibility Boundaries

The following remain compatibility-only projection tables:

- `snapshot_chains`
- `snapshot_channels`
- `snapshot_chain_plugins`
- `snapshot_loop_insertions`
- `snapshot_routing`
- `snapshot_midi_maps`

They still exist because some runtime and HTTP compatibility surfaces consume them, but they are no longer the contract future work should extend.

## Approved Service Entry Points

Use these services directly when extending State Authority behavior:

- `StateAuthorityDocumentService` for graph-document persistence and restoration
- `StateAuthorityRevisionService` for revision ownership
- `StateAuthorityActivationService` for activation/runtime orchestration
- `AudioStateAuthorityService` for committed/desired/observed control-plane state
- `PerformanceBrainAuthoritySyncService` for scoped Brain restore and authority projection sync

Avoid adding new authority behavior to:

- `SnapshotService.to_legacy_snapshot_data()`
- raw `snapshot_*` table reads as a source of truth
- route-local runtime residue that bypasses committed/desired authority state

## Performance Brain Contract

- Scoped Brain state must restore from authority projections before local file caches.
- Brain authority restore must merge committed and desired authority projections when selecting the runtime restore payload.
- Snapshot activation and desired-state republishes must preserve unrelated authority extensions unless the snapshot payload explicitly replaces that namespace.

Future Brain work should therefore extend `PerformanceBrainAuthoritySyncService` and the audio-state authority pipeline instead of inventing a second persistence layer or file-first fallback path.

## Legacy Payload Adapter Rule

`SnapshotService.to_legacy_snapshot_data()` remains allowed only as a compatibility adapter for existing runtime and MIDI bridges that still expect the old flow-snapshot shape.

Do not:

- add new operator-facing contracts that consume this legacy shape
- use it as the source for persisted snapshot truth
- route new Brain or authority features through it to avoid touching the State Authority services

## Remaining Follow-On Risk

Full retirement of the compatibility projection tables is still blocked until the remaining compatibility consumers stop depending on them. That retirement is a follow-on cleanup problem, not a license to treat those tables as authoritative again.

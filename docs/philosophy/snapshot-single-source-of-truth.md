# Philosophy — Snapshot Single Source of Truth

> **Audience:** Anyone modifying state, persistence, or the runtime engine.
> **Scope:** Why MAP2's Snapshot subsystem is the *only* representation of audio state, how the State Authority enforces that, and how runtime, persistence, and the editor stay coherent.

## 1. The thesis

There is exactly one canonical representation of "what the audio engine is doing": a **graph document** owned by the State Authority. Every other surface — the JUCE engine's live parameter values, the React editor, the database row, the WebSocket fan-out, the cluster peer's mirror — is *derived from* that document. Nothing is allowed to drift sideways.

This is a strong claim. It rules out:

- Sticky UI state that survives a snapshot reload but isn't in the snapshot.
- Engine-side parameter values that have no representation in the document.
- Per-device databases that hold "the real" routing while the snapshot lags.

If a piece of state matters to the sound, it lives in the graph document. If it doesn't, it doesn't get persisted at all.

## 2. The data model

A snapshot is a JSON document validated against schema version `2026.04` (`app/services/state_authority_graph.py`, `SNAPSHOT_GRAPH_SCHEMA_PATH`). It has four blocks:

| Block | Holds |
|---|---|
| `meta` | name, description, tags, community metadata, I/O bindings |
| `graph` | channels, chains, plugin nodes, routing/morph configuration, MIDI map, tempo, audio levels |
| `controls` | monitoring outputs, automation lanes, expression mappings |
| `extensions` | vendor-specific payloads (kept additive so old snapshots load) |

Persistence is in SQLite (WAL enabled, `app/database.py`). The `Snapshot` ORM row stores the full `document` JSON plus a few denormalized columns (`controls_payload`, `extensions_payload`, `live_state_payload`) and — critically — a `version` column used as an **optimistic-concurrency token**. Routes accept an `If-Match` header and reject stale edits with `412 Precondition Failed`. Two operators editing the same snapshot cannot both win silently.

Revisions are kept in `snapshot_revisions` (capped at 100 per snapshot via `MAX_SNAPSHOT_REVISIONS`), monotonically numbered, and each row carries the full document at that revision. Rollback is "load revision N's document"; no diff replay is involved.

Asset references (NAM models, IRs) point into `state_authority_assets`, indexed by SHA-256 content hash so the same impulse response under two names is one stored blob.

## 3. The State Authority stack

Three services own the lifecycle:

```
StateAuthorityDocumentService    → Owns the document. Atomic versioned writes.
                                   document_to_normalized() handles legacy versions.

StateAuthorityActivationService  → Drives the activation FSM:
                                   VALIDATING → STAGING → APPLYING → VERIFYING → LIVE

SnapshotRuntimeStateService      → Projects per-node live state.
                                   Broadcasts on RUNTIME_LIVE_STATE_TOPIC.
```

Activation compiles a document into a `CompiledSnapshotIntent` (see `audio_state_snapshot_compiler.py`). The intent carries `snapshot_id`, `revision_id`, and deployment preferences and is the *only* thing handed to the JUCE runtime. The engine never reads the document directly; it reads the intent. This separation is what allows the same snapshot to land on multiple cluster nodes safely — each node confirms its own activation phase, and the document is never mutated by a confirmation.

## 4. How the engine and frontend stay in sync

The flow is one-way:

```
edit → mutate document → bump version → write revision
                                   ↓
                     compile to CompiledSnapshotIntent
                                   ↓
                  StateAuthorityActivationService apply
                                   ↓
                  juce_engine_service applies parameters
                                   ↓
                  SnapshotRuntimeStateService records phase
                                   ↓
                  WebSocket → live_snapshot_payload → UI
```

The frontend hooks `useSnapshotLive` and `useSnapshotPinDetails` subscribe to `live_snapshot_payload` and re-render against it. A recent fix (commit `9750ce1f` — "re-sync `live_snapshot_payload` after plugin mutations") tightened exactly this loop: when the engine mutates a plugin, the runtime payload is rebroadcast so the editor never shows a value the engine no longer holds.

The editor's `SnapshotPreloadSlotsPanel` is a good example of the discipline: preload pins live in `special_settings.snapshot_preload_pins` *inside the document*. Pinning a snapshot is a document mutation, not a UI-only flag.

## 5. Activation is all-or-nothing

`ACTIVATION_PHASES` in `snapshot_runtime_state_service.py` are gates, not advisory states. A snapshot is `LIVE` only when every node confirms `VERIFYING → LIVE`. Failure at any phase reverts to the previously-live snapshot — there is no "partially applied" state visible to operators.

This matters in two places:

- **Cluster deployments.** A snapshot is live cluster-wide or it is not live. There is no "live on three nodes, applying on the fourth" surface in the UI.
- **Hot recall.** Parameters flow through the parameter bridge's smoothing layer (see *Audio Artifact Management*), so an all-or-nothing apply does not mean a click — the value targets change atomically while the bridge ramps.

## 6. Why etcd backs the document

`AudioStateAuthorityService` defaults to etcd v3 KV under `/map2/audio-state/v1`. Three reasons:

1. **Compare-and-swap as a primitive.** etcd's CAS aligns with the optimistic-concurrency token; no application-layer locking needed.
2. **Watches.** Cluster peers subscribe to document changes natively — no bespoke replication protocol.
3. **Bounded recovery.** A node that boots into an existing cluster reads the current document and the last revision in one round trip.

The SQLite layer is the local mirror, not the truth. The truth is whatever the State Authority KV returns, and that is the value the activation FSM compiles.

## 7. What this rules out (deliberately)

- **Engine-side persistence.** The JUCE engine has no on-disk parameter store. If you can't see it in the document, it isn't real.
- **UI-only "session" state for sound parameters.** The editor can hold scratch UI state (collapsed panels, selected tabs), but anything that affects the sound is a mutation against the document.
- **Sideband databases for routing.** AVB routes, MIDI maps, mod-matrix entries all live inside the document's `graph` and `controls` blocks.
- **Implicit defaults.** Missing fields are filled by the schema's `default`, not by engine code, so the document fully describes the intent.

## 8. Migrations and forward compatibility

`document_to_normalized()` is the controlled entry point for older snapshot versions. Schema changes are *additive by default*: new fields land in `extensions` first, get promoted into `graph` or `controls` only after a migration is written, and the schema version bumps. A snapshot from a previous platform release loads, normalizes, and re-saves at the current version; nothing is lost in either direction during a one-version skew.

## 9. Operator implications

- A reload is always safe. Whatever you see after `LIVE` is exactly the document.
- A diff between two snapshots is a JSON diff of two documents — no engine introspection needed.
- A cluster failover is a re-activation against the same document on a different node; there is nothing to "transfer".
- A bug report can almost always be reproduced from the snapshot ID alone.

## 10. Where to read next

- `.claude/plans/keen-growing-tome.md` — the original State Authority plan with the full set of locked decisions.
- `app/services/state_authority_graph.py` — the schema constants.
- `app/services/state_authority_activation_service.py` — the FSM.
- `app/services/snapshot_runtime_state_service.py` — runtime projection and broadcast.
- `docs/design/CARBON_CONFORMANCE_STANDARD.md` §10 — operator-state discipline (T2474). The Snapshot Editor consumes the canonical `--map2-state-*` token group (live / staged / uncommitted / committed) for the live-vs-staged distinction and the `LiveStagedToggle`, `StagedChangesIndicator`, and `CommitPrompt` primitives at `web/src/app/components/primitives/` for apply/discard affordances. The editor's previous glass-drawer toolbars were migrated to flat Carbon surfaces in T2474 B10; future editor work must consume these primitives rather than re-rolling local equivalents.
- `docs/design/CARBON_CONFORMANCE_STANDARD.md` §8 (Unified Channel Grid) — the canonical Snapshot Editor signal-flow surface. Predates T2474 and remains the authority for plugin-block layout / category hue system / FX icon registry.

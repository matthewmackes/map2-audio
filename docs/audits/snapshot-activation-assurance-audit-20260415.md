# Snapshot Activation Assurance Audit

Updated: 2026-04-15 19:02 EDT  
Status: `T2295` audit complete. Implementation evidence reviewed against the current shipped code.

## Scope

- Included:
  - `app/services/state_authority_activation_service.py`
  - `app/services/snapshot_service.py`
  - `app/services/snapshot_runtime_state_service.py`
  - `app/services/audio_state_authority.py`
  - `app/services/publish_readiness_service.py`
  - `app/routes/unified_snapshots.py`
  - `app/routes/audio_state.py`
  - focused regressions in `tests/test_snapshot_service.py`, `tests/test_snapshot_runtime_state_progress.py`, `tests/test_publish_readiness_service.py`, and `tests/test_state_authority_activation_service.py`
- Excluded:
  - host-level crash injection, multi-process chaos, and distributed etcd failure drills. Those remain follow-on qualification work under `T2298`.

## Executive Summary

- The current canonical activation path is `POST /api/snapshots/{id}/activate` -> `StateAuthorityActivationService.activate_snapshot()` -> runtime intent/event pipeline in `SnapshotRuntimeStateService` -> post-confirm authority publish in `SnapshotService._publish_confirmed_live_state_to_audio_authority()`.
- This path now records activation intent phases, durable activation events, runtime live-state, typed node/channel confirmations, and a post-runtime authority confirm step. That is a meaningful improvement over the previous desired-state-only behavior.
- The platform is still not rock-solid enough to claim strict committed-snapshot activation integrity.
- The main reason is not the happy path. The main reason is that runtime live-state, authority state, and live snapshot edits can still diverge through non-canonical mutation paths and through post-confirm failure windows that are logged but not surfaced as explicit degraded state.

## Verdict Matrix

| Area | Verdict | Evidence-backed reason |
| --- | --- | --- |
| Commitment integrity | `PARTIAL` | Activation intent, runtime live-state, and durable activation events are recorded consistently, but authority confirmation is still a best-effort follow-on step rather than an atomic part of runtime confirmation. |
| Activation-path exclusivity | `FAIL` | Multiple non-canonical paths mutate live runtime payloads and/or desired authority outside the committed activation flow. |
| Authority-update correctness | `PARTIAL` | The shipped `_publish_confirmed_live_state_to_audio_authority()` now writes desired + committed + observed after runtime confirmation, but exceptions are swallowed and no degraded contract is emitted if that publish fails. |
| Runtime-authority lock-step guarantee | `FAIL` | `confirm_live_intent()` marks the node live before authority publish completes, so runtime can still be live while authority remains stale or incomplete. |
| Operator feedback quality | `PARTIAL` | Preflight, stale-observation, confirmation, and divergence feedback are typed and strong; post-confirm authority failures and live-edit drift still collapse into silent log-only outcomes. |
| Auditability | `PARTIAL` | `SnapshotActivationEvent` plus phase history and runtime metrics are durable, but there is no explicit audit event stating whether authority desired/committed/observed publication succeeded or failed after runtime confirmation. |
| Concurrency safety | `PARTIAL` | The runtime path is phased and auditable, but no explicit activation lock/CAS guarantee proves correctness under overlapping activation requests. |
| Recovery safety | `PARTIAL` | Health refresh and reconciliation exist, but crash windows between runtime-live confirmation and authority publication are still real and not yet qualified. |

## Canonical Activation Sequence

1. `app/routes/unified_snapshots.py` routes `POST /api/snapshots/{id}/activate` into `StateAuthorityActivationService.activate_snapshot()`.
2. `StateAuthorityActivationService.activate_snapshot()` computes the normalized snapshot revision and creates an activation intent through `SnapshotRuntimeStateService.create_activation_intent()`.
3. The service runs preflight validation and records `VALIDATING`, `STAGING`, `APPLYING`, and `VERIFYING` phases through `mark_intent_phase()`.
4. Runtime staging/materialization and engine apply happen before the node is marked live.
5. `SnapshotRuntimeStateService.confirm_live_intent()` records local node live-state and marks the activation event successful.
6. The shipped follow-on step `SnapshotService._publish_confirmed_live_state_to_audio_authority()` republishes desired state, writes committed state, writes a node observation, then calls `AudioStateAuthorityService.reconcile_committed_state()`.
7. Post-confirm hook updates and websocket broadcasts refresh the live payload and controller-side projections.

## Source-Of-Truth Inventory

- Persisted snapshot definition:
  - `snapshots.document` / revision history behind `SnapshotService`
- Node-local runtime truth:
  - `SnapshotNodeLiveState` via `SnapshotRuntimeStateService`
- Durable activation audit trail:
  - `SnapshotActivationEvent`
- Control-plane desired/committed/observed state:
  - etcd-backed `AudioStateAuthorityService`
- Compatibility surfaces still influencing behavior:
  - snapshot relational projection rows
  - live snapshot payload sync helpers in `SnapshotService`
  - route-local authority writes in `app/routes/audio_state.py`

## What Is Strong Today

- The canonical GUI/MIDI activation route uses one orchestrator: `StateAuthorityActivationService.activate_snapshot()`.
- Activation progress is explicit and durable:
  - phase history
  - blockers
  - warnings
  - node confirmations
  - channel confirmations
- Runtime live-state is node-local and freshness-aware in `SnapshotRuntimeStateService`.
- Publish-readiness already detects several important failure families:
  - preflight blockers
  - stale/missing node observations
  - runtime-vs-authority divergence
  - retry-publish repair affordances
- The shipped regression `test_activate_snapshot_confirms_audio_authority_after_runtime_live` now locks the intended happy-path ordering more tightly than before.

## Confirmed Gaps

### 1. Authority publication is still post-confirm and best-effort

- `SnapshotRuntimeStateService.confirm_live_intent()` marks the node `live` before `_publish_confirmed_live_state_to_audio_authority()` runs.
- `_publish_confirmed_live_state_to_audio_authority()` catches all exceptions and only logs a debug message.
- Result:
  - the runtime can report success while authority desired/committed/observed state is stale, partial, or missing.
  - no explicit degraded state is emitted when that happens.

### 2. Non-canonical live mutation paths still exist

The following paths can mutate live runtime payloads and sometimes desired authority outside the canonical activation workflow:

- `SnapshotService.update_snapshot(...)`
  - syncs live payload and runtime-adjacent bindings when editing the live snapshot.
- `SnapshotService.update_channel(...)`
  - syncs live payload, applies channel-state runtime changes, then republishes desired authority.
- `SnapshotService.update_plugin_parameter_by_position(...)`
  - syncs the live payload for the currently live snapshot.
- `SnapshotService.update_routing(...)`
  - syncs live payload, applies routing/morph to runtime, then republishes desired authority.
- `SnapshotService.replace_midi_map(...)`
  - syncs live payload and pushes runtime MIDI-map changes.
- `ChainService.activate_chain(...)`
  - updates live path/runtime chain projections and resyncs live snapshot payload.
- `app/routes/audio_state.py:/snapshots/{snapshot_id}/activate`
  - writes desired + committed authority directly without going through runtime activation confirmation.

These paths may be intentional operator-edit surfaces, but they prove the current system does not yet enforce one committed activation gate.

### 3. Route-level authority activation bypass remains open

- `POST /api/audio-state/snapshots/{snapshot_id}/activate` builds and writes committed authority directly.
- It does not require runtime confirmation from `SnapshotRuntimeStateService`.
- It therefore bypasses the same canonical activation contract that the main snapshot route now tries to enforce.
- This is the clearest single exclusivity violation in the current codebase.

### 4. Post-confirm hook failures are not modeled as degraded state

- After live confirmation, activation hooks and payload resyncs still run in a best-effort `try/except` block.
- Failures are logged and skipped, but the activation remains successful with no degraded contract emitted to operators.

### 5. Concurrency and crash safety are not yet proven

- The code is structured enough to support future qualification, but there is no evidence of:
  - overlapping activation request exclusion
  - authority publish retry/idempotency guarantees after a crash
  - restart-safe continuation when runtime apply succeeds but authority publish does not

## Failure-Feedback Matrix

| Failure family | Current state |
| --- | --- |
| Snapshot preflight invalid | Strong. Typed blockers and repair hints exist. |
| Runtime apply failure before live confirm | Strong. `fail_intent()` records blockers and failed confirmations. |
| Missing/stale node confirmation | Strong. `PublishReadinessService` escalates to `observation_stale` and exposes `retry_publish`. |
| Runtime-authority disagreement | Medium-strong. `authority_diverged` is detected in readiness. |
| Runtime live but authority publish failed after confirmation | Weak. No typed degraded/drift contract is emitted today. |
| Live edit mutated runtime/desired outside canonical activation | Weak. No explicit degraded state or exclusivity barrier exists. |
| Reconciliation corrected drift after the fact | Medium. Metrics are recorded, but operator messaging is not yet first-class. |

## Audit Conclusion

- The current implementation is substantially improved and auditable on the happy path.
- It is not yet a rock-solid committed control-plane activation path.
- The decisive blockers are:
  - route-level and live-edit bypasses
  - post-confirm authority publication that can fail silently
  - missing explicit degraded/drift state when authority and runtime fall out of lock-step
  - unqualified crash/restart/concurrency behavior

## Required Follow-On Work

- `T2296`
  - inventory, gate, or retire all non-canonical runtime/authority mutation paths
  - explicitly decide which live-edit paths are allowed and how they preserve auditability
- `T2297`
  - make authority publication part of the canonical success contract instead of a silent best-effort follow-on
  - emit explicit degraded/drift state when runtime and authority disagree
- `T2298`
  - add crash/restart/concurrency qualification and fault-injection evidence
- `T2299`
  - promote post-confirm authority failures, degraded states, and reconciliation side effects to operator-grade contracts

## Evidence References

- Canonical activation orchestration:
  - `app/services/state_authority_activation_service.py`
- Runtime intent/live-state/audit event contract:
  - `app/services/snapshot_runtime_state_service.py`
- Authority desired/committed/observed storage:
  - `app/services/audio_state_authority.py`
- Post-runtime authority publication:
  - `app/services/snapshot_service.py`
- Route-level canonical activation:
  - `app/routes/unified_snapshots.py`
- Route-level bypass authority activation:
  - `app/routes/audio_state.py`
- Supporting regressions:
  - `tests/test_snapshot_service.py`
  - `tests/test_snapshot_runtime_state_progress.py`
  - `tests/test_publish_readiness_service.py`
  - `tests/test_state_authority_activation_service.py`

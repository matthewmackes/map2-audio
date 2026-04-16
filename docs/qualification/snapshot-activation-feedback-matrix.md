# Snapshot Activation Feedback Matrix

Last updated: 2026-04-16

This matrix is the operator-facing contract for `T2299`. It ties live publish-readiness blockers and activation outcomes to their machine-readable codes, correlation fields, remediation, and implementation surfaces.

## Correlation fields

Every direct activation or publish-repair response should expose:

- `request_id`: canonical activation request correlation id
- `node_id`: node that attempted the activation
- `result_code`: stable outcome code for the activation result
- `operator_message`: exact operator-safe summary
- `technical_detail`: implementation detail safe for diagnostics
- `recommended_action`: the next operator step
- `repair_action_id`: matching repair action when one exists
- `related_node_ids` / `related_path_ids`: scoped impact identifiers

The publish workspace should also show the latest activation-event `request_id`, `node_id`, `triggered_by`, and the current blocker code so operators can correlate the UI with logs and activation-event history.

## Publish-readiness blocker matrix

| Surface | Code | Guardrail / meaning | Operator message shape | Recommended remediation | Correlation fields |
| --- | --- | --- | --- | --- | --- |
| Publish readiness | `unsaved_draft` | No saved revision exists for this snapshot | Save before publishing | Save draft | Snapshot id |
| Publish readiness | `plugin_missing` | Required plugin unavailable on target node | Name the missing plugin/channel | Install or redeploy plugin | Related node/path ids |
| Publish readiness | `asset_missing` | Required model or IR asset missing | Name missing asset family | Restore asset | Related path ids |
| Publish readiness | `engine_unavailable` | Required runtime is stopped or offline | Distinguish local-only engine vs cluster runtime | Start/recover audio engine | Related node ids, repair action |
| Publish readiness | `observation_stale` | Confirmation window exceeded with no matching observation | Name the node still missing confirmation | Retry publish | Related node ids, repair action |
| Publish readiness | `authority_diverged` | Runtime and committed state disagree | Name runtime-vs-authority disagreement | Review diagnostics before retrying | Snapshot id, runtime snapshot mismatch |
| Publish readiness | `authority_confirmation_failed` | Runtime applied but authority confirmation did not complete | Keep this explicit even after stale timeouts | Retry publish | Request id from activation event, node ids, repair action |

## Activation outcome matrix

| Surface | Result code | Meaning | Operator message shape | Recommended remediation | Correlation fields |
| --- | --- | --- | --- | --- | --- |
| Direct activation / publish retry / publish repair | `live_confirmed` | Runtime applied and authority confirmation completed | Success confirmation | None | `request_id`, `node_id`, related scope ids |
| Direct activation / publish retry / publish repair | `authority_confirmation_failed` | Runtime applied but committed and/or observed authority publish failed | Explicit degraded authority-confirmation failure | `retry_publish` | `request_id`, `node_id`, `repair_action_id=retry_publish` |
| Direct activation / publish retry / publish repair | `authority_confirmation_unavailable` | Backend can refresh desired state but lacks committed/observed confirmation capability | Explicit degraded capability gap | `retry_publish` after backend recovery | `request_id`, `node_id`, `repair_action_id=retry_publish` |

## Implementation anchors

- Typed blocker and readiness enums: `app/models/audio_state.py`
- Publish-readiness derivation: `app/services/publish_readiness_service.py`
- Canonical activation result envelope and logs: `app/services/state_authority_activation_service.py`
- Publish retry / repair response passthrough: `app/routes/unified_snapshots.py`
- Web client activation response contract: `web/src/map2/clients/snapshots.ts`
- Publish workspace issue rendering: `web/src/app/pages/SnapshotPublishPage.tsx`

## Operator usage notes

- Use the blocker `code` plus latest event `request_id` as the primary correlation pair when escalating an issue.
- If the issue card shows `repair_action_id`, prefer that repair path over ad hoc retries.
- If `authority_confirmation_failed` is present, treat stale observation symptoms as secondary; the control-plane confirmation failure is the real blocking layer.
- If a publish repair succeeds, the same `request_id` and `node_id` fields returned by the mutation should be visible in logs and the latest activation-event stream.

# Snapshot Live Source-of-Truth Redesign Handoff

Date: 2026-04-10

Status: Design brief only. This handoff does not implement product changes.

Primary intent:
- The current snapshot live workflow still does not clearly answer the operator's core question: "What is required to make this live?"
- The next AI should replace the current live/progress/control/routing experience with a cleaner, source-of-truth-driven publish workflow for snapshots.

Primary source files:
- `app/models/audio_state.py`
- `app/services/audio_state_authority.py`
- `app/services/state_authority_activation_service.py`
- `app/routes/unified_snapshots.py`
- `web/src/map2/clients/snapshots.ts`
- `web/src/app/utils/snapshotGoLiveState.ts`
- `web/src/app/components/SnapshotEditor/SnapshotProgressModal.tsx`
- `web/src/app/components/SnapshotEditor/SnapshotChainManagementCard.tsx`
- `web/src/app/pages/SnapshotEditorPageContent.tsx`

Related completed work:
- `docs/PROJECT_WORKLIST.md` entries `T959` and `T960`

## Problem Statement

The current UI explains too much about the system pipeline and too little about operator readiness.

The operator should be able to answer these questions instantly:

1. What version of this snapshot am I editing?
2. What version is actually live right now?
3. What exact items must be fixed before this can go live?
4. What step is the system currently on?
5. If something failed, what exactly needs attention and what do I do next?

The current modal still exposes internal language such as `engine`, `pending apply`, `node sync`, and `waiting for the engine`, which forces the user to infer platform meaning instead of receiving a direct explanation.

## Source-of-Truth Model

The redesign must be built around the actual authority model already present in the codebase, not around transient editor state.

### Canonical State Layers

1. Snapshot draft
- The editable authored snapshot in the editor.
- This is the source of truth for authored intent.
- It is not proof that anything is live.

2. Publish intent
- The compiled runtime request generated from the snapshot.
- In code this aligns with `CompiledSnapshotIntent`.
- This is what the operator is asking the system to make live.

3. Committed authoritative audio state
- This is the control-plane source of truth for what the platform currently considers the requested live state.
- In code this aligns with `AuthoritativeAudioState` stored by `AudioStateAuthorityService`.
- This is the layer that should drive the main live/readiness UI.

4. Node observations
- These are per-node reports of what the runtime actually applied and observed.
- In code this aligns with `AudioStateObservation`.
- These confirm whether the committed request has actually materialized on the target node or cluster.

5. Effective live status
- This is a derived status composed from committed authoritative state plus current node observations.
- The UI must never infer "live" from draft state alone.

### Required Rules

- The primary live badge must come from committed authoritative state plus observations.
- Dirty draft state must never be shown as if it were live state.
- "Publish requested" and "Live confirmed" must be distinct statuses.
- Every blocker must be typed, scoped, and tied to a repair action when possible.
- Local routing and network-node routing must be treated as first-class blockers.

## Design Goal

Replace the current "Snapshot Progress" approach with a new operator-facing workflow that feels like a publish console, not a diagnostics dump.

Recommended product name:
- `Publish Snapshot`

Acceptable alternatives:
- `Live Readiness`
- `Go Live Console`
- `Snapshot Publish`

Preferred language:
- Primary action: `Publish to live`
- Dirty state action: `Save draft`
- Secondary combined action when helpful: `Save and publish`

Avoid:
- `Apply`
- `Pending apply`
- `Waiting for the engine`
- `Node sync`
- `Latest live activation`

Use instead:
- `Ready to publish`
- `Publish requested`
- `Blocked by...`
- `Live confirmed`
- `Out of sync`
- `Waiting for confirmation`

## New Operator Mental Model

The surface should always answer three things in this order:

1. `Current draft`
- What the editor currently contains.

2. `Requested live state`
- What the operator most recently asked the system to publish.

3. `Confirmed live state`
- What the runtime has actually confirmed as live.

Everything else is subordinate to those three frames.

## Proposed Product Shape

Do not keep growing the current modal. Recast this as a full-screen Carbon-standard publish workspace opened from the snapshot header/activity area and from any live-related entry point.

### Entry Rule

The publish workspace opens when:
- the operator clicks the channel activity indicator
- the operator clicks the live/publish control
- the operator clicks any readiness/blocker chip
- the operator opens routing/control workflows that affect publishability

### Consolidation Rule

The following old surfaces should be absorbed into this one workspace:
- snapshot progress modal
- control panel modal
- routing modal
- ad hoc live-status cards
- scattered live-fix actions

The operator should no longer have to guess which modal owns readiness versus routing versus live confirmation.

## Information Architecture

Use a clean hard-cut layout with two modes:

1. Guided
- Default mode
- One blocker at a time
- Explains what is required in plain language
- Promotes the next fix action only

2. Advanced
- Full topology, authority details, routing, node state, and diagnostics
- Still uses the same underlying source-of-truth model

### Top Summary Rail

Keep the top rail simple and authoritative:

- Snapshot name
- Draft status
- Requested live status
- Confirmed live status
- `Publish to live` action

Example summary copy:
- `Draft saved`
- `Publish requested 14 seconds ago`
- `Live confirmed on 2 of 3 channels`
- `Blocked by network routing`

### Required to Publish Panel

This is the first thing the operator should see in Guided mode.

Explicit checklist:
- Draft is saved
- Required plugins are installed on the target node
- Required models and IR files exist on the target node
- Audio input device is available
- Audio output device is available
- Monitoring output is valid
- Local routing is valid
- Network node routing is valid
- Target node is reachable
- Engine accepted the publish request
- Every required channel is confirmed live

Rules:
- Hide items that are truly not applicable.
- Show `Ready`, `Needs attention`, or `Waiting for confirmation`.
- If blocked, show the exact cause, not only the category.

### Guided Fix Panel

This is the heart of the redesign.

The system must walk the operator through one issue at a time.

Structure:
- `Issue X of Y`
- Plain-language title
- Exact cause
- Why it matters
- Primary fix action
- Secondary action
- Optional "show details" toggle

Example:

`Issue 1 of 2`

`Network routing needs attention`

`Channel B is assigned to node Rack-2, but Rack-2 has not confirmed this snapshot revision.`

`What to do: Review cluster assignment or move this channel to the local node before publishing again.`

Actions:
- `Fix routing`
- `Move to local node`
- `Retry publish`

### Draft vs Live Comparison

The current workflow does not clearly show whether the operator is changing the draft, the requested live state, or the confirmed live state.

Add a comparison section with three columns:
- `Draft`
- `Requested`
- `Confirmed live`

Show concise differences for:
- routing mode
- active paths
- assigned nodes
- input/output device selection
- plugin set and missing assets
- controller and tempo changes only if relevant to live behavior

This section should answer:
- "What changed?"
- "What still needs to be applied?"
- "What failed to confirm?"

### Flow Map

Keep a React Flow visualization, but downgrade it from centerpiece to support view.

It should explain the path to live, not dominate the UI.

Recommended ordered nodes:
- Draft
- Compile publish intent
- Plugin readiness
- Asset readiness
- Device readiness
- Local routing
- Network routing
- Publish request
- Node confirmation
- Channel confirmation
- Live confirmed

Rules:
- Every node must have a human-readable label.
- Clicking a node reveals its requirements and current blockers.
- Failed nodes must expose exact reasons, not just a red state.
- If a step is not relevant, collapse it instead of leaving dead visual noise.

## Blocker Taxonomy

Every publish blocker should be typed and machine-readable.

Minimum blocker set:
- `unsaved_draft`
- `snapshot_invalid`
- `plugin_missing`
- `asset_missing`
- `audio_input_missing`
- `audio_output_missing`
- `monitoring_output_invalid`
- `local_routing_invalid`
- `network_routing_invalid`
- `node_offline`
- `node_assignment_missing`
- `node_sync_pending`
- `engine_unavailable`
- `engine_apply_failed`
- `channel_unconfirmed`
- `observation_stale`
- `authority_diverged`

Each blocker should carry:
- `id`
- `scope`
- `severity`
- `title`
- `operator_message`
- `technical_detail`
- `recommended_action`
- `repair_action_id`
- `related_path_ids`
- `related_node_ids`

## Timeout and Escalation Rules

The existing 3-second escalation rule is correct and should stay.

After 3 seconds without confirmation:
- do not continue showing vague waiting language
- convert the current step into a typed blocker or `waiting for confirmation` state with exact detail
- prioritize the first unresolved blocker in Guided mode

Examples:
- `Waiting for confirmation from Rack-2`
- `Channel C did not confirm live on the local engine`
- `Output device Focusrite USB is not available on this node`

Avoid:
- `Channel A is waiting for the engine`

## Control and Routing Integration

The redesign must fully unify routing and control workflows under the publish workspace.

### Guided Path

Guided mode should only expose the next required action.

Examples:
- `Assign output device`
- `Fix local routing`
- `Fix network node routing`
- `Install missing plugin`
- `Restore missing NAM model`

### Advanced Path

Advanced mode should still let an expert operator edit:
- local input/output bindings
- monitoring output
- routing topology
- path-to-node assignment
- controller/runtime options that materially affect publishability

But the operator should never leave the publish workspace to understand whether the snapshot can go live.

## Recommended Screen Layout

### Left Column

- Summary rail
- Required to publish checklist
- Guided issue card
- Draft vs Requested vs Confirmed comparison

### Right Column

- Flow map
- Affected channels and nodes
- Inline repair tools for the selected blocker
- Advanced diagnostics drawer

### Bottom Utility Bar

- `Save draft`
- `Publish to live`
- `Retry publish`
- `View diagnostics`
- `Close`

## Copy Direction

The next AI should remove platform-internal jargon from the primary path.

Examples of better copy:

Instead of:
- `Node sync is Pending Apply`

Use:
- `Rack-2 has not confirmed this snapshot yet`

Instead of:
- `Engine confirmed the latest live activation`

Use:
- `The runtime confirmed the last publish request`

Instead of:
- `0 of 3 channels live`

Use:
- `No channels are confirmed live yet`

Better success copy:
- `Live on all 3 channels`

Better blocker copy:
- `Cannot publish until an output device is assigned`

## Data Contract Recommendations

The current frontend appears to assemble readiness from several partial structures. The redesign should move toward one explicit backend contract for publish readiness and one explicit contract for publish progress.

Recommended future payloads:

### `SnapshotPublishReadiness`

Fields:
- `snapshot_id`
- `draft_revision_id`
- `requested_revision_id`
- `confirmed_revision_id`
- `status`
- `requirements`
- `blockers`
- `warnings`
- `available_repairs`
- `applicable_steps`

### `SnapshotPublishSession`

Fields:
- `session_id`
- `snapshot_id`
- `requested_at`
- `requested_by`
- `compiled_intent_version`
- `authority_state_version`
- `request_status`
- `step_statuses`
- `node_confirmations`
- `channel_confirmations`
- `blockers`
- `warnings`

### `PublishRequirement`

Fields:
- `id`
- `label`
- `status`
- `scope`
- `operator_message`
- `technical_detail`
- `repair_actions`

These do not need to be implemented in this handoff task, but the next AI should use them as the design target.

## Source File Expectations For The Next AI

The next AI should expect most of the redesign work to center on:

- `web/src/app/components/SnapshotEditor/SnapshotProgressModal.tsx`
- `web/src/app/components/SnapshotEditor/SnapshotChainManagementCard.tsx`
- `web/src/app/pages/SnapshotEditorPageContent.tsx`
- `web/src/app/utils/snapshotGoLiveState.ts`
- `web/src/app/utils/snapshotActivationToast.ts`
- `web/src/app/utils/snapshotRoutingLiveState.ts`
- `web/src/map2/clients/snapshots.ts`
- `web/src/map2/types.ts`

Potential backend additions may involve:

- `app/routes/unified_snapshots.py`
- `app/services/state_authority_activation_service.py`
- `app/services/audio_state_authority.py`
- `app/models/audio_state.py`

## Non-Negotiable Design Rules

- Do not infer live state from the editor alone.
- Do not bury blockers inside advanced-only views.
- Do not use ambiguous action labels like `Apply`.
- Do not leave routing, device readiness, and live confirmation in separate mental models.
- Do not show technical jargon first when a plain-language explanation is possible.
- Do not show success language when only the request was accepted but runtime confirmation is still pending.

## Acceptance Criteria For The Redesign

The redesign is successful when a first-time operator can answer, without prior product knowledge:

1. Whether the current draft is saved.
2. Whether a publish request has been made.
3. Whether the runtime confirmed the publish.
4. What exact issue is blocking publish right now.
5. What specific action they should take next.
6. Whether the blocker is local routing, network routing, missing assets, missing plugins, missing devices, offline nodes, or unconfirmed channels.

## Suggested Implementation Sequence For The Next AI

1. Define the operator-facing state model and terminology first.
2. Introduce a unified readiness/blocker contract in the frontend, or preferably from the backend.
3. Rebuild the publish workspace around `Draft`, `Requested`, and `Confirmed live`.
4. Migrate routing/control/device workflows into that workspace.
5. Remove superseded modal entry points and duplicate status surfaces.
6. Add focused regression coverage for blocker sequencing, source-of-truth rendering, and publish confirmation.

## Notes

- React Flow is already present and can remain part of the experience, but it should support comprehension rather than act as the primary explanation.
- No new dependency is required by this design brief alone.
- If future implementation adds dependencies or runtime assumptions, the installer and environment artifacts must be updated in the same task per repository rules.

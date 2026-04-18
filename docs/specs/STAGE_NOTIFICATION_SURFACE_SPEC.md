# Stage-First Notification Surface Spec

Last updated: 2026-04-17

## Purpose

This document defines the approved notification contract for the MAP2 React GUI after the user's 100-question poll on 2026-04-17.

The core rule is strict:

- The notification system must behave like an operator-grade live-audio alert surface, not a generic web-app toast stack.
- Live snapshot state, workflow results, and critical engine/path failures must share one coherent notification model.
- React-Toastify is the approved notification engine, but MAP2 may render custom banner and rail layouts on top of that engine.

## Scope

This spec covers:

- consolidation of the current split notification systems in the React GUI
- expanded full-width bottom alert banner behavior
- collapsed floating right-rail behavior
- live snapshot persistence and replacement rules
- major workflow notifications for snapshot publish, activation, deactivation, deploy, and recovery
- critical alert takeover behavior
- alert priority, deduplication, merge, and rate-limit rules
- approved accessibility and copy rules

This spec does not require:

- a notification-center drawer or inbox
- a keyboard shortcut dedicated to notification focus
- analytics or telemetry for notification interactions
- drag-to-dismiss interactions
- a new global "performance mode" outside the notification surface itself

## Existing React GUI Surfaces To Replace Or Absorb

The current web app spreads notification behavior across multiple systems:

- [web/src/app/components/Toasts.tsx](/home/mm/map2-audio/web/src/app/components/Toasts.tsx:37)
- [web/src/app/App.tsx](/home/mm/map2-audio/web/src/app/App.tsx:266)
- [web/src/app/components/NodeAlerts/NodeAlertToast.tsx](/home/mm/map2-audio/web/src/app/components/NodeAlerts/NodeAlertToast.tsx:7)
- [web/src/app/hooks/useAlertNotifications.tsx](/home/mm/map2-audio/web/src/app/hooks/useAlertNotifications.tsx:132)
- [web/src/app/components/AvbRouting/hooks/useNotifications.ts](/home/mm/map2-audio/web/src/app/components/AvbRouting/hooks/useNotifications.ts:35)
- snapshot workflow toast call sites in [web/src/app/components/snapshots/SnapshotModalContent.tsx](/home/mm/map2-audio/web/src/app/components/snapshots/SnapshotModalContent.tsx:97), [web/src/app/components/snapshots/SnapshotDeployModal.tsx](/home/mm/map2-audio/web/src/app/components/snapshots/SnapshotDeployModal.tsx:145), [web/src/app/pages/SnapshotPublishPage.tsx](/home/mm/map2-audio/web/src/app/pages/SnapshotPublishPage.tsx:412), and [web/src/app/pages/SnapshotEditorPageContent.tsx](/home/mm/map2-audio/web/src/app/pages/SnapshotEditorPageContent.tsx:1055)

The implementation must converge these into one notification domain model.

## Operator Context

The target operator environment is live audio and stage use.

The surface must therefore optimize for:

- instant recognition under pressure
- one obvious primary message
- clear separation between critical failures, live snapshot state, and low-value workflow chatter
- layouts that remain readable at a distance
- restrained motion after the initial alert moment

## Core Principles

### One system, multiple presentations

- Notification data must have one canonical source in the React app.
- Expanded banner, collapsed rail, and minor transient toasts are presentations of the same system, not separate subsystems.

### Stage-first hierarchy

- The primary alert must always be obvious.
- Secondary alerts may exist, but they must not compete with the main message.
- The layout must favor signal continuity and active live state over routine CRUD success copy.

### Rich where it matters

- Snapshot publish, activation, deactivation, deploy, and recovery must use richer layouts than generic text toasts.
- Routine background successes should usually be suppressed.

### Adaptive merge, not stack spam

- Related events should merge into an existing surface in place whenever possible.
- One resource should have one current notification state at a time.
- Repeated events must update counts or details instead of multiplying cards.

## Notification Classes

### Critical alert

Examples:

- engine failure
- audio dropout
- disconnected output
- failed live path or unrecoverable route loss

Rules:

- may temporarily take over the full width on first trigger
- uses the highest-priority slot
- replaces live snapshot banner while active

### Warning alert

Examples:

- degraded routing
- retrying backend link
- partial node confirmation failure
- live warning states that do not yet represent total path loss

Rules:

- can take over the secondary strip or main banner depending on severity
- may escalate into the primary alert area

### Live snapshot state

Examples:

- snapshot is live
- snapshot publish requested
- snapshot recovered after interruption

Rules:

- persistent while active
- read-only in the banner
- carries at most one icon-based navigation affordance to the relevant window

### Workflow notification

Examples:

- publish started
- publish succeeded
- deploy failed
- snapshot deactivated

Rules:

- richer summary layouts are allowed
- shown primarily for explicit user-triggered actions
- should use `toast.promise`, `toast.loading`, or `toast.update` semantics under the hood

### Minor transient notification

Examples:

- preference saved
- plugin list refreshed
- non-critical informational update

Rules:

- short-lived
- suppressed when low value
- rendered only when not better expressed inline in a local surface

## Severity And Priority Ladder

Only one item may own the primary alert area at a time.

Priority order:

1. Signal continuity and safety failures
2. Engine failure and disconnected output conditions
3. Connectivity failures and critical infrastructure alerts
4. Live snapshot state
5. Explicit user-triggered workflow updates
6. Background informational events

Additional rules:

- audio-dropout, engine-failure, and disconnected-output conditions outrank live snapshot state
- the same priority ladder must apply in both expanded and collapsed modes
- the top-priority item must always occupy the most prominent slot

## Presentation Modes

### Mode A: Initial full-width alert takeover

This is the brief first-alert emphasis state for new high-priority alerts.

Rules:

- occupies the full available width
- uses stronger motion, contrast, and typography than the steady-state banner
- automatically downgrades after a short interval into the persistent banner
- keeps a consistent alert area placement so operators learn where to look

Visual rules:

- critical: red background, white text, alert icon on the left
- warning: yellow background, black text and icon

This mode may take inspiration from broadcast alert chyrons, but must remain an original MAP2 design aligned to Carbon principles.

### Mode B: Expanded bottom banner

This is the primary alerting surface when expanded.

Rules:

- spans the full viewport width
- occupies approximately the lower fifth of the screen
- pushes the rest of the UI upward instead of overlaying it
- uses one dominant primary alert area
- may include subordinate regions for secondary alerts and ticker content
- must remain clear and usable on stage

Composition rules:

- one primary message area
- one optional secondary strip for compact related alerts
- one optional ticker region for urgent or accumulating lower-priority events
- layouts may vary by state, but the primary alert zone must stay recognizable

### Mode C: Persistent live snapshot banner

This is a specialized expanded-banner template used while a snapshot is live.

Rules:

- shown whenever a snapshot is live and any window except the Snapshot Editor is open
- remains pinned while the snapshot stays active
- pushes the UI upward through reserved layout space
- is hidable by the operator
- is otherwise read-only
- provides only an icon-based navigation affordance to the appropriate snapshot window

Required content:

- snapshot name
- live status
- relevant target or scope
- last meaningful action or state summary
- any other high-value live context that fits the approved hierarchy

### Mode D: Collapsed floating right rail

This is the compact form used after the operator hides the expanded banner.

Rules:

- floats on the right side of the viewport
- occupies roughly 25% of horizontal space
- is the same notification surface as the collapsed mini-alert stack
- does not become a separate toast system
- preserves priority ordering
- clicking a compact alert expands the full-width banner focused on that alert

Content rules:

- compact mode uses icons, color, and only a few words
- it does not attempt to preserve the full detail density of expanded mode
- it may show multiple compact alert items at once
- it keeps the same severity identity as the expanded banner

### Mode E: Restored live snapshot banner

When a temporary alert overlay ends:

- the live snapshot banner returns
- the prior expanded or collapsed state must be remembered and restored

## Replacement Rules

### Alert replaces snapshot banner

- Temporary warning, critical, or recovery overlays fully replace the live snapshot banner while active.
- The live snapshot banner does not remain visible underneath those overlays.

### Snapshot banner restoration

- When the temporary overlay settles, the live snapshot banner returns.
- The previously chosen expanded or collapsed state is restored.

## Merge And Deduplication Rules

- Related notifications must merge into the current banner in a fluid, adaptive way.
- Incoming events may add, replace, or reorder sections based on priority and relevance.
- One resource should present one active notification identity at a time.
- Duplicate events must be prevented with stable ids or active checks.
- Repeated identical failures should update an existing surface with new count/detail context.
- Noisy polling and websocket failures must be rate-limited.
- Non-urgent background events may be delayed slightly to avoid interrupting immediate interaction.

## Snapshot Workflow Rules

Snapshot publish, activation, deactivation, and deploy events require richer notifications.

Required capabilities:

- headline with snapshot name and operation state
- result summary
- expandable or otherwise richer detail area for affected channels, blocks, paths, or destinations
- in-place update as more precise backend data arrives

File-path anchor points for later implementation:

- [web/src/app/utils/snapshotActivationToast.ts](/home/mm/map2-audio/web/src/app/utils/snapshotActivationToast.ts:308)
- [web/src/app/components/snapshots/SnapshotModalContent.tsx](/home/mm/map2-audio/web/src/app/components/snapshots/SnapshotModalContent.tsx:323)
- [web/src/app/components/snapshots/SnapshotDeployModal.tsx](/home/mm/map2-audio/web/src/app/components/snapshots/SnapshotDeployModal.tsx:366)
- [web/src/app/pages/SnapshotEditorPageContent.tsx](/home/mm/map2-audio/web/src/app/pages/SnapshotEditorPageContent.tsx:6295)
- [web/src/app/pages/SnapshotPublishPage.tsx](/home/mm/map2-audio/web/src/app/pages/SnapshotPublishPage.tsx:412)

## Readability And Copy Rules

- Copy must prefer operator-facing remediation language over raw backend exceptions whenever possible.
- Notification titles must identify the source area clearly.
- Copy should follow a consistent pattern: what happened, where, what next.
- Timestamps should appear only when they add operational value.
- Hostname or device name should lead node-critical alerts.
- User-triggered workflow notifications should look distinct from background system alerts.

## Accessibility Rules

- Each rendered notification must use explicit ARIA roles and labels rather than relying solely on defaults.
- Critical notifications should preserve assertive semantics where appropriate.
- Expanded and collapsed surfaces must remain screen-reader addressable.

The system does not require a dedicated notification hotkey.

## Interaction Rules

- Live snapshot banner is read-only except for a single icon-only navigation affordance.
- Drag-to-dismiss is not required.
- Keyboard-only access should still remain functional through ordinary focus order.
- Minor transient items may auto-close; critical items should require stronger persistence rules.

## Standard Timing Rules

- success notifications close quickly
- warnings stay longer
- critical alerts may require manual dismissal or explicit state transition
- resolved states remain visible briefly before settling back to the normal state

Not every backend or cluster-health issue should remain persistent until actual recovery. Persistence must follow severity and state rules, not a blanket infrastructure policy.

## Preferred Technical Approach

React-Toastify is the approved engine because it already supports:

- stable ids and duplicate suppression
- `toast.promise`
- `toast.loading` plus `toast.update`
- controlled progress
- queue limiting
- custom components
- change listeners and headless notification-center data

Implementation should prefer:

- one MAP2 notification domain model
- React-Toastify as lifecycle and queue engine
- custom MAP2 banner and rail renderers for the stage-first layouts

Implementation should avoid multiplying brittle containers unless a concrete layout requirement proves unavoidable.

## Explicitly Rejected Or Deferred Ideas

- no notification drawer/inbox
- no dedicated keyboard shortcut for focusing notifications
- no notification analytics requirement
- no drag-dismiss requirement
- no "all backend health toasts stay pinned until recovery" blanket rule
- no separate documentation-heavy taxonomy exercise as a prerequisite for implementation

## Acceptance Criteria

The future implementation is conformant when:

- the current split notification systems are replaced by one coherent notification model
- major snapshot workflows render richer banner-grade notifications
- expanded mode uses a full-width bottom banner that pushes layout upward
- collapsed mode becomes a floating right rail with compact alert items
- high-priority alerts briefly take over the full width, then settle into persistent mode
- live snapshot state appears as a pinned, hidable, read-only banner outside the Snapshot Editor
- higher-priority alerts temporarily replace that live banner and then restore it correctly
- duplicate and noisy events are merged, deduplicated, and rate-limited
- primary vs secondary alert hierarchy remains obvious in all modes

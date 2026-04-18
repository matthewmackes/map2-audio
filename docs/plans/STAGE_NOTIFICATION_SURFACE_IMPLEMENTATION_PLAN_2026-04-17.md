# Stage Notification Surface Implementation Plan

Created: 2026-04-17

Status: Planning complete. Not yet implemented.

Epic intent:

- Consolidate MAP2's split web notification systems into one React-Toastify-backed notification domain.
- Deliver the stage-first banner and rail model defined in `docs/specs/STAGE_NOTIFICATION_SURFACE_SPEC.md`.

## A. Executive Summary

The current React GUI already has enough notification entry points to justify a dedicated implementation program, not another round of ad hoc toast helpers.

Today the app mixes:

- a custom panel-based provider in `web/src/app/components/Toasts.tsx`
- reconnect toasts in `web/src/app/App.tsx`
- a node-alert Carbon toast stack in `web/src/app/components/NodeAlerts/NodeAlertToast.tsx`
- a custom alert-notification hook in `web/src/app/hooks/useAlertNotifications.tsx`
- many direct `pushToast(...)` call sites across snapshot, MIDI, host, and routing surfaces

The plan below replaces those with one notification architecture and stages the work so snapshot/live-state behavior lands first.

## B. Recommended Technical Strategy

### Use React-Toastify as the engine, not the final visual language

React-Toastify should own:

- toast ids and duplicate suppression
- promise-driven lifecycles
- loading and update semantics
- dismissal and queue rules
- change observation

MAP2 should own:

- the domain model for alert classes and priorities
- the full-width bottom banner
- the collapsed floating right rail
- the critical takeover and downgrade behavior
- snapshot-specific layout templates

### Avoid a brittle many-container design

React-Toastify's own docs caution that multiple containers are brittle and error-prone.

Recommended approach:

1. keep one canonical notification store/provider in the app shell
2. emit all events through one adapter layer
3. use React-Toastify lifecycle primitives plus custom MAP2 renderers
4. keep any conventional toast container limited to true transient/minor notifications if still needed

Two viable implementation patterns:

- preferred: use `toast.onChange` and/or `useNotificationCenter` as the canonical event feed into MAP2 banner/rail state
- fallback: wrap `toast` in a local domain provider that mirrors every emit/update/dismiss action into app state

## C. Current Files To Touch

### Core notification layer

- `web/src/app/components/Toasts.tsx`
- `web/src/app/App.tsx`
- `web/src/app/components/AvbRouting/hooks/useNotifications.ts`
- `web/src/app/hooks/useAlertNotifications.tsx`
- `web/src/app/components/NodeAlerts/NodeAlertToast.tsx`

### Snapshot and live-state entry points

- `web/src/app/utils/snapshotActivationToast.ts`
- `web/src/app/components/snapshots/SnapshotModalContent.tsx`
- `web/src/app/components/snapshots/SnapshotDeployModal.tsx`
- `web/src/app/pages/SnapshotPublishPage.tsx`
- `web/src/app/pages/SnapshotEditorPageContent.tsx`

### Likely shell/layout integration points

- `web/src/app/layout/AppShell.tsx`
- `web/src/app/layout/AppShell.css`
- route/window shell surfaces that must reserve bottom-banner space

### Tests that will need migration

- tests mocking `useToasts`
- snapshot workflow tests
- route-shell layout tests
- node-alert tests

## D. Proposed Domain Model

Introduce a typed notification model before changing visuals.

Suggested shape:

```ts
type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical'
type NotificationClass =
  | 'critical_alert'
  | 'warning_alert'
  | 'live_snapshot'
  | 'workflow'
  | 'minor_transient'

type NotificationSurfaceMode =
  | 'takeover'
  | 'expanded_banner'
  | 'collapsed_rail'
  | 'transient'

interface NotificationResourceKey {
  kind: 'snapshot' | 'node' | 'device' | 'backend' | 'workflow' | 'generic'
  id: string
}

interface NotificationRecord {
  id: string
  class: NotificationClass
  severity: NotificationSeverity
  resource?: NotificationResourceKey
  title: string
  message: string
  sourceLabel?: string
  timestamp: number
  sticky?: boolean
  liveSnapshotPinned?: boolean
  replaceLiveBanner?: boolean
  details?: Record<string, unknown>
  actions?: Array<{ kind: 'link'; icon: string; href: string }>
}
```

Key rules:

- one resource gets one current active notification identity
- records are updateable in place
- severity and class determine presentation
- live snapshot banner is a specialized record class, not a separate system

## E. Phased Implementation

### Phase 0: Foundation and dependency landing

Goals:

- add `react-toastify` to `web/package.json`
- create the canonical notification adapter/provider
- preserve existing `useToasts()` call sites during migration

Steps:

1. Add the frontend dependency and lockfile update.
2. Replace the current custom panel in `web/src/app/components/Toasts.tsx` with a Toastify-backed provider.
3. Keep a compatibility `useToasts()` API so the app does not break all at once.
4. Define notification ids, severity mapping, and resource-key mapping.

Validation:

- typecheck
- focused provider tests
- shell render smoke test

### Phase 1: Notification-domain unification

Goals:

- eliminate the split logic between provider panel, node-alert stack, and custom alert hook
- create one source of truth for all notification events

Steps:

1. Migrate `NodeAlertToast.tsx` to emit into the canonical domain instead of rendering its own toast stack.
2. Refactor `useAlertNotifications.tsx` to stop owning a separate visual list.
3. Adapt AVB routing notification hook to the new typed adapter.
4. Normalize reconnect and unreachable events in `App.tsx` into stable ids and in-place updates.

Acceptance:

- one provider
- one active event model
- no duplicate visible systems

### Phase 2: Snapshot-first rich notifications

Goals:

- land the first user-visible rich surface around snapshot workflows
- stop reducing snapshot outcomes to plain sentence toasts

Steps:

1. Replace `buildSnapshotActivationToastMessage(...)` string-only output with richer data payloads or typed content descriptors.
2. Convert snapshot activation and publish flows to `toast.promise` or `toast.loading` plus `toast.update`.
3. Introduce rich snapshot templates for:
   - publish requested
   - live confirmed
   - deactivated
   - deploy succeeded
   - deploy failed
   - recovery
4. Include snapshot name, scope, and expandable detail summary where relevant.

Acceptance:

- `SnapshotModalContent.tsx`, `SnapshotDeployModal.tsx`, `SnapshotPublishPage.tsx`, and `SnapshotEditorPageContent.tsx` stop emitting only flat text for major workflow outcomes

### Phase 3: Expanded bottom banner

Goals:

- establish the new primary alerting surface
- reserve layout space instead of layering popups over core controls

Steps:

1. Build `StageNotificationBanner` component and shell integration.
2. Add bottom layout reservation in the app shell.
3. Implement one dominant primary alert area plus subordinate strip/ticker regions.
4. Define expanded templates for critical, warning, live snapshot, workflow, and recovery states.

Acceptance:

- expanded banner spans full width
- page content reflows upward
- primary alert area is visually stable and dominant

### Phase 4: Critical takeover behavior

Goals:

- make severe alerts impossible to miss without leaving the UI in a permanently loud state

Steps:

1. Add temporary full-width takeover mode for high-priority alerts.
2. Use red/white critical palette and yellow/black warning palette.
3. Downgrade automatically into the persistent banner after the configured interval.
4. Preserve the same alert identity between takeover and steady state.

Acceptance:

- a new critical alert first appears as takeover, then settles
- it remains the same alert record, not a new duplicated event

### Phase 5: Live snapshot pinned banner

Goals:

- give live snapshot state a persistent, stage-usable home outside the Snapshot Editor

Steps:

1. Detect when a snapshot is live and any non-editor window is active.
2. Render a persistent read-only snapshot banner in expanded mode.
3. Add a hide/collapse control.
4. Provide only an icon-based navigation affordance to the relevant snapshot window.

Acceptance:

- live snapshot banner appears outside Snapshot Editor
- remains pinned while live
- pushes layout upward
- contains no inline operational controls

### Phase 6: Collapsed floating right rail

Goals:

- turn hidden state into a useful compact alert surface instead of simple dismissal

Steps:

1. Build collapsed floating right rail at roughly 25% width.
2. Use icon/color/few-word compact items.
3. Keep rail content within the same provider state as expanded mode.
4. Clicking a compact item expands the banner focused on that alert.

Acceptance:

- collapsed state is not a separate toast stack
- compact items preserve priority ordering
- visual identity matches expanded mode

### Phase 7: Replacement and restoration rules

Goals:

- ensure live snapshot state and temporary alert overlays behave predictably

Steps:

1. Let critical and warning overlays replace the live snapshot banner while active.
2. Restore the live snapshot banner when the overlay settles.
3. Remember whether the user had the surface expanded or collapsed before the temporary overlay.

Acceptance:

- live banner is fully replaced during alert ownership
- previous state restores correctly afterward

### Phase 8: Merge, dedupe, and noise control

Goals:

- stop alert spam before broad feature migration

Steps:

1. Use stable ids or resource keys for backend reconnect, node alerts, and snapshot workflow states.
2. Add repeated-failure count updates.
3. Rate-limit polling and websocket failure surfaces.
4. Suppress low-value background success messages.
5. Show timestamps only where operationally useful.

Acceptance:

- operator sees merged evolving state, not bursts of duplicate cards

### Phase 9: Inline-vs-global cleanup

Goals:

- move context-bound feedback out of the global surface when it belongs with the current panel

Steps:

1. Audit snapshot publish/activation/deactivation, upload, and editor-local messages.
2. Convert panel-local validation and form failures into inline notifications where appropriate.
3. Keep only cross-surface or stage-relevant items in the global banner/rail system.

Acceptance:

- the global surface becomes higher-signal

## F. Testing Strategy

### Unit and component coverage

- provider and adapter tests
- priority and replacement rules
- collapse/expand state restoration
- dedupe and rate-limit behavior
- snapshot template rendering

### Integration coverage

- app shell with reserved bottom-banner space
- critical takeover to steady-state downgrade
- live snapshot banner outside Snapshot Editor
- live snapshot hidden -> collapsed rail -> re-expand flow
- snapshot publish/activate/deploy journeys

### Suggested file additions

- `web/src/app/components/notifications/StageNotificationProvider.test.tsx`
- `web/src/app/components/notifications/StageNotificationBanner.test.tsx`
- `web/src/app/components/notifications/StageNotificationRail.test.tsx`
- `web/src/app/components/notifications/notificationPriority.test.ts`
- `web/src/app/components/notifications/notificationMerge.test.ts`
- snapshot workflow integration tests updated to assert richer content instead of plain strings

## G. Dependencies And Platform Notes

Planned dependency change:

- add `react-toastify` to the web frontend package manifest and lockfile

Installer/environment note:

- this is a bundled frontend dependency, not a host-level runtime service or OS package
- no new systemd unit or installer package is expected solely from this library addition
- if later implementation introduces build tooling changes beyond the package manifest, update any affected frontend build or installer artifacts in the same task

## H. Recommended Delivery Order

Deliver in this order:

1. Foundation provider and adapter
2. Snapshot-rich workflow notifications
3. Expanded bottom banner
4. Critical takeover
5. Live snapshot pinned banner
6. Collapsed right rail
7. Merge/dedupe/noise rules
8. Cleanup of remaining legacy call sites

This order lands visible value quickly while keeping the riskiest layout and state logic behind a stable provider contract.

## I. Exit Criteria

This initiative is complete when:

- the custom notification panel, node-alert stack, and alert hook no longer operate as separate visual systems
- snapshot publish and live-state workflows render through the new banner/rail architecture
- the live snapshot banner behaves according to the approved hide/replace/restore rules
- severe alerts take over briefly, then settle
- collapsed mode is a compact right rail tied to the same state model
- low-value toast spam is measurably reduced in the touched flows

# AVB Routing Matrix - Implementation Status

**Last Updated:** February 17, 2026  
**Status:** Phases 1-2 complete, Phase 3 integration in stabilization

---

## Completed

### Phase 1: Foundation/Data Layer
- Type system completed under `web/src/app/components/AvbRouting/types/`.
- Reducer state machine completed in `web/src/app/components/AvbRouting/context/routingReducer.ts`.
- API hooks implemented in `web/src/app/components/AvbRouting/hooks/useAvbApi.ts`.
- Context provider implemented in `web/src/app/components/AvbRouting/context/RoutingContext.tsx`.

### Phase 2: Core UI
- Main shell and routeable app:
  - `web/src/app/components/AvbRouting/AvbRoutingApp.tsx`
  - `web/src/app/pages/AvbRoutingPage.tsx`
  - `/avb-routing` route wired in `web/src/app/App.tsx`
- Grid and UI components:
  - `web/src/app/components/AvbRouting/components/RoutingGrid/RoutingGrid.tsx`
  - `web/src/app/components/AvbRouting/components/RoutingGrid/MatrixCell.tsx`
  - `web/src/app/components/AvbRouting/components/RoutingGrid/StickyHeaders.tsx`
  - `web/src/app/components/AvbRouting/components/TopBar/TopBar.tsx`
  - `web/src/app/components/AvbRouting/components/Inspector/InspectorPanel.tsx`
- App shell integration:
  - AVB nav entry added in `web/src/app/layout/AppShell.tsx`
  - full-bleed content mode added in `web/src/index.css`

### Phase 3: Initial UX Enhancements
- Keyboard navigation hook added:
  - `web/src/app/components/AvbRouting/hooks/useKeyboardNavigation.ts`
- Connection path/highlight overlay added:
  - `web/src/app/components/AvbRouting/components/RoutingGrid/ConnectionHighlight.tsx`
- Notification adapter hook added:
  - `web/src/app/components/AvbRouting/hooks/useNotifications.ts`
- Notifications wired to user actions:
  - connect/disconnect success and failure notifications in `RoutingGrid.tsx`
  - safe patch enable/apply/discard notifications in `TopBar.tsx`
- Safe patch apply flow hardened:
  - batch API execution from `TopBar.tsx` before reducer commit
  - `APPLY_SAFE_CHANGES` in `routingReducer.ts` now correctly removes staged disconnect routes
- Keyboard focus and mouse hover state are now separated:
  - `selection.focusedCell` added for keyboard navigation state
  - `selection.hoveredCell` preserved for pointer inspection behavior
- Distinct keyboard focus visuals added:
  - focused matrix cells now render an explicit focus ring in `MatrixCell.tsx`
  - keyboard crosshair highlight reads from `focusedCell`
- Lightweight route-level smoke test added:
  - `web/src/app/pages/AvbRoutingPage.test.tsx`
- App-router route smoke coverage added:
  - `web/src/app/App.avbRoutingRoute.test.tsx`
- Reducer coverage added for focus/hover precedence:
  - `web/src/app/components/AvbRouting/context/routingReducer.test.ts`
- Keyboard navigation behavior tests added:
  - `web/src/app/components/AvbRouting/hooks/useKeyboardNavigation.test.tsx`
- Keyboard integration coverage added (real provider + reducer transitions):
  - `web/src/app/components/AvbRouting/hooks/useKeyboardNavigation.integration.test.tsx`
- Safe-mode workflow history coverage added:
  - `web/src/app/components/AvbRouting/context/routingReducer.test.ts`
  - `web/src/app/components/AvbRouting/hooks/useKeyboardNavigation.integration.test.tsx`
  - apply/discard + undo/redo assertions for staged connect/disconnect flows
- API-facing notification contract coverage added:
  - `web/src/app/components/AvbRouting/components/RoutingGrid/RoutingGrid.notifications.test.tsx`
- Batch action notification contract coverage added:
  - connect success/failure notifications
  - disconnect mixed success/failure notifications
  - locked-route skip warning behavior
  - `web/src/app/components/AvbRouting/components/RoutingGrid/RoutingGrid.notifications.test.tsx`
- Multi-node route/topology type alignment completed for build stability:
  - `web/src/app/components/AvbRouting/context/routingReducer.ts`
  - `web/src/app/components/AvbRouting/context/RoutingContext.tsx`
  - `web/src/app/components/AvbRouting/components/NetworkTopology/NetworkTopologyModal.tsx`
- CI summary output added for AVB routing frontend tests:
  - `.github/workflows/ci-cd.yml` now records result, exit code, and timing in `$GITHUB_STEP_SUMMARY`
- CI artifact upload added for AVB routing Jest reports:
  - `.github/workflows/ci-cd.yml` now emits `reports/avb-routing-jest.json`
  - report uploaded as `avb-routing-jest-report` artifact with `if: always()`
- Router-level 409 admission-denied error contracts covered:
  - `web/src/app/components/AvbRouting/hooks/useAvbApi.errorContracts.test.ts`
  - `useAvbApi.ts` now appends remediation hints from SRP denial payloads for operator-facing notifications
- Targeted reducer coverage added for multi-node route updates:
  - `web/src/app/components/AvbRouting/context/routingReducer.test.ts`
  - validates cross-node metadata derivation on `PATCH`
  - validates `CONNECTIONS_UPDATED` metadata merge behavior
  - validates `NODES_UPDATED` + `CROSS_NODE_ROUTE_UPDATED` state wiring
- API/reducer integration coverage added for cross-node route lifecycle:
  - `web/src/app/components/AvbRouting/context/RoutingContext.integration.test.tsx`
  - validates provider sync of API payloads into reducer state for `connecting -> connected` cross-node transitions
- Topology/route reconciliation coverage added for node offline transitions:
  - `web/src/app/components/AvbRouting/context/RoutingContext.integration.test.tsx`
  - validates stale cross-node route cleanup when remote node status changes to offline and API connections clear
- Rapid API resync reconciliation now replaces stale cross-node route sets:
  - `web/src/app/components/AvbRouting/context/RoutingContext.tsx` dispatches `CROSS_NODE_ROUTES_SYNCED`
  - `web/src/app/components/AvbRouting/context/routingReducer.ts` replaces `network.crossNodeRoutes` on sync
  - `web/src/app/components/AvbRouting/context/routingReducer.test.ts` and `web/src/app/components/AvbRouting/context/RoutingContext.integration.test.tsx` cover stale-route replacement
- Focused UI assertions added for cross-node indicators and topology badges:
  - `web/src/app/components/AvbRouting/components/RoutingGrid/MatrixCell.crossNode.test.tsx`
  - `web/src/app/components/AvbRouting/components/NetworkTopology/NetworkTopologyModal.badges.test.tsx`
  - validates matrix cross-node link indicator and topology node/route/PTP badge summaries
- Degraded/offline node visibility assertions added for node navigation surfaces:
  - `web/src/app/components/AvbRouting/components/NodeTree/NodeTree.badges.test.tsx`
  - `web/src/app/components/AvbRouting/components/TopBar/NodeSelector.badges.test.tsx`
  - validates degraded/offline badge visibility and filtered visibility behavior
- Topology node-card health metric rendering added with test coverage:
  - `web/src/app/components/AvbRouting/components/NetworkTopology/NetworkTopologyModal.tsx`
  - `web/src/app/components/AvbRouting/components/NetworkTopology/NetworkTopologyModal.badges.test.tsx`
  - renders `Health: <status> · CPU ... · Lat ...` row when node health data is present
- Topology node-card health severity color semantics now asserted:
  - `web/src/app/components/AvbRouting/components/NetworkTopology/NetworkTopologyModal.tsx`
  - `web/src/app/components/AvbRouting/components/NetworkTopology/NetworkTopologyModal.badges.test.tsx`
  - validates degraded/critical/healthy health statuses map to warning/error/success color semantics
- Node-list sorting stability coverage added for status transitions:
  - `web/src/app/components/AvbRouting/utils/nodeSorting.ts`
  - `web/src/app/components/AvbRouting/components/NodeTree/NodeTree.tsx`
  - `web/src/app/components/AvbRouting/components/TopBar/NodeSelector.tsx`
  - `web/src/app/components/AvbRouting/components/NodeTree/NodeTree.badges.test.tsx`
  - `web/src/app/components/AvbRouting/components/TopBar/NodeSelector.badges.test.tsx`
  - validates deterministic local/pinned/online/name ordering when remote nodes transition online/degraded/offline

---

## Current Validation

- `npm run typecheck` (in `web/`) passes.
- `npm run build` (in `web/`) passes.
- `npm run test:avb-routing` (repo root) passes for AVB routing smoke + reducer + keyboard + history + notification suites.

---

## Remaining Work

### Phase 3 (in progress)
- Add multi-node filter/view-mode interaction tests for NodeSelector + NodeTree.

### Phase 4+
- Search/filter panel enhancements.
- Scene management dialogs and diff UX.
- WebSocket real-time sync hooks.
- Reducer/component test coverage.
- Documentation/user guide for operators.

---

## Next Recommended Slice

1. Add multi-node filter/view-mode interaction tests for NodeSelector + NodeTree.
2. Add focused integration assertions for TopBar + NodeTree after node status churn and API resync.
3. Add explicit selection-retention assertions when filtered node sets shrink/expand.

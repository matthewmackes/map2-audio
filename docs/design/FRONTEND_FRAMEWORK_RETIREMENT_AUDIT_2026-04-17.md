# Frontend Framework Retirement Audit

Date: 2026-04-17

Status: Audit plus first implementation slice completed.

## Purpose

This document closes worklist item `T2343` by:

- identifying the highest-cost remaining MUI islands inside the Carbon shell
- setting a practical priority order for their retirement
- defining explicit ReactFlow density thresholds and behavior rules
- recording the validated implementation slice completed as part of this task

## Current Inventory Snapshot

Repo-local inventory captured on 2026-04-17:

- `web/src/app/**` files importing MUI: `21`
- `web/src/app/**` files importing `reactflow`: `17`
- `web/src/map2/**` files importing MUI: `28`

Interpretation:

- `web/src/app/**` is the operator-facing shell and therefore the higher-priority retirement scope.
- `web/src/map2/**` still carries substantial legacy MUI debt, but much of it is not on the current Carbon-first routed shell critical path.

## Highest-Cost Remaining MUI Islands In The Carbon Shell

### Priority 1: AVB routing route

Files:

- `web/src/app/components/AvbRouting/AvbRoutingApp.tsx`
- `web/src/app/components/AvbRouting/components/TopBar/TopBar.tsx`
- `web/src/app/components/AvbRouting/components/NodeTree/NodeTree.tsx`
- `web/src/app/components/AvbRouting/components/Inspector/InspectorPanel.tsx`
- `web/src/app/components/AvbRouting/components/NetworkTopology/NetworkTopologyModal.tsx`
- `web/src/app/components/AvbRouting/components/RoutingGrid/*`

Why first:

- this is the densest active operator route still mixing Carbon shell chrome with a broad MUI subtree
- it also intersects one of the heavier ReactFlow/topology surfaces
- it compounds runtime styling cost, layout complexity, and render churn on a route people use for active routing work

### Priority 2: High-traffic hardware/device pages

Files:

- `web/src/app/pages/EdirolUA1000Page.tsx`
- `web/src/app/pages/MOTURMEPage.tsx`

Why second:

- both are large dedicated operator pages still importing route-local MUI controls
- they keep Emotion/style-engine work alive on routes that should otherwise benefit from the Carbon shell cleanup

### Priority 3: MIDI cluster holdouts

Files:

- `web/src/app/components/MidiCluster/MidiClusterNodeCard.tsx`
- `web/src/app/components/MidiCluster/MidiClusterHealthBar.tsx`
- `web/src/app/components/MidiCluster/MidiClusterClockPanel.tsx`
- `web/src/app/components/MidiCluster/MidiClusterTopology.tsx`

Why third:

- these are smaller than the AVB and device-page islands
- they are good candidates for straightforward Carbon/custom CSS replacement
- they are useful cleanup targets once the larger route shells are under control

### Priority 4: Legacy alert hook holdout

File:

- `web/src/app/hooks/useAlertNotifications.tsx`

Why fourth:

- it was a small but unnecessary MUI/Emotion island for a generic alert stack
- it touched global alert rendering rather than one route
- it has now been removed from MUI as part of this task

## Recommended Retirement Order

1. AVB routing shell and top-level panels
2. AVB routing modal/graph subtrees
3. Edirol UA-1000 route
4. MOTU/RME route
5. MIDI cluster panels
6. Deferred `web/src/map2/**` legacy islands after active `web/src/app/**` shell routes are stabilized

## ReactFlow Density Thresholds

The app now uses a shared density profile helper in:

- `web/src/app/components/shared/reactFlowDensity.ts`

Approved thresholds:

- `low`: below `40` nodes and below `80` edges
- `medium`: `40+` nodes or `80+` edges
- `high`: `100+` nodes or `200+` edges
- `critical`: `180+` nodes or `360+` edges

## ReactFlow Behavior Rules By Density

### Low

- keep dot background
- keep controls
- allow animated `fitView` up to `180ms`

### Medium

- keep dot background
- keep controls
- reduce `fitView` animation to `120ms`

### High

- drop decorative dot background
- keep controls
- remove animated `fitView`
- remove edge/node transition polish that does not add operational value

### Critical

- drop decorative dot background
- drop controls
- remove animated `fitView`
- remove node and edge transitions
- treat the graph as inspection-first rather than chrome-first

## Instrumentation Requirements For Future Graph Work

Every routed ReactFlow workspace should expose:

- density tier
- node count
- edge count

The current implementation records those via `data-*` attributes on the graph owners and tier classes on the flow surface.

This gives future work a stable place to:

- attach telemetry later if wanted
- test behavior thresholds deterministically
- conditionally switch to alternate rendering or virtualization strategies

## Canvas / Alternate Rendering Trigger

The current thresholds are an optimization guardrail, not yet a canvas migration.

Future graph-engine change should be considered required when either of these become normal operator cases on a route:

- sustained graphs above the `critical` threshold
- interaction or fit/zoom instability that remains visible after the current chrome-reduction rules

At that point, the next step should be one of:

- viewport virtualization for nodes and overlays
- canvas/WebGL edge rendering
- route-specific simplified topology summaries ahead of the full graph

## Validated Implementation Slice Completed Under T2343

This task did not stop at audit notes.

### 1. Removed a legacy MUI alert island

Updated:

- `web/src/app/hooks/useAlertNotifications.tsx`
- `web/src/app/hooks/useAlertNotifications.css`
- `web/src/app/hooks/useAlertNotifications.test.tsx`

What changed:

- replaced MUI `Box`, `Paper`, `Typography`, and `IconButton` wrappers with lightweight DOM/CSS
- kept Carbon iconography
- removed an unnecessary Emotion-backed rendering path from the alert stack

### 2. Added shared ReactFlow density instrumentation and chrome reduction

Updated:

- `web/src/app/components/shared/reactFlowDensity.ts`
- `web/src/app/components/shared/reactFlowDensity.test.ts`
- `web/src/app/components/shared/ReactFlowTheme.css`
- `web/src/app/components/NodeGraph/NodeGraph.tsx`
- `web/src/app/components/ClusterDashboard/ClusterDashboardWorkspaceGraph.tsx`
- `web/src/app/components/ManagementWorkspace/ManagementWorkspaceGraph.tsx`
- `web/src/app/components/NetworkDiscovery/NetworkDiscoveryWorkspaceGraph.tsx`
- `web/src/app/components/AudioEngine/AudioEngineWorkspaceGraph.tsx`
- `web/src/app/components/AvbRouting/AvbRoutingWorkspaceGraph.tsx`

What changed:

- every touched graph now computes a shared density profile
- high-density graphs drop decorative background chrome
- critical-density graphs also hide controls
- animated `fitView` is reduced or removed as density rises
- graph containers now expose `data-density-tier`, `data-node-count`, and `data-edge-count`

## Why This Completes T2343

The worklist acceptance required:

- a documented priority order for MUI retirements
- explicit ReactFlow density thresholds or instrumentation requirements
- at least one validated follow-up implementation target

This audit plus the shipped alert/graph changes satisfy all three conditions.

The next meaningful slice should now attack the Priority 1 AVB routing MUI island directly rather than reopening the same audit discussion.

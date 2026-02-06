# 📌 GRID CURRENT STATE (Checkpoint 0.2)

**Date**: February 5, 2026  
**Source of Truth**: [web/src/app/pages/GridFlowPage.tsx](web/src/app/pages/GridFlowPage.tsx)

---

## ✅ Purpose

This document captures the **current Grid Flow architecture** so the multi-node work can integrate without breaking existing functionality. It maps the UI state model, API endpoints used, and data flow from the Grid page.

---

## 1) Core Types (Grid Page)

Defined in [web/src/app/pages/GridFlowPage.tsx](web/src/app/pages/GridFlowPage.tsx#L90-L121).

### `FlowSlot`
```ts
interface FlowSlot {
  id: string
  chainId: number | null
  label: string
  color: string
  muted: boolean
  solo: boolean
  dryWetMix: number
}
```

### `RoutingMode`
```ts
type RoutingMode =
  | 'parallel_blend'
  | 'ab_switch'
  | 'series'
  | 'parameter_morph'
  | 'sidechain'
```

### `RoutingConfig`
```ts
interface RoutingConfig {
  mode: RoutingMode
  activeSlotId: string | null
  blendPositions: Record<string, number>
  morphProgress: number
  morphSourceSlotId: string | null
  morphTargetSlotId: string | null
  seriesOrder: string[]
}
```

---

## 2) Local Storage & Migration

Grid state persists in LocalStorage and is migrated from legacy format in:
- [web/src/app/pages/GridFlowPage.tsx](web/src/app/pages/GridFlowPage.tsx#L133-L210)

**Keys in use**:
- `map2_grid_flows_v2`
- `map2_grid_routing_v2`
- `map2_grid_active_v2`
- `map2_grid_migrated_v2` (migration flag)

---

## 3) Queries (Read APIs)

Grid page loads all runtime data via React Query. These are defined in:
- [web/src/app/pages/GridFlowPage.tsx](web/src/app/pages/GridFlowPage.tsx#L426-L474)

### Query List
| Query Key | API Call | Endpoint Source |
|---|---|---|
| `['chains']` | `chainsApi.list` | [web/src/map2/api.ts](web/src/map2/api.ts) |
| `['plugins','discover']` | `pluginsApi.discover()` | [web/src/map2/api.ts](web/src/map2/api.ts) |
| `['history','status']` | `historyApi.getStatus` | [web/src/map2/api.ts](web/src/map2/api.ts) |
| `['chains','presets']` | `chainsApi.listPresets` | [web/src/map2/api.ts](web/src/map2/api.ts) |
| `['audio','status']` | `audioApi.getStatus` | [web/src/map2/api.ts](web/src/map2/api.ts) |
| `['metrics','jack']` | `metricsApi.getJack` | [web/src/map2/api.ts](web/src/map2/api.ts) |
| `['audio','ports']` | `audioApi.getPorts` | [web/src/map2/api.ts](web/src/map2/api.ts) |
| `['audio','routing']` | `audioApi.getRouting` | [web/src/map2/api.ts](web/src/map2/api.ts) |

---

## 4) Mutations (Write APIs)

Grid page performs modifications via React Query mutations. These are defined in:
- [web/src/app/pages/GridFlowPage.tsx](web/src/app/pages/GridFlowPage.tsx#L845-L936)

### Mutation List
| Action | API Method |
|---|---|
| Reorder plugins | `chainsApi.reorderPlugins(chainId, pluginUris)` |
| Toggle bypass | `chainsApi.togglePluginBypass(chainId, pluginUri, bypass)` |
| Remove plugin | `chainsApi.removePlugin(chainId, pluginUri)` |
| Add plugin | `chainsApi.addPlugin(chainId, pluginUri)` |
| Activate chain | `chainsApi.activate(chainId)` |
| Deactivate chain | `chainsApi.deactivate(chainId)` |
| Undo | `historyApi.undo()` |
| Redo | `historyApi.redo()` |
| Load preset | `chainsApi.loadPreset(presetId)` |
| Delete preset | `chainsApi.deletePreset(presetId)` |
| Rename chain | `chainsApi.rename(chainId, name)` |

---

## 5) Realtime Hooks

### CPU Metrics
- Hook: `useCPUMetrics({ useWebSocket: true, pollingInterval: 500 })`
- Defined in [web/src/app/pages/GridFlowPage.tsx](web/src/app/pages/GridFlowPage.tsx#L476-L486)

### Plugin Output Metering
- Hook: `usePluginOutputs()`
- Defined in [web/src/app/pages/GridFlowPage.tsx](web/src/app/pages/GridFlowPage.tsx#L487-L491)

### Flow Snapshot WebSocket
- Hook: `useFlowSnapshots({ onSnapshotLoaded })`
- Defined in [web/src/app/pages/GridFlowPage.tsx](web/src/app/pages/GridFlowPage.tsx#L493-L520)

---

## 6) Domain Types (Shared)

Main shared types used by Grid are defined in:
- [web/src/map2/types.ts](web/src/map2/types.ts#L24-L120)

Key types:
- `Chain`, `ChainPlugin`, `Plugin`, `Preset`, `HistoryStatus`

---

## 7) Data Flow Summary

```
GridFlowPage
  ├─ LocalStorage (flows, routing, active flow)
  ├─ React Query (chains, plugins, audio, presets, metrics)
  ├─ Realtime hooks (CPU metrics, plugin outputs)
  └─ WebSocket (flow snapshots)
```

---

## 8) Integration Notes for Multi-Node Work

- Flow assignment will **extend** `FlowSlot` without breaking existing fields.
- Multi-node assignment should **not** change current API usage for chains/plugins.
- UI extensions should be **additive**: cluster dashboard + assignment dialog.
- All new multi-node endpoints should live under `/api/cluster/*`.

---

## ✅ Checkpoint 0.2 Acceptance Criteria Mapping

- [x] `FlowSlot` documented
- [x] `RoutingConfig` documented
- [x] API calls used by Grid listed
- [x] Realtime hooks documented
- [x] LocalStorage migration documented
- [x] Data flow summary provided

---

**Checkpoint 0.2: COMPLETE**

/**
 * ExpressionPage - Premium Audio Device UI for Expression Pedal Control (T097).
 *
 * T2487 (2026-05-02): file decomposed into per-component modules under
 * `web/src/app/components/Devices/Expression/`. The 1361-LoC monolith
 * is now a thin shim that re-exports the integrated `ExpressionView`
 * and the public types / sub-components for existing consumers
 * (notably `ExpressionOverlay`).
 *
 * The 3-column workflow stays intact (Assignment List ↔ Form ↔ Live
 * Monitor); audit confirmed no natural multi-route seams. Path A
 * recorded in PROJECT_WORKLIST.md T2487 entry.
 */

import { ExpressionView } from '../components/Devices/Expression/ExpressionView'

// Re-exports for backward compat with existing consumers (e.g.
// web/src/app/components/PluginCards/Dialogs/ExpressionOverlay.tsx
// imports `ExpressionView` and `CcChannelPair` from this module).
export { ExpressionView } from '../components/Devices/Expression/ExpressionView'
export type {
  Assignment,
  CcChannelPair,
  Curve,
  CurvePoint,
  EngineParam,
  ExpressionViewProps,
  ListenResult,
  LiveState,
  LiveStateItem,
  RetimeStats,
} from '../components/Devices/Expression/expressionTypes'

export function ExpressionPage() {
  return <ExpressionView />
}

export default ExpressionPage

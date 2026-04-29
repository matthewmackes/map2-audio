// Snapshot editor polling-cadence hook (T2472 prep). Consolidates
// the three useRealtimeCadence calls the page makes for read-side
// queries — standard / fast / meter — so the upcoming
// useSnapshotEditorData extraction can consume one shared cadence
// object instead of three duplicate hook calls.
//
// Stays in its own file so the cadence wiring is testable in
// isolation and the page-monolith can drop the inline
// useRealtimeCadence calls when the data hook lands.

import { useRealtimeCadence } from '../../hooks/useRealtimeCadence'

export interface SnapshotEditorCadences {
  standard: number | false
  fast: number | false
  meter: number | false
}

interface UseSnapshotEditorCadencesArgs {
  routeActive: boolean
}

export function useSnapshotEditorCadences(
  { routeActive }: UseSnapshotEditorCadencesArgs,
): SnapshotEditorCadences {
  const standard = useRealtimeCadence({
    routeActive,
    visibleMs: 5_000,
    hiddenMs: 20_000,
    inactiveMs: false,
  })
  const fast = useRealtimeCadence({
    routeActive,
    visibleMs: 2_000,
    hiddenMs: 10_000,
    inactiveMs: false,
  })
  const meter = useRealtimeCadence({
    routeActive,
    visibleMs: 1_000,
    hiddenMs: 5_000,
    inactiveMs: false,
  })

  return { standard, fast, meter }
}

// Snapshot editor read-query consolidation (T2472 slice 2).
//
// Lifts a domain-bounded group of `useQuery` calls out of the
// SnapshotEditorPageContent monolith into a single hook. This first
// slice covers the "static catalog" group:
//   - chainsQuery        — list of all chains
//   - pluginsQuery       — discovered LV2 plugin catalog
//   - presetsQuery       — chain preset library
//
// All three queries are page-wide, parameter-free, and share the
// same conceptual role: long-lived catalog data the page reads.
// Lifting them into a sibling hook is bit-identical:
//
//   - queryKey arrays are reproduced verbatim (`['chains']`,
//     `['plugins', 'discover']`, `['chains', 'presets']`)
//   - queryFn closures call the same `chainsApi.list()` /
//     `pluginsApi.discover()` / `chainsApi.listPresets()` factories
//   - refetchInterval / staleTime / refetchOnWindowFocus options
//     reproduced verbatim from the inline calls.
//
// The cache-key bit-identity is what makes this slice safe to ship
// piecewise: existing inline call sites that haven't migrated yet
// still hit the same cache slot the new hook does, so React Query
// dedups them on mount and the WS-driven invalidations from
// mutation `onSuccess` callbacks continue to flow correctly.
//
// Subsequent slices (T2472 slice 3+) lift the runtime / authority /
// audio-health / perf-events groups in the same shape, all keyed
// off this one entry point.

import { useQuery } from '@tanstack/react-query'

import { chainsApi, pluginsApi } from '../../../map2/api'
import type { SnapshotEditorCadences } from './useSnapshotEditorCadences'

export interface UseSnapshotEditorReadQueriesArgs {
  cadences: SnapshotEditorCadences
}

/**
 * Static catalog read-queries: chains list, plugins discover, presets list.
 *
 * @returns the three live `UseQueryResult` objects in the shape they had
 *   when inlined in `SnapshotEditorPageContent.tsx` lines 811-829.
 */
export function useSnapshotEditorCatalogReadQueries({
  cadences,
}: UseSnapshotEditorReadQueriesArgs) {
  const chainsQuery = useQuery({
    queryKey: ['chains'],
    queryFn: () => chainsApi.list(),
    refetchInterval: cadences.standard,
  })

  const pluginsQuery = useQuery({
    queryKey: ['plugins', 'discover'],
    queryFn: () => pluginsApi.discover(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  })

  const presetsQuery = useQuery({
    queryKey: ['chains', 'presets'],
    queryFn: () => chainsApi.listPresets(),
  })

  return {
    chainsQuery,
    pluginsQuery,
    presetsQuery,
  }
}

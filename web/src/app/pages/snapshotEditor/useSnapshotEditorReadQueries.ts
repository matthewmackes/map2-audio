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

import { chainsApi, pluginsApi, midiApiV2 } from '../../../map2/api'
import type { JuceGridMidiScope } from '../../stores/snapshotEditorStore'
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

// ============================================================================
// T2472 slice 3 — MIDI status / learn-status / mappings group.
//
// Three queries that together describe the live MIDI state of the
// snapshot editor:
//
//   - midiStatusQuery    — keyed `['midi', 'status']`, fast-cadence poll
//   - midiLearnStatusQuery — keyed `['midi', 'learn', 'status']`,
//                            cadence depends on `midiLearnActive` flag
//                            + the live `learning` field on the response
//   - midiMappingsQuery  — keyed
//                          `['midi', 'mappings', 'juce-grid', scope,
//                           chainId, uri-or-null, position-or-null]`,
//                          query body branches on (scope, chainId,
//                          plugin uri/position).
//
// Cache-key bit-identity preserved for all three. The mappings
// queryKey embeds the dynamic params verbatim — same shape as the
// inline call site at SnapshotEditorPageContent.tsx:840.

export interface UseSnapshotEditorMidiReadQueriesArgs {
  cadences: SnapshotEditorCadences
  midiScope: JuceGridMidiScope
  midiLearnActive: boolean
  activeFlowChainId: number | null
  selectedPluginUri: string | null
  selectedPluginPosition: number | null
}

export function useSnapshotEditorMidiReadQueries({
  cadences,
  midiScope,
  midiLearnActive,
  activeFlowChainId,
  selectedPluginUri,
  selectedPluginPosition,
}: UseSnapshotEditorMidiReadQueriesArgs) {
  const midiStatusQuery = useQuery({
    queryKey: ['midi', 'status'],
    queryFn: midiApiV2.getStatus,
    refetchInterval: cadences.fast,
  })

  const midiLearnStatusQuery = useQuery({
    queryKey: ['midi', 'learn', 'status'],
    queryFn: midiApiV2.getLearnStatus,
    refetchInterval: (query) => {
      const learnStatus = query.state.data as { learning?: boolean } | undefined
      return midiLearnActive || learnStatus?.learning ? cadences.meter : cadences.fast
    },
  })

  const midiMappingsQuery = useQuery({
    queryKey: [
      'midi',
      'mappings',
      'juce-grid',
      midiScope,
      activeFlowChainId,
      selectedPluginUri ?? null,
      selectedPluginPosition ?? null,
    ],
    queryFn: () => {
      if (midiScope === 'selected-plugin' && selectedPluginUri) {
        return midiApiV2.getMappings({
          chain_id: activeFlowChainId ?? undefined,
          plugin_uri: selectedPluginUri,
        })
      }

      if (midiScope === 'active-chain' && activeFlowChainId !== null) {
        return midiApiV2.getMappings({ chain_id: activeFlowChainId })
      }

      return midiApiV2.getMappings()
    },
    refetchInterval: cadences.standard,
  })

  return {
    midiStatusQuery,
    midiLearnStatusQuery,
    midiMappingsQuery,
  }
}

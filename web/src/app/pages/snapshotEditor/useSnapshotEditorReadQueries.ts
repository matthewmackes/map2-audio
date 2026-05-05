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

import { audioApi, chainsApi, metricsApi, midiApiV2, pluginsApi } from '../../../map2/api'
import { fetchJson } from '../../../map2/http'
import type { JuceGridMidiScope } from '../../stores/snapshotEditorStore'
import { API_BASE } from './snapshotEditorApi'
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

// ============================================================================
// T2472 slice 4 — audio engine read group.
//
// Six queries that together describe the live audio-engine state:
//
//   - audioQuery       — `['audio', 'status']`, standard cadence
//   - audioLevelsQuery — `['audio', 'levels']`, meter cadence
//   - jackQuery        — `['metrics', 'jack']`, fast cadence
//   - portsQuery       — `['audio', 'ports']`, slow cadence
//   - routingQuery     — `['audio', 'routing']`, standard cadence
//   - activeFlowChainRoutingQuery — `['audio', 'routing', 'chain', chainId]`,
//                                    standard cadence, enabled when
//                                    chainId !== null
//   - expressionEngineParametersQuery — `['expression-engine-parameters',
//                                        'snapshot-editor']`, 60s staleTime,
//                                        no refetch interval
//
// All seven queryKeys reproduced verbatim. The chain-routing query's
// dynamic chainId embeds verbatim into the cache key.

export interface UseSnapshotEditorAudioReadQueriesArgs {
  cadences: SnapshotEditorCadences
  activeFlowChainId: number | null
}

export function useSnapshotEditorAudioReadQueries({
  cadences,
  activeFlowChainId,
}: UseSnapshotEditorAudioReadQueriesArgs) {
  const audioQuery = useQuery({
    queryKey: ['audio', 'status'],
    queryFn: () => audioApi.getStatus(),
    refetchInterval: cadences.standard,
  })

  const audioLevelsQuery = useQuery({
    queryKey: ['audio', 'levels'],
    queryFn: audioApi.getLevels,
    refetchInterval: cadences.meter,
  })

  const jackQuery = useQuery({
    queryKey: ['metrics', 'jack'],
    queryFn: metricsApi.getJack,
    refetchInterval: cadences.fast,
  })

  const portsQuery = useQuery({
    queryKey: ['audio', 'ports'],
    queryFn: () => audioApi.getPorts(),
    refetchInterval: cadences.slow,
  })

  const routingQuery = useQuery({
    queryKey: ['audio', 'routing'],
    queryFn: () => audioApi.getRouting(),
    refetchInterval: cadences.standard,
  })

  const activeFlowChainRoutingQuery = useQuery({
    queryKey: ['audio', 'routing', 'chain', activeFlowChainId],
    queryFn: () => audioApi.getChainRouting(activeFlowChainId!),
    refetchInterval: cadences.standard,
    enabled: activeFlowChainId !== null,
  })

  const expressionEngineParametersQuery = useQuery({
    queryKey: ['expression-engine-parameters', 'snapshot-editor'],
    queryFn: () =>
      fetchJson<{
        parameters: Array<{ id: string; label: string; unit: string; min: number; max: number }>
      }>(`${API_BASE}/v2/engine/parameters`, { cache: 'no-store' }),
    staleTime: 60_000,
  })

  return {
    audioQuery,
    audioLevelsQuery,
    jackQuery,
    portsQuery,
    routingQuery,
    activeFlowChainRoutingQuery,
    expressionEngineParametersQuery,
  }
}

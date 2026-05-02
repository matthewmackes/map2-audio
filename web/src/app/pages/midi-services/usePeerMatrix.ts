/**
 * T2483 loop 18 / iter 177 — usePeerMatrix scaffold (original).
 * T2484 loop 19 / iter 185 — wired to real backend
 *   GET /api/midi/cluster/bindings/matrix (T2484-2). Aggregates
 *   per-cell peer counts SUMMED across every reachable peer.
 *
 * The hook return shape (PeerMatrix + totalPeerBindings + hasPeerData)
 * is unchanged from the iter-177 contract so the iter-178 RoutingPage
 * tests + the iter-118 RoutingPage badge logic stay valid without
 * changes.
 *
 * Per the iter-181 plan D2: the cluster response excludes the local
 * node from `peers` (local is in the `local` slot) so the aggregation
 * here doesn't double-count what useRoutingMatrix already shows.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  midiBindingsApi,
  type BindingConsumerType,
  type BindingSourceType,
  type ClusterBindingsMatrixResponse,
  type ClusterPeerMatrix,
} from '../../../map2/clients/midiBindings'

export type PeerMatrix = Partial<
  Record<BindingSourceType, Partial<Record<BindingConsumerType, number>>>
>

export interface UsePeerMatrixResult {
  peers: PeerMatrix
  /** Sum of peer-side bindings across all cells. */
  totalPeerBindings: number
  /** True when the hook has live cluster data. False when no peers
   *  reachable or query is loading. */
  hasPeerData: boolean
  /** Per-peer error map; keys are node_ids that failed to respond. */
  errors: Record<string, string>
  /** T2484-3 iter 191 — un-aggregated per-peer slices for the
   *  drill-down drawer. Empty when no peers reachable. */
  peerSlices: ClusterPeerMatrix[]
  isLoading: boolean
  isError: boolean
}

function aggregate(
  data: ClusterBindingsMatrixResponse | undefined,
): { peers: PeerMatrix; totalPeerBindings: number; hasPeerData: boolean } {
  const peers: PeerMatrix = {}
  let totalPeerBindings = 0
  if (!data || data.peers.length === 0) {
    return { peers, totalPeerBindings, hasPeerData: false }
  }
  for (const peer of data.peers) {
    for (const [sourceType, row] of Object.entries(peer.matrix)) {
      const src = sourceType as BindingSourceType
      const peerRow = peers[src] ?? {}
      for (const [consumerType, cell] of Object.entries(row)) {
        const cons = consumerType as BindingConsumerType
        const prev = peerRow[cons] ?? 0
        peerRow[cons] = prev + cell.count
        totalPeerBindings += cell.count
      }
      peers[src] = peerRow
    }
  }
  return { peers, totalPeerBindings, hasPeerData: true }
}

export function usePeerMatrix(): UsePeerMatrixResult {
  const query = useQuery({
    queryKey: ['midi-cluster-bindings-matrix'],
    queryFn: () => midiBindingsApi.clusterMatrix(),
    refetchInterval: 5000,
    staleTime: 0,
  })

  const aggregated = useMemo(() => aggregate(query.data), [query.data])

  return {
    ...aggregated,
    errors: query.data?.errors ?? {},
    peerSlices: query.data?.peers ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

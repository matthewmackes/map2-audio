/**
 * T2483 loop 18 / iter 177 — usePeerMatrix scaffold (T2483-9).
 *
 * Per the iter-171 plan D4: scaffolds the peer overlay surface
 * but defers the cluster discovery wiring. Today returns an empty
 * peer-counts map; the iter-118 RoutingPage cells render a `+N`
 * badge when peers > 0 (i.e. never, today). Future loops can wire
 * real per-peer matrix data into this hook without touching the
 * RoutingPage UI.
 *
 * Hook return shape:
 *   peers: Record<sourceType, Record<consumerType, number>> — peer
 *     binding count per cell, OVER AND ABOVE the local-node count.
 *
 * Today's empty map means RoutingPage cells render no peer badge.
 * Operators with single-node deployments see no change. Cluster
 * operators see the placeholder until a future loop wires data.
 */

import type { BindingConsumerType, BindingSourceType } from '../../../map2/clients/midiBindings'

export type PeerMatrix = Partial<
  Record<BindingSourceType, Partial<Record<BindingConsumerType, number>>>
>

export interface UsePeerMatrixResult {
  peers: PeerMatrix
  /** Sum of peer-side bindings across all cells. 0 today. */
  totalPeerBindings: number
  /** True when the hook has live cluster data (always false today). */
  hasPeerData: boolean
}

export function usePeerMatrix(): UsePeerMatrixResult {
  // T2483-9 iter 177 — placeholder. Future loops swap this for a
  // TanStack Query against /api/midi/cluster/bindings/matrix or
  // similar. Until then, return empty + hasPeerData=false so the
  // RoutingPage knows not to render any peer affordance.
  return {
    peers: {},
    totalPeerBindings: 0,
    hasPeerData: false,
  }
}

/**
 * T2482 loop 12 / iter 117 — useRoutingMatrix hook.
 *
 * Aggregates /api/midi/bindings across multiple consumer_types into
 * a source_type × consumer_type matrix shape. Backed by TanStack
 * Query — invalidations from the iter-104/105/106 mutations cascade
 * here automatically (queryKey shares the 'midi-bindings-list' root).
 *
 * Per the iter-111 plan §1, GET /bindings rejects unfiltered queries;
 * we fan out one query per consumer_type with consumer_id='*' and
 * stitch the results together client-side. This is acceptable because:
 *   - the count endpoint already pre-confirms how many bindings exist
 *   - per-consumer-type queries hit the same SQL index path
 *   - 5s polling cadence amortizes the fan-out cost
 */

import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'

import {
  midiBindingsApi,
  BINDING_CONSUMER_TYPES,
  BINDING_SOURCE_TYPES,
  type BindingConsumerType,
  type BindingSourceType,
  type MidiBindingRead,
} from '../../../map2/clients/midiBindings'

/**
 * Cell value for the source_type × consumer_type matrix.
 */
export interface RoutingMatrixCell {
  count: number
  enabledCount: number
}

/**
 * Materialized matrix shape:
 *   matrix[sourceType][consumerType] = { count, enabledCount }
 */
export type RoutingMatrix = Record<BindingSourceType, Record<BindingConsumerType, RoutingMatrixCell>>

export interface UseRoutingMatrixResult {
  matrix: RoutingMatrix
  rowTotals: Record<BindingSourceType, number>
  colTotals: Record<BindingConsumerType, number>
  totalBindings: number
  isLoading: boolean
  isError: boolean
}

function emptyMatrix(): RoutingMatrix {
  const out = {} as RoutingMatrix
  for (const src of BINDING_SOURCE_TYPES) {
    const row = {} as Record<BindingConsumerType, RoutingMatrixCell>
    for (const cons of BINDING_CONSUMER_TYPES) {
      row[cons] = { count: 0, enabledCount: 0 }
    }
    out[src] = row
  }
  return out
}

export function useRoutingMatrix(): UseRoutingMatrixResult {
  const queries = useQueries({
    queries: BINDING_CONSUMER_TYPES.map((consumerType) => ({
      queryKey: ['midi-bindings-list', { consumer_type: consumerType, consumer_id: '*' }],
      queryFn: () =>
        midiBindingsApi.list({ consumer_type: consumerType, consumer_id: '*' }),
      refetchInterval: 5000,
      staleTime: 0,
    })),
  })

  const aggregated = useMemo(() => {
    const matrix = emptyMatrix()
    const rowTotals = {} as Record<BindingSourceType, number>
    const colTotals = {} as Record<BindingConsumerType, number>
    for (const src of BINDING_SOURCE_TYPES) rowTotals[src] = 0
    for (const cons of BINDING_CONSUMER_TYPES) colTotals[cons] = 0
    let totalBindings = 0

    queries.forEach((q, idx) => {
      const consumerType = BINDING_CONSUMER_TYPES[idx]
      if (!q.data) return
      for (const binding of q.data as MidiBindingRead[]) {
        // Defensive: a binding's consumer_type could differ from the
        // query filter under race conditions or backend extensions.
        const cons = binding.consumer_type as BindingConsumerType
        const src = binding.source_type as BindingSourceType
        const row = matrix[src]
        if (!row) continue  // unknown source_type — skip rather than crash
        const cell = row[cons]
        if (!cell) continue
        cell.count += 1
        if (binding.enabled) cell.enabledCount += 1
        rowTotals[src] = (rowTotals[src] ?? 0) + 1
        if (cons === consumerType) {
          colTotals[cons] = (colTotals[cons] ?? 0) + 1
        }
        totalBindings += 1
      }
    })

    return { matrix, rowTotals, colTotals, totalBindings }
  }, [queries])

  const isLoading = queries.some((q) => q.isLoading)
  const isError = queries.some((q) => q.isError)

  return {
    ...aggregated,
    isLoading,
    isError,
  }
}

/**
 * T2482 loop 12 / iter 117 — useRoutingMatrix data hook (original).
 * T2483 loop 17 / iter 164 — refactored from a 10-query fan-out to
 *   a single query against the new GET /api/midi/bindings/matrix
 *   endpoint (T2483-8). Hook return shape unchanged so
 *   MidiServicesRoutingPage is untouched.
 *
 * Per the iter-161 plan D2: the hook normalizes the wire shape so
 * downstream consumers don't need to change.
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  midiBindingsApi,
  BINDING_CONSUMER_TYPES,
  BINDING_SOURCE_TYPES,
  type BindingConsumerType,
  type BindingSourceType,
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
  const query = useQuery({
    queryKey: ['midi-bindings-matrix'],
    queryFn: () => midiBindingsApi.matrix(),
    refetchInterval: 5000,
    staleTime: 0,
  })

  const aggregated = useMemo(() => {
    const matrix = emptyMatrix()
    const rowTotals = {} as Record<BindingSourceType, number>
    const colTotals = {} as Record<BindingConsumerType, number>
    for (const src of BINDING_SOURCE_TYPES) rowTotals[src] = 0
    for (const cons of BINDING_CONSUMER_TYPES) colTotals[cons] = 0
    let totalBindings = 0

    if (!query.data) {
      return { matrix, rowTotals, colTotals, totalBindings }
    }

    // Defensive: backend's matrix dict only carries non-empty groups
    // (per the iter-163 test_omits_empty_groups). The full vocab
    // grid is initialized above; we only fill the populated cells.
    // Unknown vocab values from backend extensions are skipped.
    for (const [sourceType, row] of Object.entries(query.data.matrix)) {
      const src = sourceType as BindingSourceType
      const matrixRow = matrix[src]
      if (!matrixRow) continue
      for (const [consumerType, cell] of Object.entries(row)) {
        const cons = consumerType as BindingConsumerType
        const matrixCell = matrixRow[cons]
        if (!matrixCell) continue
        matrixCell.count = cell.count
        matrixCell.enabledCount = cell.enabled_count
        rowTotals[src] = (rowTotals[src] ?? 0) + cell.count
        colTotals[cons] = (colTotals[cons] ?? 0) + cell.count
      }
    }
    totalBindings = query.data.total_bindings

    return { matrix, rowTotals, colTotals, totalBindings }
  }, [query.data])

  return {
    ...aggregated,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

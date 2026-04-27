/**
 * T2454-G — useSnapshotPinDetails
 *
 * Fetches the `SnapshotDetail` for each pinned snapshot id (≤ 5) so the
 * Preload Slots panel can render:
 *   - lock state (`is_locked`)
 *   - MIDI Program Change binding (`program_number`)
 *   - the signal chain preview (chain[0] plugins → pedal tiles)
 *
 * One TanStack Query per pin keyed `['snapshot-detail', id]`; reuses the
 * existing snapshots client. We deliberately avoid `useQueries` to keep
 * the dependency surface small and the cache keys explicit. Five HTTP
 * calls per Preload-Slots render is fine — they're cached and the panel
 * is mounted once on the editor page.
 */

import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'

import { snapshotsApi } from '../../map2/clients/snapshots'
import type { SnapshotDetail } from '../../map2/types'

const DETAIL_STALE_MS = 30_000

export interface PinDetail {
  snapshotId: number
  detail: SnapshotDetail | undefined
  isLoading: boolean
  error: unknown
}

export interface SnapshotPinDetailsApi {
  /** Map of snapshotId → loaded `SnapshotDetail` (or undefined while loading). */
  detailsById: Map<number, SnapshotDetail>
  /** Per-pin status, indexed by snapshotId. */
  statusById: Map<number, { isLoading: boolean; error: unknown }>
  /** True while any pin is still loading its detail for the first time. */
  isAnyLoading: boolean
  /** Manually refresh all details (e.g., after a PATCH that mutates one). */
  refetchAll: () => Promise<void>
  /** Refresh one snapshot's detail. */
  refetch: (snapshotId: number) => Promise<void>
}

export function useSnapshotPinDetails(pinnedIds: ReadonlyArray<number>): SnapshotPinDetailsApi {
  const queries = useQueries({
    queries: pinnedIds.map((id) => ({
      queryKey: ['snapshot-detail', id] as const,
      queryFn: () => snapshotsApi.get(id),
      staleTime: DETAIL_STALE_MS,
    })),
  })

  const detailsById = useMemo(() => {
    const map = new Map<number, SnapshotDetail>()
    pinnedIds.forEach((id, idx) => {
      const data = queries[idx]?.data
      if (data) map.set(id, data)
    })
    return map
  }, [pinnedIds, queries])

  const statusById = useMemo(() => {
    const map = new Map<number, { isLoading: boolean; error: unknown }>()
    pinnedIds.forEach((id, idx) => {
      const q = queries[idx]
      map.set(id, { isLoading: q?.isLoading ?? false, error: q?.error ?? null })
    })
    return map
  }, [pinnedIds, queries])

  const isAnyLoading = queries.some((q) => q.isLoading)

  const refetchAll = async () => {
    await Promise.all(queries.map((q) => q.refetch()))
  }

  const refetch = async (snapshotId: number) => {
    const idx = pinnedIds.indexOf(snapshotId)
    if (idx === -1) return
    await queries[idx]?.refetch()
  }

  return { detailsById, statusById, isAnyLoading, refetchAll, refetch }
}

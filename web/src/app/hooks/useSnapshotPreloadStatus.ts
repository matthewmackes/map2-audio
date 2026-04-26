/**
 * T2454 slice 1 — useSnapshotPreloadStatus
 *
 * Polls `/api/snapshots/preload-status` so the editor's Preload Slots panel
 * can render warm/cold dots, and `Go Live` can gate the live-launch button on
 * the target snapshot's warm state.
 *
 * Polling interval is intentionally short (5s) — the backend reconciler ticks
 * every 30s but operator-driven pin/unpin and manual `preload()` calls happen
 * on demand, and the operator wants the dot to switch over within a couple
 * seconds, not wait for the next reconciler tick.
 */

import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'

import {
  snapshotsApi,
  type SnapshotPreloadResponse,
  type SnapshotPreloadStatusResponse,
} from '../../map2/clients/snapshots'

const STATUS_POLL_INTERVAL_MS = 5_000

export interface SnapshotPreloadStatusApi {
  status: SnapshotPreloadStatusResponse | undefined
  isLoading: boolean
  isFetching: boolean
  error: unknown
  /** True if `snapshot_id` appears as a warm slot in the latest status. */
  isWarm: (snapshotId: number) => boolean
  /** True if `snapshot_id` is pinned (warm or cold). */
  isPinned: (snapshotId: number) => boolean
  refetch: () => void
  /** Manually trigger a warm of `snapshotId`. Resolves to the route's
   *  `SnapshotPreloadResponse`. Used by Go Live cold-gate + the panel's
   *  "warm now" affordance so the operator doesn't have to wait for the
   *  next reconciler tick. */
  preloadNow: (snapshotId: number) => Promise<SnapshotPreloadResponse>
  /** True while `preloadNow` is in flight (any snapshot id). */
  isPreloading: boolean
}

export function useSnapshotPreloadStatus(): SnapshotPreloadStatusApi {
  const query = useQuery({
    queryKey: ['snapshot-preload-status'],
    queryFn: () => snapshotsApi.getPreloadStatus(),
    refetchInterval: STATUS_POLL_INTERVAL_MS,
    staleTime: 0,
  })

  const warmIds = useMemo(() => {
    const set = new Set<number>()
    for (const slot of query.data?.slots ?? []) {
      if (slot.warm) set.add(slot.snapshot_id)
    }
    return set
  }, [query.data])

  const pinnedIds = useMemo(() => {
    const set = new Set<number>()
    for (const slot of query.data?.slots ?? []) {
      set.add(slot.snapshot_id)
    }
    return set
  }, [query.data])

  const preloadMutation = useMutation({
    mutationFn: (snapshotId: number) => snapshotsApi.preload(snapshotId),
    onSuccess: () => {
      void query.refetch()
    },
  })

  const preloadNow = useCallback(
    (snapshotId: number) => preloadMutation.mutateAsync(snapshotId),
    [preloadMutation],
  )

  return {
    status: query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    isWarm: (snapshotId: number) => warmIds.has(snapshotId),
    isPinned: (snapshotId: number) => pinnedIds.has(snapshotId),
    refetch: () => {
      void query.refetch()
    },
    preloadNow,
    isPreloading: preloadMutation.isPending,
  }
}

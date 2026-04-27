/**
 * T2454-G — useSnapshotLive
 *
 * Polls `GET /api/snapshots/live` so the editor's Preload Slots panel can
 * mark whichever pinned slot is currently routing audio (the "live" slot).
 *
 * The shape returned by the route is a `SnapshotDetail` when something is
 * live, and `null` when nothing is. The slots panel only needs the id, so
 * this hook surfaces a minimal `liveSnapshotId` getter alongside the raw
 * detail for callers that want more.
 */

import { useQuery } from '@tanstack/react-query'

import { snapshotsApi } from '../../map2/clients/snapshots'
import type { SnapshotDetail } from '../../map2/types'

const LIVE_POLL_INTERVAL_MS = 5_000

export interface SnapshotLiveApi {
  liveSnapshotId: number | null
  liveSnapshot: SnapshotDetail | null
  isLoading: boolean
  error: unknown
  refetch: () => void
}

export function useSnapshotLive(): SnapshotLiveApi {
  const query = useQuery({
    queryKey: ['snapshot-live'],
    queryFn: async (): Promise<SnapshotDetail | null> => {
      try {
        return await snapshotsApi.getLive()
      } catch {
        // 404 / 503 / no-live-snapshot → treat as "nothing is live"
        return null
      }
    },
    refetchInterval: LIVE_POLL_INTERVAL_MS,
    staleTime: 0,
  })

  return {
    liveSnapshotId: query.data?.id ?? null,
    liveSnapshot: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => {
      void query.refetch()
    },
  }
}

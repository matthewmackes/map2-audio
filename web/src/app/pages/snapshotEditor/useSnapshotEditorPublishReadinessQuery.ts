// Snapshot editor "publish readiness" read query (T2472 read consolidation — deferred slice 1).
//
// Lifts the heroPublishReadinessQuery off the page. Drives the
// SnapshotPublishStatus hero pill + contextual actions. Polled at 5s to
// mirror SnapshotPublishPage. The queryKey is keyed by snapshot id (or
// null when no active snapshot) so the cache is shared with any other
// consumer using the same key shape.

import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { snapshotsApi } from '../../../map2/clients/snapshots'
import type { SnapshotDetail, SnapshotPublishReadiness } from '../../../map2/types'

export interface UseSnapshotEditorPublishReadinessQueryArgs {
  activeSnapshot: SnapshotDetail | null | undefined
  /**
   * Override polling interval; defaults to 5s to mirror SnapshotPublishPage.
   * Pass `false` to disable polling.
   */
  refetchInterval?: number | false
}

export interface UseSnapshotEditorPublishReadinessQueryResult {
  heroPublishReadinessQuery: UseQueryResult<SnapshotPublishReadiness, Error>
  heroPublishReadiness: SnapshotPublishReadiness | null
}

export function useSnapshotEditorPublishReadinessQuery({
  activeSnapshot,
  refetchInterval = 5_000,
}: UseSnapshotEditorPublishReadinessQueryArgs): UseSnapshotEditorPublishReadinessQueryResult {
  const heroPublishReadinessQuery = useQuery({
    queryKey: ['snapshots', 'publish-readiness', activeSnapshot?.id ?? null],
    queryFn: () => {
      if (!activeSnapshot) throw new Error('No active snapshot')
      return snapshotsApi.getPublishReadiness(activeSnapshot.id)
    },
    enabled: Boolean(activeSnapshot?.id),
    refetchInterval,
  })
  const heroPublishReadiness = heroPublishReadinessQuery.data ?? null

  return { heroPublishReadinessQuery, heroPublishReadiness }
}

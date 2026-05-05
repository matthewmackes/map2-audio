// Snapshot editor "authority active snapshot detail" read query
// (T2472 read consolidation — deferred slice 3).
//
// Lifts the authoritySnapshotDetailQuery off the page. Drives the
// authority-active panel + the snapshot-load-failure InlineNotification
// + the manual `.refetch()` retry button on load failure.
//
// Behavioral parity preserved verbatim:
//   - queryKey shape ['snapshots', 'detail', 'authority-active', authoritySnapshotId]
//     (cache key bit-identical, so any cross-cache invalidation that targets
//     the same key shape continues to hit it).
//   - enabled: authoritySnapshotId != null && !editorSnapshotOverride.
//   - retry: false (one-shot read; the operator gets a manual refetch button
//     for the InlineNotification path).
//   - refetchInterval: caller-supplied (snapshotStandardCadence in production).
//   - 404 → resolves to null instead of throwing (matches the historical
//     behavior so the operator surface treats missing-but-not-broken as
//     "no authority snapshot").
//
// This is the trickiest of the three deferred reads because:
//   - the queryKey depends on `authoritySnapshotId` which is itself derived
//     from a `useMemo` over `committedAudioStateQuery.data?.value`.
//   - the data feeds `controlPlaneSnapshot` and `activeSnapshot` resolvers.
//   - the `.refetch()` is called from a manual retry button on load failure.
//
// All three are preserved in the lifted hook by passing `authoritySnapshotId`
// + `editorSnapshotOverride` as args; the consumer composes the inputs
// upstream (so the `useMemo` lives on the page, but the query call site is
// extracted).

import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import { ApiError } from '../../../map2/http'
import { snapshotsApi } from '../../../map2/clients/snapshots'
import type { SnapshotDetail } from '../../../map2/types'

export interface UseSnapshotEditorAuthoritySnapshotDetailQueryArgs {
  /**
   * The id of the authority-active snapshot, derived from
   * `resolveAuthoritySnapshotId(committedAudioStateQuery.data?.value)`.
   * Pass `null` when there is no authority-active snapshot — the
   * query will be disabled.
   */
  authoritySnapshotId: number | null
  /**
   * When the editor has an in-progress override snapshot, the
   * authority-active query is disabled so the operator UI doesn't
   * fight the override. Mirrors the page's gating exactly.
   */
  editorSnapshotOverride: boolean
  /**
   * Polling cadence; in production this is `snapshotStandardCadence`.
   * Pass `false` to disable polling.
   */
  refetchInterval?: number | false
}

export interface UseSnapshotEditorAuthoritySnapshotDetailQueryResult {
  authoritySnapshotDetailQuery: UseQueryResult<SnapshotDetail | null, Error>
  authoritySnapshotDetail: SnapshotDetail | null
}

export function useSnapshotEditorAuthoritySnapshotDetailQuery({
  authoritySnapshotId,
  editorSnapshotOverride,
  refetchInterval,
}: UseSnapshotEditorAuthoritySnapshotDetailQueryArgs): UseSnapshotEditorAuthoritySnapshotDetailQueryResult {
  const authoritySnapshotDetailQuery = useQuery({
    queryKey: ['snapshots', 'detail', 'authority-active', authoritySnapshotId],
    queryFn: async (): Promise<SnapshotDetail | null> => {
      try {
        return await snapshotsApi.get(authoritySnapshotId as number)
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return null
        }
        throw error
      }
    },
    enabled: authoritySnapshotId != null && !editorSnapshotOverride,
    retry: false,
    refetchInterval,
  })

  const authoritySnapshotDetail = authoritySnapshotDetailQuery.data ?? null

  return { authoritySnapshotDetailQuery, authoritySnapshotDetail }
}

// Snapshot editor "version history revisions" read query (T2472 read consolidation — deferred slice 2).
//
// Lifts the snapshotRevisionsQuery off the page. Drives the version-history
// modal's revision list. The queryKey is keyed by the editor's current
// snapshot id (active or authority fallback) so the cache stays shared
// with mutations that invalidate ['snapshots', 'revisions', id] (slice 11).

import { useQuery, type UseQueryResult } from '@tanstack/react-query'

import {
  snapshotsApi,
  type SnapshotRevisionListResponse,
} from '../../../map2/clients/snapshots'

export interface UseSnapshotEditorRevisionsQueryArgs {
  /**
   * The id of the snapshot whose revisions we should list. Pass `null`
   * when there is no active or authority snapshot loaded — the query will
   * be disabled.
   */
  currentEditorSnapshotId: number | null
  /**
   * Only fetch when the version-history modal is open. The historical
   * page-level query gated on `showVersionHistoryModal && id != null`.
   */
  showVersionHistoryModal: boolean
}

export interface UseSnapshotEditorRevisionsQueryResult {
  snapshotRevisionsQuery: UseQueryResult<SnapshotRevisionListResponse, Error>
}

export function useSnapshotEditorRevisionsQuery({
  currentEditorSnapshotId,
  showVersionHistoryModal,
}: UseSnapshotEditorRevisionsQueryArgs): UseSnapshotEditorRevisionsQueryResult {
  const snapshotRevisionsQuery = useQuery({
    queryKey: ['snapshots', 'revisions', currentEditorSnapshotId],
    queryFn: () => snapshotsApi.listRevisions(currentEditorSnapshotId as number),
    enabled: showVersionHistoryModal && currentEditorSnapshotId != null,
    refetchOnWindowFocus: false,
  })

  return { snapshotRevisionsQuery }
}

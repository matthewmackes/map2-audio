// Snapshot editor "update active snapshot" mutation (T2472 mutation extraction — slice 10).
//
// Lifts updateActiveSnapshotMutation off the page. Saves the current
// editor draft back onto the active snapshot row via snapshotsApi.update
// with create_revision: true, then syncs caches, invalidates the
// revisions query, and rehydrates the editor from the server's response.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'

import {
  flowSnapshotDataToSnapshotPayload,
  snapshotsApi,
  type SnapshotUpdateResponse,
} from '../../../map2/clients/snapshots'
import type { SnapshotDetail, SnapshotDraftData } from '../../../map2/types'
import type { NotificationOptions, NotificationTone } from '../../components/Toasts'
import type { HydrateEditorFromSnapshotOptions } from './useSnapshotEditorOpenEditorSnapshotMutation'

export interface UseSnapshotEditorUpdateActiveSnapshotMutationArgs {
  activeSnapshot: SnapshotDetail | null | undefined
  currentSnapshotDraft: SnapshotDraftData
  syncSnapshotDetailCaches: (
    snapshot: SnapshotDetail,
    options?: { updateAuthorityActiveSnapshot?: boolean }
  ) => void
  hydrateEditorFromSnapshot: (
    detail: SnapshotDetail,
    options?: HydrateEditorFromSnapshotOptions
  ) => void
  pushToast: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
}

export interface UseSnapshotEditorUpdateActiveSnapshotMutationResult {
  updateActiveSnapshotMutation: UseMutationResult<SnapshotUpdateResponse, Error, void>
}

export function useSnapshotEditorUpdateActiveSnapshotMutation({
  activeSnapshot,
  currentSnapshotDraft,
  syncSnapshotDetailCaches,
  hydrateEditorFromSnapshot,
  pushToast,
}: UseSnapshotEditorUpdateActiveSnapshotMutationArgs): UseSnapshotEditorUpdateActiveSnapshotMutationResult {
  const queryClient = useQueryClient()

  const updateActiveSnapshotMutation = useMutation({
    mutationFn: async () => {
      if (!activeSnapshot) {
        throw new Error('No active snapshot to update')
      }
      if (activeSnapshot.is_locked) {
        throw new Error('Unlock snapshot before updating it')
      }
      return snapshotsApi.update(activeSnapshot.id, {
        ...flowSnapshotDataToSnapshotPayload(currentSnapshotDraft),
        create_revision: true,
      })
    },
    onSuccess: (response) => {
      syncSnapshotDetailCaches(response.snapshot)
      queryClient.invalidateQueries({ queryKey: ['snapshots', 'revisions', response.snapshot.id] })
      hydrateEditorFromSnapshot(response.snapshot, {
        toastMessage: 'Snapshot updated',
        invalidateSnapshots: true,
        resetUndoHistory: false,
      })
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot', 'error')
    },
  })

  return { updateActiveSnapshotMutation }
}

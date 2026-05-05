// Snapshot editor "restore revision" mutation (T2472 mutation extraction — slice 11).
//
// Lifts restoreSnapshotRevisionMutation off the page. The mutation calls
// snapshotsApi.restoreRevision, then on success rebuilds the editor draft
// from the restored detail, syncs caches, invalidates the revisions query,
// closes the version-history workspace, rehydrates the editor with the
// "Restored revision N" toast, and pushes an undo/redo step describing the
// restore.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'

import {
  snapshotsApi,
  type SnapshotRevisionRestoreResponse,
} from '../../../map2/clients/snapshots'
import { buildSnapshotEditorLiveSnapshotHydration } from '../../components/SnapshotEditor/snapshotEditorLiveSnapshotHydration'
import type { ChainsResponse, SnapshotDetail, SnapshotDraftData } from '../../../map2/types'
import type { NotificationOptions, NotificationTone } from '../../components/Toasts'
import type { HydrateEditorFromSnapshotOptions } from './useSnapshotEditorOpenEditorSnapshotMutation'

export interface RestoreSnapshotRevisionParams {
  snapshotId: number
  revisionNumber: number
}

export interface UseSnapshotEditorRestoreRevisionMutationArgs {
  syncSnapshotDetailCaches: (
    snapshot: SnapshotDetail,
    options?: { updateAuthorityActiveSnapshot?: boolean }
  ) => void
  hydrateEditorFromSnapshot: (
    detail: SnapshotDetail,
    options?: HydrateEditorFromSnapshotOptions
  ) => void
  closeVersionHistoryWorkspace: () => void
  recordSnapshotUndoRedoStep: (nextDraft: SnapshotDraftData, description: string) => void
  pushToast: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
}

export interface UseSnapshotEditorRestoreRevisionMutationResult {
  restoreSnapshotRevisionMutation: UseMutationResult<
    SnapshotRevisionRestoreResponse,
    Error,
    RestoreSnapshotRevisionParams
  >
}

export function useSnapshotEditorRestoreRevisionMutation({
  syncSnapshotDetailCaches,
  hydrateEditorFromSnapshot,
  closeVersionHistoryWorkspace,
  recordSnapshotUndoRedoStep,
  pushToast,
}: UseSnapshotEditorRestoreRevisionMutationArgs): UseSnapshotEditorRestoreRevisionMutationResult {
  const queryClient = useQueryClient()

  const restoreSnapshotRevisionMutation = useMutation({
    mutationFn: async ({ snapshotId, revisionNumber }: RestoreSnapshotRevisionParams) =>
      snapshotsApi.restoreRevision(snapshotId, revisionNumber),
    onSuccess: (response) => {
      const restoredDraft = buildSnapshotEditorLiveSnapshotHydration(
        response.snapshot,
        queryClient.getQueryData<ChainsResponse>(['chains']),
      ).snapshotData
      syncSnapshotDetailCaches(response.snapshot)
      queryClient.invalidateQueries({
        queryKey: ['snapshots', 'revisions', response.snapshot.id],
      })
      closeVersionHistoryWorkspace()
      hydrateEditorFromSnapshot(response.snapshot, {
        toastMessage: `Restored revision ${response.restored_revision_number}`,
        invalidateSnapshots: true,
        resetUndoHistory: false,
      })
      recordSnapshotUndoRedoStep(
        restoredDraft,
        `Restore revision ${response.restored_revision_number}`,
      )
    },
    onError: (error) => {
      pushToast(
        error instanceof Error ? error.message : 'Failed to restore snapshot revision',
        'error',
      )
    },
  })

  return { restoreSnapshotRevisionMutation }
}

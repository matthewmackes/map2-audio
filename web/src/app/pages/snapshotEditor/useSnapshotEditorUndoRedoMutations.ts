// Snapshot editor undo/redo mutations (T2472 mutation extraction — slice 3).
//
// Lifts the undo/redo TanStack mutations out of the
// SnapshotEditorPageContent monolith. Behavioral parity is exact:
// each mutation pulls the previous/next draft from the
// SnapshotEditorUndoRedoState, applies it via the page-supplied
// `applyDraftPreview` callback, and on error rolls the cursor back
// (undo-failed → redo, redo-failed → undo).

import { useMutation, type UseMutationResult } from '@tanstack/react-query'

import type { SnapshotDraftData } from '../../../map2/types'
import type { SnapshotEditorUndoRedoState } from '../../components/SnapshotEditor/useSnapshotEditorUndoRedo'
import type { NotificationOptions, NotificationTone } from '../../components/Toasts'

export interface UseSnapshotEditorUndoRedoMutationsArgs {
  snapshotUndoRedo: SnapshotEditorUndoRedoState
  applyDraftPreview: (draft: SnapshotDraftData) => Promise<unknown>
  pushToast: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
}

export interface UseSnapshotEditorUndoRedoMutationsResult {
  undoMutation: UseMutationResult<unknown, Error, void>
  redoMutation: UseMutationResult<unknown, Error, void>
}

export function useSnapshotEditorUndoRedoMutations({
  snapshotUndoRedo,
  applyDraftPreview,
  pushToast,
}: UseSnapshotEditorUndoRedoMutationsArgs): UseSnapshotEditorUndoRedoMutationsResult {
  const undoMutation = useMutation({
    mutationFn: async () => {
      const draft = snapshotUndoRedo.undo()
      if (!draft) {
        throw new Error('Nothing to undo')
      }
      return applyDraftPreview(draft)
    },
    onSuccess: () => {
      pushToast('Undo successful', 'success')
    },
    onError: (error) => {
      snapshotUndoRedo.redo()
      pushToast(`Undo failed: ${error}`, 'error')
    },
  })

  const redoMutation = useMutation({
    mutationFn: async () => {
      const draft = snapshotUndoRedo.redo()
      if (!draft) {
        throw new Error('Nothing to redo')
      }
      return applyDraftPreview(draft)
    },
    onSuccess: () => {
      pushToast('Redo successful', 'success')
    },
    onError: (error) => {
      snapshotUndoRedo.undo()
      pushToast(`Redo failed: ${error}`, 'error')
    },
  })

  return { undoMutation, redoMutation }
}

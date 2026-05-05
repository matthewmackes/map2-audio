// Snapshot editor "open draft" mutation (T2472 mutation extraction — slice 9).
//
// Lifts openEditorSnapshotMutation off the page. The mutation calls
// snapshotsApi.openDraft, then on success either clears or sets the
// editor snapshot override depending on whether the loaded snapshot is
// the current control-plane authority, and finally hydrates the editor.

import { useMutation, type UseMutationResult } from '@tanstack/react-query'

import { snapshotsApi } from '../../../map2/clients/snapshots'
import type { SnapshotDetail } from '../../../map2/types'
import type { NotificationOptions, NotificationTone } from '../../components/Toasts'

export interface HydrateEditorFromSnapshotOptions {
  toastMessage?: string | null
  toastDurationMs?: number
  toast?: { message: string; tone?: NotificationTone; options?: NotificationOptions } | null
  resetSelectedBlock?: boolean
  invalidateSnapshots?: boolean
  resetUndoHistory?: boolean
}

export interface OpenEditorSnapshotResponse {
  snapshot: SnapshotDetail
}

export interface UseSnapshotEditorOpenEditorSnapshotMutationArgs {
  controlPlaneSnapshot: SnapshotDetail | null | undefined
  setEditorSnapshotOverride: (snapshot: SnapshotDetail | null) => void
  hydrateEditorFromSnapshot: (
    detail: SnapshotDetail,
    options?: HydrateEditorFromSnapshotOptions
  ) => void
  pushToast: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
}

export interface UseSnapshotEditorOpenEditorSnapshotMutationResult {
  openEditorSnapshotMutation: UseMutationResult<OpenEditorSnapshotResponse, Error, number>
}

export function useSnapshotEditorOpenEditorSnapshotMutation({
  controlPlaneSnapshot,
  setEditorSnapshotOverride,
  hydrateEditorFromSnapshot,
  pushToast,
}: UseSnapshotEditorOpenEditorSnapshotMutationArgs): UseSnapshotEditorOpenEditorSnapshotMutationResult {
  const openEditorSnapshotMutation = useMutation({
    mutationFn: (snapshotId: number) =>
      snapshotsApi.openDraft(snapshotId) as Promise<OpenEditorSnapshotResponse>,
    onSuccess: (response) => {
      const detail = response.snapshot
      if (controlPlaneSnapshot?.id === detail.id) {
        setEditorSnapshotOverride(null)
      } else {
        setEditorSnapshotOverride(detail)
      }
      hydrateEditorFromSnapshot(detail, {
        toastMessage: `Loaded: ${detail.name}`,
        resetSelectedBlock: true,
      })
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to load snapshot', 'error')
    },
  })

  return { openEditorSnapshotMutation }
}

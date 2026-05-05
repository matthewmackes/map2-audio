// Snapshot editor active-snapshot lock toggle (T2472 mutation extraction — slice 6).
//
// Lifts the toggleActiveSnapshotLockMutation off the page. The mutation
// flips `is_locked` on the active snapshot via snapshotsApi.update,
// syncs the detail caches, invalidates the snapshots list, and toasts.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'

import { snapshotsApi } from '../../../map2/clients/snapshots'
import type { SnapshotDetail } from '../../../map2/types'
import type { NotificationOptions, NotificationTone } from '../../components/Toasts'

export interface UseSnapshotEditorLockMutationArgs {
  activeSnapshot: SnapshotDetail | null | undefined
  syncSnapshotDetailCaches: (snapshot: SnapshotDetail) => void
  pushToast: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
}

export interface UseSnapshotEditorLockMutationResult {
  toggleActiveSnapshotLockMutation: UseMutationResult<
    { snapshot: SnapshotDetail },
    Error,
    void
  >
}

export function useSnapshotEditorLockMutation({
  activeSnapshot,
  syncSnapshotDetailCaches,
  pushToast,
}: UseSnapshotEditorLockMutationArgs): UseSnapshotEditorLockMutationResult {
  const queryClient = useQueryClient()

  const toggleActiveSnapshotLockMutation = useMutation({
    mutationFn: async () => {
      if (!activeSnapshot) {
        throw new Error('No active snapshot to lock')
      }
      return snapshotsApi.update(activeSnapshot.id, {
        is_locked: !activeSnapshot.is_locked,
      }) as Promise<{ snapshot: SnapshotDetail }>
    },
    onSuccess: (response) => {
      syncSnapshotDetailCaches(response.snapshot)
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      pushToast(
        response.snapshot.is_locked ? 'Snapshot locked' : 'Snapshot unlocked',
        'success'
      )
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot lock', 'error')
    },
  })

  return { toggleActiveSnapshotLockMutation }
}

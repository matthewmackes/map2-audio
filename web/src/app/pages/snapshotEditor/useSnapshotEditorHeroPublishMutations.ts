// Snapshot editor hero-publish mutations (T2472 mutation extraction — slice 4).
//
// Lifts the three "hero publish" mutations off the SnapshotEditorPageContent
// monolith:
//   - heroConfirmPublishMutation  -> snapshotsApi.activate
//   - heroReconcilePublishMutation -> snapshotsApi.retryPublish
//   - heroOverwriteLiveMutation   -> snapshotsApi.activate (overwrite path)
//
// All three share the same dependency surface (activeSnapshot, queryClient,
// pushToast) and the same cache-invalidation pair on success — bundling
// them keeps the boundary tight.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'

import { snapshotsApi } from '../../../map2/clients/snapshots'
import type { SnapshotDetail } from '../../../map2/types'
import type { NotificationOptions, NotificationTone } from '../../components/Toasts'

export interface UseSnapshotEditorHeroPublishMutationsArgs {
  activeSnapshot: SnapshotDetail | null | undefined
  pushToast: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
}

export interface UseSnapshotEditorHeroPublishMutationsResult {
  heroConfirmPublishMutation: UseMutationResult<unknown, Error, void>
  heroReconcilePublishMutation: UseMutationResult<unknown, Error, void>
  heroOverwriteLiveMutation: UseMutationResult<unknown, Error, void>
  heroPublishActionPending: boolean
}

export function useSnapshotEditorHeroPublishMutations({
  activeSnapshot,
  pushToast,
}: UseSnapshotEditorHeroPublishMutationsArgs): UseSnapshotEditorHeroPublishMutationsResult {
  const queryClient = useQueryClient()

  const invalidateAfterPublish = () => {
    void queryClient.invalidateQueries({
      queryKey: ['snapshots', 'publish-readiness', activeSnapshot?.id ?? null],
    })
    void queryClient.invalidateQueries({
      queryKey: ['snapshots', 'detail', activeSnapshot?.id ?? null],
    })
  }

  const heroConfirmPublishMutation = useMutation({
    mutationFn: async () => {
      if (!activeSnapshot) throw new Error('No active snapshot')
      return snapshotsApi.activate(activeSnapshot.id)
    },
    onSuccess: () => {
      invalidateAfterPublish()
      pushToast('Publish confirmed', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to confirm publish', 'error')
    },
  })

  const heroReconcilePublishMutation = useMutation({
    mutationFn: async () => {
      if (!activeSnapshot) throw new Error('No active snapshot')
      return snapshotsApi.retryPublish(activeSnapshot.id)
    },
    onSuccess: () => {
      invalidateAfterPublish()
      pushToast('Reconcile started', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to reconcile', 'error')
    },
  })

  const heroOverwriteLiveMutation = useMutation({
    mutationFn: async () => {
      if (!activeSnapshot) throw new Error('No active snapshot')
      return snapshotsApi.activate(activeSnapshot.id)
    },
    onSuccess: () => {
      invalidateAfterPublish()
      pushToast('Live state overwritten with current draft', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to overwrite live', 'error')
    },
  })

  const heroPublishActionPending =
    heroConfirmPublishMutation.isPending ||
    heroReconcilePublishMutation.isPending ||
    heroOverwriteLiveMutation.isPending

  return {
    heroConfirmPublishMutation,
    heroReconcilePublishMutation,
    heroOverwriteLiveMutation,
    heroPublishActionPending,
  }
}

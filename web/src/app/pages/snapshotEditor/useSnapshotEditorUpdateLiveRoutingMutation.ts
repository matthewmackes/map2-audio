// Snapshot editor "update live routing" mutation (T2472 mutation extraction — slice 14).
//
// Lifts updateLiveSnapshotRoutingMutation off the page. The mutation calls
// snapshotsApi.updateRouting with the routing slice of the next draft and,
// on success, syncs detail caches with updateAuthorityActiveSnapshot:true,
// flips the routingLiveApplyState to 'live-applied', and toasts when the
// snapshot reports routing_mode_changed_live. On error it resets the
// apply-state back to 'idle' and toasts the failure.

import { useMutation, type UseMutationResult } from '@tanstack/react-query'

import {
  flowSnapshotDataToSnapshotPayload,
  snapshotsApi,
} from '../../../map2/clients/snapshots'
import type { SnapshotDetail, SnapshotDraftData } from '../../../map2/types'
import type { SnapshotRoutingLiveApplyState } from '../../utils/snapshotRoutingLiveState'
import type { NotificationOptions, NotificationTone } from '../../components/Toasts'

export type SnapshotRoutingMutationResponse = SnapshotDetail & {
  routing_requires_reactivation?: boolean
  routing_mode_changed_live?: boolean
}

export interface UpdateLiveSnapshotRoutingParams {
  snapshotId: number
  nextDraft: SnapshotDraftData
}

type Updater<T> = T | ((prev: T) => T)

export interface UseSnapshotEditorUpdateLiveRoutingMutationArgs {
  syncSnapshotDetailCaches: (
    snapshot: SnapshotDetail,
    options?: { updateAuthorityActiveSnapshot?: boolean }
  ) => void
  setRoutingLiveApplyState: (state: Updater<SnapshotRoutingLiveApplyState>) => void
  pushToast: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
}

export interface UseSnapshotEditorUpdateLiveRoutingMutationResult {
  updateLiveSnapshotRoutingMutation: UseMutationResult<
    SnapshotRoutingMutationResponse,
    Error,
    UpdateLiveSnapshotRoutingParams
  >
}

export function useSnapshotEditorUpdateLiveRoutingMutation({
  syncSnapshotDetailCaches,
  setRoutingLiveApplyState,
  pushToast,
}: UseSnapshotEditorUpdateLiveRoutingMutationArgs): UseSnapshotEditorUpdateLiveRoutingMutationResult {
  const updateLiveSnapshotRoutingMutation = useMutation({
    mutationFn: async ({
      snapshotId,
      nextDraft,
    }: UpdateLiveSnapshotRoutingParams) =>
      snapshotsApi.updateRouting(
        snapshotId,
        flowSnapshotDataToSnapshotPayload(nextDraft).routing,
      ) as Promise<SnapshotRoutingMutationResponse>,
    onSuccess: (snapshot) => {
      syncSnapshotDetailCaches(snapshot, {
        updateAuthorityActiveSnapshot: true,
      })
      setRoutingLiveApplyState('live-applied')
      if (snapshot.routing_mode_changed_live) {
        pushToast('Live routing mode updated', 'success')
      }
    },
    onError: (error) => {
      setRoutingLiveApplyState('idle')
      pushToast(
        error instanceof Error ? error.message : 'Failed to update live routing',
        'error',
      )
    },
  })

  return { updateLiveSnapshotRoutingMutation }
}

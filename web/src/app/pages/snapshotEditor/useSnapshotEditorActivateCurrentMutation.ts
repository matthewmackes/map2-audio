// Snapshot editor "activate current snapshot" mutation (T2472 mutation extraction — slice 13).
//
// Lifts activateCurrentSnapshotMutation off the page. Activates a snapshot
// via snapshotsApi.activate; manages the full pending/confirmed/failed
// go-live state machine, primes control-plane and runtime-live caches,
// and on success rehydrates the editor with the activation toast pair.
// On failure it captures the failure detail/reason, sets the failed-id,
// clears any in-flight pending state for the same id, and pushes the
// activation-failure stage toast.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'

import {
  snapshotsApi,
  type SnapshotActivationResponse,
} from '../../../map2/clients/snapshots'
import type { SnapshotDetail, SnapshotActivationIntent } from '../../../map2/types'
import {
  SNAPSHOT_ACTIVATION_TOAST_DURATION_MS,
  buildSnapshotActivationFailureStageToast,
  buildSnapshotActivationFailureToastMessage,
  buildSnapshotActivationStageToast,
  buildSnapshotActivationToastMessage,
  extractSnapshotActivationFailureDetail,
  extractSnapshotActivationFailureReason,
} from '../../utils/snapshotActivationToast'
import type { NotificationOptions, NotificationTone } from '../../components/Toasts'
import type { HydrateEditorFromSnapshotOptions } from './useSnapshotEditorOpenEditorSnapshotMutation'

export interface ActivateCurrentSnapshotResult {
  snapshot_id: number
  snapshot_data: SnapshotDetail
  activation_intent: SnapshotActivationIntent | null
}

type SnapshotsSummaryLike = {
  data?: { snapshots?: Array<{ id: number; name: string }> } | undefined
}

type Updater<T> = T | ((prev: T) => T)

export interface UseSnapshotEditorActivateCurrentMutationArgs {
  activeSnapshot: SnapshotDetail | null | undefined
  snapshotsSummaryQuery: SnapshotsSummaryLike
  setPendingGoLiveSnapshotId: (id: Updater<number | null>) => void
  setPendingGoLiveRequestedAt: (ts: number | null) => void
  setConfirmedGoLiveSnapshotId: (id: number | null) => void
  setFailedGoLiveSnapshotId: (id: number | null) => void
  setGoLiveFailureReason: (reason: string | null) => void
  setGoLiveFailureDetail: (detail: unknown) => void
  setControlPlaneSnapshotCaches: (snapshot: SnapshotDetail) => void
  invalidateControlPlaneSnapshotCaches: (options?: { includeDesired?: boolean }) => void
  setEditorSnapshotOverride: (snapshot: SnapshotDetail | null) => void
  hydrateEditorFromSnapshot: (
    detail: SnapshotDetail,
    options?: HydrateEditorFromSnapshotOptions
  ) => void
  pushToast: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
}

export interface UseSnapshotEditorActivateCurrentMutationResult {
  activateCurrentSnapshotMutation: UseMutationResult<ActivateCurrentSnapshotResult, Error, number>
}

export function useSnapshotEditorActivateCurrentMutation({
  activeSnapshot,
  snapshotsSummaryQuery,
  setPendingGoLiveSnapshotId,
  setPendingGoLiveRequestedAt,
  setConfirmedGoLiveSnapshotId,
  setFailedGoLiveSnapshotId,
  setGoLiveFailureReason,
  setGoLiveFailureDetail,
  setControlPlaneSnapshotCaches,
  invalidateControlPlaneSnapshotCaches,
  setEditorSnapshotOverride,
  hydrateEditorFromSnapshot,
  pushToast,
}: UseSnapshotEditorActivateCurrentMutationArgs): UseSnapshotEditorActivateCurrentMutationResult {
  const queryClient = useQueryClient()

  const activateCurrentSnapshotMutation = useMutation({
    mutationFn: async (snapshotId: number): Promise<ActivateCurrentSnapshotResult> => {
      const activated: SnapshotActivationResponse = await snapshotsApi.activate(snapshotId)
      const activatedSnapshotId = activated.snapshot_id ?? snapshotId
      const snapshotData = activated.snapshot_data
      return {
        snapshot_id: activatedSnapshotId,
        snapshot_data: snapshotData,
        activation_intent: activated.activation_intent ?? null,
      }
    },
    onMutate: (snapshotId) => {
      setPendingGoLiveSnapshotId(snapshotId)
      setPendingGoLiveRequestedAt(Date.now())
      setConfirmedGoLiveSnapshotId(null)
      setFailedGoLiveSnapshotId(null)
      setGoLiveFailureReason(null)
      setGoLiveFailureDetail(null)
    },
    onSuccess: (response) => {
      setPendingGoLiveSnapshotId(null)
      setPendingGoLiveRequestedAt(null)
      setConfirmedGoLiveSnapshotId(response.snapshot_id)
      setFailedGoLiveSnapshotId(null)
      setGoLiveFailureReason(null)
      setGoLiveFailureDetail(null)
      setControlPlaneSnapshotCaches(response.snapshot_data)
      queryClient.setQueryData(
        ['snapshots', 'detail', response.snapshot_id],
        response.snapshot_data,
      )
      void queryClient.invalidateQueries({
        queryKey: ['snapshots', 'runtime', 'live-state', 'local'],
      })
      void queryClient.invalidateQueries({
        queryKey: ['snapshots', 'runtime', 'cluster-live-state'],
      })
      void queryClient.invalidateQueries({
        queryKey: ['snapshots', 'runtime', 'activation-events', 'local'],
      })
      invalidateControlPlaneSnapshotCaches({ includeDesired: true })
      setEditorSnapshotOverride(null)
      hydrateEditorFromSnapshot(response.snapshot_data, {
        toastMessage: buildSnapshotActivationToastMessage(response.snapshot_data),
        toastDurationMs: SNAPSHOT_ACTIVATION_TOAST_DURATION_MS,
        toast: {
          ...buildSnapshotActivationStageToast(response.snapshot_data),
          tone: 'success',
        },
        resetSelectedBlock: true,
        invalidateSnapshots: true,
      })
    },
    onError: (error, snapshotId) => {
      const failureDetail = extractSnapshotActivationFailureDetail(error)
      const failureReason =
        extractSnapshotActivationFailureReason(error, { separator: '\n' }) ?? 'Activation failed.'
      const snapshotName =
        activeSnapshot?.id === snapshotId
          ? activeSnapshot.name
          : snapshotsSummaryQuery.data?.snapshots?.find((s) => s.id === snapshotId)?.name ??
            'Snapshot'
      setPendingGoLiveSnapshotId((current) => (current === snapshotId ? null : current))
      setPendingGoLiveRequestedAt(null)
      setFailedGoLiveSnapshotId(snapshotId)
      setGoLiveFailureReason(failureReason)
      setGoLiveFailureDetail(failureDetail)
      const stageToast = buildSnapshotActivationFailureStageToast(snapshotName, error, {
        snapshotId,
      })
      pushToast(buildSnapshotActivationFailureToastMessage(snapshotName, error), 'warn', {
        durationMs: SNAPSHOT_ACTIVATION_TOAST_DURATION_MS,
        id: stageToast.options.id,
        title: stageToast.title,
        stage: stageToast.options.stage,
      })
    },
  })

  return { activateCurrentSnapshotMutation }
}

// Snapshot editor "create snapshot from editor" mutation (T2472 mutation extraction — slice 12).
//
// Lifts createSnapshotFromEditorMutation off the page. The mutation calls
// snapshotsApi.create with the current draft, immediately activates the
// resulting snapshot via snapshotsApi.activate, and on success drives the
// canonical "go-live" cache fan-out + activation toast pair, mirroring the
// activate-current path. The created snapshot's name flows back into the
// editor's rename input and (optionally) the plugin browser opens.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'

import {
  flowSnapshotDataToSnapshotPayload,
  snapshotsApi,
} from '../../../map2/clients/snapshots'
import type { SnapshotDetail, SnapshotDraftData } from '../../../map2/types'
import {
  SNAPSHOT_ACTIVATION_TOAST_DURATION_MS,
  buildSnapshotActivationFailureStageToast,
  buildSnapshotActivationFailureToastMessage,
  buildSnapshotActivationStageToast,
  buildSnapshotActivationToastMessage,
} from '../../utils/snapshotActivationToast'
import type { NotificationOptions, NotificationTone } from '../../components/Toasts'
import type { HydrateEditorFromSnapshotOptions } from './useSnapshotEditorOpenEditorSnapshotMutation'

export interface CreateSnapshotFromEditorParams {
  snapshotName: string
  sourceDraft: SnapshotDraftData
  openPluginBrowser?: boolean
  focusSnapshotName?: boolean
}

export interface CreateSnapshotFromEditorResult {
  snapshot_id: number
  snapshot_data: SnapshotDetail
}

export interface UseSnapshotEditorCreateFromEditorMutationArgs {
  activeSnapshot: SnapshotDetail | null | undefined
  setConfirmedGoLiveSnapshotId: (id: number | null) => void
  setEditorSnapshotOverride: (snapshot: SnapshotDetail | null) => void
  setControlPlaneSnapshotCaches: (snapshot: SnapshotDetail) => void
  invalidateControlPlaneSnapshotCaches: (options?: { includeDesired?: boolean }) => void
  hydrateEditorFromSnapshot: (
    detail: SnapshotDetail,
    options?: HydrateEditorFromSnapshotOptions
  ) => void
  setRenameSnapshotName: (name: string) => void
  setEditingSnapshotName: (editing: boolean) => void
  setShowPluginBrowser: (open: boolean) => void
  pushToast: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
}

export interface UseSnapshotEditorCreateFromEditorMutationResult {
  createSnapshotFromEditorMutation: UseMutationResult<
    CreateSnapshotFromEditorResult,
    Error,
    CreateSnapshotFromEditorParams
  >
}

export function useSnapshotEditorCreateFromEditorMutation({
  activeSnapshot,
  setConfirmedGoLiveSnapshotId,
  setEditorSnapshotOverride,
  setControlPlaneSnapshotCaches,
  invalidateControlPlaneSnapshotCaches,
  hydrateEditorFromSnapshot,
  setRenameSnapshotName,
  setEditingSnapshotName,
  setShowPluginBrowser,
  pushToast,
}: UseSnapshotEditorCreateFromEditorMutationArgs): UseSnapshotEditorCreateFromEditorMutationResult {
  const queryClient = useQueryClient()

  const createSnapshotFromEditorMutation = useMutation({
    mutationFn: async ({
      snapshotName,
      sourceDraft,
    }: CreateSnapshotFromEditorParams): Promise<CreateSnapshotFromEditorResult> => {
      const created = await snapshotsApi.create({
        name: snapshotName,
        description: 'Created from Snapshot Editor',
        tempo_bpm: activeSnapshot?.tempo_bpm ?? 120,
        ...flowSnapshotDataToSnapshotPayload(sourceDraft),
      })
      const activated = await snapshotsApi.activate(created.snapshot_id)
      const activatedSnapshotId = activated.snapshot_id ?? created.snapshot_id
      const snapshotData = activated.snapshot_data
      return {
        snapshot_id: activatedSnapshotId,
        snapshot_data: snapshotData,
      }
    },
    onSuccess: (response, variables) => {
      setConfirmedGoLiveSnapshotId(response.snapshot_id)
      setEditorSnapshotOverride(null)
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
      invalidateControlPlaneSnapshotCaches({ includeDesired: true })
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
      setRenameSnapshotName(response.snapshot_data.name)
      setEditingSnapshotName(Boolean(variables.focusSnapshotName))
      if (variables.openPluginBrowser) {
        setShowPluginBrowser(true)
      }
    },
    onError: (error, variables) => {
      const stageToast = buildSnapshotActivationFailureStageToast(variables.snapshotName, error)
      pushToast(
        buildSnapshotActivationFailureToastMessage(variables.snapshotName, error),
        'warn',
        {
          durationMs: SNAPSHOT_ACTIVATION_TOAST_DURATION_MS,
          id: stageToast.options.id,
          title: stageToast.title,
          stage: stageToast.options.stage,
        },
      )
    },
  })

  return { createSnapshotFromEditorMutation }
}

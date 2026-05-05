// Snapshot editor chain-edit mutations (T2472 mutation extraction — slice 7).
//
// Lifts the reorder + bypass mutations off the page. Both share the
// snapshot-vs-cluster routing pattern (snapshotsApi when active snapshot
// exists, chainsApi otherwise), the same syncSnapshotMutationResult sync
// hook on success, the same `['chains']` invalidation, and the optional
// undo/redo recording shape.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'

import { chainsApi } from '../../../map2/api'
import { snapshotsApi } from '../../../map2/clients/snapshots'
import type {
  PluginOrderRef,
  SnapshotDetail,
  SnapshotDraftData,
} from '../../../map2/types'
import type { NotificationOptions, NotificationTone } from '../../components/Toasts'

export interface ReorderMutationParams {
  chainId: number
  pluginOrder: PluginOrderRef[]
  undoRedoDraft?: SnapshotDraftData
  undoRedoDescription?: string
}

export interface BypassMutationParams {
  chainId: number
  pluginUri: string
  bypass: boolean
  pluginPosition?: number
  undoRedoDraft?: SnapshotDraftData
  undoRedoDescription?: string
}

type ReorderResult =
  | SnapshotDetail
  | { status: string; chain_id: number; plugins: PluginOrderRef[] }

type BypassResult =
  | SnapshotDetail
  | { status: string; chain_id: number; plugin: string; bypass: boolean }

export interface UseSnapshotEditorChainEditMutationsArgs {
  activeSnapshot: SnapshotDetail | null | undefined
  requireSnapshotPluginOrderIds: (
    chainId: number,
    pluginOrder: PluginOrderRef[]
  ) => { snapshotChainId: number; snapshotPluginIds: number[] }
  requireSnapshotPluginId: (
    chainId: number,
    pluginUri: string,
    pluginPosition?: number
  ) => { snapshotChainId: number; snapshotPluginId: number }
  syncSnapshotMutationResult: (snapshot: SnapshotDetail) => void
  recordSnapshotUndoRedoStep: (draft: SnapshotDraftData, description: string) => void
  markSnapshotsDirty: () => void
  setReorderPreview: (next: null) => void
  pushToast: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
}

export interface UseSnapshotEditorChainEditMutationsResult {
  reorderMutation: UseMutationResult<ReorderResult, Error, ReorderMutationParams>
  bypassMutation: UseMutationResult<BypassResult, Error, BypassMutationParams>
}

export function useSnapshotEditorChainEditMutations({
  activeSnapshot,
  requireSnapshotPluginOrderIds,
  requireSnapshotPluginId,
  syncSnapshotMutationResult,
  recordSnapshotUndoRedoStep,
  markSnapshotsDirty,
  setReorderPreview,
  pushToast,
}: UseSnapshotEditorChainEditMutationsArgs): UseSnapshotEditorChainEditMutationsResult {
  const queryClient = useQueryClient()

  const reorderMutation = useMutation({
    mutationFn: ({ chainId, pluginOrder }: ReorderMutationParams): Promise<ReorderResult> => {
      if (activeSnapshot?.id != null) {
        const identity = requireSnapshotPluginOrderIds(chainId, pluginOrder)
        return snapshotsApi.reorderPlugins(
          activeSnapshot.id,
          identity.snapshotChainId,
          identity.snapshotPluginIds
        ) as Promise<ReorderResult>
      }
      return chainsApi.reorderPlugins(chainId, pluginOrder) as Promise<ReorderResult>
    },
    onSuccess: (data, variables) => {
      if (activeSnapshot?.id != null) {
        syncSnapshotMutationResult(data as SnapshotDetail)
      } else {
        queryClient.invalidateQueries({ queryKey: ['chains'] })
      }
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      if (variables.undoRedoDraft) {
        recordSnapshotUndoRedoStep(
          variables.undoRedoDraft,
          variables.undoRedoDescription ?? 'Reorder blocks'
        )
        return
      }
      markSnapshotsDirty()
    },
    onError: (error) => pushToast(`Failed to reorder: ${error}`, 'error'),
    onSettled: () => {
      setReorderPreview(null)
    },
  })

  const bypassMutation = useMutation({
    mutationFn: ({
      chainId,
      pluginUri,
      bypass,
      pluginPosition,
    }: BypassMutationParams): Promise<BypassResult> => {
      if (activeSnapshot?.id != null) {
        const identity = requireSnapshotPluginId(chainId, pluginUri, pluginPosition)
        return snapshotsApi.setPluginBypass(
          activeSnapshot.id,
          identity.snapshotChainId,
          identity.snapshotPluginId,
          bypass
        ) as Promise<BypassResult>
      }
      return chainsApi.togglePluginBypass(
        chainId,
        pluginUri,
        bypass,
        pluginPosition
      ) as Promise<BypassResult>
    },
    onSuccess: (data, variables) => {
      if (activeSnapshot?.id != null) {
        syncSnapshotMutationResult(data as SnapshotDetail)
      } else {
        queryClient.invalidateQueries({ queryKey: ['chains'] })
      }
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      if (variables.undoRedoDraft) {
        recordSnapshotUndoRedoStep(
          variables.undoRedoDraft,
          variables.undoRedoDescription ??
            (variables.bypass ? 'Bypass block' : 'Enable block')
        )
        return
      }
      markSnapshotsDirty()
    },
    onError: (error) => pushToast(`Failed to toggle bypass: ${error}`, 'error'),
  })

  return { reorderMutation, bypassMutation }
}

// Snapshot editor "delete plugin" mutation (T2472 mutation extraction — slice 15).
//
// Lifts deleteMutation off the page. Removes a plugin from a chain via
// either the snapshot-aware path (snapshotsApi.removePlugin) when an
// active snapshot is loaded, or the chains path (chainsApi.removePlugin)
// otherwise. Performs an optimistic chain-cache update and clears the
// plugin selection if the removed plugin was selected; on error rolls
// back both the cache and the selection.

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { chainsApi } from '../../../map2/api'
import { snapshotsApi } from '../../../map2/clients/snapshots'
import type { Chain, ChainsResponse, SnapshotDetail, SnapshotDraftData } from '../../../map2/types'
import type { NotificationOptions, NotificationTone } from '../../components/Toasts'

export type DeletePluginMutationResult = SnapshotDetail | { status: string; chain_id: number }

export interface DeletePluginMutationParams {
  chainId: number
  pluginUri: string
  pluginPosition?: number
  undoRedoDraft?: SnapshotDraftData
  undoRedoDescription?: string
}

export interface DeletePluginMutationContext {
  previousChains?: ChainsResponse
  previousSelectedPluginUri: string | null
  previousSelectedPluginPosition: number | null
}

export interface UseSnapshotEditorDeletePluginMutationArgs {
  activeSnapshot: SnapshotDetail | null | undefined
  selectedPluginUri: string | null
  selectedPluginPosition: number | null
  requireSnapshotPluginId: (
    chainId: number,
    pluginUri: string,
    pluginPosition?: number
  ) => { snapshotChainId: number; snapshotPluginId: number }
  updateChainPluginsCache: (
    chainId: number,
    updater: (plugins: Chain['plugins']) => Chain['plugins']
  ) => void
  setSelectedPluginSelection: (uri: string | null, position?: number | null) => void
  syncSnapshotMutationResult: (snapshot: SnapshotDetail) => void
  recordSnapshotUndoRedoStep: (nextDraft: SnapshotDraftData, description: string) => void
  markSnapshotsDirty: () => void
  pushToast: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
}

export interface UseSnapshotEditorDeletePluginMutationResult {
  deleteMutation: UseMutationResult<
    DeletePluginMutationResult,
    Error,
    DeletePluginMutationParams,
    DeletePluginMutationContext
  >
}

export function useSnapshotEditorDeletePluginMutation({
  activeSnapshot,
  selectedPluginUri,
  selectedPluginPosition,
  requireSnapshotPluginId,
  updateChainPluginsCache,
  setSelectedPluginSelection,
  syncSnapshotMutationResult,
  recordSnapshotUndoRedoStep,
  markSnapshotsDirty,
  pushToast,
}: UseSnapshotEditorDeletePluginMutationArgs): UseSnapshotEditorDeletePluginMutationResult {
  const queryClient = useQueryClient()

  const deleteMutation = useMutation<
    DeletePluginMutationResult,
    Error,
    DeletePluginMutationParams,
    DeletePluginMutationContext
  >({
    mutationFn: ({
      chainId,
      pluginUri,
      pluginPosition,
    }: DeletePluginMutationParams): Promise<DeletePluginMutationResult> => {
      if (activeSnapshot?.id != null) {
        const identity = requireSnapshotPluginId(chainId, pluginUri, pluginPosition)
        return snapshotsApi.removePlugin(
          activeSnapshot.id,
          identity.snapshotChainId,
          identity.snapshotPluginId,
        )
      }
      return chainsApi.removePlugin(chainId, pluginUri, pluginPosition)
    },
    onMutate: async (variables): Promise<DeletePluginMutationContext> => {
      await queryClient.cancelQueries({ queryKey: ['chains'] })
      const previousChains = queryClient.getQueryData<ChainsResponse>(['chains'])
      const previousSelectedPluginUri = selectedPluginUri
      const previousSelectedPluginPosition = selectedPluginPosition

      updateChainPluginsCache(variables.chainId, (plugins) => {
        if (typeof variables.pluginPosition !== 'number') {
          return plugins.filter((plugin) => plugin.uri !== variables.pluginUri)
        }
        return plugins.filter(
          (plugin) =>
            !(plugin.uri === variables.pluginUri && plugin.position === variables.pluginPosition),
        )
      })
      if (
        selectedPluginUri === variables.pluginUri &&
        (typeof variables.pluginPosition !== 'number' ||
          selectedPluginPosition === variables.pluginPosition)
      ) {
        setSelectedPluginSelection(null)
      }

      return {
        previousChains,
        previousSelectedPluginUri,
        previousSelectedPluginPosition,
      }
    },
    onSuccess: (data, variables) => {
      if (activeSnapshot?.id != null) {
        syncSnapshotMutationResult(data as SnapshotDetail)
      }
      if (variables.undoRedoDraft) {
        recordSnapshotUndoRedoStep(
          variables.undoRedoDraft,
          variables.undoRedoDescription ?? 'Remove block',
        )
      }
      pushToast('Plugin removed', 'success')
    },
    onError: (error, _variables, context) => {
      if (context?.previousChains) {
        queryClient.setQueryData(['chains'], context.previousChains)
      }
      setSelectedPluginSelection(
        context?.previousSelectedPluginUri ?? null,
        context?.previousSelectedPluginPosition ?? null,
      )
      pushToast(`Failed to remove: ${error}`, 'error')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      markSnapshotsDirty()
    },
  })

  return { deleteMutation }
}

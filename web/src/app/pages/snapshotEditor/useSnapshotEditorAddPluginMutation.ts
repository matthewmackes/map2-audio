// Snapshot editor "add plugin" mutation (T2472 mutation extraction — slice 16).
//
// Lifts addPluginMutation off the page. Adds a plugin to a chain via
// either the snapshot-aware path (snapshotsApi.addPlugin) when an active
// snapshot is loaded, or the chains path (chainsApi.addPlugin) otherwise.
// Performs an optimistic chain-cache append (with the next position +
// metadata sourced from pluginMeta), closes the plugin browser, clears
// the search query, and rolls back all four pieces of state on error.

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { chainsApi } from '../../../map2/api'
import { snapshotsApi } from '../../../map2/clients/snapshots'
import type {
  Chain,
  ChainsResponse,
  Plugin,
  SnapshotDetail,
  SnapshotDraftData,
} from '../../../map2/types'
import type { NotificationOptions, NotificationTone } from '../../components/Toasts'

export type AddPluginMutationResult =
  | SnapshotDetail
  | {
      status: string
      chain_id: number
      plugin: string
      plugins_count: number
      plugin_position?: number
    }

export interface AddPluginMutationParams {
  chainId: number
  pluginUri: string
  undoRedoDraft?: SnapshotDraftData
  undoRedoDescription?: string
}

export interface AddPluginMutationContext {
  previousChains?: ChainsResponse
  previousSelectedPluginUri: string | null
  previousSelectedPluginPosition: number | null
  previousShowPluginBrowser: boolean
  previousPluginSearchQuery: string
}

export interface UseSnapshotEditorAddPluginMutationArgs {
  activeSnapshot: SnapshotDetail | null | undefined
  selectedPluginUri: string | null
  selectedPluginPosition: number | null
  showPluginBrowser: boolean
  pluginSearchQuery: string
  pluginMeta: Record<string, Plugin>
  requireSnapshotChainId: (chainId: number) => number
  updateChainPluginsCache: (
    chainId: number,
    updater: (plugins: Chain['plugins']) => Chain['plugins']
  ) => void
  setSelectedPluginSelection: (uri: string | null, position?: number | null) => void
  setShowPluginBrowser: (open: boolean) => void
  setPluginSearchQuery: (query: string) => void
  syncSnapshotMutationResult: (snapshot: SnapshotDetail) => void
  recordSnapshotUndoRedoStep: (nextDraft: SnapshotDraftData, description: string) => void
  markSnapshotsDirty: () => void
  pushToast: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
}

export interface UseSnapshotEditorAddPluginMutationResult {
  addPluginMutation: UseMutationResult<
    AddPluginMutationResult,
    Error,
    AddPluginMutationParams,
    AddPluginMutationContext
  >
}

export function useSnapshotEditorAddPluginMutation({
  activeSnapshot,
  selectedPluginUri,
  selectedPluginPosition,
  showPluginBrowser,
  pluginSearchQuery,
  pluginMeta,
  requireSnapshotChainId,
  updateChainPluginsCache,
  setSelectedPluginSelection,
  setShowPluginBrowser,
  setPluginSearchQuery,
  syncSnapshotMutationResult,
  recordSnapshotUndoRedoStep,
  markSnapshotsDirty,
  pushToast,
}: UseSnapshotEditorAddPluginMutationArgs): UseSnapshotEditorAddPluginMutationResult {
  const queryClient = useQueryClient()

  const addPluginMutation = useMutation<
    AddPluginMutationResult,
    Error,
    AddPluginMutationParams,
    AddPluginMutationContext
  >({
    mutationFn: ({ chainId, pluginUri }: AddPluginMutationParams): Promise<AddPluginMutationResult> => {
      if (activeSnapshot?.id != null) {
        const snapshotChainId = requireSnapshotChainId(chainId)
        const meta = pluginMeta[pluginUri]
        return snapshotsApi.addPlugin(activeSnapshot.id, snapshotChainId, {
          plugin_uri: pluginUri,
          plugin_name: meta?.name,
          loader_state: {},
        })
      }
      return chainsApi.addPlugin(chainId, pluginUri)
    },
    onMutate: async (variables): Promise<AddPluginMutationContext> => {
      await queryClient.cancelQueries({ queryKey: ['chains'] })
      const previousChains = queryClient.getQueryData<ChainsResponse>(['chains'])
      const previousSelectedPluginUri = selectedPluginUri
      const previousSelectedPluginPosition = selectedPluginPosition
      const previousShowPluginBrowser = showPluginBrowser
      const previousPluginSearchQuery = pluginSearchQuery
      const meta = pluginMeta[variables.pluginUri]

      updateChainPluginsCache(variables.chainId, (plugins) => {
        const nextPosition =
          plugins.reduce((maxPosition, plugin) => Math.max(maxPosition, plugin.position ?? -1), -1) +
          1

        const nextPlugin: Chain['plugins'][number] = {
          uri: variables.pluginUri,
          name: meta?.name ?? variables.pluginUri,
          position: nextPosition,
          bypassed: false,
          parameters: {},
          in_ports: meta?.in_ports,
          out_ports: meta?.out_ports,
          format: meta?.format,
        }

        return [...plugins, nextPlugin].sort((a, b) => a.position - b.position)
      })
      setShowPluginBrowser(false)
      setPluginSearchQuery('')
      return {
        previousChains,
        previousSelectedPluginUri,
        previousSelectedPluginPosition,
        previousShowPluginBrowser,
        previousPluginSearchQuery,
      }
    },
    onSuccess: (data, variables) => {
      if (activeSnapshot?.id != null) {
        syncSnapshotMutationResult(data as SnapshotDetail)
      }
      if (variables.undoRedoDraft) {
        recordSnapshotUndoRedoStep(
          variables.undoRedoDraft,
          variables.undoRedoDescription ?? 'Add block',
        )
      }
      pushToast('Plugin added', 'success')
    },
    onError: (error, _variables, context) => {
      if (context?.previousChains) {
        queryClient.setQueryData(['chains'], context.previousChains)
      }
      setSelectedPluginSelection(
        context?.previousSelectedPluginUri ?? null,
        context?.previousSelectedPluginPosition ?? null,
      )
      setShowPluginBrowser(context?.previousShowPluginBrowser ?? false)
      setPluginSearchQuery(context?.previousPluginSearchQuery ?? '')
      pushToast(`Failed to add: ${error}`, 'error')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      markSnapshotsDirty()
    },
  })

  return { addPluginMutation }
}

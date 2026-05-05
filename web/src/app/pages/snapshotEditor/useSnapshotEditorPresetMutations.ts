// Snapshot editor preset mutations (T2472 mutation extraction — slice 2).
//
// Lifts the chain-preset save / load / delete mutations out of the
// SnapshotEditorPageContent monolith. All three share the same
// dependency surface (`chainsApi.{savePreset,loadPreset,deletePreset}`,
// `queryClient.invalidateQueries`, three preset-modal store setters,
// and `pushToast`) so co-locating them keeps the hook boundary
// tight.
//
// Cache-key bit-identity is preserved: each mutation invalidates the
// same `['chains', 'presets']` / `['chains']` keys verbatim that the
// inline calls did.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'

import { chainsApi } from '../../../map2/api'
import type { NotificationOptions, NotificationTone } from '../../components/Toasts'
import type { Snapshot } from '../../../map2/types'

export interface SavePresetParams {
  chainId: number
  name: string
}

export interface UseSnapshotEditorPresetMutationsArgs {
  setShowSavePresetModal: (open: boolean) => void
  setSavePresetName: (name: string) => void
  setShowPresetBrowser: (open: boolean) => void
  setPresetPendingDelete: (snapshot: Snapshot | null) => void
  pushToast: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
}

export interface UseSnapshotEditorPresetMutationsResult {
  savePresetMutation: UseMutationResult<unknown, Error, SavePresetParams>
  loadPresetMutation: UseMutationResult<unknown, Error, number>
  deletePresetMutation: UseMutationResult<unknown, Error, number>
}

export function useSnapshotEditorPresetMutations({
  setShowSavePresetModal,
  setSavePresetName,
  setShowPresetBrowser,
  setPresetPendingDelete,
  pushToast,
}: UseSnapshotEditorPresetMutationsArgs): UseSnapshotEditorPresetMutationsResult {
  const queryClient = useQueryClient()

  const savePresetMutation = useMutation({
    mutationFn: ({ chainId, name }: SavePresetParams) => chainsApi.savePreset(chainId, name),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chains', 'presets'] })
      setShowSavePresetModal(false)
      setSavePresetName('')
      pushToast(`Preset "${variables.name}" saved`, 'success')
    },
    onError: (error) => pushToast(`Failed to save: ${error}`, 'error'),
  })

  const loadPresetMutation = useMutation({
    mutationFn: (presetId: number) => chainsApi.loadPreset(presetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      setShowPresetBrowser(false)
      pushToast('Preset loaded', 'success')
    },
    onError: (error) => pushToast(`Failed to load preset: ${error}`, 'error'),
  })

  const deletePresetMutation = useMutation({
    mutationFn: (presetId: number) => chainsApi.deletePreset(presetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chains', 'presets'] })
      setPresetPendingDelete(null)
      pushToast('Preset deleted', 'success')
    },
    onError: (error) => pushToast(`Failed to delete preset: ${error}`, 'error'),
  })

  return { savePresetMutation, loadPresetMutation, deletePresetMutation }
}

// Snapshot editor metadata mutations (T2472 mutation extraction — slice 5).
//
// Lifts the four "active snapshot metadata" mutations off the page:
//   - rename (name)
//   - update MIDI program
//   - update description
//   - update tempo
//
// All four call snapshotsApi.update / snapshotsApi.setProgram, share the
// same syncSnapshotDetailCaches sync hook on success, and toast on
// success/error. Bundling them keeps the boundary tight.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'

import { snapshotsApi } from '../../../map2/clients/snapshots'
import type { SnapshotDetail } from '../../../map2/types'
import type { NotificationOptions, NotificationTone } from '../../components/Toasts'

export interface RenameActiveSnapshotParams {
  snapshotId: number
  name: string
}
export interface UpdateActiveSnapshotProgramParams {
  snapshotId: number
  programNumber: number | null
}
export interface UpdateActiveSnapshotDescriptionParams {
  snapshotId: number
  description: string
}
export interface UpdateActiveSnapshotTempoParams {
  snapshotId: number
  tempoBpm: number
}

interface UpdateProgramResult {
  result: { program_number: number | null }
  snapshot: SnapshotDetail
}
interface SnapshotUpdateResponseLike {
  snapshot: SnapshotDetail
}

export interface UseSnapshotEditorMetadataMutationsArgs {
  syncSnapshotDetailCaches: (
    snapshot: SnapshotDetail,
    options?: { updateAuthorityActiveSnapshot?: boolean }
  ) => void
  setEditingSnapshotName: (editing: boolean) => void
  setRenameSnapshotName: (name: string) => void
  setSnapshotProgramValue: (value: string) => void
  pushToast: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
}

export interface UseSnapshotEditorMetadataMutationsResult {
  renameActiveSnapshotMutation: UseMutationResult<
    SnapshotUpdateResponseLike,
    Error,
    RenameActiveSnapshotParams
  >
  updateActiveSnapshotProgramMutation: UseMutationResult<
    UpdateProgramResult,
    Error,
    UpdateActiveSnapshotProgramParams
  >
  updateActiveSnapshotDescriptionMutation: UseMutationResult<
    SnapshotUpdateResponseLike,
    Error,
    UpdateActiveSnapshotDescriptionParams
  >
  updateActiveSnapshotTempoMutation: UseMutationResult<
    SnapshotUpdateResponseLike,
    Error,
    UpdateActiveSnapshotTempoParams
  >
}

export function useSnapshotEditorMetadataMutations({
  syncSnapshotDetailCaches,
  setEditingSnapshotName,
  setRenameSnapshotName,
  setSnapshotProgramValue,
  pushToast,
}: UseSnapshotEditorMetadataMutationsArgs): UseSnapshotEditorMetadataMutationsResult {
  const queryClient = useQueryClient()

  const renameActiveSnapshotMutation = useMutation({
    mutationFn: async ({ snapshotId, name }: RenameActiveSnapshotParams) =>
      snapshotsApi.update(snapshotId, { name }) as Promise<SnapshotUpdateResponseLike>,
    onSuccess: (response) => {
      syncSnapshotDetailCaches(response.snapshot)
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      void queryClient.invalidateQueries({
        queryKey: ['snapshots', 'runtime', 'live-state', 'local'],
      })
      void queryClient.invalidateQueries({
        queryKey: ['snapshots', 'runtime', 'cluster-live-state'],
      })
      setEditingSnapshotName(false)
      setRenameSnapshotName('')
      pushToast(`Snapshot renamed to "${response.snapshot.name}"`, 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to rename snapshot', 'error')
    },
  })

  const updateActiveSnapshotProgramMutation = useMutation({
    mutationFn: async ({ snapshotId, programNumber }: UpdateActiveSnapshotProgramParams) => {
      const result = await snapshotsApi.setProgram(snapshotId, programNumber)
      const snapshot = await snapshotsApi.get(snapshotId)
      return { result, snapshot } as UpdateProgramResult
    },
    onSuccess: ({ result, snapshot }) => {
      syncSnapshotDetailCaches(snapshot)
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      queryClient.invalidateQueries({
        queryKey: ['snapshots', 'runtime', 'activation-events', 'local'],
      })
      setSnapshotProgramValue(result.program_number == null ? '' : String(result.program_number))
      pushToast('MIDI program updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update MIDI program', 'error')
    },
  })

  const updateActiveSnapshotDescriptionMutation = useMutation({
    mutationFn: async ({ snapshotId, description }: UpdateActiveSnapshotDescriptionParams) =>
      snapshotsApi.update(snapshotId, { description }) as Promise<SnapshotUpdateResponseLike>,
    onSuccess: (response) => {
      syncSnapshotDetailCaches(response.snapshot)
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      pushToast('Snapshot notes updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot notes', 'error')
    },
  })

  const updateActiveSnapshotTempoMutation = useMutation({
    mutationFn: async ({ snapshotId, tempoBpm }: UpdateActiveSnapshotTempoParams) =>
      snapshotsApi.update(snapshotId, { tempo_bpm: tempoBpm }) as Promise<SnapshotUpdateResponseLike>,
    onSuccess: (response) => {
      syncSnapshotDetailCaches(response.snapshot)
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      pushToast('Snapshot tempo updated', 'success')
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update snapshot tempo', 'error')
    },
  })

  return {
    renameActiveSnapshotMutation,
    updateActiveSnapshotProgramMutation,
    updateActiveSnapshotDescriptionMutation,
    updateActiveSnapshotTempoMutation,
  }
}

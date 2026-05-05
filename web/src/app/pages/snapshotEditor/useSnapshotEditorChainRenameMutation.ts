// Snapshot editor chain-rename mutation (T2472 mutation extraction — slice 8).
//
// Lifts the chain `renameMutation` off the page. Same snapshot-vs-cluster
// routing pattern as the chain-edit slice: snapshotsApi.renameChain when an
// active snapshot exists, chainsApi.rename otherwise.

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'

import { chainsApi } from '../../../map2/api'
import { snapshotsApi } from '../../../map2/clients/snapshots'
import type { SnapshotDetail } from '../../../map2/types'
import type { NotificationOptions, NotificationTone } from '../../components/Toasts'

export interface RenameChainMutationParams {
  chainId: number
  name: string
}

type RenameChainResult = SnapshotDetail | { status: string; chain_id: number; name: string }

export interface UseSnapshotEditorChainRenameMutationArgs {
  activeSnapshot: SnapshotDetail | null | undefined
  requireSnapshotChainId: (chainId: number) => number
  syncSnapshotMutationResult: (snapshot: SnapshotDetail) => void
  markSnapshotsDirty: () => void
  setShowRenameChainModal: (open: boolean) => void
  setRenameChainName: (name: string) => void
  pushToast: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
}

export interface UseSnapshotEditorChainRenameMutationResult {
  renameMutation: UseMutationResult<RenameChainResult, Error, RenameChainMutationParams>
}

export function useSnapshotEditorChainRenameMutation({
  activeSnapshot,
  requireSnapshotChainId,
  syncSnapshotMutationResult,
  markSnapshotsDirty,
  setShowRenameChainModal,
  setRenameChainName,
  pushToast,
}: UseSnapshotEditorChainRenameMutationArgs): UseSnapshotEditorChainRenameMutationResult {
  const queryClient = useQueryClient()

  const renameMutation = useMutation({
    mutationFn: ({ chainId, name }: RenameChainMutationParams): Promise<RenameChainResult> =>
      activeSnapshot?.id != null
        ? (snapshotsApi.renameChain(
            activeSnapshot.id,
            requireSnapshotChainId(chainId),
            name
          ) as Promise<RenameChainResult>)
        : (chainsApi.rename(chainId, name) as Promise<RenameChainResult>),
    onSuccess: (data) => {
      if (activeSnapshot?.id != null) {
        syncSnapshotMutationResult(data as SnapshotDetail)
      }
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      markSnapshotsDirty()
      setShowRenameChainModal(false)
      setRenameChainName('')
      pushToast('Chain renamed', 'success')
    },
    onError: (error) => pushToast(`Failed to rename: ${error}`, 'error'),
  })

  return { renameMutation }
}

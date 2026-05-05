// Snapshot editor "update authority live chains" mutation (T2472 mutation extraction — slice 17).
//
// Lifts updateAuthorityLiveChainsMutation off the page. Submits a desired
// audio state via audioStateApi.putDesired with optimistic chains-cache
// + committed-audio-state updates and a snapshot-detail-cache snapshot
// rollback path. On success it commits the response, invalidates chains
// + control-plane caches (with includeDesired), optionally marks dirty,
// and toasts the configurable success message; on error it rolls back
// all three pieces of cache state and toasts the failure.

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import { audioStateApi } from '../../../map2/clients/audioState'
import { restoreAuthorityAwareLiveSnapshot } from '../snapshotLiveState'
import type {
  AuthoritativeAudioStateEnvelope,
  ChainsResponse,
  SnapshotDetail,
} from '../../../map2/types'
import type { buildAuthorityLivePathSelectionUpdate } from '../../utils/audioStateLivePaths'
import type { applyOptimisticJuceGridLiveChainSet } from '../../components/SnapshotEditor/snapshotEditorLiveChains'
import type { NotificationOptions, NotificationTone } from '../../components/Toasts'

export type UpdateAuthorityLiveChainsContext = {
  previousChains?: ChainsResponse
  previousCommittedAudioState?: AuthoritativeAudioStateEnvelope
  previousAuthorityActiveSnapshot?: SnapshotDetail | null
}

export type UpdateAuthorityLiveChainsVariables = {
  nextActiveChainIds: number[]
  nextCommittedState: AuthoritativeAudioStateEnvelope['value']
  request: ReturnType<typeof buildAuthorityLivePathSelectionUpdate>['request']
  pruneChainIds: number[]
  successMessage: string
  successKind: 'success' | 'info'
  errorMessage: string
  markDirty?: boolean
}

export interface UseSnapshotEditorUpdateAuthorityLiveChainsMutationArgs {
  authoritySnapshotId: number | null | undefined
  cancelControlPlaneSnapshotCaches: () => Promise<void>
  invalidateControlPlaneSnapshotCaches: (options?: { includeDesired?: boolean }) => void
  pruneLiveSnapshotCache: (chainIds: readonly number[]) => void
  applyOptimisticJuceGridLiveChainSet: typeof applyOptimisticJuceGridLiveChainSet
  markSnapshotsDirty: () => void
  pushToast: (message: string, tone?: NotificationTone, options?: NotificationOptions) => string
}

export interface UseSnapshotEditorUpdateAuthorityLiveChainsMutationResult {
  updateAuthorityLiveChainsMutation: UseMutationResult<
    AuthoritativeAudioStateEnvelope,
    Error,
    UpdateAuthorityLiveChainsVariables,
    UpdateAuthorityLiveChainsContext
  >
}

export function useSnapshotEditorUpdateAuthorityLiveChainsMutation({
  authoritySnapshotId,
  cancelControlPlaneSnapshotCaches,
  invalidateControlPlaneSnapshotCaches,
  pruneLiveSnapshotCache,
  applyOptimisticJuceGridLiveChainSet,
  markSnapshotsDirty,
  pushToast,
}: UseSnapshotEditorUpdateAuthorityLiveChainsMutationArgs): UseSnapshotEditorUpdateAuthorityLiveChainsMutationResult {
  const queryClient = useQueryClient()

  const updateAuthorityLiveChainsMutation = useMutation<
    AuthoritativeAudioStateEnvelope,
    Error,
    UpdateAuthorityLiveChainsVariables,
    UpdateAuthorityLiveChainsContext
  >({
    mutationFn: (variables) => audioStateApi.putDesired(variables.request),
    onMutate: async (variables): Promise<UpdateAuthorityLiveChainsContext> => {
      await queryClient.cancelQueries({ queryKey: ['chains'] })
      await queryClient.cancelQueries({ queryKey: ['audio-state', 'committed'] })
      await cancelControlPlaneSnapshotCaches()
      const previousChains = queryClient.getQueryData<ChainsResponse>(['chains'])
      const previousCommittedAudioState = queryClient.getQueryData<AuthoritativeAudioStateEnvelope>([
        'audio-state',
        'committed',
      ])
      const previousAuthorityActiveSnapshot =
        authoritySnapshotId != null
          ? queryClient.getQueryData<SnapshotDetail | null>([
              'snapshots',
              'detail',
              'authority-active',
              authoritySnapshotId,
            ])
          : undefined
      queryClient.setQueryData<ChainsResponse>(['chains'], (current) =>
        applyOptimisticJuceGridLiveChainSet(current, variables.nextActiveChainIds),
      )
      if (previousCommittedAudioState) {
        queryClient.setQueryData<AuthoritativeAudioStateEnvelope>(['audio-state', 'committed'], {
          ...previousCommittedAudioState,
          value: variables.nextCommittedState,
        })
      }
      pruneLiveSnapshotCache(variables.pruneChainIds)
      return { previousChains, previousCommittedAudioState, previousAuthorityActiveSnapshot }
    },
    onSuccess: (response, variables) => {
      queryClient.setQueryData(['audio-state', 'committed'], response)
      queryClient.invalidateQueries({ queryKey: ['chains'] })
      invalidateControlPlaneSnapshotCaches({ includeDesired: true })
      if (variables.markDirty) {
        markSnapshotsDirty()
      }
      pushToast(variables.successMessage, variables.successKind)
    },
    onError: (error, variables, context) => {
      if (context?.previousChains) {
        queryClient.setQueryData(['chains'], context.previousChains)
      }
      if (context?.previousCommittedAudioState) {
        queryClient.setQueryData(
          ['audio-state', 'committed'],
          context.previousCommittedAudioState,
        )
      }
      if (
        authoritySnapshotId != null &&
        context?.previousAuthorityActiveSnapshot !== undefined
      ) {
        restoreAuthorityAwareLiveSnapshot(
          queryClient,
          context.previousAuthorityActiveSnapshot,
          authoritySnapshotId,
        )
      }
      const message = error instanceof Error ? error.message : variables.errorMessage
      pushToast(message, 'error')
    },
  })

  return { updateAuthorityLiveChainsMutation }
}
